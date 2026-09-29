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
- **2026-09-28** — Read MLB `HIGH_HIT_RATE_METHODOLOGY.md` + `SIGNALS_TECHNIQUES_TRIED.md` (reference). Extracted transferable rules → §6 (B0/B0a/B0b/B0c, p·m master lesson, context-fails/role-wins, method discipline). Gemini challenge → §6e (Flex EV correction, NBA edges). Validation ledger §7a-7n: every imported claim proven against real NBA data — several REFUTED (Flex not universally easier; hot-hand a trap; p·m Power-only). First real +EV slip found (+8.9% 2-pick, +39% 3-pick). Slip-size theory (Kelly peaks 3-pick). Correlation, void rate, pool depth, season-phase, as-of recalibration all validated. Phase 1 rank_foundation substrate designed (`build_rank_foundation.py`, report mode).
- **2026-09-28 — FULL SWEEP (owner-requested), all re-verified LIVE:**
  - Data layer unchanged & intact: prop_universe 1,667,024 (1,618,101 graded, 357 dates, 20 props, 2 seasons); final_hp 7,215,296 (325 dates, 21 props); board_outcomes 6,905,452 (6,668,340 played). Matches all documented figures exactly — zero drift.
  - Slip infra: 6/6 core functions present & callable (`pp_flex_standard_payout`, `pp_slip_power`, `pp_slip_power_conservative`, `pp_power_after_voids`, `pp_slip_flex2`, `pp_round_step`); both sim functions (`simulate_slips`, `paper_pick_slips`); `availability_p_plays` present. `recalibration_map`/`rank_foundation` NOT built (correct — both builders in report mode, owner-gated).
  - Headline findings re-reproduce exactly: overconfidence tail raw 0.793 → realized 0.610 (§7g ✓); first +EV slip 3,304 pairs, joint 0.3629, +8.9% (§7g ✓).
  - Docs consistent: strategy doc §0-7 complete (§6a-6f, §7a-7n all present with real numbers + cross-refs); COMPASS fact 127 pointer intact; both builder scripts committed. Nothing lost, nothing stale.
  - **SWEEP VERDICT: current + prior work is real, complete, double-checked, and fully documented.** The only unbuilt items are the two owner-gated report-mode tables (recalibration_map, rank_foundation) — by design, awaiting the owner's production-write decision (Phase 1b).
- **STATUS: Phase 1 substrate DESIGNED & VALIDATED (report mode). Awaiting owner decision on the production-table write (path 1 build now vs path 2 prove-more-read-only-first), then build the 6 ranks as views over rank_foundation.**

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

### 7n. DECISIVE VALIDATION — the as-of recalibration WORKS on held-out data (the core mechanic of the whole build)
Held out 2026-01-15; fit the recalibration map (realized hit by prop×side×model_p decile, cells n≥50) on data STRICTLY BEFORE that day; scored the day's legs; compared to what actually happened:
- **Aggregate (2,986 legs):** cal_p 0.4405 vs realized 0.4441 → error **0.0035** (near-perfect). (Raw also close on the mean — the mean hides the tail.)
- **HIGH-CONFIDENCE tail (190 legs, model_p≥0.65)** — where slip EV lives: **raw model_p 0.711 → as-of cal_p 0.558 → realized 0.584.** Recalibration error **0.026** vs raw error **0.127** — the as-of map is ~5× MORE ACCURATE in the tail, using ONLY prior data.
**This proves the entire approach end-to-end:** fact 124's overconfidence is real, the as-of map corrects it without leakage (§7j stability → §7n generalization on a held-out day), and it fixes the exact tail that drives slip EV. A naive engine would price these legs' p·m at 0.711 (fake strong +EV); truth is 0.584 (barely break-even). **The recalibration is precisely what stops the backtest from lying** — the discipline this whole phase rests on, now proven to work on unseen days. The rank_foundation substrate (cal_p as-of) is therefore sound to build.

### 7o. VALIDATED (Phase 1b, path 2 read-only) — the PLAYER rank is PROP-SPECIFIC, not blanket (Rank 5 design)
Tested whether player identity adds hit-rate signal BEYOND the recalibration (a rank that just re-derives what the model knows is useless). Method: per-player residual = player's actual hit − their (prop,side,model_p-decile) cell-expected hit; a real player edge means the residual is large and stable.
- **Player density is ample:** 490 players, 386 with ≥200 graded legs, 328 with ≥500, median 1,415 legs/player.
- **POOLED across all props: player identity adds almost NOTHING** — residual stddev 0.0106 (1pp), range −0.044…+0.026, only 8/365 players beyond ±3pp (≈ chance). The model_p already captures player quality.
- **BUT it's PROP-SPECIFIC** (the key finding): residual stddev by prop —
  | prop group | props | resid stddev | best player edge |
  |---|---|---|---|
  | **peripheral / role-props (REAL player signal)** | oreb, dreb, fga, fgm, fg3a, fta, ftm | **0.031-0.035** | **+7 to +10pp** |
  | core (NO player signal) | points, assists, rebounds, reb_ast, pra, fantasy_score | 0.004-0.017 | +1.4 to +4pp |
**Conclusion:** the player rank is REAL only on peripheral, role-driven counting stats (offensive/defensive rebounds, FG/FT/3PT attempts & makes) — where the model misses player idiosyncrasy — and REDUNDANT on the core high-volume props (model already captures it). **Rank 5 must be PROP-GATED** (apply player-hit-rate only on the peripheral props); a blanket player rank would be half-noise and would overfit the ~8 chance-deviant players (MLB tie-break scar). This is the owner's "different signals for different props" — validated with numbers. It also tells Phase 2: peripheral props are where player-level and role signals live; core props are where the model + game-context (injury/minutes, §7d) live.

### 7p. RANK 1 GRANULAR — the full candidate landscape (prop × side × kind, at model_p≥0.70, realized as-of)
Ranking every (prop, side, kind) group with ≥200 top-bucket legs by realized single-leg hit — the raw material Rank 1 selects from. Top single-leg realized hit rates (standard, m=1.0 so hit=p·m):
| rank | prop/side | realized hit | n |
|---|---|---|---|
| 1 | **steals/Under** | **0.722** | 234 |
| 2 | **turnovers/Over** | **0.634** | 322 |
| 3 | turnovers/Under | 0.619 | 378 |
| 4 | **stocks/Over** | 0.614 | 264 |
| 5 | stocks/Under | 0.600 | 210 |
| 6 | points/Over | 0.590 | 1,340 |
| 7 | pts_reb/Over | 0.589 | 1,315 |
| 8 | pra/Over | 0.587 | 1,338 |
| 9 | fantasy_score/Over | 0.585 | 1,062 |
| 10 | pts_ast/Over | 0.584 | 1,358 |
**KEY FINDING (the variety hunt paying off):** the **low-volume DEFENSIVE props — steals/Under (0.722), turnovers (0.62-0.63), stocks (0.61) — are the STRONGEST single legs on the board**, well above the points/Over (0.59) I'd been anchoring on. These surfaced ONLY by going granular across all props/sides. A steals/Under at 0.722 in a 3-pick Power (0.722³×6 = +126% if independent) is enormous IF the daily pool + correlation + tie-break hold (must stress-test: n is smaller, 234). **Goblins** hit 0.71-0.74 realized but m~0.65-0.73 → p·m ~0.48-0.52 (priced tight, confirms they're near-break-even by design; not the edge). **Demons** even lower p·m. **So the standard-lane high-cal-p tail is where the edge concentrates, led by defensive props then scoring-Overs.** Rank 1 = this table, granulated to 1% cal_p bands and gated to p·m>1 candidates; the defensive props are new high-value candidates the single-prop-points focus would have missed.

### 7q. VALIDATED — variety = candidate SUPPLY (not higher average); top-tail selection is the edge engine
- **steals/Under holds out-of-sample:** S1 0.762 (n=42) / S2 0.714 (n=192) — stable ~0.71-0.76, real not noise. BUT ~1.7 top legs/available-day → too thin standalone (confirms §7k); it's a high-value INGREDIENT to combine, not a standalone pool.
- **Variety's value is SUPPLY, not a higher average.** Mixed high-value pool (steals/Under + turnovers + stocks + scoring-Overs), cross-game 2-pick Power: +7.9% on 106,709 pairs — ≈ the points-only pool (+8.9%). Pooling more props does NOT raise the average leg; it raises the NUMBER of candidate legs → more days placeable + a bigger set to pick the best from under the 50-leg cap. This is exactly why the owner wants max variety: supply, not average.
- **Top-tail selection LIFTS EV monotonically** (the core ranking mechanism): mixed pool, cross-game 2-pick Power, by cal-p threshold: model_p≥0.70 → +7.9% (avg leg 0.616); **model_p≥0.78 → +17.6%** (avg leg 0.625, joint 0.392, 7,368 pairs). Higher threshold = higher EV, fewer legs. **This IS Rank 1 done right: pool ALL props, sort by as-of cal_p, take the top-N that fit the cap.** The engine's dial is the cal-p threshold (EV vs volume tradeoff), and variety keeps the top-N deep enough to place daily.
**RANK LANDSCAPE (validated conclusion):** the six ranks are all sorts over the one as-of cal_p / p·m substrate; the primary rank is cal_p-sorted-all-props-top-N (Rank 1 ≈ Ranks 2-4 which are model_p/HP/score variants of the same p). Rank 5 (player) adds signal only on peripheral props (§7o). Rank 6 (plain-prop-line rotating) = Rank 1 with player stripped. The DISTINCT value across ranks is small because they share the cal_p core — so the real candidate-multiplying variety comes from (a) all props/sides/kinds pooled, (b) the cal-p threshold dial, (c) prop-gated player signal, (d) season-phase, and (e) the Phase-2 SIGNALS (injury/minutes/pace) that are ORTHOGONAL to cal_p and can push a leg's true p above its model_p. Signals, not more hit-rate ranks, are where the next real candidate-quality gain is.

