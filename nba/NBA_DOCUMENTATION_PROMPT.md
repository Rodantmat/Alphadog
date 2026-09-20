# NBA ALPHADOG — DOCUMENTATION WORK ORDER
### Complete, self-contained. Read every section before starting.

**Created:** 2026-09-20 · **Runner:** Claude Cowork, continuous · **Repo branch:** `main` · **Folder:** `nba/`

---

# PART 0 — THE JOB IN ONE PARAGRAPH

A real, live sports-analytics system (**AlphaDog NBA**) was built across 20 working sessions. Those
sessions were transcribed. Your job is to read all 20 transcripts **end to end, line by line** and
write everything you find into **12 mandated documents**, so that the complete record of what was
built — and why, and what is still broken or unfinished — exists permanently in writing. The system
is already built. **You are not building or fixing anything.** Two prior sessions produced the
documents in their current state and completed roughly 10% of the sweep. **Finish it.**

---

# PART 1 — THE ABSOLUTE RULES

From the system owner, verbatim where quoted. These are not guidelines.

## 1.1 Work continuously. Do not stop to report.
> *"You're reporting back again after each pass. I want you to do multiple passes until your session
> has no more way to keep going or you finish the three consecutive passes. I already told you that
> does not change. That's the way that you must do it. It's not feasible for you to be interacting
> with me all the time. That's the whole point — for you to do it automated."*

- **Do not summarise and wait.** Do not ask permission. Do not check in between passes.
- **Minimum 20 passes per working block.** A pass = one full extraction cycle (Part 6).
- The only acceptable stopping condition is the work being finished, or the session ending on its own.

## 1.2 The three-consecutive-clean-pass rule
- A transcript is **DONE** only after **3 consecutive passes that find nothing new across all 12
  documents.**
- **Each pass must use a different sample and a different angle** — explicitly *not* "the same query
  with a different threshold."
- **Any new finding, of any size, resets the count to zero.** Severity is irrelevant. A single new
  detail on pass 3 sends you back to 0.
- Applied **per transcript**. Twenty transcripts × 3 consecutive clean each.
- **Precedent, from the system's own lessons document:** a comparable scrutiny effort *"would have
  stopped after an early clean-seeming pass"* but instead *"kept finding genuinely new, real issues
  across **13 total passes** before finally reaching two consecutive clean ones."* The owner set
  **three** where that precedent used two. **Expect double-digit pass counts per transcript. That is
  the rule working, not failing.**

## 1.3 Zero skipping
> *"You will do transcript file by transcript file, line by line, message by message. Updating the
> files precisely, zero skipping, zero excuses!"*
> *"Do not hide or skip content — summary is to summarize our conversation and messages, but must
> include everything done with deep detail!"*
> *"I want it from message one, the very first one, all the way to this very last message."*

## 1.4 Do not fix anything
> *"You will not fix anything along this process. If any issue, it will be documented and fixed after
> you finish it."*

- Bug, error, gap, contradiction → **write it into `NBA_OPEN_ITEMS.md` and move on.**
- **Read-only against the live system.** `SELECT` queries to verify facts: yes. Writes, deploys, job
  triggers, worker edits, config changes: **no.**

## 1.5 Date every update; track the history
> *"The information comes from oldest to newest and the updates on documents must have a date
> reference, so we know what is new and what is older."*
> *"You must keep track of the updates, adjustments, improvements, the fixes and everything else
> important."*

- Tag entries: `*Recorded 2026-09-20.*` or `*(T7, recorded 2026-09-20)*`
- When something **changed**, record what it was before and what superseded it. A value that was
  revised, a decision reversed, a factor retracted — the history is part of the record.

## 1.6 Language strength must never exceed evidence strength
Mark every claim by how it was established:

| Tier | Basis | How to write it |
|---|---|---|
| **VERIFIED** | a live SQL query, or a direct grep of the actual file | say which: *"verified by grep of `classification_ladder_v12.py` 2026-09-20"* |
| **NOT RECORDED** | absent from transcripts and targeted search | *"not recorded as built"* — and flag that this is weaker evidence |

- **"confirmed" / "proven" / "validated"** require the full standard, not a good-looking number.
- *"A strategy that merely avoids being worse than some baseline should never be described using the
  language reserved for one shown to genuinely outperform it."*
