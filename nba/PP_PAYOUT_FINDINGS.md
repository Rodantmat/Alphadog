# PRIZEPICKS PAYOUT FINDINGS — NBA
*Recorded 2026-09-21. Separate from the 12 mandated documents; fold into `NBA_MULTIPLIERS.md` and
`NBA_GOBLIN_DEMON.md` when the documentation sweep reaches this session.*

---

## 0. 💾 STANDING TASK — DISK, MEASURED 2026-09-24
**State 2026-09-25 (end): 27 GB used (46 GB on 2026-09-24) — 19 GB returned, while holding MORE coverage
than at 46 (see §0e: reconstruction complete). Retention prune + board-scoped rebuild + `VACUUM FULL` on
`baseline_history` (2.85 GB), `final_hp` (1.77 GB) and `board_outcomes` (1.55 GB).**
**Earlier owner decision 2026-09-24: leave as is for now — superseded the same day by the retention rule
in §0c, which is what actually freed the space.**

**Already reclaimed (651 MB, no data loss, all verified before and after):**
- `nba_score.baseline_history_lookup` **415 MB** — a strict PREFIX of `baseline_history_lookup_idx`
  `(game_date, player_id, prop, line) INCLUDE (...)`, so every query it served the wider index serves.
  Dropped, and `load_baseline_history.py` no longer recreates it (it would have silently returned).
- `market.prizepicks_board_stage` **206 MB → 32 kB** — a bloated primary key on a table verified EMPTY
  by direct count before and after; REINDEX touches no rows.
- `_avail_logs`, `_starter_hist`, `_calib_sample` **28 MB** — derived working tables; the rebuild recipe
  is stored as a comment on `nba_score.starter_training`.

**Where the 46 GB actually is:** NBA **38.7 GB** (`nba_score` 26 GB — `baseline_history` 13 GB +
`final_hp` 11 GB; `nba_market` 12 GB — `board_snapshots` 6.6 GB) · MLB/legacy **7.5 GB** (`score` 2.2 GB,
`archive` 2.0 GB, `classification` 602 MB, `daily` 511 MB).

**The remaining levers, each needing an owner decision — NOT safe for a cleanup pass:**
1. **`board_snapshots` `close` label: 3.4 GB** (51.4% of the table; `window` is the other 48.6%). `window`
   is the decision moment and must stay. `close` is the closing-line record — deleting it costs CLV
   analysis permanently. Real tradeoff.
2. **MLB/legacy 7.5 GB** — every candidate checked holds real rows (`score.final_board_history` 272,549;
   `daily.game_status_stage` 169,260; both `metric_stage` tables ~215k each). MLB is live; not a
   unilateral call. ⚠ `T20-2` records that the existing storage-diet plan targets a database that has
   since MOVED, so that plan cannot be used as-is.
3. **`VACUUM FULL` needs headroom** — it rewrites the table, so it needs free space equal to the COMPACTED
   table and takes an exclusive lock. At 9 GB free on 2026-09-24 it was the wrong first move; once the
   prune had cut the tables it was the ONLY thing that returned space to the OS (a `DELETE` returns
   nothing). Run it against a table nothing is reading at that moment.
4. **Growth rate to watch:** `final_hp` is `2 × baseline_history` rows by construction (Over + Under on
   every rung), so anything that widens the ladder multiplies both. A third season adds ~12 GB.

---

## 0b. ⏰ SCHEDULE — TWO LIVE DECISIONS THAT SUPERSEDE `NBA_SYSTEM_DESIGN.md` §3 / §4 (2026-09-24)

*The spec is the authority; these are owner decisions taken after it was written, recorded here so the
next reader sees the divergence instead of "fixing" the code back to a stale target.*

**1. P2 runs in the MORNING, not at 01:00 PT.** §3 targets `daily 09:00 UTC = 01:00 PT`. That target is
what produced the empty `nba_ref.referee_assignments`: D1 assignments publish **~6–7 AM PT** and P2
scrapes them as a baseline-stage factor, so a 01:00 PT run reached the page five to six hours early,
every night, and wrote nothing. **Owner decision 2026-09-24: move the RUN TIME, not the logic.**
Live cron: **`45 15 * * *`** = 08:45 PT (PDT) / 07:45 PT (PST) — after the posting, finishing ~10:40 /
09:40 PT against P3's cutoff, ~3h of retry slack. Measured full-slate runtime 2h10m, ~1h55m after the
grader's rolling-window fix.

**2. P3 keeps the SPEC's cron.** §4: *"Target cron at season start: `15 21 * * *` = 1:15 PM PST (2:15
PDT, still 105 min before the earliest 4 PM PT tip)."* Live cron is exactly that.
⚠ I changed this twice before reading §4 — first to three crons (chasing the DST drift and ~38 early-tip
slates), then to `45 22 * * *` on §0z-7's *"after 2:30… slips around 3, 3:30"*. Both were wrong: §0z-7 is
the owner's operating pattern, §4 is the operational spec, and **the spec names the cron**. Reverted.

**3. Both crons are LIVE NOW, which §3/§4's "no cron yet" deliberately avoided.** Their stated reason was
*"a job failing nightly against an empty schedule trains everyone to ignore red builds."* That hazard is
closed rather than ignored: both pipelines are season-aware — P2 skips its slate steps and the three
refits when `nba_calendar.games` has no game, P3 skips scoring but still captures the board, and the
certifier judges nothing out of season. **Verified by real runs on 2026-09-23/24: green, "Pipeline
certified", not red.** Before the fix P2 died on a no-game day with `KeyError: 'GAME_DATE'`.

---

## 0d. 🔴 THE SHAPE-PARITY BREAK — P2 WOULD HAVE FAILED EVERY IN-SEASON NIGHT (found 2026-09-24)

**Symptom:** the 2026-04-10 replay, green on 2026-09-23, died twice on 2026-09-24 with
`KeyError: 'GAME_DATE'` at the certified recipe's first filter line — and then, once that was fixed, again
in the periods builder at its equivalent line.

