# NBA FINAL SCORING ENGINE CALIBRATION

**Scope.** Everything governing the **final** numbers — final hit probability, confidence, score and
edge — i.e. the enrichment layer and the scoring engine that sits on top of the baseline.
The baseline's own calibration is a separate document: `NBA_BASELINE_CALIBRATION.md`.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T4/T7/T8 (the two-layer contract), T9 (factor-layer size), T15–T16 (factor gates, blowout, matchup) and the live session (final HP, confidence v3, the enhancing score, as-of calibration parity). |

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

**Output**: `nba_score.final_hp` — **38,686,696 rows**, both seasons, 30 props.
`season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor, baseline_hp,
final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality, c_market, prop_tier,
band, phase, n_uncertain, built_at`.
**UNIQUE `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.

---

## 2. THE TWO-LAYER CONTRACT

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

## 5. CONFIDENCE — a data thermometer, not a probability

### 5.1 The principle
> **Confidence measures EPISTEMIC uncertainty only — our ignorance. The HP already states the
> aleatoric coin-flip.**

**A coin flip with perfect data should score HIGH confidence and 0.5 HP.** Any model that conflates the
two is wrong — which is exactly how the conformal attempt failed.

### 5.2 The measured deduction model — `nba_score.confidence_model`
**10 factors. Base 99, floor 55.** Starts at 99 and **deducts for named deficiencies**, with weights
**measured from realised-gap separation**.

| Factor | Budget |
|---|---|
| **`f_role`** | **55.6%** |
| eight others | **5.6% floor each** |
| **season phase** | Oct-Nov **0.80** · Dec-ASB **1.00** · post-ASB **0.88** · push **0.92** |

**Why `f_role` dominates**: **fringe players miss by 0.0283; iron-men by 0.0008 — a 35× gap.**
Those are the bottom and top bands of `ROLE_TIERS`.

**Mean confidence 0.92–0.95.** Per-leg factors (`f_role`, `f_prov`) are real, read from
`baseline_history` — **not placeholders**.

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

## 7. THE ENRICHMENT FACTORS — ten tested, none survived

**`nba_score.factor_gate_results`**: `season, slice, model, n, log_loss, brier, gain_vs_anchor,
shrink_beta, run_at`. **Every verdict lands in the database** — *"a verdict that only exists in stdout
is not a verdict."*

| Factor | Verdict |
|---|---|
| **A2 — teammate redistribution** | **five panels failed, then RETRACTED** — *"the certified anchor wins every slice, **and worst where the mechanism predicted it should win**"* (COMPASS 91) |
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

Every enriched leg carries a structured record of what was applied to it:
```json
{"prop_side": "more",
 "board_line_value": 0.5,
 "log_rate_adjustment": 0,
 "rate_multiplier": 1,
 "confidence_adjustment": 0,
 "factors_applied": 1,
 "breakdown": "[{\"factor_key\":\"player_availability\",\"status\":\"applied\",\"cell_id\":null,\"contribution\":…}]"}
