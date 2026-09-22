# NBA RECIPE — how the system was built, step by step

**Purpose.** The cake recipe. Every step in the order it happened, so the build could be reproduced or
audited. Where a step exists because an earlier attempt failed, the failure is part of the recipe —
that is the useful part.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Steps 0–7 from T1 (6 passes) and T2 (1 pass). Later steps outlined from the journal, pending their own transcript passes. |
| **2026-09-22** | ⚠ **BACKFILLED 2026-09-22, T20 pass 65 (§T20.70) — this row covers the `1` commit this log never recorded: T16 pass 1 (§T16.2), the blowout mixture on the real market spread.** 🔑 ***AND THE LOW COUNT IS ITSELF THE FINDING FOR THIS FILE.** `NBA_RECIPE.md` took **one** content commit across the sweep of T3–T20, against `NBA_DATABASE`'s 28 and `NBA_SYSTEM_DESIGN`'s 21 over the same window — the same shape as **RULE 41 / open item T19-1**, where `NBA_GLOSSARY.md` was found to have NO content commit for the sweep of T12 through T18. **This is recorded here as an observation, not as a closed finding: whether the recipe genuinely needed nothing, or was simply never measured against its charter, has not been tested.*** |

---

## STEP 0-T16 — 🔴🔴🔴 **THE BLOWOUT MIXTURE NOW RUNS ON THE REAL MARKET SPREAD, AND IT CORRECTS TWO BELIEFS THE CORPUS HELD** *(T16 pass 1, §T16.2, 2026-09-13 — the FIRST of the owner's three non-negotiables, taken end to end)*

⚠⚠ **The recipe change is at `classification_ladder_v12.py` lines 158–161**, where `P(blowout)` was
derived. **It now PREFERS the market spread, with the derived proxy as a printed-coverage fallback.**

### 🔴 THE GAP, MEASURED

*The baseline's blowout mixture ran on a **DERIVED spread** — from net rating + HCA + rest — with
**r = 0.46 and MAE 11.5 points** — while **307,604 real market spread rows** at morning and window sat
unused in the database.* 🔑 ***"A market spread is far sharper than r = 0.46, AND IT GETS THE SIGN
RIGHT — and the sign is what separates a 51.9% over-rate from 36.9%"*** *(COMPASS fact 14's asymmetry)*.

### 🔴🔴 THE 100:1 ASYMMETRY THE PROXY COULD NOT SEE — `P(blowout)` by market-spread bucket and side

| spread | n | **P(blowout)** | favourite wins by 20+ | favourite **loses** by 20+ |
|---|---|---|---|---|
| 0–2 | 202 | 0.163 | 0.084 | 0.079 |
| 4–6 | 454 | 0.167 | 0.110 | 0.057 |
| 6–8 | 414 | 0.205 | 0.181 | 0.024 |
| 8–10 | 307 | 0.215 | 0.186 | 0.029 |
| 10–13 | 322 | 0.270 | 0.264 | 0.006 |
| **13+** | 282 | **0.401** | **0.397** | **0.004** |

🔑 ***"A 13-point favourite blows the game open 40% of the time and gets blown out 0.4% of the time —
a 100:1 asymmetry. That's the single most actionable number for minutes projection, and the
baseline's derived spread (r = 0.46) CANNOT RESOLVE IT."*** ⚠ **A SIGN INVERSION WAS CAUGHT BY A
SANITY CHECK, NOT BY INSPECTION**: *the Odds API quotes the home spread as **NEGATIVE for a
favourite**, and the first build's flip made positive = favourite while testing `< 0`.* 🔑 *"A 13-point
favourite showing a 0.35% chance of winning by 20 is **physically impossible** — that's what exposed
it."* **A plausibility constraint on the OUTPUT catching a convention error in the INPUT.**

### 🔴🔴 TWO CORRECTIONS TO BELIEFS THE CORPUS HELD — **starter minutes by REALISED margin** *(23,591 player-games, base ≥26 min)*

