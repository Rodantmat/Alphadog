# Period props (2026-09-09) — out-of-sample ['2024-25'], history ['2023-24'], OT=include, shift_lambda=0.5

Findings: {"q4_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.366, 0.358], "HIGH_USAGE_STARTER": [0.345, 0.419], "STARTER": [0.546, 0.499], "ROTATION": [0.851, 0.749], "BENCH": [1.325, 1.217], "FRINGE": [2.383, 2.557]}, "q4_3state_by_role": {"IRON_MAN|close": [0.038, 1.074], "IRON_MAN|medium": [0.088, 0.896], "IRON_MAN|blowout": [0.464, 0.635], "HIGH_USAGE_STARTER|close": [0.038, 1.112], "HIGH_USAGE_STARTER|medium": [0.127, 0.951], "HIGH_USAGE_STARTER|blowout": [0.486, 0.69], "STARTER|close": [0.115, 1.191], "STARTER|medium": [0.167, 1.053], "STARTER|blowout": [0.434, 0.862], "ROTATION|close": [0.23, 1.384], "ROTATION|medium": [0.253, 1.27], "ROTATION|blowout": [0.349, 1.154], "BENCH|close": [0.336, 1.544], "BENCH|medium": [0.337, 1.523], "BENCH|blowout": [0.27, 1.662], "FRINGE|close": [0.502, 2.146], "FRINGE|medium": [0.489, 2.333], "FRINGE|blowout": [0.187, 2.916]}, "q4_ot_minutes_by_role": {"BENCH": 0.47, "FRINGE": 0.25, "HIGH_USAGE_STARTER": 1.25, "IRON_MAN": 1.63, "ROTATION": 0.7, "STARTER": 1.04}}

## points_q4
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 20706 | 0.575 | 0.572 | -0.2 |
| -5 | 20706 | 0.573 | 0.571 | -0.2 |
| -4 | 20706 | 0.568 | 0.565 | -0.3 |
| -3 | 20706 | 0.556 | 0.555 | -0.1 |
| -2 | 20706 | 0.532 | 0.533 | +0.1 |
| -1 | 20706 | 0.490 | 0.490 | +0.0 |
| +0 | 20706 | 0.414 | 0.415 | +0.1 |
| +1 | 20706 | 0.309 | 0.311 | +0.1 |
| +2 | 20706 | 0.220 | 0.223 | +0.3 |
| +3 | 20706 | 0.154 | 0.161 | +0.6 |
| +4 | 20706 | 0.110 | 0.113 | +0.3 |
| +5 | 20706 | 0.076 | 0.079 | +0.3 |
| +6 | 20706 | 0.052 | 0.054 | +0.2 |
### points_q4 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 21796 | 52.5 | 52.7 | +0.2 |
| 55-60 | 17706 | 57.4 | 57.3 | -0.1 |
| 60-65 | 12439 | 62.4 | 62.8 | +0.4 |
| 65-70 | 9988 | 67.5 | 66.9 | -0.5 |
| 70-75 | 11348 | 72.4 | 71.0 | -1.4 |
| 75-80 | 5513 | 77.2 | 78.2 | +1.0 |
| 80-85 | 2570 | 82.0 | 80.3 | -1.7 |
| 85-90 | 398 | 86.1 | 83.7 | -2.4 |
### points_q4 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 7244 | 52.5 | 50.7 | -1.8 |
| 55-60 | 9609 | 57.5 | 57.6 | +0.1 |
| 60-65 | 7580 | 62.6 | 61.3 | -1.3 |
| 65-70 | 11011 | 67.6 | 67.5 | -0.1 |
| 70-75 | 11460 | 72.5 | 72.7 | +0.2 |
| 75-80 | 13902 | 77.5 | 77.6 | +0.1 |
| 80-85 | 15262 | 82.6 | 82.2 | -0.4 |
| 85-90 | 21852 | 87.7 | 87.1 | -0.5 |
| 90-95 | 30612 | 92.6 | 92.0 | -0.6 |
| 95+ | 17537 | 96.6 | 96.2 | -0.4 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| points_q4 | MID | less | -4 | 1120 | 26.0 | 20.8 | -5.2 |
| points_q4 | HIGH | less | -5 | 1011 | 23.1 | 18.1 | -5.0 |
| points_q4 | HIGH | more | -5 | 1011 | 76.9 | 81.9 | +5.0 |
| points_q4 | LOW | less | -1 | 5046 | 48.1 | 43.6 | -4.5 |
| points_q4 | HIGH | more | -6 | 1011 | 81.3 | 85.2 | +3.8 |
| points_q4 | MID | less | -3 | 2951 | 31.8 | 28.6 | -3.2 |
| points_q4 | HIGH | less | +3 | 1011 | 76.0 | 79.0 | +3.0 |
| points_q4 | HIGH | more | +3 | 1011 | 24.0 | 21.0 | -3.0 |
| points_q4 | HIGH | less | +0 | 1011 | 57.4 | 60.3 | +3.0 |
| points_q4 | HIGH | more | +0 | 1011 | 42.6 | 39.7 | -3.0 |
| points_q4 | HIGH | more | +1 | 1011 | 35.8 | 32.9 | -2.9 |
| points_q4 | HIGH | less | +1 | 1011 | 64.2 | 67.1 | +2.9 |