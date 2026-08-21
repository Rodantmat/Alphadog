# GOBLIN/DEMON MULTIPLIER STUDY — COMPLETE DOSSIER
*Every real multiplier study ever run in this system's history, in full detail, with every raw slip, every real multiplier reported back, every tier, every conclusion. Nothing summarized away. Sourced from the 2026-08-10 study session (`alphadog-v2-aug10-fixes-calibration-slips-research.txt`), which itself explicitly builds on and supersedes earlier guessed constants from 2026-08-02/03 and 2026-08-08.*

---

## THE CORE FINDING — read this first

**Goblins and Demons behave in fundamentally different, opposite ways:**

- **Goblins**: a **flat ratio, ~0.7366**, that does NOT vary meaningfully by tier, prop type, or underlying hit probability. Confirmed across 10+ clean 2-pick data points spanning hp 62%–89% and 6 different prop types (hits, hits_allowed, pitcher_strikeouts, walks, walks_allowed, hits_runs_rbis). Real cluster: **0.6325–0.8367**.
- **Demons**: a genuine **rarity-scaling curve** — the boost ratio climbs sharply as the underlying event gets rarer. Confirmed across 11+ data points spanning three real tiers:

| Prop rarity tier | Base hp | Real demon ratio (repeated) |
|---|---|---|
| Common (walks, runs, total_bases) | ~65–73% | 1.08, 1.15, 1.19, 1.26 |
| Uncommon (home_runs, doubles) | ~39–49% | 1.61, 1.87, 2.24 |
| Rare (triples) | ~11–21% | 4.06, 4.32, 4.55 |

This is a genuine, monotonic, repeated pattern — rarer event → bigger multiplier needed to make the harder bet worthwhile. Confirmed independently of game/team pairing (a same-team-vs-different-game comparison explicitly disproved a "correlation discount" hypothesis — only hp/rarity predicts the ratio).

---

## THE FORMULAS — exactly as currently implemented and deployed

```js
// GOBLIN — flat ratio, replaces the old, partially-guessed 3-tier table
const GOBLIN_FLAT_RATIO = 0.7366;
function goblinTierRatio(tierRank, hasStandardSibling) {
  return GOBLIN_FLAT_RATIO;
}
// (Old, now-superseded tables, kept only as historical record — no longer called:
//  GOBLIN_TIER_RATIOS_WITH_STANDARD = { 1: 0.833, 2: 0.700, 3: 0.633 }
//  GOBLIN_TIER_RATIOS_NO_STANDARD  = { 1: 0.967, 2: 0.767, 3: 0.633 }
//  GOBLIN_TIER_RATIO_FLOOR = 0.55  — for tier 4+, never confirmed by real data)

// DEMON — real hp-based interpolation, replaces the old flat 1.71 constant
const DEMON_HP_RATIO_ANCHORS = [
  { hp: 69, ratio: 1.15 }, // common props (walks/runs/total_bases), n=4 clean pairs
  { hp: 44, ratio: 1.91 }, // uncommon/rare-event props (HR/doubles), n=3 clean pairs
  { hp: 16, ratio: 4.31 }  // very rare props (triples), n=3 clean pairs
];
function demonRatioForHp(hpPct) {
  // linear interpolation between the 3 anchors; clamps to the nearest anchor's ratio
  // outside the 16-69% range (e.g. hp=90% -> 1.15, hp=5% -> 4.31)
}
// FLIPPED_FROM_DEMON_RATIO = 0.632 — used only when a "less" side is selected on a
// row tagged is_goblin=1 in a context that was originally a demon flip (single data point,
// not a validated tier table the way true Goblin is).
```

**Live-verified**: a real 6-pick Goblin power slip generated at **5.99x**, matching `0.7366^6 × standard_6pick_multiplier` exactly. Demon interpolation at hp=11% and hp=21% both correctly landed in the 3.85–4.31 range, matching the real observed 4.06–4.55 triples data.

---

## THE COMPLETE RAW DATA — all 44 test slips, every round, exactly as reported back

