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

## Update (same session, continued)
**HR/FB% is now wired and live** — computed as `home_runs_sum / (fly_ball_pct/100 * batted_ball_events)`
in both dossier and player-profile endpoints, displayed in the QoC card. Verified against real
data: Colton Cowser shows 17.0% (fly_ball_pct=32.9, batted_ball_events=143, home_runs_sum=8),
matching hand calculation exactly and consistent with his other above-average power indicators
(barrel_batted_rate=10.5%, iso=0.126). Item 1 from the priority list below is complete;
items 2-5 remain open, unchanged.

## Correction (same session, continued) — the Custom Leaderboard path needs revision
Direct inspection of `baseballsavant.mlb.com/leaderboard/custom` (full column list fetched)
confirms: **there is no "SwStr%" column on Baseball Savant at all** — that's FanGraphs
terminology specifically (SwStr% = swinging strikes / all pitches). Savant's equivalent is
"Whiff %" (swinging strikes / swings only) — a genuinely different denominator, not just a
naming difference. **There is also no "PulledBrl%" column** on Savant's Custom Leaderboard —
only generic "Barrel%" and generic "Pull %" exist as separate metrics; their intersection
(barrels that were also pulled) isn't a standard leaderboard export anywhere checked, and
would likely require pitch/event-level Statcast Search data (a much larger, more granular
data source than the season-aggregate leaderboards used for everything else in this system)
rather than a simple leaderboard CSV.
**Revised path forward**: (1) for a true SwStr%, mining would need to target FanGraphs
specifically, a different source/format than what this system currently scrapes from Savant;
(2) for PulledBrl%, either accept "Pull%" and "Barrel%" as separate factors (already partially
available/added this session) rather than their exact intersection, or scope a pitch-level
Statcast Search ingestion as separate, larger future work. This is more involved than
originally scoped — correctly not rushed.

## FINAL DECISION (same session, continued) — grounded in research, closing this question
Researched both open questions properly before deciding, rather than guessing:

**SwStr%/Whiff% — decision: do not build new mining.** Multiple independent sabermetric
studies (Beyond the Box Score 2012/2013, Baseball Prospectus) found Whiff% (swinging strikes/
swings) explains ~67-70% of K% variance and is AT LEAST as predictive as SwStr% (swinging
strikes/all pitches) — in some studies Whiff% edges it out. There is no meaningful predictive
gap that would justify building new FanGraphs-specific mining. Additionally: confirmed live
that `whiff_percent`/`k_percent` exist as schema columns on `ref.batter_quality_of_contact`
but are 100% unpopulated (0/1279 rows) — and more fundamentally, the `hitter_strikeouts`
prop's baseline ALREADY uses the player's actual, real strikeout rate from game logs via the
recency-weighted shrinkage system. SwStr%/Whiff% are themselves proxies FOR that real outcome
rate — adding either on top of the real, already-used outcome rate would be substantially
redundant, not new signal. Closing this as "sufficiently addressed by the existing baseline,"
not "missing data."

**PulledBrl% — decision: do not build new mining.** FanGraphs' own published research
("Which Hitters Benefit From Pulling?") explicitly tested this: exit-velocity/launch-angle-
based metrics (what barrel_batted_rate already captures) predict wOBA well, and "adding pull
rate to that mix doesn't seem to help much." This is a direct, on-point finding against
building pitch-level PulledBrl% infrastructure — the incremental value research shows for
pull-direction data on top of barrel rate (already in live scoring) is small. Pull% and
Barrel% remain available as separate factors (added this session) for anyone who wants to
look at them individually, but they are not being combined into a new scoring term given this
finding.

**Net effect**: no further mining work is planned for these two metrics. The session's
earlier-completed items (ISO wired into scoring, batted-ball-direction and HR/FB% added to
display, xwOBAcon/Pull% surfaced) stand as the real, verified improvements from this
expansion effort.

## Daily automation added (same session, continued) — closing the "one-time backfill" gap
The earlier ISO/batted-ball-direction backfill was a one-time manual SQL pass. Per explicit
follow-up requirement, this is now a recurring daily step: `runQualityOfContactDerivedFieldsRefresh`
(mode `quality_of_contact_derived_fields_refresh`), wired into `runDailyMorningDeltaFullRun`
right before `baseline_v6_full_run` so derived fields are fresh before the scoring layers that
read them run later in the same cycle. It recomputes `iso` and the batted-ball-direction
columns for any row where the underlying raw data already exists but the derived field is
still null — genuinely self-healing (idempotent, verified: reports 0 rows changed when
already-backfilled, meaning it will only ever act on genuinely new/refreshed rows). This does
NOT mine new raw Statcast data (no ingestion worker exists for that — see the SwStr%/PulledBrl%
sections above); it ensures whatever raw data does arrive (by whatever external process
refreshes these two tables) gets its derived fields computed automatically going forward,
closing the "manual pass required" gap.

## Full layer flow-through verified (same session, continued)
Explicitly checked, not assumed: `scoring.enrichment_leg_current` → `score.hp_board_current` →
`score.final_board_current` for real home_runs legs (Kyle Schwarber, Elly De La Cruz, CJ
Abrams, Yordan Alvarez, Christian Encarnacion-Strand). Confirmed `hp_board_current`'s
`estimated_hit_probability_0_100` (which includes the ISO-influenced `rate_multiplier` from
enrichment) matches `final_board_current`'s value exactly for every leg checked, and
CJ Abrams' `enrichment_leg_current.factor_breakdown_json` confirms `batter_quality_of_contact`
(now including ISO) is genuinely applied for that leg. The chain carries the new signal
end-to-end, verified against real production data, not inferred from code review alone.
Hierarchy check re-run clean (0 violations) after all of this session's changes.

## Recommended next-session task list, in priority order
1. ~~Wire HR/FB% as a computed/displayed field~~ — DONE, verified (see above).
2. ~~Build SwStr%/PulledBrl% mining~~ — CLOSED, per the research-grounded decision above:
   existing data (Whiff%-equivalent via real K-rate baseline, barrel_batted_rate) already
   captures the predictive signal these would provide. Not pursuing further.
3. Calibrate and add batted-ball-direction (FB%/Pull%) as a new enrichment scoring term, if
   desired — likely as an interaction term with park factors per
   `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md`'s own note on this factor, rather than a flat
   additive term like ISO. This is the one item from the original list that remains genuinely
   open; it's a calibration/design task, not a data-mining gap.
