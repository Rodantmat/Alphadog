# ALPHADOG HANDOFF — MASTER SUMMARY (read this first, then LIVING_LOG.md for full history)
Written 2026-07-10, end of session. If you are a new Claude instance picking this up: read this whole document before touching anything.

## WHO / WHAT
Rodolfo owns AlphaDog, an MLB player-prop hit-probability system on Cloudflare Workers + D1. Repo: `Rodantmat/Alphadog` (branch `main`), auto-deploys on push via GitHub Actions. He works from iPhone Safari only, no terminal — you interact entirely through the "Alphadog Bridge" MCP connector (run_sql, run_job, github_get_file, github_put_file, github_patch_file, github_grep_file, github_list_dir, github_list_workflow_runs, check_bindings).

**His standards, stated repeatedly, don't drift from these:** no guessing, no "probably," verify everything against real data before claiming it works, real-world cross-checks against actual MLB numbers, fix root causes not symptoms, be direct/concise, tell him about problems immediately rather than smoothing over them.

## WHAT WAS BUILT THIS SESSION (classification_v6 + baseline_v6 — the new "Final Scoring System" core)
Old system ("Frankenstein", V5/V2) is being replaced. New system lives entirely in `alphadog-v2-phase3a-first-inning-pitcher-context.js` (yes, that's the actual deployed filename — it's a repurposed slot, ignore the name). New tables live in `ARCHIVE_DB` (a near-empty D1 database repurposed for this — NOT touching the old, nearly-full `SCORE_DB`).

### Tables (ARCHIVE_DB):
- `classification_v6_current` / `_history` / `_batches` / `_population_stats`
- `baseline_v6_current` / `_history` / `_batches`

### Config (CONFIG_DB.calibration_config table — EVERY tunable number lives here, never hardcoded):
- `prop_metric_map` — maps each of 21 canonical_prop_key to season-sum fields (for rate calc) + composite weights
- `prop_game_log_map` — same props, mapped to raw per-game columns (for dispersion calc)
- `prop_line_universe` — the fixed 58 prop×line combos (×2 sides = 116 total) the system classifies/baselines
- `prop_recency_profile` — 5 profiles (A-E) of recency weights + shrinkage multiplier per prop, grounded in real MLB stabilization research (not one flat default)
- `recency_weights` — global fallback default
- `confidence_prior_strength` — sample-size buckets for confidence formula
- `tier_bands` — z-score band edges, max 12 tiers, collapses automatically for thin populations
- `tier_blend_constant` — separate small constant (k=5) for two-level tier-mean shrinkage (NOT the same as tier_bands' min_population_per_tier — these looked similar but serve different purposes, conflating them caused a real bug, now fixed)
- `run_limits` (operational scope) — chunk_size_rows, tick_timeout_ms, max_retries

### The math (why it's trustworthy, not just "looks right"):
1. **Classification**: z-score tiering off real per-player recency-weighted rates (Marcel-style blend of last_5/10/20_games + season_to_date, weights vary by prop per prop_recency_profile). Same method as wRC+/OPS+/ERA+ in real sabermetrics.
2. **Baseline HP**: player's rate → two-level shrinkage (blend toward tier mean, weighted by tier size, tier mean itself blended toward population mean for thin tiers) → probability via **Poisson or Negative Binomial** (NB used only where real per-player game-to-game variance is actually overdispersed — checked directly from game logs, not assumed) → **Normal distribution** instead, ONLY for composite props with negative weights (currently just `pitcher_fantasy_score`, which subtracts earned runs/walks — Poisson/NB can't handle a negative rate).
3. **Confidence**: computed ONLY at baseline (not classification, per locked design) — sample-size-aware, saturating curve, prior-strength scaled per prop.
4. Everything is HISTORY-ONLY right now — every row tagged `no_daily_context/no_market_context/no_scoring_context: true`. Daily context (lineup, weather, matchup, market) is explicitly a LATER phase, not blended in.

