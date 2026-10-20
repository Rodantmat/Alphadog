#!/usr/bin/env python3
"""
DERIVED PRIZEPICKS PROPS FROM BOX SCORES (2026-10-20, owner: "make a derived, like fantasy score and this kind of things that we did
not have for the past two seasons, but we have the base data, so we can make a reliable derived simulation ... certify your math").
READ-ONLY.

PrizePicks posts ~25 NBA prop types we never archived before 2026-10-20 (Fantasy Score, FG / FT / 2-PT / 3-PT attempts and makes,
offensive / defensive rebounds, personal fouls, double-double ...). No historical line exists, so a line is DERIVED:
  line(prop, player, day) = floor(r_prop x base) + 0.5      base = 0.5 x EWMA(prior games, alpha 0.15) + 0.5 x prior-season mean
                                                             (as-of: only games BEFORE the day; no prior season -> EWMA alone)
  r_prop = the median of (PrizePicks' real standard line / base) on the live board (2026-10-20 / 21 window boards).
STEP 1 - PROVE THE METHOD where the truth is known: the same one-board calibration is done for the main props (points, rebounds,
  assists, threes, steals, blocks, turnovers, PRA, combos) on the SAME live board, applied to 2024-25 and 2025-26, and compared with
  the REAL PrizePicks lines of those seasons (nba_market.prop_universe, line_source 'real'): mean signed error, share within 0.5 /
  1.0, the Over rate at the derived vs the real line, and the share of legs whose More / Less result is the same at both lines.
STEP 2 - for the unmapped props: the base Over rate at the derived line per season (a structurally easy side shows here), and the
  same numbers on the main props for comparison. Whole-number derived lines (x.0) never occur (grid x.5), so there are no pushes.
Props that need data we do not have (dunks; two-player '(combo)' lines; quarters - separate quarter logs) are listed, not derived.
Env: DATABASE_URL, DP_BOARD_DATES (default 2026-10-20,2026-10-21).
"""
import os

import numpy as np
import pandas as pd
import psycopg

BOARD_DATES = [d.strip() for d in os.environ.get("DP_BOARD_DATES", "2026-10-20,2026-10-21").split(",") if d.strip()]

# PrizePicks market key -> box-score expression (pandas columns of nba_stats.player_game_log)
DERIVED = {
    "player_fantasy_points": "fantasy",       # PrizePicks NBA Fantasy Score: pts + 1.2 reb + 1.5 ast + 3 stl + 3 blk - tov
    "player_fga": "fga", "player_fgm": "fgm", "player_fta": "fta", "player_ftm": "ftm",
    "player_two_pointers_attempted": "fg2a", "player_two_pointers_made": "fg2m",
    "player_threes_attempted": "fg3a", "player_oreb": "oreb", "player_dreb": "dreb", "player_personal_fouls": "pf",
}
MAIN = {
    "player_points": "pts", "player_rebounds": "reb", "player_assists": "ast", "player_threes": "fg3m", "player_steals": "stl",
    "player_blocks": "blk", "player_turnovers": "tov", "player_points_rebounds_assists": "pra", "player_points_rebounds": "pr",
    "player_points_assists": "pa", "player_rebounds_assists": "ra", "player_blocks_steals": "stk",
}
MAIN_PROP = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made",
             "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers", "player_points_rebounds_assists": "pra",
             "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast",
             "player_blocks_steals": "stocks"}
NOT_DERIVABLE = {"player_dunks": "no per-game dunk counts in the box-score tables",
                 "player_points_(combo)": "two players' sum - the pairing is PrizePicks' (not archived historically)",
                 "player_rebounds_(combo)": "as above", "player_assists_(combo)": "as above", "player_3-pt_made_(combo)": "as above",
                 "player_quarters_with_3+_points_alternate": "needs the quarter logs (separate files) - next step",
                 "player_quarters_with_5+_points_alternate": "as above"}


