# SESSION 2026-08-31 / 09-01 — PrizePicks gate re-calibration after the baseline fix

*Read `ALPHADOG_REALIGNMENT.md` first. This document does not supersede it; it adds to it and
records five retractions made during this session.*

---

## 00. WHAT TO DO NEXT — start here

The work is **blocked on one measurement, not on analysis**. Everything below is done.

**The single open action:** place (or just build and read, no stake needed) one homogeneous slip
per candidate cell and record the real app-displayed multiplier. Every remaining question in this
document resolves on real `m` values. Priority order: `runs/less/1.5`, `stolen_bases/less/0.5`,
`total_bases/less/3.5`, `home_runs/less/0.5`.

**Do not re-run the prop-line matrix.** It is built, lane-verified and stored (§2).

---

## 1. FIVE RETRACTIONS FROM THIS SESSION — all mine, all recorded rather than buried

1. **`+69.5%` / `+71.3%` / `+73.1%` / `+84.8%` PrizePicks ROI figures — ALL RETRACTED.** Each was
   produced by applying a **prop-level** multiplier to a **specific cell**, which Item 10 of the
   realignment standard forbids explicitly. I used 1.1926 for `total_bases/3.5` (real measured:
   **1.1447**), 1.1651 for `home_runs/0.5` (real: **1.149**), 1.1228 for `stolen_bases/0.5`
   (real: **1.157**). Correcting to measured rates moves `+39.2%` to `+8.9%` on the same slips.
2. **`+2.6%` "corrected" PrizePicks figure — ALSO RETRACTED.** I over-corrected using an
   `allowed_wager_types='under_or_over'` filter, then wrongly overturned that filter using saved
   slips as evidence of placement. The filter is CORRECT (§4).
3. **Sleeper "control band lands at exactly 50.00%" — RETRACTED as evidence.** It was an
   arithmetic identity, not a control: the leg table expands each cell into both `more` and `less`
   rows, so the flat band held exactly 204 + 204 and one of each pair must hit. I cited this three
   times as the strongest validation of the finding. It validated nothing. The finding does
   survive proper per-side decomposition, but that is a weaker claim than the one I made.
4. **"The `effectiveGamesSample` bug does not exist" — RETRACTED.** I searched only the runtime
   shrinkage path (`expansionPosteriorHp`, line 792) and declared the other chat's central claim
   wrong. The bug and its fix are in the **baseline builder** near line 8780, exactly where they
   said. Bad search, not a bad fix.
5. **`runs/less/1.5` at `p×m` = 1.2001 — RETRACTED within the same session (§5).**

---

## 2. THE PROP-LINE MATRIX — built to the full standard, stored, do not rebuild

**Table: `backtest.mx_legs`** — 61,047 goblin / 11,879 demon / 6,216 standard legs, **35 days**.

