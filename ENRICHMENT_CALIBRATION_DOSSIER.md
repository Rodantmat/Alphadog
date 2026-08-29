# ENRICHMENT CALIBRATION — DOSSIER
*Companion to `ENRICHMENT_CALIBRATION_HANDOFF.md` and `CORE_LOGIC_CALIBRATION_DOSSIER.md`. This document covers the enrichment/final-hit-probability layer specifically — the factor-by-factor calibration audit conducted 2026-08-28/29. Everything below is either read directly from live code/config, computed directly against real production data (`backtest.*` and live tables), or sourced from prior-session transcripts with the specific transcript cited. No number here is invented.*

---

## 0. MISSION AND MANDATE

The baseline (`classification.baseline_v6_current`) is accepted as doing a decent job and is **not to be modified** by this program. The enrichment/final-hit-probability layer is supposed to be an *enhancer* on top of the baseline. Instead, empirically, it behaves more like a baseline killer: within a (prop, line, side) cell, the baseline separates winning from losing legs by **+39.8pp**; the final enriched score separates them by only **+5.3pp**.

**Mandate**: find which specific factors, tiers, and layers are causing this — via exhaustive, evidence-driven, day-level-validated research and simulation in `backtest.*` tables only. Nothing touches live tables or deployed workers until a fix demonstrates clear, day-level-robust improvement in simulation.

**Standing rule from the principal**: calibration must be done manually and granularly — per factor, tier, prop line, variation, direction, player, sub-factor — never via the automated daily Platt/beta calibration engine (which tends to over-flatten). The fix has to happen inside the enrichment factors themselves, at the root cause.

---

## 1. THE CONFIRMED PIPELINE (ground truth: `coworker/prompts/Master_Full_Run.txt`)

The enrichment/scoring pipeline runs 3x/day (9am/1pm/5pm Pacific) via a Claude Coworker scheduled task. LAYER 4 (Scoring), exact call sequence:

| Step | Worker (deployed slot) | Mode | Writes |
|---|---|---|---|
| 21 | `phase3b-certifier` | `scoring_full_run_certifier_first_pass` | — |
| 22-23 | `phase2b-recent-form` | `hitter/pitcher_prop_factor_mining` | `scoring.prop_factor_hitter/pitcher_packets`, `scoring.prop_factor_coverage_current` — **confirmed via code read: a data-availability/eligibility gate, not a factor-value computation.** Produces `factor_status`/`missing_reason`/`blocking_for_matrix`. |
| 24 | `phase2b-certifier` | `matrix_build` | `score.prop_matrix_current` — the candidate leg universe |
| 25 | **`phase2a-run-environment`** | `enrichment_run` | `scoring.enrichment_leg_current` — **this is the actual enrichment engine.** ~19-21 factors, additive in log-odds space, per-factor clamp ±1.0, 4-factor "macro environment cluster" combined via signed root-sum-squares, total clamped ±2.0, applied to baseline via clean odds multiplication. |
| 26 | `phase3c-certifier` | `hit_probability_board_run` | `score.hp_board_current` — reads `classification.baseline_v6_current` via `findBaseline()` (nearest-line fallback, no duplicate keys exist so this is moot), combines via `computeRealHitProbability` (odds-space multiply), then applies **Platt-scaling calibration** (`score.platt_calibration_v2`, monotonic per prop+side) and **additive residual-correction bins** (`config.residual_correction_bins`, prop+side+source-keyed) |
| 27 | `phase3a-certifier` | `scoring_engine_run` | fills `score_0_100` — a separate "trust/support" score, independently measured at only +1.23pp discrimination (inside the ±4pp noise floor) |
| 28 | `score-final-board` | `final_board_run` | `score.final_board_current` |
| 29 | `phase3b-certifier` | `scoring_full_run_certifier_last_pass` | — |

**Note**: `score-final-board.js` has a fallback (`hp_sort_0_100 = COALESCE(existing, 0.72*estimated_hit_probability + 0.28*score_0_100)`) — if this fallback ever fires, 28% of the sort key is near-worthless noise from step 27.

---

## 2. METHODOLOGY ESTABLISHED THIS SESSION

