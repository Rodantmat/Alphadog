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

**Status: proceeding with hitter game logs port — deep D1 verification + structural read of base-hitter-game-logs.js next.**

