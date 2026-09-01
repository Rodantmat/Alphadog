# NBA Project — Enrichment Factors Research (weekly/semi-static layer)

*Research pass requested by the person 2026-09-01: "check online, check how systems deal with which data they use, what can be weekly (static or semi-static) data... as well as any other type of important data." Combines independent web research (industry sources on NBA player-prop modeling) with a mandatory Gemini consultation (2026-09-01, gemini-2.5-pro) — Gemini's synthesis is treated as a useful reference, not authoritative; claims worth independently verifying before building are flagged explicitly below, per the project's own research standard (Lessons Learned doc).*

---

## 1. Real, confirmed data sources for this layer

All confirmed via direct research against `nba_api` project documentation (a well-documented, actively-maintained reverse-engineering of `stats.nba.com`) — not yet live-tested from a GitHub Actions runner the way teams/players/arenas/officials were, but expected to work via the same `curl_cffi` pattern since they're the same domain.

| Endpoint | What it returns | Call shape |
|---|---|---|
| `leaguedashplayerbiostats` | **One call returns ALL players at once**: `AGE`, `PLAYER_HEIGHT`, `PLAYER_HEIGHT_INCHES`, `PLAYER_WEIGHT`, `COLLEGE`, `COUNTRY`, `DRAFT_YEAR`, `DRAFT_ROUND`, `DRAFT_NUMBER`, `GP`, `PTS`, `REB`, `AST`, `NET_RATING`, `OREB_PCT`, `DREB_PCT`, `USG_PCT`, `TS_PCT`, `AST_PCT` | 1 call, whole league |
| `leaguedashptstats` (`PtMeasureType=SpeedDistance`) | Real player-tracking speed/distance: `AVG_SPEED`, `AVG_SPEED_OFF`, `AVG_SPEED_DEF`, `DIST_MILES`, `DIST_MILES_OFF`, `DIST_MILES_DEF` — this is the actual "speed" data the person asked about, not a proxy | 1 call, whole league, per `PtMeasureType` |
| `leaguedashptstats` (other `PtMeasureType` values) | `Drives`, `Passing`, `CatchShoot`, `PullUpShot`, `Defense`, `ElbowTouch`, `PostTouch`, `PaintTouch`, `Possessions`, `Rebounding`, `Efficiency` — a whole family of real player-tracking "archetype" stats (how a player actually plays, not just box-score output) | 1 call per type, whole league |
| `leaguedashteamstats` | Team-level pace, offensive/defensive rating | 1 call, whole league |
| `leaguedashptteamdefend` | Opponent shooting-by-distance, team defensive tendencies | 1 call, whole league |

