# Period props (2026-09-09) — out-of-sample ['2024-25'], history ['2023-24'], OT=include, shift_lambda=0.5

Findings: {"q4_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.366, 0.358], "HIGH_USAGE_STARTER": [0.345, 0.419], "STARTER": [0.546, 0.499], "ROTATION": [0.851, 0.749], "BENCH": [1.325, 1.217], "FRINGE": [2.383, 2.557]}, "q4_3state_by_role": {"IRON_MAN|close": [0.038, 1.074], "IRON_MAN|medium": [0.088, 0.896], "IRON_MAN|blowout": [0.464, 0.635], "HIGH_USAGE_STARTER|close": [0.038, 1.112], "HIGH_USAGE_STARTER|medium": [0.127, 0.951], "HIGH_USAGE_STARTER|blowout": [0.486, 0.69], "STARTER|close": [0.115, 1.191], "STARTER|medium": [0.167, 1.053], "STARTER|blowout": [0.434, 0.862], "ROTATION|close": [0.23, 1.384], "ROTATION|medium": [0.253, 1.27], "ROTATION|blowout": [0.349, 1.154], "BENCH|close": [0.336, 1.544], "BENCH|medium": [0.337, 1.523], "BENCH|blowout": [0.27, 1.662], "FRINGE|close": [0.502, 2.146], "FRINGE|medium": [0.489, 2.333], "FRINGE|blowout": [0.187, 2.916]}, "q4_ot_minutes_by_role": {"BENCH": 0.47, "FRINGE": 0.25, "HIGH_USAGE_STARTER": 1.25, "IRON_MAN": 1.63, "ROTATION": 0.7, "STARTER": 1.04}}

## rebounds_q4
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 20706 | 0.550 | 0.539 | -1.1 |
| -5 | 20706 | 0.550 | 0.539 | -1.1 |
| -4 | 20706 | 0.550 | 0.539 | -1.1 |
| -3 | 20706 | 0.550 | 0.539 | -1.1 |
| -2 | 20706 | 0.550 | 0.539 | -1.1 |
| -1 | 20706 | 0.531 | 0.525 | -0.6 |
| +0 | 20706 | 0.415 | 0.411 | -0.3 |
| +1 | 20706 | 0.191 | 0.191 | +0.0 |
| +2 | 20706 | 0.077 | 0.078 | +0.1 |
| +3 | 20706 | 0.030 | 0.030 | +0.0 |
| +4 | 20706 | 0.012 | 0.011 | -0.1 |
| +5 | 20706 | 0.005 | 0.004 | -0.0 |
| +6 | 20706 | 0.002 | 0.002 | -0.0 |
### rebounds_q4 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 20212 | 52.5 | 52.2 | -0.3 |
| 55-60 | 21424 | 57.6 | 56.7 | -0.9 |
| 60-65 | 18394 | 62.3 | 60.4 | -1.9 |
| 65-70 | 9952 | 67.4 | 65.8 | -1.6 |
| 70-75 | 7313 | 72.3 | 73.2 | +0.9 |
| 75-80 | 5055 | 77.1 | 76.0 | -1.0 |
| 80-85 | 680 | 81.5 | 79.9 | -1.6 |
### rebounds_q4 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 1246 | 53.0 | 56.3 | +3.3 |
| 55-60 | 2604 | 57.7 | 60.7 | +3.0 |
| 60-65 | 3312 | 62.4 | 67.2 | +4.8 |
| 65-70 | 1931 | 67.3 | 70.5 | +3.3 |
| 70-75 | 2086 | 73.0 | 74.2 | +1.1 |
| 75-80 | 7154 | 77.8 | 77.7 | -0.1 |
| 80-85 | 7850 | 82.4 | 82.9 | +0.5 |
| 85-90 | 7649 | 87.7 | 87.6 | -0.1 |
| 90-95 | 15133 | 92.8 | 92.6 | -0.2 |
| 95+ | 84238 | 98.9 | 98.9 | -0.0 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| rebounds_q4 | LOW | less | -1 | 1325 | 39.6 | 45.4 | +5.8 |
| rebounds_q4 | LOW | less | +0 | 9322 | 60.3 | 63.9 | +3.6 |