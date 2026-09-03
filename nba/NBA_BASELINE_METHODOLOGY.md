# NBA Project — Baseline Projection Methodology (the "heart of the system")

*Written 2026-09-03, after the historical backfill was completed and verified. Revised same day per a real, correct architectural pushback: the original draft blurred baseline (historical-only) with enrichment (daily-arriving injury/market data), which conflicts with the originally locked 3-run architecture. This revision keeps them properly separated and independently confirms that separation is the right call, not just accepting the correction — see Section 0. No scoring code built yet; this remains a design document. Per the project's standing rule: Gemini is a reference, not gospel — treated as a strong starting design, to be independently validated against real backtests once built.*

---

## 0. Architecture correction — baseline (historical-only) vs. enrichment (daily-context), kept properly separate

The original locked operating model already specifies this: **"Delta daily" builds the baseline from historical game logs**, while **injury, referee, arena, and fatigue enrichment live in the separate "Daily Context" stage of the Master run**, combined with baseline and market data only at the final **Scoring Engine** stage. An earlier draft of this doc broke that separation by baking live injury checks and market-anchoring directly into baseline steps — flagged as wrong, and confirmed wrong via a second Gemini consultation, not just taken on faith:

**Why the two-stage separation is correct, not just "how it was originally planned"**:
- **Performance/caching**: the baseline (EWMA rates, historical minutes role, per-36/per-100-possession efficiency) is expensive to compute but only changes after a player actually plays a game — it can be computed once and cached. Enrichment data (injury news, line movement) changes constantly throughout the day. Keeping them separate means the fast-changing Scoring Engine can re-run in milliseconds on new injury/odds data without re-computing the expensive baseline every time. Merging them would force a full slow recompute on every minor daily update.
- **Debuggability**: when a projection looks wrong, a two-stage system lets you isolate whether the problem is in the player's historical rate (baseline bug) or in today's specific adjustment (enrichment bug). A merged pipeline just gives one wrong number with no way to localize the cause.
- **Explainability**: a clean two-stage system can narrate "baseline X, +10% for teammate injury, −5% for tough matchup, final Y" — genuinely useful for understanding and trusting the model's output, not just a black box.

**A genuinely unified (single-model) alternative exists but isn't recommended here**: a large ML model (gradient boosting, neural net) fed a single giant feature vector per player-game could in principle capture complex, non-linear interactions a multiplier system can't (e.g. "referee A + back-to-back + teammate injury together drop assists by an amount none of the three would alone predict"). This is only worth it with very large clean datasets, heavy compute, and when explainability is not required — none of which currently applies here. **Recommendation: keep the two-stage architecture.**

---

## 1. The baseline pipeline — historical-only, cacheable, no live daily dependency

Every step below uses only data that doesn't change until the player's next game is played — nothing here needs today's injury report or today's odds.

1. **Base per-36-minute rate (EWMA)**: an Exponentially Weighted Moving Average of the player's per-36 rate for the target stat, computed from `nba_stats.player_game_log`. Recent games count more without a hard cutoff. Tunable: `alpha` (suggested starting value 0.2, ≈9-game effective lookback — must live in `nba_config.system_settings`, never hardcoded).
   - **Small-sample handling (Bayesian shrinkage)**: for players with few games this season (rookies, injury returners), blend the EWMA toward a prior from `nba_stats.player_career_season_totals` (age-adjusted) or a league/position average for true rookies. Blend weight scales with games played (e.g. `games_played / 15`, capped at 1.0).
2. **Historical minutes role**: a baseline minutes projection from the player's own game logs alone (EWMA or rolling mean + standard deviation over the last 10–20 games), representing "in a generic game, what is this player's role" — deliberately not adjusted for today's injuries yet.
3. **Player's per-possession/per-minute efficiency profile**: usage%, points/rebounds/assists per-36 or per-100-possessions — a stable, historical description of the player's talent and role, independent of tonight's specific opponent or context.
4. **Pace and opponent-defense adjustments**: these use the *opponent's* season-long pace/defensive tendencies (`nba_team.team_game_log_advanced`, already historical, known well before game day) — not today's live odds, so this stays in baseline.
5. **Raw baseline projection**: `(shrunken_rate / 36) × historical_minutes × pace_multiplier × defense_multiplier`, plus the rolling-window variance (Section 2) and trend factor (Section 3) computed alongside it.

**Output of this stage, cached per player**: a projection distribution (mean + variance) and a trend indicator — all computed from historical data, valid until the player's next game, genuinely fast to re-serve without recomputation in between.

---

## 2. Variation (volatility) — part of the baseline, not enrichment

A single projected number is insufficient for pricing an over/under line. Use rolling-window standard deviation (e.g. last 20 games from `player_game_log`) as the volatility measure alongside the point projection — this is historical, so it belongs in the cacheable baseline stage, not enrichment. Turns the projection into a real distribution (mean + spread), enabling a genuine "fair price" the model can compare against the market's price to find value.

**Practical value already visible in this project's own data**: a player with a large Shot Quality Delta swing or wide play-type variance (both already built) would be expected to show higher rolling variance — a natural cross-check once real backtesting begins.

---

## 3. Direction (trend) — also historical, also part of the baseline

EWMA already captures the *level* of recent performance; a separate "trend" signal captures the *rate of change*, and it's still purely historical:

