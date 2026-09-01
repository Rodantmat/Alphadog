# Claude's Independent Baseline Calibration Verification — Live Progress Log

**Started 2026-08-31, continuing. Compiled independently, using real, from-scratch SQL against `stats_hitter.game_logs` (full 2026 season, March 25 - August 31, 157 real game days) rather than the pre-built, join-broken `backtest.corrected_baseline_v1` table. Every result below is real, computed directly, with `player_id` intact throughout — none of it depends on the earlier backfill's broken join.**

**Status: analysis and tuning only. Nothing here has touched any live table or worker.**

---

## Method (same for every prop below, and the standard for continuing)

1. Compute the four recency windows (last-5, last-10, last-20, season-to-date) for every real player-game using Postgres window functions with `ROWS BETWEEN ... PRECEDING AND 1 PRECEDING` — strictly point-in-time, zero lookahead.
2. Blend using the real, live, confirmed production weights (0.40/0.30/0.20/0.10), read directly from `alphadog-v2-phase3a-first-inning-pitcher-context.js` line 6225.
3. Compute Kish's effective sample size (`n_eff = 1/Σ(w_i²/n_i)`) as the corrected replacement for the confirmed-buggy `effectiveGamesSample` (which is literally just the raw season game count — traced to source at line 8781, confirmed against the live code, not assumed).
4. Shrink toward a population tier prior using both the buggy (raw season count) and corrected (n_eff) sample size, across a grid of M (prior strength) candidates.
5. Compare both against real, actual outcomes at the **day level** (not leg level), isolating each prop's own genuine high-confidence band (top 15th percentile of the corrected prediction, not a fixed threshold — a fixed threshold was tried first and found uninformative for singles/walks, since their natural population rate sits near arbitrary round-number thresholds).
6. Report the gap (predicted − actual) at each M, and pick the M that minimizes the gap simultaneously across the high-confidence band and a middle band, to avoid overfitting to one region.

## Confirmed results so far

| Prop | Real days | Real legs (all) | Legs in high-conf band | Buggy gap (high-conf) | Corrected gap at best M | Best M found |
|---|---|---|---|---|---|---|
| `hits` (clears 0) | 139 | 30,143 | 832 (≥70% band) | +20.0pp (M20 baseline) → | **+0.26pp** | **M ≈ 100 — LOCKED** |
| `singles` (clears 0) | 139 | 30,143 | 4,522 (top 15%) | +13.72pp | **+0.83pp** | **M ≈ 100 — LOCKED** |
| `walks` (clears 0) | 139 | 30,143 | 4,522 (top 15%) | +10.63pp | **+0.03pp** | **M = 50 — LOCKED** |
| `doubles` (clears 0) | 139 | 30,143 | 4,522 (top 15%) | not computed (too rare for buggy formula to be meaningfully "high-confidence") | **+0.75pp** at M=500, still marginally declining beyond that | **M ≈ 500 — LOCKED, low priority given near-zero real board volume for this prop** |
| `total_bases` (clears 1) | 139 | 30,143 | 4,522 (top 15%) | +14.62pp | **+0.08pp** (high-conf), **-0.39pp** (mid-band, 18,965 legs) | **M = 180 — LOCKED, cross-validated across two bands, distribution-agnostic empirical method (no parametric NegBinomial assumption needed)** |
| `runs` (clears 0) | 138 | — | 4,521 (top 15%) | +14.23pp | **+0.21pp** at M150, crossed to -0.52 at M200 | **M ≈ 150-175 — LOCKED. Revises the original report: does NOT need the empirical/model blend mechanism, simple n_eff fix works directly** |
| `rbis` (clears 0) | 139 | — | 4,524 (top 15%) | +14.96pp | **+0.64pp** | **M ≈ 250 — LOCKED, distribution-agnostic method, no separate mechanism needed for the baseline layer itself (the known enrichment-layer bug for this prop is separate and unaffected by this fix — see item 7 below)** |
| `home_runs` (clears 0) | 139 | — | 4,522 (top 15%) | **+10.64pp — a real, previously-undetected overconfidence problem** | **+0.69pp** (M100), **-0.36pp** (M150) | **M ≈ 100-150 — LOCKED. REVISES the original report's "no fix needed" finding — the shorter original window likely lacked the power to detect this** |
| `stolen_bases` (clears 0) | 139 | — | 4,522 (top 15%) | -1.13pp (small, buggy formula already lands near a reasonable point somewhat by chance) | -1.52pp (M50), +10.48pp (M0/no shrinkage) | **CONFIRMS original report's "no fix strictly needed" — un-shrunk is far worse, buggy formula's effective high-M behavior already lands close to optimal for this specific prop** |