Built per the standard: lane taken from `score.final_board_history` joined on
`final_board_row_id` (Item 3, never from `prop_outcome_history`'s own flags); corrupted days
**2026-08-05, 08-06, 08-07, 08-11 excluded** (Item 3); deduped on the six-part key
(date, player, prop, side, line, game) (Item 18).

**Lane split validates against the record.** This session: goblin **73.94%** / standard **49.74%**
/ demon **19.21%**. Prior record (25 days): 73.4 / 51.3 / 19.3. Structurally coherent
(goblin > standard > demon) on 10 more days than the previous best.

### The full cell grid, real measured `m`, `p×m` stated before any ROI (Item 4)

| Cell (Goblin) | n | Days | p | m real | **p×m** | Breakeven |
|---|---|---|---|---|---|---|
| `runs/1.5/less` | 316 | 23 | 83.23% | 1.442 ⚠️ | 1.2001 | 69.35% |
| `stolen_bases/0.5/less` | 720 | 20 | 86.25% | 1.157 | **0.9979** | 86.43% |
| `total_bases/1.5/less` | 3,633 | 23 | 67.19% | 1.480 | **0.9944** | 67.57% |
| `doubles/0.5/less` | 3,812 | 23 | 84.50% | 1.157 | 0.9776 | 86.43% |
| `home_runs/0.5/less` | 1,628 | 23 | 84.64% | 1.149 | 0.9726 | 87.03% |
| `hits/1.5/less` | 3,949 | 23 | 78.15% | 1.232 | 0.9628 | 81.17% |
| `walks/0.5/less` | 4,209 | 23 | 70.35% | 1.366 | 0.9610 | 73.21% |
| `singles/1.5/less` | 1,058 | 23 | 83.46% | 1.136 | 0.9481 | 88.03% |
| `hits_runs_rbis/2.5/less` | 3,730 | 23 | 71.85% | 1.318 | 0.9470 | 75.87% |
| `rbis/0.5/less` | 4,383 | 23 | 71.85% | 1.308 | 0.9397 | 76.45% |
| `singles/0.5/less` | 1,559 | 23 | 59.85% | 1.366 | 0.8175 | 73.21% |

`runs/1.5` is struck through — see §5. **`singles/1.5` at 0.9481 independently re-confirms the
retirement of the 1.604 attribution**, third method to reach that conclusion.

**Ten of eleven cells confirm the standard's headline verdict**: the goblin ladder is priced to a
2–6% house edge at every rung. The two closest to water are `stolen_bases/0.5` (−0.2pp) and
`total_bases/1.5` (−0.4pp), both inside the uncertainty of their own multipliers.

---

## 3. THE BASELINE FIX — independently verified, keep it

The other chat's `n_eff` fix is **correct and should stay live**. Verified from scratch on this
session's own pool, not by reading their tables.

**Reproduced independently:** recency weights 0.40/0.30/0.20/0.10, Kish
`n_eff = 1/Σ(w_i²/n_i)` = **23.8** against a season count of **111.2** — a **4.67× reduction**,
matching their claimed ~4×.

**Calibration against real outcomes, 1,269 legs / 22 days:**

| Model | Band | Predicted | Actual | Error |
|---|---|---|---|---|
| buggy | ≥90 | 90.9 | **79.38%** | **+11.56** |
| buggy | 85–90 | 87.8 | 86.07% | +1.73 |
| buggy | 80–85 | 82.9 | 85.97% | −3.05 |
| **corrected** | **85–90** | 85.8 | **86.04%** | **−0.22** |
| **corrected** | **80–85** | 83.3 | **83.80%** | **−0.51** |
| corrected | ≥90 | — | *band no longer emitted* | — |

**Third independent confirmation from a different direction:** the live board's
`estimated_hit_probability_0_100` at ≥95 predicted 96.9 and delivered **82.25%** (−14.63pp).

⚠️ **`backtest.corrected_baseline_v1` cannot be used to verify anything** — `player_id` is NULL on
**7,149 of 7,191 rows (99.4%)**, so none of it joins to game logs. The fix is right; that
particular table cannot demonstrate it.

---

## 4. `allowed_wager_types` — the filter IS correct, settled with the app's own record

I overturned this filter mid-session on bad evidence and had to reinstate it. Recording the
settling measurement so nobody repeats the loop.

| Prop | Archive, all rows/day | Archive `under_or_over` | **App actually showed LESS** |
|---|---|---|---|
| `stolen_bases/0.5` | 219.0 | **39.1** | **36.4** |
| `total_bases/3.5` | 270.6 | **126.3** | **110.0** |

The app's own `final_board_history` LESS count matches `under_or_over` and matches the unfiltered
count not at all. **Any pool built without this filter is 2–4× too large and biased toward easy
unders that were never purchasable** — PrizePicks withholds the LESS side precisely where the
under is safest (measured gap: `home_runs` 90.42% withheld vs 85.29% offered).

**Saved slips are NOT evidence of placement.** 20 legs in `score.slip_legs` carry `awt='over'`;
that means the slip was recorded in AlphaDog, not that it was placeable on PrizePicks.

---

## 5. `runs/less/1.5` — opened and closed in the same session

The only cell in the matrix above `p×m` = 1.0 (1.2001), and **it is a multiplier
mis-attribution**, caught by Item 11's fair-odds check.

At p = 83.23%, fair per-leg is **1.2015**, so the claimed 1.442 implies a **−20.0% house edge** —
the book paying the bettor a fifth of every stake on a recurring line. Outside the 2–10% Goblin
corridor, in the direction the standard says is always the multiplier's fault.

**Resolved by splitting the prop by line:**

| Cell | n | Days | p | fair `1/p` |
|---|---|---|---|---|
| `runs/0.5/less` | 2,841 | 23 | **66.88%** | **1.4952** |
| `runs/1.5/less` | 316 | 23 | 83.23% | 1.2015 |

**The 1.442 belongs to the 0.5 line**, where it implies a 3.6% house edge — dead centre of the
corridor. Same line-sensitivity already proven on `singles` (0.5 → 1.366, 1.5 → 1.136). At its own
fair value `runs/1.5` prices near 1.20 and `p×m` collapses to ~1.00.

**Program status unchanged: seventeen candidates tested, zero confirmed positive.**

---

## 6. GATE CALIBRATION — the actual deliverable

The old gates (`trail ≥ 78`, `est_hp ≥ 90`, `top 10%`) were calibrated against the **buggy**
model's scale, which reached 96.9. The corrected model never emits above ~88. **A ≥90 gate now
selects zero legs.** Porting the old numbers destroys the pool.

### How to port — settled, with the reasoning

**Percentile-preserving and quantile-mapping are both WRONG.** The old top decile was not an
economically coherent population — it was a distorted sub-population produced by the variance bug
(its ≥90 band delivered 79.38%). Mapping those quantiles onto a clean distribution just preserves
the old selection bias under a new label.

**Re-derive from `p×m` breakeven.** Since the corrected model is an unbiased estimator of p, the
decision boundary stops being a statistical cut point and becomes purely economic:
`EV > 0 ⟺ p > 1/m`.

### A single global gate is indefensible — worked counter-example

At a global 82% cut:
- `singles/1.5` leg at 83.5% **passes** → `0.835 × 1.136 = 0.948` (**−5.2% EV, toxic**)
- `total_bases/1.5` leg at 78.0% **fails** → `0.780 × 1.480 = 1.154` (**+15.4% EV, discarded**)

A global gate systematically accepts negative-EV legs on low-multiplier props and rejects the
profitable ones on high-multiplier props.

### THE GATE TABLE — per cell, `1/m`, nothing else

| Cell | m | **Gate: required p** | Current pool p | Gap |
|---|---|---|---|---|
| `total_bases/1.5/less` | 1.480 | **67.57%** | 67.19% | −0.4pp |
| `runs/0.5/less` | 1.442 | **69.35%** | 66.88% | −2.5pp |
| `walks/0.5/less` | 1.366 | **73.21%** | 70.35% | −2.9pp |
| `hits_runs_rbis/2.5/less` | 1.318 | **75.87%** | 71.85% | −4.0pp |
| `rbis/0.5/less` | 1.308 | **76.45%** | 71.85% | −4.6pp |
| `hits/1.5/less` | 1.232 | **81.17%** | 78.15% | −3.0pp |
| `stolen_bases/0.5/less` | 1.157 | **86.43%** | 86.25% | **−0.2pp** |
| `doubles/0.5/less` | 1.157 | **86.43%** | 84.50% | −1.9pp |
| `home_runs/0.5/less` | 1.149 | **87.03%** | 84.64% | −2.4pp |
| `singles/1.5/less` | 1.136 | **88.03%** | 83.46% | −4.6pp |

**Every gap is negative.** The selection layer's whole job is to close 0.2–4.6pp per cell. The two
smallest gaps are the only realistic targets.

---

## 7. THE 3-DAY LIVE WIN STREAK — how much weight it carries

**Quantitatively: none.** Under a null where a day wins with p = 0.40, three straight is
`0.40³ = 6.4%`; at p = 0.50 it is `12.5%`. Neither reaches significance. Against a backtest
showing `p×m < 1`, a 3-day streak is small-sample noise, not evidence.

It is still the right instinct to refuse to over-tighten on its account — but the correct response
is the per-cell `1/m` gate above, not a loosened global threshold.

---

## 8. FALSIFICATION BAR FOR THE NEXT CANDIDATE — pre-registered

Set adversarially **before** any result was shown. Any proposed gate must clear **all** of:

1. **n ≥ 1,500 out-of-sample legs across ≥ 25 distinct days.** No single-day or single-week blocks.
2. **Strict rank monotonicity** across 5 equal-volume OOS bins, zero inversions, Spearman ρ ≥ 0.95.
3. **`E[p×m] ≥ 1.04`** — a 4% net margin, not a hair above breakeven.
4. **Lift over the ungated pool ≥ +0.06 in `p×m`**, p < 0.01, via a **10,000-resample day-blocked
   bootstrap** (resample whole slate days, never individual legs).
5. **Falsification clause:** if the 95% bootstrap lower bound on `E[p×m]` falls below **1.000**,
   the gate is rejected. No exceptions for close calls.

---

## 9. STILL OPEN — stated, not skipped

- **Per-niche research (online + Gemini) per propline** — requested, not done. Ran out of session.
- **Player-tier layer** — `backtest.mx_player` exists but was not crossed with the per-cell gates.
- **Demon and Standard lanes** — this session covered Goblin only. Demon needs the corrupted-day
  exclusion re-applied and the tier sign-flip respected (Item 9).
- **Variable-line props** (`pitcher_strikeouts`, `pitcher_outs`, `fantasy_score`) — must be
  compared **by tier**, never by line value. Not touched this session.
- **`archive.market_prop_context_history` has written nothing since 2026-08-28.** The live probe
  (`market.context_probe_player_props`) is healthy — 13,975 rows today, 21 books. The **archiver**
  is dead. Every future backtest has a hole from 08-29 onward until it is fixed.