- Compute a second, faster EWMA (e.g. `alpha` ≈0.5, ~3-game lookback) alongside the primary one.
- `trend_factor = fast_EWMA / primary_EWMA` — greater than 1 means heating up, less than 1 means cooling off.
- Apply as a **dampened** multiplier (e.g. `1 + (trend_factor − 1) × dampening_factor`, dampening suggested ≈0.25) — avoids double-counting, since some of the trend is already baked into the primary EWMA.

---

## 4. Enrichment stage (Daily Context + Market) — applied on top of the cached baseline, separately, fast

This is where today's live, fast-changing data enters — deliberately kept out of Section 1–3 above.

**`Primary_Playmaker_Absence_Bonus`** (concrete, tunable example): when a team's primary ball-handler (high usage% + high assist%, from `nba_stats.player_season_profile`) is confirmed out **today**, adjust the secondary playmaker's minutes/assist projection.

- Configurable parameters (`nba_config.system_settings`): `trigger_teammate_usage_threshold` (e.g. 26.0), `trigger_teammate_ast_pct_threshold` (e.g. 28.0), `target_player_position_filter` (e.g. "PG,SG"), `assist_rate_bonus_multiplier` (e.g. 1.15), and a separate `minutes_adjustment` (e.g. +6 minutes to the primary backup) — additive to the baseline's historical minutes, not a re-derivation of it.

**Other real enrichment adjustments, applied the same way (additive/multiplicative on top of the cached baseline, using today's data)**:
- **Blowout factor**: from today's Vegas spread — if the spread exceeds a threshold, apply a negative minutes adjustment to starters (e.g. −3 minutes), since blowouts shorten star minutes.
- **Fatigue**: back-to-back or travel-distance flags (from the schedule already built) → a small negative minutes/efficiency adjustment.
- **Team-total anchoring, correctly placed here, not in baseline**: sum every teammate's *enrichment-adjusted* projection into a bottom-up team total, compare against today's market-implied team total (live odds, not yet built), and scale by the ratio — this belongs in the Scoring Engine specifically because it needs today's market data, which the cached baseline should never depend on.

**Final Scoring Engine formula, order matters and must be fixed/documented, not ad hoc**: `Final = (Baseline_Rate) × (Baseline_Minutes + Injury_Adj − Blowout_Adj − Fatigue_Adj) × Pace_Multiplier × Defense_Multiplier`, then reconciled against the market-implied team total.

---

## 5. Real risks in this two-stage separation, named directly (not just "it's correct, done")

- **Double-counting**: the most dangerous risk. If the baseline's historical minutes already reflect a player's real blowout-shortened games, and enrichment applies *another* negative adjustment for today's spread, the player gets penalized twice. Mitigation: baseline models "performance in this player's average historical context"; enrichment models only the *deviation* from that average based on today's specific information — keep this distinction explicit in code and documentation, not just in this doc.
- **Order of operations**: `(Base × 1.1) × 1.2` ≠ `(Base × 1.2) × 1.1`, and additive vs. multiplicative adjustments compose differently depending on order. Mitigation: one rigid, documented formula in the Scoring Engine; every new adjustment module built with that exact formula in mind.
- **Baseline staleness**: the cache assumption ("only changes after the player's next game") breaks for a trade, a season-ending injury, or a coaching change. Mitigation: event-based cache invalidation triggers (a trade, a player ruled out for the season) force a baseline recompute outside the normal cadence.
- **Missed interactions**: the multiplier approach assumes factors are mostly independent — a real limitation vs. a unified model (Section 0), accepted as the cost of this architecture's other benefits. Start simple; add explicit interaction terms only once real backtests show they're needed.

---

## 6. Concrete example of a real, tunable rule (repeated from Section 4 for reference)
See Section 4's `Primary_Playmaker_Absence_Bonus` — this is an enrichment-stage rule, not a baseline calculation, per the correction in Section 0.

---

## 7. Honest difficulty assessment — what's solved vs. genuinely hard

**Solved, well-understood — an engineering task, not a research problem**: EWMA/variance calculation, the rule-engine pattern for enrichment bonuses/penalties, opponent pace/defense adjustments using historical data.

**Genuinely hard, stated plainly rather than glossed over**:
- **Minutes projection is the single biggest source of error in any player-prop model** — driven by coaching decisions, foul trouble, blowouts, in-game injuries. Both the historical baseline role AND the daily enrichment adjustments are necessary starting points, not a solved problem.
- **Cascading injury effects** are a real network problem, not a single rule — one absence ripples through usage/efficiency/rebounding for multiple teammates at once. The rule in Section 4 is a first-order approximation; the on/off-court data already built is the right long-term tool for refining this.
- **Player-vs-player defensive matchups** (not just team-vs-position) are the next frontier beyond this system and require data this project doesn't have (granular defender-tracking) — stick to team-level adjustments for now.
- **"Soft" factors** (revenge games, contract-year motivation) are extremely hard to model without overfitting. The market-anchoring step in Section 4 is the honest, practical answer — the market already prices much of this in.

---

## 8. What this depends on that isn't built yet (enrichment/market side only — baseline has no such dependency now)
- The daily injury/lineup confirmation layer — part of the planned Daily Context stage, not yet built.
- The live-odds/market layer — part of the planned Market/Odds stage, not yet built.
- Defense-vs-position splits from real game logs — now buildable, since real game logs exist as of this session's backfill, and belongs in the baseline stage (historical, not daily) once built.

**The baseline pipeline itself (Sections 1–3) has zero dependency on anything not yet built** — it can be implemented and run today against the historical data already backfilled and verified.

---
