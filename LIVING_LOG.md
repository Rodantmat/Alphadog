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

**PIVOT — Rodolfo confirmed prior sessions already backfilled real, unknown amounts of data directly onto Postgres. No existing tool to check what. Before doing ANY more hitter_game_logs work, added a safe way to verify this first (avoid redoing existing work).**

**Added `run_sql_postgres` tool to the Bridge worker (alphadog-v2-admin-sql.js) — purely additive, safe:**
- Mirrors `run_sql`'s exact safety pattern: SELECT/WITH allowed by default, anything else needs `allow_write:true`.
- Connection: `postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false })`, `sql.end()` in finally.
- Hyperdrive binding added to admin-sql's block in `generate_wrangler_configs.py` (never hand-edited the .jsonc, per known gotcha).
- Zero changes to any existing tool's behavior. Version bumped v2.7 → v2.8-postgres-readonly-tool.
- Pushed in 3 commits; deploy workflow triggered (scope="changed" per workflow yml, confirmed only admin-sql should redeploy).
- **Caveat flagged for Rodolfo:** even once deployed, this new tool may not be callable within the CURRENT chat session (MCP tool list is fixed at session start, may not hot-reload mid-conversation). May need a fresh conversation to actually use it.
**Deploy CONFIRMED successful** (commit 62ebe19, both "AlphaDog v2 Mobile Auto Deploy" and "pages build and deployment" green). `run_sql_postgres` tool is live server-side on the Bridge worker.

**BLOCKER for current session: cannot call the new tool.** Claude's MCP tool list is fixed at conversation start; `run_sql_postgres` didn't exist yet then, so it's not available to invoke in THIS chat even though the worker now serves it. Told Rodolfo directly — he needs to start a fresh conversation for the tool to appear as callable. Once available: query `information_schema.schemata`/`information_schema.tables` (+ row counts) across the Postgres instance to see everything already backfilled by prior sessions, BEFORE touching hitter_game_logs or any other worker, per Rodolfo's explicit instruction not to redo existing work.

**MAJOR RE-SCOPING — most of the incremental/delta Postgres migration already exists, just not where expected or wired correctly. Full grounded mapping below, built entirely from real code + real data, not assumption.**

**Where the real work actually lives:** NOT in the per-layer D1 worker files (base-hitter-game-logs.js etc. remain untouched D1). It's ALL inside `alphadog-v2-phase3a-first-inning-pitcher-context.js` (10,795 lines), a single mode-dispatched mega-file, invoked via `run_job` with `target: "PHASE3A_WORKER"` and `job: "<mode_string>"`. Full real mode registry (grepped directly from the routing table at ~line 10665-10730), each mapped to its real function:

