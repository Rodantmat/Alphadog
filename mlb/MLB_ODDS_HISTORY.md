# MLB odds history and postseason keep-up (2026-10-08)

Owner direction (2026-10-08): mine the Odds API for MLB the same way the NBA back data was mined — a mirror, at MLB's own
board times — for the current season and the past season, postseason included; keep mining the 2026 postseason to the end;
backfill the match odds (game lines) too. The MLB system will be rebuilt NBA-style for 2027; these tables are its back data.
Nothing here edits MLB code (`main.py`, `scrape.yml`, the MLB workers) or MLB's own tables; everything lives in `mlb/` and in
new `market.mlb_*` tables.

## 1. What MLB already had before this (unchanged)
| store | content | span |
|---|---|---|
| `archive.board_leg_history` | our own live boards PrizePicks / Underdog (ParlayAPI) / Sleeper, 3 captures a day | 2026-07-16 → 2026-09-27 |
| `archive.market_prop_context_history` | ParlayAPI sportsbook + DFS prop context (live + hist) | 2026-07-24 → 2026-09-27 |
| `archive.game_odds_context_history` | game odds (BetMGM, DraftKings, ESPN Bet, FanDuel) | 2026-07-24 → 2026-09-27 |
| `market.historical_props_2025` | Odds API sportsbook props, 4 markets, a 51-day sample | 2025-03-18 → 2025-09 |

**MLB board times** (measured on `archive.board_leg_history`, Aug–Sep 2026): captures cluster at **09:00, 13:00 and 17:00 PT**;
09:00 is the morning board slips are placed from (`BACKTEST_LAYOUTS_AND_9AM_METHODOLOGY.md`).

## 2. The Odds API mirror — `mlb/backfill_mlb_odds.py`, `.github/workflows/mlb-odds-backfill.yml`
* Per game, a snapshot at each board time (labels `pt0900`, `pt1300`, `pt1700`) that falls before first pitch (−5 min).
* All 37 MLB player-prop markets (20 base + 17 `_alternate`), regions `us_dfs,us` — PrizePicks, Underdog, Pick6 and nine US
  books (DraftKings, FanDuel, BetMGM, Caesars, BetRivers, Fanatics, Bovada, BetOnline, MyBookie). Same shape as the NBA history.
* Game lines (h2h / spreads / totals, region us) at the same three times per date.
* Events are re-listed at each board time (MLB re-keys events after rainouts / doubleheader changes; the 08:00 id can 404 later).
* **Storage, lossless:** each API response whole as jsonb — `market.mlb_odds_event_snapshots` (one row per event × label,
  ~70 KB compressed) and `market.mlb_odds_game_lines`; the view **`market.mlb_board_snapshots_v`** expands them into the NBA
  `board_snapshots` columns (game_date, event_id, snapshot_label, bookmaker, market_key, player, side, line, price, multiplier …).
  Log: `market.mlb_odds_backfill_log` (ok / empty / error per event × label).
* **Cost (measured):** 10 credits × markets returned × regions → 620–720 credits per snapshot; events list 1; game lines 30.
  Resumable (nothing fetched twice), 8 date shards in parallel, stops at a credit floor.

### Coverage at the end of the 2026-10 credit month (credits ran to the floor, ≈ 6.5 k left)
| | 09:00 | 13:00 | 17:00 |
|---|---|---|---|
| 2025 regular season (2,449 games) | complete (3 games had no 09:00 board) | missing 295 games (late Aug → Sep) | missing 85 games |
| 2025 postseason (47 games) | complete | complete | complete |
| 2026 opening day → Jul 15 (1,317 games pulled) | 12 dates not reached (Jun 23 → Jul 15) | same | same |
| 2026 Jul 16 → Sep 27 | held from our own scrapers + ParlayAPI (not re-mined) | | |
| 2026 postseason → Oct 7 (23 games) | complete | not reached | not reached |
**Leftover to mine later (owner: "in the future"):** ≈ 560 k credits — rerun `mlb-odds-backfill.yml` with the same date
ranges/labels; it only fetches what is missing.

## 3. Keeping the 2026 postseason (owner: "to the end of the season")
* **`mlb-live-market.yml` → `mlb/capture_mlb_live_market.py`** (09:05 / 13:05 / 17:05 PDT, independent of Odds API credits):
  archives our own live MLB board files (PrizePicks from `scrape.yml`, Underdog / Sleeper / Fliff / Betr from their 2-hourly
  workflows) raw into `market.mlb_live_market_captures` with their real fetch time (a file older than 4 h is kept and flagged
  `stale`), plus the ParlayAPI MLB props board (all books + PrizePicks / Underdog / Sleeper / Betr / Pick6; 3 credits; retried on
  503 "busy"); and once a day yesterday's ParlayAPI closing game lines into `market.mlb_game_lines_closing`.
* **`mlb-odds-daily.yml`** (02:30 PT): pulls the last three days into the Odds API mirror while the paid key has credits.
* **Match odds backfill:** ParlayAPI closing game lines for every date 2025-03-17 → 2026-10-07 (10 credits/date) into
  `market.mlb_game_lines_closing`.
* Retire both workflows after the World Series, or keep them for 2027.

## 4. Known source gaps (recorded, not ours to fix here)
* Betr MLB board file last refreshed 2026-09-10 (the Betr harvest runs for NBA only) — captured as `stale`.
* MLB's own database archive of the live boards (`archive.board_leg_history`) stops at 2026-09-27; the captures above cover
  the postseason.
