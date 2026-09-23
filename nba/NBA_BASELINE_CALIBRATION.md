# NBA BASELINE CALIBRATION

**Scope.** Everything governing the **baseline hit probability** — the classification/baseline
pipeline. Formulas, tiers, granulation, lifts, penalties, caps, shrinkage, distributions, calibration
and the evidence behind each.

---

> # 📑 **INDEX — `NBA_BASELINE_CALIBRATION.md`**
> **~~`106`~~ → ~~`115`~~ → ~~`119`~~ → ~~`124`~~ → ~~`130`~~ → `132` sections · ~~`124,558`~~ → ~~`130,763`~~ → `151,041` bytes *(at parent commit; `§F6.19`)* · ~~`1,847`~~ → `1,936` lines · built `2026-09-23`, census corrected same day (`§F2.14`).**
> ⚠ *The original count came from a heading detector anchored at line start, blind to **blockquoted** headings — **294 across the twelve, `6.0%`**. Re-derive with `^(?:>\s*)*#{1,6}\s`, never `^#`.*
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** *(`§T20.22`: `6` of `16` line-number pointers
> rotted within a day)*. **Search for the quoted `§` label.**
> 🔴🔴 **TWO STRUCTURAL DEFECTS, MEASURED `2026-09-23`:**
> **① `§0y` APPEARS TWICE** — *"THE OREB REBUILD"* and *"WHERE THE BASELINE'S CONSTANTS ACTUALLY
> LIVE"*. **They are unrelated sections with the same label.**
> **② A STRAY `h1` MID-FILE**: `# turnovers/fouls tested at 0.5 and 0.25 and were WORSE than
> replacement -> stay replacement` — **a config comment that escaped its code fence and now renders
> as a top-level heading**, splitting `§3.7 Shrinkage` from `§3.9b`. *(Same class as
> `NBA_WORKERS.md` `§0.38`.)* ⚠ **Documented, not repaired — the line carries real content and rule 1
> holds.**
> 🔴 **And the `0*` blocks run backwards**: `0z-T17` → `0z-T16-C` → `0z-T16-B` → `0z-T16` → `0y` →
> `0y-1` → `0y-2` → `0x` → `0u` → `0v` → `0w` → `0y`②.
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🔴 **the calibration parity violation** *(found in something ALREADY APPLIED to `38.7M` legs)* | **`§0z-T17`** |
> | 🔑 **the owner's directive to calibrate in WINDOWS, not over a full season** | **`§0z-T16`** |
> | 🔑 **the phase × band calibration layer** *(the one thing from `2026-09-13` that survived)* | **`§0z-T16-B`** |
> | ⚠ **two validation traps, and a granularity result that cuts against the owner's own instinct** | **`§0z-T16-C`** |
> | 🔑 **why "CERTIFIED" never meant "STORED"** *(the distinction that produced `baseline_history`)* | **`§0v`** |
> | 🔑 **the parity rule as the governing document states it** | **`§0u`** |
> | ⚠ **where the baseline's constants ACTUALLY live** *(in Python, not in config)* | **`§0y`② — the SECOND `0y`** |
> | 🔴 **the `oreb` rebuild — five hypotheses, four wrong** | **`§0y`① — the FIRST `0y`** |
> | 🔴 **the third selection-filter failure, and the sanity gate that catches the family** | **`§0y-2`** |
> | ✅ **the calibration checker** — `nba/check_prop_calibration.py` | **`§0y-1`** |
> | **the boundary — what the baseline may and may not see** | **`§1`** |
> | **the five-dimension tiering architecture** | **`§2`** |
> | **the computation, in order** | **`§3`** *(→ `3.7` shrinkage, `3.9b` technique, `3.10b` the as-of leak)* |
> | **the factor layer — lifts and penalties** | **`§4`** |
> | 🔑 **the permanent rules** | **`§5`** *(→ `5.2` three academic cautions, `5.6` out-of-sample is necessary but NOT sufficient)* |
> | ✅ **the certified result** · **what "calibrated" means, and does not** | **`§8`** · **`§9`** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🎯 **A · THE GOVERNING RULES AND THE PARITY QUESTION**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0u`** | 🔑 **THE PARITY RULE as the governing document states it** — and the A5 rejection's actual measurement | 🔑 |
> | **`0z-T17`** | 🔴 **THE CALIBRATION PARITY VIOLATION — found in something ALREADY APPLIED to `38.7M` legs** | 🔴🔴 |
> | **`0z-T16`** | 🔴 **CALIBRATE IN WINDOWS, NOT OVER A FULL SEASON — the owner's directive** | 🔴 |
> | **`0z-T16-B`** | 🔑 **THE PHASE × BAND CALIBRATION LAYER** — the one thing in the `2026-09-13` session that survived | 🔑 |
> | **`0z-T16-C`** | 🔴 **Two validation traps, and a granularity result that cuts AGAINST the owner's own instinct** | 🔴 |
> | **`0v`** | 🔑 **"CERTIFIED" NEVER MEANT "STORED"** — the distinction that produced `baseline_history` | 🔑 |
> | **`9`** | **WHAT "CALIBRATED" MEANS — and does not** | |
>
> ### 🧮 **B · THE COMPUTATION ITSELF**
> | § | what it covers |
> |---|---|
> | **`1`** | **THE BOUNDARY — what the baseline may and may not see** |
> | **`2`** | **THE FIVE-DIMENSION TIERING ARCHITECTURE** *(`T8`)* |
> | **`3`** | **THE COMPUTATION, IN ORDER** |
> | **`3.7`** | **Shrinkage** ⚠ *followed by the stray `h1` described above* |
> | **`3.9b`** | **THE CALIBRATION TECHNIQUE — what to use and what to reject** |
> | **`3.10b`** | ⚠ **THE AS-OF LEAK — a known failure with MLB precedent** |
> | **`4`** | **THE FACTOR LAYER — lifts and penalties** |
> | **`6`** | **THE PERIOD LAYER — where the mixture IS implemented** |
> | **`7`** | **COMBOS — joint structure, never a direct fit** |
> | **`8`** | ✅ **THE CERTIFIED RESULT** |
>
> ### 📏 **C · THE PERMANENT RULES AND THE CAUTIONS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`5`** | **THE PERMANENT RULES** | |
> | **`5.2`** | **Three academic-literature cautions for the calibration loop** | |
> | **`5.6`** | ⚠⚠ **OUT-OF-SAMPLE VALIDATION IS NECESSARY BUT NOT SUFFICIENT** | ⚠⚠ |
> | **`0x`** | 🔴 **Three things the mandated documents did NOT carry** — a leakage rule and two measured priors | 🔴 |
>
> ### 🔧 **D · THE REBUILDS, THE GAPS AND THE CHECKER**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0y`①** | 🔴 **THE `oreb` REBUILD — five hypotheses, FOUR WRONG — and the third selection-filter failure** | 🔴 |
> | **`0y-1`** | ✅ **THE CALIBRATION CHECKER** — `nba/check_prop_calibration.py` *(`T15` pass 2)* | ✅ |
> | **`0y-2`** | 🔴 **The third selection-filter failure — and the SANITY GATE that now catches the family** | 🔴 |
> | **`0w`** | 🔑 **The baseline's THREE PRODUCTION GAPS — named in `T13`, and TWO are now CLOSED** | 🔑 |
> | **`0y`②** | ⚠ **WHERE THE BASELINE'S CONSTANTS ACTUALLY LIVE — in Python, not in config** ⚠ *second section labelled `0y`* | ⚠ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` is what calibration is allowed to be, `B` is how it is
> computed, `C` is what will fool you, `D` is what was rebuilt and what is still open.***
> ⚠ **This file governs the BASELINE only.** *The final hit probability, confidence, score and edge
> live in **`NBA_FINAL_SCORING_CALIBRATION.md`** — and that file's `§0.14-T23` reports that the
> baseline's **tails are too wide**, measured on `1.08 M` legs.* The final scoring engine (final HP, confidence, score) is a separate
document: `NBA_FINAL_SCORING_CALIBRATION.md`.

**Source of truth in code**: `nba/backtest/classification_ladder_v12.py` (now v18) —
*"single source of truth; anchors assert."* Production builders are **patchers** over it.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T4 (methodology), T7 (design + live code), T8 (calibration), T9 (factor layer, periods, combos). |
| **2026-09-21 → 09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `12` commits that this log never recorded.** *T12–T17 material plus the live audits: the leakage rule and two measured priors from T12's tail · §0w the baseline's three production gaps from T13 · **§0u the parity rule as stated** (its four forbids, three requires) · **§0v "certified never meant stored"**, `baseline_history` re-taken live · **§0y/§0y-2 the `oreb` five-hypothesis rebuild** · §0y-1 the calibration checker · **§0z-T16 calibrate in windows, not full seasons** · **§T16.2 the phase × band calibration layer** · §T16.3 per-tier splitting measured HARMFUL · **§T17.2 the calibration parity violation — found in something already applied to 38.7M legs, and fixed**. **Correction in place: LIVE-AUDIT §0v.4 — the PrizePicks archive holds 12 stat types.*** |

---

## 0z-T17. 🔴🔴🔴 **THE CALIBRATION PARITY VIOLATION — found in something ALREADY APPLIED TO 38.7M LEGS, and fixed** *(T17 pass 1, §T17.2; COMPASS fact 100's evidence)*

⚠⚠ **The phase × band calibration layer of §0z-T16-B — the one genuine out-of-sample win of the whole
enrichment effort — was built in violation of the system's own governing rule, and the violation was
found only when the author re-read the COMPASS in full on the owner's order.**

> **COMPASS fact 6**: *"**one fixed recipe; every value is computed IN-RUN from history AS OF THE DAY.
> NOTHING PASTED.**"* · **`NBA_DAILY_PARITY_AND_BACKFILL.md` §5**: *"**no constant is carried between
> days.**"*

🔴 ***"My `ladder_calibration` table breaks this. It was FITTED ON 2024-25 and APPLIED TO 2025-26 — a
pasted table from a fixed train season. That's fine as a research measurement, but **it does not
'stand for any day'**: on a 2024-25 date it would be applying corrections fitted from **that same
season's data — LEAKAGE** — and on opening night 2026-27 it would be applying **two-year-old
constants**."***

🔑🔑 **THE TWO FAILURE MODES ARE DIFFERENT AND BOTH MATTER**: **on a REPLAY of a training-season date it
LEAKS THE FUTURE**; **on a FORWARD date it applies STALE CONSTANTS.** ⚠ *A table that is merely "fitted
elsewhere" is not obviously wrong — it becomes wrong the moment the formula is asked to stand for **any**
day, which is precisely the standard fact 5 sets.*

### ✅ THE FIX — `nba_score.ladder_calibration_asof` (`nba/build_asof_calibration.py`)

**For any game-day `d`, the correction cell is computed from graded legs STRICTLY BEFORE `d`**,
expanding as the season progresses, **at a weekly cadence**, with **the prior season's SAME-PHASE cell
inherited until current-season evidence exists**.

| Season | source | cells | refits | avg shift |
|---|---|---|---|---|
| 2024-25 | own evidence | 3,383 | 23 | 0.1386 |
| 2025-26 | own evidence | 3,432 | 23 | 0.1437 |
| **2025-26** | **prior season (inherited)** | **2,762** | 21 | 0.1571 |

✅ **THREE THINGS VERIFY IT**: **2024-25 carries ZERO inherited cells** — *"it's the first season, so
there's nothing to inherit. Exactly right"* — **2025-26 carries 2,762**, and **shift magnitudes are
stable across seasons (0.1386 vs 0.1437)**, *"so the correction is a stable property of the ladder
rather than a season-specific artifact."* 🔑 **And the engine takes the latest cell at or before each
leg's game date — never a future one.**

🔑🔑 **AND IT DOES MORE WORK, NOT LESS — which is the strongest evidence the pasted version was wrong**:
**rebounds moves `0.01516` under the as-of cells against `0.00405` under the pasted table — roughly
3.7×** — *"because they're fitted on the RELEVANT PRIOR EVIDENCE rather than one blanket season."*

✅✅ **THE PAYOFF IS THE OPENING-NIGHT PROPERTY**: *"**the formula now stands for ANY day**: replay a past
date and it uses only what was gradeable before it; run it live mid-season and it's the same code path;
**run it opening night and every cell inherits the prior season's same-phase value.**"* 🔑 **The 2,762
inherited cells are that mechanism made countable — and they are why §0z-T16-B's phase pattern
transfers to 2026-10-20 without a month of warm-up.**

### ⚠⚠ **AND THE SAME VIOLATION WAS COMMITTED AGAIN, HOURS LATER, IN THE CONFIDENCE TIERS**

*The confidence tier cutpoints were hardcoded at **0.35 / 0.55 / 0.75**.* 🔴 **COMPASS fact 6 names
*"tier cutpoints"* EXPLICITLY in its list of values that must be computed in-run with nothing pasted**
— *"my hardcoded cuts are exactly the violation that fact names — **the same class of error as the
pasted calibration table I just fixed.**"* ✅ **Fixed the same way: equal-mass quantiles derived in-run
from the live distribution, with a degeneracy guard.** 🔑 **Two instances of one rule in a single
session, and the second was recognised only because the first had just taught the pattern.**

### ✅ **AND FACT 5a WAS CONFIRMED IN PASSING, ON 2.1M LEGS**

*Every confidence tier landed **within 0.6 percentage points** of its stated rate — "the fact-5a
standard comfortably met".* ⚠ **It is fact 5's SECOND half — *"confidence bands that hit their stated
rate"* — that had never been tested at all, and testing it is what began the confidence rebuild**
*(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T17-B)*.

---

## 0z-T16-C. 🔴🔴 **TWO VALIDATION TRAPS AND A GRANULARITY RESULT THAT CUTS AGAINST THE OWNER'S OWN INSTINCT** *(T16 pass 2, §T16.3, from COMPASS facts 97–98 — migration items, **0 of the twelve**)*

### 🔴🔴 1 · **PER-TIER SPLITTING IS *HARMFUL* — and the owner has repeatedly asked for more granularity**

*N1 v3 (`nba/fit_n1_model.py`, config `availability_model_n1v3_2026_09_15`) is four layers —
**hierarchical prior → LightGBM → log-odds stack → confident bands**. Its ablation, on **1,322
held-out Questionables**:*

| Variant | Result | |
|---|---|---|
| **pooled + player-history** | **conf 4.1% @ 79.6%** | ✅ **SELECTED** |
| pooled-base | 2.8% @ 70.3% | |
| 🔴 **per-tier splitting** | **AUC 0.62 → 0.59** | ❌ **HARMFUL** |

🔑 ***"~1,300 rows split three ways OVERFITS — and the POOLED MODEL ALREADY SPLITS ON ROLE."*** ⚠⚠
**RECORD THIS AGAINST THE OWNER'S STANDING INSTRUCTION** *(`NBA_SYSTEM_DESIGN.md` §0z §6: "more
complex, more granular… break in tier, make it more granular")*: **granularity is not free, and here
it is measurably negative.** 🔑 **The reconciliation is in the finding itself — the pooled model
already carries the split the tiers would add, so splitting again spends sample on information the
model has. That is the same redundancy argument that closed the enrichment factors, applied to model
STRUCTURE rather than to features.**

✅ **AND THE SELECTION CRITERION IS UNUSUAL AND DELIBERATE**: ***"Selection is on CONFIDENT-BAND YIELD,
not log-loss"*** — *"because the model's job is **actionable calls**, and everything else routes to
the scenario layer."* 🔑 **A model chosen for how much it can say CONFIDENTLY rather than how well it
scores on average — which only makes sense because a second mechanism absorbs what it declines.**

⚠ **Two supporting facts recorded**: **rule-based features from the official policy earn their place**
*(early-tip deadline 8–10am vs 11am–1pm, the road Out/Doubtful restriction, hours-to-tip)*; and
🔑 **fringe players are genuinely predictable (66.1% accuracy) while STARTERS ARE NOT (57.1%)** —
*the inverse of where the value sits, and the reason the scenario layer exists at all.*

### 🔴🔴 2 · **TWO TRAPS, BOTH GENERAL**

**(a) 🔴🔴 THE FINAL STATUS IS THE *ANSWER*, NOT THE FEATURE.** *"Filtering on the last snapshot's
status returned **7 rows from 2,000+ Questionables**, because **by then almost all have resolved**."*
✅ **The rule: READ THE STATUS AT THE DECISION CUTOFF.** ⚠⚠ **This is a LEAKAGE trap wearing a
sample-size disguise** — *the symptom is an absurdly thin result set, not a suspiciously good score,
which is why it is catchable.* 🔑 **Same family as §0y-2's selection filters: a join that silently
conditions on the outcome.**

**(b) 🔴 NEVER CHANGE TWO VARIABLES AND ATTRIBUTE THE RESULT TO ONE.** *An earlier run **added player
history AND split per-tier**, then **blamed the split without evidence**. The ablation — now
persisted to `factor_gate_results` — showed **the split was indeed harmful BUT the feature was
HELPFUL**, ***"which the confounded test could not have established."*** 🔑 **The confounded test
reached the right verdict on one variable by luck and would have discarded a useful feature with it.**

⚠ **Recorded alongside §0y-2's SANITY GATE and §0z-T16-B's `team_game_no` mislabelling**: **four
distinct validation defects in two sessions, and every one was caught by a diagnostic or an ablation
placed BEFORE the result was read — never by inspecting the result itself.**

---

## 0z-T16-B. 🔑🔑🔑 **THE PHASE × BAND CALIBRATION LAYER — the ONE thing in the 2026-09-13 session that beat the baseline out-of-sample, and it wins by CORRECTING the baseline rather than competing with it** *(T16 pass 1, §T16.2)*

⚠⚠ **Read this against §0z-T16 below**, which carries the owner directive that produced it — *"consider
WINDOWS instead of a full-season comparison… different times will have different variances."* **This
is the measurement that answered it.**

### ✅ THE RESULT — **fitted on 2024-25, applied to 2025-26, held out**

| | log-loss | Brier |
|---|---|---|
| raw ladder | 0.6349 | 0.2215 |
| **phase × band calibrated** | **0.6281** | **0.2187** |
| **gain** | **+0.0068** | **+0.0028** |

*on **105,663 points legs**.* 🔑 ***"That's the first thing tested today that BEATS the baseline on
held-out data — and it does it by CORRECTING the baseline rather than COMPETING with it, which is the
lesson the whole session pointed at."*** ⚠ **The transcript flags its own comparability trap**: *"the
raw ladder scores 0.6349 here versus the 0.7150 I measured earlier on the points-only anchor test.
**DIFFERENT POPULATIONS** — this covers the whole tiered ladder across all bands, that one covered
board-matched points legs at offset 0 — **so the numbers aren't directly comparable, and I don't want
to imply the correction closed that gap.**"*

### ✅ EXTENDED TO 8 PROPS — **621,684 legs, EVERY ONE IMPROVED, out-of-sample**

| prop | legs | raw | calibrated | gain |
|---|---|---|---|---|
| **pra** | 92,829 | 0.6646 | 0.6566 | **+0.0080** |
| pts+ast | 72,353 | 0.6360 | 0.6290 | +0.0070 |
| pts+reb | 84,176 | 0.6360 | 0.6300 | +0.0060 |
| points | 105,663 | 0.6349 | 0.6291 | +0.0058 |
| assists | 62,881 | 0.5739 | 0.5700 | +0.0039 |
| rebounds | 78,613 | 0.5831 | 0.5798 | +0.0033 |
| reb+ast | 78,259 | 0.6229 | 0.6196 | +0.0032 |
| **threes** | 46,910 | 0.5638 | 0.5623 | **+0.0015** |

