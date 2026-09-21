# NBA SWEEP — UNATTENDED RUN LOG

**Read this first.** One file, updated at every transcript closure and at every stop. It carries the
resume note, what closed, what was found, and every decision taken without the owner.

**Mode**: continuous and unattended, started **2026-09-21 05:36 UTC** on owner instruction. No
stopping to report, no waiting for answers. Every issue documented with severity, never flagged and
held. Judgment calls taken under the standing rules and recorded below with the alternatives
rejected; anything genuinely needing the owner is marked **OWNER DECISION** and the sweep moves on.

---

## ▶ RESUME NOTE — *the only thing a fresh session needs to continue*

| | |
|---|---|
| **Current transcript** | **T4** — `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt` |
| **State** | **0/3 · 4 passes · ALL FOUR STRATA READ** (owner 5 · reasoning 261 · commands 103 · results 129). |
| **Stratum** | Complete. Tail: 607 segments, 498 uncovered vs the twelve (82%). |
| **Exact next step** | **T4 pass 5 — the two-direction judgment pass.** Script is at `scratchpad/t2judge/judge.py`; point `T2` at T4's transcript path and rerun. Then two more clean passes at **different angles** (suggested: live numeric re-verification of T4's measured volumes; cross-document consistency on the backfill tables). |
| **Then** | T4 → T5 → … → T20, strictly chronological. Completion criterion per transcript: **3 consecutive clean passes at genuinely different angles**, the two-direction judgment pass among them. |
| **Order** | T1 ✅ · T2 (here) · T3 ✅ · then T4 → T20. T19/T20 are this documentation effort and are swept like any other. |
| **Parked** | A2/N1 (T15) material — re-extract when the sequence reaches T15. |

**Before every pass and every write**: `git fetch origin main && git reset --hard origin/main`.
Another session commits to this repo through the night; its files are out of scope (see Scope below).

**Sync discipline**: `github_patch_file` only for the twelve documents, never a full `put_file`
(a full put is what put the stray payload fragment in all twelve on 2026-09-19/20). `[skip ci]` in
every commit message. Never `git push`.

---

## SCOPE — what is deliberately NOT being documented

- **The concurrent session's work is out of scope**: `nba/PP_PAYOUT_FINDINGS.md`, `nba/pp_payout_map.py`,
  `nba/probe_pp_*.py`, `.github/workflows/nba-pp-payout-map.yml`, its trigger files, bot commits under
  `nba/data/pp_payouts/`, and the Postgres objects `nba_market.pp_price_key`, `nba_market.pp_price`,
  view `nba_market.pp_leg_price`, `nba_config.pp_pricing_model`, `nba_config.pp_slip_rules`.
  **It belongs to a session this sweep has not reached.** When the sweep reaches it,
  `PP_PAYOUT_FINDINGS.md` is the map and several of its findings correct existing documents — each to
  land as a supersession **in its chronological place**, never backported.
- **MLB is dropped** (owner, 2026-09-21). What is already recorded stays as cross-system context; no
  further MLB investigation.
- **The live system is documented, never changed** — no code, data, workflow or schema writes.
  `SELECT` and read-only greps only, tagged `[LIVE-AUDIT]`.

---

## TRANSCRIPTS CLOSED

| # | Transcript | Passes | Findings / segments | Ratio | Closed |
|---|---|---|---|---|---|
| T1 | phase1-static | 89 (88 counted, 55 VOID) | — | — | 2026-09-21 |
| T3 | phase3a-final | 14 | 64 / 466 | 1 per 7.3 | 2026-09-21 |
| T2 | phase3a-enrichment | **19** (18 counted, 13 VOID) | re-read ~42 / ~367 | **1 per ~9** | **2026-09-21** ✅ |

**T2 closed twice.** First at pass 11 — procedurally correct, but on a shallow read (**1 per ~34**).
Reopened on that measurement alone. The re-read improved yield **3.8×** and produced the two 🔴🔴
findings below. **Closed the second time on three consecutive clean passes at three different
angles**: live numeric re-verification (18/18 claims matched), cross-document consistency, and the
two-direction judgment pass. A fourth angle — the **mid-band seam at 0.40–0.45**, which neither the
tail read nor the judgment band looks at — produced the single sharpest finding of the transcript.

*Three corrections to this sweep's own prose were caught by judgment passes rather than by reading:
the `raw_json` undercount, a "contradiction" that was itself the future-leaking-backward error, and
an absence-assertion drafted on a stale clone. Each recorded where it happened.*

*(Ratio is diagnostic only. On a re-read a falling ratio is the expected shape of approaching
exhaustion, not a warning — the two-direction judgment pass is the closure signal.)*

---

## HEADLINE FINDINGS SO FAR, BY SEVERITY

### 🔴🔴 Season-critical / owner action
1. **Live balldontlie.io API key committed** in `NBA_MASTER_SUMMARY.md` and in the transcripts.
   **Rotation is the only real remedy** — the value is in git history since pass 19. *OWNER DECISION,
   already handed off.*
