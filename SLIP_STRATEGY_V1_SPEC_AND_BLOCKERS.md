# SLIP STRATEGY V1 — SPEC, BACKTEST, AND DEPLOYMENT BLOCKERS
Date: 2026-09-03
Status: **NOT DEPLOYED — BLOCKED. See Section 6.**

---

## 0. TL;DR

A 5-pick **Power** slip strategy over 6 goblin cells backtests at **+70.9% ROI**
(43 slips, 36 days, bootstrap 100%, CI [+41.6%, +99%]). Raising the leftover-slip
minimum to 4 legs improves it to **+93.4% ROI** (33 slips).

**It is NOT deployed.** Verification of the live pipeline (requested before deploy)
found that the baseline signal used in the backtest is **not the baseline the live
system uses**. Three different baseline objects exist. This must be resolved first.

---

## 1. FINAL STRATEGY CONFIG

Platform: PrizePicks. Entry type: **POWER** (not Flex — see Section 4).
Slip size: target 5, minimum 4 (leftover slips below 4 legs are NOT played).
Stake: flat per slip.

### Cells (all goblin variants only)

| Cell | Side | Signal | Cap (daily rank) | Multiplier | Breakeven |
|---|---|---|---|---|---|
| `total_bases` tier2 over | less | deep trailing | 1–3 | 1.2447 | 80.34% |
| `pitcher_strikeouts` tier2 over | less | shallow trailing | 1 only | 1.2743 | 78.47% |
| `doubles` tier0 over | less | deep trailing | 1 only | 1.1247 | 88.91% |
| `hits_allowed` tier2 under | more | shallow trailing | 1 only | 1.1832 | 84.52% |
| `hits_allowed` tier2 over | less | shallow trailing | 1–2 | 1.1832 | 84.52% |
| `walks_allowed` tier1 under | more | deep trailing | 1 only | 1.1362 | 88.01% |

### Signal definitions

- **deep trailing** — player's rate of clearing that exact line, computed from FULL
  season `stats_hitter.game_logs` / `stats_pitcher.game_logs` (~97–104 games for
  hitters, ~20 starts for pitchers). Requires >= 10 prior games.
- **shallow trailing** — player's rate of clearing, computed only from prior graded
  board legs (`backtest.full_board_graded_v1`). Requires >= 3 prior legs.
- **final HP** — `score.final_board_history.estimated_hit_probability_0_100`.

**Signal choice is per-cell and is NOT interchangeable.** Measured EV per leg:

| Cell | deep | shallow | final HP |
|---|---|---|---|
| total_bases t2 | **+15.6%** | +5.3% | +15.6% |
| pitcher_strikeouts t2 | −15.5% | **+12.7%** | −15.5% |
| doubles t0 | **+12.5%** | −4.4% | −10.0% |
| hits_allowed under | +4.1% | **+8.9%** | +3.5% |
| walks_allowed t1 | **+8.5%** | +3.7% | +8.5% |

Pitchers need RECENCY (20 starts, opponent/park matter). Hitters need DEPTH (~100 games).
Using deep trailing on `pitcher_strikeouts` costs 28 points of EV.

### Excluded cells (measured negative, do not add back without new evidence)

- `home_runs` tier0 — real 4-pick price 1.1419 (BE 87.58%) vs hit rates 81–85%. **−3% to −7%.**
- `earned_runs` tier2 over — negative on all three signals at every cap (best −4.8%).
- `stolen_bases`, `runs`, `singles`, `fantasy_score`, `triples`, all Standard/Regular
  lines, and **all Demon cells at every tier** (demon EV −39% to −55% at real prices).

---

## 2. BACKTEST RESULTS

Method: real morning board snapshots (`score.final_board_batches`, batch nearest
16:00 UTC = 9am PT, >= 300 rows), real graded outcomes, real measured multipliers.
Window 2026-07-25 → 2026-09-03 (41 calendar days; 32 played, 4 with <2 qualified
legs, 5 with no snapshot).

