# Quality-of-Contact Metrics Expansion — Session Doc (2026-07-27)

## Why this file exists
Rodolfo asked for a set of Statcast metrics (screenshots: SwStr%, SweetSpot%, HR/FB%, FB%, HH,
LA, PulledBrl%, Brl/BIP%, ISO, xwOBA, xwOBAcon) to be confirmed present, mined/derived if
missing, and wired through every layer (data table → enrichment scoring → matrix/HP/final
board → dossier/player-profile UI). This doc is the permanent record of what was found, what
was fixed, and what remains — so this doesn't need to be re-investigated from scratch later.

## Where this metric set was originally planned
`HANDOFF_MASTER_SUMMARY.md` line ~126-135 confirms: a `batter_quality_of_contact` enrichment
factor was designed and its config built (`config.enrichment_factors` +
`config.enrichment_profile_cells`, 4 cells: home_runs, total_bases, doubles, hits_runs_rbis),
explicitly citing this exact metric list, sourced from Baseball Savant. **The config layer
itself is correctly migrated to Postgres and current** (confirmed live, `updated_at`
2026-07-26) — this was never a D1-vs-Postgres problem for the config/scoring-logic side.

## What was ALREADY live in real scoring (confirmed via direct code read + backfill-model
verification against `alphadog-v2-phase2a-run-environment.js`, the actual live enrichment
engine — NOT `score-audit.js`, which is dormant/unused for this factor)
- `xwoba` → home_runs, hits_runs_rbis (+ partial: hits/runs/rbis)
- `xwobacon` → total_bases
- `sweet_spot_percent` → doubles
- `barrel_batted_rate` → home_runs

## What this session found mined-but-unused, and fixed
- `ref.batter_quality_of_contact.raw_json` did NOT contain SwStr%/HR-FB%/PulledBrl% at all —
  confirmed by direct inspection, not assumed. It's a Baseball Savant "expected stats" export,
  a different report than the one those specific fields come from.
- `ref.batted_ball_profile.raw_json` DID already contain `fb_rate`, `gb_rate`, `ld_rate`,
  `pu_rate`, `pull_rate`, `oppo_rate`, `straight_rate` — mined and stored, never extracted into
  columns. Added 6 new columns (`fly_ball_pct`, `line_drive_pct`, `pop_up_pct`, `pull_pct`,
  `opposite_field_pct`, `straight_away_pct`), backfilled all 860 existing rows from the
  existing raw_json (no re-mining needed).
- `ref.batter_quality_of_contact` already had `xwobacon` and `pull_percent` as populated
  columns that were simply never selected/displayed anywhere. Also added `iso` (raw isolated
  power = slg - ba, trivially derivable, not requiring new mining), backfilled 1278/1279 rows.

## What was wired into LIVE ENRICHMENT SCORING this session (new signal, not just display)
`iso` was added as a new term (via the previously-unused `formula_coefficient_c` slot) on the
`home_runs` and `total_bases` cells of `batter_quality_of_contact` in
`alphadog-v2-phase2a-run-environment.js`. Coefficient set to 0.6 (conservative, comparable
magnitude to existing terms). `league_avg_iso: 0.150` added to the factor's
`calibration_thresholds_json`. Verified live and by hand: Colton Cowser (xwoba=0.319,
barrel=10.5%, iso=0.126) → contribution = (0.319-0.320)*0.6 + (10.5-7.5)*0.015 +
(0.126-0.150)*0.6 = -0.0006 + 0.045 - 0.0144 = **0.030**, exactly matching the real
`factor_breakdown_json` output for that leg. Full scoring run completed clean, hierarchy
violations = 0 after this change.

The batted-ball-direction fields (FB%/LD%/GB%/Pull%/Oppo%) were NOT wired into scoring this
session — they were added to the data table and UI display only. They are plausible future
enrichment signal (e.g., a high-FB%/high-pull hitter in a short-porch park is a real
interaction effect, per `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md`'s own notes on this
factor) but adding them to live scoring needs its own coefficient calibration pass, not a
same-session rush addition — flagged as real future work, not done.

## What's confirmed GENUINELY MISSING — needs new mining, not extraction
**SwStr% (swinging-strike rate) and PulledBrl% (pulled-barrel-specific rate) do not exist
anywhere in this system's mined data.** Searched every ref.* table's raw_json for both terms —
zero matches. These come from different Baseball Savant leaderboard reports than what's
currently scraped (Plate Discipline / swing-take report for SwStr%; a batted-ball-direction-
by-quality cut for PulledBrl%, distinct from the batted-ball-profile direction data added this
session). **HR/FB% is now computable** (fly_ball_pct is in `batted_ball_profile`, home_runs
count is in `stats_hitter.metric_snapshots`) but was not wired as a displayed/scored field this
session — real remaining work, not started.

## IMPORTANT ARCHITECTURAL GAP FOUND, FLAGGED FOR FUTURE ATTENTION
**No automated mining worker for `ref.batter_quality_of_contact` or `ref.batted_ball_profile`
was found anywhere in this codebase** — searched every static-*, daily-*, base-expansion-mining,
orchestrator.js, control-room.js, score-audit.js, and main.py. Confirmed via `updated_at`
history: only 2 distinct refresh days ever (2026-07-20, 2026-07-26) — not daily automation.
The raw_json structure exactly matches a manual Baseball Savant CSV export/import (HTML
`<a href>` tags present in the data itself), strongly suggesting this has been a manual or
semi-manual process outside this repo, not a Cloudflare Worker pipeline. **Building genuine
daily automated mining (for SwStr%/PulledBrl% specifically, and for keeping the existing
fields current in general) is real, substantial, net-new engineering** — not a quick wire-up —
and was correctly not rushed this session. The right source is Baseball Savant's Custom
Leaderboard endpoint (`baseballsavant.mlb.com/leaderboard/custom`), which supports CSV export
with selectable columns; this is the concrete starting point for that future build.

## Recommended next-session task list, in priority order
1. Wire HR/FB% as a computed/displayed field (data already exists, just needs joining).
2. Build a real mining worker against Baseball Savant's Custom Leaderboard CSV endpoint for
   SwStr% and PulledBrl% specifically. Test thoroughly before wiring into daily cron.
3. Wire the new worker into the daily cron chain (`runDailyMorningDeltaFullRun`) so these two
   plus the existing batter_quality_of_contact/batted_ball_profile tables all refresh daily,
   not just on manual re-import.
4. Calibrate and add batted-ball-direction (FB%/Pull%) as new enrichment scoring terms, likely
   as an interaction term with park factors per the design doc's own note on this, rather than
   a flat additive term like ISO.
5. Consider whether SwStr%/PulledBrl%, once mined, warrant their own dedicated enrichment
   factor (separate config row) rather than folding into `batter_quality_of_contact` — SwStr%
   in particular is arguably more relevant to pitcher-strikeout/contact props for the *batter
   facing* a pitcher than to the batter's own home_runs/total_bases cells this factor covers.
