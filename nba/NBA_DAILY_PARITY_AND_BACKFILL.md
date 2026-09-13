# NBA — Daily Parity and Day-by-Day Backfill Requirement

**Owner directive, 2026-09-11.** Binding on every factor, the baseline, the enrichment layer and the
scoring engine.

---

## 1. The rule

> Every daily factor must be backfilled **day by day**, producing exactly the object the live pipeline
> would have produced on that day, from only the information available at that day's cutoff.
> This applies to the baseline and to the enrichment layer equally.
> Without it there is no realistic back data — a backtest built on anything else is measuring a world
> that will never exist at 2:45 PM PT.

This is the parity rule from `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` §8, extended and made explicit:
it is not enough that a factor *exists* for a past date. It must have been **constructed the same way,
at the same cutoff, with the same inputs and the same fallbacks** as the live run.

### What that forbids
- Building a factor once over a whole season and slicing it per date (season aggregates leak the future).
- Using any end-of-season table, final roster, or post-game truth as an input to a past day.
- Using data that exists today but was not published before that day's cutoff.
- Filling a gap with a later value "because the value barely changes".

### What it requires
- One value per (factor, entity, **date**), produced by the same code path as production.
- The cutoff recorded with it, so it can be audited.
- Where the live pipeline would fall back (missing report, thin sample), the backfill falls back the
  same way — a backfill that is *more* complete than production is as wrong as one that is less.

---

## 2. Why the scoring engine depends on it

The engine consumes enrichment and produces, per leg: **hit probability → score → confidence**, then a
**final board**. Every one of those is only meaningful if the inputs on a replayed day are what the
inputs would have been live. A single factor that quietly used future information inflates the
backtest, and the inflation is invisible — the numbers look better, not broken.

So: **no factor is "done" until its day-by-day backfill exists and matches the live construction.**

---

## 3. Two classes of daily factor

**(a) Observed-and-archived** — the value for a past day can be reconstructed from an archive that was
published at the time. These are backfillable now.

**(b) Live-only** — the value was never archived and only exists going forward (e.g. game-day referee
assignments, which are posted hours before tip and not retained). For these the honest options are:
1. build the live capture now so the archive starts accumulating, and
2. either exclude the factor from historical training, or use a **clearly labelled proxy** that is
   itself as-of correct (e.g. officials from the box score are post-hoc truth — usable as the *target*
   of a prediction, never as an input to a past day).

Mixing (b) into training as if it were (a) is exactly the leak this document exists to prevent.

---

## 4. Factor inventory and day-by-day status