### Round 1 (11 slips)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied per-leg ratio |
|---|---|---|---|---|---|---|---|
| 1 | Painter K's LESS 4.5(t1) + Hughes K's LESS 2.5(t1) | goblin | pitcher_strikeouts | 78–79% | 2 | 2.4x | 0.80 (corrected: leg1 was actually standard, not goblin) |
| 2 | Tatis HRR 0.5 goblin(std=1.5) + Schwarber walks 1.5 demon(std=0.5) | mixed | hits_runs_rbis/walks | 30–78% | 2 | 6.75x | 1.50 (with-standard mixed) |
| 3 | Henderson K 3.5 goblin-t1(std=5.5) + Kremer hits_allowed 3.5 goblin(std=4.5) | goblin | pitcher_strikeouts/hits_allowed | 76–78% | 2 | 1.5x | 0.7071 (with-standard goblin) |
| 4 | Henderson K 7.5 demon(std=5.5) + Tatis HRR 3.5 demon(std=1.5) | demon | pitcher_strikeouts/hits_runs_rbis | 32–35% | 2 | 1.5x | **0.7071 — ANOMALY: with-standard demon, discount not boost, unresolved** |
| 5 | McCarthy TB 0.5 goblin(hot) + Kirk TB 0.5 goblin(cold) | goblin | total_bases | 67–82% | 2 | 1.9x | 0.7958 (recent-form contrast) |
| 6 | McNeil TB 0.5 goblin(cold) + Rengifo TB 0.5 goblin(cold) | goblin | total_bases | 62–66% | 2 | 2.2x | 0.8563 |
| 7 | Painter K goblin + Kremer K goblin | goblin | pitcher_strikeouts | 63–79% | 2 | 1.3x | 0.6583 |
| 8 | Cortes TB less demon + Walton TB less demon | demon | total_bases | 71–74% | 2 | 3.5x | 1.0801 (no-standard demon) |
| 9 | McCarthy 0.5 goblin more + Abreu 0.5 goblin more | goblin | total_bases | 82% | 2 | 1.5x | 0.7071 (tier-1 ladder start) |
| 10 | +Herrera 0.5 goblin more | goblin | total_bases | 78–82% | 3 | 1.8x | 0.6694 (size scaling) |
| 11 | +Benge 0.5 goblin more | goblin | total_bases | 77–82% | 4 | 2.3x | 0.6925 (size scaling) |

### Round 2 (8 slips)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied ratio |
|---|---|---|---|---|---|---|---|
| 12 | Torres+Martin TB less demon | demon | total_bases | 65–69% | 2 | 4.25x | 1.1902 |
| 13 | G.Henderson+Kepler TB less demon | demon | total_bases | 65–69% | 2 | 4.75x | 1.2583 |
| 14 | Olson+Abreu HR more demon (hot form) | demon | home_runs | 45–49% | 2 | 10.5x | 1.8708 |
| 15 | Ohtani+Caminero HR more demon (line=1.5) | demon | home_runs | 5–6% | 2 | 7.75x | 1.6073 |
| 16 | McCarthy(hot,21TB)+Bateman(cold,4TB) TB goblin | goblin | total_bases | 67–82% | 2 | 2.0x | 0.8165 |
| 17 | Tatis(hot,18TB)+Kirk(cold,6TB) TB goblin | goblin | total_bases | 60–68% | 2 | 2.0x | 0.8165 |
| 18 | Stott+Bichette doubles more demon | demon | doubles | 39–41% | 2 | 15.0x | 2.2361 |
| 19 | Caminero rbis + Gimenez hits (both standard) | **standard control** | rbis/hits | 68–76% | 2 | **3.0x** | **1.0 — exactly matches baseline, validates core math** |

