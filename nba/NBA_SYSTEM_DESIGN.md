# NBA SYSTEM DESIGN — the three pipelines

**Purpose.** Exactly what each pipeline does, in what order, why each step sits where it does, and the
constraints that shaped it. This is the operational spec.

---

> # 📑 **INDEX — `NBA_SYSTEM_DESIGN.md`**
> **~~`148`~~ → `166` sections · ~~`178,053`~~ → `185,565` bytes · ~~`2,429`~~ → `2,526` lines · built `2026-09-23`, census corrected same day (`§F2.14`).**
> ⚠ *The original count came from a heading detector anchored at line start, blind to **blockquoted** headings — **294 across the twelve, `6.0%`**. Re-derive with `^(?:>\s*)*#{1,6}\s`, never `^#`.*
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** *(`§T20.22`: `6` of `16` line-number pointers
> rotted within a day)*. **Search for the quoted `§` label.**
> 🔴 **THE `0z-*` AND `0a.*` BLOCKS RUN BACKWARDS.** *`0z-7` → `0z-5` → `0z-6` → `0z-3` → `0z-4` →
> `0z-2` → `0z`, and `0a` → `0a.1` → `0a.5` → `0a.6` → `0a.4` → `0a.3` → `0a.2`.* **Navigate by this
> index, not by number.**
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🔴🔴 **what the system is FOR, and the acceptance criterion it must meet** | **`§0z`** |
> | 🔴 **the build-order lock — what will NOT be built, and in what order the rest comes** | **`§0z-3`** |
> | **what `P1` / `P2` / `P3` each do** | **`§2`** · **`§3`** · **`§4`** |
> | 🔑 **why the cutoff is `1:15 PM PT`** | **`§1`** |
> | 🔴🔴 **the two-pipeline decision, made in real time** *(COMPASS fact 107's reasoning)* | **`§0z-7`** |
> | ⚠ **what NO pipeline does — `final_hp` is rebuilt by nothing** | **`§4b`** |
> | 🔴🔴 **where a pipeline can do LESS than it claims and still certify green** | **`THE SWALLOWED-FAILURE CENSUS`** *(h1)* |
> | 🔴🔴 **what certifies GREEN while broken — the twelve checks read adversarially** | **`WHAT CERTIFIES GREEN WHILE BROKEN`** *(h1)* — findings 1–4 |
> | 🔴 **the paper-trading strategy, specified end to end** | **`standards_3pick_v1`** *(h1)* |
> | 🔑 **the outcome grader — design vs what the code does** | **`§0a`** · **`§0a.1`** |
> | 🔑🔑 **baseline and enrichment are ONE system** *(the result that invalidates a whole class of work)* | **`§0a.5`** |
> | 🔑 **the two-phase clock, its two leakage traps, and the premise under it** | **`§0a.3`** |
> | 🔑 **market consensus — the owner's weighting directive and the build that FAILED** | **`§0a.2`** |
> | **the calculation chain** · **failure policy** | **`§5`** · **`§6`** |
> | ⚠ **the three explicit NON-GOALS** | **`§0.75`** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🎯 **A · WHAT IT IS FOR, AND WHAT IS AND IS NOT BEING BUILT**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0z`** | 🔴🔴 **THE OWNER'S STATEMENT OF WHAT THE SYSTEM IS FOR — and the ACCEPTANCE CRITERION it must meet** *(read before anything else)* | 🔴🔴 |
> | **`0z-3`** | 🔴🔴 **THE BUILD-ORDER LOCK — what will NOT be built, and in what order the rest comes** *(`T17`)* | 🔴🔴 |
> | **`0.75`** | **The three explicit NON-GOALS — what NBA was told NOT to build** | ⚠ |
> | **`0z-7`** | 🔴 **The two-pipeline decision, made in real time** — COMPASS fact 107's reasoning | 🔴 |
> | **`0z-2`** | 🔴 **Why ENUMERATION beats PREDICTION, measured — and it is the argument AGAINST the decision** | 🔴 |
> | **`0z-5`** | 🔴 **"Enrichment is thin BY DESIGN, not by failure"** — and the corpus's "ten rejected factors" | 🔴 |
>
> ### 🏗 **B · LINEAGE AND THE ORIGINAL PATTERN (`T1` → `T9`)**
> | § | what it covers |
> |---|---|
> | **`0`** | **LINEAGE — the owner's three-run model** *(`T1`)*, refined through `T4`–`T9` |
> | **`0.6`** | **The original wording** |
> | **`0.7`** | **The four-layer ordered full-run pattern** *(`T1`, the blueprint)* |
> | **`0.8`** | **CHAIN INDEPENDENCE — don't build one monolithic run** |
> | **`0.9`** | **Trigger / scheduling reality** — *"build this correctly from day one"* |
> | **`0.95`** | **The cadence as originally locked — three elements never recorded** |
>
> ### ⚙️ **C · THE THREE PIPELINES AS THEY STAND**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`1`** | 🔑 **THE CUTOFF — why `1:15 PM PT`** | 🔑 |
> | **`2`** · **`3`** · **`4`** | **`P1` — WEEKLY STATIC** · **`P2` — OVERNIGHT HEAVY** · **`P3` — AFTERNOON LIGHT** | |
> | **`4b`** | ⚠ **WHAT NO PIPELINE DOES — `final_hp` is rebuilt by NOTHING** | ⚠ |
> | **`5`** | **THE CALCULATION CHAIN** | |
> | **`6`** | **FAILURE POLICY** — *incl.* **`6b`** the pipeline-scrutiny methodology | |
> | **`7`** | **VERIFICATION STATUS** *(`2026-09-20`)* | |
>
> ### 🔴 **D · WHERE IT LIES TO YOU — the two adversarial audits**
> | section *(both are `h1`)* | what it covers | 🚩 |
> |---|---|---|
> | **`THE SWALLOWED-FAILURE CENSUS`** | 🔴 **Where a pipeline can do LESS than it claims and still certify green.** **Class A — `5` scripts where a partial failure is INVISIBLE** · ⚠ and it breaks a discipline this corpus already states · ✅ **Class B — correctly NOT defects, named so they are not re-found** · ✅✅ **the shell half, and it is CLEAN** | 🔴🔴 |
> | **`WHAT CERTIFIES GREEN WHILE BROKEN`** | 🔴 **The twelve checks, read adversarially.** **F1 — five of the twelve have NO DATE PREDICATE AT ALL** · 🔴🔴 **F2 — `> 0` means ONE ROW OUT OF SIXTY THOUSAND** · 🔴 **F3 — what is not checked at all** · ⚠ **F4 — the certifier's own clock is DST-naive, and the pipelines bypass it** | 🔴🔴 |
>
> ### 🔑 **E · THE DESIGN DECISIONS BEHIND THE ENGINE (`0a.*`)**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0a`** | 🔑 **THE OUTCOME GRADER — the design as the owner was given it, and what the code actually does** | 🔑 |
> | **`0a.1`** | 🔑 **The grader's build — what it caught, the storage decision, and a LIVE re-take of every figure** | 🔑 |
> | **`0a.2`** | 🔑 **MARKET CONSENSUS — the owner's WEIGHTING directive, the build that FAILED, and the design that replaced it** | 🔑 |
> | **`0a.3`** | 🔑 **THE TWO-PHASE CLOCK — where it was designed, the TWO LEAKAGE TRAPS, and the PREMISE under it** | 🔑 |
> | **`0a.4`** | 🔑 **The leakage test, the defect rule, and the scenario sizing** *(`T14`'s answers)* | 🔑 |
> | **`0a.5`** | 🔑🔑 **BASELINE AND ENRICHMENT ARE ONE SYSTEM — the measured result that invalidates a whole class of work** | 🔑🔑 |
> | **`0a.6`** | 🔑 **THE THREE-STAGE FUNNEL — where each link sits, and why** | 🔑 |
> | **`0z-4`** | 🔴 **The scenario calibration design, and the `17%`-vs-`90%` tension the corpus leaves UNRESOLVED** | 🔴 |
> | **`0z-6`** | ✅ **The availability model — how "`80%` confident-band accuracy" was actually reached** | ✅ |
>
> ### 📈 **F · THE PAPER-TRADING STRATEGY**
> | section | what it covers | 🚩 |
> |---|---|---|
> | **`standards_3pick_v1`** *(h1)* | 🔴 **Specified end to end**: selection *(`paper_pick_candidates`)* · packing *(`paper_pick_slips`)* · logging *(`log_paper_picks`)* · grading *(`grade_paper_picks`, called by `P2` step 3b)* · 🔴🔴 **the defect it exposes — the twelve-prop map is DUPLICATED** · ⚠ **`NOT RECORDED`: is the 3-leg slip a Power Play or a Flex?** | 🔴 |
>
> ### ⚠ **G · A RETRACTION, KEPT**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0z-8-T18-RETRACTION`** | ⚠⚠⚠ **This sweep OVERCLAIMED, and the retraction is recorded, not edited away** — **read this BEFORE `§0z-8-T18`** | ⚠⚠⚠ |
> | **`0z-8-T18`** | ⚠ **Superseded in part by the retraction above** — the `2:30 PM PT` trace | ⚠ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` is the mandate, `B` the lineage, `C` what runs, `D` how far to
> trust a green build, `E` why the engine is shaped as it is, `F` the strategy, `G` a correction kept
> in place.*** **If you are about to trust a passing certifier, read `D` first.**

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. P1/P2/P3 as built and tested in the live session; lineage from the owner's three-run model in T1. |
| **2026-09-21 → 09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `21` commits that this log never recorded.** *T15–T18 material plus the live audits: **§0a.1 the grader's build** (the alias catch, distinct-leg storage) and its stated intent · **§0a.2 market consensus** — the owner's weighting directive answered; `build_book_curves.py` exists but nothing reads it · **§0a.3 the two-phase clock** (delta scoring, the shapes/minutes split) · **§0a.4 the knowable-at-cutoff leakage test — 0 of thirty** · §0a.5 baseline and enrichment as one system (the A2 held-out result) · **§T16.3 why enumeration beats prediction (~17%/79%)** · §T17.1 the build-order lock (no orchestrator) · §T17.2 enrichment is thin BY DESIGN · **§T18.1 the two-pipeline decision's full reasoning** · §0z-8-T18 the 2:30 PM PT trace. **Corrections in place: the DNP-void design claim corrected from the grader's code · §0a.3 marked SUPERSEDED IN PART by COMPASS fact 107 · §0z-8-T18's trace claim RETRACTED · an unanchored "as of today" anchored · P1's cron time qualified PDT/PST.*** |

---

## 0z-7. 🔴🔴🔴 **THE TWO-PIPELINE DECISION, MADE IN REAL TIME — COMPASS FACT 107's REASONING, AND IT RESOLVES THE TENSION §0z-2 RECORDED** *(T18 pass 0, §T18.1, owner, 2026-09-19; **the largest owner stratum in the corpus — 57 turns, 26,633 chars, mean 467**)*

*§0z-2 records that fact 107 DROPPED the scenario precompute six days after the owner called it
non-negotiable, and flags that **"the measured 83% cost was never put beside it"**. **It was. This is
the argument, and the owner makes it himself across seven turns.***

### 🔴 **THE QUESTION HE ASKS FIRST — and it is a good one**

> ***"The 30 minutes before tip — is that the FIRST game of the day, or before EACH ONE of the games?
> … Miami plays at 4, so it releases a report at 2:30 and its very last 30 minutes before tip, at
> 3:30. Golden State is playing at 7 — **they also release at 2:30 p.m. Pacific**, and their very last
> report is 30 minutes before 7, so 6:30. **Because that DOES affect how we treat data freshness.**"***

🔑🔑 **AND HIS OWN OPERATING PATTERN IS WHAT DECIDES IT**: *"my idea is, after 2:30 we run the last
piece of pipeline… **I'm not going to be able to use the last 30 minutes before tip anyway.** I'm going
to put my slips around **3, 3:30**… **that's probably the only run of the day that matters for my
slips. So data freshness is gonna PENALISE LEGS THAT I'M GONNA USE ANYWAY** — **the data freshness is
more gonna HURT than HELP.**"*

### 🔴🔴🔴 **THEN HE RUNS THE SWEEP'S OWN METHOD ON THE ASSISTANT** *(0 of the twelve, 0 of the thirty)*

> ***"So who created the full NBA universe was YOU. This chat only, and no other AI, was Claude in
> this chat. **So if there is any discrepancy, IT'S YOU DRIFTING.** So you need to look at
> documentation, look at the chat transcripts — I know it's a lot of transcripts to look at — but
> **YOU were the one drifting. So you need to understand WHY you say 2:30 and now you're saying 1
> p.m.**"***

⚠⚠ **THAT IS THIS DOCUMENTATION SWEEP'S PREMISE, STATED BY THE OWNER BEFORE THE SWEEP EXISTED**: *a
discrepancy between what the system does and what the documents say is DRIFT, and the remedy is the
transcript archive.* 🔑 **And the instruction that follows it is the sweep's brief verbatim**: *"go to
the documentation and the compass, **see WHEN was the last time you updated, and then go to the CHAT
HISTORY AND TRANSCRIPT from that same date and time, and update everything from there to now. NO
EXCEPTION, NO EXCUSES, NO SKIPPING.**"*

### ✅✅ **THE ANSWER, AND IT COLLAPSES THREE DECISIONS INTO ONE**

> ***"We are OVERCOMPLICATING it. We need ONE SIMPLE ANSWER. **I do not need the LAST report. I need
> ONE DECENT REPORT** — players, lineups, injury report, referee, all the daily factors. Research and
> understand **what time, Pacific, that information comes**. And then we have our cutoff hour."***
>
> ***"The game-day injury report is the last thing that comes up, and the first report comes **around
> 11 a.m. to 1 p.m. Pacific**. … **We just need TWO pipelines, not three anymore** — the heavy one
> that runs early morning, and one that does the daily factors after 1 p.m., **around 1:30, or
> 1:15**… **And all that was because of the data freshness** … **so that one is DEFERRED. We're not
> gonna use that one.** … **And we do not need the simulations** — there was one simulator that would
> create all the possible situations for when we run the last pipeline to pick the correct outcome.
> **We do not need that anymore. That extra processing, extra data that we do not need anymore.**"***

🔑🔑🔑 **SO FACT 107's THREE CLAUSES — two pipelines · the 1:15 PM cutoff · the scenario simulator
dropped — ARE ONE DECISION WITH ONE REASON.** ***If the complete daily report arrives by 1 p.m., the
window moves to 1:15; if the window is 1:15 and the owner places slips at 3–3:30, there is no later
SELECTION MOMENT; and enumeration without a selection moment has nothing to resolve against.*** ✅
**§0z-2's open question — "does the single-window system assume the likeliest branch or carry the
uncertainty into the probability?" — is answered a third way: IT DOES NEITHER, because at 1:15 the
report is already complete for every team and there is little left to enumerate.**

⚠⚠ **AND THAT ALSO CLOSES OPEN ITEM T17-3.** *The freshness gates were recorded as "probably the
same" — a HEDGE. **They are not a hedge: they are DEFERRED on a stated mechanism** — they would
penalise legs the owner uses anyway, because his only run of the day is the 1:15 one.* 🔑 **A
correctness feature rejected not as wrong but as IRRELEVANT TO THE OPERATOR'S ACTUAL WORKFLOW.**

⚠ **ONE RECONCILIATION THE CORPUS NEEDS**: later in the same session the owner says ***"we still have
THREE pipelines — the WEEKLY STATIC, the heavy overnight one, and the light early-afternoon one."***
🔑 **Fact 107's "two pipelines" counts the DAILY pair; the weekly static run is a third and separate
one. Both statements are his, six turns apart, and they are not in conflict.**

### ✅ **THE THREE PIPELINES AS HE SPECIFIES THEM**

| # | Pipeline | Spec |
|---|---|---|
| **1** | **WEEKLY STATIC** | *"already configured, not running yet… **schedule once a week** because if there is any team change. **Use cron** … maybe **12 every Monday**"* — ✅ **cron may be set NOW** |
| **2** | **HEAVY OVERNIGHT DELTA** | *"mine the game logs every day and also do the classification and baseline calculations… **from 1 a.m.**"* ⚠ *"**it's a DELTA setup, a complement day by day — and CANNOT HAVE GAPS. Has to cover ALL teams, players, all games.**"* 🔴 **DO NOT SET CRON — "it's not going to have data to run until the beginning of the season"** |
| **3** | **LIGHT EARLY-AFTERNOON** | *"the daily mining, the daily factors, final scoring engine, final hit probability, final confidence, final score"* 🔴 **DO NOT SET CRON, same reason** |

🔑🔑 **AND THE VERIFICATION HE SPECIFIES IS A PARITY TEST**: ***"get one day from the PAST that we
already have a baseline calculation AND a final scoring calculation, and run it END TO END and see if
it MATCHES the data that we already have — BECAUSE IT NEEDS TO."*** ⚠ **That is the strongest
statement of the parity standard in the corpus: the new pipeline must REPRODUCE the stored history
exactly, not merely produce plausible numbers.** ⚠ *He also requires a forward simulation on a
scheduled game day, since live data will not exist until the opener.*

---

## 0z-5. 🔴🔴🔴 **"ENRICHMENT IS THIN BY DESIGN, NOT BY FAILURE" — and the corpus's "ten rejected factors" framing is WRONG** *(T17 pass 1, §T17.2)*

⚠⚠ **THIS CORRECTS A FRAMING THIS SWEEP HAS PUBLISHED.** *`NBA_FINAL_SCORING_CALIBRATION.md`
§0a-T15-SUPERSESSION-2 and §0a-T16 record a long sequence of factor rejections as a single coherent
result. **The author reached the same framing — "ten tested candidates, and the pattern is
consistent" — and then retracted it after re-reading the governing documents.***

> ***"**a3, a4, d2 and k1 were NEVER ENRICHMENT CANDIDATES.** §7's stage table already assigns all four
> to **BASELINE**, and §4 notes a3 is 'measured; in baseline v30'. **So my gate wasn't testing new
> factors — it was testing DUPLICATES of things the baseline already computes. The zero gains weren't
> a discovery; THE DOCUMENT PREDICTED THEM.** My 'ten rejected factors' framing was wrong: **several
> were never candidates.**"***

*The gate that produced them, for the record — **1,248,826 graded legs**: a3 return ramp **+0.00001**,
a4 rest/b2b/3-in-4 **−0.00002**, k1 coach change **−0.00002**, all three combined **−0.00003**.* 🔑
**Correct measurements of a question the stage table had already answered.**

🔑🔑🔑 **AND THE POSITIVE STATEMENT IS THE ONE TO CARRY**:

> ***"**ENRICHMENT IS THIN BY DESIGN, NOT BY FAILURE.** §7 lists what actually belongs in phase 2: the
> 2:30 day-of report, late scratches, projected lineups (rejected), the 2:45 line movement, the
> book-vs-pick'em gap, and the board itself. **That's the complete set.** The 0.004–0.014 movement I
> kept treating as a SHORTFALL **is the architecture working as specified — the heavy lifting belongs
> in the baseline.**"***

⚠⚠ **So the corpus's recurring "the baseline beats every enrichment factor" finding is TRUE but
MIS-FRAMED as a surprise.** ✅ **It is the design. The owner states it independently — *"all the
heavyweight needs to be on the baseline"* (§0z §5) — and §7 of the parity document enumerates phase 2's
complete contents.** 🔑 **The genuine discovery was never "factors fail"; it was that SEVERAL FACTORS
WERE TESTED AT THE WRONG STAGE, and the measurement cost was paid to re-derive what the stage table
already said.**

⚠ **The sweep's own failure alongside it**: *it read a long rejection sequence as a single finding
without checking whether the rejected items were ever candidates. **Rule 7's shape — grep the
distinctive term before asserting — applied to a FRAMING rather than to a fact.***

---

## 0z-6. ✅ **THE AVAILABILITY MODEL — how "80% confident-band accuracy" was actually reached, and the three bugs on the way** *(T17 pass 1, §T17.2; COMPASS fact 97's evidence)*

### 🔴 THREE BUGS, EACH CAUGHT BY A GUARD OR BY THE OWNER, NONE BY INSPECTION

| # | Bug | How it surfaced |
|---|---|---|
| **1** | **A BACKWARD-LOOKING TEAM ACCUMULATOR** — the scenario builder resolved a player's team from games he had already appeared in, so *"for the vast majority of questionable players the lookup is against a team they haven't appeared for yet"* | 🔑 **0 games with uncertainty for 2024-25 and 7 for 2025-26, against 363,689 and 827,562 injury rows** — *"a scenario layer that **silently finds no uncertainty** would have looked fine in production while doing nothing at all"* ✅ **Fixed by reading the team from the injury-report row itself, which carries `matchup` ("hou@okc") and the team's full name — *"I never used either"*** |
| **2** | **A UNIFORM TRAINING LABEL** — *"`divide by zero encountered in log` at `np.log(base / (1 − base))`, and accuracy 0.0000 across the board. **`base` is 0 or 1**, which means the played-flag lookup is failing"* | ✅ **A guard was added that ABORTS rather than reports**: *"abort: train base rate 0.0000 on 8 rows is not a plausible questionable play rate"* — 🔑 *"a guard like that would have **failed loudly** here instead of producing zeros"* |
| **3** | 🔴🔴 **FILTERING ON THE FINAL STATUS** — *"I filtered on `last_status == 'questionable'` — the status at the FINAL snapshot. But **by the final report, nearly every questionable has been resolved**. **Only 7 players stayed questionable to the end.** **The final status is the ANSWER, not the feature.**"* | ✅ **Fixed by reading the status at the 2:30 PM DECISION CUTOFF** — the last snapshot before the window *(COMPASS fact 98a)* |

### ✅ THE FOUR LAYERS, AND EACH ONE EARNS ITS PLACE

| Layer | accuracy | AUC |
|---|---|---|
| flat 0.552 | 0.5144 | **0.4781** *(worse than a coin flip)* |
| L1 hierarchical prior | 0.5582 | 0.5790 |
| L2 gradient boosting | 0.5825 | 0.6217 |
| **L3 stacked** | **0.5870** | **0.6299** |

⚠ **AND THE AUC GAP AGAINST THE PUBLISHED LITERATURE IS EXPLAINED RATHER THAN EXCUSED**: *"our AUC of
0.63 versus the published NBA injury-risk study's 0.83 is **expected: they predict INJURY OCCURRENCE
from workload over weeks; we predict **A COACH'S SAME-DAY INTENT, WHICH IS DELIBERATELY CONCEALED.**"*
🔑 **And the model's honesty is verified by its own uncertain band: *"the uncertain band's play rate is
0.529 — if the model were broken, that band would be SKEWED. It sits at the TRUE BASE RATE, meaning
the model correctly identifies WHICH CASES IT CANNOT CALL."***

### 🔑🔑 THE LEAGUE'S OWN RULES WERE THE FEATURE THAT GOT IT TO 80%

*Three rule-based discriminators, straight from the official source:* **(1) report deadlines differ by
tip time — the game-day report is due 11am–1pm local, but 8–10am for tips at 5pm or earlier**, *"so for
early games our 2:30 window is PAST the final deadline"*; **(2) road games have a different rule** —
*"a team may only list a player as out or doubtful for a road game if the player did not travel or is
not present in the visiting market"*, so **a road questionable means something different from a home
one**; **(3) the active list locks 60 minutes before tip — the true resolution moment.**

| | before | **after** |
|---|---|---|
| confident band size | 3.0% | **4.2%** |
| **confident band accuracy** | 65.0% | ✅ **80.0%** |
| leaning-play accuracy | 69.6% | 72.3% |
| genuinely uncertain | 80.5% | 79.0% |

### 🔑 THE ROLE SPLIT — **and the operational rule it implies**

| role | n | play rate | accuracy | confident share | **confident accuracy** |
|---|---|---|---|---|---|
| **fringe (<15 min)** | 254 | 0.343 | **0.658** | 11.8% | ✅ **86.7%** |
| rotation (15–25) | 429 | 0.539 | 0.580 | 2.8% | 66.7% |
| starter (25+) | 639 | 0.567 | 0.571 | 2.0% | 76.9% |

🔑🔑 ***"TRUST THE MODEL FOR FRINGE PLAYERS, AND ROUTE STARTERS AND ROTATION PLAYERS TO THE SCENARIO
LAYER — which is exactly the split the architecture already supports. NOT ONE THRESHOLD FOR
EVERYONE."*** ⚠ *"That's the psychological-warfare effect the research described: **teams hang the tag
on MEANINGFUL players deliberately**, and the resolving decision genuinely isn't made until warmups."*

### ⚠⚠ **MARKET MOVEMENT WAS REJECTED TWICE — and the second rejection is the honest one**

*The hypothesis was strong and the research backed it: **"one star player ruled out can swing a spread
by 4–5 points within minutes"** and **"beat reporters at shootaround, warmups, travel updates… move
markets before anything is official"** — **"the market knows before the report does."*** 🔴 **First
rejection (confident band 4.2% → 3.3%, accuracy 80.0% → 77.3%) was attributed to the author's own
join**: *"any miss defaults to **0.0**, which the model reads as **'no movement' rather than
'unknown'** — that dilutes a genuinely strong signal into noise."* ✅ **Re-tested with a proper NaN join
and a `has_move` indicator — and it STILL failed** *(0.6794 / 0.6191 / 73.5% against 0.6780 / 0.6216 /
79.6%)*. 🔑 **THE STRUCTURAL REASON**: *"**our window snapshot is 14:45 PT**, while the injury-driven
line moves happen **at shootaround and in the final 60 minutes before tip — AFTER our capture. We're
measuring a window that closes before the information arrives.** A **tip-60 snapshot** would test it
fairly; our current data cannot."* ⚠ **So the factor is not refuted — it is unmeasurable with the data
the system currently captures, and the capture change that would test it is named.**

### 🔑🔑 **AND A SELECTOR BUG WORTH MORE THAN THE MODEL — a yield metric that a human would reject**

*The automatic selector initially ranked **"per-tier + player history" top at 0.0469 purely because it
flagged 6.7% of cases**, despite **worse accuracy (70.5% vs 79.6%) and materially worse AUC (0.589 vs
0.622)**.* 🔴 ***"A WIDER BAND OF WEAKER CALLS ISN'T BETTER — A BAD CALL COSTS A LEG."*** ✅ **Fixed with
an ACCURACY FLOOR ≥75% applied BEFORE maximising share, with AUC as tie-break** — *"so the automatic
selector can't pick a configuration a human would reject on sight."* **Four configurations were then
rejected by the floor**, and the selected one is **pooled + player history: 79.6% confident accuracy on
4.1% of cases.** 🔑 **A selection metric is a model too, and this one was wrong in a way no amount of
model quality would have fixed.**

---

## 0z-3. 🔴🔴🔴 **THE BUILD-ORDER LOCK — what will NOT be built, and in what order the rest comes** *(T17 pass 0, §T17.1, owner, 2026-09-19; **0 of the twelve, 0 of the thirty**, positive controls passed)*

> ***"**Leg correlation is a SLIP-BUILDING level — we will not work on that until we have the final HP
> and score sharpened to perfection.** **Freshness gates** probably the same. **ORCHESTRATOR WILL NOT
> EXIST — just the daily functions, and THE CLAUDE WORKER WILL EXECUTE ONE BY ONE VIA PROMPT.** …We
> need to finish **all the enrichment factor pipeline, final HP, score and confidence REPLICATED TO
> THE FULL DATABASE** — only then do we move to the points you said. So **any open essential factors
> for this phase are still ENRICHMENT RELATED.**"***

🔑🔑 **THIS IS A GATE, AND IT DISPOSES OF THREE ITEMS THE CORPUS CARRIES AS OPEN WORK**:

| Item | Status under this turn |
|---|---|
| **leg correlation** | ⏸ **DEFERRED by decision** — slip-building level, blocked on final HP + score |
| **freshness gates** | ⏸ **"probably the same"** — ⚠ *hedged, not decided; the sweep records the hedge as a hedge* |
| 🔴 **the orchestrator** | ❌ **WILL NOT EXIST** — *"just the daily functions, and the Claude worker will execute one by one via prompt"* |

⚠ **THE ORCHESTRATOR DECISION IS NOT NEW — IT IS A DATED RE-ISSUE, AND THE KILL IS LOGGED.** *The
corpus already records it four independent ways* *(`"no orchestrator, confirmed as the explicit
design"` · `"there is deliberately no orchestrator"` · `"NBA has no orchestrator by design"` ·
`"explicitly NO orchestrator — each run triggered manually, worker by worker"`, **22 of the thirty and
18 of the twelve**)*, **including a note that the owner had already restated it in his own words.** 🔑
**What T17 adds is the MECHANISM in his words — *"the Claude worker will execute one by one via
prompt"* — which names WHO runs the daily functions, and that is the piece the four existing records
leave implicit.**

🔴🔴 **THE GATING CONDITION IS THE ONE TO CARRY**: ***"final HP, score and confidence REPLICATED TO THE
FULL DATABASE."*** ⚠⚠ **`[LIVE-AUDIT]` 2026-09-22: `nba_score.final_hp` holds 2024-25 at 162 dates and
2025-26 at ONE date** *(open item **T16-7**)* — **so by this turn's own condition the gate is not yet
met**, and the items behind it stay deferred. 🔑 **BUT READ IT WITH THE OWNER'S SCOPE WORD**: later in
the same session he asks *"so every single leg for the past two seasons, **BOARD SCOPED**, have a
final hit probability and a confidence percentage, correct?"* — ⚠⚠ **"BOARD SCOPED" is a much smaller
population than the full ladder, and whether `final_hp`'s expected size is the board-scoped set or the
full ladder is NOT RECORDED. That distinction decides whether T16-7 is a gap or a scoping choice, and
it is pass 1's highest-value question.**

⚠ **And a fourth disposal, on the market-movement factor**: *"market movement is going to be **too
weak with so close market mining data points** — so if the test doesn't show much evidence of
improvement, **better leave it out**."* 🔑 **The owner pre-authorising a rejection on a stated
mechanism, which is the inverse of his T16 anti-rejection order and shows the two are not a blanket
rule but a judgment about whether the FEATURE was fairly built.**

---

## 0z-4. 🔴🔴 **THE SCENARIO CALIBRATION DESIGN, AND THE 17%-vs-90% TENSION THE CORPUS LEAVES UNRESOLVED** *(T17 pass 0, §T17.1; **0 of the twelve, 0 of the thirty**)*

> ***"The scenario precompute should be run on the FULL SEASON — **for CALIBRATION only, because we
> already know the outcome**. It should be run on **EVERY SINGLE MATCH** for calibration, and then it
> should be **DELETED**. We just keep the real outcome… because it's gonna keep too much data that's
> unneeded — **that should be MILLIONS OF ROWS that's just gonna eat up space.** We need to run on the
> two seasons, get the proper logic that's gonna run daily, and then **we just keep the real outcome,
> NOT ALL THE UNIVERSE.**"***

✅ **COMPASS fact 95(c) is this design executed**: `nba/build_scenario_calibration.py`, **1,651 games
with uncertainty enumerated, only the realised branch stored** (`nba_score.scenario_realised`), *"the
unrealised universe is never written."* 🔑 **The owner specified both halves — enumerate everything to
CALIBRATE, store only the outcome to SURVIVE — and the storage argument is his, not an
implementation detail.**

### ⚠⚠ AND THE TENSION THE SWEEP MUST RECORD RATHER THAN RESOLVE

| | |
|---|---|
| **COMPASS fact 96** *(measured)* | *"With three Questionable rotation players the most-likely branch is the realised one **only ~17%** of the time… **79% of Questionables are genuine coin flips at 2:30 BY DESIGN**… **NO MODEL REACHES 90% ON INFORMATION THAT DOES NOT EXIST YET — SELECTION DOES, once it arrives."*** |
| 🔴 **The owner, on being shown it** | ***"That's where calibration comes. We need to calibrate to the point where there's an extremely high number of assertivity. **So seventeen percent is definitely TERRIBLE. WE NEED A NINETIES. Very high.**"*** |
| *and* | *"probably you're gonna need to **split, have different tiers and layers, granulate different player profiles** to have more assertiveness… make it more complex, more steps if needed, **because we need extremely high assertiveness.**"* |

🔑🔑 **THE TWO ARE NOT THE SAME QUANTITY, AND NOTHING IN THE CORPUS SAYS SO.** *Fact 96's ~17% is **the
probability that the most-likely BRANCH is the realised one** — a property of the branch distribution
under genuine coin flips. The owner's "nineties" is **assertiveness of the final number**. **A system
can be 90%+ assertive about a leg's probability while being 17% likely to guess the roster — indeed
that is the enumeration architecture's entire claim.*** ⚠ **NOT RECORDED anywhere that these are
different quantities**, and the owner's reply reads as a rejection of the measurement rather than a
demand on a different axis. 🔴 **OWNER DECISION**: *confirm which quantity the "nineties" target
applies to.* ⚠⚠ **It matters now because COMPASS fact 107 (2026-09-19, the SAME DAY) DROPS the
scenario precompute** *(§0z-2 below)* — **so the mechanism that answers the 17% is being removed in
the same session the owner demands 90%.**

⚠ **Note also the granularity instruction — *"split, have different tiers and layers"* — lands two days
after COMPASS fact 97b measured PER-TIER SPLITTING as HARMFUL** *(AUC 0.62 → 0.59 on N1;
`NBA_BASELINE_CALIBRATION.md` §0z-T16-C)*. **Both dates on file; the tension is real and is the second
instance of it.**

---

## 0z-2. 🔴🔴🔴 **WHY ENUMERATION BEATS PREDICTION, MEASURED — and it is the argument AGAINST the decision that later dropped the scenario simulator** *(T16 pass 2, §T16.3, from COMPASS fact 96 — migration item, **0 of the twelve**)*

> 🔑🔑 ***"With three Questionable rotation players, the MOST-LIKELY BRANCH is the realised one only
> ~17% OF THE TIME — so assuming the likeliest outcome scores THE WRONG ROSTER IN 83% of those
> games."***

⚠⚠ **AND THE REASON IS STRUCTURAL, NOT A MODELLING SHORTFALL.** The availability model measures that
**79% of Questionables are genuine coin flips at 2:30 PM (play rate 0.522) — *BY DESIGN***:

| | |
|---|---|
| **teams use the tag to CONCEAL INTENT** | the label is strategic, not informational |
| **the Active List does not lock until 60 minutes before tip** | the fact does not exist at the window |
| **clubs file as late as 30 minutes out** | later than any pipeline stage |

> 🔑🔑🔑 ***"NO MODEL REACHES 90% ON INFORMATION THAT DOES NOT EXIST YET — SELECTION DOES, ONCE IT
> ARRIVES."***

✅ **That is the cleanest statement in the corpus of WHY the architecture enumerates branches rather
than predicting one**, and it is the justification for N1's unusual selection criterion — *confident-band
yield rather than log-loss, "because the model's job is ACTIONABLE CALLS and everything else routes to
the scenario layer"* *(`NBA_BASELINE_CALIBRATION.md` §0z-T16-C)*. 🔑 **The two facts are one design:
N1 answers what it can answer confidently; the scenario layer absorbs the 79% it cannot.**

### ⚠⚠ AND THIS IS WHERE THE CORPUS CONTRADICTS ITSELF ACROSS SIX DAYS — **both dates on file (rule 5)**

| Date | The position |
|---|---|
| **2026-09-13** | **The owner calls PRE-CALCULATED SCENARIOS for the last-minute injury report *NON-NEGOTIABLE*** *(§0z §3 below)* |
| **2026-09-14/15** | ✅ **BUILT** — COMPASS fact 95(c): `nba/build_scenario_calibration.py`, **1,651 games with uncertainty enumerated**, **only the realised branch stored** (`nba_score.scenario_realised`) — *"the unrealised universe is never written"* |
| **2026-09-14/15** | 🔑 **JUSTIFIED BY MEASUREMENT** — fact 96, the ~17% / 79% figures above |
| **2026-09-19** 🔴 | **COMPASS fact 107 (owner decision): TWO pipelines, cutoff 1:15 PM PT, and *"the scenario precompute is DROPPED — with a single window there is nothing to select with."*** |

🔑🔑 **THE REVERSAL IS COHERENT, AND THE COHERENCE IS THE POINT**: **enumeration only pays if a LATER
stage selects the realised branch.** *Collapse three stages into two and the selection moment
disappears, so the branches have nothing to resolve against — **fact 107's own reasoning**.* ⚠⚠ **BUT
THE MEASURED COST OF DROPPING IT IS THE 83% FIGURE, AND NO DOCUMENT PUTS THE TWO TOGETHER**: *with a
single window the system must either **assume the likeliest branch — wrong in 83% of three-Questionable
games — or carry the uncertainty into the probability itself.* 🔴 **NOT RECORDED which it does.**

🔑 **The `scenario_realised` design is worth keeping in view regardless**: **enumerate the universe,
store ONLY the realised branch.** *That is what makes enumeration affordable — the cost is compute at
phase 2, not storage — and it is why the 1,651-game build exists as evidence rather than as a
hypothesis.*

---

## 0z. 🔴🔴🔴 **THE OWNER'S STATEMENT OF WHAT THE SYSTEM IS FOR — AND THE ACCEPTANCE CRITERION IT MUST MEET** *(T16 pass 0, §T16.1, from the 2026-09-13 transcript; **nine of ten probes returned 0 of the twelve AND 0 of the thirty**, positive controls passed)*

⚠⚠ **T16's owner stratum is the design-authority stratum of this corpus** — **32 turns, 11,487 chars,
mean 359**, including the two longest owner turns the sweep has read *(3,220 and 2,095 chars)*. **It
is where the system's acceptance criterion, its non-negotiables and its layer split are stated in the
owner's own words, and almost none of it was on file.**

### 🔑🔑 1 · THE ACCEPTANCE CRITERION — **"decimals of difference"** *(0 of twelve, 0 of thirty)*

> ***"What I need from this system: with baseline and the final hit probability after enrichment, they
> need to be PRECISE. They need to be as SHARP AS POSSIBLE TO REALITY — **leg per leg, band per band,
> day by day, player by player, prop line per prop line, variation per variation, direction by
> direction.** … I need that the system has a formula that I'm gonna run every day, and that every day
> that hit probability percentage given to any specific leg, any specific day, any specific team, any
> specific prop line, variation or direction is gonna be extremely ASSERTIVE. … When I say extremely,
> **I want DECIMALS OF DIFFERENCE, or as close to that as possible.**"***

⚠ **The scope is explicit and it is the finest granularity stated anywhere in the corpus**: *leg ·
band · day · player · prop line · variation · direction* — **seven axes, all at once.** ✅ **And the
validation population is named**: *"any day that I get this full pipeline — baseline, enrichment,
everything together — and I run it on **any day of the past two seasons**, that needs to be extremely
sharp for any leg."* ⚠ **With one exclusion the owner states himself**: *"of course there are
situations that's gonna get out of the probability — the player is off, or an injury in the middle of
the game. **But besides the ABNORMALITIES, the system needs to be extremely sharp.**"*

### 🔑🔑🔑 2 · THE DISPOSAL RULE — **the owner ACCEPTS factor rejections, provided the final HP is sharp** *(0 of twelve, 0 of thirty)*

> ***"So if you say that's a fail, that's not needed, or it's being DOUBLE USED, or whatever — as soon
> as that final hit probability percentage is extremely [sharp] … then I'M FINE. I'm fine. That's what
> you need to understand."***

⚠⚠ **THIS IS THE DECISIVE CONTEXT FOR THE ENRICHMENT RETRACTION** *(`NBA_FINAL_SCORING_CALIBRATION.md`
§0a-T15-SUPERSESSION-2: the certified baseline beats every enrichment factor)*. 🔑 **The owner's
criterion is the OUTPUT's sharpness, not the number of factors that ship — so "the baseline already
carries it" is a PASS under his own standard, not a failure.** ⚠ *Recorded because the corpus records
the rejections and not the standard that makes them acceptable, which leaves a reader to infer that
six of seven candidates failing is a problem. **By this turn, it is not.***

⚠ **And he is explicit about what he does and does not want to be told**: *"you're explaining me a lot
of betas and alphas and shit that I'm not gonna understand. **You are researching. You are looking at
the articles, the studies, the systems out there. YOU are the one who needs to understand that** —
understand what meets the final level of assertiveness."*

### 🔴🔴 3 · THE THREE NON-NEGOTIABLE FACTORS, IN THE OWNER'S OWN WORDS *(the origin of COMPASS fact 95)*

> ***"There are factors that need to be PROPERLY TREATED. Whatever the fuck it is — in baseline, in
> enrichment, I don't care, but it needs to be properly treated.***
> ***· **BLOWOUT PREVENTION IS NON-NEGOTIABLE** — "blowouts are gonna happen, and when they happen
> everything gets screwed. Everything that was historically accurate in a blowout situation is not
> gonna be that way."***
> ***· **PRE-CALCULATED SCENARIOS FOR THE LAST-MINUTE INJURY REPORT AND LINEUPS** — "we need to have
> the precalculated scenarios for the last-minute injury report and lineups, pick up the correct one.
> That's NON-NEGOTIABLE."***
> ***· **TEAM MATCHUP IS NON-NEGOTIABLE** — "a team that plays a bad team, a weak attack, a weak
> defense, or a strong defense, a strong attack — those kinds of things are non-negotiable."***
> ***Everything else is bells and whistles… if it works great, if it helps great, if it does not, we
> deal with the best we can do with it."***

🔑🔑 **THE NON-NEGOTIABLE / BELLS-AND-WHISTLES SPLIT IS A PRIORITISATION RULE THE CORPUS DID NOT
CARRY** — *`non-negotiable` appears 13 times in the thirty and 6 in the twelve, but **the owner's own
three-item list with the "everything else" clause is new here***. ⚠ **AND NOTE WHAT IT MEANS FOR THE
SCENARIO SIMULATOR**: **the owner calls pre-calculated scenarios NON-NEGOTIABLE on 2026-09-13**, and
**COMPASS fact 107 records the scenario precompute as DROPPED by owner decision on 2026-09-19.**
**Both dates recorded (rule 5); the later one governs, and the reversal is the owner's own.**

⚠ *He also states the data position that underwrites the demand:* *"we have two seasons of full back
data, and a third season with more data that can help… **it's unbelievable that we cannot get [it]
with the data we have**."*

### 🔴🔴 4 · THE LAYER SPLIT — **THREE processing times, stated twice** *(0 of twelve, 0 of thirty in this form)*

> ***"You have to remember that we have THREE PROCESSING TIMES. We have the HEAVY one that we're gonna
> run OVERNIGHT. We have the PRE-FINAL one that's gonna run somewhat in the morning. And then we have
> the FINAL one that's just gonna get the real outcome out of the simulations and do a board."***
>
> *and, restated with clocks:* ***"the ones that's gonna carry the strong processing that's gonna take
> a while, that's gonna work OVERNIGHT. Then the SECOND phase, which is gonna run AFTER 1 PM, and the
> LAST phase that's gonna run AFTER 2:30 PM. **The second and the third need to be as LIGHT as
> possible.**"***

⚠⚠ **SUPERSEDED, AND BOTH DATES ARE ON FILE (rule 5)**: **COMPASS fact 107 (owner decision
2026-09-19) — *"TWO pipelines, cutoff 1:15 PM PT, and the scenario simulator is DROPPED"*, which fact
107 itself says supersedes the three-phase design in facts 41 and 68.** 🔑 **What T16 adds is the
clearest statement of the three-phase version and its clocks — and the LINEAGE OF THE 2:30 WINDOW:
*2:30 PM PT was the THIRD phase's start, and the third phase is the one that was dropped.***

🔴🔴 **AND THAT LEAVES A MISMATCH NO DOCUMENT PUTS SIDE BY SIDE** *(0 of twelve, 0 of thirty)*:
**COMPASS fact 73 records N1's probabilities as measured *"at the 2:30 PM PT cutoff"*** — the
`0.552` / `0.312` / doubtful-means-out values the engine reads — **while fact 107 puts the pipeline's
cutoff at 1:15 PM PT.** ✅ **Both clocks are individually well documented** *(`2:30 PM PT`: 35 of the
thirty, 13 of the twelve · `1:15 PM PT`: 42 and 32)* — **they have simply never been compared.** ⚠
**NOT RECORDED: whether probabilities fitted on a 2:30 as-of transfer to a 1:15 one.** *The sweep
notes only that fact 68's amended text says the report rule is 11am–1pm LOCAL, so Pacific clubs file
last at 1:00 PM PT — which makes 1:15 a plausible post-filing cutoff and the gap plausibly small.
**Plausibly small is not measured.***

### 🔑🔑 5 · **"BASELINE AND ENRICHMENT CANNOT BE TWO DIFFERENT THINGS"** *(0 of twelve, 0 of thirty)*

> ***"The baseline and enrichment cannot be two different things. They need to AGREE, and they need to
> work together and COMPLEMENT each other. **ALL THE HEAVYWEIGHT NEEDS TO BE ON THE BASELINE**, but
> they need to TALK and have the proper final product."***

🔑 **This is the owner stating, on 2026-09-13, the architecture that the enrichment reality check
would confirm empirically the same day** — *"all the heavyweight on the baseline"* is exactly what
`anchor 0.7150` beating every factor measures. ⚠ **And it is the owner's answer to the
double-counting problem before the measurement existed**: *"be sure that those factors are not
already in the baseline. **And if it is — if it's being used properly.**"*

### 🔴 6 · THE ORDER THAT REOPENED THE REJECTED FACTORS — *the origin of COMPASS fact 85* *(0 of twelve, 0 of thirty)*

> 🔴 ***"So IMPROVE IT! Why do we have a CRUDE defender feature? MAKE A DECENT ONE! **I never asked for
> crude** — same for all other pieces of this system! I always asked for RICH, DEEP, COMPLETE,
> RELIABLE!"***
>
> *and, generalising it across every prior rejection:* ***"For the previous items that failed,
> shouldn't you have done the same? Something more complex, and that does the job? **Was it not the
> same issue? BE SURE BEFORE MOVING ON.**"***
>
> *and again:* ***"I still think those rejected factors you are not handling properly. You need more
> complex, more granular, more comprehensive application and use of it."***

✅ **COMPASS fact 85 — *"THE M1/B4 REJECTIONS WERE WRONG, corrected 2026-09-13"* — and COMPASS rule
90.1 — *"a null is only as strong as the feature that produced it"* — are the RESULT of these turns.**
🔑 **The corpus carries the conclusion and not the instruction that produced it**, which matters
because *the instruction is general*: **it applies to every rejection, not only M1's.**

### ⚠ 7 · TWO STANDING TEST DIRECTIVES, SIBLINGS OF T15'S SAMPLE-FIRST RULE *(both 0 of twelve, 0 of thirty)*

| | |
|---|---|
| **TEST ALL PROP LINES, EVERY TIME** | ***"You need to test ALL prop lines EVERY TIME. Every time that you do something that affects all of them, you need to test all of them."*** *(restated: "be sure you did all the prop lines, all the thirty-or-so prop lines")* |
| **PARTIAL CALIBRATION IS NOT ACCEPTABLE** | ***"I CAN'T HAVE SOME OF THEM CALIBRATED AND SOME NOT. So do your work and finish."*** |

⚠⚠ **THE SECOND SITS IN TENSION WITH T15'S CERTIFIED / PENALIZED / EXCLUDED POLICY**
*(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §6, 2026-09-12/13)*, **which exists precisely to let a
prop be partly trusted.** 🔑 **The two are reconcilable — the policy's own premise is that penalties
are DERIVED from measurement, so every prop IS calibrated and some carry a measured discount — but
the corpus records neither turn, so nothing reconciles them.** **Recorded as a tension to resolve, not
as a contradiction: the owner's turn is about a prop having NO verdict, which is the state the
all-props audit closed** *(27 / 3 / **0 unverified**)*.

⚠ *Sampling discipline is re-stated here too, matching T15's SAMPLE-FIRST rule:* *"all samples,
different times of the season, different players, different prop lines **before running the whole
thing** … you need to do a large amount of samples before replicating it."*

### ⚠ 8 · THE RESEARCH STANDARD, RE-ISSUED *(recorded as a re-issue — the standard itself is on file, 9 of the thirty and 9 of the twelve; **kill logged**)*

*"Ground this decision in multiple sourcing research, **no guessing, no assumptions**."* · *"Don't take
Gemini as absolute truth. Be sure to research other independent sources, reliable, **multiple** of
them."* 🔑 **Dated instance recorded because T15's decisive oreb fix came FROM Gemini** *(the archetype
correction)* — **so the standard and the dependency are in the same week.**

