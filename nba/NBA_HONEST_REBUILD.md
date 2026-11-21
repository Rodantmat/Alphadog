# NBA HONEST REBUILD - the working document

**What this is.** The single record of the "honest history" adjustment: why it exists, what is proven, what is running in parallel, every decision with its reason and source, what the live system reads today, where we want to land and how the result gets wired back in. Owner instruction (2026-11-19 11:20 PT): *"Create a specific document ... current state, every decision ... why ... from where, sources, where you want to land ... after every single move ... document everything. And after every single session interaction with me, you're gonna update documentation."*

**Rule for whoever works on this (Claude included).** Update this file after every move on the rebuild and at the end of every interaction with the owner: add to the LOG (section 12), then correct sections 1-11 so they describe the present. Nothing here is "to be written later". The general project record stays in `NBA_COMPASS.md`; this file is the detail for this adjustment only.

Last updated: 2026-11-19 14:54 PT (Claude, session 01H2FMsCx3km84dy84mk9Bwq).

---

## 1. State (items 1-8 written 14:16 PT; items 9-12 added 19:07 PT, 2026-11-19 - read this first)

**LATEST (19:07 PT): phases A-D of the owner's directive D8 have had their first complete pass - read section 8u first, then 8o-8t.**

1. **Cause (proven):** the certified backtest harness gave every game of a month the player's month-END rate tier, so the two past seasons of model numbers carried the future. Live production was always honest. Honest history now lives in `nba_score.baseline_history_h` (15 props, three seasons); one honest leg table for four apps in `nba_score._lr_legs_h` (rule C12: an outcome table - never a lookup for another leg).
2. **Verdict at real prices (8d):** no proven per-leg edge on any app. The model adds almost nothing beyond the market (weight 0.03-0.06). PrizePicks goblins -10%, demons -37%, regular lines -4% to -12%; Sleeper / Fliff ~ -5% to -12%; Underdog ~0 to slightly negative. The board's leg ROI overstates by 13-22 points on every app (8f). Structure cannot create an edge (8f, 8i); 66,000+ cells scanned on three seasons with a shuffle yardstick: nothing repeatable (8h, 8k).
3. **Owner decision D7 (12:27 PT):** keep playing as now. Nothing live was changed by this work.
4. **What is LIVE from this work:** the daily referee (`nba-honest-referee.yml`, 04:37 PT, table `nba_score.honest_referee`) - the out-of-sample scoreboard at real prices.
5. **The one family that keeps showing up (8g, 8l) - not proven:** the very top of the system's list of REGULAR UNDERS (2-10 legs a slate). Honest model, three seasons, top 6: Underdog 0.519 / 0.565 / 0.580, PrizePicks 0.503 / 0.548 / 0.580 (first season = model with one training season). This season with the production number, top 6 a slate: Underdog 0.621 (+16.1% [+5 .. +28]), Fliff 0.724 at its prices (+11.6% [+2 .. +21]), Sleeper 0.730 (+8.9% [+0 .. +18]), PrizePicks 0.552 (+1.8%). It dies quickly with list length (top fifth: PrizePicks -6%, Sleeper -8%, Fliff -5%, Underdog +8.5%). Best playable form found: Underdog, ONE 2-pick Standard a slate from the top 2: +1.6% / +36.9% [+14 .. +61] / +56.9% over 155 / 156 / 29 slips.
6. **Retraction on file (8j):** a "half point below the market" lead was my own join artifact (ties filtered); caught and removed before any report.
7. **Ready, not switched:** the one-block tier fix in production (dry-run clean, +3-4 s; C10); the honest leg-ROI formula (book chance at the line x real price; O13).
8. **OWNER DIRECTIVE D8 (14:51 PT) governs from here - section 8n: certify the numbers, then the best per-leg hit rate and ROI, then the per-leg store for all back data, then the whole battery from zero; live strategies stay and are not patched.** Earlier open items: O13 (show the honest leg ROI on the board), promotion of the top-of-list Unders to a tracked paper strategy / pool-size cut of the live strategies, O14 (Underdog prediction-pick payouts ~3% above our table; exact pricing needs his logged-in quote).

9. **Phase A (numbers certified) DONE:** the first "honest" recipe still leaked through two all-rows league constants; fixed (`TL.honest`), truncation invariance 15 / 15 at 100.00%, input audit 7 / 7, in-play boards removed in all seasons, PrizePicks alternate prices bounded by real quotes (8o, 8p).
10. **Phases B, C, D DONE (first complete pass):** walk-forward per-leg model for 4.65M legs (`_lr_legs_hp`), per-leg store (`v_legs_honest` + 3 roll-ups), battery from zero (~130,000 strategies, controls, walk-forward of the selection) (8q-8t).
11. **Result (8u):** no group of legs is profitable at real prices; ONE thin candidate per app on Underdog and PrizePicks - the top 2-4 regular single-stat Unders of the slate by the blend, about one slip a slate, positive in all three seasons, about 2 standard errors: probable, not proven. Sleeper / Fliff cannot be certified (derived history prices, 29 real slates). PrizePicks goblins / demons unanswerable from history (C9).
12. **LIVE from this work (nothing in production changed):** the daily referee now also rebuilds this season's honest history, re-scores the per-leg model, refreshes the store and records the candidate's slips in `nba_score.honest_top_list` (`audit_top_list_tracker.py`) - a forward scoreboard, not a strategy switch. Heavy steps skip themselves if the run starts after 06:10 PT.

## 2. How we got here (chain of evidence, in order)

1. **Leg-ROI model, first test (2026-11-18 night).** A per-leg ROI model (hit chance x leg multiplier - 1; hit chance = logistic blend of model log-odds and price log-odds) looked honest and positive on two past seasons for PrizePicks and Underdog (`research_leg_roi_model.py`, `research_leg_roi_proof.py`).
2. **It failed on this season.** Underdog 2026-27 (28 slates): legs rated positive predicted +5.7%, real -5.9%. Recent-weighting (half-life 60/30/15/8/4 slates), a this-season-only fit and the two top-leg corrections did not fix it.
3. **The model's own signal is gone this season** (`research_leg_roi_diag.py`): weight of the model in a logistic fit inside each period, PrizePicks regular lines: 2024-25 +0.26, 2025-26 +0.28, 2026-27 +0.07; top-fifth-minus-bottom-fifth hit +9.4 / +11.0 / about 0. Every month of history positive, including each season's first month. Underdog the same (0.48 / 0.68 -> 0.21).
4. **Not the market** (`research_leg_roi_diag2.py`): naive form numbers built only from earlier games (last-10 average against the line, last-20 over rate) predict nothing in all three seasons.
5. **Future information in the history**: after removing all past form (3/5/10/20/40 games, season to date, last season, minutes trend), what is left of the historical model still tracks the player's NEXT games: +0.10 (game itself), +0.09 (next game), +0.12-0.14 (games +2..+5), +0.08 (games +6..+20); strongest early in each season, fading to +0.03 by April; live this season -0.03. The test was validated with control predictors: built-honest controls score <= 0.045, built-leaky controls +0.18 .. +0.77.
6. **The line of code** (`nba/backtest/classification_ladder_v12.py`, tier prior block, about line 469):
   ```python
   for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):
       pop = grp.groupby("PLAYER_ID")["rate36"].last()      # <- the player's rate at his LAST game of the month
       ...
           tier_prior[(s, ym, role, pid)] = (int(tnum), int(total_tiers), float(blended))
   d["tier"] = [...keyed by (season, month, role, player)...]    # every game of the month gets it
   d["tier_prior"] = [...]
   ```
   `tier_prior` enters `shrunk36 = (n * rate36 + k * tier_prior) / (n + k)` with k = 20-50 (`k_stab` per prop) and n = games in season, so its weight is largest early in a season. `tier` also keys the empirical cells `emp[(tier, role, offset)]`.
   Production (`nba/baseline/build_baseline_ladder.py`, one date at a time, data `< ASOF` plus virtual slate rows) can only see up to today, so the LIVE number is honest. The history (`nba/baseline/build_baseline_history.py`, the whole season in one pass) is not.
7. **Proof** (`research_tier_prior_leak.py`, runs v25 / v26 / v27): the harness run twice, untouched and with the tier taken day by day, checked on real PrizePicks regular lines, points + rebounds over legs (top fifth minus bottom fifth hit / log-loss gain x10,000):

   | Season | Legs | Harness as stored | Tier fixed | Live production |
   |---|---|---|---|---|
   | 2024-25 | 12,551 | +7.8 pts / 18.9 | +0.3 / 0.1 | - |
   | 2025-26 | 16,510 | +10.4 / 24.0 | +1.5 / 0.6 | - |
   | 2026-27 | 3,478 | +7.9 / 30.6 (replayed) | -0.7 / 0.8 | -2.9 / 0.2 |

   Leak test, stored vs fixed: +0.10 / +0.14-0.17 / +0.08-0.11 -> +0.01 / +0.01-0.02 / +0.03. The stored harness reproduces the stored `final_hp` (weights +0.22 / +0.24 vs +0.25 / +0.27). Replaying the faulty version on THIS season re-creates the same +7.9.
8. **Production parity this season**: production `rate36` equals the replay on 97% of player-games, projected minutes 81% (mean abs diff 0.10), role tier 100%, anchors 67% against the fixed replay; correlation of probabilities 0.946. No production defect.
9. **A mistake of mine caught before reporting**: a first version of the proof read the fixed run at the faulty run's rungs (the two runs have different anchors) and showed a false "+6-8 pts honest skill". Fixed by matching each run to the real line through its own rungs (commit "match each run to the real line through its own rungs"). Lesson kept in section 10.

Earlier documentation already names this class of bug as "the recurring bug of this system" with three cases (`NBA_BASELINE_CALIBRATION.md` section 3.10b: MLB as-of table including day D; NBA FRINGE season-wide mean; a pasted calibration table). This is the fourth.

## 3. What is void, what still stands

**Void until re-measured on honest history** (everything that ranks or selects by the historical `baseline_hp` / `final_hp` / `score`):
- strategy backtests behind the live slips, all apps (PrizePicks A/B sets, Underdog P5, Sleeper, Betr, Fliff where they rest on history);
- tier maps and bands (`tier_map_legs*`, `tier_band_calibration`), calibration layers fitted on history (`ladder_calibration_asof`, board-cal tunables, recalibration map), confidence models;
- the leg-ROI proofs of 2026-11-18/19 on 2024-25 / 2025-26, and the "+17.9% top 5" style numbers;
- board-profile research and any ROI / drawdown figures quoted from two-season sweeps.

**Still valid:**
- the live pipeline's numbers this season (they are honest) and this season's real graded results;
- everything about PRICING: PrizePicks payout tables, goblin / demon hidden price work (sections in `NBA_COMPASS.md` 2026-11-18/19), Sleeper / Underdog / Fliff / Betr payout mapping, the 2,000x Power cap, the board "Unverified" fix (UI v1.5.8);
- price-side facts that do not use the model: PrizePicks regular Less hit 50.6% / 51.6% / 52.6% (2024-25 / 2025-26 / 2026-27) vs More 49.4% / 48.4% / 47.4%; real-quote returns of goblins (-9% at base 0.56, -6% at 0.542) and demons (-43%, worse the deeper) on 9,279 quoted legs (probe sample);
- the proof tooling itself (planted-truth and placebo checks pass).

**Not yet known (the reason for the rebuild):** whether the honest model keeps skill on goblins / demons, on other props (assists, threes, steals, blocks, turnovers, combos), on Underdog tiers, and on the other apps.

## 4. Decisions (each with why and source)

| # | When (PT) | Decision | Why | Source |
|---|---|---|---|---|
| D1 | 11-18 23:28 | Replace leg ROI on all four apps, but only after deep proof | owner: "1 but you need extremely deep understanding, simulation, backtest and proof of success before deployment" | owner message |
| D2 | 11-19 09:04 | HOLD deployment; keep testing until it works; thin apps use this season plus history derived from PrizePicks / Underdog earlier seasons and real current data | the model failed on this season | owner message ("2, you need to keep testing ...") |
| D3 | 11-19 09:55 | Be sure before expanding; test, debug, simulate always; pair with online research | owner standing rule for this work | owner message |
| D4 | 11-19 11:05 | Rebuild honest history into SEPARATE tables; production untouched; live slips keep running meanwhile | measure before touching anything the live system reads | owner message ("1") to the three options offered |
| D5 | 11-19 11:20 | This document; updated after every move and every interaction | "so we don't lose anything" | owner message |
| D6 | 11-19 11:34 | Continue non-stop until the work is done AND wired live; report only when a decision is truly needed from the owner; every system decision grounded on debug, data and online research; focus on precision of ROI, hit rate and accuracy; for slips and strategies the order of goals is 1) highest steady ROI, 2) low drawdown and droughts | owner standing order for this adjustment | owner message |
| C1 | 11-19 | The fix = the tier taken day by day: on date D the population is each player's latest `rate36` up to and including D inside the month | it is exactly what production sees on D (month-to-date rows plus the slate's rows), so history and live become the same thing | code reading of `build_baseline_ladder.py`; parity check 97% / 81% / 100% |
| C2 | 11-19 | Parallel table stores one row per player-game-prop with the ladder in arrays | 20x smaller than a row per rung; DB plan has no room for a second 19M-row table | `baseline_history` is 19.34M rows (`build_final_hp.py` docstring) |
| C3 | 11-19 | Build through the research workflow by wrapping the production builders with the one-block replacement, not by editing the certified harness | zero risk to production while unproven; the wrapper asserts the block is found, so a harness change cannot pass silently | `research_honest_history_build.py` |
| C4 | 11-19 | Order of work: single-stat props first (four pairs), measure, then combos / periods, then the chain after the baseline | combos are built from the singles' components; measuring early tells us where skill survives before spending on the full chain | harness structure (`build_combos_history.py` uses components) |
| C5 | 11-19 | Plain BLEND (model log-odds + price log-odds) preferred over the isotonic / linear top-leg corrections for leg ROI | as honest and simpler; ISO flattens the top, LIN over-predicts on Underdog | `research_leg_roi_proof.py` results; to be re-done on honest history |
| C6 | 11-19 | The live payout grader for PrizePicks alternates is NOT switched to the mechanistic one yet | hold covers it; same-game term and triples still open | section 9 of this file, `NBA_COMPASS.md` 09:40 PT |

Open decisions for the owner are in section 9.

## 5. What the live system reads today (unchanged by this work)

- **Baseline, daily**: `nba/baseline/build_baseline_ladder.py` (certified recipe + production patches) -> `nba_score.baseline_ladder` / `baseline_history` rows for the day. Honest by construction for the day's rows. Known imperfection: its empirical cells are trained on earlier months whose tiers are month-end (train / serve skew) - same one-block fix, not applied yet.
- **Chain after the baseline**: `nba/build_final_hp.py` (scenario selection, calibration correction, final_hp, score, confidence) with `final_hp_board_cal.py` (board-centre chain; tunable sets stop at as_of 2026-10-23, trained through 2026-04-12 on `tier_map_legs_sel_wo`), market term on since 2026-10-16 (`market_feed.refresh_final_hp = true`, `live_backtest_suffix = _wo`).
- **Strategies / slips**: `nba/build_slip_engine.py`, `live_slip_engine.py`, per-app engines; strategy sets chosen on the two-season history (void, section 3).
- **Board / ROI screen**: `nba/alphadog-v2-nba-main-ui.js` v1.5.8, `main_ui/roi.js` (`estimateHit`: calibration gap + price blend; the formula the proof suite calls BOARD), `main_ui/board.js`, `main_ui/pricing.js`.
- **Pipelines**: P2A 03:30 PT (11:30 and 13:30 UTC windows), P3 afternoon PT; research must not overlap them.
- **Scheduled tasks touching NBA**: morning monitor 05:52 PT (Haiku), slips-ready text backup 13:14 PT (Haiku), calibration re-test at 60 slates on 2026-12-20 (fires into this chat).

## 6. The parallel build (what exists, where)

**Table `nba_score.baseline_history_h`** (created by `research_honest_history_build.py`; nothing else reads it):

| column | meaning |
|---|---|
| season, game_date, player_id, game_id, prop | key |
| anchor | the model's own centre line for that player-game-prop |
| role_tier, var_band, proj_min, rate36 | components (as in production rows) |
| offs int2[], lines float4[], p_more float4[], p_raw float4[] | the ladder: rung offsets, their lines, P(over) after and before the in-season Platt step |
| built_at | load time |

- Build = production's `build_baseline_history.py` pointed at a temp copy of the harness with the one block replaced (`research_tier_prior_leak.OLD` -> `NEW`); `BT_LADDER_STEPS=10`, `BT_INJURY=1`, TRAIN strictly before the test season (2024-25 <- 2023-24; 2025-26 <- 2023-24, 2024-25; 2026-27 <- all three).
- Pairs built: `points,rebounds` / `assists,steals` / `blocks,turnovers` / `threes_made,fg3a`. About 5 minutes a pair locally (595,253 rungs for assists+steals 2025-26).
- Runs (GitHub Actions, research workflow): hh_2025-26 = 44595794080, hh_2024-25 = 44595809486, hh_2026-27 = 44595823851. STATUS: all three DONE. Rows per prop: 2024-25 23,585 (2024-10-22 .. 2025-04-13); 2025-26 24,369 (2025-10-21 .. 2026-04-12); 2026-27 4,401 (2026-10-20 .. 2026-11-18); props points, rebounds, assists, steals, blocks, turnovers, threes_made, fg3a. Table size 178 MB.
- NOT built yet: combos (pra, pts_reb, pts_ast, reb_ast, stocks) via `build_combos_history.py`, periods, postseason, `fga,ftm`, `personal_fouls`; the whole chain after the baseline (final_hp, calibration, tier maps).

**Other scratch tables made for this work** (research only): `nba_score._lr_app_legs` (cache of graded app legs: underdog three seasons 471,652 legs; fliff real 42,206 + derived 1,717,424; pp26 = PrizePicks regular lines this season 28,840; sleeper build hit a deadlock and was re-run - check it landed), `nba_score._mf_study_fs` (older, PrizePicks two-season study legs with the STORED model number).

## 7. Scripts of this adjustment (all in `nba/`, all run through `nba-research-run.yml`)

| script | purpose |
|---|---|
| `research_leg_roi_calibration.py`, `research_leg_roi_calibration_pp.py` | first estimator comparison per app (stored history) |
| `research_leg_roi_model.py` | leg ROI model, walk-forward honesty test; loaders `load_pp`, `load_app` |
| `research_leg_roi_proof.py` | proof suite: planted truth (LP_SIM=1), placebo (LP_SIM=2), slate re-draws, stability, slips, recent-weighted (LP_HALF) and this-season (LP_SEASON) fits |
| `research_pp_real_price_check.py` | real PrizePicks goblin / demon quotes graded on results |
| `research_leg_roi_cache.py` | builds `_lr_app_legs` (LR_APP = underdog / sleeper / fliff / pp26) |
| `research_leg_roi_diag.py` | model weight and ranking power per season / month / tier |
| `research_leg_roi_diag2.py` | model-or-market test with naive predictors; leak tests with honest and leaky controls; lag profile |
| `research_tier_prior_leak.py` | THE PROOF: harness untouched vs tier fixed, on real lines; parity with production; holds `OLD` / `NEW` (the fix) |
| `research_honest_history_build.py` | builds `baseline_history_h` |
| `research_honest_history_measure.py` | measures stored final / stored baseline / honest baseline on PrizePicks and Underdog legs, per season x kind x prop x side, alone and on top of the price; first honest leg-ROI look |

Helper on Claude's side: `scratchpad/study/rr.sh` (`run <label> <script> [ENV=..]`, `get <label>`, `st`). Env values may only contain `[A-Za-z0-9_.,:+-]`.

## 8. Where we want to land

