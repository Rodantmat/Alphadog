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