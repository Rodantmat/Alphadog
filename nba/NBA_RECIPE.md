# NBA RECIPE — how the system was built, step by step

**Purpose.** The cake recipe. Every step in the order it happened, so the build could be reproduced or
audited. Where a step exists because an earlier attempt failed, the failure is part of the recipe —
that is the useful part.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Steps 0–7 from T1 (6 passes) and T2 (1 pass). Later steps outlined from the journal, pending their own transcript passes. |

---

## STEP 0 — The founding constraints *(T1)*
Before any code:
1. **This is an EXPANSION**, joining a live, Postgres-native MLB system. Not a migration, not a
   from-scratch build.
2. **No MLB edits, ever. Everything additive.**
3. **Fully separate universe** — own schemas, own control plane, own folder, own workers.
   *(This overruled an initial proposal to share the job queue.)*
4. **Every tunable lives in the database**, never hardcoded. ⚠ **STATED IN FULL, and NOT HOLDING —
   see STEP 0d below.** The owner's words were: *"any future variable numbers must reside on the
   database, not hard coded — any equation variables like, **bonus, penalties, caps**, or **system
   variables like, timeouts, retries, chunk size** — **so all these are easily changed by SQL command
   instead of coding and deploys.**"*
5. **Research is mandatory** — deep online research, plus Gemini for complicated decisions, treated as
   reference and verified independently.
6. **Every session logs to `nba/NBA_PROJECT_LOG.md`.**

**The owner's three-run model**, which is the ancestor of today's P1/P2/P3:
- **Run 1 — static differential**: calendar, teams, players, rosters, arenas, referees.
- **Run 2 — delta daily**: game logs + incremental mining, **and the baseline — "the heart of the
  system"** — a multi-layer logic classifier (player × prop-line × variation × direction, each with its
  own thresholds/caps/bonuses/penalties) producing **hit probability % and confidence**.
- **Run 3 — master run, 4 stages**: Board → Daily Context (each factor with a fallback so it is never
  empty) → Market/Odds → Scoring Engine.
- **Explicitly NO orchestrator.** Each run triggered manually, worker by worker, verifying each.
- **Locked dependency: the baseline must finish before Daily Context or Scoring touch it.**

---

## STEP 0a — Who the recipe is being cooked for *(T1)*
*Source: `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7. Recorded 2026-09-20 (T1 pass 31) — §7 was
undocumented. Stated as: **"apply this from the very first NBA interaction, not as something to
discover gradually."***

**This belongs in the recipe before the ingredients, because it changed what could be built at all:**
> *"**Owns and operates the entire system alone, working from a phone with no terminal access — the AI
> assistant is THE ONLY INTERFACE to the database, repository, and deploy pipeline.**"*

**That single sentence is why STEP 0b's ordering puts the bridge second and why STEP 4 exists at
all.** No terminal means no local scraper, no `wrangler deploy` by hand, no `psql`. Every
capability had to be reachable through a tool the assistant could call. Full architectural
consequences: `NBA_SYSTEM_ARCHITECTURE.md` §1a. Full operating model:
`NBA_MASTER_SUMMARY.md` §T1.61.

**Three cooking rules that come with it, and govern every step below:**
1. **No claims of success without evidence verified directly against live data.** *(The same standard
   blueprint §8 and §9 state from the engineering side — arrived at independently.)*
2. **When concluding something is impossible or unavailable, CHECK TWICE before reporting it.** From
   a real, confirmed case where *"an arbitrary threshold had been mistaken for a hard data limit"* —
   **the owner was right and the assistant was wrong.**
3. **"Run every check" means literally every check, including ones expected to pass** — *"not a subset
   chosen for efficiency."*

### The three non-goals, stated at the same time
Written before any code: **no per-prop worker architecture** (MLB left *"19 dead stub files behind as
evidence"*) · **no weather / quality-of-contact / RFI-analogue factors** (*"no basketball analogue…
wasted effort"*) · **no auto-scheduling orchestrator until the manual pipeline is verified end-to-end
against real data at least once.** All three honoured — see `NBA_SYSTEM_DESIGN.md` §0.75, where the
third is flagged as a **sequencing rule whose condition is now testable**.

---

## STEP 0b — The prioritized startup plan, as originally written *(T1)*
*Source: `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §5. Recorded 2026-09-20.*

