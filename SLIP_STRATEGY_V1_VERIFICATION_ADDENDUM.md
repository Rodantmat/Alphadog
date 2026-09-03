# SLIP STRATEGY V1 — VERIFICATION ADDENDUM
Date: 2026-09-03
Companion to: `SLIP_STRATEGY_V1_SPEC_AND_BLOCKERS.md`
Status: **Blockers 1 and 3 RESOLVED. Blockers 2, 4 remain. New blockers 5-7 added.**

---

## A. WHAT WRITES SLIPS TODAY — there is no slip-builder worker

Verified: **all 116 rows in `score.slip_entries` are `saved_by='main_ui'`, `status='saved_pending'`.**

| saved_by | status | entry_mode | rows | range |
|---|---|---|---|---|
| `main_ui` | `saved_pending` | power | 81 | 08-21 → 09-02 |
| `main_ui` | `saved_pending` | flex | 35 | 08-21 → 08-26 |

Slips are built **manually by Rodolfo in the Control Room UI**. The endpoint
`/api/slips/high-hit` generates candidates; the human presses save;
`alphadog-v2-certification-center.js` writes the row (INSERT at line 5657, plus
variants at 8353 and 11049).

**A slip-builder worker would be the FIRST autonomous writer to these tables.**
This is a design change, not an extension.

`slip_id` format: `makeUiId("slip")` → `slip_<base36 ts>_<16 random chars>`.

20-column insert contract:
`slip_id, source_key, slip_type, slip_size, structure_label, entry_mode,
selected_leg_count, estimated_hit_probability_0_100, estimated_multiplier,
real_multiplier, real_multiplier_flex_tiers, estimated_payout_note,
breakeven_hit_rate_0_100, edge_vs_breakeven_0_100, strategy_grade,
strategy_notes, status, entry_amount, saved_by, slip_json`

**Auto-grader requirement:** a prior bug left `player_id` and `official_date` NULL
on all 508 stored `slip_legs`, breaking grading until backfilled. **Any writer MUST
populate both.**

---

## B. BLOCKER 1 (baseline mismatch) — RESOLVED, config is clean

Confirmed by last-write timestamps:

| Table | Rows | Last write |
|---|---|---|
| `classification.baseline_current` | 163,848 | **2026-07-24 01:00:51** |
| `classification.baseline_v6_current` | 201,208 | **2026-09-03 05:41:34** |

41 days stale vs written this morning. The worker's `/health` self-report of
"DEAD/STALE as of 2026-08-14" is accurate.

**Resolution:** the deployed config (6 cells) uses **deep trailing, shallow
trailing, and final HP only — zero baseline dependency.** Deep and shallow trailing
are computed directly from `stats_hitter.game_logs` / `stats_pitcher.game_logs` and
`backtest.full_board_graded_v1`, both fully reproducible live.

`backtest.baseline_adjusted_v3` origin remains **UNKNOWN** but is now moot — nothing
in the config reads it.

---

## C. BLOCKER 3 (est_hp formula shift) — MEASURED, NOT A BLOCKER

A prior session claimed the 2026-09-02 `n_eff` baseline fix meant the model
"no longer emits >=90 at all." **Measured directly — that claim is overstated:**

| Era | n | avg HP | max HP | n >= 90 | % >= 80 |
|---|---|---|---|---|---|
| Pre-fix (<= 09-01) | 63,790 | 70.06 | 99.00 | 3,337 (5.2%) | 21.30% |
| Post-fix (>= 09-02) | 6,805 | 69.31 | 97.76 | **70 (1.0%)** | 21.34% |

The top tail thinned 5x. **Average and >=80 share are unchanged.** The distribution
did not rescale.

**And final HP is not load-bearing anyway.** Slip-ordering dependency test
(target5 min4, 33 slips):

| Order pool by | ROI | Profit | Bootstrap | CI floor |
|---|---|---|---|---|
| **final HP** | **+93.4%** | +$30.82 | 100.0% | +62.9% |
| own signal (no fhp) | **+83.7%** | +$27.63 | 100.0% | +47.2% |
| multiplier | +79.7% | +$26.31 | 100.0% | +43.1% |
| random | +82.4% | +$27.20 | 99.9% | +45.9% |

**The strategy survives with final HP removed entirely.** Ordering by each cell's
own signal yields +83.7% with bootstrap still 100%.

**DEPLOYMENT DECISION: order the pool by each cell's own signal, not final HP.**
Costs ~10 ROI points, removes all dependency on a formula that changed mid-window
and may change again. This also makes the config 100% baseline-free end to end.

---

## D. TIER FORMULA — live code MATCHES this spec exactly

Live function: `annotateGoblinDemonTier` in `alphadog-v2-score-final-board.js`, ~line 295:

```js
r.goblin_demon_tier = line === anchorLine ? 0 : Math.round(Math.abs(line - anchorLine))
```

**Identical to the backtest formula.** Two documented fixes:
- **2026-08-21** — tier was SIGNED, changed to unsigned absolute. Real failure cited:
  Chris Sale `pitcher_strikeouts`, ladder 4.5-11.5 around anchor 7.5, produced
  backwards tiers.
- **2026-08-23** — switch-point fallback extended to include Demon rows (was
  Goblin-only). On one board, 35 of 232 no-anchor groups resolved Goblin-only, and
  9 more resolved only once Demons were included.