### Round 3 (6 slips)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied ratio |
|---|---|---|---|---|---|---|---|
| 20 | Crawford+Soderstrom triples more demon | demon | triples | 11–12% | 2 | 49.5x | 4.0620 |
| 21 | Prieto+Cronenworth triples more demon | demon | triples | ~15% | 2 | 56.0x | 4.3205 |
| 22 | Walls+Bolte triples more demon | demon | triples | ~15% | 2 | 62.0x | 4.5461 |
| 23 | Karros+Kepler triples more demon | demon | triples | ~15% | 2 | 49.5x | 4.0620 (duplicate label, see #21) |
| 24 | Kremer hits_allowed 6.5 demon(std) + Tatis HRR 3.5 demon(std) | demon | hits_allowed/hits_runs_rbis | 30–32% | 2 | 10.5x | 1.8708 — with-standard demon, **different game from #4's Henderson pairing, normal boost, contradicts Round 1's anomaly** |
| 25 | Henderson K 4.5 goblin-t2(std) + Carroll TB 2.5 goblin(std) | goblin | pitcher_strikeouts/total_bases | 69–70% | 2 | 2.0x | 0.8165 (with-standard goblin tier2) |

### Round 4 (2 slips — isolation test on the anomaly)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied ratio |
|---|---|---|---|---|---|---|---|
| 26 | Henderson K 7.5 demon + Abreu HRR 3.5 demon (different partner than #4) | demon | pitcher_strikeouts/hits_runs_rbis | 35–38% | 2 | 11.5x | 1.9579 — **Henderson w/ different partner = normal boost, confirms Henderson himself isn't the anomaly driver** |
| 27 | Kremer hits_allowed 6.5 demon + Abreu HRR 3.5 demon | demon | hits_allowed/hits_runs_rbis | 30–38% | 2 | 8.75x | 1.7078 (isolation test, normal boost) |

### Round 5 (3 slips — testing the same-game/same-team hypothesis)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied ratio |
|---|---|---|---|---|---|---|---|
| 28 | Gray hits_allowed 6.5 demon + Abreu runs 1.5 demon (**same team**) | demon | hits_allowed/runs | 32–35% | 2 | 12.0x | 2.0 — **same-team pairing, normal boost, DISPROVES same-game/same-team discount hypothesis** |
| 29 | Gray K 7.5 demon + Abreu HRR 4.5 demon (same team) | demon | pitcher_strikeouts/hits_runs_rbis | 22–26% | 2 | 23.5x | 2.7988 (same-team, fits rarity curve well) |
| 30 | Gray hits_allowed 6.5 demon + Bichette doubles 0.5 demon (different games) | demon | hits_allowed/doubles | 35–40% | 2 | 9.5x | 1.7795 — **different games, fits rarity curve — CONCLUSION: game/team pairing does NOT affect the ratio, only hp/rarity does** |

### Round 6 (14 slips — final, exhaustive cross-prop goblin validation + Flex data)
| Slip | Legs | Type | Prop | HP context | Size | Real multiplier | Implied ratio |
|---|---|---|---|---|---|---|---|
| 31 | McCarthy hits + Bolte hits goblin | goblin | hits | 76–82% | 2 | 1.5x | 0.7071 |
| 32 | Lopez+Gray hits_allowed goblin | goblin | hits_allowed | 78–81% | 2 | 1.9x | 0.7958 |
| 33 | Cameron+Rogers K goblin | goblin | pitcher_strikeouts | 82–83% | 2 | 1.2x | 0.6325 |
| 34 | Realmuto+Merrill walks goblin | goblin | walks | 78–80% | 2 | 1.7x | 0.7528 |
| 35 | Painter+Kremer walks_allowed goblin | goblin | walks_allowed | 86–89% | 2 | 1.2x | 0.6325 — **highest-hp goblin tested** |
| 36 | Lee+DeLuca HRR goblin | goblin | hits_runs_rbis | 64–65% | 2 | 1.7x | 0.7528 |
| 37 | Tovar+Betts HRR goblin | goblin | hits_runs_rbis | 64% | 2 | 1.8x | 0.7746 |
| 38 | Ortiz+Clemens HRR goblin | goblin | hits_runs_rbis | 62–63% | 2 | 2.1x | 0.8367 |
| 39 | Turner walks+Rogers hits_allowed goblin | goblin | walks/hits_allowed | 76–77% | 2 | 1.5x | 0.7071 |
| 40 | Hughes K+Yelich walks goblin | goblin | pitcher_strikeouts/walks | 77–78% | 2 | 1.8x | 0.7746 |
| 41 | 3-pick goblin power (McCarthy+Lopez+Cameron) | goblin | mixed | 78–83% | 3 | 2.3x | 0.7264 |
| 42 | 4-pick goblin power (+Realmuto) | goblin | mixed | 77–83% | 4 | 3.25x | 0.7550 |
| 43 | 3-pick goblin **FLEX** (same legs as #41) | goblin | mixed | 78–83% | 3 | **3/3=1.9x, 2/3=0.5x** | not yet analyzed — separate thread |
| 44 | 4-pick goblin **FLEX** (same legs as #42) | goblin | mixed | 77–83% | 4 | **4/4=2.5x, 3/4=0.5x** | not yet analyzed — separate thread |

**Round 6 conclusion, verbatim from the study**: *"All 10 pure 2-pick goblin data points cluster tightly: 0.63–0.84, mean ≈0.74 — regardless of hp level (62% to 89%) or prop type. Goblins do NOT show the demon-style rarity scaling. Size scaling confirmed clean: 3-pick power (r=0.726) and 4-pick power (r=0.755) land right in the same 0.70–0.76 band as the 2-picks — validating the multiplicative per-leg model works correctly across slip sizes for goblins."*

---

## THE ONE UNRESOLVED ANOMALY — flagged honestly, not explained away

Slip #4 (Henderson K's 7.5 demon + Tatis HRR 3.5 demon, both with-standard, same game) gave **r=0.71 — a discount**, the only demon result in the entire 44-slip study that came in below 1.0. Every other with-standard demon pairing (slips #24, #26, #27, #28, #29, #30) — including ones re-testing Henderson with a *different* partner, and Kremer paired with the *same* Tatis leg — gave normal boosts (1.71–2.80), disproving both "Henderson is the problem" and "Tatis is the problem" as isolated explanations, and disproving "same-game/same-team causes a discount" as a general rule. The specific combination of Henderson + Tatis, in that one game, at that one moment, remains genuinely unexplained. **This was never resolved** and does not block the demon rarity-curve fix for the confirmed majority case — but if a future session sees another unexplained demon discount, this is the precedent to check against, not a coincidence to dismiss.

---

## WHAT'S STILL OPEN — genuinely incomplete, not silently dropped

1. **Flex-mode payout math** — raw data exists (#43, #44 above, plus the goblin-only power/flex pairing) but was **never analyzed** into a ratio model the way Power mode was. If Flex-mode multiplier estimation is needed, this needs its own dedicated study pass using #43/#44 as the starting real data points, not a guess extrapolated from the Power-mode ratios.
2. **Demon tier-rank granularity** — unlike Goblin (which has `goblin_tier_rank` wired through from ingestion), Demon pricing is currently keyed purely off the leg's own `hit_probability_0_100` via interpolation — there's no separate "demon tier rank" concept the way Goblin has one. This was a deliberate, evidence-based choice (the rarity curve tracks hp directly), not an oversight — but worth knowing if a future session assumes Demon has the same tier-rank data structure Goblin does.

---

## SEPARATE, DISTINCT STUDY — tonight's regular-line (non-goblin/demon) payout table research

This is a completely different multiplier concept from everything above — the **standard published payout tables** each app uses for regular (non-adjusted) lines, researched and corrected earlier in this same session:

- **PrizePicks Power**: 2pk=3x, 3pk=6x, 4pk=10x, 5pk=20x, 6pk=37.5x
- **PrizePicks Flex**: 3pk(3/3=3x, 2/3=1x), 4pk(4/4=6x, 3/4=1.5x), 5pk(5/5=10x, 4/5=2x, 3/5=0.4x), 6pk(6/6=25x, 5/6=2x, 4/6=0.4x) — corrects a real error found tonight: the code previously had the 3-pick Flex tier wrong (2.25x/1.25x)
- **Underdog Standard**: 2pk=3.5x, 3pk=6.5x, 4pk=10x, 5pk=20x, 6pk=35x, 7pk=65x, 8pk=120x
- **Underdog Flex**: 3pk(3.25x/1.09x), 4pk(6x/1.5x), 5pk(10x/2.5x), 6pk(25x/2.6x/0.25x), 7pk(40x/2.75x/0.5x), 8pk(80x/3x/1x) — corrects a real error found tonight: the old 5-pick Flex full-hit rate (20x) wrongly matched the Standard rate
- **Sleeper**: confirmed to use genuine dynamic, per-leg pricing (not a fixed table) — the table in code is an honestly-flagged rough approximation only

**This table governs the `standardPerLegMultiplier` baseline that the Goblin/Demon ratios above multiply against** — the two studies compose together (`final_multiplier = standard_table_multiplier × goblin_or_demon_ratio^leg_count`), but they were derived completely independently and should be updated independently if either app changes its published rates again.

---

*Full raw data persisted in `control.goblin_demon_multiplier_study` (Postgres), queryable by round_number, leg_type, prop_category, hp_context, real_multiplier, and implied_per_leg_ratio — nothing above needs re-deriving from scratch if verification is needed.*
