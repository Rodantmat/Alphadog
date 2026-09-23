# NBA DATABASE — every schema, table and column

**Purpose.** The complete data dictionary: what exists, what each column holds, and the specifics that
matter (keys, defaults, sizes, gotchas). Built transcript by transcript from the actual `CREATE TABLE`
statements and `information_schema` reads, not from memory.

**Source discipline.** Every entry here came from a real DDL statement or a real schema query in a
transcript. Where a table was altered later, the change is noted with its transcript.

---

> # 📑 **INDEX — `NBA_DATABASE.md`**
> **`117` sections · `171,747` bytes · `2,343` lines · built `2026-09-23`.**
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** *(`§T20.22`: `6` of `16` line-number pointers
> rotted within a day)*. **Search for the quoted `§` label.**
> 🔴 **SECTION ORDER IS NOT NUMERIC.** *The file opens with the trigger map, then the audit blocks in
> the order `0y-T17-B`, `0y-T17-C`, `0y-T17`, `0x-T16`, `0w`, then `0`, `0u`, `0v`, `0z`, then the
> schema walk `1` → `11`.* **This index is in logical order.**
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🔴🔴 **what actually WRITES to this database, and when** | **`THE TRIGGER MAP`** *(first section)* |
> | **the schema for a layer** | `nba_ref` **`§1`** · `nba_stats`/`nba_team` **`§1b`** · weekly differential **`§1c`** · `nba_config` **`§2`** · tiering config **`§2b`** · `nba_control` **`§3`** · `nba_score` **`§4`** · `nba_market` **`§5`** · other `nba_stats` **`§6`** |
> | 🔑 **the two universes** *(the split everything else assumes)* | **`§0`** |
> | 🔴 **the storage incident and the shrink that fixed it** *(since consumed six times over)* | **`§0v`** |
> | 🔑 **the owner's storage directive — and why it is CONDITIONAL** | **`§0y-T17`** |
> | 🔴 **the storage diet plan as recorded** | **`§0y-T17-B`** |
> | 🔴 **four indexes, three wrong diagnoses, and one `EXPLAIN`** | **`§0y-T17-C`** |
> | 🔴 **the index audit that found `303 MB` never scanned** | **`§0x-T16`** |
> | 🔑 **the measured infrastructure limits** *(where the `43 GB` resolves)* | **`§0u`** |
> | 📐 **every population this sweep's bound claims are drawn over** | **`§0z` — THE CLASS REGISTER** |
> | ✅ **the certified baseline result** *(carried in the live code header)* | **`§9`** |
> | **MLB tables referenced as models** *(never written by NBA)* | **`§11`** |
> | ✅ **a live numeric re-verification of everything `T18` published** | **`§0z2-T18`** |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🔴 **A · WHAT WRITES HERE — read first if anything looks stale**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`THE TRIGGER MAP`** | 🔴🔴 **What actually writes to this database, and when** *(`T20` pass 116, `§T20.121`)* — **the wiring the corpus documented tables and scripts for, but never the EDGE between them** | 🔴🔴 |
>
> ### 🗄 **B · THE SCHEMA WALK — the data dictionary proper**
> | § | schema / layer |
> |---|---|
> | **`0`** | 🔑 **THE TWO UNIVERSES** — *the split every other section assumes* |
> | **`1`** | **`nba_ref`** — reference / dictionary layer *(`T1`)* |
> | **`1b`** | **`nba_stats` / `nba_team`** — the weekly profile layer *(`T2`)* |
> | **`1c`** | **The WEEKLY DIFFERENTIAL layer** *(`T3`)* |
> | **`2`** | **`nba_config`** — NBA control configuration *(`T1`)* |
> | **`2b`** | **The TIERING CONFIG layer** *(`T8`, materialised from the five-dimension design)* |
> | **`3`** | **`nba_control`** — run bookkeeping *(`T1`)* |
> | **`4`** | **`nba_score`** — the engine's output layer |
> | **`5`** | **`nba_market`** — boards, market and grading |
> | **`6`** | **`nba_stats` / other** |
> | **`11`** | **MLB tables referenced as models** *(never written by NBA)* |
>
> ### 💾 **C · STORAGE, PERFORMANCE AND THE INCIDENTS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0u`** | 🔑 **The infrastructure limits, MEASURED — and the `43 GB` finally resolves** `[LIVE-AUDIT]` | 🔑 |
> | **`0v`** | 🔴 **The storage incident, the shrink that fixed it — and the shrink has since been consumed six times over** | 🔴 |
> | **`0y-T17`** | 🔑 **"WE NEED A DIET" — the owner's standing storage directive, and it is CONDITIONAL** | 🔑 |
> | **`0y-T17-B`** | 🔴 **The storage diet plan as recorded** — `storage_diet_plan_2026_09_17` | 🔴 |
> | **`0y-T17-C`** | 🔴 **Four indexes, three wrong diagnoses, and one `EXPLAIN`** — origin of COMPASS fact 104 | 🔴 |
> | **`0x-T16`** | 🔴 **The four performance lessons, and a live index audit finding `303 MB` never scanned** `[LIVE-AUDIT]` | 🔴 |
> | **`10b`** | **Two operational patterns for the live system** | |
>
> ### ✅ **D · VERIFICATION AND THE CLASS REGISTER**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0w`** | 🔑 **The `2026-09-13` session's tables, re-taken live — five reproduce exactly, ONE DOES NOT** `[LIVE-AUDIT]` | 🔑 |
> | **`0z`** | 📐 **THE CLASS REGISTER** — every population this sweep's bound claims are drawn over. ⚠ **Read this before trusting any "all `N` tables" statement in any of the twelve.** | 📐 |
> | **`0z-T18`** | **The two measurement tables the prose reported only in part** | |
> | **`0z2-T18`** | ✅ **Live numeric re-verification of everything `T18` published** | ✅ |
> | **`9`** | ✅ **THE CERTIFIED BASELINE RESULT** *(`T8`, carried in the live code header)* | ✅ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` tells you whether a table is being written at all; `B` what is
> in it; `C` what it costs; `D` how far to trust the numbers.*** ⚠ **`§0z` is the single most
> important section for anyone quoting a count out of this file** — it names the population every
> bound was drawn over.

---

## 🔴🔴🔴 **THE TRIGGER MAP — WHAT ACTUALLY WRITES TO THIS DATABASE, AND WHEN** *(T20 pass 116, `§T20.121`, 2026-09-23)*

> ⚠⚠ **READ THIS BEFORE ANY TABLE ENTRY BELOW.** *The dictionary says what each table HOLDS. This says
> **what puts anything in it** — and for fifty of the fifty-two objects, the answer is "a person."*
>
> **Populations re-derived from source, `2026-09-23T00:05:16Z`**: `40` called scripts · `21` Workers ⇒
> **`41`** Worker write-targets + **`13`** Python write-targets *(from `11` writer scripts)*,
> intersection **`2`** ⇒ **`52` distinct objects.**
>
> | what fires it | paths | live freshness |
> |---|---|---|
> | 🔴 **NOTHING IN THE REPO** — the 21 Workers, reachable only by `POST /run` *(`NBA_WORKERS.md:1662`, the no-orchestrator rule)* | **41** | **every measurable table `15`–`23` days stale** — newest `2026-09-08`, oldest `2026-08-31` |
> | 🔴 **A PIPELINE STEP, in a pipeline with NO cron** — `P2`, `P3` | **10** | `2`–`12` days |
> | ✅ **CRON** — `P1`, Mondays `0 19 * * 1` | **1** · `nba_ref.defender_ratings` | 🔴 `built_at` **`2026-09-13`** |
> | ✅ **CRON** — `nba-referees.yml`, daily `30 15 * * *` | **1** · `nba_ref.referee_assignments` | 🔴 **`0` rows** |
>
> ⇒ 🔴🔴🔴 ***TWO of FIFTY-TWO write paths have an automatic trigger, and both are empty or stale.***
>
> **Writer → pipeline** *(read from the workflow files, not from memory)*: `archive_live_boards` **P3**
> · `build_asof_calibration` **P2** · `build_availability_delta` **P3** · `build_blowout_model` **P2** ·
> `build_confidence_v3` **P2** · `build_defender_ratings` **P1** · `build_rung_market` **P3** ·
> `grade_board_outcomes` **P2** · `load_baseline_ladder` **P2** · `score_board_legs` **P3** ·
> `scrape_referee_assignments` **P2 *and* `nba-referees.yml`**. **`P1` cron `1` · `P2` cron `0` ·
> `P3` cron `0`.**
>
> 🔴 **AND THE ONE PIPELINE WITH A CRON HAS PRODUCED NO WRITE IN ITS LAST TWO WINDOWS.**
> `nba-p1-weekly-static.yml:92–95` runs `build_defender_ratings.py` **unconditionally, no `if:` gate**,
> and that script stamps `built_at`. **Live `max(built_at)` = `2026-09-13T17:01:08Z`, while the Monday
> crons of `2026-09-14` and `2026-09-21` have both passed.** ⚠ **CAUSE NOT ESTABLISHED** — either the
> workflow is not completing, or the step runs and does not write *(the script has a `> 10k` row floor
> at `:64–67`)*. *Named rather than chosen; the run log for that workflow could not be filtered here.*
>
> > ✅✅ **RESOLVED AS FAR AS THE EVIDENCE ALLOWS — T20 pass 117 (`§T20.122`), 2026-09-23, using
> > `git log` as a second, independent run log.** *(`git log --since=2026-08-24 --author="github-actions"`
> > ⇒ `1,413` bot commits over 30 days — **every workflow that commits leaves a dated record of a run
> > that actually happened**.)*
> >
> > 1. ✅ **A POSITIVE CONTROL ELIMINATES "crons do not fire in this repository."** **`nba-scrape.yml`**
> > *(cron `0 9 * * 1`, Mondays)* committed `Update NBA teams JSON` on **`2026-09-21` (Monday)** and
> > **`2026-09-14` (Monday)** — **both of the last two.** ⚠ *Both at ~`16:35`–`16:38` UTC against a
> > `09:00` schedule — a consistent `7.5`-hour offset, **recorded and not explained** (rule 6).*
> > 2. 🔴 **`P1` LEAVES NO TRACE ON THE COMMIT INSTRUMENT EITHER**: its `NBA season tables (…)` commits
> > stop at **`2026-09-10`, a Thursday**, in a three-commit backfill burst. **Nothing on either Monday.**
> > 3. 🔑🔑 **AND THE ONE DATABASE WRITE IT DID PRODUCE — `2026-09-13` — WAS A SUNDAY.** **`P1`'s cron
> > is Monday**, so **that write cannot have come from the schedule; it was a dispatch.**
> >
> > ⇒ 🔴🔴🔴 ***There is no evidence, on EITHER instrument, that `P1`'s Monday cron has produced
> > anything in the last thirty days — while a sibling Monday cron in the same repository produced a
> > commit on both of the last two Mondays.***
> > ⚠ **Still open and named**: whether `P1` is *not starting*, *starting and failing before its first
> > write*, or *running and committing nothing because nothing changed*. 🔑 **That last reading is now
> > the weaker one** — it explains the commit silence but not the database silence, since
> > `build_defender_ratings.py` runs unconditionally at `:92–95`. ▶ **What would close it: that one
> > workflow's own run list.**
>
> 🔑 **WHY THIS IS NOT BRIEF ITEM `B` RESTATED**: `B` says the static tables are frozen. **This says
> what would unfreeze them — and that for all thirty the answer is a Worker, and for all twenty-one
> Workers the answer to "what fires it" is NOTHING IN THE REPO.** ⇒ ***The staleness is not a stalled
> job. There is no job.***
>
> 📌 **Freshness, oldest first** *(Worker tables, `max(updated_at)`)*: `nba_ref.teams` · `team_aliases`
> **`08-31`** · `player_aliases` · `arenas` · `officials` · `player_tracking_profile` ·
> `nba_team.season_profile` · `player_onoff_profile` **`09-01`** · `player_impact_rating` ·
> `nba_calendar.games` · `player_playtype_profile` · `nba_team.playtype_profile` ·
> `player_tracking_detail` **`09-02`** · `player_shot_quality` · `player_shot_zone_profile` ·
> `player_season_profile` · `nba_ref.players` · `player_game_starter_status` **`09-03`** ·
> `nba_team.lineup_profile` **`09-04`** · then the **`09-08`** group: `player_game_log_usage`,
> `_scoring`, `player_career_season_totals`, `player_splits`, `team_splits`, `player_game_log`,
> `team_game_log`, `player_game_log_advanced`, `team_game_log_advanced`, `defense_vs_position`,
> `game_officials`.
>
> ▶ **Full derivation and the two logged kills: `NBA_MASTER_SUMMARY.md` `§T20.121`.**
> ▶ **The board half of this map is `T20-22` (`§T20.120`).** ⚠ *Documented, not fixed (rule 1).*
>
> ## 🔑🔑 **AND THIS DATABASE RUNS TWO PLAYER-ID CONVENTIONS, SPLIT ALONG THE SAME LINE** *(`§T20.126`, 2026-09-23)*
>
> | layer | schemas | convention | example |
> |---|---|---|---|
> | **the 21 Workers** | `nba_ref` · `nba_stats` · `nba_team` · `nba_calendar` | 🔵 **prefixed** | `nba_ref.players` → **`nba_101108`** |
> | **the 40 called scripts** | `nba_score` | 🟡 **bare** | `nba_score.baseline_ladder` → **`101108`** |
>
> ⇒ ***The id split follows the WRITER split exactly, and it is stronger than a separation of
> concerns: the two layers could not join each other's rows if they tried.*** *(Comparing them needs
> `replace(player_id, 'nba_', '')`, which is how this was found.)*
>
> 🔴 **ONE TABLE SITS ON THE WRONG SIDE**: **`nba_ref.player_name_map`** — a Worker schema carrying
> the **Python** convention *(`5,212` rows, `0` prefixed)* — **and `score_board_legs.py:111–113`
> `LEFT JOIN`s it for every leg on the board.** ✅ *Correct for its consumer; invisible to anyone
> reading the schema it sits in.* ⚠ **Its only writer is `check_baseline_board_coverage.py:53–60`,
> which no pipeline runs** ⇒ **`T20-24`.**
>
> ✅ **CROSS-SPORT SWEEP, CLEAN**: the same prefix test across **fourteen** tables in `nba_ref`,
> `nba_stats`, `nba_team` and `nba_calendar` returns **`0` foreign rows everywhere** *(authority:
> `nba_ref.teams`, 30 rows, `nba_1610612737`–`nba_1610612766`)*. ⇒ **`§T20.125`'s `7,951` baseball
> rows are confined to `nba_market.board_snapshots` alone — `T20-23` is scoped.**

---

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. `nba_ref`, `nba_config`, `nba_control` from T1 passes 3–4. MLB reference tables from T1 pass 2. Large tables from the live session. |
| **2026-09-21 → 09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `28` commits that this log never recorded.** *T11–T18 material plus the live audits: the CLASS REGISTER (every population the sweep's bounds are drawn over) · `data_quality` as a per-table provenance marker · `snapshot_label`'s per-table vocabularies and the `board_tiers`/`v2` subset relation · `blowout_model.side`'s three vocabularies · `prop_taxonomy`'s enumerated eighteen · the `triple_double` gap (274,010 `dd`, zero `td`) · **§0v the read-only storage incident** and its ~400-segment-earlier prediction · **§0u the infrastructure limits** (30 GiB cap, 2 GB RAM, PUBLIC repo) · T16's live index audit and six re-taken tables · **§T17.2 the storage diet plan** · T18's twelve-book ladder-depth table · T18 pass 6's twenty re-taken live figures. **Corrections in place: the 100% market-spread coverage claim · "a ninth" → the enumerated eighteen · the phase row 6 → 7 · §0v twice · §0w's 795-row difference · 0z-T18's hand-arithmetic.*** |

---

## 0y-T17-B. 🔴🔴 **THE STORAGE DIET PLAN, AS RECORDED — `storage_diet_plan_2026_09_17`, and the system is at ~31 GB on a 30 GiB disk** *(T17 pass 1, §T17.2)*

> 🔴🔴 **THE PLAN IS AIMED AT A DATABASE THAT HAS SINCE MOVED — `T20-2`, an OWNER DECISION.** *Added here T20 pass 78 (§T20.83), 2026-09-22: **this page records the plan and not its obsolescence**, and a person about to execute it reads this page.* ▶ **Re-derived live `2026-09-22T19:25Z` (§T20.75), `nba_config.classification_config` key `storage_diet_plan_2026_09_17`, status `PLANNED`:**
> | the plan says | live today |
> |---|---|
> | `final_hp` **"11 GB … 38.1M rows"** | 🔴 **`9,391 MB` · `19,215,200` rows** *(exact count)* |
> | `board_outcomes` `1,366 MB` | 🔴 **`2,151 MB`** — grown `57%` |
> | `board_tiers` `362 MB` | **`459 MB`** · `2,199,354` rows |
> | `rung_market` `206 MB` | **`253 MB`** · `1,057,765` rows |
> | `board_snapshots` `6,604 MB` | ✅ **`6,604 MB`** — unchanged *(no NBA board row since `2026-04-12`)* |
> 🔑 ***The plan's single largest saving — "slim `final_hp`, 4–6 GB" — was sized against a table that has since halved on its own. Its arithmetic needs re-taking before it is executed, and its own status line already says "execute ONLY after the full system is complete and no job is mid-write".*** ⚠ **`n_live_tup` is NOT used above: it reported `19,320,938` for `final_hp` and `0` for `board_tiers`, while `board_snapshots` showed `7,951` live tuples against `6.6 GB` — the estimates are stale (§T20.75).** ▶ **Full item: `T20-2` in `NBA_OPEN_ITEMS.md`; re-derived and HELD at §T20.75.** ⚠ *Documented, not fixed (rule 1).*

⚠⚠ **The measurement that triggered it**: *"we're at roughly **31 GB on a 30 GiB disk with autoscale**
— worth acting on."* ✅ **The plan is recorded as a config key, explicitly *"ready to execute when the
system is complete"* rather than run** *(the sequencing the owner set — §0y-T17 below)*.

| # | Item | Size | Why it is safe to give up |
|---|---|---|---|
| **1** 🔴 | **SLIM `final_hp` TO A JOIN TABLE** | **4–6 GB** | *"`final_hp` is **11 GB and mostly redundant**. It duplicates `game_id`, `anchor`, `band`, `phase`, `prop_tier`, `n_uncertain` and `baseline_hp` — **every one derivable from `baseline_history` on the same key**, which is itself 11 GB. **We're holding 22 GB for information stored TWICE.**"* ✅ **Keep the keys plus what is genuinely new: `final_hp`, `cal_shift`, `score`, `confidence` and its three components.** |
| **2** | **DROP FOUR SUPERSEDED PANELS** | **174 MB** | `absence_panel` 87 MB · `absence_panel_v3` 50 MB · `absence_panel_v2` 17 MB · `redistribution_panel` 20 MB — *"every one belongs to the **a2 approach, which is closed**. Their findings live in COMPASS and config; **the tables themselves are rebuildable from the scripts.**"* ⚠ **Plus the pasted `ladder_calibration`, superseded by the as-of version — *"and it was a parity violation besides."*** |
| **3** | **`VACUUM FULL` the delete-and-rewrite tables** | — | *"`board_snapshots` is **6.6 GB for 7,951 live rows** — mostly the two-season historical archive, which is legitimately needed, **but 5.6 GB of heap suggests bloat** after all the delete-and-rewrite cycles."* ⚠ **One table at a time, since it takes an EXCLUSIVE lock.** |
| **4** 🔑 | **INDEX AUDIT** | `final_hp` **3.7 GB** · `baseline_history` **3.4 GB** | ***"checking `idx_scan` BEFORE THE SEASON STARTS will show which are actually earning their space."*** ✅✅ **This sweep ran that audit and it found one: `board_outcomes_nm_idx`, 303 MB, zero scans** *(open item **T16-9**)*. |

🔑🔑 **THREE RULES WERE WRITTEN INTO THE PLAN, and they are the transferable part**: **only run when no
job is mid-write** · **verify row counts either side of each step** · ***"NEVER DROP ANYTHING WHOSE
FINDINGS AREN'T ALREADY RECORDED."*** ⚠ **That third rule is why the four dead panels are droppable and
why this sweep's documentation of them matters: the findings survive the tables.**

---

## 0y-T17-C. 🔴🔴 **FOUR INDEXES, THREE WRONG DIAGNOSES, AND ONE `EXPLAIN` — the origin of COMPASS fact 104** *(T17 pass 1, §T17.2)*

*A confidence-sampling query would not complete. **Three diagnoses were made by intuition and all three
were wrong, at ~30 minutes per cycle.*** ⚠ **The sequence is worth keeping because each fix was
reasonable and each failed:**

| Attempt | Diagnosis | Result |
|---|---|---|
| 1 | *"a function on the join column prevents index use"* → **three expression indexes** on the normalised-name join *(343 + 97 + 47 MB)* | ❌ **still 29 minutes** |
| 2 | *"the query drives from `final_hp` (38.7M rows) outward with two unconstrained `LEFT JOIN`s, so rows multiply before filtering"* → **restructure to drive from the ~1.2M graded legs, pre-aggregating in CTEs** | ❌ **the same 28-minute wall** |
| 3 | *"`baseline_history` has a unique key on `(game_date, player_id, game_id, prop, period, line)` but the join looks it up by `(game_date, player_id, prop, line)` — **a composite index only works LEFT-TO-RIGHT**, and the lookup skips `game_id` and `period` in the middle"* → **a covering index, 1,334 MB over 19.34M rows** | ❌ **still 24 minutes** |

🔑🔑🔑 **THEN ONE `EXPLAIN` GAVE THE ANSWER IMMEDIATELY, and it was none of the three**:

> ***"`Parallel Hash Join` cost=1,444,968..1,799,877 — `Parallel Seq Scan on final_hp rows=8,270,978`
> ← **hashing 8.3M rows**. Postgres chose a hash join… it **refuses a nested-loop-with-index-lookup
> because the join key contains `replace(replace(o.market_key,…))`** — **a function on the join
> column — so the unique index on `final_hp` can't be probed. MY INDEXES WERE IRRELEVANT: the planner
> was never going to use them with a computed key in the condition.**"***

⚠⚠ **AND EVEN THAT WAS NOT THE END** — materialising the graded side into a temp table with the
functions resolved moved the bottleneck rather than removing it, and the final `EXPLAIN` located it:
**one prop costs 1.18M with an 841k-row incremental sort; all 30 at once sorts ~19.6M rows in a single
merge join.** ✅ **The per-prop loop — which `build_final_hp.py` already did — was the fix.**

🔑🔑 **THE RULE THE AUTHOR ADOPTS, in his own words**: ***"on any query that doesn't return promptly,
READ THE PLAN FIRST — that's now a rule I should treat as NON-NEGOTIABLE, the same way
sample-testing is."*** ⚠ *It took ~90 minutes to learn and one call to apply.*

✅ **THE FOUR INDEXES ARE PERMANENT INFRASTRUCTURE ANYWAY, and the transcript says why**: *"any future
query joining baseline components to a leg — **the grader, the calibration checker, the edge backtest,
the enrichment layer** — was paying the same cost and now won't."* 🔑 **`baseline_history_lookup_idx`
is covering (`INCLUDE proj_min, rate36, used_emp, role_tier`), so the join is satisfied from the index
alone without touching the heap — and `[LIVE-AUDIT]` shows it at 23.4M scans, the busiest index in the
system.** ⚠ **Three of the four earn their keep; the fourth is open item T16-9.**

### ⚠ **A THIRD INSTANCE OF ONE PATTERN, NAMED BY ITS AUTHOR**

> ***"THREE separate jobs have now been killed by pulling millions of rows into the runner. The fix
> each time is to **PUSH THE JOIN INTO POSTGRES**. That's a pattern I should apply BY DEFAULT rather
> than after a failure."***

⚠ *And the same lesson in a different costume, one that had already been learned that day:* **"I should
have written the per-prop results to the database INSIDE THE LOOP from the start, so partial progress
survived and each iteration was visible. Instead everything accumulates in memory and writes at the
end, which means **a stall anywhere produces NOTHING and TELLS US NOTHING.** That's the same lesson as
the CI-log problem earlier today, **and I didn't apply it here.**"* ✅ **Once applied, it worked
immediately — *"the per-prop writes also fixed the visibility problem: progress is now visible as it
happens and partial results survive."***

### ⚠ **AND A WORKFLOW BOTTLENECK THAT COST MOST OF AN HOUR**

*"**The single concurrency group on that workflow means every test queues behind every long write.**
With **34 toggles sharing one workflow**, a **45-minute season write blocks a 4-minute sample**."* ✅
**Fixed with a separate no-write test workflow** — *"this test started immediately and runs in parallel
with the season write that was blocking it."* 🔑 **The same move COMPASS fact 104 records for
`nba-engine-test.yml`, and the second concurrency-group finding in two transcripts** *(the first being
T16's self-cancelled run — `NBA_WORKERS.md` §0.000)*.

---

## 0y-T17. 🔑🔑 **"WE NEED A DIET" — the owner's standing storage directive, and it is CONDITIONAL** *(T17 pass 0, §T17.1, owner, 2026-09-19; **0 of the twelve, 0 of the thirty**)*

> ***"Are we being DATA SIZE AWARE? Is there anywhere we are wasting space?"***
>
> ***"Once the full system is complete we do that, but **WE NEED A DIET, DEFINITELY** — of course
> **without losing data, reliability, progress** — just smart addressing data."***

🔑🔑 **THREE THINGS ARE SPECIFIED AND ALL THREE MATTER**: **(1) the diet is COMMITTED — *"definitely"***;
**(2) it is SEQUENCED AFTER completion — *"once the full system is complete"***; **(3) it is BOUNDED —
*"without losing data, reliability, progress."*** ⚠ **So storage reclamation is deferred work with a
stated constraint, not an open question — and §0v's storage incident and §0u's infrastructure limits
are the context it was asked in.**

✅ **AND THE SAME SESSION SHOWS THE DESIGN PRINCIPLE ALREADY APPLIED**: the scenario precompute
*"should be run on **every single match** for calibration, and then it should be **DELETED** — we just
keep the real outcome… **that should be MILLIONS OF ROWS that's just gonna eat up space**"*
*(`NBA_SYSTEM_DESIGN.md` §0z-4)*. 🔑 **Enumerate to calibrate, store only the outcome — the diet as an
architectural choice rather than a cleanup.**

🔴 **THIS SWEEP HAS ALREADY FOUND ONE CANDIDATE, AND IT COSTS NOTHING TO GIVE UP**: **`board_outcomes_nm_idx`
— 303 MB with ZERO scans** across the whole window these statistics cover, while its three same-batch
siblings on the same normalised-name join show 23.4M / 1.08M / 595k *(§0x-T16 below, open item
**T16-9**)*. ⚠ **It is dead weight by the directive's own test — *"smart addressing data" without
losing data, reliability or progress* — since an index the planner never chooses holds no
information.** 🔑 **And COMPASS fact 104 supplies the likely cause: a function on the join column makes
an index unusable no matter how well it matches.**

---

## 0x-T16. 🔴🔴 **THE FOUR PERFORMANCE LESSONS, AND A LIVE INDEX AUDIT THAT FINDS 303 MB NEVER SCANNED** `[LIVE-AUDIT]` *(T16 pass 2, §T16.3, from COMPASS fact 104 — **2 of the thirty, 1 of the twelve**; `SELECT` 2026-09-22)*

### 🔑🔑 THE FOUR LESSONS — **"~90 minutes each"**

**(a) 🔴🔴 READ THE PLAN FIRST.** *"**Three query rewrites were GUESSED before one `EXPLAIN` gave the
answer immediately**: a Parallel Hash Join was building a hash from **8,270,978 `final_hp` rows**
because the join key contained `replace(...)` and `lower(regexp_replace(...))`."* 🔑🔑 ***"A FUNCTION
ON A JOIN COLUMN MEANS NO INDEX CAN EVER BE USED — which is why ALL FOUR INDEXES BUILT THAT DAY WERE
IRRELEVANT TO IT."*** ⚠ **Four indexes built to fix a problem indexes structurally could not fix.**

**(b) MATERIALISE, THEN JOIN ON PLAIN COLUMNS** — resolve the functions into a temp table, **index and
`ANALYZE` it**.

**(c) LOOP PER PROP** — *"one prop plans healthily; **all 30 at once sorts ~19.6M rows in a single
merge join**."*

**(d) 🔑 WRITE RESULTS *INSIDE* THE LOOP** — *"a run that accumulates 30 props in memory and writes at
the end **produces NOTHING on a stall and says NOTHING about where it stalled**."* ⚠ **The same
principle as T16's supervision rule** *(`NBA_OPEN_ITEMS.md`: row count alone cannot distinguish
running from dead)*: **a process that emits nothing until it succeeds is unobservable while it runs.**

⚠ **And a workflow change with the same shape**: **`.github/workflows/nba-engine-test.yml` gives
read-only tests their OWN concurrency group**, *"because every 4-minute validation used to queue
behind every 45-minute write."*

### 🔴🔴 THE LIVE INDEX AUDIT — **all four exist; one has never been scanned**

| Index | Table | **live size** | fact 104 | **scans** |
|---|---|---|---|---|
| **`baseline_history_lookup_idx`** *(covering)* | `baseline_history` | **1,541 MB** | 1,334 MB — ⚠ **+207 MB, +15.5%** | ✅ **23,364,453** |
| 🔴 **`board_outcomes_nm_idx`** | `board_outcomes` | **303 MB** | — | 🔴🔴 **0** |
| `board_tiers_nm_idx` | `board_tiers` | 97 MB | — | ✅ 1,080,188 |
| `rung_market_nm_idx` | `rung_market` | 47 MB | — | ✅ 594,932 |

⚠ **The three expression indexes sum to 447 MB against fact 104's stated 487 MB** — *a 40 MB
difference; **NOT RECORDED** whether that is a different measurement basis or reclaimed bloat.*

🔴🔴 **`board_outcomes_nm_idx` carries 303 MB and `idx_scan = 0`.** ⚠⚠ **STATED PRECISELY**:
`pg_stat_database.stats_reset` is **NULL** for this database, so **no explicit statistics reset is
recorded** — but the sweep **cannot rule out a counter reset on a server restart**, so the claim is
**"zero scans across the whole window these statistics cover"**, not "never used since creation". 🔑
**Its three siblings, created in the same batch and covering the same normalised-name join, show
23.4M / 1.08M / 595k scans over that same window — so the zero is not an artifact of a short window.**

⚠ **THIS MATTERS AGAINST THE STORAGE POSITION**: §0v records the storage incident and that the shrink
has since been consumed several times over, and §0u records the infrastructure limits. **303 MB of
index that the planner is not choosing is 303 MB of that budget**, *and it also slows every write to
`board_outcomes`.* 🔴 **OWNER DECISION**: *drop it, or find out which query it was built for and why
that query stopped using it* — **and lesson (a) above is the likely answer, since a function on the
join column makes an index unusable no matter how well it matches.** ⚠ **This sweep does not drop
indexes.**

---

## 0w. 🔑🔑 **THE 2026-09-13 SESSION'S TABLES, RE-TAKEN LIVE — five reproduce exactly, one does not** `[LIVE-AUDIT]` *(T16 pass 1, §T16.2; `SELECT` 2026-09-22)*

*T16 builds or fills six tables and states row counts for several. **Every one was re-taken rather than
quoted** (rule: re-take, never quote).*

| Table | cols | **live rows, 2026-09-22** | T16's figure | |
|---|---|---|---|---|
| **`nba_ref.defender_ratings`** | 11 | **111,768** | 111,768 | ✅ **exact** |
| `nba_score.factor_gate_results` | 9 | **104** | *(19 models · 45 slices · season `2025-26` only)* | ✅ |
| `nba_score.blowout_model` | 9 | **35** | not stated as a count | ✅ present |
| `nba_score.tier_band_calibration` | 11 | **149** | not stated as a count | ✅ present |
| `nba_score.redistribution_factors` | 14 | *(see §0a-T16)* | 51,806 | — |
| 🔴 **`nba_ref.referee_assignments`** | 7 | **0** | **0** | ⚠ **STILL ZERO NINE DAYS LATER** |

### ⚠ THE REFEREE TABLE IS STILL EMPTY, AND THAT IS *EXPECTED* — **which is exactly why it is worth recording**

*T16 built and scheduled the D1 capture (`nba/scrape_referee_assignments.py`, `nba-referees.yml`,
**daily 08:30 PT**) and recorded the result honestly at the time:* ***"table created, ZERO rows —
expected in mid-September with no games. The parser can't be validated until the season starts, so
I'm recording that honestly rather than assuming it works."*** ✅ **`[LIVE-AUDIT]` confirms 0 rows on
2026-09-22.** 🔴🔴 **The claim is therefore UNFALSIFIABLE UNTIL 2026-10-20**, and the exposure is
asymmetric: **assignments are published each morning and NEVER archived**, so *"the archive only
exists going forward."* ⚠ **If the parser is broken, the first day it can be discovered is the first
day of irreplaceable data.** *Historical crews come from box scores, which COMPASS fact 58 establishes
as a faithful reconstruction — so the BACKFILL is safe; only the live capture is at risk.*

### 🔴🔴 **`baseline_history` NO LONGER REPRODUCES T16's COMPLETION FIGURE — and the loss is confined to ONE SEASON**

*T16's end-state verification, stated as the gate the rebuild had to clear:* **"60 of 60 season-props
rebuilt — 2024-25: 9,537,535 rows / 162 dates · 2025-26: 9,806,608 rows / 163 dates · 0 invalid
probabilities · 0 missing lines"** *(total **19,344,143**)*.

| Season | T16, 2026-09-13 | **live, 2026-09-22** | Δ |
|---|---|---|---|
| 2024-25 | 9,537,535 | **9,537,535** | ✅ **0 — byte-stable** |
| **2025-26** | 9,806,608 | **9,805,813** | 🔴 **−795** |
| **total** | 19,344,143 | **19,343,348** | **−795** |

✅ **Everything else holds**: **30 props on both seasons, 162 and 163 dates** — *the shape is intact;
only 2025-26's row count moved.*

### ✅✅ **RESOLVED AT T17 PASS 1 (§T17.2) — AND THIS SWEEP'S ORIGINAL READING WAS WRONG**

⚠⚠ **The 795 rows were NOT lost after the sweep began.** **T17's own pipeline inventory, taken
2026-09-19, records `baseline_history` at exactly `19,343,348` — the live figure today** — and T17's
matchup-replication summary records **2025-26 at `9,805,813`**, also today's figure. 🔑 **So the change
happened between T16's completion (2026-09-13) and T17's matchup rebuild (2026-09-19), it is recorded
inside the corpus, and the table has been STABLE ever since.**

| | 2024-25 | 2025-26 | total |
|---|---|---|---|
| **T16, 2026-09-13** *(the blowout rebuild's completion check)* | 9,537,535 | **9,806,608** | 19,344,143 |
| **T17, 2026-09-19** *(the matchup rebuild + pipeline inventory)* | 9,537,535 | **9,805,813** | **19,343,348** |
| **`[LIVE-AUDIT]` 2026-09-22** | 9,537,535 | **9,805,813** | **19,343,348** |

🔴 **CORRECTION, RECORDED RATHER THAN EDITED AWAY (rule 5)**: *this entry originally read the 795-row
difference as **drift since the sweep began** and as evidence that "a completion check verifies a
moment, not a state". **The second half of that lesson still stands** — T16's certified figure did stop
being true — **but the cause is a documented rebuild inside the corpus, not unexplained drift**, and
the table has not moved in the three days since.* ⚠ **The sweep's own mistake was reaching for an
explanation (the concurrent session, `prop_universe`) before the transcript that contained the answer
had been read — the failure rule 6 exists to prevent, committed by this sweep.**

⚠ **NOT RECORDED**: which of the two 2025-26 figures is the correct one, or what the matchup rebuild
did to drop 795 rows. *Both runs report **0 invalid probabilities and 0 missing lines**, so neither
flags a defect.*

🔑 **The useful general point**: **the transcript's own verification rule was *"I'll report complete
only when all 60 carry a post-22:00 timestamp, not when the jobs report green"*** *(`NBA_OPEN_ITEMS.md`,
T16 operational defects)* — **a stricter gate than most, and nine days later the number it certified
has still drifted by 795 rows in one season.** ⚠ **A completion check verifies a moment, not a state.**

---

## 0. THE TWO UNIVERSES

NBA is a **completely separate namespace** from MLB — separate schemas, separate control plane,
separate workers, separate repo folder. This was an explicit owner directive, overruling an initial
proposal to share the control plane.

> ✅ **ISOLATION RE-VERIFIED BY LIVE SQL, 2026-09-20 (T1 pass 41).**
> **18 non-NBA schemas + 14 NBA schemas = 32.** The MLB count is **exactly what T1's Phase-1 recon
> returned on 2026-08-31** — unchanged after a complete NBA build.
> **And the three shared MLB board tables still hold zero NBA rows**:
> `market.prizepicks_board_current` **8,720 rows, all `league='mlb'`** ·
> `market.sleeper_board_current` **811 rows, all `baseball_mlb`/`MLB`** ·
> `market.underdog_board_current` **2,449 rows, all `baseball_mlb`/`MLB`**.
> **This closes System Draft §5 open question 2** (reuse the shared board tables filtered by sport,
> or build `nba_market` ones) **by observation**: NBA built its own and never wrote to the shared
> tables. The `sport`/`league` columns there remain **unused as discriminators** — one value each.
> `NBA_OPEN_ITEMS.md` → FROM T1 PASS 41.

### MLB schemas (18, for reference only — never written by NBA)
`archive` · `backtest` · `calendar` · `certifier` · `classification` · `config` · `context` ·
`context_cert` · `control` · `daily` · `market` · `public` · `ref` · `score` · `scoring` ·
`stats_hitter` · `stats_pitcher` · `team`

> ### ⚠⚠ COMPLETENESS AUDIT — **17 of the 85 live NBA tables are missing from this document**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 47). This document's mandate is "a comprehensive complete
> list of all tables and columns"; **it is at 80%.***
>
> **Absent here** (several are documented in *other* files, which is the failure the twelve-document
> split exists to prevent):
> `nba_calendar.games` ⚠ *(the calendar the pipeline schedules against — quoted elsewhere as **2,666
> games**)* 🔴🔴 **AND IT HAS NOT BEEN REFRESHED SINCE THE DAY IT WAS BUILT — SEASON-CRITICAL, `[LIVE-AUDIT]`.** *Added T20 pass 78 (§T20.83), 2026-09-22: **this document names the schedule eight times and nowhere says it is frozen**.* ▶ **`max(updated_at)` = `2026-09-02 20:25Z` — `20` days, re-derived live `2026-09-22T19:25Z` (§T20.75); `2,666` rows.** ▶ **And the 2026-27 slate it holds is `1,266`: `1,200` regular-season from `2026-10-20` plus `66` preseason (`2026-10-03`–`10-19`)** — ***`1,200` is `30` short of a full `1,230`, exactly one game per team, and the shortfall is NOT preseason bleed*** *(a rule-1 open question RESOLVED by re-derivation at §T20.75)*. 🔑 **This entry is part of the frozen static layer: nine tables plus `nba_ref.defender_ratings`, none refreshed since build.** ▶ **Full items in `NBA_OPEN_ITEMS.md`** *(the schedule entry, T3 pass 12; the frozen-layer entry, §T20.51)*. ⚠ *Documented, not fixed (rule 1).* 📌 ***Note the line above this one: "several are documented in OTHER files, which is the failure the twelve-document split exists to prevent." That sentence was written about TABLES. §T20.83 measured the same shape for DEFECTS and found nine of fourteen.*** · `nba_config.variation_bands` *(25 rows)* · `nba_market.board_backfill_log` ·
> `nba_market.board_tiers_v2` *(in `NBA_GOBLIN_DEMON.md`)* · `nba_market.game_lines_snapshot_log` ·
> `nba_market.schedule_norm` · `nba_score.absence_panel_teams` · `nba_score.redistribution_factors` ·
> `nba_score.scenario_calibration` · `nba_score.tier_band_calibration` ·
> `nba_score.tier_selection_value` · `nba_stats.player_game_log_advanced` ·
> `nba_stats.player_onoff_profile` · `nba_stats.player_playtype_profile` ·
> `nba_stats.player_tracking_detail` · `nba_team.playtype_profile` ·
> `nba_team.team_game_log_advanced`
>
> ### ⚠ AND SIX OF THE FOURTEEN SCHEMAS HOLD ZERO TABLES
> **VERIFIED**: `nba_archive`, `nba_backtest`, `nba_classification`, `nba_context`, `nba_daily`,
> `nba_scoring` — **all empty.** Live table counts: `nba_stats` **19** · `nba_score` **18** ·
> `nba_ref` **14** · `nba_config` **11** · `nba_market` **11** · `nba_team` **9** ·
> `nba_control` **2** · `nba_calendar` **1**.
>
> **All fourteen were created in one `CREATE SCHEMA IF NOT EXISTS` statement in T1, mirroring MLB's
> schema list. Six were never used.** The work they were named for exists **under other names** —
> backtest in `nba_score.*` and the repo's `backtest/`, classification output in
> `nba_score.baseline_*`. **They are a naming layer that was never adopted, not missing
> functionality** — but a reader searching `nba_classification` for the classifier's output will find
> nothing. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 47.

### NBA schemas (14, created T1 in one statement)
`nba_ref` · `nba_calendar` · `nba_team` · `nba_stats` · `nba_daily` · `nba_context` · `nba_market` ·
`nba_archive` · `nba_score` · `nba_scoring` · `nba_backtest` · `nba_classification` · `nba_config` ·
`nba_control`

**NBA has no hitter/pitcher split** — one `nba_stats` where MLB has two.

---

> ## ⚠⚠ ID CONVENTIONS — **two of them, and they do not join**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 50), running the proactive format check blueprint §2
> demanded and that had never been run.*
>
> **✅ Types are perfect**: all 28 `player_id`, 20 `team_id` and 20 `game_id` columns are **TEXT**;
> all 10 `nba_player_id` and 6 `nba_team_id` are **BIGINT**. The two-column pattern — canonical TEXT
> id + raw stats.nba.com BIGINT — is applied without exception.
>
> **⚠ Values split along a layer boundary:**
>
> | Layer | `player_id` | Evidence |
> |---|---|---|
> | **`nba_ref.*`**, **`nba_stats.*`** | **prefixed `nba_<id>`** — e.g. `nba_1610612737` | `players` 582/582 · `player_game_log` 79,358/79,358 |
> | **`nba_score.*`** | **bare numeric** — e.g. `101108` | `baseline_history` 19,343,348 · `final_hp` 19,215,200 · `baseline_ladder` 206,237 · `board_scored` ~~110,955~~ **→ 5,524,359 (2026-09-21)** · `availability_delta` 4,274 · `redistribution_factors` 51,806 — **all 0 prefixed** |
> > *`[LIVE-AUDIT]` 2026-09-21 (T9 pass 5): **re-verified — six `nba_score` tables carry `player_id` and every row in all six is bare numeric, 0 prefixed**, so the split is uniform rather than mixed within a table. ⚠ **`board_scored` is 50× its recorded size** because the table was **rebuilt between 07:23 and 08:05 on 2026-09-21** by the concurrent session's scoring workflow — **that rebuild is out of this sweep's scope** and is noted only so a later reader does not read the change as a discrepancy. The 110,955 was correct when written.*
>
> **⚠ And the pattern has a third hole — `nba_game_id` does not exist** *(T1 pass 54, VERIFIED)*:
> `nba_player_id` appears in **11** columns, `nba_team_id` in **6**, `game_id` in **20**, and
> **`nba_game_id` in 0.** `nba_calendar.games.game_id` is **0 of 2,666 prefixed**. **Only `team_id`
> was implemented exactly as the blueprint specified**; `player_id` carries two conflicting formats
> across layers, and `game_id` has no canonical prefixed form at all.
> **✅ Game joins are unaffected** — all 20 `game_id` columns hold the same unprefixed TEXT format,
> so they work across every boundary, including the one where `player_id` fails.
>
> **Measured**: `nba_score.board_scored` → `nba_ref.players` on `player_id` = **0 of 110,955**.
> With `'nba_'||player_id` = **110,955 of 110,955.**
>
> **Nothing is currently broken** — the scoring path joins score→score and both sides are bare
> numeric. **But any join from the scoring layer to the reference layer returns zero rows, silently**,
> and the transform that bridges them exists nowhere in the schema.
> **This is the blueprint's named multi-table ID bug, reproduced.** **Which convention is correct is
> NOT ESTABLISHED** — flagged for human decision. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 50.

## 0u. 🔑🔑 THE INFRASTRUCTURE LIMITS, MEASURED — **and the 43 GB finally resolves** `[LIVE-AUDIT]`
*Recorded 2026-09-22 (T14 pass 1, §T14.2c). **Transcript `2026-09-13-20-53-23`.** **Live schema
census pinned 2026-09-22T08:54Z.** `SELECT` only; nothing run or changed *(rule 1)*.*

### 🔴🔴 THE REPO IS PUBLIC — **0 of the TWELVE**, and it bears on every credential item
> *"**GitHub — THE REPO IS PUBLIC.** Actions minutes on standard runners are **FREE AND UNLIMITED
> for public repositories**, which is why four scrapers running twelve times a day have never
> touched a limit. **The Pro plan's 3,000-minute quota only applies to PRIVATE repos.**"*
> ⚠ *"**The caveat**: public means **the code, docs and board files are readable by ANYONE** —
> credentials aren't in the repo *(they're in Postgres)*, so nothing sensitive is exposed, but
> ***it's a choice you should be making knowingly rather than by default***."*

🔑🔑 ***This explains a cost fact and creates a security one.*** ⚠⚠ **It bears directly on the four
credential exposures on file** *(O8, O11 and their siblings)*: **the standing rule that no credential
value is reproduced in these documents is not a formality — these documents are public.**
📌 **The binding GitHub limits are therefore not minutes**: **20 concurrent jobs · 6 hours per job ·
runners with 2–4 cores and 7–16 GB RAM** — *"running the six prop pairs as six parallel jobs fits
easily."*

### ✅ CLOUDFLARE, AND THE RULE THAT FOLLOWS
**$5 plan: 10M requests and 30M CPU-milliseconds a month included; overage $0.02 per million CPU-ms**
— *"even a spike costs cents. The bridge does lookups and small writes; it's nowhere near the limit."*
🔑 ***"RULE: nothing computational runs on workers."***

### 🔴🔴 THE DATABASE IS THE REAL CONSTRAINT, AND THE NUMBERS SAY WHY
> *"DigitalOcean Postgres, **1 GB RAM / 1 vCPU — this is the real constraint, and it's the one that
> already bit us**. About **22 CONNECTIONS max**, **~256 MB of shared buffers**, small work memory.
> **Big sorts SPILL TO DISK** — ***that's what turned a 27M-row `CREATE TABLE AS` into a 98-minute
> run that nearly filled the disk.***"*

✅ **FOUR RULES FOLLOW, and they are the operating discipline for the whole system** *(0 of the
twelve)*:
1. 🔑🔑 ***COMPUTE ON THE RUNNERS, NOT IN THE DATABASE.*** *Fits, scenario scoring, joins between big
   tables — all in pandas on a 7–16 GB runner.* **Postgres only stores results and answers indexed
   lookups.**
2. **BATCHED WRITES, FEW CONCURRENT WRITERS** — *5–10k-row batches; at most 2–3 jobs writing at once;*
   ***"six parallel builders are fine; they just shouldn't all insert in the same minute — stagger
   the load step."***
3. **NO LARGE JOINS SERVER-SIDE** — *"the coverage and calibration checks I ran as SQL will move to
   runner-side pandas for the daily pipeline."*
4. **CHUNK BY MONTH, VACUUM AFTER BULK DELETES, LEAN INDEXES.**

⚠ **And the CPU alerts were diagnosed rather than assumed**: ***"the CPU alerts were caused by ME,
not by the system. Every 70–100% spike lines up with the ANALYSIS QUERIES I ran this week — full
scans over 25M board rows, distinct counts, the calibration joins. That's not the production
workload."*** 🔑 **In production the database does three things: *batched inserts from the scrapers,
the scenario precompute once a day, and a burst of indexed lookups at selection time.***
📌 **Why 2 GB was the right buy**: *"**memory is the real constraint**… you're at 75–85% of 1 GB,
which leaves Postgres ~256 MB of shared buffers — **that's why big operations spill to disk and then
burn CPU sorting.** Doubling RAM roughly doubles the cache — **the single biggest improvement per
dollar**."* **Connections 22 → 47 matters**: *"six parallel baseline runners + four board scrapers +
the bridge + MLB workers + Hyperdrive's pool can plausibly approach 22."* **NVMe skipped**: *"it helps
exactly when queries spill to disk — and if we move compute off the database, spills become rare."*
📌 **The sizing to design toward, for two sports**: **2 vCPU / 4 GB / 60 GiB / 97 connections** —
*"NBA alone is ~15 GB and will grow… hockey built the same way is roughly the same again; **two
sports land at ~30–35 GB**."*

### ✅✅ THE MLB BACKTEST SCHEMA WAS DROPPED — **and it is confirmed live**
> *"Dropped the MLB backtest schema — **1,177 tables, verified no live worker reads it** *(only two
> code comments referenced it)*. **Database went from 21 GB → 15 GB.**"*
⚠ **Note the discipline before the delete**: *"**before deleting anything in MLB, I'll verify it's
genuinely backtest-only and that nothing live reads it — that schema name alone isn't proof**"*, and
the live MLB workers most likely to read it were checked by name.
✅ **CONFIRMED**: **the `backtest` schema now holds ONE table at 203 MB** *(pinned 08:54Z)*.

### 🔑🔑 AND THE LIVE SCHEMA CENSUS RESOLVES §0v's 43 GB COMPLETELY
| schema | tables | total |
|---|---|---|
| 🔴 **`nba_score`** | 22 | **25 GB** |
| **`nba_market`** | 25 | **11 GB** |
| `archive` | 9 | 1,924 MB |
| `score` *(MLB)* | 28 | 1,904 MB |
| `classification` *(MLB)* | 14 | 602 MB |
| `market` *(MLB)* | 32 | 549 MB |
| `daily` *(MLB)* | 35 | 495 MB |
| `stats_hitter` / `stats_pitcher` *(MLB)* | 16 / 15 | 456 / 404 MB |
| `team` *(MLB)* | 11 | 218 MB |
| **`backtest`** *(MLB)* | **1** | **203 MB** |
| `nba_stats` | 19 | 130 MB |

🔑🔑 ***THE SITUATION HAS COMPLETELY INVERTED.*** **T14 measured NBA at 11 GB against MLB's ~14.5 GB,
with MLB's backtest schema alone at 7.1 GB.** **Today NBA is ~36 GB** *(`nba_score` 25 +
`nba_market` 11)* **and MLB is roughly 4.6 GB.** ***MLB was cut as the owner directed, and NBA grew
into the space and past it.***
✅ **And `nba_score`'s 25 GB is now explained end to end**: **`baseline_history` ~13 GB**
*(§`NBA_BASELINE_CALIBRATION.md` §0v — 19.3M rows, 30 props, two seasons, every game-day, every
rung)* **plus `final_hp` ~9.4 GB** *(COMPASS fact 105: deliberately denormalised, "bought speed")*.
⚠⚠ **SO THE OWNER'S CEILING IS THE OPEN QUESTION, NOT THE CAUSE**: ***he set 30 GiB as the maximum
on 2026-09-13; NBA ALONE is now ~36 GB and the database is 43 GB.*** **Whether the plan was resized
to the 60 GiB tier is NOT RECORDED in anything swept** *(T15–T20 are unread)*. **Documented, not
acted on.**

## 0v. 🔴🔴 THE STORAGE INCIDENT, THE SHRINK THAT FIXED IT — **and the shrink has since been consumed six times over** `[LIVE-AUDIT]`
*Recorded 2026-09-22 (T13 pass 2, §T13.3i). **The incident and the repair are T13's**
*(`2026-09-13-01-03-48`)*; **every live figure is re-taken and pinned 2026-09-22T08:12:50Z.**
`SELECT` only — nothing was run, resized or changed *(rule 1)*.*

### 🔑🔑 THE INCIDENT WAS PREDICTED, THE FIX WAS OFFERED, AND THE OWNER DECLINED IT — *the full decision arc*
*Recorded 2026-09-22 (T13 pass 3, §T13.4d). **The same transcript, ~400 segments EARLIER than the
incident below.***

**The measurement was taken from real data mid-backfill, not estimated** — *"let me measure the
actual footprint rather than estimate; we have 225 games of real data now"*:
> *"**446 bytes per row** *(518 MB heap + 542 MB index for 2.5M rows)* — ***the index is as big as
> the data, because the primary key is SEVEN COLUMNS including player and market names***.
> The database is currently **14 GB**. Both seasons ≈ 19M rows → **~8.5 GB for this table**, so the
> db lands around **21–22 GB**. ***That crosses your 80% trigger (16 GB), so the auto-expand to 30 GB
> will fire MID-RUN*** — it'll work, but it's a permanent bump in your monthly bill."*

**Two options were put, with a recommendation**:
| option | effect | recommended? |
|---|---|---|
| **1. Trim the index** — replace the seven-column PK with a compact hash key plus a lean index on `(game_date, event_id)` | **~40% saving, no data loss, ~3 GB back, faster inserts**; *"I'd do this BETWEEN seasons so nothing in flight is disturbed"* | ✅ **yes** |
| **2. Skip sportsbook alternate markets** — *"the eight alternate markets are the bulk of the rows; essential for PrizePicks/Underdog (that's the goblin/demon ladder), but for DraftKings/FanDuel mostly noise for our purpose"* | ~a third fewer rows, ⚠ ***"not reversible without a re-pull"*** | 🔴 **no** |

> *"My recommendation: **do option 1, skip option 2** — keep all the data, cut the index weight…
> **storage is cheap compared to re-pulling 2M credits of history.**"*

🔴🔴 **THE OWNER DECLINED**: *"understood — ***no schema changes, full detail kept***."*
🔑🔑 ***So the read-only incident below was forecast in detail — the trigger, the table, the cause
(a seven-column key whose index equals the data) and the remedy — roughly 400 segments before it
happened; the remedy was declined; and the SAME remedy was then applied AFTER the outage.***
⚠⚠ **Recorded as a decision arc, not as a criticism**: **option 2 was irreversible and was correctly
refused, and *"no schema changes"* during a live 2M-credit backfill is a defensible call.** 🔑 **The
transferable lesson is about SEQUENCING, and it is the same one the incident teaches: *the cheap,
reversible fix is cheapest before the deadline, and the argument for it is strongest exactly when
there is least appetite to act on it.*** **`no schema changes` / `full detail kept` are in 0 of the
twelve** *(pinned 2026-09-22T08:20:06Z)*.

📌 **And one more forecast that landed**: *"rows are running **~7,800 per game** rather than my
earlier **9,400** estimate, so both seasons should land nearer **19M rows (~3.5 GB + indexes)**"* —
**the final figure was 25.7M, then 27,059,920 after gap repair.** ⚠ **Both per-game estimates were
low; the projection method (measure, then extrapolate) was right and the sample was early.**

### 🔴 THE INCIDENT — **the managed primary went READ-ONLY mid-write, because the disk filled**
> *"The repair run failed with a telling error: **`cannot execute INSERT in a read-only
> transaction`**. On DigitalOcean managed Postgres that usually means **the primary went read-only —
> most often because DISK FILLED**."*
> *"That explains it precisely: **the database is now 23 GB (board table alone 11 GB), so it hit your
> 20 GB cap mid-run and DigitalOcean flipped the primary READ-ONLY until the auto-expansion
> completed.** It's not a replica, and read-only is now off, so the expansion took effect."*

⚠⚠ **THE OPERATIONAL WARNING ATTACHED TO IT, and it names the hour**: ***"any write can fail during
an expansion. This run died mid-insert with a read-only error, and it happened to be a RESUMABLE job
with a log table, so nothing was lost. ***The daily pipeline won't be so forgiving if it happens at
2:45 PM PT.*** That's a real argument for the **freshness gates and idempotent tasks** we specced,
and for **keeping headroom rather than riding the trigger**."***
🔑 ***The job survived because it was resumable and logged. That is the design property that turned
an outage into a restart*** — **and it is the argument for the freshness gates, stated from an
incident rather than from principle.**

### ✅ THE REPAIR — a seven-column primary key replaced by a compact unique index
**The diagnosis**: *"the index is half the weight… the primary key **spans SEVEN COLUMNS including
player and market names**."* **Measured: the PK alone was `5,577 MB`.**
**The safety design, stated before it ran** — *"built so it cannot lose anything"*:
1. **The new UNIQUE index is built FIRST**, `CONCURRENTLY`; **the old primary key is not touched
   until the new index reports `valid`.** 🔑 ***"If a single duplicate row existed, the build fails
   and we stop with the PK intact — so it doubles as a DUPLICATE AUDIT."***
2. **Row count captured before and after; a mismatch aborts.**
3. 🔑 **NO `VACUUM FULL`, no table rewrite** — *"a rewrite would need ~11 GB of temporary space
   against 7 GB of headroom — **that's how you cause the read-only incident we just had, not fix
   it**."* **Dropping the index releases its space directly.**

⚠ **And a false alarm worth keeping**: the script *failed* — because the earlier, seemingly
**orphaned** `CONCURRENTLY` build **had actually completed server-side while the client connection
dropped**. *"The script only failed because it tried to create an index that already exists, and its
cleanup branch only fires for INVALID ones."* 🔑 ***A tool-call timeout is not a statement about the
backend*** — the index had gone `152 MB → 700 MB → 814 MB` across three checks after the client gave
up, *"so the backend continued despite my client timing out."*

| | before | after |
|---|---|---|
| database | 23 GB | **19 GB** |
| board table total | 12 GB | **6,602 MB** |
| indexes on it | 5,764 MB | **1,001 MB** |
| rows | 25.7M | **27,059,920** |

✅ ***"4 GB recovered, ZERO rows lost — the count went UP because the gap-repair run added rows in
the meantime, which is the right direction."*** ✅ **And because a UNIQUE index built successfully
across all 27M rows, there is PROOF of zero duplicates in that table** — *a correctness guarantee
obtained as a by-product of a storage fix.*

### ✅ THE SHRINK HELD EXACTLY — re-taken 2026-09-22
**`nba_market.board_snapshots`: `pg_total_relation_size` 6,604 MB · `pg_indexes_size` 1,001 MB ·
`reltuples` 27,059,920.** ***Every figure matches T13's post-shrink report to the row, twelve days
later.***

### 🔴🔴 BUT THE DATABASE IS NOW **43 GB**, AND THE BOARD TABLE IS NO LONGER THE PROBLEM
| relation | total | `reltuples` |
|---|---|---|
| 🔴 **`nba_score.baseline_history`** | **13 GB** | 19,266,864 |
| 🔴 **`nba_score.final_hp`** | **9,391 MB** | 19,320,938 |
| `nba_market.board_snapshots` | 6,604 MB | 27,059,920 |
| `nba_score.board_scored` | 2,948 MB | 11,956,460 |
| `nba_market.board_outcomes` | 2,151 MB | 6,905,452 |
| `score.final_board_history` | 1,342 MB | 249,648 |
| `archive.board_leg_history` | 1,137 MB | 756,768 |
| ⚠ `nba_market.prop_universe` | 898 MB | *(mid-rebuild — **not stated as final**)* |
| `archive.market_prop_context_history` | 737 MB | 162,502 |
| `daily.game_status_stage` | 471 MB | 169,249 |
| `nba_market.board_tiers` | 459 MB | 2,199,354 |
| `score.prop_outcome_history` | 380 MB | 343,816 |

🔑🔑 ***The database has gone 19 GB → 43 GB, and `board_snapshots` has not moved a megabyte.*** **The
two largest objects are now `baseline_history` and `final_hp` — 22.4 GB between them — and neither
appears anywhere in T13's storage picture.** ⚠⚠ ***So the 4 GB the shrink recovered has since been
consumed roughly six times over, by the SCORING layer rather than the market layer.***
> ### ✅✅ **CORRECTED 2026-09-22 (T13 pass 4, §T13.5a) — THE CORPUS DOES EXPLAIN IT, AND IT IS A DELIBERATE DECISION**
> ⚠⚠ **This entry, written one pass earlier, said *"no swept transcript covers them."* That is true
> and MISLEADING: `NBA_COMPASS.md` — one of the EIGHTEEN — covers it directly, and the sweep wrote
> RULE 33 about exactly this failure two passes before committing it.**
> > **COMPASS fact 105, dated 2026-09-19**: ***"`final_hp` STAYS DENORMALISED — A DELIBERATE
> > DECISION, NOT AN OVERSIGHT."*** *"The columns it shares with **`baseline_history`** *(`game_id`,
> > `anchor`, `band`, `phase`, `prop_tier`, `n_uncertain`, `baseline_hp`)* **look like ~25 GB of
> > duplication. THEY ARE BOUGHT SPEED.** **Two claims made against slimming were TESTED and one of
> > them was MY error, so both are recorded.**"*
>
> 🔑🔑 ***The two tables this entry identified as the unexplained 22.4 GB are the exact pair the
> corpus names, the duplication is deliberate, and slimming it was already argued and tested.***
> **So the finding stands as a STATE and is retracted as a puzzle.** ⚠ **What remains genuinely open
> is narrower**: **the current storage CAP** *(the 30 GB expansion is long exceeded at 43 GB)*, and
> **whether the expansion-time write hazard has been re-examined since the tables that now dominate
> are different ones.**
>
> ### 🔴🔴 **CORRECTED AGAIN — 2026-09-22 (T14 pass 0, §T14.1d). "THE CURRENT STORAGE CAP IS NOT RECORDED" WAS WRONG, AND THE PROBE THAT MISSED IT WAS BROKEN.**
> ⚠⚠ **The cap IS on file, in the TWELVE**: **`NBA_SYSTEM_ARCHITECTURE.md` carries *"2 GB RAM"* and
> *"Disk ~30 GiB with autoscale; hit its cap once mid-run and DigitalOcean flipped the primary…"***,
> **and `NBA_DATABASE.md` itself says the denormalised columns *"buy backtest speed on 2 GB RAM."***
> 🔴 **THE CAUSE OF THE MISS IS A BROKEN PATTERN, and it is RULE 15 exactly** *(a pattern tuned
> elsewhere silently mis-measures, and the wrong number is not always zero)*: **the probe required
> `.{90}` of context BEFORE the match, so it could not match a hit near the START OF A LINE — and
> both of these are line-initial.** ✅ **Re-taken with `.{0,80}`, pinned 2026-09-22T08:46:49Z, the
> hits appear immediately.** ***The absence claim is withdrawn.***
>
> ### ✅ WHAT IS ACTUALLY NEW, FROM T14's OWNER STRATUM *(2026-09-13)* — **and it SHARPENS the item rather than closing it**
> **The owner states the cluster and the ceiling directly**: ***"not 91% of 20, IT IS AT 91% OF 30
> GIGS"*** — **`alphadog-v2-postgres`, first-project, 1 GB RAM / 1 vCPU / 30 GiB disk / primary only
> / `nyc3` / PostgreSQL 18** *(`postgresql 18` and `nyc3`: **0 of the twelve AND 0 of the thirty**,
> pinned 2026-09-22T08:46:49Z)*.
> 🔑🔑 **AND THE CEILING IS AN OWNER DECISION, NOT A PLAN DEFAULT**: ***"it is not gonna expand it.
> THE THIRTY GIGS IS THE MAX."***
> ✅ **THE UPGRADE HE THEN MADE**: **shared CPU / 1 vCPU / 2 GB RAM / connection limit 47 / 30 GiB
> SSD / autoscale +10 GiB per node at 80% / primary only / $30.45 per month** — ⚠ **and the trigger
> was not disk**: ***"the alerts I've been getting are CPU MORE THAN ANYTHING."***
> 🔴🔴 **SO THERE IS A LIVE CONTRADICTION WORTH RAISING**: **the owner set 30 GiB as the maximum on
> 2026-09-13, and the database measured 43 GB on 2026-09-22** *(§0v)* — ***autoscale has fired at
> least twice past the stated ceiling.*** ⚠ **Whether the cap was later raised deliberately is NOT
> RECORDED in any transcript swept so far** *(T15–T20 are unread)*. **Documented, not acted on**
> *(rule 1)*.
> 📌 **And the retention decision meant to pay for it, in 0 of the thirty**: ***"just delete the
> BACKTEST — the MLB, if you are sure is backtest, you can delete everything, and KEEP everything
> that's LIVE on the MLB pipeline"***, *"soon enough I will delete everything for MLB, because on the
> next season that's gonna be reconstructed just like we're doing here."* ⚠ **Whether that deletion
> happened is NOT RECORDED**, **and it is the obvious first place to look for the 43 GB.**
>
> 📌 **AND THE OPERATIONAL COST OF THE DENORMALISATION IS RECORDED TOO** *(COMPASS fact 104, *"FOUR
> PERFORMANCE LESSONS THAT COST ~90 MINUTES EACH"*)*: *"**READ THE PLAN FIRST.** Three query
> rewrites were guessed before one **`EXPLAIN`** gave the answer immediately: a **Parallel Hash Join
> was building a hash from 8,270,978 `final_hp` rows** because the join key contained
> `replace(...)` and `lower(regexp_replace(...))` — 🔑🔑 ***"a FUNCTION ON A JOIN COLUMN means no
> index can ever be used."***"* ⚠ **That is the same table, and it bears directly on the owner's
> LATENCY requirement** *(`NBA_OPEN_ITEMS.md`, T13 seg 571 — 0 of thirty)*: **the size is bought
> speed, and the join key is where the speed was being given back.**
🔑 ***The incident above is therefore not closed by the shrink — the same hazard now sits on
different tables***, **and the 2:45 PM PT warning applies unchanged.**

## 0z. 📐 THE CLASS REGISTER — *every population this sweep's bound claims are drawn over, enumerated*
*Built 2026-09-21, T11 pass 46 (§T11.47). **The permanent remedy for the failure mode §T11.45c
named**: five distinct passes drew a BOUND from a class they had not enumerated, so the classes are
enumerated here once and cited thereafter.* ⚠ **Every count is `[LIVE-AUDIT]` and DATED — §T11.47c
shows a class that CHANGED during the sweep, so an unenumerated class is also an undated one.**

| class | size | enumerated at |
|---|---|---|
| **`nba*` schemas** | **14** | §T11.46 |
| **…of which hold ZERO base tables** | **6** — `nba_archive` · `nba_backtest` · `nba_classification` · `nba_context` · `nba_daily` · `nba_scoring` | §T11.46 |
| **`nba*` BASE TABLES, all schemas** | **104** | §T11.47 |
| **`nba_market` base tables** | **25**, ⚠ **of which 12 are `pp_*`** *(out of scope)* | §T11.47 |
| **Tables carrying `data_quality`** | **22** | §T11.22a |
| 🔴 **Tables carrying `phase`** | ❌ ~~6~~ → **7** *(corrected §T11.48b, **one pass after the register was built**)* — the six in scope: `conformal_confidence` · `final_hp` · `ladder_calibration_asof` · `scenario_calibration` · `scenario_realised` · `tier_band_calibration` — **plus `nba_market.prop_universe`, out of scope**, whose `phase` is **`regular` (1,652,753) / `no-boxscore` (14,271)**, ***an unrelated vocabulary*** | §T11.48 *(the register's row was copied from pass 45's measurement and not re-taken at pass 46 — **the register's own dating discipline, not applied to its own construction**)* |
| 🔴 **Tables carrying `side`** | **19** total · **6 named `pp_*`** · ***13 in scope*** *(§T11.28a said eleven — see §T11.47b)* | §T11.47 |
| **Game-keyed tables** *(`nba_stats` + `nba_team`)* | **10** — **8 hold three seasons, 2 hold one** | §T11.45c |
| **`nba_ref.prop_taxonomy` columns** | **18** *(the documents enumerate 8 as "every descriptive column")* | §T11.46 |
| **`nba_ref.prop_taxonomy` rows** | **28** | T8 |
| **`nba_config.factor_registry` rows** | **67** — closes five ways | §T11.28d |
| **Registered writers** (`worker_definitions`) | **21**, all enabled | §T11.37a |
| **Worker FILES on disk** (`alphadog-v2-nba-*.js`) | **21** — one-for-one with the registry | §T11.38b |
| **Scrapers** (`nba/scrape_*.py`) | **33** | §T11.46 |
| **`nba/*.md`** | **32** — ***30 in scope***, excluding `NBA_SWEEP_RUN_LOG.md` and `PP_PAYOUT_FINDINGS.md` | §T11.39b |
| **`nba_score.blowout_model`** | **35 rows · 3 `kind`s · 11 distinct `side` values · 11 `kind`‖`side` pairs** | §T11.28a · §T11.35c |
| **T11 transcript segments** | **712** — `tool_result` 355 · `tool_use` 227 · `text` 64 + 15 · `thinking` 51 | §T11.42a |

🔑 **THE RULE THIS TABLE EXISTS TO SERVE**: ***a BOUND states the class it was drawn over, and the
class is ENUMERATED before the bound is published*** — **rule 25's shape extended from samples to
classes** *(§T11.45c)*.

---

## 1. `nba_ref` — reference / dictionary layer *(T1)*

> ⚠ **THE `*_meta.json` PROVENANCE LAYER** *(recorded 2026-09-20, T1 pass 45 — **VERIFIED on the live
> repo**; documented in none of the twelve documents before now)*.
> **`nba/data/` holds 223 files, of which 41 are `*_meta.json` sidecars.** Each carries
> `fetched_at`, `source_url`, `http_status`, an entity count, and `error`. Example —
> `nba_teams_current_meta.json`: `fetched_at 2026-09-14T15:49:33Z`,
> `Season=2026-27`, `http_status 200`, `team_count 30`, `error null`.
> **This is what makes *"read the committed file, not the scraper's own claim"* checkable.**
> ⚠ **Coverage is roughly one in five**, and **NOT RECORDED as a decision** — for a file without a
> sidecar there is **no committed record of when it was fetched or whether the fetch succeeded**, and
> the workflow logs that would answer it **expire**. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 45.

### `nba_ref.teams`
The team dictionary. 30 active rows.
| Column | Type | Notes |
|---|---|---|
| `team_id` | TEXT | **PK** |
| `nba_team_id` | BIGINT | stats.nba.com's own stable TEAM_ID (e.g. 1610612737 = ATL) — unchanged for decades |
| `abbreviation` | TEXT | **was empty on first scrape** — `TeamAbbreviation` is not in `leaguestandingsv3`; fixed T1 |
| `full_name`, `nickname`, `location_name` | TEXT | |
| `conference`, `division` | TEXT | NBA-specific; MLB's `ref.teams` has AL/NL instead |
| `arena_id` | TEXT | ⚠⚠ **DEAD COLUMN — NULL on all 30 rows, written by no code.** *Corrected 2026-09-20 (T1 pass 65); this table previously described it as a link to `nba_ref.arenas`.* **VERIFIED live**: 30/30 NULL, and zero writes across all 190 code files. **The real link runs the other way** — `nba_ref.arenas.team_id`, populated on all 30 rows. **Join on `arenas.team_id`; a join through `teams.arena_id` returns 30 NULLs and looks like a scrape failure.** Origin: T1 deferred the assignment *"to a dedicated verification pass later"* that never ran and became unnecessary. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 65*. |
| `active` | INTEGER | DEFAULT 1 |
| `source_key` | TEXT | e.g. `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`. **Only updates on rows that actually changed** — 25 of 30 kept old keys when data was identical |
| `raw_json` | JSONB | ⚠⚠ **NOT a queryable object — a double-encoded JSON STRING.** *Corrected 2026-09-21 (T2 re-read pass 11); previously described here as "full source payload" with no caveat.* **`[LIVE-AUDIT]` VERIFIED**: `jsonb_typeof(raw_json)` = **`string`** on **all 1,306 rows across all six NBA static tables** (`teams` 30, `players` 582, `arenas` 30, `officials` 80, `player_season_profile` 582, `player_tracking_profile` 582). Every writer binds `${JSON.stringify(x).slice(0, N)}` — a JS string — into the JSONB column. **`raw_json ? 'key'`, `raw_json->>'field'` and `raw_json @> '{…}'` all return false/NULL/no-rows rather than erroring**, so a query against it silently concludes the data was never captured. Content is intact; only the encoding is wrong. → `NBA_OPEN_ITEMS.md`. |
| `created_at`, `updated_at` | TIMESTAMPTZ | DEFAULT now() |

### `nba_ref.team_aliases` — 162 active rows

> **THE VALUE VOCABULARY** *(recorded 2026-09-20, T1 pass 84 — defined in `alphadog-v2-nba-static-teams.js`, **VERIFIED** against the live table)*. `alias_type` ∈ **`city` (35), `nickname` (30), `full_name` (30), `abbreviation` (30), `nba_team_id` (30), `manual_alias` (7)**. `confidence` is **`CANONICAL`** for every derived-from-source alias and **`CONTROLLED_ALIAS`** for hand-curated ones — the worker's rule is `type === "manual_alias" ? "CONTROLLED_ALIAS" : "CANONICAL"`.
> ⚠⚠ **THREE NORMALIZED COLLISIONS EXIST** *(VERIFIED live)*: **`'los angeles'` maps to TWO TEAMS** (Clippers and Lakers — both carry `city: "Los Angeles"`), and `'golden state'` and `'utah'` each appear twice on one team (`city` + `manual_alias`). ✅ **Latent, not live**: **this table is written by one worker and read by no code**, so nothing resolves through it today. ⚠ **Also**: `alias_normalized` for the historical SuperSonics entry is **`'seattle supersonics historical pre 2008'`** — the parenthetical survives normalization, so **a lookup for "Seattle SuperSonics" cannot match it.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 84*.
`alias_key` TEXT **PK** · `team_id` · `nba_team_id` BIGINT · `alias_value` · `alias_normalized` ·
`alias_type` · `source_key` · **`confidence`** · `active` INT DEFAULT 1 · `updated_at`

**⚠ `confidence` here is NOT the scoring confidence.** It is an alias-provenance label with two
values: **`CONTROLLED_ALIAS`** (`alias_type = 'manual_alias'`) and **`CANONICAL`** (everything else).
`nba_ref.player_aliases` uses the same convention.
**A manually-curated alias is marked as such**, so a name-resolution failure can be traced to whether
the mapping was derived or hand-entered.

**Upsert behaviour**: `teamHasRealChange()` gates the write, and `*_written` counters report **rows
upserted in that run** (155/157), **not the table total** (162).

### `nba_ref.players` — 582 rows, 525 active
| Column | Type | Notes |
|---|---|---|
| `player_id` | TEXT | **PK** |
| `nba_player_id` | BIGINT | |
| `full_name`, `first_name`, `last_name` | TEXT | |
| `team_id` | TEXT | |
| `position` | TEXT | a position bug was found and fixed in T5 |
| `height_inches`, `weight_lbs`, `years_pro` | INTEGER | |
| `birth_date` | DATE | |
| `active` | INTEGER | DEFAULT 1 |
| `source_key`, `raw_json`, `created_at`, `updated_at` | | |
| `age`, `college`, `country`, `draft_year` | | **added T2** via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, from `leaguedashplayerbiostats` |

### `nba_ref.player_aliases` — 1,822 rows
Same shape as `team_aliases`, keyed on `player_id`.

> ⚠ **PROVENANCE OF THE 30-ROW STATIC FALLBACK** *(recorded 2026-09-20, T1 pass 38)*: verified by a
> `web_search` in T1 for league changes — *"the league still has exactly **30 teams with no expansion
> or relocations for 2026-27**, so it's safe to hardcode that as the static fallback list, **though I
> still shouldn't fully trust unofficial sources for expansion details**."* **The caveat is the part
> that matters**: the check rests on **unofficial sources**, was made **2026-08-31**, and is **NOT
> RECORDED as re-checked**. The fallback is what served the first successful run (*"genuinely seeded
> and correct today, but via the fallback, not the live API"*), so a franchise change before
> **2026-10-03** would propagate silently. *(The date is quoted as written; the regular season in fact
> opens **2026-10-20** — §T10.18b.)*

### `nba_ref.arenas` — 30 rows
| Column | Type | Notes |
|---|---|---|
| `arena_id` | TEXT | **PK** |
| `arena_name` | TEXT | current sponsor names (Rocket Arena, Frost Bank Center, Xfinity Mobile Arena) |
| `team_id`, `city`, `state` | TEXT | ✅ **`team_id` is THE team↔arena link** — **VERIFIED 2026-09-20**: 30 rows, `team_id` non-null on all 30, 30 distinct teams. **Not `nba_ref.teams.arena_id`, which is dead.** |
| `capacity` | INTEGER | **null where the SOURCE lacks it** — not a scrape failure. **VERIFIED live 2026-09-21: 11 of 30 NULL** (matches `arenas_missing_capacity: 11` in T2's run response; previously recorded only qualitatively). ⚠ The source field is a **string** when present (`"arena_capacity": "18694"`) and the cast to INTEGER is implicit at the write — no `toIntOrNull`-style coercion, unlike the bio worker. |
| *(absent)* `owner`, `year_founded` | — | ⚠⚠ **SCRAPED ON EVERY RUN, WRITTEN NOWHERE — and NOT recoverable from `raw_json`.** *Extended 2026-09-21 (T2 re-read pass 11).* `nba/scrape_nba_stats_arenas.py` lines 60–61 collect `"owner": col("OWNER")` and `"year_founded": col("YEARFOUNDED")`; `alphadog-v2-nba-static-arenas.js` line 71 writes five source-derived columns only, and this table has no column for either. **The obvious repair — add the columns, backfill from `raw_json` — fails**: across all 30 rows `raw_json ? 'owner'` matches **0** and `raw_json ? 'year_founded'` matches **0**; the stored payload holds four keys (`team_id, arena_name, arena_capacity, city`) and is a double-encoded string besides. **Why the stored payload predates the six-field scraper is NOT RECORDED — left OPEN.** → `NBA_OPEN_ITEMS.md`. |
| `altitude_ft` | INTEGER | present from day one (Denver matters) |
| `timezone` | TEXT | |
| `source_key`, `raw_json` | | |
| `data_quality` | TEXT | **DEFAULT 'derived'** — sourced vs derived distinguished from the first schema |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Source note:** `ARENA`/`ARENACAPACITY` are NOT in the standings endpoint. Correct source is
`teamdetails` → `TeamBackground` result set.

### `nba_ref.officials` — 80 active rows
`official_id` TEXT **PK** · `nba_official_id` BIGINT · `full_name` · `active` ·
`games_officiated` INT DEFAULT 0 · `source_key` · `data_quality` DEFAULT 'derived' · `raw_json` ·
timestamps. **Source: Wikipedia "List of NBA referees"** (the stats API has no referee roster).

### `nba_ref.prop_taxonomy`
`canonical_prop_key` TEXT **PK** · `prop_family` · `display_name` · …

### `nba_ref.player_name_map` — 5,212 players *(later transcripts)*
`norm_name` → `player_id`. The shared resolution layer used by the grader, the scorers and every board
join. Paired with `nba/nba_names.py`.

### `nba_ref.defender_ratings` — 111,768 rows *(T16)*

> 🔴🔴 **THE ROW COUNT IS EXACT AND THE TABLE IS DEAD — `166` DAYS STALE.** *Added T20 pass 78 (§T20.83), 2026-09-22, because **this document marks the table `✅ exact` at `:189` and says nothing about its age** — and a person checking the static layer reads this page.* ▶ **`SELECT max(as_of_date) FROM nba_ref.defender_ratings` ⇒ **`2026-04-09`** — `166` days stale, re-derived live `2026-09-22T19:16Z` (§T20.74), `111,768` rows.** 🔴 **AND THE SYSTEM ALREADY DETECTS IT: P1's certifier check `defender_ratings refreshed (<= 8 days)` is **RED TODAY** — `PIPE=p1` exits 1 on its first check.** ⚠ ***What is missing is not the detector; it is anyone running it*** *(`nba_control.job_runs` and `worker_run_log` are both EMPTY — §T20.31).* 📌 **`✅ exact` records that a COUNT was checked, not that the TABLE is current — §T20.14's lesson, and the reason this note sits here rather than only on the brief.** ▶ **Full item: the frozen-static-layer entry in `NBA_OPEN_ITEMS.md` (a tenth table, §T20.51); re-derived and HELD at §T20.74.** ⚠ *Documented, not fixed (rule 1).*
Two-way ridge `Y = mu + alpha(off) + beta(def)`, 5 channels, reliability-shrunk, weekly as-of, both
seasons. Has `as_of_date`.

---

## 1b. `nba_stats` / `nba_team` — the weekly profile layer *(T2)*

**`data_quality` defaults differ by layer, deliberately**: `nba_ref` tables default to **`'derived'`**,
these default to **`'real'`** (straight from the source). The column records provenance per row.

### `nba_stats.player_season_profile` — 582 rows
Source: **`leaguedashplayerbiostats`** — one call, whole league.
| Column | Notes |
|---|---|
| `player_id` | **PK** |
| `nba_player_id`, `season`, `games_played` | |
| `pts_total`, `reb_total`, `ast_total` | season totals |
| `net_rating`, `oreb_pct`, `dreb_pct` | |
| **`usg_pct`** | usage rate — a core prop-model input |
| **`ts_pct`** | true shooting |
| `ast_pct` | |
| `source_key`, `data_quality` DEFAULT `'real'`, `raw_json`, `updated_at` | |

**Cadence rationale (stated at build time):** bio fields are *"truly static"*; the season aggregates are
*"semi-static, stable enough for weekly refresh — **a single game barely moves a season average after
20+ games played**."* **Note this reasoning does not hold in the first 20 games of a season.**

> ### 🔴🔴 `[LIVE-AUDIT]` 2026-09-21 (T7 passes 24, 26) — **THE SEASON-LESS PRIMARY KEY, and why it matters on 2026-10-01**
> > **Season is in the primary key of exactly THREE of the forty NBA data tables that have one** —
> > `nba_stats.player_career_season_totals` (`player_id, season_id, team_id`),
> > `nba_team.defense_vs_position` (`team_id, opponent_position, season`) and
> > `nba_team.lineup_profile` (`group_quantity, group_id, team_id, season`). **The other 37 hold one
> > season at a time.** That is the dominant convention of the schema, not a quirk of a few tables;
> > the three exceptions are exactly the ones built to be multi-season. *Whether the convention was
> > deliberate is **NOT RECORDED**.*
>
> **37 tables across `nba_stats`, `nba_team` and `nba_ref` have a primary key with NO season column**
> — the single-season profile tables above all: `player_tracking_profile` (`player_id`) ·
> `player_onoff_profile` (`player_id`) · `player_season_profile` (`player_id`) ·
> `player_playtype_profile` (`player_id, play_type, type_grouping`) · `player_shot_quality`
> (`player_id, close_def_dist_range`) · `player_splits` (`player_id, split_type, group_value`) ·
> `player_tracking_detail` (`player_id, measure_type`) · `nba_ref.players` (`player_id`) ·
> `nba_team.season_profile` (`team_id`) · `nba_team.playtype_profile` · `nba_team.team_splits`.
> **They cannot hold two seasons at once**, and their writers upsert rather than insert —
> `alphadog-v2-nba-static-player-tracking.js` lines 58–64:
> `ON CONFLICT (player_id) DO UPDATE SET season=excluded.season, avg_speed=excluded.avg_speed, …`
>
> ⚠ **Composed with two other documented defects this becomes live on 2026-10-01**: the scrapers'
> `active_stats_season()` rolls over that day (19 days before the first regular-season game) while
> four workers hardcode `'2025-26'` with no meta fallback — so a weekly run **fetches an empty
> `2026-27` and upserts it over last season's real row, under last season's label.**
> **See `NBA_OPEN_ITEMS.md` O4 and `NBA_MASTER_SUMMARY.md` §T7.53a. Documented, not fixed.**

### `nba_stats.player_tracking_profile` — 582 rows
Source: **`leaguedashptstats`** (SpeedDistance) — one call.
`avg_speed`, `avg_speed_off`, `avg_speed_def`, `dist_miles`, `dist_miles_off`, `dist_miles_def`,
plus the standard `source_key` / `data_quality` / `raw_json` / `updated_at`.

### `nba_team.season_profile` — 30 rows
`games_played`, `wins`, `losses`, **`pace`**, `off_rating`, `def_rating`, `net_rating` + standard.
**Built after an HTTP 500** — stats.nba.com requires the FULL parameter set (many as empty strings).

### On/off-court splits — 661 raw rows → 582 distinct players
Source: **`teamplayeronoffdetails`** — per-team, **30 calls**, ~63 s.
Returns **three** result sets: `OverallTeamPlayerOnOffDetails`,
`PlayersOnCourtTeamPlayerOnOffDetails`, `PlayersOffCourtTeamPlayerOnOffDetails`.
**Each player's ON row is matched to their OFF row by `VS_PLAYER_ID`**, and the stored value is the
computed **net-rating differential** (team net rating with the player on the floor minus off) — the
"with/without you" signal. Verified values: **Wembanyama 17.0 on / 0.6 off = +16.4**, LeBron +2.3.
**Dedup rule:** players traded mid-season appear **twice** in the raw source; **the current-team row is
kept**. That is how 661 becomes 582.
**Status caveat:** this is explicitly a **SECONDARY, noisy** signal — descriptive of what happened,
polluted by teammates/opponents/small samples. See `player_impact_rating` for the primary anchor.

### `nba_stats.player_impact_rating` *(T2 decision, T3 build)*
**DARKO DPM** — Kostya Medvedovsky, `darko.app`, free. Rated by NBA front-office analysts (HoopsHype
survey) as the **best PREDICTIVE catch-all metric**, beating paid EPM and LEBRON on RMSE, *"because
it's forward-looking rather than backward-looking, which is exactly what matters for prop prediction."*
**This is the PRIMARY talent anchor**; on/off is secondary.

| Column | Notes |
|---|---|
| `player_id` | **PK** |
| `nba_player_id` | BIGINT — **DARKO uses the same NBA person IDs** (`203999` = Jokić), so no name matching and no diacritic exposure |
| **`dpm`** | Daily Plus Minus — the headline metric |
| `o_dpm`, `d_dpm` | offensive / defensive split |
| **`box_dpm`, `on_off_dpm`** | the two components DARKO blends |
| `rank` | league rank |
| `source_key`, `data_quality` DEFAULT `'real'`, `raw_json`, `updated_at` | |

**530/530 players.** Verified values: **Jokić +6.76, Wembanyama +6.37.**
**The table is deliberately named `player_impact_rating`, NOT `darko`** — taken on a stated risk
(*"single-maintainer bus factor"*) so the source can be swapped without touching consumers.
**Extraction:** the page is SvelteKit; the full dataset is embedded in the hydration script
(`kit.start(app, element, {...})`). JS bare decimals (`.534094`) must be repaired to valid JSON first.

---

## 1c. The WEEKLY DIFFERENTIAL layer *(T3)*

**Why it exists:** the upsert workers **overwrite** their tables on every run, so change cannot be
detected after the fact. A snapshot must be taken **before** the next overwrite. Six tables, three
snapshot/log pairs:

| Table | Columns |
|---|---|
| `nba_stats.player_roster_snapshot` | `player_id` PK, `nba_player_id`, `full_name`, `team_id`, `active`, `snapshot_taken_at` |
| `nba_stats.player_differential_log` | `id` BIGSERIAL PK, `event_type`, `player_id`, `nba_player_id`, `full_name`, **`old_team_id`, `new_team_id`**, `detected_at`, `details` JSONB |
| `nba_ref.team_roster_snapshot` | `team_id` PK, `nba_team_id`, `abbreviation`, `full_name`, `conference`, `division`, `snapshot_taken_at` |
| `nba_ref.team_differential_log` | `id` PK, `event_type`, `team_id`, **`field_name`, `old_value`, `new_value`**, `detected_at` |
| `nba_ref.official_roster_snapshot` | `official_id` PK, `full_name`, `snapshot_taken_at` |
| `nba_ref.official_differential_log` | `id` PK, `event_type`, `official_id`, `full_name`, `detected_at` |

**Baseline: 582 players / 30 teams / 80 officials.**
**Event types seen:** `team_change`, `new_player`, departed official.
**Note the team log is field-level** (`field_name`/`old_value`/`new_value`) while the player log is
purpose-built for team moves (`old_team_id`/`new_team_id`) — different shapes for different change
profiles.

### `nba_ref.referee_assignments` *(T15)*
Daily capture at 08:30 PT. **0 rows** — expected until the season opens.

---

> ### ⚠ THIS DOCUMENT IS THE ONLY SCHEMA ARTEFACT NBA HAS — and it is prose
> *Recorded 2026-09-20 (T1 pass 43). **VERIFIED**: `ls nba/*.sql` returns **nothing**.*
>
> **MLB has eleven committed schema files at the repo root** (`schema_ref_db.sql`,
> `schema_config_db.sql`, … — 133 KB) **plus `schema_manifest.json`. All of them are stale**: the
> manifest reads `"date": "2026-05-18"`, `"target": "AlphaDog v2 new D1 databases only"`, and **D1
> was decommissioned system-wide on 2026-08-12**. Their DDL is SQLite-flavoured and flat-named
> (`ref_teams`, not `ref.teams`).
>
> **NBA has zero.** Nothing went stale because nothing was written — **but there is no artefact to
> diff the live database against**, which is what blueprint §9's whole-universe comparison would
> need. **The live schema is the only record of itself, and this document is the only description of
> it.** **NOT RECORDED as a deliberate decision.** `NBA_OPEN_ITEMS.md` → FROM T1 PASS 43.

## 2. `nba_config` — NBA control configuration *(T1)*

> ### ⚠⚠ READ FIRST — **nothing in the codebase reads any of these tables except `external_credentials`**
> > 🔑 **AND THE RIGHT NAME FOR IT, 2026-09-21 (T9 pass 8).** T1 pass 68 named the family *"table
> > exists, **writer never born**"* — the mirror of the blueprint's *"registry entry, dead worker"*.
> > **These nine are a DIFFERENT member of it: "seeded, then orphaned."** They were written once with
> > real values (66 · 67 · 460 · 35 · 25 · 28 · 13 · 6 · 5 rows) and then a **hardcoded copy in
> > `nba/backtest/classification_ladder_v12.py` became the live version and drifted** —
> > `stat_decay_config` by 7 of 10 stats, `variation_bands` by 6 props against `VBANDS_ALL`'s 15.
> > ⚠ **An empty table is visibly unused; a seeded one looks authoritative** — it returns plausible
> > values while the system uses different ones. *The genuinely empty members of the family are
> > `nba_control.job_runs` (0), `nba_control.worker_run_log` (0) and `nba_ref.teams.arena_id` (NULL
> > on all 30).*
> > 🔴 **AND THE SCOPE OF THIS BANNER IS TOO NARROW — 2026-09-21 (T8 pass 4).** The class is not
> > confined to `nba_config`: **`nba_ref.prop_taxonomy` (28 rows, fully populated) is read by
> > nothing either** — zero code references, the `prop_taxonomy` hits being MLB's own table. **Read
> > this banner as "the config layer", not as "`nba_config`".**
> > *The design document's own closing line for this schema, `NBA_CLASSIFICATION_BASELINE_DESIGN.md`
> > line 252:* **"All tunables live in these tables. Nothing hardcoded."** *(surfaced 2026-09-21,
> > T7 pass 22 — the sharpest one-line statement of the gap this banner records.)*
> *VERIFIED 2026-09-20 (T1 pass 36) by grep of all 190 `.py`/`.js` files in `nba/` **and** the MCP
> admin bridge `alphadog-v2-admin-sql.js`.*
>
> The strings **`classification_config`, `factor_registry`, `factor_relevance`,
> `factor_profile_cells`, `stat_decay_config`, `ewma_alpha`, `system_settings`, `role_tiers`** appear
> **ZERO times** in the codebase. The only config table anything reads is
> **`nba_config.external_credentials`** (12 call sites, all fetching API keys).
>
> **⚠ AND THE LIST IS INCOMPLETE — 2026-09-21 (T7 pass 15).** Live `nba_config` holds **13 tables**;
> **`variation_bands` (25 rows) has NO code reference anywhere in the repo** and is absent from the
> list above — **and it is the table that gives the 13 continuous `factor_profile_cells` their
> `variation_band` key.** `calibration_log` and `worker_definitions` do have repo hits, but **all are
> MLB's D1 names** (`config_worker_definitions` in `verify_schema_all.py`, MLB workers) — **none
> `nba_config`-qualified** — so their NBA status is *not* established by those hits.
>
> **⚠ PRECISION, 2026-09-21 (T7 pass 11): that is SEVEN TABLES AND ONE COLUMN, not eight tables.**
> **`nba_config.ewma_alpha` does not exist** — `SELECT` on it errors *relation
> "nba_config.ewma_alpha" does not exist*. It is a **column of `nba_config.stat_decay_config`**
> (VERIFIED: the only `%ewma%` object in `information_schema`). **The string claim above is
> unaffected** — a column name appearing zero times in code is still an absence — but *"these
> tables"* below, and `NBA_MASTER_SUMMARY.md` §T7.39c's *"eight tables"*, both overstated it.
>
> **✅ RE-VERIFIED 2026-09-21 at a wider scope** (T7 pass 10): the original grep covered the 190
> `.py`/`.js` files in `nba/` plus the admin bridge; a grep of the **whole repository, unrestricted
> by directory or extension**, still finds **zero** code references — one day later, against a repo
> another session committed to overnight.
>
> **These tables are a documented design that no running code consults.** Their values are
> **maintained by hand alongside hardcoded constants**, not loaded from here. Editing a row changes
> nothing and raises no error.
>
> **This is the owner's founding rule not holding**: *"any future variable numbers must reside on the
> database, not hard coded… so all these are **easily changed by SQL command instead of coding and
> deploys**"* — a rule whose purpose is operational, because the owner has **no terminal**
> (`NBA_SYSTEM_ARCHITECTURE.md` §1a). **A cap, penalty or timeout change today needs a code edit, a
> commit and a deploy.**
>
> **It also reframes the recorded `minutes_mixture` drift**: that is not config and code diverging —
> **there is no coupling to diverge.** Full entry, including a measured config-vs-code diff:
> `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.
>
> **Not claimed**: that the values here are wrong. Only that nothing reads them.

### `nba_config.worker_definitions`
`worker_name` TEXT **PK** · `job_key` TEXT **UNIQUE** · `worker_group` · `phase_key` ·
`display_name` · `enabled` INT DEFAULT 1 · `notes` · `updated_at`
**8 columns — deliberately simpler than MLB's 16.** MLB's adds `owns_db_binding`,
`schedule_profile_key`, `max_tick_ms`, `max_api_calls_per_tick` and more.

### `nba_config.system_settings`
`setting_key` TEXT **PK** · `setting_value` TEXT · `updated_at`
**Seeded operating constants (T1):**
| Key | Value |
|---|---|
| `nba_static_teams_expected_count` | 30 |
| `nba_default_timeout_ms` | 20000 |
| `nba_default_retry_limit` | 3 |
| `nba_default_chunk_size` | 200 |
| `nba_differential_check_cadence` | **weekly** |

### `nba_config.external_credentials`
`credential_key` TEXT **PK** · `credential_value_encrypted` TEXT · `updated_at`

⚠⚠ **THE COLUMN NAME IS A MISNOMER — nothing encrypts and nothing decrypts** *(recorded 2026-09-20, T1 pass 67, **VERIFIED** two ways)*. **Code**: the column is read in exactly two places (`backfill_board_snapshots.py`, `backfill_game_line_snapshots.py`) and both use the value as-is — **`.strip()` is the entire transformation** — with **no encrypt or decrypt step anywhere in the 190 files**. **Data**: 6 credentials are stored, and **two are bare 36-character UUIDs** (`balldontlie_api_key`, `oddspapi_api_key`); the other four are 32-char ×3 and one 1,513-char token whose encoding is **NOT RECORDED**. ⚠ **The same values appear in plaintext in five of the twenty transcripts** — see the blocker at the top of `NBA_OPEN_ITEMS.md` before committing those files anywhere. **Not fixed, per the standing instruction.**
Holds `balldontlie_api_key`, and later `betr_access_token`. **Credentials never live in chat memory.**
⚠ **The BallDontLie key is explicitly a BACKUP credential** *(recorded 2026-09-20, T1 pass 39, from
T1's memory write)*: *"provided a real balldontlie.io API key … **as a backup source**, but said **the
data ideally should come from nba.com itself**, just like the MLB system uses the official MLB Stats
API."* **The source ordering — nba.com primary, BallDontLie subordinate — is an owner instruction**
and had not been recorded. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 39.

## 2b. THE TIERING CONFIG LAYER *(T8 — materialised from the five-dimension design)*

All row counts **verified live 2026-09-20.**

### `nba_ref.prop_taxonomy` — **28 rows**
Created empty in T1, correctly flagged as empty in T7's audit, **seeded in T8**. The canonical prop
list the whole matrix is built over.

✅ **`[LIVE-AUDIT]` 2026-09-21 (T8 pass 4) — FULLY POPULATED, and that is unusual here.** All **28 of
28** rows carry every descriptive column — `apps` · `period` · `ot_rule` · `distribution_family` ·
`direction_skew` · `build_tier` · `natural_floor` · `ladder_step` — and all 28 are `active = 1`.
**No nulls anywhere.**

❌ **"A NINTH" IS CORRECTED BY §T11.46a — the table has EIGHTEEN columns and FIVE descriptive ones sit
outside the documented eight**: **`prop_family` · `display_name` · `stat_expression` ·
`applies_to_side` · `is_composite`** *(plus the key, `active`, `notes` and two timestamps)*.
📌 **`is_composite` — 18 simple / 10 composite = 28 — is 0 of thirty**, and it partitions the same 28
rows differently from `prop_family` *(`combo` 6 + `composite` 2 against `is_composite = 1`'s TEN: the
six combos, the two fantasy props **and the two milestones**)*. ***Two columns, one table, two
partitions, one documented.***

🔴 **AND `applies_to_side` IS ONE OF THE DESCRIPTIVE COLUMNS THE ENUMERATION OMITS**
*(`[LIVE-AUDIT]` 2026-09-21, §T11.28b. **0 of thirty**, positive-controlled; `stat_expression` is
also 0.)* **Fully populated, 28 of 28, and its value set is two:**

| `applies_to_side` | rows | which |
|---|---|---|
| **`both`** | **26** | everything else |
| 🔑 **`more`** | **2** | ***`double_double` AND `triple_double`*** — family `milestone`, `direction_skew` `binary`, `distribution_family` `joint_simulation_binary`, `build_tier` `B`, `ot_rule` `included` — **identical rows** |

🔑🔑 **This turns §T11.20b from an inference into a DECLARATION.** §T11.20b reasoned *from a subset
relation* — the market tables carry `No`/`Over`/`Under`/`Yes` and `final_hp` only `Over`/`Under`, *"so
the Yes/No props never reach it"*. ***The taxonomy states it directly***: two props are **`more`-only
by design**, named in the reference table. **And it is not the Goblin/Demon "More-only" rule** — that
is a *line-layer* property of the board, documented in five of the twelve; **this is a *prop-level*
property of the taxonomy, documented in none.**

🔴 **AND THE TWO ARE NOT TREATED ALIKE IN PRODUCTION** *(live, 2026-09-21)*:

| prop | `final_hp` | `baseline_ladder` | `board_scored` | `rung_market` |
|---|---|---|---|---|
| `double_double` | **47,504** | **541** | 0 | 0 |
| 🔴 **`triple_double`** | **0** | **0** | **0** | **0** |

***`triple_double` is in the taxonomy and has never produced a row anywhere.*** ⚠ **Five of the twelve
document `double_double`'s *"sentinel −1.0, no ladder"* treatment and NONE says `triple_double` shares
it or that it is unbuilt** — the corpus names the pair only in family enumerations.

🔑🔑 **AND THE BOARD SURFACES ANSWER PART OF IT** *(§T11.52c, `[LIVE-AUDIT]` 2026-09-21)*:
**`nba_market.board_outcomes` carries `player_double_double` 42,436 and NO `player_triple_double`;
`nba_market.board_snapshots` — 27M rows, six apps, 380+ days — carries `player_double_double`
**274,010** and ***NO `player_triple_double` AT ALL***.** ***So the prop is absent from the raw board
feed, not merely from the scored tables: the system did not fail to build something the board
offered.*** ⚠ **Stated at the right strength**: **the captured feed's `market_key` vocabulary is what
the scrapers REQUEST**, so *"no `player_triple_double` market appears in the captured board feed"* is
the claim — ***whether the apps do not offer it or the scrapers do not ask for it is NOT RECORDED***
(rule 6).

✅ **And the sentinel path is TOTAL, which sharpens §T9.37a from a majority to a census**:
`baseline_ladder` **206,237 rows · 559 `used_emp = false` · 541 of them `double_double`** — and
**`double_double` has exactly 541 rows**, so ***every `double_double` row is `used_emp = false`, 541
of 541, no exceptions***, the remaining **18** being the documented `threes_made` fall-throughs.
**541 + 18 = 559** ✅. *"541 of 559"* was true and understated the structure: **it is not that most
false rows are `double_double` — it is that no `double_double` row is anything else.** *Set against its sibling `nba_config.factor_profile_cells`, seeded in the same
transcript, where `last_validated_at` is null on all 35 and `real_sample_size_observed` is 0 on all
35: the taxonomy encodes **decisions**, the cells encode **estimates awaiting a backtest**.* ⚠ Three
of its columns — **`build_tier`, `natural_floor`, `direction_skew`** — are named in **none** of the
thirty documents, though the table is discussed in twelve.

🔴 **And the vocabulary it defines is unused on the NBA side.** **`canonical_prop_key` — this table's
primary key — appears 1,218 times in the codebase and ZERO times under `nba/`**; all 1,218 are the
MLB fleet (`score-prep`, the certifiers, the parlay boards, the market-line-shape classifier). **The
NBA board scrapers do not map to it at all** — `scrape_underdog_board.py`, `scrape_sleeper_board.py`
and `scrape_fliff_board.py` contain no `taxonomy` and no `canonical_prop` reference, emitting raw
board JSON instead. *What translates an NBA board leg into a canonical prop key, if anything, is
**NOT RECORDED**.*

🔴 **And nothing reads the table itself.** **`nba_ref.prop_taxonomy` appears ZERO times in the codebase** — the six
files matching `prop_taxonomy` are **MLB's** (`alphadog-v2-static-prop-taxonomy.js`, the MLB parlay
boards, the phase2b certifier, `verify_schema_all.py`), none schema-qualified to `nba_ref`. For
contrast, `nba_ref` **is** read elsewhere: `player_name_map` 24 sites, `players` 15,
`defender_ratings` 12, `teams` 7. ⚠ **This is the first read-by-nothing object OUTSIDE `nba_config`**,
so the §2 banner's *scope* — not only its list — was too narrow. *What consumes the taxonomy's
grading rules today, if anything, is **NOT RECORDED**.*

#### The original MLB→NBA taxonomy mapping *(T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1)*
| MLB concept | NBA equivalent, as stated |
|---|---|
| **Hitter props** (hits, total_bases, rbis, runs, singles, doubles, home_runs, stolen_bases, walks, hits_runs_rbis) | **Points, rebounds, assists, 3PM, steals, blocks, turnovers, PRA, P+R, P+A, R+A, double-double, triple-double** |
| **Pitcher props** (strikeouts, outs, hits_allowed, walks_allowed, earned_runs, runs_allowed, pitcher_fantasy_score) | *"**No direct 1:1 equivalent** — NBA has **no 'opposing role' prop family analogous to pitching**. Closest conceptual parallel: **none needed; ALL NBA props are 'batter-style' (offense-side player stats). SIMPLIFIES THE TAXONOMY relative to MLB.**"* |
| Fantasy-score composite | *"various **platform-specific formulas** — **verify each platform's own formula explicitly**, per lesson #14, before any cross-platform comparison"* |
| Goblin/Demon/Standard variant tiers | *"platform-level mechanic, not sport-specific… **but verify TIER-COUNT and TIER-SPACING conventions PER PROP before assuming**"* |

**⚠ The combo instruction, stated at the outset:**
> *"NBA has **real combo props (PRA etc.)** already confirmed to exist on ParlayAPI's market-key
> list — **treat these as a FIRST-CLASS PROP FAMILY FROM DAY ONE, NOT AN AFTERTHOUGHT**, since
> **MLB's own combo prop (`hits_runs_rbis`) caused REAL ANALYSIS HEADACHES from being treated as a
> BOLT-ON.**"*

**This instruction was followed.** Combos were built as **joint simulation over calibrated marginals
with per-player covariance** — *"never a direct fit"* — and certified on both seasons (P+R 0.9,
R+A 0.9, PRA 1.1, fantasy 0.8 pp). **The `BT_SAVE_COMPONENTS` pickling and the separate
`combos_ladder_v1.py` recipe are what "first-class, not bolt-on" looks like in code.**

**And the "no pitcher equivalent" note explains a structural simplification**: NBA has no
opposing-role prop family, so **every prop is offense-side player stats**. *(The opponent enters as a
FACTOR — opponent paint share, opponent turnover rate — not as its own prop family.)*

> ⚠ **`nba_ref.prop_taxonomy` — 28 props, 10 families; the day-one plan named 14**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 62).*
>
> | family | n | keys |
> |---|---|---|
> | `scoring` | 6 | `points`, `points_1q`, `points_1h`, `points_2h`, `points_4q`, `ftm` |
> | `combo` | 6 | `pra`, `pts_reb`, `pts_ast`, `reb_ast`, `pra_1q`, `stocks` |
> | `defense` | 3 | `blocks`, `steals`, `personal_fouls` |
> | `composite` · `milestone` · `playmaking` · `rebounding` · `shooting` · `volume` | 2 each | `fantasy_score(_1q)` · `double_double`, `triple_double` · `assists(_1q)` · `rebounds(_1q)` · `threes_made(_1q)` · **`fga`, `fg3a`** |
> | `ball_handling` | 1 | `turnovers` |
>
> **Every prop the System Draft planned exists. Fourteen more were added and none is recorded as a
> decision** — most importantly **nine period variants**, which the day-one taxonomy had no dimension
> for and which now make up **a third of the board surface**. Period props carry their own
> **`ot_rule`**, and OT handling **differs by app** — lesson #14's prop-definition-mismatch trap.
> `NBA_OPEN_ITEMS.md` → FROM T1 PASS 62.

### `nba_config.factor_registry` — **67 rows** *(seeded at 29 in T8)*
Factors, *"layer-tagged, with macro-clusters"* — i.e. each carries whether it is a **baseline** or
**enrichment** factor, and which cluster it belongs to. **It has more than doubled since T8**, and is
the ancestor of the A/B/D/M/N factor codes used in T15–T16 and of
`nba/NBA_ENRICHMENT_FACTOR_LOCK.md`.

### 🔴🔴 `nba_market.board_snapshots` — **NOT NBA-ONLY**
*`[LIVE-AUDIT]` 2026-09-21, T11 pass 7 (§T11.8a). **27,067,871 rows, 2024-10-22 → 2026-09-13.***

**`market_key` holds ~90 distinct values and the majority are BASEBALL** — `player_batter_hits`,
`player_pitcher_strikeouts`, `player_1st_inn._batters_faced`, `player_home_runs`, `player_rbis`,
`player_stolen_bases`, `player_earned_runs_allowed`, `player_total_bases`, `player_singles`,
`player_hits_+_runs_+_rbis`, `player_team_total_runs`, `player_outs`… — beside the NBA set
(`player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_blocks`,
`player_steals`, `player_turnovers`, `player_double_double`, `player_blocks_steals`,
`player_points_rebounds_assists`, `player_fantasy_points`, each with `_alternate`).

🔴 **Source**: the **`routine`** label is the **live 2-hour board crons** (`sleeper-board.yml`,
`underdog-board.yml`, `fliff-board.yml`), which ran in **mid-September — not NBA season**:

> 🔴 **CORRECTED 2026-09-23, §F1.2 — THE ENUMERATION ABOVE IS INCOMPLETE. THERE IS A FOURTH LIVE
> 2-HOUR BOARD CRON AND IT IS MLB-ONLY.**
> *Re-derived from the authority (rule 21, repo read 2026-09-23): `.github/workflows/` holds **40**
> files. Four carry a two-hour board cron, staggered:*
>
> | workflow | `name:` | cron | sport default |
> |---|---|---|---|
> | 🔴 **`scrape.yml`** | **`MLB Automatic Scraper`** | **`0 */2 * * *`** | **MLB only** — step *"Produce PrizePicks MLB JSON"* |
> | `sleeper-board.yml` | `Sleeper Board Scraper` | `15 */2 * * *` | `SLEEPER_SPORTS` default **`mlb,nba`** |
> | `underdog-board.yml` | `Underdog Board Scraper` | `25 */2 * * *` | `UNDERDOG_SPORTS` default **`MLB,NBA`** |
> | `fliff-board.yml` | *(per §T7.53b)* | `35 */2 * * *` | *(not re-read this pass)* |
>
> **The sentence above, and `NBA_MASTER_SUMMARY.md` §T7.53b's scheduled-workflow table, both omit
> `scrape.yml`.** ✅ **§T7.53b's omission is CORRECT BY ITS OWN STATED CRITERION** — that table
> enumerates *"seven scheduled ones **touch `nba/`**"*, and `scrape.yml` runs `python main.py` at the
> repo root. 🔴 **The sentence above carries no criterion**: it names *"the live 2-hour board crons"*
> unqualified, and a fourth one exists. 📌 ***An enumeration with a criterion survived; the same
> enumeration with the criterion dropped did not. The defect is the dropped qualifier, not the
> original count.***
>
> ⚠ **`scrape.yml`'s cron is deliberate and dated.** Its own comment: *"PREVENTION FIX 2026-08-06:
> added after a real incident where the board went stale … Runs every 2 hours regardless of whether
> anything else in the pipeline is calling it."* **It was added six days BEFORE the 2026-08-12 MLB
> decommission this corpus records, and it survived it.** **12 runs/day, unconditional.**
>
> ⚠⚠ **RULE 54 — the limit of this evidence.** The cron is VERIFIED off the repo. What is **NOT
> RECORDED** is whether `scrape.yml` is what wrote any particular row: it commits board JSON to
> `main`, and the database write may come from a separate ingestion path. All three workflows also
> carry `workflow_dispatch:` and `scrape.yml` carries `repository_dispatch:`, so a write cannot be
> attributed to the cron from the table alone — and `nba_control.job_runs` is empty (`T20-3` ②), so
> the database cannot attribute it either. **The cadence is proven; the attribution is not.**

| bookmaker | `routine` rows | **NBA-shaped `market_key`s** |
|---|---|---|
| `underdog` | 5,281 | **189 (3.6%)** |
| `fliff` | 1,394 | **0** |
| `sleeper` | 1,276 | **0** |

⚠⚠ **CONSUMER HAZARD — ***a row in this table is not necessarily an NBA row***.** **Any count, date
range or `market_key` listing taken on `bookmaker`/`game_date` alone silently includes other sports**,
and this sweep made that mistake four times before catching it. **Filter `market_key` to the NBA set,
or filter out `snapshot_label = 'routine'`, depending on the question.**

🔑 **BUT THE SIZE OF IT, measured 2026-09-21 (§T11.9b) — and the vocabulary is far more alarming than
the data:**

| app | unfiltered | **NBA-only** |
|---|---|---|
| `prizepicks` | 2,199,354 | **2,199,354 — 100%** |
| `underdog` | 939,719 | **934,627 — 99.46%** |
| `betr_us_dfs` | 780,765 | **780,765 — 100%** |
| `pick6` | 534,188 | **534,188 — 100%** |
| `fliff` | 1,394 | **0** |
| `sleeper` | 1,276 | **0** |
| **all sportsbooks** | **22,611,175** | **22,611,175 — 100%** |

✅ **Total contamination: 5,092 + 1,394 + 1,276 = 7,762 rows of 27,067,871 — 0.029% — every one of
them in the `routine` label.** ***Most of the `market_key` VALUES are baseball; 99.97% of the ROWS are
NBA. Both are true, and an entry giving only the first overstates the defect.***
✅ **The historical `window` / `close` backfill is clean.** 📌 **Whether the cross-sport capture is
deliberate is NOT RECORDED** — see `NBA_OPEN_ITEMS.md`.

🔴 **And nothing in `nba_market` stores the sport** (§T11.9c): not `board_snapshots`, `board_outcomes`,
`board_tiers`, `rung_market`, `game_lines_closing`, `game_lines_snapshots`, `event_game_map`,
`schedule_norm` or `board_backfill_log`. ***The sport is always inferred*** — from `market_key`, from
team names, or **for the last three, not at all.**

---

### 🔴 `nba_market.board_outcomes` — **two discriminator columns are entirely NULL**
*`[LIVE-AUDIT]` 2026-09-21, T11 pass 4 (§T11.5c). **6,905,452 rows.***

| column | populated | note |
|---|---|---|
| **`bookmaker`** | **0 of 6,905,452** | 🔴 **entirely NULL** |
| **`snapshot_label`** | **0 distinct values** | 🔴 **entirely NULL** |
| `market_key` | 21 distinct | ✅ |
| `is_alternate` | **5,143,042 true** | ✅ |
| `leg_result` | **`over_win` · `under_win` · `push` · `dnp` · `unmatched_player`** | ✅ documented |

🔴 ***The graded-outcome surface cannot say which app a result belongs to, or which snapshot window
produced the line*** — **while `nba_market.board_snapshots`, the table it grades, carries both**
(`bookmaker` distinguishes `prizepicks` · `underdog` · `betr_us_dfs` · `pick6` · `sleeper` · `fliff`
and eight sportsbooks; `snapshot_label` distinguishes `window` · `close` · `routine`).

**Recovering either means joining back on `(game_date, event_id, player, market_key, side, line)`.**

⚠ **Why it bites**: **the per-app payout structures are the whole of `NBA_MULTIPLIERS.md`** — Power
vs Flex, same-game discounts, the `p × m` gate — **and a graded leg that cannot name its app cannot be
priced against them.** 📌 **Whether any live consumer needs that attribution is NOT RECORDED**; this
pass did not trace it. **The "seeded, then orphaned" class, but as two columns of a heavily-used
table rather than an unread one.**

---

### ⚠ ONE CONCEPT, FIVE COLUMN NAMES — the join map
*`[LIVE-AUDIT]` 2026-09-21, T10 pass 23 (§T10.23b). **Every name below is live and correct — for its
own table.** The trap is that the documents use all of them and never say which belongs where.*

| Concept | `nba_config.factor_profile_cells` | `nba_score.baseline_ladder` / `baseline_history` | `nba_config.variation_bands` | `nba_config.role_tiers` |
|---|---|---|---|---|
| **variation band** | `variation_band` | **`var_band`** | **`band_key`** | — |
| **role tier** | **`role_tier_key`** | `role_tier` | — | `role_tier_key` |
| **rate tier** | **`tier_label`** | — | — | — |
| **prop** | `canonical_prop_key` | `prop` | `canonical_prop_key` | — |

🔑 **`snapshot_label` SPLITS BY PIPELINE FAMILY — all nine tables that carry it** *(§T11.18b,
completed §T11.19a)*:

| family | tables | values |
|---|---|---|
| **BOARD** | `board_snapshots` · `board_tiers` · `board_tiers_v2` · `rung_market` · `board_backfill_log` | **`close` · `window`** *(+ **`routine`** on `board_snapshots`, the live-capture table)* |
| **GAME LINES** | `game_lines_snapshots` · `game_lines_snapshot_log` | **`morning` · `window`** |
| *(unpopulated)* | `board_outcomes` — all NULL · `nba_score.paper_picks` — empty | — |

✅ **`window` is the value common to both families; `close` is board-only; `morning` is
game-lines-only.** ***Not arbitrary drift — two capture pipelines, each with its own second label.***
📌 `nba/export_market_spreads.py` filters `snapshot_label IN ('morning','window')`, **correct for its
family.** ⚠ *`morning` covers **2,468** events against `window`'s **2,466** — **NOT RECORDED** why.*
*Row split: `game_lines_snapshots` **153,934 `window` + 153,670 `morning` = 307,604** ✅.*

🔴 **AND TWO COLUMN NAMES DO COLLIDE, WITH UNRELATED MEANINGS** *(§T11.19b — rule 24)*:

| column | where | values |
|---|---|---|
| **`kind`** | `board_tiers` · `board_tiers_v2` · `tier_band_calibration` · `tier_selection_value` | **`demon` · `goblin` · `standard`** — the PrizePicks taxonomy |
| **`kind`** | 🔴 **`nba_score.blowout_model`** | 🔴 **`minutes_by_margin` · `p_blowout` · `sliding_scale`** — *a model-component name* |
| **`market`** | `nba_market.game_lines_snapshots` | **`h2h` · `spreads` · `totals`** — game-level bet types |
| **`market`** | 🔴 **`nba_market.rung_market`** | 🔴 **`player_points` · `player_assists` · …** — *player prop keys* |

📌 **`nba_score.board_scored.kind` is entirely NULL** — a third unpopulated discriminator after
`board_outcomes`' two.

🔑 **`data_quality` IS A PER-TABLE PROVENANCE MARKER, NOT A PER-ROW QUALITY FLAG** *(census across
all 22 tables, §T11.22a)*

| value | tables |
|---|---|
| **`real`** — scraped from a source | **20** |
| **`derived`** — computed | **2: `nba_stats.player_shot_quality_delta` · `nba_team.defense_vs_position`** |

📌 **AND THE VALUE IS THE COLUMN DEFAULT — except on two tables, where the default is dead**
*(`[LIVE-AUDIT]` 2026-09-21, §T11.27c — the census completed to table × value pairs)*

**22 tables, 22 table–value pairs** *(so every table holds exactly one value — the per-table finding
above, now verified as a census of pairs rather than of values)*. **1,212 `derived` + 162,651 `real`
= 163,863 rows.** **FOUR tables carry `DEFAULT 'derived'`** and only two of them hold it:

| table | `column_default` | every row holds |
|---|---|---|
| `nba_stats.player_shot_quality_delta` | `'derived'` | **`derived`** (582) ✅ default taken |
| `nba_team.defense_vs_position` | `'derived'` | **`derived`** (630) ✅ default taken |
| 🔴 **`nba_ref.arenas`** | **`'derived'`** | **`real`** (30) — ***default never taken*** |
| 🔴 **`nba_ref.officials`** | **`'derived'`** | **`real`** (80) — ***default never taken*** |

🔑 **This bears on a claim four of the twelve make.** `NBA_DATABASE.md`, `NBA_GLOSSARY.md`,
`NBA_MASTER_SUMMARY.md` and `NBA_RECIPE.md` all cite `data_quality TEXT DEFAULT 'derived'` on the
reference tables as *"sourced vs derived distinguished from day one."* ***The design statement is
true. The two reference tables it is cited from are 100% `real`, so on them the distinction has never
once been exercised and the `derived` default is unreachable in practice.*** **NOT RECORDED whether
that is deliberate.** **The other 18 tables hold their own default exactly, so across the whole
surface the column restates the DDL and carries no per-row information.**

***It is CONSTANT WITHIN each table — no table mixes the two*** — **so it labels the table's
provenance, one row at a time.** ✅ **And the two `derived` tables are exactly the computed ones: a
delta and an aggregate.**

---

🔴 **AND `board_tiers` vs `board_tiers_v2`: SAME ROW COUNT, DIFFERENT VALUE SETS** *(§T11.20a)*

| column | `board_tiers` | **`board_tiers_v2`** |
|---|---|---|
| rows | **2,199,354** | **2,199,354** — *identical* |
| `kind` | `demon` · `goblin` · `standard` | same |
| **`anchor_type`** | `explicit` · `switch_point` | 🔴 **+ `none`** |
| **`tier`** | `0` · `−1…−6` · `1…8` | 🔴 **`−7…+8`** |

***The counts match and the content does not*** — v2 carries a third anchor type and a wider tier
range. 📌 **What v2 is, and whether it supersedes v1, is NOT RECORDED.**

✅ **`side` is a SUBSET relationship, not a collision**: `board_snapshots` and `board_outcomes` both
carry **`No` · `Over` · `Under` · `Yes`**, and **`nba_score.final_hp` carries only `Over` · `Under`** —
🔑 ***the `Yes`/`No` props never reach `final_hp`***, consistent with `double_double`'s documented
*"sentinel −1.0, no ladder."*

🔴 **`rate_tier` is NOT a column anywhere** — it is the design's word for `tier_label`.
📌 **Mentions across the twelve**: `variation_band` **43** · bare `role_tier` **40** · `var_band`
**12** · `tier_label` **11** · `role_tier_key` **11** · `rate_tier` **4**. ***Both vocabularies are
in use in the same documents, and only this table says which is which.***

---

**`compute_stage` — the exact literals, because the prose form is not the value** *(`[LIVE-AUDIT]`,
re-verified 2026-09-21, T10 pass 21)*:

| value | rows |
|---|---|
| `phase1_baseline` | **15** |
| **`phase2_window`** | **17** |
| `live_only_excluded_from_history` | **2** |
| `not_mined` | **2** |
| `NULL` *(every baseline-layer row)* | **31** |

**15 + 17 + 2 + 2 = 36 enrichment · + 31 NULL = 67** ✅

⚠ **The documents describe these as *"phase-1"* and *"phase-2"*, and the phase-2 literal is
`phase2_window` — NOT `phase2_enrichment`, which does not exist in the table.** *Recorded because a
probe written from the prose returns zero rows and reads as an absence.* 🔑 **Same shape as the
`nba_score.factor_gate_results` schema trap: an object named from the prose rather than from the
table.**

### `nba_config.factor_relevance` — **460 rows**
The **prop × factor relevance matrix** — which factors are even candidates for which props.

🔴 **`[LIVE-AUDIT]` 2026-09-21 (T7 passes 12 and 22) — the design specifies THREE grades; the data
uses two.** `NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 244: *"`factor_relevance` — factor × prop →
**full / partial / none**."* Live the column takes **exactly two values: `full` (440 rows) and
`partial` (20)** — **`none` is specified and never written**, so 95.7% of pairs are `full` and **as a
filter the table currently excludes nothing**. ✅ Referential integrity is clean: **0 of 460** `factor_key` values are orphaned against
`factor_registry`, and all **24** distinct (factor, prop) pairs that carry a fitted cell are graded
`full`.