### ⚠ 9 · THE REALIGNMENT ORDER, AND WHAT IT SAYS ABOUT THE COMPASS

> ***"First, what I need you to do is REALIGN YOURSELF. Read the WHOLE compass file and get everything
> back together, because you start to forgetting things and you cannot forget anything. So I need you
> to completely see — **no skipping, no summarizing, no compacting** — the whole compass file. … I
> think you're OVERCOMPLICATING things, or you're OVERSIMPLIFYING things."***

🔑 **The COMPASS is the owner's designated realignment instrument**, which is the standing reason this
sweep reads it and never writes to it — ⚠ **and it is the document from which fact 69 was silently
deleted the day before** *(`NBA_OPEN_ITEMS.md` §T15.3a)*. **A realignment instrument with a silent hole
in it is a sharper problem than a numbering gap.**

### ⚠ 10 · THE OPERATING RECORD — *recorded as fact, without interpretation*

*The transcript's last stretch is the owner polling a long-running job:* **five identical turns —
*"check status, progress and sample to see if job is being properly done"*** — around *"how long for
it to finish? … everything has to be IN QUEUE, so it runs automatically"*, *"you did not give me a
time estimate… assertive and short answer"*, *"why is it going so slow? you said 2 hours, it has been
the double of it already"*, and ***"your lazy work is pissing me off, you are on opus medium, I am
paying $250 a month; your behavior is unacceptable."*** ⚠ **Recorded because it is part of the record
and because it dates a cost and a service expectation** *(`opus`: **0 of the thirty**)*; **the sweep
draws no conclusion from it.**

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

