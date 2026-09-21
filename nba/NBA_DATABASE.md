# NBA DATABASE — every schema, table and column

**Purpose.** The complete data dictionary: what exists, what each column holds, and the specifics that
matter (keys, defaults, sizes, gotchas). Built transcript by transcript from the actual `CREATE TABLE`
statements and `information_schema` reads, not from memory.

**Source discipline.** Every entry here came from a real DDL statement or a real schema query in a
transcript. Where a table was altered later, the change is noted with its transcript.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. `nba_ref`, `nba_config`, `nba_control` from T1 passes 3–4. MLB reference tables from T1 pass 2. Large tables from the live session. |

---

## 0. THE TWO UNIVERSES

NBA is a **completely separate namespace** from MLB — separate schemas, separate control plane,
separate workers, separate repo folder. This was an explicit owner directive, overruling an initial
proposal to share the control plane.

> ✅ **ISOLATION RE-VERIFIED BY LIVE SQL, 2026-09-20 (T1 pass 41).**
> **18 non-NBA schemas + 14 NBA schemas = 32.** The MLB count is **exactly what T1's Phase-1 recon
> returned on 2026-08-31** — unchanged after a complete NBA build.
> **And the three shared MLB board tables still hold zero NBA rows**:
> `market.prizepicks_board_current` **8,720 rows, all `league='mlb'`** ·
> `market.sleeper_board_current` **811 rows, all `baseball_mlb`/`MLB`** ·
> `market.underdog_board_current` **2,449 rows, all `baseball_mlb`/`MLB`**.
> **This closes System Draft §5 open question 2** (reuse the shared board tables filtered by sport,
> or build `nba_market` ones) **by observation**: NBA built its own and never wrote to the shared
> tables. The `sport`/`league` columns there remain **unused as discriminators** — one value each.
> `NBA_OPEN_ITEMS.md` → FROM T1 PASS 41.

### MLB schemas (18, for reference only — never written by NBA)
`archive` · `backtest` · `calendar` · `certifier` · `classification` · `config` · `context` ·
`context_cert` · `control` · `daily` · `market` · `public` · `ref` · `score` · `scoring` ·
`stats_hitter` · `stats_pitcher` · `team`

> ### ⚠⚠ COMPLETENESS AUDIT — **17 of the 85 live NBA tables are missing from this document**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 47). This document's mandate is "a comprehensive complete
> list of all tables and columns"; **it is at 80%.***
>
> **Absent here** (several are documented in *other* files, which is the failure the twelve-document
> split exists to prevent):
> `nba_calendar.games` ⚠ *(the calendar the pipeline schedules against — quoted elsewhere as **2,666
> games**)* · `nba_config.variation_bands` *(25 rows)* · `nba_market.board_backfill_log` ·
> `nba_market.board_tiers_v2` *(in `NBA_GOBLIN_DEMON.md`)* · `nba_market.game_lines_snapshot_log` ·
> `nba_market.schedule_norm` · `nba_score.absence_panel_teams` · `nba_score.redistribution_factors` ·
> `nba_score.scenario_calibration` · `nba_score.tier_band_calibration` ·
> `nba_score.tier_selection_value` · `nba_stats.player_game_log_advanced` ·
> `nba_stats.player_onoff_profile` · `nba_stats.player_playtype_profile` ·
> `nba_stats.player_tracking_detail` · `nba_team.playtype_profile` ·
> `nba_team.team_game_log_advanced`
>
> ### ⚠ AND SIX OF THE FOURTEEN SCHEMAS HOLD ZERO TABLES
> **VERIFIED**: `nba_archive`, `nba_backtest`, `nba_classification`, `nba_context`, `nba_daily`,
> `nba_scoring` — **all empty.** Live table counts: `nba_stats` **19** · `nba_score` **18** ·
> `nba_ref` **14** · `nba_config` **11** · `nba_market` **11** · `nba_team` **9** ·
> `nba_control` **2** · `nba_calendar` **1**.
>
> **All fourteen were created in one `CREATE SCHEMA IF NOT EXISTS` statement in T1, mirroring MLB's
> schema list. Six were never used.** The work they were named for exists **under other names** —
> backtest in `nba_score.*` and the repo's `backtest/`, classification output in
> `nba_score.baseline_*`. **They are a naming layer that was never adopted, not missing
> functionality** — but a reader searching `nba_classification` for the classifier's output will find
> nothing. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 47.

### NBA schemas (14, created T1 in one statement)
`nba_ref` · `nba_calendar` · `nba_team` · `nba_stats` · `nba_daily` · `nba_context` · `nba_market` ·
`nba_archive` · `nba_score` · `nba_scoring` · `nba_backtest` · `nba_classification` · `nba_config` ·
`nba_control`

**NBA has no hitter/pitcher split** — one `nba_stats` where MLB has two.

---

> ## ⚠⚠ ID CONVENTIONS — **two of them, and they do not join**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 50), running the proactive format check blueprint §2
> demanded and that had never been run.*
>
> **✅ Types are perfect**: all 28 `player_id`, 20 `team_id` and 20 `game_id` columns are **TEXT**;
> all 10 `nba_player_id` and 6 `nba_team_id` are **BIGINT**. The two-column pattern — canonical TEXT
> id + raw stats.nba.com BIGINT — is applied without exception.
>
> **⚠ Values split along a layer boundary:**
>
> | Layer | `player_id` | Evidence |
> |---|---|---|
> | **`nba_ref.*`**, **`nba_stats.*`** | **prefixed `nba_<id>`** — e.g. `nba_1610612737` | `players` 582/582 · `player_game_log` 79,358/79,358 |
> | **`nba_score.*`** | **bare numeric** — e.g. `101108` | `baseline_history` 19,343,348 · `final_hp` 19,215,200 · `baseline_ladder` 206,237 · `board_scored` 110,955 · `availability_delta` 4,274 — **all 0 prefixed** |
>
> **⚠ And the pattern has a third hole — `nba_game_id` does not exist** *(T1 pass 54, VERIFIED)*:
> `nba_player_id` appears in **11** columns, `nba_team_id` in **6**, `game_id` in **20**, and
> **`nba_game_id` in 0.** `nba_calendar.games.game_id` is **0 of 2,666 prefixed**. **Only `team_id`
> was implemented exactly as the blueprint specified**; `player_id` carries two conflicting formats
> across layers, and `game_id` has no canonical prefixed form at all.
> **✅ Game joins are unaffected** — all 20 `game_id` columns hold the same unprefixed TEXT format,
> so they work across every boundary, including the one where `player_id` fails.
>
> **Measured**: `nba_score.board_scored` → `nba_ref.players` on `player_id` = **0 of 110,955**.
> With `'nba_'||player_id` = **110,955 of 110,955.**
>
> **Nothing is currently broken** — the scoring path joins score→score and both sides are bare
> numeric. **But any join from the scoring layer to the reference layer returns zero rows, silently**,
> and the transform that bridges them exists nowhere in the schema.
> **This is the blueprint's named multi-table ID bug, reproduced.** **Which convention is correct is
> NOT ESTABLISHED** — flagged for human decision. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 50.

## 1. `nba_ref` — reference / dictionary layer *(T1)*

> ⚠ **THE `*_meta.json` PROVENANCE LAYER** *(recorded 2026-09-20, T1 pass 45 — **VERIFIED on the live
> repo**; documented in none of the twelve documents before now)*.
> **`nba/data/` holds 223 files, of which 41 are `*_meta.json` sidecars.** Each carries
> `fetched_at`, `source_url`, `http_status`, an entity count, and `error`. Example —
> `nba_teams_current_meta.json`: `fetched_at 2026-09-14T15:49:33Z`,
> `Season=2026-27`, `http_status 200`, `team_count 30`, `error null`.
> **This is what makes *"read the committed file, not the scraper's own claim"* checkable.**
> ⚠ **Coverage is roughly one in five**, and **NOT RECORDED as a decision** — for a file without a
> sidecar there is **no committed record of when it was fetched or whether the fetch succeeded**, and
> the workflow logs that would answer it **expire**. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 45.

### `nba_ref.teams`
The team dictionary. 30 active rows.
| Column | Type | Notes |
|---|---|---|
| `team_id` | TEXT | **PK** |
| `nba_team_id` | BIGINT | stats.nba.com's own stable TEAM_ID (e.g. 1610612737 = ATL) — unchanged for decades |
| `abbreviation` | TEXT | **was empty on first scrape** — `TeamAbbreviation` is not in `leaguestandingsv3`; fixed T1 |
| `full_name`, `nickname`, `location_name` | TEXT | |
| `conference`, `division` | TEXT | NBA-specific; MLB's `ref.teams` has AL/NL instead |
| `arena_id` | TEXT | ⚠⚠ **DEAD COLUMN — NULL on all 30 rows, written by no code.** *Corrected 2026-09-20 (T1 pass 65); this table previously described it as a link to `nba_ref.arenas`.* **VERIFIED live**: 30/30 NULL, and zero writes across all 190 code files. **The real link runs the other way** — `nba_ref.arenas.team_id`, populated on all 30 rows. **Join on `arenas.team_id`; a join through `teams.arena_id` returns 30 NULLs and looks like a scrape failure.** Origin: T1 deferred the assignment *"to a dedicated verification pass later"* that never ran and became unnecessary. → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 65*. |
| `active` | INTEGER | DEFAULT 1 |
| `source_key` | TEXT | e.g. `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`. **Only updates on rows that actually changed** — 25 of 30 kept old keys when data was identical |
| `raw_json` | JSONB | ⚠⚠ **NOT a queryable object — a double-encoded JSON STRING.** *Corrected 2026-09-21 (T2 re-read pass 11); previously described here as "full source payload" with no caveat.* **`[LIVE-AUDIT]` VERIFIED**: `jsonb_typeof(raw_json)` = **`string`** on **all 1,306 rows across all six NBA static tables** (`teams` 30, `players` 582, `arenas` 30, `officials` 80, `player_season_profile` 582, `player_tracking_profile` 582). Every writer binds `${JSON.stringify(x).slice(0, N)}` — a JS string — into the JSONB column. **`raw_json ? 'key'`, `raw_json->>'field'` and `raw_json @> '{…}'` all return false/NULL/no-rows rather than erroring**, so a query against it silently concludes the data was never captured. Content is intact; only the encoding is wrong. → `NBA_OPEN_ITEMS.md`. |
| `created_at`, `updated_at` | TIMESTAMPTZ | DEFAULT now() |

