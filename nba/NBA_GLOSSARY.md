# NBA GLOSSARY — every term, and exactly where to find it

**Purpose.** When a term comes up and you need the source, this tells you which transcript, which
context, and which document section. Any material term appearing more than once belongs here.

**How to use it.** Find the term, note the transcript ID, then:
`grep -o "<term>[^\"]\{0,300\}" /mnt/transcripts/<file>.txt`

**Transcript IDs**
| ID | File | Dates covered |
|---|---|---|
| T1 | `2026-09-03-03-22-04-nba-expansion-phase1-static` | 08-31 → 09-03 |
| T2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete` | 09-03 |
| T3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete` | 09-03 |
| T4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete` | 09-03 |
| T5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete` | 09-03 cont'd |
| T6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete` | 09-09 |
| T7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research` | 09-09 |
| T8 | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration` | 09-09 |
| T9 | `2026-09-09-22-10-00-nba-baseline-production-pipeline` | 09-09 |
| T10 | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09` | 09-09 |
| T11 | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10` | 09-10 |
| T12 | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10` | 09-10 |
| T13 | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10` | 09-10 |
| T14 | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12` | 09-11/12 |
| T15 | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12` | 09-12 |
| T16 | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13` | 09-13 |
| LIVE | the 2026-09-19/20 session (not yet a transcript file) | 09-18 → 09-20 |

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Terms from T1 (10 passes), T2 (1 pass), the journal, and the live session. |

---

## A

**A2 — teammate redistribution** · T15, T16 · The enrichment factor that redistributes an absent
player's production. **Five panels failed, then fully RETRACTED** — the certified anchor wins every
slice, and worst where the mechanism predicted it should win. COMPASS fact 91.

**A3 — return ramp** · T10, T16 · Minutes ramp after a return. Assigned to BASELINE by the parity doc,
so never an enrichment candidate. Gated at leg level: zero gain.

**A5 — lineup change** · T15 · **REJECTED/CLOSED.** A derived as-of proxy is redundant — the
allocator's recent-5 minutes already encode starting. *"No projected lineups needed → no leak to
mitigate."* **This is why P3 has no lineup scrape.**

**admin-sql** → see *bridge*.

**anchor** · T13, LIVE · The standard line a ladder is measured from. Two cases: **explicit** (a
standard line is on the board) and **switch_point** (the *invisible anchor* — see below).

**as-of** · T10, T14, LIVE · Every value computed from only what was knowable at that day's cutoff.
The governing rule of the whole system. `nba/nba_asof.py` holds the cutoffs.

**availability delta** · LIVE · `nba/build_availability_delta.py` — what changed between P2's overnight
report and P3's 1:15 PM view. Only material availability moves matter.

## B

**B4 — opponent availability / rim protection** · T15, T16 · Closed in three formulations, 0 of 5 props.

**band cell** · T8 · A calibration correction fitted per variation band. **THE PERMANENT RULE:
*"a band cell is kept ONLY if its sign is consistent across seasons."*** A cell that flips sign between
seasons is fitting a **regime**, not a **structure**, and freezing it makes the model **worse than no
cell at all**. Established when rebounds ELITE was under-projected in both seasons (structural, kept)
while 3PM mid-bands ran **+2.8 in 2024-25 and −3.6 in 2025-26** (regime, dropped in favour of
walk-forward tables + in-season Platt).

**shift vs replacement mode** · T8 · Two ways to apply an empirical cell. **Shift** = a logit-level
adjustment on the parametric — *"calibrate level, preserve ordering"*. **Replacement** = use the
empirical table directly. **Decided PER PROP by evidence**: replacement for points/rebounds/assists,
shift for 3PM (λ=1.0), λ=0.5 for blocks/steals/ftm/oreb. *"turnovers/fouls tested at 0.5 and 0.25 and
were WORSE than replacement → stay replacement."*
**Why shift fixed 3PM**: the empirical cells keyed on attempt tier × role averaged a 33% and a 42%
shooter together, **shrinking away the make-rate ordering the parametric already knew**.

**structure vs regime** · T8 · The distinction the season holdout exists to draw. **Structure**
reproduces across seasons and can be frozen into a cell. **Regime** flips sign and must be handled by
walk-forward refitting instead. **The holdout was the owner's suggestion as a robustness check and
produced a permanent selection criterion.**

**calibration vs edge** · T9 · **The distinction that governs how the system is used.**
*"**Calibrated** means the stated probabilities are **honest**: when the recipe says 75%, roughly 75%
of those legs hit, on every band, both seasons, out of sample — the property that makes **slip EV
computable and Goblin/Demon pricing comparable**. It does NOT mean any single leg is near-certain:
**a calibrated 75% still loses one time in four.** **Calibration is the foundation; EDGE comes from the
factor layer and the enrichment deltas on top of it.**"*

