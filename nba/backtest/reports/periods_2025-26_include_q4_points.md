# Period props (2026-09-09) — out-of-sample ['2025-26'], history ['2023-24', '2024-25'], OT=include, shift_lambda=0.5

Findings: {"q4_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.372, 0.378], "HIGH_USAGE_STARTER": [0.373, 0.444], "STARTER": [0.511, 0.551], "ROTATION": [0.841, 0.773], "BENCH": [1.323, 1.248], "FRINGE": [2.399, 2.51]}, "q4_3state_by_role": {"IRON_MAN|close": [0.03, 1.068], "IRON_MAN|medium": [0.082, 0.893], "IRON_MAN|blowout": [0.446, 0.635], "HIGH_USAGE_STARTER|close": [0.044, 1.105], "HIGH_USAGE_STARTER|medium": [0.113, 0.945], "HIGH_USAGE_STARTER|blowout": [0.442, 0.688], "STARTER|close": [0.11, 1.17], "STARTER|medium": [0.157, 1.034], "STARTER|blowout": [0.415, 0.858], "ROTATION|close": [0.212, 1.355], "ROTATION|medium": [0.235, 1.233], "ROTATION|blowout": [0.331, 1.147], "BENCH|close": [0.329, 1.564], "BENCH|medium": [0.328, 1.519], "BENCH|blowout": [0.265, 1.667], "FRINGE|close": [0.498, 2.214], "FRINGE|medium": [0.469, 2.364], "FRINGE|blowout": [0.185, 2.879]}, "q4_ot_minutes_by_role": {"BENCH": 0.46, "FRINGE": 0.37, "HIGH_USAGE_STARTER": 1.17, "IRON_MAN": 1.76, "ROTATION": 0.7, "STARTER": 0.92}}

## points_q4
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 20850 | 0.580 | 0.572 | -0.9 |
| -5 | 20850 | 0.579 | 0.570 | -0.8 |
| -4 | 20850 | 0.575 | 0.566 | -0.9 |
| -3 | 20850 | 0.563 | 0.554 | -0.9 |
| -2 | 20850 | 0.533 | 0.526 | -0.8 |
| -1 | 20850 | 0.487 | 0.480 | -0.7 |
| +0 | 20850 | 0.406 | 0.402 | -0.3 |
| +1 | 20850 | 0.296 | 0.302 | +0.6 |
| +2 | 20850 | 0.214 | 0.214 | -0.0 |
| +3 | 20850 | 0.152 | 0.152 | -0.0 |
| +4 | 20850 | 0.107 | 0.109 | +0.2 |
| +5 | 20850 | 0.074 | 0.076 | +0.1 |
| +6 | 20850 | 0.051 | 0.051 | -0.0 |
### points_q4 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 19531 | 52.5 | 51.5 | -1.0 |
| 55-60 | 17151 | 57.5 | 57.9 | +0.4 |
| 60-65 | 14446 | 62.3 | 60.3 | -2.0 |
| 65-70 | 9554 | 67.4 | 65.7 | -1.7 |
| 70-75 | 9802 | 72.5 | 71.0 | -1.6 |
| 75-80 | 7530 | 77.2 | 75.2 | -2.0 |
| 80-85 | 2826 | 82.1 | 79.4 | -2.6 |
| 85-90 | 894 | 86.8 | 80.8 | -6.1 |
| 90-95 | 15 | 90.3 | 86.7 | -3.7 |
### points_q4 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 6721 | 52.7 | 53.6 | +0.9 |
| 55-60 | 9506 | 57.4 | 57.8 | +0.4 |
| 60-65 | 7698 | 62.6 | 62.4 | -0.1 |
| 65-70 | 10064 | 67.6 | 67.6 | +0.0 |
| 70-75 | 12100 | 72.6 | 72.9 | +0.3 |
| 75-80 | 13000 | 77.5 | 76.8 | -0.7 |
| 80-85 | 16954 | 82.6 | 82.5 | -0.1 |
| 85-90 | 23016 | 87.6 | 87.3 | -0.3 |
| 90-95 | 32083 | 92.6 | 92.5 | -0.1 |
| 95+ | 16925 | 96.7 | 96.3 | -0.4 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| points_q4 | HIGH | less | -2 | 857 | 40.9 | 46.0 | +5.1 |
| points_q4 | HIGH | more | -2 | 857 | 59.1 | 54.0 | -5.1 |
| points_q4 | HIGH | more | -1 | 857 | 51.0 | 46.1 | -4.9 |
| points_q4 | HIGH | less | -1 | 857 | 49.0 | 53.9 | +4.9 |
| points_q4 | HIGH | more | +0 | 857 | 43.2 | 38.3 | -4.9 |
| points_q4 | HIGH | less | +0 | 857 | 56.8 | 61.7 | +4.9 |
| points_q4 | MID | less | -4 | 1223 | 26.1 | 21.3 | -4.8 |
| points_q4 | HIGH | less | +2 | 857 | 70.7 | 75.4 | +4.6 |
| points_q4 | HIGH | more | +2 | 857 | 29.3 | 24.6 | -4.6 |
| points_q4 | HIGH | less | +1 | 857 | 64.2 | 68.6 | +4.4 |
| points_q4 | HIGH | more | +1 | 857 | 35.8 | 31.4 | -4.4 |
| points_q4 | HIGH | less | +3 | 857 | 76.6 | 81.0 | +4.4 |
| points_q4 | HIGH | more | +3 | 857 | 23.4 | 19.0 | -4.4 |
| points_q4 | HIGH | more | -3 | 857 | 66.4 | 62.3 | -4.1 |
| points_q4 | HIGH | less | -3 | 857 | 33.6 | 37.7 | +4.1 |
| points_q4 | LOW | less | -1 | 4895 | 47.5 | 44.1 | -3.4 |
| points_q4 | HIGH | less | -5 | 857 | 23.9 | 20.8 | -3.2 |
| points_q4 | HIGH | more | -5 | 857 | 76.1 | 79.2 | +3.2 |
| points_q4 | MID | more | -5 | 6570 | 74.0 | 71.5 | -2.5 |
| points_q4 | MID | more | -6 | 6570 | 74.0 | 71.5 | -2.5 |