| Config | Slips | Legs | Leg acc | ROI | Profit ($1/slip) |
|---|---|---|---|---|---|
| target5 min2 | 43 | 175 | 94.3% | **+70.9%** | +$30.47 |
| target5 min3 | 34 | — | — | +87.7% | +$29.82 |
| **target5 min4** | **33** | — | — | **+93.4%** | **+$30.82** |
| target5 min5 (strict) | 22 | — | — | +119.3% | +$26.25 |
| target4 min2 | 48 | 164 | 93.9% | +51.5% | +$24.73 |
| target3 min2 | 65 | — | — | +39.2% | +$25.49 |
| target2 | 82 | — | — | +27.4% | +$22.45 |
| target6 min2 | 43 | — | — | +64.1% | +$27.56 |

5-pick is a genuine peak — 6-pick is worse. At ~94% leg accuracy each extra leg
costs ~6% of full-hit probability but multiplies payout ~1.20x; that trade wins up
to 5 legs and reverses at 6.

### Gates (target5 min2)
- Day-block bootstrap (2000 resamples): **100.0% positive**
- 95% CI: **[+41.6%, +99%]** — excludes zero
- Leave-one-day-out: stays positive across all days
- Profitable days: 27 / 32
- Best-day share of profit: within gate
- Max drawdown: **−$0.31** (day 3)
- Split-sample (train ≤08-15 / test >08-15): target4 **+50.8% → +45.0%**,
  target3 **+41.4% → +36.6%**. Out-of-sample holds.

### Day-by-day, target5 min2

| Date | Slips | Legs | Hits | Profit | Cum |
|---|---|---|---|---|---|
| 07-28 | 1 | 2 | 2 | +0.34 | +0.34 |
| 07-29 | 1 | 2 | 2 | +0.34 | +0.69 |
| 07-30 | 1 | 2 | 1 | −1.00 | −0.31 |
| 07-31 | 1 | 2 | 2 | +0.34 | +0.03 |
| 08-01 | 1 | 2 | 2 | +0.34 | +0.38 |
| 08-02 | 1 | 2 | 2 | +0.34 | +0.72 |
| 08-03 | 1 | 2 | 2 | +0.34 | +1.07 |
| 08-06 | 1 | 5 | 5 | +1.59 | +2.66 |
| 08-07 | 1 | 2 | 1 | −1.00 | +1.66 |
| 08-08 | 1 | 5 | 5 | +1.34 | +3.00 |
| 08-09 | 2 | 9 | 9 | +2.57 | +5.58 |
| 08-12 | 1 | 5 | 4 | −1.00 | +4.58 |
| 08-13 | 2 | 9 | 9 | +2.56 | +7.14 |
| 08-14 | 1 | 5 | 5 | +1.76 | +8.90 |
| 08-15 | 2 | 9 | 9 | +2.59 | +11.49 |
| 08-16 | 1 | 5 | 5 | +1.63 | +13.12 |
| 08-17 | 1 | 4 | 3 | −1.00 | +12.12 |
| 08-18 | 1 | 2 | 2 | +0.59 | +12.71 |
| 08-19 | 2 | 9 | 8 | +0.57 | +13.27 |
| 08-20 | 2 | 9 | 9 | +2.56 | +15.84 |
| 08-21 | 1 | 5 | 5 | +1.57 | +17.40 |
| 08-22 | 2 | 8 | 7 | +0.63 | +18.03 |
| 08-23 | 2 | 9 | 8 | +0.44 | +18.47 |
| 08-24 | 2 | 9 | 9 | +2.58 | +21.04 |
| 08-25 | 2 | 9 | 8 | +0.44 | +21.48 |
| 08-26 | 2 | 9 | 9 | +2.57 | +24.05 |
| 08-27 | 2 | 9 | 8 | +0.22 | +24.27 |
| 08-28 | 1 | 5 | 5 | +1.91 | +26.18 |
| 08-29 | 1 | 5 | 4 | −1.00 | +25.18 |
| 08-30 | 1 | 5 | 5 | +1.76 | +26.94 |
| 08-31 | 1 | 5 | 5 | +1.76 | +28.71 |
| 09-01 | 1 | 5 | 5 | +1.76 | +30.47 |
| **TOT** | **43** | **175** | **165** | **+30.47** | **+70.9%** |

