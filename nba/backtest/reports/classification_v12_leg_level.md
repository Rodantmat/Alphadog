# LEG-LEVEL CALIBRATION STATUS - v12 (2026-09-09), out-of-sample 2025-26, walk-forward monthly

STANDARD (owner): leg-level accuracy on every variation band and direction; confidence bands (95/90/85...) must hit their stated rate.

STATUS: points and rebounds MEET the ladder standard (max rung gap 0.7pp; all confidence bands within ~2pp both sides). Assists close (1.1pp; HIGH band low rungs -3.3). THREES_MADE DOES NOT YET MEET IT: 'more' 60-65 band -4.6pp (n=7676), 70-75 -2.9; LOW band P(>=1) over-predicted 3.3pp. Worst-cell count (|gap|>2.5pp, n>=500, band x direction x rung) 39 -> 28 across v10-v12.

FIXES SINCE v9 (each verified on data before adoption):
  v10 hierarchical empirical fallback (tier x role x rung -> band x role x rung -> band x rung): ELITE rebounds +7.9 -> +3.6; 100% empirical coverage.
  v10 Platt key adds variation band (with band-level pool fallback): points STARTER band 3.5pp bias gone.
  v11 3PM compound model (tier on 3PA/36, makes|attempts Binomial): did NOT fix the 60-65 band (-5.3). Data check: makes|attempts ARE binomial (var ratio 0.94 in every attempt band) - beta-binomial was tested against data and REJECTED before building; attempts are Poisson (iod ~1.0).
  v12 k-sweep on the VALIDATION season (2023-24 -> 2024-25): the bias is monotone in the band at ANY single shrinkage k (top band under-projected, upper-middle over-projected) - the quantile tier prior compresses the extremes. Data-fit prior strength: vs whole population k~2, vs tier-mates k~100-250 (circular); a single k cannot serve all bands. Per-(prop, band) mean-ratio cells fit on validation (bandfit.py), shrunk by cell n (k=300), applied out-of-sample: points FRINGE 1.122, rebounds ELITE 1.076 / MID 0.970 / LOW 1.064, assists ELITE 1.077 / LOW 1.059, 3PM ELITE 0.757 (n=161 -> 0.915 effective). Worst cells 39 -> 28.

CONFIDENCE BANDS v12 (chosen side; |gap|>2.5pp with n>=1000):
  threes_made / more  60-65  n=7676   pred 61.8  hit 57.3  gap -4.6
  threes_made / more  70-75  n=12981  pred 72.3  hit 69.5  gap -2.9
  threes_made / less  55-60  n=6196   pred 57.5  hit 60.1  gap +2.6
  threes_made / less  60-65  n=2110   pred 62.4  hit 66.3  gap +3.9
  (all points / rebounds / assists bands within 2.5pp)

OPEN (do not move on until fixed - owner directive):
  1. 3PM confidence bands: P(0 makes) under-predicted for low-volume shooters; within-rung ordering off for volume shooters. Compound + band cells insufficient. Next candidates: (a) an empirical P(0)-by-(band, role) cell replacing the parametric P(0), (b) attempts zero-inflation tied to minutes for FRINGE/BENCH shooters, (c) 3PM-specific K_CELL lower than 300 so the (correct) empirical cells are not pulled toward the (weak) parametric.
  2. Rebounds ELITE shape (mean right, tails wrong: -4.7 at rung -3, +3.2 at +3): dispersion for elite bigs under-estimated; fit iod per band for rebounds as done for points.
  3. Assists HIGH low rungs (-3.3): left skew (hurdle) not representable by NegBin; empirical band cells partly absorb it.

Files: nba/backtest/classification_ladder_v12.py (canonical), nba/backtest/bandfit.py (band cells, validation season), nba/backtest/reports/band_mean_ratio_fit_2024_25.json. The Actions workflow now runs v12 and commits classification_v12.{json,md}.
