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

### 2c. What this means for a coworker session, concretely

- **Do not treat "high hit rate" as sufficient on its own for a fixed-line prop.** Always cross-check against the real, current per-leg multiplier for that exact prop/side/tier (see `MULTIPLIER_TABLES_MASTER.md`) before concluding a pool is genuinely +EV.
- **The tier ladder is the real, structural mechanism worth building sharper models around** — it's repeatable, has real depth, and its EV can be computed cleanly once the real per-tier multiplier curve is known (see `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` §2-3 for the anchor/switch-point derivation this session spent real, extended effort getting right — read that document in full, this is not optional).
- **A prop with no real tier ladder (fixed-threshold) should not be force-fit into tier-based analysis.** If a coworker session finds itself computing a "tier" for `stolen_bases` or `home_runs` and getting a degenerate or trivial result, that's expected — these props genuinely don't have a meaningful ladder, and that's a real structural fact, not a data gap to chase.
- **Any newly-proposed pool must state explicitly which category each prop falls into** (fixed-threshold or tiered) in its report, since the correct way to validate EV differs structurally between the two.

---

## 3. WHY THIS DOCUMENT EXISTS NOW

This distinction was debated at real length earlier in this session's history and is easy to re-lose without being told directly. A 2026-08-22 coworker research pass correctly re-derived that the locked Goblin pool (leaning on fixed-threshold props) tests negative under the real per-leg discount — a real, valid, independent finding — but without this document, a future session could mistake that for a contradiction of the original "fixed lines are the strongest legs on the board" finding, when both are true statements about different things (hit rate vs. real priced ROI). Read this document alongside `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` before drawing any conclusion about why a pool tests the way it does.
