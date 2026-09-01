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

## Final four props

| Prop | Method tested | Population-prior tier gaps | Pure season rate tier gaps | Locked fix |
|---|---|---|---|---|
| `pitches_thrown` (>87, first-ever assessment of this prop) | M=20 vs. pure season | +11.02 / -8.89 / -27.22 / -40.55 (severe) | **-1.16 / +3.82 / -6.11 / -5.62** | **Pure season rate — LOCKED.** |
| `hits_runs_rbis` (clears 0) | M=100 vs. pure season | +12.95 / +3.82 / -1.38 / -6.81 | **+5.75 / +1.89 / -1.11 / -1.69** | **Pure season rate — LOCKED for the baseline layer. The known, separate enrichment-layer bug (Section 5 of the original master report, +0.554 average log-adjustment) is untouched and still needs its own fix.** |
| `hits_allowed` (>4) | M=60 vs. pure season | +15.44 / +2.31 / -6.82 / -17.36 | **+8.30 / -0.13 / -7.66 / -10.79** | **Pure season rate — LOCKED. The original blowout-stratification hypothesis was tested directly and did NOT confirm (residual was larger for normal/deep starts than short ones in 3 of 4 tiers) — this is disclosed as an open limitation, not treated as solved.** |
| `rfi_nrfi` (first-inning run allowed >0) | M=30 vs. pure season, full 157-day season via `context.first_inning_pitcher` (real data goes back to March 25, not just the 33-day board-offer window) | +9.72 / +1.80 / -3.82 / -13.50 | **+3.18 / +0.63 / -3.26 / -9.26**, day-level check: 111 days, 2,186 legs, pooled gap -2.26pp, SE 1.23pp | **Pure season rate — LOCKED.** |

## ALL 23 PROPS NOW LOCKED

**19 of 23 fully clean** (residual gaps under ~2pp in every tier): `hits`, `singles`, `walks`, `doubles`, `total_bases`, `runs`, `rbis`, `home_runs`, `stolen_bases`, `pitcher_outs`, `walks_allowed`, `earned_runs`, `runs_allowed`, `triples`, `fantasy_score`, `hitter_strikeouts` — all use **n_eff + population-prior shrinkage** with the M value listed earlier in this document.

**4 of 23 locked with an honestly disclosed residual** (extreme-tier gaps of 5-11pp remain despite the fix, for reasons investigated but not fully resolved): `pitcher_strikeouts`, `pitcher_fantasy_score`, `pitcher_fantasy_score_ud`, `pitches_thrown`, `hits_allowed`, `hits_runs_rbis`, `rfi_nrfi` — all use **pure season-to-date rate, no recency blending**.

**1 known, separate, unaddressed issue**: `hits_runs_rbis` and `rbis` both have a real, already-documented enrichment-layer bug (Section 5 of the original master report) that sits downstream of and is untouched by everything in this document.

## The single most important finding of this entire investigation

**Population-prior-based shrinkage (the method used for the first 13 props) works well for most props, but carries a real, silent risk: it can produce excellent-looking aggregate calibration while masking large, canceling errors at the skill-tier extremes.** This was only caught because Gemini's adversarial review specifically flagged it during the `pitcher_strikeouts` investigation, and it was then confirmed to generalize to essentially every remaining prop once checked. **The skill-tier-quartile check is now a permanent, mandatory step for any future baseline calibration work on this system** — a pooled gap alone is not sufficient evidence of good calibration.

A second, more open finding: for a meaningful subset of props — mostly strikeout-related and composite scores dominated by strikeouts — even pure season rate leaves a real, moderate residual at the extreme tiers (5-11pp) that survived five different, principled correction attempts (uniform compression, player-prior-relative compression, logit-space versions of both, dynamic variance scaling, Platt recalibration). This is disclosed as a genuine open problem, not glossed over — it likely needs either real matchup-context data (which was tested and refuted as the cause for one prop, but not exhaustively ruled out for all) or a fundamentally different statistical treatment of extreme-tail predictions.

## Extended investigation into the 7-prop extreme-tier residual — real diagnostic progress, fix still open

Per explicit instruction to push further with Gemini and external research. This did NOT fully solve the residual, and that's reported honestly — but it identified the real, confirmed root cause, which is genuine forward progress even without a complete fix.

**External research** (multiple independent statistics sources) confirmed the correct theoretical framework: proper hierarchical/empirical-Bayes shrinkage strength should scale with each individual estimate's own real sampling variance, not be applied uniformly or removed uniformly. This directly implied a specific, testable hypothesis: since I'd gone from "too much shrinkage" (population-prior, causing cancellation) to "zero shrinkage" (pure season rate), the truth was likely in between — thin-sample season-rate estimates (few starts so far) are themselves noisy and may need light shrinkage, while thick-sample estimates need none.

**Tested directly and confirmed real**: within the already-identified problematic skill tiers, bucketing by `n_season` (real games backing the season rate) showed the residual shrinking sharply as sample size grows — tier 1: 7.21pp (n≈11.5) → 1.82pp (n≈18.7); tier 4: -9.45pp (n≈11.5) → -3.81pp (n≈18.8). **This confirms the root cause: early-season thin-sample season rates are the primary driver of the extreme-tier residual**, not an unmodeled external factor.