```

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

## 8. THE TWO NON-NEGOTIABLE FACTORS THAT DID LAND

### 8.1 Blowout — on the REAL market spread
Upgraded from the **r=0.46 derived proxy** to the **real market spread** (307,604 rows, 2,454 games,
100% coverage).
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

### 13.1 It must be a **DAY-LEVEL BLOCK BOOTSTRAP**
> *"The current, more rigorous standard **beyond a simple weighted t-test**: a **DAY-LEVEL BLOCK
> BOOTSTRAP**. **Resample entire DAYS with replacement — NEVER individual legs, which would
> reintroduce the same-day correlation problem** — rebuild the aggregate… and **repeat this thousands
> of times** to build a real distribution of outcomes."*

**⚠ The resampling unit is the DAY, not the leg.** Legs on the same slate share game scripts,
blowouts, pace and officiating — resampling legs treats correlated observations as independent and
**inflates the apparent sample**, which is the exact error the gate exists to prevent.

**And the weighted t-test is explicitly named as insufficient**: *"doing this [correlation handling]
incorrectly can produce a wrong answer in either direction."*

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
| 10 | **Day-level block bootstrap** — resample days, never legs | T1 |
| 11 | **All three bootstrap conditions**, incl. leave-one-day-out | T1 |
| 12 | **`p × m` house-edge sanity test** | T1 |
| 13 | **Confidence-tier every record** — don't let one-offs harden | T1 |

**Items 1–9 gate a FACTOR. Items 10–13 gate a STRATEGY.**
**Nothing in the current system has been through 10–13**, because the slip-strategy phase has not
begun — and that is correct sequencing, not an omission.

---

## 14. THE RESEARCH STANDARD — all 26 lessons *(T1, `NBA_LESSONS_LEARNED_FROM_MLB.md`)*

**The handoff calls this document *"the single most important document in this transfer package — a
research standard built the hard way, across dozens of strategy candidates, almost all of which looked
real at first and were later found to be artifacts."*** The startup plan requires *"the full 16-item
standard… **from the very first candidate**, not as a later addition once shortcuts have already been
taken."*

| # | Lesson |
|---|---|
| **1** | **The fair-odds gate — apply FIRST, before any hit-rate analysis** (`p × m`; see `NBA_MULTIPLIERS.md` §0.3) |
| **2** | **Never apply a tier/pool-level multiplier to a heterogeneous population** — MLB's costliest error; use `Σ wᵢ(pᵢ·mᵢ)` per cell |
| **3** | **Multiple, genuinely DIFFERENT research passes per candidate** — *"not the same query with a different threshold"* |
| **4** | **Gemini as a genuine ADVERSARY, not a rubber stamp** — *"asked to SET ITS OWN [test/criteria]"* |
| **5** | **The three-check discipline on every number before reporting it** — (a) correct lane/join, (b) …, (c) … |
| **6** | **Statistical significance done properly — DAY-LEVEL clustering, not pooled-leg-level, AND properly volume-weighted** |
| **7** | **Multiple-comparisons correction, scaled to what was ACTUALLY SEARCHED** |
| **8** | *(sequence continues)* |
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

### The ones this project has already proved the hard way
- **#2** → the phantom-edge risk in the goblin/demon economics (`NBA_GOBLIN_DEMON.md` §5.0)
- **#6** → the day-level block bootstrap (§13.1) — *resample days, never legs*
- **#11** → **A2**: a plausible causal story (Wally Pipp) that failed every test
- **#13** → **directional but not proportional** is why the market is *"a confidence adjuster and
  ranking signal, not ground truth"* (COMPASS 62)
- **#14** → the fantasy-scale check across all three apps
- **#20** → `gain_vs_anchor` — success measured against **not having the factor at all**
- **#24** → goblin/demon mechanics transferred to NBA; **tier count and spacing did not**
- **#26** → the two-observation Flex partial tiers, correctly hedged

**#7 (multiple comparisons) and #17 (report the range) are the two with no visible NBA implementation**
— worth checking when the factor-gate results are next reviewed, since the gate scanned many
prop × band × side cells.

---

## 15. WHERE EDGE IS NOW EXPECTED TO COME FROM

### ⚠ 15.0 THE PRIOR THAT SHOULD FRAME EVERY EDGE CLAIM
**MLB confirmed a large structural mispricing and never harvested it** (lesson #13):
> *"the Goblin/tiered-pricing mechanism moves its payout only a **small fraction** of what
> proportional pricing would require — **roughly a 15% multiplier change for a ~2.6× true-probability
> gap**… **but MLB never found a way to IDENTIFY IN ADVANCE which legs sit on the high-probability
> side; every walk-forward selection attempt (raw trailing hit rate, model-probability quintiles,
> appearance frequency) REGRESSED TO THE POOL AVERAGE.**"*

**The mispricing is not the hard part — SELECTION is.** And **everything in this document is selection
machinery**: the calibrated ladder, the per-band cells, the confidence model, the factor gates.

**The one asset MLB's failures lacked**: a **calibrated** probability — *"when the recipe says 75%,
roughly 75% hit, on every band, both seasons, out of sample."* **MLB's failed attempt used
model-probability QUINTILES; whether a calibrated probability succeeds where an uncalibrated ranking
regressed is the open empirical question.**

**This reframes §12 entirely.** T9's prediction split one-for-one (combos delivered, enrichment did
not), leaving calibration + combo structure + the tails. **Lesson #13 says the tails hold a confirmed
structural mispricing — and that MLB could not convert it.** So the standing hypothesis is precise:
**a calibrated ladder is the selection tool MLB never had.** Unproven, with one strong prior against.

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
</content>
</parameter>
<parameter name="message">docs: NBA final scoring engine calibration - dedicated file per owner mandate