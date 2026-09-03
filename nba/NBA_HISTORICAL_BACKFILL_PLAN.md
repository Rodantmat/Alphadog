# NBA Project — Historical Backfill Plan (Phase 3b, Delta/Game-Log Layer)

*Written 2026-09-03, before any Phase 3b code is built. Combines direct research against real, confirmed `stats.nba.com` endpoints with a Gemini consultation on scope/structure. This is a design/identification document — no scrapers built yet, per the person's explicit "identify... research and understand what we really need" framing.*

---

## 1. Confirmed real sources

| Endpoint | What it gives | Shape |
|---|---|---|
| `playergamelogs` | Full box-score-level log, **one row per player per game**: MIN, FGM, FGA, FG_PCT, FG3M/A, FTM/A, OREB, DREB, REB, AST, TOV, STL, BLK, PF, PTS, PLUS_MINUS, NBA_FANTASY_PTS, DD2, TD3, etc. | One call can return an entire season, whole league, filtered by date range |
| `teamgamelogs` | Same shape, team-level (pace, ratings per game) | Same — one call per season, whole league |
| `playerdashboardbygeneralsplits` | **One call returns 6 real split groups together**: `DaysRestPlayerDashboard`, `LocationPlayerDashboard` (home/away), `MonthPlayerDashboard`, `PrePostAllStarPlayerDashboard`, `StartingPosition`, `WinsLossesPlayerDashboard` | One call per player per season |
| `teamdashboardbygeneralsplits` | Same split groups, team-level (confirmed same schema shape, e.g. `TEAM_DAYS_REST_RANGE`, `TEAM_GAME_LOCATION`) | One call per team per season |

Real, confirmed data depth: detailed box scores exist back to 1996-97 league-wide; advanced stats specifically from 1997 onward. So historical depth is not the constraint — **scope discipline is**.

---

## 2. How many past seasons — Gemini's direct, specific answer

**3–5 seasons of full per-game logs.** Not "more is always better," and not 1–2 either:

