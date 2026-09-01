# BASELINE CALIBRATION — TOP-BAND OVERCONFIDENCE FINDING
*Companion to `ENRICHMENT_CALIBRATION_DOSSIER.md`. This document covers a baseline-model defect discovered while investigating the slip-calibration chat's final-hit-probability calibration test. Scope expanded to baseline per explicit authorization (2026-08-29) after enrichment was ruled out as the cause. Nothing here has been deployed — backtest simulation only.*

---

## 1. THE FINDING

The slip-calibration chat found that `est_hp` (final hit probability) is severely miscalibrated at the top of its range: the ≥95 band predicts 96.9% but delivers 82.25% actual — a 14.6pp miss — while bands from 60-80% are calibrated within half a point.

**Root-caused to the baseline itself, not enrichment.** Testing the clean, leakage-free baseline (`backtest.baseline_v6_asof` joined at `D-1`) in complete isolation from enrichment reproduces the identical signature:

| Baseline band | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| 70-80 | 19,138 | 75.0 | 73.18 | -1.8 |
| 60-70 | 12,904 | 65.7 | 66.37 | +0.7 |
| <60 | 8,457 | 43.5 | 44.24 | +0.7 |
| 80-85 | 8,089 | 82.4 | 79.33 | -3.1 |
| 85-90 | 5,171 | 87.3 | 82.21 | -5.1 |
| **90-95** | 3,193 | 92.3 | **82.56** | **-9.7** |
| **≥95** | 898 | 96.4 | **82.63** | **-13.8** |

**The actual hit rate flatlines at ~82-83% for every band ≥85%, regardless of how much higher the model claims.** Confirmed on the final enriched output too (nearly identical shape) — enrichment inherits this, it doesn't cause or meaningfully worsen it.

## 2. MECHANISM — SUPERSEDED: the real root cause is upstream, in the metrics layer

**Correction (2026-08-29, later same session): capping is the wrong fix.** It patches the symptom (the reported probability) without correcting why the underlying rate estimate reaches extreme values. Investigated further per explicit instruction to look at the classification/metrics level instead.

**The actual root cause**: traced `shrunkRate`'s inputs back through `classRows` to where `effectiveRate` (called `blended_rate`) is computed, in `stats_hitter/pitcher.metric_snapshots`. This is a weighted average across multiple recency windows:

```
"global|recency_weights": { last_5_games: 0.40, last_10_games: 0.30, last_20_games: 0.20, season_to_date: 0.10 }
```

**70% of the blended rate's weight comes from just the last 5-10 games; only 10% comes from the full season.** But `effectiveGamesSample` — the value the shrinkage formula uses to decide how much to trust `effectiveRate` — is the raw **season-to-date game count**, not any measure of how much of the blended rate's actual weight sits on thin, recent windows. This is a real mismatch: the shrinkage formula thinks it has (e.g.) 133 games of support behind a rate that's actually 70%-driven by the last 5-10 games.

**Verified with real data** (`stats_hitter.metric_snapshots`, season 2026): real players show exactly the kind of divergence this would exploit — e.g. player 518692's last-5-games rate is 0.364 (on 22 PA) vs. season-to-date 0.267 (572 PA); player 516782 shows the opposite, a cold-stretch dip (0.118 vs 0.220). These swings are real and constant; the metric is *supposed* to be recency-sensitive — the bug is that the confidence/shrinkage step doesn't know it's looking at a recency-sensitive number.

Given measured `prior_strength` is modest (avg 2.72, session-wide), the shrinkage weight for a typical high-sample leg is `prior_strength/(games+prior_strength)` ≈ **2%** — almost no pull back toward the tier prior, for a rate that may be substantially hot-streak-driven.

## 3. PROPER FIX — effective sample size, not a cap

Replace `effectiveGamesSample` in the shrinkage formula with a properly-computed **effective sample size** that reflects the actual recency composition of the blended rate, using the standard treatment for a weighted average of estimates with different underlying sample sizes:

```
n_eff = 1 / Σ(w_i² / n_i)
```
where `w_i` are the same normalized recency weights already configured, and `n_i` is each window's own real sample size (matching the rate's denominator field).

**Worked example, using player 518692's real numbers** (last_5: 22 PA; assume proportionally larger n for last_10/last_20; season_to_date: 572 PA; default weights 0.40/0.30/0.20/0.10): `n_eff` ≈ 102 PA ≈ ~24 games-equivalent, vs. the raw season count of 133 games currently used. This changes the shrinkage weight from ≈2.0% to ≈10.2% — roughly 5x more pull toward the tier prior — applied automatically and proportionally to how recency-driven that specific leg's rate actually is, not as a blanket constant. A leg whose blended rate is genuinely season-stable (little divergence between windows) would see `n_eff` close to the raw season count and shrink about the same as today; a leg riding a hot 5-game stretch would correctly shrink much harder.

**This requires two changes, both at the metrics/classification computation stage** (not the final probability formula): (1) compute `n_i` per window and `n_eff` from the same weights already used for the rate blend, alongside `blended_rate`; (2) pass `n_eff` through as `effectiveGamesSample` (or a new field) into the existing `shrunkRate` formula, which itself needs no other change.

