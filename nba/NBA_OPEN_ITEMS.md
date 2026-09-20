# NBA OPEN ITEMS — deferred, dropped, partial, bugs, caveats

## ⚠ SEASON-START CRITICAL — items that bite on or before 2026-10-03

### ⓪ GOOD NEWS FIRST — **the season-opening coverage problem is already SOLVED**
`classification_ladder_v12.py` carries **cross-season carryover** (*"season-opening study
2026-09-09"*). Without it, *"**the opening month has ZERO projections and November only 62%
coverage**"* — because within-season rates need 3 games and the minutes role needs 5.
**With it: October 85%, November 90%.** Minutes role and rate EWMA are carried at the player level, and
carried evidence counts as `CARRY_N` games at the boundary.
**Controlled by `BT_CARRY`, default `"1"`.** ⚠ **If a replay ever sets `BT_CARRY=0` and it is left
off, opening month produces nothing.** Worth an explicit assertion in the P2 certifier.

### ① THE DIFFERENTIAL WORKER HAS NOT RUN SINCE 2026-09-03
**Verified live 2026-09-20**: all three `*_differential_log` tables are **empty**;
`player_roster_snapshot` holds **582 rows frozen 17 days ago**.
**Nothing schedules it** — it was flagged unwired when built (T3), the owner said *"leave like this for
now"*, and `nba-p1-weekly-static.yml` does not call it.
**September–October is peak roster churn**: camp signings, two-way conversions, waivers, final cuts.
**Every one is exactly what this worker detects.**

**✅ AND THE FIX PATTERN ALREADY EXISTS ON THE MLB SIDE (T1):**
> *"`alphadog-v2-weekly-differential-runner` — **Native cron triggers for the Postgres weekly static
> differential (Monday 3am**, matching the existing `sched_static_weekly` convention)"*

**MLB runs its weekly differential on a native cron set in the generator.** Two routes for NBA:
**(a)** a native cron in `generate_wrangler_configs.py` (the MLB pattern), or
**(b)** a step in `nba-p1-weekly-static.yml` **after** the scrape+load steps.
**⚠ Whichever route, it must go through the generator** — *"the GitHub workflow regenerates wrangler
files before deploy, so this binding must live in the generator or it will be ERASED."*

**⚠ And check for the never-fire idiom first**: `crons: ["0 0 30 2 *"]` is **February 30th**, used on 8
MLB workers to disable a schedule while keeping the worker deployed. **A worker with that cron is not
scheduled, however it looks.**

### ② `active_stats_season()` returns a data-less season on Oct 1–2
`nba/nba_season.py` branches on `month >= 10` → current year. So on **2026-10-01 and 10-02** it returns
**2026-27**, which has **zero regular-season games** (opening night is **2026-10-03**). Preseason games
exist but carry `GAME_ID` prefix `001`, not `002`.
**A weekly scraper running in that window pulls empty aggregates and writes them, reporting success** —
the exact failure shape the utility was built to prevent (see the season-hardcoding fix below).
**Low impact** (P1 runs Mondays; 2026-10-01 is a Thursday) **but the fix is trivial**: the real opening
date is already in `nba_calendar.games`. **Not fixed — documentation pass.**

### BUG-FIXED (2026-09-08) · `stats_seasons` was anchored on the wrong season
Documented in the utility itself: the 3-season training list was *"built back from `current_season`
(2026-27) while the anchor was `active_stats_season` (2025-26)"* — **an off-by-one-season error that
would have silently trained on the wrong window.** Now anchored on `active_stats_season`.

### ③ Season hardcoding — FIXED, but the pattern recurs silently
**Every weekly scraper hardcoded `Season=2025-26`.** Confirmed universal across 6 scrapers checked
directly. *"On Oct 3, the whole weekly cycle would **SILENTLY KEEP PULLING LAST SEASON'S FROZEN DATA
WHILE REPORTING SUCCESS** — the most dangerous kind of failure."*
**Fixed with a shared `active_stats_season()` utility across 9 scrapers**, all syntax-checked before
shipping. **Verified live 2026-09-20 in `scrape_nba_player_bio.py`.**
**Kept here because any NEW scraper written without the utility reintroduces it, invisibly.**

### ④ New players are invisible to derived tables until the weekly roster scrape
*"Won't exist in `nba_ref.players` until the weekly players scrape; game logs still insert fine (**no
FK**), but **position-dependent derived tables silently skip them**."*
**Acute in October**, when rookies and new signings are most numerous — and compounded by ① above,
since the differential worker is what would flag them.

### ⑤ P3's trigger is fixed at 1:15 PM PT; the design called for dynamic
Breaks on early-tip days (noon/1 PM ET starts = 9/10 AM PT). Detail under "FROM T4".
**The NBA's opening week and every holiday slate include early tips.**

### ⑥ **THE PUBLISHING-LAG GRACE WINDOW WAS PROPOSED AND NEVER BUILT**
T7 reasoned this through completely, then left it as a judgment call:
> *"the calendar can mark a game **Final before the bulk stats endpoint has it** (advanced stats lag
> **~15 minutes**). If the delta runs in that window, the completeness check will **correctly flag a
> 'missing' game that simply isn't published yet. That's the check working, not failing.**"*
> *"I **could build the defensive handling now** — the completeness check treating a game as 'expected'
> **only after a grace window past its scheduled end**, so a run that lands in the publishing gap
> **doesn't cry wolf**… rather than discover it in October."*
> *"real data is the only true **confirmation**, but it shouldn't be the only **preparation**."*

**Why it is tighter now than when written:** that reasoning assumed the **6am ET** operating window,
chosen as a *"4-hour safety buffer"* against the worst-case ~1:45am ET finish (T4.12f).
**P2's planned cron is 01:00 PT = 04:00 ET — two hours tighter.** A West-Coast double-overtime game
finishing ~1:45am ET publishes ~2:00am ET, so P2 still clears it — but with **2 hours of margin
instead of 4**, and any late finish plus a publishing delay lands inside the gap.

**What happens when it fires**: `check_delta_gaps.py` **fails the P2 job loudly** — correct for a real
hole, a false alarm for a publishing lag. **The two are indistinguishable without a grace window**, and
the right response to each is opposite (investigate vs. just re-run later). **An unattended pipeline
that cries wolf in week one is one people stop trusting.**

**The fix is small and already specified**: treat a game as expected only after
`scheduled_end + grace`, grace ≥ 30 min. The schedule already carries tip times (2,666 games).

### STILL OPEN from T7's gap table — recurring refresh
| Gap | Status |
|---|---|
| **Splits + career totals** | ✅ **CLOSED in T7** — put on a recurring path via a `mode` input on the existing backfill worker (not a new worker), season read from the scraper meta, both added to the weekly cycle workflow |
| **Defence-vs-Position** | ✅ **CLOSED in T7** — the recompute SQL was placed inside the delta worker, before `sql.end()` |
| **Starter-status + officials for NEW games** | ✅ `scrape_nba_per_game_delta.py` does this |

**All three T7 recurring-path gaps are closed.** ⚠ **But verify they are in `nba-p1-weekly-static.yml`
as built 2026-09-20.**

### ⚠⚠ VERIFIED 2026-09-20 — **P1 DROPPED THREE THINGS IN THE REBUILD**

`nba-p1-weekly-static.yml` runs exactly: teams · arenas · players · bio · weekly as-of season tables ·
team stats · on/off · playtypes · player tracking · DARKO · shot quality · defender ratings ·
static context (coach changes) · commit · certify.

**Not present, and each was on a recurring path before the rebuild:**
| Dropped | Was |
|---|---|
| **The weekly differential worker** | unwired since T3 — see ① above |
| **`scrape_nba_splits.py`** | added to the weekly cycle in T7 |
| **Career totals** | added to the weekly cycle in T7 (`mode` input on the backfill worker) |