### `nba_ref.team_aliases` — 162 active rows

> **THE VALUE VOCABULARY** *(recorded 2026-09-20, T1 pass 84 — defined in `alphadog-v2-nba-static-teams.js`, **VERIFIED** against the live table)*. `alias_type` ∈ **`city` (35), `nickname` (30), `full_name` (30), `abbreviation` (30), `nba_team_id` (30), `manual_alias` (7)**. `confidence` is **`CANONICAL`** for every derived-from-source alias and **`CONTROLLED_ALIAS`** for hand-curated ones — the worker's rule is `type === "manual_alias" ? "CONTROLLED_ALIAS" : "CANONICAL"`.
> ⚠⚠ **THREE NORMALIZED COLLISIONS EXIST** *(VERIFIED live)*: **`'los angeles'` maps to TWO TEAMS** (Clippers and Lakers — both carry `city: "Los Angeles"`), and `'golden state'` and `'utah'` each appear twice on one team (`city` + `manual_alias`). ✅ **Latent, not live**: **this table is written by one worker and read by no code**, so nothing resolves through it today. ⚠ **Also**: `alias_normalized` for the historical SuperSonics entry is **`'seattle supersonics historical pre 2008'`** — the parenthetical survives normalization, so **a lookup for "Seattle SuperSonics" cannot match it.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 84*.
`alias_key` TEXT **PK** · `team_id` · `nba_team_id` BIGINT · `alias_value` · `alias_normalized` ·
`alias_type` · `source_key` · **`confidence`** · `active` INT DEFAULT 1 · `updated_at`

**⚠ `confidence` here is NOT the scoring confidence.** It is an alias-provenance label with two
values: **`CONTROLLED_ALIAS`** (`alias_type = 'manual_alias'`) and **`CANONICAL`** (everything else).
`nba_ref.player_aliases` uses the same convention.
**A manually-curated alias is marked as such**, so a name-resolution failure can be traced to whether
the mapping was derived or hand-entered.

**Upsert behaviour**: `teamHasRealChange()` gates the write, and `*_written` counters report **rows
upserted in that run** (155/157), **not the table total** (162).

### `nba_ref.players` — 582 rows, 525 active
| Column | Type | Notes |
|---|---|---|
| `player_id` | TEXT | **PK** |
| `nba_player_id` | BIGINT | |
| `full_name`, `first_name`, `last_name` | TEXT | |
| `team_id` | TEXT | |
| `position` | TEXT | a position bug was found and fixed in T5 |
| `height_inches`, `weight_lbs`, `years_pro` | INTEGER | |
| `birth_date` | DATE | |
| `active` | INTEGER | DEFAULT 1 |
| `source_key`, `raw_json`, `created_at`, `updated_at` | | |
| `age`, `college`, `country`, `draft_year` | | **added T2** via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, from `leaguedashplayerbiostats` |

### `nba_ref.player_aliases` — 1,822 rows
Same shape as `team_aliases`, keyed on `player_id`.