2. **Regular season opens 2026-10-20, not 2026-10-03** — `[LIVE-AUDIT]` verified:
   `nba_calendar.games` prefix 001 (preseason) 66 games 10-03→10-16; prefix 002 (regular) 1,200 games
   10-20→2027-04-11. **Every urgency label keyed to 10-03 is 17 days early.** The 40 in-document
   references are left as-is where they sit inside verbatim transcript quotes.
3. **Entire NBA static layer frozen at build date** — all nine tables last written 2026-08-31→09-03,
   never refreshed since. Cause left OPEN per Rule 6.
4. **`raw_json` is a double-encoded JSON string across the NBA JSONB surface** — 17,902 rows / 14
   tables, every NBA JSONB column except three. Fails silently: `?`, `->>`, `@>` all return
   false/NULL/no-rows rather than erroring. Scoring is clean (the three unaffected columns are the
   ones scoring depends on). Fully recoverable — longest value 601 chars, none truncated.
5. **Schedule not refreshed / 2026-27 slate 30 games short** of the prior season's 1,230.
6. **DARKO discards `x_minutes`.**

7. **`ok` IS THE CERTIFICATION VERDICT, NOT A SUCCESS FLAG — across 18 workers** — and for teams the
   check is **circular**: certification is `active_nba_teams === 30`, and the hardcoded fallback is a
   30-team list, so **serving the fallback satisfies the check by construction.** The fallback
   *trigger* (`teams.length !== 30`) and the *certification* (`=== 30`) share the same magic number
   and fail together: a real 32-team response trips into the fallback, and the fallback then
   certifies. **A certified teams run is not evidence of live data; it is evidence of thirty rows.**

### ⚠⚠ Structural
- **The teams fallback has two triggers**, and `…AFTER_COUNT_MISMATCH` fires on a *successful* fetch
  whose count ≠ 30 — an equality test, so **32 teams fails it exactly as 29 does**.
- **A fallback run and a live run return identical certification strings**; only `source_key` and
  `fetch_method` differ, and the `fetch_note` field that said so was deleted.
- **Season-rollover trap in four workers** — three hardcoded season literals plus the hardcoded
  cardinality above.
- **Play-type scraper drops 8 columns**; registry mislabels play-type coverage; differential snapshot
  is delete-then-insert.

### ⚠ Process / documentation
- **The NBA layer reintroduced a bug MLB had apparently fixed a month earlier** — the
  lessons-transfer mechanism (`NBA_LESSONS_LEARNED_FROM_MLB.md`) did not carry it.
- **`sweep_coverage.py` is committed but not reproducible** — the corpus is not in the repo.
- **Stray tool-payload fragment ended all twelve documents** — cause found (twelve `put_file` calls,
  2026-09-19/20, closing tags typed into the `content` argument), **fixed 2026-09-21**.
- **A `§T2.n` numbering collision** exists between the sweep series and the legacy body series.

---

## AUTONOMOUS DECISIONS

*Recorded as taken, with the alternatives rejected. None of these waited for the owner.*

| # | Decision | Alternatives rejected | Rule relied on |
|---|---|---|---|
| A1 | **Pass 16 uses the mid-band 0.40–0.45 plus a live-verification sample**, not a repeat of the two-direction run. | Re-running pass 15 unchanged. | The pass rule's *"different real samples and different angles — a pass is not a re-run."* |
| A2 | **The stray fragment was fixed, not merely documented.** | Leaving it and recording it. | Owner instruction that *document-don't-fix* governs the system being documented, not the deliverable. Cause was established first (no live write helper), so the strip is permanent. |
| A3 | **Twelve commits to strip the fragment, not one.** | Waiting for a batch-commit capability. | The bridge writes one file per call; an atomic twelve-file commit is not available. Identical message `(n/12)` so they read as one change. |
| A4 | **The 40 in-document `2026-10-03` references were NOT rewritten.** | A global find-and-replace. | Many sit inside verbatim transcript quotes; rewriting a quote to match a later correction falsifies the record the set exists to keep. One authoritative correction entry instead. |
| A5 | **My own `raw_json` undercount (1,306/6 vs 17,902/14) was recorded, not silently replaced.** | Swapping the number quietly. | The change-tracking rule: record what it was, what superseded it, and why. |

---

## OWNER DECISIONS PENDING

| # | Item | Why it needs the owner |
|---|---|---|
| O1 | **Rotate the balldontlie.io API key.** | The fix is an action outside the repo; redacting the line does not remove it from git history. |
| O2 | **DARKO debug artifact** — owner said he would take it up. | Already acknowledged by the owner. |
| O3 | **`raw_json` re-encode** — writers plus an in-place `(col #>> '{}')::jsonb` backfill. | Both are writes to the live system, which this sweep does not make. |

---

## RUN HISTORY

| UTC | Event |
|---|---|
| 2026-09-21 05:36 | Unattended mode begins. Run log created. T2 at CLEAN 1/3, 15 passes. Next: T2 pass 16. |