> 🔴 **AND THE CHECK RUNS IN THE ONE DIRECTION THAT CANNOT SEE THE GAP — recorded 2026-09-21
> (T10 pass 6, §T10.6a).** *"0 of 460 orphaned against `factor_registry`"* is the **relevance →
> registry** direction. **Registry → relevance, live:**
>
> | Layer | Registry rows | Has a relevance row | **No relevance row** |
> |---|---|---|---|
> | baseline | 31 | **25** | **6** |
> | **enrichment** | **36** | **4** | **32** |
> | **Total** | **67** | **29** | **38** |
>
> ✅ **25 + 4 = 29** *(the distinct `factor_key`s present)* · **6 + 32 = 38** · **29 + 38 = 67**.
> 🔴 **The matrix knows 4 of 36 enrichment factors — 89% of that layer is unmapped** — against 25 of
> 31 baseline. *It was seeded against the **29-factor** registry in T8 and never extended when the
> registry grew to 67.*
>
> ⚠ **Read with the finding above it**: `none` is never written, so the gate **excludes nothing**, and
> it is **blind to 38 of 67 factors**. *A filter that filters nothing, over a set it half knows.*

### `nba_config.factor_profile_cells` — **35 rows**
The fitted **lifts/penalties**, *"in exactly MLB's cell form."* Seeded from research as provisional
values — *"**these are the values the backtest will move**."*

