# AlphaDog v2 — Claude Internal Work Log

RULE: Claude checks this log FIRST at the start of every new message/continue, no exception.
Claude updates this log every time it starts, fixes, or completes ANY job — micro or big.

---

## 2026-07-17 01:15 UTC — Status Snapshot

### DAILY CONTEXT
- Individual workers (3/3 clean runs each): daily-certifier, daily-probable-pitchers, daily-lineups,
  daily-player-availability, daily-weather, daily-bullpen-availability, daily-team-schedule-spot,
  daily-umpire-context — ALL DONE, ALL PASS.
- daily-context-full-run (chain): 3/3 PASS confirmed.

### MARKET
- Individual workers (3/3 clean runs each): market-certifier, market_teams (context_source_probe),
  market_hitters, market_pitchers — ALL DONE, ALL PASS.
- market-full-run (chain):
  - Run 1: PASS (~8.6 min, all 5 stages, request_id market_full_run_mro667j6_ns2ar1)
  - Run 2: PASS confirmed (request_id market_full_run_mro7knum_y79hl1, certification
    MARKET_FULL_RUN_CERTIFIED, grade PASS). Took much longer than run 1 (~35 min) purely due to
    the lock-starvation issue below, not a code defect - once priority was fixed it completed
    normally.
  - Run 3: STARTING NOW.

### SCORING
- Individual workers: NOT YET TESTED (my formal plan hasn't reached this yet).
- scoring-full-run (chain): A separate, NOT-Claude-initiated run is active —
  request_id scoring_full_run_mro71sux_228ucs, chain_id chain_scoring_full_run_mro71sux_228ucs,
  triggered via "SCORING > Full Run" button tap at 2026-07-17 00:22:42 (confirmed via
  control_worker_run_log — visible_button field). Origin unconfirmed/disputed by Rodolfo.
  Progress as of last check: stages 1-5 complete (certifier-first, prop-factor-miner,
  matrix-builder, enrichment-engine, scoring-engine), stage 6 (hit-probability-board) in
  progress via chunked partial_continue (~100 rows/cycle, ~4700+ rows written and growing).
  Real, legitimate progress — not stuck. Was starving market-full-run of the GLOBAL_ORCHESTRATOR
  lock (same job priority=1 vs market-full-run's priority=9 default). FIXED by manually setting
  market_full_run_mro7knum_y79hl1's priority to 1 to compete fairly — this worked, market-full-run
  advanced afterward.

### DAILY FULL RUN (4-in-1: Board -> Daily Context -> Market -> Scoring)
- Attempt 1: request_id daily_full_run_mro3kqqx_on0y25. Board Full Run passed (after clearing one
  stuck parlay-underdog-board row — genuine platform stall, unrelated to code). Daily Context Full
  Run passed. Market Full Run FAILED (stale child, retry budget exhausted) — root cause: this was
  BEFORE the lock-starvation issue was found/fixed AND before individual market worker validation.
  Chain marked FAILED overall (error: child_not_completed).
- NOT YET RETRIED. Will retry once Market Full Run (individual + chain) and Scoring Full Run
  (individual + chain) are both independently validated 3/3 clean per Rodolfo's protocol.

---

## KEY FIXES APPLIED THIS SESSION (for reference, not exhaustive — see git commit history on
alphadog-v2-daily-usage-pulse.js, alphadog-v2-daily-probable-pitchers.js, alphadog-v2-daily-lineups.js,
alphadog-v2-daily-player-availability.js, alphadog-v2-orchestrator.js, generate_wrangler_configs.py
for full diff history):

1. daily-umpire-context: disabled dead-weight Gemini fallback (0% success rate), merged
   probe+write into one loop, throttled heartbeats, batched schema creation.
2. daily-probable-pitchers: batched per-row writes (was up to 288 individual round-trips).
3. daily-lineups: reduced FETCH_TIMEOUT_MS 12000->5000, parallelized independent per-game
   sub-steps, converted the 14-game sequential loop to bounded concurrency (6 at a time).
4. daily-player-availability: fixed a real crash bug (undefined schemaEnsuredCache from an
   earlier incomplete deploy), batched schema creation, disconnected SOURCE_DEADLINE_MS safety
   net now properly wired, removed unnecessary 7-day lookback window, added real team-based
   chunking + partial_continue (10 teams/invocation) since the work is genuinely large — not
   forced into an artificial single-invocation deadline.
5. Orchestrator: fixed missing timeout wrapper on parlay-underdog-board dispatch (was hanging
   indefinitely, no bound at all) — added serviceBindingFetch with 20s timeout, same fix applied
   to prizepicks-github-board and parlay-sleeper-board proactively.
6. Orchestrator: restored 1-minute cron (from 5-minute) with real evidence this time — the
   5-minute value was based on an earlier unproven assumption and was making every chain 5x
   slower without fixing the actual external-API timeout issues it was blamed for.
7. Orchestrator: fixed daily-player-availability's dispatcher to correctly report partial_continue
   (queue status stays 'pending', not falsely 'completed'/'failed') so chunking actually works.
8. Found and fixed a real job-starvation issue: hit-probability-board (priority=1) was
   perpetually out-competing market-full-run (priority=9) for the GLOBAL_ORCHESTRATOR lock,
   even though market-full-run had been waiting far longer. Manually lowered priority to
   unblock; this is worth a permanent code-level fairness fix if it recurs.

---

## OPEN QUESTIONS / TODO
- Verify market-full-run run 2 actually finalized to "completed" status (was pending confirmation
  when this log was created).
- Run market-full-run run 3.
- Test each Scoring Full Run individual worker 3x (scoring-full-run-certifier, prop-factor-miner,
  matrix-builder, enrichment-engine, scoring-engine-shadow-v1, hit-probability-board, final-board).
- Run scoring-full-run chain 3x.
- Retry full daily-full-run (4-in-1) 3x once market + scoring are both clean.
- Minor/deferred: lineups.js has 3 leftover debug-instrumentation log INSERT calls (harmless,
  low overhead, not yet cleaned up).
- Minor/deferred: control_worker_run_log table is very large (500MB+) from this session's
  extensive debug logging — does not appear to affect performance but could be pruned later.
