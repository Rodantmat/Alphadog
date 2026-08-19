# CORE SCORING LOGIC CALIBRATION — DOSSIER
*Not the Platt/Beta/isotonic statistical calibration layer (see calibration_correction_map). This is the underlying logic that produces the raw HP before that layer ever touches it: thresholds, shrinkage strength, caps, tiers, dispersion corrections. Everything below is read directly from the live, currently-deployed code (`alphadog-v2-phase3a-first-inning-pitcher-context.js`), not reconstructed from memory.*

---

## 1. OVERDISPERSION CORRECTION — count-based props (home_runs, triples, RBIs, etc.)

```js
function overdispersedTailGE(k,mu,sigma=1){
  mu=Math.max(0,Number(mu||0)); k=Math.ceil(k);
  if(mu<10 && sigma<=1.05) return poissonTailGE(k,mu);
  const sd=Math.sqrt(Math.max(0.0001,mu*sigma));
  return clamp(1-normalCdf(k-0.5,mu,sd),0,1);
}
```
**Root cause fixed 2026-07-29**: the Normal approximation systematically overstated P(X≥1) for small-mean, right-skewed count data — confirmed via manual grounded calibration check showing 20-55 point real overconfidence gaps on RBI/runs-type props. A Negative-Binomial-based correction replaced the naive Normal approximation for the overdispersed case (`sigma>1.05`). Below `mu<10` with low overdispersion, it correctly falls back to a true Poisson tail. **This is a real, load-bearing threshold** — if a future session touches count-prop HP and sees implausible tail probabilities, check whether `sigma` is being computed/passed correctly into this function, not just whether the final HP "looks wrong."

## 2. SAMPLE-SUPPORT CLAMP (Wilson score interval)

```js
function clampHpToSampleSupportedRange(rawHp0to1, gamesSample) {
  const p = clamp01(rawHp0to1);
  const n = Math.max(0, Number(gamesSample) || 0);
  if (n >= 30) return p; // trust the model directly, no clamp needed
  // below n=30: bounds the raw HP to a Wilson-score confidence interval around the observed rate
}
```
**The n=30 threshold is a real, hardcoded line**: below it, raw HP gets bounded to a statistically-defensible Wilson interval rather than trusted at face value; at or above it, the model's raw output passes through unclamped. This exists in **two places** in the codebase (`clampHpToSampleSupportedRangePg` and `clampHpToSampleSupportedRange`) — if recalibrating this threshold, both need updating or you'll get inconsistent behavior depending on which code path a given prop routes through.

## 3. RECENCY PROFILES (Profile A/B/C/D/E) — `config.prop_recency_profile`

Live config, one entry per prop, each with a `recency_weights` blend (last_5/last_10/last_20/season_to_date, summing to 1.0) and a `prior_strength_multiplier`:

| Profile | Props | last_5 | last_10 | last_20 | season | prior_strength_multiplier |
|---|---|---|---|---|---|---|
| **A** (fast-stabilizing) | hitter_strikeouts, walks, pitcher_strikeouts | 0.45 | 0.30 | 0.15 | 0.10 | **0.7** |
| **A** (walks_allowed variant) | walks_allowed | 0.40 | 0.30 | 0.20 | 0.10 | **0.85** |
| **B** (moderate) | hits, singles, hits_allowed, total_bases | 0.35 | 0.30 | 0.20 | 0.15 | **1.0** |
| **C** (slow/volatile, rare events) | home_runs, doubles, triples, stolen_bases, earned_runs, runs_allowed | 0.20-0.15 | 0.20-0.25 | 0.25 | 0.30-0.40 | **1.5-1.8** |
| **D** | rbis, runs | 0.20 | 0.25 | 0.25 | 0.30 | **1.5** |
| **E** (pitcher volume) | pitcher_outs, pitches_thrown | 0.50 | 0.30 | 0.15 | 0.05 | **0.6** |
| **A-C / B-D blend** | fantasy_score, pitcher_fantasy_score, hits_runs_rbis | 0.30 | 0.28 | 0.22 | 0.20 | **1.2** |

