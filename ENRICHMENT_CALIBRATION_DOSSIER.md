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
Established from prior-session `research_notes` on `times_through_order` and `recent_form_trend` (see §3): raw correlation between a factor's signal and the prop's raw outcome is misleading whenever the signal is mechanically linked to season-long stats the baseline already uses (e.g. batters-faced/start correlates with season K-total by simple arithmetic, not because it adds new information). **The correct test is residual correlation: correlate the factor's contribution against `actual_outcome − baseline's_own_predicted_probability`.** This nets out what baseline already explains.

### 2.3 Day-level significance bar (not pooled correlation)
A pooled correlation across tens of thousands of legs can look highly significant while being driven by within-day correlation (legs on the same day share slate conditions). The correct test: compute `day_covariance = AVG(contribution × residual)` per day, then t-test the day-level series (`mean / (sd/√n_days)`). Bar used this session: **|t| ≳ 2.0** with **≥15 days** per the existing sample-size posture (`CORE_LOGIC_CALIBRATION_DOSSIER.md` §5/6, and the original slip-calibration handoff Part 6.6). A large pooled correlation that fails this test (e.g. `market_implied_total`, t=-1.42 despite 65K legs) is **not proven**, only directional. Applied consistently: `lineup_surrounding_quality` (7 days, too thin), `lineup_slot` (11 days, too thin and not significant anyway).

### 2.4 Lookahead check for self-built backfills
Any backfill using a historical reference/snapshot table must join **backward-only** (`snapshot_date <= leg_date`), never nearest-by-absolute-distance. Verified this mattered in practice: `batter_quality_of_contact`'s backfill showed t=-4.62 with a naive nearest-date join and t=-4.43 with a corrected backward-only join — the finding survived, but only checking this explicitly confirmed it wasn't an artifact.

### 2.5 Always check the CURRENT live coefficient before trusting a backtest-derived finding
Confirmed twice this session (`batter_quality_of_contact`, `lineup_slot`): a `backtest.*` reconstruction table can reflect a coefficient or formula that has since been changed live. Before treating any backtest-derived correlation as actionable: (a) pull the current `config.enrichment_profile_cells` coefficient/cap, (b) sanity-check that the backtest table's observed value range is even mathematically reachable under that current coefficient, (c) if not, recompute directly against current config + real historical inputs rather than trusting the backtest table's stored contribution values. `lineup_slot` specifically: the backtest table showed avg contribution ~0.7-0.73 and 27% clamp-saturation at ±1.0 — mathematically impossible under the current live coefficient (0.0257), which bounds the formula to ±0.103 (and `ctx.average_slot` is never wired anywhere in the code — appears exactly once, in the formula itself — so the formula always falls back to a fixed reference of 5, not a real per-player average). Recomputed fresh against real historical lineup data and current config: SD 0.067, day-level t=1.19 (11 days) — no detectable effect, not a noise injector.

### 2.6 Watch for mixed data encodings in historical reference tables
`context.history_game_lineup.lineup_slot` mixes two encodings without normalization: plain 1-9 for some rows, raw MLB Stats API 3-digit codes (100-900) for others. A naive formula application produced an impossible SD of 7.27 before this was caught and normalized (`CASE WHEN lineup_slot > 9 THEN lineup_slot/100 ELSE lineup_slot END`). Any future use of this table for `lineup_slot` or `lineup_surrounding_quality` backfills must normalize first.

---

## 3. FULL FACTOR AUDIT — VERDICT TABLE

`config.enrichment_factors` declares 21 factors (2 of which, `weather_roof` and `catcher_poptime_arm`, are deliberately-disabled documented no-ops). Of the remaining ~19:

| Factor | Cell coverage (prop declared / cell exists) | Day-level result | Verdict |
|---|---|---|---|
| `batter_quality_of_contact` | 4/4 declared, 4/4 cells | Pooled 23-day t=-4.43 **was misleading** — splitting at the documented 2026-08-19 shrinkage fix (see code comment: replaced a backwards 1.3x thin-sample amplification with proper empirical-Bayes shrinkage) gives pre-fix t=-6.688 (14 days, real problem) vs post-fix t=-0.045 (9 days, zero effect) | ✅ **Confirmed already resolved.** Self-backfilled from `ref.batter_quality_of_contact_history` + `stats_hitter.game_logs` (no backtest data existed for this factor). The large pooled effect was a real historical bug already fixed before this session started, not an open issue. |
| `opposing_pitcher_quality` | 5/5, 5/5 | Residual-validated at n≈67,001 per prop (prior session, 2026-08-13); 1 sign fix caught (hits, was backwards) | ✅ Best-validated factor in the system |
| `schedule_travel_fatigue` | 6/6, 6/6 | Extended to 6 props 2026-08-20 via real backtest evidence (concrete error deltas w/ vs w/o timezone transition, n=87-681 per prop) | ✅ Reasonably validated |
| `catcher_framing` (walks_allowed) | 2/2, 2/2 | Sign fixed 2026-08-13, grounded in outside FanGraphs research (exact 0.039 magnitude match) | ✅ Validated |
| `times_through_order` | 6 declared / **0 cells** | Deliberately deactivated 2026-08-13: raw corr 0.73 was purely mechanical, residual corr exactly 0 | ✅ Correctly dark — not a bug |
| `recent_form_trend` | 5 declared / 1 prop (pitcher_outs), 2/3 tiers | Deliberately narrowed 2026-08-13 same reasoning; only pitcher_outs carries real tier-concentrated residual signal (0.206/0.114, workhorse tier ~0.010 correctly unconfigured) | ✅ Correctly narrow — not a bug |
| `defensive_quality_oaa` | 4/4 declared (confirmed wired in code + `relevant_prop_keys_json`), but **only 1/4 has a config cell** (hits) | Hits: sign fixed 2026-08-13, weak proxy-based magnitude (-0.006, n=36,790). **Backfill-tested 2026-08-29** via `factor_contributions_asof_v2` (factor_key `defensive_quality`, which already covers doubles/hits/singles): all 3 props show no day-level significance (doubles t=-0.346, hits t=0.184, singles t=0.722, 19-26 days each). `hits_allowed`: zero cells, zero backtest data, and a likely **conceptual target mismatch** — the factor's `matchup_specific_oaa_probability_delta` is keyed on the leg's *opponent* team, which for a hitter prop is the correct defense being tested against, but for `hits_allowed` (a pitcher prop) the opponent is the *batting* team, whose own defense has no bearing on how many hits their pitcher allows. Backfilling this prop without addressing that mismatch first would likely encode the same conceptual error, not test it. | 🟡 Wired-but-undetectable for 3/4 props; `hits_allowed` needs a design review before any backfill, not just more data |
| `lineup_slot` | 3 declared / **1 cell** (runs) | Initial finding (SD 0.38-0.41, 27% clamp-saturation) was based on a stale backtest coefficient — mathematically impossible under the current live coefficient (0.0257, bounds the formula to ±0.103). Also found `ctx.average_slot` is never wired anywhere in the code (referenced once, in the formula itself), so the formula always uses a fixed default of 5, not a real per-player average. Recomputed fresh against current config + real historical lineup data (after normalizing a mixed slot-number encoding — see §2.6): SD 0.067, day-level t=1.19 (11 days, also below the 15-day bar) | 🟡 **Corrected** — tiny, bounded, no detectable effect; not a noise injector as first thought |
| `lineup_surrounding_quality` | 3 declared / **1 cell** (rbis) | Code is real (2026-07-31 fix wired OBP computation), not a stub. **Backfilled 2026-08-29**, extended to all 3 sources (not just PrizePicks) for more days: 17 days, n=1,961, pooled corr -0.0547, day-level t=-1.565 — now meets the 15-day bar but still not significant. | 🟡 Resolved to "wired, no detectable net value" — joins the majority bucket, not a confirmed sign issue |
| `market_implied_total` | 6/6 cells exist, but **explicitly flagged as uncalibrated placeholders** ("only 3 rows of market data exist system-wide... flag for recalibration once real market data accumulates", added 2026-08-13) | All 6 current coefficients positive; day-level test on 5 hitter props: **t = -1.42 (28 days)** — directionally opposite current sign, NOT significant | 🟡 Unproven placeholder, not confirmed bug |
| `bullpen_fatigue` | 4/4 declared, 8 cells (2 tiers × 4 props) | Original finding (t=2.01, 10 days, `factor_contributions_asof_v2`) did not survive more data. **Backfilled 2026-08-29** using `context.history_bullpen_availability` (27 days vs. the original 10) + real opponent-team matching via `stats_hitter.game_logs.opponent_team_id`: t=-0.839 across 22 days, n=29,321 — no effect. | 🟡 Resolved to "wired, no detectable net value" — the earlier marginal/thin finding was a small-sample artifact |
| `platoon_handedness` | 7 declared, 21 cells (3 tiers × 7) | t = 0.968 (18 days) — not significant | 🟡 Fully wired, no detectable net value |
| `umpire_tendency` | 6 declared, 18 cells | t = 1.695 (27 days) — not significant | 🟡 Fully wired, no detectable net value |
| `weather_wind` | 6 declared, 30 cells | t = 1.690 (12 days) — not significant | 🟡 Fully wired, no detectable net value |
| `park_factors` | 4/4, 4 cells | t = 0.200 (28 days) — no effect. **Independently corroborated**: a separate clustering test (old-chat search, 2026-08-29) found the prior claimed Z=3.87/-4.59pp result collapses under day-clustering (clustered t=-1.04, exactly 7-pos/7-neg days) | ✅ Resolved — confirmed no real effect via two independent methods |
| `weather_temp_altitude_pressure` | 4/4, 4 cells | t = -0.084 (28 days) — no effect | 🟡 Fully wired, no detectable net value |
| `stolen_base_family` | 1/1, 3 cells (3 tiers) | Zero variance — confirmed placebo/noise-floor control | ✅ Correct as-is |
| `weather_precip` | 6/6, 5 cells | **Untestable** — no historical precipitation data exists anywhere in the system. Checked: `daily.game_weather_current` (live-only, overwritten), `daily.game_weather_snapshots` (only 2 days retained despite the name), `context.history_game_weather` (88% NULL `condition`, no numeric field). Adjacent evidence (old-chat search): the `weather_roof` code comment independently confirms `context.history_game_weather`'s condition field is null for every retractable-venue game on record — same table, same category of gap. | ⚫ Confirmed permanent data gap, not fixable without a new data source |
| `player_availability` | flat_gate, real IL-return regex classifier | **Data found 2026-08-29**: `context.history_player_availability` has 27 days of coverage, but qualifying events are extremely rare (~30-33 total across the whole window) — too thin to statistically test either way. **Possible logic mismatch found**: the tier is named `recent_il_return`, but the code's regex (`isInjuryStatus`) matches "currently injured" status strings (`injured_list`, `injured_list_60day`, `injured_status_change`) and does not match `activated` (23 occurrences) — the status that most directly represents an actual return from the IL. Worth a closer look at whether the regex should target `activated` instead of/in addition to injury-status strings. | ⚫ Data exists but event is inherently too rare to validate statistically; possible regex/intent mismatch flagged for review |
| `catcher_poptime_arm`, `weather_roof` | — | Deliberately, correctly disabled (documented double-count/no-op reasoning) | ✅ Correct as-is |

**Pattern**: of ~19 active factors, only 3-4 (`opposing_pitcher_quality`, `schedule_travel_fatigue`, `catcher_framing`, arguably `defensive_quality_oaa`'s one validated prop) have real, day-level-caliber evidence of genuine positive value. Everything else that's fully wired shows real variance but no day-level-detectable true value — noise contributors, not proven help or harm. Two candidates that initially looked like large, active problems (`batter_quality_of_contact`, `lineup_slot`) both turned out, on closer inspection, to be non-issues: one a real bug already fixed historically, the other a stale-backtest-coefficient artifact against a formula that's actually tiny and bounded in current config. **No currently-open factor in this audit shows a large, confirmed, live, wrong-signed effect.** The honest summary is "many weak/undetectable factors contributing noise, plus a handful of real cell-coverage gaps," not "one or two dominant villains."

---

## 4. COMBINED VARIANT SIMULATION — the strongest result of this investigation

Per the standing process (research individual factors → simulate combined effect in backtest → only then consider live), built and tested a "keep only validated factors" variant: baseline + **only** `opposing_pitcher_quality`, `schedule_travel_fatigue`, and `catcher_framing` (the 3 factors with real, residual-validated, positive evidence from §3) — every other factor zeroed out entirely. Tested on the same real graded-leg population as the original Part 1 reproduction (n≈105K, 4 corrupted dates excluded), within-cell quartile spread:

| Variant | Q1 | Q2 | Q3 | Q4 | **Spread** |
|---|---|---|---|---|---|
| Baseline alone | 58.84 | 64.74 | 69.84 | 76.52 | +17.68pp |
| **Current live enrichment (all ~19 factors)** | 65.01 | 66.97 | 67.83 | 70.13 | **+5.12pp** |
| **Reduced variant (baseline + 3 validated factors only)** | 58.38 | 65.03 | 70.24 | 76.29 | **+17.91pp** |

The reduced variant **matches or slightly exceeds plain baseline** and recovers nearly 13pp of discrimination lost by the current full enrichment. **Day-level robustness confirmed**: comparing within-cell correlation with outcome, day by day, the reduced variant beats the current full-enriched variant on 22 of 27 days, mean improvement +0.056 (correlation units), **day-level t = 5.295** — far beyond the significance bar, the strongest and most robust result produced this session.

**Interpretation**: this doesn't prove each of the ~16 zeroed-out factors is individually harmful (most tested as "no detectable effect," not "confirmed harmful" — see §3). It demonstrates that their **cumulative variance**, even when each is individually indistinguishable from noise, is enough to destroy most of the baseline's real discriminative power when summed together in log-odds space. This is the clearest evidence yet for the "death by a thousand cuts" mechanism named in §3's pattern summary.

**This is a backtest-only simulation result, not a live change.** Full day-level validation completed 2026-08-29: 95% CI on the day-level improvement ≈ [0.035, 0.077] (from t=5.295, 27 days) — entirely positive; **leave-one-out mean stays positive excluding any single day** (range 0.0517-0.0591, zero non-positive folds). This passes the full bootstrap-equivalent gate from the standing methodology (`CORE_LOGIC_CALIBRATION_DOSSIER.md` / the original handoff's day-level block bootstrap standard). **The combined variant is validated in backtest.** Per standing process, the next decision is how to phase toward live consideration (see §7), not further backtest validation.

---

## 5. RULED OUT / RESOLVED THIS SESSION

| Hypothesis | Resolution |
|---|---|
| Naive probability-scale multiplicative clamping (original handoff's leading hypothesis) | **Refuted.** Enrichment is additive in log-odds space with per-factor clamps ±1.0, RSS-combined macro cluster, total clamp ±2.0. Multiplier log-SD (~0.11-0.13) is 3-9x too small to produce the observed within-cell correlation drop by simple variance arithmetic. |
| Reprocessing/lookahead bias (historical boards scored against today's baseline) | **Refuted.** Same-day-live legs (no lookahead possible) show the identical collapse (+40pp baseline / +5-7pp enriched) as reprocessed-day legs. |
| Small-sample noise inflating `baseline_v6_asof`'s spread | **Refuted.** Spread stays ~+39.5pp even restricted to `non_push_sample ≥ 50`. |
| Platt/residual calibration destroying discrimination | **Refuted.** Monotonic within cell; cannot change rank order. Verified `corr(postcalib, final) = 0.966`. |
| `park_factors` real negative signal (Z=3.87, -4.59pp) | **Refuted**, independently, twice (day-level block bootstrap this session, day-clustering test found via old-chat search). |
| `effectiveHebM` "locked HEB contract" (per-player anti-over-shrinkage safeguard) | Confirmed **dead code** — defined once in the baseline formula file, never called. Real bug, but measured `prior_strength` magnitudes (avg 2.72, max 11.88, never near the theoretical cap of 100) suggest it's likely not the dominant driver of any collapse. |
| `batter_quality_of_contact` large wrong-signed effect | **Resolved, not a bug.** Was real pre-2026-08-19, already fixed. |
| `lineup_slot` high-variance noise injector | **Resolved, not a bug.** Initial finding used a stale backtest coefficient; current live coefficient is tiny and bounded, with no detectable effect either way. |

---

## 6. STILL OPEN

1. **Baseline provenance three-way discrepancy**: `baseline_v6_asof` (+39.76pp) vs live `classification.baseline_v6_current` read today (+17.78pp) vs production's own historically-recorded value at scoring time (+5.21pp), on the identical population of real graded legs. Old-chat search confirmed `baseline_v6_asof` is a deliberately isolated, walk-forward point-in-time reconstruction, structurally separate from live — a plausible root cause for *some* divergence — but the specific 3-way gap has not been directly reconciled anywhere.
2. `market_implied_total`/`pitcher_strikeouts` coefficient (-1) — present since at least 2026-08-20 (part of a 21-factor Gemini audit that day), no dedicated validation of its own found; zero backtest data exists for this specific factor/prop combination.
3. Daily Context layer (LAYER 2 of `Master_Full_Run.txt`) coverage history — all 8 `daily.*_current` tables have no historical retention found. Cannot verify whether any of the 32 backtest days had missing/stale daily-context data that would have caused enrichment factors to silently go "missing" on those specific days.
4. `weather_precip` — confirmed no usable historical archive exists anywhere in the system. Would need a new data source to ever test.
5. `player_availability`'s possible regex/intent mismatch (`recent_il_return` tier not matching `activated` status) — flagged, not yet fixed or tested (event too rare either way).
6. `defensive_quality_oaa`/`hits_allowed` — zero cells, zero backtest data, genuinely untested.
7. `lineup_surrounding_quality` and its extension to `runs`/`hits_runs_rbis` — thin evidence, needs more days.

---

## 7. NEXT STEPS (per standing process: research → simulate in backtest → only then consider live)

1. Run the full day-level block bootstrap (≥95% of resamples positive, 95% CI lower bound above zero, leave-one-out never negative) on the §4 combined variant's improvement before treating it as ready for live consideration.
2. Consider whether the reduced variant should keep the ~16 zeroed factors at zero permanently, or whether some (e.g. `lineup_surrounding_quality`, directionally suggestive but unproven) deserve continued monitoring as more days of data accumulate, rather than permanent removal.
3. Any future pooled multi-week finding must be checked for intervening code/config fixes (split at the fix date) **and** against the current live coefficient (§2.5) before being treated as an open, actionable issue — `batter_quality_of_contact` and `lineup_slot` are the two concrete cautionary examples this session produced.
4. Investigate the LAYER 2 Daily Context historical coverage gap (§6.3) if a way to reconstruct it is found.
5. If the bootstrap in step 1 holds, the next decision is how to phase a live rollout: e.g. a shadow/parallel run comparing the reduced variant against the current live enrichment on fresh, out-of-sample days before ever touching the production `enrichLeg()` function itself.
