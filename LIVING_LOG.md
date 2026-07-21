# ALPHADOG — LIVING LOG (Incremental/Delta Postgres Migration Phase)

Continuously updated. Last real state always at the bottom of the current session block.

---

## Session start — 2026-07-20/21

**Context confirmed with Rodolfo:**
- Read ALPHADOG_HANDOFF.md and ALPHADOG_DOS_AND_DONTS.md in full, twice. Verified via detailed Q&A (biggest mistake / prepare:false, 4+ specific bugs, 8 static stages incl. 2 mislabeled files, exact row counts, freshness gate window+scope, chunk sizes).
- Priority order confirmed: certifier first, then delta workers in this order:
  1. hitter game logs
  2. pitcher game logs
  3. team game logs
  4. starter history
  5. bullpen history
  6. hitter metrics
  7. pitcher metrics
  8. hitter splits
  9. pitcher splits
  10. daily-context layers (weather, umpire, availability, schedule spot)
  11. calculated layers (classification/baseline/expansion) — last, D1 read-only comparison exception applies here only

**Per-worker process (mandatory, no skipping):**
1. Verify current D1 data is correct/complete (real check, not assumed)
2. Rewire fully to Postgres
3. Run 3 successive times, confirm real/stable/correct results
4. Only then move to next worker

**Hard adjustments applied to every port:**
- No duplicate staging tables (main table holds everything; static-players is the only legitimate exception)
- Surgical port only — no redesign of working D1 logic
- `prepare: false` on every Postgres connection, no exceptions
- Bulk inserts via `sql(array, columns)`, ~200 rows/chunk — not individual-row
- Differential/dedupe checks scoped by `source_key`, not just natural key
- Freshness gate (bounded watermark) wherever source has no cheap "what changed" signal
- Chunking (`partial_continue` + `continuation_input_json`) for any worker with many external calls/writes per invocation

**Other confirmed scope notes:**
- SCORING_DB investigation: mine to do, via grep, before asking — not yet started.
- Correlation-aware enrichment wiring: explicitly OUT of scope for this phase.
- D1 fully off limits except calculated-layer read-only comparison (Section 5 of HANDOFF.md) — not relevant yet since we're starting with certifier + raw delta layers.

**Status update — certifier investigated, sequence revised with Rodolfo.**

- Confirmed target: `alphadog-v2-delta-certifier.js` (job_key `delta-certifier`, v0.2.15-v6-state-validated-clean, 2021 lines). Read in full.
- Structure: TWO independent halves.
  1. Game calendar (`mlb_game_calendar` + `mlb_game_calendar_stage` + `mlb_game_calendar_diff_changes`) — pulls MLB schedule API directly, no dependency on any other delta layer. Fully portable standalone.
  2. Coverage matrix (`mlb_game_data_coverage`) — for every game_pk, checks 9 source layers (hitter_game_logs, pitcher_game_logs, team_game_logs, starter_history, bullpen_history, hitter_splits, pitcher_splits, hitter_metrics, pitcher_metrics) + 2 baseline_v5 layers, by querying those tables directly in STATS_HITTER_DB/STATS_PITCHER_DB/TEAM_DB/ARCHIVE_DB (D1). This inherently depends on every other delta layer already existing.
- Also found: `mlb_game_calendar_stage` currently duplicates the FULL calendar snapshot per batch (not just in-flight rows) — violates no-duplicate-staging rule, must fix when ported.
- Flagged the dependency conflict to Rodolfo directly rather than guess. Decision: **certifier is LAST, not first.** Coverage matrix can't be real on Postgres until all 9 source layers are already there. Go worker-by-worker per original priority list, port the certifier (both calendar half AND coverage-matrix half, fully, all 9 layer checks pointed at Postgres) only once everything it depends on is done.
- Hard instruction repeated by Rodolfo, restated for clarity: **fully unwire D1 for each worker as it's ported — nothing left half-wired to D1 for a worker that's supposedly "done." No exceptions.**

**Status: hitter game logs — file identity resolved (another mislabeling found).**
- `alphadog-v2-delta-hitter-logs.js` (8.4KB) is NOT the hitter game logs delta worker. Read in full: it's a standalone one-time catcher framing/pop-time historical backfill tool (job_key `catcher-reference-historical-backfill`, logical name `alphadog-v2-catcher-reference-historical-backfill`) that repurposed a dead dummy worker slot. Writes only to `REF_DB.ref_catcher_framing_poptime`. Completely unrelated to hitter game logs. NOT part of this migration step.
- The REAL hitter game logs worker (base + delta both) is `alphadog-v2-base-hitter-game-logs.js` — job_key `base-hitter-game-logs`, version v1.6.22-gap-contract-drain-verify, 3374 lines. Confirmed via grep: has an `ingestion_mode` field distinguishing `'delta_update'` vs base backfill within the same file/same table writes. D1 bindings: CONTROL_DB, CONFIG_DB, REF_DB, STATS_HITTER_DB.
- This is the real port target for "hitter game logs." Next: verify current D1 data (STATS_HITTER_DB.hitter_game_logs, real row counts/completeness) before any Postgres code, per mandated per-worker process. Have NOT yet read the full file body (only structural grep so far) — need full read before planning the port.

