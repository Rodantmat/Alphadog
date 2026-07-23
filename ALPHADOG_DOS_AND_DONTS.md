# ALPHADOG — DOS AND DON'TS (Postgres Migration, D1→Postgres Cutover)

This file is built from the FULL history of the Postgres migration effort across all prior
sessions (three compacted transcripts covering: initial migration discovery + performance
research + factor-correlation work; static-teams cutover + orchestrator investigation; the full
static-full-run 8-worker Postgres cutover with differential testing) plus the current session's
complete static-layer cutover. Every item below is a REAL thing that happened — a real fix that
worked, or a real mistake that cost real time. Nothing here is guessed or generic advice.

Read this BEFORE touching any incremental/delta worker. Read HANDOFF.md alongside this for full
architecture context.

---

## PART 1 — DOS (things that were tried and genuinely worked)

### Postgres connection setup (Cloudflare Workers + Hyperdrive)
- **`postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false })`
  is the correct, proven connection pattern.** All three options matter:
  - `max: 3` — small pool, appropriate for Workers' short-lived invocation model.
  - `fetch_types: false` — avoids an extra round-trip for type OID lookups.
  - **`prepare: false` is CRITICAL and was the single highest-value discovery of this entire
    migration.** Without it, `postgres.js`'s default prepared-statement mode SILENTLY MASKS real
    PostgreSQL errors (missing columns, type mismatches, constraint violations) and reports them
    instead as a generic, misleading `"Network connection lost"` error. This masked error sent an
    entire session down multiple false paths (blaming bulk-insert syntax, connection duration,
    data volume) before the real fix was found. Set `prepare: false` on every single Postgres
    connection in every worker, from the start, no exceptions.
- Wrangler config needs: a `hyperdrive` binding block (see any working worker's config, e.g.
  `alphadog-v2-static-teams`) AND `"compatibility_flags": ["nodejs_compat"]`. Both are required
  for the `postgres` npm package's TCP sockets to work inside a Cloudflare Worker.
- **The Hyperdrive binding must be added to `generate_wrangler_configs.py`'s special-case list**
  (`make_config()` function), NOT hand-edited into the `.jsonc` file directly. Every deploy runs
  `generate_wrangler_configs.py` first and it OVERWRITES all `wrangler.*.jsonc` files from its
  own template — any manual edit to the `.jsonc` file itself is silently wiped before Wrangler
  even runs. This cost significant time before being understood.
- The Hyperdrive id used throughout: `f6c6e778ebfe4dfa8e17d7effbeaff8b`,
  `origin_connection_limit: 15`.

### Differential / "real work only" pattern (this is the core design philosophy)
- Load the CURRENT state from Postgres first (a `SELECT *` snapshot), THEN compare each
  incoming/fetched row against it field-by-field, and only INSERT/UPDATE rows that genuinely
  differ. Rows that are identical get a cheap `active=1, updated_at=now()` touch only — not a
  full field rewrite. This is what "real differential" means in this codebase, and it's the
  expected pattern for every worker, not an optional optimization.
- Report both `rows_written` (genuinely changed) and `rows_unchanged_skipped` (touched but not
  rewritten) honestly in the output JSON — this honesty was explicitly required and checked
  throughout, and differential correctness was verified LIVE by deliberately corrupting/deleting
  real rows and confirming the next run detected and fixed them (see PART 3 for the exact test
  pattern to reuse for incremental workers).
- **When comparing "does this row already exist / does it match," ALWAYS scope the comparison by
  `source_key`** (or whatever field identifies which specific mining pass/source produced the
  row). A real bug this session: a differential `NOT EXISTS` check compared `mlb_player_id` alone
  against the WHOLE table, without checking `source_key` — so a legacy row from an old,
  unrelated source (different mining logic, different session) was incorrectly treated as "this
  player is already up to date," silently blocking 1,344 of 1,349 real rows from ever being
  written. Always scope differential/dedup logic by source, not just by natural key.

### Freshness gates / watermarks (for sources with no cheap "what changed" signal)
- For external sources with no incremental "what changed since X" API (MLB roster endpoints,
  Baseball Savant CSV exports), skip the expensive full re-mine if a certified/promoted run
  completed within a bounded freshness window (20 hours was the value used throughout — grounded
  in the "watermark-based bounded reprocessing" data-engineering pattern).
- Pattern: check `MAX(updated_at)` (or `MAX(promoted_at)` for multi-stage workers) `WHERE
  source_key=? AND ...`, and if the age is within the window, return a clean `completed_noop_fresh`
  response without touching the external source or the database at all. Report the gate's state
  honestly: `last_run`, `age_hours`, `window_hours`, `skipped_expensive_fetch: true`.
- To force a real (non-noop) test of a freshness-gated worker, age the watermark back
  artificially: `UPDATE <table> SET updated_at = now() - interval '25 hours' WHERE ...` (or the
  batch-tracking table's equivalent timestamp column). This was the standard, reliable way to
  force real differential testing throughout this migration — reuse it for every incremental
  worker's tests.
- A freshness-gate no-op is NOT a bug or a sign of "nothing happening" — it's the system
  correctly recognizing recent, real, successful data and avoiding wasted API calls/writes. Only
  worry if a worker NEVER shows a real (non-noop) success at least once.

### Chunking / multi-tick continuation for large jobs
- Cloudflare Workers have real execution constraints; any single invocation that does too much
  work (many external API calls, many DB writes) risks running long enough to look "stuck" or
  actually hit a real platform limit. The proven pattern: process a bounded slice per invocation
  (e.g. 6 teams per tick for `static-players`, 150 rows per tick for `static-pitcher-arsenal`),
  return `status: "partial_continue"` with a `continuation_input_json` object carrying forward
  whatever offset/progress state is needed, and let the orchestrator's own generic continuation
  mechanism re-invoke with that same input on the next tick.
- **Only stages orchestrated as part of a parent chain (like `static-full-run`) get automatic
  re-invocation with `continuation_input_json` from a generic mechanism.** A worker tested
  STANDALONE (inserted directly into `control_job_queue` outside a parent chain) will NOT
  automatically continue — you must manually re-enqueue the next tick yourself with the
  correct continuation input during standalone testing. Don't mistake this for a bug in the
  worker.
- When testing continuation manually, pass `input_json` as a FLAT object matching what the
  worker's code reads directly off `input.input_json` — do NOT double-nest it (e.g. don't send
  `{"input_json": {"year":2026, "offset":150}}`) — the orchestrator passes the row's `input_json`
  column value straight through as `input.input_json`, so nesting it again means the real content
  never reaches the code and the offset silently defaults to 0. This exact mistake wasted a full
  test cycle this session.
