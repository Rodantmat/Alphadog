# SIGNALS, TECHNIQUES, AND LAYERS TRIED — Complete Log
*Every method attempted across this session (2026-08-16 through 2026-08-21), validated or rejected, with the real reason. A coworker session must read this before starting daily research, both to avoid blindly repeating a rejected test AND to know it's allowed — encouraged — to re-test any of these fresh against current data, since real conditions change.*

---

## VALIDATED AND CURRENTLY LOCKED

| Strategy | App | Signal | Real result |
|---|---|---|---|
| Goblin | PrizePicks | Per-leg tier-based multiplier table, 5-pick Power, 25% daily cap | Backtest +79.9%, being actively re-validated against real per-leg pricing (see MULTIPLIER_TABLES_MASTER.md) |
| Regular | PrizePicks | `pitcher_fantasy_score/less` real mispricing | +1105.4% Power / +779.3% Flex, 28-day real backtest |
| Demon | PrizePicks | `hits_runs_rbis/less/Tier2`, 3-pick Flex, no cap | +80.0% Power / +657.9% Flex (real multiplier), thin sample (19 slips, 5 days) |
| Sleeper | — | `hits_runs_rbis/more`, 3-pick Power, no cap | +46.5%, 36 slips, 22-day backtest |
| Underdog | — | `rbis/less` + `walks/less`, 6-pick Power, cap=1/day | +345.0%, largest real sample of any strategy (4,553 / 4,340 real graded outcomes) |

---

## VALIDATED, HISTORICAL, STATUS UNCLEAR (re-test these fresh)

**Real, repeated pattern worth naming**: every item in this table has now survived at least one full coworker research session untouched. Do not let this list simply persist unchanged — each entry represents real, already-identified work that has not yet been done. A session that produces zero movement on this table two runs in a row is not being genuinely exhaustive, regardless of what else it found.

| Signal | App | Real result when tested | Why status is unclear |
|---|---|---|---|
| Bottom-of-order (batting spots 7-9), `total_bases<1.5` | PrizePicks Regular | +837.5% ROI, 3/6 real days won | Appears to have been organically replaced by the `pitcher_fantasy_score` signal without being formally compared or combined. **Different prop entirely — may be genuinely complementary, not redundant. Test combining both.** |
| Board-density gate (skip if <20 legs/game) | PrizePicks | Real backtest ROI +22.4% → +35.1% | Built for the OLD 3×6-pick Flex strategy, not re-tested against the current locked Goblin/Regular pools |
| `hits_allowed` depth gate (skip if <6 legs) | Underdog | Real backtest ROI -6.8% → +181.3% | Built for the OLD 5-prop mixed pool, not re-tested against the current locked `rbis`+`walks` pool — worth checking if an analogous depth gate helps the current pool |
| Doubles-only, 90% real hit rate | Sleeper | Real 8-day backtest, gated to min-4-pick: +12.7% | Superseded by `hits_runs_rbis/more` without a direct comparison ever being run. **Worth re-testing both in parallel on current data.** |

---

## TESTED AND EXPLICITLY REJECTED (real, honest reasons — do not redeploy without new real evidence)

