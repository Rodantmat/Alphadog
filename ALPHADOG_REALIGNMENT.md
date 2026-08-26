# ALPHADOG_REALIGNMENT.md
*Anchor document. Compiled 2026-08-26. If a conversation with Claude starts to drift from established facts, point it back to this file by name.*

## 0. How this document was built, and its evidence standard

This document uses a strict, three-tier evidence standard. Every claim below is tagged with how it was verified:

- **[LIVE-CODE]** — verified directly against the deployed source file in the GitHub repo, this session, via `github_get_file`/`github_grep_file`. This is the strongest evidence: it reflects what the system is actually running right now, not what any document says it's running.
- **[LIVE-DATA]** — verified directly against live Postgres (`run_sql_postgres`) this session. Reflects real, current data.
- **[DOC]** — sourced from a committed `.md`/`.txt` file in the repo (not a live artifact). These are real files, but describe *historical reasoning and past test results*, not necessarily the system's current state. Treated as reliable for "what was found/decided at the time," not for "what is true right now."
- **[UNVERIFIED]** — appears in the 2026-08-26 handoff document but could not be checked by any of the above methods this session (the transcript files it cites are not reachable — see Section 10). Do not treat as fact. Full list of these lives in `ALPHADOG_QUESTIONNAIRE.md`.

**A critical, standing caveat**: this session could not access `/mnt/transcripts/` (empty) or any conversation transcripts dated 2026-08-22 through 2026-08-26 (my conversation-search tools only reach back to 2026-08-21). The `ALPHADOG_HANDOFF_2026-08-26.md` document cites many transcripts in exactly that window as its evidence. Wherever this document's [LIVE-CODE]/[LIVE-DATA] findings **contradict** that handoff, treat this document as authoritative — it reflects what the system is doing right now — but be aware the handoff's underlying transcripts may contain context this pass never saw. Flag that possibility rather than assuming the handoff is simply wrong.

---

## 1. THE SINGLE MOST IMPORTANT OPEN ISSUE — read this first

**Do not generate or research any Demon slips until this is resolved with Rodolfo directly.**

[LIVE-CODE] The actual deployed Demon "High Hit" logic (`autoSelectDemonHighHitSlipLegs`, `alphadog-v2-certification-center.js`) uses `DEMON_HIGH_HIT_TIER_POOL`: **5 props, all `/more` side, Tier 1, 2-pick Power, 10% daily cap** — `hits_runs_rbis`, `earned_runs`, `runs`, `hits_allowed`, `singles`. An in-code comment says this was locked 2026-08-22, replacing an older `pitcher_strikeouts/less/Tier2` pool that a "real, confirmed backtest" found rested almost entirely on one outlier day (2026-08-11 supplied 31 of 36 supporting legs). The comment attached to the *current* 5-prop pool claims a real backtest of 141 slips / 72 full hits / +188.0% ROI / 15 of 16 real days positive.

[UNVERIFIED, from handoff] The 2026-08-26 handoff describes a **structurally identical-looking** pool — "a 5-prop combined pool, all on the `/more` side, Tier1, 2-pick Power" — as catastrophically broken (per-leg EV as low as 0.19, 8.0% hit rate against a 2.375x multiplier, confirmed via exhaustive stress test), and says this finding caused Demon to be suspended entirely on 2026-08-23. The handoff treats `pitcher_strikeouts/less/Tier2` as a separate, still-plausibly-valid signal worth re-verifying as its #3 priority — apparently unaware that the live code already replaced that exact pool one day earlier (2026-08-22).

**Two live-code comments and one handoff document do not agree, and I cannot resolve this from what's reachable this session.** Possibilities, none of which I can currently rule in or out:
1. The handoff's "catastrophic 5-prop pool" and the live `DEMON_HIGH_HIT_TIER_POOL` are the *same* pool — meaning the currently-deployed code is running a strategy that was later found to lose money 92% of the time, and it was never actually disabled despite the handoff's claim that "Demon was suspended entirely."
2. They are two *different* 5-prop/`more`/Tier1/2-pick pools that happen to share the same shape by coincidence (different specific props, or a different definition of Tier1).
3. The handoff's account of the 08-23 event is itself wrong, incomplete, or describes something that was tested but never deployed.