## 0a.5 🔑🔑🔑 **BASELINE AND ENRICHMENT ARE ONE SYSTEM — the measured result that invalidates a whole class of factor tests**
*Recorded 2026-09-22 (T14 pass 2, §T14.3). **Source: `NBA_DAILY_PARITY_AND_BACKFILL.md` §9, an owner
directive dated 2026-09-13 — one of the EIGHTEEN, read in full for the first time by this sweep.**
Probed against the twelve, pinned 2026-09-22T09:03:53Z; every hit opened.*

> **THE OWNER'S DIRECTIVE**: *"**The baseline and the enrichment cannot be two different things.**
> They must agree, complement each other, and produce one final product. ***All the heavy lifting
> belongs in the baseline; the enrichment layer exists ONLY to carry what the baseline could not have
> known.***"*

### 🔴🔴 THE MEASUREMENT THAT FORCED IT — **held out on 6,996 real PrizePicks legs** *(`0.7299` / `1.0123` / `0.2652`: **0 of the TWELVE**)*
| | log-loss | Brier |
|---|---|---|
| **certified baseline ALONE** | **0.7299** | **0.2652** |
| 🔴 **baseline × A2** *(absence redistribution)* | **1.0123** | **0.3317** |
| baseline × defender | 0.7309 | 0.2656 |

