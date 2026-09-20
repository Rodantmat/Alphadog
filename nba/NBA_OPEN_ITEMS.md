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
**Every one is exactly what this worker detects.** Detail below under "FROM T3".

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

### ⚠ `P(OT)` AND `foul risk` — named in the architecture, never built
The five-dimension design lists *"Blowout risk, **P(OT)**, **foul risk**"* together as minutes-model
inputs, *"they act on opportunity, not efficiency."*
**Only blowout risk exists.** Grep of `classification_ladder_v12.py` for `p_ot|overtime|OT\b` returns
nothing, and foul trouble appears only as an exclusion filter (`PF < 6`).
**Two of the three named minutes inputs are absent.**

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

### ⚠ FANTASY-SCORE SCALE — an unresolved source conflict, flagged for season start
T7 resolved the PrizePicks fantasy scale to **`1 / 1.2 / 1.5 / 3 / 3 / −1`** *"from PrizePicks' official
page after a conflicting third-party source."*
**T9 found the conflict again and left it open:**
> *"One discrepancy to re-verify at season start: **a third-party sheet lists PrizePicks blocks/steals
> at +2 vs the +3 I recorded from the official page**."*

**This is not cosmetic.** T8.16g establishes that *"the **3× multiplier on blocks/steals** reintroduces
exactly MLB's home-run lumpiness — **a single steal is a 3-point jump** — producing a **fat right
tail** a direct fit would smooth away."*
**At +2 instead of +3, that tail is materially thinner**, and `fantasy_score` is simulated from
components, so the multiplier propagates into every rung.

**Resolve by reading PrizePicks' live scoring page once the season board is up** — and note the scale
may differ by app (Underdog and Sleeper have their own).

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

### ⚠ DESIGNED-BUT-UNVERIFIED · **the "dud" mixture, and the data built for it****The single most NBA-specific finding in the design research (T7):**
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