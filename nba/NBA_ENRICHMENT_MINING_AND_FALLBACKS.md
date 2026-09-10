# NBA Enrichment — Mining Sources, Fallbacks, and Backfill Plan (2026-09-09)

*Owner rule: every daily factor needs (1) a primary source, (2) a reliable fallback — either a second source of equal
reliability or a DERIVED version trained on the two seasons and brought as close to perfection as possible — so the
factor is ALWAYS populated at every run, and (3) a backfill route for 2023-24 → 2025-26 so the final hit-probability /
score engine can be trained. Baseline-side factors ride on game logs/splits/schedule and need no fallback (always
available). This document is the lock for steps 2 and 3; `NBA_ENRICHMENT_FACTOR_LOCK.md` is the lock for step 1.*

Conventions: all scrapers run on GitHub Actions with `curl_cffi` (nba.com blocks Cloudflare egress), commit JSON under
`nba/data/`, and a worker loads Postgres. Every mined snapshot carries `fetched_at`; the enrichment run records which
source (primary / secondary / derived) populated each factor (`information_freshness`, design rule).

---

## 1. Availability family

### A1 Own injury status · N1 P(plays|Questionable) · N2 injury class · A6 late scratch
- **Primary**: official injury report PDFs — `https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMAM.pdf`
  (and `_PM`). Snapshots observed at 12:30 PM, 1:00, 2:30, 3:30, 4:00, 6:45, 7:45 PM ET and others. Parse: game date,
  game time, matchup, team, player, current status (Out / Doubtful / Questionable / Probable / Available), reason text.
  League timing rule: day-before 5 PM local; game-day 11 AM–1 PM local; second night of a B2B 1 PM local.
  Scraper: `scrape_nba_injury_report.py` — daily mode: probe the known snapshot times for today and tomorrow (each is a
  small HEAD/GET; keep the latest that exists); backfill mode: enumerate every date of the two seasons × the snapshot
  slots, keep every snapshot found (statuses AS KNOWN, with timestamps). PDF text extraction with `pdfplumber` (the layout
  is a fixed table).
- **Secondary**: `boxscoresummaryv3` inactive list (post-tip, truth) and `commonteamroster` (roster membership); for
  live pre-tip, the nba.com game page "injury" widget is the same feed as the PDF. Beat-reporter feeds are not automated
  (no reliable free API); they are a manual/Coworker channel.
- **Derived fallback (trained)**: P(plays) prior from history — per player: recent DNP pattern, games-missed streak,
  rest-spot prior (A4), team resolution rate (N1) — used when no report exists for the game (early morning before the
  day-before report, or a fetch failure). Trained on the PDF backfill vs box-score truth; target: Brier on P(plays).
- **Backfill**: PDF archive (2 seasons) + box-score DNP/inactive truth (have). Missing PDF days → truth only, flagged.

### A2 teammate-out redistribution · B4 opponent absences
- **Primary**: derived from A1 (Outs) + our with/without and on/off tables (built) + archetype/usage tiers from our logs.
- **Fallback**: same tables under the P(plays)-weighted branch blend; nothing external needed.
- **Backfill**: box-score inactives × game logs (have, 3 seasons): measurable now.

### A3 returning-player restriction
- **Primary (baseline)**: game-back index and games-missed tier from logs → the measured ramp (in the recipe since v30).
- **Enrichment residual**: coach restriction quote (manual channel). **Fallback**: the ramp itself (trained, in place).
- **Backfill**: have (logs).

### A4 star rest probability
- **Primary (baseline)**: derived prior — schedule (B2B, 3-in-4, home/road, national TV flag), age/mileage, policy
  designation (All-Star/All-NBA in the last 3 seasons: static list per season), consecutive games, prior-night minutes/OT,
  standings lock, opponent strength, monthly rest count. Trained on 3 seasons of DNP-rest outcomes (reason "Rest" /
  "Injury Management" in the PDF backfill; box-score DNPs as truth).
- **Enrichment**: the day-before report resolves it (A1). **Fallback**: the prior. **Backfill**: have + PDF archive.
- Needed static inputs: national-TV flag (verify in the schedule file; else scrape the broadcast schedule once per
  season), All-Star/All-NBA lists per season (one static file).

### A5 lineup change
- **Primary**: confirmed starting lineups — nba.com game pages (`boxscoretraditionalv3` `starters` once posted, ~30 min
  pre-tip) and the league's lineup feed; aggregator accounts are manual.
