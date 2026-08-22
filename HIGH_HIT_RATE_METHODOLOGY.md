# HIGH HIT RATE METHODOLOGY — The Foundational Base, and Fixed vs. Tiered Props
*This is the original, foundational selection methodology this entire system is built on. Every one of the five locked tracks (Goblin, Regular, Demon, Sleeper, Underdog) is a direct descendant of this approach. A coworker session that doesn't understand this is working from the wrong mental model, regardless of how sophisticated its later analysis is.*

---

## 1. THE CORE METHOD — how "good legs" are actually found

The entire system's selection logic is NOT "trust the platform's own displayed hit probability." It is: **build a real, historical, per-(prop, side, line-or-tier) hit-rate table from actual graded outcomes, then select legs from the real buckets that clear a real sample-size and hit-rate bar** — independent of whatever the platform's own internal `estimated_hit_probability_0_100` score says.

**The original real bar, as first established** (2026-08-17): a bucket qualifies once it has **n≥30 real graded observations** and a **real hit rate in the 80%+ range** (the target was explicitly "9 or 10 out of 10," i.e. as close to automatic as a real sample could support). Every prop and every line on the board was checked this way — nothing skipped, nothing assumed. This produced the original **15-line qualifying pool**, averaging ~84.6% real hit rate, which became the direct basis for every "High Hit" slip track later built.

**This is the base layer any new signal must clear before anything else matters.** A clever cap structure or a granular multiplier table built on top of a bucket that was never actually checked against n≥30 real graded outcomes is building on sand.

---

## 2. THE CRITICAL DISTINCTION — fixed-threshold props vs. variable/tiered props

This is the single most important structural fact in the whole prop universe, and it was the source of real, extended debate this session. Get this wrong and every subsequent tier-based analysis is confused about what it's even measuring.

### 2a. Fixed-threshold props — a single line, no real ladder

Some props (`stolen_bases`, `home_runs`, `doubles`, and to a lesser extent `runs`, `walks`, `singles`, `hits` at the standard/regular level) are **rare, low-count events where only one sensible real threshold exists** — almost always `0.5`. PrizePicks typically offers **only one version of the line**, tagged Goblin (since going "under" a rare event is the easy/safe side). There is no real tier ladder here — no multiple simultaneous lines, no meaningful "distance from anchor" concept, because there's structurally only one line being offered.

**Original real finding (2026-08-17)**: these fixed-threshold Goblin-only props were, by hit rate, **genuinely the strongest legs on the entire board**:

| Line | Real n | Real hit rate |
|---|---|---|
| `stolen_bases/less/0.5` | 75 | 88.0% |
| `walks_allowed/more/0.5` | 171 | 88.3% |
| `home_runs/less/0.5` | 270 | 84.8% |
| `doubles/less/0.5` | 596 | 84.1% |

**But this measured hit rate against the PUBLISHED payout table** — real per-leg pricing hadn't been discovered yet at that point in the session. Much later, this same session discovered a real, live per-leg Goblin discount (~0.62, and independently re-measured as decaying further over time — see `MULTIPLIER_TABLES_MASTER.md`). Once that real discount is correctly applied, a fixed-line-heavy pool's actual ROI can be dramatically lower than its hit rate alone would suggest, precisely because PrizePicks appears to price these "easy," high-hit-rate legs with an especially aggressive real haircut. **A coworker session that re-confirms "the locked Goblin pool tests negative under the real 0.62 ratio despite decent hit rates" is not contradicting the original finding — it's the same real legs, correctly priced for the first time.** Both facts are true and not in tension: fixed-line props have excellent real hit rates; they do NOT automatically have excellent real ROI once real per-leg pricing is applied. Treat hit-rate-only conclusions about fixed-line props as incomplete until cross-checked against the real, current per-leg multiplier.

### 2b. Variable-threshold props — a real ladder, and hit rate genuinely scales with tier depth

Other props (`hits_runs_rbis`, `pitcher_strikeouts`, `total_bases`, `pitcher_fantasy_score`, `earned_runs`, `hits_allowed`) routinely have **multiple simultaneous real lines** offered around a real anchor — this is the genuine Goblin/Demon **tier ladder** (see `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` for the exact mechanism, anchor derivation, and the historical parsing difficulty this session had getting it right). For these props, **real hit rate climbs meaningfully and repeatably as tier depth increases** — confirmed originally across every variable-threshold prop on the board:

| Prop / Side | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| `hits_runs_rbis/less` | 68.1% (n=163) | 84.1% (n=132) | 90.0% (n=40) |
| `pitcher_strikeouts/less` | 71.6% (n=74) | 76.9% (n=52) | 80.0% (n=10) |
| `pitcher_strikeouts/more` | 67.3% (n=49) | 79.1% (n=43) | 93.3% (n=15) |
| `total_bases/less` | 62.8% (n=43) | 74.2% (n=31) | 83.3% (n=12) |

**This is the mechanism that should be the primary object of understanding**, not fixed-line testing. Real, repeatable structure — the farther from anchor for Goblin, the safer (and, separately, the lower the real per-leg payout — see the mechanism doc). The original session found the genuinely usable "sweet spot" is **not the theoretical deepest tier** (those are almost always n=1-2, one-off, unreliable) but **the deepest tier that still carries real volume (n≥10-20)** — `pitcher_strikeouts` tier 3 and `hits_runs_rbis` tier 3 were the two found to be both deep AND reliably volumed.

