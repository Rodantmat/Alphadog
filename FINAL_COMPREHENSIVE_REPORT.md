# AlphaDog v2 — Complete Baseline Calibration & Enrichment Investigation
## Final Comprehensive Report

**Compiled 2026-09-01.** This report synthesizes the complete, final state of an extended, multi-session investigation into the AlphaDog v2 baseline probability model and enrichment layer. It consolidates: an original master report's findings, a full independent re-verification and expansion of that work across all 23 real canonical props, a major methodological discovery made partway through, an extended investigation into a genuine open residual, a full enrichment-layer re-audit, and a final, complete resolution of the enrichment question — the last of which was found by searching this project's own prior work rather than rebuilt from scratch.

**Status: 100% backtest and analysis work. Nothing in this report has been deployed to any live table, worker, or production code path.** Every number below is computed from real historical data and real, current production code/config — nothing is simulated or assumed unless explicitly labeled as such.

---

## 1. EXECUTIVE SUMMARY

This investigation began from a report claiming the baseline probability model was miscalibrated at the top of its confidence range (90%+ predictions delivering only ~82-83% real accuracy), with a proposed fix (effective-sample-size correction via Kish's formula) validated on 7 of ~19 known props. The mandate for this phase was to: (1) independently re-verify and complete that work across every real prop in the system, using a minimum 45-day window (expanded further where real data allowed), (2) re-run the corrected baseline through the real, current enrichment layer, and (3) reach a validated, honestly-qualified conclusion about deployment readiness.

**What was found and fixed:**

- **The core baseline bug, independently confirmed against live production code**: a variable named `effectiveGamesSample` — used to decide how much to trust a player's recent-form estimate versus a population prior — is not actually an effective sample size. It is the player's raw season game count, mislabeled. Real recency-weighted estimates (blending last-5/10/20-game and season rates) get 90% of their weight from small, noisy windows, but the shrinkage formula "sees" a full season of support and barely shrinks anything. This was traced directly to line 8781 of the live production file and confirmed via Kish's effective-sample-size formula, `n_eff = 1/Σ(w_i²/n_i)`.

- **All 23 real canonical props now have a locked, validated fix** — not the ~19 the original report worked from. Two props (`pitches_thrown`, `pitcher_fantasy_score_ud`) were never assessed by anyone before this investigation. 16 props resolve cleanly with the corrected effective-sample-size formula. 7 props (mostly strikeout-related and strikeout-dominated composites) needed a structurally different fix — abandoning the recency blend entirely in favor of pure season-to-date rate — discovered only after a major methodological correction (below).

- **A major, project-changing methodological discovery**: population-prior-based shrinkage — the very fix this investigation started with — carries a serious, previously unrecognized risk. It can produce an excellent-looking *pooled* calibration result while completely masking large, *canceling* errors at opposite ends of the real skill distribution (soft-tossers overconfident, aces underconfident, canceling to near-zero in the aggregate). This was caught by an adversarial review during the `pitcher_strikeouts` investigation and confirmed to generalize to most of the props subsequently tested. A new, mandatory verification step (skill-tier-quartile decomposition) was established as a result and is now a permanent part of this project's methodology.

- **The enrichment-layer question is now completely, rigorously resolved: enrichment has never been shown to help.** The original premise driving the whole enrichment investigation — "the current enrichment layer destroys baseline's real discrimination" — was itself found to rest on a leakage-corrupted baseline reference. Once corrected, baseline and the full current enrichment layer perform almost identically. A rigorous test of the best possible case for enrichment (the three factors with the strongest individual validation in the entire ~19-factor system) found that even this best case does not improve baseline's real, day-level correlation with outcomes. One real, confirmed exception exists: `rbis` (and `hits_runs_rbis`, which shares the mechanism) has a specific, actively harmful enrichment-layer bug, independently confirmed twice.

- **One genuine, honestly disclosed open problem remains**: 7 props (the strikeout-heavy ones) retain a real, moderate residual (5-11 percentage points) at the extreme ends of the confidence distribution, even after the correct fix. Six distinct, principled correction techniques were attempted, using both internal analysis and consultation with external statistical research and an adversarial AI reviewer. None fully closed the gap. This is reported as a standing limitation, not a solved problem.

**Bottom line**: this investigation is now complete and internally consistent. Every prop has a locked, evidence-based baseline fix. The enrichment-layer question has a definitive, rigorously-tested answer (it doesn't help, except where it actively hurts on `rbis`). One real residual problem remains open and is clearly scoped for future work. Nothing has touched the live system.

---

## 2. METHODOLOGY — THE STANDARD APPLIED THROUGHOUT

This standard was not fixed at the outset — it was built incrementally, with each addition triggered by a real mistake it was designed to prevent. It is now the permanent standard for any future calibration work on this system.

1. **Verify every claim against the live production code directly** — never trust an external reconstruction, a backtest snapshot, or a prior session's stated conclusion without checking it against the actual, current source. This caught the `effectiveGamesSample` mislabeling, the `lineup_slot` reference-point bug (`ctx.average_slot` never wired, silently defaulting to 5), and a stale-coefficient issue that had already been fixed by a prior session but was rediscovered here before that was known.

2. **Day-level statistical testing, not leg-level.** Legs within the same day are correlated (a strong slate lifts everything together); pooling them inflates apparent significance by 3-5x. Every reported t-statistic, confidence interval, and gap in this report is computed treating each real day as one observation.

3. **The skill-tier-quartile check, mandatory for any shrinkage-based fix.** Split the population into quartiles by real skill level and check the gap in each quartile separately. A method that looks perfect in the pooled aggregate can be hiding large, canceling errors — this exact pattern was found and corrected multiple times in this investigation.

4. **Use as much real data as exists, never an arbitrary subset.** The original report worked from 29-37 days; this investigation used up to 157 real days where the underlying data supported it (full-season game logs), and found genuinely new problems (e.g., a real `home_runs` overconfidence issue) that a shorter window lacked the statistical power to detect.

5. **Consult external research and an adversarial AI reviewer for any genuinely open technical question**, and test what they propose directly against real data rather than accepting it on authority. This process both confirmed real mechanisms (e.g., published sabermetric research on strikeout-rate stabilization) and refuted a plausible-sounding hypothesis proposed by both the reviewer and this investigation itself (an opponent-matchup-variance theory that failed a direct statistical test, R²=0.011).

6. **Before treating any backtest-derived value as ground truth, check it against current live configuration.** A backtest snapshot can reflect a coefficient or formula that has since been corrected — this was found to be the root cause of what initially looked like two severe enrichment-layer bugs, both of which turned out to be stale-data artifacts once checked.

7. **Search this project's own prior work exhaustively before concluding something is unresolved or needs to be rebuilt from scratch.** This was the single most valuable discipline in the investigation's final phase — real, already-validated answers to nearly every remaining open question were found in prior session transcripts, not rebuilt.

---

## 3. PART ONE — THE BASELINE FIX, IN FULL DETAIL

### 3.1 The mechanism, confirmed against real production code

The baseline model blends a player's recent performance using a weighted average:

```
blended_rate = 0.40 × last_5_games_rate + 0.30 × last_10_games_rate + 0.20 × last_20_games_rate + 0.10 × season_to_date_rate
```

This is then combined with a population/tier prior via standard Bayesian shrinkage:

```
shrunk_rate = (effectiveGamesSample × blended_rate + M × prior) / (effectiveGamesSample + M)
```

**The bug**: `effectiveGamesSample` is the player's raw season-to-date game count — traced directly to source at line 8781 of `alphadog-v2-phase3a-first-inning-pitcher-context.js`, where it is computed as `MAX(...season_to_date...) AS games_sample`, the season count, not a true effective sample size. Since `blended_rate` gets 70%+ of its real weight from the last 5-10 games, the formula is shrinking almost nothing (typical shrinkage weight for a 90-game-season player: ≈2%) when the real evidentiary weight behind the number is much smaller.

**The fix**: replace the raw game count with Kish's effective sample size, computed from the same recency weights already in the formula:

```
n_eff = 1 / Σ(w_i² / n_i)
```

Measured on real data: average `n_eff` ≈ 23.2 versus the raw season count's average of ≈94.3 — a 4x reduction, consistent across every prop tested this way.

### 3.2 Proof the mechanism is real

A model using only the population tier prior (zero weight on the player's own recency-blended data) predicted within 0.6-4.0 percentage points of real outcomes across multiple props — while the current production system, over-trusting the noisy recency signal, missed by 15-30+ points on the same legs. This demonstrates the recency-blended component was contributing largely noise for these cases, not real signal that happened to be miscalibrated.

### 3.3 All 23 props, final status

Each prop below was tuned to find its own empirically optimal shrinkage strength (M), cross-validated across at least two independent confidence bands (a high-confidence band and a mid-range band) to guard against overfitting to one region, and checked against the skill-tier-quartile test described in Section 2.

**16 props — clean fix, effective-sample-size shrinkage, residual gaps under ~2 percentage points in every tier:**

| Prop | Locked M | Notes |
|---|---|---|
| `hits` | ≈100 | Cross-validated in two bands simultaneously: +0.26pp / -0.22pp |
| `singles` | ≈100 | +0.83pp |
| `walks` | 50 | +0.03pp — near-perfect |
| `doubles` | ≈500 | Low real board volume; still locked for completeness |
| `total_bases` | 180 | Cross-validated: +0.08pp / -0.39pp. Confirmed the parametric Negative-Binomial dispersion mechanism the original report assumed was unnecessary — the simple method resolved it directly |
| `runs` | ≈150-175 | Same finding as `total_bases` — did not need the complex mechanism originally assumed |
| `rbis` | ≈250 | Baseline layer clean; see Section 5 for its separate, real enrichment-layer bug |
| `home_runs` | ≈100-150 | **A genuinely new finding**: a real +10.64pp overconfidence problem the original report's shorter window lacked the power to detect |
| `stolen_bases` | none needed | Confirmed no correction required — the un-shrunk formula would be far worse, and the current (buggy) formula's effective behavior already lands close to optimal here by coincidence |
| `pitcher_outs` | 20 | +0.28pp |
| `walks_allowed` | ≈50-55 | **Revises the original report's "no fix needed" call** — real 8.2pp problem found and fixed |
| `earned_runs` | ≈65-70 | Same — revises "no fix needed" |
| `runs_allowed` | ≈65-70 | Same — revises "no fix needed" |
| `triples` | ≈500 | Clean across all four skill tiers |
| `fantasy_score` (hitter) | ≈100-200 | Real weighted formula (2·RBI+2·R+2·BB+5·2B+3·1B+8·3B+10·HR) |
| `hits_runs_rbis` | ≈100 | Baseline layer clean; separate enrichment-layer bug — see Section 5 |

**7 props — structurally different fix required (pure season-to-date rate, no recency blending at all), with a real, disclosed residual remaining:**

| Prop | Residual after fix | Notes |
|---|---|---|
| `pitcher_strikeouts` | ±5.3pp / +5.77pp high-band | The most deeply investigated single prop in this report — see Section 4 |
| `hitter_strikeouts` | +2.68 / +0.08 / -1.06 / -1.93pp by tier | Same underlying mechanism as `pitcher_strikeouts` |
| `pitcher_fantasy_score` | +8.40 / +1.90 / -1.96 / -6.89pp by tier | Strikeout-dominated composite, inherits the residual |
| `pitcher_fantasy_score_ud` | +9.48 / +1.79 / -1.16 / -8.16pp by tier | Underdog-specific formula; never assessed before this investigation |
| `pitches_thrown` | -1.16 / +3.82 / -6.11 / -5.62pp by tier | Never assessed by anyone before this investigation |
| `hits_allowed` | +8.30 / -0.13 / -7.66 / -10.79pp by tier | The original "blowout stratification" hypothesis was tested directly and did **not** confirm — disclosed as an open limitation |
| `rfi_nrfi` | +3.18 / +0.63 / -3.26 / -9.26pp by tier | Real data found extending the full 157-day season, far more than the 33-day board-offer window originally assumed available |

### 3.4 Why this second group needed a completely different fix

Discovered during the deepest single-prop investigation in this report (`pitcher_strikeouts`, detailed in full in Section 4): for strikeout-type statistics specifically, the day-to-day recency-blend component carries almost no real predictive signal beyond what a player's full-season rate already captures. This was proven directly — real outcomes were found to be nearly flat (56.3% to 49.9%) across the model's own within-tier confidence ranking, while the model's predictions climbed steeply (35.2% to 73.2%) across that same ranking. The recency blend was manufacturing false confidence from what is, for this specific class of statistic, mostly noise. This is independently consistent with published sabermetric research confirming strikeout rate as one of the fastest-stabilizing, lowest-noise statistics in baseball.

---

## 4. PART TWO — THE `pitcher_strikeouts` INVESTIGATION, IN FULL (THE METHODOLOGICAL TURNING POINT)

This single prop required more investigation than any other, and the process — not just the final answer — is the reason this document's entire methodology looks the way it does. It is documented step by step because each step corrected a real mistake.

1. Initial testing showed the opposite pattern from every other prop: the buggy (pre-fix) formula was already close to correct, and applying more shrinkage made it steadily *worse*.
2. External research confirmed strikeout rate is a genuinely fast-stabilizing, low-noise statistic (stabilizes in under 100 batters faced per multiple independent sabermetric sources) — consistent with needing less shrinkage than other stats, not more.
3. An adversarial AI review reframed the finding (a units mismatch between games and batters-faced explained part of the apparent anomaly) and flagged a risk that had not yet been checked: the good-looking aggregate result might be masking **offsetting errors that cancel in the pool**.
4. This was checked directly and confirmed real: a skill-tier-quartile breakdown showed +10.88pp overconfidence for the weakest-K pitchers canceling against -10.81pp underconfidence for the best, with the aggregate landing near zero by coincidence — not because the fix was actually working.
5. This was resolved by shrinking each pitcher toward their own season-to-date rate (a real, point-in-time, player-specific anchor) instead of one global population average — cleanly fixing the cancellation (tier gaps reduced to +3.1/+2.0/+0.3/-3.4pp).
6. A second, separate problem remained: the top 15% of predictions still showed 9-10 percentage points of overconfidence, even among genuinely elite pitchers having an ordinary day, not just short "hot streaks."
7. A second adversarial review proposed opponent/matchup-specific variance as the cause, with a precise, falsifiable test: regress the residual against the opponent's own real strikeout tendency.
8. **This test was run directly and it failed** — correlation 0.10, R²=0.011. The hypothesis, though plausible and proposed independently by both the reviewer and this investigation, did not survive contact with real data and was correctly discarded rather than reported as an answer.
9. The actual mechanism was found by checking the model's own within-tier confidence ranking directly against real outcomes: real outcomes were nearly flat across that ranking while predictions climbed steeply — proving the day-to-day recency signal, for this specific statistic, is mostly noise.
10. The final, confirmed fix: pure season-to-date rate, no recency blending. This resolved both problems simultaneously — tier gaps of +4.00/+1.91/+0.05/-5.29pp and a high-band gap reduced from 9-10pp to 5.77pp.

**A further, more recent attempt to close the remaining residual** used a rigorously-derived (not guessed) shrinkage constant via Method-of-Moments variance decomposition, combined with a theoretically well-motivated non-circular prior (the continuous strikeouts-per-batter-faced rate). This did not clearly outperform the simpler pure-season-rate fix — an honest negative result, reported as such rather than as a success. In total, six distinct, principled correction techniques were attempted for this residual; none fully closed it. This stands as a real, disclosed limitation.

---

## 5. PART THREE — THE ENRICHMENT LAYER, FULLY RESOLVED

### 5.1 The original premise was false

The mandate to re-test enrichment began from a claim that the current ~19-factor live enrichment layer severely destroys baseline's real discrimination (a drop from an apparent +39.8pp within-cell discrimination down to +5.3pp). This claim was found to rest on a **leakage bug**: the baseline reference table used for this comparison included each leg's own game-day outcome in its own as-of prediction. Once corrected to use only genuinely prior data, baseline's real discrimination is approximately +5.2-5.8pp — nearly identical to the current live enrichment's +5.31pp. **There was no destruction to explain. Baseline and full current enrichment already perform almost identically.**

### 5.2 Even the best possible case for enrichment does not help

Given that finding, the real remaining question was whether *any* enrichment — even a hand-picked best case — could genuinely improve an honestly-measured baseline. Of the entire ~19-factor system, only three factors carry independent, credible validation: `opposing_pitcher_quality` (the single best-validated factor in the system, matched against real outcomes at n≈67,000), `schedule_travel_fatigue` (validated with real, concrete error deltas), and `catcher_framing` (externally validated against published research, with an exact coefficient match).

A combined variant — baseline plus only these three factors, every other factor zeroed out — was tested using the correct, decisive comparison: does adding these factors improve baseline's own day-level correlation with real outcomes (not the weaker, different question of whether a factor merely correlates with what baseline gets wrong). **It does not.** The combined variant beat baseline's correlation on only 9 of 27 real days, with a mean improvement that was slightly negative. Broken down further: `schedule_travel_fatigue` showed no significant improvement. `opposing_pitcher_quality` — despite its "best-validated factor" label — actually trended slightly negative under this correct test. `catcher_framing`'s real-world effect size was independently confirmed to be under 1%, consistent with being essentially undetectable at the individual-leg level.

**The honest, final conclusion of this entire line of investigation**: no factor or combination tested has been shown to genuinely enhance baseline using real outcomes under proper statistical rigor. The defensible position is that the confirmed-destructive elements of the current system should be removed (stopping active harm), but this is a different and more modest achievement than "enrichment enhances baseline" — a goal that, as tested, remains unmet.

### 5.3 What this means for every prop in this report

Every individual enrichment test run in this investigation — across `hits`, `home_runs`, `walks`, `runs`, `total_bases`, `walks_allowed`, and `pitcher_strikeouts` — independently found the same thing: enrichment changes the result negligibly, and the baseline-only fix already stands as the practical final answer. This is not a series of coincidences; it is the expected, consistent consequence of the more complete finding in 5.2.

### 5.4 The one confirmed, real exception: `rbis` and `hits_runs_rbis`

Unlike every other prop tested, `rbis` (and `hits_runs_rbis`, which shares the same underlying enrichment mechanism) shows a large, real, **actively harmful** enrichment-layer effect — independently confirmed twice, via two different methods, by two different investigative threads. This is a distinct and more serious category than "enrichment doesn't help": it is "enrichment actively hurts," and it remains a genuine, unresolved, separate problem requiring its own root-cause fix before these two props' full pipelines can be trusted.

### 5.5 A methodological trap encountered and corrected along the way

During this phase, two apparent severe enrichment bugs were initially found and reported — for `runs` (driven by a factor called `lineup_slot`) and for `total_bases` (driven by a factor called `bullpen_fatigue`). Both were later found to be **entirely artifacts of a stale backtest snapshot table** that had been superseded by corrected work already done in a prior session but not yet found by this one. Once the real, current, correctly-computed values were substituted, both apparent bugs disappeared completely, matching their clean baselines almost exactly. This is documented in detail because it is a genuine cautionary lesson: a data table's *existence* and *plausible-looking values* are not evidence that it reflects current reality, and exhaustively searching prior work before concluding something is broken or unresolved proved, repeatedly, to be more valuable than rebuilding from scratch.

---

## 6. DATA COVERAGE — WHAT GENUINELY MEETS THE "NO GAPS, THROUGH TODAY" STANDARD

Stated precisely, since different parts of this investigation draw on data with different real coverage:

- **The baseline layer, underlying every locked prop fix in Section 3**: built from real game logs extending back to March 25, 2026 — well beyond 45 days, with no gaps, through today. This is the deepest, most complete data source used anywhere in this investigation.
- **`lineup_slot`** (corrected): rebuilt from a raw lineup-history source confirmed continuously, genuinely accumulating from July 24 through today (and a few days beyond, since lineups post in advance).
- **`opposing_pitcher_quality`, `schedule_travel_fatigue`, `catcher_framing`**: tested and conclusively resolved (Section 5.2) using their existing real coverage window; extending this further would not change the finding, since the question they were being used to answer has already been answered.
- **`bullpen_fatigue`**: its raw underlying data source genuinely stopped being collected around August 18-19 — a real, separate gap that would require an actual data-collection re-trigger to extend, not a recomputation. This does not block any current conclusion, since this factor already has an independently confirmed zero-effect finding.

---

## 7. WHAT REMAINS OPEN — STATED PLAINLY, NOTHING SMOOTHED OVER

1. **The 7-prop extreme-tier residual** (Section 3.3/4): a real, moderate (5-11 percentage point) miscalibration at the extreme confidence bands for strikeout-related props, confirmed to be caused by thin-sample noise early in a player's season, but not fully correctable despite six distinct, principled attempts. This needs either real external data (a pre-season skill prior) or a fundamentally different modeling approach — a worthwhile, dedicated piece of future work in its own right.
2. **`rbis`/`hits_runs_rbis`'s enrichment-layer bug** (Section 5.4): confirmed real and actively harmful, entirely unaddressed by anything in this report, needs its own dedicated root-cause investigation.
3. **`market_implied_total`'s `pitcher_strikeouts` cell**: a coefficient of -1 with zero historical backtest rows ever validating it — never part of the tested 3-factor enrichment set, and remains a genuinely distinct, unresolved question.
4. **Final verification against the literal, currently-deployed production code path**: every fix in this report was verified against real production source code as it was read during this investigation. A final check immediately before any live change — confirming nothing has shifted since — remains the correct last gate, consistent with this report's own standing practice throughout.

---

## 8. RECOMMENDATION

**Do not deploy directly.** This is not a hedge — it is the same standard this entire investigation has held every one of its own findings to. Before any live change:

1. Verify every locked formula in Section 3 against the literal, currently-deployed production code (not this investigation's own reconstruction of it), confirming nothing has changed since verification.
2. Address `rbis`/`hits_runs_rbis`'s confirmed enrichment bug as its own, separate, prioritized fix.
3. Test any proposed live change in a shadow/parallel path against real, fresh data before it touches anything serving real predictions.
4. Treat the 16 fully-clean props (Section 3.3) as the strongest, most defensible starting point for that process; treat the 7-prop residual group as usable with its disclosed limitation, not yet fully resolved.

This investigation's honest conclusion is not "enrichment failed" or "baseline is broken" — it is that a real, structural bug in how the baseline model weighs recent versus season-long evidence has now been found, fixed, and validated across every real prop in the system, using real production code and real historical data throughout, with every limitation disclosed rather than hidden.

---

## APPENDIX: WHERE TO FIND THE UNDERLYING WORK

- **`CLAUDE_BASELINE_VERIFICATION_LOG.md`** (repo root) — the complete, real-time, unabridged working log this report was synthesized from. Contains every SQL query pattern, every intermediate number, every correction and self-correction, in full chronological detail. Read this for the granular "how," not just the "what."
- **`MASTER_REPORT.md`** (repo root) — the original master report this investigation began from, including the initial 7-prop validation and the first identification of the `rbis`/`hits_runs_rbis` enrichment bug.
- **`ENRICHMENT_CALIBRATION_DOSSIER.md`, `ENRICHMENT_CALIBRATION_HANDOFF.md`, `CORE_LOGIC_CALIBRATION_DOSSIER.md`** (repo root) — the prior sessions' own detailed factor-by-factor audits and baseline mechanism documentation, which this investigation drew on directly for the final enrichment conclusion in Section 5.
