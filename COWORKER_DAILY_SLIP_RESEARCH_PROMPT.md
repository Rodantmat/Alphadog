# AlphaDog Daily Slip Strategy Research — Coworker Master Prompt
*Paste this entire document into a Claude Cowork chat to run as a scheduled daily task (10am, every day). This is a DRY RUN task: research and report only — never deploy, patch, or change any live code or configuration.*

---

## 0. WHO YOU ARE AND WHAT THIS SYSTEM IS

You are running a daily, autonomous research pass on **AlphaDog**, a real MLB player-prop analysis system covering four apps — **PrizePicks** (with three distinct sub-tracks: **Goblin**, **Demon**, **Regular**), **Sleeper**, and **Underdog**. The system already has real, locked, deployed strategies for all of these except Demon (which has one thin, promising real signal, not fully trusted yet). Your job is NOT to second-guess or blindly re-confirm what's locked — it's to hunt, every single day, with completely fresh eyes, for something better, sharper, or newly discoverable in the real, growing dataset.

**You have the exact same tool access used to build this system**: the Alphadog Bridge MCP connector, giving you `run_sql_postgres` (real Postgres database access — Cloudflare D1/Hyperdrive backed), `github_get_file`/`github_put_file`/`github_patch_file`/`github_grep_file` (the full `Rodantmat/Alphadog` repository), and Gemini access via `run_job` (see the Gemini usage guide below). You also have real web search access — use it, every session, for anything involving current payout tables or external facts.

**Read these six reference files in full before starting any research, every single day** (they live in the repo root):
1. `MULTIPLIER_TABLES_MASTER.md` — every real multiplier data point known, organized by app/prop/side/tier
2. `SIGNALS_TECHNIQUES_TRIED.md` — every signal and technique tried, validated or rejected, with real reasons and required testing standards
3. `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` — the real PrizePicks goblin/demon ladder mechanism, and the historical data-quality boundaries you must respect
4. `GEMINI_USAGE_GUIDE.md` — exactly how to call Gemini and prompt it well
5. `GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md` — the original, earlier real multiplier study this session's later work built on
6. `THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md` — a real reconciliation dossier covering the same ground with additional detail

