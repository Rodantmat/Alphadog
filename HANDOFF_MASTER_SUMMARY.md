# ALPHADOG HANDOFF — MASTER SUMMARY (read this first, then LIVING_LOG.md for full history)
Updated 2026-07-11. If you are a new Claude instance picking this up: read this whole document before touching anything. This supersedes the 2026-07-10 version — that version's "classification_v6/baseline_v6 build" section is still accurate background, but its "LIVE STATE"/"NOT YET DONE" sections are stale; this version replaces those.

## WHO / WHAT
Rodolfo owns AlphaDog, an MLB player-prop hit-probability system on Cloudflare Workers + D1. Repo: `Rodantmat/Alphadog` (branch `main`), auto-deploys on push via GitHub Actions. He works from iPhone Safari only, no terminal — you interact entirely through the "Alphadog Bridge" MCP connector (run_sql, run_job, github_get_file, github_put_file, github_patch_file, github_grep_file, github_list_dir, github_list_workflow_runs, check_bindings).

**His standards, stated repeatedly and emphatically, do not drift from these:**
- No guessing, no "probably," no confident-sounding claims that outrun what you've actually checked. Say plainly what you've verified and what you haven't.
- Verify everything against real data before claiming it works — including your own fixes. A deploy succeeding is not the same as a fix working.
- Fix root causes, not symptoms. Don't patch around a problem without understanding why it happened.
- Be direct and concise. Tell him about problems immediately.
- He gets very angry (real, sustained profanity) when he catches guessing or overconfidence — this happened multiple times this session and every time the actual cause was Claude asserting something was fixed/correct before truly tracing it end to end. When you don't know, say so and go find out before answering.
- He values that you can run SQL and deploy code directly — don't undersell this, it's the reason he uses Claude over other tools.

