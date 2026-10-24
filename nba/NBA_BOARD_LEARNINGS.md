# NBA BOARD LEARNINGS — running log (owner 17:49 PT 2026-10-22: "keep looking at different angles and learning more of it. Keeping track of all learnt")

One line per finding, newest section last. Each finding names its script and run so it can be re-checked. Measured on both seasons
(2024-25, 2025-26) unless marked. Nothing here changes the live pipeline by itself; changes go through the ledger
(nba/NBA_FULL_SYSTEM_CERTIFICATION_2026-10.md) and COMPASS.

## 1. Calibration of our own numbers (research_calibration_audit.py run 39880546631; research_recalibration_v3.py run 39881111672)

- L-1  final_hp is too spread on EVERY line type. 2025-26 standard: fh 0.26 -> hit 0.43, fh 0.80 -> hit 0.576. Goblin G1: 0.15 -> 0.51,
       0.80 -> 0.71. Demons D1-D3: top-end gap +0.16 to +0.39.
- L-2  The error is already in baseline_hp (bh ~ fh); the enrichment does not add it.
- L-3  Demon order vs the same player's standard More is kept almost always - not an ordering bug.
- L-4  Demon top-end gap grows with distance from the standard line (D3 at +1-3: gap +0.31).
- L-5  The as-of calibration (nba_score.ladder_calibration_asof) shifts by (prop, phase, baseline band, side) only: blind to line type
       and rung, and fitted on graded ladder legs from nba_market.board_outcomes, not on the PrizePicks board legs we pick from. Its
       shifts are -0.1 to -0.55 log-odds at the top bands (points, 2026-03); the PrizePicks board needs about -1.1 at fh 0.80.
- L-6  An anchored per-cell recalibration (logit p = a + b logit fh + c logit q; q = 0.5 standard, 1 / (2 x factor) alternates; cell
       prop x line type x side shrunk to line type x side, K 400) beats raw in every stage: 2025-26 H1 -> H2, both season directions,
       14/14 leave-one-month-out. Pooled log-loss raw 0.6320, Platt 0.6167, anchored 0.6137, isotonic 0.6172. Standard calibration
       error 0.059 -> 0.008. After it only ~2% of standard legs are >= .58 and they hit 0.575-0.60; demons almost never reach .58.

## 2. Day-to-day swings (research_day_swings.py run 39881322193; residual = hit - in-sample p per line type x side)

- S-1  Luck alone (legs independent) explains 34-44% of the day-to-day variance of the >= .58 standard hit rate, 17-52% for goblins,
       37% for demons; with a player's legs fully tied it explains all of it. Same-player / same-game correlation is the main
       amplifier of a day's swing.
- S-2  Game environment explains 14-27% of the day residual (corr +0.40 to +0.58): scoring surprise (game total vs trailing-10
       expectation) by side, minutes shock (minutes vs trailing-10), blowouts. These are known only after tip.
- S-3  Best 10% vs worst 10% standard days: scoring surprise +0.31 / +0.35 vs -0.15 / +0.02 per 10 points (Over-leaning boards win
       when games run hot). Goblins: +0.37 / +0.63 vs +0.05 / -0.07, and worst goblin days carry more blowouts (0.27 / 0.34 vs
       0.10 / 0.14). Demons: worst days minutes shock -0.69 (players played less than usual) vs +0.10 on best days.
- S-4  No streaks: lag-1 / lag-2 autocorrelation of the daily hit rate is inside chance on every line type and season
       (|x| <= 0.155 vs 0.16-0.20 bounds).
- S-5  Consequence: a 35% day vs a 78% day is mostly variance amplified by correlated legs plus the night's scoring / minutes
       environment, which is not visible before tip from our numbers' shape (item 21 of the ledger). Levers that ARE available
       before tip: calibrated probabilities (section 1), fewer legs sharing a player / game, and side balance against the slate's
       scoring environment.