**certification ladder** · T8, T9 · The per-prop states: **CERTIFIED** (ladder ≤1.5 pp, zero
band×direction×rung cells over 2.5 pp, confidence bands hitting their rate on BOTH seasons) ·
**CLOSE** (ladders fine, 2–5 confidence bands off by 2.6–4.4 pp) · **REGIME RESIDUAL** (sign flips
between seasons; walk-forward Platt carries it) · **CONFIGURED, NOT RUN** · **NOT YET CERTIFIED**.
As of T9: **6 certified** (points, rebounds, assists, 3PM, FGA, FTM), **4 close** (blocks, steals,
turnovers, fouls), **1 regime** (3PA), **combos certified** (P+R, P+A, R+A, PRA, fantasy).
⚠ *2026-09-21 (§T9.35b/c, extended §T9.36a): **TWO of this certified six are listed as "configured,
NOT yet run" in the recipe's module docstring, line 11** — **`FGA`** (which also carries its own
inline `# CERTIFIED both seasons (0.9 / 1.3, 0 band misses)`, so the file contradicts itself) and
**`FTM`** (which carries **no** inline certification marker, so the file contradicts this record).
**Which governs is NOT RECORDED; line 11 is undated.** And **NOT YET CERTIFIED is four props —
`fgm`, `fta`, `oreb`, `dreb`** — not the two usually listed.*

**opponent-driven props** · T9 · **The structural reason blocks, steals and FTM resist certification**:
*"the 'close' props are EXACTLY the ones whose primary drivers are **opponent** stats — steals ←
opponent turnover rate."* A player-history baseline cannot see them. *"These are the noisiest per-game
stats in the sport; the research consensus for them is exactly what's built."*

**baseline** · T4, T7, T8, T9 · *"The heart of the system"* (owner, T1). The historical-only projection
producing hit probability and confidence. **Strictly historical — enrichment is separate** (T4).
**The five-step design (T4, `nba/NBA_BASELINE_METHODOLOGY.md`)**: EWMA per-36 rate with Bayesian
shrinkage → separate faster-moving minutes projection → pace + opponent-defence multipliers → raw
projection → **anchor to team-implied totals**. Volatility via rolling SD; trend via a second faster
EWMA, **dampened so it does not double-count the primary**.

**baseline vs enrichment — WHY they are separate** · T4 · **The owner's correction, and the reason is
caching cost**: *"the baseline is expensive to compute but **only changes after a player plays a
game — it can be cached**. Enrichment data (injuries, odds) changes constantly."*
**This is the founding justification for today's P2 (overnight) / P3 (afternoon) split.**

**THE BASELINE BOUNDARY** · T7 · **Redefined, and this is the line the system still uses**:
*"The baseline isn't 'player history only.' It's **everything derivable from static and historical
data** — including the calendar, which tells us the opponent, home/away and rest days. So **opponent
defence, pace matchup and blowout risk all belong in the baseline**, derived from team strength rather
than a live spread. **Only truly live inputs (injury reports, confirmed lineups, market lines) are
enrichment** — and for the important ones, **the baseline carries a derived signal as backup**."*
**That last clause is why the derived-spread proxy (r=0.46) existed before the real market spread
replaced it in T16.**

**the three-generation trap** · T7 · Two of MLB's three classification/baseline generations are dead
and say so in their headers (`-v5`: *"OLD VERSION — DO NOT TOUCH — CONFIRMED DEAD"*; the D1 v6:
*"CONFIRMED DEAD, do not build on this"*). **The live one is
`runClassificationBaselineV6ToPostgres`**, writing `classification.classification_v6_current` and
`baseline_v6_current`. **Porting from either dead version would have locked in wrong logic.**

**blowout as a minutes MIXTURE** · T7 design, T16 build · *"blowouts don't reduce points, they reduce
**minutes**"* → `P(blowout) × [blowout-minutes dist] + (1−P) × [competitive dist]`, *"causal and
self-explaining rather than a post-hoc probability drag."* **This is why `blowout_model` stores ratios
(competitive 1.0333) and not penalties** — and why it does not double-count the shortened minutes the
baseline's history already contains.

**`NBA_BASELINE_METHODOLOGY.md`** · T4 · The design document for the baseline. Design-only, no code —
*"matching the research-first pattern this whole project has followed."*

**minutes projection** · T4 · Flagged at design time as ***"the single biggest source of error in any
player-prop model"*** — not a solved problem. Everything the allocator, the blowout factor and the
availability model do is an attack on this.

**TEAM_ID = 0** · T4 · In `playercareerstats`, traded players get per-team rows **plus** a combined
total row at `TEAM_ID = 0`. **A naive `SUM()` double-counts them.** Resolved empirically after search
could not settle it.

**baseline_history** · T14 · `nba_score.baseline_history`, 19.34M rows. *"Certified never meant
stored"* — the harness discarded per-leg probabilities; this table is what the engine READS.

**Betr** · T13 · DFS app. GraphQL, owner's Keycloak token, tiers REGULAR → EDGE_4.

**blowout** · T16 · Non-negotiable factor. Upgraded from an r=0.46 proxy to the **real market spread**.
A 13+ favourite blows open 39.7% vs 0.4%. Winning blowouts cost starters MORE minutes than losing ones.

**board_snapshots** · T11, T13 · `nba_market.board_snapshots` — every board leg, all apps, all
snapshots. **Has a `multiplier` column.**