| Margin | n | minutes ratio | **minutes lost** |
|---|---|---|---|
| **won by 25+** | 1,597 | 0.8748 | 🔴 **−3.99** |
| won by 20–25 | 1,120 | 0.9194 | −2.59 |
| won by 12–20 | 3,001 | 0.9760 | −0.79 |
| **competitive** | 12,966 | **1.0333** | 🔑 **+1.01** |
| lost by 12–20 | 2,672 | 0.9721 | −0.90 |
| lost by 20–25 | 929 | 0.9364 | −2.06 |
| **lost by 25+** | 1,306 | 0.9124 | **−2.86** |

🔑🔑 **(a) WINNING BLOWOUTS COST STARTERS *MORE* MINUTES THAN LOSING ONES — 3.99 vs 2.86.** ⚠ ***"That's
the OPPOSITE of the practitioner folklore 'avoid the losing end'"*** — *the mechanism: **losing teams
keep starters out there longer chasing the game, while a winning coach empties the bench earlier.***
✅ **And it REFINES rather than contradicts COMPASS fact 14** *(won blowouts 51.9% over-rate, lost
36.9%)*: **fact 14 is about OVER-RATES ON PROPS, which conflates minutes with efficiency; this
isolates MINUTES cleanly.**

🔑🔑 **(b) COMPETITIVE GAMES RUN STARTERS 3.3% *ABOVE* BASELINE (+1.01 minutes).** ⚠ ***"So the mixture
isn't 'normal versus blowout' — it's a THREE-WAY spread where close games actively INFLATE minutes. A
model centred on the season average UNDER-PROJECTS EVERY COMPETITIVE GAME."*** 🔑 **12,966 of 23,591
player-games are in that bucket — the majority case was being under-projected.**

### ✅ THE RESEARCH DEFINITION THE BUILD ADOPTED

*Garbage time is **a TIME-VARYING margin threshold** — 25 points at 12:00–9:01 remaining, decreasing
as the clock runs — **plus a starter condition (≤2 starters on court)**. **Not a fixed cutoff.*** *And
the response is **a sliding scale**: "the scale starts with games that have spreads of at least seven
points; for each point higher than that, the minutes projection is reduced by **1.5%**."* 🔑 *The
problem stated plainly by the source: "models rely on projected minutes derived from **competitive
game environments** — when a 25-point lead emerges, those assumptions collapse."*

### ✅ THE FULL PIPELINE, EACH STAGE GATED

| Stage | State |
|---|---|
| **measured** | **`nba_score.blowout_model`** — `P(blowout)` by spread bucket × side, the minutes-by-margin table, and the sliding scale |
| **exported** | **2,454 games, 100% morning-spread coverage, as-of legal at the 08:00 PT snapshot**, into `nba/data/` — *"no fallback needed"* |
| **wired** | the recipe derives `p_blowout` and `home_favored` from the market spread, **with the derived proxy as a PRINTED-COVERAGE fallback** *(the run log showed **66.6%, 2,450 of 3,680** — because the run spans three seasons and **2023-24 is in train with no spread export**; every game in the two exported seasons is covered)* |
| **sample-gated** | ✅ **per the owner's standing SAMPLE-FIRST rule** — **24,025 player-games across phase × role tier × spread × both seasons** |
| **rebuilt** | ✅ **60 of 60 season-props — 19,344,143 rows (2024-25: 9,537,535 · 2025-26: 9,806,608), 162/163 dates, 0 invalid probabilities, 0 missing lines** |
| **re-certified** | ✅ calibration held *(see below)* |
| **verified in output** | ✅ *(see below)* |

🔑🔑 **THE SAMPLE GATE IS THE SIGNATURE OF A CORRECT CHANGE RATHER THAN A LUCKY FIT** — **all the gain
is in the 11+ spread band**, and essentially none elsewhere:

| spread band | n | derived MAE | market MAE | **δ** |
|---|---|---|---|---|
| 0–4 | 7,495 | 5.0895 | 5.0882 | −0.0013 |
| 4–8 | 7,756 | 5.0899 | 5.0921 | +0.0022 |
| 8–11 | 4,018 | 5.2014 | 5.2013 | −0.0002 |
| **11–30** | 4,698 | 5.3306 | 5.2970 | 🔑 **−0.0336** |

