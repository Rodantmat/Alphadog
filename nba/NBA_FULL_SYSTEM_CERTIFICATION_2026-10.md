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
  CLOSE capture once in [tip − 25, tip). **Corrected in round 2 (P2A#18a):** opening night 10-20's first tip is BOS@DET
  at **19:00Z = 12:00 PT (3:00 PM ET, NBC/Peacock — confirmed online and in `nba_calendar.games` 0022600001)**, not
  16:30 PT as first written here. Plan: P2A 03:30, P2B 08:05 (P3 − 110 = 09:41 is later), P3 11:31, P3 deadline 11:30,
  close 11:35 — the P2B build (≤ 45 min for a 3-game slate, E-4) finishes well before. ⚪
- A finished-but-failed predecessor does not block (documented design; P3 must still capture the board; its freshness gate
  refuses a pick without today's scores). ⚪ — the gate itself is checked in Pass E.
- Run-once claim: atomic INSERT … ON CONFLICT; `force=true` re-claims with a note. ⚪
- Retired `nba-p2-overnight-heavy.yml` has a single "Refuse" step. ⚪

### Open in this pass
- ⚪ The scheduler header already reads "P2B starts only after P2A has FINISHED (or at the latest start that still beats
  P3)" — the wording matches the code (checked 2026-10-07 21:35Z); nothing to change.
- Proxy re-probed 21:30Z (run 37689829764): still 407. Everything that waits on it: forced P1 (DARKO / lineups /
  tracking detail / P5 chain), tomorrow's P2A delta mining, P2B rosters, P3 PrizePicks capture, Betr harvest proof.

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

### G-7 🟠 One dead app blocked the whole P3 slate (seen live: P3 2026-10-07 13:16 PT, run 37680784330)
- **Evidence:** the PrizePicks capture failed (proxy 407, main.py refuses by design) and EVERY later step was skipped —
  other boards, archive, scoring, the pick, the Underdog pick. Symmetrically, "Other board scrapers" exits 1 when ANY of
  Sleeper/Underdog/Fliff times out, which would have skipped the archive of a PrizePicks board that HAD landed — on a
  pipeline whose own comment promises "one dead app never blocks the slate". (The soft collector itself worked on this
  run: "no soft-step failures" — skipped ≠ failure.)
- **Fix:** both capture steps `continue-on-error` with ids; the other-boards step publishes the list of boards it did
  capture; the archive step archives as 'window' ONLY the boards this run captured (+ betr, whose file comes from its
  own harvest and is date-relabelled) — a same-day MORNING file must never become the decision snapshot (the certifier's
  6 h freshness rule would have accepted a 5 h-old morning board); `skip_scrape=true` keeps the full list; the Underdog
  pick runs `if: !cancelled()`; both captures join the soft list. The PrizePicks pick's own freshness gate still refuses
  loudly without today's window board (step red → run failure → row note names `prizepicks-board`). Commits f14348c …
  eddbb26; YAML parsed, remote blob = local.
- **Verify:** next P3 on a game day; a proxy-down day should now still archive Underdog/Sleeper/Fliff and run the
  Underdog pick, with the run red on the PrizePicks pick.

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

### E-2 🟢 The slate simulation broke with §31s, and its sandbox let one production write through
- **Evidence:** run 37672380196 (first sim since §31s): the sandboxed `final_hp` builder copy died on
  `relation "nba_score._sim_final_hp_derived" does not exist` — the builder now also writes `final_hp_derived`
  (beyond-depth routing, §31s), the sed redirect turned the INSERT's table name into a scratch table nobody created, and
  the `DELETE FROM nba_score.final_hp_derived … game_date=<slate>` kept its PRODUCTION name (the DELETE rule needed a
  trailing space; the production-write grep used `\b` after `final_hp`, which `_derived` defeats). Production rows for
  2026-10-20 in `final_hp_derived`: 0 before and after — nothing was lost, but the sandbox's "no production write"
  guarantee had a hole.
- **Fix:** guard step refuses if production `final_hp_derived` holds the slate and creates `_sim_final_hp_derived`;
  every `final_hp_derived` reference is redirected first; the write-grep covers `final_hp_derived`; the always-run last
  step drops the scratch copy and verifies production `final_hp_derived` = 0 too. Offline dry-run of the sed chain: 0
  production writes left (only the designed confidence-history READ and the advisory-lock name). Commits 2199001 …
  de65965. Sim re-dispatched 20:06Z.
- Note: whole-number legs are not part of the simulation (the live loader is replaced by the sandbox legs; `factor` = 1).

### E-3 ⚪ Board archive sanity (10-07 19:22Z manual `nba-board-archive.yml`): PrizePicks 228 legs (34 standard × 2 sides
  + 54 goblin + 106 demon, all for 2026-10-20), Underdog 298, Sleeper 105, Fliff 0 (team markets only). `snapshot_ts` is
  the BOARD's own time (`board_time`), `fetched_at` the capture — a reader grouping by `snapshot_ts` sees posting dates,
  not capture dates (noted so nobody re-derives the "nothing archived since 10-05" false alarm I nearly recorded).

### Gemini insight round (reference only, gemini-2.5-pro, 19:25Z) on the nine decisions of passes F/G
- Taken: (2) a sticky red needs a documented manual release path → `UPDATE nba_score.live_strategy_state SET hurdles =
  hurdles - 'RED_STICKY'` + state is the owner's override; recorded in §31t. (9) a one-projection board passes the
  harvester's check → the meta records `legs`, the P3 certifier judges size; acceptable. (6) stale reload on a failed P1 →
  the run is red and the data is what was already loaded; acceptable, documented.
- Rejected with evidence: (3) "179 excludes whole-number legs, mismatch" — the floor was measured on the half-point
  board, so the unit now matches; (4) "<60-day gaps misidentify seasons" — the NBA summer gap has never been under 90
  days; (5) "green runs mask failures" — the monitors were designed never to block the grade (§31l); the row note +
  warning is the visibility that was missing; (7) code constants — owner-level rule reading, recorded in F-9.

### E-4 🟢 Dress rehearsal 2026-10-20 on the fixed engine (run 37683583206, 20:38–21:22Z, SUCCESS)
- Sandbox model built for the slate; the second attempt (run 37679085578) died on the scratch `final_hp_derived` lacking
  the unique index the builder's ON CONFLICT needs → `LIKE … INCLUDING ALL` (f9b4cb7); third run clean. E-2 → 🟢.
- `SIMULATION 2026-10-20: 162 scored PrizePicks legs (51 unscored = beyond-depth rungs routed to final_hp_derived, which
  selection never reads; 0 team/event unresolved) | 6 players`. Legs passing certified cells: Brunson assists D1,
  Wembanyama rebounds D3 / threes D1, Cunningham threes D1, … ; no passing leg in steals/turnovers/stocks/blocks/rebounds R.
- The REAL `pick()`: **"board of 162 scored legs is below the smallest validated board (179) — strategies out of domain,
  NOTHING PLACED (§31j)"** — the domain guard (now counting unique half-point legs, F-5) does exactly what §31j/§31i
  concluded about the spotlight board; 0 slips; rolled back; PRODUCTION AFTER: baseline_history 0, final_hp 0,
  final_hp_derived 0, live_slips 0. On game day the full board (hundreds of legs) is inside the domain.

### A-8 🟠 Proxy provider replaced and the proxy URL moved into the credential store (2026-10-07 22:00 → 22:30 PT)
- **Decision (owner):** ProxyScrape quoted $90.53 for 25 GB (~$3.62/GB at that tier; the $1.05/GB headline is a
  volume rate). Research (webscraping.ai comparison, provider pricing pages): DataImpulse $1.00/GB, $5 minimum, no
  expiry, user:pass gateway `gw.dataimpulse.com:823`, free US targeting, sticky sessions; Evomi $0.99/GB with a 15 GB
  minimum; the premium tier ($4–7/GB) is unnecessary. Owner bought a 5 GB DataImpulse trial.
- **Storage:** the URL lives in `nba_config.external_credentials` (`credential_key = 'proxy_url'`) — the system's
  credential store by the owner's own rule (API keys live there). It is US-targeted in the username (`login__cr.us`).
  Not written to memory or docs.
- **Measured from a runner (probe 37731561015 / 37731969391):** exits are US residential (AT&T, Cablevision, …);
  **stats.nba.com leaguestandingsv3 → 200** on the first attempt (ProxyScrape: 407; direct: tarpit); **PrizePicks
  partner-api → 200, 217 KB** (the endpoint main.py uses); api.prizepicks.com → DataDome captcha through the proxy AND
  direct (main.py already probes four endpoints and takes the partner API). Without US targeting the pool failed both
  (stats.nba.com timeout, PrizePicks 403) — the `__cr.us` suffix is load-bearing.
- **Wiring:** nine workflows (P1, P2A, P2B, P3, Betr harvest, close capture, probe, referees, injury report) gained a
  "Resolve proxy (credential store first, secret as fallback)" step — `psql` reads the row, masks it, exports
  `PROXY_URL` via `$GITHUB_ENV`; every proxy step reads `${{ env.PROXY_URL || secrets.PROXY_URL }}`. The GitHub secret
  (which the bridge cannot set) is now only the fallback. MLB workflows untouched (owner rule) — they still read the
  secret, i.e. ProxyScrape, until the owner updates it. `betr_harvest_cloud.py` builds the sticky-US username per
  provider (`login__cr.us;sessid.<id>` for DataImpulse; verified against proxy.py's URL parser).
- **Verify:** forced P1 run 37732636094 dispatched 22:29 PT through DataImpulse — still scraping at 14 min (the
  proxy-down run died at 2 min). → pending: P1 green (A-3/A-5/C-1/G-2/G-3 land with it), P2A 03:30 PT, P3, Betr WNBA.
- Residual: traffic budget. 5 GB ≈ one month at the measured mix; the Betr headless-Chrome harvest is the heaviest
  consumer and is the first thing to trim (block images/fonts through the local forward proxy).

### Open in this pass
- A-7 superseded by A-8 (new provider); watch the DataImpulse traffic meter.

---

## PASS H — documentation alignment (2026-10-07)
- COMPASS fact 87 (referee capture verified; P2B owns it), §5 "Weekly static" (P1 is the path; inventory tables without
  readers), fact 135 (this program's index and decisions). Strategy doc §31t (slip-system + reliability decisions and the
  re-certification figures). This ledger committed to the repo.

---

## ROUND 2 — independent re-audit of every pipeline, all findings verified and fixed (2026-10-07 23:00 → 2026-10-08 01:10 PT)

**Method.** After Pass H, three independent read-only audits (P2A results, P2B slate, P3 afternoon; a fourth on the two
live engines) re-read every workflow, script and DB object end to end without the ledger's conclusions, and returned 56
findings. Each one was then verified against code AND data by this program (measured where a number could be measured),
fixed through the bridge, parse/YAML-checked, and where a behaviour changed, exercised on a runner (probe runs) or the
database. Decisions that changed the system's behaviour went to COMPASS (fact 135) and strategy §31t. Nothing below is
asserted from the audit alone. Items the audits marked INFO are included when they changed something.

### R2-P2A — results pipeline
- **#1 🟢 gap audit never audited the schedule** (`check_delta_gaps.py` read keys the schedule file does not have → always the
  team-log fallback, i.e. the scrape audited itself; B-3's "1,230 games" was that fallback). Reads `sched["games"]`,
  `game_status == 3`, regular-season ids (002), tricode keys; local file first.
- **#2 🟢 daily-delta scraper never exited non-zero** → `sys.exit(1)` when any of the 8 pulls fails; a dead night is red before
  the loads (and the sync/loaders never see a stale file as fresh).
- **#3 🟢 PrizePicks slip grade had no catch-up** (only yesterday; a red P2A orphaned the slate for good) → grade mode without
  `LS_DATE` loops every ungraded slate `< today`, oldest first (a4dc540).
- **#4 🟢 Underdog grade voided every leg on an empty box score and marked the slate graded** → empty stats: skip, leave
  `graded_at` NULL (b3f7100).
- **#5 🟢 P5 PASS released a sticky red from frozen 2024-25→2025-26 data** → a PASS releases a red only when the LIVE season's
  own walk-forward lower bound (`boot_lo` over the current season's backtest slips from Nov 1, ≥ 40 days) > 0; else
  `REQUAL 'HOLD <date>'` (a708df8); reads the configured backtest (20522a5).
- **#6 🟢 prune then re-price lost whole-number prices** — measured 2026-03-15: 205 whole-number keys, 190 priced, 14 missing
  the k+0.5 Over rung / 10 the k−0.5 Under (pruned because on no board). `refresh_board_rung_keys` now keeps those
  neighbours (src `wn_neighbor`; DB + `nba/sql/refresh_board_rung_keys.sql`, a24b454); `build_final_hp` prices a
  neighbour-only rung into `final_hp_derived` ('wn_neighbor'), never `final_hp` (b658ab1…c148b9a); `build_whole_number_hp`
  prices from them with derivation **`whole_number_nb`** — priced (fact 134) but NOT selectable (the live engine reads
  `'whole_number'` only) until that class has a backtest of its own (b6ff85c…6498114). History untouched.
- **#7 🟢 replay `asof` was claimed but not acted on** (prune / final_hp / whole-number used the runner's yesterday; grader
  and slip grades had no date) → resolve step emits `yday`; every dated step uses it; `GRADE_END` / `LS_DATE` / `UDL_DATE`
  set only when `asof` is given (b5a177e…a7a1292).
- **#8 🟢 season-file sync** refuses a delta file whose own `season` differs from the meta (rollover contamination) (7066e90).
- **#9 🟢 scheduler** let P2B dispatch in the tick that recovered a dead P2A → a recovered predecessor stays `claimed` for its
  successors (bounded by `p2b_latest` / `p3_deadline`); v2.2.1 (ce3bbb3, 3564634).
- **#10 🟢 `calibrate` divided by zero** before its empty-data guard → guard first (409d849).
- **#11 🟢 P4 `reset` wiped the ledger with no confirmation** → `LS_RESET_CONFIRM=RESET` (P4 input `confirm`) and refused once
  the regular season holds live slips (`force_reset=1` overrides, deliberately) (5ee1911, 249a71a, ff40aaf). **Launch
  checklist: run P4 `mode=reset confirm=RESET` once before 10-20's first pick.**
- **#12 🟢 hurdle hysteresis counted a re-evaluated slate twice** → `CLEAN_LAST` = one count per slate (6776961).
- **#13 🟢 matchup shards** (incremental, self-healing) are a soft step (da266a8, 769eb61).
- **#14 🟢 schedule scraper** writes only on success; a season the file already holds coming back empty is a failure (ead72d3).
- **#15 🟢 grader** writes `dnp` only when the player's team has a box score that day, else `game_not_found` (COMPASS 60)
  (f2f301c, c775b67, 17cf03e).
- **#16 🟢 ONE SLATE PREDICATE.** The label regex let the **NBA Cup Final** through (id prefix 006, label 'Emirates NBA Cup';
  2025-12-16 in the certified history: 0 baseline rows, 1,412 PrizePicks legs, 0 slips — i.e. not a slate), while P3, P4
  and the prune used `<> 'Preseason'` (play-in / playoff / All-Star days through). Now the view
  **`nba_calendar.regular_season_games`** (`game_id LIKE '002%'`; `nba/sql/regular_season_games.sql`, b9382d0) is read by
  the scheduler, P2B, P3, P4, certify, prune, both live engines and the freshness check (8c0dcc0…50802c1); the season
  rollover guard keys on the id prefix in any pre-opener month (65d1ff1).
