# Period props (2026-09-09) — out-of-sample ['2025-26'], history ['2023-24', '2024-25'], OT=include, shift_lambda=0.5

Findings: {"q1_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.993, 1.001], "HIGH_USAGE_STARTER": [1.008, 1.006], "STARTER": [1.01, 1.017], "ROTATION": [0.994, 1.06], "BENCH": [0.91, 1.048], "FRINGE": [0.666, 0.964]}, "q1_3state_by_role": {"IRON_MAN|close": [0.001, 1.002], "IRON_MAN|medium": [0.003, 1.006], "IRON_MAN|blowout": [0.001, 0.998], "HIGH_USAGE_STARTER|close": [0.003, 1.012], "HIGH_USAGE_STARTER|medium": [0.003, 1.007], "HIGH_USAGE_STARTER|blowout": [0.002, 1.009], "STARTER|close": [0.018, 1.024], "STARTER|medium": [0.017, 1.028], "STARTER|blowout": [0.017, 1.026], "ROTATION|close": [0.07, 1.075], "ROTATION|medium": [0.088, 1.109], "ROTATION|blowout": [0.098, 1.112], "BENCH|close": [0.231, 1.33], "BENCH|medium": [0.278, 1.335], "BENCH|blowout": [0.322, 1.343], "FRINGE|close": [0.437, 2.049], "FRINGE|medium": [0.565, 2.048], "FRINGE|blowout": [0.657, 2.063]}, "q1_ot_minutes_by_role": {"BENCH": 0.46, "FRINGE": 0.37, "HIGH_USAGE_STARTER": 1.17, "IRON_MAN": 1.76, "ROTATION": 0.7, "STARTER": 0.92}}

## threes_made_q1
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 19849 | 0.290 | 0.287 | -0.3 |
| -5 | 19849 | 0.290 | 0.287 | -0.3 |
| -4 | 19849 | 0.290 | 0.287 | -0.3 |
| -3 | 19849 | 0.290 | 0.287 | -0.3 |
| -2 | 19849 | 0.290 | 0.287 | -0.3 |
| -1 | 19849 | 0.290 | 0.287 | -0.3 |
| +0 | 19849 | 0.285 | 0.282 | -0.3 |
| +1 | 19849 | 0.060 | 0.068 | +0.9 |
| +2 | 19849 | 0.011 | 0.014 | +0.3 |
| +3 | 19849 | 0.002 | 0.003 | +0.0 |
| +4 | 19849 | 0.000 | 0.000 | -0.0 |
| +5 | 19849 | 0.000 | 0.000 | -0.0 |
| +6 | 19849 | 0.000 | 0.000 | -0.0 |
### threes_made_q1 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 7413 | 52.4 | 51.0 | -1.4 |
| 55-60 | 7822 | 57.3 | 56.1 | -1.2 |
| 60-65 | 3586 | 61.9 | 63.4 | +1.5 |
| 65-70 | 1368 | 67.3 | 65.8 | -1.5 |
| 70-75 | 354 | 71.3 | 50.8 | -20.4 |
### threes_made_q1 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 42 | 53.1 | 71.4 | +18.3 |
| 55-60 | 146 | 57.7 | 69.9 | +12.1 |
| 60-65 | 28 | 61.1 | 75.0 | +13.9 |
| 65-70 | 18 | 69.0 | 50.0 | -19.0 |
| 70-75 | 175 | 72.9 | 75.4 | +2.5 |
| 75-80 | 576 | 78.6 | 75.3 | -3.2 |
| 80-85 | 1609 | 82.5 | 82.0 | -0.5 |
| 85-90 | 2591 | 87.7 | 86.6 | -1.0 |
| 90-95 | 5263 | 92.9 | 93.0 | +0.1 |
| 95+ | 108935 | 99.7 | 99.5 | -0.2 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| (none) | | | | | | | |