# Period props (2026-09-09) — out-of-sample ['2025-26'], history ['2023-24', '2024-25'], OT=exclude, shift_lambda=0.5

Findings: {"q4_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.39, 0.399], "HIGH_USAGE_STARTER": [0.386, 0.461], "STARTER": [0.525, 0.569], "ROTATION": [0.863, 0.793], "BENCH": [1.341, 1.272], "FRINGE": [2.414, 2.524]}, "q4_3state_by_role": {"IRON_MAN|close": [0.03, 1.039], "IRON_MAN|medium": [0.082, 0.932], "IRON_MAN|blowout": [0.446, 0.668], "HIGH_USAGE_STARTER|close": [0.045, 1.084], "HIGH_USAGE_STARTER|medium": [0.113, 0.97], "HIGH_USAGE_STARTER|blowout": [0.442, 0.713], "STARTER|close": [0.112, 1.148], "STARTER|medium": [0.157, 1.057], "STARTER|blowout": [0.415, 0.884], "ROTATION|close": [0.214, 1.325], "ROTATION|medium": [0.235, 1.258], "ROTATION|blowout": [0.331, 1.176], "BENCH|close": [0.332, 1.538], "BENCH|medium": [0.328, 1.54], "BENCH|blowout": [0.265, 1.694], "FRINGE|close": [0.5, 2.174], "FRINGE|medium": [0.469, 2.357], "FRINGE|blowout": [0.185, 2.896]}, "q4_ot_minutes_by_role": {"BENCH": 0.46, "FRINGE": 0.37, "HIGH_USAGE_STARTER": 1.17, "IRON_MAN": 1.76, "ROTATION": 0.7, "STARTER": 0.92}}

## points_q4
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 20833 | 0.577 | 0.569 | -0.8 |
| -5 | 20833 | 0.576 | 0.568 | -0.8 |
| -4 | 20833 | 0.572 | 0.564 | -0.8 |
| -3 | 20833 | 0.562 | 0.553 | -0.9 |
| -2 | 20833 | 0.533 | 0.527 | -0.6 |
| -1 | 20833 | 0.485 | 0.480 | -0.5 |
| +0 | 20833 | 0.405 | 0.400 | -0.5 |
| +1 | 20833 | 0.294 | 0.298 | +0.4 |
| +2 | 20833 | 0.212 | 0.210 | -0.2 |
| +3 | 20833 | 0.150 | 0.150 | +0.0 |
| +4 | 20833 | 0.104 | 0.105 | +0.1 |
| +5 | 20833 | 0.072 | 0.073 | +0.1 |
| +6 | 20833 | 0.048 | 0.048 | -0.0 |
### points_q4 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 18870 | 52.5 | 52.0 | -0.4 |
| 55-60 | 16749 | 57.5 | 57.4 | -0.1 |
| 60-65 | 13982 | 62.4 | 59.9 | -2.4 |
| 65-70 | 9570 | 67.4 | 66.5 | -1.0 |
| 70-75 | 10194 | 72.5 | 70.4 | -2.1 |
| 75-80 | 7568 | 77.2 | 74.8 | -2.4 |
| 80-85 | 2633 | 82.1 | 79.3 | -2.8 |
| 85-90 | 770 | 86.5 | 81.0 | -5.5 |
### points_q4 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 6912 | 52.7 | 53.0 | +0.3 |
| 55-60 | 9301 | 57.5 | 57.7 | +0.2 |
| 60-65 | 7650 | 62.4 | 63.2 | +0.8 |
| 65-70 | 9800 | 67.6 | 67.5 | -0.1 |
| 70-75 | 11856 | 72.6 | 72.7 | +0.1 |
| 75-80 | 13309 | 77.5 | 77.1 | -0.5 |
| 80-85 | 16468 | 82.6 | 82.5 | -0.1 |
| 85-90 | 22753 | 87.6 | 87.5 | -0.1 |
| 90-95 | 31346 | 92.7 | 92.5 | -0.2 |
| 95+ | 18835 | 96.6 | 96.3 | -0.3 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| points_q4 | HIGH | less | +0 | 678 | 56.7 | 61.7 | +5.0 |
| points_q4 | HIGH | more | +0 | 678 | 43.3 | 38.3 | -5.0 |
| points_q4 | HIGH | less | +3 | 678 | 77.2 | 81.9 | +4.7 |
| points_q4 | HIGH | more | +3 | 678 | 22.8 | 18.1 | -4.7 |
| points_q4 | HIGH | more | -2 | 678 | 59.5 | 54.9 | -4.6 |
| points_q4 | HIGH | less | -2 | 678 | 40.5 | 45.1 | +4.6 |
| points_q4 | HIGH | less | +1 | 678 | 64.1 | 68.7 | +4.6 |
| points_q4 | HIGH | more | +1 | 678 | 35.9 | 31.3 | -4.6 |
| points_q4 | HIGH | less | +2 | 678 | 71.0 | 75.4 | +4.4 |
| points_q4 | HIGH | more | +2 | 678 | 29.0 | 24.6 | -4.4 |
| points_q4 | HIGH | less | -1 | 678 | 48.4 | 52.7 | +4.3 |
| points_q4 | HIGH | more | -1 | 678 | 51.6 | 47.3 | -4.3 |
| points_q4 | MID | less | -4 | 1183 | 26.1 | 21.9 | -4.2 |
| points_q4 | HIGH | more | -3 | 678 | 66.9 | 63.0 | -3.9 |
| points_q4 | HIGH | less | -3 | 678 | 33.1 | 37.0 | +3.9 |
| points_q4 | LOW | less | -1 | 5034 | 48.0 | 44.1 | -3.9 |
| points_q4 | HIGH | more | +4 | 678 | 18.2 | 14.5 | -3.8 |
| points_q4 | HIGH | less | +4 | 678 | 81.8 | 85.5 | +3.8 |
| points_q4 | HIGH | less | -5 | 678 | 23.3 | 19.6 | -3.7 |
| points_q4 | HIGH | more | -5 | 678 | 76.7 | 80.4 | +3.7 |
| points_q4 | HIGH | less | +5 | 678 | 86.4 | 90.1 | +3.7 |
| points_q4 | HIGH | more | +5 | 678 | 13.6 | 9.9 | -3.7 |
| points_q4 | HIGH | less | +6 | 678 | 89.9 | 93.2 | +3.3 |
| points_q4 | HIGH | more | +6 | 678 | 10.1 | 6.8 | -3.3 |
| points_q4 | HIGH | more | -6 | 678 | 80.1 | 82.6 | +2.5 |