- Deactivation/stale-row cleanup at the end of a multi-tick run (marking rows inactive if they
  weren't seen in the latest fetch) must ALSO be scoped by `source_key`, and should only run on
  the FINAL tick once the full fresh dataset has been seen — not per-tick, or every intermediate
  tick will incorrectly deactivate rows it just hasn't reached yet.

### Bulk vs. individual-row inserts — the real, tested conclusion
- **Bulk inserts (via `postgres.js`'s `sql(arrayOfObjects, ...columnNames)` helper, chunked ~200
  rows per statement) are the CORRECT, fast, safe approach — use them.** They were initially
  suspected of being unsafe (after live "Network connection lost" failures), reverted to
  individual-row inserts under that false suspicion, and then PROVEN to be correct after the real
  root cause (`prepare: false` missing, masking schema errors) was found. The individual-row
  revert caused a real, measured ~15x performance regression (from ~20-25 seconds/tick down to
  ~350 seconds/tick on `static-players`) before being reverted back to bulk. **Do not repeat this
  mistake on incremental workers — start with bulk inserts and `prepare: false` from day one.**
- Individual-row inserts remain a safe FALLBACK pattern for small tables (dozens of rows, like
  `static-teams`'s 30 teams) where the performance difference is immaterial, but bulk is strictly
  better and should be the default for anything with hundreds+ of rows per invocation.

### Schema management
- Every new Postgres table needs its schema created explicitly via `CREATE TABLE IF NOT EXISTS`
  in an `ensureSchema()`-style function called at the start of every real run — but this is NOT
  sufficient by itself. **Always verify the ACTUAL live columns via `information_schema.columns`
  before assuming a fresh `CREATE TABLE IF NOT EXISTS` did anything** — if the table already
  existed (from earlier, unrelated backfill work in a prior session), the `IF NOT EXISTS` clause
  is a no-op and the table may be missing columns your current code needs. This exact situation
  recurred multiple times this session (`ref.pitcher_arsenal`, `ref.defensive_quality`,
  `ref.players`, `ref.rosters` all had this problem) and each time cost real debugging time until
  directly checked.
- When a stale/legacy table is found with an incompatible or incomplete schema, the safe fix is:
  add the missing columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and if there's a
  conflicting old primary key (different column name/convention), drop the old PK constraint and
  add a new unique index/PK on the column your current code actually uses — don't try to force
  the old and new conventions to coexist.
- After any DDL (`ALTER TABLE`, `CREATE INDEX`, etc.) or DELETE against Postgres via the
  diagnostic bridge, a fresh read may show STALE results for several seconds (observed
  repeatedly). If a just-applied change doesn't show up immediately, wait ~8-10 seconds and
  re-check before concluding the change failed — don't panic-fix something that already worked.

### Real, root-caused bugs and their fixes (broadly applicable patterns)
- **Position-filtering bug**: a Postgres remine function for hitter game logs had NO position
  filter (fetched game logs for all 1,349 roster players including ~600+ pitchers who rarely
  bat), while the mature D1 base worker correctly filtered to hitter positions only
  (`C,1B,2B,3B,SS,LF,CF,RF,OF,DH`) before fetching. Wasted API call budget on the wrong player
  population. Fix: always check what filter the equivalent, working D1 worker applies before
  assuming a straightforward port is complete.
- **Silent fetch-failure bug**: a remine loop used
  `const json = await resp.json().catch(() => null)` with no `resp.ok` check, no retry, no
  rate-limit handling, across dozens of rapid-fire sequential external calls with zero stagger.
  This produced a consistent ~41% silent shortfall in fetched rows across multiple different
  data types (same ratio for both hitters and pitchers — a strong tell that the bug was
  systematic, not random/data-dependent). Always check `resp.ok` explicitly and log/report
  failures rather than silently treating them as empty results.
- **Double-encoded JSON bug**: `raw_json` fields were sometimes stored as a JSON-stringified
  STRING inside a JSONB column (i.e., `"raw_json": "{\"season\":...}"` with literal escaped
  quotes) rather than a native JSON object — this silently broke any code trying to read fields
  out of it (e.g., `pitches_sum`/`strikes_sum` always reading as 0). A `fix_raw_json_double_encoding`
  mode was already built in the codebase for exactly this — use existing fixes rather than
  reinventing ad hoc workarounds when a matching one already exists.
- **Blind JSON truncation breaking JSONB inserts**: code like
  `JSON.stringify(value).slice(0, 1500)` was used to cap `raw_json` field size (a leftover
  concern from D1's TEXT column size limits). Slicing a stringified JSON blindly at a fixed
  character count almost always produces INVALID JSON (cut mid-object/mid-string). Inserting
  that into a `JSONB` column can throw a real Postgres error. Postgres JSONB has no such
  arbitrary size limit that D1's TEXT columns had — don't carry forward D1-era truncation
  patterns into Postgres code; remove them.
- **`ON CONFLICT` column mismatches after schema evolution**: when a promote/INSERT statement's
  column list evolves (e.g., dropping a no-longer-used column like `slate_date`), the
  corresponding `ON CONFLICT (...) DO UPDATE SET ...` clause must be updated in the SAME edit —
  a stray reference to a removed column in the `DO UPDATE SET` clause will throw a real,
  specific error (`column "X" is of type Y but expression is of type Z`, or similar) the next
  time that exact code path executes.

### Standing rule for the next phase of work (board, daily context, market): rewiring + efficiency, not backfill
- Verified directly before this rule was written: `daily.lineups_current`, `daily.probable_pitchers`,
  `daily.umpire_context_current`, `market.historical_props_2025`, and
  `market.prizepicks_board_current` already hold real, live data on Postgres from prior sessions.
  **Most of the workers ahead in these three layers need rewiring (D1 syntax → Postgres syntax,
  same proven logic) far more than they need backfill.** Always check whether the target table
  already has real data before assuming a backfill step is needed.
- **Apply the tick-efficiency lessons from PART 4 proactively on every new worker from its first
  version, not as a bug fixed later**: read `chunk_size_players`/`max_tick_runtime_ms`/
  `promote_rows_per_tick` from live `config.worker_tick_settings` via `getWorkerTickConfig()` from
  day one; never let a hardcoded constant serve as a `cap()`/`Math.min()` ceiling when the real
  ceiling should come from live config; always check the live config value before any value frozen
  into a database row at batch-creation time in a fallback chain. Proven, sane starting defaults:
  chunk size 750 for per-player-fetch workers, 100 for splits-style workers, 150-300 for
  compute-heavy tier/HP workers, `max_tick_runtime_ms = 90000` (wall-clock, fetch-bound) throughout.


### Testing / verification discipline
- The single most reliable verification pattern used throughout: **corrupt-and-fix testing**.
  Deliberately change or delete a real row directly in Postgres (e.g., flip a stadium's
  `roof_type`, change a player's `current_team_id` to simulate a trade, delete a stadium row
  entirely), age back the relevant freshness watermark if one exists, run the worker for real,
  and confirm the differential logic detects and correctly restores the change — with an honest
  count in the output (`rows_written: 1`, not a full rewrite of everything). This is the standard
  way to prove a differential worker actually works, not just that it runs without erroring.
- Full end-to-end chain verification pattern: deploy → wait (`sleep`) → check
  `github_list_workflow_runs` for the latest 1-2 entries to confirm deploy succeeded before
  testing → THEN dispatch a real test and check results directly against the database, not just
  the tool's own reported success/failure.
- When a deploy's outcome is uncertain, retry once via a trivial no-op file touch (e.g. a
  comment-only edit) rather than assuming the first attempt's failure is permanent — transient
  first-attempt deploy failures were a recurring, known pattern in this pipeline.

---

### Real finding from the immediately following session: intermittent Hyperdrive `CONNECTION_CLOSED`, tied to per-tick workload weight/duration, not to driver choice or config
- A later worker (`score-prep`, part of the board full-run) hit a real, intermittent
  `CONNECTION_CLOSED` failure that was ruled out across three different configurations
  (postgres.js with `prepare:false`, node-postgres, postgres.js with `prepare:true`) — all failed
  at the same early point, including on completely unattended, naturally-spaced cron ticks with no
  testing pressure. Cloudflare's own engineers reportedly confirmed this exact error is a known,
  accepted-rate issue on their Hyperdrive platform for some class of connections.
- **The real, identifiable difference from every worker built in PART 4 of this document**:
  `score-prep`'s per-tick workload does a full reference/calendar reload plus an ~8,500-row
  resolve plus a chunked write, REPEATED on every single continuation tick — a much heavier,
  longer-held connection per tick than any worker in this migration so far (which kept each tick
  to a bounded slice: load a cursor, fetch a small bounded batch, one bulk insert, done — see the
  "Chunking / multi-tick continuation" rule earlier in this PART). No worker built through PART 4
  encountered this failure, which is consistent with (though not proof of) a connection-duration-
  or workload-weight-sensitive failure mode: the longer a single tick holds a Hyperdrive
  connection open and the more total data it moves through it, the more exposure to this
  intermittent failure, independent of anything being wrong in the code itself.
- **Concrete mitigation for the next phase's workers, before this failure recurs there too**:
  1. **Cache/memoize reference or calendar data ACROSS ticks within a single full run, do not
     reload it fresh on every tick** if it doesn't change tick-to-tick — load it once (e.g. into
     the batch's own state row) rather than once per continuation.
  2. **Keep every tick's total DB workload genuinely small and bounded**, the same discipline as
     the proven chunk sizes elsewhere in this document (750/100/150-300) — this is also a real
     mitigation against a connection-duration-sensitive failure mode, not just a throughput
     consideration.
  3. **Add automatic requeue-on-failure for standalone (non-chain) full-run jobs**, mirroring the
     existing `board_full_run` chain's `retry_count` logic, so a transient connection blip doesn't
     require a human to manually re-trigger it every time — a real, small, targeted fix, not a
     rewrite of the 20,000-line orchestrator's retry logic.
- **What this does NOT mean**: it does not mean postgres.js, `prepare:false`, or the connection
  pattern used throughout this document is wrong — three different driver/config combinations all
  hit the identical failure at the identical point, which is strong evidence AGAINST driver/config
  being the cause. Do not re-litigate the driver choice over this; the real fix is workload shape,
  not driver choice.



## PART 2 — DON'TS (real mistakes, false conclusions, wasted time)

### The single biggest mistake of this migration
- **Chasing "Network connection lost" as a real connection/network problem for HOURS when it was
  actually `postgres.js`'s prepared-statement mode masking a plain, simple SQL error (missing
  column, type mismatch).** Multiple wrong hypotheses were tried in sequence, each "fixed" and
  each still failing identically: bulk-insert syntax (reverted to individual-row inserts — wrong,
  wasted a real ~15x performance regression), connection held open during external fetch
  (restructured to close/reopen connections around fetches — real improvement in principle, but
  not the actual cause), data volume/duration (added multi-tick chunking — a good pattern to have
  regardless, but not the actual cause). **The actual fix was one connection option:
  `prepare: false`.** Set this from the very first line of Postgres code in every worker, always,
  and never again assume a generic "connection lost" error is really about the connection.

### False assumptions to never repeat
- **Never assume "the migration is done" or "this worker is on Postgres" without directly
  grepping the worker's own file for D1 calls** (`REF_DB.prepare`, `.batch()`, D1 binding usage
  targeting seed/data tables). Early in the overall migration effort, it was believed the system
  had already migrated to Postgres — this was FALSE, verified directly against live
  `wrangler.jsonc` configs showing 11 D1 bindings and zero Hyperdrive bindings except one
  diagnostic worker. Always verify directly; never take a prior summary's "done" status at face
  value without a fresh check.