### Validated (real checks, not assumptions):
- Full base run: 74,054 rows, 116/116 combos, zero invalid values, **zero monotonicity violations** (checked correctly per side — "more" and "less" have opposite expected directions, don't get this backwards when re-checking).
- Real player identity spot-checks matched known profiles exactly (Freddie Freeman, Yordan Alvarez, Otto Lopez for contact/power; Zack Wheeler/Dylan Cease/Jesús Luzardo/Jacob Misiorowski for elite strikeouts).
- Real-world benchmark cross-checks (hits ~80% cap, HR 4-12% typical) matched after the recency-profile fix.
- Delta correctness proven directly: ran delta on the same date base used, confirmed byte-identical output for real affected players before/after.

### Full base runtime: ~44 minutes total (31 min classification + 13 min baseline) when driven directly, bypassing orchestrator's cron cadence. Only needs running once as a base; delta handles daily updates going forward.

## REAL BUGS FOUND AND FIXED THIS SESSION (all found by testing, not assumed — useful pattern to keep applying)
1. Population stats computed per-chunk instead of once — wrong tier boundaries across chunks.
2. D1 bound-parameter limit hit when chunk size raised — fixed with 90-id chunking (applies to ANY large IN-clause query, remember this pattern).
3. `games_sample` was reading an arbitrary recency window instead of season_to_date — flattened confidence artificially.
4. First dispersion estimate was conceptually wrong — measured between-player rate spread, not within-player game variance. Corrected to pool real per-game variance from game logs directly.
5. Tier-blend shrinkage over-corrected thin tiers by reusing an unrelated config constant — gave it its own constant.
6. Composite props with negative weights broke Poisson/NB (can't have negative rate) — added Normal-distribution branch, fixed surgically (6 combos, not full rebase).
7. `done` flag miscalculated when using an explicit player-id override (delta path) — checked against full population count instead of override list size.

## DELTA SYSTEM (built this session)
`runClassificationV6DeltaDaily` / `runBaselineV6DeltaDaily`, wired to modes `baseline_v5_classification_daily_delta` / `baseline_v5_hp_daily_delta` (previously pointed to the old v5 system — now point to v6).

**Design principle**: "affected players only" — players with a new game log row on the target date. Both classification and baseline delta use this SAME detection. Population-level stats (mean/stddev/dispersion) stay CACHED from the last base run — NOT refreshed daily (dispersion scan is expensive; that would defeat the point of delta). This matches an existing principle already enforced elsewhere in the codebase (an old delta mode is explicitly hard-blocked with the message "reloads cumulative history and is banned").

**Tier-change cascade (e.g. a star player dropping tiers) is already handled correctly, verified by tracing the code**: baseline delta does a full formula recompute per player (not an incremental patch), reads tier directly from the live classification table, and classification delta always runs before baseline delta in the real stage order — so a same-day tier drop is automatically reflected in that same day's baseline recompute. Not yet observed firing in a live test with an actual tier change, but the logic path is confirmed sound.

## ORCHESTRATOR / CONTROL ROOM (investigated, mostly already correct — don't rebuild what's already there)
- `INCREMENTAL_MORNING_FULL_RUN_STAGES` in `alphadog-v2-orchestrator.js` already has the correct, complete 18-stage sequence: calendar/tally precheck → source mining (game logs, team logs, histories, splits) → source repair check → expansion delta mining → metrics delta (affected players) → expansion line inventory/sanity/HP → **baseline_v5 classification daily delta → baseline_v5 HP daily delta (gated on classification)** → calendar/tally final check.
- Control Room's "DELTA > Full Run" button's `approved_chain_order`/`approved_stage_order`/`child_modes` fields are **informational only** — the real execution loop (`processIncrementalMorningFullRunJob`, orchestrator.js ~line 4898) iterates the orchestrator's own hardcoded stage array directly and ignores those input fields entirely. Don't waste time "rewiring" them thinking it's functionally necessary — it isn't. (Could still fix them later for documentation accuracy, cosmetic only.)
- Metrics delta workers (`base-hitter-metrics.js` / `base-pitcher-metrics.js`) are real, substantial, already-working implementations — not stubs, don't rebuild.

## LIVE STATE AS OF THIS LOG ENTRY
User clicked "DELTA > Full Run" for real (request_id `incremental_morning_full_run_mrfbqpmp_qouuq9`, started 2026-07-10 19:24:09). Being monitored only, not touched — first real end-to-end test of the new delta code running through actual automation. **Check its final status before doing anything else** — if it completed clean, this whole phase is locked and validated; if anything failed, that's the immediate priority.

## NOT YET DONE (real, honest list — pick up from here)
1. **RFI/NRFI** — not ported to v6, still only exists in the old expansion system (`expansion_delta_hp`/`expansion_delta_sanity`). Correctly left alone for now since it's the one prop that system uniquely covers.
2. **Redundant expansion coverage** for `runs_allowed`/`pitcher_fantasy_score` — now doubly redundant (v6 covers both base AND daily delta for these). Safe to eventually retire `expansion_delta_hp`/`expansion_delta_sanity`'s coverage of just those two props once RFI/NRFI is ported elsewhere. Not urgent, just wasted duplicate work, not a correctness issue.
3. **Confidence formula constants** (the 95 cap, 25 divisor in `sampleAwareConfidence`) are a sound heuristic, not empirically backtested — can't fix until real outcome data exists to backtest against. Flag this to the user if they ask about further precision; don't attempt without real data.
4. **Snapshot-loading efficiency** — turned out to be the bigger cost in base runs (bigger than dispersion, which was optimized). Not yet addressed. Would require either caching snapshot loads across combos within one entity, or restructuring — bigger architectural change, defer unless speed becomes a real problem again.
5. **Daily context enrichment phase** — explicitly the next major phase after this one. Not started. Locked boundary: current system is HISTORY-ONLY by design, don't blend in lineup/weather/matchup/market data into classification_v6/baseline_v6 — that's a separate future layer that reads baseline's output and adjusts it, not something that gets merged into these tables.
6. **Scheduling** — the whole delta pipeline is built and (pending today's test result) validated, but not yet scheduled to run automatically every morning. User said explicitly: "not scheduled right now, we're gonna work on that later."
7. **Control-room.js's stale display metadata** for the Delta Full Run button — cosmetically inaccurate (doesn't affect behavior, confirmed), could be cleaned up later for documentation accuracy only.

## HOW TO WORK WITH THIS PERSON (patterns that worked)
- Use `github_patch_file` (server-side find/replace) for edits to phase3a-live.js — it's 680KB+, too large to round-trip through context. `github_get_file` only works reliably under ~1MB via Contents API (falls back to Git Blobs API automatically now, but the RESPONSE size itself can still be too large for a single tool result — use `github_grep_file` to search instead of pulling the whole file when possible).
- Any edit to `generate_wrangler_configs.py` triggers a FULL ~15-minute redeploy of all 116 workers (it's in `GLOBAL_REDEPLOY_FILES`). Any other single-file edit triggers a fast (~1 min) single-worker redeploy. Don't be alarmed by the slow one, it's expected/correct behavior.
- Test everything directly via `run_job` with `target: PHASE3A_WORKER` (bypasses orchestrator's cron cadence) before trusting it in the real automated pipeline. Real orchestrator testing (enqueue into `control_job_queue` exactly as Control Room would, then let its own cron pick it up) is the final validation step, not the first one.
- Always verify claims with real SQL against real data before reporting success. This person will ask you to double check, and has caught real bugs this way — lean into that instinct, don't resist it.
- Update this log/LIVING_LOG.md proactively after meaningful changes, not in a big batch at the end — a session this long risks losing track otherwise.
