# NBA FULL-SYSTEM CERTIFICATION — pass ledger (started 2026-10-07)

**Owner directive (2026-10-07, verbatim intent):** double check, revise and certify everything, from the first step of the
first pipeline to the last of the last — data mining, data consumption, calculations, sequence order, final product,
calibration, reliability and logic of each step, every detail that can be checked. Nothing left behind, nothing skipped,
no assumptions, no doubts, no superficial looking; each micro step gets a deep dive; caveats are addressed, not recorded;
multiple passes per session with minimal human intervention; decisions by grounded research + data + debug (+ Gemini as
insight only); document each pass so nothing is redone; realign with this directive at every pass.

**Method.** The system is one chain — scheduler → P1 (weekly) → P2A (results) → P2B (slate) → P3 (afternoon) → P4 (live
slips) → P5 (weekly requalification) — plus the live board scrapers it depends on. The passes follow the data: A chain &
sequence, B mining, C loading, D calculations, E board scoring, F slip system, G reliability & caveats, H final product &
docs. Every finding is written here with its evidence, the fix, the verification, and the status. Standing rules apply
(sample first; test all props; tunables in the DB; one set per day; no MLB edits; COMPASS updated when a decision changes).

Status legend: 🔴 defect found · 🟠 fixed, verification pending · 🟢 fixed and verified · ⚪ verified correct, no change.

---

## PASS A — chain, sequence, triggers (2026-10-07)

### A-1 🟠 P2A failed every night 2026-10-04 → 10-07 (grader crash on a not-yet-existing season file)
- **Evidence:** `nba_control.pipeline_runs` P2A status `failure` on 10-04/05/06/07; run 37608018022 log: step "Grade last
  night's board outcomes" → `urllib.error.HTTPError: HTTP Error 404: Not Found` after `loading logs 2026_27`. Every step
  after it was SKIPPED each night: prune, final_hp rebuild, whole-number re-price, paper grade, slip grade, PP edge monitor,
  Underdog grade, Underdog edge monitor.
- **Root cause:** boards are archived from preseason (dates 2026-10-01..07 exist in `board_snapshots`), `season_of()` maps
  them to `2026_27`, and `nba_player_game_log_2026_27.json` is first written by the delta sync the morning AFTER the first
  regular-season game (`nba_season.active_stats_season` rolls over only once a non-preseason game has been played — correct).
  The grader treated the 404 as fatal. Pre-season there was nothing to grade, so no data was lost — but the same crash would
  have fired on the morning of 2026-10-21 only if the sync had failed; and it hid every downstream step for four nights.
- **Fix:** `grade_board_outcomes.load_logs` — a 404 on the season file returns an empty log set with a loud line; those
  dates grade as `dates_without_boxscore`; any other HTTP error still raises. `load_players` now reads the repo file first
  (same rule as every other file; the CDN caches for minutes). Commits 63ae5d6, 64430f8, 60e664a; offline test: 404 → empty,
  500 → raised.
- **Verify:** next P2A (2026-10-08 03:30 PT) must run green through the Underdog edge monitor. → pending.

### A-2 🟢 A claimed slate whose GitHub run died was never recovered (P2B 2026-10-07)
- **Evidence:** P2B run 37642228109: the `claim` job succeeded (row `claimed` at 15:07:18Z), then the `slate` job and the
  `finish` job (`if: always()`) never existed — the run concluded `failure` with ONE job. The row stayed `claimed`; no P2B
  commit ("NBA P2B inputs 2026-10-07") exists, unlike 10-05 and 10-06. Same symptom seen again at 16:52Z on the deploy
  workflow (run 37655485086, "No jobs found") and on the bridge's own content writes (HTTP 500) — a GitHub-side event, not
  the workflow YAML (unchanged since 10-05, green on 10-06).
- **Root cause (ours):** `decide()` skips any claimed slate; the watchdog only re-dispatches UNCLAIMED slates. A run that
  claims and then dies is therefore final. Successors were not blocked (P3 moves on at its deadline), but the pipeline
  itself was lost for the day. On a game day that is a slate without `final_hp`.