**What `prior_strength_multiplier` actually controls**: it scales how hard the shrinkage pulls a player's raw rate back toward the population/tier prior. Lower (0.6-0.7) = trust the player's own recent data fast, minimal shrinkage — correct for stats that genuinely stabilize quickly (K-rate, BB-rate). Higher (1.5-1.8) = shrink hard toward the prior even with a fair amount of data — correct for rare/volatile events (triples, HR, SB) where a short hot/cold streak is mostly noise.

**Real historical fix embedded in this table**: `total_bases` was moved from Profile C to Profile B on 2026-07-19 after real ground-truth data proved `total_bases≥1` and `hits≥1` are the *exact same event* at the shared 0.5 line, but were receiving different shrinkage treatment — this was the dominant root cause of a cross-prop monotonicity violation that grew from 40% to 97% by player tier before being caught.

## 4. HIERARCHICAL EMPIRICAL BAYES (HEB) SHRINKAGE — the core posterior formula

```js
function posteriorHeb(hit, miss, push, priorPct, m) {
  const n=hit+miss; if(n===0) return null;
  const p=clamp(Number(priorPct)/100,0.01,0.99);
  return round(100*((hit + p*m)/(n+m)),2);
}
function effectiveHebM(hit, miss, priorPct, baseM){
  const n=hit+miss; if(n<=0) return baseM;
  const raw=100*hit/n;
  const gap=Math.abs(raw-Number(priorPct||50));
  // LOCKED HEB CONTRACT: n>=20 and raw differs from prior by >15pts => direct evidence
  // must carry AT LEAST 75% weight, meaning M <= n/3.
  if(n>=20 && gap>15) return Math.min(baseM, Math.max(1, n/3));
  return baseM;
}
```
This is the actual Bayesian shrinkage engine: `m` (or `M`) is the "prior strength" in pseudo-observations — a higher `m` means the prior pulls harder, a lower `m` means the player's own real hit/miss counts dominate faster. **The "locked HEB contract" comment is explicit and load-bearing**: whenever a player has ≥20 real observations AND their raw rate is genuinely, meaningfully different (>15 points) from the population prior, the formula is *hard-capped* so the prior can never claim more than 25% of the final weight — `M` gets forced down to at most `n/3`. This exists specifically to stop the shrinkage from washing out a real, well-supported signal just because it disagrees with the population average.

## 5. SAMPLE-SIZE RELIABILITY TIERS (distinct from player-skill tiers — see #7)

```js
function sampleTierV2(n, prop, entityType){
  if(sample<5) return "TINY_SAMPLE";
  if(sample<15) return "LOW_SAMPLE";
  if(sample<30) return "MEDIUM_SAMPLE";
  if(sample<50) return "ESTABLISHED_SAMPLE";
  return "ELITE_SAMPLE";
}
```
**Locked as of v0.1.80, explicit comment**: *"true reliability tiers are sample-size bands only. Do not let pitcher 10-19 game samples graduate into ESTABLISHED/ELITE labels."* — this was a real, deliberate correction: an earlier version apparently let something other than raw sample count influence this tier, and it was locked down to be purely `n`-based. If a future session is tempted to make this "smarter" by blending in other signals, know that this was already tried and explicitly reverted.

## 6. EXPANSION BASELINE (RA/PFS_PP/PFS_SL/RFI) — separate, parallel prior-strength/cap table

A structurally distinct, simpler system used for the expansion-scope props (runs_allowed, pitcher_fantasy_score PP/SL variants, RFI/NRFI):