- **A confident negative is the easiest mistake to make.** The system's own lessons document records
  a case where *"a confident claim that 'no automated mining worker exists' was wrong — the logic
  existed as an internal step inside a larger, differently-named runner file, invisible to a
  file-name-pattern search."* Before writing "X does not exist," search the internal step lists of
  larger runner files, not just filenames.

## 1.7 No drama
> *"I don't want drama, excuses, bullshit! Start now and get it done!"*

Do not narrate difficulty. Do not apologise. Do not pad. Extract, record, continue.

---

# PART 2 — THE 12 MANDATED DOCUMENTS

All in `nba/`. **All 12 already exist** — extend them, do not recreate them.
**Every pass must consider all 12.** A prior session swept T3–T9 against only 4 documents; those
clean counts were voided and must be redone. **Do not repeat that failure.**

### 1 · `NBA_MASTER_SUMMARY.md` — 395 KB
**Per-transcript record of everything done.** Small, big, important, less important — every message
accounted for. Any progress or system update listed. Deep detail. Organised by transcript so a reader
who needs more can find which transcript to open. **Also holds the pass-count ledger and the DRIFT
NOTICE.**

### 2 · `NBA_GLOSSARY.md` — 23 KB
**Every material term → where to find it.** Keywords, concepts, table names, worker names, factor
codes (A2, B4, M1, N1, D1…), prop keys, config keys. For each: which transcript, and where in it.
**Anything appearing more than once must be here.** This is the index the other documents rely on.

### 3 · `NBA_RECIPE.md` — 17 KB
**The build as a cake recipe.** Each step in the order it was actually done, from the founding
constraints through to the current pipelines. Someone should be able to follow it and understand how
the system came to exist in this shape.

### 4 · `NBA_SYSTEM_ARCHITECTURE.md` — 82 KB
Infrastructure and every external tool or source: **Cloudflare Workers, the deploy pipeline and its
generator, Postgres via Hyperdrive, the MCP admin bridge, GitHub (and exactly how it is used as both
code store and data transport), the proxy/`curl_cffi` impersonation, Gemini, ParlayAPI, The Odds API,
stats.nba.com, BallDontLie, DARKO, Wikipedia** — plus **every gotcha discovered about each one.**

### 5 · `NBA_DATABASE.md` — 43 KB
**Every schema, table and column.** What each is for, what it holds, row counts, primary keys,
indexes, and important specifics. Include tables that were planned and never created, and say so.

### 6 · `NBA_WORKERS.md` — 32 KB
**Every worker, scraper and script.** Path, what it does, its functions, its modes and env vars, how
it is wired into dispatch, its schedule (or absence of one). Include the four-step wiring pattern and
the mode-dispatch table.

### 7 · `NBA_SYSTEM_DESIGN.md` — 32 KB
**The three pipelines in detail.** P1 weekly static, P2 overnight heavy, P3 afternoon live: their
steps in order, behaviour, dependencies, timing, the reasoning behind each choice, and the failure
modes each ordering prevents or creates.

### 8 · `NBA_OPEN_ITEMS.md` — 199 KB
**Deferred, dropped, partial, postponed, caveats, waiting, incomplete — plus every bug and error
found along the way.** Past bugs (with their fix) and present ones. Season-start-critical items
flagged as such. **This is the document the owner will act on after documentation completes.**

### 9 · `NBA_BASELINE_CALIBRATION.md` — 55 KB
**The baseline/classification pipeline's calibration.** The hit-probability formula, tiers,
granulation, bonuses, penalties, caps, shrinkage, distribution families, the ladder, Platt
calibration, minutes model — anything touching how the baseline number is produced and calibrated.

### 10 · `NBA_FINAL_SCORING_CALIBRATION.md` — 131 KB
**The enrichment/final pipeline's calibration.** Final hit probability, final confidence, final
score, every formula, tier, granulation, bonus, penalty, cap and rule in the enrichment layer — plus
the research standard (the 26 lessons) that governs how any of it may be changed.

### 11 · `NBA_MULTIPLIERS.md` — 30 KB
**Anything about multipliers on any app.** All formulas, logic, references, tests, slips, examples,
observed values, and the calibration of multipliers across **PrizePicks, Underdog, Sleeper, Betr,
Fliff.** Payout structures, Power vs Flex, same-game discounts, the `p × m` gate.