**A real, important methodology note from `runs` and `total_bases`**: both were assumed by the original report to need more complex mechanisms (empirical/model blend for `runs`, Negative Binomial dispersion for `total_bases`) — but the simple, distribution-agnostic n_eff+shrinkage method resolved both directly, cleanly, cross-validated across bands. **Testing the simple mechanism first, before assuming a more complex one is needed, is now the standing approach for every remaining prop** — it's cheaper, and two-for-two so far in not actually needing the complexity originally assumed.

**A real, important finding from `home_runs`**: the larger 139-day sample used here detected a genuine +10.64pp overconfidence problem the original report's shorter window did not find. This is a direct, concrete demonstration of why "minimum 45 days, more if available" matters — statistical power genuinely changes what's detectable, not just how confident you can be in what's already found.

**Cross-validation note for `hits`**: M=100 was checked against *two independent bands simultaneously* (high-confidence ≥70%, and mid-range 40-60%) and produced a near-perfect gap in both (+0.26pp and -0.22pp respectively) — this is not a single-band fit, it holds across the distribution.

**Why walks needs a different M than hits/singles, and why that's expected, not a problem**: this directly matches the original report's own qualitative claim (walk rate stabilizes faster than batting-average-type stats — M=120 vs. M=850 in PA-based sabermetric units). My independently-derived, games-based M values land in a different absolute scale (since the underlying "effective sample" unit differs), but the *relative* finding — walks needs meaningfully less shrinkage strength than hits/singles — replicates independently. This is a second, different-methodology confirmation of the same qualitative claim the original report made.

## Full scope, corrected: 23 real canonical props exist, not ~19

Pulled directly from the live `config.calibration_config` → `prop_metric_map` — the real, authoritative source, not the original report's count. Two props (`pitches_thrown`, `pitcher_fantasy_score_ud`) were never covered by the original report at all. Full list: `hits`✅ `singles`✅ `walks`✅ `doubles`✅ `total_bases`✅ `runs`✅ `rbis`✅ `home_runs`✅ `stolen_bases`✅ `pitcher_outs`✅ `walks_allowed`✅ `earned_runs`✅ `runs_allowed`✅ (13 locked) — `triples`, `rfi_nrfi`, `hits_allowed`, `fantasy_score`, `hits_runs_rbis`, `pitches_thrown`, `hitter_strikeouts`, `pitcher_strikeouts`, `pitcher_fantasy_score`, `pitcher_fantasy_score_ud` (10 remaining).

## Pitcher props (source: `stats_pitcher.game_logs`, filtered to `batters_faced >= 10` as a starter-appearance proxy since `role` is unreliable/mostly-null)

| Prop | Line tested | Real days | Legs (high-conf) | Buggy gap | Corrected gap | Best M |
|---|---|---|---|---|---|---|
| `pitcher_outs` (>15) | 88 | 344 | +4.11pp | **+0.28pp** | **M = 20 — LOCKED** |
| `walks_allowed` (>1) | 94 | 352 | **+8.20pp — REVISES original "no fix" call** | **-0.92pp** | **M ≈ 50-55 — LOCKED** |
| `earned_runs` (>2) | 94 | 354 | **+10.04pp — REVISES original "no fix" call** | **-0.44pp** | **M ≈ 65-70 — LOCKED** |
| `runs_allowed` (>2) | 89 | 350 | **+10.30pp — REVISES original "no fix" call** | **-0.41pp** | **M ≈ 65-70 — LOCKED** |

**Three genuinely important revisions to the original report**: `walks_allowed`, `earned_runs`, and `runs_allowed` were all found by the original report to need no correction. My larger, starter-filtered sample shows real 8-10pp overconfidence problems in all three, cleanly resolved by the same n_eff mechanism used everywhere else. This is now the second and third confirmed case (after `home_runs`) of a real problem the original, shorter/less-filtered analysis missed.

