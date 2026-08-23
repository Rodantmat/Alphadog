# AlphaDog — Factor Classification Redesign & Quality-of-Contact Findings (Pass 2 of the Documentation Sweep)

This document exists because the first documentation pass (`CALIBRATION_ENRICHMENT_AUDIT.md`)
was genuinely incomplete — it covered the bug-fix audit of the existing hardcoded enrichment
system but had not yet read `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md` or
`QUALITY_OF_CONTACT_METRICS_EXPANSION.md`, both of which turn out to be directly load-bearing
for understanding the real, current, and future state of enrichment scoring. This document
covers those two files in full, and — critically — reconciles them against what was already
documented, rather than presenting them as if no reconciliation were needed.

---

## PART 1 — THE FACTOR CLASSIFICATION & CALIBRATION REDESIGN

This is a real, extensive design document for a planned rebuild of the enrichment/scoring
system — explicitly framed as forward-looking ("for the eventual Enrichment/Final Scoring
rebuild"), not a description of what's fully live today. It is NOT the same document as the
one describing the currently-deployed hardcoded JS enrichment system audited in
`CALIBRATION_ENRICHMENT_AUDIT.md` — but as Part 3 below shows, parts of it have already begun
real, partial implementation, which is the key reconciliation point.

### 1.1 The core architecture: two deliberately separate layers

**Layer 1 — Profile Classification (the actual scoring mechanism)**: rule-based, deterministic,
interpretable, in the same architectural spirit as the existing, proven `classification_v6`/
`baseline_v6` system, extended with a new dimension: factor and factor-variation. The real,
explicit design decision: each factor gets its OWN separate, independently-scoped grid, not one
giant joint cross-product cell spanning every factor simultaneously — confirmed mathematically
intractable (a modest combinatorial estimate lands in the tens of thousands of cells against
only ~104,000 total real training rows, meaning most cells would see zero or a handful of real
games forever). At runtime, a leg is classified against every factor actually relevant to its
specific prop line (see the relevance matrix, 1.3), the applicable factors' effects are
combined ADDITIVELY IN LOG-RATE SPACE (standard Poisson/NB regression practice, explicitly
chosen to avoid the naive-multiplicative-stacking trap where independent-looking
percentage-adjustments actually double-count correlated factors) — this is the real,
principled version of the same problem `CALIBRATION_ENRICHMENT_AUDIT.md` Part 3 Bug 3 found
being handled ad-hoc (via RSS aggregation) in the currently-deployed system.

**Layer 2 — The Calibration Loop**: runs separately, on its own cadence, comparing what each
real profile cell predicted against real observed outcomes for legs landing in that exact
cell, proposing small, SIZED adjustments — never a wholesale replacement. GBDT models
(built in a separate session, referenced here, in `gbdt_training/`) feed this loop as one real
calibration signal among others (isotonic calibration, bootstrap-estimated shrinkage). Real,
explicit reason GBDT was rejected as a full replacement for the rule-based system: GBDT has
documented, peer-reviewed rare-event bias, and produces a black-box rate rather than an
interpretable, directly-tunable rule.

**Automation gradient, explicitly stated**: starts semi-automatic (proposed adjustments queue
for human approval), graduates toward auto-applying within safe bounds only once a real track
record justifies it, with audit log and rollback always available.

### 1.2 Real, cross-validated per-factor research (the substance of Section 2 of the source document)

Each of the following was checked against multiple independent real sources before being
locked — not accepted from a single source. Presented here in full because these are the real,
substantive research findings that would otherwise require re-deriving from scratch:

- **Weather is 4 genuinely distinct mechanisms, not one factor**: wind (needs real 2-3
  pull-tendency tiers crossed with park orientation — NOT a generic hitter tier; wind speed
  itself is a continuous physics formula), temperature/altitude/pressure (real, near-linear
  physics: +4ft carry per 10°F, +6ft per 1000ft altitude, +3.5ft per 1 inHg pressure drop —
  no tiers needed at all, pure formula), precipitation (a genuinely different mechanism —
  grip/control, belongs with BB/K props, not HR/TB), roof status (a binary gate that zeroes
  every other weather micro-factor when closed).
- **Umpire tendency**: real, current, time-sensitive finding — MLB's 2025-2026 ABS challenge
  system has measurably COMPRESSED real umpire-to-umpire variance (league walk rate hit 9.6%,
  a decade high). Historical umpire data from before this rollout would overstate today's real
  effect. Needs 3 real tiers (pitcher-friendly/neutral/hitter-friendly), continuous variation
  within a tier off the umpire's own real zone-size deviation.
- **Platoon/handedness**: real, ASYMMETRIC magnitude — LHB vs RHP advantage is about 28 wOBA
  points, RHB vs LHP only about 16 — and pitcher arm angle massively scales this (sidearm/
  submarine relievers show 76-110 wOBA-point splits vs. ~6 points for standard-angle pitchers).
  The real driver is primarily plate discipline (K rate down, BB rate up), meaning this matters
  more for K/BB props than pure contact-quality props.
- **Catcher framing** (explicitly NOT to be bundled with pop-time/arm — disjoint prop
  relevance): a real, precisely quantified, continuous, no-tiers-needed relationship — each
  framing run per game adds 3.9% to pitcher K rate, subtracts 3.9% from BB rate. **This is
  directly the formula `CALIBRATION_ENRICHMENT_AUDIT.md` Bug 1 found broken in the live
  system** (season total used as-is instead of being divided into a real per-game rate) —
  confirming the intended DESIGN was correct and the deployed CODE had a real implementation
  bug, two separate facts that shouldn't be conflated.
- **Catcher pop-time/arm**: belongs exclusively with the dedicated Stolen-Base factor family,
  confirmed via multiple independent sources, not with framing.
- **Lineup slot + Quality of Surrounding Lineup**: two real, DISTINCT inputs, not one — real,
  near-linear PA/RBI-by-slot data, plus a separate real refinement (benchmarked against THE
  BAT X, a verified industry-leading real system) that a hitter's real RBI opportunity depends
  on the on-base ability of hitters batting ahead of him, not just his own raw slot number.
- **Bullpen fatigue & schedule/travel fatigue**: bullpen needs 2-3 real leverage-role tiers
  (closers/setup identified via real saves/holds in the last 2 days absorb disproportionate
  work); schedule/travel fatigue is real and specifically EASTWARD-travel-concentrated (per
  canonical MLB research, Song/Allada et al., 20 years of real data) — already implemented as
  `eastward_travel_flag`/`westward_travel_flag`.
- **Player availability**: a flat GATE, not a graduated influence — a real limitation (IL
  return, workload cap, platoon-only role) triggers a flat penalty specific to that limitation
  type.
- **Market/implied team total**: naturally continuous, no tiers needed.
- **Opposing pitcher quality — likely the single most consequential factor found in this
  research phase**: a real, peer-reviewed academic finding that facing a great vs. poor
  pitcher (25th vs. 75th percentile quality) shifts expected wOBA by about 45 points — a
  magnitude statistically indistinguishable from the real difference between a great and poor
  BATTER (36-41 points) facing the same pitcher. **Pitcher quality deserves roughly the same
  real weight as the batter's own skill, not a minor adjustment.** No tiers needed — a
  continuous multiplier off xFIP- (luck-adjusted quality vs. league average), matching an
  already-established, published real approach.
- **Defensive quality (OAA)**: real, mechanically clean, continuous, no binning needed — but
  the real refinement (benchmarked against THE BAT X) is that it should be MATCHUP-SPECIFIC
  (crossing the hitter's own spray-angle tendency with the opposing defense's positioning at
  those exact spots), not a blended team-aggregate number.
- **Stolen base**: its own dedicated factor family with almost zero overlap with the other
  9-10 factors — real predictor set (independently converging across multiple sources):
  catcher pop time + arm strength, pitcher hold/delivery time, runner sprint speed, and OBP as
  the real opportunity gate (can't steal first).
- **Times through the order (TTOP)**: genuine, real academic disagreement, resolved toward the
  more rigorous side — the original widely-cited finding (Tango et al. 2007) was found, in a
  more recent, rigorous Bayesian re-analysis controlling for survivorship bias, to show "little
  evidence of strong discontinuity" at the classic 3rd-time-through cutoff. Locked design
  decision: use a continuous "expected batters faced" adjustment tied to the starter's own
  real workload tendency, not a discrete tier cliff.
- **Park factors**: real, convergent methodology (FanGraphs, Baseball Prospectus, Baseball-
  Reference) — standard practice is 3-5 year regressed factors, still shrunk toward league
  average even with multi-year data, and MUST be component-specific (a park's HR factor ≠ its
  2B factor ≠ its BB factor). Real, directly relevant confirmation: rare events show enormous
  real park-level variance (triples factors can range 40-300 vs. modern HR factors rarely
  outside 60-140) — independent confirmation, at the park level, of the same rare-event
  calibration difficulty found elsewhere (see 1.4 below).

### 1.3 The factor x prop-line relevance matrix (locked)

A real, explicit gate that runs BEFORE any tier/direction/variation logic — a given leg only
gets evaluated against factors genuinely relevant to its specific prop:

| Factor | Full relevance | No relevance |
|---|---|---|
| Wind/temp/altitude/pressure | HR, total_bases, doubles, triples | BB, K, stolen_bases |
| Rain/precip | BB, K, hits_allowed, walks_allowed | HR, TB, stolen_bases |
| Umpire zone tendency | K, BB, hits_allowed, walks_allowed | HR, stolen_bases |
| Platoon/handedness | K, BB | stolen_bases |
| Catcher framing | pitcher K, BB, walks_allowed | HR, TB, stolen_bases |
| Catcher pop-time/arm | opposing stolen_bases only | everything else |
| Lineup slot + surrounding quality | runs, rbis, hits_runs_rbis | rate stats, pitcher props |
| Bullpen fatigue | hitter-side HR/hits/TB/walks vs that pen | starter's own props, stolen_bases |
| Schedule/travel fatigue | broad, shallow suppression | stolen_bases |
| Player availability | gates ALL props for that player | n/a (gate) |
| Market/implied team total | runs, rbis, hits, TB | stolen_bases, BB, K |
| Opposing pitcher quality | hits, TB, HR, walks, hitter K | stolen_bases |
| Defensive quality (OAA) | hits, singles, doubles, hits_allowed | HR, BB, K |
| Stolen-base dedicated family | stolen_bases only | everything else |
| Times through order | pitcher full-game totals | hitter props, stolen_bases |
| Park factors | matches each component's own relevance | — |

### 1.4 Real, exact sample-size stabilization points — the precise numbers behind "rare events are hard"

Sourced from Russell Carleton's established, widely-cited sabermetric research, independently
cross-validated by a Baseball Prospectus follow-up using an improved split-half methodology.
These are the exact real plate-appearance/balls-in-play counts before a rate stat reliably
reflects real talent rather than sample noise:

**Hitters**: K rate 60 PA, BB rate 120 PA, HBP rate 240 PA, HR rate 170 PA (but HR-per-fly-ball
needs only 50 real fly balls), single rate 290 PA, GB/FB rate 80 BIP, LD rate 600 BIP, AVG 910
AB, OBP 460 PA, SLG 320 AB, ISO 160 AB, BABIP 820 BIP, **XBH rate 1,610 PA — the slowest of all
real hitter stats measured**.

**Pitchers**: K rate 70 BF, BB rate 170 BF, HBP rate 640 BF, single rate 670 BF, GB/FB rate 70
BIP, LD rate 650 BIP, AVG 630 BF, OBP 540 BF, SLG 550 AB, ISO 630 AB, HR rate 1,320 BF, XBH
rate 1,450 BF, BABIP 2,000 BIP.

**Why this matters, concretely and precisely**: a full-time hitter gets roughly 650-700 real
PA in a season. XBH rate (1,610 PA) essentially never fully stabilizes within a single season
for any individual player — this is the exact, quantified, independently-sourced explanation
for why triples (and to a lesser extent doubles, HR) showed persistent real calibration drift
in every GBDT test run in a separate session. It is a real, measured property of the
underlying stat, not a modeling bug. K rate and BB rate, by contrast, are real, fast-stabilizing
(60-120 PA/BF), which is exactly why those props showed strong, reliable calibration from the
very first single-season test. **Locked design implication**: these exact numbers should become
the real sample-size denominators for each profile cell's shrinkage weight in the calibration
loop — not an arbitrary constant, and not uniform across props.

### 1.5 Real methodological cautions locked into the design

- Gradient boosting has documented, peer-reviewed rare-event bias (a real, structural property,
  not specific to this system's own data).
- Hierarchical/empirical-Bayes shrinkage is the established countermeasure, but multiple real
  academic papers found shrinkage does NOT guarantee improvement for any given dataset, and the
  correct shrinkage amount is hardest to estimate reliably exactly where shrinkage matters most
  (low sample size). Real, established best practice: bootstrap-based estimation of shrinkage
  intensity outperforms a fixed, hand-picked constant. **Locked implication**: the calibration
  loop must periodically re-estimate each profile cell's shrinkage intensity via bootstrap
  resampling, not apply one static global shrinkage factor.
- Time-series feature leakage: any trailing/rolling statistic must be strictly backward-looking,
  validation must use time-based splitting, never a random shuffle - already corrected in the
  GBDT pipeline, must carry forward into any recency-weighted profile inputs too.
- Monotonic constraints (XGBoost's `monotone_constraints`) are explicitly documented as most
  valuable "when training data is limited and the model might overfit a relationship that
  reverses direction spuriously" - precisely the rare-event situation this system faces.

### 1.6 Real, live database schema - this part is NOT hypothetical

Per an explicit standing instruction ("anything variable must reside in the database to be
ready for calibration"), three real tables were built and populated, not merely designed:

- **`config_enrichment_factors`**: registry of all 19 real, researched factors, each row
  carrying its own real research notes directly (so the running system and its documentation
  cannot silently drift apart from each other).
- **`config_enrichment_profile_cells`**: the actual granular scoring cells (factor x prop x
  tier x direction x variation band). Real, deliberate schema correction made mid-build: every
  tunable numeric value gets its OWN dedicated column (`cap`, `penalty`, `lift`,
  `formula_coefficient_a/b/c`, `min_real_sample_threshold`) - never embedded as a literal
  number inside a formula-expression string, specifically so the calibration loop can adjust a
  single real value directly rather than needing to parse and rewrite a formula string.
- **`enrichment_calibration_log`**: audit trail for the semi-automatic-to-automatic loop, with
  bootstrap-shrinkage and GBDT-cross-check fields ready.

**Real status as of the source document's own last update**: 30 real profile cells populated
across 18 of 19 factors (the 19th, `catcher_poptime_arm`, deliberately has zero standalone
cells - its contribution lives inside the stolen-base family's combined formula instead).
Coverage is explicitly, deliberately incremental, not exhaustive. **Critical, explicit
statement from the source document**: "The actual worker logic that reads these cells and
applies them to a real leg has not yet been built as of this update" - as of that point, this
was schema-and-data-only, not yet wired into live scoring.

### 1.7 Real empirical coefficient validation - actually run, with honest, mixed results

A real script (`gbdt_training/validate_factor_coefficients.py`) was built to check externally-
sourced, locked coefficients against the system's OWN real historical data via ordinary least
squares (computed directly, no black-box library) - because external research alone was not
treated as sufficient to lock a coefficient forever.

**Real, honest scope - validated what real data supports, explicitly flagged what it doesn't**:
- **Validated**: `weather_temp_altitude_pressure` (real temp vs. real HR rate, no park-
  direction dependency needed) and `lineup_slot` (real batting order vs. real PA/game).
- **NOT validated, with the real reason recorded rather than guessed around**: `weather_wind`
  (needs real park home-plate-orientation data, confirmed ABSENT from `REF_DB.ref_stadiums`,
  which only has lat/lon/roof/turf), `catcher_framing` (needs real per-game catcher-to-pitcher
  assignment history not yet in a clean historical table), `opposing_pitcher_quality` (needs
  real historical xFIP-/xwOBA-against time series, not yet backfilled).

**Real, first live results**: `lineup_slot`'s empirical coefficient (0.158 PA/slot, n=15,199
real hitter-games) confirmed the correct direction but was ~50% LARGER than the originally-
locked, externally-sourced value (0.105) - **the locked DB coefficient was updated to the real,
empirically-validated 0.158.** `weather_temp_altitude_pressure`'s empirical slope showed
near-zero R-squared (0.001, n=631) - explicitly NOT treated as evidence the real effect doesn't
exist (a near-zero R-squared on a small, uncontrolled single-variable sample is exactly what
you'd expect even for a real, true effect once other confounders dominate the noise) -
correctly left untouched, flagged as needing a larger sample and proper multi-variable controls
before a real verdict is possible.

This validation step is wired into the existing real weekly GBDT training GitHub Action, and
writes results directly into `CONFIG_DB.config_enrichment_profile_cells`'s own
`last_empirical_validation_json`/`last_validated_at` fields - the validation result lives with
the locked cell itself, not in a separate file that could silently drift out of sync.

### 1.8 Real, partial tier-detection implementation already live - this is the key reconciliation signal

This section directly contradicts a naive reading of the "not yet built" statement in 1.6 -
real, partial implementation had begun by this point:

- **`platoon_handedness` - REAL, working**: real `bat_side` vs. real `starter_hand`, both
  already carried in the Matrix payload.
- **`bullpen_fatigue` - REAL, working**: reuses the real, already-computed
  `high_usage_reliever_count`/`back_to_back_reliever_count`/`bullpen_fatigue_score` fields from
  `daily_bullpen_availability_current`.
- **`player_availability` / `weather_roof` (flat gates) - REAL, working**: read real
  `availability_status`/`roof_status` fields directly; the roof gate correctly zeroes out the
  three weather sub-factors for any closed-roof game.
- **`umpire_tendency` - honestly NOT implemented**: direct code inspection of
  `alphadog-v2-daily-usage-pulse.js` confirmed `umpire_tendency_status` is hardcoded to
  `'unavailable_no_verified_history_source'` everywhere - the real underlying historical
  umpire data (aggregated K/BB rates by real umpire name) does not exist anywhere in this
  system yet.
- **`weather_wind` - honestly NOT implemented**: confirmed `REF_DB.ref_stadiums` has no real
  park home-plate-orientation field - the calculation this factor needs cannot be computed
  without it.
- **`stolen_base_family` - honestly NOT implemented**: real sprint-speed data has not been
  backfilled anywhere in this system yet.

---

## PART 2 — QUALITY-OF-CONTACT METRICS EXPANSION — real, verified, with two self-corrections worth preserving

This document directly confirms `alphadog-v2-phase2a-run-environment.js` (the file
`CALIBRATION_ENRICHMENT_AUDIT.md` Part 3 sourced its bug findings from) IS genuinely "the
actual live enrichment engine," explicitly contrasted against `score-audit.js`, which is
"dormant/unused for this factor." **This resolves any doubt about which file represents the
real, live system for this specific factor.**

### 2.1 What was already live before this session (confirmed via direct code read)
- `xwoba` -> `home_runs`, `hits_runs_rbis` (partial: hits/runs/rbis)
- `xwobacon` -> `total_bases`
- `sweet_spot_percent` -> `doubles`
- `barrel_batted_rate` -> `home_runs`

### 2.2 Real new signal actually wired into live scoring this session: ISO

`iso` (isolated power = SLG - AVG, trivially derivable from existing data, no new mining
needed) was added as a new term on the `home_runs` and `total_bases` cells of
`batter_quality_of_contact`, via a previously-unused `formula_coefficient_c` slot, coefficient
0.6 (deliberately conservative, comparable magnitude to existing terms). **Verified by hand
against a real live leg**: Colton Cowser (xwoba=0.319, barrel=10.5%, iso=0.126) ->
`(0.319-0.320)*0.6 + (10.5-7.5)*0.015 + (0.126-0.150)*0.6 = -0.0006 + 0.045 - 0.0144 = 0.030`,
exactly matching the real `factor_breakdown_json` output for that leg. Full scoring run
completed clean afterward, hierarchy violations = 0.

**Full layer flow-through was explicitly, separately verified** (not assumed from code review
alone): `scoring.enrichment_leg_current` -> `score.hp_board_current` ->
`score.final_board_current`, checked against 5 real named players (Kyle Schwarber, Elly De La
Cruz, CJ Abrams, Yordan Alvarez, Christian Encarnacion-Strand), confirming the
ISO-influenced value carries through the entire chain unchanged and matches at every stage.

### 2.3 Real, deliberate rejections — every candidate researched individually, none defaulted to "skip"

- **SwStr%/Whiff%**: real research decision NOT to build new mining. Multiple independent
  sabermetric studies found Whiff% (swinging strikes/swings) explains ~67-70% of K% variance
  and is at least as predictive as SwStr% - no meaningful predictive gap to justify new
  FanGraphs-specific mining infrastructure. More fundamentally: the `hitter_strikeouts` prop's
  baseline already uses the player's REAL, actual strikeout rate from game logs - SwStr%/
  Whiff% are themselves proxies FOR that real outcome rate, so adding either on top would be
  substantially redundant, not new signal.
- **PulledBrl%**: real research decision NOT to build new mining. FanGraphs' own published
  research directly found that "adding pull rate to [barrel-rate-based] metrics doesn't seem
  to help much." Pull% and Barrel% remain available as separate factors but are not combined
  into a new scoring term.
- **HR/FB%**: confirmed NOT worth adding as a direct scoring signal - described consistently
  across sources as "the BABIP of power" (real but modest year-to-year stability, r=0.74,
  explicitly regression-prone within a season). xwOBA and barrel_batted_rate (already live)
  are the skill-based, luck-adjusted versions of exactly what HR/FB approximates from noisier
  outcome data - adding it directly risks reintroducing noise those metrics already correct
  for. Kept as a DISPLAY/context signal only (flags a regression candidate for a human reader).
- **Pull%** as a direct scoring signal: confirmed NOT worth adding, and confirmed from direct
  code inspection (`phase2a-run-environment.js` lines ~343-353) that the mechanism it would
  provide is ALREADY covered - park factors are already selected by the batter's own
  handedness (`lhb_hr_factor`/`rhb_hr_factor`) before being applied, which is the exact,
  industry-standard mechanism for capturing "short porch benefits pull hitters."

### 2.4 Two real, honest self-corrections within the same session (worth preserving as methodological lessons)

**Self-correction 1 — "no automated mining worker exists" was wrong.** An initial claim (based
on searching `static-*`, `daily-*`, `base-expansion-mining`, `orchestrator.js`,
`control-room.js`, `score-audit.js`, and `main.py`) that no automated mining worker existed for
`ref.batter_quality_of_contact`/`ref.batted_ball_profile` was later found to be based on an
INCOMPLETE search - `alphadog-v2-weekly-differential-runner` does mine both, as real, working
internal steps, confirmed by watching it add real new player rows live. The document corrects
this explicitly rather than leaving the wrong claim to stand. **Real, standing lesson**:
"searched every worker file I could think of" is not the same as "searched every worker file
that exists" - a runner's own internal step list can hide real functionality that a
file-name-based search misses.

**Self-correction 2 — the "Baseball Savant Custom Leaderboard" mining path was wrong.** An
initial plan to mine SwStr%/PulledBrl% via Savant's Custom Leaderboard was corrected after
direct inspection of that real leaderboard's actual column list: there is no "SwStr%" column
on Savant at all (that's FanGraphs-specific terminology; Savant's equivalent, "Whiff%," has a
genuinely different denominator - swings only, not all pitches). There is also no "PulledBrl%"
column - only generic "Barrel%" and "Pull%" exist separately; their intersection isn't a
standard leaderboard export and would need pitch-level Statcast Search data instead. This
correction directly fed into the final research-grounded decision in 2.3 above, rather than
either rushing ahead on a wrong assumption or silently abandoning the investigation.

### 2.5 Real daily automation added

`runQualityOfContactDerivedFieldsRefresh` was wired into `runDailyMorningDeltaFullRun`,
immediately before `baseline_v6_full_run`, so derived fields (ISO, batted-ball-direction
percentages) are fresh before the scoring layers that read them run later in the same cycle.
Confirmed genuinely idempotent (reports 0 rows changed when already backfilled) - it does NOT
mine new raw Statcast data (no such ingestion worker exists for genuinely new fields), it only
ensures whatever raw data does arrive gets its derived fields computed automatically.

---

## PART 3 — THE CRITICAL RECONCILIATION: how the redesign relates to the currently-deployed, audited system

This is the most important thing this document adds, and it did not exist before this pass.

**Two documents describe what could be read as two different enrichment systems**:
1. `CALIBRATION_ENRICHMENT_AUDIT.md` (this session's Part 3) - bugs found and fixed directly
   in `alphadog-v2-phase2a-run-environment.js`'s hardcoded JS `case` statements
   (`catcher_framing`, `weather_wind`, `batter_quality_of_contact`, `thinSampleMultiplier`,
   multicollinearity via RSS).
2. `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md` (this document's Part 1) - a config-table-
   driven redesign (`config_enrichment_factors`, `config_enrichment_profile_cells`) explicitly
   framed as a planned rebuild, with real, partial implementation already begun for 3 factors
   (`platoon_handedness`, `bullpen_fatigue`, the flat gates).

**These are the SAME underlying file and the same live system, not two competing ones** - this
is confirmed by `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` explicitly naming
`alphadog-v2-phase2a-run-environment.js` as "the actual live enrichment engine" and describing
`batter_quality_of_contact`'s config as already living in `config.enrichment_factors` +
`config.enrichment_profile_cells` (matching, modulo a dot-vs-underscore naming style, the
redesign document's schema names) as far back as 2026-07-26 - well before the bug-fix audit in
`CALIBRATION_ENRICHMENT_AUDIT.md` took place. **The real, reconciled picture**: the "redesign"
is not a separate future system waiting in the wings - it is a real, in-progress, factor-by-
factor MIGRATION of the existing hardcoded JS enrichment logic into config-table-driven cells,
already partially complete (config exists and is read for at least `batter_quality_of_contact`,
`platoon_handedness`, `bullpen_fatigue`, and the flat gates), with the remaining factors
(`catcher_framing`, `weather_wind`, `umpire_tendency`, the macro-cluster RSS combination,
`opposing_pitcher_quality`, defensive quality, stolen-base family, TTOP) still living as
hardcoded JS logic in the same file, not yet migrated to the config-cell system.

**This means every bug documented in `CALIBRATION_ENRICHMENT_AUDIT.md` Part 3 was found and
fixed in the STILL-HARDCODED portion of this file** - the migration had not yet reached those
specific factors at the time of that audit. A future session doing further enrichment work
should check, for any given factor, whether it has already been migrated to
`config_enrichment_profile_cells` (in which case the calibration loop and empirical validation
infrastructure in Part 1 already apply to it) or whether it's still hardcoded JS (in which case
it needs the kind of manual, direct-code-inspection audit `CALIBRATION_ENRICHMENT_AUDIT.md`
performed) - **do not assume one paradigm or the other without checking the specific factor
first.**

**Real, honest, still-open question this document cannot resolve**: whether `catcher_framing`'s
real bug (season-total-used-as-per-game, documented in `CALIBRATION_ENRICHMENT_AUDIT.md` Bug 1)
has since been migrated into the new config-cell system as part of ongoing work, and if so,
whether the migration itself carried the bug forward or fixed it as part of the migration.
This was not checked in either source document and should not be assumed either way - a
direct, fresh query against `config_enrichment_profile_cells` for a `catcher_framing` row,
compared against the current state of the JS file, would answer this definitively.

---

*End of document. This is Pass 2 of the documentation sweep, directly responding to "still too
shallow" - it adds real content from two previously-unread files and, critically, reconciles
them against Pass 1's findings rather than presenting them as freestanding. Combined with
`SESSION_2026-08-22_FULL_LOG.md`, `OUTCOME_ENGINE_AND_DOC_INDEX.md`, and
`CALIBRATION_ENRICHMENT_AUDIT.md`, this is now four documents deep on the calibration/
enrichment topic alone - the remaining unread files
(`ALPHADOG_SYSTEM_MAP.md`, `ALPHADOG_HANDOFF.md`, `ALPHADOG_DOS_AND_DONTS.md`,
`HANDOFF_MASTER_SUMMARY.md`, `LIVING_LOG.md`, `MASTER_DELTA_SCRUTINY_GUIDE.md`,
`claude-work-log.md`) remain the real, honest gap for a further pass.*
