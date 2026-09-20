# NBA SYSTEM DESIGN — the three pipelines

**Purpose.** Exactly what each pipeline does, in what order, why each step sits where it does, and the
constraints that shaped it. This is the operational spec.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. P1/P2/P3 as built and tested in the live session; lineage from the owner's three-run model in T1. |

---

## 0. LINEAGE — the owner's three-run model *(T1)*, refined through T4–T9

### 0.1 THE ARCHITECTURE CORRECTION *(T4)* — why the split exists at all
The owner's correction, and the verified reason:
> *"the baseline is **expensive to compute but only changes after a player plays a game — it can be
> CACHED**. Enrichment data (injury news, line movement) **changes all day**… the fast-changing
> scoring engine can **re-run in milliseconds** without ever recomputing the expensive baseline.
> **Merge them, and every minor daily update forces a full slow recompute.**"*

**A caching argument, not a convenience.** This is the founding justification for P2/P3.

### 0.2 The boundary, and how it is enforced *(T7, T8)*
> *"**daily-mined = enrichment; derivable-from-history = baseline**"* — the baseline is
> *"**AGNOSTIC** of daily context and market."*
**Encoded as a column**: `nba_config.factor_registry` tags **25 baseline / 4 enrichment** (injury
report, confirmed lineups, market-spread delta, referee assignment). **Queryable, therefore
enforceable.**