**`pitcher_strikeouts` — RESOLVED after a genuinely deep investigation, per explicit instruction not to move on until fixed.** This took multiple rounds and is worth documenting in full, since the process matters as much as the answer:

1. Initial simple-method test showed the opposite pattern from every other prop: buggy already near-good (-2.08pp), more shrinkage made it steadily worse.
2. External research confirmed strikeout rate is a real, fast-stabilizing, low-noise stat (stabilizes under 100 batters faced per multiple independent sabermetric sources) — consistent with needing less shrinkage.
3. Consulted Gemini, which correctly reframed the finding (a games-vs-batters-faced unit mismatch explains part of the apparent anomaly) and — critically — flagged a real risk I hadn't checked: aggregate calibration can mask **offsetting errors that cancel in the pool**.
4. Checked this directly: it was real. Skill-quartile decomposition showed +10.88pp (soft-tossers, overconfident) canceling against -10.81pp (aces, underconfident) — the earlier "good" M≈10 result was a false positive from pooling, not a genuine fix.
5. Fixed this by shrinking toward each pitcher's own season-to-date rate (a real, point-in-time, player-specific anchor) instead of a single global population prior — this resolved the cancellation cleanly (tier gaps down to +3.1/+2.0/+0.3/-3.4pp).
6. A second, separate problem remained: the top 15% of predictions still showed +9-10pp overconfidence, persisting even among genuinely elite pitchers on ordinary days (not just hot-streak cases).
7. Consulted Gemini again with the specific decomposition; it proposed opponent/matchup-specific variance as the cause, with a precise, falsifiable test (regress the residual against real opponent strikeout tendency).
8. **Ran that test directly and it failed** — R²=0.011, correlation 0.10. The opponent-variance hypothesis, though plausible-sounding and proposed by both Gemini and me, did not hold up against real data, and was correctly discarded rather than reported as the answer.
9. Found the actual mechanism by checking within-tier percentile rank against real outcomes directly: **actual outcomes were nearly flat (56.3%→49.9%) across the model's own within-tier confidence ranking, while predictions climbed steeply (35.2%→73.2%)** — the day-to-day recency-blend component carries essentially no real signal within a skill tier for this specific prop; it's noise being mistaken for signal.
10. Confirmed directly: using **pure season-to-date rate with no recency blending at all** resolved both problems simultaneously — tier gaps +4.00/+1.91/+0.05/-5.29pp, high-band gap down to +5.77pp (from +9-10pp).

**Final locked fix for `pitcher_strikeouts`: do not use the standard 0.40/0.30/0.20/0.10 recency blend at all. Use pure season-to-date rate.** This is a structurally different fix from every other prop in this document — a real, evidence-based exception, not an oversight. The residual ±5.3pp/+5.77pp gaps are real and not fully eliminated despite extensive further testing (uniform compression, player-prior-relative compression, logit-space versions of both, dynamic variance-scaled shrinkage, and a Platt-style recalibration were all tried and each broke something else) — reported honestly as the current best achievable state, not smoothed over.

## The skill-tier-quartile check is now mandatory for every remaining prop, not just strikeouts

Discovered while resolving `pitcher_strikeouts`, and now confirmed to generalize far beyond it: **any population-prior-based shrinkage (the standard M+n_eff method used for the first 13 props) is at real risk of tier-level cancellation that a pooled aggregate gap completely hides.** Every prop from here forward is checked against this before being locked, not just when something looks suspicious.