### 2c. Real classification corrections (found by a coworker research pass, 2026-08-22, verified against real line-count data)

The fixed/tiered split above was built from an earlier, smaller sample. A later session checked it empirically (real lines-per-player-day counts) and found three real refinements:
- **`hits`** is borderline-tiered, not fixed as grouped above — real 1.37 lines/player-day, only 64.8% single-line days.
- **`walks_allowed`** is genuinely tiered (real 2.36 lines/player-day, max 4), despite its `/0.5` line appearing in the fixed-line table above — that line is a ladder rung, not a standalone fixed threshold. This is a pitcher prop, and pitcher props on this board tend to carry real ladders more often than hitter props do.
- **`rbis`** is fixed (real 1.10 lines/player-day) but was never classified in this document — it sits in both the Underdog locked pool and a Sleeper candidate pool, so its classification matters.

### 2d. What this means for a coworker session, concretely

- **Do not treat "high hit rate" as sufficient on its own for a fixed-line prop.** Always cross-check against the real, current per-leg multiplier for that exact prop/side/tier (see `MULTIPLIER_TABLES_MASTER.md`) before concluding a pool is genuinely +EV.
- **The tier ladder is the real, structural mechanism worth building sharper models around** — it's repeatable, has real depth, and its EV can be computed cleanly once the real per-tier multiplier curve is known (see `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §2-3 for the anchor/switch-point derivation this session spent real, extended effort getting right — read that document in full, this is not optional).
- **A prop with no real tier ladder (fixed-threshold) should not be force-fit into tier-based analysis.** If a coworker session finds itself computing a "tier" for `stolen_bases` or `home_runs` and getting a degenerate or trivial result, that's expected — these props genuinely don't have a meaningful ladder, and that's a real structural fact, not a data gap to chase.
- **Any newly-proposed pool must state explicitly which category each prop falls into** (fixed-threshold or tiered), verified empirically against real line-count data rather than assumed from this document — this document has already been wrong twice (see §2c), so treat its classifications as a starting point to check, not a final answer.

---

## 3. THE DOMINANT EV AXIS IS THE LANE, NOT THE CLASS — the real reconciliation

**This is the single most important structural finding this document contains, discovered by a coworker research pass 2026-08-22 and independently verified.** Whether a leg is offered in the **Standard lane** (no discount — real per-leg at 6-pick is `37.5^(1/6) ≈ 1.83`) versus the **Goblin lane** (real ~0.62 discount, per-leg 1.116-1.265) matters far more to real EV than whether the underlying prop is fixed-threshold or tiered.

**The exact real example that makes this concrete**: `doubles/less/0.5` — the identical leg, identical ~85% real hit rate, identical prop — prices at **+1298.7% in the Standard lane and −13.0% in the Goblin lane**, a swing of over 1,300 percentage points from lane alone. Verified independently: `37.5^(1/6) ≈ 1.830`; at 85% hit rate over 6 picks, Standard-lane ROI computes to roughly +1300%, Goblin-lane ROI (per-leg ~1.15) to roughly −13%. The two documented, seemingly-contradictory 2026-08-17 and 2026-08-22 findings about fixed-line props were **both correct** — one measured the Standard lane (implicitly, via the published table), the other measured the real Goblin lane. Neither the hit rate nor the fixed/tiered class changed the sign; the lane did.

**This also explains the session-1 "rare-event pool" finding (+1245.7%)**: those legs were priced in the Standard lane, not Goblin — the same underlying legs tested Goblin-lane are structurally different in EV.

**Practical consequence — two new standing rules**:
- **Rule B0**: build real per-(prop, side, line) buckets from actual graded outcomes at n≥30 as described in §1 — do NOT rank or select legs by the platform's internal `score_0_100` or `estimated_hit_probability_0_100`. A 2026-08-22 session found its own prior Goblin work had done exactly this, re-ran it properly, and found real, priced-positive buckets it had missed as a direct result.
- **Rule B0a**: every proposed pool must label each prop's real **class** (fixed-threshold or tiered, verified empirically per §2c) **and** its real **lane** (Standard, Goblin, or Demon) — lane is not optional context, it is the dominant driver of real EV and must be stated explicitly for every pool in every report.

**Open, high-priority item this finding creates**: the top Standard-lane buckets implied by this analysis have not yet had real slip construction or leave-one-day-out testing run against them — they are an implied EV ranking, not yet a validated backtest. This is the current #1 open item.

---

## 3. WHY THIS DOCUMENT EXISTS NOW

This distinction was debated at real length earlier in this session's history and is easy to re-lose without being told directly. A 2026-08-22 coworker research pass correctly re-derived that the locked Goblin pool (leaning on fixed-threshold props) tests negative under the real per-leg discount — a real, valid, independent finding — but without this document, a future session could mistake that for a contradiction of the original "fixed lines are the strongest legs on the board" finding, when both are true statements about different things (hit rate vs. real priced ROI). Read this document alongside `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` before drawing any conclusion about why a pool tests the way it does.
