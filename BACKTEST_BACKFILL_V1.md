# BACKTEST BACKFILL — corrected_baseline_v1

**Scope: `backtest.corrected_baseline_v1` only. Nothing live. Nothing outside the backtest schema.**

Applies every validated fix from `BASELINE_CALIBRATION_FINDINGS.md` across the full available backtest window (07-25 to 08-31), for the specific population each fix was validated on.

## Contents

| Prop | Fix | Rows | Status |
|---|---|---|---|
| hits/singles/doubles | n_eff + tier prior (M=850) | 1,344 | Fully validated |
| total_bases | n_eff + real NegBinomial (r=1.046) | 2,535 | Fully validated |
| hits_runs_rbis | n_eff + real NegBinomial (r=1.361) | 1,751 | Fully validated |
| walks | n_eff + shrinkage toward season (M=120) | 641 | Fully validated |
| pitcher_fantasy_score | Real measured SD (12.58), Normal model | 103 | Fully validated |
| runs | Empirical blend (w=0.5995) | 257 | Fully validated |
| rbis | Empirical blend (w=0.5995) | 297 | Robust, below formal significance |
| hitter_strikeouts | Empirical blend (w=0.735) | 131 | Fully validated |
| hits_allowed | Blowout-stratified blend (0.93/0.68) | 42 (deduped) | Real fix, robust |
| pitcher_strikeouts | Empirical blend (w=0.788) | 90 | Robust, below formal significance |

**Total: 7,191 rows, 12 props, 29 days.**

## Explicitly NOT touched (left as original baseline, by evidence)

- `pitcher_outs` — proven no-fix-needed (correction actively hurts it)
- `home_runs`, `stolen_bases`, `walks_allowed` — already well-calibrated
- `earned_runs` — apparent gap resolved as small-sample noise, not real
- `triples`, `runs_allowed` — never reach the overconfident range being corrected
- `rfi_nrfi` — set aside per explicit instruction
- `fantasy_score` (hitter, non-goblin/demon) — insufficient clean standard-line data to fix yet

## Schema

`d, player_id, ck, lv, ss, original_baseline_hp, corrected_baseline_hp, fix_applied`

Note: `player_id` and `lv` are NULL for some rows where the underlying working tables didn't carry them through — this table is for aggregate day-level re-evaluation, not leg-level lookup. If leg-level joins are needed later, this should be rebuilt preserving those keys.

## Status

Backfill complete. Next: rerun the enrichment/scoring layer on top of these corrected numbers (backtest schema only), then re-evaluate the full pipeline's calibration end-to-end.