| Factor | Class | Day-by-day backfill | Notes |
|---|---|---|---|
| A1/N1/N2 injury status, A6 late scratch, A9 suspension | a | ✅ | Injury-report PDFs archived per publish timestamp; 2024-25 (174 days) + 2025-26 (176 days). **2023-24 unavailable** — day-of-report factors can only be fitted on two seasons |
| A2 teammate redistribution | a | ✅ | derived from the as-of OUT list |
| A3 return ramp | a | ✅ | measured; in baseline v30 |
| A4 rest / B2B | a | ✅ | from the schedule |
| A5 lineup change | ⚠️ | **CLOSED — REJECTED** | Tested 2026-09-13: a derived as-of proxy is REDUNDANT (negative on every prop; the allocator's recent-5 minutes already encode starting continuously). No projected lineups needed → **no leak to mitigate** |
| A7 trade window, A8 rookie/two-way | a | ✅ | transaction logs |
| B1/B2 spread & total, C3 line movement | a | ✅ | two snapshots per game, both seasons |
| B3 leverage, B4 opponent | a | ✅ | |
| C1/C2 book vs pick'em gap | a | ✅ | `nba_market.rung_market`, 1.06M priced rungs at the DFS lines |
| D1 referee crew | **b** | ❌ | assignments are game-day and not archived. Box-score officials are post-hoc. Build the live scraper; historical use is target-only |
| D2 schedule / travel | a | ✅ | |
| K1 coach rotation | a | ✅ | 8 verified in-season changes with effective dates (`nba_coach_changes_backfill.json`) |
| M1 primary defender quality | a | ⚠️ | measured (−5.5% toughest quintile → +6.7% easiest, elasticity 0.39) but **not yet integrated into the harness** |
| M2 scheme, M3 hustle, M4 clutch | a | ✅ | weekly as-of snapshots, strictly before the game date |
| All-Star / All-NBA status | — | **BLOCKED** | owner directive: volatile, and selection status leaks backwards |
| National TV | — | **NOT MINED** | owner directive: treat as a regular game |

---

## 5. Baseline parity

The baseline already satisfies this by construction (COMPASS facts 5, 6, 16): one fixed recipe, every
value recomputed in-run from history as of that day, nothing pasted. A single day's run is inherently
sharp because tier cutpoints, Platt scaling, dispersion, factor betas and phase ratios are all refit
from data available up to that date.

What must stay true as the baseline changes:
- `BT_ASOF` drives everything; no constant is carried between days.
- The ladder depth is a build parameter (`BT_LADDER_STEPS`, now 10), applied identically in the singles
  recipe and the combos recipe — they are **separate certified files** and each has its own constant.
- The artifact must contain singles **and** combos; the loader refuses a singles-only slate.

---

## 6. Open work created by this directive

1. ~~**A5 projected lineups**~~ — **CLOSED 2026-09-13: REJECTED AS REDUNDANT.** The proxy was built
   (last game's starters minus those ruled out, plus the highest as-of-minutes replacement) and tested
   held-out: negative on every prop (points −0.032, rebounds −0.008, assists −0.008, pra −0.035 MAE).
   The allocator already uses recent-5 minutes, which encodes starting status *continuously and with
   magnitude*; a binary starter flag discards that magnitude. **The leak risk dissolves rather than
   needing mitigation — we do not need projected lineups, so there is nothing to leak.**
2. **D1 referee assignments** — build the live daily capture. (Correction: assignments ARE knowable
   before the window — see §7 — so the box-score crew is a faithful historical reconstruction.)
3. **M1 integration** — fold measured defender quality into the harness as a factor layer.
   (Note: B4, the same-day opponent-availability residual, was REJECTED in both formulations — opponent
   defence is already carried by the baseline. M1 as a *baseline-stage* factor is untouched by that.)
4. **Day-by-day replay harness** — `nba/baseline/build_baseline_history.py` produces the full-season
   baseline per prop pair in one run; the enrichment equivalent walks the same dates.
5. **An audit** that, for any replayed day, can answer "what was known at the cutoff" for every factor.

---

## 7. Stage assignment by publish time (owner directive, 2026-09-11)

The final scoring pipeline runs in a **short window**: from the 2:30 PM PT day-of injury report until
the first tip. In that window it must mine the board, the daily context, the market, and run the engine.
So the rule is simple and absolute:

> **Anything knowable before 2:30 PM PT belongs in the baseline / delta pipeline (phase 1).
> The final pipeline (phase 2) handles ONLY what arrives at or after 2:30 PM PT.**

Times are Pacific. "Stage" is where the factor is COMPUTED; phase 2 may still *read* a phase-1 value.

| Factor | Source | Available (PT) | **Stage** | Phase-2 residual |
|---|---|---|---|---|
| D1 referee crew | NBA official assignments | **~6–7 AM** (published ~9–10 AM ET) | **baseline** | none — crews rarely change after posting |
| A4 rest / B2B / 3-in-4 | schedule | days ahead | **baseline** | none |
| D2 schedule / travel / time zone | schedule | days ahead | **baseline** | none |
| B3 leverage / standings | standings | prior night | **baseline** | none |
| K1 coach rotation profile | box scores + coach changes | prior night | **baseline** | none |
| M1 primary defender quality | matchup shards | prior night | **baseline** | matchup only shifts if a starter is scratched — that shift is a phase-2 *delta*, not a recompute |
| M2 scheme, M3 hustle, M4 clutch | weekly as-of tables | weekly | **baseline** | none |
| B4 opponent availability (day-before) | day-before injury report | **~2:30 PM PT the day before** | **baseline** | day-of changes only |
| A1 injury status (day-before) | day-before report | 2:30 PM PT the day before | **baseline** | day-of report at 2:30 PM |
| A2 teammate redistribution (day-before OUTs) | derived from day-before report | 2:30 PM PT the day before | **baseline** | recompute only for teams whose OUT list changed at 2:30 |
| A3 return ramp | game logs + report | prior night | **baseline** | none |
| A7 trade window, A8 rookie/two-way | transactions | prior night | **baseline** | none |
| B1/B2 spread & total (morning) | market | overnight | **baseline** (opening line) | phase-2 reads the 2:45 line for movement |
| **A1 day-of injury report** | official report | **2:30 PM PT** | **phase 2** | the trigger for everything below |
| **A6 late scratch, A9 suspension** | report / news | 2:30 PM and after | **phase 2** | |
| **A5 lineup change** | projected → confirmed | projected by 2:30; confirmed ~tip−30 | **phase 2** (projected only) | confirmed lineups arrive AFTER the window — never an input |
| **B1/B2 line movement, C3** | market at 2:45 | 2:45 PM | **phase 2** | delta vs the morning line |
| **C1/C2 book vs pick'em gap** | board + books at 2:45 | 2:45 PM | **phase 2** | |
| **Board itself** | DFS apps at 2:45 | 2:45 PM | **phase 2** | |
| All-Star / national TV | — | — | **not mined** (owner) | |

## 9. BASELINE AND ENRICHMENT ARE ONE SYSTEM (owner directive, 2026-09-13)

> The baseline and the enrichment cannot be two different things. They must agree, complement each
> other, and produce one final product. All the heavy lifting belongs in the baseline; the enrichment
> layer exists only to carry what the baseline could not have known.

**The error this corrects.** A2 absence redistribution measured well in isolation (minutes MAE 4.641
with outs vs 6.186 ignoring them) and was then applied on top of the certified baseline's projected
mean. Held out on 6,996 real PrizePicks legs:

| | log-loss | Brier |
|---|---|---|
| certified baseline alone | **0.7299** | **0.2652** |
| baseline x A2 | 1.0123 | 0.3317 |
| baseline x defender | 0.7309 | 0.2656 |

A2 made it dramatically WORSE, because **the baseline's `proj_min` already applies the injury report**
(the 2026-03-15 replay went from 173 roster players to 161 with `BT_INJURY` on). Multiplying by A2's
`min_mult` reapplies the same reallocation a second time. The same mistake appeared twice before: a
hand-built blowout shrink duplicating the recipe's `P(blowout | spread)` mixture, and a funnel rebuilt
from rolling means that was beaten by the very anchor it bypassed (0.7951 vs 0.7299).

**The rule.**
```
baseline   (phase 1, overnight, day-BEFORE report)  = everything knowable then, done properly
enrichment (phase 2/3, from 2:30 PM)                = ONLY THE DELTA vs what the baseline assumed
```
A star already ruled out overnight is priced into `proj_min`; a scratch appearing at 2:30 is not.
Enrichment applies A2 **only to players whose availability changed after the baseline's cutoff**, and
only to their team and opponent. Everything else carries the baseline's value forward untouched.

**Why the historical tests misled.** In a replay both layers read the SAME day's report, so the delta is
empty and A2 is pure duplication. To measure enrichment honestly, the baseline must be rebuilt on the
**day-before** report and the factor applied against the **day-of** report - the production
configuration. Any factor test using one report for both layers measures double-counting, not value.

**Consequences for factor work.**
1. A factor may only touch a component the baseline does NOT contain, or be expressed as a delta against
   what the baseline assumed.
2. `proj_min` and `rate36` must be EMITTED by the recipe so enrichment adjusts the right COMPONENT
   rather than multiplying the product - multiplying a mean by a minutes multiplier is not the same
   operation as adjusting minutes and re-deriving the mean.
3. The defender factor is the clean case: the baseline carries TEAM-level opponent defence, not the
   specific defender, so a player-level term is genuinely additive. It measured neutral on the anchor
   (0.7309 vs 0.7299) - which is what "no double count, small effect" looks like.

## 8. The funnel across the three processing stages (2026-09-13)

The engine is not one pass. It is three, with different deadlines and different budgets. The funnel's
links must be placed by **when their inputs become knowable**, not by convenience.

```
minutes -> team possessions -> usage share -> attempts -> shot mix -> efficiency -> points -> P(over line)
```

| Link | Input it needs | Knowable | **Stage** |
|---|---|---|---|
| `proj_min` base (role tiers, blowout mixture, coach gate) | prior-night box scores + morning spread | overnight | **1 — heavy** |
| Defender ratings (two-way ridge, 5 channels, weekly refit) | prior games | overnight | **1 — heavy** |
| Rate cells / dispersion / Platt (the certified recipe) | history as-of | overnight | **1 — heavy** |
| Factor coefficients (B2/B3/BF, usage allocation, A2 weights) | history as-of | overnight | **1 — heavy** |
| Team possessions (pace) | morning market total | ~overnight | **1**, refreshed in 2 if the line moved |
| Availability scenarios (joint per game) | 1 PM ET report (~10 AM PT) | mid-morning | **2 — scenarios** |
| Minutes + usage allocation PER SCENARIO | who is out in that branch | mid-morning | **2 — scenarios** |
| Expected defender (exposure-weighted over AVAILABLE opponents) | depends on the branch's opponent roster | mid-morning | **2 — scenarios** |
| Shot mix + efficiency adjustments | expected defender for that branch | mid-morning | **2 — scenarios** |
| Full ladder P(stat > line) per scenario | all of the above | mid-morning | **2 — scenarios** |
| Select the realised branch | 2:30 PM PT report | window | **3 — final** |
| Market adjuster + rank + slip build | 2:45 board and lines | window | **3 — final** |

### Why the expected-defender feature is stage 2, not stage 1
It is not a property of the opponent TEAM; it is exposure-weighted over the opponent players who will
actually be available. A different absence branch changes which defenders a player is exposed to, so it
has to be recomputed per scenario. The RATINGS are stage 1 (they only need prior games); the JOIN is
stage 2.

### What stage 3 must NOT do
No refitting, no re-deriving, no scanning history. It selects the precomputed branch, applies the market
adjuster, joins the board and ranks. Minutes at most. Everything expensive has already happened.

### The blowout lesson, recorded
Blowout risk is ALREADY in the baseline, and better than any patch: the recipe derives a
**P(blowout | spread) lookup** (`P_BLOWOUT_BINS` at 0/2/4/6/8/10/12/15) and role-specific blowout minutes
ratios from TRAIN, in-run, with no pasted constants (`BLOWOUT_MARGIN = 20`, `COMPETITIVE_MARGIN = 15`).
A funnel test that built its own crude deterministic spread shrink on top of a ROLLING-MEAN minutes
estimate made results WORSE - it was double-counting a cruder duplicate of a component the baseline
already models as a proper mixture. **The funnel's minutes link must consume the recipe's `proj_min`,
not reconstruct one.** Same lesson as the crude defender metric: use the system's best component, do not
rebuild a worse one beside it.

- **Phase 1 (baseline/delta, runs ~1 PM PT, can take as long as it needs)** computes every row above
  marked *baseline*, including the referee crew and the day-before injury picture, and produces the
  pre-scored board on the morning lines.
- **Phase 2 (final, 2:30 → first tip)** does exactly four things: pull the board, apply the 2:30 report
  and projected-lineup delta, read the 2:45 market, rescore **only the legs touched by those deltas**.
  Everything else carries its phase-1 value forward.

### What still has to move
The referee crew is the concrete case you asked about: it is a **morning** fact and is currently listed
under enrichment. It moves to the baseline. The same audit applies to every row above — if a factor's
source publishes before 2:30 PM PT and it is still computed in phase 2, that is a defect.