**⚠ Read the 35-vs-460 gap correctly**: most prop × factor pairs are marked **relevant** but carry
**no fitted cell**. That is consistent with the T15/T16 result — **ten enrichment candidates tested,
none survived at leg level**. **The matrix records what was considered; the cells record what earned a
value.**

✅ **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 10) — the §2 banner RE-VERIFIED at a wider scope, and it
holds.** The banner's grep (T1 pass 36) covered the 190 `.py`/`.js` files in `nba/` plus the admin
bridge; this pass grepped the **whole repository, unrestricted**, and `factor_profile_cells` and
`factor_relevance` still appear in **zero code files** — one day later, against a repo another
session committed to overnight. **The count of tables read by nothing is the banner's eight, not a
new number.** One refinement: at repo level `nba_config` is read as `external_credentials` (12 sites)
**and** `nba_config.pp_slip_rules` (2 sites, another session's table, **out of scope**) — so
*"only `external_credentials` is read"* is true of the eight, not literally of the schema.
*Cross-system context only (MLB is dropped): the same
pattern under MLB's names **is** live — `config.enrichment_profile_cells` is read by
`alphadog-v2-phase2a-run-environment.js:271`, `config_enrichment_profile_cells` by
`alphadog-v2-score-audit.js:6221`, and `gbdt_training/validate_factor_coefficients.py:204` writes
back `last_empirical_validation_json` / `last_validated_at` — **the two columns null on every NBA
row**. The NBA repo has no equivalent of either; whether one is pending is **NOT RECORDED**.*

**`[LIVE-AUDIT]` — the table is TWO POPULATIONS, zero mixing across 35 rows, and EVERY cell is keyed.**
The design key is **six-dimensional** — *factor × prop × rate_tier × role_tier × direction ×
variation_band* (`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 247) — **and which key columns are
populated is itself the population marker**:

> 🔴 **`[LIVE-AUDIT]` 2026-09-21 (§T10.23b) — those are the DESIGN's names, not the table's.** The
> live columns are **`factor_key` · `canonical_prop_key` · `tier_label` · `role_tier_key` ·
> `direction` · `variation_band`.** ⚠ ***`rate_tier` is not a column in ANY `nba%` table*** — the
> rate tier is stored as **`tier_label`**, which these documents already use correctly eleven times
> elsewhere. **Query `tier_label`; `rate_tier` returns `column does not exist`.**

| | Effect | Keyed by | Direction | Cells |
|---|---|---|---|---|
| **Bucketed** | flat `lift` **or** `penalty` | `tier_label` (+ `role_tier_key`), `variation_band` NULL | `more` 21 · `less` 1 | **22** |
| **Continuous** | `formula_expression` + `coefficient_a` | **`variation_band = 'continuous'`**, tier/role NULL | `both` 12 · `more` 1 | **13** |

All other combinations are empty. **Nothing in the table is undifferentiated** — the continuous cells
are band-keyed rather than tier-keyed, by design.
Invariants hold: every `cap` positive; **no `|penalty|` or `|lift|` exceeds its own cap**; every
`penalty` negative, every `lift` positive. ⚠ **22 of the 23 directional cells are `more`** — the lone
`less` is `blowout__points__LOST_GT50__all__less`, the only combination with both. Whether the scorer
mirrors onto LESS legs is **NOT RECORDED**.

**`[LIVE-AUDIT]` 2026-09-21 (T7 pass 9) — the cap column, since a document elsewhere was read as
saying the system runs a single global cap. It does not.** All **35** cells carry a non-null `cap`,
spread over **15 factors** and **10 distinct values, 0.05 → 0.40** (0.12 on 7 cells, 0.25 on 6).
Cells are keyed on **six** dimensions — `(factor_key, canonical_prop_key, tier_label, role_tier_key,
direction, **variation_band**)` — and **22 of 35 carry a `tier_label` or a `role_tier_key`**, while
**the other 13 carry `variation_band = 'continuous'`** (`altitude` 0.06 · `opp_forced_to_rate` 0.20 ·
`teammate_shooting_quality` 0.20 · `foul_drawing` 0.25 · `opp_rim_attempt_rate` 0.25 ·
`opp_turnover_rate` 0.25 · `usage_share` 0.30, plus cells of `game_pace`, `potential_assist_rate`,
`opp_miss_rate`). ⚠ *This paragraph originally read "13 carry neither — one **undifferentiated**
value for the whole factor", which contradicted the corrected text eleven lines above. **Nothing in
the table is undifferentiated** — see the two-population table and §T7.44a/§T7.50a. Fixed
2026-09-21, T7 pass 32.* Largest factor: `blowout_risk`, **9 cells over 3 props and 4 tiers, caps 0.08–0.40**.
🔴 **Nothing has been measured.** `[LIVE-AUDIT]` over the **full 35 rows** (T7 pass 20):
**`last_validated_at` set on 0 · `last_empirical_validation_json` set on 0 · `automation_status` =
`semi_automatic` on all 35 (one distinct value, so it distinguishes nothing) · and
`real_sample_size_observed` = **0 on every row**, against a `min_real_sample_threshold` of 75.** The
design's own gate — *"cells under sample are fully shrunk to prior"* — is therefore **unmet by every
cell**. **By its own bookkeeping the table is entirely seed values with no observed sample
anywhere**, which confirms from the data what this section says in words: *"these are the values the
backtest will move."* Rows created **2026-09-09
01:53–02:03**. See `NBA_MASTER_SUMMARY.md` §T7.38b and the owner's anti-capping directive in
`NBA_OPEN_ITEMS.md`.

### `nba_config.variation_bands` — **25 rows**
`canonical_prop_key · band_key · band_order · line_min · line_max · percentile_lo · percentile_hi ·
edge_method · notes · updated_at`

> 🔴🔴 **READ FIRST — `[LIVE-AUDIT]` 2026-09-21 (T9 pass 6): THIS TABLE IS NOT THE LIVE VARIATION
> DIMENSION.** The bands the system actually uses are **`VBANDS_ALL`, a Python dict at
> `nba/backtest/classification_ladder_v12.py` line 114**, read at line 519 (`VBANDS =
> VBANDS_ALL[prop]`), covering **15 props**: `assists · blocks · dreb · fg3a · fga · fgm · fta ·
> ftm · oreb · personal_fouls · points · rebounds · steals · threes_made · turnovers`. **This table
> has 6 and is read by nothing.** *Third instance of the §2-banner pattern, in the same file as the
> other two (`ROLE_TIERS` line 129, the decay `PROPS` dict).* ⚠ **And the documented expansion
> checklist explains it**: `NBA_COMPASS.md` line 130 says a new prop requires extending *"PROPS
> config, `VBANDS_ALL`, and the factor-feature map"* — **three code structures; neither this table
> nor `prop_taxonomy` is on the list.**

🔑 **`[LIVE-AUDIT]` 2026-09-21 (T8 pass 7) — WHICH PROPS EACH FAMILY SERVES in the TABLE, and how
little the table covers.** The families divide **by prop**: **line magnitude** (`LOW · MID · HIGH · ELITE`) serves
**five** — `assists`, `rebounds`, `threes_made`, `pra`, `fantasy_score` — and the **role** family
(`FRINGE · ROLE · STARTER · STAR · SUPERSTAR`) serves **`points` alone**, which is why it has exactly
five rows. ⚠ **Only 6 of the 28 taxonomy props have any band**, and the split follows
`prop_taxonomy.build_tier` exactly — **Tier A 6 of 13; Tier B 0 of 15.** *The variation dimension is
one of the owner's five, and §T8.14b calls the band-level residual "the empirical vindication of the
variation dimension" — **that rests on 6 props of 28**. Whether the other 22 inherit a default, are
banded later, or run unbanded is **NOT RECORDED**.* ✅ **Referential integrity is clean in every
direction**: 0 orphans from `factor_relevance` (460), `factor_profile_cells` (35) and
`variation_bands` (25) to `nba_ref.prop_taxonomy`, and every taxonomy prop has a relevance row.

**`[LIVE-AUDIT]` 2026-09-21 (T7 pass 16) — 9 distinct `band_key` values in two families**: a
line-magnitude family `LOW · MID · HIGH · ELITE` (`band_order` 1–4, 5 props each = 20 rows) and a
role family `FRINGE · ROLE · STARTER · STAR · SUPERSTAR` (`band_order` 1–5, 1 each = 5 rows).

⚠ **None of the nine is `continuous`, and that is by design.** 13 `factor_profile_cells` rows carry
`variation_band = 'continuous'` — **not a dangling key but the documented factor FORM**:
`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 242 declares every factor's *"**form (band /
continuous / gate)**"*, and **continuous factors are not banded, so no band row exists to point at.**
`[LIVE-AUDIT]` joining the cells to `factor_registry.form`: **34 of 35 cells are keyed exactly as
their factor's form requires** — `continuous` 14 cells (13 band-keyed), `quantile_bands` 5 and
`tiered_bands` 16 (all tier-keyed). 🔑 **The single exception** is
`shotdiet__rebounds__3PA_HEAVY__all__more`: factor `opp_shot_diet` is declared `form='continuous'`,
yet the cell is tier-keyed (`OPP_3PA_HEAVY`) with a **flat penalty −0.06 and no formula**. *Whether
that is deliberate is **NOT RECORDED**.* ✅ Every `canonical_prop_key` here resolves against
`factor_relevance`.

**`[LIVE-AUDIT]` the `form` vocabulary itself** — `factor_registry.form` over 67 factors:
**`continuous` 28 · `tiered_bands` 25 · `binary_gate` 13 · `quantile_bands` 1.** The design's
*"band / continuous / gate"* is a simplification: **the `band` FORM is split in two
(`tiered_bands`, `quantile_bands`) — this is `factor_registry.form`, not the two
`variation_bands.band_key` families documented above — and `gate` is
`binary_gate`.**

### `nba_config.role_tiers` — **6 rows**
**Exactly matching `ROLE_TIERS` in `classification_ladder_v12.py`** — IRON_MAN 36+ ·
HIGH_USAGE_STARTER 32–36 · STARTER 27–32 · ROTATION 21–27 · BENCH 15–21 · FRINGE 0–15.

✅ **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 12): the six rows partition minutes 0 → 48 with no gap and no
overlap**, `sort_order` 1–6. ⚠ Two precisions: **IRON_MAN is stored as 36–48, bounded**, not `36+`;
and **every boundary value belongs to two rows at once** (36 is HIGH_USAGE_STARTER's max *and*
IRON_MAN's min, and so on), so **the table does not express whether the comparison is inclusive at
the min or the max**. Since **nothing reads this table**, that convention lives in the hardcoded
`ROLE_TIERS` list; **whether the two agree at the edges is NOT RECORDED** — the T1 pass 36 check
compared names and ranges, not operators.

⚠ **CORRECTED 2026-09-20 (T1 pass 36). This entry read: *"Config and code agree, so the no-hardcoding
rule holds here."*** **The values do agree — VERIFIED.** **The conclusion does not follow.**
`ROLE_TIERS` is a **hardcoded Python list** at `classification_ladder_v12.py` **line 129**, and
**no code reads `nba_config.role_tiers`** — VERIFIED, the string appears nowhere in the codebase.
**Agreement maintained by hand is not the no-hardcoding rule holding**: an SQL edit to this table
changes nothing. See the banner at the top of §2.

### `nba_config.calibration_log` — 8 rows
`log_id · cell_id · proposed_field · old_value · proposed_value · evidence_json · sample_size ·
bootstrap_shrinkage · status · decided_by · created_at · decided_at`

🔴 **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 16) — it joins `factor_profile_cells` at 0%, and most of it
isn't cells.** **8 of 8 `cell_id` values are orphaned.** The two tables use **incompatible id
conventions**: here `blowout_risk::points::P_BLOWOUT_GT50` (`::`, three segments), there
`blowout__points__WON_GT50__FRINGE__more` (`__`, five). **The same failure class as the officials
join** — a name-derived key against a differently-derived key, total failure, no error raised.
**And 6 of the 8 rows are not factor cells at all** but decision records
(`classification::structure`, `classification::guards`, `classification::shift_mode::bug`, …).
⚠ **`old_value` and `proposed_value` are NULL on all eight, every row `status = 'applied'`** — an
audit trail that records that something changed and nothing about what. *Whether anything writes here
today is **NOT RECORDED**; per the §2 banner nothing reads it.*

