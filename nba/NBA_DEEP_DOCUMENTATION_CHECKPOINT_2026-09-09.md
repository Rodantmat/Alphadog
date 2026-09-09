# NBA Deep Documentation Checkpoint — 2026-09-09

*Read this first in any new NBA session. It consolidates everything built between the 2026-09-04 checkpoint
(`NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md`: infrastructure, 30 tables, 19 workers, sources, bugs) and
2026-09-09 21:00 UTC. Nothing here is re-derivable from the chat logs faster than reading this file.*

---

## 0. Where the project stands (phase map)

| Phase | Status |
|---|---|
| 1 Recon, 2 Design draft | done (see 09-04 checkpoint) |
| 3a Static/weekly layer, 3b Backfill (3 seasons), 3c Starter status / officials / lineups | done (09-04) |
| 3d Daily delta path (season utility, measure types, DvP recurring, splits weekly, per-game delta) | **done 09-07/08** (§1) |
| 4 Classification + Baseline research & design (locked skeleton + schema) | **done 09-08/09** (§2) |
| 5 Backtest harnesses: minutes model, ladder calibration, combos, periods, season opening | **done 09-09** (§3–§7) |
| 6 Production baseline: builders, workflow, loader worker, Postgres, daily plumbing | **done 09-09** (§8) — cron intentionally OFF |
| 7 Enrichment layer (daily-mined factors → deltas → final score) | **next** — factor lock research started 09-09 (§10) |
| Board / Market pipelines | later (board not available in the off-season) |

Owner's standing rules that shaped everything below: additive-only (no MLB edits); tunables in the database, never hardcoded; deep research + Gemini consult are mandatory but Gemini is a reference, not truth; "do not move before fixing" — every calibration miss was fixed or explicitly recorded before the next step; one fixed recipe that on ANY past day computes accurate probabilities from as-of history and replicates forward.

---

## 1. Delta path completion (2026-09-07/08)

**`nba/nba_season.py`** — the one source of truth for season strings, replacing a universal hardcoded `Season=2025-26` across 13 scrapers. Two notions: `current_season()` (roster/schedule → 2026-27 in Jul–Sep) vs `active_stats_season()` (stats → 2025-26 until Oct 3). Running stats scrapers against the empty upcoming season would overwrite real stats with zeros for player_id-keyed tables. `stats_seasons(n)` is anchored on the active season — fixed a real off-season bug where `[active]+prior_seasons(2)` produced a duplicate 2025-26 and dropped 2023-24. Runtime-verified.

**Measure types** — `nba/diagnostic_measure_types.py` probed real schemas before any design. Player Four Factors → HTTP 500 and redundant with Advanced; Team Usage → 500 and meaningless. Built: player usage/scoring, team scoring/four-factors, 3 seasons. GitHub's hard 100 MB limit hit on combined 3-season player files (116–124 MB) → **one file per (key, season)** with `_RANK`/name padding stripped. Tables `nba_stats.player_game_log_usage/_scoring` (79,358 each), `nba_team.team_game_log_scoring/_four_factors` (7,380 each). Writer worker accepts `file_prefix` so the daily delta reuses it (`nba/data/nba_delta_`). Two real bugs found by replaying REAL data through the delta for the first time: postgres.js rejects `undefined` (fixed with `nn()/nnRow()`), and `team_game_log_advanced` has no `usg_pct/reb_pct` (mapper fixed).

**DvP recurring** — defense-vs-position recompute now runs inside the daily-delta worker after game logs load (210 rows = 30 teams × 7 positions).

**Splits + career totals weekly** — added to `nba-scrape.yml`; backfill worker accepts `{"mode":"weekly"}` (~6 s, skips the 79k game-log loop). Splits season read from scraper meta.

**Per-game delta** — `nba/scrape_nba_per_game_delta.py` derives the starter-status/officials delta purely from committed files, fetches only new games, appends to the season file, and persists a `known_empty_games` skip list (the 3 known 2025-26 officials-empty games are never re-fetched). Starter-status/officials writers made season-aware (were hardcoded `_2025_26` — would have silently loaded last season forever in October).