> *"**Do these IN ORDER. Do NOT skip ahead to strategy research before the foundational layers exist
> and are verified with real data.**"*

| # | Step, as stated | What happened |
|---|---|---|
| **1** | **Confirm ParlayAPI coverage for NBA** — sport key `basketball_nba`; verify live `/props` for `prizepicks`, `underdog`, `sleeper`, **and separately test historical `/closing-odds` for each**. *"**Don't assume historical coverage exists just because a bookmaker is listed as active — test it directly**, the same way MLB found **Sleeper/Fliff have LIVE-ONLY coverage with ZERO historical depth**."* | ParlayAPI later **superseded** — own scrapers capture ~25% more rungs |
| **2** | **Set up the database schemas and the MCP admin-worker bridge BEFORE writing any other worker** — *"this is the **tool surface everything else depends on**"* | ✅ done first |
| **3** | **Build the PrizePicks NBA board scraper FIRST** — *"the **highest-confidence, most directly reusable** component, and gives you **real live board data to build everything else against immediately**"* | ⚠ **NOT done first** — built much later |
| **4** | **Build the base data layer** (schedule/calendar, player/team reference data…) | ✅ became T1–T6 |
| **6** | **Only once real board data + real outcome grading exist for a genuine multi-week window, begin the multiplier-observation study and the strategy research program** — *"using the full standard **from the very first candidate**"* | ⏸ correctly not started |
| **7** | **Build the manual/session-driven trigger pattern** | ✅ the `TRIGGER_*.txt` mechanism |

### ⚠ The one ordering deviation, and what it cost
**Step 3 said build the board scraper first, for real live data to build against.** The build ran
**2 → 4 → … → 3**, constructing the whole baseline and calibration layer against **historical game
logs** instead.

**Three recorded consequences, all of the same shape — decisions made without the board in hand:**
- The ladder was certified at **±6 rungs**; **`LADDER_DEPTH` later measured books laddering to 13–16**
  on the deep props (*"a single fixed depth is wrong in BOTH directions"*).
- **`norm_market()`** was written without the board; **44% of the board (23,286 legs) would have
  scored nothing, silently.**
- **Goblin/demon tiers beyond ±6 remain uncertified** — deferred deliberately by the owner as
  *"board dependent."*

**The deviation was not arbitrary** — the base layer had to exist before any projection — **but the
plan's stated reason for step 3 is precisely what those three items lacked.**

---

## STEP 0d — Three founding rules that were never written down, and one that is not holding *(T1)*
*Source: the owner's founding specification message, extracted in full 2026-09-20 (T1 pass 36).
Earlier passes swept the owner's messages in excerpt; these four clauses had no entry anywhere.*

### 1 · ⚠ THE TUNABLES RULE IS NOT HOLDING — **VERIFIED**
> *"**any future variable numbers must reside on the database, NOT HARD CODED** — any equation
> variables like **bonus, penalties, caps**, or **system variables like timeouts, retries, chunk
> size** — **so all these are EASILY CHANGED BY SQL COMMAND INSTEAD OF CODING AND DEPLOYS.**"*