- **Fix:** scheduler v2.2.0 — `pipelineState` asks GitHub for the claim's run; a `claimed` row whose run is `completed` is
  DEAD → closed as `failure` with a note, logged (`stale_claim_closed`), successors treated as finished, and ONE forced
  recovery dispatch (`slot recovery-1`, `inputs.force=true`) while the window is open (P2A/P2B before the latest P2B start
  = P3 − 110 min; P3 before the first tip). Never when the run is queued/in progress; unknown run status is never treated
  as dead. Commits 7121a14 … 5d69a13 (6 patches; remote blob = local, `node --check` ok; pure-function tests of the plan
  and recovery windows pass).
- **Verify:** 🟢 first live tick after deploy (17:05:35Z): `stale_claim_closed` → `recovery_dispatched` (force=true) two
  seconds later → P2B run 37656430722 SUCCESS, `pipeline_runs` row now `success` with both notes. The mechanism works
  end to end on a real dead claim.

### A-3 🟠 P1 2026-10-05 failed: DARKO leaderboard scrape returned 0 players (darko.app redesign)
- **Evidence:** run 37360394246: "DARKO and shot quality" failed; `verify_static_loads` → `nba-static-darko:
  nba_stats.player_impact_rating last write 2026-09-24 … FAILED`; the Defender-ratings and Static-context steps were
  skipped; "Certify the weekly layer" skipped. `nba_darko_current_meta.json`: `players_array_not_found_in_page`. The saved
  HTML shows the new "Modern / Shiny" front end — no `players:[…]` literal any more.
- **Consequences:** (1) `player_impact_rating` frozen at 09-24 (fine today, stale every week of the season);
  (2) `build_defender_ratings.py` and `build_static_context.py` did not run that Monday; (3) the scraper OVERWROTE the good
  repo file with an empty array — only the loader's refusal kept the 09-24 rows in Postgres.
- **Research:** the site is still SvelteKit; `GET https://www.darko.app/__data.json` (fetched through the bridge) returns the
  route data in devalue form with `players = {keys:[26 column names], values:[26 column arrays]}` (~530 rows), plus
  `asOf` / `ratingsThrough` dates.
- **Fix:** `scrape_nba_darko.py` rewritten: primary = `__data.json` with a devalue decoder (objects/arrays/typed wrappers/
  negative specials) and columnar → rows; fallback = the legacy HTML parse; <400 players or a dpm column without values is a
  failure that LEAVES THE PREVIOUS FILE UNTOUCHED. Decoder unit-tested on a faithful miniature (NaN reference, negative
  literal, Date wrapper). Commits 1f8a3f3, df0087a.
- **Verify:** probe run on Actions (`nba-probe.yml`, script: scrape_nba_darko.py) printed **530 players** via `__data.json`
  ✅; the load into `player_impact_rating` + defender ratings + static context waits on a forced P1 (proxy, A-7). → pending.

### A-5 🟠 Concurrent pipeline commits lost a whole run's files (P1 recovery run 37656317775)
- **Evidence:** "Commit weekly data files" → `CONFLICT (content): Merge conflict in nba/data/nba_players_current_meta.json`
  during `git rebase origin/main` (the P2B recovery run had committed its roster refresh minutes earlier); under
  `set -e` the step died, nothing was pushed, the DARKO loader (which reads the repo) found no new file → P1 red again
  after every scrape had succeeded. The same five-line loop is in P1, P2A and both P2B commits (P3 already had a
  tolerant version). On a normal Monday P1 (12:00 PT) and P2B (08:05 PT) do not overlap, but any recovery, replay or
  late run can collide — and both pipelines legitimately write the same generated roster files.
- **Fix:** `nba/git_push_retry.sh` (commit + push; on rejection `rebase -X theirs` = this run's generated files win,
  else abort + `merge -X ours`; six attempts; loud `::error::` on failure). Wired into P1 (hard fail kept), P2A and P2B
  inputs (visible `::warning::`, pipeline continues on the runner's copies), P2B merged ladder (hard fail kept, the
  loader fetches it from the repo). Tested on a throwaway repo against a concurrent conflicting commit: pushed on
  attempt 2 with this run's content. Commits 9d76355, a582e90, 64f736c, 2e15298, f78c455.
- **Verify:** second forced P1 recovery dispatched → weekly files committed, DARKO loaded, certify green, P5 chained.
  → pending.

