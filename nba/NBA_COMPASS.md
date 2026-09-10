# NBA COMPASS — the realignment document (read this first, always)

**Owner instruction (2026-09-09):** this chat stays the single working chat for NBA. When a question touches anything
already built — static data, backfill, daily delta, classification, baseline, backtests, combos, periods, season
opening, production ladder, workers, workflows, config — and the answer is not immediately certain, **do not search
transcripts. Open this file, find the question in §6, open the document it points to, read the section it names, then
answer.** Every fact below was verified against real data or real systems at the time it was written; if a live check
contradicts this file, trust the live check and then update this file.

---

## 1. How to realign in 60 seconds

1. Read §2 (phase map) to place the question in time.
2. Read §3 (canonical facts) — the 40 things that must never be stated wrongly.
3. Use §6 (question → document) to open the exact section for the detail.
4. If the question is about *how to run something*, use §5 (procedures) — the commands are exact.
5. If still unsure, check the live system (SQL, workflow list, report files) using §4's addresses. Only then answer.

Never say "I don't have that" about anything in §2–§6 without opening the pointed document first.

---

## 2. Phase map (what exists, in order)

| # | Phase | Done | Where documented |
|---|---|---|---|
| 1 | Recon of the live MLB system | 2026-08-31 | `NBA_ARCHITECTURE_BLUEPRINT.md`, `NBA_LESSONS_LEARNED_FROM_MLB.md` (Parts A–F) |
| 2 | System draft + operating model | 08-31 | `NBA_SYSTEM_DRAFT.md`, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` |
| 3a | Static / weekly layer (teams, players, arenas, officials, bio, tracking, team stats, on/off, DARKO, schedule, playtypes, tracking detail, shot quality) | 09-01/03 | `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md` §infra/tables/workers; `NBA_ENRICHMENT_FACTORS_RESEARCH.md` |
| 3b | Historical backfill — 3 seasons of game logs, advanced, career, splits | 09-03 | 09-04 checkpoint; `NBA_HISTORICAL_BACKFILL_PLAN.md` |
| 3c | Starter status, defense-vs-position, game officials, lineups | 09-03/04 | 09-04 checkpoint |
| 3d | Daily delta path (season utility, measure types, DvP recurring, per-game delta) | 09-07/08 | `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md` §1 |
| 4 | Classification + baseline design (locked skeleton + schema) | 09-08/09 | `NBA_CLASSIFICATION_BASELINE_DESIGN.md`; 09-09 checkpoint §2 |
| 5 | Backtests: minutes model, ladder v1→v29, combos, periods, season opening | 09-09 | 09-09 checkpoint §3–§7; `backtest/reports/classification_final_two_season_status.md` |
| 6 | Production baseline: builders, workflow, loader worker, Postgres, daily plumbing | 09-09 | 09-09 checkpoint §8 |
| 7 | Enrichment factor lock (5 passes) → baseline v30 (ramp + team-change) → mining/fallback plan + PARITY RULE (`nba_asof.py`) | 09-09 | `NBA_ENRICHMENT_FACTOR_LOCK.md`; `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` (§8 parity, §9 coverage matrix); log entry 09-09/10 |
| 8 | Two-season backfills of every enrichment factor: injury-report PDF archive (monthly shards, hourly+15-min URL patterns), weekly as-of tables, per-game matchups (sharded), starters/officials, coaches, all-players; day-before report wired into the builders; absence prior + M1 measured | 09-10 | log entry 09-09/10 §4; config `absence_prior_measured`, `primary_defender_quality_measured` |
| 9 | Market + boards: ParlayAPI game lines 2 seasons in Postgres; The Odds API history verified (PP+UD boards) and the two-snapshot board puller built (waits on the $119 plan); all four live board sources decided on same-moment evidence (PP, Sleeper, Underdog = OUR scrapers; Fliff = ParlayAPI) | 09-10 | log entry 09-09/10 §5–§6; config `board_sources_decision`, `board_backfill_odds_api`, `market_probe_results_2026_09_10` |
| — | Outcome grader → enrichment engine → slip engine (copula) | next | design in config `board_backfill_odds_api` |

---

## 3. Canonical facts (never get these wrong)

**Rules of the project**
1. Additive only — no MLB edits, ever. NBA files live in `nba/`; NBA data lives in `nba_*` schemas only.
2. Tunables live in the database (`nba_config.*`), never hardcoded.
3. Deep research + Gemini consult are mandatory for big decisions; Gemini is a reference, not truth — several of its suggestions were rejected on data (tier globally, drop direction, beta-binomial, close-game star penalty).
4. Operating model: three runs triggered by Claude Coworker scheduled tasks, worker by worker; no orchestrator. Cron for the ladder build is OFF by owner decision until near the season.
5. Standard: "extremely accurate" = calibrated at the leg level (band × direction × rung, and confidence bands that hit their stated rate) on BOTH seasons with the same recipe. A calibrated 75% still loses one time in four.
6. One fixed recipe; every value (tier cutpoints, cells, Platt, HCA, blowout lookup, minutes ratios, dispersion, zero-adjust, factor betas, phase ratios) is computed in-run from history as of the day. Nothing pasted.
7. Goblins/Demons: deferred (board-dependent). Historical prop lines: not free (BigDataBall; owner decision).
7b. BASELINE/ENRICHMENT SPLIT (owner, 2026-09-09): anything derivable from logs/splits/schedule/season tables as of the morning build, or PUBLISHED BEFORE it (official day-before injury report at 5 PM local; referee assignments ~9 AM ET), belongs in the BASELINE; enrichment prices only the same-day residual; board and market are separate stages. Factor lock closed after 5 passes: `NBA_ENRICHMENT_FACTOR_LOCK.md`, config keys `enrichment_factor_lock_status`, `enrichment_subfactor_tree`, `baseline_reassignment_from_enrichment`.

**Data**
8. Sources: `stats.nba.com` via `curl_cffi` on GitHub Actions (Cloudflare egress is blocked by nba.com); committed JSON in `nba/data/`; workers read raw GitHub → Postgres (Hyperdrive). One file per (key, season) — combined files exceeded GitHub's 100 MB limit.
9. `nba/nba_season.py`: `current_season()` (roster/schedule; 2026-27 in Jul–Sep) vs `active_stats_season()` (stats; 2025-26 until Oct 3). Stats scrapers must use the active season or they overwrite real data with zeros.
10. Seasons on disk: 2023-24, 2024-25, 2025-26 (full-game logs, advanced, team logs, four factors, scoring, quarters Q1–Q4). The 2026-27 schedule (1,266 games) is already in `nba_schedule_current.json`.
11. Daily delta writes `nba_delta_*` files; `nba/sync_season_files_from_delta.py` mirrors them into the season-named files the recipe reads; the delta workflow also refreshes current-season quarters and the schedule.
12. Known source quirks: 3 games of 2025-26 have empty officials at the source (skip list); `boxscoretraditionalv2` unreliable for historical games (v3 used); every quarter file caps at exactly 12.0 minutes (sanity gate).

**Baseline recipe (canonical file `nba/backtest/classification_ladder_v12.py`)**
13. Component model: outcome = projected minutes × per-36 rate / 36; minutes = 3-part mixture (normal / blowout / dud) on a DERIVED static spread (net rating + HCA + rest; r = 0.46 vs final margin, MAE 11.5).
14. Won blowouts are not a penalty (51.9% over-rate vs 49.1%); lost blowouts are (36.9%). B2B is a P(available) effect, not a rate effect.
15. Tiers: rate tier = quantile per-36 rate, max 24 / min 15 per tier, ranked WITHIN role tier; role tiers by competitive-game minutes (IRON_MAN >36, HUS 32–36, STARTER 27–32, ROTATION 21–27, BENCH 15–21, FRINGE <15); variation bands = per-prop line percentiles; direction is a cell dimension.
16. Probabilities: hierarchical empirical cells (tier×role×rung → band×role×rung → band×rung, min 300) over a parametric fallback. Cell mode per prop by evidence: REPLACEMENT for points, rebounds, assists, FGA, 3PA, turnovers, fouls; logit SHIFT with ordering strength λ for 3PM (1.0), blocks/steals/FTM (0.5). Shift applies the finest level only.
17. Prior strength measured, not seeded: points 25, rebounds 40, assists 20, 3PM 25, FGA 15, 3PA 20, blocks 50, steals 125, turnovers 95, fouls 100, FTM 60 (top-decile 20-game regression: STL 17%, PF 14%, TOV 13%, FTA 9%, BLK 6%, REB 4%, FGA 3%).
18. Guards: upper ceiling only (MLB's symmetric floor is a bug on a ladder); Wilson for n<30; Platt per (prop, band, role, rung) with n≥1000, A>0, max shift 0.15, pooled fallback.
19. Band mean-ratio cells only where the sign is consistent across both seasons (rebounds kept; 3PM dropped as regime).
20. Zero-adjusted NegBin for blocks/steals/turnovers/fouls (actual P(0) by mean band from train).
21. Factor layer (owner: in from the start): opponent profile (DEF rating, miss rate, OREB%, TOV%, forced TOV%, FTA rate, paint share, 3PA allowed), pace (geometric mean), home, B2B; betas fit on train in log-rate space. Verdict: real but small (Brier −0.1 to −0.3%); home and B2B ≈ 0.
22. Cross-season carryover (CARRY_N = 8) + season-phase cell (OCT/NOV/MID/APR ratios fit on train seasons with a predecessor). Without them October had zero projections.
23. 3PM is a compound model (tier on 3PA/36; makes | attempts Binomial — var ratio 0.94); FTM likewise on FTA.

**Results (both seasons; ladder max pp / confidence-band misses; 2025-26 | 2024-25 holdout)**
24. CERTIFIED: points 1.2/0 | 1.2/0; rebounds 0.7/1 | 0.9/0; assists 1.5/0 | 0.7/2; 3PM 1.2/1 | 1.2/1; FGA 1.0/0 | 1.1/0; FTM 0.8/0 | 1.8/1.
25. CLOSE (2–5 bands per season off by 2.6–4.4pp): blocks (borderline), steals, turnovers, fouls. REGIME: 3PA (sign flips with the league 3PA swing).
26. Combos (joint structure on calibrated marginals, player covariance): P+R, P+A, R+A, PRA, fantasy certified; stocks close. Double-double: Gaussian copula on calibrated marginals with the exact trivariate term — calibrated.
27. Periods: points 1H and 4Q certified both seasons; 1Q points at standard; 2H points at standard on 2025-26; 1Q rebounds/assists/threes at or near standard; Sleeper OT-exclude = same recipe, one flag. Star Q4 minutes by state: close 9.0 (3% sit), medium 7.6 (9%), blowout 3.5 (45% sit).
28. Season opening: coverage Oct 85% / Nov 90%; carryover over-projects ~5pp in October and under-projects 5–7 in April on both seasons; phase cell fixes it (points Oct −4.8 → −0.1). Expect 2–5pp band noise for 2–3 weeks; rookies have no carryover.
29. Fantasy scale on all three apps: points 1, rebounds 1.2, assists 1.5, blocks 3, steals 3, turnovers −1 (official PrizePicks page; a third-party sheet saying 2/2 is to be re-verified at season start).
30. PP/Underdog include OT everywhere; Sleeper quarter markets exclude it.

**Production**
31. Builders are patchers over the certified harnesses: `nba/baseline/build_baseline_ladder.py`, `build_combos_ladder.py`, `build_periods_ladder.py`. Each patch asserts its anchor and fails loudly.
32. Production = backtest + virtual slate rows (schedule games on ASOF × each team's last-3-games roster) + daily-exact as-of cutoff + ladder writer. `BT_REPLAY=1` replays any past day.
33. Output: `nba/data/nba_baseline_ladder_<ASOF>.json` (+ `_latest.json`), one row per distinct line: player, team, game, prop, period, ot_rule, line, anchor, offset, p_more, p_less, p_raw, role_tier, var_band.
34. Loader: worker `alphadog-v2-nba-baseline-ladder` (bridge target `NBA_BASELINE_LADDER_WORKER`) → `nba_score.baseline_ladder` (PK asof, player_id, game_id, prop, period, ot_rule, line) + `baseline_ladder_runs`. Verified 17,376 rows / 173 players / 11 props for the replayed 2026-03-15.
35. Replay of 2026-03-15: 43 of 173 roster players did not play — that is the enrichment layer's job (injury report, lineups). The baseline carries derived backups only.
36. Daily order once live: delta scrape → delta workers (5 steps) → ladder build on Actions (~2 h) → loader → enrichment (future).

**Ops facts**
37. Workflows fire on trigger files: `nba/TRIGGER_NBA_SCRAPE.txt`, `TRIGGER_NBA_DAILY_DELTA.txt`, `TRIGGER_NBA_BACKTEST.txt`, `TRIGGER_NBA_PERIODS.txt`, `TRIGGER_NBA_BASELINE.txt` (`asof:` / `replay:` lines), plus `workflow_dispatch`.
38. Sandbox limits: foreground runs ≤ ~540 s (run one prop pair or one period/prop per call); background processes die at turn end; stats.nba.com is unreachable from the sandbox; the bridge tools can be unavailable for a turn (work locally, push later).
39. The admin-sql bridge `run_job` target enum can lag a new worker binding after deploy — retry later rather than assuming it is blocked.
40. The v29 re-certification (carryover + phase for all props, both seasons) was triggered 2026-09-09 ~20:11 UTC — read `nba/backtest/reports/classification_final_*` / `classification_ext_*` before quoting §24–§25 as final under v29.

---

## 4. Where everything lives

**Documents (repo `nba/`)**: this file; `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md` (baseline phase, deepest); `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md` (infra, all tables with row counts, all workers with endpoints, sources, bugs); `NBA_CLASSIFICATION_BASELINE_DESIGN.md` (the locked design); `NBA_PROJECT_LOG.md` (standing chronological log); `NBA_LESSONS_LEARNED_FROM_MLB.md` (Parts A–G); `NBA_ENRICHMENT_FACTORS_RESEARCH.md` (static/weekly factor research); `NBA_BASELINE_METHODOLOGY.md`; `NBA_HISTORICAL_BACKFILL_PLAN.md`; `NBA_SYSTEM_DRAFT.md`; `NBA_ARCHITECTURE_BLUEPRINT.md`; `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md`; `NBA_AVAILABLE_TOOLS.md`.

**Code**: scrapers `nba/scrape_nba_*.py`; season utility `nba/nba_season.py`; delta sync `nba/sync_season_files_from_delta.py`; workers `nba/alphadog-v2-nba-*.js` (manifest `nba/worker_manifest_nba.json`; configs generated by `generate_wrangler_configs.py`; bridge targets in `alphadog-v2-admin-sql.js`); backtests `nba/backtest/*.py`; production builders `nba/baseline/*.py`; workflows `.github/workflows/nba-*.yml`.

**Data**: `nba/data/` (game logs per season, advanced, team logs, four factors, scoring, quarters `_q1..4_`, schedule, delta files, baseline ladders, diagnostics).

**Postgres (Hyperdrive, via bridge `run_sql_postgres`)**: schemas `nba_ref`, `nba_calendar`, `nba_team`, `nba_stats`, `nba_daily`, `nba_context`, `nba_market`, `nba_archive`, `nba_score`, `nba_scoring`, `nba_backtest`, `nba_classification`, `nba_config`, `nba_control`. Key tables: `nba_config.classification_config` (25+ keys — the recipe's decisions with evidence), `calibration_log`, `factor_registry`, `factor_relevance`, `factor_profile_cells`, `role_tiers`, `variation_bands`, `stat_decay_config`, `worker_definitions`; `nba_ref.prop_taxonomy` (28 props); `nba_score.baseline_ladder`.

**Reports**: `nba/backtest/reports/` — `classification_final_two_season_status.md` (scoreboard + factor + period sections), `classification_final_<season>_<props>.md/json`, `classification_ext_*`, `combos_<season>.md`, `periods_<season>_<ot>_<period>_<prop>.md`, `minutes_model_v1.md`.

---

## 5. Procedures (exact)

- **Daily delta**: bump `nba/TRIGGER_NBA_DAILY_DELTA.txt` → `run_job(NBA_DAILY_DELTA_WORKER, "run")` → `run_job(NBA_STATIC_MEASURE_TYPES_WORKER, "run", extra={"file_prefix":"nba/data/nba_delta_"})` → `NBA_STATIC_STARTER_STATUS_WORKER` → `NBA_STATIC_GAME_OFFICIALS_WORKER`. The delta workflow itself already mirrors season files, refreshes quarters and the schedule.
- **Baseline ladder for a day**: set `asof: YYYY-MM-DD` (and `replay: 1` for a past day) in `nba/TRIGGER_NBA_BASELINE.txt`, push; wait ~2 h; then `run_job(NBA_BASELINE_LADDER_WORKER, "run", extra={"asof":"YYYY-MM-DD"})`; verify with `SELECT prop, COUNT(*) FROM nba_score.baseline_ladder WHERE asof='...' GROUP BY prop`.
- **Backtest**: bump `nba/TRIGGER_NBA_BACKTEST.txt`; reports commit to `nba/backtest/reports/`. Locally: `BT_TRAIN=2023-24,2024-25 BT_TEST=2025-26 BT_PROPS=points,rebounds python3 nba/backtest/classification_ladder_v12.py` (≤540 s per pair); holdout = `BT_TRAIN=2023-24 BT_TEST=2024-25`.
- **Quarter data refresh**: bump `nba/TRIGGER_NBA_PERIODS.txt` (3 seasons) or rely on the daily delta (`PERIODS_SEASONS=1`).
- **Weekly static**: bump `nba/TRIGGER_NBA_SCRAPE.txt` then the static workers; backfill worker `{"mode":"weekly"}` loads splits + career.
- **Reading results**: `summarize.py` pattern — ladder max |gap| over 13 rungs, confidence bands with n≥1000 over 2.5pp, worst band×direction×rung cells (n≥500, >2.5pp).

---

## 6. Question → document index

| If asked about… | Open |
|---|---|
| any table, row count, worker endpoint, source reliability, an early bug | 09-04 checkpoint |
| the season utility, measure types, DvP recurring, per-game delta, the 5-step daily procedure | 09-09 checkpoint §1 |
| why the design is what it is (tiers, ladder, component model, combos, periods, factors) | `NBA_CLASSIFICATION_BASELINE_DESIGN.md`; 09-09 checkpoint §2 |
| how the backtest runs, env vars, limits, files | 09-09 checkpoint §3 |
| minutes model numbers, blowout/B2B corrections, the leakage bug | 09-09 checkpoint §4 |
| why a specific recipe choice exists (cell mode, λ, k, guards, Platt, band cells, zero-adjust) | 09-09 checkpoint §5 table + `nba_config.classification_config` key |
| current accuracy of any prop / combo / period | 09-09 checkpoint §6; `reports/classification_final_two_season_status.md` |
| the first days of the season, October/April behavior | 09-09 checkpoint §7; config key `season_opening_study` |
| how production builds the ladder, the loader, Postgres, daily plumbing | 09-09 checkpoint §8 |
| what is not built, known residuals | 09-09 checkpoint §10–§11 |
| what was tried and rejected | config key `rejected_on_data`; 09-09 checkpoint §5 |
| lessons / standards | `NBA_LESSONS_LEARNED_FROM_MLB.md` Parts E, F, G |
| static/weekly factors already sourced (DARKO, tracking, on/off, lineups, DvP, officials) | `NBA_ENRICHMENT_FACTORS_RESEARCH.md`; 09-04 checkpoint |
| enrichment (daily-mined) factors, mining, backfill | `NBA_ENRICHMENT_FACTOR_LOCK.md` (being written) |
| chronological "what happened when" | `NBA_PROJECT_LOG.md` |

---

## 7. Maintenance rule

Whenever a phase closes or a decision changes: update the relevant checkpoint section, add a `NBA_PROJECT_LOG.md` entry, update the config key, and update §2/§3/§6 of this file. This file is the map; the checkpoints are the territory.