### 12 · `NBA_GOBLIN_DEMON.md` — 30 KB
**Goblin/demon ingestion for PrizePicks.** Parsing, anchors, **invisible anchors**, switch lines,
regular-line anchors, goblins and demons on **Less and More**, **above and below** the anchor, the
ladders, tier signing, and everything else on this taxonomy.

---

# PART 3 — CURRENT STATE (2026-09-20)

## 3.1 Pass ledger

| T# | Clean count | Status |
|---|---|---|
| **T1** | **0 / 3** | **ACTIVE.** ~30 passes done. Still producing new material on essentially every pass. |
| T2 – T9 | **0 / 3** | **VOID.** Prior clean counts were earned against only 4 of 12 documents. Full re-sweep required. |
| T10 – T20 | **0 / 3** | **NOT STARTED.** |

## 3.2 Where T1 stands
T1 is the densest transcript: it carries **four complete handoff documents** inside it —
the **Architecture Blueprint**, the **Lessons-Learned-From-MLB** document (26 numbered lessons plus
Parts A–F), the **Domain Mapping & Startup Plan**, and the **System Draft**.

Swept so far:
- ✅ All 26 lessons (Part A)
- ✅ Parts B, C, D, E, F
- ✅ Blueprint §1 through §7e

**Next unread: blueprint §7f onward**, then §8+, then the remaining Domain Mapping and System Draft
sections, then the conversational body of the transcript itself.

**How to resume:** grep the last phrase recorded in `NBA_FINAL_SCORING_CALIBRATION.md` or
`NBA_OPEN_ITEMS.md` against T1 with a `.\{950\}` tail — that continues exactly where the sweep
stopped. Or `grep -oai "### 7f\..\{950\}"`.

## 3.3 The DRIFT NOTICE
`NBA_MASTER_SUMMARY.md` carries a notice that T3–T9's prior clean passes were against 4 of 8
documents and are void. **Leave it in place.** It is the honest record of a gap, per the
documentation-honesty discipline the system's own lessons require. Update it only when those
transcripts are genuinely re-swept.

---

# PART 4 — READING THE TRANSCRIPTS

Location: **`nba/transcripts/`** · index and T-numbering: that folder's `README.md`

## 4.1 Format
Each file is a **JSON-escaped text dump**, 1.9–3.6 MB:
- `\u2014` = em-dash · `\u2705` = ✅ · `\\n` = newline · `\\"` = quote
- **Never `cat` one.** It will flood your context and end the session's usefulness.

## 4.2 The read method that works
```bash
grep -oai "known phrase.\{950\}" nba/transcripts/<file>.txt | head -1
```
Returns the match plus the next ~950 characters. **To walk forward through a long passage, grep the
last 6–8 words you just read, again with a `.\{950\}` tail.** This is how the prior sessions covered
T1's entire handoff-document body without ever loading the file.

**Worked example** — reading a lesson in sequence:
```bash
grep -oai "### 6\. Statistical significance done properly.\{600\}" T1.txt | head -1
# ...ends at "collapsing to a clustered t-st"
grep -oai "collapsing to a clustered t-st.\{700\}" T1.txt | head -1
# ...ends at "The correct method weights each day's contribution"
grep -oai "The correct method weights each day.s contribution.\{550\}" T1.txt | head -1
```
Note the `.` standing in for the apostrophe — escaping matters in these files.

## 4.3 Angle rotation — required by rule 1.2
Every pass must use a genuinely different angle. Rotate:

| Angle | Example |
|---|---|
| Section headers | `grep -oai "## [0-9]\..\{130\}"` · `"### [0-9][a-z]\..\{130\}"` |
| **Owner's own messages** | instructions, decisions, corrections, rejections, constraints |
| Numbers | `"[0-9]\{1,3\}\.[0-9] pp"` · row counts · percentages · sample sizes |
| Table / column names | `nba_` · `_ladder` · `_config` · `_snapshot` |
| Verdict language | `CERTIFIED` · `NOT yet` · `deferred` · `rejected` · `retracted` · `dropped` |
| Bug language | `bug` · `wrong` · `failed` · `silently` · `never` · `should have` |
| Code identifiers | file names · function names · env vars · constants |
| Cross-references | things one transcript claims another established |
| Negative space | what a section *promises* and never delivers |