**D1 verification (read-only, per mandated process step 1):**
- STATS_HITTER_DB.hitter_game_logs: 75,427 rows, 651 distinct players, 3,920 distinct games, date range 2025-03-18 to 2026-07-19. Real, populated table.

**CRITICAL METHOD CORRECTION FROM RODOLFO — applies for rest of migration:**
- Worker/table names are mislabeled in MANY places (delta-hitter-logs.js being a red herring is a live fresh example, not a one-off). **Never trust a filename, worker_name string, or table name as ground truth — trust code logic/behavior only.**
- **Correct source of truth for "what worker does what, in what order": the Control Room's full-run buttons** (e.g. "Delta Full Run"). These trigger the orchestrator, which dispatches the real, correct job_key sequence. Use this as the canonical map, not filename guessing.
- System is explicitly "a big Frankenstein" per Rodolfo — many versions built on top of each other, lots of dead code, some HALF dead (looks unused but isn't, or vice versa) — extra caution before assuming any code path is dead or live.
- **New method going forward:** before touching a layer, find its Control Room button → find what job/chain it enqueues in the orchestrator → follow the real job_key sequence actually dispatched → that's the real worker file(s) and order.
**REAL CHAIN CONFIRMED — `INCREMENTAL_MORNING_FULL_RUN_STAGES` in alphadog-v2-orchestrator.js (Control Room "DELTA >" buttons). This is now the canonical source of truth for order/worker/mode, replacing the earlier assumed list:**

1. `calendar_tally_precheck` → delta-certifier (precheck)
2. `hitter_game_logs_delta` → **base-hitter-game-logs**, mode `delta_update`
3. `pitcher_game_logs_delta` → base-pitcher-game-logs, mode `delta_update`
4. `team_game_logs_delta` → base-team-game-logs, mode `delta_update`
5. `starter_history_delta` → base-starter-history, mode `delta_coverage_gap_scoped_repair` (different mode shape than the rest — flagged, verify separately when its turn comes)
6. `bullpen_history_delta` → base-bullpen-history, mode `delta_update`
7. `hitter_splits_delta` → base-hitter-splits, mode `delta_update`
8. `pitcher_splits_delta` → base-pitcher-splits, mode `delta_update`
9. `calendar_tally_source_repair_check` → delta-certifier (requires zero blocking gaps)
10. `expansion_delta_mining` → expansion-baseline-full-run (real file: alphadog-v2-phase3a-first-inning-pitcher-context.js)
11. `hitter_metrics_affected_delta` → base-hitter-metrics, mode `delta_recalculate_affected_players`
12. `pitcher_metrics_affected_delta` → base-pitcher-metrics, same mode
13-15. expansion line-inventory/sanity/HP (same expansion-baseline-full-run worker)
16-17. baseline_v5 classification + HP daily delta (job_key `expansion-baseline-v2`, same underlying worker file)
18. `calendar_tally_final_check` → delta-certifier (final, zero blocking gaps + baseline_v5 coverage required)

Rodolfo confirmed: follow this REAL order (splits before metrics, expansion mining interleaved), not the earlier stated list. Certifier stays last for our migration purposes regardless (its 3 modes get ported once everything they depend on is on Postgres) — but note the certifier is invoked 3 TIMES within a single incremental-morning-full-run (precheck/source_repair_check/final_check), so once ported it must handle all 3 calendar_tally_stage variants.

**D1 verification for hitter_game_logs — DEEP CHECK RESULTS (real, not assumed):**
- Schema (PRAGMA): 40 columns, PK (player_id, game_pk). Has ingestion_mode, batch_id, run_id, certification_status/grade, promoted_at — a real stage→certify→promote lifecycle, not a simple upsert.
- team_id/opponent_team_id are BARE numeric ("108"), NOT "mlb_"-prefixed. Verified this is correct/expected, not the known ID-mismatch bug: Postgres ref.teams already has a bridge column `mlb_team_id` (bare integer) alongside the mlb_-prefixed `team_id` PK — confirmed via static-teams.js source. Bare numeric team_id in hitter_game_logs maps to ref.teams.mlb_team_id. Do NOT "fix" this to mlb_ prefix — it would break the real convention.
- raw_json: real native JSON (`{"...`), NOT double-encoded. Clean.
- source_key: 3 distinct real values (mlb_statsapi_game_feed_live_hitting_repair_v0_1_0 / mlb_statsapi_people_gameLog_hitting_historical_backfill_v0_1_0 / mlb_statsapi_people_gameLog_hitting_v0_1_0), crossed with ingestion_mode (historical_backfill/base_backfill/delta_update). Differential/dedupe logic in the ported version must stay scoped by source_key, not just player_id+game_pk.
- primary_position_played distribution: real hitter positions dominate (CF/SS/C/3B/2B/LF/RF/1B/DH all ~7-8k rows), only 75 rows tagged "P" (pinch-hit pitchers, negligible, legitimate) — position filter is CORRECT here, no repeat of the known bug.
- Row count: 75,427 total, 651 players, 3,920 games, 2025-03-18 to 2026-07-19.
- Found FULL sibling table set: `hitter_game_logs_stage` (16,490 rows — a real, sizeable staging table, ~22% of main table's size, not trivial), `hitter_game_log_batches` (6 rows), `hitter_game_log_cursor` (2 rows), `hitter_game_log_certifications`, `hitter_game_log_player_outcomes`, `hitter_game_log_repair_registry`. Need to read the actual worker code to determine whether `_stage` is genuinely bounded in-flight data (fine) or an accumulating full-history duplicate (violates no-duplicate-staging rule, needs fixing on port) — not yet determined, D1 data alone can't answer this, must read code logic next.

**HARD RULES REINFORCED BY RODOLFO — apply to hitter_game_logs port and every worker after:**
- D1 is reference-only, no exception, restated plainly — consistent with read-only verification approach already in use.
- **The new delta system must NOT replicate the old full-duplicate staging pattern.** `hitter_game_logs_stage` (16,490 rows, ~22% of main) is exactly the kind of thing that needs re-architecting on port — genuinely in-flight rows only, not a growing shadow copy.
- **Any backfill needed to populate empty Postgres tables must come directly from MLB (or the real external source), never copied/migrated from D1 rows.** D1's 75,427 hitter_game_logs rows do NOT get transferred — Postgres starts empty and mines fresh from the real MLB StatsAPI, same as the static layer did.
**Base-hitter-game-logs.js — full architecture understood (via targeted structural reads, not full 3374-line dump):**
- Real, production-grade stage→certify→promote→clean lifecycle, shared by both `base_backfill` and `delta_update` modes in the same file.
- Tables: `hitter_game_logs` (live), `hitter_game_logs_stage` (staged, batch-scoped), `hitter_game_log_batches` (batch/lock tracking), `hitter_game_log_cursor` (resumable player-list cursor for chunked ticks), `hitter_game_log_certifications`, `hitter_game_log_player_outcomes` (per-player-per-batch outcome classification: PROMOTED_ROWS/TRUE_NO_DATA/SOURCE_ERROR/REPAIR_REQUIRED/etc), `hitter_game_log_repair_registry`, `hitter_schema_migrations`.
- Stage table growth explained: rows are meant to be deleted by `cleanStageRowsChunk` after promotion, batch-scoped — not an intentional full duplicate like the certifier's calendar_stage. The 16,490 lingering rows suggest incomplete cleanup across historical batches, not a designed permanent duplicate. For the Postgres port: keep the batch-scoped stage design (it's legitimate, bounded per batch) but make cleanup stricter/more reliable so it doesn't accumulate — this satisfies Rodolfo's "no full duplicate tables" instruction without abandoning the real certify/promote safety mechanism.
- **CRITICAL dependency found**: `runDeltaUpdateTick` calls `getLockedBaseIntegrity(env)` first and REFUSES to run unless a locked, certified, promoted base-backfill batch already exists (`LOCKED_BASE_BATCH_ID`). Since D1 data is NOT being copied to Postgres (backfill must come from MLB directly per Rodolfo), this means: **base_backfill must be ported, run to completion, certified, promoted, and locked on Postgres BEFORE delta_update can be tested at all.** This isn't optional scope creep — it's a hard functional dependency already in the existing, working D1 logic. Surgical port = port both modes, same as D1 does.
- Mode routing: single `/run` POST route always calls `runBaseBackfillTick`, which internally checks `inputJson.mode || input.mode` and redirects to `runDeltaUpdateTick` if `"delta_update"`. Real, existing routing pattern — will preserve exactly.

**Plan for hitter_game_logs Postgres port (proceeding now, no further questions needed):**
1. `ensureSchema` → Postgres equivalent tables in `stats_hitter.*` schema, `prepare:false`, bulk inserts.
2. Port `base_backfill` full lifecycle (mine fresh from MLB StatsAPI — never copy D1 rows) — cursor/lock/stage/certify/promote/clean, same logic, Postgres syntax.
3. Deploy, run base_backfill to real completion (multi-tick, chunked per existing MAX_API_CALLS_PER_TICK/MAX_ROWS_PER_TICK pattern) until certified+promoted+locked.
4. Port `delta_update` lifecycle (depends on the lock from step 3).
5. Run delta_update 3 successive times, confirm stable/correct real results before moving to pitcher game logs.
6. Tighten stage-table cleanup so it doesn't accumulate across batches (Rodolfo's no-duplicate-tables instruction) while keeping the legitimate batch-scoped stage/certify/promote safety mechanism.

Beginning implementation now.

