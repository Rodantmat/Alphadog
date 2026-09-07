# NBA System — Complete Documentation Checkpoint (2026-09-04)

*This is a deep-detail reference checkpoint, not a handoff — the same working chat continues.
Purpose: any new chat that touches this system, or this same chat after a long gap, should be
able to read this one file and know exactly what exists, why it exists, what's verified, what
real bugs were found and fixed, and what genuinely remains. Every number in this document was
re-verified against live Postgres immediately before writing it (2026-09-04), not pulled from
memory of earlier sessions.*

*Companion documents in the same repo folder (`nba/`), each still current and not superseded by
this one — this document is a consolidated index/reference, not a replacement:*
- `NBA_ARCHITECTURE_BLUEPRINT.md` — full infrastructure design (schemas, deploy pipeline, MCP bridge)
- `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` — MLB→NBA concept translation, prop taxonomy, enrichment factor mapping, person's working-style preferences
- `NBA_LESSONS_LEARNED_FROM_MLB.md` — the 16-item statistical research standard, MLB's own mistake catalog
- `NBA_BASELINE_METHODOLOGY.md` — the designed-but-not-yet-built baseline projection pipeline (EWMA/shrinkage)
- `NBA_ENRICHMENT_FACTORS_RESEARCH.md` — enrichment factor research (Board/Master-Run layer, not yet built)
- `NBA_HISTORICAL_BACKFILL_PLAN.md` — the original backfill scoping document (season count, split prioritization)
- `NBA_PROJECT_LOG.md` — the full chronological, blow-by-blow session log (84KB+, every session's real detail)

---

## 1. What this system is, in one paragraph

An independent NBA data layer inside the existing AlphaDog v2 codebase (same repo, same Cloudflare
Workers deploy pipeline, same MCP admin-sql bridge), built as a sibling to the MLB system with
**zero shared tables, zero shared code paths, and an explicit standing rule that no NBA work may
ever modify MLB code**. Purpose: eventually power NBA player-prop slip generation (PrizePicks/
Sleeper/Underdog) the same way the MLB system already does, but currently **only the data
foundation exists** — static reference data, three seasons of historical backfill, and a
just-built daily-delta layer. **No baseline projection logic, no enrichment/master-run layer, and
no scoring engine exist yet** — this has been a deliberate, explicit scope boundary for the
current phase (see Section 8).

---

## 2. Infrastructure — how everything actually runs

**Database**: DigitalOcean-hosted Postgres, reached via Cloudflare Hyperdrive. 5 NBA-specific
schemas currently populated: `nba_ref`, `nba_calendar`, `nba_team`, `nba_stats`, `nba_config`.
(A larger set of 14 schemas was provisioned at project start — `nba_daily`, `nba_context`,
`nba_market`, `nba_archive`, `nba_score`, `nba_scoring`, `nba_backtest`, `nba_classification`,
`nba_control` exist as empty schemas reserved for the not-yet-built enrichment/scoring layers.)

**Compute**: Cloudflare Workers, one per logical job, matching the MLB pattern exactly. Each
worker is a standalone `.js` file in `nba/` in the repo, deployed automatically via the existing
`AlphaDog v2 Mobile Auto Deploy` GitHub Actions workflow on every push to `main` — no separate
deploy step was ever built or needed for NBA; it rides the same pipeline MLB already uses,
extended additively (`generate_wrangler_configs.py` and the deploy script are both guarded by
`worker_name.startswith("alphadog-v2-nba-")` so NBA additions cannot affect MLB workers).

**Orchestration/access**: a single shared admin-sql Cloudflare Worker
(`alphadog-v2-admin-sql.js`) exposes `run_sql` (direct Postgres access) and `run_job` (dispatches
to any registered worker binding by name) as MCP tools. Every NBA worker gets:
1. A binding declared in `generate_wrangler_configs.py`'s NBA binding list
2. A pass-through line in `alphadog-v2-admin-sql.js`'s three places: the destructured `env` object, the `bindingName ===` dispatch condition, and the Zod enum for the `target` parameter
3. A row in `nba_config.worker_definitions` (job registry table, used by the `CONTROL_ROOM` dispatch path — though note Section 9's lesson: CONTROL_ROOM's own dispatch does NOT read this table dynamically, direct binding calls are what actually work)

**Known tool quirk, confirmed real and worth remembering**: after adding a new binding across all
three admin-sql locations and deploying, the `run_job` MCP tool's own client-side parameter schema
(a fixed enum) does not immediately reflect the new binding — calls fail with "invalid option" for
a period (confirmed once at ~1 hour lag) before self-resolving with no further code changes. Not a
permanent block; retry later rather than assuming failure.

**Scraping (the real workaround for a real blocker)**: Cloudflare Workers' own egress IPs are
rejected outright by every stats.nba.com/nba.net domain (520/403 responses, confirmed via a
dedicated `/probe-sources` diagnostic route early in the project — not a header/UA problem).
**Fix, modeled directly on MLB's own existing pattern**: all real scraping happens from GitHub
Actions runners (unrestricted egress), using Python + `curl_cffi` (`impersonate="chrome124"`,
required — plain `requests` was insufficient against stats.nba.com's bot detection). Each scraper
writes its output as JSON to `nba/data/*.json` in the repo, committed by the workflow; the
corresponding Postgres-writer Worker then reads that committed JSON via the GitHub raw-content
API (`raw.githubusercontent.com/.../main/nba/data/...json`) and upserts it. This two-hop pattern
(GitHub Actions scrape → commit JSON → Worker reads & writes Postgres) is used for **every** piece
of real stats.nba.com data in this system, with zero exceptions.

**Trigger mechanism**: each GitHub Actions workflow is triggered by a `push` to a specific
`nba/TRIGGER_NBA_*.txt` file (content is just a timestamp + reason, changed on each trigger) —
this works with the existing `github_put_file`/`github_patch_file` tools with no special
connector or reconnect needed. `workflow_dispatch` is also enabled on every workflow as a manual
fallback. **No cron/scheduled automation exists anywhere in this system** — every single run,
static or delta, is manually triggered, per the person's explicit standing instruction (Section 8
of the domain-mapping doc): build and prove the manual pipeline first, automate only later, if
ever.

## 3. Complete table inventory — every table, real row count, real purpose (verified 2026-09-04)

### `nba_ref` (identity/reference data)
| Table | Rows | Purpose |
|---|---|---|
| `teams` | 30 | Team dictionary. Source-locked to a certified static fallback list (live `leaguestandingsv3` fetch untested from build session). |
| `team_aliases` | 162 | Alternate team name/abbreviation matching. |
| `players` | 582 | Full player dictionary: name, position (see bug #3 below), age, height, weight, draft info. |
| `player_aliases` | 1,822 | Alternate player name matching. |
| `arenas` | 30 | Current sponsor arena names per team. Some capacities null where the source itself lacks them (honest gap, not fabricated). |
| `officials` | 80 | Referee roster (career games count) — NOT per-game assignments (see `nba_stats.game_officials` for that). Source: Wikipedia "List of NBA referees". |
| `official_roster_snapshot` | 80 | Owned by the weekly-differential worker for before/after comparison — independent of the regular officials upsert. |
| `team_roster_snapshot` | 30 | Same pattern, teams. |
| `team_differential_log` / `official_differential_log` | 0 / 0 | **Correctly empty** — only one weekly-differential baseline run has happened (`is_first_run=true`); real change detection starts on the second run. |
| `prop_taxonomy` | 0 | **Correctly empty** — canonical prop-key definitions (points/rebounds/PRA/etc.) belong to the Board/Scoring layer, explicitly out of scope for the current backfill/static/delta phase. |

### `nba_calendar`
| Table | Rows | Purpose |
|---|---|---|
| `games` | 2,666 | Full schedule for 2025-26 (1,400 games incl. preseason/playoffs/All-Star/Cup, real `game_status`/`game_status_text`/`game_label` fields) and 2026-27 (1,266 games, season starts 2026-10-03, currently 0 Final). Real `GAME_ID` prefix convention confirmed empirically: `002`=regular season (1,230 for 2025-26, exact match), `001`=preseason (71), `003`=all-star (7), `004`=playoffs (85), `005`=play-in (6). |

### `nba_team`
| Table | Rows | Purpose |
|---|---|---|
| `team_game_log` / `team_game_log_advanced` | 7,380 / 7,380 | Per-game team box scores, base + advanced, 3 seasons (2023-24/2024-25/2025-26). |
| `season_profile` | 30 | Team-level advanced season stats (one row per team). |
| `playtype_profile` | 630 | Team-level Synergy play-type breakdown (11 types × ~57 team-rows worth of real granularity). |
| `defense_vs_position` | 630 | **Derived, zero extra API calls** — Defense-vs-Position, computed via SQL aggregation joining `player_game_log` to the (bug-fixed) `players.position` field, grouped by opponent team + position + season. 30 teams × 7 position groups × 3 seasons. |
| `lineup_profile` | 8,000 | 2/3/4/5-man lineup combinations (2,000 each), current season, via the genuinely bulk `leaguedashlineups` endpoint (4 calls total for the whole league). Weekly-refresh, not one-time. |
| `team_splits` | 581 | DaysRest/Location/Month/PrePostAllStar/WinsLosses splits, current season, 30 teams. |

### `nba_stats`
| Table | Rows | Purpose |
|---|---|---|
| `player_game_log` / `player_game_log_advanced` | 79,358 / 79,358 | Per-game player box scores, base + advanced, 3 seasons. **This is the foundational table everything else joins against.** |
| `player_career_season_totals` | 3,644 | Season-by-season career totals, all 582 active players, entire careers. `TEAM_ID=0` rows are the confirmed-correct combined total for traded players (empirically verified, not assumed — see bug list). |
| `player_splits` | 9,948 | Same 5 split types as team_splits, current season, 577/582 players (5 real HTTP 500s from the source itself, under tolerance). |
| `player_game_starter_status` | 32,179 | Per-game starter/bench flag + DNP/DND comment text, 2025-26 only, all 1,230 games. |
| `game_officials` | 3,681 | Per-game referee assignments (not just the roster), 2025-26 only, 1,227/1,230 games (3 games have genuinely empty officials in the source API itself, confirmed via raw-response capture). |
| `player_impact_rating` | 530 | DARKO DPM, source: darko.app (free, public), generic table name (not hardcoded to "DARKO") per Gemini's source-swap-resilience advice. |
| `player_onoff_profile` | 582 | Single-player on/off net-rating differential. |
| `player_playtype_profile` | 3,282 | Player-level Synergy play types, 11 real categories. |
| `player_shot_quality` / `player_shot_quality_delta` / `player_shot_zone_profile` | 2,244 / 582 / 4,656 | Defender-distance shot quality (actual eFG% minus expected eFG% given shot difficulty) — a free public proxy for professional Quantified Shot Quality. |
| `player_tracking_profile` / `player_tracking_detail` | 582 / 4,652 | Speed/distance summary + 8 measure-type detail (Passing, Rebounding, Drives, CatchShoot, PullUpShot, ElbowTouch, PostTouch, PaintTouch). |
| `player_season_profile` | 582 | Age/height/weight/draft/bio, one row per player. |
| `player_roster_snapshot` / `player_differential_log` | 582 / 0 | Same weekly-differential pattern as team/officials. |

### `nba_config`
| Table | Rows | Purpose |
|---|---|---|
| `worker_definitions` | 19 | Job registry — every NBA worker's name, job_key, phase (static/backfill/delta/differential/weekly), enabled flag, and a real notes field documenting what each one actually does and what was found while building it. |
| `system_settings` | 5 | Tunable config values (never hardcoded per the person's standing rule). |
| `external_credentials` | 1 | balldontlie.io API key (backup source, not currently used by any live worker — nba.com is the primary/only real source in use). |

## 4. Complete worker inventory (19 registered, all `enabled=1`)

| Worker | Job key | Phase | Real source endpoint(s) | Cadence |
|---|---|---|---|---|
| `alphadog-v2-nba-static-teams` | nba-static-teams | static | `leaguestandingsv3` (untested live) + certified fallback | weekly |
| `alphadog-v2-nba-static-players` | nba-static-players | static | `commonallplayers` | weekly |
| `alphadog-v2-nba-static-arenas` | nba-static-arenas | static | `teamdetails` (TeamBackground) | weekly |
| `alphadog-v2-nba-static-officials` | nba-static-officials | static | Wikipedia "List of NBA referees" (wikitext API) | weekly |
| `alphadog-v2-nba-static-player-bio` | nba-static-player-bio | static | `leaguedashplayerbiostats` + `playerindex` (position fix, see bug #3) | weekly |
| `alphadog-v2-nba-static-player-tracking` | nba-static-player-tracking | static | `leaguedashptstats` (SpeedDistance) | weekly |
| `alphadog-v2-nba-static-team-stats` | nba-static-team-stats | static | `leaguedashteamstats` (Advanced) | weekly |
| `alphadog-v2-nba-static-onoff` | nba-static-onoff | static | `teamplayeronoffdetails` (30 calls, per team) | weekly |
| `alphadog-v2-nba-static-darko` | nba-static-darko | static | darko.app (SvelteKit hydration JSON extraction) | weekly |
| `alphadog-v2-nba-static-schedule` | nba-static-schedule | static | `scheduleleaguev2` (both 2025-26 and 2026-27) | weekly |
| `alphadog-v2-nba-static-playtypes` | nba-static-playtypes | static | `synergyplaytypes` (11 types, player+team, off+def) | weekly |
| `alphadog-v2-nba-static-tracking-detail` | nba-static-tracking-detail | static | `leaguedashptstats` (8 measure types) | weekly |
| `alphadog-v2-nba-static-shotquality` | nba-static-shotquality | static | `leaguedashplayerptshot` + `leaguedashplayershotlocations` | weekly |
| `alphadog-v2-nba-static-lineups` | nba-static-lineups | weekly | `leaguedashlineups` (4 calls, GroupQuantity 2/3/4/5) | weekly |
| `alphadog-v2-nba-static-backfill` | nba-static-backfill | backfill | `playergamelogs`/`teamgamelogs` (Base+Advanced, 3 seasons) + `playercareerstats` + splits | one-time |
| `alphadog-v2-nba-static-starter-status` | nba-static-starter-status | backfill | `boxscoretraditionalv3` (1,230 per-game calls, 2025-26 only) | one-time |
| `alphadog-v2-nba-static-game-officials` | nba-static-game-officials | backfill | `boxscoresummaryv3` (1,230 per-game calls, 2025-26 only) | one-time |
| `alphadog-v2-nba-daily-delta` | nba-daily-delta | delta | Same bulk endpoints as backfill, current season only | **ongoing, once season starts** |
| `alphadog-v2-nba-weekly-differential` | nba-weekly-differential | differential | Compares its own owned snapshot tables against current state | weekly |

**Binding names** (for `run_job(target=...)`): `NBA_STATIC_TEAMS_WORKER`, `NBA_STATIC_PLAYERS_WORKER`,
`NBA_STATIC_ARENAS_WORKER`, `NBA_STATIC_OFFICIALS_WORKER`, `NBA_STATIC_PLAYER_BIO_WORKER`,
`NBA_STATIC_PLAYER_TRACKING_WORKER`, `NBA_STATIC_TEAM_STATS_WORKER`, `NBA_STATIC_ONOFF_WORKER`,
`NBA_STATIC_DARKO_WORKER`, `NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER`, `NBA_STATIC_SCHEDULE_WORKER`,
`NBA_STATIC_PLAYTYPES_WORKER`, `NBA_STATIC_TRACKING_DETAIL_WORKER`, `NBA_STATIC_SHOTQUALITY_WORKER`,
`NBA_STATIC_BACKFILL_WORKER`, `NBA_STATIC_STARTER_STATUS_WORKER`, `NBA_STATIC_GAME_OFFICIALS_WORKER`,
`NBA_STATIC_LINEUPS_WORKER`, `NBA_DAILY_DELTA_WORKER`.

## 5. Real data sources — the full list, with reliability notes

| Source | What it provides | Real reliability notes |
|---|---|---|
| `stats.nba.com` (via GitHub Actions + curl_cffi) | Nearly everything — game logs, splits, tracking, shot quality, play types, lineups, schedule | **The only reliable path**: Cloudflare Workers are IP-blocked outright (520/403). Within stats.nba.com itself: **legacy v2 endpoints (`boxscoretraditionalv2`, `boxscoresummaryv2`) are confirmed unreliable for historical/non-current games** — silently return HTTP 200 with empty result sets for ~97% of a season in one real test. Their v3 successors (`boxscoretraditionalv3`, `boxscoresummaryv3`) are confirmed reliable across old and new games alike via direct diagnostic testing before each full run. |
| Wikipedia (wikitext API) | Referee roster | Reliable, but no stats.nba.com official-ID crosswalk exists yet — officials are matched by name-derived ID until box-score data provides a real one. |
| darko.app | DARKO DPM (player impact rating) | Free, public, but not an official API — data is embedded in a SvelteKit page's hydration JSON and has to be extracted/repaired from JS-object-literal syntax to valid JSON. Stored in a generically-named table (not hardcoded to "DARKO") specifically so the source can be swapped later without a schema change. |
| ParlayAPI | Historical + (eventually) live board/market data | Locked as the source per the person's own account; **not yet independently tested** for NBA specifically as of this checkpoint. |
| balldontlie.io | Backup/fallback | API key stored in `nba_config.external_credentials`; not used by any live worker currently — nba.com direct is preferred and has been sufficient. |
| `ak-static.cms.nba.com/referee/injury/Injury-Report_*.pdf` | Official pregame injury reports (Questionable/Probable/Doubtful/Out + reason), multiple times/day, real historical archive back to 2021-22 | **Found via research (2026-09-04), NOT yet built.** Free, official, predictable URL pattern. Correctly de-prioritized for now: belongs in the future enrichment/master-run layer (daily ingestion of the *current* report), not the historical baseline (which is explicitly designed to be injury-agnostic) or this backfill/static/delta phase. Historical PDF backfill is lower priority still — training data for a future refinement, not urgent. |

## 6. Every real bug found and fixed, with root cause (not just "fixed it")

1. **Cloudflare Workers IP-blocked by all nba.com/nba.net domains.** Confirmed via a dedicated
   `/probe-sources` diagnostic route (520/403, not a header/UA issue). Fixed by moving all real
   scraping to GitHub Actions runners + committing JSON, mirroring MLB's own established pattern.

2. **`MeasureType=Advanced` assumed to need ~1,230 per-game calls — actually 2 bulk calls.**
   Caught before building the expensive version: the same bulk `playergamelogs`/`teamgamelogs`
   endpoints accept `MeasureType=Advanced` directly.

3. **`position` field silently empty since the bio worker was first built.** The column existed
   in `nba_ref.players`'s schema from day one but the scraper never actually populated it.
   First fix attempt was itself wrong: tried pulling `PLAYER_POSITION` from
   `leaguedashplayerbiostats`, checked the real schema, found `PlayerPosition` is a filter
   parameter there, not an output column — reverted before shipping. Real fix: added a second
   bulk call to `playerindex`, which has a genuine `POSITION` field (confirmed via a documented
   real example response). 582/582 positions now populated.

4. **`boxscoretraditionalv2` unreliable for historical games.** First starter-status backfill
   attempt reported "1,228/1,230 succeeded, 0 errors" but the actual committed data had only
   799 rows across 31 games. Root cause: the endpoint returns HTTP 200 with a structurally valid
   but *empty* `PlayerStats` result set for almost every non-current game — a real, undocumented
   reliability gap, later confirmed as a known, nba_api-documented issue (v2 unreliable after
   4/10/2025). Fixed by switching to `boxscoretraditionalv3` (nested JSON, confirmed reliable via
   a 5-game diagnostic sample spanning the whole season before committing to the full run).
   Second run: 1,230/1,230 games, 32,179 rows, verified independently (12,300 starters =
   exactly 10/game × 1,230).

5. **Truthiness bug in the officials backfill's own error handling.** `fetch_game()` correctly
   returned `([], "zero_officials_parsed_v3")` for a genuinely-empty game, but the calling loop
   checked `if rows is not None` — true for an empty list — so the error was silently swallowed
   and the game simply vanished from output with zero record of failure. Found by cross-checking
   actual distinct game count (1,227) against the meta's claimed success count (1,230), not by
   trusting the "0 errors" report. Fixed to check truthiness; confirmed the 3 missing games
   (0022500259/260/261, all 2025-11-19) have a genuinely empty officials field in the raw API
   response itself (captured directly) — a real, small, permanent source-side gap, not a bug,
   accepted at 3/1,230 = 0.24%.

6. **Postgres array-literal formatting for `lineup_profile.player_ids` (`TEXT[]`).** Passing a
   plain JS array through the bulk-insert helper produced `"malformed array literal"` — the
   driver serialized it as a bare comma-joined string, not a Postgres array literal. Fixed by
   manually building the `{a,b,c}` string form.

7. **`lineup_profile` primary key missing `team_id`.** The same 2-player `GROUP_ID` can
   legitimately appear under two different teams within one season (a pair traded together
   mid-season could theoretically re-pair elsewhere) — triggered "ON CONFLICT DO UPDATE command
   cannot affect row a second time" on the very first real load. Fixed by widening the primary
   key to `(group_quantity, group_id, team_id, season)`.

8. **Daily-delta completeness check initially compared against ALL calendar Final games,
   including preseason/playoffs/All-Star/Cup-final** (2025-26 showed 1,400 calendar vs. 1,230
   logged — looked like a 170-game gap). First fix attempt (filter to blank `game_label`) was
   itself wrong: it under-counted to 1,149, because Cup group-stage games, Rivals Week, and
   international showcase games all correctly count as regular season but carry a non-blank
   label. Real fix: the NBA `GAME_ID` prefix convention (`002`=regular season) — verified it
   matches the known-correct 1,230 exactly before trusting it.

9. **The daily-delta worker's own design comment promised surfacing which new games are missing
   starter-status/officials coverage, but this was never actually implemented** — caught by
   re-reading my own code against my own documented intent, not by external feedback. Added the
   real check; verified it reproduces the exact known-correct numbers (0 missing starter-status,
   3 missing officials for 2025-26) before trusting it.

## 7. Key research findings and Gemini consultations, condensed

- **Backfill season count**: 3 seasons (2023-24/2024-25/2025-26) of full per-game logs — Gemini's
  specific reasoning: 1-2 seasons is too thin for context-specific patterns; more than 5-6 has a
  real, specific downside (a player's own data from a different role/team years ago is *actively
  misleading*, not just less useful — e.g. prime-Thunder-era Kevin Durant stats would hurt, not
  help, a model predicting him today).
- **Split prioritization**: DaysRest/Location/StartingPosition = high-signal;
  PrePostAllStar = worthwhile; WinsLosses = collect but flag as correlational (games are won partly
  *because* of good individual play — real leakage risk if used naively); Month = low-signal,
  collected because it's free in the same call.
- **Career totals for trade handling**: empirically confirmed (not assumed) that `TEAM_ID=0` rows
  are the correct combined-season total for traded players, matching Basketball-Reference's "TOT"
  convention.
- **Baseline/enrichment architecture**: baseline must be strictly historical (zero live daily
  dependencies) so it's cacheable and fast; enrichment (injury, market anchoring, blowout
  adjustment) applies separately, daily, on top. Confirmed correct independently via a second
  Gemini consultation, not just accepted on the first pass.
- **"You need raw XYZ player-tracking data" claim (sharp-bettor blogs)**: investigated and found
  overstated for a non-enterprise operation — Gemini's assessment, which held up against the
  actual examples those same sources gave (role/usage shifts, pace, rest), all of which this
  system's existing tracking-summary and shot-quality data already supports.
- **Highest-value single additions, per multiple Gemini research passes across the build**:
  Synergy play-types ("highest-value single addition" of the third research pass),
  Shot Quality Delta (fourth pass), on/off net rating, and — from the most recent deep-audit
  pass — per-game starter status as "foundational, non-negotiable" for props.

## 8. What is explicitly NOT done yet — and why, precisely

This is the most important section for continuity. Everything below is a **deliberate scope
boundary**, not an oversight:

1. **Baseline projection pipeline (EWMA + Bayesian shrinkage)** — fully designed in
   `NBA_BASELINE_METHODOLOGY.md` (5-step pipeline: shrunken per-36 rate → historical minutes role
   → per-possession efficiency → pace/defense multipliers → raw projection, plus rolling-window
   variance and trend factor) but **zero code has been written for it**. This is the actual "heart
   of the system" per the person's own framing, and per Gemini's most recent research pass, the
   single highest-impact next build — but the person has explicitly redirected twice (mid-session)
   to stay in the backfill/static/delta data layer instead of starting this.

2. **Master run (4-stage: Board → Daily Context → Market → Scoring Engine)** — not started at all.
   No PrizePicks/Sleeper/Underdog board scraper exists for NBA yet (the MLB pattern for this is
   well-established and explicitly meant to be reused, per the domain-mapping doc, but hasn't been
   touched for NBA).

3. **Enrichment factors** (injury/questionable-status, blowout/garbage-time adjustment,
   fatigue beyond simple back-to-back flags, market-odds team-total anchoring) — all researched
   and documented in `NBA_ENRICHMENT_FACTORS_RESEARCH.md`, none built. The NBA official injury-PDF
   source (Section 5 above) is the concrete, real lead for the injury piece specifically, found
   but not yet acted on.

4. **Daily injury-report ingestion** — the correct next enrichment-layer piece per the most recent
   research pass, but explicitly belongs to a later phase, not this one.

5. **ParlayAPI integration for NBA** — locked as the source per the person, but not yet
   independently tested for `basketball_nba` coverage (live `/props` and historical
   `/closing-odds`, per bookmaker) the way it was tested for MLB.

6. **PrizePicks NBA board scraper** — not built. Direct architecture reuse from MLB's own scraper
   is the documented plan (swap the sport filter), but zero NBA-specific code exists.

7. **Outcome grading** — not built. The domain-mapping doc explicitly flags this as something to
   build and verify *early*, given MLB's own real, costly history of an undetected formula bug in
   outcome grading invalidating a major finding for a long stretch. This has not yet started for
   NBA.

## 9. Non-obvious lessons for whoever picks this up next

- **Always test v3 before v2 for any per-game stats.nba.com endpoint.** This cost real time twice
  in a row (starter status, then officials) before the pattern was recognized and applied
  proactively for officials. If a new per-game endpoint is ever needed, check for a v3 first.
- **A "0 errors" / "N/N succeeded" report is not proof of correctness.** Both major backfill bugs
  (starter status, officials) were caught by cross-checking actual row/game counts against claimed
  success, not by trusting the report. Always verify the *data*, not the status field.
- **Cheap diagnostics before expensive full runs, every time.** A 5-7 game sample test (seconds,
  free) caught both v2 failures and the array-literal bug before a ~40-minute full run would have
  wasted the same discovery cycle at 100x the cost.
- **GAME_ID prefixes are the robust way to distinguish game types** — `002`=regular season,
  `001`=preseason, `003`=all-star, `004`=playoffs, `005`=play-in. The free-text `game_label`
  field is NOT reliable for this (confirmed the hard way — Cup group-stage/Rivals
  Week/international games all have real regular-season status but non-blank labels).
- **`run_job`'s target enum can lag behind a freshly-deployed binding** — observed once, ~1 hour
  delay, self-resolved. Don't conclude a new binding is broken; retry later. If truly stuck, raw
  chunked SQL via `run_sql_postgres` is a real (if slow, and error-prone at scale — verify counts
  after every chunk) fallback that was proven to work when needed.
- **The season is currently in the off-period.** 2025-26 is fully complete/frozen (1,230/1,230
  regular season games, verified). 2026-27 starts 2026-10-03 and has zero Final games as of this
  checkpoint — the daily-delta worker has been built and mechanically verified against this empty
  season, but has never been tested against a real newly-completed game. That real-world test
  will be the first genuine validation of the whole delta layer.
- **No automation exists anywhere.** Every worker, static or delta, requires a manual trigger
  (either a `TRIGGER_NBA_*.txt` push or a direct `run_job` call). This is intentional per the
  person's standing instruction, not a gap to close.

## 10. Suggested next steps, in priority order (not a decision — the person directs scope)

1. When the person is ready to move past the data layer: build the baseline projection pipeline
   per `NBA_BASELINE_METHODOLOGY.md` — this is the actual highest-value next step by every
   analysis done so far (person's own framing, and Gemini's repeated assessment).
2. Test the daily-delta worker against a real newly-completed game once the 2026-27 season starts
   (2026-10-03) — this is the first genuine end-to-end validation of the delta layer.
3. Test ParlayAPI's NBA coverage directly (`basketball_nba` sport key, live + historical, per
   bookmaker) before building anything that depends on it.
4. Build the PrizePicks NBA board scraper, reusing MLB's architecture.
5. Build outcome grading early, per the domain-mapping doc's explicit warning about MLB's own
   costly mistake in this exact area.
6. When ready for the enrichment layer specifically: daily injury-report ingestion via the
   `ak-static.cms.nba.com/referee/injury/` PDF source found in Section 5.

---

*End of checkpoint. Every table, worker, source, bug, and finding above was re-verified against
live Postgres and the live repo on 2026-09-04 at the time of writing — none of it is carried
forward from memory of earlier, potentially-stale session summaries.*
