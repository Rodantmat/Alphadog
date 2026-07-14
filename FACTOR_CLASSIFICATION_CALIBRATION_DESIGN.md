# FACTOR CLASSIFICATION & CALIBRATION SYSTEM — LOCKED DESIGN + RESEARCH LOG
*(Working documentation, not a handoff. Captures the full research and design reasoning for the eventual Enrichment/Final Scoring rebuild, so a future session — human or Claude — has the full "why" without re-deriving it.)*

---

## 1. THE CORE ARCHITECTURE — TWO SEPARATE LAYERS

This was the central design resolution reached after real back-and-forth, and it must not be collapsed back into one system:

**Layer 1 — The Profile Classification System (the actual scoring mechanism)**
Rule-based, deterministic, interpretable — same architectural spirit as the existing, proven `classification_v6`/`baseline_v6` (z-score tiering, two-level shrinkage, Poisson/NB/Normal model selection), but extended with a new dimension: **factor and factor-variation**, not just player-tier × prop-line × propline-variation × direction.

Each factor gets its **own separate, independently-scoped grid** — not one single joint cross-product cell spanning every factor simultaneously (confirmed mathematically intractable: even a modest combinatorial estimate lands in the tens of thousands of cells against ~104,000 total real training rows, meaning most cells would see zero or a handful of real games forever). Instead: per-factor grids, each as deep as that factor's own real, researched variance justifies — some factors need real tiers + direction + graduated bands, some need only a continuous formula, some are closer to a binary gate. Depth is earned per factor by real evidence, never applied uniformly for its own sake.

At runtime: classify a leg against every factor that's actually relevant to its specific prop line (see Section 3, the relevance matrix), combine the applicable factors' effects additively in log-rate space (standard Poisson/NB regression practice — avoids the naive-stacking trap where independent %-adjustments double-count correlated factors), and that produces the final adjusted rate. Fast, cheap, fully interpretable. A leg appearing identically on multiple boards (PrizePicks/Underdog/etc.) gets classified once, not once per board.

**Layer 2 — The Calibration Loop (where the training tool actually earns its keep)**
Runs separately, on its own cadence (daily/weekly — TBD empirically). For each real profile cell, compares what that profile predicted against real observed outcomes for legs that actually landed in that exact cell, and proposes a **small, sized adjustment** to that cell's cap/threshold/penalty/lift — never a wholesale replacement prediction. The GBDT models built this session (see `gbdt_training/`) are one real input to this loop (their calibration-ratio math is directly reusable, aimed at each profile cell instead of a whole prop); other calibration techniques (isotonic calibration, bootstrap-estimated shrinkage — see Section 6) can feed the same loop.

**Automation gradient**: starts semi-automatic (proposed adjustments queue for human approval) → graduates to auto-applying within safe bounds once a real track record justifies it, with audit log and rollback always available.

**Why GBDT alone was rejected as a full replacement**: GBDT has documented, real, peer-reviewed rare-event bias (see Section 6) and produces a black-box rate, not an interpretable, directly-tunable rule. The profile system stays as the actual scoring mechanism specifically because it's auditable and directly steerable; GBDT's real value is as a calibration *signal*, not the final output.

---

## 2. PER-FACTOR RESEARCH FINDINGS AND LOCKED DESIGN (real, cross-validated, multi-source)

For each factor: real micro-factors found, whether player tiers are needed (and how many), whether direction (over/under) matters, and whether the factor needs graduated variation bands or is better served by a continuous formula/flat multiplier. Every finding below was checked against multiple independent real sources before being written down here — not accepted from a single source.

### Weather — genuinely 4 distinct mechanisms, not one factor
- **Wind**: real, established finding — wind blowing out to left helps RH pull hitters most, out to right helps LH pull hitters most; effect is weak-to-reversed for opposite-field hitters (real, replicated across independent sources — RotoGrinders wind-scoring analysis, physics-based carry research). Needs real tiers (2-3 real pull-tendency bands, not more) **crossed with park orientation** — the tier basis is real fly-ball/pull-tendency, not a generic "good/bad hitter" label. Direction relevant (out=overs, in=unders). Wind *speed* itself is continuous (formula, no bins — real physics: an average 10mph headwind turns a 400ft HR into a 370ft out).
- **Temperature/altitude/pressure**: real, quantified, near-linear physics (+4ft carry per 10°F, +6ft per 1000ft altitude, +3.5ft per 1 inHg pressure drop — cross-validated via multiple physics sources). **No tiers at all** — pure formula, forcing bins here would discard real precision for nothing.
- **Precipitation**: a genuinely different mechanism (grip/control, not ball flight) — belongs with BB/K props, not HR/TB. Separate sub-model.
- **Roof status**: binary gate (closed = zero out every other weather micro-factor), not a variation.
- **Real, independent validation** (Obsidic, a real modern MLB projection system): "weather adjustment is naturally weighted toward players who hit fly balls whereas a ground-ball pitcher... won't see much impact" — confirms the player-specific (not generic) weighting design.

