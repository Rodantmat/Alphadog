# NBA ALPHADOG — DOCUMENTATION TASK
### A complete, self-contained work order. Read this entire file before starting.

**Created:** 2026-09-20
**Intended runner:** Claude Cowork (continuous execution, no check-ins)
**Repo:** the AlphaDog repo, branch `main`
**Working folder:** `nba/`

---

# PART 0 — WHAT THIS IS

You are documenting a real, live sports-analytics system (**AlphaDog NBA**) by reading **20 raw
session transcripts**, end to end, and writing what you find into **12 mandated documents**.

The system is already built. **You are not building or fixing anything.** You are producing the
permanent written record of what was built, how, why, and what remains open.

**This task was started in two prior sessions and is roughly 10% complete.** Those sessions produced
the 12 documents in their current state and got partway through the first transcript. **Your job is
to finish it.**

---

# PART 1 — THE ABSOLUTE RULES

These come directly from the system owner. They are not guidelines.

### 1.1 — Work continuously. Do not stop to report.
- **Do not report back after each pass.** Do not ask permission to continue. Do not summarise and
  wait.
- **Run pass after pass after pass**, continuously, until the work is genuinely finished or the
  session ends on its own.
- The owner's words: *"I want you to do multiple passes until your session has no more way to keep
  going or you finish the three consecutive passes. It's not feasible for you to be interacting with
  me all the time. That's the whole point — for you to do it automated."*
- **Minimum 20 passes per working block.** A "pass" = one extraction cycle (read a passage → record
  findings into the relevant documents).

### 1.2 — The three-consecutive-clean-pass rule
- A transcript is **DONE** only after **3 consecutive passes that find nothing new across all 12
  documents**.
- **Each pass must use a different sample and a different angle** — not the same query with a
  different threshold.
- **Any new finding, of any size, resets the count to zero.** Severity is irrelevant.
- This applies **per transcript**. Twenty transcripts, each needing 3 consecutive clean passes.
- **Precedent:** the MLB equivalent of this work needed **13 total passes** on one artefact before
  reaching 2 consecutive clean ones. **Expect this to take many passes. That is normal and
  expected.**

### 1.3 — Zero skipping
- **Transcript file by transcript file, line by line, message by message.**
- Every message must be accounted for. Small items, large items, important, less important — all of
  it.
- *"Do not hide or skip content. Zero skipping, zero excuses."*
- Start from **the very first message of T1** and work to **the last message of T20**.

### 1.4 — Do not fix anything
- **You document. You do not repair.**
- If you find a bug, an error, a gap, a contradiction — **write it down in `NBA_OPEN_ITEMS.md` and
  move on.**
- Fixes happen **after** the documentation is complete, as a separate exercise.
- **Read-only against the live system.** You may run `SELECT` queries to verify facts. You may not
  write to the database, deploy, or modify any worker, script, or config.

### 1.5 — Date every update
- Information flows **oldest → newest**.
- Every update to a document carries a **date reference** so the reader can tell new from old.
- Format: `*Recorded 2026-09-20.*` or `*(T7, recorded 2026-09-20)*`.
- **Track the history**: updates, adjustments, improvements, fixes, supersessions. When something
  changed, say what it was before and what changed it.

### 1.6 — Language strength must never exceed evidence strength
- Mark every claim by **how it was established**:
  - **VERIFIED** — a live SQL query or a direct grep of the actual file. Say which.
  - **NOT RECORDED** — absent from transcripts and targeted search. This is weaker, and the file
    must say so.
- The words **"confirmed"**, **"proven"**, **"validated"** require the full standard, not a good
  number.
- *"A strategy that merely avoids being worse than some baseline should never be described using the
  language reserved for one shown to genuinely outperform it."*

### 1.7 — No drama
- *"I don't want drama, excuses, bullshit."*
- Don't narrate difficulty. Don't apologise. Don't pad. Extract, record, continue.

---

# PART 2 — THE 12 MANDATED DOCUMENTS

All live in `nba/`. **All 12 already exist** — you are extending them, not creating them.
**Every pass must consider all 12**, not a subset. (A prior session failed by sweeping T3–T9 against
only 4 documents; those clean counts were voided. Do not repeat this.)

