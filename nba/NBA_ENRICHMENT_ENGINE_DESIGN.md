# NBA Enrichment Engine — Design (2026-09-12)

How a factor becomes a number. The lock (`NBA_ENRICHMENT_FACTOR_LOCK.md`, passes 1–5) says WHAT the
factors and sub-factors are; this says HOW they change the hit probability, and how that stays
calibrated at the leg level on both seasons — the same standard the baseline meets (COMPASS fact 5).

---

## 1. The rule: adjust components, never the probability

An enrichment factor NEVER multiplies or shifts a probability directly. It adjusts the **components**
the baseline already uses, and the same distribution → CDF machinery produces the enriched number.

```
baseline (as-of, calibrated)        enrichment adjusts            same machinery
  projected minutes      m    ->    m' = m × Πᵢ mult_minutes(cellᵢ)
  per-minute rate        r    ->    r' = r × Πᵢ mult_rate(cellᵢ)
  dispersion             φ    ->    φ' = φ × Πᵢ mult_disp(cellᵢ)
  P(plays)               p    ->    p' = p × Πᵢ mult_avail(cellᵢ)
                                     |
                                     v
                          distribution(m', r', φ') -> P(stat > line) per rung
                                     |
                                     v
                          × p'  (+ operator settlement handled by the slip engine)
                                     |
                                     v
                          enrichment Platt per (prop, band, direction, rung)
                                     |
                                     v
                                 FINAL HIT PROBABILITY
```

Why this and not a probability adjustment:
1. **Monotonicity is free.** A minutes lift raises More on every rung and lowers Less, in the right
   proportions, automatically. Probability nudges break the ladder's internal consistency.
2. **Anchor-band asymmetry is free.** §3 of the lock says redistribution is multiplicative on rate and
   additive on minutes, so More on high anchors must move faster than Less on low anchors. Pushing the
   components reproduces that; a flat pp adjustment does not.
3. **Double-counting is visible.** Every factor declares which component it touches, so two factors
   claiming the same minutes lift collide loudly instead of compounding silently (lock P3.5).
4. **Calibration survives.** The baseline's certified shape is preserved; only its inputs move.

Exception: pure **confidence** factors (E-group) touch no component — they widen or narrow the
reported confidence and can gate a leg, but never move the probability.

---

## 2. The cell: how each factor's magnitude is fitted

Each factor contributes **multipliers looked up from a residual cell**, fitted the same way the
baseline's empirical cells are (COMPASS fact 16):

```
cell key = prop × direction × anchor band × role tier × factor tier (× sub-factor tier)
value    = measured ratio of ACTUAL to BASELINE-PREDICTED, on the component, as-of
fallback = coarser cell (drop sub-factor tier → drop role tier → prop-level) → 1.0
```

Rules, all inherited from what the baseline already proved:
- **Minimum n** per cell (start 300, same as the baseline) or fall through the hierarchy.
- **Shrinkage** toward the coarser level with a measured, not seeded, prior strength: `n/(n+k)`.
- **Two-season rule**: a cell is kept only if it holds on BOTH seasons with the same sign. A cell that
  works in one season and flips in the other is noise (the 3PA regime lesson).
- **As-of only**: cells are fitted on data strictly before the game day being scored (`nba_asof.py`).
- **Residual over the baseline**: measured against what the baseline already predicted, so a factor
  the baseline carries (pace, opponent profile, B2B, DvP, with/without) contributes ~1.0 and drops out.

---

## 3. Factor → component map (which knob each factor turns)

