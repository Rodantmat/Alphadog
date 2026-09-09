# Minutes model backtest v1 (2026-09-09)

Train ['2023-24', '2024-25'] | Test ['2025-26'] | games train/test 2455/1225 | player-games 79138

## 1. Derived spread (static only)
- HCA fit: 1.98 pts
- corr(derived spread, home margin): train 0.436 / test 0.460; MAE test 11.47

## 2. P(blowout | |derived spread|)
| bin | train P | n | test P | n |
|---|---|---|---|---|
| 0-2 | 0.168 | 644 | 0.185 | 303 |
| 2-4 | 0.158 | 518 | 0.204 | 260 |
| 4-6 | 0.208 | 419 | 0.222 | 194 |
| 6-8 | 0.184 | 337 | 0.220 | 182 |
| 8-10 | 0.199 | 231 | 0.227 | 110 |
| 10-12 | 0.304 | 135 | 0.341 | 85 |
| 12-15 | 0.374 | 115 | 0.373 | 59 |
| 15+ | 0.393 | 56 | 0.406 | 32 |

## 3. DataStreak reproduction (over = PTS > own trailing-10 median, >=15 min players)
| margin | published | ours | n |
|---|---|---|---|
| <=7 | 46.7 | 49.9 | 18658 |
| 8-14 | 44.9 | 48.2 | 16621 |
| 15-19 | 43.8 | 46.8 | 7403 |
| 20+ | 40.9 | 44.5 | 11703 |

Favored vs underdog STARTERS in 20+ blowouts (2025-26 real starter flags):
- favored=False: over-rate 39.4% (n=1249)
- favored=True: over-rate 47.7% (n=1271)

Over-rate by game state (all seasons, all eligible players):
- competitive(<15): 49.1% (n=35279)
- won_blowout(20+): 51.9% (n=5940)
- lost_blowout(20+): 36.9% (n=5763)

## 4. Minutes mixture components
- players with competitive fit: 1554; median sigma_player 5.79 min; median dud rate 0.196

E[min]/mu_role in blowouts by role tier (won vs lost):
| role | won blowout | ratio | n |
|---|---|---|---|
| BENCH | False | 0.964 | 1393 |
| BENCH | True | 0.927 | 1490 |
| FRINGE | False | 0.977 | 2169 |
| FRINGE | True | 0.867 | 2633 |
| HIGH_USAGE_STARTER | False | 0.881 | 963 |
| HIGH_USAGE_STARTER | True | 0.843 | 1082 |
| IRON_MAN | False | 0.864 | 360 |
| IRON_MAN | True | 0.849 | 515 |
| ROTATION | False | 0.974 | 1666 |
| ROTATION | True | 0.946 | 1423 |
| STARTER | False | 0.919 | 1370 |
| STARTER | True | 0.872 | 1430 |

Team-specific starter pull in WON blowouts 2025-26 (lowest ratio = pulls starters earliest):
| team | ratio | n |
|---|---|---|
| 1610612753 | 0.809 | 39 |
| 1610612759 | 0.811 | 55 |
| 1610612757 | 0.838 | 30 |
| 1610612739 | 0.847 | 44 |
| 1610612760 | 0.858 | 123 |
| 1610612766 | 0.865 | 85 |
| ... | | |
| 1610612754 | 1.064 | 15 |
| 1610612762 | 1.080 | 19 |
| 1610612741 | 1.092 | 25 |
| 1610612742 | 1.104 | 10 |

## 5. B2B validation (competitive games only; effect = mean delta on 0 rest minus mean delta rested)
| role | age | B2B effect (min) | n_b2b | n_rested |
|---|---|---|---|---|
| BENCH | <26 | +2.52 | 598 | 3058 |
| BENCH | 26-29 | +1.49 | 422 | 2359 |
| BENCH | 30+ | +1.23 | 362 | 2107 |
| FRINGE | <26 | +1.47 | 366 | 2042 |
| FRINGE | 26-29 | +1.98 | 141 | 968 |
| FRINGE | 30+ | +1.16 | 136 | 844 |
| HIGH_USAGE_STARTER | <26 | -0.36 | 346 | 1656 |
| HIGH_USAGE_STARTER | 26-29 | +0.20 | 381 | 2088 |
| HIGH_USAGE_STARTER | 30+ | -0.32 | 385 | 2266 |
| IRON_MAN | <26 | +0.57 | 150 | 735 |
| IRON_MAN | 26-29 | +0.28 | 250 | 1314 |
| IRON_MAN | 30+ | +0.20 | 186 | 997 |
| ROTATION | <26 | +1.15 | 670 | 3715 |
| ROTATION | 26-29 | +1.07 | 554 | 3197 |
| ROTATION | 30+ | +0.61 | 297 | 1769 |
| STARTER | <26 | +0.73 | 517 | 2742 |
| STARTER | 26-29 | +0.82 | 408 | 2257 |
| STARTER | 30+ | +0.34 | 444 | 2595 |

Published reference: veterans 30+ starters -1.5..-3.0; young stars -0.5..-1.5; bench ~0. These are sign/magnitude sanity checks, not adopted values.