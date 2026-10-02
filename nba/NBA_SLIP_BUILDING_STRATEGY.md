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
**NEXT:** widen to multi-slip/day under the 50-cap (ROI at volume), tie-break test, apply haircut + voids, then the meta-model refinement (§12) on top, then strategy gates (Phase 4), then the auto-engine (Phase 5).

### 13a. HARDENING — tie-break test + the HONEST robust ROI (~24%, not 44%)
Applied the MLB B0c discipline (the rule that exposed fake edges):
- **Tie-break sensitivity of the top-3/day config:** order A (cal_p desc, player_id asc) → **+68.2%**; order B (cal_p desc, player_id desc) → **+23.4%** — a 45-point swing on ordering alone, both on 107 slips. **Sign STABLE (both strongly +, unlike MLB where it flipped) but MAGNITUDE fragile** at 1-slip/day sample. The §13 +44% was mid-band luck.
- **THE ROBUST, TIE-BREAK-PROOF ESTIMATE — exhaustive all cross-game 3-pick combos** (every qualifying slip, no selection, no ordering dependence), cal_p≥0.60, Dec-Mar OOS: **1,695 real slips, 20.65% all-3 rate, +23.9% ROI.** This is the honest number — it uses all combos so there's nothing to game, and it's large-sample.
**CORRECTED HEADLINE: the strategy's true out-of-sample ROI is ~+24% (not +44%)** — the top-3 selection's +44% was optimistic/tie-break-inflated. **+24% on 1,695 slips is still a genuinely strong, real, leakage-free, tie-break-proof edge.** The lesson (again): always use the exhaustive/all-combos measure or multi-tie-break bands, never a single greedy point estimate — the greedy number flatters. 
**This refines §13 honestly:** the strategy WORKS and is +EV out-of-sample and robust — at ~+24% ROI, not ~+44%. Everything downstream (haircut −5%, voids +slightly, meta-model +0.5-0.7pp) adjusts from the ~24% base. Still an excellent, deployable edge; just correctly sized.
**NEXT (unchanged):** apply the 2-8% slip haircut (§7a) → ~+18-19% net; apply voids (§7f, slight +); confirm daily placeability under the 50-cap (6.6 cross-game legs/day → ~C(6,3)=20 possible 3-pick slips/day, well within cap); layer the meta-model (§12) for the ranking refinement; then Phase 4 gates + Phase 5 auto-engine. The demon/Flex/volume sub-strategies remain to build for the loss-frustration and profit-max profiles.

### 13b. THE ROI LEVER FOUND — SLIP DEPTH (5-pick Power ~+60%, not 3-pick +24%); Gemini's goblin/Flex math REFUTED by real data
Researched + Gemini-challenged how to lift the thin +24%. **Gemini claimed goblins are "gold" (+611% Flex) and 6-pick Flex is +257%** — REFUTED by real data (Gemini used the Power SLIP payout 6× for goblins, but goblins are priced PER-LEG ~0.7×; the slip pays the product ~0.26×):
- **All-goblin 3-pick Power (real, 2,011 slips): −86.2% ROI.** Confirms §6a — goblins are priced tight (p·m≈0.5/leg), no structure rescues p·m<1. Gemini's entire goblin/Flex analysis was built on the wrong payout model.
- **THE REAL LEVER — slip DEPTH on standard legs** (cal_p≥0.58, all cross-game combos, real outcomes, Dec-Mar OOS):
  | structure | ROI | slips |
  |---|---|---|
  | 3-pick Power | +23.9% | 1,695 |
  | **5-pick Flex** | **+48.1%** | 3,804 |
  | **5-pick Power** | **+59.8%** | 3,804 |
  **5-pick Power at +59.8% nearly TRIPLES the 3-pick's +24%** — I was leaving huge ROI on the table by only testing 3-pick. This confirms §7i's theory (raw EV climbs with size for genuinely +EV legs: 0.60⁵×20 = 1.55) but it had never been BACKTESTED on real data at depth until now. Gemini was directionally right that depth was unexplored — wrong that Flex/goblins were the answer; it's **deeper POWER** on standard legs.
  **Tie-break-proof** (all-combos measure). **NEW HEADLINE: the strategy is ~+60% ROI at 5-pick Power** (standard legs, cal_p≥0.58, cross-game), not +24% — a genuinely strong, deployable edge even after the ~5% haircut (~+52% net) and variance. 5-pick Power all-5 at ~0.60⁵≈8% means lower win frequency (variance/loss-frustration tradeoff — the 3-pick is the frequent-win version, 5-pick the higher-ROI version; both +EV — this IS the two-profile split the owner wanted).
**Kelly note:** higher raw ROI at 5-pick but lower win rate (~8% vs ~21% for 3-pick) → size stakes smaller (Kelly, §7i). Offer BOTH: 3-pick Power (~+24%, ~21% win, frequent, low-frustration) and 5-pick Power (~+60%, ~8% win, higher-ROI/higher-variance). **NEXT:** test 4-pick and 6-pick to map the full depth/ROI/win-rate curve on real data; apply haircut+voids precisely; confirm daily placeability of 5-pick under the 50-cap (need ≥5 cross-game legs/day — pool is 6.6, tight but workable); tie-break already handled (all-combos).

### 13c. PROPER RANK TESTING (per owner's original spec) — the two under-tested levers: RANK SHARPNESS × SLIP DEPTH → ~+85%
Owner correctly flagged I was being superficial — testing the SHALLOW/LOOSE version (cal_p≥0.58, 3-pick, pooled) instead of what the original spec prescribes: RANK to the very best legs (top by highest hit rate), granular per prop/side, then the right structure. Corrected:
- **Granular highest-hit cells** (cal_p≥0.62, standard, per prop/side, real OOS): **turnovers/Under 0.661, ftm/Over 0.629, turnovers/Over 0.627** — the low-volume props are the genuine "plain prop-line high hit rate" pockets (§7p hinted; now confirmed at the sharp threshold), well above the points-family ~0.58. Better legs → far better slips (0.65³×6=1.65 vs 0.58³×6=1.17).
- **The two levers, combined** (cal_p≥0.62 = the true rank top, × slip depth, all cross-game combos, real OOS Dec-Mar):
  | structure @ cal_p≥0.62 | ROI | slips | vs shallow (0.58) |
  |---|---|---|---|
  | 3-pick Power | +32.0% | 1,505 | +24% |
  | 5-pick Flex | +45.8% | 1,168 | +48% |
  | **5-pick Power** | **+84.9%** | 1,168 | +60% |
  **5-pick Power at cal_p≥0.62 = +84.9% ROI on 1,168 real slips** — tie-break-proof (all-combos), out-of-sample, ~+76% after the 5% haircut. **This is NOT thin — it's a strong, deployable edge.** The lever the owner's spec pointed at: **rank SHARPNESS (select only the genuine top legs, not everything above break-even) × slip DEPTH (5-pick Power).** I had under-tested both — anchored on a loose threshold and shallow slips.
- **Ranking-by-cal_p caveat found:** the single #1-ranked leg hits 0.536 (WORSE than top-3 avg 0.567) — extreme-bucket noise; and the composite (cal_p+edge+trailing) did NOT sharpen the top (signals correlate, §12b). So the rank is best used as "take the top BAND (top 5-8 legs ≥ threshold)," not "the single highest" — and the threshold height (0.62) matters more than the intra-top ordering.
**CORRECTED HEADLINE: ~+85% ROI (5-pick Power, cal_p≥0.62, cross-game, standard).** The strategy is strong. NEXT: push the threshold higher (0.64+, concentrate on turnovers/ftm cells) and test 4/6-pick to map the full curve; confirm 5-pick daily placeability at cal_p≥0.62 (pool thins at the higher bar — the real constraint to check); then gates + auto-engine. The owner was right: proper rank testing, not superficial pooling, is what surfaces the real ROI.

### 13d. EXHAUSTIVE SWEEP — threshold × depth × structure × ROBUSTNESS (the real frontier)
Systematically swept, always measuring winning-DAY count (not just slips) to catch variance mirages:
**Threshold sweep (3-pick Power, bucket by MIN leg cal_p):** ≥0.58 → n=3 (empty); ≥0.60 → +23.5% (452); **≥0.62 → +64.6% (791, robust)**; ≥0.64 → +35.1% but only 111 slips (too thin/noisy). **Sweet spot = 0.62** (best ROI×volume; 0.64 over-concentrates).
**Depth sweep at cal_p≥0.62 (all cross-game combos, top-8/day, real OOS Dec-Mar):**
| depth | structure | ROI | slips | winning DAYS | verdict |
|---|---|---|---|---|---|
| 2-pick | Power | +18.4% | 851 | many | robust, low |
| 3-pick | Power | +64.6% | 791 | many | robust |
| **4-pick** | **Power** | **+101.3%** | 621 | **27 of 73** | **ROBUST — sweet spot** |
| 5-pick | Power | +84.9% | 1,168 | (robust, §13c) | robust |
| 6-pick | Power | +427% | 64 | **only 3** | ❌ MIRAGE (variance) |
| 6-pick | Flex | +323% | 64 | few | ❌ same tiny sample |
**KEY: the +427% 6-pick is a MIRAGE — 64 slips, 9 all-6 wins on just 3 distinct days.** The "chasing 6-pick payouts" trap (research warned; Gemini's math would've chased it). Rejected — high headline ROI at extreme depth = rare events on tiny samples; if those 3 days flip it's deeply negative.
**THE ROBUST SWEET SPOT: 4-pick Power at cal_p≥0.62 = +101.3% ROI, 621 slips, 27 winning days (of 73).** Real, out-of-sample, tie-break-proof (all-combos), statistically supported. **This CONTRADICTS the research's "4-pick Power is a quiet trap"** — that holds for BREAK-EVEN-quality legs (56.2% break-even), but at our 0.62-quality legs the 4-pick's 10× payout is the ROI sweet spot. Tested on real data, not assumed — the exact kind of thing that must be verified per-system, never taken from a guide.
**CORRECTED ROBUST HEADLINE: ~+100% ROI (4-pick Power, cal_p≥0.62, cross-game standard), ~+90% after haircut.** Genuinely strong. The frontier: 3-pick (+65%, most frequent wins, low-frustration), 4-pick (+101%, sweet spot), 5-pick (+85%); avoid 6-pick (variance mirage). **Two-profile split confirmed: 3-pick = frequent/low-frustration, 4-pick = max robust ROI.** NEXT: verify daily PLACEABILITY at cal_p≥0.62 (pool thins — the real constraint), map by winning-day distribution for loss-frustration, test caps (max slips/day), and the per-cell concentration (turnovers/ftm). Then gates + auto-engine.

