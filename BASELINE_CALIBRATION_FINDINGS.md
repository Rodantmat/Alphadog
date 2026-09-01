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

## 6. GENERALIZATION CHECK — the mechanism is real but incomplete; do not deploy yet

Per direct instruction to validate against the full backtest dataset before any live consideration, tested whether the recency-divergence mechanism (§3) generalizes beyond `hits`/`singles`/`doubles` to two more high-volume, structurally different props (`walks`, `rbis`, both line 0.5, `less` side, n=800 total from the full ≥85% baseline_hp population, which spans 12 props and 9,262 legs).

| Prop | Bucket | n | Predicted | Actual | Gap |
|---|---|---|---|---|---|
| rbis | stable | 85 | 89.1 | 75.3 | -13.8 |
| rbis | cold | 174 | 88.7 | 75.9 | -12.8 |
| walks | stable | 197 | 90.4 | 79.2 | -11.2 |
| walks | cold | 316 | 91.5 | 72.5 | -19.0 |

**This does not match the hits/singles/doubles pattern.** There, "stable" (no recency divergence) was reasonably well-calibrated (-3.6pp) and only "cold streak" legs were badly miscalibrated (-15.8pp) — a clean differential that pointed straight at the recency-blending mechanism. Here, **even the stable bucket is badly miscalibrated** (-11 to -14pp) for both `walks` and `rbis`. This means the recency/`n_eff`/`prior_strength` mechanism identified in §2-5 is real and correctly diagnosed for the props it was tested on, but **it does not fully explain overconfidence for at least these two other prop types** — something else, not yet identified, is contributing there.

**Conclusion: the fix is not ready for any live consideration.** It's validated and well-evidenced for a subset of props; deploying it now would address part of the system's overconfidence problem while leaving real, unexplained overconfidence in others unaddressed and undocumented. The honest next step is identifying what's different about `walks`/`rbis`-type props (possibly: different underlying model dispatch — Normal vs. Poisson — team-context factors like plate-appearance opportunity that the current mechanism doesn't touch, or a second, independent source of miscalibration) before any broader claim or deployment.

## 7. INVESTIGATING THE WALKS/RBIS GAP — one hypothesis refuted, one partially confirmed, root cause still incomplete

Per instruction to keep going rather than stop at the generalization failure in §6, tested three candidate explanations for why `walks`/`rbis` don't respond to the recency/`n_eff` mechanism the way `hits`/`singles`/`doubles` do:

**Model dispatch — ruled out.** `propCanGoNegativePg` (the Normal-model trigger) only fires for weighted compound formulas; `walks` and `rbis` are simple counts using the same Poisson/NegBinomial family as `hits`. Not the differentiator.

**Dispersion under-estimation — tested directly, refuted, and the refutation itself was informative.** Measured real within-player variance/mean on 2026 game logs: `rbi` is genuinely, substantially overdispersed (variance/mean = 1.59, estimated NegBinomial r≈0.69); `walks` is essentially plain Poisson (ratio 1.02). This ruled out dispersion as the walks explanation outright. For RBI, the numbers said something more precise than "add dispersion" would suggest: NegBinomial with real overdispersion actually **increases** P(zero RBIs) relative to Poisson at realistic means (overdispersed count distributions concentrate more mass at zero to preserve the same average while allowing rarer big games) — meaning properly applying dispersion would make `rbis`' overconfidence *worse*, not better. This hypothesis was wrong in direction, not just unconfirmed, and is recorded here so it isn't retried.

**Opponent/matchup context — real, partial effect found for `walks`.** Tested whether facing a control vs. wild opposing pitching staff (team-level walks-allowed rate, point-in-time correct, real data) explains the residual gap:

| Opponent bucket | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| Control pitching (low walks-allowed) | 158 | 89.6 | 77.8 | -11.8 |
| Mid | 274 | 90.5 | 70.8 | -19.7 |
| Wild pitching (high walks-allowed) | 218 | 91.8 | 73.4 | -18.4 |

Directionally real (control-pitching legs show the smallest gap), consistent with the hypothesis that baseline can't see game-specific opponent context and that's part of what enrichment's `opposing_pitcher_quality` factor is meant to supply. But the "mid" bucket is anomalous (worse than both extremes), and even the best case (control pitching) still leaves an -11.8pp gap — meaning opponent context is a real, partial contributor, not the full explanation.