| Signal | App | Real result | Why rejected |
|---|---|---|---|
| `runs+singles<0.5` | Demon | +296.7% ROI (looked promising) | Entirely driven by one outlier day (08-11); 7 of 8 real days were losses |
| Batting order position | Demon | Noisy, thin (samples of 1, 4, 4) | Demon legs concentrate on star/top-of-order players — structural scarcity of bottom-of-order demon legs |
| Batting order position | Underdog | Flat, no trend (63.4% at spot 1, 46.9% at spot 9 — opposite direction) | No exploitable pattern in the real per-spot data |
| Batting order position | Sleeper | Contradictory (spot 8: 61.9%, spot 9: 31.6%) | Noisy, too thin to trust |
| Umpire tendency stacked on bottom-of-order | PrizePicks Regular | ~2pp spread across samples of 83/107/103 | Real, but statistically indistinguishable from noise |
| Narrowing bottom-of-order to spot-9-only | PrizePicks Regular | 0/6 real wins (worse than the broader 7-9 pool's 3/6) | Best per-leg rate doesn't help if the pool is too thin to assemble winning 6-pick combinations |
| Leg-density/day-quality filtering | Demon (tested independently, twice, on two different signals) | Looked promising on small samples both times, then failed once more real data arrived | Confirmed pattern: this specific type of filter has failed real validation multiple times in this system's history — treat any future leg-density hypothesis with extra skepticism and demand a large real sample before trusting it |
| Correlation-control (max 1 leg/game) for Goblin | PrizePicks | Removing it slightly IMPROVED real backtest ROI at scale (no-cap config) | Real, counter-intuitive finding — worth re-testing periodically since it carries real tail risk (rainouts/blowouts affecting multiple same-game legs at once) that a backtest can't fully price |
| Same-game correlation for Goblin generally | PrizePicks | Weak real positive correlation (+1.05pp on a 73% base, n=1,276 pairs) | Real but negligible — not worth building a strategy around |
| Pitcher-dominance stacking (theory: opposing batters under-perform when a pitcher goblin-legs hits) | PrizePicks Goblin | Real but tiny: +0.43pp lift on 26,114 real pairs, vs. a Gemini-predicted +10.2pp | Directionally correct, real, but far too weak in practice to exploit |

---

## REQUIRED TESTING STANDARDS (apply to every new hypothesis)

### 1. Depth of simulation
Every real finding that held up in this session came from testing **at real scale, not a handful of examples**. Concrete real precedents to match or exceed:
- The 26-day Goblin backtest swept 24+ full cap/size configurations, each computed against the complete real leg-level dataset (tens of thousands of rows), not samples.
- The per-prop Goblin multiplier table required cross-referencing every real placed-slip observation across the ENTIRE session history, not just the most recent day.
- The Underdog signal was validated against 4,553 and 4,340 real graded outcomes — the standard to aim for, not the exception.

**A coworker session should run thousands of real simulated slip constructions per hypothesis** (every reasonable combination of cap × size × pool definition × correlation treatment), not a token handful, before drawing any conclusion. If a real database table has fewer rows than needed for this depth, say so honestly rather than pad the number of "simulations" with synthetic or estimated data.

### 2. Zero bias toward existing/locked logic
**This is a hard requirement, not a suggestion.** Every day's research session must approach the data with fully fresh eyes:
- Do NOT start from "the locked strategy already works, let's just confirm it." Actively try to find something DIFFERENT or BETTER, including approaches that would replace a currently-locked strategy entirely.
- Do NOT dismiss a new signal just because a superficially similar one failed before (see the rejected list above) — re-test with current, real data; conditions genuinely change day to day (real example: the pipeline's own real completeness has materially improved multiple times this session, changing what a real backtest can even see).
- Do NOT assume the current pool definitions (which props/sides/tiers are included) are correct or final — actively test alternative pool compositions, additions, and removals every session.
- When comparing a new idea against the locked strategy, use the SAME real rigor on both sides — don't hold the new idea to a higher bar than the one already deployed.

### 3. What counts as a genuinely new pass
A "pass" (see the 5-pass stopping rule in the master prompt) must involve testing something structurally different from prior passes that day — not re-running the same test with trivially different parameters. Genuinely different axes to explore include (non-exhaustive, and the coworker should invent more):
- Different prop/side/tier combinations not yet in the locked pool
- Different cap structures (fixed numbers AND percentages, at multiple values each)
- Different pick sizes across the full 2-8 range each app supports
- Correlation treatment (with vs without same-game/same-team restrictions)
- Multi-layer signals (stacking two real, independently-plausible factors — see the umpire+bottom-of-order example above for the RIGHT way to test this, including how to properly rule one out)
- Hybrid pools (mixing legs from genuinely different tiers or props within one slip vs. keeping pools single-prop)
- Shrink/expand adaptive sizing (build the largest size the day's real pool supports, falling back to smaller sizes only when necessary — see the real Python implementation pattern already used for bottom-of-order, reusable as a template)
- Different multiplier assumptions (test sensitivity: does the conclusion change materially if the real per-leg rate is 10-20% different from the current table's estimate? this identifies which findings are robust vs. fragile)