🔑🔑 **THE ORDERING IS THE FINDING — combos gain MOST, single low-count stats LEAST**: *"a combo sums
three noisy counts, so **its ladder accumulates more distributional error for the calibration to
correct**, while a threes ladder is already close to its true shape."* ✅✅ **AND IT DOVETAILS WITH THE
RELIABILITY AUDIT EXACTLY** *(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §8)*: **combos carry the
LOWEST raw lift (pra 7.5%) and the HIGHEST calibration gain (+0.0080).** 🔑 ***The baseline projects
them worst, and the correction recovers most there*** — two independent measurements agreeing on
where the combos' weakness lives.

### 🔴🔴 THEN THE SCOPE COLLAPSE — **and the owner's "test ALL prop lines every time" is what exposed it**

⚠ **First the coverage gap**: **`board_tiers` covers only 12 markets** — *PrizePicks offers
goblin/demon tiers on those 12 only.* **The other 18 props — `fga`, `ftm`, `dreb`, `fantasy_score`,
`double_double` and the seven period props — have NO TIER ROWS AT ALL**, so they cannot be calibrated
through this path. *And `steals`, `blocks`, `turnovers`, `stocks` have tiers (3.9k–8.1k rows) but fell
under the 1,500-leg test minimum after the joins — **thin, not broken.*** 🔑 ***"The remaining 18 props
need a DIFFERENT calibration path — keyed on the STANDARD BOARD LINE rather than tier. That's not a
variation of this test; it's a SECOND PATH."***

🔴🔴 **THEN THE ALL-30 RUN CAME BACK ESSENTIALLY NULL, AND IT CONTRADICTS THE TIER RESULT**:

| | |
|---|---|
| props improved | **6**, all by **+0.0001 to +0.0002** |
| props unchanged | 11 |
| **props made WORSE** | **13**, including **points −0.0007** and **pts+ast −0.0011** |

⚠ ***"The difference is the POPULATION: that test covered only BOARD-MATCHED legs at real PrizePicks
lines (~100k per prop); this one covers EVERY RUNG of the full ladder (~900k per prop, anchor ±10)."***
🔑🔑 **THE MECHANISM, and it is the governing scope rule**: ***"the correction works WHERE THE BOARD
ACTUALLY OFFERS LINES, and does NOTHING across the full ladder — because most ladder rungs are far
from the anchor, sit at EXTREME PROBABILITIES where there's no room to correct, and SWAMP the middle
bands where the miscalibration lives."***

🔴 **SO THE CALIBRATION SHIPS SCOPED TO BOARD-OFFERED LINES. "Applying it everywhere is
NEUTRAL-TO-HARMFUL."** ⚠ **And the self-correction is recorded**: *"my '621,684 legs all improved'
framing was right for its population but **I let it imply general applicability**. Testing all 30
props across the full ladder — **which you insisted on** — is what exposed that."* 🔑 **A second
instance, four days after §T15.2a's, of the same class: a figure correct for its population and wrong
the moment the population is left implicit.**

### 🔴🔴 WHAT THE LAYER ENCODES — **two measured regularities, both with mechanisms**

**Cells are keyed `prop × kind × tier × phase × band × direction`, with a SHRINKAGE FALLBACK HIERARCHY
so thin cells fall back rather than inject noise** — stored in **`nba_score.tier_band_calibration`**.
*Direction is a cell dimension because **"over and under on the same ladder can be wrong in OPPOSITE
directions"**.*

**① THE GOBLIN LADDER'S SLOPE ERROR** — 🔴 **under-confident at LOW probabilities, over-confident at
HIGH ones**: *goblin t-2 at model **0.318** actually hits **0.622** (**+30 points**); at model
**0.877** it hits **0.746** (**−13 points**). **"The same inversion appears across every tier."***

**② THE PHASE DECAY** *(calendar-anchored)*:

| Phase | legs | model | actual | **gap** |
|---|---|---|---|---|
| **1 — Oct–Nov** | 33,685 | 0.4604 | 0.4750 | **+1.46 pp** |
| 2 — Dec → All-Star break | 63,561 | 0.4568 | 0.4699 | +1.30 pp |
| 3 — post-ASB | 22,983 | **0.4440** | 0.4528 | +0.88 pp |
| **4 — push (mid-Mar+)** | 25,920 | 0.4550 | 0.4563 | **+0.13 pp** |

🔑 **The model is UNDER-confident early and essentially calibrated by the playoff push.** ✅ **And the
post-ASB regime shows in the MODEL'S OWN OUTPUT, not only in outcomes — its average probability drops
to 0.4440, the lowest of any phase**: *"it's already anticipating reduced production after the break,
consistent with the research that heavy-minutes players slow down post-break."* 🔑 **The push phase is
where the model is SHARPEST (+0.13), which is counterintuitive given the rest-management noise** —
*"by March the empirical cells have a full season of current data, and that outweighs the added
chaos."*

### ⚠⚠ THE FIRST PHASE SPLIT WAS MEASURING SOMETHING ELSE — **and it was caught, not shipped**

*A game-count split reported a much larger effect — **+5.05 / +2.76 / +1.15 pp** across games 1–15 /
16–60 / 61+.* 🔴 **It was wrong, and the transcript diagnoses it precisely**: ***"my `team_game_no`
counts a player's OWN APPEARANCES, not team games, so a player who missed time is classified as
'earlier' than his team actually is"*** — **putting returning-from-injury players in the "early"
bucket all season, which is exactly where the model is most conservative.** ✅ ***"The CALENDAR version
measures the SEASON REGIME; the game-count version was measuring something else AND MISLABELLING
IT."*** 🔑 **A label that names a different quantity than the column computes — the same family as
§T15.2f's selection filter, caught by a sanity check rather than by inspection.**

### ✅ THE PHASE BOUNDARIES ARE RESEARCH-BACKED, AND THE FIRST SPLIT MISSED THREE OF THEM

