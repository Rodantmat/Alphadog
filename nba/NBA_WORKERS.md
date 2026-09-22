# NBA WORKERS — every worker, scraper and script

**Purpose.** What each piece of code is, where it lives, what it does, what it needs, and what it
writes. Grouped by role.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Cloudflare workers and static scrapers from T1–T2; engine/board/pipeline scripts from the live session and the journal. |

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

**39 workflows exist; 33 are `nba-`-prefixed; seven scheduled ones touch `nba/`:**

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

### 🔴 THE BRIDGE FAILED THREE TIMES IN-SESSION — *the executed evidence for a claim the sweep already carries*

| seg | what came back |
|---|---|
| **81**, **83**, **328**, **330**, **332** | `{"error": "error occurred during tool execution", "request_id": …}` — **five** aggregate queries against `nba_score.final_hp` |
| **150** | ***"tool 'mcp_alphadog_bridge_run_sql_postgres' is not available in this turn, nor is any other 'mcp_alphadog_bridge_' tool."*** — a hard tool outage, not a query error |

🔑 **This is the executed evidence behind the author's prose claim — recorded by this sweep at T17 as
the reason an incomplete replication pass went unverified — that *"the SQL bridge is timing out on the
large aggregates."*** ⚠ **Language at evidence strength**: the results show **failures**, and one of
them is an availability outage rather than a timeout. **The transcript does not print a timeout
message**, so *"timing out"* remains the author's characterisation, not a verified diagnosis. **What
IS verified: five aggregate queries against `final_hp` failed, and the whole bridge was unavailable
for one turn.**