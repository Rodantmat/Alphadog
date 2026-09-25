# NBA WORKERS — every worker, scraper and script

**Purpose.** What each piece of code is, where it lives, what it does, what it needs, and what it
writes. Grouped by role.

---

> # 📑 **INDEX — `NBA_WORKERS.md`**
> **Every worker and workflow** — what each does, how it is wired, what triggers it, and where it
> fails. *Counts of workflows and crons are never quoted here; `§0.0` carries the commands.*
> 📏 **`130` sections · `2026-09-23`** *(re-derive, never quote — `6` sections added `2026-09-25`):* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_WORKERS.md ``
>
> 🆕🆕 **SECTIONS ADDED `2026-09-25` — `6` NEW, AND FIVE OF THEM ARE ONE FAILURE CLASS.** *Anchors are heading text; search the label.*
> | § | what it is |
> |---|---|
> | 🔴🔴🔴 **`§T26.28`** | **THE FROZEN STATIC LAYER'S ROOT CAUSE — P1 died on `ModuleNotFoundError: scipy` EVERY MONDAY, before its COMMIT step**, *"so the whole week's scraping was thrown away uncommitted… **while the cron ran fine every week**"*. ⇒ **ranked item `B` diagnosed and half-closed** |
> | 🔴🔴🔴 **`§T26.26`** | **THE REFEREE ARC** — *a decision taken, **rejected by the owner in the next turn**, conceded as a logical error, then dissolved by the documentation (**in production the crew is KNOWN, not predicted**) — uncovering the cron bug that left `referee_assignments` at `0` rows and moved P2 to the morning* |
> | 🔴🔴🔴 **`§T26.35`** | **FOUR MORE DEFECTS FROM THE COMMIT STREAM** — *P3's "board tiers" step ran a one-off index job on `25.7M` rows and **NEVER BUILT TIERS** (= **`T20-7`, now CLOSED**) · the `120`-minute deadline · P1's silent-zero rollover · P2's `KeyError` on a no-game day.* 🔑 *Also: **the entire compute path scores `91,405` legs in under `20` SECONDS*** |
> | 🔴🔴🔴 **`§T26.19`** | **P2 BUILT `41,174` PERIOD ROWS A NIGHT THAT NEVER REACHED THE DATABASE** — *`~43` min, a third of the pipeline; closed, **and fixing it is what created `§T26.17`'s key collision*** |
> | 🔑🔑🔑 **`§T26.43`** | **`check_factor_freshness.py` — THE INSTRUMENT THAT CLOSES THE SILENT-FALLBACK CLASS, AND IT HAS NO CRON** ⇒ item **`T26-2`** |
> | ✅✅✅ **`§T26.34`** | **THE CERTIFIER CAUGHT THE `final_hp` LOSS, LOUDLY** *(run `35917049251`)* — **the corpus's only recorded instance of it working** |
>
> ⚠⚠ **READ `§T26.19`, `§T26.26`, `§T26.28`, `§T26.35`① AND `T20-17` TOGETHER: they are FIVE instances of ONE class — *work performed, work not persisted, every liveness signal green.*** 🔑 **`RULE 37`'s silent category finally has its mechanism: the gap is always between DOING and COMMITTING.**
>
> | 🔴🔴 **the FILE CENSUS — `7` of `21` workers and `27` scripts named in `0` of the twelve** | **`§F5.5`** ⚠ *`§T26.45` adds `3` MORE, built `2026-09-23`–`25` and load-bearing TODAY* |
> | 🔴🔴 **the scripts behind every T15 factor verdict** *(`fit_*`, `measure_*`, `retest_*`)* | **`§F5.5` §2** — *mapping also in `NBA_FINAL_SCORING_CALIBRATION.md` §3* |
> | 🔴 **the FOUR workflow files that were named nowhere in the twelve** *(`nba-backtest`, `nba-grader`, `nba-measure-types`, `nba-score-history`)* | **`§F2.16`** |
> | 🔴🔴🔴 **the grader workflow — and `T20-5`'s stale `2026-04-12` window, a SECOND and THIRD time** | **`§F2.16` §1** |
> | ✅ **`nba-score-history.yml`'s two-job pipeline** *(`AC_K=400`, 8-way score matrix, "refuses to write an empty build")* | **`§F2.16` §2** |
> | 📊 **`continue-on-error` across all 40 workflows** — `11` files, `48` occurrences | **`§F2.16` §3** |
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** 🔁 **To resolve a `§` pointer:** `` grep -rn "§T9.40b" nba/*.md `` *(all `32` files — the twelve are not closed under their own citations).* **Search for the quoted `§` label.**
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
> 🔴🔴 **THE `§0.x` NUMBERING IS DENSE, DEEP AND OUT OF ORDER.** *The file runs `0.00000`, `0.0000`,
> `0.000`, `0.001`, `0.00`, `0.0`, `0`, `0.14`, `0.15`, `0.2`, `0.23`–`0.31`, then `0.42`, `0.41`,
> `0.39`, `0.36`, `0.37`, `0.38`, `0.35`, `0.34`, `0.33`, `0.32`, `0.3`, `0.4`, `0.5` — **the `0.3x`
> and `0.4x` blocks run BACKWARDS**.* ⇒ ***Do not navigate by number. Use this index.***
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | 🗺️ **which workflow runs which script and writes which table** | **`§0.00000` — THE WIRING MAP** |
> | 🔴 **the three pipelines and the owner's explicit cron instruction** | **`§0.0000`** |
> | ⚠ **the complete schedule surface** *(seven scheduled workflows touch `nba/`, not four)* | **`§0.0`** |
> | **what a specific piece of code IS** | Cloudflare writers **`§1`** · static scrapers **`§2`** · board scrapers **`§3`** · baseline engine **`§4`** · scoring engine **`§5`** · verifiers **`§6`** · workflows **`§7`** |
> | 🔴 **what CERTIFIES, and whether the check means anything** | **`§0.31`** *(hardcoded row-count thresholds)* · **`§0.39`** *(`ok: certified` across 18 workers)* · 🔴 **`§0.004-T18`** *(the certifier cannot tell a full slate from one row)* |
> | 🔴 **every destructive statement in the codebase** | **`§6b`** · ⚠ **`§6c`** *(SQL only — workflows can delete files too)* |
> | ⚠⚠ **the hardcoded-season literal, and the grep trap that hides half of it** | **`§0.00`** |
> | ⚠ **why `[skip ci]` is a convention, not a guard** | **`§0.29`** |
> | ⚠ **`POST /run` carries no authentication** | **`§0.28`** |
> | ⚠ **how `deployed_sha.txt` silently drifts** | **`§0.26`** |
> | 🔴 **editing a workflow right after dispatching it CANCELS the run** | **`§0.000`** |
> | ⚠⚠ **before assuming anything is "live"** | **`§0d` — SYSTEM SELF-KNOWLEDGE** |
> | **the four-step wiring pattern, and its blast radii** | **`§0`** · **`§0.2`** · **`§0.37`** |
> | ⚠ **the design rule the scrapers DISAGREE on** *(keep every column vs hand-pick)* | **`§0.35`** |
> | 🔁 **DO NOT QUOTE THE WORKFLOW COUNTS — RE-DERIVE THEM.** *The owner's standing rule made operational: three one-line commands that regenerate the totals and every ACTIVE cron, so the figure cannot go stale.* | **`§0.0`** *(recipe)* · **`§T22.29`** *(why)* |
>
> ## 📋 EVERY SECTION, IN LOGICAL ORDER
>
> ### 🗺️ **A · THE MAPS — start here**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.00000`** | 🗺️🗺️ **THE WIRING MAP — WORKFLOW → SCRIPT → TABLE** *(`T20` pass 34, `§T20.3x`)* | 🗺️ |
> | **`0.0000`** | 🔴 **The three pipelines, and the owner's explicit cron instruction — SET IT ON ONE, NOT ON ALL** | 🔴 |
> | **`0.0`** | ⚠ **The complete schedule surface — SEVEN scheduled workflows touch `nba/`, not four** | ⚠ |
> | **`0.4`** | **The two registries — and the count that proves the isolation held** | |
>
> ### 🧱 **B · THE CODE, BY ROLE**
> | § | what it covers |
> |---|---|
> | **`1`** | **CLOUDFLARE WORKERS — Postgres writers** |
> | **`4b`** | **Cloudflare writer workers built `T3`–`T9`** |
> | **`2`** | **STATIC SCRAPERS** — GitHub Actions, `nba/data/` |
> | **`3`** | **BOARD SCRAPERS** |
> | **`4`** | **BASELINE ENGINE** |
> | **`5`** | **SCORING ENGINE** |
> | **`6`** | **VERIFIERS** |
> | **`7`** | **WORKFLOWS** — *incl.* **`§0.41`** *why there are so many `nba-*.yml`, a stated principle recovered from code* |
>
> ### ⚙️ **C · THE WIRING PATTERN AND ITS HAZARDS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0`** | **The four-step wiring pattern** *(established `T2`)* | |
> | **`0.2`** | ⚠ **The four wiring steps have different DEPLOY BLAST RADII** | ⚠ |
> | **`0.37`** | **A fifth hand-maintained edit site per new static entity — with the widest blast radius** | ⚠ |
> | **`0.14`** · **`0.15`** | ⚠ The shared dispatch path's unstated invariant · the dispatch enum and the second per-worker mode | ⚠ |
> | **`0.30`** | **The service-binding deploy order — a real bug, and the permanent fix** | |
> | **`0.32`** | **The five static writers are COPIES of one worker** — *incl. a self-identifying User-Agent* | |
> | **`0.33`** | **Two GitHub read paths now exist — and which one a worker uses is invisible from its name** | ⚠ |
> | **`0.34`** | **The `scope_lock` declaration** — a worker that states every table it may write | |
> | **`0.3`** | ⚠ **Every worker's operating constants are HARDCODED — the founding rule is not holding** | ⚠ |
> | **`0.5`** | ⚠ **The worker architecture was a NON-GOAL before it was a design** | ⚠ |
>
> ### 🚨 **D · DEPLOY AND RUNTIME HAZARDS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.000`** | 🔴 **Editing a workflow file right after dispatching it CANCELS the run** — and a cancelled run is not a failed one | 🔴 |
> | **`0.25`** | ⚠ **The pre-commit syntax gate — the only local check before an auto-deploying push** | ⚠ |
> | **`0.26`** | ⚠ **The deploy-scope anchor — `deployed_sha.txt`, and how it silently drifts** | ⚠ |
> | **`0.27`** | ⚠ **Dead D1 provisioning still runs on every deploy — including every NBA deploy** | ⚠ |
> | **`0.28`** | ⚠ **`POST /run` carries NO AUTHENTICATION** — fleet-wide, and NBA inherited it faithfully | ⚠ |
> | **`0.29`** | ⚠ **The deploy trigger has no path filter — `[skip ci]` is a CONVENTION, not a guard** | ⚠ |
> | **`0.42`** | ⚠ **Always test v3 before v2 — a rule the project paid for twice** | ⚠ |
>
> ### ✅ **E · CERTIFICATION, DESTRUCTION AND WHAT THE CHECKS MISS**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.31`** | ⚠ **Certification is a hardcoded ROW-COUNT THRESHOLD — and each worker picks its own** | ⚠ |
> | **`0.39`** | 🔴 **`ok: certified` — the `ok` field IS the certification verdict, across `18` workers** | 🔴 |
> | **`0.004-T18`** | 🔴🔴 **THE CERTIFIER CANNOT TELL A FULL SLATE FROM ONE ROW** | 🔴🔴 |
> | **`6b`** | **EVERY DESTRUCTIVE STATEMENT IN THE CODEBASE — the complete audit** | |
> | **`6c`** | ⚠ **That audit covers SQL ONLY — workflows can delete files too** | ⚠ |
> | **`0e`** | ⚠ **The scope-parameter audit** — every mode/scope argument must constrain the WRITE, not the response | ⚠ |
>
> ### 📋 **F · DATA-QUALITY AND METHOD**
> | § | what it covers | 🚩 |
> |---|---|---|
> | **`0.00`** | ⚠⚠ **The hardcoded-season literal, and the GREP TRAP that hides half of it** | ⚠⚠ |
> | **`0.23`** | 🔴 **The injury archive changes filename pattern mid-season — and the first backfill silently caught it** | 🔴 |
> | **`0.24`** | 🔴 **Validate a parser on the RUNNER'S OWN extraction, not on your own** | 🔴 |
> | **`0.36`** | **`raw_json` is written as a STRING by every static writer — the column is unqueryable** | ⚠ |
> | **`0.35`** | ⚠ **The design rule the scrapers DISAGREE on — keep every column, or hand-pick and lose signal** | ⚠ |
> | **`0.38`** | ⚠ **All twelve mandated documents end with a stray tool-payload fragment** | ⚠ |
> | **`0a`** · **`0d`** | **The investigation methodology** for a large existing system · ⚠⚠ **SYSTEM SELF-KNOWLEDGE — read before assuming anything is "live"** | ⚠⚠ |
> | **`0.001`** · **`0.003-T18`** · **`0.005-T18`** | The `T15` mechanism-failure census *(came back empty)* · the mechanism strata pinned · the census with its partition closing | |
> | **`0.002-T18`** + **`-CORRECTION`** | ⚠⚠⚠ **The section overstated its case; the ordering refutes it** — *severity withdrawn, scope narrowed.* **Read the CORRECTION first.** | ⚠⚠⚠ |
>
> 📌 **HOW TO READ THIS FILE**: ***`A` to find anything; `B` for what a piece of code is; `C`/`D` for
> why a change is riskier than it looks; `E` for how much a green check is worth; `F` for the traps.***

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Cloudflare workers and static scrapers from T1–T2; engine/board/pipeline scripts from the live session and the journal. |
| **2026-09-22** | 🔴 **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers `12` commits that this log never recorded.** *T15–T18 material plus the live audits: **§T15.4c the concurrency-group self-cancellation** · **T18 pass 2: the gap detector passing an entire season as not-a-failure** · **§0.004-T18 the certifier's twelve predicates read from live source** · **§0.005-T18 the mechanism failure census** (43 real results parsed) · **§T18.1 the three pipelines with the owner's explicit cron intent** · **the WORKFLOW → SCRIPT → TABLE wiring map published**, then extended with the mis-wired P3 step 6 and its read edge. **Corrections in place: §0.002-T18 corrected — the gap-audit fallback did not exist · §0.003-T18 corrected by the census — six bridge tool-execution failures · "PIPELINE n OF 3" reconciled with COMPASS fact 107's TWO · P1's cron time qualified 12:00 PDT / 11:00 PST.*** |

---

## 0.00000 🗺️🗺️ **THE WIRING MAP — WORKFLOW → SCRIPT → TABLE** *(published 2026-09-22, T20 pass 34, §T20.39)*

> 🔑🔑 **WHY THIS SECTION EXISTS.** *This document has described every SCRIPT and
> `NBA_DATABASE.md` every TABLE, and until now nothing described the EDGE between them.*
> **Five consecutive T20 passes each found a defect, and every one lived on an edge** — a season
> constant between a workflow and a script *(T20-4)*, a date window between a script and a table
> *(T20-5)*, a certifier check between an assertion and a writer *(T20-6)*. ***The map below is the
> missing view, written down so the blind spot that produced all three closes.***
> **POPULATIONS, pinned 2026-09-22T15:52:31Z** *(rebuildable: `scratchpad/t20/wiring.py`; the
> invocation pattern matches SUBDIRECTORY paths — `nba/baseline/*.py` was lost to a root-only pattern
> once already)*: **`39` workflow files** *(all 40 less `nba-pp-payout-map.yml`, the concurrent
> session's)* · **`119` distinct script invocations** · **`33` distinct tables written.**
> ⚠ **Every cell below was opened against its source (rule 48). Rows that RESTATE an open item are
> marked; the map does not republish old findings as new ones.**

### A · THE THREE PIPELINES IN STEP ORDER

> ⚠⚠ **A NOTE ON "THREE", ADDED 2026-09-22 (§T20.43) — AND IT RESOLVES A MIS-CITATION IN THE SYSTEM.**
> **All three workflow files open with `# PIPELINE n OF 3 (COMPASS fact 107)`.**
> 🔴 **COMPASS fact 107 is headed *"TWO PIPELINES, CUTOFF 1:15 PM PT — AND THE SCENARIO SIMULATOR IS
> DROPPED"* and reads *"ARCHITECTURE: **(1) heavy overnight pipeline** … **and (2) a light 1:15 PM PT
> pipeline**"*, explicitly *"supersedes the three-phase design in facts 41 and 68"*.**
> ⇒ ***Each of the three files cites, as its authority for being one of THREE, a fact whose headline
> is TWO and which explicitly retired a three-phase design.***
> ✅ **THE RECONCILIATION, stated here because it appears nowhere else in the corpus**: **fact 107
> describes the DAILY architecture. P1 is WEEKLY** *(cron `0 19 * * 1`, Mondays)* **and sits outside
> what 107 addresses.** ⇒ **"Three" counts a layer the fact does not discuss; the two are compatible,
> and neither the workflows nor the twelve had ever said so.**
> ⚠ **Recorded, not fixed in the system (rule 1): the workflow headers are the SYSTEM's text.**

**P1 — `nba-p1-weekly-static.yml` · 14 invocations · cron `0 19 * * 1` (Mondays **12:00 PDT / 11:00 PST** — *qualified 2026-09-22, §T20.49 / T20-11: `19:00 UTC` is 12:00 PT only while DST is in effect; from **2026-11-01 to 2027-03-14**, i.e. **133 of the season's first 145 days**, P1 fires at **11:00 PT**. The workflow's own comment at `:28` has PDT and PST swapped*)**

| step | script | writes |
|---|---|---|
| 1–11 | `scrape_nba_stats_teams` · `_arenas` · `_players` · `player_bio` · `season_tables` · `team_stats` · `onoff` · `playtypes` · `player_tracking` · `darko` · `shotquality` | **— nothing to the DB** |
| 12 | `build_defender_ratings.py` | `nba_ref.defender_ratings` |
| 13 | `build_static_context.py` | **— nothing to the DB** |
| 14 | `certify_pipeline.py` `PIPE=p1` | *(asserts only)* |

🔑 ***Eleven of P1's fourteen scripts write NO database row.*** **They emit JSON that is committed to
the repo, and a separate loader must pick it up — the two-hop architecture.** ⚠ **This is exactly the
shape of T11's headline finding (2): *the second hop is missing for a whole family.* The map makes
the exposure countable rather than anecdotal.**

**P2 — `nba-p2-overnight-heavy.yml` · 19 invocations · ✅ CRON `45 15 * * *` LIVE (added 2026-09-23)** ⚠ ***IT RUNS IN THE MORNING, NOT OVERNIGHT*** — *`08:45 PT` (PDT) / `07:45` (PST), moved there because D1 referee assignments publish `~6–7 AM PT` and are never archived. **The filename is historical.*** *(`§T26.1`)*

| step | script | writes |
|---|---|---|
| 1–3 | `scrape_nba_daily_delta` · `_per_game_delta` · `_injury_report` | — |
| 4 | `scrape_referee_assignments.py` | `nba_ref.referee_assignments` ⚠ **live count `0`** |
| 5–8 | `scrape_nba_matchups_pergame` · `sync_season_files_from_delta` · `scrape_nba_periods` · `scrape_nba_schedule` | — |
| 9 | `check_delta_gaps.py` | — *(audit; 🔴 `GAP_SEASON` default `"2025-26"` — T20-4)* |
| 10 | `grade_board_outcomes.py` | `nba_market.board_outcomes` 🔴 *(window ends `2026-04-12` — T20-5)* |
| 11 | `export_market_spreads.py` | **— nothing to the DB** *(a FILE producer despite the name)* |
| 12–14 | `baseline/build_baseline_ladder.py` · `baseline/build_combos_ladder.py` · `baseline/build_periods_ladder.py` | **— nothing to the DB** *(they emit the ladder artefacts)* |
| 15 | `load_baseline_ladder.py` | **`nba_score.baseline_ladder`** *(live `206,237`)* · `nba_score.baseline_ladder_runs` *(latest `asof` **2026-03-15**)* |
| 16 | `build_asof_calibration.py` | `nba_score.ladder_calibration_asof` |
| 17 | `build_blowout_model.py` | `nba_score.blowout_model` |
| 18 | `build_confidence_v3.py` | `nba_score.confidence_model` · `nba_score.confidence_verification` |
| 19 | `certify_pipeline.py` `PIPE=p2` | *(asserts only)* |

> ### 🆕 §T26.14 — 🔴 **`P1` WAS CERTIFYING RED EVERY MONDAY, OUT OF SEASON — *"exactly how a team learns to ignore red builds"***
>
> *`T26`, `2026-09-24`. **Fixed the same day.***
>
> 🔴 **The mechanism.** *`P1`'s certifier demands `nba_ref.defender_ratings` be **under `8` days old**.
> Out of season nothing refreshes it — it was stamped `2026-04-09` — so **every weekly run went red on
> a freshness check that could not pass until games resume.***
>
> ⇒ 🔑🔑 ***A guard that cannot pass out of season is not a guard; it is a training exercise in
> ignoring the alarm.*** **This is the same reasoning the `P2` header gives for withholding its cron
> until the season** *("a scheduled job failing nightly against an empty schedule trains everyone to
> ignore red builds")* — ***and `P1` had been doing precisely that, weekly, the whole time.***
>
> ✅ **Fixed: the certifier is now SEASON-AWARE.** *Out of season a run certifies with "no games
> scheduled" and stays green rather than red.* ⚠ **The freshness check is NOT removed — it becomes
> binding again once games start**, *which is when an `8`-day-old defender rating would actually be a
> defect.*
>
> 📌 ***The pattern to carry: every freshness gate needs a season predicate, or it inverts out of
> season — asserting failure when the correct state is "nothing to do".***

> ### 🆕 §T26.6 — ✅✅ **`P3`: `22` MINUTES → `~2`. IT WAS SCRAPING EVERY SPORT THE APPS OFFER AND THROWING THE REST AWAY.**
>
> *`T26`, `2026-09-24`. **Measured from the run log, not inferred** — run `35956077197`, `04:32:23`
> start, next job queued by `04:34:52`.*
>
> 🔴 **THE CAUSE.** *One run logged* **`mlb: 1,707 legs across 30 categories`** *beside* **`nba: 3 legs`**;
> *Fliff logged* **`mlb: events=18, markets=604, legs=4451`**. **The archive step filters to NBA
> AFTERWARDS (`ARCHIVE_SPORT: nba`), so every one of those calls was paid for and discarded —
> roughly `20` of the `22` minutes.**
>
> 🔑🔑 **WHY IT SURVIVED: THE FILTER VARIABLES ARE NOT UNIFORM, AND NEITHER IS THEIR CASING.**
> *Sleeper was already scoped; Underdog and Fliff were not.* **Verified in the live file:**
> `PRIZEPICKS_SPORT: "nba"` · `SLEEPER_SPORTS: "nba"` · **`UNDERDOG_SPORTS: "NBA"` (UPPER)** ·
> **`FLIFF_SPORTS: "nba"` (lower)** · `ARCHIVE_SPORT: "nba"`.
> ⚠ ***Five variables, four different names, two different cases. A generic `SPORT` does nothing.***
> **Both were read from source before being set** — *the only safe way to set them.*
>
> ✅ **AND THE REST OF THE PIPELINE WAS NEVER THE PROBLEM**: *archive `2s` · board tiers `23s` ·
> market + rung market `9s` · commit `8s` · certify `1s`.* 🔑 **On a real slate the compute path
> scored `91,405` legs in under `20` seconds.** ⇒ ***The "heavy" pipeline was `91%` waste fetch.***
>
> ✅ **TWO GUARDS ADDED FOR UNATTENDED RUNNING** *(live in the file)*: **each board capped —
> `timeout --signal=TERM --kill-after=30s 300`** *(`420` for the PrizePicks step)* — **and
> `timeout-minutes: 25` on the job.**

**P3 — `nba-p3-afternoon-light.yml` · 11 invocations · ✅ CRON `15 21 * * *` LIVE** *(`1:15 PM PST` / `2:15 PDT`)* ⚠ **the file's line `13` still reads "NO CRON YET" — its own `on:` block contradicts it; trust the `on:` block** *(`§T26.1` §4)*

| step | script | writes |
|---|---|---|
| 1–4 | `scrape_nba_injury_report` · `scrape_sleeper_board` · `scrape_underdog_board` · `scrape_fliff_board` | — ⚠ *no PrizePicks producer — the documented HARD GAP* |
| 5 | `archive_live_boards.py` | `nba_market.board_snapshots` |
| 6 | 🔴🔴🔴 `maintenance_shrink_board_index.py` | **— nothing. SEE BELOW: this step is MIS-WIRED** |
| 7 | `export_market_spreads.py` | — |
| 8 | `build_rung_market.py` | `nba_market.rung_market` 🔴 *(window ends `2026-04` — T20-5)* |
| 9 | `build_availability_delta.py` | `nba_score.availability_delta` *(live `4,274`)* 🔴 *(season default; returns 0 silently — T20-4)* |
| 10 | `score_board_legs.py` | **`nba_score.board_scored`** — **P3's PRIMARY OUTPUT** |
| 10b | *(inline block)* | `nba_score.paper_picks` *(live `0`)* |
| 11 | `certify_pipeline.py` `PIPE=p3` | *(asserts only)* |

### A2 · 🔴🔴🔴 **P3's STEP 6 IS MIS-WIRED, AND `nba_market.board_tiers` HAS NO WRITER** *(added 2026-09-22, §T20.40)*

| | |
|---|---|
| **P3 step 6 is NAMED** | *"Board tiers (goblin / standard / demon)"* |
| **and COMMENTED** | *"Classify every board leg as standard / goblin / demon with its tier and anchor. **The score and the slip engine both need this** — a rung's break-even depends on which variation it is."* |
| **and RUNS** | `python nba/maintenance_shrink_board_index.py` |
| **whose own docstring says** | *"**One-off maintenance**: shrink `nba_market.board_snapshots` by replacing the 7-column primary key (5.6 GB on 25.7M rows) with a compact unique expression index on an md5→uuid leg key (~1 GB)."* |
| **whose only table operation is** | `ALTER TABLE nba_market.board_snapshots DROP CONSTRAINT IF EXISTS board_snapshots_pkey` |

✅ **The script that ACTUALLY builds board tiers is `nba/build_board_tiers_v2.py`** *(`TRUNCATE` +
`INSERT INTO nba_market.board_tiers_v2`, "four-way taxonomy, both anchor cases")* — **and it is
invoked by `nba-engine-test.yml` ALONE.**

> 🔴🔴🔴 **`nba_market.board_tiers` — `2,199,354` rows, `378` dates, `2024-10-22 → 2026-04-12` — IS
> READ BY FOUR SCRIPTS AND WRITTEN BY NONE.** *Readers: `apply_ladder_calibration.py` ·
> `backtest_tier_selection_value.py` · **`build_confidence_v3.py` (P2 step 18)** ·
> **`build_rung_market.py` (P3 step 8)**. Writers, probed as `INSERT INTO` · `CREATE TABLE` ·
> `TRUNCATE` · `COPY` · `UPDATE` across every `.py` in `nba/` and `nba/baseline/`: **ZERO**.*

⇒ ***The tier classification P3's own comment says "the score and the slip engine both need" is
produced by nothing on the game-day path; `board_tiers` is a frozen historical snapshot and P2 and P3
read it on every run.*** ⚠ **P3 also runs a script documented as ONE-OFF MAINTENANCE on every game
day** — *its safety rules are sound (new unique index first, old PK dropped only after `indisvalid`,
row counts compared), so the risk is **waste and wrong-step, not destruction**.*
📌 **Open item T20-7 carries the decision. ⚠ RECORDED, NOT FIXED (rule 1).**

### A3 · ✅ THE READ EDGE — *no dead ends, and the blast radii*

> **`116` scripts · `41` tables seen — `33` written, `41` read** *(2026-09-22T15:58:08Z;
> `scratchpad/t20/readedge.py`)*.
> ✅✅ **WRITTEN BUT NEVER READ: `0`.** ***Every table this pipeline computes is consumed — the graph
> has no dead ends.***

**Read fan-out of the six tables `nba-engine-test.yml` co-writes** *(how far an overwrite reaches)*:

| table | readers |
|---|---|
| 🔴 `nba_score.final_hp` | **8** — `build_asof_calibration` · `build_confidence_v2`/`v3` · `build_final_hp` · `build_mondrian_confidence` · `certify_pipeline` … |
| `nba_score.confidence_model` · `confidence_verification` | **4** each |
| `nba_score.board_scored` · `availability_delta` · `conformal_confidence` | **2** each |

⚠ **NOT dangling inputs, recorded so a later pass does not re-flag them**: a SQL `FROM` probe
catches Python `from X import Y` — `build_availability_delta`, `nba_asof`, `scipy.sparse`,
`urllib.parse`, `build_baseline_history`, `classification_ladder_v12` are **imports, not tables**.
✅ `nba_config.external_credentials` has no programmatic writer **by design** — it is
manually maintained.

### B · 🔴 THE CERTIFIER IS ONE TABLE OFF FROM WHAT THE PIPELINES WRITE

| certifier check | asserts | the pipeline actually writes |
|---|---|---|
| 🔴 **P2** `baseline_history has today` *(+2 more)* | `nba_score.baseline_history` — **written by `load_baseline_history.py`, which P2 does NOT invoke** | ✅ **`nba_score.baseline_ladder`** *(206,237 rows, via `load_baseline_ladder.py`, step 15)* |
| 🔴 **P3** `final_hp has today` *(+2 more)* | `nba_score.final_hp` — **written by `build_final_hp.py`, which P3 does NOT invoke** | ✅ **`nba_score.board_scored`** *(via `score_board_legs.py`, step 10)* |
| ⚠ **P1** `player name map populated` | `nba_ref.player_name_map` — written by `check_baseline_board_coverage.py`, not P1 | *(legitimately an INPUT check)* |

🔑🔑 ***The certifier is not checking nothing — it is checking the SIBLING. P2 produces
`baseline_ladder` and is asked about `baseline_history`; P3 produces `board_scored` and is asked
about `final_hp`.*** ⚠ **That is a sharper statement than "the check has no writer", and it changes
the fix: the question is whether the pipeline should also build the asserted table, or whether the
assertion should name the table the pipeline builds.** 📌 **Open item T20-6 carries the decision.**

### C · 🔴 THE `17` TABLES WITH MORE THAN ONE WRITING WORKFLOW

| writers | table | workflows |
|---|---|---|
| **4** | `nba_market.board_snapshots` | `nba-board-archive` · `nba-board-backfill` · `nba-boards-market` · **P3** |
| **3** | `nba_score.ladder_calibration_asof` | `nba-absence-panel` · **P2** · `nba-score-history` |
| **3** | `nba_score.baseline_history` | `nba-baseline-history` · `nba-combos-history` · `nba-periods-history` |
| **3** | `nba_score.confidence_verification` | `nba-absence-panel` · `nba-engine-test` · **P2** |
| **3** | `nba_market.rung_market` | `nba-board-maintenance` · `nba-boards-market` · **P3** |
| **2** | `final_hp` · `conformal_confidence` | `nba-absence-panel` · `nba-engine-test` |
| **2** | `board_scored` · `availability_delta` | `nba-engine-test` · **P3** |
| **2** | `confidence_model` | `nba-engine-test` · **P2** |
| **2** | `board_outcomes` | `nba-grader` · **P2** |
| **2** | `baseline_ladder` · `baseline_ladder_runs` | `nba-overnight-queue` · **P2** |
| **2** | `blowout_model` | `nba-absence-panel` · **P2** |
| **2** | `defender_ratings` | `nba-absence-panel` · **P1** |
| **2** | `referee_assignments` | **P2** · `nba-referees` |
| **2** | `player_name_map` | `nba-board-maintenance` · `nba-overnight-queue` |

⚠⚠ **THE RISK IS NOT THEORETICAL.** *The storage-diet plan's first rule is **"execute only when no
build is running — the loaders delete-and-rewrite under an advisory lock"**, and P2's own comment
records the consequence: **"Passing one season made the builder delete EVERY season and rebuild one;
on 2026-09-20 03:24 UTC that wiped the whole calibration history."*** 🔑 ***That was
`ladder_calibration_asof` — a THREE-writer table.***
🔴🔴 **AND `nba-engine-test.yml` IS A CO-WRITER OF SIX OF THEM** *(`final_hp`, `board_scored`,
`confidence_model`, `availability_delta`, `conformal_confidence`, `confidence_verification`)* **and
also invokes `run_storage_diet.py`.** ⚠ *Whether that path is gated inside the script is NOT
RECORDED — the invocation was read, not the guard.*

### D · ✅ NOT ORPHANS — *recorded so a later pass does not re-flag them*

**Libraries, imported rather than invoked**: `nba_names.py` *(imported by **27** scripts)* ·
`nba_season.py` *(**19**)* · `nba_asof.py` *(**3**)*.
**Invoked from a working directory, not the repo root**: `build_training_data.py` ·
`train_models.py` · `validate_factor_coefficients.py` — **all three exist in `gbdt_training/`** and
`gbdt-training.yml` `cd`s before calling them.
**Deliberately unwired**: `build_absence_panel.py` / `_v2` / `_v3` *(their tables were dropped —
§T20.29)* · six `probe_*.py` diagnostics · two `load_pp_*.py` *(the concurrent session's)*.

### E · ⚠ MLB RESIDUE VISIBLE IN THE MAP

**`gbdt-training.yml`** — *"AlphaDog v2 GBDT Model Training"*, **`cron: "0 9 * * 0"` (Sundays 09:00
UTC), `seasons` default `'2025,2026'`** — **enabled and firing, on a repo whose NBA P2 and P3 have
no cron at all.** 📌 *Read beside open item T20-3's two enabled MLB rows in `config.scheduled_jobs`.*

---

## 0.0000 🔴🔴🔴 **THE THREE PIPELINES, AND THE OWNER'S EXPLICIT CRON INSTRUCTION — *SET IT ON ONE, NOT ON THE OTHER TWO*** *(T18 pass 0, §T18.1, owner, 2026-09-19)*

⚠⚠ **This is an operational instruction with a deadline attached, and it is the opposite of what a
reader would assume from "the pipelines are built".**

| # | Pipeline | Schedule | **CRON?** |
|---|---|---|---|
| **1** | **WEEKLY STATIC** — *"already configured, not running yet"*; catches **team changes** | *"once a week… maybe **12 every Monday**"*, chosen so it **does not clash with the daily heavy run** | ✅ ***"You can already SET THE CRON."*** |
| **2** | **HEAVY OVERNIGHT DELTA** — mines the game logs daily, then the classification and baseline calculations | **from 1 a.m.** *(the owner's "good wiggle room" against the Monday weekly run)* | 🔴 ***"DO NOT schedule cron just yet, because it's not going to have data to run until the beginning of the season."*** |
| **3** | **LIGHT EARLY-AFTERNOON** — daily mining, daily factors, final scoring engine, final HP, confidence, score | **1:15–1:30 PM PT** *(§0z-7 of `NBA_SYSTEM_DESIGN.md`)* | 🔴 ***"And it's going to be the same for pipeline 3."*** |

🔑🔑 **THE DELTA CONSTRAINT ON PIPELINE 2, IN HIS WORDS**: ***"remember that it's a DELTA SETUP, so
it's a COMPLEMENT day by day. And **CANNOT HAVE GAPS — has to cover ALL teams, ALL players, ALL
games**."*** ⚠ **A delta pipeline with a gap silently under-reports forever, because nothing
re-derives the missing day.**

⚠ **AND BOTH DAILY PIPELINES CARRY THE FULL SET, NOT A SPLIT**: *"for BOTH of the pipelines, you
understand that you have to put **ALL the mining steps PLUS all the scoring steps, the calculation
steps, for BOTH of them**."* 🔑 **Plus the coverage audit he orders**: *"**identify in the
documentation EVERY SINGLE FACTOR** for the baseline pipeline and **every single factor** for the
final scoring engine pipeline. **Be sure that you have a WORKER THAT MINES EACH ONE**… they are ready
for when the season comes up, **nothing missing, all the calculation steps there.**"*

✅ **VERIFICATION IS SPECIFIED AS A PARITY TEST, NOT A SMOKE TEST**: *"get a game day that's coming up
on the new schedule and simulate it… **you can also get one day from the PAST that we already have a
baseline calculation and also the final scoring calculation, and run it END TO END and see if it
MATCHES the data that we already have — BECAUSE IT NEEDS TO.**"* ⚠ *(open item **T18-3**: NOT RECORDED
whether it was run.)*

### 🔴 **A SEPARATE NBA SCRAPER — "NOTHING INTERTWINED WITH MLB"**

> ***"Create a NEW scraper for NBA, use the same structure proven to work. **Create a SEPARATED WORKER
> for all boards and market as well — NOTHING INTERTWINED WITH MLB.**"***
>
> ***"Look at the MLB scraper and be sure the system is ready for the **goblins and demons, MORE and
> LESS, UNDER and OVER the anchor, the VISIBLE REGULAR LINE ANCHOR and the INVISIBLE ANCHOR SWITCH
> LINE**, plus all the ladder — also the same for all apps. **You have done this work already! It must
> all be in the history, transcripts and documentation.**"***

⚠⚠ **THE ISOLATION REQUIREMENT IS THE INSTRUCTION, and it is stated twice.** 🔑 **And the owner's
remedy for the rebuild is the transcript archive**: *"**you already did the whole work, it's in the
transcripts — you just need to wire NBA with exactly the same logic**"* and *"**find the proper
transcript. We cannot waste all the time we already did on this! All the work is pretty much
done.**"* ⚠ *Recorded because it is the same instruction that produced this documentation sweep
(`NBA_SYSTEM_DESIGN.md` §0z-7) — **the owner treats the transcripts as the system's authoritative
memory, and asks for re-derivation from them rather than re-invention.***

---

## 0.000 🔴 **EDITING A WORKFLOW FILE RIGHT AFTER DISPATCHING IT CANCELS THE RUN — and a CANCELLED run is not a FAILED one** *(T15 pass 3, §T15.4c, from the 2026-09-12/13 transcript)*

*Verbatim from the transcript, and it is the operator diagnosing himself:*

> 🔴 ***"I CANCELLED MY OWN JOB. Editing the workflow TWICE right after dispatching it tripped the
> CONCURRENCY GROUP and killed the run. The fix is trivial — FINISH EDITS, THEN DISPATCH — but it
> cost a cycle."***
>
> ***"…was CANCELLED at 07:42, NOT FAILED — my two rapid workflow edits triggered the concurrency
> group and killed the run I'd just dispatched. My own edits RACED THE JOB."***

⚠⚠ **THE READING TRAP, AND IT IS WHY THIS IS RECORDED**: **a self-cancelled run appears in the run
list with a non-success conclusion**, so **an operator reading only the conclusion column diagnoses a
broken job and re-debugs code that was never the problem.** 🔑 **The distinguishing evidence is the
CONCLUSION VALUE — `cancelled`, not `failure` — and the timestamp's proximity to the workflow-file
commits.** *Probed 2026-09-22: **0 of the twelve and 0 of the thirty** carry this distinction.*

✅ **Concurrency groups themselves are well documented here** *(9 of the thirty, 8 of the twelve —
including `nba-engine-test.yml` having its own group)*. **What was missing is the FAILURE MODE they
create**: *the group exists to stop two runs colliding, and a dispatch followed immediately by an edit
to the same workflow file is exactly two runs colliding — with the operator on both sides of it.*

🔑 **THE RULE, in the transcript's own words: FINISH THE EDITS, THEN DISPATCH.**

---

## 0.001 ✅ **THE MECHANISM FAILURE CENSUS FOR T15 CAME BACK EMPTY AGAINST THE PROSE** *(T15 pass 3, §T15.4c — the first time in this sweep)*

*The mechanism strata are **868 of T15's 1,098 segments (79%) — the largest share in the corpus**.
The census's question was §T14.3b's: **what failed here that the prose did not record?***

| # | Failure signature in the mechanism strata | Recorded in the prose? |
|---|---|---|
| 1 | **`NOT NULL` violation on the board archive** — *"Failing row contains (2026-09-12, **null**, routine, …, underdog, player_total_runs, LAD @ MIA Total Runs O/U, Over, 8.5, −118, …)"*, `exit code 1` @ 2026-09-12T23:21:54Z | ✅ **YES** — *"`event_id` is not null and live boards have no odds-api event id. Synthesising a stable one."* |
| 2 | **`ValueError: could not convert string to float: ''`**, `exit code 1` @ 23:26:18Z | ✅ **YES** — the Fliff empty-line bug *(`NBA_SYSTEM_ARCHITECTURE.md` §0f-4)* |
| 3 | **Postgres cast error** — *"HINT: You will need to rewrite or cast the expression"*, `exit code 1` @ 2026-09-13T00:48:56Z | ✅ **YES** — *"Fliff sends `event_start_utc` as epoch MILLISECONDS while the column expects a timestamp."* |
| 4 | **`KeyError: 'Column not found: dreb36'`**, `exit code 1` @ 2026-09-13T01:33:57Z | ✅ **YES** — *"the `g` groupby was created BEFORE `dreb36` existed, so it can't see the column. Rebinding it."* |
| 5 | **the self-cancelled run** *(§0.000 above)* | ✅ **YES**, and diagnosed in full |

✅✅ **FIVE FAILURES, FIVE PROSE ENTRIES — T15's account of its own mechanism is COMPLETE.** ⚠ **That
is the INVERSE of T14's census result**, and it is a finding about the transcript rather than about
the system: *T15 is the candid one.* 🔑 **The failure that matters is therefore NOT in this table** —
**it is the class §T15.3a opened: a write that SUCCEEDED and lost something.** *The census cannot see
those (§T14.3b), and `exit code 1` is precisely the signal they do not produce.* ⚠ **Pinned
2026-09-22: `##[error]Process completed with exit code [1-9]` = **8 raw occurrences → 4 distinct
causes**; `Killed` = 15, of which **2 are the self-cancellation** and the rest quote T14's OOM
incident as context, not new failures.** *All four distinct causes are Fliff-or-archetype work; none
is unexplained.*

---

## 0.00 ⚠⚠ THE HARDCODED-SEASON LITERAL, AND THE GREP TRAP THAT HIDES HALF OF IT
*`[LIVE-AUDIT]` 2026-09-21 (T7 pass 28).*

**Seven NBA workers carry a hardcoded `2025-26`, and the quote style predicts the defect exactly:**

| Quote style | Workers | Meta-season fallback |
|---|---|---|
| **`'2025-26'`** (single) | `alphadog-v2-nba-static-onoff.js` · `-player-bio.js` · `-player-tracking.js` · `-team-stats.js` | **NONE — all four** |
| **`"2025-26"`** (double) | `-backfill.js` · `-game-officials.js` · `-starter-status.js` | **present — all three** |

⚠ **The trap**: a grep for `'2025-26'` returns **exactly the four broken workers**; a grep for
`"2025-26"` returns **exactly the three fixed ones**. **Either single-style grep gives a clean,
complete-looking answer that is wrong by construction.** **Search for both quote styles — or for
`20[0-9][0-9]-[0-9][0-9]` — whenever re-auditing this.**

✅ **The four with no fallback are the ones that matter**: their targets
(`player_onoff_profile`, `nba_ref.players`, `player_tracking_profile`, `nba_team.season_profile`)
have **no season in the primary key**, so from 2026-10-01 they stamp `'2025-26'` onto whatever the
scraper fetched for an empty `2026-27` and **upsert it over last season's real row** —
`NBA_OPEN_ITEMS.md` **O4**.

## 0.0 ⚠ THE COMPLETE SCHEDULE SURFACE — **seven scheduled workflows touch `nba/`, not four**
*`[LIVE-AUDIT]` 2026-09-21 (T7 pass 24). Enumerated from the workflows directory — the authority —
not from the `nba-` filename prefix, which is what produced the wrong count in the first place.*

**~~39~~ → `40` workflows exist; ~~33~~ → `34` are `nba-`-prefixed; seven scheduled ones touch `nba/`:**

> 🔁 **RE-DERIVE, DO NOT QUOTE** *(added `2026-09-23`, `§T22.29` — the owner's standing rule: publish
> only figures that stay true, or that carry their own date and a one-line recipe)*:
> ```bash
> ls .github/workflows/*.yml | wc -l                 # total
> ls .github/workflows/nba-*.yml | wc -l             # nba-prefixed
> grep -l "^ *- *cron:" .github/workflows/*.yml      # every ACTIVE cron, by file
> ```
> 📊 **Last re-derived `2026-09-23`: `40` total · `34` `nba-`-prefixed · `9` files carry an active
> `cron:` line** *(the seven below plus `gbdt-training.yml` and `scrape.yml`, neither of which touches
> `nba/`)*. ✅ **The seven-row table below reproduced exactly, cron for cron.** ⚠ *The totals moved
> `+1` each in two days; **the table did not move at all.** 🔑 **The composition is stable and the
> COUNT is not — which is why the count now carries a command and the table does not need one.***

| Workflow | Cron (UTC) | Cadence |
|---|---|---|
| `nba-scrape.yml` | `0 9 * * 1` | **Mondays 09:00** — the weekly static scrape |
| `nba-p1-weekly-static.yml` | `0 19 * * 1` | **Mondays 19:00** — the weekly static layer |
| `nba-referees.yml` | `30 15 * * *` | daily 15:30 |
| **`fliff-board.yml`** | **`35 */2 * * *`** | **every 2 hours** — runs `nba/scrape_fliff_board.py` |
| **`sleeper-board.yml`** | **`15 */2 * * *`** | **every 2 hours** — runs `nba/scrape_sleeper_board.py` |
| **`underdog-board.yml`** | **`25 */2 * * *`** | **every 2 hours** — runs `nba/scrape_underdog_board.py` |
| *`nba-pp-payout-map.yml`* | *`15 */6 * * *`* | *concurrent session — **out of scope*** |

⚠ **The three board workflows are documented as workflows in several files; their every-two-hours
cadence is recorded in none of the thirty.** They are also **not `nba-`-prefixed**, which is why a
prefix-based enumeration misses them — *the fifth single-pattern count in this sweep.*
✅ **None of the three imports the season helper** (verified), so they are outside the
`active_stats_season()` rollover exposure (`NBA_OPEN_ITEMS.md`, O4).

## 0. THE FOUR-STEP WIRING PATTERN *(established T2)*

Every Cloudflare worker must be registered in four places or it will not deploy or run:
1. `nba/worker_manifest_nba.json`
2. `generate_wrangler_configs.py` — the isolated NBA branch
3. `alphadog-v2-admin-sql.js` — **bindingMap + dispatch branch + tool-schema enum** (all three)
4. `nba_config.worker_definitions` — a registry row

**`admin-sql` must deploy LAST** (the fleet deploys alphabetically from the file diff).

---

## 0.14 ⚠ THE SHARED DISPATCH PATH CARRIES AN UNSTATED INVARIANT
*Recorded 2026-09-20 (T1 pass 87). **VERIFIED** by live grep of the deployed
`alphadog-v2-admin-sql.js`.*

The bridge's dispatch chooses its HTTP method on one line, **shared by every target, MLB included**:
```js
const method = body === null ? "GET" : "POST";
```
**That line was added by T1 for one NBA job mode** — `job === "probe-sources"`, the read-only GET
diagnostic. **✅ It is safe today, and verifiably so**: `body = null` occurs **exactly once in the
file, at line 683**, inside the NBA branch; **all eleven MLB branches assign an object.**
⚠ **The safety is an invariant nobody wrote down**: *no MLB branch may ever set `body = null`.*
**If one does, that target silently becomes a GET with no body.** → `NBA_OPEN_ITEMS.md`
*FROM T1 PASS 87*.

---

## 0.15 ⚠ THE DISPATCH ENUM AND THE SECOND PER-WORKER MODE
*Recorded 2026-09-20 (T1 pass 46). **VERIFIED by grep of the live `alphadog-v2-admin-sql.js`.***

**The bridge routes 21 NBA bindings directly** — `NBA_STATIC_TEAMS_WORKER`,
`NBA_STATIC_PLAYERS_WORKER`, `NBA_STATIC_ARENAS_WORKER`, `NBA_STATIC_OFFICIALS_WORKER`,
`NBA_STATIC_PLAYER_BIO_WORKER`, `NBA_STATIC_PLAYER_TRACKING_WORKER`, `NBA_STATIC_TEAM_STATS_WORKER`,
`NBA_STATIC_ONOFF_WORKER`, `NBA_STATIC_DARKO_WORKER`, `NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER`,
`NBA_STATIC_SCHEDULE_WORKER`, `NBA_STATIC_PLAYTYPES_WORKER`, `NBA_STATIC_TRACKING_DETAIL_WORKER`,
`NBA_STATIC_SHOTQUALITY_WORKER`, `NBA_STATIC_BACKFILL_WORKER`, `NBA_STATIC_STARTER_STATUS_WORKER`,
`NBA_STATIC_GAME_OFFICIALS_WORKER`, `NBA_STATIC_LINEUPS_WORKER`, `NBA_DAILY_DELTA_WORKER`,
`NBA_STATIC_MEASURE_TYPES_WORKER`, `NBA_BASELINE_LADDER_WORKER`.

**The code's own note on that branch** — the no-orchestrator rule, implemented:
> *"NBA expansion (additive only). Same direct-call pattern as `BASE_HITTER_GAME_LOGS_WORKER` —
> **bypasses `control_job_queue` + orchestrator entirely (NBA has no orchestrator by design)**."*

**⚠ Every one of the 21 accepts a second mode this document's mode-dispatch table does not list:**
| `job` | Route |
|---|---|
| **`probe-sources`** | **`https://internal/probe-sources`** |
| anything else (e.g. `run`) | the worker's default run path |

