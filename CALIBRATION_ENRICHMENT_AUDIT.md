# AlphaDog — Calibration & Enrichment Factor Audit (Real Findings From Transcript Sweep)

This document captures a real, extensive audit session found via transcript sweep
(`2026-08-20-03-11-37-alphadog-v2-aug20-calibration-audit-enrichment-fixes.txt`) that directly
answers the "enrichment and baseline factors dissection" and "hit probability calibration"
items from the original documentation request. Every fact below is either a direct quote of
real code found in that session, a real number from a real query result, or a real, stated
conclusion — nothing here is inferred or reconstructed from summary alone. This complements,
rather than duplicates, `CORE_LOGIC_CALIBRATION_DOSSIER.md` (which covers the baseline
shrinkage/tier system) and explicitly fills the gap that document flags in its own §9 (the
enrichment-factor layer).

---

## PART 1 — WHY THIS AUDIT HAPPENED: GEMINI'S INDICTMENT OF THE CALIBRATION METHOD ITSELF

Before any specific bug was found, a real Gemini consultation was run specifically questioning
whether the deployed calibration TECHNIQUE was sound at all — not just whether individual
numbers were right. Gemini's verdict, quoted verbatim from the real response:

> "This is not calibration—it is using a lookup table to mask severe, structural base-model
> failures. Applying additive post-hoc shifts of 20 to 30+ percentage points to a probability
> model does not fix the model; it creates a fragile, overfitted system that will likely lose
> money in production."

Specific, concrete failure modes it identified in the (then-deployed) additive-histogram-
binning approach:
- **Discontinuities**: a raw probability of 9.9% (falling in one bin) could receive a +32.6
  percentage-point correction, while 10.1% (falling in the next bin over) might receive a much
  smaller one — a 0.2-point change in input causing a massive, discontinuous jump in output.
- **Non-monotonicity**: a genuinely higher raw probability could end up mapped to a LOWER
  calibrated probability than a lower one, which is a real, direct violation of what a
  calibration function should ever do.
- **Boundary violations**: additive shifts could push results outside the valid 0-100% range
  entirely.

On the specific real example that triggered this (a `doubles` prediction of 5% against an
actual 37.6%, n=481) Gemini's verdict was blunt: **"the underlying base model is fundamentally
broken."** A greater-than-7x scale error is not something a lookup-table patch should paper
over — it's a sign the base probability model has a real, structural bug that needs fixing at
its source.

**This directly triggered the real, rigorous replacement work in Part 2.**

---

## PART 2 — THE REAL PLATT-SCALING REPLACEMENT (properly-fit, not additive-binning)

Rather than the rejected additive-bin approach, a real weighted logistic regression (Platt
scaling) was fit per prop/side, transforming raw probabilities to logit space, fitting
`A * logit(raw_p) + B`, then transforming back — a real, continuous, monotonic-by-construction
function rather than a discontinuous lookup table.

**Real, complete fit results, all 11 prop/side combinations tested**:

| Prop/Side | A | B | n | Max shift | Monotonic | Deploy decision |
|---|---|---|---|---|---|---|
| total_bases/less | 0.711 | 0.082 | 5,218 | 0.090 | yes | **DEPLOYED** |
| hits_runs_rbis/more | 1.071 | -0.004 | 1,652 | 0.016 | yes | **DEPLOYED** |
| hits/less | 0.965 | -0.179 | 2,604 | 0.047 | yes | **DEPLOYED** |
| fantasy_score/more | 0.943 | 0.153 | 1,262 | 0.044 | yes | **DEPLOYED** |
| runs/less | 1.243 | -0.213 | 2,097 | 0.080 | yes | **DEPLOYED** |
| singles/less | 0.706 | 0.015 | 1,780 | 0.080 | yes | **DEPLOYED** |
| walks/less | 0.621 | 0.206 | 2,135 | 0.145 | yes | **DEPLOYED** |
| doubles/less | -0.027 | 1.711 | 1,601 | 0.807 | no | REJECTED - non-monotonic |
| fantasy_score/less | -0.245 | 0.013 | 978 | 0.626 | no | REJECTED - non-monotonic |
| hits_runs_rbis/less | 1.807 | -0.492 | 5,585 | 0.184 | yes | REJECTED - shift too large despite passing monotonicity |
| rbis/less | 0.241 | 0.633 | 2,335 | 0.431 | yes | REJECTED - shift too large |

