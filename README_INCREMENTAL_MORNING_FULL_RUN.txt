AlphaDog v2 - Incremental Morning Full Run
Package: alphadog-v2-incremental-morning-full-run-package-v2026-05-25
Control Room: alphadog-v2-control-room-v1.6.105-incremental-morning-full-run-button
Orchestrator: alphadog-v2-orchestrator-v0.2.94-incremental-morning-full-run

Changed files:
- alphadog-v2-control-room.js
- alphadog-v2-orchestrator.js
- control_room.html

What this build adds:
- New Control Room button: DELTA / REPAIR JOBS > Full Run
- New route: orchestrator_enqueue_incremental_morning_full_run
- New parent job_key: incremental-morning-full-run
- Existing alphadog-v2-orchestrator owns the parent chain. No new worker file and no new service binding.
- Full Run scope is incremental base/delta only. Board/source refresh is deliberately excluded.

Child order:
1. base-hitter-game-logs mode=delta_update
2. base-pitcher-game-logs mode=delta_update
3. base-team-game-logs mode=delta_update
4. base-starter-history mode=delta_scoped_source_repair
5. base-bullpen-history mode=delta_update
6. base-hitter-splits mode=delta_update
7. base-pitcher-splits mode=delta_update
8. base-hitter-metrics mode=delta_recalculate_affected_players
9. base-pitcher-metrics mode=delta_recalculate_affected_players

Safety design:
- Parent enqueues one child at a time.
- Child rows share parent chain_id and parent_request_id.
- Parent validates each completed child before advancing.
- Parent stops on hard child failure, schema error, unsupported mode, base-backfill output during delta, duplicate counts, unsafe scoring/ranking/final board writes, stale unfinished child, or data_ok false.
- Transient failures can retry up to 2 times for that stage.
- Uses CONTROL_DB.control_locks key INCREMENTAL_MORNING_FULL_RUN.
- Duplicate active parent chains are refused.
- Parent lock is released on completed/failed/blocked.
- Backend waitUntil/pump owns continuation; browser does not loop.
- ORCHESTRATOR > Wake is manual testing/rescue only.

Important fix also included:
- Orchestrator auto-pump due-counts now include base-hitter-metrics and base-pitcher-metrics, so long metrics deltas and the Full Run chain can self-continue through backend waitUntil instead of relying on manual repeated Wake or waiting only for cron rescue.

Deploy order:
1. Deploy alphadog-v2-orchestrator.js.
2. Deploy alphadog-v2-control-room.js.
3. Upload/replace control_room.html if your deployment uses the static HTML file too.
4. Open Control Room and confirm version tag shows v1.6.105.
5. Tap ORCHESTRATOR > Health or DEBUG > Config.
6. Run the test sequence printed in chat.

Do not run BASE > Pitcher Metrics for this phase. Use DELTA / REPAIR JOBS > Full Run.
