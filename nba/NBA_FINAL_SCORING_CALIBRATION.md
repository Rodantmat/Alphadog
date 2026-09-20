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