| Factor | m | r | φ | p | Notes |
|---|---|---|---|---|---|
| A1 own status (Out/Doubtful/Q/Probable) | ✓ | | ✓ | ✓ | Out → p=0 (leg voids); Q → p from N1; Probable → small m cut |
| A2 teammate out — redistribution | ✓ | ✓ | | | the big one; rate lift by vacated-usage tier × archetype |
| A2b dependent teammate (negative branch) | ✓ | ✓ | | | minutes UP, rate DOWN — the archetype trap |
| A3 return ramp | ✓ | | ✓ | | measured: 0.87/0.97/1.01 · 0.79/0.92/0.96 · 0.72/0.84/0.92/1.00 |
| A4 rest / B2B | | | | ✓ | measured absence prior (base 10.4%, star road B2B 17.6%) |
| A5 lineup change (projected) | ✓ | ✓ | | | starter↔bench is a minutes AND role change |
| A6 late scratch | ✓ | ✓ | ✓ | ✓ | phase-2 only; triggers a team rescore |
| B1/B2 spread & total delta | ✓ | ✓ | | | delta vs our derived spread → minutes mixture weights |
| B3 leverage | ✓ | | | ✓ | standings-lock rest risk, closing-lineup minutes |
| B4 opponent availability | | ✓ | | | opponent rim protector out → rate up for interior scorers |
| M1 primary defender quality | | ✓ | | | measured −5.5% toughest quintile → +6.7% easiest, elasticity 0.39 |
| M2 scheme, M3 hustle, M4 clutch | | ✓ | | | M4 is 4Q/2H only |
| K1 coach rotation profile | ✓ | | ✓ | | multiplies the blowout gate and the leverage booster |
| D1 referee crew | | ✓ | ✓ | | fouls/FTM/pace; tertiary — accept only if it holds on both seasons |
| D2 schedule / travel | ✓ | | | ✓ | 3-in-4, time-zone, long road |
| C1/C2 market gap, C3 movement | | | | | **ranking and confidence only — never a component** (owner: market is an adjuster) |
| E1–E4 confidence | | | | | widen/narrow confidence, can gate; no component |

---

## 4. The absence problem: one absence changes BOTH rosters

A scenario is defined **per game**, not per player, because a single OUT propagates:

**Own team** — vacated minutes redistribute through K1 (coach rotation: direct backup vs committee),
vacated usage redistributes by A2 tiers and archetype, the dependent-teammate branch pushes some
rates DOWN, starter promotion changes role tier (which changes WHICH cells apply), and team pace and
defensive rating shift.

**Opponent** — the expected primary defender changes (recompute M1 for every opposing scorer), rim
protection and blocks-against vulnerability move (B4), and the projected spread/total move, which
feeds back into the minutes mixture (B1/B2).

So the scenario unit is the joint availability set of both teams; scoring a scenario means re-running
the component adjustments for ~2,000 rows per game. Phase-2 selection then picks the realized branch.

---

## 5. Enrichment Platt: why a final calibration layer is mandatory

Multiplying components moves probabilities correctly in SHAPE but not necessarily in SCALE — several
small lifts compound into overconfidence. So, exactly as the baseline does per rung, the enriched
probability passes a **Platt calibration fitted per (prop, band, direction, rung) on train seasons
only**. Acceptance is the baseline's own standard (COMPASS fact 5):

- every band × direction × rung within tolerance on BOTH seasons,
- confidence bands hit their stated rate,
- and — the enrichment-specific test — **enriched must beat baseline** on log-loss/Brier at the leg
  level. A factor set that is calibrated but no sharper than the baseline is not worth shipping.

---

## 6. Build order (deepest effect first, each fitted and certified before the next)

1. **A2 redistribution** + A2b dependent branch (largest measured effect; needs the absence panel)
2. **A1/N1 own status and P(plays|Q)** by team and reason class
3. **A5 projected lineup** (as-of proxy; box-score starters are the target, never an input)
4. **M1 defender quality** (already measured; needs wiring as a residual cell) + **B4**
5. **B1/B2 spread/total delta** → minutes mixture
6. **K1 coach**, **A3/A4** (measured, need cell form), **D2**
7. **D1 referees**, **M2/M3/M4** (tertiary; two-season gate)
8. **E-group confidence** and gates
9. Enrichment Platt, then replication across all game-days, then grading vs the two-season boards

---

## 7. Artifacts

| Thing | Where |
|---|---|
| Factor cells (fitted) | `nba_score.enrichment_cells` (prop, direction, band, role, factor, tier, component, mult, n, seasons_held) |
| Day-by-day factor values | `nba_score.factor_daily` (game_date, player_id/team_id, factor, tier, value) |
| Scenario precompute | `nba_score.scenario_scores` (game_date, game_id, scenario_key, player_id, prop, line, p_more) |
| Final enriched board | `nba_score.enriched_board` (+ score, confidence) |
| Baseline it reads | `nba_score.baseline_history` (29 props × 2 seasons) / `baseline_ladder` (live) |
| Truth for fitting | `nba_market.board_outcomes`, game logs |