🔑🔑 ***A2 measured WELL IN ISOLATION*** *(minutes MAE **4.641** with outs vs **6.186** ignoring them)*
***and made the system DRAMATICALLY WORSE when applied on top.*** **The cause is exact**: ***"the
baseline's `proj_min` ALREADY APPLIES THE INJURY REPORT"*** — *the 2026-03-15 replay went from 173
roster players to 161 with `BT_INJURY` on — **"multiplying by A2's `min_mult` REAPPLIES the same
reallocation a second time."***

### 🔑🔑🔑 AND IT IS THE THIRD INSTANCE OF ONE ERROR — **a named class with three data points**
| # | the patch | what it duplicated | result |
|---|---|---|---|
| **1** | **A2 absence redistribution** applied over the certified mean | the baseline's `proj_min`, which already applies the report | **log-loss 0.7299 → 1.0123** |
| **2** | a **hand-built blowout shrink** | the recipe's **`P(blowout \| spread)` mixture** *(`P_BLOWOUT_BINS` at 0/2/4/6/8/10/12/15, `BLOWOUT_MARGIN = 20`, `COMPETITIVE_MARGIN = 15`)* | **worse** |
| **3** | a **funnel rebuilt from ROLLING MEANS**, bypassing the anchor | the recipe's `proj_min` | **0.7951 vs 0.7299** — *"beaten by the very anchor it bypassed"* |

⚠⚠ ***"USE THE SYSTEM'S BEST COMPONENT; DO NOT REBUILD A WORSE ONE BESIDE IT."*** 🔑 **The blowout
constants are already in six of the twelve — what was NOT on file is that a patch on top of them was
TESTED AND LOST.** *(`double count` is in nine of the twelve as a concept; **the three measured
instances are not**.)*

### 🔴🔴🔴 **WHY THE HISTORICAL TESTS MISLED — and this invalidates a whole class of factor test**
> ***"In a REPLAY both layers read the SAME DAY'S REPORT, so the delta is EMPTY and A2 is PURE
> DUPLICATION.*** To measure enrichment honestly, **the baseline must be rebuilt on the DAY-BEFORE
> report and the factor applied against the DAY-OF report** — the production configuration.
> ***Any factor test using ONE report for BOTH layers measures DOUBLE-COUNTING, not value.***"*

🔑🔑 ***This is a test-design defect, not a modelling one, and it is silent***: **the factor does not
error, it just scores badly — or, worse, scores well for the wrong reason.** ⚠⚠ **Every held-out
factor result in this corpus should state which report each layer read.** **NOT RECORDED for any of
them.**

### ✅ THE RULE, AS STATED
```
baseline   (phase 1, overnight, day-BEFORE report)  = everything knowable then, done properly
enrichment (phase 2/3, from the day-of report)      = ONLY THE DELTA vs what the baseline assumed
```
*"A star already ruled out overnight is **priced into `proj_min`**; a scratch appearing at the window
is not. Enrichment applies A2 **only to players whose availability CHANGED after the baseline's
cutoff**, and only to their team and opponent. **Everything else carries the baseline's value forward
untouched.**"* *(`only the delta`: **0 of the TWELVE**.)*

### 🔑 THREE CONSEQUENCES FOR FACTOR WORK — **the second is a schema requirement**
1. **A factor may only touch a component the baseline does NOT contain, or be expressed as a DELTA
   against what the baseline assumed.**
2. 🔑🔑 ***"`proj_min` and `rate36` must be EMITTED by the recipe so enrichment adjusts the right
   COMPONENT rather than multiplying the product"*** — ***"multiplying a mean by a minutes multiplier
   is NOT the same operation as adjusting minutes and re-deriving the mean."*** ⚠ **`proj_min` and
   `rate36` appear in ONE of the twelve, as column names; the EMISSION REQUIREMENT is absent.**
3. **The defender factor is the clean case**: *"the baseline carries **TEAM-level** opponent defence,
   not **the specific defender**, so a player-level term is genuinely additive."* ✅ **It measured
   NEUTRAL on the anchor (0.7309 vs 0.7299)** — 🔑 ***"which is what 'no double count, small effect'
   looks like."*** **A stated signature for distinguishing a real small factor from a duplicate.**

