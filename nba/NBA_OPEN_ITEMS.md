# NBA OPEN ITEMS — deferred, dropped, partial, bugs, caveats

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

### REJECTED CANDIDATE (with reason, so it is not re-proposed) · Draft Combine anthropometrics
*"Real on-court results already encode a player's physical tools better than a years-old combine
measurement. Only rookies would benefit, and it's not worth the complexity here."*

### BUG-OPEN · **the weekly differential worker is NOT scheduled, and P1 does not call it**
Flagged honestly when built (T3): *"this worker **isn't wired to any automatic schedule yet** — it
needs a manual `run_job` trigger after each weekly scrape."* Owner: *"No, leave like this for now."*
**It was never wired since — and `nba-p1-weekly-static.yml` (built 2026-09-20) does not call it.**

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