**Final daily procedure (5 steps, in `worker_definitions` notes):** push `TRIGGER_NBA_DAILY_DELTA.txt` → `NBA_DAILY_DELTA_WORKER` → `NBA_STATIC_MEASURE_TYPES_WORKER` (`file_prefix=nba/data/nba_delta_`) → `NBA_STATIC_STARTER_STATUS_WORKER` → `NBA_STATIC_GAME_OFFICIALS_WORKER`. End-to-end on real 2025-26 data: 1230/1230 completeness. **Lesson:** a delta pipeline "verified" only against an empty season proves nothing about mappings; replaying real history is what finds bugs.

**Per-stat decay config** — `nba_config.stat_decay_config` seeded (13 stats, alpha 0.03 for fg3_pct … 0.20 for minutes).

---

## 2. Classification + Baseline — research and locked design (2026-09-08/09)

Design document: **`nba/NBA_CLASSIFICATION_BASELINE_DESIGN.md`** (architecture, prop universe, ladder, component model, five tiering dimensions, per-prop lock table, combination math, backtest plan, schema). Research inputs: the live MLB pipeline read from real code and DB rows (`runClassificationBaselineV6ToPostgres` in the phase3a file — **v5 file and v6-D1 are dead, never port from them**; `config.enrichment_profile_cells`; `scoring.enrichment_leg_current`; `phase3c-certifier`), DataStreak's 40,856-prop blowout study, RotoGrinders minutes methodology, peer-reviewed altitude/jet-lag work, Chu & Swartz foul survival, official PrizePicks/Underdog/Sleeper scoring pages, and several Gemini critique passes.

**Locked decisions**
1. Baseline = everything derivable from static + historical data including the calendar (opponent, home/away, rest); enrichment = daily-mined only, applied as **delta** factors later by the same engine.
2. Component model `outcome = minutes × rate_per_36 / 36` (owner-approved adaptation of MLB); minutes as a 3-part mixture (normal / blowout / dud) driven by a **derived** static spread.
3. Tiers per prop + line + side (per variation) — owner-locked; Gemini's "tier globally" and "drop the direction dimension" both rejected.
4. Two crossing player-tier systems: rate tier (quantile, per-36, MLB exact, 24 max / 15 min) × role tier (fixed minutes thresholds: IRON_MAN >36, HIGH_USAGE_STARTER 32–36, STARTER 27–32, ROTATION 21–27, BENCH 15–21, FRINGE <15).
5. Variation bands = per-prop percentiles of the league line distribution (4–5 bands).
6. Ladder = anchor ±6 steps, player-anchored, never global; More-only layers (Goblin/Demon/milestones) are a right-tail objective — **explicitly deferred by the owner** (board-dependent).
7. Log-rate additive factor combination with macro-clusters; missing factor = zero contribution + confidence penalty.
8. Combos / fantasy / DD via joint simulation, never a direct fit.
9. Fantasy scale identical on all three apps: 1 / 1.2 / 1.5 / 3 / 3 / −1 (official PrizePicks page; a third-party sheet claiming blocks/steals +2 is to be re-verified at season start).
10. Period props: `playergamelogs` honors `Period=1..4` (verified); PP/Underdog include OT in full-game and 2H/4Q, Sleeper quarter markets exclude it.

**Historical prop lines**: not available free (ParlayAPI has game lines only, NBA 2007+ — useful for derived-spread validation); BigDataBall sells them (owner purchase decision). The baseline backtest needs none.