### `nba_config.stat_decay_config` — 13 rows *(T7)*
⚠ **Described here as "the single most important config table in the system" — and NOTHING READS IT.**
*VERIFIED 2026-09-20 (T1 pass 36): `stat_decay_config` and `ewma_alpha` appear nowhere in the
codebase. The live decay parameters are the `PROPS` dict hardcoded in
`nba/backtest/classification_ladder_v12.py`.*

**A whole-universe diff of this table against that dict found SEVEN of ten mappable stats disagreeing
on at least one parameter, THREE on the decay rate itself** — `blk_rate` 0.08 vs **0.10**,
`tov_rate` 0.10 vs **0.12**, `ft_pct` 0.04 vs **0.03** — plus four `k_stab` disagreements
(`stl_rate` 60 vs **125**, `tov_rate` 40 vs **95**, `fta_rate` 30 vs **40**, `fg3a_rate` 25 vs
**20**). **All 13 rows carry `active = 1`.** Full table and its caveats: `NBA_OPEN_ITEMS.md` →
*FROM T1 PASS 36*.

**Per-stat EWMA memory. The single most important config table in the system** *(as designed — see
the warning above for what it actually governs today).*
`stat_key` · `display_name` · **`ewma_alpha`** · **`min_lookback_games`** ·
**`shrinkage_stabilization_games`** · **`memory_class`** · **`rationale`** · `active` · `updated_at`

