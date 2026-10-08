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

### Round-3 candidates (measured, deliberately deferred — each is a chained recertification, not a patch)
1. `board_outcomes` standard/alternate double count (P2B#18) — dedupe in every consumer and rebuild the chain.
2. The certified history's blended morning/window spread (P2B#5) — rebuild `nba_market_spreads_*` morning-only and re-run
   the baseline history.
3. `whole_number_nb` legs (P2A#6) — backtest the neighbour-priced class before it can be selected.
4. Underdog market-free twin (P3#4) for the paper engine's hurdles and edge reference.
5. Retire the market term from the certified scoring altogether (make market-free THE scoring) once the odds-feed decision
   is final — then the twin tables disappear.