**Schema (all in Postgres, mirrors MLB `config.*`)**: `nba_ref.prop_taxonomy` (28 props, app coverage, period, OT rule, distribution family, skew, build tier), `nba_config.role_tiers` (6), `variation_bands` (25), `factor_registry` (29, layer-tagged baseline/enrichment, macro-cluster), `factor_relevance` (460 factor×prop full/partial/none), `factor_profile_cells` (35 seed cells in MLB's exact cell form), `classification_config` (now ~25 keys, see §9), `calibration_log`.

---

## 3. Backtest harness — architecture and operations

- Runs on **GitHub Actions against the committed JSON data files** (no DB access needed): `.github/workflows/nba-backtest.yml`, trigger file `nba/TRIGGER_NBA_BACKTEST.txt`, reports committed to `nba/backtest/reports/`.
- Strictly backward-looking: every feature is `shift(1)`-based; walk-forward monthly with a one-month lag on the test season; train seasons supply population/tier statistics; **every constant is derived from TRAIN inside the run** (HCA, P(blowout|spread), blowout minutes ratios, role minutes multipliers, dispersion priors, zero-adjust tables, factor betas, phase ratios). Nothing pasted (verified: the 2024-25 holdout with constants from 2023-24 alone is unchanged).
- Local dry runs in the sandbox before every push caught schema bugs (advanced team file has no `GAME_DATE`; bio file is `{"players":[{player_id,age}]}`; slice-before-derive ordering).
- Operational limits learned: foreground runs ≤ ~540 s per prop PAIR (`BT_PROPS`); background processes die at turn end; compound CDFs are `lru_cache`d; Platt pools precomputed; stage-1 rows pickled.
- Env: `BT_TRAIN`, `BT_TEST`, `BT_PROPS`, `BT_BAND_CELLS`, `BT_SHIFT_MODE`, `BT_SHIFT_LAMBDA`, `BT_KCELL_3PM`, `BT_PLAYER_L0` (rejected, off), `BT_CARRY`, `BT_PHASE`, `BT_SAVE_COMPONENTS`, `BT_TAG`.

Files: `nba/backtest/minutes_model_v1.py`, `classification_ladder_v1.py` (history v1–v9 in header, kept), **`classification_ladder_v12.py` (canonical, body = v29)**, `bandfit.py`, `combos_ladder_v1.py`, `periods_ladder_v1.py`, `reports/classification_final_two_season_status.md` (the scoreboard), `reports/classification_v12_leg_level.md`, `reports/band_mean_ratio_fit_2024_25.json`.

---

## 4. Minutes model (`minutes_model_v1.py`) — results and corrections

- Derived static spread = pre-game rolling net rating (shrunk k=10) + HCA (fit 1.98) + 0.5 × rest diff: **r = 0.44 train / 0.46 test vs final margin, MAE 11.5** — market-grade with zero market data.
- P(blowout | |spread|) monotone 0.17 → 0.39 on train, transfers to test (0.19 → 0.41).
- DataStreak decay reproduced on our own 54k eligible player-games: 49.9 / 48.2 / 46.8 / 44.5 (5.4 pts) vs published 46.7 / 44.9 / 43.8 / 40.9 (5.8).
- **Correction 1**: WON blowouts are not a penalty (over-rate 51.9% vs 49.1% competitive); LOST blowouts are (36.9%). Favored starters 47.7% vs underdog starters 39.4% — DataStreak's "favorite's starters hit hardest" did **not** reproduce. Blowout cells split by won/lost.
- **Correction 2**: published B2B star minute deltas (−1.5..−3.0) do **not** reproduce conditional on playing (~0 to −0.4); bench/rotation GAIN +0.6..+2.5. The star B2B effect is a DNP-Rest / P(available) effect → belongs in P(start), not the rate.
- Team-specific starter pull in won blowouts spans 0.81 (Orlando) to 1.10 (Dallas).
- **Leakage bug found and fixed**: `mu_role` had been a season-wide mean (uses future games) — the "FRINGE 0.867 in won blowouts" anomaly was that bug; corrected FRINGE 1.18 (won) / 1.43 (lost); role minutes multipliers shrink to ~1.0 once backward-looking.

---

## 5. Classification ladder — iteration history (all fixed before moving)

Standard (owner): leg-level — every variation band × direction, and "when it says X% it hits X%" confidence bands; must hold on both seasons.

| Version | Change | Effect |
|---|---|---|
| v1 | parametric only (NegBin/Normal) | count props within ±2pp; points tails −9.8pp (top bin), fringe +7.5 |
| v2 | role-tier minutes multiplier (fit TRAIN) + heteroscedastic dispersion prior (points var/mean 3.4 → 2.0 by mean band; flat 1.5 default had hit 16.7% of rows) | tails improved; role bias unchanged |
| v3 | **empirical rate_tier × role_tier × rung tables** (min 300 games) primary, parametric fallback | points ladder ±4 → ±1.2 |
| v4 | monthly walk-forward rebuild + MLB guards | absorbs regime drift |
| v5 | cell shrinkage k=300 toward parametric | far tails WORSE → exposed v6 |
| v6 | **MLB's symmetric sample floor (1−ceiling) is a BUG for far rungs** (forced true 0.002 rungs to 0.25); upper ceiling only | far tails exact |
| v7 | Platt per (prop, role) ladder-wide | helped points, hurt rebounds/assists |
| v8 | Platt per (prop, role, **rung**), n≥1000 prior in-season legs, A>0, max shift 0.15 | ladder ~1pp |
| v9 | **role-aware tier prior** (rate tiers ranked within role tier) | star/fringe residual +3.8/−2.3 → ±2 |
| v10 | hierarchical empirical fallback (tier×role×rung → band×role×rung → band×rung); variation band added to Platt key with pooled fallback | ELITE rebounds +7.9 → +3.6; points STARTER band bias gone; 100% empirical coverage |
| v11 | 3PM compound model (tier on 3PA/36; makes\|attempts Binomial) | did not fix the 60–65 band |
| v12 | k-sweep on VALIDATION 2024-25: bias monotone in the band at any single k → per-(prop, band) mean-ratio cells (`bandfit.py`) shrunk by cell n | worst cells 39 → 28 |
| v13–14 | 3PM K_CELL 300 → 100; **season-consistency rule** for band cells (keep only if sign consistent across seasons): rebounds kept, 3PM dropped (regime +2.8 vs −3.6) | |
| v15 | 3PM cells as **logit level-shift** on the parametric (cells keyed on attempt tier × role averaged away the make-rate ordering) | 3PM 60–65 −4.6 → within ±2.3; worst-rung cells 1 |
| v16 | shift mode tested on points/rebounds | WORSE (rebounds ladder 5.4): parametric shape wrong at zero → replacement stays for count props |
| v17 | shift bug: each hierarchy level's gap is vs the raw parametric → apply the **finest level only** (stacking tripled the correction: FRINGE points rung −6 pred 58.7 vs ~95) | two-season standard met for points/rebounds/assists/3PM |
| v18 | blocks/steals: shift with **ordering strength λ=0.5**; **data-fit prior strength** (k_MoM rel. to points STL 4.9×/TOV 2.5×/BLK 1.7×; top-decile 20-game regression STL 17%/BLK 6%/REB 4%) → STL k 60→125 | steals "more" bands clean |
| v19 | **recipe integrity**: all pasted constants derived in-run; **zero-adjusted NegBin** for blocks/steals (actual P(0) by mean band; blocks ~1.5 bpg 0.32 vs NB 0.27; steals zero-deflated low/inflated high) | blocks at standard on 2025-26 |
| v20 | all 11 single-stat props run (TOV k 95, PF k 100, FTM k 60 from measured regression 13%/14%/9%); modes per prop by evidence | scoreboard §6 |
| v21 | **factor layer** (owner: in from the start, nothing forced) — opponent profile + pace + home + B2B, betas fit on TRAIN in log-rate space | real but small (§6) |
| v22 | components + P(over 9.5) saved for combos; rel rows carry ids | |
| v29 | **cross-season carryover** (CARRY_N=8) + **season-phase cell**; month-by-month season-shape table in every report | October exists (§7) |

Rejected on data (recorded in config key `rejected_on_data`): player-own L0 cells (n=40–80 regression-noise; ELITE rebounds ±7.7), beta-binomial makes (var ratio 0.94 = binomial), band cells for 3PM (sign flips), shift mode for count props, league 3P% as the 3PM driver (36.57/36.02/35.96), close-game rate penalty for stars in Q4 (they score 1.09× per minute; FGA 1.13, FTA 1.18).

Data-fit facts worth keeping: prior strength vs population k≈2, vs tier-mates k≈100–250 (circular) — a single k cannot serve all bands; rebounds var/mean is flat 1.25–1.35 at every level; assists ~1.1–1.2; 3PA Poisson; points 3.4 → 2.0.

---

## 6. Final baseline scoreboard (same recipe, both seasons; format ladder max pp / confidence-band misses; 2025-26 | 2024-25 holdout with 2023-24 history only)

**Single-stat (factor layer on):** CERTIFIED (6) — points 1.2/0 | 1.2/0; rebounds 0.7/1 | 0.9/0; assists 1.5/0 | 0.7/2 thin; threes_made 1.2/1 | 1.2/1; fga 1.0/0 | 1.1/0; ftm 0.8/0 | 1.8/1. BORDERLINE — blocks 0.6/0 | 1.0/2 (≤3.3). CLOSE — steals 1.3/2 | 0.8/3; turnovers 1.8/~4 | 2.0/3; personal_fouls 1.8/~2 | 1.1/~2. REGIME — fg3a 2.6/3 | 1.9/2 (sign flips with the league 3PA swing +7% then −3%).

**Factor layer verdict** (`baseline_factor_layer`): betas sensible and opponent-profile ones stable across seasons (points pace 1.17 / opp DEF 0.53; rebounds pace 0.66 / opp miss 0.33 / opp OREB −0.11; blocks opp paint 0.30/0.37; steals opp TOV 0.27/0.26); pace unstable with one training season; home and B2B ≈0 everywhere. Brier gain points −0.12%, rebounds −0.09%, blocks −0.09%, steals −0.29%; calibration unchanged. Real but small — the big discrimination gains must come from live enrichment (injuries/lineups → minutes and usage).

**Combos + DD** (`combos_ladder_v1.py`): ladders 2025-26 | holdout — pts_reb 0.8 | 0.9; pts_ast 1.1 | 1.1; reb_ast 0.7 | 0.9; pra 1.1 | 1.1; fantasy 1.0 | 0.8; stocks 1.6 | 1.3. Bands 163/4 and 162/5 (stocks accounts for most). CERTIFIED: P+R, P+A, R+A, PRA, fantasy; stocks close. Covariance from each player's own rolling-30 correlation shrunk (k=20) toward role-tier population (ρ points-rebounds IRON_MAN 0.13 → FRINGE 0.46, minutes-driven). Double-double: Gaussian copula on **calibrated** marginals (post-Platt P(over 9.5)) with the **exact trivariate** term; Normal marginals and the product approximation of the triple term were rejected on data (over-predicted candidates; 0.99 vs 0.82 for TD players). All bands with n≥300 within ±1.4 (2025-26) / ±5 (holdout).

**Periods** (`periods_ladder_v1.py` v3): points_q1 1.1/0 (at standard first pass); rebounds_q1 1.2/2 (60–65 discreteness cluster; rung cells 32 → 0); assists_q1 0.5/1; threes_q1 0.9/0; **points_h1 1.5/0 | 1.0/0 CERTIFIED** (pace elasticity 1.36); points_h2 1.0/1 | 1.5/3 thin-history; **points_q4 0.9/1 | 0.8/0 CERTIFIED**; q4 OT-exclude (Sleeper) 0.9/1 — same recipe, one flag. Measured: Q1 starters' blowout minute ratio ≈1.00; Q4 IRON_MAN 0.37, STARTER 0.51, BENCH 1.32, FRINGE 2.40; star Q4 minutes by state close 9.0 (3% sit), medium 7.6 (9%), blowout 3.5 (40–47% sit out entirely); 2H Iron Man 0.68; P(OT|spread) 5.3% at pick'em → 1.9% at 15+; hero-ball assists ~0.9× and bench scoring 0.84× in close fourths. Model: 3-part state mixture (state probs from the derived spread; per role×state sit-rate + plays-ratio + per-stat rate ratio, fit on TRAIN) + OT as a mixture branch (not a mean bump) + period-scaled prior strength (×3 quarters, ×1.5 halves) + dispersion floor 0.5 (near-binomial short counts) + shift λ=0.5 + pace/opp-DEF factor layer. Data: `nba/scrape_nba_periods.py` (12 quarter files, ~22k rows each, every quarter caps at exactly 12.0 min — sanity gate), workflow `nba-periods.yml`.

---

## 7. Season-opening study (owner question, 2026-09-09) — `season_opening_study`

Problem: within-season rates (3 games) + minutes role (5 competitive games) + in-season Platt (1000 legs) ⇒ **zero projections in October, 62% coverage in November, Platt 0% until December.** The two-season certification had never seen the opening because it didn't exist in it.

Fix 1 — cross-season carryover (player-level rolling minutes role + rate EWMA across seasons; boundary evidence capped at CARRY_N=8): coverage Oct 85%, Nov 90%.

Pattern (both seasons, same sign and size = reliable): carryover over-projects ~5pp at the anchor in October (points −4.8/−6.2, rebounds −5.2/−4.6), ~2–4 in November, flat Dec–Mar, **April under-projects 5–7** (tanking/rest/young players). Fix 2 — `season_phase` cell (ratio by month fit on train seasons that themselves had a predecessor, k=500): 2025-26 points October −4.8 → −0.1, April +6.1 → +2.3; rebounds October −5.2 → −3.6 (partly shape). Limit: out-of-sample only on 2025-26 today; the 2026-27 fit will use 2024-25 + 2025-26. Safe opening pattern: projections from game 1; October deflated ~5%; expect 2–5pp band noise for 2–3 weeks; rookies/new arrivals have no carryover → tier prior only for 3 games (lower confidence); April = phase cell + rest/tank noise. Full re-certification with carryover + phase was triggered on Actions (in progress at checkpoint time — **read `classification_final_*` and `classification_ext_*` reports before trusting the §6 numbers as final under v29**).

---

## 8. Production baseline (2026-09-09)

**Principle**: the backtest on a past day IS the production computation (all features shift(1)); production adds only (a) virtual slate rows, (b) a daily-exact as-of cutoff, (c) a ladder writer. Builders are **patchers over the certified harnesses** (single source of truth; every patch asserts its anchor and fails loudly — this caught the first Actions build when the repo harness had a trailing comment the working copy lacked).

- `nba/baseline/build_baseline_ladder.py` — single-stat props; slate = `nba_schedule_current.json` games on ASOF (status ≠ final; `BT_REPLAY=1` allows final games for past-day replay) × each team's roster from its last 3 games; `BT_SAVE_COMPONENTS=1` also saves `_comp_*`/`_p10_*` pickles; one row per distinct line (rungs below the natural floor collapse onto 0.5).
- `nba/baseline/build_combos_ladder.py` — combos + double_double (line 0.5) from the saved components.
- `nba/baseline/build_periods_ladder.py` — one (period, prop) per call; `period` + `ot_rule` in every row. Two bugs fixed in replay: virtual `teams_adv` rows must carry keys only (a `GAME_DATE` collided with the harness merge), and the completed-games filter must run **before** the slate is appended (else 14 duplicate rows → duplicate game keys).
- `.github/workflows/nba-baseline.yml` — `workflow_dispatch` + `nba/TRIGGER_NBA_BASELINE.txt` (`asof:` / `replay:` lines); **no cron by owner decision** (Coworker schedules near season start). Runs 6 single-stat pairs (3 saving components) + combos + 8 period runs (1Q/1H/2H/4Q points, 1Q rebounds/assists/threes, 4Q OT-exclude), merges into `nba/data/nba_baseline_ladder_<ASOF>.json` + `_latest.json`, deletes pickles, commits. ~2 h.
- **Replay validation (2026-03-15)**: 7 games, 194 roster rows → 173 projected players; single-stat 24,739 raw rows (17,376 distinct lines), combos 12,579 rows / 7 props / 175 players, 4Q points 1,574 rows. Scored against the real outcomes: rebounds within noise, points "less" ran hot that day (single day, SE ≈3pp). **43 of 173 roster players did not play** — the enrichment layer's job (injury report / lineups); the baseline carries derived backups.
- **Loader worker** `nba/alphadog-v2-nba-baseline-ladder.js` — in `worker_manifest_nba.json`, `generate_wrangler_configs.py` service binding, admin-sql bridge target `NBA_BASELINE_LADDER_WORKER` (`job="run"`, `extra={"asof":...}`; omit for `_latest`). Reads raw GitHub, dedupes on the PK, batched upsert into `nba_score.baseline_ladder` (PK asof, player_id, game_id, prop, period, ot_rule, line) + `nba_score.baseline_ladder_runs` (array params cast with `string_to_array`). Verified: 17,376 rows / 173 players / 11 props for 2026-03-15. Registered in `nba_config.worker_definitions`.
- **Daily plumbing**: `nba/sync_season_files_from_delta.py` mirrors the current season's delta bulk files into the season-named files the recipe reads; `nba-daily-delta.yml` now also refreshes current-season quarter files (`scrape_nba_periods.py` with `PERIODS_SEASONS=1`) and the schedule, and commits them. Builders detect seasons only from `nba_player_game_log_<YYYY_YY>.json` (the advanced file would have parsed as a bogus season). At the October rollover the builders pick up 2026-27 automatically with 2024-25 + 2025-26 as history.

Daily order once live: delta scrape → delta workers → ladder build (Actions) → loader → enrichment (future).

---

## 9. Config inventory (`nba_config.classification_config`) — read these before changing the recipe

`tier_bands`, `tier_blend_constant`, `prior_strength_method`, `prior_strength_by_prop`, `empirical_distribution_config` (hierarchy), `empirical_cell_mode_by_prop`, `shift_lambda_by_prop`, `zero_adjust_by_prop`, `band_cell_season_consistency_rule`, `guards` (upper-only ceiling), `platt_calibration` (per prop/band/role/rung), `dispersion`, `minutes_mixture`, `minutes_role_multiplier`, `ladder`, `threes_made_model`, `baseline_factor_layer`, `recipe_integrity`, `rejected_on_data`, `single_stat_scoreboard_two_seasons`, `extension_status_blocks_steals`, `leg_level_result_two_seasons`, `combos_joint_layer`, `period_layer` / `period_layer_v2` / `period_layer_v3` / `period_layer_scoreboard`, `season_opening_study`, `production_baseline_ladder`, `backtest_plan`. Plus `nba_config.calibration_log` (every structural change with evidence) and the seed/edited `factor_profile_cells`.

---

## 10. What is explicitly NOT built (and why)

- **Enrichment layer** (daily-mined factors → delta multipliers → final score/confidence): next phase; factor-lock research started 09-09 (web passes: usage redistribution ~7–8 pts of a 32%-usage star's usage moves, lines capture 5–6; bench→starter +3–5 usage pts; 30–90 min post-news window; injury report timing; final bulletin 15–30 min before tip).
- Goblin/Demon/milestone layers (owner: board-dependent, later). Tier C props (first basket, high scorer: need play-by-play). Rebounds/assists/3PM for 1H/2H/4Q periods (harness supports them; only points certified). Referee assignment application. Live market spread delta.
- Cron for the ladder build (owner: Coworker will schedule).

## 11. Known residuals (honest)

Rebounds ELITE tails (~10 players, ~2.9σ); assists HIGH left skew; thinnest "less" bands (assists 60–65, 3PM 50–55); steals less 60–65 (+3.4/+4.1, structural); blocks 70–75 with one-season history; 2H LOW band under-prediction (fringe cold-streak, band-cell candidate); rookies with no carryover; the v29 re-certification not yet read.

## 12. Non-obvious lessons (add to `NBA_LESSONS_LEARNED_FROM_MLB.md` when convenient)

1. Aggregate ladder calibration hides band-level errors that cancel; certify at the leg level (band × direction × rung, and confidence bands).
2. A better parametric cannot reach the output in replacement mode — the cell mode decides where structure can act (replacement for count props with a wrong zero, shift for props where the parametric ordering matters).
3. Season holdout separates structure from regime: same-sign-both-seasons is the bar for freezing anything.
4. Data before building: beta-binomial, close-game star penalty, league-3P% driver, player-own cells — all rejected by measurement before code.
5. Prior strength must be measured (top-decile regression), not seeded; the noisy stats needed 4–5× points' k.
6. Ported guards can be wrong in a new geometry (MLB's symmetric ceiling on a ladder).
7. Leakage hides as a "puzzling anomaly" (FRINGE 0.867) — check every baseline is shift(1).
8. Production = backtest + virtual rows; patchers with asserting anchors keep one recipe honest.

---

## 13. Next step

Enrichment factor lock (multi-pass research, per prop / direction / variation, with mining sources and 2-season backfill plans), then the enrichment engine on the MLB cell pattern, validated against the same two seasons.