**The four axes that make a pass genuinely different** (from the system's own lesson #3):
measurement (raw rate vs model estimate) · pooling level (player vs prop-line) · structure
(single-factor vs multi-layered) · domain-specific interaction.

---

# PART 5 — WHAT COUNTS AS A FINDING

Record **all** of these:

- A **fact** — a value, table, column, path, parameter, row count
- A **decision and its reasoning** — including decisions *not* to do something
- A **rejection** — a factor closed, an approach abandoned, **and why**
- A **bug** — past or present, fixed or open
- A **caveat** — an assumption, or a parameter that is estimated rather than measured
- A **contradiction** — two places in the record disagreeing. **Flag it; do not resolve by guessing.**
  The lessons document is explicit: a config flag contradicting its own note *"was explicitly flagged
  for direct human confirmation of intent"* rather than silently fixed.
- A **correction** — where something recorded earlier turned out wrong
- A **measurement** — with its sample size and how it was established
- **Anything the owner said** that constrains the system

## 5.1 Verify when you can
`run_sql_postgres`, `github_grep_file` and `github_get_file` are available. **One query often converts
a "not recorded" into a VERIFIED fact.** Two real examples from the prior sessions:

- A worry that tier assignment had a rounding-convention bug (the lessons document records a real
  case costing **14.5% row disagreement**) was **checked by grepping the recipe**. Tier assignment
  uses interval comparison (`lo <= m < hi`), not rounding. **Concern correctly downgraded.**
- A note claiming *"no magnitude sanity check on the Platt fit"* was **wrong** — grepping the recipe
  found `if shift > 0.15: continue`. **The earlier note was corrected and dated.**

**Correcting your own earlier entries is expected and valuable.** Mark corrections clearly.

## 5.2 Routing — most findings belong in more than one document

| Finding | Goes to |
|---|---|
| A new table or column | `DATABASE` + `GLOSSARY` |
| A worker's mode or env var | `WORKERS` + `GLOSSARY` |
| A pipeline step or ordering rule | `SYSTEM_DESIGN` + `RECIPE` |
| A baseline formula/tier/cap | `BASELINE_CALIBRATION` + `GLOSSARY` |
| An enrichment formula/factor | `FINAL_SCORING_CALIBRATION` + `GLOSSARY` |
| A multiplier value or rule | `MULTIPLIERS` |
| Anything goblin/demon/anchor | `GOBLIN_DEMON` |
| A bug, gap, caveat, deferral | `OPEN_ITEMS` |
| An external tool or its gotcha | `SYSTEM_ARCHITECTURE` |
| **Everything** | `MASTER_SUMMARY` (the per-transcript record) |

---

# PART 6 — THE EXECUTION LOOP

```
1. Active transcript = lowest T-number not yet at 3 consecutive clean. (T1 first.)
2. Choose an angle NOT used in the last 2 passes.
3. grep a passage.
4. Extract EVERY finding in it.
5. Route each to all relevant documents (Part 5.2).
6. Write each with: the quote or fact · what it means for NBA specifically ·
   VERIFIED-vs-NOT-RECORDED · the date.
7. Nothing new found → clean_count += 1.  Anything new → clean_count = 0.
7b. ⚠ UPDATE THE LEDGER ROW NOW. In NBA_MASTER_SUMMARY.md's transcript
    inventory table, rewrite THIS transcript's row to state: the current
    clean count · total passes run · what this pass found (or that it was
    clean) · the pass numbers of any consecutive clean run in progress.
    THE PASS IS NOT FINISHED UNTIL THE ROW MATCHES THE ENTRY JUST WRITTEN.
    If row and body ever disagree, the BODY IS AUTHORITATIVE — correct the
    row to match it, never the reverse.
8. clean_count == 3 → mark that transcript DONE in NBA_MASTER_SUMMARY.md
   with its final total pass count. Move to the next transcript.
9. Return to step 1. DO NOT STOP. DO NOT REPORT.
```

**Why 7b exists** *(owner instruction, added 2026-09-20)*: the T1 ledger row drifted **four passes**
behind the body — it still read *"29 passes"* while §T1.63 was written — and had to be corrected.
**That is the same defect class this effort already documents twice**: the `minutes_mixture`
config-vs-code drift, and `NBA_SYSTEM_ARCHITECTURE.md`'s *"two files meant to be exact copies can
silently drift out of sync, with only the self-reported version string revealing the drift."*
**It is blueprint §9 failure mode #6** — silent drift, no error thrown, output wrong-but-plausible.
**The at-a-glance state is what a future reader trusts first**, and a stale ledger is the most likely
way this effort ends early against a wrong picture of what remains.

## 6.1 Writing mechanics
- **`github_patch_file` is the primary write tool.** Find-and-replace, server-side. `old_str` must be
  unique in the file.
- **`github_grep_file` first**, always — locate a real anchor before patching against it.
- **Never rewrite a whole large document.** `MASTER_SUMMARY` (395 KB) and `OPEN_ITEMS` (199 KB) cannot
  be round-tripped through context. Patch precisely.
- If a patch fails on a non-unique `old_str`, widen it with surrounding lines until unique.

## 6.2 Keep documents navigable
Headed sections. Tables where they aid scanning. Verbatim quotes for anything stated exactly.
**Someone must be able to find a specific fact months from now without reading the whole file.**

---

# PART 7 — SYSTEM CONTEXT (so you don't re-derive it)

## 7.1 What AlphaDog NBA is
Predicts hit probabilities for NBA player props on DFS pick'em apps (**PrizePicks, Underdog, Sleeper,
Betr, Fliff**). An expansion of a live MLB system — shares infrastructure, has its own Postgres
schemas, workers and models. **Season opens 2026-10-03.**

