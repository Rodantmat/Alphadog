# NBA — SLIP BUILDING STRATEGY

Owner's master doc for the NBA slip-building phase. **MANDATORY: update this after every message so no progress is lost.** Companion to `NBA_COMPASS.md` (facts 108-126 are the pre-slip foundation). MLB slip work in the repo root is REFERENCE ONLY — NBA is a different sport with different correlation, tiers, and board mechanics; import structure, never assumptions.

---

## 0. OWNER'S CHARTER (verbatim intent, 2026-09-28)

**Goal:** an automated engine that builds/updates ranks day-by-day, tests all layers, and finds the highest-ROI slip strategy (which may be a mix of sub-strategies working together — not concurrent competing ones). Not built now, but every piece is designed toward it.

**Priorities, in order:**
1. **ROI is always the priority.** 1 slip/day at 100% ROI is ideal; but that's likely too dangerous and should be caught by the gates. ~50-60 legs/day/app is the feasible placement ceiling. Weight ROI against placement reality; with 2 seasons of data we find the balance.
2. **Break-even = real dollars:** $1/slip × N slips returns exactly $N. Positive ROI, as positive as possible.
3. **Loss-frustration control (preference):** a strategy that wins a little most days is preferable to one that wins big once a week and loses 6 days, even at similar ROI. Reconsiderable, but preferred.

**Hard rules:**
- **BACKTEST = REAL REPLAY.** Qualify real legs, build real slips, anchored to real days/games/players/lines, priced with the real multipliers we already stored, graded on real outcomes. NEVER proportionally extrapolate a few tested days to two seasons — that is not a backtest. We built 2 full seasons of real board snapshots + priced legs + outcomes precisely so we can replay them for real.
- **Data bands must be granular** — 1% or finer where testing percentages; never coarse 5-10% jumps.
- **Gates are a reality check, not a leg/slip killer** — tight but realistic, passable but not generous. Their job is to help, not to kill the system.
- **Recency + season-phase weighting:** last season's end ≠ two years ago; early-season volatility, mid-season trades, playoff mechanics, end-season load-management all weight differently. Must be built into the ranks.
- **Multipliers are DONE** — legs are already priced (PP via the mapped model, UD via formula, derived proplines via conservative shading). Slip building consumes existing prices.
- **Same leg can appear on 2 apps; 2 apps never on the same slip.**
- **Gemini** (bridge tool) used often — whenever not 100% sure of a source, or caught looping/assuming without research. Second opinion / challenge / independent research.
- **Online research is critical** — understand what strong, settled, reliable systems do. Never go on gut/internal-only.
- **ROI > Profit** when they conflict (a smaller-investment higher-ROI setup beats a larger-investment higher-profit one).

---

## 1. THE BUILDING BLOCKS (owner's taxonomy)