- **Never assume a `CREATE TABLE IF NOT EXISTS` succeeded in creating the schema you expect** —
  always verify actual live columns first if there's any chance the table pre-existed from
  earlier, unrelated work (see PART 1's schema section). This exact mistake recurred at least
  four separate times this session before being made into a standing rule.
- **Never assume a differential/dedup check is correctly scoped** just because it compiles and
  runs without error — a `NOT EXISTS`/matching check that omits a `source_key` (or equivalent)
  filter can silently produce wildly wrong results (1,344 of 1,349 rows blocked from writing) with
  zero errors thrown. Always explicitly verify the comparison is scoped to the right population.
- **Never trust a worker's own "success" report without an independent, direct database check.**
  Several real bugs (position filter, silent fetch failures, double-encoded JSON, ID format
  mismatches) produced worker outputs that reported `ok: true` while quietly under-delivering or
  corrupting data. Always cross-check real row counts, real sample values, and real distinct
  counts directly against the database, not just the JSON the worker itself returns.
- **Never assume "REF_DB" (D1) and Postgres `ref.*` tables are the same data or interchangeable**
  just because they have similar names. Multiple times this session, legacy D1 tables (`ref_teams`,
  `ref_players`, `ref_pitcher_arsenal`) and their Postgres counterparts had genuinely different
  row counts, different ID conventions, and were populated by entirely different worker code
  paths. Treat them as fully independent unless directly proven otherwise.

### ID format and naming consistency
- **A systemic bug this session**: early backfill functions used bare numeric team IDs (e.g.
  `"133"`) while later, correct worker code used the real `mlb_` prefix format (e.g. `"mlb_133"`).
  This silently created duplicate rows across at least 8 different tables (`ref.teams`,
  `ref.team_aliases`, `ref.players`, `team.game_logs`, `stats_hitter.game_logs`,
  `stats_pitcher.game_logs`, `team.starter_history`, `team.bullpen_history` — tens of thousands
  of bad rows total) before being caught and fixed with a blanket
  `UPDATE ... SET team_id='mlb_'||team_id WHERE team_id !~ '^mlb_'` pattern across every affected
  table. **Always establish and consistently apply ONE canonical ID format up front, and grep for
  format inconsistencies proactively rather than discovering them via downstream symptoms.**

### Performance / efficiency mistakes
- **Don't revert a working, fast pattern (bulk inserts) to a slower one (individual-row inserts)
  based on a scary but misleading error message without first checking whether the connection
  configuration itself (`prepare: false`) is correct.** This is the single highest-cost mistake
  of the whole migration, worth repeating: it cost multiple hours of debugging and a real,
  measured 15x performance regression that then had to be un-done.
- **Don't do unconditional "deactivate everything, then re-upsert everything" cycles on every
  single run** for data that's genuinely close to fully static (stadiums, teams). This was an
  identified, real inefficiency in an earlier worker version — two full writes per row every
  single run regardless of whether anything changed. Fixed by loading a current snapshot first
  and only paying the full-rewrite cost for genuinely new/changed rows (see PART 1's
  differential pattern) — unchanged rows get a cheap reactivation touch only.
- **Don't carry forward a full duplicate copy of "everything" in a temporary staging table for
  workers that don't need multi-stage stage→certify→promote lifecycles.** (This is being
  actively corrected going forward per explicit instruction — see HANDOFF.md's section on the
  main-table-only requirement for incremental/delta layers. Many existing delta workers already
  correctly avoid this; don't introduce it where it doesn't already exist.)