| # | File | What goes in it |
|---|---|---|
| **1** | `NBA_MASTER_SUMMARY.md` | **Per-transcript.** Everything done in that transcript — small, big, important, less important. Every message included. Any progress or system update listed. Deep detail, separated by transcript, so a reader knows where to look for more. |
| **2** | `NBA_GLOSSARY.md` | Every material term, keyword, concept, table, worker, factor code → **which transcript, and where in it**. Anything appearing more than once must be here. |
| **3** | `NBA_RECIPE.md` | The build, as a **cake recipe**. Each step, in order, as it was actually done. |
| **4** | `NBA_SYSTEM_ARCHITECTURE.md` | Infrastructure, compute, every external tool and source: GitHub and how it's used, Postgres/Hyperdrive, the proxy, Gemini, ParlayAPI, The Odds API, stats.nba.com, the MCP bridge, deploy pipeline — plus every gotcha discovered about each. |
| **5** | `NBA_DATABASE.md` | **Every schema, table and column.** What each is for, what it holds, row counts, keys, and any important specifics. |
| **6** | `NBA_WORKERS.md` | **Every worker, scraper and script.** Paths, functions, modes, env vars, what it does, how it's wired. |
| **7** | `NBA_SYSTEM_DESIGN.md` | **The 3 pipelines** (P1 weekly static, P2 overnight heavy, P3 afternoon live) in detail — behaviour, order, dependencies, timing, and the reasoning behind each. |
| **8** | `NBA_OPEN_ITEMS.md` | Deferred, dropped, partial, postponed, caveats, waiting, incomplete — **plus every bug and error found along the way**. |
| **9** | `NBA_BASELINE_CALIBRATION.md` | The **baseline/classification pipeline's calibration**: the hit-probability formula, tiers, granulation, bonuses, penalties, caps, shrinkage, distributions, ladder logic — anything touching how the baseline number is produced and calibrated. |
| **10** | `NBA_FINAL_SCORING_CALIBRATION.md` | The **enrichment/final pipeline's calibration**: final hit probability, final confidence, final score, every formula, tier, bonus, penalty, cap and rule in the enrichment layer. |
| **11** | `NBA_MULTIPLIERS.md` | **Anything about multipliers on any app.** Formulas, logic, references, tests, slips, examples, observed values, and the calibration of multipliers across PrizePicks, Underdog, Sleeper, Betr, Fliff. |
| **12** | `NBA_GOBLIN_DEMON.md` | **Goblin/demon ingestion for PrizePicks.** Parsing, anchors, invisible anchors, switch lines, regular-line anchors, goblins/demons on Less and More, above and below the anchor, the ladders, and everything else on this taxonomy. |

---

# PART 3 — CURRENT STATE (as of 2026-09-20)

### 3.1 — Transcript status

| T# | Clean count | Status |
|---|---|---|
| **T1** | **0 / 3** | **ACTIVE.** ~30 passes done. Still finding new material on every pass. |
| T2 – T9 | **0 / 3** | **RESET / VOID.** Earlier clean counts were earned against only 4 of 12 documents. Must be fully re-swept. |
| T10 – T20 | **0 / 3** | **NOT STARTED.** |

### 3.2 — Where T1 stands
T1 contains four complete handoff documents. The sweep has worked through:
- ✅ The 26 lessons (Part A)
- ✅ Parts B, C, D, E, F of the lessons document
- ✅ Blueprint §1 – §7e

**Next unread: blueprint §7f onward**, then §8+, then the remaining sections of the Domain Mapping
and System Draft documents.

**Resume method:** `grep -oai "7f\..\{950\}"` against T1, or grep the last phrase recorded in
`NBA_FINAL_SCORING_CALIBRATION.md` / `NBA_OPEN_ITEMS.md` with a `.\{950\}` tail.

### 3.3 — The DRIFT NOTICE
`NBA_MASTER_SUMMARY.md` carries a notice recording that T3–T9's prior clean passes were against 4 of
8 documents and are void. **Leave it there.** It is the honest record of a gap, per the
documentation-honesty discipline. Update it only when those transcripts are genuinely re-swept.

