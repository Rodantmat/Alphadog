# Period props (2026-09-09) — out-of-sample ['2025-26'], history ['2023-24', '2024-25'], OT=include, shift_lambda=0.5

Findings: {"h2_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.679, 0.663], "HIGH_USAGE_STARTER": [0.685, 0.703], "STARTER": [0.749, 0.756], "ROTATION": [0.904, 0.876], "BENCH": [1.094, 1.118], "FRINGE": [1.845, 2.0]}, "h2_3state_by_role": {"IRON_MAN|close": [0.01, 1.018], "IRON_MAN|medium": [0.011, 0.917], "IRON_MAN|blowout": [0.015, 0.683], "HIGH_USAGE_STARTER|close": [0.009, 1.033], "HIGH_USAGE_STARTER|medium": [0.018, 0.932], "HIGH_USAGE_STARTER|blowout": [0.014, 0.703], "STARTER|close": [0.022, 1.043], "STARTER|medium": [0.018, 0.956], "STARTER|blowout": [0.024, 0.771], "ROTATION|close": [0.03, 1.07], "ROTATION|medium": [0.035, 1.021], "ROTATION|blowout": [0.039, 0.923], "BENCH|close": [0.095, 1.17], "BENCH|medium": [0.105, 1.154], "BENCH|blowout": [0.066, 1.176], "FRINGE|close": [0.262, 1.729], "FRINGE|medium": [0.326, 1.845], "FRINGE|blowout": [0.117, 2.106]}, "h2_ot_minutes_by_role": {"BENCH": 0.46, "FRINGE": 0.37, "HIGH_USAGE_STARTER": 1.17, "IRON_MAN": 1.76, "ROTATION": 0.7, "STARTER": 0.92}}

## points_h2
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 21498 | 0.763 | 0.760 | -0.4 |
| -5 | 21498 | 0.749 | 0.742 | -0.7 |
| -4 | 21498 | 0.723 | 0.713 | -1.0 |
| -3 | 21498 | 0.680 | 0.672 | -0.8 |
| -2 | 21498 | 0.620 | 0.613 | -0.6 |
| -1 | 21498 | 0.535 | 0.532 | -0.3 |
| +0 | 21498 | 0.443 | 0.442 | -0.1 |
| +1 | 21498 | 0.354 | 0.354 | +0.0 |
| +2 | 21498 | 0.278 | 0.277 | -0.1 |
| +3 | 21498 | 0.213 | 0.213 | +0.0 |
| +4 | 21498 | 0.159 | 0.161 | +0.1 |
| +5 | 21498 | 0.119 | 0.121 | +0.2 |
| +6 | 21498 | 0.089 | 0.089 | +0.0 |
### points_h2 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 15177 | 52.6 | 53.6 | +1.1 |
| 55-60 | 15733 | 57.4 | 56.6 | -0.8 |
| 60-65 | 14337 | 62.6 | 62.1 | -0.5 |
| 65-70 | 16073 | 67.5 | 67.0 | -0.6 |
| 70-75 | 15118 | 72.4 | 71.8 | -0.6 |
| 75-80 | 15683 | 77.5 | 75.8 | -1.7 |
| 80-85 | 15344 | 82.4 | 81.1 | -1.4 |
| 85-90 | 10033 | 87.1 | 86.1 | -1.0 |
| 90-95 | 2545 | 91.4 | 89.5 | -1.9 |
### points_h2 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 11005 | 52.6 | 53.0 | +0.4 |
| 55-60 | 12213 | 57.4 | 57.6 | +0.2 |
| 60-65 | 12475 | 62.5 | 62.8 | +0.2 |
| 65-70 | 13878 | 67.5 | 67.5 | -0.0 |
| 70-75 | 15329 | 72.5 | 72.4 | -0.2 |
| 75-80 | 17315 | 77.5 | 77.8 | +0.3 |
| 80-85 | 20521 | 82.6 | 82.7 | +0.0 |
| 85-90 | 24673 | 87.5 | 87.1 | -0.4 |
| 90-95 | 20525 | 92.3 | 91.7 | -0.6 |
| 95+ | 3736 | 95.9 | 95.6 | -0.4 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| points_h2 | LOW | less | -1 | 2898 | 43.7 | 39.6 | -4.1 |
| points_h2 | ELITE | less | -1 | 2435 | 47.5 | 50.8 | +3.4 |
| points_h2 | ELITE | more | -1 | 2435 | 52.5 | 49.2 | -3.4 |
| points_h2 | ELITE | less | -4 | 2435 | 27.4 | 30.5 | +3.1 |
| points_h2 | ELITE | more | -4 | 2435 | 72.6 | 69.5 | -3.1 |
| points_h2 | MID | less | -4 | 2195 | 18.2 | 15.4 | -2.9 |
| points_h2 | ELITE | more | -5 | 2435 | 78.6 | 75.7 | -2.8 |
| points_h2 | ELITE | less | -5 | 2435 | 21.4 | 24.3 | +2.8 |
| points_h2 | ELITE | more | +1 | 2435 | 39.0 | 36.3 | -2.7 |
| points_h2 | ELITE | less | +1 | 2435 | 61.0 | 63.7 | +2.7 |
| points_h2 | ELITE | more | +0 | 2435 | 45.4 | 42.7 | -2.7 |
| points_h2 | ELITE | less | +0 | 2435 | 54.6 | 57.3 | +2.7 |
| points_h2 | ELITE | less | +2 | 2435 | 67.2 | 69.8 | +2.5 |
| points_h2 | ELITE | more | +2 | 2435 | 32.8 | 30.2 | -2.5 |