## 3. Where the miscalibration is made - by layer (research_calibration_layers.py run 39882518299; research_calibration_layers_v2.py
##    run 39883191272; research_board_centring_asof.py run 39884286185)

- C-1  OUR MEAN vs PRIZEPICKS' LINE: on standard legs our projected mean is worse than PrizePicks' line itself (MAE points 5.30 vs
       5.04, rebounds 2.35 vs 2.31, assists 2.02 vs 1.95 in 2025-26). The least-squares weight our disagreement with the line has
       earned is w = +0.03..+0.12 (points / rebounds / assists / turnovers), +0.33..+0.46 (blocks / steals).
- C-2  ON THE STANDARD LINE our baseline_hp barely separates winners from losers: Over bh 0.29 -> hit 0.48, bh 0.55 -> hit 0.49; Under
       bh 0.45 -> 0.51, bh 0.70 -> 0.52. Discrimination (AUC) of standard legs is 0.53-0.54 before and after any calibration - most of
       it is the side (Under ~51.5%, Over ~48.5% on PrizePicks' line).
- C-3  ON ALTERNATES the hit rate is set by the rung's distance from the standard line; our disagreement with the board counts AGAINST
       the leg (D2 top decile of disagreement hit 0.26 vs 0.33; D3 0.18 vs 0.21) - the board knows news our ladder does not.
- C-4  The stored rate36 of threes_made (and ftm) is an attempts rate (projection 4.4 vs a 1.6 line); the ladder probabilities are
       sane (p_more at the anchor 0.41) - a label issue in the diagnostic columns, not in the probability.
- C-5  FIX L1 (board-centred ladder): move each ladder's centre (p_more = 0.5) toward PrizePicks' standard line, keeping w of our own
       distance; w fitted walk-forward is stable: points 0.2-0.3, rebounds 0.2-0.3, assists 0.2-0.3 (0.5 once), threes 0.1-0.3,
       combos 0.1-0.3, steals / blocks / turnovers 1.0 (our own ladder kept), stocks 0.2-1.0.
       L1 alone takes pooled log-loss 0.6443 -> 0.6267 walk-forward, every month (12/12) including the 2025-26 opener (0.6657 ->
       0.6314). L2 (spread per line type x side) and L3 (anchored residual per prop x line type x side) add 0.0005 together.
- C-6  What the calibrated pool looks like (walk-forward, 12 months, legs >= .58): standard Over 24,390 legs hitting 0.536 -> 514
       hitting 0.584; standard Under 33,113 at 0.551 -> 3,476 at 0.561; demons D2 2,988 at 0.455 -> 16; D3 592 at 0.343 -> 5;
       goblins G1 55,303 at 0.655 -> 67,190 at 0.649, G2 43,122 at 0.703 -> 56,653 at 0.686, G3 20,629 at 0.748 -> 24,405 at 0.740.
       Honest numbers make the standard and demon pools small; goblins carry the board.
- C-7  BUILT AND CERTIFIED: nba/build_board_hp.py writes nba_score.board_hp beside final_hp (history 2024-11-13 .. 2026-10-22,
       live from P3). audit_board_hp.py run 39890697569 on 841,446 graded legs: log-loss 0.6219 -> 0.6052, every decile within 1-2
       points. Nothing reads board_hp yet; final_hp stays the engine's number.

## 4. Open questions to work next (owner 17:49 PT program)

- Q-1  Board profiles on the calibrated number: re-run the day-by-day signal study (research_board_day_signal.py) with board_hp in
       place of final_hp - does the board's shape separate good and bad days once the mis-centring is gone?
- Q-2  Reverse engineering of strong days per aspect (prop, player tier, goblin / demon rung, side): patterns and streaks on
       board_hp residuals (hit - board_hp) rather than on raw hit rates, so calibration error is not mistaken for a pattern.
- Q-3  Same-player / same-game correlation is the main amplifier of daily swings (S-1): measure it directly on board_hp and on the
       slips (how much of a slip's variance is shared legs).
- Q-4  Alternate Less legs: no graded history yet - grade them live and fit their own L2 / L3 cells once enough exist.

## 5. On the one number (final_hp board-centred, 2026-10-23; ledger DAY THREE 23)

- N-1  The calibrated pool, standard lines: final_hp >= 0.70 is a SMALL pool (0-5 legs on most 2024-25 / 2025-26 slates; 80-100 slates
       a season produce a 3-leg slip) and it is dominated by the low-volume props - turnovers, steals, stocks, blocks. Their tails are
       still overconfident (>= 0.70: turnovers hit 0.644, steals 0.678, stocks 0.596, blocks 0.611 in 2025-26) while the big props
       almost never reach 0.70 on a standard line (points 21 legs, rebounds 0, threes 0 in 2025-26). research: tier_map_legs query.
- N-2  Best 2-slip mix on the new number: rebounds 4-Flex + calibrated 3-Power (P_cal_r70_3power) - lb5 +24.9 / +47.2 vs production
       +22.5 / +37.5, drawdown 20.0 / 12.0 vs 26.5 / 12.5 (research_pp_calib_portfolio run 39918732552). On days the 3-Power has no
       slip, the rebounds 4-Flex's second slip beats any other production unit as the fill.
- N-3  The weighted:rebounds_R 4-Flex alone (1 slip a day) is the strongest single unit on the new number: +60.5 / +101.0%, lb5 +25.2 /
       +66.2, dd 9.2 / 8.0, halves +31 +92 +97 +105.
- N-4  BOARD PROFILES (slate size x calibrated depth): a unit switch per profile, chosen on one season, loses on the other (N2: +46.9%
       vs +65.8%, +52.1% vs +55.1%). Crude board profiles over-fit. Stable pattern: small slates (<= 4 games) are where units lose
       (calibrated 3-Power -100% on its 3-7 small-slate days, production 3-Powers -40..-100%); stocks 4-Flex is the exception
       (S-thin +116% / 20 days, 2025-26). Next pass: a small-slate rule (skip or swap) tested chosen-on-one / tested-on-the-other.
- N-5  Live boards carry props outside the 12 calibrated ones (fgm, fga, ...) whose final_hp is the as-of number - not comparable with
       the calibrated props in one ranking (10-22: fgm Under at 0.883 led the board). Any strategy ranking across props must stay
       inside final_hp_board_cal.PROPS until those props get the chain.
- N-6  Standard-line source: a book listing a ladder in its main market (Fanatics stocks, BetRivers points) is not a main line - left
       out of the books median (audit_one_number run 39917858707).

## 6. Game environment and board profiles on the one number (2026-10-23; ledger DAY THREE 24)

- E-1  game_lines_closing.game_date is the UTC tip date and season is the calendar year - join on the local date via
       research_leg_environment.game_lines_local() (schedule_norm, same pairing on the date or the day before).
- E-2  Leg level: final_hp already carries the environment. Cross-fitted corrections per dimension (total, spread, back-to-back,
       opponent back-to-back, slate size, month) change log-loss by -0.00007 .. +0.00013 - no L3 environment layer.
- E-3  The one consistent leak: Overs on goblin / demon lines for a team on a back-to-back (combos / points Over goblins -0.024..-0.040
       in both seasons). Same direction: assists Over demons on low totals, points Over demons as an 8+ favourite, threes Over demons
       in Dec-Jan.
- E-4  Slate level (pre-registered A / B / C profiles): <= 4 games loses for nearly every calibrated unit; >= 9 games with few
       back-to-backs (C1) is where long calibrated slips earn (5-6 picks); >= 9 games with many back-to-backs (C2) is where they lose.
- E-5  Candidate, not live: on C1 slates swap the calibrated 3-Power for calib R 0.60 6-Flex (+9.3 / +64.3 units over the two
       seasons, lb5 flat in 2024-25; the 6F was picked after seeing both seasons). Track it on 2026-27 C1 slates before any decision.
- E-6  One-feature board rules over-fit: 0 of ~2,100 held in both directions. Board-shape features (legs, shares, std >= x) differ
       between the 2024-25 capture and the 2025-26 live board, so they cannot be cut on one season and applied to the other.

## 7. Board types round 1 - 100 factors, slate types, the line gap (2026-10-23; ledger DAY THREE 25)

- T-1  Test design that survives: residual vs the season's side x line type baseline, z clustered by slate, >= 20 days, BH q < 0.05
       in each season, cross-fit on top of the baseline with a day-clustered z. Without the baseline and the day clustering, random
       factors 'hold' (4 of 13 in the synthetic test). Earlier 'better both ways' results of size ~0.00005 log-loss are noise.
- T-2  final_hp already carries the match day: calendar, rest / travel, team strength and pairings, injuries (team, opponent, the
       player himself), officials, board depth, usual hitters and player memory add nothing out of season.
- T-3  The one survivor is market structure - PrizePicks' standard line vs the books' consensus. At pick time (window snapshot) it is
       ~2-3 points of hit rate when the gap is >= 1 (More when PrizePicks is lower, Less when higher), on a few % of legs - real but
       too small to change slips. Near misses worth a round 2: opp allowed in the leg's stat, last-5 average vs the line.
- T-4  LEAK RULE: board_snapshots 'close' is tip time (after the pick). Any books / market factor must use the 'window' label (or
       earlier); the round-1 line gap doubled on the close snapshot.
- T-5  Slate types recur (k-means fitted on either season finds the deep / strong board and the thin board), but the strategy edge on
       them is concentrated in a few big long-slip days in 2024-25; on trailing percentiles the strong-board 6-Flex swap is a 2025-26
       pattern only. Next tests on slate types must report the gain without the best 3 days and across windows / thresholds.
- T-6  final_hp over-credits recent form: last-5 average above the line -> More ~2-3 points below final_hp; below the line -> ~2.5-3
       above (points, combos, both seasons; round 2 run 40004208892). As a cross-fitted layer it sharpens the top buckets but is not
       significant both ways and costs the live pair units - it belongs in the next final_hp refit as an input, not in a slip rule.
- T-7  The market at pick time is already inside final_hp (books' devigged probability at PrizePicks' line adds nothing in 2024-25).
- T-8  TIMING: the historical 'window' snapshot is ~14:40 PT; the live pick is ~13:15 PT. Backtests carry ~85 minutes more news than
       live. Any live-vs-backtest gap should be read with this in mind.
- T-9  One model over every factor (ridge / gradient boosting) sharpens probabilities in a 2025-26 walk-forward but costs the live
       pair units and helps only 5-6-pick slips: better log-loss is not better 2-4-pick slips. Refit input, not a slip rule (ledger 27).
- T-10 Day-to-day relations are absent: slate residuals and strategy profits do not persist, trailing / look-alike-day forecasts
       fail both seasons, play/skip gates do no better than random skips (ledger 28). The one lead (2-Power after a losing
       15-slate stretch) holds at 15 slates only, not at 10 / 20 / 25 / 30 - closed as an isolated window.
- T-11 PROFILE METHOD (ledger 29): a profile is defined WITHOUT strategies, must recur in both seasons, be identifiable before the
       pick and be distinct (also from intersections / unions of known profiles). Clustering is only meaningful on feature families
       that co-move beyond noise, and must beat shuffled data; without these gates random features produce 'profiles'.
- T-12 OPERATIONS: the pick must respect each leg's own tip vs when the owner places (10-23: an early 13:00 PT game made a slip
       unplaceable); soft steps can time out silently on big slates (market refresh 8 minutes).
