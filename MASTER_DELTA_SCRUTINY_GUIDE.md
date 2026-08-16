# ALPHADOG — MASTER & DELTA FULL RUN SCRUTINY GUIDE

Built directly from five real, independent scrutiny passes performed the night of 2026-08-15/16
(three Master Full Run passes, two Delta Full Run passes). Every check, every failure mode, and
every method below either caught a real bug that night or was the specific technique that caught
one in a prior session (cited where applicable). This is not generic advice — every line has real
precedent. Read this before scrutinizing any future Master or Delta run, and update it the next
time a scrutiny finds something this document didn't anticipate.

---

## CORE PHILOSOPHY — read this before anything else

**A coworker's or a prior run's own "PASS" / "COMPLETE" / "ALL_STAGES_COMPLETE_SELF_HEALED"
status is the *starting point* for scrutiny, never the conclusion.** Every real bug found across
all five passes tonight was found by independently re-deriving a claim against live SQL, not by
trusting a self-report. Concretely, tonight's scrutinies found:

- A run that reported "ALL_STAGES_COMPLETE_SELF_HEALED" while its final board had silently lost
  ~12,000 real REVIEW-tier legs with zero error surfaced anywhere.
- A Delta run that reported successful classification refresh while 18 of 23 props had gone a
  full night completely untouched, because its own completion check was satisfied by leftover
  evidence from the *previous* night's run.
- A calibration "fix" that appeared deactivated in every readable status field while still
  silently applying live, because the deactivation label happened to still match the filter it
  was supposed to defeat.

**None of these would have been caught by re-running the existing automated checklist.** The
checklist checks whether a step *completed*; it does not check whether the step's *output is
internally correct*. Every scrutiny in this guide defaults to independent verification against
live data — SQL queries against the real tables, real deployed code read directly, real API
responses fetched fresh — never a second read of the same status field the run already reported.

**Three general techniques, used repeatedly, that found real bugs no automated check would have:**
1. **Systematic whole-universe comparison** — diff the live config against the real formula/logic
   for *every* entry in a universe at once (every prop, every source, every combo), not just the
   one currently suspected. Found 3 of tonight's formula bugs this way.
2. **Leg-by-leg manual tracing** — pick real PRIMARY-tier legs, pull raw game logs by hand, compute
   the expected value independently, and explain any gap through the real math (shrinkage, count
   models, calibration) rather than accepting "looks close enough."