def load():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        gl = pd.read_sql("""SELECT nba_player_id::bigint pid, game_date, season, min::float min, pts::float pts, reb::float reb, ast::float ast,
                                   fg3m::float fg3m, fg3a::float fg3a, fgm::float fgm, fga::float fga, ftm::float ftm, fta::float fta,
                                   oreb::float oreb, dreb::float dreb, pf::float pf, stl::float stl, blk::float blk, tov::float tov
                            FROM nba_stats.player_game_log WHERE min > 0 AND season IN ('2023-24', '2024-25', '2025-26')""", c)
        keys = list(DERIVED) + list(MAIN)
        board = pd.read_sql("""SELECT DISTINCT ON (s.game_date, m.player_id, s.market_key) s.game_date, m.player_id::bigint pid, s.player, s.market_key,
                                      s.line::float line
                               FROM nba_market.board_snapshots s JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(s.player)
                               WHERE s.bookmaker = 'prizepicks' AND s.side = 'Over' AND s.game_date = ANY(%s::date[]) AND s.market_key = ANY(%s)
                               ORDER BY s.game_date, m.player_id, s.market_key, array_position('{window,close,routine,morning}'::text[], s.snapshot_label),
                                        s.snapshot_ts DESC""", c, params=(BOARD_DATES, keys))
        real = pd.read_sql("""SELECT player_id::bigint pid, game_date, prop, percentile_disc(0.5) WITHIN GROUP (ORDER BY line)::float line,
                                     max(stat_actual)::float actual, max(season) season
                              FROM nba_market.prop_universe WHERE line_source = 'real' AND kind = 'standard' AND side = 'Over'
                                AND player_id ~ '^[0-9]+$' GROUP BY 1, 2, 3""", c)
    return gl, board, real


def add_stats(gl):
    gl = gl.sort_values(["pid", "game_date"]).copy()
    gl["fantasy"] = gl.pts + 1.2 * gl.reb + 1.5 * gl.ast + 3 * gl.stl + 3 * gl.blk - gl.tov
    gl["fg2a"] = gl.fga - gl.fg3a
    gl["fg2m"] = gl.fgm - gl.fg3m
    gl["pra"] = gl.pts + gl.reb + gl.ast
    gl["pr"] = gl.pts + gl.reb
    gl["pa"] = gl.pts + gl.ast
    gl["ra"] = gl.reb + gl.ast
    gl["stk"] = gl.stl + gl.blk
    # as-of minutes (prior games only) - board composition is filtered on THIS, never on the game's own minutes (leakage)
    gl["min_asof"] = gl.groupby("pid")["min"].transform(lambda s: s.shift(1).ewm(alpha=0.15, adjust=False).mean())
    return gl


def base_series(gl, col):
    """as-of base per game row: 0.5 EWMA of prior games + 0.5 prior-season mean (EWMA alone without a prior season)"""
    g = gl.groupby("pid")[col]
    ewm = g.transform(lambda s: s.shift(1).ewm(alpha=0.15, adjust=False).mean())
    sm = gl.groupby(["pid", "season"])[col].mean().rename("prev").reset_index()
    sm["season"] = sm["season"].map({"2023-24": "2024-25", "2024-25": "2025-26", "2025-26": "2026-27"})
    prev = gl[["pid", "season"]].merge(sm, on=["pid", "season"], how="left")["prev"].values
    return np.where(np.isnan(prev), ewm.values, 0.5 * ewm.values + 0.5 * prev)


def live_base(gl, col):
    """the base for a live 2026-27 board day (no 2026-27 games yet): 0.5 EWMA through the last game + 0.5 the 2025-26 mean"""
    out = {}
    last = gl[gl.season == "2025-26"].groupby("pid")[col].mean()
    for pid, s in gl.groupby("pid")[col]:
        e = s.ewm(alpha=0.15, adjust=False).mean().iloc[-1]
        out[pid] = 0.5 * e + 0.5 * last[pid] if pid in last.index else e
    return out