## 7.2 The three pipelines
| Pipeline | Schedule | Does |
|---|---|---|
| **P1 — weekly static** | Mondays 12:00 PT | reference data, season aggregates |
| **P2 — overnight heavy** | 01:00 PT daily | delta mining → grading → calibration refit → baseline build |
| **P3 — afternoon live** | 1:15 PM PT daily | board scrape → daily context → market → scoring |

## 7.3 Key facts, all VERIFIED
- `nba_score.baseline_history` = **19.3M rows** · `final_hp` = **38.7M rows**
- `nba_market.board_outcomes` = **6.9M graded legs**
- `nba_stats.player_game_log` = **79,358 player-games**, 3 seasons
- `nba_calendar.games` = **2,666 games** · `nba_ref.prop_taxonomy` = **28 props**
- `nba_ref.arenas` = 30 rows, **`altitude_ft` and `timezone` are 0-of-30 populated**
- `nba_config.factor_registry` = 67 · `factor_relevance` = 460 · `factor_profile_cells` = 35
- The **weekly differential worker is built but never scheduled** — all three log tables empty,
  snapshot frozen since 2026-09-03
- **`minutes_mixture` in config specifies three components the recipe does not implement** — config
  and code have drifted

## 7.4 T1 is the most important transcript
Its lessons document is described inside it as *"the single most important document in this transfer
package — a research standard built the hard way, across dozens of strategy candidates, almost all of
which looked real at first and were later found to be artifacts."* **Much of what the other 19
transcripts do is application of what T1 specifies.** When a later transcript makes a choice, T1
usually explains why.

---

# PART 8 — TOOLS

| Tool | Use |
|---|---|
| `github_grep_file` | search inside a repo file server-side — **before every patch** |
| `github_patch_file` | find-and-replace in a repo file — **the primary write tool** |
| `github_get_file` | read a small repo file whole — not for the big documents |
| `github_list_dir` | list a repo folder |
| `run_sql_postgres` | **SELECT only** — verify facts against the live database |
| bash / grep | reading the transcripts |

**Do not use:** `run_job`, any deploy trigger, any database write. **Read-only against the running
system.**

---

# PART 9 — FAILURE MODES THAT HAVE ALREADY HAPPENED HERE

Avoid each of these; they are not hypothetical.

1. **Sweeping against a subset of documents.** T3–T9 were swept against 4 of 8. All counts voided.
2. **Stopping to report after each pass.** The owner has corrected this repeatedly.
3. **Declaring something absent without searching properly.** See rule 1.6.
4. **Trusting a config table as describing behaviour.** `minutes_mixture` proves config can describe
   the *design* while the code does something else. Execution history and live code outrank config;
   config outranks static manifests and documents.