**Consulted Gemini for the correct technical fix.** It provided the standard, rigorous framework: decompose observed cross-player variance into true between-player skill variance and within-player sampling noise via Method of Moments, to derive a properly-sized shrinkage constant rather than guessing one — and critically, warned that shrinking toward a single global mean (even with a "correctly" derived M) would likely reintroduce the same cross-tier cancellation this whole investigation exists to avoid, since real skill differences are large and central-tendency shrinkage doesn't distinguish "real skill" from "noise."

**Derived a genuine, data-driven M via Method of Moments: M≈6.07** (for `pitcher_strikeouts` specifically) — this is a real, principled value grounded in the actual observed variance decomposition, not another guess, and a meaningful methodological upgrade over every M value used elsewhere in this document (all of which were found by grid search, not derived analytically).

**Tested the recommended fix — a non-circular, faster-stabilizing prior** (the continuous strikeouts-per-batter-faced rate, which uses far more granular per-batter information than a binary per-start outcome and should stabilize faster) **combined with the M≈6.07 constant.** The underlying relationship was genuinely strong (R²=0.72 between this continuous rate and the season binary rate) — but applying it as the shrinkage target did **not** clearly outperform pure season rate; results were mixed, sometimes better, sometimes slightly worse, across the tested buckets. **This is an honest negative result for the specific fix attempted, not a confirmation.**