**board_tiers / board_tiers_ud** · T13 · Tier classification. **The `_ud` version already implements
the four-way rule; the PrizePicks version does not.**

**bridge** · T1 · `alphadog-v2-admin-sql.js`, the MCP worker exposing every tool. New workers need a
binding + enum + dispatch branch. **A new tool is unusable in the session that adds it.**

**BT_ vars** · T8, T9, LIVE · The baseline builder's environment: `BT_ASOF`, `BT_PROPS`, `BT_CUTOFF`
(baseline|phase1|phase2), `BT_REPLAY`, `BT_INJURY`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS`,
`BT_TRAIN`/`BT_TEST`.

## C

**composition check** · T1 (blueprint §9) · A verification that **both expected output categories are
present in plausible proportions**, not just that the row count matches. *"A **100%/0% split is a red
flag even when the total row count exactly matches expectations**."* Distinguishes a died-mid-write
batch from a complete one. → `NBA_SYSTEM_DESIGN.md` §6b · **not recorded as built on
`nba_score.board_scored`.**

**corrupt-and-fix testing** · T1 (blueprint §8) · **"MLB's single most reliable verification
pattern."** Deliberately change or delete a real row in the database, then confirm the pipeline
detects and repairs it on the next run — instead of only ever testing the happy path. →
`NBA_SYSTEM_ARCHITECTURE.md` §8b.

**coverage-gap check** · T1 (blueprint §4b, motivated by §7f) · A **diagnostic-only, never
automatically acting** check surfacing any **(prop, side, high-confidence bucket)** combination with a
real resolved-outcome deviation past a threshold **and zero active correction covering it**. Exists to
catch a silent calibration regression *before* it runs for weeks. → `NBA_FINAL_SCORING_CALIBRATION.md`
§7m Safeguard 1, §7m2 · **not recorded as built.**

**`confidence_verification`** · LIVE · `nba_score.confidence_verification` — the table holding every
confidence check's stated-vs-actual gap. ⚠ **Four writers; three scope their deletes to their own
partition (`tier='v3'`, `tier IN ('v2','high_vs_low')`, `check_type='mondrian_quintile'`) and
`verify_confidence.py` deletes the WHOLE TABLE.** Running it erases P2's nightly v3 rows. **Not yet
fired** — three generations of rows currently coexist. → `NBA_DATABASE.md` · `NBA_OPEN_ITEMS.md`.

**certification center** · T1 · **The UI — it already exists (MLB's) and will be integrated.** An
aggregator of legs and a slip builder. *"the main UI will be the same."* **Nothing to build.**

**combos** · T9, T14 · Multi-stat props (pra, pts_reb, pts_ast, reb_ast, stocks) via joint simulation.
**Need `BT_SAVE_COMPONENTS` singles pickled FIRST.** A missing combos build = 44% of the board.

**confidence** · T15, LIVE · **A data thermometer, not a probability.** Starts at 99, deducts for named
deficiencies. Measures EPISTEMIC uncertainty only. Mean 0.92–0.95.

**curl_cffi** · T1 · Browser TLS impersonation. **Mandatory** for stats.nba.com — plain `requests` is
fingerprinted and tarpitted, and a proxy does NOT help.

**Claude Coworker** · T1 · **The scheduler.** Each of the three runs is triggered by a Coworker
scheduled task, worker by worker. *"no runner, orchestrator or anything like, it only breaks the run."*
**Coworker is what replaced the orchestrator.**

**Cloudflare-to-Cloudflare** · T1 · The root cause of the nba.com block. stats.nba.com is itself
Cloudflare-fronted, and Worker→Cloudflare-site traffic is flagged at the WAF/edge. **The request never
reaches the app layer** (error 520). No header tuning fixes it.

**`FALLBACK_AFTER_FETCH_ERROR`** · T1 · *(full value: **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`**)*
The `source_key` written when the live fetch fails and the certified static list is used.
**Check it before trusting a load.** Its counterpart is `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`.

**`BASE_HITTER_GAME_LOGS_WORKER`** · T1 · The MLB precedent NBA workers copy for bridge dispatch —
**a direct call that bypasses the queue entirely**, matching the owner's no-orchestrator rule.

**"mlb calls referees Umpire"** · T1 · The owner's own search key for finding the referee analogue.
**He supplied it**; it is why `ref.umpire_tendency` became the model rather than the factor being
treated as new territory.

**`nba_api` (swar/nba_api)** · T1 · The Python package whose docs supplied **the canonical header set
and the static TEAM_ID list**. **Issue #155** tracks stats.nba.com's changing header requirements —
**look there first if it breaks again.**

**`startswith("alphadog-v2-nba-")`** · T1 · The guard on every NBA branch in the two shared deploy
scripts. **Provably zero-impact on MLB.** Any future edit must keep it.

## D

