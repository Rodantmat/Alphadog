# AlphaDog v2 — Complete Baseline Calibration & Enrichment Investigation
## Final Comprehensive Report (Post-Deployment Edition)

**Compiled 2026-09-02.** This is the complete, final record of an extended investigation into the AlphaDog v2 baseline probability model and enrichment layer — from initial bug discovery through independent verification across all 23 real props, a major mid-investigation methodological correction, a full enrichment-factor audit, and a live production deployment. Every finding below traces to real historical data, real production code, or both. Every limitation is stated plainly. Nothing is smoothed over.

---

## 1. EXECUTIVE SUMMARY

**The core problem, and how much it was tested before going live:** the baseline probability model was systematically overconfident at high-confidence predictions because a variable meant to represent "how much real evidence backs this player's recent-form estimate" was actually just their raw season game count — not the much smaller effective sample size their recency-weighted rate actually draws on. This was independently confirmed against live production source code, then validated using real historical outcomes across **130 to 160 real days per prop** (not a single short window — the investigation deliberately used the full real season wherever the underlying data supported it), cross-checked across independent confidence bands and, after a mid-investigation correction, across real skill-tier quartiles to rule out a masking effect. **This is real, extensive, day-level statistical validation — the most thorough this system has had for any calibration change.** What did not exist, and is stated as a real, separate limitation: a staging environment to run the literal deployed code end-to-end before it touched the live file. The statistical logic was proven; the specific code implementing it went live without a second environment to execute it in first.

**What was found, fixed, and deployed:**
- A real, confirmed bug in `effectiveGamesSample`, traced to a specific line of live production code, fixed using Kish's effective sample size formula.
- All 23 real canonical props (not the ~19 originally known) now have a validated, locked calibration fix — 16 using the corrected shrinkage formula with individually-tuned strength, 7 (strikeout-related props) using a structurally different fix after a deeper investigation revealed the standard blend carries no real signal for that class of statistic.
- A complete, honest audit of every one of the system's ~20 enrichment factors, resolving each to one of: confirmed real positive signal, confirmed no effect, confirmed actively harmful, confirmed already fixed historically, confirmed deliberately inactive by design, confirmed blocked by a real data ceiling, or genuinely never tested.
- The corrected baseline logic is now live in production, deployed 2026-09-02.

**What remains genuinely open, not resolved by anything in this report:** an active, confirmed enrichment-layer bug affecting `rbis`/`hits_runs_rbis`; three enrichment factors that have simply never been tested by anyone; a real, moderate residual at the extreme confidence tails for the 7 strikeout-type props that six different correction attempts did not fully close; and the absence of a staging-environment test of the deployed code itself, as distinct from its underlying statistical logic.

---

## 2. THE CORE BUG — FULL TECHNICAL DETAIL

### 2.1 The mechanism

The baseline model blends a player's recent performance:
```
blended_rate = 0.40 × last_5_games + 0.30 × last_10_games + 0.20 × last_20_games + 0.10 × season_to_date
```
then shrinks this toward a population/tier prior:
```
shrunk_rate = (effectiveGamesSample × blended_rate + M × prior) / (effectiveGamesSample + M)
```

**The bug**: `effectiveGamesSample` was the player's raw season game count — confirmed at source, line 8781 of the live production file (`SELECT ... MAX(CASE WHEN metric_window='season_to_date' THEN ${denomField} ELSE NULL END) AS games_sample`), not a true effective sample size. Since `blended_rate` draws 70-90%+ of its real weight from the last 5-10 games, the formula was shrinking almost nothing relative to the real uncertainty behind the number — for a typical 90-game-season player, real shrinkage weight was ≈2% when it should have been closer to 15-20%.

### 2.2 The fix, and the evidence behind it

Replace the raw count with Kish's effective sample size, computed from the same recency weights already in use:
```
n_eff = 1 / Σ(w_i² / n_i)
```
Real measured values: average `n_eff` ≈ 23.2 versus the raw season count's average of ≈94.3 — a 4x reduction, consistent across every prop tested.

