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
