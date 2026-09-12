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

## 3a. CONSERVATION — minutes and usage are finite (research 2026-09-12)

**The flaw in the first draft of this document**: independent per-player multipliers cannot respect a
team's **240 minutes** and ~100 possessions. Every serious system treats an absence as a *redistribution
of a fixed pool*, not as independent lifts.

Sources: FiveThirtyEight's method (rank-ordered depth chart, unavailable players removed, minutes
allocated by position with primary-then-secondary eligibility, plus a talent penalty when a player is
forced far above his projected MPG); RotoGrinders (240 minutes; injuries, role changes and blowouts are
the three rotation movers); Unabated (sharp prop shop) runs **conditional projection sets** — a base set
and an alternate set with the questionable player out — which is independent confirmation of our
scenario precompute; the feature-engineering literature calls usage redistribution the **Wally Pipp
effect** and uses with/without lineup-level usage differentials.

**Three candidate mechanisms and their failure modes** (Gemini, consistent with the sources):

| Mechanism | Failure mode |
|---|---|
| (a) proportional to baseline share, then renormalize | **positionally agnostic** — an out center sends minutes to the backup PG; renormalization smears error across players who were unaffected |
| (b) depth-chart / positional flow | **rigid** — misses small-ball responses; the "next man up" fallacy (a star out changes the whole offensive structure, not one slot) |
| (c) multipliers then global renormalization | **worst** — systematically under-projects stable players to absorb error created elsewhere |

**Decision — fitted FLOW model with the constraint built in, not bolted on:**

```
vacated_minutes(X)  -> share vector over remaining players, FITTED by (role of X, role of receiver,
                       direct-backup flag, positional group), shrunk toward the coarser level
vacated_usage(X)    -> a SEPARATE share vector (usage does not follow minutes 1:1 — the player who
                       takes the minutes is often not the one who takes the shots)
constraint          -> shares sum to 1 by construction, so team minutes stay 240 and usage conserves
never               -> a post-hoc global renormalization that touches unaffected players
```

Small-ball and structural responses are handled by fitting the flow **conditional on the absent
player's role**, so "center out → forward minutes" is learned rather than assumed.

## 3b. RATE IS DEPENDENT, NOT AN INDEPENDENT MULTIPLIER

Minutes and per-minute rate move together when a teammate is out, so fitting them as two independent
multipliers double-counts. The causal chain is: absence → usage vacuum → the beneficiary absorbs usage →
his rate changes. So:

```
m'  = baseline minutes + flow-allocated vacated minutes          (constrained)
u'  = baseline usage   + flow-allocated vacated usage            (constrained)
r'  = f(r_baseline, m', u_absorbed)      <- rate is a FUNCTION of the new state, not a free multiplier
```

This also localizes the double-count check with the market layer: the market adjuster must never be
allowed to re-express the same absence signal that already moved m' and u'.

## 3c. SELECTION BIAS in with/without splits — the trap that would silently inflate everything

Historical "without" games are **not** a random sample. They are contaminated by *why* the player was
out:
- **blowouts** — beneficiaries' rates inflated in garbage time against third-stringers;
- **load management** — the star rests against a weak opponent, so the context is non-competitive;
- **in-game injuries** — partial-game data confounds both sides.

Mitigations, all available to us:
1. **Fit only on PRE-GAME ruled-out absences**, which we can identify exactly because we hold the
   injury-report archive at its publish timestamps (this is the cleanest signal and is what our as-of
   parity rule already gives us).
2. **Condition on context** — opponent strength, projected spread, and the blowout/competitive flag the
   baseline already computes; the harness's competitive-minutes definition excludes garbage time.
3. **Exclude in-game exits** (the baseline's <5-minute and injury-exit filters).

## 3d. FITTING — partial pooling, not independent cells

A key keyed prop × direction × band × role × factor tier is sparse over three seasons. Fitting an
independent mean per cell is the textbook overfit: a cell with 3 observations is trusted absolutely.
The principled options are **hierarchical partial pooling** (each cell's effect drawn from a
distribution centred on its parent level, shrinkage set by the data) or a **regularized interaction
regression** (Ridge first; Lasso only if selection is wanted).

Our baseline's existing machinery is already approximately this — hierarchical cells with `n/(n+k)`
shrinkage toward a coarser level and a measured, not seeded, prior strength — so the enrichment layer
reuses it rather than inventing a second scheme. What changes from the first draft: the fallback chain
is explicitly a **pooling hierarchy** (cell → parent → prop-level → 1.0), the shrinkage constant is
fitted per factor family, and the two-season sign rule stays as the acceptance gate.



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