### A-6 🟠 Betr cloud harvest — intermittent, and NBA props unobserved
- `betr_nba_current.json` was the stale token-path file from 09-10 (the P3 certifier warns "fetched 638 h ago, token
  expires in 3 d" from it; the token path is only the Path-C fallback). Manual cloud harvests today: NBA → OK, 163
  events, 0 legs (Betr has posted no NBA props yet — plausible 13 days out); WNBA (semifinal game day) → `NO BOARD`
  after 4 min with no diagnostic line. The harvester prints nothing between start and the verdict.
- **Action (Pass G):** add step diagnostics (page title/URL reached, Turnstile outcome, graphql responses seen,
  events/legs) so a NO BOARD is diagnosable; re-run WNBA on a game day to prove the parse path; auto-switch stays 10-20.
  → resolved in G-4 (the 163 events were the lobby, not a board).

### A-7 🔴 (owner) The shared scraping proxy is down — 407 CONNECT since ~17:20Z 2026-10-07
- **Evidence:** second forced P1 (run 37660486297) died at its FIRST scrape: `curl: (7) CONNECT tunnel failed, response
  407` on all 3 attempts (teams); probe at 18:10Z: same; injury-report preflight at 18:14Z: proxy 407, direct OK. The
  first forced P1 (17:05–17:32Z) and the P2B recovery (17:06Z) still used the proxy fine; the Betr harvest at 17:24Z was
  the first casualty (`NO BOARD`).
- **Blast radius:** every stats.nba.com scraper (P1 static, P2A delta, P2B rosters/season tables) uses the proxy with
  no direct fallback (direct runner IPs were tarpitted on 2026-08-31 — documented); the PrizePicks producer (`main.py`,
  MLB code) REFUSES to fetch when its proxy preflight fails (by design, never overwrites the board file); Underdog,
  Sleeper and Fliff fall back to direct. Until the proxy answers: P1 cannot complete, tomorrow's P2A/P2B mining fails,
  P3's PrizePicks capture fails. Likely cause: ProxyScrape account quota/credential (three heavy P1 runs today).
- **Owner action requested** (message sent 11:1x PT; again 12:08 PT): check the provider dashboard, update the
  `PROXY_URL` secret.
- **Mitigation shipped:** injury-report scraper now preflights the proxy on a known PDF and falls back to a direct
  session (verified from a runner: proxy 407 → direct OK, snapshot found) — the binding availability input no longer
  goes silently to 0 rows when the proxy is down. Commit 8ac8800.

### A-4 ⚪ Sequence and timing rules (verified against code and the plan table)
- Plan: P3 = min(13:15 PT, first tip − 30) + 1 min; P2B = min(08:05, P3 − 110); P2A = min(03:30, P2B − 60); P2B only
  after P2A finished or at its latest start; P3 only after P2B finished or at its deadline, never after the first tip;
  CLOSE capture once in [tip − 25, tip). Opening night 10-20 (first tip 16:30 PT): P2A 03:30, P2B 08:05, P3 13:16,
  P3 deadline 16:00, close 16:05 — recomputed offline from the deployed functions. ⚪
- A finished-but-failed predecessor does not block (documented design; P3 must still capture the board; its freshness gate
  refuses a pick without today's scores). ⚪ — the gate itself is checked in Pass E.
- Run-once claim: atomic INSERT … ON CONFLICT; `force=true` re-claims with a note. ⚪
- Retired `nba-p2-overnight-heavy.yml` has a single "Refuse" step. ⚪

### Open in this pass
- The scheduler comment still says P2B starts "only after P2A succeeded"; the code (correctly) proceeds after any FINISHED
  P2A. Wording only — fixed in the v2.2.0 header on the next edit of that file.

---

## PASS B — data mining (2026-10-07, in progress)

### B-1 🟢 D1 referee capture never worked (COMPASS fact 87 said "unverified until the season starts")
- **Evidence:** `nba_ref.referee_assignments` 0 rows. Bridge fetch of the API with the scraper's `date=MM/DD/YYYY` →
  HTTP 200, `{"nba":{"Table":{"rows":[]}}}` for EVERY date incl. 2026-10-06, whose crews the site page displays.
  The site's own `nba-official.min.js` posts the `<input type=date>` value (ISO) and renders `a.nba.Table.rows[]`
  (`away_team`, `home_team`, `official1..4`, `official{i}_JNum`). Two defects: (1) the date format — the ISO form
  returns the rows; (2) `parse()` looked for `nba.games` / `nba.officials` and returned [] on the real payload.
- **Consequence had it stayed:** on every regular-season game day P2B's crew poll would have found 0 crews and slept
  until `ref_deadline` (= P3 − 85 min; ~11:50 PT on a normal day) before building the ladder — a ~3.5 h stall every
  day — then fallen back to the D1 fallback model; the assignment archive would have stayed empty all season.
- **Fix:** ISO date first (old form + rendered page as fallbacks); parser reads `nba.Table.rows` with `official1..4`
  (4 = alternate), stores `game_id` and `official_code` (new columns). Commit 2b9563f. Verified LIVE via
  `nba-referees.yml` (date 2026-10-06): 12 rows = 4 preseason games × 3 officials, names/numbers/codes exact.
- Note: the D1 factor is not in the certified baseline (fact 88); this is the capture that the parity directive
  requires and the P2B timing hazard.

### B-2 ⚪ Injury report (day-before and day-of) — source verified, preseason has no reports
- Archive pattern alive: `Injury-Report_2026-04-10_05_30PM.pdf` → HTTP 200 PDF (via the bridge). Preseason keys
  return S3 AccessDenied (= absent): the league publishes no injury reports for preseason games, so P2B/P3 "0 rows"
  since 10-03 is correct. First real test of the season = the 2026-10-19 evening report (P2B 10-20 09:00 ET cutoff).
- `nba_daily.injury_report_snapshots` max 2026-04-14 — expected (same reason). Readers: `build_availability_delta`,
  `ud_live_slip_engine.fresh_absences`.

### B-3 ⚪ Daily delta (P2A) — Regular Season only, gap audit clean
- All four stats.nba.com pulls carry `SeasonType=Regular+Season`; active season stays 2025-26 until the morning after
  the first regular-season game (`nba_season.active_stats_season`, `<=` rule). Gap audit 10-07: 1,230 completed games
  over 164 dates, 0 dates missing, thin games below the 0.5% threshold explained. The season file for 2026-27 is
  first written on 10-21 — now tolerated by the grader (A-1).

### B-4 ⚪ Live board files (10-07): PrizePicks 194 projections (all for 2026-10-20; 34 standard / 54 goblin / 106
  demon; every stat_type maps to the canonical key — `_pp_unmapped` empty); Underdog 46 legs, team markets only
  (Moneyline / Margin / Total — player props not yet posted); Sleeper 6 PRA legs; Fliff 322 (team markets + showcase).

### C-1 🟠 Partial loads: multi-table writer workers landed only their FIRST table when the HTTP reply was lost
- **Evidence:** `player_shot_quality` written 10-05 and 10-07 while `player_shot_quality_delta` / `player_shot_zone_profile`
  stayed at 2026-09-28; `player_playtype_profile` written 10-05 while `nba_team.playtype_profile` stayed at 2026-09-24.
  A direct synchronous call of the playtypes worker (bridge, reply awaited) wrote BOTH tables. The P1 load loop uses
  `curl --max-time 150`; when the client goes away the invocation ends before the later tables; `verify_static_loads`
  checked ONE table per worker and declared LANDED.
- **Fix:** verifier now checks EVERY table each worker writes (shotquality 3, playtypes 2, daily-delta 5, measure-types
  4, …) and RE-INVOKES a partially-landed worker synchronously (request kept open up to 900 s), then re-checks; only a
  worker still missing a table fails the step. WORKER_HOST passed to both verify steps. Commits 4c48ffe, 8baf0b5, 2a2a827.
- **Verify:** next P1/P2A with a lost reply must show "LANDED (repaired)" or all tables landed. → pending (proxy).

### B-5 🟠 Static tables not refreshed by any pipeline (documentation vs system)
- `nba_stats.player_career_season_totals`, `nba_stats.player_splits`, `nba_team.team_splits` last loaded 2026-09-08
  (the backfill worker's weekly mode, which COMPASS §5 lists under "Weekly static" but no pipeline calls). No
  production reader exists for any of the three (grep of nba/, nba/baseline, nba/backtest) → harmless. → Pass H:
  COMPASS §5 to say so explicitly (ingredients, unscheduled, unread). ✅ done 2026-10-07 (COMPASS §5 rewritten).

---

## PASS D — calculations (started 2026-10-07; continues)

### D-1 ⚪ Final-engine calibration re-measured from stored data (both seasons, points/rebounds/assists/threes)
- Deciles of `final_hp` vs box-score hit over ALL board-scoped rows: Overs within 0–2.5 pts in every decile with
  n ≥ 500; Unders 3–4 pts off at deciles 4, 8, 9 in 2025-26 — and `baseline_hp` looked BETTER than `final_hp` there
  (Brier Under .14952 vs .14863). Investigated before concluding anything.
- **Resolution (not a defect):** the as-of calibration cells are fitted on legs that HAVE a graded outcome for that
  side, i.e. legs whose side was actually OFFERED on a board. PrizePicks goblin/demon rows exist as Over only, so an
  Under at a demon line is never offered and never graded; the un-offered Unders (≈ 78 % of the (0.85, 1.0] Under
  band in Oct–Nov 2025) are calibrated by the raw baseline (0.909 → 0.914), while the OFFERED Unders in the same band
  hit 0.795 against 0.888 predicted — the market offers an Under up there only when it disagrees with the model
  (adverse selection), which is exactly what the shift (−0.74 logits, n 3,937) learns. On offered legs — the only
  population selection can pick from — `final_hp` beats `baseline_hp` on BOTH sides (points 2026-01/02: Under Brier
  .22152 vs .22249, log-loss .6341 vs .6374; Over .19092 vs .19119). The layer does its job; the earlier decile view
  mixed in legs no app sells.
- Residual (information): offered points Unders Jan–Feb hit 0.5204 vs 0.530 predicted (~1 pt optimistic).

---

## PASS F — slip system (2026-10-07; the strategy-doc §31s recertification is its starting point: certify 66/0, EDGE_DELTA −0.0916)

Method: an independent audit (fresh reader, code + §27–§31 of the strategy doc) listed 10 candidate findings; each was
verified by me against the code, the documentation and the data before anything was changed. Findings that did not
survive verification are recorded as ⚪ with the reason.

### F-1 🟢 Live grading pruned void legs BEFORE the payout engine (voids paid like a smaller original slip)
- **Evidence:** `live_slip_engine.grade` built `graded_legs` without voids and called `ENG.grade(graded_legs, structure)`;
  a 3-Flex with one void therefore paid the 2-pick Flex table, and a slip with a single survivor was refunded. PrizePicks
  (PP_PAYOUT_FINDINGS, 79/79 verified): a slip reverts to the r-pick table for the r legs LEFT, Flex r=2 → 3× Power-style,
  r=1 → 1.5×(×factor) on a hit; refund only when nothing is left.
- **Fix:** grade passes every leg with `hit=None` for voids: `ENG.grade([dict(l, hit=h) ...], structure)` (commit d5903bf);
  `build_slip_engine.grade` single-survivor rule → `compress(1.5 × factor)` on a hit for ANY original size (commit bccb631,
  hand-tested 10 cases); `certify_slip_system.py` L11 recompute carries the same rule (commits 7c4a3fb, 1885c7c).
- **Verify:** `nba-certify-slip-system.yml` run 37668298873 on the rebuilt tables: **66 checks, 0 FAIL**, incl.
  `L11.payout_equals_compression_recompute: 0` (tie-aware; 7,434 tied-leg slips). Effect of the rule on the backtest (SQL on
  `slip_engine_slips`): 1,120 single-survivor slips of 478,900 (0.23%), total payout 977.8 units vs the 1,120 refunds assumed
  before — the old assumption was 142 units (0.03% of stake) optimistic; portfolio ROI unchanged to the decimal (see F-9).

### F-2 🟢 Pass-70 points-Under cap (≥ 23.5) applied to EVERY strategy instead of D_points_3power
- **Evidence:** `leg_allowed` returned False for any points Under ≥ 23.5 (global); §31 scoped the cap to the 3-Power points
  strategy. Fix: `MAX_LINE_BY_STRATEGY = {'D_points_3power': ('points','Under',22.5)}` applied in `pick` per strategy;
  global rule removed (commits 472d4f4, 253838e, a4b18a6). Verified by reading the final code path.

### F-3 🟢 Week-2 play (§29l) staked EVERY strategy at cap 1 instead of families A and C
- Fix: `shadow` adds `(week2 and not name.startswith(('A_','C_')))`; `use_cap` unchanged for A/C (commit b7405c3).

### F-4 🟠 Red was not sticky through the week-2 / final-7 windows, nor when P5 set it
- **Evidence:** the only stickiness was `elif prev_state == 'red' and 'REQUAL' not in ph` placed AFTER the `H6`/`W2`
  branches, so a red entering the window became `off`/`week2` and the next day evaluated fresh; a red written by P5
  carries `REQUAL: FAIL…`, so `'REQUAL' not in ph` was False and one yellow day moved it to `yellow` at half cap.
- **Fix:** `RED_STICKY` flag in the hurdles, set on every red evaluation, released ONLY by a `REQUAL` starting with PASS
  (an old PASS text is dropped when a new red is set); sticky red evaluated FIRST. Also H5 opening window: two yellows in
  the first 21 days stay `yellow` (half cap) instead of red, matching H4's 21-day rule (commits 72b0091, 45ae9ca).
  Offline decision table 9/9 OK.
- **Verify:** first P2A hurdle evaluation of the season with a red (or forced via LS_DATE on a scratch state). → pending.

### F-5 🟢 Board guard unit (audit #9) — floor measured in unique half-point legs, guard counted rank-key rows / 3
- §31j: "smallest validated board in the live loader's own unit (UNIQUE scored legs per slate)" = 179, measured before
  whole-number legs joined the board (§31s). Whole-number legs can carry < 3 rank-key rows (missing currency map), and
  were never in the baseline. Fix: `n_board = unique (player, prop, tier, side, line) over half-point legs` (commit 0103fd5).
  Underdog's guard already counted unique legs (`UDL_MIN_BOARD` 178) — no change.

### F-6 🟠 Underdog edge monitor keyed its season on a 250-day window (audit #7) — read the PREVIOUS season's start
- **Evidence (data):** `min(game_date) … > day − 250` on the calendar for 2026-10-25 → **2026-02-19** (true start
  2026-10-20); it would stay wrong until ~2026-12-19, then jump — re-keying `nba_score.ud_edge_monitor` (season_start,look)
  and forgetting any recorded CONFIRMED/ALARM. No damage yet: `ud_live_slips` is empty, monitor table empty.
- **Fix:** `ud_live_slip_engine` imports the PrizePicks engine's `regular_season_window` (season block split at the summer
  gap; verified on the live calendar: 2026-10-25 → 2026-10-20; a preseason day → "no regular season in progress")
  (commits 2375c1b, 294c056). Import tested offline (no side effects, no cycle).
- **Verify:** next P2A log line "Underdog edge monitor - no regular season in progress" until 10-21. → pending.

### F-7 🟢 Underdog engine clock was a fixed UTC−8 (audit #10) — one hour off March–November
- P2A's 03:30 PT run was safe (same date either way) but a recovery run before 01:00 PDT would have graded a day late and
  evaluated the edge two days back. Fix: `dt.datetime.now(PT)` (ZoneInfo America/Los_Angeles, the PP engine's clock) in
  edge and grade modes (commits c00a9c5, a4ef0a1). Offline: PT 11:41 −07:00 vs fixed-offset 10:41 −08:00 at the same instant.

### F-8 ⚪ Paper gate `built >= cap × PAPER_DAYS` vs "1,000 paper slips" (audit #8) — NOT a defect
- The 1,000-slip wording is §28f (first version); §31 (line 1815) supersedes it: "the paper gate asked every strategy for
  1,000 slips, which for a cap-1 strategy is ~1,000 days. Now cap × 50 slips over ≥ 50 slate days". Code matches the
  current rule. Cosmetic: `PAPER_SLIPS = 1000` constant is unused (left; harmless).

### F-9 🟢 Full re-run of the certification chain on the fixed engine (2026-10-07 18:28–18:55Z)
- Rebuild main (run 37667160039): 1,059,944 candidate legs / 323 days, **478,900 slips** (= §31s count); steals-free
  (`_nosteals`, run 37667179916): 475,434 slips. Certify (37668298873): 66 / 0 FAIL. Validation main (37669908148): 186
  strategies, **17 real survivors vs V3 null 0.00 (95th pct 0)**; no-steals (37669920599): **13 vs 0** — identical to §31s.
  Break-even cross-check (37669931568): 6,196 slips, ROI +78.4% / +94.9% / **+86.8%**, pooled thinning **−9.16 pp**,
  independence −9.37 (gap 0.21) — `EDGE_DELTA −0.0916` stands. Calibrate (37669944698): 12 strategies + anchor recomputed.
  Edge-monitor validate (37669955695): 2024-25 CONFIRMED at look 120 (z +3.87), 2025-26 at look 60 (z +4.22) — unchanged.
  Integration test (37669968209): **ALL PASS**. P5 not re-run (weekly, already official this week; its inputs — survivors,
  OOS ROI, CI — are unchanged to the decimal, so the verdicts cannot differ).
- ⚪ `archive_live_boards.py:387` runner-clock `gd` is only the fallback for legs with no tip time; every leg's `game_date`
  is the ET date of its tip, and the 'close'/'routine' split uses `today_et` — correct.
- ⚪ Certified constants in code (`EDGE_DELTA`, confirm/alarm z, `MIN_BOARD_LEGS`, `PAPER_DAYS`, hurdle thresholds) vs the
  "tunables in the DB" rule: these are CERTIFICATION OUTPUTS (changed only by a recertification, each change documented in
  §31 with its derivation), not operating tunables — nothing in production tunes them. `nba_config.system_settings` holds
  only worker defaults. Recorded as a conscious reading of the rule; no override path added (a silent DB override would be
  a new way for the monitored value to drift from the certified one).

---

## PASS G — reliability & caveats (2026-10-07)

### G-1 🟠 Failures of continue-on-error steps were invisible (P2A ×4, P2B ×5, P3 ×1)
- **Evidence:** whole-number re-price, PP edge monitor, Underdog grade / edge monitor (P2A); roster refresh / apply, name
  map, morning board snapshot, whole-number pricing (P2B); Underdog pick (P3) — all `continue-on-error: true`; a failure
  left the run green and `nba_control.pipeline_runs.status = success` with no trace.
- **Fix:** each soft step has an id; a `Collect soft-step failures` step (`if: always()`) lists the failed ones → job output
  `soft_failed` → finish job env `SOFT_FAILED` → `pipeline_claim.py` appends `[soft-failed steps: …]` to the row's `note`
  and emits a run `::warning::`. Commits 7d08317 … 1a79541. YAML parsed locally; step ids verified.
- **Verify:** next P2A/P2B/P3 rows carry the note only when something soft fails; a clean run prints "no soft-step failures".

### G-2 🟠 Weekly static scrape ran TWICE every Monday, and P1 loaded files it never scraped
- **Evidence:** legacy `nba-scrape.yml` (cron Mon 09:00 UTC, GitHub's own scheduler) re-scraped 12 of P1's stats.nba.com
  sources through the metered proxy and committed the same JSON with the conflict-prone push loop; P1 invokes the
  `nba-static-lineups` and `nba-static-tracking-detail` writers but scraped NEITHER file — they came only from nba-scrape.
  Data: `nba_lineup_profile_meta.json` / `nba_tracking_detail_current_meta.json` last written 2026-09-28 18:24Z (nba-scrape
  ran ~8 h late that Monday and NOT AT ALL on 10-05); P1 2026-10-07 therefore loaded 09-28 lineups/tracking-detail and
  the verifier called them LANDED (`updated_at` moves on every upsert).
- **Fix:** P1 step "Lineups and tracking detail" (4 + 8 calls) placed before the commit/load (commit 304796f); nba-scrape.yml
  cron retired, manual dispatch / trigger-file kept (849403c). `nba-referees.yml` daily cron retired for the same reason
  (P2B owns the polled capture; the cron also ran at 07:30 PT in winter) (9732342).
- ⚪ `nba_team.lineup_profile`, `nba_stats.player_tracking_detail`, player/team splits, career totals: NO production reader
  (no Python, no SQL function, no view — checked `pg_proc`, `pg_views`, `pg_matviews`, repo). Inventory tables, loaded
  weekly; same class as B-5. → COMPASS §5 note (pass H) ✅.
- **Verify:** next P1 (needs the proxy): both metas carry the run's `fetched_at`.

### G-3 🟠 Twelve P1 scrapers wrote their data file BEFORE checking for failure (empty file → committed → loaded)
- **Evidence:** teams, players, arenas, officials, player bio, team stats, on/off (>3 team errors), playtypes (per level),
  player tracking, shot quality (3 files), lineups, tracking detail — each wrote `{"x": []}` (or a partial set) and only then
  exited 1; P1's commit and load steps run on `always()`, so the empty file replaced the good one in the repo and reached
  the writer worker. The DARKO 10-05 incident (A-3) was exactly this; it was fixed there alone.
- **Fix:** every one writes its data file only on a clean (or accepted-partial) scrape; the meta always records the error;
  exit code 1 unchanged. Commits f80243f, c84ba69, 7799ff1, e2cbb18, 49ab7b2, 8a506df, fd64d73, c0dded6, 9dded92, c7452cd,
  7bb6eb3, d0e1923, 4861fd7, 6b0de28. All parse. Behaviour on a failed scrape is now: red step, previous file kept, the
  load re-lands last week's data (visible as a red P1, not as an empty table).
- **Verify:** next P1 with the proxy down should leave every data file untouched (git diff of nba/data on the run).

### G-4 🟠 Betr cloud harvester accepted the lobby's projection-less answer as "the board"
- **Evidence:** `boards/betr_nba_current_meta.json` 10-07 17:17Z: `ok:true, events 163, legs 0`; WNBA 10-06: `events 117, legs 0`.
  163 upcoming events is every sport's lobby, not an NBA board (Betr's MLB board, captured by the token path, has 5 events
  and 1,684 legs). `betr_harvest_cloud.py` took the FIRST graphql response carrying `getUpcomingEventsV2`; the lobby
  answers that query without players/projections and wins the race.
- **Fix:** a response is the board only if it flattens to legs; a projection-less answer is kept as `lobby_only` evidence,
  the league tab is re-nudged and the watch continues (deadline 60 → 120 s); still no board → exit 3 with the lobby's
  event count and leagues, previous board file untouched (the commit step does not run). Commits 76d97c6 … e5c6d75; parses.
- **Verify:** first harvest after the proxy returns (`betr-cloud-harvest.yml`, `league=WNBA` while WNBA games exist; NBA
  from 10-20) must report legs > 0 or a red run naming the reason. Betr token path (MLB file, `token_expires_at` 10-10) is
  MLB code — not touched (owner rule).

### G-5 ⚪ `nba_score.ud_slip_engine_*` research tables — 34 tables, 5.3 GB; kept
- Readers: production reads `_dlt_orig2` (UD edge reference, `ud_live_slip_engine`), research/validation read
  `_dlt_recert2`, `_center` (bankroll sim, drought analysis, `nba-ud-validate-strategies.yml` default). The other 28 are
  the §30 experiments (minrise/minfall, hotform, center variants, under3, nv48, fresh…). Not dropped: their inputs
  (tier maps) have since been recertified, so they are NOT reproducible bit-for-bit, and §30's conclusions cite them.
  Owner decision if storage matters; the drop list is this paragraph.

### G-6 ⚪ Proxy re-test 19:06Z (`nba/probe_proxy_health.py` via `nba-probe.yml`, run 37671828191)
- proxy → stats.nba.com **407**, proxy → api.prizepicks.com **407**; direct → api.prizepicks.com **403** (datacenter IPs
  refused); direct → darko.app 200. Owner notified again (12:08 PT): today's P3 PrizePicks capture and the forced P1
  wait on the proxy account.

---

## PASS E — board scoring (2026-10-07)

### E-1 ⚪ Scored-board integrity, last 31 regular-season days (2026-03-13 → 04-12, 12 apps, 1.35 M legs)
- `board_scored`: 0 NULL `final_hp`, 0 NULL `score`, 0 out-of-range probabilities on every app; props 4–12 per app;
  both sides present. `kind` is NULL for every row (tiers live in the PrizePicks tiers table, not here — by design).
- Over + Under at the same half-point line sum to **1.010 on average (0.918 … 1.091)**, not 1.000: the as-of calibration
  shifts each SIDE's cell on its own offered population (D-1), so the two sides are not constrained to complement. This is
  the documented adverse-selection correction, not a scoring bug; the sum's spread is the size of that correction.
- No board has been scored since 04-12: P3's scoring step is conditional on regular-season games (preseason boards are
  archived only). The 2026-10-20 dress rehearsal (`nba-sim-slate.yml`, dispatched 19:10Z on the fixed engine) is the live
  check of scoring → pick on a real future board. → pending.

### Open in this pass
- Proxy 407 (A-7) — owner action.
- Sim-slate 2026-10-20 result (E-1).

---

## PASS H — documentation alignment (2026-10-07)
- COMPASS fact 87 (referee capture verified; P2B owns it), §5 "Weekly static" (P1 is the path; inventory tables without
  readers), fact 135 (this program's index and decisions). Strategy doc §31t (slip-system + reliability decisions and the
  re-certification figures). This ledger committed to the repo.
