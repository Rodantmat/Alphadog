# SESSION LOG — Enrichment Calibration Investigation (2026-08-28/29)

Companion to `ENRICHMENT_CALIBRATION_DOSSIER.md` (the consolidated findings) and `ENRICHMENT_CALIBRATION_HANDOFF.md` (the brief this session started from). This is the chronological record of what was actually done, in order, including dead ends and corrected mistakes — kept honest rather than cleaned up, since the dead ends are informative for whoever continues this.

---

## Part 1 — Reproduction and initial code read

- Reproduced the handoff's core finding exactly: baseline +39.76pp / enriched +5.31pp within-cell, n=85,926. Per-cell variance table also matched (`runs`/`walks` ~45% retention, `hits_runs_rbis/more/0.5` 101% variance / 0.374 correlation), plus found an additional, worse scrambling cell not in the original handoff: `hits_runs_rbis/0.5/less` at variance ratio 0.215.
- Located the real enrichment engine: NOT a dedicated file — multiplexed onto `alphadog-v2-phase2a-run-environment.js` via `mode=enrichment_run`, confirmed via `ALPHADOG_SYSTEM_MAP.md` and the scoring-runner-part2 STAGES array.
- Read the enrichment engine in full. **Rejected the handoff's leading hypothesis** (naive probability-scale multiplicative clamping) — the real design is additive log-odds, per-factor clamp ±1.0, 4-factor macro cluster combined via signed RSS, total clamp ±2.0. Arithmetic check: multiplier log-SD (~0.11-0.13) is far too small to explain the observed within-cell correlation collapse by itself (predicted corr ~0.98-0.99, observed as low as 0.31-0.71 across variants of this test).

## Part 2 — Baseline provenance detour (later reframed by the principal)

- Investigated whether `hp_board_current`'s `empirical_hit_rate_0_1`/`reliability_0_1` columns reflected a parallel, un-shrunk empirical computation. **Refuted** — confirmed 100% NULL on all 14,368 current rows; dead legacy columns.
- Found three divergent measurements of "the baseline's own discrimination" on the identical population of graded legs: `backtest.baseline_v6_asof` (+39.76pp), `classification.baseline_v6_current` read live-today (+17.78pp), and production's own historically-recorded value at scoring time (+5.21pp).
- Ruled out reprocessing/lookahead as the explanation: same-day-live legs show the identical collapse as reprocessed-day legs.
- Ruled out small-sample noise inflating `baseline_v6_asof`: spread stays ~+39.5pp even at `non_push_sample ≥ 50`.
- Found `effectiveHebM` (a documented per-player anti-over-shrinkage safeguard, the "locked HEB contract") is dead code — defined once, called nowhere in the entire 12,836-line file. Measured `prior_strength` magnitudes (avg 2.72, max 11.88) suggest this likely isn't the dominant driver of any collapse, despite being a confirmed real gap between documentation and behavior.
- **Principal clarified the mandate**: treat the live baseline as fine, don't modify it, focus exclusively on enrichment. This baseline-provenance thread was left partially open (see dossier §5.1) rather than fully resolved, per that redirection.

## Part 3 — Finding the real calibration infrastructure

- Read `coworker/prompts/Master_Full_Run.txt` — the authoritative source of truth for the live pipeline's exact call sequence, confirming LAYER 4 steps 21-29 and correcting an earlier assumption that `scoring.prop_factor_hitter/pitcher_packets` fed the enrichment math directly (they're an eligibility/coverage gate, not a factor-value computation).
- Discovered `backtest.factor_contributions_asof_v2` and ~19 `backtest.recomputed_*` per-factor tables — purpose-built calibration infrastructure, not previously known to this session. This became the primary data source for the factor audit.

## Part 4 — Factor audit, including a real methodological near-miss

- Initial pooled, baseline-quartile-controlled correlation pass across 15 factors flagged `lineup_slot`'s 27% clamp-saturation and `market_implied_total`'s consistent negative sign as top candidates.
- **Near-miss, caught before acting on it**: was about to recommend re-wiring `times_through_order` and extending `recent_form_trend` to their full declared prop scope, based on code comments describing strong raw correlations (0.46-0.91). Checking `config.enrichment_factors.research_notes` directly revealed both were **deliberately narrowed/deactivated on 2026-08-13** after residual testing proved those raw correlations were mechanically spurious (linked to season-long stats the baseline already uses), with the config's own notes explicitly warning not to re-extend without the same residual test. Retracted the recommendation. This is why the dossier's methodology section (§2.2) exists — residual correlation, not raw correlation, is the correct test, and this was learned the hard way mid-session rather than assumed from the start.
- Established the day-level t-test bar (§2.3) after `market_implied_total`'s pooled correlation (n=65,128, looked highly convincing) failed to clear it (t=-1.42) — downgraded from "confirmed fix" to "directional, unproven."
- Cross-referenced `config.enrichment_profile_cells` cell coverage against `config.enrichment_factors.relevant_prop_keys_json` for all factors at once — found `defensive_quality_oaa` (1/4 props), `lineup_slot` (1/3), `lineup_surrounding_quality` (1/3) all have confirmed real cell-coverage gaps, distinct from the times_through_order/recent_form_trend cases (which were deliberately narrow, not gaps).
- Ran the full day-level t-test across the remaining measurable factors (`umpire_tendency`, `weather_wind`, `park_factors`, `weather_temp_altitude_pressure`, `bullpen_fatigue`, `platoon_handedness`): only `bullpen_fatigue` reached even marginal significance (t=2.01, thin at 10 days); everything else was indistinguishable from noise despite real variance.

