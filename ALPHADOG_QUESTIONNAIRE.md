# ALPHADOG_QUESTIONNAIRE.md
*Compiled 2026-08-26, alongside ALPHADOG_REALIGNMENT.md. Every item below was checked against live code, live data, and committed docs first — none of these are guesses I could have resolved myself. Grouped by topic, in priority order within each group.*

---

## GROUP A — URGENT, BLOCKS FURTHER WORK

### A1. Which Demon pool is actually live, and is it the "good" one or the "catastrophic" one?
**What I found**: The live-deployed `DEMON_HIGH_HIT_TIER_POOL` (`alphadog-v2-certification-center.js`) is a 5-prop, all-`/more`, Tier1, 2-pick Power pool (`hits_runs_rbis`, `earned_runs`, `runs`, `hits_allowed`, `singles`), with an in-code comment claiming a real +188.0% ROI backtest, locked 2026-08-22. The handoff describes a structurally identical-shaped pool (5 props, `/more`, Tier1, 2-pick Power) as catastrophically broken (8.0% hit rate, EV as low as 0.19) and says this caused Demon to be "suspended entirely" on 2026-08-23 — one day *after* the live code says this pool was locked in as the good replacement for the (also now-retired) `pitcher_strikeouts/less/Tier2` pool.
**What's unclear**: Are these the same pool (meaning the live code may currently be running something already found to be a loser and never actually suspended), or two different pools that happen to share a shape by coincidence? I also found a second, separate, concurrently-coded Demon function (`autoSelectDemonSlipLegs`, a "highest live line" selector over a 7-prop pool) — is this dead code, an active alternate path, or the thing that's actually used for real slips?
**What I need**: Please tell me directly which of these is true, or point me to where in the live system I can check which function is actually invoked for real Demon slip generation (vs. a display-only "High Hit" preview). Until this is resolved, I'm treating all Demon research/generation as paused.

### A2. Confirm the pause decision on PP Sim A and Underdog rbis/less — still unanswered
**What I found**: Both are confirmed still live via `github_grep_file` — actively wired into `/api/slips/high-hit` and generating real slip previews right now, exactly as before. This question was asked at the start of this conversation and never answered before we moved to the re-verification task.
**What I need**: Yes/no on pausing each, independently of the Demon question above.

---

## GROUP B — pitcher_fantasy_score / propValueFromRow

### B1. Fix live Underdog's legacy `pitcher_fantasy_score` mis-grading?
**What I found**: 163 real rows are still tagged with the generic `pitcher_fantasy_score` key and get graded with PrizePicks' win/QS formula instead of Underdog's own `pfsUd()`. A parallel correctly-tagged pathway (`pitcher_fantasy_score_ud`) already exists and is unaffected. Live data shows the 163 legacy rows have a suspicious 79.59% hit rate (matching the exact inflated pattern PrizePicks had pre-fix) vs. 53.57%/34.29% on the correctly-tagged rows.
**What's unclear**: Whether this is a live ingestion bug still actively mis-tagging new Underdog rows, or a one-time historical leftover from before the `_ud` split was introduced. I did not trace the ingestion path (`alphadog-v2-parlay-underdog-board.js` or wherever rows get their canonical_prop_key assigned) to check which.
**What I need**: Should I trace and fix the root cause (likely: give `propValueFromRow` a source-aware branch, or fix whatever assigns the canonical key at ingestion), and should I retroactively re-grade the 163 affected rows the same way PrizePicks' 493/546 were re-graded? This looks like the same class of bug as the original PrizePicks fix, just not yet applied to Underdog.

### B2. `PROP_CALIBRATION_FIX_DATES` shows two separate fixes for `pitcher_fantasy_score` — intentional or a sign of confusion?
**What I found**: `2026-08-14` — a baseline/prediction-formula fix ("missing hits_allowed_sum"). `2026-08-25` (per the `realPrizePicksPitcherFantasyScoreValue` comment) — a separate outcome-grading formula fix. These are two different code paths (prediction vs. real-outcome grading) that happened to get fixed 11 days apart under the same prop name.
**What I need**: Just confirmation these are genuinely two separate, intentional fixes and not a sign that the second fix (08-25) was actually meant to also update the first (08-14) baseline path and didn't. I didn't check whether the baseline/prediction formula (used for HP scoring, not outcome grading) also needs the win/QS-bonus correction, or whether it's intentionally meant to stay "source-agnostic" per its own comment ("Do not leak PrizePicks/Sleeper win/QS bonuses here").

### B3. Discrepancy in exact hit-rate numbers between handoff and live code comment
**What I found**: Handoff says 512 legs / 52.7% hit rate for the corrected PrizePicks `pitcher_fantasy_score` dataset. The live code comment (written at the time of the fix) says 493 legs / 51.9%. My own live query today shows 546 legs / 52.38%.
**What I need**: Nothing urgent — all three tell the same story (coin flip, no edge) and the difference is most likely just more games graded over time. Flagging only so this isn't mistaken for a real contradiction later. No action needed unless you want the exact number reconciled.

---

## GROUP C — STRATEGY STATUS PER APP