- `remine_ref_teams_to_postgres` / `remine_ref_players_to_postgres` / `remine_ref_stadiums_to_postgres` — static ref backfills (redundant with already-migrated static-teams/players/stadiums workers? not yet reconciled)
- `remine_hitter_game_logs_to_postgres` / `remine_pitcher_game_logs_to_postgres` — base backfill, offset-chunked (60 players/invocation), filters by `ref.players.primary_position` (hitters vs `'P'`) — this is what actually populated the 30,707/12,099 rows found
- `remine_hitter_splits_to_postgres` / `remine_pitcher_splits_to_postgres` — populated the 1,085/1,345 split rows
- `remine_team_game_logs_to_postgres` — populated team.game_logs (2,996 rows)
- `derive_starter_history_from_postgres` / `derive_bullpen_history_from_postgres` — populated team.starter_history (2,947) / team.bullpen_history (9,150)
- `derive_hitter_metric_snapshots_from_postgres` / `derive_pitcher_metric_snapshots_from_postgres` — populated stats_hitter/stats_pitcher.metric_snapshots (3,070/3,370), builds recency-windowed rate stats + vs-L/vs-R split JSON, real working SQL (CTE-based window aggregation)
- **`daily_delta_game_logs_to_postgres` → `runDailyDeltaGameLogsToPostgres`** — THIS is the real ongoing daily-delta worker for hitter+pitcher game logs. Read its full body: fetches MLB schedule for a date window (defaults yesterday→today), filters to final games only, parallel-fetches boxscores (batches of 12, 35s time budget), builds hitter+pitcher rows, `INSERT ... ON CONFLICT (log_id) DO UPDATE` directly into the same clean `stats_hitter.game_logs`/`stats_pitcher.game_logs` tables — no stage/batch/cursor/lock machinery at all. This is exactly the no-duplicate-staging design Rodolfo wants, already built. Source_key `mlb_statsapi_boxscore_delta` (the 16 rows found) came from a real test invocation of this exact function.
- `derive_rosters_from_postgres`, `derive_player_aliases_from_postgres`, `derive_team_aliases_from_postgres`, `derive_stadium_aliases_from_postgres` — deterministic derived-alias generators, zero D1 reads
- `derive_rfi_metric_to_postgres` — RFI-specific metric derivation
- `daily_morning_delta_full_run` → `runDailyMorningDeltaFullRun` — a **Postgres-native full daily-delta orchestrator**, separate from and NOT wired into the real `alphadog-v2-orchestrator.js`'s `INCREMENTAL_MORNING_FULL_RUN_STAGES` chain (which still dispatches the old D1 per-layer workers)
- `daily_context_full_run` → `runDailyContextFullRun` — Postgres daily context (weather/umpire/lineups/availability layers) — schemas exist (`daily.*` — bullpen_availability_current, game_weather_current, lineups_current, player_availability_current, probable_pitchers, team_schedule_spot_current, umpire_context_current) — row counts not yet checked
- `expansion_mining_to_postgres`, `classification_baseline_v6_to_postgres`, `expansion_delta_mining/sanity/hp` and non-suffixed base versions (`runLineInventory`, `runSanity`, `runHp`) — the calculated/classification/baseline layers, apparently also already substantially built here
- `remine_prizepicks_board_to_postgres` — board data
- **`derive_board_prepared_from_postgres` — explicitly broken, admitted in-code**: returns `ok:false, error:"not_yet_implemented: original SQL body lost to corruption, needs rebuild"`. Real, honest gap, not hidden.
- Static/Savant leaderboard miners (sprint speed, arm angle, quality of contact, batted ball, pitcher running game, park factors, defensive quality, catcher framing, pitcher arsenal) — also here, likely overlapping/redundant with the already-migrated static-layer workers building the same `ref.*` tables — reconciliation needed, not yet done.
- `postgres_health_check`, `postgres_apply_schema`, `postgres_migrate_table`, `postgres_verify_count`, `diagnostic_select` (= what powers `run_job`'s `diagnostic_select` mode), `postgres_debug_select`, `fix_raw_json_double_encoding` — generic Postgres diagnostic/admin tools, all real and working.

**REAL BUG FOUND, SYSTEMIC, ACROSS THE ENTIRE FILE:** every single Postgres connection instantiation in this file uses `postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false })` — **missing `prepare: false` everywhere**, with zero exceptions found across ~15+ separate connection instantiations grepped. This is the exact highest-value bug DOS_AND_DONTS.md warns about (masks real Postgres errors as fake "connection lost"). This is a real, unfixed defect across a huge amount of already-written, already-deployed code. Needs a global fix.

**Other real findings:**
- `primary_position_played` is NULL on every single hitter_game_logs row (both backfill and delta paths) — appears to be a consistent, uncorrected gap in the Postgres port (D1's version populates this real position value; hitter/pitcher separation instead happens upstream via the `ref.players.primary_position` filter in the mining query, so this may be functionally harmless, but it's a real fidelity gap vs the D1 source worth flagging, not yet fully assessed for downstream impact).
- `team.game_data_coverage` table EXISTS (schema created) but has 0 rows — the certifier's coverage-matrix concept was scaffolded for Postgres at some point but never populated/wired. Relevant for when certifier's turn comes (still last).
- The real orchestrator (`alphadog-v2-orchestrator.js`) `INCREMENTAL_MORNING_FULL_RUN_STAGES` chain is NOT wired to any of this — still dispatches the old D1 workers by their old job_keys/worker_names. This phase3a Postgres logic is a parallel, disconnected system, manually invoked via `run_job`, that got most of the way built and then the prior session apparently drifted/stalled before finishing verification + wiring.

**Revised real task, grounded in evidence, not the original plan:**
1. Fix the systemic missing `prepare:false` bug across all `postgres(...)` instantiations in this file — real risk, easy fix, do first.
2. Verify each already-built piece against real data (spot-checked hitter_game_logs already: clean, no dupes, real jsonb, correct team_id convention). Still need: pitcher_game_logs, splits, metric_snapshots, team_game_logs, starter/bullpen_history, daily_context tables, classification/baseline tables.
3. Reconcile overlap between phase3a's ref.* remine functions (teams/players/stadiums/arsenal/defensive-quality/etc) and the already-migrated static-layer workers — figure out which is authoritative, avoid two systems writing the same tables differently.
4. Decide (ask Rodolfo, don't guess): keep this consolidated mega-file mode-dispatch architecture going forward, or extract real per-layer worker files matching the orchestrator's expected job_keys/worker_names? The orchestrator chain currently expects separate files; this file is a different, working, but architecturally different shape.
5. Once verified + reconciled, wire the real orchestrator chain to call the real, working Postgres logic instead of the old D1 workers, OR update the chain's stage definitions to call this worker via the mode strings above.

**DECISION FROM RODOLFO: Option B — extract to separate per-layer worker files (not the consolidated mega-file).** Rationale: orchestrator is huge/entangled, don't touch it. B means zero orchestrator changes — port `alphadog-v2-base-hitter-game-logs.js` in place, keeping its exact existing job_key (`base-hitter-game-logs`)/mode contract, so the orchestrator's existing dispatch keeps working unchanged once this worker is Postgres-native.

**MISTAKE MADE AND CORRECTED: first attempt at "B" was actually a full rewrite** — built a brand-new simplified worker file from scratch (inspired by the phase3a logic) instead of editing the real, existing D1 file in place. Rodolfo caught this immediately and shut it down hard: "you must use the same, just rewire to new database and fix the things I ordered you." New file was never pushed/deployed. Correct approach re-established: open the REAL `alphadog-v2-base-hitter-game-logs.js` (3374 lines, real D1 version) and edit it directly, preserving its actual structure (lock/cursor/stage/certify/promote/clean state machine for both `base_backfill` and `delta_update`), converting D1 calls to Postgres syntax in place.

**SECOND CORRECTION: rejected a "D1-compatible adapter" approach too.** Considered building a generic shim (auto-translate `?` placeholders, SQLite quirks, etc.) to avoid touching ~150 call sites by hand. Rodolfo (via old-chat review) correctly identified this as itself a bigger architectural change than a direct port — hides call sites behind an abstraction, can't apply per-site fixes (bulk inserts, source_key scoping, freshness gates) cleanly, and risks the exact masked-error failure mode DOS_AND_DONTS warns about. **Correct method, confirmed and now in use: direct edits, one D1 call site at a time, same tagged-template Postgres style as the static workers, verified against real data immediately, no shims, no new files.**

**REAL PROGRESS SO FAR (verified, in place edits to the actual file, not yet deployed):**
- `chooseAllHitterPlayers`: converted from D1 `REF_DB.ref_players` query to direct Postgres tagged-template query against `ref.players`. Verified against real data: query logic confirmed to return 588 active hitter-position players via direct diagnostic_select check before/after writing the code.
- Both call sites (`getOrCreateBaseBackfillState`, `getOrCreateDeltaState`) updated to open a small scoped Postgres connection (`prepare:false` confirmed present) just for this query — rest of those two functions remain D1 for now, not yet converted, so nothing is deployed/run end-to-end yet (would still touch D1 elsewhere in the same request).
- `import postgres from "postgres";` added to top of file. Version bumped to `v1.6.23-postgres-port-in-progress` to mark work-in-progress state honestly.
- Working file kept locally at all times (`/home/claude/hitter_original.js` in the sandbox) via Python text edits for exact-match reliability, since the file is too large/complex for repeated remote string-patch round-trips without risk of mismatch. Not yet pushed to the repo (still mid-conversion, D1 calls remain throughout).

**TWO CHECKS CONFIRMED BY RODOLFO (via old-chat review), both clean/actioned:**
1. `prepare:false` present on every Postgres connection added so far — confirmed, will hold for every connection added going forward.
2. **Real, confirmed violation of no-duplicate-staging rule found in `hitter_game_logs_stage`**: for `base_backfill`, staging is genuinely transient (cleaned via `cleanStageRowsChunk`, batch-scoped) — fine. For `delta_update`, the D1 code explicitly does the OPPOSITE on purpose — comments state staging rows are "intentionally retained as the certified 2026 repair-refresh snapshot," with terminal statuses `DELTA_PROMOTED_STAGE_READY_TO_RETAIN` / `COMPLETED_PROMOTED_STAGE_RETAINED` meaning every daily delta run's staged rows are NEVER cleaned — a real, deliberate, permanent full duplicate growing forever alongside the live table. **Fix planned for when the promote/clean functions are reached in the conversion order** (`promoteStageRowsChunk`, `cleanStageRowsChunk`, `finalizeDeltaIfReady`): delta staging will drain after successful promotion exactly like base_backfill does — no permanent retention going forward.

**Conversion order in progress (direct edits, call-by-call, verify each, no deploy until a full mode is completely off D1):**
1. ✅ `chooseAllHitterPlayers` (done, verified)
2. 🔄 `ensureSchema` — in progress. Mapping: `hitter_schema_migrations`→`stats_hitter.schema_migrations`, `hitter_game_log_repair_registry`→`stats_hitter.game_log_repair_registry`, `hitter_game_logs_stage`→`stats_hitter.game_logs_stage`, `hitter_game_log_batches`→`stats_hitter.game_log_batches`, `hitter_game_log_cursor`→`stats_hitter.game_log_cursor`, `hitter_game_log_certifications`→`stats_hitter.game_log_certifications`, `hitter_game_log_player_outcomes`→`stats_hitter.game_log_player_outcomes`. Tracking columns (`batch_id`, `ingestion_mode`, `certification_status`, etc.) get added onto the EXISTING `stats_hitter.game_logs` table (already live with 30,707 real rows) via `ALTER TABLE ADD COLUMN IF NOT EXISTS` — table itself is not recreated or touched destructively.
3. Not yet started: `acquireBatchLock`/`releaseBatchLock`, `insertStageRow`, `processPlayer`, `promoteStageRowsChunk` (fix delta-retention bug here), `cleanStageRowsChunk` (fix delta-retention bug here), `buildPrePromotionChecks`, `certifyAndPromoteIfClean`, `getLockedBaseIntegrity`, `runBaseBackfillTick`, `runDeltaUpdateTick` (and its many repair-path helper functions — several of which reference `env.TEAM_DB`, D1, for calendar-tally gap data; these will need to be no-op'd honestly for now since that dependency isn't ready, matching the pattern already used by the disabled `getCalendarTallyHitterGapScope` stub in the source).

**✅ `ensureSchema` + `schemaStatus`: CONVERTED AND VERIFIED FOR REAL.**
- All 7 tables (`stats_hitter.schema_migrations`, `.game_log_repair_registry`, `.game_logs_stage`, `.game_log_batches`, `.game_log_cursor`, `.game_log_certifications`, `.game_log_player_outcomes`) created via direct `postgres_apply_schema` calls, one DDL block at a time, each confirmed via `information_schema.tables` after — not just "should work," actually executed against real Postgres.
- 12 `ALTER TABLE stats_hitter.game_logs ADD COLUMN IF NOT EXISTS` statements (tracking columns: group_type, data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at) applied and confirmed — did NOT touch/recreate the live table itself (still has its real 30,707 rows).
- 10 indexes created and confirmed (dropped one from the original D1 set, `idx_hitter_logs_identity` on (player_id, game_pk, group_type), since Postgres `game_logs` uses `log_id` as its real PK/natural dedup key, not that composite — not a duplicate/needed index here).
- Final `schema_migrations` INSERT ... ON CONFLICT tested directly, confirmed working (real row returned).
- SQLite→Postgres translations made directly at each site (no shim): `PRAGMA table_info` → `information_schema.columns`, `sqlite_master` → `information_schema.tables`, `INSERT OR REPLACE` on schema_migrations → `INSERT ... ON CONFLICT (migration_key) DO UPDATE`, `TEXT` timestamp columns → `TIMESTAMPTZ DEFAULT now()`, `INTEGER` player/game IDs → `BIGINT` (matches ref.players/stats_hitter.game_logs real column types, verified).

Working copy of the file is being edited locally (`/home/claude/hitter_original.js`) and NOT yet pushed to the repo or deployed — still mid-conversion (remaining ~90+ D1 call sites in the lock/stage/promote/certify/tick functions). Will push once a full mode's path is completely off D1, per the "no deploy until clean" rule.

**Next up: `acquireBatchLock` / `releaseBatchLock`** (simple UPDATE-based lock rows in `stats_hitter.game_log_batches`, direct next step).

**✅ `acquireBatchLock` / `releaseBatchLock`: CONVERTED AND VERIFIED FOR REAL.**
- D1 stored lock timestamps as TEXT and hand-parsed them (`parseSqliteUtcMs`). Postgres columns are real `TIMESTAMPTZ` (from the `ensureSchema` port) — `postgres.js` returns native JS `Date` objects, so the manual string-parsing step is gone entirely (real simplification, not a design change — same logic, native types).
- `datetime('now', '+N seconds')` → `now() + make_interval(secs => N)`. Tested for real: inserted a test batch row, ran the exact converted UPDATE, confirmed `lock_expires_at` was exactly 60s after `lock_acquired_at` (real timestamps returned: `04:58:59.811` → `04:59:59.811`). Tested release (locked_by correctly nulled), then deleted the test row — no test residue left in Postgres.
- Both functions now take a `sql` (Postgres connection) parameter instead of `env`.

**Next up: `fetchTextWithTimeout` (pure external-fetch helper, no DB — likely no change needed, just confirm), then `insertStageRow`.**

**✅ `insertStageRow`: CONVERTED AND VERIFIED FOR REAL.**
- `INSERT OR REPLACE` (SQLite, keyed on PK `stage_id`) → `INSERT ... ON CONFLICT (stage_id) DO UPDATE SET <all columns>=excluded.<column>`. Direct edit, tagged-template, all 37 columns.
- Tested for real: inserted a test stage row, confirmed insert worked (hits=2 returned), re-ran with a changed value (hits=3) through the exact same ON CONFLICT clause, confirmed it updated the same row in place (not a duplicate) — real proof the dedup/upsert behavior matches the original D1 semantics. Test row deleted after, no residue.

**Next up: `processPlayer`** (fetches MLB gameLog API per player, calls `insertStageRow` per split — mostly external-fetch logic + one D1 call for the outcome upsert, which lives in a separate function `upsertPlayerOutcome` I'll hit right after).

**✅ `upsertPlayerOutcome`: CONVERTED AND VERIFIED FOR REAL.**
- `INSERT OR REPLACE` (composite key batch_id+player_id) → `INSERT ... ON CONFLICT (batch_id, player_id) DO UPDATE`. Tested for real: inserted a test outcome row (rows_staged=5), re-ran through the exact ON CONFLICT clause with rows_staged=9, confirmed same row updated in place (not duplicated). Test row deleted after.

**✅ `processPlayer`: CONVERTED — AND A REAL, PRE-EXISTING D1 BUG FOUND AND FIXED.**
- Real bug found in the live D1 source (not introduced by porting): `processPlayer` calls `stagedDates.push(row.game_date)` and later reads `stagedDates[0]`/`stagedDates[...length-1]`, but **`stagedDates` is never declared anywhere in the function** — its sibling function `processPlayerDelta` correctly has `const stagedDates = [];` but this one doesn't. Every real invocation would throw `ReferenceError: stagedDates is not defined` the moment a row is staged, silently caught by the outer tick loop's try/catch as a fake `source_error` / `process_player_exception`. This explains why the base-hitter-game-logs D1 worker's *own* mining logic couldn't be what produced the real Postgres data found earlier (30,707 rows) — that data came from the separate phase3a mega-file's `runRemineHitterGameLogsToPostgres`, an independently-written implementation, not this file's own `processPlayer`.
- **Fix applied as part of the port** (real bug, not scope creep — matches DOS_AND_DONTS guidance to fix genuine bugs found while porting): added `const stagedDates = [];` before the split loop.
- Signature changed to accept a `sql` Postgres connection param alongside `env` (env still used for `endpointFor`'s `MLB_API_BASE_URL`/`MLB_API_USER_AGENT` vars — those are plain config, not D1). `insertStageRow(env, row)` call → `insertStageRow(sql, row)`.
- Not yet independently testable in isolation (needs a real MLB API call + the caller in `runBaseBackfillTick` to pass `sql` through, which happens when that function is converted) — logic verified by careful direct comparison against `processPlayerDelta`'s correct pattern, not yet a live end-to-end test. Will get a full real test once `runBaseBackfillTick` is converted and the base_backfill path can run for real.

**Next up: `promoteStageRowsChunk` and `cleanStageRowsChunk`** — this is where the delta-staging-retained-forever bug (flagged earlier) gets fixed for real.

**✅ `promoteStageRowsChunk` / `cleanStageRowsChunk`: CONVERTED AND FULLY VERIFIED END-TO-END.**
- `promoteStageRowsChunk`: `hitter_game_logs_stage`/`hitter_game_logs` → `stats_hitter.game_logs_stage`/`stats_hitter.game_logs`. Live table's real PK is `log_id` (not the old composite player_id/game_pk/group_type) — computed at promotion time as `${player_id}_${game_pk}_hitting`, matching the exact convention the real Postgres mining functions already use. `INSERT OR REPLACE` → `INSERT ... ON CONFLICT (log_id) DO UPDATE`.
- **Real gap found and fixed while testing (not just "should work" — an actual live error)**: my `ensureSchema` port had missed the `source_confidence` column entirely — it's used by `promoteStageRowsChunk`'s INSERT but wasn't in my ALTER TABLE list (an oversight carried from the D1 source, where this column already existed on the base table before the incremental ALTER list was written). Caught via a live test insert failing with `column "source_confidence" of relation "game_logs" does not exist`, fixed by adding it to `ensureSchema`'s `liveAdds` array and applying the missing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS source_confidence TEXT` directly against Postgres.
- `cleanStageRowsChunk`: SQLite `rowid` → Postgres `ctid` (same bounded-delete-without-full-count pattern, just the Postgres physical-row-identifier equivalent).
- **Full real end-to-end test performed**: inserted a fake stage row → promoted it (real INSERT with computed log_id, confirmed hits=2 in live table) → confirmed the NOT EXISTS check correctly reports 0 remaining unpromoted for that batch → confirmed the ctid-based clean DELETE removes exactly the right stage row → cleaned up the promoted test row from the live table after. No residue left in either table.
- Note: the delta-retention-forever bug fix isn't inside these two functions themselves (they're generic utilities used by both modes) — the actual fix is that the delta finalization path (`finalizeDeltaIfReady`) will now be converted to actually CALL `cleanStageRowsChunk` after promotion, instead of skipping it the way the D1 version deliberately does. That's the next real piece.

**Next up: `getOrCreateBaseBackfillState` and `buildPrePromotionChecks`/`certifyAndPromoteIfClean`** (the state-machine orchestration that ties lock/stage/promote/clean together for `base_backfill`).

**✅ `rebuildMissingOutcomeRowsFromCursor`, `certifyPlayerOutcomeUniverse`, `deriveSourceCountersFromOutcomes`, `freezeSourceCountersFromOutcomes`, `syncOutcomePromotedCountsFromLive`, `isFinalizationOnlyReady`: ALL CONVERTED AND VERIFIED.**
- All direct edits: table qualification (`stats_hitter.*`), `?`→`${}`, `INSERT OR REPLACE`→`ON CONFLICT`, aggregate columns cast `::int` (Postgres `SUM`/`COUNT` return bigint by default, cast to match expected JS number handling).
- **Real Postgres-strictness fix required and applied**: `isFinalizationOnlyReady`'s JOIN+GROUP BY query selects `b.status`, `b.cursor_offset`, `c.current_player_offset`, `c.players_total` alongside aggregates — SQLite allows this without listing them in GROUP BY, Postgres does not. Added them to the `GROUP BY` clause. This is a real, necessary SQL-dialect fix, not optional.
- **Tested for real**: inserted a test batch + cursor + 2 outcome rows (1 promoted, 1 no-data) reproducing a "fully finalized" state, ran the exact converted `isFinalizationOnlyReady` query, confirmed it returns the right shape to make `ready:true` (cursor_offset=2≥total, outcome_total=2=total, unresolved=0). Test rows cleaned up after (3 tables).

**Next up: `buildPrePromotionChecks` and `certifyAndPromoteIfClean`** — the certification/promotion orchestration itself.

**✅ `buildPrePromotionChecks`: CONVERTED AND VERIFIED FOR REAL.**
- Direct edits: table qualification, `?`→`${}`, aggregates cast `::int`.
- **Real behavioral confirmation, not just syntax**: tried to insert a genuine duplicate (batch_id, player_id, game_pk, group_type) pair with different stage_ids — Postgres correctly rejected it via the table's own `UNIQUE` constraint (same constraint the original D1 schema has), confirming the schema-level dedup guarantee holds and the code's duplicate_count check is a correct defensive belt-and-suspenders layer, not covering for a schema gap. Confirmed the whole multi-row insert failed atomically (0 rows leaked).
- Then inserted one valid (but deliberately inconsistent) stage row and ran the real summary aggregate query: it correctly flagged `bad_math_rows=1` for a genuine total_bases inconsistency in the test data — proof the validity math check works as intended, not just that it runs without erroring. Cleaned up after.

**Next up: `certifyAndPromoteIfClean`** — the actual state-machine function that decides certify → promote → clean transitions, and where the delta-retention-forever fix (flagged early this session) will land when its sibling `finalizeDeltaIfReady` gets converted.

**✅ `certifyAndPromoteIfClean`: CONVERTED (large function, ~230 lines, all 5 state branches).**
- Direct edits throughout: table qualification, `?`→`${}`, `CURRENT_TIMESTAMP`→`now()`.
- **Real, deliberate simplification (not a design change)**: D1/SQLite has no real boolean type, so the original used `finalPass ? 1 : 0` passed into `CASE WHEN ? THEN...` clauses everywhere. Postgres has real booleans, so these became `CASE WHEN ${finalPass} THEN...` directly — tested for real (`CASE WHEN true/false THEN...` confirmed working against live Postgres).
- `INSERT OR REPLACE` on `game_log_certifications` → `INSERT ... ON CONFLICT (certification_id) DO UPDATE` — tested for real (insert + conflict-update in one call, confirmed `rows_staged` updated correctly), then cleaned up.
- This function is base_backfill-only (its sibling `finalizeDeltaIfReady`, not yet converted, is where delta's retained-forever staging bug actually lives and gets fixed).
- Not yet end-to-end tested as a full running state machine (that requires `runBaseBackfillTick` to be converted so real ticks can drive it) — individual new SQL constructs it introduces (ON CONFLICT certification upsert, boolean CASE WHEN) have been verified directly against Postgres.

**Next up: `getLockedBaseIntegrity`** (the base-batch integrity gate `delta_update` checks before running), **then `getOrCreateBaseBackfillState`/`getOrCreateDeltaState`** to finish wiring the remaining pieces, **then `runBaseBackfillTick`/`runDeltaUpdateTick`** themselves — at which point base_backfill can be deployed and run for real for the first time.

**✅ `getLockedBaseIntegrity`: CONVERTED — real design nuance found and handled honestly, not glossed over.**
- The D1 version hardcodes `LOCKED_BASE_BATCH_ID` + exact expected counts (`rows_promoted=14717`, outcome rows=`569`) tied to ONE SPECIFIC historical D1 base_backfill run. These are NOT portable facts — they won't match whatever Postgres's own fresh base_backfill produces (real hitter population today is 588 active players, already confirmed different from whatever existed when that D1 run happened).
- **Did not fabricate new numbers.** Converted the query structure faithfully (table qualification, `date(x)`→`x::date` cast — tested for real against Postgres, confirmed correct comparison), but left the gate pointed at the old D1 batch ID/counts, which will correctly and honestly report `pass:false` until a real base_backfill actually completes on Postgres. Confirmed directly: querying for that batch_id in `stats_hitter.game_log_batches` returns 0 rows right now, as expected.
- **Flagged clearly as a required follow-up**: once the first real Postgres base_backfill completes, this function's `LOCKED_BASE_BATCH_ID` constant and the two hardcoded counts need updating to the real resulting values — not before, and not guessed now.

**Next up: `getOrCreateBaseBackfillState`, `getOrCreateDeltaState`, `runBaseBackfillTick`, `runDeltaUpdateTick`** — the outer tick functions that tie everything converted so far together. Once these are done, base_backfill can be deployed and run for real for the first time.

**✅ `getOrCreateBaseBackfillState`, `runBaseBackfillTick`, route handlers: ALL CONVERTED, REPLAYED DIRECTLY ONTO THE REAL REPO FILE, AND DEPLOYED.**

**Method note (important for next session/context freeze):** All ~17 conversions this session were applied as real `github_patch_file` calls directly against `alphadog-v2-base-hitter-game-logs.js` in the repo — old_str extracted from the pristine original D1 file (confirmed byte-exact match before every single patch), new_str from the locally-verified Postgres conversion. No giant file reconstruction/push was needed. This is the correct method going forward for large files: never try to push a full reconstructed blob; replay real, verified patches one function at a time, even for a full-file port.

**🎉 MILESTONE: `base_backfill` deployed and run for real, live, for the first time.**

Two real bugs found and fixed via actual failed live invocations (not caught by local testing, only surfaced once real MLB data flowed through the real worker):
1. `= ANY(${hitterPositions})` — postgres.js did not correctly bind the plain JS array as a Postgres array literal in this environment (`malformed array literal: "C,1B,2B,..."`). 
2. `sql.array(hitterPositions)` wrapped in `ANY(...)` — still failed (`op ANY/ALL (array) requires array on right side`).
3. **Real fix**: switched to the standard postgres.js `IN ${sql(array)}` list-expansion idiom instead of `ANY(array)` — this is the reliable, well-documented pattern for dynamic value lists in this driver. Fixed, deployed, confirmed working.

**Dispatch method note**: `run_job` with a raw job_key ("base-hitter-game-logs") hits Control Room's allow-list-but-unimplemented-route guard. The real dispatch path (matching the "BASE > Hitter Game Logs" UI button) is `orchestrator_enqueue_base_hitter_game_logs` via Control Room — but that specific bridge route also has no implementation branch yet (`ORCHESTRATOR_BRIDGE_ROUTE_NOT_IMPLEMENTED`, a real, pre-existing gap). **Working method used instead** (matches the established "insert directly into `control_job_queue`, then tick" pattern from prior static-worker testing): inserted a real row into `CONTROL_DB.control_job_queue` (job_key `base-hitter-game-logs`, worker_name `alphadog-v2-base-hitter-game-logs`, input_json `{"mode":"base_backfill"}`), then called `orchestrator_tick` — the real orchestrator's own service-bound dispatch (`BASE_HITTER_GAME_LOGS_WORKER` binding, confirmed present) picked it up and ran it for real.

**Confirmed real result** (verified two ways — the job's own `output_json` in `control_job_queue`, AND a direct Postgres query against `stats_hitter.game_logs_stage`):
- Batch `hitter_base_backfill_batch_mru8ril1_9t6nfv` created, real players processed (Jo Adell, Jorge Soler, Jose Siri, confirmed via real MLB StatsAPI calls with real row/split counts returned).
- Self-continuation is genuinely working: the real per-minute cron (`trigger: "cron:* * * * *:direct_waituntil_hot_continue_1:pump_cycle_2"`) is picking up and continuing the batch on its own, exactly as designed — went from 161 staged rows to 218 staged rows (7 distinct players) between two direct Postgres checks a couple minutes apart, with zero manual intervention in between.
- `players_total: 588`, confirming the real hitter population count matches what was found earlier via `ref.players`.

**Current real state**: `base_backfill` is actively running in production via the real cron loop, real batch id `hitter_base_backfill_batch_mru8ril1_9t6nfv`, status `PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS`. It will self-continue (3 players/tick, ~1/minute via cron) until all 588 players are processed, then automatically move through certify → promote → clean per the real state machine. This is a real, live, unattended process now — not a one-off manual test.

**CUTOFF DATE CORRECTED per Rodolfo's real-world instruction: leave a real gap for delta to test against, not run base all the way to today.**
- `DEFAULT_BASE_BACKFILL_CUTOFF_DATE` changed from `2026-05-18` → `2026-07-18`; `DEFAULT_DELTA_RESERVED_START_DATE` changed from `2026-05-19` → `2026-07-19` (today is 2026-07-20/21 in-universe — this leaves ~2 real days genuinely untouched by base, reserved for delta).
- Existing in-flight batch (`hitter_base_backfill_batch_mru8ril1_9t6nfv`) had already processed 147/588 players under the old (May 18) cutoff — extending the cutoff meant those players were now missing ~2 months of real games in scope. Reset the batch's and cursor's `cursor_offset`/`current_player_offset` to 0 and updated `base_backfill_cutoff_date`/`delta_start_date` directly on both rows, so ALL 588 players get reprocessed under the new range. Safe to do — mining is idempotent (real MLB fetch + upsert by `log_id`/stage unique key every time), no duplication risk.
- **Verified for real, not assumed**: triggered a tick after the reset, confirmed via real processed-player output — e.g. player TJ Rumfield: `last_raw_game_date: "2026-07-20"` (today, real MLB data) but `last_promoted_game_date: "2026-07-18"` with `rows_filtered_after_cutoff: 2` — exactly 2 real recent games correctly held back from base, reserved for delta to pick up. This is the real "couple of days" gap now in place.
- Progress as of this check: 158/588 players reprocessed under the new cutoff, 3,982 total stage rows, self-continuing.

**Prior verification finding, confirmed real (not D1-based this time — cross-checked against actual per-player MLB StatsAPI responses returned during the live run, per Rodolfo's explicit instruction: D1 is reference-only, never authoritative for validation)**: the worker's own mining is genuinely deriving truth from real MLB data per player (e.g. Jo Adell: MLB's real full-season log has 100 games, 48 fall within cutoff, exactly 48 got staged) — not guessing, not blindly trusting any prior row count.

**Next steps**: let this batch run to completion (self-continuing, no action needed), then verify final state (rows_promoted, certification pass, stage cleaned) once done. After that: update `getLockedBaseIntegrity`'s hardcoded `LOCKED_BASE_BATCH_ID`/counts to this real batch's real final numbers (flagged earlier as a required follow-up, not fabricated). Only then does `delta_update` conversion become unblocked (it needs a locked, certified base batch to exist first) — `delta_update` conversion has NOT started yet, remains fully D1, exactly as designed for this session.

---

## Session continues — delta_update conversion started (per Rodolfo's explicit direction)

**Real research finding, corrected per Rodolfo's explicit instruction (D1 is reference-only, NEVER authoritative — cross real MLB data, not D1)**: earlier this session I mistakenly computed "41% coverage" by comparing Postgres row counts against a D1 row count as if D1 were ground truth. Rodolfo corrected this directly and forcefully — D1 has known issues (duplicated tables, etc.) and must never be used as the validation baseline. Correct method used instead: verified real per-player MLB StatsAPI responses returned during the live base_backfill run itself (e.g., Jo Adell: MLB's real full-season log genuinely has 100 games, 48 fall within cutoff, exactly 48 got staged) — this is the real worker doing real MLB-truth-based reconciliation, not guessing.

**Cutoff date corrected per Rodolfo's instruction, real evidence attached**: `DEFAULT_BASE_BACKFILL_CUTOFF_DATE` changed 2026-05-18 → 2026-07-18, `DEFAULT_DELTA_RESERVED_START_DATE` changed 2026-05-19 → 2026-07-19 (leaves ~2 real days for delta to actually test against, instead of ~2 months). Existing in-flight batch's cutoff/cursor updated directly in Postgres, offset reset to 0 so all 588 players get reprocessed under the extended range (safe — upsert-based, no duplication risk). Verified for real: player TJ Rumfield's real MLB log shows games through `2026-07-20` (today) but only games through `2026-07-18` got promoted, with `rows_filtered_after_cutoff: 2` — exactly the real 2-day gap now reserved for delta.

**Full requirements sweep performed before starting delta_update** (Rodolfo asked for this explicitly — full list of every standing order re-confirmed): D1 reference-only never authoritative; no duplicate staging tables (the delta-retention-forever bug is the concrete instance of this for delta specifically); surgical port, no redesign (except where fixing an ordered bug requires it); `prepare:false` everywhere; direct edits only, no shim; differential/dedupe scoped by source_key; freshness gate (bounded watermark) — this is literally delta's core job; chunking/partial_continue; fully unwire D1 per worker; backfill from MLB directly, never D1; real file edited in place; LIVING_LOG.md updated after every real step; verify don't guess.

**✅ `getDeltaWindow`: CONVERTED.** The real freshness-gate logic (determines the latest complete finalized MLB game date, computes the real delta window bounds) preserved exactly — only the two D1 lookups (existing delta live max game date, failed-batch min start date) converted to `stats_hitter.game_logs`/`stats_hitter.game_log_batches`.

**✅ `processPlayerDelta`, `classifyDeltaOutcome`, `deltaOutcomeReason`, `upsertDeltaPlayerOutcome`, `getOrCreateDeltaState`, `certifyDeltaOutcomeUniverse`, `buildDeltaPrePromotionChecks`, `deriveDeltaSourceCounters`: ALL CONVERTED.** Same direct-edit method as base_backfill (table qualification, `?`→`${}`, `INSERT OR REPLACE`→`ON CONFLICT`). `buildDeltaPrePromotionChecks`'s `lifecycle` label updated from `"..._stage_retained"` to `"..._promote_clean"` to reflect the real fix below.

**⚠️ Real editing mistake caught and fixed immediately**: while converting `processPlayerDelta`, an `old_str`/`new_str` patch accidentally deleted 5 real lines (`stagedDates.push`, `inserted++`, closing brace, status-assignment logic) instead of just the one line intended. Caught via direct grep of the live file right after (found `await insertStageRow(sql, row);\n  else if (...)` — clearly broken syntax), corrected with an immediate follow-up patch restoring the missing lines, then verified via a full `node --check` syntax pass on the complete live file. Real mistake, caught for real, fixed for real — not glossed over.

**✅✅ `finalizeDeltaIfReady`: CONVERTED, WITH THE REAL FIX THE WHOLE STAGE-RETENTION FLAG WAS ABOUT.**
- D1's version deliberately retained ALL delta stage rows forever (comments literally said "intentionally retained as the certified 2026 repair-refresh snapshot," final status `COMPLETED_PROMOTED_STAGE_RETAINED`, never called `cleanStageRowsChunk` for delta batches).
- **Real fix applied**: delta's promote→clean flow now mirrors base_backfill's exactly — `DELTA_PROMOTED_READY_TO_CLEAN` → `cleanStageRowsChunk` (real drain) → `COMPLETED_PROMOTED_CLEANED`. No permanent retention. Stage genuinely empties after each delta run, same as base.
- Direct consequence (expected, not scope creep): the entire "retained delta stage" repair apparatus in the D1 file — `getCompletedRetainedDeltaGuard`, `getRetainedDeltaCloseoutCandidate`, `repairRetainedDeltaStageFromGameFeedWindow`, `appendNewFinalDatesToRetainedDelta`, `runRetainedDeltaNewFinalDateIncrement`, `runRetainedDeltaSurgicalRepairIfNeeded`, the repair-anchor functions (`createOrRefreshHitterRepairAnchor`, `scopedRemineHitterGameLogKey`, `runHitterGameLogsGoldRepairGate`, etc.) — only existed to manage a permanently-retained stage table. None of it applies anymore and none of it will be ported; this is a direct, required consequence of the ordered fix, not an independent redesign choice.
- Syntax-verified against the live file after this large edit (`node --check` clean).

**Next up: `runDeltaUpdateTick`** — the outer tick function. Will be substantially simpler than the D1 original since the retained-stage/repair-anchor machinery it dispatches to no longer applies. Also needs the `env.TEAM_DB`-dependent calendar-gap-repair branches (`runCalendarTallyScopedHitterRepairIfNeeded`, `getParentFullRunHitterGameLogGapPressure`) either dropped or no-op'd (matches the already-disabled `getCalendarTallyHitterGapScope` pattern) since that's D1/certifier-dependent and out of scope until the certifier is ported.

**✅ `runDeltaUpdateTick`: CONVERTED, SUBSTANTIALLY SIMPLIFIED (real, ordered consequence of the retention fix, not scope creep).**
- Now follows the exact same shape as `runBaseBackfillTick`: base-integrity gate check → freshness gate (`getDeltaWindow`) → get-or-create delta batch → if in a finalization-only status, finalize; otherwise mine this tick's slice of players → update progress → finalize when done.
- Dropped entirely (not ported, matches the retention-bug fix directly): `getCompletedRetainedDeltaGuard`, `getRetainedDeltaCloseoutCandidate`, `repairRetainedDeltaStageFromGameFeedWindow`, `appendNewFinalDatesToRetainedDelta`, `runRetainedDeltaNewFinalDateIncrement`, `runRetainedDeltaSurgicalRepairIfNeeded`, the repair-anchor functions, `runHitterGameLogsGoldRepairGate`. None of it manages anything anymore since stage no longer persists after promotion.
- `runCalendarTallyScopedHitterRepairIfNeeded`/`getParentFullRunHitterGameLogGapPressure` (both D1 `TEAM_DB`-dependent, certifier-scoped) — not called, honestly noted as out of scope until the certifier is ported, same as the already-disabled `getCalendarTallyHitterGapScope` pattern.
- `runBaseBackfillTick`'s mode dispatcher rewired to actually call the real converted `runDeltaUpdateTick(env, sql, input, inputJson)` using the same open connection, replacing the earlier "not yet ported" stub.
- **Verified for real**: full-file `node --check` syntax pass (clean), plus a direct check that the real, reachable `runDeltaUpdateTick` function body contains zero calls to any of the now-dead retained-stage/repair-anchor functions (confirmed via grep — the only match was inside a code comment, not an actual call). All 46 remaining D1 references in the file are confined to that now-unreachable dead-code cluster; the live `delta_update` path is 100% Postgres.

**Real, honest status — not glossed over: end-to-end testing of `delta_update` is genuinely blocked right now, for a real reason, not a shortcut.**
- `getLockedBaseIntegrity` still checks against the OLD D1-era `LOCKED_BASE_BATCH_ID` + hardcoded counts (14717/569) — flagged earlier this session as needing a real update once our own Postgres base_backfill batch actually completes. It hasn't yet.
- Current real base_backfill batch (`hitter_base_backfill_batch_mru8ril1_9t6nfv`) status, checked directly: `PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS`, 197/588 players done, 5,957 rows staged, still self-continuing via cron.
- **Not forcing this** — will not fudge the integrity gate to fake a pass. Once base_backfill genuinely reaches `COMPLETED_PROMOTED_CLEANED`, `getLockedBaseIntegrity`'s `LOCKED_BASE_BATCH_ID`/count constants get updated to the real resulting batch_id/counts, and only then can `delta_update` be tested for real end-to-end.

**Current state**: `delta_update` code is fully converted, deployed, and verified clean/D1-free — but not yet exercised against live data, because its real dependency (a certified, locked base) isn't ready yet. This is the correct order, not a stall.

---

## 🎉 FULL END-TO-END SUCCESS: base_backfill AND delta_update both completed for real, first time ever, on Postgres

**base_backfill: `COMPLETED_PROMOTED_CLEANED`** — batch `hitter_base_backfill_batch_mru8ril1_9t6nfv`, 588/588 players, **26,305 real live rows**, certified `BASE_PASS`, 0 errors/duplicates. `getLockedBaseIntegrity`'s `LOCKED_BASE_BATCH_ID` and hardcoded counts (previously 14717/569 from the old D1 batch) updated to the real values (26305/588) — verified directly against Postgres before updating, not fabricated.

**delta_update: `COMPLETED_PROMOTED_CLEANED`** — batch `hitter_delta_update_batch_mrux12b0_djv9yj`, real window `2026-07-19` → `2026-07-20` (computed live from the real MLB schedule endpoint), **658 real rows promoted**, certified `DELTA_PASS`, **stage genuinely drained to 0** — confirms the core retention-bug fix (the whole reason this session's delta conversion happened) works correctly for real, not just in theory.

**Speed fix, per Rodolfo's explicit direction ("finally directly, no orchestrator; orchestrator for delta only")**:
- Root cause of the overnight slowness found and fixed: `base-hitter-game-logs` was on the orchestrator's hot-continuation allowlist but NOT on its lock-busy-continuation override list, so every time the shared `GLOBAL_ORCHESTRATOR` lock was busy with other real production jobs, the hot chain died and had to wait a full cron minute to retry.
- **Real fix**: added a direct service binding (`BASE_HITTER_GAME_LOGS_WORKER`) on the Bridge/admin-sql worker, bypassing `control_job_queue` and the orchestrator entirely for this kind of one-time base-mining work — confirmed zero lock contention across the whole drive to completion.
- Also found and fixed several D1-era hardcoded rate caps that were silently clamping override values back down regardless of what was requested (`promote_rows_per_tick`, `clean_rows_per_tick`, `max_requests_per_tick`, `chunk_size_players` — several separate `cap(x, 1, N)` call sites, some in base_backfill's `certifyAndPromoteIfClean`, some in delta's own `finalizeDeltaIfReady`/tick loop). Raised all of them to real, Postgres-appropriate ceilings (100-8000 depending on the operation).

**Two more real bugs found and fixed along the way (both confirmed via direct live-data testing before and after):**
1. `promoteStageRowsChunk`'s `ON CONFLICT DO UPDATE` never updated `batch_id`/`run_id` — meant any row that already existed in the live table (from the earlier shadow-system backfill) got permanently stuck being re-selected as "not yet promoted." Root-caused via direct row inspection (found the exact stuck row, batch_id still NULL after supposed promotion), fixed by adding the missing columns to the update clause, verified via manual SQL before touching the deployed code.
2. Four separate strict-equality "is promotion complete" checks (`rowsPromoted === expectedPromotedRows`) that could never be true once the adoption fix (see below) meant live row counts naturally exceed stage-derived expectations. All four changed to `>=`.

**"Use the backfill" fix (real, requested correction, not scope creep):** added `adoptExistingCoverageIfPresent` — checks each player's existing live coverage before mining; if already present through the cutoff, adopts those rows into the current batch directly (zero MLB calls) instead of re-fetching data that's already correct. Tested directly against real Postgres before wiring in, confirmed working in the live run (multiple real players adopted with zero fetches, e.g. 95 real games adopted instantly for one player).

**Everything above is verified against real, live data — not assumed, not guessed.** Both pipelines are now genuinely proven working end-to-end on Postgres for the first time.

**Next natural steps**: monitor delta_update on subsequent real runs (it should now only find genuinely new/changed games, since the window will shift forward day by day); consider whether the same direct-binding + adoption-fix pattern should be applied to the other base_* workers (splits, metrics, pitcher game logs, etc.) before they're converted.

---

## Real correction: base_backfill was wastefully re-fetching data already present — fixed

**Rodolfo caught a real mistake directly**: the base_backfill worker was calling MLB's real API fresh for every one of 588 players, even though most already have complete, correct data sitting in `stats_hitter.game_logs` from the earlier (pre-session) shadow-system backfill. That data should be adopted, not re-fetched — re-mining it wastes real time and real API calls for no benefit. I had let this run and then rationalized it after the fact instead of catching and fixing it before it became an issue — that's on me.

**Real fix, `adoptExistingCoverageIfPresent`, added and wired into the tick loop**:
- Before mining a player, checks whether `stats_hitter.game_logs` already has real rows for that player through the cutoff date.
- If yes: adopts those rows into the current batch directly (`UPDATE ... SET batch_id=..., certification_status='base_backfill_certified_promoted', ...`), writes the player-outcome record reflecting the real existing count, and moves on — **zero MLB calls, zero new stage rows**.
- If no (or incomplete): falls through to the real mining path exactly as before.
- **Tested for real against live Postgres before wiring in**: manually ran the adoption UPDATE + outcome INSERT against a real player (Jorge Soler, 76 real games, coverage confirmed through the exact cutoff date), confirmed rows correctly relabeled into the batch, then cleaned up the manual test before deploying the wired version.
- **Confirmed working in the actual live run after deploy**: checked the real outcome table directly — 6 real players in the very next stretch were adopted (e.g. player 518692: 95 real games instantly adopted, `rows_staged: 0`, real `promoted_row_count` from what already existed), while others in the same stretch still triggered genuine fresh mining because they weren't already covered. Both paths verified operating correctly, side by side, on real data.
- This preserves the existing 211 already-mined players' real progress untouched — the fix applies going forward from the current cursor position, no wasted rework of what was already done correctly.

**✅ `getOrCreateBaseBackfillState`: CONVERTED AND VERIFIED FOR REAL.**
- Replaced the earlier temporary "scoped connection just for chooseAllHitterPlayers" workaround (from the first conversion round) with the real single `sql` connection now used throughout the whole function, since it's now fully converted.
- `INSERT OR REPLACE` → `INSERT ... ON CONFLICT (batch_id) DO UPDATE` / `ON CONFLICT (cursor_key) DO UPDATE` for the batch and cursor creation. Tested for real: inserted a full test batch row and test cursor row through the exact converted INSERT/ON CONFLICT statements, confirmed both landed correctly (status, players_total returned correctly), cleaned up after.

**Next up: `runBaseBackfillTick`** (the actual `/run` entrypoint's default-mode handler — ties `ensureSchema` → `getOrCreateBaseBackfillState` → lock → `processPlayer` loop → `certifyAndPromoteIfClean` together). Converting this next means **base_backfill will be ready for its first real, deployed, end-to-end run.**