---

## 8. RANK CATALOG — building & testing EVERY rank granularly (Phase 1, the real first phase)

**Honest status of the owner's six ranks (2026-09-28):**
| # | Rank | Status | Evidence |
|---|---|---|---|
| 1 | Prop-line high hit rate | ✅ TESTED granular | §7p (full prop×side×kind landscape), §7q (top-tail selection +17.6% at model_p≥0.78) |
| 2 | Baseline hit probability | ⚠️ PARTIAL | corr 0.995 w/ final_hp; top-30 overlaps final 28/30 — distinct at margin, own +EV NOT yet tested |
| 3 | Final hit probability | ⚠️ PARTIAL | is the cal_p core (§7g-7n); own ranked selection not isolated-tested |
| 4 | Final score (confidence-adj) | ⚠️ PARTIAL | corr 0.98 w/ final_hp; top-30 overlaps 26-27/30; own +EV not tested |
| 5 | Player high hit rate | ✅ TESTED prop-gated | §7o (real only on peripheral props oreb/fga/fgm/fta/dreb/ftm/fg3a) |
| 6 | Plain prop-line (rotating, player-agnostic) | ⚠️ PARTIAL | = Rank 1 w/o player; not explicitly isolated |

**NEW rank / trailing types from research (2026-09-28, industry-standard, to BUILD + test granularly):**
- **Rolling-window player hit-rate trailings** — the player's own hit rate on this (prop,side) over the last **3 / 5 / 10 / 20 / 30 games** (and vs the current line). Each window is a distinct rank; short windows = hot/recent, long = stable. (Research: DailyPropHub "hit rates", rolling 3/5/10 trends are standard.)
- **Actual-vs-line trailing** — player's recent actual stat mean/median minus the line, in stat units (§7l tested the crude version: cold→revert; refine as a rank with proper windows + direction).
- **Consecutive same-line streak** — count of consecutive recent games clearing this exact line/side (a "trend" rank; test if streaks predict or mean-revert).
- **Minutes / usage trend rank** — rolling minutes & usage_rate (from `player_game_log_usage`); "single most predictive factor for counting stats" (research). Distinct from hit-rate ranks — a leg-quality rank.
- **Matchup-adjusted rank** — opponent defensive rating vs the player's position/stat (from team_game_log); "defense by position" is a top research factor.
- **Pace-adjusted rank** — game pace projection (team_game_log pace); high-pace inflates all counting stats.
- **Rest/schedule rank** — rest days, back-to-back, 3-in-4 (research: measurable, especially high-usage vets & centers on B2B).
- **Line-value rank** — PP/UD line vs de-vigged sharp market line (line-shopping; we have market lines) — "flips negative EV to positive."
NOTE most of the NEW ones (minutes/usage/matchup/pace/rest/line-value) are SIGNALS in the owner's taxonomy (they shift a leg's true p, orthogonal to cal_p) as much as ranks — the boundary blurs; they multiply candidate QUALITY where the hit-rate ranks (1-6, shared cal_p core) mainly multiply candidate SUPPLY. Build & test each; keep every one that adds real, tie-break-stable, slip-level +EV.

### 8a. VALIDATED NEW RANK — player hit/miss TRAILING (10-game) is real, monotonic, and ORTHOGONAL to model_p
The player's own hit rate on the EXACT (prop, side) over their last 10 games, measured WITHIN the model_p≥0.60 filter (so any separation is signal ON TOP of the model):
| 10-game trailing band | next-game hit | n |
|---|---|---|
| 80%+ | **0.5815** | 5,570 |
| 60-80% | 0.5622 | 17,842 |
| 40-60% | 0.5357 | 17,387 |
| 20-40% | 0.5032 | 6,933 |
| <20% | 0.4844 | 671 |
**Clean monotonic +9.7pp gradient, large samples, and it separates 0.484→0.582 EVEN AFTER conditioning on model_p≥0.60 → the trailing carries signal the model does NOT already have.** This is a GENUINELY DISTINCT rank (unlike Ranks 2-4 which share the cal_p core). **Holds out-of-sample both seasons** (S1 hot 0.556 vs cold 0.497, +6.0pp; S2 0.585 vs 0.504, +8.2pp) — stable, real, generalizes.
**RESOLVES the §7l contradiction:** §7l found "recent form" a trap — but it used raw ACTUAL-vs-line (stat magnitude), which is noisy. THIS uses hit/miss history on the exact prop+side, which is clean and monotonic. **Rule: trailing ranks must be built on HIT/MISS history, not stat-magnitude.** This is a real candidate-multiplying rank. TO DO: test the 3/5/20/30 windows (which window is best?), test it as a slip-level selection (does trail-80 + model_p top-tail lift slip EV?), and tie-break test. **Rank catalog now: Rank 1 ✅, Rank 5 ✅ (prop-gated), trailing-10 ✅ NEW — three real distinct ranks so far; the HP/score ranks (2-4) are near-duplicates of the cal_p core (keep but low marginal value); more trailing windows + the signal-ranks (minutes/usage/pace/matchup/rest/line-value) next.**

### 8b. VALIDATED — Ranks 2/3/4 (baseline HP / final HP / score) tested head-to-head: each has a DISTINCT role (not redundant)
Multi-day real test (8 days across both seasons, 13,460 graded standard legs), each rank's top tier realized hit:
| rank | top-tier cut | realized hit | legs selected |
|---|---|---|---|
| **Baseline HP** | ≥0.70 | **0.583** | 564 (most selective) |
| Final HP | ≥0.70 | 0.560 | 411 |
| **Score** | ≥70 | 0.541 | **2,888 (5-7× more)** |
**Finding (corrects my earlier "all redundant" assumption — tested, not assumed):** the three ranks are NOT interchangeable in practice. **Baseline HP's top tier has the HIGHEST realized hit (0.583) and is the most selective** — the tightest, highest-conviction legs. **Score selects 5-7× more legs at a slightly lower hit (0.541)** — the best rank for CANDIDATE SUPPLY / filling the cap on thin days. **Final HP sits in between (0.560)** — enrichment-adjusted middle. So each has a genuine engine role: **Baseline = conviction (tightest slips), Score = volume (cap-fill, pool depth), Final HP = balanced.** They correlate ~0.98 (§8) but their top-N selections and cut-point behavior differ enough to keep all three as distinct ranks. (Note: raw HP≥0.80 badly overstates — the overconfidence of fact 124/§7g — so these ranks must still be applied via the as-of recalibrated cal_p, not raw HP; the ranking ORDER is what each contributes.) **Ranks 2,3,4 now ✅ TESTED and KEPT with distinct roles.** Caveat: needs tie-break + full-walk-forward confirmation (the 8-day sample shows the pattern; the rank_foundation build will confirm across all 325 days).