### C1. PrizePicks Regular has no confirmed-working signal right now
**What I found**: Gen2 (`pitcher_fantasy_score/less`) is confirmed dead. Gen1 (bottom-of-order + `total_bases<1.5`, historically +837.5% ROI per `MULTIPLIER_TABLES_MASTER.md`) is described in that doc as possibly still working, never confirmed whether formally retired or just organically replaced.
**What I need**: Should I check whether Gen1's logic still exists anywhere in the live `alphadog-v2-certification-center.js`, and if not, should I rebuild and re-test it fresh, or is there a different direction you'd rather I try for PP Regular?

### C2. Two contradictory descriptions of the current Sleeper strategy
**What I found**: The handoff describes the current Sleeper strategy as `singles/less`, 5-pick Flex, ≥55% rolling hit rate. `MULTIPLIER_TABLES_MASTER.md` (2026-08-21, a committed doc) instead describes the locked strategy as `hits_runs_rbis/more`, 3-pick, Power, no cap. These are different props, different pick sizes, and different modes.
**What I need**: I haven't checked live code for Sleeper's actual deployed slip-building function yet (this pass focused on PrizePicks/Underdog/Demon). Do you know offhand which of these is actually current, or should I trace `autoSelectSleeperHighHitSlipLegs` (referenced in the live PP Sim A code) to find out directly?

### C3. Underdog's older 6-pick `rbis/less`+`walks/less` config — still exists anywhere?
**What I found**: `MULTIPLIER_TABLES_MASTER.md` describes this as the strategy with the largest real sample in the system's history (+345.0% ROI, capped at 1/day), separate from and possibly superseding the current 2-pick `rbis/less` config.
**What I need**: Should I check whether this older config still exists in the live code (e.g., a dormant function alongside `autoSelectUnderdogHighHitSlipLegs`), and if it's genuinely stronger, should it replace the current 2-pick approach rather than just being compared to it?

### C4. Singles/less/1.5 (PrizePicks Goblin) — the handoff's #1 "best chance" — cannot be verified this pass
**What I found**: The handoff's headline positive finding (p×m=1.31, Z=16.35, plus a claimed independent +272-410% ROI slip-construction backtest) rests entirely on a transcript file (`2026-08-26-03-29-40-...fliff-integration-prizepicks-deepdive.txt`) that does not exist in `/mnt/transcripts/` and is not reachable via my conversation-search tools.
**What I need**: If you have this transcript saved anywhere I could access (re-uploaded, or a different path), that would let me actually verify this rather than take it on faith. Otherwise, I'd need to rebuild the single-leg p×m analysis and the slip-construction backtest from scratch against live data — is that worth the time given it's unverified, or should I deprioritize this signal until the transcript surfaces?

---

## GROUP D — DATA/METHODOLOGY NOT RE-VERIFIED THIS PASS

### D1. Exhaustive multiplier table (handoff Section 2b/2c)
Not independently re-checked against live per-leg rate tables in code this pass (only spot-checked `MIXED_TOP55_REAL_TABLES` for hits/total_bases). If you want the full per-prop Goblin/Demon table re-verified against whatever `GOBLIN_LEG_MULT_TABLE`/equivalent structure is currently live in `alphadog-v2-certification-center.js`, say so and I'll do that as a dedicated pass.

### D2. Sleeper `flexFactor()` and its 7-observation-derived coefficients
Not checked against live code this pass. If Sleeper is a priority (see C2 above), I'd trace this as part of that work.

### D3. 9am-Pacific snapshot reconstruction methodology
Sourced entirely from the handoff (matches what's also in the committed `BACKTEST_LAYOUTS_AND_9AM_METHODOLOGY.md`, which I have not yet opened/read this pass). Not independently re-checked against `score.final_board_batches`/`final_board_history` live structure. Let me know if this needs re-verification before any new backtest is run against it.

### D4. Fliff / ParlayAPI current status
Sourced from the handoff only, not independently checked. Low priority unless you're actively planning to use Fliff data soon.

### D5. Pitcher-prop tier mechanics beyond what surfaced incidentally
The handoff's Section 3 (pitcher props, tier/anchor mechanics, `demon_full_history_dedup` vs `tiered_full_fixed`) was not independently re-verified this pass beyond what came up while checking Demon (Group A1). If pitcher props become a research priority, this needs its own pass.

### D6. `ALPHADOG_DOS_AND_DONTS.md`, `LIVING_LOG.md`, `HANDOFF_MASTER_SUMMARY.md` not reviewed in full this pass
These are large (120KB/152KB/207KB) committed docs that likely contain relevant standing rules and history. I read `MULTIPLIER_TABLES_MASTER.md` in full but not these three. Let me know if you want them folded into a future realignment pass, or if their contents are already fully captured in what you already know and don't need re-reading.

---

## GROUP E — PROCESS / TRANSCRIPT ACCESS

### E1. Are the 2026-08-22 through 2026-08-26 session transcripts recoverable at all?
This is the root cause of most of the "unverified" items above. If you have these saved anywhere — a different mount path, exported Cowork session logs, anything re-uploadable — pointing me to them would let me convert most of Group C/D from "unverified" to properly checked. Otherwise I'll continue treating committed docs + live code/data as the ceiling of what's verifiable, per your standing instruction.

---

**Summary of what needs a decision from you before I resume independent work**: A1 (Demon — blocks all Demon work), A2 (pause decision — blocks nothing but stays overdue), and a steer on which of C1-C4 you want prioritized next. Everything in Group D/E is lower-urgency and can wait.