**`run_job` also carries 14 non-dispatch job modes** — a diagnostic and ingestion surface including
**`worker_invocation_logs`**, the only tool that can tell a worker that *failed* from one *never
invoked* from one **Cloudflare killed**. Full table: `NBA_SYSTEM_ARCHITECTURE.md` §3b.
⚠ **`nba/NBA_AVAILABLE_TOOLS.md` still lists the pre-wiring enum — 12 MLB targets, zero NBA.**

---

## 0.2 ⚠ THE FOUR WIRING STEPS HAVE DIFFERENT DEPLOY BLAST RADII
*Recorded 2026-09-20 (T1 pass 44). **VERIFIED by grep of the live `generate_wrangler_configs.py`.***

§0's four-step pattern is performed for **every** new NBA worker. **The four edits are not
equivalent in cost:**

| Edit | Blast radius |
|---|---|
| any file in **`GLOBAL_REDEPLOY_FILES`** | **full-fleet redeploy — 140+ workers** |
| **`generate_wrangler_configs.py`** | **deliberately excluded** from that set → only the affected worker(s) |
| **`worker_manifest.json`** (via `TARGETED_EXTRA_FILES`) | targeted: the new worker **+ the orchestrator** |

The generator says so in its own comment:
> *"`generate_wrangler_configs.py` is **intentionally NOT** in `GLOBAL_REDEPLOY_FILES`. It gets
> edited routinely just to register a single new worker … and that should only redeploy the
> worker(s) actually affected — **not force a full-fleet redeploy of 140+ workers every time.**"*

**140+ is the fleet size** — recorded nowhere else in the twelve documents.
⚠ **Why this matters for NBA specifically**: an edit that lands in `GLOBAL_REDEPLOY_FILES` by
accident **redeploys the entire MLB fleet** — the loudest possible violation of the owner's *"must
not edit anything from the mlb system."*

### ⚠ And the generator carries an NBA-only path special-case, with a named failure
Live, lines 45–51:
> *"The generated config for an NBA worker is written to `nba/wrangler.<worker>.jsonc` … `"main"`
> relative to that same `nba/` directory — **it must NOT be re-prefixed with `nba/` here or wrangler
> looks for `nba/nba/<worker>.js` and fails (`"entry-point file … not found"`).**"*

**The `startswith("alphadog-v2-nba-")` guard does two jobs**: MLB isolation (recorded elsewhere) and
**path resolution** (recorded here for the first time). **Any future edit to it risks both.**

---

## 0.23 🔴 THE INJURY ARCHIVE CHANGES FILENAME PATTERN MID-SEASON — and the first backfill silently captured only the later half
*Added 2026-09-21 from T11 (§T11.3c). **Past bug with its fix; the shape is the one that keeps
recurring.*** ⚠ **Novelty corrected 2026-09-21 by §T11.6a: this is NOT new across the thirty —
`NBA_PROJECT_LOG.md` line 502 already records it, fix and all. It is new to the TWELVE, which is why
the entry stays here.**

🔴 **What happened**: the run produced **266,049 rows and 2,218 snapshots — but only from
22 December onward.**

**Cause**: **before ~2025-12-22** *(corrected 2026-09-21 by §T11.6a — this read 2026-12-22, a year
out; the season is 2025-26 and `NBA_PROJECT_LOG.md` line 502 gives the date)* **the NBA's
injury-report archive used an HOURLY filename with no
minutes** — `06pm`, `12pm`, even `12am` — **and the true publish time appears only in the document
header** (*"Injury Report: 11/24/25 12:30 PM"*). **The 15-minute filename pattern begins 22 December.**
A scraper written against the 15-minute pattern therefore finds nothing before that date **and
reports success.**

✅ **The fix, three parts**: **probe BOTH filename patterns** · take the snapshot timestamp from the
**document header**, not the filename · **drop consecutive duplicate documents by content hash.**

🔑 **And the volume it revealed**: **the league republishes the report 10–27 distinct times per day** —
genuine intra-day snapshots, *"excellent for the enrichment cutoffs"* — which pushed the single
season file to **98 MB** and forced the **monthly-shard-with-index** layout this document already
describes. *The as-of loader and both builders read the shards; the workflow size-guards commits.*

⚠⚠ **The recurring shape, stated plainly: a run that finds inputs, writes a quarter of a million rows
and reports success can still be missing an entire half of the range.** ***A healthy row count is not
coverage — only a date-range check is.***

---

## 0.24 🔴 VALIDATE A PARSER ON **THE RUNNER'S OWN EXTRACTION**, NOT ON YOUR OWN
*Added 2026-09-21 from T11 (§T11.2c). **The transcript states the lesson; no document carried it.***

🔴 **What happened**: the injury-report backfill **scanned all 176 days, found every PDF, and wrote
ZERO rows.** Two diagnostic runs on the runner pinned it — **the CDN serves the files correctly (200,
PDF, S3, with or without the proxy), and `pdfplumber` ON THE RUNNER drops the spaces inside cells**:

```
detroitpistons cunningham,cade questionable
injury/illness-rightknee;surgery
```

**So the team-name regex failed on every row**, and the job reported success with nothing written —
**the silent-failure shape this documentation set names again and again.**

⚠⚠ **Why the self-test missed it, and this is the transferable part**: *"my self-test had passed on
text extracted by a **different tool**."* ***A parser validated against one extractor is validated
against that extractor, not against the file.*** **Every NBA parser runs on a GitHub Actions runner
whose library versions are not the ones a local check uses.**

✅ **The fix, verified on both text shapes — 10 rows from the collapsed text, 24 from the spaced
fixture**: a **space-insensitive team regex with canonical names**, a **tolerant header regex**, and
**`split_camel()`** to recover the dropped spaces.
✅ **And it produced the diagnostic this document already describes**: **`injury mode=probe`** — CDN
status, `pdfplumber` text, parsed row count, extracted table. *📌 The probe mode is in three of the
twelve; **the bug that caused it was in none of them** until this entry.*

**Operative form: a parser's fixture comes from the runner, through the same library the job will
use — and a run that finds its inputs and writes zero rows is a parser failure until proven otherwise.**

---

## 0.25 ⚠ THE PRE-COMMIT SYNTAX GATE — the only local check before an auto-deploying push
*Recorded 2026-09-20 (T1 pass 38). **VERIFIED** from T1's own `bash_tool` history.*

| Language | Gate |
|---|---|
| Worker JS | **`node --check <file>.js && echo SYNTAX_OK`** |
| Scraper Python | **`python3 -m py_compile <file>.py && echo SYNTAX_OK`** |

Run immediately before the commit. **A push to `main` auto-deploys and there is no staging
environment**, so this is the last cheap point. **It catches syntax only** — not a missing binding,
not a wrong column name, not an unwired dispatch branch, which are what §0's four-step pattern
exists to prevent. *(`NBA_RECIPE.md` had recorded only the `node --check` half.)*

### ⚠ EXTENDED 2026-09-21 (T3 pass 4) — a stronger gate exists and was used once
**T3 ran a second check the others do not**: after `py_compile`, it executed the scraper's real
extraction function **against a captured HTML fixture** and asserted on a known value —

```
python3 -m py_compile scrape_nba_darko_v2.py && echo SYNTAX_OK
python3 -c "... players = extract_players(html); print([p for p in players if p['nba_id']==203999])"
```

— `203999` being Jokić's real NBA person ID. **That is a functional test against real captured data,
run before the commit that auto-deploys**, and it is why the DARKO extraction shipped working on its
first live run after two failed pagination attempts.

**It was used for this one scraper and is not part of the standing pattern.** The gate for every
other worker remains syntax-only. *The ingredient that made it cheap was already on disk: the
scraper's own committed debug artifact (see `NBA_OPEN_ITEMS.md` FROM T3 PASS 2) is the fixture.
Any scraper that commits its raw source page can be tested this way for the cost of one command.*

---

## 0.26 ⚠ THE DEPLOY-SCOPE ANCHOR — `deployed_sha.txt`, and how it silently drifts
*Recorded 2026-09-20 (T1 pass 88). **VERIFIED** by direct read of
`.github/workflows/alphadog-v2-github-auto-deploy.yml` (lines 7–16, 55, 87–116) and
`github_mobile_deploy_workers.py`, both live on `main` today.*

**`git_changed_files()` does not diff against `HEAD~1`.** It diffs against the SHA stored in
`deployed_sha.txt` — **the last commit that actually finished a successful deploy.** Deploy scope
is therefore **cumulative since the last success**, not per-commit. Three consecutive failed
deploys followed by a successful one deploy everything touched across all four.

**The writer** is the workflow's last step:

```yaml
- name: Record last successful deploy marker
  if: success()
  run: |
    git rev-parse HEAD > deployed_sha.txt
    git add deployed_sha.txt
    git commit -m "Auto: record last successful deploy marker [skip ci]" || true
    git push || true
```

**`if: success()` is correct** — the marker only advances on a real success, which is exactly what
makes it an honest anchor. **`git push || true` is the problem.** The deploy workflow pushes to
`main` at the same time as every other bot job in this repo. **If that push is rejected, the marker
stays at the older SHA, the step still reports success, and the NEXT deploy silently widens its
scope to everything since that older commit.** No error, no log line, nothing in the run summary.
The failure mode is a deploy that is quietly *larger* than intended — the same class of surprise as
the `GLOBAL_REDEPLOY_FILES` full-fleet trigger, but with no marker in the code to warn you.

**The same repo already contains the correct pattern.** `nba-scrape.yml`'s commit step (lines
151–161) retries the push **five times**, with `git fetch origin main`, `git rebase origin/main`,
a jittered `sleep $((RANDOM % 5 + 2))` between attempts, and a hard `exit 1` if all five fail —
which is also why its checkout needs `fetch-depth: 0` and `persist-credentials: true`. **Two
workflows in one repo with opposite push-failure discipline, and the one that swallows is the one

