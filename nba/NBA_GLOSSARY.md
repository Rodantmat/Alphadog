# NBA GLOSSARY — every term, and exactly where to find it

**Purpose.** When a term comes up and you need the source, this tells you which transcript, which
context, and which document section. Any material term appearing more than once belongs here.

---

> # 📑 **INDEX — `NBA_GLOSSARY.md`**
> **Every term used across the NBA system — what it means, and where it came from.** *Two structures:
> **`§Z`** is the flat lookup (term → location, covers `A`–`Z`); the **body blocks** hold the
> definitions. Where they disagree, the body is newer.*
> 📏 **`52` sections · re-derived `2026-10-26` (T50 intake, RUN, count unchanged — 87 term rows appended to the end-of-file table, no new heading)** · ~~`52` (`2026-10-16`, T49 intake, 19 term rows appended)~~ · ~~`52` (`2026-10-10`, `+1`)~~ · 🆕 **the `SLIP-PROGRAM AND BETR-CLOUD TERMS` block at the end of the file (`T32` onward — `cal_p`, `p·m`, rank/signal/gate, trailing, real replay, all-combos, mirage, CLV, WOWY, DvP, Kelly, probe sport, UC Mode…)** · ~~**`51` sections · re-derived `2026-09-25`**~~ *(was `47` on `2026-09-23`; **`RULE 59` — re-derive, never quote**):* `` grep -cE '^(> *)*#{1,6} ' nba/NBA_GLOSSARY.md ``
>
> 🆕🔴🔴🔴 **SECTION ADDED `2026-09-25` — AND IT IS A ROUTING FACT, WHICH IS WHY IT LIVES HERE.**
> | § | what it is |
> |---|---|
> | 🔴🔴🔴 **`§T25.4`** | **THE FOLDER IS THE FINDABILITY HAZARD THE CAMPAIGN NEVER ADDRESSED — `12` of `32` `.md` files in `nba/` are swept, and NOTHING marks the rest.** ⚠⚠ **The unswept files are a MIX, not history**: **`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`** *(`2026-09-24`)* is **CURRENT AND AUTHORITATIVE** — the per-factor fallback record, cited by `5` of the twelve, and the only place a live scoring-path defect was written down *(`§T26.37`)* — while **`NBA_SYSTEM_ARCHITECTURE.md`** *(`2026-09-23`, **one day apart**)* carries `"NO CRON"` ×`3`, `"2025-26"` ×`4` and **`baseline_ladder` ×`8` for a table that no longer exists**. 🔑 ***Same folder, same naming convention, same `📑 INDEX` styling, no staleness marker on either*** ⇒ item **`T25-1`** |
>
> ⚠⚠ **SO "ONLY THE TWELVE ARE CURRENT" IS ALSO WRONG** — *believing it would have cost this sweep `§T26.37` entirely.* ▶ **`🧭 START HERE` in `NBA_MASTER_SUMMARY.md` names all four categories: maintained · current-but-owned-elsewhere · the trap · history.**
>
> 🔗 **Anchors are heading text, never line numbers.** *To resolve a `§` pointer:* `` grep -rn "§T9.40b" nba/*.md ``
> 📚 *Sweep method, census history, detector versions and retractions: **`NBA_SWEEP_RUN_LOG.md`**.*
>
> | | structure | what it is | when to use it |
> |---|---|---|---|
> | **1** | **`§Z — THE COMPLETE TERM INDEX`** *(added `2026-09-22`, `T19` pass 1)* — headings `A` … `Z`, **`27` letter blocks** | **A flat lookup: term → where it is defined** | ✅ **START HERE.** You have a term and want to find it. |
> | **2** | **The main body** — `A` · `B` · `C` · `D` · `E–F` · `G–I` · **`J–K`** · `L–N` · **`O`** · `P–S` *(with `P–S (continued)` nested under it as `###`)* · `T–W` · `PENDING` | **The definitions themselves** | You have found the term and want the full entry. |
>
> *Body blocks run `A … Z` with no letter missing.*
>
> ## ▶ FIND IT FAST
>
> | if you need… | go to |
> |---|---|
> | ✅ **to look up a CONCEPT** *(baseline boundary, dud games, the fourth store…)* | **`🧠 CONCEPT INDEX`, directly below** — *every concept entry → the body block that holds it* |
> | ✅ **to look up an IDENTIFIER** *(a column, env var, table, field)* | **`§Z — THE COMPLETE TERM INDEX`**, then the matching body block |
>
> ⚠ **`§Z` INDEXES IDENTIFIERS, NOT CONCEPTS.** *It was described as "the fastest route to anything in
> the file" — **it is not**: `96` of the `131` concept entries were absent from it, because it was
> built from code tokens. **The `🧠 CONCEPT INDEX` below is the concept half**, and it names the body
> block for each one, so a concept filed under an unexpected letter is still one hop away.*
>
> ## 🧠 CONCEPT INDEX
>
> *Every concept entry in this file → the body block holding it. **The block letter is where it IS,
> not where it alphabetically belongs** — the two differ for `36` entries and this table is why that
> no longer costs you anything.*
>
> | | concepts |
> |---|---|
> | **A** | **A2 — teammate redistribution** `A` · **A3 — return ramp** `A` · **A5 — lineup change** `A` · **anchor** `A` · **as-of** `A` · **availability delta** `A` |
> | **B** | **B4 — opponent availability / rim protection** `B` · **band cell** `B` · **BASE_HITTER_GAME_LOGS_WORKER** `C` · **baseline** `B` · **BASELINE BOUNDARY** `B` · **baseline vs enrichment — WHY they are separate** `B` · **baseline_history** `B` · **Betr** `B` · **blowout** `B` · **blowout as a minutes MIXTURE** `B` · **BLOWOUT_MARGIN / COMPETITIVE_MARGIN** `L–N` · **board_snapshots** `B` · **board_tiers / board_tiers_ud** `B` · **bridge** `B` · **BT_ vars** `B` |
> | **C** | **calibration vs edge** `B` · **case collision** `T–W` · **certification center** `C` · **certification ladder** `B` · **Claude Coworker** `C` · **Cloudflare-to-Cloudflare** `C` · **combos** `C` · **composition check** `C` · **confidence** `C` · **confidence_verification** `C` · **corrupt-and-fix testing** `C` · **coverage-gap check** `C` · **credential_value_encrypted** `T–W` · **cross-season carryover** `L–N` · **curl_cffi** `C` |
> | **D** | **DARKO** `D` · **data_quality** `D` · **DataDome** `D` · **day-by-day table** `D` · **delta** `D` · **demon** `D` · **dud games** `L–N` |
> | **E** | **edge** `E–F` · **enrichment** `E–F` |
> | **F** | **factor_gate_results** `E–F` · **FALLBACK_AFTER_FETCH_ERROR** `C` · **FE_DATE** `E–F` · **file trigger** `E–F` · **flat vs proportional partial credit** `E–F` · **Fliff** `E–F` · **four-way taxonomy** `E–F` · **fourth store** `T–W` · **FRINGE anomaly** `L–N` |
> | **G** | **goblin** `G–I` · **grader** `G–I` |
> | **H** | **hierarchical empirical fallback** `L–N` · **Hyperdrive** `G–I` |
> | **I** | **invisible anchor / switch point** `G–I` |
> | **J** | **jersey_num** `J–K` · **job_key** `J–K` · **job_queue** `J–K` · **journal.txt** `J–K` |
> | **K** | **64 KiB display cap** `T–W` · **k_stab** `J–K` · **known_empty_games** `J–K` · **known_limitation** `J–K` |
> | **L** | **27 lessons** `P–S` · **leg-by-leg manual tracing** `L–N` · **leg-level standard** `L–N` · **lifts / penalties / caps** `L–N` |
> | **M** | **_meta.json sidecar** `T–W` · **M1 — defender quality** `L–N` · **malformed array literal** `L–N` · **minutes projection** `B` · **mlb calls referees Umpire** `C` · **MLB source library** `T–W` |
> | **N** | **N1 — availability model** `L–N` · **nba_api (swar/nba_api)** `C` · **NBA_BASELINE_METHODOLOGY.md** `B` · **nba_control** `T–W` · **non-goals, the three** `L–N` |
> | **O** | **odds_api_board_backfill** `O` · **official_differential_log** `O` · **officials** `O` · **offset** `O` · **old_str** `O` · **operating model, the owner's** `O` · **operational singletons** `O` · **opponent-driven props** `B` · **ot_rule** `O` · **over_win / under_win** `O` · **overtime_pace_live** `O` |
> | **P** | **Pacific time (the owner's standing instruction)** `T–W` · **parity** `P–S` · **Part G** `P–S` · **Part H** `P–S` · **patcher pattern** `P–S` · **per-subgroup validation** `P–S` · **phase** `P–S` · **pipeline scrutiny discipline** `P–S` · **probe-sources** `T–W` |
> | **R** | **role_tier** `L–N` |
> | **S** | **scenario precompute** `P–S` · **schema_manifest.json** `T–W` · **score** `P–S` · **second master run, the optional** `P–S` · **shift vs replacement mode** `B` · **startswith("alphadog-v2-nba-")** `C` · **stat-key families** `O` · **structure vs regime** `B` · **symmetric-floor bug** `L–N` |
> | **T** | **tarpit** `T–W` · **TEAM_ID = 0** `B` · **teams.arena_id** `T–W` · **three-generation trap** `B` · **tier** `T–W` · **tiering constants** `L–N` · **two ID conventions** `T–W` · **two registries** `T–W` |
> | **U** | **unread config tables** `T–W` |
> | **V** | **variation** `L–N` |
> | **W** | **what does NOT transfer from MLB** `L–N` · **whole-universe comparison** `T–W` · **window** `T–W` · **worker_invocation_logs** `T–W` · **write-path filter bug** `T–W` |
> | **X** | **`x_*` expected-rate family** `X–Z` |
> | **Y** | **year_founded** `X–Z` · **years_pro** `X–Z` |
> | **Z** | **zero_officials_parsed_v3** `X–Z` |
>
> ## ▶ FIND IT FAST *(continued)*
>
> | if you need… | go to |
> |---|---|
> | ✅ **a definition for a term starting with ANY letter** | the matching body block — **`A` `B` `C` `D` `E–F` `G–I` `J–K` `L–N` `O` `P–S` `T–W` `X–Z`**. **Complete `A … Z` since `§F7.4`**; before that pass, `J` `K` `O` `X` `Y` `Z` had index entries and no definition section. |
> | **`P`–`S`** | body **`P–S`** — *its `(continued — research-standard structure)` half is now nested directly beneath it, not after `T–W`* |
> | ⚠ **terms known to be missing** | **`PENDING`** — *and read its status table: it is the line most likely to be stale* |
> | 🗂 **to know whether an `nba/*.md` file you found is one of the twelve** | **`NBA_MASTER_SUMMARY.md` → `🗂 THE FOLDER REGISTER`** *(`§F7.6`)* — **all `32` markdown files in `nba/` classified: `12` mandated · `6` live-and-standing · `8` source-of-record · `5` historical · `1` out of scope.** ⚠ *Quick test: a mandated document opens with a `📑 INDEX` in its first `1%` — `31` of `32`, the one exception being `NBA_SWEEP_RUN_LOG.md`.* |
> | 🧭 **to follow a `§` pointer you cannot find** | **`NBA_MASTER_SUMMARY.md` → `🧭 POINTER RESOLUTION`** *(`§F7.7`)*. ⚠ **Bare numeric pointers (`§4`, `§0f`, `§7f`) often point ACROSS files with no filename**; the `§4`–`§9` family belongs to **`NBA_ARCHITECTURE_BLUEPRINT.md`**, which is not one of the twelve. *That block carries the disambiguation table.* |
> | **the transcript IDs referenced throughout** | the **Transcript IDs** table, immediately below |
> | **how to pull a term's source text from a transcript** | **How to use it**, below — *the `grep -o` recipe* ⚠ *see the caveat next* |
>
> 🔴🔴 **CAVEAT ON THE `grep` RECIPE BELOW, MEASURED `2026-09-23`:** *it points at
> `/mnt/transcripts/<file>.txt`.* **`nba/transcripts/` in the repo holds only `README.md` and
> `journal.txt` — no transcript has ever been committed** *(`T21-1` in `NBA_OPEN_ITEMS.md`)*.
> ⇒ ***The recipe works only in a session that already has the transcript files locally. For anyone
> else, the pointer does not resolve.*** **This is the open blocker `T21-1` carries.**
>
> 📌 **HOW TO READ THIS FILE.** ***`§Z` is the lookup, a body block is the definition, `PENDING` is
> what the sweep has not reached.*** *A term in `§Z` with no body entry means "not yet written", not
> "not a term".* 🔑 *The most consequential entry here is **`ot_rule`** (`O`) — a primary-key column
> a loader's merge key omits, costing `1,421` rows per run (`F6-1`).*

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
| **2026-09-22** | 🔴🔴 **BACKFILL — this file had NO content commit for the sweep of T12 through T18** *(seven transcripts, each closed on three consecutive clean passes — ⚠ *inexact: by their own rows in `NBA_MASTER_SUMMARY.md`'s `📍 TRANSCRIPT INDEX`, `T12`–`T17` closed on the standing closure judgment and only `T18` at `3`/`3` (`§P128`)*; 44 commits here against `NBA_MASTER_SUMMARY`'s 889; the index above stopped at T16)*. **Cause and full evidence: `NBA_MASTER_SUMMARY.md` §T19.1 and open item T19-1; the rule it produced is RULE 41 — *no pass measures the deliverable against its charter*.** **Added: the transcript index through T20, and §Z — THE COMPLETE TERM INDEX, 824 terms.** |

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
| `active_stats_season` | DSN,OPEN,SUM,**RCP**,**GLO** | T7 T9 **T26** 🆕 *(the ONE season source of truth; CLOSED `T20-4` — `§T26.30`)* |
| `availability_prior` 🆕 | **DB,FCAL,WRK,GLO** | **T26** *(`699` cells; `N1`'s fallback, Brier `0.0441` OOS — `§T26.5`)* |
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
| `board_rung_keys` 🆕 | **DSN,DB,WRK,RCP,OPEN,GLO** | **T26** 🔴 ***P3 produces it; `build_final_hp` (P2 `6b`), the history loader and the prune all `SystemExit` without it — `§T26.45`, item `T26-3`*** |
| `refresh_board_rung_keys` 🆕 | **DSN,WRK,RCP,GLO** | **T26** *(the one producer — and the RECOVERY call; `6`-hour window — `§T26.45`)* |
| `board_tiers_v2` 🆕 | **WRK,MUL,OPEN,GLO** | **T26** 🔴 *(P3's step ran an index job and built NO tiers until `2026-09-23` = `T20-7`; `BT2_APPS` PrizePicks-only ⇒ `T26-1` — `§T26.35`①)* |
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
| `check_factor_freshness` 🆕 | **WRK,RCP,OPEN,GLO** | **T26** 🔑 *(`14` checks; the `FALLBACK`→loud-but-green severity; **NO CRON** ⇒ item `T26-2` — `§T26.43`)* |
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
| `ladder_calibration` | ARC,BCAL,DB,OPEN,SUM | T1 T4 T7 T11 T15 ⚠ **`ladder_calibration_asof` re-derived `2026-09-26`: `25,962` rows / `47` as-of dates — was `9,904`/`24`; it `2.6×`'d on the restored `final_hp` (`§T26.49`)** |
| `line_source` 🆕 | **BCAL,MUL,OPEN,GLO** | **T25** 🔴 ***the column that says REAL vs RECONSTRUCTED — `34.72%` of `prop_universe` is our own lines, and `final_hp` prices them — `§T25.3`*** |
| `load_injury_report` 🆕 | **WRK,GLO** | **T26** *(the loader the mining doc specified and nobody built; closed `T20-17`'s shard risk — `§T26.30`)* |
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
| `now_out_flag_only` 🆕 | **FCAL,GLO** | **T26** 🔴🔴 ***the reason code that records a player was ruled out WITHOUT repricing his legs — the delta used to price them at `0.001`, live on P3's path, `7×` worse log-loss — `§T26.37`*** |
| `nba_season` 🆕 | **DSN,OPEN,RCP,GLO** | **T26** *(`nba/nba_season.py` — supplies `active_stats_season`; rolls over on the FIRST REGULAR-SEASON GAME, not October 1)* |
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
| `prune_baseline_to_board` 🆕 | **DB,WRK,RCP,GLO** | **T26** 🔑 *(enforces the retention rule; **a prop with NO board of any kind keeps its FULL ladder** — which is the owner's "ALL PROPS STAY" in code — `§T26.7`, `§T26.27`②)* |
| `p_plays` 🆕 | **DB,FCAL,WRK,GLO** | **T26** *(the derived `P(plays)` fallback; read by `build_availability_delta` and the freshness check — `§T26.5`)* |
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
| `verify_static_loads` 🆕 | **WRK,GLO** | **T26** *(P1's own check that its static loads LANDED — exists because P1 died on `ModuleNotFoundError: scipy` every Monday BEFORE its COMMIT step, `§T26.28`)* |
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

**`active_stats_season`** 🆕 · T26 · LIVE · `nba/nba_season.py` — **the ONE source of truth for "which
season are we in", read by 10+ scripts** *(`build_availability_delta` · `build_confidence_v3` ·
`build_final_hp` · `score_board_legs` · `scrape_nba_daily_delta` …)*. ✅ **This is what CLOSED `T20-4`**:
`` grep -c "2025-26" `` on all three pipeline workflows returns **`0`·`0`·`0`**. 🔑🔑 **THE SUBTLE PART —
IT ROLLS OVER ON THE FIRST REGULAR-SEASON GAME, NOT ON OCTOBER 1**: *the calendar-date version would have
made **"three P1 runs scrape an empty season"**. **The obvious fix carried a new three-week defect and it
was caught before shipping**.* ▶ `§T26.30`. → 🆕 *`2026-10-14` (additional sweep `3`, pass 250): the boundary was moved the same evening to the DAY AFTER the first regular-season game (`<=`; commit `00e3327fd`), so on opening day itself the season still reads the prior one — `NBA_OPEN_ITEMS.md` → `🧭 CHAT-TRACK CONTINUATION OF NBA_MASTER_SUMMARY.md`, `§T28.4`.*

**`availability_prior`** 🆕 · T26 · LIVE · `nba_score.availability_prior` — the derived **`P(plays)`**
model's stored cells *(**`699`** with non-null `p_plays`)*. **`N1`'s fallback when the injury report is
missing**, fitted out-of-sample: **Brier `0.0441` vs `0.0498` status-only, `11.3%` better**. ✅ **Wired in
— `p_plays` is read by `build_availability_delta.py` (the live P3 producer) and `check_factor_freshness.py`.**
🔑 **`§T26.39` explicitly does NOT retract it**: *`A5` predicted **who starts**, already encoded downstream
in recent-5 minutes; `N1` predicts **whether the player plays at all**, which minutes history does not
carry.* ▶ `§T26.5`, `§T26.39`'s scope note.

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

**`board_rung_keys`** 🆕 · T26 · LIVE · `nba_market.board_rung_keys` — ***THE BOARD, as `(game_date,
player_id, prop, period, line)`***: every real board rung resolved through the one normaliser, **UNION
the DERIVED boards** *(the simulated legs in `nba_market.prop_universe`)*. ▶ **`4,522,732` keys · `379`
dates · period `FULL` only** *(`2026-09-26`)*.
🔴🔴 **IT IS A CROSS-PIPELINE SINGLE POINT OF FAILURE.** *ONE producer — `nba_market.refresh_board_rung_keys(lo, hi)`,
called only inside **P3** — and **THREE consumers that hard-`SystemExit` without it**:
`build_final_hp.py` *(**P2 step `6b`**)*, `load_baseline_history.py`, `prune_baseline_to_board.py`.*
⇒ ***A P3 failure on day `N−1` stops three P2 steps on day `N`.*** ⚠ **P3's call only refreshes dates
archived in the last `6` hours, so re-running P3 for an old date does NOT rebuild its keys.**
▶ **`§T26.45`**, item **`T26-3`** · `NBA_RECIPE.md` `🔧 MAINTENANCE` task `3`.

**`board_tiers_v2`** 🆕 · T26 · LIVE · `nba_market.board_tiers_v2` — the goblin / standard / demon
classification *(four-way taxonomy, signed by position vs anchor)*; **the pricing and slip engines read
it**. ▶ **`2,199,354` rows · `378` dates.** 🔴 **P3's "board tiers" step ran a ONE-OFF index-maintenance
script instead of the builder until `2026-09-23`, so tiers were NEVER built for the decision-moment
board** *(= `T20-7`, closed at `§T26.35`①)*. 🔴 **`BT2_APPS` defaults to PrizePicks ONLY** ⇒ item
**`T26-1`**; read with **`T16-2`** *(`18` of `30` props have no tier rows at all)*.

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
Hit 32.9/21.3/14.8% at T+1/+2/+3, needing 1.48/2.30/3.31× ~~against a ~1.75–1.9× ceiling~~ -> (T50 deep pass, 2026-10-26: that ceiling was an early-sample figure and is superseded. On the system's tier map of 910,513 legs demon prices average D1 1.44×, D2 1.71×, D3 2.43× (maximum 5.76×) and the engine cap is 18.5× on a 2-pick; whether a deeper demon clears its break-even is decided per cell and per season (rebounds D3: price 2.20×, break-even 0.250, hit 0.307 at n=4, positive in 2025-26, marginal in 2024-25). The 1.48/2.30/3.31× break-evens belong to the offset tiers T+1/T+2/T+3 only, a different taxonomy from the system tiers D1-D3. Source: T50 transcript of the slip-engine research subagent, date per the gap list not re-verified; the old verdict below is kept as written) →
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

**`line_source`** 🆕 · T25 · LIVE · `nba_market.prop_universe.line_source` — ***the column that says
whether a prop line was POSTED BY AN APP or RECONSTRUCTED BY US.*** ▶ **`real` `1,088,192` legs / `12`
props · `simulated` `578,832` legs / `8` props / `353` dates ⇒ `34.72%` SIMULATED** *(`2026-09-26`)*.
🔴🔴 **AND `build_final_hp` SCOPES THE SCORING STORE TO `real ∪ derived`**, so *"`final_hp` is exactly the
board"* is true **and the board is about one-third lines we set ourselves**.
🔑 **STATE THE DISTINCTION PRECISELY — IT IS NOT A DEFECT**: *the **outcome** on a simulated leg is real
(graded against the actual box score); what is ours is **WHERE THE LINE SITS**.* ⇒ ***A hit-rate or
realized-value figure over simulated props measures the model AND our own line placement; the same figure
over the `12` real props does not — and any figure quoted across "the prop universe" mixes the two.***
⚠ *The `8` simulated props are essentially `T16-2`'s no-tier list.* ▶ **first REAL lines for them arrive at
preseason `2026-10-03`, and that validation does not recur** — `§T25.3`.

**`now_out_flag_only`** 🆕 · T26 · LIVE · `nba_score.availability_delta.reason` — **the reason code that
records a player was ruled out WITHOUT repricing his legs** *(`new_hp = old_hp`)*.
🔴🔴🔴 **WHY IT EXISTS**: *the delta used to rewrite **every leg of a newly-`Out` player to `0.001`/`0.999`**,
applied silently by `score_board_legs.py` as step `3`, **live on P3's decision path**.* 🔑 **The argument
against it needs no measurement**: *when the player IS out his legs **VOID**, so the override earns
NOTHING; the only way they reach grading is if the listing **REVERSED** — exactly when it is maximally
wrong.* ⇒ ***ZERO UPSIDE, UNBOUNDED DOWNSIDE.*** 📊 *Measured: `reallocated` `0.6119`→`0.6076` **better**;
`now_out` `0.8326`→**`5.7938`, `7×` worse**.* ⚠ **Keeping the row as a FLAG is deliberate — the fact that he
was ruled out is real information; only the PRICE was wrong.**
⚠⚠ **TRAP**: *`2026-04-10` holds `2,122` rows with this label whose `max_move` is **`0.7086`** — **pre-fix
residue wearing the post-fix label** (`built_at` `00:07Z` vs the fixed run's `20:15Z`). ✅ Contained: the
consumer rejects on the reason prefix AND on `move > 0.15`, either alone sufficing.* ▶ `§T26.37`.

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
verified inventory found Sleeper milestone lines 20+/25+/30+ — see OPEN_ITEMS)* → 🆕 *Sleeper's ladder is `lines/available_alt`, captured `2026-09-27` (`T31`) — `NBA_MASTER_SUMMARY.md` `§T31.1`*.
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
`2026-09-02`. All three logs empty.** ⚠ **RESUMED `2026-09-26` (`NBA_WORKERS.md §T26.79` put it back
on P1's dispatch) — NOT YET REFLECTED ABOVE.** ▶ **LIVE-VERIFIED `2026-09-28`**: `nba_stats.player_differential_log`
now `324` rows, `detected_at` up to `2026-09-26T16:43:54Z` — real detection, not empty. `nba_ref.team_differential_log`
and this table (`official_differential_log`) are still `0` rows each, but **not a bug**: their roster-snapshot
tables (`nba_ref.team_roster_snapshot`, `nba_ref.official_roster_snapshot`) were themselves empty going into
the `09-26` run, so the worker's own `is_first_run` logic correctly reported zero events by design (per its
code comment: *"Real differential detection starts from the SECOND run of this worker onward"*) — team/official
diffing appears to be new-as-of-`09-26` functionality, not a broken one, and both snapshot tables are now
populated (`30`/`80` rows) for a real diff on the next weekly run.

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

**operating model, the owner's** · T1 (`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §7) · The stated
working constraints, *"apply from the very first NBA interaction."* **Owns and operates the system
alone from a phone, no terminal — the assistant is the only interface to database, repo and deploy.**
Output: **lead with the answer, tables over prose past two numbers, bold the number that matters, a
one-word reply means execute the next step autonomously.** Decisions: **ROI over profit, normalize by
capital deployed**; a smaller sample is acceptable for materially higher ROI, **present the risk, do
not pre-filter**; *"every check"* means every check; **believe an owner-reported anomaly and
investigate it.** → `NBA_MASTER_SUMMARY.md` §T1.61 · `NBA_SYSTEM_ARCHITECTURE.md` §1a.

---

## P–S

**`prune_baseline_to_board.py`** 🆕 · T26 · LIVE · **The script that enforces the retention rule** — *owner,
`2026-09-24`:* ***"Whatever shows on the board, the full ladder for all players, all prop lines, everything,
we save. If a player shows one single leg, we save one single leg."***
🔑🔑 **ITS SCOPE RULE IS THE SUBTLE PART, AND IT IS THE OWNER'S "ALL PROPS STAY, NO EXCEPTION" IN CODE**:
*a `(date, prop, period)` is pruned **ONLY IF** some board — real or derived — carried that prop that day;
**a prop with no board of any kind (historically the PERIOD props) KEEPS ITS FULL LADDER**, because it is
the raw material the derivation will run on.* ⇒ ***This is why `49.28%` of `baseline_history` rows are
period rungs, and why a board-scoped rule does not delete the props that reappear in-season.***
⚠ *Measured `2026-04-10`: `49,816` rungs for the `12` standard props, `4,863` on the board — `9.8%`.*
▶ `§T26.7` *(the retention rule)* · `§T26.27` ② *(the owner's ruling, and the ingredient-vs-product split
that makes it coherent)*.

**`check_factor_freshness.py`** 🆕 · T26 · LIVE · **The instrument that makes a silently-active fallback
visible** — *its own words:* ***"Both were true on paper and NEITHER WAS CHECKED AT RUNTIME. The failure
mode is not a crash — it is SILENCE: `nba_ref.referee_assignments` sat EMPTY while P2 ran its scraper
nightly, so D1's documented fallback would have carried every game day with nothing saying so."***
🔑 **`14` checks across three severities, and the middle one is the new idea**: **`BINDING`** → exit
non-zero, red · ⚠ **`FALLBACK`** → **reported LOUDLY, job stays GREEN** · **`WEEKLY`** → judged on an
`8`-day age. *Season-aware, for `§T26.14`'s reason.*
🔴🔴 **AND IT HAS NO CRON** — *wired only into `nba-maintenance.yml`, whose entire trigger is
`workflow_dispatch`.* ⇒ ***The detector of silence runs only when somebody remembers, and the class it
detects is by definition the one you do not think to look for.*** ⇒ item **`T26-2`**, `§T26.43`.

**`refresh_board_rung_keys(lo, hi)`** 🆕 · T26 · LIVE · `nba_market` function — **the ONE producer of
`board_rung_keys`** *(see the `B` block)*. *P3 calls it scoped to boards archived in the last `6` hours.*
🔴 **So it is also the RECOVERY call**: *re-running P3 for an old date does not rebuild that date's keys;
an explicit `(lo, hi)` range almost certainly does, **but this sweep is read-only and has not run it***
⇒ **establish it before opening night — item `T26-3`.**

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

**`verify_static_loads.py`** 🆕 · T26 · LIVE · **P1's own check that its static loads actually LANDED.**
🔑 **It exists because of the exact failure `§T26.28` diagnosed**: *`build_defender_ratings.py` imports
`scipy`, P1 never installed it, the step died with `ModuleNotFoundError` **every Monday**, and because it
died mid-pipeline **the three steps after it — static context, COMMIT, certify — were skipped, so the whole
week's scraping was thrown away uncommitted… while the cron ran fine every week**.* ✅ *Fixed two ways:
`pip install … scipy`, **and** P1's commit/load/certify now run `if: always()` — the second is the one that
fixes the CLASS.* 🔴 *Named in `0` of the twelve before `2026-09-26` — the `F5-1` class, but built
`2026-09-23`–`25` and load-bearing today.* ▶ `§T26.28`, `§T26.45`.

**`load_injury_report.py`** 🆕 · T26 · LIVE · **The loader the mining doc specified and nobody built** —
writes the official injury report into **`nba_daily.injury_report_snapshots`** *(one row per
`(game_date, snapshot_ts, team, player)`, snapshot semantics preserved per the PARITY RULE)*.
🔑 **Before it, the binding availability input lived only as repo JSON and `nba_daily` held ZERO tables —
nothing could query the factor that gates availability.** ✅ **The freshness check rates that table
`BINDING`**, and `§T26.30` records the payoff: *`build_availability_delta.py` now reads it from Postgres
instead of fetching shards over HTTP, which is what closed **`T20-17`** — **"a lost shard produced a
smaller-but-normal-looking delta that then decided which legs P3 scores."*** ▶ `§T26.30`, `§T26.43`.
🆕 (additional sweep 5, pass 376, `§P376` — its switches by their own names; `S6`'s write-path inventory names `INJURY_LOAD_MODE`, `2026-10-08 17:45Z`: *shards not loaded unless INJURY_LOAD_MODE backfill (load_injury_report.py:68)*; ✅ read in code): `INJURY_LOAD_MODE` is `current` (the default — `nba_injury_report_current.json`, what P2B and P3 just scraped; both set it explicitly, as the maintenance workflow does) or `archive` — the inventory's "backfill" — which loads every monthly shard of the season named by `INJURY_LOAD_SLUG` (e.g. `2025_26`) and aborts when none is found; `INJURY_DATA_DIR` (default `nba/data`) is where it looks; `nba-injury-load.yml` passes the mode from its dispatch input.

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

**`credential_value_encrypted`** · LIVE, VERIFIED · **A MISNOMER** — ✅ **AND THE OWNER HAS RULED ON IT, ~~`2026-09-24`~~ `2026-09-23` `19:39Z` (`T26` seg `29`; date corrected `2026-10-10`, pass 112, → `NBA_MASTER_SUMMARY.md` `§T26.R1`):** ***"the encrypted data, it doesn't really matter. Just — I have access to it. Nobody else accesses this database. So that's not really an issue."*** ⇒ 📌 **ACCEPTED RISK, not an open defect.** *The name still misleads a reader, so the entry stands; the remediation does not.* ⚠ **This ruling covers the COLUMN NAME only — it does not touch `F2-1` (a key published in the PUBLIC repo) or `T22-1b`, which remain owner-only actions.** · The column in
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

---

## 🔴🔴🔴 **§T25.4 — THE FOLDER IS THE FINDABILITY HAZARD THE SWEEP NEVER ADDRESSED: `12` OF `32` FILES ARE SWEPT, AND THE UNSWEPT ONES LOOK IDENTICAL** *(T25 seg558 + `SELECT`/`ls` 2026-09-25; `0` of the twelve before this entry)*

**T25 raised it and dismissed it as not-a-defect. It is the largest one left.**

> ***"one thing worth knowing that **isn't a defect**: about twenty other nba .md files sit in the same
> folder as the twelve — the blueprint, the compass, checkpoints, enrichment research, the project
> log. **they're outside the sweep's scope by design**, so they don't get corrected. **anyone opening
> the folder cold can easily pick up a stale one thinking it's current.**"***

⚠⚠ **THE LAST SENTENCE IS THE DEFECT, AND IT IS NOT DISPOSED OF BY THE FIRST TWO.** *"Outside scope by
design" explains why they are not corrected. **It does not stop a reader opening one.*** 🔑 **The whole
findability campaign (`§F7`) optimised the INSIDE of twelve documents and left the DOOR unlabelled.**

### 🔴 **THE MEASUREMENT**

```bash
ls nba/*.md | wc -l          # 32
```
▶ **`32` files · `12` swept · `20` not.**

### 🔴🔴🔴 **CORRECTED `2026-09-25` (`§T26.37`) — THE HAZARD IS NOT "UNSWEPT MEANS STALE". IT IS WORSE.**

⚠⚠ ***My first version of this section said `17` of the unswept files "are simply history". THAT IS
FALSE, and the counter-example is the most important document outside the twelve.***

| unswept file | last commit | what it actually is |
|---|---|---|
| ✅ `NBA_SWEEP_RUN_LOG.md` | `2026-09-25` | *the sweep's own record — patched WITH the twelve* |
| ✅ `NBA_COMPASS.md` | `2026-09-19` | *read, never written — a standing constraint* |
| ✅ `nba/PP_PAYOUT_FINDINGS.md` | `2026-09-25` | *the build chat's — CURRENT, out of scope by constraint* |
| 🔑🔑🔑 **`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`** | **`2026-09-24`** | 🔴 **CURRENT AND AUTHORITATIVE — the per-factor fallback record** *(`A1`/`N1`/`N2`/`A6` · `A2`/`B4` · `A3` · `A4` · `A5` · `A7`–`A9` · `B1`/`B2`/`C3` · `B5` · `C1`/`C2`/`C4` · `D1` …)*, **referenced by `5` of the twelve**, and the ONLY place a live scoring-path defect was written down *(`§T26.37`)* |
| 🔴 **`NBA_SYSTEM_ARCHITECTURE.md`** | **`2026-09-23`** | 🔴 **STALE AND FALSIFIED** — *`"NO CRON"` ×`3`, `"2025-26"` ×`4`, `baseline_ladder` ×`8` for a dropped table* |
| ⚠ `NBA_GOBLIN_DEMON.md` | `2026-09-23` | *PrizePicks payout material — the build chat's domain* |
| — | `2026-08-30` → `2026-09-21` | *the remaining ~`14`: blueprints, checkpoints, drafts, plans — genuinely history* |

⇒ 🔑🔑🔑 ***`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` and `NBA_SYSTEM_ARCHITECTURE.md` were last touched
ONE DAY APART. One is the authoritative record of every enrichment fallback. The other tells you the
pipelines have no cron and to query a table that no longer exists. **Nothing in the folder
distinguishes them** — same location, same naming convention, same `📑 INDEX` styling, neither
carrying a staleness marker.***

⚠⚠ **SO THE ADVICE "ONLY THE TWELVE ARE CURRENT" IS ALSO WRONG, AND WOULD HAVE COST THIS SWEEP
`§T26.37`** — *a live defect on P3's daily decision path, its structural argument, its measurement and
its fix, recorded **only** outside the twelve.* 🔑 **The correct instruction is the one in `🧭 START
HERE`: the twelve are maintained; `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` and
`nba/PP_PAYOUT_FINDINGS.md` are current but owned elsewhere; `NBA_SYSTEM_ARCHITECTURE.md` is the trap;
the rest is history.**

| oldest unswept files | last commit |
|---|---|
| `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` | **`2026-08-30`** |
| `NBA_AVAILABLE_TOOLS.md` · `NBA_ARCHITECTURE_BLUEPRINT.md` *(`96 KB`)* | **`2026-08-31`** |
| `NBA_SYSTEM_DRAFT.md` · `NBA_HISTORICAL_BACKFILL_PLAN.md` · `NBA_ENRICHMENT_FACTORS_RESEARCH.md` | `2026-09-02` |

### 🔴🔴🔴 **AND THE SHARPEST CASE IS A NEAR-TWIN OF A SWEPT DOCUMENT**

**`NBA_SYSTEM_ARCHITECTURE.md`** — **`179 KB`**, unswept — **sits alphabetically adjacent to the swept
`NBA_SYSTEM_DESIGN.md`**, and it is *camouflaged*:

| it has | so a cold reader concludes |
|---|---|
| its own **`📑 INDEX — NBA_SYSTEM_ARCHITECTURE.md`** block | *"indexed like the swept files"* |
| the line ***"Built from the transcripts, not from memory"*** | *"same provenance as the twelve"* |
| **no staleness marker of any kind** | *"current"* |

🔴🔴 **AND IT CARRIES CLAIMS THIS SWEEP HAS ESTABLISHED ARE FALSE — measured, not asserted:**

| string | count | falsified by |
|---|---|---|
| `"NO CRON"` / `"no cron"` | **`3`** | **`§T26.1`** — *`P2` `45 15 * * *` and `P3` `15 21 * * *` are both LIVE* |
| `"2025-26"` | **`4`** | **`T23-2`** — *the season resolves from the date; `grep -c` on both workflows returns `0`* |
| **`baseline_ladder`** | **`8`** | 🔴 **THE TABLE DOES NOT EXIST** — *`SELECT to_regclass('nba_score.baseline_ladder')` ⇒ **`NULL`***, dropped by `F6-1`'s consolidation |

⇒ ***A reader who opens the wrong one of two adjacently-named files is told the pipelines have no
schedule, that the season is hardcoded, and to query a dropped table.*** ⚠ **Every one of those was a
season-critical open item that cost this sweep multiple passes to close.**

### ✅ **WHAT WAS DONE, AND WHAT WAS NOT**

✅ **A `WHICH FILES ARE CURRENT` row now sits in `NBA_MASTER_SUMMARY.md`'s `🧭 START HERE` block**,
naming the twelve explicitly and naming `NBA_SYSTEM_ARCHITECTURE.md` as the trap. 🔑 **That protects
the reader who starts at the entry point.**

🔴 **IT DOES NOT PROTECT THE READER WHO STARTS AT THE FOLDER** — *and `§T25.4`'s whole point is that
such a reader exists.* ⚠ **The fix that would work is a staleness banner in each unswept file, or
moving them to an `archive/` subfolder** — ***and BOTH are writes to files outside the twelve, which
the standing constraints forbid this sweep from making.*** ⇒ 🔑 **RECORDED AS AN OWNER/BUILD-CHAT
ACTION, not a sweep task.** 📌 *Section `A` of `NBA_OPEN_ITEMS.md` is where it is tracked.*

---

## 🆕 SLIP-PROGRAM AND BETR-CLOUD TERMS — **`T32` onward** *(added `2026-10-10`; source `T32`, the recovered transcript. Each term → meaning → where it lives. The build chat's `nba/NBA_SLIP_BUILDING_STRATEGY.md` is cited as `strategy §n` — outside the twelve, current, owned by the build chat.)*

| term | meaning | where |
|---|---|---|
| **slip-building program** | the phase that turns scored legs into placeable slips; opened by the owner `2026-09-29 00:57Z` | `NBA_RECIPE.md` `STEP 14` · `NBA_MASTER_SUMMARY.md` `§T32.10` · strategy `§0`–`§5` |
| **rank** *(slip sense)* | a way to trail legs and surface candidates that clear break-even — owner's six: prop-line hit rate, baseline HP, final HP, final score, player hit rate, plain prop-line | strategy `§3`, `§8` · `§T32.11` |
| **signal** *(slip sense)* | a second layer that enhances or purges a rank; must be game-day replicable | strategy `§11` · `§T32.11` |
| **gate** | a validation layer for a strategy — *"a reality check not a leg/slip killer"* (owner) | strategy `§4` (phase 4) |
| **`cal_p`** | the **as-of recalibrated** hit probability — `model_p` corrected by `nba_score.recalibration_map`, fit only on data before the day priced | `NBA_BASELINE_CALIBRATION.md` `§T32.5` |
| **`p·m`** | recalibrated `p` × the leg's real multiplier `m`; **`< 1` ⇒ no Power slip can be +EV** — Power-only; Flex needs the full distribution | `NBA_MULTIPLIERS.md` `§T32.3` · strategy `§6a`, `§6e` |
| **overconfidence map** | realized hit by prop × side × kind × role_tier × model_p bucket; the model ranks but overstates above `~0.55` | `NBA_BASELINE_CALIBRATION.md` `§T32.5` |
| **`recalibration_map`** | `nba_score` table holding that map (`8,818` rows, first built `2026-10-06`) | `NBA_DATABASE.md` `§T32.6` |
| **`rank_foundation`** | the designed rank substrate — **never built** | `NBA_DATABASE.md` `§T32.6` · `T32-2` |
| **trailing** | a player's own hit/miss rate on the exact prop+side over the last `N` games (3/5/10/20/30); shorter windows sharper in `T32` — ⚠ *(pass 9, `2026-10-10`)* **superseded as a selector**: strategy `§16b` (*"Trailing windows on this pool — nearly powerless (corrects §8a/§14h for these props)"*, `T33`) and `§18` (hit-rate ranks pick at a coin flip on PP NBA — retired as NBA selectors); within a prop the trailing month even predicts the next day negatively (`§20e`, `T34`) | strategy `§8a`, `§8i` · `§16b`, `§18`, `§20e` |
| **real replay** | the owner's backtest rule: real snapshots, legs, multipliers and outcomes day by day — never extrapolated | `NBA_RECIPE.md` `STEP 14` |
| **all-combos measure** | ROI over **every** qualifying slip combination — immune to selection and ordering; the honest number when a greedy top-N swings | strategy `§13a` |
| **tie-break sensitivity** *(Rule B0c)* | re-run a ranked backtest under ≥2 deterministic orderings and report the range; an MLB scar | strategy `§6`, `§13a` |
| **mirage** | a headline ROI produced by a handful of winning days (e.g. 6-pick `+427%` from `3` days) | strategy `§13d` |
| **loss-frustration control** | owner preference: a strategy that wins a little most days over one that wins big weekly at similar ROI | strategy `§0` · `§T32.10` |
| **50-leg cap** | the owner's placement ceiling — `~50` legs/day/app | strategy `§0`, `§7k` |
| **game-day replicability** | a rank/signal may be used live only if it can be computed at the P3 window; **CLV fails it** (backtest-only) | strategy `§9` · `§T32.10` |
| **CLV** | closing-line value — line movement from capture to close; strong but sparse, kept as a validation metric | strategy `§8o`, `§9` |
| **WOWY** | with-or-without-you — teammate output with a star present vs absent | strategy `§7d`, `§11h` |
| **DvP** | defense vs position — opponent points allowed to a position; built from games × positions, **flat** in `T32` | strategy `§11j` |
| **Kelly fraction** | optimal stake `f = (pⁿ·m − 1)/(m − 1)`; **peaks at 3 picks** for `p = 0.61` | `NBA_MULTIPLIERS.md` `§T32.3` |
| **meta-model** | L2-logistic combiner of replicable features (`build_slip_meta_model.py`, report only) | strategy `§12` · `NBA_WORKERS.md` `§T32.1` |
| **probe sport** | the owner's rule: other sports' boards (WNBA, MLB) are probes, tests and learning only — NBA is wired after the mapping works | `NBA_OPEN_ITEMS.md` `T20-3` · `§T32.1` |
| **UC Mode** | SeleniumBase "undetected" Chrome — clears Cloudflare Turnstile (with Xvfb on a runner) | `NBA_SYSTEM_ARCHITECTURE.md` `§T32.2` |
| **`BETR_SESSION_STATE`** | GitHub secret seeding the cloud harvester's logged-in Betr session (slim export, under the `48 KB` cap) | `NBA_WORKERS.md` `§T32.1` · `NBA_SYSTEM_ARCHITECTURE.md` `§T32.2` |
| **local forward proxy** | an unauthenticated `proxy.py` on the runner relaying to the authenticated residential proxy — the UC-Mode + auth-proxy workaround | `NBA_SYSTEM_ARCHITECTURE.md` `§T32.2` |
| **Path C** | the owner-PC Betr harvester (`betr_harvest.py`), kept as fallback | `NBA_WORKERS.md` `§T32.1` |
| **phase 4.5** | the owner's review checkpoint before any auto-engine; why the `T32` builders are report-mode | `NBA_RECIPE.md` `STEP 14` |
| **`line_source`** *(`real` / `simulated`)* | `prop_universe` column: a line actually posted on some board vs a line the system constructed (`8` simulated props) — filter it or the edge is fake | `NBA_DATABASE.md` `§T33.6` · `T33-1` |
| **window board** | the PrizePicks board snapshot taken at the decision window (before the first tip) — the only legitimate backtest pool | `T33-2` · strategy `§17` |
| **harness** | `build_slip_config_sweep.py`, the exhaustive real-slip backtest (v1→v4) | `NBA_WORKERS.md` `§T33.4` |
| **matrix engine** | `build_slip_matrix.py`: every strategy × every signal on every real leg, gated by both seasons | `NBA_WORKERS.md` `§T33.4` |
| **Gate 1 / Gate 2 / Gate 3** | S2 day-bootstrap P5 > 0 · positive in both seasons + P5 > 0 · the live gate (rolling hit `0.58`/`0.565`) | strategy `§14e`, `§14f`, `§15f` · `T33-5` |
| **cap-1** | one slip per day — how slips are actually placed; the quoted measure from `§17` on | strategy `§17c` |
| **peripheral props** | `turnovers`, `steals`, `blocks`, `stocks` — the defensive family where the edge concentrated; **Regular-only on PrizePicks** | `NBA_GOBLIN_DEMON.md` `§T33.2` |
| **sort raw / price calibrated** | the two-role rule: order legs by raw `model_p`, price and gate them by the calibrated value | `NBA_BASELINE_CALIBRATION.md` `§T33.5` |
| **anchor tier** *(R / UA-Gob T1–3 / OA-Dem T1–3)* | the owner's grouping of a ladder around the Regular line (or the switch point): goblins Under the Anchor, demons Over it, tier = rungs away | `NBA_GOBLIN_DEMON.md` `§T33.2` |
| **tier map** | `nba_score.tier_map_legs` — every real PP leg with its anchor tier, rank and outcome, per rank key | `NBA_DATABASE.md` `§T33.6` |
| **gold band** | the run of top-n (or top-%) cuts in a cell where the hit rate beats the tier's own break-even, as large and constant as possible | `NBA_GOBLIN_DEMON.md` `§T33.2` · strategy `§19k` |
| **`_alternate`** | PrizePicks' market suffix for goblin/demon ladders — must be folded to the base prop on joins | `T33-3` |
| **constancy** | share of real slate days on which a cell's top-5 beat its per-leg break-even; separates a gold band (`≥ ~60–67%`) from a jackpot profile (`41–51%`) | `NBA_GOBLIN_DEMON.md` `§T34.2` · strategy `§19k` |
| **jackpot profile** | a cell or slip whose average edge comes from a few big days (inconstant; high share of profit from the 5 best days) | strategy `§19k`, `§25b` |
| **conditional gold** | a demon cell that is gold only WITH its signal stack (e.g. rebounds D1 cold + consistent) | `NBA_GOBLIN_DEMON.md` `§T34.2` |
| **extender** | a goblin used as the one extra leg of a slip already winning on Regular legs — never standalone, never two | `NBA_GOBLIN_DEMON.md` `§T34.2` |
| **rescued anchor / switch line** | a ladder with no pickable Regular line, anchored by the system on sportsbook consensus (`tier = 0`), tiered from `line − anchor_line` | `NBA_GOBLIN_DEMON.md` `§T34.2` |
| **rank-over-rank** | a leg that is also top-3/top-5 under a second rank (final HP / baseline HP / final score) — one of the two layers that beat chance in the signal matrix | strategy `§22a` |
| **certified (v1–v4)** | three consecutive runs of the frozen invariant list (`certify_slip_system.py`), all PASS, no code change between them | `NBA_SYSTEM_DESIGN.md` `§T34.7` · `certification_log` |
| **family A / B / C** | A = steals-anchored Regular; B = demon-only; C = Regular without steals (`SE_EXCLUDE_CELLS`) | `NBA_SYSTEM_DESIGN.md` `§T34.7` |
| **`final7`** | the last 7 days of a regular season — built and stored, excluded from qualification and from live play (H6) | strategy `§25e` |
| **whole-board null** | the null where each slip leg hits at its tier's whole-board rate (R `0.500` … D3 `0.192`); `0` survivors in `100` draws | `NBA_BASELINE_CALIBRATION.md` `§T34.5` |
| **V1–V6 / Q1–Q6** | the MLB falsification bar translated: walk-forward, bootstrap lower bound, null, monotonicity, decomposition, teammate ban → the qualification gates | `NBA_SYSTEM_DESIGN.md` `§T34.7` |
| **P4 / P5** | P4 = daily live paper engine (`live_slip_engine.py`: pick / grade / replay / calibrate); P5 = weekly requalification | `NBA_WORKERS.md` `§T34.4` |
| **H1–H7, `critical`, paper gate** | the live hurdle machine: CUSUM leg hit, MC drawdown/streak, pool, opening weeks, final week, pooled-steals portfolio CUSUM; `critical` = 7-day grace at cap 1; paper → active after `≥ 50` days, cap × 50 slips, live CI lower bound `> 0` | `NBA_SYSTEM_DESIGN.md` `§T34.7` |
| **compression rule** | `payout = product` up to `9.1×`, then `9.1 × (product/9.1)^0.857` — replaces the slip program's flat `0.95` haircut. **Scope (T50 deep pass, 2026-10-26, transcript of the 10-22 payout-map subagent):** under grader v3 (10-18) it applies ONLY to a 2-pick Power with a goblin or demon (compress of 3 × the factor product) and to the payout of a single surviving leg after voids (compress of 1.5 × its factor); all-standard slips pay the published table exactly, Power with alternates at 3-6 picks uses `grid_down(b_n × fp^a_n)`, Flex with alternates uses `flex_alt_tiers` | `NBA_MULTIPLIERS.md` `0.10-T22`, `§T34.3` |
| **delta mode** | `TM_DELTA` / `SE_DELTA`: build only days past the high-water mark, with whole-history inputs recomputed; proven identical to a full rebuild | `NBA_SYSTEM_DESIGN.md` `§T35.7` · `NBA_WORKERS.md` `§T35.4` |
| **day-blocked test** | a detector whose unit is the slate day (trailing-14-day mean daily hit vs calibrated mean, z on `sd_daily_hit`) — because a day's legs share 2–3 players | `NBA_SYSTEM_DESIGN.md` `§T35.7` |
| **shadow slip** (`placed_shadow` / `graded_shadow`) | a stopped strategy's never-staked slip, read only by its detectors so it can recover | `NBA_DATABASE.md` `§T35.6` |
| **`dup`** | a slip identical to one another strategy already placed that day — recorded, never staked | `NBA_DATABASE.md` `§T35.6` |
| **`_ANCHOR_steals`** | the calibration row for the pooled steals cells across family A — what H7 reads | `NBA_DATABASE.md` `§T35.6` |
| **week 2** | season days 7–13; negative for every strategy in both backtest seasons; the low-event week | `NBA_BASELINE_CALIBRATION.md` `§T35.5` · `T35-2` |
| **Kind A / Kind B week** | A = the projection stops ordering outcomes (corr ≈ 0, concept drift); B = it orders them and the legs lose (variance) | `NBA_BASELINE_CALIBRATION.md` `§T35.5` |
| **concept drift (pure)** | P(Y\|X) changes while P(X) does not — invisible to every input-side monitor | `NBA_BASELINE_CALIBRATION.md` `§T35.5` |
| **cushion** | line minus the player's trailing-10 average; on steals Unders `0.25–0.5` hits `78%` vs `55%` below | `NBA_BASELINE_CALIBRATION.md` `§T35.5` |
| **short / long drought** | short = 2–7 days, everything loses; long = 10–66 days, a cell or side cold for weeks while others (demons) hold | `NBA_GOBLIN_DEMON.md` `§T35.2` · strategy `§29k` |
| **clean pass (owner's definition, `T36`)** | *"when online research and Gemini insight are completely exhausted and do not return anything useful back"* — a candidate that tests bad does not make a pass clean | `NBA_MASTER_SUMMARY.md` `§T36.1` |
| **low-foul key (`SE_LOWFOUL`, `pf20`)** | ranking preference for legs on players under 1.8 personal fouls/game (trailing 20, before the game); size ≥ 4 | `NBA_BASELINE_CALIBRATION.md` `§T36.5` · `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| **rotation / `_ROTATION`** | the drought state: a steals or turnovers cell EWMA below 0.50 → family A builds steals-excluded, the stocks Power stakes | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| **plan B (`LS_ALLSTAR_PLAN`)** | the pre-All-Star-break week's default: only the three short steals-free plays stake | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| **scheduler worker** | `alphadog-v2-nba-scheduler` — Cloudflare, every minute; dispatches P2A / P2B / P3 / P1 at times computed from each day's first tip | `NBA_SYSTEM_ARCHITECTURE.md` `§T36.8` |
| **claim / run-once** | `nba/pipeline_claim.py` + `nba_control.pipeline_runs`: one run per pipeline per slate; later runs do nothing | `NBA_SYSTEM_ARCHITECTURE.md` `§T36.8` |
| **P2A / P2B** | P2 split (`2026-10-02`): P2A = last night's results and grades; P2B = today's slate inputs, refits, baseline, `final_hp` | `NBA_SYSTEM_ARCHITECTURE.md` `§T36.8` |
| **Underdog modifier `mᵢ`** | ½ ÷ Underdog's probability for the side; Standard payout = base(n) × ∏ mᵢ × C | `NBA_MULTIPLIERS.md` `§T36.3` |
| **fantasy price vs `decimal_price`** | Underdog's two price products on one option; the app shows the fantasy decimal where present | `NBA_MULTIPLIERS.md` `§T36.3` |
| 🆕 **week-2 gated play / `week2_trough`** *(pass 46)* | week 2 played, not skipped, when the week-1 league steals+turnovers spike is `≥ +3%` (read on day 7): steals-excluded pool, slips with 2+ low-event Unders, cap 1; otherwise a normal week at cap 1 | `NBA_SYSTEM_DESIGN.md` `§T36.7` · `NBA_MASTER_SUMMARY.md` `§T36.2` `§29o` |
| 🆕 **kill switch (week 2)** | the gated play stops for the rest of the week after `3` graded days with its staked legs under `50%` | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| 🆕 **low-event Unders** | points-family or turnovers Unders — the legs that hold in the week-2 trough (slips with 2+ of them `+37%` vs `−75%` with none) | `NBA_MASTER_SUMMARY.md` `§T36.1` |
| 🆕 **drought menu** | what still earns inside a long drought: demon 3-Flex, stocks-only 4-Power, points-only 3-Power, no-steals family A | `NBA_MASTER_SUMMARY.md` `§T36.6` #1 |
| 🆕 **pre-break week / All-Star week state** | the `7` slate days before the All-Star break — a fixed calendar trough, planned for by `LS_ALLSTAR_PLAN` (plan B default). 🆕 (additional sweep 5, pass 371, `§P371` — how the engine finds the break, as `S1`'s audit states it, `2026-10-07 18:25Z`: ~~"allstar_break (:415-422) finds the Feb 4-10-day gap"~~ *allstar_break (:415-422) finds the Feb 4-10-day gap* (strike-correction, same pass: source text in italics, not quotes); ✅ read in `nba/live_slip_engine.py`'s `allstar_break`): the break is the season's one gap of `4`–`10` days between game dates that starts in February (`Feb 13–19 2025`, `Feb 12–19 2026` in its docstring), searched inside the day's own `season_block()`; the function returns the last game date before it, or none — the February test keeps NBA Cup knockout holes out. | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| 🆕 **late-March raise** | season days `147–167`: the two best strategies' caps `6 → 9`, only when active at full cap | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| 🆕 **holiday caution** | New Year's Eve and MLK Day treated as small slates — every strategy at cap 1 | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| 🆕 **`MAX_DAILY_STAKE` / `placed_capped`** | the daily ceiling across all strategies (`LIVE_MAX_DAILY_STAKE`, `36` units); slips beyond it are recorded `placed_capped`, never staked, graded `graded_capped` | `NBA_WORKERS.md` `§T36.4` · `NBA_DATABASE.md` `§T36.6` |
| 🆕 **`FAIL_STATE_GATED`** | P5's verdict for a drought-only or pre-break-only strategy that fails the full-season test it is built to fail — recorded, not turned red | `NBA_SYSTEM_DESIGN.md` `§T36.7` |
| 🆕 **`season_block()`** | the engine's season window: the schedule merged with the played-games log, split at gaps `> 60` days | `NBA_MASTER_SUMMARY.md` `§T36.6` #8 |
| 🆕 **watchdog (+5 / +10)** | the scheduler's re-dispatch `5` and `10` minutes after a slot, only if the slate is unclaimed and GitHub shows no run | `NBA_SYSTEM_ARCHITECTURE.md` `§T36.8` |
| 🆕 **morning-line capture** | `nba/capture_game_lines_morning.py` in P2B: the 08:00 PT game line the baseline reads, captured live (it had only ever been backfilled) | `NBA_SYSTEM_ARCHITECTURE.md` `§T36.8` · `NBA_OPEN_ITEMS.md` `T36-6` |
| 🆕 **late pick (`placed_late`)** | a record-only second pick from the close board (`LS_MODE=late_pick`); retired in a later transcript | `NBA_WORKERS.md` `§T36.4` |
| 🆕 **`reset` mode** | `LS_MODE=reset`: the opening-day clean ledger, every strategy `paper` at its cap, the stored rotation state back to normal | `NBA_SYSTEM_DESIGN.md` `§T36.7` · `NBA_MASTER_SUMMARY.md` `§T36.6` #7 |
| **R / F1–F3 / B1–B3 (Underdog)** | Underdog tiers = the side's modifier band: R balanced (`1.00`), F favoured (< 1.00), B boosted (> 1.00) | `NBA_GOBLIN_DEMON.md` `§T37.2` |
| **snap zone** | Underdog mains within ~2 points of 50% no-vig are snapped to `1.00×` both sides | `NBA_MULTIPLIERS.md` `§T37.3` |
| **margin regime** | Underdog's margin over the books' no-vig: 2024-25 `+0.1…+2.6` pts, 2025-26 `+2.1…+7.7` pts | `NBA_MULTIPLIERS.md` `§T37.3` |
| **strict vs balanced (`delta`) repricing** | strict = min(then, today's rule) + haircut (withdrawn); balanced = keep UD's per-leg pricing, apply only the measured drift to 2024-25 priced lines (adopted) | `NBA_MULTIPLIERS.md` `§T37.3` |
| **reverse walk-forward (V1R)** | select on the later season, score on the earlier — required when the seasons are different products | `NBA_SYSTEM_DESIGN.md` `§T37.7` |
| **P5 / P4 (Underdog paper)** | P5 = weighted:points 4-Std + 6-Flex (cap 1) + mains 2-Std (cap 2), primary; P4 = its shadow — *not* the PrizePicks P4/P5 workflows | `NBA_SYSTEM_DESIGN.md` `§T37.7` |
| **live leg source (`LS_LEG_SOURCE`)** | `live` = `pp_leg_price` → name map → `final_hp` (default); `universe` = the backtest `prop_universe` path, parity tests only | `NBA_DATABASE.md` `§T37.6` |
| **fresh absence** | a rotation player who played the team's previous game and is out today; 2+ on a team lowers hit rates → a half-stake candidate | `NBA_BASELINE_CALIBRATION.md` `§T37.5` |
| **out-of-range board guard** (`LS_MIN_BOARD` 179 / `UDL_MIN_BOARD` 178) | nothing is placed when today's board has fewer scored legs than the smallest validated board | `NBA_SYSTEM_DESIGN.md` `§T38.7` |
| **break-even edge monitor** (`LS_MODE=edge`) | group-sequential test, looks every 30 slates, confirm `z ≥ 3.28` / alarm `z ≤ −3.09`, against the break-even of the slips actually placed | `NBA_SYSTEM_DESIGN.md` `§T38.7` · `edge_monitor` |
| **δ\* (portfolio break-even)** | the uniform leg-hit shift below certified at which the portfolio's expected ROI is zero (`−9.24 pp` backtest) | `NBA_MULTIPLIERS.md` `§T38.3` |
| **star-line Under / `stake_weight`** | a balanced Under at points ≥ 24.5, PRA ≥ 34.5, pts+ast/pts+reb ≥ 29.5; slips holding one stake 0.5 | `NBA_BASELINE_CALIBRATION.md` `§T38.5` |
| **slate sandbox** (`sim_slate.py`) | rehearse a future slate with real code, scratch writes and rollback | `NBA_WORKERS.md` `§T38.4` |
| **thinning (break-even by)** | keep each real hit with probability p(s)/p and regrade — lowers every leg's rate while keeping the slips' real co-movement | `NBA_MULTIPLIERS.md` `§T39.3` |
| **tie (PrizePicks)** | a stat exactly on a whole-number line: neither win nor loss; the lineup drops one payout tier; a 2-pick Power with one tie pays 1.5× | `NBA_MULTIPLIERS.md` `§T39.3` |
| **whole-number line / G1** | a line at an integer (ties possible); priced from adjacent half rungs, recalibrated (b ≈ 0.31) + tie model → `final_hp_derived` | `NBA_BASELINE_CALIBRATION.md` `§T39.5` |
| **`final_hp_derived` / `final_hp_all`** | prices kept out of `final_hp` (whole-number, beyond certified depth); the view joins both | `NBA_DATABASE.md` `§T39.6` |
| **`calibrated_p()`** | SQL function serving the recalibration map v2 (history: the other season's fit; live: POOLED) | `NBA_DATABASE.md` `§T39.6` |
| **gap program G1–G4** | G1 whole-number lines, G2 deep rungs beyond the ladder, G3 rookies, G4 Underdog live keys | `NBA_SYSTEM_DESIGN.md` `§T39.7` |
| **current-roster rule** | the daily ladder projects recent participants still on the team ∪ current-roster players with history | `NBA_SYSTEM_DESIGN.md` `§T39.7` |
| **rolled-back integration test** | `integration_test_rollback.py`: production entry points end to end in one transaction, then rolled back | `NBA_WORKERS.md` `§T39.4` |
| **`p_eq` (EV-equivalent probability)** | `(pc − SE)(1 − p_tie) + 0.5·p_tie` — a whole-number leg's win probability after the safety discount, with a tie valued at half a win | `NBA_BASELINE_CALIBRATION.md` `§T40.5` |
| **currency map (`wn_currency_map`)** | isotonic map from a cell's raw score to realized hit, used to place an honest whole-number price on the cell's raw-score scale | `NBA_DATABASE.md` `§T40.6` |
| **selection leg pool (`tier_map_legs_sel`)** | certified tier map + whole-number legs as live prices them — what the certified slips, P5 and the monitors are now built on | `NBA_DATABASE.md` `§T40.6` |
| **routing (G2)** | rungs beyond the certified depth written to `final_hp_derived` instead of `final_hp` / `board_scored`, so selection never sees them | `NBA_SYSTEM_DESIGN.md` `§T40.7` |
| **certified depth** | per-prop maximum |offset| in the certified history (`selection_certified_depth` config) | `NBA_DATABASE.md` `§T39.6` |
| **full-system certification ledger** | the build chat's `nba/NBA_FULL_SYSTEM_CERTIFICATION_2026-10.md` — passes A–H, rounds 2–3; every finding with evidence, fix, verification, status (🔴 🟠 🟢 ⚪) | `NBA_SYSTEM_DESIGN.md` `§T41.7` |
| **dead claim / stale-claim recovery** | a `pipeline_runs` row still `claimed` whose GitHub run completed; scheduler v2.2.0 closes it and re-dispatches once with `force=true` | `NBA_SYSTEM_ARCHITECTURE.md` `§T41.8` |
| **void reversion (PrizePicks)** | a slip pays the table of the legs left: Flex 2 left → 3× Power-style; 1 left → 1.5× × factor on a hit; refund only when none left | `NBA_MULTIPLIERS.md` `§T41.3` |
| **adverse selection (offered Unders)** | the operator offers an Under at a high model probability mostly when it disagrees with the model — calibration must be judged on offered legs | `NBA_BASELINE_CALIBRATION.md` `§T41.5` |
| **probe (`nba-probe.yml` + trigger file)** | a runner-side end-to-end test of one script without a pipeline run | `NBA_WORKERS.md` `§T41.4` |
| **`RED_STICKY`** | hurdle flag set on every red evaluation; evaluated before any calendar window; released only by a PASS `REQUAL` (or the owner's manual SQL) | `NBA_SYSTEM_DESIGN.md` `§T42.7` |
| **soft step / `soft_failed`** | a `continue-on-error` pipeline step; failed ones are collected into the job output `soft_failed` and written to the `pipeline_runs` row's note | `NBA_SYSTEM_ARCHITECTURE.md` `§T42.8` |
| **proxy resolver (`proxy_url`)** | the workflow step that reads the proxy URL from `nba_config.external_credentials` first and falls back to the GitHub secret | `NBA_SYSTEM_ARCHITECTURE.md` `§T42.8` |
| **`lobby_only` (Betr)** | a GraphQL answer to the events query that carries no projections — evidence, never the board | `NBA_WORKERS.md` `§T42.4` |
| **dress rehearsal (sim-slate)** | `nba-sim-slate.yml`: the full P2B → P3 → pick chain on a future slate in a sandbox, production verified untouched | `NBA_SYSTEM_ARCHITECTURE.md` `§T42.8` |
| **`broad_day`** | the certified builder's diversification tie-break, on when ≥ 5 cell families (`_U` folded) hold ≥ 2 distinct players that day; the live pick now computes it the same way | `NBA_SYSTEM_DESIGN.md` `§T42.7` |
| **market term / market-free twin** | the confidence deduction for sportsbook backing (`f_books`, `f_agree`) that live cannot reproduce; the certified history rescored without it (`_mf` tables) | `NBA_BASELINE_CALIBRATION.md` `§T42.5` |
| **`live_backtest_suffix`** | the `classification_config` switch (`"_mf"`) that points every live measuring stick — hurdles, anchor, P5 simulate, edge reference, P5 verdicts — at the market-free twin tables | `NBA_SYSTEM_DESIGN.md` `§T43.7` |
| **one slate predicate (`regular_season_games`)** | the view `nba_calendar.regular_season_games` (`game_id LIKE '002%'`) — what a slate is, everywhere | `NBA_DATABASE.md` `§T43.6` |
| **`whole_number_nb`** | a whole-number price built from neighbour rungs (`wn_neighbor`) — priced, not selectable until backtested | `NBA_DATABASE.md` `§T43.6` |
| **post-tip refusal (`post_tip()`)** | both live engines refuse to pick a slate after its first tip; a late P3 never scores or picks. 🆕 (additional sweep 5, pass 373, `§P373` — the fix `S3`'s P3 audit asked for, `2026-10-08 06:25Z`, as built; ✅ read in `nba/live_slip_engine.py`, which `nba/ud_live_slip_engine.py` imports it from): "post-tip" means the day is today on the Pacific clock and the slate's first ~~regular-season~~ tip (`nba_calendar.slate_games` — strike-correction, same pass: the docstring says "regular-season", but the query reads `slate_games`, which also holds play-in and playoff games) has passed; a replay of a past day is never post-tip; the switch `LS_ALLOW_POST_TIP=1` overrides it, for tests only. | `NBA_SYSTEM_DESIGN.md` `§T43.7` |
| **flat board / priced board; price gate** | flat: one payout table for every leg (PrizePicks, Betr); priced: each side its own multiplier (Sleeper, Fliff) — playable only if p × m ≥ 1 + margin | `NBA_MULTIPLIERS.md` `§T43.3` |
| **paper board** | an app without a backtest entering under the live engine's state machine, never staked before the paper gate and the sequential monitor | `NBA_SYSTEM_DESIGN.md` `§T43.7` |
| **`AC_DEDUP`** | switch (default off) deduping standard/alternate outcomes in the as-of calibration — a round-3 chained recertification, not a one-consumer fix | `NBA_BASELINE_CALIBRATION.md` `§T43.5` |
| **price-shopping ledger (`price_shop_ledger`)** | daily record, per leg the engines selected, of every app's listing, line gap, per-leg price and the gate `(p − 0.0916) × m_eff ≥ 1` — measurement only | `NBA_SYSTEM_DESIGN.md` `§T44.7` |
| **`m_eff`** | an app's per-leg price; for Underdog the displayed modifier × a table root (`ud_ref_per_leg`) | `NBA_MULTIPLIERS.md` `§T44.3` |
| **`model_params_history`** | append-only JSON snapshots of the parameter / verdict tables a slate or a week used | `NBA_DATABASE.md` `§T44.6` |
| **retention map** | where every ingredient, factor, board and slip is kept (git raw files + dated Postgres + ladder record) | `NBA_SYSTEM_ARCHITECTURE.md` `§T44.8` |
| **history archive (GitHub Release)** | monthly off-database CSV.GZ copy of the big ingredient tables (`db-archive-<date>`) | `NBA_SYSTEM_ARCHITECTURE.md` `§T44.8` |
| **twin postseason tables (`*_postseason`)** | play-in / playoff data kept apart from the certified regular-season tables | `NBA_SYSTEM_DESIGN.md` `§T44.7` |
| **`5_postseason`** | the calibration phase fitted on postseason legs, shrunk toward `4_push` while thin | `NBA_SYSTEM_DESIGN.md` `§T44.7` |
| **`slate_games`** | the view of every slate night (002 regular + 004 playoffs + 005 play-in) — *"is there a slate tonight?"*; `regular_season_games` keeps answering *"where is the regular season?"* | `NBA_SYSTEM_ARCHITECTURE.md` `§T45.8` |
| **postseason weighting (`pm_w`)** | `(days·pm_post + K·pm_reg)/(days + K)`, K = 50 — a cell's playoff hit rate shrunk toward its certified regular-season rate | `NBA_SYSTEM_DESIGN.md` `§T45.7` |
| **`pick_postseason`** | the live engine's postseason path: postseason floor (485), eligible cells, per-strategy verdict, cap 1, own statuses outside the regular ledger | `NBA_SYSTEM_DESIGN.md` `§T45.7` |
| **shadow (postseason)** | built and graded, never staked — every strategy whose postseason verdict is not PASS | `NBA_SYSTEM_DESIGN.md` `§T45.7` |
| **`cert_fp` (certification fingerprint)** | `nba_control.cert_fp(table, where)` — reproducible row fingerprint used to prove certified tables unchanged | `NBA_DATABASE.md` `§T46.6` |
| **Playoff Unders** | the playoff-only candidate: the model's top standard-line Unders (≥ 58%, 8 main props, one per player) — PrizePicks 5/6-Flex, Underdog 2-pick | `NBA_SYSTEM_DESIGN.md` `§T46.7` |
| **leg-level walk-forward** | cells picked on one sample (one playoff), legs scored on the other — used when slip counts are too small | `NBA_SYSTEM_DESIGN.md` `§T46.7` |
| **`m*` (break-even multiplier)** | `1 / (p_cell × root)` — the smallest multiplier at which a certified leg is worth playing on an app | `NBA_MULTIPLIERS.md` `§T47.3` |
| **`stake_mode`** | `playoff_unders` switch: `gate` stakes the PASS strategies on playoff slates; `shadow` makes every Playoff Unders slip record-only | `NBA_SYSTEM_DESIGN.md` `§T47.7` |
| **pricing law (hit × m ≈ 0.500)** | on main lines every app prices fairly; the cut is in the payout table; alternates carry an extra cut | `NBA_MULTIPLIERS.md` `§T47.3` |
| **"not soft"** | owner rule (`2026-10-09`): a board that does not work properly is a failure to fix, not a soft step | `NBA_SYSTEM_DESIGN.md` `§T48.7` |
| **`net_retry` (retry policy)** | the one retry policy for external calls — transient retried with jittered backoff inside a budget, permanent final, loads never blind-retried | `NBA_SYSTEM_ARCHITECTURE.md` `§T48.8` |
| **three capture moments** | MORNING (P2B), WINDOW (P3, the decision board), CLOSE (first tip − 25) — the only NBA board captures | `NBA_SYSTEM_DESIGN.md` `§T48.7` |
| **market switch (four rows)** | `market_feed.refresh_final_hp`, `live_backtest_suffix.suffix`, `.ud_table`, `ud_edge_monitor` — flipped together once live books-per-rung match the history | `NBA_SYSTEM_DESIGN.md` `§T48.7` |
| **placeholder season files (`ensure_season_files.py`)** | empty current-season input files written before the first game so the builders label the opener as the new season | `NBA_BASELINE_CALIBRATION.md` `§T42.5` |
| **`flex_alt_tiers` / Flex-with-alternates grader** | the lower envelope of PrizePicks' own quoted (factor product, payout) points per Flex size and number of misses; the one grader for live, backtest, validator and certifier; partial tiers are flat in the factor product | `NBA_MULTIPLIERS.md` `§T49.3` |
| **`payout_grader_v1`** | the column that keeps a backtest slip's OLD (pre-envelope) payout after the 488,474 slips were re-priced | `NBA_DATABASE.md` `§T49.6` |
| **primp `chrome_153`** | the quote-transport emulation whose TLS fingerprint (JA4) equals the real Chrome 154's; first in the payout-map ladder before curl_cffi and a real browser | `NBA_MULTIPLIERS.md` `§T49.3` |
| **`sleeper_payout` / `sleeper_slip_payout()`** | Sleeper's slip rule as a tunable and a DB function: Power = product, Flex = round-robin mean over (n minus 1)-pick sub-combinations; slip haircut 0.0; Max bonus recorded, not priced | `NBA_MULTIPLIERS.md` `§T49.3` |
| **honest hit probability (`board_true_hp`)** | the market-anchored probability a board leg hits, calibrated for ANY leg; not the number for a certified slip's legs (use the cell rate, `edge_monitor_ref`) | `NBA_BASELINE_CALIBRATION.md` `§T49.5` |
| **`hp_market_anchor` / `soft_mahp`** | the anchor's config key, and the P3 soft step that keeps `board_true_hp` current | `NBA_BASELINE_CALIBRATION.md` `§T49.5` |
| **both-seasons rule** | the adoption rule written before each run: better in BOTH 2024-25 and 2025-26 (plus a pooled day-blocked lower bound above zero for a new slot) or not adopted | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **`release_record` / `RELEASE_CAP`** | a red strategy's own season record (backtest table at 40 days or more, else the live shadow ledger) used by P5 to release it to paper; cap-0 reds return at cap 1 | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **clean release (`red_release`)** | a red strategy returns to YELLOW (half cap) after 10 consecutive clean slate evaluations; never for cap-0 or failed-certification reds | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **`anchor_h7`** | the shared steals-anchor canary's switch (red / yellow / off); set red | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **`stake_unit`** | the one setting for the owner's unit (unit_usd 1.0, min_stake_usd 1.0, below_min 'skip', play_from_day1 true), changed on the Slips screen | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **PLAY / SKIP label** | the verdict on every slip: PLAY with the amount (unit x stake weight, "(paper)" in the paper gate) or SKIP with the reason, plus the day's total | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **`placed_below_min`** | status of a slip whose half stake is below the minimum entry: built and graded, never staked | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **place-by (`place_by_pt`)** | on every slip, the first official tip among its own legs' games — the time by which it must be entered | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **hands-off replay (`audit_season_replay.py`)** | the production daily loop run over a whole season in one rolled-back transaction: 2025-26 +2,044.62 on 2,373 slips, ROI +86.2%; 2024-25 +759.53, ROI +36.9% | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **NBA main UI (`alphadog-v2-nba-main-ui`)** | the separate NBA copy of the MLB interface (board, dossier, builder, Slips, profile, Board Health, Calibration), with the sharp read and bettor depth | `NBA_SYSTEM_ARCHITECTURE.md` `§T49.8` |
| **sharp read** | the dossier / profile blocks experienced bettors read: no-vig fair line and move, book-by-book lines, full ladder, projection, game script, travel, defenders, teammate correlations | `NBA_SYSTEM_ARCHITECTURE.md` `§T49.8` |
| **`db_compact.py` / `db-archive-2026-10-14`** | lossless VACUUM FULL compaction with row-count and content-fingerprint checks (43,812 to 41,209 MB), and the release holding 26 archived Underdog experiment tables (database 41 to 36 GB) | `NBA_DATABASE.md` `§T49.6` |
| **EDGE_DELTA** | the edge monitor's break-even shift; `-0.0916` to `-0.0649` to `-0.0662` on the true Flex payouts, then `-0.0748` (10-16 evening, re-solved on the window-only twin) | `NBA_SYSTEM_DESIGN.md` `§T49.7` |
| **`audit_market_coverage.py` (market-term monitor) / window-only twin (`_wo`)** | read-only audit, now a MONITOR not a gate: READY over 5 or more live slate dates with coverage and depth at least 85% of the lower certified season and player match 95% or more. The market term itself was switched ON 10-16 on the WINDOW-ONLY twin (`nba_score.tier_map_legs_sel_wo`, `slip_engine_slips_wo`, `live_backtest_suffix` `'_wo'`), because the certified market-inclusive scoring counted close-capture books (a lookahead) | `NBA_WORKERS.md` `§T49.4` |
| **grader v3** | the one PrizePicks payout grader refitted on the app's own quotes (393 used of 544 multi-pick quotes) and put behind live pick, backtest, validator and certifier; parity 105,835 sampled slips, 0 mismatches; certifier 83 checks, 0 FAIL; every Flex number it gives is a lower bound of what the app pays | `NBA_MULTIPLIERS.md` `§T50.3`; procedure in `NBA_RECIPE.md` `STEP 14s` |
| **`power_alt_v3`** | `pp_slip_rules` row for Power slips with alternate legs: `ln q = ln b + a ln fp`, conservative k_n at the 10th percentile, grid rounded down; over-pays on big demon stacks (factor product above about 5), so any multi-demon Power backtest is overstated | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`flex_same_game_v3`** | `pp_slip_rules` row that lowers same-game 3- and 4-pick Flex tiers (3/1 to 3/0.75 on some pairs, 6/1.5 to 5/1.25); same-game Power is handled by `power_same_game_v3` | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`power_same_game_v3`** | rule for same-game 2- and 3-pick Power on PrizePicks: the app discounts a correlated same-game standard 2-pick Power by 0.1-0.2x (2.8x worst quoted instead of 3x) and flags the lineup adjusted | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`flex_alt_tiers`** | `pp_slip_rules` lower envelope of quoted Flex payouts against the factor product for slips with alternates, interpolated in ln of the product and clamped; a missing rule raises "never guessed" | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`payout_grader_v2` / `payout_pre_20261021` / `payout_v3_pre_20261021`** | the columns that keep the OLD payout value when a table is regraded in place (PrizePicks grader v3 on 10-18; Underdog table 90,308 rows and the eight PrizePicks slip_engine tables on 10-21) | `NBA_DATABASE.md` `§T50.6` |
| **`nba-grader-v3-regrade.yml` / `regrade_pp_payout_v3.py`** | workflow and script that regrade every PrizePicks backtest slip to the current grader; the weekly P5 step 3g keeps the tables on it | `NBA_WORKERS.md` `§T50.4` |
| **`research_grader_v3_parity.py`** | read-only proof that the Python grade equals the DB twin on slips sampled from every regraded table (ties, voids, Power, Flex, alternates, same-game included) | `NBA_WORKERS.md` `§T50.4` |
| **SLIPQ (`PP_MODE=slipq`)** | quote of every live PrizePicks slip against the app after the pick, stored in `nba_score.live_slip_quotes`; grade pays the quoted tier; the grader is kept in `live_slips.payout_model` | `NBA_MULTIPLIERS.md` `§T50.3` |
| **quote gate (`apply_quote_gate.py`)** | step of `nba-pp-payout-map.yml` after SLIPQ: only slips whose PrizePicks quote passes (all-hit at least 0.95 x our payout, leg on the board as built, status 200) may be `placed` | `NBA_SYSTEM_DESIGN.md` `§T50.7`; procedure in `NBA_RECIPE.md` `STEP 14s` |
| **quote tolerance 0.95 (`quote_min_ratio`)** | the key in `classification_config['pp_portfolio']` that sets the quote gate's minimum ratio of the app's all-hit payout to ours; `backups` (4) sits beside it | `NBA_DATABASE.md` `§T50.6` |
| **`placed_backup` / `placed_quote_skip` / `graded_backup` / `graded_quote_skip`** | slip status values written by the quote gate: a passing extra, a placed slip that failed the quote, and their graded forms | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`placed_shadow`** | status of a slip from a replaced or shadow strategy: recorded, never staked, not shown on the Slips screen | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Less floor 1.7x** | the favourite floor on a PrizePicks Less price: factor 0.5667 (1.7x); Less price is the complement of the More price (median sum S 0.991) | `NBA_GOBLIN_DEMON.md` `§T50.2` |
| **four-way rule** | classification of an alternate leg by side and position against the anchor: Less above = goblin, Less below = demon, More above = demon, More below = goblin (454 goblin above, 505 demon below, 20 no anchor on the 10-21 board) | `NBA_GOBLIN_DEMON.md` `§T50.2` |
| **switch-point anchor** | the lowest +100 More rung, used as the lowest demon for ladders that have no standard line | `NBA_GOBLIN_DEMON.md` `§T50.2` |
| **`allowed_wager_types`** | per-projection board field ('over' or 'under_or_over'); Less opens on near-standard rungs of four stats only (Points, PRA, Rebounds, Assists) | `NBA_GOBLIN_DEMON.md` `§T50.2` |
| **stack mode** | payout-proof grid mode that stacks alternate Less legs in 3-6 pick quotes (204 slips); the grid mode gave 340 slips with 0-3 alternates | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`AL_*` / `SR_*`** | paper rule families of the forward tracker: AL_ = alternate (goblin or demon) Less legs, SR_ = nine standard Flex rules with bootstrap lower bound above zero in both seasons (all 5- or 6-pick) | `NBA_GOBLIN_DEMON.md` `§T50.2` |
| **`paper_altless_tracker.py` / `nba_score.paper_altless_slips`** | forward paper tracker (modes pick, grade, report) and its table: status 'paper', never placed, never on the slip screen | `NBA_WORKERS.md` `§T50.4` |
| **`hide_prediction_market_alts`** | `nba_main_ui.ud_alt_policy` key (default true) that drops Underdog legs flagged in `nba_market.ud_line_flags` as alternate rungs of prediction-market lines (provider kalshi or udx) because the app does not offer them | `NBA_MULTIPLIERS.md` `§T50.3` |
| **floor2** | Underdog floors every payout to 2 decimals: `floor2(base(n) x product of payout_multiplier)`; Flex partial pays the product of the picks that hit | `NBA_MULTIPLIERS.md` `§T50.3` |
| **Underdog 4-pick Flex 7.2** | the app's own base for a 4-pick Flex (Flex 3: 3.25/1.09; 4: 7.2/1.4); ~~the published 6.0~~ superseded 10-21 | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`ud_payout_quotes` / `research_ud_payout_probe.py`** | table and probe for Underdog's login-free entry-estimate call (fantasy picks: 47/47 Standard and 36/36 Flex exact) | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`betr_payout_v1`** | `pp_slip_rules` row for Betr tables, verified against Betr's own `ValidateEntryWithRules` quotes: 230/230 Perfect and 586/586 Dynamic tiers, sizes 2-10 | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`ValidateEntryWithRules`** | the Betr query (`validateEntryOnEntryRules`; modes PERFECT, DYNAMIC, MYSTERY, RACE_TO_PLACE) that prices an entry on Betr's server; answers are stored in `nba_market.betr_quote` | `NBA_MULTIPLIERS.md` `§T50.3` |
| **parked Betr** | Betr excluded from P3 harvest, scoring and the board by `p3_betr_wait.enabled = false` and removal of `betr` from `nba_main_ui.apps` (owner 10-19 22:51 PT); research use only; restore by reversing those two settings | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_RECIPE.md` `STEP 14s` |
| **skipper feed** | Fliff Pick'Em's public feed of per-selection multipliers (decimal about 1.80 and 1.85, margin about 9.6%); league id is a string key `fkey__sk_league__461`, games are `fobj__conflict_event__N` | `NBA_MULTIPLIERS.md` `§T50.3` |
| **SuperFlex** | Fliff Pick'Em contest type that allows 2 losses (Flex allows 1); payout amounts unknown; a void in one game voids every selection from that game | `NBA_MULTIPLIERS.md` `§T50.3` |
| **Fliff overround 1.0904** | main-pair overround of the Fliff sportsbook (5,971 pairs), m = 1/(1.0904 p); it prices the sportsbook, not Pick'Em | `NBA_MULTIPLIERS.md` `§T50.3` |
| **Sleeper overround 1.1238 (OVR)** | main-pair model price m = round(1/(1.1238 p), 2); flat 12.4% overround, p x m = 0.889 in every group and side | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`BONUS_EST`** | planned Sleeper size-bonus table {2: 1, 3: 1.0797, 4: 1.102, 5: 1.144, 6: 1.227} used in `research_sleeper_transfer.py`; sizes 5 and 6 are estimates, not verified | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`sleeper_payout`** | `classification_config` row: per-side multipliers, Max = product x size bonus, Flex = round robin of the (n-1)-pick sub-slips | `NBA_DATABASE.md` `§T50.6` |
| **PicksVS** | the owner's Sleeper variant in California: payout = entry x VS Score plus a pool prize (pools up to 5,000 entries pay 100x to the top VS Score; 20-entry pools pay 3x) | `NBA_MULTIPLIERS.md` `§T50.3` |
| **VS Score** | product of the per-pick multipliers in PicksVS; ranks entries in a pool | `NBA_MULTIPLIERS.md` `§T50.3` |
| **ez Pick** | Sleeper pick with a 1.0x multiplier and a 1.25x minimum entry that lets an entry use one team only | `NBA_MULTIPLIERS.md` `§T50.3` |
| **`research_sleeper_transfer.py` / `research_sleeper_stack.py`** | research programs that re-price qualified legs and same-game stacks at another app's line (env `ST_APP` = sleeper, fliff or betr; `ST_PART` = hist_ud, hist_pp or live); market-only stacks lose at every size | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **board_hp** | calibrated board-centred hit probability (`nba_score.board_hp`), retired 2026-10-23 when final_hp took over the chain | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **one number** | final_hp is the single board-centred, line-type-calibrated hit probability shown for every app leg; proven by `audit_one_number.py`; main UI v1.4.39 reads board_scored's own final_hp | `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8`; `NBA_RECIPE.md` `STEP 14s` |
| **L1 ladder** | layer 1 of the board chain: a board-centred ladder fitted on the day's own ladder | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **L2 shrink `n/(n+400)`** | layer 2: a spread per prop x line type x side shrunk toward the line type x side parent with weight n / (n + 400); L3 anchors the residual | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`final_hp_board_cal.py`** | fitter and per-leg arithmetic of the board chain (chain B of `research_final_chain_asof.py`); `board_legs` gives every app board its number | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`cal_chain`** | `final_hp` column ('board' or 'asof') saying which chain priced the row; the 12 calibrated props get the board chain, every other prop keeps the as-of shift | `NBA_DATABASE.md` `§T50.6` |
| **calgap** | calibration gap: stated probability minus hit rate, used to measure overconfidence by day, group and line type | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **board profile** | a recurring, pre-pick-identifiable board type defined without strategies (375 found at the close of Layer 1 on 2026-10-24 00:53 PT); it must recur in each season, be identifiable and be distinct | `NBA_BASELINE_CALIBRATION.md` `§T50.5`; method in `NBA_RECIPE.md` `STEP 14s` |
| **ELECTED / CANDIDATE profile** | ELECTED = a profile with at least 25 slates a season (303 of 375); CANDIDATE = 15-24 slates (72) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **trailing clean pass** | a discovery round that adds zero new profiles; Layer 1 stops after 10 consecutive (ended with 19) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **Hennig bootstrap** | cluster-stability test: a clustering counts only if mean Jaccard is at least 0.75 on 20 bootstrap resamples of each season (a moving-block variant for windowed views); it removed every noise cluster on synthetic data | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **Layer 1 / Layer 2** | Layer 1 = profile discovery with no strategies; Layer 2 = strategies searched per profile (best 5 against all-slates best 5, both directions, BH q 0.10) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **WORK / many-winners** | WORK = a profile whose best-5 strategies beat the all-slates best-5 in both directions at BH q 0.10 (0 of 375); many-winners = profiles with both-season winners above the random 95th percentile (15-44 per structure against about 19 by chance) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **FALLBACK strategy** | the all-slates best strategy played when a board fits no useful profile (and the name of the previous portfolio kept as `pp_portfolio.fallback`) | `NBA_BASELINE_CALIBRATION.md` `§T50.5`; `NBA_DATABASE.md` `§T50.6` |
| **C1 / C2 slate profiles** | slates of at least 9 games with few (C1) or many (C2) back-to-backs; A and B are the other slate classes of ledger item 24 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **walk-forward** | each month predicted by models trained only on earlier legs with settings fixed in advance (2025-26: gradient boosting log-loss -0.000752, ridge -0.000534); sharper probabilities, not better live slips | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **holdout (profile holdout)** | profiles built and trusted on 2024-25 only and scored on 2025-26 as live: 17 trusted profiles went from +11..+15 to -1.8 points a leg | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **lb5** | lower bound (5th percentile) ROI used to compare portfolios and rules; `_wo` = window-only pool with steals, `_wo_nosteals` = steals-free pool, cap N = most slips one leg may appear in, H1 / H2 = season halves split at Jan 15 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **streak flags (`streak_rules`)** | config of two self-referencing day flags (`A_core_3power`, `A_regular_5power`) that halve stake while ON; state per pick in `nba_score.live_streak_flags`, note in `live_slips.streak_note` | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_DATABASE.md` `§T50.6` |
| **flagged day** | a day on which a streak rule is ON for a strategy (stake x0.5) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **earned unit ("earn the raise")** | the stake unit starts at 1 each season, rises by 1 when season profit is at least 25 x the next unit, steps down by 1 when the drop from the season high is at least 15 x the unit, maximum 15; hand-set unit turns auto off | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_RECIPE.md` `STEP 14s` |
| **`over_minutes_floor`** | `classification_config` key (enabled, `min_avg` 22, `games` 10): an Over leg is left out when the player's last-10-game minutes average is under 22; deployed 2026-10-21 03:25 PT | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_DATABASE.md` `§T50.6` |
| **`slip_exposure`** | per-leg and per-player exposure cap code in `live_slip_engine`; OFF unless a DB row exists (none), kept for research because caps mostly hurt | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **2-slip portfolio** | PrizePicks live set of 2026-10-22/23: `P_wrebounds_4flex` + `P_cal_r70_3power` (n 2, leg cap 2, backups 4); superseded 10-25 by Portfolio B and kept only as `pp_portfolio.fallback` | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`P_cal_r70_3power`** | calibrated-pool unit: the 12 calibrated props, standard lines, final_hp at least 0.70, at most 2 legs a game, 3-pick Power (built by `calib_slips.py`); `P_` prefix = portfolio unit (`apply_quote_gate.PORTFOLIO_PREFIX`) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Portfolio B** | PrizePicks live from 2026-10-25: six units `P_B3_3power`, `P_B4_4flex`, `P_B5_3power`, `P_B6_4flex`, `P_B7_3power`, `P_B9_6flex`, one slip each, 1 unit each, no caps (`portfolio_b.py`); 3.04 slips a day, ROI +92% in-sample, plan on 40-60% of the edge | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_RECIPE.md` `STEP 14s` |
| **`pb_rates`** | `live_slip_engine` function giving the trailing cell window of Portfolio B (this season's window board graded on box scores plus backtest top-up to 20 slates) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Portfolio T** | Underdog live from 2026-10-26: three 2-pick Standards T1 (`weighted:rebounds_B1_U`), T2 and T3 (standard plus harder lines ranked on final_hp x factor, floors 0.60 and 0.55, skip-top, 1 a game), 1 unit (USD 2) each (`ud_portfolio_t.py`); honest ROI +27%; replaces P5, which is kept as shadow | `NBA_SYSTEM_DESIGN.md` `§T50.7`; `NBA_RECIPE.md` `STEP 14s` |
| **`ud_live_portfolio`** | `classification_config` row; `live = 'T'` plays Portfolio T, any other value returns to P5 | `NBA_DATABASE.md` `§T50.6` |
| **`audit_portfolio_b_parity.py` / `audit_ud_portfolio_t_parity.py` / `audit_ud_t_rollback.py`** | audits proving shared builder equals research (B 309 of 309 slates; T 312-316 of 316 unit-slates) and the production pick-to-grade path on real past slates in a rolled-back transaction | `NBA_WORKERS.md` `§T50.4` |
| **`sim_p3_full.py` / `nba-sim-p3.yml`** | full game-day simulation of the real P2B model build and P3 chain in one rolled-back transaction (2026-10-19: P2B 3,029 s, P3 839 s) | `NBA_WORKERS.md` `§T50.4`; `NBA_RECIPE.md` `STEP 14s` |
| **`board_tiers_v2_nm_idx`** | the `nba_market` index found missing in production on 2026-10-19 (103 MB, created concurrently); without it each per-prop query of the confidence refit ran 17+ minutes | `NBA_DATABASE.md` `§T50.6` |
| **`VERSION` bump rule / test C0b** | the deploy ships the NBA main UI only when its entry file changes, so any `nba/main_ui` change needs a `VERSION` bump; C0b checks deployed `VERSION` equals the repo, parts byte-equal and no commit after the last bump | `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8`; `NBA_RECIPE.md` `STEP 14s` |
| **`per_book_budget_s` / `split_max_reads`** | `market_feed` keys: 240 s for all per-book ParlayAPI reads together, and at most 24 split re-reads of a truncated book; `x-result-truncated` marks a read capped at 10,000 rows | `NBA_WORKERS.md` `§T50.4`; `NBA_RECIPE.md` `STEP 14s` |
| **`app_login` (`app_login.py`, `nba-app-login.yml`)** | real-Chrome sign-in for Sleeper and Fliff (SeleniumBase UC under Xvfb, per-app sticky proxy session, San Diego location, human pacing), modes login and refresh; Sleeper login not yet working at 2026-10-26 00:11 PT | `NBA_WORKERS.md` `§T50.4`; `NBA_RECIPE.md` `STEP 14s` |
| **OTP relay (`app_otp.py`, `nba-app-otp.yml`, `<app>_otp`)** | the owner passes the emailed or texted code to a workflow that reads it from the event file and stores it under `<app>_otp` in `nba_config.external_credentials`; the login reads and deletes it; never printed | `NBA_WORKERS.md` `§T50.4`; `NBA_DATABASE.md` `§T50.6` |
| **token refresh (`nba-app-token-refresh.yml`)** | cron every 6 hours (20:47, 02:47, 08:47, 14:47 PT) replaying the stored `<app>_session_state` for Sleeper and Fliff, one at a time, no code wait; cannot renew until a first login stores the session | `NBA_WORKERS.md` `§T50.4`; `NBA_OPEN_ITEMS.md` `§T50.11` |
| **`<app>_session_state`** | `nba_config.external_credentials` key holding an app's local storage, cookies and saved time | `NBA_DATABASE.md` `§T50.6` |
| **`has_password` (code-only login)** | field of Sleeper's login-context answer; false for the owner's account, so login needs a code that Sleeper sends automatically with a captcha token | `NBA_WORKERS.md` `§T50.4`; `NBA_OPEN_ITEMS.md` `§T50.11` |
| **`sleeperauth1` / `fliffauth1`** | names of the per-app sticky proxy session ids so the login exit is the same every run | `NBA_WORKERS.md` `§T50.4` |
| **login secrets (`SLEEPER_EMAIL`, `SLEEPER_PASSWORD`, `FLIFF_EMAIL`, `FLIFF_PASSWORD`, `UD_EMAIL`, `UD_PASSWORD`)** | GitHub secret names for app logins (names only); Betr's password is never stored | `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8` |
| **`nba-browser-probe.yml`** | dispatch-only workflow ("NBA Browser Probe (no commit)"): input `script` = file under `nba/`, needs Chrome, commits nothing | `NBA_WORKERS.md` `§T50.4` |
| **`nba-research-run.yml`** | read-only workflow for `research_` and `audit_` scripts (name pattern, space-separated env pairs, 180-minute limit) | `NBA_WORKERS.md` `§T50.4` |
| **map-before-pricing rule** | owner's standing rule of 2026-10-25: map an app's per-leg and per-slip-structure multipliers by building slips in the app, then guess-and-check; any mismatch means not mapped | `NBA_OPEN_ITEMS.md` `§T50.11`; `NBA_RECIPE.md` `STEP 14s` |
| **`NBA_BOARD_LEARNINGS.md`** | running log, one line per finding, each naming its script and run, measured on both seasons unless marked; changes go through the certification ledger and `NBA_COMPASS.md` | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **ROLLBACK_VERIFIED / AUDIT_PASS** | an audit transaction was rolled back and production verified unchanged / the audit passed | `NBA_WORKERS.md` `§T50.4` |
| **`window` / `routine`** | archive labels; 'window' = today's Eastern-time games only, which is why a simulation must start after midnight Eastern | `NBA_DATABASE.md` `§T50.6` |
| **`f_books`** | corroboration feature clip(books / 4, 0, 1) used in confidence and score | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **gap (model vs market)** | model probability minus the market-anchored probability for a leg | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`ME_HAIRCUT`** | default 0.95 multiplier on the base payout in `build_slip_matrix.py`, a research-only script that is NOT on grader v3 (no goblin or demon handling, no same-game rule) | `NBA_MULTIPLIERS.md` `§T50.3` |
| **leg selector** | the level-1 unit of the board-profile search: a cell (prop × line type × side) × a rank × a cut. Nine ranks: `final_hp`, `baseline_hp`, `final_score` (the certified map), the plain player hit rate on the cell (all earlier legs), the player's trailing 3 / 5 / 10 (player × prop × line type × side, earlier slates only), the prop-line trailing (exact line, last 30 earlier legs) and the line-variation trailing (line band low / mid / high, last 60). Cuts: every top n from 1 to 30 and every top 1 to 40 percent of the cell, read only where the cell has that many legs and the selector reaches at least 8 slates (the owner asked for every number in between). Transcript of the 10-24 bug-audit subagent | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **layer-2 evaluation parameters** | how a profile's strategies are judged: own picks = the 5 best by mean minus sd / sqrt(n), played on at least max(8, half the profile's slates); global = the 5 best on all slates of the fit season; diff = own minus global on the profile's test-season slates (units per slip); p from `LP_NULL` (default 200) random slate sets of the same sizes, one-sided; WORKS needs diff above 0 in both directions and the larger p surviving BH q 0.10. PLAY / AVOID compares the all-slates picks on the profile's slates against random slate sets (both directions, BH q 0.10). Per-structure reads (`L2_PER_STRUCT`, default on) list only flagged profiles; strategies of the owner's live scope (2P, 3P, 4F, 5F, 6F) are tagged "[live scope]" in the printout. Transcript of the 10-24 bug-audit subagent | `NBA_SYSTEM_DESIGN.md` `§T50.7`, `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`pricing.js` (main interface)** | the browser and worker twin of the graders; `assets.js` serializes its functions so there is one source, and `test_nba_main_ui.py` asserts that its payouts equal `build_slip_engine.grade` and `ud_live_slip_engine.payout` on random slips. Functions: `nbaCompress`, `nbaGridDown`, `nbaFlexAlt`, `nbaSameGame`, `nbaLegFactor`, `nbaModes`, `nbaPayout`, `nbaTiers`, `nbaFullMultiplier`, `nbaEv`, `nbaBreakeven`, `nbaModeLabel`. Transcript of the 10-22 payout-map subagent | `NBA_SYSTEM_ARCHITECTURE.md` `§T50.8-Z1`, `NBA_MULTIPLIERS.md` `§T50.3` |
| **`price_shop_ledger.margin_pp`** | the ledger's model-probability gate distance, moved 0.0662 to 0.0748 on 10-17 to follow the window-only switch; changed in the database and in the default of `build_price_shop_ledger.py` | `NBA_DATABASE.md` `§T50.6` |
| **`stake_unit.auto` / `auto_unit()` / `refresh_auto_unit()` / `LS_UNIT_NO_PERSIST`** | the earned-unit config: `{enabled, start 1, step 1, max 15, up_x 25, down_x 15}`. `auto_unit()` runs after every grade, `refresh_auto_unit()` before every pick; replays never write `unit_usd` (switch `LS_UNIT_NO_PERSIST`, set by `audit_season_replay`) | `NBA_DATABASE.md` `§T50.6` |
| **`stake_unit.ud_play`** | switch for playing Underdog slips: set false 2026-10-22 14:52 PT (Underdog hidden and paper), true again for Portfolio T from 2026-10-26 | `NBA_DATABASE.md` `§T50.6` |
| **`nba_score.live_unit_history`** | one row per graded day: date, season start, profit, high, unit from to, reason; first row is the 2026-10-17 hold at 1 | `NBA_DATABASE.md` `§T50.6` |
| **`nba_score.live_streak_flags`** | per pick, every streak rule's state: date, on, since, reason, acted, factor; the placed slip carries `live_slips.streak_note` | `NBA_DATABASE.md` `§T50.6` |
| **`live_slips.unit_usd`** | column holding the unit in force when the slip was picked; `payout_model` keeps our grader's number when a quoted tier is paid | `NBA_DATABASE.md` `§T50.6` |
| **`pp_portfolio` keys (`enabled`, `n`, `leg_cap`, `replaces`, `quote_min_ratio`, `backups`, `order`, `previous_order`, `per_unit`, `fallback`)** | `classification_config` key written in four steps: 10-22 14:38 PT `{enabled true, n 2, leg_cap 2}`; same day quote gate adds `quote_min_ratio` 0.95 and `backups` 4 (unit prefix `P_`); 10-23 `order` = `P_wrebounds_4flex`, `P_cal_r70_3power`; 10-25 12:45 PT Portfolio B with six units, `n` 6, `per_unit` 1, `leg_cap` 99, `backups` 0 and `fallback` = the previous 2-slip portfolio. Strategies listed in `replaces` build as shadow only | `NBA_DATABASE.md` `§T50.6` |
| **`ud_live_portfolio.live`** | `'T'` = Underdog Portfolio T is played from 2026-10-26; any other value returns to P5. The 10-25 rows of Underdog P5 and P4 were set to status shadow | `NBA_DATABASE.md` `§T50.6` |
| **`final_hp_board_centre`** | `classification_config` key, enabled TRUE since 2026-10-23 00:52 PT; env `FE_BOARD_CENTRE=1/0` overrides; false = rollback to the as-of chain | `NBA_DATABASE.md` `§T50.6` |
| **`p3_betr_wait.enabled = false`** | set 10-19 22:51 PT: Betr is parked, P3 no longer waits for the Betr harvest; the word betr was removed from `nba_main_ui.apps` (prizepicks, underdog, sleeper, fliff remain) | `NBA_DATABASE.md` `§T50.6` |
| **`game_lines_feed`** | key `{mode "live", live_key_name odds_api_key, historical_key_name odds_api_key_nba}` (owner decision 10-19 14:16 PT: the paid key is not renewed, the free key is the normal path); `capture_game_lines_morning.py` reads the live endpoint; mode historical would restore the paid snapshot. Dry run: 144 rows, 3 games, 9 books, 491 credits left | `NBA_DATABASE.md` `§T50.6` |
| **`odds_api_key` / `odds_api_key_nba` / `parlay_api_key` / `parlay_api_key_alt` / `proxy_url` / `balldontlie_api_key` / `oddspapi_api_key`** | NAMES of `nba_config.external_credentials` rows (columns `credential_key`, `credential_value_encrypted`, `updated_at`): `odds_api_key` is the free key (500 credits a month, now the live game-lines key); `odds_api_key_nba` is the paid key, DEACTIVATED (401), not renewed. Values are never written in docs | `NBA_DATABASE.md` `§T50.6` |
| **`sleeper_session_state` / `fliff_session_state` / `sleeper_otp` / `fliff_otp`** | credential-row names: saved real-Chrome sign-in (localStorage, cookies, saved_at) and the one-time-code relay row (deleted as soon as read). At 10-26 00:11 PT neither session-state row existed | `NBA_DATABASE.md` `§T50.6` |
| **`betr_session_state` / `betr_access_token` / `betr_refresh_token`** | Betr credential-row names; the session was valid until 11-15; Betr's password is never stored | `NBA_DATABASE.md` `§T50.6` |
| **`base_power` / `flex_all_standard` / `flex_2pick_base` / `compression` (rule keys)** | `pp_slip_rules` keys loaded by `main_ui/common.js` beside `flex_alt_tiers`, `power_alt_v3`, `flex_same_game_v3` (and `power_same_game_v3`, the eighth key). Base tables themselves are hard-coded in `build_slip_engine.py` and `sql/pp_payout_v3.sql`: Power 2:3, 3:6, 4:10, 5:20, 6:37.5 | `NBA_DATABASE.md` `§T50.6` |
| **leg cap constants (0.072 / 18.5x / 6.17)** | implied probability never goes below 0.072, so a 2-pick tops out at 18.5x and a single demon at about 6.17; 4,748 NBA legs repriced (the old extrapolation allowed 2-picks up to 306x); Less side uses a 1.7x favourite floor (`pp_price_version`) | `NBA_DATABASE.md` `§T50.6` |
| **`nba_market.pp_payout_v3` / `pp_slip_payout_v3` / `pp_grid_down`** | SQL twin of grader v3 (`nba/sql/pp_payout_v3.sql`, 2026-10-18 18:09 PT): `pp_grid_down(x)` IMMUTABLE grid rounding; `pp_payout_v3(n, hits, structure, fprod, alt, same_game)` raises an error when `power_alt_v3` has no row for the size; `pp_slip_payout_v3(legs_json, structure, same_game)` drops tied or void legs, 1.0 when none remain, plays a Flex below 3 picks as Power. Other twins: `build_slip_engine.pp_payout/grade`, `main_ui/pricing.js nbaPayout`, certifier L10, L11, L11b | `NBA_DATABASE.md` `§T50.6`, `§T50.6-Z1` |
| **`board_hp_tunables` / `nba_score.board_hp` (retired)** | `board_hp_tunables` = 407 as-of sets 2024-11-13 to 2026-10-22; `board_hp` = 1,065,829 legs over 402 days, written by `build_board_hp.py`; log-loss 0.6219 to 0.6052 on 841,446 graded legs (`audit_board_hp.py`). Superseded 10-23 (COMPASS 180a): nothing reads them, kept as history | `NBA_DATABASE.md` `§T50.6` |
| **`final_hp_board_cal` / `final_hp.cal_chain`** | 427 board-centred tunable sets 2024-11-09 to 2026-10-23; `cal_chain` = `board` or `asof` per row (non-calibrated props keep as-of); history re-priced by `rebuild_final_hp_board.py` | `NBA_DATABASE.md` `§T50.6` |
| **`nba_market.pp_quote` / `pp_mined_leg` / `pp_leg_price`** | PrizePicks quote tables: `pp_quote` every quote incl. reversion schedules `power_srp`/`flex_srp` (2,662); `pp_mined_leg` quoted 2-pick prices and implied p; `pp_leg_price` view prices 99.6 percent of 1.1M window legs | `NBA_DATABASE.md` `§T50.6` |
| **`ud_hide` / `ud_hidden` / `ud_line_flags_hide_lookup`** | board column and leg flag for an Underdog alternate rung of a prediction-market line; index on (game_date, player, line) WHERE hide cut the per-row check from 2.6 s to 0.5 s | `NBA_DATABASE.md` `§T50.6` |
| **`market_consensus` / `event_game_map` / `schedule_norm` staleness** | stopped at 2026-06-13, rebuilt by hand; backfilled 10-20 to 10-22 (1,851 consensus rows, 15 of 15 events to 14 games). Other stale tables: `game_lines_closing` (since 06-14), `player_splits`, `player_career_season_totals` (since 09-08), `official_tendency` (09-23), `defender_ratings` (04-09); watched by `audit_data_freshness.py` | `NBA_DATABASE.md` `§T50.6` |
| **767-More-rows incident** | 10-21 defect in `build_board_tiers_v2.py` (anchor took the lowest +100 alternate without a side filter) and `pp_refresh_prices()` (labelled rescued rows by position only); the old anchor would have changed 767 More rows (10.6 percent of the board); fixed with the side-aware four-way rule, proven by `audit_alt_less_tiers.py` (7,225 of 7,225 More rows identical; 454 goblin above, 505 demon below, 20 no anchor, 0 violations) | `NBA_DATABASE.md` `§T50.6` |
| **`replay_audit_slips` / `replay_audit_states` and replay labels** | research copies written by `audit_season_replay.py` (rolled back, rows kept under a label): `s2526_cap2`/`s2425_cap2`, `s2526_streak`/`s2425_streak`, `s2526_plan`/`s2425_plan` (ROI +88.4 / +51.3 percent), `s2526_v3`/`s2425_v3` (+84.8 / +50.0 percent), `s2526_base1021`/`s2425_base1021` vs `s2526_m22`/`s2425_m22` (over-minutes floor test) | `NBA_DATABASE.md` `§T50.6` |
| **`live_strategy_state` / `live_state_history`** | per strategy `state`, `live_cap`, `hurdles` (hysteresis and clean-release counters; those counters never live in the history table); 10-17 to 10-19 `live_cap` of A_core_3power, A_wrebounds_4flex, D_points_3power moved 3 to 2 | `NBA_DATABASE.md` `§T50.6` |
| **`CELLS` (engine cell table in `build_slip_engine.py`)** | cell, prop, tier, side, rank key, certified edge: `steals_R_U` (Under, final_score top 2, 0.691), `steals_R` (top 3, 0.654), `turnovers_R` (0.633), `stocks_R` (top 5, 0.613), `pts_ast_R` (baseline_hp top 3, 0.611), `points_R` (top 5, 0.608), `pra_R_U` (Under, baseline_hp top 1, 0.640), `blocks_R` (top 2, 0.595), `pts_reb_R` (0.576), `rebounds_R` (baseline_hp top 5, 0.574), `threes_D1` (0.631), `assists_D1` (0.588), `rebounds_D3` (0.606), `goblin` (G1/G2, top 1, 0.560, the extender). Engine bands are wider than the ledger cut for steals_R_U, steals_R and blocks_R | `NBA_DATABASE.md` `§T50.6-Z1` |
| **tier codes R / D1 / D3 / G1 / G2 and suffixes `_R`, `_R_U`, `_D1`, `_D3`** | cell-name parts: R = regular (standard) line, D1 / D3 = demon rung 1 / 3, G1 / G2 = goblin rungs, `_U` = Under side only; so `steals_R_U` is the regular steals Under cell and `threes_D1` the first-demon threes Over cell | `NBA_DATABASE.md` `§T50.6-Z1` |
| **CORE / DEMONS / DEFENSIVE cell lists** | CORE = turnovers_R, stocks_R, steals_R, rebounds_R, threes_D1, assists_D1; DEMONS = threes_D1, assists_D1, rebounds_D3; DEFENSIVE = steals_R_U, steals_R, turnovers_R, stocks_R, blocks_R and related | `NBA_DATABASE.md` `§T50.6-Z1` |
| **`n_rank` / `cell_size` (side-only re-ranking)** | `n_rank` is a leg's rank inside its cell; the map assigned it across both sides so a side-only cell is re-ranked within its side by score (ties by player name). Defect three: both were computed before duplicate keys were dropped, so 201 Regular cells (0.8 percent) carried `cell_size` plus 2 and `n_rank` holes; fixed by de-duplicating first (828,818 legs) | `NBA_DATABASE.md` `§T50.6-Z1` |
| **`SE_LEGS_SELF` / `SE_PHASE`** | test-source options of the slip engine; the script refuses them without a table suffix. The share cap treats `steals_R` and `steals_R_U` as one family; a `single:<cell>` composition is exempt | `NBA_DATABASE.md` `§T50.6-Z1` |
| **`slip_engine_slips.phase` (`final7` / `early` / `late` / `mid`)** | `final7` = last 7 days of a season, `early` = first 30 days, `late` = days 8 to 21 before the season end, `mid` = the rest. Cap-1 ROI 2025-26 / 2024-25: last 7 days +9 / -40 percent (26 percent paid), days 8-14 +79 / +4, 15-21 +49 / +113 | `NBA_DATABASE.md` `§T50.6-Z1` |
| **`min_pair_corr` / `max_pair_corr` / `same_team` / `teams`** | persisted slip columns of `slip_engine_slips` (stake 1.0); certifier check L11.no_negative_pair_slips blocks pair correlation at or below -0.08 | `NBA_DATABASE.md` `§T50.6-Z1` |
| **certifier checks L9 / L10 / L11 (names)** | `L9.certified_rows_exist`, `L9.profit_formula_exact` (profit_per_100 = 100 x (6 x 0.95 x pm^3 - 1), tol 1e-6), `L9.certified_regular_mult_1`; `L10.power_table_matches_live_page`, `L10.flex_table_documented`, `L10.breakeven_3pick_power_is_0.55` ((1/6)^(1/3) = 0.5503), `L10.slip_compression_rule_matches_oos_quotes`, `L10.regular_only_slips_pay_the_table_exactly`, `L10.grader_v3_equals_live_regular_quotes` (90 all-regular proof tiers); `L11.slips_exist_all_days` (323 days), `L11.no_player_twice`, `L11.two_teams_minimum`, `L11.size_equals_legs`, `L11.hits_equals_leg_hits`, `L11.no_negative_pair_slips`, `L11.payout_equals_grader_v3_recompute`. 66 of 66 invariants clean in three passes: CERTIFIED v3 | `NBA_DATABASE.md` `§T50.6`, `§T50.6-Z1` |
| **`REGRADE_TABLES` / `REGRADE_V3`** | env override of the default eight tables regraded by `regrade_pp_payout_v3.py` (`slip_engine_slips`, `_mf`, `_nosteals`, `_mf_nosteals`, `_post`, `_post_nosteals`, `_wo`, `_wo_nosteals`); `REGRADE_V3` is its log line (rows updated, rows regraded, old and new payout sums); idempotent, touches rows differing by more than 1e-9; runs in P5 after step 3f (`regrade_pp_flex_alt.py`) | `NBA_DATABASE.md` `§T50.6-Z1` |
| **`ud_payout_quotes` columns / `RX_SAME_GAME_SHARE` / `RX_SIZES`** | one row per Underdog entry-estimate quote: `run_id`, `slate_date`, `n`, `picks`, `prod_modifier`, `same_game`, `standard_mult`, `flex_mult`; probe env defaults `RX_SAME_GAME_SHARE` 0.2, `RX_SIZES` 2,3,4,5,6 | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`nba_score.ud_live_slips` / `ud_slip_engine_slips{suffix}` / `ud_slip_engine_legs{suffix}`** | Underdog live and backtest slip tables; live primary key (game_date, portfolio, composition, size, structure, k); `remaining` = legs left after DNP and push voids; `payout` NULL = refund when fewer than 2 legs remain; backtest `stake` always 1.0 | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`pricing.ud` / `ud_payout` / `pricingFrom`** | UI Underdog pricing: `classification_config` key `nba_main_ui`, field `ud_payout` shaped {standard: {n}, flex: {n\|k}}, built by `slips.js pricingFrom`; test A4 requires equality with `build_ud_slip_engine.STD` and `FLEX`, A3 checks `ud_portfolios` against `ud_live_slip_engine.PORTFOLIOS`; UI offers sizes 2 to 6 (engine to 8) | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`nba_main_ui.pp_strategies` / `replay_live.label` / `ud_portfolios`** | UI mirrors: strategy caps (updated 3 to 2 after test A2), `s2526_plan` replay label, Underdog portfolios | `NBA_DATABASE.md` `§T50.6` |
| **`ui_saved_slips` / `saved_pending` / `real_multiplier` / `real_multiplier_flex_tiers`** | `nba_score.ui_saved_slips` is write-only on the NBA side: the UI stores `estimated_multiplier`, the owner-typed `real_multiplier` and flex tiers with status `saved_pending`; a same-day re-save replaces the row only while `saved_pending`; no NBA code grades them | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`delta_star` / `confirm_z` / `alarm_z` / `UDL_EDGE_DELTA` / `UDL_EDGE_CONFIRM_Z` / `UDL_EDGE_ALARM_Z`** | Underdog edge-monitor values (row `ud_edge_monitor`): looks at 30, 60, 90, 120 slates; z = (mean - `delta_star`) / Newey-West SE (7 lags); CONFIRM at z at or above `confirm_z`, ALARM at or below `alarm_z`, sticky per season. Break-even certified build -10.84 pp, market-free twin -9.46 pp; bootstrap boundaries certified 2.48 / -2.95, twin 2.24 / -2.94; code default `UDL_EDGE_DELTA` -0.1084 | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`UD_CAP` / `UD_SIZES` / `UD_EXCL_CENTER` / `UD_HC_MAIN` / `UD_HC_ALT` / `UD_LEGS_TABLE` / `UD_TABLE_SUFFIX`** | env of `build_ud_slip_engine.py` in weekly P5 step 3e: 5, 2-6, 1, 0.005, 0.01, `nba_score.ud_tier_map_legs_curr_mf`, `_dlt_orig2_mf`; then `ud_edge_monitor_ref` is rebuilt from the table `ud_bt_table()` names; certified `_dlt_orig2` is never touched | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`_dlt_orig2` / `_dlt_recert2` / `_dlt_orig2_mf`** | suffixes of Underdog backtest tables: certified build, recertified build, and the market-free (mf) twin; the mf twin changes only `final_score` rows (101,052 of 421,819 legs, mean shift -5.59 points); `ud_slip_validation_dlt_orig2_mf` forward 4 of 30 survive, reverse 0 of 30 | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`validate_ud_slip_strategies.py` / `SV_SOURCE` / `SV_TABLE_SUFFIX`** | Underdog validator, manual dispatch only; tests V1, V1R, V2, V4, V5 read stored `profit` and `hits` of the table named by `SV_SOURCE` (default `nba_score.ud_slip_engine_slips_center`), so a payout change reaches verdicts only after regrade or rebuild; verdicts before the 10-21 regrade carry old 6.0 profits | `NBA_DATABASE.md` `§T50.6-Z2`; `NBA_OPEN_ITEMS.md` `T50-40` |
| **`higher_payout_modifier` / `lower_payout_modifier` / `higher_decimal` / `lower_decimal`** | scraper fields of Underdog's `payout_multiplier` and `decimal_price`; `archive_live_boards.py` writes the multiplier (else the modifier-only field; older scrapes fall back to `american_price`) to `board_snapshots.multiplier`; the engine uses round(decimal / sqrt(3), 2) only when it is NULL | `NBA_DATABASE.md` `§T50.6-Z2` |
| **`simulate_slips` / `std3_power_130`** | slip simulator validated 2026-09-22: strategy `std3_power_130` (real standards, value at least 1.30, 3-pick Power) gives 2024-25 +10.2 percent (1,971 slips), 2025-26 +20.4 percent (2,408), both +15.8 percent (4,379 slips, 310 nights); every slip priced 6.0x; claimed payout 2.33 per unit vs realized 1.16 (model overconfident, edge comes from ranking) | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`derived_backsim` / `derived_line_shift` / `derived_center_offset`** | table of 179,712 legs on stats books do not quote, with conservative line policy (FGA / FGM / FTA shifted 1.0; FTM / 3PA / OREB / DREB 0.5) and a center-offset policy (FGA 0; FGM / 3PA / DREB 0.25) that removed the Under artifact (real low-count PrizePicks lines hit Over 47.5 to 49.2 percent) | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`demon_priced_below_standard` / `kind_price_mismatch`** | `prop_universe` flags: 148 legs where the 7 percent longshot haircut took a near-standard demon under 1.0; mismatch is 0; the 12-check audit is all 0 | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`psr_pu_grid` / `psr_pu_final` (Playoff Unders grid)** | pre-registered grid of 1,920 PrizePicks and 360 Underdog variants (`research_playoff_unders.py`, single implementation `nba/playoff_unders.py`); gates G1 to G5; survivors G1+G3 638 and 78, plus G2 57 and 5, plus G4 51 and 5; G5 fails for PrizePicks, passes forward for Underdog (+66 percent vs null +13) | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`tier_map_legs_wi` (whole-number map)** | whole-number leg map: coverage 75,797 of 78,773 (96.2 percent); pooled fit a -0.00008, b 0.31294 on 68,190 legs; naive derivation 0.705 log-loss is worse than a coin flip 0.693; only 30 of 3,054 (2024-25) and 10 of 3,136 (2025-26) slips used a whole-number leg | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`load_current` / `attach_ranks` / `r_final_hp`** | research loaders: `load_current` reads 2026-27 slates from `pp_leg_price` (snapshot_label window, from 2026-10-01); `attach_ranks` in `research_board_profiles_l3.py` gives each leg baseline_hp and final_score from `tier_map_legs`; `r_final_hp` = `final_hp`; fallback to final_hp when no stored score | `NBA_DATABASE.md` `§T50.6-Z3` |
| **`HARD_QUERY_TIMEOUT`** | slips-screen database timeout of 10-21 13:57, fixed by comparing player ids as bigint (index used, 0.8 s) | `NBA_DATABASE.md` `§T50.6` |
| **`probe_opening_day.py` / `probe_odds_keys.py` / `probe_game_lines_fallback.py`** | 10-19 read-only readiness probes: all sources (proxy, schedule, injury report, crews, PrizePicks, ParlayAPI, Odds API, database); key status (paid `odds_api_key_nba` answered 401 DEACTIVATED_KEY, free key 401 on historical and 200 on live); a no-write rehearsal of the live-endpoint game-lines fallback (144 rows, 3 games, 9 books, 3 credits) | `NBA_WORKERS.md` `§T50.4-A` |
| **`ODDS_FALLBACK_KEY_NAME` / `GL_DRY_RUN`** | env of `capture_game_lines_morning.py`: the fallback key row (default `odds_api_key`) used on a failed historical call, and a parse-without-write switch; the log `error` column reads "fallback live ..." so the substitution is visible | `NBA_WORKERS.md` `§T50.4-A` |
| **ParlayAPI truncation (`x-result-truncated`, 10,000 rows)** | per-source serving cap of 10,000 rows sampled across books and markets, not recoverable by pagination; a read narrowed to one book is complete, `date=` and `commenceTimeFrom/To` are ignored | `NBA_WORKERS.md` `§T50.4-A` |
| **`market_feed.per_book_reads` / `capture_parlay_props.fetch` / `probe_parlay_perbook.py` / `probe_parlay_truncation.py`** | the per-book fix: a truncated full read is followed by one read per book (history books plus aliases), merged by identity (book, event, market key, market, player, line, period); a book that errors is a warning, never fatal. Probe for 10-20: DraftKings 2,690 rows (+1,083), Bovada 1,241 (+249) | `NBA_WORKERS.md` `§T50.4-A` |
| **`market_feed.split_max_reads` (24) / `research_parlay_split_check.py`** | 10-22 split read: a still-truncated book is re-read once per market it showed, after every book's plain read, capped at 24 reads | `NBA_WORKERS.md` `§T50.4-F` |
| **Bovada tricode bug** | ParlayAPI names Bovada players "Name (TEAM)", so all 41 Bovada players of 10-20 missed `player_name_map` and `build_rung_market`; `normalize` now strips the tricode and 1,449 archived rows were re-keyed | `NBA_WORKERS.md` `§T50.4-A` |
| **`probe_parlay_discovery.py` / `probe_parlay_event_odds.py` / `probe_parlay_perbook_mlb.py`** | 10-19 probes: ParlayAPI's `/sports/basketball_nba/odds` carries game lines from 14 books and event-level props are the same feed as `/props`; the MLB-board probe shows which books appear on live game days | `NBA_WORKERS.md` `§T50.4-A` |
| **`INJURY_EXPECT=1` / `sim_delta_check.py` / `nba-sim-delta-check.yml`** | on slate days zero injury snapshots become a visible soft failure; the sim runs the real `build_availability_delta.py` in a rolled-back transaction | `NBA_WORKERS.md` `§T50.4-A` |
| **`probe_scrape_sweep.py` / `MARKET_TO_PROP` / `FLIFF_KEY`** | runs every production board scraper like P3 into a scratch directory and checks each market key against `MARKET_TO_PROP` and each player against the name map, writing nothing; `FLIFF_KEY` maps Fliff's spelled-out props (522 of 858 legs had keys no scorer reads); Sleeper first-quarter props map to `_q1` keys | `NBA_WORKERS.md` `§T50.4-A` |
| **P3 time rule (min(13:15, first tip minus 30) plus 1)** | P3 runs at min(13:15 PT, first tip minus 30 minutes) plus one minute (11:31 PT for the 12:00 tip of 10-20); P3 waits for P2B until 11:30 PT; kept by COMPASS 168 after the injury-change measurement (260 of ~1,800 players changed between tip-75 and tip-30, 43 after) | `NBA_WORKERS.md` `§T50.4-A` |
| **`sim_p3_full.py` timings (full simulation)** | 10-20 run: P2B 3,029 s (periods ladder 679 s, as-of calibration 379 s, confidence refit ~26 min, `final_hp` 51 s), P3 839 s incl. a 365 s Betr wait; 9,158 legs scored, 9 PrizePicks and 4 Underdog slips, certify P2 7/7 and P3 9/9 | `NBA_WORKERS.md` `§T50.4-B` |
| **simulation midnight rule** | the archive labels 'window' only for the same ET day's games, so a simulation must start after midnight ET; the 10-20 21:00 PT start made every 10-21 row 'routine' and the pick was refused (correctly) | `NBA_WORKERS.md` `§T50.4-B` |
| **`sim_betr_ab.py` / `nba-sim-betr-ab.yml`** | Betr A/B simulation (10-19 22:56 PT, rolled back, 2,418 s): Betr on scores 8,920 legs, parked 7,036 and logs "Betr PARKED ... 2,320 Betr legs not scored" | `NBA_WORKERS.md` `§T50.4-B` |
| **`build_blowout_model.py` empty-season bug** | the refit died on KeyError 'GAME_DATE' because `ensure_season_files` writes an empty 2026-27 stub; an empty season is now skipped | `NBA_WORKERS.md` `§T50.4-B` |
| **`p3_wait_betr.py` / `BETR_WAIT\|...`** | soft P3 step "Wait for the Betr window board" (10-19 17:34 PT) capped by `p3_betr_wait` (max_wait_s 360, poll_s 15, stop 14 min before first tip); counts rows fetched within 90 minutes; writes one `BETR_WAIT\|...` verdict line | `NBA_WORKERS.md` `§T50.4-C` |
| **Betr park / restore** | park = `p3_betr_wait.enabled = false` plus removing "betr" from `nba_main_ui.apps`; `score_board_legs.py` drops `betr` / `betr_us_dfs`; restore = set true and add "betr" back; research use stays allowed | `NBA_WORKERS.md` `§T50.4-C` |
| **`betr-cloud-harvest.yml` league auto-switch** | Betr's harvest resolves league NBA from 2026-10-20 UTC | `NBA_WORKERS.md` `§T50.4-C` |
| **`rows_betr` / `rows_underdog` (in `archive_live_boards.py`)** | archiver builders; `rows_betr` lumps tiers and alt rungs into `<market>_alternate` with multiplier NULL (94.7 percent of committed-board rows scorable after the mapping fix); `rows_underdog` had stored spelled-out combos under keys no scorer reads | `NBA_WORKERS.md` `§T50.4-C`, `§T50.4-A` |
| **`probe_betr_quote.py` / `probe_betr_quote_less.py` / `probe_betr_quote_engine.py` / `probe_betr_slip.py` / `probe_betr_slip_wire.py`** | read-only Betr pricing probes (from 10-18 20:28 PT) calling Betr's own entry-validation query from a seeded real-Chrome session; answers go to `nba_market.betr_quote` | `NBA_WORKERS.md` `§T50.4-C` |
| **P3 speed-up set** | afternoon checkout 108 s to about 7 s (sparse blobless; `nba-ci-checkout-speed-test.yml`); claim job 53 s to 2 s; `final_hp` cutpoints from (value, count) pairs (`audit_conf_cutpoints.py`); `FE_DATE` limits `rung_market` reads; price-shop ledger with JIT off (cell_rates 48-87 s to 4 s, `audit_jit_benchmark.py`) | `NBA_WORKERS.md` `§T50.4-C` |
| **`nba-p3-afternoon-light.yml` step limits** | job limits 10 and 45 min; steps: rung keys 8, price keys 5, ParlayAPI market term 10, market snapshot 8, consensus and event map 5, wait for P2B 22, market refresh of `final_hp` 8, wait for Betr 9, collect soft failures 10 | `NBA_WORKERS.md` `§T50.4-C` |
| **`audit_portfolio_replacements.py`** | audit that found no placeable 4-Flex in the 10-23 round robin after the Giddey hold (CHI @ MIL 13:00 PT tip, pick at 12:47 PT) | `NBA_WORKERS.md` `§T50.4-C` |
| **`soft_paper_al` / `MD_DATES` / `derived_dates` / `build_market_derived.py`** | P3 soft step for the paper altless tracker; `build_market_derived.py` with `MD_DATES` refreshes given dates incrementally as soft steps in P2A (recent 3) and P3, maintenance task `derived_dates` | `NBA_WORKERS.md` `§T50.4-C` |
| **`apply_quote_gate.PORTFOLIO_PREFIX` / quote gate walk order** | prefix `P_` of PrizePicks portfolio units; walk order is k then unit, the first n passing become placed, a failed placed slip becomes `placed_quote_skip`; a warning is emitted when fewer than n pass | `NBA_WORKERS.md` `§T50.4-C` |
| **`tmp_rm` / `tmp_bt` / `tmp_graded`** | temp tables in `build_confidence_v3.py` (10-21): market aggregates built once as indexed temp tables with session JIT off; `tmp_graded` is the graded-legs temp table (~5 min of the ~26 min refit) | `NBA_WORKERS.md` `§T50.4-D` |
| **`audit_confidence_refit_speed.py`** | old versus new per-prop queries on the same `tmp_graded`, tolerance 1e-9; formal parity proof still owed (T50-19); the 10-22 refit took 10 min 45 s and P2B certified 7/7 | `NBA_WORKERS.md` `§T50.4-D` |
| **VERSION / dollar-quote patch corruption** | 10-21 incident: a patch whose new text held a dollar-quote sequence duplicated the file tail (`v1.4.26` broken, restored as `v1.4.27`); earlier hits on `build_market_anchor.py` and `certify_slip_system.py`. Rule: never type such sequences | `NBA_WORKERS.md` `§T50.4-E` |
| **Overview switch (`nba_main_ui.overview.enabled`)** | Overview pre-selected view shipped `v1.4.28`, tick removed `v1.4.29`, key normalised once per row `v1.4.30`; served only when the key is true (currently false, `v1.4.32`) | `NBA_WORKERS.md` `§T50.4-E`; `NBA_OPEN_ITEMS.md` `T50-21` |
| **UI end-to-end counts and test ids (C0b, C16, C24, C44, C47, C48, C51, D00, D01, D10)** | `nba-main-ui-test` counts 101, 102 (`v1.4.14`), 103 (`v1.4.19`), 104, 105/105 (`v1.4.22`); C0b = deployed VERSION equals repo; C16 re-save replaces; C24 substitutes keep line type; C44 live roster rule; C47 / C48 shown probability on the one number; C51 read-after-write; D00 a started game is left out of the board; D01 browser walk; D10 Slips opens cold | `NBA_WORKERS.md` `§T50.4-E`; `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **read-after-write cache (`v1.4.14`)** | Hyperdrive's query cache served the old unit after a save; fixed with now() on reads and UPDATE ... RETURNING on writes | `NBA_WORKERS.md` `§T50.4-E` |
| **`pg_terminate_backend` (outside kill)** | 10-18 02:01 PT the MLB runners' preflight ended every client connection and killed a replay; MLB shares the database, so NBA sessions use session-level SET only | `NBA_WORKERS.md` `§T50.4-E` |
| **`AR_CAPS` / `audit_season_replay` / `research_streak_replay_score.py` / `integration_test_rollback.py`** | research-only in-process cap override for replays; the scorer reads one replay holding all stake variants | `NBA_WORKERS.md` `§T50.4-E` |
| **error 30040 / `APP_VERSION` / `min_app_build` / `research_fliff_version.py` / `research_fliff_scrape_check.py`** | Fliff "no longer supported": our build 285 was below the server minimum 286 (286, 287, 290 accepted); `scrape_fliff_board.py` uses 286 plus a self-heal raising the build up to 8 steps; check run: 2,366 legs, 75 players, 14 events | `NBA_WORKERS.md` `§T50.4-F` |
| **`fliff-probe.yml` / `fliff_probe/` / `fliff_probe/out/`** | on-demand Fliff probe workflow (input `max_events`, mode, balance, discover_version; steps discover_props, pairs, ladder, bundle, skipper); output only in `fliff_probe/out/`; Pick'Em league id is a string key (`fkey__sk_league__461`) | `NBA_WORKERS.md` `§T50.4-F` |
| **`underdog_login.py` / `underdog_auth.py` / `nba-underdog-login.yml` / `nba-underdog-token-refresh.yml`** | Underdog token machinery (10-21 17:34-17:38 PT): one manual login stores only the refresh token; the refresher (cron 41 3,9,15,21 UTC, random start up to 20 min, limit 30 min) rotates and saves it under a row lock; approved exception to the no-schedule-changes rule | `NBA_WORKERS.md` `§T50.4-F` |
| **`nba-ud-flags-backfill.yml`** | writes `ud_line_flags` from the current Underdog board file for an archived date; no board rows | `NBA_WORKERS.md` `§T50.4-F` |
| **`audit_data_freshness.py` / `grade_board_outcomes.py`** | 10-22 stale-table audit; board-outcome grader (combos, quarters, triple-doubles, name overrides); `player_first_to_score` and dunks are not gradable without a new source | `NBA_WORKERS.md` `§T50.4-F` |
| **`MA_BOOKS`** | config/env of `build_market_anchor.py` (default draftkings) plus a `books` input on the market-anchor workflow (10-20 15:53 PT) | `NBA_WORKERS.md` `§T50.4-F` |
| **`probe_app_slip_pricing.py` / `probe_sleeper_pricing.py` / `probe_sleeper_bundles.py` / `probe_fliff_pickem_quote.py`** | read-only price-quote probes (10-18 to 10-25) for app slip pricing; all app probing runs in Actions, never the owner's Chrome | `NBA_WORKERS.md` `§T50.4-F` |
| **`probe_app_login_flows.py` / `probe_sleeper_login_ops.py`** | 10-25 22:56 PT probe of how Sleeper and Fliff sign a user in from their web apps; 10-26 00:00 PT read-only download of Sleeper's public JavaScript (through `nba-browser-probe.yml`, `PB_MAX` default 900 chunks) printing OP and CTX lines for login, otp, code, verify, passkey, sms, auth, token, session and password operations (779 log lines, success) | `NBA_WORKERS.md` `§T50.4-G`, `§T50.4-Z1` |
| **`APP` / `APP_MODE` (`login` / `refresh`) / `APP_OTP_WAIT_S`** | environment of `app_login.py`: which app (sleeper or fliff), whether to sign in or renew a stored session, and how long to wait for a relayed code (default 900 s; "0" on refresh); real Chrome via SeleniumBase UC with Xvfb, location San Diego, timezone America/Los_Angeles, one persistent device per app | `NBA_WORKERS.md` `§T50.4-G` |
| **`BETR_SESSION_ID` sticky ids (`sleeperauth1` / `fliffauth1`)** | per-app sticky proxy session ids so every run leaves the same residential exit | `NBA_WORKERS.md` `§T50.4-G` |
| **`SESSION_OK` / `LOGIN_CODE_SENT` / `LOGIN_FAIL`** | log tokens of `app_login.py`: stored session valid; the app's code was requested and the worker waits for the relay; failure (for example "no code arrived in time" or, on a scheduled refresh without a password secret, "signed out and no password secret"). If the page does not say a code was sent and no password field exists the wait is capped at 240 s, otherwise the full wait applies | `NBA_WORKERS.md` `§T50.4-G`, `§T50.4-H` |
| **`wait_code`** | the login step that polls the `<app>_otp` row for the relayed code and types it into one-time-code fields | `NBA_WORKERS.md` `§T50.4-G` |
| **`GITHUB_EVENT_PATH` (code from the event file)** | `app_otp.py` reads its `app` and `otp` inputs from the event file, never from step environment; it extracts 4 to 8 digits and upserts `<app>_otp`; job limit 5 minutes. Sleeper itself validates exactly 4 digits | `NBA_WORKERS.md` `§T50.4-G`, `§T50.4-Z1` |
| **`nba-app-token-refresh.yml` schedule** | cron `47 3,9,15,21` UTC (20:47, 02:47, 08:47, 14:47 PT), matrix sleeper and fliff, `max-parallel` 1, job limit 40 minutes, start jitter up to 5 minutes; compare Underdog `41 3,9,15,21` UTC with up to 20 minutes jitter and a 30-minute limit | `NBA_WORKERS.md` `§T50.4-G` |
| **`_scrub` / `_shape` / REQ / ANS lines** | login log helpers (10-25 23:48 PT): scrub emails, long strings and digit runs to tags; show keys and value types only; request lines (method, path, GraphQL operation name, variable names) and answer lines (status, shape) | `NBA_WORKERS.md` `§T50.4-G` |
| **`login_context_by_email_or_phone_or_username` / `has_email` / `has_phone` / `has_passkeys` / `get_code` / `request_password_reset` / `reset_password_with_code` / `verify_user_profile` / `my_passkeys` / `login_via_passkey_start` / `verifyPasskeyStart` / `otpType`** | Sleeper web sign-in operations and fields read from its public bundle (names only): the context query returns `has_email`, `has_password`, `has_passkeys`, `has_phone` and masked contacts; the owner's account is code-only (`has_password` false, `has_passkeys` false, both email and phone true). The name of the auto-fired code-send mutation was NOT read; linking it to `request_password_reset` is an inference | `NBA_WORKERS.md` `§T50.4-G`, `§T50.4-Z1`; `NBA_OPEN_ITEMS.md` `T50-14`, `T50-42` |
| **`hCaptcha` / reCAPTCHA v3 (Sleeper / Fliff)** | Sleeper's login uses hCaptcha (its token travels with the code-send), Fliff's web login sits behind Google reCAPTCHA v3; whether hCaptcha loads under the proxy was the open question at 10-26 00:11 PT | `NBA_WORKERS.md` `§T50.4-H` |
| **log retrieval 404 rule** | the workflow-run log tool answers 404 while a run's job conclusion is still null; wait for completion, then read | `NBA_WORKERS.md` `§T50.4-Z1` |
| **commit blob-hash rule** | after every bridge push the local git blob hash is compared with the returned `file_sha`; every push also starts "AlphaDog v2 Mobile Auto Deploy" and a pages build | `NBA_WORKERS.md` `§T50.4-Z1` |
| **patch-tool dollar-sequence caveat** | replacement text must never contain a dollar sign followed by a quote, backtick, ampersand or another dollar sign; write regexes without the end anchor; docs write USD | `NBA_WORKERS.md` `§T50.4-I` |
| **public repo logging rule** | the repo is PUBLIC so Actions logs are public: never print tokens, passwords, request bodies, page text, names, emails, balances or codes; no entry is ever created or submitted on any app | `NBA_WORKERS.md` `§T50.4-I` |
| **`^(research\|audit)_[a-z0-9_]+\.py`** | name pattern `nba-research-run.yml` enforces on its `script` input; `permissions: contents: read`; commits nothing | `NBA_WORKERS.md` `§T50.4-I` |
| **MLB no-touch rule** | no edits to MLB code (`main.py`, `scrape.yml`, MLB workers, MLB board file, MLB certification-center script, `fliff-board.yml`, the mobile-deploy workers script); NBA sessions use session-level SET only | `NBA_WORKERS.md` `§T50.4-I` |
| **`social-demo-assets.yml` / `social/demo_assets`** | social-account workflow (10-19 16:28 PT) downloading headshots, logos and photos; touches nothing in `nba/` | `NBA_WORKERS.md` `§T50.4-J` |
| **Streak and unit-ramp research scripts** | `research_cap_composition.py`, `research_streak_rotation.py`, `research_streak_signals.py`, `research_streak_followup.py`, `research_streak_replay_score.py` (10-17), `research_portfolio_2usd.py`, `research_portfolio_ramp.py`, `research_ramp_projection.py` (10-18): caps and compositions at equal budget, what to run in a losing stretch, the two signals that agreed in both seasons, portfolio options at a 2 USD unit and with a weekly ramp | `NBA_WORKERS.md` `§T50.4-J` |
| **Grader-v3 script family** | `research_payout_proof.py` (proves slip payouts against PrizePicks' own quotes), `research_pp_power_law_fit.py`, `regrade_pp_payout_v3.py`, `nba-grader-v3-regrade.yml` (18:09), `sql/pp_payout_v3.sql`, `research_grader_v3_impact.py`, `research_grader_v3_parity.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **Altless and derived-props script family** | `research_exhaustive_pp.py`, `research_pp_line_reconstruction.py`, `research_pp_derived_props.py`, `research_altless_strategies.py`, `research_altless_robust.py`, `paper_altless_tracker.py`, `audit_paper_altless_tracker.py`, `research_standard_depth.py`, `audit_alt_less_tiers.py` (10-20) | `NBA_WORKERS.md` `§T50.4-J` |
| **Live-day audit family** | `audit_live_grade_today.py` (grades the day's slips from live box scores with production graders then rolls back), `research_model_market_gap.py`, `research_slip_exposure.py`, `audit_over_minutes_floor.py`, `audit_portfolio_replacements.py`, `audit_data_freshness.py`, `audit_injury_scan_speed.py`, `audit_conf_cutpoints.py`, `audit_jit_benchmark.py`, `audit_ui_board_timing.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **Underdog research family** | `research_ud_user_context.py` (which setup the owner's account gets), `research_line_regime_impact.py`, `research_ud_pricing_regime.py` (2026-27 pricing regime), `research_ud_price_aware.py`, `research_ud_price_robust.py` (is any strategy positive under exchange pricing), `research_ud_payout_probe.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **PrizePicks research family (10-22)** | `research_pp_market_info.py`, `research_pp_market_filter.py`, `research_pp_flex234.py`, `research_pp_flex_payout_proof.py`, `research_pp_flex_payout_overpay.py`, `research_pp_portfolio_mix.py`, `research_pp_today_profile.py`, `research_pp_today_slips.py`, `research_pp_today_nodemon.py`, `research_pp_losing_streaks.py`, `research_pp_demon_value.py`, `research_pp_calibrated_slips.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **Board-profile script family** | `research_pp_board_profiles.py` / `_v2` / `_v3`, `research_board_market_probe.py`, `research_board_day_probe.py`, `research_board_day_signal.py`, `research_board_types.py` / `_slate` / `_r2` / `_r3` / `_r4`, `research_board_leg_context.py`, `research_board_profiles_l1.py` / `_l2.py` / `_l3.py` / `_wf.py`, `research_board_shrink.py`, `research_board_matrix.py`, `research_board_matrix_slips.py` | `NBA_WORKERS.md` `§T50.4-J`, `§T50.4-Z7` |
| **Calibration script family** | `research_calibration_audit.py`, `research_recalibration_v3.py`, `research_day_swings.py`, `research_calibration_layers.py` / `_v2.py`, `research_board_centring_asof.py`, `research_final_chain_asof.py`, `research_final_hp_linegap.py`, `research_final_hp_form.py`, `research_leg_environment.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **One-number workflows** | `nba-board-hp.yml` (retired from P3 10-23), `nba-final-hp-rebuild.yml` (fit plus parallel rebuild by prop), `nba-recert-chain.yml` (full recertification with no live side effects), `nba-final-hp-fast.yml` with `rebuild_final_hp_board.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **Portfolio and final-strategy scripts (10-25)** | `research_final_strategies.py`, `research_portfolio_caps.py` (safe-nine portfolio), `research_portfolio_paths.py` (starting-point path study), `portfolio_b.py` (shared by live pick and parity audit), `audit_portfolio_b_parity.py` (live equals research over 309 history slates), `research_app_final_strategies.py`, `research_app_sleeper_fliff.py`, `research_app_portfolio.py`, `research_app_deep.py`, `research_postseason_program.py` | `NBA_WORKERS.md` `§T50.4-J` |
| **`ST_APP` / `ST_PART` / `ST_SMOKE`** | environment of `research_sleeper_transfer.py`: app (sleeper, fliff, betr), part (hist_ud, hist_pp, live) and smoke test; seven runs were triggered 10-25 22:22 PT and not yet read at 00:11 PT | `NBA_WORKERS.md` `§T50.4-J` |
| **`research_sleeper_hist.py` / `research_sleeper_lowvol.py` / `research_sleeper_deep.py`** | Sleeper research scripts named in the segment (history, low-volume props, deep pass) | `NBA_WORKERS.md` `§T50.4-J` |
| **26 compositions (slip engine)** | `core` (six CORE cells merged by certified edge then `n_rank`), `regular` (ten REGULAR cells), `best` (REGULAR plus DEMONS), `demon`, `mixed_tier`, `core+goblin` (top goblin as fixed extender), `core+demon`, 13 `single:<cell>` (every cell except goblin) and 6 `weighted:<cell>` (first 2 legs of that CORE cell then the merged CORE legs); lists REGULAR = steals_R_U, steals_R, turnovers_R, stocks_R, pts_ast_R, points_R, pra_R_U, blocks_R, pts_reb_R, rebounds_R; POINTSFAM = points_R, pts_ast_R, pra_R_U, pts_reb_R | `NBA_WORKERS.md` `§T50.4-Z2` |
| **`weighted:<cell>` / `single:<cell>` naming** | engine composition names: `weighted:steals_R` = steals_R first two legs then the merged CORE legs; `single:points_R` = only that cell; used in strategy names such as A_wsteals_5flex (weighted steals), A_wrebounds_4flex, C_wstocks_4flex, D_points_3power (single points_R) | `NBA_WORKERS.md` `§T50.4-Z2` |
| **`build_day_slips` / `valid()` / `MAX_PER_CELL` / `SE_CAP`** | per-day builder: de-dupe by player, best 12 legs of a pool, valid = no player twice, at least 2 teams, at most 2 legs per cell family, no pair correlation at or below -0.08; keep top `SE_CAP` (default 10) slips by (tier, diversity, low-foul count, summed edge); tie-break tiers 2 cross-game, 1 same-game with every pair correlation at least +0.05, 0 other | `NBA_WORKERS.md` `§T50.4-Z3` |
| **tie-break tier evidence / `SE_SAMETEAM`** | on 13,500 slips of 4 and 5 picks: cross-game +53 / +48 percent, positive pair +56 / +50, neutral same-game +37 / +17; `SE_SAMETEAM` (same-team pairs +3 percent in droughts, opposing-team -40) is OFF (rejected) | `NBA_WORKERS.md` `§T50.4-Z3` |
| **diversity / low-foul count (`pf20` below 1.8)** | key parts: diversity 1 for a 5-6 pick slip on a broad day (at least 5 families each with 2 or more players, slip spans at least 4 families); low-foul count = legs with `pf20` below 1.8 for sizes 4 and up | `NBA_WORKERS.md` `§T50.4-Z3` |
| **`LS_H7_MODE` / `anchor_h7` / `LS_RED_RELEASE` / `red_release`** | live engine mode sources: anchor_h7 default red (yellow at 2 sigma, red at 3 sigma); red release default p5 (decided 2026-10-16: clean, 10 days); env wins over `classification_config` | `NBA_WORKERS.md` `§T50.4-Z3` |
| **`ROTATION_ONLY` / `ALLSTAR_ONLY` / `RELEASE_CAP` / `SIDE_FILTER_BY_STRATEGY` / `MAX_LINE_BY_STRATEGY`** | code sets of `live_slip_engine.py`: `R_stocks_4power` staked only in the drought state; `W_core_3power` and `W_coredemon_3power` pre-All-Star week only; `B_demon_5flex` and `B_demon_3flex` keep one shadow slip a day when red; `D_points_3power` Under only with points Under line at most 22.5 (Unders at 23.5 and up hit 50 percent against 59 at 11.5-16.5) | `NBA_WORKERS.md` `§T50.4-Z3` |
| **live grade uses the quote** | `live_slip_engine.grade(conn, day)` keeps our grader's number in `payout_model`, then pays the quoted tier for the hit count from the latest status-200 quote (power or flex table) when the slip has no voided leg, 0.0 when the quote has no tier for that count; voided leg or no quote falls back to the grader. Statuses mirror placed to graded (`placed_week2` to `graded_week2`, `placed_shadow` to `graded_shadow`, `placed_capped`, `placed_below_min`, `placed_late`, `placed_post`, `placed_post_shadow`, `placed_week1_skip`, `placed_week2_skip`) | `NBA_WORKERS.md` `§T50.4-Z3` |
| **`edge_exp_payout`** | live-engine expected payout using `ENG.pp_payout` exactly with no same-game term (Poisson-binomial over hit counts); one of the call sites missing the same-game flag (T50-4) | `NBA_WORKERS.md` `§T50.4-Z3`; `NBA_OPEN_ITEMS.md` `T50-4` |
| **`PP_LEAGUE` / `PP_MODE` (full, delta, proof, grid, stack, less, slipq)** | env of `pp_payout_map.py`: league 7 = NBA (default), 3 = WNBA; modes research map, monitoring, proof sections, grid, stack, Less, and slip quotes of engine slips. Research sections VALIDATE (Tatum goblin plus Wembanyama demon must return 2.2), BASE, FLEX, ALTALT, SAMEGAME, UNDER, LEG, DRIFT, LESS; proof sections P_BASE, P_LESS, P_SG, P_D1, P_D2, P_G1, P_GD | `NBA_WORKERS.md` `§T50.4-Z4` |
| **`payouts_srp` / `power_adj` / `flex_adj` / `power_srp` / `flex_srp`** | PrizePicks reversion schedule per quote (`payouts_srp`) and the is_adjusted flags stored as `power_adj` and `flex_adj`; `pp_quote` keeps `power_srp` / `flex_srp`; `power_adj` TRUE marks the lineups where a same-game standard Power was cut (3.0 to 2.9 / 2.8) | `NBA_WORKERS.md` `§T50.4-Z4`; `NBA_MULTIPLIERS.md` `§T50.3` |
| **`pp_payout_map_<utc>.json` / `nba/data/pp_payouts`** | output of the payout mapper; always written; on a captcha it rotates fingerprint, rebuilds the session and retries once, stops after three consecutive blocks | `NBA_WORKERS.md` `§T50.4-Z4` |
| **`PROOF_RUN` / `PROOF_ALL=1`** | env of `research_payout_proof.py`: pick the proof run, or add every earlier BASE, FLEX, MIXED and SAMEGAME quote; an alternate's factor = its 2-pick quote against a standard divided by 3, de-compressed above the 9.1 knee. Its `grader()` builds legs without event ids so same_game is False, the recorded cause of false same-game over-estimates | `NBA_WORKERS.md` `§T50.4-Z4` |
| **`pp_slip_power` / `pp_slip_power_conservative`** | the 09-21 law functions compared in the proof (Power all-hit) with quote and grader | `NBA_WORKERS.md` `§T50.4-Z4` |
| **break-evens 0.55 / 0.536** | per-leg break-even in `research_postseason_program.py`: PrizePicks 0.55 (3-pick Power) and Underdog 0.536 (3-pick Standard, 6.5 to the power -1/3) | `NBA_WORKERS.md` `§T50.4-Z4` |
| **`fliff_probe/` module files** | `fliff_client.py`, `discover.py`, `discover_bundle.py`, `discover_ladder.py`, `discover_props.py`, `discover_skipper.py`, `pairings.py`, `run_probe.py`, `out/` (latest_legs.json, latest_probe.json, latest_pairings.json and .md, history/); self-contained, reads only the credential row | `NBA_WORKERS.md` `§T50.4-Z5` |
| **Fliff feed protocol (`proposals_feed_endpoint`, codes 3054 / 3062, GetLeagues / GetGames / GetPropCategories / GetCards / GetAltCards)** | Ping returns the feed host; Public Feed Sync code 3054 (initial, channel -333 = all) then 3062 (one channel or one event); Pick'Em skipper calls; `GetAltCards` is the full ladder (option type 0 Over, 1 Under); rules: minimum 2 picks from at least 2 teams, multiplier = product of selections, a void in a 2-pick refunds | `NBA_WORKERS.md` `§T50.4-Z5` |
| **`pairings.py` (`NEAR_P`, `GOOD_P_MIN`, `GOOD_M_MIN`, `GOOD_M_MAX`, `SLIP_MIN`, `SLIP_MAX`, `JOINT_MIN`, `LEG_REUSE`, `PROBE_HOURS`)** | Fliff pairing finder: one near-lock (fair p at least `NEAR_P` 0.90) with one good pick (`GOOD_P_MIN` 0.60 up to `NEAR_P`) from different games; probability lower bounds from Pinnacle two-sided no-vig and FanDuel / DraftKings one-sided prices (lo = min(q - 0.03, q / 1.06)); ranked by cost per unit cleared = -EV / min(1, m - 1); `PROBE_HOURS` default 24 | `NBA_WORKERS.md` `§T50.4-Z5` |
| **`nba-ud-slip-engine.yml` / `nba-ud-validate-strategies.yml` / `nba-ud-live.yml` inputs** | manual Underdog workflows: engine (cap 5, sizes 2-8, suffix, minrise_out, min_nv, excl_fresh, excl_center, legs_table, haircut "main,alt", cells_json; group `alphadog-nba-ud-engine-<suffix>`); validator (topk 30, boot 10000, nulls 200, source, snapshot mapped to `SV_TOPK`, `SV_BOOT`, `SV_NULL`, `SV_SOURCE`, `SV_SNAPSHOT`); live (mode pick/grade, date, force mapped to `UDL_MODE`, `UDL_DATE`, `UDL_FORCE`) | `NBA_WORKERS.md` `§T50.4-Z6` |
| **Underdog tables STD / FLEX (`n\|k` keys)** | probe's table under test: STD 2-8 = 3.5, 6.5, 12, 20, 35, 65, 120; FLEX 3\|0 3.25, 3\|1 1.09, 4\|0 7.2, 4\|1 1.4, 5\|0 10, 5\|1 2.5, 6\|0 25, 6\|1 2.6, 6\|2 0.25, 7\|0 40, 7\|1 2.75, 7\|2 0.5, 8\|0 80, 8\|1 3, 8\|2 1 | `NBA_WORKERS.md` `§T50.4-Z6` |
| **Underdog grader consumers** | `build_ud_slip_engine.grade()` used by `ud_edge_monitor_research.py`; `ud_live_slip_engine.payout()` / `grade()` by `verify_ud_live_parity.py`, `validate_ud_edge_monitor.py`, `audit_live_grade_today.py`, `integration_test_rollback.py`, `probe_pick_postseason.py`, `test_nba_main_ui.py`; `research_postseason_program.ud_grade` (imported by `research_playoff_unders.py`, `research_multiplier_value.py`) carries two quirks (Flex left with 2 live picks pays 0; 0.995 / 0.99 discount on m at load) | `NBA_WORKERS.md` `§T50.4-Z6`; `NBA_OPEN_ITEMS.md` `T50-9` |
| **`WF_STEP` / `WF_NULL` / `WF_GRID` / `WARM`** | walk-forward profile script knobs: re-choose every 5 profile slates, 100 null draws, grid 1 / 2 / 3 (96,768 / 36,288 L2 strategies / documented L3 compositions), warm-up 15 earlier slates (fewer than 10 played slates are skipped); own picks = 5 best by mean - sd / sqrt(n) on at least 8 earlier slates | `NBA_WORKERS.md` `§T50.4-Z7` |
| **`SH_*` knobs (`SH_NULL`, `SH_K`, `SH_SLIP_K`, `SH_POOL`, `SH_KNN`, `SH_ONLY_B`, `SH_ONLY_C`, `SH_SHAPES`, `SH_COARSE`, `SH_AGG`) and `MX_TOPK`** | shrink script settings: partial pooling weight w = n / (n + K) over 13 K values (25 to 12,800); reads A (per profile x K), B (the live system with ALL PROFILES, BOARD PROFILES ONLY, CALENDAR ONLY), C (look-alike tilt); slip shapes `spread`, `top`, `pool` (default) | `NBA_WORKERS.md` `§T50.4-Z7` |
| **`MX_K` / `MX_NULL` / `MX.HIST` / `L1_ONE_SEASON` / `L1_AGNOSTIC` / `L1_FIT` / `REAL_HIST` / `SEAS_REAL`** | matrix and Layer 1 wiring: `MX_K` 40 nearest historical slates for LOOK-ALIKE profiles ("LIKE THIS SEASON"), `MX_NULL` 60 nulls; Layer 1 uses halves (H-A, H-B) while per-season breakdowns bind `REAL_HIST`; windows never cross a real season break (`SEAS_REAL`) | `NBA_WORKERS.md` `§T50.4-Z7` |
| **`selector_matrix` / `legs_for` / `build` (matrix slips)** | templates for sizes 2-6, Power all sizes and Flex from 3 (9 structures); `legs_for` reproduces the selector's legs; `build` makes one slip per template, one leg per player, at least 2 teams | `NBA_WORKERS.md` `§T50.4-Z7` |
| **AdminShutdown after Layer 1 / `selfCleanupAfterPhase`** | the MLB runners terminate connections idle over 2 minutes; Layer 1 computes about 25 minutes without a query, so research scripts reopen a connection after `build()` | `NBA_WORKERS.md` `§T50.4-Z7` |
| **"F1 fixed" scope correction** | F1 (too few nulls for BH) is fixed with a parametric p only in `research_board_profiles_wf.py` and `research_board_shrink.py` (`SH_POOL=0`); `research_board_matrix.py` still uses 60 nulls with rank p, so its BH read cannot flag a profile | `NBA_WORKERS.md` `§T50.4-Z7`; `NBA_OPEN_ITEMS.md` `T50-29`, `T50-45` |
| **`power_alt_v3` constants (b / a) and k_n** | 3 picks 5.1492 / 0.9868; 4 picks 9.5795 / 1.0148; 5 picks 17.4639 / 1.0348; 6 picks 32.5230 / 1.0522; k_n is the 10th percentile of quote over law on NBA quotes; fitted on 393 quotes (NBA 277, WNBA 116), residual sd 0.033 to 0.048; mean 0.95 of the quote; maximum overpay +3 / +5 / +7 / +13 percent at 3 / 4 / 5 / 6 picks. Branches: all-standard = table; 2-pick with alternate keeps `compress(3 x fp)`; 3-6 picks `grid_down(b_n x fp^a_n)` | `NBA_MULTIPLIERS.md` `§T50.3.1` |
| **`grid_down`** | rounds a payout DOWN on PrizePicks' grid: 0.1 steps below 3x, 0.25 steps at or above 3x (1e-9 guard) | `NBA_MULTIPLIERS.md` `§T50.3.1`, `§T50.3-Z3` |
| **`flex_alt_tiers` build** | lower envelope of quoted (factor product, payout) points, interpolated in ln(fp), clamped at the ends; built from 917 quote tiers plus 22 probe points; partial tiers nearly flat in fp; a missing rule raises an error. B_demon_3flex was -16 / +31 percent (2024-25 / 2025-26) on these tiers, not the +52 / +90 it certified at (the code comment says -12 / +33; cite the ledger figure) | `NBA_MULTIPLIERS.md` `§T50.3.1`, `§T50.3-Z1` |
| **per-structure break-even leg rates** | 2-pick Flex .618, 2-pick Power .577, 3F .577, 3P .550, 4F .550, 4P .562, 5F .543, 5P .549, 6F .542, 6P .547; 2-pick Flex pays 2x / 0.5x so EV = p^2 + p; every 2-pick Flex rule lost in both seasons (best -3.9 / -3.4 percent) | `NBA_MULTIPLIERS.md` `§T50.3.1` |
| **single-survivor / void reversion** | Power with r legs left pays the r-pick base; Flex with r at least 3 uses the r-pick Flex table; 2 left on a Flex pays 3x Power-style (never 2/0.5); one survivor pays `compress(1.5 x factor)` on a hit; nothing left refunds. 1,120 of 478,900 slips (0.23 percent) are single-survivor. PrizePicks shows the payout of the r LOWEST-factor legs (match 99.5 / 96.6 / 91.3 percent for 2 / 3 / 4 left), so keep-lowest grading is conservative | `NBA_MULTIPLIERS.md` `§T50.3.1`, `§T50.3-Z1` |
| **`pp-leg-v2-sqrt-cap-conservative-floor190`** | `pp_leg_price` version name: tail probability with spread c x sqrt(line) (c about 2.0 points-family, 1.25 rebounds / assists / threes), factor = 0.5 / p; goblin floor factor 0.6333 (1.9x on a 2-pick) whose conservative image (-3 percent) is 0.6143 (1.843x), the "floor 0.614" of the tier map | `NBA_MULTIPLIERS.md` `§T50.3.1`, `§T50.3-Z1` |
| **Less pricing (S 0.99, 1.7x floor, `less_favorite_floor_factor`)** | Less = exact complement of More (S about 0.99) with a 1.7x favourite floor (factor 0.5667); PrizePicks opens Less on near-standard rungs of four stats only (points, PRA, rebounds, assists); archive Less price is 5-15 percent below PrizePicks' own (sums 1.046-1.050 vs 0.980 / 0.989); price-table keys now include side | `NBA_MULTIPLIERS.md` `§T50.3.2`, `§T50.3.3`, `§T50.3-Z1` |
| **544-quote proof (modes `grid` / `stack`)** | 10-20 opening-night proof: `grid` 340 slips with 0-3 alternates incl. Less, `stack` 204 slips of 3-6 picks; grader v3 over quote 0.91-0.97 for Power 3-6; the one overpay is 2-pick Power with an alternate (56 quotes, p10 0.931, max +11 percent, research factor 0.93) | `NBA_MULTIPLIERS.md` `§T50.3.2` |
| **4,236-quote Flex / Power proof (`0r`)** | 10-22 re-pricing of all 4,236 NBA lineups of 2-4 picks: all-standard never above PrizePicks; Flex with goblins or demons is a LOWER bound (2-pick all-hit at or below on 99.1 percent); Power with alternates over-pays on big demon stacks (3-pick fp 15-78 up to +130; `power_alt_v3` not valid above fp about 5) | `NBA_MULTIPLIERS.md` `§T50.3.3` |
| **same-game measurement error** | the "same-game over-estimates" came from `research_payout_proof.py` grading with no `event_id` (so same_game False); 4-Flex 1.20x = 6/5 and 3-Flex one-miss 1.33x = 1/0.75 are exactly what `flex_same_game_v3` pays | `NBA_MULTIPLIERS.md` `§T50.3.4` |
| **SGPOWER round** | 37 NBA quotes (10-21): 2-pick 3.0 x28, 2.9 x6, 2.8 x1; 3-pick 6.0 x23, 5.75 x4; 4-6 picks never adjusted; cuts fall on teammates taken the SAME direction; led to `power_same_game_v3` (2.8 and 5.75) | `NBA_MULTIPLIERS.md` `§T50.3.4` |
| **same-game Flex (3/0.75, 5/1.25)** | `flex_same_game_v3`: all-standard 3-Flex with a same-game pair pays 3/0.75 (was 3/1), 4-Flex 5/1.25 (was 6/1.5); 5- and 6-Flex never adjusted; applied to every such slip (conservative) | `NBA_MULTIPLIERS.md` `§T50.3.4` |
| **same-game order bug (`pp_payout` lines 177-185)** | goblin / demon branches are evaluated before the same-game check, so same-game is ignored whenever a slip has a goblin or demon; `grade()` derives same_game only if every leg has `event_id`; `nbaSameGame` returns false if any leg lacks `event_id` / `game_pk` | `NBA_MULTIPLIERS.md` `§T50.3.4`; `NBA_OPEN_ITEMS.md` `T50-4` |
| **`keep_col`** | input of the regrade workflow naming the column that keeps the old payout (for example `payout_v3_pre_20261021`) | `NBA_MULTIPLIERS.md` `§T50.3.4` |
| **`quote_min_ratio` gate screen text** | Slips screen `v1.4.38` hides every PrizePicks PLAY slip with no quote ("SKIP - waiting for PrizePicks' quote") and all backup and quote-skip slips; `v1.4.37` already hid a slip with a leg no longer on the board; `research_quote_gate_dry.py` dry run 10-22: 0 of 2 pass | `NBA_MULTIPLIERS.md` `§T50.3.5` |
| **Underdog base(n) x product of m** | an entry pays base(n) x PRODUCT of `payout_multiplier` (the modifier, half of Underdog's probability), not the displayed per-pick number; display is per-product (decimal sides 2 x m, fantasy sides about sqrt(3.5) x m); engine legs sit at m 0.6-1.5 | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **Underdog 1.04 constant** | unproven constant (1.040 / 1.039 / 1.039) fitted to ten owner MLB screenshots; engine prices without it (conservative); 38 real entries lack per-pick modifiers | `NBA_MULTIPLIERS.md` `§T50.3.6`; `NBA_OPEN_ITEMS.md` `T50-7` |
| **`/v4/entry_slips/estimate` / `payout_outcome` / `scan_webpack_chunks` / `fee_source`** | Underdog's unauthenticated read-only estimate call (params `options[i][id]`, `options[i][type]=OverUnderOption`, `fee=10`, `fee_source=cash`, product ids, `state_config_id`); Standard = `odds.multiplier`, Flex = `flex.offerings[0].pricing[losses].odds.decimal`; `payout_outcome` returns base tables only; the call was found by scanning the web bundle chunks | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **`odds.fantasy` / `odds.prediction` / UDX / kalshi** | Underdog pick kinds on the CA board (10-21): 640 options fantasy-priced and 1,770 prediction-market contracts (UDX, provider kalshi or udx); an entry with 2+ prediction picks needs a signed-in user; prediction picks price as ordinary picks (4-pick Standard 9.84 = 12 x 0.82) and are not a Flex blocker | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **Flex partial = product of the HIT picks (best case)** | Underdog Flex partial shown in the app is FLEX[n\|k] x the largest product of hit picks' m (median ratio 0.996-0.999); `pricing.js` shows the best case (UI `v1.4.36`) instead of the mean over miss sets | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **Underdog m tiers (R / F1 / F2 / F3 / B1 / B2 / B3)** | R = 1.00, F1 0.90-0.99, F2 0.80-0.89, F3 below 0.80, B1 1.01-1.14, B2 1.15-1.39, B3 1.40 and above; duplicates keep the LOWEST m; fallback m = round(decimal / sqrt(3), 2) | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **Underdog exchange pricing (m = 0.5 x exchange decimal)** | 10-22 `PP_PAYOUT_FINDINGS` `0q`: m x nv mean 0.4666 on 1,152 matched sides; re-priced as m = round(0.465 / nv, 2); fair-odds return about 0.466 per unit of m vs Standard break-even per-leg returns 0.535 / 0.536 / 0.537 / 0.549 / 0.553 (2 to 6 picks) | `NBA_MULTIPLIERS.md` `§T50.3.6`; `NBA_OPEN_ITEMS.md` `T50-6` |
| **Underdog haircuts by path** | postseason research multiplies m by 0.995 for 1.00x legs and 0.99 for priced legs; backtest engine applies `UD_HC_MAIN` / `UD_HC_ALT`; live engine and UI apply none | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **per-leg break-even roots** | PrizePicks 5-Flex 1 / 0.5425 = 1.8433; Underdog 2-Standard 3.5^(1/2) = 1.8708 (53.45 percent), 3-Standard 6.5^(1/3) (53.58), 4-Standard 12^(1/4) (53.73); Sleeper and Fliff root 1 (price already per leg) | `NBA_MULTIPLIERS.md` `§T50.3.6` |
| **Betr operations (`ValidateEntryWithRules`, PERFECT, DYNAMIC, MYSTERY, RACE_TO_PLACE)** | Betr's own pricing query (36 GraphQL operations in `betr-app.bundle.js`); per rule PERFECT (`perfectRegularMultiplier`, `perfectBoostedMultiplier`, `toWin`), DYNAMIC = Flex (`dynamicMultipliers`, `boostedMultipliers`), MYSTERY (2 picks only), RACE_TO_PLACE; query not mutation, `CreateEntry` and `CancelEntry` were never sent | `NBA_MULTIPLIERS.md` `§T50.3.7`, `§T50.3-Z6` |
| **Betr Perfect / Dynamic tables** | Perfect 2-10 picks 3 / 6 / 10 / 20 / 35 / 50 / 100 / 200 / 300; Dynamic 2: 2 / 0.5; 3: 3 / 1; 4: 6 / 1.5; 5: 10 / 2 / 0.4; 6: 20 / 1.5 / 1; 7: 35 / 2 / 1.25; 8: 50 / 2 / 1.5 / 1.25; 9: 100 / 2 / 1.5 / 1.25; 10: 200 / 2 / 1.5 / 1.25 / 1 | `NBA_MULTIPLIERS.md` `§T50.3.7` |
| **`perfect_all_less` / `dynamic_all_less` / `all_less_note` (Betr)** | all-LESS ladders inside `betr_payout_v1`, measured at sizes 2-10: Perfect 2.75 / 5.5 / 9 / 18 / 31.5 / 45 / 90 / 180 / 270; Flex tops 1.75 / 2.75 / 5.5 / 9 / 18 / 31.5 / 45 / 90 / 180; from 5 picks about 0.9x the regular table; applies only when EVERY pick is LESS | `NBA_MULTIPLIERS.md` `§T50.3.7` |
| **Betr tier mixes (EDGE_1..4, BOOSTED, MINI, SUPER, BOOSTED_4)** | EDGE tiers (easier lines) lower the payout (3-pick Perfect one EDGE_1 4.25, EDGE_2 3.75, EDGE_3 3.5, EDGE_4 3.25); boosted tiers raise it (BOOSTED 10, MINI 7, SUPER 15, BOOSTED_4 25); maximum 3-4 picks per tier; 2+ teams | `NBA_MULTIPLIERS.md` `§T50.3.7` |
| **`pay_betr`** | pricer in `research_sleeper_transfer.py` for Betr Perfect and Dynamic, regular and all-LESS, with Betr leg m = 1 | `NBA_MULTIPLIERS.md` `§T50.3.7` |
| **Betr rule ids and `betr_payout_v1` verification** | four entry-rule ids seen 10-18 (PERFECT, DYNAMIC, MYSTERY, RACE_TO_PLACE); `betr_payout_v1` matched Betr's stored quotes 230/230 Perfect and 586/586 Dynamic tiers (per the digest) | `NBA_MULTIPLIERS.md` `§T50.3.7`, `§T50.3-Z6` |
| **Sleeper rules (Max / Flex / size bonus / 100x cap)** | Max = product of per-side multipliers x size bonus (2-pick 1.00, 3-pick x1.0797, 4-pick x1.102); Flex = average of the (n-1)-pick sub-slips each with its own size's bonus; 5+ Flex pays two misses (0.39 / 0.37) which code prices 0; MAX cap 100x; flat overround 12.4 percent on main pairs (model m = round(1 / (1.1238 p), 2)), 17-56 percent on the Over-only alternate ladder | `NBA_MULTIPLIERS.md` `§T50.3.8`; `NBA_OPEN_ITEMS.md` `T50-11`, `T50-12` |
| **`slip_haircut` / `slip_haircut_mlb_observed`** | `sleeper_payout` haircut now 0.0 after the 10-09 proof (MLB range kept as `slip_haircut_mlb_observed`); `nba_market.sleeper_slip_payout` Power = product x (1 - haircut), Flex = round-robin mean | `NBA_MULTIPLIERS.md` `§T50.3.8` |
| **Sleeper help-centre statement and `probe_sleeper_payout_config.py`** | help centre gives no formula (Flex has a one-miss payout from 3 picks and a two-miss payout from 5; minimum Flex 1.25x); the probe searched endpoints and bundles for a machine-readable rule and found none | `NBA_MULTIPLIERS.md` `§T50.3-Z6` |
| **PicksVS pool rules** | guaranteed payout = entry x VS Score plus pool prize; Regular pools up to 5,000 entries pay 100x to the top VS Score; Intermediate / Beginner pools of 20 entries pay 3x (maximum USD 1); higher of the two paid; one user at most 5 percent of a pool; "ez Pick" (1.0x, minimum entry 1.25x) lets an entry use one team; pool prize worth at most 100 / pool size of the fee | `NBA_MULTIPLIERS.md` `§T50.3.8` |
| **Fliff Pick'Em rules (skipper feed)** | per-selection multipliers public in the skipper feed (eu_odds about 1.80 / 1.85, about 9.6 percent margin); product of selections, minimum 2 picks from at least 2 teams; Flex allows 1 loss, SuperFlex 2 (amounts unknown); a void in one game voids every selection from that game; quote calls private; "Parlay Plus" quote needs a login | `NBA_MULTIPLIERS.md` `§T50.3.9` |
| **Fliff sportsbook m (`board.js` conversion)** | m = 1 / (1.0904 p); `main_ui/board.js` converts American odds to decimal per side and treats the slip as the product with break-even min(0.99, 1/decimal); no Fliff slip grader exists in `nba/`; no Fliff multiplier has been checked in the app | `NBA_MULTIPLIERS.md` `§T50.3.9` |
| **grader v3 effect per strategy (`research_grader_v3_impact.py`)** | ROI 2024-25 / 2025-26 before to after: A_regular_5power +51.7 / +126.3 to +67.7 / +153.2; A_wsteals_5flex +56.2 / +94.5 to +53.3 / +86.9; A_wrebounds_4flex +42.6 / +81.8 to +41.6 / +77.5; A_core_3power +34.4 / +90.9 to +31.0 / +90.9; C_wstocks_4flex +26.1 / +42.7 to +23.5 / +40.3; D_points_3power unchanged; W_core_3power +15.4 / +42.5 to +1.5 / +23.2; W_coredemon_3power -4.4 / +17.5 to -16.8 / -0.8 | `NBA_MULTIPLIERS.md` `§T50.3-Z3` |
| **help-centre tables (stale)** | PrizePicks help figures 3-pick Power 5x, 3-Flex 2.25/1.25, 4-Flex 5/1.5 are stale or state-specific; the 10-18 proof settled the owner's session at 64 of 64 quotes on 3/1 and 6/1.5; validate against the multiplier locked at submission | `NBA_MULTIPLIERS.md` `§T50.3.4`, `§T50.3-Z2` |
| **PrizePicks Core mode / Team picks** | agent-read: Core mode scores a correct pick 1 point, Demon 1.05, Goblin 0.95; Team plus Player lineups are Power only, at most 6 picks, at least 2 player picks from two teams, no Profit Boosts or Protected Plays | `NBA_MULTIPLIERS.md` `§T50.3-Z2` |
| **2-pick tier cut points / Flex grid** | Tier cut points on 2-pick Power 2.40x (99 percent reliable), 8.00x (84), 12.00x (68), 19.00x (92), 25.50x (80); Flex grid 0.1 steps 1.2-2.0, 0.2 to 4.0, then 4.5, 5.0, whole 5-12, then 14, 16, 22; Flex EV targets 0.7712 (0.5 tier) and 0.7410 (0.25 tier); Power EV 0.748 | `NBA_MULTIPLIERS.md` `§T50.3-Z2` |
| **standards backtest (2026-09-21)** | standard legs only, one leg per player per night: threshold 1.30 3-pick +10.3 / +23.5 percent, 1.40 3-pick +17.6 / +32.1, 1.40 4-pick +18.1 / +28.1, 1.40 2-pick +2.3 / +9.7 (2024-25 / 2025-26); stale-line and minutes-leak checks ruled out; an upper bound not confirmed on live data (T50-44) | `NBA_MULTIPLIERS.md` `§T50.3-Z2`; `NBA_OPEN_ITEMS.md` `T50-44` |
| **Underdog market-free twin vs certified P5** | ROI ratios certified to twin: P5 0.84 to 0.60 / 0.89 to 0.78 (2024-25 / 2025-26); the 6-Flex slot loses its 2024-25 lower bound on the twin (82 slips); certified build `_dlt_orig2` +89 / +76 percent 2025-26 (net +464 / +399 units), 2024-25 +84 / +72; P4 shadow +83 / +71 and +97 / +92; P5 loses on 59 percent of days, max drawdown 44 to 48 units | `NBA_MULTIPLIERS.md` `§T50.3-Z5` |
| **cross-app multiplier-value program (ledger 31aa)** | Pick6's multiplier is a payout modifier like Underdog's (0.5x to 46.6x); hit-rate maps calibrate on PrizePicks and Pick6 but NOT on Underdog's lines; PrizePicks certified legs priced with Underdog's multiplier hit only 0.536 / 0.552 vs about 0.60; m-star gate on 2026-04-10 passes 10 of 12 legs at 1.048 | `NBA_MULTIPLIERS.md` `§T50.3-Z5` |
| **edge-monitor power facts** | Underdog P5: 1,025 staked slips; power at looks 30 / 60 / 90 / 120: certified edge confirmed 54 / 84 / 94 / 98 percent; at break-even at most 6 percent false confirm and 5 percent false alarm; PrizePicks: independence break-even -9.24 pp; anytime-valid PrPl-EB sequence REJECTED (too conservative); adopted group-sequential test every 30 slates with Newey-West z | `NBA_MULTIPLIERS.md` `§T50.3-Z4` |
| **who computes what** | PrizePicks quotes from PrizePicks' own server via `pp_payout_map.py`; grading by `build_slip_engine.grade` and its DB twin `pp_slip_payout_v3`, mirrored by `pricing.js`; Underdog by `build_ud_slip_engine.grade()` (backtest) and `ud_live_slip_engine.payout()` (live); Betr by its own server; Sleeper from owner screens (sizes 2-4 verified); Fliff Pick'Em unmapped | `NBA_MULTIPLIERS.md` `§T50.3-Z6` |
| **goblin Less / demon Less (naming trap)** | PrizePicks names a Less alternate by its rung (`pp_mined_leg`): goblin Less = a line BELOW the standard (hard Under, about 1.45x to 2.5x), demon Less = a line ABOVE the standard (easy Under, about 0.80x); the archive (`pp_leg_price`, four-way rule) names the same leg by difficulty, the opposite word. Research live labels flipped to the rung convention on 10-22 (history label UG = Under on a goblin rung, UD = demon rung) | `NBA_GOBLIN_DEMON.md` `§T50.2.1` |
| **Less opening on 10-20 (671 goblin / 636 demon rungs)** | the 10-20 board opened Less on 671 goblin and 636 demon rungs; 165 standard lines stayed More-only; only Points, PRA, Rebounds, Assists; only near-standard rungs (More probability about 0.30 to 0.70, 500 rungs measured). First archived Less rows are the 10-21 board (1,307: points 387, rebounds 344, PRA 312, assists 261, steals and blocks 3) | `NBA_GOBLIN_DEMON.md` `§T50.2.1` |
| **`PP_MODE=less` pair check** | 75 fresh More/Less pairs: P(More) + P(Less) = S median 0.991 (range 0.949 to 1.005); 9 of 75 at the 1.7x floor; research price fq = model More factor x quote lift (goblins 1/0.954, demons 1/0.946, 257 legs), p_less = 0.99 - p_over, factor = 0.97 x 0.5 / p_less unless at the floor | `NBA_GOBLIN_DEMON.md` `§T50.2.1` |
| **PrizePicks does not price our view** | across 215 legs the quoted probability correlates 0.91 to 0.97 with our price model and moves only 0.02-0.03 of price per unit of disagreement, so a model selection edge is not priced away | `NBA_GOBLIN_DEMON.md` `§T50.2.1` |
| **blind Less (goblin vs demon)** | about 186,000 Less-open rungs of both seasons: blind goblin Less priced More 0.65 and realized 0.65 (no edge); blind demon Less realized More 0.31 to 0.39 vs priced 0.34 to 0.42 (about 3 points better); history offered no Less, so every Less backtest simulates the open set | `NBA_GOBLIN_DEMON.md` `§T50.2.1` |
| **`EX_ALT_LESS=1` exhaustive search** | 10-20 15:17 PT `research_exhaustive_pp.py` with alternate Less: 18,551 patterns x 2 structures, 9,909 of 37,102 positive both ways, but choosing the best on one season turns +190 to +470 percent in sample into -1 to -53 out of sample; rejected as a selector | `NBA_GOBLIN_DEMON.md` `§T50.2.3` |
| **fixed rule families A / B / C / D (`research_altless_strategies.py`)** | A pool in {UG, UD, UG+UD} with depth rmin <= N (1, 2, 3, 5, 10); B ordered by the other season's cell value; C mixed with 1 or 2 standard Unders; D volume (two disjoint slips a day); one leg per player, at most 2 per game, at least 2 teams, final 7 days out. Held in both seasons: 5 picks of goblin plus demon Less at depth N 1-3 (Power +97 / +89 and +126 / +71, Flex +60 / +58 and +64 / +50) with bootstrap 5th percentile below 0 (Power pays about 4 percent of days) | `NBA_GOBLIN_DEMON.md` `§T50.2.3` |
| **open-set fragility** | `research_altless_robust.py`: a 5-pick rule moves from +106 to -41 percent from the assumption about which rungs are open alone, so the open set must be recorded forward | `NBA_GOBLIN_DEMON.md` `§T50.2.3` |
| **`AL_*` / `SR_*` rule details** | AL: Points, PRA, Rebounds, Assists tiers 1-3, legs only where the window board opened Less, depth rmin <= 2 by reverse rank, price from the Less law, sizes 2-6, only games not yet tipped. SR: 9 standard 5/6-Flex rules of 585 with bootstrap LB5 above 0 in both seasons (for example baseline_hp both top 2 6F +90.8 / +78.8, Under top 3 6F +69.4 / +70.2); audit passed on four dates (908/908 and 772/772 standard legs, 4,113/4,113 stat expressions) | `NBA_GOBLIN_DEMON.md` `§T50.2.4` |
| **live engine keeps alternate Less out** | `live_slip_engine` BOARD_SQL excludes alternate Less legs (NOT kind <> standard AND side Under) from the certified cells (explicit from 2026-10-20 15:34 PT); alternate Less has no graded history for `board_hp` | `NBA_GOBLIN_DEMON.md` `§T50.2.4` |
| **tier-audit defects 1 and 2 / `audit_alt_less_tiers.py` / AUDIT_PASS** | see the 767-More-rows incident: anchor from More rungs only; side-aware `pp_refresh_prices()` (md5 396b10f9 equals the reviewed source); More rows 7,225 of 7,225 identical, Less rows 454 goblin above / 505 demon below / 20 no anchor | `NBA_GOBLIN_DEMON.md` `§T50.2.5` |
| **L3 false alarm** | `certify_slip_system` L3 read every Less goblin and demon as a tier sign error (559 and 594 rows); made side-aware, run 83 checks 0 FAIL | `NBA_GOBLIN_DEMON.md` `§T50.2.5` |
| **pulled-leg incident (10-21, Keyonte George Turnovers 2.5)** | a REGULAR line in the 13:19 PT window capture became a DEMON, More only, at the 13:30 PT quote; all 17 PrizePicks slips carried it as a regular Less so every quote was unmapped; UI `v1.4.34` shows such a slip in red; `v1.4.37` made a pulled-leg slip never PLAY; pre-publish recheck still owed (T50-20). Recurred on 10-25 (Daniss Jenkins Turnovers Over 1.5: 3 of 6 Portfolio B slips skipped) | `NBA_GOBLIN_DEMON.md` `§T50.2.6`; `NBA_OPEN_ITEMS.md` `T50-20` |
| **goblin substitute bug (`v1.4.33`)** | the backup pool was ranked by hit probability alone so the first substitute was nearly always a goblin (factor below 1); now +EV legs ranked by edge over each leg's OWN break-even, same line type first, never the opposite side of a player already used; test C24 rewritten | `NBA_GOBLIN_DEMON.md` `§T50.2.7` |
| **demon value scripts (ANY / MAX1 / NONE)** | `research_pp_demon_value.py` rule on demon legs (ANY, at most one, NONE) at 2 and 4 slips a day and `research_pp_today_nodemon.py` (today's slips with no demon, 15:13 PT 10-22); verdict numbers not in the sources read | `NBA_GOBLIN_DEMON.md` `§T50.2.8` |
| **demons in 2-slip portfolio (10-22 14:38 PT)** | `PORTFOLIO_UNITS` order threes_D1 4-Flex, assists_D1 4-Flex (steals-free pool), rebounds_R 4-Flex, stocks_R 4-Flex, single points_R 3-Power, rebounds_R 3-Power; 2 slips a day, leg cap 2; +49.0 / +56.3 percent ROI, drawdown 21 / 11 units; `weighted:threes_D1` 4-Flex cap 2 +41.1 / +68.8 (live 4 slips +262 percent); `weighted:assists_D1` +48.0 / +44.1; both hold 4 of 4 halves | `NBA_GOBLIN_DEMON.md` `§T50.2.8` |
| **demon calibration trap** | legs with final_hp at or above 0.58 hit 39.2 / 43.4 percent on demons (gap +0.19 / +0.18) while goblins were calibrated (70.8 / 69.4 percent, gap -0.017 / -0.005) | `NBA_GOBLIN_DEMON.md` `§T50.2.8` |
| **`P_B9_6flex` (the one demon unit of Portfolio B)** | 6-Flex unit R + demon, low-volume, EV at least 0.62, 2 per game, skip-top; Portfolio B backtest +92 percent (+82 / +101), max drawdown 15.0 units, 3.04 slips a day; other B units are regular line | `NBA_GOBLIN_DEMON.md` `§T50.2.8` |
| **`P_wrebounds_4flex` + `P_cal_r70_3power` portfolio (10-23)** | standard lines of the 12 calibrated props with final_hp at or above 0.70; holds no demon | `NBA_GOBLIN_DEMON.md` `§T50.2.8` |
| **conservative margins (goblin -3 percent, demon -7, beyond evidence -17)** | simulated lines move against the pick, slip payouts are cut and rounded down; fantasy score priced separately (goblin 2.3x, demon 4.5-4.75x, priced 2.2 / 4.0) | `NBA_GOBLIN_DEMON.md` `§T50.2.10` |
| **goblin as leg class** | standalone negative (all-goblin 3-pick Power -86.2 percent); two goblins hurt every structure; as a 5th-leg extender the gain shrank from +148 to +51-55 percent under compression; goblin factors average G1 0.756, G2 0.698, G3 0.661 (range 0.614-0.934, universe 0.724), about p x m 0.50 by design versus the 0.55 per-leg bar | `NBA_GOBLIN_DEMON.md` `§T50.2.10`, `§T50.2-Z1` |
| **demon price taxonomy (D1 / D2 / D3 vs T+1 / T+2 / T+3)** | system tier map (910,513 legs) demon prices average D1 1.44x, D2 1.71x, D3 2.43x (max 5.76x); the break-even factors 1.48x / 2.30x / 3.31x belong to the offset tiers T+1 / T+2 / T+3, a different taxonomy; the old "ceiling 1.75-1.9x" claim is struck | `NBA_GOBLIN_DEMON.md` `§T50.2.10`, `§T50.2-Z1` |
| **leg populations (standard / goblin / demon)** | standard 359,147 legs at 48.8 percent, goblin 274,632 at 66.3, demon 402,127 at 24.4; EV per cell = sum of w_i x p_i x m_i, never p-bar x m-bar | `NBA_GOBLIN_DEMON.md` `§T50.2.10` |
| **"order right, level wrong" (demons)** | the demon order against the same player's standard More is kept; the demon top-end gap grows with distance from the standard (D3 at +1 to +3: gap +0.31); our disagreement with the board counts against the leg | `NBA_GOBLIN_DEMON.md` `§T50.2.11` |
| **honest pools after calibration** | legs at or above 0.58: demons D1-D3 5,647 legs at 0.33-0.45 shrink to 23; goblins G1 85,952 at 0.669 to 104,476 at 0.657, G2 51,674 at 0.714 to 67,624 at 0.698, G3 22,050 at 0.752 to 26,203 at 0.744; standard-line AUC stays 0.53-0.54 | `NBA_GOBLIN_DEMON.md` `§T50.2.11` |
| **goblin / demon Over leak** | Overs on goblin or demon lines over-estimated in both seasons (combos and points Over goblins on a back-to-back -0.024 to -0.040; threes Over demons Dec-Jan; assists Over demons on low totals; points Over demons as an 8+ favourite); only 8 of 352 cells consistent in both seasons | `NBA_GOBLIN_DEMON.md` `§T50.2.11` |
| **derived-prop season-start corrections** | `research_pp_derived_props.py`: points 1.086, PRA 1.078, turnovers 1.115, rebounds 1.021, threes 1.033; corrected Under rates fouls 0.63-0.66, free throws made 0.58-0.60, fantasy 0.54; hypotheses on 11-30 live lines each | `NBA_GOBLIN_DEMON.md` `§T50.2.12` |
| **section 23a rule (certified table is the source)** | every quoted number comes from the certified table, never the candidate matrix: first certified cell steals R Under score top 1, 2025-26: 149 days, hit 0.691, 69 percent of days above break-even, +88 USD per 100 USD of 3-pick Power (the matrix said 73 percent / +126 on 128 days) | `NBA_GOBLIN_DEMON.md` `§T50.2-Z1` |
| **goblin extender table (section 23b)** | 150 real days, four Regular legs plus the top goblin: A 5 Regular 5-Flex +103 percent / 39 percent of days; B 4R+1G 5-Flex +65 / 47; C 3R+2G +23 / 24; D 4R+1G 5-Power +148 / 20; E 4R 4-Power +109 / 22; F 3R+1G 4-Power +62 / 26; G 3R 3-Power +67 / 29 | `NBA_GOBLIN_DEMON.md` `§T50.2-Z1` |
| **final-HP cell classes (GOLD / inconstant / 2025-26 only / dropped)** | over all 59 cells: GOLD 9 (all Regular), above break-even both seasons but inconstant 9, 2025-26 only 13, held for signals 21, dropped 7; corrected gold bands (peak n, hit, margin): steals R 2 / 0.661 / +0.111; pts_reb R 1 / 0.660 / +0.110; turnovers R 2 / 0.654 / +0.104; pts_ast R 1 / 0.647 / +0.097; points R 3 / 0.624 / +0.074; PRA R 2 / 0.620 / +0.070; stocks R 3 / 0.616 / +0.066; blocks R 1 / 0.588 / +0.038; rebounds R 6 / 0.578; reb_ast R 4 / 0.577 | `NBA_GOBLIN_DEMON.md` `§T50.2-Z2` |
| **section 24a certified ledger** | expected USD per 100 USD of 3-pick Power from a cell alone (6x with 0.95 haircut): steals R Under top 1 hit 0.691 / 69 percent days / +88 (2024-25 stress: 0.541 / 54 / -10); threes D1 top 2 0.631 / 73 / +43; rebounds D3 top 3 0.606 / 60 / +27 (then 0.387 / -67); demon bands inconstant (41-51 percent of days) | `NBA_GOBLIN_DEMON.md` `§T50.2-Z1`, `§T50.2-Z2` |
| **demon break-even moves between seasons** | PrizePicks lowered demon payouts as ladders expanded (points D1 1.46 to 1.22, rebounds D2 2.29 to 2.02), Regular stays 1.00, goblins about flat, so the live gate must re-read tier prices | `NBA_GOBLIN_DEMON.md` `§T50.2-Z2` |
| **ladder families A / B / C / D** | A formula ladders (Points, Rebounds, Assists, 3PM, PRA, P+R, P+A, R+A; price capped 18.5x); B fixed three-rung (Fantasy Score, FG Attempted, 3-PT Attempted); C alternates only with no standard (Turnovers, Blks+Stls, Offensive Rebounds); D standard only with factor 1 (FT made / attempted, FG made, defensive rebounds, two-player combos) | `NBA_GOBLIN_DEMON.md` `§T50.2-Z2` |
| **market anchor (`hp_market_anchor`, `build_market_anchor.py`, `apply_market_anchor.py`)** | the market-anchored hit probability: logit p = a + b logit(final_hp) + c logit(q) with q = 0.5 on standard lines and 1/(2 x factor) on alternates, fitted by `build_market_anchor.py` (parameters in `classification_config['hp_market_anchor']`) and written by `apply_market_anchor.py` to `board_true_hp`; certified 2026-10-15, UNCERTIFIED on the 10-20 data (T50-1); a leg with no anchor gets its own slope `x_none`; P3 soft step `soft_mahp` keeps it current (coverage step fails below 99 percent of the slate) | `NBA_BASELINE_CALIBRATION.md` `§T50.5`; `NBA_OPEN_ITEMS.md` `T50-1` |
| **sub-group bar (5 points)** | the market anchor's report-only gate: every sub-group (side x book x prop x band) must be within 5 points of its hit rate; DraftKings-only FAILS at worst -7.4 / +7.0 points (Under assists / Under threes), DraftKings plus Bovada at -6.7 / +6.1; log-loss still improves 0.633 to 0.617 and 0.667 to 0.649; sub-groups at least as close as raw: 69 of 79 and 64 of 77 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **C48 window fallback** | test C48 (shown probability against hit rate on anchored graded legs) is empty on opening night, so its window falls back to the latest graded anchored stretch (ending 2026-04-13: 0.543 / 0.544 on 39,000, 0.652 / 0.665 on 17,461, 0.735 / 0.751 on 8,524) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **Betr as corroborating book** | Betr changed `final_hp` on 0 legs but moved confidence and score on 2,052 of 7,036 non-Betr legs (29 percent; mean absolute score shift 0.4-0.7, max 2.9) because Betr counts in `f_books`; on 1,062 shared legs the `final_hp` difference is exactly 0 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **model vs market gap read (`research_model_market_gap.py`)** | model at least 0.80 and gap at least 0.20: hit 0.545 (2024-25, model 0.844, anchored 0.606) and 0.601 (2025-26); gap below 0 hit about 0.70; PrizePicks' per-leg price barely reacts to our model (slope 0.02-0.03); a blanket gap cap is NOT supported on certified cells | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **season-start correction `s = r_hist / r_live`** | points 1.086, PRA 1.078, turnovers 1.115, rebounds 1.021, threes 1.033; corrected Under rates fouls 0.63-0.66 (borrows turnovers s), free throws made 0.58-0.60, fantasy 0.54, FTA / 3PA 0.52-0.55, FG made Over 0.54; standard-line reconstruction from box scores: same result 97-98 percent steals / blocks / stocks, about 92 threes / turnovers / points, 83-85 rebounds / assists / combos | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **calibration audit ids L-1..L-5** | L-1 `final_hp` too spread on every line type (standard 2025-26: 0.26 to 0.43, 0.80 to 0.576); L-2 the error is already in `baseline_hp`; L-3 demon order vs the same player's standard More is kept; L-4 demon top-end gap grows with distance from the standard (D3 at +1-3: +0.31); L-5 `ladder_calibration_asof` is keyed (prop, phase, baseline band, side) so it is blind to line type and rung | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **calibration layer ids C-1..C-4 / `research_calibration_layers.py`** | where the error is made: our projected mean is worse than PrizePicks' line (MAE points 5.30 vs 5.04, rebounds 2.35 vs 2.31, assists 2.02 vs 1.95); earned weight of our disagreement w +0.03..+0.12 (points, rebounds, assists, turnovers), +0.33..+0.46 (blocks, steals); standard-line AUC 0.53-0.54 before and after any calibration | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **staged fix L1 / L2 / L3 (`research_recalibration_v3.py`)** | L1 board-centred ladder; L2 spread per line type x side; L3 anchored residual per prop x line type x side, cell shrunk to line type x side with K 400; every stage passes leave-one-month-out 14/14; pooled log-loss raw 0.6320, Platt 0.6167, anchored 0.6137, isotonic 0.6172; standard calibration error 0.059 to 0.008; after it only about 2 percent of standard legs are at least .58 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **walk-forward centring (`research_board_centring_asof.py`)** | past legs only, month by month: 12/12 months, 0.6443 to 0.6262 (ledger) or 0.6267 (BOARD_LEARNINGS C-5); opener 2025-10 0.6657 to 0.6310; L1 carries almost all, L2 plus L3 add 0.0005; stable L1 weights w: points / rebounds / assists 0.2-0.3, threes 0.1-0.3, combos 0.1-0.3, steals / blocks / turnovers 1.0, stocks 0.2-1.0 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`soft_boardhp`** | the retired P3 soft step that scored `board_hp` after the pick (retired 10-23 00:46 PT); at first nothing read `board_hp` ("leave the slips as is for now") | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`board_hp` mean vs hit per line type** | R Over 0.492 / 0.488; R Under 0.508 / 0.512; G1 0.629 / 0.631; G2 0.697 / 0.696; G3 0.747 / 0.744; D1 0.324 / 0.319; D2 0.296 / 0.281; D3 0.199 / 0.190; alternate Less legs had no graded history so L1 only | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **honest numbers (legs at or above .58)** | standard Over 20,117 legs hit 0.537 to 553 legs hit 0.588; standard Under 28,764 at 0.548 to 3,664 at 0.566; demons D1-D3 5,647 legs at 0.33-0.45 to 23 legs; goblins G1 0.669 to 0.657, G2 0.714 to 0.698, G3 0.752 to 0.744 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`research_day_swings.py` (day-to-day swings)** | luck with independent legs explains 34-44 percent of day-to-day variance of the at-least-.58 standard hit rate (goblins 17-52, demons 37); game environment explains another 14-27 percent (corr +0.40..+0.58) but is known only after tip; no streaks (lag-1 and lag-2 autocorrelation within chance); a 35 percent day vs a 78 percent day is mostly amplified variance | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **`final_hp` board-centred: line type derivation and N-1..N-6** | line type derived from the line vs the standard line (71.5 percent equal to PrizePicks' label); N-1 `final_hp` at least 0.70 is a SMALL pool (0-5 legs on most slates; 80-100 slates a season make a 3-leg slip; big props almost never reach 0.70: points 21 legs, rebounds 0, threes 0); N-5 props outside the 12 calibrated keep the as-of number so cross-prop ranking stays inside `final_hp_board_cal.PROPS`; N-6 a ladder listed in a book's main market is left out of the books median (`audit_one_number`) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **calibrated unit effects N-2..N-4** | rebounds 4-Flex plus calibrated 3-Power lb5 +24.9 / +47.2 vs production +22.5 / +37.5; `weighted:rebounds_R` 4-Flex alone +60.5 / +101.0 percent; a unit switch per crude board profile chosen on one season loses on the other; slates of 4 games or fewer lose for nearly every calibrated unit | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **open questions Q-1..Q-4** | (BOARD_LEARNINGS section 4) re-run the day signal study on the calibrated number; reverse-engineer strong days on residuals; measure same-player and same-game correlation directly; grade alternate Less legs live and fit their own L2 / L3 cells | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **round-1 test design T-1 / leak rule T-4 / timing gap T-8 / soft-step timeout T-12** | BOARD_LEARNINGS ids: T-1 residual vs the season's side x line type baseline, z clustered by slate, at least 20 days, BH q below 0.05 in each season; T-4 the 'close' snapshot is tip time (after the pick), any books factor must use 'window' or earlier (a round-1 gap of +0.069 / +0.053 halved to +0.028 / +0.023 on window); T-8 the historical window snapshot (about 14:40 PT) vs live pick (about 13:15 PT) gives backtests about 85 minutes more news; T-12 soft steps can time out silently on big slates | `NBA_BASELINE_CALIBRATION.md` `§T50.5`; `NBA_WORKERS.md` `§T50.4-C` |
| **rounds 1-3 board types (`research_board_types*.py`)** | about 110 pre-pick factors, then about 40 new, then about 137 in one model (ridge and gradient boosting); only two survive cross-fit: books-vs-PrizePicks line gap and last-5-vs-line interaction; line gap as a layer (`research_final_hp_linegap.py`) and form as a layer (`research_final_hp_form.py`) are NOT ADOPTED (do not pass both ways; form lowers live pair units 162.8 to 157.5 and 232.5 to 220.1) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **slate types / small-slate rule** | slates of 4 games or fewer lose; 9 or more games with few back-to-backs is where long calibrated slips (5-6 picks) earn; one-feature board rules over-fit (0 of about 2,100 held both ways); candidate R1 strong-board 6-Flex swap (+9.3 / +64.3 units) tracked on 2026-27 C1 slates, not live | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **profile power read (planted edge)** | slip-level per-profile selection over about 100k strategies is BLIND: a planted profile-only edge of +60 / +100 percent ROI a slip was picked 0 percent of the time, so every "no profile beats global" slip read is uninformative, not negative | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **corrected per-profile leg tilt (shifted-mask null)** | 13 of 435 profiles pass BH; 44 at p below 0.05 vs about 22 by chance; margins +6..+18 points a leg (P218 `str_WW` low +17.9; P348 +12.3; P346 / P221 about +9.7); leg-level recalibration by profile gives no usable gain | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **holdout verdict 2026-10-25 00:10 PT** | profiles built on 2024-25 only: 17 trusted profiles (+11..+15 points a leg in 2024-25) made -1.8 points a leg in 2025-26 (6 of 17 positive); all 258 profiles -0.04; both-season profiles: 26 trusted, -4.9 later (7 of 26 positive); no per-profile probability layer is built | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **recency window test** | a global choice made on the last 20 / 40 / 60 / 90 / 120 / 180 slates does not beat all-history (best +0.8, 95 percent interval -1.5..+3.4) | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **audit F1 / F2 / F3 / F4 / F5 (board-profile search code)** | auditor's findings of 10-24: F1 too few null draws for BH (at 100 nulls about 43 profiles at the floor p are needed, 60 nulls about 70, 30 nulls about 136), F2 partial pooling reorders only the global top 300, F3 tilt divided by the profile count, F4 own top-5 re-chosen only every STEP slates while global every slate, F5 minimum 30 legs / 8 slates penalises narrow cuts; F1 to F3 corrected per COMPASS 181 with the F1 scope limited to `research_board_shrink.py` and `research_board_profiles_wf.py` | `NBA_BASELINE_CALIBRATION.md` `§T50.5`, `§T50.5-Z1`; `NBA_OPEN_ITEMS.md` `T50-29`, `T50-45` |
| **`knn_system` / `lookalike_profiles`** | look-alike code: `knn_system` (shrink line 204) compares rows with missing features only on shared columns (still open); `lookalike_profiles` (matrix line 277) drops every historical slate with any missing value in the ALL family | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z1` |
| **`shifted` (shifted-mask null)** | `research_board_shrink.py` line 137 rolls the profile mask by a random shift of 1 to D-1, keeping the profile's size and run structure, so a gain from recency alone counts as noise (stricter than the random-slate-set null) | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z1` |
| **BH table (424 profiles, q 0.10)** | synthetic check: with 30 nulls nothing passes until 140 profiles sit at the floor; with 60 nulls 70 at the floor pass; with 100 nulls 70 pass and 40 give 0 | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z1` |
| **Sleeper accuracy (COMPASS 185)** | on 14,489 graded window legs of 10-20 to 10-24 `final_hp` is LESS accurate than the market on Sleeper's lines (log-loss 0.696 vs 0.686); blends give `hp` about 10 percent weight; Sleeper main p x price at least 1.05: -11.3 percent on 663 legs; Fliff -6.6 percent on 939 | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **low-volume Over underestimate flag** | opening week `final_hp` under-states low-volume Overs: blocks 0.5 Over 0.308 vs hit 0.390; steals 0.5 Over 0.521 vs 0.614; opposite sign to the standard-line overconfidence; flagged for PrizePicks Portfolio B only (T50-26) | `NBA_BASELINE_CALIBRATION.md` `§T50.5`; `NBA_OPEN_ITEMS.md` `T50-26` |
| **`over_minutes_floor` replay results** | `{enabled true, min_avg 22, games 10}` deployed 10-21 03:25 PT; production replays: 2025-26 ROI 85.3 to 88.4 percent, max drawdown 73.0 to 49.7; 2024-25 33.5 to 36.8 percent, drawdown 134.3 to 127.0; stars played 1.45 minutes under projection on the 2025 openers | `NBA_BASELINE_CALIBRATION.md` `§T50.5` |
| **derived box-score props: estimator and artifact** | books quote points / rebounds / assists / threes / combos (about 110-118 players a night), blocks about 94, steals about 58, turnovers about 25 (DraftKings only); prior-30-day mean beats the median; `derived_center_offset` (FGA 0, FGM / 3PA / DREB 0.25, FTA / OREB 0.5, FTM 0.75) brings best-centre over rates to 47-50 percent; best derived leg per player-night 1.063-1.093 (value at least 1.30) is below the 3-pick break-even 1.10; free throws stand out (FTM Over 1.293 / 1.322) | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z2` |
| **why past hit-rate ranks fail in NBA** | a hit-rate rank measures the past LINE and PrizePicks moves the line after a streak (regression to the mean); players with at least 70 percent history hit 0.469 next time; model at least 0.60 AND player rate at least 0.60 hit 0.625 vs 0.623 (the rank adds nothing) | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z2` |
| **whole-number calibration gates (G1-G4)** | Gate 1 coverage 96.2 percent and bins (60-70 percent predicts gives 55.2 actual); Gate 1b out of sample b 0.300 / 0.328 log-loss 0.7048 to 0.6890; Gamma-Poisson alpha 44.25; Gate 2 slips barely use whole-number legs; G2 unscored demons beyond the ladder (`build_combos_ladder.py` ignores the per-prop depth table PRA 16, pts+reb 15, pts+ast 14 and defaults to 10; deep rungs not admitted); G4 Underdog display-name keys such as player_3-pointers_made never read by the MKT table | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z3` |
| **rookie and early-game calibration** | 301 debut legs predicted 6.4 percent vs actual 36.5 percent (52 legs), log-loss 0.908 vs coin flip 0.693; games 2-5 log-loss 0.680 on 2,087 legs; preseason prior vs draft-tier prior alternate between seasons | `NBA_BASELINE_CALIBRATION.md` `§T50.5-Z3` |
| **L11b (certifier)** | the L11 slip invariants run on the live engine's own backtest tables; first FAILED with 11,392 and 19,401 payout mismatches, all size-2 Flex slips with alternates (paid 0 since 10-10 because PrizePicks has no 2-pick quote tier) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **equal-budget study (10-17 18:38 PT)** | owner order: same total stake, fewer units on strategies with many slips; rules fixed before results (chosen on one season, scored on the other, at least 150 slips, no 2-pick Flex). Test 1 open search REJECTED, test 2 each strategy's best cap REJECTED (+75.1 vs +79.0 percent), test 3 ONE stable pattern ADOPTED 10-18: A_core_3power, A_wrebounds_4flex, D_points_3power each beat cap 3 at cap 2 in both seasons (A_core +29.5 to +34.4 / +76.6 to +90.9) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **test C56 / UI `v1.4.11` (test-only strategies hidden)** | shadow, paper and not-staked strategies and the paper Underdog engine are recorded as not played and not shown; the screen states how many were recorded; betting-rule SKIPs stay visible | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **losing-streak study (10-17 21:04 PT)** | permutation of day order (10,000 times): A_regular_5power and A_wrebounds_4flex streaks are ordinary luck (max-drawdown p 0.10-0.65 and 0.09-0.32); A_core_3power clusters beyond chance in BOTH seasons (p 0.02 / 0.04), a real regime (its legs are steals / turnovers Unders); twelve signals tested, only those pointing the same way in both seasons kept | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **streak rule A_core_3power / A_regular_5power (UI `v1.4.12`, COMPASS 166, test C57)** | A_core_3power ON when its legs hit under 55 percent over its last 5 PLAYED days this season, OFF the first day back at 55 percent or more; A_regular_5power ON after losing each of its last 3 played days, OFF the day after its first winning day; action: stake x0.5 while ON, but a half stake below the minimum entry keeps the FULL stake, so at the USD 1 unit the flag is shown and acts only from a USD 2 unit; permutation p 0.037 / 0.090 and 0.016 / 0.054 | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`LS_STREAK_SHIFT=on` (streak shift)** | A_core's flag adds A_wrebounds slips: built but OFF (adds only +0.0..+1.4 points, mixed drawdown, measured only at cap 2); on A_core flagged days A_wrebounds_4flex returned +82 / +62 percent vs A_core +58 / +19; `R_stocks_4power` (drought rotation) was NEGATIVE there (-10 / -42) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **earned-unit simulation (`research_earn_raise.py`)** | 2025-26 +24,854 on 28,023 staked (+88.7 percent), unit 15 reached on slate day 22, cash needed 20, worst drop 931; 2024-25 +4,850 on 8,990 (+53.9), 92 slate days at unit 1, unit 15 on day 126, cash 223; 10,000 mixed seasons median +14,749 (P5 +3,897), 0.2 percent losing; every payout cut 20 percent: median +4,144, 6.4 percent losing | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`s2526_plan` replay unit path** | production-configuration replay: +25,121.75 on 28,417.25 staked (+88.4 percent), unit 1 to 2 on 2025-10-27, to 3 on 11-02, to 4 on 11-04; `s2425_plan` +5,819.31 on 11,336.25 (+51.3); step-down artifact: once profit is far above 25 x 15, a 15 x drop steps the unit to 14 for ONE day and the next grade raises it back | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **UI tests C50 / C51 / C58 and `/api/stake-unit`** | "My unit" shows the earned unit; a hand-set unit turns auto off and the Auto button turns it on; PLAY uses each slip's own `unit_usd`; C58 earned-unit display | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **placing-time measurements** | about 14 slips a day (max 19), about 63 leg entries but about 14 distinct legs, 13-15 minutes a day on PrizePicks (about 20 heavy), by close capture 30-35 percent of distinct legs had moved or been pulled, 1-3 substitutions add 5-10 minutes, Underdog adds 5, each further app 15-25 | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **UI `v1.4.15`-`v1.4.17` (place-by ordering, tests C59 / C60)** | Slips screen lists by Place by, earliest first (PLAY before skips; PrizePicks before Underdog); pre-season replay uses the latest slate the plan plays (2026-04-04, not the final-7 day 04-12); shows the live engine's own slips | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **"clumped" probabilities** | with no board the screen replays the last scored slate (2026-06-13, one Finals game); the number is the market-anchored probability whose isotonic stage tops out at 77.1 percent, ties ordered by Overall score; correct behaviour, not a bug | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **slip concentration measured, not changed** | 2025-26 replay: the most-used leg sits in 83 percent of a day's played slips on average (15.6 slips a day; at least 75 percent on 106 of 152 days) and hit 67.1 percent | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **exposure caps REJECTED** | leg in at most a half or a third of a strategy's slips, leg in at most 3-6 slips, player in at most 4 or 6 slips and combined: ROI -13 to -28 points (2025-26) and -9 (2024-25); code stays in `live_slip_engine` and is read from a DB tunable that has no row (OFF) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Threes-Over gap filter REJECTED (T15 / T20)** | T15 -6.7 points in 2025-26 and +22.3 in 2024-25 (flips sign); T20 fails both | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Over minutes floor sensitivity (M22, `AR_OVER_MIN`)** | thresholds 18-28 minutes tested; M22 the only one passing both seasons (2025-26 ROI +4.2 points, drawdown 67.5 to 56.2; 2024-25 +2.4, drawdown -8.5); env `AR_OVER_MIN=22` in replays; baseline +1,776.5 on 2,082.0 (+85.3 percent) vs floor +1,831.2 on 2,071.0 (+88.4) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **break-even leg rates 2F .618 ... 6P .547** | exact: 2F 0.618, 2P 0.577, 3F 0.577, 3P 0.550, 4F 0.550, 4P 0.562, 5F 0.543, 5P 0.549, 6F 0.542, 6P 0.547; best both-season cell for 2F steals both top 1 (0.605 / 0.594) still below 0.618 | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`live_slip_engine.post_tip`** | the engine refuses any post-tip pick on its own (section 29z-d) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Fliff and Betr wired as final-board apps (UI `v1.4.22`)** | `nba_main_ui.apps`, `dfs_books` and documented line types gained fliff and betr; a Fliff leg shows its decimal price and breaks even at 1/decimal (-120 is 54.5 percent, +105 is 48.8 percent); Betr rows list as regular legs; Betr later parked | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **board after every tip (UI `v1.4.25`, check D00)** | on a LIVE slate a leg whose game has tipped is left out of the board and the counts; when all games started the board names the next slate; 569 of 1,307 Underdog legs on 10-20 were counted but never shown | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **10-20 opening-night result** | finals BOS 113 @ DET 121, PHI 106 @ NYK 100, OKC 116 @ SAS 104; PrizePicks 8 paper slips, one paid 1.5x (A_wrebounds_4flex 3 of 4), one 0.4 (A_core_5flex shadow 3 of 5), rest lost; distinct legs 9/16 (Unders 8/10, Overs 1/6); Underdog 4 paper slips all lost | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **10-21 live result** | PrizePicks 16 placed units, +2.7 total (A_core +4.0, A_wsteals +3.2 on 8 paid slips, A_wrebounds -0.5, A_regular -2.0, C_wstocks -2.0); Underdog paper 4 slips -3.5 of 3.5 staked (8 of 8 over two days lost); paper Less tracker graded 19 slips | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **UI `v1.4.31` re-save rule (COMPASS 176)** | a same-day re-save overwrites with the newer multipliers, a graded slip is left alone (test C16) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **line-regime counterfactual** | this season's lower PrizePicks points and combo lines cost D_points_3power most (+47.6 to +33.2 and +33.8 to +26.0 ROI percent); Underdog exchange pricing cuts P5 from +56.0 / +74.1 to +29.5 / +46.5 and turns mains 6-Flex and 6-Standard negative (`research_line_regime_impact.py`, `research_ud_pricing_regime.py`) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **Underdog price-aware ranking** | 387,587 legs of two seasons with books' no-vig, Underdog re-priced at m = round(0.465 / nv, 2); price-blind ranking is NEGATIVE in 2024-25 at every size (2S -9.9 percent ... 6S -30.9) and positive in 2025-26; market-free model z +19..+33 | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **2-, 3-, 4-pick Flex "everything again" (10-22 10:16 PT)** | definitive run `research_pp_flex234.py`: 2-pick Flex nothing works (0 of 78 bucket patterns, 0 of 737 cells); 3-pick Flex nothing holds (0 of 364 patterns, 0 of 511 cells); 4-pick Flex 25 compositions hold (15 positive in 4 of 4 halves); honest scope: not out of sample, 2026-27 is the only true record | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **portfolio mix results (`research_pp_portfolio_mix.py`)** | 2-Power nothing holds; 3-Power 12 hold; LIVE NOW (A_wrebounds 4F, C_wstocks 4F, A_core 3P, D_points 3P) N8 no cap +34.5 / +59.9 percent, drawdown 92 / 41; PROPOSED six units N8 +39.5 / +57.0, drawdown 74 / 36; slip profile of 10-20 to 10-22 closer to 2025-26 (distance 0.56 vs 0.77); early 2025-26 first 14 days -12 / -13 units | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **`portfolio_select`** | round-robin selection of a portfolio: k1 of every unit, then k2, no repeated slip, a leg in at most 2 slips; placed after the strategies | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **board-profile tests (a) (b) (c) of 10-22 afternoon** | (a) `research_pp_board_profiles.py` out of sample +4.5 / +16.8 percent vs live portfolio +49.0; (b) `_v2.py` 2,929 strategies, stage 1 and 2 FAIL for every method, stage 3 (leave-one-month-out) portfolio +319.6 units / +52.4 percent; (c) research sources (Kirch 2013 week-1 unders 58.2 percent; Dare, Dennis and Paul 2015; prop hold 4-6 / 6-10 / 10-20 percent) | `NBA_SYSTEM_DESIGN.md` `§T50.7` |
| **live gap (coverage)** | same-line sportsbook coverage of PrizePicks standard lines 54-74 percent in history vs 5.7-15 percent live (defensive 0 percent); `market_consensus` live 4 markets and about 1 book (history 20 markets, 1.4-2.1 books); history PrizePicks board carried 8-16 defensive rows per game vs about 112 live | `NBA_SYSTEM_DESIGN.md` `§T50.7` |