| `stat_key` | α | lookback | stabilise | class |
|---|---|---|---|---|
| **minutes** | **0.20** | 8 | 10 | short |
| usg_pct | 0.15 | 10 | 15 | short |
| ast_rate | 0.15 | 10 | 20 | short |
| pts_rate | 0.12 | 15 | 25 | medium-short |
| fg3a_rate | 0.12 | 15 | 25 | medium-short |
| stl_rate | 0.10 | 15 | 60 | medium-short |
| fta_rate | 0.10 | 15 | 30 | medium |
| tov_rate | 0.10 | 15 | 40 | medium |
| reb_rate | 0.08 | 20 | 40 | medium |
| blk_rate | 0.08 | 20 | 50 | medium |
| fg_pct | 0.06 | 25 | 120 | medium-long |
| ft_pct | 0.04 | 30 | 150 | long |
| **fg3_pct** | **0.03** | 40 | **300** | long |

**Alpha spread 6.7× · stabilisation spread 30×. A single alpha would be wrong for 11 of 13.**
Rated *"**Highest** impact, **zero data cost**"* in the T7 research — *"3pt% needs a long memory, assist
rate needs a short one."*

**Every row carries its `rationale`**, e.g.:
- **minutes** — *"the single biggest error source in props… set by coaching decisions that change
  abruptly; shortest memory of all"*
