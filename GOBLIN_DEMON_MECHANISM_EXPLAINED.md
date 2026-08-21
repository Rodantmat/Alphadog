# PRIZEPICKS GOBLIN/DEMON MECHANISM — Complete Explanation
*This is required reading before touching any PrizePicks Goblin, Demon, or Regular logic. Getting this wrong has directly caused real bugs multiple times this session.*

---

## 1. THE REAL, GROUND-TRUTH MECHANISM (confirmed via live screenshots + raw JSON)

PrizePicks sends **one raw JSON record per projection line** — never two. Each record carries:
- `line` — the numeric threshold (e.g., 7.5)
- `odds_type` — tags one side as `'goblin'`, `'demon'`, or `'standard'`. This ALWAYS refers to the **More** side of that record.
- `allowed_wager_types` — `'over'` means More-only (no Less side exists at all for this line); `'under_or_over'` means both sides are genuinely pickable.

**When both sides are pickable**: the Less side automatically gets the *complementary* tag — if More is tagged `goblin`, Less at that same line is `demon`, and vice versa. This complement assignment happens downstream in our own pipeline, not in PrizePicks' raw feed.

## 2. THE LADDER — multiple lines, one player, one prop

A single player/prop can have several real, simultaneously-offered lines (e.g., a pitcher's strikeouts at 6.5, 7.5, 8.5, 9.5, 10.5, 11.5). Two real structural patterns exist:

### Pattern A: Explicit regular line exists
One of the lines is tagged `odds_type='standard'` (both sides `is_goblin=0, is_demon=0`). This is the real anchor. Every other line's tier = `round(abs(line - anchor))`, always a positive magnitude. Direction (goblin vs demon) is independently carried by the real `is_goblin`/`is_demon` flags, not derived from the tier number.

### Pattern B: No explicit regular line ("switch point" players)
Confirmed live and repeatedly this session (Jacob Misiorowski, Emerson Hancock, Sonny Gray, Matthew Boyd, Logan Webb, Jarren Duran, Wilyer Abreu): some players have **no line tagged standard at all** — every real line in their ladder is tagged goblin or demon. The app still visually shows one specific rung as "regular-looking" (no colored icon), but this is a **switch point**, not a database-level standard tag:
- **Below the switch**: More = Goblin, Less = Demon
- **Above the switch**: Less = Goblin, More = Demon
- **Implied anchor** = midpoint between the highest "below" line and the lowest "above" line

Example, real and exact (Misiorowski, pitcher_strikeouts, confirmed 2026-08-21): 6.5/7.5/8.5 all More=Goblin/Less=Demon; 9.5/10.5/11.5 all Less=Goblin/More=Demon; implied anchor = 9.0. This gives 8.5/9.5 = tier 1, 7.5/10.5 = tier 2, 6.5/11.5 = tier 3 — confirmed to match the live app exactly.

**The system's own fallback formula** (deployed in `annotateGoblinDemonTier`, `alphadog-v2-score-final-board.js`):
```
if no explicit standard row exists in the group:
  belowLines = lines where side='more' AND is_goblin=1
  aboveLines = lines where side='less' AND is_goblin=1
  if both exist:
    anchor = (max(belowLines) + min(aboveLines)) / 2
```

## 3. GOBLIN vs DEMON — direction of "easier"

- **Goblin**: farther from anchor = objectively EASIER (real, confirmed: multiplier goes DOWN as tier increases — the market pays less for an easier bet)
- **Demon**: farther from anchor = objectively HARDER (real, confirmed: multiplier goes UP dramatically as tier increases — real per-leg growth factor ≈1.40x per tier step)

This is intuitive once stated plainly but has caused real confusion — always sanity-check "does this signal make the bet easier or harder as I move away from anchor" before trusting a direction.

## 4. TWO REAL, SEPARATE, MOST-LIKELY-SOURCE PITFALLS FOR HISTORICAL DATA QUALITY

**These are structurally different concerns. A coworker session must be aware of both.**

### 4a. Internal parsing/classification bugs, fixed at specific real dates
Our own system's understanding of the above mechanism was WRONG for a period of time, then corrected via real, confirmed fixes:
- **2026-08-05**: `is_under_allowed` flag was being dropped in score-prep, causing incorrect side eligibility.
- **2026-08-12**: two-sided lines were only producing 1 matrix row instead of 2 (missing the complement side entirely).
- **2026-08-12** (same day, separate bug): a blanket "Less→flip" rule mislabeled 1,752 real legs.
- **2026-08-21**: the switch-point fallback (Pattern B above) was ADDED — before this date, every no-explicit-standard-line player had `goblin_demon_tier = NULL` in the database, meaning any historical backtest querying by tier silently EXCLUDED all of these players' real legs.
- **2026-08-21** (same day): the tier formula itself was corrected from a signed calculation to `round(abs(line-anchor))` — an earlier signed version produced backwards tiers for ladder cases.

**Practical implication**: any historical backtest spanning dates before 08-12 should be treated with real caution for goblin/demon-tier-specific analysis — the underlying labels may be wrong for that period. Backtests using data from 08-12 onward are more trustworthy for tier-based work; data from 08-21 onward (after the switch-point fix) is the most complete or currently the only truly clean dataset for switch-point-anchored players specifically.

### 4b. PrizePicks' OWN real, external payout table change
Separately from our own bugs, PrizePicks itself updated its real published payout table at least once (confirmed via a real, dated announcement: 2025-06-02, increasing 3-pick and 4-pick Flex payouts). **Any multiplier assumption sourced from data before that real external date does not reflect current real payouts.** Always re-verify the CURRENT published table via a fresh web search rather than trusting an old cached number, and always prefer a REAL placed-slip observation over any published table when one is available.

### 4c. A third, distinct, real data-reliability issue: raw feed `odds_type` unreliability
Independent of both of the above, PrizePicks' raw feed `odds_type` field has been directly observed to DISAGREE with what the live app actually renders, on at least 3 separate real occasions this session (Logan Webb, Jarren Duran, Sonny Gray) — in one direction the raw feed showed a phantom "standard" tag that the real app didn't display as one; in another the raw feed showed NO standard tag despite the real app treating a specific line as visually standard. This looks like a genuine PrizePicks-side data reliability limitation, not a fixable bug on our end. **When in doubt about whether a specific line is truly "regular," the real app screenshot is the authoritative source, not the raw database tag.**

## 5. WHY THIS MATTERS FOR DAILY RESEARCH

Any coworker session building or testing a pool that references `goblin_demon_tier` should:
1. Confirm which real date range the backtest data comes from, and flag/exclude data from before 2026-08-12 for tier-sensitive analysis unless there's a specific reason to include it.
2. Never assume a flat multiplier applies across all props/sides/tiers — always build or update a granular table (see `MULTIPLIER_TABLES_MASTER.md`).
3. When a real placed-slip test surfaces a tier that doesn't match expectations, check whether the player is a Pattern A (explicit standard) or Pattern B (switch point) case before concluding the tier logic itself is wrong — several real "bugs" this session turned out to be correct switch-point behavior once verified against the live app.
4. Remember that "more props/legs qualify now than the historical backtest ever showed" is not automatically a bug — it can genuinely reflect the pipeline being MORE complete now (post-fixes) than during the period the original backtest was built from. Real, confirmed example: a 26-day backtest calibrated against daily pool depths of 8-166 legs was later found inadequate when a live board — with a more complete, later-fixed pipeline — hit 900 real legs in a single day.
