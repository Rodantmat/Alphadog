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

## MANDATORY COVERAGE MATRIX — updated every session, gaps must shrink over time

**This matrix exists because the same real gaps survived three full coworker research sessions untouched (verified 2026-08-22).** Every session must update this table with real results, not just add new rows elsewhere and leave this one stale. A ✅ means genuinely tested against the CURRENT locked pool for that track with a real, reported result. A ❌ means genuinely never done. Do not mark ✅ without a real result you can cite.

| Technique | Goblin | Regular | Demon | Sleeper | Underdog |
|---|---|---|---|---|---|
| Granular per-(prop,side,tier) multiplier (never a flat blended ratio) | ❌ (used flat 0.620 three sessions running) | N/A (single prop, flat published table confirmed at 1.000) | ✅ | N/A (dynamic per-leg formula) | ✅ (compounding model confirmed) |
| Multi-layer stacking (weather / bullpen fatigue / park factors / schedule fatigue) | ❌ | ❌ (only tested on the retired Gen-1 signal, never on the current one) | ❌ | ❌ | ❌ |
| Shrink/expand adaptive sizing | ❌ | ❌ (template exists, built for retired Gen-1 signal, never re-applied to current signal) | ❌ | ❌ | ❌ |
| Pool-composition alternatives tested (not just size/cap sweeps on one fixed pool) | ⚠️ partial | ⚠️ partial (rare-event pool tried, not fully resolved) | ✅ (Pool I) | ✅ (rbis+walks+rfi_nrfi found) | ❌ (35 configs swept, all one pool) |
| Cap sweep (fixed AND percentage, multiple values) | ⚠️ partial | ✅ | ⚠️ partial (percentage vs fixed shown, not a full multi-value sweep) | ✅ | ✅ |
| Cross-app signal transfer attempted | — | ❌ | — | ✅ (Underdog pool ported in) | — |
| Void/DNP-adjusted real pricing applied to backtest ROI | N/A (pitcher-heavy) | N/A (zero void exposure, confirmed) | N/A (pitcher props) | ❌ (real ~7% void rate found, never applied to reprice) | ❌ (hitter props, void rate never applied) |
| Gemini consulted for a NEW, previously-untested hypothesis (not fact-checking an existing claim) | ❌ | ❌ | ❌ | ❌ | ❌ |

**Every session must move at least two ❌ cells to ✅ or ⚠️→✅, with a real cited result.** A session that adds new findings elsewhere but leaves this matrix unchanged has not met the exhaustiveness bar. If a cell is genuinely blocked (e.g., by the lineup-join failure below), say so explicitly in that cell rather than leaving it silently blank.

**Standing blocker, unfixed after three sessions of being flagged**: `context.history_game_lineup` joins to the graded board on only ~2-5% of legs. This blocks bottom-of-order re-testing (Regular row above) AND real void/DNP modeling (both hitter-prop rows above), since `batting_order_position` / participation data would resolve both. **Diagnosing and fixing this join is now the single highest-priority open item in this entire document** — it is the root blocker behind four separate ❌ cells above.

---



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

## NEW REAL FINDINGS — 2026-08-22 coworker session (independently verified by me where noted)

- **Rounding-mode bug — VERIFIED REAL by direct testing.** Postgres `round()` on a `double precision` column uses banker's/round-half-to-even (0.5→0, 2.5→2); the live deployed system's JavaScript `Math.round()` uses round-half-up (0.5→1, 2.5→3). I tested this myself directly and confirmed it. `backtest.demon_full_history_dedup`'s `tier` column was `double precision`, meaning it silently used the wrong rounding convention on every X.5-distance leg — 940 of 6,488 rows (14.5%) were affected. **Rebuilt as `backtest.demon_full_history_dedup_v2` using `numeric` rounding (matches live `Math.round()`) — use this table going forward, not the original.** Note: my rebuild produced 3,351 rows vs. the coworker's own reconciled 3,155 — a small, unresolved discrepancy worth a future session checking, not yet fully explained.
- **Demon "Pool I"**: `pitcher_strikeouts` + `earned_runs`, both `/less`, tiers 1+2 combined — beats the single-prop deployed pool on every axis once corrected for the rounding bug: 13-14 real supporting days (vs. the deployed pool's 4 ex-08-11), LOO band +384.3% to +404.5%. **Real, credible, worth strong consideration for promotion — needs your explicit decision, not yet deployed.**
- **Underdog reconfirmed negative** by a second, independent research pass (35 configs swept, none positive, locked config worse than -34%) — converges with the flat-vs-compounding discount bug independently verified the session before. Two separate lines of evidence now agree this track is broken as deployed.
- **Sleeper cap=1 refinement**: nearly doubles the deployed pool's ROI (+198.8% at cap=3 → +382.7% at cap=1, real 27/27 real days) — real, credible, worth considering.
- **Hard rule, added after a real gap found**: any Goblin analysis MUST use the granular per-(prop,side,tier) `GOBLIN_LEG_MULT_TABLE` (see `MULTIPLIER_TABLES_MASTER.md`), never a single flat per-leg ratio. A 2026-08-22 research pass used a flat "0.620" ratio for its entire Goblin analysis, directly contradicting this document's own core lesson (multipliers are never flat) — that specific finding should be re-run with the granular table before being trusted.

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
