# NBA Project — Baseline Projection Methodology (the "heart of the system")

*Written 2026-09-03, after the historical backfill was completed and verified. This is a design document for the baseline classification/projection system named in the original locked operating model as "the heart of the system" — no scoring code built yet. Grounded in real research (EWMA, Bayesian shrinkage, rolling variance — all standard, documented sports-analytics techniques) plus a Gemini consultation for synthesis. Per the project's standing rule: Gemini is a reference, not gospel — its answer here is treated as a strong starting design, to be independently validated against real backtests once built, not accepted as final.*

---

## 1. The core pipeline — projecting one player's stat for one upcoming game

Five sequential steps, each using data already built and verified in this project:

1. **Base per-36-minute rate (EWMA)**: an Exponentially Weighted Moving Average of the player's per-36 rate for the target stat, computed from `nba_stats.player_game_log`. Recent games count more without a hard cutoff. Tunable: `alpha` (suggested starting value 0.2, ≈9-game effective lookback — must live in `nba_config.system_settings`, never hardcoded, per the project's standing rule).
   - **Small-sample handling (Bayesian shrinkage)**: for players with few games this season (rookies, injury returners), blend the EWMA toward a prior from `nba_stats.player_career_season_totals` (age-adjusted) or a league/position average for true rookies. Blend weight scales with games played (e.g. `games_played / 15`, capped at 1.0) — smoothly shifts from prior to observed performance as real data accumulates.
2. **Projected minutes**: a separate, faster EWMA (suggested `alpha` ≈0.3) on actual minutes played, since rotations shift quickly. Must be cross-checked against the daily injury/lineup layer (planned, not yet built) — if a same-position teammate is confirmed out, this needs a rule-based boost (see Section 4).
3. **Pace and opponent-defense adjustments**: pace multiplier computed from the player's team and opponent's team pace (`nba_team.team_game_log_advanced`) relative to league average; defensive multiplier from what the opponent concedes to the player's position, benchmarked against league average.
4. **Raw projection**: `(shrunken_rate / 36) × projected_minutes × pace_multiplier × defense_multiplier`.
5. **Anchor to team-implied totals**: sum every teammate's raw projection for the same stat into a "bottom-up team total," compare against a "top-down" market-implied total (from the planned live-odds/market layer), and scale every player's projection by the ratio. This is the real fix for the practitioner-reported failure mode of "wild numbers when a star is rested" — found in real research, not theoretical.

---

## 2. Variation (volatility) — not just a point estimate

A single projected number is insufficient for pricing an over/under line. Use rolling-window standard deviation (e.g. last 20 games from `player_game_log`) as the volatility measure alongside the point projection. This turns the projection into a real distribution (mean + spread), from which an over/under probability can be estimated via a Z-score against the actual line — enabling a genuine "fair price" the model can compare against the market's price to find value, rather than just a raw guess.

**Practical value already visible in this project's own data**: a player with a large Shot Quality Delta swing or wide play-type variance (both already built) would be expected to show higher rolling variance — a natural cross-check once real backtesting begins.

---

## 3. Direction (trend) — without double-counting EWMA

EWMA already captures the *level* of recent performance; a separate "trend" signal is needed to capture the *rate of change*:

- Compute a second, faster EWMA (e.g. `alpha` ≈0.5, ~3-game lookback) alongside the primary one.
- `trend_factor = fast_EWMA / primary_EWMA` — greater than 1 means heating up, less than 1 means cooling off.
- Apply as a **dampened** multiplier on the final projection (e.g. `1 + (trend_factor − 1) × dampening_factor`, dampening suggested ≈0.25) — this avoids double-counting, since some of the trend is already baked into the primary EWMA by construction.

---

## 4. Concrete example of a real, tunable rule

Per the project's standing "no hardcoded thresholds" rule, every rule needs its parameters stored in the database. Real, concrete example (an injury-redistribution rule, using data already built):

**`Primary_Playmaker_Absence_Bonus`** — when a team's primary ball-handler (high usage% + high assist%, from `nba_stats.player_season_profile`) is confirmed out, boost the assist projection for the team's secondary playmaker.

- Configurable parameters (`nba_config.system_settings`): `trigger_teammate_usage_threshold` (e.g. 26.0), `trigger_teammate_ast_pct_threshold` (e.g. 28.0), `target_player_position_filter` (e.g. "PG,SG"), `assist_rate_bonus_multiplier` (e.g. 1.15).
- Logic: if a confirmed-out teammate exceeds both thresholds, and the current player's position matches the filter, multiply their projected assist rate by the bonus multiplier.
- This is a first-order approximation, not a full solution (see Section 5) — the real ripple effect of an absence touches usage, efficiency, and rebounding across multiple teammates simultaneously, which the already-built on/off-court split data is the right tool to eventually refine this with, but isn't a simple rule by itself.

---

## 5. Honest difficulty assessment — what's solved vs. genuinely hard

**Solved, well-understood — an engineering task, not a research problem**: EWMA/variance calculation, the rule-engine pattern for bonuses/penalties, opponent pace/defense adjustments. Don't over-invest research time here; implement correctly and move on.

**Genuinely hard, stated plainly rather than glossed over**:
- **Minutes projection is the single biggest source of error in any player-prop model** — driven by coaching decisions, foul trouble, blowouts, in-game injuries. The EWMA approach here is a necessary starting point, not a solved problem.
- **Cascading injury effects** are a real network problem, not a single rule — one absence ripples through usage/efficiency/rebounding for multiple teammates at once. The rule in Section 4 is a first-order approximation; the on/off-court data already built is the right long-term tool, but this needs real, careful modeling later, not a quick fix.
- **Player-vs-player defensive matchups** (not just team-vs-position) are the next frontier beyond this baseline and require data this project doesn't have (granular defender-tracking) — stick to team-level adjustments for now.
- **"Soft" factors** (revenge games, contract-year motivation, back-to-back travel fatigue) are extremely hard to model without overfitting. The market-anchoring step in Section 1.5 is the honest, practical answer — the market already prices much of this in, so anchoring to it captures it indirectly rather than requiring the model to reinvent it.

---

## 6. What this depends on that isn't built yet
- The daily injury/lineup confirmation layer (for real-time minutes/absence context) — part of the originally planned daily master run, not yet built.
- The live-odds/market layer (for the team-implied-total anchoring step) — also part of the planned master run, not yet built.
- Defense-vs-position splits from real game logs (mentioned in the static-layer research passes as needing game-level data) — now buildable, since real game logs exist as of this session's backfill.

---