1. **An honest history for every prop the boards carry** (singles, combos, periods if used), three seasons, in parallel tables, with the same recipe production runs daily.
2. **A measured map of real skill**: per app x line type (regular / goblin / demon; Underdog R / F / B) x prop x side - the honest model alone and on top of the price. If a cell has no skill, the system must say so and not rank by it.
3. **A leg-ROI number that is honest on honest history AND on this season**: legs rated X% return about X% (slope ~1, checked by slate re-draws), per app. PrizePicks and Underdog first (multi-season data); Sleeper, Fliff, Betr from this season plus history derived from sportsbook-priced earlier seasons and the PrizePicks / Underdog fits (owner D2).
4. **Strategies re-chosen on honest history** (2-6 picks, Flex and Power, per app, never mixed, exposure rules kept), with this season as the out-of-sample check, reported in final numbers (profit, ROI, slips a day, drawdown, droughts).
5. **Wiring back**, only with the owner's go, in this order: (a) the one-block fix into the certified harness and both builders, with a guard test that fails if the tier ever uses a later game; (b) rebuild production history tables from the honest build; (c) refit the chain (calibration, board-cal tunables, tier maps, confidence); (d) switch strategies; (e) leg ROI on the board. Slips already placed or saved for a day are never changed.
6. **A permanent leak alarm**: the leak test (what is left of the model after past form vs the player's next games) and the replay-vs-live parity check run on a schedule, so a fifth case is caught by a monitor and not by a losing month.

## 8a. FIRST HONEST SKILL MAP (run hm = 44598649248, `research_honest_history_measure.py`; single-stat props only)

Reading: "gap" = hit of the top fifth minus the bottom fifth of legs ranked by the number. For legs whose price varies the gap is taken ON TOP OF THE PRICE (ranking by what the model says beyond the price) - that is the part that can make money. Stored = today's history; honest = `baseline_history_h` at the leg's own line.

**PrizePicks** (match rate of board legs to an honest rung: 97-99%)

| Leg kind | Season | Legs | Stored, on top of price | Honest, on top of price |
|---|---|---|---|---|
| regular | 2024-25 | 38,798 | +9.6 pts | +1.0 |
| regular | 2025-26 | 52,860 | +12.2 | +1.9 |
| regular | 2026-27 (live board, replayed baseline) | 11,704 | live final +0.1, live baseline +0.6 | +3.1 |
| goblin | 2024-25 | 35,539 | +7.6 | +3.1 |
| goblin | 2025-26 | 88,794 | +10.7 | +4.3 |
| demon | 2024-25 | 51,926 | +10.0 | +4.3 |
| demon | 2025-26 | 139,625 | +9.8 | +3.1 |

By prop, honest on top of price (2024-25 / 2025-26): regular points +1.4 / +0.7, rebounds +0.7 / +4.3, assists -1.8 / -1.5, threes +6.3 / +5.2, low-count +0.7 / +3.4; goblin points -1.0 / +1.5, rebounds +2.7 / +4.8, assists +4.3 / +6.3, threes +5.0 / +6.5; demon points +1.3 / +2.7, rebounds +1.0 / +2.7, assists +4.6 / +2.3, threes +12.0 / +5.3. This season regular (small samples): points +3.9, assists +7.1, low-count +2.9, rebounds -1.3, threes -7.9.

**Underdog**

| Tier | Season | Legs | Stored, on top of price | Honest, on top of price |
|---|---|---|---|---|
| F (lower multiplier) | 2024-25 / 2025-26 / 2026-27 | 37,827 / 41,392 / 20,202 | +10.4 / +9.6 / +3.9 | +4.4 / +5.7 / +3.0 |
| B (higher multiplier) | same | 37,795 / 41,207 / 14,969 | +10.2 / +11.8 / +2.9 | +4.2 / +6.5 / +3.5 |
| R (regular), no price variation | same | 33,578 / 37,194 / 3,107 | +10.8 / +12.4 / +11.8 | +2.8 / +3.3 / +11.7 |

Anomaly to check: Underdog R this season (3,107 legs) shows +11.7 for the honest replay AND for the live baseline - too few legs and possibly a different kind of R line this season; do not use until understood.

**Raw model x multiplier is not a leg ROI.** Top 5% of legs by honest probability x multiplier, real return: PrizePicks -6.6% / -9.1% / +0.1% (all legs -13.6% / -16.0% / -7.7%); Underdog -3.0% / -4.0% / -9.2% (all legs -7.7% / -10.9% / -13.4%). The stored number showed +5.9% / +5.7% and +3.8% / +3.6% on the past seasons - that was the leak. The price blend on honest inputs is the next test.

**What this says.** About a third of the skill history claimed is real. It is 3-6 points of hit rate beyond the price on goblins, demons and Underdog alternates, strongest on threes; on PrizePicks regular lines it is 1-2 points (points and assists about zero). Combos are not measured yet.

## 8b. WORK PLAN TO "DONE AND WIRED LIVE" (owner D6; updated as stages close)

| Stage | What | Proof required before the next stage | Status |
|---|---|---|---|
| S1 | Honest baseline, single-stat props, 3 seasons -> `baseline_history_h` | rows per season match the stored history's player-games; leak test ~0 | DONE 11-19 12:25 |
| S2 | Honest combos (pra, pts_reb, pts_ast, reb_ast, stocks, fantasy_score, double_double). The combos recipe `nba/backtest/combos_ladder_v1.py` has its OWN copy of the month-end tier block (lines 108-112) AND consumes the singles' components - both fixed in the build (`HH_MODE=combos`) | same | RUNNING: hc_2025-26 44599959909, hc_2024-25 44599977374, hc_2026-27 44599992946 |
| S3 | PrizePicks leg PRICE for history. `nba_market.board_tiers_v2` holds the PrizePicks board with kind / tier / anchor for all three seasons (2024-10-22 .. today, 2.88M rows) but no price; the old factor (in `_mf_study_fs`) is an estimate that flatters demons. Fit a price model on the REAL quotes (`nba_market.pp_mined_leg`, 11,574 legs since 2026-09-21, plus the ladder rounds) from kind, tier, prop, distance from the regular line, line level; hold out whole days | held-out price error small enough that leg ROI is not driven by price error (target: median abs error <= 3%, no bias by tier) | NEXT |
| S4 | One honest leg table per app (`nba_score._lr_legs_h`): PrizePicks from `board_tiers_v2` (window snapshot) x S3 price x honest probability x result; Underdog from the archived boards (real multipliers); Sleeper / Fliff real this season + derived history | counts reconcile with boards; grading spot-checked | after S2, S3 |
| S5 | Leg probability = blend of honest model log-odds and price log-odds (+ kind / tier / prop terms only where they hold out of sample), walk-forward, per app. Proof suite: planted truth, placebo, slate re-draws, stability, THIS SEASON as referee | slope of real on predicted within 0.9-1.1 on history AND not rejected on this season; no false positives on placebo | after S4 |
| S6 | Strategy search on honest leg ROI with the certified graders: 2-6 picks, Flex and Power, per app (Underdog: no Power above 2 picks, no Prediction legs in Flex), exposure rules, apps never mixed. Goal order: highest steady ROI, then low drawdown / droughts. Selection walk-forward; this season out of sample | chosen sets beat the currently deployed sets on honest history and this season; reported in final numbers | after S5 |
| S7 | Wire live: (a) the one-block fix in `classification_ladder_v12.py` and `combos_ladder_v1.py` (+ guard test) so production cells stop training on month-end tiers; (b) P3 computes the blended leg probability and leg ROI from a config row of coefficients; (c) slip engine switches to the S6 sets; (d) board shows the honest leg ROI; (e) leak alarm + parity monitor scheduled. Each step dry-run on a past date first; slips already placed or saved are never changed; nothing during P2A 03:31-03:46, P2B 08:06-09:15, P3 13:17-13:35 PT | dry-run equals live output where it should, differs only where intended | after S6 |

Pipeline windows measured 11-17..11-19 (PT): P2A 03:31-03:46, P2B 08:06-09:15, P3 13:17-13:35.

## 8c. RESULTS OF S2-S5 SO FAR (2026-11-19, real clock checked with the time tool)

**S2 DONE - combos.** `baseline_history_h` now holds, per season (2024-25 / 2025-26 / 2026-27): singles (points, rebounds, assists, steals, blocks, turnovers, threes_made, fg3a) 23,585 / 24,369 / 4,401 rows per prop; combos (pra, pts_reb, pts_ast, reb_ast, stocks, fantasy_score, double_double) 165,095 / 170,583 / 30,807 rows.

**S3 DONE - stored PrizePicks leg prices against real quotes** (`research_pp_price_validate.py`, runs pv / pv2; 10,200 real rungs on 29 dates). Stored model price / real: median 0.961 on the 2-pick read; on the sharp 6-pick read goblins 0.980, demons 0.871 (demons under-priced by the stored model). STACKED re-centring (stored price as an input + distance + level + tier + prop group, whole days held out): unbiased, mean abs error 4.7% goblins, 8.5% demons. Coefficients (const, log stored, (log stored)^2, distance, level, tier, rebounds, assists, threes, combo): goblin 0.1629, 0.4040, -0.5178, 0.5156, -0.0533, -0.0042, 0.0833, 0.0861, 0.3101, -0.0215; demon -0.0381, 1.1421, -0.0682, 0.0040, 0.0247, 0.0186, -0.1103, -0.1355, -0.1589, 0.0102. DECISION C7: history uses the STACKED price; LIVE must use real quotes (the quote tool), never the modelled price.
- Under alternates are NEW this season (first seen 2026-10-21; 17,264 graded legs). The STACKED fit was trained on Over rungs only and mis-prices them (it produced a fake +17% "goblin Under" return). 111 real Under quotes: stored factor = 0.93-0.97 of real, mean abs error 7.5%. DECISION C8: Under alternates are priced stored / 0.95 and tagged "-u"; they stay OUT of strategy search until real Under quotes are in the hundreds per kind (one season, small sample, weak price).

**S4 DONE - one honest leg table** `nba_score._lr_legs_h` (`research_legs_h_build.py`): PrizePicks 271,475 / 663,363 / 147,077 graded legs (85% / 94% / 92% with honest probability); Underdog 214,758 / 191,147 / 65,747; Sleeper 636,345 derived / 1,081,079 derived / 76,376 real; Fliff 636,345 derived / 1,081,079 derived / 42,206 real.

**S5 - proof on honest inputs.**
- Underdog (run s5_ud): in the blend the model gets weight 0.03-0.06, the price 0.50-0.55. BLEND is honest (slope 1.16 all history; 0.91 this season). This season: top 5 legs a slate predicted +4.5% -> real +4.0%; all positive legs (19 a slate) +2.6% -> +0.5%. On history only ~6 legs a slate are rated positive (+1.9% -> +0.3%). The board formula is still badly overstated (positive legs +18.6% predicted -> -17.6% real).
- PrizePicks plain hit rates, regular lines (no model, `_lr_legs_h`): every prop, every season, Unders hit 0.50-0.53 and Overs 0.46-0.50; break-even is 0.542 (5/6-pick Flex) to 0.577 (2-pick Power). NO regular-line cell clears break-even on price alone. By kind (return at the leg's own price): regular Over -9% / -11% / -12%, regular Under -6% / -5% / -4%, goblin Over -0.3% / -2.9% / -5.0%, demon Over -18% / -20% / -33%. The honest baseline is biased to Unders on regular lines (says 0.53-0.58, real 0.50-0.53) -> must be re-centred by the blend, never used raw.
- PrizePicks / Sleeper / Fliff proof runs s5_pp / s5_sl / s5_fl dispatched 12:09 PT.

**Real live record this season (from 2026-10-20), for reconciliation.** PrizePicks live 116 slips +42.4u, shadow 578 +148.3u, backup 92 -28.3u; Underdog live 60 +21.7u, shadow 183 +24.2u, paper 32 -17.0u; Sleeper live 75 +14.2u; Fliff live 73 +26.1u; Betr live 34 -12.5u. PrizePicks live legs are mostly regular low-count lines (steals Under .529 n121, turnovers Under .505 n99, stocks Under .537 n95, turnovers Over .593 n81, blocks Under .633 n49; SE .05-.07). OPEN (O11): these hit rates are at or below break-even on average, so the positive units come from slip-level variance and a few high-pay hits, or from the correlation / structure of the slips - to be settled in S6 with the certified graders, not assumed.

## 8d. S5 VERDICT (2026-11-19 12:25 PT) - NO PROVEN PER-LEG EDGE ON ANY APP AT REAL PRICES

Runs: s5_pp 44605663555, s5_sl 44605680141, s5_fl 44605696659, rq 44606558507, rq2 44608000922 (`research_pp_realquote_edge.py`), be 44607383491 (`research_book_edge.py`), lh4 44606279210 (leg table rebuilt with Under alternates re-priced, C8).

1. **The model adds nothing beyond the market.** In every walk-forward blend the honest model's weight is 0.03-0.06 (PrizePicks 0.03, Underdog 0.05, Sleeper 0.04, Fliff 0.04). On PrizePicks regular lines the model's top tenth (it says 0.68-0.82) really hits 0.48-0.55 in all three seasons, every prop family, both sides. Raw model picks lose 5-10% a leg.
2. **PrizePicks, real prices (the referee).** 6,964 alternates with a REAL quote, graded (28 days this season): goblin Over return -10.6% (+-1.4), demon Over -36.6% (+-2.6); every price band, tier, prop is negative (best: goblin rebounds +3.9% +-6.7 on 100 legs = noise). Regular lines, three seasons, 390,000 legs: Over -9 to -12%, Under -4 to -6%; no prop x side cell reaches the 0.542 break-even.
3. **The "+27% a leg" goblin edge of run s5_pp was an artifact of MODELLED prices.** On real quotes the same history-fitted pickers return -10% to -15% (top 5 a day) and -6% to -13% (legs rated positive). Legs that look positive at the modelled price have a modelled price 10-16% above the real one. RULE (C9): no PrizePicks goblin / demon backtest result counts unless it is valued at real quotes.
4. **The sportsbook number at the app's own line is the only real signal** (`market_consensus`, window; weight ~1.0 in the blend, calibrated on regular lines: book 0.52-0.54 -> real 0.523-0.528 in all three seasons). But PrizePicks prices its alternates ABOVE the book: on 900 real-quoted rungs with a book number, a goblin the book puts at 0.57 needs 0.607 at the real price and hit 0.513; legs the book rates positive at the real price: 29 goblins (1 a day) hit 0.483, return -17%. On regular lines the book almost never disagrees enough: book chance >= 0.56 on 0.1 / 0.5 / 1.7 legs a slate (hit 0.53 / 0.62 / 0.56, +-0.06 to 0.12).
5. **Underdog** (real multipliers): book-led blend, legs rated above +3%: +7.0% (2024-25), +4.7% (2025-26, range -0.2..+10.2), **-19.8% this season** (233 legs, range -30..-11). Earlier honest BLEND without the book: top 5 a slate +4.0% this season, positive legs +0.5%. Small and unstable.
6. **Sleeper / Fliff** (real boards this season; history derived): honest BLEND positive legs +0.1% / +0.3% over history, Sleeper this season -11.7%; Fliff ~0. No edge.
7. **Live record reconciled.** UNIQUE PrizePicks legs actually on live / shadow / backup slips this season: 936 legs hit 0.526 (+-0.016); played slips 235 legs 0.536 (+-0.033); regular-line Unders 0.546 (+-0.040) played, 0.546 (+-0.030) shadow, 0.466 backup. Break-even is 0.542-0.577. The +42u (played) and +148u (shadow) come from slip variance and the same legs counted on several slips (e.g. A_regular_5power: 54 shadow slips, leg hit 0.552, +106u), not from a leg edge. Live production is honest by construction, so this is the cleanest out-of-sample test of the production chain: it agrees with the honest replay.

**What this means.** The history that certified every strategy was contaminated (section 2); on honest inputs and real prices no app shows a repeatable per-leg edge, and the leg-level expectation of what is being played is about -4% to -12% a leg on PrizePicks. S6 (strategy search) cannot create an edge out of legs that have none; it stays open only for structure effects (correlation inside a slip, Flex tiers) and is not expected to change the sign. OWNER DECISION REQUIRED (O12): real-money play while this stands.

**Honest leg ROI formula (ready to wire, shadow first).** p = sportsbook chance of the side at the leg's exact line when >= 1 book has it (weight ~1, small shrink to the app's price), else the app-price-implied chance; model weight 0.04. Leg ROI = p x REAL price - 1 (PrizePicks: real quote; never the modelled price). Almost every leg comes out negative; that is the measured truth, not a bug.

## 8e. AFTER D7 (owner keeps playing as now): dry-run of the fix, off-market lines (2026-11-19 12:28-12:36 PT)

**S7a - dry-run of the one-block tier fix in the PRODUCTION day builder** (`research_tier_fix_dryrun.py`, run td 44609042134, slate 2026-11-18, 12 games, 301 players): run time +3 to +4 s per prop pair (21 -> 25 s, 31 -> 35 s) - no pipeline cost. Anchor, role tier and variance band identical on 100% of rungs. Probabilities move: median 1.7 pts, 90% 4.5-5.9, 99% 7.6-11.9, max 9.9 (points / rebounds) and 16.4 (steals); mean signed move -0.1. About 2% of rungs exist in only one version.
- What the fix changes in production: NOT a leak (today's rows already use the latest game) but a train / serve skew - past training rows carry month-end tiers.
- DECISION C10: the fix is NOT switched on in production now. Reasons: owner D7 (keep playing as now) and D4 (leave production alone); a 1.7-pt median move re-ranks legs under strategies and calibration tables (`ladder_calibration`, tier maps) that were fitted on the old numbers; and measured skill is ~0 either way this season (honest replay -0.7 pts / +0.8 log-loss, live production -2.9 / +0.2). It goes live together with the rest of the honest chain, in one step, after a dry-run of the whole chain. The honest history lives in `baseline_history_h`. WARNING kept: `nba-baseline-history.yml` / `nba-combos-history.yml` still build LEAKY history - never use their output for a backtest.

**S5d - off-market lines** (`research_book_offline_edge.py`, run oe 44609280241): the sportsbook chance carried to the app's line when the books post a different line (between two book rungs: straight line in log-odds; one side only: the stat's own slope).
- The book is calibrated almost perfectly on Underdog at every band, all three seasons (e.g. book 0.563 -> real 0.568 / 0.573 / 0.571; book 0.597 -> 0.610 / 0.600 / 0.609). So the honest Underdog leg ROI is simply book chance x real multiplier - 1.
- PrizePicks regular lines, book chance >= 0.54: 6.5 / 11.5 / 20.2 legs a slate, hit 0.534 / 0.544 / 0.523, return -1.4% / +0.4% / -3.5% (none different from zero). Off-market only: +2.3% / +2.0% / -7.7%. Book >= 0.56: hit 0.489 / 0.575 / 0.494. No edge.
- Underdog, book-implied return > 0: 2024-25 31.5 legs a slate, real +7.0% [+5.0 .. +9.1]; 2025-26 7.8 a slate, +0.9% [-3.5 .. +5.3]; 2026-27 45 a slate "predicted +24%" real -14.6% - this season's picks are dominated by one-book, off-line B-tier numbers that are wrong (>= 2 books: 6.9 a slate, -2.5%). The 2024-25 edge was real and has been priced out.
- This season's sportsbook feed is thin (1.1-1.7 books a rung, 36-48% of legs covered against 70-93% before). RULE (C11): a book number counts only with >= 2 books or an exact-line match; never extrapolated from one book.

## 8f. STRUCTURE TEST, THE DAILY REFEREE, AND ONE LEAD (2026-11-19 12:36-12:44 PT)

**S6a - correlated stacks of PrizePicks regular lines** (`research_pp_stack_structure.py`, run ss 44609896286; results only, 351,637 legs, 354 slates, 2,655 games; real Power / Flex tables).
P(all hit) against the product of single rates ("lift"): same game all Under 1.00x (2-3 picks) to 0.95x (6); same team all Over 0.97x (3) down to 0.65x (6) - teammates' Overs fight each other; one team Over + other team Under 0.95-1.00x. No stack type is lifted above independence.
Random-leg slip return: all-Under slips 3-pick Power -20%, 4-pick Flex -19%, 5-pick Flex -19%, 6-pick Flex -26%, 2-pick Power -21%, 6-pick Power -35%; all-Over slips -28% to -50%. So a slip loses roughly (per-leg loss x picks). Least bad structures for legs near 0.51-0.54: 3-pick Power and 4 / 5-pick Flex; worst: 6-pick Power, anything with Overs or demons. Structure cannot create an edge.

**The daily referee is LIVE** (`audit_honest_referee.py`, workflow `nba-honest-referee.yml`, 04:37 PT daily, table `nba_score.honest_referee`; first run hr2 44610848811). Per app, season to date and last 7 slates, at REAL prices: every board leg by kind; legs the PRODUCTION number rates positive (predicted vs real); the production number's top tenth of regular legs; legs the sportsbook rates positive; unique legs actually played and the slips' units; a verdict line (EDGE only when the 90% range is above zero with >= 300 legs). First scoreboard (29 slates):
| app | legs the system rates positive | predicted | real | top tenth of regular legs: says -> hits | played: slips, units, unique legs, hit |
|---|---|---|---|---|---|
| PrizePicks | 174 a slate | +7.0% | -6.2% [-9.5 .. -2.1] | 0.602 -> 0.505 | 116, +42.4u, 235, 0.536 +-0.033 |
| Underdog | 355 a slate | +13.9% | -8.2% [-12.1 .. -5.1] | 0.595 -> 0.565 (return +5.8%) | not read yet (hit field holds "dnp" text - fix queued) |
| Sleeper | 202 a slate | +8.5% | -11.7% [-14.6 .. -9.4] | 0.746 -> 0.752 (return -11.6%) | 75, +14.2u, 274, 0.540 +-0.030 |
| Fliff | 272 a slate | +8.6% | -7.3% [-9.3 .. -5.2] | 0.618 -> 0.575 (return -4.4%) | 73, +26.1u, 202, 0.569 +-0.035 |
| Betr | - | - | - | - | 34, -12.5u, 118, 0.542 +-0.046 |
The board's leg ROI overstates by 13-22 points on every app (this is the number shown today).

**ONE LEAD - Underdog regular (1.0x) Unders, early season.** The production number ranks Underdog regular legs this season (honest, live): Under fifths by final_hp hit 0.499 / 0.532 / 0.581 (895 legs, break-even 0.5345, about +8.7%, 2.8 standard errors); Overs 0.420 / 0.471 / 0.504 (all losers). Same lines as PrizePicks: 0.500 / 0.534 / 0.570. Honest baseline on three seasons, top tenth of Underdog regular Unders: Oct-Nov 0.529 / 0.557 / 0.594 (1,105 / 1,301 / 446 legs), Dec-Jan 0.533 / 0.531, Feb onward 0.510 / 0.501. Pooled Oct-Nov 0.552 (2,852 legs, +-0.009) = about +3.3% a leg, 1.9 standard errors over break-even, and it fades after January. PrizePicks regular Unders top tenth: 0.52-0.53, under its 0.542. STATUS: lead, not proof (one of many cells looked at; this season carries most of it). The referee now tracks it daily. NOT a line-difference effect (Underdog line against PrizePicks line: no pattern).

## 8g. THE UNDERDOG REGULAR-UNDER LEAD AS SLIPS (2026-11-19 12:48 PT; `research_ud_under_slips.py`, run un 44612024565; referee run hr3 44611612037)

Referee line added: "regular Unders, system top fifth" per app. First reading, season to date: Underdog 897 legs hit 0.580, predicted +9.6%, real +8.5% [+3.0 .. +14.1] (last 7 slates: 132 legs, -9.3% [-25 .. +11.5]); PrizePicks 2,884 legs hit 0.508, real -6.2%; Sleeper -7.6%; Fliff -4.8%. Underdog is the only app where the number ranks. Underdog played legs now read: live 60 slips +21.7u, 149 unique legs 0.557 (+-0.041); shadow 183 slips +24.2u, 199 legs 0.558 (+-0.035); paper 32 slips -17.0u.

Slips from the lead, Underdog real tables (Power 2: 3.5x ... 6: 35x; Flex 3: 3.25 / 1.09, 4: 7.2 / 1.4, 5: 10 / 2.5, 6: 25 / 2.6 / 0.25; per-leg break-even 2-pick Power 0.5345, 4-pick Flex 0.5370, 6-pick Flex 0.5382, 5-pick Flex 0.5475, 3-pick Flex 0.5539). Pool = regular Under legs, one per player, ranked by the HONEST baseline (three seasons); no leg reused in a slate; at most 2 legs of a game in a slip.
| pool leg hit | 2024-25 | 2025-26 | 2026-27 |
|---|---|---|---|
| top 6 a slate | 0.519 (Oct-Nov 0.566, Dec-Jan 0.511, Feb+ 0.497) | 0.565 (0.604 / 0.562 / 0.541) | 0.580 |
| top 10 | 0.527 | 0.559 | 0.588 |
| top 20 | 0.521 | 0.536 | 0.545 |
| top 30 | 0.528 | 0.533 | 0.541 |
Top 6 legs, 3 slips a slate:
| structure | 2024-25 (465 slips) | 2025-26 (468) | 2026-27 (87) |
|---|---|---|---|
| 2-pick Power | -6.7% [-17 .. +5], -31.0u, drawdown 54.5, drought 4 | +9.2% [-2 .. +22], +43.0u, dd 30.0, drought 3 | +28.7% [-3 .. +57], +25.0u, dd 11.5, drought 3 |
Top 12 legs, 3 slips a slate: 3-pick Flex -10.5% / +2.1% / +8.6%; 4-pick Flex -11.2% / +9.0% / +6.5%; 3-pick Power -8.2% / +14.6% / +19.5% (not allowed by the owner's Underdog rule); 4-pick Power -18.3% / +13.8% / -10.0%. Top 20, 3 a slate: 5-pick Flex -6.9% / -18.9% / -3.8%; 6-pick Flex +0.3% / -4.7% / +2.4%; 5-pick Power -5.2% / -33.3% / -23.1%; 6-pick Power -7.5% / -18.8% / -10.3%.
One slip a slate from the top 2 legs (2-pick Power): +1.6% / +36.9% [+12 .. +59] / +69.0% [+21 .. +129] (155 / 156 / 29 slips).
Ranked by production final_hp instead (this season only, 29 slates): top 6 legs 0.626, top 10 0.585; 3 slips of 2-pick Power +32.8% [+4.6 .. +60.9], +28.5u, drawdown 10.5.
READING: positive in two of three seasons, negative in 2024-25 (its model had one training season); three seasons pooled, 3 x 2-pick Power: +3.6% on 1,020 slips - not different from zero. The edge sits in the very top of the list (6-10 legs a slate) and in 2-pick Power / 4-pick Flex; it dies with pool size and with 5-6 picks. NOT proven; tracked daily by the referee. No change to live Underdog strategies (D7).

**Open (O13) - the number on the board.** The leg ROI shown today overstates by 13-22 points on every app (referee table, 8f). The honest formula is ready (8d). Showing it is a change to the slip screen and may move ROI-aware strategies, so it is NOT switched: next step is a shadow column written at P3 next to the current number, compared daily by the referee; the switch is the owner's call once he has seen both side by side.

## 8h. HONEST CELL SCAN OF REGULAR LEGS - 43,016 cells, nothing beyond chance (2026-11-19 13:13 PT)

Owner 12:52 PT: "no stop, keep working". `research_cell_scan_honest.py` (runs cs2_ud 44615367861, cs2_pp 44615381505). Every pre-game describable cell of REGULAR legs on three seasons, honest inputs only: 26 features (prop, line size, phase, weekday; honest model: rank in the slate, chance, lean against the line, role, variance band, projected minutes; market: sportsbook chance at the exact line, number of books, the other app's line; form from the game log before the game: season average and last 5 against the line, hot / cold, games played, minutes trend, rest days, home / away; injury report AT PICK TIME (latest snapshot not later than 12:20 PST): the player's own listing, teammates' minutes listed out, the FRESH part (absent player played the previous game), questionable minutes, opponent minutes out and fresh). Single buckets and every pair of buckets, by side. A cell is kept only if EACH season beats break-even with enough legs (150 / 150 / 60) and the pooled lower 90% bound beats break-even. Yardstick: the same scan with results shuffled inside each slate.
| app | legs | cells | kept on real results | kept on 5 shuffles |
|---|---|---|---|---|
| Underdog regular (break-even 0.5345) | 203,387 | 21,508 | 5 | 2, 1, 1, 1, 5 |
| PrizePicks regular (break-even 0.542) | 351,637 | 21,508 | 0 | 1, 2, 0, 0, 0 |
The 5 Underdog cells are what luck alone produces. VERDICT: no describable cell of regular legs has a repeatable edge on either app.
What the single-feature tables show (three seasons): every bucket sits at 0.49-0.54. Injury context is already in the lines - teammates' Overs when 40+ fresh minutes are out: 0.479 / 0.468 / 0.394 (Underdog), 0.478 / 0.468 / 0.433 (PrizePicks); the player's own "Questionable" tag: Under 0.506 / 0.528 / 0.586, not above break-even in history. The other app's line: no usable pattern. The model's top 5% of a slate, Unders: Underdog 0.517 / 0.542 / 0.618, PrizePicks 0.500 / 0.530 / 0.545 - rising by season but not past break-even in all three (it is the 8g lead; it stays a lead). The only buckets at 0.57+ in history are the sportsbook's: Underdog regular Under where a book puts the side at 0.54-0.56: 0.577 / 0.579 (about 220 legs a season, 1.4 a slate).
External reading for this batch (what winning players describe): edges on pick'em apps are a few points wide, come from sharp-book lines the app has not matched, and mostly live in the minutes after news before the app reprices; apps cap stakes per market (~$250-500) - https://www.stokastic.com/articles/dfs-strategy/how-to-find-value-on-prizepicks , https://www.4for4.com/2023/preseason/how-win-money-playing-pick-em-sites . Our boards are pulled once (P3) after the injury report, when the apps have already repriced - consistent with every finding above.

## 8i. WHAT A LEG HIT RATE IS WORTH BY APP AND STRUCTURE (exact arithmetic on the real tables, regular legs, independent legs; 13:34 PT)

| app | structure | break-even per leg | slip return at leg hit 0.50 | 0.52 | 0.54 | 0.56 | 0.58 |
|---|---|---|---|---|---|---|---|
| PrizePicks | 2-pick Power | 0.5774 | -25.0% | -18.9% | -12.5% | -5.9% | +0.9% |
| PrizePicks | 3-pick Power | 0.5503 | -25.0% | -15.6% | -5.5% | +5.4% | +17.1% |
| PrizePicks | 4-pick Power | 0.5623 | -37.5% | -26.9% | -15.0% | -1.7% | +13.2% |
| PrizePicks | 5-pick Power | 0.5493 | -37.5% | -24.0% | -8.2% | +10.1% | +31.3% |
| PrizePicks | 6-pick Power | 0.5466 | -41.4% | -25.9% | -7.0% | +15.7% | +42.8% |
| PrizePicks | 3-pick Flex | 0.5774 | -25.0% | -18.9% | -12.5% | -5.9% | +0.9% |
| PrizePicks | 4-pick Flex | 0.5503 | -25.0% | -15.6% | -5.5% | +5.4% | +17.1% |
| PrizePicks | 5-pick Flex | 0.5425 | -25.0% | -13.9% | -1.6% | +11.9% | +26.9% |
| PrizePicks | 6-pick Flex | 0.5421 | -32.8% | -18.6% | -1.9% | +17.6% | +40.2% |
| Underdog | 2-pick Power | 0.5345 | -12.5% | -5.4% | +2.1% | +9.8% | +17.7% |
| Underdog | 3-pick Power | 0.5358 | -18.8% | -8.6% | +2.4% | +14.2% | +26.8% |
| Underdog | 4-pick Power | 0.5373 | -25.0% | -12.3% | +2.0% | +18.0% | +35.8% |
| Underdog | 5-pick Power | 0.5493 | -37.5% | -24.0% | -8.2% | +10.1% | +31.3% |
| Underdog | 6-pick Power | 0.5529 | -45.3% | -30.8% | -13.2% | +7.9% | +33.2% |
| Underdog | 3-pick Flex | 0.5539 | -18.5% | -11.9% | -5.0% | +2.2% | +9.6% |
| Underdog | 4-pick Flex | 0.5370 | -20.0% | -9.6% | +1.8% | +14.1% | +27.4% |
| Underdog | 5-pick Flex | 0.5475 | -29.7% | -18.1% | -5.2% | +9.2% | +25.0% |
| Underdog | 6-pick Flex | 0.5382 | -30.7% | -15.8% | +1.7% | +22.0% | +45.7% |

Reading with the measured leg rates: all regular Unders hit 0.51-0.53 on every app; legs actually played this season hit PrizePicks 0.536 (+-0.033), Underdog 0.557 (+-0.041), Sleeper 0.540, Fliff 0.569, Betr 0.542.
- The app decides more than the leg: at a 0.54 leg, PrizePicks loses in EVERY structure (-1.6% to -15%), Underdog is about level or slightly ahead in 2 / 3 / 4-pick Power and 4 / 6-pick Flex (+1.7% to +2.4%).
- On PrizePicks the least bad are 5-pick Flex and 6-pick Flex (break-even 0.5425 / 0.5421); 2-pick Power and 3-pick Flex are the worst (0.5774).
- On Underdog 2-pick Power is the cheapest (0.5345), then 3-pick Power, 4-pick Flex, 4-pick Power, 6-pick Flex; 3-pick Flex (0.5539), 5-pick Power and 6-pick Power are the expensive ones. (Owner rule: no Underdog Power above 2 picks - kept; the table is information.)
- Betr boards carry Underdog's lines (event ids "live-underdog-..."), priced on Betr's own table: no separate honest history; its verdict follows Underdog's regular legs and the referee's played line.

## 8j. RETRACTED (13:57 PT) - "Underdog Unders half a point below the market" was MY OWN ARTIFACT. Read this box first.

**What went wrong.** The reference "PrizePicks regular line" was taken from `nba_score._lr_legs_h`. That table holds GRADED legs and drops ties (stat == line). PrizePicks posts whole-number regular lines on rebounds and assists 40-50% of the time. Joining to it therefore kept only the games where the stat did NOT land on PrizePicks' line - a filter on the outcome. Every "half a point below" leg was an Underdog x.5 line under a PrizePicks whole number (3.5 under 4, 5.5 under 6 ...), so the measured hit rate was P(under | no tie), not P(under).
**Proof.** Same legs, reference taken from the unfiltered board (`nba_market.pp_leg_price`, window, regular): rebounds + assists, paid above 1.0x: 2,204 / 2,863 / 492 legs, hit 0.460 / 0.447 / 0.431, return **-5.3% / -11.6% / -13.0%**. With the filtered reference the same cell read +9.8% / +4.5% / +0.6%. The tie-free PrizePicks Under and the Underdog Under had the IDENTICAL hit rate on the joined rows (0.548 / 0.527 / 0.479), which is what exposed it.
**Caught before anything was reported to the owner or changed.** Referee line removed; `research_ud_halfpoint_under.py` marked retracted; the cell scan now reads the other app's line from the unfiltered boards.
**RULE C12:** a reference line, price or feature may never come from a table that was filtered or graded on the result. (`_lr_legs_h` and `_lr_app_legs` are outcome tables: use them for the leg being judged, never as a lookup for another leg.)
**What still stands from this batch:** the alternates scan has NO valid kept cell (28 of its 31 were this artifact; the other 3 are single odd cells); PrizePicks line-move scan: nothing; O14 below. The 8g lead (Underdog regular Unders ranked by the system) does not use this join.

### (original text, kept for the record - DO NOT USE) Underdog Unders half a point below the market (2026-11-19 13:54 PT)

Runs: cs3_alt 44620444723 (`research_cell_scan_honest.py CS_KIND=alt`, Underdog alternates at REAL multipliers, 268,265 legs, 30,158 cells), cs3_pp 44620459760 (PrizePicks with line move since morning: 0 cells kept, 0-1 on shuffles; morning boards exist on 30 dates only), hu 44622145818 (`research_ud_halfpoint_under.py`).
- Alternates scan kept 31 cells; 28 of them are slices of ONE family: an **Under on an Underdog line that sits half a point BELOW PrizePicks' regular line for the same player / prop / day, paid above 1.0x** (tier B1; in practice Underdog's main line shaded half a point down with the Under paying ~1.07x). No model involved. (The shuffle yardstick of that run is not valid for priced legs - noted; the evidence is below.)
- Per leg, real multipliers: all such legs 9,771 on 338 slates (28 a slate): **+3.5% [+0.8 .. +6.4] / +2.5% [-0.3 .. +5.3] / +6.5% [-0.2 .. +13.8]** by season, pooled +3.0% [+1.2 .. +4.6]; by phase +2.6% / +3.2% / +3.8% (not an early-season effect). Dose-response with the price: paid 1.01-1.04x +0.7%, 1.05-1.08x +1.3%, 1.09-1.12x +10.0% [+5.6 .. +14.4] (+11.0 / +7.8 / +3.8 by season), 1.13-1.20x +9.7%. By prop: assists +9.4% (+16.8 / +3.6 / +5.3), rebounds +6.4% (+10.3 / +4.5 / +1.8), reb_ast +0.3%, points -1.7%, pra -1.5%, pts_ast -8.0%. Line 3-5.5: +8.0% (+14.4 / +4.3 / +2.8).
- It is specific: the same Under ONE full point below PrizePicks loses (-12.5%); at the same line paying 1.0-1.08x it is flat (+0.7%); B1 Unders as a whole lose (-5.9 / -8.1 / -9.3%). Overs: nothing.
- Checks: board snapshots of both apps carry the same timestamp, 22:40 UTC, before the first tip, in both history seasons (5 dates sampled, 0 rows after tip) - not an in-play artifact. 2024-25 multipliers are derived from the feed price, 2025-26 and 2026-27 are Underdog's own stored multipliers; the effect holds in the real-multiplier seasons (+2.5%, +6.5%). Luck check: about 500 single cells were looked at and this one is ~2.9 standard errors - on its own borderline; what lifts it is the dose-response, the three-season sign, the mechanism, and the fact that the deployed Underdog "T1 weighted:rebounds_B1_U" strategy came from model-free cell research on the same family and is positive live (Underdog live 60 slips +21.7u).
- As slips (pool = the family's legs of the slate, one per player, max 2 of a game, highest multiplier first; real tables and leg factors; three seasons, ALL = pooled):
| slips a slate | structure | 2024-25 | 2025-26 | 2026-27 | ALL |
|---|---|---|---|---|---|
| 1 | 2-pick Standard | +13.9% | +10.1% | +16.4% | 337 slips +12.4% [-6 .. +29], +41.8u, dd 24.1, drought 13 |
| 3 | 2-pick Standard | +19.4% [+5 .. +36] | +20.9% [+5 .. +38] | +29.3% [-10 .. +62] | 999 slips **+20.9% [+10 .. +32]**, +209.2u, dd 21.1, drought 5 |
| 5 | 2-pick Standard | +28.0% | +6.4% | +29.2% | 1,599 slips +18.1% [+11 .. +26], +288.7u, dd 44.3, drought 3 |
| 3 | 3-pick Standard | +52.9% | +41.5% | +88.2% | 951 slips +50.4% [+33 .. +68], +479.1u, dd 30.0, drought 10 |
| 3 | 4-pick Standard | +46.1% | +2.5% | +105.9% | 895 slips +28.8% [+5 .. +56], dd 64.2, drought 18 |
| 3 | 5-pick Standard | +43.2% | -21.2% | +129.2% | 814 slips +17.1% [-13 .. +51], dd 105.4, drought 26 |
| 3 | 6-pick Standard | +15.9% | +5.5% | +67.5% | 740 slips +13.5% [-34 .. +62], dd 169.1, drought 43 |
| 3 | 3-pick Flex | +28.4% | +15.6% | +33.8% | 951 slips +22.8% [+16 .. +31], +217.1u, dd 10.7, drought 2 |
| 3 | 4-pick Flex | +42.5% | +11.9% | +82.5% | 895 slips +30.3% [+17 .. +46], dd 29.8, drought 3 |
| 3 | 5-pick Flex | +39.8% | -0.2% | +98.3% | 814 slips +23.9% [+6 .. +44], dd 33.7, drought 6 |
| 3 | 6-pick Flex | +37.3% | +23.7% | +106.8% | 740 slips +34.2% [+3 .. +62], dd 47.2, drought 9 |
  Only legs paid 1.08x and more, 3 a slate, 2-pick Standard: 607 slips +26.1% [+12 .. +40] (+17.7 / +39.3 / +62.6), dd 24.1, drought 6.
  Playability: these legs are often Underdog "prediction" lines (today's slip screen marks one "PREDICTION - NO FLEX"), and the owner's rule is no Underdog Standard above 2 picks -> the playable form today is **2-pick Standard, 3 a slate**. The larger sizes are information for his decision.
- STATUS: lead with three-season support, NOT yet a certified strategy. Next: referee line added (this section's cell, daily); then walk-forward confirmation with the selection rule frozen today (the next slates are the test), a check of how many of these legs are prediction-market lines per slate, overlap with the live T1 portfolio, and exposure rules. Nothing live changes.

**O14 (new, from placing today's slips with the owner 13:41-13:52 PT):** Underdog paid 3.27x on the 2-pick Standard Cam Spencer 3.5 Reb Under (0.8x) + Donovan Clingan 1.5 Blk Under (1.12x); our table gives 3.5 x 0.8 x 1.12 = 3.13x. The 3-pick Flex of regular legs matched (3.25 / 1.09). The Underdog grader may under-pay mixed-factor 2-picks by ~4% - probe with `ud_payout_quotes` before the 8j slips are priced for real. Fliff: 5 slips placed at $10; one leg price had moved (Wells 0.5 Steals More 1.70x -> 1.60x, slip 6.42x -> 6.04x).

## 8k. CELL SCANS RE-RUN CLEAN (after C12) AND THE UNDERDOG PAYOUT PROBE (14:06 PT)

Runs cs4_alt 44624022627, cs4_ud 44624035898, cs4_pp 44624049968 (other-app line from the unfiltered boards; priced legs shuffled only among legs of the same price), hr4 44624062009, udq 44624138440.
| scan | legs | cells | kept on real results | kept on 5 shuffles |
|---|---|---|---|---|
| Underdog alternates (real multipliers) | 268,265 | 30,158 | 2 | 0, 0, 0, 1, 0 |
| Underdog regular | 203,387 | 21,508 | 6 | 0, 0, 0, 0, 0 |
| PrizePicks regular (+ line move since morning) | 351,637 | 23,308 | 0 | 0, 0, 0, 0, 0 |
- Underdog alternates: the two cells are small and unrelated (B1 Under where a book has the side at 0.50-0.52: 1,718 legs +6.7%; "Questionable" + minutes up: 803 legs). Other-app line on alternates, clean: every bucket loses (-1% to -19%). No lead.
- Underdog regular, the 6 kept cells (2-11 legs a slate, +2.6% to +10.7%): Under with Underdog's line 1+ ABOVE PrizePicks' and no teammate out (578 legs, +12.0 / +8.3 / +16.5); the system's top 5% Unders with no opponent out (1,281 legs, +6.5 / +3.8 / +13.9 = the 8g family); Under where the book has it 0.52-0.54 on one day of rest (4,765 legs, +1.3 / +4.1 / +15.3); three odd ones. Single features, clean: Under with Underdog's regular line 1+ above PrizePicks' regular line hits 0.519 / 0.555 / 0.586 (668 / 1,218 / 152 legs; pooled 0.545, break-even 0.5345) - plain line shopping, about +2% a leg, 6 legs a slate at most. CORRECTION to 8f: "same lines as PrizePicks 0.500 / 0.534 / 0.570" used the filtered join; ignore that sentence.
- Standing leads after all scans: (1) 8g - Underdog regular Unders at the very top of the system's list; (2) Underdog regular Unders whose line is 1+ above PrizePicks'. Both small (about 6 legs a slate), both around +2% to +8% a leg, neither proven. The referee now carries both ("regular Unders, system top 6 a slate"; "regular Unders, line 1+ above PrizePicks").
- **O14 answered (probe udq, 40 entries, no login):** an Underdog entry that contains a PREDICTION-market pick is not priced by our table: 3-pick Standard quotes are 0.936x to 1.048x of ours, median 1.030x, 0 of 14 within 0.5%; 2-pick entries with a prediction pick cannot be quoted without login. Today's real 2-pick paid 3.27x against our 3.13x (+4.5%). So graded Underdog slips that hold prediction picks are under-stated by about 3% on average; the per-leg return of B-tier / prediction legs in sections 8d-8k is under-stated by roughly the same. It does not rescue any cell (the gaps are 5-15%). To price them exactly the probe needs the logged-in quote (RX_AUTH) - owner's session; queued, not run.

## 8l. ADDING THE WEAK SIGNALS UP, AND THE TOP-OF-LIST UNDERS ON EVERY APP (14:16 PT)

Runs um 44625721011 (`research_ud_regular_meta.py`), hr6 44626379616 (referee), un_pp 44626707113 / un_ud2 44626721831 (`research_ud_under_slips.py`, now with a PrizePicks mode).
- **Combiner (walk-forward ridge logistic on all 26 features, fitted on earlier seasons only, with a shuffled-training placebo):** does NOT work. Top 6 a slate: 0.516 (2025-26), 0.500 (2026-27); slope of real on predicted 0.44 / 0.29. The placebo on this season's 29 slates scored 0.655 on its top 2 (58 legs) - a reminder of how loud 29 slates are. The honest model ALONE on Unders beats the combiner: top 2 a slate 0.587 [0.535 .. 0.632] (2025-26), top 6 0.565 [0.537 .. 0.591].
- **Top of the honest model's Under list, legs a slate (hit rate; Underdog break-even 0.5345, PrizePicks 0.542-0.577):**
| | 2024-25 | 2025-26 | 2026-27 |
|---|---|---|---|
| Underdog top 2 / 6 / 10 / 20 / 40 | 0.494 / 0.520 / 0.526 / 0.521 / 0.528 | 0.587 / 0.565 / 0.560 / 0.536 / 0.532 | 0.621 / 0.580 / 0.588 / 0.543 / 0.527 |
| PrizePicks top 2 / 6 / 10 / 20 / 40 | 0.497 / 0.503 / 0.516 / 0.518 / 0.518 | 0.550 / 0.548 / 0.553 / 0.541 / 0.535 | 0.552 / 0.580 / 0.569 / 0.560 / 0.541 |
  Same picture on both apps: nothing in the first season, 0.55-0.59 at the top in the next two, fading with list length.
- **This season, production number (referee, 29 slates), regular Unders:** top 6 a slate - PrizePicks 0.552 (+1.8% [-9 .. +14]), Underdog 0.621 (+16.1% [+5 .. +28]), Sleeper 0.730 at its prices (+8.9% [+0 .. +18]), Fliff 0.724 (+11.6% [+2 .. +21]); top 10 - +1.8% / +9.4% / +0.9% / +3.6%; top fifth - -6.2% / +8.5% / -7.6% / -4.8%. The value is in the first handful of legs; the live strategies draw from pools of 10-30.
- **As slips (honest model, three seasons):**
  Underdog, 1 slip a slate, 2-pick Standard from the top 2: +1.6% (155 slips, dd 17, drought 17) / +36.9% [+14 .. +61] (156, +57.5u, dd 10, drought 10) / +56.9% (29, +16.5u, dd 5.5, drought 4). 2 a slate from the top 4-6: -8.5% / +14.4% / +14.7%. 3 a slate from the top 6: -5.9% / +9.2% / +28.7%. 3-pick Flex 1 a slate: -6.5% / +9.3% / +8.7%; 4-pick Flex from the top 4: -10.9% / +26.0% / +14.6%.
  PrizePicks, top 6, 1 slip a slate: 2-pick Power -25.9% / -1.2% / +3.4%; 3-pick Power -31.2% / +31.2% / -17.2%; 4-pick Power -41.9% / +9.7% / -65.5%; 5-pick Power -85.1% / +5.3% / -100%; 6-pick Power -100% / +40.6% / -100%; 3-pick Flex -21.7% / +1.9% / -24.1%; 4-pick Flex -21.6% / +17.1% / -32.8%; 5-pick Flex -34.3% / +5.6% / -26.2%; 6-pick Flex -70.4% / +33.7% / -46.1%. With the production number this season (29 slips): 2-pick Power +24.1%, 3-pick Power +44.8%, 4-pick Flex +24.1%, 5-pick Flex -10.8%, 6-pick Flex -44.0%. Not consistent - PrizePicks' break-even is too high for a 0.55 leg.
- READING: one honest pattern survives everything - a few regular Unders at the very top of the system's list, best expressed on Underdog (lowest break-even) as a single 2-pick. Two seasons of three; this season agrees on every app. Still a lead: the referee decides, daily.

## 8m. WHO THE TOP-OF-LIST UNDERS ARE, AND WHERE THE PLAYED LEGS SIT IN THE LIST (14:24 PT)

Runs tp_ud 44627236092, tp_pp 44627249296 (`research_top_under_profile.py`), pr 44628030675 (`research_played_legs_rank.py`). Checked first: the honest baseline uses only the player's own past games (no teammate-absence or final-injury input), so the top of its list is not fed by late information.
- **Profile (three seasons, honest model).** The top 6 Unders of a slate are legs whose line sits ~45% above the model's own anchor (all Unders: 0%). Against all Unders they are far more often: bench / fringe roles (36% vs 15%), projected under 18 minutes (9% vs 3%), minutes up 4+ over the last five (30% vs 12%), last five 25%+ hotter than the season (28% vs 14%), on a team with 80+ minutes listed out (35% vs 18%) or 40+ FRESH minutes out (9% vs 4%). In one sentence: **players whose line was pushed up by a recent role bump** - the model, anchored on history, says Under; in the last two seasons that Under hit 0.55-0.58. PrizePicks top 10 shows the same profile (bench 20% vs 11%, minutes up 4+ 26% vs 13%, 80+ out 33% vs 19%).
- By rank inside the top 6 (Underdog): 2024-25 0.503 / 0.484 / 0.529 / 0.490 / 0.574 / 0.535; 2025-26 0.571 / 0.603 / 0.545 / 0.596 / 0.545 / 0.526; 2026-27 0.552 / 0.690 / 0.552 / 0.621 / 0.621 / 0.448. No sub-slice is pursued (samples of 25-100 a season).
- **The legs actually played this season, by their rank in the system's list of regular legs (production number, one leg per player, unique legs, all statuses):**
| app | Unders rank 1-6 | Unders rank 7-20 | Unders rank 21-50 | other |
|---|---|---|---|---|
| PrizePicks | 0.565 (294 legs, +-0.029) | 0.504 (232, +-0.033) | 0.482 (56) | Overs rank 1-6 0.596 (141), alternates Over 0.409 (154) |
| Underdog | 0.637 (80, +-0.054) | 0.485 (68, +-0.061) | 0.679 (28) | alternates Under 0.493 (144) |
| Sleeper | 0.678 (59, +-0.061) | 0.500 (84, +-0.055) | 0.433 (60) | - |
| Fliff | 0.712 (52, +-0.063) | 0.508 (65, +-0.062) | 0.457 (46) | - |
  Pooled Unders: rank 1-6 0.602 (485 legs), rank 7-20 0.501 (449 legs) - the same legs often sit on two apps, so the samples overlap; the direction is the same on all four. The played record's profit comes from the first six names of the list; ranks 7-20 are a coin flip at prices that need 0.53-0.58.
- **What it suggests (OWNER DECISION, O15):** cut every live strategy's leg pool to the first 6 regular legs of the side (today: 10-30), fewer slips a slate, and prefer Underdog / 2-pick where the break-even is lowest (8i). Evidence: this season on four apps (above), two of three history seasons (8l). Against: the first history season shows nothing, 29 slates are loud (8l placebo), and fewer slips means longer droughts (Underdog 1 slip a slate: longest run without a winner 4-17 slates).

## 8n. OWNER DIRECTIVE D8 (2026-11-19 14:51-14:53 PT) AND THE MASTER PLAN - this now governs the work

**His words (three messages).** "You need to finish all your simulations, backtests, strategies, factors, layers, composition ... Only then we're going to start talking about changing the current strategy. The current strategy stays ... First of all, you need to be sure that those numbers are now right. No doubt, no question ... Once that's a yes, then you're gonna rerun everything again to create the strategies again with the past two seasons and especially the current season" (weight the current season most, last season less, the one before least). "That also includes run per leg, leg per leg, for all the back data we have. Each one of the legs, each one of the days, each one of the boards, each one of the prop lines, each one of the players, all the variations, ladders, everything. Rerun and give them the correct ROI, hit rate ... Only after that we're going to start talking about slips, and you're not going to try to fix the slips that we have. We're going to do all the battery of tests again ... back test again, everything, one by one." "Having the ROI per leg and being assertive, we have more ways to approach it ... combine legs, specific legs, top legs ... even demons and goblins ... player form ... factors, layers, trailing, rankings ... all of that's in the documentation ... first thing is be sure that the ROI and the hit rate are reliable. It's the best that you can possibly get. No doubt, nothing else to try, nothing else to test, nothing else to check. Once we have that, then we're gonna start working on strategy, slips, and everything."
**Consequences.** O15 is withdrawn (no talk of changing strategies now). The live strategies stay untouched and are NOT to be patched. Order of work is fixed:

| phase | what | done when |
|---|---|---|
| A. CERTIFY THE NUMBERS | A1 truncation invariance (delete the future, numbers must not move) on every prop, three seasons, with a leaky control. A2 grading: every leg's result re-derived from the box score and cross-checked against production's own grading. A3 timing: every board row used was captured before tip. A4 prices: every multiplier is real or flagged; derived ones validated against stored ones. A5 outcome hygiene (C12): ties, DNPs, voids counted and handled the way each app pays them; no outcome-filtered lookups. A6 combos: same truncation test. A7 parity of the honest history with what live production produced on the same days this season. | every test prints PASS, written up in section 9A |
| B. BEST POSSIBLE HIT RATE AND ROI PER LEG | the honest probability chain rebuilt end to end (baseline -> calibration fitted walk-forward -> market / book / price layers -> final), every factor and layer in the documentation re-tested one by one on honest inputs (kept only if it helps out of sample), planted-truth and placebo on the final number, honesty slope ~1 per app / kind / prop / season. ROI = final probability x REAL price. | nothing left that improves it out of sample; certified |
| C. THE PER-LEG STORE | every leg of every board of every day, three seasons, every app, every ladder rung: line, side, kind, tier, real / flagged price, honest probability, ROI, rank, the features behind it, result. New tables beside production. | complete, counted, spot-checked |
| D. THE BATTERY, FROM ZERO | strategies searched and tested again one by one on the certified store: 2-6 picks, Flex and Power, per app (never mixed), top legs / specific legs / props / tiers / goblins and demons / form / rank / trailing layers; seasons weighted current > last > the one before; walk-forward; highest steady ROI, then low drawdown and droughts. | reported to the owner; only then is changing the live strategies discussed |

## 8o. PHASE A - CERTIFYING THE NUMBERS (started 14:54 PT, 2026-11-19; status at 15:37 PT)

**The test that matters (A1): truncation invariance.** `audit_truncation_invariance.py` deletes everything after a cut date from every input the recipe reads, rebuilds, and compares with the full-season build for every game on or before the cut. An honest number cannot move. It needs no knowledge of where a leak is. Positive control: the unfixed recipe must move.

| Step | Result |
|---|---|
| First pass (runs tv_*, recipe = tier fix only) | **FAIL on every pair**: identical 60-99.99% of rungs, 0-10.7% moving > 0.1 pt, up to 1.2% > 1 pt, largest move 35 pts (threes). Control (unfixed) moved 28-42% > 1 pt in the cut month - the test sees leaks. |
| Diagnosis (local dump of every intermediate column, full vs cut, 2026-27 points/rebounds) | `rate36`, tier, `tier_prior`, `mu_role` identical (the tier fix holds). `proj_mean` / `proj_var` differed on 100% of rows by tiny amounts, anchors on 0.04-0.10%. Cause: **two league constants taken over ALL rows, the test season's future included** - `LG` (league mean of pace, defence, eFG... harness line 341) and `_LG_IMPL` (median implied team total, line 355). They shift the factor features of rows whose team profile is missing, which shifts the fitted factor weights, which nudges every projection; a nudge across a band edge or a .5 anchor makes a large move on a few rows. |
| Fix (honest recipe only; production files untouched, C10/D7) | `research_tier_prior_leak.py`: `LG_OLD/LG_NEW`, `IMPL_OLD/IMPL_NEW` (both constants from TRAIN seasons only) and `honest(src)` = tier fix + the two constants, with an assert on every anchor. Used by the truncation audit and by `research_honest_history_build.py`. |
| Local re-diff after the fix | every numeric column of `pg` and of the per-prop frame identical; remaining differences are labels only (`_team_run` partition proven 1:1; name / role columns missing on both sides). |
| Second pass (runs tw_*, 44635322944 .. 44635466132): 4 prop pairs x 3 seasons, 2-3 cut dates each | **PASS 12 of 12 - 100.00% of rungs identical, largest move 0.00 pts, lines and anchors identical.** Control (unfixed recipe, points/rebounds, 3 seasons): movement seen. |
| Combos (pra, pts_reb, pts_ast, reb_ast, stocks, fantasy_score, double_double; runs tw_*_co) | 2024-25 PASS (3.25M rungs, largest move 0.01 pt = last-digit rounding), 2026-27 PASS; 2025-26 running. |

Rest of the stream (Platt stage, empirical cells, zero-adjust, phase ratio, minutes multipliers, blowout tables) read line by line: all fitted on TRAIN seasons or on months strictly before the scored month. The history builder applies no injury report (only the live ladder does), so no same-day information enters the history number. Caveat kept on record: the market spread / total in the history files is the pre-game line as stored, live uses the line at build time.

**Inputs (`audit_honest_inputs.py`, run ai 44633095435):** A2 grading PASS (5,106,997 legs re-graded from box scores 100%; 910,513 PrizePicks legs equal production's own grading 100%). A5, A6 PASS. A4 prices: history seasons carry derived multipliers flagged `derived`, this season real. A3 timing: ONE day (2026-11-15, an 18:00 UTC game) had window boards captured ~2h25m after that game tipped -> in-play guard `drop_late` added to `research_legs_h_build.py` (run lh5 44634166340: 60 app-player-days, 240 legs removed from the honest tables; history seasons 0).

**Consequence:** `nba_score.baseline_history_h` built at 11:00 PT carried the residual constants leak (small: > 1 pt on at most 1.2% of rungs). It is being rebuilt with the certified recipe (runs hh2_* singles, hc2_* combos); then the leg table, the input audit, the referee and the parity check are re-run on it. Sections 8a-8m used the earlier build; the verdict (no proven edge) is re-checked on the certified build before phase B.

Note for the eventual production fix (S7): live builds only see data up to today, so the two constants are not a look-ahead LIVE; they are a history-vs-live mismatch. The fix to carry over stays the tier block (C10) plus these two constants for parity.

## 8p. PHASE A CLOSED, PHASE B FIRST RESULTS (2026-11-19 17:16 PT)

**Phase A - certified.**
| Test | Result |
|---|---|
| A1 truncation invariance, singles (4 pairs x 3 seasons) | PASS 12 / 12, 100.00% identical; leaky control moves |
| A1 truncation invariance, combos (3 seasons) | PASS 3 / 3 (2025-26 finished after 8o was written) |
| Honest history `baseline_history_h` | REBUILT on the certified recipe (runs hh2_*, hc2_*) |
| Input audit `audit_honest_inputs.py` on the rebuilt tables (run ai3 44650021619) | **7 of 7 PASS**: grading 5,076,317 legs 100%; equal to production grading 894,085 legs 100%; no leg from an in-play board; multipliers; no duplicates; every leg has a box score; Over + Under hit rates sum to 1.0000; probability attached at the exact line 200,000 / 200,000 |

Corrections made on the way (each one was a wrong statement or a wrong number of mine):
- **In-play boards exist in the OLDER seasons too** (8o said "history seasons 0" - wrong; that check started in 2026-10). 2,078 app-player-days, mostly weekend afternoon games captured after tip. Guard now covers all seasons (`drop_late` from 2024-10-01, `LH_GUARD_ONLY=1`); 30,560 + 17,420 legs removed.
- **Impossible PrizePicks alternate prices.** The modelled history price put 5% of goblins ABOVE a regular leg (factor > 1.0; real quotes 0.535 .. 0.967) and every model "found" exactly those (+27..+47% a leg on the top 6). Prices are now bounded by the real quote range (goblin 0.535 .. 0.967, demon 1.097 .. 7.51) in `research_legs_h_build.py`. Rule C9 stands: a PrizePicks alternate counts only at a real quote.

**Phase B1 - the per-leg model (`research_leg_model_h.py`, runs lm2_*).** Walk-forward by month, season weights 1.0 / 0.6 / 0.35, gradient boosting on ~40 pick-time features that starts from the app's own price, against: price alone, sportsbook at the exact line, honest baseline alone, a 4-number blend, and a placebo. Out-of-sample legs: Underdog 386k, PrizePicks 970k, Sleeper 1.67M, Fliff 1.63M.

What the numbers say (REAL return of the legs each number calls profitable; 90% range re-drawing slates):
| App / kind | 2024-25 | 2025-26 | 2026-27 | Reading |
|---|---|---|---|---|
| Underdog regular, gbm says > +5% | -7.4% (5,975) | +4.6% [+1.5..+7.5] (2,787) | +0.7% [-10.8..+11.8] (223) | one season only - not proven |
| Underdog regular, top 6 a slate by gbm | +0.8% | +7.1% [+1.7..+12.3] | -5.4% | same |
| Underdog goblins / demons, any number | negative or one season | negative | negative (demons -16%) | no edge |
| Underdog, sportsbook says > 0 (all kinds) | +7.0% [+3.8..+10.8] (2,594) | +2.5% [-2.6..+7.9] (1,008) | -19.0% (282; book coverage fell to 37%) | fading, not proven |
| PrizePicks regular, any number | -6..-10% | -3..-9% | -9..-16% | no edge |
| PrizePicks demons, any number | -9..-14% | -9..-14% | -48% | no edge |
| PrizePicks goblins, gbm says > +5% (MODELLED price, bounded) | +7.9% (8,201) | +6.8% (27,872) | +8.4% (3,152) | **NOT counted** - see B2 |
| Sleeper, every kind, any number | -5..-20% | -1..-11% | -8..-17% (real prices) | no edge |
| Fliff, every kind, any number | -5..-13% | -2..-12% | -5..-12% (real prices) | no edge |
Model quality: the blend is honest (slope 0.93 - 1.02) and beats the price in log-loss on every app by a hair (e.g. Underdog 0.6953 -> 0.6871); the sportsbook carries most of the weight (blend weights: book 0.24 - 0.83, honest baseline 0.07 - 0.12). The gain is real and too small to clear the apps' 7 - 20% margin.
Small leads kept for the battery, not proven: blend says > 0 on this season's regular legs - Underdog +14.9% [+0.8..+27.1] (241 legs), Fliff +11.4% [+3.4..+18.3] (213 legs).

**Phase B2 - the goblin question at real quotes (`research_pp_alt_model_realquote.py`, run pq 44646833599).** 6,856 quoted alternates this season (7% of the board, the miner's broad sample). Quoted goblins: -10.6% [-15.1..-5.1] at the real price. Goblins the gbm calls profitable at the real price: 245 legs, -8.6% [-26.0..+7.5]; top 6 a slate -7.3% [-16.7..+1.8]. The honest baseline alone: 423 legs, +4.7% [-3.7..+15.4]. Demons: negative by every number. Verdict: the goblin profit at modelled prices is NOT confirmed at real prices; the sample of real quotes on model picks is too small to close it either way. What would settle it: quote the model's own top goblins every day before P3 (inside the existing quote budget) - parked until the live side is discussed (D8).

**Data gap found:** sportsbook lines at pick time are much thinner this season (window rows a day ~2,000 vs ~5,500; exact-line coverage of Underdog legs 37% vs 92-95%). The sportsbook is the strongest input of every model. Open item O16.

Runs in flight: lm3_* (same model plus trailing layers: the player's own last 10 regular legs of the prop / side, his last 10 over all props, the app's prop x side hit rate over the last 7 and 21 slates).

## 8q. PHASE B CLOSED, PHASE D FIRST PASS - THE BATTERY FROM ZERO (2026-11-19 18:18 PT)

**Phase B final model (runs lm4_*, stored in `nba_score._lr_legs_hp`: p_blend, p_gbm, p_gbm_s, p_placebo; 4.65M out-of-sample legs).**
- Trailing layers (run lm3: the player's last 10 regular legs of the prop / side, his last 10 over all props, the app's prop x side hit rate over 7 / 21 slates): the trees give them weight (9% of gain) and get WORSE out of sample (Underdog regular 2025-26, legs called > +5%: +4.6% -> +0.2%; log-loss worse on Sleeper / Fliff). Off (`LM_TRAIL=0`).
- The model starts from the app's own price (init score): without it this season's deeper Underdog demons were called +66% a leg and returned -16%.
- A small, heavily regularised version (`gbm_s`: 7 leaves, 2,000 legs a leaf) is the honest one: slope 0.94 - 1.02. Underdog regular legs it calls profitable: -2.7% [-5.3..+0.1] (5,591) / +2.8% [+0.5..+5.2] (5,634) / +5.2% [-3.9..+13.8] (265); its top 6 a slate hit 0.539 / 0.557 / 0.563 against the 0.5345 break-even.
- Reading: per leg, the best number beats the price by a hair; the only place it reaches the break-even is the very top of the list on regular lines.

**Phase D first pass (`research_battery_h.py`, runs bt3_*).** A strategy = rank key (9 + placebo + random controls) x kind x side x props x form x minimum predicted return x 2-6 picks x structure x 1 / 2 / 3 / 5 slips a slate; one pick a player and a game; real tables. Score = season-weighted LOW END of the ROI (1.0 / 0.6 / 0.35). Two yardsticks: controls of the same structure, and a walk-forward of the selection itself (choose on earlier seasons, read the unseen one).

| App (counted strategies) | Positive in all 3 seasons: real vs controls | Above the best same-structure control (luck share) | Chosen on 2024-25, read on 2025-26 (top 10 / 30 / 100; grid) | Chosen on 2024-25 + 2025-26, read on 2026-27 | Backwards check (chosen 2025-26, read 2024-25) |
|---|---|---|---|---|---|
| Underdog (59,159) | 4.19% vs 0.66% | 2.46% (0.29%) | +8.8% / +5.0% / +0.6%; grid -16.7%; controls +4.4% / -3.5% / -6.0% | +40.9% / +10.9% / +3.6%; grid -31.3%; controls -39.8% / -20.2% / -7.1% | -35.6% / -34.3% / -12.7% |
| PrizePicks regular lines (22,670) | 1.57% vs 0.47% | 8.47% (0.53%) | -0.9% / +10.1% / -0.4%; grid -13.1%; controls -14.5% / -10.7% / -16.9% | +97.0% / +52.2% / +28.5%; grid -6.8%; controls -13.7% / -18.1% / -20.5% | -3.2% / -9.3% / -15.0% |
| Sleeper (35,874) | 1.31% vs 0.18% | - | +37.5% / +35.2% / +33.1% (both seasons on DERIVED prices) | **-31.5% / -32.3% / -33.3%** (first real prices) | +35.2% |
| Fliff (13,296) | 2.86% vs 0.98% | - | -18.4% / -4.8% / +0.6% | -32.8% / -23.3% / -1.0% | -47.0% / -14.5% / -5.1% |

Readings:
1. **Underdog and PrizePicks regular lines: the grid carries real information and a small part of it survives the walk-forward** - weakly from 2024-25 into 2025-26 (the per-leg model had little training in 2024-25, which is also why the backwards check fails), strongly into 2026-27 (only 29 slates - wide ranges). Not yet a certified edge; it is the first positive out-of-sample result of the rebuild.
2. The strategies that survive share one idea: **the few best regular legs of the slate by the blended number** (sportsbook + honest baseline + side), single stats, mostly Unders. Examples, all three seasons: PrizePicks 5-pick Flex x 1 a slate, top by blend, regular, single stats: +12.2% [-22..+50] (82 slips) / +31.9% [-2..+74] (138) / +176% [+44..+318] (22); Underdog 3-pick Standard x 3, blend, regular + goblin, Under, no defensive, minimum > 0: +24.4% [0..+49] (216) / +14.3% [-11..+37] (269) / +132% [+56..+208] (35) (owner rule: no Standard above 2 picks - listed for completeness).
3. **PrizePicks slips with goblins / demons: NOT counted.** At modelled prices even RANDOM slips return +20..+50% and the "best" +170..+340% - the slip pricing of alternates is not reproduced by a product of modelled factors. Rule C9 holds until real slip quotes exist for them.
4. **Sleeper and Fliff history cannot select strategies.** 2024-25 and 2025-26 prices are derived from the sportsbook (circular): what wins there loses ~30% on this season's real prices. Only the 29 real slates count for these two apps.

Next (D2): remove duplicate strategies (identical slip series), apply the owner's exposure rules, shortlist per app with slips a day / drawdown / droughts, portfolios, and the per-leg store (phase C) from the same tables.

## 8r. PHASE D2 - WHERE THE EDGE IS AND HOW DEEP IT GOES (2026-11-19 18:47 PT; runs bt4_*, bt5_*)

Engine changes: identical slip series removed (11,232 on Underdog), leg hit rate per strategy, the FOCUS surface (one pre-stated family printed whole: regular lines, top of the list, no form filter, no minimum - every key x side x props x size x structure, controls included), Sleeper / Fliff on this season's real slates only, split halves of this season.

**The one family that is positive in all three seasons on both apps with real prices: the top regular single-stat Unders of the slate by the blended number.** ROI by season 2024-25 / 2025-26 / 2026-27, 1 slip a slate:
| Underdog (break-even 2-pick Standard 0.5345) | slips | leg hit | ROI [90% range] | drawdown (units) | drought (slates) |
|---|---|---|---|---|---|
| 2-pick Standard, top 2 | 88 / 155 / 29 | 0.545 / 0.623 / 0.552 | +19.3% [-9..+47] / +33.2% [+11..+56] / +32.8% [-28..+93] | 8.0 / 8.5 / 6.5 | 6 / 6 / 5 |
| 2-pick Standard x 2 a slate (top 4) | 176 / 310 / 58 | 0.540 / 0.563 / 0.595 | +7.4% / +10.6% [-4..+26] / +32.8% [-3..+69] | 12.0 / 14.5 / 6.0 | 6 / 5 / 3 |
| 2-pick Standard x 3 a slate (top 6) | 264 / 465 / 87 | 0.557 / 0.560 / 0.563 | +19.3% [+2..+34] / +9.9% [-3..+22] / +16.7% [-11..+45] | 13.5 / 21.5 / 7.5 | 3 / 3 / 2 |
| 3-pick Flex, top 3 | 86 / 150 / 27 | 0.543 / 0.584 / 0.543 | +1.0% / +7.9% / +8.6% | 8.2 / 6.4 / 7.7 | 3 / 4 / 5 |
| 4-pick Flex x 2 (top 8) | 166 / 284 / 50 | 0.563 / 0.542 / 0.525 | +27.1% / +2.3% / +14.4% | 20.8 / 24.6 / 13.2 | 4 / 4 / 5 |

| PrizePicks (break-even 0.542 Flex 5/6, 0.550 3-pick Power, 0.577 2-pick Power) | slips | leg hit | ROI [90% range] | drawdown | drought |
|---|---|---|---|---|---|
| 4-pick Flex, top 4 | 89 / 147 / 25 | 0.579 / 0.570 / 0.650 | +21.3% [-7..+53] / +24.5% [-2..+48] / +92.0% [+26..+170] | 8.0 / 15.5 / 5.5 | 6 / 9 / 4 |
| 4-pick Flex x 2 (top 8) | 178 / 294 / 50 | 0.558 / 0.548 / 0.605 | +15.4% / +7.1% / +41.0% | 11.0 / 20.5 / 6.5 | 3 / 3 / 1 |
| 3-pick Power, top 3 | 92 / 155 / 27 | 0.569 / 0.570 / 0.630 | +23.9% [-15..+63] / +23.9% [-3..+59] / +55.6% [-33..+144] | 16 / 23 / 9 | 14 / 23 / 9 |
| 4-pick Power, top 4 | 89 / 147 / 25 | 0.579 / 0.570 / 0.650 | +12.4% / +36.1% / +140% | 25 / 23 / 9 | 25 / 23 / 9 |
| 5-pick Flex, top 5 (both sides, single stats) | 82 / 138 / 22 | - | +12.2% / +31.9% / +176% | 14.0 / 17.2 / 4.4 | 8 / 12 / 4 |
| 2-pick Power, top 2 | 95 / 161 / 29 | 0.521 / 0.596 / 0.638 | -2.1% / +6.2% / +24.1% | 15 / 9 / 9 | 8 / 8 / 9 |
| 3-pick Flex x 3 (top 9) | 276 / 465 / 81 | 0.537 / 0.541 / 0.576 | -9.8% / -12.3% / 0.0% | 29 / 62 / 10 | 6 / 13 / 5 |

How to read it:
1. **The edge is at the very top of the list and it is thin**: legs ranked 1-4 hit 0.55 - 0.62; by the third slip of a slate (legs 7-9) the hit rate is back at the break-even. About ONE slip a slate per app carries it. Pooled over three seasons: PrizePicks top-4 legs ~1,040 legs at ~0.575 against 0.542; Underdog top-2 legs ~540 legs at ~0.59 against 0.5345 - about 2 to 2.7 standard errors each, before allowing for the fact that "single stats" and "Under" were chosen by looking.
2. Over sides are negative everywhere; with combos included the PrizePicks result disappears in 2024-25; the sportsbook number alone is weaker than the blend; placebo and random controls are negative in the two full seasons (this season they are noisy: 29 slates).
3. Per-season ranges mostly include zero. This is a consistent, modest result - not a proven one. It agrees with the earlier leads (8g, 8l, 8m: the top of the system's regular Unders).
4. **Sleeper and Fliff on 29 real slates: nothing can be selected** (split halves: chosen on one half, read on the other: -62% / -52% / -32% on Sleeper; Fliff swings +176% to -15% with random controls at +7 / +28 / +14). They need more real slates.
5. PrizePicks goblin / demon slips stay uncounted (C9).

**Database housekeeping (owner 18:39 / 18:41 PT: database at 90%, upgrading the plan, "only if there is some very easy cleaning").** Lossless only: the three scratch tables of this rebuild rewritten densely (`VACUUM FULL` on `baseline_history_h`, `_lr_legs_hp`, `_lr_legs_h` - row counts identical before / after: 785,325 / 4,651,922 / 5,076,317). Database 48 GB -> 47 GB. Measured and left alone (production tables, for the existing lossless tool `db_compact.py` off-hours): `tier_map_legs` ~340 MB free, `final_hp` ~330 MB, `board_outcomes` ~170 MB. Nothing deleted.

## 8s. PHASE D3 - THE TOP OF THE LIST TAKEN APART (2026-11-19 19:05 PT; `research_top_list_h.py`, runs tl_underdog 44663331025, tl_prizepicks 44663341153; Underdog kinds surface bt6_underdog 44663881304)

Regular single-stat Unders ranked by the blend, one leg a player, hit rate by rank position (2024-25 / 2025-26 / 2026-27; [90% range, three seasons pooled]):
| Rank | Underdog (needs 0.5345) | PrizePicks (needs 0.542) |
|---|---|---|
| #1 | 0.589 / 0.615 / 0.517 [0.545..0.644] | 0.474 / 0.568 / 0.621 [0.489..0.590] |
| #2 | 0.489 / 0.596 / 0.552 [0.509..0.600] | 0.557 / 0.630 / 0.621 [0.556..0.656] |
| #3 | 0.522 / 0.538 / 0.655 [0.498..0.589] | 0.567 / 0.568 / 0.655 [0.531..0.618] |
| #4 | 0.556 / 0.551 / 0.655 [0.516..0.611] | 0.567 / 0.525 / 0.621 [0.500..0.597] |
| #5-6 | 0.572 / 0.500 / 0.552 [0.496..0.564] | 0.552 / 0.497 / 0.586 [0.486..0.559] |
| #7-10 | 0.542 / 0.545 / 0.434 [0.505..0.556] | 0.518 / 0.535 / 0.552 [0.507..0.551] |
| #11-20 | 0.527 / 0.521 / 0.534 [0.509..0.540] | 0.515 / 0.516 / 0.462 [0.495..0.526] |
| #21-40 | 0.535 / 0.540 / 0.552 [0.528..0.550] | 0.515 / 0.524 / 0.538 [0.512..0.532] |
Pooled against the break-even, slate level: Underdog top 2 0.576 (550 legs, +1.90 standard errors), top 4 0.565 (1,100 legs, +2.05), top 6 0.553 (+1.54); PrizePicks top 3 0.574 (864 legs, +1.82), top 4 0.568 (1,152 legs, +1.68), top 6 0.553 (+0.89).

What the top 4 are: 92-96% have a sportsbook number at the exact line and it sits near even (0.51 - 0.53); the app line equals the sportsbooks' main line on 86-88% - **this is not line shopping**. The honest baseline calls them 0.71 (Underdog) / 0.82 (PrizePicks): players whose minutes are up (37-45% vs 27% of all), often bench / rotation, where the baseline still projects the old role. The app has mostly priced the new role; the leg still goes Under more than the price needs. When the app line IS above the sportsbooks' main line by 0.5+: 0.617 (115 legs, Underdog), 0.659 (41, PrizePicks). By month: no single month carries it (Underdog 0.51 - 0.65 outside two 16-20-leg Aprils at 0.35 - 0.38; PrizePicks 0.50 - 0.73). By prop: rebounds 0.59 / 0.62 and threes 0.61 / 0.60 above points 0.55 / 0.54.
Against its neighbours: Overs are below break-even at every rank on both apps; combos Unders show no top-of-list lift on PrizePicks; the sportsbook alone and the gbm alone rank worse than the blend; placebo and random sit at the Under base rate (0.52). The honest baseline alone ranks almost as well as the blend at ranks 1-3 on both apps.

Underdog with goblins (real multipliers in all three seasons): legs the blend calls profitable, regular + goblin, ranked by the small gbm - 2-pick Standard 1 a slate +35% / +13% / +17%, 3 a slate +17% / +16% / +10%; 4-pick Flex 3 a slate +16% / +17% / +39%. But RANDOM order inside the same "blend says profitable" set gives 2-pick x 3: +10% / -1% / +27%: the minimum filter carries most of it, the ranking adds a little. Goblins alone and demons alone: negative.

Verdict on the family: **a thin, consistent top-of-list effect on regular single-stat Unders, about 2 standard errors on each of two apps, with "Under" and "single stats" chosen by looking. Probable, not proven. It supports about one slip a slate per app.**

## 8t. PHASE C - THE PER-LEG STORE (2026-11-19 19:05 PT; `research_legs_honest_store.py`, run ls1 44664448176)

| Object (schema `nba_score`, beside production, nothing reads it) | Content |
|---|---|
| `v_legs_honest` (view, no storage) | 5,059,053 board legs, four apps, 356 dates, 545 players: app, season, date, player, prop, side, line, kind, tier, price source (real / derived / modelled), return multiplier, break-even, result, honest baseline chance, walk-forward blend / small gbm / gbm (4,651,922 legs), predicted return, realised return |
| `honest_leg_cells` (7,527 rows) | app x season x price source x kind x prop x side x line band x predicted-return band: legs, slates, hit rate, break-even, ROI, predicted ROI |
| `honest_leg_players` (8,825 rows) | app x season x player x side on regular lines: legs, slates, hit rate, ROI |
| `honest_leg_ladders` (243 rows) | app x season x kind x rung (the chance a rung needs) x side: legs, hit rate, ROI |

Headlines from the store:
- **Every regular line, every app, every season is below break-even on both sides**: Unders -3.5% to -9.3%, Overs -8.3% to -15.1%. Underdog regular Unders this season: 0.531 against 0.5345 (-0.6%).
- **The blend orders the board correctly** (regular lines, real prices; ROI by predicted band, below -15% / -15..-5% / -5..0% / 0..+5%): Underdog 2025-26 -16.9% / -8.4% / -1.8% / +2.7%; Underdog 2026-27 -22.1% / -8.2% / -1.0% / +13.6% (229 legs); PrizePicks 2025-26 -12.8% / -8.5% / -3.8% / -2.7%; PrizePicks 2026-27 -15.2% / -9.0% / -3.9% / -0.1%; Fliff 2026-27 -16.5% / -8.7% / -4.9% / +11.1% (212 legs); Sleeper 2026-27 -16.3% / -10.2% / -4.7% / -4.4%. Monotone everywhere; the top band reaches zero or a little above, on few legs.
- **The ladder**: every rung of every alternate ladder at real prices is negative (Underdog goblins -5.8% to -13.8%, demons -6.5% to -21.6%, Sleeper alternates -12% to -60%); the deeper the rung, the worse.
- **Players do not repeat**: of 830 player x side with 60+ regular legs in both 2024-25 and 2025-26, the correlation of the two seasons' ROI is +0.03; of the 202 positive in 2024-25, 28% were positive again (27% is the base rate). "Specific players" is not a strategy.

## 8u. WHERE THE REBUILD STANDS AFTER PHASES A-D (2026-11-19 19:05 PT) - the answer to D8

| Phase | State |
|---|---|
| A. Numbers certified | DONE. Truncation invariance 15 / 15 at 100.00% identical with a leaky control; input audit 7 / 7; in-play boards removed in all seasons; PrizePicks alternate prices bounded by real quotes. |
| B. Best per-leg number | DONE. Walk-forward blend / gbm on ~40 pick-time inputs for 4.65M legs. Trailing layers, form, role, injury report, line gaps tested inside it. The honest ceiling: it beats the price by a hair and orders the board correctly; it does not clear the apps' margin except at the very top of regular lines. |
| C. Per-leg store | DONE. `v_legs_honest` + three roll-ups. |
| D. Battery from zero | DONE for the first complete pass: ~130,000 strategies, four apps, 2-6 picks Flex and Power, controls per structure, walk-forward of the selection, focus surfaces. |

What the certified numbers support:
1. **No app, kind, prop, side, rung or player is profitable as a group at real prices.**
2. *(PrizePicks part SUPERSEDED by 8x: on the complete board PrizePicks is negative in 2024-25; Underdog unchanged.)* **One thin candidate on Underdog and one on PrizePicks**: the top 2-4 regular single-stat Unders of the slate by the blend, about ONE slip a slate per app (8r, 8s). In units of one stake over 2024-25 / 2025-26 / 2026-27: Underdog 2-pick Standard +17.0 / +51.5 / +9.5 (88 / 155 / 29 slips; drawdown 8.0 / 8.5 / 6.5; drought 6 / 6 / 5 slates); PrizePicks 4-pick Flex +19.0 / +36.0 / +23.0 (89 / 147 / 25 slips; drawdown 8.0 / 15.5 / 5.5; drought 6 / 9 / 4); PrizePicks 3-pick Power +22 / +37 / +15 (drawdown 16 / 23 / 9; drought 14 / 23 / 9). Evidence about 2 standard errors per app: probable, not proven.
3. **Sleeper, Fliff: nothing can be certified** - their history prices are derived; 29 real slates are too few. **Betr** has no per-leg price and is outside these leg tables.
4. **PrizePicks goblins / demons: unanswerable from history** (modelled prices; rule C9). O17 is the way to settle it.
5. Volume: the honest numbers support roughly 1 slip a slate on each of two apps - far fewer than the live system places.

Open, in order of value: O16 (sportsbook capture this season is thin - the blend's main input), O17 (real quotes on the model's top goblins), a pick-time version of the blend (today it exists only for graded days), then the live discussion the owner reserved (D8).

## 8v. PASSES 2 AND 3 - MORE ANGLES, AND AN EXACT TEST OF LUCK (2026-11-19/20, written 19:57 PT)

Owner 19:12 PT: "look at all proplines, variations, all hit rate rankings, all internal rankings, final hp, score, per leg roi, slip structure, slip composition, factors, layering ... leave nothing behind, we need to keep doing passes".

**Pass 2 (`research_battery_h.py` with `BT_PASS=2`; runs p2 / p2b / p2c on Underdog and PrizePicks; 227,020 strategies on Underdog, 86,000 on PrizePicks).** New rank keys: the player's trailing hit rate, season average and last 5 against the line, the line against the sportsbooks' main line, and - this season only, where they were stored on the day - production's final_hp, its return and its score. One prop at a time (points, rebounds, assists, threes). 25 pick-time factors as filters: hot / cold, minutes up / down, back-to-back, rested 3+, home / away, starter / bench roles, team minutes out 24+ / none, opponent minutes out 48+, line better than / equal to the sportsbooks, 2+ sportsbooks, first 10 games, 20+ games, line under 6 / 15+, weekend, listed on the report, small / large slate. Composition: 1, 2 or any number of legs from one game (`BT_GAMECAP`).

| Angle | Result (ROI 2024-25 / 2025-26 / 2026-27, regular Unders unless said) |
|---|---|
| Honest baseline alone as the ranking, Underdog single stats | 2-pick Standard +27% / +33% / +45%; 3-pick Standard +36% / +30% / +20%; 3-pick Flex +12% / +11% / +5% - as good as the blend. On PrizePicks it fails in 2024-25 (3-pick Power -15% / +16% / +78% both sides). |
| Trailing hit rate as the ranking | negative on both apps, every prop (Underdog 2-pick -12% / -16% / +57%, 3-pick Flex -17% / -22% / +9%; PrizePicks -27% / -16% / +24%). Rejected a second time. |
| Season average / last 5 against the line | negative or one season only. Rejected. |
| Line against the sportsbooks as the ranking | Underdog Unders -9% / +22% / +21% (2-pick): nothing in 2024-25. PrizePicks negative. |
| One prop at a time | Underdog rebounds Unders by blend 2-pick +11% / +23% / +48%, 3-pick Standard +22% / +23% / +56%; points and threes mixed; assists negative on both apps. PrizePicks: no single prop holds in all three seasons - the result exists only as the single-stat mix. |
| 25 factors as filters (3 slips a slate, Underdog 2-pick Standard; "no filter" = +19% / +10% / +17%) | none beats "no filter" in all three seasons. Closest: large slate +35% / +5% / +38% (random picks on large slates +8% / +7% / +17%), rested 3+ +24% / +6% / +8%, team minutes out 24+ +19% / +14% / -2%. Line better than the sportsbooks: +7% / +21% / +30%, and RANDOM picks inside that set -7% / +26% / +30% - a line-shopping effect in the last two seasons only, 205 slips. PrizePicks: every factor row is negative or one season. **Factors and layering add nothing reliable.** |
| Legs of one game in a slip (Underdog) | 2 a game: 3-pick Standard +33% / +38% / +79% (1 a game: +13% / +21% / +44%); 2-pick unchanged; 5-6 picks worse. Unders of one game move together, which helps all-or-nothing slips slightly. Not enough slips to call. |
| Production's own numbers this season (29 slates, stored on the day) | Underdog, single stats both sides, top of the list by final_hp: 2-pick +45%, 3-pick Standard +93%, 3-pick Flex +37%; by score +57% / +117% / +45%; the blend on the same slates +33% / +44% / +13%; random -3% / -28% / -32%. PrizePicks all props both sides by final_hp: 2-pick +24%, 3-pick Power +56%, 4-pick Flex +50%; random -59% / -56% / -40%. **This season the live system's top of the list is at least as good as the blend** - on 29 slates, so it ranks, it does not prove. |
| Selection walk-forward on the bigger grid | Underdog chosen on 2024-25 -> 2025-26: top 30 +16%, top 100 +9%; chosen on both -> 2026-27: -34% / -28%. PrizePicks: negative in every direction. **Choosing "the best of the grid" does not carry forward; only the pre-stated family does.** |

**Pass 3 - the exact null (`research_candidate_null.py`, run cn1 44669709664).** One slip a slate is few slips; ONE random order of the same legs showed +30% / +24% on PrizePicks 3-pick Power in the two full seasons. So each candidate slip was re-drawn 4,000 times at random from its own pool (any regular single-stat Under of the slate, one a player, one a game, same slates):
| Candidate (ranked by blend) | Real units, 3 seasons | Random draws: mean / 95th / 99th | Share of random draws that do as well |
|---|---|---|---|
| Underdog 2-pick Standard | +78.0 (272 slips) | -13.1 / +29.0 / +46.5 | 0 of 4,000 |
| Underdog 2-pick Standard, ranked by the honest baseline | +88.5 | -14.4 / +29.0 / +46.5 | 0.05% |
| Underdog 3-pick Flex | +15.1 (263) | -30.8 / -2.2 / +11.8 | 0.6% |
| PrizePicks 4-pick Flex | +78.0 (261) | -44.1 / -3.0 / +15.0 | 0 of 4,000 |
| PrizePicks 3-pick Power | +74.0 (274) | -48.7 / +8.0 / +32.0 | 0.03% |
| PrizePicks 5-pick Flex | +80.8 (242) | -38.2 / +13.2 / +34.0 | 0 of 4,000 |
| PrizePicks 2-pick Power | +15.0 (285) | -58.0 / -21.0 / -3.0 | 0.05% |
By season the candidate beats 82-99.9% of random draws in each of the three seasons (weakest: PrizePicks 5-pick Flex 2024-25 at 82%, Underdog 2-pick 2026-27 at 84% on 29 slips). Against "any regular leg, both sides" the gap is wider. The small gbm as the ranker is much weaker (PrizePicks 4-pick Flex -1.5 units, Underdog 2-pick +4.5): the result belongs to the blend and to the honest baseline, not to every ranker.

What passes 2 and 3 change:
1. **The ranking is real**: the top of the list beats random picks from the same pool far beyond luck, in each season, on both apps.
2. **Profit above zero is still the uncertain part**: pooled ROI +29% on ~270 slips per candidate is about 2.5-2.9 standard errors before allowing for the choices made (ranker, side, props, structure), about 2 after.
3. PrizePicks is the more fragile of the two: one ranker (the blend), one prop mix; Underdog holds with two rankers and with rebounds alone.
4. Nothing else on the list - trailing rankings, form, factors, layering, single props, alternates, composition - produced a second candidate.

## 8w. PASSES 4 AND 5 - "AS PLACED", RANK CAPS, COMPOSITION; GOBLIN PRICE BIAS; SLEEPER / FLIFF WITH DERIVED HISTORY (written 21:04 PT, 2026-11-20)

Owner 2026-11-19 20:48 PT: the strategies "look good if they hold ... totally deployable"; keep quoting goblins / demons; Sleeper / Fliff can use derived boards; "I don't get this issue: sportsbook lines at pick time"; "the numbers ... properly backtested and proved with real legs, real boards, real generated slips with graded legs? They need to. Then test slip composition, rank caps and all variations possible".

**What the candidate numbers were built from (the answer to "real legs, real boards, real slips").** Real: the pick-time boards as captured (Underdog regular lines at their real 1.0x; PrizePicks regular lines at the fixed tables), every leg graded from the box score (re-graded 100%), every slip generated leg by leg and paid by the app's table, the ranking number produced only from earlier months. NOT in those numbers until this pass: (1) legs that ended exactly on the line (a push) were absent from the leg tables, (2) players who did not play have no history number and cannot be ranked, (3) the blend exists from January 2025 on (it needs earlier months to learn from), (4) boards in the two older seasons are one capture a day at 22:40 UTC.

**Pass 4 - as placed (`research_as_placed.py`, run ap1 44677088411).** The candidate rebuilt from the RAW board of regular single-stat Unders (every leg, pushes included, paid by the app's rule), full seasons, ranked by the certified honest baseline (the only ranker that exists for pushed legs and for October-December 2024):
| | Slips | ROI 2024-25 / 2025-26 / 2026-27 | Pooled | Cost of pushes |
|---|---|---|---|---|
| Underdog 2-pick Standard | 158 / 162 / 29 | +13.6% / +27.5% / +32.8% | +21.6%, +75.5 units | none (0.3% of slips; Underdog lines are half-points) |
| Underdog 3-pick Standard | 150 / 157 / 27 | -0.3% / +24.2% / +44.4% | +14.8% | none |
| Underdog 3-pick Flex | 150 / 157 / 27 | -4.4% / +10.0% / +12.6% | +3.8% | -0.3 points |
| PrizePicks 3-pick Power | 150 / 155 / 27 | -34.0% / +27.7% / +22.2% | -0.6% | -1.8 points |
| PrizePicks 4-pick Flex | 142 / 147 / 25 | -11.6% / +11.9% / +50.0% | +4.3% | -2.7 points (8.6% of slips hold a push) |
| PrizePicks 5-pick Flex | 126 / 138 / 22 | -1.5% / +37.8% / +125.5% | +27.2% | +0.8 points |
| PrizePicks 2-pick Power | 157 / 160 / 29 | -21.7% / +5.6% / +17.2% | -5.8% | +0.6 points |
- **Underdog holds as placed, on more slates than the battery had** (349 slips, the whole of 2024-25 included).
- **PrizePicks does not hold under the honest baseline over the full 2024-25 season** (-34% on 3-pick Power). Its positive numbers belong to the blend, from January 2025 on; 22-31% of its regular single-stat lines are whole numbers, 12-14% of those push, and a push costs 2-3 points on the 3- and 4-pick slips. Blend numbers for PrizePicks should be read 2-3 points lower.
- **Players who did not play**: 10-13% of board legs in the older seasons (Underdog this season 24%, PrizePicks 4%). In the app that leg is void: an Underdog 2-pick is refunded (the ROI applies to ~80% of the slips), a PrizePicks 4-pick Flex drops to a 3-pick Flex (about 4-5 points lower on the slips it touches). Not measurable from history. P3's fresh board after the injury report is what keeps it small live.

**Pass 5 - rank caps and composition (`research_rank_caps.py`, run rc1 44678252241; blend ranking, graded legs).**
| Rank window (one slip) | Underdog 2-pick Standard | PrizePicks 4-pick Flex | PrizePicks 3-pick Power |
|---|---|---|---|
| from rank 1 | +28.7% (ranks 1-2) | +29.9% (1-4) | +27.0% (1-3) |
| from rank 2 | -0.2% (2-3) | +26.4% (2-5) | +47.1% (2-4) |
| from rank 3 | -3.4% (3-4) | +4.9% (3-6) | +6.6% (3-5) |
| from rank 4 | -6.1% | -6.2% | -5.6% |
| from rank 5 | -7.4% | -29.8% | -25.0% |
**The cap: Underdog 2 legs, PrizePicks 5 legs.** Below that the list is at or under break-even.
| More slips from the same legs (every combination of the top N), ROI by season, pooled, units, drawdown |
|---|
| Underdog 2-pick, top 3 (3 slips a slate): +9% / +16% / +17%, pooled +13.6% on 789 slips, +107 units, drawdown 30 |
| Underdog 2-pick, top 4 (6 slips): +7% / +15% / -11%, pooled +9.7%, +145 units, drawdown 50 |
| PrizePicks 3-pick Power, top 4 (4 slips): +21% / +24% / +92%, pooled +29.9% on 1,044 slips, +312 units, drawdown 62 |
| PrizePicks 4-pick Flex, top 5 (5 slips): +5% / +18% / +83%, pooled +19.8% on 1,210 slips, +239 units, drawdown 76 |
| PrizePicks 5-pick Flex, top 6 (6 slips): +10% / +19% / +116%, pooled +25.2% on 1,296 slips, +326 units, drawdown 90 |
| PrizePicks 3-pick Power, top 6 (20 slips): +12% / +8% / +72%, pooled +15.0% on 4,320 slips, +648 units, drawdown 252 |
More units from the same few legs, at 3-10 times the drawdown: these slips win and lose together. Game rule: PrizePicks is better with one leg a game (4-pick Flex +29.9% vs +16.7% without); Underdog 3-pick Standard is better without it (+39.5% vs +21.1%), 2-pick the same.

**Goblins at modelled prices, corrected by real quotes (run pq2 44677142042).** Picks chosen the way history must choose them (number x MODELLED price), paid at the REAL quote, this season: honest baseline says > +5%: 313 legs, +6.2% at the modelled price -> **+2.4% at the real price [-5.7..+16.4]**; gbm says > 0: 228 legs, -10.6% -> -15.0%. On chosen legs the modelled price runs 3-5% above the real one. Demons: -21% to -52% by every ranker. Reading: history's goblin figures need about 4 points taken off; what is left is around zero. The twice-a-day quote runs continue unchanged.

**Sleeper / Fliff with derived history kept in (runs bt7_*; same family, regular single-stat Unders by blend, 1 slip a slate, 2024-25 / 2025-26 / 2026-27; the first two seasons at DERIVED prices):** Sleeper 2-pick -14% / +1% / -6%, 3-pick Max -5% / +5% / -20%, 4-pick Flex -1% / +1% / -29% - nothing (its regular lines need ~0.56). Fliff 2-pick -7% / +10% / +9%, 3-pick +1% / +11% / +23%, 4-pick +21% / +11% / -42% - a weak lead on 2-3 picks, random picks swing wider than that.

**"Sportsbook lines at pick time" in plain words.** For each prop the system stores what the sportsbooks (DraftKings, FanDuel, ...) were offering at the moment our slips are built. The blend leans on that number more than on anything else. In the two older seasons a sportsbook number at the exact app line exists for 92-95% of Underdog legs; this season for 37% (about 2,000 stored sportsbook rows a day against about 5,500 before). The candidate still works this season with less of it, but the blend is working with one eye closed. Why the capture is thinner has not been looked at yet (O16).

## 8x. PASSES 6 AND 7 - EVERY OPEN ITEM AND EVERY UNTESTED VARIATION (owner 21:07 PT; written 22:12 PT, 2026-11-19)

**CORRECTION FIRST - PrizePicks is weaker than 8u / 8v / 8w said.** A whole-number line (e.g. 5.0) had no honest chance stored (the baseline ladder is on half points), so 9% of PrizePicks regular legs were invisible to the ranking. `LH.attach` now reads the neighbouring half point (coverage 91% -> 99%), pushed legs are kept in a table of their own (`_lr_legs_push`, 8,018 rows), legs and model rebuilt (runs lh8, lm5_*). On the complete board the PrizePicks candidate is NEGATIVE in 2024-25. Underdog did not move by one unit.

| Slip (top regular single-stat Unders by the blend, one a player and a game) | 2024-25 | 2025-26 | 2026-27 | pooled | drawdown | drought |
|---|---|---|---|---|---|---|
| Underdog 2-pick Standard (top 2) | +19.3% (+17.0 u, 88) | +33.2% (+51.5 u, 155) | +32.8% (+9.5 u, 29) | +28.7%, +78.0 u | 8.5 | 6 |
| Underdog 3-pick Standard (top 3) | +13.4% (+11.5 u) | +21.3% (+32.0 u) | +44.4% (+12.0 u) | +21.1%, +55.5 u | 28.5 | - |
| PrizePicks 3-pick Power (top 3) | -15.2% (-14.0 u, 92) | +35.5% (+55.0 u, 155) | +55.6% (+15.0 u, 27) | +20.4%, +56.0 u | 26.0 | 22 |
| PrizePicks 4-pick Flex (top 4) | -12.4% (-11.0 u, 89) | +21.4% (+31.5 u, 147) | +44.0% (+11.0 u, 25) | +12.1%, +31.5 u | 15.5 | 8 |
| PrizePicks 5-pick Flex (top 5) | -5.9% (-4.8 u, 82) | +33.3% (+46.0 u, 138) | +127.3% (+28.0 u, 22) | +28.6%, +69.2 u | 21.8 | 16 |
| PrizePicks 2-pick Power | -27% | +6% | +14% | -4.2% | 32 | - |

The earlier PrizePicks figures (4-pick Flex +21 / +24 / +92%, 3-pick Power +24 / +24 / +56%) are VOID. Runs: rc2 44682855267, cn2 44682863851, bt8_*, tt2 44685832925 (tracker rewritten on the refreshed blend, 807 slips, same numbers to the unit).

**As placed, with pushes paid by the app's rule** (ap2 44682845802, part 2): Underdog 2-pick Standard +78.0 u, +28.7% (no slip had a push). PrizePicks 3-pick Power +47.0 u (+17.2%; 6.6% of slips had a push), 4-pick Flex +26.0 u (+10.0%), 5-pick Flex +57.9 u (+23.9%; 9.9% with a push) - pushes cost PrizePicks 3-8 points. **This season on the raw board with production's own pick-time final_hp / score, did-not-play legs included** (part 3, 30 slates): top-4 legs did not play 7.5-9.2% of the time; Underdog 2-pick Standard +10.0% by final_hp, +38.3% by score, 3-pick Standard +89.7% / +84.5%; PrizePicks 2-pick Power +16.7% / +43.3%, 3-pick Power -3.4% / +17.2%, 4-pick Flex +7.4% / +11.1%, 5-pick Flex +6.4% / -5.2%. Thirty slates: direction only.

**Luck test again** (4,000 random draws of the same slip from the same pool, cn2): Underdog 2-pick Standard - 0 of 4,000 as good pooled; by season p = 0.09 / 0.001 / 0.16. PrizePicks 5-pick Flex pooled p = 0.0005, by season 0.29 / 0.004 / 0.004; 3-pick Power pooled 0.018, by season 0.24 / 0.06 / 0.18; 4-pick Flex pooled 0.0015, by season 0.38 / 0.005 / 0.04. So the ranking beat chance in the last two seasons on both apps and did NOT on PrizePicks in 2024-25.

**Range of the result** (10,000 resamples of the slates, p7 44684807698): Underdog 2-pick Standard pooled +28.7%, 5th-95th +11.9 .. +45.4%, above zero in 99.8%; season-weighted +30.3% (+12.2 .. +48.3). PrizePicks 5-pick Flex pooled +28.6% (+0.8 .. +57.7), above zero 95.6%; 3-pick Power +20.4% (-3.6 .. +44.5), 92.9%.

**Pass 7 - what was still untested** (`research_pass7.py`, p7):
- *Conditions* (slate size, weekday, month, weakest leg's chance, gap to the next leg, largest line, pool size): no split is steady across the three seasons on either app. Underdog by games on the slate 1-3 / 4-6 / 7-9 / 10+: +43 / +20 / +27 / +39%. One note kept, not adopted: two legs of DIFFERENT props +35 / +32 / +50% (200 slips) against the same prop -42 / +37 / -12% (72 slips). April is negative on both apps (9 and 20 slips).
- *Composition*: Unders + the best Over, best of either side, only legs both rankers agree on, only legs top on both apps, average of the two rankers - none beats the plain top of the list on Underdog (+26.1 / +23.5 / +22.9 / +22.6 / +28.7% against +28.7%). PrizePicks 5-pick Flex by the average of blend and honest baseline -4 / +49 / +135% (+94 u) - still negative in 2024-25.
- *Staking*: skipping slates below the past median chance, or doubling above it, does not raise the ROI (Underdog +26.1% and +26.9% against +28.7% flat). Flat stays.
- *Two-factor layering* (28 pairs of the 8 strongest factors inside the battery, ly_underdog 44682882649, ly_prizepicks 44682900906; 258,329 and 87,467 strategies): no pair improves the unfiltered top of the list in all three seasons on either app.
- *Rank caps / round robins* (rc2): Underdog ranks 1-2 only (ranks 2-3 -0.2%); every 2-pick of the top 3 +9 / +16 / +17% (+107 u on 3 slips a slate, drawdown 30). PrizePicks cap about 5 legs; one leg a game beats no rule.
- *Betr* (`research_betr_candidate.py`, be1 44682994726; real Betr tables incl. the all-Less discount; 129 slates, one season of boards): the same family is flat to negative - all-Unders 2-pick -2.5%, 3-pick -8.3%, 4-pick +10.5% / -0.8% (perfect / dynamic), 5-pick -11.6% / -3.3%. Nothing to carry.
- *Sleeper / Fliff this season at real multipliers* (lm5_*, bt8_fliff 44685205872, bt8_sleeper 44685215510; 29 slates): Sleeper top of list negative to flat (top 6 -2.6%, top 10 +2.9%). Fliff: the blend's top 6 a slate hit 68.4%, +11.0% a leg [+0.8 .. +19.5] (174 legs), 3-pick +21% - a lead on one month of data, not a result.

**Portfolio - the slips run together, 1 unit a slip** (p7 part D):

| Set | 2024-25 | 2025-26 | 2026-27 | pooled | slips a slate | drawdown | drought | losing months | worst 10 slates |
|---|---|---|---|---|---|---|---|---|---|
| Underdog 2-pick Standard alone | +17.0 u (+19.3%) | +51.5 u (+33.2%) | +9.5 u (+32.8%) | +78.0 u, +28.7% | 1.00 | 8.5 | 6 | 3 of 13 | -6.5 u |
| + PrizePicks 5-pick Flex | +12.2 u (+7.2%) | +97.5 u (+33.3%) | +37.5 u (+73.5%) | +147.2 u, +28.6% | 1.80 | 17.9 | 6 | 4 of 13 | -13.3 u |
| + PrizePicks 3-pick Power | +3.0 u (+1.7%) | +106.5 u (+34.4%) | +24.5 u (+43.8%) | +134.0 u, +24.5% | 1.92 | 24.5 | 8 | 3 of 13 | -16.5 u |
| + PrizePicks 4-pick Flex | +6.0 u (+3.4%) | +83.0 u (+27.5%) | +20.5 u (+38.0%) | +109.5 u, +20.5% | 1.87 | 16.5 | 5 | 2 of 13 | -13.5 u |
| PrizePicks 5-pick Flex alone | -4.8 u (-5.9%) | +46.0 u (+33.3%) | +28.0 u (+127.3%) | +69.2 u, +28.6% | 1.00 | 21.8 | 16 | 4 of 13 | -8.8 u |
| all five slips | -1.3 u (-0.3%) | +216.0 u (+29.0%) | +75.5 u (+58.1%) | +290.2 u, +22.1% | 4.60 | 56.2 | 5 | 5 of 13 | -40.3 u |

Underdog top 2 and PrizePicks top 5 share 0 / 1 / 2 players on 108 / 95 / 26 of 229 common slates; their daily results are almost unrelated (correlation +0.07).

**O16 answered - why sportsbook lines are thin this season.** Not a fault, a different capture: the two older seasons were BACKFILLED with full alternate ladders (19 markets, about 5,500 consensus rows a day); this season is captured LIVE with main lines only (10-11 markets, about 2,500 rows a day) and the book list changed on the way: DraftKings (thin) + Bovada at the start, novig from 11-01, BetMGM from 11-11, FanDuel from 11-13, Pinnacle stopped 11-08, BetOnline absent; about 2.1 books a row since 11-13. Restoring the older depth means capturing alternate lines live (more requests against the odds source) - a cost decision for the owner, not taken here.

**O17 design (not built - it touches the live side, D8).** To quote goblins the model itself would pick, a pick-time copy of the honest number is needed: after P3 mines the board, run the honest baseline + blend on that board into a shadow table (no slip reads it), take the 30 best goblin / demon legs a slate by predicted return and send them through the existing GitHub Actions quote job. About 6 weeks of that gives ~1,000 real quotes on model picks, enough to say yes or no. Today's only evidence: 313 such legs at real quotes, about +2%.

## 8y. PASS 8 - EVERY STRUCTURE, THE QUALIFIED LEGS ON THE OTHER APPS, O16 CLOSED, O17 BUILT (owner 22:16 PT; written 22:23 PT, 2026-11-19)

**A. Every structure** (`research_pass8.py`, run p8 44686879128; top k regular single-stat Unders by the blend, one a player and a game, 1 slip a slate; units and ROI 2024-25 / 2025-26 / 2026-27):

| Structure | Underdog (Standard / Flex) | PrizePicks (Power / Flex) |
|---|---|---|
| 2-pick | **+17.0 / +51.5 / +9.5 u (+19 / +33 / +33%), pooled +28.7%, drawdown 8.5, drought 6** | -26.0 / +10.0 / +4.0 u (-27 / +6 / +14%), pooled -4.2% |
| 3-pick Standard / Power | +11.5 / +32.0 / +12.0 u (+13 / +21 / +44%), pooled +21.1%, drawdown 28.5, drought 16 | -14.0 / +55.0 / +15.0 u (-15 / +35 / +56%), pooled +20.4%, drawdown 26, drought 22 |
| 3-pick Flex | +0.9 / +11.9 / +2.3 u (+1 / +8 / +9%), pooled +5.7%, drawdown 12.4, drought 5 | -15.0 / +5.0 / +3.0 u (-16 / +3 / +11%), pooled -2.6% |
| 4-pick Standard / Power | +13.0 / +38.0 / -1.0 u (+16 / +27 / -4%), pooled +20.0%, drawdown 39, drought 34 | -29.0 / +53.0 / +15.0 u (-33 / +36 / +60%), pooled +14.9%, drawdown 33, drought 25 |
| 4-pick Flex | +11.0 / +31.8 / -3.6 u (+13 / +22 / -14%), pooled +15.7%, drawdown 17.2, drought 13 | -11.0 / +31.5 / +11.0 u (-12 / +21 / +44%), pooled +12.1%, drawdown 15.5, drought 8 |
| 5-pick Standard / Power | +24.0 / +7.0 / +18.0 u (+32 / +5 / +82%), pooled +21.2%, drawdown 36, drought 31 | -2.0 / +82.0 / +58.0 u (-2 / +59 / +264%), pooled +57.0%, drawdown 40, drought 40 |
| 5-pick Flex | +11.5 / -8.0 / +0.5 u (+15 / -6 / +2%), pooled +1.7%, drawdown 30, drought 19 | -4.8 / +46.0 / +28.0 u (-6 / +33 / +127%), pooled +28.6%, drawdown 21.8, drought 16 |
| 6-pick Standard / Power | -31.0 / -84.0 / +16.0 u (-47 / -71 / +84%), pooled -48.5% | +4.0 / +100.0 / +17.5 u (+6 / +80 / +88%), pooled +56.2%, drawdown 39, drought 39 |
| 6-pick Flex | -5.3 / -41.5 / +9.4 u (-8 / -35 / +49%), pooled -18.4% | +0.2 / +75.0 / +17.0 u (+0 / +60 / +85%), pooled +42.7%, drawdown 25, drought 19 |

Reading: Underdog 2-pick Standard is the only cell positive in all three seasons with a small drawdown (its own rule also forbids Standard above 2 picks); Underdog Flex is thin (+1.7 .. +15.7%). PrizePicks 6-pick Power / Flex are the only PrizePicks cells not negative in 2024-25 (+6% / +0%) - on 71 slips with 39- and 19-slate droughts; the big totals are 2025-26 and one month of 2026-27. PrizePicks 3-pick Flex is negative.

**B. The qualified legs played on the other apps** (same player + prop Under on the target's board that slate, the target's own line and price; qualified = Underdog top 2 + PrizePicks top 5; 85-88% of matches are the same line):
- *Sleeper*: return a leg -7.6% / -2.1% on derived prices (2024-25 / 2025-26), +2.2% [-10.0 .. +14.4] on 138 legs at REAL prices this season. Slips this season (real prices, 20-29 slips): 2-pick Max +6.5%, 3-pick Max +6.8%, 3-pick Flex -0.6%, 4-pick Max +57.7% / Flex +46.7%, 5-pick Max +188% / Flex +97% (20 slips), 6-pick 8 slips.
- *Fliff*: return a leg -5.0% / +0.8% derived, +5.2% [-7.4 .. +17.7] on 138 legs real. Slips this season: 2-pick +12.5%, 3-pick +7.8%, 4-pick +70.3%, 5-pick +194% (20 slips).
- *Betr* (2025-26 boards only, all-Less tables, 488 legs hit 55.9%): Perfect 2 / 3 / 4 / 5 picks +6.5% / +28.8% / +11.1% / 0.0% (124 / 111 / 81 / 36 slips); Dynamic 3 / 4 / 5 -2.3% / -1.2% / -11.1%. Fed by Underdog's top 2 only: 2-pick Perfect +12.9% (56 slips, legs hit 63.1%).
- *Across the two*: PrizePicks' top 5 played on Underdog: 2-pick Standard +19 / +15 / +75% (+37.0 u, 201 slips). Underdog's top 2 played on PrizePicks: 2-pick Power +7 / +9 / +15% (+11.0 u, 118 slips).
- Verdict: the legs carry over (they hit 53-64% everywhere), but Sleeper's and Fliff's single-leg price (break-even 55-57%) leaves about zero a leg; their real-price evidence is 29 slates and the 4-5 pick numbers ride this season's hot top of the list. Leads to track forward, not results. Betr 3-pick Perfect on the qualified legs is the one new cell worth tracking.

**O16 CLOSED - no spend needed.** Checked the capture itself: on 2026-11-18 the window capture held 10 sportsbooks (DraftKings, FanDuel, BetMGM, BetRivers, Bovada, Caesars, Fanatics, novig, ProphetX; alternates from Bovada and FanDuel - ParlayAPI carries alternates for no other book). Rows a day grew 483 (first week) -> 637 -> 1,564 -> 2,499 -> 2,225 and books a row 1.03 -> 2.12, already above the older seasons' 1.4-1.5 books a row; the older seasons' extra rows are backfilled alternate ladders that no live source offers. And the candidate does not lean on it: ranking by the honest baseline ALONE (no sportsbook at all) gives Underdog 2-pick Standard +88.5 u against +78.0 u with the blend. Correction to 8x: the thin capture was the first three weeks of the season, not a standing gap.

**O17 BUILT (research only; live strategies untouched).** `shadow_alt_targets.py` runs as a soft, 3-minute-capped last step of the morning slate build (P2B, ~09:15 PT - before the last injury reports and hours before the slips): it reads the morning PrizePicks board prices and the morning chance of every rung, and writes the model's 60 best goblins / demons of the day (at most 2 a player, both kinds) to `nba_score.honest_alt_targets`. No slip, score or screen reads that table. `pp_payout_map.py` (delta mode, the ~12:40 PT quote run) now quotes those legs FIRST inside its existing budget - order only, same number of quotes, nothing added to P3. Test run sh1 44687218894 on 2026-11-19: 1,617 priced goblin / demon rungs, 60 written (32 goblins, 28 demons), none of them carried a real quote before. About 6 weeks gives ~1,000 real quotes on model picks; the judgement then is their realised return at the real price.

## 8z. PASS 9 - MORE STRATEGIES BESIDE THE CANDIDATE (owner 22:30 PT "more strategies and more slips to do not depend on a single startegy"; written 22:34 PT, 2026-11-19)

`research_pass9.py`, run p9 44688483782. 17 ways to build a slip from the same certified legs, per app and structure, each with its overlap with the base slip (share of legs in common, correlation of the daily result). Kept: positive in every season (Underdog) / shown with the 2024-25 sign (PrizePicks). **Caution: 17 variants were tried and the survivors are shown - some of the gain is selection.** The baseline ranker, the other app's list and the rebounds slip were already leads before this pass (8v, 8y).

**Underdog 2-pick Standard** (ROI 2024-25 / 2025-26 / 2026-27):

| Strategy | ROI by season | Total | Drawdown | Drought | Legs shared with #1 |
|---|---|---|---|---|---|
| 1. top 2 by the blend (base) | +19 / +33 / +33% | +78.0 u, +28.7% | 8.5 | 6 | - |
| 2. top 2 by the honest baseline (no sportsbook input) | +27 / +31 / +45% | +85.0 u, +31.2% | 9.5 | 9 | 30% |
| 3. PrizePicks' top Unders, played on Underdog | +27 / +26 / +50% | +77.5 u, +28.8% | 11.0 | 10 | 28% |
| 4. top 2 rebounds Unders | +11 / +23 / +48% | +57.5 u, +21.5% | 15.5 | 11 | 25% |
| 5. top 2 Unders of home players | +7 / +11 / +33% | +32.5 u, +11.9% | 11.5 | 9 | 47% |
| 1-5 together (5 slips a slate) | +19 / +25 / +41% | +330.5 u, +24.4% on 1,353 slips | 35.5 | 3 | losing months 2 of 13, worst -2.5 u |
| 1 + 2 | +23 / +32 / +39% | +163.0 u, +30.0% | 15.5 | 6 | losing months 1 of 13 |
| 1 + 3 | +23 / +30 / +41% | +155.5 u, +28.7% | 15.0 | 6 | losing months 2 of 13 |

Rejected on Underdog: the "second team" (top 2 after removing the base players) -4.8%; points only +3.3% (2024-25 negative); assists only -14.2%; threes +5.5% (2025-26 negative); starters only +4.2%; Overs -2.2%; away players (two seasons negative); every 2-pick of the top 4 (-11% this season). Underdog 3-pick Flex: only the baseline ranker (+12 / +11 / +5%, +28.1 u) and rebounds (+5 / +6 / +4%) hold; thin.

**PrizePicks** (the base lost in 2024-25; variants that did not):

| Strategy | ROI by season | Total | Drawdown | Drought | Legs shared with the base |
|---|---|---|---|---|---|
| 5-pick Flex base | -6 / +33 / +127% | +69.2 u, +28.6% | 21.8 | 16 | - |
| 5-pick Flex, every leg a different prop | +4 / +42 / +78% | +77.4 u, +32.9% | 18.2 | 12 | 54% |
| 5-pick Flex, lines under 10 only | +15 / +26 / +91% | +68.0 u, +28.1% | 19.6 | 10 | 54% |
| 5-pick Flex, home players | +18 / +13 / +52% | +43.0 u, +17.8% | 23.8 | 12 | 48% |
| 6-pick Flex base | +0 / +60 / +85% | +92.2 u, +42.7% | 25.0 | 19 | - |
| 6-pick Flex, every leg a different prop | +3 / +78 / +194% | +137.6 u, +65.8% | 44.8 | 20 | 49% |
| 6-pick Flex, second team (none of the base players) | +34 / +10 / +65% | +50.0 u, +23.1% | 45.8 | 19 | 0% |
| 6-pick Flex, bench roles | +8 / +41 / +63% | +69.6 u, +32.5% | 26.6 | 15 | 68% |
| 6-pick Flex: base + different-prop + second team + home + rebounds (5 slips) | +9 / +38 / +98% | +370.0 u, +34.6% on 1,070 slips | 77.2 | 10 | losing months 5 of 13, worst -27.2 u |

PrizePicks 4-pick Flex and 3-pick Power: no variant is positive in 2024-25 except 4-pick "second team" (+38 / -7 / -4%). PrizePicks stays the weaker app: its sets are long-shot slips with 10-20 slate droughts.

## 8aa. PASS 10 - THE OWNER'S ELECTED SET RUN TOGETHER, AND WHAT A PLAYER CAP DOES (owner 22:54 / 22:57 PT; written 23:07 PT, 2026-11-19)

Owner's election (NOT live yet - his go-ahead pending): Underdog U1-U5, PrizePicks P1-P9, Sleeper S1 S4 S5 S6, Fliff F1 F4 F5, Betr B1 B5 (codes as in 8z / 8y). `research_pass10.py`, run p10b 44692205214; $10 a slip; a capped strategy takes ITS next leg.

| Cap (slips a player may sit in, per app) | Underdog | PrizePicks | Sleeper (this season) | Fliff (this season) | Betr (2025-26) |
|---|---|---|---|---|---|
| none (as elected) | +$3,330, +24.6%, drawdown $355, 2 losing months of 13 | +$6,155, +29.6%, drawdown $1,140, 3 losing months | +$509, +51% | +$639, +86% | +$460, +20.1% |
| 3 | +$3,155, +23.3%, drawdown $355, 1 losing month | -$615, -3.0%, drawdown $1,720, 7 losing months | +$521 | +$619 | +$505 |
| 2 | +$2,695, +19.9%, drawdown $320, 0 losing months | -$800, -3.9%, drawdown $2,015 | +$324 | +$623 | +$505, +21.0% |
| 1 | +$1,240, +9.2%, drawdown $385, 7 losing months | -$1,946, -9.5%, drawdown $2,739, 10 losing months | +$227 | +$333 | +$405, drawdown $115 |

Underdog + PrizePicks together, no cap: +$1,271 / +$5,918 / +$2,296 by season, total +$9,485, +27.7% on 3,430 slips (11.5 a slate), drawdown $1,052, worst 7 slates -$580, 2 losing months of 13. All five apps this season, no cap: +$3,444 on 507 slips (17.5 a slate), drawdown $443, worst 7 slates -$391; one player sits in 12.4 slips on an average slate (worst 19), 15 players carry 66 legs. A cap ACROSS apps (4 slips a player over the five) turns Sleeper, Fliff and Betr negative (-$90 / -$229 / -$420).
Reading: the edge is in the top few legs of the slate and nowhere else, so a cap swaps a good leg for a worse one. PrizePicks cannot take any cap (its 5- and 6-pick slips need the same top legs); Underdog takes a cap of 2 at a cost of about a fifth of the profit and with no losing month; the three small apps take a per-app cap of 2. The only way to reduce PrizePicks concentration is fewer PrizePicks slips, not a cap.

## 8ab. LIVE - THE ELECTED STRATEGIES ARE WIRED (owner 2026-11-19 23:11 / 23:13 PT; written 23:32 PT). First live slate: 2026-11-20.

Owner: "Go ahead and disable the current strategies and wire the new ones. We go with all elected. Stake is the same $10 for all but betr at $5." No caps. "same strategies go for Jon and Jessica with the same limits and specifics they had before".

**What runs.** `nba/honest_live_slip_engine.py` (gate `nba_config.classification_config['honest_live']`, enabled 2026-11-19 23:32 PT; `enabled = false` returns every app to the old strategies the next slate). Two soft steps in `nba-p3-afternoon-light.yml`: PrizePicks right after the old engine and its exposure step, BEFORE the PrizePicks slip quotes; Underdog / Sleeper / Fliff / Betr after every app's engine, before the screen is precomputed. If a step fails or an app's slips cannot be built, that app keeps what the old engine built.
- Legs: each app's own fresh window board through the old engines' own loaders (`live_slip_engine.load_board_legs_live`, `ud_live_slip_engine.load_legs`, `roi_app_live_slip_engine.load_legs`, `betr_live_slip_engine.board_legs`) - regular single-stat Unders, legs of started games left out.
- Ranking: blend = the walk-forward weights of the month (table `nba_score.honest_blend_weights`, written nightly by `research_leg_model_h.py`; 2026-11 values built in) on production's own `baseline_hp` of the leg (the live twin of the honest history's number: correlation 0.988 on this season's ladders, mean gap 0.02-0.03) and the sportsbook chance at the exact line.
- Slips (23 codes, as elected): Underdog `H` portfolio U1-U5 (2-pick Standard); PrizePicks `H_P1..H_P9` (Flex); Sleeper `H_S1_2max`, `H_S4_4flex`, `H_S5_4max`, `H_S6_5flex`; Fliff `H_F1_2max`, `H_F4_4max`, `H_F5_5max`; Betr `H_B1_3perfect`, `H_B5_3perfect_pp`. Stake weight 1 = the app's flat unit ($10; Betr $5). Next-ranked substitutes stored per strategy (`slip_next_legs`).
- Old strategies: NOT deleted. On an app this engine wrote slips for, the other strategies' slips of the day become not-played rows (PrizePicks `placed_shadow`; Underdog `shadow`; Sleeper / Fliff / Betr `shadow` with stake 0) - recorded and graded as paper, hidden from the screen.
- Friend pages (`friend_engine.py`): while the gate is on (from the 2026-11-20 slate) the page's own base / extra slips are not built; the owner's new slips are mirrored with the same variant leg, the same apps per person (Jessi: PrizePicks, Sleeper, Fliff; Jon: + Underdog; Betr on neither) and Jessi's top-4 cap. Underdog mirror now reads portfolio `H`.

**Proof before the switch.**
- Write path: `audit_honest_live_dry.py` (run hd3 44695350442, slate 2026-11-18) executed every statement and rolled back: 9 PrizePicks + 5 Underdog + 4 Sleeper + 3 Fliff + 2 Betr = 23 slips.
- Season replay of the LIVE engine on what was stored each day (`audit_honest_live_replay.py`, run hr1 44693943203, 29 slates, graded on box scores; a push / did-not-play voids the leg): Underdog 142 slips +90.0 u (+63%); PrizePicks 193 slips +265.2 u (+137%); Sleeper 93 slips +45.4 u (+49%); Fliff 68 slips +47.6 u (+70%); Betr 41 slips +19.5 u (+48%) - the first Betr numbers of this season (its live boards are stored as bookmaker `betr`; the research had read `betr_us_dfs`). Research on the same slates: Underdog +61 u, PrizePicks +169 u. Stored pick-time numbers are what the replay reads: 93 of 95 leg values equal the values written on the slips that day.
- Known: on a small Underdog board several of U1-U5 can be the same two legs (2026-11-18: four of five) - that is the no-cap choice.

**The old strategies this season, real graded slips (for "is anything worth saving?")**: Underdog T2 +11.1 u (17 slips), T1 +1.5 u (18), T3 -1.0 u (8); Sleeper S_ALL_5flex +15.8 u (29), S_F_3flex_R10 +3.2 u (14), S_C_5flex_U20 -0.3 u (14), S_D_6flex_U30 -4.9 u (8); Fliff F_A_5max_R15 +32.5 u (11), F_FR_3M +4.1 u (11), F_FR_X1 -1.3 u (10), F_C_5max_U20 -4.4 u (14), F_UDT1_3max_U_pm -8.3 u (14); Betr B_BRD_4dyn +3.0 u (17), B_ROI_5perfect -8.0 u (8). Their multi-season backtests are void (section 3); 8-29 slips each proves nothing either way. They keep being recorded as paper every slate, so they can be judged later on honest ground.

**To check on the first live slate (2026-11-20)**: P2B shadow list written; midday quote run orders the model's targets first; both honest steps ran in P3; PrizePicks quotes confirm the H slips; the Slips screen (owner's real Chrome) shows only the H slips with PLAY $10 / $5; friend pages mirror them.

## 8ac. PASS 12 - WHAT IS SALVAGEABLE FROM THE RETIRED STRATEGIES (owner 23:34 PT; written 23:37 PT, 2026-11-19)

Owner: "Do not show the old strategies anymore, on any screen mine, jessi or Jon." Done: their slips are not-played rows hidden from the Slips screen; the screen's note that named them is suppressed once the new slips are on it (`main_ui/slips.js`); the friend pages no longer build their own base / extra slips. To verify on the real screen on the first live slate.

The retired rules cannot be re-run honestly (they rank by a calibration fitted on the void history). Their CELLS can (`research_pass12.py`, run p12 44696127804: 15 prop groups x Under / Over / either x 2 rankers, regular lines, top of the slate; about 180 cells an app, so some positives are chance):
- **Underdog 2-pick Standard, positive in every season:** defensive props together (steals, blocks, turnovers, stocks) Unders by the blend +13 / +14 / +12% (+36 u, 265 slips), either side by the model +9 / +28 / +12% (+54 u); stocks either side +41 / +28 / +17% (+44 u, 138 slips); turnovers Unders +37 / +9% (+38 u, 204 slips, none this season - not on the board); points Unders by the model +15 / +15 / +25% (+44 u, 271 slips); rebounds Unders (already live as U4). 3-pick Flex: only rebounds Unders hold.
- **PrizePicks:** defensive props Unders, 3-pick Power +12 / +1 / +11% (+16 u, 272 slips), by the model +25 / +5 / +11% (+34 u); points either side 5-pick Flex +10 / +10 / +15% (+25 u, 242 slips). Nothing else.
- Not salvageable: every Over cell beyond those above, the combo props (pra, pts_reb, pts_ast, reb_ast) on both apps, goblins / demons (prices not known for history), and the old ranking itself.
Candidates if the owner wants more Underdog slips: U6 = top 2 defensive-prop Unders; U7 = top 2 stocks, either side; U8 = top 2 points Unders by the model. Not live.

## 8ad. PASSES 13-14 - IMPROVEMENTS SEARCH, AND THE SEASON DAY BY DAY (owner 23:44 / 23:53 PT; written 23:55 PT, 2026-11-19/20)

`research_pass13.py` (run p13b 44697647409), `research_pass10.py` with `P10_HALF=1` (run p14 44697985979), day-by-day from the live-engine replay hr1.
- **A. Closing line - NOT confirmed.** Sportsbook chance of our Under at the same line, slip time -> close: Underdog top 2 -0.11 pts (+/- 0.26, 453 legs; moved our way 41%, against 42%); PrizePicks top 5 +0.09 pts (+/- 0.19, 805 legs); the whole pool +0.10 / +0.08. The sportsbooks do not move toward our picks more than toward any Under. The edge is not one the market later agrees with - a caution on how durable it is.
- **B. PrizePicks half-point lines only - a real improvement as placed** (a whole-number line can push; a push drops the slip a size): 3-pick Power +17.2% -> +27.0% (+30 / +20 / +56%, +74 u); 4-pick Flex +10.0% -> +24.1% (+10 / +21 / +92%, +63 u); 5-pick Flex +23.9% -> +38.8% (+7 / +42 / +140%, +94 u); 6-pick Flex +40.9% -> +46.6% but 2024-25 turns -19%. By elected code with half points only (ROI by season): P1 -6 / +37 / +80; P2 +35 / +26 / +91; P3 +7 / +42 / +140; P4 -13 / +14 / +129; P5 -19 / +57 / +214; P6 +8 / +24 / +87; P7 +44 / +39 / +59; P8 -32 / +12 / +43 (total +$4); P9 +10 / +21 / +92; new P10 3-pick Power +30 / +20 / +56 (+$740). PrizePicks total +$6,584 on 2,351 slips. NOT applied live yet (owner's election stands until he says).
- **C. Price-shopping on Sleeper / Fliff:** taking the qualified legs by multiplier or by chance x multiplier is not better than by rank (29 slates). No change.
- **D. Easiest line across Underdog / PrizePicks:** no edge in the higher-line legs (Underdog -6.3% a leg, PrizePicks -1.2%); the base slips already never take a lower line. No change.
- **E. The app's own morning -> slip-time move (this season):** PrizePicks Unders whose line went DOWN hit 47.6% (317 legs, -12.1%), unchanged 51.9%; Underdog unchanged 55.9% (846 legs, +4.6%) against new-on-the-board 50.3% (576). Leads on one month.
- **F. April:** Underdog -5.5 u on 9 slips, PrizePicks +3.6 u on 20. No rule.
- **The elected set day by day this season** (live-engine replay, $10 a slip, Betr $5; 29 slates, 18.5 slips and $178 staked a slate): +$4,576 on $5,165 staked; 17 winning days, 11 losing, 1 flat; worst day -$210, best +$1,438; average losing day -$115, average winning day +$344; longest run of losing days 3; deepest drawdown $738 (4 drawdowns: $210, $85, $70, $738), 13 slates below the previous high and still below it on 11-18. Three days (10-26, 10-31, 11-02) made $3,923 of the $4,576; from 11-06 to 11-18 the set is -$513 over 13 slates. Longest runs of non-paying slips per strategy: U1 5, U2 5, U3 2, U4 5, U5 8; P1 4, P2 5, P3 3, P4 2, P5 5, P6 3, P7 4, P8 4, P9 3; S1 12, S4 8, S5 14, S6 3; F1 12, F4 14, F5 10; B1 7, B5 6.

## 8ae. PASS 15 - SECOND IMPROVEMENT BATCH (owner 2026-11-20 00:13 PT "Continue"; written 00:16 PT)

`research_pass15.py`, run p15 44700990153; PrizePicks on half-point lines (the live rule).
- **A. Morning filters - REJECTED.** This season, removing Unders whose line dropped since the morning or that were not on the morning board makes every live slip worse: Underdog 2-pick +9.5 u -> +3.5 / 0.0 u; PrizePicks 3-pick Power +15.0 -> +9.0 / +3.0 u; 5-pick Flex +30.8 -> +29.2 / +26.8 / +18.4 u; 6-pick Flex +42.8 -> +18.2 / +37.6 / +15.8 u. The leads of pass 13 E do not survive as rules.
- **B. Underdog 3-picks for bonus entries** (ROI 2024-25 / 2025-26 / 2026-27): Standard, top 3 by the MODEL alone +36 / +30 / +20% (+81.5 u, 263 slips, drawdown 19.5) - the best 3-pick found; top 3 rebounds +22 / +23 / +56% (+67.0 u, drawdown 25.0); top 3 by the blend +13 / +21 / +44% (+55.5 u, drawdown 28.5); by the model with different props +28 / +30 / +20% (+75.0 u). Flex, top 3 by the model +12 / +11 / +5% (+28.1 u, drawdown 12.2); by the blend +1 / +8 / +9%. Different props by the blend, lines under 10, home players: weaker or negative in a season.
- **C. Stake by strategy from earlier seasons - NO GAIN.** Doubling the strategies that were above the app's median in the seasons before: Underdog 2025-26 +27.7% against +25.0% flat, 2026-27 +39.2% against +39.4%; PrizePicks 2025-26 +29.2% against +30.7%, 2026-27 +109.8% against +103.2%. Flat stays.
Candidate for the owner: U6 = Underdog 3-pick Standard, top 3 by the model, for bonus entries only (his 2026-11-08 rule allows a 3-pick Standard or Flex for bonuses). Not live.

## 8af. U6 LIVE; PASS 16 - THE WHOLE GRID ON THE LIVE RULES (owner 2026-11-20 00:25 PT; written 00:33 PT)

Owner: "Standard top 3 rebounds under is deployable. Nothing stands for pp or other app? Continue with any open angle". **U6 = Underdog 3-pick Standard, top 3 rebounds Unders** added to the live engine (commit 9ebba54; write path re-tested, run hd5 44702581675: 24 slips). Live set: U1-U6; P1-P7, P9, P10; S1 S4 S5 S6; F1 F4 F5; B1 B5.

`research_pass16.py` (runs p16 44702570547, p16b 44702989271): 3 rankers (blend, model, their average) x 8 prop pools x 7 layers (home / away / starters / bench / lines under 10 / 10+) x plain / different props / second team x every structure 2-6. 3,591 cells an app; positive in EVERY season: Underdog 161 (4.5%), PrizePicks 100 (2.8%) - a share of these is chance; read the themes, not single cells.
- **PrizePicks (half-point lines) - what stands:** lines under 10: 5-pick Flex +35 / +27 / +91% (+85.6 u, drawdown 19.4; live as P2), with no assists +25 / +38 / +127% (+100.8 u), 5-pick Power +71 / +59 / +173% (+178 u, drawdown 33); 3-pick Power top 3 +30 / +20 / +56% (live, P10); 4-pick Flex top 4 +10 / +21 / +92% (live, P9); 6-pick Flex by the AVERAGE of the two rankers +22 / +25 / +216% (+89.6 u, drawdown 26.0) where the blend alone (live P5) is -19% in 2024-25; 5-pick Flex by the average +12 / +25 / +111% (+68.8 u, drawdown 16.2); 5-pick Flex rebounds +13 / +29 / +42% (+58.2 u, drawdown 19.0); bench 6-pick Flex +44 / +19 / +59% (live, P7); 6-pick Flex different props +8 / +26 / +85% (live, P6). Live codes NOT positive in 2024-25 under the half-point rule: P1 (-6%), P4 (-13%), P5 (-19%).
- **Underdog - what stands beyond U1-U6:** 4-pick Flex, top 4 rebounds +27 / +23 / +43% (+63.0 u, 241 slips, drawdown 14.4); 3-pick Standard by the average, no assists +28 / +47 / +20% (+101 u, drawdown 16.0); 4-pick Standard rebounds +30 / +46 / +100% (+107 u, drawdown 30). Assists Unders are the weak prop on both apps ("no assists" pools recur).
- **Betr - weak.** Graded on Betr's own lines for both seasons (130 + 22 slates; this season's boards are stored as bookmaker `betr`): on the Underdog or PrizePicks order nearly every Perfect / Dynamic cell is negative (PrizePicks order: 3-pick Perfect +11 / +5%, +14 u on 145 slips; 2-pick -9 / +12%; Dynamic 3-5 negative). B1's +28.8% (2025-26, qualified legs) does not generalise. Betr is the least supported app.
- **Sleeper / Fliff:** nothing new can be proven - 29 real slates; their live slips ride the Underdog / PrizePicks lists.

## 8ag. PASS 17 - OTHER WAYS TO RANK (owner 2026-11-20 00:37 PT; written 00:46 PT)

`research_pass17.py`, run p17 44704947048. Eight new rankers (sportsbook alone, small gbm, the lower of model and sportsbook, model minus sportsbook, sportsbook minus model, rank sum, model x2 + sportsbook, geometric mean) x 6 pools x every structure; 540 cells an app.
- **Underdog: nothing beats the model / the blend.** 2-pick Standard, every single stat: sportsbook alone +3 / -10 / +4% (-11 u); small gbm -9 / +2 / -16%; lower-of-both +7 / -3 / +4%; model minus sportsbook +15 / +6 / -35%; geo mean +11 / +22 / +17% (+48 u); against the blend +19 / +33 / +33% (+78 u) and the model +27 / +31 / +45% (+85 u). 37 cells positive every season, none better than what is live.
- **PrizePicks: two new things stand.** (1) Rebounds ranked by the geometric mean of model and sportsbook: 5-pick Flex +26 / +31 / +38% (+70.8 u, 238 slips, drawdown 16.8); 6-pick Flex +45 / +39 / +59% (+89.2 u, 209 slips, drawdown 21.4); 4-pick Flex +11 / +16 / +14%; 5-pick Power +48 / +48 / +82% (+122 u, drawdown 46) - the most even PrizePicks result across the three seasons so far. (2) The small gbm as ranker: 5-pick Flex every single stat +38 / +18 / +31% (+62 u, drawdown 32.6); 6-pick Flex lines under 10 +85 / +21 / +65% (+98.8 u, drawdown 28.0); 5-pick Power +71 / +30 / +82% (+118 u, drawdown 58). The small gbm is not computed live yet (needs the tree model served at slip time). On the main 5-pick Flex the sportsbook alone is -6 / -15 / +111% and sportsbook-minus-model -14 / -41 / -64%: where the books like an Under more than the model does, it loses.
Candidates: P11 = PrizePicks 5-pick Flex, top 5 rebounds by the geometric mean; P12 = the 6-pick Flex of the same. Not live.

## 8ah. FALLBACKS TRIMMED; PASSES 18-19 - TRAILING FORM, SECOND / THIRD SLIPS, A TRAILING GATE (owner 2026-11-20 09:23 PT; written 09:45 PT)

**Live change (09:26 PT, commit 9b89f0d).** Owner: "For Sleeper, Flip, and Better, you can drop the fallbacks. Let's not keep anything that's negative." The Sleeper (S21, S22), Fliff (F21, F22) and Betr (B21-B23) thin-board fallbacks are removed from `honest_live_slip_engine.py`; those apps build fewer slips on a thin day. Underdog (U21) and PrizePicks (P21-P27) fallbacks stay (both positive on the season replay).

**Pass 18** (`research_pass18.py`, run 44783300407; 8,550 cells an app). Same legs as the live set. Trailing form = the player's earlier games only, at the leg's own line.
- **Leg level, trailing form carries almost nothing.** Hit rate by share of the last 10 games under the line: under 30% -> 49.9%, 30-50% -> 51.4%, 50-60% -> 52.3%, 60-70% -> 52.2%, 70-80% -> 51.7%, 80%+ -> 53.0% (all legs 51.8%). Back-to-back 52.5%, minutes rising 52.4%, minutes falling 51.5%, last game over 52.0%.
- **Second and third slips of the same ranking: rejected.** Main slip, slips #1 / #2 / #3: Underdog 2-pick Standard by the blend +78.0 / -13.0 / +43.0 u (272 each), by the model +88.5 / +11.5 / -20.0 u; PrizePicks 5-pick Flex by the blend +93.2 / -52.8 / -58.6 u, by the model +47.6 / -7.6 / +1.0 u. The edge sits in the top legs; more slips must come from a DIFFERENT pool or ranker (as the live set does), not from deeper in the same list.
- **Trailing gate on a strategy's own results: rejected.** Underdog main slip is positive both when its last 5 / 10 / 20 slips are up and when they are down (blend: +53.0 u on 157 vs +26.5 u on 110 at 5) - a gate only removes profit. PrizePicks: no consistent side either.

**Pass 19** (`research_pass19.py`, run 44784686958) - neighbours of every trailing layer against no layer, and 40 random half-layers as the luck yardstick. **Pass 19b** (run 44785779436) - the one lead pressed harder.
- **PrizePicks: every trailing layer rejected.** "Last game over" looked huge on 6-pick Power (+146%) but the legs it picks hit LESS (55.2% vs 56.6%), 2- to 5-pick slips get worse, and random half-layers reach +93% on the same slip. Same verdict for last-5 / last-10 share, minutes falling.
- **PrizePicks, "20+ earlier games" (drop players with under 20 logged games):** small and steady, not proven - blend, every stat: 6-pick Flex +35% (2 of 3 seasons) -> +45% (3 of 3), 6-pick Power +40% (2) -> +58% (3), 5-pick Flex +39% -> +35%; legs hit 56.6% both ways. Inside the noise of a random layer. Not proposed.
- **Underdog, ONE LEAD: last-10 share 60%+ under the line, ranked by the model or the average (not the blend), 4-pick slips.** 4-pick Flex, average, no assists: no layer +9% (+23.2 u on 250) -> with the layer **+47% (+115.8 u on 249), seasons +31 / +51 / +73%, drawdown 9.8 u, odd days +43% / even days +50%, 5 of 6 half-seasons up, +84.8 u without the 5 best slips**; neighbours agree (last-8 60%+ +39%, both windows +52%; model rank +44%). Random half-layers on a 4-pick Flex: median +5%, best of 40 +31%. Against it: the legs used hit only 57.0% vs 56.1% without the layer, the blend ranker shows no gain, and most of the gain is the second half of 2024-25. Status: LEAD offered to the owner as U8 (4-pick Flex; Underdog rule kept), not proven like U1-U5.
- Method note added to section 10: a layer is judged by (a) the hit rate of the legs it picks, (b) its neighbours, (c) random layers of the same size - not by its best slip structure.

## 8ai. OWNER'S STANDING RULE FOR NEW FINDINGS; PASSES 20-21 - GAME ENVIRONMENT, OPPONENT, VOLATILITY, THE OTHER APP'S LINE (owner 2026-11-20 10:37 PT; written 10:44 PT)

**Owner's rule (10:37 PT), applies to NEW findings only:** research runs without asking permission, on every app. A new strategy at **0 to about 25-30% return goes in as a FALLBACK, as long as it stays positive as a fallback; negative is dropped; above 25-30% it can go live**, unless an app then has too many - in that case the least positive ones move down to fallback. **"Do not change anything on the previous ones that I told you unless I say so"** - the elected slips stay main slips even where an app is tight (it is the best that app has). U20 therefore stays a fallback (his 09:46 instruction) until he says otherwise.

**Pass 20** (`research_pass20.py`, run 44794778869). New factors, each cut in thirds and judged the pass-19 way against no layer: morning game total, team spread (favourite / underdog / close), team implied points, what the opponent allowed in this stat over its last 15 games, opponent pace, team pace, the player's volatility in the stat, the line against his last-20 mean (also as a ranker).
- Leg level: nothing moves the hit rate by more than about one point. Largest: tough opponent (allows less of this stat) 52.7% vs soft 51.6% on Underdog, 52.6% vs 51.2% on PrizePicks; slow opponent 52.7 / 52.5% vs fast 51.6 / 51.0%.
- Slips: **no layer beats "no layer" on either app in any consistent way.** Every third of every factor gives fewer and weaker slips than the unfiltered ranking (e.g. PrizePicks blend 5-pick Flex: none +39% (3 of 3 seasons); tough opponent -29% (0), soft opponent +4% (2)). The ranker "line furthest above his form": Underdog 2-pick +3% (1 season), PrizePicks -22% (0). All rejected.

**Pass 21** (`research_pass21.py`, run 44795227038). The cell the honest scan kept at leg level (Underdog line above PrizePicks' line) as slips: gap as layer and as ranker, both apps. Rejected: Underdog 2-pick Standard with its line +0.5 or more above -11% (1 season), +1 or more +2% (2) on 89 slips; "gap first, then blend" +4% (1) against +29% (3) for the blend alone; PrizePicks every gap layer negative. Too few legs carry a gap (about 4% of Underdog legs) to build slips from.

**Reading of passes 18-21 together:** the edge is in the TOP of the blend / model ranking itself. Filters on top of it (form, environment, opponent, volatility, other app's line) and deeper slips from the same list all cost. New slips have to come from a different pool of legs or a different ranker, which is how the live set was built.

## 8aj. PASSES 22-23 - CONSENSUS OF THE RANKERS; THE ONE-LEG-A-GAME RULE -> U8 LIVE (written 10:59 PT, 2026-11-20)

**Pass 22** (`research_pass22.py`, run 44795673691). Four opinions on a leg (blend, model, sportsbook chance, small gbm) combined: mean of four / three, Borda with three / four, worst rank, best rank, and "top 10 / 15 / 20 / 30 of every opinion" as a layer. Verdict: **as good as the blend and the average, not better.** Underdog mean-of-three is positive in 3 of 3 seasons on almost every structure (no assists: 2-pick Standard +31%, 4-pick Flex +24%, 5-pick Flex +24%) but the legs it uses hit 55.1% against 54.7-55.4% for the live rankers and its 2-pick is the same slip as U1 / U2. The "top N of every opinion" layers halve the number of slips for the same return. **The small gbm is NOT worth building for live use** (it only matters inside a mean; alone it loses) - that open point is closed.

**Pass 23** (`research_pass23.py`, run 44796151419; pressed harder in `research_pass23b.py`, run 44796522931). Every live slip took one leg a game. Tested: 2 a game, 3 a game, no limit, 1 a team.
- **PrizePicks: keep one a game.** Allowing two costs: legs hit 57.7% -> 55.9%, 5-pick Flex by the blend +39% -> +28%, 6-pick Flex +35% -> +14%. Its board is large; the rule costs nothing there.
- **Underdog: the rule costs the 4-pick.** Underdog's board is small, so one-a-game pushes a 4-pick deep into the ranking. 4-pick Flex, one a game -> two a game, all six ranker x pool pairs improve: blend / every stat +16% -> +22%; **blend / no assists +17% -> +33%**; model / every stat +17% -> +28%; model / no assists +9% -> +16%; average / every stat +9% -> +26%; average / no assists +9% -> +23%. 3-pick Flex unchanged; 2-pick slightly worse (+29% -> +23%, stays one a game); 6-pick gains rest on a few jackpots (negative without the 5 best) - not used. Rebounds 4-pick (U7) is better with one a game (+26% vs +17%) - unchanged.
- **The pick: 4-pick Flex, blend, no assists, up to two legs a game: +27 / +34 / +43% by season, +33% pooled, +89.0 u on 272 slips (one every slate), drawdown 11.4 u, 6 of 6 half-seasons up, odd days +18% / even days +47%, +58.0 u without the 5 best slips, 43% of slips paid, legs hit 56.7%.** On the 171 days where the two rules build a different slip: +44.6 u against +17.2 u.

**LIVE (owner's rule of 10:37 PT - a new strategy above 25-30% goes live): U8** = Underdog 4-pick Flex, top 4 Unders by the blend, no assists, no Prediction legs, at most two legs a game (so always 2+ games; `pick(..., gcap=2)`), commit 8967f94. Underdog's target is now 8 slips (fallbacks U20, U21 fill a thin board). Write path tested on 2026-11-17 (hd10 44796860461: 24 slips rolled back). Season replay of the live engine (hr6 44796872650): U8 29 slips, +3.0 u (+10.3%), legs hit 62 of 111; Underdog total 230 slips, +114.1 u.

## 8ak. PASS 24 - SLEEPER, FLIFF, BETR ON THEIR OWN BOARDS -> S7, S8, F6, F7 AND THREE POSITIVE FALLBACKS LIVE (written 11:36 PT, 2026-11-20)

`research_pass24.py` (run 44801672969) and `research_pass24b.py` (run 44802280781, by season and price source). **Data limits:** Sleeper and Fliff boards exist for 185 slates, but their multipliers are REAL only in 2026-27 (29 slates); 2025-26 (156 slates) carries modelled multipliers, which can flatter a slip by roughly 4% a leg (rule C9). Betr: table-priced, 130 + 23 slates. A blind player on these boards loses 9-35% (Sleeper 2-pick Max -16%, Fliff -10%, Betr -27%).
Sources tried: the 7 qualified legs (live), top 10 + top 10, Underdog's order, PrizePicks' order, the app's own board by the blend / the model; pools every stat / no assists / rebounds; one or two a game; every slip size.
- **PrizePicks' own order played on the app beats the 7 qualified legs on 4- and 5-pick Max, both seasons** (2025-26 modelled / 2026-27 real): Sleeper 4-pick Max +42% (140 slips) / +135% (25) against the live S5 +8% / +100%; Sleeper 5-pick Max +59% (131) / +227% (22) against +57% (83) / +138% (21); Fliff 4-pick Max +53% / +154% against the live F4 +17% / +116%; Fliff 5-pick Max +64% / +234% against F5 +61% / +143%. All four stay positive without their 2 best slips in both seasons. It also builds a slip on about 50 more slates, because it can go deeper than 7 legs.
- **Two legs a game:** no steady gain on these apps (4-pick Max Sleeper +22% -> +17%, Fliff +32% -> +26%). Not used.
- **2-pick Max on the qualified legs without assists:** Sleeper +10% / +50%, Fliff +16% / +59% (154 / 29 slips) - fallback range.
- **Betr:** 37 of 136 cells positive, 16 in both halves. Only the 3-pick Perfect holds: live B1 +17% / +31%; without assists +22% (108) / +16% (19) - fallback range. 2-pick Perfect -6% / +12%: still negative overall, stays out.

**LIVE under the owner's 10:37 rule (commit 9c37b8c).** Built after the elected slips, only when their legs differ from a slip the app already has: **Sleeper S7** 5-pick Max and **S8** 4-pick Max, **Fliff F6** 4-pick Max and **F7** 5-pick Max, all in PrizePicks' order played on the app. Fallbacks (thin board only): **S21 / F21** 2-pick Max on the qualified legs without assists, **B21** Betr 3-pick Perfect without assists. Targets: Sleeper 6, Fliff 5, Betr 2. No elected slip changed. Write path tested on 2026-11-17 (hd11 44802979527: 28 slips rolled back).
Season replay of the live engine, real prices (hr7 44802992316): S7 12 slips +7.1 u (+59%); S8 7 slips +2.5 u (+36%); S21 24 slips +6.6 u (+27%); F6 7 slips +3.4 u (+48%); F7 12 slips +7.6 u (+64%); F21 24 slips +8.5 u (+35%); B21 did not fire. Sleeper 137 slips +61.9 u (was 94, +45.7 u); Fliff 112 slips +66.1 u (was 69, +46.6 u); Betr 41 slips +19.5 u.

## 8al. PASS 25 - UNDERDOG TWO-A-GAME: WHAT ELSE BESIDE U8 (written 11:57 PT, 2026-11-20)

`research_pass25.py` (run 44805769174): 288 cells (3 rankers x 12 pools x 3S / 3F / 4F / 5F x one / two a game); 61 positive in every season; 36 also positive without their 5 best slips with 5+ of 6 half-seasons up. Each cell also reports how often its slip is U8's slip.
- **Flex slips that are NOT U8:** 4-pick Flex by the MODEL, every single stat, two a game: +46 / +8 / +72%, +28% (+74.8 u on 272), drawdown 17.2, 5 of 6 half-seasons, +43.8 u without the 5 best; shares 3+ legs with U8 on 12% of slates. 4-pick Flex by the average, no assists, two a game: +19 / +15 / +72%, +23% (+61.4 u), drawdown 12.4, 6 of 6. 4-pick Flex by the model, every prop different, one a game: +24%. 5-pick Flex: nothing passes. 3-pick Flex: +9 to +11% at best.
- **3-pick STANDARD (allowed on Underdog for bonus entries only - owner's rule; offered, not wired):** blend, no assists, two a game +33 / +47 / +57%, +43% (+118.0 u on 272), drawdown 14.0, 6 of 6 - but it is the top 3 legs of U8; model, every prop different, two a game +40 / +30 / +39%, +34% (+93.0 u on 271), drawdown 20.0 - the most even one and a different slip from U8 (3+ shared legs on 2% of slates).
- **Wired:** fallback **U22** = 4-pick Flex by the model, every single stat, no Prediction legs, two a game (the +28% one; borderline of the owner's 25-30% line, so fallback, between U20 and U21), commit 7d3523f. Write path tested (hd13 44806081363: 28 slips rolled back). Season replay (hr9 44806093252): U22 fired once (+6.2 u); Underdog 230 slips, +120.2 u.
- Betr in PrizePicks' order, 3-pick Perfect: +11% / +5% (pass 24b) - that is what B5 already is; nothing new.

## 8am. PASS 26 - TRAILING RESULTS OF THE PLAYER, THE PROP AND THE RANKING (written 12:19 PT, 2026-11-20)

`research_pass26.py` (run 44810026843). The trail here is the RESULT OF EARLIER LEGS on the app (pass 18 used the game log): the player's last ~8 / ~15 Under legs (hot 60%+, cold 40% or less, no record), the prop's top legs over the last 10 / 20 slates (hot / cold), the app's top-10 legs over the last 5 / 10 / 20 slates (is the ranking on a run). 17 layers x blend / average x every stat / no assists, every structure, against no layer.
- Leg level: a "hot" player's next Under hits 53.0% on Underdog and 51.8% on PrizePicks against 51.6% for a "cold" one - nothing.
- **Rejected, all of it.** Underdog 2-pick Standard by the blend: none +29% (3 of 3 seasons); player hot +14% (2); player cold -5% (1); prop hot (20 slates) +18% (3); prop cold +17% (3); ranking hot (10 slates) +15% (2); ranking cold +55% (3) but on 52 slips. PrizePicks 5-pick Flex: none +39% (3); every player / prop layer lower (-20% to +21%). The 10-slate and the 20-slate versions of the prop trail point in OPPOSITE directions (10 slates: cold props better; 20 slates: hot props better) - the mark of noise.
- Ranking on a cold run (last 5 slates under 50%): higher returns on Underdog (2-pick +44%, 4-pick Flex no assists +40%) but 56 slips in three seasons, and pass 18 already showed both sides of the gate are positive. No gate.

## 8an. PASS 27 - MORE COMPOSITIONS FOR SLEEPER, FLIFF, BETR -> S10, S11, F9, F10, B6 LIVE (owner 2026-11-20 12:20 PT; written 12:32 PT)

Owner 12:20 PT: "Keep going ... more ROI ... new strategies ... different compositions, and especially for the other apps that we have less. But ... to do all of them."
`research_pass27.py` (run 44810619522): 6 sources (the 7 qualified legs, top 10 + top 10, Underdog's order, PrizePicks' order by the blend / the average / the model) x 14 pools (props, home / away, line size, multiplier size) x "every prop different" x every slip size, Betr Dynamic 3-6 included. Kept: positive in BOTH seasons and still positive without the best slips (2 of 2025-26, 1 of 2026-27). Sleeper 78 of 918 cells, Fliff 77 of 510, **Betr 8 of 720**. Sleeper / Fliff: 2025-26 on modelled multipliers, 2026-27 (29 slates) real. Betr: real in both.
- **3-pick, PrizePicks' order, no assists, every prop different** (the first leg of each prop only): Sleeper Max +35% (128 slips; +33.1 u without the 2 best) / +92% (22; +14.4 u without the best); Fliff Max +36% (128) / +94% (22); **Betr Perfect +60% (103 slips; +53.0 u without the 2 best) / +53% (18; +5.0 u)** - the best Betr result so far and on real prices in both seasons (its neighbour with assists allowed: +34% / +38%).
- **2-pick Max, PrizePicks' rebounds order:** Sleeper +24% (152; +31.3 u without the 2 best) / +38% (29); Fliff +31% (152) / +46% (29).
- Not wired: 6-pick Max in PrizePicks' average order (Sleeper +85% / +208%, Fliff +97% / +225%) - pays about 1 slip in 20 and six modelled legs inflate 2025-26 the most; Betr 4-pick Dynamic, every prop different (+18% / +68%) - the Betr writer has no Dynamic slip yet; the "multiplier under 1.8" pools (+20% / +168%) - 2025-26 multipliers are modelled, so a multiplier cut cannot be trusted there.

**LIVE under the owner's rule (commit 5425cb5):** **S10 / F9** 3-pick Max and **B6** 3-pick Perfect (PrizePicks' order, no assists, every prop different); **S11 / F10** 2-pick Max (PrizePicks' rebounds order). Built after the earlier slips, only when the legs differ from a slip the app already has. Targets: Sleeper 9, Fliff 8, Betr 3 (B21 stays the Betr fallback). No elected slip changed. Write path tested on 2026-11-17 (hd15 44811318521: 34 slips rolled back).
Season replay of the live engine, real prices (hr11 44811329596): S10 23 slips +32.4 u (+141%), legs hit 48 of 68; S11 23 slips +13.4 u (+58%); F9 23 slips +33.2 u (+144%); F10 23 slips +15.5 u (+67%); B6 19 slips +19.5 u (+103%), legs hit 38 of 55. Totals: Sleeper 186 slips +107.5 u; Fliff 161 slips +114.8 u; Betr 60 slips +39.0 u.

## 8ao. PRIZEPICKS GOBLIN / DEMON MULTIPLIERS MAPPED; PASS 28 - ARE THEY WORTH PLAYING (owner 2026-11-20 13:09 / 13:20 PT; written 14:44 PT)

**The sweep.** Owner 13:20 PT: quote every goblin / demon rung on today's board, several probes at once, today. Round 1 (13:34 PT): six slices, delta mode, ~1,030 quotes each (one slice stopped at the end on three consecutive blocks). Round 2 (14:18 PT): two delta slices for what was missed + four `sweepless` slices for the Less side. Quotes stored for 2026-11-20 by 14:45 PT: **demon More 3,634, goblin More 2,334, demon Less 399, goblin Less 472 = 6,839 rungs, 127 players** (the board had ~6,500 alt rungs on More; over 90% covered). No AI model runs in the probes (GitHub runners + a real Chrome); the cost is proxy traffic only.

**What the multiplier is.** PrizePicks' per-leg factor (2-pick Power = 3 x f1 x f2) sits on a fixed grid: demon More 1.083..3.000 in steps of 1/12, then 3.092..6.942 in growing steps (45 values); goblin More 0.633..0.967 in steps of 1/30 (11 values); goblin Less uses the demon grid (1.083..1.583), demon Less the goblin grid (0.767..0.967). **The rung's distance from the standard line does NOT set it** - rung 1 alone spans 1.083..6.942. **The sportsbooks' chance of that exact rung does**: log(factor) against log(book chance) correlates -0.99 (demon More), -0.92 (goblin More), -0.90 / -0.92 (Less sides). Rule: factor = exp(a) x p_book^b, per kind and side (today's fit: demon More a -0.571, b -0.834; goblin More -0.604, -0.850; demon Less -0.515, -0.732; goblin Less -0.468, -0.733).
- Held-out test, today (fit on 80%, predict 20%): median error demon More 2.5%, goblin More 1.8%, demon Less 1.7%, goblin Less 2.1%; 90th percentile 4.1-7.4%; 80-95% of legs within 5%.
- **Out of time (fit on Oct 20 - Nov 19 quotes, predict today's): median error 4.5% / 2.1% / 1.9% / 2.9%, 90th percentile 6.2-8.9%, bias +3% on demon More, under 1% elsewhere** - the rule holds from day to day.
- Against the stored modelled price on today's same legs: median error demon More 8.4% (90th 21%), goblin More 4.9% (90th 9.6%), goblins priced 5% too low. **The book-chance rule is 2-3 times more accurate.** Limit: it needs a book line at the exact rung (632 of 3,634 demon More legs today); the rest still need a quote or the stored model.
- What it means for value: factor x book chance averages 0.47 on demon More, 0.51 goblin More, 0.52 demon Less, 0.50 goblin Less; a regular line is 1.0 x ~0.50. A 2-pick leg breaks even at 0.577 (1/sqrt 3). So PrizePicks prices goblins and the Less sides about like regular lines and demons on More about 6% WORSE; any edge must come from the model beating the books on that rung by 14% (goblins) to 23% (demons) in relative terms.

**Pass 28** (`research_pass28.py`, run 44828810265): real-quoted legs graded on their real result (5,448 legs with a model chance, 28 days, More side; Less side has ~110 graded legs a kind, too few). Return a leg on the 2-pick basis:
- **Demons More: negative everywhere.** All -39%; rung 2 (easiest) -17%, rung 3 -38%, rung 4 -61%; easiest fifth by factor (1.08-1.17) -16%; model's top fifth by chance -10%; the model's "predicts a profit" bucket -17% (+/- 14).
- **Goblins More: negative everywhere but one bucket.** All -13%; rung -3 (easiest) -9%, -2 -11%, -1 -16%; model chance 74%+ -4%; the model's "predicts a profit" bucket **+2.7% (+/- 8) on 212 legs** - not different from zero. The honest model UNDER-rates goblin legs by about 7 points (said 58%, hit 66%).
- A 2- or 3-pick of legs that each lose 9-17% loses roughly 20-40%. **Verdict: no goblin or demon slip is worth playing on this evidence; not wired.** Re-test the Less sides once tonight's ~870 Less quotes are graded, and the goblin "model predicts a profit" bucket as quotes accumulate.
- Defect: the pass's one-slip-a-day section printed no rows (fewer than 8 slips found per cell) - to fix; the leg-level result already decides it.

## 8ap. PRIZEPICKS SLIP PRICING WITH GOBLINS / DEMONS - POWER MAPPED, FLEX NOT (owner 2026-11-20 15:45 PT "more runners, more parallel probes, we need to get it today"; written 16:33 PT)

**Probes.** 15:47 PT: 20 parallel runs (stack x8, multi x8, slips x4); 16:16 PT: 14 more (slips x8, stack x6). New real quotes: STACK ~2,900, MIXED (one alternate + standards, sizes 3-6) ~1,200, plus 2-pick legs. No AI model in the probes.
**Scripts:** `research_ppfit1.py` .. `research_ppfit6.py` (read-only).

**What PrizePicks does (proven on real quotes):**
1. A leg's 2-pick price does not depend on its standard partner (different partners within a minute: 100% identical).
2. Prices drift through the day (same leg: 96% identical within 10 min, 64-93% within an hour, ~50% across 6 h). Every comparison must use quotes taken minutes apart.
3. Payouts are rounded to a grid: 0.1 below 3x, 0.25 to 10x, 0.5 to 50x, 1 above.
4. One number per leg sets every size: from a leg's 6-pick payout, its 2-, 3-, 4- and 5-pick payouts are predicted 78-90% exactly and 98-100% within one grid step (median error 0.6-1.2%, bias 0); goblin vs demon and More vs Less add nothing once that number is known.
5. A lineup with any goblin / demon is priced on ADJUSTED bases, not the 6 / 10 / 20 / 37.5 table: at a factor of 1 they are about 5.36 (3-pick, -11%), 10.2 (4-pick, +2%), 19.2 (5-pick, -4%), 36.6 (6-pick, -2%). The size step also grows with the leg (a big demon scales up more than a goblin), so "base x 2-pick factor" is wrong by 0.80-1.25 on single slips - that is what made earlier goblin / demon slip numbers untrustworthy.
6. Several alternates combine through the SUM of their log 2-pick factors (one strength per slip), then the per-size curve.

**Accuracy from what history holds (each leg's 2-pick quote only; out-of-day test, 8 days):** Power 3-pick median error 2.2% (p90 5.5%), bias +0.1%; 4-pick 2.1% (5.9%), +0.1%; 5-pick 2.2% (7.2%), +0.2%; 6-pick 2.3% (7.1%), +1.5%. Exact to the cent 22-50% - the 2-pick reading itself is rounded (+/-2-4%), so cent-exact prediction from history is not possible; live slips are priced by PrizePicks' own quote (slipq) before they show, which is exact.
**Flex with goblins / demons: NOT mapped.** Flex tiers are not a function of the leg strength alone (top tier within one step only 36-82%; lower tiers 60-80%); the lower tier is chosen on a coarse grid and the top tier moves with it. Flex results for goblin / demon slips can only come from real quotes.
**Value consequence (Power):** the adjusted bases make 3-pick goblin / demon Power about 11% worse than "6 x factors" and 5- / 6-pick 2-4% worse; with pass 28 (every More tier loses per leg), no goblin / demon Power slip is worth playing. Not wired.

## 8aq. GOBLIN / DEMON LEG MULTIPLIER - REVERSE-ENGINEERING PROGRAM (owner 2026-11-20 17:08 PT; written 18:08 PT)

**Owner's instruction (verbatim gist):** every goblin / demon leg must carry a proper multiplier like a regular line, so each has an implied ROI.
The ladder is anchored at the regular line or the switch point (tier 0); goblins / demons are tiers 1, 2, 3 ... each side, More and Less.
The multiplier per tier is NOT fixed - known factors: the tier; where the regular line sits (32.5 vs 15.5); no regular line (switch point only);
player form (0.5 blocks for a player with none vs one with 1-2 recently); ladder density (many rungs vs one goblin + one demon) - and maybe more.
Method: probe one leg with regulars until understood, then vary prop / line / player / form; then mix goblin+goblin, demon+demon, goblin+demon,
+ regulars; reverse-engineer every factor until the multiplier is very close.

**Results so far (scripts research_ppmult_factors.py, _factors2.py, _mech.py, _book.py; 19,313 real leg quotes, 31 days, every quote joined to
the board of the same probe run):**
- Partner-invariant; re-quoted with the ladder unchanged: changes 1.8% within 30 min, 14% at 30-120 min, 33% at 2-6 h; with the ladder moved: 64%.
  So the multiplier follows a hidden input that moves during the day.
- PrizePicks' values are its 2-pick payout rounded (goblin More 1.9-2.9 in 0.1 steps = factor 0.633-0.967; demon More 3.25.. in 0.25 steps,
  capped at 6.94 x factor; demon Less 0.567-0.967; goblin Less 1.083-2.667). Demon More floor 1.083 even when the market says ~50%.
- Factor-by-factor (out-of-day, exact value): kind/side/rung alone 13.5%; + distance from the anchor (units, relative, per sqrt(anchor), steps)
  34%; + anchor level, regular vs switch, ladder shape 36%; + stat 37%; minutes before tip adds nothing. Player form (season / last-10 /
  last-5 average and spread, share of games over the line) adds NOTHING once distance and anchor are known. Strongest single driver:
  distance from the anchor divided by sqrt(anchor) (a count-like spread).
- Sportsbooks' chance of the exact line, same hour (all books, de-vigged, interpolated across each player's alt ladder): corr -0.96 (demons),
  -0.94 (goblins); FanDuel's own alt ladder -0.99 (few exact matches). Market chance alone 33% exact; ladder + stat + market 41% exact,
  64% within ~one step, median error 3.7%. A hidden-projection negative-binomial model per ladder: 20% exact (rejected as specified).
- Limits found: the book snapshot is once a day (13:22 PT) while PrizePicks moves through the day; only Bovada / FanDuel / Underdog carry alt
  ladders; PrizePicks rounds to 0.1 / 0.25 steps, so exact needs the hidden input to within ~1-2%.

**Next (2026-11-21):** time-aligned full-ladder sweep starting right after P3 (13:35 PT, within 15 min of the books' snapshot): every rung of
every ladder, both sides, quoted in the same minutes; then single-leg + regulars ladders (sizes 2-6) and goblin/demon mixes; refit with
the fitted distribution of each player's book ladder (not linear interpolation), per-book source test, and the floor / cap rules.

## 8ar. OWNER'S METHOD RUN TONIGHT - ONE RUNG AT A TIME BESIDE THE SAME REGULARS, THEN MIXES (owner 2026-11-20 18:20 PT; written 19:33 PT)

**Probes (new modes in `pp_payout_map.py`):** `ladderall` (every ladder on the board, sharded by ladder, Points first; each goblin / demon rung and the
regular line itself as the ONLY non-regular leg beside the SAME 1..5 regular legs from other games / teams, at 2, 3, 4, 5 and 6 picks, More and
Less) - 40 shards 18:22 PT -> 16,648 quotes, 3,344 rungs, 578 ladders, 27 stats (40 at once trips PrizePicks' bot wall after ~100-300 quotes a
shard; ~20 at once is the safe level). `combo` (2..6 goblins / demons in one slip - gg, dd, gd, More / Less mixes - filled with the same regulars to
2..6 picks; every alternate priced alone in the same run) - 16 shards 18:56 PT -> 5,378 combo quotes. Analysis: `research_pplad.py`,
`research_pplad_model.py`, `research_ppcombo.py`. Real per-leg payouts at 2-6 picks + leg multiplier + break-even: `nba_market.pp_lad_leg` (2,683 legs).

**Results:**
1. Control: the regular line alone pays exactly 3 / 6 / 10 / 20 / 37.5 and the Flex table in 100% of 1,694 quotes.
2. One rung, sizes 2-6: the 2-pick "deduction" does NOT stick as the same ratio - vs the 2-pick, the 3-pick multiplier is x0.91, 4-pick x1.02,
   5-pick x0.96, 6-pick x0.97 (median). Full 2-pick -> k-pick mapping table printed in the run (e.g. goblin 2.7 -> 4.75 / 9.0 / 17.0 / 32.0; demon
   3.5 -> 6.25 / 12.0 / 22.0 / 42.0). The 6-pick reading decides the 3-pick in 77% exactly (2-pick only 12% - the 2-pick is coarsely rounded).
3. COMBINATION LAW (proven tonight): a slip holding any goblin / demon pays  P_k = B'_k x product over its alternates of (that leg's single
   k-pick payout / B'_k), with ADJUSTED bases B' = 5.44 (3-pick), 10.21 (4), 19.0 (5), 36.4 (6); regulars count 1. Real / predicted median
   1.00 at every size and every number of alternates (2-6), median error 1.7-4.8% (the time between the single readings and the combo
   quotes + rounding). In a 2-pick, two alternates simply multiply (exact 50%, the rest is the singles' rounding); point "deductions" do NOT add (22%).
4. What sets a rung (tested grouped by PLAYER, never seen in training): the dominant factor is the distance from the regular line / switch point
   divided by sqrt(the line) (goblin More rung by that distance: spread 0.03 in multiplier); then the player's line vs his season form;
   regular vs switch point, ladder density, anchor level add ~nothing beyond it. Unseen players: goblins within one step 86-95% at 2-3 picks,
   demons 37-59% - demons follow a hidden input (the market) the board does not show.

## 8as. THE LIVE SET AS ONE PORTFOLIO - RISK, CONCENTRATION, EXPOSURE CAPS (owner 2026-11-20 19:36 / 19:39 PT; written 19:51 PT)

Trigger: first live slate 2026-11-20 went red across every app; Aday Mara rebounds U7.5 (16) sat in 18 of 31 slips, Keegan Murray 3s U1.5 in 13; also lost:
Daniels steals U2.5 (4), Battle reb U3.5 (5), Hield 3s U1.5 (4), Wolf pts U5.5 (20), Spencer Jones 3s U0.5. `audit_portfolio_risk.py` (run 44862715374) replays
build() on the 30 slates 2026-10-20 .. 11-19, all apps together, 1 unit a slip:
- Distinct legs the set used, graded once: 521 legs, hit **58.0%** (the blend said 53.4%; the raw model said 73.8% - the raw baseline is overconfident by ~16 points,
  it only orders lists). Per day median 58%; 3 of 30 days under 40% (10-25 5/19, 11-15 6/18, 10-29 4/11): a bad day like 11-20 has happened ~1 in 10 slates.
- Whole set: 856 slips (28.5 a day), +549 u, ROI +64%, days up 50%, max drawdown 132 u, worst day -29 u, daily sd 56 u.
- Concentration: the most-used leg sits in a median 20 slips a day (61% of the day's slips, max 30). Days it hit (20): median +20%; days it missed (9): median -55%.
- Exposure caps (a leg in at most C slips across all apps; the slip takes its own list's next leg):
  per player + stat: C1 -9% | C2 +6% | C3 +24% (dd 58) | C4 +23% (dd 53) | C6 +27% (dd 76) | C8 +45% (dd 63, worst -24) | C10 +47% (dd 103) | none +64% (dd 132, worst -29)
  per player: C3 +7% | C4 +37% (+208 u, dd 49, worst -18, 18.5 slips/day) | C5 +36% (dd 44) | C8 +48% (dd 68) | none +64%
- Reading: the edge is real at the leg level (58% vs ~54-57% break-evens) but the set's return and its swings both come from stacking the top few legs; 30 slates
  only - every number here is wide. Owner decides (options with numbers sent 20:xx PT). Next: the same on 2024-25 / 2025-26 (modelled prices), and whether an
  all-Unders set carries a night-level factor (fast / high-scoring nights) that Overs would offset.

## 8at. PRIORITY 0 - GOBLIN / DEMON PRICE PER LEG FOR THE WHOLE BACKTEST (v2); AND THE LIVE SET ON THREE SEASONS OF REAL BOARDS (owner 19:54 / 20:03 PT; written 20:27 PT)

**Price v2** (`research_pp_price_v2.py`, runs pv2 44864386195 / pv2w 44865062959): gradient boosting on 6,208 real quotes joined to the backtest legs, features the
backtest has every day of every season (ladder: regular line or switch point, rungs, counts, step; distance in points / relative / per sqrt(line) / steps; the books'
chance at the exact line; form before the day). Out of time (train before 11-12): exact 35%, within ~one step 61%, median error 3.9%, **bias -0.58%**; leg return on
the graded test legs with the real price -29.4%, with this price -30.0% (gap -0.6 pts). Goblin More: exact 50%, within a step 86%, error 1.8%. Out of player: bias -0.21%.
**The OLD backtest price (v_legs_honest.multiplier, "modelled") was +37% too high on the same legs (demons +47%, goblins +20%): it showed +6.7% where the truth was -29.4%.**
Every goblin / demon backtest number built on the old price was inflated by 20-45 points of leg return. Written: `nba_score.pp_alt_price_v2` (707,044 legs, 3 seasons;
real quote where one exists, else v2; leg multiplier and break-even at 2-6 picks via the 8ar size curves).
Re-priced returns (`research_pp_alt_roi_v2.py`, run alt2 44865500169), 2-pick basis, every season: demon More -17% / -23% / -38% (tier 1 -15 / -17 / -19%); goblin More
-6% / -11% / -13% (tier 1 -5 / -10 / -14%). The old price had shown +40..+70%. Only lead: goblin More where the honest blend says > +5%: +5.5% (941 legs) / +1.9%
(1,931) / +25.8% (209) - small, not proven. Less side has no graded history (not in the honest leg table).

**The live set replayed on real boards, three seasons** (`audit_three_seasons.py`; honest certified numbers before 2026-10-01, month-of-slate blend weights; PrizePicks
+ Underdog only before this season): 2024-25 2,530 slips **+3.9%** (+100 u), drawdown 212 u, 3 losing months of 7, longest losing-day run 10; 2025-26 2,663 slips
**+25.4%** (+676 u), drawdown 63 u, 1 losing month; 2026-27 (30 slates, all five apps) 858 slips +62.8%. Distinct legs hit 53.9% / 54.3% / 58.3%. Worst day in the
older seasons: every slip lost (-18 u on 18 slips) on 5 slates each season. Exposure caps per player: no cap value is better in all three seasons.
Reading: the set's edge is real in 2025-26 and this season and close to zero in 2024-25; this season's +63% is above what the older seasons support.

## 9. Open items and owner decisions pending

- **O1 (owner)**: pause live slips while the rebuild is measured, or keep running? Offered 11-19; the owner chose the parallel rebuild and did not ask for a pause - slips keep running. Revisit when section 8.2 is measured.
- **O2**: combos / periods honest build (needs the singles' components path checked in `build_combos_history.py`).
- **O3**: chain after the baseline on honest history: decide whether to re-run `build_final_hp.py` into parallel tables or to measure with a light as-of calibration first (leaning: light first, full chain once we know where skill is).
- **O4**: train / serve skew in production cells (section 5) - fix together with wiring (a).
- **O5**: PrizePicks pricing leftovers: re-centre the 6-pick constants (-3.5%, same-game), triples (32 quotes collected), Flex model, then the mechanistic grader in the three twins (`build_slip_engine.py`, `sql/pp_payout_v3.sql`, `main_ui/pricing.js`).
- **O6**: Sleeper leg cache rebuild status; Betr has no per-leg multiplier (table-priced) - leg ROI there is slip-structure only.
- **O7 (owner, older, still open)**: re-grade Sleeper Flex records (+8.92u -> +11.63u); nightly check of placed Sleeper entries; Jessica "$3 max per app" reading; Jon's no-Save fallback; view the Jon / Jessi pages live; check the "Unverified" filter count after v1.5.8.
- **O9**: Underdog R-tier anomaly this season (+11.7 pts on 3,107 legs) - check what those lines are before using.
- **O10**: leg-ROI blend (model log-odds + price log-odds, walk-forward) re-run on the honest baseline; `research_leg_roi_model.py` / `_proof.py` need a loader that reads `baseline_history_h`.
- **O16 (CLOSED 8y - capture already at 10 books; no spend)**: sportsbook lines at pick time are thin this season (window rows a day ~2,000 vs ~5,500 in the earlier seasons; exact-line coverage of Underdog legs 37% vs 92-95%). The sportsbook is the strongest input of every per-leg model (8p). Find why (source, markets, credits) and what restoring it costs before touching anything.
- **O17 (BUILT 8y - collecting; judge at ~1,000 real quotes on model picks, about 6 weeks)**: settle the PrizePicks goblin question with real quotes on the model's own top picks (8p, B2) - a daily targeted quote list inside the existing quote budget; needs a pick-time honest score, so it belongs to the live discussion (D8).
- **O8**: the 2026-12-20 scheduled calibration re-test predates this finding - its brief must be rewritten once the honest history exists.

## 10. Method rules learned in this work (apply to every next step)

- **History must be produced the way live is produced.** Any quantity grouped over a period that contains the row's own date (month, season, "last") is a leak until proven otherwise. Search for `.last()`, `groupby(... "ym" ...)`, season-level `groupby` without `shift(1)`.
- **Two-run tests must be matched through each run's own keys.** Lines, anchors and rungs differ between variants; never read variant B at variant A's rungs.
- **Validate the test before trusting it**: honest and deliberately leaky control predictors (leak test), planted truth and placebo (proof suite).
- **This season is the referee.** A result that holds on history and fails live is a history problem until shown otherwise; replay the suspect version on live data to confirm (the +7.9 replay).
- **Honest edges are small**: public sharp tools work with 2-5% per leg; Data Golf finds realized returns about halfway between expected and blind. Anything showing +10 points of hit rate against a market line deserves suspicion first.
- Research never overlaps P1 / P2 / P3 windows; nothing writes to production tables without the owner's go; credentials never in logs.
- **A layer is judged three ways, never by its best slip structure** (passes 18-19): the hit rate of the legs it actually picks against the same slip without it; its neighbours (other windows / thresholds / slip sizes must improve too); and 40 random layers of the same size as the luck yardstick. A 6-pick Power result alone is a few jackpots.

## 11. Sources

Internal: `NBA_COMPASS.md` (sections 2026-11-18 night, 2026-11-19 early / morning / midday / 09:40), `NBA_BASELINE_CALIBRATION.md` 3.10b (the as-of leak precedent), `NBA_DAILY_PARITY_AND_BACKFILL.md` ("season aggregates leak the future"), `build_final_hp.py` docstring (the chain), workflow `nba-baseline-history.yml` (how history was built).

External (read for this work):
- Benter's second-stage model + market blend: https://oddspapi.io/blog/?p=3174
- Favourite-longshot bias: https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2018/08/The-Favorite-Longshot-Midas.pdf
- Noisy probabilities and fair odds: https://arxiv.org/pdf/1811.12516
- Data Golf, expected vs realized returns: https://datagolf.com/how-sharp-are-bookmakers-part-2
- Calibration method by sample size: https://metricgate.com/blogs/beta-calibration-vs-platt-vs-isotonic/
- Pick'em per-leg pricing practice: https://www.propprofessor.com/learn/fantasy , https://www.smartstake.app/learn/how-to-beat-prizepicks , https://github.com/anthonymorelli/vigil , https://moods.beehiiv.com/p/ud-math-2023
- Sportsbook accuracy on props / devig: https://shaanchanchani.github.io/articles/sportsbook-props , https://walrusquant.github.io/rust-bet-tracker/blog/devig-methods-compared
- Look-ahead detection: https://dev.to/tradevodata/how-to-detect-lookahead-bias-in-a-backtest-a-practical-checklist-2cb6 , https://temporalcv.readthedocs.io/en/latest/tutorials/feature_engineering_safety.html , https://arxiv.org/pdf/2607.04958
- Gemini (gemini-2.5-pro, 2026-11-18): kept logit pooling, ROI recalibration, per-kind longshot slope; rejected its per-leg multiplier (ignored Flex partial tiers), its hidden-price exponent formula and "slip ROI is lower than leg ROI".

## 12. LOG (newest last; one entry per move or interaction)

- **2026-11-18 22:47-23:28 PT** - Owner asks for a realistic per-leg ROI model, online research, then testing. Research done; first model built and tested on stored history; owner picks "replace on all four apps" with proof first (D1).
- **2026-11-19 00:30-02:45 PT** - Proof suite built. Planted truth and placebo pass. Fails on Underdog this season. Reported; options offered.
- **2026-11-19 09:04 PT** - Owner: hold, keep testing (D2). Leg cache table built. Diagnosis: model signal gone this season on PrizePicks and Underdog; naive form predicts nothing in any season; future-information evidence found.
- **2026-11-19 09:40 PT** - Scheduled PrizePicks ladder round ran on the full board (402 quotes): one hidden price per rung confirmed; constants need -3.5%; grader not switched (C6).
- **2026-11-19 09:55 PT** - Owner: be sure, test / debug / simulate, pair with research (D3). Leak test validated with controls. Root cause located in the harness tier block. Proof on three seasons (v25 / v26 / v27). Own matching error found and fixed before reporting. Compass updated; three options offered.
- **2026-11-19 11:05 PT** - Owner: option 1, parallel rebuild (D4). `research_honest_history_build.py` written, smoke-tested locally (assists+steals 2025-26: 595,253 rungs, 163 dates, 516 players, 300 s), three season builds dispatched (runs 44595794080 / 44595809486 / 44595823851). `research_honest_history_measure.py` written.
- **2026-11-19 11:20 PT** - Owner asks for this document (D5). Created. NEXT: read the three builds, run the measurement, record the skill map here (section 8.2), then combos.
- **2026-11-19 11:28 PT** (was mis-stamped 12:25) - All three honest builds landed (178 MB). First measurement run hm (44598649248) recorded in section 8a: honest skill beyond the price is +3 to +6 pts on goblins / demons / Underdog alternates, +1 to +2 on PrizePicks regular lines; raw probability x multiplier loses on its top 5%. NEXT: (1) combos honest build (O2); (2) leg-ROI blend on honest inputs (O10); (3) Underdog R anomaly (O9); then strategies.
- **2026-11-19 11:34 PT** - Owner: continue non-stop until done and wired live; report only for decisions that truly need him; goals for strategies: highest steady ROI first, then low drawdown and droughts (D6).
- **2026-11-19 11:38 PT** (was mis-stamped 12:55) - Found a SECOND copy of the month-end tier block in `nba/backtest/combos_ladder_v1.py` (lines 108-112); combos build extended and dispatched for three seasons (S2). Found `nba_market.board_tiers_v2` = PrizePicks board with kind / tier for all three seasons, no price -> stage S3 (price model on real quotes) added. Work plan written (section 8b).
- **2026-11-19 11:40-12:05 PT** - S2 combos landed for three seasons. S3: stored PrizePicks prices validated against 10,200 real quotes and re-centred (STACKED, C7). S4: `_lr_legs_h` built for four apps (deadlock from concurrent index builds fixed by running apps in one job; unpriced alternates dropped; `hit` cast). S5 Underdog read. Real live record and PrizePicks live-leg audit pulled. All in section 8c.
- **2026-11-19 12:08-12:14 PT** - Plain hit-rate scan of PrizePicks regular lines: no price-only edge anywhere. Found Under alternates (new this season) mis-priced by the Over-trained fit -> fixed in the build (C8), rebuild queued behind s5_pp. Proof runs s5_pp / s5_sl / s5_fl dispatched. Doc timestamps corrected (two entries were stamped an hour late).
- **2026-11-19 12:14-12:26 PT** - S5 finished on all four apps and refereed on real quotes; sportsbook tested as third input (new scripts `research_pp_realquote_edge.py`, `research_book_edge.py`); live record reconciled on unique legs. Verdict in section 8d: no proven per-leg edge at real prices; the model adds nothing beyond the market; goblin "edge" on history was a modelled-price artifact (C9). Reported to the owner with options (O12). Engineering that does not depend on his answer continues after the P3 window: one-block harness fix with dry-run, shadow honest leg-ROI table.
- **2026-11-19 12:27 PT** - OWNER DECISION D7 (answer to O12): option 3 - keep playing as now, full stake, all apps; continue the work. O12 closed. Live strategies, stakes and the slip screen stay as they are until the honest pipeline has a proven replacement. NEXT (in order): (a) one-block tier fix in the two harness files + guard test + dry-run against production output; (b) shadow table of the honest leg ROI (sportsbook chance at the line x real price), written daily, nothing on the board changes; (c) S6 structure effects (same-game correlation, Flex tiers) and Betr on honest inputs; (d) search for a real edge led by the sportsbook signal.
- **2026-11-19 12:28-12:36 PT** - Dry-run of the tier fix in the production builder (C10: ready, not switched). Off-market sportsbook test (C11). Section 8e. Running: `research_pp_stack_structure.py` (run ss 44609896286) - correlated stacks of regular lines against the Power / Flex tables, results only.
- **2026-11-19 12:36-12:44 PT** - Stack-structure test (no lift). Daily referee built, run twice, scheduled (new workflow `nba-honest-referee.yml`). Underdog early-season regular-Under lead found and logged. Section 8f. NEXT: fix the Underdog played-slip read in the referee ("dnp"); add the Underdog-Under lead as its own referee line; then S6 on Underdog only (the one app with a lead), honest inputs, real multipliers.
- **2026-11-19 12:44-12:48 PT** - Referee fixed for Underdog played slips and given the regular-Under line; Underdog lead tested as slips on three seasons (section 8g): two seasons positive, one negative, pooled not proven. Stopped new runs before the P3 window (13:17-13:35). NEXT after 13:40: shadow honest leg ROI written at P3 beside the board's number (O13); Betr on honest inputs; keep the referee running.
- **2026-11-19 12:52 PT** - Owner: "I already told you, no stop! Keep working." Standing: do not end a turn while work remains; keep going through pipeline windows with work that does not load the database.
- **2026-11-19 12:52-13:13 PT** - Honest cell scan built (26 features incl. injury report at pick time, shuffle yardstick), run on Underdog and PrizePicks regular legs: nothing beyond chance (section 8h). Online reading added. NEXT (after the P3 window, 13:36): the same scan on Underdog alternates at their real multipliers (CS_KIND=alt); line-movement features (morning board to P3 board); Betr.
- **2026-11-19 13:36-13:52 PT** - Owner interaction: asked for help placing today's slips ("continue with your work on the background, but help me get the slips done first"). Built 5 Fliff slips and 2 Underdog entries in his Chrome ($10 each); he pressed Submit / Play himself each time. Fliff cart driven through the page's own app frame (mouse clicks time out on that small window). O14 logged.
- **2026-11-19 13:36-13:54 PT** - Alternates scan and half-point map / slips run in the background; second lead found and documented (section 8j); referee gets its line. PrizePicks line-move scan: nothing.
- **2026-11-19 13:57 PT** - RETRACTION of 8j: the half-point lead was produced by joining to an outcome-filtered table (ties dropped). Found while checking the mechanism (identical hit rates of two different bets), proven with the unfiltered board (-5% / -12% / -13%). Rule C12 added. Scripts fixed. Nothing had been reported or wired.
- **2026-11-19 13:57-14:06 PT** - Clean re-run of the three cell scans with a price-matched shuffle yardstick; referee gets the two standing Underdog leads with an unfiltered PrizePicks reference; Underdog payout probe confirms prediction-pick entries are priced ~3% above our table (section 8k).
- **2026-11-19 14:06-14:16 PT** - Combiner test (fails; placebo shows the noise of 29 slates), top-of-list Unders measured on both history apps and, live, on all four; slips for every structure on Underdog and PrizePicks (section 8l). Referee carries "system top 6 / top 10 regular Unders" for every app. Section 1 rewritten to the present state.
- **2026-11-19 14:16-14:24 PT** - Profile of the top-of-list Unders (role-bump players) and rank split of the played legs on four apps (section 8m). O15 raised for the owner: cut pools to the first 6 legs.
- **2026-11-19 14:51-14:53 PT** - OWNER DIRECTIVE D8 (three messages, quoted in 8n). Master plan A-D written. Phase A started: `audit_truncation_invariance.py` dispatched for 4 prop pairs x 3 seasons (12 runs, 44632731240 .. 44632868687), with the unfixed recipe as positive control on the points pair.
- **2026-11-19 14:54-15:37 PT** - Phase A. First truncation pass FAILED on the tier-only recipe; residual look-ahead localized to two all-rows league constants (`LG`, `_LG_IMPL`); honest recipe extended (`TL.honest`); second pass PASS 12/12 singles at 100.00% identical with the leaky control moving; combos 2/3 PASS so far. Input audit: grading 100%, one in-play day guarded. Honest history rebuild dispatched (hh2_*, hc2_*). Section 8o.
- **2026-11-19 16:34 PT** - Owner asked for a status "without stopping". Sent: step 1 almost closed (15/15 truncation runs pass, grading 100%), step 2 started, goblin result flagged as modelled-price only, live untouched.
- **2026-11-19 16:44 PT** - Owner asked for the expected time to finish. Answered: step 1 tonight, step 2 overnight, step 3 Friday midday, step 4 Friday night to Saturday morning; told him no leg group shows a steady profit so far, and the two corrections (impossible goblin prices; in-play boards in older seasons).
- **2026-11-19 16:00-17:16 PT** - Phase A closed: combos 3/3, history rebuilt, input audit 7/7 after extending the in-play guard to all seasons. Phase B1 model run on four apps (lm, lm2), goblin prices bounded by real quotes, B2 real-quote check (pq). Section 8p. Open item O16 (thin sportsbook capture this season).
- **2026-11-19 18:12 PT** - Owner: "If everything can be done in sequence non stopping, not depending on tomorrows data, better that way. Try have it finished for tomorrow 1:30pm". Answered 18:45 with the state: steps 1-2 done, battery first pass run on four apps, first reading. Target: Fri 13:30 PT.
- **2026-11-19 17:16-18:18 PT** - Phase B closed (lm3 trailing layers rejected, lm4 final model stored), Phase D engine written with placebo / random controls per structure and a walk-forward of the selection; first pass on four apps (bt3_*). Section 8q.
- **2026-11-19 18:39 / 18:41 PT** - Owner: database at 90%, any cleanup without losing data? then: upgrading the plan, only very easy cleaning. Done: lossless rewrite of this rebuild's three scratch tables (-0.8 GB, row counts verified). Nothing deleted.
- **2026-11-19 18:45-18:47 PT** - Battery D2 (duplicates, leg hit rates, focus surface, real-only Sleeper / Fliff). Section 8r: the edge is the top 2-4 regular single-stat Unders by the blend, about one slip a slate per app, Underdog and PrizePicks; Sleeper / Fliff cannot be selected on 29 real slates.
- **2026-11-19 19:45-19:05 PT** - D3 (rank positions, what the top legs are, Underdog kinds surface), Phase C store (view + three roll-ups), status table 8u. Sections 8s, 8t, 8u.
- **2026-11-19 20:45-19:07 PT** - Daily referee extended (honest history of the season, per-leg model, store, forward tracker `audit_top_list_tracker.py` -> `nba_score.honest_top_list`; run tt1 44665360385 reproduces the battery's numbers to the unit: an independent cross-check). Section 1 items 9-12. Final report sent to the owner.
- **2026-11-19 19:12 PT (read after the 21:00 report)** - Owner: continue, every angle, keep doing passes. Pass 2 (new keys incl. production final_hp / score this season, single props, 25 factors, game cap) and pass 3 (exact random-draw null) run and recorded in 8v. Result: the ranking is real (0 of 4,000 random draws match the candidates), profit above zero remains about 2 standard errors, no second candidate.
- **2026-11-19 20:48 PT (read after the pass 2-3 report)** - Owner: strategies deployable if they hold; keep quoting goblins / demons; Sleeper / Fliff with derived boards; does not understand the sportsbook-lines issue; are the numbers proven on real legs / boards / slips; then composition, rank caps, variations. Passes 4-5 run and recorded in 8w: Underdog holds as placed; PrizePicks holds only under the blend (not under the honest baseline over all of 2024-25) and loses 2-3 points to pushes; caps Underdog 2 legs / PrizePicks 5 legs; goblins about zero after the real-price correction.
- **2026-11-19 21:07 PT** - Owner: "Cover every aspect and issues that still open and also all untested variations, techniques and aspects untested. No exceptions. Keep going". Passes 6-7 (written 22:12 PT): O16 cause found; whole-number-line fix + push table + rebuild (lh8, lm5); as placed parts 2-3 (ap2); rank caps (rc2), luck test (cn2), battery (bt8_* four apps), two-factor layering (ly_*), Betr (be1), conditions / composition / staking / portfolio / range (p7), tracker rewritten (tt2). Section 8x. Result: Underdog 2-pick Standard holds on every test (+28.7%, +78 u, 272 slips); PrizePicks CORRECTED down - negative in 2024-25 on the complete board; nothing else improves the plain top of the list; Fliff is a one-month lead; Betr and Sleeper nothing. Live untouched.
- **2026-11-19 22:16 PT** - Owner: other structures (3-pick Flex, 6-pick Flex)? other apps using only Underdog / PrizePicks qualified legs - does their pricing bring positive ROI? (1) use ParlayAPI if it makes a big difference; (2) go for the goblin quotes if it does not delay the slips, earlier than the last reports. Done (written 22:23 PT): pass 8 (p8), O16 closed without spend (capture already 10 books; candidate does not depend on it), O17 built as a soft morning step + quote order (sh1 test). Section 8y. Live strategies untouched.
- **2026-11-19 22:28 / 22:30 PT** - Owner asked for the best strategy per app (answered from 8x / 8y), then: "I want more strategies and more slips to do not depend on a single startegy". Pass 9 (p9) run and recorded in 8z (22:34 PT): four more Underdog 2-pick slips with 25-47% shared legs hold in all three seasons (5 slips together +330.5 u, +24.4%, drawdown 35.5, 2 losing months of 13); PrizePicks variants positive in every season exist only as 5- / 6-pick Flex. Selection caveat stated. Live untouched.
- **2026-11-19 22:41-22:57 PT** - Owner: all five apps will go live; asked for the menu per app (given, with slips a day and dollars at $10), elected U1-U5, P1-P9, S1 S4 S5 S6, F1 F4 F5, B1 B5, then asked what a correlation / overuse cap changes. Pass 10 run (p10, p10b after fixing short lists) and recorded in 8aa (23:07 PT): caps make PrizePicks negative; Underdog tolerates 2. Nothing wired live - waiting for his go-ahead and stake.
- **2026-11-19 23:09-23:13 PT** - Owner: no caps ("a lot better"); "Go ahead and disable the current strategies and wire the new ones. We go with all elected. Stake is the same $10 for all but betr at $5"; asked whether anything of the current / previous strategies is worth saving; same strategies for Jon and Jessica with their previous limits. Done by 23:32 PT: live engine written, replayed on the season, write path tested, wired into P3 (two soft steps) and the friend pages, gate `honest_live` ON. Section 8ab. First live slate 2026-11-20.
- **2026-11-19 23:34 PT** - Owner: do not show the old strategies on any screen (his, Jessi's, Jon's); is nothing salvageable? Screen note suppressed (slips.js), pass 12 run and recorded in 8ac (23:37 PT): the old strategies' defensive-prop Under cells hold a modest edge on Underdog 2-pick (+13 / +14 / +12%); three Underdog candidates (U6-U8) offered, not live.
- **2026-11-19 23:40-23:53 PT** - Owner: retired then; any more angles? -> "Run those ... no stop on it until there is nothing else to look at"; then asked for negative days this season, average drawdown and what a drought is. Passes 13-14 and the day-by-day replay recorded in 8ad (23:55 PT). One improvement found (PrizePicks half-point lines only), one caution (closing line does not confirm the edge), not applied live pending his word.
- **2026-11-20 00:00 PT** - Owner: "1 yes, if brings ROI up, bring it in. 2 do it." Live engine changed (00:07 PT, commit 6a8bf8e): PrizePicks pool = half-point lines only (switch `honest_live.pp_half_point_only`, default on); P8 retired; P10 = 3-pick Power, top 3 (`H_P10_3power_top3`). Write path re-tested (hd4 44699204205: 23 slips rolled back) and the season replayed (hr2 44699216786: PrizePicks 202 slips +263.9 u; Underdog 147 slips +90.0 u; Sleeper +46.7 u; Fliff +47.6 u; Betr +19.5 u). Live set from the 2026-11-20 slate: U1-U5; P1-P7, P9, P10; S1 S4 S5 S6; F1 F4 F5; B1 B5.
- **2026-11-20 00:13 PT** - Owner: "Continue". Pass 15 run and recorded in 8ae (00:16 PT): morning filters rejected, stake weighting no gain, best Underdog 3-pick for bonus entries found (Standard, top 3 by the model: +36 / +30 / +20%). Nothing changed live.
- **2026-11-20 00:25 PT** - Owner: rebounds 3-pick Standard deployable; anything for PrizePicks / other apps; continue. U6 live; pass 16 recorded in 8af (00:33 PT): PrizePicks swaps proposed for P1 / P4 / P5 (negative in 2024-25 under the half-point rule), Underdog 4-pick Flex rebounds candidate, Betr flagged weak.
- **2026-11-20 00:37 PT** - Owner: "1 yes, 2 yes, 3 keep b1 and b5"; "Keep running different strategies, ranks and everything possible". Live engine (00:44 PT, commit 921ae4f): P1 = 5-pick Flex, lines under 10, no assists (`H_P1_5flex_under10_noast`); P4 = 5-pick Flex by the average of the two rankers (`H_P4_5flex_avg`); P5 = 6-pick Flex by the average (`H_P5_6flex_avg`); U7 = Underdog 4-pick Flex, top 4 rebounds, no Prediction legs. Write path re-tested (hd6 44704082845: 25 slips rolled back); season replay hr3 44704093898: Underdog 182 slips +113.1 u, PrizePicks 202 slips +248.7 u, Sleeper +46.7 u, Fliff +47.6 u, Betr +19.5 u (U7 built on only 9 of 29 slates this season - small Underdog rebounds boards). Live set: U1-U7; P1-P7, P9, P10; S1 S4 S5 S6; F1 F4 F5; B1 B5.
- **2026-11-20 08:59 PT** - Owner: add the rebounds slips and the first round's unelected strategies as FALLBACKS on thin-board days; keep researching. Live engine (09:05 PT, commit e0de5ea): when an app builds fewer slips than it has elected strategies (Underdog 7, PrizePicks 9, Sleeper 4, Fliff 3, Betr 2), fallbacks are added in order, never repeating a slip's legs - PrizePicks: 5- and 6-pick Flex rebounds by the geometric mean (`H_FB1`, `H_FB2`), 2-pick Power of Underdog's top 2, 5-pick Flex different props, 6-pick Flex top 6, 5-pick Flex home, 6-pick Flex second team; Underdog: 3-pick Flex top 3 by the model; Sleeper / Fliff: 2- and 3-pick Max on the qualified legs; Betr: 2-pick Perfect (Underdog top 2), 2-pick and 4-pick Perfect. Write path tested (hd7 44778998281, slate 2026-11-17: 25 slips, 6 of them fallbacks). Season replay with fallbacks (hr4 44779012883): fallbacks added 69 slips for -11.9 u (Underdog U21 19 slips +3.5 u; PrizePicks 11 slips +4.4 u; Sleeper 17 slips -7.6 u; Fliff 17 slips -7.1 u; Betr 5 slips -5.0 u); app totals Underdog 201 slips +111.6 u, PrizePicks 213 +251.1 u, Sleeper 111 +38.1 u, Fliff 86 +39.6 u, Betr 46 +14.5 u.
- **2026-11-20 09:23 PT** - Owner: drop the Sleeper / Fliff / Betr fallbacks ("Let's not keep anything that's negative"); continue research on methods, ranks, trailings. Fallbacks removed (09:26 PT, commit 9b89f0d). Passes 18, 19, 19b run and recorded in 8ah (09:45 PT): second / third slips rejected, trailing gate rejected, trailing layers rejected on PrizePicks, one Underdog lead (4-pick Flex, average rank, no assists, last-10 share 60%+: +47%, +115.8 u on 249 slips) offered as U8. Nothing else changed live.
- **2026-11-20 09:46 PT** - Owner: "Add as a fallback, how much it adds up? Continue". The pass-19 Underdog lead is live as fallback **U20** (09:50 PT, commit 8959a12): 4-pick Flex, average of the two rankers, no assists, no Prediction legs, player under this line in 6+ of his last 10 games (`last10` / `under_share10` in `honest_live_slip_engine.py`; game logs read failure skips it softly); FIRST in Underdog's fallback order, before U21. Write path tested (hd9 44786516998: 23 slips rolled back). Season replay (hr5 44786529461): U20 fired on 12 slates, +2.6 u (+21.7%), legs hit 31 of 46 (67.4%); U21 now 7 slates, +0.4 u; Underdog total 201 slips, +111.1 u (before: U21 alone on 19 slates, +3.5 u; total +111.6 u) - as a fallback it changes the season by about nothing; its value is the three-season record (+47% on 249 slips) if it is ever elected as a daily slip. After the Sleeper / Fliff / Betr fallbacks were dropped: Sleeper 94 slips +45.7 u, Fliff 69 +46.6 u, Betr 41 +19.5 u, PrizePicks 213 +251.1 u.
- **2026-11-20 10:37 PT** - Owner: keep researching without asking; standing rule for new findings (0 to ~25-30% -> fallback while positive as a fallback; negative dropped; above -> live; too many -> least positive to fallback); nothing he already set changes unless he says so. Passes 20 and 21 run and recorded in 8ai (10:44 PT): game environment, opponent, pace, volatility, line-against-form, the other app's line - all rejected, no live change.
- **2026-11-20 10:59 PT** - Passes 22, 23, 23b recorded in 8aj. Consensus rankers: equal, not better; small gbm not worth building live. One-leg-a-game rule: kept on PrizePicks, relaxed for one new Underdog slip - **U8 live** (4-pick Flex, blend, no assists, up to two a game; +33% over three seasons, +89 u on 272 slips), under the owner's 10:37 rule. No elected slip changed.
- **2026-11-20 11:36 PT** - Pass 24 / 24b recorded in 8ak. Live under the owner's 10:37 rule: Sleeper S7 (5-pick Max) and S8 (4-pick Max), Fliff F6 (4-pick Max) and F7 (5-pick Max) in PrizePicks' order played on the app; fallbacks S21 / F21 (2-pick Max, no assists) and B21 (Betr 3-pick Perfect, no assists). All positive on the season replay (hr7). Caveat recorded: Sleeper / Fliff real multipliers exist for 29 slates only.
- **2026-11-20 11:38 PT** - Owner: "The sleeper 2-pick max no assist ... can go to live. Same for the Fliff 2-pick max, just the Betr stay as fallback. Continue." Done (11:43 PT, commit 0f17fa3): **S9** (Sleeper) and **F8** (Fliff) = 2-pick Max on the qualified legs without assists, now MAIN slips (built every slate their legs differ from a slip the app already has); B21 (Betr 3-pick Perfect, no assists) stays a fallback. Targets: Sleeper 7, Fliff 6, Betr 2. Write path tested (hd12 44804038088: 28 slips rolled back). Season replay (hr8 44804052737): S9 27 slips +6.5 u (+24%), F8 27 slips +8.5 u (+32%); Sleeper 140 slips +61.8 u, Fliff 115 slips +66.2 u.
- **2026-11-20 11:57 PT** - Pass 25 recorded in 8al. Underdog fallback U22 wired (4-pick Flex by the model, two a game, +28% over three seasons). Offered to the owner, not wired: 3-pick Standard for bonus entries (model, every prop different, two a game: +34%, +93 u on 271 slips).
- **2026-11-20 12:11 PT** - Owner: "Let's go with option B. You can add option B, and let's keep going." **U9 live** (12:17 PT, commit 4f5496c): Underdog 3-pick Standard, top 3 Unders by the blend, no assists, up to two a game (three seasons +33 / +47 / +57%, +118.0 u on 272 slips, drawdown 14.0; it is the top 3 legs of U8). Underdog target 9. Write path tested (hd14 44809168046: 29 slips rolled back). Season replay (hr10 44809180854): U9 30 slips, +17.5 u (+58%), legs hit 50 of 88; Underdog 260 slips, +137.7 u.
- **2026-11-20 12:19 PT** - Pass 26 recorded in 8am: trailing results of the player, the prop and the ranking - all rejected, no live change. Research paused for the P3 window (13:17 PT); first-live-slate checks follow at 13:05 and 13:42 PT.
- **2026-11-20 12:20 PT** - Owner: keep going, more ROI, new compositions, all apps and especially the smaller ones. Pass 27 recorded in 8an (12:32 PT). Live under his rule: Sleeper S10 / S11, Fliff F9 / F10, Betr B6 (commit 5425cb5). Season replay: Sleeper 186 slips +107.5 u, Fliff 161 +114.8 u, Betr 60 +39.0 u. DB research paused for the P3 window.
- **2026-11-20 13:06 PT** - O17 first-run check (scheduled): **the shadow list wrote NOTHING today.** P2B (run 44769905797) ran the step, which printed "no 'morning' PrizePicks price rows": `nba_market.pp_leg_price` is a view over `board_tiers_v2`, and the morning board's tiers and price keys were only built at P3 (my wrong assumption when O17 was built). The midday quote run (44812960011, delta) therefore had no targets and quoted in board order as before; nothing else was affected. FIXED for tomorrow: the P2B shadow step now builds the morning board's tiers (one-slate rebuild) and runs `pp_refresh_prices` before the list (both idempotent, soft, 8-minute cap, last step). O17's ~6-week clock starts 2026-11-21, not today.
- **2026-11-20 13:45 PT** - FIRST LIVE SLATE VERIFIED. P3 (run 44818911001) finished 13:33 PT, both honest steps ran: 33 H slips - PrizePicks 9, Underdog 9 (U7 could not fill; fallback U22 took the place), Sleeper 7, Fliff 6, Betr 2 (B1 could not fill on Betr's board; B6 built). Old strategies' rows: placed_shadow / shadow, stake 0. PrizePicks slip quotes (run 44820572821): 9 of 9 quoted, payouts equal to the tables (6x / 10x / 25x Flex, 6x 3-pick Power), 3 slips had one leg replaced by the next ranked candidate. Slips screen read in the owner's Chrome (API of the page): 33 slips, only H strategies, PLAY $10 (Betr $5), no test-only rows. Friend run (44821406965) success; ready texts sent 13:40 PT to rodo, jessi, friend (Gmail -> Google Voice; no bounce) - the owner asked at 13:43 why no message: the text goes out at the END of the friend run, 7 minutes after the slips. Observations for the owner: Aday Mara rebounds Under 7.5 sits in about 20 of the 33 slips; U1, U2 and U5 are the SAME two legs today (Doncic points Under 35.5 + Spencer Jones threes Under 0.5).
- **2026-11-20 13:20-13:35 PT** - Owner: map EVERY goblin / demon rung on today's board today, several probes at once, non-stop until 4-5 pm. `pp_payout_map.py` got slices (`PP_SHARD=i/n`, file suffix `_sIofN`, own concurrency group a slice) and a Less-side sweep mode (`sweepless`), commit c5401c1. Round 1 dispatched 13:34 PT: six delta slices, budget 1300 each (runs 44821442365, 44821452589, 44821461054, 44821469664, 44821479478, 44821488606); 6,290 alt legs on the board had no quote at their line. `research_pass28.py` (goblins / demons at real quotes only) written, to run on the sweep's data.
- **2026-11-20 13:47 PT** - Owner sent the Slips screen (13:45 PT): "be sure they are right and the auto sub is not working". FOUND AND FIXED: on the five Underdog slips holding Luka Doncic points Under 35.5 (line moved after the build) the screen subbed a GENERIC backup-pool leg (a More leg with a multiplier, e.g. Amen Thompson threes More 1.70x) instead of the strategy's next ranked Under. Cause: the engine stored an Underdog slip's next-ranked legs under its composition ("U1 top 2 Unders, main ranking") while the screen looks them up under the slip's own name ("UD H <composition> <size><S|F>"). Fix: today's 61 rows renamed in `nba_score.slip_next_legs`, the stored screen rebuilt (18 slips now carry their own list, was 11; U3's next leg = Immanuel Quickley assists Under 5.5), engine fixed for the next slates (commit 9be7d98) and Betr slips now store a next-ranked list too (they had none). U4 / U6 (rebounds) have no next leg today: Underdog's board has no further rebounds Under. STILL OPEN (cosmetic, not changed mid-slate): Sleeper / Fliff / Betr H slips show the old engines' labels on the screen ("(Underdog T1 legs)", "Betr history not credible").
- **2026-11-20 14:14-14:41 PT** - Owner placed Fliff (6 slips, $60) and Underdog (9 slips, $90) through Claude in his Chrome; Betr, PrizePicks, Sleeper placed by himself. Underdog offered Anthony Black points 14.5 (saved 16.5), Ajay Mitchell 14.5 (18.5), Mo Bamba 11.5 (8.5), Pascal Siakam threes 2.5 (1.5); owner 14:29 PT: "Sub them, use the bank". Subs from each slip's own next-ranked list, first one Underdog offered: U3 Quickley assists U5.5 + Merrill points U6.5; U9 Jones threes U0.5 + Wolf points U5.5 + Hield threes U1.5; U1 Jones + Quickley; U2 Jones + Hield. `nba_score.ui_saved_slips` (his saved 33, one batch at 14:26 PT, no duplicate) updated to the placed legs. The engine's own slips in `ud_live_slips` keep the picks as built (research record). Open: the Slips screen's Underdog feed showed those four lines as on the board after Underdog had moved them.
- **2026-11-20 14:44 PT** - Goblin / demon multipliers mapped (8ao): the factor follows the sportsbooks' chance of the rung (out-of-time median error 2-4.5%), not the rung's distance; pass 28 on real quotes: every goblin / demon tier loses on More; nothing wired.
- **2026-11-20 14:59 PT** - Underdog feed vs site, CAUSE FOUND. For prediction-market players Underdog's feed carries two regular `player_points` lines side by side: a balanced one (-115/-115: Black 16.5, Mitchell 18.5, Bamba 8.5, Doncic 35.5) and a skewed one (Black 14.5 -182/+137, Mitchell 14.5 -303/+221, Bamba 11.5 +181/-303, Doncic 39.5). The owner's Pick'em screen showed ONLY the skewed rung (its 0.77x / 1.18x matches -182 / +137), so the balanced line the engine picked could not be placed - and the Slips screen's live check called it "on the board" because the feed still had it. About 5% of Underdog player-stats a day carry two regular lines (16-90 a day, Nov 14-20). FIX (commit d5009b6): the live engine leaves such player-stats out of the Underdog pool. Write path tested (hd16 44833159771). Not changed: the Slips screen's own live check (still treats a feed line as placeable) - follow-up. Round 3 of the PP sweep not launched: round 2's last delta slice finished (44827870076), board covered >90%, first tips at 16:00 PT.
- **2026-11-20 15:01-15:03 PT** - Owner: Jon's text showed Betr; texts must show only Jon = PrizePicks, Underdog, Sleeper, Fliff; Jessi = PrizePicks, Sleeper, Fliff; their slip limits stand (top ones by the previous rules). Done: `nba/p3_text.py` results block filtered per person (yesterday lines and Accumulated). Pages checked for 2026-11-20: Jon carries every owner slip that is on his boards (PP 9/9, UD 7/9 - two had lines Underdog moved, Sleeper 6/7, Fliff 6/6, no Betr); Jessi 4 per app on PP / Sleeper / Fliff (top-4 cap), no UD / Betr. Owner text: logged and sent by Gmail at 13:38 PT to the same Voice address as every day, no bounce in Gmail - the send left our side; not received on his phone (Voice side).
- **2026-11-20 15:13-15:13 PT** - Owner: "the tiers are for Jon only, Jessi just the top 4 of each app she uses". The 15:10 Jessi change is reverted (commit 32f95e8 undone): her engine keeps the top-4 cap and her page shows only the top 4 per app (PP / Sleeper / Fliff), best first, no tiers (v1.2.3). Jon unchanged: Tier 1 = 4 strongest per app, Tier 2 = the rest.
- **2026-11-20 15:37-15:38 PT** - Owner asked where goblin/demon multipliers stand. Status: single-leg factors mapped from 2-pick quotes (today 7,091 More + 871 Less real quotes; season 23,315 + 1,382). Open gap found: slip-level pricing - 1,710 historical 3-6 pick Power quotes with 1-6 alternates are NOT base x product of the 2-pick leg factors (payout / prediction 0.80-1.25 on single-alternate slips, 0.04-1.55 on all-alternate slips; 3-picks average 0.88-0.90, 4-picks 1.02-1.03); today's 9 slip quotes were all standard legs. Flex with alternates not mapped. Not mapped, no results reported. Scheduled task for 2026-11-21 10:10 PT broadened to the slip-level probe (every 2-6 structure, Power + Flex, More + Less) with predict-then-check.
- **2026-11-20 15:45-16:33 PT** - Owner: more runners, get the goblin / demon multipliers today. 34 parallel probe runs; slip pricing worked out for Power (8ap): partner-invariant, time-drifting, grid-rounded, one strength per leg, adjusted bases 5.36 / 10.2 / 19.2 / 36.6, alternates combine by summed log factor; history-based Power error ~2.2% median, bias ~0 (6-pick +1.5%). Flex with alternates not mapped (needs real quotes). Goblin / demon Power: no slip worth playing.
- **2026-11-20 17:08-18:08 PT** - Owner restated the goblin / demon requirement (every leg mapped like a regular, every factor reverse-engineered). Program and results in 8aq: best so far 41% exact / median error 3.7% (ladder geometry + market chance); form adds nothing beyond distance; drift explained by a hidden moving input. Late-game sweep dispatched 18:07 PT.
- **2026-11-20 18:20-19:33 PT** - Owner's method (8ar): ladderall (16,648 quotes, 578 ladders) + combo (5,378 quotes). Combination law proven: P = B' x prod(single k-pick / B'), B' 5.44 / 10.21 / 19.0 / 36.4, unbiased at every size and alternate count. Real per-leg multipliers for 2,683 legs in nba_market.pp_lad_leg.
- **2026-11-20 19:36-19:51 PT** - Owner: live slate all red, validate. Portfolio audit 8as: distinct legs 58% hit over 30 slates; 61% of slips share the top leg; exposure-cap options measured; decision with the owner.
- **2026-11-20 19:54-20:27 PT** - Owner: priority 0 goblin / demon price per leg for the whole backtest; real-board backtest of the strategies. Done (8at): price v2 unbiased (-0.6%) vs old +37%; 707k legs re-priced; every goblin / demon cell negative on 3 seasons. Live set on real boards: +3.9% / +25.4% / +62.8%.

