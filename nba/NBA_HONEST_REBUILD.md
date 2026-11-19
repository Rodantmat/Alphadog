# NBA HONEST REBUILD - the working document

**What this is.** The single record of the "honest history" adjustment: why it exists, what is proven, what is running in parallel, every decision with its reason and source, what the live system reads today, where we want to land and how the result gets wired back in. Owner instruction (2026-11-19 11:20 PT): *"Create a specific document ... current state, every decision ... why ... from where, sources, where you want to land ... after every single move ... document everything. And after every single session interaction with me, you're gonna update documentation."*

**Rule for whoever works on this (Claude included).** Update this file after every move on the rebuild and at the end of every interaction with the owner: add to the LOG (section 12), then correct sections 1-11 so they describe the present. Nothing here is "to be written later". The general project record stays in `NBA_COMPASS.md`; this file is the detail for this adjustment only.

Last updated: 2026-11-19 12:25 PT (Claude, session 01H2FMsCx3km84dy84mk9Bwq).

---

## 1. One-paragraph state

The two past seasons of model probabilities (2024-25, 2025-26) that every backtest ranks by contain information from after each game. Cause: one block in the certified backtest harness gives every game of a calendar month the player's rate tier computed at his LAST game of that month. With that fixed, the model shows no skill against PrizePicks regular lines (points, rebounds) in any of the three seasons; the live pipeline was already honest and matches the fixed replay. The owner chose (11:05 PT) to rebuild an honest history into SEPARATE tables and leave production alone. The honest baseline for the single-stat props is BUILT in `nba_score.baseline_history_h` (three seasons, 8 props) and the first measurement is in (section 8a): about a third of the skill history claimed is real, it sits on goblins / demons / Underdog alternates and on threes, and almost none on regular lines. Nothing in production has been changed by this adjustment. Leg-ROI deployment is on hold (owner 09:04 PT).

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
- PrizePicks / Sleeper / Fliff proof runs s5_pp / s5_sl / s5_fl dispatched 12:10 PT.

**Real live record this season (from 2026-10-20), for reconciliation.** PrizePicks live 116 slips +42.4u, shadow 578 +148.3u, backup 92 -28.3u; Underdog live 60 +21.7u, shadow 183 +24.2u, paper 32 -17.0u; Sleeper live 75 +14.2u; Fliff live 73 +26.1u; Betr live 34 -12.5u. PrizePicks live legs are mostly regular low-count lines (steals Under .529 n121, turnovers Under .505 n99, stocks Under .537 n95, turnovers Over .593 n81, blocks Under .633 n49; SE .05-.07). OPEN (O11): these hit rates are at or below break-even on average, so the positive units come from slip-level variance and a few high-pay hits, or from the correlation / structure of the slips - to be settled in S6 with the certified graders, not assumed.

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
- **O8**: the 2026-12-20 scheduled calibration re-test predates this finding - its brief must be rewritten once the honest history exists.

## 10. Method rules learned in this work (apply to every next step)

- **History must be produced the way live is produced.** Any quantity grouped over a period that contains the row's own date (month, season, "last") is a leak until proven otherwise. Search for `.last()`, `groupby(... "ym" ...)`, season-level `groupby` without `shift(1)`.
- **Two-run tests must be matched through each run's own keys.** Lines, anchors and rungs differ between variants; never read variant B at variant A's rungs.
- **Validate the test before trusting it**: honest and deliberately leaky control predictors (leak test), planted truth and placebo (proof suite).
- **This season is the referee.** A result that holds on history and fails live is a history problem until shown otherwise; replay the suspect version on live data to confirm (the +7.9 replay).
- **Honest edges are small**: public sharp tools work with 2-5% per leg; Data Golf finds realized returns about halfway between expected and blind. Anything showing +10 points of hit rate against a market line deserves suspicion first.
- Research never overlaps P1 / P2 / P3 windows; nothing writes to production tables without the owner's go; credentials never in logs.

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
- **2026-11-19 12:08-12:25 PT** - Plain hit-rate scan of PrizePicks regular lines: no price-only edge anywhere. Found Under alternates (new this season) mis-priced by the Over-trained fit -> fixed in the build (C8), rebuild queued behind s5_pp. Proof runs s5_pp / s5_sl / s5_fl dispatched. Doc timestamps corrected (two entries were stamped an hour late).
