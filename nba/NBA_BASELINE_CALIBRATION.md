# NBA BASELINE CALIBRATION

**Scope.** Everything governing the **baseline hit probability** — the classification/baseline
pipeline. Formulas, tiers, granulation, lifts, penalties, caps, shrinkage, distributions, calibration
and the evidence behind each. The final scoring engine (final HP, confidence, score) is a separate
document: `NBA_FINAL_SCORING_CALIBRATION.md`.

**Source of truth in code**: `nba/backtest/classification_ladder_v12.py` (now v18) —
*"single source of truth; anchors assert."* Production builders are **patchers** over it.

**Update log**
| Date | What |
|---|---|
| 2026-09-20 | Created. Material from T4 (methodology), T7 (design + live code), T8 (calibration), T9 (factor layer, periods, combos). |

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

### 3.7 Shrinkage
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

### 3.8 Distribution — empirical first, with a hierarchical fallback
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

**This is a named guard NBA does not have.** The as-of calibration refits weekly and applies
`log_odds_shift` automatically; **no magnitude sanity check on the fitted shift is recorded.**

**It pairs directly with the over-flattening concern** (OPEN_ITEMS): a calibrator that is
*"flattening too much"* and one producing an *"implausibly large correction"* are **two failure modes
of the same automated fit**, and both are caught by inspecting the magnitude of the shift rather than
only its statistical validity.

**`final_hp` retains `p_raw` alongside the calibrated value**, so the magnitude of every applied shift
is inspectable per row.

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
**Platt is fit on the season's prior months** (production `asof_lag: 0 days`).
**⚠ Gate**: needs **n≥1,000 per cell**; the ELITE rebounds band has **699**.

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

### 5.1 The permanent rules

**① A band cell is kept ONLY if its sign is consistent across seasons.**
Rebounds ELITE under-projected in both → **structural**, kept. 3PM mid-bands **+2.8 / −3.6** →
**regime**, dropped (*"frozen cells actively hurt"*); walk-forward tables + in-season Platt carry it.

**② Rung-aggregates hide errors.** *"The first leg-level breakdown exposed structured misses that had
**cancelled out in the averages**."* A ladder accurate to 1 pp can hold a +5.4 and a −3.5 band.

**③ No pasted constants.** HCA, `P(blowout|spread)` and the blowout ratios are **derived from TRAIN
inside the run**. `baseline_ladder_runs.factor_fits` / `.role_minutes_multiplier` store what each run
derived.

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
</content>
</parameter>
<parameter name="message">docs: NBA baseline calibration - dedicated file per owner mandate