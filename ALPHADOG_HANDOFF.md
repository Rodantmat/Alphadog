# ALPHADOG — HANDOFF (Incremental/Delta Postgres Migration Phase)

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
3. **Do not test or touch anything on the old D1 database.** If a worker or table is not 100%
   wired to Postgres, do not test it, do not run it, do not "just check" it against D1. If it's
   not fully migrated, leave it alone until it is. This was explicit and is treated as a hard
   rule, not a preference.
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

---

## 3. WHAT'S NOT DONE — EVERYTHING ELSE (this is the incremental/delta phase's job)

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