**7 of 11 deployed, 4 correctly rejected.** The rejection logic is itself real and worth
preserving: `rbis/less`'s real underlying data showed the raw model was ALREADY reasonably
well-calibrated (empirical hit rate stayed flat in the 68-73% range across a wide span of raw
predicted probabilities) - fitting a large correction there would have been overfitting to
noise, not fixing a real problem. This is a concrete, real example of a calibration audit
correctly declining to "fix" something that wasn't actually broken.

**Standing methodological rule this establishes for any future calibration work**: fit
real, continuous transformations (Platt/isotonic/beta), always check monotonicity and maximum
real shift magnitude before deploying, and be willing to reject a fit - even a
"statistically valid" one - if the resulting real-world shift is implausibly large (as with
`hits_runs_rbis/less` and `rbis/less` above, both of which passed the monotonicity check but
were still correctly rejected for producing shifts too large to trust).

---

## PART 3 - THE ENRICHMENT LAYER: DIRECT PROOF OF WHERE MISCALIBRATION ACTUALLY LIVES

A real, dose-response analysis was run across 26,000 real graded legs, splitting by how much
the enrichment layer moved the final probability away from the baseline:

| Enrichment level | n | Predicted HP | Actual hit rate | Overconfidence gap |
|---|---|---|---|---|
| Baseline-dominated (multiplier around 1.0) | 14,430 | 61.1% | 60.1% | +1.0pt - essentially well-calibrated |
| Moderate enrichment | 9,804 | 68.3% | 66.1% | +2.2pt |
| Heavy enrichment (multiplier far from 1.0) | 1,706 | 75.8% | 70.3% | **+5.5pt** |

**This is a clean, real, direct dose-response relationship**: the baseline model (shrinkage,
recency, tiers - the system documented in `CORE_LOGIC_CALIBRATION_DOSSIER.md`) is essentially
fine on its own. The overconfidence problem scales directly and specifically with how hard the
ENRICHMENT layer moves the number away from that baseline. This single finding is the reason
the rest of this document exists - it redirected the entire audit from "recalibrate the
model" to "find and fix the specific enrichment factors causing this."

### 3.1 Real, specific enrichment bugs found and fixed, in the order discovered

**Bug 1 - `catcher_framing`: season total used as a per-game rate (no normalization)**

Root cause, found in `alphadog-v2-phase2a-run-environment.js`:
```js
catcher_framing_runs_per_game: catcher.framing_runs_total ?? null
```
The source field is literally named `framing_runs_total` - a season-cumulative statistic
(real range roughly -15 to +20 across a whole season) - assigned directly into a context field
named "per_game" with **no division by games caught anywhere in the code**. This meant a
catcher's entire season framing value was being used as if it were a single game's
contribution. **Real, concrete impact measured on a live leg (pitcher Drew Rasmussen)**:
`catcher_framing` alone contributed +0.301 in log-space - dwarfing every other factor on that
leg combined (the next-largest, `umpire_tendency`, was only -0.0344). This one factor was
responsible for almost the entire 1.306x multiplier on that leg, and per the enrichment
factor registry, `catcher_framing` had `missing_data_worst_case_penalty_cap: 0` and **no
cell-level cap at all** - a genuinely unbounded factor. This was the real root cause of a
measured 22.8-point overconfidence gap on `pitcher_strikeouts/more` (predicted 53.5%, actual
30.8%, n=65 real heavy-enrichment legs) - the single worst gap found in the initial scan.
**Fix deployed**: switched to a normalized, games-caught-divided field, z-score scaled.

**Bug 2 - `weather_wind`: uncapped extreme cells**