All 5 losing days are single-slip total losses. July days are 2-leg fallbacks
(deep-trailing history immature) and are the least representative.

---

## 3. CAP WIDENING — DO NOT DO IT

| Add to every cap | Slips | Leg acc | ROI | Bootstrap |
|---|---|---|---|---|
| **0** | 43 | **94.3%** | **+70.9%** | 100.0% |
| +1 | 64 | 88.7% | +23.7% | 95.9% |
| +2 | 79 | 86.4% | +18.2% | 94.4% |
| +4 | 111 | 85.8% | +16.4% | 95.2% |
| +8 | 154 | 84.4% | **−0.3%** | 46.8% |

ROI collapses on the FIRST step and profit falls too. Leg accuracy 94.3% → 88.7%
compounds on a 5-pick: full-hit probability 74% → 55%. **Power punishes marginal
legs.** More volume must come from MORE CELLS, not deeper caps.

---

## 4. POWER vs FLEX — POWER WINS

Measured real 4-pick tiers (3 slips, live app):

| Power 4/4 | Flex 4/4 | ratio | Flex 3/4 |
|---|---|---|---|
| 2.40 | 1.50 | 0.625 | 0.50 |
| 1.60 | 1.20 | 0.750 | 0.50 |
| 1.70 | 1.40 | 0.824 | 0.50 |

Flex **lowers the all-hit tier** to ~0.73x Power and pays 0.50 on n−1.
At 94% leg accuracy the top-tier haircut costs far more than the partials return.

| Config | Power | Flex |
|---|---|---|
| target4 | **+51.5%** | +18.3% |
| target5 (TB cap 6) | **+38.9%** | +14.7% |

Flex is also fragile: at ratio 0.625 it drops to −0.3% with bootstrap 48.7%.
Power depends only on measured per-leg multipliers.

> HISTORICAL NOTE: earlier runs in this session reported Flex at +71% to +128%.
> Those were WRONG — they credited Flex with Power's full multiplier AND generous
> partials. Corrected once the "flex X/0.5" notation was clarified. Discard any
> Flex figure above +20% from prior notes.

---

## 5. LEG UNAVAILABILITY — SHRINK, DO NOT SUBSTITUTE

Tested: when a selected leg is unavailable, is it better to (a) shrink the slip, or
(b) pull a backup leg from beyond the cap?

| Drop rate | Shrink-only | Backup pool |
|---|---|---|
| 0% | **+93.4%** | +92.7% |
| 5% | **+91.9%** | +89.1% |
| 10% | **+89.7%** | +88.4% |
| 20% | **+86.9%** | +84.1% |
| 30% | **+84.2%** | +77.2% |

**Shrinking wins at every drop rate, and the gap widens as drops increase.**
Backup legs come from beyond the cap — exactly the ranks proven to dilute (Section 3).

### Required runtime behaviour
1. Build the day's qualified pool per Section 1 (per-cell signal + cap).
2. Sort by final HP desc. Take up to 5 for slip 1.
3. If a leg becomes unavailable: **remove it and shrink the slip.** Do NOT substitute.
4. Never let a slip fall below 4 legs — if it would, drop the slip entirely.
5. Leftovers form slip 2 only if >= 4 legs remain. Otherwise no second slip.

---

## 6. DEPLOYMENT BLOCKERS — MUST RESOLVE BEFORE ANY CODE SHIPS

### BLOCKER 1 (CRITICAL): three different baselines exist; the backtest used none of the live one

| Object | Keyed by | Has | Status |
|---|---|---|---|
| `backtest.baseline_adjusted_v3` | player, prop, **game_date** | `shrunk_rate`, no line/side | **What the backtest used** |
| `classification.baseline_current` | player, prop, line, side, tier | `shrunk_rate`, `hit_probability_0_100`, NO game_date | **DEAD since 2026-08-14** |
| `classification.baseline_v6_current` | player, prop, line, side, tier | `recency_blended_rate_0_100`, `prior_strength` | **LIVE — read by phase3c-certifier** |

