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

---

## 7. VALIDATION LEDGER — every imported claim proven against OUR real data (owner rule 2026-09-28: validate everything)

**Nothing from references/Gemini/web is trusted until checked against our real NBA data or an authoritative source.** The MLB doc itself was wrong twice and produced a fake +1298% finding from a data defect — so every carried claim is verified here.

### 7a. The real slip infrastructure EXISTS and is validated (not assumed)
Functions in `nba_market` (verified present): `pp_slip_power(factors[])`, `pp_slip_power_conservative`, `pp_power_after_voids(factors[], live)`, `pp_slip_flex2(p1,p2,power2)`, **`pp_flex_standard_payout(legs, hits, original)`** (the real Flex partial-payout table), `pp_round_step`, `pp_refresh_prices`, `pp_price_version`. Plus `nba_score.simulate_slips(strategy, from, to)` and `nba_score.paper_pick_slips(date, threshold, snapshot)` — **a slip simulator already exists** (Phase 3 builds on it, doesn't start from zero). Payout convention (config `board_payout_conversion_rules`, "verified against app screenshots + 19 placed slips 2026-09-10"): slip mult = PRODUCT of leg mults (2-8% real slip-level haircut, modeled as plain product = conservative); Sleeper `1+(dec-1)×0.95`; Underdog `decimal(American)×0.963`.

### 7b. Real PP Flex payout table (queried from `pp_flex_standard_payout`, matches published PrizePicks exactly)
6-pick: 6/6=25× · 5/6=2× · 4/6=0.4× (else 0). 5-pick: 5/5=10× · 4/5=2× · 3/5=0.4×. 4-pick: 4/4=6× · 3/4=1.5×. 3-pick: 3/3=3× · 2/3=1×. 2-pick: 2/2=2× · 1/2=0.5×. Power tiers: 2=3× · 3=6× · 4=10× · 5=20× · 6=37.5×.

### 7c. VALIDATED break-even per leg (identical legs), computed from OUR real payout functions
| Size | Power break-even p | Flex break-even p |
|---|---|---|
| 2 | 0.58 | 0.62 (2-pick Flex==Power top, but 1/2 pays only 0.5×) |
| 3 | 0.56 | 0.58 |
| 4 | 0.57 | 0.56 |
| 5 | 0.55 | 0.55 |
| 6 | 0.55 | 0.55 |

**Findings (validated, some CORRECTING imported claims):**
- ✅ **Web's Power break-evens (~58% 2-pick → ~55% deeper) CONFIRMED** on our real tables. Research was accurate here.
- ❌ **REFUTED — web/Gemini "Flex has the lowest break-even / is strictly easier" is FALSE for identical legs.** On our real tables Flex break-even ≥ Power at equal per-leg p (2-pick 0.62 vs 0.58; 3-pick 0.58 vs 0.56). Reason: at identical high p the all-hit tier dominates, and Flex's lower top payout (6-pick 25× vs Power 37.5×) costs more than the partial tiers recover. The smartstake "6-Flex break-even 54.2%" figure does NOT reproduce on our verified table for identical legs — do not use it.
- ✅ **Gemini's core math point STANDS: Flex EV ≠ p·m product; must be full distribution** `EV = Σ_k P(exactly k)·payout_k`. Its real advantage is HETEROGENEOUS legs (strong anchor + weaker satellites) where partial tiers rescue slips the all-hit tier loses — the identical-leg break-even understates this. So: compute Flex EV over the full distribution AND test it specifically on heterogeneous pools; do NOT assume Flex is globally easier.
- **Net for the engine:** Power decided by p·m (identical-leg) / product-of-factors (real); Flex decided by full-distribution EV. Both break even ~0.55-0.58; our recalibrated best legs realize ~0.55-0.59 (fact 124) → edge is razor-thin and real only in the best-selected cells. `p·m>1` (Power) remains the primary discard filter; Flex candidates get the full-distribution test, never the p·m discard.

### 7d. VALIDATED — Gemini's apex NBA edge (injury-driven usage redistribution) is REAL in our data
Test (real `nba_stats.player_game_log`, both seasons): defined "star" = player averaging ≥30 min AND ≥20 pts in a season; compared non-star teammates' (≥15 min) scoring in games where ≥1 team star was PRESENT vs ABSENT:
| Star | player-games | avg pts | avg min | pts/min |
|---|---|---|---|---|
| present | 65,667 | 11.07 | 26.18 | 0.413 |
| **absent** | 9,554 | **12.51** | 27.03 | **0.454** |
**+1.44 pts (+13%) and +9.9% pts/MINUTE when the star is out** — the per-minute lift proves it's genuine usage redistribution, not just more minutes. Large real sample (9,554 star-absent games). This is the direct, measurable "context that creates role change" Gemini named as the NBA apex edge, distinct from the noisy environmental context that failed in MLB (§6b). **CAVEAT (per §6b master lesson): +1.44 pts is a LEG-LEVEL gradient — necessary but NOT sufficient. It must be tested at the SLIP level (does it push those legs to p·m>1 / +EV Flex?) before it's a real edge.** But it is now proven worth leading Phase 2 with (data infrastructure confirmed: `player_game_log` 36-col box score, `player_game_log_usage` 22-col usage rates, `injury_report_snapshots`, `availability_delta` all present). ### 7e. VALIDATED — the Flex-vs-Power crossover (heterogeneous legs), with a real threshold
Tested Gemini's "Flex wins with heterogeneous legs" concretely: 5-pick slip, 1 anchor at p=0.72 + 4 satellites at varying p_s, full-distribution EV from the real `pp_flex_standard_payout` vs Power (0.72·p_s⁴·20):
| satellite p_s | Flex EV | Power EV | winner |
|---|---|---|---|
| 0.50 | 0.981 | 0.900 | both −EV, Flex closer |
| **0.51** | **1.036** | 0.974 | **Flex +EV, Power −EV** ← Flex rescues |
| 0.52 | 1.094 | 1.053 | Flex |
| 0.53 | 1.154 | 1.136 | Flex |
| ~0.535 | — | — | **CROSSOVER** |
| 0.55 | 1.281 | 1.318 | Power |
| 0.57 | 1.417 | 1.520 | Power |
**Validated rule (real threshold, not a vibe):** with a strong anchor, **Flex wins when the marginal legs are weak (~0.50-0.53)** — the partial tiers (5-pick: 4/5=2×, 3/5=0.4×) turn a losing Power slip into a +EV Flex slip (p_s=0.51: Flex +3.6% vs Power −2.6%); **Power wins when all legs are strong (~0.55+)** because its higher top payout dominates. Gemini's heterogeneous-leg point CONFIRMED and quantified. Engine consequence: don't pick Flex-vs-Power globally — pick per slip by comparing the two real EVs; Flex is the tool for "one strong anchor + marginal satellites," Power for "all-strong." (Crossover shifts with anchor strength and size — the engine computes both EVs per candidate slip rather than using a fixed rule.)

### 7f. VALIDATED — real NBA void/push/DNP rates (measured, not assumed; MLB scar: they assumed 7%, it was 0.06%)
Measured on `nba_market.prop_universe` `result`, both seasons: miss 927,889 (55.7%) · hit 690,212 (41.4%) · **void/DNP 24,995 (1.50%)** · null/ungraded 14,271 (0.86%) · push 9,657 (0.58%). Decisive (hit+miss) = 97.06%. **NBA void rate ~1.50%** — higher than MLB's 0.06% (basketball rests/scratches more) but not catastrophic. **Slip-EV consequence:** in PrizePicks a voided leg DROPS OUT and the slip shrinks to the next size down (5-pick w/ 1 void → priced as 4-pick) — REAL, already handled by `pp_power_after_voids(factors[], live)` (validated §7a). A void is NOT a loss, it's a size reduction, so ~1.5% slightly HELPS vs treating voids as misses. Push (0.58%): PP voids the leg like a DNP. **Engine must apply pp_power_after_voids and grade push per the app rule — never treat void/push as a miss.**

### 7g. VALIDATED — recalibration necessity + the FIRST real +EV slip construction
**Overconfidence at the p·m level (points/Over/standard, m=1.000):** raw model_p vs realized, by model_p bucket:
| model_p bucket | n | raw p | realized p | raw overstatement |
|---|---|---|---|---|
| 0.55-0.60 | 4,049 | 0.574 | 0.520 | +0.054 |
| 0.65-0.70 | 1,509 | 0.673 | 0.555 | +0.118 |
| 0.70-0.75 | 820 | 0.722 | 0.577 | +0.145 |
| ≥0.75 | 520 | 0.793 | **0.610** | **+0.183** |
Confirms fact 124 at the EV level: a raw "0.79" points leg realizes 0.61. **The engine's p MUST be the realized-calibrated value (what `build_recalibration_map.py` produces), never raw model_p** — else every p·m is overstated by up to 0.18. Single standard leg m=1.000 so p·m<1 always (max ~0.61) → standard edge exists ONLY in the multi-leg product (confirms fact 126).

**FIRST REAL +EV SLIP (validated, no assumptions):** two top-bucket (model_p≥0.70) points/Over/standard legs from DIFFERENT games (independent per fact 125), real graded outcomes, 3,304 real cross-game pairs:
- real joint both-hit = **0.3629** (≈ independent product 0.619×0.590=0.365 → cross-game independence CONFIRMED, no correlation penalty)
- 2-pick Power (3×): **0.3629 × 3 = 1.089 = +8.9% real EV**
This is the first concrete, real-data, positive slip-level EV in the NBA build — recalibrated high-confidence points/Over legs, different games, 2-pick Power, ~+9%. Moves the edge from "thin and theoretical" to "measured at +8.9% on 3,304 real pairs." NEXT: test 3-pick (does the deeper payout beat the lower joint?), other props, and whether a real daily pool supports enough such pairs under the 50-leg cap.

### 7h. VALIDATED — size AMPLIFIES a positive sign (3-pick Power beats 2-pick on top legs; contradicts "2-pick is sharpest")
Same top bucket (points/Over/standard, model_p≥0.70), different games, real outcomes:
| structure | real hit | payout | EV | sample |
|---|---|---|---|---|
| 2-pick Power | joint 0.363 | 3× | **+8.9%** | 3,304 pairs |
| 3-pick Flex | 2/3 in 66.7% | 3×/1× | +13.1% | 6,281 triples |
| **3-pick Power** | all-3 0.232 | 6× | **+39.2%** | 6,281 triples |
**On genuinely +EV legs (realized ~0.61), 3-pick Power (+39%) >> 3-pick Flex (+13%) >> 2-pick Power (+9%).** This CONTRADICTS the web/Gemini "2-pick is the sharpest/lowest-variance" claim — that holds for marginal legs, but when legs are truly +EV the higher 6× payout of 3-pick more than compensates the extra leg (0.61³×6=1.36 > 0.61²×3=1.12). Directly confirms the MLB master lesson "size COMPOUNDS the sign already present" — here the sign is positive, so bigger amplifies it (until variance/placement-cap/pool-depth bite). **This flips the default: don't assume small slips; size up as long as p·m>1 holds and the pool has independent legs.**
**CAVEATS (MLB scars, must resolve before this is a locked finding):** (1) greedy on ALL top legs, NOT tie-break tested (Rule B0c — re-run ≥2 orders); (2) uses raw model_p≥0.70 filter, not the recalibration map's calibrated p yet; (3) does not yet check daily pool depth (are there enough independent top legs per real slate to build these under the 50-leg cap?); (4) variance rises with size — the loss-frustration preference may favor 2-3 pick even at lower EV. Real day-by-day slip simulation (Phase 3, `simulate_slips`) is what turns this from a pooled-pairs EV into a locked strategy. But the DIRECTION — size helps when the sign is positive — is validated and real.

### 7i. VALIDATED + GEMINI-RECONCILED — slip-size theory: raw-EV climbs with size, but KELLY (bankroll growth) PEAKS AT 3-PICK
EV-by-size on OUR real Power ladder (2=3× 3=6× 4=10× 5=20× 6=37.5×), by per-leg realized p:
| size | EV @p=0.61 | EV @p=0.58 | EV @p=0.55 | Kelly frac @p=0.61 |
|---|---|---|---|---|
| 2 | +11.6% | +0.9% | −9.3% | 5.82% |
| **3** | **+36.2%** | +17.1% | −0.2% | **7.24% ← peak** |
| 4 | +38.5% | +13.2% | −8.5% | 4.27% |
| 5 | +68.9% | +31.3% | +0.7% | 3.63% |
| 6 | +93.2% | +42.8% | +3.8% | 2.55% |
**Findings (Gemini-challenged, validated on our real ladder):**
- **Raw EV keeps climbing to 6-pick when legs are +EV** (p=0.61 → +93% at 6-pick) — confirms §7h and the MLB "size compounds the sign" lesson.
- **BUT optimal bankroll fraction (Kelly f = (p^n·m − 1)/(m − 1)) PEAKS AT 3-PICK (7.24%)** then declines (4:4.27%, 5:3.63%, 6:2.55%). For actual wealth growth, 3-pick is the sharpest size, NOT 6-pick.
- **Win frequency by size** (p=0.61): 2-pick 37%, 3-pick 23%, 6-pick **5%** (95% losing slips). Loss-frustration preference (owner) → strongly favors 2-3 pick.
- **Marginal legs (p=0.55) barely clear anywhere** — negative 2-4 pick, +0.7%/+3.8% at 5-6 pick only. THIS is why the web says "2-pick sharpest" — it is, but only for marginal legs, and marginal legs are barely playable at all. The real money is in getting p to ~0.60+ (recalibrated leg selection), then playing 3-pick.
**UNIFIED ENGINE RULE (data + web + Gemini + owner preference all agree):** for genuinely +EV legs, **3-pick Power is the default sharpest structure** — highest Kelly stake, +36% EV, ~1-in-4 win rate, tolerable drought. Size up toward 4-6 only for a raw-EV/profit-max sub-strategy under strict bankroll control; size stays 2-3 for the frequent-win/low-frustration primary. Gemini corrected its own earlier "2-pick sharpest" to "3-pick sharpest for a real edge." p=0.55 marginal legs → skip or 5-6 pick only.

### 7j. VALIDATED — recalibration is AS-OF-SAFE (the edge is NOT a hindsight/leakage artifact — the MLB defect class)
The gravest risk: if the recalibration map (fact 124) is fit on data that includes the day being priced, every +EV finding is inflated by hindsight (this is the class of error behind MLB's fake +1298%). Tested whether season-1-fit calibration predicts season-2 realized (points/Over/standard):
| model_p bucket | S1 realized (n) | S2 realized (n) | drift S1→S2 |
|---|---|---|---|
| <0.55 | 0.4785 (11,955) | 0.4708 (13,089) | −0.008 |
| 0.55-0.65 | 0.5296 (3,019) | 0.5177 (3,952) | −0.012 |
| 0.65-0.75 | 0.5664 (858) | 0.5608 (1,471) | −0.006 |
| ≥0.75 | 0.5798 (188) | 0.6265 (332) | +0.047 (small n) |
**Calibration drift is tiny (≤0.012) in the well-sampled buckets — a map fit on prior data predicts future realized hit rate accurately.** This proves the as-of approach is sound: pricing today's legs from prior-season + prior-day calibration will NOT systematically mislead, so the validated +EV findings (§7g-7i) are real, not hindsight. **Caveat:** the ≥0.75 tail drifts more (+0.047) on small samples → the top bucket MUST use shrinkage (n/(n+K=200), already in `build_recalibration_map.py`) and never be trusted raw. **Backtest rule locked:** the recalibration map used to price a leg on date D must be fit only on data STRICTLY BEFORE D (prior season entirely + within-season up to D−1), rebuilt walk-forward — never pooled across the test window. This is the parity rule (fact 100) applied to slip building.

### 7k. VALIDATED — daily pool depth: single-prop is too thin, multi-prop pooling is NECESSARY (and the 50-leg cap BINDS)
Real per-slate counts (327 slates, both seasons), legs at model_p≥0.70:
- **points/Over/standard ALONE:** avg 4.1 top legs, only 2.4 distinct games → only **203/327 days (62%) can build a 2-pick cross-game**, **134/327 (41%) a 3-pick cross-game**. A single prop/side CANNOT sustain daily placement.
- **ALL props pooled:** avg **90 top legs / 7.3 distinct games / 31 distinct players per slate** → **309/327 days (94%) can 3-pick cross-game**, **324/327 (99%) 3-pick cross-player**.
**Two foundational consequences:**
1. **Multi-rank / multi-prop pooling is NECESSARY, not just optimization** — one prop is too thin to place most days; the rank system's job is partly to assemble enough independent legs daily. This is WHY Phase 1 builds many ranks.
2. **The 50-leg/day cap BINDS** — 90 raw top legs/slate >> 50 → the engine's problem is SELECTING the best ≤50, not finding enough. This validates the owner's ROI-under-cap framing: it's an optimization/selection problem. (Real playable pool < 90 after recalibration + p·m>1 filter — the 90 is raw top bucket; recalibrated realized ~0.55-0.61, only p·m>1 legs are truly playable, so the effective pool is smaller but still cap-binding on most slates.)
**Caveat (MLB scar §6a):** avg games/slate is only 7.5 — on small slates (2-3 games) cross-game legs are scarce, so days_3pick_crossgame at single-prop is genuinely limited; the all-props pool solves this but concentrates legs in fewer games on light nights, raising correlation exposure (fact 125). The engine must respect cross-game preference even when it reduces the pool on light slates.

### 7l. VALIDATED — recent-form is a TRAP as naively used (hot-hand is noise; cold→reversion is the real signal); + the player_id join bridge
**Data-plumbing found & fixed:** `nba_market.prop_universe.player_id` (raw NBA id, e.g. "201143") does NOT match `nba_stats.player_game_log.player_id` ("nba_2544") — zero join. **The correct bridge is `player_game_log.nba_player_id::text = prop_universe.player_id`** (verified: 23,283 hits on a 500-leg sample). All box-score-based signals (form, usage, injury) MUST use this bridge. (This is the same name/id-scheme hazard that has bitten the system repeatedly — fact 118 name-normaliser.)
**Recent-form test** (points/Over/standard, model_p≥0.60; player's prior-5-game avg pts vs the line, real box scores):
| recent form vs line | n | realized hit |
|---|---|---|
| cold (recent avg ≥2 BELOW line) | 223 | **0.6278** ← highest |
| neutral (±2) | 2,539 | 0.5439 |
| warm (+2-6 above) | 2,516 | 0.5457 |
| hot (+6 above line) | 492 | 0.5549 |
**Findings (counterintuitive, validated):** the "ride the hot hand" intuition is FALSE here — hot (0.555) ≈ neutral (0.544), no meaningful edge. The strongest bucket is COLD players (0.628): when recent avg is well below the line, the model/line over-corrected for a temporary slump (bad stretch / injury return) and the player reverts UP, clearing the Over. **Confirms Gemini's trap warning: "blind hot/cold streaks" are noise; regression to the mean is the real force.** A naive "recent form" rank (over-weight hot players) would HURT. The usable form signal is CONTRARIAN (cold→revert) and needs bigger samples + mechanism (why cold: injury return? role change? — ties to §7d injury edge). **Engine: do NOT build a naive hot-hand rank; if form is used it's the reversion direction, gated by mechanism.** This is exactly the "leg-level gradient that would mislead" the MLB lesson (§6b) warns about — validated before it could poison a rank.

### 7m. VALIDATED — season-phase effect (real, unpriced) + final_hp join integrity (safe partial join)
**Season phase** (points/Over/standard, model_p≥0.60): early(<30d) realized 0.5549 · mid 0.5512 · **late(<21d to season end) 0.5352** — late-season ~2pp WORSE (load management / rest / erratic minutes, exactly the owner's prediction). Claimed model_p stable ~0.67 across phases → **the model does NOT know about the phase effect, so it's a genuine UNPRICED adjustment.** Modest (~2pp) but at break-even margins it matters. **Decision: rank_foundation carries season_phase (early/mid/late); ranks down-weight or flag the late window.**
**final_hp join integrity** (ranks 2-4 need it): on 2026-01-15, prop_universe standard legs 3,153 → joined to final_hp **2,829 (89.7%)**. Diagnosed the 10.3% unjoined: spread PROPORTIONALLY across all props (rebounds 74, reb_ast 54, assists 38, points 36...) and hit rate **exactly 0.500 (neutral) → UNBIASED**, unlike the MLB defect where missing rows were 92% goblin. The gap is alt/edge line rungs final_hp (board-scoped, 21 props) doesn't carry. **Safe. Builder uses LEFT JOIN final_hp** (keep every prop_universe leg; null the HP fields where absent so ranks 1/5/6 still see all legs, ranks 2-4 use the ~90% that have HP).
**Phase 1 substrate design LOCKED:** `nba_score.rank_foundation` = one row per graded standard leg with as-of `cal_p`, `pm = cal_p·factor`, `hit`, `role_tier`, `season_phase`, and (LEFT-joined) baseline_hp/final_hp/score. All six ranks are sorts/filters over this one honest substrate. Builder `nba/build_rank_foundation.py` (report mode; RF_WRITE=1 to build after owner review). Report-mode substrate confirms the season-phase and p·m distribution before any write.