**Cause (traced by reproducing the patcher's compiled source locally, not by guessing):** the season
backfill wrote `nba_team_game_log_advanced_<season>.json` in a SLIM shape without `GAME_DATE`; the recipe
merges `GAME_DATE` in from the team log. The daily delta sync (`nba_delta_team_game_log_advanced.json` →
season file, `synced_from_delta: true`) writes the FULL stats.nba.com shape, WITH `GAME_DATE`. The first
delta sync of the advanced file landed on 2026-09-24. From then on the concatenated `teams_adv` carried
its own `GAME_DATE`, the merge produced `GAME_DATE_x` / `GAME_DATE_y`, and every read of `GAME_DATE`
failed. **Verified by the file heads: 2023_24 and 2024_25 have no `GAME_DATE`; 2025_26 does.**

**This is §8's parity rule, violated at the shape level** — the daily object was not the same object as
the backfill. In season the delta syncs nightly, so P2 would have failed **every night from opening night**
and the certifier would have gone red after the mining succeeded.

**Fix:** normalise at the one point the shape matters — `teams_adv.drop(columns=["GAME_DATE"], errors="ignore")`
immediately before the merge, in both patchers (`build_baseline_ladder.py`, `build_periods_ladder.py`).
The merge supplies `GAME_DATE` from `teams` either way, so no number changes. Proven by compiling the
patched recipes locally (every anchor found) and by the replay building all singles pairs and combos.
⚠ My first attempt at the singles patch split one `rep()` into two and left the slate block dangling at
the patcher's module level; caught by reading the file back before any run used it. Read back what you
write.

---

## 0e. 🔴 TWO NAME NORMALISERS — 47 PLAYERS WERE NEVER SCORED, AND THE PRUNE DELETED THEIR LADDERS (2026-09-25)

**Found by the calibration diff that was meant to prove the prune lossless.** Post-prune rebuild vs the
`_calib_before_prune` snapshot: 2025-26 identical at every cell; **2024-25 down 4% of graded legs at
every as-of date**, spread evenly across bands and props (mean cell shift 0.006 log-odds, max 0.07).
Traced to the join: on 2025-01-15, 32 of 77 unmatched graded pairs were players who **do not resolve in
`nba_ref.player_name_map` at all** — Jaren Jackson Jr, Michael Porter Jr, Kelly Oubre Jr, Jaime Jaquez Jr…

**The defect, pre-existing:** `nba/nba_names.py::norm_name` STRIPS suffixes (`jarenjackson`) and its
docstring says every component "MUST import from here so the mapping cannot drift." The SQL-side joins in
`score_board_legs.py`, `build_final_hp.py`, `prune_baseline_to_board.py` and the delta's private
normaliser used an inline `regexp_replace` that KEPT the suffix (`jarenjacksonjr`). The map was built with
one, the joins used the other. **Result: 47 suffixed players (Jr, Sr, II, III) had zero scored legs in
either season** — invisible to scoring, tiers, `final_hp`, the availability delta and the paper log.
`board_scored` holds 0 rows for Jaren Jackson Jr on 2025-01-15 and 0 for Michael Porter Jr on 2026-04-10.

**Consequence of the prune:** its keys came from the SQL normaliser, so those players produced no keys,
and their full-game ladders for boarded props were deleted in BOTH seasons. Scoring lost nothing (they
were never scored); the calibration lost their legs (it matched them via the Python normaliser).

**Fixed forward, 2026-09-25:**
- `nba_ref.norm_name(text)` — a SQL function mirroring the Python one exactly (unaccent, lowercase, drop
  jr/sr/ii/iii/iv/v, letters only). Scorer, `final_hp`, prune and delta now use it. On the 2026-04-10
  PrizePicks board: 177 → **184 of 185 players resolve** (the last, "Carlton Carrington", is a nickname
  case for `NAME_OVERRIDES`).
- **The map itself was ambiguous**: 51 stripped names mapped to more than one id (father/son, historical
  namesakes; 9 on current boards) — a SQL join fanned out and a dict picked whichever came last. Fixed:
  one player per name, preferring the current roster, else the most recent career — 53 namesakes removed,
  0 ambiguous left; Jaren Jackson → the son, Jabari Smith → the son, Gary Payton → Payton II. The builder
  (`check_baseline_board_coverage.py`) now applies the same rule.

**RECONSTRUCTION COMPLETE AND PROVEN (2026-09-25).** Owner decision: "all boards need coverage; the
products can be reconstructed at any time; the ingredients — the factors, and above all the boards and
market data — can never be lost." And, on the first attempt: "why rebuild everything just to clean it
again? Do it already scoped." Both governed what follows.

- **The board, materialised once:** `nba_market.board_rung_keys` — every (date, player_id, prop, period,
  line) a REAL board (any app, any label) or a DERIVED board carried, resolved through the one normaliser
  by `nba_market.refresh_board_rung_keys(d1, d2)`. **4,522,732 rungs across 379 dates.** The history
  loader, the prune and `build_final_hp` read it; P3 refreshes the day's keys after archiving.
- **The history loader loads BOARD-SCOPED directly** (`HISTORY_SCOPE=board`, the default) — the
  retention rule at load time, no full spectrum written to be deleted — and bulk-loads via COPY: a prop
  pair went from ~1 hour (row-by-row) to minutes. Two GitHub facts learned: editing a workflow does NOT
  cancel a running job; a concurrency group holds ONE pending run, a third dispatch cancels it.
- **Name coverage: 561 of 561 board names across both seasons resolve** (old normaliser: 516).
- **Baseline rebuilt:** 21 of 21 full-game props per season, **8,696,305 rows, 325 dates, 0 duplicate
  keys**; period ladders kept (never derived). Deleted players verified back by name: Jaren Jackson Jr.
  1,406 points rungs / 73 dates, Michael Porter Jr. 1,468 / 77, Oubre, Jabari Smith, Carrington.
  `VACUUM FULL` → **2.85 GB**.
- **`final_hp` rebuilt from the key table:** 2024-25 **3,399,146** rows (was 3,220,682), 2025-26
  **3,811,766** (was 3,557,150) — the increases are the recovered players' legs. `VACUUM FULL` →
  **1.77 GB**, 7,210,912 rows.
- **Database: 27 GB** (46 GB two days ago) — holding MORE coverage than it did at 46.
- **Ingredients verified untouched** at every step: boards, market lines, injury, officials, starter
  status, defender ratings, `prop_universe`.

**THE PROOF — calibration rebuilt on the reconstructed stores, diffed against `_calib_before_prune`:**

| Season | Cells | New / dropped | Graded legs before → after | Identical shifts |
|---|---|---|---|---|
| 2024-25 | 9,208 | 0 / 0 | 29,249,875 → **29,249,875 (0.00%)** | **9,208 / 9,208** |
| 2025-26 | 16,754 | 0 / 0 | 58,644,310 → **60,510,300 (+3.18%)** | 7,658 |

**2024-25 is restored bit-for-bit** — every cell carries exactly its pre-prune shift on exactly the same
legs: the deleted ladders came back and the calibration cannot tell anything happened. **2025-26 came
back better**: its "before" was already missing the suffixed and nicknamed players (fit on the first
board-scoped `final_hp`, built with the broken normaliser); they are in now — 3.18% more graded legs than
the calibration ever had. The name-map defect is repaired in the calibration itself, not only forward.
`baseline_ladder` is dropped; `baseline_history` is the one store.

---

## 0f. ✅ LEDGER CLOSURES, 2026-09-25 — each verified, none by reading alone

| Item | Verdict | Evidence |
|---|---|---|
| **F6-1** loader key omits `ot_rule` | ✅ closed, **verified with data** | the 2026-04-10 artifact has 124,942 rows, the loader wrote 118,759: the 6,183 difference is **6,183 groups of identical duplicates** (rungs clamped onto the same 0.5–4.5 line; `p_more`, `p_less`, `anchor` equal in every group). Nothing is lost by the collapse. |
| **T20-17** silent injury-shard loss in the delta | ✅ **fixed** | `build_availability_delta.py` no longer fetches shards from the raw CDN with `except: pass`; it reads `nba_daily.injury_report_snapshots` for the date — the same table P3 loads before the step (`INJURY_LOAD_MODE=current`). A missing day is now "no injury rows", never a silent shrink. Verified by a P3 replay: `wrote 800 overrides (0 now-OUT, 800 reallocated teammates)`. |
| *(found with T20-17)* stale CDN | ✅ fixed | the raw CDN caches; the day-of report P3 had committed minutes earlier could be served stale. Postgres is the source now. |
| *(found with T20-17)* `DELTA_SEASON` defaulted to `"2025-26"` and P3 never sets it | ✅ fixed | **the one hardcoded season the rollover fix did not reach**: on opening night the delta would have read last season's index, found no rows, printed "no delta" and exited 0 — silently, every day. Now `active_stats_season()`; the baseline read is keyed by date alone. |
| *(found with T20-17)* player logs fetched from the raw CDN by season file | ✅ fixed | `nba_player_game_log_2026_27.json` does not exist before the first game — a 404 and a crash on opening night; and a player's last team before the first games is in LAST season's log. Now `nba_stats.player_game_log`, all seasons, a 400-day window back from the slate. |
| **T20-13** certifier red for the first twelve nights | ✅ closed, **by measurement** | its "22 October props vs 30" counted period rows as props. With `period = 'FULL'` separated the count is **21 on every date including opening night 2025-10-21**; the rewritten certifier gates at `>= 20` FULL props. |
| *(new)* the daily object was poorer than the backfill | ✅ fixed | `build_baseline_history.py` emitted `proj_min` / `rate36` (0% NULL in the store); `build_baseline_ladder.py` did not, so every in-season row would have loaded NULL — the delta's reallocation NaN-dropped on every leg and the confidence refit's components went silent. The production patcher now carries both, same `rep()` as the history patcher; validated by compiling the patched recipe. |
| **T20-13/T20-6 corollary** — `DROPPED N rows with NaN probabilities` in the delta | ⚠ explained | combos have no `proj_min` by construction (100% NULL), so their reallocation cannot be re-derived and they keep the baseline. Correct fallback; the "should be 0" message is over-strict for combos. |

**THE COMBINED REHEARSAL (mining ON + a real slate, first ever, 2026-09-25) — failed once, fixed, then green through `final_hp`:**

| Found | Fixed |
|---|---|
| `load_baseline_ladder.py` still ran a post-load diagnostic against the dropped `baseline_ladder` — crash after the commit | diagnostic reads the one store |
| the loader fetched the merged artifact **over the raw CDN seconds after committing it** (the workflow comment says so by design) and 404'd on its own file | reads the runner's disk first; the legacy `_combos`/`_periods` fetches that only produced 404 noise are gone |
| second run: mining → build (with components) → local load → calibration → confidence → `final_hp` **29,966** board-scoped rows. Daily singles now carry `proj_min`/`rate36` (28,088 rungs, 0 NULL), combos NULL by construction — **exact parity with the backfill** | slate then pruned to board scope (79,437 → 43,824, periods kept) |

**OPENING-MORNING SEASON LOGIC, followed through every consumer (2026-09-25):**
- `active_stats_season()` rolled over by **calendar month** (from Oct 1). First game is Oct 20; P1 runs Mondays Oct 5/12/19 → three scrapes of an EMPTY season, and the function's own docstring warns that could overwrite last season's profiles. Now rolls over on the **day after the first regular-season game** from the schedule file (`<=`, because on opening MORNING no game has been played and P2 runs at 08:45 PT). Tested: Oct 1–19 → 2025-26, Oct 20 → 2025-26, Oct 21 → 2026-27; no-file fallback unchanged.
- **Scorer** labels `board_scored.season` by the slate's date (`current_season(date)`), not by "which season has data" — otherwise Oct 20 legs pooled into 2025-26's calibration cells.
- **`final_hp`** with a slate date uses the slate's season — otherwise it read `season='2025-26' AND game_date=2026-10-20`, found nothing, and the certifier went red on night one.
- Verified: the certified recipe reads only per-season files (player/team/advanced logs, market spreads, four factors, team scoring); the four-factors and scoring files ARE delta-synced, so the new season's appear when the delta rolls over. The profile tables (#9) are a research-parity item, not production.

**PERIOD PROPS — researched, then wired (2026-09-25).** PrizePicks posts NBA period lines: "First Quarter Points" (rotoballer, Nov 2023), "1H PRA" (Feb–Mar 2023); its API spells the stat with a prefix — `"1H Points"`, `"1H 3-Pointers Made"` — and calls fantasy `"Fantasy Points"` and free throws `"FT Made"` (published projections sample); third-party market maps list PrizePicks 1Q points and 1Q assists. Before this pass a period leg could not score: the archiver had no mapping, the scorer's vocabulary pointed at prop names (`points_q1`) that don't exist in the store, and the scorer joined `period = 'FULL'` only. Now: `pp_market_key()` handles the prefixes and the API's spellings; `MARKET_TO_PROP` (and the SQL key function, kept in step by hand) carry the full period set for the four period props plus the DERIVED props (FTM, FGA, FGM, FTA, 3PA, OREB, DREB, personal fouls) — **every prop the baseline carries now has a board key**; the scorer splits `points_q1` → (`points`, `Q1`) and joins on base prop + period, interpolating within the period ladder. Unit-tested end to end: 12 of 13 PrizePicks stat forms resolve; **period COMBOS ("1H Pts+Rebs+Asts") have no ladder and stay loudly unmapped** — the one known limit.
⚠ My first PrizePicks map sent fantasy to `player_fantasy_score`; the scorer expects `player_fantasy_points`. Corrected.

**A5 — CLOSED AT THE LEG-LEVEL GATE (2026-09-25), the re-test the 2026-09-13 lesson owed it.** Variant E
added to `test_factors_on_baseline.py`: the fitted P(start) (`nba_score.p_start`, Brier 0.0703 OOS)
applied through the only channel a lineup acts on — minutes, `E[min] = p·(own as-of minutes when
starting) + (1−p)·(when not)`, relative to the allocator's recent-10 — on the same yardstick as every
other variant, held out in time. **7,128 real PrizePicks legs: anchor 0.7260 · anchor × A5 0.7441
(−0.0180, worse) · anchor × A2 0.9704.** The documented reasoning holds: recent minutes already encode
starting. Rows written to `nba_score.factor_gate_results` (`anchor_x_A5_pstart_minutes`). Feature table
`nba_score.a5_feature` (26,543 player-games, P(start) 0.4695 vs actual 0.4631) kept for the record.
Nothing is wired; nothing should be.

**GRADER COMPLETED (2026-09-25/26).** `grade_board_outcomes.py` graded 12 markets; everything else —
fantasy, the derived props, every period market — was `no_stat`: scored by P3, never graded, never in
the calibration or the paper log. Now: the full stat set; fantasy from the official `NBA_FANTASY_PTS`
field (the NBA's 2017 standard PrizePicks uses — PTS 1, REB 1.2, AST 1.5, STL 3, BLK 3, TOV −1; formula
as fallback only); period box scores from the quarter logs P2 mines daily (H1 = Q1+Q2, H2 = Q3+Q4), a
missing period row grading as `no_stat` visibly; and every file read LOCAL-FIRST — the grader fetched
the season log from the raw CDN by season file, the same defect as the delta (stale cache; 404 on Oct
21 minutes after the delta created the new season's file). Tested offline on the real logs: Jaren
Jackson Jr 2026-01-15 = 30 PTS, H1 23 + H2 7, Q1 8, fantasy 43.1, FTM 3. **Every market the scorer can
score, the grader can grade.**
⚠ ~~**The one period boundary left:**~~ ✅ **CLOSED 2026-09-26, no schema change.** `build_final_hp.py`
reads the key table for every period and writes period rungs under the SUFFIXED prop label
(`points_q1`, `rebounds_h1` …) — the same label the scorer writes to `board_scored` and the calibration
groups by; the unique index keeps them apart from full-game rungs, and every downstream lookup
(calibration cell, confidence group) is a `.get` with a fallback. Period legs get calibration cells the
moment they have graded volume. Historical boards carry no period keys, so nothing changes in the store
until the first live slate with period lines.
🔑 **Found while tracing it — the calibration was learning from a PARTIAL board.** P2 builds today's
`final_hp` at 08:45 PT from the boards known then; everything posted later (the day-of board P3 captures
at 13:15, late lines) never entered that date's `final_hp`, and the as-of calibration and confidence
refits learn ONLY from `final_hp`. P2 now rebuilds YESTERDAY's `final_hp` from the complete board — after
the prune step has refreshed yesterday's keys and kept every board rung, before the refits (seconds for
one slate; off days exit cleanly). From now on the refits see the whole graded board.
⚠ Reliability audit re-run: ~~dispatched twice...~~ **DONE 2026-09-26, and the failure explained without a
log:** the original script closed its connection right after the grading loop (it only printed
afterwards); my write ran on a closed connection — two hours of grading, then a crash on the last line.
Fixed; the script now also records a heartbeat (`prop_reliability_audit_progress`) so its position is
visible from the database. Written: `classification_config['prop_reliability_audit_latest']`, 21 props,
**penalties derived by the script** (fantasy_score: ECE 3.8916 − certified median 0.8307 = **3.061 pp**;
the arithmetic is on the row). **F6-3 closed by construction.**
🔑 **And the numbers moved for a reason worth stating.** The 2026-09-13 audit ran on the FULL ladder,
where the tails — rungs far from the anchor, "predict 0.98, hit 0.98" — dominate the n-weighted ECE and
flatter every prop. Measured on the BOARD-SCOPED store, i.e. the rungs the boards actually offer,
concentrated where calibration is hardest: **five props certify** (personal_fouls 0.18, threes_made
0.57, rebounds 0.83, points 1.25, reb_ast 1.64 pp); **fantasy_score 3.89 pp, turnovers 4.40 pp with
NEGATIVE lift over the base rate (−0.37%)**; stocks' worst band 15.5 pp. This is the raw baseline before
the as-of calibration shift (as designed); it is the honest population for the slip engine's policy when
that work resumes, and a pointer for the calibration work: the mid-band is where the model is tested.
**Reconciled against the day-of record before trusting it (2026-09-26):** `board_scored.baseline_hp`
equals the store's `p_more` on **1,391 of 1,391** exact legs of a backfill date (to four decimals), and the
grader's verdict equals the box score on **592 of 592** — probabilities and outcomes are one record. A
first cross-check that joined day-of legs to outcomes BY NAME through `board_outcomes` gave 5.7 pp; joined
to the box score directly it gives 1.2–3.5 pp per app, so the name join was pairing rows wrongly — the
direct join is the authoritative one, and the audit's store reading stands.
🔑 **The PrizePicks-scoped number is the one the product lives on:** points, 2025-26, 101,049 PrizePicks
legs — **raw baseline ECE 3.46 pp; after the as-of calibration shift (`final_hp`) 1.85 pp**, signed bias
−1.4 pp (overs land more often than the baseline says). The calibration layer measurably works on the
product's own population, and the reliability audit — book-agnostic by design, every book's alternates
blended — understates PrizePicks' miscalibration (1.13 pp store-wide vs 3.46 on PrizePicks). When the
slip policy resumes, the audit should be run PrizePicks-scoped. ⚠ `tier`/`kind` are NULL on the 2025-26
replay records, so the goblin/demon split is not measurable from `board_scored` yet.
📌 Checked before building anything on it: `nba_score.tier_band_calibration` (149 rows) is a research
table from the 2026-09-13 work; `NBA_BASELINE_CALIBRATION.md` §T16.3 measured per-tier splitting as
**harmful**, and the applied layer is phase × band (`ladder_calibration_asof`), which the scorer reads.
Nothing to wire. Also verified in code: the certifier treats a preseason day as "nothing was due"
(implemented 2026-09-24), so October 3 — board captured, nothing built or scored — certifies green.

**PROFILE TABLES — INGREDIENTS THAT WERE BEING OVERWRITTEN WEEKLY (closed 2026-09-26, ledger #9).**
Six profile tables are single-snapshot, no season, no as-of: `player_impact_rating` (DARKO),
`player_playtype_profile`, `player_shot_quality`, `player_shot_quality_delta`, `player_shot_zone_profile`,
`player_tracking_detail`. Every Monday's writer workers REWROTE them — last week's profiles were gone,
and the first run after opening night would have replaced a full season's profiles with a week of
samples. Under the retention rule these are ingredients. Fix without touching the six workers: P1 now
copies each into `<table>_asof` stamped with the date BEFORE the loads (idempotent per date). Seeded
today with the complete 2025-26 profiles: 530 / 3,282 / 2,285 / 582 / 4,656 / 4,652 rows. The certified
recipe reads none of these (verified: per-season files only), so this is research parity, now kept.
Also: `BS_APPS`, documented in the scorer's header since its first version and never read, now
filters (blank = every app, the production default).

**THE THREE DECISION ITEMS, WITH DATA (2026-09-25):**
- **T18-17 — the score's penalising half.** Re-measured on the rebuilt, board-scoped `final_hp`: both
  seasons, **minimum confidence 0.8600, zero legs ≤ 0.85**, p25 ≈ 0.94, median ≈ 0.95. The `drop` term
  is dead by construction. The owner's directive on file — *"the score must ENHANCE the hit
  probability — no kill good legs"* — is option (b): keep `CONF_NEUTRAL = 0.85`, one-sided enhancer.
  **Recommendation: (b).** The formula is not changed here; the record is that the code carries a
  two-sided rule the data never exercises, and that this is the designed outcome.
- **F6-3 — the fantasy_score penalty (0.3 vs derived 0.21).** Root cause found: `score_prop_reliability.py`
  only PRINTS; the 2026-09-13 numbers were copied into `nba_config` by hand. A derived penalty that is
  transcribed is declared. Also found: the audit read `baseline_history` with NO period filter, so Q1/H1
  rungs of points/rebounds/assists/threes were graded against full-game box scores inside those props'
  ECE (the same defect class the scorer and `final_hp` had). Both fixed: full-game rungs only, and the
  script now WRITES its table to `classification_config['prop_reliability_audit_latest']` (maintenance
  task `reliability`). Consumer check: **neither the confidence model nor the scorer reads a penalty** —
  the audit's penalties are a SLIP-ENGINE policy (its `engine_rules` are slip rules), on hold. So F6-3
  changed nothing in production; the machine record is now the source when slips resume.
- **T20-12 — fixed `-05:00` / `-08:00`.** Verified the ledger's arithmetic: the archive labels ET wall
  time with a fixed `-05:00`; the delta's cutoffs were a fixed `-08:00`; in daylight time both UTC
  instants are an hour late BY THE SAME HOUR, so every before/after decision was correct year-round.
  Fixing one side alone breaks the window (the 3:30 PM ET report falls after a true 1:15 PM PT cutoff);
  fixing both means re-stamping every historical row of an ingredient table for a defect with no
  behavioural effect. **Closed by pinning the pairing**: the delta's cutoffs are now written in the
  archive's convention from one constant (16:15 ET wall = 13:15 PT; 04:00 = 01:00 PT), proven identical
  in UTC to the old values; both files document the pair and the rule "do both or neither". ⚠ Standing
  trap recorded: `snapshot_ts` must never be compared with a real clock (board `fetched_at` is true UTC)
  without converting; nothing does today.

---

## 0c. 📐 RETENTION — THE OWNER'S RULE, AND HOW IT IS ENFORCED (2026-09-24)


**The rule, in the owner's words:** *"One set of data per day. It cannot grow on the day. If it needs to
be rerun, we overwrite it. Whatever shows on the board, the full ladder, all variations, all directions,
all prop lines, everything, we save. If a player shows one single leg, we save one single leg. Factors,
boards and markets we save every day; a rerun is an update, not a second set."*

**What is true after this session, verified in the data:**

| Store | Rule | Enforced by |
|---|---|---|
| `nba_score.baseline_history` — **the ONE baseline store** | day-of: **full spectrum** (the board is not known when it is built; its width is the lookup range — 89% exact rung hits). After grading: **pruned to exactly the rungs a board offered** — real boards (every app, every label) OR derived boards (the simulated fantasy / derived legs in `prop_universe`). Nothing extra. | `load_baseline_ladder.py` deletes the slate by date and rewrites (a rerun replaces); P2 step "Prune yesterday's baseline to the board" → `prune_baseline_to_board.py` |
| `nba_score.final_hp` | **board-scoped**, same key set as the prune (the scoring engine is board-scoped by design, §4). It was rebuilt full-spectrum on 2026-09-24 by mistake — 226,714 rows a slate, 6.4% on a PrizePicks board — and rebuilt again board-scoped. | `build_final_hp.py` `_fe_board_keys` |
| `nba_score.board_scored` | one build per slate; a rerun overwrites (unique index). Carries `baseline_hp`, `cal_shift`, `final_hp`, `confidence`, `score`, `edge` per board leg — the "final scoring engine set". | upsert; and the scorer **refuses to re-score a pruned slate** (`baseline_prune_log`) because re-interpolation from far-apart board rungs would degrade ~11% of legs |
| `nba_market.board_snapshots` | every day, `window` + `close` labels — the variations model, same as MLB | by design |
| factors (injury, referees, market lines, lineups, static profiles) | every day; reruns update | existing loaders |

**Why pruning is safe — checked, not assumed:** the certified recipe and the production patcher hold
**zero** references to `baseline_history`, `baseline_ladder` or `final_hp` and open **no database
connection**; each day's ladder is built from logs, splits and factor files. The as-of calibration and
the confidence refit join from **graded board legs** only. Interpolation happens day-of and is recorded
in `board_scored`. So after a slate is graded, an off-board rung has no reader.

**What the historical prune deletes, stated plainly (probe on 2026-04-10):** 113,357 rows → 13,625 kept
(12.0%). Standard props 49,816 → 11,390 (real boards, twelve books); fantasy + derived 35,946 → 2,235
(derived boards); **period props 27,595 → 0** — no board of any kind ever carried period lines
historically, so under the rule they go. The daily periods build continues; going forward the live
PrizePicks board carries fantasy, alternates and any period lines it posts, so the asymmetry is
historical only. **The full-spectrum `final_hp` was a mistake, not a design.**

**Guards in the prune:** dry run by default; refuses when board keys match ZERO baseline rows (a
convention mismatch, never an empty board — deleting on it would wipe the slate); exits green on a
no-game day or a day with no baseline (preseason); fails loud when regular-season games were played but
no board was archived. Season mode runs ONE DATE PER TRANSACTION with a commit and a log line each —
the first attempt ran as one 5.35M-row transaction, I/O-bound for over an hour with nothing to show,
and was cancelled (clean rollback) in favour of this.

**EXECUTED 2026-09-24/25 — the numbers, verified by data at each step:**

| Step | Result |
|---|---|
| Single-slate test, 2026-04-10 | full-game props with a board 77,585 → 16,253; period props 41,174 → 41,174 untouched; `board_scored` unchanged (51,003); replay re-score REFUSED, P3 still 7/7 |
| Dry run 2025-26 | 9,706,081 rows → keep 1,777,677 on a board + 2,577,674 never-derived; delete 5,350,730 (55.1%) |
| Dry run 2024-25 | 9,537,535 rows → keep 1,586,759 + 2,557,443; delete 5,393,333 (56.5%) |
| **Executed, both seasons** | **325 of 325 slates, 10,805,395 rows deleted** — the dry runs plus the single-slate test, to the row. 2,187,222 period rungs kept in 2025-26 alone. |
| `baseline_history` after `VACUUM FULL` | **12 GB → 2.8 GB**, 8,543,355 rows |
| `board_outcomes` after `VACUUM FULL` | 2.5 GB → 1.55 GB, 6,905,452 rows (index bloat) |
| **Database** | **46 GB → 36 GB** |

⚠ **A `DELETE` returns nothing to disk.** PostgreSQL marks rows dead; autovacuum makes the space
reusable inside the table; only a rewrite (`VACUUM FULL`) hands it back to the OS. After the prune the
database still read 46 GB until the rewrites ran. A rewrite needs free space equal to the COMPACTED
table, takes an exclusive lock for its duration, and must not run against a table another job is
reading at that moment.

**Still to do (2026-09-25):** `final_hp` is being rebuilt board-scoped WITH the derived boards for both
seasons (2025-26 in progress, 2024-25 queued); then one `VACUUM FULL nba_score.final_hp` (11 GB →
~2–3 GB expected, database to ~27–28 GB); then rebuild the as-of calibration and diff it against
`nba_score._calib_before_prune` (25,962 cells snapshotted 2026-09-25 01:16 UTC) — the direct proof that
nothing the engine learns from was lost.

**One mistake on record:** the first single-slate execution ran with the PRE-correction rule (period
props deleted) because the earlier dispatch was not replaced as I assumed — it deleted 2026-04-10's
27,595 period rungs. The P2 replay rewrote that slate in full and the corrected prune then kept every
one of them. Never assume a queued run was replaced; read the run log.

**The two baseline tables are gone as a concept.** `baseline_ladder` (4 slates) is no longer written;
`baseline_history` is history and live in one table with one convention: full-game rungs carry
`period = 'FULL'` (verified across both seasons - an earlier claim of NULL in this session was wrong and
was reverted before any row was written).



---

Every claim is tagged **VERIFIED** (measured against PrizePicks directly) or **PARTIAL** (pattern seen,
rule not yet pinned down). Raw data: `nba/data/pp_payouts/*.json`.

---

## 1. ACCESS — how the multiplier is reached

**The price lives in `POST https://api.prizepicks.com/game_types`** — a quote for an exact combination,
fired by the app when a second leg is added. **Nothing is placed.** VERIFIED 2026-09-20 (owner capture).

```json
{"new_wager": {"amount_bet_cents": 2000,
               "picks": [{"wager_type": "over", "projection_id": "…"}, …],
               "pick_protection": false},
 "game_mode": "prizepools"}
```

**It is reachable server-side, anonymously.** VERIFIED probe 4, 2026-09-21.
| Setting | Requirement |
|---|---|
| Fingerprint | `curl_cffi` **chrome146** — chrome124 and chrome136 were captcha'd |
| User-Agent | **never set manually** — curl_cffi supplies one consistent with its own TLS |
| Session | a `Session`, so the `datadome` cookie carries across calls |
| Warm-up | one board GET first; even when that GET is blocked it earns the cookie |
| Egress | `PROXY_URL` |

**PrizePicks issues its own anonymous `_prizepicks_session` + `CSRF-TOKEN`** — no owner account is ever
involved.

**Board source:** `api.prizepicks.com/projections` returns 403 from the runner;
**`partner-api.prizepicks.com/projections` serves it.**

**There is no single-leg price.** A 1-pick quote returns **422 — "Must have at least 2 predictions for a
valid pricing lineup."** VERIFIED probe 5, 2026-09-21. So the per-leg multiplier is mined as a 2-pick
against a standard partner: `factor = payout / 3`, **de-compressed first** when the payout exceeds ~9.1×.

**PrizePicks' per-leg pricing reconstructs as a symmetric normal tail around the standard line**, with a
spread specific to each player-stat: the implied sigma is consistent within a ladder to a median CV of
**0.11** (32 ladders), with **no systematic skew** (demon side wider in 14 of 28; median ratio 1.00). Floor
goblins must be excluded — their price is clamped, not a probability. **Mining is exact and this is not**,
so mining is the method; the reconstruction is for sanity checks.

**Tooling:** `nba/pp_payout_map.py` · workflow `.github/workflows/nba-pp-payout-map.yml` · trigger
`nba/TRIGGER_NBA_PP_MAP.txt` (`max_quotes: N`, `altalt: N`) · output
`nba/data/pp_payouts/pp_payout_map_<utc>.json`.

### Why probes 1–3 failed
- **Probe 3 sent a Chrome 139 User-Agent on a Chrome 124 TLS handshake.** The mismatch is a primary
  DataDome bot signal. The working board scraper is consistent (TLS 124 + UA 124).
- No session, so no `datadome` cookie was ever carried.
- No warm-up.
- Probes 1–2 guessed GET endpoint names; the real price is a POST carrying the legs.

---

## 2. RESPONSE STRUCTURE — VERIFIED

```
payouts      : { "<n_picks>": { "<n_correct>": multiplier }, "is_adjusted": bool }
payouts_srp  : the REVERSION schedule — what the slip pays if legs are voided
```

**`payouts_srp` is void handling.** An n-pick slip carries n−1 arrays: the payout after one void, two
voids, and so on. Each inner triple is `[all remaining hit, one miss, two miss]`, which is why Flex rows
carry partials such as `[3, 1, 0]`. This is the DNP re-pricing any slip backtest must model — now taken
straight from PrizePicks.

The app banner *"Reversion lineup payouts are different than standard"* refers to this.

---

## 3. POWER PLAY — VERIFIED

**Base payouts (prizepools mode):** 2-pick **3.0×** · 3-pick **6.0×** · 4-pick **10.0×**.
The 3-pick base of 6× was confirmed on fresh standard legs; it is not a priced leg.

**Each leg is priced by its line, not by its rung.** Demon +2 ranges 5.25×–7.5× across players and
stats; goblin −1 ranges 2.2×–2.8×. The further a line sits from standard, the larger the adjustment.

**Flat 25% edge against PrizePicks' own probability.** Power expected value across 177 two-pick slips:
**0.748, standard deviation 0.012.**

**PrizePicks' implied probability for any leg:**
```
p = 1.5 / (that leg's 2-pick payout paired with a standard)
```
Compare this with the model's own probability — where ours exceeds theirs by enough to clear the edge
is where value lives.

**Multiplicative and partner-independent.** Wembanyama 11.5 Reb demon quoted 3.25× against two
different standard partners.

**Longshot compression above ~9×:**
```
payout = product                          for product ≤ 9.1
payout = 9.1 × (product / 9.1) ^ 0.857    for product > 9.1
```
Fitted on 20 alt×alt pairs, then **confirmed out of sample** on three pairs never quoted together:

| Pair | Raw product | Predicted | Actual |
|---|---|---|---|
| SGA Double-Double 0.5 D + Brunson Points 29.5 D | 14.25× | 13.25× | **13.5×** |
| Wembanyama Blocks 4.5 D + LeBron Rebounds 9.5 D | 17.25× | 15.75× | **15.5×** |
| Cunningham PRA 49.5 D + Wembanyama Assists 5.5 D | 26.0× | 22.5× | **22.5×** |

**Consequence:** a naive multiplicative model overstates demon-stack payouts — by ~13% at 20×.

**Goblin floor.** Every deepest goblin priced at **2.1×** regardless of depth (17%–24% below standard).
The floor is **per goblin and multiplies**: two floor goblins paid **1.4×**, not 2.1×. That result also
places each floor goblin's true value just under 2.086, displayed as 2.1.

**Rounding:** 0.1 steps below 3×, 0.25 steps at and above.

### Confirmation record (owner's screen)
| Slip | Predicted | Actual |
|---|---|---|
| Tatum P+R goblin 34.5 + Wemby P+R goblin 34.5 | 2.3× | **2.3×** |
| Wemby Reb demon 11.5 + Brunson Points demon 29.5 | 4.5× (4.25–5.0) | **4.75×** |
| Brunson Points goblin 24.5 + Tatum PRA demon 44.5 | 3.25× | **3.25×** |

---

## 4. FLEX PLAY — MECHANISM VERIFIED, TIER RULE PARTIAL
*Updated 2026-09-21 with run 2 (160 stratified alt×alt pairs).*

**Flex runs on the same economics as Power.** On alt×alt pairs Flex EV = **0.747**; Power EV = **0.748**.
Same flat 25% edge. **Flex does not make or lose value versus Power — it redistributes the same expected
value into a consolation.** At the top it compresses like Power: tiers 1.25 and 1.5 sit at EV 0.66–0.68.

**Consolation tiers step by 0.25:** 0.25 · 0.5 · 0.75 · 1.0 · 1.25 · **1.5**.

**The tier is driven by risk.** P(both hit), P(both miss) and the Power payout each sort the tiers at
~75–77% — they are one underlying quantity. **P(exactly one) scores 15.6% — not the driver.** (Run 1
could not test this: whenever one leg is a standard at 50%, P(exactly one) is 0.50 regardless. Run 2's
alt×alt pairs, where it varies, settled it.)

**Tier cut points on 2-pick Power** (share of the two adjacent tiers falling on the correct side):
| Boundary | Cut | Reliability |
|---|---|---|
| 0.25 → 0.5 | **2.40×** | 99% |
| 0.5 → 0.75 | 8.00× | 84% |
| 0.75 → 1.0 | 12.00× | 68% |
| 1.0 → 1.25 | 19.00× | 92% |
| 1.25 → 1.5 | 25.50× | 80% |

**The full payout is solved from the EV target:**
```
Flex full = (EV_target − consolation × P(exactly one)) / P(both hit)    snapped to the Flex grid
```
| Tier | EV target | In-sample exact | Within one step |
|---|---|---|---|
| 0.5 (2.4×–8×) | **0.7712** (sd 0.017) | 115 / 142 | **138 / 142** |
| 0.25 (< 2.4×) | **0.7410** | 61 / 87 | — |

Leg probabilities come from each leg's 2-pick price vs a standard, **de-compressed first** — prices above
9.1× are themselves compressed and would bias the big demons.

**Flex full-payout grid:** 0.1 steps from 1.2× to 2.0× · 0.2 to 4.0× · then 4.5, 5.0 · whole numbers
5–12 · then 14, 16, 22.

**Still open:** the ~23% of tiers a single risk measure mis-sorts — most likely because PrizePicks uses
exact internal probabilities that can only be recovered approximately from rounded prices.

---

## 4a. MULTI-PICK POWER — PARTIAL
*Recorded 2026-09-21.*

| Size | Result |
|---|---|
| 3 picks | Model (base × leg factors, then 2-pick compression) within ~1% on 2 of 3 |
| 4 picks | Demon-heavy slips pay **15–29% more** than the compressed prediction |

**The 2-pick compression curve does not transfer directly to larger slips.** Directional pattern: a
goblin-heavy 3-pick paid *less* than predicted while demon-heavy 4-picks paid *more* — **slip size appears
to widen the gap between goblins and demons**, consistent with the owner's console run (goblin factor
0.667 at 2 picks → 0.583 at 3).

Bases for 5 and 6 picks are unmeasured: with 3 games on the board, all-standard 5/6-pick slips cannot be
built from distinct games. Workaround in run 3: compare same-size slips to each other — the base cancels
in the ratio.

### ⚠ Data defect in runs 1 and 2 — multi-pick compositions mislabeled
`pick_distinct(pool, 0)` returned **one** leg instead of none: it appended before checking the count. So
"1 goblin, 0 demons" silently became 1 goblin + 1 demon, collapsing `1g = 1d = gd`, `2g = ggd`, `2d = gdd`.
**Only the FLEX section called it with zero**; ALTALT, LEG, UNDER, SAMEGAME, BASE and VALIDATE are
unaffected, so every 2-pick finding stands. The legs *recorded* in each slip are correct, so the data was
salvaged by relabelling from contents. **Fixed** in `nba/pp_payout_map.py`; run 3 is the first clean run.

**Why the mock missed it:** it counted slips per *label*, not whether each slip *contained* what its label
claimed. A composition-content check (29/29 correct after the fix) now exists.

### Clean result — run 3 (22/22 compositions verified by content)
Method: for each slip, multiply its legs' own 2-pick factors, then take the **base that product implies**
(`payout ÷ product`). If the multiplicative model held, every slip of a size would imply the same base.

| Size | Goblin-heavy slips imply | Demon-heavy slips imply | All-standard, measured | Mean of mixed slips |
|---|---|---|---|---|
| 3 | 5.13 | 5.41–5.47 | **6.00** | 5.42 |
| 4 | 9.29 | 10.25–10.58 | **10.0** | 9.87 |
| 5 | 17.16 | 19.06–19.25 | — | 18.26 |
| 6 | 32.54 | 36.37 | — | 34.56 |

**Goblins cost more in larger slips than their 2-pick price implies** — goblin-heavy slips imply the lowest
base at every size, ~10% below demon-heavy ones. **The 3-pick 6× base applies to all-standard slips only:**
with any goblin or demon the effective base falls to ~5.1–5.5.

**Working approximation:** payout ≈ mixed-slip base × product of the legs' 2-pick factors, with bases
**5.4 / 9.9 / 18.3 / 34.6** for 3–6 picks. Good to about **±6%**; goblin-heavy slips sit low. Adequate for
rough EV, not for exact prediction. **The exact multi-pick rule remains open**, as do the all-standard
bases for 5 and 6 picks (the published 20× and 37.5× are plausible but unverified here).

**A method error caught on the way:** a shortcut — dividing the `1g`, `1d` and `gd` slips to cancel the
base — assumed they shared the same goblin and demon. They did not: `gd` must avoid the goblin's game, so it
substituted a different demon. The result (a goblin factor of 2.96, a 3-pick base of 1.52) was impossible,
which is what exposed it. **Verify shared legs before any cancellation.**

### Flex — confirmed out of sample (owner's screen, 2026-09-21)
| Slip | Power pred → actual | Flex pred → actual |
|---|---|---|
| LeBron PRA 34.5 D + SGA P+R 29.5 G | 3.25 → **3.25** | 2.2/0.5 → **2.2/0.5** |
| Tatum P+R 39.5 D + Wemby Points 29.5 D | 5.75 → 5.5 | 4.0/0.5 → 3.8/0.5 |
| Tatum Points 24.5 G + Brunson 3PM 1.5 G | 1.9 → **1.9** | 1.6/0.25 → **1.6/0.25** |

Consolation tier **3/3**, including across the 2.4× boundary. The one full-payout miss is inherited from the
Power miss: feeding the actual 5.5× back in gives 4.0 × 5.5/5.75 = 3.83 → **3.8**, exact.

---

## 5. FOUR-WAY TAXONOMY — VERIFIED IN THE PRICING ENGINE

**Goblins and demons sent as Less are priced, in reverse:**
| Leg | As More | As Less |
|---|---|---|
| Brunson PRA goblin 34.5 | ~2.7× | **3.5×** (demon-priced) |
| SGA P+A goblin 34.5 | ~2.6× | **3.75×** |
| Brunson P+A demon 44.5 | high | **1.8×** (goblin-priced) |
| Wembanyama Reb demon 11.5 | 3.25× | **2.8×** |

Matches the documented rule: below the anchor More is the goblin and Less the demon; above it, reversed.

**The app shows only a More button on goblin/demon cards, yet the pricing engine supports Less.**
Whether PrizePicks would *accept* such an entry is untested and deliberately not tested — it would
require placing one.

---

## 6. SAME-GAME — VERIFIED, NARROW

Standard + standard from the same game paid **3.0×, 3.0×, 2.9×** — no meaningful discount.
**All three pairs were opponents.** Teammate pairs are untested. n = 3.

---

## 7. CORRECTIONS TO EXISTING DOCUMENTS

| Document says | Measured |
|---|---|
| Pricing is a discrete step function per tier; goblin pays flat | **Priced per line.** Only the deepest goblins are flat — at the 2.1× floor |
| PrizePicks discounts same-game 35–40% | **Not observed** for opponent pairs (MLB figure; teammates untested) |
| Season opens 2026-10-03 | **That is preseason.** Regular season opens **2026-10-20** (`nba_calendar.games`, prefix 002) |
| Goblin/demon Less side absent (UI observation) | **Priced by the engine**; hidden by the UI |

---

## 8. OPEN

- **Flex consolation-tier rule above 5×** — run 2 targets it
- **Teammate same-game discount**
- **Multi-pick Power beyond the base** — the goblin factor drifted with size (0.667 → 0.583 → 0.65);
  compression may explain it
- **State dependence** — every measurement is `prizepools`; other modes and states are unmeasured
- **Line movement over time** — needs scheduled runs

---

## 9. PER-LEG PRICING LOGIC — for replicating two seasons of history
*Recorded 2026-09-21. Mining only works on LIVE projections, so history requires the logic.*

**PrizePicks prices each line as the tail probability of a count distribution centered on the standard line,
with spread `c × √(standard line)`:**
| Stat family | c | Consistency |
|---|---|---|
| Points, P+R, P+A, PRA | **≈ 2.0** (1.93–2.06) | CV 0.11–0.15, all 6 players |
| Rebounds, Assists, 3-PT Made | **≈ 1.25** (1.23–1.28) | CV 0.13–0.21 |
| Rebs+Asts | ≈ 1.4 | CV 0.11 — **only 5 legs, thin** |

`p = P(stat > line)` → `factor = 0.5 / p` → goblin floor ≈ 2.08× (2-pick) → compression → rounding.
The spread depends on the stat and the standard line — **not on the player**.

**Leave-one-player-out** (115 legs, model never saw the player): **72% within one rounding step, median error
4.0%, median bias −0.04%.** Error concentrates in **big demons (> 9.1×): bias +4.8%, error 8.5%** — a bell curve's
right tail is too thin for count stats. **Fix pending:** a right-skewed count distribution (gamma / negative
binomial).

### History coverage (VERIFIED against Postgres)
- `nba_market.board_snapshots`, bookmaker `prizepicks`: **2024-10-22 → 2026-04-12**, 2.2M rows.
- Goblins/demons live only in the 8 `_alternate` markets — **all 8 map to a fitted stat family.** Blocks, steals,
  blocks+steals and turnovers have **no alternates** → factor 1.
- **Alternates were More-only in both seasons: zero Under rows** (1.45M alternate rows, all Over).
- Price flag in alternates: `100` = demon, `-137` = goblin (`NBA_GOBLIN_DEMON.md` §4).
- **Match centers by snapshot, never by date:** 18% of day-ladders (37,719) had their standard move intraday.

### Price ID design — AGREED with the owner
**Leg side exists:** `nba_market.board_tiers_v2` gives every leg its four price-determining facts —
`base_market, anchor_line, line, side` — plus `anchor_type` (how the center was found). **Those four facts are
the Price ID.** 2,199,354 PrizePicks legs → **8,573 Price IDs** (6,945 goblin/demon, 1,691 standard).

**Price side — to build:**
| Table | Holds |
|---|---|
| `nba_market.pp_price_key` | Price ID ↔ (base_market, anchor_line, line, side) |
| `nba_market.pp_price` | Price ID × **model_version** → implied_p, factor, **source** (model / mined / override) |
| `nba_config.pp_pricing_model` | each version's parameters, which is current, its validation scores |
| `nba_config.pp_slip_rules` | bases, compression, rounding grids, Flex tiers and EV targets |
| view `pp_leg_price` | every leg + its Price ID + current factor, computed on the fly |

**Keyed on raw facts, not model parameters** (the stat, not its family) — so any future model is just a new
version, with no re-tagging. **Exposed through a view, not a stamped column**: the tier builder rebuilds
`board_tiers_v2`, which would wipe a stamped column.

### Legs with no center — 43,370 (2.0%), `anchor_type = 'none'`
Mostly **lone demon lines on small stats** (92% demons; threes 36%, assists 33%, rebounds 13%; 19,827 are a single
line). The formula needs a center, so these get a Price ID with a **NULL price and a reason code — never a
guessed center.** Guessing is dangerous twice over: a demon's price is most sensitive to the center, and using
the model's own projection as the center would make the backtest circular.

| Rescue tier | Legs | Center source | Rule |
|---|---|---|---|
| same-day snapshot | 3,227 | PrizePicks' own standard, another snapshot, one value all day | safe |
| sportsbook consensus | 35,951 (22,690 with 3+ books) | books' line, same player/stat/day | **only if validated** against PP standards on explicit ladders |
| standard moved | 5 | ambiguous | unpriced |
| no center anywhere | 4,187 | — | unpriced |

Each rescue tier gets its own `anchor_type`. After rescue, genuinely unpriced ≈ **4,192 legs (0.2%)**.

### BUILD STATUS — updated 2026-09-21 (items 1–3 BUILT and verified)

**BUILT, in Postgres:**
| Object | Contents |
|---|---|
| `nba_market.pp_price_key` | **8,831 Price IDs** covering all **2,199,354** PrizePicks legs — key = `(base_market, anchor_line, line, side, kind)` |
| `nba_market.pp_price` | version `pp-leg-v1-normal`: implied_p, factor, source (`model` / `rule` / `unpriced`), reason |
| `nba_config.pp_pricing_model` | v1 registered as current: parameters, validation scores, known biases |
| `nba_config.pp_slip_rules` | 13 slip-level rules, each marked verified / partial / unverified |
| `nba_market.pp_norm_cdf(x)` | normal CDF (Abramowitz–Stegun), verified exact to 6 decimals |
| view `nba_market.pp_leg_price` | every leg + Price ID + current price; a leg with no key yet still appears (`no_price_key_yet`); a `mined` price outranks the model |

**Coverage (verified through the view — every leg accounted for):**
| | Legs | Share |
|---|---|---|
| Demons priced | 743,853 | 33.8% — 2-pick 3.10–11.95× |
| Goblins priced | 583,661 | 26.5% — 2-pick 2.08–2.92× |
| Standards (factor 1) | 745,526 | 33.9% |
| **Unpriced — outside calibration** | **82,944** | **3.8%** |
| Unpriced — no center | 43,370 | 2.0% |
| **Total priced** | **2,073,040** | **94.26%** |

**Three findings from the build itself:**
1. **`kind` had to join the key.** 2,475 legs are labelled standard while their line differs from the center
   (727 IDs). A standard is its own center and pays factor 1; pricing purely by position would have charged them
   as goblins/demons. With `kind` in the key they price at 1, flagged `standard_label_off_center`. Every goblin and
   demon label agrees with its position (0 mismatches). **Root cause of the off-center standards not investigated.**
2. **The calibration edge.** v1 initially priced far demons at up to **15,000×** — a bell curve's tail extrapolated
   far past the evidence (history has demons at 2–4× their center; every mined demon sat within ~+47%). The edge is
   evidence-based: the longest-odds demon mined is **Brunson Rebounds 5.5, 11.5× (implied_p 0.1254)**. Beyond it →
   unpriced, `outside_calibration`. Stored as `calibrated_min_implied_p` — move it only when mining observes longer odds.
3. **Same key, different players, different real prices** — up to ~10% (Pts+Asts 32.5 → 44.5 demon: 9.5× vs 10.5×,
   mined minutes apart). Most likely PrizePicks prices alternates off its **unrounded** projection, of which the
   standard line is a rounding. **For history this is irreducible — it is the accuracy ceiling of any key-level model.**
   **Consequence: mined prices must be stored per leg (per player / projection), never per generic key.**

**Validation against PrizePicks' real current prices:** 112 of 114 mined live legs have their exact key in history
(103 keys, covering 123,571 historical legs). v1 vs mined: **median error 3.1%, median bias 0.0000.** (v1's constants
were fitted on these legs; the out-of-sample figure remains leave-one-player-out: 72% within one rounding step.)

### REMAINING
4. ~~v2 — skew fix~~ — **DONE 2026-09-21, now CURRENT.** See "v2 — THE PER-LEG LOGIC" below.
5. ~~Rescue tier: same-day snapshot~~ — **DONE.** See "RESCUE TIERS" below.
6. ~~Rescue tier: sportsbook consensus~~ — **DONE, lower confidence.** See "RESCUE TIERS" below.
7. ~~Conflicting keys~~ — **RESOLVED 2026-09-21.** Structurally by `kind` in the key; root cause found:
   **all 2,475 off-center standards come from snapshots where PrizePicks' base market showed exactly two standard
   lines at once** (avg 1.09 apart — most likely the line moving mid-capture). The tier builder **always takes the
   higher standard as the center** (5,704 of 5,704 alt legs in those ladders). **PrizePicks' own flags confirm the
   rule:** of the 251 goblins sitting *between* the two standards — the only legs whose kind depends on the choice —
   **247 are flagged goblin (98.4%)**, i.e. PrizePicks built the ladder around the higher line. Only 8 of 5,704 flags
   contradict the builder (0.14%). The lower standard prices correctly at factor 1.
8. ~~Load mined live prices~~ — **DONE 2026-09-21.** See "MINED PRICES — PER LEG" below.
   (`Points→player_points`, `Pts+Rebs→player_points_rebounds`, `Pts+Asts→player_points_assists`,
   `Pts+Rebs+Asts→player_points_rebounds_assists`, `Rebounds→player_rebounds`, `Assists→player_assists`,
   `3-PT Made→player_threes`, `Rebs+Asts→player_rebounds_assists`)
9. **Preseason board (2026-10-03):** re-validate on dozens of players; mine longer-odds demons to extend the edge

### v2 — THE PER-LEG LOGIC (current model, `pp-leg-v2-sqrt`)
**PrizePicks prices each line as a tail probability on the square-root scale, centered on the MEDIAN projection:**
```
P(over the line) = 1 − Φ( 2 × (√line − √center) / c )      general form: power-normal, λ = 0.5
```
| Family | c | Reading |
|---|---|---|
| Rebounds / Assists / Threes | **1.08** | ≈ **Poisson** — a pure Poisson count gives exactly 1.0 on the square-root scale |
| Points / P+R / P+A / PRA | **1.87** | variance ≈ 3.5 × mean — points arrive in twos and threes |
| Rebs+Asts | 1.34 | 5 legs — thin |

**Head-to-head, leave-one-player-out (115 legs, constants refitted inside every fold):**
| Model | Within 1 step | Median error | Big-demon bias |
|---|---|---|---|
| normal (v1) | 70% | 4.5% | **+4.8%** |
| gamma, median on line | 72% | 4.3% | −3.3% (overcorrects) |
| gamma, **mean** on line | 39% | 8.7% | +1.4% — **PrizePicks centers on the median, not the mean** |
| **square root, λ = ½ (v2)** | **80%** | **3.8%** | **−0.5%** |
| λ fitted blind per fold | 76% | 4.0% | −1.2% — chose λ = 0.40–0.55 every fold |

λ = ½ was named in advance as the variance-stabilizing transform for count data; the blind per-fold fit
converging on 0.40–0.55 is the independent confirmation. The 76% row is the strictly out-of-sample figure.

**Against PrizePicks' real current prices** (mined keys found in history; both models fitted on these legs):
v1 median error 3.07%, big-demon bias +1.93%, 112 priced · **v2 3.16%, +0.15%, 114 priced.**

**Coverage of two seasons:** v2 prices **2,102,700 legs = 95.61%** (v1: 94.26%). Demons outside calibration
fall from 82,944 to **53,284** — v2's fatter tail places some far historical demons inside the range of odds
actually mined. v2's edge: `implied_p ≥ 0.1253` (furthest mined demon in v2 terms: Rebounds 11.0 → 15.5, 9.0×).

**Safety fix made at the switch:** the view now LEFT-joins the current model, so if no version were ever current,
every leg would still appear with `no_current_model` instead of silently vanishing.

### RESCUE TIERS — centers for legs the tier builder could not anchor (applied 2026-09-21)
Rescued centers live in **`nba_market.pp_anchor_rescue`** — never written into `board_tiers_v2`, which the tier
builder owns and rebuilds. The view applies a rescue **only where PrizePicks' own price flag confirms it**
(`flag_agrees`): the flag (`100` = demon, `-137` = goblin) must match the leg's position against the rescued center.
Each rescued leg reports `anchor_type = 'rescued:<tier>'`, so it can always be told apart from an observed center.

| Tier | Candidates | Flag-confirmed | Priced | Outside calibration |
|---|---|---|---|---|
| **same_day_snapshot** — PrizePicks' standard seen in another snapshot, one value all day | 3,227 | **3,104 (96.2%)** | 2,643 | 461 |
| **sportsbook_consensus** — median of the books' lines, same player/stat/day; PrizePicks posted no standard | 35,951 | **30,273 (84.2%)** | 25,139 | 5,134 |

**Tier B validation** (on 146,938 ladders where both exist): the books' consensus lands within ½ point of
PrizePicks' standard on **92.5–99.9%** by market — threes 99.5% exact, points family 61–72% exact, assists/rebounds
~60–66% exact (a 3.4% center error on assists moves a demon's price ~8%).

**⚠ Tier B selection bias — read before relying on it.** The validation population (ladders *with* a PrizePicks
standard) is not the rescue population (ladders *without* one). PrizePicks may skip the standard precisely *because*
its projection disagrees with the market. Evidence: **5,652 tier-B candidates sit exactly on the books' line yet carry
a demon/goblin flag** — PrizePicks' center was elsewhere. The flag check removes flagrant cases; half-point center
errors that don't flip a leg's kind can still pass. **Treat tier B as lower confidence; filter it out by `anchor_type`
when precision matters.**

### COVERAGE — final for this build (verified through the view)
| Center source | Legs | Priced | Share |
|---|---|---|---|
| explicit | 1,780,149 | 1,747,376 | 98.2% |
| switch_point | 375,835 | 355,324 | 94.5% |
| rescued: same_day_snapshot | 3,104 | 2,643 | 85.1% |
| rescued: sportsbook_consensus | 30,273 | 25,139 | 83.0% |
| none (no center) | 9,993 | 0 | — |
| **Total** | **2,199,354** | **2,130,482** | **96.87%** |

Progression: v1 94.26% → v2 95.61% → + tier A 95.73% → + tier B **96.87%**. Price IDs: **9,036**.
The 9,993 still without a center = flag-rejected rescues (123 A + 5,678 B) + 5 whose standard moved + 4,187 with no
center anywhere.

### MINED PRICES — PER LEG (built 2026-09-21)
**Mined prices are stored per leg, never per generic Price ID.** Two players with the identical key
`(market, center, line, side, kind)` carry different real prices (up to ~10%) — PrizePicks prices off its unrounded
projection. Collapsing mined prices into a key would pin one player's price onto every historical leg sharing it;
for history the model — effectively an average across players — is the better estimate.

| Object | Contents |
|---|---|
| `nba_market.pp_mined_leg` | one row per mined leg per run, keyed `(run_file, projection_id, partner_projection_id)` — PrizePicks' own per-leg identity; quoted 2-pick Power + Flex, de-compressed factor, implied probability |
| view `nba_market.pp_mined_vs_model` | every mined leg beside the current model's price for its key (compression read from `pp_slip_rules`) — **a standing validation: each load re-tests the model** |

**Removed from `pp_leg_price`:** the generic-key "mined outranks model" layer. It was inert (nothing loaded) but a
trap for the first mined load. Live legs will attach their own mined price per leg when the live pipeline exists.

**Loaded:** run 1 (156 legs). Runs 2–3 were byte-identical in price (0 changed rows across 45 minutes) — to be
backfilled by the loader. **Validation (v2):** 115 legs matched a Price ID; median error **3.11%**, bias **−0.73%**.
7 mined legs are stats with no historical market (Blocked Shots, Double-Double); **34 (22%) have no standard line on
the live board** — for live legs that is harmless, since the mined price itself is exact.

### DELTA MINING, DRIFT MONITOR, SLIP FUNCTIONS — built 2026-09-21 (second session)

**Delta mining (monitoring).** `nba/pp_payout_map.py` gained `mode: delta`: it reads the already-mined
`(projection_id, line)` pairs from `pp_mined_leg` and quotes **only new legs**, plus a **DRIFT sample** of already-mined
legs (rotating hourly, default 10) re-quoted to catch repricing when a line does not move. No database → a loud
warning and every leg counts as new, never silently skipped. **`nba/load_pp_mined_legs.py`** loads every map file not
yet in `pp_mined_leg` (self-healing: a failed load retries next run). Workflow chains map → commit → load.
**The schedule is DISABLED** (commented cron in the workflow) — how often PrizePicks is queried is an owner decision;
scheduled runs are forced into delta mode.

**First delta run (06:11 UTC):** board unchanged → **0 new legs, 10 drift re-quotes**; the loader **backfilled runs 2
and 3 automatically** (files 4, new rows 322). `pp_mined_leg`: **478 rows, 156 distinct legs, 4 runs.**

**Drift monitor — view `nba_market.pp_price_drift`:** first vs latest price per leg, `repriced` flag.
**First finding: 0 of 156 legs repriced across 2 h 46 m** (10 legs quoted 4×). Prices a month before tip-off are
stable; movement is expected near game time (injuries, line moves) — where delta monitoring matters.

**Slip-payout functions — pricing logic now lives in the database, reading `pp_slip_rules`:**
| Function | Does |
|---|---|
| `pp_slip_power(factors numeric[])` | 2-pick: base × factors, compressed, rounded (`verified`); 3–6: all-standard base (`verified` 3–4, `unverified` 5–6) or mixed-slip effective base × factors (`partial`, ±6%). A NULL leg → no price, never guessed |
| `pp_slip_flex2(p1, p2, power2)` | 2-pick Flex: consolation tier by risk, full payout solved from the EV target, snapped to the grid; `verified` for tiers 0.25/0.5, `partial` above |
| `pp_round_step(x, lo, hi)` | the Power rounding grid |
`flex_ev_targets` gained the higher tiers (0.75 → 0.757 · 1.0 → 0.743 · 1.25 → 0.677 · 1.5 → 0.658) with sample sizes
(22 / 12 / 4 / **1**) — marked partial.

**Validated against all 10 slips the owner confirmed on screen** (legs' mined factors in, database functions only):
**Power 10/10 within one rounding step, 6 exact. Flex tier 9/10; full payout 7/10 exact.** The labels are honest:
every `verified` slip is exact or one step off, the one-step Flex misses (#4, #9) are inherited from their Power miss,
and the only real miss (#6's tier) sits in the region labelled `partial`. Slip #4's Power miss: both legs are floor
goblins displayed 2.1× but truly ~2.08× — mined factors come from displayed, rounded prices. **Stored mined data is
kept raw** (observations stay observations; corrections belong in pricing logic).

**Item 1 feasibility (model probability vs PrizePicks'):** the two sides join cleanly — **11,279 of 11,279**
model-scored PrizePicks legs match a priced leg (10,982 carry a price). **But `board_scored` holds only 2 dates**
(2025-11-29, 2026-01-15 — sample replays), not two seasons. **Item 1 across two seasons first needs the model to score
all 378 dates** — a scoring-pipeline replay job, not a pricing gap. `board_scored.kind` is NULL for PrizePicks rows;
props use short codes (`pra`, `threes_made`, …) mapped to Odds-API markets in the join. First glimpse on the 2 dates:
avg model p 0.454 vs PrizePicks implied 0.469.

**Lesson recorded:** verify commits through the **GitHub API**, never `raw.githubusercontent.com` — its CDN caches
for minutes and ignores cache-busting query strings (it returned a pre-patch copy after two successful patches).

### PRICING THE SEASON — v2-full, one stored formula, live refresh (2026-09-21, owner direction)
**Owner's rule:** price with the best logic available now; if prices change, change them in the database.

**`pp-leg-v2-sqrt-full` is CURRENT.** Identical formula and constants to `pp-leg-v2-sqrt`, with one switch —
`price_beyond_edge: true` — so legs past the calibration edge are **priced and flagged
`extrapolated_beyond_mined_range`** instead of left unpriced. v2 extrapolates sanely (as a 2-pick with a standard:
median 17.0×, p90 36.3×, p99 89.2×; 118 legs above 50×). The conservative `pp-leg-v2-sqrt` stays stored beside it.

| Status (view `pp_leg_price`) | Legs | Share |
|---|---|---|
| priced within the evidence | 1,384,956 | 63.0% |
| standards (factor 1) | 745,526 | 33.9% |
| **priced, extrapolated (flagged)** | **58,879** | **2.7%** |
| no center — unpriced | 9,993 | 0.45% |
| **Total priced** | **2,189,361** | **99.55%** |

**`nba_market.pp_price_version(version)` — the ONE copy of the per-leg formula.** Prices every not-yet-priced key
under a version, reading everything from its `params_json` (power-normal family: `lambda` defaults to 1 = v1's normal;
0.5 = v2). Replaces a statement pasted four times — the way copies of a formula drift. **Verified bit-for-bit:** v2-full
vs the hand-priced v2 across all 9,036 keys — **0 differences outside the gap, not even at 1e-9**; all 982 gap keys
priced from the identical probability.

**`nba_market.pp_refresh_prices(p_since date default current_date - 3)` — prices the live season as it arrives:**
rescues centers for recent no-center legs (tiers A and B, flag-checked, date-bounded), creates missing Price IDs, then
prices every missing key under **every** registered version. **Idempotent — run over all of history it returned
0 / 0 / 0 / 0.** The loader calls it at the end of every run, so each scheduled run prices whatever new legs have landed
in `board_tiers_v2` — which depends on the board archive and tier builder running during the season.

**Schedule:** enabled every 6 hours (delta mode). Owner: secondary this early; kept because a run costs ~10–20 quotes.

### MODEL HISTORY FOR ITEM 1 — scoring both seasons (2026-09-21)
**Why.** Item 1 compares the model's probability with PrizePicks' price on every leg of two seasons. On
2026-09-21 the model had scored 2 of 325 ladder dates.

**The expensive half already existed.** `nba_score.baseline_history` (13 GB, ~19.3M rows) holds P2's ladder for
**325 dates — 162 (2024-25) + 163 (2025-26)**, every regular-season date. The scorer (`nba/score_board_legs.py`)
is point-in-time by design: that date's ladder plus the latest calibration cells published at or before it.
New runner: `nba/score_history.py` + `.github/workflows/nba-score-history.yml` (optional calibration rebuild,
then 8 parallel chunks; each date its own process and its own season). `BS_APPS` is documented in the scorer's
header but never read — it always scores every app.

**THE CALIBRATION WIPE (found 2026-09-21).** `nba_score.ladder_calibration_asof` was EMPTY. P2 test run
`35483301157` deleted it at **2026-09-20 03:24 UTC (8:24 PM PT, Sep 19)**: P2 passed `AC_SEASONS` = one season,
the builder deleted EVERY season, `final_hp` held only one graded 2025-26 date, so it computed **zero cells and
committed them over the whole history** ("wrote 0 as-of cells"). `certify_pipeline.py` caught it and failed the
job red (`FAILED CHECKS: as-of calibration available`) — nobody followed up.
**Fixed:** the builder now defaults to every season in `final_hp` (oldest first), computes everything before
touching the table, **refuses to write an empty build**, and replaces only the rebuilt seasons in one
transaction. P2 no longer passes a season.

**The lost calibration cannot be recovered, and was stale.** Postgres' insert counter (9,577) is cumulative
across builds — not the table's size (my misread; I had predicted the rebuild would reproduce it). Re-scoring
2026-01-15 matched yesterday's scores on ladder probability and confidence for all 52,560 legs, but every
calibrated leg's shift differed (points ~13–16× larger now): the lost table was built from an older `final_hp`.
The rebuild is fitted on exactly the probabilities the scorer corrects — `final_hp.baseline_hp` equals the
scorer's ladder probability on all 5,283 PrizePicks legs tested. Yesterday's scores are preserved in
`nba_score.board_scored_snapshot_20260920`.

**Two silent bugs fixed along the way:**
| Bug | Effect | Fix | Proof |
|---|---|---|---|
| Builder derived props with `replace('player_','')` → `threes`, `points_rebounds_assists` | threes + all four combos NEVER calibrated (only points/rebounds/assists) | map outcome keys to our names as the scorer does | cells 3,639 → **9,904**, all 8 props |
| Scorer's phase rule was month-only; the fit splits Feb 15 / Mar 16 | wrong phase's cells on **60 of 348** days (Feb 1–14, Mar 16–31) | scorer uses the fit's rule | disagreeing days → **0** |

**Full run — deadlocks, fixed, resumed.** Run `35572323173` (launched 12:18 AM PT, Sep 21) rebuilt calibration
(9,904 cells), then scored only **144 of 325 dates**; the other 181 failed on **Postgres deadlocks**. Cause: the
scorer ran `CREATE UNIQUE INDEX IF NOT EXISTS` in its write transaction on every run. Postgres takes a SHARE lock on
the table *before* discovering the index exists and holds it to commit; two scorers both held SHARE, then each waited
on the other for ROW EXCLUSIVE to delete its date. P3 scores one date alone, so it never surfaced — 8 parallel
chunks triggered it constantly. Victims rolled back whole (nothing half-written). **Fixed:** the index is created
only when missing. The runner gained `SH_SKIP_BUILT_AFTER` (resume without redoing good dates) and one retry pass;
the rerun skips dates scored after the 9,904-cell calibration was written (07:22:34 UTC).

**Open decisions (owner):**
1. **Calibration magnitude.** Average |shift| 0.09–0.15 log-odds per prop, max 0.72 (~17 points at even odds).
   The ladder recipe discards Platt shifts above 0.15; the as-of builder has no guard. Item 1's Q2b measures
   whether the large shifts help or hurt out of sample — decide with that result.
2. **2025-26 has no own-season calibration.** `final_hp` covers one 2025-26 date, so 2025-26 inherits 2024-25's
   cells. Running the final engine across 2025-26 would fix that (heavier job).

**Item 1 is prepared:** `nba/sql/item1_model_vs_price.sql` — per-leg base table (model score + latest-snapshot
price + outcome) and five questions: coverage; model vs PrizePicks pricing as predictors (Brier, by kind); does
calibration help, and do the large shifts help; is the model's claimed edge real (value buckets); a selection
backtest at thresholds 1.1006 / 1.1547 / 1.25 / 1.40, one leg per player-prop-day. Leg value = 2 × factor × hit;
breakeven per leg 1.1547 (2-pick Power) and 1.1006 (3-pick). Leg-level value ignores compression above 9.1× and
rounding, so it overstates big demons; extrapolated prices are excluded from every verdict.

### ITEM 1 RESULTS — the model against PrizePicks' prices, two seasons (2026-09-21)
All 325 dates scored (point-in-time). Table `nba_market.pp_model_vs_price`: 1,092,800 model-scored PrizePicks legs
(316,585 + 776,215), 99.6% priced, 1,078,919 usable (priced + graded, extrapolated prices excluded).
Leg value = 2 × factor × hit; fair = 1.0; breakeven 1.1547 (2-pick Power), 1.1006 (3-pick).

| | 2024-25 | 2025-26 |
|---|---|---|
| Brier, demons (model / PrizePicks) | 0.1853 / **0.1812** | 0.1897 / **0.1841** |
| Brier, goblins | 0.2232 / **0.2128** | 0.2277 / **0.2202** |
| Brier, standards (PP = flat 50%) | 0.2567 / **0.2500** | 0.2551 / **0.2500** |
| Top bucket (model value ≥ 1.50): claimed → realized | 1.729 → 1.155 ± 0.015 | 1.798 → 1.132 ± 0.009 |
| Best selection (≥ 1.40, one leg per player-prop-day) | 1.151 ± 0.013 | 1.107 ± 0.010 |
| Calibration gain, shifts > 0.30 (Brier) | +0.0121 | +0.0050 |

1. **PrizePicks' pricing is the better forecast on every kind, both seasons.** On standards the model is worse than
   a flat 50%.
2. **But the model ranks.** Realized value climbs with its claim in both seasons (0.89 → 1.155; 0.86 → 1.13).
3. **It is heavily overconfident.** Only ~21% (2024-25) and ~17% (2025-26) of the top bucket's claimed edge
   materialized.
4. **No threshold clears the 2-pick breakeven in either season.** The 3-pick breakeven is cleared only at ≥ 1.40:
   clearly in 2024-25, not significantly in 2025-26 — and those picks are 58% / 80% demons, whose leg-level value
   slip compression will cut.
5. **Tail bias by kind:** goblins under-predicted (0.644 vs 0.685 actual; 0.626 vs 0.659), demons over-predicted
   (0.263 vs 0.246; 0.296 vs 0.257) — the ladder's tails are too wide.
6. **Demons underpay as a class:** actual 0.246 vs implied 0.267; 0.257 vs 0.286 (~ −8 to −10% value). Standards are
   fair (0.500 vs 0.500).
7. **Calibration helps out of sample in both seasons, and the larger the shift, the more it helps** — a 0.15 guard
   would remove the most useful corrections (answers open decision 1).

**Caveats:** prices are our reconstruction (v2, ~80% within one step); leg value ignores compression and rounding;
legs are not independent (SEs optimistic); the model's design was developed looking at these seasons, so these
results are an upper bound — live 2026-27 is the real test; 2025-26 calibration is inherited only.

### IS SHRINKAGE THE NEXT STEP? — checked, no (2026-09-21)
**Algebra.** Blend p = price + k·(model − price). A leg's price-implied value is exactly 1 (2 × factor × price = 1), so the
blended value = **1 + k·(model value − 1)** — a monotone rescaling. Every leg keeps its rank: shrinkage makes claimed
values honest but **cannot change a single pick or any selection's realized return.**
**But it proves real signal.** k fitted on 2024-25 (least-squares on Brier), applied to 2025-26 OUT OF SAMPLE:
| Kind | k (2024-25) | k if fit on 2025-26 | Brier price → blend (2025-26) |
|---|---|---|---|
| demon | 0.315 | 0.279 | 0.18411 → **0.18314** |
| goblin | 0.212 | 0.277 | 0.22016 → **0.21894** |
| standard | 0.263 | 0.321 | 0.25000 → **0.24860** |
The blend **beats PrizePicks' own price on every kind**, even standards (raw model worse than a flat 50%). k is stable:
~21–32% of the model's disagreement with the price is signal, the rest overconfidence.

**Where it pays — standards, not demons** (model value ≥ 1.40, one leg per player-prop-day, realized value ± SE):
| Segment | 2024-25 | 2025-26 |
|---|---|---|
| standard Over | **1.195** ± 0.027 (1,324) | **1.211** ± 0.035 (773) |
| standard Under | 1.116 ± 0.013 (5,622) | **1.148** ± 0.012 (6,880) |
| demon | 1.164 ± 0.021 (9,667) | 1.095 ± 0.013 (30,494) |
Standards combined: 1.131 and 1.155 (hit rate ~57–58%), above the 3-pick breakeven (1.1006) both seasons. Standards have
factor 1 — no compression, no rounding — so leg value IS exact slip value. Demons are inconsistent and underpay as a class.
**Proper next step: an exact slip-level backtest of a standards-only strategy** (pushes/DNPs revert the slip size).

### WNBA — same engine, not all the same constants (2026-09-21)
Mapper, loader and workflow are league-parameterized: trigger-file line `league: nba|wnba` (default nba) sets
`PP_LEAGUE` (7 NBA, 3 WNBA — PrizePicks' board league ids are printed as proof), `PP_OUT_DIR`
(`nba/data/pp_payouts_wnba/`) and `PP_MINED_TABLE` (`nba_market.pp_mined_leg_wnba`, an exact structural copy). WNBA never
touches NBA files, tables or validation views; the per-leg extraction is the SAME function. VALIDATE (NBA-only pair) is
skipped on other leagues. **While `league: wnba` stays in the trigger file, scheduled runs mine WNBA** (delta against the
WNBA table) — switch back to `league: nba` when the NBA preseason board appears (~Oct 1–3).

First WNBA map, 2026-09-21 10:41–10:55 AM PT: 400 quotes, **337 per-leg prices** (250 with a same-board standard line to
anchor them; 87 without, excluded). NBA's v2 constants vs a fresh WNBA grid fit of c (same v2 formula):
| Stat | Legs | NBA c | WNBA c | NBA c within 1 step |
|---|---|---|---|---|
| Points | 53 | 1.87 | **1.88** | 62% |
| Pts+Rebs | 27 | 1.87 | **1.86** | 67% |
| Pts+Rebs+Asts | 32 | 1.87 | 1.94 | 56% |
| Pts+Asts | 26 | 1.87 | 1.78 | 42% |
| Rebounds | 32 | 1.08 | **1.32** | 28% |
| Assists | 17 | 1.08 | **1.28** | 35% |
| Rebs+Asts | 24 | 1.34 | 1.46 | 50% |
| FG Attempted / Fantasy Score / 3-PT Attempted | 14 / 14 / 8 | — | 1.22 / 2.08 / 1.16 | — |
**Points family transfers** (independent fit lands on 1.87). **Rebounds and assists do not** — refit error ~17–20% → ~4%;
league-specific. New stats fit the formula cleanly but are WNBA-only until an NBA board confirms them.
**RULE: transfer only what both leagues agree on.** Never copy WNBA rebound/assist constants into NBA.

### STANDARDS BACKTEST — exact slip level, and three attempts to break it (2026-09-21)
**Design.** Standard legs only; **one leg per player per night** (the model's best prop and side); ranked by model value
within the night and cut into consecutive slips; partial slips dropped. Verified all-standard Power payouts 3.0 / 6.0 /
10.0× (5- and 6-pick 20 / 37.5× are published but unverified). Voids (push/DNP) revert the slip one size down; fewer than 2
remaining → refund. Realized payouts use actual joint outcomes, so within-slip correlation is already in the result.
| Threshold · picks | 2024-25 ROI ± SE | 2025-26 ROI ± SE | leg hit rate |
|---|---|---|---|
| 1.30 · 3-pick | +10.3% ± 5.0% | **+23.5% ± 4.6%** | 57.5% / 58.8% |
| 1.40 · 3-pick | +17.6% ± 6.9% | **+32.1% ± 6.3%** | 58.6% / 60.2% |
| 1.40 · 4-pick | +18.1% ± 10.9% | +28.1% ± 9.8% | 58.6% / 60.0% |
| 1.40 · 2-pick | +2.3% ± 3.3% | +9.7% ± 2.9% | 58.6% / 60.1% |
Consistent with independent legs at those hit rates (e.g. 6 × 0.586³ = 1.207).
1. **Stale lines — ruled out.** 21–27% of picked legs had a standard line that moved during the day (the overnight model
   mechanically prefers the stale side, and a line moves for a reason). Restricting to lines that never moved leaves hit
   rates unchanged (57.6 / 58.6% at 1.30; 58.7 / 59.7% at 1.40).
2. **Minutes leak — ruled out.** Ladder `proj_min` vs actual minutes (nba_stats.player_game_log), 2,174 player-games on 14
   dates: MAE 5.46 min, r = 0.713, 10.9% within 1 minute — an honest pre-game projection, not actual minutes.
3. **Night-clustered SE.** 3-pick @ 1.30, never-moved lines: **+16.7% ± 4.4%** over 324 nights / 4,212 slips (3.8 SE);
   2024-25 +14.2% ± 6.4%, 2025-26 +18.7% ± 6.1%. Volatile: half the nights lose; some nights lose every slip.
**Caveats that cannot be tested historically:** the ladder's player list is players who actually played (live picks will
include some late scratches → voids and reversion); the model's design was developed looking at these seasons (factor
gating RF_TRAIN 2024-25 / RF_TEST 2025-26), so results are an upper bound. **Live 2026-27 is the real test.**

### WNBA SLIP RULES — identical to NBA (2026-09-21)
`nba/load_pp_quotes.py` → `nba_market.pp_quote`: every quote, all sections, both leagues (runs after every map, self-
healing). WNBA delta run: mined legs 337 → **587**.
**All-standard bases identical:** 2-pick Power 3.0 / Flex 2.0, 0.5; 3-pick Power 6.0 / **Flex 3.0, 1.0** (3-pick Flex now
verified in both leagues). **Flex tier rule — same pattern per band in both leagues** (share matching NBA's cut rule):
<2.4× 100% / 100%; 2.4–8× 92.8% / 92.3%; 8–12× 44.6% / 43.1%; 12–19× 33.3% / 24.5% (NBA / WNBA). The Flex logic is
league-independent → **pool NBA + WNBA 2-pick quotes to solve the tier rule** (above 8× it depends on more than the
payout band). WNBA reaches 37–44× two-pick payouts with consolations 1.75 and 2.0 — beyond anything NBA showed.
**Schedule:** no scheduled runs seen at 06:15 or 12:15 UTC; a map run appeared at 18:12 UTC on a commit not made here —
identify its triggering event from its log before relying on the schedule.

### WNBA SCOPE (owner, 2026-09-21)
**WNBA is only a data source to sharpen NBA multipliers.** No WNBA models, WNBA constants or WNBA-only stats. Use it only
where the machinery is shared with NBA and NBA lacks data.

### THE PAYOUT CAP — filled from WNBA, now in NBA pricing (2026-09-21)
**Finding.** NBA's formula prices WNBA points-family demons well inside NBA's evidence range (168 legs: 6.7% mean error)
but badly beyond it (73 legs: 26.6%). Binned by predicted p, reality tracks the formula down to p ≈ 0.075, then STOPS:
the minimum real implied p is **0.0720 in every bin**, and the max 2-pick is **18.5×** (= factor 0.5/0.072 = 6.94,
×3 = 20.8, compressed to 18.5). **It is an engine-level cap:** points (255 demons), reb/ast (186) and other stats (77) —
three families with different spread constants — all floor at exactly 0.0720 / 18.5× (16 legs at the floor). NBA never
reached it (min mined p 0.1254, max 11.5×). NBA pricing had `implied_p_floor` 0.0001, so its extrapolation produced
2-picks up to 306.6×.
**Applied:** new version **`pp-leg-v2-sqrt-cap` (CURRENT)** = v2-full with `implied_p_floor` 0.072 (±0.0007 — 18.5 is a
rounded payout). Verified against v2-full: 422 keys changed, **all** from p < 0.072; **0** changes above the floor; **0**
uncapped legs below it; max 2-pick 306.63× → **18.51×**. **4,748 NBA legs capped** (of 58,879 beyond the NBA edge);
coverage unchanged at 99.55%. Earlier results are unaffected (item 1 excluded extrapolated prices; the standards
backtest has no demons). `pp_refresh_prices()` prices every version, so new legs get the cap automatically.

### FLEX TIER RULE — determinant not found; deprioritized (2026-09-21)
Pooled NBA + WNBA 2-pick quotes: every (Power payout, consolation) pair maps to ONE fixed Flex full payout (e.g. 10.5×:
0.5 → 7.0×, 0.75 → 6.0×), so PrizePicks picks a consolation first and derives the full payout from it. But the
consolation is **not** determined by the Power payout (mixing at many payout values, across many runs), **not** by the
alternate's stat family (all three tiers in every family and band), and **not** by the standard partner (same partner +
same payout → different tiers). It must depend on a per-leg property we cannot observe (likely the exact unrounded
internal price). **Deprioritized:** the standards strategy only needs all-standard Flex tables (fixed and verified), and
demon Flex slips underpay anyway.

### LESS ON GOBLINS AND DEMONS — learned from WNBA, ready for NBA (2026-09-21)
**Already priced by PrizePicks' quote engine in BOTH leagues** (the mapper's UNDER test): goblins on Less paid 3.5–4.75×
(Less on a low line is unlikely), demons on Less 1.7–2.8× (Less on a high line is likely); every such quote `is_adjusted`.
**Less run** (`PP_MODE=less`): every WNBA goblin/demon quoted More (section LEG) then Less (section LESS), back to back,
ladder by ladder — 250 legs both ways. Tables' primary keys now include `side` (before, a Less row sharing run +
projection + partner with its More row would have been silently dropped); the loader reads the LESS section.
| Finding | Evidence |
|---|---|
| **Less = complement of More**, same distribution | P(More) + P(Less) median 0.978 (demons, 144) / 0.986 (goblins, 106) |
| **NBA's formula already prices it** (points family, c 1.87, P(Less) = 1 − P(More)) | 107 legs: 4.7% mean error, 91% within 10%, median ratio 1.02 |
| **Less favourites floor at 1.7×** (factor 0.5667) — NOT the More-side goblin floor 2.08× | complement below 1.7× → paid exactly 1.7× on 28 of 36 |
| Less longshots (goblins on Less) | 3.25–8.0×; the engine cap (18.5×) not reached |
**Applied to NBA pricing:** `pp_price_version` floors are now side-aware (goblin floor on More only; Less favourites use
`less_favorite_floor_factor`, default = the goblin floor so older versions reproduce exactly). `pp-leg-v2-sqrt-cap`
carries `less_favorite_floor_factor` 0.5667. **No existing price changed** — 0 NBA alternate-on-Less keys exist (799
standard-on-Less keys are rule-priced at factor 1). When NBA offers Less on alternates, `pp_refresh_prices()` prices
them automatically. Function verified by execution (0 new prices, 9,036 keys).

### PAPER-TRADING LOG — the live test (2026-09-21, owner approved)
Strategy **`standards_3pick_v1`**: PrizePicks standard lines on the board in ONE snapshot (live: the most recently
fetched = what is on the board at logging time), model value = 2 × final_hp ≥ 1.30, one leg per player (the model's
best prop and side), ranked and cut into 3-pick slips.
- `nba_score.paper_picks` — picks with `logged_at`; **first log wins** (a night is never overwritten → honest
  pre-game timestamps)
- `nba_score.paper_pick_candidates(date, threshold, snapshot)` — the selection; writes nothing; identical live and replay
- `nba_score.log_paper_picks(date)` — hooked into **P3** right after scoring
- `nba_score.grade_paper_picks()` — hooked into **P2** right after the board is graded (hit / miss / void)
- `nba_score.paper_results` — per night: full 3-pick slips, exact Power payouts (6.0×; a void reverts to 3.0×; <2 live
  legs refunds), cumulative profit
**Replay of the exact live procedure** (`window` snapshot = the pre-game board), 12,481 picks, all graded:
2024-25 **+7.8% ± 6.7%** (162 nights, 1,821 slips, hit 57.5%); 2025-26 **+18.3% ± 5.2%** (161, 2,234, 58.4%);
**both +13.6% ± 4.3%** (323 nights, 4,055 slips; 3.2 SE). Below the never-moved variant (+16.7%), as it should be.
**PRE-SEASON MUST-FIX:** P2 and P3 default their season to `2025-26` (P3: `BS_SEASON`). On 2026-27 dates the ladder
lookup finds nothing and P3 aborts — no scores, no paper picks. Switch the season before October 20 (the same
hard-coded-season class that caused the calibration wipe).

### SHARPENING NBA MULTIPLIERS — slip rules and constants (2026-09-21, owner: multipliers don't wait on the docs)
**Per-leg constants — already about as good as NBA's data allows.** Refit on every NBA leg mined so far (103 usable, very
few players): points 1.87 → best 1.90 (no real gain), count 1.08 → 1.12, rebs+asts 1.34 → 1.30 (still 5 legs). No change.
**CORRECTION to the WNBA section above:** "rebounds/assists are league-specific" is NOT established. Inside NBA, single
ladders prefer 1.08 (SGA reb, Brunson reb, Cunningham ast) or ~1.3 (Wembanyama reb, Brunson ast): NBA's 1.08 averages 8
ladders from 4 players. NBA's data still modestly prefers ~1.1 over 1.3 (6.2% vs 8.4% mean error), so KEEP 1.08 — but
revisit with preseason NBA data.
**Hypothesis rejected: per-player dispersion.** On the sqrt scale, c = √(variance ÷ mean) of the stat (why Poisson-like
stats sit near 1 and points at 1.87). Per-ladder fitted c does NOT track the player's own season dispersion (SGA points
1.92 vs 1.29; LeBron 2.12 vs 1.35; Tatum 1.98 vs 1.00) → PrizePicks uses a FAMILY-level spread; ladder-to-ladder scatter
is mostly estimation noise (2–4 legs per ladder, payouts rounded to 0.25).

**Slips run** (`PP_MODE=slips`, WNBA board — slip rules are league-independent): all-standard slips 2–6 picks, one player
per TEAM (board rows now carry `team`), three player sets; 16 alternates (8 goblins + 8 demons, nearest to farthest
line) each priced alone, then as ONE alternate + standards at 3–6 picks. Rules written to `nba_config.pp_slip_rules`.
| Rule | Result | Status |
|---|---|---|
| All-standard Power | **3.0 / 6.0 / 10.0 / 20.0 / 37.5×** (2–6 picks) — 5 and 6 were unverified | verified |
| All-standard Flex | 3: 3.0/1.0 · 4: 6.0/1.5 · 5: 10.0/2.0/0.4 · 6: 25.0/2.0/0.4 | verified |
| Same game | two players from one game in a 3-pick: Power stays 6.0; Flex partial 1.0 → 0.75, `is_adjusted` | partial |
| **One alternate + standards** | **payout = b · f^a**: 3: b 5.330 a 1.008 · 4: 10.058 / 1.034 · 5: 18.605 / 1.057 · 6: 35.432 / 1.069 | **verified** |
| Two or more alternates | 3 picks: follows b·∏f^a (0.2–1.8%); 4–6 picks: ~7% BELOW it (obs/pred 0.92–0.97) | partial |
The one-alternate law fits with R² ≥ 0.9993 and 0.9–1.6% mean error (rounding level), vs up to 4.6% for a linear base;
the exponent climbs with slip size, so goblins sit below the all-standard base and demons rise above it. NBA's own
one-alternate slips fit it within ~2% (league- and time-consistent). The old `base_power_mixed` (±6%) is explained.
**Next:** rewrite `nba_market.pp_slip_power` on these rules and validate it against every stored quote; a targeted run
with 2- and 3-alternate slips (alternates priced alone) to model the multi-alternate haircut.

### SLIP PRICING FUNCTION REBUILT AND VALIDATED (2026-09-21)
**Multi-alternate rule (partial)** — WNBA `PP_MODE=multi` run (12 combinations of 2–3 alternates, every alternate priced
alone, 48 slips at 3–6 picks) + NBA FLEX slips. Ratio of real payout to the one-alternate law b·∏f^a, by combined
multiplier M = ∏f^a: M < 12 → 0.956–0.986 (a flat **~3% haircut** for 2+ alternates; goblin-only slips ≈ 1.0, demon-heavy
lower); M ≥ 25 (4 slips, avg 62) → **0.748: compression**, fitted by the 2-pick exponent 0.857 with a **knee at M ≈ 8.2**.
One alternate never reaches the knee (the 0.072 per-leg cap limits it to ~7.95) — why the one-alternate law shows none.
**`nba_market.pp_slip_power`** now: 2-pick unchanged; all-standard from `base_power` (3/6/10/20/37.5, all verified);
with alternates **payout = b_n · compress(∏f^a_n) · haircut** (haircut 1.0 for one alternate, 0.97 for 2+).
**Validation against 452 real quotes it never learned from** (BASE, FLEX, ALTALT, MIXED, SAMEGAME; factors from the
same run's per-leg quotes):
| Slip type | Quotes | Exact | Within 1 step | Mean error |
|---|---|---|---|---|
| 2-pick, standards | 19 | 84% | 100% | 0.5% |
| 2-pick, alternate × alternate | 240 | 54% | 95% | 2.0% |
| 3–6 picks, all standard | 16 | 100% | 100% | 0.0% |
| 3–6 picks, one alternate | 72 | 33% | 81% | 1.2% |
| 3–6 picks, 2+ alternates | 105 | 6% | 25% | 4.0% (partial; was ~7%) |

### FANTASY SCORE — mechanics, and back-simulating NBA history (2026-09-21)
**Mechanics (WNBA board; the engine is shared):**
- **Ladder = exactly one goblin + one demon per standard** (96/96/96) — not the multi-rung ladders of Points.
- **Symmetric:** goblin = standard − g, demon = standard + g; g grows with the line but less than proportionally
  (4.5 at 15.5 → 6.0 at 41.0; r = 0.97; always a whole or half point).
- **Fixed price points:** goblin More **2.3×** (all 16), demon More **4.5–4.75×** (implied p ≈ 0.65 / 0.32); Less mirrors
  exactly (demon Less 2.3×, goblin Less 4.5–4.75×). PrizePicks moves the LINES to fixed probabilities, not the prices.
- **Spread constant ≈ 2.26** (4.0% error vs 7.0% at points' 1.87) — a weighted sum is wider than points alone.
- **Scoring:** the NBA official formula PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV equals `nba_fantasy_pts` in
  `nba_stats.player_game_log` on all 26,649 2025-26 game logs (0 disagreements). PrizePicks using the same weights is
  still to be confirmed on a live NBA board.
**Back-simulation — feasible, one piece unvalidated:** prices are constants; outcomes are exact from box scores; the model
ALREADY builds `fantasy_score` ladders (3,521 rungs on 2026-01-15), so simulated legs can be scored. **The weak link is the
center:** PrizePicks' NBA Fantasy lines were never archived, and its component standards are too sparse to rebuild one
(2026-01-15: 150 players, 36 with points+rebounds+assists, **0 with all six**). Plan: center = weighted sum of component
medians (PrizePicks where present, else sportsbook consensus); rungs at ±g(center); prices 2.3× / ~4.6×. **Validate first on
the NBA preseason board** (~Oct 3) — the board-row loader (`nba_market.pp_board_row`, every stat's line side by side, both
leagues) captures Fantasy and component lines together on the first full NBA map. (WNBA: only 4 players carried all four
lines at once — inconclusive; the average gap Fantasy − (PTS + 1.2 REB + 1.5 AST) was +3.3, about what 3 STL + 3 BLK − TOV adds.)

### BACK-SIMULATING PROPS WE HAVE NO HISTORY FOR — the spec (2026-09-21)
**Why:** when NBA boards go live the lines are real, but the backtest must already be done — for props the archive
never carried (Fantasy Score, FG/3-PT attempts, free throws, splits, combos, period props).

**Prop families** (WNBA + NBA boards, `nba_market.pp_board_row`):
| Family | Props | Ladder | Prices |
|---|---|---|---|
| A. Formula ladders | Points, Rebounds, Assists, 3PM, PRA, P+R, P+A, R+A | several goblins/demons | formula, capped 18.5× — in the archive |
| B. Fixed three-rung | Fantasy Score, FG Attempted, 3-PT Attempted | 1 goblin + 1 demon, symmetric | near-fixed points (FS 2.3× / 4.5–4.75×) |
| C. Alternates only | Turnovers, Blks+Stls, Offensive Rebounds | no standard line | goblins 2.4–2.8×, demons 3.25–3.75× |
| D. Standard only | FT Made/Attempted, FG Made, Defensive Rebounds, two-player combos | none | factor 1 |
Universal: the nearest demon never pays under **3.25×**.

**1. PrizePicks' standard line = sportsbook consensus** (NBA archive, 12 nights across both seasons, `window` snapshot):
points 76% identical / 93% within 0.5 / 99.9% within 1 (1,320 pairs, bias −0.02); PRA 72/91/99.9; P+R, P+A 67–75/91/99.9;
rebounds, assists, R+A 54–60/99.7–100/100; threes, blocks, steals, turnovers 100% identical. → **book consensus is an
unbiased, model-independent stand-in for PrizePicks' line.** (A center taken from OUR model would make the backtest
circular.)
**2. Every line comes from one projection per player** (WNBA): Fantasy Score = PTS + 1.2 REB + 1.5 AST + 3·(STL+BLK) − TOV
of the component centers (11 players: mean gap +0.63, sd 1.02; without STL/BLK/TOV +3.38, sd 2.38); **two-player combos =
sum of the two lines** (18 combos: +0.29, sd 0.24); **OREB + DREB = REB** (5 players: −0.18).
Tool: `nba_market.pp_norm_inv(p)` (Acklam, round-trip error 7e-8) runs the formula backwards — a priced alternate →
the center it implies; recovers standards within 0.10–0.44 (rebounds/assists 100% within 0.5, points 92% within 1).
**3. Fantasy Score for NBA history — center VALIDATED on real outcomes:** center = weighted sum of book-consensus
component lines, **missing components (mostly STL/BLK/TOV) = the player's prior-30-day MEDIAN, no offset**, rounded to
.5 → **over the center 51.9%** (1,315 player-nights, 12 nights; target 50%). (First version used 30-day MEANS + the WNBA
+0.6 offset → 43.0%: means overstate small skewed counts that carry weight 3.)
**Rungs — demon validated, goblin NOT:** gap g = 1.98·C^0.3 (WNBA fit, symmetric) → demons hit **31.9%** (price implies
~32% ✓) but goblins **73.5%** (price implies ~65%). No symmetric gap fixes both — NBA Fantasy is right-skewed. Either NBA
Fantasy goblins are genuinely generous or PrizePicks spaces NBA Fantasy differently; **treat Fantasy goblins as
unverified until the NBA preseason board.** Prices: goblin 2.3×, demon 4.5–4.75×, Less mirrored. Outcomes exact from
`nba_stats.player_game_log`; the model already ladders `fantasy_score`.
**4. Not yet validated:** standalone FG/3-PT attempts, free throws, OREB/DREB splits (no book lines — need player-rate
projections); period props (1Q/1H) and double-double.
**Correction — goblin floor is not universal:** NBA points-family goblins stop at 2.1× (2.08 floor), NBA rebounds/threes
reach 2.0×, WNBA goblins reach 1.9× in most stats. Set NBA count-family floors from preseason data.

### CONSERVATIVE MODE — owner policy (2026-09-21)
**Owner:** anything we derive or backtest must aim for LESS earnings — harder lines, lower multipliers, with wiggle room
sized to what we don't know; change later if the real boards say otherwise. Interpretation applied: "harder" = an OVER
line moves UP (goblins AND demons), an UNDER line moves DOWN. Verified exact constants (standard factor 1; all-standard
bases 3/6/10/20/37.5) are observations, not estimates, and stay unshaded.
**Every safety number lives in ONE table, `nba_config.pp_conservative_policy`** (value + evidence per row):
| Key | Values | Evidence |
|---|---|---|
| `leg_haircut` | favourites 3%, longshots 7%, extrapolated 17%, standards 0 | 1 − p10 of real/model: NBA goblins 0.971 (124), NBA demons 0.933 (235), beyond-edge demons 0.827 (95) |
| `slip_haircut` | 2-pick alternates 2%, one alternate 2%, multi-alternate 6%, all-standard 0; round DOWN | slip validation errors 2.0% / 1.2% / 4.0% (worst 17%) |
| `derived_line_shift` | Fantasy Score 1.0, combos 0.5, default 0.5 — against the pick | FS reconstruction sd ~1–1.4; combos sd 0.24 |
| `fantasy_score` | gap = round½(3.2 + 0.07·C); goblin 2.2×, demon 4.0×; Less mirrors | WNBA prices 2.3× / 4.5–4.75× shaded and rounded down |
**Per-leg: `pp-leg-v2-sqrt-cap-conservative` is CURRENT** (`pp_price_version` gained haircut_favourite / _longshot /
_extrapolated, default 0). Verified against the best estimate on all 9,036 keys: ratios exactly 0.83 (982 extrapolated),
0.97 (2,763 favourites), 0.93 (3,405 longshots), 1.00 (1,691 standards); 0 other fields changed — which also proves the
rewrite reproduces the best estimate exactly. **The best estimate `pp-leg-v2-sqrt-cap` is kept** — flip back with two
statements.
**Slips: `nba_market.pp_slip_power_conservative(factors)`** = best estimate × (1 − slip haircut), rounded DOWN to the grid.
Against 452 real quotes (real leg factors): at or below the real payout **97.1%** (2-pick alternates, 240), **97.2%** (one
alternate, 72), **96.2%** (2+ alternates, 105) — vs 55–67% for the best estimate.
**Found: same-game slips pay less.** All-standard slips are exact EXCEPT same-game ones (a 2-pick of opponents paid 2.9×,
not 3.0×; Flex partials cut) — the 8.6% of all-standard overshoots. The standards backtest and paper log never stopped
two legs coming from one game. **Conservative fix for the backtest build: every slip uses legs from DIFFERENT games.**
**Spacing research — exhausted with the data we have:** fixed-rung props are SYMMETRIC and follow schedules — Fantasy
Score gap = round½(3.2 + 0.07 × line) (reproduces all 15 distinct WNBA lines, 32/32 ladders); FG Attempted gap 2.0 (lines
8.5–15.5); 3-PT Attempted 1.0 (4.5–6.5), 2.0 at 8.5. Price targets: goblins ~0.65–0.675, demons ~0.32–0.36. On NBA outcomes
the Fantasy demon spacing matches its price (31.9% vs ~32%); goblins hit 73.5% vs ~65% — the one open question; the line
shift and the shaded 2.2× cover it until the NBA preseason board settles it. Formula-ladder props need no spacing model:
their real rungs are archived.

### OWNER RULE CONFIRMED (2026-09-21)
**Every DERIVED line is made harder — goblins and demons alike, whatever their threshold. Real archived lines and
verified exact payouts are untouched.** Model-estimated multipliers (incl. historical goblin/demon prices) count as derived
and are shaded; one flip restores the best estimate if the owner decides otherwise.

### FANTASY SCORE BACK-SIMULATION — BUILT (2026-09-21)
`nba_market.build_fs_backsim(from, to)` (plain SQL; the PL/pgSQL draft failed on variable substitution) → table
`nba_market.fs_backsim`: **32,170 player-nights** (2024-25 15,916; 2025-26 16,254). Per player-night: book-consensus
components (+ 30-day-median fallback flag), best-estimate center, gap, CONSERVATIVE lines (standard Over at center + 1,
Under at center − 1, goblin and demon a point harder, all moved to the next harder .5 — no pushes), conservative factors
(2.2 / 4.0 ÷ 3, from the policy table), the model's probability at each exact line (`baseline_history`, fantasy_score
rungs every .5), and the box-score outcome. Rebuild after any policy change.
Test week (Jan 12–18 2026, 675 rows): best center 50.4% over; conservative Over 45.0%, Under 44.2%, goblin **64.0%**
(below its price's ~65% — the WNBA spacing doubt can no longer flatter a backtest), demon 25.1%; 0 lines off .5; 0 lines
easier than the rule; model probability present on 76% (the rest fall outside the model's ±10 ladder).
**Results (conservative):** realized value per leg — goblins 0.976 / 0.983, standard Over 0.939 / 0.942, standard Under
0.851 / 0.841, demons 0.763 / 0.771 (2024-25 / 2025-26). The model still ranks (realized climbs 0.83 → 1.06–1.07 across
its claim buckets, both seasons), but its best leg per player-night returns **1.03–1.04 — below the 3-pick breakeven
1.10.** Under these deliberately harsh assumptions Fantasy Score does not clear; real lines may show the one-point
penalty is too harsh — revisit on the NBA preseason board.

### GAME-AWARE SLIP PACKING (2026-09-21)
`nba_score.paper_pick_candidates` now carries each pick's event_id; **`nba_score.paper_pick_slips(date, threshold,
snapshot)`** packs greedily — picks in rank order, each into the first open slip with no leg from its game — so every
slip spans three DIFFERENT games (same-game slips pay less). `log_paper_picks` now logs these slips (paper_picks gained
event_id). Test night 2026-01-15: 45 picks → 15 full slips, 0 same-game (rank-order packing had 1).
**Standards strategy replay, game-aware** (window lines, exact payouts): 2024-25 **+10.1% ± 6.1%** (154 nights, 1,755
slips, hit 57.4%); 2025-26 **+18.0% ± 5.6%** (155, 2,166, 58.4%); **both +14.5% ± 4.2%** (309 nights, 3,921 slips; 3.5 SE);
0 same-game slips. Nights with fewer than three games produce no full slip (14 nights) — correctly sat out.

### DERIVED BOX-SCORE PROPS — research, a caught artifact, results (2026-09-21)
**Which props have book lines (NBA archive, 6 sample nights):** points, rebounds, assists, threes, the four combos (~110–118
players/night); blocks ~94; double-double ~90 (books only); steals ~58; blocks+steals ~45; turnovers ~25 (DraftKings only).
**No book market at all** for FG attempted/made, free throws, 3-PT attempted, offensive/defensive rebounds, quarter props.
**Estimator test 1 — against real book lines** (stats that have them, pretend unknown; 12 nights): the prior-30-day MEAN
beats the median everywhere (median runs 0.1–0.25 low); **points-scaled** (tonight's book points line × the player's
stat/points ratio) wins for scoring volume (threes 0.326 vs mean 0.396 MAE, 79% within 0.5).
**WNBA cross-check — PrizePicks cuts every line from one box-score projection:** makes/attempts line ratios are real
shooting % (FG 0.45, FT 0.78, 3PT 0.34), points/FG-attempt 1.28, and **PTS = 2·FGM + 3PM + FTM within −0.11 ± 0.38**.
**Estimator test 2 — against NBA outcomes** (the proxy for a sharp line; it ranks threes the same way test 1 does):
FGA points-scaled 2.97 (identity 2.99, best centered); FGM/FTA/FTM/3PA points-scaled; OREB/DREB **rebounds line × share**.
Estimating 3PA from the threes line is WORST (2.07) — a player's 30-day make rate is too noisy.
**Built:** `nba_market.build_derived_backsim(from, to)` → `nba_market.derived_backsim` (179,712 legs, both seasons):
center = estimator − per-prop offset, nearest .5; conservative Over/Under lines (policy `derived_line_shift`: FGA/FGM/FTA 1.0,
FTM/3PA/OREB/DREB 0.5 = estimator line-error rounded UP); the model's probability at each line; box-score outcome.
**Caught: an Under artifact.** First build's centers (mean-like) sat ABOVE the outcome median on low counts (best-center over
FTM 37%, OREB 36%, FTA 40%) — the model's top picks were ~80% Unders and looked like 1.13–1.16. Real PrizePicks low-count
lines (blocks, steals, turnovers, stocks) hit Over **47.5–49.2%**. Fix: policy **`derived_center_offset`** (FGA 0, FGM/3PA/DREB
0.25, FTA/OREB 0.5, FTM 0.75) brings every prop's best-center over-rate to 47–50%. The model's real edge on low counts is
confirmed on REAL lines: its ≥1.30 picks pay on both sides (steals 1.39 / 1.32, turnovers 1.29 / 1.26, blocks Over 1.35).
**Results after the fix (best derived leg per player-night):** ≥1.30 **1.063 ± 0.017 / 1.093 ± 0.016** (2024-25 / 2025-26),
≥1.40 1.068 / 1.122 — as a group BELOW the 3-pick breakeven 1.10. Most of the first build's edge was the artifact.
**Free throws stand out, both sides, both seasons:** FTM Over 1.293 / 1.322 (364 legs, hit 65%), FTM Under 1.258 / 1.205
(140), FTA Under 1.294 / 1.205 (112). 3PA 1.03–1.14; FGA 1.01–1.09; **rebound splits fail** (DREB Under 0.99 / 0.99, OREB
Over 0.76 / 0.94) — exclude. Free throws are a candidate only after the NBA preseason board validates the proxy lines.

### PROP UNIVERSE — every workable leg, both seasons (2026-09-21/22)
**`nba_market.prop_universe`: 1,667,024 legs, 20 props, 327 regular-season nights** — 1,088,192 real archived PrizePicks legs
(100% of classified archive legs) + 578,832 simulated. **Usable** (model probability, graded, unflagged): **1,606,151**.
Sources: REAL = `pp_model_vs_price` (lines, model p, outcomes) with multipliers from `pp_leg_price_cons` (materialized current
conservative prices, kind-matched — the Item-1 table's own factors predate the conservative model: goblins +3.1%, demons
+7.5–109%). SIMULATED = `fs_backsim` (Fantasy 128,680: standard Over/Under, goblin, demon) + `derived_backsim` (337,748: FGA,
FGM, FTA, FTM, 3PA points-scaled; OREB/DREB rebounds-share; Over/Under) + `derived_alt_backsim` (112,404: FGA/3PA goblins and
demons, policy `derived_alt_rules`: FGA gap 2.0, 3PA gap 1.0/2.0 from center 7, goblins 2.1×, demons 4.0×/3.25×).
**Columns:** game (event_id pre-game from `player_game_map`, home/away, team_id from box score) · leg (prop, kind, side, line) ·
provenance (line_source real/simulated; price_source exact / model-conservative / policy-conservative; method) · factor +
two_pick (= 3 × factor) · model_p · stat_actual · result (hit / miss / push / void = sat out / NULL = ungraded) · hit · phase · flag.
**Labels:** phase from the NBA game-ID season-type digit (mode per night). `no-boxscore` = 30 nights the game log lacks (28
play-in/playoff nights Apr 15 – May 13 2025 + NBA Cup finals Dec 17 2024 and Dec 16 2025): 14,271 legs, ungraded. flag
`demon_priced_below_standard` (148: the 7% longshot haircut took a near-standard demon under 1.0); `kind_price_mismatch` (0).
**Rebuild chain, per season:** `refresh_leg_price_cons` → `build_fs_backsim` → `build_derived_backsim` →
`build_derived_alt_backsim` → `rebuild_prop_universe` (the build sets phase and flags at insert; `finalize_prop_universe` is a
verifier that rewrites only rows that disagree — final run corrected 0).
**Final audit — 12 integrity checks, all 0:** standards exactly 1.0 and demons above 1.0 unless flagged; goblins below 1.0 and
never under 1.843×; demons never over 18.5×; two_pick = 3 × factor; no null factor or phase; no graded leg on a no-boxscore
night; no ungraded leg on a regular night; simulated pushes only on Fantasy (x.5 Fantasy scores exist); no alternate Unders.
**Not simulated (no evidence):** Turnovers / Blks+Stls / OREB alternates (WNBA posts them without a standard — no spacing
reference), Double-Double (no PrizePicks data at all), quarter props (no data).
**Engineering fixes (don't repeat these):** (1) *Planner misestimate* — the live view `pp_leg_price` joins on expressions; the
planner expects ~757 rows per season instead of ~1M and picks a nested loop: the first universe build ran 9 min and was
cancelled. Materializing the prices (+ ANALYZE) → a season builds in under a minute. (2) *Nondeterministic duplicates* — the
first price table was keyed without kind; 34 of 2.19M groups carry the same line as two kinds in one snapshot (19 universe
legs exposed), so the price picked was arbitrary (flags moved 153 → 158 between refreshes). Now kind is in the key, ties go
window snapshot first then the LOWER factor, and each leg takes the price matching its PrizePicks kind (else the lowest);
1,289,896 price rows. (3) *Double writes* — phase and flags were set by an UPDATE of every row after insert (2025-26 rebuild
~10 min, table bloated to 938 MB). Now set at insert (2025-26 rebuilds inside the connection limit); VACUUM ANALYZE run.

### GOBLIN FLOOR CORRECTED — 2.08× → 1.9× (2026-09-21)
The slip rule `goblin_floor` (marked VERIFIED: deepest goblins 2.1× displayed, true ≈2.08×) **is wrong.** Clean evidence — More
goblin + STANDARD partner (partners checked on the board), DIFFERENT games: **NBA 2.0×** (3 distinct legs: SGA 3PM 0.5, Tatum 3PM
1.5, Cunningham REB 3.5; 9 quotes over 3 runs); **WNBA 1.9×** (26 legs, 36 quotes) and 2.0× (46 legs, 62 quotes). Not a
same-game discount: every sub-floor quote is a different-game pair.
**The formula needs no floor:** without one it tracks real WNBA points-family prices (c 1.87, verified equal to NBA) —
real/formula 1.019 at 1.9×, 1.025 at 2.0×, 0.999 at 2.1×, 0.96–1.02 from 2.2× to 2.9× (130 quotes). The old floor overpriced
legs really paying 1.9× by 9.5% and 2.0× by 4%, and put the "conservative" price of the deepest goblins (2.018×) ABOVE what
PrizePicks pays — optimistic, against the owner rule.
**Fix:** new price version `pp-leg-v2-sqrt-cap-conservative-floor190` (goblin_floor_factor 0.6933 → 0.6333; otherwise identical),
priced BEFORE switching (9,036 keys) and diffed: only 1,024 goblin keys changed, all cheaper (now 1.843×–2.017×, avg −6.5%);
standards, demons, Under and unknown-kind keys identical. Switched atomically; `goblin_floor` rule → superseded with evidence.
In the universe: 80,756 real goblins now priced below the old conservative floor, 20,738 at the new minimum 1.843×.

### VOID / PUSH REVERSION — verified from PrizePicks' own schedules (2026-09-22)
`pp_quote.power_srp` / `flex_srp` (2,662 quotes) hold PrizePicks' reversion schedules. Rule `reversion_values` (verified):
**All-standard Power** — r legs left → the r-pick base (20, 10, 6, 3), **1.5× for a single survivor**, refund only if none left.
**All-standard Flex** — r ≥ 3 → the r-pick Flex schedule (10/2/0.4, 6/1.5, 3/1); **r = 2 → 3× Power-style** (NOT the 2-pick Flex
2/0.5); r = 1 → 1.5×. **79 of 79** schedule entries match (n = 2–6, every remaining count, Power and Flex, incl. same-game-adjusted).
**Mixed slips** — PrizePicks shows the payout of the r **LOWEST-factor** legs of the original slip (worst case for the bettor):
within one price step 99.5% / 96.6% / 91.3% for 2 / 3 / 4 legs left (mean ratio 0.997 / 1.004 / 1.002); keep-highest matches
0–20%. 5 left: 57.5% (ratio 1.019, the partial multi-alt law runs low); 1 left: 1.5 × factor runs ~6% under PrizePicks.
Settlement by the displayed worst case or by the actual survivors both pay ≥ keep-lowest → grading by keep-lowest is conservative.
Functions: `nba_market.pp_power_after_voids(factors[], live)`, `nba_market.pp_flex_standard_payout(legs, hits, original)`.

### SLIP SIMULATOR — built and validated (2026-09-22)
`nba_score.sim_strategy` (named strategies; params: n, slip_type power|flex, min_value = leg value 2 × factor × model_p, kinds,
sources, props, sides, max_slips_per_night) → `nba_score.simulate_slips(strategy, from, to)` → `nba_score.sim_slip` (one row per
slip: legs, factors, model probabilities, conservative full payout, model EV, hits/misses/voids, graded payout, profit) →
`nba_score.sim_results` (per strategy × season: ROI, night-clustered SE, t, leg hit rate, claimed vs realized payout per unit).
Per night: unflagged graded universe legs above min_value, ONE leg per player, greedy packing in value order into slips of n legs
from n DIFFERENT games; Power priced by `pp_slip_power_conservative` (any mix), Flex all-standard only (the verified schedule).
**Validation** — `std3_power_130` (real standards, value ≥ 1.30, 3-pick Power) reproduces the independent window-line replay:
2024-25 **+10.2% ± 6.3%** (1,971 slips; replay +10.1%), 2025-26 **+20.4% ± 5.3%** (2,408; replay +18.0%), both **+15.8% ± 4.1%**
(4,379 slips, 310 nights, t 3.85); every slip priced at the exact 6.0×; 312 void legs graded by reversion. Test week: 3 legs from
3 games in every slip, payouts only 0 / 3.0 / 6.0, model EV = 6 × ∏p exactly. Claimed 2.33 per unit vs realized 1.16.
(A suspicious leg — Pritchard P+R standard 28.5 — checked against the raw board: genuinely the standard; ladder 23.5/24.5 goblins,
34.5/39.5 demons. Kind labels hold.)

### LEG EDGE MAP — first readout (2026-09-22)
View `nba_market.leg_edge_map`: every graded, unflagged regular-season universe leg by season × prop × kind × side × source ×
claimed-value bucket; claimed = 2 × factor × model_p, realized = 2 × factor × hit (a standard needs 1.10 in a 3-pick; alternates
face lower mixed bases, ~1.14). Confident picks (claimed ≥ 1.30), realized 2024-25 / 2025-26: real standard Over **1.133 / 1.130**
(14,429 legs), real standard Under 1.099 / **1.131** (26,970), real goblin Over **1.137** / 1.100 (2,480), real demon Over 1.060 /
1.018 (73,495), simulated standard Over 1.098 / **1.123** (6,236), simulated standard Under 0.984 / 1.026 (9,299), simulated goblin
1.163 / 1.149 (120), simulated demon 0.968 / 0.982 (2,876). Real standards carry edge in both seasons; demons and simulated Unders
do not; the model claims 1.36–1.63 everywhere (overconfident). Next: per-prop cells, then strategies built from the cells that hold.

### ORIGINAL BUILD CHECKLIST (2026-09-21, before the build) — SUPERSEDED by BUILD STATUS above
*Kept for the record. Items 1–3 are built; item 7 is resolved structurally; see BUILD STATUS and REMAINING.*
1. **Schema** — the four tables and the view
2. **Fill version 1** — the current normal model, with its big-demon bias recorded in `pp_pricing_model`
3. **Slip rules** into `pp_slip_rules`
4. **Version 2** — skew fix; re-validate leave-one-player-out; flip "current" only if it beats v1
5. **Rescue tier: same-day snapshot** (3,227)
6. **Rescue tier: sportsbook consensus** — validate first (35,951)
7. **Investigate ≥ 63 keys** tagged standard on some legs and goblin/demon on others — one Price ID must mean one kind
8. **Load mined live prices** as `source = 'mined'` (needs a PrizePicks stat-name ↔ Odds-API market map)
9. **When the preseason board posts (2026-10-03):** re-validate on dozens of players; re-run if the model moves