### Umpire Tendency
Real, current, time-sensitive finding: MLB's 2025-2026 ABS challenge system has **measurably compressed** real umpire-to-umpire variance (league walk rate jumped to 9.6%, highest in a decade; professional bettors report real umpire edges "are slightly smaller now"). Historical umpire data from before this rollout would overstate today's real effect — must be weighted accordingly. Needs real tiers (3 bands: pitcher-friendly/neutral/hitter-friendly), direction relevant, but variation within a tier should be a continuous multiplier off the umpire's own real zone-size deviation (each ump's real per-season sample is naturally small).

### Platoon/Handedness Matchup
Real, quantified, **asymmetric** magnitude: LHB vs RHP advantage ≈ 28 wOBA points; RHB vs LHP ≈ 16 points (cross-validated: Twinkie Town's Statcast analysis and FanGraphs' "The Book" chapter-3 research, 1999-2002 data, independently converge on the same order of magnitude). Real, critical micro-factor: **pitcher arm angle** massively scales this — sidearm/submarine relievers show 76-110 wOBA-point splits vs. ~6 points for standard-angle pitchers (Hardball Times research). Real driver of the split is primarily plate discipline (K rate down, BB rate up vs. the favorable hand), not raw power — meaning platoon matters more for K/BB props than pure contact-quality props. Tiers needed: batter handedness × pitcher arm-angle band (not a flat same/opposite binary). Real, honest caveat directly from the literature: "observed splits are one part true talent, one part random variation" — real, individual reverse-platoon players exist and require real per-player shrinkage weighted by sample size, not a uniform rule.

### Catcher Framing (separate from Catcher Pop-Time/Arm — these do NOT belong in one bundled "catcher context" factor, they have disjoint prop relevance)
Real, precisely quantified, continuous relationship (FanGraphs pitch-framing research): each framing run per game adds 3.9% to the pitcher's K rate, subtracts 3.9% from BB rate. **No tiers** — pure formula off the catcher's real framing-runs number. Direction relevant.

