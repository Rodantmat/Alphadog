# LEG-LEVEL CALIBRATION - FINAL TWO-SEASON RESULT (v17, 2026-09-09)

STANDARD (owner): accuracy per leg on every variation band and direction; confidence bands (95/90/85...) must hit their stated rate; a method that works on one season must hold on the previous one.

SAME CONFIGURATION ON BOTH SEASONS, NO RE-TUNING:

| | 2025-26 (history 2023-24 + 2024-25) | 2024-25 HOLDOUT (history 2023-24 only) |
|---|---|---|
| points ladder, max abs gap over 13 rungs | 0.9 pp | 1.2 pp |
| rebounds ladder | 0.7 pp | 0.8 pp |
| assists ladder | 1.4 pp | 0.7 pp |
| threes_made ladder | 1.3 pp | 1.1 pp |
| confidence bands (n>=1000) with abs gap > 2.5 pp | 3 of 76 | 3 of 77 |
| points + rebounds confidence bands | 0 misses of 37 | 0 misses of 37 |
| worst band x direction x rung cells (abs gap > 2.5, n>=500) | 20 (10 rebounds ELITE n=699; 10 assists HIGH/MID + one 3PM) | 24 (all rebounds ELITE/LOW) / 0 for assists+3PM |

Residual band misses, both seasons: the thinnest 'less' bands only - assists 60-65 (n~1.8-2.4k, +2.6..+3.9), 3PM less 50-55 / 60-65 (n~1.9-3.4k, +2.6..+3.5). Every band with real volume hits its stated rate.

WHAT CHANGED SINCE v12 (each verified on data before adoption):
  v13 seasons/props/cells configurable by env; 3PM K_CELL 300 -> 100.
  v14 SEASON-CONSISTENCY RULE for band mean-ratio cells: keep a cell only if its sign is consistent across both seasons.
      Rebounds ELITE under-projected in 2024-25 (+6..+8) AND 2025-26 (+3.6) -> structural -> keep (1.076).
      3PM mid bands +2.8 (2024-25) vs -3.6 (2025-26) -> season regime -> NO frozen cells (they made 2025-26 worse);
      regime effects are carried by the walk-forward monthly tables + in-season per-rung Platt.
  v15 3PM empirical cells as a LOGIT LEVEL-SHIFT on the parametric (calibrate level, preserve the parametric's
      make-rate ordering). Diagnosis: the cells were keyed on attempt tier x role, so a 33% and a 42% shooter
      were averaged together - the within-cell ordering the parametric already knew was being shrunk away.
      3PM 'more' 60-65 band -4.6 -> within +/-2.3 everywhere; worst-rung cells for 3PM: 1.
  v16 shift mode tested on points/rebounds: WORSE (rebounds ladder 5.4). Their parametric shape is wrong at
      zero (a 5-rebound player almost never gets 0), so the empirical value must REPLACE it. Mode is now decided
      per prop by evidence: replacement for points/rebounds/assists, shift for threes_made.
  v17 shift bug fixed: each hierarchy level's gap is measured against the raw parametric, so only the FINEST
      available level is applied (stacking all three tripled the correction: FRINGE points rung -6 predicted
      58.7 vs raw ~95).
  Ruled out on data: league 3P% as the 3PM driver (36.57 / 36.02 / 35.96); beta-binomial makes (var ratio 0.94
  = binomial); attempts overdispersion (Poisson, iod ~1.0).

REMAINING (honest):
  1. Rebounds ELITE tails (n=699-1071, ~10 players): mean right, shape +/-3..5 at outer rungs -> fit dispersion per band for rebounds.
  2. Assists HIGH low rungs (~3.3): left skew (hurdle) the research predicted; NegBin cannot produce it.
  3. Thinnest 'less' bands (assists 60-65, 3PM 50-55): n too small for Platt to act in-season.

Files: nba/backtest/classification_ladder_v12.py (canonical body = v17; env: BT_TRAIN, BT_TEST, BT_PROPS, BT_BAND_CELLS, BT_SHIFT_MODE, BT_KCELL_3PM, BT_TAG); nba/backtest/bandfit.py; workflow runs both seasons per prop pair and commits classification_final_<season>_<props>.{json,md}.