> ⚠ **PROVENANCE OF THE 30-ROW STATIC FALLBACK** *(recorded 2026-09-20, T1 pass 38)*: verified by a
> `web_search` in T1 for league changes — *"the league still has exactly **30 teams with no expansion
> or relocations for 2026-27**, so it's safe to hardcode that as the static fallback list, **though I
> still shouldn't fully trust unofficial sources for expansion details**."* **The caveat is the part
> that matters**: the check rests on **unofficial sources**, was made **2026-08-31**, and is **NOT
> RECORDED as re-checked**. The fallback is what served the first successful run (*"genuinely seeded
> and correct today, but via the fallback, not the live API"*), so a franchise change before
> **2026-10-03** would propagate silently.

### `nba_ref.arenas` — 30 rows
| Column | Type | Notes |
|---|---|---|
| `arena_id` | TEXT | **PK** |
| `arena_name` | TEXT | current sponsor names (Rocket Arena, Frost Bank Center, Xfinity Mobile Arena) |
| `team_id`, `city`, `state` | TEXT | ✅ **`team_id` is THE team↔arena link** — **VERIFIED 2026-09-20**: 30 rows, `team_id` non-null on all 30, 30 distinct teams. **Not `nba_ref.teams.arena_id`, which is dead.** |
| `capacity` | INTEGER | **null where the SOURCE lacks it** — not a scrape failure. **VERIFIED live 2026-09-21: 11 of 30 NULL** (matches `arenas_missing_capacity: 11` in T2's run response; previously recorded only qualitatively). ⚠ The source field is a **string** when present (`"arena_capacity": "18694"`) and the cast to INTEGER is implicit at the write — no `toIntOrNull`-style coercion, unlike the bio worker. |
| *(absent)* `owner`, `year_founded` | — | ⚠⚠ **SCRAPED ON EVERY RUN, WRITTEN NOWHERE — and NOT recoverable from `raw_json`.** *Extended 2026-09-21 (T2 re-read pass 11).* `nba/scrape_nba_stats_arenas.py` lines 60–61 collect `"owner": col("OWNER")` and `"year_founded": col("YEARFOUNDED")`; `alphadog-v2-nba-static-arenas.js` line 71 writes five source-derived columns only, and this table has no column for either. **The obvious repair — add the columns, backfill from `raw_json` — fails**: across all 30 rows `raw_json ? 'owner'` matches **0** and `raw_json ? 'year_founded'` matches **0**; the stored payload holds four keys (`team_id, arena_name, arena_capacity, city`) and is a double-encoded string besides. **Why the stored payload predates the six-field scraper is NOT RECORDED — left OPEN.** → `NBA_OPEN_ITEMS.md`. |
| `altitude_ft` | INTEGER | present from day one (Denver matters) |
| `timezone` | TEXT | |
| `source_key`, `raw_json` | | |
| `data_quality` | TEXT | **DEFAULT 'derived'** — sourced vs derived distinguished from the first schema |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Source note:** `ARENA`/`ARENACAPACITY` are NOT in the standings endpoint. Correct source is
`teamdetails` → `TeamBackground` result set.

### `nba_ref.officials` — 80 active rows
`official_id` TEXT **PK** · `nba_official_id` BIGINT · `full_name` · `active` ·
`games_officiated` INT DEFAULT 0 · `source_key` · `data_quality` DEFAULT 'derived' · `raw_json` ·
timestamps. **Source: Wikipedia "List of NBA referees"** (the stats API has no referee roster).

### `nba_ref.prop_taxonomy`
`canonical_prop_key` TEXT **PK** · `prop_family` · `display_name` · …

### `nba_ref.player_name_map` — 5,212 players *(later transcripts)*
`norm_name` → `player_id`. The shared resolution layer used by the grader, the scorers and every board
join. Paired with `nba/nba_names.py`.

### `nba_ref.defender_ratings` — 111,768 rows *(T16)*
Two-way ridge `Y = mu + alpha(off) + beta(def)`, 5 channels, reliability-shrunk, weekly as-of, both
seasons. Has `as_of_date`.

---

## 1b. `nba_stats` / `nba_team` — the weekly profile layer *(T2)*

**`data_quality` defaults differ by layer, deliberately**: `nba_ref` tables default to **`'derived'`**,
these default to **`'real'`** (straight from the source). The column records provenance per row.

### `nba_stats.player_season_profile` — 582 rows
Source: **`leaguedashplayerbiostats`** — one call, whole league.
| Column | Notes |
|---|---|
| `player_id` | **PK** |
| `nba_player_id`, `season`, `games_played` | |
| `pts_total`, `reb_total`, `ast_total` | season totals |
| `net_rating`, `oreb_pct`, `dreb_pct` | |
| **`usg_pct`** | usage rate — a core prop-model input |
| **`ts_pct`** | true shooting |
| `ast_pct` | |
| `source_key`, `data_quality` DEFAULT `'real'`, `raw_json`, `updated_at` | |

**Cadence rationale (stated at build time):** bio fields are *"truly static"*; the season aggregates are
*"semi-static, stable enough for weekly refresh — **a single game barely moves a season average after
20+ games played**."* **Note this reasoning does not hold in the first 20 games of a season.**

### `nba_stats.player_tracking_profile` — 582 rows
Source: **`leaguedashptstats`** (SpeedDistance) — one call.
`avg_speed`, `avg_speed_off`, `avg_speed_def`, `dist_miles`, `dist_miles_off`, `dist_miles_def`,
plus the standard `source_key` / `data_quality` / `raw_json` / `updated_at`.

### `nba_team.season_profile` — 30 rows
`games_played`, `wins`, `losses`, **`pace`**, `off_rating`, `def_rating`, `net_rating` + standard.
**Built after an HTTP 500** — stats.nba.com requires the FULL parameter set (many as empty strings).

### On/off-court splits — 661 raw rows → 582 distinct players
Source: **`teamplayeronoffdetails`** — per-team, **30 calls**, ~63 s.
Returns **three** result sets: `OverallTeamPlayerOnOffDetails`,
`PlayersOnCourtTeamPlayerOnOffDetails`, `PlayersOffCourtTeamPlayerOnOffDetails`.
**Each player's ON row is matched to their OFF row by `VS_PLAYER_ID`**, and the stored value is the
computed **net-rating differential** (team net rating with the player on the floor minus off) — the
"with/without you" signal. Verified values: **Wembanyama 17.0 on / 0.6 off = +16.4**, LeBron +2.3.
**Dedup rule:** players traded mid-season appear **twice** in the raw source; **the current-team row is
kept**. That is how 661 becomes 582.
**Status caveat:** this is explicitly a **SECONDARY, noisy** signal — descriptive of what happened,
polluted by teammates/opponents/small samples. See `player_impact_rating` for the primary anchor.

### `nba_stats.player_impact_rating` *(T2 decision, T3 build)*
**DARKO DPM** — Kostya Medvedovsky, `darko.app`, free. Rated by NBA front-office analysts (HoopsHype
survey) as the **best PREDICTIVE catch-all metric**, beating paid EPM and LEBRON on RMSE, *"because
it's forward-looking rather than backward-looking, which is exactly what matters for prop prediction."*
**This is the PRIMARY talent anchor**; on/off is secondary.

| Column | Notes |
|---|---|
| `player_id` | **PK** |
| `nba_player_id` | BIGINT — **DARKO uses the same NBA person IDs** (`203999` = Jokić), so no name matching and no diacritic exposure |
| **`dpm`** | Daily Plus Minus — the headline metric |
| `o_dpm`, `d_dpm` | offensive / defensive split |
| **`box_dpm`, `on_off_dpm`** | the two components DARKO blends |
| `rank` | league rank |
| `source_key`, `data_quality` DEFAULT `'real'`, `raw_json`, `updated_at` | |

**530/530 players.** Verified values: **Jokić +6.76, Wembanyama +6.37.**
**The table is deliberately named `player_impact_rating`, NOT `darko`** — taken on a stated risk
(*"single-maintainer bus factor"*) so the source can be swapped without touching consumers.
**Extraction:** the page is SvelteKit; the full dataset is embedded in the hydration script
(`kit.start(app, element, {...})`). JS bare decimals (`.534094`) must be repaired to valid JSON first.

---

## 1c. The WEEKLY DIFFERENTIAL layer *(T3)*

**Why it exists:** the upsert workers **overwrite** their tables on every run, so change cannot be
detected after the fact. A snapshot must be taken **before** the next overwrite. Six tables, three
snapshot/log pairs:

| Table | Columns |
|---|---|
| `nba_stats.player_roster_snapshot` | `player_id` PK, `nba_player_id`, `full_name`, `team_id`, `active`, `snapshot_taken_at` |
| `nba_stats.player_differential_log` | `id` BIGSERIAL PK, `event_type`, `player_id`, `nba_player_id`, `full_name`, **`old_team_id`, `new_team_id`**, `detected_at`, `details` JSONB |
| `nba_ref.team_roster_snapshot` | `team_id` PK, `nba_team_id`, `abbreviation`, `full_name`, `conference`, `division`, `snapshot_taken_at` |
| `nba_ref.team_differential_log` | `id` PK, `event_type`, `team_id`, **`field_name`, `old_value`, `new_value`**, `detected_at` |
| `nba_ref.official_roster_snapshot` | `official_id` PK, `full_name`, `snapshot_taken_at` |
| `nba_ref.official_differential_log` | `id` PK, `event_type`, `official_id`, `full_name`, `detected_at` |

**Baseline: 582 players / 30 teams / 80 officials.**
**Event types seen:** `team_change`, `new_player`, departed official.
**Note the team log is field-level** (`field_name`/`old_value`/`new_value`) while the player log is
purpose-built for team moves (`old_team_id`/`new_team_id`) — different shapes for different change
profiles.

### `nba_ref.referee_assignments` *(T15)*
Daily capture at 08:30 PT. **0 rows** — expected until the season opens.

---

> ### ⚠ THIS DOCUMENT IS THE ONLY SCHEMA ARTEFACT NBA HAS — and it is prose
> *Recorded 2026-09-20 (T1 pass 43). **VERIFIED**: `ls nba/*.sql` returns **nothing**.*
>
> **MLB has eleven committed schema files at the repo root** (`schema_ref_db.sql`,
> `schema_config_db.sql`, … — 133 KB) **plus `schema_manifest.json`. All of them are stale**: the
> manifest reads `"date": "2026-05-18"`, `"target": "AlphaDog v2 new D1 databases only"`, and **D1
> was decommissioned system-wide on 2026-08-12**. Their DDL is SQLite-flavoured and flat-named
> (`ref_teams`, not `ref.teams`).
>
> **NBA has zero.** Nothing went stale because nothing was written — **but there is no artefact to
> diff the live database against**, which is what blueprint §9's whole-universe comparison would
> need. **The live schema is the only record of itself, and this document is the only description of
> it.** **NOT RECORDED as a deliberate decision.** `NBA_OPEN_ITEMS.md` → FROM T1 PASS 43.

## 2. `nba_config` — NBA control configuration *(T1)*

> ### ⚠⚠ READ FIRST — **nothing in the codebase reads any of these tables except `external_credentials`**
> > *The design document's own closing line for this schema, `NBA_CLASSIFICATION_BASELINE_DESIGN.md`
> > line 252:* **"All tunables live in these tables. Nothing hardcoded."** *(surfaced 2026-09-21,
> > T7 pass 22 — the sharpest one-line statement of the gap this banner records.)*
> *VERIFIED 2026-09-20 (T1 pass 36) by grep of all 190 `.py`/`.js` files in `nba/` **and** the MCP
> admin bridge `alphadog-v2-admin-sql.js`.*
>
> The strings **`classification_config`, `factor_registry`, `factor_relevance`,
> `factor_profile_cells`, `stat_decay_config`, `ewma_alpha`, `system_settings`, `role_tiers`** appear
> **ZERO times** in the codebase. The only config table anything reads is
> **`nba_config.external_credentials`** (12 call sites, all fetching API keys).
>
> **⚠ AND THE LIST IS INCOMPLETE — 2026-09-21 (T7 pass 15).** Live `nba_config` holds **13 tables**;
> **`variation_bands` (25 rows) has NO code reference anywhere in the repo** and is absent from the
> list above — **and it is the table that gives the 13 continuous `factor_profile_cells` their
> `variation_band` key.** `calibration_log` and `worker_definitions` do have repo hits, but **all are
> MLB's D1 names** (`config_worker_definitions` in `verify_schema_all.py`, MLB workers) — **none
> `nba_config`-qualified** — so their NBA status is *not* established by those hits.
>
> **⚠ PRECISION, 2026-09-21 (T7 pass 11): that is SEVEN TABLES AND ONE COLUMN, not eight tables.**
> **`nba_config.ewma_alpha` does not exist** — `SELECT` on it errors *relation
> "nba_config.ewma_alpha" does not exist*. It is a **column of `nba_config.stat_decay_config`**
> (VERIFIED: the only `%ewma%` object in `information_schema`). **The string claim above is
> unaffected** — a column name appearing zero times in code is still an absence — but *"these
> tables"* below, and `NBA_MASTER_SUMMARY.md` §T7.39c's *"eight tables"*, both overstated it.
>
> **✅ RE-VERIFIED 2026-09-21 at a wider scope** (T7 pass 10): the original grep covered the 190
> `.py`/`.js` files in `nba/` plus the admin bridge; a grep of the **whole repository, unrestricted
> by directory or extension**, still finds **zero** code references — one day later, against a repo
> another session committed to overnight.
>
> **These tables are a documented design that no running code consults.** Their values are
> **maintained by hand alongside hardcoded constants**, not loaded from here. Editing a row changes
> nothing and raises no error.
>
> **This is the owner's founding rule not holding**: *"any future variable numbers must reside on the
> database, not hard coded… so all these are **easily changed by SQL command instead of coding and
> deploys**"* — a rule whose purpose is operational, because the owner has **no terminal**
> (`NBA_SYSTEM_ARCHITECTURE.md` §1a). **A cap, penalty or timeout change today needs a code edit, a
> commit and a deploy.**
>
> **It also reframes the recorded `minutes_mixture` drift**: that is not config and code diverging —
> **there is no coupling to diverge.** Full entry, including a measured config-vs-code diff:
> `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 36*.
>
> **Not claimed**: that the values here are wrong. Only that nothing reads them.

### `nba_config.worker_definitions`
`worker_name` TEXT **PK** · `job_key` TEXT **UNIQUE** · `worker_group` · `phase_key` ·
`display_name` · `enabled` INT DEFAULT 1 · `notes` · `updated_at`
**8 columns — deliberately simpler than MLB's 16.** MLB's adds `owns_db_binding`,
`schedule_profile_key`, `max_tick_ms`, `max_api_calls_per_tick` and more.

### `nba_config.system_settings`
`setting_key` TEXT **PK** · `setting_value` TEXT · `updated_at`
**Seeded operating constants (T1):**
| Key | Value |
|---|---|
| `nba_static_teams_expected_count` | 30 |
| `nba_default_timeout_ms` | 20000 |
| `nba_default_retry_limit` | 3 |
| `nba_default_chunk_size` | 200 |
| `nba_differential_check_cadence` | **weekly** |

### `nba_config.external_credentials`
`credential_key` TEXT **PK** · `credential_value_encrypted` TEXT · `updated_at`

⚠⚠ **THE COLUMN NAME IS A MISNOMER — nothing encrypts and nothing decrypts** *(recorded 2026-09-20, T1 pass 67, **VERIFIED** two ways)*. **Code**: the column is read in exactly two places (`backfill_board_snapshots.py`, `backfill_game_line_snapshots.py`) and both use the value as-is — **`.strip()` is the entire transformation** — with **no encrypt or decrypt step anywhere in the 190 files**. **Data**: 6 credentials are stored, and **two are bare 36-character UUIDs** (`balldontlie_api_key`, `oddspapi_api_key`); the other four are 32-char ×3 and one 1,513-char token whose encoding is **NOT RECORDED**. ⚠ **The same values appear in plaintext in five of the twenty transcripts** — see the blocker at the top of `NBA_OPEN_ITEMS.md` before committing those files anywhere. **Not fixed, per the standing instruction.**
Holds `balldontlie_api_key`, and later `betr_access_token`. **Credentials never live in chat memory.**
⚠ **The BallDontLie key is explicitly a BACKUP credential** *(recorded 2026-09-20, T1 pass 39, from
T1's memory write)*: *"provided a real balldontlie.io API key … **as a backup source**, but said **the
data ideally should come from nba.com itself**, just like the MLB system uses the official MLB Stats
API."* **The source ordering — nba.com primary, BallDontLie subordinate — is an owner instruction**
and had not been recorded. `NBA_OPEN_ITEMS.md` → FROM T1 PASS 39.

## 2b. THE TIERING CONFIG LAYER *(T8 — materialised from the five-dimension design)*

All row counts **verified live 2026-09-20.**

### `nba_ref.prop_taxonomy` — **28 rows**
Created empty in T1, correctly flagged as empty in T7's audit, **seeded in T8**. The canonical prop
list the whole matrix is built over.

#### The original MLB→NBA taxonomy mapping *(T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1)*
| MLB concept | NBA equivalent, as stated |
|---|---|
| **Hitter props** (hits, total_bases, rbis, runs, singles, doubles, home_runs, stolen_bases, walks, hits_runs_rbis) | **Points, rebounds, assists, 3PM, steals, blocks, turnovers, PRA, P+R, P+A, R+A, double-double, triple-double** |
| **Pitcher props** (strikeouts, outs, hits_allowed, walks_allowed, earned_runs, runs_allowed, pitcher_fantasy_score) | *"**No direct 1:1 equivalent** — NBA has **no 'opposing role' prop family analogous to pitching**. Closest conceptual parallel: **none needed; ALL NBA props are 'batter-style' (offense-side player stats). SIMPLIFIES THE TAXONOMY relative to MLB.**"* |
| Fantasy-score composite | *"various **platform-specific formulas** — **verify each platform's own formula explicitly**, per lesson #14, before any cross-platform comparison"* |
| Goblin/Demon/Standard variant tiers | *"platform-level mechanic, not sport-specific… **but verify TIER-COUNT and TIER-SPACING conventions PER PROP before assuming**"* |

**⚠ The combo instruction, stated at the outset:**
> *"NBA has **real combo props (PRA etc.)** already confirmed to exist on ParlayAPI's market-key
> list — **treat these as a FIRST-CLASS PROP FAMILY FROM DAY ONE, NOT AN AFTERTHOUGHT**, since
> **MLB's own combo prop (`hits_runs_rbis`) caused REAL ANALYSIS HEADACHES from being treated as a
> BOLT-ON.**"*

**This instruction was followed.** Combos were built as **joint simulation over calibrated marginals
with per-player covariance** — *"never a direct fit"* — and certified on both seasons (P+R 0.9,
R+A 0.9, PRA 1.1, fantasy 0.8 pp). **The `BT_SAVE_COMPONENTS` pickling and the separate
`combos_ladder_v1.py` recipe are what "first-class, not bolt-on" looks like in code.**

**And the "no pitcher equivalent" note explains a structural simplification**: NBA has no
opposing-role prop family, so **every prop is offense-side player stats**. *(The opponent enters as a
FACTOR — opponent paint share, opponent turnover rate — not as its own prop family.)*

> ⚠ **`nba_ref.prop_taxonomy` — 28 props, 10 families; the day-one plan named 14**
> *VERIFIED by live SQL 2026-09-20 (T1 pass 62).*
>
> | family | n | keys |
> |---|---|---|
> | `scoring` | 6 | `points`, `points_1q`, `points_1h`, `points_2h`, `points_4q`, `ftm` |
> | `combo` | 6 | `pra`, `pts_reb`, `pts_ast`, `reb_ast`, `pra_1q`, `stocks` |
> | `defense` | 3 | `blocks`, `steals`, `personal_fouls` |
> | `composite` · `milestone` · `playmaking` · `rebounding` · `shooting` · `volume` | 2 each | `fantasy_score(_1q)` · `double_double`, `triple_double` · `assists(_1q)` · `rebounds(_1q)` · `threes_made(_1q)` · **`fga`, `fg3a`** |
> | `ball_handling` | 1 | `turnovers` |
>
> **Every prop the System Draft planned exists. Fourteen more were added and none is recorded as a
> decision** — most importantly **nine period variants**, which the day-one taxonomy had no dimension
> for and which now make up **a third of the board surface**. Period props carry their own
> **`ot_rule`**, and OT handling **differs by app** — lesson #14's prop-definition-mismatch trap.
> `NBA_OPEN_ITEMS.md` → FROM T1 PASS 62.

### `nba_config.factor_registry` — **67 rows** *(seeded at 29 in T8)*
Factors, *"layer-tagged, with macro-clusters"* — i.e. each carries whether it is a **baseline** or
**enrichment** factor, and which cluster it belongs to. **It has more than doubled since T8**, and is
the ancestor of the A/B/D/M/N factor codes used in T15–T16 and of
`nba/NBA_ENRICHMENT_FACTOR_LOCK.md`.

### `nba_config.factor_relevance` — **460 rows**
The **prop × factor relevance matrix** — which factors are even candidates for which props.

⚠ **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 12) — the column grades nothing as EXCLUDED.** It takes
**exactly two values: `full` (440 rows) and `partial` (20)**. There is **no `none` / `excluded`
grade anywhere in the table**, so 95.7% of pairs are `full` and **as a filter it currently excludes
nothing**. ✅ Referential integrity is clean: **0 of 460** `factor_key` values are orphaned against
`factor_registry`, and all **24** distinct (factor, prop) pairs that carry a fitted cell are graded
`full`.

### `nba_config.factor_profile_cells` — **35 rows**
The fitted **lifts/penalties**, *"in exactly MLB's cell form."* Seeded from research as provisional
values — *"**these are the values the backtest will move**."*

**⚠ Read the 35-vs-460 gap correctly**: most prop × factor pairs are marked **relevant** but carry
**no fitted cell**. That is consistent with the T15/T16 result — **ten enrichment candidates tested,
none survived at leg level**. **The matrix records what was considered; the cells record what earned a
value.**

✅ **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 10) — the §2 banner RE-VERIFIED at a wider scope, and it
holds.** The banner's grep (T1 pass 36) covered the 190 `.py`/`.js` files in `nba/` plus the admin
bridge; this pass grepped the **whole repository, unrestricted**, and `factor_profile_cells` and
`factor_relevance` still appear in **zero code files** — one day later, against a repo another
session committed to overnight. **The count of tables read by nothing is the banner's eight, not a
new number.** One refinement: at repo level `nba_config` is read as `external_credentials` (12 sites)
**and** `nba_config.pp_slip_rules` (2 sites, another session's table, **out of scope**) — so
*"only `external_credentials` is read"* is true of the eight, not literally of the schema.
*Cross-system context only (MLB is dropped): the same
pattern under MLB's names **is** live — `config.enrichment_profile_cells` is read by
`alphadog-v2-phase2a-run-environment.js:271`, `config_enrichment_profile_cells` by
`alphadog-v2-score-audit.js:6221`, and `gbdt_training/validate_factor_coefficients.py:204` writes
back `last_empirical_validation_json` / `last_validated_at` — **the two columns null on every NBA
row**. The NBA repo has no equivalent of either; whether one is pending is **NOT RECORDED**.*

**`[LIVE-AUDIT]` — the table is TWO POPULATIONS, zero mixing across 35 rows, and EVERY cell is keyed.**
The design key is **six-dimensional** — *factor × prop × rate_tier × role_tier × direction ×
variation_band* (`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 247) — **and which key columns are
populated is itself the population marker**:

| | Effect | Keyed by | Direction | Cells |
|---|---|---|---|---|
| **Bucketed** | flat `lift` **or** `penalty` | `tier_label` (+ `role_tier_key`), `variation_band` NULL | `more` 21 · `less` 1 | **22** |
| **Continuous** | `formula_expression` + `coefficient_a` | **`variation_band = 'continuous'`**, tier/role NULL | `both` 12 · `more` 1 | **13** |

All other combinations are empty. **Nothing in the table is undifferentiated** — the continuous cells
are band-keyed rather than tier-keyed, by design.
Invariants hold: every `cap` positive; **no `|penalty|` or `|lift|` exceeds its own cap**; every
`penalty` negative, every `lift` positive. ⚠ **22 of the 23 directional cells are `more`** — the lone
`less` is `blowout__points__LOST_GT50__all__less`, the only combination with both. Whether the scorer
mirrors onto LESS legs is **NOT RECORDED**.

**`[LIVE-AUDIT]` 2026-09-21 (T7 pass 9) — the cap column, since a document elsewhere was read as
saying the system runs a single global cap. It does not.** All **35** cells carry a non-null `cap`,
spread over **15 factors** and **10 distinct values, 0.05 → 0.40** (0.12 on 7 cells, 0.25 on 6).
Cells are keyed `(factor_key, canonical_prop_key, tier_label, role_tier_key, direction)`, and
**22 of 35 carry a `tier_label` or a `role_tier_key`**. **13 carry neither** — one undifferentiated
value for the whole factor: `altitude` 0.06 · `opp_forced_to_rate` 0.20 ·
`teammate_shooting_quality` 0.20 · `foul_drawing` 0.25 · `opp_rim_attempt_rate` 0.25 ·
`opp_turnover_rate` 0.25 · `usage_share` 0.30, plus cells of `game_pace`, `potential_assist_rate`,
`opp_miss_rate`. Largest factor: `blowout_risk`, **9 cells over 3 props and 4 tiers, caps 0.08–0.40**.
🔴 **Nothing has been measured.** `[LIVE-AUDIT]` over the **full 35 rows** (T7 pass 20):
**`last_validated_at` set on 0 · `last_empirical_validation_json` set on 0 · `automation_status` =
`semi_automatic` on all 35 (one distinct value, so it distinguishes nothing) · and
`real_sample_size_observed` = **0 on every row**, against a `min_real_sample_threshold` of 75.** The
design's own gate — *"cells under sample are fully shrunk to prior"* — is therefore **unmet by every
cell**. **By its own bookkeeping the table is entirely seed values with no observed sample
anywhere**, which confirms from the data what this section says in words: *"these are the values the
backtest will move."* Rows created **2026-09-09
01:53–02:03**. See `NBA_MASTER_SUMMARY.md` §T7.38b and the owner's anti-capping directive in
`NBA_OPEN_ITEMS.md`.

### `nba_config.variation_bands` — **25 rows**
`canonical_prop_key · band_key · band_order · line_min · line_max · percentile_lo · percentile_hi ·
edge_method · notes · updated_at`

**`[LIVE-AUDIT]` 2026-09-21 (T7 pass 16) — 9 distinct `band_key` values in two families**: a
line-magnitude family `LOW · MID · HIGH · ELITE` (`band_order` 1–4, 5 props each = 20 rows) and a
role family `FRINGE · ROLE · STARTER · STAR · SUPERSTAR` (`band_order` 1–5, 1 each = 5 rows).

⚠ **None of the nine is `continuous`, and that is by design.** 13 `factor_profile_cells` rows carry
`variation_band = 'continuous'` — **not a dangling key but the documented factor FORM**:
`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 242 declares every factor's *"**form (band /
continuous / gate)**"*, and **continuous factors are not banded, so no band row exists to point at.**
`[LIVE-AUDIT]` joining the cells to `factor_registry.form`: **34 of 35 cells are keyed exactly as
their factor's form requires** — `continuous` 14 cells (13 band-keyed), `quantile_bands` 5 and
`tiered_bands` 16 (all tier-keyed). 🔑 **The single exception** is
`shotdiet__rebounds__3PA_HEAVY__all__more`: factor `opp_shot_diet` is declared `form='continuous'`,
yet the cell is tier-keyed (`OPP_3PA_HEAVY`) with a **flat penalty −0.06 and no formula**. *Whether
that is deliberate is **NOT RECORDED**.* ✅ Every `canonical_prop_key` here resolves against
`factor_relevance`.

**`[LIVE-AUDIT]` the `form` vocabulary itself** — `factor_registry.form` over 67 factors:
**`continuous` 28 · `tiered_bands` 25 · `binary_gate` 13 · `quantile_bands` 1.** The design's
*"band / continuous / gate"* is a simplification: **the band family is split in two, and `gate` is
`binary_gate`.**

### `nba_config.role_tiers` — **6 rows**
**Exactly matching `ROLE_TIERS` in `classification_ladder_v12.py`** — IRON_MAN 36+ ·
HIGH_USAGE_STARTER 32–36 · STARTER 27–32 · ROTATION 21–27 · BENCH 15–21 · FRINGE 0–15.

✅ **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 12): the six rows partition minutes 0 → 48 with no gap and no
overlap**, `sort_order` 1–6. ⚠ Two precisions: **IRON_MAN is stored as 36–48, bounded**, not `36+`;
and **every boundary value belongs to two rows at once** (36 is HIGH_USAGE_STARTER's max *and*
IRON_MAN's min, and so on), so **the table does not express whether the comparison is inclusive at
the min or the max**. Since **nothing reads this table**, that convention lives in the hardcoded
`ROLE_TIERS` list; **whether the two agree at the edges is NOT RECORDED** — the T1 pass 36 check
compared names and ranges, not operators.

⚠ **CORRECTED 2026-09-20 (T1 pass 36). This entry read: *"Config and code agree, so the no-hardcoding
rule holds here."*** **The values do agree — VERIFIED.** **The conclusion does not follow.**
`ROLE_TIERS` is a **hardcoded Python list** at `classification_ladder_v12.py` **line 129**, and
**no code reads `nba_config.role_tiers`** — VERIFIED, the string appears nowhere in the codebase.
**Agreement maintained by hand is not the no-hardcoding rule holding**: an SQL edit to this table
changes nothing. See the banner at the top of §2.

### `nba_config.calibration_log` — 8 rows
`log_id · cell_id · proposed_field · old_value · proposed_value · evidence_json · sample_size ·
bootstrap_shrinkage · status · decided_by · created_at · decided_at`

🔴 **`[LIVE-AUDIT]` 2026-09-21 (T7 pass 16) — it joins `factor_profile_cells` at 0%, and most of it
isn't cells.** **8 of 8 `cell_id` values are orphaned.** The two tables use **incompatible id
conventions**: here `blowout_risk::points::P_BLOWOUT_GT50` (`::`, three segments), there
`blowout__points__WON_GT50__FRINGE__more` (`__`, five). **The same failure class as the officials
join** — a name-derived key against a differently-derived key, total failure, no error raised.
**And 6 of the 8 rows are not factor cells at all** but decision records
(`classification::structure`, `classification::guards`, `classification::shift_mode::bug`, …).
⚠ **`old_value` and `proposed_value` are NULL on all eight, every row `status = 'applied'`** — an
audit trail that records that something changed and nothing about what. *Whether anything writes here
today is **NOT RECORDED**; per the §2 banner nothing reads it.*

### `nba_config.stat_decay_config` — 13 rows *(T7)*
⚠ **Described here as "the single most important config table in the system" — and NOTHING READS IT.**
*VERIFIED 2026-09-20 (T1 pass 36): `stat_decay_config` and `ewma_alpha` appear nowhere in the
codebase. The live decay parameters are the `PROPS` dict hardcoded in
`nba/backtest/classification_ladder_v12.py`.*

**A whole-universe diff of this table against that dict found SEVEN of ten mappable stats disagreeing
on at least one parameter, THREE on the decay rate itself** — `blk_rate` 0.08 vs **0.10**,
`tov_rate` 0.10 vs **0.12**, `ft_pct` 0.04 vs **0.03** — plus four `k_stab` disagreements
(`stl_rate` 60 vs **125**, `tov_rate` 40 vs **95**, `fta_rate` 30 vs **40**, `fg3a_rate` 25 vs
**20**). **All 13 rows carry `active = 1`.** Full table and its caveats: `NBA_OPEN_ITEMS.md` →
*FROM T1 PASS 36*.

**Per-stat EWMA memory. The single most important config table in the system** *(as designed — see
the warning above for what it actually governs today).*
`stat_key` · `display_name` · **`ewma_alpha`** · **`min_lookback_games`** ·
**`shrinkage_stabilization_games`** · **`memory_class`** · **`rationale`** · `active` · `updated_at`

| `stat_key` | α | lookback | stabilise | class |
|---|---|---|---|---|
| **minutes** | **0.20** | 8 | 10 | short |
| usg_pct | 0.15 | 10 | 15 | short |
| ast_rate | 0.15 | 10 | 20 | short |
| pts_rate | 0.12 | 15 | 25 | medium-short |
| fg3a_rate | 0.12 | 15 | 25 | medium-short |
| stl_rate | 0.10 | 15 | 60 | medium-short |
| fta_rate | 0.10 | 15 | 30 | medium |
| tov_rate | 0.10 | 15 | 40 | medium |
| reb_rate | 0.08 | 20 | 40 | medium |
| blk_rate | 0.08 | 20 | 50 | medium |
| fg_pct | 0.06 | 25 | 120 | medium-long |
| ft_pct | 0.04 | 30 | 150 | long |
| **fg3_pct** | **0.03** | 40 | **300** | long |

**Alpha spread 6.7× · stabilisation spread 30×. A single alpha would be wrong for 11 of 13.**
Rated *"**Highest** impact, **zero data cost**"* in the T7 research — *"3pt% needs a long memory, assist
rate needs a short one."*

**Every row carries its `rationale`**, e.g.:
- **minutes** — *"the single biggest error source in props… set by coaching decisions that change
  abruptly; shortest memory of all"*
- **usg_pct** — *"USG% from 30 games ago as a 4th option is irrelevant if now a 2nd option"*
- **fg3_pct** — *"takes hundreds of attempts to stabilise; a 10-game hot/cold streak is mostly noise"*
- **fg3a_rate vs fg3_pct** — *"attempt VOLUME (unlike make %) is role/scheme-driven"* — **the same stat
  split into two memory classes by component.**

**This is the owner's no-hardcoding rule applied to model hyperparameters**, not just timeouts —
SQL-editable, with the justification stored beside each value.

### Additional measure-type game logs *(T7)*
Built after the data-universe research — **9 cheap bulk calls, 3 seasons:**
- **`nba_stats.player_game_log_usage`** — share-of-team-stats per game. *"The direct input for
  role/opportunity modelling"*, and the stated **90% proxy for the missing 2023-24/2024-25 starter
  status**.
- **`nba_stats.player_game_log_scoring`** — shot composition (%paint / mid / 3pt / FT, **%assisted**)
  → *"scoring stability archetype"*.
- **`nba_team.team_game_log_four_factors`** — true efficiency (eFG%, FTA rate).
- **`nba_team.team_game_log_scoring`**.

**Skipped deliberately**: Opponent / Defense / Misc measure types — *"single-game descriptive, not
baseline talent."*

### `nba_config.classification_config` — **66 rows**

`config_key` · `config_json` JSONB · `notes` · `updated_at`. The system's decision record — every major
verdict is written here so it is queryable rather than trapped in a log. Keys include
`prizepicks_goblin_demon_tier_spec`, `board_payout_conversion_rules`, `rejected_on_data`,
`blowout_model_market_spread_2026_09_13`, `availability_model_n1v3_2026_09_15`,
`final_engine_complete_2026_09_18`, `storage_diet_plan_2026_09_17`,
`deferred_prizepicks_multiplier_capture`.

---

## 3. `nba_control` — run bookkeeping *(T1)*

> ⚠⚠ **BOTH TABLES ARE EMPTY AND NOTHING WRITES TO THEM** *(recorded 2026-09-20, T1 pass 68, **VERIFIED**)*. **`job_runs`: 0 rows. `worker_run_log`: 0 rows.** The string `nba_control` appears in **no non-markdown file in the repo**. Meanwhile **21 NBA workers are registered and enabled in `nba_config.worker_definitions` and their output tables are populated** — so the workers run, and **no run history is recorded anywhere.** The schema is a structure created in T1 for a purpose that was never wired. **Not fixed, per the standing instruction.** → `NBA_OPEN_ITEMS.md` *FROM T1 PASS 68*.

### `nba_control.worker_run_log`
`log_id` BIGSERIAL **PK** · `request_id` · `run_id` · `worker_name` · `job_key` · `level` ·
`event_key` · `message` · `data_json` · `created_at`

### `nba_control.job_runs`
`run_id` TEXT **PK** · `job_key` · `worker_name` · `status` · `input_json` · `output_json` ·
`error_message` · `started_at` · `finished_at` · `created_at`

---

## 4. `nba_score` — the engine's output layer

### `nba_score.baseline_ladder` *(T9 — the production artifact)*
The daily output of the certified recipe, loaded from committed JSON by
`alphadog-v2-nba-baseline-ladder`.

**PK: `(asof, player_id, game_id, prop, period, ot_rule, line)`** — index on
`(asof, prop, period, player_id)`.

| Column | Notes |
|---|---|
| `asof` | the slate date |
| `period` | **DEFAULT `'FULL'`** — FULL / 1Q / 1H / 2H / 4Q |
| **`ot_rule`** | **DEFAULT `'include'`** — **in the PK**, so `include` and `exclude` variants coexist. This is what lets Sleeper quarter props (OT excluded) and PP/UD props (OT included) be priced separately |
| `line`, `anchor`, `ladder_offset` | the rung |
| `p_more`, `p_less` | the calibrated probabilities |
| **`p_raw`** | **pre-calibration value retained** — the effect of Platt and the cells is auditable per row |
| `role_tier`, `var_band` | the tier keys |
| **`used_emp`** | **whether the empirical table or the parametric fallback produced this row** — the flag that verifies the hierarchical fallback's coverage in production |
| `recipe_version` | rows carry the recipe that made them |

### `nba_score.baseline_ladder_runs` *(T9)*
One row per build. `asof` PK · `slate_games` · `players` · `rows` · `props[]` ·
**`history_seasons[]`** · `current_season` · **`factor_fits` JSONB** ·
**`role_minutes_multiplier` JSONB** · `source_file` · `loaded_at`.

**`factor_fits` and `role_minutes_multiplier` store the values FITTED IN THAT RUN** — the
"no pasted constants" rule made auditable. **`history_seasons[]` records what the run was allowed to
see**, which is the parity rule's evidence.

### Production contract *(from `nba_config.classification_config.production_baseline_ladder`)*
- **Builder**: a **patcher over `classification_ladder_v12.py`** — *"single source of truth; anchors
  assert"*
- **Slate**: schedule games on ASOF (`status != final`; replay allows final) × **each team's roster
  from its last 3 games** — not from `nba_ref.players`, which sidesteps the new-player lag
- **`asof_lag: 0 days`** — daily-exact walk-forward; **Platt fit on the season's prior months**
- **Validated**: replay 2026-03-15 — 7 games, 194 roster rows, **173 projected players, 4,498 rows**;
  **43 roster players were DNP — "enrichment removes"**, i.e. the baseline is availability-agnostic by
  construction

### `nba_score.baseline_history` — **19.34M rows, ~12 GB**
The baseline hit probability for every prop × rung × direction × game-day, both seasons.
**UNIQUE KEY: `(game_date, player_id, game_id, prop, period, line)`** — note `game_id` and `period` in
the middle, which is why a 4-column lookup cannot use that index.
Columns include `season`, `anchor`, `ladder_offset`, `p_more`, `p_less`, `proj_min`, `rate36`,
`used_emp`, `role_tier`.
**Indexes:** `baseline_history_uidx` (2,972 MB, 53.3M scans) · `baseline_history_lookup`
(game_date, player_id, prop — 415 MB, 7.9M scans) · `baseline_history_lookup_idx`
(game_date, player_id, prop, line) INCLUDE (proj_min, rate36, used_emp, role_tier) — 1,334 MB,
**22.3M scans**, built 2026-09-19.

### `nba_score.final_hp` — ⚠ **19,215,200 rows LIVE (2026-09-20). Previously documented: 38.7M.**
The final number per leg. `season, game_date, game_id, player_id, prop, line, side, ladder_offset,
anchor, baseline_hp, final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality,
c_market, prop_tier, band, phase, n_uncertain, built_at`.
**UNIQUE: `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.
**Deliberately denormalised** — see OPEN_ITEMS; the duplicate columns buy backtest speed on 2 GB RAM.

#### ⚠⚠ LIVE ROW COUNT, MEASURED 2026-09-20 (T1 pass 33) — **the 2025-26 season is gone but one day**
**VERIFIED by live SQL:**

| season | distinct `game_date` | props | rows |
|---|---|---|---|
| 2024-25 | **162** | 30 | **19,075,070** |
| **2025-26** | **1** — `2026-01-15` only | 30 | **140,130** |
| **total** | 163 | 30 | **19,215,200** |

**All 30 props in 2025-26 hold exactly one date.** The previously documented **38.7M** figure is
consistent with a complete table: `19.07M (2024-25) + ~19.6M (2025-26) ≈ 38.7M`. **~19.5M rows of the
2025-26 partition are missing.**

**Cause — VERIFIED by grep of `nba/build_final_hp.py`**: the engine's `FE_DATE` parameter **scopes the
`SELECT` from `baseline_history` but not the `DELETE` from `final_hp`**, which is
`DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s` with **no `game_date` predicate**. A
slate-scoped write therefore replaces the whole season × prop partition with one slate.
**Blueprint §7g bug class 1.** Full entry, including what is and is not established about how it was
triggered: `NBA_OPEN_ITEMS.md`, top of file.

**✅ Recoverable.** Every column is derived from `nba_score.baseline_history`, which is **intact —
VERIFIED: 2025-26 holds 163 distinct dates × 30 props.** A full-history re-run rebuilds it.
**The ~9.4 GB / 5,024 MB index figures above predate the loss and are left as the last known
full-table measurements** — they are what the table should return to.

**⚠ Anything computed against `final_hp` for 2025-26 since the loss is computed on one day of data.**
Consumers to re-check before trusting: the backtests, `nba_score.board_scored` joins, and any
confidence or calibration work reading the 2025-26 partition.

### `nba_score.ladder_calibration_asof`
`season, as_of_date, prop, phase, band, side, log_odds_shift, n, source, built_at`.

**⚠ `side` here is the subgroup axis blueprint §7f names.** *(Recorded 2026-09-20, T1 pass 29.)*
MLB's documented calibration failure was a fit *"computed without distinguishing between two sides of
a market (over/under)… dominated by one side's pattern, silently misapplied to the other,"* which an
aggregate metric could not catch. **This table already carries `side` as a real, populated key
column**, along with `phase` and `band` — **so a per-subgroup validation of any refit is available
here at zero data cost**, and a refit validated only on the pooled average would be discarding a
dimension the schema already stores. **Whether the refit validates per `side` is NOT RECORDED** —
see `NBA_BASELINE_CALIBRATION.md` §5.6 and `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*.
**Contrast with the baseline Platt fit**, keyed `prop × var_band × role_tier × offset × month`, where
**`side` is deliberately absent and provably harmless** (`p_less = 1 − p_more` by construction,
VERIFIED by code grep 2026-09-20). **The two calibrations have different exposure to the same
lesson — this table's `side` is a real population split; the Platt fit's is not.**
`source` = `own` (current-season evidence) or `prior_season` (inherited same-phase cell).
**Replaces the pasted `nba_score.ladder_calibration`, which was a parity violation and has been dropped.**

### `nba_score.confidence_model`
`factor, deduction, separation, base, floor, built_at`. 10 factors. Base 99, floor 55.

### `nba_score.conformal_confidence`
`level, prop, band, side, phase, n, s_norm, lo_scale, hi_scale`. 253 full / 66 mid / 22 coarse groups
+ global. *Superseded by the deduction model but retained.*

### `nba_score.scenario_realised` — 1,942 rows
`season, game_date, game_id, branch_key, branch_prob, n_uncertain, n_branches, realised,
was_most_likely, rank_by_prob, phase`. **Only the realised branch is stored.**

### `nba_score.confidence_verification` — ⚠ **four writers, one of which deletes the whole table**
`check_type, slice, tier, n, stated, actual, gap, run_at`.
*Recorded 2026-09-20 (T1 pass 34). **VERIFIED by live query.***

**Live contents — three generations coexisting, which is itself the evidence:**

| `check_type` group | written by | `run_at` |
|---|---|---|
| `overall`, `by_band_tier`, `component`, `phase`, `season` | `verify_confidence.py` | **2026-09-17 18:16** |
| `mondrian_quintile` | `build_mondrian_confidence.py` | **2026-09-17 23:31** |
| `conf_band_v3`, `group_prop`, `group_side`, `group_phase`, `group_season`, `group_kind`, `group_role_tier`, `group_rung_dist` | `build_confidence_v3.py` *(P2, nightly)* | **2026-09-20 03:30** |

**`build_confidence_v3.py`, `build_confidence_v2.py` and `build_mondrian_confidence.py` each delete
only their own partition** (`WHERE tier='v3'`, `WHERE tier IN ('v2','high_vs_low')`,
`WHERE check_type='mondrian_quintile'`). **`verify_confidence.py` runs
`DELETE FROM nba_score.confidence_verification` with no predicate.**

**So the v3 and mondrian rows survive only because the unscoped writer happens to have run first.**
The next `verify_confidence.py` run — wired in `nba-absence-panel.yml`, **not** in P2 — deletes both.
**No `v2` / `high_vs_low` rows are present at all.** Full entry in `NBA_OPEN_ITEMS.md`.

### `nba_score.ladder_calibration` — **DROPPED, and VERIFIED absent** *(but live code recreates it)*
**VERIFIED 2026-09-20**: absent from `information_schema.tables` for `nba_score`. It was the pasted
correction table, **dropped as a parity violation** and replaced by `ladder_calibration_asof`.
⚠ **`nba/calibrate_all_props.py` still runs `CREATE TABLE IF NOT EXISTS nba_score.ladder_calibration`
and repopulates it**, wired behind a manual input in `nba-absence-panel.yml`. **A `DROP` does not
survive a `CREATE … IF NOT EXISTS`.** **VERIFIED nothing reads it** — no `SELECT` against it exists in
any of the 190 files. Full entry in `NBA_OPEN_ITEMS.md`.

### `nba_score.factor_gate_results`
`season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta, run_at`. Every factor verdict —
**results go in the database, not the CI log.**

### `nba_score.board_scored` *(live session)*
`game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id, baseline_hp,
cal_shift, final_hp, confidence, score, edge, interpolated, built_at`. The board-scoped output.

### Others
### `nba_score.blowout_model` — 35 rows *(T16 build, T4 design warning)*
Two `kind`s:

**`minutes_by_margin`** — 7 rows, one per margin band. **`v1` is a RATIO relative to the player's own
baseline; `v2` is absolute minutes lost.**
| `side` | `lo`..`hi` | `n` | **`v1` ratio** | `v2` min lost |
|---|---|---|---|---|
| competitive | −12..12 | 12,966 | **1.0333** | −1.0140 |
| won by 12–20 | 12..20 | 3,001 | 0.9760 | 0.790 |
| won by 20–25 | 20..25 | 1,120 | 0.9194 | 2.586 |
| **won by 25+** | 25..99 | 1,597 | **0.8748** | 3.992 |
| lost by 12–20 | −20..−12 | 2,672 | 0.9721 | 0.903 |
| lost by 20–25 | −25..−20 | 929 | 0.9364 | 2.056 |
| lost by 25+ | −99..−25 | 1,306 | 0.9124 | 2.856 |

**⚠ READ `v1` AS A DEVIATION, NOT A PENALTY.** Competitive sits **above** 1.0 and every blowout band
below it, because the ratios are measured against the **same blended historical average the baseline
uses**. Applying them **re-centres** the projection onto the expected game script.
**This is what prevents the double-counting the T4 methodology warned about** — the baseline's minutes
already include blowout games, so an absolute penalty would subtract twice.

**`p_blowout`** — per spread band, `side` = favourite/underdog, with three probabilities in
`v1`/`v2`/`v3` (blow-open, blown-out, and the residual). Example, spread 0–2 favourite:
0.1634 / 0.0842 / 0.0792.
Measured on the **real market spread** (307,604 rows available, 2,454 games, 100% coverage) after the
derived r=0.46 proxy was replaced.
`nba_score.confidence_verification` · `nba_score.availability_delta` ·
`nba_score.real_slip_leg_observations` (139 legs, `decomposition_method='equal_scale_v1'`)

**DROPPED 2026-09-19** (superseded, findings preserved in COMPASS): `nba_score.absence_panel`,
`absence_panel_v2`, `absence_panel_v3`, `redistribution_panel`, `ladder_calibration`.

---

## 5. `nba_market` — boards, market and grading

### `nba_market.board_snapshots` — ~6.6 GB
Every board leg, all apps, all snapshots, two seasons + live.
`game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line,
price, multiplier, home_team, away_team, commence_time, fetched_at`
**`snapshot_label`**: `window` (the decision pull — **1:15 PM PT**, corrected from 2:45), `close`,
`morning`, `routine`. Set by `ARCHIVE_LABEL`, which **defaults to `routine`**.
**It HAS a `multiplier` column.** Uses a compact md5→uuid unique index (1,001 MB) instead of the
original 7-column PK (5,577 MB).

### `nba_market.board_outcomes` — 6.9M legs, 327 dates
The grader's output: every offered line graded against the box score.
`leg_result` ∈ `over_win`, `under_win`, push, DNP, `unmatched_player`, `unmatched_not_in_season`.
**`board_outcomes_leg_uidx` shows 0 scans but is UNIQUE — it enforces no-duplicate-legs. Do not drop.**

### `nba_market.board_tiers` — 2.2M legs
`game_date, snapshot_label, player, base_market, side, line, kind, anchor_line, anchor_type, tier, nm`
`anchor_type` ∈ `explicit` | `switch_point` (**the invisible anchor**, validated on 42,600 ladders).
`kind` ∈ standard/goblin/demon — **derived from PRICE, so Over-only. Superseded by the four-way rule.**

### `nba_market.board_tiers_ud`
The **Underdog** version — **already implements the four-way rule** (position vs anchor + side), and
uses a smarter anchor for books that price every rung: *the FAIR rung, implied probability closest to 50%*.

### `nba_market.rung_market` — 1.06M rungs, 206 MB
De-vigged book probability **at the DFS rungs only**, built in monthly blocks.
`game_date, snapshot_label, player, market, line, p_over_book, p_over_sd, books, built_at`
**Note: keys on `player` (name) and `market`, with the count in `books`** — not player_id/prop/n_books.

### Others
`nba_market.game_lines_snapshots` (110 MB) · `nba_market.game_lines_closing` ·
`nba_market.event_game_map`

---

## 6. `nba_stats` / other
`nba_stats.player_game_log` (41 MB) and the season/quarter files. Most bulk historical data lives as
committed JSON in `nba/data/`, not in Postgres — see the ARCHITECTURE document.

### `nba_stats.player_game_log` — the game-log spine *(T4)*
`player_id`, `nba_player_id`, `game_id`, `season`, `team_id`, `game_date`, `matchup`, `wl`, `min`,
`fgm/fga/fg_pct`, `fg3m/fg3a/fg3_pct`, `ftm/fta/ft_pct`, `oreb/dreb/reb`, `ast`, `tov`, `stl`, `blk`,
**`blka`** (blocked attempts), `pf`, **`pfd`** (fouls drawn), `pts`, `plus_minus`,
**`nba_fantasy_pts`**, **`dd2`**, **`td3`**, + `source_key` / `data_quality` / `updated_at`.

**26,651 rows for 2025-26.** Three columns here become props directly: `nba_fantasy_pts` →
`fantasy_score`, `dd2` → `double_double`, and `blka`/`pfd` support the rare props.
**The prop menu was already supported by this schema before the prop layer existed.**

### `nba_team.team_game_log` *(T4)*
Same shape minus the player-only fields. **2,460 rows for 2025-26 — exactly 30 teams × 82 games**,
which is a complete-season assertion, not just a count.

### Career totals *(T4)*
**3,644 season rows across 582 players.** Table: **`nba_stats.player_career_season_totals`**
`player_id`, `nba_player_id`, **`season_id`**, `team_id`, **`player_age`**, `gp`, **`gs`** (games
started), `min`, plus the full shooting/rebounding/assist line.
- **`player_age`** is what makes aging curves computable
- **`gs` vs `gp`** is a starter-rate signal across a career
- **`team_id`** is where the `TEAM_ID = 0` combined row appears

**⚠ TRADED PLAYERS**: they get **separate per-team rows PLUS a combined total row at `TEAM_ID = 0`**,
and the two sum correctly. **A naive `SUM()` double-counts them.** Verified empirically after search
could not settle it.
**⚠ SURVIVORSHIP BIAS**: this data exists only for players still in the league. Any aging curve from it
describes **successful** NBA players; those who washed out after 2–3 seasons are invisible. Also era
effects — a 2004 line is not comparable to 2024 without pace/3PT normalisation.

### Splits *(T4 research, T5 build)*
> 🔴 **`nba_stats.player_career_season_totals` stores its own subtotals.** *(Added 2026-09-21, T4 re-sweep pass 4.)* `team_id = 'nba_0'` is **not a team** — it is the season total for a traded player, stored **beside** the per-team rows it sums. **`[LIVE-AUDIT]` VERIFIED**: 3,644 rows / **3,064 distinct player-seasons**; **282 have >1 row, all 282 carry an `nba_0` row, and in all 282 that row's `GP` equals the sum of the parts (0 mismatches)**. **Any aggregate over this table double-counts those 282 player-seasons** unless it filters `team_id <> 'nba_0'` (parts) or `= 'nba_0'` (totals, where present). **No `is_total` flag exists** — the discriminator is the magic value. → `NBA_OPEN_ITEMS.md`.
> ⚠ **And one player is absent entirely**: `nba_1628467` (Maxi Kleber) has no rows. The scrape reported "582 players succeeded" because that figure is `len(players) - len(errors)`, i.e. attempted-minus-errored, not players with data. → `NBA_OPEN_ITEMS.md`.

**⚠ `PRIMARY KEY (player_id, split_type, group_value)` — `season` is a column but NOT in the key.**
**Live 2026-09-20: `nba_stats.player_splits` = 9,948 rows, 577 players, 2025-26 ONLY.** A second
season's load would overwrite the first. `nba_team.team_splits` = 581 rows, 30/30, same PK shape.

**What is actually present — 5 types, not 6:**
| `split_type` | rows | groups |
|---|---|---|
| `days_rest` | 3,311 | 7 |
| `month` | 3,236 | 7 |
| `location` | 1,217 | 3 |
| `wins_losses` | 1,135 | 2 |
| `pre_post_allstar` | 1,049 | 2 |

**`StartingPosition` is absent** — superseded by `player_game_starter_status` at per-game granularity.
**5 players missing** (577 of 582) from server-side HTTP 500s, accepted as *"well under the 5%
tolerance."*
Columns: `gp`, `w`, `l`, `w_pct`, `min`, full shooting/rebounding/assist line, `plus_minus`.

Source: **`playerdashboardbygeneralsplits`** — **6 groups in one call**: `DaysRestPlayerDashboard`,
`LocationPlayerDashboard`, `MonthPlayerDashboard`, `PrePostAllStarPlayerDashboard`, `StartingPosition`,
`WinsLossesPlayerDashboard`. Team equivalent: `teamdashboardbygeneralsplits`
(`TEAM_DAYS_REST_RANGE`, `TEAM_GAME_LOCATION`). **One call per player per season — 612 calls.**

**Priority, as researched:**
- **Essential**: DaysRest (→ factor A4) · Location · **StartingPosition** (→ the role_tier concept)
- Worthwhile: PrePostAllStar (→ the phase dimension)
- **⚠ WinsLosses — LEAKAGE RISK**: *"correlational, not causal… players play better in wins partly
  BECAUSE good play caused the win. Collect it, but don't naively feed it to a model."*
- Low: Month

### `nba_team.defense_vs_position` — 630 rows *(T5)*
`team_id`, `opponent_position`, `season`, **`games_sampled`**, `avg_pts_allowed`, `avg_reb_allowed`,
`avg_ast_allowed`, `avg_fg_pct_allowed`.
**PK `(team_id, opponent_position, season)` — season IS in the key**, so all three seasons coexist
(30 × 7 × 3 = 630 ✓). **Contrast with the splits tables, which omit it and therefore hold one.**
`source_key DEFAULT 'DERIVED_FROM_PLAYER_GAME_LOG'` · `data_quality DEFAULT 'derived'` — **provenance
declared in the schema itself**. `games_sampled` lets consumers gate by sample size.
**Computed entirely from data already in Postgres — zero new API calls**, unblocked by the position fix.
Spot-check: the best center-defence teams allow ~8–9 pts/game to opposing centers.

### `nba_stats.player_game_starter_status` — 32,179 rows *(T5)*`player_id`, `game_id`, **`start_position`**, **`is_starter`**, **`comment`** —
PK `(player_id, game_id)`.
**`comment` is the DNP/inactive reason field**, which is what lets the grader distinguish a real DNP
from a join failure (COMPASS fact 60).
**Live 2026-09-20: 1,230 games · 12,300 starters · 591 players — 2025-26 ONLY.** Owner-approved scope;
all three seasons would have cost ~3,690 calls.
**12,300 = 10 starters × 1,230 games** — an identity that only holds if every game parsed correctly.
**⚠ SOURCE MUST BE `boxscoretraditionalv3`.** v2 returns **HTTP 200 with zero player rows** on
historical games — 1,228 games once "succeeded" and yielded 799 rows where ~30,000 were expected.
v3 schema: flat per-player fields (`personId`, `position`, `comment`) nested under
`boxScoreTraditional.homeTeam.players` / `awayTeam.players`.

### `nba_stats.game_officials` — 3,681 rows *(T6)*
`game_id`, `official_id`, `nba_official_id`, `full_name`, **`jersey_num`**, ⚠⚠ **`assignment` — NULL on all 3,681 rows** *(verified live 2026-09-21, T6 pass 6)*: the scraper requests it (`o.get("assignment") or None`) and the worker writes it, but **`boxscoresummaryv3` never populates it**, so the `or None` yields a silent NULL every time. `assignment` is the crew **role** (crew chief / referee / umpire), so **the three officials of a game are an unordered set** and crew-chief-specific analysis is not possible. ⚠ **Also: `official_id` here is numeric (`nba_1629178`) while `nba_ref.officials.official_id` is name-derived (`nba_official_ray_acosta`) — the two tables join at 0%.** → `NBA_OPEN_ITEMS.md`. Other columns —
PK `(game_id, official_id)`. **1,227 of 1,230 games** (3 officials × 1,227 + partials).
**`assignment`** carries the crew role (crew chief / referee / umpire), not just presence.
`source_key DEFAULT 'NBA_GITHUB_COMMITTED_ONETIME_BACKFILL_V3'` — **the `_V3` is encoded in the
provenance**, so any row from the broken v2 path would be distinguishable.
**⚠ SOURCE MUST BE `boxscoresummaryv3`** — v2 is **documented unreliable after 2025-04-10**, the same
pattern as `boxscoretraditionalv2`.
**⚠ 3 games (all 2025-11-19) have NO officials on NBA.com's side** — the API returns an empty array.
0.24%, accepted, not a bug.
Spot-check: top officials work **65–66 games**, matching real full-time referee workloads (~65–70).

### `nba_team.lineup_profile` — 8,000 rows *(T6)*
`group_quantity` (2/3/4/5), `group_id`, **`player_ids TEXT[]`**, `group_name`, `team_id`, `season`,
then the full statistical line (`gp`, `w`, `l`, `w_pct`, `min`, shooting, `blka`, `pfd`, `pts`,
`plus_minus`).
**2,000 rows per group size.** Source: **`leaguedashlineups` — only 4 bulk calls**, one per size.
**`player_ids` is a genuine Postgres array**, so *"which lineups contain player X"* is a single
`player_ids @> ARRAY[...]` query rather than a join table. **This is what caused the array-literal
formatting bug**, fixed with a manually-built literal rather than `sql.array()`.
**⚠ PK must include `team_id`** — *"the same `group_id` can legitimately appear for two different teams
within a season (traded players who happened to pair up elsewhere too)."*

### Depth available vs depth taken *(T4)*
Box scores exist league-wide back to **1996-97**; advanced stats from **1997**.
**Only 3 seasons were taken (2023-24, 2024-25, 2025-26)** — deliberately.
*"historical depth is not the constraint — **scope discipline is**."* Beyond 5–6 seasons the data
*"predates the full pace-and-space era"* — a different sport, not merely older.

### Shot-quality trio *(T3 design, T4 build)*
| Table | PK | Notes |
|---|---|---|
| `nba_stats.player_shot_quality` | **(`player_id`, `close_def_dist_range`)** | `fga_frequency` ← **the shot-diet weight the delta formula needs**, `fgm`, `fga`, `fg_pct`, `efg_pct`, `fg3a_frequency`, `fg3_pct`. `data_quality` **`'real'`** |
| `nba_stats.player_shot_quality_delta` | `player_id` | `actual_efg_pct`, `expected_efg_pct`, `shot_quality_delta`, `total_fga`. `data_quality` **`'derived'`** — it is computed |
| `nba_stats.player_shot_zone_profile` | **(`player_id`, `zone`)** | `fgm`, `fga`, `fg_pct`. `data_quality` **`'real'`** |

**582/582 deltas computed.** Verified: **Jokić 61.9% actual eFG vs 53.8% expected = +8.06%.**
**⚠ `leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list** — unlike every other
stats.nba.com endpoint.

---

## 9. THE CERTIFIED BASELINE RESULT *(T8, carried in the live code header)*

**Both seasons, leg level, same configuration, no re-tuning:**
| | 2025-26 (2 seasons history) | 2024-25 holdout (2023-24 only) |
|---|---|---|
| Points ladder, 13 rungs | 0.9 pp | **1.2 pp** |
| Rebounds ladder | 0.7 pp | **0.8 pp** |
| Assists ladder | 1.4 pp | 0.7 pp |
| 3PM ladder | 1.3 pp | 1.1 pp |
| Confidence bands (n≥1000) over 2.5 pp | 3 of 76 | 3 of 77 |
| **Points/rebounds confidence bands** | **0 misses of 37** | **0 of 37** |

*"Every band with real volume hits its stated rate."* The three residual misses are the thinnest
"less" bands for assists and 3PM (n ≈ 1,800–3,400), all between 2.6 and 3.9 pp.

**The holdout was run with the band mean-ratio cells DISABLED**, because they had been fitted on
2024-25 — so the reported holdout is the core method (tiers, empirical tables, Platt) unaided.

**`classification_ladder_v12.py`'s header asserts these numbers**: *"Holdout 2024-25 unchanged
(1.2 / 0.8 / 0 of 37)."* **The harness checks itself against its own certified result on every run.**

### Known misses, documented in the same header
*"**blocks more 70–75: −4.3, n=3900** = P(0 blocks) under-predicted for ~1.5 bpg players, **persists at
any lambda**; blocks less 75–80: −2.6 thin; steals less 60–65: +3.6. **Holdout 2024-25 shows the same
signs.**"* — structural, reproducible, not noise.

### Rejected on data, recorded in the same header
*"**player-own L0 cells** (n=40–80; **regression-noise dominated**; ELITE rebounds ±7.7). **Off.**"*

---

## 10b. TWO OPERATIONAL PATTERNS FOR THE LIVE SYSTEM
*Source: T1, blueprint §4j. Recorded 2026-09-20.*

### 1. ⚠ Deliberately-duplicated files drift silently
> *"**Two files meant to be EXACT COPIES of each other CAN SILENTLY DRIFT OUT OF SYNC** — MLB found
> **a real case where a STATIC HTML FALLBACK FILE was A FULL VERSION BEHIND the actual deployed worker
> serving the same interface**, with **ONLY THE SELF-REPORTED VERSION STRING REVEALING THE DRIFT**;
> the actual functional content had stayed correctly in sync.
> **If NBA's own system keeps ANY deliberately-duplicated file (a static fallback, a mirrored config),
> PERIODICALLY VERIFY IT'S STILL IDENTICAL to its live counterpart rather than ASSUMING A 'KEPT IN
> SYNC' FILE STAYS THAT WAY ON ITS OWN.**"*

**NBA's duplicated pairs:**
| Pair | Sync status |
|---|---|
| `nba_config.role_tiers` (6 rows) ↔ `ROLE_TIERS` in the recipe | ✅ **verified identical 2026-09-20** |
| **`classification_config.minutes_mixture` ↔ the recipe's minutes logic** | ❌ **DRIFTED** — config specifies `dud_lognormal`, `tiered_inelastic`, per-team `E[min\|blowout]`; none implemented |
| `classification_ladder_v12.py` ↔ `combos_ladder_v1.py` constants | ⚠ unverified — each holds its own `LADDER_STEPS`, Wilson threshold |
| The certified recipe ↔ the production **patcher** | ✅ **anchor assertions fail loudly on drift** — the right pattern |

**The patcher's anchor assertions are the model**: they turn silent drift into a loud failure. **The
config↔code pairs have no equivalent**, which is why `minutes_mixture` drifted unnoticed.

**And note the MLB case's detail**: *"only the SELF-REPORTED VERSION STRING revealing the drift."*
**`baseline_ladder.recipe_version` exists per row** — so NBA has the version-string mechanism; **what
is missing is anything comparing it against the config's expectations.**

### 2. A stuck-looking job usually needs a WAIT, not a retry
> *"**When a job appears stuck in a running state with no progress, the correct response is usually to
> WAIT AND RE-CHECK VIA A LIGHTWEIGHT STATUS QUERY, NOT to repeatedly manually retry it.**
> MLB's system **holds a GLOBAL LOCK for a bounded window per acquisition**, and **a legitimate
> in-progress background cycle will correctly REJECT repeated manual re-triggers with a 'BUSY'
> response rather than a real failure — THAT'S THE SYSTEM BEHAVING SAFELY, NOT A BUG TO WORK
> AROUND.**
> **Give a stuck-looking job a real, meaningful wait (ON THE ORDER OF ONE TO TWO MINUTES) before
> concluding it needs manual intervention.**"*

**Directly relevant to NBA's operating model.** The build record is full of long-running jobs —
*"~1.5 h across all pairs"*, *"~50 min for six pairs"*, *"each call ~8 min"* — and **the documented
habit was to wait and re-check**, which matches.

**⚠ But NBA's dispatch is DIRECT, bypassing the queue and its lock** (the no-orchestrator rule). **So
the "busy" rejection MLB relies on may not exist here** — a re-trigger of an NBA worker mid-run may
start a second concurrent run rather than being refused.

**What NBA has instead**: **GitHub Actions concurrency groups** per pipeline
(`alphadog-nba-p1-weekly`, and P2/P3 equivalents), which serialise workflow runs. **That protects the
pipelines, not direct `run_job` calls to individual Workers.**

---

## 11. MLB tables referenced as models (never written by NBA)
`ref.teams` (16 cols: team_id, mlb_team_id, full_name, abbreviation, league, division, active…) ·
`ref.umpire_tendency` (11 cols: umpire_id, umpire_name, games_umpired, avg_strikeouts_per_game,
avg_walks_per_game, avg_runs_per_game…) — **the model for the NBA referee factor** ·
`config.worker_definitions` (116 workers, 16 cols) · `control.job_queue` (25 cols) ·
`control.worker_run_log` (10 cols) · `market.sleeper_board_current` (sport/league discriminator,
single-valued `baseball_mlb`/`MLB`) · `market.prizepicks_board_current` (`league='mlb'`)
`score.real_slip_leg_observations` · `control.user_placed_slips_log`

**All 12 MLB D1 bindings report FALSE** — MLB migrated to Postgres before the NBA build began.