**Note the shape difference from the 4 entities already built**: these are *league-wide, one-call* endpoints (no per-team/per-player looping needed, unlike arenas' 30 sequential `teamdetails` calls) — genuinely cheap to refresh weekly.

---

## 2. What belongs in the WEEKLY static-differential layer vs. the DAILY master-run layer

This is the person's core question, and it has a real, structural answer (not just "everything could be either") — reproduced from the Gemini consultation, which matches independent research and the person's own architecture:

### Weekly-refresh layer (static/semi-static — stable enough that daily refresh is wasted effort)
- **Truly static**: `AGE`, `PLAYER_HEIGHT`, `PLAYER_WEIGHT`, `COLLEGE`, `COUNTRY`, `DRAFT_YEAR`, `DRAFT_ROUND`, `DRAFT_NUMBER` — changes once a year or never.
- **Semi-static season-long aggregates**: `GP`, `PTS`, `REB`, `AST`, `NET_RATING`, `OREB_PCT`, `DREB_PCT`, `USG_PCT`, `TS_PCT`, `AST_PCT` — full-season averages; one game barely moves these after ~20 games played.
- **Team-level season identity**: pace, offensive/defensive rating, opponent shooting by zone — slow-moving team-style trends.
- **Player "archetype" tracking stats**: season-long `AVG_SPEED`, `DIST_MILES`, drives/game, catch-and-shoot frequency, touches by zone — these describe *how* a player plays, which doesn't flip overnight.

### Daily-refresh layer (belongs in the existing "master run" / daily-context stage, not here)
- **Injury reports & official lineups** — the single most important daily input; non-negotiable.
- **Recent-form trailing averages (5–15 games)** — by definition changes after every game; more predictive of current role than season-long stats. Gemini flagged this as "the most common mistake people make" — using season-long stats where recent-form is far more predictive.
- **Rest days / back-to-backs** — purely a function of today's schedule.
- **Vegas lines (spread/total)** — change throughout the day; critical for projecting blowout risk and game script.
- **"With/without" on-off-court context** — e.g., a backup's usage rate when the starter is out; must be applied based on today's actual injury report.

---

## 3. Additional real factors surfaced beyond the original list — not yet sourced/locked

- **On/off-court differentials ("with or without you" stats)** — flagged as very high impact. Real source candidates: `boxscoreadvancedv2` with start/end date ranges, or third-party aggregators like pbpstats.com. **Not yet independently verified** — needs its own research pass before being trusted as a real, reachable source.
- **Blowout risk derived from the spread** — not a new data source, but an explicit modeling application of live odds already planned for the market layer; worth calling out on its own since it's cited as one of the most common reasons an "Over" prediction fails (garbage-time minutes).
- **Schedule density/travel beyond simple back-to-backs** (e.g., "3rd game in 4 nights," long road trips) — requires parsing the full season schedule, not yet built.
- **Referee crew tendencies** — ties directly to the officials dictionary already built (`nba_ref.officials`, 80 real officials). Real impact on foul-prone players and elite foul-drawers. Needs its own per-crew tendency table, built from game-level data over time — same shape as MLB's `ref.umpire_tendency`.
- **Altitude** — Denver/Utah home games; a real, described effect (slightly higher pace/turnovers, more effect on visiting non-acclimated teams), but described as a minor, binary flag rather than a foundational factor.

---

## 4. Predictive-signal tiering (for later prioritization — not yet independently verified, treat as a starting hypothesis)

Reproduced from the Gemini consultation as a first-pass prioritization, to be checked against real backtest results once the scoring engine exists (per the project's own "verify, don't just trust Gemini" standard):

- **Tier 1 (highest signal)**: projected minutes, recent usage rate/role, team pace.
- **Tier 2 (strong, reliable)**: defensive matchup / DvP, recent-form trailing averages.
- **Tier 3 (context-dependent but decisive in the right spot)**: blowout risk from the spread, referee crew, rest/schedule fatigue.
- **Tier 4 (weak/noisy — worth testing before trusting)**: home/away splits (Gemini's own caveat: "test this feature's lift in your model; you may find it's not worth the complexity"), long-term season averages in isolation, altitude.

**Explicit flag, not glossed over**: this tiering is Gemini's synthesis of general industry consensus, not a result from this system's own backtests. It should not be treated as locked until independently checked against real data once the classification/scoring layer exists — this document records it as a starting hypothesis for prioritization, nothing more.

---

## 5. What this means for immediate next steps

1. The 4 static entities already built (teams, players, arenas, officials) remain correct and don't change based on this research.
2. A natural **5th static-differential worker** is now clear: a "player bio + season profile" worker pulling `leaguedashplayerbiostats` (age, physical measurables, draft background, season usage/efficiency) — one call, whole league, genuinely weekly-appropriate.
3. A natural **6th**: player tracking "archetype" stats via `leaguedashptstats` (speed/distance plus the other `PtMeasureType` families) — same one-call-per-type shape.
4. Team-level pace/rating (`leaguedashteamstats`) is a natural 7th, small (30 rows) and cheap.
5. On/off-court differentials, referee crew tendencies, and schedule-density factors are real and worth building, but need their own dedicated research/sourcing pass before implementation — not blocking the simpler wins above.

---
