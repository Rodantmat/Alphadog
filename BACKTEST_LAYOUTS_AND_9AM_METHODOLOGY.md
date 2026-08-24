# Backtest Study Layouts — Standard Reference

This file defines the exact table layouts to use whenever a hit-rate, ROI/profit, or cap-test
study is requested for any prop line. Reuse these formats without re-deriving them. Also defines
the validated methodology for extracting the real 9am "morning produce" board snapshot, which is
the snapshot used for placing real slips and must be used for any ROI/profit study unless a
different snapshot is explicitly requested.

---

## Layout 1 — Hit rate table (all prop lines)

Used when asked for a general hit-rate breakdown across prop lines.

| Prop | Side | n | Days | Hit rate |
|---|---|---|---|---|
| pitcher_strikeouts | less | 52 | 13 | 48.1% |

Columns: prop line, side (more/less), total leg count, distinct days represented, real hit rate.
Sort descending by hit rate. Bold the row(s) worth calling out as a standout finding.

---

## Layout 2 — ROI/profit summary by slip size and mode

Used when asked for a "ROI and profit study" across pick sizes (2/3/4/5/6), Power and Flex.

| Size | Mode | Slips | Full hits | Total ROI |
|------|------|-------|-----------|-----------|
| 2-pick | Power | 349 | 290 | +13.9% |
| 2-pick | Flex | 349 | 290 | +15.0% |

Columns: slip size, Power or Flex, total number of slips built across the whole backtest window,
number of those slips that hit ALL legs (full hits — same figure shown for both Power and Flex rows
since it's the same underlying slips, only the payout table differs), total ROI for that mode.
One row per (size, mode) combination, Power immediately followed by Flex for the same size.

---

## Layout 3 — Day-by-day backtest

Used when asked for a "day by day backtest" for a specific size/mode (or as a supporting detail
table under Layout 2).

| Date | Slips | Full hits | Staked | Return | Profit | ROI |
|------|-------|-----------|--------|--------|--------|-----|
| 08-06 | 6 | 4 | $6 | $8.78 | $2.78 | +46.3% |

Columns: date (MM-DD), number of slips placed that day, number of those slips with a full hit,
total staked (1 unit = $1 per slip), total return (stake back + payout on wins), profit
(return - staked), ROI for that day. Final row is bold **TOTAL** summing every column and computing
aggregate ROI from the totals (not an average of daily ROIs).

---

## Layout 4 — Cap testing (fixed and percentage)

Used when asked to test staking/exposure caps.

| Cap | Slips | Staked | Return | Profit | ROI |
|-----|-------|--------|--------|--------|-----|
| 1/day | 15 | $15 | $24.60 | $9.60 | +64.0% |
| 2/day | 30 | $30 | $49.19 | $19.19 | +64.0% |
| **No cap** | **108** | **$108** | **$188.35** | **$80.35** | **+74.4%** |
| 10% | 15 | $15 | $24.60 | $9.60 | +64.0% |
| **25%** | **23** | **$23** | **$40.90** | **$17.90** | **+77.8%** |

Fixed caps (1/day, 2/day, 3/day, 5/day, 10/day, No cap) listed first, then percentage caps (10%,
25%, 50%) below. Bold the "No cap" row and whichever single cap row represents the best real
ROI/volume tradeoff worth highlighting.

---

## 9am Snapshot Extraction Methodology (corrected 2026-08-24)

**CORRECTED 2026-08-24, same day**: a real, existing, already-validated table
`backtest.nine_am_batches` (day, batch_id, started_at) was built in a prior session (2026-08-20)
and already solves this correctly — check for and use it FIRST before reconstructing anything.
It selects exactly ONE canonical batch_id per real day (not a multi-batch cluster). Join board
legs by `final_board_batch_id = batch_id` directly; do not additionally filter by matching
`official_date` to the batch's `day` — a single morning batch can legitimately carry legs for
more than one game date. The cluster-based reconstruction originally documented below undercounted
real legs on multiple real dates and should not be used when this table is available. Real,
measured coverage: 20 calendar days (2026-07-24 to 2026-08-18 in the current build).

### Superseded (original) methodology below — kept for context only, do not use

**Why this matters**: `score.final_board_history` accumulates MULTIPLE real batches per day as the
board gets rebuilt/expanded throughout the day (typically a morning run, then a larger midday run,
then a still-larger evening run). Any ROI/profit study must use only the morning "produce" snapshot
— the one actually available when slips get placed — not the full accumulated end-of-day board,
which would leak same-day future information into the backtest.

**The real, confirmed pattern**: the morning run is genuinely thin relative to later runs (a few
dozen to a few hundred rows vs. 1,000-5,000+ in the afternoon/evening runs for the same date). This
is expected, not a bug — do not substitute a later, larger batch because the morning one "looks
too small."

**Batch naming is not reliable on its own.** `source_engine_batch_id` sometimes embeds a readable
label (e.g. `masterrun_20260809_0900pt_hpboard`), but only for a minority of dates, and the exact
label format varies (`9am`, `0912`, `0900pt`, `0932pt_retry3`). Do not rely on string-matching this
field alone.

**The validated, general rule**: group `score.final_board_history` batches (`final_board_batch_id`)
by `official_date`, cluster them by the hour (Pacific time) of their earliest `created_at`, and
treat the cluster whose hour falls in **08:00–10:59 Pacific** as the real morning/9am run for that
date. Some real dates have no batch in that window at all (the pipeline's first run that day was
already in the afternoon) — these dates genuinely have no 9am snapshot and must be excluded from
a 9am-scoped study, not backfilled from a later run.

**Reusable SQL** (rebuild `backtest.run_clusters` and `backtest.nineam_board_legs` at the start of
any new 9am-scoped study — do not assume these tables persist across sessions):

```sql
CREATE TABLE backtest.run_clusters AS
WITH batch_times AS (
  SELECT official_date::date as d, final_board_batch_id, min(created_at) as batch_created, count(*) as n_rows
  FROM score.final_board_history GROUP BY 1,2
),
with_pt AS (
  SELECT *, batch_created AT TIME ZONE 'America/Los_Angeles' as pt_ts
  FROM batch_times
),
clustered AS (
  SELECT *, date_trunc('hour', pt_ts) as hour_bucket
  FROM with_pt
)
SELECT d, hour_bucket, min(pt_ts) as run_start_pt, max(pt_ts) as run_end_pt, sum(n_rows) as total_rows,
  string_agg(final_board_batch_id, ',') as batch_ids
FROM clustered GROUP BY d, hour_bucket ORDER BY d, hour_bucket;

CREATE TABLE backtest.nineam_board_legs AS
WITH morning_batches AS (
  SELECT DISTINCT d, unnest(string_to_array(batch_ids, ',')) as batch_id
  FROM backtest.run_clusters
  WHERE extract(hour from run_start_pt) BETWEEN 8 AND 10
)
SELECT f.*
FROM score.final_board_history f
JOIN morning_batches mb ON mb.batch_id = f.final_board_batch_id AND mb.d = f.official_date::date;
```

**Real, measured coverage** (as of 2026-08-24 audit, window 2026-07-25 to 2026-08-23): 22 of ~32
calendar days in the study window have identifiable 9am data. The remaining days should be reported
as excluded, not silently dropped — always state real day coverage when presenting a 9am-scoped
study (e.g. "22 of 29 real days with graded outcomes had a 9am snapshot available").

Join `backtest.nineam_board_legs` to `score.prop_outcome_history` exactly as done for the full-day
studies (same player/prop/line/side/date/source_key/goblin/demon key) to get graded outcomes for
this scoped leg set.