def main():
    gl, board, real = load()
    gl = add_stats(gl)
    print(f"game logs {len(gl):,}; live board standard lines {len(board):,} on {BOARD_DATES}; real historical lines {len(real):,}", flush=True)
    ratios = {}
    print("\nCALIBRATION ON THE LIVE BOARD (r = median line / base; spread = the 25th-75th percentile of the ratio):", flush=True)
    for key, col in {**MAIN, **DERIVED}.items():
        b = board[board.market_key == key]
        if len(b) < 8:
            print(f"  {key:<34} only {len(b)} live lines - skipped", flush=True)
            continue
        lb = live_base(gl[gl.pid.isin(b.pid)], col)
        x = np.array([lb.get(p, np.nan) for p in b.pid])
        ok = np.isfinite(x) & (x > 0.2)
        rr = b.line.values[ok] / x[ok]
        if ok.sum() < 8:
            print(f"  {key:<34} {ok.sum()} lines with history - skipped", flush=True)
            continue
        ratios[key] = float(np.median(rr))
        print(f"  {key:<34} n {ok.sum():>4}  r {ratios[key]:.3f}  (p25 {np.percentile(rr, 25):.3f}, p75 {np.percentile(rr, 75):.3f})", flush=True)

    # STEP 1 - the method against the truth (main props)
    print("\nSTEP 1 - DERIVED vs REAL PrizePicks lines, main props (r from the live board only; 2024-25 / 2025-26 history):", flush=True)
    print(f"  {'prop':<12} {'season':<8} {'n':>7} {'bias':>6} {'|err|<=0.5':>10} {'<=1.0':>6} {'over real':>9} {'over derived':>12} {'same result':>11}", flush=True)
    for key, col in MAIN.items():
        if key not in ratios:
            continue
        gl[f"b_{col}"] = base_series(gl, col)
        d = real[real.prop == MAIN_PROP[key]].merge(gl[["pid", "game_date", f"b_{col}"]], on=["pid", "game_date"], how="inner")
        d = d[np.isfinite(d[f"b_{col}"]) & d.actual.notna() & (d.actual != d.line)]
        d["dl"] = np.floor(ratios[key] * d[f"b_{col}"]) + 0.5
        for s in ("2024-25", "2025-26"):
            e = d[d.season == s]
            if len(e) < 200:
                continue
            err = e.dl - e.line
            o_r, o_d = (e.actual > e.line), (e.actual > e.dl)
            print(f"  {MAIN_PROP[key]:<12} {s:<8} {len(e):>7,} {err.mean():>+6.2f} {np.mean(np.abs(err) <= 0.5):>10.3f} {np.mean(np.abs(err) <= 1.0):>6.3f} "
                  f"{o_r.mean():>9.3f} {o_d.mean():>12.3f} {np.mean(o_r == o_d):>11.3f}", flush=True)

    # STEP 2 - the unmapped props at their derived lines
    print("\nSTEP 2 - UNMAPPED PROPS at the derived line (as-of base, r from the live board): Over rate per season, legs with a prior season", flush=True)
    print(f"  {'market':<34} {'r':>6} {'season':<8} {'n':>7} {'mean line':>9} {'over':>6} {'under':>6}", flush=True)
    for key, col in DERIVED.items():
        if key not in ratios:
            continue
        gl[f"b_{col}"] = base_series(gl, col)
        for s in ("2024-25", "2025-26"):
            e = gl[(gl.season == s) & np.isfinite(gl[f"b_{col}"]) & (gl[f"b_{col}"] > 0.2) & (gl["min_asof"] >= 15)]
            dl = np.floor(ratios[key] * e[f"b_{col}"]) + 0.5
            ov = (e[col] > dl).mean()
            print(f"  {key:<34} {ratios[key]:>6.3f} {s:<8} {len(e):>7,} {dl.mean():>9.2f} {ov:>6.3f} {1 - ov:>6.3f}", flush=True)
    print("\nNOT DERIVED: " + "; ".join(f"{k} ({v})" for k, v in NOT_DERIVABLE.items()), flush=True)
    print("\nReading: STEP 1 says how far a one-board calibration can be trusted (same result = the share of legs graded identically at the "
          "derived and the real line). STEP 2's Over rates hold only as far as STEP 1 holds; legs restricted to players averaging 15+ minutes "
          "BEFORE the game (as-of; the live board lists rotation players).", flush=True)


if __name__ == "__main__":
    main()