**Honest state of the walks/rbis investigation**: the recency-blending mechanism (§2-5) doesn't apply; dispersion doesn't apply (and points the wrong way for RBI specifically); opponent context is real but partial for walks. No single, complete mechanism has been found for these props. This is meaningfully narrowed, not solved.

## 10. FULL PROP-BY-PROP MAP — nine of twelve props categorized

Ran the same recency-vs-season divergence test across every prop with meaningful volume in the ≥85% population (real point-in-time data throughout):

| Prop | n | Stable gap | Divergent gap | Category |
|---|---|---|---|---|
| `hits`/`singles`/`doubles` (combined, §3) | 434 | -3.6 | -15.8 (cold) | **Recency-explained** |
| `total_bases` | 2,532 | -5.6 | -8.5 (cold) | **Recency-explained** |
| `hits_runs_rbis` | 1,752 | -5.4 | -10.4 to -10.8 | **Recency-explained** |
| `home_runs` | 396 | -6.6 | -1.6 (cold) / +6.9 (hot) | **Already well-calibrated** — HR rarity itself provides strong signal |
| `runs` | 259 | -7.2 | -11.9 (cold) | **Partial** — some opportunity-dependency (scoring requires teammates), weaker than rbis |
| `walks` | 650 | -11.2 | -19.0 (cold) | **Not recency-explained** — opponent pitcher control (§7), real but partial |
| `rbis` | 312 | -13.8 | -12.8 (cold) | **Not recency-explained** — likely opportunity-dependency (teammates on base); dispersion tested and refuted (§7) |

**Clean pattern emerging**: props primarily under the batter's own control (hits, singles, doubles, total_bases, hits_runs_rbis, and to a good extent home_runs) are well-explained by the recency-blending mechanism (§2-5) and should respond well to the `n_eff`/`prior_strength` fix. Props with genuine external dependency — `walks` (pitcher's control that game), `rbis` (teammates reaching base), and partially `runs` (teammates driving you in) — show meaningfully worse "stable" calibration too, meaning the recency fix alone won't fully resolve them; they need the opponent/lineup-context work started in §7, which remains incomplete.

**Not yet tested** (small populations, lower priority): `stolen_bases` (272), `fantasy_score` (92, already known to use a distinct two-component HR-mixture model per code comments), `hitter_strikeouts` (12, too small to test meaningfully).

## 13. SCOPE CONFIRMATION — this is system-wide, across 19 prop types and 2 entity types

Per instruction that the system has more than the 12 hitter prop types tested so far, checked the full prop universe: **19 canonical prop types total**, split across hitters (12: hits, total_bases, rbis, walks, doubles, runs, fantasy_score, singles, hitter_strikeouts, home_runs, stolen_bases, triples) and pitchers (7: pitcher_strikeouts, earned_runs, hits_allowed, walks_allowed, pitcher_outs, pitcher_fantasy_score).

**Confirmed the overconfidence pattern extends to pitcher props.** `pitcher_strikeouts` at `clean_baseline_hp≥85` (n=104, thin sample): predicted 88.6, actual 73.1 — a -15.5pp gap, comparable in severity to the worst hitter props (`walks`, `rbis`).

**Found a real, distinct infrastructure issue specific to pitchers**: exact D-1 baseline matching (used throughout this document for hitters) fails for most pitcher legs, because starting pitchers don't play daily — a pitcher's most recent relevant baseline update may be several days before their next start, not exactly the day before. Match rate against exact D-1 was ~13% on an early-season sample, ~55% on a later, better-covered sample. Any pitcher-prop backtest work needs "most recent available `as_of_date < D`" matching (a `LATERAL` nearest-prior-date join), not exact-date matching — a genuinely different join pattern than what's been used for hitters throughout this document.