- **Ranks** — ways to trail legs and surface strong candidates that frequently clear break-even. (Owner's proven set + new researched ones — see §3.)
- **Signals** — a second layer that enhances or purges the rank (rank-over-rank, mined individual factors, player/team/system characteristics). Different signals affect different props/directions/tiers differently.
- **Multipliers** — DONE; legs pre-priced.
- **Slip size** — 2/3/4/5/6; exponentially priced, differs by app. Focus PP + UD first (only apps with back board snapshots).
- **Slip type** — Flex vs Power; different payouts/structure/pros-cons; each app uses its own mechanics. Focus on what has back data.
- **App slip restrictions** — same-player-2-props, same-team, same-game, same-prop-line, etc.; allow/penalize per app.
- **Correlation** — how one leg affects another in a slip; a basketball reality first, app-mechanics second. Extremely important for NBA.
- **Strategy gates** — multiple validation layers (hard/soft hurdles) proving a strategy holds long-term.

---

## 2. PROVEN FOUNDATION ALREADY IN HAND (COMPASS 108-126, verified this session)

- **Data layer clean & ready:** `final_hp` 7.22M rows (baseline_hp, final_hp, score, confidence, edge — all non-null, both seasons); `prop_universe` 1.67M legs (96.4% usable, all 3 kinds, correct factor economics); `board_outcomes` 6.9M graded. Pricing layer (`pp_slip_*`, conservative mode) validated.
- **OVERCONFIDENCE MAP (fact 124):** the model RANKS correctly but is OVERCONFIDENT above ~0.55. Correction mapped by prop × side × role_tier × line-magnitude → `build_recalibration_map.py` → `nba_score.recalibration_map`. Best legs: high-conf **Over** on **points/turnovers/steals** for **STARTER/IRON_MAN**; traps: **fgm/oreb/fga** (invert at top) and **FRINGE** legs (hit <0.50 at high conf). **Slip EV must use recalibrated p, never raw model_p** (overconfidence compounds across a product).
- **CORRELATION (fact 125), measured:** same-player overlapping props HUGELY positively correlated (pra+pts_reb cov +0.214) → **at most one prop per player per slip**; same-team both-Over slightly negative; different games ≈ independent (cleanest to combine).
- **SLIP-STRUCTURE (fact 126), researched:** Power break-even ≈ 58% (2-pick) → ~55% (3-6 pick); Flex-6 ≈ 54.2% (lowest). 2-pick Power = sharpest. Our best recalibrated legs realize ~0.55-0.59 = right AT break-even → edge is thin, lives in leg SELECTION + correlation avoidance, not leg count. Reproduce break-evens from OUR verified payouts.

---

## 3. RANKS — owner's proven set (need MORE via research)

Proven by owner (still expand):
1. **Prop-line high hit rate** — per prop-line, granulated bands / leg-by-leg, hit rate; which clear break-even; top-N or top-% by highest hit rate. Factors: prop, player tier, goblin/demon tier, line-variation number, player form (each moves the multiplier, which ultimately sets whether above break-even).
2. **Baseline hit probability** — top hit-rate legs, granulated leg-by-leg.
3. **Final hit probability** — same, enriched final HP.
4. **Final score** — confidence-affected HP.
5. **Player high hit rate** — per player × all prop-lines/variations/directions they appear; each with hit rate → break-even + profit map.
6. **Plain prop-line hit rate** — player-agnostic, rotating; each band holds players/lines/directions/variations at a constant high hit rate, rotates as players fail/succeed.

Cross-cutting principles the ranks must honor:
- **Recency + season-phase weighting** (see §0).
- **Line variations vs goblin/demon tiers:** using a raw line (e.g. points 10.5) works but is far MORE volatile player-to-player than using goblin/demon tiers (the anchor is board-set per player+tier, varies less). Prefer tier anchoring where possible.
- Ranks feed either the ranking layer OR the signal (filter/enhance) layer; multiple layers + multiple signals per strategy allowed.

**NEW ranks to research (§ Phase 1 preface):** TBD — deep research + Gemini.

---

## 4. PHASE PLAN (owner-approved 2026-09-28)

- **Phase 0** — Read MLB slip references (root: SLIP_STRATEGY_V1_*, HIGH_HIT_RATE_METHODOLOGY, SIGNALS_TECHNIQUES_TRIED, COWORKER_DAILY_SLIP_RESEARCH_PROMPT, alphadog-v2-slip-builder.js) carefully as reference; verify what exists; create this doc; open research. **← IN PROGRESS**
- **Phase 1** — RANKS. Research preface first (find new ranks/trailings + design recency & season-phase weighting), then build ALL ranks across all seasons, granular (1% bands / leg-by-leg), each measured vs the RECALIBRATED real break-even. Persist as an updatable table.
- **Phase 2** — SIGNALS. Deep research + measurement; signals are prop/direction/tier-specific. Expand far beyond current factors — anything proven to give a granular edge.
- **Phase 3** — SLIP MECHANICS per app (PP + UD first): exact multiplier curves, Power/Flex, sizes 2-6, restrictions, and the basketball-correlation model (then app rules). Real backtest engine (real replay only).
- **Phase 4** — GATES. Exhaustive research; multiple hard/soft layers covering every long-term risk; tight-but-passable.
- **Phase 4.5** — REVIEW CHECKPOINT with owner: assess findings, sharpen/discard, decide if more ranks/signals/data needed BEFORE the engine.
- **Phase 5** — AUTO-ENGINE: daily rank rebuild + layer search for the best-ROI strategy (mixable sub-strategies) under the 50-leg cap, with loss-frustration preference.

MLB reference files (root): `SLIP_STRATEGY_V1_SPEC_AND_BLOCKERS.md`, `SLIP_STRATEGY_V1_VERIFICATION_ADDENDUM.md`, `HIGH_HIT_RATE_METHODOLOGY.md`, `SIGNALS_TECHNIQUES_TRIED.md`, `COWORKER_DAILY_SLIP_RESEARCH_PROMPT.md`, `GOBLIN_DEMON_*`, `MULTIPLIER_TABLES_MASTER.md`, `alphadog-v2-slip-builder.js`.

---

## 5. PROGRESS LOG
- **2026-09-28** — Phase 0 opened. Doc created. Owner charter + taxonomy + phase plan recorded. Foundation (COMPASS 108-126) carried in: data clean, overconfidence mapped, correlation measured, slip-structure researched.
- **2026-09-28** — Read MLB `HIGH_HIT_RATE_METHODOLOGY.md` (reference). Extracted the transferable rules into §6 below. These are hard-won MLB scars that protect the NBA build; they reshape Phase 1. Next: read remaining MLB refs (SIGNALS_TECHNIQUES_TRIED, SLIP_STRATEGY_V1_*, alphadog-v2-slip-builder.js), then Phase 1 research preface.

---

## 6. TRANSFERABLE LESSONS FROM THE MLB BUILD (structure only — NBA specifics differ)

From `HIGH_HIT_RATE_METHODOLOGY.md`. These are METHOD rules proven by real MLB scars; adopt the method, re-derive every NBA number.

- **Rule B0 — build real buckets, never trust the platform's displayed probability.** Selection = real per-(prop, side, line-or-tier) hit-rate tables from actual graded outcomes, select buckets clearing a real sample-size + hit-rate bar. MLB's original bar: n≥30 graded, hit rate in the 80%+ range. (NBA bar TBD — our recalibrated ceiling is ~0.55-0.59, so an 80% raw bar is MLB-specific; NBA must set its bar off the recalibrated curve + real break-even, fact 124/126.) This IS the owner's rank taxonomy, validated.
- **Rule B0a — label CLASS and LANE on every pool.** class = fixed-threshold vs tiered (verify empirically from real line-count data, never assume); lane = standard/goblin/demon. **LANE IS THE DOMINANT EV AXIS** — the same leg at the same hit rate can swing EV by >1000 pp between standard and goblin lane (MLB `doubles/less/0.5`: +1298% standard vs −13% goblin). Our fact 124 already separates kind; this confirms kind/lane is the #1 axis, above prop class.
- **Rule B0b — never blend pricing across a pool.** Each leg priced by ITS OWN real multiplier; a blended/averaged multiplier caused a real 6.5× ROI overstatement (+216% reported → +32.9% real). Report the cheapest-vs-priciest leg spread; >~20% spread ⇒ blended pricing is materially wrong. **= the owner's "no proportions/assumptions" hard rule, with a real scar.**
- **Rule B0c — ranked-greedy results must report tie-break sensitivity.** Inside a homogeneous bucket the platform score has ~zero predictive power (whole-board r=+0.414 but single-bucket r=+0.001); the same config swung +25.9%→+12.5% on tie-break order alone (69.4% of legs tied within-day). Every ranked backtest re-runs with ≥2 deterministic tie-break orders and reports the RANGE; unstable across tie-break = noise, not a finding.
- **Fixed vs tiered is structural:** fixed-threshold props (rare events, one sensible line ~0.5) have NO real ladder — don't force-fit tiers; tiered props have a real anchor+ladder where hit rate scales with tier depth, and the usable sweet spot is the deepest tier that still carries real volume (n≥10-20), not the theoretical deepest (n=1-2). Classify empirically per prop.
- **The catastrophic bug pattern to avoid:** a data defect (is_goblin/is_demon defaulting 0/0, read as "standard lane") produced a fake +1298% pool. Root causes: (1) reading a label from a non-authoritative column, (2) an inner join whose denominator was conditioned on a filter correlated with the outcome (same class as a `... IS NOT NULL` filter bias). **Always read labels/lanes from the authoritative source; never let a join's denominator be conditioned on something correlated with what you're measuring.** For NBA: verify tier/kind on prop_universe is authoritative (fact 119 flagged board_scored's are NULL — use prop_universe), and never measure hit rate on a join filtered by a correlated condition.
- **Live pricing accumulates** (MLB built per-leg pricing-observation tables from real placed slips). NBA analog: our pricing is already mapped (PP) / formula (UD); the recalibration map (fact 124) is the NBA equivalent of "correctly priced for the first time."
- **A high hit rate is NOT sufficient** — always cross-check against the real per-leg multiplier before calling a pool +EV. (Our fact 126: best legs sit AT break-even, so hit rate alone never proves edge.)

### 6a. THE MASTER LESSON (from `SIGNALS_TECHNIQUES_TRIED.md`, MLB session 10 headline) — `p·m` decides everything
**Every payout model in the system reduces to the per-leg product `p × m`** (recalibrated hit probability × real per-leg multiplier). **When `p·m < 1`, NO size, cap, correlation rule, ranking, or signal can produce a positive track — size only compounds the sign already present.** This retro-explained why, across two MLB seasons, every cap sweep / adaptive-sizing / correlation control moved ROI by single digits and never flipped a sign: they were all operating on a quantity that cannot change the sign. **Consequences for NBA:**
  1. The FIRST thing to compute for any candidate leg is `p·m` with the RECALIBRATED p (fact 124) and the REAL multiplier (pp map / UD formula). If `p·m ≤ 1`, discard — no downstream cleverness rescues it. This is the primary rank filter.
  2. This is WHY fact 124 recalibration is non-negotiable: a wrong (overconfident) p inflates `p·m` and every backtest lies. MLB's best-ever bucket (`walks_allowed/more/0.5`, 87.4% hit) still had `p·m = 0.966 < 1` → negative. High hit rate, still a loser, because m was small.
  3. Slip size is a variance/compounding choice on an already-decided sign, NOT an edge source. Pick size for the loss-frustration/placement profile, not to manufacture EV.

### 6b. WHAT FAILED AT SLIP LEVEL DESPITE A REAL LEG GRADIENT (do not re-chase blindly; re-test fresh only with reason)
- **Context/environment stacking repeatedly FAILED**: weather/temperature (real −12.5pp monotonic gradient on one pool!), bullpen fatigue, park factors, schedule fatigue, opposing-lineup OBP, umpire tendencies, upper-tail buffer (real +9.7pp Q1→Q5). Pattern: **a real, monotonic leg-level gradient is NECESSARY BUT FAR FROM SUFFICIENT** — nearly all died at slip construction ("same failure mode as every prior stack"). Phase 2 must test every signal at the SLIP level, never stop at a leg-level gradient.
- **`score_0_100` has NO within-pool predictive power** (whole-board r=+0.414 but single-bucket r=+0.001). Confirms our fact 124: ranking works ACROSS confidence but the platform/model absolute score does not discriminate WITHIN a homogeneous bucket. Rank by real bucketed hit rate, not by a raw score.
- **Adaptive/greedy sizing** mostly bought a few days of coverage at an ROI cost — not a free win; sometimes landed on the worst size.

### 6c. WHAT ACTUALLY WORKED (the rare positives — the shape of a real edge)
- **Sleeper lineup SLOT** (starting position 1-2) = "a genuine, large, unpriced leg-quality gradient on more-side hitter props" — the ONLY Sleeper pool that ever cleared `p·m > 1` (slots 1-2: 2-pick +9.3/+19.2%, 3-pick +24.1% tie-break-invariant, LODO 0/10 folds negative). **Lesson: positional/ROLE signals can carry real slip-level edge where context-stacking cannot.** NBA analog to research: minutes/usage/starter-role signals (fact 124 already shows role_tier is a strong axis).
- **`pitcher_fantasy_score/less` standard lane** = the first track to PASS tie-break sensitivity (sign never flipped across 4 orders, 2-6 pick). A clean, high-`p·m`, standard-lane single-prop pool. **Lesson: a clean single-prop standard-lane pool with real `p·m>1` is the most robust structure** — matches our fact 126 (2-pick Power on well-calibrated standard legs).
- **Cross-app transfer** worked once (a PP pool ported to Underdog stayed positive) — a signal proven on one app is worth testing on another.

### 6d. METHOD DISCIPLINE confirmed by MLB scars
- **DNP/void adjustment was a non-issue** (0.06% of hitter legs, not the assumed 7%) — measure, don't assume. (NBA: verify the real DNP rate rather than carrying a guess.)
- **Coverage matrix**: MLB kept a signal×track matrix where every session had to move ≥2 cells from ❌ to ✅ with a real cited result. Adopt an NBA signal×(prop/lane/tier) coverage matrix so gaps shrink measurably and nothing is silently skipped.
- **Use the UNION of outcome sources**, deduped, with the label read from the authoritative table — never one writer alone (one missed the locked pool entirely).

### 6e. GEMINI CHALLENGE (2026-09-28, gemini-2.5-flash) — two corrections to the MLB-derived conclusions
Consulted Gemini as a skeptical second opinion before carrying MLB's `p·m` rule into NBA. It corrected two things; both adopted.

**CORRECTION 1 — `p·m<1 = dead` is POWER-ONLY, NOT Flex.** Power is an all-or-nothing parlay, so p·m governs it (MLB session-10 headline holds for Power). **Flex pays on partial hits, which breaks the simple product rule.** A pool of legs marginally negative on the top tier can still be +EV as a Flex slip if the partial tiers hit often enough. **Correct Flex EV = full outcome distribution:**
  EV = Σ_{k=0}^{N} P(exactly k of N correct) · Payout_k
  where (non-identical p_i, the real case) P(exactly k) is summed over all 2^N hit/miss combinations, NOT a plain binomial. Payout_k from OUR verified Flex tables (PP 6-Flex pays 6/6, 5/6, 4/6; UD similar). **Consequence for the engine: compute Power EV via p·m product, but Flex EV via the full distribution — never apply the p·m<1 discard to a Flex candidate.** There exist p·m<1 legs that form +EV Flex slips. (MLB's own doc over-generalized "every payout model reduces to p·m"; Gemini is mathematically right that Flex does not.)

**CORRECTION 2 — the MLB "context fails / role wins" lesson does NOT transfer cleanly to NBA.** In NBA, injury and minutes context DIRECTLY create the role/opportunity change — they are impactful, measurable, direct context, not the noisy environmental context (weather/park) that failed in MLB. **NBA edges to prioritize testing, ranked by likelihood of surviving slip-level EV (Gemini):**
  1. **Injury-driven usage/opportunity spikes** — a high-usage teammate OUT → quantify who absorbs the vacated minutes/shots/assists/rebounds. Lines are sticky and under-adjust the SECONDARY beneficiaries (they move the star's line, miss the playmaker's assists jump). *This is the apex NBA edge.* Testable: player per-minute/per-game P/R/A/S/B with vs without the key teammate. (Ties to our F8-1 availability wiring and fact 124 role_tier.)
  2. **Minutes-projection discrepancies** — blowout risk (starters sit / bench extended), foul-trouble history, rotation changes, minutes restrictions on returnees, new-acquisition minutes. Platform uses generic per-minute × static minutes; dynamic minutes are the edge.
  3. **Lagging / line-shopping vs sharp books** — PP/UD lines lag FanDuel/DK/Caesars; a de-vigged sharp line vs the PP line is a direct arb signal. (We have market lines in the system — testable now.)
  4. **Extreme pace / matchup outliers** — works in NBA (unlike MLB) when the magnitude is extreme and unpriced; direct on the stat category.
  5. **Role-specific archetype mispricing** — rebound-only centers (points inflated), high-assist low-scoring guards (assists undervalued), block specialists (stable prop). Generic models price concentrated-role players poorly.
  **NBA TRAPS (do not chase):** vague "good/bad matchup" without a quantified mechanism; revenge-game/narrative; blind hot/cold streaks (regression unless an underlying role change explains it — which loops back to #1); over-reliance on season averages (NBA too dynamic — early-season, fatigue, trades, coaching); niche high-variance props (1st-basket).
  **Net:** in NBA the context CREATES the role signal — distinguish impactful direct context (injury/minutes) from noisy indirect context (environment). Phase 2 leads with #1 and #2.

### 6f. GEMINI BRIDGE NOTE
The bridge's default model `gemini-2.0-flash` is DEPRECATED (returns 404). **Always pass `model: "gemini-2.5-flash"` explicitly** on `call_gemini`.