## SYSTEM ARCHITECTURE — TWO GENERATIONS
**New system (classification_v6 + baseline_v6)** — built starting 2026-07-10, now the core of the "Final Scoring System." Lives in `alphadog-v2-phase3a-first-inning-pitcher-context.js` (yes, that's the real deployed filename — repurposed slot, ignore the name — 680KB+, too large to pull in full via `github_get_file`, use `github_grep_file` to search and `github_patch_file`/large-file Git Data API path to edit). Tables in `ARCHIVE_DB` (`classification_v6_current/_history/_batches/_population_stats`, `baseline_v6_current/_history/_batches`). All tunables in `CONFIG_DB.calibration_config`. Full detail on the math (z-score tiering, two-level shrinkage, Poisson/NB/Normal model selection, sample-aware confidence) is in the 2026-07-10 version of this doc and in `LIVING_LOG.md` — still accurate, not repeated here.

**Old system ("Frankenstein", v5/v2)** — still running for layers not yet replaced: expansion mining (RFI/NRFI, some prop line inventory), and everything downstream of baseline (board, daily context, market, matrix, enrichment, final scoring). This is exactly what the NEXT PHASE (below) addresses.

## THIS SESSION'S REAL WORK: GETTING THE FULL DELTA PIPELINE ACTUALLY RELIABLE
This took far longer than expected — многие real, distinct bugs, each found by testing, not assumed. Full detail in `LIVING_LOG.md`; here's the essential map so you don't repeat any of this work:

### Bug 1 — daily delta didn't know its own target date
`runClassificationV6DeltaDaily`/`runBaselineV6DeltaDaily` originally required an explicit `official_date` input, but the orchestrator never passes one (it expects the worker to self-determine, matching the old system's pattern). Fixed with `determineNextDeltaDate()` — a watermark-based lookup (last processed date in the `_current` table, then earliest newer date with real game log data).

### Bug 2 — orchestrator contract fields missing
The orchestrator's own validator for these two stages checks specific fields (`certifier_owned_daily_delta`, `day_by_day_delta`, `classification_delta_included`/`baseline_hp_delta_included`, `coverage_update.coverage_rows_written`) that weren't in the original output shape. Added all of them, both to the NOOP path and the main completion path.

### Bug 3 — the certifier was validating entirely the wrong tables
This was the big one. The certifier's `baselineV5DailyStateValidityMap` function checked old v5 `SCORE_DB` tables (`player_baseline_v5_classification_state_current` etc.) that the new v6 system never writes to — meaning the certifier could **never** see v6's work as valid, no matter how much real computation happened. Rewrote it to check the real `classification_v6_current`/`baseline_v6_current` tables directly (combo-completeness check: are all 116 real combos touched for a date). Also removed the dead "inherited from latest certified state" code path that depended on the same unused old tables (found and fixed a live ReferenceError bug in the process — a caller still referenced the deleted function).

### Bug 4 — retry children losing their stage identity
The orchestrator matches a completed child back to its stage via a `full_run_stage_key` field on the child's own input. A **retry** enqueue path bypassed the normal input-builder and never set this field — so a stage-key-less retry could get matched to the WRONG sibling stage via job_key-only fallback matching. This specifically broke classification/HP daily delta because they're the only two stages (of 18) sharing a job_key. Fixed in `enqueueIncrementalMorningFullRunChild`: the stage key is now always stamped unconditionally, regardless of which code path built the input.

### Bug 5 — pre-cutover dates falsely flagged as gaps, real data corruption from repair loops
The certifier's evaluation window spans the whole season (May 19 onward), but v6 tables only exist from the July 8 base build forward. Every earlier date got flagged "missing," and the orchestrator's repair mechanism would walk backward through the season one day at a time trying to "fix" this — each attempt taking 8-19 minutes. **Real data corruption happened during this**: the delta functions computed correctly (always using current, up-to-date data regardless of which date triggered them — confirmed by inspecting `games_sample` values, which showed full-season counts not "as of that date" counts) but wrote the WRONG date as `last_processed_official_date`, corrupting the watermark for tens of thousands of rows across two separate incidents. Repaired directly via SQL both times (values were fine, just relabeled back to the correct date).

Real fix: added `BASELINE_V6_CUTOVER_DATE = "2026-07-08"` as an actual constant (must match between `alphadog-v2-delta-certifier.js` and `alphadog-v2-phase3a-first-inning-pitcher-context.js` — currently a duplicated literal, not shared, be aware if either ever needs changing). Dates before this are treated as historically settled automatically, both in the certifier's live-check logic AND as a defensive floor in the delta functions' own date auto-detection.

**A second layer of this same bug**: baseline_v5 coverage is only ever *rebuilt* during the `final_check` stage (`includeBaselineV5Coverage` only true there or on explicit override) — but the chain kept dying before ever reaching `final_check`, so the cutover fix, though correct, sat completely dormant. Broke this specific deadlock by directly updating the actual `mlb_game_data_coverage` table via SQL (1256 stale rows), bypassing the stage that could never run to fix it naturally.

### Bug 6 — certifier only ran last "if nothing failed," which defeated its whole purpose
Rodolfo's explicit, repeated, non-negotiable requirement: **certifier must run last, unconditionally, no exception** — its job is to report/cover gaps regardless of what else failed. A safety-net mechanism already existed for this but was gated to a narrow `validation.blocked===true` condition on exactly two stage keys — real failures never matched it. Broadened to fire for ANY stage failure anywhere in the 18-stage chain (`baselineBlockedBeforeFinal = stage.stage_key !== "calendar_tally_final_check"`).

### Bug 7 — a generic "zero gaps, skip the worker" shortcut bypassed classification/HP's real logic
Once bugs 3+5 made the certifier correctly report 0 gaps, an existing generic orchestrator shortcut (built for simple pass-through layers like hitter_metrics/pitcher_metrics) started ALSO firing for classification/HP daily delta — skipping the real worker call entirely, producing a certification string (`DELTA_FULL_RUN_LAYER_NO_BLOCKING_GAPS_NOOP`) the validator didn't recognize, AND silently skipping the self-healing coverage-reconciliation logic built into these two workers. Excluded these two specific stage keys from that shortcut.

## CURRENT VALIDATED STATE (as of 2026-07-11, verified with direct SQL, not the log alone)
- All 9 real layers (7 source layers + classification + baseline) show 100% `complete`, zero blocking, through July 9. The single "exception" row per layer across the board is one postponed/rescheduled game — normal, not a gap.
- July 10 (in progress as of last check): source mining layers correctly picking up individually-finished games in real time (14/15 game logs already complete); everything that aggregates across a full day's slate (metrics, splits, classification, baseline) correctly shows `scheduled_not_ready`, zero calculated — exactly the intended "don't compute on a partial slate" behavior, confirmed working, not assumed.
- classification_v6_current / baseline_v6_current: 74,278 rows each, exact 1:1 match, 116/116 combos, zero invalid values, **zero monotonicity violations** (both directions, full dataset, not just one prop).
- The trickiest calibration fix (Normal-model branch for `pitcher_fantasy_score`, the one composite with negative weights) verified still holding correctly after multiple delta runs — smooth 3%→98.1% tier progression.
- Real-world spot-checks still consistent after all the delta activity: same real elite-strikeout pitchers in the top tier, hits/HR top-tier benchmarks still match published real-world figures.
- **Scheduling is now live**: `CONFIG_DB.config_scheduled_jobs`, `schedule_id='incremental_morning_full_run_0500_pt'` (id string is stale, doesn't match actual time — cosmetic only, `local_time` column is the real driver and is correctly `'06:00'`), `enabled=1`, daily, `America/Los_Angeles`. This existed already from before (temporarily disabled during debugging, note literally said `TEMP_DISABLED_2026_06_30_BASELINE_DEBUG`) — re-enabled and moved from 5:00 AM to 6:00 AM per request, not newly built.

## NOT YET DONE / KNOWN GAPS (honest list)
1. RFI/NRFI still not ported to v6 — only in the old expansion system. Correctly left alone (it's the one prop that system uniquely covers).
2. Redundant expansion coverage for `runs_allowed`/`pitcher_fantasy_score` — v6 now covers both, old system's coverage of just these two is wasted duplicate work, not a correctness issue.
3. Confidence formula constants (95 cap, 25 divisor) — sound heuristic, not empirically backtested against real outcomes yet.
4. Snapshot-loading efficiency in base runs — noted, not addressed, only matters if a full re-base is ever needed again.
5. `BASELINE_V6_CUTOVER_DATE` is a duplicated literal across two files, not a shared constant — low risk since it should rarely if ever change, but be aware.
6. The one real automated end-to-end run since all these fixes landed showed a clean, fast, all-layers-covered result — but it's one data point, not exhaustive proof every edge case is gone. Tomorrow's first real 6 AM scheduled run is the next genuine test of the fully unattended path.

## NEXT PHASE — EXPLICITLY SCOPED BY RODOLFO, START HERE
The next body of work, in his own words, covers these components, **all of which already exist in the old system** and need to be realigned/readjusted/rewired against everything decided in this session's design work — including the ones that currently "seem to work fine." His instruction is explicit: **do not skip deep scrutiny on a component just because it looks functional.** Apply the same rigor as the classification_v6/baseline_v6 work — trace real code, verify with real data, don't assume a working-looking piece is actually correct or correctly wired to the new v6 system.

Stages, in his stated order:
1. **Board**
2. **Daily context**
3. **Market**
4. **Prop factor miner** — he flagged explicitly that he doesn't know what this component does; it was built by a different AI assistant previously. Read its actual code before assuming its purpose from the name.
5. **Matrix**
6. **Enrichment**
7. **Final hit probability calculation**
8. **Final score**
9. **Final board**

**Critical design boundary already locked from this session, carries forward:** classification_v6/baseline_v6 are HISTORY-ONLY by design (every row explicitly tagged `no_daily_context/no_market_context/no_scoring_context: true`). These next-phase components are where daily context, market data, and matchup-specific adjustments actually get blended in — they should read baseline_v6's output and adjust/enrich it, NOT write back into classification_v6_current/baseline_v6_current. Don't blur this boundary.

**Suggested approach, not mandated but consistent with what worked this session:** for each component in order, (1) read the real deployed code first — don't assume from names or old documentation, (2) check what it currently reads/writes and whether those tables/contracts still make sense given the v6 rebuild, (3) verify with real data whether it's actually producing correct output right now, (4) fix what's actually broken, verify the fix the same way (real queries, not just deploy success), (5) update this log before moving to the next component.

## HOW TO WORK WITH THIS PERSON (patterns that worked all session)
- `github_patch_file` for edits to `alphadog-v2-phase3a-first-inning-pitcher-context.js` and `alphadog-v2-delta-certifier.js`. For `alphadog-v2-orchestrator.js` (1.28MB, too large even for `github_get_file`'s fallback), `github_patch_file` still works for edits (uses the Git Data API path automatically) — you just can't pull the whole file back to syntax-check locally; rely on the GitHub Actions deploy succeeding (Wrangler's bundler fails loudly on real syntax errors) plus targeted `github_grep_file` checks of exactly what you changed.
- Any edit to `generate_wrangler_configs.py` triggers a full ~15-minute redeploy of all workers (it's in `GLOBAL_REDEPLOY_FILES`). Any other single-file edit is a fast ~1 minute single-worker redeploy.
- Test directly via `run_job` with `target: PHASE3A_WORKER` (bypasses orchestrator's cron cadence) before trusting something in the real automated pipeline. Real orchestrator testing (via Control Room's actual queue/cron path) is the final validation step, not the first one.
- **Do not just check that a fix deployed — verify the fix actually changed the observed behavior**, ideally by re-running the exact scenario that exposed the bug. Several bugs this session were "fixed" in code but the real underlying data/stage state still needed a separate, direct repair before the fix's effects were actually visible. Deploy success ≠ problem solved.
- When something looks wrong in a log Rodolfo pastes, do not assert what's "supposed to" happen from memory — pull the actual current data/queue state and check. Every real bug this session was found this way, and every false reassurance was caught this way too.
- Update this document and `LIVING_LOG.md` proactively, not in a big batch — this session's length made this necessary more than once.
