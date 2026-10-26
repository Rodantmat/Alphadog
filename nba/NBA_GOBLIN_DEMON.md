# NBA GOBLIN / DEMON IDENTIFICATION

**Scope.** Everything about goblin and demon ingestion for PrizePicks: parsing, anchors, **invisible
anchors / switch points**, standard-line anchors, **more and less above and below the anchor**,
ladders, tier signs, and the taxonomy change that made v1 obsolete.

**Status: this is the single most important OPEN correctness issue on the board layer.**
`nba_market.board_tiers` (v1, 2.2M legs) uses a **two-way** taxonomy that was correct when built and
is now wrong. `nba/build_board_tiers_v2.py` implements the four-way rule; **not yet verified**.

---

> # 📑 **INDEX — `NBA_GOBLIN_DEMON.md`**
> **Goblin and demon identification for PrizePicks** — parsing, anchors, invisible anchors / switch
> points, ladders, tier signs, and the taxonomy change that made v1 obsolete.
> 📏 **`135` sections · re-derived `2026-10-26` (T50 intake, RUN, `+13` = `§T50.2` and its 12 sub-headings)** · ~~`122` (T49 transcript batch)~~ · ~~`121` (T49 intake, `+1` = `§T49.2`)~~ · ~~`120` (`+1` = `§T39.2`, goblins under- / demons over-confident; deep goblins)~~ · ~~`119` (`+1` = `§T37.2`, Underdog tiers are modifier bands)~~ · ~~`118` (`+1` = `§T36.2`, demons at launch)~~ · ~~`117` (`+1` = `§T35.2`, demons hold long droughts; demon 5-Flex cap 6)~~ · ~~`116` (`+1` = `§T34.2`, system tier; demons inconstant → conditional gold; goblins as extenders)~~ · ~~`115` (`+1` = `§T33.2`, the owner's tier-map method)~~ · ~~`114` (`+1` = `§T32.4`)~~ · ~~**`113` sections · `2026-09-23`.**~~ 🆕 **`§T32.4` (end of file) — the tier is ~40% less volatile than a raw line (owner's principle, validated); goblins `p·m ≈ 0.5`, all-goblin 3-pick `−86.2%`.** *Re-derive, never quote:* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_GOBLIN_DEMON.md ``
> | 🔑🔑 **the books are right to within a point on `776,000` legs** — *the mechanism behind `T23-1`, and it condemns deep demons from a second market* | **`§F6.7`** |
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** 🔁 **To resolve a `§` pointer:** `` grep -rn "§T9.40b" nba/*.md `` *(all `32` files — the twelve are not closed under their own citations).* **Search for the quoted `§` label.**
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
> 🔴🔴 **THIS FILE'S SECTION NUMBERING IS BROKEN — USE THIS INDEX, NOT THE NUMBERS.** *Measured
> `2026-09-23`: **`§4` appears TWICE*** *("why v1 is now wrong" and "the ladder config")*, ***`§6`
> appears TWICE*** *("ingestion" and "the research standard")*, and ***"OPEN ITEMS SPECIFIC TO THIS
> LAYER" appears TWICE, as `§12` and as `§9`***. **The `§5` block runs `5.0d`, `5.0c`, `5.0b`, `5` —
> backwards.** ⚠ *Same defect class as `§T20.6`'s finding on `NBA_FINAL_SCORING_CALIBRATION.md`.
> **Documented, not renumbered — renumbering would break every inbound pointer** *(rule 1)*.
>
> ## ▶ FIND IT FAST — *by the question you arrived with*
>
> | if you need… | go to |
> |---|---|
> | 🔴🔴 **which tiers ACTUALLY PAY** — realized value per segment, both seasons | **`§0i-T24` §2** |
> | 🔑 **the breakeven bars** — *a standard needs `1.10`, an alternate needs `~1.14`* | **`§0i-T24` §1** |
> | ✅ **what happens to a slip when a leg VOIDS** *(`"a void is never a refund"`)* | **`§0j-T24`** |
> | ✅✅ **is `T24` actually right? — its replay figures RE-RUN from the live database** | **`§F5.6`** — *`4,379` slips, `+15.78%`, `312` voids, all exact; the SE is **night-clustered**, `t = 3.85` reproduces* |
> | ⚠ **the number `T24` does NOT report** — the mean of nightly means, **`+13.84%`** vs the slip-weighted `+15.78%` | **`§F5.6`** |
> | 🔴 **the More-goblin payout floor** *(`1.9×`, not `2.08×` — verified live)* | **`§0g`** |
> | 🔑 **how the four-way taxonomy works** — the rule, the anchor, the tier sign | **`§1`** · **`§2`** · **`§3`** |
> | 🔴 **why `board_tiers` v1 is wrong** | **`§4` (the FIRST one — "the taxonomy change")** |
> | 🔑 **the Flex consolation tier** and what drives it | **`§0h-T22`** |
> | ⚠ **the tier-B selection bias** *(read before trusting the rescue population)* | **`§0h-T22` §5** |
> | 🔑 **the labels are encoded in the price** *(measured on `191,690` rows)* | **`§0h`** |
> | 🔑 **the owner's own statement of the rule** | **`§0f`** |
> | 🔴 **the ladder must not elect a variation** | **`§0e-T16`** |
> | ⚠ **the structural mispricing — real, measured, never exploited** | **`§5.0b`** |
> | ⚠ **the grader dedup key** *(highest-risk item for this layer)* | **`§13`** |
> | 🔴 **what is still open** | **`§9` AND `§12` — *both are "open items"*** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🟢 **A · CURRENT STATE — the `T22`/`T24` layer**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0i-T24`** | 🔴🔴 **THE LEG EDGE MAP.** The bars *(`1.10` standard vs **`~1.14` alternate`** — a distinction this corpus had never drawn)* *(§1)* · 🔴 **the table: real standards carry edge; `73,495` real demon legs return `1.060`/`1.018` and FAIL** *(§2)* · 🔴 the model claims `1.36–1.63` everywhere *(§3)* · slip-level overconfidence, claimed `2.334` vs realized `1.158` *(§4)* | 🔴 |
> | **`0j-T24`** | ✅✅ **VOID / PUSH REVERSION, verified `79` of `79`.** 🔑 ***"A void is never a refund"*** · mixed slips settle on the `r` **LOWEST**-factor legs *(`99.5%`/`96.6%`/`91.3%` within one step; keep-highest matches `0–20%`)* · **grading by keep-lowest is conservative by construction** | ✅ |
> | **`0h-T22`** | 🔑 **THE FLEX CONSOLATION TIER.** Two bands solved *(`<2.5×`→`0.25` at `37/38`; `2.5–5×`→`0.5` at `69/69`)*, the third **resolved later in the same transcript** *(§1 + the box)* · the giveback `0.83/0.69/0.57/0.46` *(§2)* · 🔴 **the tier is not a function of the payout** *(§3)* · ✅✅ **a hypothesis that failed AND could not have succeeded** *(§4)* · ⚠⚠ **tier-B selection bias, `5,652` candidates** *(§5)* · Flex confirmed out of sample *(§6)* | 🔑 |
> | **`0g`** | 🔴 **The More-goblin floor is `1.9×`, not `2.08×`** — owner-supplied, **verified live**, with the `pp_slip_rules` row and the pricing model pinned. *Includes: **what needed retracting in this corpus — nothing**.* | 🔴 |
> | **`0h`** | 🔑🔑 **The labels are ENCODED IN THE PRICE** — measured on `183,777` rows, re-taken live on `191,690` | 🔑 |
>
> ### 📕 **B · THE TAXONOMY AND ITS CORRECTION (`T13`, `T7`, `T16`)**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0e-T16`** | 🔴 **The ladder must not elect a variation** — every leg, every variation, every direction gets a full ladder | 🔴 |
> | **`0e-T16-B`** | 🔴 **The goblin ladder's slope error**, and the first measured sign the alternate board is wider than believed | 🔴 |
> | **`0e-T16-C`** | ✅✅ **The cleanest sanity check in the system** — the final engine's tier behaviour is MONOTONE across all seven tiers | ✅ |
> | **`0f`** | 🔑 **The owner's own statement of the rule** — and the four parts the twelve did not carry | 🔑 |
> | **`1`** · **`2`** · **`3`** | **THE RULE** · **THE ANCHOR — two cases** *(incl. the invisible anchor / switch point)* · **THE TIER SIGN** | |
> | **`4`** ① | 🔴 **WHY v1 IS NOW WRONG — the taxonomy change** ⚠ *first of two sections numbered `4`* | 🔴 |
> | **`4`** ② | **THE LADDER CONFIG** — `nba_config.classification_config.ladder` ⚠ *second `4`* | |
> | **`7`** | **LADDER DEPTH — measured against the real board** | |
> | **`10`** | **What `T1` PREDICTED about goblin/demon — and it was right** | ✅ |
>
> ### 📗 **C · ECONOMICS, INGESTION AND STANDARDS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`5.0d`** | **The pricing function's SHAPE** *(Part B of the lessons document — platform mechanics)* | |
> | **`5.0c`** | **The durable pricing mechanics** *(lesson #24 — held across MLB's entire history)* | |
> | **`5.0b`** | ⚠ **The structural mispricing — real, measured, and never exploited** | ⚠ |
> | **`5`** | **THE ECONOMICS — measured** ⚠ *the `5.x` block runs `d`, `c`, `b`, then `5` — backwards* | |
> | **`6`** ① | **INGESTION — where the data comes from** ⚠ *first of two `6`s* | |
> | **`6`** ② | **THE RESEARCH STANDARD APPLIED TO THIS LAYER** ⚠ *second `6`* | |
> | **`8`** | **TABLES** | |
> | **`11`** | **The MLB reference document** | |
> | **`12b`** | ⚠ **This taxonomy creates the subgroups blueprint `§7f` says a correction must be checked against** | ⚠ |
> | **`13`** | ⚠ **THE GRADER DEDUP KEY — the highest-risk item for this layer** | ⚠ |
> | **`9`** · **`12`** | 🔴 **OPEN ITEMS SPECIFIC TO THIS LAYER** ⚠⚠ ***two separate sections with the same title — read BOTH***; `§9` adds *"and why v2 is a CORRECTNESS issue"* | 🔴 |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` is current, `B` is the taxonomy it rests on, `C` is the
> supporting economics.*** **Where `A` and `B`/`C` disagree, `A` wins and the older section carries a
> dated supersession in place** *(rule 40 — originals are never deleted)*.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T13 (the rule, the invisible anchor, validation), T7 (the More-only verification), the live session (the four-way correction, PrizePicks NBA producer). |
| **2026-09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `9` commits that this log never recorded.** *T13–T16 material plus the live audits: **the owner's own rule statement, and the four parts the twelve lacked** · `board_tiers_v2` verified in code and data, with **the Less half unexercised** · **§0h the labels are encoded in the price**, the T13 measurement re-taken live · §5.4 the empirical per-tier answer with its population · **§0e-T16 the owner's directive that the ladder must not be re-tiered** · §T16.2 the goblin slope error and the alternate-vs-standard split · §T16.3 the final engine's monotone tier behaviour. **Corrections in place: the More-goblin floor is `1.9×`, NOT `2.08×` (owner-supplied, verified live) · a citation to a COMPASS fact that does not exist (176) corrected.*** |

---

## 0e-T16-C. ✅✅ **THE CLEANEST SANITY CHECK IN THE SYSTEM — the final engine's tier behaviour is MONOTONE ACROSS ALL SEVEN TIERS, and the standard line lands on a coin flip** *(T16 pass 2, §T16.3, from COMPASS fact 99 — **6 of the thirty, ZERO of the twelve**)*

*The final calculation engine's leg-level accuracy is **0.5643 log-loss on 1,248,826 graded PrizePicks
legs**. Its tier behaviour:*

| Tier | **measured hit probability** |
|---|---|
| **easy goblins** | **0.6996** |
| **standard line** | **0.5014** |
| **hard demons** | **0.2167** |

🔑🔑 ***"Monotone across ALL SEVEN TIERS — and the standard line landing on a COIN FLIP is the cleanest
possible sanity check."*** ⚠⚠ **That is worth stating as a principle: a board whose standard line is
efficiently priced SHOULD come out at ~0.50, so a system that reproduces 0.5014 without being fitted
to do so has demonstrated it is reading the board correctly rather than reproducing its own priors.**

✅ **AND IT CORROBORATES §0e-T16-B FROM A DIFFERENT DIRECTION.** That section measures the **standard
board delivering 56.7% against a claimed 73.1%** on high-edge legs, while **alternates deliver 72.7%
against a claimed 75.8%.** 🔑 **Here the whole standard tier prices at 0.5014 — the same conclusion
reached by two unrelated measurements: *the standard line carries no exploitable edge, and the
alternate ladder is where the pricing is structural.***

⚠ **The two are NOT the same number and must not be conflated**: **0.5014 is the tier's overall
measured rate across all legs**; **56.7% is the realised rate on the subset the model called ≥66%.**
*The first says the tier is a coin flip; the second says the model cannot pick within it.*

---

## 0e-T16-B. 🔴🔴🔴 **THE GOBLIN LADDER'S SLOPE ERROR, AND THE FIRST MEASURED SIGN THAT THE ALTERNATE BOARD IS WHERE THE EDGE IS** *(T16 pass 1, §T16.2, 2026-09-13)*

### ✅✅ FIRST — **THE ANSWER TO §0e-T16's OPEN QUESTION, AND IT CORRECTS THIS SWEEP'S OWN HEDGE**

*§0e-T16 below records the owner's directive that **"the ladder should not be electing one"** and
notes: **"stated as a correction, so something WAS electing — NOT RECORDED what."*** 🔴 **It is now
recorded, and nothing in the PIPELINE was electing — the ANALYSIS was.** The assistant's own reply:

> ***"That's a correction to my ANALYSIS, not to the system. The ladder already produces a final HP
> for every rung, both directions: `baseline_history` carries `p_more` and `p_less` at anchor ±10 for
> all 30 props. **COVERAGE IS COMPLETE.** My mistake was **FILTERING TO model ≥ 66% for the
> analysis**, which framed it as **PICKING LEGS rather than PRICING ALL OF THEM.**"***

✅ **So the directive changed how the system is MEASURED, not how it computes** — **and the change of
frame is what produced the findings below**, which a top-slice filter would have hidden.

### 🔴🔴 THE PRODUCT FINDING — **the alternate ladder clears break-even by 15 points; the standard board does not clear it at all**

*High-edge legs (model ≥ 66%), **30,974 graded legs** — the measurement made BEFORE the owner's
correction, kept because it is the cleanest statement of the split:*

| | n | **model says** | **actually hit** | overstatement |
|---|---|---|---|---|
| **alternate goblin / demon** | **25,909** | 75.8% | **72.7%** | **3 points** |
| **standard line** | 5,065 | 73.1% | **56.7%** | 🔴 **16 points** |

🔑🔑 ***"Against a 55.0–57.7% break-even, **72.7% on alternates clears it by 15 points**, while **56.7%
on standard lines is right at the line and not exploitable after variance.**"*** ✅ **And it matches
the independently recorded finding that PrizePicks' standard board is efficiently priced while the
alternate ladder's pricing is structural rather than sharp.**

⚠⚠ **TWO CAUTIONS STATED AT THE TIME, AND BOTH STAND**: **(1) goblins carry REDUCED PAYOUTS** — *the
tier work measured observed factors taking **40–53% of payout** while **goblins only afford 21–34%**,
"so a 72.7% hit rate on a goblin doesn't automatically clear ITS OWN break-even; **the payout table
decides that**"*; **(2) the model's 3-point overstatement at the high end must be folded in.** 🔑 **The
defined next step is to compute TRUE BREAK-EVEN PER TIER from the measured payout factors and
intersect it with this calibration** — *see §0g below for the 1.9× More-goblin floor, which is an
input to exactly that computation.*

### 🔴🔴 THE SLOPE ERROR — **the goblin ladder is under-confident LOW and over-confident HIGH, on every tier**

*Only visible because every band was priced rather than the top slice:*

| | model says | actually hits | gap |
|---|---|---|---|
| **goblin t-2, low band** | 0.318 | **0.622** | 🔴 **+30 points** |
| **goblin t-2, high band** | 0.877 | 0.746 | 🔴 **−13 points** |

🔑 ***"The same inversion appears across EVERY TIER. That's a CALIBRATION SLOPE problem specific to the
goblin ladder, and it's CORRECTABLE."***

### 🔑🔑 AND WHERE THE HEADROOM IS — **the deepest goblins in the MIDDLE probability bands**

| cell | model | **actual** | n |
|---|---|---|---|
| **goblin t-3 over, 0.55–0.60 band** | 0.579 | **0.754** | 601 |
| goblin t-3 over, next band down | 0.523 | **0.697** | — |

⚠⚠ ***"The deepest goblins in the middle probability bands are where the model most UNDERSTATES — and
those are cells a top-slice filter would NEVER have surfaced."*** 🔑 **Both findings are PRICING
corrections, not selection rules**, which is precisely the owner's point in §0e-T16: *"every leg gets
its HP; the bands then tell us WHERE that HP is systematically wrong and BY HOW MUCH."*

✅ **The correction is stored per cell in `nba_score.tier_band_calibration`, keyed `prop × kind × tier
× phase × band × direction`, and it beats the baseline OUT-OF-SAMPLE** — *fitted on 2024-25, applied
to 2025-26; see `NBA_BASELINE_CALIBRATION.md` §0z-T16-B for the full result, the phase decay, and the
scope limit that confines it to **board-offered lines**.*
→ 🆕 *`2026-10-10`: on `2026-09-26` the build chat judged the table "nothing to wire" as a correction; ✅ live, `build_final_hp.py` reads it into a map no later line uses — `NBA_MASTER_SUMMARY.md` `§T29.1`.*

---

## 0e-T16. 🔴🔴🔴 **THE LADDER MUST NOT ELECT A VARIATION — EVERY LEG, EVERY VARIATION, EVERY DIRECTION GETS A FINAL HP** *(owner directive, 2026-09-13; T16 pass 0, §T16.1; **0 of the twelve and 0 of the thirty**, positive controls passed — `goblin` returns 581 of the thirty and 383 of the twelve on the same machinery)*

> 🔴🔴 ***"The ladder should NOT be electing one — goblin, demon or regular. **ALL legs, ALL variations,
> ALL directions should have a final HP.** Different bands and variations will have different hit
> rate, and **THERE IS WHERE POSSIBLE ROI RESIDES**, so all get properly calculated."***

⚠⚠ **This is an architectural instruction, not a preference**, and it is stated as a correction — *"the
ladder should NOT be electing"* — **so at 2026-09-13 something in the pipeline was electing one
variation per leg, and the owner stopped it.** 🔑 **NOT RECORDED: what was electing, or whether the
election was removed.** *The sweep records the directive and its date; the implementation question
belongs to T16's later passes and to the live pipeline.*

### 🔑🔑 WHY IT MATTERS MORE THAN IT READS — **the owner locates the EDGE in the spread across variations**

*The reasoning is given in the same breath and it is an ROI argument, not a completeness argument:*
**"different bands and variations will have different hit rate, and THERE IS WHERE POSSIBLE ROI
RESIDES."** ⚠ **So scoring only the elected variation does not merely lose coverage — it discards
exactly the dispersion the edge is supposed to come from.**

✅ **AND IT CONVERGES WITH A MEASURED FINDING FROM THE DAY BEFORE**
*(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §8)*: **lift over a base-rate model is 2–3× higher on the
low-count and short-period props than on the headline combos** — *threes_made_q1 **27.3%**,
assists_q1 26.1%, oreb 25.8%, stocks 25.0%, against **pra 7.5%** and **fantasy_score 5.2%***. 🔑 **Two
independent routes to the same conclusion: the edge is in the thin, varied markets, not the deep
ones — the owner from design intuition, the reliability scorer from measurement.**

⚠ **Recorded against §0f below** *(the owner's statement of the goblin/demon rule)* **and §0g** *(the
1.9× More-goblin floor)*: **those govern what a goblin or demon IS and what it pays; this one governs
that none of them may be skipped.**

---

## 0f. 🔑 THE OWNER'S OWN STATEMENT OF THE RULE — **and the four parts of it the twelve did not carry**
*Recorded 2026-09-22 (T13 pass 0, §T13.1e). **Transcript `2026-09-13-01-03-48`, owner segments 661
(3,417 chars) and 693.** Probed against the baseline `4429380d`, pinned 2026-09-22T07:43Z; controls
`anchor` 57 of thirty and `multiplier` 58 both fire; every hit opened.*
⚠ **The RULE itself is thoroughly on file and is NOT re-derived here** *(rule 28)*: **`invisible
anchor` is in 5 of the twelve, `switch point` in 3, the `10.5 / 11.5 / 12.5` example in 2, and
`LADDER_DEPTH` in 9.** ***What follows is the four parts that are not.***

**1 · 🔴 THE VALIDITY CHECK — *"same payout"* is 1 of thirty and 0 of the twelve; *"cannot be the same
as a regular"* is 0 of THIRTY.** *Segment 661, verbatim*:
> ***"once that's done, then you need to see if there's a PATTERN on the multiplier — the money pay
> you see on the mined data — to see if it makes sense. Because if you have goblin T1, goblin T2
> with the SAME PAYOUT, that's bullshit, that's not working. Same for demons. And of course they
> cannot be the same as a REGULAR line."***

🔑 ***This is a three-part FALSIFICATION TEST for any tier assignment***, and it is cheap to run:
**(a) adjacent goblin tiers must not share a payout · (b) adjacent demon tiers must not share a
payout · (c) no goblin or demon tier may equal the standard-line multiplier.** ⚠ **A tiering that
fails any of the three is mis-anchored, not merely imprecise.**

**2 · 🔴 LADDER DEPTH IS PROP-DEPENDENT, AND THE SHALLOW ONES PAY DIFFERENTLY — *"not treated equal"*
is 0 of THIRTY.** *Segment 693, verbatim*:
> ***"the goblin and demon tiers are NOT TREATED EQUAL FOR ALL PROP LINES. For points you're gonna
> have a LADDER of goblins and demons — the first is a good pay, the second less, the third less,
> and so on for goblins, and the opposite for demons. But when you get a HARD LINE — maybe fantasy
> score, maybe steals, something that's a LOW COUNT more than anything — you're probably gonna have
> just ONE. And that goblin or demon is very likely to be a DIFFERENT, A LOT LOWER MULTIPLIER
> compared to the ones that have the ladder."***

⚠ **`LADDER_DEPTH` the constant is in 9 of the twelve; this is the owner's statement of WHY it
varies, and of the consequence — *a single-rung prop's goblin is not priced like a deep ladder's
first rung*.**

**3 · 🔴 WHY THE TIERS MATTER AT ALL — *"different multipliers"* is 0 of THIRTY.** *Segment 661*:
***"different tiers of different goblins and demons are gonna have DIFFERENT MULTIPLIERS, and that's
essential for us to find ROI when the time comes."*** 🔑 **The tiering is not taxonomy for its own
sake — it is the ROI input.**

**4 · 🔴 THE METHOD ORDER — *"whole mechanics"* is 0 of THIRTY.** *Segment 693*: ***"First, understand
the WHOLE MECHANICS for goblins and demons for NBA, and THEN start focusing on each one of the prop
lines."*** ⚠ *Stated as an ordering constraint on the research, not as a preference.*

📌 **And the forward-looking half of segment 661, for the record**: *"the system needs to be ready to
treat goblins and demons **LESS** for the next season, because PrizePicks just rolled an upgrade and
is doing that for WNBA and also for MLB… **for the past two seasons, very likely, you're only gonna
have goblin and demon as MORE**."* ✅ ***Which is exactly what §T12.7c measured: not one `Under`
alternate in 2.2M `board_tiers_v2` rows.***

## 0g. 🔴 THE MORE-GOBLIN PAYOUT FLOOR IS **1.9×**, NOT 2.08× — *owner-supplied correction, verified live*
*Recorded 2026-09-22 (T12 pass 5, §T12.6f). **Owner-supplied, then verified against the live system
rather than taken on the word of the message.** All figures pinned **2026-09-22T07:01:38Z** unless
stated. `SELECT` only.*

**What the live rule says** — `nba_config.pp_slip_rules`, `rule_key = 'goblin_floor'`,
**`status = 'superseded'`**, `updated_at` **2026-09-21T21:47:40Z**:

```json
{"factor": 0.6933, "two_pick": 2.08,
 "superseded_by": {"factor": 0.6333, "two_pick": 1.9,
                   "evidence": "lowest More-goblin payout seen: 1.9x (WNBA, 36 quotes)"}}
```

> *"**SUPERSEDED 2026-09-21: the 2.08× (2.1× displayed) floor does NOT hold.** More-goblin 2-pick
> quotes **with a STANDARD partner from a DIFFERENT game** paid **2.0× on NBA** (3 distinct legs:
> **SGA 3PM 0.5, Tatum 3PM 1.5, Cunningham REB 3.5**) and **1.9× (26 legs) / 2.0× (46 legs) on
> WNBA**. The pricing formula without a floor tracks them (**real/formula 1.02**). Pricing now floors
> at **1.9×** (`pp-leg-v2-sqrt-cap-conservative-floor190`). **Original note**: deepest goblins price
> at 2.1× regardless of depth; true value just under 2.086. The floor is **per goblin and
> multiplies** (two floor goblins paid **1.4×**)."*

> ## 🔴🔴 **§T23.7 — SUPERSEDED AGAIN, AND THIS TIME THE CORRECTION IS TO THE *SHAPE*, NOT THE VALUE**
> *(`T23`, `2026-09-21`, recorded `2026-09-23`.)*
>
> > ***"Correction: the `2.08×` goblin floor isn't universal. It varies BY STAT and BY LEAGUE, so I'll
> > set NBA's from preseason data."***
>
> | | |
> |---|---|
> | first recorded | `2.08×` *(factor `0.6933`)* |
> | superseded `2026-09-21` | `1.9×` *(factor `0.6333`, `pp-leg-v2-sqrt-cap-conservative-floor190`)* |
> | 🔴 **superseded again, same day** | **there is no single floor** — *it is a per-stat, per-league parameter* |
>
> 🔑🔑 ***A CONSTANT THAT NEEDED CORRECTING TWICE IN ONE DAY WAS NOT A BADLY MEASURED CONSTANT. IT WAS
> A PARAMETER WITH A MISSING INDEX.*** *Each measurement was correct for the stat and league it was
> taken on, and each was published as universal.* ⇒ **The pattern is worth naming, because this
> corpus contains other scalars fitted across heterogeneous populations** — *and `RULE 26`'s "never
> apply a tier/pool-level multiplier to a heterogeneous population" is the MLB lesson that predicted
> it.*
>
> ⚠ **NBA's own floor is therefore NOT YET KNOWN** and is scheduled to be set from **the preseason
> board of `2026-10-03`**. *Until then the conservative mode's `−3%` goblin margin is what stands
> between the model and a floor that is too high.* 📌 *`§T23.6` item `1` in `NBA_MULTIPLIERS.md`
> carries the related cap; the two are different parameters at opposite ends of the same ladder.*

✅ **And the pricing model confirms it**, pinned **2026-09-22T07:02:02Z**: the CURRENT model is
**`pp-leg-v2-sqrt-cap-conservative-floor190`** *(`is_current = true`, created 2026-09-21T21:46:54Z)*
with **`goblin_floor_factor` = 0.6333**, against **0.6933** in every earlier version
*(`pp-leg-v1-normal`, `pp-leg-v2-sqrt`, `pp-leg-v2-sqrt-full`)*.

### ✅ WHAT NEEDED RETRACTING IN THIS CORPUS — **nothing, and that is the finding**
*Searched every `.md` in `nba/` for `2.08`, `2.086`, `goblin_floor`, `2.1×`/`2.1x`, and for
goblin-near-floor prose, **pinned 2026-09-22T07:02Z**, excluding `nba/data/`, `backtest/` and the run
log:*
🔑 ***The 2.08× floor is stated as fact in exactly ONE file — `nba/PP_PAYOUT_FINDINGS.md` — which is
the concurrent build session's own document and is out of this sweep's scope.*** **No document among
the twelve or the eighteen ever carried it**, so **there is nothing here to retract** and the
correction is recorded above as a new dated fact rather than as a supersession of our own prose.
⚠ **`PP_PAYOUT_FINDINGS.md` is left to the session that writes it** *(standing scope rule, reaffirmed
by the owner 2026-09-22)*.

### ⚠ WHY IT MATTERS HERE, stated at evidence strength
**The floor is the factor a More-goblin leg is priced at when the model's `implied_p` exceeds 0.5**,
so it sets the **cheapest** leg the board offers — ***and a floor set 9.5% too high makes every
deep-goblin slip look worse than it is*** *(2.08 → 1.9 is −8.7% on the two-pick quote; the note's
"two floor goblins paid 1.4×" shows the error compounds per leg)*. ⚠ **What this does NOT say**: the
NBA evidence is **three distinct legs** and the 1.9× itself is **WNBA**; ***whether NBA ever prints
below 2.0× is NOT RECORDED***, and the note is explicit that the 1.9× observation is WNBA's.
**A dated STATE** *(O9)*.

## 0h. 🔑🔑 THE LABELS ARE **ENCODED IN THE PRICE** — measured on 183,777 rows, **re-taken live on 191,690**
*Recorded 2026-09-22 (T13 pass 1, §T13.2). **Source: T13's own measurement over
`nba_market.board_snapshots`, 2024-10-22 → 2025-04-13. RE-TAKEN LIVE against the same SQL and the
same fixed date range, pinned 2026-09-22T07:47Z** — rule 31: read the system, not the description.*

**The method**: join every `%_alternate` PrizePicks row to the **standard** row for the same
`event_id · snapshot_label · player · stat · side`, and classify the alternate by **which direction
its line moved**.

| `price` | Direction vs the standard line | T13 rows *(2026-09-10)* | **LIVE rows** *(2026-09-22)* | T13 avg offset | **LIVE avg offset** |
|---|---|---|---|---|---|
| **+100** | **harder** → **DEMON** | 108,730 | **113,356** | **+4.21** | **+4.22** |
| **−137** | **easier** → **GOBLIN** | 74,863 | **78,135** | **−2.87** | **−2.87** |
| −137 | same line | 95 | 97 | 0.00 | 0.00 |
| −137 | harder | 72 | 85 | +2.49 | +2.36 |
| +100 | easier | 9 | 9 | −1.39 | −1.39 |
| +100 | same line | 8 | 8 | 0.00 | 0.00 |
| | **TOTAL** | **183,777** | **191,690** | | |
| | **exceptions** | **184 = 0.100%** | **199 = 0.104%** | | |

✅ **Both partitions CLOSE** *(108,730+74,863+95+72+9+8 = 183,777; 113,356+78,135+97+85+9+8 = 191,690)*,
and **T13's stated *"~180 rows out of 183,000, 0.1%"* re-derives EXACTLY to 184 of 183,777.**

### 🔑 THREE THINGS THIS ESTABLISHES, AND THEY ARE DIFFERENT CLAIMS

**1. The historical data DOES carry the goblin/demon labels — they were never lost.**
> *"the historical PrizePicks data **does** carry the goblin/demon labels, **encoded in the price**:
> **+100 = Demon** (harder line, boosted payout) and **−137 = Goblin** (easier line, reduced payout)."*

⚠⚠ **This corrects how §4 reads `price=-137`.** §4 calls it the value **v1 derives `kind` from**, as
though it were an arbitrary sentinel. **It is not a sentinel — it is the standard-leg market price**
*(`NBA_MULTIPLIERS.md` §0.9d: −137 is PrizePicks' canonical break-even, 57.8%)*. **So v1's derivation
was reading a real economic quantity, not a tag** — which is why it worked on Over rows at all.

**2. The mapping is STABLE under a 4.3% increase in rows — a robustness result T13 could not produce.**
**The table grew by 7,913 rows for a FIXED, CLOSED date range** *(the gap-repair pass of §0h.1 still
landing rows into 2024-25)*, **and the average offsets moved by at most 0.01.** ⚠ **The exceptions
grew slightly faster than the population** *(0.100% → 0.104%)*, **which is a STATE, not a trend** —
two observations do not make one.

**3. 🔴 `Under` does not appear in ANY of the twelve cells, then or now.**
✅ **Independent confirmation of §T12.7c on a DIFFERENT table with a DIFFERENT query** — that
finding was measured on `board_tiers_v2` *(not one `Under` alternate in 2.2M rows)*; this is
`board_snapshots`. ***Two tables, two queries, same answer*** — **and it is exactly what the owner
predicted at T13 seg 661** *("for the past two seasons you're only gonna have goblin and demon as
MORE")*, **now confirmed a second way.**

### ⚠ WHAT THIS DOES **NOT** ESTABLISH
**It gives the LABEL, not the MULTIPLIER.** `+100` and `−137` are **two prices for the whole
population** — *the same two values on every rung* — so they **cannot express tier depth**, which is
precisely §5.0d's step function and `NBA_MULTIPLIERS.md` §3's *"not one number per tier."*
🔑 ***A two-valued price column can label a rung and can never price one.*** **The per-rung price
lives on Underdog** *(`NBA_MULTIPLIERS.md` §0.9e: 1,401 rungs, 233 distinct Over prices)*, **not
here.**

### 0h.1 **THE MODELLING RULE THIS FORCES** — *condition on the SHIFT, never on the label*
**`NBA_MULTIPLIERS.md` §0.9f records the rule in full.** Its evidence sits in the offset column
above: **demons average +4.22 from the anchor while goblins average −2.87** — ***demons sit roughly
1.5× as far out as goblins***, so **"goblin" and "demon" are not symmetric distances wearing
different names.** ⚠ **Any model keyed on the LABEL silently assumes a symmetry the data denies.**
**The per-stat form of this** *(PRA: 26.2 average line, 0.85 goblins and 1.20 demons per ladder,
offsets −3.56 / +6.28)* **is in `NBA_MULTIPLIERS.md` §0.9f. One prop is measured; the rest are NOT
RECORDED.** → 🆕 *the other seven props' rows, as the transcript gives them (`2026-10-14`, additional sweep `2`): `NBA_MASTER_SUMMARY.md` `§T13.7`.*

---

## 1. THE RULE

### 1.0 PrizePicks' OWN DESCRIPTION *(captured verbatim in T8)*
> **Demons** — *"max payout **up to 2000× your Lineup fee** if you pick correctly. **You must pick More
> on a Demon projection.**"*
> **Goblins** — *"identified by a **GREEN ICON** on the board and they're **designed to keep you in the
> green**. These are **safer picks** that make it easier to land consistent victories."*

**Three things this pins down:**
1. **The visual key**: goblins carry a **green icon**. Any parser working from rendered UI rather than
   the feed should key on `odds_type`, not colour — but the colour confirms the label.
2. **"You must pick More on a Demon projection"** — **the More-only rule, in PrizePicks' own words**,
   which is why the v1 two-way taxonomy was correct when built.
3. **2000× is the platform's stated maximum slip payout**, not a per-leg factor. The per-leg factor
   remains unavailable (see `NBA_MULTIPLIERS.md`).

**⚠ Statement 2 is now OUT OF DATE** — PrizePicks enabled Less in 2026-08. **The official
documentation is itself a dated source**, which is exactly why §4 exists.

### 1.1 The rule as it stands today

> **Below the anchor: More = GOBLIN, Less = DEMON.**
> **Above the anchor: More = DEMON, Less = GOBLIN.**

**The label is a function of `(position vs anchor, side)` — NEVER of the emoji alone, and never of the
price.**

**Why**: a goblin is the *easier* side, a demon the *harder* side. Below the anchor, taking More is
easier. Above the anchor, taking More is harder. **The direction of "easier" flips at the anchor.**

### 1.1 Worked example
Anchor 12.0:
| Line | Side | Label |
|---|---|---|
| 10.5 | More | **goblin** (easier — below anchor) |
| 10.5 | Less | **demon** (harder — below anchor) |
| 13.5 | More | **demon** (harder — above anchor) |
| 13.5 | Less | **goblin** (easier — above anchor) |

### 1.2 The SQL, as implemented in `build_board_tiers_v2.py`
```sql
CASE
  WHEN p.line < a.anchor AND side LIKE 'o%' THEN 'goblin'   -- below, More  = goblin
  WHEN p.line < a.anchor AND side LIKE 'u%' THEN 'demon'    -- below, Less  = demon
  WHEN p.line > a.anchor AND side LIKE 'o%' THEN 'demon'    -- above, More  = demon
  WHEN p.line > a.anchor AND side LIKE 'u%' THEN 'goblin'   -- above, Less  = goblin
END
```

---

## 2. THE ANCHOR — two cases

### 2.1 Explicit anchor
A standard line is present on the board for that player × prop. **Use it.**

### 2.2 **INVISIBLE ANCHOR / SWITCH POINT**
When **no standard line is offered**, the anchor is derived from **where goblins flip to demons**.

> *"**10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor.**"*

The anchor sits **between the highest goblin and the lowest demon**.
**Validated on 42,600 pure goblin→demon ladders.** **419,205 legs carry a switch-point anchor.**

`nba_market.board_tiers.anchor_type` ∈ **`explicit`** | **`switch_point`**.

### 2.3 A third method, used for books that price every rung
From `nba_market.board_tiers_ud` (Underdog):
> *"the anchor is **the FAIR rung — implied probability closest to 50%** — not a flagged one."*

**Use this where every rung carries a price**; use the switch point where only labels exist.

---

## 3. THE TIER SIGN

**v1 signs tiers by KIND** (goblin negative, demon positive). **That breaks under the four-way rule**,
because a demon-Less now sits *below* the anchor.

**v2 signs by POSITION**: **negative below the anchor, positive above**.
**So `(tier sign, side)` reconstructs the label**, and the sign always means direction.

| tier sign | side | label |
|---|---|---|
| − (below) | More | goblin |
| − (below) | Less | demon |
| + (above) | More | demon |
| + (above) | Less | goblin |

---

## 4. WHY v1 IS NOW WRONG — the taxonomy change

**v1 derives `kind` from the Odds API PRICE** (`price=100` → demon, `price=-137` → goblin), and
**every v1 row is Over-only**.

**That was CORRECT when built.** Verified twice:
- T7's 3-app inventory: *"PrizePicks: Demon and Goblin variants — **both More-only (confirmed
  officially)**, so the 'less' side exists only on standard lines."*
- Confirmed in the 2024-25 archive: **zero Under rows on alternates**.
- PrizePicks' own help centre said so through **2025-08**.

**PrizePicks enabled LESS in 2026-08** (MLB and WNBA first; owner screenshots confirm it live on
WNBA).

🆕 *(additional sweep `9`, pass `540`, `§P540` — `T18` `2026-09-20 03:37Z`, the screenshots' content, AS STATED)*: *"your WNBA screenshots prove it's live: image 6765 shows Awa Fam 6.5 Rebs+Asts with a demon on the Less side, and 6766 shows Kamilla Cardoso 2.5 Assists with both Less and More available."*

**Consequence**: a **demon-Less now sits BELOW the anchor** — and the price-based v1 label calls it a
**goblin**. **The two-way taxonomy cannot express the board any more.**

---

## 4. THE LADDER CONFIG — `nba_config.classification_config.ladder`

> ### ⚠ NOTHING READS THIS TABLE — **VERIFIED 2026-09-20 (T1 pass 36)**
> A grep of all 190 `.py`/`.js` files in `nba/` **and** the MCP admin bridge finds
> **`classification_config` zero times.** The stored JSON below is a **recorded design, not a live
> setting**: the ladder's actual steps and bounds are **hardcoded** in
> `nba/backtest/classification_ladder_v12.py` (`LADDER_STEPS`, and `step` per prop inside the `PROPS`
> dict).
> **Editing this JSON by SQL changes nothing and raises no error** — which matters here because the
> ladder config is the most obvious thing a future reader would reach for when adjusting rung depth.
> **Not claimed**: that the JSON disagrees with the code. On the sibling table
> `stat_decay_config` a full diff **did** find disagreement on 7 of 10 stats, so **this one warrants
> the same check and has not had it.** `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.

**The actual stored JSON:**
```json
{"anchor": "recency_blended_projection",
 "clip_floor": 0.5,
 "ceiling_pct_more": 85,
 "floor_pct_less": 15,
 "goblin_pct": [25, 35],
 "demon_pct":  [70, 80]}
```
*Note: "Player-anchored ladder, **owner: 5–6 steps minimum each side**"*

**So the percentile placement is configured, not folklore:**
| Rung class | Percentile of the player's own outcome distribution |
|---|---|
| **Goblin** | **25th–35th** |
| Standard | median |
| **Demon** | **70th–80th** |
| Useful range | **15th (floor, less) – 85th (ceiling, more)** |
| `clip_floor` | **0.5** — the natural line floor |

**The anchor is `recency_blended_projection`** — the ladder is **player-anchored, never global**, and
**everything is a percentile of that player's own distribution.**

**This matches the three independent sources**: books ladder a 24.5 player **~19.5 to ~31.5 ≈ ±1 SD**;
Unabated prices off the full outcome distribution; Gemini independently proposed the same percentile
bands. **And the measured `LADDER_DEPTH` (p95 = 13 rungs for points) agrees to within one rung.**

---

## 5.0d **THE PRICING FUNCTION'S SHAPE** *(Part B of the lessons document — platform mechanics)*

> *"**PrizePicks Goblin/Demon-style tiered pricing: pricing is DISCRETE / STEP-FUNCTION (a fixed
> multiplier PER TIER), not continuous per-leg pricing.** As tier distance from the **anchor** line
> increases, **the easier direction (Goblin-style) pays progressively LESS, while the harder direction
> (Demon-style) pays progressively MORE, roughly GEOMETRICALLY — ~1.4× growth factor per tier step in
> MLB's case, likely different but DIRECTIONALLY SIMILAR for NBA.**"*

**This is the single most useful structural statement about the pricing.** Four things follow:

1. **Pricing is a STEP FUNCTION over tiers, not a continuous function of the line.** The multiplier is
   attached to the **tier index**, not to the rung's actual probability. **Which is exactly why the
   mispricing exists**: two legs in the same tier with materially different true probabilities carry
   the same factor.
2. **It is keyed on DISTANCE FROM THE ANCHOR** — so **the anchor must be right or the tier index is
   wrong**, and with it the price. **That is what makes the invisible-anchor derivation (§2.2)
   load-bearing rather than cosmetic.**
3. **Demons grow ~geometrically, ~1.4× per step in MLB.** Against our measured NBA break-evens —
   T+1 needs **1.48×**, T+2 **2.30×**, T+3 **3.31×** — a 1.4× geometric ladder gives roughly
   1.4 / 1.96 / 2.74. **T+1 is the only tier where the offered growth plausibly clears the
   requirement**, which is an independent route to the same conclusion as §5.2.
4. **Goblins pay progressively LESS as they get safer** — and §5.0c says the safe variant prices
   *flat regardless of rarity*. **Reconciled: flat WITHIN a tier, stepping DOWN between tiers.**

**⚠ The ~1.4× is an MLB number and lesson #24 says the numerics decay.** Treat as a prior for the
*shape*, not the value. **Measuring NBA's actual step ratio is one of the first things a live board
makes possible** — and it needs only the tier index and the factor, not a full per-leg capture.

> *"**PrizePicks Flex payout tables can have a genuinely diff[erent structure]**"* — see
> `NBA_MULTIPLIERS.md` §0.2b.

---

## 5.0c **THE DURABLE PRICING MECHANICS** *(lesson #24 — held across MLB's entire history)*

**These three qualitative behaviours survived MLB's whole run; the exact numeric ratios attached to
them did not.**

| Behaviour | Detail |
|---|---|
| **One variant prices FLAT** | *"one Goblin/Demon-style variant **prices flat REGARDLESS of the underlying event's rarity**"* |
| **The other SCALES with rarity** | *"the **higher-risk variant scales its payout with how rare the specific event is**"* |
| **Pairing is irrelevant to pricing** | *"**game or team pairing has NO EFFECT on pricing**"* |

**Read together with the four measured mechanics in `NBA_MULTIPLIERS.md` §0.1**, this gives the shape
of the pricing function:
- **The safe variant (goblin) is flat** — its payout does not respond to how safe the specific line is.
  **So a goblin on a 40%-clear line and one on a 15%-clear line pay the same.** That is precisely the
  *"directionally but not proportionally"* mispricing of lesson #13, seen from the goblin side.
- **The risky variant (demon) scales with rarity** — so demon pricing *does* respond to the event,
  which is why demon T+1 can clear break-even while T+2 and T+3 cannot.
- **Pairing has no effect on PRICING**, yet §0.1 records that *"same-team/same-game legs get a small
  multiplier discount."* **These are not contradictory**: the discount is applied at **slip
  construction**, not in the leg's own price. **Correlation is priced at the slip level, not the leg
  level.**

### ⚠ THE NUMBERS DECAY — the mechanics do not
> *"the ***exact* numeric ratios quoted in that same original research were later confirmed to have
> GENUINELY DECAYED AND CHANGED OVER TIME as the platform's own real pricing evolved.**"*

**And the instruction for NBA, stated explicitly:**
> *"**For NBA, EXPECT THE ANALOGOUS QUALITATIVE PLATFORM MECHANICS TO TRANSFER** — **if a DFS platform
> prices a 'safer' variant FLAT and a 'riskier' variant with RARITY-SCALING for one sport, the same
> underlying BUSINESS LOGIC likely governs the equivalent NBA-side variants** — **but ALWAYS treat the
> exact quoted numbers from any historical MLB study as A STARTING HYPOTHESIS TO RE-VERIFY FRESHLY ON
> REAL NBA DATA, NEVER as a current, reliable value in its own right.**"*

**The reason the mechanics transfer is named: it is the platform's BUSINESS LOGIC**, not a
sport-specific pricing model. The same company applies the same structure across sports.

**So the split is clean:**
| Transfers as a working hypothesis | Must be re-measured on NBA data |
|---|---|
| safe variant prices **flat** | the actual flat value |
| risky variant **scales with rarity** | the **~1.4× per-step** growth factor |
| **pairing does not affect leg pricing** | the size of the slip-level same-game discount |
| step-function over tiers, keyed on anchor distance | tier count, tier spacing (T4: *"must be verified per prop"*) |

**⚠ And even the mechanics have a shelf life** — the More-only rule was a durable mechanic **until
2026-08**. *(§4)*

> ## 🔴🔴 **§T22.8 — AND ON `2026-09-21` THE LIVE BOARD SHOWED MORE-ONLY AGAIN**
> ### *(`T22` pass `8`, recorded `2026-09-23`. **An observation, not yet a contradiction — but it has to be settled before tier labelling can be trusted.**)*
>
> *`T22` had the owner open a real PrizePicks board and describe what was on it:*
>
> > ***"Every goblin and demon card shows only `↑ More` — no Less button — while standard cards show
> > both. The documents record a four-way rule where, since `2026-08`, goblins and demons exist on
> > the Less side too. On your board, in this mode, they don't."***
>
> | | |
> |---|---|
> | what the twelve record | **the four-way rule** — since `2026-08`, goblins and demons exist on **both** sides; `nba/build_board_tiers_v2.py` implements it, ⚠ *"not yet verified"* |
> | what the live board showed, `2026-09-21` | 🔴 **More-only on every goblin and demon card** |
> | the board's mode | **`game_mode=prizepools`** — *present on every league call in the capture* |
> | the board's state | ⚠ **inconsistent within one session — `state_code=ca` on one call, `state_code=co` on another** |
>
> ⚠ **`T22` refused to call it a contradiction, and that restraint is the right call**: *"it may be
> specific to `prizepools` or to the state, so it isn't a contradiction yet — **but it's an
> observation that doesn't match what's written, and it matters for how the tiers get labelled.**"*
>
> ## ✅✅ **RESOLVED LATER IN THE SAME TRANSCRIPT — AND THE ANSWER IS BETTER THAN EITHER OPTION**
> *`T22`'s own closing status table settles it in five words:* ***"four-way less side — priced by the
> engine, HIDDEN BY THE APP."***
> ⇒ 🔑🔑 ***The Less side EXISTS and IS PRICED. The app simply does not render a Less button on
> goblin and demon cards.*** **Both records were right: the four-way rule is real (the engine), and
> the board really shows More-only (the app).**
> 📌 ***The restraint was what made the resolution possible.*** *Had the observation been filed as a
> contradiction, the four-way rule would have been marked doubtful and the engine-side pricing —
> which is the part an EV model actually consumes — would have been thrown out with the UI.* ⚠ **`The
> app is not the engine` is now a standing distinction for every board observation in this
> document.**
>
> 🔑🔑 ***PrizePicks serves a DIFFERENT GAME MODEL in some states, and a prize-pool model may not pay
> fixed multipliers the way Power Play does.*** ⇒ ***Every multiplier figure in these documents is
> implicitly scoped to a game mode and a state, and none of them say which.*** **That is the finding,
> and it is larger than the More-only question it came from.**
>
> ### 📋 **THE `game_types` PAYLOAD, VERBATIM — three fields the twelve do not carry**
> *(the `2.1 kB` response that fires when the SECOND leg is added; one leg cannot form a valid entry,
> so nothing prices until there are two)*
>
> | field | value observed |
> |---|---|
> | `power play` *(id `2`)* | `payouts: {"2": {"2": 2.2}}` |
> | `flex play` *(id `1`)* | `payouts: {"2": {"2": 1.8, "1": 0.25}}` |
> | `payouts_srp` *(both)* | `power: [1.2, 0.0, 0.0]` · `flex: [1.2, 0.0, 0.0]` |
> | 🔴 **`is_adjusted`** | **`true`** |
> | 🔴 **`is_cashout_eligible`** | **`true`** — *not recorded anywhere in the twelve* |
> | 🔴 **`is_max_payout_alert`** | **`false`** — *not recorded anywhere in the twelve* |
>
> ⚠ **`is_cashout_eligible: true` matters more than it looks.** *A cash-out facility changes the
> expected value of a slip that a fixed-multiplier model prices as all-or-nothing. **Recorded as an
> observed field, with no claim about whether the system should use it** — `RULE 55`: the conclusion
> is not recorded because the table under it does not exist yet.*
>
> ⚠ **AND ONE PRIZEPICKS TERM THE CORPUS STILL CANNOT DEFINE**: *the board displayed* ***"Reversion
> lineup payouts are different than standard. Learn more."*** *`T22` said plainly:* ***"I don't know
> what PrizePicks means by reversion."*** **It is still not defined in the twelve.** 🔑 *Recorded as a
> named unknown rather than omitted — an undefined term on the live board is a gap a reader can
> close; an omitted one is a gap nobody knows to look for.*

---

## 5.0b ⚠ **THE STRUCTURAL MISPRICING — real, measured, and never exploited**

**Lesson #13, the one the handoff calls *"a real, load-bearing finding"*:**
> *"**Platforms price probability DIRECTIONALLY but NOT PROPORTIONALLY** — a real, load-bearing
> finding, **but exploiting it requires solving player-level selection, which MLB NEVER MANAGED**.
> Sportsbook-vs-DFS comparison confirmed **the Goblin/tiered-pricing mechanism moves its payout only a
> SMALL FRACTION of what a linear/proportional pricing model would require for a given probability
> gap** — in MLB's case, **roughly a 15% multiplier change for a ~2.6× TRUE-PROBABILITY GAP**.
> **This means there IS a real, structural mispricing — but MLB never found a way to IDENTIFY IN
> ADVANCE which specific legs sit on the high-probability side of that gap; every walk-forward
> selection attempt (raw trailing hit rate, model-probability quintiles, appearance frequency)
> REGRESSED TO THE POOL AVERAGE.** **If NBA replicates this finding, treat [it the same way].**"*

### What this means concretely
**A 2.6× swing in true probability buys only a ~15% change in payout.** The pricing is
*ordered* correctly — harder rungs pay more — but the **magnitude is nowhere near proportional.**
**So the mispricing is structural and large**, and it sits exactly where goblins and demons live.

### Why it was never harvested — and what the real problem is
**The mispricing is not the hard part. SELECTION is.** Three walk-forward approaches all failed:
| Attempt | Result |
|---|---|
| raw trailing hit rate | **regressed to the pool average** |
| model-probability quintiles | **regressed to the pool average** |
| appearance frequency | **regressed to the pool average** |

**Every method that looked like it identified high-probability legs in advance stopped working out of
sample.**

### ⚠ THE INSTRUCTION FOR NBA, STATED EXPLICITLY
> *"**If NBA replicates this finding, treat 'THE MECHANISM IS REAL' and 'WE CAN EXPLOIT IT' as TWO
> COMPLETELY SEPARATE, BOTH-UNSOLVED QUESTIONS** — [MLB] solved neither the second one."*

**Two questions, tracked separately:**
| Question | Status |
|---|---|
| **Is the mechanism real?** | **Yes** — measured: ~15% multiplier change for a ~2.6× probability gap; ~~step-function pricing keyed on tier index~~ 🔴 **SUPERSEDED — see `§T22.9` directly below: it is keyed on the LINE, not the tier index** |

> ## 🔴🔴 **§T22.9 — IT IS PRICED BY THE LINE, NOT BY THE RUNG — AND ANY EV KEYED ON RUNG NUMBER IS WRONG**
> ### *(`T22` pass `9`, recorded `2026-09-23`, from `52` live quotes on `2026-09-21`)*
>
> *The documented model — **"discrete step-function per tier, goblin pays flat"** — predicts that the
> same rung pays the same factor. **It does not.***
>
> | rung | observed range across players and stats |
> |---|---|
> | **Demon `+2`** | 🔴 **`5.25×` → `7.5×`** |
> | **Goblin `−1`** | 🔴 **`2.2×` → `2.8×`** |
>
> ⇒ ***"The further the line sits from standard, the bigger the adjustment."*** **The price is a
> function of the DISTANCE OF THE LINE FROM THE STANDARD LINE, in the stat's own units — not of the
> ordinal rung index.** *Two legs on rung `+2` differ because `+2` rebounds and `+2` points are not
> the same distance in probability space.*
>
> ### 📊 **THE MEASURED TABLE — `§T22.17`, every row a `demon +1`, `2026-09-21` live quotes**
> *Added `2026-09-23`. **Seven legs, all on the same RUNG, and the payout more than doubles across
> them.** `dist` is line − standard; `pct` is that distance relative to the standard line.*
>
> | player | stat | line | standard | dist | **pct** | **power** |
> |---|---|---|---|---|---|---|
> | Wembanyama | rebounds | `11.5` | `11` | `+0.5` | **`+4.5%`** | **`3.25`** |
> | LeBron | pts+rebs | `24.5` | `23.5` | `+1.0` | **`+4.3%`** | **`3.25`** |
> | Wembanyama | pts+rebs | `39.5` | `37.5` | `+2.0` | **`+5.3%`** | **`3.5`** |
> | Tatum | pts+rebs+asts | `44.5` | `41.5` | `+3.0` | **`+7.2%`** | **`3.5`** |
> | Tatum | pts+rebs | `39.5` | `36.5` | `+3.0` | **`+8.2%`** | **`4.0`** |
> | SGA | pts+asts | `39.5` | `36.5` | `+3.0` | **`+8.2%`** | ⚠ **`3.75`** |
> | Brunson | pts+rebs+asts | `39.5` | `35.5` | `+4.0` | **`+11.3%`** | **`4.0`** |
>
> 🔑🔑 **READ THE TABLE IN THIS ORDER AND IT SETTLES THREE THINGS AT ONCE:**
>
> **1 · The rung is constant and the price is not.** *Every row is `demon +1`. **Power runs `3.25` →
> `4.0`, a `23%` spread on one rung.*** ⇒ *the ordinal index carries no price information.*
>
> **2 · It is the RELATIVE distance, not the absolute one.** *Rows `4`, `5` and `6` all sit `+3.0`
> away in raw units and pay `3.5`, `4.0`, `3.75`. **Sorted by `pct` instead, the table is almost
> perfectly monotonic**: `4.3%`→`3.25`, `4.5%`→`3.25`, `5.3%`→`3.5`, `7.2%`→`3.5`, `8.2%`→`4.0`,
> `11.3%`→`4.0`.* 🔑 ***`+3` rebounds is a long way; `+3` points+rebounds+assists is not.***
>
> **3 · The one row that breaks monotonicity is the per-player variance, measured.** ⚠ **Tatum and
> SGA sit at the SAME `+8.2%` and pay `4.0` and `3.75`** — *a **`6.7%`** gap between two legs
> identical on every observable.* ⚠ *Corrected from `6.3%` in the same pass — `4.0 ÷ 3.75 − 1 =
> 6.67%`, re-derived rather than recalled (`RULE 56`). **Every `pct` column above was recomputed from
> its own `dist` and `standard` before publication and all seven reproduce to `0.1` point.*** ⇒ ***That is the same effect `§T22.10` names as the `±10%` accuracy ceiling,
> visible here in a single pair.*** **No formula keyed on `(stat, line, center)` can separate them.**
>
> ### ⚖ **§T22.22 — WHEN A LEG SITS BETWEEN TWO STANDARD LINES, THE BUILDER ALWAYS PICKS THE HIGHER ONE — `5,704` TIMES OUT OF `5,704`**
> *(`T22` pass `22`, live query `2026-09-21`, recorded `2026-09-23`.* ***The `18.3%` intraday standard
> movement in `NBA_DATABASE.md` `§T22.14` creates this situation; this is what the builder does
> with it.****)*
>
> | kind | alt legs inside TWO standard ladders | builder chose the **higher** | chose the **lower** | line sat **between** the two |
> |---|---|---|---|---|
> | **demon** | `3,183` | ✅ **`3,183`** | **`0`** | `0` |
> | **goblin** | `2,521` | ✅ **`2,521`** | **`0`** | 🔴 **`251`** |
> | **total** | **`5,704`** | **`5,704` — `100%`** | **`0`** | `251` |
>
> 🔑 ***The rule is not written down anywhere and it is perfectly consistent: the anchor is always the
> HIGHER of the day's two standard lines.*** **A deterministic, undocumented tie-break that decides
> the tier label on `5,704` legs.**
>
> ### 🔴 **AND FOR THE `251` LEGS THAT SIT BETWEEN THE TWO STANDARDS, THE CHOICE DECIDES THE KIND**
> *A line below the higher standard but above the lower one is a **goblin against one anchor and a
> demon against the other**. The builder labelled all `251` `goblin`. Checked against PrizePicks' own
> price flag:*
>
> | | legs | PrizePicks' flag | verdict |
> |---|---|---|---|
> | between the two standards, labelled `goblin` | **`247`** | `-137` | ✅ **agrees** |
> | between the two standards, labelled `goblin` | 🔴 **`4`** | `100` | 🔴 **DISAGREES — PrizePicks prices these as the other side** |
> | outside both standards, labelled `demon` | `3,180` | `100` | ✅ agrees |
> | outside both, labelled `demon` | `3` | `-137` | ⚠ disagrees |
>
> ⇒ 🔑🔑 ***The higher-anchor rule is right `247` times out of `251` on the ambiguous cases — a
> `98.4%` hit rate on the hardest legs in the table, and a `7`-leg total disagreement across
> `5,704`.*** **That is a strong validation of an undocumented rule, and it is recorded here so the
> rule stops being undocumented.** ⚠ **`RULE 55`: the `7` disagreements are reported, not explained —
> whether they are builder errors or PrizePicks re-posts was not determined.**
>
> ### 📉 **AND SPORTSBOOK LINES AGREE WITH PRIZEPICKS LESS OFTEN WHEN MORE BOOKS ARE AVERAGED**
> | book depth | ladders | exact | within `0.5` | within `1.0` | mean (book − pp) |
> |---|---|---|---|---|---|
> | `1`–`2` books | `18,818` | **`69.5%`** | `93.5%` | `99.0%` | `+0.011` |
> | `3`+ books | `128,120` | ⚠ **`65.1%`** | ✅ **`96.6%`** | ✅ **`99.7%`** | `−0.015` |
>
> ⚠⚠ **The two columns move in OPPOSITE directions, and that is the interesting part.** *More books
> means **fewer exact matches** but **more near matches** — because a consensus of several books lands
> on a median that can sit off PrizePicks' half-point grid *(`§T22`: "a books' median can land between
> PrizePicks' usual half-point grid — a centre of `4.75`, say")*, while being closer on average.* ⇒
> 🔑 ***"Exact agreement" is the wrong metric for a consensus line; `within 0.5` is the right one, and
> on that measure depth helps exactly as expected.*** **A rescue tier judged on exact agreement would
> have rejected the better source.**
>
> 📌 ***This table is the evidence for the heading above it.*** *It was in `T22`'s bash output and in
> none of the twelve — `RULE 55`: the conclusion was recorded at `§T22.9` before its table existed,
> and the table is filed here rather than the conclusion being softened.*
>
> 🔑🔑 **THE CONSEQUENCE, STATED AT FULL STRENGTH**: ***any expected-value calculation that keys a
> multiplier off a rung number is wrong, and it is wrong by up to `43%` on demons*** *(`5.25` vs
> `7.5`)* ***and `27%` on goblins*** *(`2.2` vs `2.8`)*. **A tier-indexed lookup table cannot
> represent this.**
>
> ⚠ **What this does NOT overturn**: *the step-function description of the TIER TAXONOMY — which rung
> is a goblin, which a demon, where the anchor sits — is unaffected. **The taxonomy is ordinal; the
> PRICE is continuous.** Those were conflated, and `§5.0d` and `NBA_MULTIPLIERS.md` `§3` both describe
> the taxonomy correctly while implying the pricing follows it.*
>
> ### 📐 **THE ROUNDING GRID, MEASURED IN THE SAME RUN — and it is why every prediction carries a range**
> | payout band | displayed step |
> |---|---|
> | **below `3×`** | **`0.1`** |
> | **at or above `3×`** | **`0.25`** |
>
> 🔑 ***A price is never observed exactly — it is observed rounded, and the grid coarsens as the
> payout rises.*** *This is the mechanical reason `§T22.8`'s `2.086` "true value" reads as `2.1` on
> screen, and the reason a model validated "within one rounding step" is validated to different
> tolerances at different payouts.* ⚠ **`RULE 54`: every multiplier figure in these documents is a
> ROUNDED observation unless it says otherwise.**
>
> ### 🔴🔴 **AND THE SAME LINE IS PRICED DIFFERENTLY FOR DIFFERENT PLAYERS — BY UP TO `10%`**
> *`T22` pass `10`, measured on the mined set.* ***"PrizePicks prices the same line differently for
> different players, by up to `10%` — most likely off its unrounded projection."***
>
> ⇒ 🔑🔑 ***THAT IS THE ACCURACY CEILING FOR ANY RECONSTRUCTED HISTORICAL PRICE, AND IT IS A HARD
> ONE.*** *No formula keyed on `(stat, line, center)` can do better than `±10%`, because the
> remaining variation lives in a projection PrizePicks does not publish.*
>
> | consequence | |
> |---|---|
> | **for mined prices** | 🔴 **they must be stored PER PLAYER** — a price keyed on the line alone is wrong for every other player sharing that line |
> | **for modelled prices** | ⚠ **`±10%` is the FLOOR on error, not a target to beat** — a model reporting better than that on held-out players is fitting the rounding grid, not the pricing |
> | **for EV** | *with `§T22.9`'s line-not-rung finding: a rung-indexed table is wrong by up to `43%`, and even a perfect line-indexed one is still wrong by `10%`* |
>
> 📌 ***Recorded here rather than left to the build session's own file because it is a fact about how
> PrizePicks PRICES, not about the tables that store it*** — *standing constraint `6` scopes out the
> `pp_*` objects, not the pricing mechanics this document exists to hold.*
>
> ### 📋 **The `2`-pick base, same run, `prizepools` mode**
> `2`-pick **`3.0×`** · `3`-pick **`6.0×`** · `4`-pick **`10.0×`** · flex `2`-pick **`2.0× / 0.5×`**.
> ***Multiplicative, and independent of the partner*** — *goblin-alone × demon-alone predicted
> `2.167`, rounded to `2.2`, exactly the measured pair; and a `11.5` REB demon quoted `3.25×` against
> two different partners.* ⚠ **`prizepools` mode only** *(`§T22.8`)*.
| **Can it be exploited?** | **Unsolved.** Three walk-forward methods regressed to the pool average |

**Confirming the first says nothing about the second.** And the source is explicit that **both were
unsolved** — the mechanism being *measured* is not partial progress toward exploiting it.

### ⚠ THIS IS THE CENTRAL QUESTION FOR NBA
**Everything this system has built is an attempt at exactly the thing MLB could not do: identify, in
advance, which legs sit on the favourable side of that gap.** The certified ladder, the leg-level
calibration, the per-band cells, the confidence model — **all of it is selection machinery.**

**And NBA has one asset MLB's failed attempts lacked**: *"when the recipe says 75%, roughly 75% hit,
on every band, both seasons, out of sample"* — **a calibrated probability**, not a trailing rate or a
quintile rank. **Model-probability quintiles failed for MLB; whether a CALIBRATED probability succeeds
where an uncalibrated one regressed is the open empirical question**, and it is testable the moment a
live board exists.

**The honest framing**: the structural mispricing is confirmed to exist. **Whether it is harvestable
is unproven, and one strong prior says it is not.** Treat any early positive result here with lesson
#26's confidence tiering and §13's full bootstrap gate.

---

## 5. THE ECONOMICS — measured

### ⚠ 5.0 READ THESE PER CELL, NOT AS AGGREGATES
**MLB's costliest single error was pairing an aggregate hit rate with a multiplier from a different,
thinner cell** — *"producing a **phantom positive edge** that took a full Gemini adversarial pass to
catch."*
**The correct form is `Σ wᵢ(pᵢ · mᵢ)`, volume-weighted per cell — never `p̄ · m̄`.**

**The tables below are tier aggregates.** The hit rates come from one population (mostly safe,
high-volume goblin cells) and the payout factors from another (thin demon cells). **Matching them
across tiers is exactly the error above.** The directional conclusions survive, but **any EV figure
built from these must be recomputed cell by cell — tier × prop × side.**

### 5.1 Goblins are −EV at every tier
| Tier | Hit rate |
|---|---|
| T−3 | **74.1%** |
| T−2 | 68.7% |
| T−1 | 61.9% |

~~**But observed payout factors take 40–53%** → **−EV at every tier**.~~ -> Correction: the 40-53% payout cut is not what PrizePicks charges. Measured goblin factors are G1 0.756, G2 0.698, G3 0.661 (cuts of 24%, 30%, 34%; range 0.614-0.934; universe mean 0.724), and the implied-probability x factor product sits at about 0.50 for every goblin. Goblins are priced to p x m about 0.50 per leg, which cannot clear the 0.55 per-leg Power bar (all-goblin 3-pick Power -86.2%); that, not a 40-53% cut, is why they are closed as a standalone leg. (T50 deep pass, 2026-10-26, from the T50 inventory subagent's cross-check of the measured tier map)

### 5.2 Demons — only T+1 is ever worth solving
| Tier | Hit rate | Break-even factor needed |
|---|---|---|
| **T+1** | **32.9%** | **1.48×** |
| T+2 | 21.3% | 2.30× |
| T+3 | 14.8% | 3.31× |

~~**Against a ~1.75–1.9× observed ceiling** → **T+2 and T+3 can never clear it.**~~ -> Superseded: the 1.75-1.9x ceiling was an early-sample (MLB-era) figure. On the system's tier map (910,513 legs) demon prices average D1 1.44x, D2 1.71x, D3 2.43x (maximum 5.76x) and the engine cap is 18.5x on a 2-pick. Whether a deeper demon clears its break-even is decided per cell and per season (rebounds D3: price 2.20x, break-even 0.250, hit 0.307 at n=4, positive in 2025-26 and marginal in 2024-25), not by a fixed ceiling. The break-even factors 1.48x / 2.30x / 3.31x belong to the offset tiers T+1 / T+2 / T+3 only, a different taxonomy from the system tiers D1-D3. (T50 deep pass, 2026-10-26)
**→ Only demon T+1 is ever worth solving.**

### 5.4 🔑🔑 **WHERE §5.1 AND §5.2's HIT RATES CAME FROM — the empirical answer, its POPULATION, and a LIVE re-census**
*Recorded 2026-09-22 (T13 pass 2, §T13.3c). **§5.1 and §5.2 carried the hit rates with no leg counts,
no offsets and no source. T13 is where they were produced** — by the grader, over two seasons.
Live re-census of `nba_market.board_tiers` pinned **2026-09-22T08:02Z**.*

**THE TYPE-LEVEL ANSWER, as stated**: **standard 359,147 legs @ 48.8% · goblin 274,632 @ 66.3% ·
demon 402,127 @ 24.4%.**
⚠⚠ **AND THE PROSE'S OWN POPULATION DOES NOT MATCH ITS TABLE** *(rule 16)*: the sentence says
***"across 856,000 PrizePicks legs"*** **while its three rows sum to 1,035,906.** **The per-tier
table two segments later says *"866,000 graded legs"* and sums to 865,916** — *which is internally
consistent.* 🔑 ***So `856,000` is the one figure in the arc with no derivation behind it; use
865,916, which re-derives.***

#### THE PER-TIER TABLE — as measured then, and as the table stands NOW
| kind · tier | T13 legs | **LIVE legs** | T13 avg offset | **LIVE avg offset** | hit rate | prob ratio vs 48.8% | payout condition |
|---|---|---|---|---|---|---|---|
| **goblin −3** | 31,580 | **62,183** | −4.30 | **−4.39** | **74.1%** | **×1.52** | *can give up ≤34%* |
| **goblin −2** | 100,705 | **165,722** | −2.83 | **−2.98** | **68.7%** | **×1.41** | *can give up ≤29%* |
| **goblin −1** | 254,159 | **358,098** | −1.53 | **−1.70** | **61.9%** | **×1.27** | *can give up ≤21%* |
| **demon +1** | 255,203 | **400,972** | +1.97 | **+2.24** | **32.9%** | **×0.67** | **needs ≥1.48×** |
| **demon +2** | 149,488 | **300,497** | +3.75 | **+3.86** | **21.3%** | **×0.44** | **needs ≥2.30×** |
| **demon +3** | 74,781 | **159,235** | +5.07 | **+5.21** | **14.8%** | **×0.30** | **needs ≥3.31×** |

✅ **THE LIVE CENSUS CLOSES EXACTLY**: **standard (tier 0) 745,310 · goblins −1…−6 587,500 · demons
+1…+8 866,544 = 2,199,354**, ***and the standard figure agrees to the row with the independent price
census*** *(`NBA_MULTIPLIERS.md` §0.9d.1: 372,741 + 372,569 = 745,310)*. **Two unrelated queries,
one number.**
🔑 **AND THE LIVE TABLE IS DEEPER THAN THE TRANSCRIPT'S**: **goblin −4 `1,308` · −5 `173` · −6 `16`**
and **demon +4 `5,195` · +5 `549` · +6 `88` · +7 `7` · +8 `1`** — **tiers −6 … +8, not −3 … +3.**
⚠ **The deep tiers are thin and were never analysed**: *7,337 legs, 0.33% of the table, and §5.1/§5.2
say nothing about them.* **A NAMED, DATED remainder.**
📌 **Every live count is ~1.6–2× the transcript's and EVERY offset has moved OUTWARD** *(both
directions, consistently)* — **a dated STATE** *(O9)*; **the table has been rebuilt and extended
since, and the hit rates in §5.1/§5.2 belong to the SMALLER population.** ⚠⚠ **So §5.1/§5.2's rates
are NOT re-derived here and must not be read as current.**

#### 🔴🔴 THE TABLE WAS WRONG FIRST — and the cause is the corpus's THIRD coarse-join artifact
> *"Those numbers are wrong, and I can see why: **I dropped the market from the join, so a player's
> POINTS line of 8.5 was matching his REBOUNDS line of 8.5.** That's the same artifact class I
> flagged earlier — and **it's exactly why the goblin tiers all collapsed to ~50%**."*

🔑🔑 ***A join that omits `market_key` silently averages unrelated props, and its signature is
REGRESSION TO THE POOL MEAN — every tier reading ~50%.*** **Recorded as a detection rule**: a tier
table that is *flat* is not evidence of flat pricing; **it is the expected output of a
market-blind join.** ⚠ **This is the THIRD instance of the class in one transcript** — *the false
2.9%-vs-56% arbitrage signal, the duplicated ladder rungs, and this* — **and the transcript's own
count says *"I've now hit that artifact twice"*, so it under-counts itself.** ✅ **The corrected
join is *"monotonic in both directions, which is the SIGNATURE OF A CORRECT JOIN."***

#### ✅ THE ANCHOR DERIVATION VALIDATED ON REAL DATA — both cases, and the switch-point case is a real test
> **Explicit anchor** *(a regular line is present)*: **goblins step −2.03, −3.11, −4.42, −5.45;
> demons step +2.77, +4.65, +6.00, +7.38, +9.64** — *"clean monotonic ladders up to 5 tiers deep."*
> **Switch point** *(no regular line)*: **offsets are SYMMETRIC around the implied anchor — goblin T1
> at −0.95, demon T1 at +0.95** — *"exactly what you'd expect when the anchor sits midway between the
> innermost goblin and demon. **That's a good validation that the invisible-anchor derivation is
> correct.**"*

🔑 ***The symmetry is the test, and §2.2's invisible anchor passes it.*** **This is the first
empirical validation of the switch-point method in this corpus** — §2.2 states the rule and gives the
`10.5 / 11.5 / 12.5 → 12` example; **it had no measurement behind it until now.**

#### ✅ 5.4a **AND THE LIVE COMPARISON CLOSES §T12.7c's UNEXPLAINED RESIDUE**
*Pinned 2026-09-22T08:04:40Z.* **§T12.7c recorded v2's `unknown / none / unknown` — 43,370 rows,
2.0% — as a residue *"recorded and NOT explained"* (rule 6).** **The two tables, side by side, say
what it IS:**

| `anchor_type` | **`board_tiers` (v1)** | **`board_tiers_v2`** |
|---|---|---|
| `explicit` | **1,780,149** | **1,780,149** *(identical)* |
| `switch_point` | **419,205** | **375,835** |
| `none` | — | **43,370** |
| **total** | **2,199,354** | **2,199,354** |

🆕 *(additional sweep `8`, pass 490, `§P490` — `T18` `2026-09-20 03:42Z`, AS STATED)* The cells behind v1's two rows, as the reply tabulated them by `anchor_type`, kind and side: `explicit` demon Over **`586,037`** (tiers `+1` to `+7`), `explicit` goblin Over **`448,802`** (`1` to `6` rungs below), `explicit` standard Over/Under **`745,310`** (`0`) — `586,037 + 448,802 + 745,310 = 1,780,149`, the `explicit` row above; `switch_point` demon Over **`280,507`** (`+1` to `+8`) and `switch_point` goblin Over **`138,698`** (`1` to `5`) — `280,507 + 138,698 = 419,205`, the `switch_point` row above. The reply's own caveat in the same message: `board_tiers` classifies a **two-way** structure (goblin below the anchor, demon above, Over only), and *"under the new taxonomy a demon-Less sits below the anchor, which v1 would label a goblin"* (`04:00Z`).

🔑🔑 ***`explicit` is identical to the row in both. The ENTIRE difference lies inside the
non-explicit population: v1 calls all 419,205 of them `switch_point`; v2 anchors 375,835 and
declines the rest.*** **`419,205 − 375,835 = 43,370` EXACTLY.** ✅ **So the residue is not a new or
lost population — it is the subset of v1's switch-point rows that v2's stricter derivation refuses
to anchor**, *and v1 was anchoring them by assertion rather than by evidence.*
⚠ **WHY it refuses is NOT established here** *(rule 6)*. 📌 **A HYPOTHESIS, named as one**: T13
describes exactly this failure on the **Underdog** mapping — *"those rows are ladders with **exactly
ONE alternate rung and no standard line in that snapshot**, so my midpoint fallback put the anchor on
top of the only rung"* — **but that passage is about Underdog, not PrizePicks, so it is an ANALOGY,
not the cause.** **Testable in one query; not run.**

### 5.3 Why the tails matter anyway
> *"we're not modelling the mean, **we're modelling the right tail (80th–99th percentile)**. A Gaussian
> will be systematically wrong there… likely **the #1 area where a sharp baseline earns the most**,
> because **naive book models mis-price tails**."*

**And the ladder placement, from three converging sources**: books ladder a 24.5 player **~19.5 to
~31.5 ≈ ±1 SD**; Unabated prices off the full outcome distribution; **Goblin ≈ 25th–35th percentile,
Standard ≈ median, Demon ≈ 70th–80th, useful range ≈ 15th–85th.**

---

## 6. INGESTION — where the data comes from

### 6.1 The NBA producer
**`nba/scrape_prizepicks_nba_board.py`** — **completely separate from `main.py` (MLB)**.
- **`league_id=7`** ~~(COMPASS fact 176)~~ — MLB is `league_id=2`, hardcoded in `main.py`
  > 🔴 **CITATION CORRECTED 2026-09-22 (§T20.43): THERE IS NO COMPASS FACT 176.** *`NBA_COMPASS.md`
  > is the only compass file in the repo; it numbers **1–107** (106 items, one gap — see below) and
  > the string `176` appears in it **zero** times.* ⚠ **The citation was inherited from
  > `.github/workflows/nba-p3-afternoon-light.yml:103** (*"COMPASS fact 176 says 'PrizePicks stays
  > the MLB producer (repo root) with league_id=7 for NBA'"*), **repeated here and in
  > `NBA_OPEN_ITEMS.md` without being checked.** ✅ **The technical claim — `league_id=7` for NBA,
  > `2` for MLB, hardcoded in `main.py` — is CORRECT and independently verified in the workflow's own
  > comment block; only the ATTRIBUTION is false.**
- Own output: **`boards/prizepicks_nba_current.json`**
- Own env namespace: **`PP_NBA_*`**
- **Multiple candidate URLs** — `partner-api` and `api`; **the `partner-api` host answered while `api`
  was blocked**, which is why candidates are mandatory
- `curl_cffi` chrome124, proxy preflight, retry with captcha cooldown, atomic write
- **Candidate selection by FUTURE-PICKABLE ROWS**, not by payload size

**Live-tested (off-season): 200 OK, 192 projections, 192 future-pickable,
`{demon: 104, standard: 36, goblin: 52}`.**

📌 **UPDATE `2026-09-28` — SUPERSEDED, `RULE 40`.** *This section describes `scrape_prizepicks_nba_board.py`
as the live NBA producer; as of `2026-09-24` it is not. `main.py` at the repo root (the MLB producer)
was made opt-in-NBA via three env vars (`PRIZEPICKS_LEAGUE_ID=7`, `PRIZEPICKS_SPORT=nba`,
`PRIZEPICKS_OUT_DIR=boards`), purely additive, and `nba-p3-afternoon-light.yml` now runs `main.py` with
those set as the first board scrape — live-verified this pass. The `league_id=7`/`api`-vs-`partner-api`
facts above remain technically accurate (they describe the underlying PrizePicks API, not the wrapper
script), only the "which script runs it" claim has moved on. Full record: `NBA_WORKERS.md` `§T27.3`
(CLOSED). Kept as history per `RULE 40`, not deleted.*

### 6.2 The raw feed's fields
A demon row carries **`odds_type`**, **`adjusted_odds` as a BOOLEAN**, and **`line_score`**.
**It does NOT carry a multiplier** — see `NBA_MULTIPLIERS.md`.

### 6.3 Per-app ladder structure
| App | Structure |
|---|---|
| **PrizePicks** | rungs in the raw feed, labelled standard / goblin / demon |
| **Underdog** | `alternate_projections` per line, **with both sides' multipliers** |
| **Sleeper** | *"no alternate lines"* per the live session — **⚠ but T7's verified inventory found milestone lines 20+/25+/30+, "Sleeper's equivalent of Goblin/Demon ladders". Unresolved.** → 🆕 *resolved `2026-09-27` (`T31`): the ladder is `lines/available_alt`, over-only rungs, captured and archived as `_alternate` — `NBA_MASTER_SUMMARY.md` `§T31.1` (pass 104)* |
| **Fliff** | alternate lines as separate proposals per market group |
| **Betr** | tiers REGULAR / MINI_BOOSTED / BOOSTED / SUPER_BOOSTED / BOOSTED_4 / EDGE_1..4 |

---

## 6. THE RESEARCH STANDARD APPLIED TO THIS LAYER

**Six of the 27 lessons bear directly on goblin/demon work.** Full list in
`NBA_FINAL_SCORING_CALIBRATION.md` §14.

**⚠ CORRECTED 2026-09-20 (T1 pass 30). This line read "Five of the 26 lessons."** Two things were
wrong: **the standard has 27 lessons, not 26** (**VERIFIED** — `grep -c "^### [0-9]\+\."` on
`NBA_LESSONS_LEARNED_FROM_MLB.md` → 27, and T1's own pasted copy carries `### 27.`), and **the
twenty-seventh is a sixth lesson bearing directly on this layer**:

**#27 — Flex-style partial-credit mechanics differ structurally between platforms: flat fixed partial
payouts on one, proportional-to-the-full-hit-multiplier on another. Verify per platform.**

**Why it lands on goblin/demon specifically.** Goblin and demon legs are the ones whose headline
multipliers move *most* — the whole layer is a ladder of multipliers rising away from the anchor
(*"~1.4× growth factor per tier step"*, §5.0d). **On a platform whose partial tiers are proportional
to the full-hit multiplier, a demon-heavy Flex slip's partial payouts move with the ladder; on a
flat-tier platform they do not.** So **the same demon ladder produces different Flex EV on the two
platform types**, and **the goblin/demon economics in §5 — computed against observed payout factors —
are Power-shaped reasoning that does not carry to Flex unless the tier shape is known.**
**NOT RECORDED as verified for any platform except PrizePicks.** See `NBA_MULTIPLIERS.md` §0.2h.

| Lesson | Applied here |
|---|---|
| **#2 — never apply a tier-level multiplier to a heterogeneous population** | §5.0 — the economics tables are tier aggregates; **EV must be recomputed per cell** |
| **#11 — a plausible causal story is not evidence** | *"goblins are safer so they must be +EV"* is a story; **measured, they are −EV at every tier** |
| **#13 — directional but not proportional** | §5.0b — the structural mispricing, **and MLB never harvested it** |
| **#24 — durable mechanics vs drifting numbers** | §5.0c — flat vs rarity-scaled pricing held for years; **the ratios decayed** |
| **#26 — confidence-tier every finding** | the ±6 ladder is **certified**; the tails beyond it are **not** |

### ⚠ #19 applied to this document
**Language strength must not exceed evidence strength.** So, precisely:
- The **four-way rule** is **verified** — validated on 42,600 ladders, and `board_tiers_ud` implements
  it.
- The **invisible anchor** is **verified** — 419,205 legs carry one.
- The **hit rates** are **measured** on our own graded outcomes.
- The **payout factors** are **observed, not read from a slip** — and lesson #16 records that
  *"multiple MLB findings survived every backtest check and were still overturned the moment a real
  placed slip's actual multiplier was checked against the assumed one."*
- Therefore the **EV conclusions are directional, not confirmed.**
- `board_tiers_v2` is ~~**built but unverified**~~ → 🔴 **VERIFIED 2026-09-22 (T12 pass 6, §T12.7c) — and the verification's real result is that HALF THE RULE HAS NOTHING TO CLASSIFY YET.**
  > **Two tests, per rule 31** *(a design is what the code does, read by mechanism)*:
  > **1 · THE CODE.** `build_board_tiers_v2.py` **does implement what the twelve say it does**: the
  > four-way rule *(below the anchor More = goblin / Less = demon; above it More = demon / Less =
  > goblin)*, **both anchor cases** *(`explicit` and `switch_point`)*, and the **direction-aware tier
  > sign** — *"v1 signed by kind, which breaks under the four-way rule because a demon-Less is BELOW
  > the anchor; **v2 signs by POSITION**"*. 📌 **Env `BT2_APPS` (default `prizepicks`) and
  > `BT2_REBUILD`, and the column `position_vs_anchor`, are in 0 of the twelve.**
  > **2 · THE DATA.** `nba_market.board_tiers_v2`, **pinned 2026-09-22T07:10:30Z**, `GROUP BY kind,
  > side, anchor_type, position_vs_anchor` — **ten combinations, summing to 2,199,354 exactly**:
  >
  > | kind | side | anchor_type | position | n |
  > |---|---|---|---|---|
  > | demon | Over | explicit | above | **586,129** |
  > | goblin | Over | explicit | below | **448,495** |
  > | standard | Over | explicit | at | **371,634** |
  > | standard | **Under** | explicit | at | **371,416** |
  > | demon | Over | switch_point | above | **240,668** |
  > | goblin | Over | switch_point | below | **135,166** |
  > | ⚠ unknown | Over | none | unknown | **43,370** *(2.0%)* |
  > | ⚠ standard | Over | explicit | **below** | **1,322** |
  > | ⚠ standard | Under | explicit | **below** | **1,153** |
  > | ⚠ standard | Over | **switch_point** | at | **1** |
  >
  > ✅ **Both anchor cases are exercised** *(explicit 1,780,149 · switch_point 375,835)* **and the
  > position vocabulary is populated.**
  > 🔑🔑 **THE RESULT THAT MATTERS, AND IT IS A NEGATIVE ONE**: ***every goblin and every demon row in
  > all 2.2M is `side = 'Over'`. There is not ONE `Under` alternate.*** **`Under` appears only on
  > `standard`.** **The code predicts exactly this** — *"through 2025-08 demons and goblins WERE
  > more-only… our 2024-25 data has literally zero Under rows on alternates; from 2026-08 PrizePicks
  > enabled Less (MLB and WNBA first, **NBA expected this season**)"*. ***So the four-way machinery is
  > in place and the half of it that v1 got wrong has had NOTHING to classify: it cannot be validated
  > against real Less data until the NBA season produces some.*** **"Unverified" was right about the
  > half that matters, and wrong about the half that could be checked.**
  > ⚠ **Three residues, recorded and NOT explained** *(rule 6)*: **43,370 rows at
  > `unknown`/`none`/`unknown`**; **2,475 `standard` rows sitting BELOW their own anchor**; and **ONE
  > row at `standard`/`switch_point`/`at`, which a switch-point anchor should make impossible by
  > definition.** *(The residue figures exist in 1–2 of thirty and **0 of the twelve**.)*
  > ⚠ **Rule 30 again**: **`reltuples` said 2,199,151 — 203 low.** *The exact total came free with the
  > `GROUP BY`.*

---

## 7. LADDER DEPTH — measured against the real board

> ### ⚠⚠ THE VOLUME-VS-DEPTH TRADEOFF — the handoff's named NBA-transferable pattern, never tested
> *Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part D, "a concrete, well-documented real
> NBA-transferable structural pattern worth testing for directly." **Recorded 2026-09-20 (T1 pass 56)
> — the pattern appeared in none of the twelve documents. Volumes below are VERIFIED by live SQL.***
>
> > *"MLB found that **a prop's real hit rate climbs meaningfully and repeatably as tier/ladder-depth
> > increases** (the farther a line sits from its real anchor, the safer the 'easy-direction' bet
> > becomes) — and **the genuinely usable sweet spot was NOT the theoretical deepest tier** (almost
> > always a thin, one-off, unreliable sample) **but THE DEEPEST TIER THAT STILL CARRIES REAL VOLUME**
> > (MLB's rule of thumb: **n ≥ 10–20 real observations**). If NBA's platforms offer an equivalent
> > tiered-line ladder… **test for this same volume-vs-depth tradeoff directly rather than assuming
> > either extreme.**"*
>
> **The volume half has never been read. It is one query, and the data is already there** —
> `nba_market.board_tiers_v2`, **~2.19M legs**:
>
> | tier | legs | distinct player-props | | tier | legs | distinct player-props |
> |---|---|---|---|---|---|---|
> | **−7** | 1 | 1 | | **0** | **788,680** | 5,447 |
> | **−6** | 21 | 14 | | **+1** | 109,544 | 3,544 |
> | **−5** | 207 | 87 | | **+2** | **351,329** | 3,811 |
> | **−4** | 1,600 | 547 | | **+3** | **244,731** | 3,501 |
> | **−3** | **62,542** | 2,052 | | **+4** | **117,010** | **2,758** |
> | **−2** | **165,711** | 3,103 | | **+5** | 3,794 | 902 |
> | **−1** | **353,579** | 3,819 | | **+6** | 515 | 236 |
> | | | | | **+7 / +8** | 85 / 5 | 56 / 5 |
>
> **Applying MLB's rule to these volumes:**
> - **Goblin side — the deepest tier with real volume is T−3** (62,542 legs, 2,052 player-props).
>   **T−4 falls to 1,600 — a 39× collapse**; T−5 is 207, T−6 is 21, T−7 is 1.
>   **§5's goblin economics already stop at T−3** — so the documented range matches the
>   volume-supported range, **but that was never the stated reason.** It is now.
> - **⚠⚠ Demon side — the deepest tier with real volume is T+4, and §5's economics stop at T+3.**
>   **T+4 carries 117,010 legs across 2,758 distinct player-props** — far above any thin-sample
>   threshold — and **is not priced anywhere in this document.** **T+5 is where the collapse
>   happens** (3,794, a 31× fall).
>   **This is exactly the sweet spot the lesson points at: not the theoretical deepest tier, but the
>   deepest one with real volume.** **NOT RECORDED as tested.**
> - **⚠ And the ladder is asymmetric in a way nothing records**: the goblin side decays monotonically
>   (−1 → −2 → −3 → −4 falling steadily), while the demon side does not — **T+1 (109,544) carries
>   LESS volume than T+2 (351,329) and T+3 (244,731).** **Why T+1 is under-offered relative to its
>   neighbours is NOT ESTABLISHED**, and it matters because **§5 records T+1 as "the only demon tier
>   ever worth solving."**
>
> **What this does not claim**: nothing here measures hit rate — the volumes come from
> `board_tiers_v2`, the rates from `board_outcomes`. **The pairing is the test the lesson asks for,
> and it has not been run.**

> ### ⚠ THE HANDOFF ASKED FOR THIS **PER PROP**, AND IT IS STILL POOLED
> *Recorded 2026-09-20 (T1 pass 49). Source: `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1.*
>
> > *"Confirm these exist identically for NBA on each platform… **but verify TIER-COUNT and
> > TIER-SPACING CONVENTIONS PER PROP before assuming they match MLB's exactly.**"*
>
> **§10 records that the prediction was right** — the taxonomy exists for NBA. **The per-prop
> verification the same sentence asks for is NOT RECORDED as done.** The measurement below —
> *"books ladder to **~85–90% of the anchor**"*, from **60k+ board legs** — **is an aggregate across
> props**, and **§5.0's own standing rule is "read these per cell, not as aggregates."**
> **The instruction and this layer's own rule agree with each other; the measurement is still
> pooled.**
> ⚠ **Compounds with lesson #27** (§6): **tier spacing per prop and partial-credit structure per
> platform are both unverified, and both are first-order inputs to Flex EV.**

From 2026-01-15, **60k+ board legs joined to our anchors**. **Books ladder to ~85–90% of the anchor.**

| Prop | Anchor | p95 distance | Our ±10 | Fixed to |
|---|---|---|---|---|
| points | 15.9 | **13** | short | **14** |
| pra | ~18 | **16** | short | **16** |
| pts_reb | ~15 | 15 | short | 15 |
| pts_ast | ~14 | 14 | short | 14 |
| rebounds | 5.7 | 5 | wasteful | 6 |
| assists | 4.3 | 4 | wasteful | 5 |
| steals | 1.1 | 1 | **very** wasteful | 2 |
| blocks | 0.8 | 1 | **very** wasteful | 2 |

**`LADDER_DEPTH` added to `classification_ladder_v12.py`**, with `ladder_depth(prop)`.
**`BT_LADDER_STEPS` still overrides.** All four `LADDER_STEPS` usage sites patched; `_depth` scoped at
prop level.
**⚠ The scoped expansion (points, pra, pts_reb, pts_ast, fantasy_score deeper; steals/blocks/turnovers
shallower) has not completed.**

**Consistency check**: the design figure was *"anchor ±5–6 steps"*, i.e. 19.5→31.5 around 24.5 =
**±6 line-units = 12 rungs**, against a measured **p95 of 13 rungs**. **The design and the measurement
agree to within one rung.**

---

## 8. TABLES

### `nba_market.board_tiers` — 2.2M legs *(v1 — SUPERSEDED)*
`game_date`, `snapshot_label`, `player`, `base_market`, `side`, `line`, **`kind`**, `anchor_line`,
**`anchor_type`** (`explicit` | `switch_point`), **`tier`**, `nm`.
**`kind` derived from PRICE; Over-only. Do not trust the label on a Less row.**

### `nba_market.board_tiers_ud` *(Underdog)*
**Already implements the four-way rule**, and uses the **fair-rung** anchor. **This is the reference
implementation.**

### `nba_market.board_tiers_v2` *(PrizePicks, four-way)*
Built by `nba/build_board_tiers_v2.py`. **Position-signed tiers.** **Build queued; result not
confirmed.**

---

## 10. WHAT T1 PREDICTED ABOUT GOBLIN/DEMON — and it was right

From the handoff's transfer table *(T1)*:
> *"**Goblin/Demon/Standard variant tiers** | **Confirm these exist identically for NBA on each
> platform (PrizePicks in particular) — very likely yes, since it's a PLATFORM-LEVEL MECHANIC, not
> sport-specific**"*

**Correct.** The tiers exist identically for NBA; the live NBA board returns
`{demon: 104, standard: 36, goblin: 52}`.

**⚠ AND T4 ADDED THE CAUTION THAT MATTERS:**
> *"Goblin/Demon/Standard-style tier variants: assumed to exist per-platform for NBA (a platform-level
> mechanic, not sport-specific) **but TIER COUNT AND TIER SPACING must be verified PER PROP directly
> against each platform's live board once one exists — NOT assumed identical to MLB's**."*

**So two things were separated correctly:**
| Property | Transfers from MLB? |
|---|---|
| **The mechanism** (goblin = easier, demon = harder, anchored) | ✅ yes — platform-level |
| **Tier COUNT and tier SPACING, per prop** | ❌ **no — must be measured on the NBA board** |

**And that caution was vindicated twice.**
1. **Ladder depth measured on a real NBA slate came out per-prop and very uneven** — points p95 = 13
   rungs, steals and blocks = 1. **Assuming one spacing would have been wrong in both directions**
   (see §7).
2. **The mechanism itself then changed** — PrizePicks enabled Less in 2026-08, so even the
   platform-level half needs re-verification over time, not just across sports.

**The general rule**: *"MLB's specific numbers do not transfer; only the platform-level mechanics
transfer as informed priors, not answers"* — **and the mechanics have a shelf life.**

---

## 11. THE MLB REFERENCE DOCUMENT

`GOBLIN_DEMON_MECHANISM_EXPLAINED.md` exists on the MLB side and was one of the **eleven documents read
and integrated** into the NBA transfer package (T1). **It is the prior for the mechanism**; the NBA
numbers are our own.

---

## 12b. ⚠ THIS TAXONOMY CREATES THE SUBGROUPS BLUEPRINT §7f SAYS A CORRECTION MUST BE CHECKED AGAINST
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` §7f. Recorded 2026-09-20 (T1 pass 29).*

§7f's rule: *"always check whether a proposed correction is genuinely appropriate for **every
meaningfully distinct subgroup it will be applied to** (e.g. **both sides of a market, every relevant
tier**), not just the pooled average"* — after a real MLB fit passed honest out-of-sample validation
while being **dominated by one side and silently misapplied to the other**.

**"Both sides of a market, every relevant tier" is a literal description of this layer.** The four-way
rule (§1) means a single player × prop carries up to four distinct populations —
**More-above-anchor (demon), More-below (goblin), Less-below (demon), Less-above (goblin)** — and the
ladder adds rungs on top of that. **Per §5.0, these must be read per cell, never as aggregates**, and
that is already recorded as **MLB's costliest single error**.

**What §7f adds to what §5.0 already says:** §5.0 warns against pairing an aggregate *hit rate* with a
cell-specific *multiplier*. **§7f warns that a statistical *fit* commits the same error invisibly** —
and that **the validation metric will not tell you.** A calibration curve fit across all rungs can
beat its baseline overall and be wrong at **T−3 and T+3 specifically**, which are exactly the cells
this document says decide the layer's EV:
- **goblins hit 74.1 / 68.7 / 61.9% at T−3 / −2 / −1** but ~~observed factors pay 40–53% → **−EV at
  every tier**~~ (corrected in `§5.1` above and `§T50.2-Z1`: measured goblin factors are 0.756 / 0.698 / 0.661, p x m about 0.50)
- **demons hit 32.9 / 21.3 / 14.8% at T+1 / +2 / +3**, needing **1.48 / 2.30 / 3.31×** against a
  ~~**~1.75–1.9× ceiling** → **only demon T1 is ever worth solving**~~ (superseded in `§5.2` above and `§T50.2-Z1`: the ceiling was an early-sample figure; D1 1.44x, D2 1.71x, D3 2.43x on the system tier map) (T50 deep pass, 2026-10-26)

**A pooled calibration check cannot distinguish "the ladder is calibrated" from "the ladder is
calibrated in the middle and wrong in the tails"** — and **T8 nominated the tails as *"the #1 area
where a sharp baseline earns the most."*** The certification's *"0 misses of 37"* is **an aggregate**.

**Status**: no per-kind × per-side × per-rung calibration check is **recorded as built**. Related and
already open: §9's tail-certification item (*"the single most important thing to certify once a live
board exists"*). Primary record of §7f: `NBA_BASELINE_CALIBRATION.md` §5.6.

---

## 13. ⚠ THE GRADER DEDUP KEY — the highest-risk item for this layer
*Source: T1, blueprint §4c. Recorded 2026-09-20.*

**A documented historical bug whose trigger column is exactly the one this document is about:**
> *"**A deduplication key that DIDN'T INCLUDE EVERY VARIANT-DISTINGUISHING COLUMN — in MLB's case, THE
> GOBLIN/DEMON TAGS** — caused **two genuinely different real market variants sharing the same
> underlying player/prop/line to SILENTLY COLLAPSE into a SINGLE GRADED ROW.** **The other variant's
> outcome was NEVER CREATED AT ALL, not even as a placeholder, WITH NO ERROR THROWN.**"*

### Why the four-way taxonomy makes this sharper for NBA than it was for MLB
**Under the two-way (More-only) world this bug required two *rungs* to collide.** Under the four-way
rule, **a goblin and a demon sit at the SAME rung**:

| Line vs anchor | More | Less |
|---|---|---|
| **Below** | **goblin** | **demon** |
| **Above** | **demon** | **goblin** |

**So at any single `(player, prop, line)` below the anchor there are now two legs with different
variant labels** — and they differ only by `side` **and** by the variant tag.

**Three conditions that would trigger the collapse:**
1. The grader's dedup/unique key omits the variant tag, **and**
2. `side` alone is treated as sufficient to distinguish rows, **and**
3. The variant label itself is wrong — **which it currently is**, since `board_tiers` v1 derives
   `kind` from **price** and is **Over-only**.

**Condition 3 is already true.** Conditions 1 and 2 are unverified.

### What is known about `board_outcomes`
Keyed on **prop, side and line**; `leg_result` ∈ `over_win` / `under_win` / `push` / `dnp` /
`unmatched_player` / `unmatched_not_in_season`.
**Whether it carries a variant dimension, and whether `ot_rule` is in its key, is unverified.**
*(`nba_score.baseline_ladder` does carry `ot_rule` in its PK — but that is a different table, and
`period`/`ot_rule` are exactly the other variant-distinguishing columns this rule covers.)*

**The source names the family explicitly**: *"this is the same **grouping-key** failure"* — Part C's
dominant bug class, appearing in the grader.

**Recorded in `NBA_OPEN_ITEMS.md`.**

---

## 12. OPEN ITEMS SPECIFIC TO THIS LAYER

**⚠ THE OWNER'S STANDING DIRECTIVE ON SEQUENCING (T9, v21):**
> *"**Goblins and demons should NOT be handled now — it is BOARD DEPENDENT** and will only have this
> information later."*
> *"Not part of this phase (by your decision): **Goblins/Demons (board-dependent)**, Tier C props
> (first basket, high scorer), and the live enrichment layer."*

**And the explicit consequence, stated in T9's own gap list:**
> *"**Goblin/Demon/milestone tails BEYOND the ±6 ladder rungs — NOT separately certified.**"*

**So the certified ±6 ladder does NOT extend to the tails the goblin/demon economics depend on.**
The rungs are built (`LADDER_DEPTH` reaches **14–16** for the deep props — *corrected from "13–16"
2026-09-21 by §T9.39b: **13 is the p95 measurement, not a table value**; the configured deep props are
`points` 14 · `pts_ast` 14 · `pts_reb` 15 · `pra` 16 · `fantasy_score` 16*) but **the leg-level
certification standard — band × direction × rung, confidence bands hitting their rate — was only met
within ±6.** **This is the single most important thing to certify once a live board exists**, because
T8 nominated the tails as *"the #1 area where a sharp baseline earns the most."*

## 9. OPEN ITEMS SPECIFIC TO THIS LAYER — and why v2 is a CORRECTNESS issue

### ⚠⚠ LANE IS THE DOMINANT DRIVER OF EV — so a wrong lane label is not cosmetic
**Rule B0a of the foundational selection methodology** (`NBA_FINAL_SCORING_CALIBRATION.md` §18):
> *"**Class and lane are independent, and LANE IS USUALLY THE DOMINANT DRIVER OF REAL EV, MORE THAN
> CLASS.**"*
> *"a single real, exact example — **the IDENTICAL leg, IDENTICAL ~85% hit rate** — pricing at
> **roughly +1300% in one lane and roughly −13% in another** — **a swing of over 1,300 percentage
> points from LANE ALONE.**"*

**`nba_market.board_tiers` v1 derives `kind` from PRICE and is Over-only.** Since PrizePicks enabled
Less in 2026-08, **a demon-Less sits below the anchor and v1 labels it a goblin** (§4).

**So the 2.2M-leg table carries a wrong label on the axis that drives EV most**, for an entire side of
the board. **`board_tiers_v2` is therefore a selection-correctness fix, not a taxonomy tidy-up** — and
it remains **built but unverified**.

**The order this implies:**
1. **Verify `board_tiers_v2`** — it corrects the dominant EV axis
2. **Certify the tails beyond ±6** — where the lane effect is largest
3. **Then** build pools, each stating **both class and lane** per B0a

### The rest

1. **`board_tiers_v2` is unverified** — the build was running at session end.
2. **`board_tiers` v1 is still the 2.2M-leg table** anything downstream would read.
3. **Sleeper milestone lines** — T7 says they exist, the live session says they don't. **Unpriced board
   surface if T7 is right.**
4. **Goblin/demon certification was deliberately deferred** by the owner: *"Goblins and demons should
   NOT be handled now — **it is board dependent** and will only have this information later."*
   The ±6 ladder was certified; **the tails beyond it were never separately certified.**
5. ~~**Per-leg multipliers are unavailable** — see `NBA_MULTIPLIERS.md`. Without them the −EV/+EV
   conclusions rest on *observed* payout factors, not per-leg truth.~~
   > 🟢🟢 **SUPERSEDED `2026-09-20`, recorded 2026-09-23 (`§T22.1`/`§T22.2`).** *Correct when
   > written; kept whole.* **Per-leg multipliers ARE obtainable — `POST /game_types` returns a quote
   > for a specific combination** *(`NBA_MULTIPLIERS.md` `§0.9-T22`)*, **and the per-leg factor is
   > recoverable because the pricing is multiplicative and partner-independent with a known
   > compression above `9.1×`** *(`§0.10-T22`)*. ⇒ ***The −EV/+EV conclusions no longer have to rest
   > on observed payout factors alone.*** ⚠ **What still holds**: it QUOTES rather than publishes, so
   > a complete table must be assembled by enumeration.

---

# 0h-T22. 🔑🔑🔑 **THE FLEX CONSOLATION TIER — TWO BANDS SOLVED, THE THIRD OPEN, AND A FAILED HYPOTHESIS WORTH KEEPING** *(T22 pass 3, §T22.3, 2026-09-23)*

*From `T22` SEG `302` (`2026-09-21`). **All figures AS STATED IN `T22`** — measured from live
`/game_types` quotes against the owner's session, **not re-probed by this sweep.** All five blocks
below score `0` in the working tree and `0` in the baseline.*

## 1. ✅ **THE TWO BANDS THAT ARE SOLVED — 2-pick Power**

| full payout | consolation | observed |
|---|---|---|
| **under `2.5×`** | **`0.25`** | **`37` of `38`** |
| **`2.5×` – `5×`** | **`0.5`** | ✅ **`69` of `69`** |
| 🔴 **above `5×`** | **mixed — `0.5` / `0.75` / `1.0` / `1.25`** | 🔴 ***rule not yet known*** — ✅ **ANSWERED LATER IN THE SAME TRANSCRIPT, see the box below** |

> ## ✅✅ **RESOLVED — BY RUN 2, LATER IN `T22` ITSELF** *(SEG `357`; recorded `§T22.6`, 2026-09-23)*
> **The table above is run 1. Run 2 ran `160` stratified `alt×alt` pairs — exactly the experiment
> §4 below says is needed — and the rule is RISK, not payout:**
>
> | candidate driver | how well it sorts the tiers |
> |---|---|
> | `p(both hit)` · `p(both miss)` · the Power payout | **`~75–77%` each — *one underlying quantity*** |
> | 🔴 `p(exactly one)` *(the failed hypothesis)* | 🔴 **`15.6%` — excluded** |
>
> **And the ladder is longer than run 1 saw**: consolation steps by `0.25` across
> **`0.25 · 0.5 · 0.75 · 1.0 · 1.25 · 1.5`.** ⚠ 🔴 **`NOT RECORDED`: what the single risk quantity is
> in CLOSED FORM** — three proxies sort it equally well and the transcript does not name the
> underlying variable. ▶ **Full entry, with the house-edge measurement that came with it:
> `NBA_MULTIPLIERS.md` `§0.12-T22`.**
>
> 📌 ***Recorded as run 1 stood, then resolved, with both readings kept*** — *the supersession rule
> applied WITHIN a single transcript, which is a case `T21` SEG 1303's formulation ("document Tn's
> version as it stood… record the supersession with both dates") did not anticipate but plainly
> covers.*

## 2. 🔑 **THE GIVEBACK — the consolation is PAID FOR out of the full payout**

| consolation | `flex_full ÷ power` |
|---|---|
| `0.25` | **`0.83`** |
| `0.5` | **`0.69`** |
| `0.75` | **`0.57`** |
| `1.0` | **`0.46`** |

⇒ **A `1.0` consolation costs `54%` of the Power payout.** 🔑 ***This is the quantity `§0.2d.2`
("Flex can flip an EV-negative Power pool positive — in principle") needs to stop being "in
principle": the trade is now priced.*** ⚠ **And it is steep** — *the giveback is not linear; going
from `0.5` to `1.0` consolation costs a further `23` points of full payout.*

## 3. 🔴🔴 **THE TIER IS NOT A FUNCTION OF THE PAYOUT — stated with its counter-examples**

> *"a **`15.5×` slip got `0.5`** while a **`13.5×` slip got `1.0`**; **two slips with an IDENTICAL
> `11×` full payout got `0.5` and `1.25`**."*

⇒ ***Two slips, same payout, different consolation. Whatever selects the tier, it is not the
number this table is indexed by.*** ⚠ **`NOT RECORDED`: what it IS a function of.**

## 4. ✅✅ **A HYPOTHESIS THAT FAILED — AND THE REASON IT COULD NOT HAVE SUCCEEDED**

> *"a hypothesis that failed: **that the tier tracks `p(exactly 1 of 2)`**. **The test was
> structurally weak** — whenever one leg is a standard at `50%`, `p(exactly one)` is `0.50`
> regardless of the other leg, and **nearly every slip measured had a standard leg**. Cracking the
> rule needs **alt×alt slips**."*

> 🔑🔑🔑 **THIS IS THE ENTRY MOST WORTH HAVING, AND IT IS THE ONE A CORPUS USUALLY LOSES.** *A
> rejected hypothesis is normally recorded as "tested, failed" — or not recorded at all. **Here the
> diagnosis is that the DESIGN could not have discriminated**: the predictor was pinned at `0.50` by
> the sampling, so the test had no power whatever the truth was.* ⇒ ***"Failed" and "could not have
> succeeded" are different findings, and only the second tells the next person what to build:
> `alt×alt` slips.*** ✅ **Recorded at full strength — this is `T1`'s research standard operating
> exactly as designed.**

## 5. ⚠⚠ **THE TIER-B SELECTION BIAS — read before relying on the rescue population** *(SEG `744`)*

> *"**the validation population — ladders WITH a PrizePicks standard — is NOT the rescue population —
> ladders WITHOUT one.** PrizePicks may **skip the standard precisely because its projection
> disagrees with the market**. **Evidence: `5,652` tier-B candidates sit EXACTLY on the books' line
> yet carry a demon/goblin flag** — PrizePicks' center was elsewhere. The flag check removes flagrant
> cases; **half-point center errors that don't flip a leg's kind can still pass.** Treat tier B as
> lower confidence; **filter it out by anchor type when precision matters.**"*

🔑 **A validation set chosen by the counterparty is not a random sample of the thing you want to
predict** — *and the `5,652` is the measurement that turns that from a worry into a bias with a
size.* ⚠ **`NOT RECORDED`: the magnitude of the half-point residual that survives the flag check.**

## 6. ✅ **AND FLEX WAS ALSO CONFIRMED OUT OF SAMPLE** *(SEG `383`, owner's screen, `2026-09-21`)*

| slip | Power pred → actual | Flex pred → actual |
|---|---|---|
| LeBron `pra 34.5` D + SGA `p+r 29.5` G | `3.25` → **`3.25`** | `2.2/0.5` → **`2.2/0.5`** |
| Tatum `p+r 39.5` D + Wemby `points 29.5` D | `5.75` → **`5.5`** | `4.0/0.5` → **`3.8/0.5`** |
| Tatum `points 24.5` G + Brunson `3pm 1.5` G | `1.9` → **`1.9`** | `1.6/0.25` → **`1.6/0.25`** |

⚠ **AND A METHOD ERROR CAUGHT ON THE WAY, kept because the catch is the lesson** *(the cancellation
technique itself is already on file — `5` hits — **this failure of it is not**)*: *a shortcut
dividing the `1G`, `1D` and `GD` slips to cancel the base **assumed they shared the same goblin and
demon. They did not** — `GD` must avoid the goblin's game, so it substituted a different demon. **The
result — a goblin factor of `2.96` against a 3-pick base of `1.52` — was impossible, and that is what
exposed it.*** ⇒ 🔑 **"Verify shared legs before any cancellation."** *An arithmetic identity is only
an identity if the terms are the same terms.*

---

> 📌 **EVIDENCE TIERS**: ⚠ **AS STATED IN `T22`** — every figure above. *Quotations are verbatim;
> **this sweep did not re-probe `/game_types`**, which would be a live call against a real-money
> account.* 🔴 **`NOT RECORDED`** — the above-`5×` consolation rule · what the tier IS a function of ·
> the surviving half-point residual in tier B. ⚖️ **`pp_*` objects not queried; nothing changed or
> triggered.**

---

# 0i-T24. 🔑🔑🔑 **THE LEG EDGE MAP — WHICH TIERS ACTUALLY PAY, MEASURED PER SEGMENT** *(T24 pass 2, §T24.2, 2026-09-23)*

> ⚠ **`AS STATED IN THE SESSION RECORD (`T24`, SECONDARY)** throughout — `§T21.0` §3. **Not re-run by
> this sweep; the `prop_universe` and `pp_*` objects were not queried.** *This is the most actionable
> table in the corpus and its evidence tier is stated first for that reason.*

## 1. 🔑 **THE BARS, AND THEY ARE NOT THE SAME FOR EVERY KIND**

| slip | what a **standard** leg needs | what an **alternate** leg needs |
|---|---|---|
| **3-pick Power** | **`1.10`** | 🔴 **`~1.14`** |
| **2-pick Power** | **`1.155`** | — |

> 🔑 ***Alternates face a HIGHER bar because they face a LOWER mixed base — `5.33` against `6.0` in a
> 3-pick.*** **A goblin or demon must clear `~1.14`, not `1.10`.** ⚠ **This corpus has been comparing
> every kind against one breakeven.** *`claimed = 2 × factor × model_p`; `realized = 2 × factor × hit`.*

## 2. 🔴🔴 **THE TABLE — confident picks (`claimed ≥ 1.30`), realized `2024-25` / `2025-26`**

| source · kind · side | legs | **2024-25** | **2025-26** | hit | verdict |
|---|---|---|---|---|---|
| 🟢 **real standard Over** | `14,429` | **`1.133`** | **`1.130`** | `56.5%` | ✅ **clears `1.10` both seasons** |
| 🟢 **real standard Under** | `26,970` | `1.099` | **`1.131`** | `55.8%` | ⚠ **marginal in 24-25 (`1.099` vs `1.10`)** |
| ⚠ **real goblin Over** | `2,480` | `1.137` | `1.100` | `66.5%` | ⚠ **near its HIGHER `~1.14` bar — does not clearly clear** |
| 🔴 **real demon Over** | **`73,495`** | `1.060` | `1.018` | `25.7%` | 🔴 **fails, both seasons, on the largest population** |
| ⚠ simulated standard Over | `6,236` | `1.098` | `1.123` | `55.6%` | ⚠ mixed |
| 🔴 simulated standard Under | `9,299` | `0.984` | `1.026` | `50.3%` | 🔴 **fails** |
| 🟢 simulated goblin Over | `120` | `1.163` | `1.149` | `82.5%` | ⚠ **clears, on `120` legs** |
| 🔴 simulated demon Over | `2,876` | `0.968` | `0.982` | `37.5%` | 🔴 **fails** |

> ⇒ 🔑🔑🔑 ***REAL STANDARDS CARRY EDGE IN BOTH SEASONS. DEMONS — REAL OR SIMULATED — DO NOT.
> SIMULATED UNDERS DO NOT. GOBLINS SIT NEAR THEIR HIGHER BAR.***
> 🔴 **And the failing population is the biggest one**: `73,495` real demon Over legs at `1.060` and
> `1.018`. ⚠ *This is the same conclusion `§0h-T22` reached from the pricing side (**"demons underpay
> as a class, `−8%` to `−10%`"**) — **arrived at independently, from outcomes rather than from
> prices.*** ✅ **Two different methods, one answer.**

## 3. 🔴 **AND THE MODEL CLAIMS EDGE EVERYWHERE, INCLUDING WHERE THERE IS NONE**

> *"**The model claims `1.36–1.63` everywhere** — raw confidence overstates the edge."*

⇒ ⚠⚠ ***The claim does not discriminate between the segments that pay and the segments that do
not.*** **That is precisely why `§0.14-T23`'s finding — the model RANKS but is `~5×` over-confident —
matters operationally: the ranking is usable, the magnitude is not, and a threshold applied to the
magnitude selects demons at scale.** *(`73,495` demon legs cleared `1.30` and returned `1.02`.)*

## 4. ✅ **SLIP-LEVEL CONFIRMATION OF THE SAME OVERCONFIDENCE** *(`T24` §8)*

**Claimed `2.334` per unit against realized `1.158`** across the validated simulation ⇒ **a `2.0×`
overstatement at the SLIP level**, consistent with the `~5×` edge overstatement at the leg level
*(edge is the part above `1.0`: `1.334` claimed vs `0.158` realized ⇒ **`8.4×`**)*. ⚠ *Stated both
ways because "`2×`" and "`5–8×`" describe the same defect on different scales and the corpus should
not carry one without the other.*

---

# 0j-T24. ✅✅ **VOID / PUSH REVERSION — VERIFIED FROM PRIZEPICKS' OWN SCHEDULES, `79` OF `79`**

*`pp_quote.power_srp` / `flex_srp`, **`2,662` quotes**. Rule `reversion_values`, marked **verified**.*

| case | rule |
|---|---|
| **all-standard POWER** | `r` legs left → **the `r`-pick base** *(`20`, `10`, `6`, `3`)*; **`1.5×` for a single survivor**; **refund only if NONE left** |
| **all-standard FLEX** | `r ≥ 3` → the `r`-pick Flex schedule *(`10/2/0.4`, `6/1.5`, `3/1`)*; 🔑 **`r = 2` → `3×` POWER-style, NOT the 2-pick Flex `2/0.5`**; `r = 1` → `1.5×` |
| **match rate** | ✅ **`79` of `79`** schedule entries, `n = 2–6`, every remaining count, Power and Flex, **including same-game-adjusted quotes** |

> 🔑🔑 ***"A VOID IS NEVER A REFUND."*** **The slip shrinks to the smaller base; it does not return
> the stake.** *That is the single most consequential sentence for EV arithmetic on any slip with
> injury risk, and it appears nowhere else in this corpus.*

## **MIXED SLIPS — and the rule is the worst case for the bettor**

> *"PrizePicks shows the payout of the `r` **LOWEST-factor** legs of the original slip."*

| legs left | within one price step | mean ratio |
|---|---|---|
| `2` | **`99.5%`** | `0.997` |
| `3` | **`96.6%`** | `1.004` |
| `4` | **`91.3%`** | `1.002` |
| `5` | ⚠ `57.5%` | `1.019` — *"the partial multi-alt law runs low"* |
| `1` | — | ⚠ `1.5 × factor` runs **`~6%` under** PrizePicks |

🔴 **keep-HIGHEST matches `0–20%`** ⇒ **the alternative hypothesis is decisively excluded.**
✅ **AND THE GRADING CHOICE IS CONSERVATIVE BY CONSTRUCTION**: *"settlement by the displayed worst
case or by the actual survivors **both pay ≥ keep-lowest** → grading by keep-lowest is conservative
either way."* 🔑 **This is the owner's `§T23.1` §3 rule — *"aim for less earnings"* — implemented as
a grading default, not as a shading.**

*Functions: `nba_market.pp_power_after_voids(factors[], live)`, `nba_market.pp_flex_standard_payout(legs, hits, original)`.*

---

> 📌 **TIERS**: ⚠ **AS STATED IN `T24`** *(SECONDARY)* throughout. 🔴 **`NOT RECORDED`** — why the
> `5`-legs-left case drops to `57.5%`; why `1` left runs `~6%` under. ⚖️ **Nothing queried, changed or
> triggered.**

---

# §F6.7 — 🔑🔑 **THE BOOKS ARE RIGHT TO WITHIN A POINT ON `776,000` LEGS — and this is the mechanism behind `T23-1`**

*Added 2026-09-23 from `T14`. **In `0` of the twelve**: `776,000`, `192,966`, `238,393`, `168,378`
and the phrase "extraordinarily well calibrated" each returned `0` hits.* ***The corpus's central
finding is that the model does not beat PrizePicks. This is WHY, measured, and it was missing.***

## De-vigged sportsbook consensus vs realised outcomes, by tier

| tier | legs | book implied | **actual hit** | error |
|---|---|---|---|---|
| goblin −3 | 22,830 | 73.84% | **74.08%** | **+0.24** |
| goblin −2 | 72,342 | 68.17% | **67.99%** | −0.18 |
| goblin −1 | **192,966** | 61.58% | **60.89%** | −0.69 |
| **standard** | **238,393** | 49.88% | **48.95%** | −0.93 |
| demon +1 | **168,378** | 36.35% | **34.86%** | −1.49 |
| demon +2 | 61,855 | 26.53% | **24.64%** | −1.89 |
| 🔴 **demon +3** | 19,424 | 20.55% | **18.08%** | 🔴 **−2.47** |
| | **776,000** | | | |

## The three conclusions, quoted

**1 · ✅✅ IT VALIDATES THE WHOLE MARKET PIPELINE, and that is the part easiest to miss.**
> ***"the books are right, to within a point, on 776,000 legs. de-vigged consensus predicts outcomes
> almost exactly. **that validates the entire market pipeline — de-vig method, rung matching,
> grading — because three independent systems agree. if any of them were broken, these columns
> wouldn't track.**"***
🔑 *A calibration check used as an integrity check on the pipeline that produced it. **The corpus
documents the de-vig method, the rung matching and the grader separately, and nowhere records that
their agreement is itself the evidence they work.***

**2 · 🔴 IT BOUNDS WHERE EDGE CAN COME FROM — and it is `T23-1`'s mechanism.**
> ***"our edge cannot come from disagreeing with the consensus on average. it has to come from the
> specific legs where our model and the market differ, and from **prizepicks' pricing being worse
> than the books'** — which we measured earlier as a **5–9 point break-even gap**."***
⇒ ***`T23-1` finds the model does not beat PrizePicks on average. This says it never could have by
out-predicting the consensus — because the consensus is right to within a point.*** **The
surviving edge is PrizePicks' pricing gap against the books, not superior prediction.**

**3 · 🔴🔴 THE FAVOURITE-LONGSHOT BIAS, MEASURED — and it condemns deep demons.**
> ***"the error grows with demon depth (−1.5 → −2.5 points). books are slightly optimistic on
> long-shot overs, the classic favourite-longshot bias. **that's a real, exploitable pattern: deep
> demons hit even less than the books imply, so they're worse than they look** — reinforcing that
> only demon t1 is ever worth considering."***

✅✅ **AND IT CORROBORATES `§0i-T24`'s EDGE MAP FROM A COMPLETELY DIFFERENT DIRECTION.** *That map,
built from PrizePicks payouts, kills demons: **real demon Over `1.060`/`1.018` on `73,495` legs at
`25.7%` hit**. This table, built from SPORTSBOOK consensus on `776,000` legs, reaches the same
verdict by showing demons underperform even the BOOKS' implied probability — **and the miss widens
monotonically with depth.*** 📌 ***Two independent measurements, two different markets, one
conclusion. That is much stronger than either alone, and the corpus was carrying only one.***

⚠ **`AS STATED IN T14`, not re-run by this sweep.** *`NOT RECORDED`: the date range, the book set
behind "consensus", and the de-vig method used for this particular table.*

---

# §F5.6 — ✅✅ **`T24`'s REPLAY FIGURES VERIFIED AGAINST THE LIVE DATABASE — the first time any `T24` number has been**

*Added 2026-09-23. **`T24` is the corpus's only SECONDARY source** — a hand-written session record,
not a verbatim transcript — and every figure taken from it carries an "AS STATED, not re-run"
caveat. **The table that holds its slips was named in `0` of the twelve, which is why no pass had
been able to check it.***

**🔴 `nba_score.sim_slip` — `4,379` rows, `19` columns, named in `0` of the twelve before today.**
*Columns: `strategy, game_date, season, slip_no, slip_type, n, n_alt, legs, factors, model_ps,
payout_full, model_ev, live, hits, misses, voids, payout, profit, built_at`. Companion
`nba_score.sim_strategy` (`1` row: `strategy, params, notes, created_at`) **is** on file in two
documents — **the parameters were documented and the results were not.***
🆕 *(additional sweep `6`, pass `396`, `§P396` — `T24`'s §8, the simulator's own specification, AS STATED; `std3_power_130`'s parameters were on file, the simulator's parameter set and its packing and pricing rules were not)*: `nba_score.sim_strategy` holds named strategies whose params are `n`, `slip_type` (power or flex), `min_value` (a floor on the leg value, which the record writes as 2 × factor × model_p), `kinds`, `sources`, `props`, `sides` and `max_slips_per_night`. `nba_score.simulate_slips(strategy, from, to)` writes `nba_score.sim_slip`, one row per slip (legs, factors, model probabilities, the conservative full payout, model EV, hits / misses / voids, the graded payout, profit). The view `nba_score.sim_results` reports per strategy × season the ROI, the night-clustered SE, t, the leg hit rate, and the claimed against the realized payout per unit. Per night it takes the unflagged, graded universe legs above `min_value`, one leg per player, and packs them greedily in value order into slips of `n` legs from `n` different games. Power is priced by `pp_slip_power_conservative` (any mix); Flex is all-standard only, the one verified schedule, so slips containing alternates are skipped.

## What the live table says — `[LIVE-AUDIT]` 2026-09-23

| | `T24` stated | **live `count(*)`** | |
|---|---|---|---|
| slips · nights | `4,379` / `310` | **`4,379` / `310`** | ✅ **exact** |
| **2024-25** | `+10.2% ± 6.3%` | **`+10.20%`**, `1,971` slips, `154` nights | ✅ **exact** |
| **2025-26** | `+20.4% ± 5.3%` | **`+20.35%`**, `2,408` slips, `156` nights | ✅ **exact** |
| **both seasons** | `+15.8% ± 4.1%`, **`t = 3.85`** | **`+15.78%`** | ✅ **exact** |
| void legs | *"`312` void legs graded by reversion"* | **`312`** | ✅ **exact** |
| slip shape | 3-pick standards | **`min(n) = max(n) = 3`, one `slip_type`** | ✅ |
| | | `7,471` hits · `5,354` misses | |

## 🔑 And the standard error reproduces only one way — which tells us the METHOD

*The naive slip-level SE is **`0.0352`** (`t = 4.49`). `T24` reports **`± 4.1%`** and **`t = 3.85`**,
which the naive figure does not give. Clustering by NIGHT does:*

| SE method | SE | t |
|---|---|---|
| slip-level, i.i.d. *(naive)* | `0.0352` | 4.49 |
| 🔑 **night-clustered** *(310 nights, ~14.1 slips each)* | **`0.0410`** | **`3.85`** ✅ |

✅✅ ***`T24` paired a slip-weighted mean with a NIGHT-CLUSTERED standard error*** — **the
conservative and correct choice for slips that share a slate** — **and both figures reproduce to
four decimals from the live table.** 📌 ***That is a point in `T24`'s favour, not against it: the
harder standard error was the one used, and nothing in the record said so.***

⚠ **One nuance a reader should have, and it cuts the other way.** *The **mean of the nightly means**
is **`+13.84%`**, two points below the slip-weighted **`+15.78%`** — because nights with more slips
pull the slip-weighted figure up.* **Both are defensible; `T24` reports the higher one.** 🔴 **Which
it reports was `NOT RECORDED` until this block.**

## ⇒ What this changes for `T23-1` and `T24`

> **The `T24` caveats stand — it is still a session record, `nba_score.paper_picks` still holds `0`
> rows, and this is still a REPLAY and not a traded record.** 🔑 ***But "AS STATED, not re-run" no
> longer applies to the replay's headline numbers: they have now been re-run, from the database, and
> they hold — including the void count and the clustering method.***

⚠ **RULE 54.** *This verifies the ARITHMETIC of the replay against the table the replay wrote. It
does not verify that the table was built from correct inputs, that the strategy is implementable, or
that `std3_power_130` is what `T24` says it is beyond its name and shape.* ***"The reported figures
reproduce from `sim_slip`", never "the strategy works."***

---

## 🆕 §T32.4 — **GOBLINS AND DEMONS IN THE SLIP PROGRAM'S FIRST NIGHT: THE TIER IS THE STABLER ANCHOR, AND GOBLINS ARE PRICED OUT** *(source `T32`, `2026-09-28/29`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§3`, `§7p`, `§8g`, `§10`, `§13b`; recorded `2026-10-10`)*

**① The owner's anchoring principle, verbatim (`2026-09-29 00:57Z`)**: ***"Line Variations vs Goblin/Demon tiers: a line for example points at 10.5 will have different multiplier for different players, it is usable, but is a lot more volatile than using goblin/demon tiers, because we have a anchor and the anchor is board set for that specific player and tier will vary a lot less player to player, so less volatile to work with."*** ✅ **Tested the same night (`§8g`)**: goblin-tier cross-player hit-rate sd **`0.089`** vs a raw `points 15.5` line **`0.143`** — the tier is `~40%` less volatile, because the anchor is board-set per player. *Owner's claim validated with numbers.*

**② Goblins hit often and still lose** *(`§7p`)*: realized `0.71–0.74` at the top bucket, but per-leg multiplier `~0.65–0.73` ⇒ **`p·m ≈ 0.48–0.52` — priced tight, by design.** **All-goblin 3-pick Power on `2,011` real slips: `−86.2%`** (`§13b`) — the refutation of Gemini's "goblins are gold" arithmetic, which applied the slip payout to legs PrizePicks prices individually. ⇒ ***a high hit rate on a goblin is the price, not the edge.***

**③ Demons**: lower `p·m` still at the top bucket (`§7p`) — *with one exception the build chat flagged for follow-up*: by the "one ratio" value rank (`§10`), **`points` / DEMON (`p·m 0.580`) slightly beat `points` / standard (`0.571`)**, while for `assists`/`pra`/`rebounds` the best-value tier was STANDARD. *Recorded as a `T32`-era observation; later transcripts revisit tier value at slip level.*

**④ Where tier/kind must be read from**: `board_scored` carries `tier`/`kind` **NULL on every row** (`§T32.5`, backdata certification) ⇒ goblin/demon analysis reads **`nba_market.prop_universe`** — the MLB `0/0` scar (a defaulted goblin/demon flag read as "standard" produced a fake `+1298%`) is why the program insists on the authoritative column *(strategy `§6`)*. 🆕 *(pass 18, `2026-10-10`, `T32` `20:02Z`; ✅ live `2026-10-10`)* **What `prop_universe` holds per kind**: standard **`817,117`** legs over `20` props (factor `1.000`, mean `model_p` `0.441`) · demon **`482,398`** over `11` props (factor `1.851`, `0.275`) · goblin **`367,509`** over `11` props (factor `0.724`, `0.618`); `357` dates each; graded `95.5%` / `98.7%` / `98.3%`. Goblins and demons exist on the **same `11`** of the `20` laddered props (✅ live): `points`, `rebounds`, `assists`, `threes_made`, `pra`, `pts_reb`, `pts_ast`, `reb_ast`, `fantasy_score`, `fga`, `fg3a`; the other `9` (`blocks`, `steals`, `stocks`, `turnovers`, `dreb`, `oreb`, `fgm`, `fta`, `ftm`) are standard-only in this table. → `NBA_MASTER_SUMMARY.md` `§T32.5`.

---

## 🆕 §T33.2 — **THE OWNER'S TIER-MAP METHOD (`2026-09-30 00:18Z`), THE ANCHOR TIERS ON THE REAL BOARD, AND WHAT PRIZEPICKS CHARGES FOR THEM** *(source `T33`, recovered transcript; build-chat results AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§19`–`§19j`; ✅ table state live `2026-10-10`)*

**① The specification, in the owner's words** — *the most complete statement of the anchor-tier taxonomy in the corpus, given to define how candidates are mapped*:
> *"you create a map day by day of all proplines, breaking it by regulars, goblins and demons tiers, one by one and all legs on the board (all ranks, trailings, high hit rates are board scoped). one app at time, start with PP … you will end up with the hit rate per prop line/tier per day … find which is the high hit tops … you must also test percentages … granulate, point per point and find were it starts losing the high hit rate and find the gold bands."*
> *"Points - Regular | 89% | 25 … Points - Under the Anchor Goblin Tier 1 | 95% | 10 — same for Under the Anchor Goblin Tier 2, 3 and anymore that we can have. same for all goblins and demons, same for all proplines."*
> *"remember that for the back data goblins and demons are more only, but when the season starts we are very likely to have some goblins and demons with the option for less. future example:*
> *`6.5` Goblin More Demon Less (Under Anchor Tier 3) · `7.5` (Under Anchor Tier 2) · `8.5` (Under Anchor Tier 1) · **`9.5` Regular (Anchor — regular with the option for more and less)** · `10.5` Goblin Less Demon More (Over the Anchor Tier 1) · `11.5` (Over the Anchor Tier 2) · `12.5` (Over the Anchor Tier 3)"*
> *"it may also not have a visible anchor, just mores and lesses that are demons and goblins … this options group similar multipliers … more useful, reliable … than just using the ladder variations, because different players may have completely different multipliers on the same ladder variation, like a star can have a 12.5 as under anchor tier 3 goblin while a low usage or support player can have the same line as a over the anchor tier 3 demon. that is why we need to group them properly into tiers, anchored by the regular line or the switch line (when there is no regular line pickable, just the goblins and demons switch)."*
> *"we are not building slips yet, we are filtering and mapping candidates. once that is done we need to see if the multipliers of the survivors are above breakeven."*
🔑 ***In-season prediction recorded for verification***: the owner expects goblins and demons **with a LESS option** once the `2026-27` season opens (the back data is More-only). *Check against the first regular-season boards from `2026-10-20` — this file's own scope line already names "more and less above and below the anchor", and `§2.2` (invisible anchor / switch point) is the case the owner's "no visible anchor" sentence describes.* **(CONFIRMED on the `2026-10-20` board — Less opened on 671 goblin and 636 demon rungs of four stats; see `§T50.2`, T50, 2026-10-26.)**

**② Tier assignment as built (`00:23Z`, owner-confirmed)**: anchor = the Regular line (Over + Under offered); goblin rungs below it = **UA-Gob T1/T2/T3** (k = rungs below), demon rungs above = **OA-Dem T1/T2/T3**; no Regular line ⇒ the **switch point** is the anchor (rare on this board). ✅ Verified on the real board — **Ace Bailey, points, `2026-01-15`**: anchor `12` O/U; goblins `9.5 / 8.5 / 7.5` at factors `0.74 / 0.67 / 0.62`; demons `13.5 / 15.5 / 17.5` at `1.13 / 1.52 / 2.11`. ⚠ **Assumption, stated by the build chat (`00:42Z`)**: *"tiers are capped at T3 (a 4th rung is folded into T3)"* — deeper rungs exist rarely. ⚠ **`T34` later replaced this rank-distance tier with the system's own tier from `nba_market.pp_leg_price`** (strategy `§19m`) — recorded where `T34` is swept.

**③ What the map showed (final-HP rank, PP, 90-day sample → two seasons)**:
- 🔴 **The four defensive props — `steals`, `stocks`, `blocks`, `turnovers` — have NO goblin/demon ladders on PrizePicks**: Regular only, small cells (`14–33` legs/day).
- **PrizePicks prices every goblin and demon tier so that hit × multiplier lands near `0.50`, whatever the tier**: points UA-Gob T3 hits `0.81` and pays `0.635` (`p·m 0.512`); points OA-Dem T3 hits `0.28` and pays `1.98` (`0.542`). ***The goblin hit rate is real and already charged for.*** The cells clearing a 3-pick-Power `0.55`/leg bar are the **Regular** cells (steals `0.637`, points `0.610`, stocks `0.602` top-5) plus a few demon cells on a jackpot profile.
- **Goblins at the very top of the rank** (`§19j`, n swept `1…20`): **pra G2 n=1 `0.807` hit / `p·m 0.563` · pra G3 n=1 `0.860` / `0.562` · points G1 n=2 `0.730` / `0.555`** — ***the goblin edge, where it exists, is a one-or-two-leg-a-day cell that decays fast*** (pra G2 `0.563 → 0.539 → 0.534` at n = 1/2/3). A fixed top-5 band blurred it into "no goblins survive"; the owner's `00:51Z` instruction (*"n 1/2/3/4/5 and so on until it start losing"*) is what exposed it.
- 🆕 *(`T33` pass 2, `2026-10-10` — `NBA_MASTER_SUMMARY.md` `§T33.5`)* **The goblin real-slip test that preceded it (`00:45Z`, answering the owner's *"no goblins survived?"*)** — *AS STATED, on the pre-`④` map*: every top goblin cell **lost when played** — **Flex `−39%` to `−76%`, Power `−15%` to `−67%`**. Two stated reasons: the day's five best goblins are five different players, so all-5 lands only `0.11–0.36` of the time despite `0.70–0.80` per-leg hits; and five goblin factors multiply to `≈ 0.64⁵ ≈ 0.11`, so a 5/5 Flex returns `≈ 1.1×` the stake. ***The goblin discount is the price of its hit rate, not an edge over it*** — the top-of-rank exception above is what the every-n sweep found next (goblins' later role → `§T34.2`).
- **Ladder expansion between seasons**: PP roughly **quadrupled** its goblin/demon ladders from `2024-25` to `2025-26` — deep tiers had `2–23` days of `2024-25` history vs `158–161` in `2025-26` ⇒ *deep-tier `2024-25` cells are near-empty, not a weaker season.*

**④ The audit that rebuilt it (`§19e`)** — two defects in the first map, both fixed the same night: (a) it filtered `line_source='real'`, which includes **every book's** real lines, not PrizePicks' (`107%` of the PP board); (b) 🔴 **PrizePicks posts its goblin/demon ladders as `player_<prop>_alternate` markets** and the join stripped only `player_` — so **only `23%` of the board joined and every joined leg was `standard`**. Mapping `*_alternate` → base prop raised the join to **`88%`**. ⇒ ***Any query that joins PP board rows to a prop key must fold `_alternate` — or it silently sees no goblins and no demons.***

**⑤ Persisted**: `nba_score.tier_map_legs` — ✅ live `2026-10-10`: **`828,818` legs per rank key × `3` keys (`final_hp`, `baseline_hp`, `final_score`)**, `323` days `2024-10-22 → 2026-04-12` *(the build chat's `T33` figure was `911,368` for `final_hp` alone; the table was rebuilt later — `T34`)*; `nba_score.tier_map_bands` `30,411` rows; `nba_score.tier_map_summary` `990`. Builder `nba/build_tier_map_bands.py`.

---

## 🆕 §T34.2 — **THE TIER MAP ON THE SYSTEM'S TIER: DEMONS INCONSTANT, THEN CONDITIONAL GOLD; GOBLINS AS EXTENDERS** *(source `T34`, `2026-09-30`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§19k`–`§19p`, `§22c`, `§23b`, `§24a`; ✅ = live `2026-10-10`)*

**1 — The tier is the system's, not the slip program's** (`§19m`, owner-triggered). `T33`'s map tiered by rank-distance inside a kind; `pp_leg_price` already carries the anchor tier and **disagreed on real legs** (*"Bailey points 13.5 vs a 12 anchor is tier +2, not my D1"*). Rescued-anchor legs (no pickable Regular; the system anchors on sportsbook consensus with `tier = 0`) are tiered from `line − anchor_line` — **`~14k` demons at `1.9–3.1×`, the owner's *"switch line"* case** (`T33` `00:23Z`). Rebuilt map: `910,513` legs, `323` days; **R `311k` · G1 `149k` · G2 `69k` · G3 `27k` · D1 `51k` · D2 `150k` · D3 `154k`**. `D0`/`G0` = `38` legs exactly at a rescued anchor, ignorable (`§19n`).

**2 — Two invariants of the board's shape** (`§20a`, `§24`): **Regular lines carry BOTH sides and exactly one hits; goblin/demon ladders are Over-only** ~~(on the backdata~~ (superseded for live boards by `§T50.2`, T50 2026-10-26: from `2026-10-20` near-standard goblin and demon rungs of Points / PRA / Rebounds / Assists also carry a Less side; the back data stays More-only) (on the backdata — the owner's `T33` note that live 2026-27 ladders may carry Less stands). Consequence: any rate pooled across sides on Regular is `0.500` by construction.

**3 — Demons on the corrected map: every cell INCONSTANT** (`§19m`). Above break-even on average, but top-5 beats its per-leg `p_be` on only **`41–51%` of days** — *"a jackpot profile, all of them."* `T33`'s *"rebounds D3, the only constant demon band (68%)"* was an artefact of the rank-distance tier lumping deeper rungs at a `3.3×` average; at the system's tier and the per-line `2.20×` it sits at `49%`.
**…then CONDITIONAL GOLD with a stack** (`§22c`). In the candidate × signal matrix, **every robust stack is a demon cell**: rebounds D1 (`t5 ≤ 0.33` + consistent → p·m `0.724`), assists D1 (`t5 ≤ 0.33` + base top-5 + final top-3 → `0.706`), threes D1 (market edge `0.05–0.15` + two ranks' top-3 → `0.693`), rebounds D3 (`t5` + `t10` mid → `0.723`) — lifts `+0.10…+0.17` in **both** seasons. Two mechanisms: **trailing-COLD on a demon** (a player cold on a demon line is priced down and reverts) and **rank-over-rank agreement**. The Regular cells gain only `+0.02–0.03` and do not stack. *"These stacks are one-season-confirmed on 130–870 legs each; the live season is their test."*
**Certified** (`§24a`, raw board → outcome → current price → ranks): **threes D1** (score, top-2) `0.473 × 1.33 = 0.631`, `+$43` / `$100` in `2025-26`, `+$16` in `2024-25` — **positive both seasons**; **assists D1 Over** `+$16` / `+$91` — positive both, *"PP cut the multiplier 1.50 → 1.26"*; rebounds D3, assists D3, points D3/D2, rebounds D1 — `2025-26` only.

**4 — Goblins, re-analyzed (`§23b`, *"owner was right"*).** Every goblin test had asked whether `p·m` clears `0.55` — a bar a goblin can never clear, because PP prices it to `implied × factor ≈ 0.50`. The right questions: (1) does the realized hit beat **PP's own `implied_p`**? — **yes, on every one of `88` goblin cells** at the top of the rank, mostly `+0.04…+0.10` (pts_ast G2 top-1 `0.840` vs `0.735`; points G1 top-2–3 `0.730` vs `0.630`; pra G2 top-1 `0.793` vs `0.695`); (2) **in which slip structure is that edge paid?** — real slips, `150` real days:
| slip | ROI | days paid |
|---|---|---|
| 4 Regular, 4-pick Power | `+109%` | `22%` |
| **4 Regular + 1 goblin, 5-pick POWER** | **`+148%`** | `20%` |
| 4 Regular + 1 goblin, 5-pick Flex | `+65%` | `47%` |
| 3 Regular + 2 goblins, 5-pick Flex | `+23%` | `24%` |
⇒ ***Goblins re-enter as EXTENDERS*** — one top goblin as the fifth leg of a slip already winning on Regular legs; **never a replacement for a Regular, never two.** Standalone, every goblin cell is negative in both seasons (`−$1 … −$26` per `$100`, `§24a`). *This answers the owner's `06:20Z` "i am sure there are positive candidates in goblins": positive against PP's price, yes; payable only as an extender.*

**5 — Under the walk-forward bar** (`§28d`–`§28j`) the demon-only compositions are the **one family independent of the steals anchor** (family B: demon 5-Flex cap 3 OOS `+129%` CI `+55…+219%`; demon 3-Flex cap 1 OOS `+62%`); demon Power rows fail (`−100%`). ✅ **Live**: `B_demon_5flex` and `B_demon_3flex` are in `nba_score.live_strategy_state`, both `paper`. (superseded by `§T49.2`: both red, cap 0, from 10-15/10-16; and by `§T50.2`, 2026-10-26: PrizePicks staking is now the portfolio, with one demon unit, `P_B9_6flex`, in Portfolio B)

---

## 🆕 §T35.2 — **DEMONS AS THE LONG-DROUGHT HEDGE, DEMON 5-FLEX TO CAP 6, `demon2` REJECTED, AND THE GOBLIN EDGE IN WEEK 2** *(source `T35`, `2026-10-01`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§29d`, `§29g`, `§29k`, `§29n`)*
- **In every long drought the demons hold** (`§29k` pass 1): D1 `+60/+32%`, E4 `+61/+13%`, E1 `+169/+82%`, E5 `+14/+14%` while steals-anchored Regular strategies lose `−25…−70%`; in 2024-25 weeks 5–10 the demon and Power strategies were `+6…+76%` (`§29d`). *"The demon hedge in §25-26 is the hedge specifically for the long droughts."* Diversify never touches them (their pool has exactly three cell families).
- **Demon 5-Flex cap 3 → 6** (`§29k` pass 12): its 4th–6th slips earn `+157%` and 7th–10th `+173%` vs `+146%` for the top 3 (*"the pool's 10th slip is as good as its 1st"*); 6+ slips available on `70%` of days. Walk-forward: cap 3 OOS `+129%` (net `497`), **cap 6 OOS `+144%` on `675` slips (net `975`)**, cap 10 `+139%`; net per unit of drawdown best at cap 6. *"The largest single improvement the drought investigation produced … from the long-drought hedge being under-weighted, not from predicting droughts."* Unique contribution after dedupe: demon 5-Flex **`+1,040`** — *"nothing else close."*
- **`demon2` (Gemini's "Tier-2 demons") REJECTED by the system's own bar** (pass 15): threes D1 ranks 3–4, points D2 / rebounds D2 / rebounds D1 top-2 looked good on 2025-26 (`0.571–0.580`), then **`cand_certified` had already evaluated them** — points D2 2024-25 p·m `0.526` (`−$17`), rebounds D1 `0.503` (`−$27`). *"The demon pool's limit is real; the certified pair (threes D1, assists D1, positive in both seasons) is the pool."*
- **Replays**: demon 3-Flex `active` from Dec 22, demon 5-Flex from Dec 28; zero reds; acceptance replay #3: demon 5-Flex `+552` at lower bound `+71%`, zero yellows (`§29g`, `§29j`).
- **Goblins in week 2** (`§29d`): top-ranked goblins beat PP's implied probability in every window (week 1 `+0.122`, week 3 `+0.030`, rest `+0.026`) **and fall below it in week 2 alone** (`0.702` realized vs `0.736` implied, `−0.034`) — *"because which goblin to take still depends on the model."* Goblins hit `67–74%` in week 2 but are priced to `0.44–0.50`, as always.

---

## 🆕 §T36.2 — **DEMONS AT LAUNCH: THE DROUGHT MENU'S ANCHOR, THEIR OWN CALENDAR, AND THE FOUL KEY ON DEMON LEGS** *(source `T36`, `2026-10-02/03`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§29n` passes 38/66, `§29p`, `§29r`–`§29w`; ✅ = live `2026-10-10`)*
- **The drought menu** (`§29p`, re-measured pass 79): inside the five long droughts the **demon 3-Flex** is the anchor (`+53 / +87` after the no-steals rebuild; `+77%` in normal weeks — *"all-weather"*); demon 5-Flex `+31%` in droughts, `+146%` normally. *"A long drought is a steals drought, and everything without steals holds — the demons …"*
- **The demons' own calendar** (pass 38): bad in week 2 too (p·m `0.437`; threes `21%`) — the week-2 gated play sets them aside; **best in weeks 22–24 in both seasons** (`0.75 / 0.71 / 0.66`). In **All-Star week** the demons **stake** while family A and the points Power sit or cap (`§29r`, pass 36: demons `+58%`, `44 / 73`).
- **The low-foul key reaches the demons** (pass 66): low-foul shooters' **threes D1** p·m **`0.705`** (`0.701 / 0.711`) vs `0.571`; **assists D1** `0.681` vs `0.632`, both seasons; rebounds D3 the exception (mixed).
- **Demon 5-Flex is the launch portfolio's largest earner**: acceptance replay #5 `+185%` (`+1,205`); replay #7 (launch configuration) **`+980` (`167%`)**; in the 2024-25 live-engine replay it carried most of the `113`-unit Dec 21 – Jan 11 drawdown with weighted:steals (`−44` / `−33`), *"inside the calibrated MC95 drawdowns of those two strategies — the price of their upside."* ✅ calibration today: `B_demon_5flex` hist max dd `115.2`, MC95 `130.6`. *(re-read pass 29, a dated live observation only: `live_strategy_calib` was recalibrated at `2026-10-10 04:27Z`, after this corpus ends — `B_demon_5flex` now hist max dd `309.7`, MC95 `451.2`, and the strategy is `red`; the cause is post-corpus and is not recorded here)*
- **Demons do not transfer to the other boards** (`§29v`): Betr's feed has **no demons**; Underdog has no demon ladder (`§T34`); *"family B does not transfer."*

---

## 🆕 §T37.2 — **UNDERDOG'S "TIERS" ARE MODIFIER BANDS, NOT LADDER RUNGS** *(source `T37`, `2026-10-03`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§30j`–`§30m`, `§30r`, `§30y`)*
- **No ladder on Underdog's archive**: one line per player-prop-day — a **balanced main** (`1.00×` both sides, ~half) or a **priced line** (modifier tilted, filed under `_alternate`). So the PrizePicks anchor-tier method (UA-Goblin / OA-Demon rungs from the Regular line) **cannot apply**; tiers are **the side's modifier band**, which is what sets the leg's break-even: **R** = `1.00` · **F1 / F2 / F3** = favoured sides `0.90–0.99` / `0.80–0.89` / lower · **B1 / B2 / B3** = boosted sides above `1.00`. BE for the program `0.536`.
- **Unranked, every band is priced to the edge**: R legs at exactly p × m = `0.500`; priced bands `0.42–0.50` (2025-26 lower — the alternate margin). Whole-board tier rates (`§30q` null): R `0.500`, F1 `0.539`, F2 `0.556`, F3 `0.627`, B1 `0.451`, B2 `0.382`, B3 `0.287`.
- **Most favoured bands that worked in 2024-25 collapsed in 2025-26** (rebounds F1 top-3 `0.583 → 0.469`, assists F1 `0.562 → 0.457`, threes F1/B2, pts_ast F1/B1) — *"consistent with Underdog moving margin into priced lines."* The certified priced cells: **reb_ast B1** (the booster carrying `23–40%` of strategy profit — *"a booster, not a crutch"*: removing it leaves every strategy positive), rebounds F2 (the one casualty of the balanced repricing), rebounds B1, later pts_reb B1.
- **Repricing moves legs between bands** (`§30r`): under today's rule 2024-25 B1 `45,159 → 34,054` and F2 `18,746 → 36,307` (*"boosts become favourites"*) — *tier migration*, the reason a strict reprice collapsed the same-cells build.
- **Low-count Overs never certify** (`§30y`): blocks, threes, turnovers, rebounds R — **Over configurations `0 / 12` pass** (weaker-season p·m `0.42–0.51`); Under `10–12 / 12`.
- **Goblin/demon analogues**: *"PrizePicks' goblin/demon analogues were priced out"* — the UD priced bands that certify are the analogues that survived pricing.

---

## 🆕 §T39.2 — **GOBLINS UNDER-CONFIDENT, DEMONS OVER-CONFIDENT, AND THE DEEP GOBLINS THAT NEVER REACHED A CELL** *(source `T39`, `2026-10-05/06`, recovered transcript; AS STATED from `NBA_SLIP_BUILDING_STRATEGY.md` `§31s` G2 and COMPASS fact 124 as annotated)*
- **Calibration by kind** (recalibration map v2): **goblins are UNDER-confident** (model `0.644` → realized `0.685`), **demons OVER-confident** (`0.285` → `0.246`) — *"kind is essential"*; the map is keyed on it. **Three demon (prop, kind) cells are served RAW** (assists / rebounds / threes demons) because *"demon calibration shifted between seasons — the certified D1/D3 cells keep their raw probability"* (`NBA_BASELINE_CALIBRATION.md` `§T39.5`).
- **G2 — a selection gap in the ladder** (priced half-point window legs the model did not score although it modelled that player's prop that day): **demons 2024-25 `2,747` (3.35%), 2025-26 `11,608` (3.91%)**; **goblins `310` / `1,130`** (~0.5%), nearly all in cell-usable tiers |1–3|. They sit **beyond the ±10-rung ladder around the MODEL's projection** — demons above it (the model projects far lower — rarely picked) and ***"goblins below it (the model projects far HIGHER — among its most confident legs, and they never reach a cell)."*** 🆕 *(pass 3, `2026-10-10`, from the `T39` commit message, AS STATED)*: the **cell-usable subset (tiers 1–3)** beyond the model's ladder is **`2024-25` `2,430` demons + `306` goblins, `2025-26` `5,957` + `1,124`**, and **`20` rungs cover `98.8–99.7%`** of it — *"the 'deep demon' gap is a SELECTION gap."*
- **Root cause**: `build_combos_ladder.py` **ignores the main builder's per-prop depth table** (PRA 16, pts+reb 15, pts+ast 14) and uses **one global `BT_LADDER_STEPS` = 10**. Needed for p99 coverage ≈ pts+reb / pts+ast 21, PRA 24, points 23. Deep rungs measured calibrated for PRA / pts+reb / pts+ast / points; **rebounds beyond 6 is a 21-point trap** (goblin side `96.4% → 75.6%`).
- **A correction the build chat made to itself**: a rebounds depth change (6 → 10) was decided on a claimed `408` affected legs, then **reverted** — *"3 distinct legs, not 408; deep rebounds rungs overconfident"* (COMPASS fact 134 correction, `2026-10-06`).
- What became of G2 (routing, gate 2 for deep combo rungs) is `T40`.

## 🆕 §T50.2 — **`T50` (`2026-10-17 -> 10-26`): GOBLIN / DEMON LESS IS LIVE ON THE BOARD AND PRICED; THE FORWARD PAPER TRACKER; THE `10-21` PULLED-LEG INCIDENT; THE GOBLIN SUBSTITUTE BUG; THE QUOTE GATE; DEMONS OFF THE STAKED SCREEN** *(source `T50`: certification ledger "OPENING NIGHT", "DAY TWO", "DAY THREE"; `NBA_COMPASS.md` facts `174`, `176`, `177`, `178`, `182`; `NBA_BOARD_LEARNINGS.md`; `PP_PAYOUT_FINDINGS.md` `0n`; provenance: **AS STATED** from the build chat's own files (certification ledger, COMPASS facts 166-185, board learnings) for `10-17` -> `10-25`; **TRANSCRIPT** where the T50 transcripts show it (subagents `10-20` 15:08 PT, `10-21` 19:52 PT; main `10-25` 23:37 PT -> `10-26` 00:11 PT shows nothing on goblins or demons); full payout laws in `NBA_MULTIPLIERS.md` `§T50.3`)*

### T50.2.1 Goblin and demon Less opened on the board (opening night, 2026-10-20 PT)
- 🔑 **The `10-19` prediction is confirmed.** The owner expected goblins and demons with a Less option once `2026-27` opened (see the in-place note on the prediction line of this file); the `10-20` board carried an `allowed_wager_types` field per projection, valued `over` or `under_or_over`, and the archive now stores it.
- 🔑 **Which rungs open to Less.** Less opened on 671 goblin rungs and 636 demon rungs on the `10-20` board; 165 standard lines stayed More-only. Only four stats opened: Points, PRA, Rebounds, Assists. Only near-standard rungs opened: the rung's quote-level More probability sat between about 0.30 and 0.70 (500 priced rungs measured).
- 🔑 **Archive filing.** `archive_live_boards.py` files a Less row (price `100`, side Under, on the `*_alternate` market) only where the projection allows Less; the filing landed 2026-10-20 15:33 PT after that day's P3 had run, so the `10-20` archive holds no alternate Less rows and the first archived Less rows are the `10-21` board (1,307 alternate Less rows: points 387, rebounds 344, PRA 312, assists 261, steals and blocks 3 together).
- 🔑 **Naming trap, goblin Less versus demon Less.** PrizePicks names a Less alternate by its rung (`pp_mined_leg`): goblin Less = a line BELOW the standard (a hard Under, quoted about 1.45x to 2.5x); demon Less = a line ABOVE the standard (an easy Under, about 0.80x). The archive (`pp_leg_price`, the four-way rule of `build_board_tiers_v2.py`) names the same leg by difficulty, the opposite word. Research live labels were flipped to the rung convention on `10-22` (history label UG = Under on a goblin rung).
- 🔑 **Less is the complement of More with a 1.7x floor.** Over 75 fresh More/Less pairs (PP_MODE=less) P(More) + P(Less) = S has median 0.991 (range 0.949 to 1.005); the Less factor floor is 0.5667 (1.7x) and 9 of 75 pairs sat at the floor. Check: Harper PRA 23.5 goblin-Less model 1.089 against quote 1.083; the demon-Less floor of 1.7x matched. Research price: fq = model More factor x quote lift (goblins 1/0.954, demons 1/0.946, 257 quoted legs); p_over = 0.5/fq; p_less = 0.99 - p_over; factor = 0.97 x 0.5/p_less unless at the floor. `pp_price_version` already priced the Less side.
- 🔑 **Quote pairs on 10-21 / 10-22.** PrizePicks' own pairs sum 0.5/f_more + 0.5/f_less = 0.980 (46 demon-rung pairs) and 0.989 (29 goblin-rung pairs), range 0.942 to 1.005, so the S 0.99 law stands. The archive's model Less price sums with its More twin to 1.046-1.050 (2,399 pairs), so the archive values a live Less leg 5-15% BELOW what PrizePicks pays; this affects ranking and screen value only (PrizePicks pays its own price) and was not changed. Research sensitivity at the archive's 1.049: no Less cell or pattern holds (best +4% to +16%, lb5 below 0).
- 🔑 **Does PrizePicks price our view? No.** Across 215 legs the quoted probability against our per-line price model correlates 0.91-0.97, and the residual moves only 0.02-0.03 of price per unit of our disagreement (10 points of disagreement moves the price about 0.3 points). A model selection edge is therefore not priced away.
- 🔑 **Blind Less has no edge on goblins.** Over about 186,000 Less-open rungs of both seasons, blind goblin Less is priced More 0.65 and realized 0.65 (no edge). Blind demon Less realized More 0.31-0.39 against priced 0.34-0.42, so it beats its price by about 3 points. The history never offered Less (zero Under rows on alternates, 1.45M alternate rows all Over), so every Less backtest simulates the open set; this supersedes the earlier "Less side untestable" reading only in that a price law now exists.

### T50.2.2 Payout proof for alternate Less, 2-6 picks, Power and Flex (opening night)
- 🔑 **544 multi-pick quotes (grid plus a new stack mode).** Grader v3 is conservative everywhere (mean grader/quote 0.91-0.97 for 3-6 picks, up to six alternate Less legs); Flex with alternates 0.84-1.00, never above 1.012.
- 🔑 **The one overpay.** A 2-pick Power with an alternate: one alternate plus a standard More matches the law exactly (1.000); one alternate plus a standard Less mean 0.989, p10 0.944; two alternates mean 0.983, p10 0.931, maximum overpay 11% (Shamet goblin-Less plus Barnes demon quoted 5.25, graded 5.83). Research multiplies 2-pick alternate Power by 0.93 (10th percentile of quote/law, 56 quotes); the production grader is unchanged (42 quotes in production, more needed).
- 🔑 **Flex with goblins and demons on 2-4 picks (10-22 proof).** Of 4,236 NBA lineups of 2-4 picks re-priced from the same run's mined factors, all-standard slips are never above PrizePicks (Flex exact, Power exact except where the conservative same-game rule pays less). Flex with alternates, all-hit tier at or below PrizePicks: 2-pick 99.1% (mean ours/PP 0.921), 3-pick 88.3-88.7% (mean 0.96, never more than 5% above), 4-pick 89.8-91.7% (mean 0.90-0.92); one-miss tier 100%, 96.5-98.3%, 95.3-95.8%. Overpays are cents (at most +0.13) except 2-pick two goblins with factor product below 0.5 (8 quotes, ours 1.40 against 1.20), 2-pick goblin plus demon (+0.20 to +0.80 on a handful), and one same-game 4-pick (9.00 against 7.00). Every Flex number is therefore a lower bound of what PrizePicks pays.
- ⚠ **RED: Power with alternates over-pays on demon stacks.** 3-pick factor product 15-78 (+5 to +130, e.g. 380 against 250); 4-pick product 27-259 (271 against 39 same-game; 2,694 against 1,500); 2-pick product above 10 (+1 to +2.35). Below a product of about 5 Power is at or below PrizePicks (within +0.75). Any backtest of multi-demon Power is overstated; the production grader is not changed (owner's call, capping `power_alt_v3` at the quoted envelope is owed).
- 🔑 **Same-game is ignored whenever a slip has a goblin or demon (TRANSCRIPT, 10-21 19:52 PT payout-code map).** In the grader's branch order the Flex-with-alternates branch is evaluated before the same-game check, and Power with alternates never reads the same-game flag; the sub-agent listed this as an open gap found in no document at the time. The quote gate below is what catches the cases in practice. (Same-game Power numbers: `NBA_MULTIPLIERS.md` `§T50.3`.)

### T50.2.3 Searches for a goblin / demon Less strategy: exhaustive search, fixed rules, robustness
- 🔑 **Exhaustive search with alternate Less (2026-10-20 15:17 PT, `research_exhaustive_pp.py`, EX_ALT_LESS=1).** 18,551 patterns x 2 structures, out of sample in both directions: 9,909 of 37,102 pattern-structures positive both ways. Top Power patterns stack goblin Less: R_REB_O + 5 UG +582% / +336%; 6 UG Flex +274% / +130%. Selected goblin-Less legs hit 0.45-0.47 against a priced about 0.34.
- 🔑 **Nested selection fails.** Choosing the best pattern on one season and playing the other turns in-sample +190% to +470% into out-of-sample -1% to -53%. The search is rejected as a selector, which is why the next step used fixed rules.
- 🔑 **Fixed rule families (2026-10-20 16:28 PT, `research_altless_strategies.py`).** Every rule is written before grading and reported on both seasons, none dropped; positive means positive in both seasons with the day-block bootstrap 5th percentile printed beside it. Families: A, pool in {UG goblin-Less, UD demon-Less, UG+UD} with depth rmin <= N (N in 1, 2, 3, 5, 10), no training; B, same pools ordered by the other season's cell value; C, mixed with 1 or 2 standard Unders; D, volume, two disjoint slips a day. Sizes 2-6, Power and Flex. Slip rules: one leg per player, at most 2 legs per game, at least 2 teams, final 7 days of each season left out.
- 🔑 **The rule that held in both seasons.** 5 picks of goblin plus demon Less at depth rmin <= N (N = 1, 2, 3): Power +97% / +89% and +126% / +71%, Flex +60% / +58% and +64% / +50% (2024-25 / 2025-26), with a bootstrap 5th percentile below zero because Power pays on only about 4% of days.
- 🔑 **Fragility (2026-10-20 16:37 PT, `research_altless_robust.py`).** Tested price (S 0.97 / 0.99 / 1.00, margin 3% / 0% / 6%), open band (More probability 0.30-0.70 measured, against 0.35-0.65 and 0.25-0.75), time (monthly ROI, drawdown, longest losing streak) and size neighbours (4 and 6 picks). The result that matters: a 5-pick rule moves from +106% to -41% from the assumption about WHICH rungs are open alone. That is why the next step had to record the real open set forward.

### T50.2.4 The forward paper tracker (certified 2026-10-20 evening PT)
- 🔑 **What it is.** `nba/paper_altless_tracker.py` (modes pick, grade, report) writes `nba_score.paper_altless_slips`: status `paper`, never placed, never on the slip screen, one set per slate per rule family. The P3 soft step `soft_paper_al` picks after the Underdog paper pick; the P2A soft step grades and prints the running report.
- 🔑 **AL_* rules (goblin / demon Less).** Points, PRA, Rebounds, Assists; tiers 1-3; legs ONLY where PrizePicks' window board opened Less (archive rows side Under on `*_alternate`; the open set is never assumed); depth rmin <= 2 by reverse rank on score / final_hp / baseline_hp per (prop, tier); price from the Less law; sizes 2-6, Power and Flex; at least 2 games, at most 2 legs per game; only games not yet tipped at pick time; one set a day.
- 🔑 **SR_* rules (standard Flex, shared tracker).** 9 rules out of 585 whose bootstrap LB5 is above 0 in both seasons (244,670 graded standard legs, `research_standard_depth.py`), all 5- or 6-pick Flex. Per the sub-agent re-read, per-rule ROI (2024-25 / 2025-26): baseline_hp both top 2 6F +90.8 / +78.8; Over top 3 5F +39.0 / +36.0; Over top 2 5F +49.4 / +36.5; Over top 5 5F +37.4 / +35.5; Over top 10 5F +37.1 / +35.5; both top 2 5F +32.7 / +70.1; Under top 3 6F +69.4 / +70.2; final_hp Under top 2 5F +31.9 / +30.8; final_score Under top 1 5F +35.0 / +59.5.
- 🔑 **Audit `audit_paper_altless_tracker.py` passed** on 2025-01-15, 2025-03-10, 2026-01-20, 2026-03-15: alt-Less rank parity with research 100% inside the tie interval (equal scores order arbitrarily in research), grade parity 40/40 per slate, standard legs 908/908 and 772/772, stat expressions equal `prop_universe.stat_actual` on 4,113/4,113 legs over all 12 props. Live picks also rank rungs that research dropped as ungraded (DNP): unknowable at pick time, reported and not failed.
- 🔑 **First real picks: the 10-21 window (11 games).** Simulated 10-21 pick (rerun started 00:40 ET): 1,217 window Less rows, 0 four-way violations, 0 in live slips, paper tracker AL 10 + SR 9 slips. Graded 10-21 record on 10-22: 19 paper slips graded; the forward record at that point is one slate where the 2-4 pick Less slips all lost or partly paid.
- 🔑 **The live engine keeps alternate Less out.** `live_slip_engine` BOARD_SQL excludes alternate Less legs (NOT kind <> standard AND side Under) from the certified cells, and from 2026-10-20 15:34 PT the engine states this explicitly, because certified history contains no Less legs. Alternate Less legs also have no graded history for `board_hp` (level-1 centring only).

### T50.2.5 The alternate-Less tier audit: two defects fixed before the Less rows landed (2026-10-20 evening PT)
- ⚠ **Defect 1, `build_board_tiers_v2.py`.** The switch-point anchor (ladders with no standard line) took the lowest +100 alternate as the lowest demon WITHOUT a side filter, so a goblin's new Less row would have pulled the anchor down. Fix: anchor from More rungs only.
- ⚠ **Defect 2, `nba_market.pp_refresh_prices()`.** The anchor rescue labelled rescued rows by position only (below = goblin) and checked the More flag against that label, but a Less row below the anchor is a demon. Fixed side-aware (four-way rule) with the flag check by position; identical on More rows including the `flag_agrees` false case at the anchor. Applied to the database (md5 396b10f9 equals the reviewed source) and recorded by a SQL dump.
- ✅ **Proof `audit_alt_less_tiers.py` passed (AUDIT_PASS)** on the real `10-21` board as the P3 archiver parses it, temp tables only: More rows 7,225 of 7,225 identical with and without the 979 Less rows; the OLD anchor would have changed 767 More rows (10.6% of the board) including tiers, price keys and prices; Less rows follow the four-way rule (454 goblin above the anchor, 505 demon below, 20 with no anchor), 0 violations.
- 🔑 **The four-way rule, restated.** (More or Less) x (above or below the anchor): Less above the anchor is a goblin, Less below the anchor is a demon; More rows are classified by position as before. This is the rule the file's `§T22` section predicted and that nothing could exercise before `10-20`.
- 🔑 **Certification L3 false alarm fixed.** `certify_slip_system` L3 read every Less goblin and demon as a tier sign error (559 and 594 rows); the check is now side-aware and the run is 83 checks with 0 FAIL.
- 🔑 **Follow-up numbers.** 10-21 simulated pick: 1,217 window Less rows, 0 four-way violations, 0 Less legs in live slips. The `10-20` simulation that started 20:56 PT (23:56 ET) labelled every `10-21` row `routine`; simulations must start after midnight ET to see the next slate as `window`.

### T50.2.6 The 2026-10-21 pulled-leg incident (all 17 slips carried a leg PrizePicks turned into a demon)
- 🔴 **What happened.** Keyonte George Turnovers 2.5 was a REGULAR line with both sides in our 13:19 PT window capture; in PrizePicks' board at the 13:30 PT quote (map file stamped 13:29:51 PT) it was a DEMON, More only, with no regular turnovers line. All 17 PrizePicks slips carried it as a regular Less, so every quote was recorded as unmapped and the screen showed the model's estimate with the reason only in each card's small print.
- 🔑 **Fix v1.4.34.** A slip with a leg not on PrizePicks' board at the quote (or not quoted) is shown in red on its card and leads the day's note (which leg, how many slips). On 10-22 at 14:53 PT a slip with a pulled leg was made never PLAY and not shown (v1.4.37), then the quote gate below followed.
- ⚠ **Still owed (as of the ledger):** re-check every slip leg against PrizePicks' live board right before slips are published, then substitute automatically or refuse the slip. The quote gate covers the refuse half after the fact; the automatic substitute is not built. The board can change a line type (regular to demon, More only) in the 11 minutes between capture and quote, so the line type itself is not stable.
- 🔑 **Related.** Al Horford 3-PT Made 1.5 More is a demon (factor 1.373) in most PrizePicks slips, which is why our estimates ran above table pay (5-Flex 13.84x against 10x; 4-Flex 8x against 6x). The owner's typed 4-Flex 6x / 1.5x is the plain table; his 5-Flex 11x / 2x / 0.4x sits between. Comparison waits for screenshots of the entries as placed, since George Turnovers was replaced.
- 🔑 **Pulled legs recur.** On the first Portfolio B slate (2026-10-25) three of six slips were quote-skipped because one leg (Daniss Jenkins Turnovers Over 1.5) was no longer on PrizePicks' board; B keeps no backups by design. On 10-20 a pulled VJ Edgecombe threes demon was one of the losing Overs.

### T50.2.7 The goblin substitute bug (owner 2026-10-21 15:22 PT: "When I removed the leg ... it put a goblin instead")
- ⚠ **Root cause.** The Slips screen's backup pool was ranked by hit probability alone, so the first legal substitute was nearly always a goblin (factor below 1), cutting a regular slip's payout.
- 🔑 **Fix v1.4.33.** The pool is the +EV legs ranked by edge over each leg's OWN break-even, every line type kept; unchecking a leg brings a substitute of the SAME line type, best edge first (another type only when the pool has none legal). A substitute is never the opposite side of a player already in the day's slips. Test C24 was rewritten as properties and the browser step checks the substitute's type and edge.
- 🔑 **Why it matters here.** A goblin pays below 1 per leg (factor 0.614-0.934 in the map), so a silent swap of a regular leg for a goblin lowers the whole slip's multiplier while the hit probability looks higher; the same break-even (0.56 / factor) logic that governs the board's edge applies to substitutes.

### T50.2.8 Demons in the portfolios, the edge monitor and the staked screen
- 🔑 **Status at 10-20 22:08Z (15:08 PT, TRANSCRIPT sub-agent inventory).** `B_demon_5flex` and `B_demon_3flex` were cap 0 red shadow records (backtest 2024-25 / 2025-26 after grader v3: -22 / +84 and -16 / +31) because certification was lost on PrizePicks' real Flex tiers; `W_coredemon_3power` was All-Star-week-only (-16.8 / -0.8 on v3); `A_core_5flex` was retired (58% identical to `A_wsteals`). This confirms the red state of `§T49.2`.
- 🔑 **Demon-1 units entered the 2-slip portfolio (owner decision 2026-10-22 14:38 PT).** `PORTFOLIO_UNITS` order: threes_D1 4-Flex, assists_D1 4-Flex (steals-free pool), rebounds_R 4-Flex, stocks_R 4-Flex, single points_R 3-Power, rebounds_R 3-Power; 2 slips a day, leg cap 2; backtest +49.0% / +56.3% ROI, max drawdown 21 / 11 units (2024-25 / 2025-26). The 2-4 pick Flex study behind it: `weighted:threes_D1` 4-Flex cap 2 (steals-included pool) +41.1% / +68.8%, halves +24.9 / +57.9 / +71.2 / +66.1, live 4 slips +262%; `weighted:assists_D1` 4-Flex cap 2 (steals-free pool) +48.0% / +44.1%, halves +20.9 / +76.2 / +21.3 / +70.0; both hold 4 of 4 halves. No 2-pick or 3-pick Flex composition holds out of sample.
- 🔑 **The demons were the cut slips.** The first two portfolio slips of 10-22 were same-game demon slips that PrizePicks CUT (quotes 6x against the backtest's 6.66x; 7x against 9x) while the screen showed PLAY. The owner asked at 14:53 PT whether a demon's payout is worth it and wanted easier legs; `research_pp_demon_value.py` (rule ANY / MAX1 / NONE on demon legs, 2 and 4 slips a day) and `research_pp_today_nodemon.py` (today's slips with no demon leg, 15:13 PT) were built; the verdict numbers are not in the sources read for this section (per the digest, not re-verified).
- 🔑 **Why demons were the trap on our own numbers.** Legs with final_hp at or above 0.58 hit 39.2% / 43.4% on demons (gap +0.19 / +0.18, every probe day 15-42%) while goblins were calibrated (hit 70.8% / 69.4%, gap -0.017 / -0.005). Detail in `NBA_BASELINE_CALIBRATION.md` `§T50.5`.
- 🔑 **Portfolio drift away from demons.** The 2026-10-23 portfolio (`P_wrebounds_4flex` + `P_cal_r70_3power`, standard lines of the 12 calibrated props with final_hp at or above 0.70) holds no demon. Portfolio B (owner 2026-10-25 12:45 PT, six units, one slip each, no caps, plan on 40-60% of the edge) has exactly one demon unit: the 6-Flex unit `P_B9_6flex` (R + demon, low-volume, EV >= 0.62, 2 per game, skip-top). Everything else in B is regular line. Backtest of B +92% (+82 / +101), max drawdown 15.0 units, 3.04 slips a day.
- 🔑 **Edge monitor and red demons.** Per `§T49.2b`, the monitor uses the code cap and so includes the red `B_demon` strategies and their shadow slips; the ledger notes that the monitor and hurdles do not yet cover the `P_` portfolio units.
- 🔑 **Demon pricing below 1.** Per `§T49.2b` four demons were priced 0.9675-0.9837 on estimated anchors and a floor at 1.0 was recommended; the T50 sources read for this section do not record that floor being taken (per the digest, not re-verified).

### T50.2.9 The quote gate (owner 2026-10-22 14:52 PT: "whatever shows there, I put ... don't let anything that's not allowed go on that screen")
- 🔑 **Rule.** `live_slip_engine.pick()` records 4 backup portfolio slips as `placed_backup`; `nba/apply_quote_gate.py` (step "Quote gate" of `nba-pp-payout-map.yml`, mode slipq) FAILS a slip with no quote, a status other than 200, a leg not on PrizePicks' board as built, no all-hit payout, or an all-hit payout below `pp_portfolio.quote_min_ratio` (0.95) x `build_slip_engine.pp_payout`. The first n passing slips are `placed`; a failed placed slip becomes `placed_quote_skip`. Slips screen v1.4.38 hides unquoted, failed and backup slips.
- ✅ **Certified** by dry run on 10-22 (both live slips FAIL on the ratio, 0 of 2 pass, nothing written) and by production `pick()` on 2025-11-15 and 2026-01-10 in a rolled-back transaction (2 placed + 4 backups a day, replaced strategies never staked, ledger restored). The rows of 10-22 were left as they were; the gate was live from the 10-23 P3.
- 🔑 **Consequence for demons.** Same-game demon slips, where our grader overpays, are exactly the slips this gate removes; under Portfolio B (no backups) a gated slip is simply skipped.

### T50.2.10 Older goblin and demon statements restated by the T50 sub-agents (TRANSCRIPT, 10-20 15:08 PT inventory)
- 🔑 **Goblin floor inconsistency.** The goblin floor factor is 0.6333 (1.9x, down from 2.08x / 2.1x); the map also calls 0.614 the deepest-goblin floor (goblins range 0.614-0.934) and `NBA_MULTIPLIERS.md` T23 item 10 says the floor is per stat and per league. ~~The two numbers are as written in the docs and were not reconciled.~~ -> Reconciled (T50 deep pass, 2026-10-26, by arithmetic from the inventory subagent's report): the floor factor 0.6333 (1.9x on a 2-pick; price version pp-leg-v2-sqrt-cap-conservative-floor190) is the real price floor; the conservative goblin margin of -3% turns it into 0.6143 (3 x 0.6143 = 1.843x), which is the "floor 0.614" of the tier map and the "never under 1.843x" audit check. The earlier floor 0.6933 (2.08x) times 0.97 gives 0.6725 (2.018x), the figure the correction note called optimistic. So 0.614 is the conservative image of the 0.6333 floor, not a second floor; `NBA_MULTIPLIERS.md` T23 item 10 (the floor varies by stat and league) remains the open question about the real floor itself.
- 🔑 **Conservative margins.** Goblins -3%, demons -7%, demons beyond the evidence -17%; simulated lines move against the pick; slip payouts are cut and rounded down. Fantasy score is priced by a different mechanism (fixed prices, moving lines; goblin 2.3x, demon 4.5-4.75x, priced conservatively 2.2 / 4.0).
- 🔑 **Goblins as a leg class.** Standalone negative everywhere (all-goblin 3-pick Power -86%); two goblins hurt every structure; as a 5th-leg extender the gain shrank from +148% to +51-55% under compression. Against PrizePicks' own implied probability every one of 88 goblin cells is positive at the top rank (e.g. pts_ast G2 top 1: 150 legs realized 0.840 against implied 0.735), but the price already takes it back. The one goblin-side class above every break-even in both seasons at PrizePicks' law is assists hard Less (UG1 Under, e 0.60-0.68, hit 0.42-0.50 at about 1.35-1.45x): as slips +17% to +42% (2024-25) and +56% to +99% (2025-26), but 2024-25 lb5 below 0 on 57-140 slips; live 3 legs, 1 hit.
- 🔑 **Demon facts restated.** Demon Power -100% out of sample; demon 4-Flex lower bound -13%; demon cells inconstant (41-51% of days); T+1 demon hit 32.9% needs factor 1.48x, T+2 21.3% needs 2.30x, T+3 14.8% needs 3.31x ~~against an observed ceiling of about 1.75-1.9x~~ (superseded in the same pass, 2026-10-26: that ceiling was an early-sample figure; on the system tier map demon prices average D1 1.44x, D2 1.71x, D3 2.43x, maximum 5.76x; see `§5.2` and `§T50.2-Z1`). Population: standard 359,147 legs at 48.8%, goblin 274,632 at 66.3%, demon 402,127 at 24.4%; EV must be computed per cell as the sum of w_i x p_i x m_i, never p-bar x m-bar.
- 🔑 **Tier-map engine cells.** Regular cells plus demons `threes_D1`, `assists_D1`, `rebounds_D3` and a goblin extender (G1 / G2 points family, top 1); tier-2 demons were tried and removed (pass 15). Cell evidence peak margins over tier break-even: rebounds D3 +0.031 / +0.028 (the demon that holds), points D1 +0.017 / +0.089 (top 2 only).
- 🔑 **Board count that moves the denominator.** On 2026-06-13 the PrizePicks board held Goblin 298 + Regular 172 + Demon 385 = 855 legs; the 10-20 board had 967 legs on a 3-game slate.

### T50.2.11 Calibration facts about goblin and demon legs from the 10-22 calibration program (detail in `NBA_BASELINE_CALIBRATION.md` `§T50.5`)
- 🔑 **Order is right, level is wrong.** The demon order against the same player's standard More is kept almost always (not an ordering bug); the demon top-end gap grows with distance from the standard line (D3 at +1 to +3: gap +0.31). On alternates the hit rate is set by the rung's distance from the standard, and our disagreement with the board counts AGAINST the leg (D2 top decile of disagreement hit 0.26 against 0.33; D3 0.18 against 0.21): the board knows news our ladder does not.
- 🔑 **Honest pools after calibration (legs at or above 0.58, graded history).** Demons D1-D3: 5,647 legs at 0.33-0.45 shrink to 23 legs. Goblins: G1 85,952 at 0.669 -> 104,476 at 0.657; G2 51,674 at 0.714 -> 67,624 at 0.698; G3 22,050 at 0.752 -> 26,203 at 0.744. Walk-forward 12 months: demons D2 2,988 at 0.455 -> 16 legs; D3 592 at 0.343 -> 5 legs; goblins G1 55,303 at 0.655 -> 67,190 at 0.649. Standard-line discrimination stays at AUC 0.53-0.54, so goblins carry the board.
- 🔑 **Books still add information at leg level.** The books' no-vig adds to live final_hp for standard (z +6.9 / +4.7), goblin (+3.8) and demon (+5.4) legs.
- 🔑 **One consistent leak.** Overs on goblin or demon lines are over-estimated in both seasons: combos and points Over goblins for a team on a back-to-back (-0.024 to -0.040), threes Over demons in December-January, assists Over demons on low totals, points Over demons as an 8+ favourite. Of 352 cells only 8 were consistent in both seasons.
- 🔑 **Board profiles.** Layer 2 searched 133,056 strategies per profile including single goblin / demon levels and Less: 0 of 375 profiles beat the all-slates picks in any structure (2P to 6F); battery 2 (36,288 goblin / demon level combinations) found 0 of 375 that work in the mixed read or any structure. Detail in `NBA_SYSTEM_DESIGN.md` `§T50.7`. Superseded in part by COMPASS fact 181 (profiles are season-agnostic and need not hold in both seasons); the holdout verdict of 10-25 00:10 PT leaves no per-profile strategy live.

### T50.2.12 Derived props on opening night (not a goblin / demon fact, recorded because the same sweep reported it)
- 🔑 **Derived props (`research_pp_derived_props.py`).** Season-start corrections per main prop: points 1.086, PRA 1.078, turnovers 1.115, rebounds 1.021, threes 1.033; corrected Under rates for personal fouls 0.63-0.66, free throws made 0.58-0.60, fantasy 0.54. They are hypotheses on 11-30 live lines each and certified only by grading archived boards forward; no goblin or demon rung is derived from them. Full list: `NBA_BASELINE_CALIBRATION.md` `§T50.5`.
- 🔑 **Not derivable:** dunks and two-player combos. Two-player combos and quarters are graded from 10-22 (`grade_board_outcomes.py`).
- 🔑 **Anchor status.** The market anchor is UNCERTIFIED against the 5-point sub-group bar (DraftKings only: worst -7.4 / +7.0 points on Under assists / Under threes; log-loss 0.633 -> 0.617 and 0.667 -> 0.649); it does not change a goblin or demon price, which comes from the rung ladder.


### T50.2-Z1. Deep-pass additions from the full-transcript re-read (2026-10-26): corrections to the old goblin / demon price claims, the goblin extender table and the certified ledger
- 🔑 **Provenance.** TRANSCRIPT, the long T50 inventory subagent (agent abd52c) that re-read the strategy file, payout findings and the docs, plus the earlier T50 inventory subagent of 10-22; the figures restate strategy sections 19-24 (dated 2026-09-30 and earlier). These are the agents' cross-checks against measurements already on file, applied here as in-place corrections.
- 🔑 **In-place corrections made by this pass.** (1) `§5.1` and its repeat in the `§7f` bullets: the "observed payout factors take 40-53%, so goblins are -EV at every tier" claim is struck and replaced by the measured factors. (2) `§5.2` and its repeat: the "about 1.75-1.9x observed ceiling, so demon T+2 and T+3 can never clear it" claim is struck and replaced by the system-tier prices. (3) `§T50.2.10`: the goblin floor 0.6333 vs 0.614 is now reconciled, and the demon-facts bullet no longer quotes the ceiling. The same two claims also sit in `NBA_MULTIPLIERS.md`, `NBA_GLOSSARY.md` (entry "demon") and `NBA_COMPASS.md` fact 61; those belong to other owners.
- 🔑 **Measured goblin factors (the evidence behind correction 1).** Goblin factors average G1 0.756, G2 0.698, G3 0.661 (cuts of 24%, 30% and 34%), range 0.614-0.934, universe average 0.724; the give-up allowed by the hit rates in the same table is 34% / 29% / 21%. Goblins therefore sit at about p x m 0.50 per leg by design (implied p x factor about 0.5). The correct reason they are closed as a standalone leg is that 0.50 is below the 0.55 per-leg bar of a 3-pick Power, and the all-goblin 3-pick Power result is -86.2%.
- 🔑 **Measured demon prices (the evidence behind correction 2).** On the system's tier map (910,513 legs) demon prices average D1 1.44x, D2 1.71x and D3 2.43x with a maximum of 5.76x; rebounds D3 is priced 2.20x per line (break-even 0.250) with hit 0.307 at n=4; the pricing engine allows up to 18.5x on a 2-pick (single-demon payout / 3 about 6.17). The break-even factors 1.48x / 2.30x / 3.31x belong to the offset tiers T+1 / T+2 / T+3, a different taxonomy from the system tiers D1-D3.
- 🔑 **Section 23a rule: the certified table is the source of every quoted number.** The first certified cell (steals R Under, score rank, top 1, 2025-26 from November), recomputed from the raw board, gives 149 days, hit 0.691, multiplier 1.000, 69% of days above break-even and +88 USD per 100 USD of 3-pick Power. The candidate matrix had said 73% and +126 USD on 128 days: it dropped the days where the cell's rank window fell short, which shrank the day set (128 vs 149) and lifted the average. On a top-1 cell, "days above break-even" equals the hit rate. The matrix finds candidates and is never quoted.
- 🔑 **Section 23b goblin extender table (150 real days; four Regular legs by score rank plus the top goblin by final-HP rank; ROI / share of days paid).** A 5 Regular, 5-Flex: +103% / 39%. B 4 Regular + 1 goblin, 5-Flex: +65% / 47%. C 3 Regular + 2 goblins, 5-Flex: +23% / 24%. D 4 Regular + 1 goblin, 5-Power: +148% / 20%. E 4 Regular, 4-Power: +109% / 22%. F 3 Regular + 1 goblin, 4-Power: +62% / 26%. G 3 Regular, 3-Power: +67% / 29%. The goblin turned 4-Power +109% into 5-Power +148% at 22% to 20% paying days; in Flex the goblin raised paying days from 39% to 47% at lower ROI. The goblin extends a winning Regular slip by one leg and never replaces a Regular.
- 🔑 **Further goblin edge rows (realised vs PrizePicks implied vs multiplier).** Points G1 top 2-3: 0.730 vs 0.630, 300 legs, multiplier 0.775. PRA G2 top 1: 0.793 vs 0.695, multiplier 0.705. Pts_reb G2 top 2-3: 0.803 vs 0.727, multiplier 0.671. Points G2 top 1: 0.800 vs 0.728, multiplier 0.672. Pts_ast G2 top 1: 150 legs 0.840 vs 0.735, multiplier 0.664. G3 cells 0.80-0.84 vs 0.74-0.78. Reb_ast G1 / points G1 top 4-10: 1,050 legs 0.68-0.69 vs 0.62-0.63, multiplier 0.77-0.78.
- 🔑 **Section 24a certified ledger (raw board, outcome, current per-line price, ranks).** Profit is the expected USD per 100 USD of 3-pick Power from the cell's legs alone (6x with the 0.95 haircut, real hit, real multiplier). Format: 2025-26 (from November) hit / share of days above break-even / profit, then 2024-25 (full season, the stress case). Steals R Under, score top 1: 0.691 / 69% / +88, then 0.541 / 54% / -10. Steals R both, top 2: 0.654 / 46% / +60, then 0.588 / 33% / +16. Turnovers R, top 3: 0.633 / 69% / +44, then 0.581 / 66% / +12. Stocks R, top 5: 0.613 / 73% / +31, then 0.574 / 66% / +8. Pts_ast R, baseline top 3: 0.611 / 71% / +30, then 0.547 / 58% / -7. Points R, top 5: 0.608 / 68% / +28, then 0.546 / 57% / -7. PRA R Under, baseline top 1: 0.640 / 64% / +49, then 0.512 / 51% / -23. Blocks R, top 1: 0.595 / 59% / +20, then 0.559 / 56% / -1. Pts_reb R, top 5: 0.576 / 69% / +9, then 0.547 / 58% / -7. Rebounds R, baseline top 5: 0.574 / 66% / +8, then 0.562 / 64% / +1. Reb_ast R, baseline top 3: 0.556 / 61% / -2, then 0.553 / 60% / -4.
- 🔑 **Section 24a, demon and goblin rows.** Threes D1, top 2: 0.631 (0.473 x 1.33) / 73% / +43, then 0.588 (0.392 x 1.53) / 65% / +16. Assists D1 Over, top 2: 0.588 (0.470 x 1.26) / 73% / +16, then 0.695 (0.469 x 1.50) / 73% / +91 (PrizePicks cut the multiplier 1.50 to 1.26). Rebounds D3, top 3: 0.606 (0.313 x 1.96) / 60% / +27, then 0.387 (0.189 x 2.19) / 38% / -67. Assists D3 Over, final-HP top 3: 0.594 / 55% / +19, then 0.482 / 51% / -36. Points D3 / D2 and rebounds D1: +12 / +6 / +9 in 2025-26, then -43 / -17 / -27. Goblins (top 1-2): hit 0.69-0.85, 51-85% of days, -1 to -22, then -4 to -26.
- 🔑 **Certified reading of the ledger.** Four Regular cells and two demon cells are positive in both seasons (turnovers R, stocks R, steals R top 2, rebounds R thin, threes D1, assists D1). The rest of the Regular core is positive in 2025-26 and within 10 USD of break-even in 2024-25, consistent with a ranker retrained on both seasons, so 2024-25 is the floor and not a different regime.

### T50.2-Z2. Deep-pass additions from the full-transcript re-read (2026-10-26): the final-HP cell ledger, ladder families, the basis of the Less pricing and the simulator validation
- 🔑 **Provenance.** TRANSCRIPT, the long T50 inventory subagent (agent abd52c) restating strategy sections 19l-19o (2026-09-30) and `PP_PAYOUT_FINDINGS.md` (2026-09-21 WNBA / NBA runs, 2026-09-22 simulator validation). Figures exactly as the agent listed them; the figures are on file in those repo files as well.
- 🔑 **Final-HP cell ledger, classes over all 59 cells (strategy 19l-19o).** GOLD 9 (all Regular: steals, pts_reb, turnovers, pts_ast, points, stocks, blocks, rebounds, reb_ast; the top-5 beats its break-even on 61-73% of real days). Above break-even in both seasons but inconstant 9 (threes D1, points D2, assists D1, rebounds D2, pts_ast D2, pra G2, pra G3, points D3, assists R). Above break-even in 2025-26 only 13 (including pra R: +0.070 and 69% of days in 2025-26, but -0.005 in 2024-25). Within 0.05 of break-even and held for the signals phase 21. Below and dropped 7 (threes G1, assists G1, assists G3, pts_reb G3, rebounds G2, rebounds G3, assists G2).
- 🔑 **Cell margins over the tier's own break-even, with depth = last positive n (2024-25 / 2025-26).** Steals R +0.058 (6) / +0.104 (17); points R +0.067 (12) / +0.090 (25); stocks R +0.051 (13) / +0.066 (13); turnovers R +0.016 (9) / +0.098 (18); pts_ast R +0.025 (19) / +0.097 (22); pts_reb R +0.007 (14) / +0.103 (25); rebounds D3 +0.031 (4) / +0.028 (24), the demon that holds; rebounds R and reb_ast R thin (both +0.016); points D1 top 2 only (+0.017 (2) / +0.089 (8)). Pooled over both seasons: steals R +0.070 (15), points R +0.065 (25), stocks R +0.063 (13), turnovers R +0.053 (15), pts_ast R +0.041 (19), rebounds D3 +0.028 (24), pts_reb R +0.026 (22), points D1 +0.049 (2). Three bands are positive in 2025-26 only: pra R (-0.005 in 2024-25), rebounds D2 (-0.003) and pra G2 (n=1, -0.004).
- 🔑 **Corrected gold bands (2025-26 from November; break-even per leg from its own current price; % days = share of real days the top-5 beat p_be).** Format: peak n, hit, margin, positive to n, % days. Steals R: 2 / 0.661 / +0.111 / 17 / 73% (break-even 0.550). Pts_reb R: 1 / 0.660 / +0.110 / 25 / 69%. Turnovers R: 2 / 0.654 / +0.104 / 17 / 68%. Pts_ast R: 1 / 0.647 / +0.097 / 23 / 67%. Points R: 3 / 0.624 / +0.074 / 25 / 69%. PRA R: 2 / 0.620 / +0.070 / 25 / 69%. Stocks R: 3 / 0.616 / +0.066 / 14 / 71%. Blocks R: 1 / 0.588 / +0.038 / 6 / 66%. Rebounds R: 6 / 0.578 / +0.028 / 25 / 63%. Reb_ast R: 4 / 0.577 / +0.027 / 25 / 61%.
- 🔑 **Demon bands are inconstant (41-51% of days).** Pts_reb D1: price 1.33, p_be 0.415, +0.117 at n=10, 41% of days. Threes D1: 1.34 / 0.410 / +0.061 / 45%. Points D2: 1.22 / 0.449 / +0.057 / 41%. Rebounds D3: 2.20 / 0.250 / +0.045 / 49%.
- 🔑 **Rule from the ledger: the break-even of a demon tier moves between seasons.** PrizePicks lowered demon payouts as ladders expanded (points D1 1.46 to 1.22, rebounds D2 2.29 to 2.02) while Regular stays at 1.00 and goblins stay about flat, so the live gate must re-read the tier prices rather than reuse last season's.
- 🔑 **Ladder families on the PrizePicks board (WNBA + NBA, 2026-09-21).** Family A, formula ladders (Points, Rebounds, Assists, 3PM, PRA, P+R, P+A, R+A): several goblins and demons, formula price capped at 18.5x, in the archive. Family B, fixed three-rung (Fantasy Score, FG Attempted, 3-PT Attempted): one goblin and one demon placed symmetrically, near-fixed prices (Fantasy Score 2.3x / 4.5-4.75x). Family C, alternates only with no standard line (Turnovers, Blks+Stls, Offensive Rebounds): WNBA goblins 2.4-2.8x, demons 3.25-3.75x. Family D, standard only with factor 1 (FT made / attempted, FG made, defensive rebounds, two-player combos). The nearest demon never pays under 3.25x on any family. Note: the archive's NBA board has no alternates for blocks, steals, blocks+steals or turnovers (`PP_PAYOUT_FINDINGS.md`).
- 🔑 **Basis of the Less pricing (WNBA run 2026-09-21, 250 legs quoted More and Less back to back).** Goblins on Less paid 3.5-4.75x and demons on Less 1.7-2.8x, every such quote is_adjusted. P(More) + P(Less) had a median of 0.978 (144 demon legs) and 0.986 (106 goblin legs). The NBA points-family formula (c 1.87, P(Less) = 1 - P(More)) priced 107 Less legs with 4.7% mean error, 91% within 10%, median ratio 1.02. Favourites floor at 1.7x (factor 0.5667): 28 of 36 legs whose complement fell below 1.7x paid exactly 1.7x; Less longshots (goblins on Less) paid 3.25-8.0x and the 18.5x engine cap was not reached. This is the measurement basis behind `§T50.2.1` and `§T50.2.2`; the 10-20 board then confirmed Less live.
- 🔑 **Less pricing mechanics from the same run.** Price-table primary keys now include side (a Less row sharing run, projection and partner with its More row had been dropped silently). Floors are side-aware: the goblin floor applies on More only, `less_favorite_floor_factor` defaults to the goblin floor so older versions reproduce exactly, and pp-leg-v2-sqrt-cap carries 0.5667. At that date there were 0 NBA alternate-on-Less keys and 799 standard-on-Less keys priced at factor 1; the refresh function produced 0 new prices over 9,036 keys.
- 🔑 **Validation of `simulate_slips` (2026-09-22).** Strategy `std3_power_130` (real standards, value at least 1.30, 3-pick Power) reproduces the independent window-line replay: 2024-25 +10.2% +/- 6.3% (1,971 slips; replay +10.1%), 2025-26 +20.4% +/- 5.3% (2,408 slips; replay +18.0%), both seasons +15.8% +/- 4.1% (4,379 slips, 310 nights, t 3.85). Every slip priced at exactly 6.0x; 312 void legs were graded by the reversion rule; the test week had 3 legs from 3 games in every slip, payouts only 0 / 3.0 / 6.0, and model EV exactly 6 x the product of the legs' probabilities. Claimed payout 2.33 per unit versus realised 1.16: the model is overconfident and the edge comes from ranking. The Pritchard P+R standard 28.5 was checked against the raw board (genuinely the standard; goblin ladder 23.5 / 24.5, demons 34.5 / 39.5).
- 🔑 **Mixed-slip void reversion, already recorded.** The match rates 99.5% / 96.6% / 91.3% and the keep-lowest conclusion are in the older `0j-T24` and reversion tables above; the 5-left case (57.5% match, ratio 1.019, because the old multi-alternate law ran low) and the 1-left case (1.5 x factor runs about 6% under PrizePicks) are the two additions from the agent's report (2,662 stored reversion schedules).

## 🆕 §T49.2b — **`T49` TRANSCRIPT BATCH: DEMON AND GOBLIN FACTS FROM THE `10-15` FULL-PASS AGENTS AND THE `10-16` TRANSCRIPT** *(qualifies `§T49.2`)*

- 🔑 **C2 evidence (2026-01-14 PrizePicks legs).** 1,273 goblins (average factor 0.73) and 1,752 demons (average factor 2.003); 1,184 goblins show positive edge and 1,173 of those sit below 0.56/f; 282 demons show negative edge but sit above 0.56/f; the default top-200 board was 200 of 200 goblins, average shown edge +19.3, 197 below break-even.
- 🔑 **Demon pricing below 1.** Four demons priced below 1 on the 10-13 window (factors 0.9675–0.9837), all on estimated anchors; 386 legs on the 10-20 board sit on estimated anchors; a floor at 1.0 was recommended, not taken.
- 🔑 **Red demons in the monitor.** The edge monitor's portfolio uses the code cap, so it includes the red B_demon strategies and their shadow slips (six B_demon_5flex shadow slips on a 3-game slate in the 10-20 rehearsal); demon legs are 27.7% of the reference legs (7,171 of 25,907).
- 🔑 **State at 10-16 15:50 PT.** B_demon_3flex `red`, cap 0; the red state existed only as database rows until the release-record fix. Backtest at the engine's staked phases: B_demon_3flex 2025-26 +30.6% (the +42.4% in `NBA_BASELINE_CALIBRATION.md` `§T49.5` includes the unstaked final week).

## 🆕 §T49.2 — **`T49` (`2026-10-10 → 10-16`): THE DEMON FLEX STRATEGIES ARE RED, THE PARTIAL TIERS ARE FLAT, AND HOW A RED DEMON COMES BACK** *(source `T49`: certification ledger "PAYOUTS PROVEN APP BY APP", "FULL PASS 2026-10-15", "THE DECISIONS, GROUNDED"; `NBA_COMPASS.md` facts `151`, `158`, `159`; strategy `§31ad`, `§31af`; **AS STATED, no transcript**; full law and numbers in `NBA_MULTIPLIERS.md` `§T49.3`)*
- 🔴🔑 **What changed for goblins and demons.** In a PrizePicks Flex slip that carries alternates (goblin or demon rungs) the partial-hit tiers are nearly flat in the factor product and only the all-hit tier rises faster than FLEX x fp. The old certified grader scaled every tier by the factor product, so a Flex slip with demons was paid 2–5x too much on its one- and two-miss tiers, and the demon strategies earned most of their money there (B_demon_3flex 2024-25: 79% from the one-miss tier). The one grader is now the quote-derived envelope (`pp_slip_rules['flex_alt_tiers']`, `nba_market.pp_flex_alt_payout()`).
- 🔴 **Verdict.** B_demon_3flex `-16%` / +31% and B_demon_5flex `-22%` / +84% (2024-25 / 2025-26; were +52 / +90 and +70 / +204): the weaker season is negative, so BOTH demon Flex strategies are **red / cap 0** by hand with the reason on the row; the 10-15 full pass found their old caps 9 / 6 still in code and in `pp_strategies` and set them to 0 in the engine and in `nba_main_ui.pp_strategies`, and the late-March raise now requires cap above 0. Power slips with alternates are unchanged (the conservative Power price is never above the quote on 48 of 48 mixed live quotes). The weaker-season ROIs also appear at live cap in the double check: B_demon_3flex `-19.4` / +42.4, B_demon_5flex `-24.4` / +88.9 (`NBA_BASELINE_CALIBRATION.md` `§T49.5`). The demon 3-Power W_coredemon_3power stays a pre-break All-Star plan member (x1; +18 / +18 positive in both seasons pre-break).
- 🔑 **How a red demon returns.** Not through the old validator-only path. A red strategy keeps building and grading shadow slips; P5 releases it to PAPER when its own season record's day-blocked lower bound is above 0 on 40 days or more, and a cap-0 red comes back at `RELEASE_CAP` 1 — never at its old cap (certified on the wrong Flex tiers). Clean release (10 clean slate evaluations to yellow) never applies to a cap-0 strategy or a red set on a failed certification. Proof (rolled back): the real B_demon_5flex slips of 2025-11 to 2026-02 replayed one year later as graded shadows: 86 days, lower bound `-59%`, stays red (correct). Detail: `NBA_SYSTEM_DESIGN.md` `§T49.7`.
- 🔑 **A Flex-aware demon leg ordering was tested and NOT adopted** (V2 Flex demon value, portfolio +35.1% / +65.3% against +28.5% / +71.0%): it fails the both-seasons rule. It would have lifted C_wstocks_4flex's weak season (+27.8%) but not the portfolio.
- ⚠ **Scope note.** The pricing model per leg is conservative on average (goblins 0.97x, demons 0.93x of the quote) but about 11% of legs sit more than 2% above it (max +17%); a goblin-plus-demon 3-Power mix is priced above the quote in 8 of 24 cases (1.10x) — no live strategy builds that composition.