> 🔴🔴 **AND A THIRD WORKFLOW SWALLOWS TOO — `nba-daily-delta.yml`, `T20-10`, and this page named `daily-delta` only as a job.** *Added here T20 pass 78 (§T20.83), 2026-09-22.* ▶ **`.github/workflows/nba-daily-delta.yml:52–54`, verbatim:**
> ```
> python nba/sync_season_files_from_delta.py || echo "season-file sync failed"
> python nba/scrape_nba_periods.py           || echo "periods refresh failed"
> python nba/scrape_nba_schedule.py          || echo "schedule refresh failed"
> ```
> 🔴 ***Three steps, three swallows: the workflow can produce nothing and still report success — `SILENT`, and no certifier covers it.*** ⚠ **Note which scripts these are: `scrape_nba_schedule.py` is the refresher for `nba_calendar.games`, the table recorded as **not refreshed since the day it was built** — *a silent failure here is exactly how that state persists unnoticed*. **NOT RECORDED whether it is the cause** (rule 6).** ▶ **Full item: `T20-10` in `NBA_OPEN_ITEMS.md`; re-derived and HELD at §T20.75, `2026-09-22T19:25Z`.** ⚠ *Documented, not fixed (rule 1).*
whose failure corrupts deploy scope.** *Not fixed — recorded per the sweep's read-only rule.*

### The manual override nobody has written down
`workflow_dispatch` on the deploy workflow takes a **required** `deploy_scope` input, `type: choice`,
default `changed`, options **`changed` · `all` · `control-room` · `orchestrator`**, threaded through
as `DEPLOY_SCOPE: ${{ github.event.inputs.deploy_scope || 'changed' }}` and passed to
`python github_mobile_deploy_workers.py --scope "$DEPLOY_SCOPE"`.

**A push always gets `changed`.** `all` is reachable *only* by dispatching the workflow by hand.
**This is the escape hatch for exactly the drift described above** — and it appears in none of the
twelve documents, so anyone hitting a stale anchor would have had no idea it existed.

---

## 0.27 ⚠ DEAD D1 PROVISIONING STILL RUNS ON EVERY DEPLOY — including every NBA deploy
*Recorded 2026-09-20 (T1 pass 88). **VERIFIED** against live `main`: workflow lines 87–99 and
`generate_wrangler_configs.py` lines 13–22, 84.*

Every deploy — NBA ones included — runs two ungated steps before anything is deployed:

1. **`Ensure Scoring DB exists (idempotent, real D1 provisioning)`** → `python ensure_scoring_db.py`
2. a commit step that `git add`s `cloudflare_d1_bindings.json` and `scoring_db_debug.log`, commits
   them `[skip ci]`, `git push || true`, then `rm -f scoring_db_binding_changed.flag`

**Nothing reads the output.** `generate_wrangler_configs.py` line 13 is `D1_BINDINGS = []`, carrying
the 2026-08-12 note that **all twelve D1 databases were confirmed deleted by direct query**
(`CONTROL_DB … SCORING_DB` all return *"D1 database has been deleted"*). Line 22 — the
`json.loads(Path("cloudflare_d1_bindings.json")…)` that once populated it — **is commented out.**
Line 84 gives every generated config `"d1_databases": []` unconditionally.

So the pipeline provisions a D1 database, writes a bindings file, commits it and pushes it to `main`,
and **the generator ignores all of it.** Cost per deploy: one dead provisioning call and one junk
commit. **No correctness impact on NBA workers** — they are Hyperdrive/Postgres only and get an
empty `d1_databases` like everything else — but it is live dead weight in the path every NBA deploy
goes through, and it is one of the bot commits the scrape workflow's retry ladder is racing against.

**Each successful deploy therefore adds up to TWO bot commits to `main`** (scoring-DB artifacts +
the deploy marker), both `[skip ci]`, both `git push || true`. That is the background commit traffic
that makes §0.26's silent-drift scenario a real possibility rather than a theoretical one.

---

## 0.28 ⚠ `POST /run` CARRIES NO AUTHENTICATION — fleet-wide, and NBA inherited it faithfully
*Recorded 2026-09-20 (T1 judgment pass, pass 88). **VERIFIED** by grep of both live worker files.*

`nba/alphadog-v2-nba-static-teams.js` line 426:

```js
if (method === "POST" && path === "/run") {
  const input = await readJsonSafe(request);
  try { return jsonResponse(await runStaticTeams(input, env)); }
```

**There is no token check before it.** `ADMIN_TOKEN` and `INTERNAL_TOKEN` appear **zero times** in the
file; the only `Authorization` header in it is the *outbound* one this worker sends to the GitHub
contents API (line 122). An unauthenticated `POST` with an empty body runs the full job — 30 rows
into `nba_ref.teams`, 157 into `nba_ref.team_aliases`.

**This is the house pattern, not an NBA defect.** MLB's `alphadog-v2-static-teams.js` line 412 is
byte-for-byte the same shape, also with no token check (its only other `POST` route is
`/diagnostic`, equally open). **Recorded here so nobody reads the NBA worker in isolation and
concludes NBA skipped a check MLB performs — it does not.** The four-step wiring pattern in §0.2
does not include an auth step because no worker has one.

**What this documentation can and cannot say.** **VERIFIED**: neither worker authenticates `/run`.
**NOT VERIFIED**: whether the `*.workers.dev` hostnames are actually reachable from the public
internet. T1 recorded the live URL
`https://alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev` after a successful deploy, but
whether that route is enabled, and whether any Cloudflare Access / WAF rule sits in front of it, is
an account-dashboard setting **this session has no read path to** — the MCP bridge exposes SQL,
GitHub and worker dispatch, not Cloudflare account configuration. **So the exposure is conditional:
if those routes are public, every writer worker in the fleet is an open write endpoint; if they are
not, the service bindings are the only path and this is a non-issue.**

**The owner is the only one who can close that question**, in the Cloudflare dashboard, per worker.
It is worth closing before the season opens on **2026-10-20** *(corrected 2026-09-21, §T10.18b — this
line read 2026-10-03, which is preseason opening night; the regular season opens 10-20)*, because the same shape will be on every
NBA writer built between now and then. *Not fixed — recorded per the sweep's read-only rule.*

---

## 0.29 ⚠ THE DEPLOY TRIGGER HAS NO PATH FILTER — `[skip ci]` is a convention, not a guard
*Recorded 2026-09-21 (T2 pass 1). **VERIFIED** by direct read of
`.github/workflows/alphadog-v2-github-auto-deploy.yml` on live `main`.*

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
```

**There is no `paths:` filter.** Every push to `main` — a worker edit, a scraper's data commit, a
one-line documentation fix — matches this trigger. T2 noticed the symptom and reasoned it out
correctly at the time: *"the auto-deploy workflow likely fired because it triggers on any push to
main, not just worker file changes — so the scraper's data commit landing on main pushed it to run,
even though it'll find no worker targets changed in scope."*

**What actually stops the storm is `[skip ci]` in the commit message**, and that is a convention
typed by whoever writes the commit, not a rule the workflow enforces. The repo's own bot commits all
carry it — `"Auto: Scoring DB provisioning attempt … [skip ci]"`, `"Auto: record last successful
deploy marker [skip ci]"`, `"Update NBA teams JSON [skip ci]"` — which is what keeps the pipeline
from recursing into itself. **One forgotten `[skip ci]` is one full deploy run.** This is the
mechanical reason behind the standing instruction that every documentation sync carries it.

**Blast radius when it does fire** is set by §0.26: scope comes from `deployed_sha.txt`, so a stray
push deploys everything changed since the last *successful* deploy, not just that commit.

### A step-condition asymmetry worth knowing
| Step | Condition | Consequence |
|---|---|---|
| `Commit Scoring DB binding/debug log` | **`if: always()`** | the dead D1 artifact from §0.27 is committed **even when the deploy failed** |
| `Record last successful deploy marker` | **`if: success()`** | the scope anchor advances only on real success — correct |
| `Remove generated secret file` | **`if: always()`** | `.alphadog_worker_secrets.json` is always cleaned up — correct |

**So a failing deploy still writes one junk commit to `main`.** *This sharpens §0.27, which recorded
the dead step but assumed it ran only on the success path.*

---

## 0.30 THE SERVICE-BINDING DEPLOY ORDER — a real bug, and the permanent fix
*Recorded 2026-09-21 (T2 pass 1), from T2's own diagnosis and fix.*

**Cloudflare requires the target worker to exist before another worker can bind to it.** T2 hit this
when `alphadog-v2-admin-sql` deployed with a fresh service binding to `alphadog-v2-nba-static-players`
— a worker that had not been created yet. The deploy failed on a bootstrapping order problem, not a
code error.

**The fix was structural, not a retry**: `alphadog-v2-admin-sql` moves to the **end** of the deploy
target list, because it is the worker with **outgoing** service-binding dependencies on everything
else. Dependencies deploy first; the binder deploys last. T2 recorded it as *"a real, permanent fix
for every future NBA worker."*

**Why it matters for every new NBA worker**: §0.2's four wiring steps add a binding to admin-sql in
the same commit that adds the new worker's `.js`. Without the ordering fix, that commit is
self-blocking — admin-sql tries to bind a worker the same run has not deployed yet. *The targets
order otherwise follows git's diff output, which is alphabetical-ish, and `alphadog-v2-admin-sql`
sorts near the front.*

---

## 0.31 ⚠ CERTIFICATION IS A HARDCODED ROW-COUNT THRESHOLD — and each worker picks its own
*Recorded 2026-09-21 (T2 pass 2). **VERIFIED** on live `main`:
`nba/alphadog-v2-nba-static-player-bio.js` line 86.*

```js
const certified = seasonWritten >= 400;
```

**A worker's `ok` / `certified` flag — the thing every caller reads to decide whether a run
succeeded — is a magic number compiled into the worker.** Not a config row, not a var, not derived
from the source. `400` is roughly two-thirds of the 582-player roster, chosen as "enough players
came back", and the only way to change it is an edit-and-deploy.

**Compare the pattern across the static writers:** the teams worker certifies on
`activeNbaTeams === 30` — an exact count with a real invariant behind it — while player-bio uses an
inequality against a round number. **Both are hardcoded; only one is anchored to a fact about the
world.** A roster that legitimately shrank below 400 would be reported as a failed certification,
and a scrape that silently returned 401 rows would certify.

**This is §0.3's founding-rule violation with a sharper edge**: §0.3 records that operating constants
are hardcoded; this one decides whether the system believes its own data. *Not fixed — recorded per
the sweep's read-only rule. It belongs in `nba_config.system_settings` with the rest.*

**Extended 2026-09-21 (T3 pass 3) — a third threshold, a third arbitrary number:**

| Worker | Certification test | Anchored to a real invariant? |
|---|---|---|
| teams | `activeNbaTeams === 30` | **yes** — the league has 30 teams |
| **arenas** *(T2)* | **`nba_ref_arenas_rows === 30`** | **yes** — one arena per team *(VERIFIED live, line 140)* |
| player bio | `seasonWritten >= 400` | no — ~⅔ of a 582 roster, rounded |
| **schedule** *(T3)* | **`written >= 1000`** | **no** — a season is 1,230 regular-season games, so this passes on a scrape missing up to 19% of them, and **passed on 2,666 rows spanning two seasons** |
| **tracking detail** *(T3)* | **`written >= 4000`** | **no** — the observed run wrote 4,652, so the margin is ~14%, and the scraper's own per-measure-type failure list is the real signal |

*Four workers, four unrelated numbers (2026-09-21, T3 pass 5). **The tracking-detail case is the
clearest waste**: that scraper already reports `per_type` counts and a `failed_types` list, so it
knows exactly which of its measure types came back empty — and the certification flag ignores all of
it in favour of one total.*

### ⚠ TWO DO IT PROPERLY, AND ONE CHECKS DATA QUALITY *(added 2026-09-21, T2 depth re-read)*
***VERIFIED** on live `main`, `nba/alphadog-v2-nba-static-players.js` line 253:*

```js
const certified = finalCounts.active_nba_players >= 400
               && finalCounts.active_players_missing_team_id < finalCounts.active_nba_players * 0.05;
```

**A row floor AND a <5% missing-team-id ratio.** This is the only certification in the NBA fleet that
asks whether the data is *usable*, not just whether there is enough of it. **A scrape returning 582
players with half their team IDs null passes every other worker's check and fails this one.**

*That materially softens this section's framing: the thresholds are not uniformly bare margins. Two
of the eight are anchored to real invariants (teams, arenas at `=== 30`), and two are compound —
this one on quality, the play-types writer on errors-plus-per-level floors. **The bare-margin
criticism applies to the remaining four**, and the counter-examples are all already in the codebase.*

### ⚠ AND ONE WORKER DELIBERATELY HAS NO FALLBACK, for a stated reason
The teams worker carries a certified 30-team static fallback. **The players worker deliberately
does not**, and says why:

> *"no hardcoded fallback for players (unlike the 30-team list) — a 450+ player roster changes too
> often and is too large to safely hand-maintain as a certified fallback. **If the real source
> fails, this worker fails honestly rather than silently writing stale/wrong data.**"*

**The principle is worth stating generally: a fallback is only safe where the data is small,
stable, and verifiable by hand.** 30 teams qualify; 582 players do not. *A hand-maintained player
fallback would decay silently between edits and be indistinguishable from a good scrape — which is
the failure mode the whole certification layer exists to catch.*

### ⚠ ONE WORKER DOES IT PROPERLY — the play-types writer *(added T3 pass 8)*
```js
const certified = errors.length === 0 && playerWritten >= 1000 && teamWritten >= 200;
```
**It gates on three things: no errors, and a floor per level.** Compare the other four, which gate on
a single total and therefore cannot tell a clean short run from a half-failed full one.

**This is the pattern the rest should follow**, and it already exists in the codebase — so the fix
for §0.31 is not a design question, it is copying a line from a sibling. *The play-types writer is
also the one whose scraper checks both levels before exiting non-zero (FROM T3 PASS 6), so the
discipline is consistent end to end for this one entity and absent for the others.*

**Three workers, three unrelated numbers, none in config.** The schedule case is the weakest: the
same constant has to serve a single-season scrape and a two-season one, so it was set low enough
that neither fails — which means it cannot detect a materially short scrape of either.

---

## ⚠ 0.42 ALWAYS TEST v3 BEFORE v2 — a rule the project paid for twice
*Recorded 2026-09-21, T7 re-sweep pass 3. Stated in T7, in no document until now.*

> *"**Always test v3 before v2** for any per-game stats.nba.com endpoint. This cost real time twice
> in a row — starter status, then officials — before the pattern was recognized and applied
> proactively for officials."*