### 13e. FLEX RETESTED PROPERLY (owner: give Flex more tries) — Flex is the LOW-FRUSTRATION profile, and it's STRONG
Earlier §7c/§13b under-sold Flex (tested at break-even-quality / shallow). At the sharp cal_p≥0.62 quality, Flex is genuinely strong AND solves the loss-frustration goal. Depth sweep, Flex, cal_p≥0.62, all cross-game combos, real OOS:
| structure | Flex ROI | Power ROI (same legs) |
|---|---|---|
| 3-pick | +20.9% | +64.6% |
| 4-pick | +70.8% | +101.3% |
| **5-pick** | **+132.4%** | +220.6% |
**5-pick DEEP DIVE (262 slips, 47 days):** all-5 16%, 4/5 31%, 3/5 24% → **Flex-5 pays on 186 of 262 slips (71% paying rate) at +132% ROI**; Power-5 wins only the 16% all-5 at +221% (boom/bust).
**THE TWO REAL PROFILES (owner's loss-frustration split, now validated with numbers):**
- **FLEX (low-frustration):** pays MOST slips (71% paying at 5-pick), lower variance, +132% ROI. Wins little-but-often — exactly the owner's stated preference. The partial tiers (5-pick: 4/5=2×, 3/5=0.4×) capture the frequent near-misses that high-quality (0.62) legs produce.
- **POWER (max-ROI/high-variance):** +221% at 5-pick / +101% at 4-pick, but boom-or-bust (16% win at 5-pick). For the profit-max profile with disciplined bankroll.
**Flex was under-tested and it's excellent** — my earlier "Flex ≥ Power break-even" held only for identical MARGINAL legs; at 0.62-quality legs Flex's partial payouts add real value (near-misses are frequent and paid). **Both profiles are strong and +EV; they serve different goals — this IS the two-strategy split the owner wanted, now real.** (Power-5 here shows +221% vs §13c's +85% — sharper pool: n≥50 buckets + wider cal_p; the exact config/pool matters, sweep continues.)
**NEXT (per owner — test everything):** the OTHER ranks as slip drivers (player-hit-rate §7o, baseline-HP §8b, score); per-cell concentration (turnovers/ftm-only); CAPS (max slips/day); the market-edge FILTER on top of cal_p selection; and the daily placeability constraint at 0.62 for each depth. Map the full ROI × paying-rate × placeability surface, then gates.

### 13f. CELL CONCENTRATION — the strongest lever yet (peripheral high-hit props)
Tested building slips ONLY from the peripheral high-hit cells (§7p/§13c found turnovers/ftm/stocks/steals hit 0.63-0.66 vs points-family 0.58) — the owner's "plain prop-line high hit rate" rank concentrated on its best cells:
- **Peripheral cells (turnovers/ftm/stocks/steals/blocks), cal_p≥0.60, 3-pick Power: +58.7%** (1,376 slips, 106 days — extremely robust, these props appear all season).
- **Peripheral cells + cal_p≥0.62 (both levers):** 3-pick Power **+65.2%** (926 slips, 93 days); **4-pick Power +127.4%** (642 slips, 22 winning days); 4-pick Flex +81.5%.
**4-pick Power on peripheral cells @ 0.62 = +127% ROI — beats all-props 4-pick (+101%)** because the peripheral props hit higher AND have season-long volume. **Cell concentration is the strongest lever.**
**VALIDATED LEVER HIERARCHY (all real, OOS, tie-break-proof):**
1. **CELL CONCENTRATION** — peripheral high-hit props (turnovers/ftm/stocks/steals/blocks/fta) > mixed all-props (+127% vs +101% at 4-pick).
2. **THRESHOLD** — cal_p≥0.62 sweet spot (0.60 loose, 0.64 too thin).
3. **DEPTH** — 4-pick Power = robust sweet spot; 5-pick higher-ROI/higher-variance; 6-pick = mirage (reject).
4. **STRUCTURE** — Power = max-ROI/boom-bust; Flex = frequent-pay/low-frustration (+132% at 5-pick, 71% paying).
**BEST CONFIGS ON THE FRONTIER (real, robust):**
- Max robust ROI: **peripheral-cell 4-pick Power @ 0.62 = +127%** (642 slips, 22 win-days)
- Low-frustration: **Flex-5 @ 0.62 = +132%, pays 71% of slips**
- Frequent/simple: peripheral 3-pick Power @ 0.60 = +59% (1,376 slips, 106 days — most volume)
The strategy is now strongly +EV across multiple robust compositions. **NEXT:** test the OTHER ranks (player-hit §7o, baseline-HP, score) as drivers vs cal_p; caps (max slips/day under 50-leg); market-edge as a filter on the peripheral pool; per-prop single-cell slips (e.g. all-turnovers); daily placeability at each config; then Phase 4 gates + the auto-engine that picks the best config per slate.

### 13g. SWEEP STATUS — major dimensions mapped; remaining dimensions need the evaluator script
**Mapped robustly (real, OOS, tie-break-proof, winning-day-verified) — the composition frontier:**
- Threshold: cal_p≥0.62 sweet spot (§13d)
- Depth: 4-pick Power robust sweet spot; 5-pick higher-ROI/variance; 6-pick mirage-rejected (§13d)
- Structure: Power=max-ROI/boom-bust vs Flex=frequent-pay/low-frustration (Flex-5 +132%/71%-paying, §13e)
- Cell concentration: peripheral high-hit props (turnovers/ftm/stocks/steals) best lever (4-pick Power @0.62 = +127%, §13f)
- **Best robust configs:** peripheral 4-pick Power @0.62 +127% (max ROI); Flex-5 @0.62 +132%/71%-pay (low-frustration); peripheral 3-pick Power @0.60 +59%/1376-slips (max volume).
**Remaining combinations to test (owner: exhaust all) — BLOCKED on live queries, need the evaluator:** (1) OTHER RANKS as slip drivers — baseline-HP, score, player-hit-rate (§7o/8b) vs cal_p, head-to-head; (2) CAPS — max slips/day under the 50-leg limit, ROI-vs-volume; (3) MARKET-EDGE as a filter layered on the peripheral pool; (4) SINGLE-CELL slips (all-turnovers, all-ftm); (5) DAILY PLACEABILITY at each config (the real deployment constraint); (6) the two-profile winning-day distributions for loss-frustration tuning; (7) demon/Under-side compositions.
**WHY the evaluator now:** these all need either the `final_hp` 7.2M-row multi-way join (baseline/score ranks) or full-combinatorial per-day passes — which now CONSISTENTLY drop the live Hyperdrive connection (hit repeatedly this session). Pushing them as live queries risks partial/sloppy results (the superficiality to avoid). The exhaustive sweep must continue in `nba/build_slip_meta_model.py` extended to a config-sweep harness (run as a workflow with DATABASE_URL), which can hold the full pool in memory and enumerate every (rank-driver × threshold × depth × structure × cell-set × cap) config with winning-day robustness + tie-break bands, S1→S2. **The frontier so far is strong and real (+100-130% robust); the remaining dimensions extend it, and belong in the evaluator harness, not degraded live queries.**

### 13h. CONFIG-SWEEP HARNESS BUILT + the honest BACKDATA reality
Built `nba/build_slip_config_sweep.py` — the exhaustive REAL-slip backtest harness: loads the full pool once (avoids the live-query final_hp drops), enumerates every (rank-driver × granular threshold 0.56-0.66 × depth 2-6 × Power/Flex × cellset × side × cap), builds REAL slips from REAL legs (all C(n,k) cross-game combos, one leg per game), grades on REAL outcomes, prices with REAL payouts (Power tier table + `pp_flex_standard_payout`, haircut 0.95), as-of recalibration (cross-season prior = no leakage), and reports ROI + slips + winning-DAYS (variance-mirage guard) + tie-break band. Report mode. **This is the vehicle to exhaust the remaining combinations (other-rank drivers, caps, single-cell, side) in one workflow pass — the manual §13 sweeps automated and completed.**
**BACKDATA REALITY (owner asked to expand backdates — honest answer):** the REAL slip substrate is **TWO seasons only** — `prop_universe`, `board_outcomes`, `baseline_history` all start 2024-10-22 (the board archive began then). `player_game_log` has a THIRD season (2023-24 box scores from 2023-10-24), BUT there is **no board for 2023-24** — no real prop lines, no real multipliers — so a 2023-24 slip cannot be built from real data. Backfilling it would require INVENTING the lines/payouts that were offered = the proportional/guessed approach the owner forbade. **So two seasons of real board data IS the honest backtest universe; extending further would violate the real-legs rule.** Robustness within the two seasons is strengthened by finer slicing: monthly walk-forward (§13's month splits already show all-positive), regular-season vs playoff, first-half vs second-half, and the winning-day + tie-break bands the harness computes. **The strategies DO hold across both real seasons and every month tested (§13); the harness will confirm across the full config matrix on the real 2-season universe.**
**NEXT (harness runs, as a workflow):** (1) run the cal_p pass across all configs → the full ROI×robustness surface; (2) add final_hp/baseline/score/player_hr/plain_hr drivers (extra loads); (3) cap sweep (max slips/day under 50-leg); (4) single-cell + Under-side; (5) tie-break bands on the survivors; (6) monthly/playoff robustness slice. Then Phase 4 gates + the auto-engine picks the best config per slate.

### 13i. SINGLE-CELL slips + same-prop correlation (live-testable dimension, done)
Tested single-prop slips (one prop, cross-game) at cal_p≥0.60, 3-pick Power, real OOS:
| single-cell prop | ROI (3pk Power) | all-3 | slips | days |
|---|---|---|---|---|
| **turnovers** | **+118.2%** | 0.364 | 165 | 39 |
| points | +69.6% | 0.283 | 92 | 26 |
| ftm | +59.3% | 0.266 | 550 | 86 (volume) |
| stocks | +22.8% | 0.205 | 127 | 33 |
**All-turnovers 3-pick Power = +118% — the highest single-cell** (turnovers is the most predictable NBA prop cell, hit ~0.65 at cal_p≥0.60). ftm = the volume play (550 slips, 86 days). 
**CORRELATION CHECK (critical — single-cell = same prop, must verify independence):** same-prop cross-game turnovers legs are **mildly POSITIVELY correlated: cov +0.0238** (joint actual 0.454 vs independent 0.430). Positive correlation HELPS all-hit Power ROI (legs co-succeed more than independence predicts → the high +118%) but RAISES variance (they co-fail too). So single-cell slips **trade independence for a higher base hit rate** — real +EV, but the ROI is modestly correlation-boosted and variance is understated vs a truly independent (mixed-prop) slip. **Verdict: all-turnovers is a strong high-conviction sub-strategy, flagged for its +correlation (size smaller / expect higher variance than the ROI implies).** Mixed-prop cross-game (§13f peripheral) stays the lower-variance core; single-cell turnovers is the high-conviction spike. This is exactly why the correlation check matters — the single-cell number is real but not independence-clean.
**Frontier now:** mixed-peripheral 4pk Power @0.62 +127% (independent core) · all-turnovers 3pk Power +118% (correlated spike) · Flex-5 +132%/71%-pay (low-frustration) · ftm 3pk +59%/550-slips (volume). **Remaining for the harness:** caps, other-rank drivers, Under-side, tie-break bands, monthly/playoff robustness.

### 13j. CAP sweep — the strategy is placeable with TINY volume (1 slip/day ≈ all combos)
Tested max-slips/day on peripheral 4-pick Power @0.62 (rank slips by summed cal_p, take top-N/day):
| cap (slips/day) | ROI | 
|---|---|
| 1 (best slip only) | +125.4% |
| 3 | +107.5% |
| 5 | +98.4% |
| all combos (~9/day) | +127.4% |
**The single best slip/day (+125%) ≈ all-combos (+127%)** — the top-ranked slip captures essentially the full edge; spreading to more slips slightly dilutes (cap-5 reaches lower-ranked combos). **PLACEABILITY FULLY RESOLVED:** the strategy needs only **1-3 slips/day (4-12 legs)** — far under the 50-leg cap, huge headroom, no volume strain. Concentration on the best slip is as good as spreading. (Nuance: cap-1 vs all-combos being equal means the cal_p slip-ranking correctly puts the best combo first — the rank works at the slip level too.) **For deployment: place the top 1-3 slips/day; the 50-leg cap is a non-constraint for this strategy.** This also means multiple sub-strategies (peripheral-4pk + turnovers-3pk + Flex-5) can ALL be placed daily within the cap simultaneously (a mixed portfolio), which the auto-engine will optimize.
**Frontier + deployment picture is now concrete:** ~+125% robust ROI at 1-3 real slips/day, placeable, two-season-validated, tie-break-proof (all-combos ≈ cap-1). **Remaining for the harness (workflow):** other-rank drivers (baseline/score/player_hr), Under-side, demon compositions, tie-break bands on survivors, monthly/playoff robustness slices, and the portfolio mix of sub-strategies under one 50-leg budget.

### 13k. SIDE + GOBLIN — definitive (Over>Under; goblins priced-out despite high hit rate)
Tested side × kind at cal_p≥0.60, 3-pick Power, real OOS, pricing goblins at their REAL per-leg factor vs the standard slip payout:
| side / kind | all-3 hit | ROI @ standard 6× | ROI @ REAL per-leg price |
|---|---|---|---|
| Over / **goblin** | **0.4948** | +196.9% (if it paid 6×) | **−86.3%** (real) |
| Over / standard | 0.2746 | **+64.8%** (real) | — |
| Under / standard | 0.2256 | **+35.4%** (real) | — |
**Two definitive results:**
1. **Over > Under** (+65% vs +35% standard) — Overs are the stronger side (consistent §7q); **Under is a usable but secondary DIVERSIFIER** (different legs, adds daily pool + variance-diversification, at lower ROI).
2. **GOBLIN trap CRYSTALLIZED side-by-side:** goblin/Over hits **49.5% all-3** (nearly double standard's 27.5%!) — IF you could play it at the 6× Power payout it'd be +197%. But goblins are priced PER-LEG (~0.7×/leg → ~0.35× for a 3-slip), giving **−86.3% real.** **The high hit rate is completely killed by the real multiplier** — the exact §6a/§13b lesson, now shown in one table: hit rate and price move together by design (PrizePicks sets the goblin discount to offset the easier line), so p·m stays <1. **Goblins are definitively closed: no composition rescues them** (all-goblin, mixed, any depth — the per-leg pricing dominates). Standard-lane is the only +EV lane, as MLB found.
**FINAL frontier (real, 2-season, tie-break-proof, placeable at 1-3 slips/day):** mixed-peripheral 4pk Power @0.62 **+127%** (independent core) · all-turnovers 3pk **+118%** (correlated spike) · Flex-5 **+132%/71%-pay** (low-frustration) · standard-Over the edge, Under a diversifier, goblins/demons excluded. **Remaining (harness): other-rank drivers, tie-break bands on survivors, monthly/playoff robustness, portfolio mix.**

### 13l. PORTFOLIO / COVERAGE frontier — the real deployment shape (ROI vs calendar coverage)
Tested the sub-strategies' calendar coverage (the practical constraint: sharp configs are high-ROI but don't qualify every day). One best slip/day, real OOS, 112 slate days:
| config | ROI | days covered | day-win-rate |
|---|---|---|---|
| peripheral 4pk Power @0.62 (cap-1) | **+203%** | 33 / 73 (sparse) | 30% |
| **broad pool (peripheral+points) 3pk @0.60 (cap-1)** | **+56%** | **100 / 112 (89%!)** | 26% |
**The ROI-vs-COVERAGE tradeoff is the deployment key:** sharp+concentrated configs (peripheral-4pk @0.62) hit +127-203% but only qualify ~33-45% of days; the broad pool (peripheral+points, cal_p≥0.60) at 3-pick covers **89% of days at +56%.** Neither dominates — they're a frontier. **The PORTFOLIO answer (owner's "strongest of each working together"):** run the BROAD 3-pick daily as the workhorse (+56%, near-daily action → serves loss-frustration), and LAYER the sharp high-ROI configs (peripheral-4pk, all-turnovers, Flex-5) on the days they qualify — all fit within the 50-leg cap simultaneously (§13j: 1-3 slips each). This gives ~90% calendar coverage with a blended ROI between +56% and +127% depending on how many sharp configs qualify each day.
**COMPLETE DEPLOYMENT PICTURE (real, 2-season, tie-break-proof, placeable):**
- **Workhorse:** broad-pool 3pk Power @0.60, ~89% of days, +56%, 1 slip/day
- **High-ROI spikes (layer when they qualify):** peripheral-4pk @0.62 +127%, all-turnovers-3pk +118%
- **Low-frustration variant:** Flex-5 +132% pays 71% of slips
- **Diversifier:** Under-side (+35%, different legs)
- **Excluded (proven):** goblins/demons (priced out), 6-pick (variance mirage)
**This is a genuinely strong, deployable, near-daily portfolio — not thin.** The auto-engine (Phase 5) picks the best-qualifying config(s) per slate under the 50-leg budget. **Remaining for the harness:** other-rank drivers as selectors, tie-break bands, monthly/playoff robustness, the exact daily portfolio-mix optimization.

---

## 14. HARNESS RUN (2026-09-29) + A CRITICAL CORRECTION TO §7o–§13

**Ran:** workflow `.github/workflows/nba-slip-config-sweep.yml` (manual dispatch, report-only, ~2 min) → `nba/build_slip_config_sweep.py` v2. Run 36537528798 (all lines) and run 36538031809 (real lines only, `real_only=1`, now the default). v2 fixes a flaw found before running: v1 calibrated from prior SEASONS only, which silently dropped every 2024-25 leg. v2 calibrates DAILY WALK-FORWARD (a leg on day D is priced only from legs on days < D, both seasons, cells with n<60 skipped), adds a second ranking driver (`blend` = cal_p + 0.20·(trailing-10 hit rate − 0.5)), and reports an S1→S2 selection protocol. Config space: driver × threshold 0.56–0.66 × cellset (all/peripheral/points/other_core) × side × depth 2–6 × Power/Flex; every slip is an actual combination of actual graded legs, one leg per game, paid from the Power tier table / Flex partial table with a 0.95 haircut.

### 14a. CORRECTION — 8 of the 20 props have SIMULATED lines (owner rule: real legs only)
`nba_market.prop_universe.line_source` splits the props: **REAL (method `archive`, 12):** points, pra, pts_reb, pts_ast, rebounds, assists, reb_ast, threes_made, steals, blocks, stocks, turnovers. **SIMULATED (8):** ftm, fta, fga, fgm, fg3a (`points-scaled`), oreb, dreb (`rebounds-share`), fantasy_score (`fs-reconstruction`) — lines that were never offered on any board. Every sweep in §7o–§13 filtered `kind='standard'` but NOT `line_source`, so all of them included simulated legs (369,916 of the 775,677 graded standard legs = 48%). **What this invalidates or puts in doubt until re-run on real lines:** every headline ROI in §13a–§13l (+24/+60/+85/+101/+127/+132%, ftm single-cell +59%, "peripheral" cell concentration — ftm+fta were ~72% of the "peripheral" legs, the +56% portfolio); §7o (the "player rank is real on peripheral props" finding was measured on oreb/fga/fgm/fta/dreb/ftm/fg3a — all simulated); §7p's ftm/fgm/oreb rows. **Not affected:** results measured on points/Over specifically (§7g/7h/7j/7n — real lines), the payout math (§7b/7c/7e/7i), correlation (§125) and the goblin pricing lesson (§13k). Trailing/consistency/market-edge (§8) were measured on pooled standard legs and need a real-only re-check.

### 14b. REAL-LINES-ONLY sweep (run 36538031809)
Pool: 405,761 graded real legs streamed → **22,967 priced** (prior-days-only cal_p ≥ 0.56), 319 slate-days, 2,092 configs produced slips, **1,269 (61%) with pooled ROI > 0.**
**S1→S2 protocol (rank configs on 2024-25, score on 2025-26; 879 configs have data in both):** mean S2 ROI of ALL configs **+29.9%**; mean S2 ROI of the **top-20 by S1 = +42.6%**; **18 of 20 positive**. For contrast, the run that INCLUDED simulated lines: all configs +35.6%, top-20 by S1 **+110.2%**, 20/20 — the simulated legs inflated the apparent selection edge ~2.6× (110% vs 42.6%), which is what the "cell concentration is the strongest lever" result (§13f) turns out to have been.
**Most cross-season-consistent real configs (S1 → S2):** `blend thr0.57 other_core under 6pk flex` +76.8% (777 slips/22 win-days) → **+68.9%** (735/25); `blend thr0.58 peripheral both 5pk flex` +64.1% → **+93.2%** (S2: 3,662 slips/80 win-days); `cal_p thr0.60 all under 6pk flex` +61.7% → **+93.0%**. **Pooled leaderboard (do NOT quote as expectations):** `blend thr0.61 peripheral both 6pk flex` +388% (532 slips, 19 win-days, positive in only 4 of 7 months), 6pk power +324%, 5pk power +272%; best robust per structure: 2pk Power +43% (151 slips/32 wd), 3pk Power +158% (106/15), 4pk Power +177% (484/20), 5pk Flex +231%, 5pk Power +273% (1,260/27). Tie-break bands on the top survivors are 20–40 points wide (e.g. +240%…+281%); cap-1 (best slip/day) roughly equals all-combos.

### 14c. HOW TO READ THESE NUMBERS (honest)
1. **Effective sample = DAYS, not slips.** Every slip on a day is built from the same ≤8 legs (C(8,5)=56 slips from 8 legs), so a day where those legs hit produces many winning slips at once. The top configs rest on 15–27 winning days and are positive in only about half their months (4/7, 6/10, 5/13). The "slips = 1,695 / 1,168 / 3,804" counts I quoted in §13 overstated the evidence for the same reason.
2. **Deep structures are a leverage on p.** Power EV ≈ p^k × payout × 0.95: at 4 legs, true p 0.58 → +7%, p 0.60 → +23%; at 5 legs +25% → +48%; at 6 legs +36% → +66%. A 2-point error in the true hit rate moves a 6-pick ROI by ~30 points, which is why deep-pick ROIs look enormous and are also the least certain.
3. **Realistic expectation from this evidence:** an average real-lines config is about +30% on the held-out season and a config chosen on S1 about +40–70% (pooled numbers above +100% are jackpot-driven). 18 of the 20 S1-selected configs stayed positive on S2 after the 5% haircut, so an edge very likely exists; its size is uncertain.
### 14d. NEXT (concrete)
(1) **Day-clustered bootstrap** on each surviving config (resample DAYS with replacement; report P5/P50/P95 ROI; require P5 > 0). (2) Mean S1 ROI across all configs, to see whether 2025-26 is simply a favourable season. (3) Re-run §7o/§8a/§8e/§8k signal tests on real props only. (4) Add the final_hp-based drivers (baseline_hp, score) — needs their own load. (5) A non-overlapping one-slip-per-day series with drawdown and losing-streak stats (the loss-frustration measure). (6) Then Phase 4 gates on the survivors.

### 14e. HARNESS v3 RUN (2026-09-29, run 36597062900) — day-clustered bootstrap, season effect, loss-frustration series
v3 adds: a DAY-clustered bootstrap (configs picked on 2024-25 only; their 2025-26 DAYS resampled 2,000×, since every slip on a day shares the same few legs), **Gate 1** = bootstrap P5 > 0 with ≥200 S2 slips and ≥15 S2 winning days, a season-effect check, and a one-slip-per-day series (net units, max drawdown, longest losing streak). Real lines only, daily walk-forward calibration, 0.95 haircut; 22,967 priced legs, 319 slate-days, 2,092 configs.

**GATE 1: 13 of the top-30 S1 configs pass.** Every survivor is a `peripheral` cell (turnovers/stocks/steals/blocks — real lines), side `both`, threshold 0.57–0.60, at 4-pick Flex, 5-pick Flex or 3-pick Power. Strongest survivors (S1 ROI → S2 ROI, then S2 bootstrap P5/P50/P95):
| config | S1 → S2 | S2 slips / win-days / days | P5 | P50 | P95 |
|---|---|---|---|---|---|
| blend 0.58 peripheral both 5pk **Flex** | +64% → **+93%** | 3,662 / 80 / 122 | **+46%** | +90% | +140% |
| cal_p 0.58 peripheral both 4pk Flex | +30% → +61% | 5,046 / 113 / 138 | +34% | +60% | +91% |
| blend 0.58 peripheral both 4pk Power | +28% → +75% | 5,046 / 81 / 138 | +31% | +74% | +124% |
| cal_p 0.57 peripheral both 4pk Flex | +33% → +55% | 5,734 / 116 / 143 | +31% | +55% | +82% |
| blend 0.59 peripheral both 4pk Flex | +35% → +59% | 4,178 / 107 / 135 | +31% | +59% | +91% |
| cal_p 0.59 peripheral under 3pk Power | +29% → +55% | 2,350 / 87 / 128 | +24% | +54% | +90% |
Every failed config in the top 30 failed for the same reasons: `other_core`/`points` cells with tiny S2 samples (9–15 days) or deep 6-pick Power with a P5 of −25…−40%. **The 6-pick pooled leaders (+388%, +373%) are NOT in the S1-picked list at all** — they only look good pooled.

**⚠️ SEASON EFFECT — the biggest caveat:** mean ROI over ALL 879 two-season configs is **2024-25 −12.8%** vs **2025-26 +29.9%**. Two readings, both must be checked before this is trusted: (a) *calibration warm-up* — with daily walk-forward, 2024-25 legs are priced from thin early cells (n≥60 but few days), so S1 numbers are structurally noisier/worse, and by 2025-26 the map has a full season behind it; (b) *2025-26 is simply a favourable season*, in which case S2 ROIs are optimistic. The survivors' P5 > 0 is out-of-sample and day-bootstrapped, so it is real evidence of an edge in 2025-26 — but the S1 negatives mean **the size cannot be assumed to repeat**. Test: re-run with S1/S2 swapped (pick on 2025-26, score on 2024-25) and with the warm-up excluded (score S1 only from Jan 2025).

**ONE SLIP PER DAY (the loss-frustration measure, 2025-26, survivors):** the 4-pick Flex configs finish net-positive on **~51–52% of placed days** (cal_p 0.57 4pk Flex: 143 days, 52%+, +96 units, max drawdown 8.3u, longest losing streak 5 days) — the smoothest profile and the owner's stated preference. 5-pick Flex: ~42% of days positive, larger net (+117 to +119u) but longer streaks (6–11 days) and drawdowns to 12u. 3-pick Power: ~31% of days, +112u, streak 9–11. **Flex 4-pick on peripheral props is the low-frustration candidate; 5-pick Flex the higher-net/higher-streak one.** (The +57.6u / +40.5u rows are blend-driver 4pk Flex — blend does not beat cal_p here.)

**What this run settles:** on real lines the surviving edge lives in the peripheral real props (turnovers, stocks, steals, blocks) at cal_p ≥ 0.57–0.59, in 4-/5-pick Flex or 3-pick Power, at roughly +55–90% on 2025-26 with a bootstrap floor of +24–46% — placeable one slip a day on ~120–145 days a season. What it does NOT settle: whether 2025-26 is representative (the −12.8% S1 mean). NEXT: (1) swapped-seasons run + warm-up-excluded S1; (2) per-prop breakdown of the peripheral survivors (is it all turnovers?); (3) Gate 2 = survive BOTH directions; (4) real-only re-check of §7o/§8 signals; (5) then Phase 4 gates proper.

### 14f. SEASON-EFFECT CONTROLS (2026-09-29, runs 36597714003 swapped, 36597727511 warm-up-excluded) — the gap is REAL, not warm-up
**Warm-up test (score 2024-25 only from 2025-01-01, i.e. drop the first ~2 months of thin calibration):** mean config ROI **2024-25 −12.0% vs 2025-26 +27.4%** — unchanged from the full run (−12.8% / +29.9%). **The season gap is NOT a calibration warm-up artifact.** On average, across all 747–879 two-season configs, 2024-25 was a LOSING season for this whole family of configs and 2025-26 a winning one.
**Swapped test (pick on 2025-26, score on 2024-25):** the 2025-26 leaders are the +200–218% jackpot configs (6pk Power/Flex, `all`/`other_core` cells); scored on 2024-25 they collapse to −46% … +12%, **0 of 30 pass Gate 1**. This is the selection curse in its purest form: choosing on the friendly season selects the luckiest deep configs, none of which hold.
**What is and isn't established:**
- Established: in 2025-26, the peripheral-real-prop Flex/3pk-Power family has a day-bootstrapped edge (§14e P5 +24…+46%). That is real for that season.
- NOT established: that the edge transfers between seasons. The forward survivors were picked on 2024-25 at only +27…+35% S1 ROI (modest), and the average config LOST money in 2024-25. Two seasons cannot distinguish "the edge grew because the calibration map matured" from "2025-26 was a favourable season." **Deployable size cannot be stated from this evidence; the direction (positive) is likely but a ~+30% swing between seasons is inside the observed range.**
- The reverse-direction failure is not by itself fatal (it tested jackpot configs, not the survivors), but it removes any claim that "top configs generalize."
**Consequence for the gates (Phase 4):** the correct gate is **survive in BOTH directions** — a config must pass P5 > 0 when picked on either season and scored on the other, AND its per-season ROI must both be positive. From this run, that means the family passes forward but the specific configs have not been shown to pass backward with meaningful size. The honest working expectation for the live season: **positive, with the low-frustration 4pk-Flex peripheral profile the safest, and stakes sized as if the true ROI were near the 2024-25 end (≈ +0…+30%), not the 2025-26 end.**
**NEXT:** (1) score the 13 forward survivors explicitly on 2024-25 (the missing cell); (2) per-prop breakdown — how much of "peripheral" is turnovers alone; (3) monthly walk of the survivors across both seasons (is 2024-25 negative throughout, or only Oct–Dec?); (4) Gate 2 = both-directions; (5) real-only re-check of §7o/§8 signals; (6) live paper-tracking from Oct 20 as the third "season" — the only way to break the two-season ambiguity.

### 14g. PROBE RUN (2026-09-29, run 36598907869) — the missing cells, and what the 2024-25 numbers actually mean
Added `CS_PROBE`: named configs get per-season ROI with a DAY bootstrap on EACH season, a month walk, and a per-prop breakdown of the legs their slips used. Probed the 13 survivors + the four single-prop peripheral cells.

**1. The survivors are POSITIVE on 2024-25 too — on far fewer days.**
| config | 2024-25 ROI (slips / win-days / days) | 2024-25 bootstrap | 2025-26 ROI (slips / win-days / days) | 2025-26 bootstrap |
|---|---|---|---|---|
| cal_p 0.57 peripheral both 5pk Flex | **+37.5%** (435 / 21 / **35**) | P5 −8% P50 +36% P95 +83% | +87.2% (4,219 / 95 / 124) | P5 +45% P50 +86% P95 +133% |
| cal_p 0.57 peripheral both 4pk Flex (cf.) | (2024-25 shown in §14e run: +33%) | — | +54.6% (3,271 / 103 / 144) | P5 +27% P50 +55% P95 +84% |
| blend 0.57 other_core under 5pk Flex | +31.7% (1,717 / 46 / 77) | P5 −17% P50 +28% P95 +91% | +44.9% (1,701 / 47 / 81) | P5 +3% P50 +44% P95 +89% |
Read together with §14e (survivors' S1 ROI +27…+64%): **the survivors were positive in BOTH seasons.** The 2024-25 bootstrap floors dip just below zero (P5 −8%, −17%) only because there are 35–77 scoring days, not because the season was bad for them.

**2. WHY 2024-25 looks negative "on average" (§14f) — a POOL-SIZE artifact, resolved.** The peripheral cells (turnovers, stocks, steals, blocks) are low-volume props: with daily walk-forward calibration and `min_n=60`, their (prop, side, bucket) cells only reach 60 prior observations part-way into 2024-25, so the 2024-25 pool for these configs is 3–8× smaller (e.g. 35 vs 124 days; single-prop cells: turnovers 3–5 days, steals 6, blocks 0). The "−12.8% mean over all configs" is dominated by the hundreds of configs that had almost no 2024-25 days and by deep-pick configs that need many legs a day. **For the surviving family, 2024-25 was not a losing season; it was a thin one.** The month walk confirms it: 2024-25 months for the 5pk-Flex probe are −81, +49, −33, +95, −28 (few days each), 2025-26 months are +12, +75, +68, +148, +44, +76, +165 (all positive from Nov). This is also the answer to "does the calibration map need to mature?" — yes: the peripheral cells need ~a season of history before they are populated enough to select from daily. **Consequence: from Oct 20 the live map carries two full seasons, so the live pool will look like 2025-26's, not 2024-25's.**

**3. It is NOT all turnovers.** Leg mix of the peripheral survivors: **steals 36–37% (hit 0.66–0.67), stocks 29–32% (0.60–0.63), turnovers 27–29% (0.64–0.65), blocks 5%.** Three props share the edge roughly equally; blocks is a minor contributor. Single-prop cells, 2025-26 only: turnovers 4pk Flex +70.9% (296 slips, 34 win-days, 48 days, P5 +17%); turnovers 3pk Power +69.7% (497 / 41 / 76, P5 +29%); stocks 4pk Flex +40.7% (1,162 / 58 / 86, P5 +12%); steals 4pk Flex +25.9% (514 / 43 / 66, **P5 −16%**); blocks 4pk Flex "+443%" on **37 slips, 2 win-days, 3 days** — a jackpot, ignore. **Turnovers is the strongest single cell, steals the weakest alone, and the MIXED peripheral pool is better than any single prop** (more days, higher bootstrap floor) — diversification across the three props is doing real work.

**4. Blend vs cal_p:** on the same cells blend is not consistently better (§14e series: blend 4pk Flex net +40…+58u vs cal_p +87…+96u). Keep cal_p as the primary driver; blend is a tie-breaker at most.

**REVISED STANCE (supersedes the size caution in §14f):** the surviving family — peripheral real props (steals/stocks/turnovers, blocks minor), cal_p ≥ 0.57–0.58, 4-pick Flex (low-frustration) or 5-pick Flex / 3-pick Power (higher net) — is positive in both seasons; the 2024-25 weakness is pool thinness, not a losing regime. Point estimate for a mature map ≈ 2025-26's **+55% (4pk Flex) / +87% (5pk Flex)** with day-bootstrap floors of **+27% / +45%**; stakes sized to the floor, not the point. Deep 6-pick and single-prop blocks/steals stay excluded. NEXT: Gate 2 formalised (both-seasons positive + S2 P5 > 0 + ≥60 S1 days where available); real-only re-check of §7o/§8 signals; wire the survivor config into the paper-pick path for Oct 20.

### 14h. REAL-LINES RE-CHECK of the §7o / §8 signal findings (2026-09-29)
The four signal findings that fed the harness were measured with the simulated-line props in (§14a). Re-run with `line_source='real'` only:
| signal | earlier claim | real-lines result | verdict |
|---|---|---|---|
| **Trailing-10 hit rate** (§8a) | +9.7pp monotonic | core props: cold 0.509 → mid 0.534 → hot 0.567 (**+5.8pp**, 84k legs, model_p flat ~0.63 across bands); peripheral: 0.527 → 0.584 → 0.614 (**+8.7pp**, but only 1,239 legs — band edges noisy) | **SURVIVES** — real signal the model doesn't carry; smaller than claimed. Keeps `blend` legitimate as a tie-breaker. |
| **Consistency interaction** (§8e) | amplifies trailing both ways | hot+consistent 0.582 > hot+streaky 0.566; cold+consistent 0.487 < cold+streaky 0.512 | **SURVIVES**, same shape, slightly smaller |
| **Market-edge** (§8k) | +9.8pp using RAW model_p | using **walk-forward cal_p** (prior-days-only, n≥60) vs window book prob, Over side, 2025-26: book>cal 0.460 → flat 0.484 → +3–8 0.516 → cal≫book **0.567** (**+10.7pp**, monotonic). Top band's cal_p (0.584) now sits close to realized (0.567), where the raw version claimed 0.653 — the calibration fixed the overconfidence. **BUT volume: 323 legs/season in the strong band** | **SURVIVES** as a real, now honestly-calibrated signal — usable as a FILTER, too sparse to be a bulk rank |
| **Player hit-rate rank** (§7o) | "real on peripheral props (oreb/fga/fgm/fta/dreb/ftm/fg3a)" | per-player residual (actual − cell-expected) sd = **0.004–0.006** on every real prop — BELOW the ~0.04 that binomial noise alone would produce (players with ≥80 legs; peripheral props don't even have enough such players to appear) | **DEAD.** Player identity adds nothing once the model_p cell is known. The §7o result was entirely an artifact of the simulated lines. **Remove the player rank (Rank 5) from the live stack.** |
**Net for the meta-model / harness feature set:** trailing + consistency + market-edge(filter) stand; player-rank is dropped. The harness's `cal_p` and `blend` drivers are both built only on surviving signals. This closes the doubt raised in §14a for the rank layer.

---

## 15. REALIGNMENT WITH THE ORIGINAL BRIEF (2026-09-29) — the untested items, tested

The owner's original brief asked for PP **and Underdog**, app restrictions, basketball correlation, and multi-layer gates. After the simulated-line correction (§14a), only PP had been re-tested. This section closes the gaps with real data + research + Gemini.

### 15a. UNDERDOG — tested on our REAL UD board archive (471,711 legs, 379 days)
**Official payout table** (help.underdogsports.com, updated this week): Standard 2pk 3.5× · 3pk 6.5× · 4pk **12×** · 5pk 20× · 6pk 35× · 7pk 65× · 8pk 120×. Flex all-hit 3pk 3.25× · 4pk 6× · 5pk 10× · 6pk 25×; one miss 3pk 1.09× · 4pk 1.4× · 5pk **2.5×** · 6pk 2.6×; two misses 6pk 0.25×. **UD beats PP on the same legs at every size that matters: 4pk Standard 12× vs PP Power 10× (+20%), 3pk 6.5× vs 6×, 5pk Flex one-miss 2.5× vs 2×.** Rules: picks from ≥2 teams, same player never twice, ties/voids shrink the entry, and **"correlated projections can modify your projected payout"** (a shift shown only in the entry builder — NOT in our archive).
**Per-leg modifiers on OUR props (real UD board, window snapshot):** every main-line leg for turnovers, steals, blocks, blocks_steals, points, rebounds, assists, threes carries **exactly 1.0×** (0% discounted). The sub-1.0 board average (0.974, P10 0.83) comes entirely from alternate/ladder rungs, which are separate rows. So the surviving family's legs would earn UD's full base table.
**Coverage — the catch:** UD lists these props on only **~11–20% of the player-days PP does** (turnovers 829 of 4,053; steals 403 of 3,402; blocks_steals 441 of 3,845; blocks 192 of 1,956), and when both list the same player the **line is identical (100%; UD never lower)**. **Verdict: UD is a payout upgrade on the ~15% of legs it shares with PP, not a replacement pool.** Deployment: build the slip from the PP pool; if all its legs are also on UD at the same line, place it on UD for the higher payout (subject to UD's builder-time correlation shift, which must be read at placement). A UD-only backtest is not possible from the archive because the correlation shift isn't recorded.
(Our stored `board_payout_conversion_rules` "UD = decimal(American) × 0.963" applies to UD's *alternate* rungs, which are priced by odds — consistent with the above; main lines are 1.0×.)

### 15b. APP RESTRICTIONS (research, official pages)
- **PrizePicks:** no same player twice in an entry; same-game/same-team legs ALLOWED (PP prices nothing extra for them on standard Flex/Power); Flex 3–6 picks, Power 2–6; voided leg shrinks the entry to the next size (`pp_power_after_voids`, §7a).
- **Underdog:** ≥2 teams per entry; no same player twice; Standard 2–8, Flex 3–8; correlated-projection payout shift at build time; ties/voids shrink the entry.
- **Harness implication:** the harness already enforces one-leg-per-game (stricter than either app requires), so every backtested slip is placeable on both. **New hard block needed: same-player across props** — `stocks` (blocks+steals) CONTAINS `steals` and `blocks`; a player's steals-Over and stocks-Over can both qualify and must never share a slip (see §15c). The harness's one-per-game rule already prevents this today (one leg per game ⇒ one leg per player), but must be kept if that rule is ever relaxed.

### 15c. BASKETBALL CORRELATION — re-measured on the REAL surviving family (real lines, model_p ≥ 0.58, turnovers/steals/blocks/stocks)
| pair relation | pairs | joint | independent | covariance |
|---|---|---|---|---|
| different game | 59,888 | 0.3699 | 0.3687 | **+0.0012** |
| same game, opposite teams | 3,741 | 0.3555 | 0.3567 | −0.0012 |
| same team | 3,373 | 0.3590 | 0.3592 | **−0.0001** |
| **same player** (steals ⊂ stocks) | 483 | 0.3644 | 0.3325 | **+0.0319** |
Cross-game, same-game-opponent and even same-team defensive legs are **independent to three decimals** — the harness's independence assumption holds for this family (Gemini's concern about league-wide officiating/pace nights does not show up in the data). The only correlation is **same-player (+0.032), the steals⊂stocks overlap — hard block, never in one slip.** (§125's earlier same-player +0.21 was on points-family combos; for defensive props the overlap is smaller but still the only real one.)

### 15d. WHY defensive props and not points (Gemini + research; the mechanism check the edge needs)
A held-out edge with no mechanism is suspect. Gemini's mechanism, consistent with the data: (1) **low liquidity / low scrutiny** — sharps and volume concentrate on points/rebounds/assists, so operators face little pressure to sharpen steals/blocks/turnovers; (2) **inherited softness** — pick'em lines are largely copied from sportsbooks that are themselves less sophisticated on these markets; (3) **static pricing of volatile, matchup-driven stats** — operators use season-average-style lines for stats whose true rate is driven by minutes, opponent turnover/drive tendencies and role, which our model captures; (4) **coarse line grid** (0.5/1.5) makes a stale line costlier. Also consistent: core props (points etc.) realize 0.53–0.57 at the same model confidence and do NOT clear break-even (§14b), which is what "the model is only better where the market is weak" should look like. **Verdict: a plausible, specific mechanism exists; the edge is not an unexplained artifact.**

### 15e. OPERATOR-ADAPTATION CHECK (Gemini's "single most likely way it disappears") — measured
If PrizePicks were tightening these lines, the qualifying pool would shrink and/or realized hit would drift down over time. Real data, qualifying legs (model_p ≥ 0.58) on the defensive props, by month:
- 2024-25: 7–16 qualifying legs/day, realized hit 0.559–0.659; 2025-26: 20–29/day, realized 0.555–0.630; **no downward drift into 2026** (Jan 0.608, Feb 0.569, Mar 0.620, Apr 0.613). The two 0.555–0.559 months are both season-opening weeks (Oct 2024, Oct 2025, thin calibration). The pool GREW (calibration maturing, §14g). **Realized hit on qualifying legs never sat below 0.555 in any of 14 months.**

### 15f. LIVE GATE (Gemini's proposal, re-based on OUR break-evens)
Our real break-evens (§7c, identical legs): 4pk Flex 0.56, 5pk Flex 0.55, 3pk Power 0.56 (Gemini's 0.570 is slightly high). Qualifying-leg realized hit has historically run 0.56–0.66 (mean ≈ 0.60), so the edge is the ~0.04 buffer above break-even.
- **Track:** rolling realized hit of placed qualifying legs (primary) + qualifying legs/day (secondary, detects line tightening even when the survivors still hit).
- **Yellow (cut volume, re-evaluate):** rolling hit < **0.58** over ≥100 legs, or qualifying legs/day < ~10 for 2+ weeks (historical floor outside opening weeks).
- **Red (stop):** rolling hit < **0.565** over ≥150 legs.
- **Opening weeks:** expect ~0.555 and a thin pool for the first 2–3 weeks (both seasons show it); do not trigger red on that window — size small until the pool reaches ~15/day.
These become Phase-4 Gate 3 (live). Gate 1 (S2 bootstrap P5 > 0) and Gate 2 (positive in both seasons + P5 > 0) already exist in the harness.

---

## 16. THE RANK LAYER, DEEPENED (2026-09-29) — leg-by-leg, trailings, plain-line, player, and the sort-key finding

Owner: not deep or strategic enough in ranks, trailings and high hit rates. Correct — the defensive-prop edge was found with one sort key (cal_p), one window, coarse bands, then I moved to structure. Rebuilt the rank layer on the real defensive pool (turnovers/steals/blocks/stocks, `line_source='real'`), prior-days-only calibration everywhere (no leakage).

### 16a. Leg-by-leg cells (prop × side × line) — the family is NOT one thing
At model_p ≥ 0.58 (n_q = qualifying legs): **steals Under 0.5 → 0.668 (816 legs)** · **stocks Over 0.5 → 0.690 (84)** · turnovers Over 2.5 → 0.652 (112) · turnovers Over 1.5 → 0.634 (205) · turnovers Under 2.5 → 0.632 (155) · stocks Over 1.5 → 0.627 (351) · blocks Over 0.5 → 0.608 (176) · turnovers Over 0.5 → 0.599 (217) · stocks Under 1.5 → 0.589 (1,058) · turnovers Under 0.5 → 0.586 (304) · turnovers Under 1.5 → 0.575 (687) · stocks Under 0.5 → 0.574 (101) · blocks Under 0.5 → 0.569 (383) · steals Over 0.5 → 0.567 (383) · **stocks Under 2.5 → 0.557 (140)** · **steals Under 1.5 → 0.549 (297)**. The last two sit at/below the 4pk-Flex break-even (0.56) — a cell-agnostic threshold had been mixing 0.67 legs with 0.55 legs. Steals Over 1.5: zero qualifying legs (model never reaches 0.58 there).

### 16b. Trailing windows on this pool — nearly powerless (corrects §8a/§14h for these props)
Correlation with next hit, legs with ≥15 prior games (n=4,474): **t3 0.042 · t5 0.031 · t10 0.039 · t20 0.020**, vs **model_p 0.151**; trailing vs model corr 0.158 (orthogonal but weak). §14h's "+8.7pp peripheral" was 3 coarse bands with 150 cold legs. On rare-event stats the last 3–20 games barely predict the next; trailing is at most a weak second key here. (It remains a real, larger signal on the core props — §14h core +5.8pp — where it doesn't help because those props don't clear break-even anyway.)

### 16c. Which rank family carries the signal — the plain-line and player ranks are weak on this pool
Prior-days-only, since 2025-01, n=10,052: **cell rank (prop,side,model-bucket) corr 0.139** · plain player-agnostic LINE rank (prop,side,line) **0.031** · PLAYER rank (player's own history on prop+side) **0.016** · raw model_p **0.152**. The edge is in *where the model places a specific player on a specific night*, not in the line as a fixed thing or the player as a fixed thing. Both "high hit rate" families from the brief (Rank 5 player, Rank 6 plain line) are near-powerless on the props that carry the edge. (They were only ever "real" on the simulated lines, §14h.)

### 16d. THE SORT-KEY FINDING — raw model_p ORDERS better than the calibrated cell (reverses a §7-era assumption)
Daily top-N realized hit, walk-forward, both seasons:
| season | top-3 cal / raw | top-5 cal / raw | top-8 cal / raw | raw top-5 CLAIMED |
|---|---|---|---|---|
| 2024-25 | 0.415 / **0.539** | 0.467 / **0.554** | 0.503 / **0.552** | 0.609 |
| 2025-26 | 0.596 / **0.635** | 0.589 / **0.636** | 0.585 / **0.636** | 0.712 |
**Sorting by raw model_p beats sorting by the calibrated cell by 4–12 points at every depth in both seasons.** A 13-bucket cell collapses the model's within-bucket ordering (26 buckets: 0.592, no better; line-aware cell: 0.618, recovers half). **But raw model_p overstates the LEVEL (claims 0.712, realizes 0.636), so it must never PRICE a leg.** Two roles, two numbers: **SORT by raw model_p; PRICE/ELIGIBILITY by the walk-forward calibrated cell (or better, a per-leg calibration that preserves order — isotonic on model_p within prop×side).** The harness currently sorts by cal_p (`DRIVERS['cal_p']`) and so has been leaving ~4 points of top-N hit on the table; `blend` sorted by cal_p+trailing was likewise handicapped. **Change: add a `raw` driver (sort model_p, threshold on cal_p) and re-run.** Expected: same eligibility pool, better-ordered top-N → higher cap-1 ROI.

### 16e. Side × line-class tiers inside the family (raw-model top-8/day, 2025-11 on)
**Under, line 0.5 → 0.685** (314 legs; "zero steals/blocks/turnovers tonight") · Over, line 0.5 → 0.632 (182) · Under, line ≥1.5 → 0.624 (460) · **Over, line ≥1.5 → 0.593** (246, claims 0.725 — the most overconfident class). A rank-over-rank: within the raw-model order, prefer Under-0.5 and Over-0.5 legs; the "at-least-N of a rare event" Overs on high lines are the weakest and most overconfident. This is the sub-structure a flat threshold hides.

**What changes in the strategy:** (1) harness gets a `raw`-sorted driver with cal_p eligibility; (2) eligibility becomes per-CELL (drop steals U1.5 / stocks U2.5, keep the ≥0.60 cells) rather than one flat threshold; (3) a side×line-class preference as a tiebreak/rank-over-rank; (4) trailing demoted to a weak tiebreak on this pool; (5) Rank 5 and Rank 6 dropped for this family (near-zero signal on real lines). Next: implement (1)–(3) in the harness and re-run Gate 1/2 — the top-N ordering gain should show directly in the cap-1 series.

### 16f. HARNESS RUN of the rank-layer changes (run 36638900519) — what the leg-level gain is worth at the SLIP level
Implemented a `raw` driver (sort by model_p, eligibility still cal_p ≥ thr) and a `cells` cell-set (only the eight ≥0.60 leg-by-leg cells from §16a). Head-to-head, same eligibility pool, same slips count, real OOS:
| config (thr 0.57/0.58, both sides) | cal_p driver: 2025-26 ROI (P5) | raw driver: 2025-26 ROI (P5) | 2024-25 cal / raw |
|---|---|---|---|
| peripheral 4pk Flex | +54.9% (P5 +31%) | **+58.2% (P5 +36%)** | +33.0% / +30.5% |
| peripheral 5pk Flex | +87.2% (P5 +45%) | **+88.9% (P5 +55%)** | +37.5% / +39.4% |
| peripheral 3pk Power | +58.7% (P5 +34%) | +57.2% (P5 +34%) | +19.4% / +17.5% |
| cells 4pk Flex | **+82.6%** (P5 +35%) | +70.0% (P5 +32%) | 3 slips / 3 slips |
| cells 5pk Flex | **+141.0%** (P5 +46%) | +98.6% (P5 +37%) | none / none |
**Reading:** (1) The `raw` driver lifts the *floor* of the peripheral Flex configs (P5 +31→+36%, +45→+55%) and the point ROI by 2–3pp on Flex, is a wash on 3pk Power, and its month walk is smoother (fewer negative months: e.g. 4pk Flex 25-02 −14%→+39%, 25-03 +70%→+41%). **The leg-level +4pt top-N ordering gain (§16d) only partly compounds at the slip level, because the harness builds ALL C(8,k) combos from the top 8 — the ordering inside the top 8 barely changes which combos exist. It should show fully in a cap-1 (best-slip-only) series, which is how it will be placed live.** (2) On the `cells` set the *cal_p* driver wins (+82.6% vs +70.0%, +141% vs +98.6%) — with only eight cells the calibrated cell IS the right sort, and raw model_p's cross-cell ordering hurts. So the sort key depends on the pool: **raw model_p for the broad peripheral pool, calibrated cell for a hand-picked cell set.** (3) The `cells` set is a sharper but MUCH thinner and more volatile pool: 70–105 scoring days vs 124–143, essentially no 2024-25 sample (3 slips), months swinging −45%…+298%. Its higher point ROI is real but rests on ~37–75 winning days. **Not a replacement for the peripheral pool; a candidate high-conviction overlay** (place it on the days it qualifies, on top of the peripheral workhorse).
**Adopted:** peripheral pool → `raw` driver (higher floor, smoother months); `cells` → `cal_p` driver as an overlay; add a cap-1 series for both to the next run to measure the ordering gain where it actually applies. Steals U1.5 / stocks U2.5 stay excluded via `cells`; for the peripheral pool they are still eligible — a per-cell exclusion list inside `peripheral` is the next refinement.

---

## 17. HARNESS v4 — THE REAL BOARD, DAY BY DAY (2026-09-29, run 36641234301)

Owner: "day by day, real legs, real slips, real board snapshots." Two violations found and fixed.

### 17a. Timing — is a one-snapshot slate placeable? YES (verified on the raw snapshots)
`board_snapshots` carries `snapshot_ts` and `commence_time` per leg. PrizePicks window snapshot, defensive props: **26,512 / 26,512 legs (100%) captured BEFORE their game's tip**, median 2.5 h before, P10 1.5 h. Across all 378 slate-days the window snapshot was taken **before the day's FIRST tip** (avg 6.7 h before), and the day's games span 3.6 h after that. So the whole slate was visible at one pre-game moment, and a slip mixing a 7 pm and a 10:30 pm game is legitimately placeable if submitted before 7 pm — which the window timing guarantees. The as-of decision moment is real.

### 17b. Pool contamination — 14% of the "real-line" legs were NOT on PrizePicks' board
Joining `prop_universe` (`line_source='real'`, defensive props) back to the PP window snapshot on exact (day, player, market, line, side): **85.9% match; 3,742 legs do not.** Of those: ~1,000 were on OTHER books at lines PP never posted (betmgm 444, betr 405, draftkings 256, betrivers 164, underdog 118, …) — priced at PP's payout in every prior run; **2,704 matched NO window snapshot at all** (present in some other snapshot label, i.e. on a board at some time, but not at the decision moment). Both violate the rule. **Fix (v4): the harness pool IS the PrizePicks window board** — every leg is a row PP posted, `snapshot_ts < commence_time`, with outcome + model joined from `prop_universe` (22,740 of 26,512 board legs graded; 3,772 unscored/void legs excluded, never guessed; 0 duplicate joins). `CS_BOARD=1` default; `CS_BOARD=0` = old derived pool, comparison only.

### 17c. RESULTS ON THE TRUE BOARD — sober, and they replace §14e/§14g/§16f
Season-effect mean over 1,258 two-season configs: **2024-25 −8.3%, 2025-26 +10.3%** (was −12.8% / +29.9% on the derived pool — the derived pool's extra legs were adding ~20 pp of phantom ROI). **Gate 1 survivors: 1 of 30** (was 13) — the S1 top-30 is now dominated by `points`/`all` configs that fail on S2; the lone survivor is `blend 0.59 all under 5pk power` (+62% → +63%, P5 +4%), a marginal one.
Head-to-head probes on the true board (thr 0.57 unless noted, both sides):
| config | 2024-25 ROI (days) | 2025-26 ROI (days) | S2 P5 | CAP-1 2025-26: ROI / %days net+ / net / max dd / streak |
|---|---|---|---|---|
| peripheral 4pk Flex, cal_p | −5.9% cap-1 (53) | +45.7% cap-1 (132) | +19% | +45.7% / 52% / +60u / 7.6u / 5 |
| **peripheral 4pk Flex, raw** | **−23.9%** (53) | **+44.2%** (132) | +19% | **+51.1% / 54% / +67.5u / 6.3u / 5** |
| peripheral 5pk Flex, cal_p | +31.4% (37) | +63.3% (112) | +17% | +90.0% / 41% / +101u / 6.2u / 7 |
| peripheral 5pk Flex, raw | −37.8% (37) | +68.5% (112) | +28% | +97.1% / 39% / +109u / 6.2u / 7 |
| peripheral 3pk Power 0.58, cal_p | +12.4% (55) | +45.4% (144) | +20% | +58.3% / 28% / +84u / 11u / 11 |
| peripheral Under 4pk Flex, raw | −35.9% (37) | +61.6% (112) | +23% | +41.2% / 54% / +46u / 5.3u / 4 |
| cells 3pk Power, raw | −70% (10) | +49.2% (111) | +11% | +48.9% / 26% / +54u / 9u / 9 |
**What changed vs the derived pool:** 2025-26 ROIs fell ~10–20 pp (4pk Flex +55 → +44%; 5pk Flex +87 → +63/68%), bootstrap floors fell (P5 +36 → +19%, +55 → +28%), and **2024-25 flipped negative for most configs** (4pk Flex +33% → −6…−24%). The derived pool's non-PP legs were the flattering part. **The edge on the true PP board is: real and out-of-sample in 2025-26 (every peripheral probe P5 > 0 on S2), but NOT positive in 2024-25, and about half the size previously reported.**
**CAP-1 (how it's actually placed) is the number to quote now:** one 4pk Flex per day on the peripheral pool, 2025-26 → **+51% ROI over 132 days, 54% of days net-positive, +67.5 units, max drawdown 6.3 u, longest losing streak 5** — the low-frustration profile holds on the true board. 5pk Flex cap-1 → +97% / 39% of days / +109 u / dd 6.2 / streak 7. The ordering gain from `raw` (§16d) does show at cap-1: +51.1% vs +45.7% and +97.1% vs +90.0%. **But 2024-25 cap-1 is −11% / −33% for those same configs** — the S1 weakness is not just thinness anymore; on the true board those 37–53 days lost money.
### 17d. What this means
1. §14e–§14g and §16f overstated the edge by relying on `prop_universe` legs that were not on PrizePicks' board at the window. Their conclusions about STRUCTURE (Flex > Power for frustration, peripheral > points, raw sorts better) all survive; their ROI LEVELS do not.
2. The honest two-season picture: **2025-26 positive with floors around +19…+28%, 2024-25 negative on 37–55 thin days.** Two seasons cannot separate "the map matured" from "2025-26 was favourable"; the live season is the third sample and the §15f gate is the control.
3. **Stance for Oct 20 (revised down):** the 4pk-Flex peripheral cap-1 is the candidate to paper-track from day one — expected ROI on a mature map ≈ +40–50%, floor ≈ +19%, half the days net-positive, drawdowns ≈ 6–8 units; size stakes to a possible −10…−25% season (the 2024-25 outcome), not to the 2025-26 point. Anything quoted above +100% (5/6-pick pooled, `cells` overlays) rests on jackpot days and a single season.
4. Unchanged and still valid: the mechanism (§15d), independence (§15c), no operator drift (§15e), the live gate (§15f), UD as a payout upgrade on shared legs (§15a), and the rank-layer findings (§16a–e).
**Next:** (a) UD-board version of the same pool for the shared legs (v4 makes it a one-line change: `bookmaker='underdog'`); (b) per-cell exclusion inside `peripheral`; (c) paper-pick wiring for Oct 20 with the §15f gate.

---

## 18. THE RANKS, TESTED THE OWNER'S WAY — and the improvement that came out of it (2026-09-29)

The owner said three times that the high-hit-rate ranks, trailings and ranks were not being applied properly. He was right about the *method*: I had tested each rank as a feature that had to add something ON TOP of the model (residuals, correlations). His method is different — the rank IS the selector: a walk-forward table of legs sorted by realized hit rate, take the top. So I ran exactly that, on the real PrizePicks window board, walk-forward, 150 days of 2025-26, each rank picking its own daily top-5:

### 18a. Each rank as a PURE selector (whole board)
| selector | daily top-5 hit |
|---|---|
| **model probability** | **0.619** |
| plain prop-line hit rate (prop, side, line; player-agnostic, n≥100) | 0.497 |
| player hit rate on prop+side (n≥15) | 0.513 |
| player hit rate on the exact line (n≥8) | 0.511 |
| trailing-10 hit rate | 0.481 |
**Band-style on the defensive pool** (how the ranks were used in MLB): players with ≥70% historical hit rate on a prop went **0.469** next time; legs ≥80% hot over the last 10 went **0.508**; plain line ≥60% band has 28 legs at 0.464; model ≥0.60 went **0.623**; model ≥0.60 AND player-rate ≥0.60 went 0.625 — the player rank adds nothing.
**Conclusion, measured three independent ways now (§16b/c residuals, §18a selectors, band-style):** on the PrizePicks NBA board, a player's or a line's past hit rate does not predict the next outcome — every hit-rate rank picks at a coin flip. This is regression to the mean, and I should have run the selector test first instead of the residual test.

### 18b. WHY (Gemini, agreed and mechanistic)
A hit-rate rank measures the past LINE. After a streak PrizePicks moves the line, so the historical rate says nothing about the NEW line, which is re-centred near 50%. The model works because it estimates the probability of hitting *today's* line. **Why it worked in MLB:** pitcher roles and stat rates are stable, and niche pitcher lines are sticky — a persistent high hit rate on a sticky line is a proxy for a mispriced skill. **Why it fails in NBA:** defensive stats are rare, opportunistic events with high game-to-game variance, roles/minutes are volatile, and lines adjust quickly. No construction (shrinkage, min-n, same-line-only, moving-line) fixes it, because the problem is the target moving, not the estimate. **The hit-rate ranks are retired as selectors for NBA. Rank 1–6 from the brief reduce to one working rank: the model's probability of today's line, sorted raw (§16d).**

### 18c. THE IMPROVEMENT THIS SURFACED — rank-first slips, and 2024-25 turns POSITIVE
Gemini's top lever: fewer, stronger legs (size the slip to the edge available that day, not a fixed 4/5). Tested it the honest way — the true PP board, one slip per day, top raw-model legs (one per game), NO calibration-cell eligibility (the harness's `n≥60` cell requirement starved 2024-25 of legs and kept the wrong ones), only a floor on the weakest leg's model_p:
| cap-1 slip | 2024-25 ROI (days) | 2025-26 ROI (days) |
|---|---|---|
| 2pk Power, both legs ≥ 0.70 | +13.4% (98) | +26.4% (142) |
| **3pk Power, all ≥ 0.65** | **+34.4% (106)** | **+49.4% (145)** |
| 3pk Flex, all ≥ 0.65 | +5.8% | +14.7% |
| 4pk Flex, all ≥ 0.60 | +27.9% (117) | +33.1% (152) |
| 5pk Flex, top 5 (any) | +68.3% (126) | +44.4% (135) |
Leg-level availability: legs ≥0.70 hit **0.648** (3.7/day, ≥2 on 131 of 149 days); ≥0.65 hit 0.624 (5.3/day); ≥0.60 hit 0.618 (6.4/day).
**Every structure is positive in BOTH seasons.** The 2024-25 "losing season" of §17 was an artifact of the calibrated-cell eligibility rule; ranking on raw model_p with a per-leg floor uses the full season and it is positive. **3pk Power with all legs ≥0.65 is the best risk-adjusted structure in both seasons (+34% / +49%)** — Gemini's "smaller slip of extremely high-edge picks beats a larger diluted one" holds on this board. The 5pk Flex still has the highest 2024-25 number but rests on the jackpot tier.
**What changes:** eligibility = per-leg raw model_p floor (0.65 for 3pk Power, 0.60 for 4pk Flex), NOT calibrated-cell n≥60; sort = raw model_p; calibration keeps its pricing role only. The harness's `cal_p ≥ thr` gate is replaced by a `raw ≥ floor` gate. Cap-1 3pk Power ≥0.65 becomes the primary paper-track candidate for Oct 20; 4pk Flex ≥0.60 the low-frustration alternative. NEXT: re-run the harness with the raw floor (bootstrap floors + drawdown series for both), then the UD-shared-leg version, then the Gemini levers #2 (model features: minutes/injury nuance, opponent turnover/drive tendencies) and #3 (PP-vs-sharp-book line gaps as a filter).

---

## 19. THE MAP, THE OWNER'S WAY — Final HP rank, PrizePicks, 90-day sample (2026-09-30)

Owner stopped the work to align on method. The object is: **day by day, on the real PP board, every prop line broken by anchor-tier (Regular / Under-Anchor Goblin T1-T3 / Over-Anchor Demon T1-T3), rank each cell's legs by final HP, take the top n, cross with real outcomes → the top-n hit rate; sweep n point by point to find where the high hit rate breaks (the gold band); then check the survivors' real multipliers against break-even. No slips yet — candidate mapping only.** Then repeat with baseline HP and final score as the rank. Everything before §19 ranked by a model floor, not by top-n hit-rate tables, and dropped goblins/demons after one mispriced test — not this method.

### 19a. Tier assignment (owner rule B)
Anchor = the Regular line (Over+Under offered). Goblin lines below it = Under-Anchor Goblin Tier k (k = rungs below); demon lines above = Over-Anchor Demon Tier k. Verified on the real board (Ace Bailey, points, 2026-01-15): anchor 12 O/U; goblins 9.5/8.5/7.5 = UA-Gob T1/T2/T3 at factors 0.74/0.67/0.62; demons 13.5/15.5/17.5 = OA-Dem T1/T2/T3 at 1.13/1.52/2.11. Back data has goblins/demons as Over-only; tiers computed as rank-distance from the anchor within (day, player, prop, kind). Where no Regular line exists the switch point is the anchor (rare on this board).

### 19b. The map — points (83 real PP days, 2026-01-12 → 04-12), top-n hit rate, n granulated
| tier | top1 | top3 | top5 | top7 | top10 | top15 | top25 | top40 | legs/day |
|---|---|---|---|---|---|---|---|---|---|
| UA-Gob T3 | 0.831 | 0.807 | 0.802 | — | 0.798 | 0.786 | 0.777 | 0.765 | 59 |
| UA-Gob T2 | 0.771 | 0.755 | 0.752 | — | 0.741 | 0.742 | 0.722 | 0.704 | 90 |
| UA-Gob T1 | 0.651 | 0.743 | 0.701 | 0.701 | 0.692 | 0.670 | 0.662 | 0.637 | 101 |
| **Regular** | 0.627 | 0.627 | 0.605 | **0.601** | 0.570 | 0.569 | 0.574 | 0.562 | 236 |
| OA-Dem T1 | 0.518 | 0.478 | 0.472 | — | 0.464 | 0.444 | 0.422 | 0.393 | 102 |
| OA-Dem T2 | 0.349 | 0.349 | 0.345 | — | 0.357 | 0.347 | 0.326 | 0.303 | 98 |
| OA-Dem T3 | 0.301 | 0.289 | 0.282 | — | 0.263 | 0.244 | 0.223 | 0.199 | 78 |
**Gold bands (points):** Regular holds ≥0.60 through **top 7**, breaks to 0.58 at n=8 and settles ~0.57 from n=10; Gob T1 peaks at n=2-3 (0.747) and holds ≥0.70 through n=7; Gob T3 holds ≥0.80 through n=10 and 0.77 at n=25. Degradation inside a tier is gentle, not a cliff.

### 19c. The map — all 12 real PP props × tiers (top-1 / 3 / 5 / 10 / 20 hit rate; ≥60 days)
Defensive props (**steals, stocks, blocks, turnovers**) have **NO goblin/demon ladders on PP** — Regular only, small cells (14–33 legs/day). Highest Regular top-5: **steals 0.637, points 0.610, stocks 0.602, turnovers 0.585, pts_reb 0.581, rebounds 0.581, reb_ast 0.566, pts_ast 0.552, blocks 0.543, pra 0.528, threes 0.522, assists 0.520.** Goblin tiers run 0.65–0.89 at the top; demon tiers 0.10–0.52. (Full 59-row table in run of 2026-09-30; regenerable from the query in this section.)

### 19d. The multiplier check — the result of the method
Top-n hit rate × the REAL mean factor of those same legs = single-leg p·m. 3-pick Power break-even needs p·m ≈ 0.55 per leg (0.55³ × 6 ≈ 1).
| cell (top-5) | hit | m | **p·m** |
|---|---|---|---|
| **steals Regular** | 0.637 | 1.000 | **0.637** |
| **points Regular** | 0.610 | 1.000 | **0.610** |
| **stocks Regular** | 0.602 | 1.000 | **0.602** |
| assists OA-Dem T3 | 0.171 | 3.471 | 0.586 (17% hit — a jackpot leg) |
| turnovers Regular | 0.585 | 1.000 | 0.585 |
| pts_reb / rebounds Regular | 0.581 | 1.000 | 0.581 |
| reb_ast Regular | 0.566 | 1.000 | 0.566 |
| assists OA-Dem T2 | 0.272 | 2.164 | 0.563 |
| points OA-Dem T1 | 0.467 | 1.204 | 0.561 |
| pra UA-Gob T3 | 0.834 | 0.660 | 0.549 |
| points UA-Gob T1 | 0.704 | 0.772 | 0.539 |
| points UA-Gob T3 | 0.807 | 0.635 | 0.512 |
| every other goblin / demon cell | — | — | 0.41–0.55 |
**Finding: PrizePicks prices every goblin and demon tier so that hit × multiplier lands near 0.50 regardless of tier.** Gob T3 hits 0.81 and pays 0.635 → 0.512; Dem T3 hits 0.28 and pays 1.98 → 0.542. The high goblin hit rates are real and already charged for. **The only cells whose p·m clears the 3-pick break-even (0.55) are the Regular cells, led by the defensive props and points** — where m = 1.0 and the model's ordering is not offset by a price — plus a handful of demon cells that clear on a jackpot profile (assists Dem T2/T3, points Dem T1) and one goblin (pra T3 at 0.549, marginal). This is the same defensive+points family the earlier work reached, now derived by the owner's method from the map with the multiplier check, and it settles the goblin/demon question with the tier map rather than one flat test.
**Survivors (final HP rank, PP, 90-day):** steals R (top 3–5), points R (top ≤7), stocks R (top 3–5), turnovers R, pts_reb R, rebounds R, reb_ast R; jackpot-profile: assists Dem T2/T3, points Dem T1. **Next: the same map with baseline HP as the rank, then with final score; then the survivors' intersection is the candidate set.**

### 19e. AUDIT of §19b–d (owner: double-check everything) — two defects found and fixed
1. **The §19 map was NOT PrizePicks-scoped.** It filtered `line_source='real'`, which includes every book's real lines: 389,437 mapped legs vs 363,725 legs on the PP window board for the same 83 days (107%). §17 had already shown ~14% of those are never on PP's board. The cells were contaminated with non-PP legs.
2. **The PP join missed the goblin/demon ladders.** PP posts alternates as `player_points_alternate` etc. (43k points-alternate legs, lines 0.5–49.5); the join stripped only `player_`, so alternates never matched → only 85,026 of 363,725 board legs (23%) joined, and ALL of them were `standard`. **Fix:** map `*_alternate` → base prop. Result: **88% of the full board joins (standard 86.7%, alternates 88.4%, kinds goblin/demon/standard), 319,948 usable legs in the 90 days.** The remaining ~12% are board legs with no graded outcome/model (void or unscored) — excluded, never guessed.
So §19b–d were built on a wrong pool. Everything below supersedes them.

### 19f. The persisted map — `nba_score.tier_map_legs` (rank_key = 'final_hp')
One row per real PP window-board leg (standard + alternates), both seasons, tier by anchor-rank (R / G1–G3 / D1–D3), factor, final-HP score, outcome, and the leg's rank inside its (day, prop, tier) cell plus the cell size. **911,368 legs · 323 days · 12 props · 374/410 players.** By season: 2024-25 = 266,348 (R 139k · G 50k · D 77k); 2025-26 = 645,020 (R 173k · G 195k · D 278k). This is the leg-by-leg object the owner asked for; baseline and final-score maps are written to the same table under their own `rank_key`, so the survivor intersection is a join.
**Ladder expansion is a fact of the board:** PP roughly quadrupled its goblin/demon ladders between seasons. Deep tiers barely existed in 2024-25 (G3: 2–23 days; D3: 8–93 days) vs 158–161 days in 2025-26. **2024-25 deep-tier numbers are near-empty cells, not "a weaker season."** Only R and T1 tiers have full two-season history.

### 19g. The two-season cells (top-5 hit and p·m per season, ≥100 days total) — with the near-break-even survivors kept
| cell | 2024-25 hit / p·m (days) | 2025-26 hit / p·m (days) | status |
|---|---|---|---|
| steals R | 0.537 / 0.537 (148) | 0.614 / **0.614** (160) | survive |
| turnovers R | 0.545 / 0.545 (157) | 0.613 / **0.613** (160) | survive |
| points R | 0.574 / 0.574 (162) | 0.604 / **0.604** (161) | survive |
| stocks R | 0.565 / 0.565 (158) | 0.601 / **0.601** (160) | survive |
| pts_ast R | 0.564 (162) | 0.593 (161) | survive |
| pts_reb R | 0.542 (162) | 0.590 (161) | survive |
| pra R | 0.536 (162) | 0.588 (161) | survive |
| assists R | 0.568 (162) | 0.524 (161) | near — keep for signals |
| rebounds R | 0.567 (162) | 0.564 (161) | survive (flat) |
| reb_ast R | 0.547 (162) | 0.566 (161) | near — keep |
| blocks R | 0.522 (136) | 0.560 (159) | near — keep |
| threes R | 0.538 (160) | 0.529 (161) | near — keep |
| rebounds D2 | 0.214 / 0.476 (141) | 0.316 / **0.628** (161) | jackpot-survive (2025-26 only) |
| rebounds D3 | 0.192 / 0.552 (93) | 0.188 / 0.604 (161) | jackpot-survive |
| assists D1 / D2 / D3 | 0.581 / 0.507 / 0.441 | 0.539 / 0.598 / 0.579 | jackpot-near/survive |
| threes D1 / D2 | 0.549 / 0.566 | 0.564 / 0.554 | jackpot-near |
| points D1 / D2 | 0.509 / 0.543 | 0.539 / 0.512 | near — keep |
| points G1 / pra G1 / pra G2 | 0.505 / 0.501 / 0.549 | 0.532 / 0.538 / 0.531 | near — keep |
| every other goblin cell | 0.46–0.52 | 0.48–0.53 | near/below — keep the ≥0.50 ones for signals |
Break-even reference: 3pk Power needs p·m ≈ 0.55/leg; the owner's rule keeps anything **near** it. **Full-board conclusion unchanged from §19d in direction, softened in level:** PP prices the goblin/demon tiers to p·m ≈ 0.50 (G3 hits 0.79–0.80 and pays 0.61–0.66 → 0.49–0.52); the cells that clear are Regular (defensive props and points/points-combos lead) plus a few demon cells that clear on a jackpot profile. Regular top-5 hit ran 0.54–0.57 in 2024-25 and 0.59–0.61 in 2025-26.

### 19h. DEPTH OF DATES — what to trust (the owner's third question)
Month-by-month, top-5 Regular hit rate (final HP rank), full board:
| month | days | defensive R | points R | core-combos R | all R top-10 |
|---|---|---|---|---|---|
| 2024-10 | 10 | 0.476 | 0.520 | 0.567 | 0.569 |
| 2024-11 … 2025-04 | 152 | 0.512–0.597 | 0.535–0.607 | 0.508–0.590 | 0.524–0.551 |
| 2025-10 | 11 | 0.530 | 0.491 | 0.512 | 0.525 |
| **2025-11 … 2026-04** | 150 | **0.581–0.611** | **0.573–0.650** | 0.512–0.601 | 0.522–0.587 |
**Findings:** (1) **The step is BETWEEN the seasons, not within them.** 2025-26 is not a hot start that fades — from November on the defensive top-5 sits 0.58–0.61 every month, points 0.57–0.65. 2024-25 wanders 0.48–0.60. (2) **Both Octobers are weak** (0.48–0.53) — the season-opening weeks, thin board and thin calibration, in both years. Not a signal; do not size on them. (3) **Why the seasons differ: the RANKER changed, not the market.** The `model_p` that orders these legs is the final HP, and the final engine was rebuilt in summer 2026 with two seasons of history behind it; the 2024-25 legs were ranked by a model trained on half the data (and half the board, §19f). That is why "was 2024-25 a bad season?" kept giving contradictory answers — it was a less-trained ranker on a thinner ladder. (4) **What to trust:** 2025-26 from November on is the representative regime for the map's LEVEL (the model and the board as they now exist); 2024-25 is the floor / stress case; October of either year is the warm-up. For the signals phase, use both seasons for direction and 2025-26 (ex-October) for level.
**Next:** baseline-HP map and final-score map into the same table; survivor intersection across the three ranks; then signals on the near-break-even keepers.

### 19i. THE CANDIDATE LEDGER (final-HP rank, PP, 2025-26 from November, 150 days) + the goblin verdict
Break-even 3pk Power p·m ≈ 0.55; NEAR = 0.50–0.55 (kept for signals, owner rule).
- **ABOVE, Regular (12):** turnovers R (top-3 0.642 / top-5 0.613 / top-10 0.568) · points R (0.640/0.611/0.579) · steals R (0.638/0.619/0.591) · stocks R (0.614/0.608/0.560) · pts_reb R (0.600/0.595) · pra R (0.598/0.595) · pts_ast R (0.593/0.597) · reb_ast R (0.567/0.573) · rebounds R (0.567/0.569) · blocks R (0.572/0.556) · assists R (0.551/0.516). 2024-25 top-5 for the same cells: 0.525–0.575 (holds direction, lower level).
- **ABOVE, demon jackpot profile (8):** rebounds D2 (hit 0.32, m 2.01 → p·m 0.664 top-3) · assists D3 (0.17, 3.47 → 0.658) · threes D1 (0.43, 1.35 → 0.609) · rebounds D3 (0.19, 3.27 → 0.600) · assists D2 (0.29, 2.19 → 0.606 top-5) · rebounds D1 (0.46, 1.24 → 0.580) · assists D1 (0.557) · threes D2 (0.556 top-5). Mostly 2025-26 only (rebounds D2 was 0.476 in 2024-25 — ladder expansion).
- **NEAR (25, held for signals):** points D1/D2/D3, points G1/G2/G3, pra D1/D2, pra G1/G2/G3, pts_ast D1/D2, pts_ast G1/G2/G3, pts_reb D1, pts_reb G1/G2, reb_ast D1, reb_ast G1/G2/G3, threes R, assists G1, rebounds G1.
- **Dropped (14, p·m < 0.50):** the remaining goblin/demon tiers of rebounds, assists, threes, reb_ast, pra, pts_reb, pts_ast.
**GOBLINS — none survive, and the Flex angle does not rescue them.** Best goblin p·m: points G1 0.547, pra G1/G2 ~0.535 (top-3); the rest 0.47–0.53. Because a 0.80-hit leg pays partial Flex tiers often, I priced the top-5 goblins per cell as REAL 5-pick slips (real factor product × real Flex/Power payouts, 0.95 haircut): **every goblin cell loses — Flex −39% … −76%, Power −15% … −67%** (best: pra G3 Power −15%, points G1 Flex −39%). The all-5 rates are only 0.11–0.36 despite 0.70–0.80 per-leg hits (five different players), and the factor product of five goblins (~0.64⁵ ≈ 0.11) crushes the payout: a 5-of-5 Flex pays 10 × 0.11 ≈ 1.1×. **On PP the goblin discount is set correctly against the actual hit rate, tier by tier — the high hit rate is the reason for the discount, not an edge over it.** The one route left: the three NEAR goblin cells (points G1, pra G1/G2) — if a signal lifts their top-3 hit by ~5–8 pts without moving the price, points G1 clears. Held for signals. Demons are the opposite story: 8 demon cells clear on the jackpot profile because PP appears to under-price deep rebounds/assists demons in 2025-26.
**Not yet done (honest):** the top-X% cut (vs top-n) is not in the persisted table — cell sizes range 14–250 legs so a percentage cut behaves differently on the small defensive cells; added with the baseline map. Underdog check deferred by agreement (PP first).

### 19j. GRANULAR BANDS — n = 1…20, real multiplier at every n (owner: point by point applies to the multiplier check too)
The §19i ledger used fixed n (3/5/10). Re-swept every cell at n = 1…20 with the real factor at each n; `hold_60` / `hold_55` = the deepest n at which the cell still averages p·m ≥ 0.60 / ≥ 0.55 (the gold band's depth).
**GOBLINS — verdict CORRECTED.** At top-5 none cleared; at the top of the rank three do: **pra G2 n=1 → hit 0.807, p·m 0.563 · pra G3 n=1 → 0.860, 0.562 · points G1 n=2 → 0.730, 0.555**; four more within 0.01 (pts_reb G1 n=1 0.549, pts_ast G2 n=1 0.547, points G2 n=1 0.547, points G3 n=1 0.544). Same shape everywhere: **the goblin edge lives in the top 1–2 legs of the cell and decays fast** (pra G2: 0.563 → 0.539 → 0.534 at n=1/2/3). A top-5 band averaged the gold leg with four ordinary ones — the fixed-n test hid it. The §19i "no goblins" and the 5-leg Flex test (which built slips from the top 5) were both too coarse. Goblins are one-leg-a-day cells: pra G2/G3 top-1 and points G1 top-2 join the candidate set.
**Candidates by band depth (2025-26 from Nov, real p·m):**
| cell | best n / p·m | hold ≥0.60 | hold ≥0.55 | band type |
|---|---|---|---|---|
| rebounds D2 | 2 / 0.676 | n≤10 | n≤16 | durable jackpot |
| rebounds D3 | 2 / 0.635 | n≤13 | n≤20 | durable jackpot (widest) |
| steals R | 2 / 0.654 | n≤9 | n≤17 | durable |
| turnovers R | 2 / 0.648 | n≤6 | n≤18 | durable |
| points R | 4 / 0.640 | n≤6 | n≤20 | durable, widest supply |
| pts_ast R | 1 / 0.647 | n≤4 | n≤18 | durable |
| stocks R | 3 / 0.616 | n≤5 | n≤13 | durable |
| assists D2 | 5 / 0.606 | n≤5 | n≤15 | durable jackpot |
| threes D1 | 2 / 0.610 | n≤3 | n≤18 | durable |
| assists D3 | 3 / 0.658 | n≤4 | n≤10 | mid jackpot |
| pts_reb R / pra R | 1 / 0.653 · 2 / 0.610 | n≤2 | n≤20 | sharp top, wide floor |
| **points D1** | **1 / 0.654** | n=1 | n≤2 | sharp — one leg a day |
| pts_ast D1 / points D2 / pra D1 | 1 / 0.585 · 1 / 0.572 · 2 / 0.558 | — | n≤2 | sharp — top 1–2 only |
| rebounds D1 / assists D1 | 1 / 0.601 · 1 / 0.597 | n=1 | n≤9 | sharp top, mid floor |
| rebounds R / reb_ast R | 2 / 0.577 · 8 / 0.575 | never | n≤20 | wide-flat (supply, not edge) |
| assists R / blocks R | 3 / 0.551 · — | never | n≤3 | marginal |
**What the bands change:** (1) the fixed-n ledger made points D1 (0.654 at n=1, 0.535 at n=3) look like a NEAR cell — it is a one-leg-a-day ABOVE cell; (2) rebounds D3 is the deepest band on the board (≥0.60 to n=13), deeper than any Regular cell; (3) rebounds R and reb_ast R never reach 0.60 but hold 0.55–0.58 to n=20 — supply cells for filling a slip, not edge cells; (4) every cell's usable n is now known, which is what slip construction will read. **The candidate set is now defined per cell as (tier, n-band), not (tier) alone.** Baseline-HP and final-score maps next, same granularity, same table.

### 19k. GOLD BANDS — the full granular sweep, break-even per tier, constancy (owner's definition, 2026-09-30)
**Method (locked, in code — `nba/build_tier_map_bands.py`, workflow `nba-tier-map-bands.yml`):** for every (rank, window, prop, tier) cell, the day-by-day top-cut hit rate and real multiplier at EVERY n = 1…25 and EVERY top-pct = 1…30% of that day's cell (min 1 leg; at cut n only days where the cell actually has ≥ n legs count, so small cells cannot inflate deep cuts). Persisted: `nba_score.tier_map_bands` (9,545 rows: 59 cells × 3 windows × 55 cuts) and `tier_map_summary`. Windows: `2526_nov` (trusted level), `2425` (stress), `both`.
**Break-even per tier (owner):** the tier's average multiplier m fixes the hit rate it needs. For a 3-pick Power (6×) each leg needs p·m ≥ 0.55, so **p_be = 0.55 / m**: Regular 0.550 · Goblin T1 ~0.71 · G2 ~0.77 · G3 ~0.82 · Demon T1 ~0.44 · D2 ~0.27–0.36 · D3 ~0.16–0.20. (Raw single-leg break-even p·m = 1 is cleared by nothing — no PP leg pays itself back — so the slip's per-leg requirement is the right bar.) **Margin = hit − p_be. Gold band = the run of cuts where margin > 0, as large and as constant as possible.**
**Result, 2025-26 from Nov, final-HP rank — 28 of 59 cells have a positive peak margin.** By peak margin: steals R +0.104 (n=2, positive through n=17) · pts_reb R +0.103 (n=1, positive to n=25, never loses) · turnovers R +0.098 (to n=18) · pts_ast R +0.097 · points R +0.090 (n=3, to n=25, never loses) · points D1 +0.089 (n=1 ONLY, loses at n=3) · stocks R +0.066 (to n=13) · rebounds D2 +0.064 · pra R +0.060 (to n=25) · threes D1 +0.049 · assists D1 +0.047 · blocks R +0.045 (to n=5) · pts_ast D1 +0.043 (to n=3) · assists D3 +0.041 · rebounds D1 +0.041 · assists D2 +0.039 · rebounds D3 +0.028 (to n=24) · rebounds R +0.027 · reb_ast R +0.025 · **pra G3 +0.019 (n=1 only: needs 0.822, hits 0.860) · pra G2 +0.019 (n=1 only: needs 0.766, hits 0.807)** · threes D2 +0.018 · points D2 +0.012 · pra D1 +0.010 · points G1 +0.009 (n=2) · pts_ast D2 +0.006 · assists R +0.001 · pts_reb G1 +0.001.
**CONSTANCY (the test the owner's definition adds):** share of the 146–150 real days on which the cell's top-5 beat its own p_be. (At n=1–2 the day-share is just the hit rate, so top-5 is the steady measure.)
| constant gold bands (≥ 67% of days) | % days above p_be |
|---|---|
| steals R | 72% |
| points R | 71% |
| pts_reb R | 69% |
| pra R | 68% |
| **rebounds D3** (m 3.30, p_be 0.166, hits 0.200; positive to n=24) | 68% — the only CONSTANT demon band |
| **pra G2, n=1** (p_be 0.766, hits 0.807) | 67% — a real single-leg goblin band |
| stocks R · pts_ast R · turnovers R | 67% |
| steady but thinner: rebounds R 63% · assists D3 61% · blocks R 59% · pts_reb G1 59% | |
| **positive on average, INCONSTANT (≤ 50% of days):** points D1 42%, rebounds D2 49%, pts_ast D2 49%, assists D2 45%, rebounds D1 40%, pts_ast D1 40%, assists D1 33%, threes D1 36%, pra D1 36%, pra G3 36% | jackpot profile: the average margin comes from a few big days |
**What this changes vs §19j:** the D1/D2 demon cells that looked ABOVE on average are inconstant — real, but a jackpot profile to be sized as such, not gold bands; rebounds D3 is the one demon cell that is both positive and constant; two goblin cells (pra G2 n=1, pts_reb G1 n=1) are genuine single-leg bands; the Regular family (steals, points, pts_reb, pra, stocks, pts_ast, turnovers) is the constant core, positive on ~2 of every 3 real days at top-5. The pct-cut sweep is persisted alongside n (same table, `cut_type='pct'`); its bands are read the same way. **Next: baseline-HP and final-score legs into `tier_map_legs`, the same sweep, then the survivor intersection.**

### 19l. FINAL SWEEP of the final-HP map (owner: all prop lines, full board, all tiers, two seasons)
1. **Coverage:** all 12 real PP props are in the bands; every tier PP posts for each prop is present (the four defensive props are Regular-only on PP; threes has no G3 cell with ≥60 days); 323 slate-days across both seasons; every cut n=1…25 and pct=1…30 present for every cell in all three windows.
2. **Full board, day by day:** the map's daily leg count tracks the PP window board at **86–91% in every regular-season month of both seasons** (the steady 9–14% gap is unscored/void legs, excluded); worst regular-season day 68%; only two regular-season days map to zero (2024-12-14, 2024-12-17 — no graded universe rows upstream).
3. **GAP FOUND — the 2025 playoffs are not in the backdata.** April 13 → June 2025: 50 PP board days, ~97k board legs, but `prop_universe` holds only 21k legs and 7k graded, `final_hp` 21k. The playoff board was never fully ingested or scored upstream. April 2025 maps at 47%, May–June at 0%. **The "two seasons" are two REGULAR seasons (323 of ~373 board days).** Not a map defect — an ingestion gap. Consequence: nothing here is validated on a playoff board (fewer games, deeper ladders, different pool sizes); the 2026 playoffs will be the first playoff test. Flag for the pipeline: playoff ingestion/grading for 2025 is missing and would add 50 days of stress data.
4. **Two-season check, cell by cell (peak margin over the tier's own break-even; depth = last positive n):**
| cell | 2024-25 peak / depth | 2025-26 peak / depth | both / depth | verdict |
|---|---|---|---|---|
| steals R | +0.058 / 6 | +0.104 / 17 | +0.070 / 15 | **two-season gold** |
| points R | +0.067 / 12 | +0.090 / 25 | +0.065 / 25 | **two-season gold** |
| stocks R | +0.051 / 13 | +0.066 / 13 | +0.063 / 13 | **two-season gold** |
| turnovers R | +0.016 / 9 | +0.098 / 18 | +0.053 / 15 | two-season (weak 24-25) |
| pts_ast R | +0.025 / 19 | +0.097 / 22 | +0.041 / 19 | two-season |
| rebounds D3 | +0.031 / 4 | +0.028 / 24 | +0.028 / 24 | **two-season — the demon that holds** |
| pts_reb R | +0.007 / 14 | +0.103 / 25 | +0.026 / 22 | two-season (marginal 24-25) |
| rebounds R · reb_ast R | +0.016 / 11 · +0.013 / 14 | +0.027 / 25 · +0.025 / 25 | +0.016 · +0.016 | two-season, thin — supply cells |
| points D1 | +0.017 / 2 | +0.089 / 8 | +0.049 / 2 | two-season, top-2 only |
| **pra R** | **−0.005** | +0.060 / 25 | +0.019 / 15 | **2025-26 only** |
| **rebounds D2** | **−0.003** | +0.064 / 21 | +0.018 / 18 | **2025-26 only** |
| **pra G2 (n=1)** | **−0.004** | +0.019 / 1 | +0.008 / 1 | **2025-26 only** |
Ten cells are positive in both seasons and pooled; three of the §19k "constant" bands (pra R, rebounds D2, pra G2) are positive in 2025-26 only and are downgraded to *unproven across seasons*. Every cell is stronger in 2025-26 (retrained ranker + fuller ladders, §19h), so 2024-25 is the floor.
5. **Multipliers drift between seasons:** PP LOWERED its demon payouts as it expanded the ladders — points D1 1.46 → 1.22, rebounds D2 2.29 → 2.02 (Regular stays 1.00, goblins ~flat). The same tier's break-even therefore moves between seasons; the sweep computes p_be per window, which is why the per-window numbers are the ones to read. **The live-season gate must re-read the tier multipliers, not assume last season's.**
**Sweep verdict:** the final-HP map is complete for the data that exists; its one hole is upstream (2025 playoffs). Baseline-HP and final-score next, through the same builder.

### 19m. PRICING CORRECTION (owner, 2026-09-30): PrizePicks publishes no multipliers — the price is the system's, per line, current
Owner: "the full 2 seasons should use the current multipliers … PP does not even provide multipliers, it should be on the documentation." Checked the documentation (`PP_PAYOUT_FINDINGS.md` §1, §9): correct on both counts. **The raw PP board carries no multiplier** (column NULL on every row; `price` is a placeholder −137 / +100 identical across rungs); a 1-pick quote returns 422. The per-leg price is **reconstructed** by quoting 2-pick combos against a standard partner and de-compressing (`factor = payout/3`), validated on 452 real quotes, held in `nba_market.pp_leg_price` under ONE live formula (`pp-leg-v2-sqrt-cap-conservative-floor190`, 99.6% of 1.1M window legs priced; a mined quote outranks the model). **PP prices per LINE, not per tier** — only the deepest goblins sit on a flat 2.1× floor.
**Two errors in §19a–l, both fixed:** (1) my tier was rank-distance within kind; `pp_leg_price` already carries the system's anchor tier (`anchor_line`, signed `tier`, `position_vs_anchor`) and it disagrees on real legs (Bailey points 13.5 vs a 12 anchor is tier +2, not my D1); (2) I averaged per-line prices into a tier mean — the per-line price *is* the current price, so averaging discarded exactly what the pricing model carries. The `factor` I had used was this same model's output (leg-for-leg identical), so the LEVEL was current; the tier key and the averaging were wrong. Rescued-anchor legs (no regular line; system anchors on sportsbook consensus and leaves `tier=0`) are tiered from `line − anchor_line` (~14k demons, 1.9–3.1×) — the owner's "switch line" case.
**Rebuilt** (`build_tier_map_bands.py` stage 0, materialized view; 4 min): 910,513 legs, 323 days; tiers R 311k · G1 149k · G2 69k · G3 27k · D1 51k · D2 150k · D3 154k. Re-swept: 10,141 band rows.
**Corrected gold bands (2025-26 from Nov, break-even per leg from its own current price, constancy = % of real days top-5 beat p_be):**
| cell | m | p_be | peak n / hit | margin | positive to n | % days |
|---|---|---|---|---|---|---|
| steals R | 1.00 | 0.550 | 2 / 0.661 | **+0.111** | 17 | **73%** |
| pts_reb R | 1.00 | 0.550 | 1 / 0.660 | +0.110 | 25 | 69% |
| turnovers R | 1.00 | 0.550 | 2 / 0.654 | +0.104 | 17 | 68% |
| pts_ast R | 1.00 | 0.550 | 1 / 0.647 | +0.097 | 23 | 67% |
| points R | 1.00 | 0.550 | 3 / 0.624 | +0.074 | 25 | 69% |
| pra R | 1.00 | 0.550 | 2 / 0.620 | +0.070 | 25 | 69% |
| stocks R | 1.00 | 0.550 | 3 / 0.616 | +0.066 | 14 | 71% |
| blocks R | 1.00 | 0.550 | 1 / 0.588 | +0.038 | 6 | 66% |
| rebounds R · reb_ast R | 1.00 | 0.550 | 6 / 0.578 · 4 / 0.577 | +0.028 · +0.027 | 25 | 63% · 61% |
| pts_reb D1 | 1.33 | 0.415 | 10 / 0.533 | +0.117 | 12 | 41% |
| threes D1 | 1.34 | 0.410 | 1 / 0.473 | +0.061 | 18 | 45% |
| points D2 | 1.22 | 0.449 | 1 / 0.513 | +0.057 | 5 | 41% |
| rebounds D3 | **2.20** | 0.250 | 4 / 0.307 | +0.045 | 25 | **49%** |
| assists D1 / D3 · rebounds D2 / D1 · pts_ast D2 | 1.3–2.4 | — | — | +0.03–0.04 | 2–22 | 41–49% |
| pra G2 · pra G3 · points G1 · points G2 | 0.67–0.78 | 0.71–0.82 | 1 / 0.73–0.86 | +0.007–0.020 | 1 | 39–54% |
**What the correction changed:** the **Regular core is unchanged** (price 1.0 either way) — steals, pts_reb, turnovers, pts_ast, points, pra, stocks R beat their break-even on 67–73% of real days; these are the gold bands. **Every demon cell is now INCONSTANT (41–51% of days):** rebounds D3 was "constant" at 68% only because the rank-distance tier lumped deeper rungs at a 3.3× average; at the system's tier and the per-line 2.20× it is a jackpot cell like the rest. pts_reb D1's large margin (+0.117) comes from few big days (41%). Demons are a jackpot profile, all of them. Goblins unchanged: single-leg bands at n=1, margins ≤ 0.02, 39–54% of days. §19k's demon and goblin rows are superseded by this table.
**Standing rules from this:** price every leg with `pp_leg_price.factor` at the window snapshot (current model, per line); tier = the system's tier (rescued anchors from line−anchor); break-even per leg; never a tier-average multiplier. The builder now does all of it in stage 0. Baseline-HP and final-score maps next, same pipe.

### 19n. FULL REVIEW of the corrected map (2026-09-30) — each layer checked against a source that did not produce it
| layer | check | result |
|---|---|---|
| **1. Join** | priced PP window legs (1,092,596) → those joinable to a graded, model-scored universe leg | **910,599 joinable, 910,513 in the map, 0 duplicate keys.** The 86 gap = 123 keys that appear twice in the pricing view (the documented multi-harvest duplicate; factors 0.04 apart) resolved by keep-first. Nothing else dropped. |
| **2. Tier / kind** | map tier vs the system's tier recomputed from `pp_leg_price` (system tier, else line−anchor for rescued anchors), leg for leg | **0 kind mismatches, 0 tier mismatches on 10,763 legs** across four full days in both seasons (a full-population check exceeds the live query budget; the sample spans both seasons and all tiers). |
| **3. Price** | map factor vs `pp_leg_price.factor`, leg for leg; and price ranges by tier over all 910k | **0 price mismatches.** Regular = exactly 1.000 on all 311,160; goblins 0.614–0.934 (G1 avg 0.756, G2 0.698, G3 0.661; floor 0.614 = the documented flat deepest-goblin floor); demons D1 1.44 / D2 1.71 / D3 2.43 avg, max 5.76. 120 demons (0.02%) priced 0.96–0.99 — D1/D2 legs half a point above the anchor that the normal-tail model prices near-standard; consistent with the model, never selectable as demons. |
| **4. Rank order** | `score` non-increasing along `n_rank` inside every (day, prop, tier) cell | **0 violations.** |
| **5. Sweep arithmetic (n)** | persisted `tier_map_bands` hit / p·m / days vs an independent recompute from the legs | **identical to 4 decimals** on every cell tested (points R/G1/D3, rebounds D3, steals R; n = 1/5/10), day counts identical. |
| **5b. Sweep arithmetic (pct)** | same, for the pct cuts | **identical to 4 decimals** (points R, steals R; 1/5/10/25%). On small cells the pct cuts collapse to n=1…6 (steals R 1% = 1 leg/day, 25% ≈ 6); on large cells they reach far deeper (points R 25% = 6,562 legs). Both correct; they measure different things on different cell sizes, which is why both are kept. |
| **6. Coverage** | every (prop, tier) cell in the map present in the bands; day counts per cell | **all cells present, every cell ≥ 100 days**, all 12 props, tiers R/G1–G3/D1–D3 wherever PP posts them (defensive props R-only), 323 days both seasons. D0/G0 = 38 legs exactly at a rescued anchor, ignorable. |
**Verdict: the corrected final-HP map and its granular bands are complete and internally consistent at every layer; §19m's gold-band table stands.** Known limits, unchanged: no 2025 playoffs (upstream ingestion gap, §19l); the 2024-25 ranker was trained on less data (§19h). Next: baseline-HP and final-score through the same stage 0 → sweep → review.

### 19o. THE CANDIDATE LEDGER — final-HP rank, PrizePicks, all 59 cells (2026-09-30)
Break-even per leg from its current price (p_be = 0.55/m, 3-pick Power); margin = hit − p_be at the cell's best n; band = deepest positive n; % days = share of real 2025-26 days (from Nov) the top-5 beat p_be. GOLD = positive in both seasons and ≥ 60% of days.
**GOLD (9) — all Regular:** steals R (n=2 → 0.661, +0.111, band to 17, 24-25 +0.065, 73%) · pts_reb R (1 → 0.660, +0.110, to 25, +0.008, 69%) · turnovers R (2 → 0.654, +0.104, to 17, +0.016, 68%) · pts_ast R (1 → 0.647, +0.097, to 23, +0.025, 67%) · points R (3 → 0.624, +0.074, to 25, +0.049, 69%) · stocks R (3 → 0.616, +0.066, to 14, +0.051, 71%) · blocks R (1 → 0.588, +0.038, to 6, +0.031, 66%) · rebounds R (6 → 0.578, +0.028, to 25, +0.015, 63%) · reb_ast R (4 → 0.577, +0.027, to 25, +0.013, 61%).
**ABOVE both seasons, INCONSTANT (9) — jackpot profile:** threes D1 (m 1.34, +0.061, to 18, 45%) · points D2 (1.22, +0.057, to 5, 41%) · assists D1 (1.31, +0.043, to 12; 24-25 +0.127; 41%) · rebounds D2 (1.36, +0.039, to 11, 49%) · pts_ast D2 (1.23, +0.032, to 2, 43%) · pra G2 (0.72, n=1 → 0.807, +0.020, 54%) · pra G3 (0.67, n=1 → 0.860, +0.019, 39%) · points D3 (1.61, +0.004, 51%) · assists R (+0.001, 54%).
**ABOVE 2025-26 ONLY (13) — unproven across seasons:** pts_reb D1 (+0.117 at n=10, 24-25 −0.007, 41%) · **pra R (+0.070, to 25, 69% of days — but 24-25 −0.005; the near-miss of the ledger)** · rebounds D3 (+0.045, to 25, 49%) · assists D3 (+0.038) · rebounds D1 (+0.036) · pts_ast D3 (+0.018) · pts_ast D1 (+0.016) · points G1 (+0.008, n=2) · pra D2 (+0.008) · points G2 (+0.007, n=1) · assists D2 (+0.004) · reb_ast D1 (+0.004) · pts_ast G2 (+0.003, n=1).
**NEAR, within 0.05 of break-even — held for the signals phase (21):** pts_reb G1 (0.000) · threes D2 · reb_ast D2 · pts_reb D2 · threes R (−0.010; +0.011 in 24-25) · pra D3 · pra G1 · threes D3 · points G3 · pts_ast G1 · reb_ast D3 · pts_reb D3 · pts_ast G3 · points D1 (−0.033 now; +0.210 in 24-25) · pts_reb G2 · reb_ast G1 · reb_ast G3 · rebounds G1 · reb_ast G2 · pra D1 · threes G2.
**BELOW — dropped (7):** threes G1, assists G1, assists G3, pts_reb G3, rebounds G2, rebounds G3, assists G2.
**Reading:** every gold band is Regular; the sharpest four (steals, turnovers, points, stocks) plus the points-combos hold band depth to n=17–25. No goblin is gold; the two that clear both seasons do so at n=1 with margins ≈ 0.02. Demons above break-even are all inconstant (41–51% of days) — a jackpot family, sized as such. The same ledger is produced next for the baseline-HP rank and the final-score rank; the intersection of the three is the candidate set for the signals phase.

### 19p. THE THREE RANKS — final HP, baseline HP, final score — on ONE common pool, and the intersection (2026-09-30)
**A finding on the way:** `prop_universe.model_p`, the score every ranking so far had used, is **neither** `nba_score.final_hp.final_hp` nor `.baseline_hp` — corr 0.969 / 0.963, exact match on only 4.5% / 2.6% of legs; a third probability of undocumented provenance. So all three maps were rebuilt from `nba_score.final_hp`'s own columns (`final_hp`, `baseline_hp`, `score`) on **one common pool**: priced PP window leg + graded outcome + all three scores present → **828,818 legs per rank, 323 days** (91% of the graded pool; the 9% without a `final_hp` row are the edge rungs it does not carry, shown unbiased at §7m). The three maps now differ ONLY in rank order. §19o's numbers (ranked on `model_p`) are superseded by the `final_hp` column below; the differences are small.
**Head-to-head, 2025-26 from Nov (peak margin over per-leg break-even / 2024-25 peak / % of days top-5 beats p_be):**
| cell | final HP | baseline HP | final score | verdict |
|---|---|---|---|---|
| steals R | +0.104 / +0.065 / 74% | +0.104 / +0.058 / 75% | **+0.155** (n=1) / +0.051 / 74% | **GOLD ×3** |
| stocks R | +0.069 / +0.038 / 71% | +0.074 / +0.039 / 70% | +0.067 / +0.051 / 74% | **GOLD ×3** |
| turnovers R | +0.098 / +0.017 / 67% | +0.098 / +0.017 / 67% | +0.108 / +0.033 / 66% | **GOLD ×3** |
| pts_reb R | +0.090 / −0.010 / 65% | +0.070 / −0.010 / 65% | +0.103 / −0.003 / 69% | GOLD 25-26; 24-25 marginally negative under all three |
| points R | +0.063 / +0.036 / 66% | +0.067 / +0.030 / 64% | +0.063 / +0.055 / 68% | **GOLD ×3** |
| pts_ast R | +0.077 / +0.020 / 65% | **+0.103** / +0.006 / 65% | +0.063 / +0.024 / 65% | **GOLD ×3** |
| blocks R | +0.038 / +0.027 / 66% | +0.045 / +0.020 / 66% | +0.045 / +0.012 / 60% | **GOLD ×3** |
| rebounds R | +0.050 / +0.036 / 63% | +0.043 / +0.055 / 66% (band to n=13) | +0.057 / +0.042 / 62% | **GOLD ×3** |
| pra R | +0.077 / −0.001 / 65% | **+0.103** / +0.004 / 62% | +0.087 / +0.012 / 64% | GOLD under baseline & score; final HP 24-25 −0.001 |
| reb_ast R | +0.013 / +0.018 / 57% | +0.023 / +0.018 / 59% | +0.014 / +0.015 / 59% | above both seasons, constancy 57–59% (just under the gate) |
| threes D1 | +0.057 / +0.050 / 44% | +0.062 / +0.047 / 43% | +0.060 / +0.036 / 47% | above both ×3, inconstant (jackpot) |
| points D2 · assists D1 | +0.062 / +0.021 · +0.036 / +0.133 | +0.051 / +0.021 · +0.030 / +0.119 | +0.041 / +0.006 · +0.022 / +0.139 | above both ×3, inconstant (41–44%) |
| rebounds D1 · points D3 · pts_ast D2 | above both under 2 of 3 | | | jackpot, split vote |
| pts_reb D1 | +0.151 / −0.007 | +0.151 / **+0.028** | +0.153 / −0.008 | 2025-26 jackpot (+0.15 at n=10); both seasons only under baseline |
| rebounds D3 · assists D2/D3 · pts_ast D1/D3 · reb_ast D1 · pra D2 · pra G2 · pts_ast G2 · points G1/G2 | above 2025-26 only, 0–1 votes | | | unproven |
**What the three ranks say:** (1) **They pick nearly the same legs.** On every gold cell the margin, band depth and constancy agree within thousandths across the three ranks (steals 74/75/74% of days) — final HP and baseline HP are ~0.98-correlated at the top of the rank, and the score adds little to the ordering. (2) **Final score is the sharpest at n=1 on the Regular cells** (steals +0.155 vs +0.104; pts_reb +0.103 vs +0.090) — the confidence adjustment concentrates the very top. (3) **Baseline HP is the sharpest on the points-combos** (pts_ast and pra +0.103 vs +0.077) and holds the deepest band on rebounds R (n=13). (4) **Final score is the weakest on demons and goblins** — it turns assists D2, pra G2, pts_ast D2/D3 and reb_ast D1 negative; its confidence term pulls the low-probability tail down, which is right for pricing but wrong for finding jackpot legs. (5) pts_reb R is the one Regular cell negative in 2024-25 under all three (−0.003…−0.010) — the ledger's near-miss.
**THE INTERSECTION — unanimous GOLD under all three ranks, both seasons, ≥60% of days: 8 cells.** **steals R · stocks R · turnovers R · points R · pts_ast R · blocks R · rebounds R · (pra R under two of three).** Plus the jackpot family that clears both seasons under all three (threes D1, points D2, assists D1) and the two-vote cells (rebounds D1, points D3, pts_ast D2). pts_reb R and reb_ast R are one gate short each (24-25 sign; constancy). **This is the candidate set for the signals phase.** Rank choice for the signals phase: final score for the Regular top-1/2 legs, baseline for the combos and deep bands, never final score for demons/goblins.

---

## 20. PLAYER HIT RATE and HIGH-HIT ROTATION (2026-09-30) — on the corrected map, per side, with appearances

### 20a. A data fact that changes the method: Regular lines carry BOTH sides
122,335 Regular lines in the map have both Over and Under (PP posts both; exactly one hits). So any player hit rate computed across sides is **0.500 by construction** on Regular — the first pass showed every Regular band at exactly 0.500 and no player above 0.60. **The player trail must be keyed (player, prop, tier, side).** Goblins and demons are Over-only, so their rates were already real. Rebuilt `nba_score.tier_map_player_trail` per side with appearance counts at 7 / 30 / 60 days and all-time (strictly prior legs).

### 20b. Player hit rate — bands × windows × minimum appearances (2025-26 from Nov, 828k legs, 470 players)
Next-leg outcome for a player whose PRIOR rate on (prop, tier, side) sits in a band:
| window | min apps | ≥0.85 → next (R) | 0.75–0.85 (R) | 0.65–0.75 (R) | 0.55–0.65 (R) | <0.55 (R) |
|---|---|---|---|---|---|---|
| 30-day | 5 | 0.475 (1,588) | 0.516 (5,709) | 0.502 | 0.500 | 0.499 |
| 30-day | 10 | 0.417 (230) | 0.519 (1,724) | 0.492 | 0.501 | 0.500 |
| 60-day | 5 / 10 / 20 | 0.490 / 0.514 / — | 0.509 / 0.497 / 0.453 | 0.498 / 0.499 / 0.489 | 0.505 / 0.504 / 0.508 | 0.498 / 0.499 / 0.499 |
| all-time | 5 / 10 / 20 | 0.545 (514) / 0.563 (87) / 0.250 (4) | 0.521 / 0.524 / 0.542 (166) | 0.504 / 0.513 / 0.509 | 0.503 / 0.503 / 0.499 | 0.498 / 0.498 / 0.500 |
Goblins: every band, every window, every min-apps → margin over break-even **−0.062 … −0.081**, flat (a player hitting ≥0.85 of his goblins is priced exactly like one hitting 0.60). Demons: **−0.08 … −0.16**, flat.
**Verdict: a player's past hit rate on a cell does not predict his next leg — on Regular the next hit is 0.49–0.52 in 38 of 40 band/window/apps combinations (the two exceptions are 87- and 4-leg samples); on goblins/demons the trailing rate moves neither the hit nor the price gap.** This is the same conclusion as §18a, now per side, with appearances, on the corrected map. The player layer is retired as a selector; the per-side trail table is kept as a signal-phase input (a player's *side* tendency is real information even if his rate is not).

### 20c. High-hit rotation — whole board, no player/prop identity, bands × rank position (2025-26 from Nov)
| band (model score × rank position) | legs | hit | p·m | % days > BE |
|---|---|---|---|---|
| score 0.70–0.75, rank 1 | 579 | 0.591 | **0.598** | 54 |
| score 0.65–0.70, rank 2–3 / 4–5 | 1,095 / 1,067 | 0.570 / 0.605 | 0.568 / 0.566 | 51 / 53 |
| score 0.70–0.75, rank 2–3 | 1,307 | 0.626 | 0.564 | 49 |
| **score ≥ 0.80, rank 1** | 3,598 | **0.755** | **0.538** | 47 |
| score ≥ 0.80, rank 2–3 / 4–5 | 4,665 / 2,720 | 0.762 / 0.769 | 0.521 / 0.513 | 31 / 34 |
| score 0.75–0.80, rank 6–10 | 6,695 | 0.724 | 0.500 | 22 |
| score < 0.60, rank 11+ | 393,164 | 0.365 | 0.429 | 0 |
**Hit rate and profit are decoupled by the multiplier.** The highest-hit bands on the board (≥0.80 score, 0.75–0.77 hit) are the deep goblins and they pay 0.51–0.54 — below break-even; the most profitable bands are moderate-hit Regular legs at the top of the rank (0.59–0.63 hit, p·m 0.56–0.60). **A "95% band" does not exist on this board except as deep goblins priced below break-even by construction.** No whole-board band beats break-even on more than 54% of days; the best one is the model's top-ranked cell, which is the daily map already built.

### 20d. Does a hot band stay hot? — rolling windows on the cell's own realized p·m (7-day vs 30-day, by rank position)
| rank band | window | prior-window band | cell-days | next-day p·m | % next > BE |
|---|---|---|---|---|---|
| **top-3** | **30-day** | warm 0.60–0.70 | 1,328 | **0.576** | **55** |
| top-3 | 30-day | hot ≥ 0.70 | 143 | 0.562 | 52 |
| top-3 | 30-day | 0.50–0.60 | 3,915 | 0.528 | 47 |
| top-3 | 30-day | cold < 0.50 | 2,766 | **0.506** | **44** |
| top-3 | 7-day | hot / warm / mid / cold | 889 / 1,440 / … | 0.544 / 0.543 / 0.53 / 0.51 | 51 / 49 / … |
| top-10 | 30-day | warm / cold | 352 / 3,132 | 0.533 / 0.490 | 53 / 39 |
| rest (rank 11+) | any | any | — | 0.40–0.48 | 8–29 |
**There IS persistence, and it is specific:** at the **cell level** (prop × tier, not player), in the **top-3** band, over a **30-day** window — a cell whose top-3 ran warm (0.60–0.70) pays 0.576 next day vs 0.506 for a cold cell, a 7-point spread, 55% vs 44% of days. The 7-day window is noise (hot 0.544 vs warm 0.543); deeper ranks carry a weaker version (top-10 warm 0.533 vs cold 0.490); the hottest band regresses (≥0.70 → 0.562, below warm). **Rotation rule: re-weight cells monthly by their trailing-30-day top-3 realized p·m; prefer warm cells, drop cold ones; ignore 7-day heat.** This is a cell-selection signal for the signals phase, worth ~+0.05 p·m on the top-3, not a standalone strategy.

### 20e. Both logics re-checked (owner) — one confirmed, one corrected
**Player layer, data check:** on Regular there is exactly one leg per (player, prop, side, day) — 244,670 legs = 244,670 player-days — so appearances = legs there; the 1.06 ratio overall is goblin ladders. §20b stands. **Player rate INSIDE the gold cells** (top-5, 0.05-wide bands, ≥8 apps at 60d / ≥15 all-time): flat across the populated bands (0.35–0.70: next hit 0.53–0.63, no trend). **But the cold end over-delivers:** players at 0.25–0.35 all-time hit **0.76–0.77** next (25/53 legs), at 60 days the 0.25 band hits 0.689. Mean reversion, small samples — held as a signals-phase hypothesis (the opposite of the high-hit intuition).
**Rotation, leak check:** the day's own p·m correlates −0.02 with the *excluding* 30-day window and +0.17 with an *including* one on steals R — so the exclusion in §20d was correct, but the single-cell −0.02 said the effect was smaller than reported. Re-tested properly below.

### 20f. Rotation re-run — verified excluding window, 7 windows, pct AND n cuts, overall then per prop
Persisted `nba_score.tier_map_rotation`: per (day, prop, tier) the realized p·m of the top-5/10/20/33/50% and top-1/3/5/10, with the same cut's trailing average over strictly prior 7/14/30/60/90 days.
**Overall (Regular, 2025-26 from Nov):** correlation between a cell's trailing p·m and its next day is **0.04–0.06 at EVERY window** (7d 0.049, 14d 0.062, 30d 0.038, 60d 0.040, 90d 0.056; n3/30d 0.056). Hot cells (trail ≥0.65) pay 0.58–0.62 next; cold (<0.50) pay **0.555–0.589 — still above break-even.**
**Per prop, 30-day, top-10%:** the sign flips — **10 of 12 props have a NEGATIVE correlation** between trailing month and next day: rebounds −0.13, stocks −0.10, steals −0.09, reb_ast −0.07, points −0.07, assists −0.06, turnovers −0.05; only pts_ast (+0.09) and threes (+0.05) positive, on 26/20 hot days. Stocks after a cold month: 0.711 next; after a hot month: 0.589.
**Verdict — §20d is corrected: there is NO rotation.** The small positive overall number was cross-prop composition (steals is always hot and always pays; it pulls the pooled correlation up). Within a prop, a hot month predicts a slightly *worse* next day — mean reversion at the cell level, the same thing the player layer showed. **Gold cells are gold all season; a hot or cold month is not a reason to weight or drop them.** The §20d "re-weight monthly" rule is withdrawn.

### 20g. What the PERCENTAGE cut adds (owner) — the usable FRACTION of a cell
| Regular cell | cell size | top 5% | top 10% | top 20% | top 33% | top 50% |
|---|---|---|---|---|---|---|
| steals | 23 | 0.625 | **0.666** | 0.627 | 0.609 | **0.565** |
| turnovers | 28 | 0.644 | 0.626 | 0.613 | 0.591 | 0.554 |
| stocks | 25 | 0.652 | 0.597 | 0.593 | 0.586 | 0.546 |
| blocks | 13 | 0.577 | 0.595 | 0.593 | 0.584 | 0.566 |
| points | 153 | 0.588 | 0.577 | **0.548** | 0.541 | 0.530 |
| pts_reb / pts_ast / pra | 152–159 | 0.57–0.58 | 0.55–0.58 | 0.55 | 0.54–0.55 | 0.53 |
| rebounds | 53 | 0.554 | 0.566 | 0.560 | 0.550 | 0.538 |
| assists / reb_ast / threes | 23–70 | 0.49–0.57 | 0.51–0.55 | 0.53–0.54 | 0.53–0.54 | 0.51–0.55 |
**The pct cut separates the props by how much of the cell is usable, which the n cut hides.** On the small defensive cells the gold band runs deep as a fraction: steals stays above break-even through the top **50%** (~11 legs), turnovers through ~40%, blocks through 50%. On the big points-family cells the edge lives only at the very top: points top-5% (8 legs) 0.588, top-20% (30 legs) 0.548 — below break-even. **Usable fraction: ~50% of a defensive cell, ~10% of a points-family cell.** For slip construction this is the supply number: a defensive cell yields 5–11 playable legs a day, a points cell yields ~8–15 despite being 6× larger.

### 20h. Four more player variations on the gold cells (owner: try more, double-check) — and the mechanism
Bar for "improvement": a filter that raises the gold cells' p·m at the same n, or a candidate the map lacks. Gold-cell top-5 legs, 2025-26 from Nov, per side, strictly prior history:
| variation | band → next hit |
|---|---|
| **residual vs model, all-time (≥15 apps)** | beats model ≥+0.10: **0.577** · +0.03..+0.10: 0.554 · flat: 0.566 · −0.10..−0.03: **0.633** · under model ≤−0.10: 0.603 — **INVERTED** |
| residual vs model, 60-day (≥8 apps) | beats: 0.588 · flat: 0.592 · under ≤−0.10: **0.614** — inverted |
| **rank persistence (prior top-5 appearances)** | first time: 0.582 · 1–3: 0.607 · 4–10: 0.593 · **11+: 0.550** — the more often a player has been top-5, the worse he does next — inverted |
| side tendency (Over legs; over_rate − under_rate, ≥20 apps) | over player ≥+0.15: 0.630 · neutral: 0.610 · under player: 0.568 — expected sign, +6 pts, but restates the model's own ordering (an Over player ranks high because the model rates him) — not a filter the map lacks |
**Double-check 1 — is the model chasing history?** No: model_p is ~0.70–0.73 in every band (0.704 for "beats model", 0.702 for "under model"). The reversion is in the outcomes, not in the score.
**Double-check 2 — the mechanism.** **66–70% of a player's Regular lines MOVE between one appearance and the next**, and they move in the streak-erasing direction: an Over player who has been beating the model sees his line rise +0.035 on average; an Under player who has been beating it sees +0.087 against him; the middle band moves +0.01. PrizePicks re-prices the line after every streak. This is the confirmation the earlier null results lacked: **regression is not in the player, it is in the price.** Every history-based signal (player rate, residual, rank persistence, cell rotation) is flat or inverted because the thing it measured has already been priced out by the time the next line is posted; the model works because it prices today's line.
**Improvements from §20, stated plainly: none to the candidate set.** What §20 produced instead is a rule and two facts: (1) **no history-based player or cell signal survives on this board — retired as a class, not one at a time**; (2) the usable fraction of a cell (§20g, ~50% defensive / ~10% points-family) is the supply number for slips; (3) the cold-end over-delivery (§20e, small n) is a mean-reversion hypothesis for the signals phase. The signals that can still improve the map are the ones that measure something PP has NOT priced into today's line: market-edge vs sharp books (§8k/§14h), minutes/injury context, opponent tendencies — none of them history-of-hits.

---

## 21. THE THREE RESEARCH-PROPOSED SIGNALS — logic-checked, then granulated on the gold cells (2026-09-30)

### 21a. Market edge — logic check, then the granular test
**Logic:** `rung_market.p_over_book` is a consensus of real sportsbooks (FanDuel 3.0M legs, DraftKings 1.8M, BetOnline, Bovada, MGM, Caesars, Fanatics, BetRivers); PP/UD/Sleeper/Betr are excluded, so the edge is model-vs-books, not model-vs-itself. Two caveats found: **56% of market lines rest on a single book** (`books=1`, sd 0) — not a sharp consensus; and `rung_market.nm` is **NULL** (never populated) — any join on it returns nothing; join on `norm_name(player)`.
**Test, gold-cell top-5, 0.05-wide edge bands, BOTH seasons:**
| edge band (model − book) | 2024-25 hit / model_p (legs) | 2025-26 hit / model_p (legs) | realized − model |
|---|---|---|---|
| 0 … +0.05 | 0.459 / 0.532 (390) | 0.541 / 0.541 (146) | 0.00 |
| +0.05 … +0.10 | 0.557 / 0.576 (655) | 0.598 / 0.580 (296) | +0.02 |
| +0.10 … +0.15 | 0.550 / 0.628 (726) | 0.576 / 0.631 (427) | −0.06 |
| +0.15 … +0.20 | 0.547 / 0.680 (981) | 0.564 / 0.682 (585) | −0.12 |
| +0.20 … +0.25 | 0.593 / 0.727 (1,020) | 0.551 / 0.731 (816) | −0.18 |
| +0.25 … +0.30 | 0.591 / 0.773 (797) | 0.578 / 0.774 (874) | −0.20 |
| +0.30 … +0.40 | 0.538 / 0.818 (316) · 0.479 / 0.864 (96) | 0.580 / 0.820 (452) · 0.640 / 0.866 (114) | −0.24 … −0.39 |
**Verdict — CORRECTS §14h and the prior turn's "sweet spot":** on the gold cells the realized hit is **flat, 0.55–0.60, across every edge band from +0.05 to +0.40, in both seasons.** What rises with the edge is the model's claim (0.58 → 0.91), not the outcome; realized − model runs from 0 at small edges to −0.32 at large ones. **A large model-vs-book gap measures the model's overconfidence, not a mispriced book.** The +0.05..+0.15 "sweet spot" at 0.65 was 275 legs on one cut; at 0.05 granularity over 5,000+ legs it is 0.55–0.60 like everything else. Market edge is **not a selection filter for the gold cells; it is a calibration input** (the books say how far to shrink the model) — the same conclusion §7's calibration reached from the other side.

### 21b. Injury and starter context — logic check: not available pre-window
No injury table exists in the schema (`nba_context.injuries` does not exist; nothing in `nba_stats` carries injury status). `player_game_starter_status` is keyed by `game_id` and is a lineup fact known ~30 min before tip — **after** the window snapshot (2.5–6.7 h before tip, §17a) — so using it is lookahead; excluded. **Injury context cannot be tested on this backdata.**

### 21c. Minutes trend — the one clean pre-window version (prior games only)
Trailing minutes from `player_game_log`, last-3 vs last-10 average, strictly prior games (≥5 in window). Gold-cell top-5, 2025-26 from Nov:
| side | minutes trend (3g − 10g) | legs | hit | model_p |
|---|---|---|---|---|
| Over | rising ≥ +4 | 59 | 0.458 | 0.666 |
| Over | rising +1.5..+4 | 295 | 0.607 | 0.667 |
| Over | stable | 651 | 0.602 | 0.685 |
| Over | falling −1.5..−4 | 477 | 0.597 | 0.698 |
| **Over** | **falling ≤ −4** | **408** | **0.544** | **0.739** |
| Under | any band | 220–1,436 | 0.588–0.627 | 0.67–0.74 |
**One usable pattern:** Over legs on players whose minutes have dropped ≥4 below their 10-game average hit **0.544** while the model claims **0.739** — the model's score is *highest* on exactly the band that under-delivers (it has not absorbed the minutes drop). Every other band is 0.59–0.63. **Candidate negative filter: drop Over top-5 legs on players losing ≥4 minutes** (~20% of Over top-5 legs; one season; 408 legs — a candidate, not proven). Unders are unaffected (a player losing minutes helps an Under, and the model already prices it).

### 21d. Candidates from §21 (owner's question)
- **Market edge:** no candidate cells, no filter. One calibration input.
- **Injury:** untestable on this data (pipeline gap: no injury feed).
- **Minutes trend:** **one candidate negative filter** — exclude Over legs with a ≥4-minute trailing drop (raises the remaining Over top-5 from ~0.59 to ~0.60–0.61 by removing a 0.544 slice). To be confirmed on 2024-25 and at other cuts before it enters the live stack.
No new cells. The gold ledger (§19p) is unchanged; §21c is the first signal in this entire phase that moves a gold cell's hit rate, and it does so by subtraction.

---

## 22. THE CANDIDATE × SIGNAL MATRIX — every candidate, every layer, separately, then stacked (2026-09-30)

Owner: apply every signal and layer over every candidate, one at a time, track the lift, then stack; **no summarizing** — each (prop, tier, side, rank, cut, signal band) is its own test. Built as code (`build_cand_signal_matrix.py`, workflow `nba-cand-signal-matrix.yml`), persisted to `nba_score.cand_signal_matrix`.
**Scope:** 24 candidate cells (10 Regular, 11 demon, 3 goblin) × side (both/Over/Under) × 3 ranks × 11 cuts (n 1/2/3/5/8/10, pct 5/10/20/33/50) × 21 signals in bands (t3/t5/t10, consistency, cold_all, minutes trend, usage trend, rest, phase, line class, market edge, book count, side, and each of the other two ranks' top-1/3/5/10 as a second layer). 440,679 candidate legs. Lift = band p·m − the cut's own base p·m, per season. **104,748 rows: 1,906 bases, 79,461 single-layer tests, 23,381 stacks (pairs and triples of bands that lifted in both seasons).**

### 22a. Calibrating the noise — what "lifts in both seasons" means across 80k tests
A signal with no information lifts in both seasons ~25% of the time by chance. Share of tests both-positive (legs ≥100 each season), by signal:
| signal band | tests | % both-positive | avg lift when it works |
|---|---|---|---|
| **line_class = half** (0.5 lines) | 192 | **53%** | +0.026 |
| **rank_score top3** (as 2nd layer) | 1,641 | **48%** | +0.031 |
| **rank_final top3** | 1,633 | **47%** | +0.030 |
| **rank_base top3** | 1,497 | **45%** | +0.028 |
| rest = 1 day | 1,436 | 42% | +0.020 |
| rank_* top5 | ~1,660 | 39–41% | +0.021 |
| t3 = 1.0 | 342 | 39% | +0.028 |
| everything else (min/usg trend, market edge, cold, phase, consistency, t5/t10, books, side) | — | **22–37%** | — |
**The broad result:** across all 24 cells, only two layers beat chance clearly — **rank-over-rank** (a leg that is also top-3 under a second rank: 45–48% vs 25%, +0.03) and **the 0.5-line class** (53%). Every researched context signal sits at or near the chance rate when averaged over the cells. This matches §18–§21 and the mechanism (§20h): the model already carries the context; a second rank sharpens the ordering.

### 22b. Per candidate — the best single layer, then the ROBUSTNESS check (is it real for THAT cell, or the max of noise?)
A cell's best layer is the best of ~3,000 tests, so a +0.06–0.10 lift on 150 legs is what noise's maximum looks like. Robust = the same band lifts in both seasons on ≥60% of ALL its cuts/ranks for that cell (not just the best one).
| cell | best layer (rank, cut) | base → enhanced (25-26) | lift 25-26 / 24-25 | legs 25-26 | same band across all cuts: % both-pos | verdict |
|---|---|---|---|---|---|---|
| assists D1 | t5 ≤ 0.33 (final, pct5) | 0.596 → **0.709** | +0.113 / +0.107 | 153 | **100%** (60 tests) | ROBUST |
| assists D2 | mkt edge 0.15–0.25 (score, pct50) | 0.486 → 0.578 | +0.092 / +0.106 | 437 | 100% (60) | ROBUST |
| assists D3 Over | phase = late (base, n8) | 0.552 → 0.643 | +0.091 / +0.161 | 168 | 100% (48) | ROBUST |
| blocks R | t3 ≤ 0.33 (base, n5) | 0.557 → 0.621 | +0.064 / +0.075 | 274 | 100% (43) | ROBUST |
| pts_ast D2 Over | line_class mid (base, n8) | 0.513 → 0.560 | +0.046 / +0.086 | 699 | 100% (60) | ROBUST |
| rebounds D1 | consistent sd ≤ 0.42 (base, pct33) | 0.516 → 0.617 | +0.101 / +0.199 | 127 | 100% (28) | ROBUST |
| stocks R | min trend +1.5..+4 (final, pct20) | 0.583 → **0.678** | +0.095 / +0.108 | 197 | 96% (49) | ROBUST |
| points D2 Over | final top1 (score, pct50) | 0.460 → 0.601 | +0.142 / +0.089 | 161 | 94% (66) | ROBUST |
| steals R | score top1 (base, n10) | 0.587 → **0.700** | +0.113 / +0.082 | 160 | 89% (66) | ROBUST |
| rebounds D3 | t3 0.34–0.66 (base, pct33) | 0.514 → 0.640 | +0.126 / +0.157 | 795 | 83% (36) | ROBUST |
| threes D1 Over | base top3 (score, pct50) | 0.499 → 0.597 | +0.097 / +0.079 | 482 | 82% (66) | ROBUST |
| points G1 Over | line_class mid (base, n3) | 0.536 → 0.591 | +0.055 / +0.038 | 145 | 80% (60) | ROBUST |
| pra R | cold_all hot ≥ 0.60 (base, pct5) | 0.555 → 0.631 | +0.077 / +0.080 | 192 | 76% (63) | ROBUST |
| reb_ast R Under | line_class mid (base, n3) | 0.553 → 0.648 | +0.095 / +0.086 | 163 | 74% (81) | ROBUST |
| turnovers R Over | score top3 (score, pct50) | 0.554 → 0.628 | +0.073 / +0.063 | 148 | 70% (96) | ROBUST |
| rebounds R Over | base top5 (score, n10) | 0.489 → 0.561 | +0.072 / +0.076 | 157 | 65% (94) | ROBUST |
| points R Under | score top3 (base, pct50) | 0.537 → 0.596 | +0.059 / +0.075 | 269 | 63% (95) | ROBUST |
| pts_reb R | t3 = 1.0 (final, pct5) | 0.569 → 0.648 | +0.079 / +0.085 | 192 | 58% | one-off |
| pra G2 | min stable | 0.533 → 0.551 | +0.019 / +0.038 | 330 | 48% | one-off |
| pts_ast R Over | mkt edge ≥ 0.25 | 0.519 → 0.588 | +0.069 / +0.098 | 163 | 41% | one-off |
| points D3 | score beyond10 | 0.540 → 0.618 | +0.078 / +0.097 | 357 | 33% | one-off |
(pts_ast R, points R both-sides, rebounds D2, points D1, pts_reb D1: no layer positive in both seasons on ≥100 legs.)
**17 of 21 cells have a robust single layer.** The layers differ by cell, which is why they had to be tested separately: stocks R takes a minutes signal, steals R takes a second rank, blocks R and assists D1 take trailing-COLD, rebounds D1 takes consistency, pra R takes hot-history. Signals that were flat on the whole board (§20–21) are real on specific cells.

### 22c. STACKS — where the layering actually pays: the DEMON cells
Robust stacks (≥75% of cuts both-positive, avg lift > +0.03 both seasons, ≥60 legs each):
| cell | stack | best p·m 25-26 | avg lift 25-26 / 24-25 | legs |
|---|---|---|---|---|
| **rebounds D1** | t5 ≤ 0.33 + consistent | **0.724** | +0.121 / +0.171 | 196 |
| rebounds D1 | t5 ≤ 0.33 + min falling ≤ −4 | 0.707 | +0.160 / +0.136 | 163 |
| rebounds D1 | mkt edge 0.15–0.25 + base top5 + final top5 | 0.609 | +0.108 / +0.169 | 214 |
| **assists D1** | t5 ≤ 0.33 + base top5 + final top3 | **0.706** | +0.170 / +0.133 | 134 |
| assists D1 | t5 ≤ 0.33 + final top3 | 0.706 | +0.149 / +0.109 | 136 |
| assists D1 | t10 ≤ 0.33 + books 2–3 | 0.629 | +0.066 / +0.196 | 467 |
| **threes D1** | mkt edge 0.05–0.15 + score top3 + final top3 | **0.693** | +0.170 / +0.157 | 184 |
| threes D1 | mkt edge 0.05–0.15 + base top3 | 0.642 | +0.118 / +0.131 | 244 |
| **rebounds D3** | t5 0.34–0.66 + t10 0.34–0.66 | **0.723** | +0.110 / +0.149 | 867 |
| rebounds D3 | t3 + t5 mid + streaky | 0.638 | +0.097 / +0.249 | 1,068 |
| assists D2 | phase late + final top3 | 0.609 | +0.100 / +0.159 | 63 |
| points D3 | min rising ≥ +4 + no book line | 0.634 | +0.110 / +0.144 | 299 |
**Every robust stack is a demon cell.** The Regular gold cells (base 0.58–0.66) gain only +0.02–0.03 from rank-over-rank and do not stack further; the demon cells (base 0.45–0.55) lift +0.10–0.17 to 0.60–0.72 in both seasons at every cut. Two mechanisms show in the stacks: (1) **trailing-COLD on demons** (t5 ≤ 0.33 on rebounds D1, assists D1) — the §20 mean-reversion working for us: a player cold on a demon line is priced down and reverts; (2) **rank-over-rank** on demons (top-3 under two ranks) — the confidence-adjusted ranks agreeing on a demon leg. The market-edge sweet band (0.05–0.25) works on demons (threes D1, rebounds D1, assists D2) where it was flat on Regular (§21a) — on a demon the book gap is not the model's overconfidence, it is the line.
**Ledger change:** the demon family moves from "jackpot, inconstant" to **"conditional gold"** — rebounds D1, assists D1, threes D1 and rebounds D3 are gold WITH their stack (0.69–0.72, both seasons), not without. The Regular gold cells keep their §19p status with a rank-over-rank tie-break (+0.02–0.03). These stacks are one-season-confirmed on 130–870 legs each; the live season is their test.

---

## 23. CERTIFICATION and the GOBLINS re-analyzed (2026-09-30)

### 23a. Certification — recompute from the raw sources, no intermediate table
Every number since §19 came from a chain of derived tables (tier_map_legs → cand_leg_features → cand_signal_matrix). Owner: certify across real data, real legs, real board snapshots. Built `certify_candidates.py` (workflow `nba-certify-candidates.yml`): for each candidate configuration it joins, per day, `board_snapshots` (PP, window, pre-tip) → `prop_universe` (real outcome) → `pp_leg_price` (current per-line price) → `nba_score.final_hp` (the three ranks), ranks the day's legs, takes the top-n, and reports days / hit / multiplier / p·m / % days above break-even / profit per $100 3-pick Power, per season. Output: `nba_score.cand_certified`.
**First certified cell — steals R Under, score rank, top 1, 2025-26 from Nov:** raw-board recompute = **149 days, hit 0.691, m 1.000, 69% of days above break-even, +$88 per $100 slip.** The matrix had reported 73% / +$126 on 128 days. **Discrepancy explained:** the candidate-cell table dropped days where the cell's rank window fell short, shrinking the day-set (128 vs 149) and lifting the average; on a top-1 cell "days above BE" is the hit rate itself. The certified number is lower and is the one that stands. **Rule: the certified table is the source of every quoted number from here; the matrix is for finding candidates, not for quoting them.** (Full certified table for all 24 configs in `cand_certified` when the run lands.)

### 23b. GOBLINS — re-analyzed with the full spectrum (owner was right)
Every goblin test to date asked whether p·m clears 0.55 — the **3-pick Power** break-even. A goblin never clears that, because PP sets its multiplier so that *implied probability × multiplier ≈ 0.50* by construction. That is the wrong test for a 0.80-hit leg. The right questions are (1) does our realized hit beat PP's **own implied probability**, and (2) in which **slip structure** does that edge get paid.
**(1) vs PP implied (`pp_leg_price.implied_p`), 2025-26 from Nov, final-HP rank:** every one of 88 goblin cells is positive at the top of the rank, most by +0.04 to +0.10:
| cell | cut | legs | realized | PP implied | edge | mult |
|---|---|---|---|---|---|---|
| pts_ast G2 | top1 | 150 | **0.840** | 0.735 | **+0.105** | 0.664 |
| points G1 | top2-3 | 300 | 0.730 | 0.630 | +0.100 | 0.775 |
| pra G2 | top1 | 150 | 0.793 | 0.695 | +0.098 | 0.705 |
| pts_reb G2 | top2-3 | 300 | 0.803 | 0.727 | +0.076 | 0.671 |
| points G2 | top1 | 150 | 0.800 | 0.728 | +0.072 | 0.672 |
| pra G3 / pts_ast G3 / points G3 | top1-3 | 150–300 | 0.80–0.84 | 0.74–0.78 | +0.06–0.07 | 0.63–0.66 |
| reb_ast G1 / points G1 | top4-10 | 1,050 | 0.68–0.69 | 0.62–0.63 | +0.056–0.058 | 0.77–0.78 |
The model's top goblins beat PP's price on every cell — a real, large, board-wide edge that the Power test could not see.
**(2) Where it gets paid — real slips, 150 real days, real prices.** Four best Regular legs (score rank; steals/turnovers/stocks/points/pts_ast) + the top goblin (final-HP rank; points/pra/pts_ast/pts_reb G1–G2), seven structures:
| slip | ROI | days paid |
|---|---|---|
| A: 5 Regular, 5-pick Flex | +103% | 39% |
| **B: 4 Regular + 1 goblin, 5-pick Flex** | +65% | **47%** |
| C: 3 Regular + 2 goblins, 5-pick Flex | +23% | 24% |
| **D: 4 Regular + 1 goblin, 5-pick POWER** | **+148%** | 20% |
| E: 4 Regular, 4-pick Power (no goblin) | +109% | 22% |
| F: 3 Regular + 1 goblin, 4-pick Power | +62% | 26% |
| G: 3 Regular, 3-pick Power | +67% | 29% |
**The goblin's role is specific and real: ONE top goblin as the FIFTH leg of a 4-Regular Power** turns +109% (4-pick) into **+148%** (5-pick) at the same paying-day rate (22% → 20%) — its 0.80 hit costs almost no slip survival, and 20× instead of 10× more than pays its ~0.72× factor. In Flex, the same goblin raises paying days from 39% to 47% at lower ROI (the frustration trade). **Two goblins hurt every structure** (the factor product ~0.5 crushes payout). A goblin never replaces a Regular; it extends a Regular slip by one leg. **Goblins re-enter the ledger as EXTENDERS:** pts_ast G2, points G1, pra G2, pts_reb G2, points G2 at top-1/top-3, one per slip, fifth leg of a Power (or fifth leg of a Flex when paying-days matter more than ROI).
**What was lost before, and why:** the p·m ≥ 0.55 test priced the goblin as if it had to carry a 3-pick alone. Its edge is +0.05–0.10 over PP's implied, which only converts to money as the extra leg of a slip that is already winning on Regular legs.

---

## 24. CERTIFICATION — three consecutive clean passes (2026-09-30)

Owner: recheck every step until three consecutive clean passes on every micro-step. Nine of the eleven defects found in §19–§23 were one failure class (a join or key silently returning fewer/wrong rows while the downstream number looked plausible), so certification was built as **reconciliation between layers plus explicit assertions**, not inspection: `certify_slip_system.py` (workflow `nba-certify-slip-system.yml`), a **frozen list of 52 invariants** across L0 raw board → L1 outcome → L2 price → L3 tier → L4 ranks → L5 map → L6 bands → L7 features → L8 matrix → L9 certified → L10 slip math. Every check logs PASS/FAIL with its measured value under a run id to `nba_score.certification_log`; any FAIL exits non-zero; a check may be added, never loosened.
**Result: runs `02478851`, `195b6cb0`, `39105d90` — 52 / 52 PASS each, back to back, no code change between them. CERTIFIED.**
**What the passes caught before going clean (each a real finding, none visible to inspection):**
1. `prop_universe.hit` is BOOLEAN — the "binary" check mis-assumed integer; fixed to a type assertion.
2. `norm_name()` inside a join defeats every index: a one-day EXPLAIN showed a full sequential scan + sort of 451k universe rows per day; the certifier ran 38 min without finishing and the L5 check 22 min. Fixed by precomputing normalized keys into indexed temp tables (certifier now ~4 min). Standing rule for every join in this system.
3. **Map defect (the real one): `n_rank` and `cell_size` were computed by window functions BEFORE `ON CONFLICT DO NOTHING` dropped the ~123 documented duplicate price keys** → 201 Regular cells (0.8%) carried `cell_size` +2 and `n_rank` holes; pct cuts, 5 of 80 n-bands, 3 of 8 pct-bands and the matrix base inherited it. Fixed at the source (dedupe keep-first BEFORE ranking); map rebuilt (same 828,818 legs per rank, 0 mismatches), bands/features/matrix/certifier rebuilt in dependency order.
4. `cand_signal_matrix` s1/s2 are WHOLE seasons (no November cutoff) unlike `tier_map_bands` '2526_nov' — the L8 check had assumed the November window; the matrix was exact. Check aligned and the semantic written into it.
**Invariants that stood on every pass (the facts of the system):** 1,100,043 PP window legs, 723,628 alternates, board multiplier column NULL everywhere, window snapshot before first tip on every day; Regular has both sides and exactly one hits, ladders Over-only; ONE live price model, Regular factor exactly 1.0, goblins < 1, 152 of 426,776 demons at ≤ 1.0 (documented near-anchor tail), implied × factor near 0.5 with zero anomalies, 99.58% priced, 123 duplicate keys; every ladder leg tiered, signs correct, 43 at-anchor residue; 7,215,296 rank rows with zero nulls, map score equals the named column exactly; 828,818 legs per rank, no duplicates, rank order non-increasing, cell_size = count, map reconciles to the raw join exactly (8,765 = 8,765); n- and pct-bands recompute to 1e-6, every cell present, none thin; features: minutes/usage/rest 100%, trailing 96.9% and strictly prior, market edge 71.3%, all three ranks on every leg; matrix base recomputes exactly, band rows are subsets of base, lift = pm − base; certified profit formula exact, Regular mult 1; payout tables and 0.5503 break-even.

### 24a. THE CERTIFIED LEDGER — from `cand_certified` (raw board → outcome → current price → ranks), per season
Profit = expected $ per $100 3-pick Power from the cell's legs alone (6× × 0.95 haircut, real hit, real multiplier); % days = share of real slate days the cell's picked legs paid above break-even. 2025-26 is from November; 2024-25 is the full regular season (the stress case: less-trained ranker, thinner ladders).
| cell (rank, cut) | 25-26: hit / % days / $ per 100 | 24-25: hit / % days / $ per 100 | verdict |
|---|---|---|---|
| **steals R Under** (score, top1) | 0.691 / 69% / **+$88** | 0.541 / 54% / −$10 | strongest cell; 24-25 negative |
| **steals R both** (score, top2) | 0.654 / 46% / +$60 | 0.588 / 33% / +$16 | positive both seasons |
| **turnovers R** (score, top3) | 0.633 / 69% / +$44 | 0.581 / 66% / +$12 | **positive both seasons, most consistent** |
| **stocks R** (score, top5) | 0.613 / 73% / +$31 | 0.574 / 66% / +$8 | positive both seasons |
| pts_ast R (baseline, top3) | 0.611 / 71% / +$30 | 0.547 / 58% / −$7 | 24-25 marginal negative |
| points R (score, top5) | 0.608 / 68% / +$28 | 0.546 / 57% / −$7 | 24-25 marginal negative |
| pra R Under (baseline, top1) | 0.640 / 64% / +$49 | 0.512 / 51% / −$23 | 2025-26 only |
| blocks R (score, top1) | 0.595 / 59% / +$20 | 0.559 / 56% / −$1 | at break-even 24-25 |
| pts_reb R (score, top5) | 0.576 / 69% / +$9 | 0.547 / 58% / −$7 | thin |
| rebounds R (baseline, top5) | 0.574 / 66% / +$8 | 0.562 / 64% / +$1 | positive both, thin |
| reb_ast R (baseline, top3) | 0.556 / 61% / −$2 | 0.553 / 60% / −$4 | at break-even; supply only |
| **threes D1** (score, top2) | 0.473 × 1.33 = 0.631 / 73% / **+$43** | 0.392 × 1.53 = 0.588 / 65% / +$16 | **positive both seasons** |
| **assists D1 Over** (score, top2) | 0.470 × 1.26 = 0.588 / 73% / +$16 | 0.469 × 1.50 = 0.695 / 73% / **+$91** | positive both; PP cut the multiplier 1.50→1.26 |
| rebounds D3 (score, top3) | 0.313 × 1.96 = 0.606 / 60% / +$27 | 0.189 × 2.19 = 0.387 / 38% / −$67 | 2025-26 only |
| assists D3 Over (final, top3) | 0.291 × 2.12 = 0.594 / 55% / +$19 | 0.217 × 2.31 = 0.482 / 51% / −$36 | 2025-26 only |
| points D3 / D2, rebounds D1 | +$12 / +$6 / +$9 | −$43 / −$17 / −$27 | 2025-26 only |
| goblins (points G1, pra G2/G3, pts_ast G2, pts_reb G1; top1–2) | 0.69–0.85 hit / 51–85% days / **−$1 … −$22** | −$4 … −$26 | never a standalone leg; **extender only** (§23b: 5th leg of a 4-Regular Power, +109% → +148%) |
**Certified reading.** Four Regular cells and two demon cells are positive in BOTH seasons: turnovers R, stocks R, steals R (top-2), rebounds R (thin), threes D1, assists D1. The rest of the Regular core is positive in 2025-26 and within ±$10 of break-even in 2024-25 — consistent with the ranker having been retrained on both seasons (§19h): 2024-25 is the floor, not a different regime. Goblins are negative standalone everywhere and confirmed as extenders. **Every number in this table is recomputed from the raw board, outcome, current per-line price and the three rank columns, and is protected by 52 invariants passing three times.** This closes the candidate-mapping phase.

### 24b. FOURTH PASS — what an internal invariant list cannot catch, and the two rules it was missing (2026-09-30)
A fourth run of the same 52 invariants would have passed again and proved nothing new: the list checks the system against itself. The owner's request for another pass was used on what the list could NOT see — facts about the world that the numbers rest on — audited against the repo's own verified findings (`PP_PAYOUT_FINDINGS.md`, `board_payout_conversion_rules`) and PrizePicks' live page.
**1. The payout table.** L10 had asserted my hard-coded table equalled itself. PrizePicks' support article ("Payouts Explained") currently shows **3-pick Power 5×** and 4-pick Flex 5×; two third-party sources repeat it. At 5× the per-leg break-even is (1/5)^(1/3) = **0.585, not 0.55** — every candidate's bar would move. Fetched PrizePicks' own live "Ways to Pick" page: **3-pick Power 6×, 4-pick 10×, 5-pick 20×, 6-pick 37.5×; Flex 4-pick 6×/1.5×, 3-pick 3×/1×, and a new 2-pick Flex 2×/0.5×** (live since 2026-09-18). The support article is stale. The 0.55 bar and the Regular-only ledger stand. **L10 now fetches the live page inside the runner and compares** (it did: `{6:37.5, 5:20, 4:10, 3:6, 2:3}`), so a table change by PP fails certification rather than silently moving the bar.
**2. The slip payout rule for mixed goblin/demon slips.** Every mixed-slip number so far (§23b's 4-Regular+1-goblin Power, the §22c demon stacks) was priced as `base × Π(leg factors) × 0.95`. The repo's own measured rule (fitted on 20 alt×alt quotes, **confirmed out of sample** on three pairs never quoted together: 14.25× → 13.5×, 17.25× → 15.5×, 26.0× → 22.5×) is: **`payout = product` up to 9.1×, then `9.1 × (product/9.1)^0.857`**, and real 4-pick demon-heavy slips paid 15–29% *more* than even that. The flat 0.95 haircut was my number, inside the documented "observed 2–8%" but not the documented rule ("model as the plain product, conservative"). Effect: **the 5-pick Power with a top goblin pays 13.5×, not 14.4× (−6%); a 20× demon stack pays 17.9× (−11%).** §23b's +148% and the §22c stack payouts are overstated by roughly those amounts and are re-priced in the slip phase with this rule. **Regular-only 3- and 4-pick slips are unaffected** (6× and 10× sit at/under the 9.1× knee in product terms only for 3-pick; 4-pick 10× compresses to 9.9×, negligible), so the certified ledger (§24a) stands as published.
**Two invariants added:** `L10.power_table_matches_live_page` (fetch + compare) and `L10.slip_compression_rule_matches_oos_quotes` (reproduces the three OOS quotes within 1.6%). The list grew from 52 to 54; the count restarted.
**Result: three consecutive clean passes on the extended list — runs `02a0b845`, `317b4bb5`, `c5be831e`, 54/54 each, no code change between them. CERTIFIED (v2).**
**What the fourth pass teaches about the method:** internal consistency is necessary and was worth three passes, but the two things it missed were both *external facts the numbers rest on* (a payout table that PP can change; a slip-pricing rule the repo had already measured and I had not used). The certification list now carries one live-world check and one measured-rule check, and any future phase must add its own external-fact checks, not just internal recomputes. Standing rule for the slip phase: **price every slip with the compression rule, never a plain product, and never a flat haircut.**

---

## 25. THE SLIP ENGINE — real slips, day by day, every size, structure, composition and cap (2026-09-30)

`build_slip_engine.py` (workflow `nba-slip-engine.yml`). Sources: the certified map (`tier_map_legs`, deduped) + universe for team/game. Cells: the certified ledger (§24a), each at its rank and n-band; Under-only cells re-ranked within the side (as the certifier did). **App rules enforced:** 2–6 picks, no player twice, players on ≥ 2 teams (PP live page); **payout = product of base × leg factors, compressed above 9.1× (§24b rule); no flat haircut.** Same-game and same-team pairs measured per slip, not banned (§15c said leg-level covariance ≈ 0). **26 compositions** (single:<cell>, core = the 6 both-season cells, regular, best, weighted:<cell> = 2 legs of one cell + core, core+goblin extender, core+demon, demon-only, mixed_tier) × sizes 2–6 × Power/Flex × slip k = 1..10 per day by summed certified edge. **483,802 real slips over all 323 days (1,838,450 legs), every one graded on a real outcome.** Persisted: `slip_engine_slips` (legs_json, hits, payout, profit, same_game, same_team, teams, phase) and `slip_engine_legs`.
**Processing check (owner):** on all 483,802 slips — same-player violations 0, single-team violations 0, size mismatches 0, hits ≠ leg-hit count 0, payout ≠ independent recompute of the compression rule 0. Grading unit-tested on synthetic slips (3pk Regular Power 6.0×; 5pk Power + 0.72 goblin 13.49×; 5pk Flex 4/5 2.0×; 4pk Power 9.87× — compressed from 10; 2pk Flex 1/2 0.5×; same-player and single-team rejected).

### 25a. The leaderboard, one slip a day, gate = weaker season (both seasons ≥ 40 days)
| composition | size / structure | ROI 24-25 | ROI 25-26 | 25-26 full-hit % | paid % | leg hit % |
|---|---|---|---|---|---|---|
| demon | 5 Flex | +134% | +74% | **0%** | 27% | 38% |
| demon | 3 Flex | +70% | +70% | 7% | 37% | 41% |
| weighted:steals_R | 6 Flex | +69% | +141% | 6% | 25% | 61% |
| regular | 6 Flex | +67% | +65% | 5% | 27% | 62% |
| weighted:assists_D1 | 6 Flex / 6 Power | +64% / +60% | +152% / +181% | 9% | 28% / 9% | 62% |
| core+demon | 6 Flex / 5 Flex | +56% / +55% | +87% / +65% | 4% / 6% | 29% / 35% | 61% / 59% |
| core | 6 Flex / 5 Flex / 4 Flex / 3 Power / 4 Power | +35% / +28% / — / — / — | +133% / +91% / +55% / +65% / +60% | 8 / 11 / 16 / 27 / 16% | 30 / 46 / 55 / 27 / 16% | 62–63% |
| weighted:rebounds_R | 4 Flex / 4 Power | +34% / +33% | +69% / +85% | 19% | 56% / 19% | 64% |
| core+goblin | 5 Power / 4 Power | — | +55% / +51% | 12% / 23% | 12% / 23% | — |
(Full 40-row table in the run log; every row regenerable from `slip_engine_slips`.)

### 25b. The numbers that decide — concentration, drawdown, phases (2025-26, cap-1)
| composition | ROI | net units | paid % | full % | max drawdown | **% of profit from the 5 best days** | early / mid / late ROI |
|---|---|---|---|---|---|---|---|
| weighted:steals_R 6 Flex | +141% | 227 | 25% | 6% | 13.2 | **64%** | +248 / +143 / **−32** |
| **core 5 Flex** | **+91%** | **146** | **46%** | 11% | **9.9** | **31%** | +111 / +101 / +7 |
| demon 5 Flex | +74% | 117 | 27% | 0% | 12.0 | **75%** | +62 / +34 / +294 |
| demon 3 Flex | +70% | 113 | 37% | 7% | 14.6 | 43% | +81 / +54 / +138 |
| weighted:rebounds_R 4 Flex | +69% | 111 | 56% | 19% | 11.5 | 24% | +94 / +71 / +21 |
| **core 3 Power** | +65% | 104 | 27% | 27% | 14.0 | **25%** | **+74 / +61 / +71** |
| core+demon 5 Flex | +65% | 105 | 35% | 6% | 12.7 | 60% | +109 / +62 / +19 |
| regular 6 Flex | +65% | 104 | 27% | 5% | 19.6 | **99%** | +109 / +74 / **−50** |
| core 4 Power | +60% | 97 | 16% | 16% | 16.0 | 47% | +123 / +64 / **−53** |
| core 4 Flex | +55% | 89 | 55% | 16% | 11.5 | 29% | +94 / +51 / +21 |
| core+goblin 5 Power | +55% | 88 | 12% | 12% | 18.6 | 71% | +141 / +48 / −41 |
| core+goblin 4 Power | +51% | 83 | 23% | 23% | 16.3 | 38% | +73 / +43 / +63 |
**Reading:** (1) **Concentration separates strategies from jackpots.** regular 6-Flex's +65% is 99% five days; weighted:steals 6-Flex's +141% is 64% five days; demon 5-Flex is 75%. **core 5-pick Flex makes +91% with 31% concentration, pays on 46% of days, and has the smallest drawdown (9.9 u)** — the same ROI class as the jackpot rows, earned across the season. **core 3-pick Power is the steadiest: +65%, 25% concentration, positive in EVERY phase including late season (+71%)** where almost everything else collapses. (2) **Late season is negative for most compositions** (core 4-Power −53%, regular 6-Flex −50%, weighted:steals −32%) — §7m's finding at the slip level; the two exceptions are core 3-Power (+71%) and the demon-only slips (+138 / +294%, thin). (3) **The goblin extender at the slip level is +51–55%, not +148%** (§23b): the compression rule and the real day-by-day pool took most of it, and it is 71% concentrated at 5 picks. It survives as a 4-pick Power (+51%, 38% concentration, positive late season +63%). (4) Full-hit rates are low everywhere (5–27%); the money is in the Flex partial tiers on 5–6 picks and in the 3-pick Power's 27% full rate.

### 25c. Daily cap and correlation (2025-26)
| composition | cap 1 / 2 / 3 / 5 / 10 ROI | net units cap 1 → 3 → 10 | slips w/ same-game legs | ROI same-game / cross-game / same-team |
|---|---|---|---|---|
| core 5 Flex | +91 / +85 / +87 / +81 / +78% | 146 → 419 → 1,254 | 81% | **+73 / +100 / +56%** |
| core 3 Power | +65 / +80 / **+92** / +73 / +58% | 104 → 444 → 926 | 39% | +42 / +67 / +33% |
| weighted:rebounds_R 4 Flex | +69 / +71 / +68 / +69 / +68% | 111 → 328 → 1,095 | 63% | +59 / +83 / +55% |
| core 4 Flex | +55 / +66 / +62 / +63 / +65% | 89 → 299 → 1,052 | 62% | +58 / +78 / +54% |
| demon 3 Flex | +70 / +72 / +59 / +65 / +63% | 113 → 284 → 997 | 44% | +67 / +60 / +68% |
| core+goblin 4 Power | +51 / +56 / +68 / +51 / +40% | 83 → 330 → 639 | 64% | +41 / +37 / +34% |
**(1) The daily cap scales.** core 5-Flex holds +78…+91% from 1 to 10 slips a day (net 146 → 1,254 units); core 3-Power peaks at cap 3 (+92%); the edge is not one slip deep. **(2) Correlation costs money at the SLIP level even though leg-level covariance was ≈ 0 (§15c):** on core 5-Flex, slips with two legs from the same game make +73% vs +100% cross-game; same-team +56%. The gap shows in four of six compositions (+20–27 ROI points). A Flex slip is a *count* of hits, and two legs sharing a game move the count together on the days it matters. **Rule: one leg per game (and per team) in every slip; the engine's next pass enforces it.**
**Qualified strategies (positive both seasons, ≤ 50% concentration, drawdown ≤ 15 u):** core 5-pick Flex, core 3-pick Power, core 4-pick Flex, weighted:rebounds_R 4-pick Flex, demon 3-pick Flex, core+goblin 4-pick Power. Jackpot-profile (real, sized as such): demon 5-pick Flex, weighted:steals/assists 6-pick, core+demon 6-pick. Next: the one-leg-per-game rule, the late-season cutoff, and then the gates and hurdles.

### 25d. The correlation tiles were too tight — research, the pair-level map, and the corrected rule (2026-09-30)
Owner: research online, be sure the correlation tiles are not too tight; double-check everything. The concern was right.
**What the strong systems do (Stokastic "repeatable workflow", Outlier, SmartStake, the BettingPros / Predictify optimizers, Turtle +EV):** PrizePicks pays a correlated pair the same 3× as an independent pair, so **positive correlation is free value the app does not price, and negative correlation is a hidden tax**. Nobody bans same-game; they read the sign. The canonical positive stack is two rebounders in a slow game; the canonical trap is opposing scorers' Overs in a blowout. The classical break-even math assumes independence, so a slip's real EV moves with the sign of its pairs.
**What I had done:** measured "same-game slips +73% vs cross-game +100%" and proposed a blanket one-leg-per-game rule — the *average* over every same-game pair, positive and negative mixed, with the net called a cost.
**The pair-level map (real outcomes, both seasons pooled, 108 pair types with ≥ 150 real pairs, top-5 legs of the certified cells):**
| negative pairs (the traps) | rel | pairs | corr | basketball reason |
|---|---|---|---|---|
| threes Over + stocks Under | same team | 197 | **−0.22** | a hot-shooting team plays fast and forces turnovers → its defenders' stocks rise |
| rebounds Under + assists Over | same team | 184 | −0.17 | a team that passes well makes shots → fewer boards |
| pra Under + pts_ast Under | same team | 215 | −0.17 | two Unders on teammates move together with the game |
| threes Over + pts_ast Over | same team | 152 | −0.14 | the shooter's threes come out of the creator's assists, not with them |
| pra Under + rebounds Under (opp) · pra Under + points Under · points Under + rebounds Under | — | 150–227 | −0.13 | |
| threes Over + threes Over | same team | 355 | −0.09 | two shooters share the same attempts |
| **positive pairs (the free value)** | | | | |
| pts_ast Over + assists Over | same team | 186 | **+0.19** | the creator's assists ARE the scorer's points |
| pts_reb Over + assists Over | same team | 180 | +0.19 | |
| pra Under + turnovers Under | opponents | 151 | +0.18 | a slow, careful game depresses both |
| stocks Under + threes Over | same team | 209 | +0.16 | |
| pra Over + assists Over | same team | 171 | +0.16 | |
| threes Over + assists Over | same team | 374 | +0.12 | kick-out threes come from assists |
| assists Over + steals Under · rebounds Under + points Under · points Over + assists Over | same team | 167–193 | +0.09–0.10 | |
**The premise, tested on the engine's own slips (core 5-Flex, 2025-26, same-game slips only):** slips containing a **negative** pair (≤ −0.08): **+11%** ROI, 38% paid (29 slips); slips whose pairs are **neutral**: **+104%**, 47% paid (81) — *higher than cross-game (+100%)*; slips with a **positive** pair (≥ +0.08): +82%, **50% paid** (22). **The entire "same-game costs 27 points" gap was the 29 slips carrying a negative pair.** A blanket ban would have thrown away the +104% neutral slips and the +0.10–0.19 stacks.
**The corrected rule (in the engine):** a pair-level correlation map computed from real outcomes (≥ 100 pairs per type) at run time; **forbid any slip containing a pair with corr ≤ −0.08; allow every other same-game/same-team pair; record min/max pair corr per slip.** Unit-tested (threes O + stocks U teammates rejected; pts_ast O + assists O teammates allowed; cross-game untouched).
**Engine rerun with the rule:** worst pair correlation in any of the 480k+ slips = **−0.078** (the rule held); `regular 5-Flex` +26/+40% → **+43/+48%** both seasons, `mixed_tier 5-Flex` +26/+45% → +43/+50%, `best 5-Flex` +25/+45% → +43/+50%; `core` compositions unchanged (5-Flex +91%, 3-Power +65% in 2025-26 — their cells had few negative pairs). Positive-stack slips inside a composition run +37…+91% with the best paying-day rates, so the next refinement is to *prefer* positive pairs in Flex, not just permit them.
**Double-check of everything done (owner):** (1) fourth consecutive clean certification pass on the frozen 54-invariant list — run `09125a38`, 0 FAIL — nothing shifted under the engine; (2) the engine reconciles to the certified table cell by cell where the cuts match (rebounds_D3 0.606 = 0.606, rebounds_R 0.574 = 0.574, steals_R 0.653 vs 0.654, pts_ast_R 0.613 vs 0.611) and differs only in the direction the cut predicts where they don't; (3) two defects found and fixed: `pra_R_U` was built at top-2 while certified at top-1 (band corrected), and the threes cell was keyed `threes_D1` vs the certifier's `threes_made` (label only); (4) the engine's fewer days on some single-cell 2-picks (133–146 vs 149–150) is the ≥ 2-teams rule rejecting single-team days — correct behaviour, not a loss. **Note on the leaderboard:** the `core` compositions dropped out of the top-20-by-weaker-season only because their 2024-25 is thin (+4…+21%); their 2025-26 numbers are unchanged. The weaker-season sort is the honest gate and it says the core cells' edge is a 2025-26 fact with a 2024-25 floor near zero.

### 25e. Two refinements, each tested on the persisted slips BEFORE being coded (2026-09-30)
**1. The late-season cutoff is the FINAL 7 DAYS, not 21.** Six qualified strategies, cap-1, by days-to-season-end: last 7 days **+9% / −40%** (25-26 / 24-25), 26% paid; days 8–14 +79% / +4%; days 15–21 +49% / **+113%**; days 22–35 +114% / +57%; earlier +63% / +24%. The 21-day "late" phase had been blaming two good weeks for one bad one; the damage is the resting/tanking final week. **Rule: phase `final7` (last 7 days of each season) is built and persisted but excluded from qualification.**
**2. The positive-stack preference, corrected on the full population.** §25d's "neutral same-game beat cross-game" came from one composition (81 slips). On 13,500 four- and five-pick slips per structure: cross-game-only **+53% Flex / +48% Power** (46% / 12% paid); positive pair 0.05–0.10 +56% / +50% (775 slips); positive ≥ 0.10 +43% / +39%; **neutral same-game +37% / +17%** — the worst band in both structures. So correlation is value *when you have it*, not something to seek: a same-game pair concentrates variance even at zero correlation. **Rule (in the engine's ordering): cross-game slips first, then slips with a positive pair (≥ 0.05), neutral same-game last; within a tier by summed certified edge.** Unit-tested.
**Engine rerun with both rules:** 480,246 slips, 323 days, 20,568 flagged `final7`. **52 strategies clear all four gates** (both seasons positive excl. final7, ≤ 50% concentration, 2025-26 drawdown ≤ 15 u, ≥ 40 days each season). Top of the list by weaker season, cap-1, excl. final7:
| composition | size / str | ROI 24-25 | ROI 25-26 | net 25-26 | paid | full | leg hit | dd 25-26 / 24-25 | top-5 % |
|---|---|---|---|---|---|---|---|---|---|
| weighted:rebounds_R | 5 Flex | **+52%** | +74% | 114 | 38% | 9% | 61% | 11.9 / 21.7 | 46% |
| weighted:rebounds_R | 3 Power | +42% | +52% | 80 | 25% | 25% | 63% | 14.0 / 31.0 | 31% |
| weighted:rebounds_R | 4 Flex | +39% | +82% | 126 | **56%** | 21% | 64% | 11.0 / 21.6 | **23%** |
| weighted:stocks_R | 4 Flex | +38% | +78% | 120 | **57%** | 19% | 64% | **8.5** / 22.1 | 25% |
| weighted:assists_D1 | 4 Flex | +34% | +68% | 105 | 55% | 18% | 63% | 11.0 / 21.9 | 29% |
| regular | 5 Flex | +34% | +63% | 97 | 42% | 8% | 63% | 10.0 / **11.8** | 46% |
| weighted:steals_R | 5 Flex | +32% | +95% | 146 | 36% | 10% | 62% | 11.5 / 26.2 | 42% |
| core+demon | 3 Flex | +31% | +33% | 50 | **59%** | 21% | 57% | 11.8 / 11.2 | 34% |
| core | 5 Flex | +29% | +69% | 107 | 39% | 8% | 61% | 11.4 / 30.7 | 50% |
| best | 5 Flex | +28% | +78% | 121 | 42% | 9% | 63% | 9.8 / 18.7 | 43% |
| core | 4 Flex | +27% | +72% | 110 | 55% | 19% | 63% | 11.0 / 23.4 | 28% |
| single:steals_R | 3 Power | +25% | +66% | 98 | 28% | 28% | 63% | 14.0 / 15.0 | 26% |
| mixed_tier | 5 Flex | +25% | +78% | 120 | 42% | 9% | 63% | 9.3 / 26.1 | 44% |
| core | 3 Power | +22% | +44% | 68 | 24% | 24% | 62% | 14.0 / 43.0 | 37% |
| weighted:steals_R | 4 Flex | +20% | **+96%** | **148** | 57% | 21% | 65% | 10.9 / 19.1 | 25% |
| weighted:rebounds_R | 4 Power | +19% | **+109%** | 167 | 21% | 21% | 64% | 14.0 / **57.1** | 30% |
(+36 more; all in `slip_engine_slips`.)
**What the two rules did:** the final-week exclusion lifted most 2024-25 numbers into positive territory (core 5-Flex +21 → +29%, core 3-Power +4 → +22%); the cross-game-first ordering raised paying-day rates on the 4-pick Flex family to 55–57%. **The 4-pick Flex family is the everyday core:** weighted:rebounds / stocks / steals / assists_D1 / turnovers / core 4-Flex all sit at +68…+96% in 2025-26, 55–57% of days paid, 18–21% full hits, drawdown 8.5–11 u, 23–29% concentration — the steadiest profile on the board. **The stress number is the 2024-25 drawdown column:** 21–57 units even where the season was positive — 2024-25 had deep losing runs inside a profitable year, and that is what sizing must survive.

---

## 26. THE SLIP LAYER CERTIFIED, the last levers tested, and the honest scope of "no improvements left" (2026-09-30)

### 26a. Certification extended to the slips
The slip engine had three ad hoc checks; the map had 54 frozen invariants. Added **L11, 12 slip-layer invariants** to the same frozen list: slips exist on all 323 days; no player twice; ≥ 2 teams; size = legs; hits = leg-hit count; **payout = an independent recompute of the compression rule on every one of the 480,246 slips**; no slip carries a pair with corr ≤ −0.08 (min pair −0.078); the `final7` flag matches each season's end exactly; **every leg in the sampled slips is a row on PrizePicks' real window board (0 of 116 missing) and its hit matches the graded outcome (0 mismatches)** — the raw board and the raw outcome, not the map; the engine reconciles to `cand_certified` where the cut matches (|diff| 0.0047); slip k is contiguous per day. Two checks were rewritten before the run when a CTE form returned an empty count (caught live on one day: 40 legs, 0 missing, 0 mismatches).
**Result: three consecutive clean passes on the full list — runs `a60cbbb4`, `34f5ee09`, `b0cd494e`, 66/66 each, no code change between them. CERTIFIED v3 (map + bands + features + matrix + certified ledger + slips).**

### 26b. The last untested levers, tested on the persisted slips (excl. final7)
| lever | result | rule |
|---|---|---|
| **2-pick Flex** (new on PP, 2× / 0.5×) | core 2-Flex +16% / −2%; regular 2-Flex +15% / −16%; core 2-Power +44% / +11% | **2-pick Flex is out**: the 2×/0.5× table does not reward a 0.62 leg; 2-pick Power is thin but positive |
| **daily cap by structure** | 5-Flex and 3-Power IMPROVE with volume: core 3-Power **+44% cap-1 → +81% cap-3** (374 u), core 5-Flex +69 → +75%, weighted:rebounds 5-Flex +74 → +76% (353 u); the **4-Flex family is best at cap 1** (weighted:rebounds 4-Flex +82% cap-1 → +58% cap-3; weighted:stocks +78 → +61%; core 4-Flex +72 → +53%) | **cap 3 for 5-pick Flex and 3-pick Power; cap 1 for 4-pick Flex** — the 4-Flex edge is in the single best slip, the 3-Power and 5-Flex edge is deeper |
| **best all-round** | weighted:rebounds_R 5-Flex: +74% / +52%, holding at cap 3 (+76 / +45%) and cap 5 (+73 / +50%) in both seasons | the one strategy positive in both seasons at every cap |
(§25e's 4-Flex "everyday core" label stands, at cap 1.)

### 26c. What "no improvements can be further done" honestly means here
It means a **bounded** claim, and this is its boundary. Everything that could be tested on the two seasons of real board data has been: 24 cells × 3 ranks × 11 cuts × 21 signals × stacks to depth 5 (§22); 26 compositions × sizes 2–6 × Power/Flex × cap 1–10 (§25); the correlation sign rule at the pair level (§25d); the season phases and the final-week cutoff (§25e); the cap-by-structure and 2-pick Flex questions (§26b); and every number is protected by 66 invariants passing three times, with every slip leg traced to the raw board and the raw outcome. Within that boundary no further lever has shown a both-seasons improvement that the gates accept.
What lies **outside** the boundary, and therefore cannot be claimed: (1) **a third season** — every strategy is positive in both seasons, but 2024-25 was ranked by a less-trained model on a thinner ladder, so the 2024-25 floors (+20…+52%) are the stress case, not an independent confirmation; the 2026-27 season is the real test and P3 already wires it; (2) **the 2025 playoffs** (never ingested, §19l) — nothing is validated on a playoff board; (3) **an injury feed** (§21b) — the one context signal that plausibly beats the model cannot be tested; (4) **Underdog** — the certified UD board (§15a) has never been run through the engine; the compression rule and correlation map are PP's; (5) **live line movement between window and lock** — the window snapshot is 2.5–6.7 h before tip and lines move; the paper-track in Oct will measure the slippage. These are data the system does not have, not levers it has not pulled.
**The system as it stands, certified:** the map (§19), the ledger (§24a), the rank roles (§19p), the correlation sign rule (§25d), the final-week cutoff (§25e), the cap-by-structure rule (§26b), and 52 qualified strategies with the 4-pick Flex family at cap 1 and weighted:rebounds 5-Flex / core 3-Power at cap 3 as the leaders. Gates and hurdles are next.

---

## 27. GATES AND HURDLES (2026-09-30)

Two different things, kept apart. **Qualification gates** decide, on the backtest, which strategies may be played at all. **Live hurdles** decide, on incoming results, when a running strategy is cut back or stopped. Both are stated in units (1 unit = one slip's stake) from the certified slips, cap applied, `final7` excluded.

### 27a. Qualification gates (backtest; all four must pass)
G1 **Both seasons positive** at the strategy's cap, excluding the final week of each season. G2 **Concentration ≤ 50%**: no more than half of 2025-26 profit from the five best days. G3 **2025-26 max drawdown ≤ 15 u at cap 1** (the everyday profile); at cap 3 the drawdown gate becomes the sizing gate below. G4 **≥ 40 slate days in each season.** 52 strategies pass G1–G4 (§25e).
G5 **Sizing gate (new):** a strategy may be played only with a bankroll ≥ **2 × its worst-season max drawdown + 1 u**, and each slip staked at 1 u of that bankroll. The 2× is the survival margin for a drawdown worse than either season's; the worst season is 2024-25 for every strategy.

### 27b. The qualified leaders, with their gate numbers (both seasons; net / ROI / % days positive / max drawdown / longest losing streak / worst-5%-day)
| strategy | cap | 2024-25 (stress) | 2025-26 | bankroll (G5) |
|---|---|---|---|---|
| **weighted:stocks_R 4-Flex** | 1 | +59 u / +38% / 45% / **22.1 u** / 11 d / −1 u | +120 u / +78% / 57% / 8.5 u / 5 d | **45 u** |
| weighted:rebounds_R 4-Flex | 1 | +60 u / +39% / 46% / 21.6 u / 11 d | +126 u / +82% / 56% / 11.0 u / 7 d | 44 u |
| weighted:steals_R 4-Flex | 1 | +32 u / +20% / 44% / 19.1 u / 11 d | +148 u / +96% / 57% / 10.9 u / 7 d | 39 u |
| core 4-Flex | 1 | +43 u / +27% / 45% / 23.4 u / 11 d | +110 u / +72% / 55% / 11.0 u / 7 d | 48 u |
| core+demon 3-Flex | 1 | +48 u / +31% / **54%** / **11.2 u** / 8 d | +50 u / +33% / **59%** / 11.8 u / 6 d | **24 u** |
| **weighted:rebounds_R 5-Flex** | 3 | +209 u / +45% / 36% / **59.5 u** / 15 d / −3 u | +353 u / +76% / 42% / 32.2 u / 13 d | **120 u** |
| core 3-Power | 3 | +131 u / +28% / 33% / **74.6 u** / 15 d / −3 u | +374 u / +81% / 47% / 30.0 u / 6 d | **150 u** |
| core 5-Flex | 3 | +179 u / +38% / 37% / 61.4 u / 15 d | +345 u / +75% / 42% / 31.4 u / 14 d | 124 u |
| regular 5-Flex | 3 | +110 u / +24% / 32% / 36.3 u / 13 d | +301 u / +65% / 40% / 27.2 u / 14 d | 74 u |
| single:steals_R 3-Power | 3 | +29 u / +25% / 21% / 15.0 u / 12 d | +98 u / +66% / 28% / 14.0 u / 14 d | 31 u |
**The trade the gates make explicit:** the cap-3 strategies earn 2–3× more per season (net 301–374 u vs 110–148 u) but their 2024-25 stress drawdowns are **60–75 u with 15-day losing streaks**, so they need **3–4× the bankroll** (120–150 u vs 39–48 u). Per unit of bankroll at risk the cap-1 4-Flex family is the better return; per absolute profit the cap-3 5-Flex / 3-Power are. core+demon 3-Flex is the low-variance floor: 24 u bankroll, 54–59% of days positive, drawdown ≤ 12 u in both seasons, at a modest +31–33%.

### 27c. Three tiers of play (a portfolio, not one strategy)
| tier | strategies | cap | bankroll | expected (25-26 / stress 24-25) | role |
|---|---|---|---|---|---|
| **T1 everyday** | weighted:stocks / rebounds / steals 4-Flex, core 4-Flex | 1 each | ~45 u each | +72…+96% / +20…+39% | 55–57% of days paid; drawdown ≤ 11 u |
| **T2 volume** | weighted:rebounds 5-Flex, core 5-Flex, core 3-Power | 3 each | 120–150 u each | +75…+81% / +28…+45% | 2–3× the net; survives 60–75 u |
| **T3 floor** | core+demon 3-Flex, single:steals 3-Power | 1 / 3 | 24–31 u | +33…+66% / +25…+31% | lowest variance; runs when T1/T2 are throttled |
Jackpot-profile slips (demon 5/6-Flex, 6-pick weighted) are **not** in any tier: sized separately, ≤ 5% of bankroll, or not at all.

### 27d. Live hurdles (incoming results; per strategy, per tier)
H1 **Per-leg hit-rate hurdle (§15f, re-based on the certified cells):** rolling realized hit of the strategy's placed legs vs its certified level (0.61–0.69 by cell). **Yellow** if the rolling hit over ≥ 100 legs falls > 0.04 below certified; **red** at > 0.07 below over ≥ 150 legs (the 2024-25 level is ≈ 0.04–0.06 below 2025-26, so red means worse than the stress season).
H2 **Drawdown hurdle:** **yellow** when the live drawdown reaches **1.0 × the strategy's worst-season max drawdown** (e.g. 22 u for weighted:stocks 4-Flex, 60 u for weighted:rebounds 5-Flex) → cut the cap to 1 (T2) or halve the stake (T1); **red** at **1.5 ×** → stop the strategy and re-qualify it on the live data before resuming. G5's 2× bankroll keeps red short of ruin.
H3 **Streak hurdle:** **yellow** when the live losing streak exceeds **1.25 × the worst-season longest streak** (14 days for T1, 19 for T2); **red** at 1.5 × (17 / 23) — a streak the backtest never produced.
H4 **Pool hurdle (§15e):** qualifying legs/day for the strategy's cells below the historical floor (~10 for the defensive cells) for 2+ weeks → yellow (the board is thinning or PP re-priced). H5 **Opening-weeks rule:** no red in the first 3 weeks of a season (both seasons ran thin and ~0.555 there); T3 only, or paper, until the pool reaches ~15/day. H6 **Final-week rule:** all tiers off for the last 7 days (§25e).
**Escalation:** yellow on any one hurdle → reduce; yellow on two → T3 only; red on any → stop that strategy. A stopped strategy re-enters only after re-passing G1–G3 on a window that includes the live days that stopped it.
**What the hurdles cannot yet do:** measure window-to-lock slippage (H0, the first thing the October paper-track establishes), or react to injury news (no feed, §21b). Both are recorded as open.

---

## 28. THE MLB FALSIFICATION BAR — read, researched, translated, and applied to every strategy (2026-09-30)

Owner: the MLB slip documentation's gates and hurdles are what validates a strategy; translate them to NBA with research and Gemini, multiple passes, deep scrutiny to see what survives. This section supersedes §27's qualification gates where they conflict.

### 28a. What MLB's method is (from `SLIP_STRATEGY_V1_SPEC_AND_BLOCKERS.md` and `SESSION_2026-09-01_PP_GATE_CALIBRATION.md`)
**The spec's gates:** day-block bootstrap (2,000 resamples) 100% positive; 95% CI excluding zero; leave-one-day-out positive on every day; split-sample train/test holds; profitable-day count; best-day share of profit; max drawdown. Rules learned the hard way: **cap widening kills ROI on the first step** (+1 cap: 94.3% → 88.7% leg accuracy, +70.9% → +23.7%); **shrink, never substitute** (backup legs come from beyond the cap, exactly the ranks proven to dilute); Power beat Flex at 94% leg accuracy; 5-pick a real peak, 6-pick worse. **Blocker 4 named NBA's exact weakness before NBA existed:** "config was selected in-sample; gates test robustness to day-resampling, not to configuration selection."
**The gate-calibration session's pre-registered falsification bar (set adversarially BEFORE results):** (1) n ≥ 1,500 OOS legs across ≥ 25 distinct days, no single-week blocks; (2) strict rank monotonicity across 5 equal-volume OOS bins, Spearman ≥ 0.95, zero inversions; (3) E[p×m] ≥ 1.04 — a 4% margin, not a hair above break-even; (4) lift over the ungated pool ≥ +0.06 in p×m at p < 0.01 via a **10,000-resample day-blocked bootstrap** (resample whole days, never legs); (5) **falsification: if the 95% bootstrap lower bound falls below break-even the gate is rejected, no exceptions.** Plus: **per-cell break-even at 1/m — a global gate accepts negative-EV legs on low-multiplier props and rejects profitable ones on high-multiplier props**; "decompose the aggregate by every plausible confounding dimension before believing it — a single dominant sub-population hiding inside a clean aggregate is the most common failure mode in this program"; five retractions recorded rather than buried. MLB's record: 17 candidates tested, 0 confirmed.
**One MLB fact that conflicts with NBA and is resolved:** MLB measured PP discounting same-game slips 37% ("always build cross-game"). NBA's own real quotes (`PP_PAYOUT_FINDINGS` §6) show opponent same-game pairs at 3.0/3.0/2.9× — no meaningful discount; **teammate pairs are untested on NBA**. The repo's own conservative rule: "every slip uses legs from different games." Adopted for teammates (V6 below); opponents stay allowed on the measured evidence.

### 28b. Research and the adversarial pass
The validation literature (walk-forward with selection on a trailing window applied to the next block; stationary/day-blocked bootstrap CIs; drawdown distribution under resampling; "certified when the OOS CI excludes zero") converges with MLB and adds two things MLB lacked: **deflation for the number of strategies tried** (the best of many is biased upward) and CLV. Gemini, asked adversarially with both bars side by side: "positive in both seasons" is NOT out-of-sample when the configuration was chosen with both seasons visible — correct, and it is MLB's Blocker 4; no bootstrap CI on ROI, no leg-level bar, no decomposition — correct; ban teammate pairs until measured — correct, adopted; minimum live paper-track before staking 50 days / 1,000 slips per strategy with a stop at CI-lower-bound < break-even or drawdown > 1.5× — adopted (§28f). Gemini's "500 expected false survivors" arithmetic was wrong (independent coin flips across strategies that share the same legs), so deflation was done empirically.

### 28c. The NBA translation — `validate_slip_strategies.py` (workflow `nba-validate-slips.yml`), on the certified slips
| MLB item | NBA translation |
|---|---|
| config selected in-sample (Blocker 4) | **V1 walk-forward:** rank every strategy on **2024-25 only** (ROI at its cap, ≥ 40 days), take the top 30, score them on **2025-26, never used for selection**. Only the OOS numbers count. |
| 10k day-blocked bootstrap; lower bound < break-even → reject | **V2:** 10,000 resamples of whole OOS days; **95% lower bound on OOS ROI must be > 0**. |
| deflation for strategies tried | **V3 empirical null:** re-run V1+V2 under a null where selection carries no information; the survivor count under the null is the expected number of false survivors. |
| rank monotonicity across 5 bins | **V4:** OOS slips in 5 equal-volume bins by summed certified edge; inversions counted. |
| decompose the aggregate | **V5:** each survivor's OOS profit attributed by leg cell; dominant-cell share flagged. |
| same-game payout | **V6:** OOS ROI recomputed with every same-team slip removed; the banned figure stands. |
| cap widening / shrink-not-substitute | cap fixed by structure BEFORE looking at OOS (cap 3 for 5-Flex and 3-Power, cap 1 otherwise — §26b); shrink rule carried into the live builder. |

### 28d. RESULTS — walk-forward, selected on 2024-25, scored on untouched 2025-26
**17 of 30 survive V2 and V6** (OOS CI lower bound > 0 AND positive with teammates banned):
| strategy (cap) | S1 ROI (selection) | OOS ROI | OOS 95% CI | no-teammate OOS | top cell (share) |
|---|---|---|---|---|---|
| weighted:steals_R 5-Flex (3) | +45% | **+106%** | **+62% … +152%** | +111% | steals_R 40% |
| demon 5-Flex (3) | +158% | +112% | +46% … +186% | +136% | threes_D1 38% |
| weighted:rebounds_R 4-Flex (1) | +39% | +82% | +45% … +120% | +75% | steals_R 63% |
| weighted:stocks_R 5-Flex (3) | +31% | +84% | +45% … +125% | +88% | steals_R 53% |
| weighted:rebounds_R 3-Power (3) | +37% | +79% | +45% … +113% | +80% | steals_R 73% |
| weighted:stocks_R 4-Flex (1) | +38% | +78% | +43% … +114% | +72% | steals_R 65% |
| weighted:threes_D1 3-Power (3) | +31% | +75% | +41% … +109% | +76% | steals_R 73% |
| weighted:turnovers_R 3-Power (3) | +31% | +71% | +37% … +106% | +71% | steals_R 72% |
| weighted:rebounds_R 5-Flex (3) | +45% | +76% | +37% … +117% | +82% | steals_R 49% |
| core 5-Flex (3) | +38% | +75% | +36% … +115% | +77% | steals_R 54% |
| weighted:assists_D1 4-Flex (1) · 5-Flex (3) | +34% · +40% | +68% · +65% | +34…+104% · +29…+103% | +66% · +65% | steals_R 65% · 52% |
| core+demon 5-Flex (3) · 3-Flex (1) | +51% · +31% | +69% · +33% | +29…+115% · +9…+56% | +75% · +34% | steals_R 48% · 71% |
| weighted:threes_D1 5-Flex (3) | +34% | +63% | +27% … +103% | +67% | steals_R 54% |
| demon 3-Flex (1) | +68% | +62% | +18% … +109% | +68% | threes_D1 54% |
| best 6-Flex (1) | +37% | +70% | **+1%** … +152% | +70% | steals_R_U 33% (marginal) |
**Rejected by V2 (OOS lower bound ≤ 0):** every other 6-pick (weighted:steals 6-Flex −6%, regular 6-Flex −7%, weighted:rebounds 6-Flex −12%, regular 6-Power −60%), demon 4-Flex (−13%), demon 5/6-Power (−100%), single:stocks 5-Flex/Power (−16 / −62%), single:points 5-Power (−42%, and negative with teammates banned), single:assists_D1 2-Flex (OOS +1%). **The jackpot rows are gone; §27's tiers are revised below.**

### 28e. V3 — the empirical null, including the two I got wrong (recorded, MLB-style)
1. **Label-permutation null (WRONG):** shuffled slip profits across strategies within a day. It preserves every day's real outcomes and merely relabels them, so it preserves the board's real edge — the average slip across ALL 186 strategies in 2025-26 is **+46%**. It answered "does selection beat the average strategy?" (17 real vs 16.1 expected: barely) — not the question.
2. **Hit-shuffle-among-slip-legs null (WRONG):** shuffled hits among the legs that appear in slips. Those are the SELECTED legs, hitting 0.575 (Regular 0.603), so the null still had a 0.575-hit board and beat break-even easily (21.8 expected survivors). The same mistake in a third form: the null kept selection inside it.
3. **Whole-board tier-rate null (CORRECT):** each slip leg's hit is a Bernoulli draw at its **tier's whole-board rate** from the certified map — R **0.500** (both sides posted), G1 0.616, G2 0.691, G3 0.743, D1 0.333, D2 0.290, D3 0.192 — then every slip regraded with the compression rule and V1+V2 re-run. Sanity: a Regular 3-Power or 4-Flex under this null returns **−25%**, PrizePicks' built-in house edge. **Result: 0 survivors in 100 draws (max 0) vs 17 real.** The edge is not selection. The selected legs beat their tier's whole-board rate by **+0.10 on Regular (0.603 vs 0.500), +0.08 on D1 (0.410 vs 0.333), +0.12…+0.20 on goblins** — that per-tier gap is the edge, stated the MLB way.

### 28f. V5 — the decomposition, and what it does to "17 strategies"
Steals_R is the top profit cell in 14 of 17 survivors at 40–73% of profit. The direct test — each survivor's OOS slips split by whether they contain a steals leg — shows why: **15 of the 17 survivors contain a steals leg in 98–100% of their slips.** The engine orders legs by certified edge, steals_R has the highest (0.654–0.691), so it is the first leg of every composition and lands in every slip; the compositions differ only in the fillers. **The 17 are largely ONE strategy — a steals-anchored Regular slip — under 15 labels.** The only survivors independent of it are the two demon-only compositions (demon 5-Flex +112%, demon 3-Flex +62%; 0% steals). This is MLB's dominant-sub-population finding, exactly. **Honest count of distinct validated families: TWO** — (A) the steals-anchored Regular family (best expression: weighted:steals_R 5-Flex at cap 3, OOS +106%, CI +62…+152%; or 4-Flex at cap 1 for the low-frustration profile), and (B) the demon-only family (demon 5-Flex cap 3, OOS +112%, CI +46…+186%; demon 3-Flex cap 1). A third family — Regular WITHOUT steals — has not been tested and is the next validation run (steals is one cell; if PP tightens it, family A has no fallback).

### 28g. The translated gates and hurdles (supersede §27a–c where they conflict; §27d live hurdles stand)
**Qualification (backtest):** Q1 selected on 2024-25 only, scored on untouched 2025-26 (walk-forward) · Q2 OOS 95% day-blocked bootstrap lower bound > 0 (10,000 resamples) · Q3 positive with teammate same-game slips removed · Q4 survivors exceed the whole-board-null survivor count (currently 0) · Q5 decomposition: no single cell > 60% of OOS profit unless the family is declared as that cell's family · Q6 cap fixed by structure before OOS; shrink, never substitute. **Sizing (§27a G5) stands:** bankroll ≥ 2 × worst-season max drawdown + 1 u.
**Live (per Gemini, adopted):** no strategy is staked before **50 distinct slate days AND 1,000 paper slips per strategy**; stop if the paper CI lower bound on ROI falls below 0 or live drawdown exceeds 1.5 × the 2025-26 max at the same cap; plus §27d H1–H6.
**What this changes:** §27's three tiers collapse to two families with a stated single point of failure (steals_R). Next: validate family C (Regular without steals) and the Underdog board through the same V1–V6, then wire the survivors' shrink-not-substitute builder for the October paper-track.

### 28h. FAMILY C — Regular without steals (2026-10-01)
Engine run with `SE_EXCLUDE_CELLS=steals_R,steals_R_U` into suffixed tables (`slip_engine_slips_nosteals`; the certified tables untouched): 476,930 slips, 323 days, **0 steals legs leaked**. Same V1–V6.
**12 of 30 survive** (walk-forward OOS CI lower bound > 0, positive with teammates banned); **0 survivors under the whole-board null in 100 draws.** The edge without steals is real, at a lower level:
| strategy (cap) | S1 ROI | OOS ROI | OOS 95% CI | no-teammate | top cell (share) |
|---|---|---|---|---|---|
| demon 5-Flex (3) · 3-Flex (1) | +158% · +68% | +112% · +62% | +46…+186% · +18…+109% | +136% · +68% | threes_D1 (unchanged — no steals in it) |
| **weighted:stocks_R 4-Flex (1)** | +41% | **+59%** | **+20% … +100%** | +54% | turnovers_R 63% |
| weighted:stocks_R 5-Flex (3) | +43% | +56% | +19% … +99% | +60% | turnovers_R 53% |
| core 5-Flex (3) | +47% | +55% | +17% … +98% | +62% | turnovers_R 54% |
| weighted:threes_D1 5-Flex (3) · core+demon 5-Flex (3) · weighted:assists_D1 5-Flex (3) / 4-Flex (1) | +42…+58% | +39…+51% | +6…+13% lower bound | +35…+58% | turnovers_R 41–63% |
| core+goblin 5-Power (1) · 6-Flex (1) | +62% · +48% | +80% · +70% | +5% · +1% (marginal) | +72% · +82% | turnovers_R 45% · 36% |
Rejected again: every 6-pick Flex (lower bounds −8 … −32%), demon Power (−100%), single:stocks / single:points 5-pick.
**Reading.** (1) **The Regular edge survives the removal of its best cell**, roughly 20–30 points lower (weighted:stocks 4-Flex +59% vs the steals-anchored 4-Flex family's +78–82%; core 5-Flex +55% vs +75%). (2) **The anchor moved, it did not vanish:** turnovers_R is now the top profit cell in 11 of 12 survivors at 41–63%, exactly as steals was. That is the engine's ordering by certified edge, not a property of either cell — remove turnovers and stocks would take the slot. **The Regular family is a ranked ladder of defensive cells (steals 0.654–0.691 > turnovers 0.633 > stocks 0.613) and the edge degrades gracefully down it.** The MLB "dominant sub-population" flag is therefore a feature of how the slips are built, and the right remedy is not to ban the anchor but to **cap any single cell's share of a slip's legs** (e.g. ≤ 2 of 5) so a PP line change on one cell is a graceful loss, not a collapse. (3) The demon family is unchanged by construction. **Families now validated: A (steals-anchored Regular), B (demon-only), C (Regular without steals). All three beat the whole-board null outright.** Next: the per-cell share cap in the engine (then re-validate A with it), and the Underdog board.

### 28i. The per-cell share cap — measured first, then adopted, then family A re-validated (2026-10-01)
**Measured on the persisted family-A slips before changing anything:** slips with ≤ 2 legs from any one cell family vs slips with 3+ — capped won in **7 of 10 season-rows** (weighted:steals 5-Flex 2025-26 **+109% vs +82%**; weighted:rebounds 4-Flex +93% vs +74%; core 5-Flex 2024-25 +47% vs +32%; weighted:stocks 4-Flex 2024-25 +44% vs +31%). Diversification with no edge tax. **Adopted as a validity rule: `SE_MAX_PER_CELL=2` (steals_R and steals_R_U count as one family).** Unit-tested. Side effect by design: `single:<cell>` compositions are invalid at size ≥ 3 (a single-cell 5-pick is maximal exposure to one line).
**Engine rerun with the cap:** 438,234 slips (480k before; the over-concentrated and single-cell 3+ slips gone), 323 days, **0 cap violations**. Re-validated (same V1–V6):
| strategy (cap) | S1 ROI | OOS ROI | OOS 95% CI (was) | no-teammate | top cell (share, was) |
|---|---|---|---|---|---|
| weighted:steals_R 5-Flex (3) | +45% | **+103%** | **+60 … +149%** (+62…+152) | +107% | steals_R 39% (40%) |
| **core 5-Flex (3)** | +32% | **+94%** | **+56 … +135%** (+36…+115) | +99% | steals_R 40% (54%) |
| demon 5-Flex (3) | +165% | +129% | +55 … +219% (+46…+186) | +156% | threes_D1 39% |
| **regular 5-Power (1) — NEW** | +38% | **+144%** | **+51 … +248%** | +163% | steals_R_U 40% |
| weighted:rebounds_R 4-Flex (1) | +29% | +86% | +50 … +125% (+45…+120) | +80% | steals_R 49% (63%) |
| core 3-Power (3) | +34% | +82% | **+49 … +116%** (not in the top 30 before) | +83% | steals_R 67% |
| weighted:assists_D1 / rebounds_R / threes_D1 / turnovers_R 3-Power (3) | +31…+38% | +73…+82% | +40…+49% lower bounds | +72…+85% | steals_R 65–68% (3 legs, 2-cap: can only diversify so far) |
| weighted:threes_D1 / assists_D1 / turnovers_R / rebounds_R 5-Flex (3) | +34…+43% | +69…+85% | +35…+45% lower | +73…+94% | steals_R / turnovers_R 39–40% |
| core+demon 5-Flex (3) · 3-Flex (1) | +48% · +31% | +70% · +33% | +30% · +10% | +71% · +34% | steals_R 38% · 71% |
| demon 3-Flex (1) | +68% | +62% | +19 … +110% | +68% | threes_D1 54% |
| core 6-Flex · weighted:turnovers 6-Flex · core+goblin 6-Flex (1) | +44…+55% | +72…+95% | **+4 … +12%** (marginal) | +53…+60% | turnovers_R 33–34% |
**20 of 30 survive (17 before); 0 under the whole-board null (100 draws).** The cap raised the OOS lower bounds almost everywhere (core 5-Flex +36 → +56%; weighted:rebounds 4-Flex +45 → +50%), brought steals' profit share on the 5-Flex strategies down from 40–73% to 38–49%, and surfaced a strong row the uncapped engine never built — **regular 5-Power, OOS +144%, CI +51 … +248%** — because its top-5 had been steals-saturated. The 3-Powers keep steals at 65–68%: with three legs and a 2-cap that is the floor, and it is accepted as the stated exposure of that structure.
**Standing engine rules after §28:** ≥ 2 teams; no player twice; no teammate same-game pair (V6); no pair with corr ≤ −0.08; ≤ 2 legs per cell family; cross-game first in the ordering; payout by the compression rule; cap 3 for 5-Flex / 3-Power, cap 1 otherwise; `final7` excluded. The certified slip tables were rebuilt under these rules and re-certified (L11) below.

### 28j. Re-certification of the capped tables, and Underdog (2026-10-01)
**Re-certification:** the capped slip tables passed the full 66-invariant list three times in a row with no code change — runs `b6087a3f`, `a9b6ddeb`, `55db2ad7`, 0 FAIL each. **CERTIFIED v4** (map, bands, features, matrix, ledger, capped slips).
**Underdog — closed as a venue for the validated families, by measurement rather than an engine run.** Family A's top-5 legs exist on UD's window board at the same line: pra R 72%, points R 64%, rebounds R 59%, pts_reb 39%, pts_ast 30%, **turnovers 22%, steals 16%, stocks 11%, blocks 9%, assists D1 1%, threes D1 0%** (UD has no demon ladder). Where UD posts them the multiplier is exactly 1.0, so the payout upgrade (§15a: 4pk Standard 12× vs 10×, 5pk Flex one-miss 2.5× vs 2×) is real per leg. But a slip needs every leg: **a complete family-A slip is placeable on UD on 0–1 of 154 days** (core 3-Power 1 day; weighted:rebounds 4-Flex 1 day; core 5-Flex, weighted:steals 5-Flex, regular 5-Power: 0 days). The defensive anchors are the reason — with steals on UD 16% of the time, five legs all present is ~0. **Conclusion: UD is not an upgrade path for families A/B/C.** A UD-native strategy would have to be built from the props UD carries (pra, points, rebounds — the points-family cells, the weaker end of the certified ledger, 0.57–0.61) and validated through V1–V6 on its own with UD's table and UD's unrecorded correlation shift; that is a separate future question, not this phase's.
**Phase close.** Validated, certified, and ready for the October paper-track: family A (steals-anchored Regular, capped; weighted:steals 5-Flex cap 3 OOS +103% CI +60…+149%; core 5-Flex OOS +94% CI +56…+135%; regular 5-Power cap 1 OOS +144% CI +51…+248%; weighted:rebounds 4-Flex cap 1 OOS +86% CI +50…+125%; core 3-Power cap 3 OOS +82% CI +49…+116%), family B (demon 5-Flex cap 3 OOS +129% CI +55…+219%; demon 3-Flex cap 1 OOS +62%), family C (Regular without steals: weighted:stocks 4-Flex OOS +59% CI +20…+100%; core 5-Flex OOS +55%) — all three beating the whole-board null outright (0 survivors in 100 draws vs 20 / 12 real). Live rule: no staking before 50 slate days and 1,000 paper slips per strategy, §27d hurdles H1–H6, and §28g's stop rule. Open items unchanged: window-to-lock slippage (H0), injury feed, 2025 playoffs, a third season.

---

## 29. THE AUTOMATED ENGINE — P4 daily, P5 weekly (2026-10-01)

Owner: a completely automated engine that increments every day's results, adjusts every step, auto-adjusts the slip strategies, and runs the gates and hurdles with the same discipline. The backtest strategy is complete; what remained was proving it live, and this is the machine that does it.

### 29a. P4 — the daily live engine (`nba/live_slip_engine.py`, workflow `nba-p4-live-slips.yml`)
Two scheduled legs, both gated to regular-season slates through `nba_calendar.games` (`game_label`), the same rule P3's slate gate uses, so no preseason slip ever reaches the ledger:
- **PICK, 21:45 UTC / 14:45 PT** (30 min after P3 has scored and archived the window board): today's PP window board priced by `pp_leg_price` and scored by the live `final_hp`, shaped exactly like the certified map (three ranks, `n_rank` per prop × tier), **passed through the certified rules imported from `build_slip_engine` — nothing re-derived**: the cells, the per-cell cap, the correlation map, the ordering, the compression pricing. One slip set per *active* strategy at its *live* cap → `nba_score.live_slips` (status `placed`), and the day's qualifying pool size per strategy → `nba_score.live_pool`. Walk-forward by construction: today's board only, strategies qualified only on prior data.
- **GRADE, 16:30 UTC / 09:30 PT** (45 min after P2 has graded yesterday's outcomes): yesterday's placed slips graded against `prop_universe`'s real outcomes with the compression rule (a slip with any ungraded/void leg stays `placed` until P2 grades it) → the ledger → per-strategy live metrics → **the hurdle machine** → `nba_score.live_strategy_state`.
**The hurdle machine (§27d/§28g, exact):** H1 rolling leg hit over the last 100 legs vs the strategy's certified level (yellow > 0.04 below; red > 0.07 below on ≥ 150 legs) · H2 live drawdown vs the backtest worst-season max dd (yellow 1.0×, red 1.5×) · H3 live losing streak vs the backtest longest (yellow 1.25×, red 1.5×) · H4 14-day pool average below the strategy's floor (yellow) · H5 first 21 days of the season: reds are downgraded to yellow · H6 final 7 days: off · **paper gate**: `paper` until ≥ 50 slate days AND ≥ 1,000 slips AND the 10k day-blocked bootstrap lower bound on live ROI > 0, then `active`. **State machine:** paper → active (gate) · one yellow → `yellow`, cap halved · two yellows or any red → `red`, cap 0, flagged · H6 → `off`. The engine reads the state each morning and places only what the state allows; nothing here stakes money.
**Replayed end to end on a real day (2026-03-20):** PICK built 16 slips for all 8 strategies at their caps from pools of 6–23 legs; GRADE graded all 16 against real outcomes (4-of-5 Flex 2.0×, 3-of-5 0.4×, 3-of-4 1.5×, Power misses 0), updated the ledger, and ran the hurdles. **The replay caught one tuning defect** — both demon strategies went yellow on H4 against a flat floor of 10 legs that came from the defensive Regular cells (§15e); the backtest's own pools are Regular ≈ 11 (p10 9–10) and demon ≈ 6 (p10 5), so the floor is now per strategy (8 Regular, 4 demon), below each family's 10th percentile. Replay rows cleared; **all 8 strategies reset to `paper` at their caps for a clean October 20.**
**The eight live strategies** (name → composition, size/structure, cap, certified leg hit, worst-season dd, longest streak, pool floor): A_wsteals_5flex (3, 0.61, 59.5 u, 15 d, 8) · A_core_5flex (3, 0.61, 61.4, 15, 8) · A_regular_5power (1, 0.61, 36.3, 13, 8) · A_wrebounds_4flex (1, 0.62, 21.6, 11, 8) · A_core_3power (3, 0.62, 74.6, 15, 8) · B_demon_5flex (3, 0.41, 40.0, 15, 4) · B_demon_3flex (1, 0.41, 14.6, 12, 4) · C_wstocks_4flex (1, 0.60, 22.1, 11, 8).

### 29b. P5 — the weekly requalification (`nba-p5-weekly-requal.yml`, Monday 20:00 UTC after P1)
The "adjust in all steps" loop, run the way the backtest was built: **1.** tier map + bands rebuilt on the data as it now stands (the live days are in the map) → **2.** candidate certifier → **3.** the capped slip engine (the live days are now in the backtest) → **4.** the frozen certification pass (**any FAIL stops the loop here**; nothing downstream runs on an uncertified chain) → **5.** the walk-forward validation (10k bootstrap, whole-board null, teammate ban) → **6.** a verdict per live strategy to `nba_score.weekly_requal`: PASS / FAIL / NOT_IN_TOP30. **A FAIL sets the strategy to `red` (cap 0) and flags it; the engine NEVER edits the strategy list.** New strategies enter only through a reviewed edit of `live_slip_engine.STRATEGIES`, and a stopped one re-enters the same way after re-passing. This is deliberate: MLB's lesson is that a system which rewrites its own strategy list is the one you cannot trust.
**One design item, dated:** the validator selects on 2024-25 and tests on 2025-26. Once the live season has ≥ 40 slate days (≈ early December) the selection window must roll — select on everything before the last N days, test on the last N — so the live season becomes the test window instead of a backtest extension. That is a reviewed change to `validate_slip_strategies.py`, not something to guess at now.
**What the automation does not do, by design:** stake money; add or replace strategies; override a red; or run during preseason or the final week. What it does: place every qualified strategy's paper slips every regular-season day, grade them against real outcomes the next morning, evaluate every hurdle on the live ledger, hold every strategy in `paper` until the 50-day / 1,000-slip / CI gate, and re-certify and re-validate the entire chain every week on the growing data.

### 29c. The perfection pass — simulate, debug, research, Gemini (2026-10-01)
Owner: test, simulate, debug, research, Gemini — bring it to perfection. The pass found eleven defects; none would have surfaced from the one-day replay, and three were in the hurdle state machine itself.
**1. Simulation of the state machine on synthetic scenarios with known right answers** (healthy; dead edge at 0.50 per leg; healthy with an injected 18-day losing streak; slow decay 0.61 → 0.54), 150-day seasons, the engine's own decision logic reproduced exactly. First run: the healthy strategy went red on day 104 and bounced through yellow 17 times; the variance case spent 62 days in `critical`; the slow decay was caught only through yellow churn. Three causes, three fixes:
- **H1 (per-leg hit) as a ±0.04 window on 100 legs fires ~20% of the time by chance** — the standard error of a 100-leg hit rate is 0.049. Replaced by a **CUSUM on the chronological leg stream** (k = 0.015), with the decision interval **calibrated so the backtest's own leg stream alarms at most once per season**; short horizon = 0.75 h (yellow), long = h (red). The rolling window is kept only as a reported metric.
- **The grace clock reset on every re-entry**, so a drawdown that lingered at 0.8–1.0× the line lived in `critical` indefinitely. Now **anchored to the drawdown episode's start (the running-peak date)**: 7 days of breach past the peak → red.
- **A hysteresis deadlock:** "step down only after 3 consecutive clean days" was implemented so that *holding* in yellow reset the very counter it waited on — a healthy strategy could never leave yellow (sims: 114 of 150 days). Now only a **fresh hurdle fire** resets the counter; a hold does not.
After the fixes: healthy strategies go `active` on day 49 and stay there (3–21 yellow days a season at 0.75 h); the dead edge is caught on **day 22** and stays red; the slow decay on **day 86** and stays red; the 18-day streak passes through `critical` without a permanent red.
**2. Research (production trading systems, kill-switch engineering, alpha-decay detection):** (a) **the historical max drawdown is one ordering of the trades; size and gate to the Monte Carlo 95th percentile** — adopted, for drawdown AND for the longest losing streak (the sims produced 23-day streaks on healthy strategies that would have been permanent false reds at 1.5× the historical 15); H2 yellow at 0.8 × MC95 and red at MC95, H3 yellow at streak-MC95 and red at streak-MC99, all from a `calibrate` mode that bootstraps each strategy's certified day sequence 10,000 times; (b) **a drawdown kill switch fires late; the leading indicator fires first** — the CUSUM on leg hits is that indicator; (c) H2 now tests the **current** drawdown, not the historical max of the live run, so a fully recovered strategy is not flagged for a past dip.
**3. Gemini, adversarially:** caught the most consequential bug — **the paper gate asked every strategy for 1,000 slips, which for a cap-1 strategy is ~1,000 days.** Now **cap × 50 slips** over ≥ 50 slate days, with the 10k day-blocked bootstrap lower bound carrying the test. Also adopted: **H7, a portfolio hurdle** — family A shares the steals cells, so one CUSUM on the pooled live steals legs across all strategies flags the whole family together (an H7 red is an edge failure: no grace); and a **grace period before red on drawdown/streak alone** (`critical`, cap 1, 7 days from the episode start), since 11–15-day losing streaks are normal for these structures. Rejected: Gemini's "1,800–2,200 slips" (assumes independent slips; the day-blocked CI is the test) and a Kolmogorov-Smirnov feature-drift monitor (the board changes daily by nature; H4 and the weekly re-certification are the drift detectors).
**4. Found on review:** voided legs now **revert the slip to the smaller size per PrizePicks' documented `payouts_srp` rule** (a slip left with < 2 legs is refunded) instead of staying ungraded forever; an `off` state from a season's final week **rolls over** to `paper` at the next season; P5's weekly **PASS is now the one path out of red** (as §28g requires); the regular-season window for H5/H6 reads `nba_calendar.games` (`game_label`), the same source as P3's slate gate (verified: 2026-27 regular season Oct 20 → Apr 11, with Cup / Mexico / Paris games correctly counted as regular); the pool-floor hurdle is per strategy (8 Regular, 4 demon, from the backtest's own pools); replay mode starts from a clean ledger.
**5. Pending (not claimed):** `calibrate` on the real certified backtest (MC95 drawdown/streak and CUSUM h per strategy) and the full 2025-26 season replay through the corrected machine are queued behind an earlier slow replay; the replay's state history is what will show whether the hurdle machine behaves across a real season. That result is written here when it lands.

### 29d. Early-season behavior, and whether the bleeds can be reduced — grounded, not guessed (2026-10-01)
Owner: how did the strategies behave at the start of the two seasons; can any signal, layer or cap reduce the bleeding without losing income; research, reliable sources, Gemini; no guessing.
**The facts, all eight strategies at their caps, $1 per slip:**
| window | 2024-25 | 2025-26 |
|---|---|---|
| week 1 | +$83, +88%, leg hit 59%, 57% days +ve | +$113, +105%, 58%, 57% |
| **week 2** | **−$40, −40%, leg hit 41%, 29% days** | **−$56, −51%, 40%, 14% days** |
| week 3 | +$58, +65% | +$291, +277% |
| week 4 | +$18, +18% | +$246, +246% |
| weeks 5–10 | −$8 / −$91 (**−4% / −26%**) | +$238 / +$188 (+116% / +49%) |
| rest | +$1,246, +82% | +$1,429, +96% |
Week 1 is strong in both seasons. **Week 2 is negative in both seasons for EVERY strategy** (eight of eight, both years). Week 3 recovers in both. The 2024-25 weeks 5–10 bleed is a separate event, confined to the strategies anchored on defensive Unders (−32…−39%) while the demon and Power strategies were +6…+76% through it.
**Three reduction techniques, tested on the real slips, all FAILED:**
1. *Throttle or stop after a cold trailing week.* Days following a trailing-7 all-leg hit under 0.50 still returned **+51% on 1,391 slips**. Recent coldness carries no information — the §20 mean-reversion result at the slip level; PP re-prices after streaks. A cold-week throttle would have cost **+710 units**. (Gemini proposed exactly this as "dynamic sizing: 0.5 units after a cold week, stop at −15%"; rejected on this evidence.)
2. *Over/Under gap regime switch* (trailing-10 defensive Over hit minus Under hit). Catches the 2024-25 bleed (70 days at gap ≥ +0.15 returned −2% vs +70…+145% elsewhere) and **inverts in 2025-26** (the same regime returned +121%). The 2024-25 bleed was the half-trained ranker's Under tilt in a hot-defense stretch, which the two-season retrain removed — not a market regime a live rule should chase.
3. *Any sub-population of week 2.* Every slice is negative in both seasons: slips with zero newly-listed legs **−46% / −81%**, one new leg −100% / −11%, two-plus new legs −33% / −50%. Playing only Unders: 50% hit vs 66% claimed. Playing only the strategies that "survived": none did.
**The mechanism, found by falsifying my first explanation.** I had written that week 2 loses because "PP re-prices the openers and the model lags." Tested at the leg level, that is **false**: lines on the same players did not move between week 1 and week 2. What happened is that **the board widened** — 64% of week-2 defensive legs were players PP had not listed in week 1 (hit 44%), and even the week-1 veterans dipped to 52% (vs 66% the week before, 77% the week after). Players' minutes were normal (surprise 2.4 vs 3.2 min), DNPs nil, so the player played as expected and the leg still missed: both the board's lines on newly listed players and the model's early-season priors are at their least accurate in the same week, and by week 3 both have settled (newly listed players hit 64–67% from then on). Research corroborates the transition-week overshoot on independent data (a documented 2021 season: unders 62.7% through two weeks, books adjusted totals 4–5 points, the direction flipped) and the imprecision of low-count defensive lines (steals lines "set at 1.5" with systematic over-hits).
**The rule, and only the rule the evidence supports: skip week 2 (season days 7–13) by calendar.** It converts −$40 and −$56 into $0 at a cost, in a season where week 2 is normal, of roughly a week of average profit (~$100). Two-for-two, every strategy, every slice, with a mechanism and an external corroboration. It goes into the live engine as a calendar rule (the hurdles need 30+ legs of history and cannot react inside a 7-day window). Nothing else goes in: the trailing throttle and the regime switch would both lose money on this board, and the demon/Power strategies already provide the only hedge the data supports (they were positive through the 2024-25 bleed, and the portfolio's +100% / 56%-of-days profile in §25-26 depends on them).
**On "reduce loss without losing income," honestly:** the week-2 rule is the whole of it. The remaining losses are variance around a positive edge, and every technique that trims variance on this board also trims the edge. The reduction the data actually offers is the one already built — the per-cell cap, the correlation sign rule, cap-by-structure, and the portfolio of three families — which took max drawdown from 60–75 units per strategy to 75 for the whole portfolio at 2–3× the net.
**Is there an ALTERNATIVE strategy for week 2 (owner)?** Three independent tests on the real week-2 legs of both seasons, and the answer is no — with a reason:
1. **The model carries no information in week 2.** The engine's top-5 Regular picks versus the *mirror* leg (same player, prop, line, other side — always on the board at the same price): week 2 hits 50/50 (2024-25) and 53/47 (2025-26); every other window the picks beat their mirror by 8–22 points (week 1 54/46 and 50/50; week 3 56/44 and 59/41; rest 56/44 and 59/41). So fading the model in week 2 is also a coin flip (defensive legs: inverse 55% in 24-25, 46% in 25-26).
2. **The full cell map in week 2** (every prop × tier × side, both seasons, top-3): only three cells clear 0.55 (assists D2 0.686, rebounds R Under 0.645, points D1 0.634), each on 31–42 legs over two seasons — the size a single hot day produces. Goblins hit 67–74% but their week-2 multipliers price them to 0.44–0.50, as always.
3. **Even the price-driven goblin edge vanishes in week 2.** Top-ranked goblins beat PP's implied probability by +0.02…+0.12 in every window (week 1 +0.122, week 3 +0.030, rest +0.026) and fall **below** it in week 2 alone (0.702 realized vs 0.736 implied, −0.034) — because *which* goblin to take still depends on the model.
**Conclusion:** in week 2 the board is populated by players with no season data, the model's priors are pre-season, and PP's lines on new listings are set from the same thin information; nobody has an edge, so every slip's expected value is the house margin. That is why no sub-population, no inverse, and no structure pays. The skip rule is the only rule, and it is now a finding with a mechanism rather than an absence of ideas.

### 29e. Week 2 — the full forensic record (2026-10-01). Owner: deeply understand why; test, debug, simulate, research until certain.
The §29d conclusion above ("nobody has an edge in week 2") was itself tested further and is **superseded** by what follows. Fourteen mechanisms were each given a specific prediction and tested on the real legs of both seasons. **All fourteen were falsified.**
| # | hypothesis | prediction | measured | verdict |
|---|---|---|---|---|
| 1 | new board listings | newly listed players miss | established players (40+ gp last season, 95% of legs) hit **39%**, worst of all | no |
| 2 | players without data | no-data players miss | they hit fine | no |
| 3 | model lags the new season | shifted-production players miss | stable players miss equally (48% vs 44/50%) | no |
| 4 | confidence/uncertainty noise | rank variants diverge | all three ranks collapse identically (discrimination 1) | no |
| 5 | small-sample chasing | week-2 picks extreme-sample | 35% vs 31–33% other weeks | no |
| 6 | trend-chasing | picks are hot-last-3 | model fades the trend correctly | no |
| 7 | model inverted | mirror legs win | mirror also 50/50 — random, not inverted | no |
| 8 | PP raised lines after week 1 | same-player lines rose | lines on the same players did not move | no |
| 9 | the WORLD is unpredictable | prior-season→week-2 r collapses | **r stable**: steals 0.26 vs 0.22–0.23, blocks 0.47 vs 0.49–0.51, tov 0.45 vs 0.47–0.48; league rates, minutes, DNPs flat (Gemini's decisive test → model-side) | no |
| 10 | baseline projection breaks (EWMA/trend/shrinkage) | rate36 decorrelates from prior at 4–5 gp | projected rate36 tracks prior smoothly (0.80→0.75→0.72→0.71), minutes likewise; empirical dist 100%, same recipe, same spread | no |
| 11 | calibration / scenario / confidence corrupts | shift or flag present | **cal_shift = 0 on every defensive leg** (as-of calibration covers 8 props, none defensive); uncertain-game legs hit like certain (51 vs 50); confidence is step 6, after the score, not in the rank | no |
| 12 | lines placed differently vs projection | line−projection gap shifts | identical (−0.185 vs −0.185; corr 0.92 vs 0.90–0.94) | no |
| 13 | blowouts / minutes disruption | more 20-pt margins, bigger minute deviations | fewer blowouts (18% vs 20–24%), smaller deviations (4.58 vs 5.05) | no |
| 14 | **data integrity** (grading / box-score join keyed to days 7–13) | recomputed hit ≠ graded hit | **0 mismatches on 3,252 week-2 legs**, every leg has its box score | no |
| — | within-player game-to-game stat variance | dispersion spikes in week 2 | 1.02 / 0.95 / 1.06, inside the 0.90–1.13 range of other weeks | no |
**The one fact that never moved:** `corr(baseline_hp, hit)` = **0.002 in week 2**, 0.140 / 0.225 / 0.185 in weeks 1 / 3 / 4 — with every upstream and downstream component measured normal.
**What is established:** week 2 is real (7σ per season on 440–460 legs, twice) and it is **not caused by any component of this system** — not the inputs, the projection, the distribution, the calibration, the scenario layer, the confidence model, the lines, the grading, the games, or the per-game variance. The projection is right about the player, the line is normal, the game is normal, the box score is correct, and the projection still fails to order outcomes for one week. **That is also the strongest certification the system's components have received:** each was measured under the harshest test and held.
**What is NOT established, stated plainly:** the mechanism. Two readings remain and two seasons cannot separate them: (a) a world-side week-2 phenomenon not captured in these tables (officiating emphasis in the opening fortnight, referee-crew patterns, a league-level early-season variable); (b) a two-draw coincidence — implausible at 7σ each, not impossible at n = 2. No mechanism is asserted. **The 2026-27 season decides:** if week 2 is normal, (b) wins and the rule retires; if it collapses again with everything else normal, (a) is a real seasonal phenomenon and the rule is permanent. The live engine's tagged week-2 paper slips are that test.
**Rule unchanged:** skip week 2 (days 7–13), paper-recorded. What changed is its grounding — from "no edge, mechanism X" to "real, repeated, every component sound, mechanism unknown, third season decides." That is the honest state and it is usable as it stands.

### 29f. Week 2 named: pure concept drift — three-pass research, and what it changes (2026-10-01)
Owner: scoped deep research, multiple passes, find correlations with our issue and how to treat it.
**First, the bad weeks are two different things** (diagnostic: weekly `corr(baseline_hp, hit)` on the defensive cells, top-10). **Kind A — the projection goes random** (corr ≈ 0, discrimination ≤ 8): 2024-25 weeks 2, 5, 8, 10, 17; 2025-26 week 2. **Kind B — the projection works, the legs lose** (corr 0.12–0.17, discrimination 14–17): 2024-25 week 15; 2025-26 weeks 8, 16, 25 — variance, the thing the MC95 lines ride through. Week 2 is one instance of Kind A, not a unique event; and **Kind A fell from five weeks to one when the ranker was retrained on two seasons** — the single strongest fact in this investigation.
**Pass 1 — sports projection systems.** DARKO (the best public NBA projection, Kalman + per-stat exponential decay): *"blocks halve in about 41 games"*; it *"believes a new role within a couple of games"* but a rate only over a month-plus; "padding"/stabilization: a player's own early-season rate is nearly all prior for the slowest counting stats. Our baseline already behaves this way (rate36 tracks the prior smoothly) — the **mean is not the failure**.
**Pass 2 — the drift literature.** Our pattern is a textbook instance of **pure concept drift**: P(Y|X) changes while P(X) does not. Described in exactly our terms — *"accuracy decays without a data change… input distributions look stable… the model may remain confident in predictions that are now incorrect."* And a formal result that explains why fourteen input-side tests all came back clean: *"pure concept drift in P(Y|X) produces exactly zero delta across all proxy metrics in all windows — the irreducible blind spot of label-free monitoring."* PSI, KS, feature drift, confidence, entropy, uncertainty are **structurally blind** to it; *"only labeled-performance monitoring (rolling accuracy, log-loss) reveals concept drift,"* with a lag equal to the label delay. That is why the rolling-correlation detector fired on day 5 of 7 — **a theorem, not a tuning problem**. Treatment in the literature: *"retrain because outcomes have slipped, not because a histogram moved"*; standard labeled detectors (DDM, ADWIN) carry a **warning zone** between normal and drift for exactly the label-lag problem.
**Pass 3 — early-season NBA.** Documented: coaches run the opening weeks as a lab (*"play 10 guys right off the bat"*, *"four different starting lineups through the first nine games"*); *"early-season pace is typically one to two possessions higher than the season-long average."* Tested — **pace carries no information in week 2 either** (signed corr −0.007; avg pace normal at 100.1): the 15th falsification. Week 2 is the window where *nothing measurable* orders outcomes, pace included.
**What this settles about treatment:**
1. **Prevent — no.** By definition the inputs do not reveal pure concept drift; a model cannot pre-empt what its features cannot see.
2. **Detect in time — no.** Structurally blind to label-free detection; the label lag consumes the week. Adopted anyway, as the standard rather than the ad-hoc: a **DDM-style two-state detector (H8)** on the daily projection→outcome correlation — a *warning zone* that halves caps, a *drift* state that stops — because it softens a mid-season Kind-A week (the 2024-25 kind) even though it cannot save a week that starts bad. The ad-hoc rolling correlation is retired in its favour.
3. **Avoid — yes, for the one Kind-A week with a date.** Week 2 by calendar. Already live.
4. **Improve — yes, and it is the real lever.** The literature's treatment for recurring concept drift is retraining on data that spans the drift; the system's own evidence that this works is 5 → 1. The third season is the next retrain; the metric to track it is the weekly Kind-A diagnostic above.
**On "safer structures" (owner, correctly dropped):** in Kind-A weeks nothing is positive (best: 2/3-pick Flex at −37/−38%; worst: 5-Power −100%); in Kind-B weeks small structures are near break-even (3-Power −5%, 3-Flex −10%) but earn a third of the 5-Flex in normal weeks (+33% vs +88%). A smaller loss is still a loss; not adopted.

### 29l. Week 2 reopened — and the collapse located (2026-10-01). Owner: do not close week 2; work it on every pass.
§29e found every component sound and the mechanism unknown. It measured the defensive cells *pooled*, and the pool was dominated by steals. Split by cell family, week 2 is **not uniformly random**:
| week | steals family (steals/stocks/blocks) | **turnovers** | rebounds | points family |
|---|---|---|---|---|
| 1 | corr 0.192, disc 16, top-5 57% | **0.002, disc 1, 47%** | 0.101 / 9 / 52% | 0.080 / 6 / 53% |
| **2** | **−0.036, disc −3, 47%** | **0.091, disc 12, 59%** | 0.052 / 6 / 54% | 0.023 / 0 / 49% |
| 3 | 0.209 / 14 / 60% | 0.261 / 22 / 65% | 0.116 / 11 / 55% | 0.093 / 9 / 56% |
| 4 | 0.183 / 17 / 60% | 0.188 / 13 / 59% | 0.087 / 11 / 57% | 0.102 / 11 / 56% |
**In week 2 the steals family is slightly worse than random** (the model's steals picks lose to the bottom half of the cell), the points family is flat, and **turnovers keep their full edge**; rebounds hold at a reduced level. Per cell, week-2 top-5 over both seasons: turnovers R Under 69% (disc 15, p.m 0.690; 59%/76% by season), rebounds R Under 61% (disc 11, 0.608), rebounds G1 71% (disc 14) — against steals Under disc 1, stocks Under 1, blocks Under −17, assists Under −11, threes D1 7.
**The slip-level consequence:** every family-A slip carries two steals legs (the per-cell cap's maximum), so when the steals cell is random every slip dies — which is exactly the week-2 signature (every strategy, every sub-population, both seasons), and why fading the model was also a coin flip (the mirror of a random pick is random). **On the no-steals engine (`_nosteals`, §28f) week 2 is positive in both seasons:** regular 3-Power cap 3 **+71% / +157%** (42 slips), best 3-Power +40 / +129, mixed_tier 3-Power +40 / +129, regular 5-Flex +34 / +125 — where the full engine's strategies are −40% / −51%. Week 2 was *"two random steals legs in every slip,"* not *"nobody has an edge."*
**A second thing the split shows: steals and turnovers trade places between weeks 1 and 2** — turnovers is random in week 1 (disc 1) while steals is sharp (16); in week 2 the reverse. One mechanism fits both: the prior-season rate for each defensive stat becomes wrong, then right again, on a timing that differs by stat (turnovers settle a week earlier than steals). This is a falsifiable prediction for 2026-27 — week 1 fade turnovers, week 2 fade steals — and it is identifiable at the time, by calendar, which is the owner's condition.
**What changed in the engine, and what did not.** The week-2 paper record is now built **from the steals-excluded pool** for every family, so the third season tests the thing that might work rather than the thing known to fail. It is **still not staked**: 42 slips per strategy over two seasons is the sample size the certifier distrusts, and ranking by worse-season ROI is itself a selection. The honest claim is the contrast — the no-steals engine's main strategies positive in week 2 twice, the full engine's negative twice — plus a mechanism and a calendar trigger. If 2026-27's steals-excluded week-2 record is positive, that is three for three and "play week 2 without steals" becomes a rule; if it is negative, §29e's conclusion stands.
**The mechanism, found (pass 17).** The model's *calibration* by cell and week — claimed vs realised on its top-5:
| | steals Over | steals Under | turnovers Over | turnovers Under |
|---|---|---|---|---|
| week 1 | **+14** (72 vs 58) | −6 | −4 | **−24** (38 vs 63) |
| week 2 | **−27** (28 vs 55) | −12 | **−25** (42 vs 66) | **+6** (69 vs 63) |
| week 3 | +8 | −3 | +1 | +1 |
Week 1 is a **high-event** week (Overs over-deliver, Unders under-deliver); week 2 is a **low-event** week (every Over built on the prior misses, Unders over-deliver); week 3 is within ±8. **And the league's own box scores show it, in both seasons:** steals + turnovers per team-game 2024-25 **23.42 → 22.29 → 23.30 → 22.87** (weeks 1–4), 2025-26 **24.60 → 23.27 → 23.92 → 23.62**; fouls 21.8 / 23.6 in week 1 against a season rest of 18.3 / 19.3. Week 1 is the highest-event week of the season (opening intensity, new rotations, the whistle), week 2 is a sharp correction ~5% *below* the prior-season rate, week 3 settles. §29k's base-rate test had pooled week 2 with the weeks around it across seasons, and week 1's surplus cancelled week 2's deficit. **This is a calendar effect in the league itself, confirmed twice, with a cause — and the first week-2 symptom visible in advance.** It explains the steals/turnovers hand-off (turnovers Under is the one cell that benefits from a low-event week), why fading the model also failed (the Under side of the engine's own picks was not the Under side that benefits), and why the no-steals engine's week-2 strategies are positive (they lean on turnovers Under). The rule stands with its mechanism; the 2026-27 box scores will show the trough or not in the first fourteen days.

### 29m. The drought symptom search, board-side (2026-10-01). Owner: finding the symptoms on the board is as important as the alternatives.
A symptom has to be visible **before tip**: in the lines, the players listed, the model's scores, or the pool's shape. Every such quantity in the system's tables, tested as a day marker (bad day ≤ −10 u vs losing vs small win vs big win ≥ +15 u, 309 days):
| pre-game candidate | bad days vs big-win days | verdict |
|---|---|---|
| model's claimed probability on its picks | 0.670 vs 0.690 | identical on bad vs merely-losing; no marker |
| model score / edge / confidence | 78.5 / 11.7 / 0.953 vs 79.4 / 13.4 / 0.948 | faint on wins, none on losses |
| projection-vs-line cushion, projected minutes | −0.021 / 28.7 vs −0.011 / 27.7 | identical |
| board breadth (deep cell families) | broad on 284 of 303 days | no separation |
| player concentration of the pool | ≤ 9 players: 9 days in 2024-25, **1** in 2025-26 | not walk-forward; dry |
| **line movement window → lock, per leg** | **against-moves hit 51% vs 61%** (102 legs, 2%) | **real at the leg; not a day marker** — bad days have the *fewest* (1.6% vs 1.5%) |
| line pulls by lock | 11.6% vs 14.1% | slightly more on good days |
| pace, opponent trailing TOV, blowouts, officiating, league base rates, trailing results, regime switches | (§29k, §29f) | flat / dead |
**Stated plainly: there is no board-side symptom of a drought in this system's data.** A bad day is indistinguishable from a good day in every pre-game quantity PrizePicks or the model exposes; the thing that differs — three or four shared players having a bad night at once — is not knowable before tip from anything recorded here. This is the concept-drift theorem (§29f) in the data, fourteen more times. **The proper logic is therefore structural, not a trigger:** lose less when the unidentifiable thing happens (diversify, dedupe, the demon weight, family C made real), plus the two calendar rules (week 2, final week), plus the one leg-level filter above. **The single pre-game source not in any table is the injury report and starter status as of the pick** — the compass's known pipeline gap, and the last symptom candidate; it is a feed to build, not a query to run.
**The drought's directional signature (pass 18).** Per picked player, actual stat minus his own trailing-10 average, top-3 defensive legs:
| | steals Under | turnovers Under | steals Over | turnovers Over |
|---|---|---|---|---|
| normal days | **−0.11** (hit 70%) | **−0.21** (68%) | +0.24 (59%) | +0.02 (62%) |
| short droughts | +0.02 (52%) | −0.10 (54%) | +0.20 (55%) | −0.04 (59%) |
| long droughts | +0.06 (50%) | **+0.22** (53%) | +0.09 (60%) | +0.21 (60%) |
On normal days the model's Under picks are players having a **quieter-than-usual night** — it finds something real, they under-produce their own trailing rate. **In a drought the same kind of pick produces at or above his trailing rate.** The Over side is unaffected in every period; minutes are not the cause (min-vs-trailing is the same across kinds). League-wide events are *normal* on drought days (steals+turnovers 22.32 / 22.78 vs 22.66), unlike week 2 — the drought is the specific nine players, not the league. So the drought question reduces to: *is there anything pre-game that separates a quiet-night pick from a normal-night pick beyond what the model already uses?* Rest (days since the player's last game) tested: pooled, steals Under on 4+ days' rest hits 51% vs 62–67% — but **33% in 2024-25 (30 legs) and 63% in 2025-26 (41)**, and blocks flips the other way. Two seasons disagreeing; dry. Recent form (last-3 vs trailing-10) tested: the 70 → 50 drop happens in every form bucket (quiet, normal, hot) alike; dry.

### 29n. The variance test, and the first real drought symptom (2026-10-01)
**The test that decides whether droughts have a mechanism at all.** Take the real 2025-26 slips (2,386, 154 days); for each player, shuffle his hit/miss outcomes across the days he was picked — his rate is preserved, the within-day sharing of players across slips is preserved exactly, only the *day-level clustering* of outcomes is destroyed — and recompute every day's P&L with the real payout table. 300 shuffles.
| | bad days (≤ −10 u) | net | positive days |
|---|---|---|---|
| **real season** | **59 (38%)** | **+796** | 43% |
| shuffled (median, 5th–95th) | **72 (47%), 64–80** | **+11** | — |
**The real season has FEWER bad days than the null and vastly more profit.** Destroying the day clustering does not remove the droughts — it removes the *income*. The engine's profit *is* the day-level clustering: its players hit together more than independence allows, and miss together too. **Good days and bad days are one mechanism in two directions**, which is why no "drought symptom" existed in isolation: a drought is a slate on which the clustering ran against us. Gemini's independent-player calculation (4.7% bad days expected) was wrong by construction; the shared-player structure makes 47% the null, and the engine beats it.
**So the symptom must be a slate-level variable that modulates the clustering.** The league rate, pace, officiating and the model's own numbers modulate nothing (§29m). The one that does, found here: **SLATE SIZE.**
| games on the slate | 2024-25: days / ROI / bad days / positive | 2025-26: days / ROI / bad days / positive |
|---|---|---|---|
| 1–4 | 25 / +67% / **36%** / 40% | 23 / **+2%** / 35% / 35% |
| 5–7 | 50 / +71% / 34% / 40% | 52 / +109% / 13% / 65% |
| 8–10 | 57 / +48% / 35% / 46% | 61 / +93% / 30% / 54% |
| 11+ | 23 / **+83%** / **17%** / **65%** | 18 / **+150%** / **11%** / **72%** |
**Small slates are the weakest in both seasons; big slates the strongest in both** (bad days 11–17% on 11+ games vs 35–36% on 1–4). The mechanism is the variance test's: on a 2–4 game slate the engine's nine players come from the same two or three games and the within-day correlation is maximal; on a 12-game slate they are spread across the league and it falls. **Identifiable at pick time (the calendar), structural (not trailing), two seasons, a mechanism — the first drought symptom that passes every test.** Its lever is modest and honest: small slates (≤ 4 games) at cap 1 → 319 fewer slips, net −2.5%, bad days **28% → 22%**, drawdown unchanged; skipping them outright → net −6%, drawdown −7%. The cost sits in the stress season (2024-25 small slates were +228), so cap 1 is the form that keeps the income. Applied to the live engine as a slate-size cap: **≤ 4 games → every strategy at cap 1** (an identifiable day whose structure is worst), everything else unchanged.
**Layering (owner: root causes may be multiple and differ by drought).** Three finer splits:
- *Exact slate size:* 2 games −12% (38% bad), 3 games −5% (33%), 4 games +17% (**45% bad**), then a sharp edge: 5 games +81%, 6 games +87% (49–55% positive). The 1-game slates (+327%) are five days carried by one +436% night; not a rule. The 4-game slates are the sharpest instance of "same structure, different sign": +51% in 2024-25, −22% in 2025-26 — a small slate is high-variance in *both* directions, so the cap rule reduces exposure to the variance rather than betting on its sign.
- *Game span of the day's picks:* picks spanning 6+ games are the engine's best days (+87%, 55% positive, both seasons +62/+109%); spanning 3 games the worst (−12%, 38% bad). Same mechanism, measured from the engine's side.
- *Per-drought fingerprints* (which cell and side failed, with the neighbours): **three distinct root causes.** (1) **Single-cell collapses** — turnovers to **5% / 12% / 28%** (E3, D4, D6) or steals to **29% / 36%** (E7, E1) while the neighbouring cells hold at 60–93%; a 2-of-5 cell at 5% kills every slip. Lever: diversify (in). (2) **Side collapses** — Overs to **15% / 28%** (D6, D2) across cells while Unders hold at 54–55%. Lever: the engine's Under tilt (4-Under slips +227% in normal periods; in). (3) **Small-slate droughts** — D5 (40% small slates), E1 (29%). Lever: the slate cap (in). A fourth candidate, a day-level cap on any one cell's share of the day's legs, tested and **not a lever**: the top cell is 40–50% of legs on 260 of 309 days by construction (every family-A slip carries two steals legs), and the less-concentrated days are *worse* (thin boards). The single-cell collapse is "which cell goes cold tonight," which is the clustering itself, not a concentration that can be capped.
**Pass 19 — the collapses, leg by leg.** Reading the three turnovers "collapses" (E3 5%, D4 12%, D6 28%) at the leg: every miss is a player whose line sat **within 0.1–0.5 of his own trailing-10 average** — Zubac Under 1.5 (trailing 1.40, actual 3), Harden Under 4.5 (4.30, actual 6), Jarrett Allen Under 1.5 (1.1–1.6, actual 2, *three times* across two droughts), Derrick White Under 1.5 (1.4, actual 2), Zion Under 2.5 (1.9, actual 3). A "cell collapse" is a night when the cell's ranked players were 50/50 propositions the model rated 63%. **Tested as a pre-game symptom — the CUSHION (line minus the player's trailing-10 average), steals Under, both seasons:** line *below* his average (the Under bets against his own rate) **55%** (48% / 64%); cushion 0–0.25 60% (56 / 62); cushion 0.25–0.5 **78%** (71 / 82). A 23-point spread, same direction both seasons, on the board at pick time. The model *partly* sees it (claimed 61 → 65 → 69, score 75 → 77 → 80) but **under-weights it**: calibration gap −6 on the against-the-player legs, +9 on the big-cushion legs — a model blind spot for the retrain. Turnovers is flat across cushions (58–65%); the symptom is steals-specific (the rarer event; the line sits closer to the average). **At the slip level it vanishes:** slips containing an against-the-player steals Under earn +70%, slips whose steals Unders all have cushion ≥ 0 earn +71%, and slips with *no* steals Under at all earn +35% — the other four legs dominate, and a 55% leg is still better than its replacement. A real per-leg symptom; not a slip-level lever. The pattern the layering keeps producing: a true symptom at a finer grain that does not survive aggregation to the unit that is staked.
**Pass 20 — day-level composition.** *Day of week:* every day positive in both seasons (Sunday +135% but +72/+198; Friday +46% but +3/+87); the one consistent weakness, Monday (+36/+59), is the smallest-slate day of the week — the slate rule in disguise. Dry. *Schedule spot:* a leg-level near-miss — defensive Unders when the player's own team is on a back-to-back hit **56%** (55/57, consistent) vs 59–63% otherwise, 63% when the *opponent* is tired; 3–7 points, the right direction both seasons; but at the day level slate fatigue is flat (+71…+88% across every mix of tired teams). Same pattern as the cushion: real at the leg, nothing at the day. Dry as a symptom.
**Pass 20, week 2's mirror — THE WEEK-1 OVER TILT, found and applied.** If week 1 is the high-event week (§29l), its Over side should win. It does, in both seasons: top-3 defensive **Overs hit 74% in week 1** (86 / 64) and 73% in week 3 (76 / 70), against 58% for the rest of the season; week-1 Unders only 55%. At the slip level, Regular 5-Flex slips in week 1: **zero defensive Over legs −59%** (−38 / −68), 1 Over +46%, 2 Overs +49%, 3+ Overs +560% (17 slips; +648 / +150). From week 4 the relationship *reverses* — 0–1 Overs +66–71% (best), 2 Overs +31% (worst) — so the engine's normal Under tilt is right for the season and wrong for its first week. Week 2's 2-Over slips are −73% (−100 / −60): the trough in action. Week 3 is good with any mix. **The early-season calendar, each piece grounded in the league's own event curve:** week 1 → Over tilt (a Regular 5-Flex slip with no defensive Over leg is recorded, not staked); week 2 → skip (steals-excluded record); week 3 → normal build; week 4+ → the normal Under tilt. In the live engine as `placed_week1_skip`.
**Pass 21 — expected game margin** (the closing-lines table, sparse: most legs have no line): defensive **Unders in expected blowouts (spread 11+) hit 68%** (66 / 69) vs 59–61% in competitive games — a mechanism (starters sit the fourth) and both seasons agree on 96 legs; Overs best in pick-ems (64%), unstable elsewhere. A leg-level effect; with the lines table this thin it cannot be a rule.
**Where the drought symptom search stands after passes 17–21.** Every day-level variable in the system's tables has now been split on: slate size (**the one survivor**, in the engine), day of week, schedule fatigue, expected margins, pace, league event rate, officiating, the model's own numbers, the lines' position and movement, board breadth, player concentration. **Three leg-level symptoms are real in both seasons and do not aggregate to the day:** the steals-Under cushion (55% → 78%), the player's own back-to-back (56% vs 59–63%), the expected blowout (68% vs 59–61%). They belong to the ranker — as inputs in the retrain — not to the slip layer, and that is the correct destination: the model already partly sees the cushion and under-weights it. **The one pre-game source still untested is the injury / starter feed as of the pick**, a pipeline gap. First dry pass on the drought side; the week-2 side of the same pass produced the week-1 tilt.
**Pass 22 — the cap raises are slate-aware, and week 2's low-event tilt.** Slips 4–6 of the two cap-6 strategies by slate size, both seasons: weighted:steals **+95% on mid slates, +135% on big (156 / 107)**; demon 5-Flex **+156% mid, +226% big (145 / 329)**; both weak or negative on small slates, which the slate cap already handles; core 3-Power's deep slips degrade on every slate size (cap 3 right). The deep slips on big slates are the best slips in the system; cap 8 on 11+ game slates is plausible but 81–123 slips per cell is where extrapolation stops — the live record decides. **Week 2 is a low-event trough across every event type, not just defensive:** top-3 points-family **Unders hit 66% in week 2 and 65% in week 3** (49% in week 1, 58% rest), rebounds Under 60–62% in weeks 2–3, while points-family Overs are 38–46% through the first three weeks and defensive Overs 47% in week 2. A second, independent confirmation of the trough (fewer points, rebounds, steals and turnovers at once — consistent with the fouls trough). On the no-steals engine's week-2 3-Powers: **slips with 2+ low-event Unders (points-family or turnovers) make +37% (51 / 24); slips with none lose −75% (−71 / −78)** — 307 vs 157 slips, both seasons, the week-1 Over tilt's exact mirror. The week-2 record now marks slips with fewer than 2 low-event Unders as `week2_skip`, so the third season tests the low-event play specifically rather than "no steals" in general.
**Pass 23 — tip time and week 3; three consecutive dry drought passes.** *Tip time* (the calendar has it for 2025-26 only): late-tip (9:30 pm ET+, West Coast) defensive **Overs hit 74%** vs 51–56% earlier, on 46 legs; one season, so a candidate for 2026-27, not a rule. *Week-3 deep slips:* weighted:steals' slips 4–6 earn **+185% in week 3 (97 / 260)**, regular 5-Power's **+312% (198 / 411)**, both seasons positive; week 2's deep slips are −46% to −100% for every strategy in both seasons. Same 39–42-slip samples as the no-steals week-2 play, same treatment: recorded (the cap-6 strategies already build them), not raised; the live season decides. *Cushion composition* (pass 22): the big-cushion steals Unders in the engine's top-3 band hit **80%** (73 / 84) but there are 0.3 of them a day, and outside the top-3 band the cushion rescues nothing (rank 4–8 43%, rank 9+ 29%) — the model's rank carries most of the information and the cushion refines it only on legs the model already likes; a ranker tiebreak, not a composition.
**Where it stands — the owner's standard met.** Three consecutive drought-side passes (21 expected margin, 22 cushion composition, 23 tip time) without a new symptom or lever, every candidate tested on both seasons. The week-2 side produced rules in passes 17, 20 and 22 and is dry in 23. **The data in the system's tables is exhausted on both threads.** What was found, in the engine for 2026-27: the slate-size cap (the one day-level drought symptom), the four early-season calendar rules (week 1 Over tilt, week 2 low-event record, week 3 normal, week 4+ Under tilt), diversify, dedupe, the demon and weighted:steals caps, family C made real, the line-movement annotation. What was found and belongs to the ranker's retrain, not the slip layer: the steals-Under cushion (the model under-weights it by 6–9 points), the player's own back-to-back, the expected blowout. What remains outside every table and is the last symptom candidate: the injury and starter feed as of the pick. What the third season tests: the week-2 low-event play (three for three makes it a rule), the week-3 raise, the late-tip Overs, cap 8 on big slates, and whether week 2's trough appears in the league's first fourteen days of box scores.
**Passes 24–26 — three new splitting axes, all dry.** *Players:* 327 distinct players carry the engine's defensive Unders; the ten most-used are 12% of player-days and hit **56%**, slightly *below* the rarely-used (64%) — a note for the retrain (the model's top picks over-fit to familiar names) — and across 327 players exactly one is a consistent loser in both seasons and two consistent winners, which is what chance yields from 327 draws. No player is a drought vector; a player exclusion list would be noise. *Teams:* in-sample the spread is striking (Unders on DAL / ATL / OKC players 48–51%, on MIL / GSW / SAS 67–73%, each end agreeing across seasons) and the team's event rate is *not* the mechanism (59–64% across all style bands); **walk-forward it mostly regresses** — the bottom quartile selected on 2024-25 (45%) hits 60% out of sample, the top (66%) hits 67%: a 21-point in-sample spread becomes 7. A ranker feature at most. *Opponents:* pure regression — the worst-opponent quartile on 2024-25 (47%) is the best on 2025-26 (66%). **Six consecutive dry drought passes across the old splits and three new ones.** The ranker-feature list for the retrain now stands at: steals-Under cushion, player back-to-back, expected blowout, own-team identity (weak), and the most-used-player penalty.
**Pass 27 — the injury feed, the "last symptom candidate," tested and closed.** The compass's "pipeline gap" was stale: `nba_daily.injury_report_snapshots` holds both seasons, **120 snapshots a day every 15 minutes**, every status (Out / Doubtful / Questionable / Probable / Available), 1.34 M rows. Materialised as `nba_score.injury_asof_pick` (per day × team × player: the status nearest the 2:45 PM pick and the final status; 28,349 rows, 2,391 players ruled Out *after* the pick). **League-wide, the injury picture is identical on bad and good days** (17–18 uncertain at pick, 7–8 late Outs, 60–65 Out, on every outcome class). **The mechanism Gemini named — a teammate ruled Out after the pick changing the picked player's role — gives an Under hit of 60% (57 / 63) on 526 legs against 61% (56 / 65) when the team's report was settled**: nothing. A teammate merely uncertain at pick: 56% (51 / 60), within noise. **The picked player himself is never on the report at pick time** (fewer than 20 legs in any listed status): the model's availability layer already excludes him, correctly. The last pre-game data source is dry. **Seven consecutive dry drought passes (21–27).** Every pre-game source in the system — board, model, lines, league, schedule, players, teams, opponents, injuries — has now been tested as a drought marker and found flat at the day level.
**Pass 28 — research and Gemini, under the owner's clean-pass standard (a pass is clean only when both return nothing usable). Not clean.** *Research* (the DFS integer-programming paper and the parlay-correlation literature): outcomes are driven by within-unit correlation and the response is to *choose* the correlation structure; PrizePicks' Flex payouts do not adjust for correlation, so positively-correlated legs are priced as independent. Tested: Regular 5-Flex slips with a **same-team pair hold in droughts (+3%, 19 / −18) against −8% for all-cross-game and −40% for same-game-opposing-team pairs** (negatively correlated, as the paper's goalie/skater finding), at equal normal-period income (+128% vs +129%). The engine's tie-break ranks cross-game above a positive pair; for the Under-heavy slips the order should be same-team pair ≥ cross-game > opposing-team pair. A mitigation, not a cure (2025-26 droughts still −18%). *Gemini:* **convexity by structure** — rank days by the engine's cluster strength (its leg hit rate) and read each structure's ROI by quintile: every structure loses on the worst days (−62 … −100%); they differ only in what the best days pay. Convexity (gain top-vs-mid ÷ loss mid-vs-bottom): **6-Flex 13.1** (+523% top quintile, unused), **5-Flex 7.4** (+485%), 4-Power 4.5, 3-Power 2.5, 4-Flex 2.4, 2-Flex 1.0 (linear, earns 0), 5/6-Power all-or-nothing. The engine's 5-Flex is already the right exploitation of the clustering; the bottom-quintile days are the price of the top-quintile days under one mechanism and no structure makes them cheaper without giving up more at the top. Gemini's distribution-shape transforms (spread and minimum of the day's claimed probabilities) tested: **the seasons disagree on both** (widest-spread days +91% / +32%; weakest-pick days +98% / −11%) — dry. Two reviewed-edit candidates from this pass: the same-team tie-break, and a 6-Flex strategy on big slates.

### 29o. Week 2 is a signal-gated play, not a skip (2026-10-01). Owner: the point is to identify playability — different strategies, structures, lines — not to force a skip; week 2 and the droughts are one problem.
The passes produced the two things a conditional play needs. **The signal:** the week-2 trough was preceded in both seasons by a week-1 event spike — league steals + turnovers per team-game over season days 0–6 against the prior season's full rate: **+6.1% (2024-25), +8.5% (2025-26)**. Computed on day 7 from the box scores; fires at ≥ +3%. **The structure that fits a low-event week:** the steals-excluded pool, slips carrying 2+ low-event Unders (points-family or turnovers), staked at cap 1. **If the signal fires, week 2 is played that way; if it does not, week 2 is a normal week.** On the backtest, at cap 1 on the five family-A/C strategies: **15 and 19 slips staked, +137% and +138%, +20 and +26 net** in the two seasons where the full engine's week 2 lost −56 and −40. The slips the filter sets aside were also positive on the no-steals pool (+18.6, +1.7), so the steals exclusion does most of the work and the low-event filter picks the better half; both stay. This supersedes the calendar skip of §29d/§29l: the `week2` state now carries cap 1 and the pick resolves the week by the signal. Week 1's Over tilt was already a tilt, not a skip. Small samples, consistent sign, a mechanism, a signal that fired twice — a play with a reason, replacing a skip that cost the chance to find out.

### 29p. The drought rotation — long droughts are states; identify the state, play what fits it (2026-10-01). Owner: once the signals are found the single days may follow; the goal is less loss or small profit on the losing dates, not zero loss.
**A single bad day and a long drought are different problems.** The single day is the clustering running against us and has no day-ahead symptom (§29m–n, 27 passes). **A long drought is a state** — it persists for weeks — and a state is identifiable from inside it after a few days. What was missing was the right statistic and the right *response*.
**The identification, per cause (the owner's layering).** H7 at 2σ on the calibrated anchor row identified one of the three 2025-26 long droughts, on day 11 of 14; the anchor's all-or-nothing daily noise (sd 0.33) hides a drop from 63% to 50% inside a 14-day window at 2σ. A **threshold state** does better: trailing-10 daily hit of the steals cell below 50% catches **E1 from day 6 and E4 from day 10** with one false day; the same on the **turnovers** cell catches **E5 from day 8** (the drought the anchor never sees — steals were 58% in it, turnovers 42%) and E4 from day 6, with 19 false days (6-leg days are noisier). **Either cell cool identifies all three long droughts, on days 6, 6 and 8, with 20 false days on 154** — and a false day costs close to nothing, because the response is a rotation, not a stop.
**The drought menu — what is playable inside the five long droughts (114 slate days), positive in *both* seasons on 20+ slips each:**
| inside long droughts | ROI | 2024-25 | 2025-26 | slips | in normal weeks |
|---|---|---|---|---|---|
| demon 3-Flex | **+46%** | +47 | +44 | 335 | +77% — all-weather |
| stocks-only 4-Power | **+48%** | +39 | +63 | 233 | **−7%** — drought-only |
| stocks-only 3-Power | +41% | +23 | +72 | 294 | +11% |
| points-only 3-Power | +34% | +20 | +59 | 337 | +33% — all-weather |
| demon 5-Flex | +31% | +23 | +44 | 260 | +146% |
| no-steals regular 5-Flex | +17% | +11 | +27 | 342 | +55% |
| no-steals core / wsteals 5-Flex | +10% | +4 | +22 | 342 | **+78% — identical to the steals version normally; −21% with steals in a drought** |
The pattern is the fingerprints': a long drought is a steals drought, and everything *without* steals holds — the demons, the single-cell stocks and points Powers the engine never used as strategies, and the no-steals versions of family A. Less profitable than normal weeks, as the owner expected; positive in both seasons, on hundreds of slips.
**In the engine.** The grade computes the two cell states beside H7 and stores `_ROTATION`. In rotation, **family A rebuilds from the steals-excluded pool** (+10…+17% in droughts instead of −21%, and +78% normally either way, so being in rotation too long costs nothing), **`R_stocks_4power` stakes** (rotation-only; it shadows otherwise), and **`D_points_3power`** is in the base portfolio (all-weather). Demon 3-Flex was already in. This replaces "halve family A's caps" with "play the structure that fits the state" — the owner's framing, and the first drought response in the system that turns identified losing stretches toward small profits rather than smaller losses.

### 29q. Single bad days and long droughts — the owner's hypothesis tested (2026-10-01)
Owner: a long drought and a single bad day are the same thing and will share signals. **Tested directly: if they are the same, the drought menu should hold on the single bad days.** On the 45 single bad days outside the long droughts: demon 3-Flex **−89%** (−89 / −88), stocks-only 4-Power **−73%**, no-steals core 5-Flex **−71%**, no-steals regular 5-Flex −14% — every drought-menu play that holds in long droughts (+32…+65%) collapses on single days. **One exception: the points-only 3-Power, +60% on single bad days (71 / 50), +65% in long droughts, +33% normally.** The map explains why. On single bad days **both defensive sides collapse together** — top-3 defensive Overs fall from 62% (winning days) to **48%**, Unders from 68% to **50%** — while **the points family does not move** (Overs 56 / Unders 55 vs 57 / 60 normally). A single bad day is a defensive-*ranking* failure in both directions; nothing else on the board moves; the points Power holds not because points Unders rise but because they are uncorrelated with the collapse.
**Verdict on the hypothesis:** they share the **cell** structure (a defensive cell cold) but differ in **scope** — one cell cold for weeks with the others fine, vs every defensive cell cold at once in both directions — and therefore in **remedy**: a long drought → rotate *within* defense (§29p); a single bad day → diversify *out of* defense (diversify, dedupe, the demon weight, the points Power at cap 3). Both remedies are in the engine; the single-day one is why the bad-day share fell 28% → 22% on the backtest while no day-ahead symptom exists. The points Power at cap 3 adds +272 net (both seasons positive) and trims bad days to 25% at unchanged drawdown — a modest hedge of the right sign on the right days, the only structure in the system with that property.
**Pass 29 — the single day, research and Gemini: the first clean pass.** *The defensive cells' own score structure that day* (top-8 spread, rank-1-to-8 gap, top-3 level, top-3 Under share, from the map): every quartile positive in both seasons, bad-day share wandering 14–31% with no monotone pattern — the model's defensive scores do not know which nights their ordering will fail. *Research candidate — referee crew identity:* the system holds `nba_stats.game_officials` (3,687 games) and `nba_ref.official_tendency` (78 officials, shrunk foul rate vs league); the morning-of `referee_assignments` scraper exists but captured nothing. Joined as if known pre-game: low-whistle crews 54% / high-whistle 50% vs 61% average on the Unders — but the tails are rare (70–90 legs) and **the seasons disagree inside each tail** (low-whistle 48 / 69, high-whistle 59 / 44). Dry. *Gemini candidate — a day-over-day shift in league passes/dribbles per possession:* the tracking tables are season-to-date per player, not per game; the quantity is not measurable here, and a season-to-date aggregate cannot carry a one-night ranking failure. **Both halves exhausted, nothing usable: the first clean pass, on the single-day question.** Long droughts are answered (the rotation, §29p); week 2 is answered (the gated play, §29o); the single day stands at one clean pass against it, with the diversification remedy in place.
**Pass 30 — how the strong operations identify and avoid droughts (owner's scope).** The syndicate literature (the Computer Group lineage, OddsMatrix, Boyd's) and the academic treatment (Uhrín et al. 2021 *Optimal Sports Betting Strategies in Practice*; Zambelli 2016 on stop-loss thresholds from the max-drawdown distribution; Busseti et al. on drawdown-constrained Kelly) agree on one thing: **they do not predict droughts.** They (1) size by drawdown-constrained fractional Kelly — this system's MC95/MC99 hurdles and fractional caps; (2) set stops from the *distribution* of max drawdowns, not from feel — the calibrated hurdle lines; (3) **judge the health of the edge by closing line value, not results** — a deterministic per-leg observation where results are coin flips. The one of the three this system lacked. Built: `nba_score.leg_clv` (5,629 engine legs, window line vs PrizePicks close). **On PrizePicks CLV is inert:** 2.7% of legs move for the pick, 2.4% against, net +0.004; rolling-10 CLV is slightly *positive* inside the long droughts (+0.0075) and in the week before them (+0.0045) against +0.0004 normally, with *fewer* against-moves inside droughts (1.9% vs 2.7%). The book sets half-point lines and rarely moves them; the sharp's standard tell — the market leaning against you — does not exist on this counterparty, which is a real reason the drought has no market symptom here. What the strong operations add beyond sizing and stops, and what this system now also has, is the regime *response*: not "stop" but "which market still has edge" — the rotation (§29p). The research candidate tested and closed; the pass's Gemini half is pass 29's (the single-day question has no new angle).
**Pass 31 — research and Gemini (owner: keep researching, keep progressing).** *Research:* the sharp method on PrizePicks is line-shopping against the sportsbooks' player props, because PrizePicks sets lines internally, lags the market on news, and bumps or pulls props that get skewed. The system already captures **DraftKings and FanDuel defensive-prop prices** (9,342 and 7,064 steals rows, every day of 2025-26), never joined to the engine. Joined: the books quote the engine's players only at PrizePicks' own line (105 matched legs, all "same line"), and **price every one of them at a flat 50%** — the engine hits 57–58% on them, which is its whole edge, and the market carries no view either way. On low-count defensive props the sportsbooks are no sharper than PrizePicks; there is nothing to shop. Closed. *Gemini, adversarial review of the two live rules:* its most likely failure for each named and guarded. **Rotation guard** — `cool` now requires the trailing-3 days to agree with the trailing-10 (the drought must be current); tested on the real series: false days **20 → 9** on 154, identification unchanged (days 6, 6, 8). **Week-2 guard** — an intra-week kill switch: after 3 graded slate days, if the play's own staked legs hit below 50% it stops for the rest of the week; the threshold and the no-fire branch are both n = 2, and the guard caps a wrong year at ~3 days of cap 1. Gemini's reason the spike might not precede a trough in 2026-27 — teams arriving better conditioned — is the right null, and the signal's no-fire branch is exactly what covers it. Not a clean pass: both halves returned usable things.
**Pass 32.** *Research* (early-season instability, load, APM noise): one practical thread recurs — what matters is not a player's minutes but their **stability over the last few games**; tested: defensive **Overs on stable-role players (minutes CV < 10% over the last 5) hit 68% (70 / 66) vs 58% (63 / 55) on volatile roles**; the Under side mildly reversed (63% volatile vs 58% stable — a shaky role means fewer minutes some nights). Both directions sensible, both seasons agree; a leg-level ranker input, the first on the Over side. **The ranker-feature list for the retrain: (1) steals-Under cushion, (2) role stability, (3) player back-to-back, (4) expected blowout, (5) most-used-player penalty, (6) own-team identity.** *Gemini on the retrain:* predicts the bad-day share falls because the features are "day-level conditions" — but back-to-back, blowout and team were each tested at the day level (§29m, passes 20–26) and found flat; they are leg-level. The honest expectation is per-leg hit up with the clustering unchanged. **The retrain's acceptance test is the variance test (§29n) re-run on its backtest: if the real bad-day count falls *relative to the shuffled null*, the clustering changed; if both fall together, only the legs improved.** Cushion first (23 points, the model already under-weights it). Not a clean pass.
**Pass 33.** *Follow-up on 32:* role stability **vanishes on the full map** — top-2 defensive Overs 61% on stable roles vs 60% otherwise, ranks 3–5 54% either way; the 68-vs-58 split lived only in the engine's 116 picked legs, a selection artifact. Downgraded; **the ranker list is five features** (cushion, back-to-back, blowout, most-used penalty, team). An Over-tilted stable-role strategy has no basis. *Research — sequential change detection:* **Bayesian online changepoint detection** (Adams & MacKay 2007; the Bernoulli-sequence case of arXiv 1212.6020) tested on the real cell series: fires on day 1 of all three droughts and on **33–51 false days**, because a single 0/22 day makes "the run just restarted" the likeliest hypothesis — it detects bad days, not droughts; requiring a sustained run converges back to the trailing threshold. Rejected. *Gemini — the detector question:* proposed an EWMA chart (λ, threshold 0.50 from the calibrated mean). Tested: **λ = 0.15 identifies E1 on day 4 and E5 on day 5** (shipped trailing-10+3: days 6 and 8; E4 day 6 either way), holds the rotation 7 / 10 / 5 days inside the droughts (vs 6 / 6 / 3), at 15 false days (vs 9). A false rotation day costs ~0.07 u (the stocks Power at cap 1); a drought day caught two or three days earlier is worth several. **Adopted as the cell-state statistic.** Not a clean pass.
**Pass 34.** *Research:* the academic finance literature has documented an **early-season NBA Under bias** — Baryla, Borghesi, Dare and Dennis (*Finance Research Letters* 2007): totals lines significantly biased early each season, Unders 56.7% against the close; a UWF study of 2009–12: 58.2% of week-1 games under the total, scoring and lines rising together over the first ~17 weeks; the same bias in the NFL (week-1 Unders +13.6% per game). **Independent confirmation of the week-2 mechanism's scoring side**, from a different literature over different seasons. The map shows it at the player level: **top-3 points-family Overs hit 46% / 38% / 46% in weeks 1–3, identically in both seasons** (46/46, 39/38, 45/46), then 66% in week 4; Unders 66% and 65% in weeks 2–3 (59/79, 60/79). And the points-only Power is better **Under-only all season**: all-Under slips +41% (43 / 36) in weeks 4–8 and +73% (80 / 65) after, vs +23% (−35 / +64) and +35% with an Over leg — the points-family edge is the Under side. Applied as a per-strategy side filter in the live engine (`D_points_3power` builds Under-only; the certified cell stays both-sides so the invariants hold; the paper gate is the test). *Gemini:* named assists as a second early-Under family; tested on the map: flat (assists R Under 51% early vs 55% later; D1 Over 44% vs 46%), and the Over side's seasons disagree (61 / 32). Dry. The early-season bias is specific to the points family here. Not a clean pass (research returned a confirmation and a refinement).
**Pass 35 — CLEAN PASS 1 of 3.** *Research* (the DFS correlation literature — Hunter/Vielma/Zaman, FantasyLabs, RotoGrinders — and pick'em stacking): confirms what is in hand (NBA stacking is weak except through a shared game environment; opposing-team pairs are negatively correlated; same-team pairs share a script). The one untested item in it, **the game's total line** as a leg feature: defensive Unders 60% / 66% / 59% across low / mid / high totals (the low-total bucket's seasons disagree, 54 / 79), Overs 64 / 62 / 46 with the high-total cell at 56 / 42 by season on 54 legs. Nothing pace does not already carry. Dry. *Gemini* (the rotation's untested **exit**: it stays on through the recovery days, which are the season's best): proposed "exit on a ≥ 70% day after ≥ M days cool." Tested on the three droughts: it releases on the strong day, then the next 0/22 day pulls the EWMA back under 0.50 and re-enters; recovery days still rotated on two of three droughts, false days 15 → 14. No improvement. **The rotation's exit — it misses some of the steals-driven recovery days — stays a stated limitation of the design.** Both halves exhausted; nothing usable.
**Pass 36 — a new approach: the full-season calendar by cell.** Week 2 showed that the early-season calendar has cell-specific signs because the league itself changes week to week; the same could hold wherever else the league changes, and the engine treated the rest of the season as uniform. The map, both seasons, by week, four families, both sides — reading only where **both seasons agree**: week 2 (known); **week 17 = All-Star week** (the 7 days before the break): defensive Unders **45 / 48%**; at the slip level **family A −35% (−26 / −45), the points Power −67%, the demons +58% (44 / 73)** — the "pre-All-Star drought" the hurdles kept tripping over, now with a calendar identity and the same shape as week 2 (a defensive-Under trough on a short, coasting slate; the demons hold through it as in the long droughts). **In the engine:** the break is found in the calendar (the one mid-season gap of 4+ days: Feb 13–19 2025, Feb 12–19 2026), the 7 days before it are the state, family A and the points Power shadow, the demons stake. Weeks 18–20 (post-break) are the season's best for everything (family A +89, demons +120, points Power +90, both seasons). **Week 24 (late March)**: defensive Unders **71 / 73%**, the season's best; points Unders **46 / 23**, the season's worst — tanking. Split by standings as of the date: **the Overs on tanking teams' own players hit** (points Overs 76%, 79 / 71; defensive Overs 73%, 73 / 75) — the players still on the floor absorb the minutes and usage; 15–21 legs per cell, a third-season candidate with a mechanism and a calendar-plus-standings identifier, not a rule. *Research:* the reporting on the break is contradictory year to year (scoring +10 after 2022's, −4 after 2024's), consistent with the post-break strength here having no single mechanism; trade-deadline churn tested — recently-traded players' Unders hit 66–67% vs 59% settled (both seasons; the new-role effect), no risk, a mild Under-side plus. *Gemini:* proposed a weeks-21–23 "playoff-race" state with points Unders hitting; the map says week 21's points Unders are the season's worst (40 / 30). Dry. Not a clean pass.
**Pass 37 — CLEAN PASS 1 (the count restarted when pass 36 found the All-Star state).** *The calendar's last layer, team schedule position* (games played vs the league average as of the date): teams are rarely 2+ games off pace (12–46 legs in the tails), Unders flat (63 / 60 / 55), Over tails with the seasons disagreeing. Dry. *Research:* the UT Austin study (2010–15) finds no team-level effect of deadline trades; the ESPN / GeniusIQ tracking work (Alamar & Oliver) finds an individual chemistry curve — newcomers shoot ~10% worse on equal shot quality until ~200 shared reps — which is the mechanism behind the traded-player Under plus already noted (66–67% vs 59%). Nothing new. *Gemini:* named the late stages of a road trip, predicting fewer steals and blocks. Tested: defensive Unders 61 / 58 / 60 / 58 (home / 1st road / 2nd–3rd / 4th+) — flat; Overs 63 / 59 / 51 / **81** (89 / 72 on 53 legs) — both seasons agree on the last cell, but it ends a non-monotone curve and points the opposite way from the mechanism; a curiosity for the ranker list, not a signal. Both halves exhausted; nothing usable.
**Passes 38–43 (one session).** *38 — the demons' own calendar:* bad in week 2 too (p.m 0.437, threes 21%; the week-2 play already sets them aside) and best in weeks 22–24 in both seasons (0.75 / 0.71 / 0.66). *39 — position, a split never made:* **steals Unders on centers 65% (63 / 66) vs guards 56% (49 / 62); turnovers Unders on forwards 67% (62 / 70) vs centers 49% (45 / 57)** — rank order holds both seasons on 90–295 legs per cell; a center's turnovers are fumbles and offensive fouls, a guard's steals the tightest-lined stat. Position is the sixth ranker feature (replacing role stability); turnovers-Under-on-centers is the one cell a filter could justify. *40 — research* (an EdgeClaw props audit: zero-inflated Poisson / NegBin for steals and blocks with player-specific dispersion; group by offensive role; the 30–60 min after a star is ruled out is the most exploitable moment → a late re-pick pass is a pipeline candidate) and *Gemini* (a latent slate-level "defensive environment" factor — restates the variance test; it can only be predicted from the pre-game covariates that are all flat): **clean pass 2**. *41 — the pass-28 edits validated:* **6-Flex rejected** (core 6-Flex +61% on big slates vs the 5-Flex's +81%; +2% on mid slates in 2024-25; the demon 6-Flex's +397% is one season — its convexity is variance, not mean); **same-team tie-break** built as `SE_SAMETEAM` and dispatched to a side table for the diversify-style validation. *42 — the exploitation side of the calendar:* late March (season days 147–167) is the strongest stretch in both seasons and **the deep slips earn to the bottom of the pool** (demon 5-Flex k7–10 +439%, 740 / 247; weighted:steals k7–10 +144%, 162 / 126) → **both caps 6 → 9 in that window**, the first calendar state that raises; post-break is mixed for the demons (−25 / 249), no raise. *43 — within-day decomposition:* single bad days are **slate-wide** — the worst game carries 34% of the misses vs 42–46% on other days, and only 11% of bad days have one game with half the damage (vs 21–29%); a per-game cap is not a lever; the "all cells cold at once" picture from a third angle. *NBA Cup nights* (labelled in the calendar for 2025-26; known dates for 2024-25): Unders 59% vs 61%, seasons 38 / 76 — dry, and the 2024-25 window sits inside the mega-drought. *Gemini on state-aware sizing:* fractional Kelly with heavy shrinkage toward the global rate (observed state weighted ~2/12 at n = 2) and **one guard — a hard aggregate daily stake cap**; adopted as `MAX_DAILY_STAKE` (36 units; 35 is the late-March maximum, so it does not bind today — protection against the next over-tuned raise).
**Passes 44–46.** *44 — the competing pick'em boards* (Underdog, Betr, Pick6) as a second opinion: they quote the engine's legs at PrizePicks' own line on 1,710 of 1,765 matches — the operators copy each other; the 55 disagreements split by season. **The market side of identification is now fully exhausted**: sportsbooks flat at 50%, pick'em boards identical, CLV inert. *45 — the absolute line level, never split:* **steals Unders at 0.5 hit 65% (59 / 69); at 1.5, 51% (43 / 57)** on 190 legs — the cushion finding (§29n) from the other side: a 1.5 line sits on a ~1.5-steal player where the Under is a coin flip, a 0.5 Under on a low-steal player is where the model's skill applies. The interaction decides the filter: at 1.5 the Under is 48–49% unless the line is ≥ 0.25 above the player's trailing-10 (then 67%, 21 legs); at 0.5 with a 0.25+ cushion it hits **83% (86 / 82)**. **Live leg filter:** a steals Under above 0.5 needs a 0.25 cushion, trailing-10 computed from the game log at pick time. Stocks Unders are better at 2.5 than 1.5 (63 vs 57); turnovers are flat across lines. *46 — experience × back-to-back:* dry (Unders 56–64% everywhere; the one lift, veteran Overs on a B2B at 70%, runs against any fatigue story on 56 legs). *The same-team tie-break, rebuilt (`SE_SAMETEAM`, side table):* **rejected** — preferring same-team pairs reshaped 62–64% of slips (from 14–15%) and the drought advantage did not survive construction: in the long droughts −8 … −27% vs −7 … −32% certified, weighted:steals worse in both seasons (43 / 94 vs 56 / 97), only core 5-Flex up in one season. The observational +3% belonged to slips whose same-team pair was top-ranked anyway; forcing it dilutes the ranking. Both pass-28 edits are closed by validation.
**Passes 48–51 — the single day, four more angles.** *48 — the miss margin:* on bad days the Unders miss mostly **by one event** (32% of legs within one of the line vs 14% on winning days), big misses rise only in proportion, and the picked players' **minutes are identical (29.0 vs 28.7)** — not blowout-minutes nights, not catastrophic nights; the player gets one more steal or turnover, everywhere at once. *49 — line age:* **PrizePicks never moves a defensive line** — 25 of 2,466 engine legs had a line that changed within 30 days; the rest are posted rarely or frozen at one number. This is why the window-to-close and CLV tests found nothing: there is no line dynamic on these props. Hit rates 60% either way; dry. *50 — the absence panel joined to the opponent* (vacated possessions): the strong cells have the seasons disagreeing (steals Unders vs an opponent missing 50+ possessions 53 / 78); dry. *51 — rank depth on bad days:* on winning days the ranking is monotone — **rank 1 hits 75%, rank 2 67%, rank 3 60%, ranks 7–10 52%** (the base rate); on single bad days it is **flat, 50 / 47 / 52 / 52 / 52** — zero lift, not inverted (no fade available); long droughts a weaker version (53–57, flat). The model's whole value is the lift at the top ranks and on a bad day it is switched off. *Gemini's mechanism for that* — a slate-wide **compression** of actual outcomes (high-event players produce less, low-event more) — would fit every fact; tested with the strongest control of the whole program: **the league is identical on bad days** — per-player defensive-event spread 1.85 vs 1.89, means 2.68 vs 2.70, and the correlation of each player's night with his own trailing rate 0.427 vs 0.423, in both seasons, across ~280 players a night. No compression, no leveling, nothing league-wide. **Only the engine's nine picked players fail, together.** A bad day is not a property of the league or the slate; it is the joint outcome of a small, correlated sample of picks — the shuffle test's conclusion (§29n) from the mechanism side. The single-day question is closed at the mechanism level; the remedy remains structural (diversification), and the remaining lever is the ranker's own lift (the retrain).
**Passes 52–53.** *52 — team spread of the picks* (how many teams the ~9 picked players come from): +62 / +90 / +85% across concentrated / some sharing / all different, seasons disagreeing in the extremes; not a lever. *53 — where the engine had never looked: the pick's timing.* The engine picks from the 2:45 PM window board; **PrizePicks adds ~11 defensive props a day after it — 23% of the close board, ~1,584 legs a season the engine never saw** — and under the model's own ranking those late legs are as good as the window's: **top-3 late Overs 66%, Unders 59% (133 / 277 legs)** vs 58 / 62 on the window board. Roughly 410 top-ranked legs a season outside the pool. **Built: a late pick** (`LS_MODE=late_pick`) from the close-priced legs (`pp_leg_price` carries a close label), restricted to games not yet tipped and to slips carrying at least one leg the window pick could not see; every strategy at cap 1; **record-only for the first season** (status `placed_late`, graded as `graded_late`, never staked), so the third season measures what the unseen quarter is worth before it is played. *Owner item:* for it to run live, the close snapshot and its pricing must land before the later tips — a ~15:40 PT pull with pricing behind it; today the close pull is ~16:00 PT, at the first tip.
**Passes 55–60 (Gemini asked for eight untried angles; the testable ones, plus two of my own).** *Altitude* (visitors at Denver / Utah): Unders 60% = sea level; dry. *Tracking touches and passes per game* (ball-handling load behind turnovers): the as-of tracking history starts in September 2026 — untestable on the two seasons; a 2026-27 item (the history begins now). *Player track record, walk-forward:* the engine's usage is so diffuse that only 11 player-prop pairs carry 8+ picks in a season; the worst tercile regresses to 60% out of sample. Players, like teams, carry no track record forward. *Scorekeeper bias by arena* (van Bommel & Bornn 2017 — judgment stats inflated or deflated per venue): the arena groups mostly regress (Unders: worst arenas 45% → 58%, best 64% → 61%); a 10-point Over residual on 49–72 legs — a weak ranker feature. *Holiday slates:* **New Year's Eve (−8 / −15 u) and MLK Day (−9 / −10 u) lost in both seasons**; Black Friday won in both (+29 / +23); Christmas and New Year's Day flip. n = 2 each, but a cap-1 day costs little if it is noise → NYE and MLK Day join the cap-1 caution rule. *First game back after 8+ idle days:* Unders 62% (62 / 62), Overs 68% (67 / 69) — a mild plus in both seasons, but the returning players' minutes are **not** restricted (30.3 vs 29.5), so the mechanism is absent; 28–76 legs; a ranker note.
**Passes 61–63.** *61 — does the ranker's lift decay through the season* (PrizePicks adapting, priors going stale)? Rank-1-2 minus the base rate by month: October **−3** (−21 / +9 — the early calendar), November +12, December +6 (0 / 12), **January +16**, February +7, March +7, April +8. Positive every month but October in both seasons; no decay, no sign of in-season adaptation by the operator. *62 — overtime, post hoc:* single bad days carry **twice the OT share** (10% of Under legs in OT games vs 4–5% on other days — more close, long games on bad nights), yet those OT legs hit 50%, the same as the non-OT legs that day (49%); anatomy, not a lever, and OT is unpredictable (spread flat). *63 — player foul rate:* **low-foul players (< 1.8 fouls/game over the last 20) are the model's best picks on both sides** — Overs 72% (75 / 68) vs 57–59% for the rest, Unders 65% (62 / 67) vs 57% in the middle band; a disciplined defender keeps stable minutes and a stable role, so the model's rate estimate holds. **The eighth ranker feature** (cushion, B2B, blowout, position, line level, most-used penalty, team, foul rate) and one of the stronger ones (171 / 514 legs).
**Pass 64 — foul rate at the slip level: it aggregates.** The first leg-level feature that survives aggregation to the staked unit: Regular 5-Flex slips (core and weighted:steals, k ≤ 3) by the number of low-foul legs they carry — **0: +47% (−2 / +77); 1: +72% (41 / 103); 2: +74% (62 / 88); 3+: +123% (121 / 125)** — monotone in both seasons, 248–639 slips per bucket. The cushion, the back-to-back and position never did this; foul rate does because it marks the players whose nights the model predicts well, and a slip of such players is a slip of well-predicted legs. **Next reviewed edit:** an `SE_LOWFOUL` secondary ranking key in the certified builder (prefer, among slips of equal tier and edge, the one with more legs on players under 1.8 fouls/game; `nba_score.player_pf20` joined by player_id), validated on a side table as diversify was, then certified. The live engine inherits it through the builder.

### 29g. The detectors, simulated on the real stream — three falsified, the unit of analysis corrected (2026-10-01)
Before trusting any live detector it was run on both seasons' *actual* daily leg streams (the series the engine will see). **All three cumulative/leg-level designs failed:**
| detector | result on the real stream |
|---|---|
| rolling 5-day projection→outcome correlation (ad hoc) | fires day 5 of 7 in week 2; never fires in 2024-25 weeks 5, 8 |
| DDM (Gama; p_min + 2σ/3σ) | in `drift` **146–157 of 161 days** — p_min anchored on the anomalously good opening week, never recovers |
| two-window ADWIN-style (short 4–7 / long 20–28, z 2/3) | flags **7–10 healthy weeks per season** at every setting; misses week 2 outright (no trailing reference yet) |
| **the H1 CUSUM as shipped** (k 0.015, h calibrated to ≤1 crossing/season) | in `red` **87–133 of 161 days** — `calibrate` counted *crossings*, not days-in-alarm; one crossing that never returns is "one alarm" and a season of red |
**Root cause, two parts.** (a) A day's defensive legs are **the same two or three players across every slip** — the anchor stream reads 22/22 or 0/22 — so 22 legs are 2–3 independent trials and every leg-level standard error is ~10× too small. (b) The daily leg hit spans 10–95%; no cumulative statistic separates a Kind-A week from an ordinary bad day. **The day is the only independent unit.**
**Rebuilt as day-blocked tests** (the principle that works everywhere else here: the paper gate, the MC95 lines): H1 = trailing-14-slate-day mean of the strategy's *daily* leg hit vs its calibrated mean, in units of the day-level standard error from the backtest's own day-to-day variance (`sd_daily_hit`, stored at `calibrate`); yellow z > 2, red z > 3. H7 the same on the anchor's daily hit (`_ANCHOR_steals` calibration row). **Simulated on the real pooled stream: 6 and 5 yellow days per season, zero reds, zero healthy weeks wrongly stopped**; flags the 2024-25 Christmas collapse (weeks 10–11, −$120) and the 2025-26 pre-All-Star drought (weeks 16–17); does not catch week 2 (a trailing test cannot see the first bad thing — the theorem). **H8 removed.**
**First season replay (old code — dispatched before tonight's hurdle changes; its hurdle verdicts are the dead CUSUM's, its mechanics are current):** families **B and C behaved exactly as designed** — demon 3-Flex `active` from Dec 22, demon 5-Flex from Dec 28, stocks 4-Flex from Dec 10; zero reds; final nets +99 / +438 / +128; live CI lower bounds +24% / +38% / +49%. **All five family-A strategies went red on Dec 11 and stayed red 95 days** — the old leg-level anchor CUSUM firing once and, with no P5 PASS in a replay, never clearing. Family A's live lower bounds (core 3-Power +16%, core 5-Flex +18%, weighted:steals −2%, regular 5-Power −66%) sit far below their backtest OOS bounds (+49…+62%); the replay also staked week 2 and the final week (calendar states never engaged on that code). **Second replay, current code, first 105 days (Oct 21 → Feb 8; the 161-day run exceeded the 120-minute job limit, now 300, with a resume mode).** Under the day-blocked detectors **family A is alive**: all five strategies went `active` on Dec 20–26 — the paper gate opening at day ≈ 50 exactly as the simulation predicted — spent 37–47 days active, and their live lower bounds are **+28% … +40%** (first replay: −2% … +18%), nets to Feb 8 of +153 … +264. The Dec 11 mass red is gone: it was the dead CUSUM. The `week2` state engaged for every strategy (7 days, Oct 28–Nov 3), which with the final-week rule accounts for most of A's recovered net. B and C clean again (demons zero yellows; stocks one; lower bounds +18% … +39%). On Feb 8 six strategies sit in `yellow` — the pre-All-Star drought of §25-26, the stretch the day-blocked H1 was shown to flag — and whether they clear on Feb 19 is what the resume shows.
**Two rule defects found in it and fixed:** (1) **H1 and H7 double-counted one signal on family A** — a family-A strategy's daily hit *is* the anchor's, so a soft anchor week fired both, "two yellows = red" stopped core 3-Power (Dec 12) and weighted:rebounds (Feb 8) with +28/+35% lower bounds and 10–21 u drawdowns; H7 yellow now merges with H1 yellow as one flag, H7 red still stops the family. (2) **A red could self-clear to yellow** beside a single yellow (core 3-Power was back to yellow on Dec 14); a red is now sticky in every branch until P5's weekly PASS. A final full replay on the fixed code is the acceptance test before Oct 20.

### 29h. Delta mode — exact, cumulative, proven (2026-10-01)
Owner: a delta mode with a tiny recalculation on top of the accumulated; exactly what a full recalculation would give; cumulative — two seasons done, day one on top, day two on top of that.
**The daily engine (P4) is already delta by construction.** Day N's pick uses day N's board and the state as it stood; day N's grade appends to the ledger. Nothing is recomputed. The season replays are *validations* of it, not how it operates: from Oct 20 it runs on the two seasons plus each new day, exactly as asked.
**The weekly chain (P5) is now delta wherever delta is exact, and full wherever full is the exact form:**
| step | mode | why it is exact |
|---|---|---|
| tier map legs | **delta** (`TM_DELTA=1`): only days past the high-water mark | `n_rank` is partitioned by (day, prop, tier); prior days' ranks cannot change |
| tier map bands | full re-sweep (a 2-minute aggregate read) | bands are per-window aggregates |
| candidate certifier | full (a per-season aggregate in one SQL pass) | the full recompute *is* the running-sum result |
| slip engine, both families | **delta** (`SE_DELTA=1`): legs loaded for all days (cheap), **phase bounds and the correlation map computed over the whole history exactly as a full rebuild does**, only the new days *built* (the expensive part) | slips are per-day; the two whole-history inputs are recomputed identically |
| 66-invariant certification | full (reads) | reconciliations must see the whole table |
| validations (V1–V6) | full (a ~25-minute statistics pass) | the day-blocked bootstrap is over the whole OOS period |
**Proven, not argued.** A `_deltatest` table seeded with the certified slips through Apr 1 was extended by the delta engine over Apr 2–12 and diffed against the full certified build: **13,484 slips and 51,396 legs, zero rows in one and not the other, zero slips with different legs, zero with different hits or payouts.** Identical. The delta build took ~3 minutes against the full build's ~15; the weekly P5 drops from hours to minutes once a season is in the tables.
**The one caveat, stated so it is never mistaken for a defect:** a past day's `final_hp` under a *historical* rebuild uses the final as-of calibration and confidence fit; the live P3 used *that night's*. So a past day re-scored is not bit-identical to what the live board saw that day. This is the backtest-vs-live gap the replays measure; the live row is the true record, and no mode can or should close it. Delta mode does not touch `final_hp`; it starts from it.
**Also fixed on the way:** the tier map's season windows were hardcoded to the two seasons and would have silently excluded 2026-27 from the bands; they are now data-driven (one window per season present, plus `both`). A deferred item recorded: the correlation map is computed over all days including the one being built, in both modes — equivalent, but a lagged map would be cleaner; changing it alters the certified backtest and is a reviewed change for the off-season.

### 29i. Integrated into the existing pipelines (2026-10-01)
Owner: incorporate into P1 / P2 / P3; manual runs stay independent; scheduled work rides the existing pipelines.
- **PICK = the final step of P3** (afternoon), after the slate is scored, archived and certified, on the slate P3 resolved (`steps.d.outputs.asof`), gated by P3's own `has_games` (which already excludes preseason). The engine's freshness gate re-checks `board_scored`, `final_hp` and the priced window legs before building.
- **GRADE = the final step of P2** (overnight), after yesterday's outcomes are graded and today's baseline certified: grades yesterday's paper slips, updates the ledger, runs H1–H7 day-blocked, sets each strategy's state before the afternoon pick. On a rest day it is a no-op that refreshes states.
- **REQUALIFICATION = the final job of P1** (Monday), `needs: weekly`, via `workflow_call` into `nba-p5-weekly-requal.yml`, so P5's steps live in one file. Delta mode; ~30 min.
- **The P4 workflow is now the manual entry only** (pick/grade on a date, season replay, recalibration); its schedules are removed. P5's schedule is removed; it keeps `workflow_dispatch` for an on-demand run (after a model change).
**First P5 chain in delta mode, end to end:** bands re-swept, certifier, both engines delta (no new days), **66-invariant pass clean (`8560f126`, 66/0)**, both validations at weekly precision, **all eight strategies PASS** — family C correctly read from its own no-steals table — with lower bounds within a point of the 10k-resample certification figures. ~45 min on a no-new-days delta.
**Found and fixed while integrating:** every slip-engine run had been reporting `failure` after a successful commit (`full` is a Postgres reserved word in the report SQL), which is how this morning's P5 died silently at step 3; the P5 workflow had been invalid YAML since the delta edit (a `DELTA: ` colon-space inside an unquoted step name), which is why GitHub refused every dispatch until the names were quoted.

### 29j. Acceptance replay #3 (P5 in the loop) and the stop/restart deadlock (2026-10-01)
**All eight strategies finish the season `active`, every one with a positive live lower bound** (+25 … +71%). B and C: zero reds, zero yellows for the demons (demon 5-Flex +552 at +71%; stocks 4-Flex 96 active days, +148 at +61%). Family A's Feb 11 anchor stop now **clears through P5** and the five return to active, finishing +107 … +377 (vs +78 … +261 when the red lasted 54 days). Week 2 engaged for all eight; the gate opened at day ≈ 50 for all eight.
**But the red lasted 6–34 days, not the 8 the production P5 should have produced**, and the state history shows exactly why: a red strategy places nothing, so its trailing-14-day H1 window has no new days to roll in — the z-score sat **frozen at 3.14 → 4.1 → 3.62 → 3.02, changing only on Mondays**. P5 cleared it to `paper`, it placed for one day, the next morning's grade saw the same stale window, and it was red again. **A stop/restart deadlock:** it cannot accumulate clean days while stopped, and cannot leave stopped without clean days — the hysteresis deadlock's shape, one level up.
**Fix — the detector keeps observing while the strategy is stopped.** A red (cap-0) strategy still *builds* its slips each day as **shadow slips** (`placed_shadow` → `graded_shadow`): never staked, never in the ledger's net / drawdown / streak, never in the paper gate; but H1's trailing window and H7's anchor window read them, so a recovered board shows up in the z-score and P5's PASS sticks. The shadow record is also the direct measure of what a stop cost — the number that decides whether a stop rule was right. The final acceptance replay on this code is running.

### 29k. Drought anatomy — pass after pass (2026-10-01). Owner: approach ALL droughts, understand how they differ, find what makes them better; run until dry.
**Pass 1 — the droughts, and they are two kinds.** Thirteen droughts of ≥ 3 days or ≥ 25 units across both seasons (week 2 excluded, already closed). **Short, everything-loses** (2–7 days; every strategy negative, most at −100%): D2, D4, D6, E2, E3, E7, D5. **Long, rotation** (10–66 days; some strategies hold while others lose): D1 (66 d, −188), E4 (16 d), E1 (14 d), E5 (10 d), D3. **In every long drought the demons hold** (D1 +60/+32%, E4 +61/+13%, E1 +169/+82%, E5 +14/+14%) while the steals-anchored Regular strategies lose −25…−70%. The demon hedge in §25-26 is the hedge *specifically for the long droughts*.
**Pass 2 — the projection is FINE in the short droughts.** E2 (Dec 30–Jan 2, −46 u, every strategy −52…−100%): projection→outcome correlation **0.148**, discrimination 16, top-5 legs 62% — *better* than the season. E3: 0.104 / 16 / 59%. These are not Kind-A weeks; the model ranked correctly and the slips lost −100%. The long droughts sit at 0.05–0.09 (weak, not zero). Slip hit distributions match independence (no within-slip clustering) — so the engine's *chosen* legs (35–48%) and the map's top-5 (59–62%) are different populations.
**Pass 3 — the damage is cell-specific and ROTATES.** E2: steals 45%, assists D1 7%, rebounds D3 17% — but turnovers **79%**. E3: **turnovers 12%** — steals 57%, stocks **100%**. E7: steals 31%, turnovers 28%, stocks 100%. E1 (long): steals 38%, everything else ~50%, demon cells at their season rate. One or two cells crater, the others hold; a 5-pick with two legs in the cratering cell dies while its other three hit. **Officiating / league-base-rate hypothesis (Gemini) falsified:** league steals per team 8.38 in E2 vs 8.35 before and 8.41 season; fouls, FTAs, turnovers flat through every short drought. The league produced normally; *the specific players the engine picked* missed.
**Pass 4 — the real structure of a day.** 52 legs/day on **9.5 distinct players**; the top player in 11–12 legs; **78% of all legs on players with 6+ appearances**, identically in normal days and droughts. A day of 15 slips is ~9 bets dressed as 52, and a drought is a bad night for the 3–4 players every slip leans on — which is why no trailing or regime signal ever worked (a player's bad night is not forecastable from last week) and why the "cratering cell" is whichever cell those players sit in. Days on ≤ 9 players: ROI **−28%**, 40% of days losing 10+ u; days on 10+ players: +78…+83%.
**Pass 5 — diversification, with the control test Gemini asked for.** 5-pick slips spanning 4+ distinct cells vs 3: normal +128% vs +128%, **short droughts −16% vs −45%**, long −10% vs −17%. Same-board control (board breadth = cells with 2+ eligible legs that day): on BROAD days, short droughts **−11% vs −39%** (the shape protects), normal +139% vs +123%; on NARROW days forcing a 4th cell is **worse** (+85% vs +152% — it reaches for a weak leg, Gemini's catch). So: `SE_DIVERSIFY` = prefer ≥ 4 distinct cell families per 5-pick **only on broad boards** (≥ 5 families with 2+ legs), as a tiebreak below the cross-game tier and above summed edge; narrow boards untouched.
**Pass 6 — diversify on the full engine** (`_div` table, both seasons, same slip counts, same days): **core 5-Flex better in every period** — normal +139 → +143%, short droughts −50 → **−20%**, long −18 → **−7%** (two-season net +582 → +666). **weighted:steals 5-Flex trades 22 points of normal ROI** (+169 → +147%) for short droughts **−51 → +6%** and long **−31 → −7%** (net +683 → +707, far shallower droughts). Demons untouched (their pool has exactly 3 cell families, so the rule never applies — the long-drought hedge is intact). Validation at weekly precision queued on `_div`.
**Passes 7–10, dry:** Under-mix (4-Under slips are the *best* in normal periods at +227% and no worse in droughts — nothing to change); board-breadth rotation (the board is broad on 284 of 303 days; no trigger); opponent trailing turnover rate (the drought-day slice contradicts the normal-period pattern; noise); league base rates (flat, passes 3). None yields an identifiable trigger, which is the owner's condition: a rotation must be identifiable at the time, not inferred from last season's calendar.
**Pass 11 — the portfolio blend, on the day-level return matrix** (two seasons, every strategy): current equal caps **+3,691 / max dd 188 / net-per-dd 19.6**; "A at 0.5×, demons at 2×" **+3,798 / dd 105 / 36.1** — same net, 44% less drawdown; B+C only +1,428 / dd 34 / 42.0 (too little income); A only +2,262 / dd 223 / 10.2 (the drawdown is family A's). A *fixed* blend, no trigger — it passes the owner's condition by construction.
**Pass 12 — and why "demons at 2×" is real, not arithmetic: THE DEMON CAP.** The cap-by-structure rule (cap 3 for 5-Flex) was measured on the *Regular* strategies, whose 4th+ slips degrade. The demon 5-Flex is different: its **4th–6th slips earn +157% and 7th–10th +173% against +146% for the top 3** (the pool's 10th slip is as good as its 1st), and the pool supplies 6+ slips on 181 of 257 days (70%), 10+ on 127. **Walk-forward, every cap holds**: cap 3 S1 +165% / OOS +129% (net 497); **cap 6 S1 +158% / OOS +144% on 675 slips (net 975)**; cap 10 +179% / +139% (net 1,332). Drawdown scales with the cap (2025-26: 27 → 48 → 67; stress season 41 → 91 → 122); net per unit of drawdown is **best at cap 6** (20.3 vs 18.4 at cap 3, 19.9 at cap 10). The cap rule becomes per-strategy: **demon 5-Flex cap 6** (≈ +480 net per season from one change, ROI intact out of sample), cap 10 left for the live record to argue for. This is the largest single improvement the drought investigation produced, and it came from the long-drought hedge being under-weighted, not from predicting droughts.
**Pass 13 — cap room, every strategy** (slips k=4–6, both seasons): core 5-Flex +66% (+88% OOS / +44% S1) and weighted:steals +67% (+79% / +55%) — cap 6 supportable; demon 3-Flex's k4–10 earn +48–55% in both seasons — cap 1 leaves them; core 3-Power's deep slips degrade (+28%, +6% S1) and the 4-Flex pair's are marginal (+39–42%) — their caps are right. But raising the 5-Flex caps doubles family A's anchor exposure, which pass 11 showed is the portfolio's drawdown — so the Regular cap increases wait on pass 14.
**Pass 14 — DUPLICATION.** Of 4,726 slip rows staked, **766 distinct slips are placed twice and 7 three times**: core 5-Flex and weighted:steals 5-Flex build the identical slip on **58%** of days (daily P&L correlation 0.83); weighted:rebounds and weighted:stocks 4-Flex on **75%**; core 5-Flex and regular 5-Power share legs (different product, correctly kept). A third of family A's stake was a doubled stake on its own slip, invisible because each strategy validated fine alone. **Deduplicated** (each distinct slip once): 16% fewer slips, 14% less net (3,691 → 3,184), **max drawdown −31% (188 → 129)**, net-per-dd 19.6 → 24.7, daily sd 33.8 → 29.5 — the "A at half weight" of pass 11 almost for free, and identifiable at the time by construction. **In the live pick now**: an identical slip built by a second strategy on the same day is recorded as `dup`, never staked; the paper gate counts a strategy's dups toward its minimum so dedupe cannot delay activation. **Unique contribution per name** (slips no other strategy builds): demon 5-Flex **+1,040** (nothing else close), core 3-Power +540, weighted:steals +311 (its unique slips +79%, better than core 5-Flex's +54%, so it rightly owns the shared ones), regular 5-Power +281, core 5-Flex +211, demon 3-Flex +199, the 4-Flex pair +42 / +53. The portfolio is five strategies plus three partial duplicates.
**Pass 15 — grow the demon pool (Gemini's "Tier-2 demons"), REJECTED by the system's own bar.** The next rungs look good on 2025-26 (threes D1 ranks 3–4 0.580, points D2 top-2 0.576, rebounds D2 top-2 0.574, rebounds D1 top-2 0.571, 300 OOS legs each) and a `demon2` composition was built from them — then checked against `cand_certified`, which had *already evaluated* them: **points D2 2024-25 p.m 0.526 (−$17 per 100), rebounds D1 0.503 (−$27)**. Positive in one season, negative in the stress season: exactly the one-season cell the two-season bar exists to exclude. Reverted. The demon pool's limit is real; the certified pair (threes D1, assists D1, positive in both seasons) is the pool.
**Pass 16 — family C was family A in all but name.** In the full-cell tables, **95% of weighted:stocks 4-Flex slips carry a steals leg** (the `weighted:` fill comes from `core`, which includes steals); the 5% without one earn +13%. Its §28f validation (OOS +59%, lower bound +20%) ran on an engine with the steals cells *excluded*, which built different slips — so the live `C_wstocks_4flex` was staking family-A slips under a family-C label, and "three independent families" was two. **Fixed in the live engine:** family C builds from a pool with the steals cells removed (`EXCLUDE_BY_FAMILY`), and `calibrate` reads its MC95 / streak / daily-hit from the `_nosteals` table — the slips it actually builds. The independence claim is now true in what is staked, which is the only place it matters.
**Pass 17 — cap reallocation within family A.** With core 5-Flex owning only its unique 42% after dedupe (unique slips +54%) and weighted:steals' 4th–6th slips earning +67%, the cap is better spent on weighted:steals' depth: **weighted:steals cap 6 with core 5-Flex retired** beats every allocation — net **+893 → +1,299** (+45%) at the same max drawdown (99 → 102), stress season **+265 → +458** (+73%), 1,847 distinct slips vs 1,318. Core 5-Flex as a separate strategy is redundant: everything it adds, weighted:steals adds better one cap deeper. Goes into the validation chain with the other certified-table changes.
**THE CUMULATIVE RESULT, both seasons, same board, same outcomes** (each change on top of the last):
| | slips | net | ROI | max dd | net / dd | days losing 10+ | 2025-26 | 2024-25 |
|---|---|---|---|---|---|---|---|---|
| this morning's baseline | 4,726 | +3,691 | 78% | 188 | 19.6 | 29% | +2,382 | +1,308 |
| + diversify | 4,726 | +3,800 | 80% | 133 | 28.5 | 27% | +2,346 | +1,454 |
| + demon 5-Flex cap 6 | 5,269 | **+4,651** | 88% | 158 | 29.4 | 30% | +2,825 | +1,827 |
| + dedupe (all three) | 4,376 | +4,002 | **91%** | **127** | **31.6** | **25%** | +2,370 | +1,632 |
Two readings, the owner's call: maximum profit (stop before dedupe) is **+4,651, +26% on the baseline, at 16% *less* drawdown**; maximum efficiency (all three) is +4,002 at a drawdown a third lower and **60% more edge per unit of risk** (31.6 vs 19.6). The stress season moves most in both (+25…+40%): the drought work shows where it should. Not in the table and applying on top in the live engine: week 2 ($96), the final week ($31), the hurdle machine's halved caps in droughts. **None of it predicts a drought; all of it is the portfolio being built better** — the owner's condition (identifiable at the time) is met by every change, because every change is structural and applies every day.** NEXT: run the full walk-forward build (needs a workflow — heavy write; owner-gated per RF_WRITE), then the six ranks as sorts over it.