**Grep of all 190 `.py`/`.js` files plus the MCP admin bridge**: `classification_config`,
`factor_registry`, `factor_relevance`, `factor_profile_cells`, `stat_decay_config`, `ewma_alpha`,
`system_settings`, `role_tiers` — **zero occurrences.** The only config table anything reads is
`external_credentials`. Timeouts (`30/60/90/120/300`), retry counts and chunk sizes are **Python
literals**, and the certified recipe carries its per-prop `alpha`, `k_stab`, `step` and `family` as a
hardcoded dict.
**The purpose was operational, not stylistic** — *"by SQL instead of coding and deploys"* matters
**because the owner has no terminal** (STEP 0a). Full entry and the measured config-vs-code diff:
`NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36* · `NBA_BASELINE_CALIBRATION.md` §0y.

### 2 · The per-worker improvement mandate — a three-step build rule
> *"**each new chat should look into the current MLB worker and understand the functionality,
> RESEARCH IF ANY IMPROVEMENT SHOULD BE DONE, then create with new nba sources.**"*

**Read the MLB counterpart → research an improvement → then build NBA's.** This is **more specific
than STEP 0's generic *"research is mandatory"***, and it is the rule STEP 3 and STEP 7 were actually
following when they read MLB's `static-teams` worker and `.github/workflows/scrape.yml` as templates.
**Whether the middle step — research an improvement — happened for each of the ~25 NBA workers is
NOT RECORDED**: no worker entry in `NBA_WORKERS.md` cites an MLB-counterpart review.

### 3 · The MLB no-touch rule, in the owner's own words
> *"**this chat and any chat coming from here must not edit anything from the mlb system.**"*

**Binding on every descendant chat, not just T1.** ✅ **VERIFIED HELD**: MLB's
`config.worker_definitions` holds **116 rows, 0 NBA** — the same count recorded on 2026-08-31
(`NBA_WORKERS.md` §0.4).

### 4 · The source mandate — why the Cloudflare block was fatal rather than inconvenient
> *"**ideally all these data should be coming from nba.com just like the mlb api.**"*

**This is the missing "why" under STEP 3 and STEP 4.** When Cloudflare turned out to be unable to
reach `stats.nba.com`, **substituting another data source was not on the table** — so the only path
left was to change *where the scraper runs*, which is what STEP 4 does. **It is also the
owner-stated origin of blueprint §4i** (*"exhaustively check the sport's own official API first"*):
**two independent sources, one rule.**

---

## STEP 1 — Recon before building *(T1)*

1. Read the three handoff documents **in full** (Blueprint 95,803 B, Lessons 57,066 B, Domain 18,034 B).
2. **Verify the claim, don't inherit it.** Queried `information_schema` directly and confirmed **zero
   NBA anything** existed. Found 18 MLB schemas, 116 workers, and the exact shapes of
   `worker_definitions`, `job_queue`, `worker_run_log`, `ref.teams`, `ref.umpire_tendency`.
3. **Corrected the handoff where it was wrong** — a `sport`/`league` column DOES exist on the Sleeper
   and Underdog board tables, contrary to the blueprint. Committed the correction as a banner.
   *(It changed nothing: the live code hardcodes `baseball_mlb` in the probe URL, the row filter and
   the league literal, so the column is not wired for dispatch.)*

---

## STEP 2 — Lock the namespace *(T1)*

1. **Naming**: workers `alphadog-v2-nba-<domain>-<thing>.js`, job_key `nba-<domain>-<thing>`.
2. **Folder**: everything inside `/nba/` — a second, independent guarantee against mixing.
3. **14 schemas in one statement.** No hitter/pitcher split; one `nba_stats`.
4. **Reference tables** with `source_key`, `raw_json` and `data_quality DEFAULT 'derived'` from the
   very first DDL — sourced vs derived distinguished from day one.
5. **Control plane**: `nba_config.worker_definitions` (8 cols, simpler than MLB's 16),
   `system_settings` seeded with the operating constants, `external_credentials` for secrets,
   `nba_control.worker_run_log` / `job_runs`.

---

## STEP 3 — Build the first worker, and discover the blocking constraint *(T1)*

1. Wrote `nba/alphadog-v2-nba-static-teams.js`, syntax-checked before commit.
   ⚠ **The gate is two-language** *(recorded 2026-09-20, T1 pass 38 — **VERIFIED** from T1's bash
   history)*: **`node --check <file>.js`** for workers **and `python3 -m py_compile <file>.py`** for
   scrapers, both `&& echo SYNTAX_OK`. **It is the only local verification before a push that
   auto-deploys** — there is no staging environment. `NBA_WORKERS.md` §0.25.
2. **Extended the two shared deploy scripts additively**, created `worker_manifest_nba.json`.
3. Deployed — failed on a path bug — fixed — deployed clean.
4. **And then it could not fetch anything.** Added a `/debug-fetch` route to see the raw body.
5. Rewrote headers to the canonical set from `nba_api`. **Still blocked.**
6. Added a multi-endpoint probe: **`stats.nba.com`, `cdn.nba.com`, `core-api.nba.com` and
   `data.nba.net` ALL return 403/520/526 from a Worker.**
   **→ Conclusion: a Cloudflare edge block on the whole family. Not fixable. Change the architecture.**

---

## STEP 4 — Move scraping to GitHub Actions *(T1)*

1. Found the pattern in MLB's own `.github/workflows/scrape.yml`: **scrape on a GitHub runner, commit
   the JSON, have the Worker read the committed file.**
2. Built `nba/scrape_nba_stats_teams.py` + an isolated `.github/workflows/nba-scrape.yml`
   (**weekly Monday 09:00 UTC** — the ancestor of P1's cron).
3. **Four failures, each diagnosed rather than guessed:**
   | # | Symptom | Diagnosis | Fix |
   |---|---|---|---|
   | 1 | 30 s timeout | slow response, not rejection | raise timeout, add retries |
   | 2 | 3× timeout | consistent hang = anti-bot **tarpit** | — |
   | 3 | timeout **through the proxy** | **rules out IP blocking** | — |
   | 4 | — | **TLS fingerprinting** | **`curl_cffi` browser impersonation → SUCCESS** |
4. **HTTP 200, 30 teams, real data.**

---

## STEP 5 — Make it self-triggering *(T1)*

1. Added a `github_trigger_workflow` tool to the bridge — **unusable in the session that added it**
   (tool list fixed at start); a parallel chat confirmed it was missing there too, and that
   **`GITHUB_TOKEN` is correctly not exposed** and **`workflow_dispatch` cannot be fired by a push**.
2. Owner: *"the whole point is for me to do not run it manually."*
3. **`on: push: paths:` CAN be fired by a push** → the workflow watches `nba/TRIGGER_NBA_SCRAPE.txt`.
   **Still the fallback mechanism today.**

---

## STEP 6 — Close the loop, and verify it properly *(T1 → T2)*

1. First scrape returned **empty abbreviations** — `TeamAbbreviation` is not in that endpoint.
   Caught by reading the committed file, **not the scraper's own meta claim**. Fixed.
2. Rewired the Worker to read the committed file, with fallbacks.
3. First run failed with `"Unexpected end of JSON input"` — requested the GitHub API's **raw**
   content-type, parsed it as the **base64 envelope**. Fixed.
4. **SUCCESS end to end**: `source_key: NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`.
5. **Verified in Postgres**, not from the response.

---

## STEP 7 — Repeat the pattern for every static entity *(T2)*

**The four-step wiring, established here and used for every worker since:**
1. `nba/worker_manifest_nba.json`
2. `generate_wrangler_configs.py`
3. `alphadog-v2-admin-sql.js` — bindingMap **+** dispatch branch **+** tool enum
4. `nba_config.worker_definitions` row

**Entities, in order, each with its own lesson:**
- **Players** (`commonallplayers`) → 582/525 active, 1,822 aliases.
  **Lesson: the fleet deploys alphabetically, so `admin-sql` must deploy LAST.**
- **Arenas** → three failures: a git push race (**fix: retry with rebase**), then null columns, then
  **the endpoint genuinely no longer carries them** → switched to `teamdetails`/`TeamBackground`.
  **Lesson: dump the real response before patching the parser.**
- **Officials** → no stats-API source exists; used **Wikipedia**, which needs **plain `requests`, not
  `curl_cffi`**. 80 officials.
  **Lesson: not every source takes the same transport.**
- **Bio / tracking / team stats** → found by research (web + Gemini, cross-checked):
  `leaguedashplayerbiostats`, `leaguedashptstats`, team stats — **one call for the whole league**,
  far cheaper than the per-team loop arenas needed.

---

## STEP 0c — The verification discipline that was supposed to run alongside every step *(T1)*
*Source: `NBA_ARCHITECTURE_BLUEPRINT.md` §8 and §9. Recorded 2026-09-20 (T1 pass 29).*

This is not a step that happens once — **the blueprint specifies it as a standing discipline applied
to every step above and below.** It is placed here because it was specified *before* any NBA code
existed, and belongs in the recipe at the point where the ingredients were chosen.

**From §8 — two rules, both stated as build-in-from-the-start:**
1. **Corrupt-and-fix testing** — *"MLB's single most reliable verification pattern, worth adopting
   immediately."* Deliberately change or delete a real row (flip a value, simulate a trade or roster
   change, delete a row) and **confirm the pipeline detects and repairs it on the next run** —
   *"rather than only ever testing the happy path."* → `NBA_SYSTEM_ARCHITECTURE.md` §8b.
2. **Never declare a bug fixed without verifying against real data.** MLB's *"explicit, repeated
   lesson, from direct user feedback"*: presenting a plausible-sounding root cause as a confirmed fix
   without checking **led to the same failure recurring immediately after being "fixed," multiple
   times in the same session.**

**From §9 — the scrutiny philosophy that governs how a step is declared complete:**
> *"**A pipeline's own 'PASS'/'COMPLETE' self-report is the STARTING POINT FOR SCRUTINY, NEVER THE
> CONCLUSION.**"*

Every real bug MLB found was caught by **independently re-deriving a claim against live data** — SQL
against real tables, deployed code read directly — **never by re-reading the status field the run
already reported.** Full methodology, the three techniques and the six named failure modes:
`NBA_SYSTEM_DESIGN.md` §6b. Build status of each check: `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*.