**Pre-fix rows are still wrong in place. No backfill has been run.**

### The legacy-tier disagreement is a DIFFERENT SCHEME, not a bug

Decisive evidence, 57-round study, Henderson `pitcher_strikeouts`, standard = 5.5,
same player/prop/night:
- line **3.5** labelled **t1**, distance = 2.0
- line **4.5** labelled **t2**, distance = 1.0

**Labels run OPPOSITE to distance. Legacy tier is an ORDINAL RANK counting rungs
outward from the anchor, not a distance.**

This explains the `walks_allowed` 18-of-19 mismatch: lines 0.5 and 1.5 are each the
"first rung" in their own direction, so both are legacy tier 1, while the distance
scheme correctly gives 1 and 0.

**Consequence:** any multiplier keyed to legacy tier CANNOT be applied to
distance-tiers without a per-ladder remap, and for `pricing_layer2_tier` rows with
`line_value = 0` (null-coalesce bug) **no remap is possible at all.**

---

## E. FINAL BOARD IS WRITTEN AFTER TIER CUTS — backtest choice was correct

`annotateGoblinDemonTier` runs inside `alphadog-v2-score-final-board.js`;
`final_board_history` receives the POST-quota row set.

Measured consequence: **`goblin_demon_anchor_line` is populated on only 16.1% of
103,317 PrizePicks rows**, because the anchor fallback needs both a More and a Less
row present in the batch, and cut rows never arrive.

**The backtest's decision to compute tiers from the uncut raw board
(`archive.board_leg_history`) was correct and must be preserved in the live worker.**

---

## F. MORNING SNAPSHOT — one confirmed risk

Independent finding: pinning by time window rather than batch id, **26 of 29 days
resolve to morning (avg 9.3am PT), 2 to early-PM, 1 to late-PM.** Morning-first with
fallback matches live intent.

**CONFIRMED RISK: 6.9% of morning-snapshot legs had games already started**
(vs 28.3% for early-PM snapshots). **The live worker MUST exclude started games.**
The backtest did not apply this filter — it is a real, unquantified lookahead
component in the reported ROI.

Batch statuses — two of three names indicate post-hoc repair:
- `completed_final_board_current_replaced_from_hp_current` — clean
- `completed_final_board_history_reconciled_orphaned` — **repair, suspect**
- `completed_final_board_current_reconciled_after_timeout` — **repair, suspect**

**UNKNOWN whether reconciled batches backfilled rows the 9am system did not have.**
The backtest treated all three as equivalent. **This must be verified.**

---

## G. REMAINING BLOCKERS

| # | Blocker | Status |
|---|---|---|
| 1 | Baseline mismatch | **RESOLVED** — config is baseline-free (Section B, C) |
| 2 | Multipliers size-dependent (measured on 4-picks, config plays 5-picks) | **OPEN** — re-measure on real 5-picks |
| 3 | est_hp formula shift | **RESOLVED** — drop fhp from ordering (Section C) |
| 4 | Sample size 33-43 slips / 32 days, config selected in-sample | **OPEN** |
| **5** | **Started-game exclusion missing from backtest** (6.9% of legs) | **NEW, OPEN** |
| **6** | **Reconciled batches may contain post-hoc data** | **NEW, OPEN** |
| **7** | **`line_value=0` null-coalesce bug still writing** | **OPEN** — one-line fix |

---

## H. ENGINEERING CONSTRAINTS FOR THE WRITER

- `postgres.js` options are mandatory: `{ max: 3, fetch_types: false, prepare: false }`.
  Without `prepare:false`, real PostgreSQL errors surface as generic
  **"Network connection lost"**.
- Hyperdrive: 20-30s propagation after schema changes, 8-10s consistency lag after
  DDL/DELETE. Do not write then immediately read.
- Hyperdrive binding goes in `generate_wrangler_configs.py`'s special-case list.
  **Never hand-edit `.jsonc`** — the generator overwrites them every deploy.
- One SQL statement per bridge tool call. Multi-statement batches silently corrupt
  or drop tables.
- A shared orchestrator lock exists (the bridge's `BASE_HITTER_GAME_LOGS_WORKER`
  target is documented as bypassing `control_job_queue` and the shared lock).
  **Scope UNKNOWN** — determine whether a slip worker needs it.
- Concurrent sessions commit to this repo regularly. **Re-verify file state
  immediately before every patch.**
- When patching, never place a `${` sequence inside `new_str` — it terminates the
  template literal server-side, truncates the file, and duplicates content below the
  cut. This caused two file corruptions in a prior session.
- Backup convention: **UNKNOWN** which of `BACKUPS/` vs `backups/` is current.
  Both exist. Resolve before writing.

---

## I. REVISED DEPLOY CONFIG

Identical to `SLIP_STRATEGY_V1_SPEC_AND_BLOCKERS.md` Section 1, with two changes:

1. **Pool ordering: by each cell's own signal, NOT final HP.** Expected ROI +83.7%
   (down from +93.4%) in exchange for zero dependence on a shifting formula.
2. **Exclude any leg whose game has already started** at snapshot time. Not present
   in the backtest; will reduce realized ROI by an unmeasured amount.

Everything else stands: 6 cells, per-cell signals and caps, target 5 / min 4,
shrink-never-substitute on unavailability, **POWER** entry type.

**STILL NOT CLEARED TO DEPLOY.** Blockers 2, 4, 5, 6, 7 open.