**day-by-day table** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7) · The **exact layout the owner
expects for any backtest or real-slip report**, specified verbatim and *"reuse directly for NBA"*:
`Date · Slips · Full hits · 5/6 · ≤4/6 · Staked · Return · Profit · ROI`, **$1/slip**, **TOTAL row
bolded**, **partial-hit columns explicit** *"so the actual failure mode stays visible."* Owed
*"before being asked, every time a finding is reported."* **NEVER PRODUCED for NBA** — no slip
history exists. → `NBA_MULTIPLIERS.md` §8b · `NBA_OPEN_ITEMS.md`.

**DARKO** · T2, T3 · DPM ratings, SvelteKit hydration extraction, 530/530.

**DataDome** · LIVE · The wall on `app.prizepicks.com` and its payout endpoints. **Not defeated** —
proxy + chrome124 still 403.

**data_quality** · T1 · `DEFAULT 'derived'` on reference tables from the first DDL. Sourced vs derived
distinguished from day one.

**delta** · T6, LIVE · The day-by-day incremental store. **Its one dangerous failure is a SILENT hole** —
row counts still rise. Audited against the schedule by `nba/check_delta_gaps.py`.

**demon** · T13, LIVE · A harder-than-standard rung. **Above the anchor with More; BELOW it with Less.**
Hit 32.9/21.3/14.8% at T+1/+2/+3, needing 1.48/2.30/3.31× against a ~1.75–1.9× ceiling →
**only demon T1 is ever worth solving.**

## E–F

**`FE_DATE`** · `nba/build_final_hp.py` · ⚠⚠ **A READ FILTER, NOT A WRITE SCOPE.** It scopes the
`SELECT` from `baseline_history` to one slate; the `DELETE FROM nba_score.final_hp WHERE season AND
prop` carries **no date predicate**, so a scoped write **replaces the whole season × prop partition
with one slate**. **CONFIRMED FIRED**: the 2025-26 partition holds **one date and 140,130 rows**
against a documented 38.7M-row table — **~19.5M rows**, recoverable from `baseline_history`.
**Blueprint §7g bug class 1.** → `NBA_OPEN_ITEMS.md` (top) · `NBA_DATABASE.md` · `NBA_WORKERS.md` §5.

**flat vs proportional partial credit** · T1, **lesson #27** · The structural difference between DFS
platforms' Flex partial-hit payouts: **flat fixed values independent of the full-hit multiplier** on
one platform, **scaling proportionally with it** on another. *"The two structures produce meaningfully
different expected values for the same underlying leg-hit distribution."* **Verified for PrizePicks
only (flat); NOT RECORDED for Underdog, Sleeper, Betr, Fliff** — and §0.2e's dynamic-pricing finding
makes flat the *unlikely* prior for Underdog and Sleeper. → `NBA_MULTIPLIERS.md` §0.2h ·
`NBA_FINAL_SCORING_CALIBRATION.md` §14 #27 · `NBA_GOBLIN_DEMON.md` §6.

**edge** · LIVE · Distance above break-even, its own column. Answers *"is this an opportunity"* —
distinct from score, which answers *"how good is this leg"*.

**enrichment** · T10, T15, T16 · The factor layer on top of the baseline. **Ten candidates tested,
none survived at leg level.**

**factor_gate_results** · T16 · `nba_score.factor_gate_results` — every verdict, in the database.
*"A verdict that only exists in stdout is not a verdict."*

**file trigger** · T1 · `nba/TRIGGER_NBA_SCRAPE.txt`, `nba/TRIGGER_NBA_PROBE.txt`. Exists because
**`workflow_dispatch` cannot be fired by a push, but `on: push: paths:` can**, and the owner refused
manual triggering.

**Fliff** · T12 · Reverse-engineered from web bundles.

**four-way taxonomy** · T13, LIVE · **Below the anchor: More = goblin, Less = demon. Above it:
More = demon, Less = goblin.** A function of (position vs anchor, side), **never the emoji**.
Live since 2026-08 on MLB/WNBA.

## G–I

**goblin** · T13, LIVE · An easier-than-standard rung. **Below the anchor with More; ABOVE it with
Less.** Hit 74.1/68.7/61.9% at T−3/−2/−1 but observed factors take 40–53% → **−EV at every tier.**

**grader** · T13 · `nba/grade_board_outcomes.py` → `nba_market.board_outcomes`, 6.9M legs.
**Leg truth and operator settlement are separate.**

**Hyperdrive** · T1 · Cloudflare's connection layer to DigitalOcean Postgres.

**invisible anchor / switch point** · T13 · When no standard line is offered, the anchor is derived from
where goblins flip to demons. *"10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor."*
**Validated on 42,600 ladders.** 419,205 legs carry one.

## L–N

**leg-by-leg manual tracing** · T1 (blueprint §9) · Scrutiny technique 2: take real **high-confidence**
outputs, pull raw source data **by hand**, compute the expected value independently, and explain any
gap through a **documented mechanism** (shrinkage, calibration) rather than accepting *"looks close
enough."* → `NBA_SYSTEM_DESIGN.md` §6b.

**`malformed array literal`** · T1 (blueprint §7g) · A real Postgres error produced by a **`NOT IN`
clause built from an array parameter through a query-builder's tagged-template array handling**,
**especially when the array is empty**. Fix: explicit array-literal-with-cast plus an **explicit
empty-array branch**. Shared-stack gotcha. → `NBA_SYSTEM_ARCHITECTURE.md` §2d ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 29*.