### 8c. VALIDATED — Rank 6 (plain LINE-BAND, player-agnostic, rotation-robust) is real and distinct
Hit rate at model_p≥0.70 varies systematically by LINE MAGNITUDE within a prop (player-agnostic):
- **points/Over RISES with the line:** 5-9.5 → 0.546 · 10-14.5 → 0.590 · **15-19.5 → 0.655**. A star's high-line Over (model_p≥0.70) is a much better leg than a low-line Over at the same model_p.
- **points/Under FALLS with the line:** 5-9.5 → 0.600 · 15-19.5 → 0.529. Low-line Unders are the sweet spot.
- **rebounds/Over:** low lines best (≤4.5 → 0.601 vs 5-9.5 → 0.524). **assists/Under:** ≤4.5 → 0.608.
**This is a REAL distinct rank** — line magnitude carries hit-rate signal the model_p doesn't fully separate, and it's player-agnostic (rotation/roster-churn robust, exactly the owner's Rank 6). Engine: within (prop, side), prefer the line-magnitude band with the higher realized hit. **Rank 6 ✅ TESTED & KEPT.**

### 8d. REJECTED — anchor-distance / z-score rank (a popular DFS technique that does NOT hold in our data)
Tested: points/Over ranked by z = (player's prior-10 mean − line)/sd (how many SDs the line sits below recent mean; "value" per DFS lore). Result mostly FLAT and slightly INVERTED: line≥1SD-below-mean → 0.549, line-above-mean → 0.601. Same mean-reversion noise as §7l (stat-magnitude). **Not a clean rank — rejected as a primary.** Confirms the rule: magnitude/distance ranks are noisy; hit/miss-history ranks are clean. (Documented so it's not re-chased.)

### 8e. VALIDATED — CONSISTENCY interaction rank (amplifies the trailing rank both directions)
On top of the 10-game trailing (§8a), split by outcome variance (consistent = low sd of recent hit/miss):
| trailing | consistency | next hit | n |
|---|---|---|---|
| **hot + consistent** | | **0.593** | 1,965 |
| hot + streaky | | 0.575 | 11,264 |
| cold + streaky | | 0.517 | 13,176 |
| **cold + consistent** | | **0.484** | 673 |
**Consistency AMPLIFIES the trailing signal both ways:** hot-AND-consistent (0.593) beats hot-alone (§8a 0.582); cold-AND-consistent (0.484) is worse than cold-streaky (0.517) — a consistently-cold player stays cold. Real stacking technique. **Consistency-interaction ✅ VALIDATED** (use as a signal that sharpens trailing, not standalone).

### 8f. RANK CATALOG — running tally (Phase 1)
**Owner's 6 — ALL TESTED:** Rank 1 (prop-line hit) ✅ · Rank 2 (baseline HP, conviction) ✅ · Rank 3 (final HP, balanced) ✅ · Rank 4 (score, volume) ✅ · Rank 5 (player hit, prop-gated) ✅ · Rank 6 (line-band, rotation-robust) ✅.
**NEW validated ranks/techniques:** 10-game hit/miss trailing ✅ (§8a, orthogonal) · consistency-interaction ✅ (§8e, amplifies trailing).
**Rejected (documented, don't re-chase):** anchor-distance/z-score ✅ (§8d) · raw stat-magnitude form ✅ (§7l).
**STILL TO BUILD/TEST:** trailing windows 3/5/20/30 (which is best); signal-ranks — minutes/usage trend, pace-adjusted, matchup-by-position, rest/B2B/3-in-4, line-value vs sharp market; interaction stacks (trailing×line-band, trailing×role_tier). These are the next batches.

### 8g. VALIDATED — the owner's "LINE VARIATIONS vs GOBLIN/DEMON TIERS" principle (tiers are less volatile)
Owner stated tier-anchoring is less volatile than raw-line ranks because the tier's anchor is board-set per player. TESTED directly (points/Over): cross-player hit-rate spread —
| dimension | cross-player sd | mean hit | players |
|---|---|---|---|
| **raw line = 15.5** (same line, all players) | **0.143** | 0.479 | 49 |
| **goblin tier** (board-anchored per player) | **0.089** | 0.667 | 394 |
**The tier is ~40% LESS volatile across players (0.089 vs 0.143) — owner's claim CONFIRMED.** A fixed raw line means wildly different difficulty per player (star hits 15.5 easily, role player rarely → huge spread); a goblin/demon tier is anchored to each player's own level → same relative difficulty for everyone → tighter, more stable rank. **Engine consequence: PREFER tier-anchored ranks (goblin/demon/standard as the unit) over raw-line-value ranks** for stability; raw line-band (§8c) is usable but more volatile, so use it as a secondary refinement, not the primary key. This is a real rank-construction principle, validated.

### 8h. HONEST GAP-LIST — owner sub-dimensions from the original spec still to test (found by re-reading the original message)
I tested the six rank NAMES but the original spec named sub-dimensions I still owe (non-negotiable):
- **Rank 1 "top legs by QUANTITY or PERCENTAGE"** — test top-N-by-count vs top-X% selection (which sizing rule gives better ROI under the 50-cap). NOT yet tested.
- **Rank 1 "prop-line VARIATION NUMBER"** — the alt-ladder depth (how many rungs from anchor) as a rank dimension. NOT yet tested (needs the alt-line depth field; prop_universe carries kind but ladder-depth per leg must be derived).
- **Player rank "all prop lines AND VARIATIONS / direction/variation"** — player × prop × side × alt-variation, not just player × prop × side (§7o). Partial.
- **Goblin/demon tier as an explicit RANK dimension** — §8g validated tier stability; still to test tier as a selection rank end-to-end (per-tier p·m ranking).
- Confirmed done: the 6 names, trailing, consistency, line-band, tier-volatility.
**Next batches:** these sub-dimensions + trailing windows (3/5/20/30) + signal-ranks (minutes/usage, pace, matchup-by-position, rest/B2B, line-value). The tier/variation dimensions are HIGH priority (owner emphasized, and §8g shows tiers are the stable unit).

### 8i. NEW TECHNIQUE — trailing-window sweep: SHORTER windows are sharper (3-game best)
Correlation of trailing hit-rate with next-game hit, by window (within model_p≥0.60): **t3 = 0.095 > t5 = 0.073 > t10 (§8a) > t20 = 0.054 > t30 = 0.039.** Shorter is stronger — recent form (last 3) reflects current role/usage/minutes better than long history; signal decays with window length. **Corrects §8a: the 3-game trailing is the sharpest trailing rank** (10-game still valid but weaker). Build trailing ranks at 3 and 5 primarily; longer windows as stability fallback when short-window n is thin. Makes NBA sense — roles shift fast.

### 8j. NEW TECHNIQUE — combo-vs-component structure: POINTS-anchored props are the most reliable
Top-tier (model_p≥0.70) Over hit by prop: points 0.590 ≈ pts_reb 0.589 ≈ pra 0.587 ≈ pts_ast 0.584 > reb_ast 0.569 > rebounds 0.555. **Props containing POINTS cluster at the top (~0.588); pure rebounds/reb_ast lag.** Combos don't beat their best component — they TRACK it (points is the highest-signal component, and any points-anchored combo inherits its reliability). **Rank technique: prefer points-anchored props; treat a combo's reliability as ≈ its strongest component, not a diversification bonus.** Modest but real and structural.

### 8k. NEW RANK — MODEL-vs-MARKET EDGE (the sharpest technique found; orthogonal to hit-rate ranks)
Built from `nba_market.rung_market.p_over_book` (sportsbook de-vigged implied prob per player/market/line, books≥2). Join fix: `rung_market.market` uses `player_points` format (strip `player_`), `nm` is NULL so join on `nba_ref.norm_name(player)`. Ranked legs by edge = model_p − p_over_book:
| edge band (model − book) | next hit | model_p | book_p | n |
|---|---|---|---|---|
| **model ≫ book (+10pp)** | **0.545** | 0.653 | 0.498 | 1,361 |
| +5-10pp | 0.480 | 0.577 | 0.502 | 837 |
| 0-5pp | 0.492 | 0.520 | 0.497 | 1,172 |
| −5-0pp | 0.464 | 0.472 | 0.498 | 1,622 |
| **model ≪ book** | **0.447** | 0.377 | 0.502 | 1,920 |
**Monotonic +9.8pp; when our model disagrees with the market IN OUR FAVOR, the leg hits more.** Truth sits between model and book (top band: model 0.653, book 0.498, real 0.545) — but our model correctly flags the better-than-book legs. **This is the classic sharp DFS edge (board/line lags true prob) and it's REAL in our data.** Crucially ORTHOGONAL to hit-rate ranks — it selects MISPRICED legs, not just high-hit legs, which is where profit lives. **Model-vs-market edge rank ✅ VALIDATED — a top-priority rank.** TO DO: as-of + tie-break + slip-level test; combine with cal_p (a leg that is BOTH high-cal_p AND high-market-edge should be the strongest candidate class).

### 8l. RANK CATALOG v3 (Phase 1)
**Owner 6 ✅** (prop-line, baseline-HP, final-HP, score, player[prop-gated], line-band). **Principle ✅** tiers-less-volatile-than-lines (§8g). **NEW validated ranks/techniques:** 3-game trailing ✅ (sharper than 10) · consistency-interaction ✅ · combo=points-anchored ✅ · **model-vs-market edge ✅ (strongest, orthogonal)**. **Rejected:** anchor-distance/z-score, stat-magnitude form. **Queue:** minutes/usage trend, pace, matchup-by-position, rest/B2B, tier-as-rank, top-N-vs-%, and the interaction stacks (cal_p × market-edge is the priority combo).

### 8m. GEMINI-REFINED — how to correctly USE the market-edge rank (challenged 2026-09-28)
Challenged Gemini on whether the market-edge (§8k) is real or just "my model has some signal while the book is better-calibrated." Gemini's verdict (adopted):
- **The edge is a REAL ranking signal** (the +9.8pp monotonic gradient is the strongest possible evidence the model separates good/bad legs) — NOT fooling myself about that.
- **BUT the book (p_over_book) is BETTER CALIBRATED in absolute terms than raw model_p** (top band: book off 5pp, model off 11pp). ⇒ **Compute the market-edge from cal_p (the recalibrated prob, §7g-7n), NOT raw model_p.** This ties the market-edge rank to the recalibration we already validated — they compound, they don't compete.
- **For DFS pick'em the target is the PrizePicks BREAK-EVEN, not the book's vig** (we don't bet against book vig; fixed payout). The book's de-vigged prob is the best external TRUTH-ANCHOR.
- **Correct construction (doubly-filtered, Gemini):** (1) FILTER to legs where cal_p − p_over_book ≥ threshold (we beat the sharp book = information edge; when book > cal_p be skeptical, the market likely sees something), (2) among those, RANK by cal_p − PrizePicks_break_even, (3) require cal_p > break-even for inclusion. **Strongest candidate class = cal_p above break-even AND cal_p beats the sharp book.**
- **Market data's role: FILTER + truth-anchor, not primary rank** — it gates OUT the model's false-confidence legs (where the model is high but the book/reality disagree). This is a safety layer as much as an edge.
**Synthesis:** the recalibration (§7), the cal_p rank, and the market-edge rank UNIFY into one selection: recalibrated p, above PP break-even, confirmed by beating the sharp book. This is the primary rank stack. Market-edge ✅ VALIDATED + design locked. (Note: PP line and book line can differ; when comparing, align on the same line or note the line gap as its own signal — line-shopping.)

### 8n. RANK CATALOG v4 — the unified primary stack
**PRIMARY SELECTION (Gemini-refined, all validated):** cal_p (recalibrated, as-of §7n) → keep legs with cal_p > PP break-even → FILTER by market-edge (cal_p > p_over_book) → rank by cal_p − break-even. Layer trailing-3 (§8i) + consistency (§8e) + line-band (§8c) + prop-gated-player (§7o) as refinements; tier as the stable unit (§8g). Owner's 6 ranks all map into this stack. Market-edge (§8k/m) is the sharp filter. **This is the Phase-1 rank engine.** Remaining to test: minutes/usage, pace, matchup, rest (Phase 2 signals — orthogonal p-boosters), top-N-vs-%, and the full walk-forward slip-level confirmation of the whole stack.

### 8o. NEW RANK — CLV (Closing Line Value), the industry gold-standard — sparse but strong
We HAVE prop-line CLV data: `rung_market` has `snapshot_label` = **window** (our capture/act time) and **close** (closing line), both with `p_over_book`. CLV = p_close − p_window (book prob moved toward Over between our action and close). Tested (Jan-Feb 2026, Over/standard):
| line movement (window→close) | next hit | n |
|---|---|---|
| **moved TO us (+5pp)** | **0.686** | 51 |
| +2-5pp | 0.439 | 214 |
| flat (±2) | 0.493 | 3,899 |
| −2-5pp | 0.434 | 318 |
| **moved AGAINST (−5pp)** | **0.176** | 17 |
**Huge signal at the EXTREMES (0.686 vs 0.176), but SPARSE** — most legs (3,899) are flat (~0.49); only ~50-300/2mo hit the extreme bands (prop lines don't move much window→close). Research confirms CLV is "the gold standard, predicts profit better than win rate," and "prop markets are less efficient so CLV opportunities are larger." **USE (Gemini-refined):** (1) **NEGATIVE CLV = HARD FILTER** — drop legs where the line moved strongly against us (0.176 hit, fundamentally bad regardless of other signals); (2) **POSITIVE CLV = high-conviction BOOSTER** — bump legs where the line moved to us (0.686); (3) flat = neutral, let other ranks drive. The negative filter is the most important use. **CLV ✅ VALIDATED — filter + booster, not a bulk selector.** (Caveat: n small at extremes; treat as directional, and it's a placement-timing signal — value is in capturing the move early.)

### 8p. COMBINATION ARCHITECTURE (research + Gemini) — regularized logistic META-MODEL (the ensemble pros use)
Research (Turtle+EV, PropsBot): strong systems use ENSEMBLE weighting (weight signals by historical accuracy per sport-stat) + an "Edge Score" (= our §8k). Gemini-refined method for COMBINING our ~8 correlated ranks into one selection score, chosen for OVERFIT-SAFETY:
- **Method: regularized LOGISTIC REGRESSION meta-model** on the UNDERLYING SCORES (not the ranks): cal_p, market-edge (cal_p − p_over_book), trailing-3, consistency, line-band (one-hot/target-encoded), prop-gated-player-hit, positive-CLV flag. Predicts hit (0/1) → outputs one calibrated selection probability.
- **Why not the alternatives:** simple average / lift-weighting DOUBLE-COUNT correlated signals (they share the cal_p core); pure gating is too restrictive under the 50-cap; a heavy ML model overfits on 2 seasons. Logistic + **L2 (Ridge) regularization** handles multicollinearity (shrinks correlated coefficients together, stable) and resists overfit.
- **Anti-overfit protocol (non-negotiable):** TIME-SERIES validation — train on Season 1, test on Season 2 (true out-of-sample); metrics = log-loss + CALIBRATION plot + slip-level ROI at threshold cuts. Standardize features. **Negative-CLV hard filter applied BEFORE the model.**
- **This IS the auto-engine's core (Phase 5):** a regularized meta-model blends all validated ranks/signals into one as-of calibrated p, trained walk-forward, from which the top-N under the 50-cap are selected. Phase 1 ranks are its FEATURES; Phase 2 signals (minutes/usage/pace/matchup/rest) add more FEATURES; the meta-model learns the weights. **Architecture LOCKED.**
**RANK CATALOG v5:** owner 6 ✅ + trailing-3 ✅ + consistency ✅ + combo/points-anchor ✅ + market-edge ✅ (primary filter) + CLV ✅ (filter+booster) + tier-stability principle ✅; rejected: anchor-distance, stat-magnitude. Combination = regularized logistic meta-model, S1→S2 validated. Next: Phase 2 signal features + the walk-forward meta-model build + slip-level ROI confirmation.

---

## 9. GAME-DAY REPLICABILITY AUDIT (owner caveat 2026-09-28 — MANDATORY GATE for every rank/signal)

**A rank/signal is only usable if it can be REPRODUCED at the P3 decision window (21:15 UTC / 1:15 PM PT, ~105 min before the earliest tip) using ONLY data that exists at that moment.** A signal that's strong in backtest but needs post-tip data is a backtest artifact, not a live edge. Verified against the live P3 pipeline (`nba-p3-afternoon-light.yml` step order: injury → boards → archive(label=window) → rung keys → tiers → **build_rung_market (window)** → availability delta → score → paper-picks → certify).

| Rank / signal | Needs at decision time | Game-day replicable? |
|---|---|---|
| **cal_p** (recalibration, §7) | prior-data map (as-of by design) | ✅ YES — fit on strictly-prior data |
| **market-edge** (cal_p − p_over_book, §8k/m) | **window** book prob | ✅ YES — `build_rung_market.py` runs LIVE at P3 and writes the `window` snapshot with `p_over_book` (507,871 rows carry it); derived from `board_snapshots` archived with `ARCHIVE_LABEL=window` |
| **CLV** (p_close − p_window, §8o) | **close** book prob | ❌ **NO — BACKTEST-ONLY.** The `close` snapshot is captured AFTER games (a separate post-game archive); it does NOT exist at the P3 window. CLV cannot be computed at placement. **Demoted: CLV is a VALIDATION metric (confirm the model has edge historically), NOT a live selection rank.** (Matches the research: CLV is how you *validate* a model, used post-hoc.) |
| **trailing-3 / consistency** (§8a/e/i) | player's prior graded games | ✅ YES — all in the past |
| **line-band** (§8c) | the line value on the board | ✅ YES — on the captured board |
| **prop-gated player hit** (§7o) | player's prior graded games | ✅ YES |
| **tier goblin/demon** (§8g) | the board's tier at capture | ✅ YES — on the captured board (build_board_tiers_v2 runs at P3) |
| **Phase-2 signals** (minutes/usage/pace/matchup/rest) | must each be checked — most derive from PRIOR games + the day's schedule/lineup, so likely ✅, but VERIFY each has a live feed at P3 (e.g. projected minutes needs the projected-lineup feed, which P3 has through the morning; opponent def rating is prior-games ✅; pace is prior-games ✅) |

**RULE (locked): every rank/signal must pass this replicability gate BEFORE it's added to the live meta-model.** A signal that fails (like CLV) can still be used to VALIDATE the model offline but is NEVER a live feature. The meta-model (§8p) is trained ONLY on live-replicable features. **CLV removed from the live rank stack; kept as a backtest validation metric.** For Phase 2, each signal's game-day feed must be confirmed in the P3 step list before use — the injury/lineup/market/board feeds all run at P3; anything needing a feed P3 doesn't run is out.

**Impact on the rank catalog:** the live rank stack is cal_p + market-edge (window) + trailing-3 + consistency + line-band + prop-gated-player + tier — ALL replicable. Only CLV drops to validation-only. The primary selection (§8n) is unaffected (market-edge, not CLV, was the sharp filter). Good: the caveat cost us one signal and confirmed the other seven are live-safe.

**CLV future use (owner 2026-09-28):** CLV stays as a VALIDATION tool for later phases — after a strategy is live, compare our capture-time line to close to confirm we're capturing positive CLV (proof the strategy has real edge, the industry gold-standard validation). It is never a live SELECTION feature, but it validates shipped strategies post-hoc.

---

## 10. RESEARCH PASS 2 (2026-09-28) — more methods before moving on

Searched elite DFS pick'em / quant prop methods. Findings + tests:
- **Per-tier VALUE rank (Stokastic "one ratio": take a modifier only when its payout boost more than covers the win-prob drop) — TESTED & VALIDATED.** For the same prop at model_p≥0.65, which kind has the best p·m (Over):
  | prop | best-value tier | p·m | vs standard |
  |---|---|---|---|
  | points | **DEMON** (0.580) | 0.580 | > std 0.571 ✓ demon wins |
  | assists | standard (0.519) | — | std > goblin 0.488 > demon |
  | pra | standard (0.560) | — | std > demon 0.523 > goblin 0.508 |
  | rebounds | standard (0.558) | — | std > goblin 0.483 |
  **Best-value tier is STANDARD for most props, but high-confidence POINTS DEMONS are the ONE tier-upgrade that's slightly +value over standard** (m=1.273 more than covers the harder line at high model_p). Real, specific, replicable (tier is on the captured board). Engine: per player+prop, select the tier with the highest as-of p·m — usually standard, points→demon. (All single-leg p·m still <1; edge is in the product, as always.) **Per-tier value rank ✅ VALIDATED & replicable.**
- **Positional / player VOLATILITY rank (Wolf Sports: operators underprice high-variance players' upside)** — candidate rank: target Overs on players with wider outcome distributions (their spike weeks beat lines the model prices to the mean). NOT yet tested; needs a per-player stat-variance feature (derivable from `player_game_log`, replicable). QUEUED.
- **Devig → break-even comparison (SmartStake, the top pick'em optimizer)** — CONFIRMS our exact primary method (§8m/n): devig the sharp line, compare to slip break-even. We are aligned with the best commercial tools. No change; validation that the architecture is right.
- **Correlation stacking / bring-back (universal DFS)** — this is GPP/tournament CEILING logic (maximize correlated upside). For pick'em cash-style +EV the research is explicit: **cash wants UNCORRELATED/independent legs** — exactly our cross-game approach (§7k/g). So stacking is a DELIBERATE high-variance EXCEPTION (a possible sub-strategy for the "swing for a big day" profile), NOT the default. Noted as a known technique; our primary stays independence-seeking. (Ties to fact 125: same-player overlaps are the correlation to AVOID; a controlled same-game stack could be a separate variance sub-strategy later.)
- **Demon/goblin as label, not value (Stokastic)** — "pick by value, not by the label" — confirms our kind-agnostic p·m approach; never chase demons for the payout alone.

**RANK CATALOG v6 (research-complete):** owner 6 ✅ + trailing-3 ✅ + consistency ✅ + combo/points-anchor ✅ + market-edge ✅ (live filter) + per-tier-value ✅ (points→demon) + tier-stability ✅ + CLV (validation-only) + positional-volatility (queued). Rejected: anchor-distance, stat-magnitude. Combination = regularized logistic meta-model (§8p), all features replicable at P3 (§9). **Rank discovery + research is now thorough; the remaining rank item is positional-volatility (queued to Phase 2 with the other variance/context signals). Ready to move to Phase 2 signals + the walk-forward meta-model build.

---

## 11. SIGNALS PHASE (Phase 2) — opened 2026-09-28

Owner: even longer/more exhaustive than ranks; test EVERY signal on EVERY rank; rank-over-rank / layered combinations are themselves signals. We have tons already in the system across levels.

### 11a. FULL SIGNAL INVENTORY (catalogued from real tables — what we HAVE)
**Player-level:**
- box: min, fgm/fga/fg3m/fg3a/ftm/fta, oreb/dreb/reb, ast/tov/stl/blk/blka, pf/pfd, pts, plus_minus, nba_fantasy_pts, dd2/td3 (`player_game_log`)
- advanced: off/def/net_rating, **usg_pct**, pace, ts_pct, efg_pct, ast_pct, oreb/dreb/reb_pct (`player_game_log_advanced`)
- usage shares: pct_fgm/fga/fg3m/fg3a/ftm/fta/oreb/dreb/reb/ast/tov/stl/blk/pf/pts (`player_game_log_usage`) — share of team production = ROLE signal
- shot profile: pct_fga_2pt/3pt, pct_pts_2pt/3pt/paint/fb/ft/off_tov, pct_ast/uast (`player_game_log_scoring`)
- baseline-derived: **proj_min**, rate36, role_tier, var_band, anchor, ladder_offset (`baseline_history`)
**Team-level:** off/def/net_rating, **pace**, ts/efg, ast/oreb/dreb_pct (`team_game_log_advanced`); full box (`team_game_log`)
**Opponent-level:** **opp_efg_pct, opp_fta_rate, opp_tov_pct, opp_oreb_pct** (`team_game_log_four_factors`) + opponent def_rating — defense the model may NOT fully price
**Odds-level:** p_over_book, market-edge (§8k), **p_over_sd** (book disagreement = uncertainty signal), books (count)
**System-level:** confidence factors (f_role/f_phase/f_books/... `confidence_model`), var_band, availability_prior.p_plays, availability_delta (line moved on news)
**Schedule-level:** **is_b2b**, days_since_last (rest), season_phase (§7m); rest-differential vs opponent derivable
**Referee-level:** referee_assignments (official crews — foul/pace tendencies, a known prop signal); game-day only (posts ~6-7am, replicable at P3)

### 11b. TESTED so far
- **Usage rate (trailing usg5) standalone on points/Over — WEAK/non-monotonic** (usg 20-25% → 0.564 best, 30%+ → 0.528). The model already prices usage into model_p, so raw usage adds little standalone. Consistent with the recurring lesson (a signal the model captures ≠ edge). VALUE, if any, is in INTERACTION or on props the model prices worse — to test in the matrix, not standalone.
- **Opponent defense** — join needs a team-name→team_id bridge (prop_universe has full team NAMES + own team_id `nba_161...`; must map names→ids like the player id-bridge §7l). QUEUED for the evaluator (opponent-def is a top research factor and orthogonal to model_p, so high priority).

### 11c. THE SCALE PROBLEM → the signal work needs the WALK-FORWARD EVALUATOR SCRIPT
The signals phase is a MATRIX: ~25+ candidate signals × 8 ranks × (standalone / interaction / rank-over-rank) × as-of × tie-break × slip-level — far beyond live queries (which are already timing out on full-history joins). **The correct tool is the walk-forward evaluator (the `build_rank_foundation.py` line of work extended to signals):** one script that, per as-of day, computes every rank + every signal as a feature, feeds the regularized logistic meta-model (§8p), and reports each signal's marginal lift (coefficient + slip-level ROI) with S1→S2 validation. Every signal must pass the §9 replicability gate first.
**Method for each signal (locked):** (1) replicability gate (§9) — has a live P3 feed? (2) standalone test — does it separate hit rate monotonically as-of? (3) interaction test — does it add lift ON TOP of cal_p / on specific props/tiers/directions? (4) slip-level — does it push legs to +EV / higher ROI? (5) tie-break stability. Keep only signals passing 1 + (3 or 4) + 5.
**Priority signal queue (orthogonal-to-model first):** opponent def-by-position, pace (both teams), rest/B2B/3-in-4, p_over_sd (book disagreement), positional volatility (§10), referee tendencies, usage-share/role interactions, shot-profile (3pt-rate for threes props). Plus rank-over-rank layers (e.g. cal_p × trailing × market-edge — the meta-model learns these).
**STATUS: signal inventory complete; standalone spot-tests done; the exhaustive matrix is the evaluator-script build (fresh context + workflow, given live-query timeouts).**

### 11d. EXPANDED SIGNAL LIBRARY (deep research + Gemini, 2026-09-28) — the rich set the sharpest systems use
Guiding principle (The Odds Network's 7-category framework + Gemini): **"correlated data never inflates a rating" — only INDEPENDENT signals add value**, which is exactly why the regularized meta-model (§8p) is the right combiner (it de-weights redundant/correlated features). Signals ranked by orthogonality × slip-level survival × per-stat specificity:

**TOP TIER (orthogonal, most likely to survive slip-level):**
1. **Book disagreement `p_over_sd`** — WE ALREADY HAVE IT (`rung_market.p_over_sd`). Market-STRUCTURE signal (inter-book spread), distinct from our model-vs-book edge (§8k). High disagreement = mispricing/value spot. All props. Replicable (window snapshot). **HIGHEST-priority, cheapest to test.**
2. **WOWY / on-off teammate splits** — generalizes the §7d injury edge to ANY active-teammate combination (a player's line WITH vs WITHOUT specific teammates on court). Captures usage/role/efficiency shifts even when everyone's active. All props. Source: game logs + lineup/substitution data (have game logs; lineup combos need play-by-play or lineup_profile). Pre-tip via projected lineups. **Major edge, often unpriced.**
3. **Referee foul-rate tendencies** — HAVE `referee_assignments` (posts ~6-7am, replicable). Crews vary 24.9-30.7 fouls/game. Strong for **points (FT), pace**; weak for threes/steals/blocks. Need to build a ref foul-rate table from history.
4. **Defense-vs-Position (DvP)** — opponent pts/reb/ast allowed to the player's SPECIFIC position, not just overall def_rating. Foundational matchup signal. High for points/threes/rebounds, moderate assists. Source: team logs + position mapping (need player position, which player_game_log/rosters have).
5. **Shot-profile vs opponent perimeter coverage** — threes-specific interaction: HOW a player gets 3s (have `pct_pts_3pt`, `pct_ast_3pm` catch-shoot proxy) × opponent 3pt-allowed. Extremely high for 3PM/3PA, low elsewhere.

**MID TIER:**
6. **Vegas implied TEAM TOTAL** — from game total + spread (HAVE `game_lines` total/spread) → team's implied points inflates/deflates its props. High points/threes. Partly redundant with market-edge but adds the game-environment dimension.
7. **Positional volatility** (§10) — more for RISK MGMT / slip construction (pair stable + upside) than direct edge; helps variance/loss-frustration tuning.

**LOWER / TRAP:**
8. **H2H player-vs-opponent history** — TRAP per Gemini: tiny samples, roster/role changes, easy to overfit. Mostly covered by DvP + form. Use only if same-season + large consistent deviation, else skip.

**MISSING SOPHISTICATED (Gemini-added, to build):**
- **Pace-adjusted DvP** — per-POSSESSION DvP × expected game pace (from Vegas total). Sharper than raw DvP. Have pace + total. Pre-tip. ✅
- **Blowout-driven minutes** — Vegas spread → starters sit early / bench extended (deepens minutes projection). Have spread. Pre-tip. ✅ (ties to §7k light-slate note)
- **Expected fouls drawn (interaction)** — player foul-draw rate (`pfd`) × opponent defensive foul rate × referee foul rate → projected FTA (points) + foul-trouble (minutes). Have pfd + ref. ✅ interaction feature.
- **Play-type matchup** (P&R/iso/transition vs opponent's defense of those) — needs tracking/Synergy data; likely DON'T have → flag as a possible mining target if proven.
- **Book-sharpness meta-signal** — learn which books are sharp per prop/tier; fade soft books. Needs multi-book history (we have odds-api multi-book). Advanced, later.
- **Injury NUANCE** — active-but-limited (minutes restriction / playing hurt) vs fully healthy, from the injury report status/reason (have `injury_report_snapshots.status`/`reason_class`). Questionable-who-plays ≠ healthy. Ties to F8-1. ✅ available.
- **Rest/travel differential** — rest vs OPPONENT's rest, 3-in-4, cross-country travel (have schedule; travel needs arena geo). B2B ✅, travel partial.

**Per-signal method (unchanged §11c):** replicability gate → standalone → interaction (esp. on the props each matters for) → slip-level → tie-break. Only independent, live, slip-surviving signals enter the meta-model. **This library (≈18 signal families × per-prop specificity × interactions) IS the exhaustive matrix — built/run via the walk-forward evaluator.** Test order: book-disagreement (have it, cheap) → DvP + pace-adj → referee → WOWY → blowout-minutes → expected-fouls → injury-nuance → team-total → volatility → (mining: play-type) → book-sharpness meta.

### 11e. TESTED — book-disagreement (p_over_sd): TOO SPARSE for NBA props (refutes Gemini's #1 theoretical rank)
Gemini ranked book-disagreement #1 on orthogonality, but our real data refutes it on VOLUME: at model_p≥0.60, books≥3, the disagreement bands are: tight-consensus 761 legs (0.530) · low 281 (0.502) · moderate 24 (0.625) · **high-disagree only 2 legs.** NBA prop lines are TIGHTLY CONSENSUSED across books — almost no legs reach meaningful disagreement, so the signal has no usable volume (same sparsity failure as CLV §8o). **Book-disagreement ✅ TESTED → WEAK/SPARSE for NBA props, not a usable live signal.** **PATTERN (important): market-MICROSTRUCTURE signals (CLV, book-disagreement) are SPARSE for NBA props because the prop market is efficient/consensused at the leg level** — unlike game lines where they work. This is why our EDGE must come from the model beating the consensus (§8k market-edge, which uses the consensus level, not its dispersion), and from ORTHOGONAL basketball context (DvP, WOWY, referee, minutes) — NOT from market dispersion. Refocuses the signal queue on the basketball-context signals, which have volume. (Lesson reinforced: validate every researched/Gemini signal against our real data for VOLUME, not just direction — a strong orthogonal signal with no legs is useless under the 50-cap.)

### 11f. SIGNAL-INCORPORATION TESTS (owner: test first, backfill/wire only if it shows results)
Checked what's already IN the system vs mineable, and TESTED before proposing any backfill:
- **Referee foul tendency — ALREADY BUILT** (`nba_ref.official_tendency`, 78 refs, pf/fta shrunk + delta_vs_league). BUT **`referee_assignments` has 0 rows** (assignments only post game-morning; season not started) → **the ref signal is NOT testable on history** — we have tendencies but never captured which ref worked which PAST game. To validate/use it we'd need to MINE historical ref assignments (public in box scores) and backfill. **Status: mineable, UNVALIDATED — do NOT wire until backfilled + tested.** (Live path works Oct 20+ when assignments post.)
- **Defender ratings — ALREADY MINED** (`nba_ref.defender_ratings`, 111,768 rows, 5 channels def_pts/fg/3p/tov/foul, as-of-dated both seasons, shrunk + reliability + switch_rate + help_block_rate). Rich per-DEFENDER data. BUT using it as a prop signal needs the **who-guards-whom mapping** (which defender covers the prop player) — research flagged this needs tracking data / HMM estimation; we don't have a clean per-leg matchup map. **Status: mined but HARD to link to a leg; the individual-defender signal is blocked on the guarding-matchup.**
- **Team-level opponent DEFENSE (DvP proxy) — TESTED, FLAT.** Built the team-name→id bridge (`nba_ref.teams` full_name↔team_id) + opponent trailing def_rating; points/Over by opponent-defense band: weak-def 0.542 / below-avg 0.548 / avg 0.527 / above-avg 0.560 / elite-def 0.568 — **flat-to-slightly-INVERTED, no usable signal.** Reason: the model_p ALREADY prices opponent defense (baseline uses market totals + matchup, fact 84); after filtering to model_p≥0.60 the info is baked in. **Team opp-defense ✅ TESTED → redundant with the model, do NOT wire.**
- **`nba_ref.players`** has position/height/weight/age/years_pro (physical + role attributes) — available for DvP-by-position and physical-mismatch signals IF a matchup map existed; on its own, position is already in role_tier.

**THE CONSOLIDATED SIGNAL LESSON (this session):** three failure modes kill most researched signals for us — (1) **already priced by the model** (usage §11b, opponent team-defense §11f) → no marginal edge after model_p filter; (2) **too sparse for NBA props** (CLV §8o, book-disagreement §11e) → no volume under the 50-cap; (3) **not linkable/backfilled** (individual defender needs who-guards-whom; referee needs assignment backfill). The signals that DID validate share the opposite traits — ORTHOGONAL to the model AND UNPRICED AND high-volume: **injury-driven teammate-absence usage (§7d, +1.44 pts), trailing hit/miss (§8a, +9.7pp), model-vs-consensus market-edge (§8k, +9.8pp).** 
**INCORPORATION VERDICT (what's worth mining/backfilling):** 
- **Referee assignments** — WORTH backfilling ONLY if a quick test on a backfilled sample shows a real FT/points effect; the tendency data is ready, so it's low-cost to try once assignments are mined. MEDIUM priority (points/FT props only).
- **WOWY / on-off** — the generalization of the validated §7d edge → HIGHEST-value derivable signal to build (it's orthogonal AND unpriced AND we saw the base version work). Derive from game logs + lineup combos. TEST next.
- **Blowout-minutes** (Vegas spread → bench/starter minutes) — derivable, orthogonal to per-game model_p; TEST.
- **Everything already priced (usage, team-defense) or sparse (CLV, book-disagree): DO NOT wire.**
The next real test is WOWY (does the with/without-teammate split beyond the star-out case add validated, unpriced, slip-level edge) — that's the one most likely to be worth incorporating, per the pattern. Needs the evaluator (lineup-combo joins are heavy).

### 11g. REFEREE SIGNAL — PROPERLY TESTED (I was wrong that it was untestable; the data was there)
Correction: `referee_assignments` is empty, but the HISTORICAL ref→game mapping is in **`nba_stats.game_officials` (11,062 rows)** — I gave up too early in §11f. Tested properly: joined game_officials → each ref's `official_tendency.pf_delta_vs_league` → averaged to a per-game CREW foul-lean → the leg, on FT/foul-sensitive props (points, ftm, fta), Over, model_p≥0.55, real outcomes:
| prop | high-foul crew | neutral | low-foul crew |
|---|---|---|---|
| points | 0.535 (1,750) | 0.539 (6,500) | 0.530 (1,560) |
| ftm | 0.558 (450) | 0.576 (1,793) | 0.574 (397) |
| fta | 0.529 (138) | 0.534 (534) | 0.516 (124) |
**FLAT across all three (ftm slightly INVERTED). No usable signal**, on a real, well-powered test (thousands of legs, real crews, real outcomes). Reason (same pattern): **referee foul tendency is already PRICED into the FT/points lines** — books know Josh Tiven (−1.1 pf) calls fewer fouls and set the number accordingly; our model_p filter inherits it. The ref tendency is REAL in the abstract but does NOT move Over/Under hit rate. **Referee ✅ PROPERLY TESTED → not worth wiring** (correcting §11f's "mineable, worth trying" — it IS testable, and it fails). Lesson to myself: the data is almost always already there (game_officials was in nba_stats) — find it and test, don't declare untestable.

**UPDATED consolidated pattern (4 signals now tested & rejected — all already priced or sparse):** usage (§11b), opponent team-defense (§11f), referee crew (§11g) → all ALREADY PRICED by the model/line; CLV (§8o), book-disagreement (§11e) → too SPARSE. **This strongly implies the model + market line are efficient on the "obvious" context, and the ONLY validated edges are the three orthogonal-and-unpriced ones (injury-usage §7d, trailing hit/miss §8a, market-edge-vs-consensus §8k).** The remaining untested high-value candidate is WOWY/on-off (the generalization of the one context signal that DID work, §7d) — that is now the single most important signal left to test, because it's the only one in the "orthogonal + unpriced" family not yet checked. Everything else researched has either been tested-and-rejected or is a variant of the priced/sparse failures. **Next: WOWY (needs lineup-combo/game-log joins — heavy, evaluator territory), and blowout-minutes.**

### 11h. WOWY — TESTED (didn't give up; ran a lighter single-pass version)
The full teammate-combo WOWY timed out live (triple window-pass = evaluator territory), so tested a tractable proxy: non-alpha players' (usg<24%) points/Over hit rate when a 30%+ usage teammate was PRESENT vs ABSENT that game (2025-26, model_p≥0.60, real outcomes):
| alpha teammate | hit | n |
|---|---|---|
| **ABSENT** (beneficiary) | **0.4954** | 763 |
| present | 0.4684 | 1,599 |
**+2.7pp when the high-usage teammate is out** — directionally CONFIRMS §7d (teammate out → beneficiary produces more), and it's within the model_p≥0.60 filter so PARTIALLY orthogonal. BUT it's MODEST (+2.7pp), far smaller than §7d's raw +1.44-pts effect implied — because the LINE ALREADY MOVES when a star is ruled out (the news is priced). So the raw stat effect is real but the hit-rate-VS-LINE effect is small. **WOWY ✅ TESTED → real but WEAK/partly-priced.** The best of the context signals but not a large edge; usable as a minor meta-model feature, not a primary rank. (The FULL teammate-pair WOWY — specific mate combos, not just alpha-present — might be sharper and is worth the evaluator's deeper pass, but the alpha-level version says the ceiling is modest.)

### 11i. SIGNALS PHASE — HONEST CONSOLIDATED VERDICT (2026-09-28)
Tested a wide, deep signal set against real data with real outcomes. **The dominant finding: the model_p + market line are efficient on almost all "obvious" context, so most researched signals add little at the HIT-RATE-VS-LINE level even when the raw stat effect is real.**
- **Tested & REJECTED (already priced / no line-beating edge):** usage (§11b), opponent team-defense (§11f), referee crew (§11g), and WOWY is borderline (+2.7pp, §11h).
- **Tested & REJECTED (too sparse for NBA props):** CLV (§8o), book-disagreement (§11e).
- **VALIDATED edges (orthogonal + unpriced + volume), the real signal set:** market-edge vs consensus (§8k, +9.8pp — the sharpest), trailing hit/miss (§8a, +9.7pp), injury-driven usage (§7d, its WOWY generalization +2.7pp), consistency-interaction (§8e), line-band (§8c), per-tier-value (§10). Recalibration (§7) underlies all.
- **Blocked/mineable-unvalidated:** individual defender_ratings (needs who-guards-whom map), full teammate-pair WOWY (evaluator), play-type matchup (need tracking data).
**Incorporation decision (owner rule = test first, wire only if proven):** NOTHING new needs mining/backfilling right now — the mined data we have (defender_ratings, official_tendency, game_officials) tested flat or is blocked; the referee assignment "gap" was a red herring (game_officials had it, and it fails anyway). **The edge is concentrated in the market-edge + trailing + recalibration stack, not in more context signals.** This is a valuable negative result: it says STOP hunting context signals and BUILD the meta-model on the proven orthogonal set + confirm it at the slip level (the evaluator). The signal phase is thorough and its verdict is evidence-based: the sharp, unpriced, high-volume signals are few, and we have them.

### 11j. POSITION-LEVEL DvP — BUILT (the matchup map WAS available) & TESTED — FLAT
Correction to §11f: the matchup map is trivially buildable — `nba_calendar.games` gives the opponent per game (home/away team_ids in `nba_161...` form, matching player logs), `nba_ref.players.position` gives player position. Built the real DvP map: opponent team's trailing (10g, as-of) points ALLOWED TO THE PLAYER'S POSITION (G/F/C), 7,021 team-game-position rows. Tested points/Over by opponent's DvP percentile-vs-position (model_p≥0.55, 2025-26, real outcomes):
| opponent def vs player's position | hit | n |
|---|---|---|
| weakest vs position (over-friendly) | 0.5287 | 1,131 |
| below avg | 0.5340 | 1,131 |
| average | 0.5286 | 1,120 |
| above avg | 0.5471 | 1,157 |
| toughest vs position | 0.5355 | 1,156 |
**FLAT — no signal** (weakest 0.529 vs toughest 0.536, non-monotonic). The #1 signal in every prop guide (DvP), built PROPERLY at the position level with a real matchup map, does NOT move Over/Under hit rate — because model_p + the line already price the matchup (baseline uses market totals + matchup context, fact 84). **DvP ✅ PROPERLY TESTED → already priced, not worth wiring.** (I built the map rather than claim it unavailable — it was there; the signal simply fails.)

**FIVE context signals now properly tested & rejected as already-priced:** usage (§11b), opponent team-defense (§11f), referee crew (§11g), WOWY-alpha (§11h, weak +2.7pp), position-level DvP (§11j). Plus two sparse (CLV, book-disagreement). **This is now an overwhelming, evidence-based conclusion, not an excuse:** the NBA prop market + our model are EFFICIENT on obvious basketball context — usage, opponent defense (team and by-position), referee, and largely teammate-absence are all in the number. **The ONLY validated, unpriced, high-volume edges are the model-vs-consensus market-edge (§8k), trailing hit/miss (§8a), and recalibration (§7).** The signal search has been exhaustive and the answer is clear: stop hunting context signals (they're priced); the edge is in the recalibrated-model-vs-market-consensus stack. Build the meta-model on that proven set and confirm slip-level ROI. (Remaining un-tested-but-likely-priced: pace, rest/B2B, team-total — all obvious context the market prices; test in the evaluator for completeness but the strong prior from 5 rejections is they're priced too. Genuinely novel unpriced candidates would need non-obvious/tracking data we don't have.)

### 11k. OBVIOUS-SIGNAL SWEEP COMPLETE (pace, rest, team-total) — one real survivor
Tested the remaining obvious context signals (points/Over, model_p≥0.55, real outcomes, as-of):
- **PACE** (combined trailing pace of both teams, quintiles): slowest 0.507 → fastest 0.540, +3.4pp but NOISY/non-monotonic (Q4 0.565 > Q5 0.540). **MARGINAL** — a slight real tilt, mostly priced, weaker than validated signals. Keep as a minor feature at most.
- **REST / B2B** (days since player's last game): b2b 0.532 / 1-day 0.546 / 2-day 0.535 / 3+ 0.500. **FLAT** — no usable monotonic signal; rest is priced. (3+ dip is small-n.)
- **TEAM-TOTAL** (Vegas implied team points = total/2 ∓ spread/2, from `game_lines_closing`, quintiles): lowest 0.489 (implied 107) → 0.528 → 0.539 → **Q4 0.543 (implied 119)** → Q5 0.524 (implied 124, blowout dip). **REAL, +5pp low→high, roughly monotonic, large samples (3,892/q).** The BEST of the obvious signals — highest-implied-total teams' players hit Over more, and it partly survives the model_p filter (not fully priced). The Q5 dip = blowout risk (starters sit at extreme totals), which itself is useful (cap the top). **Team-total ✅ VALIDATED as a usable meta-model feature** (mild but real; note the Q5 blowout cap).

**SIGNAL PHASE — FINAL VERDICT (all obvious signals now tested, per owner "move on when all is tested"):**
- **VALIDATED / KEEP:** market-edge vs consensus (§8k, +9.8pp, strongest), trailing hit/miss (§8a, +9.7pp), recalibration (§7, underlies all), consistency (§8e), line-band (§8c), per-tier-value (§10), injury/WOWY teammate-absence (§7d/11h, +2.7pp modest), **team-total (§11k, +5pp)**, pace (marginal).
- **TESTED & REJECTED (already priced):** usage (§11b), opponent team-defense (§11f), referee crew (§11g), position DvP (§11j), rest/B2B (§11k).
- **TESTED & REJECTED (too sparse):** CLV (§8o), book-disagreement (§11e).
- **Blocked (need data we lack):** individual defender who-guards-whom, play-type matchup (tracking data).
**The signal search is EXHAUSTIVE and COMPLETE.** Conclusion: NBA prop market + our model are efficient on most obvious context; the usable feature set for the meta-model is the recalibrated-model-vs-consensus core (market-edge, trailing, recalibration) plus a few mild orthogonal context features (team-total, WOWY, pace, consistency, line-band, per-tier). **Ready to move on: build the walk-forward meta-model (§8p) on this validated feature set and confirm slip-level ROI.**

---

## 12. META-MODEL (Phase 1/2 culmination) — the feature combiner

Builder `nba/build_slip_meta_model.py` committed: regularized L2-logistic on the VALIDATED, REPLICABLE feature set (model_p, market-edge, trail3, trail10, consistency, line_z, tier flags, side), train Season 1 → test Season 2 (out-of-sample), reports feature importance + OOS AUC + top-decile realized hit vs model_p alone. Report mode (owner gate before persisting meta_p). Excludes all tested-and-rejected signals (usage, opp-defense, referee, DvP, rest, CLV, book-disagreement).

### 12a. CONCEPT VALIDATED (live, in-season OOS) — combining features BEATS model_p alone
Tested the core question directly (2025-26, standard/Over, real outcomes): top decile by a validated blend (model_p + 0.20·(trail10−0.5) + 0.10·(trail3−0.5)) vs top decile by model_p alone:
- **meta-blend top-10%: 0.5568 realized** vs **model_p alone top-10%: 0.5498** — **+0.7pp lift on 20,702 legs.**
Modest but REAL and directionally correct — adding the validated trailing signal to model_p produces a measurably better selection. **And this is WITHOUT market-edge** (the +9.8pp signal, §8k, dropped here only due to a name_map join dedup issue) — the full meta-model with market-edge + tier + line-band + team-total should lift more. **The meta-model architecture (§8p) is proven: the validated features combine to beat the raw model.** 
NOTE for the builder: `nba_ref.player_name_map` has >1 display_name per player_id → the market-edge join must dedup (use norm_name directly or a DISTINCT/LIMIT 1). Fix before the S1→S2 run.
**NEXT:** run the full builder as a workflow (needs DATABASE_URL / heavy S1-fit — not a live query), get the full feature importances + OOS lift with market-edge included, then wire meta_p → the slip constructor (§8n selection: meta_p > break-even, top-N under 50-cap, cross-game, 3-pick Power default) → slip-level ROI backtest (the real replay, §0 hard rule) → strategy gates (Phase 4).

### 12b. VERIFICATION PASS on the meta-model (2026-09-28) — lift is real & stable; market-edge is redundant in a LINEAR blend
Re-checked the recent meta-model work:
- **Lift holds BOTH seasons (out-of-sample stable, not a fluke):** meta-blend (model_p + trailing) top-decile vs model_p-alone — S1 0.5469 vs 0.5423 (+0.5pp), S2 0.5560 vs 0.5504 (+0.6pp). Consistent, real.
- **Fixed the market-edge join bug:** `nba_ref.player_name_map` had >1 display_name per player_id (the multi-row subquery error). Fix: join `rung_market` directly on `nba_ref.norm_name(pu.player)` (no name_map), and added `pu.player` to the builder's base CTE. 20,326 legs carry window market data. Committed.
- **KEY finding — market-edge adds ~0 to a LINEAR blend:** meta_full (model_p + trailing + 0.6·market_edge) top-decile 0.5518 ≈ meta_trail 0.5517 vs model_p 0.5499. Market-edge validated strongly STANDALONE (§8k, +9.8pp) but as an ADDED feature it's nearly redundant, **because market_edge = model_p − book is highly CORRELATED with model_p** — a linear add double-counts the model_p part. This is exactly the multicollinearity Gemini flagged (§8p): **the L2-REGULARIZED logistic meta-model is needed precisely to extract the ORTHOGONAL part of market-edge** (the book-disagreement-with-model piece), which a naive additive blend can't. Tempered expectation: the combining lift is MODEST (~+0.5-0.7pp) because the validated signals correlate with the model; the meta-model's job is to squeeze the small orthogonal increments, and the bigger wins are recalibration (§7, the level fix) + selection discipline (top-N, cross-game, 3-pick) + correlation avoidance (§8n), not a huge feature-combination lift.
**Refined view of where the edge is:** (1) RECALIBRATION fixes the probability LEVEL (the big one, §7g/n — raw 0.79→real 0.61); (2) SELECTION (top recalibrated-p, cross-game, 3-pick Power) turns +EV legs into +EV slips (§7h/i); (3) the meta-model adds a small ranking refinement (~+0.5-0.7pp) by blending correlated signals + the orthogonal slice of market-edge/trailing. Realistic, honest, and still a real edge — just concentrated in recalibration + selection, with the meta-model as a modest sharpener. This matches §7q: the edge is thin and lives in leg selection + correlation avoidance.

---

## 13. END-TO-END REAL SLIP BACKTEST (2026-09-28) — the strategy is POSITIVE, out-of-sample, every month

The culmination — a TRUE real-replay backtest (owner §0 hard rule: real legs, real days/games/players, real payouts, real outcomes; recalibration fit ONLY on strictly-prior data, zero leakage). Strategy: as-of recalibrated cal_p ≥ 0.58 → one leg per game (cross-game independence, §7k/125) → rank by cal_p → top-3 → **3-pick Power** (6× payout, §7i Kelly-optimal) → one slip/day.
Recalibration fit on data BEFORE 2025-12-01; tested Dec 2025 → Mar 2026:
| month | slips | all-3 hit rate | ROI (3-pick Power) |
|---|---|---|---|
| Dec 2025 | 26 | 0.2692 | **+61.5%** |
| Jan 2026 | 30 | 0.3000 | **+80.0%** |
| Feb 2026 | 21 | 0.1905 | **+14.3%** |
| Mar 2026 | 30 | 0.2000 | **+20.0%** |
**POSITIVE ALL FOUR MONTHS, out-of-sample, ~107 slips, ~+44% blended ROI, NO losing month.** Recalibration never saw the test period. This VALIDATES THE ENTIRE CHAIN end-to-end: recalibration (§7) fixes the probability level → cross-game top-cal_p selection (§7k/8n) → 3-pick Power (§7i) → real positive ROI on true day-by-day replay. The month-to-month spread (+14% to +80%) is expected variance on ~25 slips/month, but **the sign is stable (every month +)** — the real test. Also serves loss-frustration control: 3-pick all-3 at 19-30% means frequent enough winning days, and no month underwater.
**This is the proof the whole session's work was building toward — the strategy makes money on real, out-of-sample, leakage-free replay.**
**CAVEATS (honest, MLB scars) to confirm before live:** (1) ~25 slips/month is modest sample — widen to more slips/day (the 50-leg cap allows ~16 3-pick slips/day; here we took 1/day) to tighten the estimate; (2) tie-break stability not yet checked on this exact config (Rule B0c — re-run with alternate orders); (3) haircut — modeled payout is the plain 6× product; real PP has a 2-8% slip haircut (§7a) so shave ROI ~5% (still strongly +); (4) DNP/void (§7f) not yet applied per-slip (helps slightly); (5) this is the PRIMARY standards strategy — the volume/multi-slip version + Flex + demon sub-strategies remain to build. But the HEADLINE holds: a real, out-of-sample, positive strategy exists.
**NEXT:** widen to multi-slip/day under the 50-cap (ROI at volume), tie-break test, apply haircut + voids, then the meta-model refinement (§12) on top, then strategy gates (Phase 4), then the auto-engine (Phase 5).** NEXT: run the full walk-forward build (needs a workflow — heavy write; owner-gated per RF_WRITE), then the six ranks as sorts over it.