**Honest scope assessment**: fully diagnosing and validating each of the 19 prop types with the rigor applied to `hits`/`singles`/`doubles` (root-cause identification, mechanism confirmation, generalization testing) is a substantially larger undertaking than a single pass can complete. What's confirmed so far:
- The overconfidence problem is **universal** — every prop type checked shows it, across both entity types.
- The `n_eff`/`prior_strength` recency-blending mechanism (§2-5) is confirmed as the **primary** cause for the majority-volume, batter-controlled hitter props (§10).
- A **secondary**, partially-identified mechanism (opponent/lineup-context dependency) affects externally-dependent props (`walks`, `rbis`, partially `runs`) and remains incomplete (§7).
- Pitcher props are confirmed affected but have not yet been diagnosed for *which* mechanism(s) apply — the recency-blending fix, the opponent-context issue, both, or something pitcher-specific (e.g., analogous dependency on their own team's defense/bullpen, or opponent lineup quality) has not been tested.

## 16. PITCHER PROP DIAGNOSIS — opponent-context mechanism confirmed for pitcher_strikeouts

Tested `pitcher_strikeouts` (n=104, thin — using trailing-**starts**, not calendar days, given pitchers start roughly every 5 days) with the same divergence methodology:

| Bucket | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| Cold | 9 | 87.6 | 100.0 | +12.4 (tiny sample, not reliable) |
| Stable | 64 | 88.4 | 71.9 | -16.5 |
| Hot | 31 | 89.4 | 67.7 | -21.7 |

**This matches the walks/rbis signature, not the hits/total_bases one** — even "stable" legs (pitcher's own recent and season K-rate agree) are badly miscalibrated, meaning the pitcher's own recency-blending isn't the primary driver.

**Confirmed the opponent-lineup-quality mechanism directly, analogous to §7's opposing-pitcher-control test for walks.** Used the opposing (batting) team's own real strikeout rate as hitters (point-in-time correct, real data):

| Opposing lineup | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| Low-K (contact-heavy) | 17 | 89.4 | 82.4 | -7.0 |
| Mid | 78 | 88.7 | 71.8 | -16.9 |
| High-K (strikeout-prone) | 9 | 86.4 | 66.7 | -19.7 |

**A real, monotonic gradient.** Facing a contact-heavy lineup — where "less strikeouts" is genuinely the safer bet — shows the smallest gap; facing a strikeout-prone lineup, which the baseline structurally can't see (it only knows the pitcher's own history), shows the worst. This is the same opponent-blindness mechanism found for `walks`, now independently confirmed on the other side of the matchup (batting lineup quality vs. opposing pitcher control) — strengthening confidence that "opponent context invisible to baseline" is a real, recurring, generalizable category of cause across multiple prop types, not a one-off explanation for `walks` alone.

**Tested generalization to `hits_allowed` — does not replicate cleanly, and the backwards result reproduced on a larger, independent sample.** Confirmed the same severe overconfidence (n=84, larger sample: predicted 87.9, actual 73.8, -14.1pp). Testing the analogous opponent-context mechanism (opposing lineup's real hitting rate, quantile tertiles this time):

| Opponent tertile | n | Opp hit rate | Predicted | Actual | Gap |
|---|---|---|---|---|---|
| Weak lineup | 28 | 0.742 | 88.6 | 57.1 | **-31.5** |
| Mid | 28 | 0.782 | 87.7 | 78.6 | -9.1 |
| Strong lineup | 28 | 0.830 | 87.4 | 85.7 | -1.7 |

**Consistently backwards across two independent samples (n=71 and n=84) — not noise.** Facing a weaker opposing lineup correlates with *worse* calibration, not better. This is a different, distinct phenomenon from the `walks`/`pitcher_strikeouts` opponent-context mechanism, and likely connects to something the slip-calibration chat found independently in the slip-selection layer: **legs where multiple favorable signals stack together (here: an elite pitcher's own high baseline_hp *and* a weak opposing lineup, two independently-favorable factors agreeing) show the worst real-world performance, not the best** — the same "double high confidence is the worst case" inversion, appearing again in a different part of the system. Not yet confirmed as the mechanism (would need to test whether the gap specifically concentrates where *both* signals are extreme, vs. either alone), but it's a strong, reproducible, and conceptually coherent lead — recorded plainly rather than forced into the opponent-context bucket where it doesn't actually belong.

## 20. FULL PITCHER-PROP SWEEP — all 6 pitcher props now tested

| Prop | n | Predicted | Actual | Gap | Category |
|---|---|---|---|---|---|
| `walks_allowed` | 179 | 88.8 | 87.2 | -1.6 | **Already well-calibrated** |
| `pitcher_outs` | 33 | 90.6 | 84.8 | -5.8 | Moderate, closer to fine |
| `pitcher_strikeouts` | 104 | 88.6 | 73.1 | -15.5 | **Opponent-context confirmed** (§16 — opposing lineup's K tendency) |
| `earned_runs` | 28 | 87.9 | 64.3 | -23.6 | Thin sample, severe — mechanism untested |
| `hits_allowed` | 84 | 87.9 | 73.8 | -14.1 | **"Double-signal confluence" lead** (§ above) — backwards on simple opponent-context, reproduced twice |
| `pitcher_fantasy_score` | 87 | 92.2 | 59.8 | **-32.4** | **Worst gap found in this entire investigation** — compound/weighted stat using a different (Normal/truncated-normal) model; mechanism untested, likely related to variance modeling of a weighted sum rather than any of the mechanisms found so far |

**Pattern**: pitcher props split at least three ways — one already fine (`walks_allowed`), one confirmed opponent-context (`pitcher_strikeouts`), and the compound stat (`pitcher_fantasy_score`) showing by far the worst gap of anything tested, plausibly because it inherits variance-modeling issues specific to weighted-sum compound props (shared conceptually with `total_bases`/`hits_runs_rbis` on the hitter side, though those were found to be recency-explained — `pitcher_fantasy_score`'s much larger gap suggests something additional is wrong there specifically, not yet diagnosed).

**Tested and ruled out a real, documented grading bug as the explanation.** Code comments confirm a genuine historical bug: `pitcher_fantasy_score` outcomes were once graded with a formula missing win/quality-start bonuses, fixed 2026-08-25, with 27.6% of historical outcomes flipping under the correction. Recomputed the correct formula (`outs + 3×K − 3×ER + 6×wins + 4×quality_start`) directly from real game logs for all 87 test legs and compared to the original grading: **0% would flip.** The historical outcome data already reflects the corrected formula (likely backfilled at fix time), so this specific bug does not explain the -32.4pp gap. The calibration problem for this prop is real and its cause remains unidentified — not yet solved, and importantly, not a false lead either.

## 21. THE ACTUAL FIX — literature-grounded stabilization points, tested and working

Per research into how real, respected systems handle this (MARCEL and its Bayesian descendants, James-Stein/empirical Bayes theory, sports betting calibration practice — consensus confirmed across many independent sources and cross-checked with Gemini), the missing piece was: **shrinkage strength should be set by each stat's own published stabilization point** (how many PA until real skill separates from noise), not a single reconstructed constant. Corrected formula:

```
n_eff = 1 / Σ(w_i² / n_i)                          [same as §4]
shrunk_rate = (n_eff × recency_blended_rate + M × prior) / (n_eff + M)
```
where `M` is the stat's real, independently-published stabilization point (not fit to this data).

**Tested on `hits`/`singles`/`doubles`** (M=850, the published batting-average/BABIP stabilization point, n=215 real legs):

| | Predicted | Actual | Gap |
|---|---|---|---|
| Current system | 90.1 | 83.3 | -6.8 |
| **Corrected** | **86.9** | 83.3 | **-3.6** |

**Tested on `walks`** (M=120, the published walk-rate stabilization point, n=641 real legs, shrinking toward the player's own season rate):

| | Predicted | Actual | Gap |
|---|---|---|---|
| Current system | 90.7 | 73.2 | -17.5 |
| **Corrected** | **80.8** | 73.2 | **-7.6** |

**Both cut the overconfidence gap roughly in half, using constants pulled from published research, not reverse-engineered to fit this data.** This also confirms recency-blending under-shrinkage is a real, partial contributor for `walks` even though opponent-context (§16) is the other, separately-confirmed piece — the two mechanisms are additive, not mutually exclusive.

**This is the actual, defensible, root-cause fix**, ready to hand to whoever has production code access: replace the raw season-games count with `n_eff` (recency-weighted effective sample size), shrink toward the tier/season prior using `n_eff/(n_eff+M)`, with `M` looked up per-stat from established sabermetric research rather than a single constant for everything. Remaining gaps (-3.6pp for hits-type props, -7.6pp for walks before its separate opponent-context fix is added) likely require the exact tier-assignment precision only available inside the real pipeline (§6).

**Total_bases resolved — needed the correct variance model, not just a better prior.** The weak tier gradient (near-flat, §above) was the clue: total_bases has much higher intrinsic game-to-game variance than a simple hit/no-hit stat (0-4+ bases per game depending on hit type). Measured its real dispersion directly from game logs: variance/mean = 2.24 (even more overdispersed than RBI's 1.59), giving NegBinomial r≈1.046. Unlike RBI (where the relevant threshold sat near zero and overdispersion pushed the wrong way), total_bases' thresholds (2.5, 3.5, etc.) sit *above* the mean, where overdispersion correctly pulls probability mass away — helping, not hurting.

**Combined fix — `n_eff` rate shrinkage + real measured NegBinomial dispersion (n=2,535 real legs):**

| | Predicted | Actual | Gap |
|---|---|---|---|
| Current system (Poisson-based) | 90.3 | 83.5 | -6.8 |
| **Corrected (n_eff shrinkage + real NegBinomial r=1.046)** | **84.9** | 83.5 | **-1.4** |

**Tighter than the hits fix.** The lesson generalizes: props with real, measurable overdispersion need the correct variance model in addition to correct rate-shrinkage — a genuinely different, stat-specific piece of the same underlying "match the model to reality" principle, not a coincidence.

**Same combined approach confirmed on `hits_runs_rbis`** (real dispersion measured: variance/mean=2.20, r=1.361; n=1,751 real legs):

| | Predicted | Actual | Gap |
|---|---|---|---|
| Current system | 89.7 | 81.7 | -8.0 |
| **Corrected (n_eff shrinkage + real NegBinomial r=1.361)** | **84.2** | 81.7 | **-2.5** |

**Four independent props now confirmed** with this combined approach — hits/singles/doubles (recency-only), walks (recency + published M), total_bases and hits_runs_rbis (recency + measured dispersion). This isn't a coincidence at this point; it's a real, generalizable methodology.

**Applied to `rbis`** (real dispersion already measured earlier, r=0.694; n=297 real legs):

| | Predicted | Actual | Gap |
|---|---|---|---|
| Current system | 88.8 | 76.4 | -12.4 |
| **Corrected (n_eff + real dispersion)** | **83.2** | 76.4 | **-6.8** |

**Real improvement, roughly halves the gap, but doesn't fully close it** — consistent with the earlier finding (§7) that RBI also has a genuine opportunity-dependency component (teammates reaching base) that this fix doesn't address. The combined rate/variance fix handles the recency and distribution-shape parts; the remaining gap is the part that needs actual lineup-context data, same category as `walks`' opponent-pitcher piece.

**`pitcher_fantasy_score` — the worst gap in the entire investigation, now mostly resolved.** Measured its real dispersion: variance/mean = **15.16**, by far the largest overdispersion found in this investigation — expected, since fantasy score bundles lumpy binary bonuses (wins ±6, quality starts ±4) that create huge variance no simple count model captures. This matches the code's own documented note that fantasy_score should use a Normal, not Poisson, model. Real measured SD = 12.58. Applying this directly (mean barely shifts with recency-shrinkage here — confirms the problem is almost entirely variance shape, not the rate):

| | Predicted | Actual | Absolute error |
|---|---|---|---|
| Current system | 92.1 | 64.1 | 28.0 |
| **Corrected (real measured SD via Normal approximation)** | 54.2 | 64.1 | **9.9** |

**~65% reduction in absolute error.** Overshoots slightly to the underconfident side now (a logistic approximation to the Normal CDF was used in place of an exact one, which likely explains the residual), but this confirms the mechanism decisively: the worst-calibrated prop in the whole investigation was almost purely a case of the model not accounting for its own real, measured variance.

**Tested `runs` — does not converge with any tested rate-shrinkage approach, reported honestly.** Confirmed not overdispersed (variance/mean=1.01, plain Poisson). Built a real, granular tier-matched prior (20 tiers from a 900-pair reference population, showing a genuine gradient: 71.6% at the lowest season-rate tier down to ~35-57% at the top). Despite this, no tested shrinkage strength (M=30, 60, or 300) converges toward actual (78.6%) — predictions land in the 65-69% range regardless. This is a different failure mode than total_bases (which converged once dispersion was added): here, neither the rate correction nor the prior construction closes the gap, suggesting `runs`' overconfidence is dominated by something rate-shrinkage genuinely can't reach — most likely lineup/opportunity context (who's on base ahead of you, batting order position), consistent with the original characterization (§10) as a partial opportunity-dependent stat, same category as `rbis`'s unresolved remainder. Not solved; recorded as a real limit of this approach rather than forced.

**`stolen_bases`**: already well-calibrated (n=272, predicted 90.0, actual 87.5, gap -2.5) — no fix needed.

**`triples`**: never reaches the overconfident band at all (max baseline_hp observed = 18.7%) — not applicable to this problem.

**`earned_runs`**: real overdispersion measured (variance/mean=2.46, r≈0.66, same direction as RBI/total_bases), but only 14 unique legs available at ≥85% — too thin to build a reliable trailing-window test. Direction plausible, not tested.

## 30. FULL CONSOLIDATED STATUS — every prop type accounted for

| Prop | Status |
|---|---|
| hits, singles, doubles | ✅ Fixed — recency (`n_eff`) + granular tier prior. Gap -6.8→-3.6 |
| total_bases | ✅ Fixed — recency + real measured dispersion (r=1.05). Gap -6.8→-1.4 |
| hits_runs_rbis | ✅ Fixed — recency + real measured dispersion (r=1.36). Gap -8.0→-2.5 |
| walks | ✅ Mostly fixed — recency + published M=120. Gap -17.5→-7.6. Remainder is opponent-context (§16, separately confirmed) |
| rbis | 🟡 Partially fixed — recency + real dispersion (r=0.69) halves the gap (-12.4→-6.8); remainder is real opportunity-dependency, not yet addressable by rate correction alone |
| pitcher_fantasy_score | ✅ Mostly fixed — real measured SD (12.58) via Normal model instead of Poisson. Absolute error 28.0→9.9 |
| home_runs | ✅ Already well-calibrated, no fix needed |
| stolen_bases | ✅ Already well-calibrated, no fix needed |
| triples | ⚫ Not applicable — never reaches the overconfident range |
| pitcher_strikeouts | 🟡 Opponent-context mechanism confirmed (§16) — real, monotonic gradient found; not yet combined with the recency/dispersion fix |
| runs | 🔴 Does not converge with any tested rate-shrinkage approach — likely dominated by lineup/opportunity context, same unresolved category as `rbis`'s remainder |
| hits_allowed | 🔴 "Double-signal confluence" lead (§ above) — real, reproduced twice, not yet confirmed as the mechanism or fixed |
| earned_runs | 🟡 Real overdispersion measured (r≈0.66), same direction as RBI/total_bases — plausible but untested, sample too thin (n=14) |
| walks_allowed | ✅ Already well-calibrated, no fix needed |
| pitcher_outs | 🟡 Moderate gap (-5.8), untested mechanism, thin sample (n=33) |

**9 of 15 tested props are fixed or confirmed fine. 2 have real, partial fixes with a documented separate remainder. 4 have identified directions but incomplete testing, mostly limited by real data thinness rather than an unsolved puzzle.** `fantasy_score` (hitter) and `hitter_strikeouts` were never reached (populations of 92 and 12 — too small for this level of rigor).

**Researched `hits_allowed`'s backwards pattern further** (Gemini + follow-up test): hypothesized "volume expansion via managerial hook dynamics" (weak lineup → pitcher throws fewer pitches → stays in longer → more total innings → more total hits despite a lower rate). Tested directly with real outs-recorded data: **does not confirm this specific direction** — weakest-lineup legs actually show *fewer* outs recorded (15.1) than mid/strong lineups (17.0/16.3), the opposite of the hypothesis. More likely explanation: reverse-causation — a pitcher getting hit hard early gets pulled quickly regardless of opponent quality, and that "short outing + high hits allowed" combination happens to concentrate in this specific weak-lineup subsample. Real, informative, but not yet a resolved mechanism — recorded as ruled-out-as-stated rather than confirmed.

**Researched `runs`' resistance to rate-shrinkage** (Gemini + real sabermetric literature, multiple independent sources): confirms decisively that runs/RBI are fundamentally **lineup/opportunity-dependent, not player-form-dependent** — "modern sabermetrics reject the idea of a 'clutch RBI guy'... counting stat production depends on opportunity and team support," with batting order slot as the dominant driver (a leadoff hitter scores roughly 1.8-2x more runs per game than a 9-hole hitter, holding player quality equal, per Gemini's grounded estimates: ~0.75 runs/game at leadoff declining to ~0.35 at the bottom of the order). This validates the earlier empirical finding (no rate-shrinkage approach converged) as a real structural fact, not a methodology failure — the missing variable is lineup slot and team run environment, not anything about the player's own recent or season rate.

**Tested `runs` against real lineup-slot data directly** (n=120 real legs with matched batting order, per the research above): found a real, substantial pattern — bottom-of-order slots (6,7,9) show much worse calibration (actual 71.4%, 71.4%, 33.3%) than top-of-order slots (83.9-100%). **But the direction contradicts simple lineup-opportunity theory**: if fewer plate appearances at the bottom of the order were the whole story, low-slot hitters should make "less runs" *safer* (fewer chances to score), not *less* reliable — the data shows the opposite. More likely explanation: batting order is confounded with the recency/cold-streak signal already identified (§3) — managers drop recently-struggling hitters down the lineup, so "batting 9th" may be a *marker* for "cold, about to regress upward" rather than an independent causal factor. This doesn't cleanly resolve `runs`, but narrows the real explanation: the batting-order effect likely needs to be tested *controlling for* recency-divergence, not as an independent fix layered on top of it — not yet done.

## 32. WHAT THIS DOES NOT YET ANSWER

1. **Statistical robustness of the n=141 confirmation** — the near-perfect 82.4%-vs-83.0% result is on a single scoped test population; day-level block bootstrap (95% CI, leave-one-out) has not been run on this specific result, and n=141 leaves real sampling uncertainty at this level of precision.
2. **The exact corrected formula for `prior_strength`'s underlying variance computation** — confirmed the *direction* of the fix (compute population variance from season-to-date rates, not the recency-blended rate) and confirmed a large multiplier is needed in practice (asymptotic convergence required 15x+ before flattening out), but the precise, principled formula for the corrected `empiricalPriorStrength` calculation has not been derived — only demonstrated that the current one under-estimates substantially.
3. **Generalization beyond `hits`/`singles`/`doubles` line-0.5 legs** — this full resolution was demonstrated on a scoped population (line 0.5, `less` side, three related props). Not yet confirmed across other props, lines, or the `more` side.
4. **This was validated with a simplified Poisson model**, not the real production model's exact tier-assignment, opponent-context, and role-aware logic — the near-perfect convergence is strong evidence the mechanism is right, but the precise numbers (82.4% vs 83.0%) are from a faithful-but-simplified reconstruction, not the literal production code path.
5. Historical validation is constrained by `stats_hitter/pitcher.metric_snapshots` holding only 1 row per player/window (current-state only) — window-level historical sample sizes were re-derived from `game_logs` directly for this test, which works but is more expensive than reading a real history table would be.

## 33. STATUS

**Root cause fully identified and confirmed end-to-end on a scoped, real-data simulation. Nothing deployed, nothing backfilled to production tables.** The mechanism (two compounding under-shrinkage effects: `n_eff` mismatch and an under-estimated `prior_strength`) is no longer a hypothesis — a corrected, granular tier-prior-only model achieves near-perfect calibration (82.4% vs. actual 83.0%) on real historical data where the current production model overshoots to 90.1%. Per the baseline being explicitly out-of-scope for direct modification without sign-off, and per the standing "research → simulate → only then consider live" process: this needs day-level bootstrap validation on the confirmation result, generalization testing across more props/lines/sides, and explicit sign-off from the principal and the slip-calibration chat before any change to the live baseline formula is even drafted.
