# ANALYSIS RELIABILITY PROTOCOL
Established 2026-09-05 after a session that produced five reversed conclusions.
**This is binding on all future backtest and strategy work in this repo.**

---

## Why this exists

In one session the following numbers were reported and then reversed:

| Strategy | Reported | Actual | Cause of the error |
|---|---|---|---|
| PrizePicks goblin cells | +106.8% | -1.1% | duplicate leg fan-out |
| Underdog `rbis`+`walks` 6-pick | +345.0% | -10.0% | multiplier table overstated 3-5x |
| Sleeper `hits_runs_rbis`/more | +46.5% | -13.1% | duplicate fan-out + wrong per-leg rate |
| Sleeper top-1 by final HP | +23.9% | -11.7% | cell selection on the full window |
| **V3 (PrizePicks)** | **"fails, -42.2%"** | **+66.0% test** | **tested a DIFFERENT config and blamed V3** |

The last row is the worst of the five: a bad result from one configuration was generalized into a verdict on a different, deployed strategy. Four of the five were caught only after reporting.

---

## THE FOUR RULES

### RULE 1 — No number is reported until three contamination checks pass

Before any ROI, accuracy, or EV figure leaves a query, run all three:

1. **Row count vs expected.** Legs per day should be plausible. 800+ legs/day for one prop is fan-out, not a deep board.
2. **Duplicate check on the natural key.** `COUNT(*) - COUNT(DISTINCT natural_key)` must be 0. Natural key is `(source_key, official_date, player_id, prop, line, side)`.
3. **Sweep sanity.** Observed sweep rate vs `leg_accuracy ^ slip_size`. If observed exceeds theory by more than ~3pp, something is inflated. Stop and find it.

**Known contamination source:** `score.prop_outcome_history` carries multiple rows per (player, date, prop, line, side) - one per intraday board refresh. Any join to it without `DISTINCT ON` inflates 3-10x. Worse, `ROW_NUMBER` then hands consecutive rank slots to COPIES OF THE SAME PLAYER: measured 2026-09-05, 18 of 32 "6-pick" slips were two players repeated three times each, and three slips were ONE player six times.

**Symptoms of contamination:** leg accuracy near 99%, nearly every day perfect, no drawdown, sweep rate far above theory, implausible legs/day.

### RULE 2 — A negative result invalidates ONLY the exact thing tested

If config X fails, say "config X fails." Do not say "the strategy is dead," "the cell is worthless," or "this book is unplayable."

Different cells, caps, thresholds, signals or sizes = a DIFFERENT TEST. State which one ran.

**The failure this rule exists to prevent:** on 2026-09-05 a cell-selection test using a >=90% threshold at uniform cap 4 returned -42.2%. That result was reported as "V3 fails." V3 uses five specific cells at per-cell caps of 4/6/6/3/3 chosen by EV against measured multipliers. It was never the thing tested. The real deployed config held at +66.0% on the test half.

**Corollary:** a finding in one book does not transfer to another. Sleeper collapsing says nothing about PrizePicks - they price by different mechanisms, which was already measured.

### RULE 3 — State confidence tier explicitly on every claim

- **MEASURED** — real multiplier reads from placed slips, graded outcomes, live board contents. Highest confidence. Example: `runs t1/less = 1.1067` from a pure 4-pick reading 1.50.
- **ESTIMATED** — backtest ROI over 15-40 days with clean data and a train/test split. Directional, wide error bars.
- **SPECULATIVE** — anything from a single pass over data where the configuration was also chosen. Assume it will not replicate.

Do not present all three in the same voice. Most reversals came from speculative numbers stated as if measured.

### RULE 4 — Reversing a conclusion requires NEW EVIDENCE, not a new query

To change a previous conclusion, show specifically what changed: a data fix, a corrected join, a real multiplier read, a genuine out-of-sample result.

"I ran a different query and got a different number" is not grounds for a reversal. It is grounds for finding out why the two disagree - and one of them is usually wrong.

---

## Standing facts, by confidence tier