**leg-level standard** · T8 · The gate a slip actually depends on: **every variation band × direction ×
rung**, plus *"when the model says 90%, does it hit 90%?"* across confidence bands.
**Why it exists**: *"**rung-aggregates HIDE ERRORS** — the first leg-level breakdown exposed structured
misses that had **CANCELLED OUT in the averages**."* A ladder accurate to 1 pp overall can hold a
+5.4 pp band and a −3.5 pp band that sum to nothing.

**hierarchical empirical fallback** · T8 · Three empirical levels before the parametric is ever
reached: **(tier × role × rung) → (band × role × rung) → (band × rung)**, each shrunk toward the next.
Took coverage to **100%** and halved the ELITE rebounds miss to +3.6. **The parametric is the last
resort, not the second option.**

**the symmetric-floor bug** · T8 · **A real bug in MLB's guard, inherited by porting it.** The
sample-size floor was symmetric, so it forced **true 0.002 rungs up to 0.25** — a 125× error at the far
tail. Fixed by making the ceiling **upper-only**; far tails then came out exact. **May still be live in
MLB.**

**the FRINGE anomaly** · T8 · A 0.87 minutes ratio for fringe players in won blowouts, where
garbage-time accumulators should be **above** 1. Held open under the owner's *"do not move before
fixing it"* directive. **Cause: a leakage bug — a season-wide mean using future games.** Fixing it
shrank the role minutes multipliers to *"honest ~1.0 values."* **Leakage inflates apparent skill.**

**role_tier** · T7 code, LIVE · **The six minutes bands that carry most of the engine's role logic**,
keyed on `mu_role` (projected minutes), NOT on the starter flag:
`IRON_MAN` 36+ · `HIGH_USAGE_STARTER` 32–36 · `STARTER` 27–32 · `ROTATION` 21–27 · `BENCH` 15–21 ·
`FRINGE` 0–15.
**This IS `f_role`** — the confidence factor carrying **55.6% of the deduction budget**, where fringe
players miss by **0.0283** and iron-men by **0.0008**. Those are the bottom and top bands of this list.
**It also implements *"starter vs bench — a primary split"* as a six-band continuous tier rather than a
binary**, which is why the one-season starter-flag gap is not load-bearing.

**the tiering constants** · T7 · `MAX_TIERS = 24` · `MIN_PER_TIER = 15` · `TIER_BLEND_K = 5` ·
`LADDER_STEPS = 6`. **All ported UNCHANGED from MLB's live v6** (where 24 was itself raised from 12
after a backtest). **The recency blend was NOT ported** — see "what does NOT transfer from MLB".

**`BLOWOUT_MARGIN` / `COMPETITIVE_MARGIN`** · T7 code · **20 and 15** — so margin <15 is competitive
(feeds the clean role estimate), ≥20 is a blowout (gets a `MIN_RATIO`), and **15–20 is a deliberate
dead zone**: neither clean nor penalised. ~10% of games land there.

**dud games** · T7 · ***"a fat low tail MLB doesn't have"*** — blowouts, foul trouble and early exits
producing 5-minute, 2-point games. *"A distribution fit to all games is **systematically
over-optimistic on 'more'**."* The NBA analogue of MLB's home-run bimodality.
**Designed as a mixture; implemented as an EXCLUSION** (`competitive & PF < 6`) — blowout truncation is
restored via `MIN_RATIO`, foul trouble is not. See OPEN_ITEMS.

**cross-season carryover** · T7 code · The season-opening fix. Without it *"the opening month has ZERO
projections and November only 62% coverage"*; with it **October 85%, November 90%**. Minutes role and
rate EWMA carried at player level; carried evidence counts as `CARRY_N` games at the boundary.
**Controlled by `BT_CARRY`, default "1".** Per app: PrizePicks in the raw feed; Underdog
`alternate_projections`; Fliff separate proposals; Betr tiers; **Sleeper has none** *(⚠ but T7's
verified inventory found Sleeper milestone lines 20+/25+/30+ — see OPEN_ITEMS)*.
**Width, from three converging sources (T7)**: books ladder a 24.5 player **~19.5 to ~31.5 ≈ ±1 SD**;
Unabated prices off the player's full outcome distribution; **Goblin ≈ 25th–35th percentile,
Standard ≈ median, Demon ≈ 70th–80th, useful range ≈ 15th–85th.** The live `LADDER_DEPTH` measurement
(p95 = 13 rungs for points) **agrees with this to within one rung.**

**lifts / penalties / caps** · T7 · **Lifts and penalties are factor-driven adjustments inside each
tier's pipeline.** **Caps are explicitly a LAST RESORT** — *"the preference is logic that lands on the
right number on its own."* Same instinct as the blowout minutes-mixture.

