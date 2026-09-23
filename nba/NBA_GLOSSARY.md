# NBA GLOSSARY — every term, and exactly where to find it

**Purpose.** When a term comes up and you need the source, this tells you which transcript, which
context, and which document section. Any material term appearing more than once belongs here.

---

> # 📑 **INDEX — `NBA_GLOSSARY.md`**
> **Every term used across the NBA system — what it means, and where it came from.** *Two structures:
> **`§Z`** is the flat lookup (term → location, covers `A`–`Z`); the **body blocks** hold the
> definitions. Where they disagree, the body is newer.*
> 📏 **`47` sections · `2026-09-23`.** *Re-derive, never quote:* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_GLOSSARY.md ``
>
> ⚠ **ANCHORS ARE HEADING TEXT, NEVER LINE NUMBERS** 🔁 **AND TO RESOLVE ONE, RUN THIS — DO NOT TRUST ANY PUBLISHED "DANGLING RATE":** `` grep -rn "§T9.40b" nba/*.md `` *(catches every spelling — `§X`, `` `§X` ``, `**§X**` — across all `32` files, because the twelve are **not closed under their own citations**. **Nine detectors, nine rates, one unchanged corpus — the rate is retired: `§F7.15`, `RULE 60`.**)* *(`§T20.22`: `6` of `16` line-number pointers
> rotted within a day)*. **Search for the quoted letter-block heading or the term in bold.**
> *Added `2026-09-23`, `§F7.4` — this file was one of two of the twelve whose index carried no
> anchor rule, and it is the file whose line numbers move most, because every new term shifts them.*
>
> ⚠⚠ **THIS FILE CONTAINS *TWO* A–Z STRUCTURES AND THEY ARE NOT THE SAME THING.** *That is the one
> fact you need before using it, and nothing in the file said so:*
>
> | | structure | what it is | when to use it |
> |---|---|---|---|
> | **1** | **`§Z — THE COMPLETE TERM INDEX`** *(added `2026-09-22`, `T19` pass 1)* — headings `A` … `Z`, **`27` letter blocks** | **A flat lookup: term → where it is defined** | ✅ **START HERE.** You have a term and want to find it. |
> | **2** | **The main body** — `A` · `B` · `C` · `D` · `E–F` · `G–I` · **`J–K`** · `L–N` · **`O`** · `P–S` *(with `P–S (continued)` nested under it as `###`)* · `T–W` · `PENDING` | **The definitions themselves** | You have found the term and want the full entry. |
>
> ✅ **REPAIRED `2026-09-23` (`§F7.4`) — the body range is now contiguous `A … W`.** *It previously
> read:* 🔴 *"there is no `J`, `K` or `O` block in the body — a term starting with one of those is in
> `§Z`'s index and, if defined, inside another range's block"*, ***and* `P–S` appeared TWICE**, the
> second copy **after `T–W`**, so an alphabetical reader had already walked past it. `§Z` carried `7`
> `J`/`K` terms and `29` `O` terms with nowhere to go — including **`ot_rule`, whose omission from a
> merge key is the `F6-1` season-critical data loss.**
>
> ⚠ **CORRECTION, same pass.** *This note first read:* ~~*"`X`, `Y`, `Z` still have no body block:
> `§Z` lists `5` such terms… a real remaining gap, stated rather than smoothed over."*~~ **Both
> halves were wrong. The count is `10`, not `5`** *(`RULE 56`)* — and a ten-term gap I was already
> inside the file to fix is not a finding, it is deferral. **`X–Z` was written.** ⇒ **the body range
> is `A … Z`, complete, with no letter lacking a block.**
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | ✅ **to look up any term** | **`§Z — THE COMPLETE TERM INDEX`**, then the matching body block |
> | ✅ **a definition for a term starting with ANY letter** | the matching body block — **`A` `B` `C` `D` `E–F` `G–I` `J–K` `L–N` `O` `P–S` `T–W` `X–Z`**. **Complete `A … Z` since `§F7.4`**; before that pass, `J` `K` `O` `X` `Y` `Z` had index entries and no definition section. |
> | **`P`–`S`** | body **`P–S`** — *its `(continued — research-standard structure)` half is now nested directly beneath it, not after `T–W`* |
> | ⚠ **terms known to be missing** | **`PENDING`** — *and read its status table: it is the line most likely to be stale* |
> | 🗂 **to know whether an `nba/*.md` file you found is one of the twelve** | **`NBA_MASTER_SUMMARY.md` → `🗂 THE FOLDER REGISTER`** *(`§F7.6`)* — **all `32` markdown files in `nba/` classified: `12` mandated · `6` live-and-standing · `8` source-of-record · `5` historical · `1` out of scope.** ⚠ *Quick test: a mandated document opens with a `📑 INDEX` in its first `1%` — `31` of `32`, the one exception being `NBA_SWEEP_RUN_LOG.md`.* |
> | 🧭 **to follow a `§` pointer you cannot find** | **`NBA_MASTER_SUMMARY.md` → `🧭 POINTER RESOLUTION`** *(`§F7.7`)*. ⚠ **`98.79%` of the corpus's `6,601` pointers resolve — but `38.6%`–`48.0%` of the bare numeric ones (`§4`, `§0f`, `§7f`) point ACROSS files with no filename.** 🔑 *The `§4`–`§9` family belongs to **`NBA_ARCHITECTURE_BLUEPRINT.md`**, which is not one of the twelve — that block carries the disambiguation table.* |
> | **the transcript IDs referenced throughout** | the **Transcript IDs** table, immediately below |
> | **how to pull a term's source text from a transcript** | **How to use it**, below — *the `grep -o` recipe* ⚠ *see the caveat next* |
>
> 🔴🔴 **CAVEAT ON THE `grep` RECIPE BELOW, MEASURED `2026-09-23`:** *it points at
> `/mnt/transcripts/<file>.txt`.* **`nba/transcripts/` in the repo holds only `README.md` and
> `journal.txt` — no transcript has ever been committed** *(`T21-1` in `NBA_OPEN_ITEMS.md`)*.
> ⇒ ***The recipe works only in a session that already has the transcript files locally. For anyone
> else, the pointer does not resolve.*** **This is the open blocker `T21-1` carries.**
>
> ## 📋 THE FILE'S TWO HALVES
>
> ### ✅ **A · `§Z` — THE COMPLETE TERM INDEX** *(the lookup layer)*
> **`27` letter headings, `A` through `Z`.** *Each entry names the term and points at where it lives.*
> ⇒ **This is the fastest route to anything in the file, and it is the only structure covering the
> whole alphabet.**
>
> ### 📘 **B · THE BODY — THE DEFINITIONS** *(`11` ranges + `PENDING`, covering `A … Z` with no gap)*
> | block | covers |
> |---|---|
> | **`A`** · **`B`** · **`C`** · **`D`** | one letter each |
> | **`E–F`** · **`G–I`** · **`L–N`** · **`T–W`** | merged ranges |
> | ✅ **`J–K`** · **`O`** · **`X–Z`** | **added `2026-09-23`, `§F7.4`** — *these three letters-ranges had `§Z` entries and no definitions* |
> | **`P–S`** | *with **`P–S (continued — research-standard structure)`** nested beneath it as `###` — moved `§F7.4` from its old position after `T–W`* |
> | **`PENDING`** | ⚠ **terms identified but not yet defined — and the sweep status table** |
>
> 📌 **HOW TO READ THIS FILE**: ***`§Z` is the lookup, the body is the definition, `PENDING` is the
> state of the sweep that feeds both.*** **`§Z` wins on *where a term lives*; the body wins on *what
> it means*; and where the two disagree the body is newer, because terms are defined into the body
> after `§Z` lists them.** ⚠ **A term in `§Z` with no body entry is not an error — it is the sweep
> not having reached it.** 🔑 *The single most consequential entry in the file is **`ot_rule`** in
> `O`: a primary-key column that a loader's merge key omits, costing `1,421` rows per run.*
>
> 📌 **COVERAGE OF `T12`–`T18` TERMS — RE-MEASURED LIVE `2026-09-23`, AND THE OLDER FINDING NO LONGER HOLDS**
> *An earlier pass recorded that central `T17`/`T18` terms were absent from this file. **Re-counted
> today, they are present** — so that finding is stale and is NOT repeated here:*
>
> | term | occurrences |
> |---|---|
> | `board_tiers_v2` · `confidence_model` | **`3`** each |
> | `certify_pipeline` · `measure_report_cutoff` · `f_phase` | **`2`** each |
> | `CONF_NEUTRAL` | **`1`** |
>
> ⚠ **`1`–`3` occurrences is presence, not depth** — *a term mentioned once inside another entry is
> not the same as a term with its own definition.* ⇒ **Treat a thin count as "check whether it has
> its OWN entry", and an absence as "not yet written", never as "not a term".**
> 🔑 ***This block was itself corrected before publication***: the first draft asserted `0` for all
> six from memory of an earlier pass. **The live count is above; the assertion was wrong.**

**How to use it.** Find the term, note the transcript ID, then:
`grep -o "<term>[^\"]\{0,300\}" /mnt/transcripts/<file>.txt`

**Transcript IDs**
| ID | File | Dates covered |
|---|---|---|
| T1 | `2026-09-03-03-22-04-nba-expansion-phase1-static` | 08-31 → 09-03 |
| T2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete` | 09-03 |
| T3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete` | 09-03 |
| T4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete` | 09-03 |
| T5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete` | 09-03 cont'd |
| T6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete` | 09-09 |
| T7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research` | 09-09 |
| T8 | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration` | 09-09 |
| T9 | `2026-09-09-22-10-00-nba-baseline-production-pipeline` | 09-09 |
| T10 | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09` | 09-09 |
| T11 | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10` | 09-10 |
| T12 | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10` | 09-10 |
| T13 | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10` | 09-10 |
| T14 | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12` | 09-11/12 |
| T15 | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12` | 09-12 |
| T16 | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13` | 09-13 |
| LIVE | the 2026-09-19/20 session (not yet a transcript file) | 09-18 → 09-20 |

**Transcript index — CONTINUED 2026-09-22**
| # | file | covers |
|---|---|---|
| T17 | `2026-09-20-04-58-11-nba-confidence-calibration-final-engine-2026-09-19` | 09-19 |
| T18 | `2026-09-20-06-12-04-nba-pipelines-confidence-board-tiers-2026-09-19` | 09-19 |
| T19 | `2026-09-20-18-46-12-nba-alphadog-documentation-pass` | 09-20 |
| T20 | `2026-09-20-19-56-26-nba-alphadog-documentation-pass-t1-deep` | 09-20 |

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Terms from T1 (10 passes), T2 (1 pass), the journal, and the live session. |
| **2026-09-22** | 🔴🔴 **BACKFILL — this file had NO content commit for the sweep of T12 through T18** *(seven transcripts, each closed on three consecutive clean passes; 44 commits here against `NBA_MASTER_SUMMARY`'s 889; the index above stopped at T16)*. **Cause and full evidence: `NBA_MASTER_SUMMARY.md` §T19.1 and open item T19-1; the rule it produced is RULE 41 — *no pass measures the deliverable against its charter*.** **Added: the transcript index through T20, and §Z — THE COMPLETE TERM INDEX, 824 terms.** |

---

# §Z — THE COMPLETE TERM INDEX *(added 2026-09-22, T19 pass 1)*

⚠⚠ **WHAT THIS IS, AND WHAT IT IS NOT — read this before using it.**
**The owner's charter** *(T19 SEG 60, repeated verbatim at SEG 378)* **requires**: *"a map for all
important aspects, keywords, terms and tell exactly how and where to find them, **on which transcript
and which line/message/date and time**… **any material term that shows more than once must be in the
glossary**."*

**THE CHARTER TEST, MEASURED 2026-09-22.** *Operationalising "material term" as a backticked
identifier — `snake_case` or `schema.table` — is a PROXY for the owner's word, and it is stated so it
can be argued with:*

| | |
|---|---|
| distinct backticked identifiers across the other eleven documents | **1,552** |
| of those, appearing in **two or more** of the twelve *(the charter's threshold)* | **1,016** |
| **absent from this file before today** | **824 — 81.1% of the charter set** |

⇒ ***Before this backfill the glossary carried under a fifth of what the charter requires.*** **The
824 are listed below.**

🔑 **The sections A–W above are DEFINITIONAL — they say what a term MEANS — and are unchanged. This
index is NAVIGATIONAL — it says WHERE a term is used. The charter asks for both; the definitional
half was being written and the navigational half was not.**

⚠⚠ **ONE CHARTER FIELD IS NOT CARRIED, AND IS NAMED RATHER THAN INVENTED.** The charter asks for
*"which line/message/date and time"*. **This index gives the DOCUMENT and the TRANSCRIPT. It does NOT
give per-message line numbers**, because the sweep's documents record findings by section and
transcript, not by transcript line offset, and **fabricating line numbers would be worse than
omitting them.** *(Open item T19-2.)*

⚠ **Transcript attribution is by NEAREST ENCLOSING HEADING**, so a term used in a section headed
`§T13.3a` attributes to T13. **A dash (—) means the term appears only in sections whose headings
carry no transcript marker** — usually the standing reference sections — **not that its origin is
unknown.** *Up to five transcripts are shown per term.*

**Document keys**: `SUM` `GLO` `REC` `ARC` `DB` `WRK` `DSN` `OPEN` `BCAL` `FCAL` `MUL` `GD`.

### A

| Term | Documents | Transcript(s) |
|---|---|---|
| `abbreviation` | DB,OPEN,SUM | T1 T3 |
| `absence_panel_teams` | OPEN,SUM | T4 |
| `absence_prior_measured` | BCAL,SUM | T12 |
| `active_nba_teams` | OPEN,SUM | T2 |
| `active_stats_season` | DSN,OPEN,SUM | T7 T9 |
| `actual_efg_pct` | DB,OPEN,SUM | T3 T4 |
| `adjusted_odds` | GD,MUL,OPEN | — |
| `af540a9` | OPEN,SUM | — |
| `aggregate_matchups_asof` | OPEN,SUM | T10 |
| `alias_key` | DB,OPEN | T1 |
| `alias_normalized` | DB,OPEN,SUM | T1 |
| `alias_type` | ARC,DB,OPEN,SUM | T1 |
| `aliases_written` | ARC,SUM | T1 T2 |
| `all_rows` | OPEN,SUM | T4 |
| `alternate_lines` | ARC,SUM | T12 |
| `altitude` | DB,SUM | T7 T8 |
| `altitude_ft` | ARC,DB,OPEN,SUM | T1 T7 T8 |
| `anchor_type` | DB,FCAL,GD,SUM | T11 T12 |
| `appearances` | OPEN,SUM | T8 |
| `applies_to_side` | DB,SUM | T11 |
| `apply_ladder_calibration` | OPEN,SUM | T1 |
| `arbitrage` | OPEN,SUM | T12 |
| `archive` | DB,OPEN,SUM | T1 |
| `archive.market_prop_context_history` | DB,DSN,OPEN | T1 |
| `arena_capacity` | OPEN,SUM | T2 T10 |
| `arena_city` | OPEN,SUM | T11 |
| `arenas.altitude_ft` | FCAL,OPEN | — |
| `arenas.timezone` | FCAL,OPEN | — |
| `assignment` | DB,OPEN,SUM | T6 |
| `assists_1q` | OPEN,SUM | T1 T8 |
| `ast_pct` | DB,SUM | T2 |
| `ast_rate` | OPEN,SUM | T7 |
| `ast_total` | DB,SUM | T2 |
| `attach` | FCAL,OPEN,SUM | T9 |
| `automation_status` | DB,OPEN,SUM | T7 |
| `availability_model_n1v3_2026_09_15` | BCAL,DB,FCAL | T15 |
| `avg_ast_allowed` | DB,SUM | T5 |
| `avg_conf` | DB,OPEN | T18 |
| `avg_fg_pct_allowed` | DB,SUM | T5 |
| `avg_pts_allowed` | DB,SUM | T5 |
| `avg_reb_allowed` | DB,SUM | T5 |
| `avg_speed` | DB,SUM | T2 |
| `avg_speed_def` | DB,SUM | T2 |
| `avg_speed_off` | DB,SUM | T2 |
| `away_team_id` | OPEN,SUM | T3 |

### B

| Term | Documents | Transcript(s) |
|---|---|---|
| `backtest.baseline_v6_asof` | BCAL,FCAL,OPEN | — |
| `ball_handling` | DB,OPEN | T1 |
| `balldontlie_api_key` | DB,OPEN,SUM | T1 |
| `band_key` | DB,SUM | T4 T5 T7 T10 |
| `band_order` | DB,SUM | T7 |
| `base_min` | BCAL,SUM | — |
| `baseball_mlb` | ARC,DB,OPEN,REC,SUM | T1 |
| `baseline_hp` | ARC,DB,FCAL,OPEN | T17 |
| `baseline_ladder` | ARC,DB,DSN,FCAL,OPEN,SUM | T1 T9 T10 T11 |
| `baseline_ladder.recipe_version` | DB,OPEN,SUM | T9 |
| `baseline_ladder_runs` | ARC,BCAL,DSN,OPEN,SUM,WRK | T3 T9 T10 T13 |
| `baseline_ladder_runs.factor_fits` | BCAL,OPEN,SUM | T11 |
| `baseline_ladder_runs.source_file` | ARC,OPEN | — |
| `basketball_nba` | ARC,OPEN,REC,SUM | T1 |
| `betr_access_token` | ARC,DB,OPEN,SUM | T13 |
| `betr_board_pull` | ARC,OPEN,SUM | T1 |
| `betr_us_dfs` | DB,OPEN,SUM | T11 |
| `betrivers` | DB,OPEN,SUM | T12 |
| `bigint` | OPEN,SUM | T11 T15 |
| `binary_gate` | DB,SUM | T4 T5 T7 T8 |
| `blk_rate` | BCAL,DB,OPEN,SUM | T7 T10 |
| `blowout_risk` | DB,SUM | T7 |
| `board_backfill_log` | DB,OPEN,SUM | T11 |
| `board_backfill_odds_api` | OPEN,SUM | T11 T12 |
| `board_outcomes.leg_result` | OPEN,SUM | T11 |
| `board_outcomes_leg_uidx` | DB,OPEN | — |
| `board_outcomes_nm_idx` | DB,OPEN,SUM | T16 T17 |
| `board_payout_conversion_rules` | DB,MUL,WRK | — |
| `board_sources_decision` | ARC,OPEN,SUM | T12 |
| `board_tiers_v2` | DB,FCAL,GD,MUL,OPEN,SUM,WRK | T1 T4 T10 T11 T12 |
| `book_calibration` | OPEN,SUM | T13 T14 |
| `book_curves` | OPEN,SUM | T13 T14 |
| `bookmaker` | DB,DSN,OPEN,SUM | T11 T12 |
| `box_dpm` | DB,SUM | T2 T3 |
| `boxscoresummaryv2` | ARC,OPEN,REC,SUM,WRK | T1 T6 |
| `boxscoresummaryv3` | ARC,DB,OPEN,SUM | T6 T11 |
| `boxscoretraditionalv2` | ARC,DB,OPEN,REC,SUM,WRK | T4 T5 T6 T7 |
| `boxscoretraditionalv3` | ARC,DB,OPEN | T5 |
| `brier` | FCAL,OPEN | T1 |
| `bs_source` | ARC,OPEN | T18 |
| `bug_fixed` | OPEN,SUM | T11 |
| `build_tier` | DB,SUM | T7 T8 T11 |
| `built_at` | DB,DSN,FCAL,MUL,OPEN,SUM | T9 T13 T16 T17 T18 |
| `by_band_tier` | DB,SUM | T9 |

### C

| Term | Documents | Transcript(s) |
|---|---|---|
| `c5798146` | ARC,BCAL,OPEN,SUM | T12 |
| `c_exist` | BCAL,FCAL,OPEN,SUM | T9 |
| `c_quality` | BCAL,FCAL,OPEN,SUM | T9 |
| `cal_shift` | ARC,DB,FCAL,OPEN | T17 |
| `calibration_log` | DB,OPEN,SUM | T1 T7 T8 T9 T11 |
| `call_gemini` | ARC,SUM | T3 |
| `cancelled` | OPEN,SUM,WRK | T1 T12 T15 T16 |
| `canonical_event_id` | OPEN,SUM | T11 |
| `canonical_prop` | DB,OPEN,SUM | T8 |
| `canonical_prop_key` | DB,OPEN,SUM | T8 T9 T10 |
| `capacity` | ARC,DB,OPEN | — |
| `career_game_num` | OPEN,SUM,WRK | T3 |
| `cell_id` | DB,FCAL,SUM | T7 T10 |
| `certifier` | DB,SUM | T1 |
| `certify_pipeline` | OPEN,SUM | T19 |
| `chalkboard` | OPEN,SUM | T12 |
| `check_bindings` | ARC,OPEN,SUM,WRK | T1 |
| `classification_config.minutes_mixture` | DB,OPEN | — |
| `cloudflare_d1_bindings.json` | SUM,WRK | T1 |
| `clutch` | BCAL,OPEN,SUM | T11 |
| `coach` | OPEN,SUM | T11 |
| `coefficient` | FCAL,OPEN | T1 |
| `coefficient_a` | DB,SUM | T7 |
| `college` | DB,SUM | T2 |
| `commonallplayers` | ARC,REC,SUM,WRK | T1 T2 T4 |
| `comp_min` | BCAL,OPEN,SUM | T7 |
| `compatibility_flags` | ARC,WRK | — |
| `completed` | OPEN,SUM | T5 |
| `completed_nba_static_arena_dictionary_seed` | OPEN,SUM | T5 |
| `completed_with_certification_warning` | OPEN,SUM | T5 |
| `completed_with_errors` | OPEN,SUM | T4 T5 T11 |
| `completed_with_warning` | OPEN,SUM,WRK | T2 T4 T5 |
| `component` | DB,SUM | T9 |
| `composite` | DB,OPEN,SUM | T1 T11 |
| `compute_stage` | DB,OPEN,SUM | T9 T10 T11 |
| `conf_band_v3` | DB,SUM | T9 |
| `conference` | DB,OPEN,SUM | T1 T3 |
| `confidence_model` | DB,DSN,OPEN,SUM,WRK | T1 T10 T18 T19 |
| `config.enrichment_profile_cells` | DB,SUM | T7 |
| `config.worker_schedules` | ARC,OPEN,SUM | T1 |
| `config_enrichment_profile_cells` | DB,SUM | T7 |
| `config_json` | ARC,DB | — |
| `config_key` | DB,OPEN | — |
| `config_prop_taxonomy` | OPEN,SUM | T8 |
| `config_worker_definitions` | DB,SUM | T1 T7 |
| `confirmed_out` | DSN,FCAL,SUM | T8 |
| `conformal_confidence` | DB,OPEN,SUM,WRK | T1 T4 T11 T18 |
| `context_cert` | DB,SUM | T1 |
| `control.control_job_queue` | OPEN,WRK | — |
| `control.job_queue` | ARC,DB,SUM,WRK | T1 |
| `control.user_placed_slips_log` | DB,MUL | — |
| `control_job_queue` | ARC,OPEN,SUM,WRK | T1 |
| `correction_2026_09_10` | MUL,SUM | T13 |
| `country` | DB,SUM | T2 |
| `covered_days` | OPEN,SUM | T13 |
| `create_file` | OPEN,SUM | T1 |
| `created_at` | DB,OPEN,SUM | T7 T9 T14 |
| `credential_key` | DB,OPEN | — |
| `current_season` | DB,OPEN,SUM | T7 T9 |
| `curves` | OPEN,SUM | T1 |

### D

| Term | Documents | Transcript(s) |
|---|---|---|
| `d29401bd` | OPEN,SUM | T10 T11 |
| `d_dpm` | DB,SUM | T2 T3 |
| `darko` | ARC,DB,REC,SUM | T2 T3 T11 |
| `darko.app` | ARC,DB,OPEN,SUM | T2 T3 |
| `data_hygiene_todo` | MUL,SUM | T13 |
| `days_done` | OPEN,SUM | T11 T12 T13 T14 |
| `days_rest` | DB,OPEN,SUM | T4 T5 T7 T10 |
| `dblink` | OPEN,SUM | T6 |
| `def_rating` | DB,SUM | T2 |
| `defense` | DB,OPEN | T1 |
| `defense_vs_position` | FCAL,OPEN,SUM | T1 T4 T5 T6 T11 |
| `deferred_prizepicks_multiplier_capture` | DB,MUL | T18 |
| `departed` | OPEN,SUM | T3 |
| `departed_official` | OPEN,SUM | T3 |
| `deploy_scope` | SUM,WRK | T1 |
| `deployed_sha.txt` | SUM,WRK | T1 |
| `derived_spread` | OPEN,SUM | T11 |
| `direction_skew` | DB,SUM | T8 |
| `display_name` | DB,SUM | T1 T7 T10 T11 |
| `dist_miles` | DB,SUM | T2 |
| `dist_miles_def` | DB,SUM | T2 |
| `dist_miles_off` | DB,SUM | T2 |
| `distribution_family` | DB,SUM | T8 |
| `division` | DB,OPEN,SUM | T1 T3 |
| `double_double` | BCAL,DB,FCAL,OPEN,SUM | T1 T4 T8 T9 T10 |
| `draft_year` | DB,SUM | T2 |
| `dreb36` | OPEN,WRK | T15 |
| `dreb_pct` | DB,SUM | T2 |
| `dud_lognormal` | BCAL,DB,FCAL,OPEN,WRK | T1 |
| `dunks` | BCAL,OPEN,SUM | T14 T15 |

### E

| Term | Documents | Transcript(s) |
|---|---|---|
| `e0e49be1` | OPEN,SUM | T8 T9 T10 |
| `efg_pct` | DB,SUM | T3 T4 |
| `enrichment_backfill_status_2026_09_10` | OPEN,SUM | T11 T12 T14 |
| `equal_scale_v1` | MUL,SUM | T10 |
| `errors` | OPEN,SUM | T4 T5 |
| `event_game_map` | DB,OPEN,SUM | T4 T11 T14 |
| `event_id` | ARC,OPEN,SUM,WRK | T11 T12 T13 T15 |
| `event_key` | DB,SUM | T1 |
| `event_start_utc` | ARC,WRK | T15 |
| `ewma_alpha` | DB,FCAL,OPEN,REC,SUM | T1 T7 |
| `exclude` | DB,OPEN,SUM | T9 |
| `expected_efg_pct` | DB,OPEN,SUM | T3 T4 |
| `external_calls_performed` | OPEN,SUM | T2 |
| `external_credentials.betr_access_token` | ARC,OPEN | — |

### F

| Term | Documents | Transcript(s) |
|---|---|---|
| `f53885f3abbf` | ARC,OPEN | — |
| `f8b6ad9e` | ARC,SUM | T7 |
| `f_agree` | FCAL,SUM | T9 |
| `f_books` | FCAL,SUM | T9 |
| `f_complete` | FCAL,SUM | T9 |
| `f_depth` | FCAL,OPEN,SUM | T9 T10 |
| `f_exp` | FCAL,SUM | T9 |
| `f_impl_opp` | BCAL,FCAL,OPEN,SUM | T4 T10 T13 |
| `f_impl_own` | BCAL,FCAL,OPEN,SUM | T4 T10 T13 |
| `f_phase` | BCAL,DB,FCAL,OPEN,SUM | T9 T10 T11 T16 T17 |
| `f_prov` | BCAL,DB,FCAL,OPEN,SUM | T9 T10 |
| `f_time` | FCAL,SUM | T9 T10 |
| `f_vol` | FCAL,SUM | T9 |
| `factor_fits` | ARC,BCAL,DB,OPEN,SUM | T1 T9 T13 |
| `factor_key` | DB,FCAL,OPEN,SUM | T10 T11 |
| `factor_registry.compute_stage` | OPEN,SUM | T10 |
| `factor_registry.form` | DB,SUM | T4 T5 T7 T8 |
| `failed_no_data` | OPEN,SUM | T4 T5 |
| `failed_types` | SUM,WRK | T3 |
| `false` | OPEN,SUM | T1 |
| `fantasy_score` | BCAL,DB,FCAL,GD,MUL,OPEN,REC,SUM | T4 T7 T8 T9 T10 |
| `fantasy_score_1q` | OPEN,SUM | T1 T8 T11 |
| `fc_mobile_api_public` | ARC,SUM | T13 |
| `fetch_method` | OPEN,SUM | T2 |
| `fetch_note` | OPEN,SUM | T2 |
| `fg3_pct` | BCAL,DB,OPEN,SUM | T3 T4 T7 |
| `fg3a_frequency` | DB,SUM | T3 T4 |
| `fg3a_rate` | BCAL,DB,OPEN,SUM | T7 T10 |
| `fg_pct` | DB,OPEN,SUM | T3 T4 |
| `fga_frequency` | DB,SUM | T3 T4 |
| `field_name` | DB,OPEN,SUM | T3 |
| `file_prefix` | OPEN,SUM,WRK | T3 T7 T9 |
| `final_engine_complete_2026_09_18` | DB,FCAL | — |
| `final_hp.confidence` | FCAL,OPEN,SUM | T17 |
| `final_hp.score` | FCAL,OPEN,SUM | T16 |
| `final_hp_uidx` | DB,FCAL | — |
| `fires` | FCAL,SUM | T15 |
| `formula_expression` | DB,OPEN,SUM | T4 T5 T7 |
| `foul_drawing` | DB,SUM | T7 |
| `ft_pct` | DB,OPEN,SUM | T7 T9 |
| `ft_poss_pct` | OPEN,SUM,WRK | T3 T10 |
| `fta_rate` | DB,OPEN,SUM | T7 |
| `full_name` | DB,OPEN,SUM | T1 T3 T6 |

### G

| Term | Documents | Transcript(s) |
|---|---|---|
| `gain_vs_anchor` | FCAL,OPEN | T1 |
| `game_date` | ARC,DB,GD,MUL,OPEN,SUM,WRK | T1 T4 T9 T11 |
| `game_datetime_utc` | DSN,OPEN,SUM | T1 T4 |
| `game_id` | DB,OPEN,SUM,WRK | T1 T3 T4 T5 T6 |
| `game_label` | OPEN,SUM | T4 T7 T11 |
| `game_lines_closing` | DB,DSN,FCAL,OPEN,SUM | T11 T12 T13 |
| `game_lines_snapshot_log` | DB,OPEN,SUM | T11 |
| `game_lines_snapshots` | DB,OPEN,SUM | T4 T11 |
| `game_not_found` | DSN,SUM | T12 T13 |
| `game_officials` | ARC,OPEN,SUM | T1 T6 T7 T11 T12 |
| `game_officials.assignment` | OPEN,SUM | T6 |
| `game_pace` | DB,SUM | T7 |
| `games_missing_starter_status_sample` | OPEN,SUM | T6 T7 |
| `games_played` | DB,SUM | T2 |
| `games_sampled` | DB,OPEN,SUM | T5 T7 |
| `gbdt_auto_trigger_switch` | OPEN,SUM | T1 T4 |
| `gbdt_training_requests` | FCAL,OPEN,SUM | T1 T4 |
| `generated_at` | FCAL,SUM | T9 |
| `github_get_workflow_run_log` | ARC,OPEN,SUM,WRK | T1 T11 T14 T18 |
| `github_grep_file` | ARC,OPEN,SUM,WRK | T1 T11 T13 T18 |
| `github_list_dir` | ARC,OPEN,SUM | T1 |
| `github_list_workflow_runs` | ARC,OPEN,SUM,WRK | T1 T2 T4 T11 T13 |
| `github_patch_file` | ARC,OPEN,SUM,WRK | T1 T2 T4 T11 T13 |
| `github_put_file` | ARC,OPEN,SUM,WRK | T1 T2 T3 T9 T11 |
| `github_str_replace` | ARC,OPEN,SUM | T1 T4 T6 |
| `goblin_floor_factor` | GD,SUM | T12 |
| `graded_at` | DSN,SUM | T11 T12 |
| `group_id` | DB,OPEN,SUM | T6 |
| `group_name` | DB,SUM | T6 |
| `group_quantity` | DB,SUM | T6 |

### H

| Term | Documents | Transcript(s) |
|---|---|---|
| `high_novelty` | FCAL,SUM | — |
| `higher_multiplier` | MUL,SUM | T13 |
| `higher_multiplier_modifier_only` | MUL,SUM | T13 |
| `higher_payout` | MUL,SUM | T13 |
| `historical_boards` | OPEN,SUM | T12 |
| `hits_runs_rbis` | BCAL,DB,OPEN,SUM | T1 |
| `home_favored` | OPEN,REC,SUM | T11 |
| `home_team_id` | OPEN,SUM | T3 |
| `hustle` | BCAL,OPEN,SUM | T11 |

### I

| Term | Documents | Transcript(s) |
|---|---|---|
| `idx_scan` | DB,OPEN | T16 T17 |
| `if_version` | ARC,OPEN | — |
| `include` | DB,OPEN,SUM | T9 |
| `index.html` | OPEN,SUM | T1 |
| `information_schema` | DB,OPEN,REC,SUM,WRK | T1 T2 T7 T10 T11 |
| `information_schema.columns` | ARC,SUM | T10 |
| `information_schema.tables` | DB,DSN,OPEN,SUM | T10 |
| `intentionally` | OPEN,SUM | T10 |
| `is_alternate` | DB,DSN,SUM | T11 T12 |
| `is_composite` | DB,SUM | T11 |
| `is_dfs` | OPEN,SUM | T11 |
| `is_first_run` | OPEN,SUM | T2 T3 |
| `is_home` | OPEN,SUM | T11 |
| `is_starter` | DB,SUM | T5 |
| `is_total` | DB,OPEN,SUM | T4 T5 T10 |

### J

| Term | Documents | Transcript(s) |
|---|---|---|
| `jersey_num` | DB,OPEN,SUM | T6 |
| `job_key` | DB,OPEN,SUM,WRK | T1 T4 |
| `job_queue` | OPEN,REC,SUM | T1 |
| `journal.txt` | OPEN,SUM | — |

### K

| Term | Documents | Transcript(s) |
|---|---|---|
| `k_stab` | BCAL,DB,FCAL,OPEN,REC,SUM | T7 T8 T9 T10 T15 |
| `known_empty_games` | ARC,DSN,OPEN,SUM,WRK | T3 T7 T9 T11 |
| `known_limitation` | OPEN,SUM | T2 T3 T6 |

### L

| Term | Documents | Transcript(s) |
|---|---|---|
| `ladder_calibration` | ARC,BCAL,DB,OPEN,SUM | T1 T4 T7 T11 T15 |
| `ladder_calibration_asof` | BCAL,DB,FCAL,OPEN,SUM,WRK | T1 T4 T11 |
| `ladder_offset` | DB,SUM | T9 |
| `ladder_step` | DB,SUM | T8 |
| `ladder_steps` | FCAL,OPEN,SUM | T9 |
| `last_comma_first` | OPEN,SUM | T2 |
| `last_empirical_validation_json` | DB,OPEN,SUM | T7 |
| `last_triggered_utc` | ARC,OPEN,SUM | T1 |
| `last_validated_at` | DB,OPEN,SUM | T7 T8 |
| `league` | DB,OPEN,REC,SUM | T1 |
| `leaguedashlineups` | ARC,DB,FCAL,OPEN,SUM | T1 T5 T6 |
| `leaguedashplayerbiostats` | ARC,DB,REC,SUM,WRK | T2 T5 |
| `leaguedashplayerptshot` | ARC,SUM | T3 |
| `leaguedashplayershotlocations` | ARC,DB,FCAL,OPEN,REC,SUM | T3 T4 |
| `leaguedashptstats` | ARC,DB,REC,SUM,WRK | T2 |
| `leagues` | ARC,OPEN,SUM | T1 |
| `leaguestandingsv3` | ARC,DB,OPEN,SUM,WRK | T1 |
| `leg_result` | DB,DSN,FCAL,GD,MUL,SUM | T11 T12 T13 |
| `line_id` | ARC,SUM | — |
| `line_score` | GD,MUL,OPEN | — |
| `line_type` | MUL,SUM | T13 |
| `lineup_change` | OPEN,SUM | T10 |
| `lineup_profile` | OPEN,SUM | T6 T11 |
| `lineup_synergy` | OPEN,SUM | T10 |
| `lineups_confirmed` | OPEN,SUM | T10 T11 |
| `live_only_excluded_from_history` | DB,OPEN,SUM | T10 |
| `load_data_requests` | ARC,SUM | T12 |
| `loaded` | OPEN,SUM | T9 |
| `loaded_at` | BCAL,DB,OPEN,SUM,WRK | T9 T10 T13 |
| `location` | DB,OPEN,SUM | T4 T5 T7 |
| `location_name` | DB,OPEN | — |
| `log_id` | DB,SUM | T1 |
| `log_loss` | FCAL,OPEN | T1 |
| `log_odds_shift` | BCAL,FCAL,OPEN | — |
| `log_text` | OPEN,SUM | T1 |
| `losses` | DB,SUM | T2 |
| `low_novelty` | FCAL,SUM | — |
| `lower_multiplier` | MUL,SUM | T13 |
| `lower_payout` | MUL,SUM | T13 |

### M

| Term | Documents | Transcript(s) |
|---|---|---|
| `main_file` | OPEN,SUM | T1 |
| `manual_alias` | ARC,DB,OPEN,SUM | T1 T2 |
| `market.prizepicks_board_current` | DB,OPEN,SUM | T1 |
| `market.sleeper_board_current` | DB,OPEN,SUM | T1 |
| `market.underdog_board_current` | DB,OPEN | — |
| `market_fair` | OPEN,SUM | T13 |
| `market_filters` | ARC,SUM | T12 |
| `market_key` | DB,GD,OPEN,SUM | T11 T16 |
| `market_probe_results_2026_09_10` | OPEN,SUM | T11 |
| `market_spread_delta` | OPEN,SUM | T10 |
| `market_total_delta` | OPEN,SUM | T10 |
| `max_api_calls_per_tick` | DB,SUM | T1 |
| `max_rows` | ARC,DB,OPEN | — |
| `max_shift` | BCAL,OPEN,SUM | T10 |
| `max_tick_ms` | DB,SUM | T1 |
| `measure_report_cutoff` | OPEN,SUM | T19 |
| `memory_append` | OPEN,SUM | T1 T4 |
| `memory_class` | DB,SUM | T7 |
| `memory_read` | OPEN,SUM | T1 T6 |
| `memory_write` | OPEN,SUM | T1 T4 |
| `message` | DB,OPEN,SUM,WRK | T2 |
| `message_name` | ARC,SUM | T12 |
| `metrics` | SUM,WRK | T3 |
| `min_lookback_games` | DB,FCAL,SUM | T7 |
| `min_mult` | DSN,FCAL,SUM | T14 T15 |
| `min_real_sample_threshold` | BCAL,DB,OPEN,SUM | T7 T8 |
| `minuscule` | OPEN,SUM | T9 |
| `minutes_by_margin` | DB,OPEN,SUM | T4 T11 T16 |
| `minutes_model_v1` | DB,SUM | T4 T11 T16 |
| `mlb_133` | OPEN,SUM | T1 |
| `mlb_team_id` | OPEN,SUM | T1 |
| `morning` | DB,SUM | T11 |

### N

| Term | Documents | Transcript(s) |
|---|---|---|
| `n_uncertain` | DB,OPEN | T17 |
| `natural_floor` | DB,SUM | T8 |
| `nba_0` | DB,SUM | T4 T5 |
| `nba_1610612737` | DB,OPEN,SUM | T1 T10 |
| `nba_1628467` | DB,OPEN | T4 T5 |
| `nba_1629178` | DB,OPEN,SUM | T6 |
| `nba_archive` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_arenas_current.json` | OPEN,SUM,WRK | T2 |
| `nba_backtest` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_baseline_ladder_latest.json` | BCAL,OPEN | — |
| `nba_calendar` | ARC,DB,OPEN,SUM | T1 T7 T11 |
| `nba_calendar.games` | DB,DSN,OPEN,SUM | T1 T2 T3 T4 T6 |
| `nba_certifier` | ARC,OPEN | — |
| `nba_classification` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_config.calibration_log` | DB,SUM | T8 T11 |
| `nba_config.ewma_alpha` | DB,SUM | T1 T7 T10 |
| `nba_config.factor_gate_results` | OPEN,SUM | T10 |
| `nba_config.factor_profile_cells` | DB,FCAL,OPEN,SUM | T1 T7 T8 T10 |
| `nba_config.factor_registry` | BCAL,DB,DSN,FCAL,OPEN,SUM | T1 T7 T8 T10 T11 |
| `nba_config.factor_relevance` | DB,FCAL,OPEN,SUM | T8 T10 |
| `nba_config.pp_slip_rules` | DB,GD,SUM | T7 |
| `nba_config.role_tiers` | BCAL,DB,OPEN,SUM | T8 T9 |
| `nba_config.system_settings` | ARC,DB,OPEN,SUM,WRK | T1 |
| `nba_config.variation_bands` | DB,OPEN,SUM | T7 T8 T9 |
| `nba_context` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_daily` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_daily.injury_report_snapshots` | OPEN,SUM | T10 T11 |
| `nba_darko_debug_html_snippet.txt` | OPEN,SUM | T3 T4 T5 |
| `nba_differential_check_cadence` | DB,SUM | T1 |
| `nba_fantasy_pts` | DB,SUM | T4 |
| `nba_game_id` | DB,OPEN,SUM | T1 |
| `nba_game_officials_2025_26_meta.json` | OPEN,SUM | T11 |
| `nba_market.board_backfill_log` | DB,OPEN,SUM | T11 |
| `nba_market.board_tiers` | DB,GD,OPEN,SUM,WRK | T1 T11 |
| `nba_market.board_tiers_ud` | DB,GD,OPEN,SUM | T10 |
| `nba_market.board_tiers_v2` | DB,GD,OPEN,SUM,WRK | T1 T12 |
| `nba_market.book_calibration` | DSN,SUM | T13 |
| `nba_market.book_curves` | DSN,SUM | T13 |
| `nba_market.event_game_map` | DB,OPEN,SUM | T14 |
| `nba_market.game_lines_closing` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_market.game_lines_snapshot_log` | DB,SUM | T11 |
| `nba_market.game_lines_snapshots` | DB,OPEN,SUM | T11 T13 |
| `nba_market.market_fair` | DSN,SUM | T13 |
| `nba_market.prop_universe` | DB,SUM | T11 |
| `nba_market.rung_market` | DB,DSN,MUL,OPEN,SUM | T7 T11 T13 |
| `nba_market.schedule_norm` | DB,FCAL,OPEN,SUM,WRK | T11 T18 |
| `nba_market.sleeper_board_current` | OPEN,SUM | T1 T10 |
| `nba_official_id` | DB,SUM | T6 |
| `nba_official_ray_acosta` | DB,OPEN,SUM | T6 |
| `nba_officials_current.json` | OPEN,WRK | — |
| `nba_officials_debug_raw.json` | OPEN,SUM | T4 T5 |
| `nba_officials_diagnostic.json` | OPEN,SUM | T4 T5 |
| `nba_onoff_current.json` | OPEN,SUM | T1 |
| `nba_player_bio_current.json` | OPEN,SUM | T1 |
| `nba_player_game_log_2025_26_debug_raw.json` | OPEN,SUM | T4 |
| `nba_player_id` | ARC,DB,OPEN,SUM | T1 T2 T3 T4 T9 |
| `nba_players_current.json` | OPEN,WRK | — |
| `nba_ref.official_roster_snapshot` | DB,SUM | T3 T9 |
| `nba_ref.officials` | ARC,DB,OPEN,SUM,WRK | T1 T2 T6 T11 |
| `nba_ref.player_aliases` | DB,OPEN,SUM | T1 T2 |
| `nba_ref.player_name_map` | DB,OPEN,SUM,WRK | T2 |
| `nba_ref.prop_taxonomy` | ARC,DB,FCAL,OPEN,SUM,WRK | T1 T7 T8 T9 T11 |
| `nba_ref.referee_assignments` | DB,OPEN,SUM | T4 T8 T9 T10 T11 |
| `nba_ref.team_aliases` | ARC,DB,OPEN,SUM,WRK | T1 T2 |
| `nba_ref.team_differential_log` | DB,SUM,WRK | T3 T8 T9 |
| `nba_ref.team_roster_snapshot` | DB,SUM | T3 T9 |
| `nba_schedule_current.json` | OPEN,SUM,WRK | T1 T3 T9 T18 |
| `nba_score.absence_panel` | DB,SUM | T4 T10 T16 |
| `nba_score.availability_delta` | DB,FCAL,OPEN | T4 T16 |
| `nba_score.baseline_ladder` | DB,GD,OPEN,SUM,WRK | T3 T9 T10 |
| `nba_score.baseline_ladder_runs` | BCAL,DB,OPEN,SUM | T1 T2 T9 T10 T13 |
| `nba_score.blowout_model` | DB,OPEN,REC,SUM | T4 T7 T8 T11 T16 |
| `nba_score.confidence_model` | DB,FCAL,OPEN,SUM | T17 |
| `nba_score.conformal_confidence` | DB,FCAL | — |
| `nba_score.ladder_calibration` | DB,FCAL,OPEN,SUM | T1 T10 |
| `nba_score.ladder_calibration_asof` | BCAL,DB,FCAL,OPEN,SUM | T1 T11 |
| `nba_score.paper_picks` | DB,DSN,SUM | T11 T12 |
| `nba_score.real_slip_leg_observations` | DB,MUL,OPEN,SUM | T4 T10 T16 |
| `nba_score.redistribution_factors` | DB,FCAL | T15 T16 |
| `nba_score.scenario_calibration` | DB,OPEN,SUM | T14 |
| `nba_score.scenario_realised` | DB,DSN,FCAL,OPEN,SUM | T14 T17 |
| `nba_score.tier_band_calibration` | BCAL,DB,GD | T16 |
| `nba_scoring` | ARC,DB,OPEN,SUM | T1 T11 |
| `nba_season` | OPEN,SUM | T3 T7 T9 |
| `nba_shotzones_debug_raw.json` | OPEN,SUM | T4 T5 |
| `nba_starter_status_diagnostic.json` | OPEN,SUM | T4 T5 |
| `nba_stats.game_officials` | ARC,DB,OPEN,SUM,WRK | T1 T3 T6 T9 T11 |
| `nba_stats.lineup_synergy` | FCAL,OPEN,SUM | T10 |
| `nba_stats.official_roster_snapshot` | SUM,WRK | T10 |
| `nba_stats.player_career_season_totals` | DB,FCAL,OPEN,SUM | T1 T2 T4 T5 T7 |
| `nba_stats.player_career_totals` | FCAL,OPEN,SUM | T1 T10 |
| `nba_stats.player_differential_log` | DB,SUM,WRK | T3 T8 T9 |
| `nba_stats.player_game_log` | DB,OPEN,SUM | T4 |
| `nba_stats.player_game_log_scoring` | DB,SUM | T7 |
| `nba_stats.player_game_log_usage` | DB,OPEN,SUM | T7 |
| `nba_stats.player_game_starter_status` | DB,OPEN,SUM | T5 T11 |
| `nba_stats.player_impact_rating` | DB,OPEN,SUM | T2 T3 |
| `nba_stats.player_onoff_profile` | DB,OPEN,SUM | T2 T6 T7 |
| `nba_stats.player_playtype_profile` | DB,OPEN,SUM | T3 |
| `nba_stats.player_roster_snapshot` | DB,SUM | T3 T9 |
| `nba_stats.player_season_profile` | DB,OPEN,SUM | T2 T7 |
| `nba_stats.player_shot_quality` | DB,SUM | T3 T4 |
| `nba_stats.player_shot_quality_delta` | DB,OPEN,SUM | T3 T4 T11 |
| `nba_stats.player_shot_zone_profile` | DB,SUM | T3 T4 |
| `nba_stats.player_splits` | DB,OPEN,SUM | T4 T5 |
| `nba_stats.player_tracking_detail` | DB,OPEN,SUM | T3 |
| `nba_stats.player_tracking_profile` | DB,OPEN,SUM | T2 T7 |
| `nba_team` | ARC,DB,OPEN,SUM | T1 T2 T7 T11 |
| `nba_team.defense_vs_position` | DB,FCAL,OPEN,SUM | T5 T7 T11 |
| `nba_team.lineup_profile` | DB,FCAL,OPEN,SUM | T6 T7 T10 |
| `nba_team.playtype_profile` | DB,OPEN,SUM | T3 T7 |
| `nba_team.season_profile` | DB,OPEN,SUM,WRK | T2 T7 |
| `nba_team.team_game_log` | DB,OPEN,SUM | T4 T11 |
| `nba_team.team_game_log_four_factors` | DB,SUM | T7 |
| `nba_team.team_game_log_scoring` | DB,SUM | T7 |
| `nba_team.team_splits` | DB,SUM | T4 T5 T7 |
| `nba_team_id` | ARC,DB,OPEN,SUM | T1 T3 T11 T15 |
| `nba_teams_current.json` | OPEN,SUM,WRK | T1 T14 |
| `nba_teams_current_meta.json` | DB,OPEN | T1 |
| `net_rating` | DB,SUM | T2 |
| `new_official` | OPEN,SUM | T3 |
| `new_player` | DB,OPEN,SUM | T3 |
| `new_str` | OPEN,SUM | T1 T4 |
| `new_team_id` | DB,SUM | T3 |
| `new_value` | DB,OPEN,SUM | T3 |
| `nickname` | DB,OPEN,SUM | T1 T3 |
| `no_stat` | DSN,SUM | T12 T13 |
| `nodejs_compat` | ARC,OPEN,SUM | T1 |
| `non_push_sample` | BCAL,OPEN | — |
| `normal_filter` | BCAL,OPEN | — |
| `not_mined` | DB,SUM | T10 |
| `now_out` | FCAL,OPEN,SUM | T10 |

### O

| Term | Documents | Transcript(s) |
|---|---|---|
| `o_dpm` | DB,SUM | T2 T3 |
| `object` | OPEN,SUM | T2 |
| `odds_api_board_backfill` | ARC,OPEN,SUM | T1 T11 |
| `odds_type` | GD,MUL,OPEN,SUM | T8 T10 |
| `oddspapi_api_key` | DB,OPEN | — |
| `off_rating` | DB,SUM | T2 |
| `official_differential_log` | SUM,WRK | T3 T8 T9 |
| `official_id` | DB,OPEN,SUM | T3 T6 |
| `official_roster_snapshot` | OPEN,SUM,WRK | T3 |
| `officials` | ARC,DB,OPEN,SUM,WRK | T2 T11 |
| `offset` | BCAL,FCAL | — |
| `old_str` | OPEN,SUM | T1 T3 T4 |
| `old_team_id` | DB,SUM | T3 |
| `old_value` | DB,OPEN,SUM | T3 T7 |
| `on_off_dpm` | DB,SUM | T2 T3 |
| `operation` | ARC,SUM | T12 |
| `opp_forced_to_rate` | DB,SUM | T7 |
| `opp_miss_rate` | DB,SUM | T7 |
| `opp_rim_attempt_rate` | DB,SUM | T7 |
| `opp_shot_diet` | DB,OPEN,SUM | T7 T10 |
| `opp_turnover_rate` | DB,SUM | T7 |
| `opponent_position` | DB,SUM | T5 |
| `oreb_pct` | DB,SUM | T2 |
| `ot_rule` | DB,GD,OPEN,SUM | T1 T8 T9 |
| `over_under` | MUL,SUM | T13 |
| `over_win` | DB,DSN,FCAL,GD,OPEN,SUM | T11 T12 T13 |
| `overtime_pace_live` | OPEN,SUM | T10 |
| `owns_db_binding` | DB,SUM | T1 |

### P

| Term | Documents | Transcript(s) |
|---|---|---|
| `p_blowout` | DB,OPEN,REC,SUM | T4 T11 T16 |
| `p_dud` | OPEN,SUM | T7 |
| `p_less` | ARC,BCAL,DB,GD,OPEN,SUM | T9 T16 |
| `p_more` | ARC,BCAL,DB,GD,OPEN,SUM | T4 T5 T9 T16 |
| `p_over` | BCAL,DSN,FCAL,SUM | T10 T13 |
| `p_plays` | BCAL,FCAL | T14 |
| `p_raw` | ARC,BCAL,DB,FCAL,OPEN,SUM | T1 T9 |
| `pace__points__continuous__all__both` | OPEN,SUM | T7 |
| `paper_picks` | DSN,SUM | T11 T12 |
| `parlay_game_lines_backfill` | ARC,OPEN,SUM | T1 |
| `patch_applied` | OPEN,SUM | T11 |
| `pdfplumber` | BCAL,OPEN,SUM,WRK | T11 T12 |
| `penalty` | DB,FCAL,OPEN,SUM | T1 T7 T10 |
| `per_page` | OPEN,SUM | T1 |
| `per_type` | SUM,WRK | T3 |
| `period` | ARC,DB,GD,OPEN,SUM | T8 T9 T11 T17 |
| `periods_ladder_v1` | DB,SUM | T4 T11 T16 |
| `personal_fouls` | BCAL,DB,OPEN,SUM | T1 T8 T9 T10 |
| `pg_ls_waldir` | ARC,SUM | T14 |
| `pg_stat_database.stats_reset` | DB,OPEN | T16 |
| `pg_stat_user_tables.n_live_tup` | OPEN,SUM | T1 |
| `pg_total_relation_size` | DB,OPEN | — |
| `phase1_baseline` | DB,OPEN,SUM | T10 |
| `phase2_enrichment` | DB,SUM | T10 T11 |
| `phase2_window` | DB,SUM | T10 T11 |
| `phase_key` | DB,SUM,WRK | T1 T11 |
| `phase_rank` | FCAL,SUM | T9 |
| `pick6` | ARC,DB,OPEN,SUM | T11 |
| `pickem_stat_id` | ARC,SUM | T12 |
| `platt_fits` | BCAL,FCAL,OPEN,SUM | T9 |
| `platt_log` | BCAL,OPEN | — |
| `player_age` | DB,SUM | T4 |
| `player_aliases` | ARC,OPEN,WRK | — |
| `player_assists` | ARC,DB,OPEN,SUM | T11 |
| `player_batter_hits` | DB,OPEN,SUM | T11 |
| `player_blocks` | DB,OPEN,SUM | T11 |
| `player_blocks_steals` | DB,FCAL,OPEN,SUM | T11 |
| `player_career_season_totals` | OPEN,SUM | T2 T4 T10 |
| `player_double_double` | DB,FCAL,OPEN,SUM | T11 |
| `player_doubles` | OPEN,SUM | T11 |
| `player_earned_runs_allowed` | DB,OPEN,SUM | T11 |
| `player_fantasy_points` | DB,FCAL,OPEN,SUM | T11 |
| `player_first_inning_runs` | OPEN,SUM | T11 |
| `player_fkey` | ARC,SUM | — |
| `player_game_log` | ARC,DB,FCAL,OPEN,SUM | T1 T4 T5 T6 T7 |
| `player_game_log_advanced` | OPEN,SUM | T4 |
| `player_game_starter_status` | ARC,BCAL,DB,OPEN,SUM,WRK | T3 T4 T5 T6 T7 |
| `player_game_starter_status.comment` | FCAL,OPEN,SUM | T8 |
| `player_home_runs` | DB,OPEN,SUM | T11 |
| `player_ids` | DB,SUM | T6 |
| `player_impact_rating` | ARC,DB,OPEN,REC,SUM | T2 T3 |
| `player_name_map` | DB,SUM | T8 |
| `player_onoff_profile` | DB,OPEN,SUM,WRK | T2 T7 |
| `player_outs` | DB,OPEN,SUM | T11 |
| `player_pitcher_strikeouts` | DB,OPEN,SUM | T11 |
| `player_playtype_profile` | DB,OPEN,SUM | T2 T3 T7 |
| `player_points` | ARC,DB,OPEN,SUM | T11 |
| `player_points_rebounds_assists` | DB,FCAL,OPEN,SUM | T11 |
| `player_rbis` | DB,OPEN,SUM | T11 |
| `player_rebounds` | ARC,DB,OPEN,SUM | T11 |
| `player_roster_snapshot` | OPEN,SUM,WRK | T3 |
| `player_rows_written` | OPEN,SUM | T3 |
| `player_season_profile` | DB,OPEN,SUM,WRK | T2 T7 |
| `player_shot_quality` | DB,SUM | T3 T4 T7 |
| `player_singles` | DB,OPEN,SUM | T11 |
| `player_splits` | DB,OPEN,SUM | T4 T5 T7 T11 |
| `player_steals` | DB,OPEN,SUM | T11 |
| `player_stolen_bases` | DB,OPEN,SUM | T11 |
| `player_team_total_runs` | DB,OPEN,SUM | T11 |
| `player_threes` | DB,FCAL,OPEN,SUM | T11 |
| `player_total_bases` | DB,OPEN,SUM | T11 |
| `player_tracking_detail` | DB,OPEN,SUM | T7 |
| `player_tracking_detail.metrics` | OPEN,SUM | T2 |
| `player_tracking_profile` | DB,OPEN,SUM,WRK | T2 T7 T11 |
| `player_triple_double` | DB,SUM | T11 |
| `player_turnovers` | DB,OPEN,SUM | T11 |
| `playerdashboardbygeneralsplits` | ARC,DB,SUM | T4 T5 |
| `playergamelogs` | ARC,OPEN,SUM | T4 T5 |
| `playerindex` | ARC,OPEN,REC,SUM | T1 T5 |
| `players_unchanged_skipped` | OPEN,SUM | T2 |
| `playmaking` | DB,OPEN | T1 |
| `plpython3u` | OPEN,SUM | T6 |
| `plus_minus` | DB,SUM | T4 T5 T6 |
| `plusone_poss_pct` | OPEN,SUM,WRK | T3 |
| `points_1h` | DB,OPEN | T1 |
| `points_1q` | DB,OPEN | T1 |
| `points_2h` | DB,OPEN | T1 |
| `points_4q` | DB,OPEN | T1 |
| `points_rebounds_assists` | FCAL,OPEN | — |
| `position_vs_anchor` | GD,SUM | T12 |
| `potential_assist_rate` | DB,SUM | T7 |
| `pra_1q` | DB,OPEN,SUM | T1 T8 T11 |
| `pre_post_allstar` | DB,OPEN | T4 T5 |
| `prior_season` | DB,FCAL,SUM | T11 |
| `prizepicks_mlb_current.json` | MUL,OPEN,SUM | T1 |
| `product_experience_id` | OPEN,SUM | T1 T12 |
| `proj_min` | ARC,BCAL,DB,DSN,FCAL,SUM | T14 T16 |
| `prop_family` | DB,SUM | T11 |
| `prop_taxonomy` | BCAL,DB,OPEN,SUM,WRK | T1 T7 T8 T9 T11 |
| `prop_taxonomy.build_tier` | DB,OPEN | — |
| `prop_universe` | DB,FCAL,OPEN,SUM | T11 T12 T16 T17 |
| `proposed_value` | DB,OPEN,SUM | T7 |
| `psycopg` | OPEN,SUM | T11 |
| `pt_defend` | BCAL,SUM | T11 |
| `pts_total` | DB,SUM | T2 |
| `public` | DB,SUM | T1 |
| `put_file` | OPEN,SUM,WRK | T1 T7 T8 T11 T18 |
| `py_compile` | SUM,WRK | T1 T3 |

### Q

| Term | Documents | Transcript(s) |
|---|---|---|
| `quantile_bands` | DB,SUM | T7 T8 |
| `questionable` | DSN,FCAL,SUM | T8 |

### R

| Term | Documents | Transcript(s) |
|---|---|---|
| `rate36` | BCAL,DB,DSN,FCAL,SUM | T14 |
| `rate_tier` | DB,OPEN,SUM | T10 |
| `rationale` | DB,SUM | T7 |
| `raw_count` | OPEN,SUM | T3 |
| `raw_json` | ARC,DB,OPEN,REC,SUM,WRK | T1 T2 T3 T4 T5 |
| `reactivated` | OPEN,SUM | T3 |
| `real_games` | OPEN,SUM | T3 |
| `real_sample_size_observed` | DB,OPEN,SUM | T4 T5 T7 T8 |
| `reallocated` | FCAL,OPEN,SUM | — |
| `reb_pct` | ARC,FCAL,OPEN,SUM,WRK | T3 T7 T9 |
| `reb_rate` | OPEN,SUM | T7 |
| `reb_total` | DB,SUM | T2 |
| `rebounding` | DB,OPEN | T1 |
| `rebounds_1q` | OPEN,SUM | T1 T8 |
| `recipe_version` | DB,OPEN,SUM | T9 T18 |
| `redistribution_factors` | DB,OPEN,SUM | T1 T4 T10 |
| `ref_teams` | DB,OPEN,SUM | T1 T15 |
| `referee_assignment` | OPEN,SUM | T10 |
| `referee_assignments` | OPEN,SUM | T4 T8 T15 |
| `referee_crew` | OPEN,SUM | T10 |
| `referer` | OPEN,SUM | T1 |
| `regular` | DB,SUM | T11 |
| `relevant_prop_keys` | FCAL,OPEN,SUM | T1 T10 |
| `reltuples` | BCAL,DB,DSN,GD,OPEN,SUM | T12 T13 T14 |
| `request_id` | DB,SUM | T1 |
| `research_notes` | OPEN,SUM | T10 |
| `result_set_rows` | OPEN,SUM | T4 |
| `returncode` | ARC,SUM | T12 T13 |
| `returned_lines` | OPEN,SUM | T1 T10 |
| `role_minutes_multiplier` | ARC,BCAL,DB,OPEN,SUM | T1 T9 |
| `role_tier_key` | DB,OPEN,SUM | T7 T10 T13 |
| `rows_written` | OPEN,SUM | T3 |
| `run_at` | DB,OPEN,SUM,WRK | T1 T9 |
| `run_id` | DB,OPEN,SUM | T1 |
| `run_sql` | ARC,OPEN,SUM | T1 |
| `run_sql_postgres` | ARC,DB,OPEN,SUM,WRK | T1 T11 T18 T19 T20 |
| `rung_market` | ARC,DB,DSN,FCAL,OPEN,SUM,WRK | T4 T11 T13 T17 |

### S

| Term | Documents | Transcript(s) |
|---|---|---|
| `scenario_calibration` | DB,OPEN,SUM,WRK | T1 T4 T11 |
| `scenario_realised` | DB,DSN,OPEN,SUM,WRK | T4 T11 T18 |
| `sched_static_weekly` | ARC,OPEN | — |
| `schedule_norm` | DB,OPEN,SUM | T4 T11 T18 |
| `schedule_profile_key` | DB,SUM | T1 |
| `scheduleleaguev2` | ARC,SUM,WRK | T3 |
| `schema_config_db.sql` | DB,OPEN | T15 |
| `scope_lock` | OPEN,SUM,WRK | T2 T3 |
| `score.real_slip_leg_observations` | DB,MUL,OPEN,SUM | T4 T10 T16 |
| `score_poss_pct` | OPEN,SUM,WRK | T3 T10 |
| `scrape.yml` | OPEN,SUM | T1 T12 |
| `scrape_nba_backfill_2025_26` | SUM,WRK | T4 |
| `scrape_nba_backfill_measure_types` | OPEN,SUM | T7 |
| `scrape_nba_career_totals` | SUM,WRK | T4 |
| `scrape_nba_daily_delta` | OPEN,SUM | T7 |
| `scrape_nba_lineups` | OPEN,SUM,WRK | T7 |
| `scrape_nba_matchups_pergame` | OPEN,SUM | T7 |
| `scrape_nba_onoff` | OPEN,SUM,WRK | T7 |
| `scrape_nba_per_game_delta` | OPEN,SUM | T7 |
| `scrape_nba_player_bio` | OPEN,SUM | T7 |
| `scrape_nba_player_tracking` | OPEN,SUM | T7 |
| `scrape_nba_playtypes` | OPEN,SUM | T7 |
| `scrape_nba_shotquality` | OPEN,SUM | T4 T7 |
| `scrape_nba_splits` | OPEN,SUM | T4 T7 |
| `scrape_nba_team_stats` | OPEN,SUM | T7 |
| `scrape_nba_tracking_detail` | OPEN,SUM | T7 |
| `scrape_sleeper_board` | ARC,SUM | T12 |
| `scrapegw` | ARC,SUM | T12 |
| `search_path` | OPEN,SUM | T11 T15 |
| `season_id` | DB,SUM | T3 T4 |
| `semi_automatic` | DB,OPEN,SUM | T7 |
| `sf_poss_pct` | OPEN,SUM,WRK | T3 T10 |
| `shards` | OPEN,SUM | T11 T12 |
| `shooting` | DB,OPEN | T1 |
| `shot_quality_delta` | DB,OPEN,SUM | T3 T4 |
| `shrink_beta` | FCAL,OPEN | T1 |
| `shrinkage_stabilization_games` | BCAL,DB,FCAL,OPEN,SUM | T7 |
| `single_absence` | FCAL,OPEN,SUM | T1 |
| `single_call_all_playtypes` | OPEN,SUM | T3 |
| `skip_mining` | ARC,WRK | — |
| `skipped` | OPEN,SUM | T1 |
| `slate_games` | DB,OPEN,SUM | T1 T9 |
| `sleeper` | ARC,DB,OPEN,REC,SUM | T1 T11 |
| `sliding_scale` | DB,SUM | T4 T11 T12 T16 |
| `snapshot_label` | DB,DSN,GD,MUL,OPEN,SUM | T11 T12 |
| `snapshot_taken_at` | DB,SUM,WRK | T3 T8 T9 |
| `snapshot_ts` | ARC,OPEN,SUM | T11 |
| `sort_order` | DB,SUM | T7 |
| `source_fetch_error` | OPEN,SUM | T2 |
| `source_file` | BCAL,DB,OPEN,SUM | T1 T9 T10 |
| `sports_book` | OPEN,SUM | T12 |
| `sports_book_public` | ARC,OPEN,SUM | T12 |
| `sports_book_request` | ARC,SUM | T12 |
| `spread_used` | OPEN,SUM | T11 |
| `spreads` | DB,SUM | T11 |
| `stabilization_reference_games` | BCAL,SUM | T7 T8 |
| `start_position` | DB,SUM | T5 |
| `starter_status` | DSN,FCAL,SUM | T11 T13 T15 |
| `stat_expression` | DB,SUM | T11 |
| `stat_key` | DB,SUM | T7 |
| `static_prop_taxonomy` | OPEN,SUM | T8 |
| `stats_hitter` | DB,OPEN,SUM | T1 |
| `stats_pitcher` | DB,OPEN,SUM | T1 |
| `stats_pitcher.game_logs` | OPEN,SUM | T2 |
| `stats_seasons` | OPEN,SUM | T7 |
| `stl_rate` | DB,OPEN,SUM | T7 |
| `stolen_base_family` | FCAL,OPEN | — |
| `storage_diet_plan_2026_09_17` | DB,OPEN | T17 T18 |
| `str_replace` | ARC,OPEN,SUM | T1 T7 |
| `synergyplaytypes` | ARC,SUM,WRK | T3 |

### T

| Term | Documents | Transcript(s) |
|---|---|---|
| `tail_lines` | OPEN,SUM | T1 |
| `team_aliases` | ARC,DB,OPEN,SUM,WRK | T1 |
| `team_change` | DB,OPEN | T3 |
| `team_game_log` | OPEN,SUM | T1 T4 T11 |
| `team_game_log_advanced` | OPEN,SUM | T11 |
| `team_game_log_four_factors` | ARC,SUM,WRK | T3 T9 T10 |
| `team_game_no` | BCAL,OPEN,SUM | T16 |
| `team_roster_snapshot` | OPEN,SUM,WRK | T3 |
| `team_splits` | OPEN,SUM | T4 T5 |
| `teamdashboardbygeneralsplits` | DB,SUM | T4 T5 |
| `teamdetails` | ARC,DB,OPEN,REC,SUM,WRK | T2 T8 |
| `teamgamelogs` | ARC,OPEN,SUM | T4 |
| `teammate_shooting_quality` | DB,SUM | T7 |
| `teamplayeronoffdetails` | ARC,DB,FCAL,SUM | T2 T3 |
| `test_season` | FCAL,SUM | T9 |
| `thinking` | ARC,DB,OPEN,SUM,WRK | T1 T2 T3 T11 T12 |
| `threes_made_1q` | OPEN,SUM | T1 T8 |
| `tier_band_calibration` | DB,OPEN,SUM | T4 T11 |
| `tier_label` | DB,OPEN,SUM | T7 T10 |
| `tier_selection_value` | DB,OPEN,SUM | T4 T11 |
| `tiered_bands` | DB,SUM | T7 T8 |
| `tiered_inelastic` | BCAL,DB,FCAL,OPEN,WRK | T1 |
| `timestamptz` | DB,OPEN,SUM | T1 T9 T10 |
| `tool_use` | DB,FCAL,OPEN,SUM,WRK | T1 T2 T6 T11 T12 |
| `tools` | OPEN,SUM | T11 T15 |
| `total_fga` | DB,OPEN,SUM | T3 T4 T5 |
| `total_log_lines` | OPEN,SUM | T1 |
| `tov_poss_pct` | OPEN,SUM,WRK | T3 T10 |
| `tov_rate` | DB,OPEN,SUM | T7 T10 |
| `trigger_reason` | ARC,OPEN,SUM | T1 T9 |
| `triple_double` | DB,OPEN,SUM | T1 T8 T10 T11 T12 |
| `ts_pct` | DB,SUM | T2 |
| `two_way_designation_source` | OPEN,SUM | — |

### U

| Term | Documents | Transcript(s) |
|---|---|---|
| `undefined` | OPEN,SUM | T3 |
| `under_win` | DB,DSN,FCAL,GD,OPEN,SUM | T11 T12 T13 |
| `underdog` | ARC,DB,OPEN,REC,SUM | T1 T4 T11 T16 |
| `underdog_board_current` | OPEN,SUM | T1 |
| `unmatched` | DSN,SUM | T13 |
| `unmatched_not_in_season` | DB,DSN,FCAL,GD,OPEN,SUM | T12 T13 |
| `unmatched_player` | DB,DSN,FCAL,GD,OPEN,SUM | T11 T12 T13 |
| `updated_at` | ARC,DB,FCAL,GD,MUL,OPEN,SUM,WRK | T1 T2 T3 T4 T7 |
| `urllib` | OPEN,SUM | T13 |
| `us_dfs` | ARC,OPEN,SUM | T11 T13 |
| `us_ex` | ARC,SUM | T12 |
| `usage_share` | DB,SUM | T7 |
| `used_emp` | DB,FCAL,OPEN,SUM | T9 T10 |
| `usg_pct` | ARC,DB,FCAL,OPEN,SUM,WRK | T2 T3 T7 T9 |

### V

| Term | Documents | Transcript(s) |
|---|---|---|
| `validate_blowout_upgrade` | DB,SUM | T4 T11 T16 |
| `validationerror` | ARC,SUM | T12 |
| `var_band` | DB,SUM | T9 T10 |
| `variant` | FCAL,OPEN | — |
| `variation_band` | DB,OPEN,SUM | T1 T4 T5 T7 T10 |
| `variation_bands` | DB,OPEN,SUM | T1 T7 T8 T9 T10 |
| `variation_bands.band_key` | DB,SUM | T4 T5 T7 T8 |
| `vars_present` | SUM,WRK | T2 |
| `verified_at` | OPEN,SUM | T12 |
| `volume` | DB,OPEN,SUM | T1 |

### W

| Term | Documents | Transcript(s) |
|---|---|---|
| `w_pct` | DB,OPEN,SUM | T4 T5 T6 |
| `web_fetch` | OPEN,SUM | T1 T3 T11 |
| `web_search` | DB,DSN,OPEN,SUM,WRK | T1 T2 T11 T18 |
| `weekly` | OPEN,SUM,WRK | T5 T7 |
| `wins_losses` | DB,OPEN | T4 T5 |
| `worker_group` | DB,SUM,WRK | T1 |
| `worker_manifest.json` | ARC,OPEN,SUM,WRK | T1 |
| `worker_manifest_nba.json` | ARC,OPEN,REC,SUM | T1 T6 |
| `worker_name` | DB,SUM,WRK | T1 |
| `workers.dev` | ARC,OPEN,SUM | T1 |
| `wrangler` | ARC,OPEN | T1 |
| `wrangler.json` | ARC,WRK | — |

### X

| Term | Documents | Transcript(s) |
|---|---|---|
| `x_ast_100` | OPEN,SUM,WRK | T3 |
| `x_fg3_pct` | OPEN,SUM,WRK | T3 |
| `x_fg_pct` | OPEN,SUM,WRK | T3 |
| `x_ft_pct` | OPEN,SUM,WRK | T3 T10 |
| `x_minutes` | OPEN,SUM,WRK | T3 |
| `x_pace` | OPEN,SUM,WRK | T3 |
| `x_pts_100` | OPEN,SUM,WRK | T3 |

### Y

| Term | Documents | Transcript(s) |
|---|---|---|
| `year_founded` | DB,OPEN,SUM,WRK | T2 T6 T10 |
| `years_pro` | DB,SUM | T2 |

### Z

| Term | Documents | Transcript(s) |
|---|---|---|
| `zero_officials_parsed_v3` | OPEN,SUM | T11 |

---

## A

**A2 — teammate redistribution** · T15, T16 · The enrichment factor that redistributes an absent
player's production. **Five panels failed, then fully RETRACTED** — the certified anchor wins every
slice, and worst where the mechanism predicted it should win. COMPASS fact 91.

**A3 — return ramp** · T10, T16 · Minutes ramp after a return. Assigned to BASELINE by the parity doc,
so never an enrichment candidate. Gated at leg level: zero gain.

**A5 — lineup change** · T15 · **REJECTED/CLOSED.** A derived as-of proxy is redundant — the
allocator's recent-5 minutes already encode starting. *"No projected lineups needed → no leak to
mitigate."* **This is why P3 has no lineup scrape.**

**admin-sql** → see *bridge*.

**anchor** · T13, LIVE · The standard line a ladder is measured from. Two cases: **explicit** (a
standard line is on the board) and **switch_point** (the *invisible anchor* — see below).

**as-of** · T10, T14, LIVE · Every value computed from only what was knowable at that day's cutoff.
The governing rule of the whole system. `nba/nba_asof.py` holds the cutoffs.

**availability delta** · LIVE · `nba/build_availability_delta.py` — what changed between P2's overnight
report and P3's 1:15 PM view. Only material availability moves matter.

## B

**B4 — opponent availability / rim protection** · T15, T16 · Closed in three formulations, 0 of 5 props.

**band cell** · T8 · A calibration correction fitted per variation band. **THE PERMANENT RULE:
*"a band cell is kept ONLY if its sign is consistent across seasons."*** A cell that flips sign between
seasons is fitting a **regime**, not a **structure**, and freezing it makes the model **worse than no
cell at all**. Established when rebounds ELITE was under-projected in both seasons (structural, kept)
while 3PM mid-bands ran **+2.8 in 2024-25 and −3.6 in 2025-26** (regime, dropped in favour of
walk-forward tables + in-season Platt).

**shift vs replacement mode** · T8 · Two ways to apply an empirical cell. **Shift** = a logit-level
adjustment on the parametric — *"calibrate level, preserve ordering"*. **Replacement** = use the
empirical table directly. **Decided PER PROP by evidence**: replacement for points/rebounds/assists,
shift for 3PM (λ=1.0), λ=0.5 for blocks/steals/ftm/oreb. *"turnovers/fouls tested at 0.5 and 0.25 and
were WORSE than replacement → stay replacement."*
**Why shift fixed 3PM**: the empirical cells keyed on attempt tier × role averaged a 33% and a 42%
shooter together, **shrinking away the make-rate ordering the parametric already knew**.

**structure vs regime** · T8 · The distinction the season holdout exists to draw. **Structure**
reproduces across seasons and can be frozen into a cell. **Regime** flips sign and must be handled by
walk-forward refitting instead. **The holdout was the owner's suggestion as a robustness check and
produced a permanent selection criterion.**

**calibration vs edge** · T9 · **The distinction that governs how the system is used.**
*"**Calibrated** means the stated probabilities are **honest**: when the recipe says 75%, roughly 75%
of those legs hit, on every band, both seasons, out of sample — the property that makes **slip EV
computable and Goblin/Demon pricing comparable**. It does NOT mean any single leg is near-certain:
**a calibrated 75% still loses one time in four.** **Calibration is the foundation; EDGE comes from the
factor layer and the enrichment deltas on top of it.**"*

**certification ladder** · T8, T9 · The per-prop states: **CERTIFIED** (ladder ≤1.5 pp, zero
band×direction×rung cells over 2.5 pp, confidence bands hitting their rate on BOTH seasons) ·
**CLOSE** (ladders fine, 2–5 confidence bands off by 2.6–4.4 pp) · **REGIME RESIDUAL** (sign flips
between seasons; walk-forward Platt carries it) · **CONFIGURED, NOT RUN** · **NOT YET CERTIFIED**.
As of T9: **6 certified** (points, rebounds, assists, 3PM, FGA, FTM), **4 close** (blocks, steals,
turnovers, fouls), **1 regime** (3PA), **combos certified** (P+R, P+A, R+A, PRA, fantasy).
✅ **`FGA` SETTLED 2026-09-21 by §T10.1b — a third independent authority.** The live config row
`nba_config.classification_config.single_stat_scoreboard_two_seasons`, written **2026-09-09 05:55:58
UTC** (51 seconds after `fga`'s inline `# CERTIFIED` comment), lists **`certified`: points, rebounds,
assists, threes_made, `fga`** — so the inline comment, the config and the owner's T9 statement all
certify `fga`, and **the docstring's line 11 is the stale statement.**
🔴 **`FTM` is the reverse — and it is the CONFIG that is stale.** That same row puts **`ftm` in
`close_not_certified`**, because it was written **sixteen hours before the T9 session** in which the
owner stated the certified six. **Its own `notes` field says so: *"State as of 2026-09-09 v20."***
⚠ **`[LIVE-AUDIT]` Nothing reads that key, or `classification_config` at all, anywhere under `nba/`.**

⚠ *2026-09-21 (§T9.35b/c, extended §T9.36a): **TWO of this certified six are listed as "configured,
NOT yet run" in the recipe's module docstring, line 11** — **`FGA`** (which also carries its own
inline `# CERTIFIED both seasons (0.9 / 1.3, 0 band misses)`, so the file contradicts itself) and
**`FTM`** (which carries **no** inline certification marker, so the file contradicts this record).
**Which governs is NOT RECORDED; line 11 is undated.** And **NOT YET CERTIFIED is four props —
`fgm`, `fta`, `oreb`, `dreb`** — not the two usually listed.*

**opponent-driven props** · T9 · **The structural reason blocks, steals and FTM resist certification**:
*"the 'close' props are EXACTLY the ones whose primary drivers are **opponent** stats — steals ←
opponent turnover rate."* A player-history baseline cannot see them. *"These are the noisiest per-game
stats in the sport; the research consensus for them is exactly what's built."*

**baseline** · T4, T7, T8, T9 · *"The heart of the system"* (owner, T1). The historical-only projection
producing hit probability and confidence. **Strictly historical — enrichment is separate** (T4).
**The five-step design (T4, `nba/NBA_BASELINE_METHODOLOGY.md`)**: EWMA per-36 rate with Bayesian
shrinkage → separate faster-moving minutes projection → pace + opponent-defence multipliers → raw
projection → **anchor to team-implied totals**. Volatility via rolling SD; trend via a second faster
EWMA, **dampened so it does not double-count the primary**.

**baseline vs enrichment — WHY they are separate** · T4 · **The owner's correction, and the reason is
caching cost**: *"the baseline is expensive to compute but **only changes after a player plays a
game — it can be cached**. Enrichment data (injuries, odds) changes constantly."*
**This is the founding justification for today's P2 (overnight) / P3 (afternoon) split.**

**THE BASELINE BOUNDARY** · T7 · **Redefined, and this is the line the system still uses**:
*"The baseline isn't 'player history only.' It's **everything derivable from static and historical
data** — including the calendar, which tells us the opponent, home/away and rest days. So **opponent
defence, pace matchup and blowout risk all belong in the baseline**, derived from team strength rather
than a live spread. **Only truly live inputs (injury reports, confirmed lineups, market lines) are
enrichment** — and for the important ones, **the baseline carries a derived signal as backup**."*
**That last clause is why the derived-spread proxy (r=0.46) existed before the real market spread
replaced it in T16.**

**the three-generation trap** · T7 · Two of MLB's three classification/baseline generations are dead
and say so in their headers (`-v5`: *"OLD VERSION — DO NOT TOUCH — CONFIRMED DEAD"*; the D1 v6:
*"CONFIRMED DEAD, do not build on this"*). **The live one is
`runClassificationBaselineV6ToPostgres`**, writing `classification.classification_v6_current` and
`baseline_v6_current`. **Porting from either dead version would have locked in wrong logic.**

**blowout as a minutes MIXTURE** · T7 design, T16 build · *"blowouts don't reduce points, they reduce
**minutes**"* → `P(blowout) × [blowout-minutes dist] + (1−P) × [competitive dist]`, *"causal and
self-explaining rather than a post-hoc probability drag."* **This is why `blowout_model` stores ratios
(competitive 1.0333) and not penalties** — and why it does not double-count the shortened minutes the
baseline's history already contains.

**`NBA_BASELINE_METHODOLOGY.md`** · T4 · The design document for the baseline. Design-only, no code —
*"matching the research-first pattern this whole project has followed."*

**minutes projection** · T4 · Flagged at design time as ***"the single biggest source of error in any
player-prop model"*** — not a solved problem. Everything the allocator, the blowout factor and the
availability model do is an attack on this.

**TEAM_ID = 0** · T4 · In `playercareerstats`, traded players get per-team rows **plus** a combined
total row at `TEAM_ID = 0`. **A naive `SUM()` double-counts them.** Resolved empirically after search
could not settle it.

**baseline_history** · T14 · `nba_score.baseline_history`, 19.34M rows. *"Certified never meant
stored"* — the harness discarded per-leg probabilities; this table is what the engine READS.

**Betr** · T13 · DFS app. GraphQL, owner's Keycloak token, tiers REGULAR → EDGE_4.

**blowout** · T16 · Non-negotiable factor. Upgraded from an r=0.46 proxy to the **real market spread**.
A 13+ favourite blows open 39.7% vs 0.4%. Winning blowouts cost starters MORE minutes than losing ones.

**board_snapshots** · T11, T13 · `nba_market.board_snapshots` — every board leg, all apps, all
snapshots. **Has a `multiplier` column.**

**board_tiers / board_tiers_ud** · T13 · Tier classification. **The `_ud` version already implements
the four-way rule; the PrizePicks version does not.**

**bridge** · T1 · `alphadog-v2-admin-sql.js`, the MCP worker exposing every tool. New workers need a
binding + enum + dispatch branch. **A new tool is unusable in the session that adds it.**

**BT_ vars** · T8, T9, LIVE · The baseline builder's environment: `BT_ASOF`, `BT_PROPS`, `BT_CUTOFF`
(baseline|phase1|phase2), `BT_REPLAY`, `BT_INJURY`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS`,
~~`BT_TRAIN`/`BT_TEST`~~. 🔴 **CORRECTED 2026-09-22, T20 pass 96 (§T20.101): `BT_TRAIN`/`BT_TEST` are
INERT in the baseline builder** — *`build_baseline_ladder.py` **replaces** the harness line that reads
them with season auto-detection from the files on disk, so setting them changes nothing and raises
nothing.* ⚠ **They remain load-bearing in the HISTORY builders** *(COMPASS fact 66)*, which is why one
list could not serve both. ➕ **And one flag was missing: `BT_TAG`, which the script sets to `"prod"`
itself.** ▶ **Full combination→role mapping, with the two silent failures it exposes:
`NBA_WORKERS.md` — *THE MODE DISPATCH TABLE*.**

## C

**composition check** · T1 (blueprint §9) · A verification that **both expected output categories are
present in plausible proportions**, not just that the row count matches. *"A **100%/0% split is a red
flag even when the total row count exactly matches expectations**."* Distinguishes a died-mid-write
batch from a complete one. → `NBA_SYSTEM_DESIGN.md` §6b · **not recorded as built on
`nba_score.board_scored`.**

**corrupt-and-fix testing** · T1 (blueprint §8) · **"MLB's single most reliable verification
pattern."** Deliberately change or delete a real row in the database, then confirm the pipeline
detects and repairs it on the next run — instead of only ever testing the happy path. →
`NBA_SYSTEM_ARCHITECTURE.md` §8b.

**coverage-gap check** · T1 (blueprint §4b, motivated by §7f) · A **diagnostic-only, never
automatically acting** check surfacing any **(prop, side, high-confidence bucket)** combination with a
real resolved-outcome deviation past a threshold **and zero active correction covering it**. Exists to
catch a silent calibration regression *before* it runs for weeks. → `NBA_FINAL_SCORING_CALIBRATION.md`
§7m Safeguard 1, §7m2 · **not recorded as built.**

**`confidence_verification`** · LIVE · `nba_score.confidence_verification` — the table holding every
confidence check's stated-vs-actual gap. ⚠ **Four writers; three scope their deletes to their own
partition (`tier='v3'`, `tier IN ('v2','high_vs_low')`, `check_type='mondrian_quintile'`) and
`verify_confidence.py` deletes the WHOLE TABLE.** Running it erases P2's nightly v3 rows. **Not yet
fired** — three generations of rows currently coexist. → `NBA_DATABASE.md` · `NBA_OPEN_ITEMS.md`.

**certification center** · T1 · **The UI — it already exists (MLB's) and will be integrated.** An
aggregator of legs and a slip builder. *"the main UI will be the same."* **Nothing to build.**

**combos** · T9, T14 · Multi-stat props (pra, pts_reb, pts_ast, reb_ast, stocks) via joint simulation.
**Need `BT_SAVE_COMPONENTS` singles pickled FIRST.** A missing combos build = 44% of the board.

**confidence** · T15, LIVE · **A data thermometer, not a probability.** Starts at 99, deducts for named
deficiencies. Measures EPISTEMIC uncertainty only. Mean 0.92–0.95.

**curl_cffi** · T1 · Browser TLS impersonation. **Mandatory** for stats.nba.com — plain `requests` is
fingerprinted and tarpitted, and a proxy does NOT help.

**Claude Coworker** · T1 · **The scheduler.** Each of the three runs is triggered by a Coworker
scheduled task, worker by worker. *"no runner, orchestrator or anything like, it only breaks the run."*
**Coworker is what replaced the orchestrator.**

**Cloudflare-to-Cloudflare** · T1 · The root cause of the nba.com block. stats.nba.com is itself
Cloudflare-fronted, and Worker→Cloudflare-site traffic is flagged at the WAF/edge. **The request never
reaches the app layer** (error 520). No header tuning fixes it.

**`FALLBACK_AFTER_FETCH_ERROR`** · T1 · *(full value: **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`**)*
The `source_key` written when the live fetch fails and the certified static list is used.
**Check it before trusting a load.** Its counterpart is `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`.

**`BASE_HITTER_GAME_LOGS_WORKER`** · T1 · The MLB precedent NBA workers copy for bridge dispatch —
**a direct call that bypasses the queue entirely**, matching the owner's no-orchestrator rule.

**"mlb calls referees Umpire"** · T1 · The owner's own search key for finding the referee analogue.
**He supplied it**; it is why `ref.umpire_tendency` became the model rather than the factor being
treated as new territory.

**`nba_api` (swar/nba_api)** · T1 · The Python package whose docs supplied **the canonical header set
and the static TEAM_ID list**. **Issue #155** tracks stats.nba.com's changing header requirements —
**look there first if it breaks again.**

**`startswith("alphadog-v2-nba-")`** · T1 · The guard on every NBA branch in the two shared deploy
scripts. **Provably zero-impact on MLB.** Any future edit must keep it.

## D

**day-by-day table** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7) · The **exact layout the owner
expects for any backtest or real-slip report**, specified verbatim and *"reuse directly for NBA"*:
`Date · Slips · Full hits · 5/6 · ≤4/6 · Staked · Return · Profit · ROI`, **$1/slip**, **TOTAL row
bolded**, **partial-hit columns explicit** *"so the actual failure mode stays visible."* Owed
*"before being asked, every time a finding is reported."* **NEVER PRODUCED for NBA** — no slip
history exists. → `NBA_MULTIPLIERS.md` §8b · `NBA_OPEN_ITEMS.md`.

**DARKO** · T2, T3 · DPM ratings, SvelteKit hydration extraction, 530/530.

**DataDome** · LIVE · The wall on `app.prizepicks.com` and its payout endpoints. **Not defeated** —
proxy + chrome124 still 403.

**data_quality** · T1 · `DEFAULT 'derived'` on reference tables from the first DDL. Sourced vs derived
distinguished from day one.

**delta** · T6, LIVE · The day-by-day incremental store. **Its one dangerous failure is a SILENT hole** —
row counts still rise. Audited against the schedule by `nba/check_delta_gaps.py`.

**demon** · T13, LIVE · A harder-than-standard rung. **Above the anchor with More; BELOW it with Less.**
Hit 32.9/21.3/14.8% at T+1/+2/+3, needing 1.48/2.30/3.31× against a ~1.75–1.9× ceiling →
**only demon T1 is ever worth solving.**

## E–F

**`FE_DATE`** · `nba/build_final_hp.py` · ⚠⚠ **A READ FILTER, NOT A WRITE SCOPE.** It scopes the
`SELECT` from `baseline_history` to one slate; the `DELETE FROM nba_score.final_hp WHERE season AND
prop` carries **no date predicate**, so a scoped write **replaces the whole season × prop partition
with one slate**. **CONFIRMED FIRED**: the 2025-26 partition holds **one date and 140,130 rows**
against a documented 38.7M-row table — **~19.5M rows**, recoverable from `baseline_history`.
**Blueprint §7g bug class 1.** → `NBA_OPEN_ITEMS.md` (top) · `NBA_DATABASE.md` · `NBA_WORKERS.md` §5.

**flat vs proportional partial credit** · T1, **lesson #27** · The structural difference between DFS
platforms' Flex partial-hit payouts: **flat fixed values independent of the full-hit multiplier** on
one platform, **scaling proportionally with it** on another. *"The two structures produce meaningfully
different expected values for the same underlying leg-hit distribution."* **Verified for PrizePicks
only (flat); NOT RECORDED for Underdog, Sleeper, Betr, Fliff** — and §0.2e's dynamic-pricing finding
makes flat the *unlikely* prior for Underdog and Sleeper. → `NBA_MULTIPLIERS.md` §0.2h ·
`NBA_FINAL_SCORING_CALIBRATION.md` §14 #27 · `NBA_GOBLIN_DEMON.md` §6.

**edge** · LIVE · Distance above break-even, its own column. Answers *"is this an opportunity"* —
distinct from score, which answers *"how good is this leg"*.

**enrichment** · T10, T15, T16 · The factor layer on top of the baseline. **Ten candidates tested,
none survived at leg level.**

**factor_gate_results** · T16 · `nba_score.factor_gate_results` — every verdict, in the database.
*"A verdict that only exists in stdout is not a verdict."*

**file trigger** · T1 · `nba/TRIGGER_NBA_SCRAPE.txt`, `nba/TRIGGER_NBA_PROBE.txt`. Exists because
**`workflow_dispatch` cannot be fired by a push, but `on: push: paths:` can**, and the owner refused
manual triggering.

**Fliff** · T12 · Reverse-engineered from web bundles.

**four-way taxonomy** · T13, LIVE · **Below the anchor: More = goblin, Less = demon. Above it:
More = demon, Less = goblin.** A function of (position vs anchor, side), **never the emoji**.
Live since 2026-08 on MLB/WNBA.

## G–I

**goblin** · T13, LIVE · An easier-than-standard rung. **Below the anchor with More; ABOVE it with
Less.** Hit 74.1/68.7/61.9% at T−3/−2/−1 but observed factors take 40–53% → **−EV at every tier.**

**grader** · T13 · `nba/grade_board_outcomes.py` → `nba_market.board_outcomes`, 6.9M legs.
**Leg truth and operator settlement are separate.**

**Hyperdrive** · T1 · Cloudflare's connection layer to DigitalOcean Postgres.

**invisible anchor / switch point** · T13 · When no standard line is offered, the anchor is derived from
where goblins flip to demons. *"10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor."*
**Validated on 42,600 ladders.** 419,205 legs carry one.

## J–K

*Added `2026-09-23`, `§F7.4`. ⚠ **This bucket did not exist.** `§Z` carried `7` `J`/`K` terms with
no body range to define them in — the body ran `G–I` straight to `L–N`, so a reader who found a `J`
or `K` term in the index had nowhere to go. **The range is now contiguous `A … W`.***

**`jersey_num`** · T6 · DB,OPEN,SUM · The referee jersey number carried on `nba_ref.officials` —
part of the Wikipedia roster scrape *(74 staff + 7 non-staff)*, because the stats API has no
referee endpoint at all.

**`job_key`** · T1, T4 · DB,OPEN,SUM,WRK · The control-plane key for a worker, `nba-<domain>-<thing>`.
**Unique** on `nba_config.worker_definitions`. *It is the naming half of the four-edit registration
rule; the other three are the manifest, the generator and admin-sql.*

**`job_queue`** · T1 · OPEN,REC,SUM · The MLB control-plane table the NBA base handoff wired but
**does not use** — ⚠ *NBA workers use DIRECT DISPATCH, bypassing the queue. Recorded as a caveat,
not a defect: the no-orchestrator rule makes the queue redundant.*

**`journal.txt`** · — · OPEN,SUM · 🔑 **The index to every transcript.** *`T19` seg `58`: "the
journal exists and I ignored it… my first move on any 'have we done this?' question should be to
read that, then grep the named transcript."* ⇒ **`§F7.1`: that diagnosis is the reason this corpus
exists, and it was itself unrecorded until `2026-09-23`.**

**`k_stab`** · T7–T10, T15 · BCAL,DB,FCAL,OPEN,REC,SUM · The Efron–Morris shrinkage constant — how
many observations before a cell trusts itself. *Tier-blend `k = 5` came verbatim from MLB;
`oreb`'s was moved `60 → 4` and the band bias fell `0.241 → 0.045`.* 🔑 **A tunable that lives in
config, never in code.**

**`known_empty_games`** · T3, T7, T9, T11 · ARC,DSN,OPEN,SUM,WRK · A persisted skip list for games
the SOURCE itself returns empty for. 🔑 *"Without it the `3` games the source returns empty would be
re-fetched every single day forever."* ⇒ **a permanent source gap needs a permanent record, not a
retry loop.** ⚠ *And it is exactly the empty-array shape that produces `NOT IN` / "malformed array
literal" failures on day one.*

**`known_limitation`** · T2, T3, T6 · OPEN,SUM · The corpus's own tag for a bounded, accepted gap —
as distinct from a bug. *Used where the constraint is structural (the `player_splits` PK omitting
`season`) rather than an error.*

---

## L–N

**leg-by-leg manual tracing** · T1 (blueprint §9) · Scrutiny technique 2: take real **high-confidence**
outputs, pull raw source data **by hand**, compute the expected value independently, and explain any
gap through a **documented mechanism** (shrinkage, calibration) rather than accepting *"looks close
enough."* → `NBA_SYSTEM_DESIGN.md` §6b.

**`malformed array literal`** · T1 (blueprint §7g) · A real Postgres error produced by a **`NOT IN`
clause built from an array parameter through a query-builder's tagged-template array handling**,
**especially when the array is empty**. Fix: explicit array-literal-with-cast plus an **explicit
empty-array branch**. Shared-stack gotcha. → `NBA_SYSTEM_ARCHITECTURE.md` §2d ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 29*.

**leg-level standard** · T8 · The gate a slip actually depends on: **every variation band × direction ×
rung**, plus *"when the model says 90%, does it hit 90%?"* across confidence bands.
**Why it exists**: *"**rung-aggregates HIDE ERRORS** — the first leg-level breakdown exposed structured
misses that had **CANCELLED OUT in the averages**."* A ladder accurate to 1 pp overall can hold a
+5.4 pp band and a −3.5 pp band that sum to nothing.

**hierarchical empirical fallback** · T8 · Three empirical levels before the parametric is ever
reached: **(tier × role × rung) → (band × role × rung) → (band × rung)**, each shrunk toward the next.
Took coverage to **100%** and halved the ELITE rebounds miss to +3.6. **The parametric is the last
resort, not the second option.**

**the symmetric-floor bug** · T8 · **A real bug in MLB's guard, inherited by porting it.** The
sample-size floor was symmetric, so it forced **true 0.002 rungs up to 0.25** — a 125× error at the far
tail. Fixed by making the ceiling **upper-only**; far tails then came out exact. **May still be live in
MLB.**

**the FRINGE anomaly** · T8 · A 0.87 minutes ratio for fringe players in won blowouts, where
garbage-time accumulators should be **above** 1. Held open under the owner's *"do not move before
fixing it"* directive. **Cause: a leakage bug — a season-wide mean using future games.** Fixing it
shrank the role minutes multipliers to *"honest ~1.0 values."* **Leakage inflates apparent skill.**

**role_tier** · T7 code, LIVE · **The six minutes bands that carry most of the engine's role logic**,
keyed on `mu_role` (projected minutes), NOT on the starter flag:
`IRON_MAN` 36+ · `HIGH_USAGE_STARTER` 32–36 · `STARTER` 27–32 · `ROTATION` 21–27 · `BENCH` 15–21 ·
`FRINGE` 0–15.
**This IS `f_role`** — the confidence factor carrying **55.6% of the deduction budget**, where fringe
players miss by **0.0283** and iron-men by **0.0008**. Those are the bottom and top bands of this list.
**It also implements *"starter vs bench — a primary split"* as a six-band continuous tier rather than a
binary**, which is why the one-season starter-flag gap is not load-bearing.

**the tiering constants** · T7 · `MAX_TIERS = 24` · `MIN_PER_TIER = 15` · `TIER_BLEND_K = 5` ·
`LADDER_STEPS = 6`. **All ported UNCHANGED from MLB's live v6** (where 24 was itself raised from 12
after a backtest). **The recency blend was NOT ported** — see "what does NOT transfer from MLB".

**`BLOWOUT_MARGIN` / `COMPETITIVE_MARGIN`** · T7 code · **20 and 15** — so margin <15 is competitive
(feeds the clean role estimate), ≥20 is a blowout (gets a `MIN_RATIO`), and **15–20 is a deliberate
dead zone**: neither clean nor penalised. ~10% of games land there.

**dud games** · T7 · ***"a fat low tail MLB doesn't have"*** — blowouts, foul trouble and early exits
producing 5-minute, 2-point games. *"A distribution fit to all games is **systematically
over-optimistic on 'more'**."* The NBA analogue of MLB's home-run bimodality.
**Designed as a mixture; implemented as an EXCLUSION** (`competitive & PF < 6`) — blowout truncation is
restored via `MIN_RATIO`, foul trouble is not. See OPEN_ITEMS.

**cross-season carryover** · T7 code · The season-opening fix. Without it *"the opening month has ZERO
projections and November only 62% coverage"*; with it **October 85%, November 90%**. Minutes role and
rate EWMA carried at player level; carried evidence counts as `CARRY_N` games at the boundary.
**Controlled by `BT_CARRY`, default "1".** Per app: PrizePicks in the raw feed; Underdog
`alternate_projections`; Fliff separate proposals; Betr tiers; **Sleeper has none** *(⚠ but T7's
verified inventory found Sleeper milestone lines 20+/25+/30+ — see OPEN_ITEMS)*.
**Width, from three converging sources (T7)**: books ladder a 24.5 player **~19.5 to ~31.5 ≈ ±1 SD**;
Unabated prices off the player's full outcome distribution; **Goblin ≈ 25th–35th percentile,
Standard ≈ median, Demon ≈ 70th–80th, useful range ≈ 15th–85th.** The live `LADDER_DEPTH` measurement
(p95 = 13 rungs for points) **agrees with this to within one rung.**

> ⚠ **Two quantities, one name — disambiguated 2026-09-21 (§T9.39b).** **`p95 = 13 rungs` is the
> MEASUREMENT** that motivated the table; **`LADDER_DEPTH["points"]` is `14`**, and **no entry in the
> dict is 13** *(the twenty values are 2·2·3·3·3·4·5·5·5·**5**·6·6·6·7·**10**·14·14·15·16·16 — **four
> 5s and one 10**; corrected from a mis-transcribed "…5·5·5·6·6·6·7·10·10…" 2026-09-21, §T9.40a)*. **Four
> documents call the measurement "the `LADDER_DEPTH` measurement", which reads as the table's value.**
> ✅ **And the mapping IS recorded** *(§T9.41a, retracting this note's original "NOT RECORDED")*:
> `NBA_GOBLIN_DEMON.md` lines 496–504 give **Prop · Anchor · p95 distance · "Our ±10" · Fixed to** for
> eight props, and **all eight "Fixed to" values equal `LADDER_DEPTH` exactly** — **p95 + 1** for
> `points` (13→14), `rebounds` (5→6), `assists` (4→5), `steals` (1→2), `blocks` (1→2); **p95 exactly**
> for `pra`, `pts_reb`, `pts_ast`. *The provenance of the other **12** keys is not recorded anywhere.*
> ⚠ **The distinction is
> load-bearing, not pedantic** — §T9.33a's beyond-depth counts join on the **configured** value, so
> reading 13 as the depth shifts every one of them.

**lifts / penalties / caps** · T7 · **Lifts and penalties are factor-driven adjustments inside each
tier's pipeline.** **Caps are explicitly a LAST RESORT** — *"the preference is logic that lands on the
right number on its own."* Same instinct as the blowout minutes-mixture.

**variation** · T7 · **The line band within a prop.** Owner: *"PRA 20.5, 21.5, 23.5 — each one is one
variation. And each variation is gonna have more or less as well."* **Prop line × variation ×
direction** is the full matrix. **The distribution family itself changes by variation** — a 3.5-points
player gets Negative Binomial, a 33.5-points player gets Normal.

**what does NOT transfer from MLB** · T7 · **The fixed 5/10/20/season recency blend** —
*"flagged as the single biggest thing that does NOT transfer."* NBA replaced it with
`nba_config.stat_decay_config` (13 per-stat alphas). **Everything else in MLB's v6 logic was ported
deliberately; this one part was rejected on evidence.**

**M1 — defender quality** · T11, T16 · Rejected on a crude metric, then **rebuilt as a two-way ridge**
(`nba_ref.defender_ratings`, 111,768 ratings) and wired on 4 props — **all gains from the INTERACTION
form, not the main effect.**

**non-goals, the three** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §6) · What NBA was explicitly
told **not** to build, before any code: **no per-prop worker architecture** (MLB left *"19 dead stub
files behind as evidence"*) · **no weather / quality-of-contact / RFI-analogue factors** (*"no
basketball analogue"*) · **no auto-scheduling orchestrator before the manual pipeline is verified
end-to-end against real data once**. All three honoured; **the third is a sequencing rule whose
condition is now testable**. → `NBA_SYSTEM_DESIGN.md` §0.75.

**N1 — availability model** · T15, T16 · Status resolution. **79% of Questionables are coin flips at
the cutoff** because the Active List locks 60 minutes before tip.

## O

*Added `2026-09-23`, `§F7.4`. ⚠ **This bucket did not exist either.** `§Z` carried `29` `O` terms
and the body ran `L–N` straight to `P–S`. Worse than J–K: the `P–S` bucket's **first entry was
`operating model, the owner's`** — an `O` term filed under `P–S` because there was no `O` to file
it in. It has been left where a reader's eye now finds it (directly below), and cross-pointed from
here rather than moved: **`RULE 40` — a move is a delete plus an insert.***

**`ot_rule`** · T1, T8, T9 · DB,GD,OPEN,SUM · The overtime convention a line is priced under — and
the **seventh column of `nba_score.baseline_ladder`'s primary key** *(`asof, player_id, game_id,
prop, period, ot_rule, line`)*. 🔴🔴 **SEASON-CRITICAL.** *The worker
`alphadog-v2-nba-baseline-ladder.js:52` keys on all seven and upserts `ON CONFLICT … DO UPDATE`
("dedupe on the PK, keep the last"). The loader `load_baseline_ladder.py` that `P2` actually runs
builds its merge key from **six** — `ot_rule` omitted — and has no `ON CONFLICT` at all, so rungs
that differ only in `ot_rule` collapse into one and the rest are never inserted.* **Measured:
artifact `52,018` → table `50,597` = `1,421` rows lost; and `T14`'s own slate twelve days earlier
lost the identical `1,421` while the artifact grew `6,053`.** ⇒ `F6-1`, `NBA_OPEN_ITEMS.md`.
🔑 ***A glossary term whose definition is a primary-key column is a term whose omission is a data
loss, not a documentation gap.***

**`officials`** · T2, T11 · ARC,DB,OPEN,SUM,WRK · `nba_ref.officials` — the referee roster, built
by **scraping Wikipedia** *(74 staff + 7 non-staff, each with `jersey_num`, `official_id`)*, because
**the stats API has no referee endpoint at all.** ⚠ *The by-analogy trap lives here: the corpus
records `nba_stats.official_roster_snapshot` as a name written from MLB habit — **the real one is
`nba_ref.`***

**`official_differential_log`** · T3, T8, T9 · SUM,WRK · The referee leg of the weekly differential
worker *(with `nba_stats.player_differential_log` and `nba_ref.team_differential_log`)*. 🔴
**`[LIVE-AUDIT]` `2026-09-21`, `T8` pass 12 — CONFIRMED AND DATED: no completed run since
`2026-09-02`. All three logs empty.**

**`odds_api_board_backfill`** · T1, T11 · ARC,OPEN,SUM · The historical board puller →
`nba_market.board_snapshots`. **Built and tested** *(T11 seg 709, three from the end)*: resumable
log, window `14:45 PT` (DST-aware) + close at tip−30, `us_dfs,us` in **one** call *(The Odds API
bills per REGION, not per book)*, 21 markets including 8 alternates; test slate `ORL-BKN
2024-10-25`. 🔑 **It is the only history that exists for PrizePicks and Underdog — and Sleeper has
no history anywhere**, which is why derived-Sleeper is trained on PP/UD snapshots.

**`overtime_pace_live`** · T10 · OPEN,SUM · A live-only pace factor. ⚠⚠ **The standing example of
`RULE 58` before `RULE 58` was numbered.** *A pass recorded 🔴 "`lineups_confirmed` and
`overtime_pace_live` appear in NO document at all" — **retracted on two grounds**: the probe used
the KEYS when the corpus writes the SUBJECT in English, and the factor registry itself annotates
this one **"mostly absorbed by `market_spread_delta` / `market_total_delta`"**.* ⇒ **the live-only
stage is the residue of two folded-in factors, not an unmet obligation.** ✅ *What does survive:
**which** factors are in that stage is recorded nowhere.*

**`over_win` / `under_win`** · T11–T13 · DB,DSN,FCAL,GD,OPEN,SUM · Two of the eight closed outcome
values `grade_board_outcomes.py:9` defines *(with `push`, `dnp`, `no_stat`, `unmatched_player`,
`game_not_found`, and `unmatched_not_in_season` at `:217`)*. ✂ **The over/under-skew hypothesis was
killed on them**: `2026-01-15` reads `under_win 55.20%` · `over_win 39.76%` · `dnp 4.93%` · `push
0.12%`, matching the corpus-wide `56.16%`/`40.26%` already recorded at `SUM:16082`. 🔑 *A skew that
reproduces the population is not a skew.*

**`offset`** · — · BCAL,FCAL · The signed distance of a ladder rung from its anchor line. *The
loader keeps the rung **nearest the anchor** deterministically — `off = abs(float(r.get("offset")
or 0))`, smallest wins — "rather than whichever row happened to arrive last."* ⚠ *That docstring is
true of the tie-break and false of the result, because the key it ties on is short a column: see
`ot_rule` above.*

**`old_str`** · T1, T3, T4 · OPEN,SUM · The exact-match anchor a server-side patch replaces. 🔑🔑
**The corpus's most expensive two-word term.** *`RULE 47` exists because of it — an `old_str`
anchors on heading TEXT, so editing a heading orphans its body; and a commit that was `8`
insertions / `1` deletion destroyed a fact because **the `old_str` was that fact's own line**.
⚠ The same failure struck twice in one session and only one was caught — the other was visible only
as a dangling body.*

**the stat-key families** · T2, T3, T5, T7 · DB,SUM · `o_dpm` and `on_off_dpm` *(DARKO on/off
plus-minus, `T2`–`T3`)*; `off_rating`, `oreb_pct` *(team rates)*; the opponent-profile block
`opp_forced_to_rate` · `opp_miss_rate` · `opp_rim_attempt_rate` · `opp_shot_diet` ·
`opp_turnover_rate` *(`T7`, and `opp_shot_diet` is one of the named **factor keys**)*;
`opponent_position` *(`T5`)*. *Grouped rather than listed one-per-entry: they are columns of a
single opponent/rating surface, and the index in `§Z` already resolves each name individually.*

**operational singletons** · various · `object` *(the corpus's own word for a Postgres relation of
any kind — table, view, function — used wherever a claim is about existence rather than contents)*
· `odds_type` *(a PrizePicks board field, `GD,MUL`)* · `oddspapi_api_key` *(a secret NAME;
**the value is never reproduced — the repo is public**)* · `official_id`, `official_roster_snapshot`
*(see `officials`)* · `old_team_id` / `old_value` *(the change-log pair on the roster differ)* ·
`operation` *(`T12`, the archive worker's verb column)* · `owns_db_binding` *(`T1`, which worker
holds the D1 binding — a control-plane fact from the pre-Postgres era)*.

---

## P–S

**operating model, the owner's** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7) · The stated
working constraints, *"apply from the very first NBA interaction."* **Owns and operates the system
alone from a phone, no terminal — the assistant is the only interface to database, repo and deploy.**
Output: **lead with the answer, tables over prose past two numbers, bold the number that matters, a
one-word reply means execute the next step autonomously.** Decisions: **ROI over profit, normalize by
capital deployed**; a smaller sample is acceptable for materially higher ROI, **present the risk, do
not pre-filter**; *"every check"* means every check; **believe an owner-reported anomaly and
investigate it.** → `NBA_MASTER_SUMMARY.md` §T1.61 · `NBA_SYSTEM_ARCHITECTURE.md` §1a.

**per-subgroup validation** · T1 (blueprint §7f) · The rule that **an aggregate out-of-sample pass is
necessary but not sufficient**: a proposed calibration correction must be checked against **every
meaningfully distinct subgroup it will be applied to** — both sides of a market, every tier — not the
pooled average. MLB's counter-example beat the baseline on held-out error and was still **dominated by
one side and silently misapplied to the other**. → `NBA_FINAL_SCORING_CALIBRATION.md` §7m2.

**pipeline scrutiny discipline** · T1 (blueprint §9) · The whole methodology built from *"a real
multi-bug night."* Core philosophy: **a pipeline's own "PASS"/"COMPLETE" self-report is the starting
point for scrutiny, never the conclusion.** Three techniques, **six named failure modes**, composition
checks. → `NBA_SYSTEM_DESIGN.md` §6b · failure-mode build status in `NBA_OPEN_ITEMS.md`.

**second master run, the optional** · T1 (`NBA_SYSTEM_DRAFT.md` §4b) · The cadence locked 2026-09-03
specified the master run as *"once, **sometimes twice a day**"* — a second pass *"only if needed"* on
**a late injury designation change or significant line movement**. Named as **the reason the
two-stage baseline/enrichment separation exists**: re-score against the cached baseline, *"not
recompute anything expensive."* **NOT BUILT** — P3 runs once and neither trigger has a detector.
→ `NBA_SYSTEM_DESIGN.md` §0.95 · `NBA_FINAL_SCORING_CALIBRATION.md` §2 · `NBA_OPEN_ITEMS.md`.

**parity** · T10, T14 · `NBA_DAILY_PARITY_AND_BACKFILL.md`. Every daily factor backfilled day by day,
producing exactly what the live pipeline would have produced. **§5 forbids carrying a constant between
days** — the rule that caught the pasted calibration table.

**patcher pattern** · T9 · Production builders are string-transformers over the certified backtest
recipes, so the certified file is never forked.

**phase** · T16, LIVE · Season regime: `1_oct_nov`, `2_dec_asb`, `3_post_asb`, `4_push`.

**score** · LIVE · 0–100. **Confidence ENHANCES around a 0.85 neutral, never taxes.**
A product would kill good legs.

**scenario precompute** · T16, LIVE · Enumerate availability branches, store only the realised one.
**Dropped as a daily job** — with one window there is nothing to select with.

---

### P–S *(continued — research-standard structure)*

*Moved here `2026-09-23`, `§F7.4`, from its former position **after `T–W`**, where an alphabetical
reader had already passed it. Demoted `##` → `###` so it reads as a continuation of `P–S` rather
than a second top-level bucket with the same name. **Method: the copy was inserted and verified
byte-identical against the original before the original was deleted** — `RULE 40`, and the owner's
standing instruction that a move is a delete plus an insert, which is how content gets lost.*

**Part G** · `NBA_LESSONS_LEARNED_FROM_MLB.md` · *"Lessons earned by the NBA baseline work itself
(2026-09-09), now part of the standard."* **10 numbered lessons** — the first NBA-earned content in
the research standard, as opposed to MLB-inherited. **Postdates T1; swept with T7–T11.**
**Not yet in the twelve documents** — `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 30*.

**Part H** · `NBA_LESSONS_LEARNED_FROM_MLB.md` · *"Lessons from the enrichment backfill, market and
board-sourcing phase (2026-09-10)."* **12 numbered lessons.** **Postdates T1; swept with T7–T11.**
**Not yet in the twelve documents.**

**the 27 lessons** · T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part A · The research standard applied to
every strategy candidate. **27, not 26** — **VERIFIED by grep 2026-09-20**; the documents said 26
until then and **#27 was missing entirely**. Full list: `NBA_FINAL_SCORING_CALIBRATION.md` §14.
**With Parts G and H the standard is 49 numbered items.**

---

## T–W

**whole-universe comparison** · T1 (blueprint §9) · Scrutiny technique 1: diff the **live config**
against the **real formula/logic** for **every entry in a universe at once** — every prop, every
source, every combo — not just the one currently suspected. The technique that catches **silent
config/formula drift** (failure mode #6). **The live `minutes_mixture` drift is exactly what this
would surface.** → `NBA_SYSTEM_DESIGN.md` §6b.

**write-path filter bug** · T1 (blueprint §7g) · A *"limit to these specific items"* parameter that
**filters only the response summary while the write logic ignores it**, touching every eligible row.
*"Invisible except by noticing unrelated timestamps had also updated."* Standing check on every NBA
worker mode/scope argument. → `NBA_SYSTEM_ARCHITECTURE.md` §2d.

**the two registries** · T1, LIVE · NBA keeps its own control plane: **`nba_config.worker_definitions`**,
**`nba_control.job_runs`**, **`nba_control.worker_run_log`**. MLB's shared
**`config.worker_definitions`** holds **116 rows, 0 of them NBA** — **VERIFIED 2026-09-20**, the same
count T1's Phase 1 banner recorded on 2026-08-31. Closes the blueprint's shared-queue contention
question (nothing to contend for) and evidences the *"additive only, no MLB-system side effects"*
constraint. → `NBA_SYSTEM_ARCHITECTURE.md` §1a0 · `NBA_WORKERS.md` §0.4.

**the unread config tables** · LIVE · `nba_config.classification_config`, `factor_registry` (67),
`factor_relevance` (460), `factor_profile_cells` (35), `stat_decay_config` (13), `system_settings`,
`role_tiers`. ⚠ **VERIFIED 2026-09-20: no code reads any of them** — the strings appear zero times
across all 190 `.py`/`.js` files and the MCP admin bridge. The only config table anything reads is
**`external_credentials`**. The live constants are hardcoded in
`backtest/classification_ladder_v12.py`, and a diff of `stat_decay_config` against it found **7 of 10
stats disagreeing, 3 on the decay rate itself**. **Editing these tables by SQL changes nothing.**
→ `NBA_OPEN_ITEMS.md` *FROM T1 PASS 36* · `NBA_DATABASE.md` §2 banner ·
`NBA_BASELINE_CALIBRATION.md` §0y.

**the case collision** · LIVE · **`BACKUPS/` and `backups/` both exist at the repo root** — VERIFIED
on a live clone 2026-09-20. **Any macOS or Windows clone collapses them.** →
`NBA_SYSTEM_ARCHITECTURE.md` §8.

**the fourth store** · T1, LIVE · The assistant memory files `/areas/alphadog.md` (MLB, 6,140 B) and
`/areas/alphadog-nba.md` (NBA, 4,471 B) — durable state **outside GitHub, Postgres and version
control**, **capped at 49,152 B per file**. → `NBA_SYSTEM_ARCHITECTURE.md` §8d.

**the MLB source library** · T1 · The **23 MLB-side `.md` documents** the transfer package was
distilled from — **eleven read in full**, two in part (**~40% of `ALPHADOG_DOS_AND_DONTS.md` and
`ALPHADOG_SYSTEM_MAP.md` still unread: PARTS 3-5, Sections 3-9**), the rest never read. **17 of 23
were catalogued nowhere until 2026-09-20.** → `NBA_SYSTEM_ARCHITECTURE.md` §8c.

**polling sleeps, the twenty-five** *(was "the thirteen" until 2026-09-20)* · T1, MEASURED · **25 of T1's 31 `bash_tool` calls were `sleep N; echo done`, totalling 2,416 s = 40.3 min** — **all but ~7 seconds of the session's entire local shell time.** The remaining six are two syntax checks, two `cat`s and **two `echo`s used as a scratchpad**. The behaviour blueprint §4o forbids, and the owner interrupted it — *"what is going on? what are these waits for?"* **Cause was structural**: no `github_trigger_workflow`, so no completion signal existed to await. → `NBA_SYSTEM_DESIGN.md` §0.8 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 66*.

**`schema_manifest.json`** · repo root, LIVE · A stale static manifest: `"date": "2026-05-18"`,
**`"target": "AlphaDog v2 new D1 databases only"`**, naming 11 D1 databases — **D1 was decommissioned
system-wide 2026-08-12.** With its eleven `schema_*_db.sql` companions (133 KB) it describes a dead
architecture in SQLite-flavoured, flat-named DDL. **Blueprint §5b standing in the repository.**
⚠ §T1.51 recommended `schema_ref_db.sql` to NBA as a template. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 43*.

**`*_meta.json` sidecar** · T1, LIVE · The provenance file written beside a scraper output:
`fetched_at`, `source_url`, `http_status`, an entity count, `error`. **VERIFIED: 41 of the 223 files
in `nba/data/` have one.** It is what makes *"read the committed file, not the scraper's own claim"*
checkable; **for the other ~180 files there is no committed record of fetch time or success.**
→ `NBA_WORKERS.md` §2 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 45*.

**`worker_invocation_logs`** · LIVE, bridge `run_job` mode · Reads Cloudflare's
**`workersInvocationsAdaptive`** GraphQL analytics — *"the actual outcome of every Worker invocation,
including **`exceededCpu`, `canceled`, `exception`, `scriptNotFound`**"*. **The only tool that
distinguishes a worker that failed from one never invoked from one the platform killed.**
**VERIFIED present in the live bridge; never run against an NBA worker in the record.**
→ `NBA_SYSTEM_ARCHITECTURE.md` §3b.

**`probe-sources`** · LIVE · A second `run_job` mode accepted by **all 21 NBA worker bindings**,
routed to `https://internal/probe-sources`. **Absent from `NBA_WORKERS.md`'s mode-dispatch table
until 2026-09-20.** → `NBA_WORKERS.md` §0.15.

**the two ID conventions** · LIVE · `player_id` is **prefixed `nba_<id>`** in `nba_ref.*` and
`nba_stats.*`, and **bare numeric** in every `nba_score.*` table. **VERIFIED 2026-09-20**:
`nba_score.board_scored` → `nba_ref.players` on `player_id` matches **0 of 110,955**; with
`'nba_'||player_id`, **110,955**. ⚠⚠ **THE POPULATION FIGURE IS DATED; THE FINDING IS NOT**
*(propagated here 2026-09-22, T18 pass 7 — `NBA_DATABASE.md` carried this correction and this file
did not)*: **`board_scored` was 110,955 rows on 2026-09-20, 5,524,359 on 2026-09-21 and 12,818,715 on
2026-09-22** — *a table under active daily rebuild*. ✅ **The 110,955 state remains physically
verifiable: `nba_score.board_scored_snapshot_20260920` holds exactly 110,955 rows.** 🔑 **The JOIN
defect is unaffected — it concerns the `player_id` PREFIX, not how many rows carry it.**
**Types are uniform (all TEXT); only the values differ.** Latent —
the scoring path joins score→score — but **any cross-layer join returns nothing, silently.**
**Blueprint §2's named multi-table ID bug, reproduced.** → `NBA_DATABASE.md` ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 50*.

**the 64 KiB display cap** · T1–T6, VERIFIED · A `display_content.json_block` field in a chat export
is cut at **exactly 65,503–65,504 characters**, marked `…[truncated — N chars total]`. **14 markers
exist across T1–T6; none in T7–T20.** In 8 the full text survives in the sibling `content` field; in
**6 it does not** — `content` is a 212-char stub naming an expired `/mnt/user-data/tool_results/`
path, and **5,564,467 characters are absent**. **All six are `github_get_file` calls on committed
`nba/data/*.json` paths and are recoverable via `git show <commit>:<path>`.** →
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 64* · `NBA_WORKERS.md` §0a.

**`teams.arena_id`** · LIVE, VERIFIED · **A DEAD COLUMN.** `nba_ref.teams.arena_id` is **NULL on all
30 rows and written by no code** (verified 2026-09-20 against the live DB and all 190 code files).
**The team↔arena link is `nba_ref.arenas.team_id`**, populated on all 30. A join through
`teams.arena_id` returns 30 NULLs and looks like a scrape failure. → `NBA_DATABASE.md`
`nba_ref.teams` · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 65*.

**`credential_value_encrypted`** · LIVE, VERIFIED · **A MISNOMER.** The column in
`nba_config.external_credentials` that holds API keys. **Nothing encrypts and nothing decrypts** —
the two readers use `.strip()` on the raw value, and no encrypt/decrypt step exists in the 190 code
files. **Two of the six stored values are bare 36-character UUIDs.** ⚠ **The same values sit in
plaintext in five of the twenty transcripts**, which are not yet committed — see the blocker at the
top of `NBA_OPEN_ITEMS.md`. → `NBA_DATABASE.md` `nba_config.external_credentials` ·
`NBA_OPEN_ITEMS.md` *FROM T1 PASS 67*.

**`nba_control`** · LIVE, VERIFIED · The two-table run-bookkeeping schema created in T1
(`job_runs`, `worker_run_log`). **Both hold 0 rows, and the string `nba_control` appears in no
non-markdown file in the repo** — every user of `worker_run_log`/`job_runs` is an MLB file at the
root. **21 NBA workers are registered and enabled and their output tables are populated, so they run
and nothing records it.** → `NBA_DATABASE.md` §3 · `NBA_OPEN_ITEMS.md` *FROM T1 PASS 68*.

**tarpit** · T1 · Silent connection stalling instead of an explicit block. Three timeouts diagnosed it.

**tier** · T13, LIVE · Rungs out from the anchor. **v1 signs by kind; v2 must sign by POSITION**, since
a demon-Less sits below the anchor.

**Pacific time (the owner's standing instruction)** · **T11**, seg 668 · *"**always when i give you a
time or ask a time, i refer to pacific time, i am in san diego california, so do not forget it**."*
**Every time the owner states or asks for is PT.** ⚠ **Added 2026-09-21 (§T11.1c) because it was in
none of the twelve**, and it is the missing premise behind several recorded timezone defects — the
blame timestamps published in −0700, ~~the P3 cron drifting an hour against a time-sensitive
cutoff~~ **(corrected 2026-09-22, §T20.32 — `nba-p3-afternoon-light.yml` carries `workflow_dispatch:`
ONLY and NO `schedule:` block, so there is no P3 cron to drift; the real exposure is that P3 does not
fire on a schedule at all)**,
and the injury-PDF timestamps in Eastern. → `NBA_MASTER_SUMMARY.md` §T11.1c.

**window** · T11, LIVE · The decision snapshot label. **1:15 PM PT** (corrected from 2:45 — see
OPEN_ITEMS). Set by `ARCHIVE_LABEL`, which **defaults to `routine`**.

---

## X–Z

*Added `2026-09-23`, `§F7.4`, **as a correction to this same pass's own index note**, which had
just written that `X`/`Y`/`Z` "still have no body block" and put the count at `5`. **`§Z` carries
`10`** *(`RULE 56` — record `n`; `RULE 53` — a correction is not complete until the corrected value
is grepped)*. ⚠ *Documenting a gap I could have closed in ten minutes is not documentation, it is
deferral wearing documentation's clothes. **The body range is now `A … Z`, complete.***

**the `x_*` expected-rate family** · T3 *(`x_ft_pct` also T10)* · OPEN,SUM,WRK · `x_minutes` ·
`x_pace` · `x_pts_100` · `x_ast_100` · `x_fg_pct` · `x_fg3_pct` · `x_ft_pct` — **seven columns of
expected per-100/per-game rates**, the projection layer's own priors. 🔑 **`x_minutes` is the
corpus's most-cited kill**: *the DARKO discard — `9 of 24` columns, `10` hits — is one of the **five
kills logged before writing** under `RULES 26`/`28`.* ⇒ *a killed candidate is recorded with its
hit count, not silently dropped; that is what makes a later reader able to tell "we tried it" from
"we never thought of it."*

**`year_founded`** · T2, T6, T10 · DB,OPEN,SUM,WRK · 🔑 **The two-line worked example of a
repair that looks obvious and fails.** *`scrape_nba_stats_arenas.py:60-61` collects `owner` and
`year_founded`; `alphadog-v2-nba-static-arenas.js:71` writes **five** source-derived columns and the
table has no column for either. The obvious fix — add the columns, backfill from `raw_json` — dies
on measurement: **across all `30` rows `raw_json ? 'owner'` matches `0` and `raw_json ?
'year_founded'` matches `0`**; the stored payload holds four keys (`team_id, arena_name,
arena_capacity, city`) and is **double-encoded** besides.* ⇒ ⚠ **the payload predates the scraper
that would have filled it — a backfill source must be dated, not assumed.** *(Verified `2026-09-21`,
`T2` re-read pass 11.)*

**`years_pro`** · T2 · DB,SUM · Seasons of NBA experience on the player record. *Listed here for
completeness; it is a straight source column with no recorded dispute.*

**`zero_officials_parsed_v3`** · T11 · OPEN,SUM · The alert code raised when the referee parse
returns nothing. 🔑 **It fires `×3` alongside `games_recovered: 0` in a `patch_applied` block, and
the three games are `known_empty_games` — the source itself is empty.** *Root cause recorded: the
main loop checked `'rows is not None'` instead of truthiness, so an empty list read as success.*
⚠ *`§T6.19a` resolves the three to specific dates. **All of this is already in five of the twelve** —
noted because it is a standing example of the same fact being answered in several documents with no
pointer between them, which `§F7.9` treats.*

---

*⤴ **`P–S (continued — research-standard structure)` used to sit here**, after `T–W`. Moved
`2026-09-23` (`§F7.4`) to directly below `P–S`, where an alphabetical reader will actually reach it.
This stub is the pointer, not a copy — `RULE 40`: a supersession records where the thing went.*

---

## PENDING
Terms are added as each transcript completes its passes.

**Status `2026-09-23`** *(`§F7.4`)*:

| | state |
|---|---|
| **`T1`–`T18`** | ✅ **swept.** `T16` and `T17` carry **no `§Tn` block in `NBA_MASTER_SUMMARY.md`** — their material is in the TOPICAL files (`§0a-T16` / `§0e-T16` / `§0z-T16`; `§0y-T17`; `§0a-T17*`). *A reader who looks for them in the summary and concludes they were never swept has read the ledger, not the corpus.* |
| **`T19`, `T20`** | ✅ **`RULE 46` DISCHARGED `2026-09-23` (`§F7.1`)** — `920` + `1,177` = **`2,097` segments read in full, twice each, in two different orders, from a post-compaction context**. **One genuine gap in `2,097`** *(`T19` segs `58`–`59`: the journal diagnosis — see `journal.txt` in `J–K`)*. ⚠ *Reader independence was **not** achieved — no subagents are permitted — and is named as such rather than claimed.* |
| **`T21`–`T24`** | 🟢 **OPEN in the sweep ledger.** `T21` `6` passes *(remainder bounded at ~15 segments)* · `T22` `7` · `T23` `4` · `T24` `2`. ⚠ **`T24` is a SECONDARY SOURCE** — a session record, not a verbatim transcript. |
| **direction (b)** | 🔴 `2,369` uncovered substantive **prose** segments remain *(of `20,740` total, only `3,429` are prose at all — `§F6.28`)*, plus ~`8,700` machine segments. |

⚠ **This line is the one a successor checks first, so it is the one most likely to be stale.**
*It previously read `Status 2026-09-20: T1 at pass 30, clean count 0/3 … T10–T20 not started` —
**wrong by ten transcripts** by the time it was found, because the glossary's status was written
once and never re-derived while the ledger it described moved underneath it. Before that it read
`T1 is at pass 10; T2 at pass 1`.* ⇒ **`§F7.6` treats every masthead and status line in the twelve
as a derived value that must be re-dated or deleted, never left to rot.**