### MEASURED — added 2026-09-06
- **Demons and Goblins are MORE-ONLY on PrizePicks.** Official help center: "Demon and Goblin projections will only give you the option to select 'More'." The API's `allowed_wager_types = under_or_over` flag is WRONG for these rows. Any backtest leg built as the LESS side of a goblin-tagged row (a "demon LESS") or the LESS side of a demon-tagged row is a PHANTOM - it was never bettable. 22,445 such legs existed in `backtest.sig3`. Every demon number derived before this date is void.
- **Demons are priced PER PLAYER, not per cell.** Three real 3-pick reads of `hits 1.5 MORE` tier 1 on the same slate: per-leg 2.621 / 3.287 / 3.317. Same prop, line, tier - 26% spread. PrizePicks: "Demon projections vary in how much of a boost they provide." The cap-curve / cell-level method that works on goblins and regulars does NOT apply to demons. The unit of analysis is the player-leg.
- **Same-game legs carry a correlation discount.** PrizePicks: "payout rates can vary if you select multiple players within the same game." A 3-pick of three LAD hitters read 18x; mixed-game 3-picks of the same cell read 35.5-36.5x.
- **Demon pricing model:** `per_leg = 0.92 / P_book(player, line)`, then a same-game discount. Ceiling 2000x on a 6-pick = 3.55/leg. Tier-1 demons read 2.62-3.32/leg.
- **Demon edge test:** `P_ours(player) x per_leg > 1`, i.e. our probability must beat the book's implied probability by more than ~9% ON THAT PLAYER. Final HP is the only signal with per-player demon coverage, and it overstates demons by 25-35 points at every check - it must be recalibrated on the hard side before it can be used.

### MEASURED
- **PrizePicks uses a FLAT goblin discount that does NOT adjust per player.** This is the mechanism V3 exploits.
- **Sleeper and Underdog price EVERY LEG INDIVIDUALLY** and are better calibrated than our model at every confidence band. Sleeper's margin is a flat +5.8 to +6.0pp; our model's error runs +3.7pp to +19.2pp and is WORST where the model is most confident. There is no edge to find there with the current model.
- **Underdog real per-leg on `rbis 0.5 less` = 1.1907** (six placed 4-picks averaging 2.010x). The old `published x 0.6865` model overstates by 310%.
- **PrizePicks per-leg rates (direct reads):** `runs t1/less` 1.1067 (4-pick 1.50), `total_bases t3/less` 1.1583 (4-pick 1.80), `pitcher_strikeouts t2/more` visible-anchor 1.2038 (4-pick 2.10), switch-point 1.2743.
- **Switch-point ladders price ~6% richer** than visible-anchor ladders on the same cell. Confirmed twice.
- **PrizePicks prices per PLAYER as well as per cell:** identical cell mixes have come back 4.17% apart.
- **POWER beats FLEX at every size tested**, by 24-37 points, at leg accuracies above ~88%.

### ESTIMATED
- V3 (5 cells, per-cell caps, signal floor 80, 6-pick Power): +73.9% all / +66.0% test on clean deduped data, 19 slips / 15 days.
- Three of five V3 cells clear breakeven out-of-sample (`walks_allowed` t2 +10pp, `runs` t1 +4.3pp, `total_bases` t3 +4.0pp). Two are marginal: `walks_allowed` t1 (-2.7pp) and `pitcher_strikeouts` t2 (-0.3pp).

### SPECULATIVE — do not act on these
- Any single ROI figure from a 15-40 day window where cells, caps and signals were also chosen on that window.
- Cell-level EV rankings that have not survived a train/test split on cell SELECTION, not just cell performance.

---

## The core methodological trap

With ~20 candidate cells and ~40 days, **cell-and-cap selection will manufacture an apparent edge every time.** Five separate strategies in one session produced +23% to +345% headlines and all collapsed when selection was restricted to training data.

This does NOT mean every strategy is noise. It means the SELECTION step must be inside the train/test boundary, and that a strategy whose cells were chosen on the full window has not been validated no matter how good its "test half" looks.

**Forward data settles what backtests cannot.** 30-50 genuinely forward slips are worth more than any further pass over the same 40 days.
