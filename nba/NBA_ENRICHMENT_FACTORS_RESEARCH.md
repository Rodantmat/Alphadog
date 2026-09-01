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

## 5. Status update (2026-09-01) — original next-steps list, now resolved

Items 2–4 below (player bio, player tracking, team stats) plus on/off-court splits (Section 3's top-flagged item) have all since been built and verified — see Section 6 below for the full current checklist and the second research pass that followed.

1. The 4 static entities already built (teams, players, arenas, officials) remain correct.
2. ~~A natural 5th static-differential worker~~ → **built**: `alphadog-v2-nba-static-player-bio`.
3. ~~A natural 6th~~ → **built**: `alphadog-v2-nba-static-player-tracking`.
4. ~~Team-level pace/rating, a natural 7th~~ → **built**: `alphadog-v2-nba-static-team-stats`.
5. ~~On/off-court differentials~~ → **built**: `alphadog-v2-nba-static-onoff`. Referee crew tendencies and schedule-density remain real, deferred items — see Section 6.

---

## 6. Second research pass (2026-09-01) — garbage-time filtering, third-party metrics, and the honest limit of the static layer

Per the person's request to keep researching, consulted Gemini again with the 8 already-built sources as context, plus new findings from researching how established platforms (Cleaning the Glass, Dunks & Threes, PBP Stats) operate.

### Garbage-time filtering — real, but requires data we don't have yet
Cleaning the Glass (industry-standard methodology, Ben Falk) filters blowout endgame minutes from all its stats, since usage rate and shooting efficiency get meaningfully distorted for bench players who see a disproportionate share of their minutes in garbage time. **Gemini's verdict**: this is a real, medium-to-high-priority issue for player props specifically (most acute for deep-bench players whose season stats are almost entirely garbage-time-contaminated), but **fixing it requires play-by-play data, not anything available at the static/weekly layer** — it needs a per-game garbage-time heuristic applied to possession-level logs. **Correctly deferred to Phase 3b**, not something to force into this layer.

### Third-party derived metrics (EPM, LEBRON, RAPTOR-successors) — real signal, but a real access problem
Gemini rated a well-constructed all-in-one impact metric like Dunks & Threes' EPM as "likely one of the highest predictive-lift single features" available, and called using a public third-party model a normal, legitimate practice (not just building everything from raw box scores).

**However — independently verified, and this changes the plan**: EPM's full/detailed data is a **paid subscription feature** on dunksandthrees.com (a free page shows some values, but programmatic/complete access requires a paid account, per direct research). This is not the same situation as the free, public Wikipedia officials roster or `stats.nba.com`'s free API. **Scraping paywalled content is a real legitimacy question, not just a technical one, and this document does not recommend building against it without the person's explicit decision to pay for access.** Flagged here rather than built past silently.

### Other real gaps surfaced — all require game-log data, not static snapshots
- **Rolling/recent-form averages (last 5/10/15 games) and EWMA** — Gemini called this probably more predictive than season-long averages for props specifically. Requires game logs (Phase 3b).
- **Defense-vs-position tables** (what each team concedes to opposing PGs/SGs/etc.) — a classic, high-impact matchup feature. Requires game-log box scores aggregated by opposing player position (Phase 3b).
- **"Impact of absences" tables** (e.g., when Player X is out, Player Y's usage rises by N%) — an extension of the on/off-court work already built, but requires historical game-by-game lineup data (Phase 3b).
- **Vegas lines / implied team totals** and **injury status** — both already correctly scoped into the planned daily master-run, not this layer.

### Honest conclusion of this research pass
The **freely and legitimately sourceable static/weekly layer is now genuinely complete** — every factor that (a) doesn't require game-level/play-by-play data and (b) doesn't require paying for a third-party proprietary model has been identified, sourced, built, and verified (see the checklist below). What remains falls into exactly two buckets: **Phase 3b's incremental/delta game-log layer** (garbage-time adjustment, rolling averages, defense-vs-position, absence-impact tables), or **a paid third-party data decision** (EPM/LEBRON) that needs the person's explicit go-ahead before any scraping is built against it.

### Built-and-verified checklist (current as of 2026-09-01)

| Factor | Worker | Status |
|---|---|---|
| Team dictionary | `alphadog-v2-nba-static-teams` | ✅ 30/30 verified |
| Player dictionary | `alphadog-v2-nba-static-players` | ✅ 582 verified |
| Arenas | `alphadog-v2-nba-static-arenas` | ✅ 30/30 verified |
| Officials | `alphadog-v2-nba-static-officials` | ✅ 80/80 verified |
| Player bio + season profile (age, draft, usage%, TS%) | `alphadog-v2-nba-static-player-bio` | ✅ 582/582 verified |
| Player tracking speed/distance | `alphadog-v2-nba-static-player-tracking` | ✅ 582/582 verified |
| Team pace/ratings | `alphadog-v2-nba-static-team-stats` | ✅ 30/30 verified |
| Player on/off-court net rating splits | `alphadog-v2-nba-static-onoff` | ✅ 582/582 verified |
| Referee crew tendencies | — | Deferred to Phase 3b (needs per-game officiating data) |
| Garbage-time-adjusted aggregates | — | Deferred to Phase 3b (needs play-by-play data) |
| Rolling/recent-form averages | — | Deferred to Phase 3b (needs game logs) |
| Defense-vs-position splits | — | Deferred to Phase 3b (needs game logs) |
| Third-party impact metrics (EPM/LEBRON) | — | **Blocked on a paid-subscription decision**, not a technical gap |

---