3. **Tracing a real user-reported symptom back to raw source data** — when a person reports a
   concrete discrepancy (a line that doesn't match what their own screen shows), trust the report
   and trace it to the actual raw payload rather than defending the system's own output first.

---

## PART 1 — MASTER FULL RUN SCRUTINY

The Master run has 4 layers: **Board → Daily Context → Market → Scoring**. Scrutinize each layer
independently, in order, verifying every claim in the run's own log against live SQL.

### Layer 1 — Board
- Query `score.final_board_current` (or the equivalent live board table) grouped by `source_key`.
  Confirm all 3 apps (prizepicks, sleeper, parlay_underdog) are present with nonzero row counts
  matching what the run's own log claims.
- Check `MAX(updated_at)` is genuinely fresh (minutes old, not hours) — a single, uniform
  timestamp across all rows is a good sign of a clean atomic rebuild; a range of timestamps can
  indicate a partial/patched-together board.
- **Critical, added after a real incident tonight — check the PRIMARY/REVIEW tier composition,
  not just the total row count.** Group by `board_tier` and confirm both PRIMARY and REVIEW rows
  are present in plausible proportions. A board that is 100% one tier and 0% the other is a
  strong signal of a corrupted reconciliation (see Part 3, Failure Mode 2) — this passed every
  other check tonight (row count matched the log exactly, timestamp was fresh) and was only
  caught by this specific tier-composition check.
- Verify goblin/demon/regular composition is non-degenerate for PrizePicks specifically (a board
  with zero goblins or zero demons on a normal day, when the upstream data supports plenty, is a
  similar red flag to the tier-composition issue above).

### Layer 2 — Daily Context
- Build the real "pickable games" list from `calendar.game_calendar` (today's date, not
  postponed/cancelled, `is_pregame=true`) — this is the authoritative target list, not an
  assumption about game count.
- For each of the 5 daily-context tables (lineups, weather, player_availability,
  bullpen_availability, game_status), run a `NOT EXISTS` check against the pickable-games list.
  Zero gaps is the bar — any missing game_pk in any of the 5 tables is a real finding, not a
  rounding error.
- Separately verify full lineup coverage across *all* of today's games including any already-live
  game (not just the pregame subset) — a live game missing from `lineups_current` can indicate a
  broader staleness problem, not just an edge case.
- If a claimed fix in the log references a specific column name (e.g., "fixed the coverage query
  using `official_game_pk` instead of `game_pk`"), verify that column genuinely exists **in the
  table the claim is about** — tonight, a claim like this turned out to be real but the column
  lived in a different (Layer 1) table than initially assumed. Don't dismiss a claim as fabricated
  just because the first table you check doesn't have it; check the actual query's real target.

### Layer 3 — Market
- Verify the market certifier/prep table (e.g., `market.certifier_slate_current` or
  `score.board_prepared_current`) shows `game_count` exactly matching the pickable-games count
  from Layer 2's own calendar check.
- Verify all 3 raw market board tables (`market.prizepicks_board_current`,
  `market.sleeper_board_current`, `market.underdog_board_current`) are nonzero.
- A market-layer timestamp that's an hour or more old is not automatically stale — Layer 3 runs
  early in a multi-layer chain that can take 60-90+ minutes total; check the timestamp against the
  chain's *own* start time, not against the current wall clock in isolation.

### Layer 4 — Scoring
This is where most of tonight's real bugs were found. Check, in order:

1. **Row-count continuity across the pipeline stages** — `prop_matrix_current`,
   `enrichment_leg_current` (or equivalent), and `hp_board_current` should show the *exact* same
   row count if the chain ran cleanly end to end. Any drop between stages is a real, unexplained
   loss and needs tracing, not dismissal.
2. **Null-score row check** — query `hp_board_current` for `score_0_100 IS NULL`, grouped by
   `canonical_prop_key` and `board_tier`. A small number of null-score rows is expected for
   structurally-unsupported props (props with no HP model branch implemented) — confirm the null
   rows are *all* REVIEW tier and *all* in the known-unsupported prop list, never PRIMARY tier or
   an unfamiliar prop. If a new prop shows up in this list, that's a new, real gap.
3. **HP/score bounds check** — confirm zero rows exist with `estimated_hit_probability_0_100`
   outside `[0,100]`, zero `NULL` where a value is expected, and confirm `has_calibration` (or
   equivalent) covers 100% of live rows.
4. **Calibration application spot-check** — for a sample of props, confirm the number of rows with
   an actually-applied calibration correction is plausible given how many active correction rows
   exist in `score.calibration_correction_map` for that prop.
5. **Tier composition check** — same as Layer 1's check, but at the `hp_board_current` level too:
   confirm both PRIMARY and REVIEW populations exist upstream *before* checking whether they made
   it to the final board (this lets you distinguish "upstream never had REVIEW rows" — benign —
   from "upstream had them but the final board build lost them" — the real bug).
6. **Batch provenance check, when the run's own log mentions a timeout, retry, or "self-healing
   reconciliation"** — query the relevant `*_batches` table's `output_json` for the specific batch
   ID involved. A batch built by the *normal* selection-logic path will have a specific set of
   diagnostic fields (e.g., `hp_source_rows_read`, `base_visible_rows_before_quota`,
   `primary_rows_written`, `review_rows_written`). A batch built by a *reconciliation/recovery*
   path will be missing these fields entirely, because it never ran the real selection logic — it
   just recovered whatever was already partially written. **This single check is how tonight's
   dead-writer bug was actually found** — the batch "passed" every row-count and freshness check,
   but its `output_json` structure itself revealed it never took the normal code path.

### Leg-by-leg manual tracing (do this for every Master Run scrutiny, not just when something looks wrong)
- Pick several real PRIMARY-tier legs, spanning different props and both hitter/pitcher sides.
- Pull the player's raw game logs directly (`stats_hitter.game_logs` / `stats_pitcher.game_logs`)
  for the relevant season/window.
- Compute the raw empirical hit rate by hand (e.g., "how many of this player's real games had 0
  home runs, out of how many games total").
- Compare against the system's stored HP. A gap is not automatically a bug — explain it: is the
  system correctly applying recency weighting, empirical Bayes shrinkage toward a population
  prior, a negative-binomial/count-model conversion instead of a raw binomial rate, or an active
  calibration correction backed by a real, cited sample size? If the gap can be explained by one
  of these documented mechanisms, it's correct. If it can't be explained, or the explanation
  doesn't hold up when you check the actual numbers (e.g., a `recency_blended_rate` field that
  looks like a probability but is actually an average-value metric scaled by 100), keep digging
  until you have a real, verified explanation — don't accept "probably fine."
- Cross-check any apparent duplicate rows (same player/prop/line/side appearing twice) — verify
  whether it's a genuine bug or a legitimate cross-source offer (the same line independently
  offered by two different apps, e.g. PrizePicks and Underdog both listing the same player prop).

---

## PART 2 — DELTA FULL RUN SCRUTINY

The Delta run has 5 layers: **Mining → Classification → Coverage Audit → Outcome Grading →
Calibration**.

### Layer 1 — Mining
- Build the real "today's games" list from `team.game_logs` (or the calendar), then run the exact
  readiness-gate query the pipeline itself uses: for every game_pk, confirm rows exist in
  hitter/pitcher game logs, starter history, bullpen history, and first-inning context, all
  scoped by `team_id`. Zero gaps is the bar.
- Confirm the raw game count matches the real, independently-counted number of games for the date
  — don't just trust whatever count the run's own log states.

### Layer 2 — Classification
**This is the layer with the most severe real failure mode found tonight — read this section
carefully before trusting any Classification "PASS."**

- The naive check — `population_stats` row count matches the expected total combo count, and a
  staleness query shows zero (prop, side) groups older than some threshold (e.g. 36 hours) — is
  **not sufficient on its own**. Tonight, both of these passed cleanly while 18 of 23 props had
  gone an entire night completely untouched, because most rows were sitting at just-under-the-
  threshold staleness *from the previous night's run*, not from the run actually being scrutinized.
- **The only real proof of completion**: query `MAX(updated_at)` per `canonical_prop_key` (not
  just the aggregate staleness check) and confirm every single prop's own latest timestamp falls
  *inside the specific run's own execution window* — not just "recent enough in general." If any
  prop's classification data predates the run being scrutinized, that prop was never actually
  touched, regardless of what the aggregate checks say.
- If the classification/baseline refresh is driven by a resumable combo-index loop (one combo per
  call), also check the relevant `worker_state`/cursor table's `resume_index` against the total
  combo count. A `resume_index` that stopped partway through, with no session having personally
  observed the loop's own completion signal (e.g. `combo_done: true`), means the loop stalled —
  don't infer completion from a proxy signal (see below).

### Layer 3 — Coverage Audit
- Cross-check that Layer 1's mining coverage and Layer 2's classification coverage agree on the
  same real game/player population — a mismatch here (e.g., classification covering fewer games
  than mining actually produced) is a real gap worth tracing.

### Layer 4 — Outcome Grading
- Confirm every leg on the relevant day's board has a corresponding graded outcome row — a
  `LEFT JOIN` from the board history to the outcome-history table, checking for `NULL` on the
  outcome side, scoped by the exact same identity fields the real grading join uses (player, prop,
  line, side, date, **and `game_pk`** — a join missing `game_pk` will silently misgrade
  doubleheader days, a real bug found and fixed in a prior session).
- If a large fraction of legs grade as "did not play" / voided, don't assume this is a bug by
  default — trace a sample of them back to the raw game logs and confirm the player genuinely has
  zero game-log rows for that game_pk. A high void rate that's fully explained by genuine
  scratches/DNPs is a sign the grader is being accurately conservative, not broken.

### Layer 5 — Calibration
- List all currently-active correction rows in `score.calibration_correction_map` (filtering out
  any methodology tagged as deactivated/superseded). For each one, confirm the sample size
  (`n_test_games` or equivalent) and the stated real-vs-baseline improvement are both genuinely
  present and plausible — not just that a row exists.
- For any prop that was evaluated but rejected (no active correction fitted), check that the
  rejection reason is a real statistical one (small held-out sample, near-zero or negative slope,
  no genuine held-out improvement over baseline) — a prop with a real, held-out-tested improvement
  that was inexplicably not applied is a red flag worth chasing.
- **Critical, real bug found tonight — verify a "deactivated" correction is actually excluded by
  the real filter the scoring engine uses, not just labeled as deactivated.** If the live filter
  is a simple substring match (e.g. `methodology LIKE '%some_tag%'`), a deactivation that merely
  *prefixes* the methodology string without removing or altering the matched substring will still
  pass the filter and keep silently applying live. Don't just check that a `DEACTIVATED_` prefix
  exists — check the *exact* filter condition the scoring code uses, and confirm the renamed
  methodology genuinely fails that specific condition. The correct pattern in this codebase is to
  rename the matched substring itself (e.g. `post_rootfix` → `ROOTFIXTAG_DEACTIVATED`), not just
  prepend a prefix.

### The single most important standing lesson for Delta scrutiny
**A completion check built from proxy signals (a static reference count, a staleness window) can
be satisfied even when the actual work never happened.** Before trusting any "this layer
completed" claim, ask: could this specific check have passed purely from evidence left over by a
*previous, unrelated* successful run, rather than genuine evidence produced by *this* run? If yes,
the check is not sufficient proof on its own — find the check that can only be satisfied by this
run's own fresh output (see Layer 2's `MAX(updated_at)`-per-entity method above).