---

# PART 4 — HOW TO READ THE TRANSCRIPTS

Location: **`nba/transcripts/`** — see that folder's `README.md` for the full index and T-numbering.

### 4.1 — Format
Each file is a **JSON-escaped text dump**, 2–3.6 MB:
- `\u2014` = em-dash, `\u2705` = ✅, `\\n` = newline, `\\"` = quote
- **Never `cat` one.** It will flood your context.

### 4.2 — The effective read method
```bash
grep -oai "known phrase.\{950\}" <transcript>.txt | head -1
```
This returns the match plus the next ~950 characters. **To walk forward through a long passage,
grep the last 6–8 words you just read, again with a `.\{950\}` tail.** This is how the prior sessions
covered T1's handoff documents without ever loading the file.

### 4.3 — Finding new angles (required by the pass rule)
Each pass must differ. Rotate among:
- **Section headers**: `grep -oai "## [0-9]\..\{130\}"` / `"### [0-9][a-z]\..\{130\}"`
- **Owner's messages** — instructions, decisions, corrections, rejections
- **Numbers**: `grep -oai "[0-9]\{1,3\}\.[0-9] pp"` / row counts / percentages
- **Table and column names**: `nba_`, `_ladder`, `_config`
- **Verdict language**: `CERTIFIED`, `NOT yet`, `deferred`, `rejected`, `retracted`, `dropped`
- **Bug language**: `bug`, `wrong`, `failed`, `silently`, `never`, `should have`
- **Code**: file names, function names, env vars
- **Cross-references**: things one transcript says another established

---

# PART 5 — WHAT COUNTS AS A FINDING

Record **all** of these:

- A **fact** about the system — a value, a table, a column, a path, a parameter
- A **decision** and its reasoning — including decisions *not* to do something
- A **rejection** — a factor closed, an approach abandoned, and **why**
- A **bug**, past or present, fixed or open
- A **caveat**, assumption, or estimated-not-measured parameter
- A **contradiction** — two places in the record disagreeing (flag it; do **not** resolve by guessing)
- A **correction** — where something recorded earlier turned out wrong
- A **measurement** — with its sample size and how it was established
- **Anything the owner said** that constrains the system

### 5.1 — Verify when you can, and say that you did
Live verification is available through the bridge (`run_sql_postgres`, `github_grep_file`,
`github_get_file`). **A single query often converts a "not recorded" into a VERIFIED fact.**

Two prior examples worth imitating:
- A concern that the ladder's tier assignment might have a rounding-convention bug was **checked by
  grepping the recipe** — tier assignment uses interval comparison, not rounding. **Concern
  correctly downgraded.**
- A note claiming "no magnitude sanity check on the Platt fit" was **wrong** — grepping the recipe
  found `if shift > 0.15: continue`. **The earlier note was corrected.**

**Correcting your own earlier entries is expected and valuable.** Mark corrections clearly and date
them.

---

# PART 6 — EXECUTION LOOP

Repeat continuously:

```
1. Pick the active transcript (T1 first; only move on at 3 consecutive clean).
2. Pick an angle NOT used in the last 2 passes.
3. grep a passage.
4. Extract every finding.
5. Route each finding to the correct document(s) — often more than one.
6. Write it with: the quote or fact, what it means for NBA specifically,
   VERIFIED-vs-NOT-RECORDED status, and the date.
7. If nothing new was found → clean_count += 1. Otherwise → clean_count = 0.
8. At 3 consecutive clean → mark the transcript DONE in NBA_MASTER_SUMMARY.md
   with its final pass count, and move to the next.
9. Go to 1. Do not stop. Do not report.
```

### 6.1 — Writing to the documents
Use `github_patch_file` (find-and-replace, server-side) — several documents are 130–400 KB and
**cannot be round-tripped through context**. Use `github_grep_file` to locate an anchor, then patch
against it.

**Never rewrite a whole large document.** Patch precisely.

### 6.2 — Keep documents navigable
Headed sections, tables where they aid scanning, quotes for anything said verbatim. Someone should be
able to find a specific fact months from now without reading the whole file.