- **Fallback (trained)**: P(start) from starter-status history (baseline, built for 2025-26; backfill 2023-24/2024-25 via
  `boxscoretraditionalv3`, ~2,460 calls) plus the day-before Outs (starter out → next man up by position and recent
  starts). Target: accuracy of the predicted 5 vs actual on two seasons.
- **Backfill**: starter status 2 seasons (to build).

### A7 trade window · A8 rookie/two-way · A9 suspension
- **Primary**: transactions — `commonallplayers`/roster diffs daily (team change detection in our logs already works
  post-hoc); NBA transactions feed (nba.com/players/transactions) for dates; two-way status from `commonteamroster`
  (contract type field); suspensions from the injury report reason text ("Suspension").
- **Fallback**: roster diff from the daily player scrape (built weekly; make it daily in-season). **Backfill**: logs.
- **Preseason seed (baseline)**: `playergamelogs` with `SeasonType=Pre Season` — one bulk call per season (backfill
  2023-24, 2024-25, 2025-26 preseason; ~2 MB each).

## 2. Game-state and market family

### B1/B2 market spread and total · C3 game-line movement
- **Primary**: ParlayAPI game lines (owner-locked; live at season start) — opening and current spread/total per game.
- **Secondary**: a second odds feed (The Odds API free tier, 500 req/month; or Action Network/Covers scrapes — verify
  terms) for game lines only.
