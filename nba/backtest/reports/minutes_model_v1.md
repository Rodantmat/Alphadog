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
- players with competitive fit: 1466; median sigma_player 5.72 min; median dud rate 0.196

E[min]/mu_role in blowouts by role tier (won vs lost):
| role | won blowout | ratio | n |
|---|---|---|---|
| BENCH | False | 1.074 | 1319 |
| BENCH | True | 1.015 | 1427 |
| FRINGE | False | 1.430 | 1663 |
| FRINGE | True | 1.180 | 2081 |
| HIGH_USAGE_STARTER | False | 0.855 | 921 |
| HIGH_USAGE_STARTER | True | 0.837 | 1050 |
| IRON_MAN | False | 0.841 | 356 |
| IRON_MAN | True | 0.832 | 502 |
| ROTATION | False | 1.003 | 1581 |
| ROTATION | True | 0.960 | 1372 |
| STARTER | False | 0.908 | 1318 |
| STARTER | True | 0.867 | 1372 |

Team-specific starter pull in WON blowouts 2025-26 (lowest ratio = pulls starters earliest):
| team | ratio | n |
|---|---|---|
| 1610612759 | 0.803 | 55 |
| 1610612753 | 0.813 | 35 |
| 1610612760 | 0.836 | 110 |
| 1610612739 | 0.843 | 42 |
| 1610612757 | 0.847 | 30 |
| 1610612766 | 0.850 | 79 |
| ... | | |
| 1610612741 | 1.057 | 25 |
| 1610612762 | 1.113 | 18 |
| 1610612754 | 1.211 | 14 |
| 1610612742 | 1.295 | 10 |

## 5. B2B validation (competitive games only; effect = mean delta on 0 rest minus mean delta rested)
| role | age | B2B effect (min) | n_b2b | n_rested |
|---|---|---|---|---|
| BENCH | <26 | +1.62 | 481 | 2520 |
| BENCH | 26-29 | +1.72 | 361 | 1966 |
| BENCH | 30+ | +1.32 | 271 | 1523 |
| FRINGE | <26 | +1.58 | 497 | 2535 |
| FRINGE | 26-29 | +1.34 | 220 | 1368 |
| FRINGE | 30+ | +1.54 | 198 | 1111 |
| HIGH_USAGE_STARTER | <26 | +0.21 | 294 | 1425 |
| HIGH_USAGE_STARTER | 26-29 | -0.00 | 320 | 1823 |
| HIGH_USAGE_STARTER | 30+ | -0.45 | 338 | 1914 |
| IRON_MAN | <26 | -0.18 | 150 | 725 |
| IRON_MAN | 26-29 | +0.99 | 227 | 1199 |
| IRON_MAN | 30+ | +0.51 | 175 | 968 |
| ROTATION | <26 | +0.73 | 483 | 2389 |
| ROTATION | 26-29 | +1.38 | 444 | 2351 |
| ROTATION | 30+ | +0.43 | 282 | 1659 |
| STARTER | <26 | +0.64 | 421 | 2209 |
| STARTER | 26-29 | +0.66 | 313 | 1795 |
| STARTER | 30+ | -0.13 | 363 | 2084 |

Published reference: veterans 30+ starters -1.5..-3.0; young stars -0.5..-1.5; bench ~0. These are sign/magnitude sanity checks, not adopted values.