---

# PART 7 — CONTEXT YOU NEED

### 7.1 — What the system is
**AlphaDog NBA** predicts hit probabilities for NBA player props on DFS pick'em apps (PrizePicks,
Underdog, Sleeper, Betr, Fliff). It is an expansion of a live MLB system, sharing infrastructure but
with its own Postgres schemas, workers and models.

### 7.2 — The three pipelines
- **P1 — weekly static** — Mondays 12:00 PT. Reference and season-aggregate data.
- **P2 — overnight heavy** — 01:00 PT daily. Delta mining, grading, calibration refit, baseline build.
- **P3 — afternoon live** — 1:15 PM PT daily. Board scrape → context → market → scoring.

### 7.3 — Key facts (all VERIFIED)
- Season opens **2026-10-03**
- `nba_score.baseline_history` = **19.3M rows**; `final_hp` = **38.7M rows**
- `nba_market.board_outcomes` = **6.9M graded legs**
- `nba_stats.player_game_log` = **79,358 player-games**, 3 seasons
- `nba_calendar.games` = **2,666 games**
- `nba_ref.arenas` = 30 rows, **`altitude_ft` and `timezone` are 0-of-30 populated**
- The weekly differential worker is **built but never scheduled** — all three log tables empty,
  snapshot frozen since 2026-09-03

### 7.4 — The most important single transcript
**T1** carries the four handoff documents, including the lessons document — described in it as
*"the single most important document in this transfer package."* It contains 26 numbered lessons plus
Parts A–F on research methodology, statistical discipline, and infrastructure gotchas. **Much of what
the other 19 transcripts do is application of what T1 specifies.**

---

# PART 8 — TOOLS

| Tool | Use |
|---|---|
| `github_grep_file` | Search inside a repo file server-side. **Use before every patch.** |
| `github_patch_file` | Find-and-replace in a repo file. **The primary write tool.** |
| `github_get_file` | Read a small repo file whole. Not for the big docs. |
| `github_list_dir` | List a repo folder. |
| `run_sql_postgres` | **SELECT only.** Verify facts against the live database. |
| `run_sql` | D1 — legacy, decommissioned. Rarely needed. |
| bash / grep | Reading the transcripts. |

**Do not use**: `run_job`, any deploy trigger, any write to the database. **This task is read-only
against the running system.**

---

# PART 9 — DONE

The task is complete when **all 20 transcripts** have **3 consecutive clean passes across all 12
documents**.

At that point, and only then, write a completion entry in `NBA_MASTER_SUMMARY.md` giving the final
pass count per transcript.

**Until then: keep going.**

---

## THE OWNER'S OWN WORDS, VERBATIM

> *"I need you to look the full transcripts, one by one!"*

> *"You will do transcript file by transcript file, line by line, message by message. Updating the
> files precisely, zero skipping, zero excuses!"*

> *"Do not hide or skip content — summary is to summarize our conversation and messages, but must
> include everything done with deep detail!"*

> *"I want it from message one, the very first one, all the way to this very last message."*

> *"You are to comply at 100%! No exceptions!"*

> *"The information comes from oldest to newest and the updates on documents must have a date
> reference, so we know what is new and what is older."*

> *"Do multiple passes, even if multiples are needed within the same transcript file — nothing can be
> left behind, lost, or mis-documented."*

> *"Each full transcript file needs multiple passes, and at least 3 consecutive passes without having
> new points not documented. If you had 2 passes and nothing new, but in the third you have something
> new, the count restarts — and that is per transcript."*

> *"You will not fix anything along this process. If any issue, it will be documented and fixed after
> you finish it."*

> *"I don't want drama, excuses, bullshit! Start now and get it done!"*

> *"You're reporting back again after each pass. I want you to do multiple passes until your session
> has no more way to keep going or you finish the three consecutive passes. That does not change.
> That's the way you must do it. It's not feasible for you to be interacting with me all the time.
> That's the whole point — for you to do it automated."*

---

*Work order written 2026-09-20 by the documentation session, from the owner's instructions as given
across this project.*