- **usg_pct** — *"USG% from 30 games ago as a 4th option is irrelevant if now a 2nd option"*
- **fg3_pct** — *"takes hundreds of attempts to stabilise; a 10-game hot/cold streak is mostly noise"*
- **fg3a_rate vs fg3_pct** — *"attempt VOLUME (unlike make %) is role/scheme-driven"* — **the same stat
  split into two memory classes by component.**

**This is the owner's no-hardcoding rule applied to model hyperparameters**, not just timeouts —
SQL-editable, with the justification stored beside each value.

### Additional measure-type game logs *(T7)*
Built after the data-universe research — **9 cheap bulk calls, 3 seasons:**
- **`nba_stats.player_game_log_usage`** — share-of-team-stats per game. *"The direct input for
  role/opportunity modelling"*, and the stated **90% proxy for the missing 2023-24/2024-25 starter
  status**.
- **`nba_stats.player_game_log_scoring`** — shot composition (%paint / mid / 3pt / FT, **%assisted**)
  → *"scoring stability archetype"*.
- **`nba_team.team_game_log_four_factors`** — true efficiency (eFG%, FTA rate).
- **`nba_team.team_game_log_scoring`**.

**Skipped deliberately**: Opponent / Defense / Misc measure types — *"single-game descriptive, not
baseline talent."*

### `nba_config.classification_config` — **66 rows**

`config_key` · `config_json` JSONB · `notes` · `updated_at`. The system's decision record — every major
verdict is written here so it is queryable rather than trapped in a log. Keys include
`prizepicks_goblin_demon_tier_spec`, `board_payout_conversion_rules`, `rejected_on_data`,
`blowout_model_market_spread_2026_09_13`, `availability_model_n1v3_2026_09_15`,
`final_engine_complete_2026_09_18`, `storage_diet_plan_2026_09_17`,
`deferred_prizepicks_multiplier_capture`.

---

## 3. `nba_control` — run bookkeeping *(T1)*

> ⚠⚠ **BOTH TABLES ARE EMPTY AND NOTHING WRITES TO THEM** *(recorded 2026-09-20, T1 pass 68, **VERIFIED**)*. **`job_runs`: 0 rows. `worker_run_log`: 0 rows.** The string `nba_control` appears in **no non-markdown file in the repo**. Meanwhile **21 NBA workers are registered and enabled in `nba_config.worker_definitions` and their output tables are populated** — so the workers run, and **no run history is recorded anywhere.** The schema is a structure created in T1 for a purpose that was never wired. **Not fixed, per the standing instruction.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 68*.

### `nba_control.worker_run_log`
`log_id` BIGSERIAL **PK** · `request_id` · `run_id` · `worker_name` · `job_key` · `level` ·
`event_key` · `message` · `data_json` · `created_at`

### `nba_control.job_runs`
`run_id` TEXT **PK** · `job_key` · `worker_name` · `status` · `input_json` · `output_json` ·
`error_message` · `started_at` · `finished_at` · `created_at`

---

## 4. `nba_score` — the engine's output layer

### `nba_score.baseline_ladder` *(T9 — the production artifact)*
The daily output of the certified recipe, loaded from committed JSON by
`alphadog-v2-nba-baseline-ladder`.

**PK: `(asof, player_id, game_id, prop, period, ot_rule, line)`** — index on
`(asof, prop, period, player_id)`.

| Column | Notes |
|---|---|
| `asof` | the slate date |
| `period` | **DEFAULT `'FULL'`** — FULL / 1Q / 1H / 2H / 4Q |
| **`ot_rule`** | **DEFAULT `'include'`** — **in the PK**, so `include` and `exclude` variants coexist. This is what lets Sleeper quarter props (OT excluded) and PP/UD props (OT included) be priced separately |
| `line`, `anchor`, `ladder_offset` | the rung |
| `p_more`, `p_less` | the calibrated probabilities |
| **`p_raw`** | **pre-calibration value retained** — the effect of Platt and the cells is auditable per row |
| `role_tier`, `var_band` | the tier keys |
| **`used_emp`** | **whether the empirical table or the parametric fallback produced this row** — the flag that verifies the hierarchical fallback's coverage in production. 🔴 **BUT SEE §T9.37a (2026-09-21): live it is `true` on 205,678 of 206,237 rows — 99.73%.** Of the **559** false rows, **541 are `double_double`**, which has no ladder at all; **the genuine fall-throughs are 18 rows of `threes_made`.** It also reads `true` on **all 30,989 rungs beyond their prop's measured `LADDER_DEPTH`**. ⚠ **A flag with one value everywhere cannot verify a coverage claim**, and it is a **3.3× confidence multiplier downstream** (`f_prov`, §T9.37b) |
| `recipe_version` | rows carry the recipe that made them |

### `nba_score.baseline_ladder_runs` *(T9)*
One row per build. `asof` PK · `slate_games` · `players` · `rows` · `props[]` ·
**`history_seasons[]`** · `current_season` · **`factor_fits` JSONB** ·
**`role_minutes_multiplier` JSONB** · `source_file` · `loaded_at`.