`alphadog-v2-base-baseline.js` self-documents in its own `/health` response:
> "DEAD/STALE as of 2026-08-14, NOT read by live scoring - phase3c-certifier.js
> (the real, live HP-board worker) reads classification.baseline_v6_current
> instead, never this worker's output table (classification.baseline_current)."

Consequences:
- The backtest's baseline is **per-date and point-in-time**; the live tables are
  **current-state snapshots with no game_date**. A live implementation cannot
  reproduce the backtest ranking from `baseline_v6_current` as-is.
- The backtest baseline has **no line_value / selected_side**; live has both.
- Formula differs: backtest `shrunk_rate` vs live `recency_blended_rate_0_100`.

**Mitigation available:** the final config (Section 1) uses baseline for **zero**
cells — it uses deep trailing, shallow trailing, and final HP only. Deep trailing is
computed directly from `stats_*.game_logs` and is fully reproducible live. Final HP
comes from `score.final_board_history`, which IS live.
**Therefore this blocker may be bypassable** — but it MUST be confirmed that no cell
in the deployed config depends on any baseline table before shipping.

### BLOCKER 2: multipliers are size-dependent
Proven on `home_runs`: 1.1726 at 6 legs, 1.1419 at 4 legs (−2.6%). All rates in
Section 1 were measured on 4-picks but the config plays 5-picks. **Re-measure each
cell's multiplier on a real 5-pick before trusting the ROI figure.**

### BLOCKER 3: `line_value` null-coalesce bug
`recordRealPricingObservation` (alphadog-v2-certification-center.js, ~line 5553):
`const lineVal = leg.line_value == null ? 0 : Number(leg.line_value);`
Writes 0 when line_value is missing, making those observations permanently
unmappable to a tier. One-line fix; do it before more slips accumulate.

### BLOCKER 4: sample size
33–43 slips over 32 days. All gates pass and split-sample holds, but this is one
month. Config (signal + cap per cell) was selected in-sample; gates test robustness
to day-resampling, not to configuration selection.

---

## 7. VERIFIED REAL MULTIPLIERS (this session, live app reads)

| Cell | Per-leg | Source |
|---|---|---|
| `total_bases` t2 less | 1.2447 | pure 4-pick, 2.40 |
| `pitcher_strikeouts` t2 less (switch-point) | 1.2743 | 4 reads: 1.70/1.60/1.70/1.50 |
| `pitcher_strikeouts` t2 less (visible anchor) | 1.1832 | 1.40 |
| `hits_allowed` t2 both sides | 1.1832 | 1.40 each |
| `earned_runs` t2 less | 1.1832 | 1.40 |
| `earned_runs` t2 more | 1.0954 | 1.20, twice — DEAD, BE 91.29% |
| `home_runs` t0 less | 1.1419 (4pk) / 1.1726 (6pk) | 1.70 / 2.60 |
| `doubles` t0 less | 1.1247 | 2-equation solve |
| `walks_allowed` t1 more | 1.1362 | pricing_layer2, n=26 |

### Structural findings
- **Switch-point premium: +7.7%.** Ladders with no visible standard price ~1.2743
  vs ~1.1832 for visible-anchor ladders, same tier. Four consistent reads.
- **`pricing_layer2_tier` uses `source_key='prizepicks_goblin'`**, not `'prizepicks'`.
- Goblin `over` works for hitters; goblin `under` works for pitchers.
- Tier 2 is the sweet spot for every count-based pitcher prop.
- No Standard/Regular line in any of 20 props produced a candidate.

---

## 8. NEXT STEPS (in order)

1. Confirm the deployed config touches no baseline table (Blocker 1 mitigation).
2. Re-measure all 6 cell multipliers on real **5-pick** slips (Blocker 2).
3. Fix the `line_value` null-coalesce bug (Blocker 3).
4. Price `hitter_strikeouts` t0 more — 6,901 graded legs, 75% hit rate, zero price
   data. Largest unpriced cell in the system; would add real volume.
5. Only then write the slip-builder worker, with a backup of every touched file.