*"That is **precisely where a derived spread with MAE 11.5 can't tell a 12-point favourite from an
18-point one**, and where `P(blowout)` runs 27–40%. **In pick'em games both predictors say the same
thing, so they perform the same.**"* ✅ **And no regression in any phase**: Oct–Nov −0.0097 · Dec–ASB
+0.0003 · post-ASB −0.0168 · push −0.0089.

⚠ **AN HONEST NOTE ON MAGNITUDE, recorded verbatim**: *"the overall minutes MAE improvement is small
because **most games aren't blowout candidates**. The value is concentrated in the **~20% of games with
double-digit spreads** — which is also **where the board's biggest mispricings live, since that's where
everyone else's projections break too**."*

### ✅ VERIFIED IN THE FINAL TABLE — **the effect is visible in the output, not just in the config**

| spread band | legs | **starter projected minutes** |
|---|---|---|
| pick'em (<4) | 5,940 | **31.55** |
| 4–8 | 7,558 | 31.36 |
| 8–11 | 3,784 | 31.32 |
| **11+** | 3,707 | **30.64** |

🔑 **Monotone decline, 0.91 fewer minutes in double-digit-spread games — and it can only come from the
market spread, since the derived proxy could not resolve these bands.** ✅ **Re-certification held**:
*rebounds, **360,272 graded rows** — less side worst band **1.7 pp**; more side 1.7 pp or better on
every band except **(0.65, 0.70) at −5.9 pp on n = 1,095 — 0.3% of the prop** — with the
31,284-row band at **0.952 → 0.952**.* ⚠ *Read per the derived-penalty rule: **worst-band numbers
over-penalise thin cells while volume-weighted calibration is near-perfect*** *(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T15 §6)*.

### 🔑 THE FACT-63 TRAP, CHECKED RATHER THAN ASSUMED

⚠ *Combos and periods are **separate certified files with their own constants** — "a rebuild that
patches only the singles recipe leaves combos on the old setting."* ✅ **VERIFIED: combos regenerate
their components by invoking `classification_ladder_v12.py` directly (line 45), and periods follow the
same pattern — so both INHERIT the market spread automatically. No separate patch needed.** 🔑 *The
check was run before the rebuild counted, not after — which is what kept the fact-63 trap from firing.*

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
  > ⚠ *Disambiguated 2026-09-21 (§T9.39b): **13 is the p95 MEASUREMENT, not a table value.** The
  > configured deep props are **`points` 14 · `pts_ast` 14 · `pts_reb` 15 · `pra` 16 ·
  > `fantasy_score` 16** — **no entry in `LADDER_DEPTH` is 13.** The shallow end is **2**
  > (`steals`, `blocks`), which is what makes "wrong in BOTH directions" exact.*
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
   ⚠ **The recon is eleven queries in a deliberate order** *(T1 lines 1906–3424; recorded 2026-09-20,
   pass 41)*: schemas → any `%nba%` table or schema → any `sport`/`league` column anywhere → the
   distinct values in those columns → `ref.teams` columns → `control` tables → `config` tables →
   `config.worker_definitions` rows → its real columns → re-query with the corrected column.
   **The shape is the reusable part**: look for the thing, then anything named like it, then the
   mechanism that would make sharing possible, then **whether that mechanism is actually used**.
   ✅ **Re-run live 2026-09-20: 18 non-NBA schemas — unchanged since 2026-08-31 — plus 14 NBA
   schemas**, and **zero NBA rows in the three shared MLB board tables.**
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

> ⚠ **THIS STEP WAS A REDISCOVERY, NOT A DISCOVERY — AND THE BLUEPRINT HAD SAID SO IN ADVANCE**
> *(recorded 2026-09-20, T1 pass 40; upgraded at pass 52 — **VERIFIED** against a live clone)*.
> **The blueprint states the rule outright**: *"**before building a new pattern, check whether an
> equivalent, already-correct pattern exists elsewhere in the same codebase** for a similar
> situation — it often does, and **copying a proven pattern beats inventing a new one**."*
> **So this was not an unthought-of gap — it was a documented instruction, in a document T1 had read
> in full, that was not followed.** `gbdt_training/d1_client.py`, already in this repo before NBA existed,
> states the same reasoning outright: *"Runs inside GitHub Actions (**which has real network access,
> unlike Cloudflare Workers, which cannot train models at all — confirmed from Cloudflare's own
> docs**)."* **The constraint and the answer were both already written down.** T1 reached them
> through **four failed runs and thirteen polling sleeps**. The fix below is correct; what was
> missing was a defined search space for *"has MLB already solved this"* —
> `NBA_SYSTEM_ARCHITECTURE.md` §8c and §8.

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

