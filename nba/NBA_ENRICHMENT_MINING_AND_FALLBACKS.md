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

---

## 10. BUILT 2026-09-23 — the injury report is IN POSTGRES, and the derived P(plays) fallback is measured

**Storage (build item 1's loader, which never existed).** The scraper was built in 2026-09; the loader was not, so
the binding availability input lived only as repo JSON and `nba_daily` held zero tables — nothing could query the factor
that gates availability. Built: **`nba/load_injury_report.py`** → **`nba_daily.injury_report_snapshots`**, plus
`.github/workflows/nba-injury-load.yml` (modes: `archive` per season slug, `current` for the daily file).
**Loaded: 919,949 rows (2025-26) + 2024-25, 330 game dates, 7,989 distinct snapshots.** One row per
`(game_date, snapshot_ts, team, player)` — snapshot semantics preserved per the PARITY RULE above, so "known at
12:30 PM" stays distinguishable from "known at 7:45 PM". `NOT_YET_SUBMITTED` rows are kept (a team that has not filed
is a fact, not a gap): Out 65.7% · Questionable 10.9% · not-submitted 9.4% · Available 8.0% · Probable 3.3% · Doubtful 2.7%.

**P(plays | status) AS KNOWN AT THE CUTOFF** (16:15 ET = P3's 1:15 PM PT decision moment; both seasons, 330 dates):

| status at cutoff | player-games | P(plays) | minutes when they play |
|---|---|---|---|
| Out | 19,677 | 0.002 | 8.8 |
| Doubtful | 671 | 0.010 | 13.5 |
| **Questionable** | **3,823** | **0.469** | 24.0 |
| Available | 1,628 | 0.801 | 23.2 |
| Probable | 1,466 | 0.878 | 26.5 |

⚠ Measured at the FINAL snapshot instead, only 24 Questionables survive — the league resolves them before tip. The
cutoff is the only honest measuring point for a decision pipeline. ⚠ `Available` (0.80) sits BELOW `Probable` (0.88) on
1,628 player-games: unexplained, recorded rather than smoothed away.

**The derived fallback.** `nba_score.availability_training` — leakage-free training set (status as known at 16:15 ET;
features only from games strictly before the slate; name join uses `nba_names.norm_name`'s suffix rule, 553/559 = 98.9%).
`nba_score.availability_prior` — hierarchical empirical cells with shrinkage 15/10/5: cell (status × role_tier ×
reason_class × games-played-30 bucket) → status_role → status → global, **fit on 2024-25 ONLY**.
`nba_score.availability_p_plays(status, role_tier, reason_class, games_played_30)` is the interface.
**Out-of-sample on 2025-26** (never touched in fitting): Brier **0.0441** vs **0.0498** status-only (**11.3% better**);
Questionables alone **0.2398** vs **0.2505** (**4.3% better**); mean prediction 0.160 vs actual 0.166 (calibrated).
Signal: role_tier spans 0.30 (FRINGE / no recent games) → 0.62 (IRON_MAN); `gleague_two_way` 0.21; player's own rest
0.42 on 1–2 days vs 0.55 on 3–4.
🔴 **A richer variant was built and REJECTED**: adding the player's rest bucket and a fourth hierarchy level (1,493 cells
vs 658) LOST out of sample on both segments (0.0445 / 0.2418). Granularity has a limit and the held-out season decides it.
⚠ A TEAM back-to-back barely moves Questionables (0.499 vs 0.466) — the player's own days-since-last is the real feature.

---

## 11. A5 STARTER FALLBACK, AND TWO THINGS THE DATA KILLED (2026-09-23)

**A5 — P(player starts tonight).** Official lineups land ~30 min before tip, long after P3's cutoff, so at
decision time the lineup is normally unknown and this is the working answer, not a backup.
`nba_score.starter_training` (78,556 player-games, 3 seasons — the officials and starter-status backfills
were mined weeks ago and had never been LOADED; both are now in Postgres) →
`nba_score.starter_prior_v2` → **`nba_score.p_start(started_last, start_rate_10, avg_min_10, starters_out)`**.
Fit on 2024-25 ONLY, validated on 2025-26 (26,543 unseen player-games): **Brier 0.07034** vs 0.07211 without
the starters-out term (**2.46% better**; **2.91%** on bench players), vs **0.0834** for the naive
"started last game" rule and **0.2487** for the base rate. Accuracy 91.0%; mean prediction 0.4643 vs actual
0.4631.
**The mechanism, measured:** a bench player starts 3.3% of the time with no regular starters out, 6.5% with
one, 9.2% with two, **15.9% with three** — while an established starter sits at ~90% regardless. The
asymmetry is why the term sits in a fourth level under `started_last` rather than as a global shift.

🔴 **REJECTED — an evidence-depth confidence factor.** Single dates suggested players with no prior-season
history were badly mis-scored (calibration gaps of −10, +10, −17 points while confidence stayed at 0.94).
Across **307,035 confident standard legs over both seasons** the group realises **1.5506 / 1.5402** against
known players' **1.5408 / 1.5480** — better in one season, worse in the other, gaps under a point, sign
flipping. It is variance, not an edge leak, and a filter would have COST money in 2024-25. Dropped.
This matches `NBA_FINAL_SCORING_CALIBRATION.md`: the factor layer is worth Brier +0.1–0.3%, "real but small…
not where the big gains are", and seven of ten factors already separate nothing.
⚠ Separately: `f_depth` is MISLABELLED. The docstring calls it "evidence depth"; the code is
`clip(1 - |ladder_offset| / 14)` — distance from the anchor rung. Nothing in the confidence model measures
how much history backs a player. Left as-is (the measurement above says it would not pay), but the name lies.

🔴 **REJECTED — ingesting preseason into the projection pipeline.** External work is consistent: preseason
box scores are deceptive because rotations are experimental (stars rest, rookies play heavy minutes), and
only RATE stats (3PA rate) carry into the season while volume and minutes do not — which is exactly what the
baseline needs. Internally the case collapses too: preseason has never been in `player_game_log` (no rows
before opening night, so it never contaminated anything), and the one problem it could solve — pricing
unknown players — does not exist per the measurement above. **Preseason stays out of player projections.**
Its real use is board and multiplier learning: the apps post preseason lines, and that history teaches tier
and payout structure with zero contamination risk. `game_label = 'Preseason'` in `nba_calendar.games`
(66 games, 2026-10-03 → 10-16) is the clean separator if a slate ever needs excluding.

---

## 12. D1 REFEREE — THE HOUR WAS WRONG, NOT THE PIPELINE (owner decision 2026-09-23)

The parity doc's stage table (§7) puts `D1 referee crew` at the **baseline** stage, available **~6–7 AM PT**
(9–10 AM ET). The baseline is built by P2, whose target cron was **09:00 UTC = 01:00 PT** — five to six hours
BEFORE assignments publish. The evidence of which statement lost: **`nba_ref.referee_assignments` held 0 rows**
while P2 ran `scrape_referee_assignments.py` nightly. It was scraping a page that did not exist yet.
**Resolved by moving the SCHEDULE, not the logic.** The scrape stays exactly where it was in P2; P2's cron is
now `45 15 * * *` — **08:45 PT under PDT, 07:45 PT under PST** — after the posting, and still finishing around
10:40 / 09:40 PT against P3's 13:15 cutoff (~3h of retry slack). The dedicated job `nba-referees.yml` (08:30 PT)
remains the primary capture; P2's scrape is an idempotent upsert on `(game_date, matchup, slot)`.
⚠ **No rebuild was triggered by this** — verified before assuming: `classification_ladder_v12.py` (the certified
recipe) contains **zero** references to referees, officials or crew, and the assignments table was empty, so no
historical number was ever computed from D1. Nothing to recompute.
⚠ **No predictor is warranted.** Crews are unpredictable by construction — **3,414 distinct trios across 3,687
games, 3,172 used exactly once, max 4 repeats** — but they do not need predicting: the crew is KNOWN by 08:30 PT,
hours before any decision. Historical crews come from box scores (post-hoc truth, `nba_stats.game_officials`,
11,062 rows across 3 seasons, all now loaded). A predictor would serve only the 01:00–07:00 window, in which
nothing is decided.
**Worth of the factor when it IS missing:** official foul-rate spread is 0.9–1.4 per game against a game-level
SD of 6.7, with year-over-year persistence **0.264** — true persistent spread ~**0.7 fouls on a 37–40 base,
under 2%**. The confidence model prices its absence at **0.88 of 44** deduction points, so the documented
fallback (factor zero + penalty) does NOT over-penalise. For when the crew IS known:
`nba_ref.official_tendency` — 78 officials, shrunk with **k=112** derived from that measured reliability, which
halves the raw spread (1.015 → 0.513) because raw means overstate the effect at ~40 games a season.

dedicated daily job `nba-referees.yml` (08:30 PT) as the primary capture and P3 as the idempotent safety net
(the upsert key is `game_date, matchup, slot`). This stays inside the parity doc's own rule — *"Stage is where
the factor is COMPUTED; phase 2 may still READ a phase-1 value."* ⚠ **No predictor is needed**: the crew is
KNOWN by 08:30 PT, long before the 13:15 decision, and the historical crew comes from box scores (post-hoc
truth, faithful per COMPASS fact 58). A predictor would only serve the 01:00–07:00 window, which no decision
depends on. Measured worth of the factor if it is missing anyway: spread `0.7` fouls on a `37-40` base
(under 2%), year-over-year persistence `0.264` — and the confidence model prices its absence at `0.88` of `44`
deduction points, so the fallback does NOT over-penalize. Shrunk tendencies for when the crew IS known:
`nba_ref.official_tendency` (78 officials, k=112 from the measured reliability).

**Still open here:** wire the prior into the consumers (the baseline builder and `build_availability_delta.py` read the
injury JSON, not Postgres, so the fallback must be called there); add the daily load to P2/P3 beside the scrape step;
`nba_ref.referee_assignments` is EMPTY (0 rows) while P2 runs its scraper nightly — D1's primary has never produced data
and its documented fallback (zero + confidence penalty) would be silently active every game day.

**Status as of 2026-09-10 05:30Z** (config `enrichment_backfill_status_2026_09_10`), restored here after a 2026-09-23
patch of mine accidentally consumed the sentence: every factor has its two-season backfill except the pick'em/prop
history (built, waiting only on the owner's Odds API upgrade). Remaining small builds: coach-change dates 2024-25/2023-24, All-Star/All-NBA lists, national-TV flag, ~~daily referee-assignments scraper~~ *(BUILT — `scrape_referee_assignments.py` runs in P2, but `nba_ref.referee_assignments` is still EMPTY, see above)*, the NBA game-id join for `game_lines_closing`/`board_snapshots`, the two 2023-24 starter-status game timeouts. BigDataBall is no longer needed (The Odds API history covers the sportsbook props and both DFS boards).