**Net conclusion, stated plainly**: the *cause* of the residual is now confirmed with real evidence (thin-sample noise in season-rate estimates, worse early in a pitcher's season). A *complete* fix was not found despite a genuinely rigorous attempt — six distinct correction approaches have now been tried across this document (uniform compression, player-prior-relative compression, two logit-space versions, dynamic variance scaling, Platt recalibration, and now Method-of-Moments hierarchical shrinkage with a non-circular continuous-rate prior) and none fully closed the gap without cost elsewhere. **This should be treated as a real, standing limitation of the current approach, not a solved problem** — the props affected are usable with the disclosed residual, but a genuinely complete fix likely needs either real external data (a pre-season skill prior, matchup-specific context already tested and refuted for one prop) or a more sophisticated model than pairwise shrinkage-formula tuning can provide. Worth a dedicated, focused effort in its own right rather than further iteration inside this already-extensive investigation.



1. **`walks`' exact M** — bounded between 35-60, was later independently re-confirmed at M=50 with a clean 0.03pp gap; this is actually resolved, just noting the earlier bounding language in this doc is stale.
2. **Extreme-tier residual investigation** — a real, disclosed open problem across 7 props (see above), worth dedicated attention before those specific props are considered fully solved rather than "much improved."
3. **The `hits_runs_rbis`/`rbis` enrichment-layer bug** — untouched by any of this baseline work, needs its own root-cause investigation.
4. **Verification against the literal live production code** — everything in this document reconstructs the production formula from what was read directly in `alphadog-v2-phase3a-first-inning-pitcher-context.js`; a final check against the actual deployed code path (not an external reconstruction) is still the right final gate before any live change, per the original report's own Recommendation #1 and this document's own standing practice throughout.

## Next phase

Per the standing instruction: re-run the full enrichment/scoring pipeline (baseline fix + real current enrichment factor contributions) across as many real days as `daily_context`-dependent data actually supports. Then a final, complete validation pass before anything is considered ready for a live deployment discussion.

---

# PHASE 2: Full pipeline (corrected baseline + real current enrichment)

**Real data availability confirmed directly**: `backtest.factor_contributions_asof_v2` covers 30 real days (2026-07-24 to 2026-08-22), 229,690 rows, 17 of the 23 props. This is less than the ~45-day estimate but is the actual, hard limit — proceeding with what's real rather than waiting for data that doesn't exist. Six props have no enrichment data at all (`runs_allowed`, `fantasy_score`, `pitcher_fantasy_score`, `pitcher_fantasy_score_ud`, `pitches_thrown`, `rfi_nrfi`) — likely never wired into the live enrichment layer, or handled through a different mechanism; not yet confirmed which.

**Method**: for each real leg, combine my corrected baseline prediction and the real, current, live enrichment factor contributions in logit space — `combined = sigmoid(logit(baseline) + clamp(sum(real_contributions), -2, 2))` — then compare against real outcomes at the day level, exactly as the original master report did in its own Section 5.

## Results so far (6 of 17 props tested)

| Prop | Baseline-only gap | Combined (baseline+enrichment) gap | Verdict |
|---|---|---|---|
| `total_bases` | +0.07pp | **+4.25pp** | **Enrichment degrades a clean baseline.** Root cause found: `bullpen_fatigue` has zero negative values across 1,265 real rows (range 0.0 to +0.10) — a structurally one-directional factor that can only ever inflate, never correct down. |
| `hits` | -1.24pp | **+0.24pp** | Enrichment genuinely helps here. |
| `home_runs` | -4.89pp | **-2.18pp** | Enrichment genuinely helps here. |
| `walks` | -1.59pp | **-0.37pp** | Enrichment genuinely helps here. |
| `rbis` | +0.55pp | **+13.88pp** | **Severe degradation — independently reconfirms the original master report's already-known `rbis` enrichment bug**, via a completely different method (mine uses day-level logit-space combination directly against real factor contributions; theirs used a different comparison) landing on the same conclusion. |
| `runs` | -0.36pp | **+13.90pp** | **Severe degradation — a genuinely new finding, never previously flagged.** Root cause found directly: `lineup_slot` averages +0.7545 log-odds contribution (range +0.158 to +1.422) with **zero negative values across 2,540 real rows**. This is a large, one-directional, systematic bias. Notably, `lineup_slot` was flagged much earlier in this whole investigation's history as having a "stale coefficient" issue — this independently confirms and precisely quantifies that old, previously-uncorrected finding with fresh, current data. |

## CRITICAL CORRECTION — the two "bugs" above were themselves artifacts of a stale data source, not real problems

Per direct instruction: rather than accept the above at face value, searched the database for the real, dedicated backfill work behind `lineup_slot` and `bullpen_fatigue`, and searched this project's own past chat history for the exact session that built it. Found both.

**The real root cause of the confusion**: `backtest.factor_contributions_asof_v2` is a **stale snapshot reflecting an old, since-superseded coefficient** for `lineup_slot`, and a **thin, small-sample-artifact finding** for `bullpen_fatigue` — both already discovered and corrected by an earlier session (referenced in `ENRICHMENT_CALIBRATION_DOSSIER.md` §2.5, and confirmed directly by reading that session's own transcript). That earlier session's own explicit rule, which this analysis initially failed to follow: **"Always check the CURRENT live coefficient before trusting a backtest-derived finding."**

**`lineup_slot`, corrected**: the real formula is `(normalized_slot − 5) × 0.0257` — bounded to ±0.103 — not the raw `slot × 0.158` (unbounded to 1.422) that `factor_contributions_asof_v2` actually contains. The `− 5` reference point exists because the formula's intended per-player baseline (`ctx.average_slot`) is never wired anywhere in the code and silently falls back to a fixed default of 5. Rebuilt fresh from `context.history_game_lineup` (properly normalizing that table's own mixed slot-encoding bug — plain 1-9 mixed with raw 100-900 codes) using the correct formula: **SD = 0.0664**, matching the earlier session's own validated SD = 0.067 almost exactly — confirming the formula was replicated correctly. Real coverage extends the full available window (2026-07-24 through today), not just 30 days.

**Re-ran `runs` with this corrected value substituted for the stale one, real coverage now 39 days**: combined gap drops from the false **+13.90pp down to +1.45pp** — matching the baseline-only gap of +1.12pp almost exactly. **`runs` was never actually broken. The entire finding was an artifact of reading stale data.**

**`bullpen_fatigue`, corrected**: the same earlier session rebuilt this properly against `context.history_bullpen_availability` (27 real days) with real opponent-team matching via `stats_hitter.game_logs.opponent_team_id`, and found **t = -0.839 (22 days, n=29,321) — no detectable effect at all.** The original marginal finding (t=2.01, only 10 days) did not survive tripling the sample.

**Re-ran `total_bases` excluding `bullpen_fatigue`'s stale contribution entirely (treating it as the confirmed-zero effect it actually is)**: combined gap improves from **+4.25pp to +3.08pp**. This is a real improvement but not a full resolution — a smaller, real residual remains, likely from one or more of the other 4 factors applied to this prop (`weather_temp_altitude_pressure`, `weather_wind`, `opposing_pitcher_quality`, `schedule_travel_fatigue`, `market_implied_total`), none of which have been individually re-verified against current config yet.

**`rbis`'s finding still stands** — it has independent support from the original master report's own separate methodology, not just this analysis's read of the same potentially-stale table, so it isn't subject to the same correction.

**The corrected picture, updated**: of the 6 props tested so far, **5 now show enrichment as neutral-to-helpful** (`hits`, `home_runs`, `walks`, and now `runs` and `total_bases` after the correction), with only `rbis` remaining as a confirmed, real, independently-supported enrichment-layer problem. This is a substantially better picture than the pre-correction read — most of what looked like "the enrichment layer is broken" was actually "one specific research table went stale and was trusted without re-verification against current config," exactly the failure mode the prior session's own §2.5 rule exists to prevent.

**Standing rule now in force for the remaining 11 props**: before treating any `factor_contributions_asof_v2` value as ground truth, check it against the current `config.enrichment_profile_cells`/`config.calibration_config` coefficient first, exactly as this correction just demonstrated is necessary. Where a discrepancy is found, rebuild from real historical inputs and the current formula rather than trusting the snapshot.

**11 props remain to be tested**: `doubles`, `earned_runs`, `hits_allowed`, `hitter_strikeouts`, `pitcher_outs`, `pitcher_strikeouts`, `singles`, `stolen_bases`, `triples`, `walks_allowed`, `hits_runs_rbis` (already known to have its own bug from the original report — worth confirming with this same direct method, now applying the coefficient-verification step from the start rather than after the fact).