## Part 5 — Backfilling gaps per the principal's instruction

- `batter_quality_of_contact` and `weather_precip` had zero rows in `factor_contributions_asof_v2`.
- `weather_precip`: exhaustively searched for a usable historical precipitation source. `daily.game_weather_current` (live-only), `daily.game_weather_snapshots` (name suggests history, actually only retains ~2 days), `context.history_game_weather` (right date range, but `condition` field 88% NULL, no numeric precipitation field). **Confirmed genuine, permanent data gap** — no backfill attempted rather than forcing a low-quality proxy.
- `batter_quality_of_contact`: found `ref.batter_quality_of_contact_history` (real snapshot history, Aug 5-23, 785 players) and built a full backfill — real formula, real historical QoC snapshots (backward-only joined after an initial nearest-date version raised a lookahead concern), real historical games-played counts from `stats_hitter.game_logs` for the shrinkage weight. Initial pooled result (t=-4.43 across 23 days, survived a lookahead re-check) looked like the largest finding of the session. **Corrected after a leave-one-out check and a temporal split**: the leave-one-out mean stayed negative for every excluded day (robust), but the day-by-day values showed a clear break — strongly negative Aug 5-18, near-zero Aug 19-27. Splitting at that boundary (which matches a documented 2026-08-19 code fix replacing a backwards 1.3x thin-sample amplification with proper empirical-Bayes shrinkage) gave pre-fix t=-6.688 (14 days) vs post-fix t=-0.045 (9 days). **This was a real, large, historical bug — already fixed before this session started.** Corrected the dossier, which had briefly documented this as the session's headline open finding.

## Part 6 — Old-chat historical cross-check