### Deploy pipeline gotchas
- **Never hand-edit a `wrangler.*.jsonc` file directly expecting the change to survive a
  deploy** — `generate_wrangler_configs.py` runs before every single deploy and OVERWRITES all
  wrangler configs from its own Python template, silently wiping any manual edit. Any new binding
  (like Hyperdrive) must be added to the generator script's special-case logic, not the `.jsonc`
  file.
- **Don't assume a "cancelled" secondary deploy job (e.g. a "pages build and deployment" run) is
  harmless without checking whether the ACTUAL worker deploy also got cancelled or silently used
  stale code.** At least once this session, a worker kept running old code because its deploy got
  cancelled by a subsequent push's "changed files" scope not including the file that needed
  redeploying (each push's CI diff is computed against its own immediate parent commit only, not
  the full set of recent changes). Always verify the deployed version string in a live test
  response, not just the CI run's conclusion status.
- **Don't assume the first deploy attempt's failure is permanent** — a known, recurring, transient
  first-attempt failure pattern exists in this pipeline; retry once via a trivial no-op commit
  before concluding something is broken.

### Communication / process mistakes (from the user's own explicit feedback this session)
- Don't guess at root causes and present them as confirmed fixes — verify against real data
  before declaring anything fixed. Multiple times this session, a fix was presented as working
  based on a plausible-sounding theory, only for the exact same failure to recur immediately
  after — this eroded trust and wasted enormous time. State honestly what's confirmed vs.
  hypothesized at every step.