- **#17 🟢 docstring drift** in `live_slip_engine.py` → the hurdles as implemented (5cd61d2, 733228e). §29a's old wording is
  the doc chat's; noted in §31t.
- **#18 data confirms:** (a) opening-night tip **19:00Z = 12:00 PT = 3 PM ET** (NBC Sports Boston; A-4 corrected); (b)
  PrizePicks help center: a tie is a tie for every projection type, 3-Flex reverts to 2-Power — the code matches; (c)
  `edge_monitor_ref` built 18:51:35Z and `live_strategy_calib` 18:51:33Z, both after the §31s rebuild (18:28Z); (e) the
  grader tops up the weekly register from the daily roster file (9279fad).

### R2-P2B — slate pipeline
- **#1 🟢 final_hp priced yesterday's view of the board** (rung keys never refreshed in P2B) → refresh after the morning
  archive, before the ladder build.
- **#2 🟢 the live morning game line never reached the baseline** (event→game map only from played games; export seasons
  excluded the new season) → map via `nba_calendar.games` + `nba_ref.teams` nickname match (verified 335/335 agree with
  `event_game_map`), export seasons include `current_season()`.
- **#3 🟢 opening day modelled as a late-2025-26 game** → `nba/ensure_season_files.py` creates the empty current-season input
  files so the builders label the opener as the new season (return-ramp haircut no longer fires on opening night).
- **#4 🟢 injury names resolved through the weekly register only** — measured: 34 of the 616 rostered players (10-07) were
  not in it → the daily roster file tops up `_name_to_id` in both builders and the as-of calibration (997ca25, 8e68b33,
  ce82348).
- **#5 🟢 "morning" spread/total blended the window snapshot** (355 of 1,226 games differed, avg 0.94 pt) → morning-only
  aggregates. Caveat kept: the certified history was built on the blend; not rebuilt.
- **#6 🟢 recovery rerun died at "nothing to commit"** → abort only if the slate's ladder file is missing.
- **#7 🟢 "never fail the slate" steps were hard failures** → market line/export, blowout, injury are soft with ids.
- **#8 🟢 certify P2 vs workflow slate predicate** → one predicate (see P2A#16).
- **#9 🟢 confidence training set halved at the opener** → `stats_seasons(3)`.
- **#10 🟢 injury scrape overwrote a good file with an empty one** → `pick_session` None → exit 1, file untouched; and (P3#14)
  zero snapshots on a slate day is a failed scan (`INJURY_EXPECT`), bounded to 600 s in P2B and P3.
- **#11 🟢 new-season file set keyed on one file** → `ensure_season_files.py` creates all six.
- **#12 🟢 periods builder** has the §31r roster rule (6fbc603).
- **#13 🟢 duplicate component rungs** — measured 4,107 on the committed ladder → the merge dedupes (da9fcce).
- **#14 🟢 opening-week ghost players** — measured 54 of 420 last-3-game participants are on NO roster (107 moved teams) →
  live builds drop no-roster players; replays keep the §31r rule (135445f, e2d7342, 01d96b8, 33323c8).
- **#15 🟢 crew poll vs build time** — E-4 measured 44 min for a 3-game slate; a full slate is ~95 min + loads → build budget
  125 min (tunable `p2b_build_budget_min`), job timeout 300 (a885e45, 0cd4a17).
- **#16 🟢 fixed UTC−8 clocks** → `ZoneInfo` in certify, delta, freshness, score_board_legs, loader, prune, referees, tiers.
- **#17 🟢 morning archive** (and the close capture) archive only the apps that run captured (f7129a2, 8efa410).
- **#18 🟢** loader run row records the rows' season (82ef8c1); the dated ladder record is gzipped (~8×; 4 GB/season →
  ~0.5) and the loader reads `.json.gz` (8f24adb, 4fcc82f, 202139c); whole-number DDL only when missing (c0a6570).
  **Round-3 item, measured and deliberately NOT changed in one place:** `board_outcomes` is unique per market key
  INCLUDING `_alternate`, so a leg under both keys is counted twice by every consumer that strips the suffix (Jan 2026:
  703,306 rows = 567,380 legs, +19% n) — the confidence-v3 graded set, the conformal fit, the as-of calibration
  (`w = n/(n+K)`, K = 400: shifts ~2% smaller at the median cell, ~6% at p10) and the §31s currency maps share it
  consistently. Deduping one consumer alone would break the chain's parity, so `AC_DEDUP` exists (default off) and the
  fix is a chained recertification: dedupe everywhere → conformal → confidence v3 → as-of calibration → final_hp → tier
  maps → slips → validate.

### R2-P3 — afternoon pipeline
- **#1 🟢 Underdog / Sleeper legs were never dated by tip** (every future-slate leg landed in today's `window`) → Underdog tip
  from `leg.game_start` / `games[game_id].scheduled_at`; Sleeper tip from its public schedule endpoint
  (`api.sleeper.app/schedule/nba/{phase}/{year}`); team markets filtered; the 10-07 rows cleaned.
- **#2 🟢 Underdog scraper could not finish a regular-season slate in 300 s** (serial, sleeps, file written at the end) →
  today's matches (Eastern tip date) get the full pill sweep, other days the base call only; pills / players / ladders on
  a thread pool (`UNDERDOG_WORKERS` 4); wall-clock budget (`UNDERDOG_BUDGET_S` 240) + SIGTERM handler → a partial board is
  still written (`meta.partial`, `elapsed_s`) (0f73da8…3df2fac). Probe 37744186435 on the preseason board: 38 matches →
  6 today / 32 other, 5.2 s; all-matches sweep 1.9 s, 0 errors. In-season timing is read from `meta.elapsed_s` on 10-20.
- **#3 🟢 live pick dropped the certified `broad_day` diversification** → computed in `pick()` exactly as the backtest and
  passed to both builds (313eda8, 55cdb9b).
- **#4 🟢 THE MARKET TERM (parity gap, decided).** Live has no sportsbook feed, so every live leg carries `f_books = 0`,
  `f_agree = 0.55` — a uniform confidence deduction the certified history never had (the dead `rung_market` step pretended
  otherwise). Measured by rebuilding the whole backtest market-free (`_mf` / `_mf_nosteals`, 478,580 / 475,060 slips):
  every certified strategy stays positive in both seasons; ROI at cap, base → market-free (24-25 / 25-26):
  A_wsteals_5flex 0.853→0.686 / 1.085→0.958 · A_core_3power 0.334→0.319 / 0.810→0.784 · A_regular_5power 0.523→0.459 /
  1.205→1.089 · A_wrebounds_4flex 0.510→0.492 / 0.896→0.925 · B_demon_5flex 1.616→0.700 / 1.406→2.044 · B_demon_3flex
  0.675→0.521 / 0.621→0.901 · C_wstocks_4flex 0.335→0.241 / 0.555→0.722 · D_points_3power 0.419→0.113 / 0.325→0.364 ·
  R_stocks_4power 0.213→0.283 / −0.077→−0.077 · W_core_3power 0.136→0.165 / 0.419→0.419 · W_coredemon_3power
  −0.044→0.027 / 0.175→0.175; validator survivors 17→16 (steals pool), 13→21 (no-steals pool). **Decision (option A;
  Gemini concurred as reference):** the certified strategy set stands; everything the live engine is *measured against*
  now comes from the market-free twin — the faithful simulation of what live does. Implemented: DB function
  `nba_score.build_tier_map_legs_sel_mf()` (the certified selection rescored exactly as live, deductions read from
  `confidence_model`; verified 0 score differences on all 2,700,213 rows vs the study table; `nba/sql`, 692e259); P5 steps
  3c (rebuild + both twin engines, delta) and 5c (both twin validations); the tunable
  `nba_config.classification_config['live_backtest_suffix'] = {"suffix": "_mf"}` read by `live_slip_engine.bt_table()` for
  the hurdle calibration, the steals-anchor reference, P5's live simulation, the edge-monitor reference and P5's verdicts
  (f10beb3…e18906d, 2038da7, 5807f7f, 257b3cb, 20522a5); P4 `edge_rebuild` input (ebd1192, c55a34f). Recalibration
  dispatched (P4 `calibrate`, then `edge` + rebuild). Option B (an odds feed, ~$119/mo) remains available if the owner
  wants the market term back; blank suffix returns to the market-inclusive tables. The Underdog paper engine has the
  same gap against its own backtest (paper only) — round-3 twin.
- **#5 🟢 a forced/late run wrote post-tip picks** → `late=1` turns off delta / score / paper / certify / both picks; both
  engines refuse a post-tip pick for today on their own (`post_tip()`) (f8a663e…e041e2c, b795476, 9e1890c).
- **#6 🟢 certify P3 accepted advance rows as "archived today"** → PrizePicks `window` legs fetched by this run (3 h),
  `board_tiers_v2` window rows, `board_scored` built by this run; replay-aware (240ce92…20c2c42).
- **#7 🟢 delta's "P2 view" cutoff 04:00 ET ≠ the baseline's 09:00 ET** → derived from `nba_asof.BASELINE_CUTOFF_LOCAL` (afa427d).
- **#8 🟢 delta resolved teams from last season's log** → current roster first (abbreviations verified identical to the log
  tricodes), log second (351bd70).
- **#9 🟢 Underdog `fresh_absences` compared the −05:00-stamped `snapshot_ts` with `now()`** → compared with the real clock in
  the stamp convention (verified +1 h in EDT) (c3a376f).
- **#10 🟢 the MLB producer (`main.py`) sat on the NBA critical path** → the NBA-owned producer walks every page of the
  board (`meta.total_pages`) and carries `row_count` / `total_pages` (d9608a9, 2eb681e); equivalence probe 37744844157:
  194/194 projections, identical keys and included entities, same chosen endpoint → P3, P2B's morning pull and the close
  capture use `nba/scrape_prizepicks_nba_board.py` (`PP_NBA_MIN_FUTURE_ROWS` 50 as before) (9e1ffa9, ceb2f28, d07e466).
  `main.py` untouched.
- **#11 🟢** `BT2_DATE` = the resolved slate; Pacific clock fallback (0fdaf96, ed857c3).
- **#12 🟢 scoring every label** → once the window board exists, `routine` / `morning` legs are not scored (history held
  window + close only); `BS_LABELS` override (2ae61ca, f88d264).
- **#13 🟢 tie order** `score DESC, player, side, line` in both live loaders and the Underdog engine (821558a, 43e611a, 3b1894c).
- **#14 🟢 injury scrape** bounded and expected to find snapshots on a slate day (db5a6a5, dfed139, 8a282b6, 4961129).
- **#15 🟢 P3 commits through `nba/git_push_retry.sh`** (its comment was inverted) (492e4f2).
- **#16 🟢 SQL that lived only in the database** → `nba/sql/` holds the hand-maintained sources (`refresh_board_rung_keys`,
  `regular_season_games`, `build_tier_map_legs_sel_mf`) and `nba/dump_db_sql.py` + `nba-db-sql-dump.yml` (Monday 18:30Z and
  on demand) record every NBA function (28) and view (9) in `db_functions.sql` / `db_views.sql` (154607c, 64ebc57,
  b080b19); the hand source equals the dump.
- **#17 🟢** `score_board_legs` computes score/edge through `build_final_hp.score_and_edge` with a constants assertion (2620e72).
- **#18 🟢 Underdog team markets archived as player legs** → filtered (appearance type, stat, " @ " names).

