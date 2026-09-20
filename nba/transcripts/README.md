---
# NBA TRANSCRIPTS — INDEX

**Folder:** `nba/transcripts/`
**Created:** 2026-09-20
**Contents:** 20 raw session transcripts + `journal.txt`
**Total size:** ~55 MB uncompressed

---

## ⚠ HOW THE FILES GET HERE

The raw transcripts are **not committed by an assistant session** — they are 2–3.6 MB each and
exceed what the GitHub Contents API can accept through a chat context.

**To populate this folder:**
1. Download `nba_transcripts.tar.gz` (~12 MB) from the chat session that produced this index.
2. Extract it.
3. Copy the `.txt` files into `nba/transcripts/` in your local clone.
4. Commit and push.

Once pushed, every file below resolves and the documentation prompt
(`nba/NBA_DOCUMENTATION_PROMPT.md`) can be run against them.

---

## THE TRANSCRIPTS, OLDEST → NEWEST

The documentation work references these by **T-number**. That numbering is **chronological by
filename** and is used throughout `NBA_MASTER_SUMMARY.md`, `NBA_OPEN_ITEMS.md` and every other
document.

| T# | File | Size | Subject |
|---|---|---|---|
| **T1** | `2026-09-03-03-22-04-nba-expansion-phase1-static.txt` | 2.4 MB | Phase 1 static data. **Contains the four handoff documents in full**: the Architecture Blueprint, the Lessons-Learned-From-MLB document (26 lessons + Parts A–F), the Domain Mapping & Startup Plan, and the System Draft. **The single densest transcript.** |
| **T2** | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt` | 2.5 MB | Phase 3a enrichment |
| **T3** | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt` | 2.2 MB | Phase 3a final — DARKO, differential layer |
| **T4** | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt` | 2.3 MB | Phase 3b backfill |
| **T5** | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt` | 1.9 MB | Phase 3c starter status |
| **T6** | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt` | 2.6 MB | Phase 3d delta pipeline |
| **T7** | `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt` | 3.2 MB | Classification/baseline design research — the factor lock |
| **T8** | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration.txt` | 2.4 MB | Baseline backtest + calibration — the ladder |
| **T9** | `2026-09-09-22-10-00-nba-baseline-production-pipeline.txt` | 3.1 MB | Baseline production pipeline |
| **T10** | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09.txt` | 3.3 MB | Enrichment backfill pipeline |
| **T11** | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10.txt` | 3.1 MB | DFS boards backfill |
| **T12** | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10.txt` | 3.2 MB | Board scrapers, Fliff |
| **T13** | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10.txt` | 3.6 MB | Boards, grader, market |
| **T14** | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12.txt` | 3.1 MB | Baseline history |
| **T15** | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12.txt` | 3.1 MB | Factors A2/N1, reliability audit |
| **T16** | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13.txt` | 3.0 MB | Blowout + matchup factors |
| **T17** | `2026-09-20-04-58-11-nba-confidence-calibration-final-engine-2026-09-19.txt` | 3.3 MB | Confidence calibration, final engine |
| **T18** | `2026-09-20-06-12-04-nba-pipelines-confidence-board-tiers-2026-09-19.txt` | 3.1 MB | Pipelines, confidence, board tiers |
| **T19** | `2026-09-20-18-46-12-nba-alphadog-documentation-pass.txt` | 3.0 MB | **Documentation pass session 1** — the 8 original documents, the drift discovery |
| **T20** | `2026-09-20-19-56-26-nba-alphadog-documentation-pass-t1-deep.txt` | 3.1 MB | **Documentation pass session 2** — T1 deep extraction, the 4 new documents created |
| — | `journal.txt` | 12 KB | Catalog of all transcripts |

---

## ⚠ NOTE ON T19 AND T20

These two are transcripts **of the documentation work itself**, not of system building. They must
still be swept like any other transcript, because they contain:
- The pass-rule definition and the DRIFT NOTICE
- Every finding extracted from T1 so far, with its reasoning
- The verification queries that were run live and their results

**They are the audit trail of the documentation, and they record which findings are VERIFIED versus
NOT RECORDED.**

---

## FILE FORMAT

Each transcript is a **JSON-escaped text dump** of a full conversation. Practical consequences:

- **Unicode is escaped**: `\u2014` for em-dash, `\u2705` for ✅, `\\n` for newlines, `\\"` for quotes.
- **`grep -oai "pattern.\{N\}"` is the effective read method** — it returns a match plus the next N
  characters, which is how you walk through a long passage without loading the file.
- **Never `cat` one of these files** — 2–3.6 MB will flood any context.
- Searching for a phrase you already know continues a passage: grep the last 6–8 words you read,
  with a `.\{950\}` tail, to get the next chunk.

---

*Index created 2026-09-20 by the documentation session.*