~~**`factor_fits` and `role_minutes_multiplier` store the values FITTED IN THAT RUN**~~ 🔴🔴
**CORRECTED 2026-09-22 (T20 pass 109, `§T20.114`) — THEY STORE **ONE INVOCATION'S** FITS, CHOSEN BY
FILENAME SORT ORDER.** `build_baseline_ladder.py` **runs once per prop pair** *(eight production
pairs + three `BT_SAVE_COMPONENTS` builds + combos + periods)*, each writing its own `meta`; the
merge step at **`nba-p2-overnight-heavy.yml:216`** is `meta = meta or d["meta"]` over a `sorted()`
glob — **first file wins** — and recomputes **only `rows`, `props` and `players`. `factor_fits`,
`role_minutes_multiplier`, `history_seasons`, `current_season` and `slate_games` are whichever
invocation sorted first.** 🔴 **Live, all three rows carry exactly `assists · season_phase · steals`
against `18`–`22` props — `9.1%` — and no production pair fits `assists` with `steals`: the winner is
the `BT_SAVE_COMPONENTS=1` DIAGNOSTIC build.** ⚠ **So the sentence that used to follow this one —
*"you can see what each day's run derived, and compare runs"* — is the exact use the defect defeats;
the column is the same two props on every row.** ✅ **`history_seasons[]` is subject to the same
first-file-wins rule and is therefore ALSO one invocation's** — *it is quoted elsewhere as "the
parity rule's evidence", which now needs that qualification.* ▶ **`T20-20`; nothing reads
`factor_fits` back, so this corrupts an AUDIT RECORD, not a score. Documented, not fixed (rule 1).**

### Production contract *(from `nba_config.classification_config.production_baseline_ladder`)*
- **Builder**: a **patcher over `classification_ladder_v12.py`** — *"single source of truth; anchors
  assert"*
- **Slate**: schedule games on ASOF (`status != final`; replay allows final) × **each team's roster
  from its last 3 games** — not from `nba_ref.players`, which sidesteps the new-player lag
- **`asof_lag: 0 days`** — daily-exact walk-forward; **Platt fit on the season's prior months**
- **Validated**: replay 2026-03-15 — 7 games, 194 roster rows, **173 projected players, 4,498 rows**;
  **43 roster players were DNP — "enrichment removes"**, i.e. the baseline is availability-agnostic by
  construction

### `nba_score.baseline_history` — **19.34M rows, ~12 GB**
The baseline hit probability for every prop × rung × direction × game-day, both seasons.
**UNIQUE KEY: `(game_date, player_id, game_id, prop, period, line)`** — note `game_id` and `period` in
the middle, which is why a 4-column lookup cannot use that index.
Columns include `season`, `anchor`, `ladder_offset`, `p_more`, `p_less`, `proj_min`, `rate36`,
`used_emp`, `role_tier`.
**Indexes:** `baseline_history_uidx` (2,972 MB, 53.3M scans) · `baseline_history_lookup`
(game_date, player_id, prop — 415 MB, 7.9M scans) · `baseline_history_lookup_idx`
(game_date, player_id, prop, line) INCLUDE (proj_min, rate36, used_emp, role_tier) — 1,334 MB,
**22.3M scans**, built 2026-09-19.

### `nba_score.final_hp` — ⚠ **19,215,200 rows LIVE (2026-09-20). Previously documented: 38.7M.**
The final number per leg. `season, game_date, game_id, player_id, prop, line, side, ladder_offset,
anchor, baseline_hp, final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality,
c_market, prop_tier, band, phase, n_uncertain, built_at`.
**UNIQUE: `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.
**Deliberately denormalised** — see OPEN_ITEMS; the duplicate columns buy backtest speed on 2 GB RAM.

#### ⚠⚠ LIVE ROW COUNT, MEASURED 2026-09-20 (T1 pass 33) — **the 2025-26 season is gone but one day**
**VERIFIED by live SQL:**

| season | distinct `game_date` | props | rows |
|---|---|---|---|
| 2024-25 | **162** | 30 | **19,075,070** |
| **2025-26** | **1** — `2026-01-15` only | 30 | **140,130** |
| **total** | 163 | 30 | **19,215,200** |

**All 30 props in 2025-26 hold exactly one date.** The previously documented **38.7M** figure is
consistent with a complete table: `19.07M (2024-25) + ~19.6M (2025-26) ≈ 38.7M`. **~19.5M rows of the
2025-26 partition are missing.**

**Cause — VERIFIED by grep of `nba/build_final_hp.py`**: the engine's `FE_DATE` parameter **scopes the
`SELECT` from `baseline_history` but not the `DELETE` from `final_hp`**, which is
`DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s` with **no `game_date` predicate**. A
slate-scoped write therefore replaces the whole season × prop partition with one slate.
**Blueprint §7g bug class 1.** Full entry, including what is and is not established about how it was
triggered: `NBA_OPEN_ITEMS.md`, top of file.

**✅ Recoverable.** Every column is derived from `nba_score.baseline_history`, which is **intact —
VERIFIED: 2025-26 holds 163 distinct dates × 30 props.** A full-history re-run rebuilds it.
**The ~9.4 GB / 5,024 MB index figures above predate the loss and are left as the last known
full-table measurements** — they are what the table should return to.

**⚠ Anything computed against `final_hp` for 2025-26 since the loss is computed on one day of data.**
Consumers to re-check before trusting: the backtests, `nba_score.board_scored` joins, and any
confidence or calibration work reading the 2025-26 partition.

### `nba_score.ladder_calibration_asof`
`season, as_of_date, prop, phase, band, side, log_odds_shift, n, source, built_at`.

**⚠ `side` here is the subgroup axis blueprint §7f names.** *(Recorded 2026-09-20, T1 pass 29.)*
MLB's documented calibration failure was a fit *"computed without distinguishing between two sides of
a market (over/under)… dominated by one side's pattern, silently misapplied to the other,"* which an
aggregate metric could not catch. **This table already carries `side` as a real, populated key
column**, along with `phase` and `band` — **so a per-subgroup validation of any refit is available
here at zero data cost**, and a refit validated only on the pooled average would be discarding a
dimension the schema already stores. **Whether the refit validates per `side` is NOT RECORDED** —
see `NBA_BASELINE_CALIBRATION.md` §5.6 and `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*.
**Contrast with the baseline Platt fit**, keyed `prop × var_band × role_tier × offset × month`, where
**`side` is deliberately absent and provably harmless** (`p_less = 1 − p_more` by construction,
VERIFIED by code grep 2026-09-20). **The two calibrations have different exposure to the same
lesson — this table's `side` is a real population split; the Platt fit's is not.**
`source` = `own` (current-season evidence) or `prior_season` (inherited same-phase cell).
**Replaces the pasted `nba_score.ladder_calibration`, which was a parity violation and has been dropped.**

### `nba_score.confidence_model`
`factor, deduction, separation, base, floor, built_at`. 10 factors. Base 99, floor 55.

### `nba_score.conformal_confidence`
`level, prop, band, side, phase, n, s_norm, lo_scale, hi_scale`. 253 full / 66 mid / 22 coarse groups
+ global. *Superseded by the deduction model but retained.*

### `nba_score.scenario_realised` — 1,942 rows
`season, game_date, game_id, branch_key, branch_prob, n_uncertain, n_branches, realised,
was_most_likely, rank_by_prob, phase`. **Only the realised branch is stored.**

### `nba_score.confidence_verification` — ⚠ **four writers, one of which deletes the whole table**
`check_type, slice, tier, n, stated, actual, gap, run_at`.
*Recorded 2026-09-20 (T1 pass 34). **VERIFIED by live query.***

**Live contents — three generations coexisting, which is itself the evidence:**

| `check_type` group | written by | `run_at` (**UTC** — `timestamptz`; zone stated 2026-09-21, §T9.46a, and all three re-verified live to the second: **18:16:54** · **23:31:03** · **03:30:25**) |
|---|---|---|
| `overall`, `by_band_tier`, `component`, `phase`, `season` | `verify_confidence.py` | **2026-09-17 18:16** |
| `mondrian_quintile` | `build_mondrian_confidence.py` | **2026-09-17 23:31** |
| `conf_band_v3`, `group_prop`, `group_side`, `group_phase`, `group_season`, `group_kind`, `group_role_tier`, `group_rung_dist` | `build_confidence_v3.py` *(P2, nightly)* | **2026-09-20 03:30** |

**`build_confidence_v3.py`, `build_confidence_v2.py` and `build_mondrian_confidence.py` each delete
only their own partition** (`WHERE tier='v3'`, `WHERE tier IN ('v2','high_vs_low')`,
`WHERE check_type='mondrian_quintile'`). **`verify_confidence.py` runs
`DELETE FROM nba_score.confidence_verification` with no predicate.**

**So the v3 and mondrian rows survive only because the unscoped writer happens to have run first.**
The next `verify_confidence.py` run — wired in `nba-absence-panel.yml`, **not** in P2 — deletes both.
**No `v2` / `high_vs_low` rows are present at all.** Full entry in `NBA_OPEN_ITEMS.md`.

### `nba_score.ladder_calibration` — **DROPPED, and VERIFIED absent** *(but live code recreates it)*
**VERIFIED 2026-09-20**: absent from `information_schema.tables` for `nba_score`. It was the pasted
correction table, **dropped as a parity violation** and replaced by `ladder_calibration_asof`.
⚠ **`nba/calibrate_all_props.py` still runs `CREATE TABLE IF NOT EXISTS nba_score.ladder_calibration`
and repopulates it**, wired behind a manual input in `nba-absence-panel.yml`. **A `DROP` does not
survive a `CREATE … IF NOT EXISTS`.** **VERIFIED nothing reads it** — no `SELECT` against it exists in
any of the 190 files. Full entry in `NBA_OPEN_ITEMS.md`.

### `nba_score.factor_gate_results`
`season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta, run_at`. Every factor verdict —
**results go in the database, not the CI log.**

### `nba_score.board_scored` *(live session)*
`game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id, baseline_hp,
cal_shift, final_hp, confidence, score, edge, interpolated, built_at`. The board-scoped output.

### Others
### `nba_score.blowout_model` — 35 rows *(T16 build, T4 design warning)*
❌ ~~Two `kind`s:~~ 🔴 **THREE `kind`s — corrected 2026-09-21, §T11.28a.** *The 35 is right and the
"two" was not:* **`minutes_by_margin` 7 + `p_blowout` 14 + `sliding_scale` 14 = 35** *(census,
`GROUP BY kind, side`)*. **`sliding_scale` is documented below; it was missing from this section
while §T11.19a's column-collision entry already named all three — two of the twelve disagreeing
with each other.**

**`minutes_by_margin`** — 7 rows, one per margin band. **`v1` is a RATIO relative to the player's own
baseline; `v2` is absolute minutes lost.**
| `side` | `lo`..`hi` | `n` | **`v1` ratio** | `v2` min lost |
|---|---|---|---|---|
| competitive | −12..12 | 12,966 | **1.0333** | −1.0140 |
| won by 12–20 | 12..20 | 3,001 | 0.9760 | 0.790 |
| won by 20–25 | 20..25 | 1,120 | 0.9194 | 2.586 |
| **won by 25+** | 25..99 | 1,597 | **0.8748** | 3.992 |
| lost by 12–20 | −20..−12 | 2,672 | 0.9721 | 0.903 |
| lost by 20–25 | −25..−20 | 929 | 0.9364 | 2.056 |
| lost by 25+ | −99..−25 | 1,306 | 0.9124 | 2.856 |

**⚠ READ `v1` AS A DEVIATION, NOT A PENALTY.** Competitive sits **above** 1.0 and every blowout band
below it, because the ratios are measured against the **same blended historical average the baseline
uses**. Applying them **re-centres** the projection onto the expected game script.
**This is what prevents the double-counting the T4 methodology warned about** — the baseline's minutes
already include blowout games, so an absolute penalty would subtract twice.

**`p_blowout`** — **14 rows**, per spread band, `side` = **`favourite`/`underdog`** *(7 each)*, with
three probabilities in `v1`/`v2`/`v3` (blow-open, blown-out, and the residual). Example, spread 0–2
favourite: 0.1634 / 0.0842 / 0.0792.

🔴 **`sliding_scale`** — **14 rows**, per spread band, and 🔴🔴 **its `side` is `fav`/`dog`** *(7
each)* — ***the same two concepts as `p_blowout`'s, spelled differently, in the same column of the
same table.*** *(`[LIVE-AUDIT]` 2026-09-21, §T11.28a. **`fav`/`dog` as values: 0 of thirty**,
positive-controlled.)*

⚠⚠ **CONSUMER HAZARD — a `GROUP BY side` on this table returns FOUR groups for TWO concepts**, and a
filter written as `side = 'favourite'` silently drops the `sliding_scale` half.
🔴 **NARROWED 2026-09-21 by §T11.45b — the hazard is LATENT, not live.** ***`sliding_scale` appears in
exactly ONE file in the repo — `nba/build_blowout_model.py` lines 173–174 — and that is the WRITER.
Nothing reads it.*** **Against `p_blowout`, read by FIVE**: `classification_ladder_v1` · `_v12` ·
`periods_ladder_v1` · `minutes_model_v1` · `validate_blowout_upgrade`. ***So the hazard would bite
the FIRST consumer rather than an existing one*** — **and the standing finding is that the table
stores a 14-row partition nothing reads, in a vocabulary inconsistent with the partition five files
do**, which is this document's own *"a documented design that no running code consults"* class
appearing in `nba_score` rather than `nba_config`. **The vocabulary is
per-`kind`, and the three `kind`s use three unrelated vocabularies in one column:**

| `kind` | rows | `side` vocabulary |
|---|---|---|
| `minutes_by_margin` | **7** | **margin buckets** — `competitive` · `won by 12-20` · `won by 20-25` · `won by 25+` · `lost by 12-20` · `lost by 20-25` · `lost by 25+` |
| `p_blowout` | **14** | **`favourite` · `underdog`** |
| 🔴 `sliding_scale` | **14** | 🔴 **`fav` · `dog`** |

🔑 ***This is rule 24 at its sharpest***: `side` names a **prop direction** in ten tables, a **team
role** in two `kind`s of this one, and a **margin bucket** in a third — **and the team role is spelled
two ways inside the single table.** *(The per-`kind` split is what §T11.19a's collision finding looks
like one level in: the collision is not only between tables.)* ⚠ **NOT RECORDED** whether the two
spellings are read by one consumer or two.
Measured on the **real market spread** (307,604 rows available, 2,454 games, ~~100% coverage~~
🔴 **99.76% — corrected 2026-09-21, §T11.12b**) after the
derived r=0.46 proxy was replaced.
`nba_score.confidence_verification` · `nba_score.availability_delta` ·
`nba_score.real_slip_leg_observations` (139 legs, `decomposition_method='equal_scale_v1'`)
> 🔴 **`[LIVE-AUDIT]` 2026-09-21 (§T10.22b): `nba_score.real_slip_leg_observations` is NOT in the
> database** — and it is **not in the DROPPED list below** either. **Why it is absent is NOT
> RECORDED** (rule 6): it may have been dropped after 2026-09-19 by a session this sweep has not
> reached, or never created. 🔑 **Added §T10.24b — and this document's own MLB inventory offers the
> likeliest reading**: it lists **`score.real_slip_leg_observations` among the MLB D1 objects**
> *("All 12 MLB D1 bindings report FALSE")*, ***so the 139 legs are plausibly MLB's and the
> `nba_score.` prefix is the error.*** **Not confirmed — checking it means querying MLB's D1, and
> MLB is out of scope.** ⚠ **`NBA_OPEN_ITEMS.md` and `NBA_MULTIPLIERS.md` both rest a finding on it** — *"there is no NBA slip
> history; `nba_score.real_slip_leg_observations` holds 139 legs, not dated slips"* — **and that
> finding's direction is unaffected: the table is not there at all.**

**DROPPED 2026-09-19** (superseded, findings preserved in COMPASS): `nba_score.absence_panel`,
`absence_panel_v2`, `absence_panel_v3`, `redistribution_panel`, `ladder_calibration`.

---

## 5. `nba_market` — boards, market and grading

### `nba_market.board_snapshots` — ~6.6 GB
Every board leg, all apps, all snapshots, two seasons + live.
`game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line,
price, multiplier, home_team, away_team, commence_time, fetched_at`
**`snapshot_label`**: `window` (the decision pull — **1:15 PM PT**, corrected from 2:45), `close`,
`morning`, `routine`. Set by `ARCHIVE_LABEL`, which **defaults to `routine`**.
**It HAS a `multiplier` column.** Uses a compact md5→uuid unique index (1,001 MB) instead of the
original 7-column PK (5,577 MB).

### `nba_market.board_outcomes` — 6.9M legs, 327 dates
The grader's output: every offered line graded against the box score.
`leg_result` ∈ `over_win`, `under_win`, push, DNP, `unmatched_player`, `unmatched_not_in_season`.
**`board_outcomes_leg_uidx` shows 0 scans but is UNIQUE — it enforces no-duplicate-legs. Do not drop.**

### `nba_market.board_tiers` — 2.2M legs
`game_date, snapshot_label, player, base_market, side, line, kind, anchor_line, anchor_type, tier, nm`
`anchor_type` ∈ `explicit` | `switch_point` (**the invisible anchor**, validated on 42,600 ladders).
`kind` ∈ standard/goblin/demon — **derived from PRICE, so Over-only. Superseded by the four-way rule.**

### `nba_market.board_tiers_ud` — ⚠ **NO SUCH TABLE EXISTS**
> 🔴 **`[LIVE-AUDIT]` 2026-09-21 (§T10.22b): `nba_market.board_tiers_ud` is not in the database.**
> **What is live**: `nba_market.board_tiers` and `nba_market.board_tiers_v2`, **both 2,199,354 rows.**
> ⚠ **Whether `board_tiers_v2` is the object this section describes is NOT RECORDED** — rule 6, no
> transcript swept so far supplies the mapping. **The description below is kept as written; only the
> name is in doubt.**

The **Underdog** version — **already implements the four-way rule** (position vs anchor + side), and
uses a smarter anchor for books that price every rung: *the FAIR rung, implied probability closest to 50%*.

### `nba_market.rung_market` — 1.06M rungs, 206 MB
De-vigged book probability **at the DFS rungs only**, built in monthly blocks.
`game_date, snapshot_label, player, market, line, p_over_book, p_over_sd, books, built_at`
**Note: keys on `player` (name) and `market`, with the count in `books`** — not player_id/prop/n_books.

### Others
`nba_market.game_lines_snapshots` (110 MB) · `nba_market.game_lines_closing` ·
`nba_market.event_game_map`

---

## 6. `nba_stats` / other
`nba_stats.player_game_log` (41 MB) and the season/quarter files. Most bulk historical data lives as
committed JSON in `nba/data/`, not in Postgres — see the ARCHITECTURE document.

### `nba_stats.player_game_log` — the game-log spine *(T4)*
`player_id`, `nba_player_id`, `game_id`, `season`, `team_id`, `game_date`, `matchup`, `wl`, `min`,
`fgm/fga/fg_pct`, `fg3m/fg3a/fg3_pct`, `ftm/fta/ft_pct`, `oreb/dreb/reb`, `ast`, `tov`, `stl`, `blk`,
**`blka`** (blocked attempts), `pf`, **`pfd`** (fouls drawn), `pts`, `plus_minus`,
**`nba_fantasy_pts`**, **`dd2`**, **`td3`**, + `source_key` / `data_quality` / `updated_at`.

**26,651 rows for 2025-26.** Three columns here become props directly: `nba_fantasy_pts` →
`fantasy_score`, `dd2` → `double_double`, and `blka`/`pfd` support the rare props.
**The prop menu was already supported by this schema before the prop layer existed.**

### `nba_team.team_game_log` *(T4)*
Same shape minus the player-only fields. **2,460 rows for 2025-26 — exactly 30 teams × 82 games**,
which is a complete-season assertion, not just a count.

### Career totals *(T4)*
**3,644 season rows across 582 players.** Table: **`nba_stats.player_career_season_totals`**
`player_id`, `nba_player_id`, **`season_id`**, `team_id`, **`player_age`**, `gp`, **`gs`** (games
started), `min`, plus the full shooting/rebounding/assist line.
- **`player_age`** is what makes aging curves computable
- **`gs` vs `gp`** is a starter-rate signal across a career
- **`team_id`** is where the `TEAM_ID = 0` combined row appears

**⚠ TRADED PLAYERS**: they get **separate per-team rows PLUS a combined total row at `TEAM_ID = 0`**,
and the two sum correctly. **A naive `SUM()` double-counts them.** Verified empirically after search
could not settle it.
**⚠ SURVIVORSHIP BIAS**: this data exists only for players still in the league. Any aging curve from it
describes **successful** NBA players; those who washed out after 2–3 seasons are invisible. Also era
effects — a 2004 line is not comparable to 2024 without pace/3PT normalisation.

### Splits *(T4 research, T5 build)*
> 🔴 **`nba_stats.player_career_season_totals` stores its own subtotals.** *(Added 2026-09-21, T4 re-sweep pass 4.)* `team_id = 'nba_0'` is **not a team** — it is the season total for a traded player, stored **beside** the per-team rows it sums. **`[LIVE-AUDIT]` VERIFIED**: 3,644 rows / **3,064 distinct player-seasons**; **282 have >1 row, all 282 carry an `nba_0` row, and in all 282 that row's `GP` equals the sum of the parts (0 mismatches)**. **Any aggregate over this table double-counts those 282 player-seasons** unless it filters `team_id <> 'nba_0'` (parts) or `= 'nba_0'` (totals, where present). **No `is_total` flag exists** — the discriminator is the magic value. → `NBA_OPEN_ITEMS.md`.
> ⚠ **And one player is absent entirely**: `nba_1628467` (Maxi Kleber) has no rows. The scrape reported "582 players succeeded" because that figure is `len(players) - len(errors)`, i.e. attempted-minus-errored, not players with data. → `NBA_OPEN_ITEMS.md`.

**⚠ `PRIMARY KEY (player_id, split_type, group_value)` — `season` is a column but NOT in the key.**
**Live 2026-09-20: `nba_stats.player_splits` = 9,948 rows, 577 players, 2025-26 ONLY.** A second
season's load would overwrite the first. `nba_team.team_splits` = 581 rows, 30/30, same PK shape.

**What is actually present — 5 types, not 6:**
| `split_type` | rows | groups |
|---|---|---|
| `days_rest` | 3,311 | 7 |
| `month` | 3,236 | 7 |
| `location` | 1,217 | 3 |
| `wins_losses` | 1,135 | 2 |
| `pre_post_allstar` | 1,049 | 2 |

**`StartingPosition` is absent** — superseded by `player_game_starter_status` at per-game granularity.
**5 players missing** (577 of 582) from server-side HTTP 500s, accepted as *"well under the 5%
tolerance."*
Columns: `gp`, `w`, `l`, `w_pct`, `min`, full shooting/rebounding/assist line, `plus_minus`.

Source: **`playerdashboardbygeneralsplits`** — **6 groups in one call**: `DaysRestPlayerDashboard`,
`LocationPlayerDashboard`, `MonthPlayerDashboard`, `PrePostAllStarPlayerDashboard`, `StartingPosition`,
`WinsLossesPlayerDashboard`. Team equivalent: `teamdashboardbygeneralsplits`
(`TEAM_DAYS_REST_RANGE`, `TEAM_GAME_LOCATION`). **One call per player per season — 612 calls.**

**Priority, as researched:**
- **Essential**: DaysRest (→ factor A4) · Location · **StartingPosition** (→ the role_tier concept)
- Worthwhile: PrePostAllStar (→ the phase dimension)
- **⚠ WinsLosses — LEAKAGE RISK**: *"correlational, not causal… players play better in wins partly
  BECAUSE good play caused the win. Collect it, but don't naively feed it to a model."*
- Low: Month