| Prop | Method | Tier 1-4 gaps (population-prior, M as noted) | Tier 1-4 gaps (pure season rate) | Locked fix |
|---|---|---|---|---|
| `hitter_strikeouts` (clears 0) | M=60 vs. pure season | +12.41 / +2.64 / -4.16 / -11.49 | **+2.68 / +0.08 / -1.06 / -1.93** | **Pure season rate — LOCKED. Same underlying issue as `pitcher_strikeouts`: day-to-day recency signal is mostly noise for strikeout-type props.** |
| `triples` (clears 0) | M=800/1500 vs. pure season | +1.45-1.47 / +1.37-1.38 / +0.10 / -2.13 to -2.15 | **+0.54 / +0.39 / -0.02 / -0.67** | **Pure season rate — LOCKED. No severe cancellation here (rare-event M already reasonable), but pure season rate is simplest and best across all four tiers.** |
| `fantasy_score` (hitter, real weighted formula: 2·RBI+2·R+2·BB+5·2B+3·1B+8·3B+10·HR, clears median=5) | M=100/200 vs. pure season | +14.03-15.24 / +5.67-6.20 / -0.97 to -1.07 / -7.84 to -8.61 | **+5.36 / +1.49 / -0.50 / -1.26** | **Pure season rate — LOCKED. Same cancellation pattern as every population-prior case; composite scoring doesn't change the underlying mechanism.** |
| `pitcher_fantasy_score` (real weighted formula: outs+3·K-3·ER-H-BB, clears median=15) | M=25 vs. pure season | +16.76 / +4.35 / -3.29 / -13.72 | **+8.40 / +1.90 / -1.96 / -6.89** | **Pure season rate — LOCKED. Residual tier 1/4 gaps larger than hitter props (8-9pp) — consistent with this being a strikeout-dominated composite (K is the largest positive weight), inheriting `pitcher_strikeouts`' same residual imperfection.** |
| `pitcher_fantasy_score_ud` (Underdog formula: outs+3·K-3·ER+5·wins, clears median=23) | M=25 vs. pure season | +19.41 / +4.52 / -3.91 / -14.72 | **+9.48 / +1.79 / -1.16 / -8.16** | **Pure season rate — LOCKED. Same pattern and same residual imperfection as the standard pitcher fantasy score, for the same reason (K-dominated).** |

**18 of 23 props now locked.** Remaining: `rfi_nrfi`, `hits_allowed` (needs the separate blowout-stratification mechanism, not a shrinkage-method question at all), `hits_runs_rbis` (has the known separate enrichment-layer bug on top of whichever baseline fix applies), `pitches_thrown` (never assessed by anyone before this).

## What's genuinely still needed before "all prop lines are completely satisfactory"

This is a large, honest list — stated plainly rather than glossed over:

1. **Narrow `walks`' M to a precise value** (currently bounded between 35 and 60, not yet pinned down).
2. **`doubles`** — same simple recency+shrinkage mechanism, not yet run (real season data exists in game logs even though board-offered legs are almost nonexistent for this prop — same fix as the singles/walks pattern applies directly).
3. **`total_bases` and `hits_runs_rbis`** — these need the Negative Binomial overdispersion correction on top of the n_eff fix (Section 3.5 of the original master report), not just the simple binary-threshold approach used above. Real dispersion parameters need re-deriving from the full season (the original report's r=1.046 and r=1.361 were derived from a shorter window and should be re-checked against the full 139-day sample).
4. **`runs`, `pitcher_strikeouts`, `hitter_strikeouts`, `fantasy_score` (hitter), `pitcher_fantasy_score`** — these need the empirical/model blend mechanism (Section 3.6), which requires the model's own historical prediction as one input. `score.prop_outcome_history.estimated_hit_probability_0_100` gives this directly for real historically-served predictions — not yet pulled into this verification.
5. **`hits_allowed`** — needs the blowout-stratified approach (Section 3.7), a completely different mechanism from everything above (game-state-conditional, not a recency/shrinkage fix at all).
6. **`pitcher_outs`, `home_runs`, `stolen_bases`, `walks_allowed`, `earned_runs`** — the props the original report found need no correction. Worth re-confirming on the full 139-day window rather than trusting the shorter original check, given how much more data is now available.
7. **The known, separate `hits_runs_rbis`/`rbis` enrichment-layer bug** (Section 5 of the original report) — entirely unaddressed by any of the above, needs its own root-cause work.

## Next phase, once all props above are genuinely locked

Per the standing instruction: re-run the full enrichment/scoring pipeline (baseline fix + real current enrichment factor contributions, the same method as Section 5 of the original master report) across as many real days as `daily_context`-dependent data actually supports — expected to land around 45 days given how that data's own retention compares to the 139-day game-log window used for pure baseline work above. Then a final, complete validation pass before anything is considered ready for a live deployment discussion.

**This is a large, multi-part undertaking. This document is the running, honest record of exactly how much of it is genuinely done versus still open — update it every time a new prop is completed, rather than waiting until everything is finished to write anything down.**
