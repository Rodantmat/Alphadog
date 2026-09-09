# Period props (2026-09-09) — out-of-sample ['2024-25'], history ['2023-24'], OT=include, shift_lambda=0.5

Findings: {"q1_blowout_minutes_ratio_by_role": {"IRON_MAN": [0.984, 0.998], "HIGH_USAGE_STARTER": [1.006, 1.01], "STARTER": [1.009, 1.015], "ROTATION": [1.017, 1.046], "BENCH": [0.911, 1.111], "FRINGE": [0.624, 0.873]}, "q1_3state_by_role": {"IRON_MAN|close": [0.0, 1.008], "IRON_MAN|medium": [0.001, 1.004], "IRON_MAN|blowout": [0.0, 0.99], "HIGH_USAGE_STARTER|close": [0.004, 1.015], "HIGH_USAGE_STARTER|medium": [0.003, 1.012], "HIGH_USAGE_STARTER|blowout": [0.003, 1.011], "STARTER|close": [0.019, 1.027], "STARTER|medium": [0.02, 1.031], "STARTER|blowout": [0.019, 1.026], "ROTATION|close": [0.07, 1.077], "ROTATION|medium": [0.091, 1.112], "ROTATION|blowout": [0.104, 1.119], "BENCH|close": [0.253, 1.332], "BENCH|medium": [0.311, 1.359], "BENCH|blowout": [0.349, 1.413], "FRINGE|close": [0.461, 2.022], "FRINGE|medium": [0.571, 2.025], "FRINGE|blowout": [0.679, 1.953]}, "q1_ot_minutes_by_role": {"BENCH": 0.47, "FRINGE": 0.25, "HIGH_USAGE_STARTER": 1.25, "IRON_MAN": 1.63, "ROTATION": 0.7, "STARTER": 1.04}}

## threes_made_q1
| offset | n | mean pred | actual | gap pp |
|---|---|---|---|---|
| -6 | 19450 | 0.301 | 0.296 | -0.6 |
| -5 | 19450 | 0.301 | 0.296 | -0.6 |
| -4 | 19450 | 0.301 | 0.296 | -0.6 |
| -3 | 19450 | 0.301 | 0.296 | -0.6 |
| -2 | 19450 | 0.301 | 0.296 | -0.6 |
| -1 | 19450 | 0.301 | 0.296 | -0.6 |
| +0 | 19450 | 0.295 | 0.290 | -0.5 |
| +1 | 19450 | 0.058 | 0.072 | +1.4 |
| +2 | 19450 | 0.011 | 0.014 | +0.3 |
| +3 | 19450 | 0.002 | 0.004 | +0.2 |
| +4 | 19450 | 0.000 | 0.001 | +0.0 |
| +5 | 19450 | 0.000 | 0.000 | -0.0 |
| +6 | 19450 | 0.000 | 0.000 | -0.0 |
### threes_made_q1 / more
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 9899 | 52.4 | 50.9 | -1.6 |
| 55-60 | 8161 | 57.4 | 59.8 | +2.3 |
| 60-65 | 5109 | 62.1 | 57.6 | -4.5 |
| 65-70 | 1933 | 67.2 | 63.5 | -3.7 |
| 70-75 | 313 | 71.1 | 63.3 | -7.9 |
### threes_made_q1 / less
| conf band | n | mean pred | hit rate | gap pp |
|---|---|---|---|---|
| 50-55 | 94 | 53.3 | 72.3 | +19.0 |
| 55-60 | 158 | 57.3 | 73.4 | +16.1 |
| 60-65 | 70 | 61.6 | 71.4 | +9.9 |
| 70-75 | 8 | 74.8 | 100.0 | +25.2 |
| 75-80 | 537 | 78.2 | 76.2 | -2.0 |
| 80-85 | 1769 | 82.6 | 80.8 | -1.8 |
| 85-90 | 2440 | 87.6 | 86.8 | -0.8 |
| 90-95 | 5259 | 93.1 | 92.1 | -1.1 |
| 95+ | 106687 | 99.7 | 99.5 | -0.2 |

## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)
| prop | var band | side | rung | n | pred | hit | gap pp |
|---|---|---|---|---|---|---|---|
| (none) | | | | | | | |