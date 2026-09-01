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

**Checked and ruled out as explanations before finding the real mechanism:**
- **Not concentrated in one prop type**: uniform 7-19pp miss across all 11 props tested, including Poisson-exact "simple count" props (hits, doubles, home_runs) that the code documents as exactly-computed given their input rate. This means the defect is upstream of the probability-conversion math.
- **Not symmetric**: the low end (≤30%) is calibrated within 2-8pp, nothing like the 7-19pp high-end miss. Specifically a high-end overconfidence problem, not generic "extremes are noisy."
- **Not a `more`/`less` side artifact**: 99.4% of the ≥90% band is `less` side, but the small `more`-side subset (n=24) shows a similar-magnitude miss (91.7→83.33) — the mechanism isn't side-specific, `less` legs just trigger it more often.
- **Not a sample-size effect**: no monotonic relationship between games played and miscalibration severity within the ≥90% band (25-50 games is actually worse than 100+ games). Rules out "insufficient regularization scaling with n" as the sole mechanism.

## 2. ROOT CAUSE — a metrics-level mismatch, not a shrinkage-math error

**First attempt (superseded): capping the reported probability at ~82-85%.** This closed the pooled gap numerically but was correctly rejected — it patches the symptom without explaining why the rate estimate reaches extreme values, and doesn't fix the underlying logic.

**Actual root cause, traced through the code**: `shrunkRate`'s input rate (`effectiveRate`, called `blended_rate`) is computed in `stats_hitter/pitcher.metric_snapshots` as a weighted average across recency windows:

```
"global|recency_weights": { last_5_games: 0.40, last_10_games: 0.30, last_20_games: 0.20, season_to_date: 0.10 }
```

**70% of the blended rate's weight comes from just the last 5-10 games; only 10% comes from the full season.** But `effectiveGamesSample` — what the shrinkage formula uses to decide how much to trust `effectiveRate` — is the raw **season-to-date game count**, with no adjustment for how much of the blended rate's actual weight sits on thin, recent windows. The shrinkage formula believes it has (e.g.) 133 games of support behind a rate that's actually 70%-driven by the last 5-10 games.

**Verified with real data** (`stats_hitter.metric_snapshots`): real players show exactly this divergence — player 518692's last-5-games rate is 0.364 (22 PA) vs. season-to-date 0.267 (572 PA); player 516782 shows the opposite, a cold-stretch dip (0.118 vs 0.220). Given measured `prior_strength` is modest (avg 2.72), the shrinkage weight for a typical high-sample leg is `prior_strength/(games+prior_strength)` ≈ **2%** — almost no pull back toward the tier prior, for a rate that may be substantially short-window-driven.

## 3. CONFIRMATION — this is regression-to-the-mean, and it targets a specific population

Tested directly against real historical data (n=434, `hits`/`singles`/`doubles` props, `clean_baseline_hp≥85`): bucketed legs by divergence between their real recent-window rate (10-day trailing, computed point-in-time-correct from `stats_hitter.game_logs`) and their real season-to-date rate.

| Bucket | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| **Stable** (recent ≈ season) | 306 | 90.2 | 86.60 | -3.6 (reasonably calibrated already) |
| **Cold streak** (recent rate well below season) | 117 | 90.2 | **74.36** | **-15.8 (worst)** |
| Hot streak (recent rate well above season) | 11 | 89.1 | 81.82 | -7.3 |

**More precise than "hot streaks cause overconfidence"**: this is regression-to-the-mean in general — any large short-window divergence from the season rate, in either direction, is disproportionately noise that reverts, and the current formula has no way to discount it. The "cold streak" bucket dominates numerically because most of the ≥85% population is `less`-side bets, where a recent cold stretch is exactly what a recency-heavy blend reads as "safest" — but that recent coldness is often about to regress upward, causing the `less` bet to fail more than the model expects.

**This confirms a proper fix would self-target the right population.** The "stable" bucket, already reasonably calibrated, has little room where a corrected formula would even change anything. The "cold/hot streak" legs — responsible for most of the ≥85% band's miscalibration — are exactly where a properly-computed effective sample size would drop sharply below the raw season count, correctly applying more shrinkage precisely where the rate is least trustworthy.

## 4. PROPER FIX — effective sample size, not a cap

Replace `effectiveGamesSample` in the shrinkage formula with a properly-computed **effective sample size** reflecting the actual recency composition of the blended rate, using the standard treatment for a weighted average of estimates with different underlying sample sizes:

```
n_eff = 1 / Σ(w_i² / n_i)
```
where `w_i` are the same normalized recency weights already configured, and `n_i` is each window's own real sample size (matching the rate's denominator field).

**Worked example, using player 518692's real numbers** (last_5: 22 PA; season_to_date: 572 PA; default weights 0.40/0.30/0.20/0.10): `n_eff` ≈ 102 PA ≈ ~24 games-equivalent, vs. the raw season count of 133 games currently used. This changes the shrinkage weight from ≈2.0% to ≈10.2% — roughly 5x more pull toward the tier prior — applied automatically and proportionally to how recency-driven that specific leg's rate actually is, not as a blanket constant. A leg whose blended rate is genuinely season-stable would see `n_eff` close to the raw season count and shrink about the same as today.

