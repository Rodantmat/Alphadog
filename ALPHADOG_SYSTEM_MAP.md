# ALPHADOG SYSTEM MAP — LIVING DOCUMENT (mapping phase, read-only reconnaissance)

**Purpose:** Full inventory of every worker, job_key, and orchestrator dispatch path, BEFORE any orchestrator cleanup/purge work begins. Nothing in the system has been modified to produce this document — it is 100% read-only reconnaissance (SQL SELECTs, GitHub file reads/greps). No deploys, no writes, no schema changes.

**Status: PHASE 1 IN PROGRESS.** This is a continuous, multi-session effort. Sections marked `[TODO]` have not been mapped yet. Do not assume anything not explicitly documented here.

**Ground rules for whoever (Claude instance) continues this:**
- Read this whole doc before touching anything else.
- Everything claimed here is checkable via the same tools (`run_sql`, `github_get_file`, `github_grep_file`). If unsure, re-verify — don't assume it's still true.
- This is mapping only. Do NOT edit the orchestrator, do NOT deploy anything, do NOT run jobs, while this doc is incomplete.
- Update this doc (append, don't rewrite) as you go, and re-commit to repo root as `ALPHADOG_SYSTEM_MAP.md` after each meaningful chunk of work, so progress isn't lost between ticks.

---

## 0. TOP-LEVEL FACT: THE REGISTRY IS THE GROUND TRUTH FOR "WHAT WORKERS EXIST"

Two structured tables give the authoritative, static inventory — much more reliable than eyeballing 130+ file names in the repo:

- **`CONFIG_DB.config_worker_definitions`** — 116 rows. Columns: `worker_name, job_key, worker_group, phase_key, display_name, enabled, owns_db_binding, schedule_profile_key, max_tick_ms, max_api_calls_per_tick, max_rows_per_tick, retry_limit, stale_minutes, downstream_policy, notes`. This is the "config" view — tick budgets, retry limits, staleness thresholds per worker.
- **`CONTROL_DB.control_worker_registry`** — 116 rows, same worker_name/job_key/group/phase_key, plus **`endpoint_url`** (real `https://alphadog-v2-<name>.rodolfoaamattos.workers.dev`) and **`service_binding_name`** (the Cloudflare service binding, e.g. `PHASE2B_RECENT_FORM_WORKER`) and `safe_mode` (all currently `1`).

**These two tables agree on worker_name/job_key/group/phase_key for the vast majority of rows — but NOT all.** See Section 2 for the important exceptions.

### 15 worker_groups (from `config_worker_definitions`, GROUP BY worker_group):
| Group | phase_key | # workers |
|---|---|---|
| 00 System | system | 6 |
| 01 Static | static | 10 |
| 02 Base | base | 10 |
| 03 Delta | delta | 11 |
| 04 Daily | daily | 12 |
| 05 Market | market | 7 |
| 06 Phase 2A | phase2a | 6 |
| 07 Phase 2B | phase2b | 9 |
| 08 Phase 3A | phase3a | 5 |
| 09 Phase 3B | phase3b | 9 |
| 10 Phase 3C | phase3c | 7 |
| 11 Score | score | 21 |
| 11 Scoring | scoring | 1 (score-final-board) |
| 12 Full Runs | daily_master | 1 (orchestrator itself) |
| Final Scoring System | final_scoring_system | 1 (phase3a-first-inning-pitcher-context, job_key `expansion-baseline-v2`) |

Full worker_name/job_key/endpoint/service_binding table pulled and reviewed (116 rows) — see raw data captured this session for the complete listing; not reproduced in full here to keep this doc navigable. Re-run `SELECT worker_name, job_key, worker_group, phase_key, endpoint_url, service_binding_name FROM control_worker_registry ORDER BY worker_group, worker_name` any time to regenerate.

---

## 1. THE "12 Full Runs" ENTRY IS MISLEADING — THE ORCHESTRATOR RUNS *THREE* SEPARATE FULL-RUN CHAINS, NOT ONE

`config_worker_definitions` only lists ONE row for "12 Full Runs" (`daily-full-run`, "Expansion V3 Daily Full Run: Board + Daily Context + Market/Scoring" — described as "Top-level twice-daily parent chain for Daily Context Full Run, Board Full Run, and Market/Scoring Full Run"). Per Rodolfo's own project memory (confirmed independently, not just trusting the registry note), the Daily Full Run now has **separate `market-full-run` and `scoring-full-run` stages** (replacing an older combined stage), scheduled 7:00 AM Pacific — i.e. this single registry row is really an umbrella over multiple distinct chain-runner code paths inside the 1.4MB orchestrator file. **`[TODO]`: locate and map each of these chain-runner arrays/functions individually** (Daily Context Full Run chain, Board Full Run chain, Market Full Run chain, Scoring Full Run chain — the last one is mapped in Section 2 below).

---

## 2. THE SCORING FULL RUN CHAIN — FULLY MAPPED, INCLUDING A CRITICAL PHYSICAL-FILE-REUSE PATTERN

**Location in orchestrator:** `SCORING_FULL_RUN_STAGES` array, `alphadog-v2-orchestrator.js` line 6318–6327 (confirmed via `github_grep_file` this session).

The 8 stages, **stage_key → job_key → physical worker_name that actually executes it**:

| # | stage_key | job_key | worker_name (physical file that runs this) | Notes |
|---|---|---|---|---|
| 1 | scoring_certifier_first_pass | `scoring-full-run-certifier` | **alphadog-v2-phase3b-certifier** | Same physical file as the real "09 Phase 3B" Daily Context certifier |
| 2 | scoring_prop_factor_miner | `prop-factor-miner` | **alphadog-v2-phase2b-recent-form** | Same physical file as the real "07 Phase 2B" Recent Form worker |
| 3 | scoring_matrix_builder | `prop-matrix-builder` | **alphadog-v2-phase2b-certifier** | Same physical file as the real "07 Phase 2B" certifier |
| 4 | scoring_enrichment_engine | `enrichment-engine` | **alphadog-v2-phase2a-run-environment** | Same physical file as the real "06 Phase 2A" Run Environment worker |
| 5 | scoring_engine | `scoring-engine-shadow-v1` | **alphadog-v2-phase3a-certifier** | Same physical file as the real "08 Phase 3A" certifier |
| 6 | scoring_hit_probability_board | `hit-probability-board` | **alphadog-v2-phase3c-certifier** | Same physical file as the real "10 Phase 3C" certifier |
| 7 | scoring_final_board | `score-final-board` | **alphadog-v2-score-final-board** | Dedicated physical file, listed in registry under "11 Scoring" |
| 8 | scoring_certifier_last_pass | `scoring-full-run-certifier` | **alphadog-v2-phase3b-certifier** | Same as stage 1 |

### CRITICAL: 5 of these 8 stages are NOT separate physical workers. They are additional logical roles bolted onto existing Daily Context worker files, selected at runtime by `job_key` (and double-checked against `worker_name` — see below).

This means: **`alphadog-v2-phase3b-certifier.js`, `alphadog-v2-phase2b-recent-form.js`, `alphadog-v2-phase2b-certifier.js`, `alphadog-v2-phase2a-run-environment.js`, and `alphadog-v2-phase3a-certifier.js` each do double duty** — their original Daily Context Phase 2A/2B/3A/3B/3C job, AND a completely different Scoring Full Run stage. Only `alphadog-v2-score-final-board.js` is a dedicated single-purpose file among the 8 stages.

**This is the single biggest risk factor for the planned orchestrator cleanup/purge.** Any future refactor that assumes "one worker file = one job" and tries to split/simplify/delete based on the Daily Context registry entry alone would break the Scoring Full Run chain silently. **Do not touch any of these 5 files' dispatch logic without re-confirming both roles are preserved.**

### How the orchestrator tells the two roles apart (the actual safety mechanism)
Found guard functions near line 390–410 and 696–700 of the orchestrator, e.g.:
```
function isScoringFullRunCertifierJob(row) {
  const job = row.job_key; const worker = row.worker_name;
  return job === "scoring-full-run-certifier" && worker === "alphadog-v2-phase3b-certifier";
}
function isEnrichmentEngineJob(row) {
  return job === "enrichment-engine" && worker === "alphadog-v2-phase2a-run-environment";
}
function isScoringEngineShadowJob(row) {
  return job === "scoring-engine-shadow-v1" && worker === "alphadog-v2-phase3a-certifier";
}
function isHitProbabilityBoardJob(row) {
  return job === "hit-probability-board" && worker === "alphadog-v2-phase3c-certifier";
}
```
i.e. **both** `job_key` AND `worker_name` must match together — this is the exact-pairing safety check that prevents the orchestrator from routing a Scoring stage job to the wrong physical worker (or vice versa). Any cleanup that renames/consolidates workers MUST preserve this exact-pairing check or update every one of these guard functions in lockstep. There is a stage config field `exact_worker_only: true` reinforcing this (seen at line ~1329 for `prop-factor-miner`, with `logical_worker_name: "alphadog-v2-prop-factor-miner"` vs `deployed_worker_slot: "alphadog-v2-phase2b-recent-form"` — the orchestrator has an internal naming convention distinguishing the **logical** (conceptual) worker name from the **deployed** (actual file) slot precisely because of this reuse pattern).

### Confirmed live run (verified this session, cross-checked against CONTROL_DB, not just the handoff doc)
`request_id = scoring_full_run_mrkwjvf8_nc2obg`, `chain_id = chain_scoring_full_run_mrkwjvf8_nc2obg` — all 9 rows (parent + 8 stages) `status='completed'`, 2026-07-14 17:05:31–17:07:43. Ran against 0 real rows (All-Star break; `score_board_prepared_current` stale at `official_date=2026-07-12`, 6,315 rows). `score_final_board_current` / `scoring_engine_current` / `hp_board_current` all correctly 0 rows.

### `[TODO]` still needed for this section:
- Read `alphadog-v2-score-final-board.js` in full (119KB) — the only dedicated file in this chain, holds calibration/quota-reserve/soft-exposure logic never yet exercised on real data.
- Read the `mode`-based branching inside each of the 5 dual-purpose files to see exactly how they decide "am I doing my Daily Context job or my Scoring job" — i.e. find the `if (mode === "enrichment_run")` (or similar) top-level switch inside `phase2a-run-environment.js`, and the equivalent in the other 4 dual-purpose files.
- Map what tables each of the 8 stages reads/writes (partially known from handoff: `score_board_prepared_current` → prop factor packets → matrix → enrichment tiers → `scoring_engine_current` → `hp_board_current` → `score_final_board_current`, but not yet independently verified table-by-table via schema/grep).

---

## 3. OTHER JOB_KEY MULTIPLEXING FOUND SO FAR (same pattern, different chain)

From the same grep, found this is NOT unique to the Scoring Full Run — the **Board/Market Full Run** stages list (~line 1280–1332) uses the identical logical-vs-deployed pattern:
- `market-line-shape-classifier` job_key is reused across TWO stage_keys (`market_context_hitters` and `market_context_pitchers`) on the same physical worker, distinguished by `mode` (`market_hitter_prop_line_context` vs `market_pitcher_prop_line_context`).
- `prop-factor-miner` job_key is likewise reused across `prop_factor_hitters` / `prop_factor_pitchers` stage_keys on `alphadog-v2-phase2b-recent-form`, distinguished by `mode` + `factor_family` (`hitter`/`pitcher`).
- There is also a `score-enrichment-v1` job_key at line 1291 running on **`alphadog-v2-score-audit`** (the orphaned 431KB file previously decided to leave untouched) with mode `score_enrichment_v1_side_expanded` — **`[TODO]: confirm this is genuinely dead/unused and not a live third chain that touches the orphaned file.`** This needs verification before any cleanup near score-audit.js.

**Working hypothesis (not yet fully confirmed): the orchestrator's design pattern throughout is "one physical worker file, many logical job_keys/modes," not "one file per job."** This must be assumed true for every file in the system until individually disproven — i.e. do not assume a Daily Context worker file with a small size (~5.3KB, likely a thin stub) has no Scoring-side or Board-side second role without checking the SCORING_FULL_RUN_STAGES-style arrays and the guard functions first.

---

## 4. FILE SIZE IS A SIGNAL, NOT PROOF — MANY "PHASE" FILES ARE THIN STUBS, A FEW ARE ENORMOUS

Noted during repo listing (`github_list_dir` at root, 2026-07-14):
- **Enormous, clearly-real-logic files**: `alphadog-v2-orchestrator.js` (1.4MB, 20,027 lines — the file to be purged/cleaned up later), `alphadog-v2-certification-center.js` (508KB, main UI), `alphadog-v2-control-room.js` (392KB), `alphadog-v2-score-audit.js` (431KB, orphaned per prior decision), `alphadog-v2-phase3a-first-inning-pitcher-context.js` (699KB — this is the "Final Scoring System" / Baseline V5 file, job_key `expansion-baseline-v2`, a completely different thing from its file name would suggest), `alphadog-v2-base-hitter-game-logs.js` (223KB), several other `base-*` files (100–170KB each), `alphadog-v2-market-line-shape-classifier.js` (136KB), `alphadog-v2-phase2b-recent-form.js` (85KB), `alphadog-v2-phase2b-pitcher-role.js` (75KB), `alphadog-v2-score-final-board.js` (119KB), `alphadog-v2-score-prep.js` (83KB), `alphadog-v2-delta-certifier.js` (121KB), `alphadog-v2-daily-*` (mostly 50-90KB, real logic), `alphadog-v2-market-normalizer.js` (86KB), `alphadog-v2-parlay-sleeper-board.js` / `-underdog-board.js` (~58KB each), `alphadog-v2-prizepicks-github-board.js` (95KB).
- **Suspiciously uniform ~5.3KB stub files** (dozens of them, nearly identical sizes — 5321 to 5371 bytes): almost every `phase2a-*`, `phase2b-batting-order/bullpen-matchup/handedness-matchup/hitter-role/lineup-protection/opposing-starter-matchup`, all of `phase3a-hrr/rbi/rfi-nrfi/runs-context`, all of `phase3b-*-context` (except none seem large), all of `phase3c-*-context`, all `score-*` prop-specific files (score-doubles, score-earned-runs, score-fantasy, score-hits, etc. — 20 of the 21 in "11 Score"; only `score-prep` and `score-final-board` are large), `static-certifier`/`config-manager`/`safe-cleaner`/`system-health`/`admin-sql`(37KB, bigger)/`base-certifier`/`daily-batting-orders`/`daily-confirmed-starters`/`daily-roof-status`/`delta-*` (most of them)/`gbdt-auto-trigger`. **`[TODO]`: confirm what these stub files actually contain** — likely candidates: (a) genuine placeholder/boilerplate workers not yet implemented, (b) thin routers that just forward to the orchestrator or another worker, (c) real small workers that are simply not very complex. Do not assume any of these are dead code without opening at least one representative file per family and checking.

This size pattern itself is a mapping clue: **the real logic for most of the 21 individual prop-specific "Score" workers, and most of the phase2a/phase3a/phase3b/phase3c "context" workers, likely lives centrally (probably in the orchestrator itself, or in a small number of shared library-like large files) rather than in each thin per-prop file.** This needs to be confirmed, not assumed — but if true, it materially changes the cleanup strategy (the orchestrator may be large partly *because* it inlines logic for 40+ nominally-separate workers).

---

## 5. WHAT HAS **NOT** BEEN MAPPED YET (explicit honest gap list — next phases)

- [ ] Daily Context Full Run chain (9-stage, per handoff) — stage list, job_keys, physical workers, table read/writes. Predates Scoring Full Run; described in handoff doc further down but not independently re-verified this session.
- [ ] Board Full Run chain (PrizePicks + Sleeper + Underdog + Score Prep) — stage list, job_keys, physical workers.
- [ ] Market Full Run chain (`market-full-run` stage per project memory) — how it differs from the old combined stage, its own stage array location in the orchestrator.
- [ ] Static Full Run and Static Full Run Differential — never yet located in this mapping session.
- [ ] Incremental Morning Full Run (`README_INCREMENTAL_MORNING_FULL_RUN.txt` exists at repo root — unread this session).
- [ ] Base phase full run / backfill jobs (`historical-season-backfill` job_key seen live in CONTROL_DB this session — `team_bullpen_backfill_test3`, tick_count 472, still pending at priority 0 — its own stage structure not mapped).
- [ ] Delta phase chain in detail (11 workers in "03 Delta" group — only inventoried by name/endpoint, not read).
- [ ] Each of the 21 "11 Score" per-prop workers — confirm which are thin routers vs real calculators.
- [ ] Full read of `alphadog-v2-score-final-board.js` (quota-reserve/soft-exposure/clustering logic, never exercised on real data).
- [ ] Full read of `alphadog-v2-control-room.js` (392KB) — the allowlist/routing gate structure (only the one recent fix, the `orchestrator_enqueue_scoring_full_run` allowlist entry near line 928–956, has been located; the rest of the file's routing table is unmapped).
- [ ] Config tables not yet inspected: `config_scoring_profiles`, `config_scoring_rules`, `config_enrichment_factors`, `config_enrichment_profile_cells`, `config_metric_calibration_profiles`, `config_metric_definitions`, `config_metric_formula_versions`, `config_metric_thresholds`, `config_metric_windows`, `config_certification_rules`, `config_source_priority`, `config_line_shape_policy`, `config_prop_taxonomy`, `config_refresh_windows`, `calibration_config`.
- [ ] `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md` — locked design doc for future Enrichment/Final Scoring rebuild; not yet read this session (per Rodolfo's instructions, only needs reading when calibration work actually comes up, but should be read before that phase of cleanup regardless).
- [ ] `WORKER_MANIFEST.json` / `worker_manifest.json` / `worker_manifest_schema_seed.json` — three separate manifest files at repo root, relationship between them and `config_worker_definitions`/`control_worker_registry` not yet established (possible redundancy/drift risk worth flagging for cleanup).
- [ ] `config_scheduled_jobs` (CONTROL_DB per project memory says CONFIG_DB — confirm which DB actually holds authoritative cron schedule) — not yet queried this session.

---

## 6. METHODOLOGY NOTE FOR CONTINUATION

Given the orchestrator is 1.4MB / 20,027 lines and cannot be fetched in full, the efficient approach that worked well this session:
1. Use `config_worker_definitions` / `control_worker_registry` SQL queries first — cheap, structured, authoritative for "what exists."
2. Use `github_grep_file` with a specific pattern (job_key strings, stage array names, function names) rather than reading whole files — cheap and targeted.
3. Only fall back to reading a full physical file when grep results show it's genuinely small, or when a specific claim needs full-context confirmation.
4. Cross-check every claim against real running data (CONTROL_DB `control_job_queue`, `control_worker_run_log`, actual table row counts) wherever possible — the registry describes intent, not necessarily current behavior.

No writes, no deploys, no job runs performed to produce this document — confirmed read-only session.

---

## 7. PHASE 2 — ALL 9 FULL-RUN STAGE ARRAYS LOCATED AND MAPPED (2026-07-14, continuation)

Found via a single grep for `const [A-Z_]*_STAGES = \[` across the orchestrator: there are exactly **9** stage arrays in the whole 20,027-line file. All 9 are now located and their stage lists captured. This closes out most of Section 5's gap list.

### 7.1 Confirmed: the top-level "Daily Full Run" really is just an umbrella over 4 sub-chains
`DAILY_FULL_RUN_STAGES` (line 2556) — exactly 4 stages, each of which re-dispatches back into the orchestrator itself (`worker_name: "alphadog-v2-orchestrator"` for all 4 — this parent chain doesn't call external workers directly, it calls its own other chain-runner functions):
1. `board_full_run` (job_key `board-full-run`) → runs **Section 7.2 (Board Full Run)**
2. `daily_context_full_run` (job_key `daily-context-full-run`) → runs **Section 7.4 (Daily Context Full Run)**
3. `market_full_run` (job_key `market-full-run`) → runs **Section 7.3 (Market Full Run)**
4. `scoring_full_run` (job_key `scoring-full-run`) → runs the **Scoring Full Run chain already mapped in Section 2**

Explicit code comment at line 2557–2560 (v0.2.280) confirms a real fixed ordering bug: *"Board/Score Prep must run before Daily Context. Daily context sidecars filter by prepared-board pickable/current rows; running them before board refresh produced false VALID_ZERO/NOT_APPLICABLE for weather, bullpen, umpire, availability, and team schedule despite calendar/source availability."* — i.e. the 4-stage order (Board → Daily Context → Market → Scoring) is load-bearing, not arbitrary.

### 7.2 Board Full Run (`BOARD_FULL_RUN_STAGES`, line 735) — 4 stages, fully mapped
| stage_key | job_key | worker_name |
|---|---|---|
| board_prizepicks_refresh | prizepicks-github-board | alphadog-v2-prizepicks-github-board |
| board_sleeper_refresh | parlay-sleeper-board | alphadog-v2-parlay-sleeper-board |
| board_underdog_refresh | parlay-underdog-board | alphadog-v2-parlay-underdog-board |
| score_prep_enrichment | score-prep | alphadog-v2-score-prep |

Clean 1:1 mapping, no reuse tricks in this chain — matches project memory's "PrizePicks + Sleeper + Underdog + Score Prep" description exactly.

### 7.3 Market Full Run (`MARKET_FULL_RUN_STAGES`, line 6019) — 5 stages, fully mapped
| stage_key | job_key | worker_name |
|---|---|---|
| market_certifier_first_pass | market-certifier | alphadog-v2-market-certifier |
| market_teams | market-normalizer | alphadog-v2-market-normalizer |
| market_hitters | market-line-shape-classifier | alphadog-v2-market-line-shape-classifier |
| market_pitchers | market-line-shape-classifier | alphadog-v2-market-line-shape-classifier (same file, mode-switched — hitter vs pitcher) |
| market_certifier_last_pass | market-certifier | alphadog-v2-market-certifier |

### 7.4 Daily Context Full Run (`DAILY_CONTEXT_FULL_RUN_STAGES`, line 11887) — 9 stages, 8 distinct workers
| stage_key | job_key | worker_name |
|---|---|---|
| daily_context_certifier_first_pass | daily-certifier | alphadog-v2-daily-certifier |
| daily_starters | daily-probable-pitchers | alphadog-v2-daily-probable-pitchers |
| daily_lineups | daily-lineups | alphadog-v2-daily-lineups |
| daily_player_availability | daily-player-availability | alphadog-v2-daily-player-availability |
| daily_weather_roof | daily-weather | alphadog-v2-daily-weather |
| daily_bullpen_availability | daily-bullpen-availability | alphadog-v2-daily-bullpen-availability |
| daily_team_schedule_spot | daily-team-schedule-spot | alphadog-v2-daily-schedule |
| daily_umpire_context | daily-umpire-context | alphadog-v2-daily-usage-pulse |
| daily_context_certifier | daily-certifier | alphadog-v2-daily-certifier |

**Gap found:** the "04 Daily" registry group has 12 workers, but only 8 distinct ones appear in this chain. **`daily-batting-orders`, `daily-confirmed-starters`, `daily-games-status`, and `daily-roof-status` are registered workers that do NOT appear in the Daily Context Full Run stage list at all.** Working theory, not yet confirmed: `daily_weather_roof`'s display name ("Daily Weather / Roof") suggests roof status was folded into the weather worker rather than run standalone, and per the 2026-07-14 handoff, Catcher Context was folded into the Lineups worker — plausibly batting orders / confirmed starters were folded into `daily-lineups` / `daily-probable-pitchers` similarly. `daily-games-status` may belong to a different chain (calendar/board) rather than Daily Context. **`[TODO]`: confirm whether these 4 workers are (a) genuinely dead/orphaned, (b) called by a different trigger path not yet found, or (c) their functionality was absorbed into a sibling worker. Do not assume dead without checking control_job_queue history for these job_keys.**

### 7.5 Incremental Morning Full Run (`INCREMENTAL_MORNING_FULL_RUN_STAGES`, line 3492) — 16 stages, richest chain found so far
Order: Calendar/Tally precheck (delta-certifier) → 7 base-layer deltas (hitter/pitcher/team game logs, starter/bullpen history, hitter/pitcher splits) → Calendar/Tally source-repair recheck → 4 Expansion stages (delta mining, line inventory delta, delta sanity, delta HP) all running on **the same physical file, `alphadog-v2-phase3a-first-inning-pitcher-context`**, job_key `expansion-baseline-full-run` with 4 different `mode` values → hitter/pitcher metrics affected-delta → 2 Baseline V5 stages (classification daily delta, HP daily delta) **also on the same physical file**, job_key `expansion-baseline-v2` → Calendar/Tally final check.

**This confirms `alphadog-v2-phase3a-first-inning-pitcher-context.js` (699KB) is the single most overloaded physical file found in this mapping so far** — it serves at least 6 distinct logical roles across 2 job_keys (`expansion-baseline-full-run` ×4 modes, `expansion-baseline-v2` ×2 modes) inside this one chain alone, on top of its "Final Scoring System" registry entry (job_key `expansion-baseline-v2-full-run`, per the `isExpansionBaselineJob` guard function found in Section 2's grep, which lists 6 total job_key aliases routing to this one file: `expansion-baseline-full-run`, `expansion-baseline-line-inventory`, `expansion-baseline-sanity`, `expansion-baseline-hp`, `expansion-baseline-v2`, `expansion-baseline-v2-full-run`). **Any cleanup of this file requires the most caution of any file in the system.**

Explicit ordering-dependency comments found in code (v0.2.342, v0.2.343): source layers/expansion/metrics must fully complete before Baseline V5 classification runs; Baseline V5 HP delta requires Baseline V5 classification delta to have completed first; final Calendar/Tally blocks on both baseline layers. This is a real, deliberate dependency chain, not incidental ordering.

### 7.6 Static Full Run (`STATIC_FULL_RUN_STAGES`, line 3518) — 8 stages, contains a cross-group reuse surprise
| job_key | worker_name | Note |
|---|---|---|
| static-teams | alphadog-v2-static-teams | 1:1 |
| static-stadiums | alphadog-v2-static-stadiums | 1:1 |
| static-park-factors | alphadog-v2-static-park-factors | 1:1 |
| static-players | alphadog-v2-static-players | 1:1 |
| static-prop-taxonomy | alphadog-v2-static-prop-taxonomy | 1:1 |
| static-pitcher-arsenal | **alphadog-v2-static-player-aliases** | Reused — "Static Pitcher Arsenal" is NOT its own file, it runs on the Player Aliases worker |
| static-defensive-quality | **alphadog-v2-delta-bullpen-update** | Reused — and this one crosses group boundaries: a "Static" stage running on a "03 Delta" group worker |
| static-certifier | alphadog-v2-static-certifier | 1:1 |

**Gap found:** 3 of the 10 registered "01 Static" workers — `static-rosters`, `static-team-context`, `static-player-identity` — are NOT part of this Static Full Run chain. `static-player-identity` and `static-team-context` are however used elsewhere (see 7.7 below), so they're not orphaned, just not part of *this* chain. `static-rosters` has no known caller found yet — `[TODO]`.

Also found a real historical bug note in code (line ~9298-9302): `processStaticCertifierJob` — the actual handler function — was missing entirely even though the dispatch-guard function and call site existed, causing a crash (`"processStaticCertifierJob is not defined"`) on the final stage of a live Static Full Run test. This has since been fixed (function now exists, confirmed present). Documented here as a precedent: **the codebase has a history of dispatch-guard/call-site being added before the actual handler function, i.e. "wired but not implemented" bugs are a known recurring failure mode in this system** — worth checking for elsewhere during cleanup.

### 7.7 Context History Full Run (`CONTEXT_HISTORY_FULL_RUN_STAGES`, line 9305) — smallest chain, 2 stages
| job_key | worker_name |
|---|---|
| context-history-snapshot | alphadog-v2-static-player-identity |
| context-history-certifier | alphadog-v2-static-team-context |

Both are **reused** Static-group workers (not their nominal Static role) — same multiplexing pattern again. Requires a `target_date` in parent input or fails fast (`BLOCKED_CONTEXT_HISTORY_FULL_RUN_NO_TARGET_DATE`). Purpose (why history snapshots are taken) not yet investigated — `[TODO]`.

### 7.8 The old combined Market+Scoring chain (`MARKET_SCORING_FULL_RUN_STAGES`, line 1284) — CONFIRMED NOT DEAD, but confirmed INACTIVE since 2026-06-30
**Correction to the original hypothesis in this section (checked directly, not left as inference):** this chain is still fully wired and callable. `control_room.html` has a live button — `SCORING > Market Full`, `onclick="runJobButton('SCORING > Market Full','orchestrator_enqueue_market_scoring_full_run')"` — and `alphadog-v2-control-room.js` (line 2054+) still has a working handler for `orchestrator_enqueue_market_scoring_full_run` that inserts a real `control_job_queue` row with `job_key='market-scoring-full-run'`, `worker_name='alphadog-v2-orchestrator'`. This job_key is also present in the Control Room's own job-name allowlist (line 953).

**Confirmed via `control_job_queue` history (not inference):** last real run was `market_scoring_full_run_mr0ubxwc_dfe3hn`, created `2026-06-30 16:07:58`, completed. Multiple runs before that going back at least to `2026-06-26`, roughly half completed / half failed. **No runs since 2026-06-30** — i.e. this chain went unused starting about 2 weeks before the new split `MARKET_FULL_RUN_STAGES` + `SCORING_FULL_RUN_STAGES` chains were built and the Scoring Full Run was proven end-to-end (2026-07-14). This is consistent with it having been superseded operationally, even though it was never actually removed from the code or the UI.

**Revised assessment:** this is still a real cleanup candidate (~1,268 lines of orchestrator code plus its Control Room button/handler), but it is *inactive-and-superseded*, not *dead/unreachable*. Before removing: confirm with Rodolfo that no external tooling or muscle-memory workflow still relies on the `SCORING > Market Full` button, then remove the stage array, its handler function, the Control Room button, and the Control Room handler together as one atomic change (don't leave the button pointing at a removed handler, and don't remove the handler while the button still submits to it).

### 7.9 Control Room button inventory — found while investigating 7.8, worth its own note
`control_room.html` (embedded verbatim inside `alphadog-v2-control-room.js` as `CONTROL_ROOM_HTML`, i.e. the two files are not independently editable — the `.html` file at repo root and the string inside the `.js` are described in the file's own debug output as `"html_source":"embedded_worker_html_and_static_html_identical_safe_route_restore"`, meaning they're intentionally kept identical, not that editing one auto-updates the other) has **11 separate buttons in the SCORING section alone**: Enrich V2, HP V3, Final Score V2, Engine, Hit Prob, Simulation, Final Board V3, Legacy Final, Full Run (the new one, Section 2), Market Full (Section 7.8, legacy), Daily Full. Per the `isScoringEngineJob` guard function (Section 2's grep, line 707-711), at least 11 different job_key aliases (`scoring-engine`, `scoring-engine-simulation`, `hit-probability`, `hit-probability-v2`, `final-score-v1`, `final-board-v2`, `score-enrichment-v1`, `score-enrichment-v2-shadow`, `hit-probability-v3-shadow`, `final-score-v2-shadow`, `final-board-v3-shadow`) all still route to **`alphadog-v2-score-audit.js`** — i.e. **the "orphaned" score-audit.js file (431KB, per the 2026-07-14 handoff, deliberately left untouched) is still fully wired to live UI buttons and remains triggerable by hand**, even though it's not part of any automated Daily/Scoring Full Run path anymore. "Orphaned" in the handoff meant "not the active pipeline," not "unreachable."

**Confirmed via `control_job_queue` (checked this session, not inferred) — all 11 are dormant, and their last-run dates reveal a clean 3-generation history, all now superseded:**

| Generation | job_keys | Last real run | Runs / completed / failed |
|---|---|---|---|
| Gen 1 (oldest legacy) | `scoring-engine-simulation` | 2026-06-06 | 26 / 15 / 10 |
| Gen 1 (oldest legacy) | `scoring-engine` | 2026-06-14 | 64 / 55 / 8 |
| Gen 1 (oldest legacy) | `hit-probability` | 2026-06-14 | 50 / 39 / 5 |
| Gen 2 | `hit-probability-v2` | 2026-06-23 | 28 / 26 / 2 |
| Gen 2 | `final-score-v1` | 2026-06-23 | 30 / 30 / 0 |
| Gen 2 | `final-board-v2` | 2026-06-23 | 30 / 28 / 2 |
| Gen 3 ("v3 shadow") | `score-enrichment-v1` | 2026-06-30 | 43 / 36 / 0 |
| Gen 3 ("v3 shadow") | `score-enrichment-v2-shadow` | 2026-06-30 | 25 / 18 / 2 |
| Gen 3 ("v3 shadow") | `hit-probability-v3-shadow` | 2026-06-30 | 18 / 16 / 1 |
| Gen 3 ("v3 shadow") | `final-score-v2-shadow` | 2026-06-30 | 17 / 17 / 0 |
| Gen 3 ("v3 shadow") | `final-board-v3-shadow` | 2026-06-30 | 21 / 21 / 0 |

**Every single one of these 11 job_keys stopped being used on or before 2026-06-30 — the exact same date the legacy `market-scoring-full-run` chain (Section 7.8) last ran.** This is not a coincidence: Gen 3 ("v3 shadow") was the scoring stack driven by the old combined Market+Scoring full run, and both went dormant together when that chain was abandoned in favor of building the new split chains, which culminated in the current `SCORING_FULL_RUN_STAGES` (Section 2) — first proven end-to-end today, 2026-07-14, two weeks later. So the real picture is: **three successive scoring-system generations all lived inside `alphadog-v2-score-audit.js`, all now dormant, all superseded by the brand-new dedicated Scoring Full Run chain (Section 2) which writes to different tables via different physical files.** This makes `score-audit.js` and its 11 Control Room buttons + `isScoringEngineJob`-guarded handler code in the orchestrator a strong, well-evidenced (not inferred) cleanup candidate — on the same "confirm no external dependency first, then remove UI+handler+stage code together" basis as Section 7.8.

**`[TODO]` before removing:** confirm with Rodolfo that nothing outside this system (a saved bookmark workflow, a report someone else runs manually, etc.) still depends on any of these 11 buttons. Also worth checking whether `score-audit.js`'s data (in SCORE_DB, per project memory) is still read by anything downstream for historical comparison/backtesting purposes before deleting — dormant as a write path doesn't necessarily mean its historical output rows are unused as a read path.

**Side-finding, worth flagging on its own:** the Control Room's `debugConfig()` function returns a large hardcoded JSON "sentinel" object describing the button layout and chain order — and it is **stale relative to the actual current code**. It still says `daily_full_run_order:["board_full_run","daily_context_full_run","market_scoring_full_run"]` (3 stages, combined market+scoring) when the real `DAILY_FULL_RUN_STAGES` array (Section 7.1) has been updated to 4 stages with `market_full_run` and `scoring_full_run` split apart. **This internal self-description drifting out of sync with real behavior is itself a known failure pattern in this system** (see the `processStaticCertifierJob` precedent in Section 7.6) — worth treating any embedded "sentinel"/debug self-description as unverified documentation, not ground truth, throughout the rest of this mapping effort.

---

## 8. UPDATED GAP LIST (supersedes Section 5 where overlapping)

Still open:
- [x] ~~Confirm `MARKET_SCORING_FULL_RUN_STAGES` (Section 7.8) is truly dead/unreachable before any deletion.~~ RESOLVED: confirmed still live/wired (Control Room button + handler intact), but inactive since 2026-06-30. See Section 7.8/7.9. New TODO: check the other 11 score-audit.js-routed job_keys (Section 7.9) the same way before touching that file.
- [x] ~~Check the other 11 score-audit.js job_keys the same way.~~ RESOLVED: all 11 confirmed dormant (last runs between 2026-06-06 and 2026-06-30, none since). Clean 3-generation history, all superseded together when the legacy Market+Scoring chain was abandoned. See Section 7.9 table. Still need Rodolfo's confirmation of no external dependency before removing any of it.
- [ ] Confirm fate of `daily-batting-orders`, `daily-confirmed-starters`, `daily-games-status`, `daily-roof-status`, `static-rosters` (Sections 7.4/7.6) — folded into siblings, dead, or called from elsewhere. Note: `daily-games-status` DOES have a live Control Room button (`DAILY JOBS > Game Status` → `orchestrator_enqueue_daily_games_status`), found while investigating 7.8/7.9, so it's not orphaned — just not part of the Daily Context Full Run chain specifically. Still need to check the other 3.
- [ ] Read the `mode`-based internal branching of the most-overloaded file, `alphadog-v2-phase3a-first-inning-pitcher-context.js` (699KB, ≥6 logical roles across 2+ job_keys) — highest-priority read for the next phase given how much of the Incremental Morning + Final Scoring System chains depend on it.
- [ ] Full read of `alphadog-v2-score-final-board.js` (unchanged from Section 2).
- [ ] Full read of `alphadog-v2-control-room.js` routing/allowlist table (unchanged from Section 2).
- [ ] Purpose of Context History Full Run (Section 7.7) — why/when it's triggered.
- [ ] The 21 "11 Score" per-prop workers — still not individually opened.
- [ ] Config tables list (unchanged from Section 5).
- [ ] `config_scheduled_jobs` — still not queried; needed to know what's actually scheduled vs merely defined.
- [ ] Three manifest JSON files vs the two DB registries — relationship still unestablished.

No writes, no deploys, no job runs performed in Phase 2 either — confirmed read-only.

---

## 9. THE MOST OVERLOADED FILE, FULLY MAPPED: `alphadog-v2-phase3a-first-inning-pitcher-context.js` (699KB, 7,631 lines)

Found the top-level mode dispatcher (lines 6518–6555). It's a single flat `if(mode===...) return xFunction()` chain reached via at least 2 different entry job_keys (`expansion-baseline-full-run`, `expansion-baseline-v2`, plus more aliases below) from multiple full-run chains (Sections 2, 7.5). This single file is dramatically more overloaded than earlier sections suggested — **it's not 6 logical roles, it's closer to 24.**

### Full mode → function map (verbatim from the dispatcher)
| mode (all accepted aliases) | function called |
|---|---|
| `expansion_baseline_mining` / `expansion-baseline-mining` | `mineFirstInningContext()` |
| `expansion_baseline_sanity` / `expansion-baseline-sanity` | `runSanity()` |
| `expansion_baseline_hp` / `expansion-baseline-hp` | `runHp()` |
| `expansion_delta_mining` / `expansion-delta-mining` | `runDeltaMining()` |
| `expansion_delta_sanity` / `expansion-delta-sanity` | `runDeltaSanity()` |
| `expansion_delta_hp` / `expansion-delta-hp` | `runDeltaHp()` |
| `expansion_delta_full_run` / `expansion-delta-full-run` | `deltaFullRun()` |
| `expansion_line_inventory` / `expansion-baseline-line-inventory` | `runLineInventory()` |
| `expansion_baseline_certifier` / `expansion-baseline-certifier` | `certifier()` |
| `expansion_baseline_full_run` / `expansion-baseline-full-run` | `fullRun()` — self-dispatches again internally to `deltaFullRun()` (default) or `fullRunFullDepth()` (if `force_full_baseline`/`full_depth_base`/`disable_delta_auto` flags set) |
| `baseline_v5_state_hydrate` | `runBaselineV5StateHydrate()` |
| `baseline_v5_classification_daily_delta` | `runClassificationV6DeltaDaily()` |
| `baseline_v5_hp_daily_delta` | `runBaselineV6DeltaDaily()` |
| `baseline_v5_stateful_delta` | `runBaselineV5StatefulDelta()` |
| `baseline_v5_classification_rescue` | `runBaselineV5ClassificationRescue()` |
| `baseline_v5_base_rescue` | `runBaselineV5BaseRescue()` |
| `baseline_v5_classification_delta` / `baseline_v5_delta` | **BLOCKED — see below, does not run** |
| `classification_v6_compute_stats` | `runClassificationV6ComputeStats()` |
| `classification_v6_tick` / `classification_v6` | `runClassificationV6Tick()` |
| `baseline_v6_tick` | `runBaselineV6Tick()` |
| `baseline_v5_classification_base` | `runClassificationV6Base()` |
| `baseline_v5_base` | `runBaselineV6Base()` |
| `baseline_v5_history_only` / `baseline_v2_heb` / `expansion_baseline_v2` / `expansion-baseline-v2` / `expansion-baseline-v2-full-run` | `runBaselineV2()` — 5 different mode strings all collapse to the same function |
| (fallback) `job_key === "phase3a-first-inning-pitcher-context"` OR `mode === "legacy_dummy"` | Returns a **hardcoded no-op**: `LEGACY_DUMMY_SLOT_READY_NO_MUTATION`, `rows_read:0, rows_written:0, writes_performed:0` |

### Two findings worth calling out specifically

**1. The file's own literal name/job_key is a dead stub.** If this worker is ever invoked with its own nominal job_key (`phase3a-first-inning-pitcher-context`) or no matching mode, it does nothing and returns a hardcoded "ready, no mutation" response. All real work happens under ~15 other job_key/mode aliases that have nothing to do with the file's name. This is the clearest evidence yet that **file names in this codebase are historical artifacts, not descriptions of current behavior** — a critical thing to internalize before any renaming/splitting during cleanup.

**2. There's a deliberate, hardcoded safety block on a dangerous old mode.** `baseline_v5_classification_delta` / `baseline_v5_delta` do NOT run their handler — they immediately return `BASELINE_V5_OLD_AFFECTED_PLAYER_CUMULATIVE_DELTA_BLOCKED` with an explicit message: *"Old Baseline/Classification V5 delta reloads cumulative player history and is banned. Use baseline_v5_state_hydrate then baseline_v5_stateful_delta shadow/parity path."* This confirms the Control Room's "Old Class Δ Blocked" and "Old HP Δ Blocked" buttons (seen in Section 7.9's button inventory) are **intentional safety rails left in the UI as documentation of a banned path, not bugs or leftover dead buttons** — do not "fix" or re-enable these during cleanup.

### Confirmed via `control_job_queue` (checked this session): which of the ~24 modes are actually alive right now

Unlike score-audit.js (Section 7.9), this file is **not** uniformly dormant — most of it is very much alive today. Two job_keys carry almost all the traffic, differentiated internally by `mode` (stored in `input_json`, not the `job_key` column — most of the individual job_key aliases like `expansion-baseline-mining`, `expansion-baseline-certifier`, `expansion-delta-mining`, etc. have **never once been submitted as their own job_key** in this table; they only exist as `mode` values under the two job_keys below):

**`job_key='expansion-baseline-full-run'`** (205 total runs), by mode:
| mode | runs | last run |
|---|---|---|
| `expansion_delta_hp` | 43 | **2026-07-14 (today, active)** |
| `expansion_delta_sanity` | 39 | **2026-07-14 (today, active)** |
| `expansion_line_inventory` | 42 | **2026-07-14 (today, active)** |
| `expansion_delta_mining` | 42 | **2026-07-14 (today, active)** |
| `baseline_v5_classification_delta` | 10 | 2026-07-05 — **this is the BLOCKED mode; these 10 "runs" all just hit the hardcoded block and did nothing, confirming the safety rail is still occasionally exercised (something/someone still submits it) and correctly rejected each time** |
| `expansion_delta_full_run` | 10 | 2026-06-30 — dormant since the same date the old Market+Scoring/score-audit generation went dormant (Sections 7.8/7.9) |
| `expansion_baseline_full_run` | 19 | 2026-06-28 — dormant, superseded by the 4 daily delta modes above |

**`job_key='expansion-baseline-v2'`** (159 total runs), by mode:
| mode | runs | last run |
|---|---|---|
| `baseline_v5_hp_daily_delta` | 37 | **2026-07-14 (today, active — the daily recurring job)** |
| `baseline_v5_classification_daily_delta` | 41 | **2026-07-14 (today, active — the daily recurring job)** |
| `baseline_v5_classification_base` | 8 | 2026-07-10 |
| `baseline_v5_stateful_delta` | 14 | 2026-07-08 |
| `baseline_v5_base_rescue` | 13 | 2026-07-08 |
| `baseline_v5_classification_rescue` | 8 | 2026-07-07 |
| `baseline_v5_state_hydrate` | 1 | 2026-07-05 — **only ever run once, total, ever** |
| `baseline_v5_base` | 4 | 2026-07-03 |
| `baseline_v2_heb` | 33 | 2026-07-01 — dormant, earliest/superseded generation |

**Reading this correctly (important nuance, unlike the score-audit.js case): older last-run dates here do NOT necessarily mean dead/superseded.** This looks like the actual build-out timeline of the Baseline V5 system itself: `baseline_v2_heb` (7/1) → `baseline_v5_base` (7/3) → `baseline_v5_state_hydrate` (7/5, a one-time migration step, correctly never run again) → `baseline_v5_classification_rescue`/`base_rescue`/`stateful_delta` (7/7–7/8, occasional repair/bootstrap operations, not meant to run daily) → `baseline_v5_classification_base` (7/10) → the two `_daily_delta` modes, which are the ongoing daily-recurring pair still running today. **The "rescue" and "base"/"state_hydrate" modes are probably meant to be rare/on-demand, not dead — do not assume the same dormancy pattern found in Section 7.9 applies here without checking each mode's evident purpose from its name/handler first.**

**Still genuinely unconfirmed/never-run as standalone job_keys:** `expansion-baseline-mining`, `expansion-baseline-sanity`, `expansion-baseline-hp` (only 3 runs total, last 2026-06-28, as its own job_key — separate from the `expansion_delta_hp` mode which IS active), `expansion-baseline-line-inventory`, `expansion-baseline-certifier`, `expansion-baseline-v2-full-run`, `expansion-delta-mining`/`-sanity`/`-hp`/`-full-run` as literal job_key strings. These may simply never be dispatched with job_key equal to their own mode name (i.e., always reached via the two umbrella job_keys with matching mode instead) — **`[TODO]`: distinguish "alternate spelling never used" from "actually orphaned" for these before any cleanup.**
This file is the connective tissue between at least 3 things mapped so far: the Incremental Morning Full Run (Section 7.5), the Static Full Run's Expansion stages, and the "Final Scoring System" / Baseline V5 registry group. A safe refactor of this file would need to preserve every one of the ~24 mode branches and their exact string aliases (including the deliberately-blocked one), not just the ones currently exercised by the two full-run chains already mapped. **`[TODO]` next: read the actual function bodies for the newest/active-looking ones first** (`runBaselineV5StateHydrate`, `runBaselineV5StatefulDelta`, `runClassificationV6Tick`, `runBaselineV6Tick`, `runBaselineV2` — these look like the current "Final Scoring System" generation per the Control Room button names in Section 7.9) **before the clearly-legacy ones** (the plain `expansion_baseline_*` / `expansion_delta_*` set, which may themselves be superseded by the V5/V6 baseline generation the same way score-audit.js's Gen 1–3 were superseded — not yet confirmed, needs the same control_job_queue last-run check used in Sections 7.8/7.9).

---

## 10. `alphadog-v2-score-final-board.js` (119KB, 2,158 lines) — LOGIC MAPPED, STILL NEVER EXERCISED ON REAL DATA

This is the dedicated, single-purpose file at the end of the Scoring Full Run chain (Section 2, stage 7). Current version tag found in code: **"Final Board v0.1.33"**, design philosophy explicitly stated in its own log messages: *"HP is the reality gate; Engine score is preserved as trust/support score. HP is preserved and never inflated; score remains trust/support."* It reads the latest completed, certified batch from `hp_board_current` (locked) and the Scoring Engine, and writes `score_final_board_current`.

### The pipeline, in order (all confirmed from actual code, not inferred):
1. **Base visible rows**: rows from `hp_board_current` with `estimated_hit_probability >= 60` (constant not shown in this grep but referenced as the HP floor for base inclusion).
2. **Source Market Cluster Dedupe** (`FINAL_BOARD_DEDUPE_SOURCE_MARKET_CLUSTER = true`): keeps one row per app/source + player + prop + line + side. Cross-app mirrors (same prop, different apps) are deliberately **not** removed — "cross-app mirrors are no longer removed because app floor coverage is required." **This is a hard blocker, not just a filter**: if `duplicateSourceMarketClusters > 0` after this step, the whole run stops and returns `SCORE_FINAL_BOARD_BLOCKED_SOURCE_MARKET_CLUSTER_DEDUPE_FAILURE` — i.e. finding duplicates it can't resolve halts the board rather than silently producing bad output.
3. **Player Global Exposure**: explicitly downgraded from a hard cap to a **soft ledger/tiebreaker only** — "Final Board no longer cuts rows by player exposure. Exposure is a soft tiebreaker/ledger warning only; rows remain visible when they qualify or are needed by quota reserve." (`playerExposureSoftOverflow` is logged as a WARNING issue, not a rejection.)
4. **Primary Cluster Cap**: `PRIMARY` tier is capped at **one row per player/game-slate cluster key**; anything over that is demoted to `REVIEW` (not deleted) — explicitly documented as "a diversification/correlation safety rail, not a quality killer or source quota."
5. **Quota Reserve** (`FINAL_BOARD_QUOTA_RESERVE_MIN_HP = 45`, `FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE = 50`): if the board is short of its floors — `FINAL_BOARD_PROP_FLOOR_PER_PROP = 5` (min rows per individual prop type), `FINAL_BOARD_SOURCE_FLOOR_PER_APP = 20` (min rows per source app), `FINAL_BOARD_VARIANT_FLOORS = {demon: 10, regular: 20, goblin: 20}` (min rows per payout-variant type) — it pulls additional candidates from the remaining pool (HP ≥ 45, score ≥ 50 minimum eligibility) and adds them, **but only ever as `REVIEW` tier, never `PRIMARY`** (`row.board_tier = "REVIEW"`, `row.live_playable = 0`, `row.review_playable = 1`, `source_candidate_tier: "HP_FIRST_QUOTA_RESERVE_REVIEW"`). This is the mechanism that guarantees minimum board coverage without artificially inflating confidence on marginal rows.
6. Writes final rows to `score_final_board_current`, with per-row `board_tier` (PRIMARY/REVIEW), `live_playable`/`review_playable` flags, and a full `score_final_board_issues` audit trail (one row per check: dedupe results, exposure ledger, cluster cap demotions, HP-first source lock confirmation) — all via `writeIssue()`.

### Why this matters for validation-before-locking (ties to Rodolfo's stated project principle: no value final without empirical validation)
Every one of the specific numeric constants above — the 60/45/50 HP and score thresholds, the 5/20/10/20/20 floor counts — is a **hardcoded, as-yet-unvalidated policy choice** baked into v0.1.33. None of it has been exercised against real HP/score distributions yet (confirmed earlier in this doc: `score_final_board_current` has 0 rows, last real board data is from 2026-07-12, pre-All-Star-break). **When real scoring resumes, this is the first place to check whether these specific floors/caps produce a sensible, well-distributed board** — not just whether the pipeline runs without erroring.

No writes, no deploys performed to produce this section — read-only grep only.