There is also a **second, separate, concurrently-coded Demon function** in the same file (`autoSelectDemonSlipLegs`) using an entirely different "highest live line" selection method over a 7-prop pool, with its own in-code claim of +2775% Power ROI (dated 2026-08-19). It is not clear which of the two Demon code paths — if either — is what actually generates real, real-money slips today, versus which is legacy/experimental code still sitting in the file.

**Action needed**: this needs to go to Rodolfo directly and immediately, ahead of everything else in the questionnaire. See Questionnaire Item #1.

---

## 2. STRATEGY STATUS BY APP — verified state as of this pass

### 2a. PrizePicks Goblin — "Sim A" (hits/less + total_bases/less, 6-pick Flex)
- [LIVE-CODE] **Confirmed still live and still being served.** `MIXED_TOP55_PROPS = [{hits,less},{total_bases,less}]`, `MIXED_TOP55_MIN_HIT_PCT=92`, `MIXED_TOP55_TOP_K=55`, `MIXED_TOP55_SIZE=6`, built via `autoSelectMixedTop55Legs`/`buildMixedTop55Slips`, wired live into `/api/slips/high-hit`.
- [LIVE-CODE] Per-leg rate table (`MIXED_TOP55_REAL_TABLES`) uses ~1.15 for both `hits/less` and `total_bases/less`, with an in-code comment dated 2026-08-26 explaining this was corrected from an earlier wrong 1.318/1.480 assumption, based on 7 real saved slips clustering at 2.25-2.5x for 6-pick.
- [UNVERIFIED, from handoff] Handoff claims a corrected backtest of -27.4% ROI (121 slips, 38 full hits, 31.4% hit rate) using this same ~1.15 rate, and separately claims the *true* pure-single-prop per-leg rates (Section 2b of the handoff, e.g. hits/less/Goblin at 6-pick = 3.5 total / 1.232 per-leg, vs total_bases/less/Goblin at 10.5 total / 1.480 per-leg) are meaningfully different from each other and from the blended 1.15 currently deployed — meaning the -27.4% figure may itself be based on an imprecise, blended rate rather than the true one.
- **Status: LIVE, unpaused, generating real slips right now.** Rodolfo has not yet confirmed whether to pause this (see Questionnaire #2). The -27.4% figure is [UNVERIFIED] this pass — it comes from the handoff, not from independent recomputation.

### 2b. PrizePicks Demon
- See Section 1 above — **status is genuinely unclear and contradictory**. Two different live code paths exist; whether either is actually generating real slips right now, and whether the currently-coded 5-prop pool is the "good" +188% one or the "catastrophic" 8%-hit-rate one the handoff describes, is unresolved.

### 2c. PrizePicks Regular ("Gen2" — `pitcher_fantasy_score/less`)
- [LIVE-CODE] + [LIVE-DATA] **Confirmed dead, formula fix confirmed live.** `realPrizePicksPitcherFantasyScoreValue(r) = outs_recorded + 3×strikeouts − 3×earned_runs + 6×wins + 4×qualityStart(r)` is live in `propValueFromRow()`, the real outcome-grading function (`alphadog-v2-phase3a-first-inning-pitcher-context.js`, line 578/1273). Live query against `score.prop_outcome_history` confirms: PrizePicks `pitcher_fantasy_score`/`less` = **546 legs, 52.38% hit rate** — a coin flip, matching the handoff's conclusion that this prop has no real edge. (Handoff cited 512 legs / 52.7% — close but not exact; likely more games graded since. Direction and conclusion both confirmed.)
- [LIVE-CODE] There is a **second, earlier, separate fix** on record for this same prop: `PROP_CALIBRATION_FIX_DATES.pitcher_fantasy_score = "2026-08-14"`, describing a fix to the *prediction/baseline* formula ("config was missing hits_allowed_sum entirely"), distinct from the 2026-08-25 fix to the *outcome-grading* formula described above. These are two different fixes to two different code paths — do not conflate them.
- **Do not use this prop for Regular going forward.** Confirmed dead by live data, independent of the handoff's transcript citations.

### 2d. PrizePicks Regular ("Gen1" — bottom-of-order + total_bases<1.5)
- [DOC] `MULTIPLIER_TABLES_MASTER.md` (compiled 2026-08-21) describes this as a real, previously-deployed signal: batting order 7-9, `total_bases<1.5`, 6-pick Power, real hit rate 57%→75-83% across order position (n=79 games), 6-day backtest 3/6 days won, +837.5% total ROI. The same doc explicitly says it's unclear whether this was ever formally deprecated or just organically replaced by Gen2, and recommends re-testing whether it still holds on current data.
- [UNVERIFIED] Not checked against live code or live data this pass — not currently known whether any trace of this logic still exists in the deployed certification-center file, or whether it would need to be rebuilt from scratch.
- Since Gen2 is confirmed dead (2c above), **Regular currently has no confirmed-live, confirmed-working signal.** This is a real gap, not a paused strategy.

### 2e. Underdog — `rbis/less`, 2-pick Standard
- [LIVE-CODE] **Confirmed still live and still being served.** `underdog2PickRealMultiplier()` implements `M = (1−H)/(p1×p2)`, `H = UNDERDOG_HOUSE_MARGIN_2PICK = 0.0766`, reading real live moneyline prices per-leg from `underdog_raw_line_json`. Wired into `buildUnderdogHighHitSlips`. In-code comment cites a real backtest of "287 slips, 155 full hits (54.0%), only 2 losing days."
- [UNVERIFIED, from handoff] Handoff claims a corrected backtest of -14.0% ROI (307 slips, 163 full hits, 53.1% hit rate) for this same strategy — close to but not identical to the in-code comment's numbers (same pattern as 2c above: same direction, different exact n/rate, likely more data accumulated since).
- **Status: LIVE, unpaused, generating real slips right now.** Rodolfo has not yet confirmed whether to pause this (see Questionnaire #2).

### 2f. Underdog — older 6-pick `rbis/less` + `walks/less` config
- [DOC] `MULTIPLIER_TABLES_MASTER.md` describes this as a separate, earlier-locked config: 6-pick Power, cap=1/day, real 27-day backtest showing 4,553/4,340 real graded outcomes for the two props respectively, uncapped ROI +229.4% (98/715 full hits), capped-at-1/day ROI **+345.0%** (5/27 full hits) — the largest real sample of any signal found in this system's history per that doc.
- [UNVERIFIED] Not checked against live code this pass — not confirmed whether this older 6-pick config still exists anywhere in the deployed code, was ever formally retired in favor of the 2-pick config in 2e, or could be run in parallel.

### 2g. Sleeper — `singles/less`, 5-pick Flex
- [DOC] Handoff describes this as the current deployed Sleeper strategy: real ≥55% rolling 60-day hit rate (min 3 obs), ranked by real per-leg multiplier via a Gemini-derived EV-parity Flex-discount formula.
- [DOC] `MULTIPLIER_TABLES_MASTER.md` (2026-08-21) instead describes the *locked* Sleeper strategy as `hits_runs_rbis/more`, 3-pick, Power, no cap, real 22-day backtest of 36 slips/12 full hits/+46.5% ROI — a **different prop, different pick size, different mode** than what the handoff describes.
- **This is an unresolved discrepancy between two sources, neither independently checked against live code this pass.** Flagged in questionnaire.

### 2h. Best-current-chances ranking (Singles/less/1.5, PrizePicks Goblin)
- [UNVERIFIED] The handoff's #1 priority signal — a claimed statistically overwhelming single-leg edge (p×m=1.31, Z=16.35) plus an independently-reported slip-construction backtest of +272-410% ROI — rests entirely on a transcript (`2026-08-26-03-29-40-...fliff-integration-prizepicks-deepdive.txt`) that is not reachable this session. Nothing in the committed docs corroborates this specific line/side combination at this specific magnitude. **Cannot be verified or refuted this pass.** Treat as an interesting lead, not a confirmed finding, until the underlying transcript or an independent live-data recomputation is available.

---

## 3. LIVE, CURRENT PIPELINE BUG FOUND THIS PASS (not in the handoff)

[LIVE-CODE] + [LIVE-DATA] **Underdog `pitcher_fantasy_score` mis-grading, currently live and unresolved.**

`propValueFromRow(prop, r)` — the single function that grades every real outcome in this system — takes no `source_key`/app parameter (confirmed via function signature, line 1257 of `alphadog-v2-phase3a-first-inning-pitcher-context.js`). For the canonical prop key `pitcher_fantasy_score` (and `fantasy`), it always applies `realPrizePicksPitcherFantasyScoreValue()` — the PrizePicks-specific formula with 6×wins + 4×quality-start bonuses — regardless of which app the row actually came from.

Live query confirms the real-world consequence:
- `parlay_underdog` / `pitcher_fantasy_score` (generic, legacy-tagged key) / `less`: **n=147, 79.59% hit rate** — the same kind of inflated pattern PrizePicks had before its own fix.
- `parlay_underdog` / `pitcher_fantasy_score_ud` (a separate, correctly-tagged key that *does* route to Underdog's own `pfsUd()` formula): `less` n=168, 53.57%; `more` n=70, 34.29% — much more consistent with a properly-graded, no-obvious-edge prop.

163 rows currently sit under the generic, mis-graded key. A parallel, correctly-tagged pathway already exists (`pitcher_fantasy_score_ud`) but the legacy rows were never migrated or the ingestion path that still produces the generic tag was never fully closed off. **This is a live, current, unresolved bug.** It also technically resolves the handoff's open Sleeper-formula question — a live query confirms **zero Sleeper rows exist under `pitcher_fantasy_score` at all**, so there is currently no data for that specific concern to apply to, though the underlying `propValueFromRow` gap that caused the Underdog problem would apply identically to Sleeper the moment any such row appeared.

---

## 4. KNOWN PIPELINE BUGS AND FIXES — historical record [DOC, from MULTIPLIER_TABLES_MASTER.md and handoff, not independently re-verified this pass except where noted]

1. Contaminated "less" rows on more-only PrizePicks lines (phantom `selected_side='less'` on `is_under_allowed=0` rows) — fixed at raw ingestion.
2. Scoring engine join missing `selected_side` match — fanned out 16,650→25,085 rows, killed final-board for 5 runs — fixed.
3. Non-atomic board replace (DELETE then separate INSERT) — could return "0 of 0" to a concurrent reader — fixed via `pgClient.begin(...)`.
4. Duplicate scoring rows from overlapping retries — recurred once after a first app-level fix; needed a DB-level unique constraint + `ON CONFLICT`.
5. Client/server field-name mismatch on slip save (`j.saved` vs `j.saved_slips`) — every save silently reported "0 saved" despite genuinely saving — fixed 2026-08-21.
6. `real_multiplier_flex_tiers` double-JSON-encoded in `score.slip_entries` — required `(col #>> '{}')::jsonb`.
7. HTML `placeholder=` used instead of `value=` on real-multiplier confirmation inputs (~10 occurrences) — placeholders never submit — fixed.
8. `pitcher_fantasy_score` outcome-grading formula bug — **[LIVE-CODE + LIVE-DATA confirmed above in Section 2c]** — fixed and confirmed dead-for-edge.
9. **[NEW, found this pass, LIVE, unresolved]** `pitcher_fantasy_score` mis-grading for Underdog's legacy-tagged rows — see Section 3 above.

---

## 5. SNAPSHOT-TIMING METHODOLOGY [DOC, not independently re-verified this pass]

- Real trigger mechanism: Claude Cowork sessions running `coworker/prompts/Master_Full_Run.txt`, scheduled 4x/day (1am/9am/1pm/5pm Pacific). The 9am run is what backtests should key off, since real slips get placed against its output ~10-10:30am Pacific.
- `score.daily_first_snapshot_batches` is a confirmed trap — does NOT reliably capture the true first-of-day snapshot (verified example: the `official_date=2026-08-21` batch was actually the previous day's 5pm run). Do not use it for "first snapshot of the day" logic.
- Correct method: query `score.final_board_batches` for `started_at` in a wide UTC window bracketing 7am-noon Pacific (accounting for PDT/PST), take the earliest completed batch in that window, and reconstruct from `score.final_board_history` filtered to that exact batch id. If no batch falls in the window, say so explicitly rather than silently substituting. Fallback to 1pm/2pm run if 9am isn't available, per explicit prior user instruction — always state which was used.
- **Not independently verified against live code/table structure this pass.**

---

## 6. GEMINI USAGE PATTERN [DOC, unchanged, no live artifact to check]

Call via `run_job` → `POST https://alphadog-v2-admin-sql.rodolfoaamattos.workers.dev/gemini-proxy`, body `{"model":"gemini-3.6-flash","prompt":"..."}`. Established working pattern: multiple small passes, not one large data dump — (1) present real data + sharp specific questions, get a diagnosis, (2) reference that conclusion explicitly and ask for the next specific piece without re-pasting everything, (3) validate/stress-test the derived formula against held-out real data. This pattern produced the Sleeper Flex EV-parity formula and the Underdog heavy-favorite pricing diagnosis per the historical record — not independently re-verified this pass since it describes a *process*, not a checkable artifact.

---

## 7. TOOLS AND CREDENTIALS — REFERENCE

- **Alphadog Bridge MCP**: sole interface. `run_sql` (D1, needs explicit `database`: `CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`, `TEAM_DB`, `DAILY_DB`, `MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`, `SCORING_DB` — note `SCORING_DB` is D1/SQLite despite the name); `run_sql_postgres` (Postgres, `allow_write:true` for writes); `run_job` (worker dispatch); `github_get_file`/`github_put_file`/`github_patch_file`/`github_grep_file`/`github_list_dir`/`github_list_workflow_runs`/`github_get_workflow_run_log`.
- **Hyperdrive binding**: `f6c6e778ebfe4dfa8e17d7effbeaff8b`, added only via `generate_wrangler_configs.py`'s special-case list — manual `.jsonc` edits get silently wiped on every deploy.
- **`prepare: false` is mandatory** on every `postgres.js` connection (`{ max: 3, fetch_types: false, prepare: false }`) — without it, real Postgres errors get masked as generic "Network connection lost."
- **External APIs**: The Odds API key in `CONFIG_DB.config_external_credentials` (`the_odds_api_key`); also `refmetrics_login`, `oddspapi_api_key`, `gbdt_auto_trigger_github_pat`. ParlayAPI key looked up from `config.external_credentials` (`credential_key='parlay_api_key'`) with fallback to `PARLAY_API_KEY` Cloudflare secret.
- **GitHub**: `Rodantmat`.
- **Key repo docs**: `MASTER_DELTA_SCRUTINY_GUIDE.md`, `ALPHADOG_DOS_AND_DONTS.md`, `LIVING_LOG.md`, `HANDOFF_MASTER_SUMMARY.md`, `CORE_LOGIC_CALIBRATION_DOSSIER.md`, `GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md`, `MULTIPLIER_TABLES_MASTER.md`, `SESSION_2026-08-22_FULL_LOG.md`, `SIGNALS_TECHNIQUES_TRIED.md`.

---

## 8. RECURRING SYSTEMIC PATTERN — worth remembering

Across the handoff and this pass's live verification, the same shape of problem keeps recurring: **a strategy's backtest ROI looks strong until its underlying inputs (a multiplier assumption or an outcome-grading formula) are independently checked, at which point it often flips to flat or negative.** This has now happened at least three times on record (PrizePicks Sim A's per-leg rates, Underdog's flat-3.5x assumption, PrizePicks Regular's grading formula), plus this pass found a fourth, live, currently-unfixed instance (Underdog's legacy-tagged `pitcher_fantasy_score` rows). **Treat any currently-"strong" number in this system with real skepticism until both its multiplier and its outcome-grading formula have been independently re-verified against live code and live data — not just its win-rate arithmetic.**

---

## 9. WHAT THIS PASS DID NOT COVER

Given the scope of a full system re-verification, this pass focused on the highest-stakes, most consequential claims (live strategy status, the `pitcher_fantasy_score` fix, Demon's configuration). It did **not** independently re-verify: the full exhaustive multiplier table (handoff Section 2b/2c), the Sleeper `flexFactor()` coefficients, pitcher-prop tier mechanics beyond what surfaced incidentally, ParlayAPI/Fliff status, the UI bug-fix list (handoff Section 7), or ALPHADOG_DOS_AND_DONTS.md / LIVING_LOG.md / HANDOFF_MASTER_SUMMARY.md in full. These remain sourced only from the handoff (unverified) or not reviewed at all this pass. See the questionnaire for the complete list.

---

## 10. PERMANENT RESEARCH STANDARD — the floor for every strategy in this system, no exceptions

Established 2026-08-26 after a real, costly failure: a Demon strategy was deployed live based on a single unverified SQL query, then had to be reverted hours later once proper methodology revealed the underlying data was 83% contaminated and the remainder wasn't day-robust. This section exists so no future session — including this one, later — regresses to that shortcut. Any strategy proposed for deployment must clear all six items below. None are optional, and none get skipped "just this once" for time pressure.

**1. Gemini as a genuine adversary, not a rubber stamp.** Every hypothesis gets a real `run_job` call to the gemini-proxy in which Gemini is asked to set its *own* falsification bar — minimum sample size, required monotonicity, minimum ROI over baseline — *before* being told whether the hypothesis passes. If the result doesn't clear the bar Gemini itself set, it's rejected. This is the exact pattern that correctly killed the "opposing top-4 lineup OBP" and "0-1 count tailwind" hypotheses documented in `SIGNALS_TECHNIQUES_TRIED.md` — reuse it, don't reinvent a weaker version of it.

**2. Multiple genuinely different research passes per strategy, not repeated queries with a different threshold.** A "pass" must test something structurally different from the prior pass on the same strategy — e.g., raw historical hit rate vs. the model's own `estimated_hit_probability_0_100` as the qualifying signal; player-level pooling vs. prop-line-level pooling; different pool compositions (adding/removing props, sides, tiers); different correlation treatments; multi-layer signal stacking. Re-running the same qualification logic at a different cutoff percentage does not count as a second pass.

**3. Three-check discipline on every number before it is reported or acted on.**
   - **Correct lane.** Never trust `score.prop_outcome_history`'s own `is_goblin`/`is_demon` flags directly — join to `score.final_board_history` on `final_board_row_id` and take the lane from there. The two outcome-writers in this system are confirmed to disagree (`SIGNALS_TECHNIQUES_TRIED.md`, session 5).
   - **Known-corrupted-day exclusion.** PrizePicks Demon `/less` legs are confirmed mislabeled on **2026-08-05, 08-06, 08-07, and 08-11** (sign-inversion bug in raw ingestion, fixed 08-12) — exclude these from any Demon analysis. Check this document and `SIGNALS_TECHNIQUES_TRIED.md` for other known-corrupted windows before trusting any date range at face value, and add newly-discovered corrupted windows here as they're found.
   - **Day-robustness / leave-one-day-out.** An aggregate n and hit rate is not sufficient. Break the result down by day and confirm it isn't being carried by one or two days — the exact failure that invalidated the `pitcher_strikeouts/less/Tier2` re-verification on 2026-08-26 (83% of the sample came from corrupted days, and even the clean remainder was carried entirely by a single day). Report the LODO band, not just the point estimate.

**4. The `p×m` sanity gate, checked before any ROI is reported.** Per `SIGNALS_TECHNIQUES_TRIED.md`'s headline finding: every payout model in this system reduces to the per-leg product of real hit rate `p` and real per-leg multiplier `m`. When `p×m < 1`, no size, cap, correlation rule, or ranking method can produce a positive track — size only compounds whichever sign is already present. State `p`, `m`, and `p×m` explicitly before reporting any slip-construction ROI; if `p×m < 1`, stop there rather than continuing to a full backtest.

**5. Mandatory per-strategy transcript re-check, every time a strategy is picked up — not just once per session.** Before starting fresh research on a specific strategy, search chat history and any reachable transcripts for that strategy by name/prop/signal, to avoid re-discovering something already tested and rejected, or missing something already found promising that was never followed through on. If transcripts for the relevant window aren't reachable (a standing, documented limitation as of this session — see Section 11), say so explicitly and fall back to committed docs (`SIGNALS_TECHNIQUES_TRIED.md` above all — it is the single most information-dense source found so far) rather than skipping the check.

**6. No finding gets finalized on an estimated or table-based multiplier alone.** Once a pool clears walk-forward with a genuinely positive, day-robust `p×m`, the next step is always a handful of real, current, placeable slips built from that exact pool against today's live board — for the user to actually place, so the real app-displayed multiplier can be extracted and compared against whatever rate the backtest assumed. This is exactly how the exhaustive multiplier list, the Underdog EV-parity formula, and the Sleeper Flex-discount formula were all originally derived — a backtest number is a hypothesis about the real multiplier, not a substitute for observing it.

**Sequencing rule**: strategies are researched one at a time, to the full standard above, not in parallel at reduced depth. Moving to the next strategy before the current one clears all six items is itself a violation of this standard.

---

## 11. WHY TRANSCRIPT ACCESS FAILED THIS SESSION

`/mnt/transcripts/` was empty. `conversation_search`/`recent_chats` surfaced nothing past 2026-08-21. The handoff's own citations are dated 2026-08-22 through 2026-08-26 — entirely outside what this session could reach. This is a standing environment limitation, not a choice — if a future session has access restored, the items in the questionnaire tagged "transcript needed" should be revisited against the actual source material rather than left as permanently unverified.