---

## PART 3 — KNOWN FAILURE MODES (a running list — add to this every time a new one is found)

### Failure Mode 1 — reconciliation trusting a still-actively-writing batch
A background writer using `ctx.waitUntil` may still be genuinely writing rows after the calling
request has already timed out and returned. Reading the row count once and treating it as final
can catch a batch mid-write, silently truncating it. **Fix pattern**: require the row count to be
stable across two reads separated by a real wait (e.g. 4 seconds) before trusting it as final.

### Failure Mode 2 — reconciliation trusting a permanently-dead writer (distinct from Failure Mode 1)
A writer that has genuinely, permanently died mid-write (not slow — actually stopped forever) also
produces a stable, unchanging row count — indistinguishable from Failure Mode 1's fix by stability
alone. If rows are written in a specific sort order (e.g. PRIMARY tier before REVIEW tier), a
died-mid-write batch characteristically recovers as 100% one category and 0% of whatever would
have been written later in the sort order. **Fix pattern**: before trusting a stable count as
final, independently check what the real upstream data actually supports for each expected
category (e.g., query how many REVIEW-tier candidates genuinely exist upstream) — if a category
that clearly has real supply upstream is completely absent from the recovered set, refuse to
reconcile and force a fresh rebuild instead.

### Failure Mode 3 — Delta completion check satisfied by stale, not fresh, evidence
See Part 2, Layer 2 above. The fix is always the same shape: find the check that can only be
satisfied by evidence this specific run itself produced, not an aggregate/staleness proxy that a
prior run's leftover state could also satisfy.