*Four independent sources converge* — ⚠ *and the sweep records the boundaries the original
three-phase split **missed entirely**:* **the ALL-STAR BREAK is a genuine regime change** *("underdogs
win more post-All-Star break as playoff teams rest stars"; "players who log heavy minutes through
December tend to slow down post-break")* · **the TRADE DEADLINE (early Feb) resets roles through
roster churn** · **the FINAL STRETCH SPLITS IN TWO** *("teams with something to play for elevate their
effort; teams with nothing to play for rest their stars and coast", plus "tanking teams with winning
records who stop competing once their seed is locked")* · **Oct–Nov confirmed soft** *("lines are
softer because books are still calibrating to roster changes, new coaching systems")*.

### 🔑🔑 AND IT TRANSFERS TO A NEW SEASON — **which is the whole point**

> ***"It's CALENDAR-ANCHORED, so opening night 2026-27 inherits October's correction WITHOUT NEEDING A
> MONTH OF DATA FIRST… The model can't know 2026-27 rotations, but it can know that THE FIRST FIFTEEN
> GAMES BEHAVE LIKE THE FIRST FIFTEEN GAMES."***

✅ **That is the direct answer to the owner's *"be ready for it in the new season"*** *(§0z-T16 below)*
⚠ **and it is season-critical: the opener is 2026-10-20, and Phase 1 is where the model is LEAST
calibrated (+1.46 pp).** 🔑 **Also recorded as the shape of a correct change**: *"a single season-wide
correction is wrong — it would OVER-correct late-season legs and UNDER-correct early ones."*

---

## 0z-T16. 🔴🔴 **CALIBRATE IN WINDOWS, NOT OVER A FULL SEASON — the owner's directive, and it is the missing justification for `f_phase`** *(T16 pass 0, §T16.1, 2026-09-13; **0 of the twelve, 0 of the thirty**)*

> ***"Now THAT is the kind of calibration we need. You may also need to consider **WINDOWS instead of a
> full-season comparison**, because **the BEGINNING of the season is less predictable**, [and at] **the
> END of the regular season there will be more MINUTE SAVINGS in stars**, and so on. **Different times
> will have different variances**, and the system should be able to **IDENTIFY, UNDERSTAND and TRACK
> THE PATTERNS** and be ready for it in the new season."***

🔑🔑 **THIS IS THE OWNER-SIDE JUSTIFICATION FOR A FACTOR THE SWEEP HAS FLAGGED AS ORPHANED.** ⚠ **Open
item O6** *(`NBA_SWEEP_RUN_LOG.md`, §T9.38a)* records that **`build_confidence_v3.py`'s `f_phase` is
computed, carries a six-line justification with measured figures — *"the gap decaying +1.46 / +1.30 /
+0.88 / +0.13 pp across those four"* — and is NOT IN THE CONFIDENCE SUM**, whose nine weights total
exactly 1.00. **O6 asks whether `f_phase` should enter the sum and notes the sweep could not find the
design intent.** ✅ **Here it is: the owner asked for exactly this, in these terms, on 2026-09-13.**
⚠ **That does not answer O6** *(whether to renormalise nine weights is still a code change this sweep
does not make)*, **but it removes the possibility that `f_phase` is a stray experiment — it is a
requested capability, currently computed and unused.**

🔴 **AND O6'S URGENCY CLAIM IS THE OWNER'S OWN POINT BACK AT HIM**: O6 records that **`1_oct_nov`
carries the LOWEST reliability rank (0.80)** and **the season opens 2026-10-20** — *the regime the
factor was written to discount is the one the system is about to enter* — which is precisely the
owner's *"the beginning of the season is less predictable."*

⚠ **The two named patterns are asymmetric and both are testable**: **early season — less predictable**;
**late regular season — more MINUTE SAVINGS in stars** *(i.e. a minutes-distribution shift, which
lands on `proj_min` and therefore on the baseline, not on confidence)*. 🔑 **So the directive is not
one factor's justification — it asks for a SEASON-PHASE treatment in BOTH layers**, and **NOT
RECORDED** is whether the late-season minutes-savings effect is modelled anywhere.

✅ **AND THE TRANSFERABLE DEMAND**: *"be ready for it in the NEW SEASON"* — **the system is expected to
carry the learned phase patterns FORWARD**, which is a different requirement from fitting them
in-sample on two completed seasons.

---

## 0y. 🔴🔴 **THE OREB REBUILD — FIVE HYPOTHESES, FOUR WRONG — AND THE THIRD SELECTION-FILTER FAILURE** *(T15 pass 1, §T15.2c/§T15.2f, written 2026-09-22 from the 2026-09-12/13 transcript)*

*This section exists because of one owner turn. **OREB had been DROPPED** — excluded from the history
table after failing certification at **−21.2 pp** on its worst band — and the owner refused it:*

> 🔑🔑 ***"you're right — dropping a prop the board offers is a COVERAGE HOLE, not a solution."***
> *(the assistant, restating)* — **"NO, do not just reject. FIX IT: granulated, break in tier, figure
> it out, research, debug, test, simulate. WE CAN'T JUST BE DROPPING IMPORTANT PIECES."** *(owner)*

⚠ **The result is the transcript's largest technical arc, and four of its five hypotheses were wrong.**

### 🔴 THE FIVE HYPOTHESES, IN ORDER, EACH KILLED OR KEPT BY A HELD-OUT GATE SET IN ADVANCE

| # | Hypothesis | Result | Verdict |
|---|---|---|---|
| **1** | **`shift_lambda` 0.5** — matching the certified low-count props *(blocks, steals, ftm)*, *"because full parametric ordering overshoots on zero-inflated stats"* | **2025-26: −21.2 pp → −2.5 pp** *(borderline)*; **2024-25: +4.3, +5.7, −3.2 pp** | ❌ **FAILS THE TWO-SEASON RULE** — *"a large improvement… but it is NOT A FIX"* |
| **2** | **THE OPPORTUNITY BASIS** — the canonical `ORB% ≈ ORB / (FGA − FGM)`, *"offensive rebounds over available opportunities"*, which the literature explicitly names per-36 as wrong for | **moved bias by ~0.02 — essentially nothing** | ❌ **REJECTED ON EVIDENCE DESPITE BEING THE LITERATURE'S ANSWER** |
| **3** | **Minutes-tier shrinkage** *(shrink toward role-tier peers)* | **FLIPPED THE BIAS SIGN AND AMPLIFIED IT** — high band `+0.241` → **`−0.658`** at k=20 | ❌ **MADE IT WORSE** |
| **4** | **ARCHETYPE shrinkage — group by DEFENSIVE-REBOUND RATE, not minutes** *(Gemini's correction)* | worst-band bias **0.241 → 0.141**, low end **−0.108 → +0.016** | ✅ **WORKS — 41% better** |
| **5** | **k sweep** | **k≈3–5: worst-band bias 0.241 → 0.045 (81%), MAE best at the same setting, MONOTONE in k** | ✅✅ **SOLVED AT THE MEAN LEVEL** |

🔑🔑 **THE TRANSFERABLE MOVE, and the reason #3 failed where #4 succeeded** — *Gemini's critique,
which the transcript credits by name:* **"shrinking toward a MINUTES-based role tier is wrong because
'starter' mixes a crash-first CENTER with a WING who never touches the offensive glass. The group has
to be an ARCHETYPE, not a minutes bucket."** ✅ **And the non-circular part is the whole trick:**

> ***"define the archetype by DEFENSIVE REBOUND RATE — correlated with size and role but NOT the
> target, so the grouping DOESN'T LEAK."***

⚠ **Shrink toward an archetype prior defined by a variable correlated with the target but not the
target itself, with LIGHT shrinkage.** *Likely applicable to other bursty, zero-inflated low-count
stats — the transcript says so explicitly and does not claim to have tested it elsewhere.*

### ✅ WHERE IT MAPS IN THE RECIPE — **the structure was already right; the PARAMETERS were wrong**

*`shrunk36 = (n·rate36 + k·tier_prior) / (n + k)`* — **the recipe already shrinks toward a tier prior.**
The two defects were: **`k_stab` for oreb was 60 — the heaviest prior of any prop — where the sweep
says ≈4**, and **the prior was ROLE-TIER-based where it should be ARCHETYPE-based.** *Only the `k`
change was implemented in this transcript* *(`k_stab` 60 → 4, both seasons rebuilt, **556,277 rows**)*.

### ⚠⚠ AND IT STILL DID NOT CERTIFY — **the residual is DISPERSION, not bias, and the signature says so**

*After k=4 the worst bands were **+4.8 and +4.1 pp** against the 2.5 pp threshold. **But the pattern
changed in a way that decides the diagnosis:*** the bias is **no longer monotone across bands** —
*"+0.9, +4.8 on the more side and −3.5, +0.3, −2.6, +1.1, +4.1, −0.7, −1.1, +1.1 on the less side —
**ALTERNATING SIGN, largest errors in the THINNEST bands (744 and 1,436 rows)**."*

> 🔑 ***"that's the signature of NOISE, not bias. the systematic compression i fixed is gone; what's
> left is the DISTRIBUTION being wrong in the tails of a bursty, zero-inflated count."***

🔴 **THE OPEN ITEM, scoped and named**: *"the negative-binomial dispersion for oreb is fitted
**GLOBALLY**, and for a stat where a player's outcome is 0, 0, 0, 4, **a single global shape can't
serve both the bench and the crashers**. **Per-cell dispersion would move it to certified.**"* ⚠
**At a 0.1 pp cost it is not urgent** *(see `NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §6 for the
penalty)* — **but it is the one thing standing between oreb and certification.**

⚠ **AND THE ALTERNATING SIGN IS WHY THE PENALTY WENT ON CONFIDENCE, NOT ON THE PROBABILITY**:
*"the errors alternate sign (+4.8, −3.5, −2.6, +4.1), so **shrinking probabilities toward 0.5 would
fix some bands and BREAK others**. What's actually true is that we're **less certain** about any oreb
leg than a certified one."* 🔑 **A penalty belongs where the deficiency is — and an alternating-sign
error is an uncertainty defect, not a directional one.**

### 🔑 WHY OREB FAILS WHERE REBOUNDS PASSES — the mechanism, stated

*The expanding-mean rate estimator **regresses everyone toward the league average**, so the spread of
predictions is too narrow — low-anchor players under-predicted by **0.11**, high-anchor players
over-predicted by **0.25**.* ⚠ ***"offensive rebounding is far more CONCENTRATED BY ROLE than total
rebounding, so compression hurts it much more."*** ✅ **That is also why the failure was band-specific
from the very first run** — *"it isn't about opportunity at all, it's about the rate estimator
compressing the distribution of players."*

---

## 0y-1. ✅ **THE CALIBRATION CHECKER — `nba/check_prop_calibration.py`** *(T15 pass 2, §T15.3b — migration item: 3 of the thirty, **0 of the twelve** before this)*

**`nba/check_prop_calibration.py`, maintenance task `calibration`.** **Any prop in
`nba_score.baseline_history` is graded against the box scores BY CONFIDENCE BAND, from stored data.**

🔑🔑 **THE HOLE IT CLOSES** — *the transcript's own words:* ***"until now, a prop's verdict existed
ONLY in an ephemeral run output."*** *The oreb verdict could not be re-read because the run had
scrolled out of the workflow list — and the fix was not to retrieve the log but to make the log
unnecessary:* **"I don't need its log — I can check calibration directly from the data, and that's a
more useful tool anyway since it works for ANY prop in the history table."**

✅ **VALIDATED AGAINST A KNOWN-CERTIFIED PROP BEFORE IT WAS TRUSTED** — `points`, **459,721 graded
rows: worst band 0.8 pp on more, 0.9 pp on less**, every band within a point. 🔑 ***"That confirms
the checker REPRODUCES THE CERTIFICATION STANDARD INDEPENDENTLY, from stored data"*** — *i.e. the
tool was calibrated against the harness it replaces, rather than asserted to agree with it.*

⚠ **Paired with the RELIABILITY SCORER** *(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §7)*: **the
checker answers "does THIS prop calibrate"; the scorer puts EVERY prop on one ruler so penalties are
derived.** *Together they are what moved ten props from "no verdict at all" to measured.*

---

## 0y-2. 🔴🔴 **THE THIRD SELECTION-FILTER FAILURE — and the SANITY GATE that now catches the family**

⚠⚠ **Three bugs in one session, each producing CONFIDENT-LOOKING BUT INVALID results, and each caught
by a diagnostic that was in place BEFORE the output was read.** *The transcript names this as its own
durable output: **"that gate is the durable output of this round, since it will catch the same class
of error in every factor still to come."*** *(The gate itself is on file — COMPASS fact 77; **what is
new here is the three-bug census and the diagnostic line that caught each one.**)*

| # | The bug | **The diagnostic that caught it** | What it would have produced |
|---|---|---|---|
| **1** | **B4 v2's exposure scoping was LEAGUE-WIDE** — *"a player's historical defenders include everyone he's faced across the whole season — players on other teams entirely. **they're all 'missing' tonight because they were never going to play.**"* | 🔑 **`share of exposure missing = 0.934`** — *"the code thinks **93%** of each player's historical defender exposure is unavailable. **that's impossible.**"* | **spurious betas +0.14 to +0.22** and a recorded opponent effect that does not exist. *After the fix the sample **doubled to 4,526 rows** and the betas collapsed to −0.056…+0.029.* |
| **2** | **The rotation-split `base_min` join was a SELECTION FILTER** — the rolling baseline is computed from **game logs, which contain only games the player ACTUALLY PLAYED**, so *"attaching `base_min` to a report row only succeeds when the player appeared; **every row where he sat gets NaN and drops out of BOTH splits**"* | 🔑 **every split showed `p_plays = 1.000`, including questionable at 530 cases — against an unsplit 0.503** | **both buckets conditioned on having played, which forces the rate to 1.0 BY CONSTRUCTION.** *"A **selection filter disguised as a feature** — the same family of error as the earlier panels, and **exactly what the split was meant to test for**."* |
| **3** | **The baseline vanished on non-appearances** *(the same root, as a feature-coverage defect)* | coverage of report rows | fixed by computing the baseline from **the team's ROSTER HISTORY**, *"which exists whether or not the player suited up"* → **attaches to 71.2% of report rows** and the 0.828 "available" anomaly resolves as **deep-bench DNPs, not scratches** |

🔑🔑 **THE GATE, as specified**: *"the test should **REFUSE TO REPORT VERDICTS if the feature is
degenerate**, which is what would have caught v2 before I read its output."* ✅ **It is not a warning —
it suppresses the verdict.** ⚠ **And the transcript is explicit that the headline N1 numbers were NOT
affected**, because they *"don't use `base_min` at all and are measured against the full report
population"* — *the separation of what survived a bug from what did not, stated at the time.*

### ⚠ THE SAME FAMILY, EARLIER IN THE SAME TRANSCRIPT — **five retracted absence panels**

*Before the allocator worked, **five attempts at the absence panel were built and retracted**, each
failing the **conservation gate** *(the redistributed shares must sum to ~1.0)* for a different
surface reason but **one underlying one**. Three were missing-receiver variants — a **minutes floor**,
a **pair-games threshold**, and an **API 2,000-row cap**.* 🔴 **And the headline they produced was
retracted with it**: *the **"+17.5% usage redistribution"** finding* —

> ***"a SYSTEMATIC ESTIMATOR BIAS REPLICATES PERFECTLY; two-season agreement proves STABILITY, not
> CORRECTNESS."***

⚠⚠ **That is a standing caution against the corpus's most common validation move.** ✅ **The allocator
that finally passed** predicts minutes from roster state: **MAE 4.609 vs recent-5's 4.875**, and
**conservation 0.9930** — *the gate the five failures could not clear.* *Counterfactual multipliers
graded by role: **deep bench 1.265 → starters 1.222**.*

### 🔑 THREE RESEARCH-DRIVEN STRUCTURAL CORRECTIONS, recorded because each changed the model's SHAPE

| | The correction | Why |
|---|---|---|
| **1** | **The 240-minute constraint** *(FiveThirtyEight's rank-ordered depth chart)* | redistribution must **conserve**, not inflate |
| **2** | **Rate is a DEPENDENT VARIABLE, not a free multiplier** | *the reason the rate response was later rejected as double-counting* |
| **3** | **Selection bias — fit ONLY on PRE-GAME RULED-OUT absences** | in-game injuries and rest days are different populations |

⚠ **And the finding that cancelled an entire planned pivot** — *Gemini's, and the transcript acts on
it immediately*: **for PRE-GAME RULED-OUT prediction the control is *games where X did not play at
all*, NOT within-game stints** — *which removed the play-by-play dependency from the factor's path.*

### ✅ THE ENRICHMENT CONTRACT THE ROUND WAS BUILT ON — **components, never the probability**

> 🔑🔑 ***"enrichment adjusts the baseline's COMPONENTS — projected minutes, per-minute rate,
> dispersion, `p_plays` — and NEVER the probability itself."***

*Residual cells are keyed **`prop × direction × anchor band × role tier × factor tier`**, and the
double-count discipline is structural rather than aspirational:* **"anything the baseline ALREADY
CARRIES contributes ~1.0 and drops out."** ✅ **VERIFIED that the baseline exposes those components**:
`proj_min` = role minutes × blowout mixture × role multiplier with the return ramp; `rate36` = EWMA
per-36 with carryover; **`proj_mean = proj_min × rate36 / 36`.** 🔑 **This is why A2 could ship as a
MINUTES MULTIPLIER while its rate response was rejected — the contract made the two separable.**

---

## 0x. 🔴 THREE THINGS THE MANDATED DOCUMENTS DID NOT CARRY — **a leakage rule and two measured priors**
*Recorded 2026-09-21 (T12 pass 1, §T12.2c). **Transcript `2026-09-11-21-01-23`, tail segments 568,
604.** Each probed against the baseline `c5798146` with positive controls (`pdfplumber` 8 of thirty,
`absence_prior_measured` 2) and every hit opened — rules 20, 22, 26, 28.*

### 🔴 1 · END-OF-SEASON TABLES ARE DEMOTED TO CROSS-CHECKS — **"they leak the future"**
***The parity rule, stated by the owner and implemented in one module***: **every enrichment backfill
must be the SAME object the daily mining produces — train = live — with `nba/nba_asof.py` as the
single as-of rule set**, and ***end-of-season tables leak the future, so they are cross-checks
only.*** **What replaces them: weekly as-of snapshots, 25 per season × 3 seasons, for `pt_defend`,
`hustle` and `clutch`.**
🔴 ***This is in FOUR non-mandated documents and ZERO of the twelve*** — `NBA_COMPASS.md`,
`NBA_DAILY_PARITY_AND_BACKFILL.md`, `NBA_LESSONS_LEARNED_FROM_MLB.md`, `NBA_PROJECT_LOG.md` — **all
four saying the same thing, so the rule is well established and simply never entered the mandated
set.** 🔑 **It belongs here because it is a LOOK-AHEAD LEAKAGE constraint on every calibration in
this document**: *a factor built from a season aggregate and sliced per date is trained on
information the live pipeline will not have, and the better number it produces is the symptom*
*(the same class as §4b's `.shift(1)` leakage guard)*.

### 🔴 2 · THE ABSENCE PRIOR, MEASURED ON OUR OWN DATA — **and it reverses the folklore**
**Config key `absence_prior_measured`, n = 59,785**: **base 10.4% · back-to-back 13.5% · stars (33+
minutes) on the road on a b2b 17.6%** — and 🔑 ***a prior night of ≥ 38 minutes LOWERS b2b absence,
which is the opposite of the "heavy minutes → rest risk" folklore.*** **"Folklore reversed."**
⚠ **`n = 59,785` and the phrase are in ONE document — `NBA_PROJECT_LOG.md` — and 0 of the twelve.**

### 🔴 3 · PRIMARY DEFENDER QUALITY (`m1`), MEASURED — **elasticity 0.39**
**Config key `primary_defender_quality_measured`**: **toughest quintile −5.5% · easiest +6.7% ·
elasticity 0.39 · high scorers −9.5%.** ⚠ **In three of thirty** *(`NBA_COMPASS.md`,
`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`, `NBA_PROJECT_LOG.md`)* **and 0 of the twelve.**

⚠⚠ **Stated at evidence strength**: *these are the transcript's own reported measurements, recorded
here because the mandated set did not carry them.* **They are NOT re-derived live by this pass —
`absence_prior_measured` and `primary_defender_quality_measured` are config keys, and re-deriving
them from the game logs is a separate job.** **A dated STATE** *(O9)*.

---

## 0u. 🔑🔑 **THE PARITY RULE AS THE GOVERNING DOCUMENT STATES IT — and the A5 rejection's actual measurement**
*Recorded 2026-09-22 (T14 pass 2, §T14.3c). **Source: `NBA_DAILY_PARITY_AND_BACKFILL.md` §§1, 5, 6 —
an owner directive of 2026-09-11, read in full for the first time by this sweep.** Probed against the
twelve, pinned 2026-09-22T09:03:53Z.*

> **THE RULE**: *"**Every daily factor must be backfilled DAY BY DAY, producing exactly the object the
> live pipeline would have produced ON THAT DAY, from ONLY the information available at that day's
> cutoff.** This applies to the baseline and to the enrichment layer equally. **Without it there is no
> realistic back data — a backtest built on anything else is measuring a world that will never
> exist.**"*
> *"It is not enough that a factor EXISTS for a past date. It must have been **CONSTRUCTED THE SAME
> WAY, at the same cutoff, with the same inputs and THE SAME FALLBACKS** as the live run."*

### 🔴 WHAT IT FORBIDS — *four, and each names a real temptation*
1. **Building a factor once over a whole season and slicing it per date** — *"season aggregates leak
   the future."*
2. **Using any end-of-season table, final roster, or post-game truth as an input to a past day.**
3. **Using data that exists today but was not published before that day's cutoff.**
4. 🔑 **Filling a gap with a later value *"because the value barely changes."***

### ✅ WHAT IT REQUIRES — *and the third is the one nobody expects*
1. **One value per `(factor, entity, DATE)`, produced by the same code path as production.**
2. **The cutoff recorded WITH it, so it can be audited.**
3. 🔑🔑 ***"Where the live pipeline would FALL BACK (missing report, thin sample), the backfill FALLS
   BACK THE SAME WAY — a backfill that is MORE COMPLETE THAN PRODUCTION IS AS WRONG AS ONE THAT IS
   LESS."*** *(`more complete than production`: **0 of the TWELVE**.)*
⚠⚠ ***The third inverts the usual instinct.*** **A backfill that quietly succeeds where production
would have fallen back produces a backtest the live system can never reproduce** — **and it fails in
the flattering direction, which is why it survives review.**
🔑 **And the consequence is stated as a completion test**: ***"NO FACTOR IS 'DONE' UNTIL ITS
DAY-BY-DAY BACKFILL EXISTS AND MATCHES THE LIVE CONSTRUCTION."***
📌 **Why it matters at all, in one line**: *"a single factor that quietly used future information
inflates the backtest, and **the inflation is INVISIBLE — the numbers look better, not broken.**"*

### ✅ 0u.1 **THE A5 REJECTION — the MEASUREMENT, which the twelve carry the verdict of but not the evidence**
🔴 **KILL, and it is the 27th since T11**: **A5's rejection is already on file** — `NBA_GLOSSARY.md`
records *"**A5 — lineup change · T15 · REJECTED/CLOSED.** A derived as-of proxy is redundant"*, and
`NBA_MASTER_SUMMARY.md` carries COMPASS fact 82. ***What is NOT on file is the number.***

**The proxy was BUILT** *(last game's starters, minus those ruled out, plus the highest as-of-minutes
replacement)* **and tested HELD OUT — negative on every prop** *(`0.032` and `0.035`: **0 of the
TWELVE**)*:
| prop | Δ MAE |
|---|---|
| **points** | **−0.032** |
| rebounds | −0.008 |
| assists | −0.008 |
| **pra** | **−0.035** |

🔑🔑 **AND THE REASON IS THE VALUABLE PART, because it generalises**: ***"the allocator already uses
RECENT-5 MINUTES, which encodes starting status CONTINUOUSLY AND WITH MAGNITUDE; a binary starter
flag DISCARDS THAT MAGNITUDE."*** ⚠ ***A binary feature that summarises a continuous one the model
already has does not add information — it removes it.***
✅ **And the consequence for the leakage question**: ***"the leak risk DISSOLVES rather than needing
mitigation — we do not need projected lineups, so there is nothing to leak."***
⚠⚠ **This narrows this corpus's own starter-load headline a second time** *(`NBA_SYSTEM_DESIGN.md`
§0a.3 narrowed it once)*: **the two unloaded seasons of `player_game_starter_status` would have fed
a proxy that was built, tested and rejected.** **The data remains the EVALUATION TARGET, which is
what it was always admissible as.**

### ✅ 0u.2 **WHAT MUST STAY TRUE AS THE BASELINE CHANGES — three invariants, and the second has already been violated once**
1. **`BT_ASOF` drives everything; no constant is carried between days.**
2. 🔴 **The ladder depth is a build parameter (`BT_LADDER_STEPS`, now 10), *"applied identically in the
   singles recipe and the combos recipe — they are **SEPARATE CERTIFIED FILES** and each has its own
   constant."*** ⚠⚠ ***That invariant is written because it was broken***: raising the depth reached
   the singles and left the combos at ±6, leaving **252 combo legs out of range** until the second
   constant was found and patched. 🔑 **An invariant recorded with its own counter-example is the
   strongest form this corpus has.**
3. ✅ **The artifact must contain singles AND combos — *"the loader REFUSES a singles-only slate."***
   🔑 **A gate installed because a silent `echo ... failed` in every workflow step let a 56%-complete
   slate load and report green for two days.**

## 0v. 🔑🔑🔑 **"CERTIFIED" NEVER MEANT "STORED" — the distinction that produced `baseline_history`**
*Recorded 2026-09-22 (T14 pass 1, §T14.2b). **Transcript `2026-09-13-20-53-23`.** ⚠ **`NBA_COMPASS.md`
carries the phrase and the row count; what follows moves it into the twelve with the reasoning and a
live re-take.** Live figures pinned **2026-09-22T08:53:45Z**. `SELECT` only.*

**The owner asked for a day-by-day baseline and was told it was done. It was not, and the correction
is the clearest statement of a distinction this document depends on:**
> *"Let me be precise, because I've been imprecise about this before.
> **WHAT WAS TRUE**: the baseline is **CERTIFIED on both seasons** — the harness computed a
> probability for **every leg on every game-day** of both seasons, compared them to outcomes, and
> **proved the recipe calibrated**. That claim is correct.
> **WHAT WAS NOT TRUE**: ***those per-leg, per-day probabilities were NEVER STORED.*** The harness
> computed them, **measured calibration from them, and kept only the CALIBRATION STATISTICS.** What
> got persisted as a queryable table was **ONE DAY**.
> So when I said 'the baseline is done' I meant '**the recipe is proven**' — and I should have said
> explicitly that **the day-by-day table the engine needs to read didn't exist yet.**"*
> *"It wasn't done… ***I was conflating 'CERTIFIED' with 'STORED.'*** That's on me."*

🔑🔑 ***A certification is a STATEMENT ABOUT A RECIPE; a table is an ARTIFACT. The harness proved the
first and discarded the second.*** ⚠ **And the reason it was discarded is benign and worth keeping**:
*"the production wrapper builds a virtual slate for a FUTURE day, and the harness's output frame
drops player and game identity — **both fine for their original purposes, and neither anticipated
needing the historical table**."*
✅ **So the rebuild changed nothing**: *"**not recomputing anything or changing the recipe** — it's
**PERSISTING what certification already computed**, keyed by date… **same numbers the certification
used, just kept instead of discarded.**"*

### ✅✅ THE RESULT — `nba_score.baseline_history`, RE-TAKEN LIVE
| | as reported | **LIVE 2026-09-22T08:53:45Z** |
|---|---|---|
| rows | **18.78M** | **`reltuples` ≈ 19,266,864** ⚠ *(an ESTIMATE, not a count — rule 30)* |
| stat types | **29** | 📌 **30 distinct `prop` values** |
| coverage | 2 seasons × every game-day × every rung ±10 | — |

> ⚠⚠ **`§0v.4` — `30` IS WHAT THE LADDER COMPUTES, NOT WHAT THE BACKTEST CAN BE EVALUATED ON**
> *(inbound pointer added 2026-09-22, T20 pass 85, §T20.90 — repairing a `T20-1` orphan; **nothing in
> the table above is struck or changed**, the two numbers measure different objects.)*
> **`§0v.4` of this document — *"THE BACKTEST'S REAL SCOPE LIMIT — the archived board is 13 of ~25
> PrizePicks stat types"*, quoted from transcript `2026-09-13-01-03-48`, recorded 2026-09-22 (T13
> pass 2, §T13.3h)** — states the other half: ***"Historically we can train and evaluate on 13; LIVE
> we'll score all of them."***
> 🔴🔴 **AND `§0v.4`'s OWN FIGURE HAS BEEN CORRECTED SINCE — FOLLOW THE POINTER TO THE CORRECTION, NOT
> TO THE `13`.** **`§T20.24` re-derived it live on 2026-09-22** *(`SELECT DISTINCT market_key FROM
> nba_market.board_snapshots WHERE bookmaker='prizepicks'` → 20 keys; collapsing the 8 `_alternate`
> variants leaves **`12` base stat types**)* — **so the archive holds `12`, not `13`.**
> ⇒ ***`baseline_history` carries `30` props because the LADDER computes 30. A PrizePicks-scoped
> backtest can be graded against an archived board for `12` of them.*** **Both figures are correct;
> only one of them is a backtest scope.** *(`§0v.4` is at this document's `### 🔴🔴 0v.4` heading; its
> twin statement is `NBA_MASTER_SUMMARY.md` §T14.2i.)*

**Key: `(game_date, player_id, game_id, prop, period, line)`.** 🔑 **The live table holds ONE MORE
prop than the session reported, so work continued after it.**
📌 **The build order, for the record**: **2025-26 singles 11 props / 163 game-days / 3,646,216 rows** ·
**2024-25 singles 162 game-days** *(together ~7.19M)* · **combos 2.7M + 2.61M → 12.49M** · **then four
new box-score stats and eight period sets → 18.78M.**
🔴 **`oreb` was EXCLUDED, and the reason is the recipe working**: *"failed calibration — **−21 pp on
the 'more' side near low anchors**; rows deleted, config marked for retuning… **a zero-inflated stat
with anchors at 0.5–1.5 doesn't fit the negative-binomial-with-zero-adjust shape that works for
fouls.** It needs its own treatment, and **I'd rather it be absent than wrong**."*
⚠ **Two caveats stated at the time**: the three stats that passed were **provisional, not certified**
until both seasons landed, and **`dreb` has one deep-rung cell at +5.9 pp on elite rebounders' "less"
side "worth watching."** 📌 **Periods cover 152 of 163 game-days — the quarter files are missing ~11
dates, a data-file gap rather than a recipe one.**

### 🔴🔴 0v.1 **A TRAINING LEAK THAT ONLY AN UNRELATED CRASH EXPOSED**
> *"The 2024-25 failure was worth catching for more than the crash: ***the workflow had let the
> harness's DEFAULT TRAINING SET INCLUDE THE TEST SEASON.*** On 2025-26 the default happened to be
> correct; **on 2024-25 it was a LEAK.** ***Both runs would have looked fine if the memory hadn't
> given out*** — which is exactly the kind of silent problem the parity directive exists to
> prevent. **Training seasons are now set explicitly per season, matching how certification ran.**"*

🔑🔑 ***A leak that produces no error, no warning and a plausible number, found only because an
out-of-memory crash stopped the run.*** ⚠⚠ **This is the strongest argument in the corpus for the
parity directive, and it is an accident.**

### ✅ 0v.2 **AND THIS IS WHY §0w's FIRST "GAP" IS WITHDRAWN**
**§0w recorded three production gaps from T13 and marked gap 1 closed because three slates now
exist.** ***The gap itself was withdrawn as a misframing in T14, against the compass:***
> *"**Fact 6**: one fixed recipe where **every value is computed in-run from history AS OF THAT
> DAY**, nothing pasted. **Fact 5**: certification means calibrated at the leg level on both seasons
> with the same recipe. **Fact 32**: production is the backtest plus virtual slate rows.
> **So a single day's run is INHERENTLY SHARP**: the recipe recomputes tier cutpoints, Platt
> scaling, dispersion, factor betas and phase ratios from all history up to that date, **every
> time**. ***There's nothing to "prove stable across dates" — that was me applying a TRAIN/DEPLOY
> MENTAL MODEL that doesn't fit this design.*** The 17,376 rows aren't a demo of one lucky day;
> **they're what the certified recipe produces for ANY day you point it at.**"*
> *"**Gap 3, periods = 1 — also BY DESIGN.** Fact 27 covers period certification separately."*

🔑 ***So of §0w's three gaps, TWO were withdrawn as misframings and only `baseline_ladder_runs` ever
stood*** *(COMPASS fact 34: the loader writes both halves, and the metadata half was not landing)*.
✅ **§0w's live figures are unaffected — three slates and a populated runs table are facts. What is
corrected is the FRAMING: multi-date stability was never required of this design.**
⚠⚠ **AND THE SELF-ASSESSED LESSON IS WORTH MORE THAN THE CORRECTION**: ***"when something looks
anomalous in a system this documented, THE COMPASS IS THE FIRST STOP, NOT THE LAST. I burned three
exchanges on a non-issue that fact 16 would have answered immediately."*** 🔑 **The same lesson this
sweep keeps re-learning as RULE 33.**

### 🔑🔑 0v.3 **HOW MUCH OF THE BOARD THE BASELINE CAN ACTUALLY SCORE — 89.6%, and the residual decomposes**
⚠ **The headline figure is already on file** *(`NBA_WORKERS.md` names `nba/check_season_coverage.py`
as the producer of the 89.6%)* — **what follows is the decomposition, which is not.**
**634,330 PrizePicks window legs → 568,322 with a baseline probability, across the ENTIRE 2025-26
season with shared name resolution.**

| prop | legs | matched | line gap | out of range | player missing |
|---|---|---|---|---|---|
| stocks | 2,286 | **94.9%** | 0 | 0 | 107 |
| turnovers | 2,511 | 94.3% | 1 | 0 | 133 |
| threes made | 48,085 | 94.1% | 4 | 0 | 2,573 |
| blocks | 1,198 | 93.3% | 1 | 0 | 79 |
| steals | 2,192 | 93.2% | 0 | 0 | 134 |
| assists | 66,866 | 90.5% | 2,388 | 0 | 3,531 |
| reb+ast | 81,664 | 89.7% | 3,714 | 42 | 4,224 |
| pts+ast | 68,273 | 88.4% | 628 | **3,638** | 3,243 |
| pts+reb | 83,187 | **86.8%** | 1,674 | **4,804** | 4,139 |

🔑 **Three readings, and they separate a defect from a decision**: **① name resolution is no longer a
problem** — *"the unresolved column is effectively zero across the board, so the alias logic did its
job season-wide"*; **② the dominant residual (~5%) is *"player missing that day"*** — **mostly
two-way and fringe players below the roster filter, plus players who DNP'd** *(no box score → no
row, **which is correct behaviour**)*; **③ points-based combos lose ~5% to out-of-range**, ***"deep
demons on high scorers past ±10 — exactly the tail we chose to stop at. That's a DECISION, not a
defect, and it's only on the combos."***

### 🔴🔴 0v.4 **THE BACKTEST'S REAL SCOPE LIMIT — the archived board is 13 of ~25 PrizePicks stat types**
> *"**The historical board is NOT the full PrizePicks menu.** The Odds API archived only **13 stat
> types** for PrizePicks *(points, rebounds, assists, threes, blocks, steals, turnovers, PRA, PR,
> PA, RA, stocks, double-double)*. PrizePicks' actual NBA board **also runs fg made, fg attempted,
> ft made, ft attempted, 3pt attempted, personal fouls, offensive rebounds, defensive rebounds,
> dunks, fantasy score, and the PERIOD props.** ***None of those exist in the two-season board
> history — there is no archive of them anywhere***, which we established when we exhausted the
> sources. **Historically we can train and evaluate on 13; LIVE we'll score all of them.**"*

> ### ⚠⚠ `[LIVE-AUDIT]` **RE-DERIVED 2026-09-22 (T20 pass 19, §T20.24) — THE ARCHIVE HOLDS `12`, NOT `13`, AND THE MISSING ONE IS ARCHIVED FOR NINE OTHER BOOKS**
> 🔑 **NOT A RETRACTION — the quote above is a QUOTED CLAIM, dated to its transcript
> (`2026-09-13-01-03-48`) and recorded 2026-09-22. It is DATED, not struck** *(rule 40's second half;
> §T20.14's error is the precedent being avoided)*. **What follows is the archive as it stands
> today.**
> **`SELECT DISTINCT market_key FROM nba_market.board_snapshots WHERE bookmaker='prizepicks'`
> → 20 keys, 2026-09-22.** **Collapsing the 8 `_alternate` variants leaves `12` base stat types**:
> `points` · `rebounds` · `assists` · `threes` · `blocks` · `steals` · `turnovers` · `points_rebounds_assists` ·
> `points_rebounds` · `points_assists` · `rebounds_assists` · `blocks_steals` *(= "stocks")*.
> 🔴 **`player_double_double` — the thirteenth on the list above — has ZERO PrizePicks rows.**
> 🔑🔑 **AND IT IS NOT MISSING FROM THE ARCHIVE, ONLY FROM PRIZEPICKS': `player_double_double`
> carries `274,010` rows across NINE bookmakers spanning `2024-10-22 → 2026-04-12`** — **betmgm
> 65,789 · draftkings 45,897 · fanduel 45,522 · bovada 38,893 · williamhill_us 34,531 · fanatics
> 29,812 · betrivers 10,674 · underdog 1,960 · betr_us_dfs 932.**
> ⇒ ***The scope limit is real and the count is off by one in BOTH directions at once: one fewer
> PrizePicks stat type than stated, and one MORE that is evaluable cross-book than the framing
> implies.*** ⚠ **The corpus already prices cross-book consensus (`rung_market`, `avg(books) = 2.11`),
> so "no archive of them anywhere" is the part that needed testing — and for double-double it does
> not hold.**
> ✅ **RULE 20, three vocabularies before an absence**: `player_double_double` exists as a key,
> exists for nine books, and returns zero rows only when filtered to `bookmaker='prizepicks'`.
> ✅ **The rest of the "no archive anywhere" list SURVIVES**: the full non-PrizePicks vocabulary is
> **89 distinct `market_key` values**, and it contains **no** `fg made` / `fg attempted` / `ft made` /
> `ft attempted` / `3pt attempted` / `personal fouls` / `offensive rebounds` / `defensive rebounds` /
> `dunks` key at all. ⚠ **`player_fantasy_points` is the one partial exception and it does NOT
> qualify as an archive: `underdog` only, `189` rows, on a SINGLE offseason date (`2026-09-12`).**
> 📌 **Found because §T20.23's orphan audit flagged this section as unreachable under all three
> citation grammars — *an unreachable finding is also an un-re-derived one*, and this is the
> measurement that proves the cost was real.**

⚠⚠ ***Every backtest number in this corpus — the per-tier hit rates, the 89.6% coverage, the
market-calibration result — is measured over 13 of ~25 stat types.*** **That is a scope limit on the
evidence, not on the system, and it belongs beside every figure drawn from the two-season board.**
✅ **The BASELINE side was then taken to 29–30 of ~31 stat types**, **leaving only `dunks`** *(needs
play-by-play / shot data — new mining)* **and `oreb`** *(excluded for calibration)*. 🔑 ***So the
asymmetry is permanent and one-directional: the model can score more of the board than the archive
can ever evaluate.***

## 0w. 🔑🔑 THE BASELINE'S THREE PRODUCTION GAPS — **named in T13, and TWO of them are now CLOSED**
*Recorded 2026-09-22 (T13 pass 2, §T13.3h). **Transcript `2026-09-13-01-03-48`, the closing baseline
sweep.** **Every live figure re-taken from `nba_score.baseline_ladder_runs`, pinned
2026-09-22T08:09Z.** `SELECT` only; nothing was run or changed *(rule 1)*.*

**T13 ran a deep sweep of the baseline as a PRODUCTION ARTIFACT — not as a backtest — and its verdict
is the distinction this document needs**: ***"the artifact is real and correctly shaped, but there
are three gaps worth naming."***

### THE THREE GAPS AS STATED, AND THEIR STATUS TODAY
| # | the gap, in T13's words | status **2026-09-22** |
|---|---|---|
| **1** | ***"Only ONE SLATE exists.** The baseline has been **certified on two seasons via the backtest harness**, but **as a production artifact it's been run exactly ONCE, for a single day**. Before the engine consumes it daily we should confirm it runs cleanly **across a range of dates**, not just the one it was demoed on."* | 🔴 **WITHDRAWN AS A GAP — see §0v.1** *(three slates do exist, but the gap itself was a misframing)* |
| **2** | ***"`baseline_ladder_runs` is EMPTY.** That's the **run-metadata table**, which is exactly what the **freshness gates** we specced are supposed to read — *"was the baseline built today, from what inputs, at what time?"* — **the gate can't work against an empty table**."* | ✅ **CLOSED — 3 rows** |
| **3** | ***"`periods = 1`.** Only **full-game rows**; the **period ladders (Q1/H1) aren't in the production artifact**, though **the periods builder exists**. Fine if we're not offering period props at launch, **but it should be a DECISION rather than an OMISSION**."* | ⏳ **OPEN — and it is an OWNER decision, not a defect** |

### ✅ THE LIVE RUN-METADATA TABLE — *the gate now has something to read*
| `asof` | slate games | players | rows | props | `loaded_at` |
|---|---|---|---|---|---|
| **2025-11-29** | 8 | 184 | **64,779** | **22** | 2026-09-20T03:23:26Z |
| **2026-01-15** | 9 | 227 | **90,861** | **22** | 2026-09-19T22:35:04Z |
| **2026-03-15** | 7 | 161 | **50,597** | **18** | 2026-09-11T20:23:10Z |

**All three carry `history_seasons = {2023-24, 2024-25}` and `current_season = 2025-26`**, and each
stores its own **`factor_fits`**, **`role_minutes_multiplier`** and **`source_file`** *(the dated
ladder JSON plus `nba_baseline_ladder_latest.json`)*.
🔑 ***So the multi-date stability run T13 said it would do was DONE*** — **three slates spanning
November, January and March, loaded 2026-09-11 → 2026-09-20**, *i.e. entirely after this transcript.*

### 🔴 AND THE 2026-03-15 SLATE IS NOT THE ONE T13 DESCRIBED — **the replay happened**
| | T13's description | **LIVE row for the same `asof`** |
|---|---|---|
| ladder rows | **17,376** | **50,597** |
| players | **173** | **161** |
| props | **11** | **18** |

**All three figures differ, and `loaded_at` is 2026-09-11T20:23Z — AFTER the transcript.**
✅ ***That is the replay T13 queued***: *"that 2026-03-15 run **predates the injury-report
integration**… it's the same date, so **re-running it now with `bt_injury` present will show exactly
what the day-of report changes versus the certified numbers**."* 🔑 **The live row is the re-run,
not the demo.** ⚠⚠ **Stated at evidence strength**: ***a later run EXISTS; whether the baseline was
RE-CERTIFIED against it is a different claim and is NOT RECORDED.*** **A dated STATE** *(O9)*.

📌 ~~**One further observation, recorded and NOT explained** *(rule 6)*~~ ✅✅ **ANSWERED 2026-09-22,
T20 pass 109 (`§T20.114`) — AND THE BIGGER QUESTION UNDER IT WAS NEVER ASKED.** *Original observation,
whose facts are confirmed exactly:* **the 2026-03-15 row's `factor_fits` are SHALLOWER than the other
two** — its `steals` fit carries no `f_impl_opp`, and its `assists` fit carries neither `f_impl_opp`
nor `f_impl_own`, **while both later-loaded slates carry all of them.** ⚠ ***The latest slate DATE
holds the earliest-loaded and least-complete artifact***, **which is the ordering a reader is least
likely to expect.**

> ✅ **WHAT THE SHAPE OF THE GAP SAYS** *(live sub-factor keys, `2026-09-22`)*: `2026-03-15` has
> `assists → f_opp_def f_pace is_b2b is_home` and `steals → f_opp_tov f_pace is_b2b is_home`; the
> other two add **`f_impl_opp` + `f_impl_own`** to `assists` and **`f_impl_opp`** to `steals`.
> 🔑 **All three missing keys are the IMPLIED-FROM-MARKET family and NOTHING ELSE is missing** — so
> the artifact is not "shallower", it is **missing exactly one input family**, which points at market
> odds at build time rather than at run quality. ⚠ **Why that family was absent on that build is
> still NOT RECORDED** — *but the gap now has a shape, and a shaped gap is answerable.*
>
> 🔴🔴 **AND THE QUESTION THAT HAD THE REAL ANSWER WAS NEVER ASKED**: *why does a slate of 18–22
> props have `factor_fits` for **`assists` and `steals` ONLY** — on this row and on both others?*
> **Because the merge step takes the alphabetically-first invocation's `meta` wholesale, and no
> production pair fits `assists` with `steals` — the winner is the `BT_SAVE_COMPONENTS=1` DIAGNOSTIC
> build.** ▶ **`§T20.114`, item `T20-20`.** ⚠ ***This note compared the three blobs to each other for
> two passes without once asking what the blob was supposed to contain.***

## 0y. ⚠ WHERE THE BASELINE'S CONSTANTS ACTUALLY LIVE — in Python, not in config
*VERIFIED 2026-09-20 (T1 pass 36) by grep of all 190 `.py`/`.js` files plus the MCP admin bridge.*

**Every tunable this document describes — per-prop EWMA `alpha`, `k_stab`, `step`, distribution
`family`, `zero_adjust`, and the six `ROLE_TIERS` bands — is a hardcoded constant in
`nba/backtest/classification_ladder_v12.py`.** The config tables that appear to hold them
(`nba_config.stat_decay_config`, `nba_config.role_tiers`, `nba_config.classification_config`) are
**read by nothing**: those table names appear **zero times** in the codebase.

**Why this belongs in the calibration document and not only in the schema one:**
1. **The live numbers are the code's.** Any parameter quoted in this document should be traced to
   `classification_ladder_v12.py`, **not** to a config row, and **not** to a figure in
   `NBA_DATABASE.md`.
2. **The two sides have measurably drifted.** A whole-universe diff found **7 of 10 mappable stats
   disagreeing**, **3 on the decay rate itself** — blocks **0.08 (config) vs 0.10 (code)**,
   turnovers **0.10 vs 0.12**, ft% **0.04 vs 0.03**. Full table: `NBA_OPEN_ITEMS.md` →
   *FROM T1 PASS 36*.
3. **The code looks like the evidence-updated side.** It carries dated justifications inline —
   *"alpha raised 0.08 → 0.15 (EWMA beat the expanding mean on every band)"* for `oreb`,
   *"top-decile regression 13%"* for turnovers — matching §5.0's nine measured iterations.
   **The config looks like the T7 seed that was never updated.** **Which side is intended is NOT
   ESTABLISHED** and is flagged for human confirmation, not resolved here.
4. **It changes what "every tunable lives in the database" means for this layer.** The principle is
   recorded at `NBA_FINAL_SCORING_CALIBRATION.md` §7p and in `NBA_RECIPE.md` STEP 0. **For the
   baseline it is aspirational, not descriptive.**

**⚠ Practical consequence for anyone re-tuning the baseline**: changing `blk_rate`'s alpha in
`stat_decay_config` by SQL — the workflow the owner's founding rule promises — **changes nothing and
raises no error.** The edit must be made in the recipe and deployed.

**⚠⚠ AND THE LESSONS DOCUMENT HAS A STANDING CHECK FOR EXACTLY THIS** *(added 2026-09-20, T1 pass 52
— the lesson was undocumented and had never been connected to the drift above)*:
> *"**A fourth, now twice-confirmed lesson worth stating as a standing, mandatory check**: **verify
> that a backtest or analysis is actually evaluating the CURRENT LIVE coefficient or configuration
> value, not a value that has since been changed or corrected in the live system.** The same MLB
> investigation found this exact mistake **twice in one session** — once when a historical bug had
> already been fixed in the live enrichment code before the investigation started, **making a 'large
> finding' actually a description of already-resolved history**."*

**Applied here**: **any analysis that quotes a `stat_decay_config` value is quoting a number the
engine does not use.** The live values are the `PROPS` dict in `classification_ladder_v12.py`.
**Which past NBA analyses quoted config rather than code is NOT ESTABLISHED** — the entries do not
record their source. **The check is one grep per number**, and it is now a standing requirement for
any figure cited from this document.

---

## 1. THE BOUNDARY — what the baseline may and may not see

> *"The baseline isn't 'player history only.' It's **everything derivable from static and historical
> data** — including the calendar, which tells us the opponent, home/away and rest days. So **opponent
> defence, pace matchup and blowout risk all belong in the baseline**, derived from team strength
> rather than a live spread. **Only truly live inputs (injury reports, confirmed lineups, market
> lines) are enrichment** — and for the important ones, **the baseline carries a derived signal as
> backup**."* — T7

> **OWNER:** *"the baseline is looking to the past… **It does NOT use any daily context data — and NO
> market.** So that's looking to the past and **AGNOSTIC of those datas**."* — T7

**Encoded as data**: `nba_config.factor_registry` tags **25 factors `baseline`, 4 `enrichment`**
(injury report, confirmed lineups, market-spread delta, referee assignment). The layer is a **column**,
so the boundary is queryable and therefore enforceable.

**Consequence**: the baseline projects players who will not play. From the production config —
*"43 roster players were DNP (**enrichment removes**)."* **Availability-agnostic by construction.**

---

## 2. THE FIVE-DIMENSION TIERING ARCHITECTURE *(T8)*

### 2.1 Why NBA cannot use MLB's tiering directly
> *"**MLB tiers on a per-game rate because plate appearances are stable. NBA can't** — a 20-point
> projection could be a **high-rate/26-minute player or a low-rate/36-minute player**, and **shrinking
> them to the same tier mean is STATISTICALLY INVALID**."*

**→ two tier systems that CROSS.**

### 2.2 Player tiers — two orthogonal dimensions
| Dimension | Form | Why |
|---|---|---|
| **Rate tier** | **quantile rank on recency-blended per-36 rate**, per `prop × line × side`. `MAX_TIERS=24`, `MIN_PER_TIER=15`. Tier mean = shrinkage prior | *"Exactly the proven mechanism, applied to the **stable quantity**"* |
| **Role tier** | **FIXED thresholds on projected minutes** — not quantile | *"role is **categorical and interpretable**, and it's **what factors like blowout risk actually act on**"* |

**`ROLE_TIERS`** (code and `nba_config.role_tiers`, 6 rows, agreeing):
`IRON_MAN` 36+ · `HIGH_USAGE_STARTER` 32–36 · `STARTER` 27–32 · `ROTATION` 21–27 · `BENCH` 15–21 ·
`FRINGE` 0–15. Keyed on **`mu_role`**, not the starter flag.

### 2.3 Factor tiers — each factor's FORM is earned
| Factor | Form | Basis |
|---|---|---|
| Rest / B2B / travel | tiered bands (B2B-road, B2B-home, 1, 2, 3+) | *"non-linear: **1→0 days matters far more than 3→2**"* |
| Altitude | continuous, **gated >1500 m** | *"sparse data — **don't overfit**"* |
| Opponent DvP | quantile bands (top 5% / 6–25 / 26–75 / 76–95 / bottom 5%) | *"**rank gaps aren't linear**"* |
| Game pace | continuous `log(proj_pace / league_avg)` | log-linear by construction |
| Opponent scheme | binary gates × player archetype | categorical |
| **Blowout risk, P(OT), foul risk** | **MINUTES-MODEL INPUTS, not rate factors** | *"they act on **opportunity, not efficiency** — moving them there also **dissolves their correlation**"* |
| With/without teammate, P(start) | binary gates / minutes inputs | precomputed lift from history |

**Band cutpoints: *"data-driven (CART on our 3 seasons), validated out-of-sample, fixed for a
season — NEVER arbitrary."***

### 2.4 Variation bands — league percentiles
4–5 per prop. **Points: `<9.5 / 9.5–17.5 / 18.5–25.5 / 26.5–31.5 / 31.5+`.**
**Per-player-relative bands were REJECTED as unstable.**

**Why the dimension exists — two examples pointing OPPOSITE ways:**
> *"**blowout risk is a large penalty for a 12.5-line role player and a small one for a 28.5-line
> star** who clears his number in three quarters; **an elite defence penalises the star heavily and the
> fringe player not at all**."*

**The distribution family itself changes by band** — a 3.5-points player gets Negative Binomial, a
33.5-points player Normal.

### 2.5 Direction — kept, over Gemini's objection
> *"the **distribution shape** (NegBin, zero-inflated) handles the ***base* skew**; the **direction
> dimension** handles ***asymmetric factor effects*** — **a blowout penalises 'more' far more than it
> helps 'less' for a star**. **Both stay.**"*

**Mechanism (T7)**: assists skew **down** (*"an assist requires pass AND effective pass AND teammate
makes it; blowouts rest playmakers first"*); turnovers, stocks and 3PM skew **up** (zero-inflation
plus burst games).

### 2.6 Tier RANK is global; tier LOGIC is per band
> *"the **tier RANK is global** [so shrinkage keeps its population], but the **tier LOGIC —
> distribution family, dud-risk weight, dispersion, lifts/penalties — is specific to the variation
> band**."*

---

## 3. THE COMPUTATION, IN ORDER

### 3.1 Minutes — the biggest error source

> *"minutes projection is **the single biggest source of error in any player-prop model**."* — T4

#### THE CONFIGURED THREE-COMPONENT MIXTURE — `nba_config.classification_config.minutes_mixture`
```json
{"components": ["normal_truncated", "blowout_truncated", "dud_lognormal"],
 "normal_filter": {"max_margin": 15, "max_pf": 5, "min_pct_own_avg": 0.4},
 "dud_filter":    {"bottom_pct": 15, "or_pf_ge": 5},
 "blowout_threshold_margin": 20,
 "team_constraint": 240,
 "renormalization": "tiered_inelastic"}
```
*"Three-component minutes model; **f(spread) and E[min|blowout] fit on own data PER TEAM**"*

**Every part of the T7 design is in this config:**
| Element | Value |
|---|---|
| **`dud_lognormal`** | **the dud component IS configured** — bottom 15% of own average, **or PF ≥ 5** |
| `normal_filter` | margin < 15, PF ≤ 5, **and `min_pct_own_avg: 0.4`** — the ≥40%-of-median floor |
| `blowout_threshold_margin` | 20 |
| **`team_constraint: 240`** with **`renormalization: "tiered_inelastic"`** | *"stars' minutes are inelastic, fringe minutes absorb the adjustment. **Not pro-rata**"* |
| **`E[min|blowout]` fit PER TEAM** | the team-specific term — **configured, and NOT in `blowout_model`** |

**⚠ THE CONFIG AND THE CODE DISAGREE.** `classification_ladder_v12.py` implements
`comp_min = competitive & PF < 6` — **the `normal_filter` only.** There is no `dud` term, no
`tiered_inelastic` renormalisation and no per-team blowout in the file.
**So the full design is recorded in `classification_config` and partially implemented in the recipe.**
Recorded in `NBA_OPEN_ITEMS.md`.

**In the code:**
```python
pg["competitive"] = pg["abs_margin"] < COMPETITIVE_MARGIN   # 15
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
```
`mu_role` = `shift(1).rolling(20, min_periods=5).mean()` of `comp_min`.
**The period layer DOES implement the mixture** (§6) — sit-out rate and "plays" ratio per role × state.

### 3.2 Cross-season carryover — the season-opening fix
> *"without it **the opening month has ZERO projections and November only 62% coverage**"* (within-season
> rates need 3 games, the minutes role 5).
> 🔑 **THE BIAS HALF, recorded 2026-09-21 (T10 pass 1, §T10.1a) — the coverage figures below were on
> file and the measured bias was not.** From `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md` §7 and
> the live config key `nba_config.classification_config.season_opening_study`:
>
> **Carryover OVER-PROJECTS ~5pp at the anchor in October** — **points −4.8 / −6.2, rebounds −5.2 /
> −4.6** *(the two backtest seasons)* — **~2–4 pp in November, flat December–March.** ✅ **Both
> seasons, same sign and same size**, which is what makes it usable rather than noise: *this is the
> direct answer to the owner's T10 question, "is there a reliable and safe pattern on season beginnings
> to work with."*
>
> 📌 **Also only in the config, not in any document**: *"**Platt stays OFF until ~December by
> construction** (raw is calibrated within ~1–3pp)"*, and *"the out-of-sample test of the phase cell is
> only possible on 2025-26 today; **for the 2026-27 opening the fit uses 2024-25 + 2025-26 —
> stronger**."*
>
> ⚠ **The season opens 2026-10-20**, which is the window this pattern describes.

**With it: October 85%, November 90%.** Carried at player level; carried evidence counts as `CARRY_N`
games at the boundary. **`BT_CARRY`, default `"1"`.**

### 3.3 Team-change discount — measured
**Carried minutes-role MAE 5.97 vs 4.75 after a move.** Once a player has **≥5 competitive games with
a new team**, the role uses **only those games**.

### 3.4 Return ramp (factor A3) — measured on 3 seasons
Games missed = the team's games between the player's previous appearance and this one.
| Missed | Minutes ratio, games 1 / 2 / 3 / 4 back |
|---|---|
| 3–7 | 0.87 / 0.97 / 1.01 |
| 8–15 | 0.79 / 0.92 / 0.96 |
| 16+ | **0.72 / 0.84 / 0.92 / 1.00** |

> *"**Per-minute rate unchanged (~1.0) → a MINUTES multiplier only**, fit on TRAIN."*

### 3.5 Blowout — a MIXTURE over minutes, never a penalty
> *"blowouts don't reduce points, **they reduce MINUTES**… `P(blowout) × [blowout-minutes dist] +
> (1−P) × [competitive dist]` — **causal and self-explaining** rather than a post-hoc probability drag.
> **A direct penalty is what you called capping.**"*

**`MIN_RATIO[role_tier] = (won_ratio, lost_ratio)`**, derived from TRAIN inside the run:
`ratio = MINF / mu_role`, fallbacks 0.9 / 0.95.
**`nba_score.blowout_model.minutes_by_margin` stores RATIOS** — competitive **1.0333**, won-by-25+
**0.8748**, lost-by-25+ 0.9124. **A value above 1.0 for the common case is the signature of a
deviation model** — which is what prevents double-counting the shortened minutes the history already
contains (the T4 warning).

`P_BLOWOUT_BINS = [0,2,4,6,8,10,12,15,99]`. Measured **17% → 39% monotone on train; 19% → 41% on
test**.

**⚠ Team-specific benching measured at a 30% spread (0.81 Orlando → 1.10 Dallas) and NOT implemented.**

### 3.6 Rate — EWMA with per-stat memory
**`nba_config.stat_decay_config`, 13 rows.** Alpha spread **6.7×**, stabilisation spread **30×**.
| stat | α | stabilise |
|---|---|---|
| minutes | **0.20** | 10 |
| usg_pct / ast_rate | 0.15 | 15 / 20 |
| pts_rate / **fg3a_rate** | 0.12 | 25 |
| stl_rate | 0.10 | 60 |
| fta_rate / tov_rate | 0.10 | 30 / 40 |
| reb_rate / blk_rate | 0.08 | 40 / 50 |
| fg_pct | 0.06 | 120 |
| ft_pct | 0.04 | 150 |
| **fg3_pct** | **0.03** | **300** |

**MLB's fixed 5/10/20/season blend was REJECTED** — *"the single biggest thing that does NOT
transfer."*
**`fg3a_rate` and `fg3_pct` are split deliberately**: *"attempt VOLUME (unlike make %) is
role/scheme-driven."*

### 3.6b STABILIZATION-POINT RESEARCH — the reference table NBA never sourced
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> *"**Build (or find) an equivalent 'STABILIZATION POINT' REFERENCE TABLE for EVERY NBA PROP BEFORE
> FINALIZING SHRINKAGE DESIGN.**
> MLB **benefited enormously from existing, cross-validated sabermetric research giving THE EXACT REAL
> SAMPLE SIZE at which each rate stat STOPS BEING MOSTLY NOISE AND STARTS REFLECTING REAL TALENT** —
> ranging from **as few as 60 PA (strikeout rate)** to **over 1,600 PA (extra-base-hit rate, which
> ESSENTIALLY NEVER FULLY STABILIZES WITHIN A SINGLE SEASON)**.
> **This precise, quantified reference DIRECTLY EXPLAINED *WHY* CERTAIN PROPS RESISTED CALIBRATION NO
> MATTER HOW MUCH SAME-SEASON DATA WAS ADDED — IT WASN'T A PIPELINE BUG, IT WAS A REAL, MEASURED
> PROPERTY OF THE STAT ITSELF.**
> **Basketball has its own real, published stabilization/reliability research** (work from public
> analytics communities on **how many games various box-score stats take to stabilize**) — **source
> the closest available real research THE SAME WAY MLB DID, and use it to set genuinely PER-PROP,
> EVIDENCE-BASED shrinkage weights rather than a single global rate.**"*

### ⚠ This is the structural explanation for the four "close" props
T9 records blocks, steals, turnovers and fouls as **CLOSE, not certified** — *"these are the noisiest
per-game stats in the sport; **the research consensus for them is exactly what's built**"* — and
T9.5 gives one reason (they are **opponent-driven**).

**The stabilization framing gives a second, independent reason**: a stat with a very high
stabilization point **cannot be calibrated tightly within the available sample, and that is a property
of the stat, not a defect in the pipeline.** *"It wasn't a pipeline bug, it was a real, measured
property of the stat itself."*

**The harness header's own note is consistent with this**: *"**blocks more 70–75: −4.3, n=3900 =
P(0 blocks) under-predicted for ~1.5 bpg players, PERSISTS AT ANY LAMBDA**; **holdout shows the same
signs**."* **"Persists at any lambda" is what an unreachable stabilization point looks like** — no
amount of shrinkage tuning fixes it.

### ⚠ What NBA did instead, and the gap
**NBA derived its own per-stat memory empirically** — `stat_decay_config`'s 13 rows carry
`shrinkage_stabilization_games` **measured from our own data** (minutes 10 → fg3_pct 300), with the
`k_stab` values in `PROPS` measured per prop (STL 125, TOV 60; *"top-decile steals players regress 17%
over the next 20 games"*).

**So the per-prop, evidence-based requirement was MET — by internal measurement rather than by
sourcing published research.**

**The gap is the cross-check.** The instruction is to **source the closest available published
basketball stabilization research** and use it. **No such source is recorded in any transcript.**
**Value of doing it**: an external reference would confirm whether `fg3_pct` at **300 games** and
`blocks` at **50** are right, and — per the MLB experience — **would tell us in advance which props
can never be certified within one season**, rather than discovering it prop by prop.

**A concrete candidate is already named elsewhere in the record**: the T7 factor research cited
**peer-reviewed and industry sources** (OpticOdds, Unabated, DataStreak, *J. Sports Sciences*), so the
sourcing discipline exists — **it simply was not applied to stabilization points.**

---

## 3.7 Shrinkage

**Tier prior** = tier mean blended toward population with **`TIER_BLEND_K = 5`**.
**Shrunk rate** = `(n·rate + priorStrength·tierPrior) / (n + priorStrength)`.
**Prior strength** = empirical Bayes, **Efron-Morris method of moments**, branched by distribution
family, *"so shrinkage genuinely decays to zero as a player's sample grows."*

**Measured, per prop** (v18): **STL k=125, TOV k=60** — *"k_MoM relative to points **STL 4.9×,
TOV 2.5×, BLK 1.7×**; **top-decile steals players regress 17% over the next 20 games**."*

**⚠ One k cannot serve all bands**: *"data-fit prior strength is **k≈2 against the population** but
**k≈100–250 against tier-mates (circular)**."*

**⚠ Scale prior strength to the window's information content**: a 12-minute per-36 rate carries ~⅓ of
a game. **Under-shrinking produced a WINNER'S CURSE in the top band** — found twice, in the full-game
and period layers.

### 3.7b TWO SHRINKAGE RULES, WITH EXACT THRESHOLDS
*Source: T1, blueprint §4b. Recorded 2026-09-20.*

### 1. ⚠ THE "DON'T OVER-SHRINK A REAL SIGNAL" SAFETY VALVE
> *"**Hierarchical Bayesian shrinkage needs an EXPLICIT 'don't over-shrink a real signal' SAFETY
> VALVE**: MLB's shrinkage formula has **a hard-coded rule that ONCE A PLAYER HAS ENOUGH REAL
> OBSERVATIONS (n ≥ 20) **AND** THEIR RAW RATE GENUINELY, MEANINGFULLY DIFFERS FROM THE POPULATION
> PRIOR (> 15 POINTS), THE PRIOR IS CAPPED AT CONTRIBUTING NO MORE THAN 25% OF THE FINAL ESTIMATE** —
> **preventing well-supported individual signal from being WASHED OUT just because it DISAGREES WITH
> THE AVERAGE.**
> **Build an equivalent safety valve into NBA's shrinkage design FROM THE START, NOT AS A LATER
> PATCH.**"*

**Three conditions, all required:**
| Condition | Threshold |
|---|---|
| Real observations | **n ≥ 20** |
| Divergence from the population prior | **> 15 points** |
| Resulting cap on the prior's contribution | **≤ 25% of the final estimate** |

**⚠ NO SUCH VALVE IS RECORDED IN NBA'S SHRINKAGE.** What NBA has instead:
- **Empirical-Bayes prior strength** (Efron-Morris), *"so shrinkage genuinely decays to zero as a
  player's sample grows"* — **decay by sample size only**
- **Measured per-prop `k_stab`** (STL 125, TOV 60, BLK ~1.7× points) — **stronger shrinkage for
  noisier props**
- **The `min_real_sample_threshold` on profile cells** — *"cells under sample are fully shrunk to
  prior"* — **which is the opposite direction: it shrinks MORE when thin, and has no rule for shrinking
  LESS when a player is both well-sampled and genuinely different.**

**The asymmetry is the point.** NBA's machinery protects against trusting thin samples. **The valve
protects against distrusting thick ones** — an outlier with 40 games and a genuinely extreme rate is
exactly the player a tier-mean prior will drag toward average.

**Directly relevant to the recorded `FRINGE` and `ELITE` residuals**: T8 found *"the bias is MONOTONE
in the variation band… **the quantile tier prior COMPRESSES THE EXTREMES**"* and **rebounds ELITE
under-predicted in both seasons** — a structural cell kept because its sign was consistent.
**"The tier prior compresses the extremes" IS the failure this valve prevents**, and NBA solved it
with per-band cells after the fact rather than with a valve from the start.

### 2. Keep reliability tiers a PURE function of sample count
> *"**Keep sample-size reliability tiers PURELY a function of SAMPLE COUNT, NOT a blend of other
> signals** — **MLB explicitly TRIED AND REVERTED an attempt to make this 'smarter' by incorporating
> other information; the LOCKED, SIMPLER VERSION WAS CORRECT.** If tempted to enrich a
> reliability-tier classifier with additiona[l signals]…"*

**A tried-and-reverted experiment, recorded so it is not repeated.**

**NBA's `f_role` is the case to watch**: the confidence model's dominant factor (**55.6% of the
deduction budget**) is keyed on **`role_tier`, which is derived from `mu_role` — projected minutes,
not sample count.** **That is a reliability-adjacent classifier built on a non-sample-count signal.**

**Whether it violates this rule depends on framing**: `f_role` measures *realised gap by role band*
(fringe 0.0283 vs iron-man 0.0008), which is **an empirical error measurement**, not a reliability
tier in the sense meant here. **But `c_exist` / `c_quality` / `f_prov` in the confidence model are
closer to reliability tiers**, and whether any of them blend non-count signals is unverified.

### 3. A SEPARATE, LABELLED PATH FOR THIN-DATA PROPS
> *"**A separate, PARALLEL calibration system with ENTIRELY DIFFERENT THRESHOLDS may be needed for
> lower-priority or lower-data props** — MLB has one for its **'expansion scope' props**, with **a
> COMPLETELY DIFFERENT PRIOR-STRENGTH SCALE and HARD FLOOR/CEILING CAPS the main system doesn't
> use**. …**design it as an EXPLICITLY SEPARATE, CLEARLY-LABELLED path FROM DAY ONE — DON'T let it
> SILENTLY SHARE THRESHOLDS with the main system, and DON'T ASSUME A FIX TO ONE TOUCHES THE OTHER.**"*

**⚠ NBA already has thin-data props on the shared path.** **`fgm`, `fta`, `oreb` and `dreb`** are
recorded as *"configs are the **closest certified analogue** — NOT yet certified"* — **certified
thresholds assigned by analogy**, with no separate label beyond a code comment. **`turnovers`, `fga`,
`fg3a`, `ftm`, `personal_fouls`** are *"configured, NOT yet run."*

> ⚠ **Both lists corrected 2026-09-21 (§T9.35b, §T9.35c)** — they read *"`fgm` and `fta`"* and omitted
> `fga`. **The authority is `classification_ladder_v12.py`**: the docstring at **line 11** names five
> configured-not-run props including **`fga`**, and the `# ADDED 2026-09-12 … NOT yet certified`
> comment governs the **last four** `PROPS` entries — `fgm`, `fta`, **`oreb`, `dreb`**. 🔴 **`oreb` and
> `dreb` are also two of the four props missing from `prop_taxonomy`** (§T9.19c) and both ship ladder
> rows, so they are **uncertified, untaxonomised and live**. ⚠ **TWO of the five configured-not-run
> props are called certified elsewhere** *(extended §T9.36a)*: **`fga`** — line 11 versus its own
> `# CERTIFIED both seasons (0.9 / 1.3, 0 band misses)` at line **103** *(corrected from 102, §T9.42c)*, **a contradiction inside the
> file** — and **`ftm`**, which carries **no inline certification marker** but appears in the owner's
> T9 certified six (`points, rebounds, assists, 3PM, FGA, FTM`), **a contradiction between the file
> and the record**. **Which governs is NOT RECORDED; line 11 is undated.**
Per-prop tuning exists (`k_stab`, `SHIFT_LAMBDA`) — **but that is parameter variation within one
system, not the separate labelled path specified.** No hard floor/ceiling caps, no distinct
prior-strength scale.

### 4. ⚠ MISCLASSIFICATION IS A QUIET SOURCE OF A WRONG PROBABILITY
> *"**Player/context classification tiers DETERMINE WHICH PRIOR A PLAYER GETS SHRUNK TOWARD — a
> MISCLASSIFICATION here is a QUIET, INDIRECT SOURCE OF A WRONG FINAL PROBABILITY**, not just a
> display [issue]."*

**The tier is not a label — it selects the prior.** A player in the wrong `role_tier` is shrunk toward
the wrong mean, producing a plausible probability with no error anywhere.

**NBA's exposure:**
- `role_tier` comes from **`mu_role` = a 20-game rolling mean with `min_periods=5`** — so **5–19 games
  yields a tier from a thin window**
- **The team-change discount resets that window** (≥5 competitive games with a new team → use only
  those) — **a traded player is re-tiered on as few as 5 games**
- `role_tier is None` drops the leg entirely (visible), **but a WRONG tier is silent**
- ⚠ **T8's v9 made role tiers load-bearing twice** — *"rate tiers ranked WITHIN role tier"* — so a
  misclassified role tier now selects the wrong prior for **both** dimensions
**Cascade**: **empirical per-tier outcome table** (requires **≥300 games/tier**; *"sums real observed
P(0..threshold), **no assumed family**"*) → **NegBin/Poisson** for counts → **Normal** with a real
prediction interval.

**Hierarchical fallback (v10)** — *"sparse cells **(tier × role × rung) → (band × role × rung) →
(band × rung)**, each shrunk toward the next level, **BEFORE ever reaching parametric**. Coverage went
to **100%**."*

**Family by prop and band**: low counts (3PM, Blk, Stl, TO, low-volume Reb/Ast) → **NegBin** (*"NBA
stats are overdispersed; **Poisson underfits**"*); high-mean (>10) → **Normal**; combos and fantasy →
**Normal** (sums), but **simulated, never fit directly**.

**A model rejected on a variance test before being built**: *"**3PM makes given attempts are
BINOMIAL** (var ratio **0.94** in every attempt band) — **so beta-binomial was rejected *before* being
built**; attempts are Poisson."*

### 3.9 Shift vs replacement mode
**Shift** = a **logit-level adjustment on the parametric** — *"calibrate level, **preserve
ordering**."* **Replacement** = use the empirical table directly.
**Decided PER PROP by evidence:**
```
SHIFT_LAMBDA = threes_made:1.0, blocks:0.5, steals:0.5, ftm:0.5, oreb:0.5
# turnovers/fouls tested at 0.5 and 0.25 and were WORSE than replacement -> stay replacement
```
**Why shift fixed 3PM**: the empirical cells keyed on attempt tier × role **averaged a 33% and a 42%
shooter together**, *"shrinking away the make-rate ordering the parametric already knew."*
**−4.6 pp → within ±2.3 everywhere; worst-rung cells from a full page to ONE.**
**FTM was diagnosed as the same compound shape** and fixed the same way (λ=0.5).

### 3.8b THE CORE SCORING MATHEMATICS, AS SPECIFIED
*Source: T1, blueprint §4b. Recorded 2026-09-20.*

Framed as *"directly relevant to NBA given its props are almost entirely count-type"* — and:
> *"NBA's props (points, rebounds, assists, threes, steals, blocks) are **essentially ALL count-type
> stats — arguably an EVEN BETTER FIT for this design than MLB's mixed rate/count prop universe.**"*

### Overdispersion correction — the measured cost of getting it wrong
> *"**A plain NORMAL APPROXIMATION SYSTEMATICALLY OVERSTATES TAIL PROBABILITIES (P(X≥k)) for
> small-mean, right-skewed count data** — MLB found **real 20–55 POINT OVERCONFIDENCE GAPS on its own
> rare-count props** before fixing this.
> **The correct approach: use a TRUE POISSON TAIL for low-mean, low-overdispersion cases, and a
> NEGATIVE-BINOMIAL-BASED correction once overdispersion EXCEEDS A THRESHOLD.**
> **Build this distinction into NBA's scoring engine FROM THE START** rather than defaulting to a
> Normal approximation for any counting stat — **VERIFY PER-PROP EMPIRICALLY whether real variance
> exceeds the Poisson-implied variance (the definition of overdispersion) and ROUTE ACCORDINGLY.**"*

**✅ NBA followed this.** The `PROPS` config routes per prop by `family`: **`negbin`** for
turnovers, fg3a, fta, personal_fouls; **`auto`** for fga, fgm; **Normal** for high-mean points/reb/ast.
The T7 research states it in the same terms — *"**NBA stats are overdispersed; Poisson underfits**."*

**And the "verify per-prop empirically" instruction was followed literally**: *"**3PM makes given
attempts are BINOMIAL — var ratio 0.94 in every attempt band** — so **beta-binomial was rejected
BEFORE being built**; attempts are Poisson."* **That is the overdispersion test, run per prop, with
the measured ratio.**

**The 20–55 point figure is the scale of what this avoids** — and NBA's far tails came out exact
(3PM +6 rung: predicted 0.002, actual 0.002) after the upper-only ceiling fix.

### Sample-support clamping (Wilson score interval)
> *"**Below a real sample-size threshold (MLB used n=30), DON'T TRUST THE RAW MODEL'S OUTPUT
> DIRECTLY — bound it to a statistically-defensible CONFIDENCE INTERVAL AROUND THE OBSERVED RATE
> instead; at or above the threshold, trust the model.**"*

**✅ NBA implements this**: *"**Wilson clamp below n=30**"* — the same threshold.

### ⚠ THE DUPLICATION RISK, NAMED — with its prescribed fix
> *"**Real, costly duplication risk to avoid**: MLB **implemented this clamp in TWO SEPARATE CODE
> LOCATIONS**, and **any future threshold change requires updating BOTH or THE SYSTEM PRODUCES
> INCONSISTENT BEHAVIOR DEPENDING ON WHICH CODE PATH A GIVEN PROP HAPPENS TO ROUTE THROUGH.**
> **When porting this logic to NBA, IMPLEMENT IT EXACTLY ONCE, IN A SINGLE SHARED FUNCTION EVERY PROP
> ROUTES THROUGH — DON'T LET CONVENIENCE DUPLICATION HAPPEN EVEN INITIALLY.**"*

**The prescribed fix is a single shared function, and NBA did not do that** — singles and combos are
separate certified files, each with its own constants. **The failure mode named is exactly the risk:
inconsistent behaviour depending on which path a prop routes through.**
*(Combos route through `combos_ladder_v1.py`; singles through `classification_ladder_v12.py`.)*
Recorded in `NBA_OPEN_ITEMS.md`.

### Recency-weighting profiles tuned PER PROP by real volatility
> *"**not a single global blend**: props that **STABILIZE QUICKLY** should **weight recent games
> heavily and shrink LIGHTLY toward a prior**; **rare, volatile, high-variance events** should
> **weight recent games LESS and shrink HARD toward a prior**, since **a short hot/cold streak on a
> rare event is MOSTLY NOISE**.
> **For NBA, expect a similar real spread**: **minutes-driven, high-frequency stats (points, rebounds
> on a per-minute basis) likely stabilize FASTER than low-frequency events (blocks, steals,
> thre[es])**."*

**✅ This is `nba_config.stat_decay_config`, predicted before any NBA data existed.**

| Prediction | Measured outcome |
|---|---|
| high-frequency stabilises faster | **pts_rate α=0.12 / 25 games; reb_rate α=0.08 / 40** |
| low-frequency shrinks harder | **blk_rate α=0.08 / 50; stl_rate α=0.10 / 60; fg3_pct α=0.03 / 300** |
| *"a short hot/cold streak on a rare event is mostly noise"* | **fg3_pct rationale: *"takes hundreds of attempts to stabilise; a 10-game hot/cold streak is mostly noise"*** — nearly the same words |
| *"not a single global blend"* | **MLB's fixed 5/10/20/season blend was rejected as *"the single biggest thing that does NOT transfer"*** |

### ⚠⚠ THE MONOTONICITY BUG — two props that are secretly the same event
> *"**A real, costly monotonicity bug worth actively guarding against**: MLB found **two of its own
> props measuring the *LITERALLY IDENTICAL UNDERLYING EVENT*** — **a specific stat crossing 0.5 is
> mathematically the same real-world occurrence as a related, differently-named stat crossing its own
> 0.5 at the shared threshold** — **were given DIFFERENT SHRINKAGE TREATMENT.** The resulting
> inconsistency **grew from a 40% VIOLATION RATE to 97% BY PLAYER TIER before being caught.**
> **For NBA: CHECK EXPLICITLY for any pair of props/combo-stats that SHARE AN UNDERLYING EVENT AT A
> GIVEN THRESHOLD** — e.g. **a specific single-category prop crossing zero versus a COMBO PROP THAT
> NECESSARILY CROSSES ZERO AT THE SAME MOMENT** — **and make sure they receive IDENTICAL TREATMENT.
> Don't let two nominally-different props that are SECRETLY THE SAME EVENT dri[ft apart].**"*

**40% → 97% violation rate.** The inconsistency compounded by player tier before detection.

### ⚠ NBA HAS EXACTLY THIS PROP SHAPE, AND IT IS UNCHECKED
**Shared-event pairs present in the 28-prop taxonomy:**
| Pair | Shared event |
|---|---|
| **`blocks` 0.5 and `stocks` 0.5** | if a player has 0 steals, `stocks ≥ 1` **is** `blocks ≥ 1` |
| **`steals` 0.5 and `stocks` 0.5** | the mirror case |
| **`points` 0.5 and `pts_reb` / `pts_ast` / `pra` 0.5** | at the bottom rung these co-trigger |
| **`rebounds` 0.5 and `reb_ast` 0.5** | same |
| **`double_double` and its components** | DD requires two categories ≥ 10 — **necessarily determined by the component props** |

**Why NBA is partly protected and partly not:**
- ✅ **Combos are SIMULATED from calibrated marginals, not fitted independently** — *"joint structure,
  never a direct fit"* — so a combo inherits its components' treatment **by construction**.
- ✅ **`stocks` is recorded as *"inherits the blocks/steals floor"*** — the inheritance is explicit.
- ⚠ **But the two recipes are SEPARATE FILES with separate constants** (§3.8b duplication risk), and
  **`SHIFT_LAMBDA` differs by prop** (`blocks: 0.5`, `steals: 0.5`) while combos route through
  `combos_ladder_v1.py` entirely.
- ⚠ **`double_double` carries a sentinel −1.0 and has NO LADDER**, so it is handled by a different
  path again.

**The check T1 asks for — do shared-event pairs receive identical treatment at the shared threshold —
is not recorded as having been run.** **And the failure mode is monotonicity**, which the calibration
technique section (§3.9b) independently names as one of the three defects that disqualify
histogram-binning.

**Recorded in `NBA_OPEN_ITEMS.md`.**

**The one refinement the recency prediction did not contain**: **splitting a single stat by
component** — `fg3a_rate` (α=0.12, short) vs `fg3_pct` (α=0.03, long), because *"attempt VOLUME,
unlike make %, is role/scheme-driven."* **The blueprint predicted per-prop spread; the build found
per-COMPONENT spread within a prop.**

---

## 3.9b THE CALIBRATION TECHNIQUE — what to use and what to reject
*Source: T1, blueprint §4a. Recorded 2026-09-20.*

### ❌ REJECT additive / histogram-binning calibration
> *"**Reject additive/histogram-binning calibration** (a lookup table adding flat corrections per
> probability bin) — **it produces real, serious problems**:
> **DISCONTINUITIES** — a tiny input change causing a huge output jump at a bin boundary;
> **NON-MONOTONICITY** — a genuinely higher raw probability mapping to a LOWER calibrated one;
> **BOUNDARY VIOLATIONS** — results pushed outside 0–100%."*

### ✅ USE a continuous, monotonic-by-construction transformation
> *"**Platt scaling — fit `A·logit(raw_p) + B` IN LOGIT SPACE** — or **isotonic / beta
> calibration**."*

**NBA uses per-rung Platt in logit space**, which is this specification. **And the `ladder_calibration_asof`
table stores exactly `log_odds_shift`** — the `B` term, per season × prop × phase × band × side.

**⚠ Note what the rejection rules out**: a per-band *additive* correction table is precisely the
"histogram binning" form named here. **NBA's band cells must therefore be applied as logit-space
shifts, not as flat probability offsets** — which is what *"switching the cell to a LOGIT-LEVEL SHIFT
on the parametric"* (the 3PM fix) did.

### ⚠ BE WILLING TO REJECT A STATISTICALLY VALID FIT
> *"**Critically, BE WILLING TO REJECT A FIT EVEN WHEN IT'S STATISTICALLY VALID** if the resulting
> **real-world shift is IMPLAUSIBLY LARGE** — MLB **correctly rejected TWO Platt fits that PASSED
> MONOTONICITY but implied UNREASONABLY LARGE CORRECTIONS**, on the reasoning that **A HUGE 'FIX' IS
> ITSELF A SIGN SOMETHING ABOUT THE FIT OR THE UNDERLYING FACTOR IS WRONG, NOT PROOF THE CORRECTION IS
> NE[EDED]**."*

### ✅ NBA HAS THIS GUARD — verified in the code 2026-09-20
`classification_ladder_v12.py` line 670:
```python
if shift > 0.15: continue          # reject the fit outright
rel.loc[cur_idx, "p_over"] = sigmoid(A * logit(rel.loc[cur_idx, "p_raw"].values) + B)
platt_log.append({… "A": …, "B": …, "n_fit": int(len(hist)), "max_shift": round(float(shift), 4)})
```

**A fitted Platt curve whose maximum shift exceeds 0.15 is DISCARDED**, not applied — the leg keeps
its `p_raw`. **That is precisely the prescribed guard: a fit can be statistically valid and still be
rejected for implying too large a correction.**

**And `max_shift` is LOGGED per fit** in `platt_log` → `platt_fits` → `baseline_ladder_runs`, so
**every applied shift's magnitude is inspectable after the fact.**

**Three properties this gives the calibration layer:**
| Property | Mechanism |
|---|---|
| Magnitude bound | **`shift > 0.15` → skip** |
| Sample bound | **`n_fit` recorded**; the n≥1,000 gate |
| Auditability | `A`, `B`, `n_fit`, `max_shift` stored per `prop × var_band × role_tier × offset × month` |

**⚠ This corrects an earlier note in this file.** I recorded that *"no magnitude sanity check on the
fitted shift is recorded."* **There is one, in the recipe, at 0.15.**
**What remains genuinely unverified is whether `build_asof_calibration.py` — the SEPARATE weekly
production refit that writes `ladder_calibration_asof` — carries the same guard.** The recipe and the
production refit are different code paths, and only the recipe has been read.

**⚠ THE OWNER'S STATED PREFERENCE, FROM T1 — read this before trusting automated calibration:**
> *"there is a **daily automated calibration engine** (runs **Platt scaling, beta, and possibly other
> techniques**) that **in their experience OFTEN OVER-FLATTENS / FLATTENS TOO MUCH**"*
> *"**prefers calibration to be done MANUALLY rather than via the automated daily calibration**
> [engine]"*

**This is an experience-based warning about the exact technique NBA applies automatically.**
**Over-flattening is the failure mode**: a calibrator that pulls everything toward the base rate
destroys precisely the tail discrimination the goblin/demon work depends on.

**NBA's mitigations, arrived at independently, happen to answer it:**
- **Per-rung Platt**, not one curve across the ladder — *"Platt across the whole ladder helped points
  but **HURT rebounds**."*
- **Variation band in the Platt key**, with a band-level pool fallback.
- **The upper-only ceiling** — the symmetric version *"forced true 0.002 rungs up to 0.25"*, which is
  over-flattening in its most extreme form.
- **A gate of n≥1,000 per cell** so thin cells are not calibrated at all.

**⚠ Still unverified for NBA**: whether the fitted Platt curves are flattening the tails. **The
diagnostic is cheap** — `final_hp` retains **`p_raw`** alongside `p_more`/`p_less`, so the
pre-calibration and post-calibration distributions can be compared per rung directly.

**The mechanics:**
*"Platt across the whole ladder helped points but **HURT rebounds**; **per-rung** Platt fixed both."*
**Variation band added to the Platt key** (v10) → *"Points STARTER dropped off the worst-cell list
entirely."*

### The Platt key, as actually implemented *(verified in code 2026-09-20)*
`platt_log` records one fit per:
```
prop × var_band × role_tier × offset × month
```
**Five dimensions** — and `offset` is the **rung**, `month` is what makes it **walk-forward**.

**`side` (More/Less) is NOT in the key — but verified 2026-09-20 to be structurally unnecessary**, as
`p_less = 1 − p_more` and only `p_over` is calibrated. **`offset` (the rung) carries the
above/below-anchor axis that actually varies.** *(§5.6.)*

**Each fit stores `A`, `B`, `n_fit` and `max_shift`** — so the applied transformation is
`sigmoid(A · logit(p_raw) + B)`, **with the raw value retained**.

**Platt is fit on the season's prior months** (production `asof_lag: 0 days`).
**⚠ Gate**: needs **n≥1,000 per cell**; the ELITE rebounds band has **699**.
**⚠ Magnitude gate**: **`shift > 0.15` → the fit is discarded** (§3.9b).

**The two gates together are why the calibration layer is conservative**: a cell must have both
**enough sample** and **a plausible correction** before anything is applied. **A cell failing either
keeps its parametric/empirical value untouched.**

## 3.10b THE AS-OF LEAK — a known failure with MLB precedent

**MLB found this in its own backtest table (T1, relayed 2026-08-29):**
> *"**CRITICAL PIVOT**: **`backtest.baseline_v6_asof` was found to LEAK each leg's own game-day into
> its own as-of prediction** (**`as_of_date = D` includes day D's game**; verified via
> `non_push_sample` matching game-log counts)"*

**The same class of bug then appeared in NBA** — the FRINGE anomaly was *"a season-wide mean using
future games"* (T8), and the as-of calibration parity violation was a pasted table carried across days
(live session).

**Three instances of one failure mode**: as-of contamination is the recurring bug of this system, and
it always presents as **inflated apparent skill**. **The MLB verification method transfers**: check a
non-push sample against game-log counts.

**And the fix workflow, from the same note:**
> *"research/debug/simulate fixes **at large sample sizes across all individual niches** of the
> enrichment pipeline first; **only once solutions are very well developed**, [test] **on the backtest
> tables**; **only if that testing behaves very well, move to live tables**."*

### 3.11 Guards and caps
- **Wilson clamp below n=30**
- **Sample-size ceiling on confidence**
- **Discontinuity override** — role change / long gap → use only role-consistent recent games
- **⚠ UPPER-ONLY CEILING.** The ported MLB guard was **symmetric** and *"forced true 0.002 rungs up to
  0.25"* — a **125× error at the far tail**. Fixed here; **may still be live in MLB.**

> **CAPS ARE A LAST RESORT.** *"tier-specific if ever used — **the preference is logic that lands on
> the right number on its own**."*

---

## 4. THE FACTOR LAYER — lifts and penalties

**Fit in LOG-RATE SPACE, so unneeded factors go to zero on their own** — the owner's *"no forced!"*
implemented as a property of the fit.

**Measured coefficients (T9), stable across seasons:**
| Factor | Coefficient |
|---|---|
| blocks ← opponent paint share | **0.30 / 0.37** |
| steals ← opponent turnover rate | **0.27 / 0.26** |
| points ← opponent defensive rating | **0.53** |
| rebounds ← opponent miss rate | **0.33** |
| pace → points | **1.17** (elastic; unstable for defensive props on one season) |
| **home, back-to-back** | **≈0 EVERYWHERE — the minutes model already carries them** |

**Effect size, honestly**: *"**Brier improves 0.1–0.3%**, calibration unchanged. A ±3% pace edge moves
a 20-point player **~0.7 points — about 2 pp of probability**. …**not where the big gains are.**"*

**Factor ranking for lifts/penalties (T7), historical-only:**
1. **Minutes mean AND STABILITY** — *"the NBA plate-appearance equivalent"*
2. Usage share
3. **Starter vs bench** — *"a primary split"* (implemented as the 6-band role tier)
4. **Role consistency / discontinuity guard** — *"more important than in MLB"*
5. Historical pace
6. Home/away and days-rest splits
7. Historical performance vs **defence TYPES** (not tonight's opponent)
8. Scoring composition — *"**low value for the mean, HIGH value for variance shape**"*

**Seed cells encoded**: blowout conditioned on role × variation × direction (*"a penalty for a role
player's 'more', **a LIFT for a fringe garbage-time accumulator**, small help on a star's 'less'"*);
assists hit hardest by blowouts; B2B penalising 3PM more than points; pace as one geometric-mean
feature; DvP quantile bands; teammate-shooting as the assists penalty; "second big out" as the
rebounds lift.
**Every cell carries `min_real_sample_threshold` and `stabilization_reference_games`** — *"cells under
sample are **fully shrunk to prior from day one**."*

**Cell key**: `factor × prop × tier × role_tier × direction × variation_band`, with dedicated
`cap / lift / penalty / coefficient` columns.
**`factor_relevance` is a GATE that runs BEFORE tier logic** — full/partial/none. 460 relevance rows,
35 fitted cells: **relevance is permission, cells are evidence.**

---

## 5. THE PERMANENT RULES

### 5.0 The nine iterations, with their exact figures *(the owner's "do not move before fixing it")*
| # | Step | Measured |
|---|---|---|
| **v1** | parametric alone | **points tails −9.8 pp**; **role bias fringe +7.5 pp** |
| **v2** | role minutes multiplier + **heteroscedastic dispersion prior** | *"points var/mean **3.4 → 2.0 by mean band**; **a flat 1.5 default was wrong**"* |
| **v3** | **EMPIRICAL `rate_tier × role_tier × rung` tables (min 300) as PRIMARY** | **points ladder ±4 → ±1.2** |
| **v4** | monthly walk-forward rebuild | absorbs the 2025-26 regime shift |
| **v5–6** | cell shrinkage toward parametric | made far tails **worse** → exposed the **symmetric-floor bug** (0.002 forced to 0.25) → **upper ceiling only** |
| **v7–8** | Platt | whole-ladder helped points, **hurt rebounds** → **per-rung** fixed both |
| **v9** | **role-aware tier priors** (rate tiers ranked *within* role tier) | resolved the persistent star/fringe residual |

**`heteroscedastic dispersion` is the one most easily missed**: variance/mean is **not constant** —
it runs **3.4 at low scoring levels down to 2.0 at high ones**. A single dispersion default is wrong
for every band but one.

**Plus the leakage fix**: a season-wide mean using future games — *"that was the entire FRINGE
anomaly"* — after which the role minutes multipliers *"shrank to **honest ~1.0 values**."*

## 5.2 THREE ACADEMIC-LITERATURE CAUTIONS FOR THE CALIBRATION LOOP
*Source: T1, blueprint §4d — "all worth building into NBA's calibration loop from day one."
Recorded 2026-09-20.*

### 1. ⚠ Shrinkage does not automatically improve results
> *"**Shrinkage DOES NOT AUTOMATICALLY IMPROVE RESULTS, and THE CORRECT SHRINKAGE AMOUNT IS HARDEST TO
> ESTIMATE EXACTLY WHERE IT'S NEEDED MOST (low sample size).**
> **The established, real countermeasure is BOOTSTRAP-BASED ESTIMATION OF SHRINKAGE INTENSITY,
> RE-ESTIMATED PERIODICALLY FROM EACH CELL'S OWN REAL OUTCOME HISTORY — NOT ONE STATIC, HAND-PICKED
> GLOBAL CONSTANT.**"*

**The paradox is the point**: shrinkage is most needed at low `n`, and low `n` is exactly where its
correct magnitude is least estimable.

**NBA's position is mixed:**
- ✅ **Not a global constant** — `k_stab` is **per prop and measured** (STL 125, TOV 60; BLK 1.7×
  points), and `stat_decay_config` carries 13 per-stat values
- ✅ **Method-of-moments (Efron-Morris) rather than hand-picked**
- ⚠ **Not bootstrap-estimated**, and **not re-estimated per cell from that cell's own outcome
  history** — the values are fit on TRAIN and carried
- ⚠ **T8 measured the estimation problem directly**: *"data-fit prior strength is **k≈2 against the
  population** but **k≈100–250 against tier-mates (circular)**"* — **two orders of magnitude apart
  depending on the reference**, which is this caution in numbers

### 2. ⚠ Time-series feature leakage — the two rules
> *"**Any trailing/rolling statistic MUST be computed STRICTLY BACKWARD-LOOKING (only real games
> BEFORE the prediction date)**, and **validation MUST use TIME-BASED SPLITTING (train on earlier
> data, test on later data) — NEVER A RANDOM SHUFFLE, which SILENTLY LEAKS FUTURE INFORMATION INTO
> TRAINING.**"*

**✅ NBA satisfies both, structurally.** Every feature is **`shift(1)`-based** (*"the backtest harness
on a past day IS already the production computation"*), and the validation is **season-holdout plus
monthly walk-forward** — train 2023-24, test 2024-25; never a shuffle.

**⚠ And the record shows why the rule is stated twice**: NBA still produced **three as-of
contamination instances** (the FRINGE season-wide mean, the pasted calibration table, plus MLB's own
`baseline_v6_asof`) **despite the architecture being right**. **Structural correctness did not prevent
a leak from being introduced in an analysis step.**

### 3. Monotonic constraints — valuable specifically for rare events
> *"**Monotonic constraints are genuinely valuable SPECIFICALLY IN RARE-EVENT, LIMITED-DATA
> situations**, where **a model might otherwise OVERFIT A RELATIONSHIP THAT SPURIOUSLY REVERSES
> DIRECTION** — e.g. **a factor that should ONLY EVER INCREASE a rate getting fit to OCCASIONALLY
> DECREASE it, purely from NOISE IN A THIN SAMPLE.**"*

**⚠ No monotonic constraint is recorded anywhere in NBA's factor fitting.** Factors are fit in
log-rate space with no sign constraint, so **a factor with a known direction can be fit against it in
a thin cell.**

**Where this bites here**: **the rare-event props are the CLOSE ones** (blocks, steals) and
**the goblin/demon tails** — exactly the two areas named as unresolved. **And lesson #4's
pre-stated falsification bar names "required MONOTONICITY" as one of its three components**, so the
concept is present in the standard but absent from the implementation.

**Related and already implemented**: the **ladder itself** is monotonic by construction (rungs
ordered), and the **upper-only ceiling** fix was about preserving tail ordering. **The gap is at the
FACTOR level, not the ladder level.**

---

## 5.6 ⚠⚠ OUT-OF-SAMPLE VALIDATION IS NECESSARY BUT NOT SUFFICIENT
*Source: T1, blueprint §7f — "a profound calibration lesson." Recorded 2026-09-20.*

> *"MLB found **a real, concrete case where a statistical calibration fit GENUINELY PASSED HONEST,
> HELD-OUT, OUT-OF-SAMPLE VALIDATION — it BEAT BOTH THE RAW BASELINE AND A STANDARD CALIBRATION METHOD
> on real held-out error metrics — AND WAS STILL STRUCTURALLY WRONG.**
> **The fit had been computed WITHOUT DISTINGUISHING BETWEEN TWO SIDES OF A MARKET (OVER/UNDER), and
> ended up DOMINATED BY ONE SIDE'S PATTERN, SILENTLY MISAPPLIED TO THE OTHER SIDE.**
> **THE AGGREGATE IMPROVEMENT METRIC DID NOT CATCH THIS, BECAUSE IT WAS AVERAGED ACROSS BOTH
> SIDES.**"*

**A fit can beat the baseline, beat a standard method, and still be wrong for half the rows it
touches.**

### The prescribed rule
> *"**An AGGREGATE VALIDATION METRIC PASSING IS NECESSARY BUT NOT SUFFICIENT — ALWAYS CHECK WHETHER A
> PROPOSED CORRECTION IS GENUINELY APPROPRIATE FOR EVERY MEANINGFULLY DISTINCT SUBGROUP IT WILL BE
> APPLIED TO — both sides of a market, every relevant tier — NOT JUST THE POOLED AVERAGE.**
> **And KEEP A HUMAN REVIEW STEP BEFORE APPLYING ANY CALIBRATION CORRECTION EVEN WHEN IT HAS
> TECHNICALLY PASSED VALIDATION.**"*

### ✅ NBA's Platt key already carries `side`-adjacent structure — but check the gap
**NBA's fits are keyed `prop × var_band × role_tier × offset × month`.** **`offset` is the rung**, and
rung sign encodes direction relative to the anchor — **but `side` (More/Less) is NOT in the key.**

**⚠ That is precisely the MLB failure's shape.** A fit dominated by More rows and applied to Less rows
would pass an aggregate check.

**Two NBA findings suggest the exposure is real:**
- The harness header records misses stated **per side** — *"**blocks MORE 70–75: −4.3**"*, *"**fg3m
  LESS 30–35**"* — **so the residuals differ by side**, which is the condition under which a
  side-blind fit misapplies.
- The ladder's own calibration is checked *"both sides"* at certification, **but the Platt refit key
  does not separate them.**

**Worth verifying**: whether `p_more` and `p_less` are fit independently (the ladder produces both) or
whether one calibration curve is applied to both. **The certification's "0 misses of 37" is an
aggregate across sides** — exactly the metric this lesson says cannot catch the error.

### ✅ NBA IS STRUCTURALLY PROTECTED — verified in code 2026-09-20
**The MLB failure required a fit to mix two sides into one curve. NBA's cannot, because it models ONE
side only:**
```python
rel["p_raw"] = rel["p_over"].copy()
for (prop, vb, role, off), grp in rel.groupby(["prop","var_band","role_tier","offset"]):
    ...
    rel.loc[cur_idx, "p_over"] = sigmoid(A * logit(rel.loc[cur_idx,"p_raw"].values) + B)
```
**The calibrated quantity is `p_over`, and `p_less = 1 − p_more` by construction.** There is **no
separate Less population to be dominated** — the two sides are a single probability and its
complement.

**And the `offset` (rung) IS in the key**, so a line below the anchor and one above get different
fits. **That is the axis that actually varies here; `side` is not an independent dimension.**

**⚠ The residual concern is narrower but real.** A Platt curve fit on `p_over` is **monotone in
`p_over`**, so it necessarily transforms `p_less` too — and **a curve tuned where `p_over` is
concentrated may be less well tuned at the opposite end of the range.** The harness's own per-side
misses (*"blocks MORE 70–75: −4.3"*, *"fg3m LESS 30–35"*) are consistent with that: **the errors live
at different points on the same curve.**

**So the structural bug is absent; the subgroup-check discipline still applies** — per-rung, per-band,
per-role-tier, **which is exactly what the five-dimensional key delivers.** **NBA's key is finer than
the one that failed for MLB.**

### ⚠ MANDATORY HUMAN REVIEW — not unattended auto-application
> *"**External research on ML model monitoring converges on a related, concrete operational
> recommendation worth adopting directly: WEEKLY RECALIBRATION CHECKS, WITH TRIGGER-BASED RE-FITTING
> AND MANDATORY HUMAN REVIEW BEFORE APPLYING — NOT FULL UNATTENDED AUTO[-APPLICATION].**"*

**⚠ NBA's as-of calibration refits and applies WITHOUT a review step.** P2 runs the refit at step 14
and `build_final_hp.py` consumes it on the next run. **The cadence matches (weekly-ish), the
trigger-based part is absent, and the human review is absent.**

**The `shift > 0.15` guard is a partial substitute** — it blocks implausible magnitudes
automatically — **but it cannot catch a plausible-magnitude correction that is wrong for one
subgroup.** That is exactly the case this lesson describes.

### ⚠ WHAT THE MISSING REVIEW STEP COST MLB — the precedent behind the rule
*Added 2026-09-20 (T1 pass 29). Blueprint §7f, final paragraph — **not previously recorded**.*

> *"MLB's own history includes a real, costly case of **TWO PROPS RUNNING WITH ZERO ACTIVE CORRECTION
> FOR ROUGHLY TWO AND A HALF WEEKS** after a root-cause fix, showing real **30–45 PERCENTAGE POINT
> OVERCONFIDENCE GAPS**, **UNDETECTED UNTIL SOMEONE MANUALLY CHECKED** — directly motivating the
> coverage-gap diagnostic described in Section 4c above."*

**Three things this pins down that the rest of §5.6 did not:**
1. **The failure is silent and long-lived, not loud.** Nothing errored for two and a half weeks. The
   only detection event on record is *a person looking.*
2. **The magnitude is not marginal** — **30–45 percentage points** of overconfidence. That is a leg
   sold at 80% hitting at 35–50%.
3. **§7f and the coverage-gap check are ONE design, split across the blueprint.** The blueprint states
   the precedent *"directly motivated"* the diagnostic recorded at
   `NBA_FINAL_SCORING_CALIBRATION.md` §7m Safeguard 1. **That diagnostic is NOT RECORDED as built for
   NBA.** So the missing human review and the missing coverage-gap check are **the same gap seen from
   two sides**, and NBA currently has neither.

**The exposure profile for NBA is worse than MLB's in one specific way**: MLB's gap ran two and a half
weeks with someone available to notice. **NBA's P2 is designed to run unattended through a
season**, and the season opens **2026-10-20** *(corrected 2026-09-21, §T10.18b — this line read
2026-10-03, which is preseason opening night)*. **SEASON-START RELEVANT.**

**① A band cell is kept ONLY if its sign is consistent across seasons.**
Rebounds ELITE under-projected in both → **structural**, kept. 3PM mid-bands **+2.8 / −3.6** →
**regime**, dropped (*"frozen cells actively hurt"*); walk-forward tables + in-season Platt carry it.

**② Rung-aggregates hide errors.** *"The first leg-level breakdown exposed structured misses that had
**cancelled out in the averages**."* A ladder accurate to 1 pp can hold a +5.4 and a −3.5 band.

**③ No pasted constants.** HCA, `P(blowout|spread)` and the blowout ratios are **derived from TRAIN
inside the run**. ~~`baseline_ladder_runs.factor_fits` / `.role_minutes_multiplier` store what each
run derived.~~ 🔴🔴 **CORRECTED 2026-09-22 (T20 pass 109, `§T20.114`): they store what ONE of the
run's thirteen-plus invocations derived**, because the merge step is `meta = meta or d["meta"]` over a
`sorted()` glob and recomputes only `rows`, `props` and `players`. **Live: `assists · season_phase ·
steals` on all three rows, against 18–22 props.** ⚠ **The PRINCIPLE stands — the fits ARE derived in
the run, nothing is pasted — but the AUDIT TRAIL that was supposed to prove it covers 2 props of 22.**
▶ **`T20-20`. Documented, not fixed (rule 1).**

**④ Per-player granularity fails — three times.** Player-own L0 cells *"REJECTED ON DATA (n=40–80;
regression-noise dominated; ELITE rebounds ±7.7)"*; A2's with/without table retracted; conformal
confidence dominated by noise. **Granularity lives in TIERS.**

**⑤ Test new factors against the props that ALREADY PASS, first** — *"if factors hurt the certified
ones that's the most important thing to know."*

---

## 6. THE PERIOD LAYER — where the mixture IS implemented

**Three-part mixture**, everything fit on train: **state probabilities (close / medium / blowout) from
the derived spread**, and per **role × state** a **sit-out rate** plus a **"plays" minutes ratio**.

| Role × state | Sit-out | Minutes ratio |
|---|---|---|
| Iron Man, close | 3% | 1.07× |
| Iron Man, medium | 8% | 0.89× |
| **Iron Man, blowout** | **45%** | 0.64× |
| **Fringe, blowout** | 18% | **2.9×** |

**Per-stat rate ratios by game state** also live in the state table:
**hero-ball assists ~0.9× · bench scoring 0.84× · stars' close-game scoring 1.09×** (FGA 1.13×,
FTA 1.18× — *"**they take over**"*; a close-game rate penalty for stars was tested and **rejected**).

**`P(OT)`** — measured **5.3% at pick'em → 1.9% at 15+**, modelled as a **mixture branch**, not a mean
bump (*"a star either gets ~5 crunch minutes or none"*).
**OT is isolated as `full-game − (Q1+Q2+Q3+Q4)`.** Halves = Q1+Q2 / Q3+Q4.

**Per-layer traps**: 1Q per-minute rates are **not** constant across quarters; **1H ≠ 50% of a
game — it is ~48–49%**; 2H/4Q are **bimodal or trimodal** for stars (sample minutes first, then the
outcome conditional on them).

**Prior strength scaled to a quarter's information content** — the winner's-curse fix (§3.7).

---

## 7. COMBOS — joint structure, never a direct fit

> ### ⚠ THIS WAS AN EXPLICIT, COST-JUSTIFIED INSTRUCTION FROM DAY ONE
> *Recorded 2026-09-20 (T1 pass 49). Source: `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1 — the
> instruction was recorded nowhere, though the cost behind it is in `NBA_DATABASE.md`.*
>
> > *"NBA has real combo props (**PRA** etc.)… **treat these as a FIRST-CLASS PROP FAMILY FROM DAY
> > ONE, NOT AN AFTERTHOUGHT**, since MLB's own combo prop (`hits_runs_rbis`) caused **real analysis
> > headaches from being treated as a bolt-on**."*
>
> **✅ It appears to have been followed** — the combo layer below is architectural (simulated from
> calibrated marginals with per-player covariance), not bolted on. **What was missing is that this
> was instructed, with a named MLB cost behind it**, rather than arrived at independently.
> **It matters for future changes**: anything that would make combos a special case of the
> single-stat path is reverting a decision that was made deliberately and paid for once already.

**Simulated from calibrated marginals with PER-PLAYER covariance**, archetype-dependent:
**P–A strongly positive for ball-handlers; R–A positive for bigs (Jokić), negative for guards.**
*"For a do-it-all star, **PRA has LOWER relative variance than its parts**; for a 3-and-D wing,
higher."*

**Double-double**: joint simulation frequency of ≥10 in two categories — **NOT `min` of marginals**.
**The near-miss trap**: *"tier on `P(DD)` from simulation, **NEVER on mean stats** — a **12/12 player
is a FAR better DD bet than a 30/9.9 player**."*

**Fantasy score**: simulated from components. **The 3× multiplier on blocks/steals reintroduces
exactly MLB's home-run lumpiness** — *"a single steal is a 3-point jump"* — producing a fat right tail
a direct fit would smooth away. **⚠ The +3 vs +2 scale conflict is unresolved (see OPEN_ITEMS).**

---

## 8. THE CERTIFIED RESULT

**Both seasons, same configuration, no re-tuning:**
| | 2025-26 | 2024-25 holdout (2023-24 only) |
|---|---|---|
| Points ladder, 13 rungs | 0.9 pp | **1.2 pp** |
| Rebounds | 0.7 | **0.8** |
| Assists | 1.4 | 0.7 |
| 3PM | 1.3 | 1.1 |
| Confidence bands (n≥1000) over 2.5 pp | 3 of 76 | 3 of 77 |
| **Points/rebounds confidence bands** | **0 misses of 37** | **0 of 37** |

*"Every band with real volume hits its stated rate."* **Asserted in the code header on every run.**
**The holdout ran with the band mean-ratio cells DISABLED**, since they had been fitted on 2024-25.

**Certification ladder (T9)**: **6 certified** (points, rebounds, assists, 3PM, FGA, FTM) ·
**4 close** (blocks, steals, turnovers, fouls — *"the noisiest per-game stats in the sport"*) ·
**1 regime** (3PA) · **combos certified** (P+R 0.9, P+A 1.1, R+A 0.9, PRA 1.1, fantasy 0.8) ·
**DD calibrated**.

**Known misses, in the header**: *"blocks more 70–75 **−4.3, n=3900** = **P(0 blocks) under-predicted
for ~1.5 bpg players, persists at any lambda**; blocks less 75–80 −2.6; steals less 60–65 +3.6.
**Holdout shows the same signs.**"*

---

## 9. WHAT "CALIBRATED" MEANS — and does not

> *"It means the stated probabilities are **honest**: when the recipe says 75%, **roughly 75% of those
> legs hit**, on every band, both seasons, out of sample. That is exactly the property that makes
> **slip EV computable and Goblin/Demon pricing comparable**.
> **It does NOT mean any single leg is near-certain — a calibrated 75% still loses one time in four.**
> **Calibration is the foundation; EDGE comes from the factor layer and the enrichment deltas on top.**"*

---

# §F6.11 — 🔴 **THREE MEASURED TABLES WHOSE PARAMETERS ARE NAMED EVERYWHERE AND WHOSE VALUES ARE NOWHERE**

*Added 2026-09-23 by the uncovered-band probe (`§F6`). **`RULE 56` in three more instances** — each
parameter is documented by NAME across multiple files and its measured table is in none.*

## 1 · `min_ratio` — named in **6** documents, valued in **`0`**

*`nba/backtest/classification_ladder_v12.py`. The blowout minutes floor, by role tier — **a
`[low, high]` pair per tier**:*

| role tier | `min_ratio` |
|---|---|
| **iron man** | 🔴 `0.832` – `0.841` |
| high-usage starter | 🔴 `0.837` – `0.855` |
| starter | `0.867` – 🔴 `0.908` |
| rotation | `0.960` – 🔴 `1.003` |
| bench | 🔴 `1.015` – `1.074` |
| 🔴 **fringe** | 🔴 **`1.180` – `1.430`** |

🔑 **The shape is the finding and it inverts across the roster**: *an iron man LOSES ~17% of his
minutes in a blowout; **a fringe player GAINS up to 43%**.* **`min_ratio` crosses `1.0` between
`rotation` and `bench`** — ⇒ ***a blowout is not a uniform minutes haircut, it is a REDISTRIBUTION
down the depth chart***, which is exactly why the factor cannot be applied as a single team-level
multiplier. *`P_BLOWOUT_BINS = [0,2,4,6,8,10,12,15,99]` is on file; the table it multiplies was not.*

## 2 · The ABSENCE PRIOR — measured on **3 seasons, `n = 59,785`**, and it reverses a piece of folklore

*`nba_config.classification_config` → `'absence prior measured'` (2026-09-09).*
**Definition:** *expected rotation player = played ≥2 of the team's last 3 games, ≥15 min average,
missing this game.* **Base rate `0.1043`.**

| split | | |
|---|---|---|
| **rest** | non-B2B `0.097` · **B2B road 🔴 `0.1379`** · B2B home 🔴 `0.1348` | |
| **three-in-four** | no 🔴 `0.0756` · yes 🔴 `0.0985` | |
| 🔑 **prior night ≥38 min on a B2B** | no `0.120` · **yes `0.092`** | 🔑🔑 ***"folklore reversed — heavy load the night before LOWERS absence (healthy stars play)"*** |
| **stars (role ≥32), non-B2B by age** | ≤25 `0.058` · 26–29 `0.078` · 30–32 `0.102` · 33+ `0.078` | |
| **stars, B2B ROAD by age** | ≤25 `0.074` · 26–29 `0.129` · **30–32 `0.140`** · **33+ `0.176`** | *age and B2B-road compound* |
| stars, B2B home by age | ≤25 `0.076` · 26–29 `0.113` · 30–32 `0.102` · 33+ `0.119` | |
| 🔴 **by month** | **Oct `0.034`** · Nov `0.067` · Dec `0.066` · Jan `0.072` · Feb `0.089` · Mar `0.088` · **Apr `0.148`** | 🔴 **April is `4.4×` October** |

🔴🔴 **THE OCTOBER ROW IS THE ONE THAT MATTERS ON OPENING NIGHT — `0.034`, the lowest of the season
by half.** *Any absence model carrying a season-average `0.1043` into opening week over-predicts
absences by `3×`.* ⚠ **Its stated use:** *"derived fallback for `p_plays` when no report snapshot
exists at the cutoff … and the baseline version of rest-DNP probability."* 🔴 **Status, verbatim:
*"measured 2026-09-09; **not yet a cell**"*** — *and whether it ever became one is `NOT RECORDED`.*

## 3 · The RETURN RAMP and the TEAM-CHANGE DISCOUNT — measured over 3 seasons

*`'baseline v30 ramp teamchange'`. **Minutes-only multiplier**, by games missed × game-back index
`1..4`; rate-per-minute unchanged at `~1.0`:*

| games missed | back-1 | back-2 | back-3 | back-4 |
|---|---|---|---|---|
| **3–7** | `0.865` | `0.970` | 🔴 `1.010` | 🔴 `1.011` |
| **8–15** | 🔴 `0.789` | 🔴 `0.922` | 🔴 `0.957` | 🔴 `0.995` |
| **16+** | `0.721` | 🔴 `0.836` | 🔴 `0.917` | 🔴 `0.997` |

🔑 **Monotone in both directions, and it closes by the 4th game back in every band** — *"multiplier
fit on train by tier × index (role ≥12 min), clip `0.5`–`1.05`."*

**TEAM-CHANGE DISCOUNT** — *"carried minutes-role MAE **`5.97` vs `4.75`** in the first 8 games after
a move"* ⇒ **implementation: *"once ≥5 competitive games with the new team exist, the minutes role
uses only those games."*** 📌 *A `25%` MAE penalty for using pre-trade minutes, measured — and the
rule derived from it is on file while the measurement was not.*

✅ **Certification result carried with it**: *2025-26 **points `0.8` / rebounds `0.6`, `0` of `37`
bands**; holdout 2024-25 **points `0.9` / rebounds `0.7`, 1 thin band***. 🔑 *"first two factors
moved from the enrichment lock into the BASELINE, measured then re-certified — **owner rule: never
lose calibration**."*

⚠ **`AS STATED` in `T9`/`T10`, not re-run by this sweep.**

---

## ✅ §F6.20 — **THE PER-PLAYER BOARD-COVERAGE MEASUREMENT, AND THE `44%` DEFECT VERIFIED CLOSED**

*Added `2026-09-23`, `§F6.20`. Source: **LIVE** `nba_config.classification_config`,
`config_key = 'baseline_board_coverage_2026_09_11'`, plus one `SELECT` against
`nba_score.baseline_ladder`. **Read-only.***

🔑 ***The twelve record the CAUSE of the combos gap in five documents — `|| echo failed`,
`BT_SAVE_COMPONENTS`, the freshness gate, the loader's singles-only refusal — and record the
MEASUREMENT that found it in NONE.*** *`RULE 55` again: the conclusion is filed, the table under it
is not.*

> ✅ **`RULE 58` RE-VERIFICATION, run after this section was written.** *The absence claims were
> re-probed case-insensitively with variant spellings. **They hold, and narrowly**: `1,660` / `1660`,
> `12,579` / `12579`, `PRA 450`, `matrix width` / `matrix is wide`, `per-player coverage`,
> `rung-step` / `rung step` all return **`0`**. ⚠ **But `44% of` returns `7`** — the `44%` figure
> itself is thoroughly documented *(`MASTER_SUMMARY:12454`, `SYSTEM_DESIGN:2125`, `WORKERS:2269`,
> `GLOSSARY:1294`, `RECIPE:513`)*. ***It is the TABLE behind the `44%` that is missing, not the
> `44%`.*** 🔑 **AND THERE ARE TWO DIFFERENT `44%`-OF-THE-BOARD DEFECTS IN THIS CORPUS** — this
> combos gap, and `norm_market()`'s naive `replace('player_','')` that would have scored **`23,286`
> legs** nothing *(`OPEN_ITEMS:11078`, `FSC:3660`, `RECIPE:298`)*. **A coincidence of proportion,
> not a shared cause, and a reader greping `44%` will meet both.***

### 1 · What the test was, and why it had to be per-player

> ***"the ladder is anchored per player, so comparing a prop-level union of lines against the board
> is misleading — only a per-player match answers whether the matrix is wide enough"***
> — `why_per_player`, **owner point `2026-09-11`**, `VERBATIM`

*Script: `nba/check_baseline_board_coverage.py`, `task=coverage`, against the `2026-03-15`
PrizePicks window board.*

### 2 · 🔑 THE SINGLES TABLE — **in `0` of the twelve**

| prop | board legs | matched | | out of range | line gaps | no baseline | name unresolved |
|---|---|---|---|---|---|---|---|
| points | **541** | 419 | **77%** | 🔴 **60** | 18 | 25 | 19 |
| rebounds | **441** | 378 | **86%** | `0` | 32 | | |
| assists | **344** | 305 | **89%** | `0` | 16 | | |
| threes_made | **236** | 228 | **97%** | | | | |
| turnovers | **24** | 23 | | | | | |
| steals | **14** | 12 | | | | | |

✅ ***"anchoring works — essentially zero out-of-range except points; matrix width is correct, no
expansion needed for singles."*** *The two residuals are both diagnosed and neither is a design
fault:*

| residual | `n` | the diagnosis, `VERBATIM` |
|---|---|---|
| **points out of range** | `60` | *"demon rungs on high scorers past the player ladder ceiling; **a rung-depth setting, not a design flaw**"* |
| **line gaps** | `66` *(reb 32, pts 18, ast 16)* | *"line inside the player range but that exact rung not emitted; **check the rung-step rule**"* |
| **name unresolved** | `65` | *board naming vs the NBA register — **`nba_ref.player_name_map`, `5,212` players**, plus grader alias logic, "closes most"* |

### 3 · 🔴 THE COMBOS HALF — the `44%`, and the sentence that explains every silent failure in this corpus

> ***"`PRA 450`, `PR 431`, `RA 407`, `PA 357`, `stocks 15` = **`1,660` board legs (`44%` of the
> slate) with ZERO baseline rows**"*** — `combos_result`, `VERBATIM`

🔑🔑 ***"NOT a matrix-width problem."*** *The combos builder existed, was certified, and had been
validated **on this very slate two days earlier — `12,579` rows, `7` props, `175` players.** The
workflow already chained singles → combos → periods.* ⇒ ***"but every step ends in `|| echo failed`,
so a failure is SILENT and the loaded artifact ended up singles-only."***

📌 **That is the whole mechanism of this corpus's most repeated failure shape, stated in one line by
the person who hit it:** *a step that cannot fail loudly will eventually fail silently, and the
evidence of the failure is an artifact that looks complete.* **The remedy chosen was not to fix the
builder — there was nothing wrong with it — but to make the ABSENCE detectable:** *"add a freshness
gate that refuses to publish a slate missing combos."*

### 4 · ✅✅ **VERIFIED CLOSED — `[LIVE-AUDIT]` 2026-09-23**

*`nba_score.baseline_ladder WHERE asof = '2026-03-15'`, by prop:*

| combo prop | live rows |
|---|---|
| `pra` | **`3,227`** |
| `fantasy_score` | **`3,280`** |
| `pts_reb` | **`3,159`** |
| `pts_ast` | **`3,092`** |
| `reb_ast` | **`2,672`** |
| `stocks` | **`1,859`** |
| `double_double` | **`158`** |

✅ ***All seven combo props are present. The `1,660` legs that had ZERO baseline rows have them.***
✅ **And the gate was built as promised** — `nba/load_baseline_ladder.py:66-68`:
`if not (combo_props & set(props)): raise SystemExit("ABORT: artifact has no combo props - refusing
to load a singles-only slate")`. 🔑 ***A `raise SystemExit` where the workflow had `|| echo failed`
— the fix is the inverse of the defect, and it is in the loader rather than the workflow, so it
holds however the artifact is produced.***

⚠ **`RULE 54` — what this does NOT verify.** *The partition carries **`18` props**; the reliability
audit's population is **`30`**. **Whether the missing twelve are absent by design for this slate or
are a second gap is `NOT MEASURED`** — the `2026-03-15` board is a window board, not a full slate,
and this pass did not re-run `check_baseline_board_coverage.py`. **The `60` out-of-range points legs
and the `66` line gaps are recorded as of `2026-09-11` and were NOT re-measured**; neither the
rung-depth setting nor the rung-step rule was checked against today's builder.*

---

## 🔬 §F6.23 — **A NUMERIC SWEEP OF ALL `66` LIVE CONFIG ROWS, AND THE INSTRUMENT CORRECTING ITSELF BY `72%`**

*Added `2026-09-23`. **The method, stated first because its own result is the main finding.***

### 1 · The instrument, and why it was built this way

*`RULE 58` had just been numbered: a `0`-of-`12` wording probe is a claim about the query. **Numbers
looked like the escape** — a figure is a figure however the sentence around it is phrased. So: every
distinct numeric token of `4+` digits or `3-6` decimal places across all `66` rows of
`nba_config.classification_config` — **`304` numbers** — tested against all twelve.*

| variant set | numbers reported ABSENT from all twelve |
|---|---|
| 🔴 **narrow** *(literal, plus comma-grouping and trailing-zero stripping)* | **`57`** |
| ✅ **wide** *(also percentage forms `0.5712 → 57.1%`, and roundings to `1`–`3` dp)* | **`16`** |

🔴🔴 ***The same instrument, on the same numbers, on the same corpus, reported `57` absences and
then `16`. `41` of the `57` — `72%` — were present as percentages or roundings.*** **`0.5712` is
written `57.1%`; `0.6614` is `66.1%`; `0.6237` is `0.62`.** ⇒ ***`RULE 58` is not a rule about
words. A number has spellings too, and "spelling-invariant" was exactly the assumption that made me
trust the narrow run.***

📌 **BOTH COUNTS ARE PUBLISHED, per `RULE 53`** *(the pre-registered figure and the classified one)*.
⚠ **`RULE 54`: `16` is a LOWER bound and `57` an UPPER one.** *The wide set can also produce FALSE
MATCHES — a rounding of `0.5712` to `0.57` may meet an unrelated `0.57` somewhere in `6 MB` of
prose. **The true count is between, and this pass does not claim to have pinned it.***

### 2 · 🔑 What the `16` survivors are — **and the best of them is a four-cell table**

> ***"starter projected minutes by market spread band: pickem `31.548` / `4-8` `31.356` / `8-11`
> `31.321` / `11+` `30.639` — a monotone `0.91`-minute decline that the `r=0.46` derived proxy could
> not resolve"***
> — `blowout_model_market_spread_2026_09_13.FULL_REPLICATION_COMPLETE_2026_09_14.effect_verified_in_the_final_table`

🔑🔑 ***This is the blowout rebuild's PROOF, and it is the one part of that row the twelve do not
carry.*** *Everything else in it is documented — the `19,344,143` rows, the sign trap, the two
deadlocks, the `r=0.46` proxy, the `100:1` asymmetry at `13+`. **The table that shows the new input
actually moved the output is not.*** ⇒ **A monotone decline across four bands is a much stronger
claim than "MAE improved", because a fit that got lucky does not come out monotone in the ordering
it was supposed to predict.** 📌 *`RULE 55` in its purest form: the conclusion recorded everywhere,
the four numbers under it nowhere.*

### 3 · 🔑 **AND TWO OF THE `16` ARE SAMPLE SIZES — `RULE 56`, again**

| figure | what it is `n` for | in the twelve |
|---|---|---|
| 🔴 **`n_per_rung = 20,993`** | `ladder_calibration_result_2025_26` — *"the out-of-sample result the design was built to achieve"*, `walk_forward_monthly_out_of_sample`, max gap `0.6`–`1.0 pp` across all `13` rungs | **`0` of `12`** |
| 🔴 **`n = 11,187`** | the `fgm` certification's worst cell *(`LOW/more 70-75`, `+3.1 pp`)* | **`0` of `12`** |

⇒ ***The headline calibration result of the whole ladder is quoted in this corpus without the number
of legs per rung it rests on.*** **`RULE 56` was numbered at `§F6.10` after nine tables were found
missing their sample size; this is the tenth and eleventh, found by a different instrument.**

### 4 · The remaining survivors, recorded without ceremony

| figure | row | what |
|---|---|---|
| **`151,661`** | `prizepicks_goblin_demon_tier_spec` | `ladders_with_explicit_anchor` — ⚠ *its sibling `ladders_switch_point_only` **`42,600`** IS in `6` of the twelve; **the larger half of the same pair is in none*** |
| **`1013 · 509 · 981 · 1944 · 2102 · 2072`** | `period_layer` | `histogram_2min_bins` — the blowout sit-out distribution *(`mean 3.5`, `sd 3.3`, sit-out rate `0.40–0.47`)*; **`2,102` and `2,072` absent, the rest collide with other figures** |
| **`43007 · 4950 · 4951`** *(and `452`, `753`)* | `board_sources_decision` | **Fliff channel ids seen `2026-09-10`**, with `452` carrying `118` team-name conflicts — the operational detail behind `FLIFF_CHANNELS_NBA` |
| **`1881`** | `board_sources_decision` | a Betr `group_tag` example, `1881_<player>#1.5` — the shape, not a datum |
| **`2702`** | `board_sources_decision` | the Fliff `ipOrigin=2702` geo token — ⚠ *`§T` already records the EMPTY `usa_state_code` this sits beside; the code itself is absent* |
| **`5602`** | `storage_diet_plan_2026_09_17` | `board_snapshots` **heap** `5,602 MB` inside `6,604 MB` total — the bloat figure under `T20-2`'s plan |
| **`10361785`** | `fantasy_score_formulas` | an Underdog help-article URL id. **Recorded as noise, not as a gap.** |

### 5 · ⚠ **WHAT THE SWEEP DELIBERATELY DID NOT RECOVER**

🔴 **`absence_panel_measured_2026_09_12` contributed SIX of the narrow run's `57`** — `1.031`,
`1.042`, `1.047`, `1.065`, `1.068`, `1.076`. ***They are not written up and must not be.*** **That
row is the one `§F6.12` established is `RETRACTED`** — *"the two-season ratio table … is CONTAMINATED
and must not be used to fit anything"*. ⇒ 🔑 ***An absence probe finds retracted numbers exactly as
readily as live ones, and a sweep that recovers everything it finds absent will faithfully restore
the corpus's worst material.*** **Checked against the row's own `notes` before writing, not after.**

---

## 🔴 §F6.24 — **`nba_config.calibration_log`: EIGHT APPLIED DECISIONS, AND NOT ONE OF THEIR SAMPLE SIZES IS IN THE TWELVE**

*Added `2026-09-23`. Source: **LIVE** `SELECT * FROM nba_config.calibration_log`. **Read-only.**
The table is named in `5` of the twelve; **its contents had never been censused.***

*Eight rows, all `status = applied`, each carrying `cell_id`, `evidence_json`, `sample_size` and
`decided_by`. **The DECISIONS are documented — the rank-within-role-tier prior, the empirical
`rate_tier × role_tier × rung` tables, the symmetric-floor ceiling bug, the `threes_made` logit
shift, the season-consistency rule, the `finest_level_only` shift fix. Their `n` is not.***

| `decided_by` | decisions | `sample_size` | in the twelve |
|---|---|---|---|
| `backtest_classification_v9` · `backtest_v15_v17` · `backtest_v14_holdout` · `backtest_v17` | ~~`5`~~ → **`6` of the `8`** ⚠ | 🔴 **`272,909`** | **`0` of `12`** ✅ *re-checked: the prefix `272,9` returns `0`* |
| `backtest_minutes_model_v1` *(blowout states)* | `1` | 🔴 **`54,000`** | **`0` of `12`** ✅ *the two `54,0` hits are inside `1,454,044`* |
| `backtest_minutes_model_v1` *(B2B)* | `1` | **`8,000`** | ⚠ **`0` for THIS meaning** — *every `8,000` in the twelve is `nba_team.lineup_profile`'s row count; a collision, not coverage* |

🔑🔑 ***`272,909` is the evidential base of SIX separate applied changes to the classification
ladder — the tier prior, the empirical tables, the guards, the `threes_made` logit shift, the
season-consistency rule and the `finest_level_only` hierarchy fix — and the corpus states every one
of those changes without it.*** 📌 **`RULE 56` again, and the first instance found in a DECISION LOG
rather than a results table.** ⚠ *The `sample_size` column is right there in the schema; nothing had
ever read it.*

> ⚠ **CORRECTED SAME PASS — `§F6.26`'s verification caught it.** *This section first said **five**.
> `SELECT count(*) FROM nba_config.calibration_log WHERE sample_size = 272909` returns **`6`**
> *(`log_id` `3`–`8`)*. **I had counted the four distinct `decided_by` values and written a row
> count.** 🔑 ***`RULE 57` is about running a derivation on every row; this is its arithmetic twin —
> a count is not checked until it has been COUNTED, and `SELECT count(*)` was one query away the
> whole time.***

### 🔑 And two substantive lines the census surfaced with it

| | `VERBATIM` from `evidence_json` | in the twelve |
|---|---|---|
| **competitive over-rate** | `"competitive_over_rate": 0.491` — *beside `won_blowout 0.519` and `lost_blowout 0.369`, both of which ARE documented* | 🔴 **`0` of `12`** *(as `0.491` and as `49.1%`)* |
| 🔑 **the B2B mechanism** | *"published star B2B minute deltas (`−1.5..−3.0`) **do not reproduce conditional on playing**; stars `~0` to `−0.4`, bench `+1.2..+2.5`, rotation `+0.6..+1.2` … **DNP-Rest removes stars from the log; the effect belongs in `P(available)`**"* | ⚠ the deltas and `DNP-Rest` are in `2`; ***"belongs in `P(available)`" — the STRUCTURAL conclusion — is in `0`*** |

⇒ 🔑 ***The B2B row is a whole published effect relocated to a different layer: it is not a minutes
factor at all, it is an availability factor, and the log says so in one clause that no document
carries.*** **Same family as the "factor measured on the wrong layer" finding that closed `A2`,
reached independently and four days earlier.**

📌 **`0.491` matters for the same reason `§F6.20`'s table did**: the two blowout states are recorded
*relative to each other*, and `0.491` is the baseline they are relative TO. *Without it, `0.519` vs
`0.369` is just a gap; with it, `0.519` is **`+2.8 pp` above competitive** and `0.369` is **`−12.2 pp`
below** — **an asymmetry, not a symmetric split**, and the asymmetry is the finding.*

⚠ **`RULE 54`.** *`WINDOW`: the `8` rows as they stand `2026-09-23`, `status = applied`, against the
twelve. **`NOT VERIFIED`: whether `272,909` is the same population across all five decisions** — it
is the same integer in all five `sample_size` cells and they share three `created_at` timestamps, but
the log records no population definition. **`NOT RE-DERIVED`: no figure here was recomputed from the
underlying tables by this pass.** ✅ *And `RULE 58` was applied throughout: every number was re-probed
in percent and comma-grouped forms, which is what demoted `0.519`, `0.369`, `0.477` and `0.394` from
"absent" to "present in `3` documents" before anything was written.*