- **1–2 seasons is insufficient**: too small a sample for context-specific patterns (e.g. a player's performance on 0 days rest against a specific opponent), no way to build an aging curve or tell a hot streak from a new baseline, and not enough cross-player sample to model typical injury-return ramp-up.
- **More than 5–6 seasons has real, specific downside, not just "extra work"**: the game itself has structurally changed (pre-2018 data predates the full pace-and-space/3-point era), and — this is the important, concrete point — **a player's own data from several years ago in a different role on a different team is actively misleading, not just less useful.** Gemini's example: Kevin Durant's 2016 Thunder numbers would hurt, not help, a model predicting his performance today.
- **One narrow, deliberate exception**: truly rare league-wide events (50-point games, triple-doubles) may warrant a longer (10+ year) *separate* dataset just to establish a base rate — not part of the core per-player training data.

**Recommended structure (hot/cold split, not "N years, everything")**:
- **Hot period — most recent 2 completed seasons + current**: mine everything at full detail (game logs, all splits, team logs).
- **Cold period — seasons 3–5 back**: still mine full per-game logs (needed for aging/long-term baselines), but splits can be less exhaustively collected here if time/cost is a real constraint.

---

## 3. Splits — real prioritization, not "collect everything because it's free"

Even though `playerdashboardbygeneralsplits` returns all 6 split groups in one call (so there's no cost reason to skip any), Gemini flagged real, substantive differences in how much to *trust* each one:

- **Essential, high-signal**: `DaysRest` (back-to-back effects are one of the strongest, most reliable real signals in player performance), `Location` (home/away — classic, consistently useful), `StartingPosition` (a direct proxy for role, which drives minutes/usage — a player's stat line as a starter vs. bench is night-and-day different).
- **Worthwhile**: `PrePostAllStar` — a clean proxy for mid-season trades, fatigue, or playoff-push effects.
- **Real caution flagged, not just "lower priority"**: `WinsLosses` is **correlational, not causal** — players have better stats in wins partly *because* their good play helped cause the win, so using it as a raw predictive input risks real data leakage. Collect it, but don't treat it as a clean feature. `Month` is genuinely low-signal — any real effect is already better captured by `DaysRest` or game-number-in-season; collect since it's free, but expect it to get dropped in feature selection.

---

## 4. Base unit: per-game, not season aggregates

**Per-game granularity is the required base table**, not a shortcut. The system predicts a single upcoming game's stat line, so the training data's unit of observation must match — one row per player per game. Season-level aggregates (already available cheaply from career-stats-style endpoints) are still valuable, but only as **derived features attached to each game row** (e.g. "this player's prior-season PPG average" as a column on today's game row), never as a replacement for the per-game log itself.

---

## 5. Team game logs — needed too, and for specific reasons

Not just "for completeness" — Gemini named concrete uses:
- **Pace**: more team possessions per game means more statistical opportunity for every player in that game — a real, direct multiplier on prop lines.
- **Opponent defensive profile**: opponent's overall defensive rating, rebounding rate, and (once combined with shot-location/play-type data already built) position-specific defensive tendencies.
- **Team-level baselines**: a player's assist numbers depend on teammates' shooting; a player's scoring depends on the team's overall offensive rating. Team context is half of what determines an individual stat line, not a minor addendum.

---

## 6. Recommended pipeline structure (per Gemini, a real architectural point, not just sequencing)

A three-step, decoupled pipeline, not a single "mine everything into final tables" script:

1. **Ingestion** — pull raw JSON per season/entity, store as close to raw as practical (a `nba_stats` staging area or raw JSON columns, matching the pattern already used for `raw_json` columns on the static-layer tables).
2. **Transformation** — clean into structured tables (`player_game_logs`, `team_game_logs`, split tables) — naming/typing/cleaning only, no feature engineering yet.
3. **Feature engineering** — a separate, later step that joins player + team + opponent data and computes rolling averages, aging-curve features, etc.

**Why this matters concretely**: if a feature-engineering approach needs to change later (e.g. a better rolling-average window), only step 3 needs to be redone — the expensive historical API mining (step 1) doesn't need to be repeated.

---

## 7. What this means for immediate next steps (not yet built — for the person's confirmation)

1. Lock the season count: **recommend 3 seasons of full per-game logs** (2023-24, 2024-25, 2025-26) as the initial backfill target, extendable to 5 if the person wants deeper aging-curve coverage later. This needs the person's explicit sign-off before building, per the size of this undertake (500+ players × ~70-82 games × 3 seasons is a genuinely large mining job, unlike anything built in the static layer so far).
2. Build `player_game_logs` and `team_game_logs` as the two foundational raw tables — per-game granularity, matching Gemini's Section 3 answer.
3. Build the 4 essential/worthwhile split tables (`DaysRest`, `Location`, `StartingPosition`, `PrePostAllStar`) per player per season — collect `WinsLosses` and `Month` too (they're free in the same call) but flag them in the schema/docs as correlational/low-signal, not to be used as raw model inputs without care.
4. This is also where garbage-time adjustment, rolling/recent-form averages, defense-vs-position, and referee-crew tendencies (all correctly deferred from the static-layer research passes) become buildable, once real game logs exist to compute them from.

---

## 8. Older-season aggregates without per-game contamination (2026-09-03 follow-up)

The person asked specifically: can older-season data be used *smartly* — without the "stale per-game context" contamination Gemini flagged in Section 2 — to extend historical coverage further back than the 3–5 season full-detail window?

### Real, confirmed answer: yes, via `playercareerstats`
One call **per player** (not per season, not per league) returns their **entire career, season-by-season, already aggregated** (not per-game) — `SEASON_ID`, `TEAM_ID`, `PLAYER_AGE`, `GP`, `GS`, `MIN`, full box-score totals, all the way back to their rookie season. Confirmed real schema via `nba_api` project docs.

**Why this genuinely sidesteps the contamination problem** (independently reasoned, then checked against Gemini): the original concern was mixing an old *per-game* row into training data as if it represented current context. Season-level aggregates used as *reference features about the player's trajectory* — not as substitute training rows — are a structurally different, safer use. Gemini's own framing: this generates features that describe **the player's current state** (declining, stable, historically durable), not stand-ins for current performance.

### Three concrete, real uses identified and validated
1. **Real aging curves** — age vs. performance across a full career, using season-level (not per-game-noisy) data. Enables features like `years_since_peak` or a multi-season performance trend slope.
2. **A "context stability" flag** — `distinct team count / career seasons` from the `TEAM_ID` column. A player on 4 teams in 6 years is a genuinely different, real risk profile than one who's been on 1 team for 10 — a signal invisible in any single-season stat line.
3. **A durability/availability proxy** — `GP` relative to that season's real total team games (accounting for lockout/shortened seasons), without storing or inferring any actual injury/health record (which is correctly off-limits).

### Real risks and biases, not glossed over
- **Survivorship bias, flagged as the critical one**: this endpoint only has data for players who stayed in the league long enough to still be queryable. Any "typical aging curve" derived from it is a curve for *successful* NBA players, not a generic one — role players who washed out after 2-3 seasons are systematically invisible. Any model built on this should be understood as conditioned on "being a currently-relevant NBA player," not a neutral population.
- **Era effects**: raw stat totals from a 2004 season aren't directly comparable to a 2024 season (pace, 3-point rate changed the whole league). Mitigation: use rate stats (per-100-possessions or z-scored vs. that season's league average), not raw totals, when building trend features.
- **Role change vs. skill decline ambiguity**: a scoring drop could mean aging decline or just a new team giving the player a smaller role. Rate stats plus the context-stability flag help disambiguate this, but it's a real limit on how much this data can cleanly say on its own.

### Genuinely unresolved, needs empirical verification once this endpoint is actually called (not assumed here)
- **Mid-season trade handling**: unclear from documentation search alone whether a traded player's season shows separate per-team rows, a combined "total" row, or both. Basketball-Reference's convention is a "TOT" row; `stats.nba.com`'s own behavior for this specific endpoint was not confirmed by research and needs to be checked against a real API response for a known traded player before this data is trusted for season aggregates.
- **Whether retired players are queryable at all** — if the endpoint requires an active roster player, the survivorship bias above is even more severe than described.
- **Shortened-season handling** (2011-12 lockout, 2019-20 COVID) for the `GP`-based durability proxy's denominator.

**Recommendation**: worth building as a real, additional static-adjacent worker (one call per active player, ~582 calls, same shape as most work already done), but explicitly gated on verifying the trade-row and shortened-season handling empirically first, and explicitly documented wherever it's used that any trend/aging feature derived from it carries the survivorship-bias caveat above.

### RESOLVED (2026-09-03) — real empirical answer to the trade-row question
Checked directly against the real, committed backfill data: **traded players get separate per-team rows, PLUS a combined total row with `TEAM_ID = 0`** (the real equivalent of Basketball-Reference's "TOT" convention). Confirmed by summing: e.g. player 1630173's 2023-24 season shows 25 GP on one team + 49 GP on another = 74 GP on the `TEAM_ID=0` row, matching exactly. **This means the `TEAM_ID=0` row is the correct one to use for season-level aggregate features** (it's already the properly combined total), while the per-team split rows remain available if a feature ever needs to know specifically which teams a player was on and for how long within a season (which directly feeds the "context stability" flag from Section 8 above).

---