## 0a.6 🔑🔑 **THE THREE-STAGE FUNNEL — where each link sits, and why**
*Same source, §8, dated 2026-09-13.* ⚠ **The stage COUNT is superseded by COMPASS fact 107's two
pipelines** *(§0a.3's banner)*; ***the link-by-link placement and its reasoning are not.***

**The funnel**: `minutes → team possessions → usage share → attempts → shot mix → efficiency →
points → P(over line)`

| link | input it needs | knowable | **stage** |
|---|---|---|---|
| `proj_min` base *(role tiers, blowout mixture, coach gate)* | prior-night box scores + morning spread | overnight | **1 — heavy** |
| **defender ratings** *(two-way ridge, 5 channels, weekly refit)* | prior games | overnight | **1 — heavy** |
| rate cells / dispersion / Platt *(the certified recipe)* | history as-of | overnight | **1 — heavy** |
| factor coefficients *(B2/B3/BF, usage allocation, A2 weights)* | history as-of | overnight | **1 — heavy** |
| team possessions *(pace)* | morning market total | ~overnight | **1**, refreshed if the line moved |
| **availability scenarios (joint per game)** | **the 1 PM ET report (~10 AM PT)** | mid-morning | **2 — scenarios** |
| minutes + usage allocation PER SCENARIO | who is out in that branch | mid-morning | **2 — scenarios** |
| 🔑 **expected defender** *(exposure-weighted over AVAILABLE opponents)* | the branch's opponent roster | mid-morning | **2 — scenarios** |
| shot mix + efficiency adjustments | expected defender for that branch | mid-morning | **2 — scenarios** |
| full ladder `P(stat > line)` per scenario | all of the above | mid-morning | **2 — scenarios** |
| select the realised branch | the day-of report | window | **3 — final** |
| market adjuster + rank + slip build | the window board and lines | window | **3 — final** |

### 🔑🔑 WHY EXPECTED DEFENDER IS STAGE 2, NOT STAGE 1 — *and the distinction generalises*
> *"It is **NOT a property of the opponent TEAM**; it is **exposure-weighted over the opponent
> players who will ACTUALLY BE AVAILABLE**. A different absence branch changes which defenders a
> player is exposed to, so it has to be recomputed per scenario. ***The RATINGS are stage 1 (they
> only need prior games); the JOIN is stage 2.***"*

🔑 ***"The ratings are stage 1; the join is stage 2" is a general test for placing any factor***, and
`expected defender` / `exposure-weighted` are **0 of the TWELVE**.

### ⚠ WHAT STAGE 3 MUST NOT DO
> *"**No refitting, no re-deriving, no scanning history.** It **selects** the precomputed branch,
> applies the market adjuster, joins the board and ranks. **Minutes at most. Everything expensive has
> already happened.**"*

## 0a.4 🔑🔑 **THE LEAKAGE TEST, THE DEFECT RULE, AND THE SCENARIO SIZING — T14's answers to the questions §0a.3 left open**
*Recorded 2026-09-22 (T14 pass 1, §T14.2). **Transcript `2026-09-13-20-53-23`, the prose stratum.**
⚠ **Much of T14's substance was written by T14 itself into `NBA_COMPASS.md`,
`NBA_PROJECT_LOG.md` and the new `NBA_DAILY_PARITY_AND_BACKFILL.md` — the EIGHTEEN. What follows is
the part that belongs in the TWELVE and was not here.** Probes pinned 2026-09-22T08:53:42Z.*

### 🔑🔑 THE LEAKAGE TEST, STATED AS A RULE — **`knowable at the cutoff` is 0 of the TWELVE AND 0 of the THIRTY**
**The first framing was *"observed-and-archived versus live-only"* — and the owner's push produced a
correction that replaces it:**
> *"**On referees I was WRONG.** Assignments are **published the MORNING of the game**, so they are
> known at our window. The crew that worked a game is therefore **a FAITHFUL RECONSTRUCTION of what
> would have been known** — using it for a historical day is **SIMULATION, not leakage**.
> ***The test isn't "was it ARCHIVED" but "WAS IT KNOWABLE AT THE CUTOFF."*** **Referees pass that
> test. Starters don't**: confirmed lineups drop around **tip−30, AFTER our window**, so for A5 we
> must derive a projection rather than use who actually started."*

🔑 ***This is strictly better than §0a.3's version of the same trap***, **which reasoned from where
the data came from.** ⚠⚠ **The archived/live distinction gets the referee case WRONG in both
directions: officials are never archived and are perfectly admissible; starters are archived and are
not.**

### 🔑🔑 THE DEFECT RULE — **an audit standard, not a preference**
> ***"Any factor whose source PUBLISHES BEFORE the window but is still computed in phase 2 is A BUG,
> not a design choice. That's the audit standard for the enrichment build."***

🔑 **It makes the phase assignment CHECKABLE**: *every factor has a publish time, and a factor sitting
in the late phase with an early publish time is a defect by definition.*
📌 **And it forced a concrete re-tag**: *"the registry still tags **referees, rest, schedule, coach
and matchup** as ENRICHMENT — per the stage rule they compute in the BASELINE phase, so the registry
needs re-tagging"* — **done later in the same session.**

### ✅ THE PER-FACTOR TIMING TABLE — **phase 2 is reduced to exactly FOUR things**
| phase | what it holds |
|---|---|
| **PHASE 1** *(early, unbounded time)* | **referee crew** *(morning)* · rest / travel / schedule · standings · coach profile · defender quality · weekly tables · 🔑 **the ENTIRE day-before injury picture** — statuses, opponent availability, and **teammate redistribution from the PREVIOUS day's report** |
| **PHASE 2** *(window → first tip)* | **exactly four**: ① pull the board · ② apply the day-of report and projected-lineup delta · ③ read the market · ④ **rescore ONLY the legs those deltas touch** |

⚠ **The cutoff times here are T13's and are SUPERSEDED — see §0a.3's banner** *(COMPASS fact 107:
overnight + 1:15 PM PT, no third phase)*. ***The SHAPE transfers; the clock does not.***

### 🔑🔑 THE ARRIVAL-ORDER TABLE — **what actually gates the start time**, and it is in 0 of the twelve
*Latest first, Pacific:*
| input | latest arrival |
|---|---|
| 🔑 **the league's GAME-DAY 1 PM ET injury report** | **~10:00 AM PT** — ***"the last discrete input before the window"***, published before the 5:30 PM ET final |
| morning board *(PrizePicks / Underdog)* | ~8–10 AM, from the 2-hour cron |
| projected lineups | ~8–10 AM, updated through the day — *"a consequence of the injury picture, not independent"* |
| morning market lines | overnight, continuous |
| **referee assignments** | **~6–7 AM** *(9–10 AM ET)* — *"earlier than you might expect"* |
| standings / leverage | ~11 PM the previous night |
| prior-night box scores, matchups, game logs | **~1–2 AM** *(with occasional stat corrections later)* |
| day-before injury report | already in hand |

🔑 ***So the heavy compute can begin as early as ~3 AM PT, and the only thing that must wait is the
SCENARIO ENUMERATION, which is the light part.*** ⚠ **And the 10 AM report is what makes it cheap**:
*"many 'questionable' names resolve there, so the scenario count at 10:30 is SMALLER than it would be
at 3 AM."*

### 🔑🔑 THE SCENARIO PRECOMPUTE, SIZED FROM THE SYSTEM'S OWN DATA — **answering the owner's "is that feasible?"**
**The unit is THE GAME, not the player** — *"a scenario is the **joint availability set of BOTH
teams**, so when Wembanyama is out it recomputes **his whole roster** (minutes, roles, starters)
**and the opponent's** (blocks-against, defender quality, scheme)."* ✅ ***Which is exactly the
combinatorial objection §T14.1e records the owner raising, answered by choosing the right unit.***

| quantity | measured |
|---|---|
| uncertain players per team on the day-before report | **typically 0–3** |
| scenarios per team | **≤ 8** |
| **joint scenarios per GAME** | **≤ 64 worst case, usually 8–16** |
| board legs/day, PrizePicks with the ladder | **avg 4,503 · max 8,700 · 107 players** |
| board legs/day across five apps | **~10–15k normal, ~20k a big Saturday** — ⚠ **but only ~110–130 DISTINCT PLAYERS** |
| **full matrix per day** | singles at ±10 **22,400 rows** · + combos and fantasy **~36,000** · **× both sides ≈ 72,000 leg-probabilities** |
| scenario rows | **~30–60k per game ≈ 0.5–1M per day ≈ 50–100 MB/day**, **kept only until selection, then all but the chosen one deleted → ~7 MB/day, ~1.2 GB/season** |

🔑🔑 **AND WHY IT IS CHEAP, which is the load-bearing argument**: ***"the expensive part of the
baseline is FITTING — tier cutpoints, empirical cells, Platt — from three seasons of history. That
happens ONCE, overnight. SCORING a scenario is rescaling minutes × rate through cells that already
exist, then a CDF per rung: vectorized, and linear in rows. A million rows is seconds to a minute of
pandas, not hours."*** ⚠ **So the 3-hour baseline run is almost entirely the fit, and the per-day
work is not.**
📌 **Timing as estimated**: **overnight fit 3–4 h sequential, ~1–1.5 h on six parallel runners ·
scenario precompute 10–30 min at ~1M rows · selection 1–3 min.** ⚠ **Stated as an estimate with its
own caveat**: *"the honest range is wider than 15–30 minutes **until we measure it**, because the
scenario count per game is the unknown."*
✅ **And the goblin/demon LESS expansion does not threaten it**: *"it doesn't touch stages 1–2 at all,
because **the matrix already holds BOTH SIDES of every rung** — it only grows the board join, and
that's a lookup. Even a 40k-leg board is seconds."*

### 🔑 THE ONE CASE THE SCENARIOS DO NOT COVER
> *"**a SURPRISE** — a player ruled out at the window **who wasn't on the day-before report at all**,
> a true late scratch. That's the **delta-rule fallback**: recompute only the affected team… From
> our absence data those are **a small minority of days**."*
⚠ **The measurement that would pin both numbers — *"how many uncertain players per team on a typical
report, and how often the late report introduces a name that wasn't there"* — was proposed and is
NOT RECORDED as run.**

## 0a.3 🔑🔑 **THE TWO-PHASE CLOCK — where it was designed, the TWO LEAKAGE TRAPS, and the PREMISE UNDER IT THAT WAS LATER FOUND WRONG**

> 🔴🔴🔴 **AND THE CLOCK IS IMPLEMENTED AN HOUR LATE FOR EVERY DAY OF DAYLIGHT SAVING TIME — `T20-12`, severity 6 of 7.** *Added here T20 pass 78 (§T20.83), 2026-09-22: **this document discusses the clock in ten places and never mentioned the defect**, and a person working on P2/P3 timing reads this page.* ▶ **`nba/build_availability_delta.py:39`** — `PT = timezone(timedelta(hours=-8))`, so `p3_cut` computes `13:15 −08:00` = **`21:15 UTC` year-round**, while **the real 1:15 PM PT during PDT is `20:15 UTC`**. *`p2_build` is shifted identically, and **there is no env override** — `DELTA_ASOF` supplies the date; the hours are computed inside the script.* ⚠ **THE BIGGER HALF IS GOOD NEWS AND IS WHY THIS IS SEVERITY 6, NOT 7: the SLATE DATE and the RUN GUARD are DST-CORRECT** — P2 `:60` / P3 `:67` use `TZ=America/Los_Angeles date +%F`, and P3's guard uses `TZ=America/Los_Angeles date +%H%M`. ***The problem is one constant in one Python file.*** 🔴 **LIVE FROM PRESEASON `2026-10-03` THROUGH `2026-10-31`** *(DST ends `2026-11-01`)* — **twelve of those nights are also T20-13's red-certifier window.** ▶ **Full item: `T20-12` in `NBA_OPEN_ITEMS.md` (§T20.50); re-derived and HELD at §T20.74 — zero DST-aware Python in the NBA scripts.** ⚠ *Documented, not fixed (rule 1).*
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

> ### 📐 §F6.22 — **THE NUMERIC TARGET THAT REQUIREMENT WAS TURNED INTO, AND THE MEASUREMENT NOBODY RAN**
>
> *Added `2026-09-23`. Source: **LIVE** `nba_config.classification_config.pipeline_architecture_decision`.
> **The requirement, the complaint behind it and the delta answer are all above and in two other
> documents. The TARGET is in `0` of the twelve, and so is the step that was supposed to precede the
> build.***
>
> | | `VERBATIM` |
> |---|---|
> | 🎯 **the target** | *"full `2:45 PM` window pipeline **under `10-15 min` end to end** (owner needs time to place slips)"* |
> | 🔴 **the step before building** | *"**Before building the NBA engine, PROFILE the MLB pipeline stage by stage to find where its `~30 min` goes**; the same bottleneck will likely dominate NBA."* |
> | ⚠ **and a retracted rationale, recorded by its author** | *"MLB also runs on Postgres (not D1) — **my earlier speed rationale was wrong**."* |
>
> 🔑 ***The complaint is documented, the architectural answer is documented, the number the answer
> has to hit is not.*** **`10-15 min` is a testable acceptance criterion; "faster than MLB" is not.**
> 📌 *`RULE 55`'s shape once more — the conclusion without the figure under it.*
>
> 🔴 **AND THE PROFILING WAS A PREREQUISITE, NOT A SUGGESTION.** *"Before building the NBA engine" —
> the reasoning is that MLB and NBA run the same stack on the same Postgres, so **whatever consumes
> MLB's `~30` minutes is likely to consume NBA's too, and it has never been located.*** ⚠
> **`NOT RECORDED` anywhere reachable from this session: whether that profiling was ever run.**
> ✅ *Checked, and the check needs stating precisely because a naive grep is misleading:
> **`ALPHADOG_SYSTEM_MAP.md:487` does claim "all `9` full-run orchestration chains, stage-by-stage"**
> — **but that is a STRUCTURAL chain mapping, not a timing one.** A scan of that document for
> durations, elapsed times or per-stage figures returns **none**. ⇒ ***MLB's chains are mapped; MLB's
> `~30` minutes are not attributed to any stage in any document, config row or transcript this
> session can reach.****
> ⇒ **The `10-15 min` target is therefore held against an engine whose dominant cost is unmeasured,
> and the retracted "D1 is faster" line is the record of one wrong guess about it already.**
>
> ⚠ **`RULE 54`.** *`WINDOW`: the twelve, plus a repo search for an MLB timing report. **This pass
> did not run the profiling and does not propose it** — MLB is out of scope for this sweep, and the
> point recorded here is that the NBA target depends on a number from a system this sweep does not
> document.*
>
> ✅ **`RULE 58` RE-VERIFICATION — and it found a near-collision worth naming.** *The absence claim
> was re-probed case-insensitively and in variant spellings. **`10-15` (hyphen) returns `0`;
> `10–15` (EN DASH) returns `3` documents** — but none is this target: they are stats.nba.com's
> `10–15 min` finalisation lag, a `10–15 game` rolling window, `~10–15k` board legs/day, and, closest
> of all, **`NBA_OPEN_ITEMS.md`'s *"whether any run exceeds its `10–15 minute` gap"* — which is the
> spacing between the four `*/2` commit-back scrapers, a different quantity entirely.*** ⇒
> ***The pipeline's end-to-end target is absent; a reader who greps `10–15` will land on four things
> that are not it.*** 📌 *`RULE 58` cost `§F6.13` an entire retracted section an hour earlier; here
> it confirmed a claim instead of overturning one, which is the outcome the rule is for.*

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
is ~~empty as of today~~ **empty as of `2026-09-22`** — ✅ **`SELECT count(*) FROM
nba_score.paper_picks` → `0`, re-derived 2026-09-22 (§T20.27).** *An UNANCHORED "today" was the worst
of the four now-relative classes §T20.27 found: it drifts like a countdown **and** carries no base
date, so a later reader cannot even tell whether it was true when written. Anchored here.*

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

> ## 🔴🔴🔴 **THE CERTIFIER ROW ABOVE IS FILLED IN — 2026-09-22, T20 pass 89 (`§T20.94`). THE ANSWER IS WORSE THAN "AMBIGUOUS": ON A ZERO-GAME DAY BOTH PIPELINES CERTIFY *RED*.**
> *(Read from `nba/certify_pipeline.py` directly — rule 21. **Nothing is changed; this states what the
> code does.** The table above left the certifier's "Broken" cell as a dash because nobody had opened
> the file against this question.)*
>
> | | zero games | broken |
> |---|---|---|
> | **`PIPE=p2`** *(4 checks)* | 🔴 **FAILS 2**: `baseline_history has today` requires `count(*) > 0` for `game_date = today`; `baseline props for today` requires `count(DISTINCT prop) >= 25`. **Both are `0`.** | identical |
> | **`PIPE=p3`** *(5 checks)* | 🔴 **FAILS 2**: `final_hp has today` requires `count(*) > 0`; `board archived today` requires `board_snapshots` rows for today. **Both are `0`.** | identical |
> | ✅ **`PIPE=p1`** *(3 checks)* | ✅ **PASSES** — its checks are **date-independent** *(`max(as_of_date)` within 8 days, `defender_ratings > 10k`, `player_name_map > 400`)* | would fail correctly |
>
> ⚠⚠ **AND `CERT_STRICT` DEFAULTS TO `1`** *(`certify_pipeline.py:32` — `strict = os.environ.get("CERT_STRICT","1") == "1"`)*, **and neither `nba-p2-overnight-heavy.yml` nor `nba-p3-afternoon-light.yml` sets it.** ⇒ ***`sys.exit(1)`. A red build, with the message "This pipeline did NOT produce what it promised."***
>
> ### 🔬 HOW MANY DAYS — **MEASURED LIVE, on a COMPLETED season** *(`nba_calendar.games`, `2026-09-22`)*
> **2025-26 — `2025-10-21 → 2026-04-12`, `174` calendar days, `167` with games ⇒ 🔴 `7` ZERO-GAME DAYS**:
> **`2025-11-27` (Thanksgiving) · `2025-12-24` (Christmas Eve) · `2026-02-14`, `2026-02-16`, `2026-02-17`, `2026-02-18` (All-Star break) · `2026-04-11`.**
> ⚠ *The prior above says "the All-Star break (~5 days), and scattered dates" — **the enumerated figure for a completed season is `7`, and the break contributes `4` of them, not 5.*** ⚠ **The 2026-27 calendar as currently loaded shows `18` in `174` days, but it holds `1,200` games against `1,238` for 2025-26 — **~30 short of a full regular season**, so that figure is NOT final and is recorded only as an upper bound *(rule 30)*.
>
> 🔴🔴 **THE COLLISION THAT MAKES THIS URGENT.** *`nba-p2-overnight-heavy.yml`'s own header gives the reason its cron was withheld:* > ***"a scheduled job failing nightly against an empty schedule trains everyone to ignore red builds."***
> ⇒ ***That reasoning was applied to the OFFSEASON and never to the CALENDAR. The in-season schedule
> reproduces the same condition at least `7` times a year, on both pipelines — `14` guaranteed red
> builds — the moment the crons go in.*** 🔴 **OWNER DECISION**: *the fix is small and is exactly the
> first-class state the MLB lesson above asked for — **gate the two date-scoped checks in each
> certifier on `nba_calendar.games` having rows for that date**, so a zero-game day certifies green
> and a genuine zero certifies red. **Not fixed here (rule 1); recorded with its evidence.***
> 📌 **Full day-by-day context: `NBA_RECIPE.md` `STEP 12 — THE GAME-DAY TIMELINE`, gap ③.**

---

# 🔴🔴🔴 **THE SWALLOWED-FAILURE CENSUS — WHERE A PIPELINE CAN DO LESS THAN IT CLAIMS AND STILL CERTIFY GREEN** *(written 2026-09-22, T20 pass 97, §T20.102)*

> 🔑 **WHY.** *`§T20.101` found one instance while reading a script for another reason: `P2`'s
> day-before injury enrichment sits in a `try/except` that prints one line and continues.* **This is
> the `SILENT` class the brief ranks above everything else, so it was counted rather than left as an
> anecdote.**
> ▶ **POPULATION RE-DERIVED `2026-09-22T22:07:03Z`** *(rule 15/17, not reused from `§T20.99`)*: **the
> `40` scripts the three pipelines call** — **`69` `except` handlers**, of which **`67` neither
> re-raise nor exit.**
> ⚠⚠ **THE BAR, FIXED BEFORE READING**: *a handler counts only if **(a)** it does not re-raise,
> **(b)** it does not exit non-zero, **(c)** it does not write a sentinel the pipeline later checks —
> **and the step still reports success while the certifier cannot tell.*** ***A retry loop is not a
> swallow. A designed fallback is not a swallow.***

## 🔴 CLASS A — **`5` SCRIPTS WHERE A PARTIAL FAILURE IS INVISIBLE**

| where | what is lost | why nothing catches it |
|---|---|---|
| 🔴🔴🔴 **`build_availability_delta.py:70-71`** — `for sh in idx.get("shards", []): try: rows.extend(fetch(...)) except Exception: pass` | **whole SHARDS of the injury-report archive** | ***`pass`. No message of any kind.*** The code then tests only `if inj.empty` — **so losing some shards yields a smaller-but-non-empty delta that looks normal.** `PIPE=p3`'s five checks never look at it. |
| 🔴🔴 **`baseline/build_baseline_ladder.py:103`** *(PRIOR, `§T20.101`)* **and `baseline/build_periods_ladder.py:80`** | **the entire day-before injury enrichment** | one printed line; the ladder builds; `PIPE=p2` counts rows and props, never enrichment |
| 🔴 **`build_defender_ratings.py:64-67`** | **matchup SHARDS** — one printed line per shard, `if not frames: return empty` | `PIPE=p1` checks `defender_ratings > 10000` rows — ***a partial build clears a floor that low*** |
| ⚠ **`scrape_nba_season_tables.py:133-139`** | **one team's COACHES** per failure | the file is written with fewer records; **`P1` has no coaches check at all** |

> ## 🔴🔴🔴 **THE SHARPEST FACT: `build_availability_delta.py:71` IS THE ONLY HANDLER OF THE `69` THAT LEAVES NO TRACE WHATSOEVER — AND WHAT IT FEEDS IS THE SCORED BOARD.**
> **`score_board_legs.py:189` reads `FROM nba_score.availability_delta WHERE game_date = %s`.**
> ⇒ ***A silently truncated availability delta does not merely degrade a report; it changes the legs
> `P3` scores, and the only evidence that anything happened is the absence of rows nobody counts.***

## ⚠ AND IT BREAKS A DISCIPLINE THIS CORPUS ALREADY STATES

**`NBA_MASTER_SUMMARY.md` records the rule for exactly this layer**: *"**Baseline build** (T14+) —
**fail loudly, no swallowing** — the outputs are interdependent; a silently missing prop pair is
**invisible** and corrupt"*, and `NBA_OPEN_ITEMS.md` repeats it: *"the baseline build **forbids
swallowing failures**."*
⇒ 🔴 ***The two baseline ladder builders each carry a swallowing handler. The discipline is
documented, and the code does not follow it.*** ⚠ **Recorded, not fixed (rule 1).**

## ✅ CLASS B — **CORRECTLY NOT DEFECTS, NAMED SO THEY ARE NOT RE-FOUND**

*The bar excluded far more than it kept.* **Retry loops** *(`last_error = str(exc); if attempt < 3:
time.sleep(5)` — about forty of the sixty-seven)* record the error and fall through. **Designed
fallbacks** are correct: the other bare `pass` in the whole set, **`scrape_underdog_board.py:91`**,
*looks like the worst case and is not* — `registry` is assigned a valid default on the line above and
seeded on the lines below. **Per-leg skips** in `archive_live_boards.py` increment a counter the run
reports. 📌 *Naming these is part of the finding: **`67` non-re-raising handlers reduce to `5`
scripts once the bar is applied**, and a census that had skipped the reading would have reported
thirteen times the true number.*

---

## ✅✅ **THE SHELL HALF — AND IT IS CLEAN** *(added 2026-09-22, T20 pass 98, §T20.103)*

> *The census above searched one language; a GitHub Actions step is a **shell** script and swallows
> differently. **The same bar was applied to the `run:` blocks** — pinned `2026-09-22T22:11:52Z`:
> **`39` steps, `20` `run: |` blocks** across the three pipelines.*

| construct | found | verdict |
|---|---|---|
| **`continue-on-error:`** | ✅ **`0`** in all three pipelines | *GitHub reports such a step green regardless — **none exists here.** ⚠ **And it is a deliberate choice, not an oversight**: `11` other NBA workflows DO carry it — `nba-backfill`, `nba-backtest`, `nba-boards-market`, `nba-daily-delta`, `nba-diagnostic`, `nba-game-officials`, `nba-measure-types`, `nba-pergame-backfill`, `nba-scrape`, `nba-season-tables`, `nba-starter-status` — and `§T2.10a` already documents that policy for the scrape jobs.* |
| **`\|\| echo failed`** | ✅ **`0`** | *the only two `\|\| echo` hits in all three files are **the headers declaring the policy**: `nba-p2-overnight-heavy.yml:15` — **"both fail the job loudly. No `\|\| echo failed` anywhere"** — and `nba-p1-weekly-static.yml:16`, **"FAILURE POLICY: steps report loudly."*** |
| **`\|\| true`** | **`4`** | ✅ **all four are `git add … \|\| true` inside commit steps, each followed by `git diff --cached --quiet`** — a CHECKED fallback, excluded by the bar, exactly as the `62` retry handlers were above |
| **explicit `set -euo pipefail`** | **`7` of `20` blocks** | see below |

### ⚠⚠ **THE THIRTEEN BLOCKS WITHOUT `set -euo pipefail` ARE NOT A DEFECT, AND CHECKING THAT IS THE POINT**

*A multi-command block with no `set -e` **looks** like the shell's `except Exception: pass` — and this
census was one patch away from publishing twelve of them as findings.* ▶ **What killed it**: **no
`shell:` and no `defaults:` override exists in any of the three files**, so GitHub's default `run`
shell on Linux applies — **`bash -e {0}`** — ***and `-e` is therefore already on: a command that is
not the last CAN fail the step.***
⚠ **THE PRECISE RESIDUAL, STATED RATHER THAN WAVED AWAY**: *`bash -e {0}` gives `-e` but **not
`-o pipefail` and not `-u`*** — so a failure inside a **shell pipeline** would still be masked in
those thirteen blocks. ▶ **Checked: there is not a single shell pipeline in any of them** *(the two
`|` characters found are inside Python f-strings — `print(f"PAPER_GRADED|{n} picks")`)*.
⇒ ✅ **RESIDUAL EXPOSURE: ZERO.**

> ## 🔑🔑 **THE CONTRAST IS THE FINDING.**
> ***The shell layer DECLARES a no-swallow policy in its own headers and keeps it completely. The
> Python layer declares nothing at the file level and holds the one handler that leaves no trace
> (`T20-17`).*** **The discipline was written down where it was already being followed, and is absent
> where it was not.**

---

# 🔴🔴🔴 **WHAT CERTIFIES GREEN WHILE BROKEN — THE TWELVE CHECKS, READ ADVERSARIALLY** *(written 2026-09-22, T20 pass 99, §T20.104)*

> 🔑 **THE QUESTION.** *The certifiers are the only automated statement this system makes about its own
> health. Four passes have each found an answer to this question in passing —* `§T20.94` *(zero-game
> days),* `§T20.96` *(38 early-tip days certify green),* `§T20.102` *("a partial build clears a floor
> that low"; "not one of the twelve covers enrichment"),* `§T20.103` *("`board archived today` is
> satisfied by PrizePicks alone")* — ***and nobody had asked it directly.***
> ▶ **All twelve re-derived from `nba/certify_pipeline.py` this pass** *(rule 15/17 — not reused)*:
> **`PIPE=p1` `3` · `p2` `4` · `p3` `5`.** **Row-count denominators taken live, 2025-26:**
> `baseline_history` **median `60,398` rows per game-day across `163` days** · `board_snapshots`
> (PrizePicks) **median `8,994` across `164` days**.

> ✅✅ **A THIRTEENTH CHECK EXISTS AND THIS SECTION DID NOT KNOW IT — added 2026-09-22, T20 pass 110
> (`§T20.115`).** **`nba-boards-market.yml:135–152`, step *"Assert the pull captured something"*:**
> `total = sum(n for _, n in rows); if total == 0: raise SystemExit("NO BOARD LEGS captured for {gd} -
> the scrapers ran but nothing landed.")` — **over `nba_market.board_snapshots` grouped by
> `bookmaker` for today's PT date.** 🔑 **Its own comment states the failure mode this whole section
> is about**: *"A board pull that captured nothing must be VISIBLE. **This is the failure that hides
> best: every step green, no legs in the table, and the scorer quietly prices an empty slate.**"*
> ⚠⚠ **IT IS NOT ONE OF `certify_pipeline.py`'s twelve** — it is **nine lines of Python inside a YAML
> `run:` block**, which is why every census that counted scripts missed it *(probes: `Assert the
> pull` and `NO BOARD LEGS` each **0 of 12, 0 of 30, 0 in the baseline tree**)*. ⚠ **DORMANT TODAY**:
> that workflow is `workflow_dispatch` only — *"**NO CRON YET**… **Cron goes in at season start**"* —
> and nothing else invokes it, **so it guards nothing until the cron is added.** 📌 ***Recorded as a
> POSITIVE: on this one point the corpus was more pessimistic than the system, and a section about
> what certifies green while broken owes the system its real guards as much as its gaps.***
> ⚠ **It is also the ONLY `raise` among the seven inline blocks that does not duplicate a repo
> script** — the full inline-code census is `§T20.115`, population **`7` blocks in `5` files across
> `39` in-scope workflows**, pinned `2026-09-22T23:25:43Z`.

## 🔴 FINDING 1 — **FIVE OF THE TWELVE HAVE NO DATE PREDICATE AT ALL**

| check | pipeline | SQL |
|---|---|---|
| `defender_ratings rows` | p1 | `SELECT count(*) FROM nba_ref.defender_ratings` — **whole table** |
| `player name map populated` | p1 | `SELECT count(*) FROM nba_ref.player_name_map` |
| `as-of calibration available` | p2 | `SELECT count(*) FROM nba_score.ladder_calibration_asof` |
| `confidence model loaded` | p3 | `SELECT count(*) FROM nba_score.confidence_model WHERE deduction > 0` |
| `defender_ratings refreshed` | p1 | tests `max(as_of_date)` ⇒ **ONE fresh row satisfies it** |

⇒ ***Once those tables are populated they can never fail again.*** **A run that wrote nothing certifies
green on all five**, because they describe the database's history rather than today's work.
🔴 **`as-of calibration available` is the one that reads worst**: *`P2` step 16 rebuilds the as-of
calibration and step 18 refits the confidence model — **the check that looks like it covers them
counts rows that were there yesterday.***

## 🔴🔴 FINDING 2 — **`> 0` MEANS ONE ROW OUT OF SIXTY THOUSAND**

| check | threshold | typical real value |
|---|---|---|
| `baseline_history has today` | **`> 0`** | 🔴 **median `60,398` rows** |
| `board archived today` | **`> 0`**, and **any bookmaker** | 🔴 **median `8,994` for PrizePicks alone** |
| `final_hp has today` | **`> 0`** | a full slate is tens of thousands |
| `baseline props for today` | **`>= 25`** of 30 | ⚠ **five props may be missing silently** |

⇒ ***A build that produced one row of sixty thousand passes.*** **And `board archived today` does not
name a bookmaker, so — as `§T20.103` showed for `P3`'s three-scraper step — Sleeper, Underdog and
Fliff can all be absent from a slate while the check is green.**

## 🔴 FINDING 3 — **WHAT IS NOT CHECKED AT ALL**

| pipeline | steps | checks | what they touch |
|---|---|---|---|
| **`P1`** | **9 steps, 14 scripts** | 3 | `defender_ratings`, `player_name_map` — ***teams, arenas, players, bio, season tables, team stats, on/off, playtypes, tracking, DARKO, shot quality and static context are unchecked*** |
| **`P2`** | **19 steps** | 4 | `baseline_history` ×3 + one static — ***grading last night's board, grading paper picks, market spreads, the blowout refit and the confidence refit are unchecked*** |
| **`P3`** | **11 steps** | 5 | `final_hp` ×3, `confidence_model`, `board_snapshots` — ***the availability delta (`T20-17`), the board tiers (`T20-7`) and the paper-pick log are unchecked*** |

⚠ **And `§T20.102` already established the summary line**: ***not one of the twelve covers
enrichment.***

## ⚠ FINDING 4 — **THE CERTIFIER'S OWN CLOCK IS DST-NAIVE, AND THE PIPELINES BYPASS IT**

**`certify_pipeline.py:27` — `PT = timezone(timedelta(hours=-8))`**, and `:33` —
`today = os.environ.get("CERT_DATE") or datetime.now(PT).date().isoformat()`.
✅ **In the pipelines this is harmless**: all three pass `CERT_DATE` explicitly from
`TZ=America/Los_Angeles date +%F`, which is **named-zone correct**.
🔴 **The fallback is the exposure, and it is a hand-run exposure**: *a certifier invoked without
`CERT_DATE` during PDT computes "today" from a fixed `-8` offset.* ⚠ **Within `T20-12`'s stated scope**
*("zero DST-aware Python in the NBA scripts") — cited, not re-raised* — **and one more instance of
`§T20.101`'s pattern: running it by hand is not the same job the pipeline runs.**

> ## ⚠⚠ **WHAT THIS IS AND IS NOT**
> ***None of the twelve is wrong.*** **Each tests what it says it tests**, and a check that is narrow
> by design is not a defect — `confidence model loaded` is meant to test the model, not the slate.
> ⇒ ***The finding is the GAP BETWEEN what certification is read as meaning ("the pipeline produced
> what it promised" — the certifier's own failure message) and what it measures.*** **Recorded as
> `T20-18`; not fixed (rule 1).**

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

✅ **THE TRACE BELOW IS CORRECT AND IS CONFIRMED BY DIRECT MEASUREMENT** *(§0z-8-T18-RETRACTION,
2026-09-22)*: **the injury-PDF archive is hourly on the `:30` in Eastern — 48 snapshots per game
date — so `2:30 pm ET` is an ordinary daily filename and the 2026-09-09 seven-item list was a
hand-sample of it.** ⚠ *An intermediate section of this sweep briefly proposed a competing
"league-bulletin" origin; it was **retracted the same day** and the retraction is recorded above with
both states visible. The conclusion never moved: **1:00 PM PT binds, 1:15 PM PT is the cutoff**, now
also confirmed by the league's own published rule.*

**The 2:30 PM PT figure was drift** — traced to a list of observed injury-PDF timestamps in *Eastern*
(2:30 PM ET = 11:30 AM PT), and to `nba_asof.py`'s `PHASE2_CUTOFF_LOCAL = "17:45"  # after the 5:30 PM
ET day-of report` — a league **bulletin**, not a filing deadline. `nba_asof.py` already had
`PHASE1_CUTOFF_LOCAL = "16:00"` = **1:00 PM PT**, which is the correct anchor.

**Consequences:** no third pipeline; **scenario precompute dropped** (one window = nothing to select
with); **freshness gate dropped** (uniform penalty discriminates nothing).

---

## 2. P1 — WEEKLY STATIC
`.github/workflows/nba-p1-weekly-static.yml` · **cron `0 19 * * 1` = Mondays 12:00 PDT / **11:00 PST**** *(qualified 2026-09-22, §T20.49 / T20-11 — 11:00 PT for 133 of the season's first 145 days; the workflow's own `:28` comment inverts PDT and PST)* ·
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

---

## §0z-8-T18-RETRACTION — ⚠⚠⚠ THIS SWEEP OVERCLAIMED, AND THE RETRACTION IS RECORDED, NOT EDITED AWAY
*(written 2026-09-22, ~40 minutes after §0z-8-T18 below, by the same pass, on reading further into the
same stratum. **The §0w precedent governs: a correction by this sweep is recorded in place with both
states visible.**)*

🔴🔴 **§0z-8-T18 BELOW IS HEADED *"THE TRACE THIS SWEEP RECORDED IS PROBABLY THE WRONG ONE"* AND CALLS
THE PDF-SNAPSHOT TRACE *"the weaker of two."* ***BOTH CLAIMS ARE RETRACTED.*** **The PDF-snapshot
trace is CORRECT, and the evidence that settles it was 130 lines further into the stratum this same
pass was reading.**

### ✅ WHAT SETTLES IT — *the archive measured directly, in the transcript* (`bash_tool` SEG 545/546)

The author queried the backfill's own index and shards and printed what is actually there:

| | |
|---|---|
| 2025-26 index | **7 shards** |
| shard `2025-11` | **68,447 rows · 30 game dates** |
| snapshots per game date | **min 24 · median 48 · max 48** |
| example date 2025-11-04 | **48 timestamps, EVERY ONE at `:30` past the hour**, `2025-11-03T00:30:00-05:00` → `2025-11-04T23:30:00-05:00` |
| `source_url` sample | `https://ak-static.cms.nba.com/referee/injury/injury-report_2025-11-01_12am.pdf` |

🔑🔑🔑 ***The archive is HOURLY, ON THE HALF-HOUR, IN EASTERN (`-05:00`). `14:30-05:00` — "2:30 pm ET"
— is an ORDINARY DAILY FILENAME, present on every single game date.***

⇒ **The 2026-09-09 line *"observed snapshots at 12:30 pm, 01:00 pm, 02:30 pm, 03:30 pm, 04:00 pm,
06:45 pm, 07:45 pm"* was a HAND-SAMPLE of an hourly archive, not a schedule** *(and `01:00` / `06:45`
/ `07:45` are not on the `:30` grid at all, so the sample is not even a clean subset)*. **`2:30 pm`
needed no special origin: it was simply in the sample, and the sample was in Eastern.**

### ⇒ WHAT IS WITHDRAWN, EXACTLY

| §0z-8-T18 claimed | verdict |
|---|---|
| *"the trace this sweep recorded is probably the wrong one"* | ❌ **WITHDRAWN** — the recorded trace is right |
| *"the PDF story needs both an error and an unexplained selection among seven candidates"* | ❌ **WITHDRAWN** — the seven were a sample of forty-eight, so there is no privileged selection to explain in EITHER story; *"drift"* is the whole explanation |
| *"`2:30 PM PT` is a CORRECT conversion of a NAMED CONSTANT"* | ⚠ **DOWNGRADED to a COINCIDENCE, correctly computed.** `ENRICH_CUTOFFS_LOCAL = ["13:30","17:30"]` is real in live source and `17:30 ET = 2:30 PM PT` is exact — **but a matching number is not a causal link**, and the sweep had no evidence it was one |
| the league-rule quotations, the early-tip clause, the three bulletin times, T18-9, T18-10 | ✅ **ALL STAND** — independently sourced, all still absent from the thirty before this pass |

🔑🔑 **THE METHOD FAILURE, NAMED PLAINLY**: ***an arithmetic coincidence was promoted to a causal trace,
and the promotion happened because the pass wrote at the moment it found the coincidence instead of
at the end of the stratum.*** **That is rule 12's failure — *apply a rule in the pass that writes it*
— turned on rule 25: reading in order and in full is not only about coverage, it is about not
publishing from the middle of a document.** ⚠ **And the sweep had already named this exact failure at
§0w and called it *"the exact failure rule 6 exists to prevent, committed by this sweep."* It has now
been committed twice.**

---

### 🔴🔴 AND THE FINDING THAT REPLACES IT — *the cutoff was never measured*

**The author wrote `nba/measure_report_cutoff.py` for exactly this question**, and stated its standard
in the file's own docstring:

> *"policy says the last market to file is pacific, at 1 pm pt. **but policy is not evidence — measure
> it.**… if 1 pm pt covers ~100% of games and the 13:15→14:30 churn is negligible, the earlier cutoff
> is safe and phase 2 can run 75 minutes sooner. **if not, 2:30 stays — for a reason this time, not by
> inheritance.**"*

**It measures, per game-day, from the system's own two seasons of archived snapshots**: the earliest
snapshot in which each game's teams carry a real status; the share of game-days fully covered by
**10:00 / 11:00 / 12:00 / 13:00 / 13:15 / 14:00 / 14:30 / 15:00 PT**; the status churn between 13:15
and 14:30; and the same split **by tip time, "since early tips file 8-10am local."**

🔴🔴 **IT NEVER RETURNED A RESULT IN THIS TRANSCRIPT.**

| run | outcome |
|---|---|
| `35464255049` *(the probe workflow)* | ❌ **FAILED** — `ModuleNotFoundError: No module named 'pandas'`. *The probe workflow installs only `curl_cffi`.* |
| `35464467204` *(moved into `nba-engine-test.yml`, which does install pandas; dispatched `task=cutoff`)* | ⚠ **last seen `status: "pending", conclusion: null`** — **no `tool_result` anywhere in the 860 mechanism segments reports its output.** No coverage table, no churn figure, no by-tip-time split. |

⇒ ✅ **THE 1:15 PM PT CUTOFF RESTS ON POLICY REASONING — the league rule, which is authoritative — AND
NOT ON THE MEASUREMENT ITS OWN AUTHOR BUILT TO CHECK IT.** ⚠⚠ **Stated at evidence strength: the
cutoff is NOT unfounded** *(11 a.m.–1 p.m. local is the league's own rule, quoted from four
independent results in this transcript)*. **What is missing is the author's own stated standard —
"policy is not evidence, measure it" — applied to his own conclusion.** *Open item T18-11.*

🔑 **And the early-tip clause recorded at T18-9 was NOT news to the author** — his own docstring says
*"early tips file 8-10am local"*, written before this sweep found it. **It is news to the THIRTY, which
is what the novelty probe measures and all that was ever claimed.**

---

## §0z-8-T18 — ⚠ SUPERSEDED IN PART BY THE RETRACTION ABOVE *(2026-09-22)* — the `2:30 PM PT` trace
*(T18 pass 2, mechanism strata · written 2026-09-22 · **this section corrects the SWEEP's own causal
account, not the system's** — the operational conclusion is unchanged and is reinforced)*

⚠ **What is NOT in question.** **The binding constraint is still 1:00 PM PT and the cutoff is still
1:15 PM PT.** *That is unchanged, and this section strengthens it with an external authority the
sweep did not previously hold.* **§967, §1617, `NBA_OPEN_ITEMS` §*BUG-FIXED · the 2:30 PM PT cutoff
was drift* and `NBA_MASTER_SUMMARY` 15745–15752 are all correct in their CONCLUSION.** **What this
section revises is the ORIGIN STORY those entries attach to it.**

### THE RECORDED TRACE — *what the sweep says today*

> *"2:30 PM ET is 11:30 AM PT"* — the number came from a **2026-09-09 list of observed injury-PDF
> snapshot timestamps** *(12:30 / 1:00 / **2:30** / 3:30 / 4:00 / 6:45 / 7:45 PM)* that were
> **Eastern**, and it **lost its ET label** on the way into fact 41.

⚠ **That story requires an ERROR to produce the number, and it does not explain the SELECTION**:
**seven timestamps were in that list and nothing in it privileges 2:30 over 3:30 or 6:45.**

### ✅ THE COMPETING TRACE — *read from live source, 2026-09-22, `nba/nba_asof.py` (6,295 B, 126 lines)*

```
PHASE1_CUTOFF_LOCAL  = "16:00"   # 1:00 PM PT
PHASE2_CUTOFF_LOCAL  = "17:45"   # 2:45 PM PT (the owner's pick window; after the 5:30 PM ET day-of report)
ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]
```

🔑🔑🔑 ***`17:30 ET = 2:30 PM PT`, EXACTLY.*** **And `13:30` and `17:30` are not arbitrary: the
module's own docstring names what they are** — *"ENRICH_CUTOFFS = 13:30, 17:30, and tip-30min → the
enrichment runs."*

⇒ **`2:30 PM PT` is a CORRECT conversion of a NAMED CONSTANT that has been in the source all along.**
**No timezone error is needed to produce it.** 🔑 **And unlike a seven-item list, `ENRICH_CUTOFFS_LOCAL`
has exactly two entries — so the selection question the PDF story cannot answer, this one answers by
construction.**

### ✅ THE EXTERNAL AUTHORITY, FOUND INSIDE T18 ITSELF *(mechanism stratum, `web_search`, SEG 483/484)*

*The session ran exactly **two** `web_search` calls in 1,205 segments. This was one of them.*
⚠ **Authority named, per rule 11: this is a web-search result quoted in T18, not a primary NBA rules
document. It is recorded as such.**

> *"teams are required to submit a game-day injury report **between 11 a.m. and 1 p.m. local time**
> and **between 8 and 10 a.m. for tip-offs 5 p.m. or earlier** on game days (besides the second game
> of a back-to-back)… For the second game of a back-to-back, teams must report the same information
> **by 1 p.m. local time** on the day of the game. **The league usually issues its own reports at
> 1:30 p.m., 5:30 p.m., and 8:30 p.m.**"*

**Three things fall out, and the first two are NOT RECORDED anywhere in the thirty** *(novelty probe
2026-09-22: `8 and 10 a.m.` **0/0** · `5 p.m. or earlier` **0/0** · `1:30 p.m., 5:30` **0/0** ·
`8:30 p.m` **0/0**)*:

**1. 🔑 THE EARLY-TIP CLAUSE.** For a tip-off at **5 p.m. local or earlier**, the filing window is
**8–10 a.m. local**, not 11 a.m.–1 p.m. ⇒ **on an all-early slate every report is in by 10 a.m.
local, and the binding Pacific constraint becomes 10:00 AM PT, not 1:00 PM PT.** **The 1:15 PM PT
cutoff is therefore CORRECT but CONSERVATIVE on such slates** — it is the worst case, not the only
case. ⚠ **The back-to-back clause keeps 1 p.m. local as the floor whenever a second-night team is on
the slate**, so the general answer does not move. *Open item T18-9.*

**2. 🔑 THE LEAGUE PUBLISHES THREE BULLETINS — 1:30 / 5:30 / 8:30 p.m. ET.** In Pacific that is
**10:30 AM / 2:30 PM / 5:30 PM PT**. 🔴🔴 ***The middle one IS "2:30 PM PT."*** **And
`ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]` is the first two of them, to the minute.** *The sweep had
recorded only the 5:30 p.m. ET bulletin, via `PHASE2_CUTOFF_LOCAL`'s comment; there are three.*

**3. ✅ THE TEAM RULE IS CONFIRMED VERBATIM, FROM TWO INDEPENDENT PLACES.** The external source says
*"11 a.m. and 1 p.m. local time"*; `nba_asof.py`'s docstring, written long before, says *"game-day
report lands 11 AM-1 PM local; B2B second-night report 1 PM local."* **The correct rule was in the
source the entire time.**

### ⇒ THE REVISED ACCOUNT — *stated at evidence strength, with both stories kept*

🔑 ***The error was almost certainly one of CATEGORY, not of TIMEZONE: a league REPUBLICATION
BULLETIN (5:30 p.m. ET = 2:30 p.m. PT, a named constant in `nba_asof.py`) was promoted to "the
day-of injury report DEADLINE" — a team filing obligation it never was.*** **Fact 41 then wrote *"the
2:30 pm PT day-of injury report"*, and facts 73, 74 and 96 cited it as established.**

⚠⚠ **BOTH TRACES ARE KEPT AND NEITHER IS DELETED** *(rule 4 — a supersession carries both dates and a
pointer to the earlier entry)*. **The PDF-snapshot trace is recorded at §967, §1617,
`NBA_OPEN_ITEMS` and `NBA_MASTER_SUMMARY` 15745–15752, dated 2026-09-19 from the transcript's own
prose; this bulletin trace is dated 2026-09-22 and rests on live source plus an external authority.**
**The sweep does not have a document in which the author states which one he meant**, so:
⚠ **NOT RECORDED: which origin the author had in mind.** *What IS verified: the arithmetic
(`17:30 ET = 2:30 PM PT`), the constant's presence in live source, the league's three bulletin times
per the quoted source, and the fact that the bulletin story needs no error while the PDF story needs
both an error and an unexplained selection among seven candidates.*

🔴 **AND THE PRACTICAL CONSEQUENCE IS THE SAME EITHER WAY, WHICH IS WHY THIS IS A TRACE CORRECTION AND
NOT A REOPENING**: **a bulletin is not a deadline.** *Waiting for the 5:30 p.m. ET republication buys
nothing a 1:00 PM PT team-filing cutoff has not already secured, and it costs three and a half
hours.* ✅ **`nba-p3-afternoon-light.yml` already encodes the corrected reasoning inline and guards it
at runtime** — *"Refusing to run for TODAY before 13:00 PT — Pacific clubs file until 1:00 PM PT"*
*(verified live, line 74, 2026-09-22)*.

---

# 🔴🔴🔴 **`standards_3pick_v1` — THE PAPER-TRADING STRATEGY, SPECIFIED END TO END** *(written 2026-09-22, T20 pass 93, §T20.98)*

> 🔑 **WHY THIS SECTION EXISTS.** *`P3` step 4b logs the night's picks and `P2` grades them the next
> morning. **That record is the evidence the owner will use to decide whether any of this works** —
> and it is the youngest thing in the system: the workflow comments date it* ***"PAPER TRADING
> (2026-09-21)"***, *after T1–T18 closed.*
> ▶ **MEASURED `2026-09-22T21:44:53Z`, tree `e7419a5390cc422e557ba98a99f2b5c1669e0c21`**: the string
> `standards_3pick_v1` appeared in **2 of the twelve**, *and both occurrences are inside one SQL
> snippet this sweep itself quoted at `§T20.94`/`§T20.97`.* **In the sweep's BASELINE tree it appears
> in none of the twelve** — *its only baseline carrier is `PP_PAYOUT_FINDINGS.md`, which belongs to
> the concurrent build session and is out of this sweep's scope.*
> ⚠⚠ **AND ONE PRIOR MUST BE QUALIFIED BEFORE THE CLAIM IS MADE (rules 26/28/51).** *`§T12.6h`
> already recorded these objects on **`2026-09-22T07:01:11–23Z`**, under the heading* ***"The
> concurrent session's new objects, verified against the live database"***, *listing*
> ***"`nba_score.paper_pick_slips(p_date, p_threshold, p_snapshot)` and `paper_pick_candidates`
> likewise; `nba_score.paper_picks` has `event_id`."*** ⇒ ***Their EXISTENCE and SIGNATURES were on
> file. What follows — what they SELECT, how they PACK, how they GRADE, and the defect in §5 — was
> not.***
> 🔑 **THE SCOPE CALL, STATED RATHER THAN DODGED**: *these functions appear to be the concurrent
> session's work, **but `P2` and `P3` call `nba_score.log_paper_picks` and `nba_score.grade_paper_picks`
> directly**, so **what the in-scope pipelines execute is in scope to document.** The build session's
> OWN artefacts are not, and are pointed at rather than reproduced — `PP_PAYOUT_FINDINGS.md`,
> `prop_universe`'s counts (**mid-rebuild, not final**) and `sim_strategy`'s replay figures (§6).*
> ⇒ ***The mechanism the system will be judged by was named but never described in any document meant
> to describe the system.***
> ⚠ **Everything below is read from `pg_get_functiondef` and the workflow files, live `2026-09-22`.
> Nothing was run and nothing was written. `nba_score.paper_picks` and `nba_score.paper_results` both
> hold `0` rows — expected, not a defect: the system has never run against a live slate (`§T20.95`).**

## 1. SELECTION — `nba_score.paper_pick_candidates(p_date, p_threshold DEFAULT 1.30, p_snapshot DEFAULT NULL)`

*Its own header: **"identical for live logging and historical replay… Writes nothing."***

| step | rule, as coded |
|---|---|
| **snapshot** | default = **the most recently fetched PrizePicks snapshot for that date** — `ORDER BY s.fetched_at DESC, s.snapshot_label DESC LIMIT 1` — i.e. *"what is on the board at logging time"* |
| **book** | 🔴 **`bookmaker = 'prizepicks'` and `app = 'prizepicks'` ONLY.** *Underdog, Sleeper, Fliff and Betr are not eligible.* |
| **line type** | **standards only** — `market_key NOT LIKE '%alternate'` |
| **prop universe** | 🔴 **a HARDCODED twelve-prop map inside the function**: `points · rebounds · assists · threes_made · pts_reb · pts_ast · reb_ast · pra · blocks · steals · stocks · turnovers` |
| **model value** | **`mv = 2 × final_hp`** — an **even-money EV proxy**, not a PrizePicks payout |
| **threshold** | `mv >= p_threshold`, default **`1.30`** ⇒ ***exactly `final_hp >= 0.65`*** |
| **one per player** | `DISTINCT ON (player) ORDER BY player, mv DESC` — **the best prop and side, one leg per player** |
| **rank** | `row_number() OVER (ORDER BY mv DESC, player)` |

## 2. PACKING — `nba_score.paper_pick_slips(...)`

*Its own header, quoted:* > ***"Greedy game-aware packing (2026-09-21): picks in rank order; each goes
into the first open slip that has no leg from its game; a new slip opens when none fits; slips close
at 3 legs. Every slip spans three DIFFERENT games (PrizePicks pays same-game slips less: a 2-pick of
opponents paid 2.9x, and same-game Flex partials are cut)."***
📌 *Slip size **`3`** is hardcoded (`cnt[i] < 3`). The rationale is the same-game correlation discount
already on file at `NBA_MULTIPLIERS.md` §0.2f.*

## 3. LOGGING — `nba_score.log_paper_picks(p_date, p_threshold DEFAULT 1.30)`

**First log wins** *(`IF EXISTS … RAISE NOTICE … RETURN 0`)*, writing `strategy, game_date, player,
prop, line, side, model_value, final_hp, pick_rank, slip_no, threshold, snapshot_label, event_id` —
under **`PRIMARY KEY (strategy, game_date, player)`**. *Full idempotency analysis at `§T20.94`.*

## 4. GRADING — `nba_score.grade_paper_picks()`, called by `P2` step 3b

Joins `nba_market.board_outcomes` on `game_date, player, line, side` with
`replace(market_key,'_alternate','')`, takes `DISTINCT ON (strategy, game_date, player)` by
`snapshot_label DESC`, and sets **`void`** on `push`/`dnp`, **`hit`** when `over_win`/`Over` or
`under_win`/`Under`, else **`miss`**. **Only rows with `result IS NULL` are touched.**

## 5. 🔴🔴 THE DEFECT THIS SPECIFICATION EXPOSES — **THE TWELVE-PROP MAP IS DUPLICATED**

***The identical `m(prop, market_key)` VALUES list is hardcoded TWICE — once in
`paper_pick_candidates` and once in `grade_paper_picks` — with no shared source.***
⇒ 🔴 **A prop added to the selector and not to the grader produces picks that are logged and can
NEVER be graded**: the grader's `JOIN m ON m.prop = p.prop` simply drops them, they keep
`result IS NULL` for ever, and — because the function only touches ungraded rows — **nothing ever
reports them as missing.** *A silent, permanent gap in the record the system is judged by.*
⚠ **Recorded, not fixed (rule 1).** 🔑 *Note the list is also exactly twelve, which is the number
`§T20.24` measured live for the archived PrizePicks board — so **`§0v.4`'s backtest scope limit
propagates unchanged into the live selection rule.***

## 6. ⚠ `NOT RECORDED` — **IS THE 3-LEG SLIP A POWER PLAY OR A FLEX?** *(rule 6)*

**Nothing in `P2`, `P3`, the four functions or the twelve says which PrizePicks product a
`standards_3pick_v1` slip represents**, and the two are not close: `NBA_MULTIPLIERS.md` §0.9b records
**Power Play 3-pick = `6×` all-or-nothing** against **Flex 3-pick = `2.25×` all, `1.25×` on 2/3**.
⚠⚠ **The only statement anywhere is OUTSIDE this sweep's scope and is hours old**: `nba_score.sim_strategy`
holds a single row, **`std3_power_130`, created `2026-09-22T07:10:13Z`**, whose params carry
`slip_type: "power"` and whose note describes *"the paper-trading standards strategy
(standards_3pick_v1) rebuilt on the prop universe."*
🔴 **This sweep does NOT adopt that row**: it postdates the sweep's baseline, it is built on
`prop_universe` — **which the owner has stated is mid-rebuild and whose counts are not final** — and
it appears to belong to the concurrent build session. **Its replay figures are deliberately not
reproduced here.** ⇒ 🔴 **OWNER DECISION: the slip type belongs in the pipeline or the config, not
only in a validation row written by another session.**

📌 **Pointers**: `§T20.94` *(idempotency, and the `p3` certifier checks)* · `NBA_RECIPE.md`
`STEP 12` row 5 *(where 4b sits in the day)* · `NBA_MULTIPLIERS.md` §0.9b *(the payout table)* and
§0.2f *(the same-game discount this packing rule implements)* · `NBA_BASELINE_CALIBRATION.md` §0v.4
*(the twelve-stat-type scope limit)*.