## STEPS 8+ — outlined from the journal, ~~pending their own transcript passes~~

> # 🔴🔴🔴 **READ THIS BEFORE USING THE TABLE BELOW AS A RECIPE — IT IS A SUMMARY, NOT A SET OF STEPS**
> *Added **T20 pass 81 (§T20.86), 2026-09-22**.*
>
> ⚠⚠ **THE HEADING IS `DATED`, NOT `RETRACTED` (rule 40): *"pending their own transcript passes"* was TRUE when written. **Since then T3–T18 have ALL CLOSED on three consecutive clean passes, and T19 and T20 have been swept to `0/3` with `RULE 46`'s independent reads owed.*** ⇒ ***The passes happened — eighteen transcripts of them. The steps below were never promoted from summary rows into steps.***
>
> 🔴🔴 **WHAT THIS COSTS, CONCRETELY: the operating spine of the system appears in this document exactly once — four words in row `21`.** *`P1` weekly-static · `P2` overnight-heavy · `P3` afternoon-light — **their order, their `1:15 PM PT` cutoff, their gating, their twelve-check certifier — none of it is here.*** ▶ **It is documented, in depth, elsewhere: `NBA_SYSTEM_DESIGN.md` (the two-phase clock, the build-order lock) · `NBA_WORKERS.md` (the WORKFLOW → SCRIPT → TABLE wiring map, the certifier's predicates) · and the audits at `§T20.33`–`§T20.46`.** ⚠ *Someone rebuilding from this document alone would not know the pipelines exist.*
>
> ⚠ **AND ROW `12` STATES A FIX WITHOUT ITS LIMIT.** *`THE SEASON-HARDCODING FIX` is true of what it names — **"shared `active_stats_season()` across 9 scrapers"** — but the reach is narrower than a reader will assume.* ▶ **Measured `2026-09-22T20:30:59Z`: `129` NBA Python files (`nba/*.py` + `nba/backtest/*.py`) · **`20` use `nba_season`** · **`43` carry a literal `"2025-26"`** · 🔴 **`41` of those `43` do not use `nba_season` at all**.** *(The reach was first measured at `§T12.7d` as "20 of 135" and corrected to "24 of 136" — see `NBA_OPEN_ITEMS.md`.)* 🔴 **And it is live today: `T20-4` records `nba-p3-afternoon-light.yml:38,205` still defaulting `BS_SEASON` to `"2025-26"`, eleven days from preseason.**
>
> ✅ **THE TABLE BELOW IS ACCURATE. It is simply a record of what was done, not an instruction for doing it again — and `§T20.86` exists because that difference only matters on the day someone needs the second one.**

---

# STEP 8 — **P1 · THE WEEKLY STATIC LAYER** *(written T20 pass 83, §T20.88, from `.github/workflows/nba-p1-weekly-static.yml` read `2026-09-22T20:38:28Z`)*

**What it is for.** Everything that changes weekly or slower: rosters, arenas, officials, season-long team and player aggregates, defender ratings. **Nothing here is slate-specific.**
**When it runs.** `cron: '0 19 * * 1'` — **Mondays 19:00 UTC**, plus `workflow_dispatch`. ⚠ **`T20-11`: the comment on that line inverts PDT/PST — 19:00 UTC is `12:00 PT` only while DST is in effect, `11:00 PT` after `2026-11-01`.**
**What it does, in order** *(the workflow's own step names)*: **Teams and arenas** → **Players and bio** → **Weekly as-of season tables** *(`scrape_nba_season_tables.py` — `pt_defend`, `hustle`, `clutch`, `coaches`, `all_players`)* → **Team stats, on/off, playtypes, tracking** → **DARKO and shot quality** → **Defender ratings** *(`build_defender_ratings.py` — two-way ridge, weekly as-of)* → **Static context** *(`build_static_context.py`, coach changes)* → **Commit weekly data files** → **Certify the weekly layer**.
**What gates it.** `certify_pipeline.py` with `PIPE=p1` — **3 of the certifier's 12 checks**: `defender_ratings refreshed (<= 8 days)` · `defender_ratings rows (> 10,000)` · `player name map populated (> 400)`. **`CERT_STRICT=1` by default; any failed check exits 1.**
🔴 **WHAT BREAKS IT TODAY.** `defender_ratings` is **`166` days stale** *(`max(as_of_date) = 2026-04-09`)*, so **the first P1 check is RED right now** — see the frozen-static-layer item and `§T20.51`. ⚠ **And `§T20.31`: `nba_control.job_runs` and `worker_run_log` are both EMPTY — the detector exists; nothing runs it.**

---

# STEP 9 — **P2 · THE OVERNIGHT HEAVY PASS** *(same source, same reading)*

**What it is for.** Last night's results in, tonight's baseline out. **This is where the ladder is built.**
**When it runs.** 🔴🔴 ***IT DOES NOT. `nba-p2-overnight-heavy.yml` has NO `schedule:` and NO `cron:` — `workflow_dispatch` only.*** *The workflow says so itself, deliberately:* > *"**NO CRON YET — deliberately.** The NBA season opens in October; until real games exist there is nothing for this to mine… **The cron goes in when the season starts** (target: daily `09:00 UTC` = `01:00 PT`, which is after the last West-Coast game finalises and leaves eight hours before P3's 1:15 PM cutoff)."* ⚠ **Adding that cron is a prerequisite for every other P2 item on the OPENING-DAY BRIEF.**
**What it does, in order**: **Resolve slate date** *(`TZ=America/Los_Angeles date +%F` — DST-correct)* → **Daily delta ingestion** → **Injury report (day-before filing)** → **Referee assignments and per-game matchups** → **Baseline inputs: season files, quarters, schedule** → **Commit mined data** → **Delta gap audit** *(`check_delta_gaps.py`)* → **Grade last night's board outcomes** *(`grade_board_outcomes.py`)* → **Grade paper-trading picks** → **Market spreads and totals** → **Build baseline ladder (all prop pairs)** → **Components, combos and periods for today's slate** → **Merge per-pair ladders** → **Commit the merged ladder** → **Load baseline into Postgres** *(`load_baseline_ladder.py`)* → **As-of ladder calibration** *(`build_asof_calibration.py`)* → **Refit the blowout model** → **Refit the confidence deduction model** *(`build_confidence_v3.py`)* → **Certify P2**.
**What gates it.** `PIPE=p2` — **4 checks**: `baseline_history has today` · `baseline props for today (>= 25)` · `no invalid probabilities today` · `as-of calibration available`.
🔴🔴🔴 **WHAT BREAKS IT TODAY.** **`T20-13`, ranked FIRST on the brief**: `baseline_history` carries **`22`** distinct props in October and **`30`** from November 1, in both prior seasons — against a `>= 25` gate with `CERT_STRICT=1` ⇒ ***twelve consecutive red nights from opening night through `2026-10-31`.*** ⚠ **`T20-5`**: the grader's `GRADE_END` defaults to `"2026-04-12"` and P2 passes only `DATABASE_URL`, so **on opening night it grades nothing and reports success — the brief's only `SILENT` blocker.** ⚠ **`T20-10`**: `nba-daily-delta.yml` swallows three failures with `|| echo`.

---

# STEP 10 — **P3 · THE AFTERNOON LIGHT PASS** *(same source, same reading)*

**What it is for.** The decision moment: pull today's boards, score every leg, produce the picks.
**When it runs.** 🔴🔴 ***ALSO NO CRON — `workflow_dispatch` only.*** *It does carry a **guard**: step 1 resolves the slate date and **asserts the `1:15 PM PT` cutoff has passed**, using `TZ=America/Los_Angeles date +%H%M` — DST-correct.*
**What it does, in order**: **Resolve slate date and assert the cutoff has passed** → **Day-of injury report** → **Other board scrapers** → **Archive boards into Postgres** *(`archive_live_boards.py`, `ARCHIVE_LABEL="window"` — this pull IS the decision snapshot)* → **Board tiers (goblin / standard / demon)** → **Market snapshot and rung market** → **Commit day-of data** → **Availability delta** *(`build_availability_delta.py`)* → **Score the board** *(`score_board_legs.py`, all apps, all rungs, both directions)* → **Log paper-trading picks** → **Certify P3**.
**What gates it.** `PIPE=p3` — **5 checks**: `final_hp has today` · `confidence populated` · `score in range 0-100` · `confidence model loaded` · `board archived today`.
🔴🔴🔴 **WHAT BREAKS IT TODAY.** **`T20-7`**: the step named *"Board tiers (goblin / standard / demon)"* **runs `python nba/maintenance_shrink_board_index.py`** — an index-maintenance script; the real builder `build_board_tiers_v2.py` is wired only into `nba-engine-test.yml`. ⚠ **`T20-4`**: `BS_SEASON` defaults to `"2025-26"` at `:38` and `:205` — **last season**. ⚠ **`T20-12`**: `build_availability_delta.py:39` hardcodes `PT = -8`, so `p3_cut` is an hour late for every day of PDT — *including the first twelve nights of the season*. ⚠ **`T20-6`**: 7 of the 12 certifier checks assert tables no pipeline writes, and every threshold is `> 0` against real magnitudes of `59,000`–`118,000` rows per date.

---

---

# STEP 11 — **THE BUILD ORDER: what must exist before what** *(written T20 pass 84, §T20.89, 2026-09-22)*

> 🔑🔑 **WHY THIS STEP EXISTS.** *`STEP 0`–`STEP 7` say how the founding work was done; `STEP 8`–`STEP 10` say what the three pipelines do. **Nothing said in what ORDER a person rebuilding from nothing must create the layers** — and the owner's own directive on the subject, **`§0z-3` THE BUILD-ORDER LOCK** in `NBA_SYSTEM_DESIGN.md:218` *(T17 pass 0, §T17.1, owner, 2026-09-19)*, **is one of the five findings `T20-1` records that nothing in the corpus points at.** ***This step is that pointer.***
> ⚠ **Every stage's figures were re-derived live `2026-09-22T20:43Z`, read-only. Anything the corpus does not settle is marked `NOT RECORDED` (rule 6) rather than inferred.**

| # | stage | requires | produces *(live figures)* | how you know it worked |
|---|---|---|---|---|
| **1** | **Namespace + static layer** *(P1)* | *nothing* | `nba_ref.teams` **30** · `arenas` **30** · `officials` **80** · `player_name_map` **5,212** | P1 certifier: `player name map populated (> 400)` |
| **2** | 🔑 **Game-log backfill** *(one-time, NOT a pipeline)* | stage 1 *(player ids)* | `nba_stats.player_game_log` · `_advanced` · `_scoring` · `_usage` — **79,358 rows EACH** · `player_game_starter_status` **32,179** | **all four log tables equal**; and this re-derives the recipe's own row-9 figure exactly |
| **3** | **Weekly as-of layer** *(P1)* | stage 2 | `nba_ref.defender_ratings` **111,768** · season tables · playtypes · tracking · DARKO | P1: `defender_ratings refreshed (<= 8 days)` + `rows (> 10,000)` — 🔴 **RED TODAY, `166` days stale** |
| **4** | 🔑🔑 **The baseline ladder** *(P2)* | stages 2–3 | `nba_score.baseline_history` — 2024-25 **162** dates × **30** props *(9,537,535)* · 2025-26 **163** × **30** *(9,805,813)* | P2: `baseline_history has today` · `baseline props for today (>= 25)` — 🔴 **`T20-13`: October carries only `22`** |
| **5** | **As-of calibration** *(P2)* | stage 4 | `nba_score.ladder_calibration_asof` — **9,904** rows · **24** as-of dates · `2024-10-29 → 2026-01-15` | P2: `as-of calibration available` · ⚠ **the parity rule: every value computed IN-RUN from history AS OF THE DAY — nothing pasted** *(COMPASS fact 6; `NBA_BASELINE_CALIBRATION.md` §T17.2 records the one violation of it, found and fixed)* |
| **6** | **Board archive** *(P3)* | *independent of 1–5* | `nba_market.board_snapshots` — **12** sources; newest NBA `game_date` **`2026-04-12`** *(correct for an off-season)* | P3: `board archived today` · ⚠ **threshold is `> 0` against a real magnitude of **~71,000 legs per date** (`T20-6`)** |
| **7** | **The grader** *(P2, next morning)* | stages 2 + 6 | `nba_market.board_outcomes` — **6,905,452** | 🔴 **`T20-5`: `GRADE_END` defaults to `"2026-04-12"` and P2 passes only `DATABASE_URL` — on opening night it grades nothing and reports success** |
| **8** | **The scoring engine** *(P3)* | stages 4 + 5 + 6 | `nba_score.final_hp` **19,215,200** *(2024-25 `19,075,070` · 2025-26 `140,130`)* · confidence · score | P3: `final_hp has today` · `confidence populated` · `score in range 0-100` · `confidence model loaded` |

## 🔴🔴🔴 **AND THE GATE THAT SITS ON TOP OF ALL OF IT — THE OWNER'S WORDS, `§0z-3`**

> ***"Leg correlation is a SLIP-BUILDING level — we will not work on that until we have the final HP and score sharpened to perfection. Freshness gates probably the same. ORCHESTRATOR WILL NOT EXIST — just the daily functions, and THE CLAUDE WORKER WILL EXECUTE ONE BY ONE VIA PROMPT. …We need to finish all the enrichment factor pipeline, final HP, score and confidence REPLICATED TO THE FULL DATABASE — only then do we move to the points you said."***

| what the gate disposes of | status |
|---|---|
| **leg correlation** | ⏸ **DEFERRED by decision** — slip-building level, blocked on final HP + score |
| **freshness gates** | ⏸ *"probably the same"* — ⚠ **a hedge, recorded as a hedge, not a decision** |
| 🔴 **an orchestrator** | ❌ **WILL NOT EXIST** — *"the Claude worker will execute one by one via prompt"* |

⚠⚠ **THE GATING CONDITION IS NOT YET MET, BY ITS OWN TERMS**: *"final HP, score and confidence **replicated to the full database**"* — and `final_hp` holds 2024-25 at **162 dates** against 2025-26 at **ONE** *(open item `T16-7`)*.

## ⚠⚠ **`NOT RECORDED` (rule 6) — the ordering questions the corpus does not answer**

1. 🔴🔴 **Is `final_hp`'s expected size the BOARD-SCOPED set or the FULL LADDER?** *`§0z-3` raises this itself and calls it the highest-value open question: the owner asks* > *"so every single leg for the past two seasons, **BOARD SCOPED**, have a final hit probability and a confidence percentage, correct?"* — ***and "board scoped" is a far smaller population than the full ladder. **This distinction decides whether `T16-7` is a gap or a scoping choice**, and nothing in the twelve settles it.***
2. **Where stage 2 (the game-log backfill) is triggered from.** *It is not one of the three pipelines. **No workflow in the repo runs it on a schedule**, and no document says who runs it on a rebuild.*
3. **Whether stages 6–8 can run at all on a day stage 4 failed.** *P3 reads what P2 wrote — **refuse, run degraded, or run anyway is NOT RECORDED** (§T20.88).*

---

## ⚠⚠ **STEPS 12+ — `NOT RECORDED` (rule 6), and stated rather than smoothed** *(§T20.88)*

- **How P2 and P3 are to be TRIGGERED in production.** *P1 has a cron. **P2 and P3 have none**, and only P2's workflow states an intended time (`09:00 UTC`). **No document states P3's.** The `1:15 PM PT` cutoff is a GUARD, not a schedule — it says when P3 may not run, not when it will.*
- **What happens when a pipeline fails.** *No retry policy, no alerting path and no on-call step is recorded anywhere in the twelve. `nba_control.job_runs` and `worker_run_log` are EMPTY (§T20.31).*
- **The order between P2 and P3 on a day when P2 fails.** *P3 reads what P2 wrote. **Whether P3 should refuse to run, run degraded, or run anyway is NOT RECORDED.***

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