**Not yet done**: full simulation of this fix against real historical data (recomputing `n_eff` per leg in the 2026-08-29 calibration test population and re-checking whether the ≥85% band's calibration gap closes), day-level validation, and confirmation this doesn't over-shrink genuinely well-supported legs elsewhere in the distribution. The §2/§3 capping approach below is retained in this document as a discarded alternative, not a recommendation — see the correction above.

---

### [SUPERSEDED — capping approach, kept for record only, not recommended]


Traced to `alphadog-v2-phase3a-first-inning-pitcher-context.js` line 9120:
```js
const hpSampleCeiling = Math.min(0.99, 0.99 - 0.30 * Math.exp(-nForVariance / 25));
const hp = Math.max(1 - hpSampleCeiling, Math.min(hpSampleCeiling, wilsonClampedHp));
```

This ceiling was already added once specifically to fight overconfidence — the code's own comment documents catching a worse version of this exact bug on 2026-08-19 (n=23 games producing 95-100% HP identically across every line from 12.5 to 45.5). But **the ceiling's asymptote is 0.99**, built on the assumption that enough games justifies near-certainty.

**The data says the true achievable ceiling is ~82%, not 99%, and this holds regardless of sample size.** Checked directly:

| Sample size (within ≥90% predicted) | n | Predicted | Actual |
|---|---|---|---|
| <25 games | 148 | 93.9 | 84.46 |
| 25-50 games | 290 | 94.1 | 75.52 |
| 50-100 games | 1,775 | 93.3 | 84.62 |
| 100+ games | 1,878 | 92.8 | 81.58 |

No monotonic sample-size relationship — the miscalibration is bad at every n, including 100+ games. **This rules out "insufficient regularization scaling with n" as the sole mechanism** and points further upstream: the ceiling formula conflates "confident in the estimate" (which genuinely improves with n) with "the true rate can approach 100%" (which real single-game outcomes don't support, regardless of n, due to irreducible game-to-game variance — weather, matchups, day-to-day form).

**Checked and ruled out as explanations:**
- **Not concentrated in one prop type**: uniform 7-19pp miss across all 11 props tested, including Poisson-exact "simple count" props (hits, doubles, home_runs) that the code documents as exactly-computed given their input rate. This means the defect is upstream of the probability-conversion math — most likely in how `shrunkRate` itself gets estimated for legs that end up in the extreme tail — not in the Poisson/Normal conversion formulas themselves.
- **Not symmetric**: the low end (≤30%) is calibrated within 2-8pp, nothing like the 7-19pp high-end miss. This is specifically a high-end overconfidence problem, not a generic "extremes are noisy" issue.
- **Not a `more`/`less` side artifact**: 99.4% of the ≥90% band is `less` side (naturally reaches extreme confidence more often given typical line-setting), but the small `more`-side subset (n=24) shows a similar-magnitude miss (91.7→83.33) — the mechanism isn't side-specific, `less` legs just trigger it more often.

## 3. SIMULATED FIX

Simulated capping the observed baseline value directly (approximating what a corrected ceiling formula would have produced) — since capping is monotonic, it cannot hurt rank-based discrimination, only recalibrates the absolute reported probability. Given actual accuracy is already flat throughout the 85-99% range, the model's own claimed differentiation within that range doesn't reflect real signal, so capping loses no genuine discriminative information.

| Cap tested | Predicted (avg) | Actual | Gap |
|---|---|---|---|
| 85% | 85.0 | 82.37 | 2.6 |
| **82%** | **82.00** | **81.51** | **0.49** |

**82% is a strong, empirically-validated candidate for the corrected ceiling asymptote**, replacing the current 0.99. Day-level check (19 days, ≥20 legs/day): mean gap 2.02pp (down from 9.7-13.8pp), SD 4.36 — real day-to-day noise remains (expected, given thin daily samples at this extreme), but the average calibration is dramatically improved.

## 4. WHAT THIS DOES NOT YET ANSWER

1. **Why does `shrunkRate` (or the empirical-distribution/normal-model path) produce extreme raw estimates in the first place**, uniformly across prop types and sample sizes? The ceiling is a backstop; the more root-cause question is whether `prior_strength`/shrinkage itself is under-regularizing for whatever subset of legs ends up in this tail — this session separately found `prior_strength` values are modest (avg 2.72, max 11.88, never near the theoretical cap of 100), which may itself be worth investigating as a contributing cause.
2. **Whether 82% is the single right constant, or whether the true ceiling varies meaningfully by prop** — the per-prop breakdown showed some spread (home_runs actual 87.85% vs rbis actual 73.96% within the same ≥90% predicted band), suggesting a per-prop-calibrated ceiling might outperform one global constant. Not yet tested.
3. Full day-level block bootstrap validation (95% CI, leave-one-out) on the proposed 82% cap has not been run — only a pooled test and a preliminary day-level gap check.

## 5. STATUS

**Backtest simulation only. Nothing deployed, nothing backfilled to production tables.** Per the baseline being explicitly out-of-scope for direct modification without sign-off, and per the standing "research → simulate → only then consider live" process: this needs full day-level bootstrap validation, the per-prop ceiling question resolved, and explicit sign-off from the principal and the slip-calibration chat before any change to the live baseline formula is even drafted.
