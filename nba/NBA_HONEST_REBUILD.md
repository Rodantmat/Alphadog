# NBA HONEST REBUILD - the working document

**What this is.** The single record of the "honest history" adjustment: why it exists, what is proven, what is running in parallel, every decision with its reason and source, what the live system reads today, where we want to land and how the result gets wired back in. Owner instruction (2026-11-19 11:20 PT): *"Create a specific document ... current state, every decision ... why ... from where, sources, where you want to land ... after every single move ... document everything. And after every single session interaction with me, you're gonna update documentation."*

**Rule for whoever works on this (Claude included).** Update this file after every move on the rebuild and at the end of every interaction with the owner: add to the LOG (section 12), then correct sections 1-11 so they describe the present. Nothing here is "to be written later". The general project record stays in `NBA_COMPASS.md`; this file is the detail for this adjustment only.

Last updated: 2026-11-19 14:54 PT (Claude, session 01H2FMsCx3km84dy84mk9Bwq).

---

## 1. State (rewritten 14:16 PT, 2026-11-19 - read this first)

1. **Cause (proven):** the certified backtest harness gave every game of a month the player's month-END rate tier, so the two past seasons of model numbers carried the future. Live production was always honest. Honest history now lives in `nba_score.baseline_history_h` (15 props, three seasons); one honest leg table for four apps in `nba_score._lr_legs_h` (rule C12: an outcome table - never a lookup for another leg).
2. **Verdict at real prices (8d):** no proven per-leg edge on any app. The model adds almost nothing beyond the market (weight 0.03-0.06). PrizePicks goblins -10%, demons -37%, regular lines -4% to -12%; Sleeper / Fliff ~ -5% to -12%; Underdog ~0 to slightly negative. The board's leg ROI overstates by 13-22 points on every app (8f). Structure cannot create an edge (8f, 8i); 66,000+ cells scanned on three seasons with a shuffle yardstick: nothing repeatable (8h, 8k).
3. **Owner decision D7 (12:27 PT):** keep playing as now. Nothing live was changed by this work.
4. **What is LIVE from this work:** the daily referee (`nba-honest-referee.yml`, 04:37 PT, table `nba_score.honest_referee`) - the out-of-sample scoreboard at real prices.
5. **The one family that keeps showing up (8g, 8l) - not proven:** the very top of the system's list of REGULAR UNDERS (2-10 legs a slate). Honest model, three seasons, top 6: Underdog 0.519 / 0.565 / 0.580, PrizePicks 0.503 / 0.548 / 0.580 (first season = model with one training season). This season with the production number, top 6 a slate: Underdog 0.621 (+16.1% [+5 .. +28]), Fliff 0.724 at its prices (+11.6% [+2 .. +21]), Sleeper 0.730 (+8.9% [+0 .. +18]), PrizePicks 0.552 (+1.8%). It dies quickly with list length (top fifth: PrizePicks -6%, Sleeper -8%, Fliff -5%, Underdog +8.5%). Best playable form found: Underdog, ONE 2-pick Standard a slate from the top 2: +1.6% / +36.9% [+14 .. +61] / +56.9% over 155 / 156 / 29 slips.
6. **Retraction on file (8j):** a "half point below the market" lead was my own join artifact (ties filtered); caught and removed before any report.
7. **Ready, not switched:** the one-block tier fix in production (dry-run clean, +3-4 s; C10); the honest leg-ROI formula (book chance at the line x real price; O13).
8. **OWNER DIRECTIVE D8 (14:51 PT) governs from here - section 8n: certify the numbers, then the best per-leg hit rate and ROI, then the per-leg store for all back data, then the whole battery from zero; live strategies stay and are not patched.** Earlier open items: O13 (show the honest leg ROI on the board), promotion of the top-of-list Unders to a tracked paper strategy / pool-size cut of the live strategies, O14 (Underdog prediction-pick payouts ~3% above our table; exact pricing needs his logged-in quote).

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
- **O16**: sportsbook lines at pick time are thin this season (window rows a day ~2,000 vs ~5,500 in the earlier seasons; exact-line coverage of Underdog legs 37% vs 92-95%). The sportsbook is the strongest input of every per-leg model (8p). Find why (source, markets, credits) and what restoring it costs before touching anything.
- **O17**: settle the PrizePicks goblin question with real quotes on the model's own top picks (8p, B2) - a daily targeted quote list inside the existing quote budget; needs a pick-time honest score, so it belongs to the live discussion (D8).
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