- Don't let a session run long chasing one stubborn bug via repeated small guesses — when 2-3
  targeted hypotheses have failed, stop and get real, structured diagnostic data (e.g., add
  step-by-step error labeling, or per-row try/catch to isolate exactly where and on what data a
  failure occurs) rather than continuing to guess at increasingly specific variations of the same
  wrong theory.
- Don't produce long, verbose explanations when the person has explicitly asked for brevity and
  assertiveness — this cost real conversational budget and patience throughout the session.

---

## PART 3 — Session: `base-pitcher-game-logs` built from scratch, deploy failure root-caused, new tool added

### D1 IS READ-ONLY REFERENCE ONLY — RESTATED IN THE STRONGEST POSSIBLE TERMS, NO EXCEPTIONS
- **Every single worker, from this point forward, writes ONLY to the new Postgres database.**
  D1 (`CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`, `TEAM_DB`,
  `DAILY_DB`, `MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`) is READ-ONLY REFERENCE, used
  ONLY when genuinely needed to look up something not yet on Postgres — NEVER as a write target,
  NEVER as a source of truth for validation, NEVER copied from wholesale. This was already the
  rule; it is restated here because it must never drift, and every future session must re-read
  this line before writing a single line of code.
- Practical consequence for every worker still to be ported (team-game-logs, starter-history,
  bullpen-history, hitter-splits, pitcher-splits, then the calculation layer): if the D1 version
  of a function reads FROM a D1 table for reference data (e.g. roster/position lookups), and an
  equivalent Postgres table already exists (`ref.players`, `ref.teams`, etc.), read from
  Postgres instead — do not fall back to D1 "just to get it working." If no Postgres equivalent
  exists yet, flag it and ask, don't silently wire in a D1 read.