### R2-LIVE — the two engines (fourth audit)
- **#1/#2 🟢 reverted-Flex and single-survivor grading** → voids reach `ENG.grade` (Nones preserved); one survivor pays 1.5×
  on a hit and loses on a miss, whatever the original size (PP_PAYOUT_FINDINGS 79/79).
- **#3 🟢 pass-70 points-Under exclusion applied to every strategy** (§31n had rejected it) → scoped to `D_points_3power`
  (`MAX_LINE_BY_STRATEGY`); the half-stake rule is reachable again.
- **#4 🟢 week-2 trough play staked retired / rotation-only / red strategies** → shadow unless family A/C.
- **#5 🟢 sticky red lost to `week2` / `final7`** → `RED_STICKY` evaluated first in every branch (72b0091, 45ae9ca).
- **#6 🟢 H5** two yellows cap at yellow inside the opening 21 days.
- **#7 🟢 Underdog edge monitor's season key was a sliding 250-day window** → the shared `regular_season_window` (b3f7100).
- **#9 🟢 board guard** counts unique half-point legs (0103fd5). **#10 🟢** Pacific clock (b3f7100).

### Round-2 verification runs
- Market-free builds 37741669120 / 37741678518 (478,580 / 475,060 slips); validations `_mf` / `_mf_nosteals` 07:31Z.
- Probes: Underdog timing 37744186435; PrizePicks producer equivalence 37744844157; DB SQL dump 37745394508.
- **Verified 08:15–08:22Z:** P4 `calibrate` on the twin (37748619023) → `live_strategy_calib` rebuilt 08:16:06Z for all 13
  rows (e.g. A_wsteals_5flex daily level 0.587, MC95 dd 88.7; B_demon_5flex 0.371 / 130.6); P4 `edge` + rebuild
  (37748628727) → `edge_monitor_ref` 20 cells at 08:19:17Z. `nba-integration-test` 37748644639 (2026-01-10): **ALL PASS**,
  ledgers rolled back to 0/0/0/0. `nba-pp-parity` 37748663722 (10 slates): ALIGNED_identical 120, grading disagreements
  none, **apples-to-apples differences none**. Sim-slate 2026-10-20 re-dispatched on the final code (TEST label check).