**variation** · T7 · **The line band within a prop.** Owner: *"PRA 20.5, 21.5, 23.5 — each one is one
variation. And each variation is gonna have more or less as well."* **Prop line × variation ×
direction** is the full matrix. **The distribution family itself changes by variation** — a 3.5-points
player gets Negative Binomial, a 33.5-points player gets Normal.

**what does NOT transfer from MLB** · T7 · **The fixed 5/10/20/season recency blend** —
*"flagged as the single biggest thing that does NOT transfer."* NBA replaced it with
`nba_config.stat_decay_config` (13 per-stat alphas). **Everything else in MLB's v6 logic was ported
deliberately; this one part was rejected on evidence.**

**M1 — defender quality** · T11, T16 · Rejected on a crude metric, then **rebuilt as a two-way ridge**
(`nba_ref.defender_ratings`, 111,768 ratings) and wired on 4 props — **all gains from the INTERACTION
form, not the main effect.**

**non-goals, the three** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §6) · What NBA was explicitly
told **not** to build, before any code: **no per-prop worker architecture** (MLB left *"19 dead stub
files behind as evidence"*) · **no weather / quality-of-contact / RFI-analogue factors** (*"no
basketball analogue"*) · **no auto-scheduling orchestrator before the manual pipeline is verified
end-to-end against real data once**. All three honoured; **the third is a sequencing rule whose
condition is now testable**. → `NBA_SYSTEM_DESIGN.md` §0.75.

**N1 — availability model** · T15, T16 · Status resolution. **79% of Questionables are coin flips at
the cutoff** because the Active List locks 60 minutes before tip.

## P–S

**operating model, the owner's** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7) · The stated
working constraints, *"apply from the very first NBA interaction."* **Owns and operates the system
alone from a phone, no terminal — the assistant is the only interface to database, repo and deploy.**
Output: **lead with the answer, tables over prose past two numbers, bold the number that matters, a
one-word reply means execute the next step autonomously.** Decisions: **ROI over profit, normalize by
capital deployed**; a smaller sample is acceptable for materially higher ROI, **present the risk, do
not pre-filter**; *"every check"* means every check; **believe an owner-reported anomaly and
investigate it.** → `NBA_MASTER_SUMMARY.md` §T1.61 · `NBA_SYSTEM_ARCHITECTURE.md` §1a.

**per-subgroup validation** · T1 (blueprint §7f) · The rule that **an aggregate out-of-sample pass is
necessary but not sufficient**: a proposed calibration correction must be checked against **every
meaningfully distinct subgroup it will be applied to** — both sides of a market, every tier — not the
pooled average. MLB's counter-example beat the baseline on held-out error and was still **dominated by
one side and silently misapplied to the other**. → `NBA_FINAL_SCORING_CALIBRATION.md` §7m2.

**pipeline scrutiny discipline** · T1 (blueprint §9) · The whole methodology built from *"a real
multi-bug night."* Core philosophy: **a pipeline's own "PASS"/"COMPLETE" self-report is the starting
point for scrutiny, never the conclusion.** Three techniques, **six named failure modes**, composition
checks. → `NBA_SYSTEM_DESIGN.md` §6b · failure-mode build status in `NBA_OPEN_ITEMS.md`.

**second master run, the optional** · T1 (`NBA_SYSTEM_DRAFT.md` §4b) · The cadence locked 2026-09-03
specified the master run as *"once, **sometimes twice a day**"* — a second pass *"only if needed"* on
**a late injury designation change or significant line movement**. Named as **the reason the
two-stage baseline/enrichment separation exists**: re-score against the cached baseline, *"not
recompute anything expensive."* **NOT BUILT** — P3 runs once and neither trigger has a detector.
→ `NBA_SYSTEM_DESIGN.md` §0.95 · `NBA_FINAL_SCORING_CALIBRATION.md` §2 · `NBA_OPEN_ITEMS.md`.

**parity** · T10, T14 · `NBA_DAILY_PARITY_AND_BACKFILL.md`. Every daily factor backfilled day by day,
producing exactly what the live pipeline would have produced. **§5 forbids carrying a constant between
days** — the rule that caught the pasted calibration table.

**patcher pattern** · T9 · Production builders are string-transformers over the certified backtest
recipes, so the certified file is never forked.

**phase** · T16, LIVE · Season regime: `1_oct_nov`, `2_dec_asb`, `3_post_asb`, `4_push`.

**score** · LIVE · 0–100. **Confidence ENHANCES around a 0.85 neutral, never taxes.**
A product would kill good legs.

**scenario precompute** · T16, LIVE · Enumerate availability branches, store only the realised one.
**Dropped as a daily job** — with one window there is nothing to select with.

## T–W

**whole-universe comparison** · T1 (blueprint §9) · Scrutiny technique 1: diff the **live config**
against the **real formula/logic** for **every entry in a universe at once** — every prop, every
source, every combo — not just the one currently suspected. The technique that catches **silent
config/formula drift** (failure mode #6). **The live `minutes_mixture` drift is exactly what this
would surface.** → `NBA_SYSTEM_DESIGN.md` §6b.

**write-path filter bug** · T1 (blueprint §7g) · A *"limit to these specific items"* parameter that
**filters only the response summary while the write logic ignores it**, touching every eligible row.
*"Invisible except by noticing unrelated timestamps had also updated."* Standing check on every NBA
worker mode/scope argument. → `NBA_SYSTEM_ARCHITECTURE.md` §2d.

**the two registries** · T1, LIVE · NBA keeps its own control plane: **`nba_config.worker_definitions`**,
**`nba_control.job_runs`**, **`nba_control.worker_run_log`**. MLB's shared
**`config.worker_definitions`** holds **116 rows, 0 of them NBA** — **VERIFIED 2026-09-20**, the same
count T1's Phase 1 banner recorded on 2026-08-31. Closes the blueprint's shared-queue contention
question (nothing to contend for) and evidences the *"additive only, no MLB-system side effects"*
constraint. → `NBA_SYSTEM_ARCHITECTURE.md` §1a0 · `NBA_WORKERS.md` §0.4.

**the unread config tables** · LIVE · `nba_config.classification_config`, `factor_registry` (67),
`factor_relevance` (460), `factor_profile_cells` (35), `stat_decay_config` (13), `system_settings`,
`role_tiers`. ⚠ **VERIFIED 2026-09-20: no code reads any of them** — the strings appear zero times
across all 190 `.py`/`.js` files and the MCP admin bridge. The only config table anything reads is
**`external_credentials`**. The live constants are hardcoded in
`backtest/classification_ladder_v12.py`, and a diff of `stat_decay_config` against it found **7 of 10
stats disagreeing, 3 on the decay rate itself**. **Editing these tables by SQL changes nothing.**
→ `NBA_OPEN_ITEMS.md` *FROM T1 PASS 36* · `NBA_DATABASE.md` §2 banner ·
`NBA_BASELINE_CALIBRATION.md` §0y.

**the case collision** · LIVE · **`BACKUPS/` and `backups/` both exist at the repo root** — VERIFIED
on a live clone 2026-09-20. **Any macOS or Windows clone collapses them.** →
`NBA_SYSTEM_ARCHITECTURE.md` §8.

**the fourth store** · T1, LIVE · The assistant memory files `/areas/alphadog.md` (MLB, 6,140 B) and
`/areas/alphadog-nba.md` (NBA, 4,471 B) — durable state **outside GitHub, Postgres and version
control**, **capped at 49,152 B per file**. → `NBA_SYSTEM_ARCHITECTURE.md` §8d.

**the MLB source library** · T1 · The **23 MLB-side `.md` documents** the transfer package was
distilled from — **eleven read in full**, two in part (**~40% of `ALPHADOG_DOS_AND_DONTS.md` and
`ALPHADOG_SYSTEM_MAP.md` still unread: PARTS 3-5, Sections 3-9**), the rest never read. **17 of 23
were catalogued nowhere until 2026-09-20.** → `NBA_SYSTEM_ARCHITECTURE.md` §8c.

**polling sleeps, the twenty-five** *(was "the thirteen" until 2026-09-20)* · T1, MEASURED · **25 of T1's 31 `bash_tool` calls were `sleep N; echo done`, totalling 2,416 s = 40.3 min** — **all but ~7 seconds of the session's entire local shell time.** The remaining six are two syntax checks, two `cat`s and **two `echo`s used as a scratchpad**. The behaviour blueprint §4o forbids, and the owner interrupted it — *"what is going on? what are these waits for?"* **Cause was structural**: no `github_trigger_workflow`, so no completion signal existed to await. → `NBA_SYSTEM_DESIGN.md` §0.8 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 66*.

**`schema_manifest.json`** · repo root, LIVE · A stale static manifest: `"date": "2026-05-18"`,
**`"target": "AlphaDog v2 new D1 databases only"`**, naming 11 D1 databases — **D1 was decommissioned
system-wide 2026-08-12.** With its eleven `schema_*_db.sql` companions (133 KB) it describes a dead
architecture in SQLite-flavoured, flat-named DDL. **Blueprint §5b standing in the repository.**
⚠ §T1.51 recommended `schema_ref_db.sql` to NBA as a template. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 43*.

**`*_meta.json` sidecar** · T1, LIVE · The provenance file written beside a scraper output:
`fetched_at`, `source_url`, `http_status`, an entity count, `error`. **VERIFIED: 41 of the 223 files
in `nba/data/` have one.** It is what makes *"read the committed file, not the scraper's own claim"*
checkable; **for the other ~180 files there is no committed record of fetch time or success.**
→ `NBA_WORKERS.md` §2 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 45*.

**`worker_invocation_logs`** · LIVE, bridge `run_job` mode · Reads Cloudflare's
**`workersInvocationsAdaptive`** GraphQL analytics — *"the actual outcome of every Worker invocation,
including **`exceededCpu`, `canceled`, `exception`, `scriptNotFound`**"*. **The only tool that
distinguishes a worker that failed from one never invoked from one the platform killed.**
**VERIFIED present in the live bridge; never run against an NBA worker in the record.**
→ `NBA_SYSTEM_ARCHITECTURE.md` §3b.

**`probe-sources`** · LIVE · A second `run_job` mode accepted by **all 21 NBA worker bindings**,
routed to `https://internal/probe-sources`. **Absent from `NBA_WORKERS.md`'s mode-dispatch table
until 2026-09-20.** → `NBA_WORKERS.md` §0.15.

**the two ID conventions** · LIVE · `player_id` is **prefixed `nba_<id>`** in `nba_ref.*` and
`nba_stats.*`, and **bare numeric** in every `nba_score.*` table. **VERIFIED 2026-09-20**:
`nba_score.board_scored` → `nba_ref.players` on `player_id` matches **0 of 110,955**; with
`'nba_'||player_id`, **110,955**. **Types are uniform (all TEXT); only the values differ.** Latent —
the scoring path joins score→score — but **any cross-layer join returns nothing, silently.**
**Blueprint §2's named multi-table ID bug, reproduced.** → `NBA_DATABASE.md` ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 50*.

**the 64 KiB display cap** · T1–T6, VERIFIED · A `display_content.json_block` field in a chat export
is cut at **exactly 65,503–65,504 characters**, marked `…[truncated — N chars total]`. **14 markers
exist across T1–T6; none in T7–T20.** In 8 the full text survives in the sibling `content` field; in
**6 it does not** — `content` is a 212-char stub naming an expired `/mnt/user-data/tool_results/`
path, and **5,564,467 characters are absent**. **All six are `github_get_file` calls on committed
`nba/data/*.json` paths and are recoverable via `git show <commit>:<path>`.** →
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 64* · `NBA_WORKERS.md` §0a.

**`teams.arena_id`** · LIVE, VERIFIED · **A DEAD COLUMN.** `nba_ref.teams.arena_id` is **NULL on all
30 rows and written by no code** (verified 2026-09-20 against the live DB and all 190 code files).
**The team↔arena link is `nba_ref.arenas.team_id`**, populated on all 30. A join through
`teams.arena_id` returns 30 NULLs and looks like a scrape failure. → `NBA_DATABASE.md`
`nba_ref.teams` · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 65*.

**`credential_value_encrypted`** · LIVE, VERIFIED · **A MISNOMER.** The column in
`nba_config.external_credentials` that holds API keys. **Nothing encrypts and nothing decrypts** —
the two readers use `.strip()` on the raw value, and no encrypt/decrypt step exists in the 190 code
files. **Two of the six stored values are bare 36-character UUIDs.** ⚠ **The same values sit in
plaintext in five of the twenty transcripts**, which are not yet committed — see the blocker at the
top of `NBA_OPEN_ITEMS.md`. → `NBA_DATABASE.md` `nba_config.external_credentials` ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 67*.

**`nba_control`** · LIVE, VERIFIED · The two-table run-bookkeeping schema created in T1
(`job_runs`, `worker_run_log`). **Both hold 0 rows, and the string `nba_control` appears in no
non-markdown file in the repo** — every user of `worker_run_log`/`job_runs` is an MLB file at the
root. **21 NBA workers are registered and enabled and their output tables are populated, so they run
and nothing records it.** → `NBA_DATABASE.md` §3 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 68*.

**tarpit** · T1 · Silent connection stalling instead of an explicit block. Three timeouts diagnosed it.

**tier** · T13, LIVE · Rungs out from the anchor. **v1 signs by kind; v2 must sign by POSITION**, since
a demon-Less sits below the anchor.

**window** · T11, LIVE · The decision snapshot label. **1:15 PM PT** (corrected from 2:45 — see
OPEN_ITEMS). Set by `ARCHIVE_LABEL`, which **defaults to `routine`**.

---

## P–S *(continued — research-standard structure)*

**Part G** · `NBA_LESSONS_LEARNED_FROM_MLB.md` · *"Lessons earned by the NBA baseline work itself
(2026-09-09), now part of the standard."* **10 numbered lessons** — the first NBA-earned content in
the research standard, as opposed to MLB-inherited. **Postdates T1; swept with T7–T11.**
**Not yet in the twelve documents** — `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*.

**Part H** · `NBA_LESSONS_LEARNED_FROM_MLB.md` · *"Lessons from the enrichment backfill, market and
board-sourcing phase (2026-09-10)."* **12 numbered lessons.** **Postdates T1; swept with T7–T11.**
**Not yet in the twelve documents.**

**the 27 lessons** · T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part A · The research standard applied to
every strategy candidate. **27, not 26** — **VERIFIED by grep 2026-09-20**; the documents said 26
until then and **#27 was missing entirely**. Full list: `NBA_FINAL_SCORING_CALIBRATION.md` §14.
**With Parts G and H the standard is 49 numbered items.**

---

## PENDING
Terms are added as each transcript completes its passes.
**Status 2026-09-20**: **T1 at pass 30, clean count 0/3** (pass 29 — blueprint §7f/§7g/§9;
pass 30 — lesson #27 and the lesson-count correction). **T2 at 0/3 pending re-sweep. T3–T9 void
per the DRIFT NOTICE. T10–T20 not started.**
*This block previously read "T1 is at pass 10 (clean count 0); T2 at pass 1" — stale, superseded
2026-09-20.*