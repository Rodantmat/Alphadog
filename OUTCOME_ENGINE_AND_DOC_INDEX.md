# AlphaDog — Outcome Engine Deep Dive, and Master Index of All Documentation

This document has two purposes: (1) a genuine, code-level dissection of the outcome grading
engine, which did not previously have its own dedicated document, and (2) a master index of
every documentation file that exists in this repo as of 2026-08-22, so a future session can
find the right existing document instead of re-deriving something already written down.
Written directly from live code read this session (`alphadog-v2-outcome-grader.js`), not from
memory or inference.

---

## PART 1 — THE OUTCOME ENGINE (`alphadog-v2-outcome-grader.js`), full mechanics

### 1.1 Isolation design — why this worker is safe to run and re-run

The worker is explicitly, deliberately isolated by design (stated directly in its own header
comment): it only ever **reads** from `score.final_board_history`, `stats_hitter.game_logs`,
and `stats_pitcher.game_logs`, and only ever **writes** to `score.prop_outcome_history`. It
never touches `score.final_board_current`, `score.hp_board_current`, `classification.*`, or
any table read by the live scoring/board-serving path. This means a bug in this worker cannot
corrupt today's live board — its blast radius is limited to producing wrong or missing
calibration TRAINING data, which is itself checked downstream by a separate held-out
validation process before any calibration correction is ever applied. This is a real,
load-bearing safety property, not incidental — it's the reason this worker can be freely
re-run for a given date without risk.

### 1.2 What counts as "actual" — the objectively-computable prop expression maps

Every hitter and pitcher prop this engine can grade has a raw SQL expression mapping the
canonical prop key to a real, direct column (or simple arithmetic combination of columns) on
the game-log tables:

**Hitter props** (`stats_hitter.game_logs`, aliased `gl`):
```
runs → gl.runs
hits → gl.hits
walks → gl.walks
singles → gl.singles
rbis → gl.rbi
home_runs → gl.home_runs
stolen_bases → gl.stolen_bases
doubles → gl.doubles
triples → gl.triples
total_bases → gl.total_bases
hits_runs_rbis → (gl.hits + gl.runs + gl.rbi)
hitter_strikeouts → gl.strikeouts
fantasy_score → (3*singles + 5*doubles + 8*triples + 10*home_runs + 2*runs + 2*rbi + 2*walks + 5*stolen_bases)
```

**Pitcher props** (`stats_pitcher.game_logs`, aliased `gl`):
```
pitcher_strikeouts → gl.strikeouts
walks_allowed → gl.walks_allowed
hits_allowed → gl.hits_allowed
earned_runs → gl.earned_runs
runs_allowed → gl.runs_allowed
pitcher_outs → gl.outs_recorded
pitcher_fantasy_score_ud → (outs_recorded + 3*strikeouts - 3*earned_runs + 5*wins + 5*(quality-start-like bonus: outs_recorded>=18 AND earned_runs<=3))
```

**Explicitly, permanently excluded from this expression-based path**: `rfi_nrfi` (no
play-by-play/situational data exists in the game-log tables to compute it this way — it has
its own entirely separate grading function, see 1.5). **Known, explicitly-flagged gap**: the
plain `pitcher_fantasy_score` formula (as opposed to the `_ud` variant) is listed in the
worker's own `known_gaps` field as "not yet validated against a confirmed scoring spec" — this
is a real, self-reported uncertainty in the live code, not something this session invented.

### 1.3 The grading query — deduplication, join structure, and two real historical bugs fixed
in it

The core query for a given date and prop set:
1. Deduplicates `score.final_board_history` rows to one per
   `(mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon)`,
   taking the latest (`created_at DESC`) row within that key, restricted to
   `board_tier IN ('PRIMARY','REVIEW')`.