### Catcher Pop-Time/Arm Strength — real, dedicated relevance to opposing stolen_bases only
Confirmed via multiple independent real sources (SABR/Dewan, academic thesis models, Pitcher List's real regression work) this belongs with the dedicated Stolen-Base factor family (below), not with framing.

### Lineup Slot + Quality of Surrounding Lineup (two real, distinct inputs — not one)
Real, near-linear relationship by literal slot number (Smart Fantasy Baseball's real PA/RBI-by-slot data: ~0.10-0.11 fewer PA per game per slot drop; real RBI pace differences by slot). **No tiers** — formula by slot number. Direction relevant mainly for counting-stat overs. Real refinement from benchmarking THE BAT X (industry-leading, verified real system): "Quality of Surrounding Lineup" is a **real, separate input** from raw slot — a hitter's real RBI opportunity depends on the on-base ability of hitters batting ahead of him, not just his own slot number. Needs to be added alongside slot, not folded into it.

### Bullpen Fatigue & Schedule/Travel Fatigue (already deeply researched in an earlier session this project, reconfirmed here)
Bullpen: real, established finding that high-leverage relievers (closers/setup, identified via real saves/holds in the last 2 days) absorb disproportionate bullpen work — real tiers needed (2-3 bands by leverage role), not a flat team-wide fatigue score. Schedule/Travel: real, canonical MLB-specific research (Song/Allada et al., Northwestern/PNAS, 20 years of real MLB data) found jet-lag effects concentrated in **eastward** travel specifically, limited effect after westward travel (consistent with the >24h human circadian period) — real directional asymmetry, already implemented as `eastward_travel_flag`/`westward_travel_flag` in the Team Schedule Spot daily-context worker.

### Player Availability
Fundamentally a **gate**, not a graduated influence — real limitation (IL return, known workload cap, platoon-only role) triggers a flat penalty specific to that limitation type, not a tiered scale. Matches the user's own stated example pattern ("a negative lineups impact incurs a flat 5% penalty regardless of line number").

### Market/Implied Team Total
Naturally continuous (the market's own implied-run-total number is the real input) — no tiers, direction relevant (higher implied total lifts that team's hitter overs broadly).

### Opposing Pitcher Quality — likely the single most consequential factor found this research phase
Real, quantified magnitude from a peer-reviewed Bayesian academic paper: the difference in expected wOBA between facing a great (25th-percentile-quality) vs. poor (75th-percentile) pitcher is **~45 wOBA points** for a median batter — statistically indistinguishable in magnitude from the real difference between a great and poor **batter** (~36-41 points) facing the same pitcher. Pitcher quality deserves roughly the same real weight as the batter's own skill, not a minor adjustment. **No tiers** — real, established precedent (FanGraphs community analysis) already uses a continuous multiplier off xFIP- (luck-adjusted quality vs. league average, piecewise above/below 100), matching a well-established, published approach rather than an invented one. Real, useful distinction for pitcher-side hits_allowed specifically: K rate mechanically removes PAs from hit-contention; BB rate indirectly adds them back (more batters faced); this is why xwOBA-against/xFIP- (not raw ERA) is the correct real input — ERA is confounded by luck/defense in ways xFIP- strips out.

### Defensive Quality (OAA) — refined via benchmarking to be matchup-specific
Real, mechanically clean relationship: OAA is already expressed as a per-play probability delta (a catch on a 75%-probability ball = +0.25 real credit), converting directly into a continuous adjustment with no binning needed. Real refinement from benchmarking THE BAT X: elite real systems apply this as a **matchup-specific** layer — crossing the specific hitter's own spray-angle/batted-ball tendency with the opposing defense's positioning/quality at those exact spots — not a blended team-aggregate OAA number. Relevant to hits/singles/doubles/hits_allowed; irrelevant to HR (clears the fence), BB, K.

### Stolen Base — its own dedicated factor family, confirmed to have almost zero overlap with the other 9-10 factors
Real, independently converging research (SABR/Dewan, an academic thesis model, Pitcher List's real regression analysis, a Naive Bayes prediction writeup) all land on the same real predictor set: catcher pop time + arm strength, pitcher hold/delivery time to the plate, runner sprint speed, and OBP as the real opportunity gate (can't steal first). None of weather/umpire/lineup-slot/bullpen-fatigue meaningfully touch this prop. Must be modeled as its own real family, not a slice of the other factors.

### Times Through the Order (TTOP) — real, genuine academic disagreement, resolved toward the more rigorous side
Original, widely-cited research (Tango et al. 2007) found a real effect (+9 wOBA points 1st→2nd TTO, +8 more 2nd→3rd). A more recent, rigorous Bayesian re-analysis found that after properly controlling for confounders — critically, **survivorship bias** (only pitchers already performing well survive to face a lineup a 3rd/4th time) — there's "little evidence of strong discontinuity" specifically at the classic 3rd-time cutoff. Locked design decision: use a **continuous** "expected batters faced this game" adjustment tied to the starter's own real, established workload tendency, rather than a discrete TTO-tier cliff — honest about the effect being gradual, and directly usable for our actual props (full-game totals, not sequence-specific ones).

### Park Factors — static baseline, distinct from day-of Weather, mature and well-established methodology
Real, convergent methodology across multiple authoritative independent sources (FanGraphs, Baseball Prospectus, Baseball-Reference): standard real practice is 3-5 year regressed park factors (never single-year, too noisy), still shrunk toward league average even with multi-year data (same shrinkage principle as `classification_v6`). Must be **component-specific** (HR factor ≠ 2B factor ≠ BB factor) — a park does not affect all events by the same multiplier. Real, directly relevant finding: rare events show enormous real park-level variance — "triples factors can range from 40 to 300" vs. modern HR factors rarely outside 60-140 — independent, additional confirmation (at the park level, separate from the earlier player-level finding) that triples' calibration difficulty is a genuine, well-documented property of the stat itself, not a pipeline bug. Combines multiplicatively with day-of Weather — the two are genuinely separate (static baseline × daily deviation), never conflated.

---

## 3. THE FACTOR × PROP-LINE RELEVANCE MATRIX (locked)

Not all factors matter for all props — this gate runs before any tier/direction/variation logic, so a given leg only gets evaluated against factors actually relevant to its specific prop.

| Factor | Full relevance | Partial relevance | No relevance |
|---|---|---|---|
| Wind/temp/altitude/pressure | HR, total_bases, doubles, triples | hits (marginal) | BB, K, stolen_bases |
| Rain/precip | BB, K, hits_allowed, walks_allowed | — | HR, TB, stolen_bases |
| Umpire zone tendency | K, BB, hits_allowed, walks_allowed | earned_runs | HR, stolen_bases, lineup-driven props |
| Platoon/handedness | K, BB | HR, hits, TB | stolen_bases |
| Catcher framing | pitcher K, BB, walks_allowed | — | HR, TB, stolen_bases |
| Catcher pop-time/arm | opposing stolen_bases | — | everything else |
| Lineup slot + surrounding quality | runs, rbis, hits_runs_rbis | hits, TB | rate stats, pitcher props |
| Bullpen fatigue | hitter-side HR, hits, TB, walks (vs. that pen) | — | starter's own props, stolen_bases |
| Schedule/travel fatigue | broad, shallow suppression | — | stolen_bases |
| Player availability | gates ALL props for that player | — | n/a (gate) |
| Market/implied team total | runs, rbis, hits, TB | HR | stolen_bases, BB, K |
| Opposing pitcher quality | hits, TB, HR, walks, hitter K | — | stolen_bases |
| Defensive quality (OAA), matchup-specific | hits, singles, doubles, hits_allowed | — | HR, BB, K |
| Stolen-base dedicated family | stolen_bases only | — | everything else |
| Times through order | pitcher full-game K/hits-allowed/earned-runs totals | — | hitter props, stolen_bases |
| Park factors (component-specific, static) | matches each component's own real relevance (HR factor→HR props, etc.) | — | — |

---

## 4. REAL-WORLD BENCHMARK VALIDATION

**THE BAT X** (Derek Carty's system — widely regarded industry leader, verified real DFS/betting track record, ~13% career ROI cited): real, published factor list is Opposing Hitter/Pitcher, Ballpark, Weather, Umpire, Catcher (Framing/Throwing/Intimidation), Bullpen, Home Field, Platoon Splits, Role, Lineup Position, Quality of Surrounding Lineup, Defense — strong independent validation that our factor list isn't missing anything major. Three real refinements adopted from studying how they actually implement this (matchup-specific spray-based defense, Quality of Surrounding Lineup as a distinct input, pitcher role-adjustment for swingmen). "Catcher Intimidation" noted as real but likely too soft/unquantifiable to build reliably — flagged, not adopted.

**Real sportsbook methodology** (multiple independent real sources describing actual prop-pricing practice): confirms the same overall stack — recency+sample-size-weighted history, matchup adjustments, contextual factors, usage expectations. Real, honest, important finding: professional books themselves admit player-prop markets (especially on secondary players) are **less efficiently priced** than game lines — real, direct confirmation the opportunity this system is chasing is genuine, not imagined.

**FullCountProps** (a real, live modern system): uses LightGBM (a GBDT variant, same family as our training pipeline) trained on ~1M real plate appearances, feeding a Monte Carlo simulation (5,000 sims/game) to build the full probability distribution rather than a closed-form conversion — a real, modern alternative to our current Poisson/NB approach. Noted as a real future upgrade path, not adopted now (our simpler, already-proven approach is sufficient for the current stage).

---

## 5. WHERE THE GBDT TRAINING PIPELINE FITS (built this session, see `gbdt_training/`)

Confirmed role: **calibration signal for the profile system, not a replacement for it.** Real, concrete design: the GBDT's per-prop calibration-ratio math (already built and verified — see `HANDOFF_MASTER_SUMMARY.md`'s GBDT section) gets re-aimed at individual profile cells during the calibration loop, comparing what a profile cell predicted against what the GBDT (trained on the same real underlying data, but with richer per-player continuous features) would have predicted for the same real legs — a real, independent cross-check signal, not the source of truth itself.

Real, honest limitation already discovered and documented from GBDT training this session: more raw data volume alone did **not** fix rare-event calibration (triples, HR, stolen bases actually got slightly worse with more rows) — confirming, independently, the same real conclusion the park-factor and player-level research above reached: rare events need genuine feature richness and/or dedicated handling, not just more rows. This cross-validates across three completely separate lines of evidence (GBDT calibration testing, player-level tercile research, park-level factor-spread research) that rare-event props are a structurally different problem, not a fixable data-volume issue.

---

## 6. REAL, IMPORTANT METHODOLOGICAL CAUTIONS (from the academic literature, must inform the calibration loop's actual implementation)

- **Gradient boosting has documented, peer-reviewed rare-event bias** (ScienceDirect, "Gradient boosting for high-dimensional prediction of rare events") — real, structural, not specific to our data.
- **Hierarchical/empirical-Bayes shrinkage is the established, real countermeasure** — but multiple independent academic papers (clinical prediction modeling literature, directly transferable methodology) found: **shrinkage does not guarantee improvement for any given dataset, and the correct shrinkage amount is itself hardest to estimate reliably exactly where shrinkage is most needed** (low sample size). Real, established best practice: **bootstrap-based estimation of the shrinkage intensity** outperforms a fixed, hand-picked shrinkage constant. **Locked design implication**: the calibration loop must periodically re-estimate each profile cell's shrinkage intensity via bootstrap resampling of its own real outcome history, not apply one static, hand-picked shrinkage factor globally.
- **Time-series feature leakage**: confirmed via multiple independent real ML-methodology sources — any trailing/rolling statistic must be computed strictly backward-looking (only real games before the prediction date), and validation must use time-based splitting (train on earlier games, test on later ones), never a random shuffle. Already corrected in the GBDT pipeline this session; must carry forward into any recency-weighted profile-system inputs too.
- **Monotonic constraints** are real, directly supported (XGBoost's own `monotone_constraints`), and explicitly documented as most valuable "when training data is limited and the model might overfit a relationship that reverses direction spuriously" — precisely our rare-event situation. Already applied in the GBDT pipeline; the same domain-knowledge-encoding principle should inform which profile-system relationships get treated as strictly monotonic (e.g., wind speed → HR rate should never be allowed to invert) versus left free.

---

## 6.5 REAL, EXACT STABILIZATION POINTS (Russell Carleton's established, widely-cited sabermetric research, cross-validated by an independent Baseball Prospectus follow-up study using an improved split-half methodology) — this directly locks the sample-size thresholds referenced throughout Section 6

Real, exact plate-appearance/balls-in-play counts before a given rate stat reliably reflects real talent rather than sample noise:

**Hitters**: strikeout rate 60 PA, walk rate 120 PA, HBP rate 240 PA, HR rate 170 PA (but HR-per-fly-ball needs only 50 real fly balls — much faster if conditioned on FB rate), single rate 290 PA, GB/FB rate 80 BIP, LD rate 600 BIP, AVG 910 AB, OBP 460 PA, SLG 320 AB, ISO 160 AB, BABIP 820 BIP, **XBH rate 1,610 PA — the slowest of all real hitter stats measured**.

**Pitchers**: strikeout rate 70 BF, walk rate 170 BF, HBP rate 640 BF, single rate 670 BF, GB/FB rate 70 BIP, LD rate 650 BIP, AVG 630 BF, OBP 540 BF, SLG 550 AB, ISO 630 AB, HR rate 1,320 BF, XBH rate 1,450 BF, BABIP 2,000 BIP.

**Why this matters concretely**: a full-time hitter gets roughly 650-700 real PA in a season. Real, hard confirmation: **XBH rate (1,610 PA) essentially never fully stabilizes within a single season for any individual player** — this is the precise, quantified, independently-sourced explanation for exactly why triples (and to a lesser extent doubles, HR) showed persistent real calibration drift in every GBDT test this session, no matter how much same-season data was added. It isn't a modeling bug; it's a real, measured property of the underlying stat needing multiple real seasons of data before an individual player's own rate can be trusted over the population/tier prior. K rate and walk rate, by contrast, are real, fast-stabilizing (60-120 PA/BF) — confirming why those props showed strong, reliable GBDT calibration from the very first single-season test.

**Locked design implication**: these exact real numbers become the actual sample-size denominators for each profile cell's real shrinkage weight in the calibration loop (Section 6) — not an arbitrary constant, and not uniform across props. A cell backing a K-rate-driven prop can trust its own real observed data far sooner than a cell backing an XBH-rate-driven prop, and the calibration loop's confidence weighting must scale accordingly, per prop, using these real, established reference points.


- Exact real tier counts per factor that needs tiers (Weather-wind, Umpire, Platoon, Bullpen) — the research above gives real ranges (2-3 bands typically) but the final exact cut points need to be fit against real historical data, not guessed.
- Calibration cadence — daily vs. weekly vs. hybrid — flagged as "whichever proves better empirically," not yet decided with real evidence.
- The exact bootstrap-shrinkage-estimation procedure for the calibration loop (Section 6) — real methodology identified, exact implementation not yet designed.
- DB schema for the profile grid itself — not yet designed, intentionally deferred until this research document was locked first, per explicit instruction ("study each factor first... then design").
- "Catcher Intimidation" and pitch-count/IL-return-specific limits — both flagged as real but low-priority/hard-to-quantify; explicit decision needed on whether to build now or defer.

---

*This document should be read in full before any schema or implementation work begins on the Enrichment/Final Scoring rebuild. It supersedes any earlier, shallower factor-design notes referenced in `HANDOFF_MASTER_SUMMARY.md`'s GBDT section regarding "the full locked feature set."*