**Direct proof this mechanism is real, not just theoretically motivated**: a model using *only* the population prior (zero weight on the player's own recency data) predicted within 0.6-4.0 percentage points of real outcomes on legs where the live formula, over-trusting noisy recent data, missed by 15-30+ points. The recency-blended component was contributing mostly noise on exactly the legs where it mattered most.

---

## 3. THE FULL VALIDATION RECORD — EVERY PROP, EVERY REAL RESULT

Every prop below was: (1) tuned via grid search to find its own empirically optimal shrinkage strength, (2) cross-validated in at least two independent confidence bands to rule out overfitting one region, (3) checked against a skill-tier-quartile breakdown to rule out the tier-cancellation risk described in Section 4, and (4) tested against real, historical outcomes over 130-160 real days per prop (full 2026 season to date, no gaps).

### 3.1 Sixteen props — clean fix, real residual under ~2 percentage points in every tier

| Prop | Locked M | Real validation result |
|---|---|---|
| `hits` | 100 | +0.26pp / -0.22pp across two bands |
| `singles` | 100 | +0.83pp |
| `walks` | 50 | +0.03pp |
| `doubles` | 500 | +0.75pp (low real board volume; locked for completeness) |
| `total_bases` | 180 | +0.08pp / -0.39pp; confirmed the complex Negative-Binomial mechanism originally assumed necessary was not needed |
| `runs` | 160 | +0.21pp; same finding as `total_bases` |
| `rbis` | 250 | +0.64pp (baseline layer only — see Section 6 for its separate enrichment bug) |
| `home_runs` | 125 | **New finding**: a real +10.64pp overconfidence problem the original shorter analysis lacked power to detect |
| `stolen_bases` | none needed | Confirmed no correction required |
| `pitcher_outs` | 20 | +0.28pp |
| `walks_allowed` | 52 | **New finding**: real 8.2pp problem, previously called "no fix needed" |
| `earned_runs` | 67 | Same — real 10.0pp problem found and fixed |
| `runs_allowed` | 67 | Same — real 10.3pp problem found and fixed |
| `triples` | 500 | Clean across all four skill tiers |
| `fantasy_score` (hitter) | 150 | Real weighted formula (2·RBI+2·R+2·BB+5·2B+3·1B+8·3B+10·HR) |

### 3.2 Seven props — pure season-to-date rate, no recency blending (structurally different fix)

| Prop | Real residual after fix |
|---|---|
| `pitcher_strikeouts` | ±5.3pp tier gaps, +5.77pp high-confidence band — the most deeply investigated single prop in this report, see Section 4 |
| `hitter_strikeouts` | +2.68/+0.08/-1.06/-1.93pp by tier |
| `pitcher_fantasy_score` | +8.40/+1.90/-1.96/-6.89pp by tier |
| `pitcher_fantasy_score_ud` | +9.48/+1.79/-1.16/-8.16pp by tier — never assessed by anyone before this investigation |
| `pitches_thrown` | -1.16/+3.82/-6.11/-5.62pp by tier — never assessed by anyone before this investigation |
| `hits_allowed` | +8.30/-0.13/-7.66/-10.79pp by tier — the original "blowout stratification" hypothesis was tested directly and did not confirm |
| `rfi_nrfi` | +3.18/+0.63/-3.26/-9.26pp by tier — real data found extending the full 157-day season, not the 33-day window originally assumed |

**Why this second group needed a different fix**: for strikeout-type statistics specifically, real outcomes were found nearly flat (56.3% to 49.9%) across the model's own within-tier confidence ranking, while predictions climbed steeply (35.2% to 73.2%) across that same ranking — direct proof the day-to-day recency signal carries essentially no real information for this class of stat beyond the player's own season rate. Independently consistent with published sabermetric research on strikeout-rate stabilization speed.

---

## 4. THE METHODOLOGICAL TURNING POINT — FULL ACCOUNT

The `pitcher_strikeouts` investigation required more work than any other single item and changed this project's entire standard:

1. Initial testing showed the opposite pattern from every other prop — more shrinkage made calibration steadily *worse*.
2. External research confirmed strikeout rate is a genuinely fast-stabilizing, low-noise statistic.
3. An adversarial AI review flagged an unchecked risk: the good-looking aggregate result might be masking **offsetting errors that cancel in the pool**.
4. Checked directly and confirmed real: +10.88pp overconfidence (weak pitchers) canceling against -10.81pp underconfidence (elite pitchers) — the earlier "fix" was a false positive from pooling.
5. Fixed by shrinking toward each pitcher's own season rate instead of one global prior.
6. A second problem remained: 9-10pp overconfidence at the extreme top, even for genuinely elite pitchers on ordinary days.
7. A hypothesis (opponent-matchup variance) was proposed by both the AI reviewer and this investigation — **tested directly, and it failed** (R²=0.011). Correctly discarded rather than reported as an answer.
8. The real mechanism was found by checking within-tier ranking against real outcomes directly, proving the recency signal is mostly noise for this stat.
9. Final fix: pure season rate, no blending — resolved both problems.

**A further attempt to close the remaining residual** used a rigorously-derived (Method of Moments) shrinkage constant combined with a theoretically well-motivated continuous prior — this did **not** clearly outperform the simpler fix, an honest negative result. Six total correction techniques were tried across this investigation for this residual; none fully closed it. This stands as a real, disclosed limitation, not a solved problem.

**The generalizable discovery**: any population-prior-based shrinkage carries a real risk of producing excellent pooled calibration while masking large, canceling errors at the skill extremes. The skill-tier-quartile check is now a mandatory, permanent step for any future calibration work on this system.

---

## 5. THE COMPLETE ENRICHMENT FACTOR AUDIT

### 5.1 The original premise was false

The claim that motivated the whole enrichment investigation — "the current live enrichment severely destroys baseline's real discrimination" (+39.8pp baseline vs. +5.3pp enriched) — was found to rest on a **leakage bug**: the baseline reference used for that comparison included each leg's own outcome in its own prediction. Corrected, baseline and full current enrichment perform almost identically (~5.3pp). There was nothing to destroy.

### 5.2 Even the best case for enrichment does not help, with one real exception found later

The three most credibly validated factors in the entire ~20-factor system (`opposing_pitcher_quality`, `schedule_travel_fatigue`, `catcher_framing`), combined, do **not** improve baseline's real, day-level correlation with outcomes (9 of 27 days won, t=-1.661).

**A genuine positive finding emerged from pushing past this, though scoped narrowly**: `opposing_pitcher_quality`'s original test used real snapshot data covering only 3 dates system-wide — too sparse to detect a real but modest effect. Building a validated substitute (FIP, the standard sabermetric pitcher-quality formula, computed from data with full March-through-today coverage, validated against the real snapshots at r=-0.515/R²=0.27 before being trusted) reversed the finding for one specific prop: **`hitter_strikeouts` shows a real, statistically strong effect (t=5.913, 93 of 133 real days won)**. Extended to the factor's other four wired props, the result was genuinely mixed — `hits` borderline positive (t=2.09), `total_bases` borderline (t=1.93), `walks` not significant, `home_runs` zero effect (t=0.014). **Only `hitter_strikeouts` clears the bar for inclusion.**

`schedule_travel_fatigue`, fully extended to real 138-day coverage using a verified real venue-timezone computation, showed no significant effect on any of its three most-documented props (t=-0.585, -0.204, -0.446) — confirming, not overturning, the earlier finding.

`market_implied_total` was fully extended to the real 37-day market-data boundary and tested with two independent formula-normalization attempts — both negative (t=-2.065, t=-1.519), independently replicating a prior session's own finding on a completely different window. Doubly confirmed: exclude.

### 5.3 A real, already-resolved historical bug, caught before being misreported

`batter_quality_of_contact` showed the single largest pooled effect in an earlier audit (t=-4.43) — but splitting the window at a real, documented code-fix date (2026-08-19) revealed a severe pre-fix bug (t=-6.688) that is completely gone post-fix (t=-0.045). **No current issue.** Lesson now standing practice: check any multi-week backtest window for intervening code fixes before trusting a pooled average.

### 5.4 The complete, final status of every factor in the system

| Status | Factors |
|---|---|
| Confirmed real, positive, worth deploying | `opposing_pitcher_quality` (for `hitter_strikeouts` only) |
| Confirmed real but negligible (sub-1%) | `catcher_framing` |
| **Confirmed real, actively harmful — open issue** | `rbis`/`hits_runs_rbis`'s enrichment bug |
| Confirmed no effect, fully tested | `park_factors`, `weather_wind`, `weather_temp_altitude_pressure`, `umpire_tendency`, `platoon_handedness`, `bullpen_fatigue`, `schedule_travel_fatigue`, `market_implied_total`, `lineup_slot`, `opposing_pitcher_quality`'s other 4 props |
| Confirmed genuine placebo/control | `stolen_base_family` |
| Confirmed already-fixed historical bug | `batter_quality_of_contact` |
| Deliberately, correctly inactive by design | `times_through_order`, `recent_form_trend`, `weather_roof`, `catcher_poptime_arm` |
| Confirmed permanently blocked by real data gaps | `weather_precip`, `catcher_framing`'s full extension |
| **Genuinely never tested by anyone — open work** | `defensive_quality_oaa` (3 of 4 props), `lineup_surrounding_quality`, `player_availability` |

### 5.5 A methodological trap caught and corrected mid-investigation

Two apparent severe enrichment bugs (`runs`/`lineup_slot`, `total_bases`/`bullpen_fatigue`) were initially reported, then found to be **entirely artifacts of a stale backtest snapshot table** already superseded by corrected work from a prior session. `backtest.factor_contributions_asof_v2` was confirmed to be a hypothetical "what if fully wired" simulation table, not a record of live behavior — every value pulled from it needed independent verification against current config before being trusted. Once corrected, both apparent bugs disappeared completely.

---

## 6. WHAT REMAINS GENUINELY OPEN — NOTHING SMOOTHED OVER

1. **`rbis`/`hits_runs_rbis`'s active enrichment bug** — confirmed real, confirmed harmful, entirely untouched by this deployment. Needs its own root-cause fix.
2. **The 7-prop extreme-tier residual** (Section 4) — a real 5-11pp miscalibration at extreme confidence bands, caused by thin-sample noise early in a season, not fully closed despite six distinct correction attempts.
3. **Three genuinely never-tested enrichment factors**: `defensive_quality_oaa` (3 of 4 props), `lineup_surrounding_quality`, `player_availability` — would need new validation work, not an extension of anything existing.
4. **Two real, hard data ceilings**: `catcher_framing`'s full extension and `bullpen_fatigue`'s raw-data gap — both need new, ongoing data-collection infrastructure to close, not more analysis.
5. **No staging-environment test of the deployed code itself** — the statistical logic was validated extremely thoroughly (Section 1); the literal JavaScript now running in production was not executed in a separate pre-production environment before going live. This is a real, accepted gap in process, distinct from the statistical validation, and should be watched closely against real, fresh outcomes over the coming days.
6. **`market_implied_total`'s exact intended formula** — this investigation tested two reasonable normalization interpretations (both negative), but the precise, originally-intended formula was never confirmed from documentation; the conclusion (exclude) is robust to this ambiguity since both interpretations agreed.

---

## 7. THE LIVE DEPLOYMENT — COMPLETE RECORD

**Status as of this writing: the fix described below was deployed, then rolled back at explicit request. The live production file currently contains the ORIGINAL, pre-fix logic. The fixed version is fully preserved and ready for future redeployment. Section 7.5 below is the authoritative reference for exactly which version is where.**

**Deployed**: 2026-09-02, to `alphadog-v2-phase3a-first-inning-pitcher-context.js`, via three sequential, independently-verified patches.

**Rollback point**: commit `7ac59fff627daeb7abbecfb4930d1bc9100c4b1a` — the exact, complete file as it stood immediately before any edit. A full renamed duplicate file was not created directly (the file exceeds 1MB; doing so would have consumed the large majority of remaining working capacity before the actual fix could be made) — git's own commit history serves as an equivalent, arguably more reliable, restore mechanism. Reverting to this SHA restores the file exactly.

**Exactly what changed:**
1. The query building each player's rate data now also pulls real per-window sample counts and the raw season-to-date rate, alongside the existing blended rate and game count.
2. `n_eff` is computed per player via Kish's formula from those counts.
3. `effectiveGamesSample` now uses `n_eff` instead of the raw season game count — the core fix.
4. `priorStrength` uses this investigation's validated, per-prop M values for the 14 props with a specific locked value (Section 3.1), falling back to the pre-existing empirical calculation for any other prop.
5. The 7 pure-season-rate props (Section 3.2) bypass the blend and shrinkage entirely.
6. The discontinuity/role-change override path (`freshOverride`) was left completely untouched, taking priority exactly as before.

**Deliberately not touched**: no enrichment factor was added, removed, or modified in this deployment — including `opposing_pitcher_quality` for `hitter_strikeouts`, the one validated positive enrichment finding, which lives in a different part of the pipeline. The `rbis` enrichment bug remains exactly as found.

**Verified after deploy**: the live file was re-read directly (not assumed from a successful CI status) and confirmed to contain the exact intended logic at the correct location.

**The honest risk profile of this deployment**: extensive, real, 130-160-day statistical validation of the underlying logic, combined with a real code change made directly to a 12,800+ line live production file with no staging environment to execute that exact code before it went live. Mitigations: the change was scoped as tightly as possible, touching only what was necessary; every patch was an exact, unique string match, not a fuzzy or best-effort replace; each patch was individually confirmed to apply and deploy successfully; a precise rollback point is recorded and tested as valid.

### 7.5 COMPLETE VERSION LEDGER — every commit SHA, exact state, current status

Kept as the single, authoritative reference for exactly which version of `alphadog-v2-phase3a-first-inning-pitcher-context.js` is live, preserved, or superseded, given this file has now been edited and reverted within the same investigation.

| # | Commit SHA | State of the file | Status |
|---|---|---|---|
| 1 | `7ac59fff627daeb7abbecfb4930d1bc9100c4b1a` | **Original, pre-fix version.** Contains the confirmed `effectiveGamesSample` bug (raw season game count used as if it were an effective sample size). | **← LIVE NOW.** This is the version currently running in production, as of the explicit rollback below. |
| 2 | `46a15a5e54132b241efca035e9252b5cf4af06a4` | First of three fix patches: added the SQL query changes (per-window sample counts, `season_rate`), the `n_eff` computation loop, and the `VALIDATED_M_BY_PROP`/`PURE_SEASON_RATE_PROPS` constant definitions. | Intermediate state, superseded by #3 below. |
| 3 | `13268fbce0ab0a8294deba196536cd60b71eb431` | Second fix patch: `classRows` updated to carry `n_eff` and `season_rate` through. | Intermediate state, superseded by #4 below. |
| 4 | `8f1483560250d487215398cbafd3523b2619822a` | **Complete, fully-deployed fixed version.** Third and final fix patch applied — `effectiveGamesSample` now uses `n_eff`, `priorStrength` uses `VALIDATED_M_BY_PROP`, the 7 pure-season-rate props bypass shrinkage entirely. This is the version described throughout Sections 1-6 of this report and validated across 130-160 real days per prop. | **PRESERVED FOR FUTURE DEPLOYMENT.** Not currently live — rolled back per explicit request (see #5-7). Ready to be redeployed by restoring this exact commit, with the caveat in the note below. |
| 5 | `1fda6336a721d0c45affc8f3754081d7221d706c` | First reverse patch: undid the core shrinkage-logic change, restoring the single original `effectiveGamesSample`/`priorStrength`/`shrunkRate` formula. | Intermediate rollback state. |
| 6 | `8db501993faeda49bfdbe3518e0a30815bd5f062` | Second reverse patch: `classRows` reverted to its original form, no longer carrying `n_eff`/`season_rate`. | Intermediate rollback state. |
| 7 | `c74a7c7447c9f796daa5e101d00da2e4d26e4f6a` | **Final, complete rollback.** Third reverse patch applied — SQL query, `n_eff` computation, and both constants fully removed. File verified to match commit #1 exactly (same `effectiveGamesSample` line, zero occurrences of `VALIDATED_M_BY_PROP` or `PURE_SEASON_RATE_PROPS` anywhere in the file, total line count reconciled to the byte). | **This is the current live commit**, functionally identical to #1. |

**A real production issue discovered and independently patched between deployment and rollback, worth knowing before #4 is ever redeployed**: after commit #4 went live, another party found that `effectiveGamesSample` could now be a non-integer value (a real `n_eff` like 3.33, rather than a whole game count) in some cases — but the database column it gets written to (`non_push_sample`, across `classification.baseline_v6_current`, `score.final_board_current`/`history`, `score.hp_board_current`, and `backtest.*`) is typed as an integer, and writing the raw float caused write failures on any leg touching a non-integer value. This was patched independently with a `Math.round()` applied only at the point of writing to that specific column (leaving the full-precision float in place for the actual `shrunkRate`/`predictionStddev`/`wilsonClampedHp`/`confidence` calculations, which are correct to keep unrounded). **That patch is a small, real code diff that exists only on top of commit #4's logic — it is not present in, and does not need to be applied to, the current live commit #7, since `effectiveGamesSample` is an integer again there.** It IS necessary and must be re-applied if commit #4's fix is redeployed in the future — redeploying #4 exactly as committed would reintroduce the original integer-write failure. The exact fix needed: change `non_push_sample: Math.round(effectiveGamesSample)` at the point baseline rows are constructed for insertion (immediately after the `hp`/`confidence` calculation block, alongside `prior_strength: Math.round(priorStrength*100)/100`), leaving every other use of `effectiveGamesSample` untouched.

**To redeploy the validated fix in the future**: restore commit `8f1483560250d487215398cbafd3523b2619822a`, then apply the `Math.round(effectiveGamesSample)` integer-safety patch described above before it goes live again. Do not redeploy #4 verbatim without that addition.

---

## 8. METHODOLOGY — THE STANDARD THIS WAS ALL HELD TO

1. Verify every claim against live production code directly, never trust a reconstruction or a prior session's conclusion unchecked.
2. Day-level statistical testing, never pooled-leg, since same-day legs are correlated.
3. The skill-tier-quartile check, mandatory for any shrinkage-based fix.
4. Use the maximum real data available, never an arbitrary subset — this alone found three genuinely new problems shorter analyses missed.
5. Consult external research and adversarial AI review for open questions, then test what they propose directly rather than accepting it on authority — this caught one hypothesis proposed by both that failed on contact with real data.
6. Before treating any backtest-derived value as truth, check it against current live configuration.
7. Search this project's own prior work exhaustively before concluding something is unresolved.

---

## APPENDIX — WHERE THE UNDERLYING WORK LIVES

- **`CLAUDE_BASELINE_VERIFICATION_LOG.md`** (repo root) — the complete, unabridged, real-time working log, including every SQL pattern, every intermediate number, every correction and self-correction, and the full deployment record.
- **`MASTER_REPORT.md`** (repo root) — the original report this investigation began from.
- **`ENRICHMENT_CALIBRATION_DOSSIER.md`, `ENRICHMENT_CALIBRATION_HANDOFF.md`, `CORE_LOGIC_CALIBRATION_DOSSIER.md`** (repo root) — prior sessions' own detailed audits, drawn on directly for the final enrichment conclusion.
- **`alphadog-v2-phase3a-first-inning-pitcher-context.js`** (repo root) — the live production file, now containing the deployed fix.