```js
function expansionHpPriorStrength(sampleProfile, nonPush){
  if(sp==="TINY_SAMPLE" || n<5) return 20;
  if(sp==="LOW_SAMPLE" || n<15) return 12;
  if(sp==="MEDIUM_SAMPLE" || n<30) return 6;
  return 2;
}
function expansionHpCap(sampleProfile, nonPush){
  if(sp==="TINY_SAMPLE" || n<5) return {lo:15, hi:85};
  if(sp==="LOW_SAMPLE" || n<15) return {lo:10, hi:90};
  if(sp==="MEDIUM_SAMPLE" || n<30) return {lo:5, hi:95};
  return {lo:1, hi:99};
}
```
**This is a genuinely separate calibration surface from HEB/section 4** — different prior-strength scale (20→2 vs. HEB's `m` values), and it has its own **hard floor/ceiling caps** that HEB does not (a tiny-sample expansion prop can never show below 15% or above 85%, regardless of what the raw posterior computes). If recalibrating "the shrinkage," check whether the prop in question routes through the main HEB path or this separate expansion path — they do not share thresholds and a fix to one does not touch the other.

## 7. PLAYER CLASSIFICATION TIERS — `TIER_XX_OF_YY`, the actual player-skill/context tiers

Distinct from sample-size reliability tiers (#5). Computed per (player, prop, line, side) via `hitterTier12()` / `pitcherTier()`, based on volume, usage, lineup position, platoon splits. Examples confirmed live:
- `TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE` / `TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE` — hitter tiers for players with an extreme platoon split (`splitDelta_0_100` magnitude ≥6 triggers `FAVORABLE_VS_LEFT_SHAPE`/`FAVORABLE_VS_RIGHT_SHAPE` platoon profile classification)
- Volume profiles: `HIGH_VOLUME` (PA/game ≥4.2), `EVERYDAY_CORE` (≥3.7), `LOW_USAGE_OR_PARTIAL` (≥2.0), `MICRO_USAGE` (below)
- Pitcher volume: `DEEP_STARTER` (outs/start ≥18), `NORMAL_STARTER` (≥15), `LOW_WORKLOAD_STARTER` (≥12), `SHORT_OR_UNSTABLE_WORKLOAD` (below)

**Real bug found and fixed (v0.1.57)**: a hitter's "more" and "less" sides for the *same* player/prop/line could independently land in different platoon tiers (TIER_07 vs. TIER_08) due to how each side's classification was computed separately, when the platoon shape is actually a single, side-independent fact about the player. Fixed with a targeted "fast pair repair" that neutralizes the tier to match whichever side wasn't stuck in the platoon tiers, restoring the correct shared tier across both sides of the same line.

**This tier determines which population/prior pool a player's HP gets shrunk toward** (section 4's prior comes from the tier-matched population, not the global average) — so a genuine tier misclassification is a real, quiet source of a wrong prior, not just a display/label bug.

## 8. DIAGNOSTIC-ONLY SAFEGUARDS (read-only, never adjust scoring — know these exist so you don't duplicate them)

- **`runCalibrationCoverageGapCheck`**: surfaces any (prop, side, high-HP bucket) combo with a real, resolved-outcome deviation ≥15pts (configurable) and zero active statistical correction covering it. This is exactly the mechanism that would have caught the `earned_runs|less`/`walks_allowed|less`/`hits_allowed|less` silent coverage loss before it took days to notice.
- **`runRoleDiscontinuityCheck`**: flags a pitcher whose most recent outing's innings-pitched differs sharply (≥2.0 IP by default) from their own trailing average, or has a large gap (≥21 days by default) since their prior outing — surfaces a real risk that the baseline sample mixes an old role/context with the current one (the Blade Tidwell case: 8 short relief outings blended with 1 recent start, now confirmed as today's actual starter).

Both are explicitly diagnostic-only — they never touch scoring, selection, or caps themselves. If the actual goal is to have these *act* on the score (a real penalty, not just a flag), that would be new work, not a recalibration of something already live.

## 9. KNOWN GAP IN THIS DOSSIER — be honest about this before acting

There is a **separate enrichment-factor layer** (lift/penalty multipliers applied on top of the baseline HP from sections 1-7, covering things like umpire tendency, weather, quality-of-contact, bullpen availability, opposing-pitcher-quality) that this pass did not extract with the same code-level rigor as the sections above — I found references to it (`confidence_modifier`, `enrichment_rate_multiplier`) across many transcripts but did not pull its live, current thresholds/caps the way I did for the baseline shrinkage system. If the "logic calibration" work needs to touch that layer specifically (not just baseline shrinkage/tiers), that needs its own dedicated extraction pass before touching any of its numbers — don't assume the general shrinkage principles above transfer directly to it without checking its actual code first.

---

*Grounded entirely in `alphadog-v2-phase3a-first-inning-pitcher-context.js` as currently deployed, cross-referenced against the 2026-08-13 `alphadog-v2-calibration-audit-tier-fix.txt` transcript for the recency-profile table's real values. No numbers in this document were invented — every threshold above is copy-verified from live code or the transcript's own SQL output.*