### Failure Mode 4 — a "deactivated" calibration correction still silently applying
See Part 2, Layer 5 above. The fix is always: read the exact filter condition in the live scoring
code, and confirm the deactivation genuinely defeats that specific condition, not just that a
human-readable "deactivated" label exists somewhere.

### Failure Mode 5 — raw source-API field ambiguity silently corrupting a prop
A raw ingestion field can be genuinely ambiguous between two different real markets (e.g. a
source's `market_key` field being identical for both a full-game stat and a distinct partial-game
variant of the same stat). A heuristic built on a *different* field that happens to correlate with
the ambiguity (e.g. a specific line value) will be fragile if that field's value legitimately
overlaps between both real cases. **Fix pattern**: look for the source's own genuine
disambiguating field (often a human-readable label/description string) rather than building a
heuristic on a value that isn't actually unique to one case. When a user reports a concrete,
specific mismatch against what their own screen shows, trust the report and trace it to the raw
payload rather than defending the system's current output first.

### Failure Mode 6 — silent config/formula drift across a whole prop universe
A config-driven weight or formula can drift out of sync with the real code computing a value for
one or more entries in a large universe (props, sources, combos) without ever throwing an error —
the output is just silently wrong-but-plausible. This is invisible to spot-checking whichever
entry currently seems suspicious. **Fix pattern**: periodically diff the live config against the
actual formula/logic for the *entire* universe in one pass, not just the entry under investigation
— this is how three separate real formula bugs were found in a single night.

---

## PART 4 — GENERAL VERIFICATION DISCIPLINE (applies to both Master and Delta scrutiny)

- **Never accept a claimed column name, table name, or fix location without checking it exists
  exactly where the claim says it does.** A claim can be genuinely true while still being about a
  different table than your first assumption — verify the specific target, don't dismiss based on
  checking the wrong place first.
- **Never treat "the numbers matched the log" as sufficient proof of correctness.** A corrupted
  batch can still produce a row count that exactly matches what the log claims — the bug lives in
  the *composition* of those rows (tier, source, prop-type distribution), not just the count.
- **When something looks like a duplicate or an anomaly, verify whether it's a genuine bug or a
  legitimate real-world case before "fixing" it.** Cross-source offers of the same line, real
  doubleheaders, and genuine DNPs can all look like bugs at a glance and are not.
- **Wait for real propagation delays before re-checking.** Both DDL changes and Hyperdrive/connection-
  pool-fronted reads can show stale results for several seconds to tens of seconds after a write —
  don't conclude a fix failed without waiting and re-checking.
- **When a fix is deployed, confirm the actual deploy succeeded (check the real workflow run
  status) before testing against it** — a fix that looks correct in the diff but never actually
  deployed will produce a false "still broken" result that has nothing to do with the fix's
  correctness.
- **Distinguish "found a real bug" from "found a false alarm" explicitly and say so.** Not every
  anomaly traced during a scrutiny is a bug — some resolve into a fully-explained, correct
  mechanism once traced far enough (e.g., two different real numbers that happen to be numerically
  similar by coincidence, not causation). Chasing an anomaly to a real, verified explanation is
  just as much part of rigorous scrutiny as finding an actual bug, and prevents a false "fix" being
  applied to something that was never broken.

---

*This document should be treated as a living checklist — the next time a scrutiny pass finds a
real bug that isn't covered by an existing check above, add the check to this document in the
same session, following the pattern already established in `ALPHADOG_DOS_AND_DONTS.md`.*