### 2.1 Calibration/Platt correction is ruled out as the discrimination-destroying stage
Platt scaling (`C(P) = sigmoid(A*logit(P) + B)`) is monotonic in raw HP within a (prop, side) key. A monotonic transform cannot change rank order within a cell — and the discrimination test (NTILE quartile split) is a rank-based test within cell. Verified empirically: `corr(postcalib_vs_final) = 0.966` on real data — near-identity. **Calibration/residual correction are not the cause of the collapse.**

### 2.2 The correct test for a factor's true value: residual correlation, not raw correlation
Established from prior-session `research_notes` on `times_through_order` and `recent_form_trend` (see §4): raw correlation between a factor's signal and the prop's raw outcome is misleading whenever the signal is mechanically linked to season-long stats the baseline already uses (e.g. batters-faced/start correlates with season K-total by simple arithmetic, not because it adds new information). **The correct test is residual correlation: correlate the factor's contribution against `actual_outcome − baseline's_own_predicted_probability`.** This nets out what baseline already explains.

### 2.3 Day-level significance bar (not pooled correlation)
A pooled correlation across tens of thousands of legs can look highly significant while being driven by within-day correlation (legs on the same day share slate conditions). The correct test: compute `day_covariance = AVG(contribution × residual)` per day, then t-test the day-level series (`mean / (sd/√n_days)`). Bar used this session: **|t| ≳ 2.0** with **≥15 days** per the existing sample-size posture (`CORE_LOGIC_CALIBRATION_DOSSIER.md` §5/6, and the original slip-calibration handoff Part 6.6). A large pooled correlation that fails this test (e.g. `market_implied_total`, t=-1.42 despite 65K legs) is **not proven**, only directional.

### 2.4 Lookahead check for self-built backfills
Any backfill using a historical reference/snapshot table must join **backward-only** (`snapshot_date <= leg_date`), never nearest-by-absolute-distance. Verified this mattered in practice: `batter_quality_of_contact`'s backfill showed t=-4.62 with a naive nearest-date join and t=-4.43 with a corrected backward-only join — the finding survived, but only checking this explicitly confirmed it wasn't an artifact.

---

## 3. FULL FACTOR AUDIT — VERDICT TABLE

`config.enrichment_factors` declares 21 factors (2 of which, `weather_roof` and `catcher_poptime_arm`, are deliberately-disabled documented no-ops). Of the remaining ~19:

| Factor | Cell coverage (prop declared / cell exists) | Day-level result | Verdict |
|---|---|---|---|
| `batter_quality_of_contact` | 4/4 declared, 4/4 cells | Pooled 23-day t=-4.43 **was misleading** — splitting at the documented 2026-08-19 shrinkage fix (see code comment: replaced a backwards 1.3x thin-sample amplification with proper empirical-Bayes shrinkage) gives pre-fix t=-6.688 (14 days, real problem) vs post-fix t=-0.045 (9 days, zero effect) | ✅ **Confirmed already resolved.** Self-backfilled from `ref.batter_quality_of_contact_history` + `stats_hitter.game_logs` (no backtest data existed for this factor). The large pooled effect was a real historical bug already fixed before this session started, not an open issue. Lesson: any multi-week backtest window must be checked for intervening fixes before trusting a pooled average. |
| `opposing_pitcher_quality` | 5/5, 5/5 | Residual-validated at n≈67,001 per prop (prior session, 2026-08-13); 1 sign fix caught (hits, was backwards) | ✅ Best-validated factor in the system |
| `schedule_travel_fatigue` | 6/6, 6/6 | Extended to 6 props 2026-08-20 via real backtest evidence (concrete error deltas w/ vs w/o timezone transition, n=87-681 per prop) | ✅ Reasonably validated |
| `catcher_framing` (walks_allowed) | 2/2, 2/2 | Sign fixed 2026-08-13, grounded in outside FanGraphs research (exact 0.039 magnitude match) | ✅ Validated |
| `times_through_order` | 6 declared / **0 cells** | Deliberately deactivated 2026-08-13: raw corr 0.73 was purely mechanical, residual corr exactly 0 | ✅ Correctly dark — not a bug |
| `recent_form_trend` | 5 declared / 1 prop (pitcher_outs), 2/3 tiers | Deliberately narrowed 2026-08-13 same reasoning; only pitcher_outs carries real tier-concentrated residual signal (0.206/0.114, workhorse tier ~0.010 correctly unconfigured) | ✅ Correctly narrow — not a bug |
| `defensive_quality_oaa` | 4/4 declared (confirmed wired in code + `relevant_prop_keys_json`), but **only 1/4 has a config cell** (hits) | Hits: sign fixed 2026-08-13, weak proxy-based magnitude (-0.006, n=36,790). **Backfill-tested 2026-08-29** via `factor_contributions_asof_v2` (factor_key `defensive_quality`, which already covers doubles/hits/singles — same "backtest computes more than live wires" pattern as other factors): all 3 props show no day-level significance (doubles t=-0.346, hits t=0.184, singles t=0.722, 19-26 days each). `hits_allowed` still has zero cells AND zero backtest data — untested. | 🟡 Wired-but-undetectable for 3/4 props (joins the noise-not-signal bucket); `hits_allowed` remains a genuine, untested gap |
| `lineup_slot` | 3 declared / **1 cell** (runs) | Runs/rbis: weak-but-correct-direction (residual corr ~0.007-0.009, not day-level tested — thin). SD 0.38-0.41, ~27% hit the +1.0 clamp. Extension to `hits_runs_rbis` (present in backtest data, not live) is **wrong-signed** (-0.0166) | 🔴 High-variance, near-zero-value noise injector on the props it does fire on |
| `lineup_surrounding_quality` | 3 declared / **1 cell** (rbis) | Code is real (2026-07-31 fix wired OBP computation), not a stub. No dedicated validation found for any prop, including the one with a cell. | 🟡 Real 2-prop gap, thin evidence even where wired |
| `market_implied_total` | 6/6 cells exist, but **explicitly flagged as uncalibrated placeholders** ("only 3 rows of market data exist system-wide... flag for recalibration once real market data accumulates", added 2026-08-13) | All 6 current coefficients positive; day-level test on 5 hitter props: **t = -1.42 (28 days)** — directionally opposite current sign, NOT significant | 🟡 Unproven placeholder, not confirmed bug |
| `bullpen_fatigue` | 4/4 declared, 8 cells (2 tiers × 4 props) | t = 2.01 (10 days) — marginal, wrong-signed, below the 15-day sample bar | 🟡 Thin, directionally concerning |
| `platoon_handedness` | 7 declared, 21 cells (3 tiers × 7) | t = 0.968 (18 days) — not significant | 🟡 Fully wired, no detectable net value |
| `umpire_tendency` | 6 declared, 18 cells | t = 1.695 (27 days) — not significant | 🟡 Fully wired, no detectable net value |
| `weather_wind` | 6 declared, 30 cells | t = 1.690 (12 days) — not significant | 🟡 Fully wired, no detectable net value |
| `park_factors` | 4/4, 4 cells | t = 0.200 (28 days) — no effect. **Independently corroborated**: a separate clustering test (old-chat search, 2026-08-29) found the prior claimed Z=3.87/-4.59pp result collapses under day-clustering (clustered t=-1.04, exactly 7-pos/7-neg days) | ✅ Resolved — confirmed no real effect via two independent methods |
| `weather_temp_altitude_pressure` | 4/4, 4 cells | t = -0.084 (28 days) — no effect | 🟡 Fully wired, no detectable net value |
| `stolen_base_family` | 1/1, 3 cells (3 tiers) | Zero variance — confirmed placebo/noise-floor control | ✅ Correct as-is |
| `weather_precip` | 6/6, 5 cells | **Untestable** — no historical precipitation data exists anywhere in the system. Checked: `daily.game_weather_current` (live-only, overwritten), `daily.game_weather_snapshots` (only 2 days retained despite the name), `context.history_game_weather` (88% NULL `condition`, no numeric field). Adjacent evidence (old-chat search): the `weather_roof` code comment independently confirms `context.history_game_weather`'s condition field is null for every retractable-venue game on record — same table, same category of gap. | ⚫ Confirmed permanent data gap, not fixable without a new data source |
| `player_availability` | flat_gate, real IL-return regex classifier | No dedicated statistical validation found (old-chat search confirmed real code, not a stub, but no backtest study) | ⚫ Never tested |
| `catcher_poptime_arm`, `weather_roof` | — | Deliberately, correctly disabled (documented double-count/no-op reasoning) | ✅ Correct as-is |

**Pattern**: of ~19 active factors, only 3-4 (`opposing_pitcher_quality`, `schedule_travel_fatigue`, `catcher_framing`, arguably `defensive_quality_oaa`'s one validated prop) have real, day-level-caliber evidence of genuine positive value. Most of the rest are either confirmed-zero-effect-but-real-variance (noise contributors) or genuinely untested. `batter_quality_of_contact` looked like the largest active problem initially but turned out to be a real, already-fixed historical issue (see table) — no currently-open factor in this audit shows anywhere near that magnitude of confirmed, live, wrong-signed effect. The honest summary is closer to "many weak/undetectable factors contributing noise" than "one dominant villain."

---

## 4. RULED OUT / RESOLVED THIS SESSION

| Hypothesis | Resolution |
|---|---|
| Naive probability-scale multiplicative clamping (original handoff's leading hypothesis) | **Refuted.** Enrichment is additive in log-odds space with per-factor clamps ±1.0, RSS-combined macro cluster, total clamp ±2.0. Multiplier log-SD (~0.11-0.13) is 3-9x too small to produce the observed within-cell correlation drop by simple variance arithmetic. |
| Reprocessing/lookahead bias (historical boards scored against today's baseline) | **Refuted.** Same-day-live legs (no lookahead possible) show the identical collapse (+40pp baseline / +5-7pp enriched) as reprocessed-day legs. |
| Small-sample noise inflating `baseline_v6_asof`'s spread | **Refuted.** Spread stays ~+39.5pp even restricted to `non_push_sample ≥ 50`. |
| Platt/residual calibration destroying discrimination | **Refuted.** Monotonic within cell; cannot change rank order. Verified `corr(postcalib, final) = 0.966`. |
| `park_factors` real negative signal (Z=3.87, -4.59pp) | **Refuted**, independently, twice (day-level block bootstrap this session, day-clustering test found via old-chat search). |
| `effectiveHebM` "locked HEB contract" (per-player anti-over-shrinkage safeguard) | Confirmed **dead code** — defined once in the baseline formula file, never called. Real bug, but measured `prior_strength` magnitudes (avg 2.72, max 11.88, never near the theoretical cap of 100) suggest it's likely not the dominant driver of any collapse. |

---

## 5. STILL OPEN

1. **Baseline provenance three-way discrepancy**: `baseline_v6_asof` (+39.76pp) vs live `classification.baseline_v6_current` read today (+17.78pp) vs production's own historically-recorded value at scoring time (+5.21pp), on the identical population of real graded legs. Old-chat search confirmed `baseline_v6_asof` is a deliberately isolated, walk-forward point-in-time reconstruction, structurally separate from live — a plausible root cause for *some* divergence — but the specific 3-way gap has not been directly reconciled anywhere.
2. `bullpen_fatigue` — only 10 days of backtest data exist; no additional historical source found.
3. `market_implied_total`/`pitcher_strikeouts` coefficient (-1) — present since at least 2026-08-20 (part of a 21-factor Gemini audit that day), no dedicated validation of its own found.
4. Daily Context layer (LAYER 2 of `Master_Full_Run.txt`) coverage history — all 8 tables (lineups, weather, player availability, bullpen, probable pitchers, schedule spot, umpire, catcher context) are live `_current` snapshot tables with no historical retention found. Cannot verify whether any of the 32 backtest days had missing/stale daily-context data that would have caused enrichment factors to silently go "missing" on those specific days.
5. `defensive_quality_oaa` (singles/doubles/hits_allowed), `lineup_surrounding_quality`, `player_availability` — all confirmed as real, wired code, but none independently residual/day-level validated.

---

## 6. NEXT STEPS (per standing process: research → simulate in backtest → only then consider live)

1. Backfill `defensive_quality_oaa` for singles/doubles/hits_allowed using the same residual methodology already validated for hits.
2. Recalibrate or remove `lineup_slot`'s cap given its confirmed near-zero true value relative to its variance.
3. Continue residual-testing the untested-but-wired factors (`lineup_surrounding_quality`, `player_availability`) with real backtest data.
4. Any future pooled multi-week finding must be checked for intervening code/config fixes (split at the fix date) before being treated as an open, actionable issue — the `batter_quality_of_contact` false alarm (§3) is the concrete cautionary example.
5. Once individual factor fixes are validated, combine into one full re-simulation (all fixes together) and run the day-level block bootstrap on the *combined* within-cell discrimination improvement — the real bar is the combined effect, not each factor in isolation.