2. LEFT JOINs the relevant game-log table on `(player_id, game_date, game_pk)`.
3. LEFT JOINs a lateral subquery against `team.game_logs` to determine `is_final` (whether the
   game has genuinely concluded, via the raw MLB API's `abstractGameState` field).
4. LEFT JOINs the existing `score.prop_outcome_history` to detect whether this exact leg has
   already been finally graded (`outcome_id LIKE 'outcome_final|%'`), to make re-runs
   idempotent rather than duplicating work.
5. Computes `is_hit` via: `NULL` if actual value exactly equals the line (a genuine push/tie);
   otherwise `actual > line` for `more`, `actual < line` for `less`.
6. Only keeps rows where either a real actual value was found OR the game is confirmed final
   (this second condition is what allows a genuine DNP — no game-log row at all — to still be
   captured as a push rather than silently vanishing).

**Real historical bug #1 (fixed 2026-08-11)**: the game-log join used to be an INNER JOIN.
Any player with zero matching game-log rows for the date (a rest day, an unused bullpen arm,
etc.) would silently vanish from the candidate set entirely — never graded, never stored,
permanently stuck as an invisible "ungraded" leg rather than the genuine push/void it actually
was. Confirmed via real research to have affected multiple real players. Fixed by switching to
LEFT JOIN plus the `is_final` check described above.

**Real historical bug #2 (fixed 2026-08-17)**: the `DISTINCT ON` deduplication key did not
originally include `is_goblin`/`is_demon`. Whenever a Goblin (or Demon) row shared the exact
same `(player, prop, line, side)` as the standard variant — a real, common occurrence, since
Goblin/Demon variants are alternate lines that can coincide with a standard line under certain
board conditions — the dedup silently collapsed them into one row, and the OTHER variant's
outcome was never created at all, not even as a placeholder. **Confirmed live with a specific
real example**: Ronald Acuña Jr.'s `total_bases|less|3.5` Goblin row had zero outcome rows
whatsoever, while the identical-line standard row graded fine, because the two collided in
this exact dedup key before the fix. This is directly relevant to this session's own Part 3
findings about goblin/demon data quality — it is a separate, distinct bug from the rounding
issue and the `is_under_allowed` contamination issue, affecting a different stage of the
pipeline (outcome grading, not tier classification), and it was fixed over a month before this
session's work, so should not currently be affecting fresh data — but any HISTORICAL data
graded before 2026-08-17 could still carry this gap.

### 1.4 Push/tie/DNP handling and enrichment-signal passthrough

Three real outcome states are distinguished, not just hit/miss:
- **`push_dnp`**: `actual_value IS NULL` — the player has no game-log row for this game at
  all (this is exactly the class of leg the coworker log's DNP/void investigation, documented
  in the main session log Part 4.1.3, is concerned with).
- **`push_tie`**: `actual_value` exactly equals `line_value` — a genuine tie against the line.
- **`hit` / `miss`**: everything else, per the `is_hit` computation in 1.3.

Both push types are stored with `outcome_hit = NULL` (neither counted as a hit nor a miss),
distinguishing them from a genuine miss for any downstream hit-rate calculation that correctly
filters on `outcome_hit IS NOT NULL` — which is what every real backtest in this session's Part
3 does. **This means the ~7% DNP-void rate documented in Part 4.1.3 is likely already being
excluded from hit-rate denominators correctly at the outcome-grading level** — the real,
unmodeled gap is specifically in the SLIP-level backtest simulations (which don't know that a
real slip containing a DNP leg gets void-repriced to N-1 by the sportsbook), not in the
underlying per-leg hit-rate statistics themselves. This is a meaningfully different, more
precise statement of the gap than what appears in Part 4.1.3 alone, and is worth carrying
forward.

The engine also extracts and passes through an `enrichment_rate_multiplier` /
`enrichment_factors_applied` / `enrichment_factors_missing` triplet from the board row's
`calibration_json.hp_calibration_json`, defensively handling the case where
`calibration_json` arrives as either a native object or a JSON string (a mirror of a
previously-fixed bug in `score-final-board.js`'s own JSON parsing, referenced directly in this
worker's code as `extractEnrichmentSignal`). This is stored alongside the outcome so that a
future calibration audit can directly see, per graded leg, how much enrichment adjustment was
actually applied versus how much of the potential enrichment signal was missing for that leg —
this is a real, already-existing hook for exactly the kind of enrichment-factor audit that
`CORE_LOGIC_CALIBRATION_DOSSIER.md` explicitly flags as its own "known gap, not yet extracted
with code-level rigor" (see that document's §9). A future session doing that enrichment
deep-dive should start from this stored signal rather than trying to reverse-engineer
enrichment effects purely from HP values.

### 1.5 RFI/NRFI — a structurally separate grading path

`rfi_nrfi` cannot be graded via the generic expression-map mechanism because no play-by-play or
first-inning-specific data exists in the standard game-log tables. It has its own dedicated
function (`gradeRfiNrfiForDate`), joining instead to `context.first_inning_pitcher`
(specifically its `rfi_sl_more_hit` / `rfi_sl_less_hit` columns, precomputed elsewhere from
real MLB linescore data). This data source was itself only wired up starting 2026-08-07 — the
worker's own comment states this explicitly: prior to that date, RFI/NRFI had **no working
outcome-grading path at all**, which was traced (in a prior session, referenced here for
completeness) as the root cause of that prop's broken calibration. Before 2026-08-07, `rfi_nrfi`
predictions were being scored and served on the live board with no possible way to ever
validate or calibrate them against real outcomes.

### 1.6 Idempotency and chunking

Inserts use `ON CONFLICT (outcome_id) DO UPDATE` (for the main expression-based path, updating
only the three enrichment-signal columns on conflict) or `DO NOTHING` (for the RFI/NRFI path),
in chunks of 150 rows per insert statement. `outcome_id` is a deterministic string built from
`entity_type`, `player_id`, `prop_key`, `line_value` (with `.` replaced by `p`), `side`,
a goblin/demon/standard tag (`gob`/`dem`/`std`), and the target date — meaning the same real
leg graded twice on the same date always produces the same ID and safely no-ops or
soft-updates rather than duplicating. This is what makes the worker safe to trigger multiple
times for the same date, which matters because the worker's own scheduled cron trigger was
found to be unreliable (see 1.7) and needed a manual/orchestrated invocation path anyway.

### 1.7 Scheduling reality — a real, deliberate no-op

The worker's own `scheduled()` handler is a **deliberate no-op**, with an explicit comment
explaining why: an earlier attempt to retire this worker's cron trigger at the
Cloudflare/wrangler level (setting a "never fires" Feb-30th cron expression) did not reliably
stop the platform's existing live trigger from firing — confirmed to have fired again despite
that fix being deployed, twice. Rather than continuing to fight the platform's trigger
persistence, the handler itself was made a guaranteed no-op: if the old cron fires anyway, it
now just logs the fact and does nothing, rather than performing a redundant, ungoverned grading
run outside the intended orchestration. The REAL grading trigger is the Cowork morning-delta
supervisor's "Layer 4," which calls this worker's `/run` endpoint directly. **This is a
concrete, real example of the same class of scheduling unreliability documented more generally
in the main session log's Part 7** (batches firing on an inconsistent real-world schedule) —
here traced to a specific, named root cause (Cloudflare cron-trigger persistence surviving a
source-level retirement attempt) rather than left as an unexplained observation.

---

## PART 2 — MASTER INDEX OF ALL EXISTING DOCUMENTATION (repo root + `control/`, as of this
session)

This index exists so a future session facing a "have we already documented X" question can
check here first, in one place, rather than searching transcripts or guessing. Sizes are as of
this session; several of these files grow over time and should be re-checked for current size.

| File | Size | What it actually covers (verified this session where noted) |
|---|---|---|
| `SESSION_2026-08-22_FULL_LOG.md` | ~77KB | **(This session's own companion document.)** Complete, chronological log of everything done in this specific chat: Underdog pricing investigation, the full Goblin/Demon tier mechanism investigation and every correction within it, the critical rounding bug, consolidated multiplier facts, database structural facts, and all open items. |
| `OUTCOME_ENGINE_AND_DOC_INDEX.md` | (this file) | Outcome-grading engine code-level dissection (Part 1 above) plus this index (Part 2). |
| `control/daily_slip_research_log.md` | ~249KB | The autonomous Coworker agent's own continuously-growing daily research log. Contains its own dated sessions with internal corrections/retractions. Fully consolidated and cross-referenced into `SESSION_2026-08-22_FULL_LOG.md` Part 4 this session — read that consolidation first; only go to the raw 249KB file for verbatim quotes or dates/sections not covered there. |
| `MULTIPLIER_TABLES_MASTER.md` | ~21KB | The long-standing master reference for real per-leg multiplier ratios across all apps. **As of this session, several of its figures are superseded** by fresher measurements in the coworker log and this session's own work (notably the Underdog flat-vs-geometric correction and the Goblin ratio's continued decay to ~0.620) — see `SESSION_2026-08-22_FULL_LOG.md` Part 6 for the current, reconciled numbers before trusting this file's numbers at face value. |
| `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` | ~8KB | The tier/type mechanism explanation. Consistent with, and the likely original source of, the mechanism re-confirmed in this session's Part 3.1 — should be re-read alongside `SESSION_2026-08-22_FULL_LOG.md` Part 3 for the rounding-bug correction, which this file likely predates. |
| `GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md` | ~14KB | A dedicated dossier on real goblin/demon multiplier observations — likely overlaps significantly with `control.goblin_demon_multiplier_study` (the live DB table used extensively this session, e.g. for the "Demon negative at every real multiplier including 62x" finding). Not read in full this session; flagged for a future cross-check against the live table to ensure the two haven't diverged. |
| `THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md` | ~12KB | A second, apparently competing multiplier dossier — the coworker log explicitly found this one and `MULTIPLIER_TABLES_MASTER.md` disagreeing on the Sleeper per-leg ratio (1.2684 vs. 1.638) and resolved it in favor of ~1.628-1.638 based on fresh real data. Treat this file's numbers as secondary to the reconciled table in `SESSION_2026-08-22_FULL_LOG.md` Part 6. |
| `SIGNALS_TECHNIQUES_TRIED.md` | ~54KB | A history of every signal/technique attempted, including ones rejected. Directly referenced this session for confirming that 2026-08-11 is a known, previously-flagged outlier day (the `runs+singles<0.5` rejection) — the same day that later turned out to be driving the original locked Demon config's entire apparent edge (coworker log 4.1.2). Worth checking before proposing any "new" signal, since it may already be documented here as tried and rejected. |
| `HIGH_HIT_RATE_METHODOLOGY.md` | ~22KB | Methodology rules for the High-Hit-Rate slip system, including Rules B0b (per-leg pricing, never blended averages) and B0c (tie-break sensitivity reporting) referenced in this session's Part 1.5. |
| `CORE_LOGIC_CALIBRATION_DOSSIER.md` | ~12KB | **Read in full this session.** A genuinely rigorous, code-verified dissection of the core HP-calibration logic: overdispersion correction for count props, the sample-support Wilson-interval clamp (n=30 threshold, exists in two code paths), the five recency-weighting profiles (A-E) and their `prior_strength_multiplier` values, the Hierarchical Empirical Bayes shrinkage formula and its "locked HEB contract" (n≥20 and >15pt gap from prior forces the prior's weight below 25%), sample-size reliability tiers (distinct from player-skill tiers), the separate/parallel expansion-prop prior-strength and hard-cap tables, player classification tiers and a real cross-side platoon-tier bug that was fixed, and two read-only diagnostic safeguards (calibration coverage-gap check, role-discontinuity check). **This document explicitly, honestly flags its own gap**: the separate enrichment-factor layer (umpire, weather, quality-of-contact, bullpen availability, opposing-pitcher-quality lift/penalty multipliers) was NOT extracted with the same code-level rigor — a future session doing enrichment-factor work should treat that as a real, open task, not assume this document already covers it. |
| `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md` | ~33KB | Not read in full this session — by name, likely the design document for how individual factors get classified/weighted before calibration. Should be the first stop for the enrichment-factor deep-dive that `CORE_LOGIC_CALIBRATION_DOSSIER.md` flags as missing. |
| `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` | ~16KB | Not read this session — by name, likely covers the "quality-of-contact" enrichment factor specifically referenced as unexamined in `CORE_LOGIC_CALIBRATION_DOSSIER.md` §9. |
| `ALPHADOG_SYSTEM_MAP.md` | ~110KB | Not read this session — by name and size, likely the broadest architectural map of the whole system (all workers, all data flow). Should be the first stop for any question about which worker does what, before searching individual worker source files. |
| `ALPHADOG_HANDOFF.md` | ~52KB | Not read this session. |
| `ALPHADOG_DOS_AND_DONTS.md` | ~120KB | Not read this session — by name, likely a large accumulated list of hard-won operational rules. Worth checking before repeating a mistake that may already be documented here. |
| `HANDOFF_MASTER_SUMMARY.md` | ~208KB | Not read this session. |
| `LIVING_LOG.md` | ~153KB | Not read this session — by name, possibly an older or parallel running log to the coworker's `daily_slip_research_log.md`; worth a future session checking whether these two logs overlap, conflict, or cover genuinely different periods. |
| `MASTER_DELTA_SCRUTINY_GUIDE.md` | ~22KB | Not read this session. |
| `claude-work-log.md` | ~188KB | Not read this session — by name, possibly a prior running log similar in spirit to this session's own `SESSION_2026-08-22_FULL_LOG.md`. Worth checking for continuity/format precedent before this document's structure is treated as a new invention.
| `COWORKER_DAILY_SLIP_RESEARCH_PROMPT.md` | ~28KB | The standing instruction set the autonomous Coworker agent operates under. Referenced and partially quoted in this session's Part 1.4 (autonomy rule, pricing-table precedence, historical tier-reconstruction note). |

### 2.1 Honest gaps in this index

Several large, real documents (`ALPHADOG_SYSTEM_MAP.md`, `ALPHADOG_HANDOFF.md`,
`ALPHADOG_DOS_AND_DONTS.md`, `HANDOFF_MASTER_SUMMARY.md`, `LIVING_LOG.md`,
`MASTER_DELTA_SCRUTINY_GUIDE.md`, `claude-work-log.md`, `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md`,
`QUALITY_OF_CONTACT_METRICS_EXPANSION.md`) were **not read in full this session** — they are
listed above by name and size only, with a best-guess description based on their filename,
because reading all of them in the same depth as the calibration dossier and the outcome
grader would have required substantially more time than this session had available after the
extensive Goblin/Demon investigation. This is stated plainly rather than papered over: **a
truly complete documentation catalog, to the standard applied to Parts 1 and to the
Goblin/Demon investigation in the companion log, would require a dedicated future pass reading
each of these nine files in full and either summarizing them here or confirming they're
already superseded.** This index should be treated as a map of where to look, not a substitute
for reading the underlying file when its specific content actually matters to a task.

---

*End of document. Extend Part 2's table as new documentation is created or as the "not read
this session" files are eventually read in full and can be upgraded to a verified summary.*