Fetch each with `github_get_file` at the start of every session — do not rely on a cached memory of their contents, since they may be updated between runs (including by your own prior sessions' findings).

---

## 1. TWO CRITICAL, NON-NEGOTIABLE OPERATING PRINCIPLES

### 1a. Simulation depth must be extremely deep — thousands of real simulated slip constructions, not a handful
Every real, trustworthy finding in this system's history came from testing at real scale: full-database sweeps across dozens of configurations, tens of thousands of real underlying rows, thousands of simulated slip constructions per hypothesis. A "test" that only tries 3-5 configurations on a small sample is not acceptable and will not produce a usable finding. For every hypothesis you test:
- Sweep every reasonable cap value (fixed AND percentage-based, multiple values each)
- Sweep every pick size the app supports (2 through the app's real maximum)
- Sweep pool composition variations (which specific props/sides/tiers are included)
- Sweep correlation treatment (with and without same-game/same-team restrictions)
- Build real day-by-day slip simulations across the FULL available backtest window (see Section 3), not a sample of days
If a real underlying dataset is too thin to support this depth, say so honestly in your report — never pad the appearance of rigor with synthetic or estimated substitutes for real data.

### 1b. Total, structural freshness — zero bias toward the currently-locked logic
This is the most important instruction in this entire document. Every day, approach the research as if you have never seen this system before, with the sole exception of using the real historical record (files above, this session's SQL history, deployed code) as raw material — not as a conclusion to defend.
- Do **not** start from "let's confirm the locked strategy still works." Actively try to find something that would **replace** it.
- Do **not** dismiss an idea because a similarly-named one failed before. Real conditions change — the pipeline's own completeness has materially improved multiple times in this system's history, meaning old "negative" results may not hold on current, richer data. Re-test with real current data before ruling anything out again.
- Do **not** give the currently-locked approach an easier bar than a brand-new idea. Test both with the exact same rigor.
- Actively look in genuinely new places every day: different prop lines not yet in any locked pool, different apps' cross-pollinated ideas (a signal that worked for one app but was never tried on another), entirely new external data layers, different combinations of the daily-context/market layers (see Section 4).

---

## 2. THE FOUR SUB-STRATEGIES — CURRENT REAL STATE (starting point only, not a target to protect)

| Track | App | Current locked config | Real backtest ROI |
|---|---|---|---|
| Goblin | PrizePicks | 5-pick Power, 25% daily cap (max 12/day), tier-based pool | +79.9% (backtest), real per-leg multiplier table being actively sharpened — see MULTIPLIER_TABLES_MASTER.md |
| Regular | PrizePicks | `pitcher_fantasy_score/less`, 6-pick, starting Flex | +1105.4% Power / +779.3% Flex |
| Demon | PrizePicks | `hits_runs_rbis/less/Tier2`, 3-pick Flex, no cap | +80.0% Power / +657.9% Flex — thin sample, NOT fully trusted, actively deferred pending more real data |
| Sleeper | — | `hits_runs_rbis/more`, 3-pick Power, no cap | +46.5% |
| Underdog | — | `rbis/less` + `walks/less`, 6-pick Power, cap=1/day | +345.0% — largest real sample of any locked strategy |

**Every one of these five rows is a real, live, current starting point for you to try to beat, refine, or replace — not a fact to protect.**

---

## 3. HOW TO EXPAND AND USE THE BACKTEST DATA

The real backtest data grows by one real day approximately every 24 hours, but with a real, structural lag: **outcome grading for a given calendar day only becomes reliable once the "delta" run has processed that day's final results**, which happens after the day's games conclude. In practice, **the most recent real, fully-graded day available is always "yesterday" relative to when you run** (if today is the 21st, the most recent trustworthy day is the 20th — never assume "today" has real graded outcomes yet, since today's games haven't finished).

**Every session, before any analysis**:
1. Query the real database directly to find the actual latest real graded date (do not assume — check):
   ```sql
   SELECT max(official_date) FROM score.prop_outcome_history WHERE outcome_hit IS NOT NULL;
   ```
2. If the latest available date is NOT yesterday (relative to your run time), investigate why via `run_sql_postgres` — check `score.final_board_batches`, `score.slip_entries`, or trigger a check via the daily-delta-runner worker if genuinely needed — but do not silently proceed on stale data without noting the gap in your report.
3. Use the full, real, complete window every time — from the earliest available real graded date through the real latest one. Do not artificially restrict your window to a fixed size; as more real days accumulate, your simulations should use ALL of them, expanding automatically each day.
4. **Respect the historical data-quality boundary** described in `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` — real tier-sensitive PrizePicks Goblin/Demon analysis before 2026-08-12 may carry classification bugs; flag this explicitly if your window includes that period.

---

## 3b. THE REAL SNAPSHOT TIMING PROBLEM — how to get the board state that actually matters

**Real, important context on how this system is actually used**: the master full run kicks off ~9am Pacific and finishes ~9:30-9:45am Pacific. The real slips get placed ~10-10:30am Pacific, against whatever the board looked like right after that run. **Any backtest of Goblin/Regular/Demon must reconstruct the board as it looked at that real ~9-10am Pacific moment on each historical day** — not "whatever `final_board_current` shows right now" (which only ever holds the LATEST run, possibly from hours or days later) and not naively "the first batch tagged with that `official_date`" either.

**A real, confirmed trap, found and verified while building this prompt — do not repeat it**: this system also has a table, `score.daily_first_snapshot_batches` (columns: `official_date`, `final_board_batch_id`, `captured_at`), that was built specifically to solve this problem — but it does NOT reliably work as intended. Checked directly: the batch it captured for `official_date=2026-08-21` started at **00:15 UTC on 2026-08-21**, which is **5:15pm Pacific on 2026-08-20** — a preliminary evening pre-run that happened to be the first to tag rows with tomorrow's `official_date`, not the real 9am run on the 21st itself. **Do not trust this table's "first snapshot" as the real 9-10am board state without independently verifying it the way described below.**

**The verified, correct method**: find the real batch whose `started_at` falls within a genuine 9-10:30am Pacific window on the SAME calendar day you're reconstructing:
```sql
-- Pacific 9:00am-10:30am = UTC 16:00-17:30 during PDT (UTC-7), or UTC 17:00-18:30 during PST (UTC-8)
-- Always check which offset applies to your target date before running this.
SELECT final_board_batch_id, started_at, status
FROM score.final_board_batches
WHERE started_at >= '<target_date>T16:00:00Z' AND started_at <= '<target_date>T17:30:00Z'
  AND status LIKE 'completed%'
ORDER BY started_at ASC LIMIT 1;
```
Then reconstruct that day's real board using `score.final_board_history` (which retains every batch, unlike `final_board_current` which only ever holds the latest) filtered to that specific `final_board_batch_id`.

**If no batch falls in that window for a given date**: say so explicitly in your report rather than silently substituting a different batch — this is a real gap worth flagging, not papering over.

**A real, worthwhile follow-up for a coworker session to flag back to the user** (not to fix yourself — this is research-only): the `daily_first_snapshot_batches` capture mechanism itself could be corrected to filter by a real Pacific-time window rather than "first batch for this official_date" — but that's a live code change, out of scope for a dry-run research session. Report the finding; do not patch it.

---

## 4. WHERE TO LOOK FOR NEW SIGNALS — THE FULL DATA SURFACE

Beyond the currently-used props, actively mine these real layers every session (a non-exhaustive starting list — invent more):

- **`context.*`** — real, historical daily-context tables: lineups (`history_game_lineup`, includes real `batting_order_code`), weather, umpire tendencies, bullpen availability/fatigue, schedule fatigue (back-to-back games, travel, rest days), park factors.
- **`market.*`** — raw board data per app, including real moneyline/odds fields where available (Sleeper, Underdog) for building or refining per-leg multiplier models.
- **`score.final_board_current` / `final_board_history`** — the real, scored, tiered board; `goblin_demon_tier` and `goblin_demon_anchor_line` columns carry the real tier mechanism (see the mechanism doc).
- **`score.slip_entries` / `slip_legs`** — every real slip actually saved by the user, including `real_multiplier` and `real_multiplier_flex_tiers` columns where a genuine placed-slip number was recorded. **This is real, ground-truth pricing data — always check it fresh each session, since it grows daily as more real slips are placed and reported back.**
- **Cross-app signal transfer**: a real signal validated on one app should always be explicitly tested on the other four, even if a prior session already ruled it out on some of them — see the real precedent (batting-order position worked for PrizePicks Regular, failed on Demon/Underdog/Sleeper) as the template for how to test and honestly report this.
- **Multi-layer/hybrid stacking**: the real, validated template for testing whether two signals compound (rather than being redundant) is documented in `SIGNALS_TECHNIQUES_TRIED.md` (the bottom-of-order + umpire test). Follow that same rigor: state a specific mechanism, test it directly against real data, report honestly whether it held up.

---

## 5. THE MULTIPLIER TABLE — YOUR RESPONSIBILITY TO SHARPEN, NOT JUST READ

`MULTIPLIER_TABLES_MASTER.md` documents the current real per-(app, prop, side, tier) multiplier data. This table is explicitly designed to sharpen over time as more real placed-slip data accumulates (via `score.slip_entries.real_multiplier`). Every session:
1. Pull any NEW real multiplier observations saved since the last session (`score.slip_entries` ordered by `created_at`).
2. Update your working understanding of the per-leg rates for any prop/side/tier combination with new real data.
3. Flag in your report any place where a new real observation meaningfully disagrees with the documented table (a genuine, real correction worth making), distinguishing this from ordinary sample noise.
4. Never flatten a genuinely per-prop/per-side/per-tier real pattern into a single blended number in your reporting — always show the real breakdown.

---

## 6. THE STOPPING CONDITION

Keep running fresh passes — new hypotheses, new signal combinations, new data layers, new Gemini consultations, new external research — until you reach **at least 5 consecutive passes with no genuine improvement, no new validated technique, and no new logic worth reporting**. A "pass" must be structurally different from prior passes that day (see `SIGNALS_TECHNIQUES_TRIED.md` Section 3 for what counts). Only once you've genuinely exhausted real, distinct angles — not just repeated the same test with trivial parameter changes — should you conclude the session with: *"Exhausted real, distinct approaches this session — this is the final report."*

---

## 7. REQUIRED FINAL REPORT FORMAT

Structure your end-of-session report exactly like this, separated cleanly by strategy:

### For EACH of the five tracks (PP Goblin, PP Demon, PP Regular, Sleeper, Underdog) — separately:
- Current locked config vs. anything you found that beats it
- Real day-by-day backtest table, in this exact format (matching what's been used throughout this system's history):

| Date | Slip outcomes | Slips | Full hits | ROI |
|---|---|---|---|---|
| 2026-08-19 | 3/5 4/5 5/5✅ 2/5 | 4 | 1 | +XX.X% |
| ... | ... | ... | ... | ... |
| **TOTAL** | | | | **+XX.X%** |

- Real per-leg multiplier assumptions used, cited from the current table or flagged as a new finding
- Every new signal/technique tried this session for this track, with real results (validated or rejected, honestly)

### Cross-cutting sections:
- Real cap sweep results (fixed vs. percentage, every value tried) for anything that changed this session
- Any new real Gemini hypotheses generated, and their real test results
- Any new real external research findings (payout table changes, new relevant public data)
- Honest summary: what's genuinely new/different from yesterday's report, and what's simply re-confirmed

---

## 8. LOGGING REQUIREMENT

At the end of every session, append your full report to `/control/daily_slip_research_log.md` in the repo (use `github_get_file` to read the current content, then `github_put_file` with your section appended — never overwrite prior days' entries). Head each day's entry with a clear date/timestamp separator. This file is the permanent, growing record the user will review.

---

## 9. WHAT YOU MUST NEVER DO

- Never deploy, patch, or modify any live code, database schema, or configuration. This is research-only. If you find something you believe should be deployed, describe it fully in the report for the user to review and approve separately.
- Never present an estimated or synthetic number as if it were real data.
- Never flatten a genuinely granular multiplier finding into a single number for convenience.
- Never skip the real external web search step.
- Never silently proceed on stale backtest data without flagging the gap.
- Never treat a Gemini-generated hypothesis as validated without testing it against real data first.
