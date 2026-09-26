# NBA FINAL SCORING ENGINE CALIBRATION

**Scope.** Everything governing the **final** numbers — final hit probability, confidence, score and
edge — i.e. the enrichment layer and the scoring engine that sits on top of the baseline.

---

> # 📑 **INDEX — `NBA_FINAL_SCORING_CALIBRATION.md`**
> **How a raw projection becomes a final hit probability** — the confidence model, the scoring chain,
> the calibration evidence, and the backtests behind each constant.
> 📏 **`322` sections · re-derived `2026-09-26` (pass 20)** *(was `274` on `2026-09-23`, `316` on `2026-09-25`; **`RULE 59` — re-derive AND RUN, never quote**; the `+6` is §T26.55's headings):* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_FINAL_SCORING_CALIBRATION.md ``
> ⚠ *The original `211` came from a heading detector anchored at line start, which is blind to the **blockquoted** headings this corpus uses heavily — **294 across the twelve, `6.0%`**. Re-derive with `^(?:>\s*)*#{1,6}\s`, never `^#`.*
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** 🔁 **To resolve a `§` pointer:** `` grep -rn "§T9.40b" nba/*.md `` *(all `32` files — the twelve are not closed under their own citations).* **Search for the quoted `§` label.**
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
> 🆕🆕 **`§T26.55` ADDED `2026-09-26`** — 🔴🔴🔴 **`F5-1`'s "MISSING" FACTOR-GATE RESULTS WERE NEVER MISSING — AND EVERY VARIANT FAILED, THE INTERACTIONS WORST** — *the verdicts are in `nba_score.factor_gate_results`, all written `2026-09-25 22:42:57Z`, `n = 7,128` legs: `anchor` log-loss `0.72604`; `anchor_x_defender` **identical to five decimals** (gain `0.00000`); `anchor_x_A2` and `anchor_x_A2_x_defender` both `0.97044` (gain **`−0.24441`**); `anchor_x_A5_pstart_minutes` `0.74408` (`−0.01804`). **Not one variant beat the anchor, and the two interactions that were supposed to be the answer are catastrophically worse.*** 🔑🔑 *AND THE ANCHOR ITSELF IS **BELOW CHANCE** on this slice — `0.72604` against `ln 2 = 0.69315`, Brier `0.26359` against `0.25` — so the comparison has no valid floor; `shrink_beta` is NULL on all five rows and the slice is undefined.* ⇒ `T26-4`.
>
> 🆕🆕 **SECTIONS ADDED `2026-09-25` — `10` NEW, AND TWO OF THEM RETRACT EARLIER ONES IN THIS FILE.** *Anchors are heading text; search the label.*
> | § | what it is |
> |---|---|
> | 🔴🔴🔴 **`§T26.39`** | **THE `A5` STARTER MODEL AND "NEXT MAN UP" WERE VALIDATED ON THE WRONG OBJECTIVE, AND NOTHING CALLS THEM** — ⚠⚠ ***RETRACTS `§T26.12` AND `§T26.22` BELOW. READ IT BEFORE EITHER.*** *`Brier` on STARTS vs the `§0u.1` bar of Δ MAE on PROPS; `grep` finds `0` callers of `p_start()`* |
> | 🔴🔴🔴 **`§T26.37`** | **THE AVAILABILITY DELTA PRICED A LATE `Out` AS A CERTAINTY** — *live on P3's decision path; `7×` worse log-loss; **zero upside, unbounded downside**; now triple-gated* |
> | ✅✅✅ **`§T26.16`** | **`T16-8` CLOSED — THE NEGATIVES WERE A STALE STORE, NOT A FORMULA DEFECT** *(`0` of `7,210,912` rows negative; the fix predated the audit by four days)* 📜 **`RULE 61` born here** |
> | ✅✅✅ **`§T26.15`** | **`T16-7`'s DATA-LOSS HALF CLOSED, AND THE POPULATION QUESTION SETTLED** *(board-scoped; `0` off-board rows)* |
> | 🔴🔴 **`§T26.17`** | **`final_hp` HAS NO `period` COLUMN — period rungs wore FULL-GAME KEYS** |
> | ⚠⚠ **`§T26.18`** | **THE TWO-STAGE DESCENT — `skip` is not `delete`; `18` props were never cleared** |
> | ⚠⚠ **`§T26.22`** | *"next man up"* — 🔴 **SUPERSEDED BY `§T26.39`** |
> | ⚠⚠ **`§T26.12`** | the `A5` starter fallback — 🔴 **SUPERSEDED BY `§T26.39`** |
> | ✅ **`§T26.11`** | why `2025-26`'s calibration was inherited: `final_hp` held `1` of `163` dates; it now holds all `163` |
> | ✅ **`§T26.5`** | **THE AVAILABILITY FALLBACK IS BUILT, FITTED AND BACKTESTED** — ✅ *and `§T26.39` explicitly does NOT retract it; see its scope note* |
> 🔴🔴🔴 **THIS FILE'S NUMBERING IS THE MOST BROKEN OF THE TWELVE — `§T20.6` recorded it and it is
> unrepaired** *(renumbering would break every inbound pointer; rule 1)*. **Measured `2026-09-23`:**
> | defect | detail |
> |---|---|
> | **`§14` appears TWICE** | *"THE STATISTICAL STANDARD, CONSOLIDATED"* **and** *"THE RESEARCH STANDARD — all 27 lessons"* |
> | **`§12` is MISSING** | the sequence runs `11` → `13` |
> | **`§20` precedes `§19`** | `18` → **`20`** → `19` |
> | **`§15.0c` is an ORPHAN** | it sits after `§19`, and there is no `§15` |
> | **FOUR STRAY `h1`s** | `# config`, `# minutes_threshold …`, `# target_player_position_filter …`, `# assist_rate_bonus_multiplier …` — **a config block that escaped its fence inside `§7b`** *(same class as `NBA_WORKERS.md` `§0.38`)* |
> ⇒ ***Navigate by this index. The numbers will mislead you.***
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🔴🔴🔴 **whether the model actually beats the book** *(`1.08 M` legs)* | **`§0.14-T23`** ⚠ *newest; read first* |
> | 🔴🔴🔴 **WHICH THRESHOLD AND PICK COUNT ACTUALLY PAY** — the full `3 × 5 × 2` `ROI` grid | **`§0.16-F2`** ⚠ *newest; the numbers `§0.14-T23`'s verdict was drawn from* |
> | ✅✅ **is the backtest edge just stale pre-move lines?** — the leakage control, and it holds | **`§0.16-F2` §3** |
> | 🔴 **the only LOSING cell in the grid** *(2-pick, 2024-25, thresholds `1.20`/`1.30`)* | **`§0.16-F2` §2** |
> | 🔴 **the SEVEN period props and their certification figures** *(`points_q1/h1/h2/q4_otx`, `rebounds_q1`, …)* | **`§7`, `§F2.8` block** — *five of the seven rows were added 2026-09-23* |
> | 🔴 **the pass-3 confidence-tier LEG COUNTS** *(not just the percentages)* | **`§F2.8` block in the v2 tier section** — *total `4,046,520`* |
> | 🔴 **the penalising half of the score formula has NEVER FIRED** | **`§0a-T18-D`** |
> | 🔴 **the score's THREE formulas, and which two the live column holds** | **`§0a-T18-B`** |
> | 🔑 **"the score must ENHANCE the hit probability — no kill good legs"** | **`§0a-T18`** |
> | ✅✅ **open item O6 resolved, and the v3 confidence model proven in production** | **`§0a-T17-C`** |
> | 🔴 **the confidence build — SIX versions, each killed by a measurement** | **`§0a-T17-B`** |
> | 🔑 **the confidence specification in the owner's own words** | **`§0a-T17`** |
> | 🔴 **the score / confidence contract — and the live table contradicting it** | **`§0a-T16-C`** |
> | 🔴🔴 **the certified baseline BEATS every enrichment** | **`§0a-T15-SUPERSESSION-2`** ⚠ *read the two supersessions BEFORE `§0a-T15`* |
> | **what confidence IS** *(a data thermometer, not a probability)* | **`§5`** |
> | **the score, `0–100`, enhancing, never taxing** | **`§6`** |
> | 🔴 **the ten enrichment factors — none survived** | **`§7`** |
> | ✅ **the two non-negotiable factors that DID land** | **`§8`** |
> | 🔑 **pre-register the deciding test** | **`§7f`** |
> | ⚠ **the `2025-26` partition of `final_hp` is ONE DAY DEEP** | **`§0z`** |
> | 🔑 **where edge is now expected to come from** | **`§19`** |
> | **the research standard — all 27 lessons** | **`§14`② *(the SECOND `14`)*** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🔴 **A · THE NEWEST AND MOST CONSEQUENTIAL — read first**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.14-T23`** | 🔴🔴 **The tails hypothesis TESTED on `1.08 M` legs — and it failed in the worst direction.** Our tails are mis-priced, not theirs *(§1)* · the book beats the model everywhere *(§2)* · 🔑 **what it does NOT overturn — the model RANKS** *(§3)* · 🔴 **it indicts the `0.15` Platt guard, which lives in this layer's recipe** *(§4)* | 🔴🔴 |
> | **`0.16-F2`** | 🔴🔴🔴 **THE THRESHOLD SWEEP `§0.14-T23`'s VERDICT CAME FROM, recovered 2026-09-23.** The design read off the SQL — one leg per player-day, greedy slip packing, void re-pricing, payout base `2→3.0 … 6→37.5` *(§1)* · **the `3 × 5 × 2` `ROI` grid, `29` of `30` cells** *(§2)* · ✅✅ **the line-movement LEAKAGE CONTROL — `4` of `8` cells go UP when moved lines are removed, so the edge is not a stale-line artifact** *(§3)* | 🔴🔴🔴 |
> | **`0z`** | ⚠⚠ **DATA-STATE WARNING — the `2025-26` partition of `final_hp` is ONE DAY DEEP** | ⚠⚠ |
>
> ### 🎯 **B · THE SCORE AND THE CONFIDENCE — what they are and what went wrong**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0a-T18`** | 🔴 **"The score must ENHANCE the hit probability — no kill good legs"** — COMPASS fact 103's source | 🔴 |
> | **`0a-T18-B`** | 🔴 **The score's THREE formulas — and `[LIVE-AUDIT]` proves the live column holds two of them** | 🔴 |
> | **`0a-T18-D`** | 🔴 **THE PENALISING HALF OF THE SCORE FORMULA HAS NEVER FIRED** | 🔴 |
> | **`0a-T16-C`** | 🔴 **The score / confidence contract — and `[LIVE-AUDIT]` finds the live table contradicting it** | 🔴 |
> | **`0a-T17`** | 🔴 **The confidence specification, in the owner's own words** | 🔴 |
> | **`0a-T17-B`** | 🔴 **The confidence build — SIX versions, each killed by a measurement, and the last one** | 🔴 |
> | **`0a-T17-C`** | ✅✅ **`[LIVE-AUDIT]` — open item O6 RESOLVED, and the v3 confidence model proven in production** | ✅ |
> | **`5`** · **`6`** | **CONFIDENCE — a data thermometer, not a probability** · **THE SCORE — `0–100`, enhancing, never taxing** | |
>
> ### 🧪 **C · THE ENRICHMENT LAYER — and why it did not land**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0a-T15-SUPERSESSION`** | 🔴 **READ THIS BEFORE `§0a-T15`** — A2 was closed the day after it shipped | 🔴 |
> | **`0a-T15-SUPERSESSION-2`** | 🔴 **AND IT IS WIDER THAN A2 — the certified baseline BEATS EVERY ENRICHMENT** | 🔴🔴 |
> | **`0a-T15`** | 🔑 **The first factor results in the corpus that state each layer's information set** ⚠ *superseded above* | 🔑 |
> | **`7`** | 🔴 **THE ENRICHMENT FACTORS — ten tested, NONE survived** | 🔴 |
> | **`7b`** | **The enrichment multipliers as originally designed** *(`T4`)* ⚠ *contains the four stray `h1`s* | ⚠ |
> | **`7c`** | **The enrichment application record — how a factor's contribution is audited** | |
> | **`7j`** | ⚠ **The enrichment-displacement diagnostic — cheap, and NEVER RUN on NBA** | ⚠ |
> | **`7k`** | **Five concrete enrichment-factor bug patterns** | |
> | **`8`** | ✅ **THE TWO NON-NEGOTIABLE FACTORS THAT DID LAND** | ✅ |
>
> ### 🏗 **D · ARCHITECTURE AND THE CHAIN**
> | § | what it covers |
> |---|---|
> | **`0b`** | **The founding scope decision — reuse vs rebuild** |
> | **`0c`** | **The two-layer architecture — never collapsed into one** |
> | **`0d`** · **`0e`** · **`0f`** | Per-factor grids and how to combine them · the one-time architectural opportunity · **the "preset dictionary" principle — precompute once, runtime is a LOOKUP** |
> | **`1`** · **`2`** | **THE CHAIN** · **THE TWO-LAYER CONTRACT** |
> | **`3`** · **`4`** · **`4b`** | **The availability delta** · **AS-OF CALIBRATION** · **Tri-state data-quality tagging** |
> | **`9`** · **`10`** · **`11`** | Scenario precompute *(measured, then dropped)* · data freshness *(dropped, with a reason)* · **board scoring — what actually gets scored** |
>
> ### 📏 **E · THE RESEARCH AND STATISTICAL STANDARDS** *(`T1`, inherited from MLB)*
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`7d`**–**`7i`** | Two cheap guards MLB never applied · **the two-test paradox — why a factor can be real and still worthless** · 🔑 **`7f` PRE-REGISTER THE DECIDING TEST** · same-game correlation *(smaller than folklore)* · the MLB→NBA factor mapping · the "phase file" architecture | 🔑 |
> | **`7l`**–**`7q`** | Two operational disciplines · two diagnostic-only safeguards specified for day one · ⚠ **`7m2` an honest out-of-sample pass is NECESSARY BUT NOT SUFFICIENT — never auto-apply** · the outcome-grading engine's isolation design · benchmark the factor list against a real system · two build-discipline principles · three standing search/evaluation disciplines | ⚠ |
> | **`13`** | **THE VALIDATION GATE FOR ANY STRATEGY** | |
> | **`14`①** | **THE STATISTICAL STANDARD, CONSOLIDATED** ⚠ *first of two `14`s* | ⚠ |
> | **`14`②** | **THE RESEARCH STANDARD — all 27 lessons** ⚠ *second `14`* | ⚠ |
> | **`16`** · **`17`** · **`18`** | Part E — the consecutive-clean-pass standard · **the single most valuable standing habit** · Part D — selection methodology, rules B0–B0c | |
> | **`20`** | **Part F — LOOKAHEAD BIAS in a baseline measurement** ⚠ *appears BEFORE `§19`* | ⚠ |
> | **`19`** | 🔑 **WHERE EDGE IS NOW EXPECTED TO COME FROM** ⚠ *appears AFTER `§20`* — **and `§0.14-T23` tests it** | 🔑 |
> | **`15.0c`** | **External confirmation that the opportunity exists** ⚠ *ORPHAN — there is no `§15`* | ⚠ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` is the newest evidence and it constrains everything else; `B`
> is the score/confidence layer; `C` is why enrichment did not land; `D` is the architecture; `E` is
> the standard the work is held to.*** ⚠ **Where a `SUPERSESSION` section exists, read it BEFORE the
> section it supersedes — the file's physical order puts them first for that reason.**
The baseline's own calibration is a separate document: `NBA_BASELINE_CALIBRATION.md`.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T4/T7/T8 (the two-layer contract), T9 (factor-layer size), T15–T16 (factor gates, blowout, matchup) and the live session (final HP, confidence v3, the enhancing score, as-of calibration parity). |
| **2026-09-21 → 09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `20` commits that this log never recorded.** *T15–T18 and T20 material: **§0a-T15 the factor verdicts with each layer's evidence** · §1b A2's fitted allocator equation · §T15.4a A2 closed 2026-09-13 (both dates) · **§T15.5 the baseline beats every enrichment** · §T16.2 the M1/B4 reversal evidence · §T16.3 the score/confidence contract · §T17.1 the confidence specification · §T17.2 the confidence build in six versions · **§T17.3 open item O6 RESOLVED — `f_phase` is live** · **§T18.1 the owner's score directive** · §T18.2 the score's three formulas · **T18 pass 6: the score formula's drop branch has never fired**. **Corrections in place: the 100% market-spread coverage claim and its surviving literal struck · the one bare `38.7M` assertion corrected (live table is `19,215,200`) · T18 pass 2's budget table corrected in place at §5.2 · one dangling cross-reference fixed · rows 5, 8 and 27 filled from source.*** |

---

## 0a-T18-D. 🔴🔴🔴 **THE PENALISING HALF OF THE SCORE FORMULA HAS NEVER FIRED**
*(T18 pass 6 — live numeric re-verification · `[LIVE-AUDIT]` read-only `SELECT`, 2026-09-22T11:43Z)*

**The shipped score is a two-sided pivot around `CONF_NEUTRAL = 0.85`, and the author's own comment
states both sides**: *"above it the score is lifted toward 100, below it the score is PULLED DOWN…
**data we stand behind enhances; thin data penalises**."*

```
cdev  = (confidence − 0.85) / (1 − 0.85)
lift  = clip( cdev, 0, 1) × 0.50     # up to half the remaining headroom to 100
drop  = clip(−cdev, 0, 1) × 0.35     # up to 35% off when the data is thin
score = clip( hp·100 + (100 − hp·100)·lift − hp·100·drop, 0, 100 )
```

### 🔴🔴 THE `drop` TERM IS DEAD CODE IN PRACTICE

| live measurement, `nba_score.final_hp` | value |
|---|---|
| legs with `confidence < 0.85` | **0** |
| legs with `confidence = 0.85` | **0** |
| **minimum confidence over all 19,215,200 legs** | **0.8540** |
| maximum confidence | 0.9841 |
| per season | 2024-25 min **0.8540** · 2025-26 min **0.8722** |

⇒ ***Not one leg in 19.2 million sits at or below the neutral point, so `drop` has never been
non-zero. The formula's penalising half has never engaged on a single production row.*** **The
realised confidence range is 0.8540 → 0.9841 — a span of 0.13 — against a pivot sitting THREE
THOUSANDTHS below its floor.** 🔑 **The pivot is, in production, a floor.**

⚠⚠ **STATED AT EVIDENCE STRENGTH, AND THIS IS NOT A CLAIM THAT THE DESIGN IS WRONG.** **It is
arithmetic on the shipped formula and the live column, nothing more.** ✅ **The system's own
documentation ANTICIPATES the cause and is consistent with it** — COMPASS fact 101: *"a fully-
supported leg reads ~99 and **the floor (~55) needs everything to stack against it at once**"*, and
*"the 20-40% band is impossible by construction because the core factors are always present."*
*So a confidence floor far above 0.85 is the designed consequence of a deduction model that starts at
99 and only rarely stacks.* ⚠ **Rule 6: WHY 0.85 was chosen as the neutral, and whether it was chosen
before or after the deduction floor was known, is NOT RECORDED** — no swept transcript says, and this
sweep does not guess.

🔑 **THE CONSEQUENCE THAT IS WORTH THE OWNER'S ATTENTION, stated as a question rather than a verdict**:
**every live leg is LIFTED, by between `0.013×` and `0.50×` of its headroom to 100.** *A score that
only ever enhances cannot separate a well-supported leg from a poorly-supported one as sharply as a
two-sided one would — the discriminating power sits entirely in the upper half of the lift range.*
⚠ **OWNER DECISION — two coherent options, and the sweep does not choose**: *(a)* **raise
`CONF_NEUTRAL` into the realised distribution** *(the median or the 25th percentile of live
confidence), so both halves engage; or *(b)* **keep 0.85 and accept the score as a one-sided
enhancer**, which is exactly what the owner asked for — *"the score must ENHANCE the hit probability —
no kill good legs"* *(§0a-T18)*. **(b) may well be right; what is recorded here is that the code
implements a two-sided rule and the data only ever exercises one side.** *Open item T18-17.*

---

## 0a-T18-B. 🔴🔴🔴 **THE SCORE'S THREE FORMULAS — AND `[LIVE-AUDIT]` PROVES THE LIVE COLUMN HOLDS TWO OF THEM SIDE BY SIDE. OPEN ITEM T16-8 IS ANSWERED.** *(T18 pass 1, §T18.2)*

### ✅ **THE ARC — three formulas in one session, each corrected by the owner**

| # | Formula | Behaviour | Fate |
|---|---|---|---|
| **1** | **`score = edge × confidence`** *(edge = `(final_hp − 0.56) × 100`)* | **range −53.7 → +42.2, mean ≈ −5.6** — *"most legs sit negative because most legs don't clear break-even"* | 🔴 **REJECTED**: *"that's an EDGE METRIC, not the 0–100 scale you want"* |
| **2** | **`score = final_hp × confidence × 100`** | 0.95/0.95 → **90.3** · 0.95/0.70 → 66.5 · 0.50/0.95 → 47.5 · 0.22/0.95 → 20.9 | 🔴 **REJECTED BY THE OWNER**: *"**multiplying KILLS GOOD LEGS.** A 95% hp with 90% confidence scoring 85.5 is worse than the hp alone, which is backwards. **Confidence should CONFIRM a strong leg, not TAX it.**"* |
| **3** ✅ | **THE 0.85-NEUTRAL PIVOT** — above it the score climbs toward 100 by **up to half the remaining headroom**; below it it is pulled down by **up to 35%**; **at neutral the score IS the hit probability** | 0.95/0.95 → **97.4 ⬆** · 0.95/0.85 → **95.0 =** · 0.95/0.70 → **81.7 ⬇** · 0.50/0.95 → 63.2 · 0.22/0.95 → 42.4 | ✅ **SHIPPED — and it is COMPASS fact 103** |
| — | **`edge` becomes its OWN COLUMN** | *"**edge answers 'is this an OPPORTUNITY'** — a 64% leg the board needs 57% for is valuable, a 92% leg everyone prices at 92% isn't — **score answers 'how GOOD is this leg'**. The slip engine will want both."* | ✅ added |

✅ **VERIFIED IN THE TRANSCRIPT ON REAL ROWS** — *and these are exactly fact 103's worked examples, so fact 103 is this verification*: **0.479 hp / 0.921 conf → 60.16** *(vs 44.11 multiplicative, edge −8.09)* · **0.478 / 0.949 → 65.06** *(vs 45.39)* · **0.434 / 0.952 → 62.71** · **0.468 / 0.884 → 52.78**. 🔑 ***"Every score sits ABOVE `hp × conf`, confirming confidence is LIFTING rather than TAXING"*** — **and the ordering is right: 0.434 at 0.952 OUTRANKS 0.468 at 0.884, so better-supported data wins at a lower probability.**

> 🔴 **COMPLETED 2026-09-23, `§F2.9` — THE CLAIM IS UNIVERSAL AND THE EVIDENCE WAS HALF A TABLE.**
> *The line above asserts **"EVERY score sits above `hp × conf`"** while carrying the `if
> multiplicative` comparator for only **2 of the 4** rows and the `edge` for only **1 of 4** — so
> three-quarters of the universal claim could not be checked from this document.* **Found by the
> high-band audit: `T18` i=350 scores `b12 = 0.70`, one of the highest COVERED scores in the
> corpus, and `41.36`, `41.34` and `12.59` returned `0` hits across all twelve.**
>
> | `hp` | `confidence` | **`score`** | `if_multiplicative` | `edge` |
> |---|---|---|---|---|
> | 0.479 | 0.921 | **60.16** | 44.11 | −8.09 |
> | 0.478 | 0.949 | **65.06** | 45.39 | −8.17 |
> | 0.434 | 0.952 | **62.71** | 🔴 **41.34** | 🔴 **−12.59** |
> | 0.468 | 0.884 | **52.78** | 🔴 **41.36** | 🔴 **−9.20** |
>
> ✅✅ **ARITHMETIC CONTROL — and it also pins down what the column IS, which was nowhere stated:**
> **`if_multiplicative` = `hp × confidence × 100`.** *`0.479×0.921 = 44.12` (44.11) · `0.478×0.949
> = 45.36` (45.39) · `0.434×0.952 = 41.32` (41.34) · `0.468×0.884 = 41.37` (41.36) — all four
> reproduce to ±0.03.* ⇒ **the universal claim now holds on all four rows, checkably: `60.16 >
> 44.11` · `65.06 > 45.39` · `62.71 > 41.34` · `52.78 > 41.36`.**
>
> 🔑 ***The third row is the largest lift in the set (`+21.37`) and it was the one missing its
> comparator*** — *the row that most supports "confidence is LIFTING" was the row whose evidence
> had been dropped.*

## §F6.9 — 🔴 **FOUR MORE TABLES, AND IN EVERY ONE THE MISSING COLUMN IS `n`**

*Added 2026-09-23 by the uncovered-band probe. Each conclusion below is on file; each table was
partly or wholly not — **and the part that was dropped is the sample size, four times out of four.***

### 1 · `hp` by kind and tier — the cleanest sanity check in the system

| kind · tier | 🔴 **legs** | avg `hp` |
|---|---|---|
| goblin −3 *(easiest)* | 🔴 **8,085** | 0.6996 ✅ *on file* |
| goblin −2 | 🔴 **13,199** | 🔴 **0.6401** |
| goblin −1 | 🔴 **14,849** | 🔴 **0.5767** |
| **standard 0** | 🔴 **24,869** | **0.5014** ✅ *on file* |
| demon +1 | 🔴 **15,073** | 🔴 **0.3696** |
| demon +2 | 🔴 **14,113** | 🔴 **0.2918** |
| demon +3 *(hardest)* | 🔴 **10,158** | 🔴 **0.2167** |

🔑 ***"perfectly monotone: easy goblins 70%, standard legs 50.1%, hard demons 21.7% … the standard
tier landing at `0.5014` is as clean a sanity check as exists — **the board's main line is a coin
flip by construction, and the model says so**. So `hp` is right. **Confidence is what I built
wrong.**"*** 📌 *The corpus records `0.5014` and `0.6996` and **not** that they are the endpoints of
a monotone seven-tier ladder, nor how many legs each rests on.*

### 2 · The PHASE decay — the gaps are on file, the populations are not

| phase | 🔴 **legs** | model says | actually hits | gap |
|---|---|---|---|---|
| early *(games 1–15)* | 🔴 **7,751** | 0.368 | 0.419 | **+5.05 pp** ✅ |
| mid *(16–60)* | 🔴 **25,675** | 0.433 | 0.461 | **+2.76 pp** ✅ |
| late *(61+)* | 🔴 **62,864** | 0.460 | 0.472 | **+1.15 pp** ✅ |

⚠⚠ **AND THE `n` COLUMN IS WHAT MAKES THE FINDING READABLE**: *the `+5.05` early-season gap — the
largest and the one that matters on opening night — **rests on `7,751` legs against `62,864` late**.
`8×` fewer.* 🔑 ***"a single season-wide correction is wrong — it would over-correct late-season
legs and under-correct early ones. the correction has to be phase-conditional, which is now stored
per cell in `tier_band_calibration`."*** ✅ *And the reason it transfers:* ***"the model can't know
2026-27 rotations, but it can know that the first fifteen games behave like the first fifteen games
— that's what makes the system ready for opening night rather than needing a month to warm up."***

### 3 · The ablation that chose the final model — `AUC` column absent

| configuration | log-loss | 🔴 **AUC** | confident share | confident accuracy |
|---|---|---|---|---|
| **pooled, base features** | 0.6727 | 🔴 **0.6237** | 2.8% | 70.3% ✅ |
| 🟢 **pooled + player history** *(chosen)* | 0.6780 ✅ | 🔴 **0.6216** | **4.1%** | **79.6%** ✅ |
| per-tier, base | 0.6963 | 🔴 **0.5894** | 4.8% | 67.2% |
| per-tier + player history | 0.6997 | 🔴 **0.5892** | 6.7% | 70.5% |

🔑 ***"per-tier splitting is clearly harmful — log-loss worse in both variants, AUC dropping `0.62 →
0.59`."*** **The AUC column is the evidence for that sentence and it was the column dropped.**
⇒ *The selection rule, also absent:* ***"log-loss is not the objective here … we don't need a sharp
average probability on coin-flip players — we need more calls we can act on, and it delivers `46%`
more of them at nearly `10` points higher accuracy."*** ✅ **And the instrumentation note that makes
it checkable: *"every ablation row now lands in `nba_score.factor_gate_results`, so this verdict is
a SQL query rather than a log I have to grep"* — confirmed live at `F5-1`: those rows are there.**

### 4 · The USAGE allocator's fitted coefficients — the minutes half is on file, the usage half is not

**`nba/build_redistribution_factors.py`**, fitted by `fit_usage_allocation.py`, **ridge `0.05` on the
standardised design**; features *`log baseline usage`, `log baseline minutes`, `is_creator (≥14
poss)`, `log minutes lift`*:

| array | values | in the twelve |
|---|---|---|
| `beta_min` *(minutes)* | `0.2214, 0.3953, 0.5160, 0.0043` | ✅ **on file, 2 documents** |
| 🔴 **`usage_beta`** | **`−0.0081, −0.0049, −0.0047, 0.0262`** | 🔴 **absent** |
| 🔴 **`usage_mu`** | **`2.1981, 3.0373, 0.2480, 0.0565`** | 🔴 **absent** |
| 🔴 **`usage_sd`** | **`0.6087, 0.4296, 0.4319, 0.1919`** | 🔴 **absent** |

📌 ***"measured by the fit, not assumed"* — and `§F6.5` §1 shows usage is the LARGER effect (`×1.177`
against minutes `×1.080`). The corpus documented the coefficients of the smaller half.**

⚠ **`AS STATED IN T16`/`T17`, not re-run by this sweep.**

### 🔴🔴🔴 **BUT THE LIVE COLUMN HOLDS FORMULA 1 *AND* FORMULA 3 — AND THE `built_at` WINDOWS PROVE IT** `[LIVE-AUDIT]` *(`SELECT` 2026-09-22)*

| | rows | **`built_at` window** | seasons | `final_hp` range |
|---|---|---|---|---|
| **`score < 0`** | **6,924,101** *(36.0%)* | 🔴 **2026-09-19 03:26:25 → 04:41:39 ONLY — a 75-minute window** | **1** | **0.000 → 0.560** |
| `score ≥ 0` | 12,291,099 | 2026-09-19 03:26:25 → **22:41:47** | **2** | 0.000 → 1.000 |

🔑🔑🔑 **THE ENHANCING FORMULA CANNOT PRODUCE A NEGATIVE SCORE** *(its worst case, 0.22 hp at 0.95 confidence, is **42.4**)*. **So the 6.9M negative rows are LEFTOVERS from the `edge × confidence` era, written in a 75-minute window on 2026-09-19 and NEVER OVERWRITTEN by the later replication.** ✅✅ **OPEN ITEM T16-8 IS ANSWERED: the negatives are neither intended nor a formula defect — they are a REPLICATION that did not finish.**

### 🔴🔴🔴 **AND THE SAME INCOMPLETE PASS EXPLAINS T16-7 — ONE MECHANISM, TWO SYMPTOMS**

*The **latest** `built_at` in the whole table is **22:41:47**, and it belongs to **2025-26's 140,130 rows on a single date**.* 🔑🔑 ***So the final replication pass began on 2025-26 — which the engine writes by DELETE-then-INSERT per prop — wrote roughly one date's worth, and stopped. It never returned to overwrite 2024-25's stale-score rows.*** **That is one incomplete run producing both symptoms**: a season reduced to 0.7% of itself *(T16-7)* **and** 6.9M rows still carrying a superseded formula *(T16-8)*.

⚠ **AND THE AUTHOR FLAGGED THAT HE COULD NOT VERIFY IT — the instrument failed at exactly the wrong moment**:

> ***"The SQL bridge is timing out on the large aggregates, so **I can't currently verify the final HP replication state**. Small queries work… but **any scan across 38.7M rows errors out. I'd need that to clear before I can honestly report whether the last score/confidence replication finished.**"***

🔴🔴 **AND THE CHECKS THAT *DID* RUN CANNOT SEE EITHER DEFECT.** *The verification recorded as "step 1 complete" was **"both seasons at 30/30"** — a **PROP COUNT** — plus **four sampled rows**.* ⚠⚠ ***A 30/30 prop count is satisfied by ONE DATE's worth of rows, and four sampled rows landed in the 64% that were already correct.*** 🔑 **Neither check has the resolution to detect a 19.5-million-row shortfall or 6.9 million stale scores — and both were run in good faith after the only instrument that could have detected them had failed.**

🔑🔑 **THE TRANSFERABLE RULE, and it is the third instance of this family in three transcripts**: *T16 gave **"verify RUN STATUS and ROW COUNT together, never row count alone"**; T17 gave **"report complete only when all 60 carry a post-22:00 timestamp, not when the jobs report green"**.* ⚠⚠ ***T18 adds the sharpest form: **a COMPLETENESS check must be sized to the defect it is meant to catch. A prop count cannot see a missing date, and a sample cannot see a stale minority.***

⚠ *One thing the transcript shows the author did anticipate:* **"the two replication jobs currently running carry the OLD MULTIPLICATIVE formula, so they'll need a rerun"** and **"rather than let them finish and overwrite with wrong scores, I'll let them clear and then run the correct version."** 🔑 **The sequencing was right; the final pass is the one that did not complete.**

---

## 0a-T18. 🔴🔴🔴 **"THE SCORE MUST *ENHANCE* THE HIT PROBABILITY — NO KILL GOOD LEGS" — COMPASS FACT 103's ORIGIN, AND IT SETTLES WHAT OPEN ITEM T16-8 IS ABOUT** *(T18 pass 0, §T18.1, owner, 2026-09-19; **0 of the twelve, 0 of the thirty**)*

*Three owner turns, in sequence, and they are the whole of fact 103:*

> **"What about the score having final HP [and] confidence — is it calculated already?"**
>
> 🔴 ***"Score should be a 0 TO 100. A leg with high HP and confidence should score HIGH. **Is that
> what is happening? DOES NOT LOOK LIKE.**"***
>
> 🔑🔑 ***"It is important to understand that **the score must ENHANCE the hit probability**. A strong
> hit probability with strong confidence — **high score**. That should make HP even **MORE ASSERTIVE**
> as a score. **NO KILL GOOD LEGS.**"***

✅✅ **So the 0–100 contract is the OWNER's, stated as a correction to what he was shown** — *"does not
look like"* — **and the design principle is his too: confidence must LIFT a well-supported leg, never
tax it.** 🔑 **COMPASS fact 103's worked example** *(a straight `hp × conf` gives 0.95 HP at 0.90
confidence a score of 85.5, "worse than the probability alone, which is backwards")* **is the
arithmetic of "no kill good legs".**

### 🔴🔴 **AND IT SHARPENS OPEN ITEM T16-8 RATHER THAN ANSWERING IT**

⚠⚠ **`[LIVE-AUDIT]` finds `final_hp.score` running to **−52.488** with **36.0% of rows NEGATIVE***
*(§0a-T16-C §4)*. 🔑 **T17 supplies the formula that produces them — `score = edge × confidence`,
where edge is distance above break-even — and that formula CANNOT satisfy "0 to 100", because edge is
negative below break-even and most legs are** *(T17: "average score −3.55 — most legs sit below
break-even, which is correct").*

| | |
|---|---|
| **The owner's contract** *(T18, 09-19)* | **score is 0–100; high HP + high confidence ⇒ high score; never below the probability alone** |
| **The formula T17 built** | **`score = edge × confidence`** — *"a 92% leg nobody prices differently scores lower than a 64% leg the board needs 57% for with four books behind it"* |
| **COMPASS fact 103's fix** | **a 0.85 NEUTRAL PIVOT** — above it the score is lifted toward 100 (up to half the remaining headroom), below it pulled down (up to 35%) |
| 🔴 **The live column** | **−52.488 → 99.99, 36.0% negative** |

🔑🔑 **THE THREE ARE A SEQUENCE, AND THE LIVE COLUMN MATCHES THE FIRST, NOT THE LAST**: *`edge ×
confidence` is exactly what the owner objected to — **it KILLS good legs** — fact 103 records the
pivot as the fix, and **the live data still shows the edge-based shape.*** ⚠ **So T16-8's question is
no longer "is this intended?" — it is *"did the pivot fix ever replicate?"***, the same question
T17-5 asks of v3 confidence and which the v3 arithmetic answered YES. 🔴 **NOT RECORDED for score;
T18's own prose stratum is where it would be** *(the owner asks at segment 92 and the fix is
discussed by segment 130, so pass 1 should settle it)*.

⚠ *Note the ordering constraint the owner adds and the pivot preserves:* **"that should make HP even
more assertive AS A SCORE"** — *the score is not a second probability; it is a RANKING that must not
invert the probability's ordering among well-supported legs.*

---

## 0a-T17-C. ✅✅✅ **`[LIVE-AUDIT]` — OPEN ITEM O6 IS RESOLVED, AND THE v3 CONFIDENCE MODEL IS PROVEN IN PRODUCTION TO FOUR DECIMAL PLACES** *(T17 pass 2, §T17.3; `SELECT` + source read, 2026-09-22)*

### 🔑🔑🔑 **THE PROOF — `f_phase`'S DEDUCTION REPRODUCES THE LIVE CONFIDENCE OFFSETS EXACTLY**

*`nba_score.confidence_model` — **10 rows, `built_at` 2026-09-19T01:25:34Z, `base` 99, `floor` 55** —
carries **`f_phase` at deduction 9.0625**. The source's `phase_rank` map is
**`{1_oct_nov: 0.80, 2_dec_asb: 1.00, 3_post_asb: 0.88, 4_push: 0.92}`**, and confidence is
**`clip(99 − Σ(1−F)·ded, 55, 99.5) / 100`**. **So a leg's phase alone should cost `(1 − rank) ×
9.0625` points relative to `2_dec_asb`. Measured on 19,215,200 live rows:***

| phase | legs | **max conf** | **observed offset vs `2_dec_asb`** | **predicted `(1−rank)×9.0625/100`** | |
|---|---|---|---|---|---|
| `2_dec_asb` *(rank 1.00)* | 8,463,732 | **0.9841** | — | — | |
| **`1_oct_nov`** *(0.80)* | 4,088,446 | **0.9660** | **0.0181** | **0.018125** | ✅✅ |
| **`3_post_asb`** *(0.88)* | 3,095,410 | **0.9732** | **0.0109** | **0.010875** | ✅✅ |
| **`4_push`** *(0.92)* | 3,567,612 | **0.9769** | **0.0072** | **0.00725** | ✅✅ |

✅ **And the MINIMUMS reproduce the identical offsets** *(0.8722 − 0.8540 = 0.0182 · − 0.8613 =
0.0109 · − 0.8649 = 0.0073)*, **which a coincidence could not do at both ends of the distribution
across four phases.**

### 🔴🔴🔴 **THEREFORE OPEN ITEM O6 IS CLOSED — and its answer is NOT the one the question assumed**

*O6 (§T9.38a, open since T9) records that **`build_confidence_v3.py`'s `FACTOR_COLS` declares TEN
factors, `f_phase` has a six-line justification with measured figures, and the `raw` expression sums
NINE terms without it — with the nine weights totalling exactly 1.00** — and asks: **"should `f_phase`
enter the sum, with the other weights renormalised, or is it deliberately inspection-only?"***

| | Verified in source, 2026-09-22 |
|---|---|
| ✅ **O6's FINDING IS CORRECT AND STILL LIVE** | **Line 85–86**: `raw = 0.16·f_complete + 0.12·f_prov + 0.10·f_time + 0.14·f_depth + 0.10·f_vol + 0.08·f_exp + 0.12·f_role + 0.08·f_books + 0.10·f_agree` — **nine terms, summing to exactly 1.00, and `f_phase` is not among them.** |
| 🔑🔑 **BUT `raw` IS NOT THE PRODUCT** | **Line 95** returns `clip(0.45 + 0.55·raw, 0.35, 0.99)` from `confidence_of()` — **an INTERMEDIATE**, used to populate `confidence_verification` and to attach the factor columns. **Line 358 then OVERWRITES it**: `d["confidence"] = clip(99.0 − lost, 55.0, 99.5)/100` where `lost = ((1 − F) · ded).sum(axis=1)` over **all TEN of `FACTOR_COLS`**. |
| ✅✅ **AND THE TEN-FACTOR MODEL IS WHAT SHIPS** | **Lines 344–355 PERSIST it** — *"so `build_final_hp.py` applies exactly this, measured, logic to all 38.7M legs"* — to `nba_score.confidence_model`, **which the arithmetic above proves is live.** |

🔑🔑 **SO THE ANSWER TO O6 IS: `f_phase` IS NOT INSPECTION-ONLY. It is the SECOND-LARGEST deduction in
the model that actually produces `final_hp.confidence`.** ⚠⚠ **What O6 found is real but is a
different object: TWO confidence formulas live in one file, and `f_phase` is in one and not the
other.** 🔑 **O6's remedy — "renormalise the nine weights" — is therefore MOOT for the shipping path,
and the open question narrows to a code-hygiene one: whether the nine-weight `raw` should still exist
at all, given it is overwritten before anything downstream reads it.**

✅✅ **AND O6's URGENCY ARGUMENT IS VINDICATED BY THE LIVE DATA**: O6 warned that **`1_oct_nov` carries
the lowest reliability rank (0.80) and the season opens 2026-10-20.** **Live, `1_oct_nov` has the
LOWEST mean confidence of any phase — 0.9135 against `2_dec_asb`'s 0.9308.** 🔑 **The factor is doing
exactly what it was written to do, for exactly the regime the system is about to enter.**

### 🔴🔴 **BUT THE SHIPPED MODEL RESTS ON TWO SIGNALS — SEVEN OF TEN FACTORS MEASURED *EXACTLY* ZERO**

| factor | **deduction** | **separation** |
|---|---|---|
| **`f_role`** | **11.2731** | **0.008477** |
| **`f_phase`** | **9.0625** | **0.001467** |
| `f_books` | 2.3207 | 0.000013 |
| `f_agree` · `f_complete` · `f_depth` · `f_exp` · `f_prov` · `f_time` · `f_vol` | **0.9063 each** | 🔴 **0.000000 each** |

⚠⚠ **The budget totals exactly 29.00** *(`DEDUCT_BUDGET = 29.0`, "worst realistic combination lands
near 70")*, **and seven of the ten factors share an identical floor allocation because they separated
nothing.** 🔑 **So the eleven-factor epistemic design of §0a-T17-B ships as a TWO-FACTOR model in
practice: role and phase carry 70% of the budget between them.** ⚠ **That is not a defect of the
model — it is §0a-T17-B's own diagnosis made concrete: *"our hp is calibrated so uniformly well that
there's almost nothing to discriminate."*** 🔴 **But it does mean `completeness`, `provenance`,
`timeliness`, `evidence depth`, `volatility`, `experience` and `market agreement` — seven of the
owner's named inputs — currently carry a flat 0.9063 each on ZERO measured evidence.**

### ✅ **AND THE CAP MECHANISM IS VERIFIED IN SOURCE, WITH THE FAILURE IT WAS BUILT TO FIX**

*COMPASS fact 102 records "a per-factor cap (**redistributing the excess, not just clipping**)". **The
source comment explains why the distinction is load-bearing:***

> ***"CAP any single factor, then REDISTRIBUTE THE EXCESS to the others — **clipping and then
> renormalising by the sum does NOTHING when one factor holds almost all the mass** (clip to 0.35,
> divide by 0.35, and it is back at 1.0). **That is what let `f_role` take 28.87 of 29 points.**
> Iterate: clip, hand the surplus to the uncapped factors, repeat."***

⚠ **`CAP = 0.40`, not the 0.35 the transcript proposed** — *the 0.35 version was implemented, found to
be a no-op for exactly the reason above, and replaced by a 10-iteration clip-and-redistribute.* ✅
**Live, `f_role` holds 11.2731 / 29 = 38.87% — just under the 0.40 cap, with the mechanism visibly
binding.**

### ✅ **OTHER LIVE RE-TAKES, 2026-09-22** *(re-take, never quote)*

| Table | live | transcript | |
|---|---|---|---|
| `nba_score.conformal_confidence` | **342** | 253 full + 66 mid + 22 coarse + global = **342** | ✅ **exact** |
| `nba_score.scenario_realised` | **1,942** | **1,942** | ✅ **exact** |
| `nba_score.baseline_history` | **19,343,348** / 325 dates | 19,343,348 | ✅ **stable, as §0w now predicts** |
| `nba_score.ladder_calibration_asof` | **9,904** | 3,383 + 3,432 + 2,762 = 9,577 | ⚠ **+327; NOT RECORDED why** *(the transcript's figures are per-source cell counts, which need not sum to the table)* |
| 🔴 **`nba_score.final_hp` 2025-26** | **140,130 / ONE date** | **19,611,626 / 163 dates** | 🔴🔴 **UNCHANGED since the sweep first measured it — not a transient mid-write state** |

⚠⚠ **THAT LAST ROW MATTERS FOR OPEN ITEM T16-7**: *the sweep's leading hypothesis was a delete-then-write
in flight. **Re-taken across a span of time, the table has not moved** — so if a rebuild is running, it
is not writing; and the conformal-vs-v3 question is settled the other way, since **the confidence
values present ARE v3**, meaning the season that carries them was written and then lost all but one
date.* 🔴 **OWNER DECISION stands, and it is now sharper: 2025-26's `final_hp` was COMPLETE with the
current logic and is now 0.7% of itself.**

---

## 0a-T17-B. 🔴🔴🔴 **THE CONFIDENCE BUILD — SIX VERSIONS, EACH KILLED BY A MEASUREMENT, AND THE LAST ONE IS NOT FINISHED** *(T17 pass 1, §T17.2, the prose stratum read in order and in full — 231 segments / 176,017 chars, the largest in the corpus)*

*COMPASS fact 101 records "three earlier versions were wrong". **The transcript shows SIX, and the
order matters**: the conformal version that fact 101 lists as a failure came AFTER the hand-weighted
one and was itself killed by the same principle that fact 102 states. **This is the sequence.***

### 🔴 v1 — **HAND-WEIGHTED PILLARS, AND THE FIRST VERIFICATION OF FACT 5b EVER RUN**

*Weights chosen by reasoning: **`c_exist` 30% · `c_quality` 45% · `c_market` 25%**. Mean confidence
landed at **0.541**, then 0.575 once the market join worked, then **0.5562 / 0.5570** across the two
seasons.* ⚠ *The author's own note at the time: "my weights are too punitive — **I subtract up to 0.35
for band gap and another 0.35 for scenario uncertainty, so a typical leg loses a THIRD of its
confidence before anything is actually wrong with it.**"*

**Then fact 5's second half — *"confidence bands that hit their stated rate"* — was tested for the
first time**, on **2.1M graded legs**:

| tier | n | stated | actual | **gap** |
|---|---|---|---|---|
| low | 48,745 | 0.6923 | 0.6918 | **0.0005** |
| medium | 1,363,404 | 0.4202 | 0.4189 | 0.0014 |
| high | 541,367 | 0.4906 | 0.4867 | 0.0039 |
| **elite** | 148,458 | 0.4884 | 0.4940 | 🔴 **0.0056** |

🔴 ***"The gap gets WORSE as confidence rises. That's backwards."*** ✅ **And fact 5a passed
comfortably in the same table — every tier within 0.6 pp.**

### 🔴🔴 THE COMPONENT BREAKDOWN — **"the confidence formula is 75% noise and 25% signal"**

| pillar | top-quartile gap | bottom-quartile gap | **separation** | |
|---|---|---|---|---|
| `c_exist` *(30% of weight)* | 0.0015 | 0.0015 | **0.0000** | ❌ **no discrimination at all** |
| **`c_quality`** *(45% of weight)* | 0.0030 | 0.0002 | 🔴 **−0.0028** | ❌ **INVERTED** |
| `c_market` *(25%)* | 0.0005 | 0.0021 | **+0.0015** | ✅ **works** |

🔑🔑 **AND THE MECHANISM OF THE INVERSION IS THE FINDING**: *"my quality pillar **penalises cells that
historically missed** — but those cells are precisely the ones **the as-of calibration now corrects
hardest**. **I was DOUBLE-PENALISING AN ERROR THAT'S ALREADY BEEN FIXED.**"* ⚠ **A quality signal that
is valid before a correction is applied becomes inverted after it — and nothing flags the change.**

### 🔴🔴🔴 THEN THE VERIFICATION ITSELF WAS FOUND INVALID — **fact 102's measurement error, caught here**

> ***"Elite legs had mean hp **0.4884** and low legs **0.6923**. A leg at 0.49 sits at **MAXIMUM
> BERNOULLI VARIANCE, p(1−p) = 0.25**; one at 0.69 has 0.21. **I compared raw gaps across groups with
> different intrinsic noise — so elite HAD to look worse regardless of how well calibrated it was.**"***

⚠⚠ **So *"confidence is inverted"* was a MEASUREMENT ARTIFACT, not a finding — and the component
breakdown above was measured the same way.** 🔑 **The sweep records both the verdict and its
retraction (rule 5), because the component numbers are still what motivated every later version.**

### ✅ v2 — **MONDRIAN GROUP-CONDITIONAL CONFORMAL PREDICTION, and it discriminated monotonically**

*The literature's fix for exactly this: **normalized nonconformity `|won − hp| / √(p(1−p))`**
(studentized residuals, so groups with different intrinsic noise are comparable), with **Mondrian
group-conditional grouping on `prop × band × side × phase`** and **a minimum group size with a
fallback hierarchy** — because the research "warns explicitly that per-group quantiles destabilise on
thin samples".*

**Held out on 1.05M legs:**

| quintile | n | predicted | **realised normalized residual** |
|---|---|---|---|
| **best** | 210,198 | 0.6629 | **0.6273** |
| good | 210,197 | 0.8022 | 0.7921 |
| mid | 210,197 | 0.9043 | 0.8876 |
| low | 210,197 | 0.9753 | 0.9665 |
| **worst** | 210,198 | 0.9984 | **0.9957** |

🔑 **Monotone, with predicted tracking realised within 0.01–0.02 in every quintile — *"the best-confidence
legs are genuinely 37% more reliable than the worst"*.** ✅ **`nba_score.conformal_confidence`: 253 full
groups, 66 mid, 22 coarse, plus a global fallback; group scores span 0.566 → 1.004.** ⚠ **`c_market`
survived as a 15% modifier — the one hand-built pillar that measured positive; existence and quality
were dropped.**

### 🔴🔴 THEN THE *TIER LABEL* BROKE — FOUR TIMES — AND IT WAS THE SAME PARITY VIOLATION AGAIN

*Fixed cuts at **0.35 / 0.55 / 0.75** against a confidence distribution spanning ~0.52–0.61 gave
**high 68% · medium 32% · elite 0.04% · low ZERO**.* ⚠⚠ **COMPASS fact 6 names *"tier cutpoints"*
explicitly among the values that must be **computed in-run, nothing pasted** — **so the hardcoded cuts
are the SAME VIOLATION CLASS as the pasted calibration table fixed hours earlier**, and the research
agrees: *"binning-based evaluation with bins containing an equal number of samples are shown to have
lower bias"*, with authors explicitly urging against equal-width bins.

⚠ **Attempt 2 failed for a different reason and it is worth keeping**: *"the cutpoints are derived from
the GROUP confidence distribution (341 groups), but the leg confidence is `0.85 × group_conf + 0.15 ×
c_market − penalty`… **I'm computing quantiles on ONE distribution and applying them to ANOTHER.**"*

🔑🔑🔑 **THE ROOT CAUSE, FOUND ONLY BY MEASURING THE REAL DISTRIBUTION**: **95 distinct confidence values
across 1.7M legs — 362 group combinations collapse to 95 values, `c_market` contributes 5 levels, and
~18,000 legs share each value.** ⚠ ***"NO BINNING SCHEME CAN SPLIT TIES — which is why four re-cutting
attempts all produced 54/46/0.1/0. I was tuning bin edges on a variable with NO RESOLUTION TO BIN."***
✅ **The fix was resolution, not binning**: continuous per-leg terms — **group score 55% · market 15% ·
evidence depth 15% · extremity (distance from 0.50) 15%** — took it from **95 to 412 distinct values**,
with cutpoints sampled from the **live leg distribution** rather than the group table.

| pass | low | medium | high | elite |
|---|---|---|---|---|
| 1 | 54% | 46% | 0.1% | **0%** |
| 2 | 54.2% | 32.2% | 13.3% | 0.3% |
| **3** | **40.2%** | 18.4% | 20.6% | **20.9%** |

> 🔴 **COMPLETED 2026-09-23, `§F2.8` — THE PASS-3 ROW HELD PERCENTAGES AND ONE ABSOLUTE COUNT.
> `T17` GAVE ALL FOUR.** *This block quoted `845,039` because the author's sentence quoted it, and
> the other three leg counts were dropped — so the board size could not be recovered from this
> document and none of the four counts could be checked.* **Found by the high-band audit
> (`§F2.7`): this is a segment the coverage judge scores `0.48` — **COVERED** — carrying three
> figures that appear nowhere in the twelve.
>
> | pass 3 | legs | share |
> |---|---|---|
> | low | 🔴 **1,624,686** | 40.15% |
> | medium | 🔴 **744,002** | 18.39% |
> | high | 🔴 **832,793** | 20.58% |
> | elite | 845,039 *(already on file)* | 20.88% |
> | **total** | **4,046,520** | 100% |
>
> ✅ **ARITHMETIC CONTROL — the four counts reproduce the four percentages already in the table to
> two decimals** *(40.15/18.39/20.58/20.88 vs 40.2/18.4/20.6/20.9)*, **which is what establishes
> that these are the same table and not a different measurement.**
>
> ⚠ **`NOT RECORDED`: which population the `4,046,520` is.** *This section also names **"1.7M
> legs"** (the confidence-value distribution) and **"19M rows"** (`final_hp`). **Three different
> populations appear within twelve lines and only the first is labelled** — so `4,046,520` is
> recorded here as the tier table's own total and is **not** asserted to be the board, the leg
> universe, or a subset of either.*
>
> ---
>
> ### §F6.1 — pass 2 was missing the same way
>
> 🔴 **AND PASS 2 WAS MISSING THE SAME WAY — ADDED 2026-09-23, `§F6.1`.** *The `§F2.8` correction
> above restored pass 3's leg counts. **Pass 2's were absent too**, along with two columns the table
> never had: `1,250,042` · `741,922` · `307,908` · `7,250` each returned **`0` of `12`**.*
>
> | pass 2 | legs | share | **avg confidence** | **distinct values** |
> |---|---|---|---|---|
> | low | 🔴 **1,250,042** | 54.2% | **0.5733** | 186 |
> | medium | 🔴 **741,922** | 32.2% | **0.6202** | 72 |
> | high | 🔴 **307,908** | 13.3% | **0.6615** | 125 |
> | elite | 🔴 **7,250** | 0.3% | **0.7743** | 29 |
> | **total** | **2,307,122** | 100% | monotone ↑ | **412** *(from `95`)* |
>
> ✅ **ARITHMETIC CONTROL, the same test as `§F2.8`**: `1,250,042 / 2,307,122 = 54.18%` ·
> `32.16%` · `13.35%` · `0.31%` — **reproducing `54.2 / 32.2 / 13.3 / 0.3` to one decimal.**
>
> 🔑🔑 **AND THE TABLE'S OWN ANOMALY IS EXPLAINED — by a sentence that was also in `0` of the
> twelve.** *A reader of the pass-3 row (`40.2 / 18.4 / 20.6 / 20.9`) would reasonably ask why
> equal-mass binning did not produce `25/25/25/25`. `T17` answers it:*
>
> > ***"it's not yet the 25/25/25/25 that equal-mass binning should produce, and the reason is
> > visible: the cutpoints were sampled from `final_hp` BEFORE this run rewrote it, so they came
> > from the old low-resolution distribution. the next run will sample the new distribution and land
> > much closer to quartiles — **it's a one-iteration lag, not a design flaw**."***
>
> ⚠ **`NOT RECORDED`: whether that next convergence run ever happened.** *If it did not, the live
> tier labels are still one iteration behind — **and `§0.16-F2`'s threshold grid and `T23-1`'s
> standards-only result are both computed on tiered legs.*** 🔴 **Worth settling before the opener.**
>
> 📌 *Two further figures from the same block, also absent: the tier value's **held-out
> discrimination `0.627 → 0.996`**, and **`final_hp` at `0.5643` log-loss over `1.25M` graded
> PrizePicks legs**. Both recorded here.* ⚠ *That block also states "38.7m legs", the figure
> `§F1.2` showed is `19,215,200` live — **quoted as `T17` said it, not endorsed**.*

⚠ *"Elite went from ZERO legs to 845,039 — a fifth of the board."* 🔑 **And the author names the
general lesson: *"I have 19M rows with real confidence values sitting in the database and I've been
INFERRING the distribution from a 341-row group table instead of MEASURING it."***

### 🔴🔴🔴 v3 — **THE OWNER REJECTED THE WHOLE APPROACH, AND HE WAS RIGHT ON THE PRINCIPLE**

> ***"Confidence is NOT A RANKING. I forced equal-mass quartiles onto it, which **guarantees 25% of legs
> get called 'low' no matter how good the data is**. That's backwards. **Confidence is an ABSOLUTE
> measure of data quality.**"***

✅ **That is COMPASS fact 101's failure (a) — and it happened HERE, at the END of the sequence, not at
the start.** 🔑🔑 **AND THE CONFORMAL VERSION IS INDICTED BY THE SAME PRINCIPLE, which is fact 102's
aleatoric/epistemic distinction being born**: ***"the normalized residual `|won − hp| / √(p(1−p))` is
DOMINATED BY ALEATORIC NOISE — it measures how RANDOM THE OUTCOME WAS, not how good our DATA was. A
coin-flip leg with perfect data scored badly under it. **That's the same confound in a new disguise,
and it's why elite kept landing on low-hp legs.**"***

### ✅ **THE ELEVEN FACTORS, THREE FAMILIES** — *the specification the corpus carries only as "seven named inputs"*

| Family | Factors |
|---|---|
| **DATA** — *is it there and is it real?* | **completeness** *(anchor, projected minutes, rate, injury report, opponent profile present)* · **provenance** *(main source vs derived — the real market spread not the r = 0.46 proxy; the published report not inference; an **empirical cell not a parametric fallback**)* · **timeliness** *(freshness at the decision cutoff — report age, line age)* · **evidence depth** *(the sample behind this leg's cell — "multiple sources call this THE MOST CRITICAL FACTOR: a 60% rate over 50 observations is numerically identical to 60% over 5,000 and vastly less reliable")* |
| **SUBJECT** — *how predictable is this player?* | **game-to-game volatility** `σ(game rating − long-term rating)` · 🔑 **NEGATIVE volatility** `σ(δ where δ < 0)` — *"downside surprises, which matter ASYMMETRICALLY for overs"* · **form stability** *(short- vs long-term rating gap)* · **role stability** *(minutes consistency)* |
| **MARKET** — *does it corroborate us?* | **book count at this exact rung** · **market agreement** *(our hp vs the de-vigged book probability — already in `rung_market.p_over_book` and unused for confidence)* · **line stability** *(morning vs window movement — the closing-line-value principle, "the most reliable benchmark for consistency")* |

### ✅ **v3 MEASURED — and it is the reading the owner asked for**

*Across **2,230,442 graded legs**, all eight check types written:*

| prop | legs | **confidence** | **realised \|gap\|** |
|---|---|---|---|
| turnovers | 28,372 | **0.9030** | **0.0000** |
| steals | 42,135 | 0.9011 | 0.0003 |
| blocks | 57,961 | 0.8966 | 0.0007 |
| rebounds | 587,378 | 0.8890 | 0.0009 |
| points | 1,118,716 | 0.8832 | 0.0016 |
| assists | 395,880 | 0.8950 | 0.0024 |

🔑 ***"Confidence is 88–90%, not 40–60% — that's the thermometer reading you said it should give."***

**AND THE GROUP BREAKDOWNS TRACK ASSERTIVENESS IN EVERY FAMILY**:

| Group | lowest confidence | highest confidence |
|---|---|---|
| **role tier** | **fringe 0.8546, gap 0.0283** | **iron-man 0.8928, gap 0.0008** — 🔑 **a 35× accuracy difference** |
| rung distance | tail 0.8522 | anchor 0.9115 |
| variation | goblins 0.8940, gap 0.0143 | **standard 0.9135, gap 0.0004** |
| phase | post-ASB loosest, 0.0031 | Dec–ASB 0.0006 · push 0.0009 |

✅ **1,267,582 legs in the 0.88–1.00 band against 11,143 in 0.75–0.82 — "no 20–40% nonsense anywhere."**

### 🔴🔴 **BUT THE WEIGHT-FITTING FAILED TWICE, AND THE SECOND FAILURE IS THE BEST METHOD FINDING IN THE TRANSCRIPT**

⚠ **First the spread problem**: *"the ORDERING is already correct… but **confidence spans SIX POINTS while realised gaps vary 35×**. A thermometer whose range is a tenth of what it measures can't separate an assertive leg from a shaky one."*

🔴 **Attempt 1 — a regression on `−log(gap)` COLLAPSED TO A CONSTANT**: **every group read 90.8**, fringe
(0.0283) scoring identically to iron-men (0.0008). *"Targeting `−log gap` across cells whose gaps are
all tiny gave the regression **almost no variance to fit**."*

🔴 **Attempt 2 — a separation test returned EXACTLY ZERO for eight of nine factors**, dumping the whole
29-point budget onto book count *(which separated by 0.000133)*.

🔑🔑🔑 **AND THE OWNER CAUGHT THE AUTHOR ABOUT TO HAND-TUNE, WHICH PRODUCED THE ACTUAL DIAGNOSIS**:
*"you're right — I was about to hand-tune weights again after the measurement came back degenerate.
**That's the same mistake I've made repeatedly today.** Let me first find out **why** every factor
measured zero separation, **because a result that clean is usually a BUG, not a FINDING**."*

> 🔑🔑 ***"My separation test compares the TOP 30% of each factor against the BOTTOM 30%. For `f_role`
> the values are iron-man 1.0, high-usage 0.97, starter 0.93, rotation 0.85, bench 0.70, fringe 0.50 —
> and **fringe players are only 2.6% of legs (58,969 of 2.23M)**. They sit far inside a bottom-30%
> bucket **dominated by rotation at 0.85**. So the test compared **0.85 against 0.95** and correctly
> found almost no difference, **while the real signal lives in a 2.6% TAIL it never isolated.**"***

⚠⚠ ***A SIGNAL CONCENTRATED IN A SMALL TAIL IS INVISIBLE TO A COARSE QUANTILE SPLIT.*** ✅ **Two
structural fixes**: **measure at the 5th vs 95th percentile** with per-factor lo/hi gaps printed, and
**cap any single factor at 35% of the budget** so the model cannot rest on one sensor.

### 🔴🔴🔴 **AND THE DEEPEST REASON CONFIDENCE IS HARD HERE — stated by the author and worth carrying**

> ***"Our hp is calibrated so UNIFORMLY WELL that **there's almost nothing to discriminate** — every
> band sits within **0.16 percentage points** of its stated probability. **When the worst-calibrated
> slice of 2.2 million legs misses by 0.16 pp, a confidence score has NO MEANINGFUL VARIATION IN
> ACCURACY TO TRACK.** … **Its job isn't to flag bad probabilities, because there essentially aren't
> any. Its job is to flag THIN DATA**: a fringe player, a rung no book prices, an unresolved roster, a
> derived cell."***

✅ **That is the owner's own prediction confirmed** *("our system is very sharp on the data, so
confidence should be very high")* **and it explains why every fitting attempt struggled: the target
variable is nearly constant by design.**

### 🔴🔴 **THE TRANSCRIPT ENDS WITH CONFIDENCE UNFINISHED — three specific gaps, named by its author**

| # | Gap |
|---|---|
| **1** | **It does not yet predict accuracy.** The bands spread correctly (0.65 → 1.00) but the realised gap is **FLAT across all of them: 0.0016 / 0.0011 / 0.0012 / 0.0016.** |
| **2** | **It is measured on only 6 of 30 props** *(points, rebounds, assists, blocks, steals, turnovers — the ones with graded board outcomes in that join)*. **The combos, period props, fantasy_score and double_double have not been sampled at all.** |
| **3** | 🔴🔴 **IT IS NOT WRITTEN ANYWHERE.** *"`build_confidence_v3.py` is a MEASUREMENT SCRIPT. **The confidence column in `final_hp` still holds the OLD CONFORMAL VALUES**, not this logic. **Nothing downstream would read what we just built.**"* |

⚠⚠ **SO GAP 3 IS THE CAVEAT THE AUTHOR HIMSELF FLAGS AS THE ONE THAT MATTERS, and it bears directly on
`[LIVE-AUDIT]`**: **the live `confidence` column spans 0.8540–0.9841 with mean 0.9240.** 🔑 *COMPASS
fact 101 describes v3 (**"starts at 99 and loses points for NAMED deficiencies"**, mean **0.92–0.95**)
and the live mean matches that range* — **so either the replication pass ran after this transcript, or
the conformal values happen to land in the same range.** 🔴 **NOT RECORDED which, and T18 is where the
answer would be.**

---

## 0a-T17. 🔴🔴🔴 **THE CONFIDENCE SPECIFICATION, IN THE OWNER'S OWN WORDS — the source of COMPASS facts 101–103, and it carries FOUR requirements the corpus did not hold** *(T17 pass 0, §T17.1, from the 2026-09-19 transcript; **eight of ten probes returned 0 of the twelve AND 0 of the thirty**, positive controls passed — `confidence` returns 456 of the thirty and 300 of the twelve on the same machinery)*

⚠⚠ **T17's owner stratum is the CONFIDENCE design-authority stratum: 41 turns, 13,690 chars — the most
owner turns of any transcript — including four long specification turns (1,931 · 1,594 · 1,210 · 968
chars).** *§0a-T16-C below carries the COMPASS's summary of this design. **This is where it was
specified.***

### 🔑🔑🔑 1 · **THE DEFINITION, AND IT IS STATED AS A CORRECTION**

> ***"The confidence reflects NOT the hit probability, but the ASSERTIVENESS OF THE DATA WE HAVE on
> the probability that was generated. What's the amount of data I have? Are the factors properly
> mined? Are they COMPLETE? Are they RELIABLE? Is it the REAL factor or is it DERIVED? How does the
> MARKET support that hit probability? How CONSTANT is that player? How is the FORM? How is the TEAM
> FORM? … **The confidence is MY THERMOMETER** — is my data real and reliable, supporting that final
> hit probability percentage — **because like 20%, 40%, 60% of confidence makes no sense. That's
> totally stupid.**"***

✅ **COMPASS fact 101's *"data thermometer, not a probability"* is this turn.** 🔑 **And the seven named
inputs are the specification**: *mined · complete · reliable · **REAL vs DERIVED** · market
corroboration · player consistency · form (player and team)*.

### 🔴🔴 2 · **THE FLOOR — "NEVER LOWER THAN 60, 70%" — AND *"NO CAPS"*** *(0 of the twelve, 0 of the thirty)*

> ***"That confidence SHOULD NOT BE LOWER THAN LIKE 60, 70%. NEVER — because hardly ever are we not
> gonna have data to back it up. So the confidence should be VERY HIGH, because our system is very
> sharp on the data… **We're not trying to make a low confidence — THE OPPOSITE.**"***
>
> 🔴 ***"NO CAPS. I DON'T WANT CAPS, I WANT REAL LOGIC."***

⚠⚠ **RECORD THE *"NO CAPS"* LINE AGAINST COMPASS FACT 102, WHICH SPECIFIES A CAP**: *"each factor's
share comes from how much realised `|gap|` separates its high-value legs from its low-value legs,
**with a per-factor cap (REDISTRIBUTING the excess, not just clipping)** and a floor for factors that
measure no separation."* 🔑 **The two are reconcilable and the reconciliation is in fact 102's own
parenthesis — a cap that REDISTRIBUTES is not a cap that CLIPS, and the owner's objection is to
clipping a real signal.** ⚠ **But no document states that reconciliation, and a reader meeting "no
caps" and "per-factor cap" in two places has no way to tell which governs.**

✅ **AND THE FLOOR IS ACKNOWLEDGED BY THE OWNER LATER IN THE SAME SESSION**: *"I understand that the
bottom, **the 55 for the confidence**, is like **if everything goes against you**, right? Which is
hardly ever."* 🔑 **So fact 101's ~55 floor is not an imposed cap — it is the arithmetic bottom of the
deduction stack, and the owner reads it that way.** ✅ **`[LIVE-AUDIT]` confirms the floor is never
approached: live confidence runs 0.8540–0.9841** *(§0a-T16-C §4)*, **inside the owner's own stated
expectation of *"some may even score 100, some 90, 95, some have missing data or the market's not
backing up, so maybe 75, 80."***

### 🔑🔑🔑 3 · **THE CALIBRATION TARGET — and it is an operational definition, not a preference** *(0 of the twelve, 0 of the thirty)*

> ***"The calibration of the confidence is on **HOW ASSERTIVE OUR FINAL HIT PROBABILITY IS on these two
> past seasons**. And you should look at **which groups have LOWER assertiveness on the final HP — the
> confidence should be LOWER** — and the ones that are very, very precise should have a HIGHER
> confidence as well."***
>
> *and, restated:* ***"be sure that on legs that are ASSERTED the confidence is higher, and legs that
> are not so assertive the confidence is less high accordingly — **of course not FORCED**, but find
> the proper SIGNALS."***

🔑🔑 **That makes confidence a MEASURED per-group reliability of the HP itself**, which is exactly
COMPASS fact 102's *"deduction weights are MEASURED, not assigned"* — ⚠ **and the *"of course not
forced"* is the owner pre-empting the equal-mass-quartile failure fact 101 records** *(a ranking that
forces 25% of legs to be "low" however good the data)*. 🔑 **The owner specified the fix before he saw
the failure.**

⚠ **AND THE GROUPS ARE ENUMERATED, REPEATEDLY**: *"all player tiers, all season times, all prop lines,
different teams, different variations, goblins, demons, different apps"* · *"player tiers, prop lines,
variation, direction, all kinds of different groups **that can change drastically in confidence**"*.

### 🔑🔑 4 · **THE THREE-PART DEFINITION OF THE PRODUCT** *(0 of the twelve, 0 of the thirty)*

> ***"**Final HP is the MAIN PRODUCT.** **Confidence** is the real confidence of that leg — data
> existence and completion, also the quality of data and assertiveness and certainty, and finally the
> market data backing it up and also the quality and amount of data of it. And **the SCORE is BOTH —
> final HP and confidence into consideration.**"***
>
> *and on enrichment's job:* ***"be sure the enrichment pipeline has any kind of enhancement — **this
> should be the job for the enrichment: getting the baseline and making it even more accurate.**"***

⚠⚠ **THAT LAST CLAUSE IS THE OWNER STATING, ON 2026-09-19, THE CONCLUSION THE 09-13 SESSION REACHED BY
MEASUREMENT** *(§0a-T15-SUPERSESSION-2: the certified baseline beats every enrichment factor, and the
one thing that beat it out-of-sample was a CORRECTION to the baseline rather than a competitor)*. 🔑
**"Enrichment's job is to make the baseline more accurate" and "the phase × band calibration layer
wins by correcting the baseline" are the same statement, reached six days apart from opposite
directions.**

### ✅ 5 · **THE HP SHAPE THE OWNER EXPECTS — and it is what COMPASS fact 99b measures**

> ***"One very easy goblin needs to be a VERY HIGH hit probability percentage. **The average legs
> should be around the 50% band.** And very hard goblins should be near a VERY LOW number."***

| | owner's expectation | **fact 99b, measured** |
|---|---|---|
| easy goblins | *"very high"* | **0.6996** |
| **average / standard line** | ***"around the 50% band"*** | ✅ **0.5014** |
| hard demons | *"a very low number"* | **0.2167** |

🔑🔑 **The engine reproduces the owner's stated shape without having been fitted to it, and the standard
line lands on a coin flip** — *which `NBA_GOBLIN_DEMON.md` §0e-T16-C records as the cleanest sanity
check in the system. **This is the specification it satisfies.***

⚠ *And the turn that produced it was a challenge, not a confirmation:* *"these percentage numbers
you're giving to me, **they look weird — they don't look like what I need**, unless you're showing me
different percentages of something else."*

### ⚠ 6 · **AN EXPLICIT MLB CROSS-REFERENCE INSTRUCTION** *(0 of the twelve, 0 of the thirty)*

> ***"You can take a look at the CURRENT MLB SYSTEM as well and see how the confidence works and have
> a reference there. **JUST A REFERENCE, because the system is not perfect.**"***

🔑 **Recorded because the sweep's standing scope note is that MLB is dropped and kept only as
cross-system context — and here the owner explicitly directs the confidence design to consult it,
with the qualification attached.** ⚠ *`NBA_LESSONS_LEARNED_FROM_MLB.md` exists in the thirty; whether
the confidence build actually consulted it is **NOT RECORDED** and is pass 1's question.*

### ⚠ 7 · **THE STANDING SAMPLING ORDER, ESCALATED**

> 🔴 ***"STOP GUESSING, EXPAND YOUR SAMPLES!!! Stop being lazy and doing shortcuts. **SAMPLE EVERYTHING
> BEFORE STARTING REPLICATING** — player tiers, prop lines, variations, directions. Exhaust online
> research, documentation check."***
>
> ***"Start testing fixes on LARGE SAMPLES — don't even waste time letting it finish… **just a SCOPED
> run**, so we don't need to waste time and resource running it all again. But be sure you test ALL
> POSSIBLE SAMPLES."***
>
> 🔴 ***"You cannot deploy shit if you are not sure."***

✅ **This is T15's SAMPLE-FIRST rule** *(the only directive the owner asked to be persisted)* **restated
three times in one session, and extended: the sample must SPAN the groups, and a fix is tested on a
SCOPED run rather than a full re-run.**

---

## 0a-T16-C. 🔴🔴🔴 **THE SCORE / CONFIDENCE CONTRACT — and `[LIVE-AUDIT]` FINDS THE LIVE TABLE CONTRADICTING IT** *(T16 pass 2, §T16.3, the migration audit over COMPASS facts 87–107; `SELECT` 2026-09-22)*

### 🔑🔑 1 · **CONFIDENCE IS A DATA THERMOMETER, NOT A PROBABILITY** *(owner directive; COMPASS fact 101)*

*It measures **how far the DATA supports this leg's hit probability** — factors mined and present,
complete, **REAL vs derived**, market corroboration, player consistency, form.* **It starts at 99 and
loses points for NAMED deficiencies**; a fully-supported leg reads ~99 and the floor (~55) needs
everything to stack against it at once. 🔑 *"Measured mean **0.92–0.95**, **which is the point: our
data IS good, so confidence IS high**. The 20–40% band is **impossible by construction** because the
core factors are always present."*

⚠⚠ **THREE EARLIER VERSIONS WERE WRONG AND EACH FAILURE TAUGHT SOMETHING** — *worth carrying because
each is a general trap:*

| | The version | Why it failed |
|---|---|---|
| **(a)** | **equal-mass quartiles** | **FORCE 25% of legs to be "low" however good the data** — *a **RANKING**, not a thermometer* |
| **(b)** | hand-weighted pillars | **failed verification on 2.1M legs**: *existence separated **NOTHING (0.0000)**, quality was **INVERTED (−0.0028)**, only market backing worked (**+0.0015**)* |
| **(c)** | the conformal version | scored `\|won − hp\| / √(p(1−p))`, **which is dominated by ALEATORIC noise — so a coin-flip leg with PERFECT data scored badly** |

### 🔑🔑🔑 2 · **ALEATORIC vs EPISTEMIC — the distinction that fixed it** *(COMPASS fact 102)*

> ***"Aleatoric uncertainty is the event's own randomness and is ALREADY STATED BY THE HP — a 0.50
> probability IS 'this is a coin flip'; encoding it again in confidence DOUBLE-COUNTS it. Confidence
> must measure EPISTEMIC uncertainty only — OUR IGNORANCE, which better data could reduce."***

⚠⚠ **AND IT EXPLAINS A MEASUREMENT ERROR WORTH REMEMBERING**: **comparing RAW `|actual − stated|`
across confidence tiers is INVALID when the tiers sit at different probabilities, because Bernoulli
variance PEAKS AT 0.50** — *"elite legs averaging HP **0.488** HAD to look worse than low legs at
**0.692** whatever their true reliability."* 🔑 **A metric that is a function of the thing being
compared cannot compare it — the same family as §0a-T15's "MAE on the mean is the wrong metric".**

✅ **DEDUCTION WEIGHTS ARE MEASURED, NOT ASSIGNED**: each factor's share comes from **how much realised
`|gap|` separates its high-value legs from its low-value legs**, with a **per-factor cap that
REDISTRIBUTES the excess rather than clipping it**, and a floor for factors that measure no
separation. 🔑 **Role carries the most — fringe players miss by 0.0283 against iron-men at 0.0008, a
35× difference.** ⚠ **And season phase is a factor here too: Oct–Nov 0.80 · Dec–ASB 1.00 · post-ASB
0.88 · push 0.92** — *the same phase shape the calibration layer measures independently
(`NBA_BASELINE_CALIBRATION.md` §0z-T16-B), and the source of open item **O6**'s `f_phase`.*

### 🔴🔴 3 · **SCORE IS 0–100 AND CONFIDENCE *ENHANCES* IT, NEVER TAXES IT** *(COMPASS fact 103 — **0 of the twelve AND 0 of the thirty**; a discovery, not a migration item)*

> ***"A straight product (`hp × conf`) KILLS good legs — **0.95 HP at 0.90 confidence scores 85.5,
> WORSE than the probability alone**, which is backwards."***

✅ **The fix: confidence pivots around a 0.85 NEUTRAL** — **above it the score is lifted toward 100 (up
to HALF the remaining headroom); below it pulled down (up to 35%).** *Verified on live rows at the
time:* **0.478 HP / 0.949 conf → 65.06** *(vs 45.39 multiplicative)*; **0.434 HP / 0.952 conf →
62.71 OUTRANKS 0.468 HP / 0.884 conf → 52.78** — 🔑 ***so better-supported data wins at equal
probability***, which is the whole purpose. ✅ **And `edge` is now its OWN COLUMN** *(distance above
break-even)* **because it answers a different question**: *"**edge is 'is this an opportunity', score
is 'how good is this leg'** — the slip engine wants both."*

### 🔴🔴🔴 4 · `[LIVE-AUDIT]` — **THE LIVE TABLE DOES NOT HONOUR "0–100". 36% OF IT IS NEGATIVE.** *(`SELECT` over `nba_score.final_hp`, 2026-09-22)*

| Measured | Value |
|---|---|
| **`score` range** | 🔴 **−52.488 → 99.99** *(the contract says **0–100**)* |
| **rows with `score < 0`** | 🔴 **6,924,101 of 19,215,200 — 36.0%**, across **20 of 30 props and BOTH sides** |
| where they sit | **entirely below `final_hp` ≈ 0.6**: deciles 1–6 contain every negative; **deciles 7–10 contain ZERO** |
| spread at fixed HP | **decile 1 spans −52.49 to +46.00** — *a ~98-point swing at essentially constant probability* |
| **`confidence` range** | **0.8540 → 0.9841, mean 0.9240** |

✅ **The mean CONFIRMS fact 101 exactly** *(0.92–0.95 predicted, 0.9240 measured)*. 🔑🔑 **But the
MINIMUM is 0.8540 — essentially AT fact 103's 0.85 neutral pivot — so in practice virtually every leg
sits on the LIFT side and the "pulled down up to 35%" branch is nearly unexercised.** ⚠ **The stated
~55 floor is never approached: the entire live range spans 0.13.**

🔴🔴 **SO THE NEGATIVES CANNOT COME FROM THE CONFIDENCE PULL-DOWN** — they are confined to low-`final_hp`
legs and scale with how far below ~0.6 the probability sits. ⚠⚠ **NOT RECORDED whether this is
intended** *(a deliberate below-break-even penalty would explain the shape, and `edge` is described as
"distance above break-even", but **no swept transcript says the SCORE carries one**)* **or a formula
defect.** **Rule 6: this records what the system IS.**

🔴 **OWNER DECISION** — *"Score is 0–100" is stated as a design contract in the COMPASS and as an
owner-facing property. **The live column returns values down to −52.5 on more than a third of its
rows.** Either the contract's wording needs correcting, or the formula does — and a slip engine that
ranks on `score` behaves very differently under the two readings.* ⚠ **This sweep does not change
code or data.**

### 🔴🔴🔴 5 · `[LIVE-AUDIT]` — **AND THE ENGINE'S OUTPUT TABLE COVERS ONE SEASON PLUS A SINGLE DAY**

*COMPASS fact 99 certifies the final calculation engine (`nba/build_final_hp.py`, config
`final_engine_complete_2026_09_18`):* ***"VERIFIED: 60/60 season-props, BOTH SEASONS, ~38.7M legs,
zero invalid probabilities."*** *Leg-level accuracy **0.5643 log-loss on 1,248,826 graded PrizePicks
legs**.*

| Season | **live rows** | props | **dates** | `built_at` |
|---|---|---|---|---|
| **2024-25** | **19,075,070** | 30 | **162** | 2026-09-19 18:21 UTC |
| 🔴🔴 **2025-26** | **140,130** | 30 | 🔴 **1 — `2026-01-15` only** | 2026-09-19 22:41 UTC |
| **total** | **19,215,200** | | | **49.7% of the certified ~38.7M** |

🔴🔴🔴 **THE CURRENT SEASON'S HALF OF THE ENGINE'S OUTPUT TABLE IS ONE GAME-DATE DEEP — and that date,
`2026-01-15`, is one of the three as-of days open item O5 already tracks.** ⚠⚠ **NOT RECORDED WHY**
*(rule 6; a concurrent session is building in this database and `prop_universe` is mid-rebuild, and
the 2025-26 rows carry the LATER `built_at`, which is consistent with a rebuild in flight — but no
swept transcript says so)*. 🔴 **Season-critical**: **the opener is 2026-10-20**, `final_hp` is what
COMPASS fact 66 says **the engine READS**, and **only 32% of its rows carry an `edge` at all**
(6,226,642 of 19,215,200 — expected, since `edge` needs a board line to compare against).

🔑 **THE GENERAL POINT, and it is the second instance in two passes** *(the first: `baseline_history`
2025-26 sitting 795 rows short of its certified figure — `NBA_DATABASE.md` §0w)*: ***a certification
records that a table was complete at a moment. It says nothing about the table today, and in this
system nine days was enough for one figure to drift by 795 rows and another to fall by half.***

---

## 0a-T16. 🔴🔴🔴 **THE EVIDENCE BEHIND THE SUPERSESSION — AND IT ANSWERS EVERY QUESTION T15 LEFT OPEN** *(T16 pass 1, §T16.2, the prose stratum read in order and in full — 156 segments / 108,570 chars)*

*§0a-T15-SUPERSESSION and §0a-T15-SUPERSESSION-2 below were written from **COMPASS facts 88–92**.
**This section is written from the transcript those facts summarise**, and the transcript is the
authority. **Four things it corrects or completes, two of them corrections to THIS SWEEP'S OWN
hedges.***

### ✅✅ 1 · **THE FOUR QUESTIONS T15 HANDED OVER, ANSWERED**

| | T15's open question | **T16's answer** |
|---|---|---|
| **(d)** | *"Which of the four A2 forms is NOT persisted to `factor_gate_results`?"* *(§T15.4a qualification (a))* | ⚠ **The premise was wrong.** The four forms are **flat → COMPONENT-LEVEL → novelty-weighted → magnitude-refit ("shrunk")**, and **the component-level test IS in the table**: T16 measures it at **0.9231 against the anchor's 0.7206 on the 13,319 legs where A2 fires** — **byte-identical to the table's `flat_A2` / `fires` row.** *So either the component-level run carries the `flat_A2` label or the two produced the same figure; **NOT RECORDED which**.* |
| **(c)** | *"WHICH two conclusions were corrupted by truncated CI logs?"* *(COMPASS fact 92)* | ✅ **BOTH ARE IN THE TRANSCRIPT, AND THE SECOND IS CAUGHT IN THE ACT.** *"The log window keeps **cutting off the high-novelty block's anchor line**, so I can't confirm whether the 0.7924 figure sits against the anchor's 0.7150 or against a different anchor value on that subset. **The numbers I've been quoting for the high-novelty slice may be MIXING TWO BLOCKS.**"* — and *"**I've now TWICE drawn conclusions from partial log output.**"* 🔑 **The corrupted reading was the high-novelty slice, quoted three times before it was checked**; the queryable re-run replaced it with **0.7436 vs 0.7946**. |
| **(e)** | *"`4,699` (fact 89) vs `4,695` (the live table) — which is right?"* | ✅ **`4,695`.** The transcript says *"on **4,695** legs where the absence was already priced into recent form"*, matching `factor_gate_results`. **Fact 89's `4,699` is the outlier.** |
| **(c) of §T15.4a** | *"T15 shipped a COMPONENT-LEVEL multiplier, so the shipped form's own leg-level number is NOT RECORDED."* | 🔴 **CORRECTED — IT IS RECORDED, AND IT IS THE WORST ONE.** *"On the 13,319 legs where A2 actually fires: anchor alone **0.7206**; A2 applied correctly to minutes **0.9231**. Applying it at the component level — **the operation the engine design specified** — is still substantially worse. **So the collapse wasn't a wrong-operation artifact; A2 genuinely damages the projection when layered onto the certified baseline.**"* |

### 🔴🔴 2 · **THE M1/B4 REVERSAL — THE OWNER ORDERED IT, AND IT WORKED** *(COMPASS fact 85's evidence)*

**The first M1 verdict was a clean null and the sanity gate passed**: *0 of 7 props, gains −0.001 to
−0.002, **sd 0.147, 7.7 defenders per player-game, 5,116 test rows**, betas **+0.066 to +0.102** — the
correct sign, too small to beat the noise.* ⚠ **Then the owner refused it** *(`NBA_SYSTEM_DESIGN.md`
§0z §6: **"why do we have a CRUDE defender feature? MAKE A DECENT ONE!"**)*, **and the audit that
followed found the flaw in four of six rejections:**

| Rejection | Feature actually used | Crude? |
|---|---|---|
| **B4 v2** defender-quality change | points allowed / possession | ❌ **yes — the exact metric just replaced** |
| **B4 v3** rim protection | blocks-per-36 × minutes | ❌ **yes, and worse — the research says rim protection is largely DETERRENCE, shots never attempted, which block counts specifically MISS** |
| **M1** defender level | the same crude metric | ❌ **yes — same flaw** |
| **rate response** | usage multiplier from the allocator | ⚠ **partly — the usage allocation was ASSUMED proportional to baseline usage share, never fitted** |
| **B4 v1** opponent vacated minutes | raw minutes sum | ⚠ yes, but subsumed by the better versions |
| **A5** projected lineups | binary starter flag | ✅ **this one HOLDS — a binary flag is strictly LESS information than the continuous projected minutes the allocator already computes. Only A5 survives on MECHANISM rather than measurement.** |

✅ **THE PROPERLY BUILT FEATURE — `nba_ref.defender_ratings`**: a **two-way fixed-effects ridge** that
separates the defender's effect from the offensive player's, then shrinks for reliability.
**111,768 ratings across both seasons, 22 weekly as-of dates (Nov 4 → Apr 9), 500 defenders, FIVE
channels:**

| Channel | defenders | mean reliability | sd of shrunk rating |
|---|---|---|---|
| `def_pts` | 500 | 0.436 | **3.79** per 100 poss |
| `def_foul` | 500 | 0.436 | 0.68 per 100 |
| `def_tov` | 500 | 0.436 | 0.44 per 100 |
| `def_fg` | 498 | 0.449 | **2.58 pp** |
| `def_3p` | 455 | 0.448 | **1.73 pp** |

🔑 *Three things it gets right that the crude version did not:* **offence-adjusted** *(a defender who
draws the opponent's best scorer every night no longer looks bad by construction — the core flaw the
Sloan work identifies)*; **reliability is CARRIED, not assumed** *(mean 0.44 means a typical rating is
shrunk more than half way to the mean — correct for a metric with "almost no year-to-year
correlation")*; **five channels, not one** *(`def_3p`'s 1.73 pp spread is materially smaller than
`def_fg`'s 2.58 — exactly right, since three-point defence is the noisiest signal in basketball)*.

🔑🔑🔑 **AND THE RE-TEST'S DECISIVE DETAIL — EVERY WIN COMES FROM THE INTERACTION, NOT THE MAIN
EFFECT**: **4 props helped — `pra` (`def_pts`: base 6.574 → main 6.569 → interactions **6.524**),
`fta` (`def_foul`: 1.761 → 1.758 → 1.756), `points`, `fga`.** ⚠ **On `pra` the main effect gains
0.005 and the interaction gains 0.050 — TEN TIMES MORE.** **The A2 interaction coefficient is the
largest term in every case: +0.088 on pra, +0.213 on fta, +7.383 on threes.** 🔑 ***"Books misprice
when factors move TOGETHER — a key teammate injury in a favourable matchup"*** *(the practitioner
source that predicted it)* — **and every earlier factor test fitted main effects only.**

### 🔴🔴 3 · **THE PRODUCTION USAGE ALLOCATION WAS NEGATIVELY CORRELATED WITH REALITY**

*The minutes side of A2 is a proper conserving allocation; **the USAGE side was hardcoded as
proportional to baseline usage share and never fitted.** Measured:*

| Allocation | MAE | **correlation with reality** |
|---|---|---|
| **p0 — proportional to baseline usage** *(the assumption IN PRODUCTION)* | 0.1977 | 🔴 **−0.0235** |
| p1 — proportional to allocated minutes | 0.2073 | +0.0936 |
| **p2 — fitted** | **0.1944** | **+0.1095** → **+0.1225** after ridge |

🔴 ***"The assumption currently in production doesn't merely fit poorly — IT POINTS THE WRONG WAY.
That's WORSE THAN ALLOCATING AT RANDOM."*** 🔑 **And the fitted coefficients say why**: **minutes lift
is the dominant term (+0.026 standardised)** while baseline usage, baseline minutes and the creator
flag are all near zero and slightly negative — ***"who absorbs the vacated shots is driven mainly by
WHOSE MINUTES INCREASE, not by who was already a high-usage player."*** ⚠ **The unregularised fit
produced betas of −15.7 and −22.0** — caught as *"the signature of a fit that was overfitting"* —
**ridge brought them to −0.008…+0.026 AND improved held-out correlation**, which is the diagnostic.
⚠ **Rebuild effect: the 2025-26 usage multiplier moved 1.3696 → 1.5728 with sd 0.369 → 0.866** — *the
fitted allocation **concentrating** vacated usage on specific players rather than spreading it.* 🔴
**2024-25 was left on the old values in this stretch — an inter-season inconsistency, recorded.**
⚠ *Also caught by the owner in passing and fixed: **"I just HARDCODED STANDARDISATION CONSTANTS I
GUESSED AT"** — the fit now emits the real values.*

### 🔴🔴 4 · **THE FUNNEL — BUILT, MEASURED AT −13.8%, AND THEN DESTROYED BY THE ANCHOR**

*Research (RotoGrinders, Stokastic, Basketball-Reference's SPS, academic shot-chart models) rejected
the scalar-multiplier approach outright:* ***"it's not some kind of simple multiplication problem. It
all works together — opportunity FUNNELS DOWN through median projected minutes and adjusted baseline
stats."*** **The chain: minutes → possessions → usage share → attempts → efficiency → points**, each
factor acting at its own link *(RotoGrinders' weights: **minutes 20–25%, usage 15–20%, pace 5–10%** —
minutes dominate, as the funnel has it)*.

✅ **Measured on 5,216 real PrizePicks legs**: **funnel without factors 0.9227 log-loss / 0.3317 Brier
/ 6.324 MAE → funnel WITH factors 0.7951 / 0.2881 / 5.392 — a 13.8% log-loss reduction**, against
scalar tests that had measured **0.000 to 0.002** and called the same factors worthless.

🔑🔑 **THE THREE ERRORS THAT COMPOUNDED TO HIDE IT**, stated by the transcript: **(1) crude features**;
**(2) scalar application** — *"one multiplier on the final mean, where OPPOSING EFFECTS CANCEL: a
teammate out pushes usage UP while a tough defender pushes efficiency DOWN, netting ~1.03 and looking
like nothing — and where the per-36 rate already contains an average defender, so the adjustment
double-counts"*; **(3) the wrong metric** — *"MAE on the mean is blind to a factor that RESHAPES THE
DISTRIBUTION, which is exactly what matchup factors do."* ⚠ **Error 3 was identified by Gemini**:
*"a tough defender might barely move a player's average while **CUTTING HIS CEILING** substantially —
that changes the probability of an over at a high line enormously, and shows up as NOTHING in MAE."*

🔴🔴 **THEN THE ANCHOR TEST KILLED THE FUNNEL TOO** *(6,996 real legs)*: **certified baseline anchor
alone 0.7299 · anchor × defender 0.7309 · the funnel + factors 0.7951 · anchor × A2 1.0123 · anchor ×
A2 × defender 1.0184.** ***"The certified baseline alone beats my funnel-with-factors by 8%. MY FUNNEL
WAS NEVER BETTER THAN THE SYSTEM — IT WAS BETTER THAN A ROLLING-MEAN STRAWMAN I BUILT MYSELF."*** 🔑
**That sentence is COMPASS rule 90.4's origin, and §0a-T15-SUPERSESSION-2 quotes its conclusion; this
is where it happened.**

### ⚠ 5 · **A DIAGNOSIS THE TRANSCRIPT ITSELF RETRACTS — and the retraction is architecturally important**

*The first explanation of the A2 collapse was **"the baseline's `proj_min` already applies the injury
report, so A2 applies it twice"**. ⚠ **That is WRONG for `baseline_history`, and the transcript says
so**:*

> ***"The injury layer lives in `build_baseline_ladder.py` — THE PRODUCTION WRAPPER — not in the
> certified recipe"***, with a **game-day 09:00 ET cutoff** and the comment *"roster rows include DNPs
> (43 of 173 that day) — the enrichment layer removes them"*. ***"`baseline_history` is built from the
> RECIPE, which has NO injury handling at all. So the anchor I tested against never contained the
> injury report."***

🔴🔴 **TWO PATHS WITH DIFFERENT INJURY SEMANTICS, AND THAT IS ITSELF WORTH KNOWING**: **the production
ladder applies the report at 09:00 ET; `baseline_history` does not apply it at all.** ✅ **The delta
framing still stands for PRODUCTION** *(where the wrapper applies the report and enrichment carries
only changes after it)*, **but it is not what the historical test was measuring.** ⚠ **The final
cause is neither**: *"the baseline's `proj_min` is built from the **AS-OF ROSTER STATE**, so it
already reflects who has been playing. If a star has been out, his teammates' recent minutes are
already elevated… A2 then adds a further 30% for an absence the baseline has effectively priced
**through recent form**."* 🔑 ***"That's the same rolling-mean contamination identified in the very
first panel — it never went away, it just moved."***

✅ **AND THE COMPONENT INTERFACE NOW EXISTS**: **`proj_min` and `rate36` are emitted from the recipe
into `baseline_history`** *(avg `proj_min` **24.45**, points rate **16.5 per 36**, rebounds **7.15 per
36**)* — ***"the component interface the engine design always required and never had"*** — which is
what let the component-level test run at all.

### 🔑🔑 6 · **THE THREE-STAGE PLACEMENT, WITH THE CALL THAT MATTERS**

| Stage | When | What |
|---|---|---|
| **1** | **overnight, heavy, unbounded time** | the certified recipe's `proj_min` *(role tiers, blowout mixture, coach gate)*, **defender ratings**, rate cells, dispersion, Platt, and **all factor coefficients** — *"this is where the expensive fitting lives"* |
| **2** | **mid-morning, after the 1 PM ET report** | availability scenarios per game, and per branch: minutes and usage allocation, **the expected-defender JOIN**, shot mix, efficiency, the full ladder |
| **3** | **2:30 PM, minutes only** | select the realised branch, apply the market adjuster, join the board, rank — *"no fitting, no history scans, nothing expensive"* |

🔑🔑 **THE KEY PLACEMENT CALL**: ***"defender RATINGS are stage 1 but the defender JOIN is stage 2 — a
player's expected defender depends on which opponents are available IN THAT BRANCH, so it cannot be
precomputed once."*** ⚠ *Superseded in its clock by COMPASS fact 107's two pipelines at 1:15 PM PT
(2026-09-19); **the ratings-vs-join split is orthogonal to the clock and stands.***

### 🔑🔑🔑 7 · **THE REALIGNMENT RESULT — what the owner's order actually produced**

*After the owner ordered a full COMPASS re-read (`NBA_SYSTEM_DESIGN.md` §0z §9), the assistant named
its own drift in one paragraph, and it is the session's most useful sentence:*

> ***"What I lost sight of — FACT 5: the standard is LEG-LEVEL CALIBRATION, band × direction × rung,
> on both seasons, same recipe. **NOT log-loss races against comparators I built.** I spent the
> session chasing factor wins and grading them with the wrong yardstick."***
>
> ***"What's non-negotiable and already decided (facts 7b, 68): the baseline owns everything knowable
> by the morning build, including the day-before injury report and referee assignments. **Enrichment
> prices only the SAME-DAY RESIDUAL.** … That split isn't up for re-litigation — **my A2 work kept
> violating it** by re-applying what the baseline already carries."***

🔴🔴 **AND THE INSTRUMENT IT CONCLUDES IS MISSING** — *"the real question isn't 'which factor wins.'
It's: **on any day of the past two seasons, how sharp is the final HP, at every granularity?** That's
a **VERIFICATION HARNESS**, and it's **what I should have built BEFORE any factor work**"* — one
report over any date range measuring final HP against outcomes, **broken out by prop × band ×
direction × rung × role tier × phase, flagging every cell that misses tolerance.** 🔑 **That is the
owner's acceptance criterion turned into an instrument** *(`NBA_SYSTEM_DESIGN.md` §0z §1)*, **and
whether it was built is NOT RECORDED in this transcript.**

---

## 0a-T15-SUPERSESSION-2. 🔴🔴🔴 **AND IT IS WIDER THAN A2 — THE CERTIFIED BASELINE BEATS *EVERY* ENRICHMENT FACTOR AT THE LEG LEVEL** *(T15 pass 4, §T15.5, 2026-09-22)*

**COMPASS fact 88 (2026-09-13), config `enrichment_reality_check_2026_09_13`** — ✅ **`[LIVE-AUDIT]`
verified by `SELECT` against `nba_config.classification_config`, 2026-09-22, `updated_at`
2026-09-13T19:25:18Z.** *Leg-level on **real PrizePicks points lines, 2025-26**:*

| Model | log-loss | |
|---|---|---|
| **`anchor` — the certified baseline** | **0.7150** *(Brier **0.2594**)* | ✅ **wins** |
| `anchor × defender` | 0.7309 | ⚠ **neutral — the closest any factor came** |
| `shrunk + novelty A2` | 0.7924 | ❌ |
| a funnel rebuilt from **rolling means plus factors** | 0.7951 | ❌ *"**beaten by the very anchor it bypassed**"* |
| `novelty-weighted A2` | 0.8165 | ❌ |
| **`flat A2`** | **0.9065** | ❌❌ |

🔴🔴 **THE RETRACTION, VERBATIM**: ***"A2's earlier 'shipped and validated' claim is RETRACTED: it was
measured against a ROLLING-MEAN STRAWMAN, not against the system's own baseline."***

⚠⚠ **AND THAT NAMES §0a-T15'S EXACT DEFECT.** **T15's A2 gate was allocator MAE `4.609` against
`recent-5`'s `4.875`.** 🔑 ***`recent-5` IS the rolling-mean strawman.*** **This is COMPASS rule 90.4
— *"always compare against the system's OWN BEST COMPONENT, never a strawman built for the test"* —
applied to the factor that motivated it.** *So §0a-T15's figures are correct measurements of the
wrong comparison: **the question "is the allocator better than a rolling mean?" was answered
correctly, and it was never the question the engine asks.***

### 🔑🔑 THE MECHANISM, AND THE BEST METHOD RULE IN THE CORPUS *(COMPASS fact 89 — 3 of the thirty, **0 of the twelve** before this)*

*The four forms were not four guesses; they were a **sharpening sequence**: **flat → component-level →
novelty-weighted → magnitude-refit**. It **recovered 60% of the damage (0.9065 → 0.7924)** and
**converged TOWARD the anchor WITHOUT PASSING IT**.*

> 🔑🔑🔑 ***"When every refinement moves a factor closer to doing NOTHING, the LIMIT OF THE SEQUENCE
> IS THE BASELINE — the signal is not MIS-APPLIED, it is ALREADY PRESENT."***

⚠⚠ **That is a general test, and it is the one §0a-T15's round did not have**: *a factor whose
successive improvements all shrink its own effect is not being implemented badly — it is
**redundant**, and the sequence's own shape says so before any single verdict does.*

**Mechanically**: **`proj_min` is built from the AS-OF ROSTER STATE and RECENT MINUTES**, so *"a player
whose teammate has been out **already shows elevated minutes there**"* — **A2 mostly re-reads
information the baseline reads from the same source.** ✅ **The low-novelty slice isolates it exactly**:
*legs where the absence was already priced into recent form — **flat A2 0.9065 vs anchor 0.7150.***
⚠ **A discrepancy recorded, not resolved: fact 89 says 4,699 legs; `nba_score.factor_gate_results`
says `low_novelty` n = 4,695.** **NOT RECORDED which is right** *(the two may be different
populations, as §2 above warns).*

🔑 **AND IT IS THE SAME FINDING AS §0a-T15 §3's A5 REJECTION, ONE LAYER UP.** *A5 was rejected because
**recent-5 minutes already encode starting status**; A2 is closed because **`proj_min` already encodes
the absence**. **Both factors were redundant against the same component, and only the second round
tested against it.***

### 🔑🔑 A2 IS NOT CLOSED AS "NO SIGNAL" — IT IS CLOSED AS "NOT YET MEASURED WHERE SIGNAL COULD BE"

⚠⚠ **The config's own `next_test` field carries the defined path, and NO document carries it**
*(probed 2026-09-22: **0 of the twelve, 0 of the thirty**, both trees)*:

> ***"Rebuild the baseline with a DAY-BEFORE INJURY CUTOFF, then apply A2 ONLY to players whose status
> CHANGED between that cutoff and the 2:30 PM report."***

🔑 **That is a materially different state from B4's null**, and the distinction matters for the build
order: **B4 was measured and found empty; A2 was measured on a population where the baseline had
already seen the same information, and the population that could separate them has not been built.**

✅ **AND THE SAME CONFIG FIELD CARRIES §T14.3a VERBATIM**: ***"Any test that reads the same report for
both layers measures DOUBLE-COUNTING, not value."*** ⚠ *The rule is already well recorded (7 of the
thirty, 5 of the twelve — the sweep derived it at T14 from a different transcript). **What is new is
that it exists as a LIVE CONFIG FIELD dated 2026-09-13** — independent corroboration of a sweep
finding, from the system itself rather than from another reading of the same text.*

### 🔴 COMPASS FACT 92 IS ABOUT THIS SESSION, AND IT NAMES A DEFECT THE TRANSCRIPT'S OWN PROSE DOES NOT

> ***"TWO conclusions THIS SESSION were drawn from TRUNCATED CI LOG WINDOWS that clipped a block
> mid-way and MIXED NUMBERS BETWEEN SLICES."***

⚠⚠ **T15's prose records the log problem ONCE — *"the oreb run has scrolled out of the run list"* —
and treats it as an inconvenience that motivated building the calibration checker.** **Fact 92 says it
actually CORRUPTED TWO CONCLUSIONS.** 🔴 **NOT RECORDED: which two.** *Recorded here as an open
identification rather than guessed at — and it is a caution on every figure in §0a-T15 that was read
from a run output rather than from a table.*

✅ **The remedy, in three parts**: **every slice prints on ONE LINE so nothing can be clipped**;
**verdicts write to `nba_score.factor_gate_results`**; and the standing rule — 🔑 ***"Any verdict that
exists only in an Actions log is NOT A VERDICT."***

🔑🔑 **THE PATTERN, THREE TIMES IN TWO DAYS**: the **calibration checker** *(`NBA_BASELINE_CALIBRATION.md`
§0y-1)*, the **reliability scorer** *(§0a-T15 §7)*, and **`factor_gate_results`** — **each time, the fix
for an unreadable result was to STOP DEPENDING ON THE LOG.** ⚠ *A system that reads its own results
from ephemeral output has no memory of its own verdicts, and this session hit that wall three times
before naming it.*

### ✅ WHAT SURVIVES — **the enrichment half of §0a-T15 is retracted; the baseline and infrastructure half stands**

| | |
|---|---|
| ❌ **RETRACTED** | **A2's ship claim** *(fact 88)*; and by extension every §0a-T15 verdict that rests on an MAE-on-the-mean gate against a rolling-mean comparison. |
| ⚠ **UNSAFE IN BOTH DIRECTIONS** | **B4's and M1's nulls** — COMPASS fact 85 already says they were **WRONG**, *"the earlier nulls measured a crude feature and a main-effect-only fit, not the absence of signal"* *(rule 90.1)*. **A rejection measured on the wrong layer is no safer than a ship measured on the wrong layer.** |
| ✅ **SURVIVES AND IS BUILT ON** | **N1's measured probabilities** — COMPASS fact 97 builds **N1 v3** on top of them *(`availability_model_n1v3_2026_09_15`, `nba/fit_n1_model.py`, four layers)*. **N1 was a MEASUREMENT, not a factor verdict, and measurements were not what failed.** |
| ✅ **SURVIVES** | **The oreb rebuild and the certified / penalized / excluded policy** *(baseline layer, graded at the leg level from the start)*; **the 27 / 3 / 0 all-props audit**; **the Fliff fix**; **the live board archiver**; **the calibration checker**; **the reliability scorer**; **the sanity gate**. |

🔑 **The dividing line is clean and worth stating as a rule: what T15 MEASURED stands; what T15
JUDGED on an MAE gate against a strawman does not.**

---

## 0a-T15-SUPERSESSION. 🔴🔴🔴 **READ THIS BEFORE §0a-T15 — A2 WAS CLOSED THE DAY AFTER IT SHIPPED, AND IT IS THE ONLY FACTOR T15 SHIPS** *(T15 pass 3, §T15.4a, 2026-09-22)*

⚠⚠ **RULE 5, BOTH DATES.** **§0a-T15 below is an accurate account of the 2026-09-12/13 round and every
figure in it stands.** ***Its headline does not.*** **A2 teammate redistribution — the single factor
that survived that round's gate — was closed on 2026-09-13, and it does not ship in any form.**

| Date | Verdict | Gate |
|---|---|---|
| **2026-09-12/13** | ✅ **A2 SHIPS as a minutes multiplier, 15 of 19 props** | **MAE on the mean** — minutes MAE, then per-prop MAE, then MAE under window-time information |
| **2026-09-13** 🔴 | ❌ **A2 IS CLOSED — "it does not ship in any of four forms"** *(COMPASS fact 91)* | **LOG-LOSS AT THE LEG LEVEL against the board anchor** |

### ✅ `[LIVE-AUDIT]` **VERIFIED IN FULL — every figure reproduces from `nba_score.factor_gate_results`** *(`SELECT`, 2026-09-22; the table holds **104 rows · 19 models · 45 slices · season `2025-26` only**)*

| Slice | n | **anchor** | `shrunk_novelty_A2` | `novelty_A2` | `flat_A2` |
|---|---|---|---|---|---|
| `all` | 15,024 | **0.7231** | 0.7540 *(−0.0308)* | 0.7592 *(−0.0361)* | **0.9034 *(−0.1803)*** |
| `fires` | 13,319 | **0.7206** | 0.7546 *(−0.0339)* | 0.7605 *(−0.0398)* | **0.9231 *(−0.2025)*** |
| **`high_novelty`** | 866 | **0.7436** | **0.7946 *(−0.0511)*** | 0.8112 *(−0.0676)* | 0.8353 *(−0.0917)* |
| `low_novelty` | 4,695 | **0.7147** | 0.7273 *(−0.0125)* | 0.7287 *(−0.0139)* | 0.9056 *(−0.1909)* |

🔑🔑 **THE DECISIVE FINDING IS THE SLICE, NOT THE TOTAL** — *fact 91's own words:* ***"the HIGH-NOVELTY
slice — the one place the mechanism predicted A2 SHOULD work, since a brand-new absence is information
the baseline CANNOT have — is where it does WORST (−0.051 vs −0.013 on low novelty). That is the
OPPOSITE of the hypothesis."*** **The mechanism's explanation**: *"a star's first game out is exactly
when a coach IMPROVISES, and the baseline's conservative projection handles that uncertainty better
than a confident multiplier. **Being more aggressive when the situation is least predictable is
backwards.**"*

### 🔑🔑 WHY THE TWO VERDICTS DISAGREE — **and it is the corpus's own rule that explains it**

*COMPASS fact 90, **"FOUR RULES FOR EVERY FUTURE FACTOR (earned the hard way this session)"** —
⚠ **1 of the thirty and ZERO of the twelve before this entry**, and **rule 2 is the one that closed A2**:*

| # | The rule | |
|---|---|---|
| **1** | **A null is only as strong as the feature that produced it** | *a crude defender metric produced false nulls that a proper two-way ridge overturned — which is why **COMPASS fact 85 says the M1/B4 rejections were WRONG*** |
| **2** 🔴🔴 | **MAE ON THE MEAN IS THE WRONG METRIC** — *the product is **P(stat > line)**, and a factor can **reshape the distribution without moving the mean**, so **grade at the LEG LEVEL on real board lines**.* | 🔑 ***Every verdict in §0a-T15 was decided on MAE. This rule is why A2's MAE win did not survive a leg-level gate — and, in the other direction, why B4's and M1's MAE nulls were not safe either.*** |
| **3** | **Never duplicate a baseline internal** | *a hand-built blowout shrink duplicated the recipe's `P(blowout\|spread)` mixture, and a rolling-mean funnel duplicated `proj_min` — **both made results worse*** |
| **4** | **Always compare against the system's OWN BEST COMPONENT, never a strawman built for the test** | *the `anchor` column above is that comparison made concrete* |

⚠⚠ **SO THE 88% WINDOW-KNOWLEDGE RESULT IN §0a-T15 §1 IS NOT WRONG AND IS NOT A REASON TO SHIP.** It
measures how much of A2's **minutes-MAE** value survives at window time. **Rule 2 says minutes MAE was
never the product.** 🔑 **Both facts hold together: A2 predicts minutes well and prices legs worse
than the anchor.** *That is the cleanest example in the corpus of §T14.3a's family — **a factor
measured on the wrong layer.***

### ⚠ THREE THINGS THIS SWEEP RECORDS AS QUALIFICATIONS, NOT AS DOUBTS

| | |
|---|---|
| **(a)** | **Fact 91 names FOUR forms tested** *(flat on the mean · component-level · novelty-weighted · magnitude-refit against the baseline's minutes residual)*; **`factor_gate_results` holds THREE** — `flat_A2`, `novelty_A2`, `shrunk_novelty_A2`, plus `anchor`. ⚠ **One of the four is NOT persisted**, so *"evidence… queryable"* is true of three forms. **NOT RECORDED**: which one is missing. |
| **(b)** | **The table carries season `2025-26` ONLY** *(`min` = `max`)*. ⚠ **A factor was closed on ONE season, while a PROP needs TWO to certify** *(the rule that rejected oreb twice, §0y in `NBA_BASELINE_CALIBRATION.md`)*. **Recorded as an asymmetry between the factor gate and the prop gate — not as a claim that the verdict is wrong.** |
| **(c)** | **`flat_A2` loses by 0.18–0.20 log-loss — an order of magnitude worse than the shrunk form.** ⚠ T15 shipped a **component-level** multiplier *(it adjusts `proj_min`)*, which is **not** `flat_A2`, so the shipped form's own leg-level number is **NOT RECORDED** unless it is the missing fourth. *Stated as an open identification, not an inference.* |

🔑 **AND THE DURABLE POINT FOR THE ENGINE**: **`nba_score.factor_gate_results` (`season, slice, model, n,
log_loss, brier, gain_vs_anchor`) is where factor verdicts now live** — *"queryable, **no longer parsed
from CI logs**"* — **the same move as the calibration checker** *(`NBA_BASELINE_CALIBRATION.md` §0y-1)*:
**a verdict that outlives the run that produced it.** ⚠ **Twice in two days, the fix for an unreadable
result was to stop depending on the log.**

---

## 0a-T15. 🔑🔑 **THE FIRST FACTOR RESULTS IN THE CORPUS THAT STATE EACH LAYER'S INFORMATION SET — and the CERTIFIED / PENALIZED / EXCLUDED policy** *(T15 pass 1, §T15.2a–c, written 2026-09-22 from the 2026-09-12/13 transcript)*

### 🔑🔑 1 · THE QUESTION §T14.3a ASKED, ANSWERED HERE FOR THE FIRST TIME

*§T14.3a's rule: **"any factor test using ONE report for BOTH layers measures DOUBLE-COUNTING, not
value."** Across the swept corpus **no factor result states which report each layer read.** T15 is the
first that does — **because the assistant discovered mid-session that it had been using one.***

> ***"both b4 tests used WHO ACTUALLY PLAYED, derived from box scores. that's POST-GAME TRUTH. at
> 2:30 pm pt the engine won't know that; it will know the day-of injury report and the projected
> lineups… so what i actually tested is b4 with PERFECT ABSENCE KNOWLEDGE."***

⚠ **And the consequence it drew is the one that matters, because it runs the other way:**

> ***"the inverse is the important consequence… **a2 was ALSO fitted and validated on perfect
> knowledge**. its +0.347 mae gain on pra assumes we know exactly who's out… **a2's live value will
> be lower than its measured value, and by an amount we haven't quantified.**"***

✅ **IT WAS THEN QUANTIFIED.** The allocator's absence input was rebuilt from the **2:30 pm report
as-of**, with Questionable weighted by the measured `p_plays` rather than treated as present or
absent, and the same held-out gate re-run — **out of sample on 13,989 player-games**:

| Information set | Minutes MAE |
|---|---|
| **A** — no absence knowledge | **6.210** |
| **C** — WINDOW knowledge *(2:30 pm report, N1-weighted)* | **4.580** |
| **B** — PERFECT knowledge *(post-game truth)* | **4.368** |

🔑 **Window knowledge captures 88% of the value of perfect knowledge.** *The gap between knowing
nothing and knowing everything is **1.84 minutes**; the 2:30 pm report delivers **1.63** of it.* ✅
**The cost of uncertainty — questionables resolving either way, late scratches — is 0.21 minutes.**

⚠ **AND THE NULL SURVIVES THE SAME TEST A PRIORI, which is why B4 did not need re-running:** *"if the
factor carries **no signal even with perfect information**, it cannot carry signal with the noisier
version available at 2:30. **A null under ideal conditions is a valid null under degraded ones.**"*
🔑 **The asymmetry is the durable rule: a POSITIVE result fitted on post-game truth is an UPPER BOUND
and must be re-measured at window time; a NULL fitted on post-game truth is already conservative.**

### ✅ 1b · **A2's FITTED ALLOCATOR, WRITTEN OUT** *(T15 pass 2, §T15.3b — migration item: 4 of the thirty, **0 of the twelve** before this)*

**`allocator_share = exp( 0.2214 + 0.3953·log(as-of min) + 0.5160·log(recent-5) + 0.0043·log1p(games) )`**,
**normalised × team minutes** — `nba/fit_minutes_allocator.py`.

🔑🔑 **THE FACTOR IS THE DIFFERENCE OF TWO ALLOCATIONS** — over **{played + ruled out}** vs **{played}**
— *which is what makes it conserving by construction rather than by tuning.*
`nba/build_redistribution_factors.py` → **`nba_score.redistribution_factors`, 51,806 rows,
conservation 1.0015.** ⚠ **Cold start = a bench prior of 8 minutes, NEVER dropped** *(dropping a
cold-start player would break conservation — the gate the five retracted panels could not clear)*.
**Two-season `min_mult` 1.3228 / 1.3147.** **Skips `stocks` / `blocks` / `steals` / `fouls`** — the
four of nineteen props that do not improve.

⚠ *The **0.5160** weight on recent-5 against **0.3953** on as-of minutes is why the A5 rejection
follows structurally: **recent-5 already dominates the allocation**, so a binary starter flag has
nothing left to add (§3 below).*

### ⚠⚠ 2 · THE POPULATION RULE T15 STATES IN ITS OWN WORDS — **the same class as §T14.3a**

🔴🔴 **AND THE CORPUS NOW CARRIES *THREE* A2 MINUTE-MAE TRIPLETS ON THREE DIFFERENT POPULATIONS**
*(T15 pass 2 cross-check, §T15.3b — none of the three is wrong, and none is comparable to the others)*:

| Triplet | Population | Contrast being drawn |
|---|---|---|
| **4.609** allocator vs **4.875** recent-5 | the allocator's own accuracy test | **is the allocator better than the naive minutes estimate?** |
| **4.641** with outs · **6.186** ignoring outs · **5.029** as-of mean | **held out on ABSENCE GAMES** | 🔑 *"allocating while IGNORING absences is WORSE than doing nothing"* |
| **6.210** none · **4.580** window · **4.368** perfect | **ALL 13,989 player-games** | **how much of perfect knowledge survives at the window (88%)** |

⚠⚠ **A reader who takes any two of these as the same measurement will conclude the factor got worse
or better between runs. It did neither — the POPULATION changed.** 🔑 **This is the population rule
applied to the corpus's own figures, and it is why every A2 number in these documents is now written
with its population attached.**

*A2's per-prop gain appears in this transcript at **three different magnitudes**, and all three are
correct:* **pra +0.347 · points +0.097** *(the original per-prop gate)* **vs points +0.054**
*(the window-time re-run)*. **The reason is the POPULATION, not the method:**

> ***"this test scores ALL player-games (13,989), whereas the earlier per-prop test scored ONLY GAMES
> WITH ABSENCES. diluted across every game including those with no absences at all, the average gain
> necessarily shrinks. **both numbers are correct for their population, and the operationally
> relevant one is the absence-game figure, since that's when the factor fires.**"***

⚠ **So a factor's quoted value is meaningless without its population, and the two populations differ
by roughly 6×.** *Recorded because the corpus quotes the +0.347 figure without its population.*

### ✅ 3 · THE FACTOR VERDICT TABLE AS T15 LEAVES IT *(the 09-12/13 round — see §T15.2h on the date)*

> 🔑 **THE CODE BEHIND THIS TABLE — added 2026-09-23, `§F5.5`.** *Every script below exists in the
> repo today and was named in **`0` of the twelve** before this line. **A reader could not reach the
> apparatus from the verdict.***
>
> | verdict in the table below | the script that produced it |
> |---|---|
> | **`A2`** teammate redistribution — SHIPPED | **`nba/fit_usage_allocation.py`** *("A2 USAGE ALLOCATION — FITTED, replacing the assumption")* |
> | **`A2` rate response** — REJECTED | **`nba/fit_rate_response.py`** *("the second half of factor A2, and the end-to-end test that it helps")* |
> | **`N1`** status resolution — MEASURED | **`nba/measure_n1_status_resolution.py`** *("MEASURED FROM OUR OWN ARCHIVE, at the 2:30 PM PT decision cutoff")* · **`nba/fit_n1_granular.py`** *("N1 v2 — GRANULAR P(plays \| Questionable) … not a flat 55%")* |
> | **`B4` v1** vacated minutes — REJECTED | **`nba/fit_b4_opponent.py`** *("fitted and gated exactly like A2")* |
> | **`B4` v2** defender-quality change — REJECTED | **`nba/fit_b4_defender_quality.py`** |
> | **`B4` v3** RIM PROTECTION — COMMISSIONED, not tested in T15 | 🔑 **`nba/fit_b4_rim_protection.py` EXISTS** *("B4 SUB-CASE — BLOCKS-AGAINST VULNERABILITY")* — ⚠ **whether it was ever RUN is `NOT RECORDED`** |
> | **`M1`** defender-quality LEVEL — NOT TESTED in T15 | 🔑 **`nba/fit_m1_defender_level.py` EXISTS** *("as a BASELINE-STAGE factor")*, and **`nba/retest_defender_factors.py`** *("M1 / B4 RE-TEST with PROPER defender ratings, and WITH INTERACTIONS")* — ⚠ **results `NOT RECORDED`** |
>
> 🔴🔴 ***The two rows this table marks "NOT TESTED" / "COMMISSIONED" both have a fitting script
> sitting in the repo.*** **That does not mean they were tested** — a script can exist unrun — **but
> it does mean the corpus's "not tested" was written without knowing the code was there.**
> ⇒ **filed as `F5-1`.**
>
> *Nine further scripts in the same undocumented set test these factors end to end —
> `test_a2_novelty.py`, `test_a2_window_information.py` ("the factor's TRUE value, not its upper
> bound"), `test_factors_on_baseline.py` ("factors on top of the CERTIFIED BASELINE, not beside
> it"), `test_funnel_leg_level.py`, the three `test_oreb_*` steps. **Full list and headers:
> `NBA_WORKERS.md` `§F5.5`.***

| Factor | Verdict in T15 | Population / information set | Figures |
|---|---|---|---|
| 🔴 ~~**A2** teammate redistribution — ✅ SHIPPED~~ → **SUPERSEDED `2026-09-13`: CLOSED, "DOES NOT SHIP in any of four forms"** *(`§F6.12`; the ✅ below is `T15`'s `09-12` verdict, kept for history)* | ~~✅ SHIPPED~~ 🔴 **CLOSED** | allocator fitted on roster state; **validated three ways** | conservation **0.9930**; allocator MAE **4.609** vs recent-5 **4.875**; OOS `p0` 4.830 / `p1` 4.733 / `p2` 4.753; **15 of 19 props improve**, gains scaling with minutes-dominance — pra **+0.347**, pts+reb +0.281, pts+ast +0.253, points +0.097 |
| **A2 rate response** | ❌ **REJECTED** | held-out | *"double-counts what minutes already carry"* |

> ## 🔑 §F6.5 — **THE THREE TABLES UNDER THESE VERDICTS, recovered 2026-09-23**
>
> *Each conclusion below is already on file; each TABLE was not. Verified before writing — `5,506`,
> `9,259`, `26,816`, `5,761`, `6.395`, `936,764`, `k=8` each returned **`0` of `12`**.*
>
> ### 1 · ~~WHY `A2` SHIPS~~ 🔴🔴 **THE RETRACTED TABLE — corrected within the hour, `§F6.12`**
>
> > 🔴🔴🔴 **I WROTE THIS HEADING AS *"WHY `A2` SHIPS"* AND IT IS WRONG TWICE OVER.** *`A2` does
> > **NOT** ship — it is **CLOSED, "DOES NOT SHIP in any of four forms"** — **and the table below is
> > EXPLICITLY RETRACTED by the system itself.*** *Found `[LIVE-AUDIT]` minutes after writing it, in
> > `nba_config.classification_config` → `absence_panel_measured_2026_09_12`:*
> >
> > > ***"`RETRACTED_2026_09_12`: the two-season ratio table … (teammate alpha out: minutes
> > > 1.098/1.082, usage 1.178/1.175, etc.) is **CONTAMINATED and must not be used to fit
> > > anything**."***
> >
> > 🔑 **The table is kept below, struck, because the sweep does not delete its own errors — and
> > because the RETRACTION'S REASONING is worth more than the table ever was.** *See `§F6.12`
> > directly beneath it.*
>
> | absent player | side | **n** | minutes × | **usage ×** | rate × |
> |---|---|---|---|---|---|
> | **alpha (≥20 poss)** | teammate | 🔴 **5,506** | 1.080 | **1.177** | 1.110 |
> | secondary | teammate | 🔴 **9,259** | 1.081 | 1.149 | 1.082 |
> | role | teammate | 🔴 **26,816** | 1.059 | 1.091 | 1.059 |
> | ⚠ **alpha** | **OPPONENT** | 🔴 **5,761** | **1.019** | **1.051** | **1.057** |
>
> 🔑 ***"usage rises more than minutes, and it scales with who's out. an alpha absence gives
> teammates `+8%` minutes but `+17.7%` usage — against `+9.1%` usage when a mere role player sits.
> That's the Wally Pipp effect measured on our own data, and it confirms the design decision to
> treat minutes and usage as separate flows: **the shot attempts move nearly twice as far as the
> clock does**."***
>
> ⚠⚠ **AND THE OPPONENT ROW IS A FLAGGED WARNING, not a result** — *"opponents of a team missing
> someone show `+2%` minutes and `+5%` usage … **a chunk is almost certainly selection bias:
> absences cluster in blowouts, and blowouts inflate everyone's rate through garbage time.** Right
> now the panel carries `null` in `proj_spread`, `margin` and `blowout`, so I can't yet separate the
> two."* ⇒ ***"if the opponent effect survives that conditioning it's a real `B4` factor; if it
> collapses, it was garbage time."*** 🔑 **`B4` v1 was later REJECTED (`0` of `19` props) and
> `§3`'s table records the reason as *"the earlier `+6.5%` opponent signal was BLOWOUT
> CONTAMINATION."* — this block is the moment that hypothesis was WRITTEN DOWN, before the test.**
> 📌 *A pre-registered prediction that came true, and the corpus carried the outcome without the
> prediction.*
>
> ## §F6.12 — 🔑🔑 **THE RETRACTION'S REASONING, and it is the best methodology in this corpus**
>
> *`[LIVE-AUDIT]` 2026-09-23, `nba_config.classification_config`. **The corpus records THAT `A2` was
> retracted — `"RETRACTED"` appears in 11 of the twelve — and records almost NONE of WHY the
> measurement was wrong.** Verified: `two_season_test_competitive_only`, "ratio averaging",
> "absent-vs-absent", "arithmetically impossible", "replication does not protect" each return
> **`0` of `12`**.*
>
> ### The lesson, in one line
> > 🔑🔑🔑 ***"two-season agreement proves STABILITY, not CORRECTNESS. A biased estimator reproduces
> > its bias."***
>
> **`§F6.5`'s own struck table boasted `0.3–0.7%` agreement across two independent seasons. That
> agreement was the reassurance — and it was worthless.**
>
> ### Error 1 — ratio averaging, caught by an ARITHMETIC IMPOSSIBILITY
> > ***"`avg(ratio)` across players with very different baselines is dominated by low-minute players
> > (`5 → 10` min is ratio `2.0` regardless of how few possessions that is). **The DELTA view of the
> > same rows shows every minutes band NEGATIVE — starter `−0.25`, rotation `−0.47`, bench `−1.02`,
> > fringe `−0.22` — while `~25` minutes and `~12` possessions were vacated: arithmetically
> > impossible, so the absorbers are outside the measured sample**."***
>
> 🔑 ***The same rows, viewed as DELTAS instead of RATIOS, produced a conservation violation. That
> is a check any table of ratios can be given and this corpus gives none of them.***
>
> ### Error 2 — the contaminated baseline, and why replication hid it
> > ***"`base_min` / `base_poss` / `base_rate36` are TRAILING 10-GAME MEANS that already include
> > earlier games in which the same teammate was absent. For a player out for a stretch, the
> > baseline is already the with-him-out level, so the comparison is **absent-vs-absent instead of
> > absent-vs-present**. This is the root cause and **it reproduces perfectly in BOTH seasons —
> > replication does not protect against a systematic baseline error**."***
>
> ✅ **The structural fix, also unrecorded**: *"the per-player baseline must be the WITH-the-absent-
> player-available level: computed only from games in which that specific teammate PLAYED (the
> with/without split the literature describes), not a blind trailing mean."*
> ✅ **And a second bug named in the same row**: *"`absorbed_min`/`absorbed_poss` in
> `absence_panel_teams` use `clip(lower=0)` on deviations, which is **upward-biased by
> construction** — sum signed deltas instead."*
>
> ### ✅✅ What SURVIVED the retraction — and one of it is the blowout confound, PROVEN
> > **`blowout_confound_PROVEN`**: ***"unconditioned, opponents showed `+5–6%` usage. Conditioned: in
> > projected blowouts opponent MINUTES stop rising (`1.006`) while RATE jumps (`1.092`) = **garbage-
> > time signature, not a matchup effect**. In competitive games the pattern inverts (minutes `+3%`,
> > rate `+4.8%`). **Fitting `B4` unconditioned would have baked garbage-time inflation into every
> > opponent-side adjustment**."***
>
> 🔑 ***That is `§F6.5`'s pre-registered prediction being CONFIRMED, with the numbers, and it is the
> reason `B4 v1` was later rejected. The corpus has the rejection; it did not have this.***
>
> ✅ **Also surviving, quoted**: *the `flip_last_first()` name trap — **"the injury report writes
> `Last, First`; normalizing without flipping gives `doncicluka` vs `lukadoncic` and NOTHING matches
> (first run returned `0` rows)"*** · *the fitting rule **"`B4`: fit on COMPETITIVE games only
> (`|proj_spread| ≤ 6.5`)"*** · *and the standing caveat that **`proj_spread` is the MORNING line,
> itself affected by the absence — partial control, not a clean one**.*
>
> 📌 ***A retraction this good is a finding in its own right. The corpus kept the verdict and threw
> away the reasoning — which is `RULE 55` applied to a NEGATIVE result, and negatives are exactly
> where the reasoning is the whole value.***
>
> ### 2 · WHY `A2` IS WIRED TO 15 PROPS AND NOT 19 — the per-prop gate
>
> > ⚠⚠ **READ THIS SECTION UNDER THE RETRACTION ABOVE.** *The per-prop MAE table below is the
> > `09-12` measurement. **`09-13`'s reality check found `MAE ON THE MEAN was the wrong metric` —
> > "the product is `P(stat > line)` and a factor can reshape the distribution without moving the
> > mean; every factor verdict before the leg-level gate was graded blind."*** **So these gains are
> > recorded as what was measured, NOT as evidence `A2` works — it does not.**
>
> | prop | MAE ignore | MAE with `A2` | gain |
> |---|---|---|---|
> | **pra** | 🔴 **6.395** | 6.048 | **+0.347** |
> | pts+reb | 🔴 **5.857** | 5.576 | +0.281 |
> | pts+ast | 🔴 **5.394** | 5.141 | +0.253 |
> | reb+ast | 🔴 **2.745** | 2.657 | +0.088 |
> | dreb | 🔴 **1.630** | 1.603 | +0.027 |
> | stocks | 🔴 **1.000** | 0.999 | +0.001 |
>
> **`15` of `19` props improve out of sample** — *assists, dreb, fg3a, fga, fgm, fta, ftm, points,
> pra, pts+ast, pts+reb, reb+ast, rebounds, threes_made, turnovers.*
>
> 🔑 ***"the gains scale exactly as the mechanism predicts — combos benefit `3–4×` more than points
> alone (`0.347` on `pra` vs `0.097` on points), because a combo accumulates the minutes effect
> across three counting stats while efficiency noise partially cancels. And the props that don't
> benefit are precisely the low-count, variance-dominated ones (stocks, blocks, steals, fouls),
> where a minutes change is swamped by whether a single block happened."***
>
> 💰 **And the commercial note, in `0` of the twelve:** *"`pra`, `pts+reb` and `pts+ast` are among
> the highest-volume markets on the PrizePicks board — **`450`, `431` and `357` legs on a single
> slate** — **so the factor lands hardest where the board is deepest**."*
>
> ### 3 · THE `oreb` FIX — the one prop `§7`'s audit leaves uncertified
>
> **Estimator (i): EWMA + shrinkage toward a `dreb`-defined archetype, `k=8`.** *Band bias against
> actual:*
>
> | anchor band | actual | (a) expanding | (e) EWMA | (h) arch `k=20` | 🟢 **(i) EWMA+arch `k=8`** |
> |---|---|---|---|---|---|
> | <0.5 | 0.433 | −0.108 | −0.105 | +0.093 | **+0.016** |
> | 0.5–1 | 0.782 | −0.037 | −0.035 | +0.087 | **+0.037** |
> | 1–1.5 | 1.168 | +0.045 | +0.031 | +0.075 | **+0.048** |
> | 1.5–2.5 | 1.825 | +0.100 | +0.087 | −0.082 | **−0.023** |
> | **2.5+** | 3.024 | **+0.241** | +0.208 | −0.356 | 🟢 **−0.141** |
>
> ✅ **Worst-band bias `0.241 → 0.141`; the low end essentially fixed (`−0.108 → +0.016`) — a `41%`
> improvement.** 🔑 ***"grouping by minutes was the flaw, grouping by rebounding ARCHETYPE is the
> fix, and using `dreb` rate as the grouping variable keeps it NON-CIRCULAR."***
>
> **Four hypotheses tested and their verdicts, in `0` of the twelve:** *`lambda` **rejected** ·
> opportunity basis **rejected** · minutes-tier shrinkage **rejected — made it worse** · archetype
> shrinkage **works**.* ⇒ ***"`oreb` went from a dropped prop to one with a measured fix and one
> tuning parameter left"*** — **the remaining `−0.141` is under-prediction of elite offensive
> rebounders, a `k`-tuning question between `8` and `20`.**
>
> 🔴 **`NOT RECORDED`: whether the recipe change was ever made.** *`§7`'s all-props audit still lists
> `oreb` at **`−0.1 pp`, penalised** — so as of that audit **the fix had not landed**.*
>
> ⚠ **`AS STATED IN T15`, not re-run by this sweep.**
| **N1** status resolution | ✅ **MEASURED** *(not a ship/reject — a measured input A2 now consumes)* | full report population, **both seasons** | see §4 below |
| **B4** opponent availability **v1** *(vacated minutes)* | ❌ **REJECTED** | **post-game truth**, 19 props | **0 of 19**; the earlier **+6.5% opponent signal was BLOWOUT CONTAMINATION** |
| **B4 v2** *(expected defender-quality change)* | ❌ **REJECTED** *(after the test itself was found broken — §T15.2f)* | **post-game truth**, **4,526** test rows, 11 props | **0 of 11**; betas collapsed to **−0.056…+0.029** once correct, *versus the spurious **+0.14…+0.22** from the broken version* |
| **B4 v3** RIM PROTECTION | ⚠⚠ **NOT TESTED IN T15 — COMMISSIONED BY IT** | — | see §5 below |
| **M1** defender-quality LEVEL | ⚠⚠ **NOT TESTED IN T15** | — | appears only as a **pending build item** (*"M1 wiring"*, *"M1 defender-quality integration into the harness"*). **Verified 2026-09-22**: `0 of 7`, `5,116`, `12,738`, `63.8%`, `0 of 5 props` — **zero hits in the transcript.** *COMPASS fact 84's M1 rejection and fact 86's v3 closure therefore belong to a LATER transcript, which `NBA_GLOSSARY.md` already attributes to **T16**.* |
| **A5** projected lineups | ❌ **REJECTED — REDUNDANT** | held-out, per prop | **negative on every prop**: points **−0.032**, rebounds −0.008, assists −0.008, pra **−0.035** |

### 🔴 §F2.2 — ~~**THE COMMISSIONED SET IS 26, AND SIX CODES APPEAR NOWHERE IN THE TWELVE**~~ → **CORRECTED: THE COMMISSIONED SET IS `33`, AND `8` CODES APPEAR NOWHERE**

> 🔴🔴 **CORRECTED IN PLACE, 2026-09-23, `§F2.3` — AND THE FALSE LINE IS KEPT ABOVE, STRUCK, PER THE
> STANDING RULE.** ***This section's own enumeration was incomplete — the third incomplete
> enumeration this sweep has published in two days, and the second one that was MINE.***
>
> **What went wrong:** I read the families `A`–`E` off the lock and stopped. **The authority also
> defines `K1`, `M1`–`M4`, `N1` and `N2`** — and `M1` and `N1` are *in the verdict table directly
> above this block*, which is how the miss should have been visible without any probe at all.
> **Re-derived from the authority by its own definition pattern** *(`**<CODE> `<slug>`**`, the form
> the lock uses to DEFINE a factor rather than to mention one)*: **`33` factors.**
>
> | | was | **is** |
> |---|---|---|
> | commissioned set | ~~26~~ | **33** |
> | families | ~~`A`–`E`~~ | `A1`–`A9` · `B1`–`B5` · `C1`–`C4` · `D1`–`D4` · `E1`–`E4` · **`K1`** · **`M1`–`M4`** · **`N1`–`N2`** |
> | codes absent from the twelve | ~~6~~ | **8** — `M2` and `M3` added |
> | absent by code **and** slug | ~~3~~ | **5** — **`M2`**, **`M3`** added to `A7`/`E2`/`E3` |
>
> 🔴🔴 **AND A SECOND DEFECT, WORSE THAN THE FIRST: I RE-MEASURED AGAINST A TREE I HAD ALREADY
> WRITTEN TO.** The re-count returned `A7`=4, `E2`=3, `E3`=3 — *"not absent after all"* — and every
> one of those hits was **this block and `T10-F1`, which I had just committed.** ***The measurement
> was reading my own correction and reporting it as the corpus's coverage.*** **Re-run against the
> pre-write tree (commit `670854ff`, before both writes) — which is the count that stands below.**
> 📌 ***This is §T20.136's failure exactly, in a new vocabulary: a window wide enough to include my
> own edits. The rule that catches it is RULE 53, and the reason it was caught is that RULE 53 makes
> the grep MANDATORY rather than optional.***
>
> **RULE 53 DISCHARGE** — corrected string re-grepped across **all twelve**, whole-file window (no
> truncation): **RAW `2` sites** carrying the `26` claim — `NBA_FINAL_SCORING_CALIBRATION.md:1249`
> *(this block)* and `NBA_OPEN_ITEMS.md:14026` *(`T10-F1`)*. **CLASSIFICATION: both are this pass's
> own writes from today; `2` of `2` corrected; `0` outstanding.** *(`**26**` returns 12 raw hits
> across the twelve — the other 10 are unrelated quantities, which is why the classification step
> exists and the raw count alone is not the answer.)*
>
> **THE CORRECTED FINDING, at four strengths** *(pre-write tree, whole-file window)*:
>
> | strength | codes | evidence |
> |---|---|---|
> | 🔴 **ABSENT** — code, slug and every paraphrase tried | **`A7`** `trade_new_arrival_window` · **`E2`** `team_flux_penalty` · **`E3`** `sample_thinness` | code `0`, slug `0`; *"first-5-games"* / *"after a trade"* / *"transaction wire"* / *"team flux"* / *"rotation players out"* / *"sample thinness"* / *"no carryover"* all `0` |
> | 🟠 **NEAR-ABSENT** — a fragment survives | **`M2`** `defensive_scheme_proxy` · **`M3`** `hustle_and_deflection_profile` | code `0`, slug `0`; *"scheme proxy"* in `OPEN_ITEMS` **only**; *"hustle"* in 7 files but *"deflection"* in **`0`** |
> | 🟡 **CODE-ONLY GAP** — the slug is on file | **`D3`** `altitude_venue` *(slug **12×**, `MASTER_SUMMARY`)* · **`D4`** `national_tv_marquee` *(slug **10×**, `MASTER_SUMMARY`)* | only the CODE is missing — a cross-reference, nothing more |
> | 🟡 **CONCEPT-ONLY** | **`C2`** `line_movement` | code `0`, slug `0`, but *"line movement"* spaced: **19** hits |
>
> ⇒ **`T10-F1` updated to match.** **The table below is the ORIGINAL, uncorrected text of this
> section, kept because the sweep does not delete its own errors.**

**THE TABLE ABOVE IS THE TESTED SET. THE COMMISSIONED SET IS ~~26~~ `33`, AND ~~SIX~~ `8` CODES APPEAR NOWHERE IN THE TWELVE.**

*Added 2026-09-23 by the full transcript re-sweep (§F2). **Transfer, not discovery** — every fact
below already exists in `nba/NBA_ENRICHMENT_FACTOR_LOCK.md`, which is **not one of the twelve**.
`§F2.1` predicted exactly this: `T10`'s tail of **100** segments — three times any other
transcript's — attributed **49** to `NBA_ENRICHMENT_FACTOR_LOCK.md` and **24** to
`NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md`.*

**`T10` pass 1 locked an owner-directed factor taxonomy: *"find every factor that gives any edge at
the enrichment level, per prop line, per direction, per line variation, with sub-factors and
tiers."*** **Re-derived from the authority 2026-09-23** *(`NBA_ENRICHMENT_FACTOR_LOCK.md`, code
tokens counted, not recalled)*: **26 factor codes — `A1`–`A9`, `B1`–`B5`, `C1`–`C4`, `D1`–`D4`,
`E1`–`E4`.`** **The verdict table above carries eight.**

| code | name in the lock | in the twelve? |
|---|---|---|
| 🔴 **`A7`** | **`trade_new_arrival_window`** — *"games 1–5 after a trade or signing, for the new player and the affected"* rotation | ❌ **ABSENT** — code **0 hits**; *"first-5-games"*, *"first five games"*, *"after a trade"*, *"transaction wire"* all **0** |
| 🔴 **`E2`** | **`team_flux_penalty`** — *"trade window, new coach, ≥2 rotation players out → variance up"* | ❌ **ABSENT** — code **0**; *"team flux"* **0**; *"rotation players out"* **0** |
| 🔴 **`E3`** | **`sample_thinness`** — *"rookies/new arrivals with no carryover baseline"* | ❌ **ABSENT** — code **0**; *"sample thinness"* **0**; *"no carryover"* **0**, *"carryover baseline"* **0** |
| 🟡 `C2` | `line_movement` — *"direction, size and speed of prop-line movement through the day; steam across books"* | ⚠ **CODE absent (0)**, concept present — *"line movement"* in **6** of the twelve; *"steam"* **0** |
| 🟡 `D3` | `altitude_venue` — *"Denver/Utah for visiting teams, especially on B2B"* | ⚠ **CODE absent (0)**, concept present — *"altitude"* in **7** of the twelve |
| 🟡 `D4` | `national_tv_marquee` — *"national-TV games **protect** star availability"* under the participation policy | ⚠ **CODE absent (0)**, concept present — *"national-TV"* / *"marquee"* in `MASTER_SUMMARY` / `OPEN_ITEMS` |

🔑 **THE TWO CLASSES NEED DIFFERENT WORK, AND THAT IS THE POINT OF SPLITTING THEM.**
**`A7`/`E2`/`E3` are ABSENT** — a reader of the twelve cannot learn these factors were ever
commissioned. **`C2`/`D3`/`D4` need a CROSS-REFERENCE, not prose** — the material is here under
other words, and only the code is missing, which is what made them invisible to a code-based probe
and would have made them invisible to a reader looking for the lock's vocabulary.

⚠⚠ **RULE 54 — the probe that found this, and its limits.** The first pass was a **bare code-token
count**, and a bare two-letter token is weak evidence: a factor documented under its NAME and never
its code scores zero and looks absent. **So every one of the six was re-checked by DESCRIPTION
before anything was written** — and that second check **reclassified three of the six** from ABSENT
to CROSS-REFERENCE. 📌 ***The code count alone would have published three false absences. It is the
same failure §F1.2 caught with `reltuples`, in a different vocabulary: a cheap proxy, believed one
step too far.***

⚠ **What this block does NOT claim.** It does not say `A7`, `E2` or `E3` are unbuilt, untested or
wrong to omit — **the lock is a CANDIDATE list, and a candidate may have been dropped for good
reason.** *`NBA_ENRICHMENT_FACTOR_LOCK.md:250` itself groups `A7` with work it calls **"measurable
now"**, and `:241` records its data path as **"game logs team changes (have) + transaction wire
(dates)"**.* **Whether they were considered and dropped is `NOT RECORDED` — in the twelve or, for
these three, anywhere this pass found.** ⇒ **Filed as `T10-F1` in `NBA_OPEN_ITEMS.md`, not as a
defect.**

🔑🔑 **THE A5 REJECTION DISSOLVES A LEAK RISK RATHER THAN MITIGATING IT** — *and this is the part the
parity document needs:* **A5 was leak risk #1** *(box-score `starter_status` is post-tip truth)*.
The mechanism of the null is structural, not a failure of the proxy:

> ***"the allocator already uses RECENT-5 MINUTES, which encodes starting status almost completely. a
> player who starts plays 30 minutes; the recent-minutes signal captures that CONTINUOUSLY, while a
> binary starter flag THROWS AWAY THE MAGNITUDE. adding it back as a coarse multiplier LOSES
> information… we don't need projected lineups at all, so there's nothing to leak. **the risk
> disappears rather than needing mitigation.**"***

⚠ *Also recorded from the research step: **the NBA does not require lineups before tipoff** — they
are announced **~30 minutes out**, i.e. AFTER the 2:30 pm window — and **projected lineups are
human-curated subscription products** set 24–30 hours ahead. **So at the window A5 must be derived
in-house or not at all**, which is what made the redundancy finding decisive rather than incidental.*

### ✅ 4 · N1 — **THE LEAGUE'S OWN PROBABILITY TABLE IS WRONG ON THREE OF FIVE STATUSES**

*Context from the research step: **the NBA overhauled injury reporting in December 2025**, fixing
league-defined probabilities and adding an explicit **AVAILABLE** status — **a mid-season format
change inside the 2025-26 data.** The assistant's rule: **"league-defined numbers are what teams are
TOLD to mean; what matters is what actually happens"** — so it measured them on the archive.*

| Status | n | **Measured `p_plays`** | League-defined | |
|---|---|---|---|---|
| Out | 10,150 | **0.001** | 0.00 | ✅ |
| Questionable | 1,456 | **0.503** | 0.50 | ✅ **a true coin flip** |

> ### §F6.2 — the Questionable BAND model, and why the scenario layer exists
>
> 🔑🔑 **AND `T17` WENT ONE LEVEL DEEPER — THE BAND MODEL, AND IT IS WHY THE SCENARIO LAYER EXISTS.**
> *Added 2026-09-23, `§F6.2`. **`0` of the twelve carried this table**: `leaning out`, `leaning
> play`, `0.696`, `72.9%`, `47.1%` each returned **`0` hits**.*
>
> **The owner asked whether Questionable could be pushed to 90%. `1,322` questionables were scored
> at the `2:30 PM PT` decision cutoff:**
>
> | band | n | share | measured play rate | **call correct** |
> |---|---|---|---|---|
> | leaning OUT | 144 | 10.9% | **0.271** | **72.9%** |
> | leaning PLAY | 102 | 7.7% | **0.696** | **69.6%** |
> | 🔴 **genuinely uncertain** | **1,064** | 🔴 **80.5%** | **0.529 — a coin flip** | **47.1%** |
> | confident *(`p ≤ 0.20` or `≥ 0.80`)* | ~40 | 3.0% | — | 65.0% |
>
> ⇒ ***"80.5% of questionables are genuinely uncertain at 2:30 pm … only 18.6% can be pushed to a
> lean, and those leans run 70–73% correct. **That is not a model failure. It's the structure of the
> problem**."***
>
> 🔑🔑 **THE ARCHITECTURAL CONSEQUENCE, in the author's own words — and it is the justification for
> the scenario layer that the corpus documents everywhere and never justifies:**
>
> > ***"teams use questionable specifically to conceal intent … the resolving information arrives in
> > the mandatory update 60 minutes before tip, AFTER our window. which is precisely why the
> > scenario layer is the right architecture. **if 80% of questionables are unresolvable at 2:30,
> > prediction can't get you to 90% — enumeration and selection can.** the engine holds every branch
> > and picks the real one when the final report lands, rather than betting on a coin flip."***
>
> 🔴 **AND A LEAKAGE BUG WORTH KEEPING, also in `0` of the twelve:**
>
> > ***"i was filtering on the FINAL STATUS, which is the answer, not the feature. only `7` players
> > stay questionable to the last snapshot because the rest resolve — so the model must read the
> > status AT THE DECISION CUTOFF, which is what it does now."***
>
> 📌 ***The same defect class as `A5` in §3 above — training on post-decision truth — caught here by
> the author and fixed. `7` of `1,456` is the size of the trap: filter on final status and the
> population collapses by `99.5%` while looking clean.***
>
> ⚠ **`AS STATED IN T17`, not re-run by this sweep.**
| Available | 1,220 | **0.828** | 1.00 | ❌ |
| Probable | 582 | **0.923** | 0.75 | ❌ |
| **Doubtful** | 312 | **0.006** | 0.25 | ❌🔴 **DOUBTFUL MEANS OUT** |

🔴 ***"treating doubtful as a 25% chance would be a SERIOUS ERROR; our a2 build already grouped it
with out, which this validates."*** ✅ **And after the selection-filter fix of §T15.2f, the two
statuses that matter split into two different factors wearing one label:**

| Status | **Rotation ≥15 min** | **Fringe <15 min** |
|---|---|---|
| Questionable | **0.552** *(n=1,074)* | **0.312** *(n=234)* |
| Available | **0.956** *(n=824)* | 0.555 *(n=236)* |
| Probable | **0.961** *(n=457)* | — |

⚠ **The 0.828 anomaly was deep-bench DNPs, not late scratches** — *"for the players the allocator
actually cares about, available means 0.956 and probable 0.961 — effectively playing."* 🔑 **And the
league's nominal 0.50 UNDERSTATES the population that matters**: questionable rotation players play
**55.2%**. *Further modulated by reason class — **G-League two-way 0.271**, back 0.488, soft tissue
0.539 — and by team — **Atlanta 0.326 → Golden State 0.676**.* 🔑 ***"that's a real, fittable
sub-factor, and it's exactly the cell structure the lock specified."***

### 🔑🔑 5 · B4 IS LEFT **CLOSED-WITH-A-SUBCASE**, AND T15 SPECIFIES THE TEST T16 RUNS

*⚠ 0 of the twelve and 0 of the thirty, probed 2026-09-22.* **B4 was not abandoned — the transcript
names the remaining formulation, its population, its gate, and says it must be run first:**

> ***"one piece is still genuinely open on the opponent side, and it's a different factor: b4's
> RIM-PROTECTION SUB-CASE — the blocks-against and interior-scoring channel, where losing a specific
> rim protector plausibly does move a driver's efficiency… it's testable the same way: fit the
> residual on absences of HIGH-BLOCK-RATE OPPONENTS ONLY, gate it on held-out mae. **if you want b4
> fully closed rather than closed-with-a-subcase, that's the one test remaining, and i'd run it
> before declaring the opponent side done.**"***

✅ **COMPASS fact 86 records exactly that test closing** *(v3 rim protection, 0 of 5 props, 12,738
test rows, 63.8% of games have a rim protector out)* — **so the T16 result answers a question T15
wrote, with the population T15 specified.** *Recorded because the corpus carries the answer without
the commission, which makes the v3 test look like an afterthought rather than a planned closure.*

⚠ **AND WHY THE NULL IS MECHANICALLY SENSIBLE RATHER THAN A GAP** — *the transcript's own reasoning,
which is what makes it a finding instead of a failure to find one:* **opponent defence is ALREADY IN
THE BASELINE** *(opponent defensive profile, DvP by position, pace, and the day-before
opponent-availability version)*, so **B4 was only ever the same-day RESIDUAL on top of it**. A
player's exposure **spreads across several defenders**, so losing one shifts expected defender quality
only slightly, and **the replacement is usually of similar quality — NBA rotations are compressed at
the top**. M1's genuinely large effect *(−5.5% to +6.7% across quintiles, 12 pp toughest-vs-easiest)*
is about **WHICH TEAM you face** — a baseline factor from the full opponent profile, **not a same-day
delta**. 🔑 **And opponent absences ARE priced, on the side where they demonstrably matter**: *"a2
runs on BOTH rosters… so opponent absences are priced on the absent team's own production, **not
smeared onto the other team's rate**."*

### 🔑🔑 6 · **CERTIFIED / PENALIZED / EXCLUDED — the three-tier policy the system did not have**

⚠⚠ **0 of the twelve AND 0 of the thirty** *(probed 2026-09-22, `grep -Eoih ".{0,80}(somewhere to
land|besides .in. or .out.|general policy it didn).{0,80}"`, both trees)* — **and it is a governing
rule, not a note.** *It exists because the owner refused a rejection **twice**:*

| Owner turn | The instruction |
|---|---|
| seg 827 | ***"NO, do not just reject — FIX IT: granulated, break in tier, figure it out, research, debug, test, simulate. WE CAN'T JUST BE DROPPING IMPORTANT PIECES."*** |
| seg 949 | *"yes, make the be**tt**er decision, **drop it OR PENALIZE IT ACCORDINGLY**"* |
| seg 962 | *"ok, find the **proper penalty level, FAIR TO IT**, and keep going"* |

✅ **The answer, in the assistant's words:** *"that also gives the system a general policy it didn't
have — **certified / penalized / excluded** — so future props have somewhere to land besides 'in' or
'out'. **that's probably worth more than the oreb fix itself.**"*

🔑🔑 **AND THE PENALTY IS *DERIVED*, NOT DECLARED — the rule that makes the tier usable.** *The
reliability scorer measures every prop on one ruler — **ECE, worst band, Brier, lift over a base-rate
model, both seasons** — and the penalty is **the amount the prop's volume-weighted ECE trails the
certified median (0.20 pp)**.*

⚠⚠ **RECORD BOTH DECISIONS (rule 5) — the assistant OVERTURNED ITS OWN PENALTY WITHIN MINUTES:**

| | Penalty written | Basis | Status |
|---|---|---|---|
| **First** | **one confidence tier down · barred from the top slip tier · at most ONE oreb leg per slip · skipped when the edge doesn't clear threshold** | the **worst-band** number (5.41 pp) | ❌ **RETRACTED — *"an OVERREACTION to a worst-band number"*** |
| **Second** ✅ | **−0.1 pp of stated confidence, ELIGIBLE EVERYWHERE, NO CAP**, with a flag only on legs landing in the one thin band | **volume-weighted ECE 0.28 vs certified median 0.20** | ✅ **the standing rule** |

🔑 *Why the first was wrong:* **that 5.41 pp miss lives in a single band of 744 legs out of 556,277**
— *"almost every oreb leg sits in bands that calibrate as well as any certified prop."* 🔑 **And the
scorer caught the over-correction within minutes of it being made**, which is the argument for the
tool: *"penalties are **derived rather than declared**, and any future prop lands on the same ruler."*

### ✅ 7 · THE ALL-PROPS RELIABILITY AUDIT — **ten props, a third of the table, had NO verdict at all**

⚠ **Before this audit, 10 of 30 props — roughly 5.4m rows of baseline probabilities — sat in the
history table with no reliability verdict**, because `score_prop_reliability.py` could not derive
their outcome from a box-score column: **7 period props** *(points q1/h1/h2/q4/q4_otx, rebounds q1,
assists q1, threes_made q1 — needing quarter-level data)*, **fantasy_score** *(needs the
1/1.2/1.5/3/3/−1 formula)*, **double_double** *(needs yes/no logic)*, and **stocks** *(in the combo
map, dropped by the column check)*. 🔑 **The owner pushed for the extension; it caught two props that
would have shipped as certified:**

| Prop | n | ECE | Worst band | Brier | Lift | Verdict |
|---|---|---|---|---|---|---|
| **fantasy_score** | **994,879** | 0.41 | **2.92** | 0.2022 | **5.2%** | 🔴 **−0.3 pp** |
| **double_double** | 47,912 | 0.57 | **7.32** *(worst in the system)* | 0.0592 | 17.7% | 🔴 **−0.4 pp** |
| oreb | 556,277 | 0.28 | 5.41 | 0.0501 | 25.8% | **−0.1 pp** |
| assists_q1 | 443,513 | 0.22 | 3.22 | 0.0360 | 26.1% | **−0.0 pp** *(rounding-level)* |
| stocks | 564,973 | 0.15 | 0.94 | 0.0536 | 25.0% | ✅ certified |
| threes_made_q1 | 432,907 | 0.17 | 2.03 | **0.0232 — best Brier in the system** | **27.3% — highest lift** | ✅ certified |

> 🔴🔴 **ADDED 2026-09-23, `§F2.8` — THE SEVEN-ROW PERIOD-PROP TABLE WAS ON FILE AS ITS TWO
> OVERLAPPING ROWS.** *The table above is the **flagged/penalised** set. `T15` also certified a
> **PERIOD-PROP** set of seven, and only the two props that appear in both — `threes_made_q1` and
> `assists_q1` — reached the twelve. **The five period-only rows were absent**: `459,203`,
> `546,483`, `675,093`, `678,232` and `530,343` each returned **`0` hits across all twelve.***
> **Found by the high-band audit (`§F2.7`)** — the segment scores `b12 = 0.51`, i.e. the judge
> calls it COVERED.
>
> **`T15`, verbatim: *"all seven period props are now verified, and they're excellent."***
>
> | period prop | n | ECE | worst band | Brier | lift | verdict |
> |---|---|---|---|---|---|---|
> | 🔴 **rebounds_q1** | **459,203** | 0.17 | 1.99 | **0.0503** | **25.1%** | ✅ certified |
> | threes_made_q1 | 432,907 | 0.17 | 2.03 | 0.0232 | 27.3% | ✅ certified *(already above)* |
> | 🔴 **points_q4_otx** | **546,483** | 0.17 | **0.81** | 0.1156 | 17.5% | ✅ certified |
> | 🔴 **points_h2** | **675,093** | 0.18 | **0.37** *(best worst-band of the seven)* | 0.1381 | 13.4% | ✅ certified |
> | 🔴 **points_h1** | **678,232** | 0.18 | 0.78 | 0.1273 | 14.5% | ✅ certified |
> | assists_q1 | 443,513 | 0.22 | 3.22 | 0.0360 | 26.1% | **−0.0 pp**, rounding-level *(already above)* |
> | 🔴 **points_q1** | **530,343** | 0.24 | 0.85 | 0.1033 | 18.1% | ✅ certified |
>
> **`T15`'s own summary: *"six certified outright, `assists_q1` a rounding-level −0.0 pp."***
>
> 🔑 **WHY THE OMISSION MATTERS RATHER THAN BEING TIDY-UP.** *The five missing rows are the
> **points** period markets and `rebounds_q1` — a live PrizePicks surface — and they are the
> evidence for §8's strategic finding directly below* (*"the board's deepest markets are its least
> exploitable"*). **§8 is on file; four of the seven rows underneath it were not.** ⇒ **the
> conclusion was documented and the table it rests on was two-sevenths documented.** 📌 *The same
> shape as `§0.16-F2`: a verdict kept, its experiment dropped.*
>
> ⚠ **Quoted from `T15`, not re-taken live — exactly as the surrounding section states of its own
> figures.** ⚠ **`NOT RECORDED`: whether the period props' `n` are legs, player-games or rows, and
> over which seasons** — *`T15` gives the counts without a population, and the twelve do not supply
> one.*

🔴 ***"fantasy_score is the one that matters commercially — nearly a million rows, our HIGHEST-VOLUME
prop, and it was NEVER VERIFIED."*** *Why it is weak is mechanical: it is a weighted sum of six noisy
counts, so **the errors compound while the predictable role signal gets diluted**.*

✅ **Final state: 27 certified · 3 penalized (fantasy_score −0.3, double_double −0.4, oreb −0.1) · 0
unverified**, where ten had no verdict that morning. *Quoted from the transcript; **not** re-taken
live — the audit's own summary calls the absence of new problems "the audit's real value".*

### 🔑🔑 8 · THE STRATEGIC FINDING FOR THE SLIP ENGINE — **the board's deepest markets are its least exploitable**

**Lift over a base-rate model** — *"the low-count props carry two to three times more predictive edge
than the high-volume combos, because a combo averages three noisy counts together while a single stat
is genuinely forecastable from role"*:

| High edge | Lift | | Low edge | Lift |
|---|---|---|---|---|
| threes_made_q1 | **27.3%** | | pts+ast | 9.2% |
| steals | 26.9% | | **pra** | **7.5%** |
| assists_q1 | 26.1% | | **fantasy_score** | **5.2%** |
| oreb | 25.8% | | | |
| stocks | 25.0% | | | |

🔑 ***"weighting slips toward VOLUME would be weighting toward the LEAST EDGE."*** ⚠ **This is a slip-
construction constraint, and it points the opposite way from board depth.**

> ### 🔴 **§F6.21 — A DERIVED PENALTY THAT DOES NOT DERIVE — and `§F2.3`'s lesson, repeated by me and caught**
>
> *Added `2026-09-23`. Source: **LIVE** `nba_config.classification_config`, rows
> `prop_reliability_audit_2026_09_13` and `prop_confidence_policy`.*
>
> ⚠⚠ **THIS SECTION AS FIRST WRITTEN CLAIMED THE PENALTY RULE WAS "in `0` of the twelve". IT IS NOT
> — IT IS FOUR PARAGRAPHS ABOVE THIS ONE.** *`§6` already states it: "**the penalty is the amount
> the prop's volume-weighted ECE trails the certified median (`0.20 pp`)**", records **both** the
> harsh and the revised oreb rules in a two-row table, and `§7` already carries "ten props, a third
> of the table, had NO verdict at all". 🔑 ***I probed with the config row's own wording —
> `penalty_pp`, `n-weighted ECE`, `median ECE`, `revised_engine_rules` — all of which return `0`,
> because the corpus writes the same facts in English.*** **That is `§F2.3`'s failure exactly: test
> the CONCEPT, not your chosen spelling.** *Corrected in place within the hour; what follows is what
> actually survives the correction.*
>
> > ***"`penalty_pp` = the prop's n-weighted ECE minus the median ECE of the certified set
> > (`0.20 pp`). **Derived, never declared.**"*** — `penalty_rule`, `VERBATIM`
> > *(and `prop_confidence_policy` states the median independently: `certified_median_ECE_pp: 0.20`)*
>
> 🔑 **RUN IT ON ALL THREE ROWS — which is the thing neither the config row nor `§6` above does:**
>
> | prop | `n` | ECE pp | `ECE − 0.20` | published `penalty_pp` | reproduces? |
> |---|---|---|---|---|---|
> | `oreb` | `556,277` | `0.28` | `0.08` | **`0.1`** | ✅ *(rounds to `0.1`)* |
> | `double_double` | `47,912` | `0.57` | `0.37` | **`0.4`** | ✅ *(rounds to `0.4`)* |
> | 🔴 `fantasy_score` | `994,879` | `0.41` | `0.21` | **`0.3`** | 🔴 **NO — `0.21` rounds to `0.2`** |
>
> 🔑 ***"Derived, never declared" is the load-bearing half*** — **the penalty is a measured distance
> from the certified set's own median, so it re-derives whenever the set is re-scored and no one ever
> chooses a number.** 📌 *The same discipline as the `variation_bands` rule and the `prior_strength`
> constants: the corpus's recurring standard is that a constant which cannot be re-derived from
> stored data is not allowed to exist.*
>
> 🔴🔴 **BUT THE RULE AS STATED DOES NOT REPRODUCE ONE OF ITS THREE OUTPUTS, AND THAT IS RECORDED,
> NOT SMOOTHED.** *Two of three fall out of `ECE − 0.20` at one decimal. **`fantasy_score` does not**:
> `0.41 − 0.20 = 0.21`, and no rounding convention takes `0.21` to `0.3`. ⚠ **`NOT RECONCILED.**
> Three readings are open and the row settles none of them: (a) the stated median `0.20 pp` is
> rounded and the true value is nearer `0.11`, in which case `oreb` and `double_double` would come
> out at `0.2` and `0.5` instead — so that does not work either; (b) `fantasy_score` carries an extra
> term the rule does not mention, plausibly its `5.2%` lift, the lowest in the system; (c) the
> published `0.3` was set before the rule was formalised and never re-derived.* ⇒ ***Reading (b) or
> (c) would both mean the penalty for the system's highest-volume prop is the one number in this
> audit that is NOT derived — which is precisely what the rule's own name forbids.***
>
> ⚠ **I published this table once with `fantasy_score` shown as reproducing, and corrected it within
> the hour.** *`0.21 → 0.3` was written down and not checked against `0.08 → 0.1` beside it. **The
> arithmetic was in the same table as the claim.** 📌 *Third self-caught defect of this pass; `RULE
> 55`'s companion — **a derivation is not recorded until it has been RUN on every row it claims.***
>
> > ### 🔑 **§F6.28 — THREE MEASUREMENTS FROM THE UNCOVERED PROSE BAND, ONE OF THEM SUPERSEDED**
>
> *Added `2026-09-23` by the direction-(b) probe pre-registered at `§F6.28`. **Every figure returned
> `0` of `12` under the WIDE variant set.** Sources: `T15`, `T17`.*
>
> #### 1 · The redistribution panel that `A2` was built on — `T15`
>
> | | |
> |---|---|
> | the panel | **`97,563` rows · `1,152` games · `393` distinct absent players · `2,342` team-game conservation rows**, `2025-26` |
> | 🔑 **why the first attempt returned zero** | *"the injury report writes names as `"doncic, luka"` while the player register writes `"luka doncic"`, so normalizing WITHOUT FLIPPING produced `doncicluka` versus `lukadoncic` and nothing ever matched"* |
> | 🔑🔑 **the judgment** | ***"A panel that silently matched SOME names would have been far worse than one that matched NONE."*** |
>
> 📌 ***That sentence is the corpus's cleanest statement of why loud failure beats quiet
> degradation*** — the same argument as `§F6.20`'s `\|\| echo failed` and `§F6.21`'s *"unverified is
> not the same as fine"*, reached from a third direction. ⚠ **And it is the `flip_last_first()` name
> trap `§F6.12` records, caught here at the moment it fired.**
>
> #### 2 · 🔴 The two-season agreement table — **RECORDED WITH ITS SUPERSESSION, NOT AS A RESULT**
>
> | season | rows | games | minutes multiplier | usage multiplier |
> |---|---|---|---|---|
> | `2024-25` | `25,737` | `1,216` | `1.3228` | `1.3772` |
> | `2025-26` | `26,069` | `1,216` | `1.3147` | `1.3696` |
>
> *`T15`'s reading: **"agreement within `0.6%` on both — and this time it means something, because
> the estimator CONSERVES.** Earlier I warned that two-season agreement proves stability rather than
> correctness; here we have both, since the model passed an independent predictive test — MAE
> `4.641` with outs versus `6.186` ignoring them."*
>
> 🔴🔴 **AND `A2` WAS CLOSED ELEVEN DAYS LATER IN ALL FOUR FORMS.** *Read this table beside
> `0a-T15-SUPERSESSION` above and `§F6.12`'s retraction. **The "this time it means something"
> argument is exactly the one the retraction dismantles** — `"two-season agreement proves stability,
> NOT correctness. A biased estimator reproduces its bias."* ⇒ ***The MAE test it leans on is a
> MINUTES-MAE test, and `RULE 2` of the four-rules table says minutes MAE was never the product.***
> 📌 **Recorded because the numbers are real and nowhere else on file; `NOT` recorded as support for
> `A2`, which does not ship.**
>
> #### 3 · ✅ The calibration check after the matchup factors went in — `T17`
>
> | | |
> |---|---|
> | rebounds, **`360,120` graded rows** | LESS side worst band **`1.4 pp` — PASS**, *improved from `1.7 pp` pre-matchup* |
> | | MORE side every band within `1.6 pp` **except `[0.65, 0.70)` at `−6.2 pp` on `1,108` rows** |
> | | *"that's the same thin pocket as before — **`0.3%` of the prop**, and it was there pre-matchup at `−5.9 pp`"* |
> | points | the large `[0.90, 1.01)` band sits at **`67,136` rows with `+0.0 pp` — dead on** |
>
> ✅ ***"the market-implied matchup factors went in WITHOUT degrading calibration, and the less side
> actually tightened."*** 🔑 **This is the check `RULE 2` demands and `§0a-T15` did not have**: a
> factor admitted only after the leg-level bands were re-measured, with the pre- and post- numbers
> side by side. ⚠ **`RULE 54`: `360,120` here vs `360,272` in the `prop_confidence_policy` row's
> post-rebuild check — two runs, two populations, `152` rows apart; `NOT RECONCILED`, and neither
> was re-run by this pass.**

✅ **ONE SENTENCE WORTH ADDING, and it is the audit's own justification:** ***"Unverified is not
> the same as fine."*** *`§7` above records the ten props and the two that would have shipped as
> certified; **this is the line the owner's extension rests on**, and it names this corpus's central
> failure shape in five words — **a skip that logs nothing reads as a pass.** Same shape and same
> remedy as `§F6.20`'s `|| echo failed`: make the ABSENCE detectable rather than fix the thing that
> was absent.*
>
> ✅ **And one figure completes the lift table above**: `threes_made` **`23.9%`** — **`0` of `12`**,
> re-checked. *`rebounds_q1` `25.1%`, "six certified outright" and the quarter-box-score wiring are
> **already at `§F2.8`'s seven-row period table** and are NOT added here.*

---

## 0b. THE FOUNDING SCOPE DECISION — reuse vs rebuild
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §4. Recorded 2026-09-20.*

**REUSE DIRECTLY (sport-agnostic):**
- The entire **infrastructure stack**
- The entire **statistical research standard** (all items in the lessons document)
- **The ParlayAPI integration pattern and account**
- **The PrizePicks board scraper architecture** — *"adjust sport filter"*
- **The Gemini adversarial-review usage pattern**
- **The differential/incremental write pattern, chunking pattern, deploy pipeline**

**MUST BE REBUILT SPORT-SPECIFICALLY:**
- **All prop taxonomy and canonical prop-key definitions**
- **All enrichment factors** — *"many removed, several new ones needed"*
- **The scoring engine's actual formula/model** — *"**probability estimation logic is sport-specific
  even if the PIPELINE STRUCTURE around it is reusable**"*
- **The full multiplier/pricing study** — *"MLB's specific numbers do not transfer; only the
  platform-level **mechanics** transfer as **informed priors, not answers**"*

### How the split held
| Item | Outcome |
|---|---|
| Infrastructure | ✅ reused — Workers, deploy pipeline, Hyperdrive, the bridge, `curl_cffi` (read out of MLB's scraper) |
| Research standard | ✅ reused — **all 27 lessons** plus Parts B–F. ⚠ *Corrected 2026-09-20 (pass 30): this row said **26**. **VERIFIED 27** by direct grep of `NBA_LESSONS_LEARNED_FROM_MLB.md` (`grep -c "^### [0-9]\+\."` → 27) and by grep of T1. **Lesson #27 was undocumented** — now at §14.* |
| **ParlayAPI** | ⚠ **reused then SUPERSEDED** — own scrapers beat it (~25% of rungs dropped) |
| PrizePicks scraper architecture | ✅ reused — but **a separate NBA producer** (`league_id=7`, own env namespace, own output), not a sport-filter swap |
| Gemini adversarial pattern | ✅ reused, **without the pre-stated falsification bar** (§14 #4) |
| Differential/chunking/deploy | ✅ reused |
| Prop taxonomy | ✅ rebuilt — 28 props |
| Enrichment factors | ✅ rebuilt — 25 baseline / 4 enrichment, **and ten later closed** |
| Scoring formula | ✅ rebuilt — *"the pipeline structure is reusable, the probability logic is not"* is exactly what happened: **`MAX_TIERS`/`MIN_PER_TIER`/`TIER_BLEND_K` ported verbatim while the recency blend was rejected** |
| Multiplier study | ⏸ **not started** — correctly gated on live board + graded outcomes |

**The one line that predicted the whole port**: *"probability estimation logic is sport-specific even
if the **pipeline structure** around it is reusable."*

---

## 0c. THE TWO-LAYER ARCHITECTURE — never collapsed into one
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

Framed as *"a genuinely rigorous, externally-benchmarked research effort worth adopting **wholesale,
not just its conclusions**"* — cross-validated against multiple independent published sources,
benchmarked against real industry-leading systems, and empirically validated against historical data
**before locking the enrichment design.**
> *"**The METHODOLOGY here is at least as valuable as any specific finding.**"*

### The architecture
| Layer | What it is |
|---|---|
| **Layer 1 — the actual scoring mechanism** | *"**rule-based, deterministic, FULLY INTERPRETABLE and DIRECTLY STEERABLE — NOT a black-box model**"* |
| **Layer 2 — a separate calibration loop** | *"running on **its own cadence**, that **compares what each real PROFILE CELL predicted against real observed outcomes** and proposes **SMALL, *SIZED* ADJUSTMENTS to that cell's parameters** — **NEVER a wholesale replacement prediction**"* |

**Three properties are load-bearing**: separate cadences, adjustments **sized** rather than
open-ended, and **never a replacement** — the calibration loop tunes the rule, it does not override it.

**✅ NBA implements exactly this.** Layer 1 is `classification_ladder_v12.py` (interpretable tiers,
explicit constants, every cell traceable). Layer 2 is `ladder_calibration_asof` — a **separate weekly
refit** proposing a **`log_odds_shift` per cell**, applied as `cal_shift`, **with `p_raw` retained** so
the rule's own output is never lost.

### ⚠ GBDT/ML — a calibration CROSS-CHECK, never the output
> *"**Gradient-boosted/ML models are a real, valuable input TO THE CALIBRATION LOOP SPECIFICALLY, NOT
> a replacement for the interpretable scoring layer** — MLB **EXPLICITLY TESTED AND REJECTED using
> GBDT AS THE FINAL OUTPUT**, because **it produces a BLACK-BOX RATE rather than an interpretable,
> directly-tunable rule**, and because **GBDT has DOCUMENTED, REAL, PEER-REVIEWED RARE-EVENT BIAS.**
> **Build NBA's scoring system the same way: an INTERPRETABLE RULE/PROFILE LAYER as the actual
> mechanism, with ANY ML MODEL RELEGATED TO A CALIBRATION CROSS-CHECK SIGNAL UNDERNEATH IT.**"*

**This settles the T4 GBDT decision with a second, independent reason.** T4 rejected GBDT/neural nets
on **resource and explainability** grounds (*"needs far more data and compute… sacrifices
explainability"*). **T1's blueprint adds a technical one: peer-reviewed RARE-EVENT BIAS** — which
matters acutely here, because **the goblin/demon tails ARE the rare events**, and they were
independently nominated as where the edge lives.

**And it defines the door that remains open**: GBDT is not banned — it is **relegated to a calibration
cross-check**. *(MLB has `gbdt_training_requests`; NBA has no equivalent, and the calibration loop
uses Platt rather than any ML signal.)*

---

## 0d. PER-FACTOR GRIDS, AND HOW TO COMBINE THEM
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

### Each factor gets its own independently-scoped grid
> *"**Give each factor ITS OWN INDEPENDENTLY-SCOPED GRID, with DEPTH EARNED BY REAL EVIDENCE, not
> applied uniformly.**
> MLB **confirmed MATHEMATICALLY that a FULL JOINT CROSS-PRODUCT across all factors would create TENS
> OF THOUSANDS OF CELLS against a training set of roughly 100,000 ROWS** — **meaning MOST CELLS WOULD
> NEVER SEE ENOUGH REAL DATA.**
> **Some factors genuinely need real TIERS, DIRECTION and GRADUATED BANDS; others are better served by
> a PURE CONTINUOUS FORMULA; others are closer to a BINARY GATE. DECIDE THIS PER FACTOR, FROM REAL
> EVIDENCE, not by applying the same structure to every factor FOR CONSISTENCY'S SAKE.**"*

**✅ This is exactly the T8 factor-tier table** — rest/B2B as **tiered bands**, altitude as
**continuous gated >1500 m**, DvP as **quantile bands**, pace as **continuous log**, scheme as
**binary gates**, blowout/OT/foul as **minutes inputs**. **Each form earned by its own evidence**, with
cutpoints *"data-driven (CART), validated out-of-sample, fixed for a season — never arbitrary."*

**The cell-count arithmetic is worth holding against NBA's own numbers**: MLB found tens of thousands
of cells against **~100,000 training rows**. **NBA has 79,358 player-games** — the same order — and a
cell key of **`factor × prop × tier × role_tier × direction × variation_band`**.
**`factor_relevance` (460 rows) is what prevents the cross-product**: it gates which factors are
candidates per prop *before* any tier logic. **35 fitted cells against 460 relevance rows is the
sparsity this warning predicts**, and it is being handled by gating rather than by fitting everything.

### Combine additively in LOG-RATE SPACE by default
> *"**Combine multiple applicable factors ADDITIVELY IN LOG-RATE SPACE (standard regression practice)
> as the DEFAULT combination method** — **this avoids NAIVE MULTIPLICATIVE STACKING silently
> double-counting correlated factors.**
> **Reserve the RSS (root-sum-squares) approach SPECIFICALLY for factor clusters KNOWN TO BE
> GENUINELY, STRONGLY CORRELATED with the same underlying signal** — **the two tech[niques are for
> different situations]**."*

**✅ NBA combines in log-rate space** — *"every coefficient is fit on train **in log-rate space**, so
unneeded factors go to zero on their own"* — and the enrichment record stores **`log_rate_adjustment`**
as its primary field, with `rate_multiplier` as the derived view.

**⚠ The RSS half is still absent** (§7k pattern 3), and this passage clarifies its scope: **RSS is not
the general combiner — additive log-rate is.** RSS applies **only to known-correlated clusters**, which
is why `factor_registry`'s **macro-cluster** column exists.

**So the design is: additive log-rate everywhere, RSS within a declared cluster.** NBA has the first
and the cluster labels, but not the second.

---

## 0e. THE ONE-TIME ARCHITECTURAL OPPORTUNITY — and how NBA used it
*Source: T1, blueprint §4e — "a real, avoidable complexity MLB is currently living with."
Recorded 2026-09-20.*

### The problem MLB lives with
> *"MLB's config-table-driven, two-layer factor design **was NOT built all at once — it was rolled out
> FACTOR BY FACTOR on top of an ALREADY-LIVE, HARDCODED JavaScript enrichment system**, and **as of
> MLB's most recent documentation, SOME factors have MIGRATED to the new config-cell system (getting
> the calibration loop and empirical validation infrastructure 'FOR FREE') while OTHER factors STILL
> LIVE ENTIRELY AS HARDCODED LOGIC in the same file, UN-MIGRATED.**
> **The real, practical cost: for ANY GIVEN FACTOR, a session doing enrichment work FIRST HAS TO CHECK
> *WHICH PARADIGM THAT SPECIFIC FACTOR CURRENTLY FOLLOWS* before doing anything else, since the two
> require GENUINELY DIFFERENT investigation and modification approaches.**"*

### The instruction
> *"**NBA has a real, ONE-TIME OPPORTUNITY MLB NO LONGER HAS: since there's NO EXISTING HARDCODED
> SYSTEM TO MIGRATE AWAY FROM, BUILD THE CONFIG-TABLE-DRIVEN, TWO-LAYER ARCHITECTURE FROM DAY ONE, FOR
> EVERY FACTOR FROM THE START** — **avoid EVER being in the position of maintaining TWO DIFFERENT
> FACTOR PARADIGMS SIDE BY SIDE in the same codebase.**"*

### ✅ NBA took the opportunity — for factors
**Every enrichment factor lives in the config layer from the start**: `factor_registry` (67),
`factor_relevance` (460), `factor_profile_cells` (35), with `classification_config` holding the
decisions. **There is no hardcoded-JS enrichment system, and no two-paradigm split for factors.**

### ⚠ But a two-paradigm split emerged elsewhere — in the RECIPE constants
**The warning is about maintaining two ways of doing the same thing. NBA avoided it for factors and
reproduced it for constants:**
| Paradigm | Holds |
|---|---|
| **Config tables** | `stat_decay_config` (13 per-stat), `role_tiers` (6), `factor_profile_cells`, `classification_config` (66), `minutes_mixture` |
| **Python literals in the recipes** | `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`, `SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN`, `LADDER_DEPTH`, the Wilson threshold |

**And the practical cost the blueprint describes has already been paid once**: `minutes_mixture` in
the config specifies `dud_lognormal`, `tiered_inelastic` renormalisation and a **per-team**
`E[min|blowout]` — **none of which the recipe implements.** **To know what the system actually does, a
session must check which paradigm holds that specific value** — which is exactly the cost named.

**Note the asymmetry in severity**: `role_tiers` in the DB and `ROLE_TIERS` in the code **were verified
to agree**; `minutes_mixture` and the code **do not**. **The split is not uniformly harmful — it is
harmful where the two disagree and nothing asserts they should not.**

---

## 0f. THE "PRESET DICTIONARY" PRINCIPLE — precompute once, runtime is a LOOKUP
*Source: T1, blueprint §4g — **"MLB's own original, explicit design intent for its enrichment system,
and it's worth adopting directly for NBA rather than rediscovering."*** Recorded 2026-09-20.

> *"Given the true scale of **factor × variation × player-tier × prop-line × direction combinations is
> ENORMOUS**, the correct approach is **A LARGE, ONE-TIME RESEARCH AND DESIGN EFFORT THAT PRE-BUILDS
> AND LOCKS THE FULL FRAMEWORK IN ADVANCE** — **for EVERY raw factor, ENUMERATE EVERY REAL VARIATION
> IT CAN TAKE, and for EVERY variation, LOCK THE LOGIC SPLIT BY PLAYER TIER, PROP LINE AND
> DIRECTION** — **rather than COMPUTING NOVEL LOGIC PER LEG AT RUNTIME.**
> **Once this full framework is locked, the system's actual per-run job is REDUCED TO
> CLASSIFICATION / LOOKUP: IDENTIFY WHICH PRE-LOCKED CELL APPLIES to a given leg for each relevant
> factor combination — NOT COMPUTE ANYTHING FRESH.**
> **The heavy design and calibration work happens ONCE, UP FRONT; live sc[oring is a lookup].**"*

### ✅ This is the system NBA built — and it explains the shape of everything
**The five dimensions named here are exactly `factor_profile_cells`' key**:
`factor × prop × tier × role_tier × direction × variation_band`. **The "preset dictionary" IS the cell
table.**

**And it explains why the artefacts are the size they are:**
| Artefact | Rows | Role |
|---|---|---|
| `nba_score.baseline_history` | **19.3M** | the pre-built matrix — *"all the possibilities for all the players, for all prop lines, all variations, all directions"* (the owner, T7) |
| `nba_score.final_hp` | **38.7M** | the enriched lookup surface |
| `factor_relevance` | 460 | which cells are even candidates |
| `factor_profile_cells` | 35 | the locked logic per cell |

**The owner's own framing in T7 is this principle in his words** — *"it does **all the possibilities**…
**a FULL MATRIX of anything that later can be available on the app boards to be picked**"* — and
**`baseline_history` at 19.3M rows is that matrix, precomputed.**

### The consequence for runtime
**P3's job is classification and lookup, not computation.** That is why it can run in the light
afternoon window while P2 carries the heavy build overnight — **and it is the same caching argument
the owner made in T4** (*"the baseline is expensive but only changes after a game — it can be
cached"*), arrived at from the opposite direction.

### ⚠ Where NBA deviates — and it is deliberate
**The band cells and Platt shifts are refit weekly**, not locked once. **That is a refinement, not a
violation**: the blueprint's own two-layer design (§0c) specifies Layer 2 as *"a separate calibration
loop, running on its own cadence… proposing small, sized adjustments"* — **so the framework is locked
and the adjustments move.**

**The genuine deviation is `factor_profile_cells` holding only 35 rows against 460 relevance rows.**
The principle says *"for every raw factor, enumerate every real variation… and lock the logic."*
**Most cells were never locked** — they were tested and found to add nothing. **That is the ten-factor
audit outcome, and it means the preset dictionary is mostly empty by evidence rather than by
omission.**

---

## 0z. ⚠⚠ DATA-STATE WARNING — the 2025-26 partition of `final_hp` is one day deep
*Measured by live SQL 2026-09-20 (T1 pass 33). **Read this before trusting any 2025-26 figure in this
document that was computed from `nba_score.final_hp`.***

| season | distinct dates | rows |
|---|---|---|
| 2024-25 | **162** | **19,075,070** |
| **2025-26** | **1** — `2026-01-15` only | **140,130** |

**Documented table size: 38.7M. Live: 19,215,200.** The cause is a confirmed bug —
`nba/build_final_hp.py`'s `FE_DATE` scopes the read but not the `DELETE`, so a slate-scoped write
replaced the whole 2025-26 partition with one slate. Full entry at the top of `NBA_OPEN_ITEMS.md`;
row counts and recoverability in `NBA_DATABASE.md`.

**What this does and does not put in doubt:**
- **✅ The certified baseline result is NOT affected.** `nba_score.baseline_history` is **intact —
  VERIFIED, 163 dates × 30 props for 2025-26** — and the two-season certification
  (`NBA_BASELINE_CALIBRATION.md` §8) is computed from the backtest harness, not from `final_hp`.
- **✅ The 2024-25 season is complete** at 162 dates, so anything validated on the holdout season
  stands.
- **⚠ Anything in this document computed over 2025-26 `final_hp` rows since the loss was computed on
  one day.** That includes any enrichment-layer check, confidence distribution or
  `final_hp`-vs-`baseline_hp` movement statistic read from the table rather than recomputed.
  **Which figures those are is NOT ESTABLISHED** — the entries do not record whether they came from
  the table or from a harness run. **Flagged, not resolved.**
- **✅ Recoverable** by a full-history re-run; nothing needs re-scraping or re-fitting.

---

## 1. THE CHAIN

**⚠ BOARD-SCOPED WAS IN THE ORIGINAL SPEC, not a later decision.** From the handoff memory (T1):
> *"daily-context + market factors (**tiered logic varying by factor type, player, and prop
> line/variation/direction**) to produce **final hit probability, confidence, and score**; **this
> pipeline is BOARD-SCOPED ONLY (does not cover the full universe of variations like the baseline
> pipeline does)**."*

**So the division was specified from day one**: the **baseline** covers the full matrix of every
player × prop × line × side; the **scoring engine** covers only what the apps actually offer.
`nba/score_board_legs.py` implements exactly this.

```
baseline HP  →  availability delta  →  as-of calibration  →  FINAL HP
                                                                 ↓
                                              confidence (measured deductions)
                                                                 ↓
                                        score 0–100  +  edge (separate column)
```

**Output**: `nba_score.final_hp` — ~~**38,686,696 rows**~~ **19,215,200 rows LIVE**, both seasons, 30 props.

> 🔴 **CORRECTED 2026-09-22 (T20 pass 8, §T20.13).** *This line asserted **38,686,696** with no
> qualification — **and this same document proves that figure is 2× the live table at §"the shortfall"
> (line 679): "total 19,215,200 … 49.7% of the certified ~38.7M."*** **`[LIVE-AUDIT]` 2026-09-22,
> `SELECT season, count(*) … GROUP BY season`:** **2024-25 = 19,075,070** *(byte-exact against its
> recorded figure)* · 🔴 **2025-26 = 140,130 on ONE date** *(against 19,611,626 recorded)* ·
> **total 19,215,200.**
> ⚠ **38,686,696 remains CORRECT as a historical statement** — it is T17's own completion check and is
> quoted as such, properly dated, in `NBA_OPEN_ITEMS.md` where the `[LIVE-AUDIT]` correction follows it
> immediately. **Those instances are sound. This one was not: it stood as bare present-tense fact.**
> 🔑 ***Third instance of §T10.18b's shape — a correction that reached some surfaces and not others.***
> *The count is now the only uncorrected 38.7M assertion the twelve contained: 4 occurrences, 3 of them
> correctly framed as historical quotation, 1 bare. Fixed.*
`season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor, baseline_hp,
final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality, c_market, prop_tier,
band, phase, n_uncertain, built_at`.
**UNIQUE `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.

---

## 2. THE TWO-LAYER CONTRACT

### ⚠ The split was ALSO an operational decision, not only a correctness one
*Source: T1, `NBA_SYSTEM_DRAFT.md` §4b. Recorded 2026-09-20 (T1 pass 32) — **the stated purpose of the
two-layer split had not been recorded anywhere.***

This section documents the split as a **correctness** boundary: baseline applies static factors,
enrichment applies delta factors, *"no oscillation."* **§4b gives a second, independent reason it was
built that way** — and names it as the design intent:

> *"**The optional second run is exactly the cheap, fast re-run THE TWO-STAGE BASELINE/ENRICHMENT
> SEPARATION WAS DESIGNED TO MAKE POSSIBLE** — it only needs to **re-run the Scoring Engine against
> the already-cached baseline plus fresh enrichment/market data, NOT RECOMPUTE ANYTHING
> EXPENSIVE.**"*

**The two framings are compatible and neither implies the other.** A system could separate static
from delta purely for correctness and still rebuild both every run; **the caching is what makes the
separation pay operationally.** And `NBA_SYSTEM_DESIGN.md` §4 independently confirms the economics:
*"the refit uses only games strictly before today, so **it is identical at 1 AM and 1:15 PM**."*
**If it is identical at 1 AM and 1:15 PM, it is identical at 4 PM** — so a same-day re-score costs
the board scrape, the availability delta and the scoring, **not the refit.**

**⚠ The capability this was built for does not exist.** The cadence specified *"once, **sometimes
twice a day**"*, with the second run triggered by **a late injury designation change or significant
line movement**. **P3 ships one run, and neither trigger has a detector.** So the architecture pays
the cost of the split and **does not yet collect this part of the benefit.** Recorded in
`NBA_OPEN_ITEMS.md` → *FROM T1 PASS 32*.

> *"Baseline applies static factors; **enrichment applies DELTA factors**: **`market_spread −
> derived_spread`**, **`confirmed_out` superseding `questionable`**. **No oscillation, no
> double-count, and the value of live information becomes measurable on its own.**"* — T8

**Three properties follow:**
1. **Enrichment never recomputes** — it applies a *difference*.
2. **`market_spread − derived_spread`** is exactly what T16 built when it replaced the r=0.46 proxy.
3. **Expressing the live layer as a delta makes its contribution attributable** — which is what let the
   factor-gate harness reject ten candidates on evidence.

**And the caching reason the split exists at all** (T4):
> *"the baseline is expensive to compute but **only changes after a player plays a game — it can be
> cached**. Enrichment data (injuries, odds) **changes constantly**… Merge them, and **every minor
> daily update forces a full slow recompute**."*

---

## 3. THE AVAILABILITY DELTA

**`nba/build_availability_delta.py`** → `nba_score.availability_delta`.
Diffs the **day-before** report (what P2 built from) against the **day-of** report (P3's view), using
**ABSOLUTE timestamps**, not hour-of-day.

**Two branches:**
| Branch | What it does |
|---|---|
| **`now_out`** | a player newly OUT → his legs go to ~0 |
| **`reallocated`** | his minutes redistribute to teammates |

**Verified on 2025-11-29** (Klay Thompson scratched after P2 built):
- `now_out`: **828 overrides, 1 player**, avg move **0.2640**, max 0.9924
- `reallocated`: **3,446 overrides, 9 teammates**, avg move **0.0131** (~1.3 pp), max 0.0496,
  **0 NaNs**
- End to end: **58,395 legs scored**, Klay's **Overs 0.0122 / Unders 0.9834**

**⚠ The reallocation sensitivity parameter (0.15 per tier) is ESTIMATED, not measured.**
**⚠ Rare branch**: a season scan found only **4 dates** where a ladder-carrying player flipped to OUT
after P2.

**BUG-FIXED — `float(NaN or 0)` returns NaN** because **NaN is truthy**. One player with NaN minutes
poisoned `wsum` → `share` → `gain` → **6,748 NaN overrides** headed for the scorer. Fixed with an
explicit `v != v` check plus a hard guard that drops any NaN before write. **A NaN hit probability is
worse than a missing one because it looks like data.**

---

## 4. AS-OF CALIBRATION

**`nba_score.ladder_calibration_asof`** — 9,577 rows.
`season, as_of_date, prop, phase, band, side, log_odds_shift, n, source, built_at`.
**`source`** = **`own`** (current-season evidence) or **`prior_season`** (inherited same-phase cell).

**Applied as a LOG-ODDS SHIFT** (`cal_shift` on `final_hp`).

**⚠ It REPLACES `nba_score.ladder_calibration`, which was a PARITY VIOLATION** — a pasted constant
table carried across days. **Dropped.** The parity doc's §5 forbids carrying a constant between days,
and this is the case that rule caught.

**Refit rule**: weekly, **on everything graded strictly BEFORE today**, with prior-season inheritance
for cells without own evidence.
**Ordering**: grading must run **before** the refit, or yesterday's evidence is invisible to today's
cells — which is why P2 step 3 (grade) precedes step 14 (refit).

---

## 4b. TRI-STATE DATA-QUALITY TAGGING — a required companion design
*Source: T1, blueprint §4g. Recorded 2026-09-20.*

> *"**EVERY enrichment factor's real influence should be WEIGHTED BY THE RELIABILITY OF ITS OWN
> UNDERLYING DATA** — **how much data actually exists for that factor ON THAT SPECIFIC LEG, HOW FRESH
> IT IS, and WHETHER IT'S A REAL, DIRECTLY-OBSERVED VALUE OR A DERIVED/ESTIMATED FALLBACK.**
> MLB implements this as **an EXPLICIT TRI-STATE TAG — REAL / DERIVED / TEMPORARY — NOT a binary
> present-or-absent flag** — **letting downstream consumers WEIGHT A VALUE'S REAL TRUSTWORTHINESS
> rather than treating EVERY POPULATED FIELD AS EQUALLY RELIABLE.**
> **Build this into NBA's own data model FROM THE START**, and **decide EXPLICITLY, UPFRONT, whether
> the reliability weighting applies INSIDE the enrichment factor itself or downstream.**"*

**A populated field is not automatically a trustworthy one** — a binary flag cannot express that a
value is present *because something substituted for it*.

### ⚠ NBA expresses this through CONFIDENCE, not through a tag on the value
| Mechanism | Expresses | Form |
|---|---|---|
| `used_emp` (`baseline_ladder`) | empirical table vs parametric fallback | binary |
| `interpolated` (`board_scored`), −4 confidence | off-ladder rung interpolated | binary |
| `source` (`ladder_calibration_asof`) — `own` / `prior_season` | own vs inherited evidence | binary |
| **`anchor_type` (`board_tiers`) — `explicit` / `switch_point`** | **observed vs DERIVED anchor** | binary, closest in spirit |
| `c_exist` / `c_quality` / `f_prov` | provenance and data quality | **continuous deductions** |

**Routing reliability through the measured confidence model rather than a label is defensible and
arguably stronger** — `f_prov` is a measured deduction, not an assertion.

> 🔴🔴 **CONTRADICTED BY THE CODE — recorded 2026-09-21, §T9.37b.** **All three live definitions of
> `f_prov` are `used_emp`, rescaled**, and `used_emp` is listed **as binary two rows above** in the
> table this paragraph concludes:
>
> ```python
> build_confidence_v3.py:62   f_prov = d["used_emp"].fillna(False).astype(float) * 0.7 + 0.3   → {0.3, 1.0}
> build_final_hp.py:344 · score_board_legs.py:234   np.where(d["used_emp"]…, 1.0, 0.30)
> ```
>
> **`f_prov` takes exactly two values and the value is the label.** *So the same flag is counted once
> as a binary label and once as a continuous deduction, and the argument that the model is stronger
> than a label rests on a factor that **is** the label.* At weight **0.12** in
> `build_confidence_v3.py:85`, the whole spread it can express is **0.084** of raw confidence — and
> **`used_emp` is `true` on 99.73% of ladder rows**, including **all 30,989 rungs beyond their prop's
> measured `LADDER_DEPTH`** (§T9.33a, §T9.37a). 📌 **Scope: `f_prov` only. `c_exist` and `c_quality`
> were NOT CHECKED** — no definition of either was found under `nba/`.

**⚠ The undecided half is the second clause**: *"decide explicitly, upfront, whether the weighting
applies **inside the enrichment factor itself** or **downstream**."* **NBA applies it downstream.**
The enrichment record has a separate `confidence_adjustment` field, so a factor *can* move confidence
— **but no factor is recorded as weighting its own contribution by its data's reliability.**

**Two live cases where a "derived" or "temporary" tag would have been load-bearing:**
- **The derived-spread proxy (r=0.46)** stood in for the market spread until T16 replaced it.
  **Nothing in the data model marked its outputs as resting on a proxy.**
- **The availability delta's `0.15 per tier` sensitivity is ESTIMATED, not measured** — "temporary" in
  this taxonomy — **yet its overrides look identical to measured ones**, and they are the largest
  displacements the system produces (`now_out` avg 0.2640, max 0.9924).

---

## 5. CONFIDENCE — a data thermometer, not a probability

### 5.1 The principle
> **Confidence measures EPISTEMIC uncertainty only — our ignorance. The HP already states the
> aleatoric coin-flip.**

**A coin flip with perfect data should score HIGH confidence and 0.5 HP.** Any model that conflates the
two is wrong — which is exactly how the conformal attempt failed.

### 5.2 The measured deduction model — `nba_score.confidence_model`
**10 factors. Base 99, floor 55.** Starts at 99 and **deducts for named deficiencies**, with weights
**measured from realised-gap separation**.

⚠⚠⚠ **CORRECTION IN PLACE, 2026-09-22 (T18 pass 2; evidence in `NBA_WORKERS.md` §0.003-T18 for the
stratum this came from) — THE TABLE BELOW IS A SUPERSEDED
NINE-FACTOR STATE, AND IT CONTRADICTS §*AND THE CAP MECHANISM IS VERIFIED IN SOURCE* OF THIS SAME
DOCUMENT.** *The correction is recorded rather than edited away, per the §0w precedent.*
**(1)** The heading says **10 factors**; the table lists **`f_role` + eight others = NINE**, and
`16.1111 + 8 × 1.6111 = 29.0` exactly — **so these are the nine-factor weights, before `f_phase`
existed.** **(2)** `55.6%` **is above the `CAP = 0.40` the same session imposed**, because the write
that produced it *(T18 `tool_use` SEG 50, `allow_write: true`)* is a **one-pass SQL**
— `least(sh, 0.40)` → `greatest(sh, 0.04)` → normalise — **and normalising AFTER the floor re-inflates
the capped factor past its own cap.** ✅ **Arithmetic verified independently, exact**: separations
`f_role` 0.008477 · `f_books` 0.000013 · seven zeros ⇒ shares 0.99847 / 0.00153 / 0 ⇒ cap ⇒ floor ⇒
sum `0.40 + 8 × 0.04 = 0.72` ⇒ **`0.40 / 0.72 = 55.56%`**, and `0.5556 × 29 = 16.111` — **the table's
own numbers.** 🔴🔴 ***That is the IDENTICAL no-op this document quotes the author diagnosing and
fixing in Python forty-five segments earlier*** *("clip to 0.35, divide by 0.35, and it is back at
1.0")* — **fixed in one language and reintroduced in the other, in the same session.**
✅ **THE LIVE TABLE IS THE AUTHORITY AND IT HONOURS THE CAP** *(`[LIVE-AUDIT]` 2026-09-22, read-only
SELECT on `nba_score.confidence_model`, **ten** rows)*: **`f_role` 11.2731 = 38.87% · `f_phase` 9.0625
= 31.25% · `f_books` 2.3207 = 8.00% · seven others 0.9063 = 3.13% each**, summing to 29.00.
⚠ **Rule 6: WHY the live figures differ from this session's is NOT RECORDED** — `f_phase` carries a
measured separation of **0.001467** that no run in T18 produced, so a later session fitted it, and
**T19 and T20 are unread.** *The sweep records the two states and the arithmetic linking them; it does
not name the run that bridged them.*

| Factor | Budget ⚠ *superseded — see the correction above* |
|---|---|
| **`f_role`** | **55.6%** ⚠ *nine-factor state; above the 0.40 cap; live value is 38.87%* |
| eight others | **5.6% floor each** ⚠ *live value is 3.13% across SEVEN others, with `f_phase` and `f_books` above the floor* |
| **season phase** | Oct-Nov **0.80** · Dec-ASB **1.00** · post-ASB **0.88** · push **0.92** |

**Why `f_role` dominates**: **fringe players miss by 0.0283; iron-men by 0.0008 — a 35× gap.**
Those are the bottom and top bands of `ROLE_TIERS`.

**Mean confidence 0.92–0.95.** Per-leg factors (`f_role`, `f_prov`) are real, read from
`baseline_history` — **not placeholders**.

> 🔴🔴 **`f_phase` IS COMPUTED AND IS NOT IN THE SUM — recorded 2026-09-21, §T9.38a.**
> `build_confidence_v3.py`'s `FACTOR_COLS` declares **ten** factors; `f_phase` gets a **six-line
> justification with measured figures** (*"the calibration work measured the gap decaying **+1.46 /
> +1.30 / +0.88 / +0.13 pp** across those four… **a confidence question, not a probability one**"*), a
> rank map, and a place in the `attach` block — **and the `raw` expression sums nine terms without
> it.** ✅ **The nine weights total exactly 1.00**, so the omission is structural: `f_phase` could not
> be added without renormalising every other weight. **The factor is exported for inspection and has
> zero effect on the confidence it was written to adjust.**
>
> 📌 **The full weighted set** (`build_confidence_v3.py:85`): `f_complete` **0.16** · `f_depth`
> **0.14** · `f_prov` **0.12** · `f_role` **0.12** · `f_time` **0.10** · `f_vol` **0.10** · `f_agree`
> **0.10** · `f_exp` **0.08** · `f_books` **0.08**. ⚠ **Two of the nine are binary** — `f_prov`
> (`used_emp`, §T9.37b) and `f_time` (`np.where(n_uncertain > 0, 0.65, 1.0)`).
> ⚠ **And `f_depth` uses a hardcoded `14.0`** — exactly `LADDER_DEPTH["points"]` — **as the rung-distance
> scale for all twenty props** (§T9.38b), so `steals` at offset 10, five times its measured depth,
> scores identically to `points` at offset 10, inside its own.

### 5.3 Three earlier versions, and why each failed
| Attempt | Why it failed |
|---|---|
| **Equal-mass quartiles** | forces 25% into "low" **regardless of data quality** |
| **Hand-weighted pillars** | existence separated nothing; **quality INVERTED** |
| **Conformal** | **dominated by aleatoric noise** — a coin-flip with perfect data scored badly |

### 5.4 Interpolation penalty
An off-ladder rung interpolated in log-odds is **flagged** and costs **−4 confidence**.

---

## 6. THE SCORE — 0–100, ENHANCING, never taxing

### 6.1 The rule
**Pivot at 0.85 confidence.**
- **Above 0.85** → the score is **lifted toward 100**, by up to **half the remaining headroom**
- **Below 0.85** → **pulled down**, by up to **35%**

### 6.2 Why not a product
**A multiplicative score kills good legs.** Verified live:
| Leg | Multiplicative | Enhancing |
|---|---|---|
| 0.478 HP @ 0.949 conf | 45.39 | **65.06** |

**And it reorders correctly**: **0.434 HP @ 0.952 conf (62.71) outranks 0.468 HP @ 0.884 conf
(52.78)** — a slightly worse probability with materially better information wins.

### 6.3 Edge is a SEPARATE column
**`edge` = distance above break-even.**
- **`score`** answers *"how good is this leg?"*
- **`edge`** answers *"is this an opportunity?"*

**They are different questions and must not be fused.**

---

> 🔴 **WHAT THE FACTOR SET ACTUALLY IS — recorded 2026-09-21 (T10 pass 3, §T10.3a), because none of
> the twelve said.** T10 closes factor discovery, and its terminal state lived in exactly one
> document — `NBA_ENRICHMENT_FACTOR_LOCK.md` — and in **none** of the mandated twelve:
>
> > *"**discovery is closed: 34 factors, ~90 sub-factors, a minutes tree, thin factors, retirements**,
> > and a **baseline/enrichment split that puts everything derivable or day-before-published into the
> > baseline**. … the factor set is now **complete at the level of mechanisms**: availability and role
> > **A1–A9, N1–N2** · game state **B1–B5, K1** · matchup **M1–M4, B4** · market **C1–C4, S1–S4** ·
> > officials/schedule **D1–D2** · confidence **E1–E4**. What remains is not more factors but …"*
>
> ⚠ **And the twelve carry four different factor counts, none of them 34** — **67** (`factor_registry`,
> seeded at 29), **15** (the recipe's props), **10** (tested at T15/T16), **25** (band rows). *A reader
> of the twelve could not reconstruct what the factor set **is**, only how many rows various tables
> hold.* 📌 **The A/N/B/K/M/C/S/D/E code scheme appears in no mandated document**, though later
> transcripts refer to factors by those codes.
>
> ⚠ **Chronology preserved**: this is **T10's** state — the candidates. **The verdict below is
> T15/T16's**, and is not imported into T10's entry.

## 7. THE ENRICHMENT FACTORS — ten tested, none survived

**`nba_score.factor_gate_results`**: `season, slice, model, n, log_loss, brier, gain_vs_anchor,
shrink_beta, run_at`. **Every verdict lands in the database** — *"a verdict that only exists in stdout
is not a verdict."*

| Factor | Verdict |
|---|---|
| **A2 — teammate redistribution** | **five panels failed, then RETRACTED** — *"the certified anchor wins every slice, **and worst where the mechanism predicted it should win**"* (COMPASS 91). ⚠ **WHY they failed — recorded 2026-09-20 (T1 pass 72), from `build_redistribution_panel.py`'s own docstring, and previously in none of the twelve**: every version tried to attribute vacated minutes to a **specific** absent player, and each then had to isolate a "clean" sub-case — **v1** minutes floor, **v2** `pair_games>=5`, **v2b** `leaguedashlineups` (**API capped at 2,000 rows**), **v3** `single_absence` only (**kept 218 of ~1,150 team-games**). Each isolation **dropped the absorbers**. *"**The isolation WAS the bug, five times.**"* Conservation-gate values **0.10 / -0.05 / -0.37 / 0.25-0.49**. **v4 answered it structurally** — absences as features, one row per (team-game, remaining player), **conservation by construction** (shares of the team pool sum to 1), *"thousands of team-games, not 218"*. **Carry the method lesson, not the factor**: filtering to the clean sub-case can remove exactly the rows carrying the effect. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 72*. |
| **A3 — return ramp** | assigned to **BASELINE** by the parity doc; gated at leg level: **zero gain** |
| **A5 — lineup change** | **REJECTED/CLOSED** — *"the allocator's recent-5 minutes already encode starting… **no projected lineups needed → no leak to mitigate**"* |
| **B4 — opponent availability / rim protection** | closed in **three** formulations, **0 of 5 props** |
| **M1 — defender quality** | rejected on a crude metric, then **rebuilt as a two-way ridge** (111,768 ratings) and wired on **4 props — but ONLY in the INTERACTION form, never as a main effect** |
| **N1 — availability model** | **79% of Questionables are coin flips at the cutoff** (AUC 0.630) — the Active List locks 60 min before tip |
| others | closed |

**The pattern**: *"the baseline already carries what these factors re-express."*
**T4 warned about exactly this** — the trend EWMA was to be *"dampened **specifically so it doesn't
double-count what the main average already captures**."*

---

## 7b. THE ENRICHMENT MULTIPLIERS AS ORIGINALLY DESIGNED *(T4)*

**The enrichment layer was specified as multipliers/coefficients/bonuses/penalties**, with each factor
carrying a fallback *"so it's never empty."* Three designs are worth keeping, because two of them were
later rejected and the third is the reason why.

### 7b.1 "Situational Minutes Adjustment"
> *"A set of **multipliers or deltas applied to the baseline MINUTES** based on today's specific
> context… **distinct modules in the `Daily Context` stage**."*

**Note it targets MINUTES, not rates** — consistent with the architecture's rule that blowout, OT and
foul risk are *"minutes-model inputs, not rate factors."*

### 7b.2 The playmaker-absence rule — **this is A2's ancestor, in pseudocode**
```python
# config
#   minutes_threshold                  e.g. 28.0
#   target_player_position_filter      e.g. "PG,SG"
#   assist_rate_bonus_multiplier       e.g. 1.15
def apply_playmaker_absence_bonus(player, game_context):
    ...
    player.projected_assist_rate *= config.assist_rate_bonus_multiplier
    return player     # Apply only once
```
**Three design details survived into the later work and one did not:**
- **`# Apply only once`** — an explicit guard against stacking. *(The same class of bug that later
  produced the **triple-stacked logit shift** — FRINGE points predicted 58.7% vs a raw 95%.)*
- **Every threshold is config, not a literal** — the no-hardcoding rule.
- **A flat 1.15× bonus** — this is the form A2 generalised, and **A2 was retracted after five failed
  panels**: *"the certified anchor wins every slice, and worst where the mechanism predicted it should
  win."*

### 7b.3 The Trend Factor — **and the dampening warning that turned out to be the whole story**
> *"`Trend_Factor < 0.95` (e.g. 0.90) → **they are in a slump**… This becomes a **final multiplier** in
> your projection pipeline, **but it should be DAMPENED. YOU DON'T WANT TO DOUBLE-COUNT.**
> **Dampened Application**: `Trend_Adjusted_Projection = Final_Projection × …`"*

**⚠ This warning, written at design time, is the verdict the entire enrichment audit eventually
reached.** Ten factors were tested in T15/T16 and **none survived**, with one recurring diagnosis:
***"the baseline already carries what these factors re-express."***

**The EWMA is the trend.** A separate trend multiplier applied on top of an EWMA-based projection
double-counts by construction — which is why the T4 methodology also specified the trend be carried by
**a second, faster EWMA compared against the primary, applied as a dampened adjustment
"specifically so it doesn't double-count what the main average already captures."**

**The lesson generalises**: before adding any enrichment multiplier, ask **what in the baseline already
encodes this signal**. The measured answer, ten times out of ten, was "the baseline does."

---

## 7c. THE ENRICHMENT APPLICATION RECORD — how a factor's contribution is audited

**⚠ T1 specified this design and named the payoff:**
> *"**Pass through ENRICHMENT-SIGNAL METADATA alongside EVERY graded outcome** — **which specific
> enrichment factors were ACTUALLY APPLIED to this leg, and WHICH WERE MISSING** — **this SINGLE
> DESIGN CHOICE directly ENABLES the kind of ENRICHMENT-FACTOR AUDIT described in §4a to be done LATER
> FROM STORED DATA, rather than requiring AN EXPENSIVE, ERROR-PRONE REVERSE-ENGINEERING EFFORT FROM
> PROBABILITY VALUES ALONE AFTER THE FACT.**"*

**✅ NBA built this.** Every enriched leg carries:
```json
{"prop_side": "more",
 "board_line_value": 0.5,
 "log_rate_adjustment": 0,
 "rate_multiplier": 1,
 "confidence_adjustment": 0,
 "factors_applied": 1,
 "breakdown": "[{\"factor_key\":\"player_availability\",\"status\":\"applied\",\"cell_id\":null,\"contribution\":…}]"}
```

**Note the specification's second half — *"and WHICH WERE MISSING"*** — which is why **`status` matters
as much as the value**, and why `factors_applied` counts them. **A zero contribution and an absent
factor are different states**, and the record distinguishes them.

**This is what made the ten-factor audit possible at all.** `factor_gate_results` could compare
log-loss and Brier **with and without each factor on identical legs**, rather than reverse-engineering
intent from probabilities.

**⚠ One gap against the specification**: T1 says *"alongside every **GRADED OUTCOME**."* NBA's record
lives on the **scoring** side (`final_hp` / the enrichment output), and **whether
`nba_market.board_outcomes` carries the enrichment metadata joined to the graded result is
unverified.** If it does not, the audit requires a join back to `final_hp` by
`(game_date, player_id, prop, line, side)` — **workable, but only while both tables retain the same
dates.**

**Four fields make the layer auditable per leg:**
| Field | Purpose |
|---|---|
| **`log_rate_adjustment`** | the additive adjustment **in log-rate space** — the space factors are fit in, so unneeded ones sit at 0 |
| **`rate_multiplier`** | the same adjustment expressed multiplicatively (1 = no change) |
| **`confidence_adjustment`** | **factors can move CONFIDENCE independently of the rate** — e.g. an interpolated rung costs −4 without touching the probability |
| **`factors_applied`** | the count, so a leg with 0 factors is distinguishable from one where every factor computed to zero |

**And `breakdown` carries a per-factor entry** with **`factor_key`, `status`, `cell_id`, and the
contribution** — so for any leg you can answer *"which factors fired, which cell did each read, and
how much did each move the number?"*

**`status` matters as much as the value**: a factor can be `applied`, or skipped — and the skip reason
(gated out by `factor_relevance`, no cell, under sample threshold) is recorded rather than silently
producing zero. **A zero contribution and an absent factor are different states.**

**This is the mechanism that made the ten-factor audit possible.** Because every application is
recorded with its cell and contribution, `factor_gate_results` could compare log-loss and Brier
**with and without each factor** on identical legs — which is how *"the certified anchor wins every
slice"* was established rather than asserted.

**The harness reports carry the fitted values too**: `role_minutes_multiplier_train_fit` and
`platt_fits` are written into each run's report alongside `ladder_steps`, `props`, `test_season` and
`generated_at` — **the no-pasted-constants rule made inspectable per run.**

---

## 7d. TWO CHEAP GUARDS MLB NEVER APPLIED *(T1, lessons document)*

### 7d.1 **Verify a factor actually HAS variance, first**
> *"for any factor, **verify it actually has variance (`stddev(factor_value) > 0`) as a FIRST sanity
> check** — **this is cheap and MLB NEVER DID IT PROACTIVELY**."*

**A factor with zero variance cannot explain anything**, yet it will fit, report a coefficient and
consume a cell. **One `stddev()` before any gate run catches it.**

**This is directly relevant to NBA's empty columns**: `nba_ref.arenas.altitude_ft` and `.timezone` are
**0 of 30 populated** — an altitude factor built today would have `stddev = 0` and this check would
have caught it immediately. **Same for any factor reading a column that was created but never filled.**

### 7d.2 **Declare `relevant_prop_keys` explicitly — never apply blindly**
> *"Each enrichment factor should have **`relevant_prop_keys` explicitly declared** (which props it
> applies to) **rather than applying blindly** — MLB's `defensive_quality_oaa` factor is correctly
> scoped this way."*

**NBA implements this as `nba_config.factor_relevance`** — 460 rows of `factor × prop →
full/partial/none`, described as *"the gate that runs BEFORE any tier logic."* **The lesson was
carried.**

### 7d.3 **Confidence-tier every research record**
> *"…(Flex-mode partial-credit payouts) that had been **built once from real data but NEVER RE-CHECKED
> against further real placed slips**. **Both were reported, but the second was explicitly labelled as
> a FIRST PASS rather than a settled figure.** **Carry the same explicit confidence-tiering into NBA's
> own research records — don't let a on[e-off measurement harden into a fact].**"*

**⚠ This applies directly to `NBA_MULTIPLIERS.md` §0.2**: the *"two independent real observations both
showed identical partial tiers 4/5 = 0.5 and 3/5 = 0.25"* finding is **exactly this shape** — a small
real-data measurement that looks settled. **It is labelled *"suggests these MAY be flat/constant"* in
the source, and that hedge must survive into any use of it.**

**The NBA analogue already in place**: the `BACKTEST-LOCKED` tag on `classification_config` entries
distinguishes earned values from seeds. **The same discipline, applied to config instead of prose.**

---

## 7e. THE TWO-TEST PARADOX — why a factor can be real and still worthless *(T1, lessons document)*

**The single most important methodological point in the factor work**, and it explains every one of
the ten rejections:

> *"[A factor showed real signal on residuals] **left over after the baseline's prediction** (a real,
> legitimate test — it answers ***'does this carry information the baseline doesn't already have?'***)
> — **but when the stricter, more directly relevant test was run** (***does ADDING this factor to the
> baseline actually improve the combined model's own correlation with real outcomes?***), **the same
> factor showed NO improvement, and even trended slightly NEGATIVE.**
> **Both tests were run correctly and neither is wrong on its own terms — they simply answer DIFFERENT
> QUESTIONS, and only the se[cond one matters].**"*

| Test | Question | Verdict it gives |
|---|---|---|
| **Residual correlation** | *"Does this carry information the baseline lacks?"* | can be **yes** for a useless factor |
| **Marginal contribution** | *"Does ADDING it improve the combined model?"* | **the only one that decides** |

**Why both can be true at once**: a factor can correlate with the residual while being collinear with
what the model already uses, or while adding variance faster than signal. **Residual correlation is
necessary, not sufficient.**

**This is exactly the shape of the NBA enrichment audit's outcome** — ten factors, each with genuine
domain rationale and often real residual correlation, and the measured verdict
*"the certified anchor wins every slice."* **`factor_gate_results` stores `gain_vs_anchor`, not
correlation** — the right metric, by construction.

**And A2's damning detail follows directly**: *"worst where the mechanism predicted it should win."*
A factor whose marginal contribution is **negative exactly where its story is strongest** is
describing something the baseline already models better.

## 7f. PRE-REGISTER THE DECIDING TEST *(T1)*

> *"**A signal's last, deciding check: PRE-REGISTER THE EXACT TEST BEFORE RUNNING IT.** Once the
> **leakage and circularity** issues above were both fixed, the investigation's final test of a
> remaining candidate factor was **explicitly pre-registered**."*

**Three guards, in order, and all three are needed:**
1. **Fix leakage** — as-of contamination (three instances in this system; see OPEN_ITEMS)
2. **Fix circularity** — e.g. prior strength measured against tier-mates is circular, since tier-mates
   were *selected* for similarity (T8: *"k≈2 against the population but k≈100–250 against tier-mates
   (circular)"*)
3. **Pre-register the deciding test** — so the result cannot be re-specified after it is seen

**NBA's structural equivalent**: `nba_score.factor_gate_results` fixes the metrics
(`log_loss`, `brier`, `gain_vs_anchor`, `shrink_beta`) **before any factor is run**, and every verdict
lands in the table. *"A verdict that only exists in stdout is not a verdict."*

---

## 7g. SAME-GAME CORRELATION — real, but smaller than folklore *(lesson #12)*

> *"External research (published DFS/sharp-bettor material) **correctly predicted that pick'em
> platforms price legs as INDEPENDENT even though same-game props are genuinely correlated** — but
> **[our] own measurement found the raw effect was INFLATED BY MULTIPLE CONTAMINATION SOURCES**:
> **pooling across props with different base rates**, **unweighted game-size averaging**, and
> **nested / nearly-deterministic SAME-PLAYER MULTI-LINE STACKING** — **and the clean, corrected
> effect was MUCH SMALLER than the initial headline number.**
> **Separately and decisively: when tested with a real LIVE-BOARD same-game vs cross-game slip
> comparison, the platform showed a REAL, LARGE PAYOUT DISCOUNT for same-game stac[king].**"*

**Three contamination sources, each of which inflates a measured correlation:**
| Source | Why it inflates |
|---|---|
| **Pooling across props with different base rates** | a mixture of populations shows association that exists in neither |
| **Unweighted game-size averaging** | high-scoring games dominate the raw average |
| **Nested / nearly-deterministic SAME-PLAYER MULTI-LINE STACKING** | two lines on the same player's same stat are not two observations |

**Note the third source is named precisely: same-player multi-line stacking** — i.e. taking
`points 20+` and `points 25+` on one player, or `points` and `PRA`. **That is Part C member #4.**

**The two findings compound against a same-game strategy, and both are quantified:**
> *"…the platform showed a **real, large payout discount for same-game stacking — A ~35–40% LOWER
> MULTIPLIER FOR THE IDENTICAL LEGS — which MORE THAN OFFSET the real (much smaller, **~8%**, ITSELF
> NOT STATISTICALLY CONFIRMED) correlation benefit.**
> **Do not assume same-game stacking is a working strategy for NBA without DIRECTLY TESTING the
> platform's own same-game discount, the same way — IT MAY BE ACTIVELY PRICED AGAINST, NOT FREE
> MONEY.**"*

| Side | Magnitude |
|---|---|
| **Correlation benefit** | **~8%** — *"much smaller… **itself NOT statistically confirmed**"* |
| **Platform's same-game discount** | **~35–40% lower multiplier on identical legs** |

**The discount is roughly 4–5× the benefit, and the benefit is not even statistically confirmed.**
That is the arithmetic behind *"default to cross-game"* (`NBA_MULTIPLIERS.md` §0.2f).

**And the instruction for NBA is to re-measure, not to inherit**: *"directly testing the platform's
own same-game discount, **the same way**"* — a live-board same-game vs cross-game slip comparison.
**That is the same free slip-builder quote as lesson #16** (the payout displays before placing), so
**one session answers both questions.**

**NBA relevance**: the combo work estimates **per-player covariance from that player's own per-game
P/R/A**, which avoids source 1 (no pooling across players or props) and source 3 (components modelled
jointly rather than stacked as independent lines). **Source 2 — weighting — is the one to check**,
since a per-player covariance averaged across games without volume weighting has the same exposure.
*(Lesson #6 independently requires volume weighting at the day level.)*

---

## 7h. THE MLB→NBA ENRICHMENT FACTOR MAPPING *(T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §2)*
*Written before any NBA code existed. Recorded 2026-09-20.*

| MLB factor | NBA equivalent, as stated |
|---|---|
| **Weather** (temp, wind, precip) | *"**Not applicable (indoor sport) — REMOVE THIS FACTOR FAMILY ENTIRELY, don't port it.** Confirmed a real time-saver: **MLB spent real effort on weather factors that MOSTLY FAILED ANYWAY**; NBA doesn't need to build this category at all."* |
| **Park factors** (dimensions, altitude) | *"**Arena factors — much smaller effect expected** (basketball courts are **standardized dimensions** unlike ballparks) — **but ALTITUDE (Denver) is a real, known effect in NBA and worth keeping as its own factor.**"* |
| **Roof / dome status** | *"Not applicable — remove."* |
| **Batting order / lineup position** | *"**Not directly applicable** — the NBA equivalent concept is more about **MINUTES / ROLE PROJECTION and STARTER-vs-BENCH statu[s]**"* |

### What this predicted, and how it turned out
- **Altitude** was singled out at the very start as *"a real, known effect… worth keeping as its own
  factor"* — and **six transcripts later peer-reviewed support arrived** (*J. Sports Sciences* 2025,
  p=0.005). **The column `nba_ref.arenas.altitude_ft` was created in T1's first DDL.** ⚠ **It is still
  0-of-30 populated.**
- **Court standardisation** is why arena factors were correctly expected to be small — unlike
  ballparks, the playing surface does not vary.
- **"Minutes / role projection and starter-vs-bench"** is exactly what the engine built: **`mu_role`
  and the six-band `ROLE_TIERS`**, with `f_role` later measured as carrying **55.6% of the confidence
  deduction budget**.
- **The weather instruction is a "don't build" decision recorded as a saving**, with the reason given:
  MLB's own weather factors *"mostly failed anyway."*

**The pattern worth noting**: three of four mapped MLB factor families were resolved as **remove, not
port** — and the one kept (altitude) plus the one reframed (lineup → minutes/role) are both central to
the system as built.

### ⚠ COMPLETENESS — the table above transcribes 4 of the source's 10 rows
*Added 2026-09-20 (T1 pass 61). The six missing rows, and how each turned out:*

| MLB factor | NBA equivalent, as stated | Outcome |
|---|---|---|
| **Bullpen fatigue / matchup** | *"Not applicable in the same form — NBA's closer conceptual equivalent is **teammate/rotation fatigue (back-to-backs, minutes load, load management/rest patterns)** — this is **likely a MORE important factor for NBA** than bullpen factors are for MLB"* | **absorbed into the baseline** via the calendar (rest days, B2B), not built as an enrichment factor |
| **Handedness matchup** | *"Not applicable in the same form — closer NBA equivalent: **positional/defensive matchup quality** (opponent's defensive rating at that position, **individual defender matchup if data supports it**)"* | became **`nba_team.defense_vs_position`** and **M1 defender level** — M1 works **only in interaction form**; **B4 closed in three formulations, 0 of 5 props** |
| **Recent form** | *"**Directly applicable, same concept — port directly.**"* | ✅ **the EWMA core of the baseline** — per-prop `alpha`, the most load-bearing single decision in the recipe |
| **Lineup protection** | *"Weaker/different analogue… closest concept might be **'usage rate change with a teammate out'** (**real, well-documented NBA effect**: injuries/absences to high-usage teammates measurably shift a player's own usage and production)"* | became **A2 teammate redistribution** — ⚠ **five panels failed and A2 was FULLY RETRACTED**; the certified anchor wins every comparison |
| **Opposing starter quality** | *"**Opposing team's defensive rating / opponent points-allowed-by-position — directly analogous concept.**"* | **in the baseline**, not the enrichment layer — *"opponent defence, pace matchup and blowout risk all belong in the baseline"* |
| **Quality of contact** (exit velocity, launch angle) | *"**Not applicable — remove entirely**, this is MLB-specific batted-ball physics with no basketball equivalent"* | ✅ never built — and `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` was correspondingly left unread |

**⚠ The scorecard across all ten rows is worth stating plainly.** The handoff called the
teammate-usage effect **"real, well-documented"** — **it is the one prediction that was actively
tested and RETRACTED.** Its two most confident calls — *"likely a MORE important factor for NBA"*
(rotation fatigue) and the well-documented usage effect — **both ended up either folded into the
baseline or retracted**, while its *"port directly"* call (**recent form**) became the single most
load-bearing mechanism in the system.
**This is the third recorded case of a confident forward-looking handoff claim not surviving
contact**, after ParlayAPI (*PASS 49*) and the four NBA-specific factors (*PASS 52*) — and it
sharpens the same filter: **the handoff's descriptions of MLB's measured experience held; its
forecasts about NBA did not.**

---

## 7i. THE "PHASE FILE" ENRICHMENT ARCHITECTURE *(T1, the blueprint §4)*
*Recorded 2026-09-20.*

> *"MLB organises enrichment into **named phases, EACH A SEPARATE WORKER FILE even when many are
> near-identical boilerplate around ONE factor**."*

| Phase | MLB contents | **Stated NBA equivalent** |
|---|---|---|
| **2A — game/environment level** | run environment, park impact, weather impact, roof impact | **pace, home/road, back-to-back, altitude if relevant, arena factors** |
| **2B — player role/matchup** | batting order/lineup role, bullpen matchup, handedness matchup, lineup protection, opposing starter matchup, recent form | **role/minutes projection, opponent defensive matchup, positional matchup, rest/schedule spot, recent form** |
| **3A / 3B / 3C** | per-prop-family context builders — *"one per prop or prop-cluster"* | — |

**NBA did NOT follow the one-file-per-factor structure.** Enrichment is consolidated into
`build_final_hp.py` with the factor registry (`nba_config.factor_registry`, 67 rows) supplying the
per-factor definitions. **The phase taxonomy survives as the A/B/D/M/N factor codes**, not as files.

**Note how well the stated 2A/2B mapping predicted the built system**: *"role/minutes projection"*
became `mu_role` and `ROLE_TIERS`; *"opponent defensive matchup"* became the measured opponent
coefficients (blocks ← paint share 0.30/0.37, steals ← opp TO rate 0.27/0.26); *"rest/schedule spot"*
became A4; *"back-to-back"* and *"home"* were both **measured ≈0** because the minutes model already
carries them.

### ⚠ THE CRITICAL LESSON ATTACHED TO THIS SECTION
> *"**Critical lesson BEFORE BUILDING ANY OF THESE**: MLB's own factor layer had **a LIVE, UNDETECTED
> BUG — one factor (`stolen_base_family`) had ZERO VARIANCE ACROSS EVERY ROW** — **a real defect:
> WIRED INTO THE SCORING ENGINE, CONTRIBUTING LITERALLY NOTHING** — and **was ONLY CAUGHT BECAUSE IT
> ACCIDENTALLY BECAME USEFUL AS A PLACEBO / NOISE-FLOOR CALIBRATOR during later statistical work.**
> **Before trusting ANY new NBA enrichment factor, verify it actually has variance
> (`stddev(factor_value) > 0`) as a first sanity check — this is cheap and MLB NEVER DID IT
> PROACTIVELY.**"*

**Three things make this the sharpest warning in the blueprint:**
1. **It was wired into a live scoring engine**, contributing nothing, for an unknown period.
2. **It was caught BY ACCIDENT** — not by review, not by testing, but because someone later needed a
   placebo and noticed this factor was one.
3. **The detection cost is one line of SQL**, and it was never run.

**A zero-variance factor is worse than a missing one**: it occupies a slot, consumes a cell, reports a
coefficient, and passes every structural check — while carrying no information.

**Directly live for NBA**: `nba_ref.arenas.altitude_ft` and `.timezone` are **0-of-30 populated**, so
an altitude or jet-lag factor built today would have exactly this defect. **Worth running
`stddev()` across every factor column before the season, not just those two.**

**And the companion rule from the same section:**
> *"Each enrichment factor should have **`relevant_prop_keys` explicitly declared** (which props it
> applies to) rather than applying blindly — MLB's `defensive_quality_oaa` is correctly scoped this
> way (`["hits","singles","doubles","hits_allowed"]`) — and **this scoping should be EXPLICIT AND
> REVIEWABLE, NOT IMPLICIT IN CODE LOGIC SCATTERED ACROSS FILES.**"*

**NBA implements this as `nba_config.factor_relevance`** — 460 rows of `factor × prop →
full/partial/none`, *"the gate that runs before any tier logic."* **Explicit and reviewable, in a
table, exactly as specified.**

---

## 7j. ⚠ THE ENRICHMENT-DISPLACEMENT DIAGNOSTIC — cheap, and never run on NBA
*Source: T1, blueprint §4a — described as **"a real, dense case study worth internalizing BEFORE
writing the scoring engine."*** Recorded 2026-09-20.

### The finding it produced
> *"MLB ran a real audit that found its scoring engine was **WELL-CALIBRATED AT THE BASELINE LEVEL but
> BADLY OVERCONFIDENT once enrichment factors moved the number away from baseline**."*

### The technique
> *"**Split graded legs by HOW FAR THE ENRICHMENT LAYER MOVED THE FINAL PROBABILITY AWAY FROM THE
> BASELINE MODEL'S OWN NUMBER, then compare predicted-vs-actual SEPARATELY FOR EACH BUCKET.**"*

**The measured result:**
| Bucket | Calibration gap |
|---|---|
| **Baseline-dominated legs** | *"nearly perfectly calibrated — **~1 point gap**"* |
| **Heavy-enrichment legs** | ***"a 5+ POINT OVERCONFIDENCE GAP"*** |

> *"**This SINGLE CHECK immediately LOCALIZES whether a calibration problem lives in the BASELINE MODEL
> or the ENRICHMENT LAYER, WITHOUT DEBUGGING EVERY FACTOR INDIVIDUALLY FIRST.**"*

### ⚠ NBA has every input this needs, and has never run it
**`nba_score.final_hp` carries both numbers on every row**: **`baseline_hp`** and **`final_hp`**, plus
**`cal_shift`**. **The displacement is `final_hp − baseline_hp`, already stored — no computation
required beyond a bucketed group-by against `board_outcomes`.**

**Why it matters here specifically:**
- NBA's measured factor effect is **Brier +0.1–0.3%**, i.e. **the enrichment layer moves the number
  very little on average** — so most legs would fall in the baseline-dominated bucket.
- **But the average is not the question.** The diagnostic asks about the *tail* of displacement — the
  legs the enrichment layer moved **most** — and those are exactly the legs where availability deltas
  fire (`now_out` moves a leg by **0.2640 on average, max 0.9924**).
- **A `now_out` override is the largest displacement the system produces**, and it is applied with a
  **reallocation sensitivity parameter (0.15 per tier) that is ESTIMATED, not measured.**

**So the highest-displacement bucket is also the one with the least-validated parameter.** The
diagnostic is one query and would answer whether that matters.

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 7k. FIVE CONCRETE ENRICHMENT-FACTOR BUG PATTERNS
*Source: T1, blueprint §4a — **"all real, all worth actively checking for in NBA's own factors."***
Recorded 2026-09-20.

### 1. A cumulative/season-total stat used as if it were a per-game rate
> *"**with no division by games played anywhere in the code** — causing **one factor to SWAMP EVERY
> OTHER FACTOR COMBINED**.
> **Tell: check whether a factor's source field name says 'TOTAL' while its consuming code treats it
> as 'PER GAME'.**"*

**Live surface**: **`nba_stats.player_career_season_totals`** (**3,644 rows**) is cumulative by name and content *(🔴 corrected 2026-09-21, §T10.22b — this read `nba_stats.player_career_totals`, which does not exist; and the correct table is the one whose stored self-subtotals are the documented §T4 double-count, so the wrong name pointed a reader away from the very defect)*;
`player_game_log` is per-game. **Any factor reading career totals must divide.**

### 2. One factor's lookup table left UNCAPPED while siblings have explicit caps
> *"**the INCONSISTENCY ITSELF is the red flag; audit cap presence across the WHOLE factor registry AT
> ONCE, not factor-by-factor.**"*

**Live surface**: `nba_config.factor_profile_cells` has dedicated **`cap` / `lift` / `penalty` /
`coefficient`** columns. **A single query — which cells have a null `cap` while their siblings do
not — is the audit this asks for. Not recorded as having been run.**

### 3. Macro-environment MULTICOLLINEARITY — and the RSS fix
> *"several factors **all correlating with the same underlying signal** (e.g. **a market-derived game
> total already prices in park/weather/pace effects that separate factors also try to capture**), so
> **naively multiplying or summing them DOUBLE- AND TRIPLE-COUNTS the same real information**.
> **Fix: RSS (ROOT-SUM-SQUARES) aggregation for a genuinely correlated factor cluster** — this has the
> desirable property of **ZERO DAMPENING when only one factor in the cluster fires (matches its
> individual magnitude exactly)**, with **increasing dampening as more correlated factors stack
> together** — rather than either **naively multiplying (over-counting)** or **arbitrarily zeroing out
> extra factors (under-using real information)**.
> **Keep factors that measure genuinely INDEPENDENT information OUT of this treatment — only
> correlated clusters need it.**"*

**⚠ This is a named, specific solution NBA does not use.** `nba_config.factor_registry` carries
**macro-clusters** (T8: *"layer-tagged, with macro-clusters"*) — **the cluster grouping RSS requires
already exists** — but no RSS aggregation is recorded anywhere.

**And the example is directly live**: the matchup factor uses **market-implied totals**
(`f_impl_own`/`f_impl_opp` = `total/2 ∓ spread/2`), which by this description **already price in
pace and opponent strength** that the pace and opponent-defence coefficients also capture.
**That is the exact multicollinearity named.**

**Note also how RSS relates to the architecture's own solution**: placing blowout/OT/foul risk in the
**minutes model** *"dissolves their correlation"* (T8) — **the same problem solved structurally rather
than by aggregation.** RSS is for clusters that cannot be re-homed that way.

### 4. A factor showing the IDENTICAL contribution across wildly different cases
> *"e.g. **an elite player and an average player getting the EXACT SAME adjustment** — **a sign the
> factor is simply HITTING ITS OWN CAP for nearly everyone, NOT ACTUALLY DISCRIMINATING**, even though
> **the code 'RUNS' WITHOUT ERROR.**"*

**The sibling of the zero-variance bug**: near-zero *effective* variance caused by a cap, rather than
by the input. **The `stddev()` check would NOT catch this** — the factor values differ upstream; the
contributions do not. **The check is on the CONTRIBUTION, not the input.**

**`final_hp`'s enrichment record stores per-factor contributions in `breakdown`**, so this is
measurable: **distinct contribution values per factor.**

### 5. AMPLIFYING, rather than shrinking, a thin-sample signal
> *"Standard, correct statistical practice **always shrinks a thin-sample estimate toward a prior**;
> MLB found a real case **doing the OPPOSITE — multiplying a signal UP for players with LIMITED GAMES
> PLAYED** — justified by a 'validation' that **only proved the signal CORRELATED with outcomes —
> which is SCALE-INVARIANT and would show the same correlation whether the true correction should
> SHRINK or AMPLIFY.**
> **Correlation with outcomes proves a signal CARRIES INFORMATION; it does NOT by itself prove WHICH
> DIRECTION OR MAGNITUDE of adjustment is correct — that needs its own, SEPARATE validation.**"*

**The scale-invariance point is the sharp one**: a correlation check cannot distinguish "shrink this"
from "amplify this", so passing it proves nothing about the adjustment's direction.

**NBA's structural defence is strong here** — empirical-Bayes shrinkage *"genuinely decays to zero as
a player's sample grows"*, and the per-prop `k_stab` values are **measured** (STL k=125, TOV k=60,
*"top-decile steals players regress 17% over the next 20 games"*). **Direction and magnitude were both
validated separately, which is exactly what this pattern demands.**

---

## 7l. TWO OPERATIONAL DISCIPLINES
*Source: T1, blueprint §4a. Recorded 2026-09-20.*

### 1. Verify you are looking at data generated AFTER the fix deployed
> *"**Before re-diagnosing an apparently-still-present issue, verify you're looking at FRESH DATA
> GENERATED *AFTER* THE RELEVANT FIX DEPLOYED, not stale data from before it.** MLB **nearly wasted
> real effort RE-FINDING ALREADY-FIXED BUGS** because **the scoring pipeline hadn't been RE-RUN since
> a fix shipped.**"*

**This is the stale-output trap, and it recurs throughout the NBA build** — every instance of
*"the patch aborted on an assertion; the file wasn't modified, so that output is the OLD run"* (T8,
T9) is the same failure caught in time. **The NBA habit of checking whether a patch actually applied
before reading numbers is this discipline in practice.**

### 2. Input-side correct ≠ output-side improved
> *"**Confirming a fix looks STRUCTURALLY CORRECT ON THE INPUT SIDE (bad values gone, caps behaving,
> no more amplification) is NOT the same as confirming THE OUTPUT SIDE ACTUALLY IMPROVED** — that
> **requires waiting for real games to be played and graded**. **Don't conflate the two; STATE
> EXPLICITLY WHICH ONE YOU'VE VERIFIED.**"*

**Directly applicable to the current state of this system.** Almost everything verified so far is
**input-side**: the season fix holds, the mixture is configured, the ladder reproduces exactly, the
availability delta produces no NaNs. **Output-side improvement cannot be confirmed until real games
are graded** — which is the same boundary as lesson #16's real-quote confirmation and the §18 sample
posture (*"fewer than 15 real days is not yet a result at all"*).

**The instruction is to state which one** — so, explicitly: **the NBA system is verified input-side
and calibrated against history; no output-side improvement claim is available until the season
grades.**

### ⚠ A calibration-specific instance of the "file name / liveness" trap
> *"**A worker's own health-check response can explicitly SELF-REPORT AS DEAD/DEPRECATED while its
> FORMULAS STILL REPRESENT THE REAL DESIGN LINEAGE the currently-live replacement is based on** —
> **informative to read, bu[t not the live logic]**."*

**This is the three-generation trap from T7 seen from the other side.** There, two MLB classification
files declared themselves *"CONFIRMED DEAD — do not build on this"* and the live one was a function
name (`runClassificationBaselineV6ToPostgres`). **Here the blueprint adds the nuance: a dead file is
still worth READING for design lineage — it is only worth not PORTING.**

**Both halves matter**: T7 read the live function line by line *and* correctly identified the dead
ones — *"porting from either dead version would have locked in wrong logic."*

---

## 7m. TWO DIAGNOSTIC-ONLY SAFEGUARDS, SPECIFIED FOR DAY ONE
*Source: T1, blueprint §4b. Recorded 2026-09-20.*

> *"**Two DIAGNOSTIC-ONLY (NEVER AUTOMATICALLY ACTING) safeguards worth building into NBA's scoring
> engine FROM DAY ONE, since they DIRECTLY TARGET THE EXACT FAILURE CLASSES documented elsewhere in
> this package.**"*

**"Never automatically acting" is part of the specification** — these surface problems; they do not
correct them.

### Safeguard 1 — the coverage-gap check
> *"**a coverage-gap check that surfaces any (PROP, SIDE, HIGH-CONFIDENCE BUCKET) combination showing
> a real, RESOLVED-OUTCOME DEVIATION past a threshold WITH ZERO ACTIVE CORRECTION COVERING IT** —
> **this is precisely the mechanism that would catch A SILENT FORMULA/CALIBRATION REGRESSION BEFORE IT
> RUNS FOR WEEKS UNDETECTED** (see the fantasy-score-formula saga)."*

**The key is the conjunction**: a real deviation **AND** no cell covering it. A deviation with a cell
is handled; a deviation with **no** cell is a blind spot.

**NBA has both halves of the input**: `board_outcomes` (6.9M graded legs, keyed prop/side/line) and
`factor_profile_cells` (35 fitted cells against a 460-row relevance matrix). **The 35-vs-460 gap is
exactly the surface this check would scan.**
**Not recorded as built.** And the stated purpose — catching a **silent calibration regression before
it runs for weeks** — is the failure mode an unattended season-long pipeline is most exposed to.

### Safeguard 2 — the role/context-discontinuity check
> *"**a role/context-discontinuity check that FLAGS when a player's MOST RECENT REAL PERFORMANCE
> CONTEXT DIFFERS SHARPLY FROM THEIR TRAILING SAMPLE** — e.g. **a bench player suddenly starting, a
> return from a long injury layoff** — **surfacing the real risk that A BASELINE SAMPLE MIXES AN OLD,
> NO-LONGER-RELEVANT CONTEXT WITH THE CURRENT ONE.**"*

**⚠ NBA built the CORRECTION but not the FLAG.** The engine already *acts* on both named cases:
| Named case | NBA's handling |
|---|---|
| *"a bench player suddenly starting"* | the **team-change discount** and the T7 **role-change detector** (starter flag flips 2+ games, or 3-game mean >3σ, or a trade → reset the window) |
| *"a return from a long injury layoff"* | the **return ramp** (A3) — measured multipliers by games missed |

**But the specification is for a DIAGNOSTIC that flags**, precisely because the correction may be
wrong. **A silently-applied window reset on a misread context produces a confident wrong number**, and
nothing surfaces it. *(This is the same concern as tier misclassification being "a quiet, indirect
source of a wrong final probability."*)

**Both safeguards are diagnostic-only by design, and neither is recorded as built.**

---

## 7m2. ⚠ AN HONEST OUT-OF-SAMPLE PASS IS **NECESSARY BUT NOT SUFFICIENT** — never auto-apply a correction
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§7f** — "a profound calibration lesson."*
***Recorded 2026-09-20 (T1 pass 29).***

**⚠ SELF-CORRECTION, same day, same pass.** This section was first written stating that blueprint §7f
was *"previously unswept."* **That was wrong, and it is corrected here rather than quietly edited.**
**§7f is already recorded — thoroughly — at `NBA_BASELINE_CALIBRATION.md` §5.6**, including the
verbatim case, the prescribed rule, the weekly-recalibration cadence, and a **VERIFIED code check**
(grep of the ladder calibration code, 2026-09-20) establishing that **NBA is structurally protected**:
the calibrated quantity is `p_over` and `p_less = 1 − p_more` by construction, so **there is no
separate Less population to be dominated**, and `offset` (the rung) is already in the fit key.
**Read §5.6 first — it is the primary record.**

**What is genuinely new in this pass, and why this section stays:**
1. **The cost precedent** — *"two props running with zero active correction for roughly two and a half
   weeks… 30–45 percentage point overconfidence gaps, undetected until someone manually checked"* —
   **not recorded anywhere before this pass.**
2. **The explicit causal link from §7f to the coverage-gap diagnostic** (§7m Safeguard 1). The
   blueprint states the precedent *"directly motivated"* it. The two were recorded as separate items.
3. **The enrichment-side application.** §5.6 answers the question for the **baseline Platt fit**.
   The **as-of calibration table that the enrichment layer consumes** is keyed
   `(season, as_of_date, prop, phase, band, side)` — **`side` is a real, populated dimension there**,
   which is a different exposure from the baseline's.

**The case, verbatim:**
> *"MLB found a real, concrete case where a statistical calibration fit genuinely **PASSED HONEST,
> HELD-OUT, OUT-OF-SAMPLE VALIDATION** (it beat both the raw baseline and a standard calibration
> method on real held-out error metrics) **and was still STRUCTURALLY WRONG** — the fit had been
> computed **WITHOUT DISTINGUISHING BETWEEN TWO SIDES OF A MARKET (over/under)**, and ended up
> **DOMINATED BY ONE SIDE'S PATTERN, SILENTLY MISAPPLIED TO THE OTHER SIDE**. The aggregate
> improvement metric **DID NOT CATCH THIS, because it was AVERAGED ACROSS BOTH SIDES.**"*

**The rule it produces**, stated in the source as *"a directly transferable, important lesson for
NBA's own calibration loop"*:
> *"an aggregate validation metric passing is **necessary but not sufficient** — always check whether
> a proposed correction is genuinely appropriate for **EVERY MEANINGFULLY DISTINCT SUBGROUP IT WILL BE
> APPLIED TO** (e.g. both sides of a market, every relevant tier), not just the pooled average, and
> **KEEP A HUMAN REVIEW STEP BEFORE APPLYING ANY CALIBRATION CORRECTION even when it has technically
> passed validation.**"*

**The operating cadence it recommends** — converged on from external ML model-monitoring research and
named in the blueprint as *"a concrete operational recommendation worth adopting directly"*:
> *"**WEEKLY RECALIBRATION CHECKS, with TRIGGER-BASED RE-FITTING and MANDATORY HUMAN REVIEW BEFORE
> APPLYING — NOT FULL UNATTENDED AUTOMATION.**"*

**The cost of not having it** — MLB's own precedent, stated as real and costly:
> *"two props running with **ZERO ACTIVE CORRECTION for roughly TWO AND A HALF WEEKS** after a
> root-cause fix, showing real **30–45 PERCENTAGE POINT OVERCONFIDENCE GAPS**, undetected until
> someone manually checked"*

— and the blueprint states this is what **directly motivated the coverage-gap diagnostic** recorded
above at **§7m, Safeguard 1**. The two sections are one design, split across the blueprint.

### What §7f means for NBA specifically
- **NBA's calibration refit is an unattended nightly step inside P2.** §7f's rule is that a
  correction must not be auto-applied on an aggregate pass alone. **Whether any per-subgroup check or
  human-review gate exists in the NBA refit is NOT RECORDED as built** — logged in
  `NBA_OPEN_ITEMS.md` under *FROM T1 PASS 29*.
- **NBA's subgroup dimensions are already enumerated by its own schema.**
  `nba_score.ladder_calibration_asof` is keyed `(season, as_of_date, prop, phase, band, side)`.
  **`side` is precisely the dimension MLB's failed fit collapsed.** A refit validated only on the
  pooled average across `side` would reproduce the documented failure exactly — and `phase` and
  `band` are two further subgroups the same argument covers.
- **Goblin/demon lines create further distinct subgroups inside a single prop** (a demon `More` and a
  goblin `Less` on the same player-prop are not one population) — see `NBA_GOBLIN_DEMON.md`.
- **Evidence tier**: this is a **transferred MLB finding as stated in T1**. It is **NOT RECORDED** as
  measured on NBA data, and no NBA instance of the failure has been observed or looked for.
- **Cross-reference**: this is the calibration-side twin of lesson **#2** (*"never apply a
  tier/pool-level multiplier to a heterogeneous population"*) — §7f is the same error committed by a
  *fit* rather than by a *multiplier*.

---

## 7n. THE OUTCOME-GRADING ENGINE — isolation design
*Source: T1, blueprint §4c. Recorded 2026-09-20.*

### Isolation-by-design as a SAFETY PROPERTY, not an accident
> *"The grader **ONLY EVER READS from historical board/game-log tables** and **ONLY EVER WRITES to a
> DEDICATED OUTCOME-HISTORY TABLE** — **it NEVER touches any table the LIVE BOARD-SERVING PATH
> reads.**
> **This means a bug in the grader CANNOT CORRUPT TODAY'S LIVE BOARD; its BLAST RADIUS is limited to
> producing wrong or missing *TRAINING* data**, which **a SEPARATE DOWNSTREAM VALIDATION STEP checks
> BEFORE any calibration correction is ever applied.**
> **Build NBA's outcome grader with this same isolation FROM DAY ONE — a real, LOAD-BEARING SAFETY
> PROPERTY, not an afterthought.**"*

**✅ NBA's grader has the read side right**: `grade_board_outcomes.py` reads `board_snapshots` and game
logs, writes `nba_market.board_outcomes` (6.9M legs) — a dedicated outcome table.

> 🔴🔴🔴 **BUT ITS DEFAULT WINDOW ENDS `2026-04-12`, AND P2 NEVER OVERRIDES IT — `T20-5`, the OPENING-DAY BRIEF's *only* `SILENT` blocker.** *Added here T20 pass 78 (§T20.83), 2026-09-22, because **this page previously opened its grader section with the green check above and said nothing about the window** — and a person fixing the grader reads this page, not the open-items list.* ▶ **`grade_board_outcomes.py:167–168`**: `GRADE_START "2024-10-22"` · **`GRADE_END "2026-04-12"`** — *and **`GRADE_START`, `GRADE_END`, `RUNG_FROM`, `RUNG_TO` appear in NONE of `nba-p1/p2/p3`**, so the defaults are what run.* 🔴 ***On opening night the grader's window has already closed: it will grade nothing and report success.*** ⚠ **SILENT — no certifier check covers it.** ▶ **Full item, evidence and severity: `T20-5` in `NBA_OPEN_ITEMS.md` (`[LIVE-AUDIT]` §T20.36); re-derived and HELD at §T20.75.** ⚠ *Documented, not fixed (rule 1).*

**⚠ But the blast radius is NOT fully contained, because of P2's ordering.** The pipeline runs
**grade (step 3) → … → calibration refit (step 14)** in the same workflow, and the refit writes
`ladder_calibration_asof`, which **`build_final_hp.py` reads on the next run.**

**So the path from grader to live numbers exists**: bad grades → bad `log_odds_shift` → bad
`final_hp`. **The isolation the blueprint describes depends on the second clause — *"a separate
downstream validation step checks before any calibration correction is ever applied"* — and no such
validation step between grading and the refit is recorded.**

**The ordering itself is correct and deliberate** (*"grading must run before the refit, or yesterday's
evidence is invisible to today's cells"*). **What is missing is the check between them.**

### Map every canonical prop to an explicit expression against raw game-log columns
> *"e.g. **a composite fantasy-score prop as an EXPLICIT WEIGHTED SUM of raw counting stats** — **keep
> this map IN ONE PLACE, VERSIONED**, and **FLAG any prop whose scoring formula HASN'T BEEN
> INDEPENDENTLY VALIDATED against a confirmed, authoritative spec AS A KNOWN, EXPLICIT GAP rather than
> silently trusting an assumed formula** — **this is the EXACT MECHANISM that would have caught the
> FANTASY-SCORE FORMULA BUG much earlier.**"*

**NBA has the map in two places, not one:**
| Location | Contents |
|---|---|
| `nba_ref.prop_taxonomy` (28 rows) | the canonical prop list |
| **`norm_market()` in `score_board_legs.py`** | board key → our prop name |
| `classification_ladder_v12.py`'s `PROPS` | prop → **source column** (`"col": "PF"`, `"col": "FGM"`) |

**The `PROPS` config IS the expression map for singles** — each prop names its raw game-log column.
**Combos and `fantasy_score` are where the explicit weighted sum lives, and that is the one flagged by
this rule**: the scale `1 / 1.2 / 1.5 / 3 / 3 / −1` was **validated against all three apps in T9** —
so **NBA did the validation this asks for**, though the result is recorded in a transcript rather than
versioned beside the map.

**The instruction not followed**: *"flag any prop whose formula hasn't been independently validated
**as a known, explicit gap**."* **`double_double` (sentinel −1.0), `stocks`, and the period props do
not carry such a flag.**

---

## 7o. BENCHMARK THE FACTOR LIST AGAINST A REAL, VERIFIED SYSTEM
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> *"**Benchmark the planned factor list against REAL, PUBLICLY-VERIFIED SYSTEMS BEFORE FINALIZING
> it.** MLB checked its own factor list against **a real, independently-verified industry-leading
> system (a widely-used, real-track-record MLB projection product)** and **adopted SEVERAL CONCRETE
> REFINEMENTS from studying HOW THAT SYSTEM ACTUALLY IMPLEMENTS THINGS**:
> — **MATCHUP-SPECIFIC rather than TEAM-AGGREGATE defensive metrics**
> — **treating 'QUALITY OF SURROUNDING LINEUP' as a DISTINCT INPUT from a player's own slot number**
> — **ROLE-SPECIFIC ADJUSTMENTS for players who DON'T FIT A STANDARD USAGE PATTERN**
> **For NBA, do the equivalent.**"*

### The three refinements, mapped to NBA
| MLB refinement | NBA state |
|---|---|
| **Matchup-specific, not team-aggregate, defensive metrics** | ✅ **M1** — the two-way ridge defender ratings (111,768) are per-defender, **not** team DvP. ⚠ But wired **only in the INTERACTION form, never as a main effect**, and `defense_vs_position` (team-aggregate) is what most props read |
| **"Quality of surrounding lineup" as a DISTINCT input** | ⚠ **Partially.** **`nba_team.lineup_profile`** (8,000 rows) and `teamplayeronoffdetails` exist; *(🔴 corrected 2026-09-21, §T10.22b — this read `nba_stats.lineup_synergy`, which exists in no schema; the live table is `nba_team.lineup_profile` and its row count is exactly the 8,000 stated, which is what identifies them as the same object)*; the factor lock names *"teammate shooting quality"* as the assists penalty. **But A2 (teammate redistribution) was retracted, and no surviving lineup-quality factor is recorded** |
| **Role-specific adjustments for players who don't fit a standard usage pattern** | ✅ **`ROLE_TIERS`** is exactly this — six bands on projected minutes, with **FRINGE** as the explicit non-standard bucket, plus the **discontinuity override** for role changes |

**Two of three landed. The middle one is the gap** — and it is the one the research independently
flagged: T7's factor lock lists **"teammate shooting quality"** as a primary assists driver and
**"teammate competition / lineup geometry"** as a primary rebounds driver. **Neither is recorded as a
built, surviving factor.**

### ⚠ The benchmarking itself was never done for NBA
**The instruction is to check the factor list against a real, verified projection system and adopt
refinements from HOW IT IMPLEMENTS things** — not from its conclusions.

**NBA's research was source-rich but not system-benchmarked**: OpticOdds, Unabated, DataStreak,
RotoGrinders, Cleaning the Glass, peer-reviewed papers, Gemini. **All of these are sources of
findings; none is a working projection system whose implementation was studied.**

**The named MLB benefit was implementation detail** — *"studying how that system actually implements
things"* produced the matchup-specific-vs-aggregate distinction, which is precisely the kind of
structural choice a paper does not give you. **NBA has public equivalents available** (DARKO is already
used as a data source, and its methodology is published).

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 7p. TWO BUILD-DISCIPLINE PRINCIPLES
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> ⚠ **STATUS 2026-09-20 (T1 pass 36): this principle is NOT HOLDING in NBA.** **VERIFIED** by grep of
> all 190 `.py`/`.js` files plus the MCP admin bridge: **`nba_config.factor_registry` (67 rows),
> `factor_relevance` (460), `factor_profile_cells` (35) and `classification_config` are read by
> NOTHING** — those strings appear zero times in the codebase. `factor_profile_cells` is documented as
> holding *"the fitted lifts/penalties, in exactly MLB's cell form"*; **no code loads them.** The only
> `nba_config` table anything reads is `external_credentials`.
> **The principle below is the design. It is not the live behaviour.** Full entry, with a measured
> config-vs-code diff on the decay parameters: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.

### 1. Every tunable parameter gets its OWN DATABASE COLUMN
> *"**Every tunable numeric parameter gets its OWN DEDICATED DATABASE COLUMN, NEVER embedded as a
> LITERAL NUMBER INSIDE AN OPAQUE FORMULA-EXPRESSION STRING** — **this is what actually LETS A
> CALIBRATION LOOP ADJUST ONE SPECIFIC VALUE DIRECTLY rather than needing to PARSE AND REWRITE A
> FORMULA STRING.**"*

**This is the mechanical reason behind the owner's no-hardcoding rule**, and it is stronger than
"config is tidy": **a calibration loop cannot tune what it cannot address.** A value inside a formula
string is unreachable to an automated adjuster.

**✅ NBA follows it** — `factor_profile_cells` has **dedicated `cap` / `lift` / `penalty` /
`coefficient` columns**, and `stat_decay_config` gives each of `ewma_alpha`,
`min_lookback_games` and `shrinkage_stabilization_games` its own column.

**⚠ Where it is violated**: the certified recipes hold `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`,
`SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN` and `LADDER_DEPTH` **as Python literals**.
They are env-overridable, **but not addressable by a calibration loop** — which is precisely the
capability this principle exists to preserve.

### 2. ⚠ AN UNAVAILABLE FACTOR MUST SAY SO — never a silent zero
> *"**When a factor CANNOT BE HONESTLY IMPLEMENTED because the real underlying data DOESN'T EXIST
> YET, SAY SO EXPLICITLY IN THE SYSTEM ITSELF** — **a clearly-labelled 'NOT YET AVAILABLE, NO VERIFIED
> DATA SOURCE' status** — **rather than APPROXIMATING IT WITH A GUESS or SILENTLY LEAVING IT AS A
> MISLEADING ZERO.**
> MLB found and named several such honest gaps: **an umpire-tendency factor HARDCODED TO AN EXPLICIT
> 'UNAVAILABLE' STATUS**, **a wind-direction factor BLOCKED ON MISSING PARK-ORIENTATION REFERENCE
> DATA** — **rather than faking plausible-looking values for either.**"*

**⚠⚠ NBA has the exact situation the umpire example describes, and it is NOT labelled.**
| Factor | State | Labelled? |
|---|---|---|
| **Altitude** | `arenas.altitude_ft` — **0 of 30 populated** | ❌ **no status; the column is simply empty** |
| **Jet lag / travel direction** | `arenas.timezone` — **0 of 30 populated** | ❌ no status |
| **D1 — referee tendency** | capture built, **0 rows until the season** | ⚠ *known* to be empty, but no explicit status field |
| Tier C props (first basket, high scorer) | *"need play-by-play we don't have"* | ✅ **correctly excluded from the taxonomy entirely** |

**An empty column and a declared "unavailable" status are different things.** A factor reading an
empty column produces **a silent zero or a NaN** — which is exactly the *"misleading zero"* named here,
**and exactly what the `stddev(factor_value) > 0` check exists to catch.**

**The MLB precedent is the model**: the umpire factor was **hardcoded to an explicit `unavailable`
status** — present in the registry, visibly not contributing, impossible to mistake for a measured
zero. **`nba_config.factor_registry` has 67 rows and could carry the same field.**

---

## 7q. THREE STANDING SEARCH / EVALUATION DISCIPLINES
*Source: T1, blueprint §4f — "two real, honest self-corrections worth adopting as standing search
disciplines." Recorded 2026-09-20.*

### 1. ⚠ "I searched every worker file I could think of" ≠ "I searched everywhere functionality could live"
> *"MLB found a real case where **an initial, CONFIDENT claim that 'NO AUTOMATED MINING WORKER EXISTS'
> for a specific data source WAS WRONG** — **the actual mining logic existed as AN INTERNAL STEP
> INSIDE A LARGER, DIFFERENTLY-NAMED RUNNER FILE, INVISIBLE TO A FILE-NAME-PATTERN SEARCH.**
> **Before concluding a piece of functionality DOESN'T EXIST anywhere in the NBA codebase, CHECK THE
> INTERNAL STEP LISTS OF LARGER RUNNER/ORCHESTRATOR-STYLE FILES TOO, not just file names that sound
> like they'd contain it.**"*

**⚠ This bears directly on several open items in this documentation.** Conclusions of the form *"X is
not recorded as built"* rest on transcript reading and targeted greps. **The named failure is
precisely a confident negative about a worker's existence.**

**Specific NBA cases where the functionality could be hiding inside a larger file:**
| Open conclusion | Where it could still live |
|---|---|
| *"no validation step between grading and the refit"* | inside `build_asof_calibration.py` itself |
| *"no magnitude sanity check on the fitted shift"* | inside the same refit script |
| *"no RSS aggregation"* | inside `build_final_hp.py`'s combination step |
| *"the P1 loader question"* | inside a writer Worker's own cron/`scheduled()` handler |
| *"dud mixture not implemented"* | ✅ **this one WAS checked by grep of the actual recipe** — 0 matches for `dud|mixture|p_dud` |

**The discipline to apply before treating any of these as settled**: read the internal step list of
the relevant runner, not just search for a file named after the function.

### 2. ⚠ Never assume a field name transfers across data providers
> *"MLB found a real case where **a mining plan was built around A SPECIFIC EXPECTED COLUMN NAME from
> ONE PLATFORM'S PUBLIC TERMINOLOGY**, and **had to be corrected once the ACTUAL TARGET PLATFORM'S
> REAL, LIVE COLUMN LIST WAS CHECKED DIRECTLY** and found to use **DIFFERENT TERMINOLOGY WITH A
> GENUINELY DIFFERENT DEFINITION — NOT JUST A RENAME, A DIFFERENT UNDERLYING CALCULATION.**
> **Before building ANY NBA data-mining pipeline around an assumed field from a new data source,
> VERIFY THE ACTUAL, CURRENT COLUMN/FIELD LIST DIRECTLY AGAINST THAT REAL SOURCE**, not against
> terminology borrowed from a different platform or from memory."*

**✅ NBA learned this the hard way, repeatedly, and the record is consistent with the warning:**
- *"**Documented columns may simply not exist any more** — dump the real response before patching a
  parser"* (`ARENA`/`ARENACAPACITY` gone from the standings endpoint)
- **The team advanced table has no `usg_pct`/`reb_pct`** — the mapper wrote nonexistent columns
- **The bio file uses `players`/`player_id`/`age`, not `records`/`PLAYER_ID`/`AGE`** — every age NaN
- **`leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list**

**The stronger half of the warning is "not just a rename — a different underlying calculation."**
That is the **prop-definition mismatch** problem (lesson #14) applied to source fields rather than to
props: **the same name can mean a different computation.**

### 3. Check a candidate factor for REDUNDANCY before building it
> *"**Explicitly CHECK FOR REDUNDANCY with what already exists**:
> **(a) is the proposed new signal ACTUALLY JUST A NOISIER PROXY for an outcome the system ALREADY
> MEASURES DIRECTLY** (in which case adding it **contributes little**)?
> **(b) does REAL PUBLISHED RESEARCH show combining it with an existing signal ACTUALLY ADDS
> PREDICTIVE VALUE — OR NOT?**
> **(c) is its INTENDED EFFECT ALREADY IMPLICITLY CAPTURED BY A DIFFERENT, ALREADY-EXISTING
> MECHANISM?** — MLB found **a real case where a proposed new signal's ENTIRE BENEFIT was already
> captured by an existing mechanism APPLIED EARLIER IN THE PIPELINE, making the new signal GENUINELY
> redundant, not just partially so.**
> **Run this evaluation EXPLICITLY for EVERY NBA factor candidate BEFORE building it** — **several
> real, well-reasoned rejections came DIRECTLY out of this discipline, NOT from skipping factors
> arbitrarily.**"*

**Three distinct questions, and (c) is the one that caught NBA's factors.** *"Already captured by a
different mechanism **applied earlier in the pipeline**"* describes every rejection:
| Factor | Earlier mechanism that already captured it |
|---|---|
| **A5 — lineup change** | *"the allocator's **recent-5 minutes already encode starting**"* |
| **A3 — return ramp** | applied in the **baseline** as a minutes multiplier |
| **home / back-to-back** | *"**the minutes model already carries them**"* — measured ≈0 |
| **A2 — teammate redistribution** | the baseline's own minutes history |
| **B4 — opponent availability** | closed in three formulations, 0 of 5 props |

**Note (b) specifically asks whether published research supports the COMBINATION, not the factor
alone** — a factor with real standalone support can still add nothing on top of what exists. **That is
the two-test paradox (§7e) as a pre-build question rather than a post-hoc measurement.**

**Applying (a)–(c) BEFORE building would have saved the five A2 panels and the three B4
formulations.** Three questions, cheaper than every gate run they replace.

---

## 8. THE TWO NON-NEGOTIABLE FACTORS THAT DID LAND

### 8.1 Blowout — on the REAL market spread
Upgraded from the **r=0.46 derived proxy** to the **real market spread** *(🔴 **the coverage figure below is
corrected 2026-09-21 by §T11.12b: 2,454 of the 2,460 games in `nba_market.schedule_norm` is
**99.76%**, not 100% — the "100%" counted the games that were MAPPED, i.e. a denominator taken from
the numerator's own table. Six games are unmapped, and `game_lines_closing` is shorter still at
2,410 = 97.97%. The measurements themselves are unaffected in kind; the sample is 99.76% of the two
seasons rather than all of them.*)* (307,604 rows, 2,454 games,
~~100% coverage~~ 🔴 **99.76% — the literal struck here 2026-09-22 (§T20.55) to match
`NBA_DATABASE.md:1783`, which struck it on 2026-09-21.** *The correction note above this line has
been correct since §T11.12b; what was missing was the strike on the figure itself, so the literal
survived both a skim and a grep.* 📌 *Rule 40: a correction is not complete until the OLD LITERAL
stops being asserted — an annotation beside it is not a strike through it.*).
- A **13+ favourite blows the game open 39.7%** vs **0.4%**
- **Winning blowouts cost starters MORE minutes than losing ones** (ratio 0.8748 vs 0.9124)
- **Competitive games run starters +3.3% ABOVE baseline** (`v1 = 1.0333`)

**⚠ DataStreak's "the favourite's starters hit hardest" did NOT reproduce on our data** — favoured
starters **47.7%** over-rate, underdog starters **39.4%**. *"The losing side is benched **and** played
badly to get there."* **Minutes-wise the favourite is hit harder; outcome-wise the underdog is.**
The engine keys on **minutes**, so it captures the real mechanism.

### 8.2 Matchup — via market-implied totals
**`f_impl_own` / `f_impl_opp` = `total/2 ∓ spread/2`.**
**r = 0.4637 vs 0.2364 for the derived form** — the market-implied version is nearly twice as
correlated.

**This is step 5 of the T4 methodology** (*"anchor to team-implied totals… a real fix a practitioner
reported needing after getting 'wild numbers' from unanchored projections"*), shipping twelve
transcripts later.

---

## 9. SCENARIO PRECOMPUTE — measured, then dropped as a daily job

**`nba_score.scenario_realised`** — 1,942 rows; **only the realised branch is stored**.
**The finding stands**: with three uncertain players, **the most-likely branch is right only ~17% of
the time.**

**Dropped as a daily job** once the cutoff collapsed to one window: *"enumerate every availability
branch now, SELECT the realised one at a later window"* has no selector with a single window, so
enumeration (~0.5–1M rows/day) is pure cost. **N1 probability-weighted availability carries the
residual uncertainty instead.**

---

## 10. DATA FRESHNESS — dropped, with a reason

At a **single 1:15 PM PT cutoff every leg carries the same report generation**, so a freshness term
**penalises uniformly and discriminates nothing**. The uncertainty it would proxy for is already priced
by N1. **Late tips do get more post-cutoff amendment, but those amendments are unusable when slips are
placed once at ~1:30.**

---

## 11. BOARD SCORING — what actually gets scored

**`nba/score_board_legs.py` → `nba_score.board_scored`** (~58k legs/day).
`game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id, baseline_hp,
cal_shift, final_hp, confidence, score, edge, interpolated, built_at`.

**BOARD-SCOPED**: every leg the apps actually **offer** — all rungs, both directions,
goblins/standards/demons — **not** the full internal ±10 ladder for rungs nobody offers.
**Off-ladder rungs are interpolated in log-odds and FLAGGED** (−4 confidence).

**⚠ `norm_market()` — the mapping that nearly cost 44% of the board.**
`replace(market_key,'player_','')` yields `points_rebounds_assists`, which matches nothing (we call it
`pra`). **Six groups — 23,286 legs, 44% — would have scored NOTHING, silently.**
| Board key | Our prop |
|---|---|
| `player_points_rebounds_assists` | `pra` |
| `player_points_rebounds` | `pts_reb` |
| `player_points_assists` | `pts_ast` |
| `player_rebounds_assists` | `reb_ast` |
| `player_blocks_steals` | `stocks` |
| `player_threes` | `threes_made` |
| `player_fantasy_points` | `fantasy_score` |
| `player_double_double` | `double_double` (sentinel −1.0, no ladder) |
| period keys | `points_q1`, `rebounds_q1`, … |

---

## 13. THE VALIDATION GATE FOR ANY STRATEGY *(T1, inherited from MLB's lessons document)*

### 13.1 It must be a **DAY-LEVEL BLOCK BOOTSTRAP** — and properly VOLUME-WEIGHTED

**Lesson #6 is stated as *"one of the single highest-value lessons from the entire research
program"*, and it errs in BOTH directions.**

#### Direction 1 — pooled-leg significance is inflated
> *"**Treating same-day legs as independent observations when computing standard error INFLATES
> APPARENT SIGNIFICANCE BY 3–5×**, because **legs within a day are correlated (a strong slate lifts
> everything together)**. Multiple cases of **a pooled Z-score of 3–5+ collapsing to a clustered
> t-statistic under 1.5** once properly clustered by day.
> **Always compute significance at the DAY level — treat each day as one observation, N = number of
> DAYS, not number of legs.**"*

#### Direction 2 — an UNWEIGHTED day-level test causes FALSE REJECTIONS
> *"**But a naive, UNWEIGHTED day-level test — treating a 7-leg day and a 38-leg day as equally
> informative observations — is itself a real, CONFIRMED SOURCE OF FALSE REJECTIONS**, not just a
> conservative simplification: **a real case where an unweighted daily t-test FAILED (t = 1.573) on
> data where a VOLUME-WEIGHTED version of the identical test PASSED DECISIVELY (t = 2.755)** — **an
> adversarial review caught this specific flaw.**
> **The correct method WEIGHTS each day's contribution.**"*

| Method | Error |
|---|---|
| Pooled at leg level | **inflates significance 3–5×** → false positives |
| Day level, **unweighted** | **t = 1.573 vs 2.755** on identical data → **false rejections** |
| **Day level, volume-weighted** | correct |

**⚠ This is the second recorded instance of over-strictness as a real error** — lesson #9 names the
same asymmetry from the other side. **Neither direction is the safe default.**

**Consequence for the bootstrap**: resample **entire days with replacement** — *"never individual
legs, which would reintroduce the same-day correlation problem"* — **and weight each day by its
volume.**

**The method, exactly as stated:**
> *"**The correct method WEIGHTS EACH DAY'S CONTRIBUTION BY ITS REAL LEG VOLUME when computing the
> day-level mean AND variance**, not by treating every day as an equal-weight data point.
> **Use day-level clustering to avoid PSEUDO-REPLICATION, but WEIGHT DAYS BY VOLUME WITHIN that
> clustering — doing only ONE HALF of this correctly can produce a wrong answer IN EITHER
> DIRECTION.**"*

**Both halves are required, and they guard different errors:**
| Half | Guards against |
|---|---|
| **Day-level clustering** | **pseudo-replication** — inflated significance (3–5×) |
| **Volume weighting within the clustering** | **false rejection** — t = 1.573 vs 2.755 |

**And the bootstrap is the stated successor**: *"the current, more rigorous standard **beyond a simple
weighted t-test**: a day-level block bootstrap."* **So the weighted clustered t-test is the floor, not
the target.**

### 13.2 The three conditions — all of them, not any one
> *"**The decisive gate: at least 95% of resamples positive, a 95% confidence interval whose lower
> bound sits ABOVE the breakeven point, and a leave-one-day-out check that never goes negative
> excluding any single day. ALL THREE CONDITIONS TOGETHER, not any one alone.**"*

| Condition | Guards against |
|---|---|
| **≥95% of resamples positive** | a result driven by ordering or a lucky run |
| **95% CI lower bound ABOVE breakeven** | a positive mean not distinguishable from break-even |
| **Leave-one-day-out never negative** | **a single day carrying the whole edge** |

**The third is the one most often skipped and most often fatal** — one outlier slate can make a season
look profitable.

### 13.3 The companion sanity test
From the multiplier work (`NBA_MULTIPLIERS.md` §0.3): compute `p × m`. If it implies the platform is
handing out a systematic edge on a liquid, repeatable line, **the multiplier attribution is wrong, not
the market.**

**Two real failure examples from MLB, both caught this way:**
- a result that *"**implied a payout below breakeven for even the highest-quality legs available — an
  absurd, unusable outcome**"*
- a result that *"**implied a selectivity that didn't actually exist**"*

**Status**: this gate applies to the **slip-strategy phase**, which has not begun. Nothing in the
baseline or scoring calibration has been through it, because it measures **profitability**, not
**honesty** — and calibration is the honesty property (§9).

---

## 14. THE STATISTICAL STANDARD, CONSOLIDATED

Every guard across both calibration documents, in the order they must be applied:

| # | Guard | Source |
|---|---|---|
| 1 | **Verify the factor has variance** — `stddev(factor_value) > 0` | T1 — *"cheap, and MLB never did it proactively"* |
| 2 | **Declare `relevant_prop_keys`** — never apply blindly | T1 → `factor_relevance`, 460 rows |
| 3 | **Fix leakage** — as-of contamination inflates apparent skill | 3 instances in this system |
| 4 | **Fix circularity** — tier-mate-relative measures are circular | T8: k≈2 vs k≈100–250 |
| 5 | **PRE-REGISTER the deciding test** | T1 |
| 6 | **Use MARGINAL contribution, not residual correlation** | T1 — the two-test paradox |
| 7 | **Sign must be consistent across seasons** to keep a cell | T8 — structure vs regime |
| 8 | **Disaggregate — rung aggregates hide cancelling errors** | T8 |
| 9 | **Test new factors against the props that already PASS first** | T9 |
| 10 | **Day-level block bootstrap** — resample days, never legs, **and weight by volume** | T1 #6 |
| 11 | **All three bootstrap conditions**, incl. leave-one-day-out | T1 |
| 12 | **`p × m` house-edge sanity test** | T1 |
| 13 | **Confidence-tier every record** — don't let one-offs harden | T1 |

**Items 1–9 gate a FACTOR. Items 10–13 gate a STRATEGY.**
**Nothing in the current system has been through 10–13**, because the slip-strategy phase has not
begun — and that is correct sequencing, not an omission.

---

## 14. THE RESEARCH STANDARD — all **27** lessons *(T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part A)*

**⚠ COUNT CORRECTION, 2026-09-20 (T1 pass 30). This heading read "all 26 lessons." Part A has 27.**
**VERIFIED** two ways on 2026-09-20: a direct grep of the source document
(`grep -c "^### [0-9]\+\." NBA_LESSONS_LEARNED_FROM_MLB.md` → **27**), and a grep of T1 itself, which
carries `### 27.` inside its pasted copy. **The "26" figure propagated from the work order into this
document and was never checked against the file.** **Lesson #27 had no entry anywhere in the twelve
documents** — it is added below, at the end of the list.

**⚠ AND THE PART LIST IS ALSO INCOMPLETE.** Every reference in these documents says *"Parts A–F."*
The current `NBA_LESSONS_LEARNED_FROM_MLB.md` carries **Parts A, B, C, D, E, F, G and H**:
- **Part G — "Lessons earned by the NBA baseline work itself (2026-09-09), now part of the standard"** — **10 numbered lessons**
- **Part H — "Lessons from the enrichment backfill, market and board-sourcing phase (2026-09-10)"** — **12 numbered lessons**

**Both POSTDATE T1** (2026-09-03), so they are **not T1 material** — they were appended by the
sessions that became **T7–T11**, and they are swept with those transcripts, not here. **They are
recorded now so the gap is not lost**: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*. **The research
standard is 27 lessons + 22 NBA-earned lessons across Parts G and H = 49 numbered items, of which
this document currently carries 27.**

**Part A's own preamble, which sets how the standard must be used:**
> *"**The complete research standard (apply to EVERY NBA strategy candidate).**
> **This standard was built incrementally, EACH ITEM ADDED AFTER A REAL MISTAKE EXPOSED THE GAP IT NOW
> CLOSES. APPLY ALL OF THEM TOGETHER, EVERY TIME, NOT SELECTIVELY.**"*

**Two things follow.** Each lesson is a scar, not a preference — so **none is optional on the grounds
that it seems unlikely to apply here**. And the standard is **cumulative**: applying a subset is the
failure mode it was built to prevent, since every item exists because a prior effort skipped it.

**The document is described in the startup plan as *"the single most important document in this
transfer package — a research standard built the hard way, across dozens of strategy candidates,
almost all of which looked real at first and were later found to be artifacts."*** The plan requires
*"the full standard… **from the very first candidate**, not as a later addition once shortcuts have
already been taken."*

| # | Lesson |
|---|---|
| **1** | **The fair-odds gate — apply FIRST, before any hit-rate analysis** (`p × m`; see `NBA_MULTIPLIERS.md` §0.3) |
| **2** | **Never apply a tier/pool-level multiplier to a heterogeneous population** — MLB's costliest error; use `Σ wᵢ(pᵢ·mᵢ)` per cell |
| **3** | **Multiple, genuinely DIFFERENT research passes per candidate** — *"not the same query with a different threshold"* |
| **4** | **Gemini as a genuine ADVERSARY, not a rubber stamp** — *"asked to SET ITS OWN [test/criteria]"* |
| **5** | **The three-check discipline on every number before reporting it** — **(a)** correct lane/join *"via a validated join, not a raw flag that may be stale or wrong"* · **(b)** corrupted/known-bad day exclusion *"exclude any day with a confirmed data-quality issue"* · **(c)** day-robustness / leave-one-day-out *"a pooled, aggregate result can be entirely carried by one or two outlier days"* |
| **6** | **Statistical significance done properly — DAY-LEVEL clustering, not pooled-leg-level, AND properly volume-weighted** |
| **7** | **Multiple-comparisons correction, scaled to what was ACTUALLY SEARCHED** |
| **8** | **"Insufficient data / underpowered" is a DISTINCT verdict from "confirmed negative" — don't collapse them** — *state the power calculation and track underpowered candidates in their own list with an explicit unblock condition* |
| **9** | **Check your OWN statistical treatment for bias IN BOTH DIRECTIONS, not just for being "too strict"** |
| **10** | **Enumerate every possible data source before declaring something "untestable"** |
| **11** | **A plausible causal story is NOT evidence — test it directly, including your own** |
| **12** | **Same-game correlation is real but usually SMALLER than DFS-community folklore suggests** |
| **13** | **Platforms price probability DIRECTIONALLY but NOT PROPORTIONALLY** — *"a real, load-bearing finding"* |
| **14** | **Prop-definition mismatches across platforms are a real, repeated trap** — verify each platform's own formula |
| **15** | **Before trusting any grouping key or join in a new table, sanity-check that it actually ISOLATES [what you think]** |
| **16** | **Real backtest results, however rigorous, still need REAL-MONEY confirmation** |
| **17** | **Report the RANGE a finding actually spans, not the single best number found while searching** |
| **18** | **A concrete sample-size posture as a mechanical default for NBA** |
| **19** | **Language strength must NEVER exceed evidence strength** — *"a standing, mechanical discipline"* |
| **20** | **Define "success" against the honest baseline of NOT HAVING the component at all** |
| **21** | **Consult Gemini to check your METHOD, then RE-DERIVE [independently]** |
| **22** | **Always include a genuine CONTROL/BASELINE case**, and treat it as a required sanity check |
| **23** | **When an anomaly involves an interaction between two things, isolate it by RE-PAIRING each** |
| **24** | **Distinguish durable QUALITATIVE platform mechanics from exact NUMERIC values that drift over time** |
| **25** | **A "safety margin" can compound into an absurd result once exponentiated** |
| **26** | **Explicitly track a finding's CONFIDENCE TIER** — *"'first real pass' and 'independently re-validated' are NOT the same claim"* |
| **27** | **A platform's Flex-style PARTIAL-CREDIT mechanics can be structurally different platform to platform — VERIFY, don't assume** — flat fixed partials vs partials that scale with the full-hit multiplier; full entry at §14's body below |

> **⚠ TABLE REPAIRED 2026-09-22 (T20 pass 4 — the first full sequential read of T20).** Until this
> pass the table carried **26 rows under a heading that reads "all 27 lessons"**, and **two of those
> rows were not lessons**: row **5** ended `(b) …, (c) …` and row **8** read *`(sequence continues)`*.
> **Cause, traced in T20 itself**: the table was built at **SEG 921** by grepping T1's escaped-JSON
> copy of the source with `sort -u | head -18`, which truncated the retrieval; the retry at **SEG 979**
> printed `--- l8 ---` **with nothing after it** (SEG 980) and the row was left as filler. Both gaps
> were later recovered *into this document's own body* — lesson 5's (b)/(c) at SEG 941→944, lesson 8
> at SEG 1169→1171, lesson 27 by T1 pass 30 — **and the table was never brought into line with them.**
> **This is §T10.18b's shape a second time: a correction that did not reach the surface it governs** —
> pass 30 corrected this very heading 26 → 27 and added #27 to the body while leaving the table at 26.
> **All three rows are now filled VERBATIM from `nba/NBA_LESSONS_LEARNED_FROM_MLB.md` — the source
> document, which is in this repository** (lines 25–26, 36–37, 93) — **not from a transcript's copy of it.**
> *Operative lesson, and it is lesson **10** turned on this sweep: the pass that recorded "enumerate every
> possible data source… don't stop at the first or most obvious table" was itself reading one grep of one
> transcript while the primary source sat in the directory it was writing to.*

### The ones this project has already proved the hard way

#### ⚠ #15 IS THE DOMINANT FAILURE MODE — six separate instances in MLB alone
> *"**The DOMINANT SINGLE FAILURE MODE across MLB's entire research program (at least SIX distinct,
> separately-discovered instances) was a GROUPING KEY OR JOIN THAT FAILED TO ISOLATE the spec[ific
> thing it claimed to].**"*

**NBA has already had at least four of its own:**
| Instance | Effect |
|---|---|
| `norm_market()` naive `replace('player_','')` | **23,286 legs — 44% of the board — scored nothing, silently** |
| The splits PK omitting `season` | only one season can ever exist |
| The lineup PK omitting `team_id` | traded players collide (**failed loudly** — the good case) |
| The gap sample grouping on `matchup` | every game listed twice |

**This is the bug class to look for first in any new table.** *"Before trusting any grouping key or
join, sanity-check that it actually isolates what it claims to."*

#### #18 — THE SAMPLE-SIZE POSTURE, adopt as a mechanical default
> *"**fewer than 15 real days is NOT YET A RESULT AT ALL; 15–30 days is DIRECTIONAL ONLY; 30–70 days is
> usable WITH REAL CAVEATS STATED; 70+ days is GENUINELY REPORTABLE.**
> **Days of real, distinct data matter FAR MORE than total leg count — a large leg count concentrated
> in a handful of days is A SMALL-SAMPLE FINDING WEARING A LARGE-N DISGUISE.**"*

**This is the standard the NBA season should be measured against from opening night**, and it explains
why the bootstrap resamples **days**, not legs (§13.1).

#### #5 — the three checks on every number before reporting it
**(a) Correct lane/join** — *"via a VALIDATED JOIN, not a raw flag that may be stale or wrong"*
**(b) Corrupted/known-bad day exclusion** — exclude any day with a confirmed data-quality issue
**(c) Day-robustness / leave-one-day-out** — *"a pooled, aggregate result can be **entirely carried by
one or two outlier days**; always break down by day and check the sign holds broadly."*

**Check (a) is the guard against #15.** Check (c) is the same instinct as the bootstrap's third
condition, applied to every number rather than only to strategies.

#### #10 — enumerate every data source before declaring something untestable
*Stated in the source as **"the second-highest-value lesson from the whole program."***
> *"MLB repeatedly **assumed a question was unanswerable from real data, then later discovered
> HUNDREDS TO TENS OF THOUSANDS of relevant real rows sitting in a table nobody had checked**, because
> **the search stopped at the first or most obvious table**. Before concluding 'untestable',
> **systematically list every schema/table that could plausibly hold the answer** — **check what code
> actually WRITES where, INCLUDING TABLES THAT A GIVEN PIPELINE STAGE EXPLICITLY SKIPS — that's often
> exactly where undiscovered real data hides** — **don't stop at the first negative result.**"*

**NBA instances of the pattern:**
- `player_game_starter_status.comment` held **5,500+ labelled absence reasons** (4,319 coach's
  decisions, 975 DND-Injury) as a byproduct of the starter backfill — found only by inspecting the
  column.
- `nba_ref.arenas.altitude_ft` and `.timezone` are the inverse case: **columns that exist and are
  empty**, which a source enumeration would also surface.
- The T7 audit method — *"checking actual row counts across every table in every NBA schema, to catch
  anything that **exists structurally but is empty or stale**"* — is this lesson as a procedure.

#### #17 — report the range, not the best number found while searching
> *"Sweeping many cells, thresholds, or windows and **reporting only the maximum found is itself a
> form of selection bias**, distinct from but related to the multiple-comparisons correction in #7 —
> a real, concrete case of **a headline result (+106% over a 15-day window) shrinking to +52% once the
> window was honestly extended to 24 days**, **purely because the original number had been THE PEAK OF
> A SEARCH, not a stable estimate**. **Report the full range or the honest current estimate across all
> data available.**"*

**Figures as stated:** +106% over 15 days → **+52%** over 24 days.
**Related**: Rule B0c requires the same output for tie-break order — *"and the range reported."*

#### #1 — the fair-odds gate, applied FIRST
> *"Before trusting any high hit-rate finding, compute the implied house edge: **`p × m`**… If this
> implies the platform is handing out a large, systematic edge on a repeatable, high-volume line,
> **the multiplier attribution is wrong, not the market.**"*
Recorded in full at `NBA_MULTIPLIERS.md` §0.3.

#### #3 — multiple, genuinely DIFFERENT research passes per candidate
> *"**not the same query with a different threshold.** For each candidate signal, test:
> **raw historical hit rate vs the model's own probability estimate**; **player-level vs
> prop-line-level pooling**; **single-factor vs multi-layered combinations**; and **any
> domain-specific interaction** (MLB tested lineup-slot interaction because a real, documented gradient
> exist[ed])."*

**Four named axes for a genuinely different pass:**
| Axis | The two sides |
|---|---|
| Measurement | raw historical hit rate **vs** the model's own probability estimate |
| Pooling level | player-level **vs** prop-line-level |
| Structure | single-factor **vs** multi-layered combinations |
| Interaction | any domain-specific gradient known to exist |

**The NBA analogue of the fourth axis**: the M1 defender factor was found to work **only in the
INTERACTION form, never as a main effect** — which is this axis producing the result.
**And the second axis is the one Part C member #3 warns about** — pooling level changes the answer.

#### #4 — Gemini as a genuine adversary, used correctly
> *"Gemini should be asked to **SET ITS OWN FALSIFICATION BAR BEFORE SEEING THE RESULT** — **minimum
> sample size, required monotonicity, minimum edge over baseline** — **then the actual number is
> checked against that pre-stated bar.** Work in **MULTIPLE SMALL PASSES, not one large dump** — the
> explicit, repeated lesson was that **large single prompts ca[n]**…"*

**Three components of a pre-stated bar, named:** minimum sample size · **required monotonicity** ·
minimum edge over baseline.

**And the working interaction pattern, as stated:**
> *"**large single prompts caused DRIFT**; the working pattern is: **present data + sharp questions →
> get a diagnosis → reference that diagnosis EXPLICITLY in a follow-up pass for the next specific
> piece, WITHOUT RE-PASTING EVERYTHING.**"*

> *"**Gemini is valuable but NOT INFALLIBLE IN EITHER DIRECTION** — real cases of **Gemini correctly
> catching an analyst's own contamination the analyst missed**, and separate real cases of **Gemini
> being WRONG about a proposed [approach]**."*

**"Not infallible in either direction" is borne out in the NBA record**, which contains both:
| Gemini correct | Gemini wrong |
|---|---|
| surfaced garbage-time filtering (T2) | 1,230-call estimate for advanced stats — actually **2 bulk calls** (T4) |
| surfaced the schedule as *"the chassis"* (T3) | *"starters are inferable from game logs via `GS`"* — false (T5) |
| surfaced peer-reviewed altitude / jet-lag factors (T7) | *"Team Pace still needed"* — already covered (T5) |
| **self-corrected its own earlier on/off ranking** (T3) | *"tier globally"* — contradicted the proven per-combo architecture (T7) |
| gave the Shot Quality Delta methodology (T3) | *"potential assists aren't in our data"* — they are (T7) |
| proposed halftime foul count → **correctly rejected as in-game data** (T9) | |

**This is pre-registration (§7f) delegated to the adversary** — the bar is set by a party that has not
seen the result. **#21 completes the loop**: check the **method**, then **re-derive the conclusion
yourself**.

**Recorded NBA usage matches the adversarial framing** — the transfer list names *"the Gemini
adversarial-review usage pattern"*, and T3 records asking it *"to be skeptical rather than just keep
validating more searches."*
**What is not recorded**: any instance of Gemini being asked to state a falsification bar **before**
seeing a result. **The NBA uses were synthesis and critique, not pre-stated bars.**

#### #7 — multiple-comparisons correction, scaled to what was ACTUALLY searched
> *"When scanning many cells/props/thresholds for the best-looking result, **the significance bar must
> scale with how many things were searched** (Bonferroni or equivalent). **A single, PRE-REGISTERED
> confirmatory test on ONE specific cell should use an UNCORRECTED bar** — **using a scan-level bar on
> a single confirmatory test is ITSELF AN ERROR** (a real case: **a 40-cell-scan-corrected bar was
> wrongly used on what was actually a single pre-specified test, making a real, borderline-positive
> result look FAR MORE REJECTED than the evidence warranted**)."*

**So the correction is symmetric in its own way — both under- and over-correcting are errors:**
| Situation | Correct bar |
|---|---|
| **Scanning many cells for the best-looking result** | **corrected** (Bonferroni or equivalent), scaled to how many were searched |
| **A single, pre-registered confirmatory test** | **UNCORRECTED** — applying a scan-level bar here is an error |

**This is the third recorded instance of over-strictness being a real error** (#6's unweighted
day-test, #9's moving goalposts, and this). **And it makes pre-registration do double duty**: it is
both the guard against re-specifying after seeing the result (§7f) *and* the thing that earns an
uncorrected bar.

**NBA state**: the factor gate scanned many **prop × band × side** cells. **No correction is recorded**,
and **no per-cell pre-registration is recorded either** — so neither branch of #7 has been applied.
Recorded in `NBA_OPEN_ITEMS.md`.

#### #8 — "insufficient data / underpowered" is a DISTINCT verdict from "confirmed negative"
> *"**Don't collapse them.** A **non-significant result with a wide confidence interval that still
> contains a materially positive value is NOT the same as a confirmed-zero effect**. **State the
> actual POWER CALCULATION** (how many days would be needed to detect the effect size in question)
> **and track genuinely underpowered candidates in their own lis[t]**."*

> ⚠⚠ **`§0z-5` — THE "TEN" IN THE PARAGRAPH BELOW IS THE FRAMING THAT WAS RETRACTED** *(inbound
> pointer added 2026-09-22, T20 pass 85, §T20.90 — repairing a `T20-1` orphan. **The finding is not
> re-opened and nothing below is struck**; rule 40's second half.)*
> **`NBA_SYSTEM_DESIGN.md` §0z-5 — *"ENRICHMENT IS THIN BY DESIGN, NOT BY FAILURE — and the corpus's
> 'ten rejected factors' framing is WRONG"* (T17 pass 1, §T17.2, owner-adjacent research)** — **names
> THIS DOCUMENT as the carrier of that framing** *(its words: "`NBA_FINAL_SCORING_CALIBRATION.md`
> §0a-T15-SUPERSESSION-2 and §0a-T16 record a long sequence of factor rejections as a single coherent
> result")* **and retracts it in the author's own words**:
> > ***"**a3, a4, d2 and k1 were NEVER ENRICHMENT CANDIDATES.** §7's stage table already assigns all
> > four to **BASELINE**, and §4 notes a3 is 'measured; in baseline v30'. **So my gate wasn't testing
> > new factors — it was testing DUPLICATES of things the baseline already computes. The zero gains
> > weren't a discovery; THE DOCUMENT PREDICTED THEM.** My 'ten rejected factors' framing was wrong:
> > **several were never candidates.**"***
> ⇒ ***Read "the ten" below as ten GATE RESULTS, not ten enrichment candidates.*** 🔑 **This SHARPENS
> #8's request rather than weakening it**: a factor the baseline already computes cannot be
> *underpowered* — its zero was **predicted**, so it needs no power calculation, and striking `a3`,
> `a4`, `d2`, `k1` shortens the list #8 asks to be tracked. ✅ **And it does not touch the two this
> paragraph actually names — `A2` and `B4` are NOT among the four §0z-5 strikes, so the
> underpowered-vs-confirmed-negative distinction stands for both of them unchanged.**

**Direct relevance to the ten rejected enrichment factors.** `nba_score.factor_gate_results` stores
`n`, `log_loss`, `brier`, `gain_vs_anchor` and `shrink_beta` — **so the sample size is recorded per
verdict**, but the transcripts record the outcomes as rejections rather than splitting them into
*confirmed negative* vs *underpowered*.

**Two of the ten have stated sample constraints that suggest the distinction matters:**
- **A2** — the design specified confidence tiers on shared-absence games (**<5 / 5–14 / 15+**),
  because a with/without table on fewer than five games is close to noise.
- **B4** — *"closed in three formulations, 0 of 5 props"*, with no recorded power figure.

**What #8 asks for and is not recorded**: a power calculation per closed factor — *how many days would
be needed to detect an effect of the size in question* — and **a separate list for underpowered
candidates** rather than one rejection bucket.

**Note the opposite risk is also recorded** (#9): applying a stricter test only to surprising results
is its own bias. **#8 and #9 together say: keep the bar fixed, and classify the outcome honestly.**

#### #9 — **MOVING THE GOALPOSTS ONLY WHEN SOMETHING LOOKS PROMISING IS ALSO BIAS**
> *"MLB found and named a specific, subtle failure mode: **introducing a stricter statistical test
> SPECIFICALLY BECAUSE a result survived further than expected** (**moving the goalposts only when
> something looks promising**) **is a real form of bias, distinct from and just as important to avoid
> as being too lenient** on a promising-looking result. **When you find yourself reaching for a new,
> more ri[gorous test]…**"*

**Over-strictness is not the safe direction.** The asymmetry is what makes it bias: applying the harder
test **only** to results you did not expect systematically rejects real findings while letting
expected ones through unchallenged.

**The discipline this implies**: decide the test **before** seeing the result (#5's pre-registration),
and if a new check is genuinely warranted, **apply it to everything already accepted**, not only to the
surprising case.

**⚠ Directly relevant to this project's rejections.** Ten enrichment factors were rejected and the
anchor won every slice. **That is a legitimate outcome — but the guard against it being partly an
artifact is that `gain_vs_anchor`, `log_loss` and `brier` were fixed as the metrics before any factor
ran**, and every verdict lands in `factor_gate_results`. **The pre-registration is what makes the
rejections trustworthy**, not the rejections themselves.

#### #11 — **"MECHANISTICALLY COHERENT" IS A TRAP, NOT A CREDENTIAL**
> *"The **'mechanistically coherent' trap**: a prop's apparent correlation strength tracked a real,
> **physical-sounding narrative** (**a composite stat *should* correlate more with game environment**)
> that turned out to be **a pure artifact of a different confound — LINE-THRESHOLD VARIANCE — once
> tested properly**. **The physics-plausible story should have raised SUSPICION, NOT CONFIDENCE**,
> once **an independent check — DOES THIS ORDERING MAKE PHYSICAL SENSE GIVEN WHAT COMPONENTS ARE
> SHARED ACROSS PROPS — was available.**
> **Test your own favoured explanation with the same rigor you'd apply to someone else's.**"*

**The confound is structural**: props sit at different line levels, and **variance differs by line
level by construction** — so any cross-prop comparison that does not control for it manufactures an
ordering.

**The independent check is also named**: *does the ordering make physical sense given **what
components are shared across props**?* **Directly applicable to NBA's combos** — PRA shares components
with points, rebounds and assists, so an apparent PRA-vs-points difference may be a shared-component
artifact.

**A2 is the NBA instance of the trap**: a physically obvious mechanism (a teammate sits, his minutes
go somewhere) that failed five panels and *"worst where the mechanism predicted it should win."*

**A good story is a reason to test harder, not to believe.** And the confound named —
**line-threshold variance** — is structural: props with different line levels have different variance
by construction, so any cross-prop comparison that does not control for it will manufacture an effect.

**A2 is the NBA instance**: a physically obvious mechanism (a teammate sits, his minutes go somewhere)
that failed five panels and *"worst where the mechanism predicted it should win."*

#### #19 — **LANGUAGE STRENGTH MUST NEVER EXCEED EVIDENCE STRENGTH**
> *"…easy to **drift on gradually rather than violate all at once**: a finding that clears a **lenient
> bar should be DESCRIBED as clearing a lenient bar**, not described in the same confident language as
> one that cleared every available check.
> **If a claim needs a word like 'CONFIRMED', 'PROVEN', or 'VALIDATED', IT SHOULD HAVE ACTUALLY
> CLEARED THE FULL STANDARD IN THIS DOCUMENT** — **a strategy that merely 'AVOIDS BEING WORSE' than
> some baseline should NEVER be described using the same language reserved for one that's been shown
> to GENUINELY OUTPERFORM it.**
> **Calibrate every claim's wording to match exactly HOW MUCH SCRUTINY IT SURVIVED, not how appealing
> the underlying number looks.**"*

**Three words are gated** — *confirmed*, *proven*, *validated* — each requiring the **full standard**,
not merely a good number.

**The named trap is precise and directly live here**: *"avoids being worse"* ≠ *"outperforms"*. The
ten enrichment factors produced *"the certified anchor wins every slice"*, which establishes that
**the factors did not beat the anchor** — not that the anchor is proven superior in a stronger sense.

**Applied to this system's own vocabulary:**
| Claim | Correct word |
|---|---|
| Ladder calibration, both seasons, `0 misses of 37`, holdout with cells disabled | **certified** — cleared the stated leg-level standard |
| The four-way goblin/demon rule, 42,600 ladders | **verified** |
| Ten enrichment factors closed on `gain_vs_anchor` | **did not beat the anchor** — *not* "disproven" (#8) |
| Goblin/demon EV conclusions | **directional** — payout factors observed, not quoted from a slip (#16) |
| Flex partial tiers 4/5 = 0.5, 3/5 = 0.25 | **first pass** (#26) |
| `board_tiers_v2` | **built, unverified** |

**A mechanical discipline, not a stylistic one.** This project already distinguishes **CERTIFIED /
CLOSE / REGIME RESIDUAL / CONFIGURED-NOT-RUN / NOT-YET-CERTIFIED** per prop, and tags
`classification_config` entries **`BACKTEST-LOCKED`** when earned. **Those vocabularies exist to stop
exactly this drift.**

#### #20 — **THE BAR IS "BEATS NOT HAVING IT AT ALL" — and be willing to recommend REMOVAL**
> *"When evaluating whether **a complex component (an enrichment layer, a scoring adjustment, an
> entire strategy track)** is worth keeping, **the correct bar is whether it beats THE SIMPLEST
> AVAILABLE ALTERNATIVE — INCLUDING THE ALTERNATIVE OF NOT HAVING IT AT ALL** — **not whether it
> improves on some other, ALREADY-KNOWN-TO-BE-DEGRADED VERSION OF ITSELF.**
> [The] explicit standard for scoring-engine calibration work stated this directly: **success meant
> BEATING THE CLEAN BASELINE SIGNAL ON REAL, HELD-OUT DATA, not merely improving on the current,
> already-damaged enriched version — BECAUSE THAT SECOND, WEAKER BAR IS CLEARED AUTOMATICALLY BY
> DELETING THE COM[PONENT].**"*

**The closing clause is the whole argument**: a bar that a *deletion* clears is not a bar. If the
comparison is against a degraded version of the thing itself, removing it entirely wins — which proves
the comparison was meaningless.

**NBA implements exactly this.** `gain_vs_anchor` measures against **the certified anchor on held-out
data** — i.e. against *not having the factor* — **not against a weaker version of the factor.** That
is why ten closures are a legitimate outcome rather than an embarrassment: **the right question was
asked, and the honest answer was no.**

**And "be willing to recommend removal" has a live instance**: **A2 was RETRACTED**, not softened —
the panels were withdrawn rather than re-tuned.

**⚠ The corresponding open question** is Part F's: the bar is the anchor, and **the anchor itself has
not been leak-checked** to the standard Part F describes. *(Recorded in `NBA_OPEN_ITEMS.md`.)*

#### #21 — **THE STRUCTURED ORDER FOR AN ADVERSARIAL CONSULTATION**
> *"A specific, structured order… worked well throughout: **present the mechanics you've derived
> (INCLUDING ANY VERIFICATION ERRORS ALREADY FOUND), the signal itself and why it's believed clean,
> the full results INCLUDING EVERY CONTROL TESTED (not just the favourable ones), the specific test
> that's currently failing or in question, and END WITH DIRECT, NUMBERED QUESTIONS — explicitly
> including a version of 'AM I BEING TOO HARSH, OR TOO LENIENT?'**"*

**Five elements, in order:**
1. the mechanics derived — **including your own verification errors already found**
2. the signal, and why it is believed clean
3. the full results — **including every control tested, not just the favourable ones**
4. the specific test currently failing or in question
5. **direct, numbered questions — one of them asking "am I being too harsh, or too lenient?"**

**Element 5 is the guard against #9 and #6's over-strictness errors** — it asks the reviewer to check
the bar in *both* directions, not only for leniency.

#### ⚠ #21's nuance — a correct critique can carry an incorrect verdict
> *"**An adversarial reviewer can CORRECTLY DIAGNOSE A FLAW in your statistical method WHILE ITS OWN
> STATED FINAL VERDICT IS STILL COMPUTED USING THAT SAME FLAWED METHOD**, producing **a conclusion
> that doesn't actually follow from its own correct critique.**
> **Take a reviewer's methodological correction seriously, but ALWAYS RE-DERIVE THE ACTUAL NUMERIC
> CONCLUSION YOURSELF using the corrected method** — **don't accept a final verdict at face value just
> because the reasoning that led to it sounded right.**"*

**The failure mode is specific: the critique and the verdict come apart.** Sound reasoning followed by
a number computed the old way. **Separating "was the method criticism right?" from "is the stated
conclusion right?" is the whole discipline** — and the second must be recomputed, not accepted.

#### #22 — **A CONTROL CASE WITH A KNOWN ANSWER, as a required sanity check**
> *"MLB's original multiplier-observation study **deliberately included a real slip built ENTIRELY
> from unmodified, standard-priced legs** — with the explicit purpose of **confirming the study's own
> MEASUREMENT METHOD against a case with a known, predictable answer** (no special pricing applied at
> all). **It came back matching the** [expectation]."*

**The control validates the instrument, not the hypothesis.** A standard-priced slip has a
predictable payout; if the measurement method cannot reproduce it, nothing measured on goblin or demon
slips can be trusted. **Any NBA multiplier capture must include one standard-only slip for exactly
this reason.**

#### #23 — **RE-PAIR EACH SIDE INDIVIDUALLY BEFORE CONCLUDING**
> *"A **single specific pairing of two particular legs** produced **a result running opposite to every
> other similar pairing tested**. **Rather than either dismissing it as noise or assuming either
> individual leg was 'the problem'**, the correct diagnostic was to **RE-TEST EACH OF THE TWO LEGS
> PAIRED WITH A *DIFFERENT* PARTNER: both came back with ENTIRELY NORMAL RESULTS when paired
> differently, PROVING the anomaly was specific to THAT ONE EXACT COMBINATION**, not attributable to
> e[ither leg alone]."*

**The diagnostic is constructive, not dismissive.** Two failure responses are both named as wrong:
calling it noise, and blaming one member. **The test separates them**: if each leg behaves normally
with other partners, the interaction is real and belongs to the pair.

**NBA surfaces where this applies**: any same-game or same-team pairing finding; the M1 defender
factor (which works **only in interaction form**); and anything emerging from the
`factor × prop × tier × role_tier × direction × variation_band` cell space, where an anomaly is
by construction a property of a combination.

#### #25 — compounding safety margins
> *"a real, deployed constant applying **an extra, deliberate conservative discount ON TOP OF an
> already-real, already-conservative observed ratio** — **reasonable-looking as a single number** —
> but **once that doubly-discounted ratio was EXPONENTIATED across a full slip's worth of legs, the
> compounded result IMPLIED A PAYOUT BELOW BREAKEVEN FOR EVEN THE HIGHEST-QUALITY LEGS AVAILABLE — an
> absurd, unusable outcome that had gone unnoticed BECAUSE NOBODY HAD ACTUALLY RAISED THE SINGLE-LEG
> CONSTANT TO THE RELEVANT POWER BEFORE SHIPPING IT.**"*

**The diagnostic named is trivial and was skipped**: **raise the single-leg constant to the power of
the slip size before shipping it.** A 5% haircut per leg is **23% on a 5-pick slip**; a doubly-applied
one compounds past usability.

**Apply any conservatism ONCE, at slip level.** And **the ship-gate is one line of arithmetic** —
`constant ** n_legs` for the real slip sizes in use.

**Note this is the same failure the `p × m` gate catches from the other direction**
(`NBA_MULTIPLIERS.md` §0.3): a result implying *"a payout below breakeven for even the
highest-quality legs"* is the mirror of one implying an impossibly large edge. **Both are
attribution errors, and both are caught by computing the implied outcome before believing the
number.**

#### #27 — **FLEX-STYLE PARTIAL-CREDIT MECHANICS DIFFER PLATFORM TO PLATFORM — VERIFY, DON'T ASSUME**
*Added 2026-09-20 (T1 pass 30). **This lesson had no entry in any of the twelve documents.***

> *"MLB found **a real, concrete structural difference between platforms**: **one platform's
> partial-hit Flex payouts (for missing one or two picks out of a full slip) were FLAT, FIXED VALUES
> INDEPENDENT OF HOW LARGE THE UNDERLYING FULL-HIT MULTIPLIER WAS**, while **a DIFFERENT platform's
> partial-hit payouts SCALED PROPORTIONALLY WITH ITS OWN FULL-HIT MULTIPLIER**. **Don't assume every
> DFS platform's Flex-style partial-credit structure works the same way — VERIFY EACH PLATFORM'S
> ACTUAL MECHANIC (flat partial payouts vs. proportional-to-full-hit payouts) DIRECTLY FROM REAL
> OBSERVED DATA before building any EV model that depends on it**, since **the two structures produce
> meaningfully different expected values for the same underlying leg-hit distribution.**"*

**Why this one matters more than its position in the list suggests.** It is the only lesson that
names a **structural**, not numeric, difference between the platforms this system prices on — and
`NBA_MULTIPLIERS.md` currently holds **one observation, from one platform, treated as possibly
universal**.

**⚠ THE DIRECT COLLISION.** `NBA_MULTIPLIERS.md` §0.2 records *"two independent real observations both
showed identical partial tiers **4/5 = 0.5 and 3/5 = 0.25**… **suggests these may be flat/constant
values**"* and §0.2d builds on it: *"**the partial-tier table is the part that looks constant.**"*
**Those observations are PrizePicks.** **Lesson #27 says the flat shape is one of two structures that
exist in the wild, and that the other one scales with the full-hit multiplier.** So:
- **The "flat" finding is not contradicted** — flat is exactly what #27 says one platform does, and
  two independent observations is strong for that platform.
- **What is not licensed is the generalisation.** **Underdog, Sleeper, Betr and Fliff each need their
  own verification**, and #27 makes that an explicit requirement rather than a nice-to-have. This
  compounds with §0.2e's separate finding that **Underdog and Sleeper price per-leg dynamically**
  rather than off a flat table — a platform that prices legs dynamically is exactly the kind that
  would scale its partial tiers proportionally.
- **The consequence is EV, not cosmetics.** #27 states the two structures *"produce meaningfully
  different expected values for the same underlying leg-hit distribution."* A Flex EV model is a
  **weighted sum over the partial tiers**, so the tier shape is a first-order term, not a correction.

**Status**: **NOT RECORDED as verified for any platform other than PrizePicks.** Routed to
`NBA_MULTIPLIERS.md` §0.2h and `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*.
**Cross-references**: #24 (durable mechanics vs drifting numbers — **#27 is a durable mechanic, so it
is the kind that transfers**), #26 (confidence tier — the flat observation is labelled *first pass*),
#14 (prop-definition mismatches across platforms — the same trap one layer down).

#### ⚠ The two with no visible NBA implementation
- **#7 multiple-comparisons correction** — the factor gate scanned many prop × band × side cells;
  the exemption is *"a single, PRE-REGISTERED confirmatory test on one specific cell"*, and gate runs
  were not pre-registered per cell
- **#17 report the RANGE, not the best number** — *"reporting only the maximum found is itself a form
  of selection bias, distinct from but related to #7"*

---

## 16. PART E — THE CONSECUTIVE-CLEAN-PASS STANDARD *(MLB's internal work log)*

**The owner's rule for this documentation effort is MLB's own verification bar, and it is documented
in the lessons package:**

> *"MLB's own internal, continuously-updated work log documents an explicit, formal rule that is
> **STRICTER than anything captured elsewhere in this package**, and worth adopting directly as NBA's
> own standing verification bar: **before considering any system deeply verified, require a set number
> (MLB used TWO) of genuinely CONSECUTIVE CLEAN investigation passes — EACH USING DIFFERENT REAL
> SAMPLES AND DIFFERENT ANGLES — with ZERO new issues found. If any pass turns up something new, NO
> MATTER HOW MINOR, THE COUNTER RESETS TO ZERO, regardless of how many clean passes preceded it.**
> This is a materially stricter standard than 'run one thorough check and move on', and it **directly
> produced real value in MLB**."*

**Three things this pins down:**
1. **MLB used TWO consecutive clean passes. The owner set THREE for this work** — a deliberately
   stricter bar than the source standard.
2. ***"Each using DIFFERENT real samples and DIFFERENT ANGLES"*** — a pass is not a re-run. **Repeating
   the same query is not a second pass.** *(This is why the targeted-sweep approach on T1 needed 23
   passes before a full sequential read could even begin to count.)*
3. **"No matter how minor" resets the counter** — the rule is explicit that severity does not matter.

**This is also lesson #3 in operational form** — *"multiple, genuinely different research passes per
candidate — not the same query with a different threshold."*

## 17. THE SINGLE MOST VALUABLE STANDING HABIT

> *"**Whenever an early result looks unexpectedly strong, or an aggregate number looks structurally
> odd, DECOMPOSE IT BY EVERY PLAUSIBLE CONFOUNDING DIMENSION — day, prop, tier, variant, player —
> BEFORE BELIEVING IT.** **This exact discipline caught the MAJORITY of MLB's false positives** before
> they were reported or acted on."*

**Five named dimensions: day · prop · tier · variant · player.**

**This is the same instinct as *"rung-aggregates hide errors"*** (T8), generalised: an aggregate that
looks good can be the average of a large positive and a large negative, or can be carried by one
sub-group. **Decomposition is the default response to a strong result, not a follow-up.**

**Applied in this system already**: the leg-level standard disaggregates by **band × direction ×
rung**; the factor gate reports per **slice**; the bootstrap's leave-one-day-out condition covers
**day**. **The dimension with the least coverage is `variant`** — i.e. goblin/standard/demon — which is
consistent with the tails never having been separately certified.

---

## 18. PART D — SELECTION METHODOLOGY, Rules B0–B0c
*Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part D. Recorded 2026-09-20.*

Stated in the source as: *"the original, foundational rule set — everything else in this document is
downstream of it. Apply these to NBA from the very first candidate, not as a later refinement."*

### Rule B0 — build real graded-outcome buckets; never rank by the platform's displayed score
> *"The entire selection logic must be: **build a real, historical, per-(PROP, SIDE, LINE-OR-TIER)
> hit-rate table from ACTUAL GRADED OUTCOMES**, then **select from buckets that clear a real
> SAMPLE-SIZE and HIT-RATE bar** (MLB's original bar: **n ≥ 30 real observations, ≥ 80% hit rate**) —
> independent of whatever the platform's own internal displayed probability/confidence score says.
> **Never trust a platform's own confidence/probability display as a substitute for your own real
> graded-outcome analysis.**"*

**NBA state:** `nba_market.board_outcomes` holds the required table — **6.9M graded legs, 327 dates**,
keyed by prop, side and line, `leg_result` ∈ `over_win` / `under_win` / push / DNP /
`unmatched_player` / `unmatched_not_in_season`.
**No selection bar has been set for NBA** — selection belongs to the slip-strategy phase, not begun.
Related: COMPASS 62 records the market as *"a confidence adjuster and ranking signal, not ground
truth."*

### Rule B0a — every proposed pool must state both its prop CLASS and its pricing LANE
> *"**(1) CLASS** — does it have a **real ladder of multiple simultaneous lines** ('tiered' props) or
> **only one sensible threshold** ('fixed' props)?
> **(2) LANE** — **which specific pricing tier/variant is it actually being offered in** (Standard vs
> Goblin vs Demon)?
> **Class and lane are INDEPENDENT, and LANE IS USUALLY THE DOMINANT DRIVER OF REAL EV, MORE THAN
> CLASS.**"*

**The measured example, as stated in the source:**
> *"**the IDENTICAL leg, IDENTICAL ~85% hit rate** — pricing at **roughly +1300% in one lane and
> roughly −13% in another** — **a swing of over 1,300 percentage points from LANE ALONE**, with the
> underlying prop's class held constant."*

**NBA representation of the two axes:**
| Axis | Where it lives |
|---|---|
| CLASS (tiered vs fixed) | derivable from `LADDER_DEPTH` and the board — points p95 = 13 rungs (tiered); `double_double` carries sentinel −1.0 and no ladder (fixed) |
| LANE (standard/goblin/demon) | `nba_market.board_tiers.kind` + `tier` — **v1 derives `kind` from PRICE and is Over-only** |

**Consequence recorded in `NBA_GOBLIN_DEMON.md` §9.**

### Rule B0b — multi-prop pools must be priced per-leg by each leg's own real rate
*Source: T1, Part D. Recorded 2026-09-20.*

> *"never a single blended/averaged rate. A real, quantified example: **a reported pool combining five
> different props at one assumed blended multiplier showed +216.5% ROI; the real per-leg rates for
> those same five props actually spanned an 82% RANGE (roughly 1.15× to 2.09×), and re-pricing the
> identical pool with each leg's own real rate brought the honest result down to +32.9%** — **a ~6.5×
> OVERSTATEMENT from blended pricing alone, NOT FABRICATION, just a wrong assumption.**
> **Any pool spanning more than one prop/side/tier bucket must price each leg independently from its
> own real, current rate.**"*

**Figures as stated:** +216.5% → **+32.9%**; per-leg multiplier spread **1.15× to 2.09×** (82% range);
overstatement factor **~6.5×**.

**Relation to other recorded rules:** this is the same arithmetic as lesson #2
(*"never apply a tier/pool-level multiplier to a heterogeneous population"* — `Σ wᵢ(pᵢ·mᵢ)`, not
`p̄·m̄`). B0b states it for **pools spanning multiple props**; lesson #2 states it for **populations
within a tier**.

**NBA state:** no pools have been built — slip-strategy phase not begun.

### Rule B0c — a ranked-greedy backtest must be tested against multiple tie-break orders
*Source: T1, Part D. Recorded 2026-09-20.*

> *"When legs are selected by ranking within a bucket and **many legs share the same or very similar
> scores**, the specific tie-break rule (which of several equally-ranked legs gets picked) **can by
> itself swing a backtest's reported ROI dramatically** — a real case of **the same configuration
> swinging from +25.9% to +12.5% PURELY from tie-break order, with 69% OF LEGS TIED within a day on
> the ranking field used**.
> **Any backtest built by ranking legs within a bucket must be re-run with at least one alternate,
> equally-legitimate deterministic tie-break order (e.g. an ID sorted ascending vs descending) and
> THE RANGE REPORTED.**"*

**Figures as stated:** +25.9% → +12.5% from tie-break order alone; **69% of legs tied** within a day
on the ranking field.

**Relation to other recorded rules:** the required output — *"the range reported"* — is lesson #17
(*"report the range a finding actually spans, not the single best number found"*), applied to
tie-breaks.

**NBA state:** the certified backtest ranks by **rate tier within role tier** (quantile), and the
scoring engine produces a continuous `score` 0–100. **No ranked-greedy selection backtest has been
run** — that belongs to the slip-strategy phase.
**Relevant when it is**: `score` is continuous and unlikely to tie, but any bucket-level selection
(e.g. "top N legs in a tier") inherits this requirement.

---

## 20. PART F — LOOKAHEAD BIAS IN A BASELINE MEASUREMENT
*Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`, Part F. Recorded 2026-09-20.*

Framed in the source as *"the exact same rigor discipline, independently required and applied on the
**scoring/calibration side**, not just the strategy-research side"*, and:
> *"**an entire multi-day investigation's founding premise turned out to rest on a LOOKAHEAD-BIAS BUG
> IN THE BASELINE MEASUREMENT ITSELF, not in the thing actually being evaluated.**"*

### The sequence, as recorded
| Step | Figure |
|---|---|
| Baseline's own discrimination appeared strong | **+39.76 pp within-cell** |
| Live, fully-enriched model appeared much weaker | **+5.31 pp** |
| Apparent conclusion | *"the enrichment layer was actively destroying a good baseline"* |
| **Days of factor-by-factor diagnostic work followed** | — |
| **Cause found by a parallel thread** | *"the **'baseline as of date D' calculation genuinely included day D's own game results** — **a real lookahead bug, not a subtle statistical artifact**"* |
| Corrected baseline, using only data available **before** the prediction date | **+5.32 pp** |
| Live enriched model | **+5.31 pp** |

> *"**The entire premise was wrong: it was never 'enrichment destroys a strong baseline.' Both the
> baseline and the enrichment layer perform almost identically, and both are genuinely modest.**"*

### The generalisable rule, as stated
> *"**Before investigating why a component seems to underperform a supposedly-strong reference point,
> VERIFY THE REFERENCE POINT ITSELF as rigorously as the thing being blamed** — **a 'before' or
> 'control' measurement is JUST AS CAPABLE of containing a lookahead-bias or leakage bug as the
> 'after' measurement everyone's default instinct is to scrutinize.** …**check the control group with
> the same suspicion as the treat[ment].**"*

The source places it in the same family as lesson #11 (*a plausible causal story is not evidence*) and
Part C (*grouping-key contamination*), *"but applied to a baseline/reference measurement rather than a
candidate finding."*

It also records that the diagnostic work was not wasted: *"real bugs and data gaps were found and
remain valid — but the **framing** the whole investigation was measured against never actually
existed."*

### NBA state
- **Same bug class, same system family**: `backtest.baseline_v6_asof` leaking day D into `as_of_date =
  D` is recorded in T1 as relayed 2026-08-29 (see §3.10b of `NBA_BASELINE_CALIBRATION.md`).
- **NBA instances of as-of contamination**: the FRINGE anomaly (*"a season-wide mean using future
  games"*, T8) and the pasted calibration table (parity violation, live session).
- **NBA's verification surface**: `classification_ladder_v12.py` is `shift(1)`-based by construction,
  and the T9 production note states *"the backtest harness on a past day IS already the production
  computation — every feature is `shift(1)`-based."*
- **Corroborating figure**: NBA's own measured factor-layer effect is **Brier +0.1–0.3%** (T9), with
  the recorded note *"real but small… not where the big gains are."*

**Recorded as an open verification in `NBA_OPEN_ITEMS.md`.**

---

## 19. WHERE EDGE IS NOW EXPECTED TO COME FROM

### ⚠⚠ 15.0a THE HARD CONSTRAINT — two of the three platforms are measured EFFICIENT
> *"**Underdog/Sleeper's own EV-parity pricing, measured directly against real placed-slip data at
> scale (14,000+ REAL LEGS), showed `p × m` FLAT AND SLIGHTLY BELOW 1.0 ACROSS THE ENTIRE PROBABILITY
> RANGE** — these platforms price efficiently enough that **no simple probability-based selection
> works**."*

**They price per-leg DYNAMICALLY.** A better `p` earns nothing when `m` moves to match it.

**PrizePicks does not.** Its pricing is a **discrete step function over tiers** — *"a fixed multiplier
per tier"* — so **within a tier the price does NOT adapt to the leg's true probability.**

**That is the whole edge hypothesis, stated precisely:**
| Platform | Pricing | Can a better `p` pay? |
|---|---|---|
| Underdog, Sleeper | per-leg dynamic, `p × m` ≈ 1.0 flat | **No** — measured on 14,000+ legs |
| **PrizePicks** | **step function per tier** | **Yes, in principle** — the price is fixed within the tier |

**Two PrizePicks-specific mispricings follow:**
1. **The tier step** — two legs in one tier with materially different true probabilities carry the
   same factor (lesson #13: **~15% multiplier change for a ~2.6× probability gap**)
2. **Flex insurance tiers** — mispriced for pools far from their calibration profile; *"found true in
   principle for MLB but the real magnitude, when tested, still fell short"*

## 15.0c EXTERNAL CONFIRMATION THAT THE OPPORTUNITY EXISTS
*Source: T1, blueprint §4d. Recorded 2026-09-20.*

> *"**A real, useful piece of EXTERNAL VALIDATION worth carrying into NBA's own thinking:
> PROFESSIONAL SPORTSBOOKS THEMSELVES ACKNOWLEDGE that PLAYER-PROP MARKETS — ESPECIALLY FOR
> LOWER-PROFILE PLAYERS — ARE LESS EFFICIENTLY PRICED THAN GAME LINES.**
> **This is real, EXTERNAL CONFIRMATION that a GENUINE OPPORTUNITY EXISTS IN PROPS BROADLY, not
> something specific to baseball, and IT LIKELY APPLIES TO NBA PLAYER PROPS TOO.**"*

**Two things this adds to the edge picture:**

**1. It is sportsbook-side acknowledgement, not our own inference.** The claim that props are less
efficiently priced than game lines comes from the market makers themselves — which is a different
class of evidence from our measurements.

**2. The qualifier is specific and actionable: *"ESPECIALLY FOR LOWER-PROFILE PLAYERS."***
That points at the **low-line, low-minutes end of the board** — and it aligns with two independent
findings already recorded:
- **T7.15c**: *"for **low-line players (5.5 pts, 0.5 3PM)** the bet is **almost entirely on minutes
  and dud risk**"* — a different model regime, not merely a smaller number
- **`f_role`**: **fringe players miss by 0.0283 vs iron-men at 0.0008 — a 35× gap**

**So the place the market is least efficient is also the place our own model is least accurate.**
**That is not automatically an opportunity** — it may simply be where the irreducible noise is — **but
it is the intersection worth measuring first**, and it is measurable directly from `board_outcomes`
by role tier.

**⚠ Note the tension with §15.0a**: Underdog and Sleeper were measured at **`p × m` flat ≈ 1.0 across
the entire probability range** on 14,000+ real legs — i.e. **efficient**. **The sportsbook
acknowledgement is about SPORTSBOOK prop markets, not DFS pick'em pricing.** They are different
products, and the two findings do not contradict: **books may price props loosely while DFS operators
price their own product tightly.**

**What that implies for `rung_market`** (1.06M de-vigged book rungs): if book prop lines are
acknowledged as less efficient, then **the market-derived probability is a weaker reference than it
would be for game lines** — consistent with COMPASS 62's *"a confidence adjuster and ranking signal,
**not ground truth**."*
**MLB confirmed the tier mispricing and never harvested it** — *"every walk-forward selection attempt
(raw trailing hit rate, model-probability quintiles, appearance frequency) REGRESSED TO THE POOL
AVERAGE."*

**The mispricing is not the hard part — SELECTION is.** Everything in this document is selection
machinery, and the one asset MLB's failures lacked is a **calibrated** probability rather than a
trailing rate or a quintile rank.

**So the hypothesis is now narrow and testable:**
> **A calibrated per-leg probability, applied within PrizePicks' fixed-multiplier tiers, identifies
> which legs sit on the favourable side of a step the platform does not adjust for.**

**Unproven. One strong prior against (MLB's three failed selection methods). Two platforms already
excluded by measurement. And it is exactly what a live board tests.**

---

T9 predicted two sources. **One delivered, one did not.**
| Named source | Outcome |
|---|---|
| **Combo structure** | ✅ certified — P+R 0.9, R+A 0.9, fantasy 0.8 pp on the holdout |
| **Live enrichment** | ❌ ten candidates, **none survived** |

**The factor layer itself is small**: **Brier +0.1–0.3%**; *"a ±3% pace edge moves a 20-point player
~0.7 points — about **2 pp of probability**."*

**By elimination, the remaining edge rests on:**
1. **Calibration quality** — *"when the recipe says 75%, roughly 75% hit"*, which is what makes slip EV
   computable at all
2. **Combo structure** — per-player, archetype-dependent covariance
3. **The board-scoped tails** — *"the #1 area where a sharp baseline earns the most, because **naive
   book models mis-price tails**"*

**That third item is now a hypothesis by elimination, not just by design**, and it is testable the
moment real goblin/demon board data is in hand. **It should determine what the slip-building phase
optimises for.**

---

# 0.14-T23. 🔴🔴🔴🔴 **THE HYPOTHESIS ABOVE WAS TESTED ON `1.08 MILLION` LEGS — AND IT FAILED IN THE WORST DIRECTION** *(T23 pass 2, §T23.2, 2026-09-23)*

> ⚠⚠ **READ THIS DIRECTLY AFTER THE PARAGRAPH ABOVE.** *That paragraph says the tails are
> **"the #1 area where a sharp baseline earns the most, because naive book models mis-price tails"**,
> and calls it **"testable the moment real goblin/demon board data is in hand."*** **The data came in
> on `2026-09-21`. The test was run. `325` dates, both seasons, `1.08 M` PrizePicks legs.**

## 1. 🔴🔴🔴 **IT IS OUR TAILS THAT ARE MIS-PRICED, NOT THEIRS** *(`T23` SEG `391`, finding 5)*

| kind | ladder's implied | **actual** | direction |
|---|---|---|---|
| **goblins** *(24-25 / 25-26)* | `0.644` / `0.626` | **`0.685` / `0.659`** | 🔴 **UNDER-predicted** |
| **demons** *(24-25 / 25-26)* | `0.263` / `0.296` | **`0.246` / `0.257`** | 🔴 **OVER-predicted** |

> ⇒ 🔴🔴🔴 ***"The ladder's tails are too wide."*** **Both tails err outward, in both seasons, in the
> same direction.** ⚠ **This is the exact opposite of the hypothesis**: the premise was that the
> book's tails would be naive and ours sharp. **Measured, the book's standards are fair
> (`0.500` vs `0.500`) and OUR tails are the ones that miss.**

## 2. 🔴 **AND THE BOOK BEATS THE MODEL EVERYWHERE, NOT ONLY ON TAILS**

> *"**PrizePicks' pricing is the better forecast on every kind, both seasons. On standards the model
> is worse than a flat `50%`.**"* ⇒ ⚠ **"Worse than a coin flip on standards" is the sentence that
> should govern how this document's confidence layer is read** — *the layer is well-built and
> well-calibrated in its own terms (`§0.12-T22` and the sections above), and it is scoring a
> probability that is, on standards, beaten by `0.5`.*

## 3. 🔑🔑 **WHAT IT DOES *NOT* OVERTURN — and this matters for what to fix**

| ✅ survives | evidence |
|---|---|
| **the model RANKS** | realized value climbs monotonically with its claim in **both** seasons — `0.89 → 1.155` and `0.86 → 1.13` |
| **the calibration layer works** | *"calibration helps out of sample in both seasons, **and the larger the shift, the more it helps**"* |
| **demons underpay as a CLASS** | actual `0.246` vs implied `0.267`; `0.257` vs `0.286` ⇒ **`−8%` to `−10%`** — *a genuine, exploitable asymmetry, just not the one the hypothesis predicted* |

> ⇒ 🔑 ***The defect is CONFIDENCE, not ORDER.*** **Only `~21%` / `~17%` of the top bucket's claimed
> edge materialized — an over-statement of roughly `5×`.** *That is a shrinkage problem with a known
> sign, and this document's final-scoring layer is where it would be applied.*

## 4. 🔴🔴 **AND IT INDICTS THE `0.15` PLATT GUARD, WHICH LIVES IN THIS LAYER'S RECIPE**

> **The recipe discards Platt shifts above `0.15`.** **The measurement says the larger the shift, the
> more it helps** — with average shifts of `0.09–0.15` and **a max of `0.72`, ≈ `17` points at even
> odds** *(`T23` SEG `265`, open decision 1)*.
> ⇒ 🔴 ***A guard that discards exactly the corrections that help most, on a layer already measured as
> `5×` over-confident.*** ⚠ **`SEG 265` records this as an OWNER DECISION and says the deciding
> measurement is already prepared** — *it is not an oversight, it is a live, queued question.*

---

> 📌 **TIERS**: ⚠ **AS STATED IN `T23`** — all figures; quotations verbatim; **not re-run by this
> sweep**. 🔴 **`NOT RECORDED`** — whether the `≥1.40` strategy survives slip-level compression *(the
> author's own caveat says leg-level value **overstates big demons**, and those picks are
> `58%`/`80%` demons)*. ▶ **Full record and the other four findings: `§T23.2`; item `T23-1`.**

---

# 0.18b-T24. 📉 **§T24.8 — THE PER-PROP RESULTS, WHICH ARE WHAT THE NEXT PHASE ACTUALLY NEEDS**
*`T24` pass `8`, recorded `2026-09-23`. **`T24-2` item `1` asks for per-prop edge cells as the next
phase; these are the per-prop numbers that already exist, and they were in none of the twelve.***

### **A · FANTASY SCORE, conservative, realised value per leg** *(`2024-25` / `2025-26`)*
| leg | model `p` | actual | **realised** |
|---|---|---|---|
| goblin `2.2×`, a point harder | `0.62` | `0.67` | **`0.976` / `0.983`** |
| standard Over, centre `+1` | `0.45` | `0.47` | **`0.939` / `0.942`** |
| standard Under, centre `−1` | `0.46` | `0.42` | 🔴 **`0.851` / `0.841`** |
| demon `4.0×`, a point harder | `0.30` | `0.29` | 🔴 **`0.763` / `0.771`** |

✅ *Realised value climbs **monotonically** with the model's claim (`0.83` → `1.06`–`1.07` top
bucket, both seasons)* — **the model ranks Fantasy legs correctly.** 🔴 **And the best leg per
player-night returns `1.03`–`1.04`, BELOW the `3`-pick breakeven of `1.10`.** ⇒ ***Correct ranking
and insufficient level are different failures, and only the second one excludes the prop***
*(`T24-2` item `7`)*. ⚠ *"Real lines may show the one-point penalty is too harsh. Revisit on the NBA
preseason board."*

### **B · DERIVED PROPS at claimed ≥`1.30`** *(`2024-25` / `2025-26`; group realised `1.063 ± 0.017` / `1.093 ± 0.016`, below `1.10`)*
| prop · side | legs | `2024-25` | `2025-26` |
|---|---|---|---|
| ✅🔑 **FTM Over** | `364` *(hit `65%`)* | **`1.293`** | **`1.322`** |
| **FTA Under** | `112` | `1.294` | `1.205` |
| **FTM Under** | `140` | `1.258` | `1.205` |
| 3PA Over | — | `1.144` | `1.089` |
| 3PA Under | — | `1.034` | `1.125` |
| FGA Over | — | `1.061` | `1.092` |
| FGA Under | — | `1.006` | `1.085` |
| DREB Under | — | `0.988` | `0.990` |
| 🔴 **OREB Over** | — | **`0.757`** | **`0.944`** — *fails* |

🔑🔑 ***FREE THROWS ARE THE CANDIDATE FAMILY, and they are the only one that clears `1.10` in both
seasons.*** *`FTM Over` at `1.293`/`1.322` on `364` legs with a `65%` hit rate is the single
strongest derived cell.* ⚠ **Conditional on the preseason validating the proxy lines** — *these are
simulated lines, not real ones.*

### **C · AND ON REAL LINES, THE LOW-COUNT PROPS CARRY EDGE ON BOTH SIDES**
*From the Under-artifact investigation — **these use REAL PrizePicks lines, not simulated ones**,
which makes them the more trustworthy half of this section:*

| prop | Under | Over |
|---|---|---|
| **steals** | **`1.390`** | `1.319` |
| **turnovers** | `1.286` | `1.255` |
| **blocks** | — | **`1.354`** |

*Top picks, `60`–`70%` hit.* 🔑 ***Edge on BOTH sides of the same prop is the signature of a real
mispricing rather than a directional bias*** — *and it is the observation that separated the genuine
low-count edge from the `~80%`-Unders artifact that first produced it.*

---

# 0.18-T24. 📐 **§T24.5 — THE DERIVED-LINE ESTIMATOR TABLE, WITH ITS SAMPLE SIZES** *(`RULE 56`)*
*`T24` pass `5`, recorded `2026-09-23`. **The twelve referenced "`§4.4`'s points-scaled estimators"
without ever carrying the table that chose them.** ⚠ `T24` is a secondary source.*

### **Test 1 — mean absolute miss against REAL BOOK LINES** *(pretend-unknown, `12` nights)*
| stat | **n** | median | mean | points-scaled | **winner** |
|---|---|---|---|---|---|
| **threes** | **`1,179`** | `0.535` | `0.396` | ✅ **`0.326`** | **points-scaled** *(`79%` within `0.5`)* |
| **rebounds** | **`1,305`** | `0.876` | `0.703` | `0.720` | blend `0.678` / mean |
| **assists** | **`1,245`** | `0.671` | ✅ **`0.516`** | `0.529` | **mean** |
| **blocks** | **`1,032`** | `0.477` | ✅ **`0.279`** | `0.285` | **mean** *(`92%` within `0.5`)* |
| steals / turnovers | — | `0.48`–`0.51` | ✅ **`0.32`–`0.37`** | `0.34`–`0.40` | **mean** |

🔑 **The `30`-day MEAN beats the median everywhere** *(the median runs `0.1`–`0.25` low)*, **and
scoring-volume stats want tonight's POINTS line** — *it carries minutes and role.*

### ⚠⚠ **THE APPARENT CONFLICT, AND ITS RESOLUTION — worth more than either result**
*The Fantasy fallback uses **MEDIANS** and was validated that way. This table says **MEANS** win.*
> ***"The targets differ. Fantasy centres are calibrated against the OUTCOME MEDIAN (medians win);
> here the target is the BOOK LINE (means win). Both hold."***

🔑🔑 ***Two correct answers to "mean or median?" because they are answers to two different
questions.*** **Any future reader who finds one of these and applies it to the other target will be
wrong, and nothing will tell them** — *which is why the resolution is recorded with the tables rather
than left to be re-derived.*

### 🔴 **What the books actually quote** *(NBA archive, `6` sample nights)*
*points, rebounds, assists, threes and the four combos `~110`–`118` players/night · **blocks `~94`** ·
double-double `~90` (books only) · steals `~58` · blocks+steals `~45` · turnovers `~25` (DraftKings
only).* **NO BOOK MARKET AT ALL** *for FG attempted/made, free throws, `3`-PT attempted,
offensive/defensive rebounds, quarter props.*
⚠ ***Surprise, and it redirects the work: books quote BLOCKS widely — so the Fantasy fallback mostly
covers steals and turnovers, NOT blocks.***

### 📊 **The per-season splits the totals were hiding** *(dated `2026-09-22`; `prop_universe` is mid-rebuild)*
`fs_backsim` **`32,170`** = `15,916` *(`2024-25`)* + `16,254` *(`2025-26`)* ·
derived standards **`179,712`** = `88,886` + `90,826` ·
the floor fix changed **`1,024`** goblin keys, all cheaper ·
in the universe, **`80,756`** real goblins fell below the old conservative floor and **`20,738`** sit
at the new `1.843×` minimum.

⚠ **`RULE 54`.** *`WINDOW`: `T24`'s own reported figures, `2026-09-22`; **not independently
re-derived here** — `T24` is a session record and its queries are not reproducible from the file.
🔴🔴 **CORRECTION, ONE PASS LATER (`§T24.6`).** *This note first read:* ~~*"test `2`'s outcome-MAE
table is already carried in `NBA_MASTER_SUMMARY.md` and is not repeated here."*~~ **I asserted that
without checking it. `grep` for `2.971`, `2.022`, `1.689` across `NBA_MASTER_SUMMARY.md` returns
`0`.** ⇒ ***The table was not anywhere. Here it is.***

### **Test 2 — best estimator against NBA OUTCOMES** *(a proxy for a sharp line, for props the books do not quote)*
*Benchmark: **the book POINTS line has outcome MAE `5.14` with `50.5%` Over.** The proxy ranks threes
the same way test `1` does, so it is trustworthy where no line exists.*

| prop | best estimator | outcome MAE | Over rate |
|---|---|---|---|
| **FGA** | points-scaled | **`2.971`** *(identity `2.986`; best centred `50.2%`)* | `51.5%` |
| **FGM** | points-scaled | **`2.022`** | `50.6%` |
| **FTA** / **FTM** | points-scaled | **`1.882`** / **`1.620`** | `44.0%` / `42.8%` |
| **3PA** | points-scaled | **`1.689`** | `44.6%` |
| **OREB** / **DREB** | 🔑 **rebounds line × the player's own share** | **`0.991`** / **`1.667`** | `42.9%` / `46.0%` |
| ⚠ *and the estimator that LOSES* | **threes-line-scaled for 3PA is the WORST at `2.073`** | — | — |

🔑🔑 ***The intuitive estimator for `3PA` — scale the threes line — is the worst one tested.*** *Points
carries minutes and role; the threes line carries only the threes projection. **A reader reaching for
the obvious proxy would pick the losing one**, which is why the loser is recorded next to the
winners.*

📌 *Lesson recorded about my own pass, not about the system:* **"already recorded elsewhere" is a
claim, and it needs the same grep as any other claim.** *This is the second such slip today
(`§T23.7`'s same-game retraction was the first) and both were caught by re-probing my own writes —
which is now a standing step, not a courtesy.*

⚠ *`RULE 54` continues:* ***`NOT DONE`: `T24`'s figures are not independently re-derivable*** — it is
a session record, and its queries are not stored.*

---

# 0.17b-T23. 🔴🔴 **§T23.16 — THE TWO SILENT BUGS THAT SURFACED DURING THE CALIBRATION REBUILD**
*`T23`, `2026-09-21`, recorded `2026-09-23`. **Neither produced an error. Both produced wrong
numbers, for months, in a table the scoring engine reads on every run.***

### 🔴 **BUG 1 — CALIBRATION ONLY EVER COVERED THREE PROPS OUT OF EIGHT**
> ***"Calibration only ever covered POINTS, REBOUNDS and ASSISTS. A naive name mapping meant THREES
> and ALL FOUR COMBOS never matched — the exact trap the scorer's own header warns about."***

| | |
|---|---|
| cells before the fix | **`3,639`** *(`3` props)* |
| cells after | ✅ **`9,904`** *(all `8` props)* |
| what was uncalibrated the whole time | 🔴 **`threes`, `pra`, `pts_reb`, `pts_ast`, `reb_ast`** |

🔑🔑 ***Five of the eight props — including `pra`, the combo markets, and the ones `§T22.13` measures
at `14.3%`, `13.2%`, `11.2%` and `10.9%` of the board — were scored with NO as-of calibration
applied, and nothing reported a failure.*** ⚠ **The scorer's own header warned about exactly this
class of name mismatch.** ⇒ ***A warning written into the code that the code then walked into.***

### 🔴 **BUG 2 — THE SCORER AND THE BUILDER DISAGREED ABOUT WHAT SEASON PHASE A DAY IS IN**
> ***"The scorer and builder defined season phases differently, so on `60` of `348` days the WRONG
> PHASE's corrections were applied."***

**`17.2%` of days received calibration cells fitted for a different phase.** *(`phase` is
`1_oct_nov` / `2_dec_asb` / `3_post_asb` / `4_push`.)* ✅ **Fixed: `60` disagreeing days → `0`,
proved locally across both seasons before any compute was spent.**

🔑 ***Two components each had a correct phase rule and they were not the same rule.*** **Neither side
was wrong in isolation — which is precisely why nothing failed.** ⇒ *`§T20`'s standing lesson that
config can describe the design while the code does something else, in its sharpest form: **here two
pieces of CODE described the same concept differently**, and the disagreement was only visible by
computing both and diffing them.*

### 📢 **§T23.18 — THE BUILDER PRINTED `wrote 0 as-of cells` AS IT WIPED THE TABLE, AND NOBODY READ IT**
*Both log lines recovered from the workflow run logs, to the second.*

| | **the wipe** | **the rebuild** |
|---|---|---|
| timestamp | 🔴 **`2026-09-20T03:24:06`** | ✅ `2026-09-21T07:22:33` |
| graded legs seen | `8,589` | `21,968` |
| dates · as-of refits | `1` · `1` | `1` · `1` |
| 🔴 **cells written** | **`wrote 0 as-of cells`** *(`0` from current-season evidence, `0` inherited)* | **`computed 696 as-of cells`** *(`0` current, **`696` inherited from the prior season**)* |
| carried forward as next season's opening prior | `47` | `128` |

🔑🔑🔑 ***THE FAILURE WAS NOT SILENT. IT PRINTED `wrote 0 as-of cells` IN PLAIN ENGLISH, THE
CERTIFIER CAUGHT IT AND TURNED THE JOB RED, AND NOBODY FOLLOWED UP.***
⇒ ⚠⚠ **This corpus already names the worse case — `§T22`'s certifier trilemma: *"an alarm that fires
unread is a stronger false assurance than no alarm at all."*** **Here is that case, dated, with the
log line it printed.** *The system did everything it was built to do except be read.*

📌 **AND THE REBUILD'S LOG CARRIES ITS OWN CAVEAT IN THE SAME BREATH**: **`696` of `696` cells are
*inherited from the prior season*, `0` from current-season evidence** — *which is `§T23.10`'s
"`2025-26` is calibrated only from `2024-25`", visible in the builder's own output rather than
inferred.*

### 🔍 **§T23.18b — AND BUG `1`'s MECHANISM, WITH ITS COST ON ONE DAY**
*From `score_board_legs.py`'s own comment, which is a warning written by the author of the trap:*
> ***"This mapping is not optional string-stripping: a naive `replace(market_key,'player ','')`
> yields `"points rebounds assists"`, which matches nothing in our baseline — we call it `"pra"` —
> and would have silently dropped the six largest combo groups. **`pra` alone is `15,156` legs on
> that date.**"***

⇒ 🔑 ***The board's vocabulary and the baseline's vocabulary are different languages, and the
translation table is load-bearing.*** **`market_to_prop` is not a convenience — it is the only thing
standing between the scorer and silently dropping the six largest prop groups.** *Every board key is
recorded there with a verified home; `threes` ↔ `threes made` is the one that reads like a typo and
is not.*

### ✅ **THE THIRD FIX — THE WIPE CANNOT RECUR**
*`P2` no longer passes a single season, and **the builder now computes BEFORE deleting and refuses to
write an empty build.*** 🔑 ***The original defect was ordering: delete-then-compute, with no guard on
an empty result.*** *That is the same shape as `F6-1`'s loader and `§T23.11`'s `final_hp` churn —
**this system rebuilds by deleting first, in at least three places, and only one of them now has a
guard.***

⚠ **`RULE 54`.** *`WINDOW`: the rebuild of `2026-09-21`, both seasons, `348` days. **`60 of 348` and
`3,639 → 9,904` are reported by the session that made the fixes**; the resulting `9,904` is
independently confirmed live in `NBA_DATABASE.md` `§T23.11`. **`NOT DONE`: how long bugs `1` and `2`
had been live was not established** — *the cells they produced were deleted by the wipe, so the
evidence of their duration went with it.*

---

# 0.17-T23. 📊 **§T23.10 — THE CALIBRATION SHIFT TABLE, AND THE GUARD THAT DOES NOT EXIST ON THIS BUILDER**
*`T23` pass `10`, live queries `2026-09-21`, recorded `2026-09-23`.*

**`nba_score.ladder_calibration_asof` after the rebuild: `8` props × `1,254` cells × `24` as-of dates.**

| prop | cells | avg abs shift | 🔴 **max abs shift** | evidence legs (own) |
|---|---|---|---|---|
| **`points`** | `1,254` | **`0.1495`** | **`0.660`** | `5,934,872` |
| **`pra`** | `1,254` | `0.1351` | `0.544` | `4,753,832` |
| **`reb_ast`** | `1,254` | `0.1311` | 🔴 **`0.703`** | `2,687,849` |
| *(the other five props)* | `1,254` each | `0.09`–`0.15` | — | — |

🔴🔴 **A shift of `0.703` log-odds is roughly `17` percentage points at even odds.**

### ⚠⚠ **THE FINDING IS NOT THE SIZE — IT IS THAT TWO PARTS OF THIS SYSTEM DISAGREE ABOUT WHETHER THAT SIZE IS ALLOWED**

| | |
|---|---|
| **the ladder recipe** | 🔑 **discards shifts above `0.15`** |
| **the documented MLB lessons** | 🔑 *reject implausibly large corrections* |
| 🔴🔴 **the as-of calibration builder** | **has NO such guard** |

⇒ ***The average shift on `points` — `0.1495` — sits a thousandth below the threshold the recipe uses
to throw a shift away.*** **And the maxima are `4.4×` it (`points`, `0.660`) and `4.7×` it
(`reb_ast`, `0.703`).** **Every one of those cells is applied.**
*(Arithmetic re-derived `2026-09-23`: `0.660/0.15 = 4.4`, `0.703/0.15 = 4.7`; and at `p = 0.5` a
`0.703` log-odds shift gives `0.6689`, i.e. **`16.9` percentage points**, which is what "roughly `17`"
above means.)*

📌 **RECORDED AS AN OWNER DECISION, not a fix** *(it is a code change to a live builder)*: **should the
as-of builder carry the recipe's `0.15` guard?** ⚠ *`T23` put the question and did not answer it.
**The two defensible answers point opposite ways** — the recipe's guard exists because a large shift
usually means a bad fit, and the as-of builder's shifts are fitted on `2.7 M`–`5.9 M` legs per prop,
which is exactly the case where a large shift might be real.*

### 🔴 **AND THE SECOND HALF OF THE SAME PROBLEM: `2025-26` IS CALIBRATED ONLY FROM `2024-25`**
*The final engine ran on **just one `2025-26` date**, so the second season **has no calibration
evidence of its own**. Running the engine across `2025-26` fixes it — a heavier job.* 🔑 ***A
calibration APPLIED to a season is not a calibration FITTED on it, and this document should not be
read as claiming the latter for `2025-26`.***

### 📉 **THE CLAIMED-vs-REALISED TABLE THE THRESHOLD SWEEP RESTS ON** *(threshold `1.25`)*
| season | segment | legs | claimed | 🔴 **realised** | s.e. |
|---|---|---|---|---|---|
| `2024-25` | **demon** | `14,498` | `1.589` | **`1.1220`** | `0.0164` |
| `2025-26` | **demon** | `42,212` | `1.674` | 🔴 **`1.0498`** | `0.0102` |
| `2024-25` | **standard over** | `3,922` | `1.375` | **`1.1316`** | `0.0158` |

⇒ ***Demons claim the most and realise the least, and the gap WIDENS in the season with `3×` the
volume*** *(`1.589 → 1.122` becomes `1.674 → 1.050`)*. **Standard overs claim less and keep more.**
🔑 ***That single contrast is why `T23-1`'s answer is "standards-only" rather than "no".***

### 🔬 **THE SHRINKAGE TEST THAT SETTLED THE NEXT STEP — and why it changed no pick**
| kind | `k` fit on `2024-25` | `k` if fit on `2025-26` | Brier: **price** | **model** | **blend, out of sample** | blend gain |
|---|---|---|---|---|---|---|
| **demon** | `0.315` | `0.279` | **`0.18411`** | `0.18972` | **`0.18314`** | `+0.00097` |
| **goblin** | `0.212` | `0.277` | **`0.22016`** | `0.22767` | **`0.21894`** | `+0.00122` |

✅ **The blend beats the price out of sample on every leg kind — the model carries REAL SIGNAL.**
🔴 **And it cannot change a single pick**: *"the blended value is just a rescaled copy of the model's
own, so **every leg keeps its rank**."* ⇒ ***A measurable improvement in CALIBRATION that is exactly
zero improvement in SELECTION.*** **`RULE 55` in its purest form: the number is real and the
conclusion it looks like it supports does not follow from it.**

⚠ **`RULE 54`.** *`WINDOW`: `ladder_calibration_asof` and the `1.08 M`-leg comparison table at
`2026-09-21`, both seasons, threshold `1.25`. **`claimed` is the model's own value estimate and
`realised` is the outcome-weighted payout** — not a hit rate. **`NOT DONE`: five of the eight props
were returned by the query and only their RANGE is recorded here**, because the three shown bracket
it.*

---

# 0.16-F2. 🔴🔴🔴 **THE THRESHOLD SWEEP AND ITS LEAKAGE CONTROL — `T23` RAN BOTH, AND THE TWELVE RECORD NEITHER**

*Recovered 2026-09-23 by the full transcript re-sweep, `§F2.4`. `§F2.1` ranked `T23` the
**second-least-covered** transcript of twenty-four — **93.8% uncovered, high band `40`** — and this
is what was in the gap. **In scope**: `nba_market.pp_model_vs_price` is **not** on the concurrent
session's exclusion list, and nothing here touches `pp_payout_map.py`, `pp_price`, `pp_price_key`,
`pp_leg_price`, `pp_pricing_model` or `pp_slip_rules`.*

**Before this section, the twelve carried the HEADLINE of `T23`'s backtest (`T23-1`, `§0.14-T23`) but
none of the grid that produced it.** Verified: `pp_model_vs_price` appeared in **`0` of the twelve**;
so did every figure below.

## 1 · The design, read off the SQL rather than described

**Population** `nba_market.pp_model_vs_price`, `kind = 'standard'`, `leg_result IS NOT NULL`.
**One leg per player-day** — `DISTINCT ON (game_date, player)` ordered by model value `mv = 2 ×
final_hp` descending, so a player can contribute at most once a day and it is his best leg.
**Slips packed greedily** by `mv` rank within a day. **Voids** (`push`/`dnp`) shrink the slip and
re-price it at the smaller base; **a slip that shrinks below 2 legs pays `1.0`** *(stake returned,
`roi` contribution `0`)*. **Payout base**: `2 → 3.0` · `3 → 6.0` · `4 → 10.0` · `5 → 20.0` ·
`6 → 37.5`.

## 2 · 🔴 THE GRID — `3` thresholds × `5` pick counts × `2` seasons

**`ROI` per slip (`avg(payout) − 1`), `SE`, and leg hit rate.** *`29` of the `30` returned rows are
recovered; the thirtieth (`1.40` / `6` picks / `2025-26`) is cut off by the transcript segment
boundary and is **`NOT RECORDED`** rather than estimated.*

| threshold | picks | **2024-25** `ROI` (SE) · leg hit | **2025-26** `ROI` (SE) · leg hit |
|---|---|---|---|
| **1.20** | 2 | 🔴 **−0.0406** (0.0191) · 0.5673 · *5,073* | +0.0230 (0.0176) · 0.5787 · *6,291* |
| | 3 | +0.0662 (0.0388) · 0.5674 · *3,353* | **+0.1852** (0.0365) · 0.5785 · *4,169* |
| | 4 | +0.0669 (0.0604) · 0.5677 · *2,497* | +0.2032 (0.0575) · 0.5794 · *3,105* |
| | 5 | +0.1863 (0.1034) · 0.5680 · *1,981* | +0.4385 (0.1019) · 0.5789 · *2,472* |
| | 6 | +0.4637 (0.1747) · 0.5684 · *1,638* | +0.7110 (0.1701) · 0.5789 · *2,047* |
| **1.30** | 2 | 🔴 **−0.0065** (0.0242) · 0.5754 · *3,225* | +0.0483 (0.0220) · 0.5869 · *4,058* |
| | 3 | **+0.1026** (0.0495) · 0.5750 · *2,125* | **+0.2350** (0.0462) · 0.5878 · *2,681* |
| | 4 | +0.0871 (0.0766) · 0.5755 · *1,573* | +0.2455 (0.0730) · 0.5873 · *1,988* |
| | 5 | +0.2219 (0.1315) · 0.5757 · *1,244* | +0.4778 (0.1293) · 0.5878 · *1,574* |
| | 6 | +0.6024 (0.2306) · 0.5762 · *1,025* | +0.8101 (0.2187) · 0.5877 · *1,301* |
| **1.40** | 2 | +0.0228 (0.0330) · 0.5861 · *1,757* | +0.0965 (0.0294) · 0.6012 · *2,343* |
| | 3 | +0.1761 (0.0689) · 0.5860 · *1,147* | +0.3211 (0.0627) · 0.6021 · *1,532* |
| | 4 | +0.1812 (0.1086) · 0.5856 · *839* | +0.2813 (0.0978) · 0.6003 · *1,134* |
| | 5 | +0.4821 (0.2005) · 0.5865 · *641* | +0.6742 (0.1827) · 0.6039 · *890* |
| | 6 | +0.9766 (0.3523) · 0.5864 · *535* | ⚠ **`NOT RECORDED`** *(segment truncated)* |

🔑 **Three structural readings, and all three are visible only because the grid exists:**

1. 🔴 **THE 2-PICK IS THE ONLY LOSING CELL, AND IT LOSES IN THE OLDER SEASON AT BOTH LOW
   THRESHOLDS** — `−0.0406` at `1.20`, `−0.0065` at `1.30`. **At `1.40` it turns positive
   (`+0.0228`).** *Every one of the other `25` recovered cells is positive.*
2. **`ROI` RISES MONOTONICALLY WITH PICK COUNT** in every threshold × season block — **and so does
   the SE**, from `0.019` at 2 picks to `0.35` at 6. ⚠ ***The 6-pick cells are the biggest numbers
   and the weakest evidence: `+0.9766 ± 0.3523` on `535` slips is under 3 SE from zero, and the
   slip counts fall by 10× from the 2-pick row.*** **Read the 3- and 4-pick rows, not the 6.**
3. **LEG HIT RATE RISES WITH THRESHOLD AND IS FLAT IN PICK COUNT** — `0.567 → 0.575 → 0.586`
   (2024-25) and `0.579 → 0.587 → 0.602` (2025-26) across `1.20/1.30/1.40`. 🔑 ***That is the
   threshold doing what a threshold is supposed to do, and it is the cleanest evidence in the block
   that the model's ordering carries information — it is measured per LEG, so it is untouched by the
   slip-packing, the void rule and the payout table.***
4. **2025-26 beats 2024-25 in every single cell.** *Whether that is a better model, an easier
   season, or the season the model was developed against is **`NOT RECORDED`**.*

## 3 · ✅✅ THE LEAKAGE CONTROL — **the author flagged the objection and then ran it**

**The hindsight risk, in the session's own words: *"spotting a hindsight bias from selecting stale,
pre-move lines."*** **The control: split every leg by whether its `(game_date, player, prop)` had
`COUNT(DISTINCT line) = 1` — the line NEVER MOVED — and re-run.** *A stale-line advantage, if real,
lives entirely in the legs whose line moved, so it must vanish in the never-moved subset.*

| threshold · picks | season | **all lines** | **line never moved** | share of moved legs, all-lines |
|---|---|---|---|---|
| 1.30 · 3 | 2024-25 | +0.1026 | 🟢 **+0.1419** | 0.214 |
| 1.30 · 3 | 2025-26 | +0.2350 | +0.1867 | 0.260 |
| 1.30 · 4 | 2024-25 | +0.0871 | 🟢 **+0.0969** | 0.214 |
| 1.30 · 4 | 2025-26 | +0.2455 | +0.2422 | 0.261 |
| 1.40 · 3 | 2024-25 | +0.1761 | +0.1032 | 0.226 |
| 1.40 · 3 | 2025-26 | +0.3211 | 🟢 **+0.2897** | 0.271 |
| 1.40 · 4 | 2024-25 | +0.1812 | +0.1103 | 0.228 |
| 1.40 · 4 | 2025-26 | +0.2813 | 🟢 **+0.3602** | 0.271 |

✅✅ **THE CONTROL DOES NOT COLLAPSE THE EDGE, AND IT MOVES IN BOTH DIRECTIONS — `4` of `8` cells go
UP when moved lines are removed.** 🔑 ***A stale-line artifact has a sign. This does not: the
never-moved subset is higher in half the cells and lower in the other half, and every gap is inside
the SEs in §2.*** **⇒ the `T23` backtest's edge is not explained by selecting pre-move lines** —
which is the strongest objection available to it, raised by the author and answered by the author.

⚠⚠ **RULE 54 — what this control does and does not license.**
**It rules out ONE leakage channel: line movement.** It says nothing about the others, and the
`T23-1` caveats stand **unchanged and in full**: this is a **replay, not a traded record**;
`nba_score.paper_picks` holds **`0` rows**; the figures are `T23`-sourced and **were not re-run by
this sweep**; and `§0.14-T23`'s own open caveat — whether a `≥1.40` strategy survives slip-level
compression — **is untouched by this block**. *Note also that `1.40` is exactly the threshold whose
demon-heavy composition that caveat is about, and the 3-/4-pick `1.40` cells here are the ones a
reader is most likely to act on.* **`NOT RECORDED`: the slip-level compression check for any cell in
this grid.**

📌 ***Why this was missing.*** *`T23-1` and `§0.14-T23` recorded the VERDICT — "standards-only clears
the 3-pick breakeven in both seasons". **The grid is what makes the verdict operational**: which
threshold, at which pick count, with what SE and what sample. **A verdict without its grid cannot be
acted on and cannot be falsified**, and 93.8% uncovered is what that looked like from outside.*

## §F6.3 — 🔑 **THE ONLY EXTERNAL BENCHMARK IN THE CORPUS — and our numbers sit inside it**

*Added 2026-09-23, `§F6.3`. Recovered from `T17`'s research stratum; **in `0` of the twelve** —
`35.81`, `57.19` and "bootstrap confidence interval" each returned `0` hits.*

**A published study's two-sided 95% bootstrap confidence intervals for sports-betting ROI, by
sport** *(the transcript's "Table 5", panel D, weighted percentile intervals)*:

| sport | **ROI %** | EV threshold | epsilon | % of games bet |
|---|---|---|---|---|
| NFL | 5.92 – 41.32 | 0.00 – 0.05 | 0.08 – 0.34 | 0.30 – 0.85 |
| 🔑 **NBA** | **1.66 – 25.58** | 0.00 – 0.04 | 0.12 – 0.49 | **0.11 – 0.60** |
| NCAAB | 2.51 – 19.49 | 0.00 – 0.03 | 0.14 – 0.38 | 0.23 – 0.58 |
| NCAAF | 2.03 – 19.68 | 0.00 – 0.05 | 0.01 – 0.41 | 0.36 – 0.73 |
| WNBA | 6.43 – 43.06 | 0.01 – 0.15 | 0.13 – 0.32 | 0.38 – 0.93 |

*Panel A (simple high-density intervals) gives NFL `7.04 – 35.81`, NCAAB `1.36 – 16.08`, NCAAF
`1.10 – 16.00`, WNBA `8.72 – 57.19` — **and no NBA row**, which is itself worth noting.*

🔑🔑 **WHY THIS MATTERS FOR `T23-1`.** *This corpus's central open question is whether the model beats
the book. Its best numbers — **`+15.8%` replay, `+14.5%` simulator, `§2`'s `1.30`/3-pick cells at
`+10.3%` / `+23.5%`** — have had **nothing external to be measured against**.* **They sit inside
this published NBA interval (`1.66 – 25.58%`), comfortably and unremarkably.**

⇒ ***That is the right reading and it cuts both ways: the result is NOT implausible — it is squarely
within what the literature reports achievable — and it is NOT exceptional either.*** 📌 **A number
with no benchmark invites both over- and under-belief; this is the first thing in the corpus that
bounds it.**

⚠⚠ **RULE 54 — and the caveats here are serious.** *The transcript records the TABLE, not the
paper: **its source, method, sport-season coverage, bet type (game lines vs player props) and
whether "ROI" is per-bet or per-unit-staked are all `NOT RECORDED`.*** **A game-line ROI interval is
not automatically comparable to a player-prop slip ROI.** ***So this is recorded as ORIENTATION, not
as a test `T23-1` passes*** — and a reader who wants to lean on it must find the paper first.

---

## §F6.13 — 🔑🔑 **WHAT SURVIVED THE `A2` RETRACTION, AND THE ONE SLICE THAT IS STILL OPEN**

*Added `2026-09-23`, `§F6.13`. Source: **LIVE** `nba_config.classification_config`,
`config_key = 'enrichment_reality_check_2026_09_13'`, `updated_at 2026-09-13T19:25:18.669Z`,
`notes: "Reality check: the certified baseline beats every enrichment factor at leg level. A2
shipped-claim retracted."` This is the same row that produced `§F6.12`. `§F6.12` recorded the
RETRACTION; this section records the three parts of the row that the retraction did **not**
cover — what the session kept, what it says to test next, and the deltas behind the verdict.*

> # 🔴🔴🔴 **RETRACTION — READ THIS BEFORE THE REST OF `§F6.13`**
>
> ***Most of this section recovered nothing. It duplicates `0a-T15-SUPERSESSION` above, which is in
> this same document, roughly two hundred lines up.*** *Re-probed `2026-09-23` at commit
> `800109b2~1` — the state before `§F6.13` was written — **case-insensitively and in the corpus's
> own spelling**, which is what the first probe failed to do:*
>
> | what `§F6.13` claimed was in `0` of `12` | where it already was |
> |---|---|
> | 🔴 the `−0.051` / `−0.013` slice deltas *(`§3`)* | **`FSC` `0a-T15-SUPERSESSION`, verbatim** — *"is where it does WORST (`−0.051` vs `−0.013` on low novelty)"* |
> | 🔴 the whole slice table *(`§3`)* | **already there WITH TWO MORE COLUMNS** — `shrunk_novelty_A2`, `novelty_A2` AND `flat_A2` per slice, `[LIVE-AUDIT]`-verified from `nba_score.factor_gate_results` |
> | 🔴 the `next_test` day-before-cutoff quote *(`§2`)* | **verbatim, under its own heading** — *"A2 IS NOT CLOSED AS 'NO SIGNAL' — IT IS CLOSED AS 'NOT YET MEASURED WHERE SIGNAL COULD BE'"* |
> | 🔴 *"any test that reads the same report for both layers measures double-counting"* *(`§2`)* | **already there, WITH ITS OWN COVERAGE CENSUS** — "`7` of the thirty, `5` of the twelve" |
> | 🔴 the `why` quote, *"being more aggressive when the situation is LEAST predictable is backwards"* *(`§4`)* | **verbatim** |
> | 🔴 the four forms *(`§4`)* | **already corrected once above** — see the `§4` note |
>
> 🔑🔑 ***The earlier section is BETTER than the one I wrote: it has more columns, it is
> `[LIVE-AUDIT]`-verified against the table rather than read off a config row, and it already
> carries the coverage census my section was supposedly performing.*** **I did not read `200` lines
> up in the file I was editing.**
>
> ✅ **WHAT ACTUALLY SURVIVES, and it is two things:**
>
> | ✅ | the fitted usage allocation's **`−0.024`** — `§1` below. *Re-verified: the four `0.024`-ish hits in the twelve are `is_home` betas `≈0.0246`, a `0.0242` in a threshold grid, and a `0.024` in a `RECIPE` table — **all different numbers.** The gap is real.* |
> |---|---|
> | ✅ | the `09:00 ET` **scratch-after-cutoff** framing — `§2`. *The earlier section says the separating population "has not been built"; **it does not say WHERE the baseline's blindness begins**, and the mechanism (`build_baseline_ladder.py`'s `09:00 ET` roster freeze) is what makes the slice narrow and definable.* ⇒ **That, plus the source-level finding in `F6-2` that `cutoff_ts()` cannot express a day-before cutoff at all, is the item's reason to exist.** |
>
> 📌 ***`§3` and `§4` below are left in place, struck at the head, because the retraction is only
> legible beside what it retracts — and because a reader arriving at `§F6.13` from the run log must
> be sent upward, not merely told "nothing here".***

### 0 · 🔬 ~~The absence test that selected this section — stated before the section was written~~ 🔴 **THE TEST THAT FAILED**

*Every string below was grepped across all twelve at pinned commit `07b5b303`, per `RULE 53`.
**WINDOW: the twelve mandated documents only** — `NBA_COMPASS.md` and the other `nba/*.md` are
outside it and are not counted.* 🔴🔴 ***AND ELEVEN OF THE FOURTEEN ROWS BELOW ARE WRONG*** — *not
because the greps mis-ran, but because they were run in ONE spelling, case-sensitively, against a
corpus that writes the same facts as English prose with hyphens and capitals. **The table is kept as
the evidence of how a `0`-of-`12` census fails.***

| String from the live row | In the twelve, before this section |
|---|---|
| `-0.024` | **`0` of `12`** |
| `scratch announced` | **`0` of `12`** |
| `day-before-baseline` | **`0` of `12`** |
| `Everything else about an absence is already in recent form` | **`0` of `12`** |
| `narrow, well-defined slice` | **`0` of `12`** |
| `day-before injury cutoff` | **`0` of `12`** |
| `-0.051` | **`0` of `12`** |
| `-0.013` | **`0` of `12`** |
| `magnitude refit` | **`0` of `12`** |
| `baseline minutes residual` | **`0` of `12`** |
| `flat multiplier` | **`0` of `12`** |
| `measures double-counting` | **`0` of `12`** |
| `LEAST predictable` | **`0` of `12`** |
| `absorbs shots` | **`0` of `12`** |

⚠ **AND ONE STRING THAT WAS NOT A GAP — `RULE 53` and the `§F2.3` lesson, applied to myself.**
*`graded blind` returned **`1` of `12`** on this pass and I nearly recorded it as already covered.
It is in `NBA_FINAL_SCORING_CALIBRATION.md:1532` — **which is my own `§F6.12` text, committed
`32a4ad35` forty minutes earlier.** Checked against the pre-write commit: `git show
971f3cbe~1:nba/NBA_FINAL_SCORING_CALIBRATION.md | grep -c 'graded blind'` → **`0`**. **So it WAS a
gap, and `§F6.12` closed it — the verification did not find it pre-existing, it found my own
writing.** 🔑 ***This is `§T20.136`'s failure and `§F2.3`'s repeat of it, caught on the third
occurrence by the habit those two forced: when a verification count moves in the direction that
flatters the verifier, check which commit put it there before believing it.***

### 1 · 🔑 **WHAT SURVIVES — the four things the session kept, `VERBATIM` from `what_survives_and_is_real`**

| # | What survived | The claim, as the row states it |
|---|---|---|
| **1** | `nba_ref.defender_ratings` | *"two-way ridge, offence-adjusted, `5` channels, reliability-shrunk, `111,768` rows, weekly as-of. **The only factor that measured neutral rather than harmful.**"* |
| **2** | **the fitted usage allocation** | *"the prior assumption was **NEGATIVELY correlated, `-0.024`**, with who actually absorbs shots"* |
| **3** | `proj_min` and `rate36` emitted into `baseline_history` | *"the component interface the engine design always required"* |
| **4** | **the leg-level gate itself** | *"log-loss / Brier on real board lines — **the correct way to judge every future factor**"* |

🔑🔑 ***Row 2 is the sharpest single number in the whole enrichment programme and the twelve did
not carry it.*** **The hand-reasoned prior for WHO absorbs a missing player's shots was not merely
weak — at `-0.024` it pointed the WRONG WAY relative to who actually absorbed them.** ⇒ *That is
why `A2` could not be rescued by refitting its magnitude: **the allocation it was distributing was
anti-correlated with reality, so a better multiplier on a wrong assignment is still a wrong
assignment.*** 📌 **It also explains, mechanically, the `§F6.12` finding that `A2` did WORST where
it should have done BEST: high novelty is precisely where the baseline cannot supply the allocation
and the prior has to, and the prior is the part that is backwards.**

⚠ **`RULE 54` / `RULE 56` — `n` IS `NOT RECORDED` FOR THE `-0.024`.** *The row states the
correlation and nothing else: **the sample it was measured on, the stat it was measured for, the
seasons, and whether it is Pearson or Spearman are all `NOT RECORDED`.*** **A correlation of
`-0.024` is, in absolute terms, approximately zero — the honest reading is "the prior carries no
usable signal", and "points the wrong way" is the SIGN of an estimate whose confidence interval is
`NOT RECORDED` and very probably spans zero.** ⇒ ***So the load-bearing finding is "the prior was
UNINFORMATIVE", which is fatal to `A2` on its own; the directional reading is a weaker claim and is
recorded here as such.*** 🔴 **Marked for the owner under `F6-2`: the underlying fit is not
identified in any transcript or config row reachable from this session.**

### 2 · 🔑🔑 **THE REMAINING OPPORTUNITY — the one slice the baseline structurally cannot see**

> ***"the one thing the baseline structurally CANNOT see is a scratch announced AFTER its cutoff
> (production: `09:00 ET` in `build_baseline_ladder.py`). That is a narrow, well-defined slice and
> it requires the day-before-baseline configuration to test at all. Everything else about an
> absence is already in recent form."***
> — `THE_REMAINING_OPPORTUNITY`, `VERBATIM`

**This is the constructive half of the retraction and it is the part most worth keeping.** *The
`A2` programme did not fail because absence information is worthless; it failed because **the
production baseline already reads the same injury report `A2` reads.** The baseline's `proj_min` is
built from the as-of roster state at `09:00 ET`, so by the time `A2` fires, the elevated minutes of
the remaining players are already in the projection — `A2` was re-pricing information the baseline
had priced from the same source.* ⇒ ***The residual value therefore lives in exactly one place: the
window between the baseline's `09:00 ET` cutoff and tip-off, where a scratch lands that the
baseline could not have seen.***

| The slice | Why it is the only one left |
|---|---|
| **Scratch announced AFTER `09:00 ET`** | The baseline's roster state is frozen at the cutoff; this is information it *cannot* hold |
| **Everything earlier** | *"already in recent form"* — the `4,699`-leg low-novelty slice measured exactly this and `A2` lost there too |

🔴 **AND IT IS NOT TESTABLE AS THE SYSTEM IS BUILT.** *"**it requires the day-before-baseline
configuration to test at all**" — the production ladder has no day-before variant, so **there is no
clean control**: with a single `09:00 ET` baseline, any `A2`-style layer reading the afternoon
report is reading a report the baseline partly already had.* ⇒ **The test named in `next_test` is
the construction of that control, not a factor test:**

> ***"rebuild the baseline with a day-before injury cutoff, then apply `A2` ONLY to players whose
> status changed between that cutoff and the `2:30 PM` report. **Any test that reads the same
> report for both layers measures double-counting, not value.**"*** — `next_test`, `VERBATIM`

🔑 ***That last sentence is a general methodological rule and it is stated nowhere else in the
corpus: a factor and the baseline it is grading against must not share an input, or the gate
measures overlap rather than contribution.*** 📌 **It is the same failure shape as `RULE 3` of the
four-rules table at `§1282` above — "never duplicate a baseline internal" — but stated for a
factor's DATA SOURCE rather than for its FORM, which is the case the four rules do not cover.**

🔴 **`OWNER DECISION` — filed as `F6-2` in `NBA_OPEN_ITEMS.md`.** *Building a day-before-cutoff
baseline is a production change. This session **documents** it and does not propose it: the prior
work is closed, the slice is named, and whether it is worth a second ladder configuration is the
owner's call. **`NOT RECORDED`: any estimate of how many legs per night fall in the post-`09:00 ET`
scratch window** — which is the number that would decide it, and which no transcript computes.*

> ⚠ **CORRECTION, same pass, `§F6.13`.** *This section as first committed (`800109b2`) filed both
> this decision and the `-0.024` follow-up **under `T20-3`(e)**. That was wrong: `T20-3`(e) is the
> MLB-crons-still-running sub-item and has nothing to do with the baseline cutoff. **Corrected to
> `F6-2` in `7f631460` and this commit, and the item was then actually written** — `RULE 55`: a
> pointer to an item is not a filing until the item exists.*

### 3 · ~~🔴 **THE DECISIVE FINDING'S DELTAS**~~ 🔴🔴 **RETRACTED — SEE `0a-T15-SUPERSESSION` ABOVE, WHICH HAS THIS TABLE AND MORE**

~~*The four `anchor_wins_every_slice` log-loss pairs are already recorded in `2` of the twelve. **The
DELTAS are not, and the deltas are what carry the argument.***~~ 🔴 ***Both halves of that sentence
are false.*** **The deltas are recorded verbatim** *(`"−0.051` vs `−0.013` on low novelty"`)* **and
the table is recorded with `three` A2 variants per slice instead of this one's `best A2` column, and
`[LIVE-AUDIT]`-verified from `nba_score.factor_gate_results` rather than read from a config row.**
⇒ ***Go there. The table below is a strictly weaker copy and is retained only so this retraction has
something to point at.***

| Slice | Anchor | Best `A2` | **Delta** | `n` |
|---|---|---|---|---|
| all | `0.7231` | `0.7540` | **`-0.031`** | `15,024` |
| fires | `0.7206` | `0.7546` | **`-0.034`** | `13,319` |
| **low novelty** | `0.7147` | `0.7273` | **`-0.013`** | `4,695` |
| 🔴 **high novelty** | `0.7436` | `0.7946` | **🔴 `-0.051`** | **`866`** |

⇒ ***`A2` is four times worse on the slice its own mechanism predicted it would win.*** **That is
not a null result, it is a REVERSED one, and a reversed result on the mechanism's own best case is
what closes a hypothesis rather than merely failing to support it.**

⚠⚠ **`RULE 54` / `RULE 56` — `n = 866` IS THE CONSTRAINT ON THIS CONCLUSION.** *The decisive slice
is **`5.8%` of the legs** (`866 / 15,024`). **A `0.051` log-loss gap on `866` legs is a materially
noisier estimate than the `-0.013` on `4,695`**, and the row publishes **no confidence interval, no
standard error and no bootstrap** — all `NOT RECORDED`.* ⇒ ***So the strong form — "four times
worse" — is a point-estimate ratio between two noisy quantities and should not be quoted as a
magnitude.*** **What survives the caveat is the SIGN and the ORDERING: `A2` loses in every slice,
and it does not win in the high-novelty slice, which is the only outcome the hypothesis could have
been rescued by.** 📌 ***The verdict is sound on the ordering alone; the `4×` is decoration and is
recorded here as decoration.***

### 4 · **THE FOURTH FORM, AND THE `why`**

🔴🔴 **THIS SUB-SECTION WAS WRONG WHEN FIRST WRITTEN AND IS CORRECTED IN PLACE.** ~~*"`flat
multiplier` and `magnitude refit against the baseline minutes residual` appear in `0` of the
twelve."*~~ ***They do not. All four forms were already on file, in this very document, in the
`THREE THINGS THIS SWEEP RECORDS AS QUALIFICATIONS` block at `§(a)` above*** — *`magnitude-refit`
**`3` times**, `component-level` **`6`**, `novelty-weighted` **`4`**, `flat on the mean` **`1`**,
all present at commit `800109b2~1`, before this section existed.* 🔑 **My probe searched
`magnitude refit` — space, lower case — against a corpus that writes `magnitude-refit`. A hyphen
and a capital letter.**

📜 ***FOURTH SPELLING-PROBE FAILURE OF THIS PASS, and the pattern is now the dominant error mode:***
*`§F6.21` (the penalty rule, documented four paragraphs from where I put the section), `§F6.22`
(the delta rule's "a few HUNDRED legs instead of a few THOUSAND", which I probed as "hundreds of
legs instead"), the `defect_rule` (present in two documents, probed with the config row's snake_case
key), and this one.* ⇒ **`RULE 58`, NUMBERED the same day in `NBA_SWEEP_RUN_LOG.md` on five instances: *a `0`-of-`12`
result is a claim about YOUR QUERY, not about the corpus, until the concept has been probed in at
least two spellings — hyphenation, case, and the corpus's own English rather than the source's
identifier.*** *The corpus writes prose; config rows write keys;
`grep -F` matches neither across the gap.*

*The list is retained below because it is `VERBATIM` from the live row and `§(a)` paraphrases it,
but it is a CORROBORATION, not a recovery:*

| # | Form tested |
|---|---|
| 1 | *"flat multiplier on the mean"* |
| 2 | *"component-level (adjust `proj_min`, re-derive the mean)"* |
| 3 | *"novelty-weighted (apply only to the share of the absence not already in recent form)"* |
| 4 | *"magnitude refit against the baseline minutes residual"* |

🔑 **Form `4` is the one that matters for closure.** *Forms `1`–`3` vary WHERE the adjustment is
applied; form `4` refits HOW BIG it is, against the baseline's own residual — i.e. it gives the
factor the best magnitude the data allow. **`A2` still loses.** That is why the status is `CLOSED`
and not `NEEDS TUNING`: the tuning was run.*

> ***"a star's first game out is exactly when a coach improvises. The baseline's conservative
> projection handles that uncertainty better than a confident multiplier. **Being MORE aggressive
> when the situation is LEAST predictable is backwards.**"*** — `A2_FINAL_VERDICT_2026_09_13.why`,
> `VERBATIM`

📌 **`§F6.7`'s finding is the same shape from the opposite market: de-vigged consensus is right to
within a point on `776,000` legs, so confident departures from it lose.** ⇒ ***Two independent
lines — an internal factor gate and an external price comparison — converge on one instruction:
the system's edge is not in being more confident than the baseline, it is in the break-even gap
`PrizePicks` leaves open.***

# 🆕 §T26.11 — ✅✅ **WHY `2025-26`'s CALIBRATION WAS INHERITED: `final_hp` HELD `1` OF `163` DATES. IT NOW HOLDS ALL `163`.**

*`T26`, `2026-09-24/25`. **The mechanical cause of `§T23.10`/`§T23.18`, and its repair.***

## 1 · The cause — *one sentence the corpus was missing*

> **`T26`, verbatim:** *"`final_hp` has only **`1` of `163` dates** for `2025-26` while baselines cover
> all of them. **That's the mechanical reason the as-of calibration has been inheriting `2024-25`
> cells — it learns from `final_hp`, and the live season had nothing of its own.**"*

🔑 ***The corpus recorded the SYMPTOM (`2025-26` calibration inherited from `2024-25`) for two days
without the MECHANISM. The mechanism is a one-line join fact: the calibration reads `final_hp`, and
`final_hp` was empty for that season.*** ⚠ **And it could not have been otherwise — `final_hp` had no
pipeline owner until `2026-09-24** (`§4b`), so nothing was writing it.** *Two open items with one root.*

## 2 · ✅ Live `2026-09-25`, after the backfill

| | `2024-25` | `2025-26` |
|---|---|---|
| **`final_hp` dates** | `162` | ✅ **`163`** *(was `1`)* |
| **`final_hp` rows** | `3,399,146` | `3,811,766` |
| **calibration cells** | `9,208` | `16,754` |
| **as-of dates** | `23` | `24` |
| 🔑 **cell source** | **`own` `100%`** | ✅ **`own` `9,231` (`55.1%`)** · ⚠ **`prior_season` `7,523` (`44.9%`)** |

⇒ ✅ ***`2025-26` is no longer calibrated ONLY on the prior season — a majority of its cells are now
its own evidence.*** ⚠ **But `44.9%` still inherit**, *which is expected for a season with `24` as-of
dates and thin early coverage, and is the honest state to record.* **`§T23.10`/`§T23.18` are
PARTIALLY closed: the blocker is gone, the inheritance is not.**

📌 ***`NOT RECORDED`: the threshold at which a cell prefers own-season over prior-season evidence, and
whether `44.9%` falls as the season fills. Both are measurable and neither is measured.***

# 🆕 §T26.5 — ✅✅✅ **THE AVAILABILITY FALLBACK: BUILT, FITTED OUT OF SAMPLE, AND CALIBRATED — AND THE INPUT IT NEEDED HAD NEVER BEEN IN THE DATABASE**

*`T26`, recorded `2026-09-25`. **Every row re-derived against live Postgres the same day.**
⚠ **`NOT RECORDED` is used below wherever the transcript stops short; nothing here is inferred.**

## 1 · 🔴🔴 The hole underneath it: the binding availability input was not queryable

> **`T26`, verbatim:** *"the injury report is nowhere in postgres. **no table matching `%injur%`
> exists**, and `nba_daily` — where the doc says the loader should write injury-report snapshots —
> **has zero tables**. The binding availability input lives only as repo files."*

🔑 ***The document specified that loader. It was never built.*** *Everything else was already
persisted — boards, market lines, tiers, outcomes, scored legs, baselines, `final_hp`, defender
ratings, officials, starter status, tracking, playtypes, on/off, lineups.* **Injury was the one hole,
and it gates availability.**

✅ **NOW LOADED — live `2026-09-25`:** **`nba_daily.injury_report_snapshots`, `1,338,020` rows ·
`330` game dates · `12,066` distinct snapshots · `2024-10-22 → 2026-04-14`.**
🔑🔑 ***It stores EVERY SNAPSHOT, not a daily summary*** — *so "what was known at `12:30`" stays
separable from "what was known at `19:45`".* **That separability is what makes the fallback
backtestable at all: the archive is `as-known`, the box scores are truth.**
⚠ **Rows saying a team had not filed yet are PRESERVED, not dropped** — *`9.4%` of the set* —
***because "no row" and "not filed" are different facts.***

## 2 · What the report is worth at the cutoff — **`330` dates, both seasons**

| status at the `16:15 ET` cutoff | player-games | `P(plays)` | minutes when they play |
|---|---|---|---|
| **out** | `19,677` | **`0.2%`** | `8.8` |
| **doubtful** | `671` | **`1.0%`** | `13.5` |
| 🔑 **questionable** | `3,823` | **`46.9%`** | `24.0` |
| ⚠ **available** | `1,628` | **`80.1%`** | `23.2` |
| **probable** | `1,466` | **`87.8%`** | `26.5` |

🔑 ***"Questionable" at the decision moment is a coin flip — `46.9%` over `3,823` player-games and
`541` players.*** **This CONFIRMS the corpus's existing *"79% of questionables are coin flips at the
cutoff"* finding from the opposite direction**, and it is the reason the fallback exists.

⚠⚠ **AND ONE ROW LOOKS BACKWARDS: `available` (`80.1%`) sits BELOW `probable` (`87.8%`).** *At
`1,628` player-games that is unlikely to be noise.* ▶ **The transcript's reading — recorded as a
reading, not a result**: *"`available` appears on the report for players who were listed earlier and
then cleared, and some still get rested or DNP-CD."* ⚠ ***`NOT RECORDED`: this has not been tested.
It is flagged as a real signal to explain, not an anomaly to wave off.***

## 3 · ✅ The fit — **trained on `2024-25`, scored on `2025-26`, never touched during fitting**

| model | Brier *(lower better)* | vs status-only |
|---|---|---|
| global rate only | `0.1382` | — |
| **status only** *(the report itself)* | `0.0498` | **baseline** |
| ✅ **full: status × role × reason × availability** | **`0.0441`** | **`11.3%` better** |
| 🔑 **questionables only** | **`0.2398`** *(vs `0.2505`)* | **`4.3%` better** |

✅ **CALIBRATED, not merely sharper: mean prediction `0.160` against an actual `0.166`.**

🔑 **Two honest readings, both the transcript's own:** ***"the status label carries most of the
information — the jump from `0.138` to `0.050` is the report itself."*** *The granularity adds a real
`11%` on top; on questionables — **the only genuinely uncertain group** — it adds `4.3%`, **"a modest
but real edge on a coin flip."***

## 4 · Where it lives — **verified live, row for row**

| object | rows | what it is |
|---|---|---|
| `nba_score.availability_training` | **`27,265`** | ✅ **the leakage-free training set** — *status as known at `16:15 ET`, features strictly from PRIOR games* |
| `nba_score.availability_prior` | **`699`** | **the fitted cells — `4` hierarchy levels, shrinkage `15/10/5`** |
| `nba_score.starter_training` · `starter_prior_v2` | `78,556` · `125` | *the same pattern applied to starter status* |
| `nba_ref.official_tendency` | `78` | *the referee-tendency table (see `§T26.2` for the data behind a crew predictor)* |

⚠ ***`NOT RECORDED`: whether the prior is yet WIRED into the enrichment path.*** *The transcript
names it as the immediate next step —* *"wire this prior into the enrichment path so a missing or
stale report falls back to it instead of to nothing"* — **and does not report doing it.** ⇒ **Until
that is confirmed, treat the fallback as FITTED but not necessarily IN USE.**

# 🆕 §T26.12 — ⚠⚠⚠ **THE `A5` STARTER FALLBACK — VALIDATED ON THE WRONG TARGET, AND WIRED INTO NOTHING**

> 🔴🔴🔴 **READ `§T26.39` BEFORE ACTING ON THIS SECTION.** *Everything measured below is correct **as a
> measurement of `Brier` on STARTS**. The author's own later verdict, in `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`
> §11: **"VERDICT FIRST: this model is NOT wired into anything, and should not be… MY ERROR… I
> validated the wrong target."*** ▶ **VERIFIED `2026-09-25`: `starter_prior_v2`, `starter_training` and
> the function `nba_score.p_start(...)` all EXIST — and `grep` finds **`0` callers** in every `nba/*.py`
> and every workflow.** ⚠ *`A5 lineup change` was already **CLOSED — REJECTED** on Δ MAE against prop
> error: **points `−0.032`, rebounds `−0.008`, assists `−0.008`, pra `−0.035` — negative on every
> prop.*** 🔑 **The heading below is kept under `RULE 40`; its claim of "earning its keep" is
> WITHDRAWN.**

## ~~✅✅ **THE `A5` STARTER FALLBACK — AND THE ONE PLACE EXTRA GRANULARITY *EARNED* ITS KEEP**~~

*`T26`, `2026-09-24`. **Fit on `2023-24` + `2024-25`, scored on `26,543` player-games in `2025-26` it
never saw.***

| model | Brier *(lower better)* | vs the obvious rule |
|---|---|---|
| base rate only | `0.2487` | — |
| **"started last game"** *(the obvious baseline)* | `0.0834` | **baseline** |
| ✅ **full model** *(+ rate-of-recent-starts, minutes band)* | **`0.0722`** | ✅ **`13.5%` better** |

✅ **Accuracy `91.0%` · mean prediction `0.4643` against an actual `0.4631` — calibrated.**

🔑🔑 ***THE CONTRAST THAT MAKES THIS WORTH RECORDING.*** **Both fallbacks have the identical shape** —
*a leakage-free training table, a hierarchical prior with shrinkage, a held-out season as judge* —
**but they disagree about granularity:**

| | availability *(`§T26.5`)* | starter *(`A5`, here)* |
|---|---|---|
| gain from extra levels | **`11.3%` overall, `4.3%` on the uncertain group** | ✅ **`13.5%` on top of the simple rule** |
| verdict | *"the status label carries most of the information"* — **the fourth level LOST** | ✅ ***"here the extra granularity EARNED its place"*** |

⇒ 📌 ***Same method, opposite answer. Granularity is not a virtue to be applied uniformly — it is a
hypothesis that has to be scored per factor, and one of the first two scored it negative.***

## ✅ Two load gaps closed in the same pass — *"mined weeks ago, never loaded"*

**officials `11,062` rows across three seasons** · **starter status `~96,000` rows** *(`32,385` +
`32,515` + `32,179`)*. 🔑 ***The existing workers already took a season argument, so no new code was
needed*** — **the data had been mined and simply never loaded.** ⚠ *That is the same failure class as
the injury archive in `§T26.5`: **the pipeline produced it, nothing put it where a query could reach
it.***

---

## ✅✅✅ **§T26.15 — T16-7's DATA-LOSS HALF IS CLOSED, AND THE POPULATION QUESTION IS SETTLED AGAINST THE CORPUS'S OWN ANSWER** *(T26 seg1128 + the repo's commit history + `SELECT` 2026-09-25T18:17Z)*

**`T16-7` was always TWO questions wearing one ID, and the corpus closed only one of them.**

| half | question | state |
|---|---|---|
| **scope** | *is the expected population the full ladder or the board?* | ✅ **closed twice already** — `§T18.1` *(owner)* and `§T16.3` *(author's caveat)*, **and they closed it DIFFERENTLY** |
| **data loss** | *"**Is 2025-26 mid-rebuild, or did it lose its history?**"* — `NBA_OPEN_ITEMS.md:1419` | ⚠ **NOT RECORDED — this is the half that stayed open** |

### 🔑 **THE DATA-LOSS HALF: IT WAS LOST, AND IT WAS RESTORED**

*T26's own prose, verbatim:* ***"the restore worked: final_hp for 2025-26 is back to 163 dates and
17,487,112 rows — from 2 dates and 367k. That closes the data loss in T16-7."***

⚠ **Note the audit and the transcript disagree on the depth of the hole** — the `2026-09-22`
`[LIVE-AUDIT]` measured **`140,130` rows on ONE date**; T26 says **`2` dates and `367k`**. *Both are
`SELECT`s taken two days apart on a table a concurrent session was writing. **Neither is re-derivable
— the rows are overwritten** (`RULE 6`).* 🔑 **The direction is what matters and both agree on it.**

### 🔴🔴 **AND THEN THE POPULATION WAS INVERTED — TWO DAYS AFTER THE RESTORE, AND THE CORPUS SAYS THE OPPOSITE**

> **`§T16.3`'s heading**: *"`T16-7` IS ANSWERED — `final_hp` WAS 38.7M LEGS, AND ITS EXPECTED
> population IS **THE FULL LADDER, NOT THE BOARD-SCOPED SET**"*
> **`§T18.1`, the OWNER**: *"I mean the ladder ON THE BOARD, yes — **but NOT the full ladder on the
> baseline if unneeded, not on the board.**"*

✅✅ **THE OWNER WON, AND THE CODE NOW IMPLEMENTS HIM.** *`build_final_hp.py`, in the builder's own
words:* ***"🔴 BOARD-SCOPED (owner decision 2026-09-24…). This builder used to write the FULL ladder —
every rung for every player × 30 props, ~226k rows a slate — under the scoring engine's name."***

🔑🔑 **AND THE CODE CARRIES ITS OWN MEASUREMENT OF THE WASTE, WHICH THIS SWEEP THEN VERIFIED ON THE
SAME SLATE IT NAMES:**

| `2026-04-10`, the slate the code measures | rows |
|---|---|
| what the builder used to write | **`226,714`** |
| of those, ever on a board | **`14,572`** *(`6.4%`)* |
| ▶ **`final_hp` on that date, live now** | **`28,164`** = **`14,082` rungs × 2 sides** |
| ▶ **board rungs on that date, live now** | **`18,408`** *(all periods)* |

✅✅ **`14,082` against the code's predicted `14,572` — the prediction verifies against the live table
on its own measured slate**, the small gap being board rungs with no baseline row to price.

### ✅ **AND THE STORE IS NOW EXACTLY THE BOARD — MEASURED, NOT ASSERTED**

```sql
-- off-board rows in final_hp, sampled on the slate the code measured:
SELECT count(*) FROM nba_score.final_hp f WHERE f.game_date='2026-04-10'
  AND NOT EXISTS (SELECT 1 FROM nba_market.board_rung_keys k WHERE k.period='FULL'
    AND k.game_date=f.game_date AND k.player_id=f.player_id AND k.prop=f.prop AND k.line=f.line);
```
▶ **`0`.** ▶ *And `21` distinct props in `final_hp` against `21` on the board — **the same 21**, down
from the `30` the full-ladder builder wrote.*

### 🔴 **THE FIGURES — PUBLISHED AS THE COMMAND THAT DERIVES THEM (`RULE 59`)**

```sql
SELECT season, count(*) rows, count(DISTINCT game_date) dates, max(built_at) last_built
  FROM nba_score.final_hp GROUP BY season ORDER BY season;
```
▶ **`2026-09-25T18:17Z`: 2024-25 `3,399,146` / **`162` dates** · 2025-26 `3,811,766` / **`163`
dates** · total `7,210,912`, `1,768 MB`.** ✅ **BOTH SEASONS COMPLETE ON DATES** — *`162` is exactly
`T16-7`'s own recorded figure for 2024-25.* ⚠ **`7,115,570` of `7,210,912` rows — `98.7%` — carry
`built_at` of `2026-09-25`**, *the session that has no transcript yet.*

⚠⚠ **DO NOT READ THE ROW DROP AS A SECOND LOSS.** `19,215,200` → `7,210,912` is **`−62.5%`**, and
every row of that fall is the full ladder the owner called *"unneeded"* being removed on purpose.
🔑 **The DATE coverage is the loss test, and it is whole.**

---

## 🔴🔴🔴 **§T26.16 — T16-8 IS CLOSED, AND IT WAS NEVER A LIVE DEFECT: THE STORE WAS STALE, AND THE ROW HELD THE DISPROOF OF ITS OWN CONCLUSION** *(the repo's commit history + `SELECT` 2026-09-25T18:17Z)*

**`T16-8` asked**: *"Either the contract's wording is wrong or the formula is."* ⇒ ✅ **NEITHER.**

### ✅ **THE LIVE STATE**

```sql
SELECT count(*) FILTER (WHERE score<0) neg, count(*) total, min(score), max(score) FROM nba_score.final_hp;
```
▶ **`0` negative of `7,210,912`** · **`score` `8.610` → `99.990`** · **`0` of the props carry a
negative**, against the audit's **`6,924,101` of `19,215,200` (`36.0%`)** reaching **`−52.488`**
across **20 of 30** props. ✅ **COMPASS fact 103's *"SCORE IS 0–100"* contract HOLDS LIVE.**

### 🔑🔑 **AND THE CAUSE IS NOT THE REBUILD'S SCOPING — THE LOW DECILES ARE STILL FULLY POPULATED**

*The audit located the negatives precisely: **"confined to `final_hp` below ~0.6 (deciles 1–6)"**, with
**"Decile 1 spans −52.49 to +46.00 — a ~98-point swing at essentially constant probability."*** ⚠ **If
board-scoping had simply deleted the low-probability rungs, the closure would be an artifact.** ▶ **It
did not:**

| `final_hp` decile | rows now | `score` range now |
|---|---|---|
| **1** *(`0.000`–`0.100`)* | **`515,486`** | **`8.61` → `47.53`** |
| 2 | `657,092` | `14.51` → `54.66` |
| 5 | `960,790` | `43.08` → `72.31` |
| **10** *(`0.900`–`1.000`)* | **`447,789`** | **`90.50` → `99.99`** |

🔑 **Decile 1 still holds half a million rows and every one is positive and ordered.** *The `~98-point
swing at constant probability` is gone: decile 1 now spans `38.9` points, monotone with the
probability.* ⇒ **The population did not change. The FUNCTION did.**

### 🔴🔴 **AND THE FUNCTION CHANGED FOUR DAYS BEFORE THE AUDIT RAN**

*`build_final_hp.py`'s score line, traced through `git log -L`:*

| commit | when | `score` = | range it produced |
|---|---|---|---|
| *(pre-`2d09c0d3`)* | ≤ `2026-09-16` | **`edge × confidence`** | 🔴 **`−53` → `+42`** |
| **`2d09c0d3`** | `2026-09-18T22:06-07:00` | `final_hp × confidence × 100` | `0` → `100` |
| **`71ef1d35`** | **`2026-09-18T22:22-07:00`** | **the confidence-neutral form, live now** | **`0` → `100`** |
| — | **`2026-09-22`** | ⚠ **the `[LIVE-AUDIT]` that raised `T16-8` runs HERE** | *measures `−52.488`* |

🔑🔑🔑 **AND `2d09c0d3`'S OWN COMMENT NAMES THE DEFECT THE AUDIT WOULD LATER MEASURE, FOUR DAYS EARLY**:
> ***"A previous version scored EDGE × confidence, which ran **−53 to +42** — an edge metric, not the
> 0-100 scale."***

⚠⚠ **`−53 to +42` versus the audit's `−52.488` and `+46.00`. That is the same table.** ⇒ **The negative
rows were written by a formula THE REPO NO LONGER CONTAINED.** 🔑 **The live formula cannot produce a
negative at all** — *`lift` and `drop` are never both non-zero, so the result is either
`hp100 + (100−hp100)·lift ≥ hp100 ≥ 0` or `hp100·(1−drop) ≥ 0.65·hp100 ≥ 0`, and
`np.clip(…,0,100)` bounds it a second time.* ✅ **Confirmed on the surviving pre-rebuild rows: the
`47,164` rows still carrying `built_at 2026-09-19` run `10.800` → `99.990`, `0` negative.**

### ⚠⚠⚠ **THE ROW CONTAINED ITS OWN DISPROOF, AND THE SWEEP READ IT AS CORROBORATION**

> **`T16-8`, its own next sentence**: *"They **cannot come from the confidence pull-down**: live
> confidence runs `0.8540`–`0.9841`, so virtually every leg sits above fact 103's **`0.85` neutral
> pivot** and the **"pulled down up to 35%"** branch is nearly unexercised."*

🔑🔑 ***`0.85` is `CONF_NEUTRAL`. `35%` is `drop`'s ceiling. Both are constants of the NEW formula.***
**The sweep checked the stored rows against the CURRENT code, found the current code could not have
produced them, and concluded THE CODE WAS WRONG — when the only reading its own evidence supports is
that THE ROWS PREDATE THE CODE.** ⚠ **One observation, two readings, and the sweep took the one that
kept the item open.**

### 📜 **RULE 61 IS BORN HERE**

> 🔑🔑🔑 ***WHEN STORED ROWS CANNOT BE PRODUCED BY THE CURRENT CODE, THE ROWS ARE STALE — NOT THE CODE.
> A `[LIVE-AUDIT]` MEASURES A STORE, AND A STORE IS AS OLD AS ITS LAST WRITE, NOT AS OLD AS ITS
> WRITER. DATE THE ROWS (`built_at`) AND DATE THE WRITER (`git log -L` ON THE LINE THAT WRITES THEM)
> BEFORE CONCLUDING ANYTHING ABOUT EITHER.***

⚠ **This is `RULE 37`'s *silent* category inverted.** *`RULE 37` warns that a clean census can hide a
real loss. **`RULE 61` warns that a dirty store can manufacture a defect that no longer exists** — and
the remedy is not a fix, it is a REBUILD.* 🔑 **`T16-8` cost the corpus three passes as a standing
season-critical owner decision. The fix had shipped before it was ever raised.**

---

## 🔴🔴 **§T26.17 — `final_hp` HAS NO `period` COLUMN, AND FOR ITS WHOLE LIFE PERIOD RUNGS WERE STORED WEARING FULL-GAME KEYS** *(`0cba9a19` + `f340b400`, 2026-09-24; `0` of the twelve before this entry)*

*`build_final_hp.py`'s own account of the bug it fixed:*
> ***"PERIOD FILTER (fixed 2026-09-24). This read had no period filter and **final_hp has no period
> column**, so Q1/Q4/H1/H2 rungs were written under the FULL-GAME key: prop `points` line `5.5` for Q1
> landed as if it were a full-game `5.5`, and where a period line coincided with a full-game line **the
> upsert let the last one win**."***

✅ **VERIFIED STRUCTURALLY** — *`information_schema.columns` on `nba_score.final_hp` returns **`24`
columns** and **none of them is `period`***. 🔑 **So the table could not have represented the
distinction even if the read had made it.** ⇒ **This is not a filter that was forgotten; it is a
filter that had nowhere to write its answer.**

### 🔴 **HOW MUCH OF THE TABLE WAS AFFECTED — AND WHY THE CODE'S OWN FIGURE IS ALREADY STALE**

*The code says* ***"~31% of baseline_history rows are period rungs, so roughly that share of final_hp
was period probabilities wearing full-game keys."*** ▶ **Live `2026-09-25`:**

```sql
SELECT count(*) total, count(*) FILTER (WHERE period<>'FULL') period_rungs,
       round(100.0*count(*) FILTER (WHERE period<>'FULL')/count(*),2) pct FROM nba_score.baseline_history;
```
▶ **`4,285,633` of `8,696,305` = `49.28%`**, across **`5`** distinct periods — **not `31%`.**

🔑🔑 **AND THE GAP IS NOT AN ERROR — IT IS THE PRUNE'S OWN DESIGN, WRITTEN THE SAME DAY.**
*`prune_baseline_to_board.py`'s scope rule:* ***"a `(date, prop, period)` is pruned ONLY IF some board
— real or derived — carried that prop that day. **A prop with no board of any kind (historically the
PERIOD props) keeps its full ladder**."*** ⇒ **The prune removes off-board FULL rungs and KEEPS the
period ladders, so it mechanically RAISES the period share.** ⚠ **`31%` was true before the prune ran
and false after it — a `RULE 59` figure that went stale inside twenty-four hours, in the same file as
the rule that staled it.**

🔴 **CONSEQUENCE FOR EVERY `final_hp` FIGURE THE CORPUS RECORDS BEFORE `2026-09-24`** — *including
fact 99's certified **`38,686,696`** and `T17`'s **`19,611,626`*** — **a material share of those rows
were period probabilities indexed as full-game legs.** ⚠ **They were not merely extra rows; where a
period line coincided with a full-game line, the upsert DESTROYED the full-game value.** 🔑 **This is
recorded, not remediated: the rebuild has already replaced every affected row.**

---

## ⚠⚠ **§T26.18 — THE DESCENT WAS TWO-STAGE, AND THE MIDDLE STAGE IS A BUG THE CODE DOCUMENTS ON ITSELF** *(`a3711f58`, 2026-09-24T13:10-07:00)*

*`build_final_hp.py`, on the empty-scope branch:*
> ***"BOARD-SCOPED: an empty result means NO board (real or derived) carried this prop in this scope —
> so the correct content of `final_hp` for it is NOTHING. **The old behaviour (skip) left the previous
> full-spectrum rows in place: after the first board-scoped rebuild the season still held `13.79M` rows
> because 18 props with no real-board keys were never cleared.** Clear the slice so the store is exactly
> the board and only the board."***

| stage | rows | what moved |
|---|---|---|
| after the restore *(T26, 2026-09-24)* | **`17,487,112`** *(2025-26)* | the loss is repaired, full ladder |
| ⚠ **after the FIRST board-scoped rebuild** | **`13.79M`** | 🔴 **`18` props never cleared — `skip` is not `delete`** |
| after `a3711f58` + the final rebuild | **`3,811,766`** *(2025-26)* | ✅ exactly the board |

🔑🔑 **THE LESSON IS THE SWEEP'S OWN**: *a rebuild that **writes** the right answer does not **remove**
the wrong one. **An empty result and an absent result are different facts, and `continue` conflates
them.*** ⚠ **The first board-scoped rebuild would have passed any row-count-fell check** — *`17.49M` →
`13.79M` is a `21%` drop, entirely plausible* — **and it was `3.6×` wrong.** 🔑 **Only a test that
asserts the store CONTAINS NOTHING OFF THE BOARD catches it, which is the `0`-off-board query
`§T26.15` now records as the standing check.**

---

## ⚠⚠⚠ **§T26.22 — "NEXT MAN UP": THE GAIN IS REAL, THE OBJECTIVE IS WRONG, AND IT SHIPPED INTO NOTHING** *(T26 seg1121, ASSISTANT OUTPUT)*

> 🔴🔴🔴 **READ `§T26.39` BEFORE ACTING ON THIS SECTION.** *T26 said **"shipping it with a callable
> interface"** and I recorded that as shipped. **A callable interface is not a caller**: `grep` finds
> `0` callers of `nba_score.p_start(...)` in every script and workflow, `2026-09-25`.* ⚠⚠ **And the
> gain below is `Brier` on STARTS — the same objective `§T26.39` shows was the wrong one.** *The
> earlier, rejected proxy **already contained the next-man-up replacement logic** and measured
> NEGATIVE on every prop's Δ MAE.* 🔑 **The subgroup reasoning below still stands as reasoning. What it
> validated does not.**

> ***"the **"next man up"** feature **earns its place, out of sample**."***

| segment | n | Brier **without** | Brier **with** | improvement |
|---|---|---|---|---|
| **all 2025-26** | `26,543` | `0.07211` | `0.07034` | **`2.46%`** |
| ✅ **bench players only** | `14,263` | `0.07516` | `0.07297` | ✅ **`2.91%`** |

> ***"fit on 2024-25, tested on the season it never saw, and **the gain concentrates exactly where the
> mechanism predicts — players who didn't start last game.** shipping it with a callable
> interface."***

### 🔑🔑 **THIS IS A THIRD LAYER ON `§T26.12`'s MEASUREMENT, NOT A SEPARATE ONE — THE NUMBERS INTERLOCK**

⚠ **`0.07211` on `26,543` is `§T26.12`'s full `A5` model** *(recorded there as `0.0722` on the same
`26,543` player-games)*. ⇒ **"next man up" is scored as an INCREMENT ON TOP of the fallback `§T26.12`
already certified**, giving one continuous ladder:

| layer | Brier | source |
|---|---|---|
| base rate only | `0.2487` | `§T26.12` |
| "started last game" *(the obvious rule)* | `0.0834` | `§T26.12` |
| **`A5` full model** *(+ recent-start rate, minutes band)* | **`0.0722`** | `§T26.12` — **`13.5%`** |
| ✅ **+ "next man up"** | ✅ **`0.07034`** | **here — a further `2.46%`** |

🔑 **Read the two increments together and the shape is diminishing but real**: *`13.5%`, then `2.46%`.*

### ✅✅ **THE ACCEPTANCE TEST IS THE MECHANISM, NOT THE MARGIN — AND THAT IS THE ENTRY'S VALUE**

⚠ **`2.46%` overall is small enough to be argued either way.** 🔑🔑 ***What decides it is that the gain
is LARGER on the subgroup the mechanism names*** — *bench players, `2.91%` against `2.46%`* — **so the
improvement is not a uniform lift that a re-fit of anything would have produced.**

📌 **CONTRAST WITH `§T26.20`, AND THE PAIR IS THE LESSON.** *There, a subgroup hypothesis was
**dropped** because two seasons disagreed in SIGN on `307,000` legs. Here a subgroup hypothesis
**ships** because the out-of-sample gain concentrates in the predicted subgroup.* ⇒ ***The same
session accepted one subgroup claim and killed another, by the same standard: does the effect appear
where the mechanism says it must, on data the fit never saw?***

---

## 🔴🔴🔴 **§T26.37 — THE AVAILABILITY DELTA PRICED A LATE `Out` AS A CERTAINTY, LIVE ON P3's DECISION PATH — A BET WITH ZERO UPSIDE AND UNBOUNDED DOWNSIDE** *(source: `nba/NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` §13, an UNSWEPT sibling; verified in code and Postgres 2026-09-25; **`0` of the twelve before this entry**)*

### 🔴 **THE DEFECT**

*`build_availability_delta.py` rewrote **every leg of a newly-`Out` player to `0.001` / `0.999`**
— "he is OUT: every one of his legs goes to ~0" — and `score_board_legs.py` applied it **silently, as
step 3 of its chain**. **P3 runs this daily, so it was live on the decision path.**

### 🔑🔑🔑 **WHY IT IS STRUCTURALLY GUARANTEED TO LOSE — NOT MERELY RISKY. THIS IS THE ENTRY'S REAL CONTENT.**

> ① ***"When the player is genuinely out, his legs VOID."*** *A DNP is a void under the verified
> reversion rules, so those legs are **never graded** and the override **earns nothing**.*
> ② ***"The only way those legs reach grading is if the listing REVERSED"*** — **precisely the case
> where the override is maximally wrong.**

⇒ 🔑 ***ZERO UPSIDE, UNBOUNDED DOWNSIDE.*** ⚠⚠ **A confident override on an outcome that only settles
when the confidence is misplaced.** *The argument needs no measurement at all — and that is what makes
it worth recording as a REASONING PATTERN, not just a bug: **before pricing any event aggressively,
ask whether the cases that actually settle are the cases you were right about.***

### 📊 **AND THE MEASUREMENT AGREES, ON THE ONE DATE THE DELTA HAD EVER RUN** *(`2025-11-29`, split by mechanism)*

| reason | graded legs | log-loss **before** | log-loss **with delta** | |
|---|---|---|---|---|
| `reallocated` *(teammates absorbing the minutes)* | `341` | `0.6119` | **`0.6076`** | ✅ **better** |
| 🔴 **`now_out`** *(the player himself)* | `93` | `0.8326` | **`5.7938`** | 🔴 **`7×` WORSE** |

🔑 **The two halves of one feature pointed in opposite directions** — *the teammate redistribution is a
genuine small gain; the self-override is catastrophic* — **and only splitting by `reason` revealed it.**
⚠ ***An aggregate log-loss over both would have shown a loss and hidden which half caused it.***

### ⚠⚠ **THE CASE THAT PROVES IT, FROM THE INJURY ARCHIVE**

> ***Klay Thompson listed `Out` (Management) at `14:30` and `15:30` ET, **UPGRADED to `Available` at
> `16:30`**, then played **`25.9` minutes for `23` points**. **His `828` legs were priced at
> `0.001`/`0.999`.**"*** 🔑 ***"'Management' is the most reversal-prone reason class there is."***

### ✅✅ **THE FIX IS DEFENCE IN DEPTH — THREE INDEPENDENT GATES, ALL VERIFIED LIVE**

| | where | gate |
|---|---|---|
| **① producer** | `build_availability_delta.py` | *a late `Out` no longer overrides; the row is still written as the RECORD that he was ruled out, with `new_hp = old_hp` and reason **`now_out_flag_only`*** |
| **② consumer, by reason** | `score_board_legs.py:249` | `` ~adj["reason"].str.startswith("now_out") `` |
| **③ consumer, by magnitude** | `score_board_legs.py:249` | `` move <= 0.15 `` — 🔑 **catches ANY future large override whatever its reason**, and line `251` PRINTS the rejected count |

✅ **Keeping the row as a flag rather than deleting it is the right call**: *the fact that he was ruled
out is real information; only the PRICE was wrong.*

### 🔴🔴 **AND A LIVE ANOMALY THIS SWEEP FOUND ON TOP — ROWS WEARING A LABEL THEY DO NOT SATISFY**

```sql
SELECT game_date, reason, count(*), round(max(abs(new_hp-old_hp)),4) max_move, max(built_at)
  FROM nba_score.availability_delta GROUP BY 1,2;
```
▶ **`2026-09-25T22:0xZ`:**

| game_date | reason | rows | **max_move** | built_at |
|---|---|---|---|---|
| 🔴 **`2026-04-10`** | `now_out_flag_only` | `2,122` | 🔴 **`0.7086`** | **`2026-09-25T00:07:04Z`** |
| ✅ `2025-11-29` | `now_out_flag_only` | `148` | ✅ **`0.0000`** | **`2026-09-25T20:15:32Z`** |
| ✅ `2025-11-29` | `reallocated` | `652` | `0.0466` | `2026-09-25T20:15:32Z` |

⚠⚠ ***`now_out_flag_only` asserts `new_hp = old_hp`. On `2026-04-10` those rows move by up to
`0.7086`.*** ✅ **The `built_at` column settles it**: *the April rows were written at **`00:07`**, the
November rows at **`20:15`** the same day — **the behaviour landed between them**, and the later run
shows `max_move` of **exactly `0.0000`** across `148` rows. ⇒ **The April rows are PRE-FIX residue
carrying the POST-FIX label** — the label was applied before the behaviour was.* 📜 **`RULE 61`
exactly, with a twist: the stale rows assert a property they do not have, so their own `reason` column
is the misleading evidence.**

✅✅ **CONTAINED, NOT DANGEROUS**: *gate ② rejects them on the reason prefix and gate ③ rejects them on
magnitude — **either alone suffices** — so no `2026-04-10` override can reach a score.*
🔴 **Recorded, not remediated: cleaning or rebuilding that slate's delta rows is a WRITE, outside this
sweep.**

### ⚠⚠⚠ **AND NOTE WHERE THIS FINDING LIVED — IT IS `§T25.4`'s HAZARD, MADE CONCRETE**

🔑🔑 ***A live defect on the daily scoring path, its structural argument, its measurement and its fix
were recorded ONLY in `nba/NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` — a file OUTSIDE the twelve.***
📌 **See `§T25.4`'s correction**: *that document is not stale history — it is **current, authoritative,
actively maintained**, and already referenced by `5` of the twelve.* ⇒ **The folder hazard is not
"unswept means stale"; it is that unswept files are a MIX, and nothing tells a reader which is which.**

---

## 🔴🔴🔴 **§T26.39 — THE `A5` STARTER MODEL AND "NEXT MAN UP" WERE VALIDATED ON THE WRONG OBJECTIVE, AND NOTHING CALLS THEM. THIS RETRACTS `§T26.12` AND `§T26.22`.** *(`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` §11 + `grep` + Postgres, 2026-09-25)*

⚠⚠⚠ **I WROTE BOTH OF THOSE SECTIONS EARLIER TODAY, FROM `T26`'s PROSE, AND BOTH ARE WRONG IN THE SAME
WAY.** *`T26` measured the model honestly and reported it honestly. **The author then went back, in a
document outside the twelve, and recorded that he had measured the wrong thing.** I read the first half
and not the second.*

### 🔴 **THE AUTHOR'S OWN VERDICT, VERBATIM**

> 🔑🔑🔑 ***"VERDICT FIRST: this model is NOT wired into anything, and should not be."***
> *`A5 lineup change` is already **CLOSED — REJECTED**. That earlier test built **the same mechanism** —
> "last game's starters, minus those ruled out, plus the highest as-of-minutes replacement" — and
> measured it **HELD OUT against PROP ERROR**:*

| prop | Δ MAE |
|---|---|
| points | **`−0.032`** |
| rebounds | **`−0.008`** |
| assists | **`−0.008`** |
| pra | **`−0.035`** |

> 🔴 ***"negative on every prop."***
> *and the reason generalises:* ***"the allocator already uses RECENT-5 MINUTES, which encodes starting
> status CONTINUOUSLY AND WITH MAGNITUDE; a binary starter [flag adds nothing]"*** *— and **that
> rejected proxy already included the next-man-up replacement logic.***
> ⚠⚠ ***"MY ERROR, recorded because it is the reusable lesson: I validated the wrong target."***

### 🔑🔑🔑 **THE LESSON, AND IT IS THE DEEPEST ONE THIS SWEEP HAS RECORDED**

**`§T26.12` measured `Brier` on STARTS: `0.0834` → `0.0722`, `13.5%` better. `§T26.22` measured a
further `2.46%` / `2.91%`. Every one of those numbers is CORRECT.**

⇒ 🔑 ***A model can predict WHO STARTS substantially better and move PROP ERROR by nothing — or
backwards — because the quantity downstream actually consumes is MINUTES, which already encodes
starting status continuously and with magnitude. A binary flag adds a coarse version of information
the pipeline already has in a finer form.***

⚠⚠ **`§T26.22`'s own stated test was *"does the effect appear where the mechanism says it must, on data
the fit never saw?"* — and it PASSED that test.** 🔴 ***The missing question was one level up: IS THIS
THE METRIC THE PRODUCT IS JUDGED ON?*** 📌 **The bar is stated in `NBA_BASELINE_CALIBRATION.md` §0u.1
and the enrichment doc restates it**: ***"it must clear the §0u.1 bar — Δ MAE on props, not Brier on
starts."***

📌 **AND IT IS `§T26.26`'s LESSON AGAIN, ONE TURN FURTHER ON.** *There, the author dismissed a predictor
on EFFECT SIZE when the question was PENALTY SIZING — **"different questions."** Here he accepted one on
`Brier` when the question was Δ MAE.* ⇒ 🔑 **Both failures are the same shape: a competent measurement
of a quantity nobody asked about.**

### ✅ **VERIFIED LIVE — THE ARTIFACTS EXIST, THE CALLERS DO NOT**

```bash
grep -rl "starter_prior_v2\|p_start\|starter_training\|_starter_hist" nba/*.py .github/workflows/*.yml
```
▶ **NOTHING.** `0` callers in every script and every workflow.

| object | state `2026-09-25` |
|---|---|
| `nba_score.starter_training` | ✅ exists |
| `nba_score.starter_prior_v2` | ✅ exists |
| `nba_score.p_start(...)` | ✅ exists *(`1` function)* |
| `nba_score._starter_hist` | 🔴 **does NOT exist** — *the enrichment doc cites it at `79,358` player-games; `to_regclass` returns `NULL`* |

⚠⚠ **`T26` said *"shipping it with a callable interface"* and I recorded that as SHIPPED.**
🔑🔑 ***A CALLABLE INTERFACE IS NOT A CALLER.*** *`p_start()` is callable by anyone. Nothing calls it.*
📜 **`RULE 57` in a form the sweep had not met: *a derivation is not recorded until it has been RUN on
every row it claims* — and "it ships" is a claim about the SYSTEM, which must be run against the system,
not read from the sentence that announces it.**

### ✅ **WHAT SURVIVES, AND IT IS NOT NOTHING**

✅ **The DATA loads stand** — *officials and starter status "mined weeks ago and never landed in
Postgres" are now loaded, and that was a genuine gap* **(`§T26.12`'s second half is unaffected).**
✅ **AND ONE MEASUREMENT IS WORTH KEEPING, because it is about AVAILABILITY rather than lineups** —
*a bench player's chance of starting runs* **`3.3%` with no regular starters out → `6.5%` → `9.2%` →
`15.9%` with three**, *while an established starter sits at* **`~90%` regardless of how many teammates
sit.* 🔑 **That is a usable prior for the availability family; the starter MODEL is not.**

🔴 **STANDING RULE FOR ANY FUTURE USE, from the enrichment doc**: ***"If a future use appears it must
clear the §0u.1 bar — Δ MAE on props, not Brier on starts."***

### ⚠⚠ **SCOPE OF THIS RETRACTION — IT DOES *NOT* REACH `§T26.5`, AND THE REASON IS THE POINT**

*The obvious next move is to apply this to every fallback validated on `Brier`. **`§T26.5`'s
availability / `P(plays)` model was validated exactly that way** — `Brier` **`0.0441`** vs **`0.0498`**
status-only, **`11.3%` better**, out of sample on `2025-26`.* 🔑 **But the critique does NOT transfer,
and it is worth being precise about why:**

| | `A5` starter *(retracted)* | `N1` availability *(stands)* |
|---|---|---|
| what it predicts | **who STARTS** | **whether the player PLAYS AT ALL** |
| is that already encoded downstream? | 🔴 **YES** — *"the allocator already uses RECENT-5 MINUTES, which encodes starting status **continuously and with magnitude**"* | ✅ **NO** — *a `Questionable` player has full recent minutes and may not appear; nothing in the minutes history carries that* |
| so a better prediction… | ⚠ **refines a coarse proxy for something the pipeline already holds in finer form** | ✅ **supplies information the pipeline does not otherwise have** |
| **wired in?** | 🔴 **`0` callers** | ✅ **`p_plays` is called by `build_availability_delta.py`** *(the live P3 producer)* **and `check_factor_freshness.py`** |

⇒ 🔑🔑 ***The defect was never "Brier is the wrong metric." It was that `A5` predicted a PROXY for a
quantity the system already measures directly.*** ⚠ **`Brier` is a perfectly good objective for a
factor that supplies NEW information; it is a misleading one for a factor that re-describes existing
information more coarsely.** ✅ **`§T26.5` stands, and it stands on an argument rather than on luck.**

📌 **THE GENERAL TEST THIS LEAVES BEHIND, worth applying to every future factor**:
> 🔑 ***Before measuring how well a factor predicts its own target, ask what the DOWNSTREAM consumer
> already has. If the factor is a coarser encoding of something already in the pipeline, no amount of
> accuracy on its own target will move the product's error — and the only honest objective is the
> product's error itself.***

---

## ✅✅✅ **§T26.66 — `T26-4` ANSWERED, AND THE ANSWER RETRACTS THE ALARM: THE BELOW-CHANCE ANCHOR IS CONFINED TO ONE EXPERIMENT FAMILY OF `21` ROWS, WHILE THE PRODUCTION EVALUATION SCORES `0.56431` ON `1,248,826` LEGS — AND `§T26.55`'s "THE SLICE IS UNDEFINED" WAS MY OWN ERROR** *(`SELECT` over all `109` rows + source, 2026-09-26; the census is `0` of the twelve)*

> 📌 **`T26-4` asked whether the scoring system is worse than a coin flip. `§T26.55` reported `anchor` log-loss `0.72604` against `ln 2 = 0.69315` and Brier `0.26359` against `0.25`, said *"the slice is undefined"*, and stopped there.** ⚠⚠ ***It stopped one query too early. `§T26.55` read the `5` newest rows of a `109`-row table; the table answers the question by itself.***

### ⚠⚠ **FIRST, THE CORRECTION I OWE: THE SLICE IS NOT UNDEFINED. IT IS DEFINED BY ITS OWN SIBLINGS IN THE SAME TABLE.**

> 🔴 **`§T26.55` — my own section, written `2026-09-26` — asserted "the slice is undefined".** ✅ **It is defined.** *`nba_score.factor_gate_results` holds `slice = 'all'` beside `slice = 'fires'` (`n = 13,319`), `slice = 'low_novelty'` (`n = 4,695`) and `slice = 'high_novelty'` (`n = 866`), **all four written by the same script, `nba/test_a2_novelty.py`, in the same run at `2026-09-13 19:32:07Z`**. The nesting fixes the meaning exactly: `all` is that experiment's full graded sample and `fires` is the subset where `A2` fired.* ⇒ **the definition was one `GROUP BY slice` away, and `§T26.55` is corrected in place rather than struck** *(`RULE 40`)*. 📜 **AND THE LESSON IS `RULE 58`'s, turned on myself: "the slice is undefined" was a claim about MY QUERY, not about the store — the fourth time in three days that a `0`/absence I published was an artefact of the scope I chose.**

### ✅✅ **THE CENSUS — `45` SLICES, `109` ROWS, AND THE BELOW-CHANCE RESULT OCCUPIES FOUR SLICES AND NOTHING ELSE**

> | family | slices | rows | `n` | best log-loss | **every row above `ln 2`?** | last run |
> |---|---|---|---|---|---|---|
> | 🔴 **`all` · `fires` · `low_novelty` · `high_novelty`** *(the `A2`-novelty gate)* | **`4`** | **`21`** | `866` – `15,024` | `0.7147` | 🔴🔴 **YES — ALL `21`** | `2026-09-25` (`all` only) |
> | ✅ `remaining_factors` | `1` | `5` | **`1,248,826`** | ✅ **`0.56431`** | ✅ NO — *not one* | `2026-09-17` |
> | ✅ `allprop:*` *(per-prop calibration)* | `25` | `50` | `437,264` – `1,011,076` | ✅ **`0.0761`** | ✅ NO — *not one* | `2026-09-13` |
> | ✅ `prop:*` · `ladder_all` *(the ladder)* | `9` | `18` | `46,910` – `105,663` | ✅ `0.5623` | ✅ NO — *not one* | `2026-09-13` |
> | ⚠ `n1_ablation` | `1` | `5` | `1,322` | `0.67266` | ⚠ *mixed — **and its columns do not mean what they are named**, see below* | `2026-09-15` |
>
> ⇒ 🔑🔑 **`21` OF `109` ROWS ARE ABOVE CHANCE, AND ALL `21` BELONG TO ONE EXPERIMENT. `40` OF THE `45` SLICES DO NOT CONTAIN A SINGLE ABOVE-CHANCE ROW.** ✅✅ ***THE PRODUCTION EVALUATION IS `0.56431` LOG-LOSS ON `1,248,826` GRADED LEGS — which is the `0.5643` this corpus already carries for the graded PrizePicks history, matched to four decimals from an independent slice.***
>
> ⇒ ✅✅✅ **`T26-4` ANSWERED, AND THE HEADLINE INVERTS**: ***the scoring system is not below chance. A local anchor inside one novelty experiment is — on a sample between `866` and `15,024` legs, three orders of magnitude smaller than the production evaluation.*** 🔴 **WHAT REMAINS TRUE AND STILL MATTERS**: *that family's anchor has been above `ln 2` **since `2026-09-13`, across all four of its slices, in two independent runs** — so **every `gain_vs_anchor` inside it is measured against a floor that does not hold**, and *none* of `§T26.55`'s five verdicts (`anchor_x_defender` `0.00000`, `anchor_x_A2` `−0.24441`, …) is evidence about the production model. ⇒ **the verdicts are not wrong, they are UNINTERPRETABLE — which is a different repair: fix the anchor, then re-run the gate.**

### 🔴🔴 **AND THE RERUN MADE IT WORSE, QUIETLY: `n` FELL BY HALF AND THE SHRINKAGE PARAMETER WENT `NULL`**

> | run | slice | `n` | `anchor` log-loss | `shrink_beta` | siblings rewritten? |
> |---|---|---|---|---|---|
> | `2026-09-13 19:32:07Z` | `all` | **`15,024`** | `0.7231` | `0.9285` | ✅ *`fires`, `low_novelty`, `high_novelty` all written* |
> | `2026-09-25 22:42:57Z` | `all` | 🔴 **`7,128`** *(**`−52.6%`**)* | `0.72604` | 🔴 **`NULL`** | 🔴 **NO — only `all`** |
>
> ⚠⚠ ***So the `2026-09-25` rerun evaluated on half the sample with the shrinkage parameter unset, and did NOT rewrite the three sibling slices that give `all` its meaning — leaving the definition `12` days staler than the thing it defines.*** 🔑 *This is a harness regression, not a model regression, and it is exactly the kind of thing that makes a result look like a finding.*

### 🔴🔴🔴 **A SEPARATE AND LIVE TRAP IN THE SAME TABLE: SIX WRITERS, ONE SCHEMA, THREE DIFFERENT MEANINGS PER COLUMN — AND THE KEY EXISTS ONLY IN A `print()`**

> ▶ **`grep` finds SIX scripts inserting into `nba_score.factor_gate_results`**: `test_a2_novelty.py` *(`all`/`fires`/`low_novelty`/`high_novelty`)* · `gate_remaining_factors.py` *(`remaining_factors`)* · `fit_n1_model.py` *(`n1_ablation`)* · `calibrate_all_props.py` · `apply_ladder_calibration.py` · `test_factors_on_baseline.py`.
>
> 🔴🔴 **AND `fit_n1_model.py` REPURPOSES THREE COLUMNS, ANNOUNCING IT IN A LINE THAT ONLY EVER REACHED A CI LOG:**
> ```python
> print("  wrote the ablation to nba_score.factor_gate_results "
>       "(brier col = AUC, gain col = confident-band accuracy, shrink col = confident share)")
> ```
> ⇒ *for `slice = 'n1_ablation'`: **`brier` is AUC** (`0.6237`, `0.6216`, `0.6191`, `0.5894`, `0.5892`), **`gain_vs_anchor` is confident-band ACCURACY** (`0.7027`, `0.7963`, `0.7347`, `0.6719`, `0.7045`), **`shrink_beta` is the confident SHARE** (`0.028`–`0.0666`).*
>
> ⚠⚠⚠ **THE TRAP IS NOT THE REPURPOSING, IT IS THE SORT ORDER.** ***`SELECT … ORDER BY gain_vs_anchor DESC` over this table puts `n1_ablation` on top with apparent gains of `0.70`–`0.80` — the best results in the entire factor programme by a wide margin — and they are accuracies.*** *The next-best real gain in the table is `ladder_all`'s `+0.0068`.* 🔑 **A reader — or a future pass of this sweep — ranking factor work by the column whose NAME asserts a comparison would conclude the `n1` ablation is the system's biggest win. It is `n = 1,322`, and the number is not a gain.**
>
> ⚠ *And a smaller instance of the same class: `remaining_factors` carries `brier = 0` and `shrink_beta = 0` on all five rows — **placeholders, not measurements** — while `A3 return ramp` (`0.56431`) is recorded with `gain_vs_anchor = 0` against `final_hp baseline` (`0.56432`), i.e. a real `+0.00001`. **On `1,248,826` legs that is nothing, and saying "nothing" is the correct verdict — but the `0` in the column is not the reason.***
>
> ⇒ 📜 **THE SCRIPT'S OWN COMMENT DIAGNOSED HALF OF THIS AND CREATED THE OTHER HALF**: *it says `factor_gate_results` exists "precisely so a result is not trapped in a CI log … A verdict that only exists in stdout is not a verdict." **It then put the UNITS in stdout.*** ⇒ **`T26-10`** — *the fix is a `metric` or `units` column, or slice-prefixed column names; until then the table needs a documented key, and this section is it.*

> 🔁 **RE-DERIVE, NEVER QUOTE** *(`RULE 59` — every figure was RUN)*:
> ```sql
> SELECT slice, count(*), count(DISTINCT model), min(n), max(n), min(log_loss),
>        bool_and(log_loss > ln(2)) AS every_row_above_chance, max(run_at)::date
> FROM nba_score.factor_gate_results GROUP BY slice ORDER BY max(run_at) DESC, slice;   -- 45 slices, 109 rows
> ```
> ```bash
> grep -c 'INSERT INTO nba_score.factor_gate_results' nba/*.py   # six writers
> sed -n '395,400p' nba/fit_n1_model.py                          # the print() that holds the column key
> ```

## 🔴🔴🔴 **§T26.55 — `F5-1`'s MISSING RESULTS WERE NEVER MISSING: THEY ARE IN `nba_score.factor_gate_results`, DATED, AND EVERY VARIANT FAILED — INCLUDING THE INTERACTIONS THAT WERE SUPPOSED TO BE THE ANSWER** *(`SELECT` 2026-09-26; `0` of the twelve before this entry)*

**`F5-1` has stood since `2026-09-23` on the claim that *"`B4 v3` and `M1` have fitting scripts in the
repo and the results are NOT RECORDED."*** ⚠⚠ ***They were recorded. In a table. `RULE 20`'s discipline —
look for the result in a THIRD place before calling it absent — and this sweep had looked in two.***

### ✅ **THE VERDICTS — `nba_score.factor_gate_results`, all written `2026-09-25 22:42:57Z`, `n = 7,128` legs, season `2025-26`**

| model | log-loss | Brier | gain vs anchor |
|---|---|---|---|
| **`anchor`** | **`0.72604`** | `0.26359` | — |
| 🔴 **`anchor_x_defender`** | **`0.72604`** | **`0.26359`** | **`0.00000`** |
| 🔴 **`anchor_x_A5_pstart_minutes`** | `0.74408` | `0.27042` | **`−0.01804`** |
| 🔴 **`anchor_x_A2`** | `0.97044` | `0.32440` | **`−0.24441`** |
| 🔴 **`anchor_x_A2_x_defender`** | **`0.97044`** | **`0.32440`** | **`−0.24441`** |

### 🔑🔑🔑 **READ THE IDENTICAL ROWS — THEY ARE THE FINDING, AND THEY ARE STRONGER THAN A SMALL GAIN WOULD BE**

⚠ **`anchor_x_defender` matches `anchor` to FIVE DECIMAL PLACES on both metrics.** ⇒ ***The defender term
contributes LITERALLY NOTHING — not "a small amount", nothing*** — *and it was given every advantage
`retest_defender_factors.py` promised: the proper two-way ridge `nba_ref.defender_ratings` instead of
"points allowed per possession", **channel matching** (`def_pts`/`def_fg` → points/fga/fgm · `def_3p` →
threes · `def_tov` → turnovers · `def_foul` → fta), and **exposure weighting over TONIGHT'S available
opposing defenders only** — the scoping bug that invalidated `B4 v2`'s first run.*

⚠⚠ **AND `anchor_x_A2_x_defender` MATCHES `anchor_x_A2` TO FIVE DECIMALS TOO.** 🔑 *The re-test's whole
premise was that **interactions were "the gap in EVERY factor test so far"** — practitioner sources say
books misprice when factors move together.* ⇒ ***The interaction was built, run, and the defender term
adds zero INSIDE it as well. The hypothesis is dead in both forms.***

### 🔴🔴 **AND A FOURTH INDEPENDENT LINE OF EVIDENCE AGAINST THE `A5` STARTER MODEL**

**`anchor_x_A5_pstart_minutes` = `−0.01804`** ⇒ *`A5` as an interaction makes the anchor **WORSE**.*
📌 **That is now FOUR separate rejections of the same model**: *① `§0u.1`'s Δ MAE — negative on every
prop · ② the enrichment doc's **"I validated the wrong target"** · ③ `grep` finds **`0` callers** of
`p_start()` · ④ **this gate, run independently on `7,128` legs**.* ✅ ***`§T26.39`'s retraction of
`§T26.12`/`§T26.22` is confirmed by a measurement taken after it was written and without reference to
it.***

### ⚠⚠⚠ **ONE FIGURE IN THIS TABLE NEEDS ITS OWN LINE, AND IT IS NOT ABOUT THE FACTORS**

🔴🔴 **THE `anchor` ITSELF SCORES WORSE THAN A COIN FLIP ON THIS SLICE.**
*`ln(2) = 0.69315` is the log-loss of always predicting `0.5`; a Brier of `0.25` is its counterpart.*
▶ **The anchor reads `0.72604` and `0.26359` — worse by `0.0329` and `0.0136`.**

⚠ **STATE THE CAVEAT BEFORE THE ALARM**: *`slice = 'all'` here means all legs **ELIGIBLE FOR THE
INTERACTION TEST**, not the board. `n = 7,128` against a nightly board of `~91,405` legs, so this is a
small, deliberately hard subpopulation — **plausibly legs carrying an `A2` absence event**, which are
exactly the cases the model finds hardest.* ⇒ 🔑 **It is NOT evidence that the product is worse than
chance.** 🔴 **But it IS an unexplained figure in the system's own gate table**, and the sweep cannot
resolve it read-only: ***what defines this slice, and is a below-chance anchor expected on it?***
⚠ **NOT RECORDED** *(`RULE 6`)* ⇒ **tracked as item `T26-4`.**

📌 **ALSO NOT RECORDED**: *`shrink_beta` is **NULL on all five rows**, so no shrinkage was applied or
stored for this run, while the scripts' stated discipline is reliability shrinkage (`k=150` for `M1`,
`k=112` for `D1`'s tendencies).*

### ✅ **WHAT THIS CLOSES, AND THE METHOD LESSON**

✅✅ **`F5-1`'s FACTOR HALF IS CLOSED**: *the results exist, are dated `2026-09-25`, and are reproducible
from* `` SELECT model, log_loss, brier, gain_vs_anchor FROM nba_score.factor_gate_results WHERE run_at::date='2026-09-25' `` *— **they were simply never written into the twelve.*** *(Its file half closed
at `§T26.54`.)* ⇒ **`F5-1` is fully closed.**

🔑🔑 ***THE LESSON: "NOT RECORDED" IS A CLAIM ABOUT WHERE YOU LOOKED.*** *This sweep searched the twelve
and the repo, found fitting scripts with no written verdicts, and concluded the results did not exist.
**They were in a database table the whole time — `109` rows spanning `2026-09-13` → `2026-09-25`,
covering `23` models.*** 📜 **`RULE 58`'s shape on an ABSENCE rather than a query: a "not recorded" verdict
must name the places searched, and a results TABLE is a place.**