`weather_wind`'s cell table had genuinely uncapped values at its extremes, unlike every other
factor in the same table (which all had defined caps). Gemini's concrete example: on a
`home_runs` leg with 4 plausible factors firing together (strong wind, temp/altitude, park
factors, weak opposing pitcher), the combined multiplier reached **4.97x**, turning a 3.0%
baseline home-run probability into 14.91%. **Fix deployed**: all 30 `weather_wind` cells capped
at 0.35 (matching the factor's own already-documented intended bound elsewhere in the system).
The worst real case (`home_runs`, `blowing_out_strong` wind) dropped from an uncapped 2.23x
single-factor multiplier to a bounded 1.42x maximum.

**Bug 3 - Macro-environment multicollinearity: the same signal counted multiple times**

Gemini identified, and real live data confirmed, that `market_implied_total`, `park_factors`,
`weather_wind`, `weather_temp_altitude_pressure`, and `opposing_pitcher_quality` all correlate
with the same underlying "favorable scoring environment" signal - Vegas totals already price
in park effects, weather, and altitude, so multiplying all of these together as if they were
independent double- and triple-counts the same real information. **Real, direct confirmation
on live legs**: Griffin Conine's leg had 7 of these correlated factors firing simultaneously,
compounding to 1.63x; Zac Veen's had 6, compounding to 1.62x. A direct predicted-vs-actual
check on `total_bases/more` heavy-enrichment legs showed the real damage:

| Predicted (decile) | n | Predicted rate | Actual hit rate | Gap |
|---|---|---|---|---|
| ~13.9% | 30 | 13.9% | 6.7% | +7.2pt over |
| ~26.7% | 18 | 26.7% | 5.6% | **+21.2pt over** |
| ~63.9% | 40 | 63.9% | 45.0% | **+18.9pt over** |

**Fix deployed**: replaced naive multiplicative/additive stacking of this correlated cluster
with **RSS (root-sum-squares) aggregation** - a real, principled choice with a specific,
desirable property: zero dampening when only one factor in the cluster fires (matches its
individual magnitude exactly), with increasing dampening as more correlated factors stack
together. On the real Conine leg, this took the naive summed contribution of 0.253 down to
0.1305 (a ~48% reduction) - a meaningful correction, not a flattening-to-nothing. Factors
NOT part of this correlated cluster (`batter_quality_of_contact`, `platoon_handedness`,
`bullpen_fatigue`) were deliberately left summed normally, since they measure genuinely
independent information.

**Bug 4 - `batter_quality_of_contact`: a coefficient roughly 27x too large relative to its own
cap and the real population spread**

A real, additional pattern found: `batter_quality_of_contact` was showing the **exact same
contribution value for every different real player checked** - Yordan Alvarez (an elite
hitter), Mike Trout, and Zach Neto (a far more modest hitter) all showed identically +0.15,
meaning the factor was simply hitting its own cap for nearly every real batter rather than
actually discriminating between good and poor contact quality. The same red-flag pattern
(coefficient far too large relative to cap) was found in the same factor's cells for
`hits_runs_rbis` (coefficient a=0.5), `home_runs` (a=0.6), and `total_bases` (a=0.55) - all
even larger than the `doubles` cell that was fixed first. Per an explicit standing instruction
from the user, these were NOT given a blanket fix, because they might legitimately use a
different, differently-scaled input (xwOBA/barrel% rather than sweet-spot%) requiring its own
real population-statistics verification - flagged as open, not silently patched.
**Fix deployed for `doubles` specifically** (the one cell fully verified): coefficient rescaled
from its original, cap-saturating value down to 0.011.

**Bug 5 - `thinSampleMultiplier`: amplifying instead of shrinking a thin-sample signal**

Real code found in `alphadog-v2-phase2a-run-environment.js`, shared across `doubles`,
`total_bases`, `home_runs`, and the `hits_runs_rbis`/`hits`/`runs`/`rbis` fallback:
```js
// Thin-sample boost (2026-08-14): validated via 3 independent out-of-sample train/test
// splits (train-period rate predicts held-out test-period outcome, partial correlation
// controlling for train rate) - ISO/xwOBA carry real incremental value for players with a
// thin season sample (0.205/n=18, 0.426/n=22, 0.615/n=41 - all positive, strengthening with
// n)...
const thinSampleMultiplier = (ctx.hitter_season_games != null && ctx.hitter_season_games < 15) ? 1.3 : 1.0;
```
This multiplier **amplified** (multiplied up by 1.3x) the quality-of-contact signal
specifically for players with fewer than 15 season games - the opposite of standard,
correct statistical practice, which is to always SHRINK a thin-sample estimate toward a
prior, never amplify it. The real flaw identified: the original "validation" cited in the
comment only proved the signal was correlated with outcomes (which is scale-invariant - it
would show the same correlation whether the true adjustment should be 0.5x or 2x) - it never
actually validated that amplifying, specifically, rather than shrinking, was the correct
direction. **Fix**: remove the amplification, replace with genuine Empirical-Bayes-style
shrinkage instead. Because this multiplier was shared code across all four prop groups listed
above, fixing it once correctly addressed the thin-sample problem for all of them
simultaneously, rather than needing four separate patches.

### 3.2 The full, real, ranked overconfidence-gap scan (n>=100 threshold)

After the fixes above, a comprehensive real scan was run across the entire system:

| Prop/side | n | Gap | Severity |
|---|---|---|---|
| doubles/more | 130 | +24.4 | severe |
| rbis/more | 993 | +14.4 | severe (large sample) |
| walks_allowed/less | 619 | +13.7 | severe |
| runs/more | 333 | +11.2 | severe |
| pitcher_outs/less | 345 | +8.0 | moderate |
| walks/more | 264 | +6.1 | moderate |
| fantasy_score/more | 2,921 | **-5.5** | underconfidence (opposite direction), large sample |
| hits_allowed/less | 1,032 | +5.0 | moderate |
| singles/more, triples/more, stolen_bases/more, earned_runs/less, hits/more | 200-2,500 | +4.0 to +4.7 | minor-moderate |

**Real, honest self-correction embedded in this process**: when checking `walks_allowed/less`
(13.7pt gap) and other "new" offenders after the fixes above were deployed, every single
example checked showed STALE data - `catcher_framing` values still at -0.169 to -0.209
(exceeding the already-deployed 0.05 cap), and `park_factors` still tagged as a standalone
"applied" factor rather than "applied_macro_cluster_member" (meaning the RSS fix hadn't
touched it yet). This was because `enrichment_leg_current` had not been refreshed by any new
scoring run since the fixes deployed - the 5PM master run had been canceled that day. **This
was caught and flagged explicitly rather than continuing to "find" the same already-fixed bugs
against old data**: a real, deliberate pause was taken specifically to trigger a fresh,
targeted enrichment-layer re-run before continuing the audit, rather than wasting further
effort re-diagnosing already-resolved issues.

**Real, final verification once fresh data was available**:

| Prop | Real max deviation now | Before the fixes |
|---|---|---|
| pitcher_strikeouts | 0.066 | was +0.301 single-factor |
| walks_allowed | 0.102 | was -0.209 |
| rbis | 0.126 | was hitting the full 0.2 cap |
| doubles | 0.270 | was driving 1.63x extremes |
| runs | 0.298 | was driving 1.39x extremes |
| total_bases | 0.376 | was driving 1.63x extremes |

Every previously-flagged offender showed dramatically tighter, more disciplined real
contributions after the fixes - no more absurd single-factor dominance or cap-hitting
extremes. **Explicit, honest limitation stated at the time**: the actual predicted-vs-actual
backtest re-check could not yet be re-run, because these were freshly-scored legs with no
real graded outcomes yet (that requires the actual games to be played first) - what was
confirmed at that point was that the INPUT-side symptoms (extreme uncapped contributions,
factors hitting caps, thin-sample amplification) were gone from the live board, not yet that
the output-side hit rates had improved (which would need a future day's real graded data to
verify).

**Real items remaining, explicitly not yet dissected at the point this transcript ends**:
`pitcher_outs/less` (8.0pt - see Part 4, this one turned out to be a different, separate
finding), `walks/more` (6.1pt), `fantasy_score/more` (-5.5pt underconfidence, the single
largest untouched sample at n=2,921), `hits_allowed/less` (5.0pt), plus the smaller 3-5pt
cluster (singles, triples, stolen_bases, hits, home_runs, hits_allowed/more).

---

## PART 4 - A DISTINCT, SEPARATE BASELINE-LAYER BUG FOUND WHILE INVESTIGATING `pitcher_outs`

While dissecting `pitcher_outs/less`'s 8.0pt gap, a genuinely different class of problem was
found - not an enrichment factor at all, but a real bug in the BASELINE layer specifically for
this one count-type prop:

**Finding**: baseline-dominated `pitcher_outs` legs (n=99, the large majority of the sample)
showed a real 10.8-point overconfidence gap even with negligible enrichment activity -
completely different from, and much worse than, the ~1.0pt baseline-layer gap found
system-wide at the very start of this audit (Part 3's dose-response table). This meant
`pitcher_outs` had its own, distinct baseline miscalibration, unrelated to anything found and
fixed in Part 3.

**A related, distinct storage-only bug found in the same investigation**: the diagnostic field
`recency_blended_rate_0_100` was showing genuinely impossible real values - 1867.36, 2012.57
- for a field whose name says "_0_100." Root cause, directly found in code:
```js
recency_blended_rate_0_100: Math.round(shrunkRate*10000)/100
```
This multiplies `shrunkRate` by 100, which is the correct conversion for probability-type
props (a 0-1 rate becoming a 0-100 scale), but is WRONG for count-type props like
`pitcher_outs`, where `shrunkRate` is already a raw mean count (real outs values run roughly
0-27 per game, with a mean around 15.5) - multiplying that by 100 produces the absurd stored
values observed. **Important, explicitly-stated distinction**: this field is diagnostic/
storage-only. The real `hit_probability_0_100` used in actual scoring is computed separately,
directly from the unscaled `shrunkRate`, before this particular bug ever touches it - so this
specific bug, while real and worth fixing, is very likely NOT the actual cause of the real
10.8-point overconfidence gap on `pitcher_outs`. **The true root cause was identified as
"most likely in the overdispersion/count-model parameters specifically for `pitcher_outs`"
but was NOT resolved within this transcript** - it was flagged as a new, non-trivial,
separate thread requiring its own dedicated investigation, distinct from everything else in
this document.

---

## PART 5 - REAL CODE: THE (NOW APPARENTLY DEPRECATED) BASELINE WORKER

While tracing these bugs, the full source of `alphadog-v2-base-baseline.js` was read directly.
**Critical, real finding embedded in its own health-check response**:

```
"deprecation_warning": "DEAD/STALE as of 2026-08-14, NOT read by live scoring -
phase3c-certifier.js (the real, live HP-board worker) reads
classification.baseline_v6_current instead, never this worker's output table
(classification.baseline_current). This worker's code still functions correctly if
invoked - it simply is not being called anymore."
```

**This is directly important for any future baseline/calibration work**: the formulas in this
worker's code (Wilson-interval sample-support clamping, the `priorStrengthForSample` smooth
exponential-decay shrinkage function `2 + 18 * Math.exp(-n/18)`, Poisson/Normal count-model
selection, tier-blended priors) are REAL and were clearly the design this session's
`CORE_LOGIC_CALIBRATION_DOSSIER.md` describes - but this SPECIFIC worker and its output table
(`classification.baseline_current`) are confirmed dead code as of 2026-08-14. **The live
system reads `classification.baseline_v6_current` instead**, populated by a different worker
(`phase3c-certifier.js`, per this same deprecation note). A future session should verify
whether `baseline_v6_current`'s formulas match what's described here and in
`CORE_LOGIC_CALIBRATION_DOSSIER.md` exactly, or whether v6 diverged further - **this
transcript does not answer that question, since it only read the deprecated v1 worker's
source, not v6's.** This is an explicit, honest gap: do not assume the formulas documented
here are what's actually live without checking `phase3c-certifier.js` / `baseline_v6_current`
directly first.

Real formula details preserved from this dead-but-illustrative worker, since they likely
represent the design lineage even if v6 has since evolved:
```js
function priorStrengthForSample(n, psCfg) { return 2 + 18 * Math.exp(-n / 18); }
function wilsonInterval(pHat, n, z) {
  const z2 = z * z, denom = 1 + z2 / n;
  const center = (pHat + z2/(2*n)) / denom;
  const margin = (z * Math.sqrt((pHat*(1-pHat)/n) + (z2/(4*n*n)))) / denom;
  return { lower: Math.max(0, center-margin), upper: Math.min(1, center+margin) };
}
function clampHpToSampleSupportedRange(rawHp, gamesSample) {
  if (gamesSample >= 30) return { hp: rawHp, clamped: false }; // matches n=30 threshold in CORE_LOGIC_CALIBRATION_DOSSIER.md
  // else clamp rawHp into the Wilson interval
}
```
The `n>=30` unclamp threshold here matches exactly what `CORE_LOGIC_CALIBRATION_DOSSIER.md`
documents as existing "in two places" in the live code - this dead worker is very likely one
of the two, with the other being wherever `baseline_v6_current` is actually computed.

Tier-prior blending in this worker used a fixed blend constant `TIER_BLEND_K = 5`:
```js
const blended = (tierN * tierAvg + TIER_BLEND_K * populationMean) / (tierN + TIER_BLEND_K);
```
- a real, simple Bayesian blend between a tier-level average and the overall population mean,
separate from and upstream of the player-level HEB shrinkage described in
`CORE_LOGIC_CALIBRATION_DOSSIER.md` §4. Whether `baseline_v6_current` still uses `K=5` is,
again, unverified - flagged as an open check for a future session, not asserted as current
fact.

---

## PART 6 - HOW THIS RECONCILES WITH `CORE_LOGIC_CALIBRATION_DOSSIER.md`

That document is grounded in `alphadog-v2-phase3a-first-inning-pitcher-context.js` and
explicitly, honestly states its own gap: the enrichment-factor layer was not extracted with
code-level rigor. This document fills exactly that gap, sourced from
`alphadog-v2-phase2a-run-environment.js` (the actual enrichment-factor computation file) and
the real audit session that dissected it. The two documents together now cover:
- Baseline shrinkage, recency profiles, HEB, sample-size tiers, player-skill tiers ->
  `CORE_LOGIC_CALIBRATION_DOSSIER.md`
- Statistical calibration method (Platt scaling, why additive-binning was rejected) ->
  Part 2 of this document
- Enrichment factor bugs, multicollinearity/RSS fix, specific factor formulas -> Part 3 of
  this document
- A real, separate, NOT-yet-resolved baseline bug specific to `pitcher_outs` -> Part 4
- The real, but likely-deprecated, baseline worker source code -> Part 5

**Real, honest open item this document adds to the master list**: verify whether
`phase3c-certifier.js` / `classification.baseline_v6_current` (the actually-live baseline
path) uses the same formulas as the deprecated `alphadog-v2-base-baseline.js` documented in
Part 5, or whether it has materially diverged - this was not checked in the transcript this
document is sourced from, and should not be assumed either way.

---

*End of document. This is a direct transcript-sourced supplement to
`SESSION_2026-08-22_FULL_LOG.md` and `OUTCOME_ENGINE_AND_DOC_INDEX.md` - together the three
documents now cover every item from the original documentation request: multipliers,
calibration, slip building, backtest methodology, goblin/demon parsing, hit rate, hit
probability calibration, board snapshots, enrichment/baseline factor dissection, and the
outcome engine.*