### 0.3 The two-layer contract *(T8)*
> *"Baseline applies static factors; **enrichment applies DELTA factors**: `market_spread −
> derived_spread`, `confirmed_out` superseding `questionable`. **No oscillation, no double-count, and
> the value of live information becomes measurable on its own.**"*

### 0.4 The original cadence vs today *(T4, `NBA_SYSTEM_DRAFT.md` §4b)*
| Run | Original | Today | Note |
|---|---|---|---|
| Static differential | Mondays **2:00 am PT** | Mondays **12:00 PT** | nothing here is cutoff-sensitive |
| Delta daily | **~11:00 am** | **01:00 PT** planned | ⚠ **tighter than the 6am ET the lag research endorsed** |
| Master run | **2h before the first game — DYNAMIC** | **fixed 1:15 PM PT** | ⚠ **breaks on early-tip days** |

### 0.5 Three governing principles
- **The baseline must NEVER live-query stats.nba.com** — speed, stability, and **reproducibility**
  (*"a live query at 9am vs 10am could return different data if a correction posted in between"*).
- **Late NBA stat corrections are NOT chased** — *"a consistent point-in-time snapshot."*
- **No pasted constants** — HCA, `P(blowout|spread)` and the blowout ratios are derived from TRAIN
  inside each run; `baseline_ladder_runs` records what each run derived.

---

## 0.6 The original wording

> *"the system is composed by 3 runs, each run will be ran by claude coworker, **so no runner,
> orchestrator or anything like, it only breaks the run** … individual worker by individual worker,
> path by path and making sure they are properly doing their jobs, **that is the way MLB system runs
> now and is running just fine**."*

| Owner's run | Today's pipeline |
|---|---|
| **Static differential** — calendar, teams, players, rosters, arenas, referees | **P1 Weekly Static** |
| **Delta daily** — game logs + incremental mining, **and the baseline, "the heart of the system"** | **P2 Overnight Heavy** |
| **Master run** — Board → Daily Context → Market/Odds → Scoring Engine | **P3 Afternoon Light** |

**Locked dependency, from T1:** *"the baseline must fully finish before master-run's Daily Context or
Scoring stages touch it."* → **P2 must complete before P3 runs.**

**There is deliberately no orchestrator.** Each pipeline is its own workflow with its own concurrency
group.

---

## 1. THE CUTOFF — why 1:15 PM PT

**The binding constraint is the game-day injury report.** It is due **11am–1pm LOCAL to each game's
market**, so Eastern clubs file by 10 AM PT and **Pacific clubs are last at 1:00 PM PT**.

Every other daily input lands earlier:
| Input | Available by (PT) |
|---|---|
| Prior-night box scores | ~3 AM |
| Referee assignments | ~6–7 AM |
| Market spread / total | 08:00 snapshot |
| Projected lineups | through the morning |
| Boards | on demand |
| **Game-day injury report** | **1:00 PM** ← binding |

**⇒ One window at 1:15 PM PT holds every club's report.**

**The 2:30 PM PT figure was drift** — traced to a list of observed injury-PDF timestamps in *Eastern*
(2:30 PM ET = 11:30 AM PT), and to `nba_asof.py`'s `PHASE2_CUTOFF_LOCAL = "17:45"  # after the 5:30 PM
ET day-of report` — a league **bulletin**, not a filing deadline. `nba_asof.py` already had
`PHASE1_CUTOFF_LOCAL = "16:00"` = **1:00 PM PT**, which is the correct anchor.

**Consequences:** no third pipeline; **scenario precompute dropped** (one window = nothing to select
with); **freshness gate dropped** (uniform penalty discriminates nothing).

---

## 2. P1 — WEEKLY STATIC
`.github/workflows/nba-p1-weekly-static.yml` · **cron `0 19 * * 1` = Mondays 12:00 PT** ·
concurrency `alphadog-nba-p1-weekly` · timeout 180 min

**Why weekly:** these tables are as-of weekly by construction. The cadence is the original one from T1
(`nba_differential_check_cadence = weekly`, cron `0 9 * * 1`), and the reasoning from T2 is explicit —
bio fields are *"truly static"* and season aggregates are *"semi-static, **stable enough for weekly
refresh: a single game barely moves a season average after 20+ games played**."*
**⚠ That reasoning does NOT hold in the first 20 games of a season**, and the cadence was never
revisited for October.

**Why Monday noon:** deliberately far from P2 (daily 01:00 PT) so the two cannot contend. The cron is
UTC so the local hour drifts an hour across DST — harmless, because **nothing here is
cutoff-sensitive**.

**Steps, in order (as actually built):**
1. Teams and arenas
2. Players and bio
3. Weekly as-of season tables (pt_defend, hustle, clutch, coaches, all_players)
4. Team stats, on/off, play types, tracking
5. DARKO and shot quality
6. **Defender ratings** (two-way ridge, weekly as-of) — writes Postgres
7. Static context (coach changes) — writes Postgres
8. Commit data files
9. **Certify** (`PIPE=p1`) — asserts freshness ≤ 8 days; **fails the job** if stale.
   *(Run live: correctly FAILED on defender ratings 6 days stale.)*

### ⚠ THREE THINGS P1 DROPPED IN THE REBUILD — verified 2026-09-20
| Missing | Was |
|---|---|
| **The weekly differential worker** | unwired since T3; **verified empty today**, snapshot frozen at 2026-09-03 |
| **`scrape_nba_splits.py`** | put on the weekly cycle in T7 |
| **Career totals** | put on the weekly cycle in T7 via the `mode: "weekly"` input |

*(The DvP recompute is fine — T7 placed it inside the **delta** worker, so it lives on P2's path.)*
**Splits and career totals are cumulative aggregates** — a 2025-26 snapshot gets steadily more wrong as
2026-27 runs.

### ⚠ AND THE LARGER QUESTION — does P1 load anything to Postgres?
**Only `build_defender_ratings.py` and `build_static_context.py` touch `DATABASE_URL`.** There is **no
loader step or `run_job`** for teams, players, bio, season tables, team stats, on/off, play types,
tracking, DARKO or shot quality — **all of which have writer Workers built in T1–T3.**
**Either those Workers are triggered separately (the Coworker model), or P1 refreshes committed JSON
that Postgres never sees.** **This is the top pre-season verification.**

---

## 3. P2 — OVERNIGHT HEAVY
`.github/workflows/nba-p2-overnight-heavy.yml` · **no cron yet** · concurrency
`alphadog-nba-p2-overnight` · timeout 330 min

**No cron until the season opens.** A job failing nightly against an empty schedule trains everyone to
ignore red builds. Target at season start: **daily 09:00 UTC = 01:00 PT**, after the last West-Coast
game finalises and eight hours before P3's cutoff.

**Steps, in order — and the order is load-bearing:**
1. **Daily delta ingestion** — bulk current-season refresh + per-game starters/officials
2. **Injury report (day-before filing)** — `INJURY_MODE=daily`; the availability input P2 builds from
3. **Referee assignments + per-game matchups** — BASELINE-stage factors (D1, M1), available 6–7 AM
4. **Season files, quarters, schedule**
5. **Commit mined data**
6. **DELTA GAP AUDIT** — `nba/check_delta_gaps.py`, against the SCHEDULE (or the team-log witness).
   **The one check that catches a silent hole.** Fails on missing dates, missing games, half-captured
   games, or a truncated-roster RATE above 0.5%.
7. **GRADE last night's board** — **must precede the calibration refit**, or yesterday's evidence is
   invisible to today's cells
8. **Market spreads and totals** — blowout and matchup run on the real market line
9. **Build baseline ladder, PER PROP PAIR** (8 pairs, ~8 min each). Calling the builder once would
   silently produce only the default pair.
10. **Components → combos → periods.** Combos need `BT_SAVE_COMPONENTS=1` singles pickled FIRST.
11. **MERGE the per-pair artefacts** into `nba_baseline_ladder_<asof>.json`
12. **COMMIT the merged ladder** — the loader fetches over HTTP from the repo, so an uncommitted
    ladder is invisible and the load 404s
13. **Load into Postgres** — the loader **refuses a singles-only slate**
14. **As-of ladder calibration** — refit on everything graded strictly before today
15. **Blowout model refit** · 16. **Confidence deduction refit**
17. **Certify** (`PIPE=p2`) — today's baseline exists, ≥25 props, zero invalid probabilities

**Replay:** `asof` + `skip_mining=true` reruns the calculation path on any past date.

---

## 4. P3 — AFTERNOON LIGHT
`.github/workflows/nba-p3-afternoon-light.yml` · **no cron yet** · concurrency
`alphadog-nba-p3-afternoon` · timeout 120 min

**Target cron at season start:** `15 21 * * *` = 1:15 PM PST (2:15 PDT, still 105 min before the
earliest 4 PM PT tip).

**It refuses to run for TODAY before 13:00 PT** — Pacific clubs may not have filed.

**P3 IS BOARD-SCOPED.** It scores every leg the apps actually OFFER — all prop lines, every rung the
app exposes, both directions, goblins/standards/demons — **not** the internal ±10 ladder for rungs
nobody offers.

**Why it must not rebuild:** an earlier version rebuilt all 8 pairs and **ran 35+ minutes without
finishing** — disqualifying. The cost is REFITTING the recipe over three seasons, and **that refit uses
only games strictly before today, so it is identical at 1 AM and 1:15 PM.** What genuinely changes is
availability, and only for the affected teams.

**Steps, in order:**
1. **Resolve slate date; assert the cutoff has passed**
2. **Day-of injury report** — the binding input
3. **Boards** — PrizePicks (own NBA producer, `league_id=7`), Underdog, Sleeper, Fliff.
   Each in its own step; `SLEEPER_SPORTS=nba` and `SLEEPER_OUT_DIR=boards` are mandatory
4. **Archive into Postgres** — **`ARCHIVE_LABEL=window`**, never the `routine` default
5. **Board tiers** — goblin/standard/demon with the anchor
6. **Market snapshot + rung market**
7. **Commit day-of data**
8. **Availability delta** — `DELTA_FROM=baseline`, `DELTA_TO=phase1`
9. **Score the board** — HP from P2's ladder at the exact rung, off-ladder rungs interpolated in
   log-odds and **flagged** (−4 confidence), delta applied, as-of calibration, confidence, score, edge
10. **Certify** (`PIPE=p3`) — legs scored, confidence non-null, score in 0–100, board captured

**NO lineup scrape** (A5 closed). **NO scenario precompute.** **NO freshness gate.**

---

## 5. THE CALCULATION CHAIN

```
baseline HP  →  availability delta  →  as-of calibration  →  final HP
                                                                 ↓
                                              confidence (measured deductions)
                                                                 ↓
                                        score 0–100  +  edge (own column)
