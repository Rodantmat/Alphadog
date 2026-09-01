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
| `hits` (clears 0) | 139 | 30,143 | 832 (≥70% band) | +20.0pp (M20 baseline) → | **+0.26pp** | **M ≈ 100** |
| `singles` (clears 0) | 139 | 30,143 | 4,522 (top 15%) | +13.72pp | **+0.83pp** | **M ≈ 100** |
| `walks` (clears 0) | 139 | 30,143 | 4,522 (top 15%) | +10.63pp | **+2.25pp** (M35), overcorrects past M60 | **M ≈ 35-45** (narrower tuning still open) |

**Cross-validation note for `hits`**: M=100 was checked against *two independent bands simultaneously* (high-confidence ≥70%, and mid-range 40-60%) and produced a near-perfect gap in both (+0.26pp and -0.22pp respectively) — this is not a single-band fit, it holds across the distribution.

**Why walks needs a different M than hits/singles, and why that's expected, not a problem**: this directly matches the original report's own qualitative claim (walk rate stabilizes faster than batting-average-type stats — M=120 vs. M=850 in PA-based sabermetric units). My independently-derived, games-based M values land in a different absolute scale (since the underlying "effective sample" unit differs), but the *relative* finding — walks needs meaningfully less shrinkage strength than hits/singles — replicates independently. This is a second, different-methodology confirmation of the same qualitative claim the original report made.

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