- **Sim-slate 37749440843 🔴→🟢 (the rerun found a regression of P2B#3's fix):** with the empty 2026-27 placeholder files in
  place, `pd.concat` of a frame with no columns turned `PLAYER_ID` / `TEAM_ID` into float64 (`"201935.0"`), so no roster id
  matched, the slate built 0 virtual rows and the recipe died (ZeroDivisionError). Reproduced locally in 4 s; fixed in both
  builders by dropping empty frames from every season concat (the season label is `TEST`, not the file) (e5c2538, c4f007f);
  local rebuild: 3 games, 93 virtual rows, 83 players, 2,901 points/rebounds rungs, `current_season 2026-27`. Re-dispatched.
- P1 certify after the predicate fix: probe 37750173504 → **2/2, "Pipeline certified"** (the 10-08 forced P1 had landed every
  scrape and load and failed only there). First P5 on the market-free twin dispatched (37750390757).
- **Sim-slate 37751807219 🔴→🟢 (second opening-night defect, found only once the first was fixed):** the baseline built
  (93 virtual rows) but the **periods builder crashed** — the period recipe keeps a player-game only once his
  season-partitioned `rate36` exists (ewm, min_periods 3), so on an opening slate the test set is empty and
  `pd.concat([])` raised "No objects to concatenate". P2B's components step runs it under `set -e`: **10-20 would have
  died there.** The April-based rehearsal (E-4) never saw it because the real 2025-26 rows filled the test set. Fix: an
  empty period ladder is written and the builder exits 0 (no certified cell uses period props) (843974f). Re-dispatched.
- **Sim-slate 37758983313 🟢 (opening night on the final code):** `current_season 2026-27`, 3 games, 83 players, 25,939 rungs
  over 22 props; period ladder empty by design; final_hp built in the sandbox; the real `pick()`: 148 scored PrizePicks legs
  (65 unscored = beyond-depth / neighbour-priced rungs routed to `final_hp_derived`, 0 unresolved) → board below the 179
  floor → nothing placed (§31j, the spotlight board); production untouched (0/0/0/0). The opening-night path is green.
- **P2A 2026-10-08 (scheduled, 03:31 PT, run 37763883136) 🟢 — the first results pipeline on the round-2 code:** every
  step green, **no soft-step failures**; the gap audit now audits against the SCHEDULE ("newest completed slate in schedule
  2026-04-12 / in the delta 2026-04-12 — No gaps"); 130 rung keys refreshed for 10-07, nothing to prune (no baseline on a
  preseason day), grade catch-up found nothing placed; `pipeline_runs` row `success` at 10:45:28Z (finish job).
- **P5 37750390757 🔴→🟢 (first twin build stalled):** steps 1–3b green (base chain intact); step 3c's slip engine sat
  2 h 08 in its `legs` cursor — the freshly created `tier_map_legs_sel_mf` had **no planner statistics** (CTAS does not
  analyze), so the 2.7M-row join to `prop_universe` took a hopeless plan. Cancelled by hand; the function now `ANALYZE`s the
  new table before the rename (DB + `nba/sql`, b87e732); twin tables verified unchanged (478,580 / 475,060). Re-dispatched.
- **P5 37767128033 🟢 (first full P5 on the market-free twin, 28 min end to end):** all 15 steps green; 3c rebuilt
  `tier_map_legs_sel_mf` (2,700,213 rows, analyzed) and ran both twin engines as deltas (0 new days: 478,580 / 475,060
  unchanged, high-water 2026-04-12); 5c wrote `slip_validation_mf` 11:26:04Z and `_mf_nosteals` 11:26:54Z (30 rows each);
  step 6 printed `verdicts from nba_score.slip_validation_mf / _mf_nosteals` (the `bt_suffix` switch works end to end).
  Twin verdicts vs the last base run (10-07): A_wsteals_5flex PASS +86/+47 (was +102/+60), A_core_5flex PASS +97/+53
  (was +99/+59), B_demon_5flex PASS +227/+98 (was +160/+74); B_demon_3flex dropped from PASS to NOT_IN_TOP30 (the
  market-free validator's top-30 does not contain its cell/size/structure); the other eight NOT_IN_TOP30 on both tables.
  NOT_IN_TOP30 is recorded only — no `live_strategy_state` row changed (all 12 still `paper`, caps intact, REQUAL hurdle
  unset), which is the designed behaviour (only an explicit FAIL turns a strategy red). Noted for the 10-20 launch: B_demon_3flex
  (cap 1) is a strategy the live scoring cannot reproduce in the top-30 and the §31u/COMPASS 136 review should weigh it.

### After round 2 — owner's 2026-10-08 10:07 PT directions, closed the same day
- **MLB scraper proxy:** owner rotated the GitHub secret `PROXY_URL` to the DataImpulse URL (the same value as `nba_config.external_credentials.proxy_url`);
  verified by dispatch 37814179192 🟢 — PrizePicks MLB 565 rows / 653,085 bytes through `gw.dataimpulse.com:823`. The secret is also the
  fallback of 10 NBA workflows, so the dead ProxyScrape value is gone everywhere. MLB code untouched.
- **Launch checklist — opening-day P4 reset:** the ledger was already clean (0 live slips, 0 pool rows, 0 state-history rows; every
  strategy `paper` with days/slips/net 0, `_ROTATION` normal), and the reset was executed anyway to certify the path: run 37815777318
  🟢 `RESET: 0 ledger slips removed; states: … paper/cap … _ROTATION=normal/0`. Nothing to run again before 10-20 unless a replay
  writes the ledger (the in-season refusal then protects the real season).
- **Launch checklist — DataImpulse traffic meter (research):** DataImpulse exposes no usage/balance API reachable with the proxy
  credentials (its Postman API needs a token issued against the dashboard password; docs.dataimpulse.com lists no stats endpoint).
  What exists is a per-plan rolling **Traffic Limit** (1 h / 24 h / 7 d / 30 d windows, whole GB; actions: e-mail notification,
  suspend, or both; suspension returns `USER_RATE_LIMIT_EXCEEDED`). Decision: the owner sets a 24-hour rolling limit with
  **e-mail notification only** (never suspend — a suspended plan would fail P2B/P3 against a tip-off clock); our side has no
  per-request byte accounting (30 scripts build their own proxies dict; adding a ledger is a cross-cutting change not worth the
  risk before 10-20). Measured footprint: the MLB board pull is 0.65 MB (×12/day ≈ 8 MB/day); NBA boards are the same order; the
  5 GB trial is weeks of normal operation. The dashboard figure is read once in the first in-season week to fix the burn rate.
- **§31u confirmed by the owner; §31v written** (price-shopping research → conservative decision → daily ledger). Research sources
  (web pass 2026-10-08): PrizePicks payouts (intercom.help/prizepicks …/9047668), PrizePicks DNP rules (prizepicks.com/help-center/injuries-and-dnps),
  Sleeper rules (support.sleeper.com …/9047931, …/9261402 Flex, …/10722683 boosts, …/15382178 limits), Fliff terms (getfliff.com/terms-of-use),
  Betr tables (cbssports.com/betting/news/betr, rotowire.com …/129524, squawka.com/us/?p=56274), break-even math (sickfade.com/calculators/pickem),
  Establish The Run (establishtherun.com/how-to-beat-pick-em-on-underdog-fantasy), Underdog Math (moods.beehiiv.com/p/ud-math-2023),
  Stokastic (stokastic.com …/how-to-find-value-on-prizepicks, …/nba-pickem-correlation-strategy, …/best-prizepicks-alternatives),
  4for4 (4for4.com/2023/preseason/how-win-money-playing-pick-em-sites), OddsShopper Sleeper guide (oddsshopper.com …/how-to-play-sleeper-picks),
  Props.com Sleeper review (props.com/fantasy/sleeper/review), BettingUSA Sleeper/Fliff reviews, OddsPapi Fliff classification (oddspapi.io/sportsbooks/fliff),
  PlayerProfiler stack study (playerprofiler.com/?p=83046), Clemson DFS skill study (news.clemson.edu …). Gemini 2.5 Pro reference pass concurred and
  added the stale-line flag.
- **Price-shopping ledger built and verified:** `nba/build_price_shop_ledger.py` (commits 8323247 … 9d06096), P3 step `soft_psl` (b000572, 8090367),
  config `classification_config['price_shop_ledger']` (margin_pp 0.0916, ud_ref_per_leg 1.8206, apps). Replay probe on 2026-04-10
  (`PSL_SOURCE=backtest`): first run 37816681821 🔴 (`final_hp.player_id` is text — cast added, f9aec7a); second 37816966240 🟢;
  third after the `m_eff` correction (Underdog's number is a payout modifier, not a per-leg price) 🟢 — 40 certified legs: PrizePicks
  40/40 same line, Underdog 19 listed / 12 same line / 12 gate-pass (p 0.813 × m_eff 1.776 = 1.507), Betr history 30 / 26, Sleeper/Fliff
  no 2025-26 archive. Table `nba_score.price_shop_ledger` (240 rows for the replay date).
- **Archive note (not a defect, recorded):** the 105 Sleeper legs captured 2026-10-07 17:26Z sit under `game_date 2026-10-07` /
  `routine` (pre-fix capture, before round-2 P3#1 dated Sleeper legs by the schedule map; include_preseason=true, so they cannot be
  re-dated with certainty). Nothing decision-side reads `routine`; the first dated Sleeper archive is the 10-20 window capture.

### RETENTION CERTIFICATION (owner directive 2026-10-08 10:38 PT: "be sure that all the data is being saved … referee, lineups, all the factors, micro factors, sub factors, all the boards, the final board … retained for future usage and calibration and EV improvement")
**Method.** A full code inventory of every NBA workflow step and script (output store, write mode, date key, every DELETE/TRUNCATE/overwrite
path) by an independent read-only pass, then every risk checked against the live database. Owner rules applied: ingredients never lost;
products reconstructable from the recipe; one set per day (a rerun updates); board-scoped baseline once a slate is graded.
**Where everything lives (the map).** *Mined ingredients* → raw JSON committed to git by the pipeline that mined them (P1 weekly
statics, DARKO, lineups, tracking, shot quality, team/player profiles; P2A game logs, measure types, per-game starter status and
officials, quarter logs, matchups, schedule; P2B rosters, injury PDFs parsed, referee crews (DB), morning lines + spreads export;
every board scraper's `boards/*_current.json` on every run) and loaded into dated Postgres tables (game logs per game_id, injury
snapshots per snapshot_ts, board_snapshots per label, game_lines_snapshots, referee_assignments, defender_ratings as-of weekly,
six profile `_asof` snapshots weekly). *Factors* → inside the dated ladder record `nba/data/nba_baseline_ladder_<date>.json.gz`
(`meta.factor_fits`) + `baseline_ladder_runs.factor_fits`; the as-of calibration per as_of_date; the blowout / confidence refits.
*Final board* → `final_hp` + `final_hp_derived` (D+I per date), `board_scored` (the day-of record), `board_tiers_v2`, `availability_delta`,
`price_shop_ledger`. *Slips* → `live_slips`, `ud_live_slips`, `paper_picks`, `live_pool`, strategy state, `weekly_requal`, `certification_log`.
**Findings and fixes (all live, 2026-10-08):**
- 🔴→🟢 **R-1 (a certification gap, not only retention): the legacy `nba_market.board_tiers` had NO live writer** (P3 maintains
  `board_tiers_v2` only) yet four readers used it — `build_rung_market.py` (P3) and `build_confidence_v3.py` (P2B daily refit, plus
  its expression index), `apply_ladder_calibration.py`, `backtest_tier_selection_value.py`. From 10-20 the rung market and the
  confidence refit would have seen no live tiers. Verified v2 (`bookmaker='prizepicks'`) ≡ legacy over Mar 1–Apr 12 (371,147 rows
  each way differ ONLY in `nm`, null in the legacy table); all four readers moved to v2 (db2ba5a, f5633f1, d7d23f0, 3f4a220, bbcfd11);
  the legacy table renamed `board_tiers_legacy_20261008` (kept, commented) so nothing can read it silently.
- 🟢 **R-2 model parameters were latest-only** (`blowout_model`, `confidence_model`, `confidence_verification` whole-table replaces;
  as-of calibration rebuilt per season): `nba/snapshot_model_params.py` (941af93) copies any table's rows as JSON into the append-only
  `nba_score.model_params_history (as_of_date, source_table, row_md5, row)`; P2B snapshots the three refit tables and the as-of fit the
  slate actually reads (`max(as_of_date) <= slate`) before final_hp (d0c2a35, 9533f4f); P5 snapshots `slip_validation*`,
  `cand_certified`, `tier_map_summary` weekly (a16d494). Verified: the INSERT shape on `blowout_model` (35 rows, idempotent).
- 🟢 **R-3 strategy state had no daily history in production** (`live_state_history` written only by replay): every daily grade now
  records the post-grade state of all strategies (`record_state_history`, d6f1da0).
- 🟢 **R-4 P4 replay wiped the live ledger with no guard**: a replay without `LS_RESUME` is refused in season when live slips exist,
  same `LS_RESET_FORCE=1` override as reset (de778e7).
- 🟢 **R-5 six weekly profile tables + the roster register had no as-of copy** (`player_onoff_profile`, `player_season_profile`,
  `player_tracking_profile`, `nba_team.season_profile`, `nba_team.playtype_profile`, `nba_team.defense_vs_position`, `nba_ref.players`):
  added to P1's `_asof` snapshot list (d7832cc); first snapshots Monday 10-12.
- 🟢 **R-6 referee crews kept the latest crew only**: every capture also appended to `nba_ref.referee_assignments_log` keyed by
  captured_at (b855b5f).
- 🟢 **R-7 injury snapshots reached Postgres only through P3**: P2B now loads the day-before snapshots too (7a25b1e; idempotent loader).
- 🟢 **R-8 Sleeper/Fliff reached Postgres once a day (window)**: both are captured and archived at **morning** (P2B, 75315b4) and
  **close** (close-capture, 3cc238d), in parallel and bounded, archived only when the scraper exited 0. Verified by close-capture
  37820328052 🟢: PrizePicks 228 (all 10-20 → routine), Underdog 54, **Sleeper 79 archived as close**, Fliff 0 player rows (the
  preseason Fliff NBA board carries team markets only — "skipped 364 non-player-O/U legs"; **10-20 check: Fliff player props parse**).
- 🟢 **R-9 the baseline prune's only full copy is the git-committed ladder .gz, and P2B's commit failure is a warning**: a live-season
  date is now pruned only when `nba/data/nba_baseline_ladder_<date>.json(.gz)` exists in the P2A checkout; held dates are retried
  automatically on later mornings (af2fd20, 9d9889c, 33824d7). Historical dates keep the documented board-scoped rule.
- 🟢 **R-10 no logical backup of the database**: (a) provider: DigitalOcean managed PostgreSQL keeps **daily backups for 7 days**,
  restore = a new cluster (docs.digitalocean.com …/restore-from-backups); (b) **weekly git archive of the DB-only ledgers**
  (`nba/dump_db_ledgers.py` in `nba-db-sql-dump.yml`: 23 tables — live slips/pool/state/history/calib, weekly_requal, certification_log,
  paper_picks, price_shop_ledger, model_params_history, edge monitors, UD paper slips, prune log, ladder runs, availability_delta,
  referee tables, morning lines (live season), run records, scheduler log, classification_config; never credentials) — verified run
  37820108443 🟢, committed 58248eb; (c) **off-database copy of the big ingredient history as GitHub Release assets** (no repo bloat,
  2 GB/file): `nba/dump_db_history.py` + `nba-db-history-archive.yml` (monthly 1st + on demand) — verified run 37820889847 🟢 in
  10 min: release `db-archive-2026-10-08` holds 20 assets, 905 MB — board_snapshots 11.6M + 15.4M rows (81 + 104 MB), board_outcomes
  3.05M + 3.85M, game_lines_closing/snapshots, injury_report_snapshots 418k + 920k, board_scored 5.2M + 7.6M (115 + 165 MB),
  baseline_history 4.2M + 4.5M, final_hp 3.4M + 3.8M, board_tiers_v2 0.7M + 1.5M.
**Accepted as designed (owner rules), recorded:** intraday board captures collapse into one row per label (the "rerun = update" rule;
the 2-hourly pulls stay as git commits of the board files); `final_hp` for yesterday is rebuilt by P2A from the complete board (the
day-of values live in `board_scored`, and the day's parameters are now in `model_params_history`); weekly derived tables
(`tier_map_bands`, `tier_map_legs_sel*`, `slip_engine_*`) are products, rebuilt by P5 from retained ingredients; an Underdog re-pick for
a day is refused unless `UDL_FORCE=1`; repo-only ingredients (pt_defend/hustle/clutch, matchups, quarter logs, pairs, coaches) are safe
in git.

### ODDS API MINING PROGRAM — step 1, NBA play-in + playoffs, both seasons (owner 2026-10-08 11:52 PT; done 12:42 PT)
Owner order: (1) NBA postseason boards + market for both past seasons, same books/markets as the backtest → report; (2) MLB
(2025 full incl. postseason; 2026 rest incl. postseason; keep mining the live MLB postseason); (3) NHL with what is left; (4) wire the
NBA playoffs into the back data. Credits at start: paid key **4,999,977** (free key 500, untouched).
- **Boards (Odds API historical event odds, 21 markets, us_dfs + us, window + close — the backtest's exact shape):** 2024-25 postseason
  was already in from the original backfill (90 events, both labels, 2025-04-15 → 06-22). 2025-26 postseason pulled today:
  `nba-board-backfill` 37828947918 🟢 (2026-04-13 → 06-30): **91 events (= 6 play-in + 85 playoff on the calendar), window + close
  both, 0 errors, 1.49 M rows**. Shape check: playoff dates carry the same 21 markets and the same 10 (2024-25) / 12 (2025-26) books
  as regular-season dates (PrizePicks, Underdog, DraftKings … present on every sampled date).
- **Closing game lines (ParlayAPI archive, `parlay_game_lines_backfill`):** 2024-25 postseason 455 rows / 90 games / 52 dates;
  2025-26 postseason 839 rows / 91 games / 50 dates (the 2026 archive also carries the extra non-`_an` books ParlayAPI added in May 2026).
- **Morning + window game-line snapshots (Odds API sport odds, h2h/spreads/totals):** `backfill_game_line_snapshots.py` had a
  hardcoded 2025-04-14 → 10-20 skip that excluded the 2025 postseason — removed (ea66a85; a date with no board rows is skipped anyway).
  Runs 37829464278 🟢 (2025: 50 dates, 100 snapshots, 11,622 rows, 0 errors) and 37833756736 🟢 (2026: 47 dates, 94 snapshots,
  11,922 rows, 0 errors).
- **Credits after step 1: 4,918,278** (≈ 81.7 k spent). Billing rule verified in the docs: event odds cost 10 × markets RETURNED ×
  regions (empty markets are free); sport odds cost per market requested; the events list costs 1.
- **Not yet done (owner's step 4, after MLB/NHL mining):** postseason box scores → outcomes (`board_outcomes`), baseline and
  final_hp for postseason dates; the whole chain is regular-season only by design today (the ONE slate predicate, game_id `002%`).
- **NBA gap audit (owner 13:02 PT "double check, be sure there are no gaps"):** every scheduled game (2025-26 calendar: 1,230
  regular + 91 postseason; 2024-25: schedule_norm 1,230 regular + ParlayAPI 90 postseason) checked for an ok window AND an ok close.
  Real holes found and repaired by `nba/repair_board_gaps.py` (probe 37836739875): two NBA Cup closes 2024-11-29 (event id re-keyed
  → resolved at tip-40, 4,153 / 4,044 rows), three early-tip windows 2024-11-10 / 12-31 (tip-2h, 4,957 / 3,968 rows) and 2025-04-13
  ATL-ORL (only 18 rows exist at any time before tip — the source's own thin last-day board), one playoff close 2026-05-07 OKC-LAL
  (tip-60, 7,568 rows). Everything else non-ok = postponed games whose original ids 404 (their make-up games are covered on the new
  dates). Morning + window game lines: 426 / 426 board dates. **NBA history: no gaps.**
- **MLB mirror (owner 13:02 PT: "exactly the same for MLB … mirror … same board times … current season + past season incl. playoffs").**
  MLB's board times measured on `archive.board_leg_history`: 09:00 / 13:00 / 17:00 PT (09:00 = the morning board slips are placed
  from). `mlb/backfill_mlb_odds.py` + `mlb-odds-backfill.yml` (8 shards): every game at each board time before first pitch, all 37
  prop markets (20 base + 17 alternate), us_dfs + us (PrizePicks, Underdog, Pick6 + 9 books), raw responses stored lossless as
  jsonb (`market.mlb_odds_event_snapshots`, ~70 KB each; view `market.mlb_board_snapshots_v` gives NBA-shaped rows), game lines at
  the same times (`market.mlb_odds_game_lines`). Sample first (2025-10-14/15) then the full runs. **Result (credits ran to the floor):**
  2025 regular 2,449 games — 09:00 complete (3 games had no board at 09:00), 13:00 missing for 295 games and 17:00 for 85 (late
  Aug–Sep); 2025 postseason 47 games — complete at all three times; 2026 regular (opening day → Jul 15; Jul 16 → Sep 27 already held
  from our own scrapers + ParlayAPI) 1,317 games — 12 dates (Jun 23 → Jul 15, alternate shards) not reached; 2026 postseason through
  Oct 7 — 09:00 complete (23 games), 13:00 / 17:00 not reached. Paid key ≈ 6.5 k credits left. Re-keyed MLB events (rainouts,
  doubleheaders) now re-listed at each board time (a6dde38). `mlb-odds-daily.yml` (02:30 PT) keeps pulling the last three days for
  the rest of the postseason while the key has credits.
- Side observation: GitHub delivered P2A's 13:30Z cron backstop at 19:21Z (≈6 h late) — the run-once claim made it a no-op
  ("already claimed … this run does nothing"), exactly as designed.

### POSTSEASON WIRING — owner's step 4 (2026-10-08 13:37 PT: "wire the playoffs in the system … its own specifics … everything the system does for the regular season must cover the postseason … weigh properly against the regular season")
Design and the as-built table: strategy §31w. Evidence, in order:
- **MLB first (owner: "be sure MLB is mining to the end of the season"):** ParlayAPI closing game lines 445 dates 2025-03-17 →
  2026-10-04 (10-05 → 10-07 not yet published by ParlayAPI → the daily keep-up now re-asks the last 4 days, e53c242); first live
  capture pt1300 verified (PP 564 / UD 252 / Sleeper 571 / Fliff 1,052 / ParlayAPI props 3,119 ok; Betr file stale since 09-10,
  flagged). Every MLB mirror table joins the monthly off-database archive. `mlb/MLB_ODDS_HISTORY.md` updated. MLB code untouched.
- **P-1** postseason mining run 37842505544 🟢 (3 seasons × 14 files: 88 / 90 / 91 games = 6 play-in + playoffs; quarters,
  measure types, starters + officials for every game) → loader run 37845256507 🟢 → twin tables: `player_game_log_postseason`
  1,805 / 1,934 / 2,047 rows, `team_game_log_postseason` 176 / 180 / 182. Injury reports: 2024-25 postseason 71/71 days,
  2025-26 62/62 days (`nba-injury-report.yml` backfill loop).
- **P-2** grader 37844676408 + 37845267594 🟢: `board_outcomes` on **50/50 and 47/47 postseason game days** (245,880 / 316,960 legs).
- **P-3** postseason spreads export fixed (Postgres has no `count(DISTINCT) OVER`; 4d36d2b) → **90/90, 91/91 games** with morning
  spread + total + window spread. Sample (points + rebounds) 37847241144 🟢, then full runs: **2024-25 17 props × 50 dates
  (201,608 board-scoped rows), 2025-26 17 props × 47 dates**. Regular-season baseline rows untouched (loader deletes 004/005 only).
- **P-4** final_hp postseason (maintenance `final_hp_postseason`; serial runs ~45 min/season, so `nba-final-hp-postseason.yml`
  runs prop groups in parallel — the board-key table is a session TEMP table and every delete is season + prop + 004/005).
  **Regular-season final_hp untouched** (2024-25 points / assists / blocks 002 rows still built 2025-09-25). A defect found and
  fixed on the way: a `5_postseason` cell not yet PUBLISHED by the game date returned 0 shift instead of the `4_push` fallback
  (f029fd7; identical for regular-season lookups). **As-of calibration rebuilt** (22:50Z): 2024-25 gains 7 postseason as-of dates
  and 1,186 `5_postseason` cells; 2025-26 inherits them as its same-phase prior (4,152). **Regular-season cells:** 2024-25 identical
  to the 09-25 build (backup table `nba_score.ladder_calibration_asof_pre_post_20261008`); 2025-26 differs in 2,076 own cells from
  2026-01-17 on (n +11.7 per cell, mean |Δshift| 0.0048 logit, max 0.031) — attributed to round-2 P2B#4 (the daily roster now
  resolves mid-season newcomers' graded legs), not to the postseason (postseason legs sit in their own phase; 2024-25 unchanged);
  P2B rebuilds these cells nightly in season anyway. Model quality on 2024-25 postseason board legs (157,877 graded legs, 7 main
  props): Brier 0.1956 → **0.1940** baseline → final, log-loss 0.5744 → 0.5686 — on par with the regular season's late push
  (0.1966 → 0.1956 on 325,411 legs): the postseason is modelled as well as the regular season.
- **P-5 sample (2024-25 postseason only, before the 2025-26 build):** postseason tier map + cells + slip engine `_post` (58,380
  slips) + strategy gate. Cells weighed against their certified p.m: eligible steals_R_U (post 0.620 → w 0.657), pra_R_U (0.660),
  steals_R, pts_ast_R, turnovers_R, threes_D1, points_R, pts_reb_R, rebounds_R; **not eligible** rebounds_D3 and blocks_R
  (postseason contradicts the prior), goblin and assists_D1 (weighted p.m below break-even), stocks_R (1 postseason day). No
  strategy PASSES on one postseason (A_wsteals_5flex +47%, B_demon_5flex +67%, B_demon_3flex +41% at k = 1, every lower bound
  < 0) → all SHADOW. Postseason board floor min 485 / p10 560 / median 982 unique scored legs. Consistency fix: the backtest now
  excludes the ineligible cells exactly as `pick_postseason` does (db6071d).
- **P-4 for 2025-26 + recalibration:** serial build (00:24Z), as-of calibration rebuilt (00:48Z; 2025-26 now has 1,018 OWN
  `5_postseason` cells beside the inherited prior), then the parallel workflow priced every 2025-26 postseason prop with them.
  First parallel attempt saturated the database IO (nine jobs each copying + indexing the whole multi-season board-key table;
  terminated 01:33Z, nothing written) → `FE_POSTSEASON` now copies only April–June keys (ffe8284) and the matrix runs 3 at a time
  (c896f7d): the whole season priced in **~8 min** (37870418602 🟢) vs ~45 min serial.
- **P-5 FULL RESULT, both postseasons (37871662776 🟢, 97 postseason slate days):**
  cells weighed against the regular season — **eligible**: pra_R_U (post 0.660 / 0.702 → w 0.667), steals_R_U (0.620 / 0.513 →
  0.616), stocks_R (0.564, 47 days → 0.588), points_R (0.578), pts_ast_R (0.577), pts_reb_R (0.576), blocks_R (0.567),
  rebounds_D3 (0.561), rebounds_R (0.559); **not eligible**: steals_R and turnovers_R (postseason 0.526 / 0.517 contradicts the
  prior), threes_D1, assists_D1 and the goblin extender (weighted p.m 0.526 / 0.509 / 0.504 < 0.55).
  Strategies at k = 1 on the eligible pool: **none PASSES** — C_wstocks_4flex +62% (25 days, 2025-26 only), A_core_3power +15%
  (2024-25 −100%, 2025-26 +17%), D_points_3power +11% (−4% / +28%), A_wrebounds_4flex +7%, A_regular_5power −44%; the demon
  and steals-weighted strategies have no postseason pool once their cells are ineligible. Every pooled lower bound < 0.
  The walk-forward validator on the postseason tables (select on 2024-25 postseason, score 2025-26 postseason): **0 of 29
  survivors**, null expectation 0 — no postseason-native composition shows a provable edge either.
  **Verdict: on two postseasons of evidence nothing stakes in the postseason; every strategy builds SHADOW slips** (graded,
  recorded, outside the regular ledger), the board floor is **485** unique scored legs (p10 579, median 1,056), and P5 step 7
  re-certifies weekly during play-in / playoff weeks with each live postseason night added — a strategy starts staking the
  week its postseason lower bound clears 0 in every postseason. This is the conservative reading of "weigh properly": the
  regular-season edge is not assumed to carry into a different regime without postseason evidence.
- **Live path verified end to end on past slates** (probe `probe_pick_postseason.py`, run 37872250721 🟢, commit disabled +
  rollback): control 2026-03-15 → not a postseason slate; 2026-04-15 (play-in), 2026-04-25 (first round), 2026-06-10 (Finals) →
  postseason path taken; board 100% team- and event-resolved through the slate predicate (2026-06-10: 823 legs ≥ floor 485);
  eligible cells and verdicts read; every strategy SHADOW with its reason; `live_slips` / `live_pool` row counts unchanged after
  rollback → **PROBE PASS**.
- **P2A postseason gap audit** added (every scheduled play-in / playoff game through last night must have both teams' box
  scores in the season's postseason file; 2025-26 check offline: 91 / 91 games, both teams).
- **P-6 live:** `nba_calendar.slate_games` created (002 + 004 + 005) and read by the scheduler (v2.3.0), P2B, P3, P4, prune,
  certify_pipeline and the live engine; P2A postseason delta; live ladder appends postseason files; `pick_postseason` (statuses
  outside the regular ledger); Underdog `stand_down:postseason`; P5 step 7 refreshes the postseason certification weekly in
  play-in / playoff weeks. Every touched file compiles under 3.11, every workflow parses, every embedded bash / Python block checks.

### POSTSEASON BACKFILL TO FULL PARITY — owner 2026-10-08 19:08 PT ("all tables should match the rest of the season, all factors, everything … the full pipeline … be sure the certification stands and covers the playoffs")
A gap audit (`nba_control.audit_postseason_cov(table)`: distinct dates in the last regular month vs the postseason window, both
seasons) found every ingredient the regular season's final_hp reads that was still empty on postseason dates. Each was filled
with the SAME builder the regular season used, extended to read the postseason files and never writing a regular-season row:
- **Ingredients:** injury snapshots 50 / 47 postseason dates (archive mode); `event_game_map` + `schedule_norm` 181 postseason
  events (regular 2,454 rows hash-identical); `rung_market` 2026 postseason months (2025 already built; regular April rows
  identical); `scenario_realised` postseason games (phase `5_postseason`; regular `n_uncertain` identical for all 1,937 games);
  `pp_anchor_rescue` / `pp_leg_price_cons` from 2026-04-13 (priced share 99.5 %); per-game defensive matchups for every play-in
  and playoff game of 2023-24 / 2024-25 / 2025-26 (88 / 90 / 91 games, 14,585 / 16,174 / 17,033 rows, none empty, own
  `nba_matchups_pergame_postseason_*` shards, run 37874097414).
- **Props the postseason boards carry that the baseline lacked:** dreb / oreb / fgm / fta (on 2024-25 postseason boards, as in the
  regular season) → postseason baseline history for both seasons, then final_hp (8,054 legs). The workflow defaults now include them.
- **final_hp rebuilt for both postseasons** on the filled ingredients (2024-25 runs 37879391507 / 37879411115, 2025-26 269,184
  rows); every one of the 97 postseason dates priced. **Whole-number lines** priced into `final_hp_derived` (5,824 / 5,484 rows,
  50 / 47 dates — same per-game density as the regular season). **board_scored** for every postseason date (50 / 47, every app).
  **pp_model_vs_price** postseason rows appended with the file's own recipe (date-scoped; the regular rows are the 2026-09-21
  snapshot and were not rewritten). Underdog's twins `ud_window_legs_post`, `ud_stat_actual`, `pp_line_history` (recipes
  checked exact against regular dates).
- **Coverage after the backfill** (dates, 2025 postseason / 2026 postseason): board_outcomes, baseline_history, final_hp,
  final_hp_derived, board_scored, rung_market, pp_leg_price_cons, ud_stat_actual, pp_line_history, pp_model_vs_price — **50 / 47**
  each, exactly like the regular months beside them (30 / 30).
- **Leak closed:** `build_confidence_v3.py` now excludes 004/005 legs from the deduction-model fit (the regular-season
  certified model must not learn from the postseason). Every other history-fitting consumer was audited: prop_universe's
  postseason rows are `simulated` with no hit, so the tier map, certify_candidates and the WI / sel maps never see them.
- **Pipeline:** P2A's postseason step now also scrapes last night's per-game matchups (`MATCHUPS_POSTSEASON=1`); the postseason
  certification gains step 4b (Underdog postseason record: `ud_tier_map_legs_post` / bands / summary, 35,255 legs, UD stays
  stake 0 on postseason slates); `build_tier_map_legs_postseason.py` now carries whole-number legs priced exactly as live
  (`wn_selection` → `wn_price` → `wn_score`): 8,612 of 119,767 rank-key rows.
- **Certification re-run on the backfilled data (37883055416 🟢, 97 postseason nights):** eligible cells unchanged in
  membership — blocks_R, points_R, pra_R_U (weighted 0.579), pts_ast_R, pts_reb_R, rebounds_D3, rebounds_R, steals_R_U (0.616),
  stocks_R; not eligible assists_D1, goblin, threes_D1 (below break-even), steals_R, turnovers_R (postseason contradicts the
  prior). **No strategy passes** (best D_points_3power +3 % over 96 days, lower bound −38 %; A_wrebounds_4flex +7 % on 29 days);
  walk-forward 0 of 30 survivors in both pools, null expectation 0.00 / 0.03 → **postseason stays SHADOW-ONLY**; board floor
  485 (p10 579, median 1,056). **Probe re-run 37883821882: PROBE PASS** (postseason path on 2026-04-15 / 04-25 / 06-10, six
  shadow slips on the Finals night, ledger unchanged after rollback).
- **The regular-season certification stands — proven, not assumed.** Against the pre-backfill fingerprints and a mid-backfill
  snapshot taken with the new reproducible function `nba_control.cert_fp(table, where)`: tier_map_legs / _sel / _sel_mf,
  slip_engine_slips / _mf / _mf_nosteals, cand_certified, confidence_model, prop_universe, rung_market 2026-04-01..12,
  event_game_map (002), scenario_realised (002) — **identical**; final_hp 002 (7,215,296 rows), baseline_history 002 (8,708,333),
  board_outcomes outside the postseason windows (6,905,452) — same counts and **zero rows written since the snapshot**; tonight's
  board_scored and final_hp_derived writes touched **0** regular-season dates.
- **Deliberately not twinned** (documented): research-only tables with no production or certification reader and no producer in
  the repo (leg_clv, tier_map_player_trail*, tier_map_rotation, starter/availability training, team_fresh_abs, player_ev_disp,
  a5_feature, betr_window_legs, ud_leg_nvw / ud_leg_fresh) and the regular-season research matrices (cand_leg_features,
  ud_cand_leg_features, absence panel, redistribution factors) — the postseason chain reads none of them. `double_double`
  has no final_hp on postseason dates for the same reason it has none on live regular slates (the board carries it as a
  Yes/No sentinel line −1, the certified 0.5 rows predate board scoping) — not a postseason gap; it is in no certified cell.

### POSTSEASON GAME KEY — defect found by the playoff program (2026-10-09)
- `nba_score.tier_map_legs_post.event_id` NULL on all 359,301 rows (board_outcomes has no event column; the regular map takes its game
  from prop_universe). Effect: `build_slip_engine` (SE_LEGS_SELF) saw None == None → every postseason pair "same game": cross-game-first
  ordering never applied, the regular-season negative-correlation ban fired on cross-game pairs, `same_game` = size − 1 on every slip.
- Fix: `build_tier_map_legs_postseason.py` resolves event_id from game_id via `nba_market.event_game_map` (fallback game_id); table
  updated (181 / 181 games mapped, 0 fallbacks). Live pick unaffected (it resolves events itself; probe 100%).
- Re-certified (nba-postseason-certify, 2026-10-09 05:32Z): 15,618 of 62,042 postseason slips cross-game (was 0); verdicts unchanged —
  all SHADOW (D_points_3power +3% / 96 d, A_wrebounds_4flex +4% / 36 d, C_wstocks_4flex +19% / 34 d, R_stocks_4power +32% / 15 d;
  every lower bound < 0). Playoff strategy research: strategy §31y, COMPASS 142.

### PLAYOFF UNDERS — gates, stress, certification, live parity (owner 2026-10-09: "run all the gates, stress it out … wire the logic, so it is ready for playoff time")
- Research run 37897295209 (`research_playoff_unders.py`, code 9b994a4): 1,920 PP / 360 UD pre-registered variants, G1–G5 + 50-run
  null; finalists stressed (10k lower bound, 7-night-block envelopes, leg-hit decay, same-game correlation, both regular seasons).
  Config written to `classification_config['playoff_unders']`; `stake_mode: 'gate'` added by hand (verified in the row).
- Certification (nba-postseason-certify 37898660065, 07:29Z): `postseason_strategy_verdict` — P_unders_5flex PASS (97 d, +63.5%,
  lo +16.2%), P_unders_4flex PASS (+37.6%, lo +2.1%), U_unders_2standard PASS (49 d, +55.6%, lo +6.1%), P_unders_3power SHADOW;
  regular-season strategies unchanged (all SHADOW on playoff slates). Slips in `nba_score.playoff_unders_slips`. Research and
  certification numbers identical (one code path).
- Live parity (probe 37899991171 → 37900420784, PROBE PASS): 2026-04-15 / 04-25 / 06-10, P_unders 3P / 4F / 5F live slips ==
  certified backtest slips 9 / 9; UD PLAYOFF_UNDERS slip == backtest (04-25; no slip on either side on the one-game 06-10);
  live_slips / live_pool / ud_live_slips row counts unchanged after rollback. First probe run (37899629054) FAILED on parity — cause:
  the probe read a past night's market-inclusive `final_hp.score`; the map (and live, no feed) use the market-free score. Probe now
  rescored with the builder's own `_fh` statement; names compared accent-insensitively (Jokic / Jokić). Not a live defect.
- Code: `playoff_unders.py` (stake_mode), `live_slip_engine.py` / `ud_live_slip_engine.py` (stake only with PASS and
  stake_mode 'gate'), `probe_pick_postseason.py` (PP + UD parity). No MLB file touched.
- Open by design: PP slip-level walk-forward (G5) fails — selection on 97 nights is not provable; the deployment rests on the gate,
  the family robustness (all 60 whole-line 5-Flex variants positive in both postseasons) and the leg-level out-of-sample hit.

### MULTIPLIER VALUE PROGRAM (owner 2026-10-09 09:27 PT: "stress, research, probe, mine, debug and understand multipliers … test it out, see if it's worth it, or we just keep the strategies")
- Research run 37961709098 (`research_multiplier_value.py` 512e7f86, `nba-multiplier-value.yml`): 828,818 PrizePicks / 421,819
  Underdog / 237,806 Pick6 graded legs; stages law → calib → gate → udsim → xapp → layer; tables `nba_score.mvp_*`. Strategy §31aa,
  COMPASS 144. Verdict: no generic price gate, no cross-app staking; current strategies kept.
- Price-shop ledger upgraded (`build_price_shop_ledger.py` 75febac8): `cell`, `p_cell`, `m_star`, `v_cell`, `gate_cell`; config
  `price_shop_ledger` updated in the DB (ud_ref_per_leg 1.8206 → 1.8708, cell_margin 0.03; verified in the row). Replay probe
  37963666768 (2026-04-10, backtest source): Underdog 12 same-line legs — model gate 12 pass at mean p×m 1.548, backtest-hit-rate gate
  10 pass at mean 1.048; rows verified in the table (m_star per leg).
- PrizePicks payout mining (`TRIGGER_NBA_PP_MAP.txt`) switched from WNBA back to NBA (it was due ~10-01; last NBA quote 09-21).
- To verify in the apps on 10-20 (cannot be measured server-side): Sleeper slip payout vs the product of its multipliers; PrizePicks
  3-/4-Flex tables (help centre 2.25/1.25 and 5/1.5 vs mined 3/1 and 6/1.5). Not scraped live: Pick6, ParlayPlay, Dabble.

### Round-3 candidates (measured, deliberately deferred — each is a chained recertification, not a patch) — see ROUND 3 below for the 2026-10-09 outcome
1. `board_outcomes` standard/alternate double count (P2B#18) — dedupe in every consumer and rebuild the chain.
2. The certified history's blended morning/window spread (P2B#5) — rebuild `nba_market_spreads_*` morning-only and re-run
   the baseline history.
3. `whole_number_nb` legs (P2A#6) — backtest the neighbour-priced class before it can be selected.
4. Underdog market-free twin (P3#4) for the paper engine's hurdles and edge reference.
5. Retire the market term from the certified scoring altogether (make market-free THE scoring) once the odds-feed decision
   is final — then the twin tables disappear.

### ROUND 3 — the deferred candidates worked (owner 2026-10-09 12:25 PT: "Is the system perfect, done, nothing open, you covered everything? Get to work.")

Each candidate was either executed or measured to its final-output effect and closed with the number; nothing is left as a bare caveat.

- **#4 🟢 DONE — Underdog market-free twin.** The certified Underdog backtest (`ud_tier_map_legs_curr` → `_dlt_orig2`) ranks six of
  its fourteen cells (rebounds_F2_U, rebounds_R, blocks_R, points_R_U, pts_reb_R_U, pra_R_U — points_R_U is the P5 backbone) by
  `final_hp.score`, which in the history carries the confidence model's market term; the live engine reads the same column from a
  daily `final_hp` that has no sportsbook feed. Built exactly as the PrizePicks twin (round 2 P3#4):
  - DB function `nba_score.build_ud_tier_map_legs_curr_mf()` (source `nba/sql/build_ud_tier_map_legs_curr_mf.sql`, 64e30d5) →
    `nba_score.ud_tier_map_legs_curr_mf`: 1,265,457 rows (= source); only `final_score` rows move — 101,052 of 421,819 legs carry a
    market term (24%), mean shift −5.59 score points (range −12.28 … −0.04), the other 320,767 byte-identical (legs without a
    market term keep the stored score: recomputing from the 4-decimal stored hp / confidence adds ±0.02 of rounding noise, so the
    function adds the DIFFERENCE of the formula at the market-free and the stored confidence — verified by hand on 5 legs);
    n_rank re-ordered for 167,298 legs, cell_size unchanged. Deductions read from `confidence_model`.
  - Slip build `nba-ud-slip-engine` suffix `_dlt_orig2_mf` (run 37982775247, 5 min) with `_dlt_orig2`'s exact configuration
    (original 14 cells, centers out, sizes 2–6, cap 5, haircut 0.5% mains / 1% priced; confirmed from the stored legs_json).
  - **Effect (cap 1, stand-downs out; ROI 24-25 / 25-26, certified → twin):** weighted:points 4-Std 1.54 → 1.24 / 1.11 → 0.94;
    weighted:points 6-Flex 1.46 → 0.50 / 2.25 → 1.84; mains 2-Std 0.35 → 0.34 / 0.37 → 0.38; weighted:points 2-Std (P4) 0.57 →
    0.57 / 0.27 → 0.27. **P5 portfolio: 0.84 → 0.60 (lower 95% +0.24) / 0.89 → 0.78 (lower +0.33)** — positive with a positive
    lower bound in both seasons on the faithful simulation. The 6-Flex slot alone loses its 2024-25 lower bound (+0.50, lower
    −0.57, 82 slips); the same shape the PrizePicks twin showed (B_demon_5flex 1.62 → 0.70).
  - **Validation battery on the twin** (`ud_slip_validation_dlt_orig2_mf`, run 37984002616; retained copy via the new
    `SV_SNAPSHOT` input): forward 4 of 30 survive (weighted:points 4-Std OOS +94% lower +26%; mains 4-Std +102% / +32%;
    weighted:points 3-Std; ex:points 4-Std), V3 null 0.01 expected → the edge is not selection; reverse 0 of 30 — the 2025-26
    top-30 is dominated by 5–6-pick builds whose 2024-25 twin ROI collapses (6-Flex 0.50) and the 4-Std / 2-Std slots rank below
    the cut. Read with the per-slot bounds above: the P5 portfolio stands on the twin; the market-free 2024-25 is the weaker season
    for the big Underdog slips, as it is on PrizePicks.
  - **Edge monitor re-measured on the twin** (`nba-ud-edge-monitor-research` run 37984011965, `EM_TABLE` input): thinning
    break-even delta* −9.46 pp pooled (−8.91 / −10.13; certified build −10.84), boundaries confirm z ≥ 2.24 / alarm z ≤ −2.94
    (800 bootstrap seasons at break-even, ≤ ~5–6% false either way); power: edge as certified confirmed by slate 60 in 85%, 8 pp
    below break-even alarmed by slate 120 in 89%. **Now a DB tunable** `classification_config['ud_edge_monitor']` {delta_star
    −0.0946, confirm_z 2.24, alarm_z −2.94} read by `ud_live_slip_engine.ud_edge_cfg()` (7caa2a9); code defaults = the certified
    build; row removal = fallback.
  - **Live engine wired (856f82c, 7caa2a9):** `load_legs` scores MARKET-FREE through `market_free_score()` — the identity on a
    live day (c_market = 0) and the faithful live score in a replay; `ud_bt_table()` reads `classification_config
    ['live_backtest_suffix'].ud_table / ud_legs_table` (set to the twin tables; the PrizePicks `suffix` row, one switch);
    `ud_edge_reference` records its source table (`ud_edge_monitor_ref.src`) and rebuilds itself when the tunable changes;
    `verify_ud_live_parity`, `validate_ud_edge_monitor`, `ud_edge_monitor_research` all read the tunable (bf58bc7, 42d701d,
    c6601e6, 64262ac).
  - **Live parity against the twin** (run 37984021311, every 2025-26 slate): ALIGNED 895 / 896 identical (the 1 = the known
    2026-03-17 exact-score tie), raw 865 identical + 3 void-in-slip + 28 rank shifts, **settlement 868 / 868** — the Python
    rescoring and the SQL function agree leg for leg.
  - **Edge-monitor production code validated on the twin** (run 37985081231): reference rebuilt from the twin (16 keys,
    `ud_edge_monitor_ref.src` = the twin); 2024-25 CONFIRMED at look 30 (z +3.08) and every later look; 2025-26 UNDECIDED at 30
    (z +1.10), CONFIRMED at 60 / 90 / 120 (z +3.23 / +3.48 / +3.55); no false alarm in either season; the DB wrapper on today's
    ledger correctly reports no regular season in progress.
- **#1 🟡 CLOSED BY MEASUREMENT — `board_outcomes` standard/alternate double count.** Final-output effect computed on the stored
  as-of calibration (869 / 873 cells per season): with n deflated by the measured 19% the shrink weight n/(n+400) changes the
  log-odds shift by a median 0.0034 (≈ 0.08 pp at p = 0.5) and at most 0.045 (≈ 1.1 pp, the thinnest cells; median cell n 1,755 /
  2,024, p10 556 / 570) — always toward a smaller shift (more conservative). Below the per-cell calibration SE (≈ 1–2 pp) and two
  orders below the market term the twins remove (5.6 score points). Decision: the certified chain stands as built; `AC_DEDUP` and
  the dedupe in every consumer go into the first post-launch chained recertification together with #2 (one rebuild, not two).
- **#2 🟡 CLOSED BY MEASUREMENT — blended morning/window spread in the certified history.** Old vs new `nba_market_spreads_*`
  (git 816cf44 vs f052462): 2024-25 375 / 1,228 games differ (avg 0.93 pt), 2025-26 355 / 1,226 (0.94); the spread reaches the
  model only through 2-point buckets — p_blowout bucket flips 135 / 136 games (11%), sliding-scale flips 137 / 102, |Δ| ≥ 2 pt
  36 / 41 (3%), favourite flips 10 / 20 (1%). An adjacent p_blowout bucket moves p_blowout by 0.01–0.06 and the minutes factor by
  ≤ 0.4% (typically 0.1–0.2%) for players in those 11% of games — ≈ 0.3 pp of hit probability at most. Not a verdict-changing
  leak; folded into the same post-launch chained recertification as #1.
- **#3 🟡 CLOSED BY MEASUREMENT — `whole_number_nb` (neighbour-priced whole-number legs).** In the 2025-26 regular season 975 of
  16,874 whole-number PrizePicks window keys (5.8%) have no `whole_number` price (unmapped player, unmodelled stat, or the pruned
  neighbour rung this class would recover); whole-number legs are 8–16% of slip legs, so the class is < 1% of slip legs and too
  thin for the §31s currency maps (fit per rank key × prop × tier × side). It stays priced-but-not-selectable (`final_hp_derived`
  'whole_number_nb', live engine reads 'whole_number' only); the daily count is in the P2B log — revisit if it grows.
- **#5 ⏸ OWNER DECISION — retire the market term.** With both apps measured against market-free twins the system is consistent
  either way; retiring the term (market-free THE scoring, twins disappear) is a cosmetic simplification with the same chained
  recertification cost, and reinstating it live needs the odds feed (option B, ~$119/mo). Nothing is blocked on it.
- **Also closed today:** the backup P2A cron (18:55Z) correctly refused the already-claimed 2026-10-09 run ("no pipeline runs
  twice", run 37976672433); Betr Cloud Harvest's crons did not fire on 10-09 (GitHub cron drop; the WNBA board is gone
  anyway — verify the first NBA harvest on 10-20).

### THE MARKET TERM, LIVE (owner 2026-10-09 15:07 PT: "for market we're gonna get the Odds API … for props we use ParlayAPI … you handle properly"; strategy §31ac, COMPASS 146)

- **Keys:** stored only in `nba_config.external_credentials` — the Odds API free key the owner named was already `odds_api_key`
  (MLB/general, 500 credits/month); the ParlayAPI key he gave today is `parlay_api_key_alt` (the earlier Pro key `parlay_api_key`
  stays the row in use, 12,828 credits). Nothing in memory, docs or the repo.
- **Budget answer:** the free Odds API key cannot carry player props (~80+ credits a day) nor the morning game-line snapshot
  (historical endpoint, 30/day ≈ 900/month); game lines already run on the paid NBA key (4.9M credits) — no change. Props from
  ParlayAPI at 3 credits per window pull (~90 credits a month).
- **Built:** `nba/capture_parlay_props.py` (acde2f3…9ded1b4) — ParlayAPI live NBA props → raw capture
  `nba_market.parlay_props_captures` (lossless, one per slate × label; a probe stores under `probe_<label>`) + sportsbook rows
  into `nba_market.board_snapshots` in the Odds API backfill's shape (certified book set only; `market_feed.market_map`
  vocabulary; label `window` for the slate's games, `routine` for other dates; the archive's conflict key = idempotent).
  P3: soft step "Live sportsbook props" before `build_rung_market` (7070d43, 15ec379, in the soft-failure collector) and the
  gated "Market refresh of final_hp" after it. Tunable `classification_config['market_feed']`.
- **Probe 37997921384 (inventory):** http 200, 727 items (10-09 preseason 70, 10-20 249, 10-21 408), credits 12,828; the
  sportsbook keys ARE Odds-API-style (player_points / player_rebounds / …, Pinnacle `player_pts_rebs_asts`,
  `player_threes_made` — mapped). **Defects found and guarded (9ded1b4):** FanDuel milestones ("To Score 30+ Points") tagged
  `player_points` with line 0.0 and −1100 prices; Bovada "Lowest Scoring Quarter Total Points O/U – Detroit Pistons" tagged
  `player_points` with player = "Boston Celtics @ Detroit Pistons" — 49 such rows reached `board_snapshots` (label `routine`,
  10-20/21) in the first capture run and were moved to `board_snapshots_quarantine` with the reason; the guard (full-game line
  > 0 on a named player; period FULL; no quarter/half/team markets) now refuses them. Pinnacle / Novig carry real ladders but
  are outside the certified book set → not counted (the live term must count the history's books).
- **End-to-end probe 37998795117 (capture mode, guarded code):** capture → `board_snapshots` → `build_rung_market` (current
  month) mechanics green; 0 rungs priced today because the PrizePicks preseason window board holds no 10-09 legs — the first real
  reading is 10-20. History reference for that reading: window rungs average 2.14 / 2.10 / 1.97 / 1.97 books (Oct–Jan),
  14.7–16.6% with ≥ 4.
- **Switch rule (not flipped):** `market_feed.refresh_final_hp` stays false until the first in-season week's books-per-rung
  matches the history; then it is flipped together with `live_backtest_suffix.suffix → ''`, `.ud_table → _dlt_orig2`,
  `ud_edge_monitor → certified` (one decision, four rows, same day). One without the other would score live legs on one
  currency and calibrate hurdles on another.

### THE BETR BOARD — not soft (owner 2026-10-09 15:35 PT: "If any board is not working properly, it's not soft"; the ~30-day key: "figure out if auto-update is better … that also does not depend on me")

- **What broke:** Betr shipped a new web app between 10-07 and 10-09 — lands on `/picks/home/lobby`, league boards only
  through a strip of league chips, lobby op renamed `getUpcomingLobbyEventsV2` (every sport mixed, featured players only);
  the league board is `LeagueUpcomingEvents {league}` → `getUpcomingEventsV2` (shape unchanged). Both 10-09 crons were
  also dropped by GitHub. First capture on the renamed API (38003010258) wrote 838 WNBA/CFB/UFC legs as the NBA board.
- **Fixed and proven, each by a run** (`nba/betr_harvest_cloud.py` 98cbdc6 … 158cfe0; detail in `BETR_BUILD_STATE.md`
  "2026-10-09"): league filter on the event's own league; the league chip pressed with a REAL mouse through CDP
  (`Input.dispatchMouseEvent` after the strip settles — a JS click does nothing on the RN-web Pressable, 38004204387);
  one detached navigation then everything in-page so every graphql body is readable (4 of 5 were lost while chromedriver
  was detached); unread bodies retried; geo prompt cleared again after the root reload (38006831834); request-side op /
  league logging and a full trail on every failure. **WNBA 38005105453: 728 legs / 21 players / 2 events (on-screen chip);
  EPL 38006445274: 5,011 legs / 277 players / 10 events (scrolled chip)** — both committed as `boards/betr_<league>_current.json`.
- **NBA today = Betr has not opened it.** NBA (38006042574) and the control CBB (38007354366, out of season, off-screen,
  beside NBA in the strip): the press lands on the leaf, the route stays on the lobby, the lobby lists no event of that
  league, authed API 200s (session alive). The run now says so (`NO <LEAGUE> BOARD: the '<LEAGUE>' league chip does not
  route …`, exit 3) and leaves the board file untouched; `boards/betr_nba_current.json` is an honest empty NBA board
  (964ba5d) — the mixed-sport capture never reached the DB (`board_snapshots` has no betr rows since 10-01).
- **The ~30-day key is now automatic:** the session's Keycloak tokens (access 30-day, OFFLINE refresh never expires)
  are refreshed by the harvester itself within 12 days of expiry (probe 38000165529 proved the headless refresh grant at
  `account.betr.app`, client `betr-rn`) and persisted to `nba_config.external_credentials` (`betr_session_state`,
  `betr_refresh_token`), read first on every run; the GitHub secret is only the seed. Current access token valid to
  10-28 → first automatic renewal on the first run after 10-16; nothing on the owner unless the log ever says
  `session: renewal failed`.
- **Schedule:** P3 dispatches the harvest at the window (`nba-p3-afternoon-light.yml`, `actions: write`); the two crons
  stay as backup; the workflow auto-switches WNBA → NBA on 10-20 UTC.
- **Residual (watch):** ~10 `ERR_CONNECTION_CLOSED` XHRs per run through the DataImpulse proxy (tracking / images; the
  board still arrives). `nba/TRIGGER_NBA_PROBE.txt` reset to `probe_price_shop_ledger.py` (1651bfa).
- **Proxy drops hardened (found by a run dispatched outside this session, 38007254948):** the first load was Chrome's own
  net-error page through the proxy, every later call dropped (zero 200s) and the app fell back to `/auth` — logged as an
  expired session although the session is valid to 10-28. Now: every navigation goes through `open_alive` (reloads while
  Chrome shows a net-error page); a run with no answered Betr traffic exits **4** (`the proxy carried no Betr traffic … the
  session was not the cause`); the workflow retries exit 4 once on a NEW sticky proxy session (per-run session ids). Exit 2
  is reserved for a real session failure, 3 for a league Betr has not opened. Regression: WNBA 38009480495 → 738 legs.

### PRIZEPICKS QUOTES — TEN DAYS BLIND, FIXED (2026-10-09; `PP_PAYOUT_FINDINGS.md` §0j)
- Found while probing the 10-20 in-app checks: since 2026-09-30 DataDome answered every `/game_types` quote from
  `pp_payout_map.py` (curl_cffi) with its captcha (every NBA / WNBA map file 09-30 → 10-09: 0 quotes). The 6-hourly runs
  stayed green because the board GET worked and the file was written — the payout map, the price-drift monitor and the
  per-leg price mining had no new data for ten days. **Not soft — fixed.**
- **Fix:** quotes from the web app's own page in a real Chrome (SeleniumBase UC + Xvfb + the residential proxy — the Betr
  chain): `BrowserQuoter` in `pp_payout_map.py` (a `Quoter` subclass: same records, budget, stop rules), default
  `PP_TRANSPORT=browser`; a DataDome block restarts Chrome on a new proxy session (new exit IP); minimal headers (the old
  `x-device-*` headers fail CORS preflight in a page). Workflow `nba-pp-payout-map.yml` gained the Chrome deps and the
  credential-store proxy (it still read only the secret). Image blocking was tried to save proxy traffic and reverted:
  DataDome challenged it (38010995054). **Production runs 38010541980 and 38011389251: 78 / 78 quotes 200 each, loaded.**
  New tools: `nba/probe_pp_quote_browser.py`, `.github/workflows/nba-browser-probe.yml` (real-Chrome probes, no commit).
- **Cost to watch:** a full-page Chrome session per 6-hourly map run is the second-heaviest proxy user after the Betr
  harvest — read in the first in-season week with the DataImpulse dashboard (the owner keeps the plan as is).

### THE 10-20 IN-APP CHECKS — PROBED (owner: "you can also probe the apps for everything")
- **PrizePicks 3-/4-Flex — CLOSED by PrizePicks' own quote engine:** 3-Flex 3.0 / 1.0, 4-Flex 6.0 / 1.5 (Power 3 = 6.0,
  4 = 10.0; 2-pick 3.0, Flex 2.0 / 0.5) — the mined tables the engines use, not the help centre's 2.25 / 1.25 and 5 / 1.5.
- ~~**Sleeper payout = product of multipliers — not answerable without an account:**~~ **SUPERSEDED the same evening:
  settled from our own MLB placed slips — see "RETRIES, CAPTURE TIMES, … SLEEPER" below.** the help centre states no formula
  (Player Picks Rules, Combo Contests: Max all-hit, Flex one miss at 3+ / two at 5+, minimum Flex 1.25×, voids regraded as
  if never included); probe 38008386302 found no payout rule in the public endpoints (`lines/available` 9,120 lines,
  `available_alt` 3,341, `promos` 8 — only per-option `payout_multiplier`) nor in the web bundles; entry quotes need a
  logged-in session. Sleeper stays a PAPER board (§31u): nothing is staked on it, so the rule is verified on the first real
  entry, not assumed.
- **Fliff NBA player props:** the 10-09 22:51Z board is still team markets only (426 legs: show-case, moneyline, spreads,
  totals); the archiver already counts and skips non-player legs — the first NBA player-prop board shows up in P3's log.

### RETRIES, CAPTURE TIMES, THE PRIZEPICKS QUOTE PATH, SLEEPER (owner 2026-10-09 18:58 PT: "all of them need the proper retry logic … find out how you did [PrizePicks] before and sharpen it … Sleeper: look at alternate sources … the boards at strategic times that match my slip-placing times and our system needs")

- **SLEEPER — SETTLED FROM OUR OWN RECORD (corrects the bullet above).** It was never an open question: the owner's MLB
  work verified it against app screenshots and 19 placed slips (2026-09-10) and it sits in the DB,
  `nba_config.classification_config['board_payout_conversion_rules']`: **slip multiplier = PRODUCT of the leg multipliers**
  (observed 2–8% slip-level haircut vs the plain product; model the plain product, conservative); per-leg
  `payout_multiplier = 1 + (decimal − 1) × 0.95`, verified exact. `MULTIPLIER_TABLES_MASTER.md` §5 adds the Flex rule
  verified the same way: **Flex = a round-robin over the (n−1)-pick sub-combinations, each priced with the same per-leg
  product** (3/3 Flex predicted 2.775× vs real 2.78×; 2/3 inside the predicted 0.884–0.963× range, real 0.92×). Outside
  sources agree and add nothing contrary: BettingUSA ("payout multipliers are cumulative"), OddsAssist (2-pick examples
  2.84× and 3.12× = products of ~1.69 and ~1.77 legs), Sleeper's help centre (Flex one miss at 3+, two at 5+, minimum
  1.25×, voids regraded as if never included). Nothing for 10-20.
- **PRIZEPICKS QUOTES — HOW IT WORKED, WHY IT STOPPED, WHAT NOW (probe 38015965386, `nba/probe_pp_quote_paths.py`).** 09-21 →
  09-29 the quotes came from curl_cffi `chrome146` + a session + one board GET warm-up + the proxy (`PP_PAYOUT_FINDINGS`
  §1) — chrome146 was then a current Chrome. On 10-09 the real Chrome on the runner is **154** and curl_cffi's newest
  fingerprint is **150**: DataDome refuses every curl path — 8 fingerprints through the proxy, 4 direct, 4 on the same
  sticky exit IP, and 6 hand-offs carrying a real Chrome's own cookies (all 403 captcha). The 09-21 recipe aged out with
  Chrome; nothing on our side broke it. **Sharpened:** `pp_payout_map.py` now picks the NEWEST curl_cffi Chrome fingerprints
  each run (no hard-coded list), spends ONE probe quote on the cheap path, and falls to the real-Chrome page context when
  DataDome walls it (`PP_TRANSPORT=auto`); the browser quote retries once after a page reload; the board fetch runs through
  the retry policy. When curl_cffi ships a current Chrome, the cheap path comes back by itself. Verified: run 38016455750
  (curl refused → browser, 78 / 78 quotes, loaded; conflict-safe push on attempt 2).
- **CAPTURE TIMES (traffic).** NBA boards are now captured only at the three scheduler-timed moments, all anchored to the
  day's first tip: **MORNING** (P2B, ≤ 08:05 PT — line-shading research, PrizePicks + Underdog), **WINDOW** (P3,
  min(13:15 PT, first tip − 30 min) — the decision board, every app, right before the slips are placed) and **CLOSE**
  (first tip − 25 min). Removed: the NBA half of the Sleeper / Underdog / Fliff two-hourly workflows (36 'routine' NBA pulls
  a day nothing reads; their scheduled runs are MLB-only now, MLB cadence unchanged — no MLB edit), both Betr crons
  (P3 dispatches the harvest at the window, label `window`; the harvest archives its own board, because P3 archived the
  PREVIOUS Betr file — the new one lands minutes after P3's archive step; P3's certifier no longer warns on Betr's file),
  and the PrizePicks payout map's every-6-hours (now 09:30 and 12:45 PDT / 08:30 and 11:45 PST, both before the window).
  Full-page Chrome sessions through the metered proxy: Betr 3 → 1 a day, PrizePicks map 4 → 2.
- **RETRY LOGIC — ONE POLICY (`nba/net_retry.py`).** Transient (connection errors, timeouts, 408/425/429/5xx, the 403 bot
  wall where the caller says so) retried with full-jitter exponential backoff and Retry-After; any other 4xx final at once;
  ordered egress per attempt (direct then proxy where that was the proven pattern); a wall-clock budget so retries fit the
  workflow `timeout` around them; credentials redacted from every message. The audit (subagent, 22 scripts with network
  calls) and what changed:
  - critical path: **ParlayAPI** (was one attempt; a failed capture also BLOCKED the re-run — the guard now reads
    `http_status`), **injury-report PDFs** (a transient error was read as "no filing" — now retried, unreachable URLs
    warned), **Underdog / Sleeper / Fliff** (one call could take 375–555 s against a 300 s cap — now a 90–120 s per-call
    budget; an Underdog core-lobby failure was written as an ok:true EMPTY board and archived — now the previous file is
    kept and the run fails), **PrizePicks board** (≈600 s of retries inside a 300/420 s wrapper; one bad page discarded the
    board — now a 270 s budget, jittered waits, each page retried);
  - P2A/P2B: stats.nba.com daily delta / per-game (2 → 4 attempts) / periods / schedule / matchups (429/5xx were retried
    with NO wait) and the morning Odds API (500 was final) — all on the policy;
  - P1 weekly: DARKO, Wikipedia officials, `commonallplayers`, per-team coaches (single-shot) retried;
    `build_defender_ratings` reads the matchup files from the checkout first (it fetched every shard remotely, once);
    P5's live ways-to-pick check retried;
  - Betr: a dead first load exits 4 at once; the workflow runs up to 3 attempts on fresh sticky proxy sessions for exit
    2 / 4 / a crash (exit 3 = league not open, not retried); the Keycloak refresh retries only when the token cannot have
    rotated (429 / 5xx / connection never opened); P3's dispatch of the harvest retries 3×;
  - workflows: the proxy lookup retries (3×) everywhere touched; every board / map / Betr commit goes through
    `nba/git_push_retry.sh` (the old loops died on the first rebase conflict, or ended on `sleep` and lost a push silently).
  - deliberately NOT blind-retried: the worker-load POSTs (P1 / P2A) — a timed-out load may still be running; a retry
    would start a second concurrent load. `verify_static_loads.py` re-invokes by data, which is the right retry there.
- **Verified live:** probe 38017235133 (`nba/probe_net_retry_live.py`) 5 / 5 — stats.nba.com schedule (4.8 MB) and
  team game logs (2,460 rows), the Odds API sports list, a real injury PDF (104 KB) and a missing one (final, no retry);
  board workflow 38016836957 (PrizePicks / Underdog / Sleeper / Fliff on the new code, all green); Betr 38017239197 and
  Sleeper (MLB-only scheduled path) 38017240877 green with the conflict-safe push.

### PRIZEPICKS CHEAP QUOTE PATH FOUND; SLEEPER REPLICATED TO NBA (owner 2026-10-09 20:04 PT: "The PrizePicks you still to try more, research online, use Gemini insight and you will find a way. As for the sleeper be sure that replicated to nba")
- **PrizePicks — primp.** Research (curl_cffi releases, a 2026 DataDome guide, Gemini 2.5 Pro: the datadome cookie is
  bound to the fingerprint that earned it) pointed at fingerprint currency, not cookies. Probe 38019790315
  (`nba/probe_pp_quote_cheap.py`, `nba-browser-probe.yml` now installs primp) echoed each client at tls.peet.ws on one
  exit IP: real Chrome 154 JA4 `t13d1517h2_8daaf6152771_cb7bf5808d99` = primp `chrome_153`; curl_cffi chrome150
  `t13d1516…`; curl with the real Chrome's JA3/H2/client hints copied in `t13d1512…` (cannot express the new extension).
  Quote POST: primp chrome_153 200 direct and 200 via the raw proxy; chrome_152 / safari_26 / firefox_147 200 direct; primp
  default chrome(147) and every curl variant 403. `pp_payout_map.py`: `PrimpQuoter` first in the ladder (primp → curl →
  real Chrome; newest primp Chrome target found at run time; runner IP first, raw proxy second; a bare 403 is a wall);
  `nba-pp-payout-map.yml` installs primp. **Certified: run 38020184454, `primp:chrome_153:direct`, 78 / 78 status 200 with
  tables, `new_rows=78` loaded, all 78 identical (picks and Power / Flex tables) to the two real-Chrome runs 021920Z and
  010104Z.** No browser, no metered proxy traffic.
- **Sleeper — replicated, one bug caught by the regression run.** DB tunable `classification_config['sleeper_payout']`,
  DB function `nba_market.sleeper_slip_payout()` (source `nba/sql/sleeper_slip_payout.sql`; seven test cases match the
  MLB placed slips), price-shop ledger prices a Sleeper leg at m × (1 − h)^½. The regression run 38019478623 FAILED: the
  tunable row had been stored as a JSON *string* (double-encoded insert), so the ledger crashed reading it and the DB
  function had silently used its 0.08 fallback. Fixed at the data (row is now a jsonb object; the function reads 0.08 from
  it — verified by query) and in code (the ledger decodes a string row instead of crashing). Re-run 38019824113 green
  (2026-04-10 replay, 240 ledger rows). **Not yet exercised with data:** the Sleeper NBA board archive starts 10-07
  (preseason, no engine slips), so the Sleeper column was 0 listed in the replay — **10-20 check: the first in-season
  window ledger shows Sleeper legs priced at m × 0.959.**

### PAYOUTS PROVEN APP BY APP — AND THE PRIZEPICKS FLEX GRADER FIXED (owner 2026-10-09 20:30 PT: "So now we have the proper PrizePicks and sleeper payouts up and running? Prove the other apps as well for the payouts, make sure everything is sharp. Season beginning is around the corner"; 20:32 Sleeper NBA board screenshot; 20:37 Underdog NBA Players-tab screenshots)
- **Sleeper — board capture proven against the owner's screen.** `boards/sleeper_nba_current.json` (02:25Z, `api.sleeper.app/lines/available`)
  vs the app at 03:31Z: LeBron PRA 31.5 1.83/1.73, Wembanyama 40.5 1.78/1.78, SGA 40.5 1.80/1.77, Brunson 35.5 1.72/1.85 —
  identical; Cunningham 39.5 MORE-only 1.72 = our one-sided leg (`under_multiplier` null); the 🔥 counters = `pick_stats.total`
  (SGA 493→497, Brunson 354→356 an hour later); Tatum moved 42.5 1.82/1.75 → 41.5 1.69/1.88 (Sleeper reprices live; overround
  ≈12.4%, as measured in §31aa). **Still owed:** the entry rule on NBA (Max / Combo payout from the leg multipliers) — no
  public quote endpoint; the owner was asked for three no-submit entry screens (cross-game 2-pick 3.257x product, 3-pick
  6.124x product, a 4-pick with a same-game pair).
- **Underdog — capture proven, tables proven, one entry check owed.** The scheduled NBA capture held 0 player legs off game
  days (the lobby's per-match lines answer only for TODAY's matches; history: player legs only while preseason games were on,
  up to 44 players on 10-08). Probe 38021327258/38021646701 (`nba/probe_ud_future_props.py`: the production scraper forced onto
  2026-10-20 with the full stat sweep): all nine screenshot legs captured with the right lines (Tatum/George/White Points,
  Rebounds, Assists; Points mains 1.87x = √3.5 × modifier 1.00 exactly). **What the app displays is Underdog's fantasy price**
  (`fantasy_decimal` = `display_decimal`, the fantasy American odds: George AST MORE −182 = 1.55, LESS +113 = 2.13; White −176 =
  1.57, +108 = 2.08 — exact). The payout modifier (`payout_multiplier`, two decimals) times √3.5 lands 0.01–0.02 off the
  display in both directions on alternate-priced picks. Tables re-verified at the source (help center "Pick'em Standard &
  Flex Entry Payouts", updated ~2 weeks ago): Standard 3.5/6.5/12/20/35/65/120, Flex 3.25/6/10/25/40/80, one loss
  1.09/1.4/2.5/2.6/2.75/3, two losses 0.25/0.5/1 — identical to `build_ud_slip_engine.STD/FLEX` (2–8 picks). **Owed:** one
  no-submit entry screen (George AST MORE 2.5 + Tatum PTS MORE 26.5: 2.87x = 3.5 × modifiers, our engine; 2.90x = product of
  the displayed prices) to settle which number an entry pays; the probe file stays as the check.
- **PrizePicks Power — proven out of sample.** The 48 MIXED live quotes of run 38020184454 (3–6 picks, 2–3 goblins/demons,
  factors from the same run's LEG quotes): `pp_slip_power` best estimate mean |error| 2.0% (worst +5.6% over, −7.9% under);
  `pp_slip_power_conservative` (what pricing uses) **never above the quote in 48/48** (closest 0.8% under, a 6-pick).
- 🔴 **PrizePicks FLEX with goblins / demons — the certified grader was wrong, now fixed.** `build_slip_engine.grade` paid
  FLEX[(n, hits)] × ∏(leg factors) on every Flex tier. PrizePicks' quotes (the 48 MIXED; all-demon probe 38021265189
  `nba/probe_pp_demon_flex.py`, 40/40 answered; the 2026-09 WNBA mining) show the **partial tiers nearly flat** in the factor
  product (3-Flex one miss ≈1.0x up to fp 3.4, 2.0x at fp 5.4, 3.5–3.75x at fp 11.7–13.1; 5-Flex one miss ≈2.0x up to fp 6.8,
  8.5x at 9.8, 15–17.5x at 22–25; two misses 0.4x up to fp 6.8) and the **all-hit tier above** FLEX × fp (5-Flex fp 5.43: 87x vs
  the grader's 42x). The grader overpaid the partial tiers 2–5x — and the demon strategies earned most of their certified
  payout there (B_demon_3flex 2024-25: 79% of payout from the one-miss tier).
  **Fix:** `nba_config.pp_slip_rules['flex_alt_tiers']` = per size and misses, the LOWER ENVELOPE of every quoted
  (factor product, payout) — 917 quote tiers + 22 probe points, interpolated in ln(fp), clamped at the ends; validated on its own
  quotes: mean model/quote 0.95, max 1.013 (3-decimal fp rounding). DB `nba_market.pp_flex_alt_payout()` + view
  `pp_flex_alt_segments` (`nba/sql/pp_flex_alt_payout.sql`; 190/190 identical); Python `build_slip_engine.flex_alt_payout` (the ONE
  grader for live, backtest, playoff unders, cross-checks); validator V3 null regrades with it; certifier L11 recomputes with it;
  `nba/regrade_pp_flex_alt.py` re-priced all six `slip_engine_slips*` tables (488,474 slips; old payout KEPT in
  `payout_grader_v1`) and now runs in P5 (step 3f) before certification; `nba/build_pp_flex_alt_tiers.py` rebuilds the envelope
  after every payout-map run (never shrinks the evidence). Power and all-standard Flex unchanged.
  **Effect on the live strategies (market-free twin, own cap, final week out; ROI before → after, 2024-25 / 2025-26):**
  B_demon_3flex +52 / +90 → **−16 / +31**; B_demon_5flex +70 / +204 → **−22 / +84**; A_wsteals_5flex +69 / +96 → +36 / +79;
  A_core_5flex (retired) +76 / +97 → +51 / +79; C_wstocks_4flex +55 / +79 → +31 / +66; A_wrebounds_4flex +49 / +93 → +38 / +88;
  every Power strategy unchanged. The A / C Flex strategies were overstated too — the "core" pool carries demon cells
  (threes_D1, assists_D1) — but stay positive in both seasons. PrizePicks' Playoff Unders slips are all-standard (unaffected).
  **Recertified — P5 run 38023098995 on the regraded tables:** certification **66 / 66 PASS** (L11 payout recompute on the new
  rule: 0 mismatches); verdicts vs 10-08: B_demon_5flex PASS (OOS +227%, lo +98%) → **not selected** (out of the validator's
  top 30); A_wsteals_5flex PASS (+86%, lo +47%) → **not selected**; A_core_5flex PASS +97% → PASS +79% (lo +33%; retired);
  R_stocks_4power FAIL −8% (rotation-only, its own state gate holds it). "Not selected" changes no state by design, so
  **B_demon_3flex and B_demon_5flex were set red / cap 0 by hand with the reason on the row** (weaker season negative on the
  real tiers — the both-seasons bar) — back only through P5's own path (validator PASS + live-season lower bound > 0).
  **Live hurdles recalibrated on the true payouts** (P4 mode=calibrate, `live_strategy_calib` 2026-10-10 04:27Z; hurdles read
  this table first): 95th-percentile drawdowns A_wsteals_5flex 89 → 148 units, B_demon_3flex 26 → 102, B_demon_5flex 131 → 451,
  C_wstocks_4flex 32 → 51, A_wrebounds_4flex 19 → 23 — the paper→live gate now judges against honest risk.
- **Fliff / Betr — measurement-only apps, proof deferred to their NBA boards.** Fliff = sportsbook pricing (per-leg American odds →
  decimal, a parlay multiplies); its NBA board is still team markets only. Betr publishes only "up to" totals by size (2 up to
  3x … 8 up to 300x, review sites); its per-tier multiplier (REGULAR / BOOSTED / EDGE …) is not in the capture yet
  (`BETR_BUILD_STATE` §8). Neither prices a placed slip; both are 10-20 checks (first NBA Betr harvest: capture the tier
  multiplier field; Fliff: first player props + one parlay screen).