```

**Confidence** starts at 99 and deducts for named deficiencies, weights MEASURED from realised-gap
separation. Role carries the most (fringe players miss by 0.0283 vs iron-men at 0.0008).

**Score** pivots around a **0.85 confidence neutral**: above it the score lifts toward 100 by up to
half the remaining headroom; below it, down by up to 35%. **Verified**: 0.478 HP / 0.949 conf → 65.06,
and 0.434 HP / 0.952 conf **outranks** 0.468 HP / 0.884 conf.

---

## 6. FAILURE POLICY

**No `|| echo failed` anywhere.** That pattern left 44% of a slate missing while the job reported green.

Three safeguards, each answering a failure this project actually had:
| Safeguard | Answers |
|---|---|
| **Delta gap audit** | a silent hole corrupts every as-of value computed after it |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |

---

## 7. VERIFICATION STATUS *(2026-09-20)*

| Pipeline | Verified |
|---|---|
| **P1** | Certifier run live — correctly FAILED on stale defender ratings. **⚠ Three steps dropped; loader question open (§2).** |
| **P2** | Gap audit proven on all of 2024-25 (0 missing dates/games/half-captured; 2 truncated flagged). Full run pending. **`scrape_nba_per_game_delta.py` confirmed present.** |
| **P3** | **Full chain proven on 2025-11-29** — Klay Thompson flips OUT after P2 → 3,446 teammate overrides at ~1.3 pp → his 828 legs zeroed → 58,395 legs scored → **his Overs 0.0122, Unders 0.9834** |

### The production contract the pipelines implement
From `nba_config.classification_config.production_baseline_ladder`:
- **Builder**: a **patcher** over `classification_ladder_v12.py` — *"single source of truth; anchors
  assert"*
- **Slate**: schedule games on ASOF (`status != final`; replay allows final) × **each team's roster
  from its last 3 games** — not from `nba_ref.players`, which sidesteps the new-player lag
- **`asof_lag: 0 days`** — daily-exact walk-forward; **Platt fit on the season's prior months**
- **Validated**: replay 2026-03-15 — 7 games, 194 roster rows, **173 projected players, 4,498 rows**;
  **43 roster players were DNP — "enrichment removes"**

### The pipeline-level safeguards, and the failure each answers
| Safeguard | Answers |
|---|---|
| **Delta gap audit** (P2) | a silent hole corrupts every as-of value computed after it |
| **Pre-flight completeness check** (delta worker) | *"halt and warn, don't silently proceed on an incomplete night"* |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |
| **Anchor assertions in the patcher** | a drifted patch writing silently |
| **`known_empty_games`** | three permanently-empty games re-fetched every day forever |
| **`BT_CARRY`** | **October producing ZERO projections** |

**Open before opening day:** see `NBA_OPEN_ITEMS.md` — ranked, with the Postgres-loader question first.
</content>
</parameter>
<parameter name="message">docs: NBA system design - the three pipelines in detail