**⚠ How well the recipe actually followed this.** Mixed, and the record is specific:
- **✅ Step 6 is this discipline working.** The first scrape's empty abbreviations were *"caught by
  reading the committed file, **not the scraper's own meta claim**"* — exactly §9's rule.
- **✅ The failure policy** (`NBA_SYSTEM_DESIGN.md` §6, *no `|| echo failed` anywhere*) exists because
  a green self-report once hid **44% of a slate missing.**
- **⚠ Corrupt-and-fix testing is NOT RECORDED as ever having been run on any NBA worker.**
- **⚠ None of §9's six named failure-mode checks is recorded as built** — and **failure mode #6
  (silent config/formula drift across a whole universe) is already live**, as the `minutes_mixture`
  drift.

---

## STEPS 8+ — outlined from the journal, pending their own transcript passes

| Step | What | Transcript |
|---|---|---|
| 8 | **DARKO DPM** — four failures before the real mechanism: check for embedded data first → page is SSR, not JS-walled → guessed pagination got 50/530 and was **honestly flagged** → it's **SvelteKit not Next.js** → self-caught `//` vs `#` slip → **the full dataset is in the `kit.start()` hydration script** → JS bare decimals (`.534094`) are invalid JSON and need repair → **530/530, Jokić +6.76**. Stored as **`player_impact_rating`, NOT `darko`** (single-maintainer bus factor). **The weekly differential layer** — 6 tables, 3 snapshot/log pairs; had to exist BEFORE the next upsert because the writers overwrite; proven by **simulating** a change, not by observing zero events; a race and a **Hyperdrive cache artifact** diagnosed along the way. **Schedule 2,666 games** (1,400 + 1,266 already published) — and the **1 MB Contents API silent-empty bug** → `raw.githubusercontent.com`. **Play types** (11 types × 2 groupings × 2 levels = 44 calls after the cheap path failed), **tracking detail** (8 families, 4,652 rows), **shot quality** | T3 |
| 9 | 3-season game-log backfill (**79,358 player-game + 7,380 team-game rows**), advanced stats via a **2-call `MeasureType=Advanced` correction** (Gemini had estimated 1,230), career totals with the empirically-resolved **`TEAM_ID=0`** traded-player row, splits, **baseline methodology** (EWMA per-36 + Bayesian shrinkage → separate faster minutes → pace/defence → **anchor to team-implied totals**; rolling variance **for over-under pricing specifically**; trend via a second faster EWMA **dampened so it doesn't double-count**), **THE ARCHITECTURE CORRECTION — the owner's: baseline strictly historical and CACHEABLE, enrichment volatile and cheap.** GBDT/NN considered and **rejected with conditions**. Risks named: **double-counting, order-of-operations, baseline staleness on trades** | T4 |
| 10 | **Shot Quality Delta** built — two bugs (`+` needs `%2B`; **`leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list**) — 582/582, Jokić +8.06%. **The position column was empty for 3 sessions** (scraper never extracted it, worker never wrote it) → fixed via **`playerindex`**, 582/582. **Defence-vs-Position** — 630 rows, free from data already held. **Starter status**: `boxscoretraditionalv2` returned **HTTP 200 with ZERO rows** — 1,228 "successes" → 799 rows; caught by comparing against expected magnitude; **v3 fixed it**, 32,179 rows, **12,300 = 10 × 1,230** | T5 |
| 11 | Manual chunked load (33 × 44 KB) abandoned when **the MCP enum refreshed between turns** and the Worker loaded the rest in 25 s. **Per-game officials** — `boxscoresummaryv2` found **documented unreliable after 2025-04-10** BEFORE building; v3 tested on 5 samples; **`if rows is not None` passes `[]`** → 3 games short; 3 games have no officials on NBA.com's side (all 2025-11-19). **Lineup synergy** — 8,000 rows, 4 bulk calls; **PK omitted `team_id`** (traded players pair up on two teams) and **failed loudly**. **The injury-PDF discovery** (`ak-static.cms.nba.com/referee/injury/`, back to 2021-22). **The daily delta worker** — completeness check took **three attempts** to reach `GAME_ID` prefix **`002` = 1230 = 1230** | T6 |
| 12 | **THE SEASON-HARDCODING FIX** — *"every weekly scraper hardcodes `Season=2025-26`; on Oct 3 the whole cycle would **silently keep pulling last season's frozen data while reporting success**"* — shared `active_stats_season()` across 9 scrapers, then **the same bug again in the per-game WRITERS** (`_2025_26`). **`stat_decay_config`** — 13 per-stat alphas, **α spread 6.7×, stabilisation spread 30×**, each with a stored rationale. The **30 KB documentation checkpoint**. **The MLB port**: the three-generation trap (two dead versions say so in their headers), the live v6 logic read line by line, **`MAX_TIERS=24`/`MIN_PER_TIER=15`/`TIER_BLEND_K=5` ported verbatim while the recency blend was REJECTED**. **The baseline boundary redefined.** The minutes model, the prop-by-prop factor lock, the 3-app prop map, the peer-reviewed factor sweep | T7 |
| 13 | **The five-dimension tiering architecture** materialised into `nba_config` (28 props, 29→67 factors, 460 relevance rows, 35 cells, 6 role tiers). **The nine-iteration calibration** → 0.7–1.0 pp on all 13 rungs, **`0 misses of 37` on BOTH seasons**. **A real bug in MLB's own guard** — symmetric floor forced 0.002 → 0.25. **The FRINGE anomaly was leakage.** **The permanent rule: a band cell is kept only if its sign is consistent across seasons.** *"Rung-aggregates hide errors."* | T8 |
| 14 | **All 11 single-stat props** under the two-season standard — 6 certified, 4 close, 1 regime. **The factor layer measured** (Brier +0.1–0.3%; home/B2B ≈0 everywhere). **Combos certified** (P+R 0.9, fantasy 0.8) — *"joint structure, never a direct fit"*. **DD calibrated.** **The period layer** — 3-part mixture, `P(OT)` at 5.3% pick'em, OT isolated as full-game − quarters. **The production builder** — *"the backtest harness on a past day IS already the production computation"* — reproduces the ladder exactly. **The loader. Loop closed end to end** | T9 |
| 15 | Factor lock (5 passes), return-ramp, day-before injury report, **the parity rule**, injury PDF scraper | T10 |
| 15 | Injury shard migration, per-game starters/officials, M1 defender quality, **ParlayAPI vs OddsAPI validation**, DFS board puller, overnight queue | T11 |
| 16 | Own scrapers for PP/Sleeper/UD/Fliff, **Fliff reverse-engineered from web bundles**, same-moment diffs proving our scrapers beat ParlayAPI | T12 |
| 17 | All five boards, two-season backfill, **grader**, **tier mapping incl. the invisible anchor**, per-book calibration | T13 |
| 18 | **Day-by-day baseline history (18.78M rows)**, combos gap, ladder depth, stage assignment by publish time | T14 |
| 19 | Enrichment engine, **A2 five failed panels**, N1 status resolution, prop reliability audit, live board archiver | T15 |
| 20 | **A2 retracted**, defender ratings rebuilt, **blowout on the real market spread**, matchup via market-implied totals, 60-season-prop rebuild, phase-aware calibration | T16 |
| 21 | **The final calculation engine** — final HP, confidence, score, edge; as-of calibration parity fix; the three pipelines | live session |
</content>
</parameter>
<parameter name="message">docs: NBA recipe - how the system was built, step by step