- **Derived fallback (trained)**: our derived spread (r = 0.46 vs margin) and pace-implied total — already in the
  baseline; the market delta simply becomes zero (the recipe's "missing factor = zero contribution + confidence penalty").
  Improve the derived spread toward market grade with the day-before Outs (biggest lever) and the rest prior — target
  r ≥ 0.52 on two seasons.
- **Backfill**: ParlayAPI historical game lines (NBA 2007+; to pull) — opening/closing spreads and totals, 2 seasons.

### B3 leverage / tanking
- **Primary (baseline)**: standings from logs by date (derived). No external source. **Backfill**: have.

### B5 OT probability
- Baseline mixture branch (derived from the spread). Market version = the OT market (rare); not needed.

### C1/C2 book vs pick'em gap, prop-line movement · C4 board vs anchor · S1–S4 pick'em structure
- **Primary**: the boards (PrizePicks/Underdog/Sleeper scrapers — the MLB pattern; to build at season start) + a
  sportsbook prop-line feed (odds API; verify availability/cost).
- **Fallback**: none possible for the *gap* (if the book feed is missing, the factor is zero + confidence penalty); the
  board itself is the master-run input and has its own retry/secondary scrape.
- **Backfill**: **paid** (BigDataBall historical prop lines) — owner decision. Without it, C1/C2 cannot be trained on
  history; they would enter live with conservative priors and be calibrated in-season (the Platt pattern).

## 3. Matchup family

### M1 primary defender quality · M2 scheme proxy · M3 hustle · M4 clutch
- **Primary (baseline)**: season tables — `leagueseasonmatchups` (one bulk call/season; OffTeamID/DefTeamID filters),
  `leaguedashptdefend` (per defender), `leaguehustlestatsplayer`/team hustle, `leaguedashplayerclutch`; DARKO defensive
  DPM (built); Synergy play-type defense and shot locations (built).
- **Daily**: the expected primary defender = the opponent's most frequent matchup for this player (or by position) after
  removing day-before Outs. Optional per-game truth: `boxscorematchupsv3` (~1,230 calls/season) for backtesting the
  assignment model.
- **Fallback**: position-level DvP (built) when the matchup table lacks the pairing. **Backfill**: bulk per season (cheap).

## 4. Officials and schedule

### D1 referee crew
- **Primary**: `https://official.nba.com/referee-assignments/` (posted ~9 AM ET daily; scrape the HTML table).
- **Secondary**: `boxscoresummaryv3` officials (post-tip truth; our `game_officials` table, 2025-26 built).
- **Fallback (trained)**: no crew → factor zero + confidence penalty (crew is tertiary by design).
- **Backfill**: `boxscoresummaryv3` for 2023-24 and 2024-25 (~2,460 calls) → tendency table (fouls/48, FTA rate, pace,
  technicals) per official and per crew; decide by significance on 2025-26 first.

### D2 schedule density / travel / day game / altitude
- **Primary (baseline)**: schedule + arena time zones (built). No fallback needed. **Backfill**: have.

## 5. Coach and roles

### K1 coach rotation profile
- **Primary (baseline)**: derived from box scores + quarter files keyed by coach; needs a **coach-by-team-by-date** table
  (one static file per season: head coach changes with dates — scrape once from nba.com/team pages or maintain manually).
- **Fallback**: team-level profile. **Backfill**: have (logs) + coach table.

### Q1 usage share, game-flow prior, BLKA, PFD (baseline)
- From our quarter files and bulk logs (PFD/BLKA: verify retained in the slim season files; add to the KEEP list of the
  backfill/delta scrapers if missing — one re-run of the bulk logs).

## 6. Confidence modifiers (E1–E4)
- Derived from run timestamps and the source-of-record per factor; no external source.

---

## 7. Build list (scrapers and backfills), in priority order

| # | Build | Unlocks | Size |
|---|---|---|---|
| 1 | `scrape_nba_injury_report.py` (daily + backfill modes, pdfplumber) + loader → `nba_daily.injury_report_snapshots` | A1, N1, N2, A4 truth, A6, B4; day-before report into the baseline builder | backfill ≈ 2 seasons × ~5 snapshots/day |
| 2 | Season tables: matchups, defended FG%, hustle, clutch (+ preseason logs) | M1–M4, preseason seed | 4–6 bulk calls/season |
| 3 | Starter-status backfill 2023-24/2024-25 (`boxscoretraditionalv3`) | A5 fallback training, K1 | ~2,460 calls |
| 4 | Officials backfill 2023-24/2024-25 (`boxscoresummaryv3`) + assignments scraper | D1 | ~2,460 calls + daily HTML |
| 5 | ParlayAPI historical game lines (2 seasons) + live game-line puller | B1/B2/C3 + derived-spread validation | API pulls |
| 6 | Static tables: national-TV flag, All-Star/All-NBA lists, coach-by-team-by-date | A4, K1 | small |
| 7 | Board scrapers (PP/UD/Sleeper) at season start; sportsbook prop-line feed (verify) | C1–C4, S1–S4 | season start |
| 8 | Bulk-log KEEP list: add PFD, BLKA, DD2, TD3 | FTM/points/DD | one re-run |

Each backfilled factor is then measured on 2023-24 → 2025-26 with the certification harness pattern (leg-level, two
seasons) before it earns a cell; each derived fallback is trained and reported the same way (its own Brier / accuracy on
two seasons) so "always populated" never means "populated with a guess".

---

## 8. PARITY RULE (owner, 2026-09-09): the backfill must be the same object the daily mining produces

The historical simulation trains the final probability / score / confidence engine. It is only valid if every factor's
history has the **same shape, the same snapshot semantics, and the same as-of cutoff** as the live daily run. Rules:

1. **Same rows.** A backfill writes the same record type the daily scraper writes (injury snapshots with `snapshot_ts`;
   per-game matchup rows; weekly as-of table snapshots with `asof`). Never an end-of-season aggregate where the live run
   will see season-to-date.
2. **One as-of function.** `nba/nba_asof.py` holds the cutoff rules (baseline build = game day 09:00 ET, which sees the
   official day-before report; enrichment runs = 13:30, 17:30, tip−30) and the selectors (`status_asof`, `table_asof`,
   `aggregate_matchups_asof`). Training and production call the same functions with the same arguments — only the
   timestamps differ.
3. **Date-filterable endpoints → weekly as-of snapshots** (`DateTo=`): defended FG%, hustle, clutch. Live daily pulls
   are season-to-date; weekly snapshots are the same object at weekly resolution (the tables move slowly).
4. **Endpoints without a date filter → the atomic per-game object** (`boxscorematchupsv3`) for both live (new games
   only) and backfill (every game); aggregates are derived in-repo. The season table (`leagueseasonmatchups`) is kept
   only as a cross-check of the aggregation, never as a predictor.
5. **Truth is separate from what-was-known.** Box-score DNP/inactives are the truth for training targets; the PDF
   snapshots are what was known. The simulation must never let truth leak into a predictor.
6. **Static-by-season inputs are parity-safe** when they exist before opening day (preseason logs, All-Star/All-NBA
   lists, arenas, schedule) and are used only for the season they precede.

Applied so far: injury report (snapshots both modes ✓), season tables (weekly as-of mode added; per-game matchups
scraper added; end-of-season tables demoted to cross-check), preseason logs ✓.

---

## 9. BACKFILL COVERAGE MATRIX (owner 2026-09-09: every enrichment factor needs a two-season backfill)

Status legend: ✓ have · ⏳ running · 🔧 built, run pending · ⛔ blocked (owner action) · — derived (no external data)

| Factor | 2025-26 | 2024-25 | 2023-24 | Source / build | Notes |
|---|---|---|---|---|---|
| A1 injury_status_self, N1 P(plays\|Q), N2 injury class, A6 late scratch, A9 suspension | ✓ 176 days, 919,949 rows, 7 monthly shards | ✓ 174 days, 418,071 rows, 7 shards | partial (archive coverage older than 2024-25 unverified) | `scrape_nba_injury_report.py` (both URL patterns, header timestamps, md5 dedupe, monthly shards, self-looping workflow) | complete for both seasons 2026-09-10 |
| A2 teammate-out redistribution | ✓ | ✓ | ✓ | box-score absences + logs (derived) + PDFs for as-known | measurable now |
| A3 return ramp | ✓ | ✓ | ✓ | logs; in baseline v30 | — |
| A4 rest probability | ✓ logs | ✓ | ✓ | logs + PDF reason class (⏳) + national-TV flag (verify schedule field) + All-Star/All-NBA lists (static, to add) | absence prior measured |
| A5 lineup change | ✓ starters | ✓ 32,515 rows (1,230/1,230) | ✓ 32,328 rows (1,228/1,230; 2 timeouts to rerun) | `scrape_nba_starter_status.py` SEASON_SLUG (nba-pergame-backfill.yml) | complete |
| A7 trade window | ✓ | ✓ | ✓ | logs (team change) | — |
| A8 rookie / two-way | ✓ preseason + PDF two-way reason | ✓ preseason | ✓ preseason | season tables `preseason_logs` | |
| B1/B2 market spread & total, C3 game-line movement | ✓ closing lines (Postgres nba_market.game_lines_closing) | ✓ | — | ParlayAPI closing-odds archive, 5-7 books, 2,410 games, 12,165 rows (2026-09-10); openers not archived before May 2026 | derived spread stays as the fallback for dates without a line |
| B3 leverage / tanking | ✓ | ✓ | ✓ | standings from logs | — |
| B4/M1 opponent absences / primary defender | ✓ per-game matchups 1,229/1,230 (241,590 pairings, monthly shards) + weekly pt_defend | ✓ 1,230/1,230 (232,830) | ✓ 1,228/1,230 | `scrape_nba_matchups_pergame.py`, season-tables asof_weekly | M1 measured (config `primary_defender_quality_measured`); harness integration pending |
| B5 OT probability | ✓ | ✓ | ✓ | derived | — |
| C1/C2 book vs pick'em gap, prop-line movement | 🔧 The Odds API history (sportsbook props in the `us` region of the same pull) | 🔧 | — | pulled together with the boards by `odds_api_board_backfill` (two snapshots per game: window + tip−30) | runs after the owner's Odds API upgrade |
| C4, S1–S4 pick'em structure (PrizePicks + Underdog boards) | 🔧 The Odds API `us_dfs` history (PP incl. Goblins/Demons, Underdog with multipliers) — verified on 2024-10-25 | 🔧 | — | `odds_api_board_backfill` → `nba_market.board_snapshots`; Sleeper has no history anywhere → derived-Sleeper fallback trained on PP/UD snapshots; live boards from opening day via OUR scrapers (PP, Sleeper, Underdog) + ParlayAPI (Fliff) — see config `board_sources_decision` | waits on the $119/5M plan |
| D1 referee crew | ✓ officials | ✓ 3,691 rows (1,230/1,230) | ✓ 3,690 rows (1,230/1,230) | `scrape_nba_game_officials.py` SEASON_SLUG (nba-pergame-backfill.yml); daily assignments scraper still to build | complete |
| D2 schedule / travel / day game / altitude | ✓ | ✓ | ✓ | logs (dates, home) + arenas | — |
| K1 coach rotation profile | ✓ logs | ✓ | ✓ | logs + coach-by-team-by-date table (source: Wikipedia season pages "Coaching changes" tables with dates; to compile as a static file) | |
| M2 scheme proxy | ✓ current | prior-season table (parity-safe) | prior-season | Synergy play types have no date filter → use the previous season's table for a given season | documented limitation |
| M3 hustle, M4 clutch | ✓ 25 weekly as-of snapshots | ✓ 25 | ✓ 25 | season-tables asof_weekly | complete |
| E1–E4 confidence | — | — | — | run metadata | — |

Status as of 2026-09-10 05:30Z (config `enrichment_backfill_status_2026_09_10`): every factor has its two-season backfill except the pick'em/prop history (built, waiting only on the owner's Odds API upgrade). Remaining small builds: coach-change dates 2024-25/2023-24, All-Star/All-NBA lists, national-TV flag, daily referee-assignments scraper, the NBA game-id join for `game_lines_closing`/`board_snapshots`, the two 2023-24 starter-status game timeouts. BigDataBall is no longer needed (The Odds API history covers the sportsbook props and both DFS boards).
