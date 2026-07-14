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
