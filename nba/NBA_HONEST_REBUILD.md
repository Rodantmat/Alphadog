# NBA HONEST REBUILD - the working document

**What this is.** The single record of the "honest history" adjustment: why it exists, what is proven, what is running in parallel, every decision with its reason and source, what the live system reads today, where we want to land and how the result gets wired back in. Owner instruction (2026-11-19 11:20 PT): *"Create a specific document ... current state, every decision ... why ... from where, sources, where you want to land ... after every single move ... document everything. And after every single session interaction with me, you're gonna update documentation."*

**Rule for whoever works on this (Claude included).** Update this file after every move on the rebuild and at the end of every interaction with the owner: add to the LOG (section 12), then correct sections 1-11 so they describe the present. Nothing here is "to be written later". The general project record stays in `NBA_COMPASS.md`; this file is the detail for this adjustment only.

Last updated: 2026-11-19 11:45 PT (Claude, session 01H2FMsCx3km84dy84mk9Bwq).

---

## 1. One-paragraph state

The two past seasons of model probabilities (2024-25, 2025-26) that every backtest ranks by contain information from after each game. Cause: one block in the certified backtest harness gives every game of a calendar month the player's rate tier computed at his LAST game of that month. With that fixed, the model shows no skill against PrizePicks regular lines (points, rebounds) in any of the three seasons; the live pipeline was already honest and matches the fixed replay. The owner chose (11:05 PT) to rebuild an honest history into SEPARATE tables and leave production alone. The honest baseline for the single-stat props is being built now into `nba_score.baseline_history_h` (three seasons); the measurement script is written and runs as soon as the builds land. Nothing in production has been changed by this adjustment. Leg-ROI deployment is on hold (owner 09:04 PT).

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
- Runs in flight (GitHub Actions, research workflow): hh_2025-26 = 44595794080, hh_2024-25 = 44595809486, hh_2026-27 = 44595823851. STATUS: running at the time of writing; see LOG.
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

## 9. Open items and owner decisions pending

- **O1 (owner)**: pause live slips while the rebuild is measured, or keep running? Offered 11-19; the owner chose the parallel rebuild and did not ask for a pause - slips keep running. Revisit when section 8.2 is measured.
- **O2**: combos / periods honest build (needs the singles' components path checked in `build_combos_history.py`).
- **O3**: chain after the baseline on honest history: decide whether to re-run `build_final_hp.py` into parallel tables or to measure with a light as-of calibration first (leaning: light first, full chain once we know where skill is).
- **O4**: train / serve skew in production cells (section 5) - fix together with wiring (a).
- **O5**: PrizePicks pricing leftovers: re-centre the 6-pick constants (-3.5%, same-game), triples (32 quotes collected), Flex model, then the mechanistic grader in the three twins (`build_slip_engine.py`, `sql/pp_payout_v3.sql`, `main_ui/pricing.js`).
- **O6**: Sleeper leg cache rebuild status; Betr has no per-leg multiplier (table-priced) - leg ROI there is slip-structure only.
- **O7 (owner, older, still open)**: re-grade Sleeper Flex records (+8.92u -> +11.63u); nightly check of placed Sleeper entries; Jessica "$3 max per app" reading; Jon's no-Save fallback; view the Jon / Jessi pages live; check the "Unverified" filter count after v1.5.8.
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
