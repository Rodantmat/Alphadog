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

### MLB schemas (18, for reference only — never written by NBA)
`archive` · `backtest` · `calendar` · `certifier` · `classification` · `config` · `context` ·
`context_cert` · `control` · `daily` · `market` · `public` · `ref` · `score` · `scoring` ·
`stats_hitter` · `stats_pitcher` · `team`

### NBA schemas (14, created T1 in one statement)
`nba_ref` · `nba_calendar` · `nba_team` · `nba_stats` · `nba_daily` · `nba_context` · `nba_market` ·
`nba_archive` · `nba_score` · `nba_scoring` · `nba_backtest` · `nba_classification` · `nba_config` ·
`nba_control`

**NBA has no hitter/pitcher split** — one `nba_stats` where MLB has two.

---

## 1. `nba_ref` — reference / dictionary layer *(T1)*

### `nba_ref.teams`
The team dictionary. 30 active rows.
| Column | Type | Notes |
|---|---|---|
| `team_id` | TEXT | **PK** |
| `nba_team_id` | BIGINT | stats.nba.com's own stable TEAM_ID (e.g. 1610612737 = ATL) — unchanged for decades |
| `abbreviation` | TEXT | **was empty on first scrape** — `TeamAbbreviation` is not in `leaguestandingsv3`; fixed T1 |
| `full_name`, `nickname`, `location_name` | TEXT | |
| `conference`, `division` | TEXT | NBA-specific; MLB's `ref.teams` has AL/NL instead |
| `arena_id` | TEXT | → `nba_ref.arenas` |
| `active` | INTEGER | DEFAULT 1 |
| `source_key` | TEXT | e.g. `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`. **Only updates on rows that actually changed** — 25 of 30 kept old keys when data was identical |
| `raw_json` | JSONB | full source payload |
| `created_at`, `updated_at` | TIMESTAMPTZ | DEFAULT now() |

### `nba_ref.team_aliases` — 162 active rows
`alias_key` TEXT **PK** · `team_id` · `nba_team_id` BIGINT · `alias_value` · `alias_normalized` ·
`alias_type` · `source_key` · `confidence` · `active` INT DEFAULT 1 · `updated_at`

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

### `nba_ref.arenas` — 30 rows
| Column | Type | Notes |
|---|---|---|
| `arena_id` | TEXT | **PK** |
| `arena_name` | TEXT | current sponsor names (Rocket Arena, Frost Bank Center, Xfinity Mobile Arena) |
| `team_id`, `city`, `state` | TEXT | |
| `capacity` | INTEGER | **null where the SOURCE lacks it** — not a scrape failure |
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

### `nba_ref.referee_assignments` *(T15)*
Daily capture at 08:30 PT. **0 rows** — expected until the season opens.

---

## 2. `nba_config` — NBA control configuration *(T1)*

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
Holds `balldontlie_api_key`, and later `betr_access_token`. **Credentials never live in chat memory.**

### `nba_config.classification_config`
`config_key` · `config_json` JSONB · `notes` · `updated_at`. The system's decision record — every major
verdict is written here so it is queryable rather than trapped in a log. Keys include
`prizepicks_goblin_demon_tier_spec`, `board_payout_conversion_rules`, `rejected_on_data`,
`blowout_model_market_spread_2026_09_13`, `availability_model_n1v3_2026_09_15`,
`final_engine_complete_2026_09_18`, `storage_diet_plan_2026_09_17`,
`deferred_prizepicks_multiplier_capture`.

---

## 3. `nba_control` — run bookkeeping *(T1)*

### `nba_control.worker_run_log`
`log_id` BIGSERIAL **PK** · `request_id` · `run_id` · `worker_name` · `job_key` · `level` ·
`event_key` · `message` · `data_json` · `created_at`

### `nba_control.job_runs`
`run_id` TEXT **PK** · `job_key` · `worker_name` · `status` · `input_json` · `output_json` ·
`error_message` · `started_at` · `finished_at` · `created_at`

---

## 4. `nba_score` — the engine's output layer

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

### `nba_score.final_hp` — **38.7M rows, ~9.4 GB after VACUUM**
The final number per leg. `season, game_date, game_id, player_id, prop, line, side, ladder_offset,
anchor, baseline_hp, final_hp, cal_shift, score, edge, confidence, conf_tier, c_exist, c_quality,
c_market, prop_tier, band, phase, n_uncertain, built_at`.
**UNIQUE: `(game_date, player_id, prop, line, side)`** — `final_hp_uidx`, 5,024 MB, **259.9M scans**.
**Deliberately denormalised** — see OPEN_ITEMS; the duplicate columns buy backtest speed on 2 GB RAM.

### `nba_score.ladder_calibration_asof`
`season, as_of_date, prop, phase, band, side, log_odds_shift, n, source, built_at`.
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

### `nba_score.factor_gate_results`
`season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta, run_at`. Every factor verdict —
**results go in the database, not the CI log.**

### `nba_score.board_scored` *(live session)*
`game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id, baseline_hp,
cal_shift, final_hp, confidence, score, edge, interpolated, built_at`. The board-scoped output.

### Others
`nba_score.blowout_model` (35 rows) · `nba_score.tier_band_calibration` (149) ·
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

---

## 7. MLB tables referenced as models (never written by NBA)
`ref.teams` (16 cols: team_id, mlb_team_id, full_name, abbreviation, league, division, active…) ·
`ref.umpire_tendency` (11 cols: umpire_id, umpire_name, games_umpired, avg_strikeouts_per_game,
avg_walks_per_game, avg_runs_per_game…) — **the model for the NBA referee factor** ·
`config.worker_definitions` (116 workers, 16 cols) · `control.job_queue` (25 cols) ·
`control.worker_run_log` (10 cols) · `market.sleeper_board_current` (sport/league discriminator,
single-valued `baseball_mlb`/`MLB`) · `market.prizepicks_board_current` (`league='mlb'`)
`score.real_slip_leg_observations` · `control.user_placed_slips_log`

**All 12 MLB D1 bindings report FALSE** — MLB migrated to Postgres before the NBA build began.
</content>
</parameter>
<parameter name="message">docs: NBA database - full data dictionary from T1 DDL + live measurements