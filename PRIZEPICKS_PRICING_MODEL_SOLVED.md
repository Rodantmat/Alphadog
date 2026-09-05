# PRIZEPICKS PRICING MODEL — SOLVED
Established 2026-09-05. Supersedes all tier-based, distance-based and flat-discount multiplier models.

---

## THE FINDING

**PrizePicks prices every goblin leg from its PROBABILITY, not from line, tier, or distance arithmetic.**

`multiplier x P(hit)` is approximately constant across every cell measured — 7 cells, 22,470 graded legs, multipliers spanning 1.1067 to 1.2179:

| Cell | Per-leg mult | Actual P(hit) | **mult x P** | EV/leg |
|---|---|---|---|---|
| `pitcher_strikeouts` 7.5 less | 1.2179 | 72.82% | 0.887 | -11.3% |
| `runs` 1.5 less | 1.1067 | 82.21% | 0.910 | -9.0% |
| `hits_runs_rbis` 3.5 less | 1.1247 | 81.52% | 0.917 | -8.3% |
| `singles` 1.5 less | 1.1067 | 83.90% | 0.929 | -7.2% |
| `total_bases` 3.5 less | 1.1129 | 84.05% | 0.935 | -6.5% |
| **`home_runs` 0.5 less** | 1.1726 | 85.46% | **1.002** | **+0.2%** |
| **`walks_allowed` 0.5 more** | 1.1892 | 85.69% | **1.019** | **+1.9%** |

**The house margin is ~8%** (mult x P clusters near 0.92). Where `mult x P > 1.0`, PrizePicks has UNDERESTIMATED the probability and the leg is +EV.

### Supporting evidence

**Identical pricing across different props.** `runs 1.5 less` (anchor 0.5) and `singles 1.5 less` (anchor 0.5) both price at **exactly 1.1067**. Two different props, same line, same anchor, identical to four decimals. PrizePicks assigned them the same P.

**Near-identical pricing at the same line and distance.** `total_bases 3.5 less` dist 2.5 = 1.1129 vs `hits_runs_rbis 3.5 less` dist 2.5 = 1.1247 — only 1.06% apart. Prop identity barely matters once the probability is fixed.

**Distance is NOT monotonic.** dist +0.5 -> 1.2017, dist +1.0 -> 1.1067, dist +2.5 -> 1.1129, dist +3.0 -> 1.1247. A larger distance should mean an easier leg and a lower multiplier. It does not, because distance is only a coordinate — P is what is priced.

**The anchor matters because it determines P.** `singles 1.5 less` prices at **1.2017** when the anchor is 1.0 (distance 0.5) but **1.1067** when the anchor is 0.5 (distance 1.0) — an 8.6% gap from the anchor alone.

---

## WHY THE PREVIOUS MODELS FAILED

| Model | Why it failed |
|---|---|
| Flat discount (0.6362 goblin ratio) | Assumes one rate for all goblins. Real rates span 1.1067-1.2179, a 10% range. |
| Tier only (t0/t1/t2) | `ROUND(ABS(line - anchor))` collapses distance 0.5 and 1.0 into the same bucket at some anchors and splits them at others. Loses the anchor. |
| Line only | Same line prices differently at different anchors — `singles 1.5 less` is 1.2017 or 1.1067 depending on anchor. |
| Compound key (prop+line+side+tier+direction) | Closest of the four, and it WORKS AS A PROXY because line+anchor+direction jointly determine P. But it is a proxy, not the mechanism. |

**The compound key is still the right lookup key in practice** — it is the finest-grained key we can compute from the board. Just understand it is standing in for P.

---

## HOW TO FIND NEW CELLS — REPLACES ALL PREVIOUS SCREENS

**Do NOT screen on hit rate.** A high hit rate means nothing on its own; PrizePicks already knows it and has priced it. `total_bases 3.5 less` hits 84.05% and is -6.5% EV.

**Screen on `multiplier x P > 1.0`.** That is the only condition that matters. It requires a REAL MULTIPLIER READ for each candidate cell — a homogeneous 4-pick where every leg shares prop, line, side and anchor.

Procedure for evaluating any candidate cell:
1. Compute P from graded history (`score.prop_outcome_history`, deduped — see ANALYSIS_RELIABILITY_PROTOCOL.md).
2. Place a pure 4-pick of that cell and record the displayed Power multiplier.
3. Per-leg = 4th root of the displayed multiplier.
4. If `per_leg x P > 1.0`, the cell is +EV. Otherwise reject regardless of how good the hit rate looks.

---

## REVISED CANDIDATE LIST

### CONFIRMED +EV (mult x P > 1.0)
| Cell | mult | P | mult x P | Status |
|---|---|---|---|---|
| `walks_allowed` 0.5 more | 1.1892 | 85.69% | **1.019** | IN V3. Best cell in the system. |
| `home_runs` 0.5 less | 1.1726 | 85.46% | **1.002** | NOT in V3. Borderline — needs an anchor-specific read. |

### CONFIRMED -EV — do not use at these prices
`pitcher_strikeouts` 7.5 less (0.887), `runs` 1.5 less (0.910), `hits_runs_rbis` 3.5 less (0.917), `singles` 1.5 less (0.929), `total_bases` 3.5 less (0.935).

**NOTE:** these are POOLED cell rates. V3 does not bet the pooled cell — it bets the top N legs by signal within the cell, whose P is materially higher than the cell average. A cell can be -EV pooled and +EV at rank 1-3. That is the entire basis of V3 and it is NOT contradicted by this table.

### The critical open question for V3
V3's cells (`pitcher_strikeouts` t2, `runs` t1, `total_bases` t3) are all **-EV at their pooled rates**. V3 only works if selection lifts P above the pooled figure by enough to cross `mult x P = 1.0`. Required P by cell, at the measured multiplier:

| Cell | mult | P needed for breakeven | Pooled P | Lift required |
|---|---|---|---|---|
| `pitcher_strikeouts` 7.5 less | 1.2179 | 82.1% | 72.82% | **+9.3pp** |
| `total_bases` 3.5 less | 1.1129 | 89.9% | 84.05% | **+5.8pp** |
| `runs` 1.5 less | 1.1067 | 90.4% | 82.21% | **+8.2pp** |
| `walks_allowed` 0.5 more | 1.1892 | 84.1% | 85.69% | **none — clears pooled** |

V3's measured test-half accuracies were 84.8%, 90.3%, 94.7% and 87.5% respectively — so three of four DO achieve the required lift. But that is the number to keep verifying forward.

---

## FALSIFIABLE TEST OUTSTANDING

`home_runs 1.5 LESS` with anchor 0.5 should read **1.1067** per leg (4-pick = 1.50), matching `singles` and `runs` at the same line and anchor. If it does, the probability model is confirmed structurally and multipliers become predictable from line+anchor without a read for every cell. If it does not, each prop needs its own calibration.

---

## MULTIPLIER TABLE — see `score.multiplier_fullkey_v1`
Keyed `(prop, line_value, side, tier, tier_direction, variant)` with a `confidence` column: MEASURED_CLEAN (homogeneous single-line single-anchor read), MEASURED_BLENDED (real read but legs spanned multiple lines or anchors), INHERITED_AVERAGE (no read, carried from a uniform correction).

**Blended reads are dangerous.** Two of three original "direct reads" were blends: `total_bases t3` averaged lines 4.5/3.5/3.5/3.5 and `pitcher_strikeouts t2` averaged 8.5/7.5/7.5/6.5. Any slip whose line mix differs from the read mix will misprice.