**This requires two changes, both at the metrics/classification computation stage** (not the final probability formula, which needs no change): (1) compute `n_i` per window and `n_eff` from the same weights already used for the rate blend, alongside `blended_rate`; (2) pass `n_eff` through as `effectiveGamesSample` into the existing `shrunkRate` formula.

## 5. SCOPED END-TO-END SIMULATION — full resolution: two compounding causes, both confirmed

Ran successive, increasingly-faithful simulations, each closing one gap and revealing the next — this is the complete, resolved chain:

1. **Generic proxy** (global `prior_strength=2.72`, average PA/game): predicted 59.4%/52.6% vs. actual 83.6%/real model 90.1%.
2. **Real per-cell `prior_strength`** (hits=2.0, singles=2.09, doubles=7.25, from `classification.baseline_v6_current`) **+ real per-player rates**: gap widened, not narrowed — a signal something else was wrong, not that the approach was wrong.
3. **Switched from PA-scaled to direct per-game rate** (matching the real model's documented Poisson-exact-on-counts behavior): no meaningful change — ruled out unit mismatch as the remaining cause.
4. **Found and fixed a real bug in the simulation itself**: for line 0.5, `oh=1` means zero hits, so `P(oh=1) = e^(-λ)` directly — the simulation had been computing `λ = -ln(1-rate)` (the formula for the *opposite* event) instead of `λ = -ln(rate)`. This bug was present in every version up to this point.
5. **Diagnosed and fixed a genuine methodology flaw in the tier-prior construction**: an initial attempt at tier-matching used `WIDTH_BUCKET` with a fixed 0-0.6 range, but real season hit rates for this population only span 0.070-0.274 — meaning the fixed bucketing only ever populated 3-4 of 10 bins and looked artificially flat (0.42-0.46). Rebuilt with `NTILE(20)` on the real data distribution (20 tiers, quantile-based, ~36 legs/tier from a 2,634-pair reference population): this revealed a real, substantial gradient — tier 1 (season rate 0.118) → 63.9% "less" success, declining toward tier 14 (rate 0.217) → 27.8%.
6. **With the bug fixed and the real granular tier prior**: `n_eff`-corrected shrinkage moved the estimate in the right direction (50.2%→54.4%) but still undershot actual (83.0%) — because `prior_strength` itself (2.0 for hits) is too small for even `n_eff`-level shrinkage to pull far enough toward the prior.
7. **Tested the shrinkage weight at increasing prior_strength multiples**: 3x→61.9%, 8x→70.1%, 15x→74.6%, climbing toward actual (83.0%) with diminishing returns — consistent with an asymptotic approach to the pure tier-prior prediction.
8. **Confirmed the asymptote directly**: a model using *only* the tier prior (no recency-blended player data at all) predicts **82.4%** against actual **83.0%** — a 0.6pp gap, essentially perfect calibration.

**Full, resolved root cause**: two compounding under-shrinkage effects, not one.
- **`n_eff` mismatch** (§3-4): the shrinkage weight uses raw season games instead of a sample size that reflects how recency-driven the blended rate actually is.
- **`prior_strength` itself is too small**, because it's estimated (via population method-of-moments) from the cross-player variance of `blended_rate` — a value that's *already contaminated* by the same recency noise being under-shrunk, inflating measured variance beyond true talent spread and causing the formula to underestimate how much shrinkage is warranted.

Both push in the same direction; `n_eff` alone (tested in isolation) was insufficient precisely because the prior it's pulling toward is also too weakly weighted. Correcting both — `prior_strength`'s underlying variance computed from season-to-date rates only (not the recency-blended rate), and `n_eff` used for individual-leg shrinkage weight — is consistent, end to end, with the near-perfect calibration observed when relying on a properly-weighted granular tier prior.

## 6. WHAT THIS DOES NOT YET ANSWER

1. **Full end-to-end simulation of the corrected formula** — recomputing `n_eff` per window per historical leg, re-running the full `shrunkRate` → model-conversion → final-probability chain, and re-checking whether the ≥85% band's calibration gap closes in aggregate. So far only the *mechanism* and its *targeting* have been confirmed with real data, not the full corrected pipeline output.
2. **Whether the fix should vary by prop** — the per-prop breakdown (see prior session data) showed some spread even within the ≥90% band (home_runs actual 87.85% vs rbis actual 73.96%), suggesting prop-specific recency-weight tuning might outperform one global weight scheme.
3. Full day-level block bootstrap validation (95% CI, leave-one-out) on the corrected formula has not been run.
4. Historical validation is constrained by `stats_hitter/pitcher.metric_snapshots` holding only 1 row per player/window (current-state only, no retained history) — window-level historical sample sizes must be re-derived from `game_logs` directly for any full backtest, which is feasible (as done for the confirmation test above) but has not yet been done end-to-end.

## 7. STATUS

**Backtest simulation and code-level root-cause analysis only. Nothing deployed, nothing backfilled to production tables.** Per the baseline being explicitly out-of-scope for direct modification without sign-off, and per the standing "research → simulate → only then consider live" process: this needs the full end-to-end simulation (item 1 above), day-level bootstrap validation, and explicit sign-off from the principal and the slip-calibration chat before any change to the live baseline formula is even drafted.
