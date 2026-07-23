# ALPHADOG — HANDOFF (Incremental/Delta Postgres Migration Phase)

---

## RULE ZERO — READ THIS FIRST, ABOVE EVERYTHING ELSE. THE MOST IMPORTANT, SACRED, NON-NEGOTIABLE RULE OF THIS ENTIRE PROJECT.

**NEVER WRITE TO D1. NEVER POINT TO D1. NOT EVEN ONCE. NOT EVEN FOR SOMETHING SMALL. NOT EVEN
"JUST TEMPORARILY." NOT EVEN A SINGLE MARKER VALUE. NOT EVEN IF IT SEEMS LIKE THE EASIEST PATH.**

This is rule zero because it has been violated before — in the immediately prior session, a new
D1 table was created (`control_kv`, a single-value marker table) as a shortcut while building a
scheduling fix. It was caught by the user and corrected, but it should never have happened. Read
the full incident in `ALPHADOG_DOS_AND_DONTS.md` PART 4 ("THE SINGLE MOST IMPORTANT RULE OF THIS
ENTIRE MIGRATION, VIOLATED ONCE AND CORRECTED") before writing a single line of code.

**The only thing D1 is for**: `control_job_queue` / `control_job_runs` / `control_locks` /
`control_worker_run_log` in `CONTROL_DB` — the pre-existing operational dispatch bookkeeping that
already exists and that every worker already reports into. That is READING/WRITING to an
EXISTING, ALREADY-ESTABLISHED control-plane table, not creating something new. It is not an
exception to rule zero, it is the one narrow thing rule zero was never about in the first place.

**Before writing any `CREATE TABLE`, any `ALTER TABLE`, or any first `INSERT` anywhere in this
codebase**: stop, say out loud which binding is being used (D1 or Postgres/Hyperdrive), and if
it's D1 and the table/data is new, STOP — do not proceed. Look for the Postgres equivalent
pattern first. One almost always already exists somewhere in this codebase, built by an earlier
session — the scheduling fix above is a perfect example: a Postgres-based pattern
(`config.scheduled_jobs` + the orchestrator's existing `pgSchedule()` Hyperdrive helper) was
ALREADY sitting there, used by five other scheduled jobs, and simply hadn't been noticed before
reaching for D1 instead.

**Only point at D1. Only read from it as reference if genuinely unavoidable. Only rewire. Only
write to the new (Postgres) database.** This is not a preference — it is the single sacred rule
this entire migration exists to enforce.

---

## RULE TWO — DO NOT BABYSIT LONG-RUNNING TRIGGERS. TRIGGER, REPORT, LET IT RUN.

If a full run, a backfill, or any chain of work is triggered that's genuinely going to take a
long time (multiple minutes to complete, spanning many real external API calls or many stages),
**do not sit there polling/checking on it turn by turn, burning the user's patience and this
session's budget.** Trigger it, confirm briefly that it's genuinely running (one real check, not
a loop of checks), report that, and then stand by — let the user say "check on it" when they want
an update, rather than proactively re-checking every few seconds.

**The corollary, stated plainly**: because nothing should be silently babysat, the daily/delta
layers must NOT be designed so that a later layer silently backfills or waits on an earlier
layer's slow completion within the same triggered run. Each layer (board, daily context, market)
should be its own genuinely independent full-run chain — trigger one, let it finish (self-gating,
self-continuing, checked back on only when asked), then trigger the next, rather than one giant
chain where a slow early stage silently delays or blocks everything after it for an unbounded
amount of time. If something IS going to take a long time, that's fine — trigger it and walk
away, don't try to make it artificially fast by cutting corners, and don't sit there watching it.

---

## ROADMAP FOR THE NEXT SESSION(S) — READ BEFORE STARTING ANY NEW WORK

The next chat's real, prioritized order of work, as told directly by the user:

1. **Board full-run** — first priority. Multiple stages: different boards (PrizePicks, Sleeper,
   Underdog — see `market.prizepicks_board_current` / `sleeper_board_current` /
   `underdog_board_current`, only PrizePicks currently has real data), plus `score-prep.js`.
   This is the entry point of the real daily scoring chain and should be built/verified as its
   own complete, independent full-run chain before moving to daily context.
2. **Daily context** — second priority. Described as having "many, many minor workers" (the
   `daily.*` layer: team schedule spot, bullpen availability, player availability, weather,
   probable pitchers, lineups, umpire context — see Section 3's honest gap list, several of these
   tables are still completely empty) plus its own certifier and its own full-run chain.
3. **Market** — third priority. Three or four layers (`market-normalizer.js`,
   `market-line-shape-classifier.js`, odds ingestion, `market.historical_props_2025` handling)
   plus its own certifier.
4. **Scoring** — explicitly deferred. This will come in a FUTURE session, not necessarily the
   very next one after this handoff — do not start on it unless told to.

Each of these three near-term layers (board, daily context, market) is its own real, independent
full-run chain with its own certifier — build and verify each one completely (per Rule Two above:
trigger, let it run, verify with real data, don't babysit) before starting the next.

---

This handoff is for the NEXT chat session. Read this fully, then read `ALPHADOG_DOS_AND_DONTS.md`
fully, before touching any code. Both files are exhaustive by explicit instruction — nothing was
skipped or summarized away. If anything in this document seems incomplete, STOP and say so rather
than guessing or filling gaps with assumptions.

---

## 0. WHO RODOLFO IS AND HOW TO WORK WITH HIM — READ THIS FIRST, NON-NEGOTIABLE

Rodolfo is the system owner and sole operator, working exclusively from iPhone Safari with no
terminal access. Every file edit, SQL operation, and deploy happens through the Alphadog Bridge
MCP connector. His rules below are explicit, repeated instructions from this session and must be
followed exactly, without exception:

1. **Be assertive and brief.** Do not send long explanations. He will not read big blocks of
   text. Short, direct, to the point. Save conversational length for when it's truly needed.
2. **No guessing, no assumptions, ever.** If something needs a decision, a logic improvement, or
   any fact you're not certain of, either (a) ask him directly with a short, specific question, or
   (b) do real, deep online research from reliable sources before proceeding. Never fabricate,
   never assume, never present a hypothesis as a confirmed fact.
3. **D1 is completely off limits. We only wire the new (Postgres) database.** Not "off limits
   until wired" — there is no waiting-period exception. Do not test, run, or touch anything
   against D1, at any stage. If a worker or table isn't ready on Postgres, leave it alone until it
   is. The single narrow exception: calculated/derived layers (classification, baseline,
   expansion) may use D1 read-only, for comparison only, to verify new logic is correct — never as
   a save target. See Section 4 for the full rule and Section 5 for the calculated-layer
   exception.
4. **Own your mistakes plainly.** If something breaks or a fix doesn't work, say so honestly and
   directly, then fix it — don't over-apologize, don't spiral, and don't claim something is fixed
   until it's actually verified against real data.
5. **For any big full run or full repo deployment (all workers), just enqueue it and report, then
   stand by.** Do not babysit it turn-by-turn burning his patience — enqueue, briefly confirm it's
   running, and wait for him to say "check on it" or "it's done."
6. **He triggers big runs himself** from Control Room when he wants to (e.g. STATIC > Full Run).
   Don't enqueue large runs unprompted unless he's asked you to specifically.
7. **Everything must be logged to a log file continuously**, because chats can freeze or lose
   history and he does not want to lose work. See Section 6 below for the exact requirement.
8. **If you find yourself reframing/reinterpreting a request to make it easier or safer to
   proceed with, stop — that reframing impulse is itself a signal you should ask him directly
   instead of assuming.**

---

## 1. WHAT THIS SYSTEM IS

AlphaDog v2 is an MLB player-prop hit-probability scoring and calibration system. It scores
player props daily, maintains permanent historical data for a future GBDT calibration/training
system, and serves a live SPA UI (`alphadog-v2-certification-center.js`). The whole system runs
on Cloudflare Workers, with data storage split across two backends:

- **Cloudflare D1** (SQLite) — the ORIGINAL backend. 11 D1 databases: `CONTROL_DB`, `CONFIG_DB`,
  `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`, `TEAM_DB`, `DAILY_DB`, `MARKET_DB`,
  `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`. Plus a separate, mostly-dead `SCORING_DB` D1 binding
  whose relationship to the live `SCORE_DB` was never fully resolved — flagged as an open item,
  do not assume it's dead without checking references directly.
- **Postgres (DigitalOcean, via Cloudflare Hyperdrive)** — the TARGET backend. The migration
  mandate is: every live code path moves to Postgres, D1 remains only for genuinely dead/
  unreferenced code, no exceptions, no partial states left untracked.

`CONTROL_DB` (D1) remains the control-plane database throughout — `control_job_queue`,
`control_job_runs`, orchestrator dispatch/locking — this is NOT part of the data migration and
stays on D1 regardless of how far the data migration progresses.

---

## 2. WHAT'S DONE — THE STATIC LAYER (fully migrated, verified, this session)

All 8 stages of the `static-full-run` chain are confirmed 100% wired to Postgres, verified via
direct code inspection (zero D1 read/write calls remaining for seed data in any of these files)
and via a full, clean end-to-end chain run that passed certification:

| Stage | Job Key | Worker File | Postgres Tables |
|---|---|---|---|
| 1 | `static-teams` | `alphadog-v2-static-teams.js` | `ref.teams`, `ref.team_aliases` |
| 2 | `static-stadiums` | `alphadog-v2-static-stadiums.js` | `ref.stadiums`, `ref.stadium_aliases` |
| 3 | `static-park-factors` | `alphadog-v2-static-park-factors.js` | `ref.park_factors` |
| 4 | `static-players` | `alphadog-v2-static-players.js` | `ref.players`, `ref.player_aliases`, `ref.rosters` (+ staging tables, see below) |
| 5 | `static-prop-taxonomy` | `alphadog-v2-static-prop-taxonomy.js` | `config.prop_taxonomy`, `ref.prop_aliases` |
| 6 | `static-pitcher-arsenal` | `alphadog-v2-static-player-aliases.js` (mislabeled filename, real name is arsenal) | `ref.pitcher_arsenal` |
| 7 | `static-defensive-quality` | `alphadog-v2-delta-bullpen-update.js` (mislabeled filename) | `ref.defensive_quality` |
| 8 | `static-certifier` | `alphadog-v2-static-certifier.js` | reads all of the above, read-only |

Real, verified counts as of this session's last full run: 30 teams, 177 team aliases, 30
stadiums, 270 stadium aliases, 30 park factors, 22 prop taxonomy rows, 52 prop aliases, 551
pitcher arsenal rows, 257 defensive quality rows, 1,349 players, 6,621 player aliases, 1,349
roster rows.

**Static-players is the ONLY static worker with a stage→certify→promote→clean lifecycle** (its
own staging tables: `ref.players_stage`, `ref.player_aliases_stage`, `ref.rosters_stage`, plus
`config.static_players_batches` for batch tracking). This is because it needs multi-tick chunking
(6 teams per invocation) and a real certification gate before committing to the main tables. All
other static workers write directly to their main tables with a differential check, no staging.

**Freshness gates (20-hour window)** exist on `static-players`, `static-pitcher-arsenal`, and
`static-defensive-quality` (all three have no cheap "what changed" API signal). `static-teams`,
`static-stadiums`, `static-park-factors`, `static-prop-taxonomy` have no freshness gate — they
always do a real fetch+differential every run (their external sources are cheap/fast enough that
this isn't a real cost).

Every worker uses: `postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false,
prepare: false })` for its Postgres connection. `prepare: false` is required — see
DOS_AND_DONTS.md for why.

The orchestrator's `static-full-run` chain, driven by `alphadog-v2-orchestrator.js`, dispatches
all 8 stages in sequence via `control_job_queue`/`control_job_runs` (still D1). A real
orchestrator priority-starvation bug (parent job always winning over its own children due to
`run_after=CURRENT_TIMESTAMP` re-queuing) was found and fixed for `static-full-run` specifically
(now uses `run_after=datetime('now','+75 seconds')`). **This same bug pattern likely exists in
other full-run chain types** (`board-full-run`, `daily-full-run`, `incremental-morning-full-run`)
— confirmed present via grep, NOT yet fixed, out of scope until told otherwise.

**Weekly Monday 2am schedule — already built and confirmed live, nothing further needed.**
Scheduling in this system is DB-driven, never a cron file: a lightweight cron tick (already
existing, "wakes" the orchestrator every minute) causes the orchestrator to check
`CONFIG_DB.config_scheduled_jobs` for anything due, and enqueue it into `control_job_queue` if
so. Real, Pacific-timezone-aware, DST-safe weekly dispatch logic for `static-full-run` already
exists in `alphadog-v2-orchestrator.js` (~line 16478 onward): queries `config_scheduled_jobs
WHERE enabled=1 AND job_key='static-full-run' AND schedule_type='weekly' AND
timezone='America/Los_Angeles'`, matches against the real Pacific weekday via `Intl`, and inserts
into `control_job_queue`. The row itself (`schedule_id: static_full_run_weekly_monday_2am_pt`,
`day_of_week: 'Mon'`, `local_time: '02:00'`, `enabled: 1`) is present and enabled in
`CONFIG_DB.config_scheduled_jobs`, confirmed directly. If a NEW scheduled job is ever needed for
an incremental worker later, follow this exact same DB-driven pattern — add a row to
`config_scheduled_jobs`, do not add or rely on a cron-file trigger.

**UPDATE — scheduled jobs are now on Postgres too, D1 fully removed for this concern.** The
paragraph above describes the pattern; the underlying storage has since moved. All 9 real
schedule rows were migrated from `CONFIG_DB.config_scheduled_jobs` (D1) to `config.scheduled_jobs`
(Postgres) with identical data. All 6 places in `alphadog-v2-orchestrator.js` that read schedules
(`incremental-morning-full-run`, `daily-full-run`, `board-full-run`, `scoring-full-run`,
`context-history-full-run`, `static-full-run` weekly) now query Postgres via Hyperdrive
(`prepare: false`, same as every other Postgres worker). The old D1-touching schema-ensure
function (`ensureConfigScheduledJobsTable`) has zero callers left and was neutered to a real
no-op rather than deleted. Deployed and confirmed clean across real cron cycles. `CONFIG_DB` in
D1 still exists and still holds the old, now-unused `config_scheduled_jobs` table — that table is
dead, do not read from or write to it going forward.

---

## 2B. WHAT'S DONE — THE DAILY DELTA/INCREMENTAL + CALCULATED LAYER (this session, 2026-07-22/23)

**Status summary, in the two tiers Rodolfo asked to have called out explicitly:**

- **Weekly static differential (`static-full-run`)**: prior sessions' work, described fully in
  Section 2 above. **Already done, tested, checked, and working.** Nothing new needed here; this
  status is unchanged by today's session.
- **Morning delta full run (the daily game-log → metrics → classification → baseline →
  certifier chain)**: **built and verified end-to-end TODAY, working on real data, but this is
  new work from a single session and needs deeper checking over the next several real days
  before being treated as fully bulletproof** — see the honest gaps list at the end of this
  section.

### The complete 13-stage daily chain, all Postgres, zero D1, all confirmed via direct code inspection

| # | Job Key | Worker File | Postgres Tables |
|---|---|---|---|
| 1 | `base-game-calendar` | `alphadog-v2-base-game-calendar.js` | `calendar.game_calendar` |
| 2 | `base-hitter-game-logs` | `alphadog-v2-base-hitter-game-logs.js` | `stats_hitter.game_logs` |
| 3 | `base-pitcher-game-logs` | `alphadog-v2-base-pitcher-game-logs.js` | `stats_pitcher.game_logs` |
| 4 | `base-team-game-logs` | `alphadog-v2-base-team-game-logs.js` | `team.game_logs` |
| 5 | `base-starter-history` | `alphadog-v2-base-starter-history.js` | `team.starter_history` |
| 6 | `base-bullpen-history` | `alphadog-v2-base-bullpen-history.js` | `team.bullpen_history` |
| 7 | `base-hitter-splits` | `alphadog-v2-base-hitter-splits.js` | `stats_hitter.splits` |
| 8 | `base-pitcher-splits` | `alphadog-v2-base-pitcher-splits.js` | `stats_pitcher.splits` |
| 9 | `base-hitter-metrics` | `alphadog-v2-base-hitter-metrics.js` | `stats_hitter.metric_snapshots` (+ permanent `metric_stage`) |
| 10 | `base-pitcher-metrics` | `alphadog-v2-base-pitcher-metrics.js` | `stats_pitcher.metric_snapshots` (+ permanent `metric_stage`) |
| 11 | `base-classification-v5` | `alphadog-v2-base-classification-v5.js` | `classification.player_classification_current` |
| 12 | `base-baseline` | `alphadog-v2-base-baseline.js` | `classification.baseline_current` |
| 13 | `base-certifier-postgres` | `alphadog-v2-base-certifier-postgres.js` | `certifier.date_coverage` (read-only report) |

Stages 2-8 (the raw source-mining layer) were mostly BUILT in prior sessions (see the journal
transcripts) but had never been included in an actual end-to-end scheduled chain until today.
Stages 9-13 (metrics/classification/baseline/certifier) were newly built and verified today.

### Architecture: self-gating stages + a strict one-at-a-time stepper (not the old D1 gap-dispatch pattern)

Every stage independently checks its own readiness (its own watermark, plus real
`calendar.game_calendar` completeness for the target date) before advancing — no external
"gap list" is computed and handed to it. This is the validated, modern self-healing incremental
pattern (see DOS_AND_DONTS.md PART 4 for the research and reasoning). A dedicated stepper
(`runPostgresFullRunEnqueue` / `POSTGRES_FULL_RUN_STAGES`, both in `alphadog-v2-orchestrator.js`)
enqueues stages strictly one at a time — never more than one stage in flight at once — waiting
for the current stage to reach a terminal state before advancing, and halting visibly (not
silently retrying) if a stage genuinely fails.

### Real bugs found and fixed today (full detail in DOS_AND_DONTS.md PART 4)
1. Hardcoded row/chunk-size ceilings in hitter/pitcher-game-logs silently overriding live
   database speed config (`config.worker_tick_settings`) — fixed in both workers.
2. A stale-value-wins-over-live-config precedence bug in the same two workers' fallback chains —
   fixed by putting the live config source first.
3. Same class of bug in Classification/Baseline (`COMBOS_PER_TICK` hardcoded, ignoring real
   config) — fixed, and Baseline's missing `config.worker_tick_settings` row was added.
4. A real LEFT JOIN fan-out bug in `base-bullpen-history.js` causing
   `ON CONFLICT DO UPDATE command cannot affect row a second time` — fixed via `DISTINCT ON`
   dedup on the join's right-hand side.

### Formula/version correctness verified two ways, not just one
Checked both that `formula_version` is uniform across every classification/baseline/metrics row
and matches the currently deployed code, AND hand-recomputed real rows' stored values from raw
inputs using the current formulas by hand, confirming they match. See DOS_AND_DONTS.md PART 4 for
the exact numbers.

### Stale-data sweep completed across all 20 Postgres schemas (not just the daily-chain ones)
Full detail in DOS_AND_DONTS.md PART 4. Real, old-dev-iteration duplicate data found and cleaned
in `team.starter_history`, `team.bullpen_history`, `team.game_logs`, `team.game_logs_stage`, and
`context.first_inning_game`/`first_inning_pitcher` — with explicit care taken to preserve real,
irreplaceable uncovered data rather than deleting for tidiness. A large (~293,000 row) orphaned
"V6" classification/baseline system was found (written by `alphadog-v2-phase3a-first-inning-
pitcher-context.js` under job_key `expansion-baseline-v2`) — **explicit user decision: leave this
alone, it is isolated and not interfering with the real pipeline.**

### 6:00 AM Pacific daily scheduling implemented
`config.scheduled_jobs` (Postgres) has a real, enabled row (`postgres_full_run_0600_pt`,
`local_time='06:00'`, `schedule_type='daily'`, `timezone='America/Los_Angeles'`).
`enqueuePostgresFullRunIfDue()` in the orchestrator follows the exact same established pattern as
its five siblings — reads this Postgres row via the orchestrator's existing `pgSchedule()`
Hyperdrive connection, checks a 5-minute due-window, and dedupes via a deterministic request_id
inserted into the existing `control_job_queue` (not a new table). **A real, direct D1 mistake was
made and corrected while building this — see DOS_AND_DONTS.md PART 4's "single most important
rule" section, read it before touching scheduling code again.**

### Honest, explicit gaps — read before assuming this is fully bulletproof
- **The 6:00 AM Pacific trigger has NOT yet been observed firing for real at 6:00 AM** — the
  SQL/logic is confirmed correct by direct inspection and by exactly matching an already-proven
  pattern, but a live, real-time firing has not been watched end-to-end. Check this the next time
  a session is active anywhere near 6:00 AM Pacific.
- **Only two real days (July 21 fully, July 22 partially in-progress) have been observed flowing
  through this chain.** The certifier confirms July 21 as `FULL_CHAIN_CERTIFIED_COMPLETE`, which
  is real and meaningful, but a single day's clean run is not the same as multi-day, multi-week
  reliability. Watch for: doubleheader edge cases, postponed/rescheduled games, DST transitions
  (none occur again until November 2026), and the delta lookback/repair window behaving correctly
  across a longer real span.
- **The `daily.*_current` tables** (`team_schedule_spot_current`, `bullpen_availability_current`,
  `player_availability_current`, `game_weather_current`) are still completely empty — these are
  NOT part of the 13-stage chain above and were not built/wired this session. If the eventual
  scoring layer needs these, they still need real work.
- **The `score.*` layer** (final board, hp board, prop matrix) is still entirely empty — building
  the actual scoring/board-generation layer that CONSUMES `classification.baseline_current` has
  not been started.

---

**Nothing below this line has been touched yet this migration. All of it is still on D1 as far as
is known — VERIFY DIRECTLY, do not assume.**

- **Daily/incremental data layers**: hitter/pitcher/team game logs, hitter/pitcher metrics,
  hitter/pitcher splits, starter history, bullpen history, player availability, weather context,
  umpire context/tendency, team schedule spot. These are the "delta" workers — daily updates to
  data that changes game-by-game.
- **Calculated/derived layers**: expansion mining, classification (V5/V6), baseline (V5/V6),
  factor correlation/redundancy handling. See Section 5 below for special rules on these.
- **Market layer**: `market-normalizer.js`, `market-line-shape-classifier.js`, odds ingestion via
  The Odds API.
- **Scoring chain**: `score-prep.js` (board prep, entry point of the daily chain),
  `phase2b-recent-form.js` (prop factor miner), `phase2b-certifier.js` (matrix builder),
  `score-audit.js` (scoring engine, enrichment, hit probability, final board — the most
  heavily-modified file historically).
- **Control-plane**: `orchestrator.js` (1.4MB file, job dispatch/control-plane,
  `control_job_queue`/`control_locks`). This stays on D1 per Section 1 (control plane is not part
  of the data migration) but may still need the starvation-bug fix extended to other chain types
  (see Section 2).
- **Main UI worker**: `alphadog-v2-certification-center.js` reads from D1 currently for
  production board data (`score_final_board_current`, etc.) — this is a live production surface,
  treat with extra care.
- **`SCORING_DB`**: a second, separate D1 binding (distinct from `SCORE_DB`) holding
  `prop_factor_*`, `prop_matrix_*`, `enrichment_leg_current`, `scoring_full_run_tally_current`
  tables — not wired into any known worker config as of last check. Investigate whether it's
  live, dead, or a partial migration target BEFORE assuming either way.
- **`score-audit.js`'s correlation-aware enrichment wiring**: a real, grounded correlation-
  dampening formula (`k_effective = m / (1 + (m-1) × ρ_avg)`, based on convergent literature from
  forecast combination theory, actuarial risk aggregation, and opinion pooling) was built and
  deployed for the `daily_game_context` factor layer (`hitterDailyContextScore`) but the same
  audit/fix was never done for `factor_packet_context` (`hitterPacketScore`) or `market_context`
  (`marketLayerFromPayload`) layers, nor for the pitcher-side equivalent. This is real, unfinished
  work, not something to redo from scratch — check what's already there before rebuilding.

---

## 3. WHAT'S NOT DONE — EVERYTHING ELSE

**Section 2B above covers what WAS completed this session (the full 13-stage daily delta chain
plus classification/baseline). Everything below this line is still genuinely not done — verify
directly, do not assume, the same discipline applied throughout this migration.**

- **Daily context factor tables**: `daily.team_schedule_spot_current`,
  `daily.bullpen_availability_current`, `daily.player_availability_current`,
  `daily.game_weather_current` all exist as real Postgres tables (schema present) but are
  completely EMPTY — zero rows. These are NOT part of the 13-stage chain built this session and
  have not been wired to any real daily-refresh worker on Postgres yet. `daily.lineups_current`
  (303 rows), `daily.probable_pitchers` (46 rows), and `daily.umpire_context_current` (15 rows)
  DO have real data already — investigate what's populating those before assuming the whole
  `daily` schema is unbuilt.
- **Market layer**: `market-normalizer.js`, `market-line-shape-classifier.js`, odds ingestion via
  The Odds API. `market.historical_props_2025` (196,025 rows, verified clean/no duplicates) and
  `market.prizepicks_board_current` (6,780 rows) already have real data on Postgres from prior
  work — verify what wrote them before assuming this layer needs to start from zero.
- **Scoring chain**: `score-prep.js` (board prep, entry point of the daily chain),
  `phase2b-recent-form.js` (prop factor miner), `phase2b-certifier.js` (matrix builder),
  `score-audit.js` (scoring engine, enrichment, hit probability, final board). The Postgres
  `score.*` schema exists (final_board_current, hp_board_current, prop_matrix_current, etc.) but
  is entirely EMPTY — this whole layer, which CONSUMES the now-real
  `classification.baseline_current` output, has not been started.
- **Control-plane**: `orchestrator.js` (now 1.43MB+), job dispatch/control-plane,
  `control_job_queue`/`control_locks`. Stays on D1 per Section 1/4 (control plane is not part of
  the data migration). The starvation-bug fix from Section 2 (`static-full-run`) has NOT yet been
  extended to the newer `postgres-full-run-enqueue` stepper chain from Section 2B, or to
  `board-full-run`/`daily-full-run`/`incremental-morning-full-run` — check whether it's actually
  needed there before assuming it is or isn't.
- **Main UI worker**: `alphadog-v2-certification-center.js` reads from D1 currently for
  production board data — a live production surface, treat with extra care. Since the
  `score.*` layer above is still empty, this worker has nothing real to read from Postgres yet
  even if it were switched over.
- **`SCORING_DB`**: still unresolved — a second, separate D1 binding (distinct from `SCORE_DB`).
  Not investigated this session either. Investigate whether it's live, dead, or a partial
  migration target before assuming either way.
- **`score-audit.js`'s correlation-aware enrichment wiring**: unchanged from prior sessions, real
  partially-done work described in earlier handoffs — not touched this session.
- **The orphaned "V6" classification/baseline system** (Section 2B) — explicit user decision to
  leave it alone. Do not re-open this without the user raising it again.

---

## 4. HARD RULE — D1 IS COMPLETELY OFF LIMITS. WE ONLY WIRE THE NEW DATABASE.

This is explicit and non-negotiable, stated directly by Rodolfo, and restated even more plainly
after an earlier draft of this document phrased it too conditionally:

- **D1 is off limits, full stop.** Not "off limits until wired" as if there's a waiting period
  where D1 use is acceptable — D1 is simply not touched. We only wire workers to the new
  (Postgres) database. There is no intermediate state where D1 is an acceptable stand-in, a
  fallback, or a thing to "just check" while Postgres code is incomplete.
- **Do not test, run, or touch any worker against D1 as part of this migration work**, for any
  reason, at any stage of a worker's migration — not before it's converted, not while it's
  partially converted, not to "verify current behavior" as a baseline. If a worker isn't ready to
  run on Postgres, it doesn't run. Leave it alone until the Postgres path is real and complete,
  then run it on Postgres only.
- **The one narrow, explicit exception**: calculated/derived layers (classification, baseline,
  expansion — the layers the system computes internally from other data) may use D1 as a
  READ-ONLY reference for comparison, solely to verify that the new Postgres-based calculation
  logic produces the correct result. D1 is never a save target here either — see Section 5 for
  exactly how this narrow exception works. Outside of this one comparison use, D1 is unwired,
  untouched, off limits.
- If you're unsure whether something is "ready" to move to Postgres, grep the file directly for
  any D1 binding usage (`.prepare(`, `.batch(`, D1 binding names like `REF_DB.`,
  `STATS_HITTER_DB.`, etc.) the same way it was verified for the static layer this session. Don't
  rely on a version string or a comment claiming it's done — verify the actual code, and don't run
  anything against D1 in the meantime.
- We accept that new Postgres code may have real, undiscovered bugs (as the static layer did,
  extensively) — that's fine and expected. What's not acceptable is reaching for D1, in any form,
  as a way to sidestep or work around that.

---

## 5. SPECIAL RULE — CALCULATED LAYERS (CLASSIFICATION, BASELINE, EXPANSION)

When you reach the calculated/derived layers (expansion mining, classification V5/V6, baseline
V5/V6), the rule is different from the raw data layers:

- **D1 is used ONLY as a read-only reference for comparison** — to verify the LOGIC being ported
  to Postgres is correct, i.e., "is the base being computed the way it's supposed to be
  computed." D1 is never a save target for these layers going forward.
- Concretely: when porting a calculated layer's formula/logic to Postgres, compute the same
  metric against real data in both D1 (old, known-correct) and the new Postgres implementation,
  and confirm they match (or that any difference is explained and correct, e.g. a genuine bug fix
  being carried forward). This is a correctness check, not a data source.
- Once the logic is confirmed correct, all real computation and all real writes for these layers
  happen against Postgres only, exactly like every other layer.

---

## 6. HARD RULE — NO DUPLICATED STAGING TABLES FOR DELTA/INCREMENTAL WORKERS

Explicit, direct instruction from Rodolfo:

- **Many existing delta/incremental layers currently maintain both a full main table AND a full
  separate staging/temporary table for rows to be promoted.** This is wasteful — it roughly
  doubles storage for data that's mostly a temporary holding pattern, and the new Postgres
  database has real storage budget constraints that D1 didn't have in the same way.
- **Going forward: the main table holds everything. Only the genuinely temporary, in-flight delta
  (the small set of rows currently being processed/promoted) goes in a staging table.** Do not
  build a new incremental worker with a full-copy staging table pattern. If an existing delta
  worker already has this full-duplicate pattern, the logic needs to be adjusted to eliminate it
  as part of migrating that worker — this is real, necessary rework, not optional cleanup.
- **`static-players` is the one exception that legitimately needs a staging lifecycle** (see
  Section 2) because of its multi-tick, multi-team chunking and certification-gate design. Don't
  read this as "staging tables are always wrong" — read it as "don't duplicate the WHOLE main
  table's worth of data in staging when only a small delta actually needs to be staged."

---

## 7. HARD RULE — DELTA WORKERS MOSTLY WORK ALREADY, DON'T REBUILD THEM

- **The existing delta/incremental worker LOGIC (on D1) mostly already works correctly.** This is
  not a "start from scratch and redesign" migration for these layers. It's a "port the same
  working logic to Postgres, with sharp, targeted adjustments" migration.
- Make small, precise, surgical changes: swap D1 query syntax for Postgres tagged-template syntax,
  add the differential/freshness patterns from Part 1 of DOS_AND_DONTS.md where they're missing,
  eliminate duplicated staging tables per Section 6 — but do NOT restructure working business
  logic, do NOT redesign data flows that already function, do NOT introduce large architectural
  changes "while you're in there." If something looks like it could be improved architecturally
  beyond the scope of the Postgres port, flag it as a question (see Section 9) rather than just
  doing it.
- The goal is: same real, correct behavior the D1 version already has, now running on Postgres,
  with the specific efficiency/differential/staging improvements explicitly called for in this
  document — nothing more, nothing less.

---

## 8. HARD RULE — CONTINUOUS LOGGING TO A LOG FILE

Explicit requirement: **the new chat must log its work continuously to a log file** (e.g. via the
computer/bash tool, a persistent file like `LIVING_LOG.md` or similar, updated as work happens —
not just written once at the end). This is because chat sessions can freeze or lose conversation
history, and Rodolfo does not want to lose track of work already done. When a chat is resumed
after a freeze or a new message, the log file should reflect the last real, true state of work —
what was attempted, what succeeded, what failed, what's in progress — so no context or progress
is lost even if the conversation itself is.

Note: an earlier attempt at this (`LIVING_LOG.md`, referenced throughout an old
`HANDOFF_MASTER_SUMMARY.md`) was found to not actually exist in the repo (404 on fetch) — either
never committed or removed. The new chat should actually create and maintain this file for real,
not just reference it.

---

## 9. OPEN QUESTIONS — RODOLFO, PLEASE ANSWER THESE AND BRING BACK TO THE NEW CHAT

1. **Which incremental/delta layer should be migrated first?** (e.g. hitter/pitcher game logs,
   metrics, splits, starter/bullpen history, player availability, weather, umpire context, team
   schedule spot — there are several independent daily layers; is there a priority order, or
   should the new chat propose one based on dependency order and confirm with you first?)
2. **`SCORING_DB` investigation** — do you know offhand whether this second D1 database
   (distinct from `SCORE_DB`) is live, dead, or a partial migration attempt? If not, the new chat
   will investigate via direct reference-checking before assuming either way — just flagging that
   this is still open.
3. **Scope of the correlation-aware enrichment wiring** (`factor_packet_context`,
   `market_context`, pitcher-side equivalent — see Section 3) — is finishing this real, partially
   done wiring part of the incremental migration scope, or a separate future task?
4. Any other explicit priority order or constraints you have in mind that aren't captured above —
   please state them directly so the new chat doesn't have to guess.

If you have old chat transcripts (especially this one) that would help answer any of the above or
fill in gaps, the new chat should ask you to share them rather than guessing.

---

## 10. QUICK-REFERENCE: KEY FACTS FOR THE NEW CHAT

- Alphadog Bridge MCP connector is the only interface — `github_get_file`, `github_patch_file`,
  `github_grep_file`, `github_put_file`, `run_sql` (explicit DB param + `allow_write: true` for
  mutations), `run_job` (dispatch via `orchestrator_tick` + `CONTROL_ROOM`, always verify via a
  follow-up SQL status check — never trust the `run_job` response alone).
- Postgres databases/schemas confirmed working: `ref.*` (teams, team_aliases, stadiums,
  stadium_aliases, park_factors, players, player_aliases, rosters, pitcher_arsenal,
  defensive_quality, plus staging variants), `config.*` (prop_taxonomy, static_players_batches).
- D1 databases: `CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`,
  `TEAM_DB`, `DAILY_DB`, `MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`, plus the
  unresolved `SCORING_DB`.
- `score-audit.js` and `score-prep.js` are the live, real scoring/board-prep engines on D1 —
  do not confuse with dormant scaffolding (`alphadog-v2-postgres-migration.js` is a dormant,
  incomplete manual ETL tool covering only 8 archive/config tables — not the real migration
  path, don't resurrect it as-is).
- `alphadog-v2-certification-center.js` is the live production main UI worker — reads D1
  currently, treat as a sensitive, live production surface when its turn comes.
- **Scheduling is always DB-driven, never a cron file.** A cron tick (already existing) "wakes"
  the orchestrator every minute; the orchestrator checks `CONFIG_DB.config_scheduled_jobs` for
  anything due and enqueues it into `control_job_queue`. If any incremental/delta worker ever
  needs a new recurring schedule, add a row to `config_scheduled_jobs` following the existing
  pattern (see the `static-full-run` weekly row for a working weekly example, or the
  `incremental-morning-full-run`/`daily-full-run` rows for working daily examples) — never add or
  rely on a wrangler cron trigger for this.