### `nba_team.defense_vs_position` — 630 rows *(T5)*
`team_id`, `opponent_position`, `season`, **`games_sampled`**, `avg_pts_allowed`, `avg_reb_allowed`,
`avg_ast_allowed`, `avg_fg_pct_allowed`.
**PK `(team_id, opponent_position, season)` — season IS in the key**, so all three seasons coexist
(30 × 7 × 3 = 630 ✓). **Contrast with the splits tables, which omit it and therefore hold one.**
`source_key DEFAULT 'DERIVED_FROM_PLAYER_GAME_LOG'` · `data_quality DEFAULT 'derived'` — **provenance
declared in the schema itself**. `games_sampled` lets consumers gate by sample size.
**Computed entirely from data already in Postgres — zero new API calls**, unblocked by the position fix.
Spot-check: the best center-defence teams allow ~8–9 pts/game to opposing centers.

### `nba_stats.player_game_starter_status` — 32,179 rows *(T5)*`player_id`, `game_id`, **`start_position`**, **`is_starter`**, **`comment`** —
PK `(player_id, game_id)`.
**`comment` is the DNP/inactive reason field**, which is what lets the grader distinguish a real DNP
from a join failure (COMPASS fact 60).
**Live 2026-09-20: 1,230 games · 12,300 starters · 591 players — 2025-26 ONLY.** Owner-approved scope;
all three seasons would have cost ~3,690 calls.
**12,300 = 10 starters × 1,230 games** — an identity that only holds if every game parsed correctly.
**⚠ SOURCE MUST BE `boxscoretraditionalv3`.** v2 returns **HTTP 200 with zero player rows** on
historical games — 1,228 games once "succeeded" and yielded 799 rows where ~30,000 were expected.
v3 schema: flat per-player fields (`personId`, `position`, `comment`) nested under
`boxScoreTraditional.homeTeam.players` / `awayTeam.players`.

### `nba_stats.game_officials` — 3,681 rows *(T6)*
`game_id`, `official_id`, `nba_official_id`, `full_name`, **`jersey_num`**, ⚠⚠ **`assignment` — NULL on all 3,681 rows** *(verified live 2026-09-21, T6 pass 6)*: the scraper requests it (`o.get("assignment") or None`) and the worker writes it, but **`boxscoresummaryv3` never populates it**, so the `or None` yields a silent NULL every time. `assignment` is the crew **role** (crew chief / referee / umpire), so **the three officials of a game are an unordered set** and crew-chief-specific analysis is not possible. ⚠ **Also: `official_id` here is numeric (`nba_1629178`) while `nba_ref.officials.official_id` is name-derived (`nba_official_ray_acosta`) — the two tables join at 0%.** → `NBA_OPEN_ITEMS.md`. Other columns —
PK `(game_id, official_id)`. **1,227 of 1,230 games** (3 officials × 1,227 + partials).
**`assignment`** carries the crew role (crew chief / referee / umpire), not just presence.
`source_key DEFAULT 'NBA_GITHUB_COMMITTED_ONETIME_BACKFILL_V3'` — **the `_V3` is encoded in the
provenance**, so any row from the broken v2 path would be distinguishable.
**⚠ SOURCE MUST BE `boxscoresummaryv3`** — v2 is **documented unreliable after 2025-04-10**, the same
pattern as `boxscoretraditionalv2`.
**⚠ 3 games (all 2025-11-19) have NO officials on NBA.com's side** — the API returns an empty array.
0.24%, accepted, not a bug.
Spot-check: top officials work **65–66 games**, matching real full-time referee workloads (~65–70).

### `nba_team.lineup_profile` — 8,000 rows *(T6)*
`group_quantity` (2/3/4/5), `group_id`, **`player_ids TEXT[]`**, `group_name`, `team_id`, `season`,
then the full statistical line (`gp`, `w`, `l`, `w_pct`, `min`, shooting, `blka`, `pfd`, `pts`,
`plus_minus`).
**2,000 rows per group size.** Source: **`leaguedashlineups` — only 4 bulk calls**, one per size.
**`player_ids` is a genuine Postgres array**, so *"which lineups contain player X"* is a single
`player_ids @> ARRAY[...]` query rather than a join table. **This is what caused the array-literal
formatting bug**, fixed with a manually-built literal rather than `sql.array()`.
**⚠ PK must include `team_id`** — *"the same `group_id` can legitimately appear for two different teams
within a season (traded players who happened to pair up elsewhere too)."*

### Depth available vs depth taken *(T4)*
Box scores exist league-wide back to **1996-97**; advanced stats from **1997**.
**Only 3 seasons were taken (2023-24, 2024-25, 2025-26)** — deliberately.
*"historical depth is not the constraint — **scope discipline is**."* Beyond 5–6 seasons the data
*"predates the full pace-and-space era"* — a different sport, not merely older.

### Shot-quality trio *(T3 design, T4 build)*
| Table | PK | Notes |
|---|---|---|
| `nba_stats.player_shot_quality` | **(`player_id`, `close_def_dist_range`)** | `fga_frequency` ← **the shot-diet weight the delta formula needs**, `fgm`, `fga`, `fg_pct`, `efg_pct`, `fg3a_frequency`, `fg3_pct`. `data_quality` **`'real'`** |
| `nba_stats.player_shot_quality_delta` | `player_id` | `actual_efg_pct`, `expected_efg_pct`, `shot_quality_delta`, `total_fga`. `data_quality` **`'derived'`** — it is computed |
| `nba_stats.player_shot_zone_profile` | **(`player_id`, `zone`)** | `fgm`, `fga`, `fg_pct`. `data_quality` **`'real'`** |

**582/582 deltas computed.** Verified: **Jokić 61.9% actual eFG vs 53.8% expected = +8.06%.**
**⚠ `leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list** — unlike every other
stats.nba.com endpoint.

---

## 9. THE CERTIFIED BASELINE RESULT *(T8, carried in the live code header)*

**Both seasons, leg level, same configuration, no re-tuning:**
| | 2025-26 (2 seasons history) | 2024-25 holdout (2023-24 only) |
|---|---|---|
| Points ladder, 13 rungs | 0.9 pp | **1.2 pp** |
| Rebounds ladder | 0.7 pp | **0.8 pp** |
| Assists ladder | 1.4 pp | 0.7 pp |
| 3PM ladder | 1.3 pp | 1.1 pp |
| Confidence bands (n≥1000) over 2.5 pp | 3 of 76 | 3 of 77 |
| **Points/rebounds confidence bands** | **0 misses of 37** | **0 of 37** |

*"Every band with real volume hits its stated rate."* The three residual misses are the thinnest
"less" bands for assists and 3PM (n ≈ 1,800–3,400), all between 2.6 and 3.9 pp.

**The holdout was run with the band mean-ratio cells DISABLED**, because they had been fitted on
2024-25 — so the reported holdout is the core method (tiers, empirical tables, Platt) unaided.

**`classification_ladder_v12.py`'s header asserts these numbers**: *"Holdout 2024-25 unchanged
(1.2 / 0.8 / 0 of 37)."* **The harness checks itself against its own certified result on every run.**

### Known misses, documented in the same header
*"**blocks more 70–75: −4.3, n=3900** = P(0 blocks) under-predicted for ~1.5 bpg players, **persists at
any lambda**; blocks less 75–80: −2.6 thin; steals less 60–65: +3.6. **Holdout 2024-25 shows the same
signs.**"* — structural, reproducible, not noise.

### Rejected on data, recorded in the same header
*"**player-own L0 cells** (n=40–80; **regression-noise dominated**; ELITE rebounds ±7.7). **Off.**"*

---

## 10b. TWO OPERATIONAL PATTERNS FOR THE LIVE SYSTEM
*Source: T1, blueprint §4j. Recorded 2026-09-20.*

### 1. ⚠ Deliberately-duplicated files drift silently
> *"**Two files meant to be EXACT COPIES of each other CAN SILENTLY DRIFT OUT OF SYNC** — MLB found
> **a real case where a STATIC HTML FALLBACK FILE was A FULL VERSION BEHIND the actual deployed worker
> serving the same interface**, with **ONLY THE SELF-REPORTED VERSION STRING REVEALING THE DRIFT**;
> the actual functional content had stayed correctly in sync.
> **If NBA's own system keeps ANY deliberately-duplicated file (a static fallback, a mirrored config),
> PERIODICALLY VERIFY IT'S STILL IDENTICAL to its live counterpart rather than ASSUMING A 'KEPT IN
> SYNC' FILE STAYS THAT WAY ON ITS OWN.**"*

**NBA's duplicated pairs:**
| Pair | Sync status |
|---|---|
| `nba_config.role_tiers` (6 rows) ↔ `ROLE_TIERS` in the recipe | ✅ **verified identical 2026-09-20** |
| **`classification_config.minutes_mixture` ↔ the recipe's minutes logic** | ❌ **DRIFTED** — config specifies `dud_lognormal`, `tiered_inelastic`, per-team `E[min\|blowout]`; none implemented |
| `classification_ladder_v12.py` ↔ `combos_ladder_v1.py` constants | 🔴 **DIVERGED — verified 2026-09-21 (§T9.27b)**, no longer "unverified". On **2025-11-29**, the one as-of day whose singles ran at per-prop depth (`points` 14, `steals` 2), **all five composites and `stocks` sat at a flat 10** against `LADDER_DEPTH` values of **16 · 15 · 14 · 7 · 16** (`pra`, `pts_reb`, `pts_ast`, `reb_ast`, `fantasy_score`). Each file still holds its own `LADDER_STEPS`; the Wilson threshold remains unverified. |
| The certified recipe ↔ the production **patcher** | ✅ **anchor assertions fail loudly on drift** — the right pattern |

**The patcher's anchor assertions are the model**: they turn silent drift into a loud failure. **The
config↔code pairs have no equivalent**, which is why `minutes_mixture` drifted unnoticed.

**And note the MLB case's detail**: *"only the SELF-REPORTED VERSION STRING revealing the drift."*
**`baseline_ladder.recipe_version` exists per row** — so NBA has the version-string mechanism; **what
is missing is anything comparing it against the config's expectations.**

> 🔴🔴 **THIS PREDICTION CAME TRUE — verified live 2026-09-21 (§T9.27b, §T9.32a).** The three as-of
> days in `nba_score.baseline_ladder` were built under **two different ladder-depth configurations**
> (2025-11-29 per-prop, `points` reaching rung **14**; 2026-01-15 and 2026-03-15 **flat 10**) — **and
> all three carry the identical string** `"classification_ladder_v12 (certified two-season recipe) +
> production patches"`. ⚠ **It is worse than the gap as written**: the gap was *"nothing compares the
> version string to the config"*; **the live state is that the version string does not VARY with the
> config**, so there is nothing to compare. **The mechanism is present as a column and absent as a
> signal.** *See `NBA_OPEN_ITEMS.md` for the owner decision.*

> ⚠ **And the patcher's anchor assertions do not cover this** *(added 2026-09-21, §T9.32b)*. `rep()`
> is `assert old in s` — **it asserts the anchor text still exists**, so it detects **drift in the
> harness**, loudly, exactly as this document credits it. **It cannot detect configuration introduced
> by the replacement**: `LADDER_STEPS` is replaced with `int(os.environ.get("BT_LADDER_STEPS", "10"))`,
> **the assertion passes**, and a measured 20-prop table is flattened to one number with nothing
> raised. **The guarantee is real and its scope is narrower than the eleven citations of it suggest.**

### 2. A stuck-looking job usually needs a WAIT, not a retry
> *"**When a job appears stuck in a running state with no progress, the correct response is usually to
> WAIT AND RE-CHECK VIA A LIGHTWEIGHT STATUS QUERY, NOT to repeatedly manually retry it.**
> MLB's system **holds a GLOBAL LOCK for a bounded window per acquisition**, and **a legitimate
> in-progress background cycle will correctly REJECT repeated manual re-triggers with a 'BUSY'
> response rather than a real failure — THAT'S THE SYSTEM BEHAVING SAFELY, NOT A BUG TO WORK
> AROUND.**
> **Give a stuck-looking job a real, meaningful wait (ON THE ORDER OF ONE TO TWO MINUTES) before
> concluding it needs manual intervention.**"*

**Directly relevant to NBA's operating model.** The build record is full of long-running jobs —
*"~1.5 h across all pairs"*, *"~50 min for six pairs"*, *"each call ~8 min"* — and **the documented
habit was to wait and re-check**, which matches.

**⚠ But NBA's dispatch is DIRECT, bypassing the queue and its lock** (the no-orchestrator rule). **So
the "busy" rejection MLB relies on may not exist here** — a re-trigger of an NBA worker mid-run may
start a second concurrent run rather than being refused.

**What NBA has instead**: **GitHub Actions concurrency groups** per pipeline
(`alphadog-nba-p1-weekly`, and P2/P3 equivalents), which serialise workflow runs. **That protects the
pipelines, not direct `run_job` calls to individual Workers.**

---

## 11. MLB tables referenced as models (never written by NBA)
`ref.teams` (16 cols: team_id, mlb_team_id, full_name, abbreviation, league, division, active…) ·
`ref.umpire_tendency` (11 cols: umpire_id, umpire_name, games_umpired, avg_strikeouts_per_game,
avg_walks_per_game, avg_runs_per_game…) — **the model for the NBA referee factor** ·
`config.worker_definitions` (116 workers, 16 cols) · `control.job_queue` (25 cols) ·
`control.worker_run_log` (10 cols) · `market.sleeper_board_current` (sport/league discriminator,
single-valued `baseball_mlb`/`MLB`) · `market.prizepicks_board_current` (`league='mlb'`)
`score.real_slip_leg_observations` · `control.user_placed_slips_log`

**All 12 MLB D1 bindings report FALSE** — MLB migrated to Postgres before the NBA build began.

---

## §0z2-T18 — LIVE NUMERIC RE-VERIFICATION OF EVERYTHING T18 PUBLISHED
*(T18 pass 6, `[LIVE-AUDIT]`, read-only `SELECT`s, **2026-09-22T11:43Z** — roughly three hours after
the earliest of these figures was first taken this session)*

| figure | published, and where | live 2026-09-22 | |
|---|---|---|---|
| `final_hp` `score < 0` | **6,924,101** §0a-T18-B | **6,924,101** | ✅ **EXACT** |
| `final_hp` `score >= 0` | **12,291,099** §0a-T18-B | **12,291,099** | ✅ **EXACT** |
| `final_hp` total | 19,215,200 | **19,215,200** | ✅ **EXACT** *(and 6,924,101 + 12,291,099 = 19,215,200 ✓)* |
| `final_hp` latest `built_at` | **22:41:47** §0a-T18-B | **2026-09-19 22:41:47.612137+00** | ✅ **EXACT to the microsecond** |
| `final_hp` 2024-25 legs | 19,075,070 | **19,075,070** | ✅ **EXACT** |
| `final_hp` 2025-26 legs | 140,130 | **140,130** | ✅ **EXACT** |
| `baseline_history` | **19,343,348** §0w *(T17's correction)* | **19,343,348** | ✅ **EXACT — stable across three days** |
| `board_snapshots` | 27,067,871 *(T11 pass 3)* | **27,067,871** | ✅ **EXACT** |
| `confidence_model` rows | **10** §5.2 correction | **10** | ✅ |
| `confidence_model` `f_role` deduction | **11.2731** §5.2 | **11.2731** | ✅ |
| `confidence_model` deduction sum | **29.0004** §T18.5 | **29.0004** | ✅ **EXACT to 4 dp** |
| `f_role` separation | 0.008477 | **0.008477** | ✅ |
| `f_phase` separation | **0.001467** §5.2 | **0.001467** | ✅ |
| `board_tiers_v2` | **2,199,354** §0.005-T18 | **2,199,354** | ✅ |
| `board_tiers` | 2,199,354 | **2,199,354** | ✅ **identical to v2** |
| `board_scored` | 12,818,715 | **12,818,715** | ✅ |
| `conformal_confidence` | 342 | **342** | ✅ |
| `scenario_realised` | 1,942 | **1,942** | ✅ |
| `schedule_norm` 2024-25 / 2025-26 | 1,230 / 1,230 §0.002-T18 | **1,230 / 1,230** | ✅ |

🔑 **TWENTY FIGURES RE-TAKEN, TWENTY EXACT — 100%, against a pre-registered bar of 90%.**
⚠⚠ **AND THE PRE-REGISTRATION'S THIRD CLAUSE FAILS, WHICH IS WORTH MORE THAN THE FIRST TWO PASSING.**
*It predicted **at least one published figure would have MOVED**, on the reasoning that another
session is writing this database — with the stated consequence that **if none moved, the sweep's
`[LIVE-AUDIT]` timestamps are doing no work and should be said to be doing none.*** ❌ **None moved.**
⚠ **But the escape clause's conclusion is TOO STRONG and is not adopted**: **a timestamp that
documents STABILITY is doing work — it is what let T17's §0w correction be made at all**, when a
`baseline_history` figure was *believed* to have drifted and provably had not. ⇒ ***Restated at the
strength the evidence supports: over this session's three-hour window T18's live figures are
STABLE, and the timestamps record that stability rather than track drift. The right claim for a
`[LIVE-AUDIT]` figure is "as of T", never "still true".***

⚠ **One TRANSCRIPT figure has moved, and it is not one of the sweep's**: SEG 94 recorded a 2025-26
minimum score of **−53.68**; the live minimum across both seasons is **−52.49**, and 2025-26's own
minimum is now **+7.40**. ✅ **Consistent with what the twelve already record** — 2025-26 holds one
date's 140,130 legs rather than a season, a loss of **19,471,496** rows already on file from T17.

---

## §0z-T18 — THE TWO MEASUREMENT TABLES THE PROSE REPORTED ONLY IN PART
*(T18 pass 2, mechanism strata · `run_sql_postgres` results quoted verbatim · written 2026-09-22.
**Both are `[TRANSCRIPT]` figures — queries the author ran on 2026-09-19 — not `[LIVE-AUDIT]`.**)*

### 1. ✅ LADDER DEPTH BY BOOKMAKER — **TWELVE books were measured; the prose named FIVE**

| bookmaker | legs | avg dist | p95 | max |
|---|---|---|---|---|
| fanduel | **6,932** | 3.23 | 10.00 | **32.00** |
| draftkings | 5,585 | 3.06 | 11.00 | 28.00 |
| betonlineag | 5,469 | 3.87 | 13.00 | 26.00 |
| bovada | 5,254 | 4.01 | **16.00** | **32.00** |
| fanatics | 3,940 | **4.78** | 11.00 | 22.00 |
| williamhill_us | 3,891 | 2.06 | 7.00 | 18.00 |
| **prizepicks** | **3,518** | **1.98** | **6.00** | **15.00** |
| betmgm | 2,980 | **1.80** | **5.00** | — |
| betr_us_dfs | 2,883 | 2.33 | 7.00 | 18.00 |
| betrivers | … | … | … | … |

⚠ *Distance is in **stat units**, not rungs.* ⚠ **Rule 19 — the rows above are the query's own order
(`ORDER BY legs DESC`); `betrivers` and anything after it were cut by `max_rows`, so this is the top
of the list, not certainly all twelve.**

🔑🔑 **THE FACT THE PROSE'S FIVE-BOOK SUMMARY HIDES: PrizePicks is the SHALLOWEST board in the set
bar one.** *avg 1.98 · p95 6.00 · max 15.00, against bovada's p95 16 and fanduel's max 32.*
⇒ **The ±10 ladder is generous for the owner's primary app and short only for the SPORTSBOOKS** —
which is precisely where `rung_market`, the de-vigged book comparison, lives. **So the depth
shortfall is a MARKET-SIGNAL problem, not a PrizePicks-coverage problem.** *(The conclusion
`NBA_OPEN_ITEMS` §*PARTIAL · ladder depth…* already carries is unchanged; this is the table behind it,
and it says which side of the board the shortfall falls on.)*
🔑 **`betr_us_dfs` appears as a BOOKMAKER in the odds feed** — a DFS app reaching the system through
the sportsbook channel rather than through its own scraper.

### 2. ✅ THE BOARD SCORER'S FULL PER-PROP RESULT — *the prose printed seven rows of twelve*

| prop | legs | avg hp | avg conf | avg score | interpolated |
|---|---|---|---|---|---|
| points | **13,459** | 0.4336 | 0.9580 | 63.1 | **1,294** |
| pra | 8,419 | 0.4456 | 0.9552 | 63.4 | **966** |
| rebounds | 6,851 | 0.4144 | 0.9643 | 63.6 | 113 |
| pts_reb | 6,072 | 0.4923 | 0.9576 | 67.4 | 332 |
| threes_made | 4,752 | 0.3698 | 0.9675 | 61.5 | 2 |
| assists | 4,596 | 0.4095 | 0.9677 | 64.0 | 50 |
| pts_ast | 4,498 | 0.4908 | 0.9601 | 67.7 | 233 |
| reb_ast | 3,300 | 0.4318 | 0.9619 | 64.2 | 84 |
| blocks | 220 | 0.4963 | 0.9606 | 68.2 | **0** |
| stocks | 97 | 0.4843 | 0.9572 | 66.9 | **0** |
| turnovers | 68 | 0.4967 | 0.9566 | 67.6 | **0** |
| steals | — | — | — | 68.0 | **0** |
| **WHOLE BOARD** | **58,395** · 12 props · 12 apps | **0.4375** | **0.9416** | **60.6** | **3,243** |

✅ **The per-prop depth verdict is confirmed a third time, now from the scorer's own output**:
**points 1,294 and pra 966 off-ladder; steals · blocks · stocks · turnovers exactly ZERO.**

⚠⚠ **A CANDIDATE PATTERN, CHECKED AND KILLED — recorded because the CHECK is the point.** *The score
column appears to rise as leg count falls (blocks 68.2 · steals 68.0 · turnovers 67.6 against points
63.1), which would suggest thin props are being scored optimistically.* ❌ **Not a defect — `avg_hp`
explains it.** *Blocks sit at hp 0.4963 against points' 0.4336, and the shipped pivot
`score = hp·100 + (100 − hp·100)·lift`, `lift = clip((conf − 0.85)/0.15, 0, 1)·0.50`, reproduces
every row from its own hp and conf.* ⚠ **CORRECTED IN PLACE 2026-09-22 (pass 4, direction A):** *the
first version of this line gave blocks as **69.5** from hand-arithmetic. **Recomputed in code it is
68.20 against the reported 68.2 — EXACT to two decimals**, so the earlier figure was wrong and it
understated the agreement. The correction is recorded rather than edited away.*

| prop | hp | conf | **formula** | reported | diff |
|---|---|---|---|---|---|
| **blocks** | 0.4963 | 0.9606 | **68.20** | **68.2** | **+0.00** |
| threes_made | 0.3698 | 0.9675 | 61.66 | 61.5 | +0.16 |
| pra | 0.4456 | 0.9552 | 64.00 | 63.4 | +0.60 |
| points | 0.4336 | 0.9580 | 63.75 | 63.1 | +0.65 |

*The small positive residuals are expected: the pivot is non-linear in hp, so evaluating it at a
prop's MEAN hp overshoots the mean of the per-leg scores (Jensen). **Blocks, the thinnest prop with
the least spread, lands exactly — which is the pattern that confirms the explanation rather than
merely being consistent with it.*** **Confidence spans only 0.9552→0.9677 across every prop and
cannot carry a five-point score spread.** *(Rule 8's habit — probe your most confident finding
first — applied to a PATTERN rather than a figure.)*

### ⚠ ONE ARITHMETIC RESIDUE, RECORDED AND NOT EXPLAINED *(rule 6)*
**The whole-board `avg_conf` is 0.9416 — BELOW every one of the twelve per-prop confidences, which
run 0.9552 to 0.9677.** *A mean over the same population cannot fall outside the range of its parts.*
⚠ **NOT RECORDED: whether the aggregate row and the per-prop rows cover the same legs.** *The
interpolation tax cannot account for it either — 3,243 of 58,395 is **5.55%**, and 4 points on 5.55%
of legs is ~0.0022, not the ~0.014 observed.* **A `GROUP BY` on the same table would settle it; this
sweep does not run one, because these are the transcript's numbers and the table has been rewritten
since.** *Open item T18-13.*