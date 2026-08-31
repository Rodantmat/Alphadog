# NBA Project — Domain Mapping (MLB → NBA) and Startup Plan

*This document translates MLB-specific concepts into their NBA equivalents, and lays out a concrete, prioritized first-steps plan for actually starting the build. Read `NBA_ARCHITECTURE_BLUEPRINT.md` and `NBA_LESSONS_LEARNED_FROM_MLB.md` first — this document assumes both.*

---

## 1. Prop taxonomy mapping

| MLB concept | NBA equivalent | Notes |
|---|---|---|
| Hitter props (hits, total_bases, rbis, runs, singles, doubles, home_runs, stolen_bases, walks, hits_runs_rbis) | Points, rebounds, assists, three-pointers made, steals, blocks, turnovers, points+rebounds+assists (PRA), points+rebounds, points+assists, rebounds+assists, double-double, triple-double | NBA has real combo props (PRA etc.) already confirmed to exist on ParlayAPI's market-key list — treat these as a first-class prop family from day one, not an afterthought, since MLB's own combo prop (`hits_runs_rbis`) caused real analysis headaches from being treated as a bolt-on. |
| Pitcher props (pitcher_strikeouts, pitcher_outs, hits_allowed, walks_allowed, earned_runs, runs_allowed, pitcher_fantasy_score) | No direct 1:1 equivalent — NBA has no "opposing role" prop family analogous to pitching. Closest conceptual parallel: none needed; all NBA props are "batter-style" (offense-side player stats). Simplifies the taxonomy relative to MLB. |
| Fantasy-score composite props | Fantasy points (various platform-specific formulas — verify each platform's own formula explicitly, per lesson #14 in the lessons document, before any cross-platform comparison) |
| Goblin/Demon/Standard variant tiers | Confirm these exist identically for NBA on each platform (PrizePicks in particular) — very likely yes, since it's a platform-level mechanic, not sport-specific, but verify tier-count and tier-spacing conventions per prop before assuming they match MLB's exactly. |

## 2. Enrichment factor mapping

| MLB factor | NBA equivalent | Notes |
|---|---|---|
| Weather (temp, wind, precip) | Not applicable (indoor sport) — remove this factor family entirely, don't port it | Confirmed a real time-saver: MLB spent real effort on weather factors that mostly failed anyway; NBA doesn't need to build this category at all. |
| Park factors (dimensions, altitude) | Arena factors — much smaller effect expected (basketball courts are standardized dimensions unlike ballparks) — but altitude (Denver) is a real, known effect in NBA and worth keeping as its own factor. |
| Roof/dome status | Not applicable — remove. |
| Batting order / lineup position | Not directly applicable — NBA equivalent concept is more about minutes/role projection and starter-vs-bench status than a fixed "batting order" number. |
| Bullpen fatigue / bullpen matchup | Not applicable in the same form — NBA's closer conceptual equivalent is teammate/rotation fatigue (back-to-backs, minutes load, load management/rest patterns) — this is likely a MORE important factor for NBA than bullpen fatigue was for MLB, given how visible and discussed rest/load-management is in the sport. Prioritize this. |
| Handedness matchup | Not applicable in the same form — closer NBA equivalent: positional/defensive matchup quality (opponent's defensive rating at that position, individual defender matchup if data supports it). |
| Recent form | Directly applicable, same concept — port directly. |
| Lineup protection | Weaker/different analogue in NBA — closest concept might be "usage rate change with a teammate out" (real, well-documented NBA effect: injuries/absences to high-usage teammates measurably shift a player's own usage and production). Worth building as a first-class NBA-specific factor, since it doesn't have a strong MLB analogue to port from. |
| Opposing starter quality | Opposing team's defensive rating / opponent points-allowed-by-position — directly analogous concept. |
| Quality of contact metrics (exit velocity, launch angle, etc.) | Not applicable — remove entirely, this is MLB-specific batted-ball physics with no basketball equivalent. |
| Defensive quality (OAA-style) | Opponent defensive rating, individual defender matchup metrics if available (e.g., defended field goal percentage by position) |
| RFI/NRFI (first-inning props) | No direct equivalent — remove. |
| Game total / implied run environment (market-derived) | Directly applicable — Vegas game total and spread are equally available and equally relevant for NBA player-prop pricing signals. Port this factor family directly. |

**New, NBA-specific factors worth building that have no MLB analogue** (this is where NBA research should go beyond simple porting):
- **Pace** (team possessions per game) — a much bigger, more well-established driver of counting-stat props in basketball than any single MLB environmental factor.
- **Back-to-back / rest days** — NBA has a much more visible, heavily-studied rest effect than MLB's schedule-fatigue factor (which barely survived MLB's own testing at 3-day sample sizes); worth real investment given basketball's own literature strongly supports this.
- **Blowout risk / garbage time** — a real, basketball-specific risk to "under" and total-based props that has no direct MLB equivalent; large point-spread games can see starters pulled early, systematically affecting props differently than any MLB game-state factor.
- **Injury/questionable-designation status and minutes restrictions** — likely the single highest-value NBA-specific signal to build well from the start, given how much injury-report noise (questionable/probable/out designations, minutes restrictions on return-from-injury players) drives real line movement in basketball specifically.

## 3. Data source mapping

| MLB source | NBA equivalent | Notes |
|---|---|---|
| MLB Stats API (game logs, box scores, schedule) | NBA Stats API (stats.nba.com) or a wrapper (balldontlie.io, etc.) — pick one authoritative source and mirror MLB's "base layer" pattern (raw ingestion → delta updates → certified/promoted state) | Verify rate limits and terms of service before building a scraper-dependent pipeline around it. |
| Baseball Savant (advanced metrics, exit velo, etc.) | NBA advanced stats (tracking data via stats.nba.com, or a paid provider) — lower priority given quality-of-contact-style metrics don't port over | Deprioritize relative to MLB's investment in this area. |
| ParlayAPI | Same service, same account, `basketball_nba` sport key | No new vendor onboarding needed — this is the single biggest head start NBA has over where MLB started. |
| PrizePicks own board scraper | Confirm the same scraper technique/endpoint pattern works for NBA boards (very likely, same platform) | Reuse the MLB scraper's architecture directly, swap the sport filter. |

## 4. What can be directly reused vs. what must be rebuilt

**Reuse directly (sport-agnostic)**:
- The entire infrastructure stack (Section 1-2 of architecture doc)
- The entire statistical research standard (all 16 items in the lessons document)
- The ParlayAPI integration pattern and account
- The PrizePicks board scraper architecture (adjust sport filter)
- The Gemini adversarial-review usage pattern
- The differential/incremental write pattern, chunking pattern, deploy pipeline

**Must be rebuilt sport-specifically**:
- All prop taxonomy and canonical prop-key definitions
- All enrichment factors (Section 2 above — many removed, several new ones needed)
- The scoring engine's actual formula/model (probability estimation logic is sport-specific even if the *pipeline structure* around it is reusable)
- The full multiplier/pricing study — MLB's specific numbers do not transfer; only the platform-level *mechanics* (Part B of the lessons document) transfer as informed priors, not answers

## 5. Prioritized startup plan for the new chat

Do these in order. Do not skip ahead to strategy research before the foundational layers exist and are verified with real data.

1. **Confirm ParlayAPI coverage for NBA specifically** — sport key `basketball_nba`, verify live `/props` returns real rows for the relevant DFS bookmakers (`prizepicks`, `underdog`, `sleeper`), and separately test historical `/closing-odds` coverage for each (per the lesson in the MLB session: don't assume historical coverage exists just because a bookmaker is listed as active — test it directly, the same way MLB found Sleeper/Fliff have live-only coverage with zero historical depth).
2. **Set up the database schemas** (Section 2 of the architecture doc) and the MCP admin-worker bridge before writing any other worker — this is the tool surface everything else depends on.
3. **Build the PrizePicks NBA board scraper first** — it's the highest-confidence, most directly reusable component, and gives you real live board data to build everything else against immediately.
4. **Build the base data layer** (schedule/calendar, player/team reference data, game logs) before any enrichment factor — enrichment factors need real historical game logs to compute against, and MLB's own dependency-ordering lesson (Board → Daily Context → Market → Scoring) applies here too: don't build scoring before the data it depends on exists and is verified.
5. **Build outcome grading early and verify it against known-real results before trusting any downstream calibration work** — MLB's own history shows a real, costly formula bug in outcome grading went undetected for a long stretch and invalidated a major "strongest finding" until it was caught and fixed; catching this early avoids that entire failure mode.
6. **Only once real board data + real outcome grading exist for a genuine multi-week window, begin the multiplier-observation study and the strategy research program** — using the full 16-item standard from the lessons document from the very first candidate, not as a later addition once shortcuts have already been taken.
7. **Build the manual/session-driven trigger pattern (Section 5 of architecture doc) before any auto-scheduled orchestrator** — get a working, correct manual pipeline first; only automate once it's proven.

## 6. Explicit non-goals, at least initially

- Don't build a per-prop "one worker per prop" architecture — MLB tried this, abandoned it in favor of a unified scoring engine, and left 19 dead stub files behind as evidence. Build the unified version from the start.
- Don't try to port MLB's weather, quality-of-contact, or RFI/NRFI-style factors — they have no basketball analogue and building them would be wasted effort (see Section 2 for the honest mapping).
- Don't invest in an elaborate auto-scheduling orchestrator before the manual pipeline works end-to-end and has been verified against real data at least once.