5. **Silently resolving a contradiction.** Flag it instead.
6. **Padding the reply instead of doing the work.**

---

# PART 10 — DONE

Complete when **all 20 transcripts** have **3 consecutive clean passes across all 12 documents.**

Then, and only then, write a completion entry in `NBA_MASTER_SUMMARY.md` with the final pass count per
transcript.

**Until then: keep going.**

---

## THE OWNER'S INSTRUCTIONS, VERBATIM

> *"I need you to look the full transcripts, one by one!"*

> *"Summary — you will list everything done over that transcript/conversation: small, big, important,
> less important, any progress or update in the system must be listed. Each message must be
> included."*

> *"Glossary — you will make a map for all important aspects, keywords, terms and tell exactly how
> and where to find them, on which transcript and which line/message/date and time."*

> *"Recipe — a cake recipe on how the system was built, each step done."*

> *"System architecture — it must list all system specifics, workers, external tools like sources,
> like GitHub and how it is used, Postgres, proxy, Gemini, parlay api, odds api, plus any other tools
> or sources ever used."*

> *"Database — a comprehensive complete list of all tables and columns, what they are for, what they
> hold, and any important specifics."*

> *"Workers — each one of the workers, what they do, the paths, functions, everything about each
> one."*

> *"System design — the 3 pipelines list in detail, the behavior, the order and any working
> specifics."*

> *"You will do transcript file by transcript file, line by line, message by message. Updating the
> files precisely, zero skipping, zero excuses!"*

> *"Do not hide or skip content — summary is to summarize our conversation and messages, but must
> include everything done with deep detail! Make it separated by transcripts, so if you need more
> detail, you know where to look at."*

> *"Glossary is to know exactly where to find terms and content when needed — any material term that
> shows more than once must be in the glossary."*

> *"I want it from message one, the very first one, all the way to this very last message. All
> transcripts and history for this chat."*

> *"You are to comply at 100%! No exceptions!"*

> *"The information comes from oldest to newest and the updates on documents must have a date
> reference, so we know what is new and what is older."*

> *"You must keep track of the updates, adjustments, improvements, the fixes and everything else
> important."*

> *"Do multiple passes, even if multiples are needed within the same transcript file — nothing can be
> left behind, lost, or mis-documented."*

> *"Each full transcript file needs multiple passes, and at least 3 consecutive passes without having
> new points not documented. If you had 2 passes and nothing new, but in the third you have something
> new, the count restarts — and that is per transcript, same rule applies for all of them."*

> *"I also need another file with: deferred, dropped, partial, postponed, caveats, waiting and
> incomplete functions, features, data or any other important point. Also any bug or error found
> along the way."*

> *"You will not fix anything along this process. If any issue, it will be documented and fixed after
> you finish it."*

> *"I don't want drama, excuses, bullshit! Start now and get it done!"*

> *"Baseline pipeline calibration: dedicated file about the calibration of the baseline hit
> probability and any formula, tier, granulation, bonus, penalties, caps, logic or anything else
> related to the calibration of the classification / baseline pipeline."*

> *"Final scoring engine pipeline calibration: dedicated file about the calibration of the final hit
> probability, final confidence, final score and any formula, tier, granulation, bonus, penalties,
> caps, logic or anything else related to the calibration of the enrichment / final hit probability
> pipeline."*

> *"Multipliers: anything related to multipliers for any apps. All the formulas, logic, references,
> tests, slips, examples and anything that is related to the calibration of the multipliers on any of
> the apps."*

> *"Goblin/demon identification: anything related to goblins and demons ingestion for PrizePicks. The
> parsing, anchors, invisible anchors, switch line, regular line anchor, goblins and demons less and
> more, goblins and demons over and under the anchor, goblin and demons ladders and anything else
> related to goblins and demons."*

> *"I want you, before you start any pass, to look at the previous message and this message. This is
> a must-follow rule! No exception."*

> *"You're reporting back again after each pass. I want you to do multiple passes until your session
> has no more way to keep going or you finish the three consecutive passes. I already told you that
> does not change. That's the way that you must do it. It's not feasible for you to be interacting
> with me all the time. That's the whole point — for you to do it automated."*

---

*Work order compiled 2026-09-20 from the owner's instructions as given across the full project
history.*