**Both failures are documented individually; the rule extracted from them was not.**
`boxscoretraditionalv2` served HTTP 200 with zero player rows for historical games (799 rows across
31 of 1,230); `boxscoresummaryv2` carries an upstream warning about data availability after
**2025-04-10**. **v3 worked in both cases.** *(nba_api's own changelog flags the v2 cutoff — checking
the client's release notes before choosing a version is the cheap version of this rule.)*

⚠ **And the second time it was applied proactively** — the officials build tested v3 first, on a
sample, before committing to ~1,230 calls. **The discipline is in the code; only the rule was
missing from the documents.**

## 0.41 WHY THERE ARE SO MANY `nba-*.yml` WORKFLOWS — a stated principle, recovered from code
*Recorded 2026-09-21, T5 re-sweep pass 2. The rule was in a workflow header and in no document.*

`.github/workflows/nba-starter-status.yml`, in its own comment:
> *"standalone, targeted workflow — **deliberately not added as another step in `nba-backfill.yml`,
> which would force re-running all its earlier steps** (career totals…)"*

**In a workflow whose steps are expensive and sequential, adding a step is not free — it re-runs
everything before it.** `nba-backfill.yml`'s earlier steps include a 582-call career-totals scrape
and two full-season bulk pulls; appending a 1,230-call job would have meant paying all of that on
every retry. **So the job got its own workflow and its own trigger file.**

**This explains the file count** — **32 in-scope `nba-*.yml` workflows** (33 on disk; one,
`nba-pp-payout-map.yml`, belongs to a concurrent session and is out of scope). The proliferation is
**deliberate granularity, not sprawl.** Apply the same rule when adding future jobs: a new expensive
step belongs in its own workflow unless it genuinely shares the earlier steps' inputs.

## 🔴 0.39 `ok: certified` — THE `ok` FIELD IS THE CERTIFICATION VERDICT, ACROSS 18 WORKERS
*Recorded 2026-09-21, T2 pass 16. **`[LIVE-AUDIT]` VERIFIED** by grep of the worker sources.*

```js
return { ok: certified, status: certified ? "completed" : "completed_with_warning", ... }
```
**18 workers**: `static-teams` · `-players` · `-arenas` · `-officials` · `-player-bio` ·
`-player-tracking` · `-team-stats` · `-onoff` · `-darko` · `-schedule` · `-playtypes` ·
`-tracking-detail` · `-shotquality` · `-lineups` · `-game-officials` · `-starter-status` ·
`-backfill` · `daily-delta`.

**`ok` does not mean "the request succeeded"** — a run that fetched, parsed and wrote perfectly but
missed its threshold returns `ok: false`, **and no field means "the call worked."** ⚠ Only **7 of the
18** use `completed_with_warning`; the other 11 have no warning-status vocabulary.

⚠⚠ **And for teams it is circular**: §0.31 records the certification as
`active_nba_teams === 30 && aliases >= 100`; **the hardcoded fallback is a 30-team list, so serving
the fallback satisfies the check by construction.** The fallback trigger (`teams.length !== 30`) and
the certification (`=== 30`) share the same magic number and fail together. **Full entry:
`NBA_OPEN_ITEMS.md` (🔴🔴).**

## 0.36 `raw_json` IS WRITTEN AS A STRING BY EVERY STATIC WRITER — the column is unqueryable
*Recorded 2026-09-21, T2 re-read pass 11. **`[LIVE-AUDIT]` VERIFIED** across 1,306 rows / 6 tables.*

Every writer binds `${JSON.stringify(x).slice(0, N)}` into a JSONB column, producing a **double-encoded
JSON scalar string** rather than an object. `jsonb_typeof(raw_json)` = `string` everywhere. Slice
widths differ with no stated policy: `players` 5000 · `player_season_profile` 2000 · `arenas` 2000 ·
`player_tracking_profile` 2000 · `officials` **1000** — and a payload exceeding its width truncates
**mid-JSON**, leaving a string unparseable even after the encoding is corrected.

**This is a second, independent defect from §0.35's hand-picking problem.** §0.35 is about *what the
writer chose to keep*; this is about *how what it kept was stored*. `nba_ref.arenas` has both: `owner`
and `year_founded` are hand-picked away at the INSERT **and** the `raw_json` that would have preserved
them is a string holding only four keys. **Full entry and remedy: `NBA_OPEN_ITEMS.md` (🔴🔴).**

## 0.37 A FIFTH HAND-MAINTAINED EDIT SITE PER NEW STATIC ENTITY — with the widest blast radius
*Recorded 2026-09-21, T2 re-read pass 10.*

Four sites wire a new **worker** (`admin-sql`'s `z.enum`, its `bindingMap`, its `else if` chain, and
`generate_wrangler_configs.py`). A fifth wires the new **scraper**: the explicit file list in
`nba-scrape.yml`'s commit step, which grew by two paths per scraper across four successive patches.

⚠ **Its failure mode is not "the new entity is missing" but "the commit dies for everyone."** A
`git add` naming a file the scrape step never produced **hard-fails the commit step**, taking down the
commit for every scraper that *did* succeed — the same blast radius as the git-push race, different
cause. **Superseded** (T2, 2026-09-01) by an existence-checking `for f in nba/data/…; do` loop, which
also removed the per-scraper maintenance. *Recorded at §T2.4 as a bug fix; the maintenance-site
framing is new.*

## ⚠ 0.38 ALL TWELVE MANDATED DOCUMENTS END WITH A STRAY TOOL-PAYLOAD FRAGMENT
*Found 2026-09-21 during the T2 re-read. **Not fixed**, per the owner's standing instruction that
issues are documented now and fixed after the sweep.*

Every one of the twelve ends with two lines that are **not content** — the closing tags of the
`github_put_file` call that wrote the file, captured into the file body:
```
</content>
<parameter name="message">docs: …
```
**VERIFIED** by grep against `origin/main`: the fragment sits on the **second-to-last line of all
twelve** — `NBA_MASTER_SUMMARY.md`, `NBA_OPEN_ITEMS.md`, `NBA_WORKERS.md`, `NBA_DATABASE.md`,
`NBA_SYSTEM_ARCHITECTURE.md`, `NBA_FINAL_SCORING_CALIBRATION.md`, `NBA_BASELINE_CALIBRATION.md`,
`NBA_SYSTEM_DESIGN.md`, `NBA_MULTIPLIERS.md`, `NBA_GOBLIN_DEMON.md`, `NBA_GLOSSARY.md`,
`NBA_RECIPE.md`.

✅ **CAUSE FOUND AND FIXED 2026-09-21.** `git log -S'</content>'` per document names the introducing
commit: **twelve separate `github_put_file` calls on 2026-09-19 and 2026-09-20**, each landing as
*"Update nba/NBA_*.md via Claude MCP bridge"* — the generic message, meaning `message` was never
passed because **the tool call's closing tags were typed into the `content` argument**, taking the
real message with them.

**No live write helper is appending it.** `github_put_file` writes exactly the string given;
`github_patch_file` never touches the tail. **Cause established before stripping**, so the strip is
permanent. Removed from all twelve, verified zero remaining outside the two code fences that document
the defect.

⚠ **Recurrence risk**: a future full `github_put_file` of one of these documents can reproduce the
slip. **Prefer `github_patch_file` for the twelve** — also what their size demands.

## ⚠ 0.35 THE DESIGN RULE THE SCRAPERS DISAGREE ON — keep every column, or hand-pick and lose signal
*Recorded 2026-09-21 (T3). **This is one finding, not three** — the pattern is the point.*

**Three scrapers were built in a single session, 2026-09-02, against three sources. They made
opposite choices about the same question, and the two that hand-picked both lost data that maps onto
certified props.**

| Scraper | Choice | Result |
|---|---|---|
| **tracking detail** | **keep every column returned**, as a generic `metrics` JSONB blob per player per measure type | **nothing lost** |
| play types | hand-pick 10 of 18 source columns | **8 dropped** — `ft_poss_pct`, `tov_poss_pct`, `sf_poss_pct`, `plusone_poss_pct`, `score_poss_pct`, `fgm`, `fga`, `fgmx` |
| DARKO | hand-pick 9 of 24 payload fields | **15 dropped** — incl. **`x_minutes`**, `x_pts_100`, `x_ast_100`, `x_fg_pct`, `x_fg3_pct`, `x_ft_pct`, `x_pace`, `career_game_num` |

**The tracking-detail scraper stated the rule explicitly, and was right:**

> *"each measure type returns a different, not-fully-predictable set of columns — rather than
> hand-picking fields and **risking silently dropping something valuable**, this stores every real
> column returned as a generic JSONB metrics blob per player per type, **so nothing gets silently
> dropped**."*

**Neither of the other two is recoverable without a re-scrape.** Both workers store
`JSON.stringify(record).slice(0, N)` of the **already-reduced** record — ***VERIFIED**: 0 of 3,282
play-type rows and 0 of 530 impact rows contain any dropped field; max `raw_json` lengths 213 and
187 characters.* **A `raw_json` column that holds the transform's output rather than the source's
row is not a safety net; it just looks like one.**

**What was actually lost, stated once:** per-play-type **turnover and shooting-foul rates** (the
mechanism behind the certified FTA and FTM props), per-play-type **shot volume** (`FGA`), and
**DARKO's own daily projected minutes** — while factor A2 was being built to predict minutes through
five retracted attempts.

**The rule for every future scraper**: *store the source row, transform on read.* The JSONB pattern
already exists in this codebase and costs one column. *Not applied retroactively — per the sweep's
read-only rule.*

---

## 0.34 THE `scope_lock` DECLARATION — a worker that states, in its own response, every table it may write
*Recorded 2026-09-21 (T3 pass 8). Appears in none of the thirty documents.*

`alphadog-v2-nba-weekly-differential` returns a `scope_lock` object from **`GET /`** and
**`GET /health`**, not just from a run:

```
writes_only: [ nba_stats.player_roster_snapshot,  nba_stats.player_differential_log,
               nba_ref.team_roster_snapshot,      nba_ref.team_differential_log,
               nba_ref.official_roster_snapshot,  nba_ref.official_differential_log,
               "nba_ref.players (active flag only, for departed players)" ]
no_mlb_table_access: true   no_scoring: true   no_board_mutation: true
```

**The last entry is the one that matters.** Six of the seven are tables this worker owns outright;
**the seventh is a shared reference table it writes one column of.** That is a real, narrow
exception to "the differential worker only touches its own snapshots", declared rather than
discovered — *and it is the mechanism by which a departed player actually becomes inactive, since
the snapshot tables alone would record the event without changing the roster anyone queries.*

**Why the pattern is worth keeping**: a worker's write scope is otherwise only discoverable by
reading its whole body, and the NBA/MLB isolation guarantee (§0.2, and the founding instruction that
nothing is shared) is exactly the kind of claim that needs to be checkable without a code review.
**`curl` the health endpoint and the worker tells you.**

⚠ **CORRECTED 2026-09-21 (T2 re-read): this entry originally said "no other NBA worker does this."
Wrong.** ***VERIFIED** on live `main`: `nba/alphadog-v2-nba-static-arenas.js` line 101 declares
`scope_lock: { writes_only: ["POSTGRES.nba_ref.arenas"], no_mlb_table_access: true, … }` and
returns it from `/run` at line 156.* **The convention predates the differential worker — it came
from the teams worker in T1 and was carried into arenas in T2.**

**What is distinctive about the differential worker's version is its CONTENT, not its existence**:
it is the only one whose `writes_only` list names **seven** tables, and the only one declaring a
write to a table it does not own (`nba_ref.players`, active flag). **A single-table `scope_lock`
restates the worker's name; a seven-table one with a stated exception is the case where the
declaration earns its keep.** *This correction is exactly why T2 was reopened — the shallow first
pass recorded the pattern's existence without checking how far it extended.*

### The schema placement is inconsistent, and the declaration makes it visible
**Player snapshots live in `nba_stats`; team and official snapshots live in `nba_ref`.** Same worker,
same purpose, three entities, two schemas. *Nothing breaks — but a reader looking for
`nba_stats.official_roster_snapshot` by analogy will not find it.*

---

## 0.33 TWO GITHUB READ PATHS NOW EXIST — and which one a worker uses is invisible from its name
*Recorded 2026-09-21 (T3 pass 3).*

§0.32 records that `fetchFromGithub()` is copy-pasted across the static writers. **T3 forked it.**
After the 1 MB contents-API failure on the schedule file (see `NBA_OPEN_ITEMS.md` FROM T3 PASS 1),
the large-data workers got a second helper:

| Helper | URL | Response handling | Limit |
|---|---|---|---|
| `fetchFromGithub` | `api.github.com/repos/…/contents/…` | `JSON.parse(atob(json.content))` — base64 envelope | **~1 MB, fails silently with empty content** |
| **`fetchFromGithubRaw`** *(T3)* | `raw.githubusercontent.com/…` | `await resp.json()` — direct | **none** |

**The raw variant also drops the `Accept: application/vnd.github+json` header**, since there is no
envelope to negotiate. T3 applied it proactively to play types after being bitten once on schedule —
*"used raw.githubusercontent.com from the start instead of waiting to hit the same 1mb file-size
limit again."*

**The hazard is that nothing about a worker announces which helper it carries.** A worker built by
copying an older sibling inherits the contents-API version and works fine until its data file crosses
1 MB, at which point it fails with `unexpected end of JSON input` and nothing points at the cause.
**`nba/data/nba_schedule_current.json` is 1,225,505 bytes today** *(VERIFIED 2026-09-21)*, so the
threshold is not hypothetical for this dataset family.

---

## 0.32 THE FIVE STATIC WRITERS ARE COPIES OF ONE WORKER — including a self-identifying User-Agent each
*Recorded 2026-09-21 (T2 pass 2). **VERIFIED**: `Alphadog-NBA-StaticPlayerBio` at
`nba/alphadog-v2-nba-static-player-bio.js` line 20.*

T2 built five writers in one session — players, arenas, officials, player-bio, player-tracking,
team-stats, on/off — by copying the teams worker. **`fetchFromGithub()` is duplicated verbatim in
each**, with exactly one line differing: the User-Agent it sends to the GitHub contents API.

| Worker | User-Agent |
|---|---|
| teams | `Alphadog-NBA-StaticTeams` |
| players | `Alphadog-NBA-StaticPlayers` |
| officials | `Alphadog-NBA-StaticOfficials` |
| player bio | `Alphadog-NBA-StaticPlayerBio` |
| player tracking | `Alphadog-NBA-StaticPlayerTracking` |
| team stats | `Alphadog-NBA-StaticTeamStats` |
| on/off | `Alphadog-NBA-StaticOnOff` |
| schedule *(T3)* | `Alphadog-NBA-StaticSchedule` |
| DARKO *(T3)* | `Alphadog-NBA-StaticDarko` |
| weekly differential *(T3)* | `Alphadog-NBA-WeeklyDifferential` |

*Extended 2026-09-21 from seven to **ten** when T3's pass 2 reached the schedule, DARKO and
differential workers. **The duplication cost scales with the table**: a fix to the shared GitHub read
path is now a ten-place edit, and `Alphadog-NBA-WeeklyDifferential` is the one copy that diverged —
its `meta.error` throw includes the failing path (`last committed scrape failed for ${path}`) because
it reads three files in one run, where the others read one.*

**Two consequences worth holding together.** The good one: **GitHub API traffic is attributable per
worker** — a rate-limit or audit question can be answered by worker name without adding logging.
*(T1 pass 84 recorded this property for the teams worker alone; it is a deliberate convention across
all seven.)* The cost: **there is no shared module**, so a fix to the GitHub read path — auth, error
handling, the base64 decode, the `meta.error` check — must be made seven times, and a worker that is
missed fails in a way no other worker exhibits.

**The route surface is copied too**: `GET /`, `GET /health` (returning `vars_present`), `POST /run`,
404 otherwise. **So §0.28's finding — `POST /run` carries no authentication — holds for all seven,
not just the one it was measured on.**

---

## 0.3 ⚠ EVERY WORKER'S OPERATING CONSTANTS ARE HARDCODED — the founding rule is not holding
*VERIFIED 2026-09-20 (T1 pass 36) by grep of all 190 `.py`/`.js` files plus the MCP admin bridge.*

**The owner's founding rule named the exact quantities this document is a catalogue of:**
> *"any future variable numbers must reside on the database, not hard coded — … or **system variables
> like, TIMEOUTS, RETRIES, CHUNK SIZE**, for example, **so all these are easily changed by SQL command
> instead of coding and deploys.**"*

**What the workers actually do:**
| Quantity | Where it lives today |
|---|---|
| HTTP timeouts | Python literals — `timeout=30` (`scrape_nba_onoff`, `scrape_nba_darko`, `scrape_nba_career_totals`, `scrape_nba_officials`), `timeout=60` (`scrape_nba_lineups`, `scrape_nba_backfill_2025_26`), `timeout=90` (`scrape_fliff_board`, `scrape_nba_pairs`), `timeout=300` (the `fetch()` helpers) |
| Retry counts | literal loop bounds — `range(1, 3)`, `range(3)`, `range(1, 4)`, `range(4)` |
| Chunk / batch sizes | Python constants |
| Per-prop model constants | the hardcoded `PROPS` dict in `backtest/classification_ladder_v12.py` |

**And `nba_config.system_settings` seeds `nba_default_chunk_size = 200`** — **read by nothing.**

> ⚠⚠ **AND THE OTHER HALF OF THE MECHANISM** *(recorded 2026-09-20, T1 pass 80, **VERIFIED** from `generate_wrangler_configs.py` and a live `check_bindings`)*. **An NBA worker is given six vars and none of them is an operating constant**: `SYSTEM_ENV`, `SYSTEM_TIMEZONE`, `ACTIVE_SPORT`, `NBA_STATS_API_BASE_URL`, `WORKER_SAFE_MODE`, `DEBUG_MODE`. **MLB's shared `VARS` carries the caps** — `MAX_TICK_MS`, `MAX_API_CALLS_PER_TICK`, `MAX_ROWS_PER_TICK`, `LOCK_STALE_MINUTES` and 16 more — and the generator deliberately gives NBA *"its own vars, never the shared MLB VARS dict"*. **✅ The isolation is real. ⚠ The consequence is that an NBA worker has nowhere to read a timeout, retry count, chunk size or row cap from** — the database table exists and is read by nothing, and the vars block carries no constant. **The rule did not fail through neglect: the plumbing was never built on either side.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 80*.
**VERIFIED**: the strings `system_settings`, `chunk_size`, `stat_decay_config`, `role_tiers`,
`factor_registry`, `classification_config` appear **zero times** in the codebase. The only config
table any worker reads is **`nba_config.external_credentials`**, for API keys.

**⚠ One documented exception is real and worth noting**: `scrape_prizepicks_nba_board.py` reads
**`PP_NBA_RETRY_SLEEP_SECONDS`** from the environment with a default of `8` (proxy) or `60` (direct).
**That is env-configurable, not deploy-bound — but it is still not the database**, and it is the only
retry parameter in the fleet that can be changed without editing code.

**Consequence for this document**: **the operating constants listed per worker below are code facts,
not config facts.** Changing one requires a code edit, a commit and a deploy — the loop the rule was
written to avoid, and the loop that is most expensive for an owner with **no terminal**
(`NBA_SYSTEM_ARCHITECTURE.md` §1a). Full entry: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.

---

## 0.4 THE TWO REGISTRIES — and the count that proves the isolation held
*Recorded 2026-09-20 (T1 pass 35). **VERIFIED by live query.***

| Registry | Rows | NBA rows |
|---|---|---|
| **`config.worker_definitions`** — MLB's shared registry | **116** | **0** |
| **`nba_config.worker_definitions`** — NBA's own | — | all of them |

Plus NBA's own run bookkeeping: **`nba_control.job_runs`** and **`nba_control.worker_run_log`**.

**Two things follow, both previously unrecorded:**
1. **The blueprint's shared-queue contention question is moot** — NBA never joined the queue. It was
   posed in §0 as *"a genuine, concrete thing worth checking directly against the live system"* and
   had never been answered. `NBA_SYSTEM_ARCHITECTURE.md` §1a0.
2. **116 is the same count T1's Phase 1 banner recorded on 2026-08-31.** Twenty days and a full NBA
   build later it is unchanged, with **zero NBA rows** — **direct live evidence that the *"additive
   only, no MLB-system side effects"* constraint held.** It is the registry-level counterpart to the
   `startswith("alphadog-v2-nba-")` guard on the deploy scripts.

**⚠ This is also the four-step wiring pattern's blast radius.** §0 above requires every worker to be
registered in four places. **All four are NBA-owned** — `nba/worker_manifest_nba.json`, the
`nba_config` registry, the bridge's dispatch branch, and the generator's NBA list. **No step touches
an MLB table.**

---

## 0.5 ⚠ THE WORKER ARCHITECTURE WAS A NON-GOAL BEFORE IT WAS A DESIGN
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§6**, first non-goal. Recorded 2026-09-20
(T1 pass 31) — the dead-stub fact was already in these documents; **the instruction it produced was
not.***

> *"**Don't build a per-prop 'one worker per prop' architecture** — MLB tried this, abandoned it in
> favour of a unified scoring engine, and **left 19 DEAD STUB FILES behind as evidence**. **Build the
> unified version from the start.**"*

**This is why there is no `nba-score-points.js`, no `nba-score-rebounds.js`, and why the entire
scoring layer is one script** — `nba/build_final_hp.py` (§5) — **with props as a parameter
(`FE_PROPS`), not as files.** The 28 props in `nba_ref.prop_taxonomy` produce **one engine**, not 28
workers.

**The split that does exist is by DOMAIN, not by prop** — `static-teams`, `static-players`,
`static-officials`, `daily-delta`, `weekly-differential`. **That is the blueprint's "phase file"
pattern** (`NBA_FINAL_SCORING_CALIBRATION.md` §7i), and it is orthogonal to the non-goal: a phase is
a **stage of the pipeline**, a prop is a **row in a taxonomy**. **One worker per stage: yes. One
worker per prop: never.**

**The evidence that made it a rule is quantified**: MLB's abandoned attempt left **19 dead stub
files**, which remained in the repo long enough to be counted during T1's recon and are recorded in
`NBA_OPEN_ITEMS.md`. **NBA paid none of that cost** — **VERIFIED**: no per-prop worker appears in
`nba/worker_manifest_nba.json` or anywhere in `nba/`.

---

## 0a. THE INVESTIGATION METHODOLOGY — for understanding a large existing system
*⚠ **Provenance, recorded 2026-09-20 (T1 pass 39)**: this method was **the only option available**,
not a chosen technique — T1's own `view` calls target `/dev/null` and state *"no direct file view tool
for remote repo; use `github_get_file` range instead."* Recorded so it is not mistaken for a
preference.*

*Source: T1, blueprint §6b — worked out for "a genuinely huge (1MB+) orchestrator file, worth reusing
directly rather than reading the whole file top to bottom." Recorded 2026-09-20.*

| # | Step | Why |
|---|---|---|
| **1** | **Query the structured job/worker REGISTRY TABLES first** | *"**cheap, structured, and AUTHORITATIVE for 'what jobs and workers currently exist' — BEFORE TOUCHING ANY CODE.**"* |
| **2** | **Targeted code search for SPECIFIC PATTERNS** — job_key strings, stage-array variable names, function names | *"rather than reading entire large files — **cheap and precise**"* |
| **3** | **Only read a FULL physical file when a targeted search shows it's genuinely SMALL, or when a SPECIFIC CLAIM needs full-context confirmation** | *"**reserve full reads for when they're actually necessary**"* |
| **4** | **CROSS-CHECK every claim about 'what SHOULD happen' against REAL, LIVE EXECUTION HISTORY** — the job queue's run log, actual table row counts | *"**a registry or config table describes INTENT, not necessarily current real behaviour, and THE TWO CAN AND DO DRIFT APART.**"* |

> ⚠ **THE THRESHOLD IS MEASURED, NOT RHETORICAL** *(recorded 2026-09-20, T1 pass 64 — **VERIFIED**
> by parsing all 20 raw transcript exports)*. Step 3's *"reserve full reads for when they're actually
> necessary"* has a hard number behind it: **a `github_get_file` result above roughly 65,503
> characters (64 KiB) is cut in the displayed copy**, and **above a larger threshold the result is not
> returned at all** — replaced by a 212-character stub reading *"Tool result too large for context,
> stored at `/mnt/user-data/tool_results/…`"*, a spill path that **does not survive the session**.
> **Six such results across T2–T4 total 5.5 MB of text that is absent from the exports.** Step 2
> (targeted search) is therefore not merely cheaper than step 3 — **above ~64 KiB it is the only step
> that returns anything durable.** See `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 64*.

> ⚠ **AND THE METHOD'S ONE BLIND SPOT, MEASURED** *(recorded 2026-09-20, T1 pass 78)*. The four steps optimise for **answering a question**; **there is no step for *"has this already been solved in this repo?"*** **MEASURED**: T1 opened **nine MLB files** out of **372 at the repo root alone** (140 `.js` workers, 11 `.py`, 41 `.md`), plus 6 MLB workflows and `gbdt_training/`'s 28 files — **and `gbdt_training/d1_client.py`, which already contained T1's central discovery, was never opened** (pass 40). **The nine were the right nine for the task and the method is why the work was fast**; the cost is that **prior art is only found by looking for it.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 78*.

**✅ This documentation effort has followed exactly this order**, which is why the findings hold:
- **Step 1** → `worker_definitions`, `factor_registry`, `classification_config`, `role_tiers` queried
  before any code was read
- **Step 2** → `github_grep_file` on `dud|mixture|p_dud`, `p_ot|overtime`, `round\(`, `MIN_RATIO`,
  `NOT yet|CERTIFIED`
- **Step 3** → full reads reserved for the workflow files and targeted recipe sections
- **Step 4** → the live SQL checks: `arenas` 30/0/0/19, the differential logs 0/0/0/582, the config
  tables, `prop_taxonomy` 28

**Step 4 is what produced every VERIFIED finding**, and step 4's own warning —
***"a config table describes INTENT, not current real behaviour, and the two DO drift"*** — **is
`minutes_mixture` exactly**: the config specifies `dud_lognormal`, `tiered_inelastic` and a per-team
blowout term; **the code implements none of them.**

**⚠ And it names the limit of step 1**: the registry is authoritative for *what exists*, **not for
what runs.** The differential worker is in the registry and has never executed.

---

*Source: T1, blueprint §6a. Recorded 2026-09-20.*

### 1. THE EXACT-PAIRING SAFETY CHECK
> *"**Where MLB reuses ONE PHYSICAL WORKER FILE for MULTIPLE LOGICAL ROLES, the dispatch code NEVER
> TRUSTS `job_key` ALONE — it requires A GUARD FUNCTION CHECKING THAT `job_key` AND `worker_name`
> MATCH TOGETHER AS A SPECIFIC, KNOWN PAIR before routing a job to that worker.**
> **This is precisely what PREVENTS A JOB FOR ONE LOGICAL ROLE FROM EVER BEING SILENTLY ROUTED TO THE
> WRONG PHYSICAL FILE.**
> **If any NBA worker ends up serving MORE THAN ONE LOGICAL ROLE — plausible for shared,
> sport-agnostic-shaped workers — APPLY THE SAME EXACT-PAIRING CHECK.**"*

**⚠ NBA has multi-role workers already** (§0d.1): the backfill worker (`mode`), the measure-types
writer (`file_prefix`), the injury scraper (`INJURY_MODE`), the season-tables scraper (`MODE`).

**And the precondition for mis-routing already occurred**: T6 records that
**`DAILY_DELTA_RUNNER_WORKER` already exists as a shared/MLB binding**, so an NBA-specific name was
chosen *"to avoid any conflict"* — **the hazard caught by naming discipline, not by a pairing guard.**

**The bridge's `run_job` takes a `target` ENUM with hard client-side validation — one field, not a
pair.** Whether a `job_key` + `worker_name` guard exists is not recorded.

### 2. LOGICAL NAME vs DEPLOYED SLOT
> *"**MLB's dispatch config EXPLICITLY DISTINGUISHES a job's *LOGICAL* (conceptual) worker name from
> its *DEPLOYED* (actual physical file) SLOT, specifically to MAKE WORKER-REUSE LEGI[BLE].**"*

**Two names per job, deliberately** — "which concept is this?" and "which file runs it?" as separate
questions, **instead of one name silently meaning both.**

**NBA's surfaces**: `nba_config.worker_definitions` carries `worker_name`, `job_key`, `worker_group`,
`phase_key`; the bridge carries a **binding name** and a **service name**. **No explicit
logical-vs-deployed distinction is recorded.**

**Most relevant to the patcher pattern**, which is worker reuse in its purest form:
`build_baseline_ladder.py` **is** `classification_ladder_v12.py`, transformed. **The logical job and
the deployed artefact are genuinely different things**, and the anchor assertions keep that
relationship honest.

---

## 0d. ⚠⚠ SYSTEM SELF-KNOWLEDGE — read before assuming anything is "live"
*Source: T1, blueprint §6 — **"file names, job_key names, and 'is this worker active' assumptions are
FREQUENTLY WRONG, and this cost real debugging time more than once."*** Recorded 2026-09-20.

### 1. One physical file can serve MANY unrelated logical roles
> *"**A single physical worker file can serve MANY UNRELATED LOGICAL ROLES, selected AT RUNTIME by a
> `mode` PARAMETER, not by which file it is.** MLB's most extreme case: **ONE 700 KB+ FILE SERVES ~24
> DIFFERENT LOGICAL FUNCTIONS across multiple job_key aliases.**
> **NEVER ASSUME 'ONE FILE = ONE JOB.'**
> If you're tempted to reuse an existing file for a new purpose via a mode switch, **that's CONSISTENT
> WITH THE ESTABLISHED PATTERN — but DOCUMENT THE MODE DISPATCH TABLE EXPLICITLY IN ONE PLACE, don't
> let it become IMPLICIT.**"*

**⚠ NBA uses mode switches throughout, and the dispatch table is NOT documented in one place.**
| File | Modes |
|---|---|
| `scrape_nba_injury_report.py` | **`INJURY_MODE`** = `daily` / `probe` / backfill *(with `INJURY_FROM`/`TO`)* |
| The backfill worker | **`mode`** = default / **`weekly`** (splits + career totals only) |
| The measure-types writer | **`file_prefix`** — backfill vs delta files |
| `scrape_nba_season_tables.py` | **`MODE`** = `season`, plus `SEASONS_N` |
| The certifiers | **`PIPE`** = `p1` / `p2` / `p3` |
| P2 itself | **`skip_mining`**, **`asof`**, **`season`** — replay vs live |
| The recipe | **`BT_CARRY`**, `BT_PROPS`, `BT_CUTOFF`, `BT_REPLAY`, `BT_TRAIN`/`BT_TEST`, `BT_PLAYER_L0`, `BT_SHIFT_LAMBDA`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS` |

**The table above IS the missing dispatch documentation**, assembled here for the first time.
**Note `INJURY_MODE` specifically**: the workflow comment records *"**`INJURY_MODE`, not `IR_MODE`
(verified in the script; MY FIRST GUESS WAS WRONG)**" — the exact cost this lesson describes.

### 2. A file name can be a complete DEAD STUB
> *"**A worker's own literal file name can be A COMPLETE DEAD STUB** while **ALL ITS REAL WORK HAPPENS
> UNDER OTHER job_key/mode ALIASES that have NOTHING TO DO WITH THE FILE'S NAME.**
> **Don't trust a file name as a description of current behaviour.**"*

**NBA's live instance of the inverse**: `classification_ladder_v12.py` **is at v18** — the file name
under-describes it by six versions. **And T7's three-generation trap is this lesson exactly**:
`alphadog-v2-base-classification-v5.js` is dead and says so; the live logic is a **function name**,
`runClassificationBaselineV6ToPostgres`.

### 3. "WIRED BUT NOT IMPLEMENTED" is a recurring shape
> *"**A dispatch guard function AND CALL SITE CAN EXIST and route to A HANDLER FUNCTION THAT WAS NEVER
> ACTUALLY WRITTEN**, causing **A CRASH ONLY WHEN THAT SPECIFIC PATH IS FINALLY EXERCISED.**
> **When wiring a new NBA worker into any dispatch table, VERIFY THE HANDLER FUNCTION ACTUALLY EXISTS
> — don't just verify THE ROUTING COMPILES.**"*

**This is §4h's called-but-undefined risk seen from the dispatch side**, and it is why NBA's wiring is
**four edits** rather than three — each is a place the routing can exist without the destination.

### 4. A batch of stubs can look entirely real from outside
> *"**A large batch of NEAR-IDENTICAL PLACEHOLDER/STUB FILES can look REAL FROM THE OUTSIDE** —
> **plausible file sizes, real-looking names** — **while being 100% UNIMPLEMENTED DUMMIES that were
> SCAFFOLDED EARLY AND ABANDONED when the design changed.**
> **MLB has 19 such per-prop 'SCORE' WORKERS, ALL RETURNING A HARDCODED
> `DUMMY_READY` / `DUMMY_ONLY_NOT_REAL_DATA` RESPONSE, NEVER ONCE INVOKED.**"*

**✅ Already recorded in this documentation**: *"MLB ~130 workers deployed vs 116 registry rows — **~19
are dead stubs at ~5.3 KB, still `enabled=1`**."* **This is the same 19**, and the detail now has its
source: they return a hardcoded dummy response and **were never once invoked.**

**The NBA-side implication**: `nba/worker_manifest_nba.json` lists workers by name and size. **Neither
signal distinguishes a real worker from a stub** — only invocation history does.

**✅ And the explicit instruction was followed**:
> *"**If NBA's design also considers 'ONE WORKER PER PROP', LEARN FROM MLB'S ABANDONMENT OF THAT IDEA
> IN FAVOUR OF A UNIFIED SCORING ENGINE — BUILD THE UNIFIED VERSION FIRST.**"*

**NBA has exactly one scoring path** — `classification_ladder_v12.py` with a `PROPS` config, plus
`combos_ladder_v1.py` — **not a worker per prop.** The 19 abandoned MLB stubs are what that
instruction exists to prevent, and NBA never created their equivalent.

*(⚠ The one place NBA did split is singles vs combos — two certified recipes rather than one. That is
a two-way split, not a per-prop one, but it carries the duplication cost recorded in OPEN_ITEMS.)*

### 5. ⚠ CHECK EXECUTION HISTORY, NOT THE `enabled` FLAG
> *"**Before assuming ANY schedule/cron is LIVE or DORMANT, CHECK THE ACTUAL JOB-QUEUE EXECUTION
> HISTORY DIRECTLY** (`control.control_job_queue` or equivalent) — **NOT the `enabled` flag alone, and
> NOT a note/comment in the config row.**
> MLB found **a real case of a cron flag and its own explanatory note DIRECTLY CONTRADICTING each
> other**, and separately found **'LONG DORMANT' job types that STILL HAD LIVE, WIRED UI BUTTONS
> DESPITE MONTHS OF ZERO REAL INVOCATIONS.**"*

**Three unreliable signals named**: the `enabled` flag, the config note, and a wired UI button.
**Only execution history is trusted.**

**✅ This is the method that caught NBA's differential worker** — the conclusion came from querying
the **output tables** (all three logs empty, snapshot frozen **2026-09-02 19:47 UTC** — *date corrected
2026-09-21 by §T9.35a; 09-03 belongs to `nba_ref.players`, a different table*), not from reading configs.

**⚠ And it reinforces the never-fire-cron caveat**: a `crons: ["0 0 30 2 *"]` entry **and** an
`enabled=1` flag can both be present and neither tells you whether the worker runs. **The MLB
observation that such crons kept firing twice despite the fix makes execution history the only
reliable answer in both directions.**

**NBA's equivalent sources**: `control.job_runs` / `control.job_queue` (shared, bookkeeping-only),
**GitHub Actions run history**, and — most directly — **the output tables' own row counts and
`updated_at`/`loaded_at` timestamps.**

---

*Source: T1, blueprint §5b — "a powerful, generalizable warning." Recorded 2026-09-20.*

> *"MLB found **MULTIPLE STATIC JSON MANIFEST FILES in its own repo that LOOKED AUTHORITATIVE** —
> structured, comprehensive, **one-worker-to-one-job mappings** — but **turned out to describe the
> system exactly as it was *ORIGINALLY SCAFFOLDED*, before extensive JOB-MULTIPLEXING was layered on
> top over time.** These files **were NEVER UPDATED as the real architecture evolved**, and **by the
> time they were checked, THEY DIRECTLY CONTRADICTED WHAT THE LIVE DISPATCH CODE ACTUALLY DID FOR A
> MAJORITY OF THE WORKERS INVOLVED.**
> **Any static 'WORKER → JOB' or 'FILE → FUNCTION' mapping document, HOWEVER OFFICIAL-LOOKING OR
> COMPREHENSIVE, SHOULD NEVER BE TRUSTED AS GROUND TRUTH for what a system CURRENTLY does — ONLY THE
> LIVE DISPATCH CODE (and, EVEN THEN, CROSS-CHECKED AGAINST LIVE EXECUTION HISTORY, since EVEN
> DATABASE CONFIG TABLES CAN DRIFT from what the code actually enforces) reflects current reality.**"*

### ⚠ NBA has exactly such a manifest
**`nba/worker_manifest_nba.json`** — created in T1, a **worker list** consumed by the deploy pipeline.
**By this warning it is a snapshot, not truth**, and it should be re-verified against the live
dispatch branch in `admin-sql` before being relied on.

**And the three-place wiring makes drift structurally possible**: a worker exists in the **manifest**,
the **bridge binding map + dispatch branch + tool enum**, and the **generator**. **Four surfaces that
must agree, with nothing asserting they do.**

### ⚠⚠ THIS WARNING APPLIES TO THIS DOCUMENTATION ITSELF
**`NBA_WORKERS.md`, `NBA_SYSTEM_DESIGN.md` and `NBA_DATABASE.md` are exactly the kind of
"official-looking, comprehensive mapping document"** this describes. **They are snapshots dated
2026-09-20.**

**The rule's own hierarchy of trust, applied here:**
| Source | Trust |
|---|---|
| **Live execution history** | highest — e.g. the differential logs being empty |
| **Live dispatch code / workflow files** | e.g. P1's actual step list, the recipe's `ROLE_TIERS` |
| **Database config tables** | ⚠ *"even database config tables can DRIFT from what the code actually enforces"* — **and `minutes_mixture` HAS** |
| **Static manifests and these documents** | lowest — snapshots |

**The `minutes_mixture` drift is this warning confirmed inside NBA**: the config table specifies three
components the code does not implement. **The config was trusted as describing the system; it
described the design.**

**Consequence for readers of these files**: entries marked **VERIFIED** (live SQL or a direct grep)
sit in the top two tiers. Everything else is a snapshot. *(See the confidence-tier header in
`NBA_OPEN_ITEMS.md`.)*

---

*Source: T1, blueprint §4m. Recorded 2026-09-20.*

### ⚠ A syntax validator will NOT catch JS embedded in a server-side template literal
> *"**A basic script-syntax validator WILL NOT CATCH AN ERROR IN CLIENT-SIDE JAVASCRIPT EMBEDDED
> INSIDE A SERVER-SIDE TEMPLATE LITERAL** — **that code needs to be EXTRACTED AND VALIDATED
> SEPARATELY**, since **a generic top-level syntax check treats THE WHOLE TEMPLATE LITERAL AS AN
> OPAQUE STRING.**"*

**Relevant wherever a Worker returns HTML or embeds a script** — the health-check and diagnostics
responses on `admin-sql` are that pattern. **A worker can deploy cleanly with broken embedded JS.**

### ⚠⚠ AFTER ANY RENAME, GREP THE WHOLE CODEBASE FOR THE OLD NAME
> *"**After renaming ANY shared constant or function, EXPLICITLY SEARCH THE WHOLE CODEBASE FOR THE OLD
> NAME BEFORE CONSIDERING THE RENAME COMPLETE** — **a reference to a renamed identifier LIVING INSIDE
> A STRING TEMPLATE WILL NOT FAIL UNTIL THAT SPECIFIC CODE PATH ACTUALLY EXECUTES AT RUNTIME**, not at
> deploy or parse time, **so a STALE REFERENCE CAN SIT INVISIBLE FOR A LONG TIME.**
> **MLB found SIX SUCH STALE REFERENCES IN A SINGLE SESSION, all traceable to THE SAME ROOT CAUSE.**"*

**Six from one rename**, each failing only on the path that uses it — **so the common path working
proves nothing**, the same property as the called-but-undefined-function risk (§4h).

**⚠ NBA is exposed through the PATCHER PATTERN specifically.** The production builders are **string
transformers** over the certified recipes — **any rename inside `classification_ladder_v12.py` is a
rename inside the patcher's search strings.**

**The record shows this failing and being caught by design:**
- *"The anchor check did exactly its job — **it failed loudly**"*
- *"**Verify all five anchors against the repo harness BEFORE re-triggering**"*
- *"The patch didn't apply (**third anchor mismatch**) — **that run was unchanged v17**"*

**The anchor assertions convert a silent stale reference into a loud failure. That is the mitigation
the rest of the codebase lacks.**

| Surface where an identifier lives in a string | Protected? |
|---|---|
| The patcher's anchor strings | ✅ **asserted** |
| `run_job`'s `target` enum ↔ bridge binding map ↔ generator | ⚠ **three places must agree** |
| `MARKET_TO_PROP` / `norm_market()` board keys | ⚠ string literals |
| `INJURY_MODE`, `BT_PROPS`, `GAP_SEASON` env names | ⚠ matched at runtime |
| Workflow `run:` lines naming scripts | ⚠ fails only when that step runs |

---

## 0e. ⚠ THE SCOPE-PARAMETER AUDIT — every mode/scope argument must constrain the WRITE, not the response
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§7g**. Recorded 2026-09-20 (T1 pass 29) —
previously unswept.*

> *"MLB found a function whose **'which props to touch' input parameter correctly filtered its own
> RESPONSE SUMMARY, but the underlying WRITE LOGIC IGNORED THAT FILTER ENTIRELY** and touched every
> eligible row regardless — **invisible except by noticing unrelated timestamps had also updated.**"*

**The standing rule, stated for NBA directly:**
> *"**When adding any 'limit to these specific items' parameter to an NBA worker, VERIFY IT CONSTRAINS
> THE ACTUAL WRITE PATH, not just what gets echoed back in the response.**"*

**This document is the inventory of exactly the parameters at risk.** Every scoping env var recorded
in the tables below is a candidate:

| Worker / script | Scope parameters recorded here |
|---|---|
| `nba/build_final_hp.py` | `FE_SEASONS`, `FE_PROPS`, **`FE_DATE`** (*"scopes to one slate: seconds vs ~90 min"* — a large claimed selectivity) |
| `nba/backtest/classification_ladder_v12.py` and its patchers | `BT_REPLAY`, `BT_INJURY`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS`, `BT_TRAIN` / `BT_TEST` |
| `nba/certify_pipeline.py` | `PIPE=p1\|p2\|p3` |
| every static scraper | season / date-range arguments |
| every Cloudflare writer worker | the mode-dispatch branch it is invoked through |

**NOT RECORDED as audited — none of these has been checked against the §7g rule.**
**The cheap test is named in the source**: the detection signal was *unrelated timestamps also
updating*, so **a `SELECT max(updated_at)` on rows OUTSIDE the requested scope, before and after a
scoped run, settles it per worker.** Logged in `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*.

**⚠ Why this matters more here than it did for MLB.** In MLB's instance the bug was *"not unsafe —
every write, filtered or not, passed the same validation gate."* **NBA's `FE_DATE` claim is a
performance claim (`seconds vs ~90 min`) as well as a scope claim**, so a write path ignoring it would
show up as a timing anomaly too — **but only if someone is watching the runtime.**

---

## 1. CLOUDFLARE WORKERS — Postgres writers
Pattern: read the GitHub-committed JSON → upsert into Postgres.

> ⚠⚠ **CORRECTION — they do NOT log to `nba_control`** *(2026-09-20, T1 pass 68; this line previously read … → **log to `nba_control`**)*. **VERIFIED three ways**: **(1)** `nba_control.job_runs` and `nba_control.worker_run_log` hold **0 rows each**; **(2)** the string `nba_control` appears in **no non-markdown file anywhere in the repo** — not one worker, scraper, workflow or config; **(3)** every file that does use `worker_run_log` or `job_runs` is an **MLB** file at the repo root (`alphadog-v2-orchestrator.js`, `alphadog-v2-control-room.js`, `alphadog-v2-score-audit.js`, …). **NBA inherited the tables from MLB's design and never inherited the wiring.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 68*.
They do **not** fetch from nba.com; they cannot (Cloudflare is blocked).

| Worker | job_key | Writes | Source file |
|---|---|---|---|
| `nba/alphadog-v2-nba-static-teams.js` | `nba-static-teams` | `nba_ref.teams`, `team_aliases` | `nba_teams_current.json` |
| `nba/alphadog-v2-nba-static-players.js` | `nba-static-players` | `nba_ref.players`, `player_aliases` | `nba_players_current.json` |
| `nba/alphadog-v2-nba-static-arenas.js` | `nba-static-arenas` | `nba_ref.arenas` | `nba_arenas_current.json` |
| `nba/alphadog-v2-nba-static-officials.js` | `nba-static-officials` | `nba_ref.officials` | `nba_officials_current.json` |

Each has `EXPECTED_VARS = [SYSTEM_ENV, SYSTEM_TIMEZONE, NBA_STATS_API_BASE_URL, WORKER_SAFE_MODE,
DEBUG_MODE]` and a `/debug-fetch` diagnostic route. Teams also carries a **certified static 30-team
fallback** with real stats.nba.com TEAM_IDs.

**`alphadog-v2-admin-sql.js`** (repo root, shared) — the MCP bridge. Every tool the assistant has.
**Touching it triggers a full-fleet redeploy.**

---

## 2. STATIC SCRAPERS — GitHub Actions, `nba/data/`

> ### ⚠ EVERY SCRAPER'S OUTPUT SHOULD HAVE A `*_meta.json` SIDECAR — about one in five does
> *Recorded 2026-09-20 (T1 pass 45). **VERIFIED on the live repo**: `nba/data/` holds **223 files,
> 41 of them `*_meta.json`.***
>
> ```json
> { "fetched_at": "2026-09-14T15:49:33Z",
>   "source_url": "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2026-27…",
>   "http_status": 200, "team_count": 30, "error": null }
> ```
>
> **This is the provenance layer that makes the standing discipline checkable** — *read the committed
> file, not the scraper's own meta claim* — because it records **when, from where, what status, how
> many rows, and whether it errored.**
> **⚠ For the ~180 files without one there is no committed record of fetch time or success**, and the
> workflow logs that would answer it **expire** (§0.25's sibling finding, `NBA_OPEN_ITEMS.md` FROM
> T1 PASS 40). **Whether the gap is deliberate is NOT RECORDED.**
All use **`curl_cffi` with browser impersonation** except where noted.

| Script | Endpoint | Output |
|---|---|---|
| `scrape_nba_stats_teams.py` | `leaguestandingsv3` | `nba_teams_current.json` + `_meta` |
| `scrape_nba_stats_players.py` | `commonallplayers` | `nba_players_current.json` |
| `scrape_nba_stats_arenas.py` | **`teamdetails` → `TeamBackground`** | `nba_arenas_current.json` |
| `scrape_nba_officials.py` | **Wikipedia — plain `requests`** | `nba_officials_current.json` |
| `scrape_nba_player_bio.py` | `leaguedashplayerbiostats` | one call, whole league |
| `scrape_nba_player_tracking.py` | `leaguedashptstats` | one call |
| `scrape_nba_team_stats.py` | team stats | |
| `scrape_nba_onoff.py` | on/off splits | |
| `scrape_nba_playtypes.py` | `synergyplaytypes` | 3,364 player + 630 team |
| `scrape_nba_darko.py` | DARKO | SvelteKit hydration, 530/530 |
| `scrape_nba_shotquality.py` | shot quality | |
| `scrape_nba_schedule.py` | `scheduleleaguev2` | 2,666 games |
| `scrape_nba_periods.py` | quarter/half splits | |
| `scrape_nba_season_tables.py` | weekly as-of tables | pt_defend, hustle, clutch, coaches |
| `scrape_nba_matchups_pergame.py` | matchup shards | feeds M1 |
| `scrape_nba_injury_report.py` | NBA injury PDFs | **`INJURY_MODE`** = daily / probe / backfill |
| `scrape_referee_assignments.py` | referee assignments | ~6–7 AM PT |
| `scrape_nba_daily_delta.py` | bulk current-season | the delta |
| `scrape_nba_per_game_delta.py` | starters + officials | per new game |
| `sync_season_files_from_delta.py` | — | rebuilds season files |

---

## 3. BOARD SCRAPERS
| Script | App | Notes |
|---|---|---|
| `nba/scrape_prizepicks_nba_board.py` | PrizePicks | **`league_id=7`**, own env `PP_NBA_*`, output `boards/prizepicks_nba_current.json`. **Separate from MLB's `main.py`.** 4 candidate URLs; selects on **future-pickable rows**, not size. Live-tested: 192 projections, 104 demons / 52 goblins / 36 standard |
| `main.py` (root) | PrizePicks **MLB** | `league_id=2` hardcoded, output fixed. **Never use for NBA.** |
| `nba/scrape_underdog_board.py` | Underdog | `alternate_projections` = the full ladder with both sides' multipliers. `UNDERDOG_PXID`, `UNDERDOG_STATE_CONFIG`, `UNDERDOG_OUT_DIR`, `UNDERDOG_DEVICE_ID` |
| `nba/scrape_sleeper_board.py` | Sleeper | **`SLEEPER_SPORTS` defaults to `mlb,nba`** and **`SLEEPER_OUT_DIR` defaults to `.`** — both must be set |
| `nba/scrape_fliff_board.py` | Fliff | reverse-engineered from web bundles |
| Betr | Betr | bridge job, owner's Keycloak token |
| `nba/archive_live_boards.py` | all | normalises every app into `nba_market.board_snapshots`. **`ARCHIVE_LABEL` defaults to `routine`** — the decision pull must set `window` |

---

## 4. BASELINE ENGINE

### `nba/backtest/classification_ladder_v12.py` — THE CERTIFIED RECIPE *(now v18)*
**The single source of truth.** 60,176 bytes, 759 lines. Every production builder is a **patcher** over
it, with **anchor assertions** so a drifted patch fails loudly instead of writing silently.

> ⚠ **The anchor assertion's SCOPE, recorded 2026-09-21 (§T9.32b) — it is cited in eight documents as
> the model to copy, and what it covers was stated in none of them.** The guarantee is one line:
> `def rep(s, old, new): assert old in s; return s.replace(old, new)`. **It asserts that the anchor
> TEXT still exists in the harness**, so it catches the certified recipe drifting under the patch —
> loudly, exactly as described. ⚠ **It does not and cannot catch configuration introduced by the
> replacement.** `LADDER_STEPS = 6` is replaced with `int(os.environ.get("BT_LADDER_STEPS", "10"))`;
> **the assertion passes**, and the measured 20-prop `LADDER_DEPTH` table is flattened to one number
> with nothing raised anywhere (**O5**, §T9.27b). 📌 **And the replacement source is invisible to
> static analysis** — three env vars (`BT_REPLAY`, `BT_INJURY`, `BT_CUTOFF`) exist only inside these
> triple-quoted strings and are string literals to `ast.parse` (§T9.31a). *Harness drift: covered.
> Config drift: not covered.*

**Constants** (full table and the calibration logic: see `NBA_BASELINE_CALIBRATION.md`):
`MAX_TIERS=24` · `MIN_PER_TIER=15` · `TIER_BLEND_K=5` · `LADDER_STEPS=6` ·
`BLOWOUT_MARGIN=20` / `COMPETITIVE_MARGIN=15` · `ROLE_TIERS` (6 bands) ·
`P_BLOWOUT_BINS=[0,2,4,6,8,10,12,15,99]` · `SHIFT_LAMBDA` per prop · `PLAYER_L0` **off (rejected)**.

**Env**: `BT_ASOF` · `BT_PROPS` · `BT_CUTOFF` · `BT_REPLAY` · `BT_INJURY` · `BT_LADDER_STEPS` ·
`BT_SAVE_COMPONENTS` · `BT_TRAIN`/`BT_TEST` · **`BT_CARRY` (default "1" — without it October produces
NOTHING)** · `BT_SHIFT_LAMBDA` · `BT_PLAYER_L0`.

> # 🔴🔴🔴 **THE MODE DISPATCH TABLE — `§0d.1`'s T1 PRESCRIPTION, DISCHARGED** *(written 2026-09-22, T20 pass 96, §T20.101)*
> *`§0d.1`, the MLB lesson recorded at T1:* ***"NEVER ASSUME 'ONE FILE = ONE JOB.' … DOCUMENT THE MODE
> DISPATCH TABLE EXPLICITLY IN ONE PLACE, don't let it become IMPLICIT."*** **The list above names the
> knobs. It has never said which combination selects which JOB. This does.**
> ▶ **Read from `nba/baseline/build_baseline_ladder.py` in full, `2026-09-22T22:00:44Z`. Nothing was
> run.** ⚠ **`build_baseline_ladder.py` is `152` lines and is a PATCHER, not a builder**: it reads
> `nba/backtest/classification_ladder_v12.py`, applies **eight anchor-asserted `rep()` string
> patches**, sets `BT_TAG` if unset, and `exec()`s the result. ***So a flag's behaviour depends on
> whether the patch that reads it survives — and one of them does not.***
>
> | flag | default | where it is read | what it does in the PRODUCTION ladder |
> |---|---|---|---|
> | **`BT_ASOF`** | **today** | patch `:42` | the slate date — and it also selects the season *(`_season_of`)* and the output filename |
> | **`BT_PROPS`** | unset | patch `:143` **and** the harness | **here it is the output filename TAG only** *(`nba_baseline_ladder_<ASOF>_<pair>.json`)*; the per-prop restriction is the harness's job |
> | **`BT_REPLAY`** | `"0"` | patch `:54` | `=1` lets games with `game_status == 3` **(final)** form a virtual slate ⇒ **replay a past day** |
> | **`BT_INJURY`** | `"1"` — **ON** | patch `:78` | applies the day-before report at the cutoff; **requires a non-empty virtual slate** |
> | **`BT_CUTOFF`** | `"baseline"` | patch `:83` | picks `BASELINE` / `PHASE1` / `PHASE2_CUTOFF_LOCAL` from `nba/nba_asof.py` |
> | **`BT_LADDER_STEPS`** | 🔴 **`"10"` in production — the certified recipe's own constant is `6`** | patch `:39` | ladder depth ±N. *`P2` deliberately does not set it* **(PRIOR — recorded above)** |
> | **`BT_SAVE_COMPONENTS`** | unset | 🔴 **NOT read by this file at all** — consumed by the harness and `combos_ladder_v1.py` | ***this is the flag that makes `P2` step 12 a different job from step 11*** |
> | **`BT_TRAIN` / `BT_TEST`** | — | 🔴🔴 **INERT HERE** | **the anchor line that reads them is REPLACED** *(patch `:40–49`)* **by season auto-detection from the files on disk.** ⚠ *They remain load-bearing in the HISTORY builders — COMPASS fact 66: **"BT_TRAIN must be explicit … or the test season lands in its own training set (leak + OOM)"** — which is a statement about `build_*_history.py`, not about this script.* |
> | **`BT_TAG`** | **`"prod"`, set by the script itself** *(`:151`)* | `:151` | 🔴 **named in ZERO of the twelve before this entry** *(it is listed once in `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md`, one of the THIRTY — see the block below)* |
>
> ## 🔴🔴 **AND FOUR MORE FLAGS REACH PRODUCTION THROUGH THE `exec`, EACH DEFAULTED IN CODE, NAMED IN NONE OF THE TWELVE**
> *`build_baseline_ladder.py` `exec`s the patched harness **in the same environment**, so every flag
> `nba/backtest/classification_ladder_v12.py` reads is live in the production ladder. **Four of them
> the twelve have never named**, and each carries a model-shaping default:*
>
> | flag | default, as coded | what it selects |
> |---|---|---|
> | **`BT_BAND_CELLS`** | **`"rebounds"`** *(`:53`; the harness's own docstring says `props\|all\|0`)* | which variation-band cells are built |
> | **`BT_SHIFT_MODE`** | **`"threes_made,blocks,steals,ftm"`** *(`:58`)* | the prop set that uses shift mode |
> | **`BT_KCELL_3PM`** | **`"100"`** *(`:55` — `K_CELL_BY_PROP = {"threes_made": …}`)* | the cell-blend constant for threes |
> | **`BT_PHASE`** | **`"1"`** *(`:528`)* | a phase gate inside the harness |
>
> ⚠ **All four are listed in `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md` — a document of the
> THIRTY, not of the twelve.** ⇒ ***The twelve's env list was a SUBSET of what the code reads, and the
> remainder survived only in a checkpoint file that the twelve do not route to.*** 🔑 *This is
> `§T20.90`'s orphan problem in the other direction: not a finding nothing points at, but a fact that
> lives outside the documents meant to carry it.* ⚠ **Recorded, not changed (rule 1).**
>
> ## ⚠⚠ TWO SILENT FAILURES THE TABLE MAKES VISIBLE
> **① 🔴 THE INJURY STEP CANNOT FAIL THE BUILD.** *The whole day-before enrichment block sits inside
> `try: … except Exception as _exc: print("injury report step skipped:", _exc)`* ⇒ ***the report can be
> missing, unparseable or name-unmatched and the ladder still builds, and `P2` still certifies green***
> *(its four checks count rows and props, never enrichment — `§T20.94`)*. **The only trace is one line
> of build log.**
> **② 🔴 A TYPO IN `BT_CUTOFF` IS SILENT.** *`{"baseline":…, "phase1":…, "phase2":…}.get(_cut_name,
> BASELINE_CUTOFF_LOCAL)` — **an unrecognised value falls back to `baseline` with no warning**, so
> `BT_CUTOFF=phase-1` produces a baseline-cutoff ladder that looks like a phase-1 one.*
> ⚠ **Both recorded, neither fixed (rule 1).** 📌 **Pointer: `NBA_RECIPE.md` `STEP 9` for where the two
> invocations sit in `P2`.**

### `nba/backtest/combos_ladder_v1.py`
Certified combos recipe — **its own `LADDER_STEPS`**. Joint simulation over calibrated marginals with
**per-player covariance**. **Requires `BT_SAVE_COMPONENTS=1` singles pickled first.**

### `nba/backtest/minutes_model_v1.py` *(T8)*
The first harness. Established the derived spread (r=0.46), `P(blowout|spread)`, the DataStreak
reproduction (5.4 vs 5.8) and team-specific starter pull (0.81 Orlando → 1.10 Dallas).

### `nba/backtest/bandfit.py` *(T8)* — the band-cell fitter.

### Production builders — the PATCHER PATTERN
> *"**The backtest harness on a PAST day is already the production computation** — every feature is
> `shift(1)`-based, so the only difference for today is the slate."*

| Script | Role |
|---|---|
| `nba/baseline/build_baseline_ladder.py` | patcher → today's slate. **Reproduces the ladder exactly** (173 players, 4,498 rows) |
| `nba/baseline/build_combos_ladder.py` | daily combos |
| `nba/baseline/build_periods_ladder.py` | daily periods |
| `nba/baseline/build_baseline_history.py` | season backfill (singles) |
| `nba/baseline/build_combos_history.py` · `build_periods_history.py` | season backfill |
| `nba/load_baseline_ladder.py` | **fetches over HTTP from the repo**; **refuses a singles-only slate** |
| `nba/load_baseline_history.py` | bulk history loader |
| `nba/nba_asof.py` | cutoffs — `PHASE1_CUTOFF_LOCAL = "16:00"` (1 PM PT) |
| `nba/nba_season.py` | **`current_season()` vs `active_stats_season()`** — the season-hardcoding fix; both honour `NBA_SEASON`. ⚠ Oct 1–2 edge case |

**A change must be applied to BOTH certified recipes** — singles and combos are separate files, each
with its own constants.

---

## 4b. CLOUDFLARE WRITER WORKERS BUILT T3–T9
All follow the same shape: **fetch the committed JSON from `raw.githubusercontent.com`** (never the
Contents API — it **silently returns empty above 1 MB**), **batched upsert through Hyperdrive**, run
summary to a `*_runs` table.

| Worker | Writes | Notes |
|---|---|---|
| `alphadog-v2-nba-static-players` / `-teams` / `-arenas` / `-officials` | `nba_ref.*` | the four-step wiring pattern |
| **the weekly differential worker** | `nba_stats.player_differential_log`, `nba_ref.team_differential_log`, `official_differential_log` + their 3 snapshot tables | 🔴 **`[LIVE-AUDIT]` 2026-09-21 (T8 pass 12) — CONFIRMED AND DATED: it has not completed a run since 2026-09-02.** All three logs are **0 rows** and all three snapshots read **`snapshot_taken_at` = 2026-09-02 19:47**, while the worker **unconditionally** `DELETE`s each snapshot and re-`INSERT`s it with `now()` (lines 98/102, 152/156, 194/197) — **so a stale timestamp is proof of no run, not evidence that nothing changed.** *This retires the "correctly empty — detection starts on the second run" verdict elsewhere: there has been no second run.* **⚠ NEVER SCHEDULED.** Flagged unwired when built (T3); owner said *"leave like this for now"*; **P1 does not call it.** Verified empty 2026-09-20 |
| the measure-types writer | `player_game_log_usage` / `_scoring`, `team_game_log_four_factors` / `_scoring` | **`file_prefix`** input so one worker loads both backfill and delta files. Bug: the **team advanced table has no `usg_pct`/`reb_pct`** — the mapper wrote nonexistent columns |
| the starter-status writer | `player_game_starter_status` | **hardcoded `_2025_26`** until T7 — *"would silently keep loading last season's file in October."* `fetchFromGithubRaw` returns `{file, meta}`, so season is `.file.season` |
| the officials writer | `nba_stats.game_officials` | same season fix |
| the backfill worker | splits + career totals | gained a **`mode: "weekly"`** input — *"loads only those two in ~6 s instead of re-touching 79k rows"* |
| the daily-delta worker | game logs + **the DvP recompute** (210 rows = 30 × 7, current season) | **PRE-FLIGHT completeness check**: calendar Final count vs logged count, **`GAME_ID` prefix `002`**. Persists a **`known_empty_games` skip list** — without it the 3 permanently-empty games would be re-fetched *"every single day forever"* |
| **`alphadog-v2-nba-baseline-ladder` v0.1.0** | `nba_score.baseline_ladder` + `baseline_ladder_runs` | `POST /run {"asof":"YYYY-MM-DD"}`; idempotent on PK `(asof, player_id, game_id, prop, period, ot_rule, line)` |

**Registration is four edits**: bridge **binding map + direct-call list + tool enum**, plus the
**config generator** for the service binding. **NBA workers use DIRECT dispatch** (the
`BASE_HITTER_GAME_LOGS_WORKER` pattern), bypassing the queue — deliberate, per the no-orchestrator rule.

### ✅ **ALL TWENTY-ONE, AND EVERY OBJECT EACH ONE WRITES** *(T20 pass 111, `§T20.116`, 2026-09-22)*

*The prose table above names **8** of the 21 by name and groups the rest. This is the complete map,
extracted from `INSERT INTO` / `UPDATE` / `DELETE FROM` / `CREATE TABLE IF NOT EXISTS` in each file.*
**Population pinned `2026-09-22T23:32:08Z`: `ls -1 nba/*.js` ⇒ `21`, and
`nba/worker_manifest_nba.json` ⇒ `21`, with `IN MANIFEST, NO .js` = `[]` and `HAS .js, NOT IN
MANIFEST` = `[]` — an exact match, no orphan and no phantom.**

| worker (`alphadog-v2-nba-…`) | writes |
|---|---|
| `baseline-ladder` | 🔑 `nba_score.baseline_ladder` · `nba_score.baseline_ladder_runs` |
| `daily-delta` | `nba_stats.player_game_log` · `player_game_log_advanced` · `nba_team.team_game_log` · `team_game_log_advanced` · `nba_team.defense_vs_position` |
| `static-backfill` | `nba_stats.player_game_log` · `player_game_log_advanced` · `player_splits` · `player_career_season_totals` · `nba_team.team_game_log` · `team_game_log_advanced` · `team_splits` |
| `static-measure-types` | `nba_stats.player_game_log_scoring` · `player_game_log_usage` · `nba_team.team_game_log_four_factors` · `team_game_log_scoring` |
| `static-shotquality` | `nba_stats.player_shot_quality` · `player_shot_quality_delta` · `player_shot_zone_profile` |
| `weekly-differential` | `nba_stats.player_differential_log` · `player_roster_snapshot` · `nba_ref.team_differential_log` · `team_roster_snapshot` · `official_differential_log` · `official_roster_snapshot` · `nba_ref.players` |
| `static-players` | `nba_ref.players` · `nba_ref.player_aliases` |
| `static-teams` | `nba_ref.teams` · `nba_ref.team_aliases` |
| `static-player-bio` | `nba_ref.players` · `nba_stats.player_season_profile` |
| `static-playtypes` | `nba_stats.player_playtype_profile` · `nba_team.playtype_profile` |
| `static-schedule` | `nba_calendar.games` |
| `static-arenas` | `nba_ref.arenas` |
| `static-officials` | `nba_ref.officials` |
| `static-game-officials` | `nba_stats.game_officials` |
| `static-darko` | `nba_stats.player_impact_rating` |
| `static-lineups` | `nba_team.lineup_profile` |
| `static-onoff` | `nba_stats.player_onoff_profile` |
| `static-player-tracking` | `nba_stats.player_tracking_profile` |
| `static-tracking-detail` | `nba_stats.player_tracking_detail` |
| `static-starter-status` | `nba_stats.player_game_starter_status` |
| `static-team-stats` | `nba_team.season_profile` |

✅✅ **AND THE ANSWER TO "IS THE ARCHITECTURE ACTUALLY SEPARATED?" IS YES.** **41 distinct objects
written by the Workers · 13 by the 40 called Python scripts · intersection exactly TWO** —
**`nba_score.baseline_ladder` and `nba_score.baseline_ladder_runs`.** ⇒ **`39` of `41` and `11` of
`13` are single-writer. The Workers own `nba_ref`, `nba_stats`, `nba_team` and `nba_calendar`; the
scripts own `nba_score`.**

🔴 **The two shared objects are the one seam, and their two writers DISAGREE** — `UPSERT` with no
stale-row removal and last-wins dedupe on the Worker side, atomic `DELETE`+`INSERT` with
smallest-offset dedupe and a combo-props abort on the Python side, plus four smaller column
differences. ▶ **Full comparison: `§T20.116`; item `T20-21` (`MEDIUM, STRUCTURAL, LATENT`).**
⚠ **And no column in either table records which writer wrote the row** — a provenance discriminator
was built from `team_id` and `recipe_version` and **run live: both came back dead** *(`team_id=''` 0,
`team_id IS NULL` 0, `max(length(recipe_version))` 76 against a 200-char cut)*.

📌 **Dated state, not a verdict** *(live `max(updated_at)`, 2026-09-22)*: `nba_calendar.games`
**2026-09-02** *(2,666)* · `nba_ref.players` **2026-09-03** *(582)* · `nba_stats.player_impact_rating`
**2026-09-02** *(530)* · `nba_stats.player_game_log` **2026-09-08** *(79,358)*. **The Workers do run.
The most recent Worker write is fourteen days old, against a 2026-10-03 preseason and a 2026-10-20
opener; whether that is correct for the off-season is NOT RECORDED.**
**⚠ Use NBA-specific binding names** — `DAILY_DELTA_RUNNER_WORKER` already exists as a shared/MLB
binding.

### ⚠ THE GENERATOR IS THE ONLY PLACE THAT PERSISTS
> *"**The GitHub workflow REGENERATES wrangler files before deploy, so this binding must live in the
> GENERATOR or it will be ERASED before Wrangler deploys.**"*

**Hand-edited `wrangler.json` changes do not survive a deploy.**

> ⚠⚠ **AND THE REAL FAILURE MODE IS WORSE THAN "YOUR EDIT VANISHES"** *(recorded 2026-09-20, T1 pass 69, from the generator's own source)*: *"earlier manual edits to the `wrangler.*.jsonc` files directly were **silently erased by this exact script on the very next deploy, which is why production kept serving the old D1 code despite the repo's `.js` files already being correctly rewritten**."* **Production serves stale code while the repository looks correct** — a divergence code review cannot catch, because the reviewed artefact and the deployed artefact are different things. ⚠ **It lands harder on NBA**: **121 MLB wrangler configs are committed at the repo root and 0 NBA ones are**, so for an NBA worker there is no committed config to compare against. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 69*. Service bindings,
`compatibility_flags`, cron triggers and vars all belong in `generate_wrangler_configs.py`.
**This is why it is four edits, not three.**

### ⚠ THE NEVER-FIRE CRON IDIOM — and the platform gotcha that defeats it
```python
cfg["triggers"] = {"crons": ["0 0 30 2 *"]}   # February 30th — cannot occur
```
Used on **8 MLB workers** to **disable a schedule while keeping the worker deployed and callable**.
**Before concluding any worker is scheduled, check its cron for this pattern.**

**⚠⚠ BUT T1 RECORDS THAT THIS DOES NOT RELIABLY WORK:**
> *"**A specific, real Cloudflare Workers gotcha worth knowing in advance: A SCHEDULED CRON TRIGGER
> CAN PERSIST AND KEEP FIRING EVEN AFTER A SOURCE-LEVEL ATTEMPT TO RETIRE IT** — e.g. **setting an
> intentionally-invalid cron expression** — **MLB CONFIRMED THIS HAPPENING TWICE DESPITE A DEPLOYED
> FIX.**
> **If NBA hits the same platform behaviour, the RELIABLE FIX is to make THE SCHEDULED HANDLER ITSELF
> A GUARANTEED NO-OP (log and exit)** rather than continuing to fight the [platform]."*

**So the February-30th idiom is the *attempted* fix, and it was observed to fail twice.** The
**reliable** fix is a **no-op `scheduled()` handler**.

**Two consequences for auditing NBA:**
1. **A never-fire cron does not prove a worker is not running.** The only reliable evidence is
   whether the handler itself is a no-op, or observable writes.
2. **Conversely, a worker with a valid-looking cron may still be dormant** if its handler exits early.

**Directly relevant to the differential worker**: its schedule status was inferred from P1's workflow
steps and from empty tables. **Neither method is affected by this gotcha** — the tables are empty, so
it is genuinely not writing — **but any future "is this scheduled?" audit must check the handler, not
just the cron.**
| `nba/backtest/combos_ladder_v1.py` | the certified combos recipe — **its own `LADDER_STEPS`** |
| *(duplicate block removed 2026-09-20 — see §4 and §4b above)* |

**The patcher pattern:** production builders are string-transformers over the certified recipes, so the
certified file is never forked. A change must be applied to **both** recipes — singles and combos are
separate certified files each with its own constant.

---

## 5. SCORING ENGINE
| Script | Writes |
|---|---|
| `nba/build_final_hp.py` | `nba_score.final_hp` — the full chain. `FE_SEASONS`, `FE_PROPS`, `FE_WRITE`, **⚠ `FE_DATE` — see the warning below. It scopes the READ only.** |
| `nba/build_asof_calibration.py` | `ladder_calibration_asof` — weekly refits, strictly-before, prior-season inheritance |
| `nba/build_confidence_v3.py` | `confidence_model` — measured deductions |
| `nba/score_board_legs.py` | `nba_score.board_scored` — **board-scoped**, `MARKET_TO_PROP` mapping, log-odds interpolation for off-ladder rungs |
| `nba/build_availability_delta.py` | `availability_delta` — P2-view vs P3-view diff, minutes reallocation |
| `nba/build_board_tiers_v2.py` | `board_tiers_v2` — **four-way taxonomy** |
| `nba/build_blowout_model.py` | `blowout_model` — on the real market spread |
| `nba/build_rung_market.py` | `rung_market` — de-vigged book probability at DFS rungs, monthly blocks |
| `nba/export_market_spreads.py` | market spreads/totals |
| `nba/build_defender_ratings.py` | `nba_ref.defender_ratings` — two-way ridge |
| `nba/grade_board_outcomes.py` | `board_outcomes` — 6.9M legs |
| `nba/fit_n1_model.py` | availability model, AUC 0.630 |
| `nba/build_scenario_calibration.py` | `scenario_realised` — **no longer daily** |

---

### ⚠⚠ `FE_DATE` IS A READ FILTER, NOT A WRITE SCOPE — **confirmed destructive**
*Found 2026-09-20 (T1 pass 33) by running §0e's scope-parameter audit against the first parameter on
the list. **VERIFIED by grep of `nba/build_final_hp.py` and by live SQL.***

**The read is scoped:**
```sql
FROM nba_score.baseline_history
WHERE season=%s AND prop=%s AND (%s = '' OR game_date = NULLIF(%s,'')::date)
```
**The write is not:**
```sql
DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s    -- no game_date
```
**A slate-scoped run with `FE_WRITE=1` replaces the entire season × prop partition with that one
slate.** Measured damage, live 2026-09-20: **the 2025-26 partition of `nba_score.final_hp` holds one
date and 140,130 rows against a documented 38.7M-row table.** Full entry at the top of
`NBA_OPEN_ITEMS.md`; row counts in `NBA_DATABASE.md`.

**⚠ The previous description in the table above was inherited from a comment in the source file that
is itself wrong.** The comment reads *"P3 sets it so the afternoon pipeline rescores only today's
legs."* **VERIFIED: P3 does not set `FE_DATE`, and P3 does not run `build_final_hp.py`** — its scoring
step is `python nba/score_board_legs.py`. The only repo caller that sets `FE_DATE` is
`.github/workflows/nba-engine-test.yml`, **with `FE_WRITE: '0'`**.

**This is §0e's audit finding its first hit on its first candidate.** The remaining scope parameters
in that table — `BT_*`, `PIPE`, the scraper date ranges, the writer-worker mode branches — **are still
NOT AUDITED.**

---

## 6. VERIFIERS
| Script | Asserts |
|---|---|
| `nba/certify_pipeline.py` | per-pipeline artefacts present and fresh — **`PIPE=p1\|p2\|p3`**, exits non-zero |
| `nba/check_delta_gaps.py` | **no silent delta hole** — dates, games, both teams, roster rate, freshness |
| `nba/check_baseline_board_coverage.py` | board legs covered by the ladder |
| `nba/check_season_coverage.py` | season-wide coverage (89.6% of the real PP board) |
| `nba/find_delta_test_date.py` | finds dates that exercise the reallocation branch |
| `nba/measure_report_cutoff.py` | empirical cutoff measurement |
| `nba/run_storage_diet.py` | VACUUM + index audit, **row-count guards** |
| `nba/nba_names.py` | shared name resolution — `nba_ref.player_name_map`, 5,212 players |

---

## 6b. EVERY DESTRUCTIVE STATEMENT IN THE CODEBASE — the complete audit
*Recorded 2026-09-20 (T1 pass 34). **VERIFIED** by grep of all 190 `.py`/`.js` files in `nba/`
(including `backtest/` and `workflows/`) for `DELETE FROM` and `TRUNCATE`. **24 statements.**
This is blueprint §9's **whole-universe comparison** applied to the write path: audit every member of
a universe at once, not the one currently suspected.*

### ✅ Correctly scoped — the delete matches exactly what the run rewrites

> ⚠ **TEN SCRIPTS ARE LISTED BELOW. THERE IS AN ELEVENTH, AND IT IS THE ONE THAT IS *NOT* SCOPED: `build_final_hp.py`.** *Back-pointer added T20 pass 79 (§T20.84) — **the defect is already documented fifty lines above, at `### ⚠⚠ FE_DATE IS A READ FILTER, NOT A WRITE SCOPE — confirmed destructive`**, and in `NBA_GLOSSARY.md` under `FE_DATE`. **This heading is sound; a reader who lands on the table alone should not have to take its green check as covering every writer.*** ▶ *`DELETE FROM nba_score.final_hp WHERE season AND prop` carries **no date predicate**, so a slate-scoped run replaces the whole season × prop partition — **CONFIRMED FIRED**: 2025-26 holds one date and `140,130` rows.*
| Script | Statement | Scope |
|---|---|---|
| `score_board_legs.py` | `DELETE FROM nba_score.board_scored WHERE game_date = %s` | one slate — **the P3 scorer** |
| `build_availability_delta.py` | `DELETE FROM nba_score.availability_delta WHERE game_date = %s` | one slate |
| `build_rung_market.py` | `DELETE FROM nba_market.rung_market WHERE game_date >= %(d0)s AND game_date < %(d1)s` | a date range |
| `load_baseline_ladder.py` | `DELETE FROM nba_score.baseline_ladder WHERE asof = %s` · `… baseline_ladder_runs WHERE asof = %s` | one as-of |
| `load_baseline_history.py` | `DELETE FROM nba_score.baseline_history WHERE season = %s AND prop = ANY(%s)` | matches its full-season input |
| `gate_remaining_factors.py` | `DELETE FROM nba_score.factor_gate_results WHERE slice='remaining_factors'` | own partition |
| `fit_n1_model.py` | `DELETE FROM nba_score.factor_gate_results WHERE slice = 'n1_ablation'` | own partition |
| `build_confidence_v3.py` | `DELETE FROM nba_score.confidence_verification WHERE tier='v3'` *(×2)* | own partition |
| `build_confidence_v2.py` | `DELETE … confidence_verification WHERE tier IN ('v2','high_vs_low')` | own partition |
| `build_mondrian_confidence.py` | `DELETE … confidence_verification WHERE check_type='mondrian_quintile'` | own partition |

**The convention is unambiguous: scope the delete to exactly what this run rewrites.**

### ✅ Whole-table rebuilds that are correct BY DESIGN — single writer, small table, full recompute
`build_blowout_model.py` → `blowout_model` (35 rows) · `build_scenario_calibration.py` →
`scenario_calibration` · `build_mondrian_confidence.py` → `conformal_confidence` ·
`build_confidence_v3.py` → `confidence_model` · `build_asof_calibration.py` →
`ladder_calibration_asof` · `build_board_tiers_v2.py` → **`TRUNCATE`** `board_tiers_v2` ·
`alphadog-v2-nba-weekly-differential.js` → `player_roster_snapshot`, `team_roster_snapshot`,
`official_roster_snapshot` *(the documented snapshot replace-in-full design)*.
**Recorded so a future audit does not re-flag them.**

### ❌ The three that are wrong — full entries in `NBA_OPEN_ITEMS.md`
| Script | Statement | Defect |
|---|---|---|
| **`build_final_hp.py`** | `DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s` | **the read is `FE_DATE`-scoped and this is not** — a slate-scoped run replaces the whole season × prop partition. **CONFIRMED FIRED: 2025-26 holds one date, 140,130 rows.** |
| **`verify_confidence.py`** | `DELETE FROM nba_score.confidence_verification` | **whole table, while three sibling writers scope theirs** — running it erases P2's nightly `v3` rows and the mondrian rows. **Not yet fired** *(re-verified live 2026-09-21, §T9.46a: **34 · 5 · 21** rows, all `run_at` values **UTC**)*: the live table holds three generations coexisting (2026-09-17 18:16, 2026-09-17 23:31, 2026-09-20 03:30). |
| **`calibrate_all_props.py`** | `CREATE TABLE IF NOT EXISTS … ladder_calibration; DELETE …; INSERT …` | **recreates a table that was deliberately DROPPED as a parity violation.** VERIFIED absent from `information_schema`. Nothing reads it, so it pollutes the schema without changing a number — **today.** |

**⚠ The pattern worth carrying forward**: in all three cases the statement is **correct in
isolation** and wrong **relative to its caller** — a scoped read, a shared table, a dropped table.
**None of them errors.** This is why blueprint §9 prescribes auditing the whole universe rather than
the suspect.

---

## 6c. ⚠ THE DESTRUCTIVE AUDIT ABOVE COVERS SQL ONLY — workflows can delete files too
*Recorded 2026-09-20 (T1 pass 70). **VERIFIED** on the live clone.*

§6b is titled *"every destructive statement in the codebase."* **It enumerates SQL.**
**`.github/workflows/nba-pairs.yml` deletes committed repository files with a shell command**, gated
on a `workflow_dispatch` input:
```yaml
if [ "${PAIRS_REBUILD}" = "1" ]; then
  for s in $(echo "$PAIRS_SEASONS" | tr ',' ' '); do
    slug=$(echo "$s" | tr '-' '_')
    rm -f nba/data/nba_pairs_${slug}_*.json
```
**Default `0`, manual-only — it cannot fire by accident.** Its stated purpose: the first run used a
league-wide call capped at 2,000 rows, and *"those files must be removed before rebuilding, since the
scraper skips snapshots that already exist."*
⚠ **Only this one workflow was examined closely. Whether any of the other 31 `nba-*.yml` files
carries a destructive shell step is NOT RECORDED.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 70*.

---

## 7. WORKFLOWS
| Workflow | Trigger |
|---|---|
| `nba-p1-weekly-static.yml` | **cron Mondays 12:00 PT** |
| `nba-p2-overnight-heavy.yml` | dispatch (cron at season start: 01:00 PT) |
| `nba-p3-afternoon-light.yml` | dispatch (cron at season start: 1:15 PM PT) |
| `nba-boards-market.yml` | dispatch — own concurrency group, never queues behind MLB |
| `nba-engine-test.yml` | dispatch — **read-only, own queue**, so a 4-min test never waits on a 45-min write |
| `nba-scrape.yml` | push to `nba/TRIGGER_NBA_SCRAPE.txt` |
| `nba-probe.yml` | push to `nba/TRIGGER_NBA_PROBE.txt` (`script: <name>.py`) |
| `nba-baseline-history.yml` / `nba-combos-history.yml` / `nba-periods-history.yml` | dispatch, per prop pair per season |
| `nba-daily-delta.yml` · `nba-overnight-queue.yml` · `nba-season-tables.yml` | dispatch |

**Every workflow:** `persist-credentials: true`, **retry-with-rebase on push**, and **no
`|| echo failed`**.

---

## §0.002-T18-CORRECTION — ⚠⚠⚠ THE SECTION BELOW OVERSTATED ITS CASE; THE ORDERING REFUTES IT
*(written 2026-09-22, same pass, on reading further into the same stratum — **the SECOND such
retraction in this pass**, and the reason `RULE 39` exists. Recorded in place, per the §0w precedent.)*

### WHAT THE SECTION BELOW GOT WRONG

It says: *"the fallback exists and is correctly argued — and on 2025-26 it was ALSO empty"*, and flags
*"NOT RECORDED: why the team-log witness was empty for 2025-26 while 2024-25's was not."*
🔴 ***BOTH ARE WRONG, AND THE CAUSE IS AN ORDERING ERROR: THE FALLBACK DID NOT YET EXIST WHEN THE
2025-26 RUN EXECUTED.***

### ✅ THE ACTUAL SEQUENCE, FROM THE `tool_use`/`tool_result` ORDER

| # | seg | what happened |
|---|---|---|
| 1 | **624–628** | `check_delta_gaps.py` is **written**, and its `if not expected:` branch is terminal: *"nothing to audit — this is expected in the off-season. not a failure."* → `sys.exit(0)`. **No fallback.** |
| 2 | **639** | dispatched `task=gaps`, **season 2025-26** |
| 3 | **run `35466211139`, 20:04:19** | *"No COMPLETED games in the schedule for 2025-26 … Nothing to audit … Not a failure."* **exit 0** — ***on the no-fallback version*** |
| 4 | **647** | 🔑 **the author IMMEDIATELY PATCHES IN the team-game-log fallback**, with the diagnosis in the patch's own comment: *"`nba_schedule_current.json` only carries the UPCOMING season, so in the off-season — or when auditing a past season — it has nothing to compare against."* |
| 5 | **649** | dispatched again, **season 2024-25** |
| 6 | **run `35466481270`, 20:09:34** | *"falling back to the team game log as the independent witness"* → **"gaps found: 2 truncated team-games"**, `0022401178` TOR |

⇒ 🔑 ***The blind spot was real, was found by running it, and was FIXED WITHIN FIVE MINUTES BY THE
AUTHOR HIMSELF.*** **It is not a standing defect of the shipped code** *(the fallback is present in
live source at `check_delta_gaps.py` lines 77–80, verified 2026-09-22)*.

### ⇒ WHAT SURVIVES, RESTATED AT THE RIGHT STRENGTH

| below | verdict |
|---|---|
| *"THE GAP DETECTOR PASSED AN ENTIRE SEASON AS 'NOT A FAILURE'"* | ⚠ **TRUE OF THE VERSION THAT RAN, FOR FIVE MINUTES.** **Retitle it: *a green exit on an empty expected-set, caught and fixed in-session.*** The 🔴🔴🔴 severity is withdrawn. |
| *"the fallback … on 2025-26 it was ALSO empty"* | ❌ **WITHDRAWN** — the fallback did not exist yet |
| *"NOT RECORDED: why the team-log witness was empty for 2025-26"* | ❌ **WITHDRAWN** — it was never consulted for 2025-26 |
| *"the prose's claim … is TRUE OF 2024-25 AND OF NOTHING ELSE"* | ✅ **STANDS, and is now the section's real finding** |
| the `[LIVE-AUDIT]` schedule table, rule 37 framing, the *"green run with an empty table"* quotation | ✅ **STAND** |
| the consequence for **T18-6** *(the 0.5% threshold's 2025-26 numerator and its missing denominator)* | ✅ **STANDS UNCHANGED** |

### 🔴 AND THE FINDING THAT REPLACES IT — *the fix was never verified on the season that exposed it*

**After the fallback was added, `check_delta_gaps.py` was re-run on 2024-25 and worked.**
🔴 ***It was never re-run on 2025-26.*** **No `tool_result` in the 860 mechanism segments shows a
2025-26 gap audit executing against the team-log witness.**
⇒ **The season that exposed the blind spot is the one season the fix has not been demonstrated on**,
and it is the season holding **19,611,626** scored legs. **Severity: MEDIUM** — one dispatch settles
it. *Open item T18-12. Documented, not fixed.*
⚠⚠ **FIGURE DATED — T20 pass 75 (§T20.80), 2026-09-22: live `nba_score.final_hp` holds **`140,130`** legs for `2025-26` (`19,075,070` for `2024-25`).** *The `19,611,626` was true when written — `19,075,070 + 19,611,626` = the old `38.7M` total §T20.8 corrected — and the table has since been rebuilt.* ✅ **`T18-12` STANDS: the season was still never audited. **Severity is if anything LOWER**, because the unaudited season is now small.** ▶ **Second site of this figure dated at `:1866`; both carry the correction (rule 10 — a correction reaches every copy).** **Original kept, per rule 40.**

🔑 **This is a general shape worth naming and it is not rule 37**: ***a fix written in response to a
failing run is verified by re-running the case that failed — not by running a different case that
was already passing.*** *2024-25 had a populated `nba_schedule_current.json` path available; it was
never the case in doubt.*

---

## §0.002-T18 — ⚠ SEVERITY WITHDRAWN AND SCOPE NARROWED BY THE CORRECTION ABOVE *(2026-09-22)*
### a green exit on an empty expected-set — caught and fixed in-session, five minutes apart
*(T18 pass 2, mechanism strata, written 2026-09-22. **Rule 38**: this is the causal layer — what was
actually RUN and what it RETURNED. The prose credits this component; only the `tool_result` shows what
it was credited FOR.)*

### THE TWO RUNS, FIVE MINUTES APART, SAME SCRIPT — *both quoted from the executed log*

| when *(executed, in-log)* | season | what `check_delta_gaps.py` printed | exit |
|---|---|---|---|
| **2026-09-19 20:04:19** | **2025-26** | *"No COMPLETED games in the schedule for 2025-26 in range [start .. end]."* → ***"Nothing to audit — this is expected in the off-season. Not a failure."*** | **0 — GREEN** |
| **2026-09-19 20:09:34** | **2024-25** | *"newest completed slate in schedule: 2025-04-13 / newest slate in the delta: 2025-04-13 OK"* → ***"gaps found: 2 truncated team-games"***, naming **`0022401178` TOR, only 7 players** | **non-zero — RED** |

🔑🔑 ***The prose's claim is "gap detector — ran on a full season, caught 2 real anomalies." That is
TRUE OF 2024-25 AND OF NOTHING ELSE.*** **The 2025-26 season — the season for which
`nba_score.final_hp` holds 19,611,626 legs — was never audited, and the audit reported that as a
pass.**

> ⚠⚠ **FIGURE DATED, NOT RETRACTED — T20 pass 75 (§T20.80), 2026-09-22T19:50Z. RE-DERIVED LIVE: `nba_score.final_hp` holds **`19,075,070`** legs for `2024-25` and **`140,130`** for `2025-26`.** 🔴 ***The `19,611,626` is off by a factor of `140` TODAY, and it inverts this sentence's emphasis: 2025-26 is the THIN season in `final_hp`, not the large one.*** ✅ **AND IT WAS TRUE WHEN WRITTEN, PROVEN BY ARITHMETIC: `19,075,070 + 19,611,626 = 38,686,696` — the old **`38.7M`** total that **§T20.8** corrected to `19,215,200`. The table was rebuilt underneath the figure.** 🔴🔴 ***§T20.8's correction reached the TOTAL and never reached this PER-SEASON figure — and rule 40's propagation instrument could not have found it, because nothing here was ever struck.*** ⚠⚠ **AND THE MOVEMENT WAS ALREADY ON FILE — read those first, they carry the analysis this note does not**: **`NBA_OPEN_ITEMS.md:292` · `:362` · `:377`**, a `[LIVE-AUDIT]` item stating *"2025-26 was 19,611,626 six days ago and is 0.7% of that today, while the other season is byte-exact"*, plus **`NBA_FINAL_SCORING_CALIBRATION.md:240`/`:1569`** and **`NBA_MASTER_SUMMARY.md:27268`**. 🔑 ***So the defect this note repairs is PROPAGATION, not discovery: three documents carried the current figure while `NBA_WORKERS.md` carried the superseded one at two sites, un-dated. §T20.80 first published this as a new finding and withdrew that claim in the same pass.*** 📌 ***A correction recorded by ADDING the new figure in another document is invisible to an instrument that starts from strikethroughs.*** ⚠ **THE FINDING ITSELF IS UNAFFECTED**: *2025-26 was still never audited, the audit still reported that as a pass, and open item **T18-12** still stands. **Only the magnitude that made it sound urgent has moved** — and on today's figures the unaudited season is small, which LOWERS the exposure rather than raising it.* **Original kept, per rule 40.**

### ✅ THE CAUSE IS VERIFIED IN SOURCE, NOT INFERRED FROM LIVE STATE *(rule 6)*

**`nba/check_delta_gaps.py`, read directly 2026-09-22** *(9,182 B, 195 lines)*:
- **line 49** — the expected set is built from **`fetch("nba_schedule_current.json")`**, a repo file, **not** from Postgres.
- **line 67** — `if "final" not in status: continue` — ***"only completed games can be in the logs."***
- **lines 77–80** — the script's own comment states the limitation: ***"`nba_schedule_current.json` only carries the UPCOMING season, so in the off-season — or WHEN AUDITING A PAST SEASON — it has nothing to compare against."***
- It then **falls back to an independent witness**, the **TEAM game log**, with the reasoning recorded: *"a SEPARATE pull from the player game log, so using it as the expected set is a genuine cross-check, not a circular one."*

⇒ **The fallback exists and is correctly argued — and on 2025-26 it was ALSO empty**, because the
executed run reached the terminal `sys.exit(0)` message rather than the team-log audit.
⚠ **NOT RECORDED: why the team-log witness was empty for 2025-26 while 2024-25's was not.** *Rule 6 —
no swept transcript explains it, and this sweep does not explain it from live state.*

### ⚠ `[LIVE-AUDIT]` 2026-09-22 — *what the schedule holds now, recorded as fact, not as cause*

**`nba_market.schedule_norm`** *(read-only `SELECT`, bucketed on `game_date` — the table has only
`game_id`, `game_date`, `home`, `away`; it carries **no** season or status column)*:

| bucket | games | first | last |
|---|---|---|---|
| 2024-25 | **1,230** | 2024-10-22 | 2025-04-13 |
| **2025-26** | **1,230** | 2025-10-21 | **2026-04-12** |

**So a full 1,230-game 2025-26 schedule exists in Postgres, ending five months before the audit
ran.** ⚠⚠ **Stated at the strength the evidence supports: this table is a SCHEDULE and carries no
status column, so it is evidence that the games were SCHEDULED, never that they were played or
captured.** *The 19.6M scored legs are the evidence for that, and they are recorded elsewhere.* 🔑
**And it is NOT the table the audit reads** — the audit reads a repo JSON file, so this row count
does not contradict the audit; it measures the distance between what the system knows and what the
audit can see.

### 🔑 THIS IS RULE 37's THIRD OUTCOME, IN ITS PUREST FORM

**Rule 37**: *a failure census has three outcomes — RECORDED · ATTRIBUTED-BUT-UNDIAGNOSED · SILENT.*
**A green exit on an empty expected-set is the SILENT outcome**, and here the silence is *worded as
reassurance*: **"Not a failure."**

⚠⚠ **And the transcript contains its own refutation, written by the same author about a different
component in the same session**: ***"it asserts legs actually landed, because A GREEN RUN WITH AN
EMPTY TABLE IS THE FAILURE THAT HIDES BEST."*** 🔑 **He wrote that assertion into the board scorer and
did not write it into the gap audit.** *(Rule 18's pattern: the refutation was in hand before the
claim was made.)*

### ⚠ CONSEQUENCE FOR THE 0.5% THRESHOLD — *open item T18-6, now upgraded*

The recalibration comment states the threshold was *"calibrated on measured data: 2024-25 had 2 of
~2,460 (0.08%) and 2025-26 had 7."* 🔴 **Of that pair, only the 2024-25 half was produced by an
executed run in this transcript** *(20:09:34, `gaps found: 2`)*. **The 2025-26 "7" was produced by a
DIFFERENT invocation — the P2 replay scoped to 2026-01-15 — not by the season-wide audit, which on
2025-26 returned nothing at all. Its denominator is stated nowhere.** ⇒ **The threshold's calibration
rests on one measured season and one unmeasured figure.** *Documented, not fixed.*

---

## §0.003-T18 — ✅ THE MECHANISM STRATA, PINNED AND ACCOUNTED FOR
*(rules 17/21/25 · population pinned 2026-09-22T11:08:21Z from `sweep_coverage.segments`)*

**T18 = 1,205 segments, and the partition CLOSES**: `tool_use` **463** + `tool_result` **397** +
assistant text **254** + human **57** + `thinking` **34** = **1,205** ✅.
**Mechanism strata = 860 = 71.4%**, **597,662 chars** *(`tool_use` 241,732 + `tool_result` 355,930)*.

**Tool census — the whole of `tool_use`, and it closes to 463** ✅:

| tool | calls |
|---|---|
| `github_patch_file` | **113** |
| `github_put_file` | **87** |
| `bash_tool` | **75** |
| `run_sql_postgres` | **65** |
| `github_grep_file` | **53** |
| `github_trigger_workflow` | **37** |
| `github_get_workflow_run_log` | **31** |
| `web_search` | **2** |

🔑 **`github_trigger_workflow` 37 is the number behind "nineteen defects, every one found by
execution"** — *thirty-seven dispatched runs is what "running it" cost.*
🔑 **`github_put_file` 87 against `github_patch_file` 113** — **87 whole-file writes in one session**,
against a sweep standing rule that forbids `put_file` on its own documents.

**⚠ READING RESOLUTION, DECLARED (rule 25).** All 860 were passed through a classifier and **every one
is accounted for**: **618 SUBSTANTIVE**, read; **242 BOILERPLATE**, counted and characterised —
**102** `github_patch_file` 200-OK receipts *(`{ok, status 200, commit_sha, file_sha, note}`, < 300
chars, no other content)*, **54** `sleep N; echo ok` waits, **47** `github_list_workflow_runs` result
polls, **39** `workflow_dispatch` 204 receipts. **618 + 102 + 54 + 47 + 39 = 860** ✅. *Nothing was
skipped silently; the boilerplate classes are stated so the omission is auditable.*

## §0.005-T18 — THE MECHANISM FAILURE CENSUS (RULE 37), WITH ITS PARTITION CLOSING
*(T18 pass 5, 2026-09-22 · **predicate fixed BEFORE the pass so it could not be widened to fit**:
every `tool_result` whose payload carries `"conclusion": "failure"`, `"ok": false`, a 4xx/5xx
`status`, `Traceback`, `Error`, `error occurred during tool execution`, or a tool-unavailability
notice)*

### ✅ RULE 22 POSITIVE CONTROL RAN FIRST — *all seven patterns fired on a known-positive string*
*Before any zero is trusted. T16's census produced false positives from the sweep's own grep
patterns, and this very pass produced five more (below).*

### THE CENSUS — **397 `tool_result` · 48 signal hits (12.1%) · 5 FALSE POSITIVES · 43 REAL**

🔴 **THE FIVE FALSE POSITIVES, NAMED, BECAUSE THE CLASS RECURS** — *in every one, the word `error`
is part of the CONTENT being read, not a failure of the read*:
**SEG 176** the `board_payout_conversion_rules` config, which contains *"trial and error"* and *"a
units error"* · **SEG 440** COMPASS fact 102's text, *"a measurement error worth remembering"* ·
**SEG 590** `nba-daily-delta.yml`, which literally contains `continue-on-error: true` · **SEG 1103**
a grep returning the code fragment `error" or ""` · **SEG 1160** a bash line reading *"error, not a
product"*.
🔑 ***A census on a tool's OUTPUT cannot distinguish the tool failing from the tool successfully
returning a document about failure.*** *(Rule 15's shape: a pattern tuned elsewhere mis-measures, and
the wrong number is not always zero — here it was five too high.)*

### ✅ THE 43 REAL RESULTS, PARTITIONED — **and the partition CLOSES**

| group | n | segments |
|---|---|---|
| **Workflow runs concluding `failure`** | **19** | 190·192·199·416·531·533·642·643·652·654·762·764·787·789·923·925·928·1188·1190 |
| **`github_get_workflow_run_log` — job list `not found` (404)** | **7** | 122·410·616·919·987·1003·1202 |
| **Bridge `error occurred during tool execution`** | **6** | 81·83·328·330·332·460 |
| **SQL relation / column does not exist** | **4** | 922·944·1187·1200 |
| **`github_get_workflow_run_log` — *"could not fetch log text (link may have expired, or run is too old)"*** | **3** | 778·796·810 |
| **`github_grep_file` 404 — file does not exist** | **2** | 164·1164 |
| **Bridge tool unavailable for a whole turn** | **1** | 150 |
| **PrizePicks `HTTP Error 403: Forbidden` inside a run log** | **1** | 201 |
| **TOTAL** | **43** ✅ | *6+1+7+3+2+4+19+1 = 43* |

### 🔑 RULE 37's THREE OUTCOMES, AND THE ONE THAT MATTERS

**RECORDED** — the transcript names the failure AND its cause, and the twelve carry it: the six
bridge errors and the one outage *(§0.003-T18)*; the probe's `can't find '__main__' module`
*(diagnosed and fixed in-session)*; `ModuleNotFoundError: pandas` *(T18-11)*; `VACUUM FULL` defeated
by the disk pressure that made it necessary *(`NBA_OPEN_ITEMS` §CAVEAT)*; the gap audit's **intended**
red *(§0.002-T18 — a failure that is the component working)*; the DataDome 403s *(§0.7-T18)*.

🔴🔴 **ATTRIBUTED-BUT-UNDIAGNOSED — the ten log-read failures, and they are the mechanism behind the
transcript's most consequential gap.** **Seven 404s on the job list and three *"link may have
expired, or run is too old"*, two of the three on the SAME job id `105963684307`.** *The prose
attributes this — **"it aged off the recent list before I could read its result"** — and never
diagnoses it.* ⇒ ***This is WHY T18-8 exists: the P2 end-to-end run's outcome, and the 140,130-leg /
0.930-confidence comparison the author called "the real test", were never read because the log could
not be fetched.*** **The failure was not in the pipeline. It was in the instrument used to observe
it.** 🔑 **Rule 37's middle outcome, doing exactly the work it was written for.**

**SILENT — none found.** *Every one of the 43 surfaces in the transcript itself. The census's job was
to find failures the transcript does not show, and in T18 there are none: the author read and
reported his failures, which is the opposite of the pattern rule 37 was born from.*

### ✅ THE FOUR SQL "DOES NOT EXIST" ERRORS RESOLVED AGAINST LIVE STATE — *and they are NOT defects*
**SEG 922** `relation "nba_score.board_scored" does not exist` · **SEG 944** `column "built_at" does
not exist` · **SEG 1187 & 1200** `relation "nba_market.board_tiers_v2" does not exist` — **and 1187
and 1200 are the LAST two SQL failures in a 1,205-segment transcript**, i.e. ***T18 ENDS with the
four-way tier rebuild dispatched and its table not yet confirmed.***
✅ **`[LIVE-AUDIT]` 2026-09-22 settles it**: **`nba_market.board_tiers_v2` = 2,199,354 rows —
EXACTLY equal to `nba_market.board_tiers`** · **`nba_score.board_scored` = 12,818,715 rows** · and a
**`nba_score.board_scored_snapshot_20260920`** at 110,955 rows. ⇒ **Both tables landed, and the
snapshot's date says the work completed the same day the transcript ends.** ⚠ **Rule 6: the sweep
records that they exist and match; it does not claim which run created them, because no swept
transcript says.**

### ⚠ THE RUN LEDGER — *the number behind "nineteen defects, every one found by execution"*
**135 distinct workflow run ids appear in T18**: **74 success · 23 CANCELLED · 20 pending/other ·
18 failure.** **Restricted to `nba*`-named runs — the ones this session dispatched — 33 distinct:
15 success · 11 pending/other · 7 failure.**
🔑 **So roughly ONE IN THREE of the session's own NBA runs failed**, and **23 cancelled runs** are the
self-cancelling auto-deploys already recorded at §0.000. ***The failure rate IS the method: thirty-
seven dispatches and a one-in-three failure rate is what "found by running it, not by reading it"
costs.***

---

## §0.004-T18 — 🔴🔴 THE CERTIFIER CANNOT TELL A FULL SLATE FROM ONE ROW
*(T18 pass 2 · `certify_pipeline.py` written in-session at `tool_use` SEG 601–605, and **re-read from
LIVE SOURCE 2026-09-22 — 5,920 B, 129 lines, UNCHANGED in structure**. This is a claim about what the
code CHECKS, verified by reading the code, not an inference about a sequence of runs.)*

**The certifier is the system's answer to its own worst memory**, and it says so: *"a missing 44% of
the board (the combos ladder) went unnoticed for two days because steps were written `|| echo
failed`, and four jobs failed silently for an hour while row counts alone looked stable… a pipeline
that cannot fail loudly is a pipeline you cannot trust unattended — and these three run unattended
every day."* **`CERT_STRICT=1` by default; any failed check `sys.exit(1)`.**

> 🔴🔴🔴 **AND THAT IS WHAT FIRES `T20-13`, THE BRIEF'S NUMBER-ONE ITEM — TWELVE RED NIGHTS FROM OPENING NIGHT.** *(🔴 **CORRECTED 2026-09-23, §T20.135**: `T20-13` is ranked **second**, after `A`, not first — see the live ranked string; and the mechanism fires only once `T20-6` is resolved, because `certify_pipeline.py`'s first `p2` check — `baseline_history has today` — **fails earlier and every night**. `CERT_STRICT=1` remains exactly as described below; what is corrected is WHICH check trips and FOR HOW LONG.)* *Added here T20 pass 78 (§T20.83), 2026-09-22: **this page gave the MECHANISM (`CERT_STRICT=1` → `sys.exit(1)`) and not the GATE that trips it**, and a person working on the certifier reads this page.* ▶ **P2's check requires `>= 25` distinct props in `baseline_history`.** **Live, both prior seasons: OCTOBER carries `22` distinct props; NOVEMBER carries `30`** *(re-derived `2026-09-22T19:16Z`, §T20.74 — `892,599` and `3,281,336` rows)*. 🔴 ***So from opening night `2026-10-20` through `2026-10-31` the gate cannot be met — **twelve consecutive red nights**, and with `CERT_STRICT=1` each one exits non-zero.*** 🔴🔴 **CORRECTED 2026-09-23 (T20 pass 130, §T20.135) — SIBLING OF THE SAME ERROR IN `NBA_RECIPE.md`.** *The `>= 25` prop gate is the SECOND `p2` check. The FIRST — `baseline_history has today > 0` — **fails first and fails every night**, because **no pipeline step writes `nba_score.baseline_history`** (`T20-6`, `§T20.134`).* ⇒ ***Red does not stop on `2026-11-01`; it continues all season, and the prop gate is never the binding check.*** 🔑 **`T20-13` is CONDITIONAL on `T20-6` being resolved first** — *the same prerequisite argument the brief already makes for item `A`, applied to a second prerequisite it never named.* ⚠ **Those same twelve nights are inside `T20-12`'s PDT window, where `p3_cut` is an hour late.** ▶ **Full item: `T20-13` in `NBA_OPEN_ITEMS.md` (§T20.52), ranked FIRST on the OPENING-DAY BRIEF; re-derived and HELD at §T20.74.** ⚠ *Documented, not fixed (rule 1).*

### ✅ ALL TWELVE CHECKS, WITH THEIR ACTUAL PREDICATES *(live source, verbatim `lambda`s)*

| pipe | check | predicate | is it a PLAUSIBILITY gate? |
|---|---|---|---|
| **P1** | `defender_ratings refreshed` | `(today − max(as_of_date)).days <= 8` | ✅ freshness |
| **P1** | `defender_ratings rows` | `int(v) > 10000` | ✅ **magnitude** |
| **P1** | `player name map populated` | `int(v) > 400` | ✅ **magnitude** |
| **P2** | `baseline_history has today` | `int(v) > 0` | ❌ |
| **P2** | `baseline props for today` | `int(v) >= 25` | ⚠ **magnitude — but on DISTINCT PROPS, not rows** |
| **P2** | `no invalid probabilities today` | `int(v or 0) == 0` | ❌ *vacuous on a small population* |
| **P2** | `as-of calibration available` | `int(v) > 0` | ❌ |
| **P3** | `final_hp has today` | `int(v) > 0` | ❌ |
| **P3** | `confidence populated` | `count(NULL) == 0` | ❌ *vacuous* |
| **P3** | `score in range 0-100` | `count(out of range) == 0` | ❌ *vacuous* |
| **P3** | `confidence model loaded` | `int(v) > 0` | ❌ |
| **P3** | `board archived today` | `int(v) > 0` | ❌ |

### ⇒ 🔴🔴 **P3 HAS NO MAGNITUDE CHECK AT ALL, AND P3 IS THE PIPELINE THAT RUNS EVERY GAME DAY**

> 🔴🔴🔴 **AND P3 IS STILL HARDCODED TO *LAST* SEASON — `T20-4`, the brief's HIGHEST-ranked pure-P3 item.** *Added here T20 pass 78 (§T20.83), 2026-09-22: **this document names P3 fourteen times and never mentioned `BS_SEASON`**, and a person working on P3 reads this page.* ▶ **`.github/workflows/nba-p3-afternoon-light.yml`** — `:38` `default: "2025-26"` and `:205` `BS_SEASON: ${{ github.event.inputs.season || '2025-26' }}`. 🔴 ***The 2026-27 regular season opens `2026-10-20`. Unless the input is supplied by hand every run, P3 scores the wrong season.*** ▶ **Full item: `T20-4` in `NBA_OPEN_ITEMS.md`; re-derived and HELD at §T20.75, `2026-09-22T19:25Z`.** ⚠ **`VALIDATABLE NOW`** — *it is workflow text; the fix and its proof need no live board data (§T20.75).* ⚠ *Documented, not fixed (rule 1).*

***A P3 run that scores ONE leg passes all five checks***: one row makes `count(*) > 0` true; among
one row there are zero NULL confidences and zero out-of-range scores, so both `== 0` checks pass
**vacuously**; the confidence model is a standing table; and one archived board leg satisfies the
fifth. ⇒ **"5/5 checks passed. Pipeline certified."**

⚠ **And P2's one gate is on `count(DISTINCT prop)`, not rows** — so P2 also certifies on **25 props ×
one row each**, twenty-five legs standing in for a full slate.

🔑🔑 **THE TRANSCRIPT CONTAINS ITS OWN INDICTMENT, WRITTEN BY THE SAME AUTHOR IN THE SAME SESSION.**
Of the board scorer he wrote: ***"it asserts legs actually landed, because A GREEN RUN WITH AN EMPTY
TABLE IS THE FAILURE THAT HIDES BEST."*** **He built that assertion into the scorer and did not build
it into the certifier — the component whose entire purpose is to make that assertion.**
⚠ **Stated at evidence strength**: the certifier is **not** empty-table-blind — `> 0` does catch a
truly empty table, which is the failure its docstring names. **What it cannot catch is a
PARTIAL slate**, which is the failure the 44%-combos-gap actually was. *The component is built
against the remembered symptom rather than the remembered cause.*

⚠ **The fix is one line per check and the system already knows the right shape** — P1's `> 10000` and
`> 400` are exactly it, and P2's own gap audit computes a **rate** for the same reason
*(§0.002-T18)*. **Documented, not fixed.** *Open item T18-14.*

---

### 🔴 THE BRIDGE FAILED THREE TIMES IN-SESSION — *the executed evidence for a claim the sweep already carries*

| seg | what came back |
|---|---|
| **81**, **83**, **328**, **330**, **332**, **460** | `{"error": "error occurred during tool execution", "request_id": …}` — **SIX** queries against `nba_score.final_hp` ⚠ **CORRECTED 2026-09-22 (pass 5's census): this row first said FIVE and omitted SEG 460**, an `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` on the `final_hp ⋈ baseline_history` join. *Found by the mechanical census, not by re-reading — which is the argument for running one.* |
| **150** | ***"tool 'mcp_alphadog_bridge_run_sql_postgres' is not available in this turn, nor is any other 'mcp_alphadog_bridge_' tool."*** — a hard tool outage, not a query error |

🔑 **This is the executed evidence behind the author's prose claim — recorded by this sweep at T17 as
the reason an incomplete replication pass went unverified — that *"the SQL bridge is timing out on the
large aggregates."*** ⚠ **Language at evidence strength**: the results show **failures**, and one of
them is an availability outage rather than a timeout. **The transcript does not print a timeout
message**, so *"timing out"* remains the author's characterisation, not a verified diagnosis. **What
IS verified: five aggregate queries against `final_hp` failed, and the whole bridge was unavailable
for one turn.**

---

# §F2.16 — 🔴 **FOUR WORKFLOW FILES ARE NAMED NOWHERE IN THE TWELVE, AND ONE OF THEM HOLDS A SEASON-CRITICAL DEFECT**

*Added 2026-09-23 by the transcript re-sweep, direction (b). **Found by an instrument, not by
reading**: extract every identifier from the `~12,686` uncovered-substantive segments, rank by
mentions × spread, keep the ones absent from all twelve. **`285` identifiers seen · `121` absent** —
and once the Python-traceback noise was discarded *(`stats.norm`, `stats.nbinom`, `base.py`,
`cursor.py` and the rest are **scipy and site-packages frames**, not this system)*, **what survived
was workflow filenames.**

**Re-derived from the authority** *(`.github/workflows/` listing, 2026-09-23, `40` files, each
filename grepped across all twelve)*:

| workflow | mentions in transcripts | transcripts | in the twelve |
|---|---|---|---|
| 🔴 **`nba-backtest.yml`** | 17 | 5 *(`T8`,`T9`,`T10`,`T12`,`T18`)* | ❌ **`0` of 12** |
| 🔴 **`nba-grader.yml`** | 11 | 3 *(`T13`,`T14`,`T18`)* | ❌ **`0` of 12** |
| 🔴 **`nba-measure-types.yml`** | 6 | 5 *(`T7`,`T9`,`T10`,`T12`,`T18`)* | ❌ **`0` of 12** |
| 🔴 **`nba-score-history.yml`** | 9 | 1 *(`T23`)* | ❌ **`0` of 12** |

**The other `36` are all named at least once** *(`nba-p3-afternoon-light.yml` `8` documents,
`nba-p1`/`nba-p2` `7`, `nba-engine-test.yml` and `nba-referees.yml` `6`…)*. ⇒ ***`4` of `40`, and
they are not obscure: three of the four are named in five separate transcripts each.***

## 1 · 🔴🔴🔴 `nba-grader.yml` — **`name: NBA Outcome Grader`** — and it holds `T20-5`'s defect a second time

| | |
|---|---|
| triggers | **`workflow_dispatch:` only — no `schedule:`** *(consistent with `T20-3` ④)* |
| timeout | **`330` minutes** |
| runs | `python nba/grade_board_outcomes.py` |
| inputs | `start` *(default **`2024-10-22`**)* · 🔴 `end` *(default **`2026-04-12`**)* · `limit_dates` *(default `0`, "use a small number for a smoke test")* |
| `env:` | `DATABASE_URL` · `GRADE_START: ${{ inputs.start \|\| '2024-10-22' }}` · 🔴 `GRADE_END: ${{ inputs.end \|\| '2026-04-12' }}` · `GRADE_LIMIT_DATES` |

🔴🔴🔴 ***`T20-5` locates the stale `2026-04-12` window in `grade_board_outcomes.py:167–168`. It is
ALSO here — twice — and the workflow passes `GRADE_END` EXPLICITLY.*** **So a corrected script
receives the stale date from the workflow and behaves exactly as before. Three sites must change,
not one.** *Filed onto `T20-5`; the item's severity is unchanged and its REMEDY is.*

## 2 · `nba-score-history.yml` — **`name: NBA Score History`** — a two-job pipeline with no record in the twelve

**Its own header comment states the purpose:** *"Scores the model over PAST dates into
`nba_score.board_scored`, point-in-time (`nba/score_history.py`), so the model has a scored history
to compare against PrizePicks' prices."* ⚠ *That comment cites `nba/PP_PAYOUT_FINDINGS.md, pending
item 1` — **but this workflow is NOT on the concurrent session's exclusion list** (only
`nba-pp-payout-map.yml` is), so it is recorded here.*

| job | what it runs | env |
|---|---|---|
| **`calibrate`** | `nba/build_asof_calibration.py` — *"rebuild the as-of calibration, every season in `final_hp`, oldest first"* | **`AC_K: '400'`** · **`AC_CADENCE_DAYS: '7'`** |
| **`score`** *(`needs: calibrate`)* | `nba/score_history.py`, an **8-way matrix** — *"Score chunk N of 8"* | `SH_FROM` · `SH_TO` · `SH_CHUNK` · **`SH_CHUNKS: '8'`** · `SH_SKIP_BUILT_AFTER` |

✅ **Safety properties, quoted from the file:** *"oldest first; **refuses to write an empty build**"*
· *"**Manual only**"* · *"**Re-running is safe: a date is replaced whole**."* 🔑 **A
refuses-to-write-empty guard is the opposite of the silent-failure class this corpus tracks — worth
recording as a POSITIVE control on the codebase's habits.**

## 3 · `nba-backtest.yml` and `nba-measure-types.yml` — **file-triggered, and both use the forbidden idiom**

**Both fire on `workflow_dispatch: {}` AND on `push:` with a `paths:` filter** — the trigger-file
pattern this corpus documents. `nba-backtest.yml` *(`name: NBA Backtest`)* runs
`nba/backtest/minutes_model_v1.py` among others; `nba-measure-types.yml` *(`name: NBA Measure Types
Backfill`)* runs `nba/scrape_nba_backfill_measure_types.py` with `PROXY_URL`.

🔪 **`continue-on-error: true` — KILLED under rules 26/28, with the count recorded.** *Both use it,
and so do nine other workflows. **Re-derived 2026-09-23: `11` of `40` workflows, `48` occurrences**
— `nba-scrape.yml` **15** · `nba-backtest.yml` **12** · `nba-backfill.yml` **4** ·
`nba-boards-market.yml` **4** · `nba-daily-delta.yml` **3** · `nba-diagnostic.yml` **3** ·
`nba-pergame-backfill.yml` **2** · `nba-season-tables.yml` **2** · `nba-game-officials.yml`,
`nba-measure-types.yml`, `nba-starter-status.yml` **1** each.* **The IDIOM and its rationale are
thoroughly on file** *(`§T2.10a`; *"15 of 16 scrape steps"*; `T20-10` for `nba-daily-delta.yml`)*
⇒ **not a new finding. The corpus-wide COUNT is the only new part, and it is recorded here rather
than filed as an item.**

⚠ **RULE 54.** *The gap scan ranks identifiers by mentions and spread; it cannot see a workflow
discussed only by its `name:` (`"NBA Outcome Grader"`) rather than its filename, and it discards
anything the segmenter's normalisation mangles.* ***"`4` of `40` filenames are absent", never "these
are the only undocumented workflows."***

---

# §F5.5 — 🔴🔴 **THE FILE CENSUS: `7` of `21` WORKERS and `27` SCRIPTS ARE NAMED IN ZERO OF THE TWELVE**

*Added 2026-09-23. **Found from the other side**: every `path:` written by `github_put_file` /
`github_patch_file` / `github_append` / `create_file` across all 24 transcripts was extracted —
**`306` distinct paths, `2,047` write calls** — then re-derived directly from the repo, which is the
authority, and it is that re-derivation which is published here.*

## 1 · 🔴 SEVEN STATIC WORKERS, UNDOCUMENTED — `7` of the `21` that exist

*`nba/alphadog-v2-nba-*.js` → **21 files**; `nba_config.worker_definitions` → **21 rows**
(`[LIVE-AUDIT]` 2026-09-23). **The register is complete; the documentation is not.***

| worker | writes to |
|---|---|
| 🔴 **`alphadog-v2-nba-static-schedule.js`** | **`nba_calendar.games`** |
| 🔴 **`alphadog-v2-nba-static-measure-types.js`** | `nba_stats.player_game_log_scoring` · `player_game_log_usage` · `nba_team.team_game_log_four_factors` |
| 🔴 **`alphadog-v2-nba-static-shotquality.js`** | `nba_stats.player_shot_quality` · `player_shot_quality_delta` · `player_shot_zone_profile` |
| 🔴 **`alphadog-v2-nba-static-playtypes.js`** | `nba_stats.player_playtype_profile` · `nba_team.playtype_profile` |
| 🔴 **`alphadog-v2-nba-static-tracking-detail.js`** | `nba_stats.player_tracking_detail` |
| 🔴 **`alphadog-v2-nba-static-lineups.js`** | `nba_team.lineup_profile` |
| 🔴 **`alphadog-v2-nba-static-team-stats.js`** | `nba_team.season_profile` |

🔑 **Several write tables the corpus documents in detail** — *`player_playtype_profile` has its own
`[LIVE-AUDIT]` block (`3,282` rows, all `Offensive`); `player_shot_quality` and
`player_tracking_detail` sit in the table registers; **`nba_calendar.games` is the `2,666`-row
schedule table cited across six documents.*** ⇒ ***the corpus knows what is IN these tables and,
for these seven, not what PUTS it there.***

## 2 · 🔴 TWENTY-SEVEN SCRIPTS — *and they are the apparatus behind the factor verdicts*

*`nba/*.py` → **123 files**; **30** named in `0` of the twelve; **3** are `probe_pp_*.py`,
**excluded by standing rule** as the concurrent session's ⇒ **`27` in scope.***

**🔴 The factor-fitting set — every one produced a verdict the twelve record in full:**

| script | its own header |
|---|---|
| **`fit_b4_opponent.py`** | *"FACTOR B4 — OPPONENT AVAILABILITY, fitted and gated exactly like A2"* |
| **`fit_b4_defender_quality.py`** | *"FACTOR B4 v2 — OPPONENT AVAILABILITY VIA EXPECTED DEFENDER QUALITY"* |
| **`fit_b4_rim_protection.py`** | *"B4 SUB-CASE — BLOCKS-AGAINST VULNERABILITY (rim protection specifically)"* |
| **`fit_m1_defender_level.py`** | *"FACTOR M1 — PRIMARY DEFENDER QUALITY as a BASELINE-STAGE factor"* |
| **`fit_n1_granular.py`** | *"N1 v2 — GRANULAR P(plays \| Questionable) … per-player assertiveness, not a flat 55%"* |
| **`measure_n1_status_resolution.py`** | *"FACTOR N1 — P(plays \| status) MEASURED FROM OUR OWN ARCHIVE, at the 2:30 PM PT decision cutoff"* |
| **`fit_usage_allocation.py`** | *"A2 USAGE ALLOCATION — FITTED, replacing the assumption"* |
| **`fit_rate_response.py`** | *"RATE RESPONSE — the second half of factor A2, and the end-to-end test that it helps"* |
| **`retest_defender_factors.py`** | *"M1 / B4 RE-TEST with PROPER defender ratings, and WITH INTERACTIONS"* |

🔴🔴 ***`NBA_FINAL_SCORING_CALIBRATION.md` carries the T15 verdict table — `A2` SHIPPED · `A2 rate
response` REJECTED · `B4 v1`/`v2` REJECTED · `B4 v3` COMMISSIONED · `M1` NOT TESTED · `N1` MEASURED
· `A5` REJECTED — with populations and figures. It names none of the nine scripts that produced
them.*** **A reader who wants to re-run or check a verdict cannot reach the code from the
documentation.** 📌 ***`RULE 55` at its largest scale yet: not a table missing under a conclusion,
but the entire APPARATUS missing under a table.***

**🔴 The test suite** — `test_a2_novelty.py` *("A2 SHARPENED — NOVELTY-WEIGHTED absence
redistribution")* · `test_a2_per_prop.py` · `test_a2_window_information.py` *("the factor's TRUE
value, not its upper bound")* · `test_component_application.py` *("re-derive the mean, do not
re-scale it")* · `test_factors_on_baseline.py` *("INTEGRATION TEST — factors on top of the CERTIFIED
BASELINE, not beside it")* · `test_funnel_leg_level.py` *("the funnel, and LEG-LEVEL scoring instead
of MAE")* · `test_oreb_basis_mean.py` · `test_oreb_rate_estimator.py` *("the RATE ESTIMATOR, which
the band-bias table says is the real defect")* · `test_oreb_opportunity_model.py`.

**🔴 The rest** — `build_matchup_model.py` *("TEAM MATCHUP v2 — the market total as the
game-environment input. **NON-NEGOTIABLE FACTOR**")* · `build_market_derived.py` ·
`backtest_edge_vs_board.py` *("where the certified baseline disagrees with the PrizePicks board")* ·
`validate_blowout_upgrade.py` *("SAMPLE VALIDATION before any full rebuild")* ·
`scrape_nba_backfill_2025_26.py` · `scrape_nba_lineups.py` *("multi-player lineup synergy data")* ·
`scrape_nba_tracking_detail.py` · `load_pp_mined_legs.py` · `load_pp_quotes.py`.

## 3 · ✅ What the census CLEARS

**`161` of the `250` repo paths ever written are both present in the repo and named in the twelve.**
*And the apparent "`44` written then deleted and never documented" is a **case-normalisation
artifact** — the segmenter lowercases, so `nba/nba_master_summary.md` is `NBA_MASTER_SUMMARY.md` and
`nba/trigger_nba_scrape.txt` is `TRIGGER_NBA_SCRAPE.txt`.* **Checked, not assumed: `0` real
deletions were hiding there.**

⚠ **RULE 54.** *Presence is tested by FILENAME. A worker described only by its job key, or a script
described only by what it does, would score as absent; one named inside a code fence would score as
present without being explained.* ***"`7` and `27` FILENAMES are absent", never "these are
undocumented in substance" — and the converse is weaker still: **being named is not being
documented**.***

---

## 🔴🔴🔴 **§T26.19 — P2 SPENT A THIRD OF EVERY NIGHT BUILDING ROWS THAT NEVER REACHED THE DATABASE, FOR THE WHOLE LIFE OF THE PIPELINE** *(T26 seg736, ASSISTANT OUTPUT; `0` of the twelve before this entry)*

> 🔑🔑🔑 ***"confirmed: **zero period rows have ever reached the database**. not for this slate, not
> for any date. **p2 spends ~43 minutes a night — a third of the pipeline — building 41,174 period
> rows that are then dropped on the floor**, because the merge step doesn't pick them up and the
> loader 404s looking for them. **that single finding is worth more than any speed tuning: either
> those props matter, in which case they've been missing from scoring entirely, or they don't, in
> which case p2 has been paying 43 minutes a night for nothing.**"***

### ⚠ **THE FORK IS THE POINT, AND BOTH BRANCHES ARE SEVERE**

| if the period props MATTER | if they DO NOT |
|---|---|
| 🔴 **they have been missing from scoring ENTIRELY** — every Q1/Q4/H1/H2 leg the apps posted was priced against nothing | 🔴 **P2 has burned `~43` minutes a night, `~33%` of the pipeline, for nothing** |

🔑 **Two failure points, not one**: *the **merge step** does not pick the rows up, **and** the
**loader `404`s** looking for them. **Either alone would have hidden the other.***

### ✅✅ **CLOSED — RE-DERIVED LIVE `2026-09-25T18:17Z`**

```sql
SELECT period, count(*), count(DISTINCT game_date), count(DISTINCT season)
  FROM nba_score.baseline_history GROUP BY period ORDER BY 2 DESC;
```
▶ | `FULL` **`4,410,672`** / `325` dates | `Q1` **`1,854,284`** / `303` | `Q4` **`1,086,807`** / `303`
| `H1` **`673,860`** / `303` | `H2` **`670,682`** / `303` | — **all four period props present across
BOTH seasons.** ✅ ***"zero period rows have ever reached the database" is now FALSE, and it was fixed
AND BACKFILLED*** — `4,285,633` period rows, **`49.28%`** of the table.

⚠ **`FULL` covers `325` dates against the periods' `303` — a `22`-date gap.** *NOT diagnosed; recorded
under `RULE 6` as an observation, not a defect.*

### 🔴🔴 **AND FIXING IT IS WHAT CREATED THE `final_hp` PERIOD-KEY COLLISION — THE TWO FINDINGS ARE ONE CHAIN**

🔑🔑 ***The moment period rows started reaching the database, they started reaching `final_hp` too —
and `final_hp` has no `period` column.*** *(`§T26.17`)* ⇒ **The period rungs landed wearing FULL-GAME
keys, and where a period line coincided with a full-game line the upsert let the last one win.**
⚠⚠ **The timeline is mechanical**: *seg736 sits inside T26's window (`2026-09-23T19:07` →
`2026-09-24T04:37`); the period filter that stops the collision is commit **`0cba9a19`,
`2026-09-24T11:18-07:00`** — **seven hours after the transcript ends.*** ⇒ ***A repair on one worker
opened a silent corruption in the next one downstream, and the second fix followed the first by
hours.*** 🔑 **This is the sweep's standing lesson in its strongest form: `41,174` rows a night that
had never arrived were not inert — they were load-bearing on a key the destination could not
represent.**

---

## 🔴🔴🔴 **§T26.26 — THE REFEREE ARC: A DECISION TAKEN, REJECTED BY THE OWNER, CONCEDED AS A LOGICAL ERROR, AND THEN DISSOLVED — REVEALING THE SCHEDULING BUG THAT MOVED P2's CRON** *(T26 seg786→seg798 + `SELECT`/workflow reads 2026-09-25)*

**This is the single most instructive exchange in the corpus, and the sweep recorded only its first
move.** *`§T26.23`'s `D1` entry is corrected by this section.*

### ① **THE DECISION** *(seg786)*
> ***"referee crew `D1` — decided: keep 'factor zero plus confidence penalty', **don't build a
> predictor**… a predictor for an unpredictable assignment worth under 2% isn't worth the failure
> surface."***

### ② 🔴 **THE OWNER REJECTS IT — IN THE VERY NEXT OWNER TURN** *(seg788)*
> ***"on the predictor — it's okay IF there is no way to make a predictor that's reliable, **which I do
> think that we can and I would prefer that**. then **you need to be careful with the penalties — we
> don't want to over-penalize a leg because there is no data**. you should research and I'm sure you
> find a way to make a decent predictor. **you're being lazy again.**"***

### ③ ✅✅ **THE AUTHOR CONCEDES A LOGICAL ERROR, NOT A PREFERENCE** *(seg789)*
> 🔑🔑🔑 ***"fair — **I measured the effect size and used it to dismiss the predictor, which are
> different questions.** and the penalty point is sharper: **if a missing factor costs more confidence
> than the factor is worth, we lose twice.**"***

⚠⚠ **THAT IS THE LESSON, AND IT GENERALISES TO EVERY "NOT WORTH BUILDING" DECISION IN THIS CORPUS**:
***a small effect size argues that the FACTOR is cheap to lose. It says nothing about whether the
PENALTY for lacking it is correctly sized.*** 🔑 **`§T26.20`'s `307,000`-leg "don't build it" survives
this test** *(it measured the outcome, not the effect size)*; **decisions that dismissed a feature on
effect size ALONE should be re-read against it.**

### ④ 🔑🔑 **AND THEN THE DOCUMENTATION DISSOLVES THE QUESTION ENTIRELY** *(seg792, seg795)*
> ***"the documentation reframes this: **crew assignments post at ~9 AM ET, before both cutoffs — so in
> production the crew is KNOWN, not predicted.**"***
> *The parity doc's rule:* ***"`D1` is class B live-only: not archived, so the live capture must
> accumulate it, and box-score officials are **post-hoc truth — usable as the TARGET of a prediction,
> never as an INPUT to a past day**."***

⇒ ✅ **NEITHER SIDE WAS RIGHT: there was no predictor to build, because there is nothing to predict.**
🔑 **The owner was right that the decision was premature; the author was right that a predictor wasn't
worth it — and the documentation the owner had insisted on settled it in one read.** ⚠ ***That is the
owner's "religious rule" (seg743 — "no guessing, look at the damn documentation") paying out on the
same page it was demanded.***

### ⑤ 🔴🔴🔴 **WHAT THE EXCHANGE ACTUALLY UNCOVERED — A LIVE BUG WITH A MEASURED CASUALTY** *(seg795, seg798)*

> ***"p2's target cron is `01:00 PT` — hours before assignments post. **so p2's referee step would
> scrape nothing**… the dedicated job already exists and is correctly timed: `cron: '30 15 *'` —
> `08:30 PT`, after the morning posting… **p2's referee step at `01:00 PT` runs 7½ hours too early —
> it can only ever scrape an empty page. That's redundant work masquerading as coverage.**"***

✅✅ **VERIFIED LIVE `2026-09-25` — AND THE WORKFLOW NOW DOCUMENTS ITS OWN FIX:**

| | |
|---|---|
| `.github/workflows/nba-referees.yml` | **`cron: '30 15 * * *'`** — *"`08:30` PT, after the morning posting"* |
| `.github/workflows/nba-p2-overnight-heavy.yml` | **`cron: '45 15 * * *'`** — **`15` minutes later** |
| **the casualty, in the workflow's own words** | ***"the old target of `09:00 UTC` = `01:00 PT` was five to six hours too early, **which is exactly why `nba_ref.referee_assignments` held `0` rows while the step ran nightly**"*** |

🔑🔑 **SO THE CRON `§T26.1` VERIFIED AS "LIVE" HAS ITS *WHY* HERE**, *and it is the owner's — seg844:*
***"we do not redo it… we just run it, give it a wiggle room. if it's like 9 a.m., it started at 9:30…
we keep the same logic, we keep things as it was. **we just change the running times.**"***
⇒ ⚠⚠ **A TIMING FIX CHOSEN OVER A REBUILD, EXPLICITLY** — *and the owner reached it after catching an
arithmetic error in the author's own account (seg802).*

### ✅ **AND THE WORKFLOW HANDLES THE DST CROSSING THE CORPUS FLAGS AS UNHANDLED**

> ***"GitHub cron is UTC and does not shift with daylight time, and the season crosses the change
> (PDT → PST on `2026-11-01`), so the local hour drifts by one: `15:45 UTC` = **`08:45 PT` during PDT**
> = **`07:45 PT` during PST**. **Both land AFTER the 6-7 AM PT posting with wiggle room**, and both
> leave the pipeline finishing around `10:40` / `09:40` PT against **P3's `13:15` PT cutoff — roughly
> three hours of slack for a retry.**"***

🔑 **`T20-12` records *"zero DST-aware Python in the NBA scripts"* — TRUE, and this shows the drift was
handled by choosing a slot that is correct in BOTH offsets rather than by making the code DST-aware.**
⚠ *A different solution to the same problem; `T20-12` stands for the Python, not for this cron.*

### 🔴🔴 **THE STATE TODAY — THE FIX IS IN PLACE AND HAS NEVER BEEN EXERCISED**

| table | rows | what it is |
|---|---|---|
| `nba_stats.game_officials` | **`11,062`** | ✅ historical crews — *post-hoc truth, `§T26.12`'s closed load gap* |
| `nba_ref.officials` / `official_roster_snapshot` | `80` / `80` | ✅ the roster |
| `nba_ref.official_tendency` | **`78`** | ✅ **the shrunk tendencies (`k=112`) `§T26.23` records SHIPPED — `78` of `80` officials** |
| 🔴 **`nba_ref.referee_assignments`** | **`0`** | 🔴 **STILL EMPTY, `2026-09-25`** |
| `nba_ref.official_differential_log` | `0` | — |

⚠⚠ **THE EMPTINESS IS NOW EXPECTED — THERE ARE NO GAMES — BUT IT MEANS THE REMEDY IS UNPROVEN.**
*The table whose `0` rows diagnosed the bug is the same table that must fill to demonstrate the fix,
and it cannot fill until **preseason, `2026-10-03`**.* 🔑🔑 ***And because box-score officials are
"never an input to a past day", `game_officials`' `11,062` rows CANNOT substitute*** — ⇒ **the `D1`
factor has never once fired with a known crew in production; what has actually run, every time, is the
confidence penalty for its absence.** 🔴 **Which is precisely the over-penalisation the owner warned
about at ② — and it has been the live behaviour all along.**

📌 **FIRST THING TO CHECK ON `2026-10-03`**: `` SELECT count(*) FROM nba_ref.referee_assignments; ``
**A non-zero result is the first evidence the arc above produced a working factor.**

### ⑥ ✅✅ **AND AN OWNER-ORDERED FULL BACKFILL WAS AVOIDED BY THE TIMING FIX — RECORDED BECAUSE IT IS STILL ON HIS LIST** *(seg807 → seg822 → seg844)*

**Before the timing fix was found, the owner ordered the structural alternative — twice.**

> **seg807**: ***"of course, if that information only comes at that time, **we need to move that shit to
> P3, not P2**."***
> **seg822**: ***"you have to put on your list that **we have to redo the whole fucking back data**,
> because now we're moving the referee from the BASELINE to the FINAL pipeline. so that needs to be
> done. **but first, finish everything**, because you may come up with some more shit."***

⚠ **That is a stage reassignment plus a full historical rebuild** — *`D1` out of P2's baseline stage
and into P3, and every stored baseline recomputed behind it.*

✅✅ **NEITHER HAPPENED, AND THE REASON IS SOUND**: *seg833 — **"before you change anything, what time
does the referee data come up for pacific time?"*** — the owner asked for the arithmetic **before**
authorising the rebuild, and when it showed the data posts at `6-7 AM PT` against a pipeline that
could simply start later, he cancelled the structural change himself at seg844: ***"so yes, fine, **we
do not redo it**… we keep the same logic, we keep things as it was. **we just change the running
times.**"***

🔑🔑 ***A STAGE REASSIGNMENT AND A TWO-SEASON BACKFILL WERE REPLACED BY A FIFTEEN-MINUTE CRON OFFSET,
AND THE THING THAT DECIDED IT WAS ONE CLOCK CALCULATION.*** ⚠⚠ **`D1` REMAINS A BASELINE-STAGE FACTOR
IN P2** *(workflow line `141`, "Referee assignments and per-game matchups (baseline-stage factors)")*,
**which is what the parity doc's stage table says it should be** — ⇒ ***the instruction at seg807/822
is SUPERSEDED, not outstanding.***

🔴 **RECORDED EXPLICITLY BECAUSE THE OWNER SAID *"put it on your list"* AND NO LIST ENTRY WAS EVER
MADE.** *A future reader finding seg807/seg822 without seg844 would re-open a rebuild the owner
himself called off three turns later.* 🔑 **This is `RULE 40`'s reason stated as a live hazard: the
cancellation is worthless if it is not stored beside the order.**

---

## 🔴🔴🔴 **§T26.28 — THE FROZEN STATIC LAYER HAS A ROOT CAUSE, IT IS WRITTEN IN P1's OWN WORKFLOW, AND THE CORPUS RECORDS ONLY THE SYMPTOM** *(workflow read + `SELECT` 2026-09-25; the diagnosis is `0` of the twelve)*

**Ranked item `B` of the opening-day brief — *"the frozen static layer"* — has been carried through
this entire sweep as a MEASUREMENT with no explanation**: *`nba_ref.defender_ratings`
`max(as_of_date) = 2026-04-09`, `111,768` rows, P1's certifier check RED.* ⚠ **`§T20.56` states the
symptom, `§T20.83` calls the table dead, the brief re-derives it every pass — and no entry says WHY.**

### ✅✅ **THE CAUSE IS A CODE COMMENT IN `.github/workflows/nba-p1-weekly-static.yml`, LINES 52–55**

> 🔑🔑🔑 ***"step died with `ModuleNotFoundError` EVERY Monday — and because it dies mid-pipeline, the
> three steps after it (static context, COMMIT, certify) were skipped, **so the whole week's scraping
> was thrown away uncommitted and never reached Postgres**. That is why the static layer's timestamps
> sat at `2026-09-03` and `defender_ratings` at `2026-04-09` **while the cron ran fine every week**."***

⚠⚠ **READ THE LAST CLAUSE TWICE.** ***The cron ran fine every week.*** 🔑 **So every check that asks
*"is P1 scheduled?"* or *"did P1 run?"* answered YES, correctly, for the entire period in which P1
produced nothing.** ⇒ ***A green schedule and a green run, with a mid-pipeline death between the
scraping and the COMMIT, is indistinguishable from success at every level the sweep was measuring.***

📌 **AND IT IS THE SAME SHAPE AS `§T26.19`** *(P2 built `41,174` period rows a night that the merge
never picked up)* **and `§T26.26`** *(P2's referee step scraped an empty page for months)*. ⇒ 🔑🔑 **THREE
INDEPENDENT INSTANCES OF ONE FAILURE CLASS IN ONE TRANSCRIPT'S WORTH OF WORK: *work performed,
work not persisted, and every liveness signal green throughout.*** ⚠ **`RULE 37`'s silent category has
a mechanism, and this is it — the gap is always between DOING and COMMITTING.**

### 🔑🔑 **AND IT SPLITS RANKED ITEM `B` INTO TWO ITEMS WITH DIFFERENT ANSWERS**

*The corpus treats "the frozen static layer" as one fact. **It is two, and only one was ever a bug.***

| layer | live state `2026-09-25` | verdict |
|---|---|---|
| ✅ **IDENTITY** — `nba_ref.players` *(rosters, trades, two-way call-ups)* | **`713` rows, written `2026-09-24T19:47Z`** | ✅ **NO LONGER FROZEN** — *the fix reached Postgres* |
| ⚠ **AS-OF** — `nba_ref.defender_ratings` | **`111,768` rows, `max(as_of_date) = 2026-04-09`** | ⚠⚠ **CORRECTED BELOW — I FIRST WROTE "correctly frozen, NOT a defect". THAT WAS WRONG.** |

### 🔴🔴🔴 **CORRECTION, SAME DAY — THE MISSING MODULE WAS `scipy`, AND THE SCRIPT IT KILLED WAS `build_defender_ratings.py` ITSELF**

*`T26`'s `tool_use` stratum names it exactly* — **seg703**:
> ***"nba p1: **install scipy — `build_defender_ratings` imports it, so the step has been failing every
> week**."***

✅ **VERIFIED IN SOURCE**: `build_defender_ratings.py:46-47` — `` from scipy import sparse `` and
`` from scipy.sparse.linalg import lsqr `` — **and it is the ONLY one of P1's `15` scripts that
imports scipy.** ▶ P1's install line now reads `` pip install … numpy scipy curl_cffi … ``.

⚠⚠ ***So the as-of layer was not merely waiting for games. The builder that produces it was CRASHING
ON A MISSING DEPENDENCY, every Monday, for months.*** 🔑 **I attributed the freeze to the out-of-season
condition because `§T26.14` had made that explanation available and it FIT. It fits both ways — and
the `2026-04-09` stamp cannot discriminate between them, because a builder that ran would also have
produced nothing without games.** ⇒ ***What discriminates is the IDENTITY layer, and it is
unambiguous: `nba_ref.players` was stuck at `2026-09-03` while the cron ran green weekly. No absence of
games explains that.***

📜 **`RULE 62` again, one level up**: *I re-derived the SYMPTOM (`max(as_of_date)`) and reasoned about
the cause. **The cause was a `pip install` line, and only the commit stream said so.***

### ✅✅ **AND THE REPAIR WAS TWO COMMITS, NOT ONE — THE SECOND IS THE STRUCTURAL ONE**

| | commit | what it does |
|---|---|---|
| **①** | **seg703** | `pip install … scipy` ⇒ *the step stops crashing* |
| **②** | **seg708** | ***"commit and certify run even when a build step fails — a mid-pipeline error no longer discards the week's scrape"*** |

✅ **VERIFIED**: P1's commit, load and certify steps now carry **`if: always()`**, with the workflow's
own reasoning — ***"Committing on `always()` preserves the data; the job still goes red because the
failed step failed"*** and ***"a late failure must not discard the load."***

🔑🔑🔑 **① FIXES THIS BUG. ② FIXES THE CLASS.** *Without ②, the next unrelated mid-pipeline error would
have silently discarded another week — and nobody would have known, because **the cron would still run
fine every week**.* ⚠ **`§T26.19`, `§T26.26`, `§T26.28`, `T20-17`: four instances of work performed and
not persisted, and ② is the first fix that addresses the SHAPE rather than one instance of it.**

⚠⚠ **A CONVERGENCE WORTH NOTING**: ***`build_defender_ratings.py` is ALSO the single unguarded
`CREATE INDEX IF NOT EXISTS` script left in any pipeline*** *(`§T26.32`)*. 🔑 **One script carries both
of P1's remaining known hazards.**
| ⚠ **SCHEDULE** — `nba_calendar.games` | `2,666` rows, `updated_at` still **`2026-09-02T20:25`** | ⚠ *unchanged, but it holds **`1,266` games for `2026-27`** — loaded once, and correct until games move* |
| — | `nba_ref.officials` `80` rows, `2026-09-01` | ✅ static roster |

⇒ ✅✅ ***The half of item `B` that was a real defect is FIXED. The half that remains red is the
out-of-season condition `§T26.14` already explains, and it clears itself when games resume.***
🔑 **What the brief should carry is not "the static layer is frozen" but "P1 discarded its own work
for weeks; that is fixed, and `defender_ratings` stays stale until opening night by design."**

### ⚠⚠ **BUT THE FIX IS NOT YET PROVEN ON THE PATH THAT MATTERS**

🔴 **`2026-09-24` WAS A THURSDAY. P1's cron is `'0 19 * * 1'` — MONDAYS.** ⇒ ***The `players` write
that demonstrates the fix came from the `T26` session's own manual P1 work, NOT from a scheduled
run.*** ⚠ **The last scheduled Monday was `2026-09-21`; nothing in the static layer carries that
date.**

📌 **THE TEST IS DATED AND CHEAP** — **Monday `2026-09-28`**:
```sql
SELECT max(updated_at) FROM nba_ref.players;   -- must advance to 2026-09-28
```
🔑 **A value that advances proves the scheduled path commits. A value still reading `2026-09-24` means
the fix works only when a human runs it — which is the same failure, one level up**, *and there are
`3` scheduled Mondays before the opener.*

### ⚠ **A SMALLER CORRECTION IN THE SAME FILE — THE OWNER'S BELIEF ABOUT P1's SLOT IS WRONG, AND HE FLAGGED IT HIMSELF**

> **T26 seg617, owner**: ***"the P1 is weekly. **if I'm not wrong, it's running every Monday at 12:15,
> early morning. I'm not totally sure**, but it should be working every week… one week is not stale,
> because it is weekly."***

▶ **LIVE**: `cron: '0 19 * * 1'` — ***Mondays `19:00` UTC = `12:00` NOON PT (`11:00` PT during PDT)***,
**not `12:15` AM.** *The workflow gives the reason: **"deliberately far from the overnight pipeline
(P2, daily 01:00 PT) so the two can never contend for the database or the repo."*** ⚠ **That rationale
is itself now stale — P2 moved to the morning (`08:45` PT, `§T26.26`), so the separation is `3¼` hours,
not `11`.** ✅ *Still comfortably clear, and P1 is not cutoff-sensitive by its own charter.*
🔑 **The owner's substantive point — *a weekly job one week old is not stale* — is CORRECT and is the
reasoning `§T26.14`'s season-aware certifier implements.**

---

## ✅✅✅ **§T26.34 — THE CERTIFIER CAUGHT THE `final_hp` LOSS, LOUDLY, WITH THE RIGHT CHECK NAME — THE CORPUS HAS NO OTHER INSTANCE OF IT WORKING** *(T26 seg249, a `RESULTS RETURNED` receipt: GitHub run `35917049251`, `2026-09-23T20:38Z`)*

**The corpus catalogues the certifier's failures at length** — *`T20-6`'s "`7` of `12` checks assert
tables their pipeline never writes", `NBA_WORKERS.md:2059`'s "❌ vacuous" date-scoped range check,
`§T26.14`'s P1 going red every Monday on a check that could not pass, `§T26.23`'s checks reading a
sibling table's backfill.* ⚠⚠ **What it does NOT contain is a single recorded instance of the certifier
CORRECTLY STOPPING A REAL DEFECT.** ✅ **Here is one, and it is executed evidence, not prose.**

### 🔑 **THE RECEIPT**

| | |
|---|---|
| run | **`35917049251`**, job `afternoon` *(P3)*, `2026-09-23T20:38:05Z` |
| slate | **`2026-04-10`** *(a replay)* |
| conclusion | 🔴 **`failure`** |
| the failing step | **`certify p3`** — *every other step `success` or `skipped`* |
| the failing check | 🔑 **`fail  final_hp has today  0 scored legs for today`** |
| tally | **`5/6 checks passed` · `failed checks: final_hp has today`** |
| exit | ***"produce what it promised. Failing the job so it is visible."*** ⇒ **`Process completed with exit code 1`** |

✅ **AND THE STEPS AROUND IT BEHAVED CORRECTLY TOO**: *`availability delta` ✅ · `score the board (all
apps, all rungs, both directions)` ✅ · `log paper-trading picks` ✅ **`72` picks** — while the six
day-of steps (`day-of injury report`, `other board scrapers`, `archive boards into postgres`,
`board tiers`, `market snapshot and rung market`, `commit day-of data`) correctly **SKIPPED**, because
a replay of a past date has no live board to capture.* 🔑 **A pipeline that knows which of its own
steps do not apply to a replay is a well-built pipeline, and that is worth recording as much as the
catch.**

### 🔑🔑 **WHY THIS MATTERS TO `T16-7` AND `T20-6` SPECIFICALLY**

⚠⚠ ***The check that fired is precisely the KIND of check `T20-6` said the certifier lacked*** — **it
asks the pipeline about ITS OWN output on THIS slate**, not about a sibling table's backfill. ⇒ **`0`
scored legs for the slate is exactly the `final_hp` hole `T16-7` records**, *and on `2026-09-23` the
system was detecting it, failing loudly and refusing to report success* — **one day before `T26`'s
restore (`§T26.15`) filled it.**

🔑🔑🔑 **SO THE TIMELINE READS DIFFERENTLY THAN THE CORPUS IMPLIES.** *`T16-7` was raised
`2026-09-22` as an OWNER DECISION on the grounds that **"the sweep cannot tell 'in flight' from
'lost'."*** ⚠ ***The system could. It was saying so, in a failing build, the next day.***
⇒ 📌 **A READ-ONLY SWEEP THAT NEVER LOOKS AT RUN LOGS IS BLIND TO THE ONE SOURCE THAT DISTINGUISHES
THE TWO** — *a table `SELECT` shows a hole; only the run log says whether something is complaining
about it.* 🔑 **`RULE 32` sends a pass to the mechanism strata for what prose cannot say. This entry is
the argument for extending that to the LIVE workflow logs, which are a stratum the sweep has barely
read.**

### ✅ **WHAT THIS DOES AND DOES NOT CLOSE**

✅ **It closes the question of whether the certifier can work: it can, and did.** ⚠ **It does NOT
retract `T20-6`** *(`§T26.30` closes that on the source, separately)* — *one check firing correctly
says nothing about the other seventeen.* 🔑 **Recorded as the corpus's single positive control on the
certifier**, *and as the reason `§T26.30`'s re-pointing is believable rather than merely asserted.*

---

## 🔴🔴🔴 **§T26.35 — FOUR MORE DEFECTS FROM T26's COMMIT STREAM, INCLUDING A P3 STEP THAT RAN THE WRONG SCRIPT FOR ITS ENTIRE LIFE** *(T26 `tool_use` stratum, `81` distinct commit messages; all four confirmed in repo history and verified in source)*

**METHOD NOTE.** *`T26`'s `446` `tool_use` segments carry **`81` distinct commit messages** — a complete
change-log of the session. **Four of them name defects that appear in `0` of the twelve.*** 🔑 *The
commit message is a stratum of its own: it states what was wrong in the author's words at the moment
he fixed it, and it survives even when no prose segment ever explains it.*

### ① ✅✅✅ **P3's "BOARD TIERS" STEP NEVER BUILT BOARD TIERS — THIS IS `T20-7`, RANKED `2nd` IN THE BRIEF, AND IT IS NOW FIXED**

> ⚠⚠ **NOVELTY CORRECTION (`RULE 28`), same day.** *I first wrote this as `0` of the twelve. **It is
> not new — it is open item `T20-7`**, ranked **2nd** on the opening-day brief and marked 🔴🔴 **SILENT**
> *("the step succeeds; it classifies nothing")*, re-derived `2026-09-22`: **"P3 `:143–147` 'Board tiers
> (goblin / standard / demon)' runs `maintenance_shrink_board_index.py`; `build_board_tiers_v2.py` only
> in `nba-engine-test.yml:66`."*** 🔑 **What IS new is that it has been FIXED, and that the workflow now
> carries its own post-mortem.** *The sweep found this defect; `T26` repaired it; neither knew about the
> other until now.*

*Commit `NBA P3: the board tiers step ran a one-off index-maintenance script and never built tiers`.
The workflow now carries the post-mortem in place* **(`nba-p3-afternoon-light.yml:290-294`)**:

> 🔑🔑🔑 ***"🔴 FIXED 2026-09-23: this step ran `nba/maintenance_shrink_board_index.py` — a ONE-OFF
> maintenance job (it replaces `board_snapshots`' 7-column primary key with a compact expression index
> on **25.7M rows**). **So tiers were NEVER built for the decision-moment board**, and **a heavy index
> rebuild ran on the critical path at the cutoff, against the table the scorer reads next.**"***

⚠⚠ **TWO SEPARATE HARMS FROM ONE MIS-WIRED STEP**: ***(a)* the classification the scorer depends on was
never produced** — *and the comment states why it matters: **"the score and the slip engine both need
this — a rung's break-even depends on which variation it is"*** — ***(b)* a `25.7M`-row index rebuild
ran at the decision cutoff, on the table read next.** 🔑 **The step's NAME was right, so every audit
that checked "does P3 build board tiers?" answered yes.** 📌 ***Fifth instance of the day's dominant
class*** *(`§T26.19`, `§T26.26`, `§T26.28`, `T20-17`, this)* — **and the first where the work was not
merely lost but REPLACED by unrelated work under the same label.**

✅ **FIXED**: the step now runs `python nba/build_board_tiers_v2.py` *(line `323`)* — *"the real builder
(four-way taxonomy, signed by position vs anchor)."*
🔴 **RESIDUAL, STATED IN THE WORKFLOW ITSELF**: ***"`BT2_APPS` is prizepicks only — that is the
script's own default and the only app whose goblin/demon rungs this taxonomy describes. **Tiers for the
other archived apps are NOT built here.**"*** ⚠ *Read against `§T18.1`, the owner's own coverage
complaint — **"our system should be covering the APP LADDER"** — and `§T26.27`'s* ***"all apps, all
ladder variations."*** 🔑 **Board tiers are PrizePicks-only, by default, today.**

### ② ⏱ **P3's JOB DEADLINE WAS `120` MINUTES FOR A PIPELINE THAT MUST FINISH BEFORE FIRST TIP — NOW `25`**

> ***"⏱ DEADLINE, NOT A CEILING (2026-09-24). This was 120 minutes, which is **meaningless for a
> pipeline whose whole purpose is to be finished BEFORE the first tip**: **a hung scraper could burn
> two hours and sail past every game while the job still counted as "running"**."***

🔑🔑 **AND THE MEASURED SHAPE OF A REAL RUN IS THE ENTRY'S REAL VALUE:**

| phase | time |
|---|---|
| setup + pip | `~90s` |
| 🔑 **the ENTIRE compute path** — *availability delta + scoring **`91,405` legs** + paper log + certify* | ✅ **under `20` SECONDS** |
| everything else | **network** |

⇒ ***P3 is not a compute pipeline with a network step. It is a network pipeline with a `20`-second
compute step.*** ⚠ **Every optimisation instinct aimed at the scoring maths is aimed at `<1%` of the
wall clock** — *which is exactly what `§T26.6` found when P3 went `22` min → `2` min by scoping the
scrapers to NBA.* ✅ **`timeout-minutes: 25`, plus per-board caps**: *"if it is not done by then
something is wrong, and **a visible failure beats a late slate**."*

#### ✅ **AND THE SAME `20` SECONDS RETIRES A DESIGN THE PARITY DOC STILL PRESCRIBES — RECORDED SO IT IS NOT READ AS A DIVERGENCE**

*`nba/NBA_DAILY_PARITY_AND_BACKFILL.md` §8 specifies a two-phase day:* ***"Phase 2 (final, 2:30 → first
tip) does exactly four things: pull the board, apply the 2:30 report and projected-lineup delta, read
the 2:45 market, **rescore ONLY the legs touched by those deltas**. Everything else carries its phase-1
value forward."***

▶ **THE CODE DOES SOMETHING ELSE**: `score_board_legs.py:184` reads the **whole slate** —
`` FROM nba_score.baseline_history WHERE game_date = %s AND period = 'FULL' `` — and applies the
availability delta as **step 3 of its chain** *(line `232`)*, rather than restricting the rescore to
delta-touched legs.

✅✅ **THIS IS NOT A DEFECT, AND THE REASON IS THE `20` SECONDS ABOVE.** *"Rescore only the touched
legs" is a PERFORMANCE optimisation, written when the phase-2 window was the binding constraint.*
⇒ 🔑 **Scoring the entire board costs a fraction of `20` seconds, so the optimisation now saves nothing
and costs a class of bug** — *a leg that should have been rescored but was not classified as "touched"
silently carries a stale value forward.* ⚠ **Scoring everything is strictly safer at no measurable
price.**

📌 **RECORDED BECAUSE A READER COMPARING THE PARITY DOC TO THE CODE WILL FIND THIS AND FLAG IT.** *The
parity doc is an unswept sibling that `6` of the twelve cite (`§T25.4`), its §8 is dated `2026-09-13`,
and the architecture moved underneath it: **P2 now runs in the MORNING (`§T26.26`) and P3 scores once at
the cutoff, so there is no "phase 1 at ~1 PM / phase 2 at 2:30" split left to optimise.*** 🔑 **The
divergence is the doc being superseded, not the code being wrong.**

### ③ 🔴 **P1's 2026-27 ROLLOVER WOULD HAVE PRODUCED *ZERO* WEEKLY SNAPSHOTS, SILENTLY**

*Commit `e95164b4`: **"NBA P1 rollover: derive the as-of window for unplayed seasons — 2026-27 would
have silently produced zero weekly snapshots."*** 🔑 **Same class as `T23-2` and as `§T26.30`'s grader
ceiling**: *a window derived from seasons already played has no row for the season about to start, so
it computes an empty range and succeeds.* ⚠ ***Third instance of "a date-bounded default that returns
NOTHING and exits green" found in this corpus*** *(grader `GRADE_END`, `build_rung_market` `RUNG_TO`,
and this)* — 📌 **the pattern is worth a standing check: every default derived from HISTORICAL data is
a silent-zero risk at a season boundary.**

### ④ ⚠ **P2's BASELINE BUILDER CRASHED WITH `KeyError: GAME_DATE` ON A NO-GAME DAY**

*Commit `fd477228`: **"NBA P2: detect an empty slate up front — the baseline builder crashes with
KeyError GAME_DATE on a no-game day."*** 🔑 **This is the concrete failure behind the
empty-slate campaign**: *`~15` commits in `T26` add no-game-day skips across P2 and P3 (`seg900`–`912`,
`947`–`949`, `1094`–`1100`).* ⚠ **It is NOT the same as `§T26.10`'s preseason gating** *(which decides
whether a preseason date counts as a slate)* — **this is what happened on any zero-game date at all,
and until the opener EVERY date is one.** ✅ *Now: a slate is detected up front, and the ladder,
components, combos, periods, merge, commit, load, refits and `final_hp` all skip — with `§T26.14`'s
season-aware certifier keeping the run GREEN rather than red.*

---

## 🔑🔑🔑 **§T26.43 — `check_factor_freshness.py`: THE INSTRUMENT BUILT TO CLOSE THE SILENT-FALLBACK CLASS — AND IT HAS NO CRON** *(source read + `SELECT` 2026-09-25; `0` of the twelve before this entry)*

**This sweep has now catalogued the same failure class six times** — *`§T26.19` (P2's `41,174` period
rows a night), `§T26.26` (P2's referee step scraping an empty page), `§T26.28` (P1 discarding its week
before COMMIT), `§T26.30`/`T20-17` (the lost injury shard), `§T26.35` ① (board tiers never built).*
✅✅ **`nba/check_factor_freshness.py` is the instrument built to make that class impossible to miss, and
its docstring names the class better than the corpus does:**

> 🔑🔑🔑 ***"WHY THIS EXISTS. Two owner rules meet here: **everything mined must be stored** (so nothing
> needs backfilling later), and **every factor needs a working fallback**. Both were true on paper and
> **neither was checked at runtime**. **The failure mode is not a crash — it is SILENCE**:
> `nba_ref.referee_assignments` sat EMPTY while P2 ran its scraper nightly, so D1's documented fallback
> would have **carried every game day with nothing saying so**."***

📌 **Those two owner rules are `§T26.27` ③ verbatim** — *"everything that's mined… needs to be stored"*
and *"each one of the individual factors needs to have a fallback"* — ⇒ ***this script is the owner's
directive turned into a runtime assertion, and it is the first artefact in the corpus that tests
whether a FALLBACK is silently load-bearing.***

### ✅ **THE DESIGN — THREE SEVERITIES, AND THE MIDDLE ONE IS THE NEW IDEA**

| severity | meaning | behaviour |
|---|---|---|
| **BINDING** | *the slate cannot be scored honestly without it* | 🔴 **exit non-zero, job goes RED** |
| 🔑 **FALLBACK** | *a MEASURED fallback exists and takes over* | ⚠ **reported LOUDLY, job stays GREEN** |
| **WEEKLY** | *refreshed by P1, not per slate* | judged on an `8`-day age |

🔑🔑 ***"Reported loudly, job stays green" is the category the system lacked.*** *A missing factor with a
working fallback is neither a failure nor a non-event — and treating it as either is how
`referee_assignments` sat empty for months.*

### 📋 **THE `14` CHECKS, AND WHAT EACH ONE GATES**

| factor | severity | fallback named in the check |
|---|---|---|
| injury report snapshots | **BINDING** | *`A1`/`N1`/`N2`/`A6`/`A9`. Fallback: `nba_score.availability_p_plays` (derived, Brier `0.0441` OOS)* |
| board snapshots (any app) · rung market · baseline history · **`final_hp`** · board scored | **BINDING** | — *`final_hp` noted as "the headline output; **P2 owns it since 2026-09-23**"* |
| **board tiers v2** | **BINDING** | *"goblin/standard/demon — **the pricing and slip engines read it**"* |
| market game lines | **BINDING** | *`B1`/`B2`. Fallback: our derived spread (`r=0.46`), factor delta → `0` + penalty* |
| **referee assignments** | ⚠ **FALLBACK** | *"published only on game morning and never archived → **empty out of season is EXPECTED**. Fallback: factor zero + confidence penalty (crew is tertiary by design)"* |
| starter status · game officials (truth) | ⚠ **FALLBACK** | — |
| defender ratings · as-of calibration · availability prior | **WEEKLY** | *the last one checks the derived `P(plays)` model **EXISTS at all** — "or the fallback has nothing to fall back to"* |

✅ **AND IT IS SEASON-AWARE, for `§T26.14`'s reason, stated in its own words**: ***"Out of season there
are no games, no boards and no assignments, and that is not a defect… **judging it would train everyone
to ignore red builds**."***

✅ **THE `board_tiers_v2` CHECK IS THE GUARD THAT WOULD HAVE CAUGHT `§T26.35` ①** — *the step that ran
an index job instead of building tiers.* ▶ **Live: `2,199,354` rows across `378` dates**, and
`availability_prior` holds **`699`** non-null `p_plays` cells.

### 🔴🔴 **AND HERE IS THE DEFECT: THE DETECTOR OF SILENCE IS ITSELF SILENT**

▶ **`check_factor_freshness.py` is wired into exactly one place — `.github/workflows/nba-maintenance.yml:67` — and that workflow has NO CRON.**

```yaml
on:
  workflow_dispatch:          # ← the entire trigger block
    inputs:
      task:  { default: "freshness" }
```

⚠⚠⚠ ***An instrument whose stated purpose is to surface a failure mode nobody notices runs ONLY when
somebody remembers to run it.*** 🔑 **The class it detects is precisely the class of thing you do not
think to go looking for** — *that is the definition in its own docstring* — ⇒ ***a manual trigger is
the one delivery mechanism guaranteed not to fire for it.***

📌 **This is not an argument for scheduling it blindly**: *out of season it correctly reports nothing,
and a daily green report is its own kind of noise.* 🔑 **But it should run on the days it can say
something — i.e. in season, after P3 — and nothing currently makes that happen.**
🔴 **RECORDED AS AN OWNER / BUILD-CHAT ACTION** *(adding a cron is a write to a live workflow, outside
this sweep)*, **and it is cheap: one `schedule:` block.**

### ⚠ **TWO SMALLER DEFECTS IN THE SAME WORKFLOW**

① **Its header carries a PRE-RESTORE premise that is now false**: ***"`final_hp` covers 2024-25
completely (162 dates) but **only 1 of 163 dates in 2025-26***" — *`§T26.15` restored it; live it holds
`163` dates.* ② **`season` input defaults to a hardcoded `"2025-26"`** — *the `T20-4` class, surviving in
a maintenance workflow after `§T26.30` cleared it from all three pipelines.* 🔑 **Neither is a blocker;
both are the kind of stale scaffolding `RULE 59` exists to catch, and both are source edits outside
these twelve.**