*(The DvP recompute is fine — T7 placed it inside the **delta** worker, so it lives on P2's path, not
P1's.)*

**Consequence**: splits and career totals go stale from opening night — they are **cumulative
aggregates**, so a 2025-26 snapshot becomes steadily more wrong as 2026-27 progresses. `days_rest`
(→ factor A4) and `location` are among them.

### ⚠⚠ AND A LARGER QUESTION THE SAME CHECK RAISED — **do the pipelines load anything into Postgres?**

**VERIFIED 2026-09-20 across both workflow files:**

| Pipeline | Steps touching Postgres |
|---|---|
| **P1 weekly static** | `build_defender_ratings.py` · `build_static_context.py` · the certifier. **Nothing else.** |
| **P2 overnight heavy** | `check_delta_gaps.py` (reads) · `grade_board_outcomes.py` · `export_market_spreads.py` · **`load_baseline_ladder.py`** · calibration/confidence refits · the certifier |

**`load_baseline_ladder.py` is the ONLY loader in either pipeline, and it loads only the baseline
ladder artefact.**

**There is no load step for:** teams · players · bio · arenas · season tables · team stats · on/off ·
playtypes · tracking · DARKO · shot quality · **player game logs** · **starter status** ·
**officials** · splits · career totals.

**All of these have Postgres writer Workers** — built T1–T6, registered in
`nba_config.worker_definitions`, wired through admin-sql. **Nothing in P1 or P2 invokes any of them.**

**Two readings:**
1. **Benign** — the writer Workers carry their own cron triggers, or a Coworker scheduled task calls
   them (which is the T1 operating model: *"each run triggered by a Claude Coworker scheduled task"*).
2. **Not benign** — the pipelines refresh committed JSON and **Postgres never sees it**, leaving every
   `nba_ref`/`nba_stats` table frozen at whatever the last manual `run_job` wrote.

**Reading 1 is plausible and consistent with the original no-orchestrator design** — the pipelines
mine and commit; Coworker triggers the writers. **But nothing in the workflows documents that
handoff**, and an unattended P2 at 01:00 PT would then depend on a separate trigger firing between
P2's commit and P3's 1:15 PM scoring.

**→ THE SINGLE MOST IMPORTANT PRE-SEASON VERIFICATION.** Either confirm the writer Workers are
scheduled, or add explicit load steps to P1 and P2. **One counter-check settles it**: if
`nba_stats.player_game_log` gains rows after opening night without a manual trigger, reading 1 holds.

---

**Purpose.** Everything that is NOT finished, NOT shipped, or NOT to be trusted at face value, plus
every bug and error found along the way. Nothing here is fixed by the documentation pass — it is
recorded so it can be fixed deliberately afterwards.

**Status vocabulary**
| Status | Meaning |
|---|---|
| `DEFERRED` | intentionally postponed, will be done |
| `DROPPED` | decided against, will NOT be done |
| `PARTIAL` | built but incomplete |
| `BLOCKED` | cannot proceed without something external |
| `CAVEAT` | works, but has a condition you must know |
| `BUG-FIXED` | a real defect found and fixed — kept because the pattern recurs |
| `BUG-OPEN` | a real defect found and NOT yet fixed |

Every entry carries the transcript it came from and the date it was added here.

---

## FROM T1 — `2026-09-03-03-22-04-nba-expansion-phase1-static.txt`
*added 2026-09-20*

### BLOCKED-PERMANENT · Cloudflare Workers cannot reach nba.com
Every domain in the family — `stats.nba.com`, `cdn.nba.com`, `core-api.nba.com`, `data.nba.net` —
fails identically from Cloudflare Workers. Proven with a read-only multi-endpoint probe, not assumed.
**This is why every NBA scrape runs on GitHub Actions instead.** Not fixable; it is the architecture.

### CAVEAT · plain `requests` is TLS-fingerprinted and tarpitted
Three consecutive timeouts (not rejections — silent hangs). A proxy did NOT help, which ruled out IP
blocking and pointed at TLS fingerprinting. **`curl_cffi` with browser impersonation is mandatory** for
every NBA scraper. Any new scraper written with plain `requests` or `urllib` will hang.

### CAVEAT · a new MCP tool cannot be used in the session that creates it
`github_trigger_workflow` was added to `alphadog-v2-admin-sql.js` and deployed, but the conversation's
tool list is fixed at session start, so it was unusable that session — and a reconnect did not help.
**Workaround in use: file-based workflow triggers** (`nba/TRIGGER_NBA_SCRAPE.txt`,
`nba/TRIGGER_NBA_PROBE.txt`), which need no new tool.

### BUG-FIXED · `abbreviation` empty for all 30 teams
The first successful scrape returned blank abbreviations because `TeamAbbreviation` is not in that
endpoint's actual response. Caught by verifying the committed file rather than the scraper's own meta
claim. **Pattern: always verify the artefact, never the success report.**

### BUG-FIXED · deploy path bug on the first NBA worker
First deploy of `alphadog-v2-nba-static-teams` failed on a path error in the patched
`generate_wrangler_configs.py`; fixed and redeployed clean.

### CAVEAT · balldontlie is a fallback, not the source
`balldontlie_api_key` is stored in `nba_config.external_credentials`, but the owner's stated preference
is that data come from nba.com itself, as MLB's does. Treat balldontlie as contingency only.

---

## FROM T2 — `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt`
*added 2026-09-20*

### BUG-FIXED · GitHub API content-type mismatch
The worker requested the GitHub API's **raw** content-type then parsed it as the **base64-JSON
envelope**, producing `"Unexpected end of JSON input"`. Looked like a permissions error; was not.

### BUG-FIXED · fleet deploy order breaks new bindings
Workers deploy **alphabetically from the file diff**, so `alphadog-v2-admin-sql.js` (which holds the
bindings for new workers) sorted BEFORE `nba/alphadog-v2-nba-static-players.js` and failed.
**Permanent fix in `github_mobile_deploy_workers.py`: admin-sql always deploys LAST.**

### BUG-FIXED · git push race, non-fast-forward
Three scrapes succeeded but the final push was rejected by a concurrent push.
**Permanent fix: retry-with-rebase loop** — now standard in every NBA workflow.

### BUG-FIXED · arenas: the endpoint no longer carries the columns
`ARENA` / `ARENACAPACITY` came back null for all 30 teams. A diagnostic dump proved the columns are
genuinely **absent from that endpoint's real schema**, not mis-parsed. Switched to
`teamdetails` → `TeamBackground`. **Pattern: dump the real response before patching the parser.**

### BUG-FIXED · officials script needs plain `requests`, not `curl_cffi`
Wikipedia's API is designed for programmatic access and needs no bot bypass; the package was never
installed in the workflow. **Not every source takes the same transport.**

### BUG-FIXED · commit step hard-failed when one scraper produced nothing
Fixed so a single empty scraper cannot fail the whole run.

### CAVEAT · arena capacities are null where the SOURCE lacks them
Some of the 30 arenas have no capacity because `teamdetails` itself does not carry it. Recorded
honestly rather than filled from another source.

### CAVEAT · `source_key` only updates on rows that actually changed
25 of 30 teams kept their previous `source_key` because their data was identical. This is an upsert
property — do not read a stale `source_key` as a failed refresh.

---

## FROM T1 PASSES 3–7 — additional items *(added 2026-09-20)*

### BUG-FIXED · `column "active" does not exist`
The first query against `config.worker_definitions` used `active`; the real column is `enabled`.
Found by inspecting the real columns rather than guessing again.

### BLOCKED-PERMANENT · the assistant cannot reach `workers.dev` URLs
`x-deny-reason: host_not_allowed` from its own egress proxy, confirmed from raw response headers.
**Not fixable by switching tools.** Consequence: a worker can only be invoked through `run_job`.

### CAVEAT · `run_job`'s `target` is a fixed pre-wired enum
A new worker cannot be triggered until the bridge gets a service binding, an enum value and a dispatch
branch, followed by a redeploy. **This is why the four-step wiring pattern exists.**

### CAVEAT · D1 decommissioned system-wide 2026-08-12
All twelve bindings report `false` by design. Any attempt to read MLB logic through D1 will fail — this
is not transient.

### CAVEAT · the first teams load came from the FALLBACK, not the live API
Honestly logged at the time: *"genuinely seeded and correct today, but via the fallback, not the live
API."* The certified static 30-team list carried it until the GitHub-Actions path was proven.

### PARTIAL (resolved later) · ParlayAPI coverage was never verified in T1
`parlay-api.com` was unreachable from the sandbox, and probing it via the shared MLB queue was
deliberately refused as out of scope. Left explicitly open.
**Resolved in T12: our own scrapers beat it — ParlayAPI drops ~25% of rungs, proven by same-moment diffs.**

### OPEN DESIGN FORK (resolved) · shared board tables vs separate `nba_market`
The `sport`/`league` column exists on MLB's Sleeper/Underdog board tables but is **not wired for
dispatch** (the live code hardcodes `baseball_mlb` in the probe URL, the row filter and the league
literal). Flagged as *"a real fork worth your sign-off."* **Resolved in favour of separate
`nba_market` tables.**

### CAVEAT · inherited from MLB's own code
*"Cloudflare/GitHub deploys may not apply wrangler var-only edits reliably"* — which is why endpoint
and header defaults are hard-coded as fallbacks rather than relying on vars.

### OPEN-SINCE-T1 · an unclosed header/cookie follow-up
After the canonical-header rewrite, one path still returned an error and was *"flagged as a
non-blocking follow-up"* needing *"real header/cookie debugging"*. It correctly fell back, so nothing
broke — **but the follow-up was never closed.** Low priority (the GitHub-Actions path superseded it),
recorded so it is not lost.

### CAVEAT · the MCP connector caches its tool list at the CONNECTION level
Not per chat. This is why a disconnect-and-reconnect did not surface a newly deployed tool — a
genuinely fresh connection is required.

### CAVEAT · the full Cloudflare-origin response family
**403 "Access Denied" · 520 ("web server is returning an unknown error", edge-level) · 526.**
Root cause: **stats.nba.com is itself Cloudflare-fronted, and Cloudflare-to-Cloudflare traffic gets
flagged at the WAF/edge.** The request never reaches the app layer. No header tuning can fix it.

### CAVEAT · `STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR` is the marker to watch
A `source_key` of **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`** means the certified static list was
used, not live data. `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE` means real nba.com data. **Check the key
before trusting a load.** *(Corrected 2026-09-20 — an earlier entry recorded the truncated form.)*

### CAVEAT · NBA workers use DIRECT dispatch, bypassing the queue
Wired in the `BASE_HITTER_GAME_LOGS_WORKER` style — a direct call that *"bypasses queue entirely"*.
Deliberate: the owner specified no orchestrator. Copy that precedent for any new NBA worker.

---

## FROM T2 PASS 2 *(added 2026-09-20)*

### OPEN GAP · **garbage time is NOT filtered out of our season aggregates**
*"**garbage-time filtering** is an industry-standard practice (Cleaning the Glass, pioneered by Ben
Falk) that our existing season-aggregate data does **not** apply — `stats.nba.com`'s raw stats
**include garbage time**."*

**And it is NOT uniform** — Gemini rated it *"medium-high priority, **especially for bench-player props
whose season stats are almost entirely garbage-time minutes**."*

**A CONNECTION NEVER MADE, worth investigating:** the population most contaminated by garbage time
(bench and fringe players) is **exactly the population where the confidence model later measures the
largest error** — fringe players miss by **0.0283** vs iron-men at **0.0008**, a **35× gap**, which is
why `f_role` carries 55.6% of the deduction budget. **These may be the same problem seen from two
ends.** If a bench player's season aggregates are mostly garbage-time minutes, his baseline projection
is built on unrepresentative data — and the confidence model is measuring that, not just sample size.
**Never tested.**

Correctly deferred at the time: *"it can't be fixed at this layer — it needs play-by-play data, which
belongs to Phase 3b."* **It was never picked up in Phase 3b either.**

**⚠ UPDATE 2026-09-20 (T4 pass 8) — the specified proxy MAY ALREADY EXIST, half of it anyway.**
T4's research verdict deferred play-by-play but named the substitute: **"MIN + margin proxy noted for
later."** `nba_score.blowout_model` **is** a `minutes_by_margin` table — minutes ratios keyed to final
margin bands, 24,025 player-games. **That is the MIN + margin proxy, built in T16 under a different
name for a different stated purpose.**

**But it only covers one end of the contamination:**
| | Covered? |
|---|---|
| Correcting **projected minutes** for expected game script (forward-looking) | ✅ the blowout model |
| Cleaning **historical rate stats** (usage, per-36, efficiency) of garbage-time minutes (backward-looking) | ❌ **still open** |

**For a bench player whose season stats are "almost entirely garbage-time minutes", correcting his
projected MINUTES does not fix a per-36 RATE computed from garbage time.** The rate is the input the
baseline multiplies by. **That is the half that remains unfixed, and it is the half that hits exactly
the population where `f_role` measures a 35× error.**

### DECISION RECORD · EPM rejected on licensing, not capability
**EPM (Dunks & Threes)** was rated by Gemini as *"one of the highest predictive-lift single features"* —
then found to be **behind a paid subscription**. The line drawn:
*"Scraping paywalled content isn't something I'll do without your explicit sign-off — it's a real
legitimacy/ToS question, not just a technical one."* **Nothing was built against it.**
**This remains an open decision for the owner**, and DARKO (free, rated higher on RMSE) made it
non-urgent rather than resolved.

### CAVEAT · stats.nba.com requires the FULL parameter set
A partial query string returns a **real HTTP 500**, not a helpful error. *"many as empty strings"* —
send every documented parameter even when blank. Cost one debugging cycle on team stats; will cost one
on every new endpoint that forgets it.

### BUG-FIXED · `"Undrafted"` is a string in numeric draft fields
`DRAFT_NUMBER`, `DRAFT_YEAR`, `DRAFT_ROUND` return the literal string `"Undrafted"`. Fixed with
defensive coercion **applied to every numeric field**, not just the three that failed.

### CAVEAT · diacritics break naive name matching
A Jokić spot-check appeared to fail because the query used the ASCII spelling. **Not a data bug.**
First appearance of the problem that later becomes `nba/nba_names.py` + `nba_ref.player_name_map`.

### DECISION RECORD · DARKO chosen over EPM
**EPM (Dunks & Threes)** is public and was rated *"one of the highest-value single features."*
**DARKO (`darko.app`)** was then found to be **free AND rated higher** — *"beating both EPM and LEBRON
on predictive accuracy (RMSE)"*, and *"the single best predictive metric."* DARKO won on both counts.

### PROCESS NOTE · the owner twice overruled a "we're done" report
Message 697 (*"**No**, keep looking"*) and message 723 (*"Find alternatives… understand the relevance
of it"*) each followed an honest stopping point — and **each produced the session's highest-value
finding** (garbage-time filtering, then DARKO). Worth remembering before reporting exhaustion.

### UNEXAMINED EDGE · the weekly cadence reasoning fails early in a season
The justification for refreshing season aggregates weekly is explicit: *"a single game barely moves a
season average **after 20+ games played**."* **That is false in October and November**, when a single
game can move a season average substantially. The weekly cadence was never revisited for the
early-season case. **P1 runs weekly year-round.**

### CAVEAT · `*_written` counts are upserts, not totals
`aliases_written: 155/157` vs 162 total active rows. Unchanged rows are not rewritten — the same
property as `source_key`. **Comparing a worker's `*_written` figure to a `SELECT count(*)` will always
show a gap that is not a bug.**

### CAVEAT · `continue-on-error` on static scrapers vs fail-loudly on the baseline
The static scraper workflow sets `continue-on-error: true` per step so one broken endpoint does not
block the other seven — **and that is correct there**, because a missing entity is visible (its table
simply doesn't update). The baseline build forbids swallowing failures, because a missing prop pair is
**invisible** and corrupts the slate. **The rule is "never let an INVISIBLE failure pass," not "never
tolerate failure."**

---

## FROM T3 PASS 1 *(added 2026-09-20)*

### BUG-FIXED · **GitHub Contents API silently returns EMPTY content over 1 MB**
The schedule JSON is **1.2 MB**, above GitHub's Contents API inline-content limit, and *"the Worker's
fetch via that API **silently got empty content**"* — no error, no warning, just nothing.
**Fix: read via `raw.githubusercontent.com`, not the Contents API.**
**This applies to EVERY committed artefact over 1 MB** — and several now are (the injury shards, the
board files, the baseline ladders). Any worker still reading a large file through the Contents API is
silently getting nothing.

### CAVEAT · Hyperdrive caches query results for seconds
A differential test fired a phantom event because *"Cloudflare's Hyperdrive **caches query results
briefly** for performance; since I triggered runs seconds apart…"* — **not a logic bug.**
**Any test that writes then immediately reads through Hyperdrive can see stale data.** Verify the write
landed before triggering the read.

### CAVEAT · JavaScript bare decimals are invalid JSON
DARKO's hydration payload contains values like `.534094` with no leading zero — **valid JS, invalid
JSON.** The scraper repairs them before parsing. Any future hydration-extraction scraper will hit this.

### PROCESS NOTE · the snapshot layer had to exist BEFORE the next upsert
The owner corrected the sequencing: *"**first** you need to create the weekly function that will mine
the differential."* The reason is structural — *"the regular upsert workers already overwrite
`nba_ref.players` on every run, so I can't diff against 'current DB state' after they've run."*
**A differential layer cannot be added retroactively; it must capture a baseline before the next
overwrite.**

### PROCESS NOTE · the differential was proven, not assumed
Zero false positives across two runs only proves it does not fire wrongly. A **simulated** change was
required to prove it fires correctly — and that test failed twice (a race, then a cache artifact)
before passing. **"No events" is not evidence that a detector works.**

### BUG-OPEN · **82 play-type rows are scraped but never loaded**
| Stage | Count |
|---|---|
| Scraped (`player_rows_written`) | **3,364** |
| Loaded into Postgres | **3,282** |
| **Lost** | **82** |

**Verified live 2026-09-20 — `nba_stats.player_playtype_profile` holds 3,282 today.** Every other T3
load is exactly 1:1 (schedule 2,666, tracking detail 4,652, DARKO 530, team play types 630).
**Play types are the only mismatch.**

It went unnoticed because the scrape figure and the load figure were reported in **different messages**,
so no one compared them. **Likely cause (unverified): rows for players absent from `nba_ref.players`,
or duplicate (player, play_type) pairs collapsing on upsert conflict.**

**Not fixed** — per the documentation-pass rule. **The general lesson is the reportable one: a worker
that reports `rows_written` from the SCRAPE and a loader that reports its own count are two different
numbers, and nothing in the pipeline compares them.** The same blind spot could exist in any
scrape→load pair where the two counts are never asserted equal.

### OPEN QUESTION · is `shot_quality_delta` actually CONSUMED?
`nba_stats.player_shot_quality_delta` exists with the formula implemented exactly as designed
(`actual_efg_pct`, `expected_efg_pct`, `shot_quality_delta`, `total_fga`). Gemini called the underlying
metric *"likely the single most valuable public data point you can add to your system at this stage"*,
and it is the only direct answer the system has to the **hot/cold streak problem** — something season
averages structurally cannot catch.
**But whether the baseline or enrichment layer ever READS it is not established.** The enrichment
factor audit (T15/T16) tested ten candidates and none were shot-quality-based.
**If it is computed weekly and never consumed, that is a real gap** — the metric is built, validated
and sitting unused. **To verify: check whether any factor set or baseline recipe references it.**

### ⚠ UNCERTIFIED PROPS WILL STILL PRODUCE NUMBERS
`classification_ladder_v12.py` carries three certification states, and **only one of them has been
validated**:

| State | Props |
|---|---|
| **CERTIFIED** | the main singles set; `fga` — *"CERTIFIED both seasons (0.9 / 1.3, **0 band misses**)"* |
| **CONFIGURED, NOT YET RUN** | `turnovers` · `fg3a` · `ftm` · `personal_fouls` |
| **NOT YET CERTIFIED** | **`fgm` · `fta`** — *"ADDED 2026-09-12 (owner: the live PrizePicks menu carries these). **Configs are the closest certified analogue; NOT yet certified** — the first history run prints the band tables."* |

**These props have alphas, `k_stab`, step sizes and distribution families configured, so the ladder
builds them and `score_board_legs.py` will score them.** What they lack is the band-table validation
every certified prop passed. **A score with no certification behind it looks identical to one with.**

**Underdog offers FT Made, FG Attempts, 3PT Attempts and Personal Fouls** (T7's verified prop map), so
these are live board surface, not hypotheticals.

**To close**: run the history build for each and read the band tables — the mechanism already prints
them. **Or gate them out of the scorer until certified.**

### ⚠ `P(OT)` AND `foul risk` — named in the architecture
The five-dimension design lists *"Blowout risk, **P(OT)**, **foul risk**"* together as minutes-model
inputs, *"they act on opportunity, not efficiency."*

**✅ `P(OT)` EXISTS in the period layer** — measured at **5.3% at pick'em falling to 1.9% at 15+**, and
treated as a **mixture branch** (*"a star either gets ~5 crunch minutes or none"*). **It is absent from
the full-game ladder**, where it matters less.

**⚠ `foul risk` remains unbuilt anywhere.** In the full-game ladder, foul trouble appears only as an
exclusion filter (`PF < 6`). **The period layer models sit-out rates by game STATE, not by foul
trouble** — so a player fouling out of a competitive game is still unmodelled at every layer.

### ⚠ POSSIBLY AFFECTS MLB TOO · the symmetric sample-size floor
NBA's backtest found **a real bug in MLB's own guard, inherited by porting it**:
> *"Cell shrinkage toward the parametric value made far tails **worse**, which exposed a **real bug in
> MLB's own guard as ported**: **the symmetric sample-size floor forced true 0.002 rungs up to 0.25.**
> **Upper ceiling only.**"*

A guard meant to stop overconfident extremes was **symmetric**, so it also dragged genuinely tiny
probabilities **up** — **a 125× error at the far tail** (0.002 → 0.25). NBA fixed it by applying the
ceiling on the upper side only, after which *"far tails are exact (3PM +6 rung: predicted 0.002, actual
0.002)"* — the exact rung the bug had inflated.

**If MLB's live guard is still symmetric, MLB has this bug today**, and it would bite hardest on
demon-tier legs and long-shot alternates — precisely where the tails matter. **Worth checking
`alphadog-v2-base-baseline.js` / the live v6 function.** *(Not actioned — this pass documents only.)*

### ✅ RESOLVED · the FRINGE anomaly was LEAKAGE, not a filter artifact
The 0.87 fringe minutes ratio in won blowouts — *"below 1, where garbage-time accumulators should be
above"* — was suspected to be the ≥40%-of-median filter on small baselines. **It was not.**
> *"a **leakage bug** in the minutes harness (**a season-wide mean was using future games**; **that was
> the entire 'fringe anomaly'**), which shrank the role minutes multipliers to **honest ~1.0 values**."*

**Two lessons kept:**
1. **The anomaly was only detectable because the expectation was written down first** — the seed cells
   encoded *"a LIFT for a fringe garbage-time accumulator"*, so a ratio below 1 was a wrong *sign*
   against a stated prediction, not just an odd number.
2. **Leakage inflates apparent skill** — the multipliers were over-confident until it was removed.
   *"Shrank to honest ~1.0 values"* is the signature.

### 🎯 WHERE THE EDGE ACTUALLY LIVES — a prediction that half came true
T9 measured the factor layer and stated plainly where the gains would have to come from:
> *"**Effect on precision is real but small**: **Brier improves 0.1–0.3%**, calibration unchanged.
> **A ±3% pace edge moves a 20-point player ~0.7 points — about 2 pp of probability.** …the factors
> were not unneeded: **no, but they are NOT where the big gains are. Those must come from THE LIVE
> ENRICHMENT (injuries and lineups moving minutes and usage) and from COMBO STRUCTURE.**"*

**Scoreboard on that prediction:**
| Named source of edge | Outcome |
|---|---|
| **Combo structure** | ✅ **delivered** — P+R 0.9, R+A 0.9, fantasy 0.8 pp on the holdout; *"combos via joint structure, never a direct fit"* validated |
| **Live enrichment** | ❌ **did not** — T15/T16 tested **ten candidates; none survived at leg level** |

**One for one.** Which leaves the system's edge resting on **calibration quality + combo structure +
the board-scoped tails**.

**And the tails were already nominated as the biggest prize** (T8.16c): *"we're not modelling the
mean, we're modelling the **right tail** (80th–99th percentile)… likely the **#1 area where a sharp
baseline earns the most**, because **naive book models mis-price tails**."*

**That is now the standing hypothesis by ELIMINATION, not merely by design** — and it is testable the
moment real board data with goblin/demon rungs is in hand. **Worth making explicit before the season,
because it determines what the slip-building phase should optimise for.**

### STRUCTURAL FINDING · **the props that won't certify are the OPPONENT-driven ones**
> *"the **'close' props are EXACTLY the ones whose primary drivers are *opponent* stats** — **steals ←
> opponent turnover rate**…"* (T9)

**Blocks, steals and FTM all failed or nearly failed the two-season standard, and all three depend on
what the OPPONENT does** — opponent rim-attempt rate, opponent turnover rate, opponent foul rate.
**A player-history baseline structurally cannot see these.**

**This is a diagnosis, not an excuse**, and it matches T7.15a's factor lock exactly (blocks/steals
driven by *"opp rim-attempt rate / opp TO rate"*). **It also explains why the factor layer was the
proposed remedy** — the missing information is not in the player's history at any depth.

**It connects to the opponent-defence memory gap above**: the factor study asked for opponent ratings
on a **10–15 game rolling window**, and only season aggregates and weekly as-of fits exist.
**The props that need opponent signal most are the ones whose opponent signal is coarsest.**

### PRINCIPLE · test new factors against the props that ALREADY PASS, first
> *"the certified props with factors in — **points and rebounds first, since if factors *hurt* the
> certified ones that's the most important thing to know**"* (T9)

**The risk of adding a factor layer is regression on what already works**, not merely failure to
improve the laggards.

### ⚠ TRAP (inherited from MLB, applies to any NBA worker) · a filter parameter that doesn't filter
> *"When adding any **'limit to these specific items' parameter** to an NBA worker, **verify it
> constrains the ACTUAL WRITE PATH, not just what gets echoed back in the response.**"*

**A scope parameter that only shapes the response looks correct in every test that reads the
response.** The write proceeds unfiltered.

**This is live for NBA**: `FE_DATE` on `build_final_hp.py`, `BT_PROPS`, `GAP_SEASON`, `INJURY_MODE`,
`SLEEPER_SPORTS`, the backfill worker's `mode`, the measure-types writer's `file_prefix` — **every one
is a "limit to these specific items" parameter.** *(The `SLEEPER_SPORTS`/`SLEEPER_OUT_DIR` case is the
same family: the default scraped MLB and wrote to a path nothing committed.)*

### ⚠ TRAP · `NOT IN` from an array parameter, especially when EMPTY
> *"A **`NOT IN` clause built from an array parameter via a query-builder's tagged-template array
> handling can be unreliable, especially when the array is empty**, producing a real *malformed array
> literal* [error]."*

**The empty case is the dangerous one** — an exclusion list that is empty should exclude nothing, and
instead errors or silently changes the predicate. **`known_empty_games` is exactly this shape**: a
skip list that is empty on day one.

### ⚠ THE PASS-COUNT PRECEDENT — MLB needed 13 passes to reach two consecutive clean
Part E records what the standard actually cost in practice:
> *"a real scrutiny effort that **would have stopped after an early clean-seeming pass** instead
> **kept finding genuinely new, real issues across 13 TOTAL PASSES before finally reaching TWO
> CONSECUTIVE CLEAN ONES**. **Apply the same discipline to any NBA system component receiving a
> dedicated verification effort — the scoring engine, the outcome grader, a new enrichment factor —
> rather than treating a single clean-looking check as sufficient.**"*

**Three named NBA components are due this treatment and have not had it**: **the scoring engine**,
**the outcome grader**, and **each new enrichment factor**.

### ⚠ BUG PATTERN · an "unprocessed rows" filter that loops forever
> *"**A 'still needs processing' filter that doesn't exclude rows which can STRUCTURALLY NEVER satisfy
> the condition being waited on causes a GENUINE INFINITE LOOP, not slow progress.** MLB found a real
> case of a scoring query filtering only on **'score is still null'**, without also excluding rows that
> **could never receive a score because a hard prerequisite value was itself missing** — the pipeline
> **endlessly re-attempted the same unscoreable rows forever**, and the apparent 'progress' (**a
> slowly ticking percentage**) was **actually STUCK, not advancing**."*

> **The rule**: *"**Any NBA processing loop with a 'find rows still needing work' filter must ALSO
> explicitly exclude rows that can never satisfy that condition, OR verify TOTAL ADDRESSABLE COUNT is
> actually SHRINKING over time — not just that some percentage metric is moving.**"*

**Live instances to check in this build:**
| Loop | Rows that can never satisfy |
|---|---|
| **`score_board_legs.py`** | legs whose prop has **no ladder** (`double_double` carries a sentinel −1.0), legs for players with **no `mu_role`** (`role_tier is None` → NaN), **unmapped `market_key`s** |
| **`grade_board_outcomes.py`** | `unmatched_player` / `unmatched_not_in_season` legs — **permanently ungradeable** |
| **The per-game delta** | ✅ **already solved** — `known_empty_games` is exactly this exclusion: *"without it the 3 games the source returns empty would be re-fetched every single day forever"* |

**`known_empty_games` is the correct pattern, already proven in this codebase.** The same shape should
exist wherever a loop asks "what still needs work?"

**And the diagnostic**: **a percentage that ticks is not progress.** Check the **absolute addressable
count** is falling.

### ⚠ BUG PATTERN · naive truncation corrupts structured payloads
> *"**A generic payload-truncation utility that does a NAIVE BYTE/CHARACTER SLICE on serialized
> structured data (JSON) can CORRUPT that data by CUTTING IT MID-FIELD**, producing **invalid, garbled
> output rather than cleanly dropping whole fields**. MLB found and **traced a real, subtly-caused
> downstream data-quality bug all the way back to exactly this.**"*

> **The rule**: *"**Any NBA utility that truncates a structured payload to fit a size limit must be
> STRUCTURE-AWARE — truncate whole fields/objects, never a raw string slice.** A naive slice is a real,
> **hard-to-trace** corruption source."*

**Live surfaces where a payload is size-constrained in this build:**
- **`raw_json` JSONB** on every reference and stats table — if anything trims it to fit, it must drop
  whole keys
- **The bridge's own tool results** — `max_rows`, and the **grep/read utilities that return truncated
  file content** *(this is the same mechanism that truncated `FALLBACK_AFTER_FETCH_ERROR` to a
  partial string during this documentation effort — a live instance of the pattern, caught only by
  reading the full line later)*
- **`nba_score.baseline_ladder_runs.factor_fits` / `.role_minutes_multiplier`** JSONB
- **The 1 MB Contents API limit** — which does not truncate but returns **empty**, a different and
  arguably safer failure

### ⚠ BUG PATTERN · a read-side filter that hides the evidence of its own cause
> *"**A read-side filter that silently EXCLUDES rows with a missing/null field can HIDE THE VERY
> EVIDENCE needed to diagnose the upstream bug causing that field to be null in the first place.**
> MLB found a case where a downstream query **required a specific field to be n[on-null]**…"*

**This is a diagnostic trap, not just a data bug**: the rows that would explain the problem are
exactly the ones the query drops.

**Live instances in this build:**
| Filter | What it hides |
|---|---|
| `mu_role` / `role_tier IS NOT NULL` gates | players the minutes model could not project — **the population most worth diagnosing** |
| `comp_min` `np.nan` for non-competitive/high-foul games | the dud population, by construction |
| The NaN guard in `build_availability_delta.py` | ✅ **correctly counts and REPORTS what it drops** — the right pattern |

**The NaN guard is the model to copy**: it drops bad rows **and reports the count**, so the exclusion
is visible rather than silent.

### ⚠ PROP-DEFINITION MISMATCH CREATES A PHANTOM LINE-SHOPPING SIGNAL
Lesson #14 (T1), stated in full:
> *"**The same-sounding prop name can mean genuinely different underlying stats on different
> platforms.** [The recorded case]: **a fantasy-score-style composite prop used DIFFERENT SCORING
> FORMULAS on different platforms, producing a LARGE PHANTOM 'LINE DIFFERENCE' that LOOKED LIKE A
> LINE-SHOPPING OPPORTUNITY but was actually just TWO PLATFORMS MEASURING DIFFERENT THINGS WITH THE
> SAME NAME.**
> **Before any cross-platform prop comparison for NBA, explicitly verify the prop's exact
> definition/formula** [on each platform]."*

**The danger is not a wrong number — it is a FALSE OPPORTUNITY.** A definitional gap between two apps
presents exactly as a mispriced line, and it points the wrong way with high confidence.

**Directly live for NBA**: five apps are scraped and their boards land in one table,
`nba_market.board_snapshots`, keyed by `market_key`. **Any cross-app comparison on the same
`market_key` assumes definitional equivalence.**

**Known definitional differences already recorded:**
| Difference | Source |
|---|---|
| **OT included in 2H/4Q on PrizePicks/Underdog, EXCLUDED on Sleeper** | T7 prop map — *"different products, different models"*; ~7–8% OT probability at a 1-point spread |
| Fantasy scale **verified identical** (`1/1.2/1.5/3/3/−1`) across all three apps | T9 `prop_taxonomy` seeding — this one was checked |
| Sleeper milestone lines (20+/25+/30+) vs "no alternate lines" | unresolved, `NBA_GOBLIN_DEMON.md` §9 |

**The fantasy scale was the one checked, and it passed.** **The OT rule is the one that differs — and
it is exactly a same-name-different-stat case.** A 4Q points line on Sleeper and on PrizePicks are
**different props**, and comparing them would produce precisely the phantom signal #14 describes.

**Not verified for**: period props generally, `stocks` composition, `fantasy_score` on Fliff and Betr.

### ⚠ THE DOMINANT BUG CLASS · a grouping key or join that doesn't isolate what it claims to

**MLB's lessons document devotes an entire section — Part C, *"the pipeline/data-quality bug family to
actively guard against in NBA FROM DAY ONE"* — to this.**
> *"All of the following were **real, separately-discovered bugs** in MLB, and **every one of them is
> the SAME UNDERLYING SHAPE: a query, join, or grouping key that SILENTLY INCLUDED THE WRONG
> POPULATION.**"*

#### The named members of the family, with their tells
**The source lists the recurring forms as: *"an opponent's data via an UNFILTERED JOIN, a DIFFERENT
TIER/VARIANT SHARING A NAME, MULTIPLE SIMULTANEOUS LINE-LADDER RUNGS MISTAKEN FOR TIME-SERIES
MOVEMENT"*** — i.e. the failure is *"a grouping key or join that failed to isolate the specific unit
being measured — instead **silently pooling in something else**."*

| # | Bug | **The tell** |
|---|---|---|
| **1** | **A join on a shared key without a FULLY-SPECIFYING condition** (e.g. team+game **without player**) **fans out and double- or multi-counts** | **an unexpected EXACT MULTIPLE in row counts — 2×, 3× — versus the expected population size** |
| **2** | **A "baseline" or "control" that already CONDITIONS ON THE VERY THING BEING MEASURED** — *"erases the effect it's supposed to measure"* | **always check the control is defined INDEPENDENTLY of the effect under test** |
| **3** | **Pooling across sub-groups with different true base rates before computing a ratio** — **Jensen-style aggregation bias** | *"can INFLATE OR INVENT an effect that isn't really there at the pooled level"* |
| **4** | **Nested / hierarchical outcomes** — *"a lower threshold AUTOMATICALLY IMPLIED by a higher one on the same underlying stat… look like independent correlated events but are actually NEAR-DETERMINISTIC"* | **EXCLUDE same-entity nested lines from any independence/correlation study** |
| **5** | **A composite/derived stat computed with TWO DIFFERENT UNDERLYING FORMULAS across data sources** | *"produces PHANTOM 'differences' that look like real signal"* |
| **6** | **Multiple simultaneous price/line variants** (a full ladder of tiers offered at once) **mistaken for a TIME-SERIES of one thing moving**, *"if the grouping key doesn't ALSO key on the specific VARIANT/TIER"* | — |

#### ⚠ Members 4 and 6 are live risks for this system right now
**#6 is the ladder, exactly.** A PrizePicks board offers **standard, goblin and demon rungs for the
same player-prop simultaneously**. Any grouping that keys on `(player, prop, snapshot)` **without
`line` and `odds_type`** will read a static ladder as a line that moved. **`board_snapshots` keys
include `line` and the tier tables key on `kind`/`tier` — but any ad-hoc query over that table must
do the same.**

**#4 is combos and milestones.** `points ≥ 20` and `points ≥ 25` for the same player are
**near-deterministic, not two correlated observations** — and neither are `points` and `PRA`.
**Lesson #12 names this as one of three contamination sources** inflating same-game correlation.
**NBA's per-player covariance work avoids it by modelling components jointly**, but any future
correlation study must exclude same-entity nested lines explicitly.

**#5 is the fantasy-scale issue in general form** — the same nominal stat computed under two
formulas produces differences that are artefacts, not signal. **Lesson #14 is its specific case.**

**The standing action**: *"before trusting any grouping key or join in a new table, sanity-check that
it actually isolates what it claims to"* — **and look for exact multiples in row counts as the first
diagnostic.**

#### NBA's own instances — at least four, three of them silent
| Instance | Effect | Visibility |
|---|---|---|
| `norm_market()` naive `replace('player_','')` | **23,286 legs — 44% of the board — scored nothing** | **silent** |
| Splits PK omitting `season` | only one season can ever exist | **silent overwrite** |
| Lineup PK omitting `team_id` | traded players collide | **failed loudly** ✅ |
| Gap sample grouping on `matchup` | **every game listed TWICE** | **exactly the 2× tell from #1** |

**The `matchup` duplicate is member #1, textbook** — a grouping key that did not fully specify the row,
producing an exact 2× multiple. **It was caught because the multiple was exact.**

**Member #2 is worth watching here specifically**: `gain_vs_anchor` compares a factor against the
certified anchor. **If a factor's evaluation slice were selected using anything the anchor already
conditions on, the comparison would erase the effect.** *(T8's note that prior strength measured
against tier-mates is **circular** — tier-mates were *selected* for similarity — is the same shape.)*

### 📏 THE SAMPLE-SIZE POSTURE — adopt as a mechanical default from opening night
> *"**fewer than 15 real days is NOT YET A RESULT AT ALL; 15–30 days is DIRECTIONAL ONLY; 30–70 days is
> usable WITH REAL CAVEATS STATED; 70+ days is GENUINELY REPORTABLE.**
> **Days of real, distinct data matter FAR MORE than total leg count — a large leg count concentrated
> in a handful of days is A SMALL-SAMPLE FINDING WEARING A LARGE-N DISGUISE.**"*

**The NBA season opens 2026-10-03.** By this standard: **directional around 24 October, caveated
results in early November, genuinely reportable around mid-December.** ~58k legs/day will look like an
enormous sample long before it is one.

### ⚠ #25 · COMPOUNDING SAFETY MARGINS — relevant the moment slip EV is computed
MLB deployed *"an extra, deliberate conservative discount **ON TOP OF** an already-real,
already-conservative observed ratio"* — which **compounds absurdly once exponentiated across a
multi-leg slip.**
**A 5% haircut per leg is 23% on a 5-pick slip.** Any conservatism must be applied **once, at the slip
level**, not per leg and then again in aggregate. **Not yet relevant — the slip phase has not begun —
but it will be immediately.**

### ⚠ AS-OF CONTAMINATION — the recurring bug of this system, FOUR instances
| Instance | Where | Recorded |
|---|---|---|
| **A baseline measurement included day D's own results** → apparent discrimination **+39.76 pp**; corrected to **+5.32 pp**, vs the enriched model's **+5.31 pp** | T1, Part F | *"an entire multi-day investigation's founding premise rested on a lookahead-bias bug in the baseline measurement itself"* |
| **`backtest.baseline_v6_asof` leaked each leg's own game-day** (`as_of_date = D` included day D) | T1, relayed 2026-08-29 | verified via `non_push_sample` matching game-log counts |
| **A season-wide mean using future games** — *"that was the entire FRINGE anomaly"* | T8 | multipliers *"shrank to honest ~1.0 values"* after the fix |
| **A pasted calibration table carried across days** — the parity violation | live session | `ladder_calibration` dropped, replaced by `ladder_calibration_asof` |

**Common signature: INFLATED APPARENT SKILL.**

**Part F adds a second signature worth knowing**: *"a huge apparent gap"* between two components that
should be comparable. The +39.76 vs +5.31 gap looked like a finding about enrichment; it was a defect
in how the baseline was measured. **When two layers of the same pipeline disagree dramatically,
suspect the measurement before the mechanism.**

**Verification methods recorded:**
- **Non-push sample vs game-log counts** (the MLB method) — if the as-of prediction can only be right
  because day D is in it, the counts reveal it
- **NBA's structural guard**: `classification_ladder_v12.py` is `shift(1)`-based by construction, and
  T9 records *"the backtest harness on a past day IS already the production computation — every
  feature is shift(1)-based"*

**Open**: no equivalent of the non-push-count check has been run against NBA's own as-of surfaces.

### ⚠ APPLY THE SAME SUSPICION TO THE CONTROL AS TO THE TREATMENT
Stated in T1, Part F:
> *"**Before investigating why a component seems to underperform a supposedly-strong reference point,
> VERIFY THE REFERENCE POINT ITSELF as rigorously as the thing being blamed** — a 'before' or
> 'control' measurement is **just as capable of containing a lookahead-bias or leakage bug** as the
> 'after' measurement everyone's default instinct is to scrutinize."*

**Direct application in this system**: `gain_vs_anchor` measures every enrichment factor **against the
certified anchor**. **Ten factors were rejected on that comparison.** The anchor is the reference
point, and Part F's rule says it warrants the same scrutiny as the candidates.

**What supports the anchor**: it is `shift(1)`-based by construction, certified on both seasons
(0.7–1.2 pp ladders, `0 misses of 37`), and its holdout ran with the fitted cells disabled.
**What has not been done**: a leakage check on the anchor of the kind Part F describes — i.e. verifying
the anchor's own as-of construction with the same method used on candidates.

**Note this is not a claim that the anchor leaks.** It is a recorded gap between the rule and what has
been verified.

### FROM T1 · the open questions raised at the outset, *"explicit, not silently decided"*

**1. ParlayAPI `basketball_nba` real coverage was never independently verified**
> *"bookmakers, markets, live-vs-historical depth — **carried over from Phase 1's unresolved gap**.
> Needs a decision on how to test it (**a small isolated NBA probe worker seems the lowest-risk
> path**, given the 'no MLB-system changes' constraint) **before Section 2's 'reused as-is'
> assumption is trusted for anything beyond the account/key**."*

**Never verified — superseded instead.** Own scrapers proved to capture ~25% more rungs, so the
question stopped mattering for boards. **ParlayAPI's retained use is validating the derived spread**,
which is a narrower claim than the "reused as-is" assumption the question was gating.

**2. The board-table fork — reuse MLB's tables filtered by sport, or create `nba_market`?**
> *"**Reuse `market.sleeper_board_current` / `underdog_board_current` (which ALREADY CARRY UNUSED
> `sport`/`league` COLUMNS) filtered by sport, vs new `nba_market.sleeper_board_current`?**
> …defaults to **fully new `nba_market` tables for a clean, independent data universe** (matching the
> person's explicit instruction), **but flagging this as A REAL FORK IN THE ROAD since the existing
> columns exist and are currently unused for MLB filtering**."*

**Decided: fully separate `nba_market`.** The MLB tables' `sport`/`league` columns remain unused.
**Consistent with the two-mechanism isolation rule** (prefix *and* folder; here, schema *and*
dataset). **Recorded as a deliberate fork, not an oversight** — the alternative was viable and was
rejected on the owner's isolation instruction.

**3. Which enrichment factors for v1, and in what order?**
> *"The person named categories (**referee, arena, fatigue, injury, 'and many more'**) but said
> explicitly these are **'yet to be locked'**. **Phase 3c is where this gets decided WITH REAL SOURCE
> VERIFICATION PER FACTOR — not assumed here.**"*

**Resolved**: the factor registry holds 67 factors, 25 tagged baseline / 4 enrichment at seeding, each
with `relevant_prop_keys` gating. **The "real source verification per factor" discipline held** —
e.g. EPM was rejected on licensing, referees were sourced from Wikipedia after the stats API proved to
have none.

**4. ⚠ The referee dictionary was an OWNER-ORIGINATED factor with NO MLB precedent**
> *"**MLB's own factor mapping doesn't carry an MLB referee-tendency analogue into NBA AT ALL; the
> person is proposing a GENUINELY NEW, NBA-SPECIFIC FACTOR CATEGORY NOT COVERED BY THE TRANSFER
> PACKAGE.** Needs its own real source-verification pass — **does the NBA's own official API expose
> referee assignments/tendencies, per the blueprint's discipline of CHECKING THE SPORT'S OWN OFFICIAL
> API BEFORE ANY THIRD-PARTY SOURCE?**"*

**Verified and partially resolved:**
| Question | Answer found |
|---|---|
| Does the official API expose referee **rosters**? | **No** — *"the stats API has none"*, so Wikipedia's `List of NBA referees` was used |
| Does it expose per-game **assignments**? | **Yes** — `boxscoresummaryv2`/v3 `Officials` result set → `nba_stats.game_officials`, 3,681 rows |
| Same-day **assignments** for tonight? | `scrape_referee_assignments.py`, ~6–7 AM PT — **semi-live**, so the baseline holds a historical crew foul-rate table and **the assignment is applied in enrichment** |
| Referee **tendencies** as a scoring factor? | **D1** — capture built, **0 rows until the season** |

**The discipline named — check the sport's own official API before any third party — was followed and
produced a split answer**: assignments yes, roster no.

**5. The exact list of "static differential" entities**
> *"the person named **calendar / teams / players / rosters / arenas / referees**; confirm this is the
> full v1 list or whether anything else (e.g. **an alias table**, **a stadium/arena-context table
> analogous to MLB's park factors**) belongs in the same run."*

**Resolved — both suggested additions were built**: `nba_ref.team_aliases` (162) and
`nba_ref.player_aliases` are the alias tables; `nba_ref.arenas` (30) is the arena-context table.
**⚠ But `arenas` carries the park-factor analogue only as empty columns** — `altitude_ft` and
`timezone` are **0-of-30 populated** (see the cheap-fix entry above).

**6. ⚠ THE QUESTION THAT DEFINED THE ENTIRE OFFSEASON BUILD**
> *"**With no live season for ~1 month, what's the real, useful scope of 'backfill + design' work
> right now** — i.e. **which specific static/historical data sources can genuinely be probed and
> locked TODAY**, versus **which board/market/live-context work HAS TO WAIT until the season starts**
> regardless of how much design work is done in advance.
> **Recommend addressing this concretely as the VERY NEXT STEP, before opening multiple new per-domain
> chats, so each new chat has a real, doable ta[sk].**"*

**This question shaped everything that followed.** The answer, as executed across T1–T9:
| Doable without a season | Had to wait |
|---|---|
| all static/reference data | live board capture |
| 3 seasons of game logs (79,358 rows) | goblin/demon tier certification |
| the full baseline + calibration to leg level | the multiplier observation study |
| combos, periods, the production builder | real-money/quote confirmation |
| the delta path, proven by replay | selection and slip strategy |

**And the owner's own later framing confirmed the split** — *"with the previous seasons, I am sure you
can **simulate** the classification/baseline pipeline, which is already enough to define logic, define
the player tiers, the metrics"* (T7), answered with *"**no reason to wait for October for any of
that**."*

**The one thing the plan expected to be doable and wasn't**: the board scraper first (startup plan
step 3) — see `NBA_RECIPE.md` STEP 0b.

### ⚠ THE CANONICAL-ID RULE — decided in T1, worth auditing
> *"**Naming discipline that mattered in MLB, KEEP IT IDENTICAL: use ONE CANONICAL ID FORMAT FROM DAY
> ONE.** MLB had **a real, MULTI-TABLE BUG from mixing bare numeric team IDs with a prefixed format
> like `mlb_133`** — **GREP FOR FORMAT INCONSISTENCY PROACTIVELY, DON'T WAIT FOR IT TO SURFACE AS A
> DOWNSTREAM SYMPTOM.**
> **For NBA, decide the ID convention (e.g. `nba_<team_id>`) BEFORE WRITING THE FIRST TABLE and apply
> it everywhere.**"*

**What NBA actually uses**: `nba_ref.teams` carries **`team_id` TEXT** *and* **`nba_team_id` BIGINT**
side by side — i.e. **both a prefixed/text form and the bare numeric form, by design**, with the
aliases keyed on `alias_key`.

**Two known ID incidents already in the record, both of the flagged family:**
| Incident | Detail |
|---|---|
| **`PLAYER_ID` cast to string too late** | *"the virtual rows are built **before `PLAYER_ID` is cast to string**, so the roster ids come out as **ints**"* (T9) — a one-line fix |
| **`player_id` lowercase vs `PLAYER_ID`** | the bio file used `players`/`player_id`/`age`, not `records`/`PLAYER_ID`/`AGE` — **every age was NaN** and the B2B table was silently empty (T8) |

**Neither was a prefix mismatch, but both were ID-format mismatches producing silent wrong results** —
which is the failure class the rule exists to prevent.

**The instruction not followed**: *"grep for format inconsistency **proactively**."* **No proactive
ID-format audit is recorded in any transcript.** With `team_id` TEXT and `nba_team_id` BIGINT
coexisting across `nba_ref`, `nba_team`, `nba_stats` and `nba_calendar`, **a proactive grep is the
cheap version of the check the rule asks for.**

### ⚠ EIGHT PLANNED SCHEMAS WERE NEVER CREATED

**T1 specified fourteen `nba_`-prefixed schemas, ported from MLB's per-domain convention.** The
blueprint gives each one's purpose:
| Schema | Stated purpose | NBA state |
|---|---|---|
| `ref` | *"Static reference: teams, players, **aliases**, stadiums/**arenas**, **prop taxonomy**"* | ✅ `nba_ref` |
| `calendar` | *"Game calendar/schedule, **live game status (`is_live`, `is_final`, `game_time_utc`)**"* | ✅ `nba_calendar` |
| `stats_hitter` / `stats_pitcher` | *"Player game logs, splits, rolling metrics"* — **renamed for NBA** | ✅ **one** `nba_stats` (no hitter/pitcher split) |
| `team` | *"Team-level game logs, **starter/rotation history**"* | ✅ `nba_team` |
| **`daily`** | *"**Same-day context: lineups, confirmed starters/rotations, availability, matchup context**"* | ❌ **never created** — contents landed in `nba_score` (`availability_delta`) and committed JSON |
| **`context`** | *"**Historical snapshots of daily-context factors** — **SHORT RETENTION BY DESIGN in MLB — SEE LESSONS DOC FOR WHY THIS BIT THEM**"* | ❌ **never created** |
| `market` | *"**Live board/odds state per platform — CURRENT-ONLY tables**"* | ✅ `nba_market` — **but NBA's is NOT current-only**: `board_snapshots` holds 6.6 GB of history |
| **`archive`** | *"**Permanent historical archives of anything `market`/`context` only holds CURRENT-STATE for**"* | ❌ never created — **and NBA does not need it the same way**, since `nba_market` keeps history directly |
| `score` | *"Scoring engine output: prepared board, final board, **outcome grading**, **pricing/multiplier study tables**"* | ✅ `nba_score` |
| **`backtest`** | *"**Point-in-time reconstruction tables** and ad-hoc research tables (**walk-forward datasets, real-multiplier studies**)"* | ❌ never created — walk-forward lives in `nba/backtest/` scripts and `nba_score.baseline_history` |
| `control` | *"Job queue, worker registry, scheduled jobs, session logs"* | shared with MLB, **bookkeeping only** |
| `config` | *"Worker definitions, external credentials, system settings"* | ✅ `nba_config` |

**⚠ `context`'s short retention is flagged in T1 as a KNOWN MLB REGRET** — *"see lessons doc for **why
this bit them**."* **NBA avoided it by accident rather than design**: `nba_market.board_snapshots`
retains full history (6.6 GB, 327 dates) rather than current-only, and the archive schema was never
needed. **But the daily-context equivalent — injury-report snapshots, availability state — should be
checked for the same retention trap**, since that is precisely what `context` was for.

**Plus `nba_config`, which was NOT in the original list** — added in T8 for the tiering layer.

**The two most notable absences are `daily` and `context`**, because their stated purpose —
*"same-day context: lineups, confirmed starters/rotations, availability"* and *"historical snapshots
of daily-context"* — **is exactly the enrichment layer's data.** That data exists today
(`availability_delta`, the injury-report captures, `board_snapshots`) but is **distributed across
`nba_score` and `nba_market` rather than in its own domain schema.**

**Worth confirming** that nothing ported from MLB expects `nba_daily`, `nba_context` or `nba_archive`
to exist — the MLB system has `daily`, `context` and `archive`, so any query written by analogy would
fail.

### 💰 UNVERIFIED SPEND · BallDontLie GOAT tier — $39.99/month, possibly unused
T1 records a **paid, verified BallDontLie integration**:
> *"Fully operational with **paid GOAT tier ($39.99/month)**. Rate limit **600 requests/min** (10× the
> free tier). `/stats` → 200 OK (**CRITICAL — paid tier only**). API key confirmed active.
> Timeout raised **10s → 30s**. **API is SLOW (10–30 s per request) but functional; CACHING CRITICAL
> for production.**"*

**Nothing in any later transcript uses it.** The build took **stats.nba.com** as its primary source
from T1 onward, and T9's historical-prop research records *"balldontlie: **no history**"* as the reason
it was ruled out for board data.

**Not referenced in P1, P2 or P3.** No scraper in `nba/` is recorded as calling it.

**To check**: whether the subscription is still being billed, and whether anything at all consumes it.
**If unused, it is a recurring cost with no consumer.**
*(Documentation only — no action taken, per the standing rule.)*

### ⚠ THE FACTOR GATE — neither branch of the multiple-comparisons rule has been applied
Lesson #7 (T1) requires the significance bar to match how the test was run:
| Situation | Correct bar |
|---|---|
| **Scanning many cells for the best result** | **corrected** (Bonferroni or equivalent), scaled to the number searched |
| **A single, PRE-REGISTERED confirmatory test** | **UNCORRECTED** — *"using a scan-level bar on a single confirmatory test is ITSELF AN ERROR"* |

The source records both errors happening: under-correction on scans, and one case where *"a
40-cell-scan-corrected bar was wrongly used on what was actually a single pre-specified test, making a
real, borderline-positive result look **far more rejected than the evidence warranted**."*

**NBA state**: the factor gate scanned many **prop × band × side** cells across ten candidates.
**No multiple-comparisons correction is recorded, and no per-cell pre-registration is recorded.**
Neither branch has been applied.

**This compounds with the #8 gap above** — ten factors closed, without the confirmed-negative /
underpowered split, and without a correction scaled to the scan. **The rejections may well be right;
what is missing is the record that makes them defensible.**

**⚠ And the counterweight still applies (#9)**: do not now apply a stricter bar because the results
were negative. **Fix the method, not the threshold.**

### ⚠ TEN REJECTED FACTORS — "confirmed negative" vs "underpowered" is not recorded separately
Lesson #8 (T1): *"**'Insufficient data / underpowered' is a DISTINCT verdict from 'confirmed
negative' — don't collapse them.** A non-significant result with a wide confidence interval that still
contains a materially positive value is **NOT** the same as a confirmed-zero effect. **State the
actual POWER CALCULATION** — how many days would be needed to detect the effect size in question —
**and track genuinely underpowered candidates in their own list.**"*

**NBA state:** `nba_score.factor_gate_results` stores `n`, `log_loss`, `brier`, `gain_vs_anchor`,
`shrink_beta` per verdict — **the sample size is there**, but the ten closures are recorded as
rejections without the two-way split.

**Two of the ten have stated sample constraints:**
| Factor | Constraint recorded |
|---|---|
| **A2** | design specified confidence tiers on shared-absence games — **<5 / 5–14 / 15+**; a table built on <5 games is near-noise |
| **B4** | *"closed in three formulations, **0 of 5 props**"* — no power figure recorded |

**What is missing per #8**: a power calculation per closed factor, and a separate list for
underpowered candidates.
**Counterweight (#9)**: do not raise the bar for candidates that looked promising — **keep the bar
fixed and classify the outcome honestly.**

### ⚠ NO VALIDATION STEP BETWEEN GRADING AND THE CALIBRATION REFIT
T1's blueprint §4c specifies the grader's isolation as **a load-bearing safety property**:
> *"The grader **only ever reads** from historical board/game-log tables and **only ever writes to a
> dedicated outcome-history table** — **it never touches any table the live board-serving path
> reads.** **This means a bug in the grader CANNOT CORRUPT TODAY'S LIVE BOARD; its blast radius is
> limited to producing wrong or missing TRAINING data**, which **A SEPARATE DOWNSTREAM VALIDATION STEP
> CHECKS BEFORE ANY CALIBRATION CORRECTION IS EVER APPLIED.**"*

**NBA has the read/write isolation** — `grade_board_outcomes.py` reads snapshots and game logs, writes
`nba_market.board_outcomes`.

**⚠ But the blast radius is not contained, because the second clause is missing.** P2 runs
**grade (step 3) → … → calibration refit (step 14)** in one workflow, and the refit writes
`ladder_calibration_asof`, which **`build_final_hp.py` reads on the next run.**

**The path exists**: bad grades → bad `log_odds_shift` → bad `final_hp`.

**The ordering is correct and deliberate** (*"grading must run before the refit, or yesterday's
evidence is invisible to today's cells"*). **What is missing is the validation step between them** —
the thing that makes the grader's isolation actually load-bearing.

**Compounding factors already recorded**: the refit has **no magnitude sanity check** on the fitted
shift (T1 §4a: *"be willing to reject a fit even when statistically valid if the shift is implausibly
large"*), and **no over-flattening check**. **Three absent guards on the same path.**

### ⚠ PROP FORMULAS NOT FLAGGED AS VALIDATED-OR-NOT
> *"**Map every canonical prop to an explicit, direct expression against raw game-log columns**…
> **keep this map IN ONE PLACE, VERSIONED**, and **FLAG any prop whose scoring formula hasn't been
> independently validated against a confirmed, authoritative spec AS A KNOWN, EXPLICIT GAP** rather
> than silently trusting an assumed formula — **the exact mechanism that would have caught the
> fantasy-score formula bug much earlier.**"*

**NBA's map is in three places**: `prop_taxonomy` (the list), `norm_market()` (board key → prop), and
**`PROPS` in the recipe (prop → raw column, e.g. `"col": "PF"`)**. **The recipe's `PROPS` is the real
expression map for singles.**

**The validation was done for fantasy** — T9 verified the scale across all three apps — **but is
recorded in a transcript, not versioned beside the map.**

**Not flagged as validated-or-not**: `double_double` (sentinel −1.0, no ladder), `stocks`, and the
period props.

### ⚠ TWO DIAGNOSTIC SAFEGUARDS SPECIFIED FOR DAY ONE — neither built
T1's blueprint §4b names two **diagnostic-only (never automatically acting)** safeguards, *"since they
directly target the exact failure classes documented elsewhere in this package."*

**1. Coverage-gap check**
> *"surfaces any **(prop, side, high-confidence bucket)** combination showing **a real,
> resolved-outcome deviation past a threshold WITH ZERO ACTIVE CORRECTION COVERING IT** — **precisely
> the mechanism that would catch A SILENT FORMULA/CALIBRATION REGRESSION BEFORE IT RUNS FOR WEEKS
> UNDETECTED.**"*

**Both inputs exist**: `board_outcomes` (6.9M graded legs) and `factor_profile_cells` (35 fitted cells
against a **460-row** relevance matrix). **The 35-vs-460 gap is the exact surface this scans.**
**The stated purpose — catching a silent regression before weeks pass — is the failure an unattended
season-long pipeline is most exposed to.**

**2. Role/context-discontinuity check**
> *"**flags when a player's most recent real performance context differs sharply from their trailing
> sample** — a bench player suddenly starting, a return from a long injury layoff — **surfacing the
> risk that a baseline sample MIXES AN OLD, NO-LONGER-RELEVANT CONTEXT WITH THE CURRENT ONE.**"*

**⚠ NBA built the CORRECTIONS but not the FLAG.** Both named cases are already *acted on*: the
team-change discount and role-change detector handle *"a bench player suddenly starting"*; the return
ramp (A3) handles *"a return from a long injury layoff."*

**The specification is for a diagnostic, precisely because the correction may be wrong.** A silently
applied window reset on a misread context **produces a confident wrong number with nothing surfacing
it** — the same shape as tier misclassification being *"a quiet, indirect source of a wrong final
probability."*

### ⚠ UNCERTIFIED PROPS SHARE THE MAIN SYSTEM'S THRESHOLDS
T1's blueprint §4b prescribes a **separate, clearly-labelled calibration path** for thin-data props —
MLB has one for its *"expansion scope"* props with **a completely different prior-strength scale and
hard floor/ceiling caps the main system doesn't use**:
> *"**Design it as an EXPLICITLY SEPARATE, CLEARLY-LABELLED path FROM DAY ONE — don't let it SILENTLY
> SHARE THRESHOLDS with the main system, and DON'T ASSUME A FIX TO ONE TOUCHES THE OTHER.**"*

**NBA's uncertified props sit on the main path.** `fgm` and `fta` carry *"configs are the **closest
certified analogue** — NOT yet certified"* — i.e. **a certified prop's thresholds assigned by
analogy**, marked only by a code comment.

**Per-prop tuning exists** (`k_stab` measured per prop, `SHIFT_LAMBDA` per prop) — **but that is
parameter variation inside one system, not a separate path.** There is no distinct prior-strength
scale and no hard floor/ceiling caps for the thin props.

**The stated risk is the second clause**: *"don't assume a fix to one touches the other."* A fix
validated on points may or may not be right for `fta`, **and nothing marks the difference at
runtime.**

### ⚠ TIER MISCLASSIFICATION IS A SILENT WRONG-PROBABILITY SOURCE
> *"**Player/context classification tiers DETERMINE WHICH PRIOR A PLAYER GETS SHRUNK TOWARD — a
> misclassification here is a QUIET, INDIRECT SOURCE OF A WRONG FINAL PROBABILITY**, not just a
> display [issue]."*

**Exposure in NBA:**
- `role_tier` is derived from **`mu_role` = 20-game rolling mean, `min_periods=5`** — **5–19 games
  gives a tier from a thin window**
- **The team-change discount resets the window**: ≥5 competitive games with a new team → use only
  those. **A traded player is re-tiered on as few as 5 games**, and October is peak roster churn
- `role_tier is None` drops the leg (**visible**); **a wrong tier is silent**
- **T8's v9 doubled the stakes** — *"rate tiers ranked WITHIN role tier"* — so a misclassified role
  tier now selects the wrong prior on **both** dimensions

**No tier-stability or misclassification check is recorded.** A cheap one exists: **how often does a
player's `role_tier` change between consecutive slates**, and what is the distribution of `n_prior` at
the moment of tier assignment.

### ⚠⚠ NO "DON'T OVER-SHRINK A REAL SIGNAL" SAFETY VALVE
T1's blueprint §4b specifies one, with exact thresholds, and says to build it **from the start**:
> *"**Hierarchical Bayesian shrinkage needs an EXPLICIT 'don't over-shrink a real signal' safety
> valve**: once a player has **n ≥ 20 real observations** **AND** their raw rate **differs from the
> population prior by > 15 points**, **the prior is CAPPED at contributing NO MORE THAN 25% of the
> final estimate** — **preventing well-supported individual signal from being WASHED OUT just because
> it disagrees with the average.** **Build an equivalent into NBA's shrinkage design FROM THE START,
> NOT AS A LATER PATCH.**"*

**NBA has no such valve.** Its shrinkage machinery is **entirely protective in the other direction**:
| Mechanism | Direction |
|---|---|
| Empirical-Bayes prior strength (Efron-Morris) | decays with sample size — **shrinks less as n grows, but never caps the prior** |
| Per-prop `k_stab` (STL 125, TOV 60) | **shrinks MORE** for noisier props |
| `min_real_sample_threshold` on cells | *"cells under sample are **fully shrunk to prior**"* — **shrinks MORE when thin** |

**Every mechanism guards against trusting thin samples. None guards against distrusting thick ones.**

**⚠ And the symptom this valve prevents is already measured in NBA.** T8: *"the bias is **monotone in
the variation band**… **the quantile tier prior COMPRESSES THE EXTREMES**"*, with **rebounds ELITE
under-predicted in BOTH seasons** — a structural miss kept as a band cell.

**"The tier prior compresses the extremes" is precisely what the valve exists to stop.** NBA
corrected it **after the fact with per-band cells**; the blueprint prescribed preventing it
**structurally, from the start**.

**Worth evaluating**: whether adding the valve would remove the need for some band cells — and per the
T8 rule, a cell whose sign is consistent across seasons is *structural*, which is what an
over-compressed prior would produce.

### ⚠ RELIABILITY TIERS SHOULD BE A PURE FUNCTION OF SAMPLE COUNT
> *"**Keep sample-size reliability tiers PURELY a function of sample count, NOT a blend of other
> signals** — **MLB explicitly TRIED AND REVERTED** an attempt to make this 'smarter'; **the locked,
> simpler version was correct.**"*

**A tried-and-reverted experiment, recorded so it is not repeated.**
**To check in NBA's confidence model**: `c_exist`, `c_quality` and `f_prov` are reliability-adjacent.
Whether any blends a non-count signal is unverified. *(`f_role` is an empirical error measurement by
role band, not a reliability tier, so it is likely out of scope — but worth confirming.)*

### ⚠⚠ SHARED-EVENT PROP PAIRS — an explicit T1 check, never run
T1's blueprint §4b records a bug where **two props measuring the *literally identical underlying
event*** received **different shrinkage treatment**, and the inconsistency **grew from a 40%
violation rate to 97% by player tier before being caught.**

> *"**For NBA: CHECK EXPLICITLY for any pair of props/combo-stats that SHARE AN UNDERLYING EVENT AT A
> GIVEN THRESHOLD** — e.g. **a single-category prop crossing zero versus a COMBO PROP THAT NECESSARILY
> CROSSES ZERO AT THE SAME MOMENT** — **and make sure they receive IDENTICAL TREATMENT. Don't let two
> nominally-different props that are SECRETLY THE SAME EVENT drift apart.**"*

**NBA's 28-prop taxonomy contains this shape repeatedly:**
| Pair | Shared event at the threshold |
|---|---|
| `blocks` 0.5 / `stocks` 0.5 | with 0 steals, `stocks ≥ 1` **is** `blocks ≥ 1` |
| `steals` 0.5 / `stocks` 0.5 | the mirror |
| `points` 0.5 / `pts_reb`, `pts_ast`, `pra` 0.5 | co-trigger at the bottom rung |
| `rebounds` 0.5 / `reb_ast` 0.5 | same |
| `double_double` / its components | DD is **determined by** the component props |

**Partial protection exists:**
- ✅ Combos are **simulated from calibrated marginals** — *"joint structure, never a direct fit"* — so
  a combo inherits its components' treatment by construction
- ✅ `stocks` is explicitly recorded as *"inherits the blocks/steals floor"*

**Where it could still drift:**
- ⚠ Singles and combos are **separate certified files with separate constants**
- ⚠ `SHIFT_LAMBDA` is **per prop** (`blocks: 0.5`, `steals: 0.5`), while combos route through a
  different recipe entirely
- ⚠ `double_double` carries a **sentinel −1.0 and no ladder** — a third path

**The check is not recorded as having been run.** And its failure mode is **monotonicity**, which the
calibration-technique guidance independently names as disqualifying.

### ⚠ DUPLICATED CONSTANTS ACROSS THE TWO CERTIFIED RECIPES
T1's blueprint names this as a *"**real, costly duplication risk**"*: MLB **implemented the Wilson
sample-support clamp in TWO SEPARATE CODE LOCATIONS**, so any future threshold change had to be
applied to both.

**NBA has the same shape by design**: the **singles recipe** (`classification_ladder_v12.py`) and the
**combos recipe** (`combos_ladder_v1.py`) are separate certified files, **each carrying its own
constants** — already noted as *"a change must be applied to BOTH."*

**Constants that exist in more than one place:**
| Constant | Locations |
|---|---|
| Wilson clamp threshold (n=30) | singles recipe; combos recipe |
| `MAX_TIERS` = 24, `MIN_PER_TIER` = 15, `TIER_BLEND_K` = 5 | singles recipe; **`nba_config.role_tiers` / `classification_config`** |
| `LADDER_STEPS` / `LADDER_DEPTH` | singles recipe; **combos recipe has its OWN `LADDER_STEPS`** |
| `ROLE_TIERS` (6 bands) | singles recipe **and** `nba_config.role_tiers` — **verified to agree 2026-09-20** |
| Blowout margins (15 / 20) | singles recipe; `nba_config.classification_config.minutes_mixture` (`blowout_threshold_margin: 20`) |

**The config/code pairs are the safer half** — `role_tiers` was checked and agrees. **The
singles/combos pair is the riskier one**, since both are Python and neither reads the other.

**Already-recorded divergence of exactly this kind**: `minutes_mixture` in `classification_config`
specifies `dud_lognormal`, `tiered_inelastic` renormalisation and a **per-team** `E[min|blowout]` —
**none of which the recipe implements.** **The config and the code have already drifted apart once.**

### ⚠ THREE FACTOR AUDITS NAMED IN T1, NONE RUN
The blueprint lists five enrichment-factor bug patterns *"all real, all worth actively checking for in
NBA's own factors."* **Three are single queries against tables that already exist.**

**1. Cap-presence audit** *(pattern 2)*
> *"**one factor's lookup table left UNCAPPED while every sibling factor in the same system has
> explicit caps** — **the INCONSISTENCY ITSELF is the red flag; audit cap presence across the WHOLE
> factor registry AT ONCE, not factor-by-factor.**"*
**`nba_config.factor_profile_cells` has dedicated `cap` / `lift` / `penalty` / `coefficient`
columns.** One query: which cells carry a null `cap` where siblings do not.

**2. Contribution-discrimination audit** *(pattern 4)*
> *"**a factor showing the IDENTICAL contribution value across wildly different real cases** — an
> elite player and an average player getting **the exact same adjustment** — **a sign the factor is
> simply HITTING ITS OWN CAP for nearly everyone, not actually discriminating, even though the code
> 'runs' without error.**"*
**This is NOT caught by the `stddev(factor_value)` check** — the inputs differ, the contributions do
not. **`final_hp`'s `breakdown` stores per-factor contributions**, so the test is: distinct
contribution values per factor.

**3. Per-game vs cumulative audit** *(pattern 1)*
> *"**a cumulative/season-total stat used as if it were a per-game rate**, with no division by games
> played — **causing one factor to SWAMP EVERY OTHER FACTOR COMBINED.** **Tell: the source field name
> says 'TOTAL' while the consuming code treats it as 'PER GAME'.**"*
**`nba_stats.player_career_totals` is cumulative; `player_game_log` is per-game.**

### ⚠ RSS AGGREGATION — a named fix for a live multicollinearity, not implemented
*Pattern 3*:
> *"several factors all correlating with the same underlying signal — e.g. **a market-derived game
> total ALREADY PRICES IN park/weather/pace effects that separate factors also try to capture** — so
> **naively multiplying or summing them DOUBLE- AND TRIPLE-COUNTS the same real information.**
> **Fix: RSS (root-sum-squares) aggregation for a genuinely correlated factor cluster** — **zero
> dampening when only ONE factor in the cluster fires**, **increasing dampening as more correlated
> factors stack**. **Keep genuinely independent factors OUT of this treatment.**"*

**The example is live in NBA.** The matchup factor uses **market-implied totals** (`f_impl_own` /
`f_impl_opp` = `total/2 ∓ spread/2`), which on this description **already price in pace and opponent
strength** — the same information the pace coefficient (1.17) and opponent-defence coefficient (0.53)
also carry.

**`factor_registry` already stores MACRO-CLUSTERS** (T8), so the grouping RSS needs exists.
**No RSS aggregation is recorded anywhere.**

**Note the architecture solved the same problem differently elsewhere**: putting blowout, OT and foul
risk in the **minutes model** *"dissolves their correlation"*. **RSS is for clusters that cannot be
re-homed that way.**

### 🔍 CHEAP DIAGNOSTIC NEVER RUN · the enrichment-displacement calibration split
T1's blueprint §4a records an audit technique and its MLB result:
> *"**Split graded legs by HOW FAR THE ENRICHMENT LAYER MOVED THE FINAL PROBABILITY AWAY FROM THE
> BASELINE MODEL'S OWN NUMBER, then compare predicted-vs-actual SEPARATELY FOR EACH BUCKET.**"*
> MLB found **baseline-dominated legs nearly perfectly calibrated (~1 pt gap)** while
> **heavy-enrichment legs showed a 5+ POINT OVERCONFIDENCE GAP**.
> *"**This single check immediately LOCALIZES whether a calibration problem lives in the baseline model
> or the enrichment layer, WITHOUT DEBUGGING EVERY FACTOR INDIVIDUALLY FIRST.**"*

**NBA has every input and has never run it.** `nba_score.final_hp` stores **`baseline_hp` and
`final_hp` on the same row**, plus `cal_shift` — so the displacement is `final_hp − baseline_hp`,
already present. **One bucketed group-by against `board_outcomes`.**

**Why it is worth running here specifically:**
- The measured factor effect is **Brier +0.1–0.3%**, so **most legs sit in the baseline-dominated
  bucket** — but the diagnostic is about the **tail** of displacement, not the average.
- **The largest displacements the system produces are availability overrides**: `now_out` moves a leg
  by **0.2640 on average, max 0.9924**; `reallocated` by ~0.0131.
- **The reallocation sensitivity parameter (0.15 per tier) is ESTIMATED, not measured.**

**So the highest-displacement bucket is also the one with the least-validated parameter.** The
diagnostic would show whether that matters, without touching any individual factor.

### ⚠ VERIFY · is the NBA Platt calibration OVER-FLATTENING?
**The owner's experience with MLB's automated calibrator, from T1:**
> *"there is a **daily automated calibration engine** (runs **Platt scaling, beta**, and possibly other
> techniques) that **in their experience OFTEN OVER-FLATTENS / FLATTENS TOO MUCH**."*
> *"**prefers calibration to be done MANUALLY** rather than via the automated daily calibration."*

**NBA applies per-rung Platt automatically**, on a weekly refit, with no manual review step.

**Over-flattening destroys exactly what this system is built to price**: pulling everything toward the
base rate removes the tail discrimination that goblin/demon legs depend on — and the tails were
independently nominated as *"the #1 area where a sharp baseline earns the most."*

**NBA's design happens to carry four mitigations** (per-rung rather than one curve; variation band in
the key; upper-only ceiling; n≥1,000 gate) — **but none of them were chosen to answer this warning, and
none has been checked against it.**

**The diagnostic is cheap and the data already exists**: `nba_score.final_hp` retains **`p_raw`**
alongside `p_more`/`p_less`. **Compare the pre- and post-calibration distributions per rung** — if the
calibrated spread is systematically narrower at the outer rungs, it is over-flattening.

### ⚠ AS-OF CONTAMINATION — the recurring bug of this system, three instances
| Instance | Where |
|---|---|
| **`backtest.baseline_v6_asof` leaked each leg's own game-day** (`as_of_date = D` included day D) | **MLB**, relayed 2026-08-29 (T1) |
| **A season-wide mean using future games** — *"that was the entire FRINGE anomaly"* | NBA, T8 |
| **A pasted calibration table carried across days** — the parity violation | NBA, live session |

**It always presents the same way: INFLATED APPARENT SKILL.** The FRINGE multipliers *"shrank to honest
~1.0 values"* once removed.

**MLB's verification method transfers**: check a **non-push sample against game-log counts** — if the
as-of prediction for day D can only be right because day D is in it, the counts give it away.

**The fix workflow, also from T1**: *"research/debug/simulate fixes **at large sample sizes across all
individual niches** first; **only once solutions are very well developed**, test **on the backtest
tables**; **only if that testing behaves very well, move to live tables**."*

### KNOWN MISS (documented, reproducible) · P(0 blocks) under-predicted
From the harness header: *"**blocks more 70–75: −4.3, n=3900** = **P(0 blocks) under-predicted for
~1.5 bpg players, persists at any lambda**; blocks less 75–80: −2.6 thin; steals less 60–65: +3.6.
**Holdout 2024-25 shows the same signs.**"*
**Structural, not noise** — it persists at any lambda and reproduces out-of-sample. Recorded so it is
not rediscovered as a new bug.

### PATTERN WORTH KNOWING · three separate attempts at per-player granularity, all defeated by sample
1. **Player-own L0 calibration cells** — *"REJECTED ON DATA: n=40–80; **regression-noise dominated**;
   ELITE rebounds ±7.7. Off."*
2. **A2's with/without-teammate table** — retracted after five failed panels
3. **Conformal confidence** — dominated by aleatoric noise

**Per-player cells look attractive and fail for the same reason every time: 40–80 games is not enough
to fit anything.** The system's granularity lives in *tiers*, not players — by evidence, three times
over.

### IF A2 IS EVER REVISITED · check the sample-size gating first
A2 (teammate redistribution) was **retracted** after five failed panels — *"the certified anchor wins
every slice, and worst where the mechanism predicted it should win"* (COMPASS fact 91).

**But the T7 design specified confidence tiers the failed panels may not have honoured:**
> *"a precomputed with/without-teammate minutes table from DNP games, with **confidence tiers
> (<5 games → generic role-based redistribution; 5–14 → shrunk blend; 15+ → trust)** — the **'Wally
> Pipp' effect**."*

**A with/without table built on fewer than five shared-absence games is close to pure noise, and the
original design said so.** Whether the panels gated on sample size is not established in the
transcripts. **If A2 is reopened, that is the first thing to check** — a mechanism that fails worst
where it should work best is also the signature of an ungated noisy estimator.

### ⚠ GRADING RULE · **OT handling differs BY APP on period props**
> *"**PrizePicks/Underdog include OT in 2H/4Q; Sleeper's quarter markets EXCLUDE it.**"* (T7)

**⚠ QUANTIFIED IN T8, and the consequence is stronger than a grading rule:**
> *"PP/UD include OT, Sleeper doesn't — **DIFFERENT PRODUCTS, DIFFERENT MODELS**; **a 1-point spread
> carries ~7–8% OT probability**."*

**So this is not only a settlement difference — it is a MODELLING difference.** A Sleeper 2H line and a
PrizePicks 2H line on the same player are different bets, and on a tight spread the gap is worth
**7–8% of outcomes**. Rating them from one distribution misprices one of them.

**Two things to check:**
1. Does `grade_board_outcomes.py` apply a per-app OT rule? (6.9M legs, five apps, period props present)
2. Does `score_board_legs.py` price 2H/4Q identically regardless of app? **T8 says it should not.**

**And `P(OT)` — which the five-dimension architecture names as a minutes-model input — was never
built** (verified: no `p_ot`/`overtime` in `classification_ladder_v12.py`). **It is the term that would
make the two products distinguishable.**

**✅ PARTIAL RESOLUTION (T9): the STORAGE supports it.** `nba_score.baseline_ladder` has **`ot_rule`
as a first-class PRIMARY KEY column** (`DEFAULT 'include'`), alongside `period`. So the same
player × prop × period can hold an `include` row and an `exclude` row at once.

**✅ AND `P(OT)` WAS BUILT — in the PERIOD layer.** My earlier finding (no `p_ot` in
`classification_ladder_v12.py`) is correct for the **full-game** ladder only. T9:
> *"**OT as a mixture branch, not a mean bump** — a star either gets ~5 crunch minutes or none.
> **P(OT | spread) measured at 5.3% at pick'em falling to 1.9% at 15+.**"*

**So all three pieces exist**: the storage key, the measured probability, and the mixture treatment.
**What remains open:**
1. Is the **`exclude` variant actually built** for Sleeper's quarter markets, or only the default?
   (T9's own remaining list named *"the OT-exclude variant for Sleeper"* as outstanding.)
2. Does **`score_board_legs.py` select by app** — Sleeper → `exclude`, PP/UD → `include`?
3. Does **`grade_board_outcomes.py`** apply the same per-app rule when settling?

### ⚠ FANTASY-SCORE SCALE — **largely resolved, one third-party outlier remains**

**✅ T9's `prop_taxonomy` seeding verified the scale across ALL THREE APPS:**
> *"`prop_taxonomy` (28, **all 3 apps verified — fantasy scale IDENTICAL `1 / 1.2 / 1.5 / 3 / 3 / −1`**)"*

**So `+3` for blocks and steals is confirmed on PrizePicks, Underdog AND Sleeper**, and lesson #14's
requirement (*"verify each platform's own formula explicitly"*) **was satisfied** — the three were
checked separately and agreed.

**What remains is a single third-party outlier**, noted in T9:
> *"a third-party sheet lists PrizePicks blocks/steals at **+2** vs the **+3** I recorded from the
> official page."*

**Two primary-source verifications (T7's official page, T9's three-app check) against one secondary
sheet.** **The +3 stands**; the third-party sheet is most likely stale or describing a different
product.

**Why it was worth chasing at all**: T8.16g establishes that *"the **3× multiplier on blocks/steals**
reintroduces exactly MLB's home-run lumpiness — a single steal is a 3-point jump — producing a **fat
right tail** a direct fit would smooth away."* **At +2 that tail is materially thinner**, and
`fantasy_score` is simulated from components, so the multiplier propagates into every rung.

**Residual action**: re-read each app's live scoring page once the season board is up — **scales are
platform-level mechanics, and platform mechanics have a shelf life** (the same way demons went from
More-only to both sides in 2026-08).

### RE-CHECK · **Sleeper DOES have alternate lines** — milestone markets
The live session recorded *"Sleeper has no alternate lines (one line per player+stat, priced via
per-side multipliers)."*
**T7's verified 3-app inventory says otherwise**: Sleeper offers **Double-Double, Triple-Double, and
milestone/alternate lines (20+ / 25+ / 30+)** — described as *"**Sleeper's equivalent of Goblin/Demon
ladders**."*
**Both cannot be right.** Either Sleeper changed, or the later scrape only captured the standard
markets. **If milestone lines exist and are unscraped, that is unpriced board surface.**

### DEFERRED (Tier C, needs play-by-play) · first-basket, high-scorer, first-5-minutes
Underdog offers First FG/3PT make-or-miss, First to 10+ Points, Game/Team High Scorer, and First 5
Minutes stats. **All require play-by-play we do not have.** Correctly out of scope; recorded so the
board-coverage number is understood as *"of the props we can model"*, not *"of everything offered."*

### 🔧 CHEAP FIX, CONCRETE · **altitude and timezone are EMPTY — two factors have no input**
**Verified 2026-09-20**: `nba_ref.arenas` has **30 rows, 0 with `altitude_ft`, 0 with `timezone`**
(19 of 30 have `capacity`).

**⚠ AND THE LESSONS DOCUMENT NAMES THE CHECK THAT WOULD HAVE CAUGHT THIS (T1):**
> *"for any factor, **verify it actually has variance (`stddev(factor_value) > 0`) as a FIRST sanity
> check** — **this is cheap and MLB never did it proactively**."*

**An altitude factor built today would have `stddev = 0`.** The one-line check catches it before any
gate run, any cell fit, or any conclusion about whether altitude matters.

**Worth running across every factor column before the season**, not just these two — any column
created but never filled has the same signature.

**Two peer-reviewed factors cannot be computed at all:**
| Factor | Evidence | Needs | State |
|---|---|---|---|
| **Altitude** | *J. Sports Sciences* 2025, **p=0.005** — defensive performance varies with elevation, shot selection shifts toward 3PA, **4Q starter minutes and efficiency reduced** | `arenas.altitude_ft` | **empty** |
| **Eastward jet lag** | Peer-reviewed, 10 seasons (PMC) — west→east travel impairs performance, **effect ~DOUBLE the reverse direction** | `arenas.timezone` | **empty** |

**T8 flagged both as *"small data adds"* and they were never added.** The columns exist (created in
T1's first DDL); the values do not. `teamdetails` — the source that fills the rest of the arena row —
does not carry them, which is presumably why.

**This is 30 static values that never change.** Only **Denver (~1,610 m)** and **Utah (~1,290 m)** are
near the design's *"gated >1500 m"* threshold, so altitude is effectively a one-team factor plus a
borderline second. Time zones are public record.

**Note for jet lag**: the effect is **directional** — west→east is roughly twice the reverse — so a
symmetric travel-distance factor would wash it out. **D2 must carry direction, not just distance.**

**Design caution to preserve**: altitude was specified as *"continuous, gated >1500 m"* with the
warning *"small, physiological, **sparse data — don't overfit**."* With one clear team above the
threshold, that caution matters more than the effect size.

### GAP · **opponent defence has no SHORT-memory form** — the factor study asked for oneThe T7 prop-by-prop study's memory map puts opponent defence ratings firmly in the **short** column:
> **Short**: minutes, usage, FGA/3PA volume, **and opponent defence ratings (last 10–15 games, NOT
> season-long)**

**What exists:**
| Table | Window |
|---|---|
| `nba_team.defense_vs_position` | **season aggregate** (`games_sampled` per season) |
| `nba_ref.defender_ratings` | **weekly as-of** two-way ridge, reliability-shrunk |
| `nba_config.stat_decay_config` | **13 player stats — no opponent-defence entry at all** |

**Neither form is a 10–15 game rolling window**, and the decay table — which exists precisely to stop
one-size-fits-all memory — does not cover opponent defence.

**Why it matters**: a team's defence changes with injuries, trades and scheme adjustments on exactly
the timescale the study flagged. A season-long DvP figure in March is averaging over a roster that may
no longer exist. **This is the same "3PA volume vs 3P%" distinction** the decay table already
encodes for player stats, unapplied to team stats.

**Untested** — it may not move the number. But the study called for it explicitly and it was not built.

### ⚠ DESIGNED-BUT-UNVERIFIED · **the "dud" mixture, and the data built for it**

**⚠⚠ MAJOR CORRECTION 2026-09-20 (T8 re-pass): the mixture IS CONFIGURED. The CODE is what diverges.**

`nba_config.classification_config.minutes_mixture` holds the complete design:
```json
{"components": ["normal_truncated", "blowout_truncated", "dud_lognormal"],
 "normal_filter": {"max_margin": 15, "max_pf": 5, "min_pct_own_avg": 0.4},
 "dud_filter":    {"bottom_pct": 15, "or_pf_ge": 5},
 "blowout_threshold_margin": 20,
 "team_constraint": 240,
 "renormalization": "tiered_inelastic"}
```
*"Three-component minutes model; **f(spread) and E[min|blowout] fit on own data PER TEAM**"*

**`classification_ladder_v12.py` implements the `normal_filter` and nothing else:**
```python
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
```

| Configured | In the recipe? |
|---|---|
| `normal_truncated` + `normal_filter` | ✅ (as an exclusion) |
| `blowout_truncated` | ✅ via `MIN_RATIO` |
| **`dud_lognormal`** + `dud_filter` (bottom 15% **or PF ≥ 5**) | ❌ **absent** |
| **`renormalization: "tiered_inelastic"`** (240-minute constraint) | ❌ **absent** |
| **`E[min|blowout]` fit PER TEAM** | ❌ **absent** — `blowout_model` is league-wide |

**So three configured components are unimplemented in the full-game recipe**, and the config is the
authority on intent. **The period layer implements the mixture properly** (sit-out rate and "plays"
ratio per role × state), which proves the technique works on this data.

**Note `min_pct_own_avg: 0.4`** — the ≥40%-of-median floor that was the *suspected* cause of the FRINGE
anomaly before leakage turned out to be the real one. **It is a configured filter, not an accident.****The single most NBA-specific finding in the design research (T7):**
> *"**'Dud games' — a fat low tail MLB doesn't have.** Blowouts, foul trouble, early exits produce
> **5-minute, 2-point games**. **A distribution fit to all games is systematically OVER-OPTIMISTIC on
> 'more'.** This is the NBA analogue of MLB's **home-run bimodality** (which MLB fixed with a
> two-component mixture), and we have the exact data to detect duds: **minutes per game, score margin,
> and the DNP/DND comments from starter-status**. **Design: model P(dud) separately, then mix.**"*

**The bias has a DIRECTION — over-optimistic on `more`**, which is the side most legs are taken on.

**The three named inputs all exist:**
| Input | Status |
|---|---|
| Minutes per game | ✅ `player_game_log.min`, 79,358 rows |
| Score margin | ✅ and `blowout_model` is built on it |
| **DNP/DND comments** | ✅ **`player_game_starter_status.comment` — 4,319 coach's-decision + 1,074 injury rows** |

**This supersedes the T6 "underused asset" framing**: the DNP comments were not overlooked, they were
**designated for this purpose in the design**. **What is unverified is whether
`classification_ladder_v12.py` implements the dud mixture and reads them.**

**Why it matters if it was not built**: blowout benching is modelled (`blowout_model`), but that covers
only one of the three dud causes. **Foul trouble and early exits truncate minutes in COMPETITIVE
games**, which a margin-keyed model by construction cannot see. And a distribution fitted across all
games — including the duds — is biased on the `more` side for every prop.

**⚠ STRENGTHENED 2026-09-20 (T8 pass 3): `foul risk` is named in the ARCHITECTURE, not just the
minutes-model design.** The five-dimension factor table lists **"Blowout risk, P(OT), foul risk"**
together as ***"minutes-model inputs, not rate factors"***, with the rationale *"they act on
opportunity, not efficiency — **moving them there also dissolves their correlation**."*
**So foul risk was a first-class designed input at the architecture level**, and the implementation
treats `PF ≥ 6` games only as rows to exclude. **`P(OT)` appears to be similarly absent.**

**To verify**: does the ladder builder fit a mixture, or a single distribution over all games?

**⚠ PARTIALLY RESOLVED (T9): the mixture WAS built — but only in the PERIOD layer.**
T9 implemented *"the **three-part Q4/2H mixture** with everything fit on train: **state probabilities
(close / medium / blowout) from the derived spread**, and **per role tier and state a sit-out rate**
plus a 'plays' distribution."* → *"**the fourth quarter is solved**"*, and 1H certified at
*"holdout ladder 1.0, 0 of 19 bands."*

**So the mixture machinery exists and is certified — in the period props.** The full-game ladder still
uses the exclusion approach (`competitive & PF < 6`). **The period layer has an explicit sit-out rate
per role tier and state; the full-game layer does not.**

**That makes the gap narrower and more concrete**: the technique is proven in this codebase, on this
data, and the question is only whether to apply it to the full-game props too.

### ✅ RESOLVED 2026-09-20 — **duds are EXCLUDED, not MIXED. The design said mix.**
`classification_ladder_v12.py` line 222:
```python
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
```
**The minutes role (`mu_role`) is computed ONLY from competitive games with fewer than 6 personal
fouls** — so blowouts *and* foul-trouble games are **removed from the role estimate**. There is **no
`dud`, `mixture` or `p_dud` anywhere in the file** (grep: 0 matches).

**What this means, precisely:**
| Dud cause | Handled? |
|---|---|
| **Blowout benching** | ✅ — excluded from the role, then re-applied via `MIN_RATIO` per `role_tier` (the `blowout_model` ratios) |
| **Foul trouble (PF ≥ 6)** | ⚠ **excluded from the role, and never restored** — `P(foul trouble)` is not modelled |
| **Early exit / other** | ⚠ not modelled |

**The implementation cleans the input; the design asked to clean it AND add the tail back as a mixture
component.** So the projection effectively assumes the player plays his *clean-game* role every night.

**The direction of the residual bias is worth measuring rather than assuming.** Excluding foul-trouble
games raises `mu_role` (clean games have more minutes), which argues *toward* over-optimism on `more` —
the exact bias T7 named. But dispersion is fitted separately, and the empirical per-tier outcome tables
(where sample supports them) are built from *real* game results including duds, which would carry the
tail natively. **Whether the net effect is material is an empirical question the factor-gate harness
could answer in one run.**

**This is a genuine design-vs-implementation divergence**, not an oversight to panic about — the
exclusion is defensible and the blowout half is properly restored. But it is the one place where the
most NBA-specific insight in the whole design research was only half implemented.

### UNVERIFIED · does the minutes model include the "dud" component?The T7 design specified a **three-component mixture**: normal play (truncated Normal), blowout-reduced,
and a **"dud" (foul trouble / early exit) ~ log-Normal**, fit on *"competitive games in the player's
bottom 15% or 5+ PF"*, with `P(dud)` from the player's own history and PF rate.
**Blowout is implemented (`blowout_model`). Whether the dud component exists in
`classification_ladder_v12.py` is not established.** It is a distinct mechanism — early exit for fouls
truncates minutes in *competitive* games, which the blowout model by construction does not cover.

### NOT IMPLEMENTED (specified, MEASURED, justified — and still unbuilt) · **team-specific blowout benching**
The T7 blowout design called for a **team-specific `E[minutes | blowout]`**, on RotoGrinders' evidence
that *"coaches differ in how they empty benches."*

**⚠ T8 MEASURED IT AND CONFIRMED IT WAS WORTH HAVING:**
> *"**Team-specific starter pull: 0.81 (Orlando) to 1.10 (Dallas)** — **a 30% spread — the
> team-specific design is justified.**"*

**`nba_score.blowout_model` is still league-wide**, keyed on margin band + side only (7
`minutes_by_margin` rows). **A 30% spread between the most and least bench-emptying coaches is being
averaged away**, with 24,025 player-games available to fit a per-team term.

### CORRECTION · the blowout asymmetry is NOT what DataStreak claimed
DataStreak reported *"the favourite's starters hit hardest."* **On our own 79,138 player-games it did
not reproduce** — favoured starters **47.7%** over-rate, underdog starters **39.4%**.
> *"Won: **51.9% over-rate (NOT a penalty)**. Lost: **36.9% (a 12-point collapse)**. **The losing side
> is benched *and* played badly to get there.**"*

| | Won blowout | Lost blowout |
|---|---|---|
| Minutes ratio (`blowout_model.v1`) | **0.8748** — benched harder | 0.9124 |
| Over-rate | **51.9%** | **36.9%** |

**Both are real and point opposite ways.** A starter in a won blowout plays fewer minutes but was
productive in them. **The engine keys on minutes, so it captures the mechanism correctly** — but the
over-rate literature is backwards on our data.

### ⚠ B2B IS AN AVAILABILITY FACTOR, NOT A MINUTES FACTOR
Published ranges (veterans −1.5 to −3.0 min on zero rest) **did not reproduce**:
> *"Stars on zero rest: **~0 to −0.4 min *when they play***. **Bench and rotation GAIN +0.6 to +2.5.**
> The mechanism is **DNP-Rest: stars sit ENTIRELY**, so the star B2B effect is a **P(available) effect
> belonging in the P(start) model**, and the bench gains are the redistribution."*

**The published figure averages over a population containing zeros**; conditioning on *playing*
dissolves it. **Whether A4 is implemented as an availability term or a minutes term determines whether
it measures anything at all.** The quantifying data exists: `player_game_starter_status.comment`
carries **`DND - Rest`**.

### SUPERSEDED — the old team-specific entry
The T7 blowout design called for a **team-specific `E[minutes | blowout]`**, on RotoGrinders' evidence
that *"coaches differ in how they empty benches"* and the scale should be *"asymmetric and
**team-specific**."*

**`nba_score.blowout_model` has no team dimension** — it is keyed on **margin band + side only**
(7 `minutes_by_margin` rows, league-wide). **The asymmetry survived** (won-by-25+ 0.8748 vs lost-by-25+
0.9124 — the favourite's starters lose more minutes, matching DataStreak's *"hitting the favourite's
starters hardest"*). **The team-specific half did not.**

**Whether it matters is measurable**: a Spurs-vs-Warriors blowout may empty benches at different rates,
and with 24,025 player-games in the model there is sample for a per-team term. **Untested.**

### REJECTED CANDIDATE (with reason, so it is not re-proposed) · Draft Combine anthropometrics*"Real on-court results already encode a player's physical tools better than a years-old combine
measurement. Only rookies would benefit, and it's not worth the complexity here."*

### BUG-OPEN · **the weekly differential worker is NOT scheduled, and P1 does not call it**
Flagged honestly when built (T3): *"this worker **isn't wired to any automatic schedule yet** — it
needs a manual `run_job` trigger after each weekly scrape."* Owner: *"No, leave like this for now."*
**It was never wired since — and `nba-p1-weekly-static.yml` (built 2026-09-20) does not call it.**

**⚠ CORROBORATED by T7's audit, then CONFIRMED LIVE 2026-09-20**: T7 recorded the
`*_differential_log` tables as *"correctly empty — only one weekly baseline run has happened;
**detection starts on the second run**."*

**Checked today:**
```
player_differential_log    0 rows
team_differential_log      0 rows
official_differential_log  0 rows
player_roster_snapshot   582 rows   ← frozen since 2026-09-03
```

**The second run never came.** The snapshot is 17 days stale and the logs have never recorded an event.
**T7's "expected on first run" explanation was true then and is not true now.**

**Why this is worse than it looks with the season two weeks out**: September and early October are when
roster churn peaks — training-camp signings, two-way conversions, waivers, camp invites and final
cuts. **Every one of those is exactly what this worker detects, and none are being detected.**
When it is eventually run, it will emit one enormous catch-up batch rather than a usable history.

P1 runs: teams · arenas · players · bio · weekly season tables · team stats · on/off · play types ·
DARKO · shot quality · defender ratings · static context. **No differential worker.**

**Consequences, and they compound:**
1. **Trades, signings, departures, team renames and referee changes are not being detected at all.**
2. Because the worker diffs against **its own** snapshot tables, whenever it is next run it will report
   the **accumulated** difference since its last run — not a weekly delta. The event log will show one
   enormous batch rather than a history.
3. Its snapshot baseline is from **2026-09-03** and is now stale by the whole off-season.

**The fix is small**: add a step to `nba-p1-weekly-static.yml` calling the differential worker
**AFTER** the scrape+load steps (it must see the fresh data), and accept that the first run will emit a
large catch-up batch. **Not applied — documentation pass only.**

### TRAP · raw committed JSON ≠ Worker-transformed shape
The differential worker broke on `t.name` because the raw scrape file has **`city` + `nickname`
separately**; `name` is only assembled **inside the Worker's transform**. Any worker reading the
committed JSON sees the raw shape; any worker reading Postgres sees the transformed one.

---

## FROM T4 PASS 1 *(added 2026-09-20)*

### TRAP · `leaguedashplayershotlocations` returns `resultSets` as a **dict, not a list**
*"this endpoint returns `resultSets` as a single **dict**, not a list like **every other endpoint**.
My code assumed a list and did `dict[0]`, which raised `KeyError`."*
**It breaks the convention every other stats.nba.com endpoint follows.** Any new parser copied from a
working scraper will fail on it.

### BUG-FIXED · naive space-replacement mangles `+` in URL params
*"the `+` in **'6+ Feet'** needs proper URL encoding (`%2B`), but I just did a naive space replacement."*
**Use real URL encoding on stats.nba.com parameter values**, not string substitution.

### RESOLVED EMPIRICALLY · traded players in career totals — the `TEAM_ID = 0` row
The question could not be settled by search and was flagged rather than assumed, then **verified by
calling the endpoint**: *"traded players get **separate per-team rows PLUS a combined total row
(`TEAM_ID = 0`)**, and the games/points sum correctly across them."*
**Consequence: any naive `SUM()` over `playercareerstats` DOUBLE-COUNTS traded players.** Filter
`TEAM_ID = 0` for totals, or exclude it when summing per-team rows.

### CORRECTION TO GEMINI · advanced stats cost 2 calls, not 1,230
Gemini estimated *"1230 individual calls"* for per-game advanced stats. **Wrong** — the bulk
`playergamelogs`/`teamgamelogs` endpoints accept **`MeasureType=Advanced`**, so it was **2 bulk calls**
producing 26,651 + 2,460 rows matching the base logs exactly.
**The clearest instance in the transcripts of the "Gemini is not absolute truth" standard paying off.**
Worth remembering: **check whether a bulk endpoint already supports the parameter before accepting a
per-entity loop estimate.**

### VERIFY · **does the blowout factor DOUBLE-COUNT?** — ✅ **RESOLVED 2026-09-20: NO**
The T4 methodology's risks section warned: *"the baseline already reflects historical
blowout-shortened minutes — **don't penalize twice**."*

**Checked directly against `nba_score.blowout_model`. The design avoids it.** The `minutes_by_margin`
rows store **`v1` as a RATIO relative to the player's own baseline**, not an absolute penalty:

| Margin band | n | **v1 (ratio)** | v2 (min lost) |
|---|---|---|---|
| **competitive (−12 to +12)** | 12,966 | **1.0333** | −1.0140 |
| won by 12–20 | 3,001 | 0.9760 | 0.790 |
| won by 20–25 | 1,120 | 0.9194 | 2.586 |
| **won by 25+** | 1,597 | **0.8748** | 3.992 |
| lost by 12–20 | 2,672 | 0.9721 | 0.903 |
| lost by 25+ | 1,306 | 0.9124 | 2.856 |

**Why this is correct**: the ratios are measured against the **same blended historical average the
baseline uses** — competitive sits **above** 1.0 (1.0333) and every blowout band **below** it. So
applying a margin-weighted ratio **re-centres** the baseline onto the expected game script rather than
subtracting a penalty a second time. **A value above 1.0 for the most common case is the signature of a
deviation model, not a penalty model.**

**This also explains the T16 finding** that *"competitive games run 3.3% ABOVE baseline"* — it is
`v1 = 1.0333` read directly. **The warning written in T4 was heeded, thirteen transcripts later,
whether consciously or by good instinct.**

**`p_blowout` rows** store three values per spread band (`v1`, `v2`, `v3`) — the blow-open, blown-out
and presumably competitive probabilities, e.g. spread 0–2: 0.1634 / 0.0842 / 0.0792.

### VERIFY · baseline staleness on trades and season-ending injuries
Named as risk 3 in T4's methodology. A cached baseline is wrong the moment a player changes team.
**The weekly differential worker exists precisely to detect this — and it is not scheduled** (see the
open item above). **The two gaps compound**: trades are not detected, so stale baselines are not
flagged.

### RECORDED DECISION · GBDT / neural nets rejected, with conditions
A unified single-model approach was considered and rejected: *"needs **far more data and compute than
currently available**, and **sacrifices the explainability** the two-stage system gives you for free.
Not recommended here."*
**Not wrong in principle — wrong given current data volume, compute, and the explainability
requirement.** *(MLB's control plane has `gbdt_training_requests` and `gbdt_auto_trigger_switch`, so
MLB went this way; NBA deliberately did not.)*

### BUG-OPEN · **P3 uses a FIXED 1:15 PM PT — the design called for a DYNAMIC trigger**
The T4 cadence design is explicit:
> *"unlike the other two runs, **the master run's trigger time isn't a fixed clock time — NBA start
> times shift day to day** — so it needs to be **computed dynamically from `nba_calendar.games`
> (today's earliest real tip-off) minus 2 hours**."*

**`nba-p3-afternoon-light.yml` (built 2026-09-20) uses a fixed 1:15 PM PT.**

**Safe on a normal slate** (earliest tip ~4 PM PT) but **wrong on early-tip days**. The NBA regularly
schedules **noon and 1 PM Eastern** starts — Christmas, MLK Day, and most weekend national-TV windows.
**A 12:00 PM ET tip is 9:00 AM PT, over four hours BEFORE P3 would run.** On those days P3 would score
a slate whose games had already tipped.

**Note this interacts with the injury-report cutoff**: on an early-tip day the game-day report is also
filed earlier (8–10 am local for tips at 5 pm local or earlier), so an earlier run is *both necessary
and possible*.

**The fix, already specified by the original design**: trigger at
**min(1:15 PM PT, earliest_tip − 2h)**, computing the earliest tip from `nba_calendar.games` — the
schedule is already loaded (2,666 games). **Not applied — documentation pass only.**

### DESIGN DRIFT · the pre-flight check became a post-flight audit
**⚠ CORRECTED 2026-09-20 (T6 pass 5) — this entry was half wrong. There are TWO checks:**

| Check | Where | When |
|---|---|---|
| **Delta worker's completeness check** | inside the daily delta ingestion worker (T6) | **PRE-flight** — calendar Final count vs logged count |
| **`check_delta_gaps.py`** | P2 step 6 (live session) | **POST-mining audit** — dates, games, both teams, roster rate, freshness |

**The T4 design intent WAS honoured** — the pre-flight gate exists in the delta worker.
`check_delta_gaps.py` is an additional, broader audit layered on top, not a replacement.
**No drift. Entry retained only to record the correction.**

### PERMANENT CAVEAT (accepted, not a bug) · late NBA stat corrections
*"the NBA does issue rare stat corrections hours or days later (a rebound reattributed to a different
player). **Don't chase these** — treat each day's baseline as a consistent point-in-time snapshot."*

### PRINCIPLE · the baseline must NEVER live-query stats.nba.com
Three reasons given at design time: **speed**, **stability** (API outage during the run window), and
**reproducibility** — *"a live query run at 9am vs 10am could return different data if a correction
posted in between."* **This is the as-of principle applied to API reads, before it was applied to
dates.**

### ⚠ LEAKAGE TRAP (identified before mining, still live) · **WinsLosses splits**
> *"**correlational, not causal** — players play better in wins **partly BECAUSE good play caused the
> win**. Using it as a raw feature risks **real data leakage**. **Collect it, but don't naively feed it
> to a model.**"*

**The data was collected.** Anyone building a factor from the WinsLosses split must treat it as
outcome-conditioned. **Same class of error as A5** (box-score starters are post-tip truth) — which was
caught and closed. **Whether anything currently reads the WinsLosses split is unverified.**

### ⚠ SURVIVORSHIP BIAS in career aggregates · accepted, must be handled by consumers
`playercareerstats` *"only exists for players who **stayed in the league long enough to still be
queryable**. Any 'typical aging curve' built from it is a curve for **SUCCESSFUL NBA players** — the
players who **washed out after 2–3 seasons are invisible**."*
**Any consumer must treat it as conditioned on "currently-relevant NBA player", not a neutral
population.** Plus **era effects**: *"a 2004 stat line isn't directly comparable to 2024 without
normalising for pace and 3-point rate."*
**3,644 career-season rows are loaded. Whether any consumer applies these conditions is unverified.**

### BOUNDED HISTORY, on purpose · 3 seasons, not "as much as possible"
*"a player's own stats from several years ago, in a different role on a different team, **actively
HURTS a model**… Kevin Durant's 2016 Thunder numbers being actively misleading for predicting his
performance today."* **Locked at 2023-24 / 2024-25 / 2025-26.** This is why `BT_TRAIN` must be set
explicitly (COMPASS fact 66) — the bound is a modelling decision, not a storage one.

---

## FROM T5 PASS 1 *(added 2026-09-20)*

### ⚠ TRAP · **`boxscoretraditionalv2` returns HTTP 200 with ZERO rows on historical games**
The worst failure mode in the transcripts: **1,228 games "succeeded" and produced 799 rows** where
~30,000 were expected. *"HTTP 200 and **structurally correct responses, but zero player rows** for every
game except the very last one."*
**No error was raised. The meta file reported success.** The discrepancy was only caught by comparing
the row count against an expected magnitude (26 players/game).

**Fix: use `boxscoretraditionalv3`** — *"v3 works reliably for every single sample, including all the
games v2 silently failed on."* **v3 schema differs**: flat per-player fields (`personId`, `position`,
`comment`) nested under `boxScoreTraditional.homeTeam.players` / `awayTeam.players`.

**✅ VERIFIED CLEAN 2026-09-20**: `nba/scrape_nba_per_game_delta.py` — the script P2 calls daily — uses
**`boxscoretraditionalv3`** for starter status and **`boxscoresummaryv3`** for officials. **No v2
remains in the live path.** The lesson propagated correctly.

### BUG-FIXED · `nba_ref.players.position` existed in the schema and was never written
Two components had the same silent omission: **the scraper never extracted the field**, and **the
Postgres worker never wrote it**. The column sat empty for three sessions.
**And the first fix was also wrong** — `PlayerPosition` was assumed; the real source is the
**`playerindex`** bulk endpoint with a genuine `POSITION` field. Caught by checking the schema before
re-running, not after. **582/582 after the fix.**

### GEMINI WRONG (twice, in one exchange) · caught by the owner's instinct to double-check
1. *"starters are already inferable from the game logs via a `GS` column"* — **false**. `GS` exists only
   as a **season aggregate** in career totals; there is **no per-game starter flag** in
   `playergamelogs`. `START_POSITION` exists only on the expensive per-game endpoint.
2. *"Team Pace still needed"* — **false**. Already covered by the advanced-stats backfill.

**Both surfaced because the owner asked to "double check if no other information is needed" rather than
accepting a completeness claim.**

### ACCEPTED ERROR RATE (stated, not implicit) · splits backfill
**5 HTTP 500s out of 582 players** — diagnosed as *"likely players with zero games this season causing
a real data edge case on the source's end"*, and accepted as *"well under the 5% tolerance."*
**9,948 player-split rows across 577/582 players.** The 5 gaps persist.

### BLOCKED (resolved in T6) · a new worker could not be invoked
Three layers blocked it: the MCP tool's **target enum is fixed for the session**, **Control Room's job
dispatch is static**, and **no Postgres HTTP extension** exists to pull the data server-side.
The fallback — pasting ~3 MB of SQL in 17 chunks — was abandoned as *"burning turns on a mechanical
process."* **The data was verified and committed; only the load was blocked.**

### SCHEMA FLAW · **`player_splits` / `team_splits` PK omits `season` — only one season can exist**
`PRIMARY KEY (player_id, split_type, group_value)` — **`season` is a column but not part of the key.**
**Verified live 2026-09-20: `nba_stats.player_splits` holds only 2025-26** (9,948 rows, 577 players),
while the game logs cover **three** seasons.
**Whether two seasons were overwritten or never scraped, the schema cannot hold more than one.**
`nba_team.defense_vs_position` got this right — its PK includes `season` and it holds all three
(630 rows = 30 teams × 7 positions × 3 seasons). **Fix would require a PK change plus a re-scrape.**

### VERIFY · **`StartingPosition` split is absent** — the one rated ESSENTIAL
Present: `days_rest` (3,311) · `month` (3,236) · `location` (1,217) · `wins_losses` (1,135) ·
`pre_post_allstar` (1,049). **`StartingPosition` is not there.**
T4.13c rated it **Essential** — *"a direct proxy for role/usage — starter vs. bench is
night-and-day"* — while `month` was rated **Low** and is the second-largest table.

**Probably benign**: `nba_stats.player_game_starter_status` was built in the same session with
**32,179 rows at PER-GAME granularity**, which supersedes a season aggregate. **The capability is
covered.** Recorded so the absence is not later mistaken for missing role data.

**⚠ AND THE PK FLAW IS CONFIRMED AS A FLAW, not a design choice.** T6 explicitly verified that the
weekly-snapshot tables (shot quality, playtype, tracking, impact rating, on/off) are *"correctly
weekly-refresh snapshots **by original design**, not gaps."* **The splits tables are different — they
carry a `season` column**, so they were intended to hold multiple seasons and the PK omission defeats
that intent.

### STILL LIVE · the WinsLosses leakage surface is in the schema
`w`, `l`, `w_pct` columns exist on both splits tables and `wins_losses` holds 1,135 rows.
**The T4 caution — "collect it, but don't naively feed it to a model" — is not enforced by anything.**

### SCOPE DECISION (owner-approved, not a gap) · starter status = ONE season onlyPer-game starter/bench status costs **~3,690 calls across 3 seasons**. It was flagged rather than run,
and the owner approved starting with **the most recent season only (1,230 calls)**.
**✅ Verified live 2026-09-20: 32,179 rows · 1,230 games · 12,300 starters · 591 players — 2025-26
only.**

**The consequence to keep in view**: game logs span **three** seasons; per-game starter status spans
**one**. Any model trained across all three has this feature for a third of its data.
Gemini rated it *"foundational, non-negotiable — a player's role is **the single biggest driver of
opportunity**, and it can **shift game-to-game in ways season averages miss entirely**."*
**Extending it to 2023-24 and 2024-25 costs ~2,460 more calls.**

**✅ MITIGATION STATED IN T7 — this is less severe than it looks.** The data-universe research
explicitly rated backfilling the other two seasons as **"Defer"**, because it is
***"90% proxied by MIN + Usage once we have it"*** — and `nba_stats.player_game_log_usage` was then
built for all three seasons. **Usage share is a continuous role measure that subsumes most of what the
binary starter flag carries.**
**Caveat: this holds only if the baseline actually uses Usage as the role input.** If role is derived
from the starter flag alone, the asymmetry is real.

### COVERAGE ASYMMETRY SUMMARY *(added 2026-09-20)*What actually spans three seasons versus one:
| Dataset | Seasons |
|---|---|
| Player game logs (base + advanced) | **3** — 79,358 rows |
| Team game logs | **3** — 7,380 rows |
| `defense_vs_position` | **3** — 630 rows |
| **Player/team splits** | **1** — PK cannot hold more |
| **Per-game starter status** | **1** — owner-approved scope |
| Career totals | all-time, 3,644 rows |

---

## FROM T6 PASS 1 *(added 2026-09-20)*

### BUG-FIXED · **`if rows is not None` passes an EMPTY list**
The officials backfill reported *"1,230/1,230 succeeded, zero errors"* but produced data for only
**1,227 games**. The cause:
> *"When a game returns zero officials, the code returns `([], "error_string")`, but my main loop checks
> **`if rows is not None`** (true for an empty list) instead of checking the error."*

**`[] is not None` is `True`.** Same class as `float(NaN or 0) = NaN` in the live session:
**Python truthiness makes "empty but valid" and "present" indistinguishable.**
**Check the error, not the container.**

### CAVEAT · `boxscoresummaryv2` is documented as unreliable after 2025-04-10
The same failure pattern as `boxscoretraditionalv2`. **`boxscoresummaryv3` verified on 5 samples, old
and new games alike, before committing.** The live delta scraper uses v3 — verified.

### ACCEPTED GAP · 3 games have no officials on NBA.com's side
**All three are 2025-11-19.** The API returns an empty officials array; re-running does not help.
**3 of 1,230 = 0.24%**, accepted. Recorded so the gap is not re-investigated as a bug.

### BUG-FIXED · lineup PK omitted `team_id`
*"the same `group_id` can **legitimately appear for two different teams within a season** (e.g. traded
players who happened to pair up elsewhere too)."*
**Caught because the load failed loudly.** Contrast the splits PK, which omitted `season` and
**silently overwrote** instead — the same class of flaw with opposite visibility.
**This is the argument for tight constraints: a PK that fails is better than one that overwrites.**

### BUG-FIXED (three attempts) · the delta completeness check
1. **Naive count** → 170-game gap (preseason, playoffs, All-Star, Cup knockout — correctly out of scope)
2. **Blank-label filter** → *"too aggressive — excludes legitimate regular-season games with special
   branding (NBA Cup group stage, Rivals Week, international games)"*
3. **✅ `GAME_ID` prefix `002`** — *"a well-known, precise convention for game type"*, verified before
   use: **`002` = 1,230 games, exactly the known regular-season count.**

**This is the origin of the `002` convention in `check_delta_gaps.py`.** Any future game-type filter
should use the prefix, never the free-text label.

### CAVEAT (resolved) · the MCP enum refreshes BETWEEN turns
T1 concluded a new binding is unusable for the whole session. **T6 disproves that**: after 2 of 33
manual chunks, a re-check found the enum had refreshed and the Worker loaded the rest in **25 seconds**.
**Re-check a blocked binding before committing to an expensive workaround.**

### CLOSED · no Postgres-side HTTP path exists
`dblink` connects only to other Postgres databases; **`http` and `plpython3u` are not available.**
Large loads must go through a Worker or chunked SQL. **Checked exhaustively, so it need not be
re-checked.**

### ⚠ DATA QUALITY · `comment` field has TWO formats
`nba_stats.player_game_starter_status.comment` mostly uses `"DNP - League Suspension"` (hyphen-space)
but **11 rows use `"DND_LEAGUE_SUSPENSION"`** (underscores). **Any `LIKE '% - %'` filter or naive
prefix parse silently misses them.** Verified live 2026-09-20.

### UNDERUSED ASSET · 5,500+ historical absence reasons already in Postgres
The starter-status backfill captured DNP/DND reasons as a byproduct — **no extra scraping needed**:
| `comment` | n |
|---|---|
| **DNP - Coach's Decision** | **4,319** |
| DND - Injury/Illness | 975 |
| DNP - Injury/Illness | 99 |
| NWT - Not With Team | 29 |
| DND - Rest | 27 |
| + suspension, personal, NWT-injury | ~70 |

**The dominant category is healthy scratches (4,319 coach's decisions), dwarfing injuries 4:1** — and
it is **the purest available signal for role volatility**. For a fringe player, a coach's-decision DNP
is precisely the event `f_role` prices (fringe players miss by 0.0283 vs iron-men at 0.0008).
**Whether anything consumes this field is unverified.** It covers 2025-26 only, matching the
starter-status scope.

### OVERRULED LATER (correctly) · "historical injury-PDF backfill is a scope mistake"
T6's research concluded: *"It doesn't belong in the baseline (which is explicitly designed to be
injury-agnostic) — it's training data for a future enrichment refinement, not urgent."*
**T10 built it anyway, and it became load-bearing** — the day-before report feeds P2's baseline build,
N1 is fitted on it, and the parity rule depends on it.
**The framing was right about the BASELINE and wrong about the BACKFILL's urgency**: you cannot
backtest an availability-aware pipeline without historical availability.

---

## FROM THE LIVE SESSION 2026-09-19/20 (not yet a transcript file)
*added 2026-09-20 — these are current and unfixed unless marked*

### BUG-OPEN · PrizePicks is NOT wired for NBA in the live pipeline
`main.py` at the repo root is the **MLB** producer: `league_id=2` is a literal in all four candidate
URLs and `OUTPUT_JSON` is fixed to `prizepicks_mlb_current.json`. It honours a
`PRIZEPICKS_PROJECTIONS_URLS` override, so it CAN be pointed at NBA — but it would then write the NBA
board into the MLB file and the next MLB run would overwrite it.
**Mitigation built 2026-09-20:** `nba/scrape_prizepicks_nba_board.py`, a separate producer with its own
URLs (`league_id=7`), its own output (`boards/prizepicks_nba_current.json`) and its own env namespace
(`PP_NBA_*`). **Live-tested: 192 projections, 104 demons / 52 goblins / 36 standard.**
Still open: `main.py` itself is untouched, and COMPASS fact 176 still describes the old plan.

### PARTIAL · `board_tiers` is a TWO-way taxonomy; the board is now FOUR-way
`nba_market.board_tiers` (2.2M legs) derives `kind` from the Odds API **price** (`price=100` → demon,
`price=-137` → goblin). Every row is **Over-only**, which was correct while demons/goblins were
more-only (confirmed: zero Under rows on alternates in 2024-25, and the official help centre said so
through 2025-08).
**PrizePicks enabled LESS in 2026-08** (MLB + WNBA first; owner screenshots confirm it live on WNBA).
Under the four-way rule a **demon-Less sits BELOW the anchor**, which the price-based label would call
a goblin. **The rule, already worked out in T13:** below the anchor, More = goblin / Less = demon;
above it, More = demon / Less = goblin — a function of (position vs anchor, side), never the emoji.
**`nba_market.board_tiers_ud` (Underdog) ALREADY implements this** — see T13. The PrizePicks version
does not. `nba/build_board_tiers_v2.py` was written 2026-09-20 to close it; **not yet verified**.

### CAVEAT · tier sign convention breaks under the four-way rule
v1 signs tiers by KIND (goblin negative, demon positive). That fails once a demon can sit below the
anchor. v2 signs by **position** (negative below, positive above) so the sign always means direction.

### DEFERRED · PrizePicks per-leg multipliers are not on any public surface
Ruled out exhaustively 2026-09-19: **zero hits** for `multiplier|payout|factor|coefficient` across
691,431 lines of the live board payload (a demon carries only `odds_type`, `adjusted_odds` as a
BOOLEAN, and `line_score`); ~20 guessed API paths all DataDome-403 even through the working proxy with
`curl_cffi` chrome124 and a US/California egress; `app.prizepicks.com` is itself DataDome-walled so its
bundles cannot be scanned the way the Underdog ladder was; and **eight independent commercial scrapers
expose the LABEL only** while the same vendors expose real multipliers for Underdog, Sleeper and Pick6.
The factor is priced **server-side at entry build** — which is exactly why the app shows nothing on one
leg and a multiplier on the second.
**The capture to do:** from a COMPUTER browser (free), log in, DevTools → Network → Fetch/XHR, add leg
1, CLEAR, add leg 2, then "Copy as cURL" — the method that solved the Underdog and Fliff APIs. iOS
cannot do it free (iOS 17+ blocks `javascript:` bookmarklets).
**Owner's correction to keep in view:** the factor is NOT one number per tier — it varies by rung,
side, prop, player form and team form, so slip-by-slip inference needs an enormous sample and is never
certain.

### DEFERRED · Sleeper ladder, Chalkboard
Sleeper has no alternate lines (one line per player+stat, priced via per-side multipliers).
Chalkboard is app-only with no web app and is in no aggregator we hold → phone-proxy capture only.

### DROPPED · data-freshness gate
At a single 1:15 PM PT cutoff every leg carries the same report generation, so a freshness term
penalises uniformly and discriminates nothing. The uncertainty it would proxy for is already priced by
N1 probability-weighted availability. Late tips do get more post-cutoff amendment, but those amendments
are unusable when slips are placed once at ~1:30.

### DROPPED · scenario precompute as a daily job
Its value was "enumerate every availability branch now, SELECT the realised one at a later window".
With ONE window there is nothing to select with, so enumeration is pure cost (~0.5–1M rows/day).
`nba_score.scenario_realised` and its calibration stay as a MEASUREMENT (the finding that the
most-likely branch is right only ~17% of the time with three uncertain players remains true) but it no
longer runs daily.

### BUG-FIXED · the 2:30 PM PT cutoff was drift, traced to its origin
The 2026-09-09 session recorded a list of OBSERVED injury-PDF snapshot timestamps
(12:30 / 1:00 / **2:30** / 3:30 / 4:00 / 6:45 / 7:45 PM) — **Eastern**, from the PDF filenames —
alongside the correct policy on the same line ("game-day 11am–1pm local"). **2:30 PM ET is 11:30 AM
PT.** It was promoted to "the 2:30 PM PT day-of report" and repeated as established in COMPASS facts
41, 68, 73, 74 and 96. `nba_asof.py` shows the true source: `PHASE2_CUTOFF_LOCAL = "17:45"  # 2:45 PM
PT (after the 5:30 PM ET day-of report)` — a league **bulletin**, not a filing deadline.
**Corrected: the real constraint is 11am–1pm LOCAL to each game's market, so Pacific clubs file last at
1:00 PM PT → cutoff 1:15 PM PT.** `nba_asof.py` already had `PHASE1_CUTOFF_LOCAL = "16:00"` = 1:00 PM PT.

### CAVEAT · the injury backfill is HOURLY, not 15-minute
48 snapshots per game-date (real archived PDFs, Eastern timestamps). The league publishes every 15
minutes. Any cutoff analysis finer than ±1 hour needs the 15-minute archive. The season also crosses
DST.

### BUG-FIXED · `float(x or 0)` returns NaN — NaN is truthy
In `build_availability_delta.py`, one player with NaN minutes poisoned `wsum` → `share` → `gain` →
every downstream probability, writing **6,748 NaN overrides** that would have gone straight into the
scorer. A NaN hit probability is worse than a missing one because it looks like data. Fixed with an
explicit `v != v` check plus a hard guard that drops any NaN before write and reports the count.

### BUG-FIXED · market_key → prop mapping would have dropped 44% of the board
`replace(market_key,'player_','')` yields `points_rebounds_assists`, which matches nothing in our
baseline (we call it `pra`). Six of the largest groups — pra, pts_reb, pts_ast, reb_ast, stocks,
threes_made — **23,286 legs, 44% of the board** — would have scored nothing, silently. Same magnitude
as the historical combos gap. Fixed with an explicit verified mapping table.

### BUG-FIXED · a caught exception left a poisoned transaction
`try/except` around a read of a not-yet-existing table swallowed the error but left psycopg in a failed
transaction, so every later query died with `InFailedSqlTransaction` and the traceback pointed at an
innocent query 60 lines away. **`conn.rollback()` in the except is mandatory.**

### BUG-FIXED · loader reads over HTTP, not from local disk
`load_baseline_ladder.py` fetches the ladder artefact from `raw.githubusercontent` — so a ladder built
in the runner but **not committed** is invisible to it and the load 404s. Both P2 and P3 needed an
explicit commit step between merge and load.

### BUG-FIXED · the per-pair build needs a merge step
The builder writes `nba_baseline_ladder_<asof>_<pair>.json` per invocation; the loader reads
`nba_baseline_ladder_<asof>.json`. Without a merge the loader finds nothing. The loader also has its
own guard — *"ABORT: artifact has no combo props"* — so combos must exist BEFORE the merge.

### BUG-FIXED · five wrong env var names in the new pipelines
`ASOF`→`BT_ASOF`; `BT_MODE=combos`→ separate scripts `build_combos_ladder.py`/`build_periods_ladder.py`;
`BT_WINDOW`→`BT_CUTOFF=phase1`; `IR_MODE`→`INJURY_MODE`; `SPORT`→`SLEEPER_SPORTS`.
Also: `SLEEPER_OUT_DIR` defaults to `.` (repo ROOT) where the file is never committed and the archiver
never sees it; `ARCHIVE_LABEL` defaults to `routine`, so the decision snapshot must set `window`
explicitly or the grader and every backtest lose the decision moment.

### CAVEAT · `final_hp` stays denormalised — deliberate, tested
The columns it shares with `baseline_history` look like ~25 GB of duplication. Two claims against
slimming were tested and ONE WAS WRONG: "the join duplicates rows" is **false** (verified 140,130 in →
140,130 out, exactly 1:1; a planner ESTIMATE was misread as an actual), and "32.9 s per day" was
**cold cache** (`read=50707`; warm it is `shared hit=28514 read=1`). **The real reason to keep it** is
that slip-strategy work means days of backtesting across many dates at once — the cold-cache case —
where joining forces repeated `baseline_history` reads on a **2 GB RAM** server. Revisit only if the
server is upgraded AND the workload stops being backtest-heavy.

### CAVEAT · `VACUUM FULL` cannot run on `final_hp`
It needs free disk equal to the table size (13 GB) and the disk pressure that makes it necessary is
what prevents it. Plain `VACUUM` is the safe alternative; it reclaimed ~4 GB and cleared dead tuples to
zero on 2026-09-19.

### CAVEAT · a 0-scan index may still be load-bearing
`board_outcomes_leg_uidx` shows **0 scans but is UNIQUE** — it enforces no-duplicate-legs. Scan count
is the wrong test for a unique index. Only `board_outcomes_nm_idx` (343 MB, 0 scans, superseded by the
temp-table approach) was genuinely droppable, and was dropped.

### PARTIAL · P3's reallocation path verified on ONE date only
The whole chain was proven on **2025-11-29** (Klay Thompson flips to OUT after P2 builds → 3,446
teammate overrides at ~1.3 pp each → his own 828 legs zeroed → board scored → his Overs 0.0122 /
Unders 0.9834). A season scan found only **4 dates** where a ladder-carrying player flipped to OUT
after P2, so the branch is genuinely rare. On 2026-01-15 it correctly wrote nothing: all 20
"newly OUT" players had no ladder rows because they were already known out overnight.

### PARTIAL · ladder depth is too shallow for the books, too deep for low-count props
Measured on a real slate (2026-01-15, 60k+ board legs joined to our anchors): books ladder out to
roughly **85–90% of the anchor**, consistently. Fixed `±10` is wrong in both directions — points needs
13 and gets 10 (1,294 rungs interpolated); steals/blocks/stocks/turnovers need 1–2 and get 10 (zero
interpolated). Per-prop `LADDER_DEPTH` table added to `classification_ladder_v12.py`;
**the scoped expansion has not completed.**

### CAVEAT · `fantasy_score` has never appeared in the NBA board archive
A scan of both seasons found `player_fantasy_points` on exactly one date (2026-09-12), and that same
snapshot carries `player_first_inning_runs` — **it is MLB data**. Fantasy score and the period props
reach us only through the DFS scrapers, which is what the live pipeline reads. Mapped in
`score_board_legs.py` so they score correctly the moment they arrive.

### DEFERRED (owner-sequenced) · leg correlation, live plumbing
Leg correlation is slip-building-stage work and will be treated there, not in this pipeline.
Live plumbing is LAST — nothing is live until the NBA season opens in October.
</content>
</parameter>
<parameter name="message">docs: NBA open items - deferred, dropped, partial, bugs, caveats