### Building a brand-new worker file from scratch on Postgres, when the D1 original is too
### architecturally different to port line-by-line (as opposed to hitter's direct in-place port)
- For `base-pitcher-game-logs`, the real D1 file (144KB, source-probe mode, two-stage base with
  a separate promotion microphase, complex REF_DB role-based discovery) was judged NOT worth
  porting line-by-line — instead, rebuilt clean using hitter's already-proven, simpler
  architecture (single dual-mode file, `base_backfill` + `delta_update`, full-roster re-mining
  for delta). **This is a legitimate exception to the "surgical port only" rule, but only when
  explicitly reasoned through and only by reusing an already-proven pattern (hitter's), never by
  inventing a new architecture from scratch.**
- **Real, proven method for pushing a large new file to the repo via this MCP bridge, when the
  file is too big/complex to reliably round-trip as a single `github_put_file` call:**
  1. Push a small, syntactically-valid STUB file first via `github_put_file` (constants,
     minimal `fetch` handler, one `// STUB_MARKER_X_NEXT` comment marking where more code goes).
  2. Build the file up section by section via repeated `github_patch_file` calls, each one
     replacing the current stub marker comment with real code ending in a NEW stub marker
     comment — the file is always syntactically valid at every single step.
  3. This is the exact same method already proven for the hitter conversion (patch-by-patch
     against a real file) — the only difference for a from-scratch build is that the "real
     file" starts as a deliberate stub instead of an existing D1 file.
- **Real lesson about `github_put_file`/`create_file` "aborted, no result returned" errors**:
  in this session, two consecutive attempts to push a fully-reconstructed large file via
  `github_put_file` (and `create_file` for a local sandbox copy) both came back as empty/aborted
  tool calls. **The root cause was NOT a size limit or a real tool failure — it was calling the
  tool with no parameters at all** (an assistant-side mistake, not a platform limit). The very
  next call, with real `path`/`content`/`message` parameters filled in, succeeded immediately at
  a comparable size. **Before concluding a tool call is broken or hitting a limit, verify the
  call itself actually included its required parameters.**

### Deploy pipeline gotcha #2 — the SAME `generate_wrangler_configs.py` whitelist trap, in a new form
- PART 1 already documents that hand-editing `wrangler.*.jsonc` is wiped by the generator script.
  This session hit the SAME root mechanism in a new shape: **`generate_wrangler_configs.py`'s
  `make_config()` function has a hardcoded tuple of worker names that receive the `hyperdrive`
  binding + `"compatibility_flags": ["nodejs_compat"]`.** A brand-new Postgres-native worker
  (`alphadog-v2-base-pitcher-game-logs`) was fully built, correctly using the `postgres` npm
  package — but was NOT yet in that hardcoded tuple. Every deploy silently regenerated its
  `wrangler.*.jsonc` as a plain D1-only config (no Hyperdrive, no nodejs_compat), and the
  Cloudflare deploy failed at build time with `Uncaught Error: No such module "node:events"`
  (the `postgres` package needs Node compat that wasn't declared).
- **Real fix**: add the new worker's exact name to the SAME tuple in
  `generate_wrangler_configs.py` that already contains `alphadog-v2-base-hitter-game-logs` (and
  `alphadog-v2-orchestrator`, `alphadog-v2-static-teams`, etc.). This is the ONLY correct fix —
  editing the `.jsonc` file directly, or trying to patch around the symptom in the worker's own
  `.js` file, does nothing, because the generator always runs first and overwrites the config.
- **Standing rule for every future worker that writes to Postgres**: the moment a new worker's
  `.js` file is created and imports the `postgres` package, ALSO add its exact worker name to
  `generate_wrangler_configs.py`'s hyperdrive/nodejs_compat tuple, in the SAME session, before
  ever attempting a deploy. Do not treat this as a separate, later step — a deploy without this
  will fail with a confusing Node-module error that has nothing obviously to do with wrangler
  config, costing real debugging time if not immediately recognized as this exact known pattern.

### New tool added this session: `github_get_workflow_run_log` — READ THIS BEFORE ASKING THE USER TO PASTE A DEPLOY ERROR
- Added directly to `alphadog-v2-admin-sql.js` (this MCP bridge worker's own source file) since
  that file already contains every other `github_*` tool (`github_list_workflow_runs`,
  `github_patch_file`, etc.) — same pattern, same `githubRequest()` auth helper, same
  `GITHUB_TOKEN` secret (already has sufficient scope, confirmed by `github_list_workflow_runs`
  already working — no new secret was needed).
- **What it does**: given a `run_id` (from `github_list_workflow_runs`), calls GitHub's real
  Actions API — `GET /actions/runs/{run_id}/jobs` to find the job, then
  `GET /actions/jobs/{job_id}/logs` (which 302-redirects to the raw plain-text log; `fetch()`
  follows redirects by default so the existing `githubRequest()` helper needed ZERO changes to
  work here) — and returns the job's real per-step status plus the tail of the real log text.
- **How to use it going forward, instead of ever asking Rodolfo to paste a deploy error again**:
  1. `github_list_workflow_runs` → find the failed run's `id`.
  2. `github_get_workflow_run_log` with that `run_id`. Optionally pass
     `grep: "ERROR|Uncaught|Error:"` to jump straight to the failure instead of reading a full
     log tail, and/or `tail_lines` to control how much text comes back.
  3. Read the real error directly — do not guess, do not ask the user to paste it, unless this
     tool itself errors (e.g., log genuinely expired — GitHub's redirect link is only valid for
     ~1 minute from generation, but the tool fetches it fresh each call so this should be rare).


## PART 4 — Session: metrics/classification/baseline verified end-to-end, full-run stepper built, stale-data sweep, 6 AM Pacific scheduling

### Architecture decision: self-gating delta workers do NOT need the old D1 "certifier finds gaps, dispatches miners" pattern
- Researched and validated against real ETL literature: watermark-based incremental extraction
  with self-healing (auto-detect and catch up on next run) is the modern, correct pattern for
  sources without native change-data-capture (exactly this system's situation — MLB StatsAPI has
  no CDC feed). The old D1 pattern existed because those miners were "dumb" executors needing an
  externally-computed gap list; the new Postgres workers are NOT dumb — each one discovers its own
  scope via its own watermark + the real `calendar.game_calendar` completeness check.
- **Real mistake made and corrected on this exact point**: the first full-run design enqueued all
  13 real stages simultaneously, assuming self-gating meant "order doesn't matter." This produced
  genuinely chaotic, overlapping, interleaved execution (multiple different stages ticking at
  once) because the shared tick/pump mechanism doesn't respect intended stage order across
  different job_keys. **Self-gating (a stage knows when it's safe to run) and sequencing (only one
  stage active at a time) are two separate concerns — you need both.** The correct fix: a strict
  stepper that does exactly ONE action per invocation (enqueue the next not-yet-created stage, OR
  wait if the current stage isn't terminal yet), re-checking itself every tick via its own
  self-continuation. This is now the standing pattern (`runPostgresFullRunEnqueue` /
  `POSTGRES_FULL_RUN_STAGES` in `alphadog-v2-orchestrator.js`).

### Real bug pattern found and fixed: hardcoded fallback/ceiling values silently overriding live database config
- **The exact bug, found in `alphadog-v2-base-hitter-game-logs.js` and
  `alphadog-v2-base-pitcher-game-logs.js`**: `cap(value, 100, DEFAULT_MAX_ROWS_PER_TICK)` — the
  hardcoded constant was used as BOTH the fallback value AND the cap()'s own ceiling argument. This
  meant that even when the live database (`config.worker_tick_settings.promote_rows_per_tick`)
  correctly held a bigger, faster value (750), the result could never exceed the hardcoded 450
  no matter what. **Whenever a `cap(x, min, max)` call's `max` argument is a hardcoded constant
  instead of a live config value, that hardcoded constant silently becomes the true ceiling
  regardless of what the database says — always check the ceiling argument, not just the
  fallback/default argument.**
- **A second, subtler layer of the SAME bug class**: even after fixing the ceiling, a precedence
  bug remained — `inputJson.x || batch.x || tickConfig.promote_rows_per_tick || DEFAULT` — since
  `batch.x` (a value FROZEN into the database row at batch-creation time, potentially from before
  a config fix was ever made) came BEFORE the live `tickConfig` value in the `||` chain, the stale
  frozen value kept winning via short-circuit evaluation for any batch already in flight. **When a
  worker reads its own tuning values in this kind of fallback chain, the LIVE config source should
  always be checked before any value that was captured once into a database row at creation
  time** — otherwise a database config change silently does nothing for already-running work.
- **How this was found**: real observed throughput (~171-176 players/tick) didn't match the live
  DB config (750) or the hardcoded default (450) exactly, which was the tell that something else
  was capping it. Verified precisely by reading the exact `cap()` call and the exact batch-creation
  `INSERT` statement, not by guessing.
- **Same class of bug also found in `alphadog-v2-base-classification-v5.js` and
  `alphadog-v2-base-baseline.js`**: `COMBOS_PER_TICK` was hardcoded to `Math.min(x, 15)`,
  completely ignoring the real `config.worker_tick_settings.chunk_size_players` row (150) that
  already existed for classification, and Baseline had NO config row at all. Fixed by adding a
  proper `getWorkerTickConfig()` helper (missing entirely from both files) and reading the real
  chunk size live.
- **Standing check for any future speed/chunk-size tuning work**: grep every worker for
  `cap(`/`Math.min(` calls involving a tick-size or row-limit variable, and verify (1) the
  ceiling argument is not a hardcoded constant that's lower than the intended live config value,
  and (2) any fallback-chain precedence puts the live config source before any value frozen into
  a database row at creation time.

### Real bug found and fixed: LEFT JOIN fan-out causing "ON CONFLICT DO UPDATE command cannot affect row a second time"
- `alphadog-v2-base-bullpen-history.js`'s `deriveBullpenStageRows` joined
  `stats_pitcher.game_logs` to `team.starter_history` on `(team_id, game_pk)` only (no
  player/pitcher column in the join condition). `team.starter_history` genuinely has 2 real rows
  for some `(team_id, game_pk)` combinations (confirmed directly — not a data-quality bug, real
  data). The LEFT JOIN legitimately fanned out, duplicating the SAME pitcher's game-log row once
  per matching starter-history row, producing the identical deterministic `stage_id` twice within
  a single `INSERT ... SELECT ... ON CONFLICT DO UPDATE` statement — a hard Postgres restriction
  (a single statement cannot apply `ON CONFLICT DO UPDATE` against the same target row twice).
- **Real fix**: dedupe the JOIN target to at most one row per `(team_id, game_pk)` using
  `SELECT DISTINCT ON (team_id, game_pk) ... ORDER BY team_id, game_pk, mlb_player_id` as a
  subquery before joining, rather than joining the raw table directly. This is the correct general
  fix whenever a LEFT JOIN's right-hand table can legitimately have more than one row per the
  join key you actually care about matching on.
- **How this was found**: the error message itself (`ON CONFLICT DO UPDATE command cannot affect
  row a second time`) is Postgres's own precise diagnostic for exactly this condition — when this
  exact error appears, the real cause is almost always a JOIN producing duplicate rows for the
  same conflict-target key, not a data problem in the base table. Verified directly by querying
  `GROUP BY (team_id, game_pk) HAVING COUNT(*)>1` on the join's right-hand table before writing
  any fix.

### The full-run stepper design, confirmed working end-to-end with real data
- 13 real stages in strict order: game-calendar → hitter-game-logs → pitcher-game-logs →
  team-game-logs → starter-history → bullpen-history → hitter-splits → pitcher-splits →
  hitter-metrics → pitcher-metrics → classification → baseline → certifier.
- The stepper (`runPostgresFullRunEnqueue`) does exactly one of three things per invocation, by
  chain_id: enqueue the next not-yet-created stage; wait if the current stage isn't terminal;
  or stop the chain if a stage genuinely failed (visible for manual repair, not silently retried
  forever). A separate self-continuation job (`postgres-full-run-enqueue` job_key) re-checks the
  same chain on every subsequent tick until `all_stages_terminal`.
- **Verified end-to-end with real, live data, twice** — once cleanly, once after finding and
  fixing the bullpen-history bug mid-run (proving the stepper correctly halts on a real failure
  rather than silently proceeding past it, then correctly resumes once the underlying bug is
  fixed and the stage is re-enqueued under the same chain_id).
- **Real certification check confirmed the whole chain's correctness independently**: for July 21
  (the most recent day with all games final), `base-certifier-postgres` in `check_date` mode
  reported `FULL_CHAIN_CERTIFIED_COMPLETE` with zero blocking reasons, while July 22 (games still
  in progress) correctly reported `FULL_CHAIN_PARTIAL_OR_BLOCKED` — proving the safety gate works
  in both directions, not just the "everything passed" direction.

### Stale-data sweep across all 20 Postgres schemas (13 pipeline + 7 previously unchecked) — real findings
- **Real pattern found repeatedly**: leftover rows from an earlier dev iteration of the SAME table,
  identifiable by (a) a different ID-naming convention than the current code produces, and (b) a
  NULL `batch_id`/tracking column the current code always populates. Found and fixed in
  `team.starter_history` (2,977 old rows), `team.bullpen_history` (9,247 old rows),
  `team.game_logs` (3,056 old rows), `team.game_logs_stage` (66 orphaned already-promoted rows),
  and `context.first_inning_game`/`context.first_inning_pitcher` (an older, narrower-schema
  predecessor of `context.expansion_first_inning_*_context_current`).
- **Critical discipline applied throughout this cleanup — verify before deleting, every time**:
  for each old-pattern table, checked whether the old rows were (1) fully covered/duplicated by an
  equivalent current-pattern row (safe to delete), or (2) genuinely unique data with no current
  replacement. Where old rows were unique but the underlying data was itself broken/unusable (e.g.
  `bullpen_history`'s old rows had `player_id IS NULL` on 100% of them — unusable regardless of
  date coverage), deleted them entirely. Where old rows were unique AND held real, complete,
  usable data the current pipeline simply hadn't remined that far back yet (e.g. `team.game_logs`
  had 2,996 old rows covering real March-onward season history; `team.starter_history` had 30 real
  uncovered games), **those were explicitly preserved, not deleted** — losing real, irreplaceable
  data for the sake of tidiness is a strictly worse outcome than leaving a few extra old-pattern
  rows around.
- **A GROUP BY false-positive to watch for**: an early duplicate-check query on
  `archive.player_availability_history` flagged 2 "duplicates" on `(official_date,
  mlb_player_id)` — turned out to be a real doubleheader (two different real `game_pk` values,
  same date/player), not a duplicate at all. **Always include every column that's actually part of
  the real natural key in a duplicate-check GROUP BY** — omitting one (here, `game_pk`) produces
  false positives that look like data quality problems but aren't.
- **Verified formula/version correctness two independent ways, not just one**: for
  classification/baseline/metrics, checked both (1) that `formula_version` is a single, uniform
  value across every row matching the currently deployed code's constant, AND (2) hand-recomputed
  a real row's stored value using the current formula by hand and confirmed it matches (e.g.
  recomputed a `pre_shrunk_rate` and a `confidence_0_100` value from raw inputs and got numbers
  matching the stored ones to 3-4 significant figures). Checking the version string alone is not
  sufficient proof the underlying math is current — a version bump doesn't happen automatically
  just because a formula changed, if the person changing the formula forgets to bump it.

### Real, major finding: ~293,000-row orphaned "V6" classification/baseline system from a prior, abandoned architecture
- `classification.classification_v6_current` and `classification.baseline_v6_current`
  (146,444 rows each) are written by `alphadog-v2-phase3a-first-inning-pitcher-context.js` under
  job_key `expansion-baseline-v2` (mode `classification_baseline_v6_to_postgres` /
  `runClassificationV6BaseSingleStep`), a real, still-present worker with its OWN write-guard
  whitelist (`assertExpansionTable`, restricted to `expansion_*`/`classification_v6_*`/
  `baseline_v6_*` tables only) that is completely separate from and does not interfere with the
  main `alphadog-v2-base-classification-v5.js` / `alphadog-v2-base-baseline.js` pipeline this
  session verified and certified.
- The orchestrator still has live (if dormant) dispatch wiring for this job under the OLD
  `INCREMENTAL_MORNING_FULL_RUN_STAGES` D1-era chain (`baseline_v5_classification_daily_delta`,
  `baseline_v5_hp_daily_delta` stage keys, confusingly ALSO called "Baseline V5" in that chain's
  naming despite being architecturally unrelated to the current `base-classification-v5`/
  `base-baseline` workers this session built).
- **Explicit user decision: leave this system exactly as-is, do not delete or modify it.** Do not
  re-open this question in a future session without the user explicitly raising it again — it is
  isolated (own tables, own write-guard, `no_current_baseline_mutation: true`,
  `no_full_run_integration: true`) and not costing correctness, only some disk space.

### THE SINGLE MOST IMPORTANT RULE OF THIS ENTIRE MIGRATION, VIOLATED ONCE AND CORRECTED — READ THIS BEFORE WRITING ANY NEW CODE
- **This session, while implementing a scheduling fix, a new D1 table (`control_kv`, in
  `CONTROL_DB`) was created to store a single "last triggered Pacific date" marker value.** This
  was a real, direct violation of the standing "zero D1 for anything new" rule, caught immediately
  by the user, and corrected: the D1 table was dropped, and the real fix instead reused the
  EXISTING, already-established pattern already used by every other scheduled job in
  `alphadog-v2-orchestrator.js` (`enqueueScheduledDailyFullRunIfDue` and five siblings) — read the
  schedule from Postgres `config.scheduled_jobs` (via the orchestrator's existing `pgSchedule()`
  Hyperdrive helper, which was already there from prior work and simply hadn't been noticed), and
  dedupe same-day re-triggering via a DETERMINISTIC request_id (`postgres_full_run_{pacific_date}_
  {HHMM}_PT`) inserted with `INSERT OR IGNORE` into the EXISTING `control_job_queue` — the same D1
  operational dispatch table every single pipeline stage already flows through, not a new table.
- **The distinction that matters, restated precisely**: `control_job_queue` /
  `control_job_runs` / `control_locks` / `control_worker_run_log` in D1 `CONTROL_DB` are the
  accepted, necessary OPERATIONAL CONTROL-PLANE (job dispatch bookkeeping) that this entire system
  already runs on and every Postgres-native worker already reports into — this is NOT the same
  thing as "sports data on D1" and is not itself a violation. **What IS a violation, with zero
  exceptions, is creating ANY new table (of any kind, for any purpose, including tiny
  configuration/marker values) in D1 when the same problem can be solved by reading/writing
  Postgres instead.** Before creating a new table anywhere, first check whether an existing
  Postgres table or an existing established pattern in the same file already solves the exact
  problem — in this case, one already did, and reusing it was strictly less code than the wrong
  D1 approach would have been.
- **Practical standing check for every future session**: before writing `CREATE TABLE` (or `ALTER
  TABLE`, or any first `INSERT`) anywhere in this codebase, ask "is this D1 or Postgres?" out loud
  and verify which binding is actually being used in the code about to be written. If it's D1 and
  the table is new, stop and look for the Postgres equivalent pattern first — one almost always
  already exists somewhere in this 20,000+ line orchestrator file, built by an earlier session.

### Real 6:00 AM Pacific daily scheduling implemented for the Postgres full run
- `config.scheduled_jobs` (Postgres) now has a real, enabled row: `schedule_id =
  'postgres_full_run_0600_pt'`, `job_key = 'postgres-full-run'`, `local_time = '06:00'`,
  `schedule_type = 'daily'`, `timezone = 'America/Los_Angeles'`.
- `enqueuePostgresFullRunIfDue()` in `alphadog-v2-orchestrator.js` follows the exact same pattern
  as its five siblings (`enqueueScheduledDailyFullRunIfDue`, `enqueueScheduledBoardFullRunIfDue`,
  etc.): reads this Postgres config row every cron tick (cron already fires every minute), checks
  a 5-minute due-window via the existing `isPacificScheduleWindowDue()` helper (properly DST-aware
  via `Intl.DateTimeFormat` with an explicit `America/Los_Angeles` timezone — never hardcode a
  fixed UTC offset for Pacific time, it changes twice a year), and dedupes same-day re-triggering
  via a deterministic request_id, not a separate marker table.
- Verified directly: the exact SQL query the function runs was run manually and confirmed it
  returns the one real, enabled schedule row; the live deploy was confirmed clean via
  `github_list_workflow_runs`; and confirmed no new D1 table exists post-fix.
- **For whoever picks this up next**: this has NOT yet been verified by actually waiting for a
  real 6:00 AM Pacific to occur and watching it fire for real — that's the one remaining, honest
  gap in verification. The SQL/logic is confirmed correct by direct inspection and by exactly
  matching an already-proven pattern used elsewhere in the same file, but a live, real-time
  end-to-end firing has not yet been observed.