- Per the principal's standing instruction (draft a message enforcing deep transcript search when stuck), sent a message to a prior chat asking about 7 specific open items.
- Response resolved/clarified: `park_factors` (independently corroborated null effect via a different day-clustering method, t=-1.04 there vs t=0.200 here); `weather_precip` (adjacent evidence from the `weather_roof` code comment confirms `context.history_game_weather` has the same category of historical gap); `defensive_quality_oaa`/`lineup_surrounding_quality`/`player_availability` (confirmed real, wired, non-stub code — clarified the finding as "wired but cell-coverage-gapped" rather than "not wired," since this session's own direct query of `config.enrichment_profile_cells` already established the specific cell counts).
- Remaining open: the 3-way baseline provenance gap, `bullpen_fatigue` additional data, `market_implied_total`/`pitcher_strikeouts` coefficient provenance.

## Part 7 — Documentation

- Consolidated everything into `ENRICHMENT_CALIBRATION_DOSSIER.md` (this session's companion document) and this log.

## Part 8 — Continued factor audit: `defensive_quality_oaa`, `lineup_surrounding_quality`, `player_availability`, `bullpen_fatigue` resolved

- `defensive_quality_oaa`: found it already had backtest coverage for doubles/hits/singles under a differently-named factor_key (`defensive_quality`, not `defensive_quality_oaa`) in `factor_contributions_asof_v2`. Tested all 3: none significant (t=-0.35, 0.18, 0.72). `hits_allowed` remains untested (no cells, no backtest data).
- `lineup_surrounding_quality`: built a fresh backfill from `context.history_game_lineup` (40-day coverage) + real historical OBP from `stats_hitter.game_logs`. Caught and fixed a bug in the formula along the way (initial version omitted walks from OBP, matched to the real production formula `(hits+walks)/PA` after the fix). Result: pooled corr -0.0317, day-level t=-1.650, but only 7 qualifying days — too thin to call.
- `player_availability`: found `context.history_player_availability` (27 days coverage) and `archive.player_availability_history`. Qualifying IL-related events are extremely rare (~30-33 total across the window) — too thin to test regardless of data availability. Found a possible logic/intent mismatch along the way: the `recent_il_return` tier's regex matches "currently injured" status strings but not `activated` (23 occurrences), which is the status that most directly represents an actual IL return — flagged for review, not fixed.
- `bullpen_fatigue`: found `context.history_bullpen_availability` (27 days vs. the original 10-day sample). Rebuilt the backfill with real opponent-team matching via `stats_hitter.game_logs.opponent_team_id`. Result: t=-0.839 (22 days, n=29,321) — the earlier marginal t=2.01 finding did not survive nearly triple the data. Resolved to "no detectable effect."

## Part 9 — `lineup_slot` correction (a second instance of the same failure mode as Part 5)

- Attempted to recalibrate `lineup_slot`'s cap per the dossier's original next-steps item. Checking the current live coefficient (0.0257) first revealed it's mathematically impossible for it to produce the ~0.7 average contribution / 27% clamp-saturation found earlier in `factor_contributions_asof_v2` — max possible magnitude under the current coefficient is ±0.103.
- Also found `ctx.average_slot` (the formula's per-player reference point) is never wired anywhere in the code — appears exactly once, in the formula itself — so the live formula always falls back to a fixed default of 5, not a real per-player average.
- Recomputed fresh against current config + real historical lineup data (`context.history_game_lineup`). Along the way, caught a data-quality bug: that table mixes two lineup-slot encodings (plain 1-9 and raw MLB API 100-900 codes) without normalization — a naive query produced an impossible SD of 7.27 before this was caught.
- Corrected result: SD 0.067, day-level t=1.19 (11 days) — no detectable effect, not a noise injector. **This is the second confirmed instance this session of a backtest-derived finding being based on a since-superseded live coefficient** (after `batter_quality_of_contact` in Part 5). Elevated this to an explicit methodology rule (dossier §2.5) since it's now happened twice.
- Rewrote the dossier in full to fix both this correction and a structural issue from an earlier patch (a section had been accidentally deleted rather than appended to during an edit).

## Part 10 — Closing the remaining individual threads

- `lineup_surrounding_quality`: extended the backfill to all 3 apps (not just PrizePicks) to get more days. Result: 17 days (crosses the 15-day bar), n=1,961, t=-1.565 — still not significant. Resolves to "no detectable effect," same bucket as most other factors, not a confirmed sign issue.
- `defensive_quality_oaa`/`hits_allowed`: found `backtest.recomputed_defensive_quality` exists but is a player-level OAA reconstruction, not a leg-level contribution table. On inspection, found a likely **conceptual target mismatch**: the factor's opponent-team lookup is correct for hitter props (testing a batter against the fielding behind the opposing pitcher) but for `hits_allowed` (a pitcher prop) the "opponent" is the batting team, whose own defense has no bearing on how many hits their pitcher allows — the factor would need to key on the pitcher's *own* team's defense instead. Flagged for design review rather than backfilled, since backfilling as currently specified would just encode the same conceptual error.

## Part 11 — Combined variant simulation and full bootstrap validation

- Per the principal's instruction to pursue both remaining individual threads and the combined "dampen everything unproven" variant, in the order that made sense (finish cheap individual items first, since their outcomes are inputs to the combined variant).
- Built the combined variant: baseline + only the 3 factors with real validated positive evidence (`opposing_pitcher_quality`, `schedule_travel_fatigue`, `catcher_framing`), every other factor zeroed. Tested within-cell quartile spread on the full real graded-leg population (n≈105K): baseline alone +17.68pp, current live enrichment (all ~19 factors) +5.12pp, reduced variant **+17.91pp** — matching or slightly exceeding baseline alone, recovering nearly 13pp versus the current live enrichment.
- Validated day-level robustness: comparing within-cell correlation with outcome day by day, the reduced variant beat the current full-enriched variant on 22 of 27 days, mean improvement +0.056, **t = 5.295** — by far the strongest, most significant result of the entire investigation.
- Ran the full bootstrap-equivalent validation the standing methodology requires before anything is called proven: 95% CI on the day-level improvement ≈ [0.035, 0.077] (entirely positive), and leave-one-out mean stays positive excluding any single day (range 0.0517-0.0591, zero non-positive folds). **This passes every gate in the standing methodology.**
- Updated the dossier with a new §4 documenting this in full, renumbered subsequent sections, and updated next-steps to reflect that backtest validation is complete — the next decision is how to phase toward live consideration (shadow/parallel run before touching production code), which requires the principal's review before proceeding.

---

## Honest assessment of where this stands

The full factor-by-factor audit did not find a single dominant villain — most individual factors are either confirmed-fine, confirmed-already-fixed, or "wired but statistically undetectable." But the combined variant simulation shows clearly and robustly (day-level t=5.295, leave-one-out never negative) that **the cumulative effect of summing many individually-undetectable factors is enough to destroy nearly 13pp of the baseline's real discriminative power.** Keeping only the 3 factors with genuine validated evidence and zeroing everything else recovers essentially all of it in backtest. This is now a validated, backtest-proven simulation result, not a live change — nothing in the live pipeline has been touched. The clear next decision, which needs the principal's sign-off before any further work, is how to phase this toward a live shadow/parallel comparison.
