#!/usr/bin/env python3
"""
BOARD-SCOPED SCORER — the calculation half of P3.

WHAT IT SCORES. Every leg the apps actually OFFER: all prop lines, every ladder rung the app exposes
(PrizePicks alternates, Underdog's full rung set, Sleeper's variations, Fliff), BOTH directions, and
every variation - goblin, standard, demon. If it is on a board today, it gets a number.

WHAT IT DOES NOT SCORE. The internal +/-10 ladder for every player x 30 props (~140k rungs/day). That
matrix exists for backtesting and coverage work; live, a rung no app offers is a number nobody can use.

WHY P3 IS SHAPED THIS WAY (measured, not assumed). An earlier P3 rebuilt all 8 prop pairs and ran 35+
minutes without finishing - disqualifying for a pipeline that starts at 1:15 PM PT and must be done
before ~1:30. The cost is NOT per-leg scoring; it is REFITTING the recipe (tier tables, factor betas,
dispersion) over three seasons at ~8 minutes per pair. And that refit uses ONLY games strictly before
today, so it is IDENTICAL at 1 AM (P2) and 1:15 PM (P3). P3 refitting it was 64 minutes recomputing a
provably unchanged model.

So the cost here tracks BOARD SIZE and the NUMBER OF STATUS CHANGES - both bounded - and it keeps
scaling as the board grows with new goblins/demons and deeper ladders across four apps.

THE CHAIN, per board leg:
  1. board leg (player, prop, line, side, app, variation)
  2. HP from P2's ladder at that exact rung; if the app offers a rung OUTSIDE the built ladder range,
     interpolate from the two nearest rungs in log-odds (flagged, so it is visible)
  3. availability delta - if this player's team changed status since the day-before report, use the
     re-projected row from build_availability_delta.py instead
  4. as-of calibration shift (cells fitted strictly before today)
  5. confidence (measured deduction model) -> score (0-100, confidence ENHANCES) -> edge
  6. write nba_score.board_scored

Env: DATABASE_URL, BS_ASOF, BS_SEASON, BS_APPS (default all)
"""
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import psycopg

PT = timezone(timedelta(hours=-8))
BREAKEVEN = 0.560
CONF_NEUTRAL = 0.85

# MARKET KEY -> OUR PROP. Verified against the live board (2026-01-15, 21 distinct keys, 12 books) and
# against baseline_history's 30 props. This mapping is NOT optional string-stripping: a naive
# replace(market_key,'player_','') yields "points_rebounds_assists", which matches NOTHING in our
# baseline (we call it "pra") and would have silently dropped the six largest combo groups - PRA alone
# is 15,156 legs on that date. Every board key below has a verified home.
MARKET_TO_PROP = {
    "player_points": "points",
    "player_rebounds": "rebounds",
    "player_assists": "assists",
    "player_threes": "threes_made",            # board says "threes", we say "threes_made"
    "player_blocks": "blocks",
    "player_steals": "steals",
    "player_turnovers": "turnovers",
    "player_points_rebounds_assists": "pra",
    "player_points_rebounds": "pts_reb",
    "player_points_assists": "pts_ast",
    "player_rebounds_assists": "reb_ast",
    "player_blocks_steals": "stocks",          # we DO carry this one
    "player_double_double": "double_double",   # sentinel line -1.0, no ladder - handled below
}


def norm_market(mk: str) -> str:
    """board key -> our prop. '_alternate' marks a ladder rung, not a different market."""
    base = str(mk or "").replace("_alternate", "")
    return MARKET_TO_PROP.get(base, "")


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -20, 20)))


def main():
    asof = os.environ.get("BS_ASOF") or datetime.now(PT).date().isoformat()
    season = os.environ.get("BS_SEASON", "2025-26")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    # 1) THE BOARD - every leg offered today, every app, every rung, both directions.
    # SOURCE. Live, the board comes from OUR SCRAPERS (PrizePicks, Underdog, Sleeper, Fliff) - those
    # are the apps actually played, and they carry the DFS-only markets (fantasy_score, period props,
    # goblins/demons) that the Odds API feed does not. board_snapshots is the ODDS API archive: it has
    # 12 books and 21 market keys and is the right SIMULATION source for a past date, but it is NOT the
    # live board. BS_SOURCE selects; replay defaults to the archive because that is what exists for a
    # past date.
    source = os.environ.get("BS_SOURCE", "archive").lower()
    board = pd.read_sql("""
        SELECT b.bookmaker AS app, b.player, b.market_key, b.line, b.side, b.multiplier,
               m.player_id
        FROM nba_market.board_snapshots b
        LEFT JOIN nba_ref.player_name_map m
               ON m.norm_name = lower(regexp_replace(b.player,'[^A-Za-z]','','g'))
        WHERE b.game_date = %s
    """, conn, params=(asof,))
    if board.empty:
        print(f"No board legs for {asof}. Nothing to score.")
        return
    raw = len(board)
    board["prop"] = board["market_key"].map(norm_market)
    unmapped_keys = sorted(set(board.loc[board["prop"] == "", "market_key"]))
    if unmapped_keys:
        # LOUD, not silent. An unmapped key is a whole prop group scoring nothing.
        print(f"  UNMAPPED MARKET KEYS (these legs will NOT be scored): {unmapped_keys}", flush=True)
    board = board[board["prop"] != ""].copy()
    # double_double carries a sentinel line of -1.0 - it is a Yes/No market with no ladder
    dd = int((board["prop"] == "double_double").sum())
    board = board[~((board["prop"] == "double_double") & (board["line"] < 0))].copy()
    before = len(board)
    board = board.drop_duplicates(subset=["app", "player_id", "prop", "line", "side"])
    unmapped = int(board["player_id"].isna().sum())
    board = board[board["player_id"].notna()].copy()
    print(f"board legs for {asof} [{source}]: {raw:,} raw -> {len(board):,} scoreable "
          f"({unmapped:,} no player_id, {dd:,} double_double sentinel rows)", flush=True)
    print(f"  by app: {board.groupby('app').size().sort_values(ascending=False).head(8).to_dict()}", flush=True)
    print(f"  by prop: {board.groupby('prop').size().sort_values(ascending=False).head(12).to_dict()}", flush=True)

    # 2) HP FROM P2's LADDER at the exact rung
    lad = pd.read_sql("""
        SELECT player_id, prop, line, p_more, p_less, anchor, ladder_offset, role_tier, used_emp
        FROM nba_score.baseline_history WHERE game_date = %s AND season = %s
    """, conn, params=(asof, season))
    if lad.empty:
        print(f"ABORT: no baseline ladder for {asof} - P2 must run before P3.")
        raise SystemExit(1)
    lad["player_id"] = lad["player_id"].astype(str)
    lad["line"] = lad["line"].astype(float)
    board["player_id"] = board["player_id"].astype(str)
    board["line"] = board["line"].astype(float)

    d = board.merge(lad, on=["player_id", "prop", "line"], how="left")
    exact = int(d["p_more"].notna().sum())
    print(f"  exact ladder hits: {exact:,} / {len(d):,} ({exact/len(d):.1%})", flush=True)

    # 2b) rungs the app offers OUTSIDE our built ladder - interpolate in log-odds from the two nearest
    # rungs for that player+prop. Flagged so a deep alternate is never mistaken for a fitted rung.
    miss = d[d["p_more"].isna()]
    if len(miss):
        by = {(p, pr): g.sort_values("line") for (p, pr), g in lad.groupby(["player_id", "prop"])}
        fills = []
        for r in miss.itertuples(index=False):
            g = by.get((r.player_id, r.prop))
            if g is None or len(g) < 2:
                fills.append((np.nan, np.nan)); continue
            lo = g[g["line"] <= r.line].tail(1)
            hi = g[g["line"] >= r.line].head(1)
            if lo.empty or hi.empty:          # beyond both ends - clamp to the nearest fitted rung
                near = (lo if hi.empty else hi).iloc[0]
                fills.append((float(near["p_more"]), float(near["p_less"]))); continue
            l0, l1 = float(lo["line"].iloc[0]), float(hi["line"].iloc[0])
            w = 0.0 if l1 == l0 else (r.line - l0) / (l1 - l0)
            pm = sigmoid((1 - w) * logit(float(lo["p_more"].iloc[0])) + w * logit(float(hi["p_more"].iloc[0])))
            fills.append((float(pm), float(1 - pm)))
        d.loc[d["p_more"].isna(), "p_more"] = [f[0] for f in fills]
        d.loc[d["p_less"].isna(), "p_less"] = [f[1] for f in fills]
        d["interpolated"] = d.index.isin(miss.index)
        print(f"  interpolated off-ladder rungs: {int(d['interpolated'].sum()):,}", flush=True)
    else:
        d["interpolated"] = False

    d = d[d["p_more"].notna()].copy()
    d["baseline_hp"] = np.where(d["side"].str.lower().str.startswith("o"),
                                d["p_more"].astype(float), d["p_less"].astype(float))

    # 3) AVAILABILITY DELTA - teams whose status changed since the day-before report
    try:
        adj = pd.read_sql("""SELECT player_id, prop, line, side, new_hp
                             FROM nba_score.availability_delta WHERE game_date = %s""",
                          conn, params=(asof,))
        if not adj.empty:
            adj["player_id"] = adj["player_id"].astype(str); adj["line"] = adj["line"].astype(float)
            d = d.merge(adj, on=["player_id", "prop", "line", "side"], how="left")
            n_adj = int(d["new_hp"].notna().sum())
            d["baseline_hp"] = d["new_hp"].fillna(d["baseline_hp"]).astype(float)
            print(f"  legs re-projected from the day-of report: {n_adj:,}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"  no availability delta applied ({str(exc)[:60]})", flush=True)

    # 4) AS-OF CALIBRATION - the latest cell published at or before today
    ph = ("1_oct_nov" if datetime.fromisoformat(asof).month in (10, 11) else
          "2_dec_asb" if datetime.fromisoformat(asof).month in (12, 1) else
          "3_post_asb" if datetime.fromisoformat(asof).month in (2, 3) else "4_push")
    cal = pd.read_sql("""SELECT DISTINCT ON (prop, band, side) prop, band, side, log_odds_shift
                         FROM nba_score.ladder_calibration_asof
                         WHERE as_of_date <= %s AND phase = %s
                         ORDER BY prop, band, side, as_of_date DESC""", conn, params=(asof, ph))
    shift = {(r.prop, r.band, r.side): float(r.log_odds_shift) for r in cal.itertuples(index=False)}
    BANDS = [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]
    d["band"] = pd.cut(d["baseline_hp"], BANDS).astype(str)
    d["side_n"] = np.where(d["side"].str.lower().str.startswith("o"), "Over", "Under")
    d["cal_shift"] = [shift.get((p, b, s), 0.0) for p, b, s in zip(d["prop"], d["band"], d["side_n"])]
    d["final_hp"] = sigmoid(logit(d["baseline_hp"].values) + d["cal_shift"].values)

    # 5) CONFIDENCE (measured deductions) -> SCORE (0-100, confidence ENHANCES) -> EDGE
    cm = pd.read_sql("SELECT factor, deduction, base, floor FROM nba_score.confidence_model", conn)
    ded = {r.factor: float(r.deduction) for r in cm.itertuples(index=False) if float(r.deduction) > 0}
    BASE = float(cm["base"].iloc[0]) if not cm.empty else 99.0
    FLOOR = float(cm["floor"].iloc[0]) if not cm.empty else 55.0
    ROLE = {"IRON_MAN": 1.0, "HIGH_USAGE_STARTER": 0.97, "STARTER": 0.93,
            "ROTATION": 0.85, "BENCH": 0.70, "FRINGE": 0.50}
    books = d.groupby(["player_id", "prop", "line", "side"])["app"].transform("nunique").values
    fmap = {
        "f_complete": d["anchor"].notna().values.astype(float) * 0.4 + 0.6,
        "f_prov": np.where(d["used_emp"].fillna(False).values, 1.0, 0.30),
        "f_time": np.full(len(d), 1.0),
        "f_depth": np.clip(1.0 - np.abs(d["ladder_offset"].fillna(0).values) / 14.0, 0.25, 1.0),
        "f_role": d["role_tier"].map(ROLE).fillna(0.75).values,
        "f_vol": np.full(len(d), 0.75),
        "f_exp": np.full(len(d), 0.75),
        "f_books": np.clip(books / 4.0, 0, 1),          # corroboration ACROSS APPS
        "f_agree": np.full(len(d), 0.55),
        "f_phase": np.full(len(d), {"1_oct_nov": 0.80, "2_dec_asb": 1.00,
                                    "3_post_asb": 0.88, "4_push": 0.92}[ph]),
    }
    lost = np.zeros(len(d))
    for k, v in ded.items():
        if k in fmap:
            lost = lost + (1.0 - np.clip(fmap[k], 0, 1)) * v
    # an interpolated rung is genuinely less supported than a fitted one - say so
    lost = lost + np.where(d["interpolated"].values, 4.0, 0.0)
    d["confidence"] = np.clip(BASE - lost, FLOOR, 99.5) / 100.0

    hp100 = d["final_hp"].values * 100.0
    cdev = (d["confidence"].values - CONF_NEUTRAL) / (1.0 - CONF_NEUTRAL)
    lift = np.clip(cdev, 0, 1) * 0.50
    drop = np.clip(-cdev, 0, 1) * 0.35
    d["score"] = np.round(np.clip(hp100 + (100.0 - hp100) * lift - hp100 * drop, 0, 100), 2)
    d["edge"] = np.round((d["final_hp"].values - BREAKEVEN) * 100.0, 2)

    # 6) WRITE
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.board_scored (
            game_date date, season text, app text, player_id text, player text, prop text,
            line numeric, side text, kind text, tier int, game_id text,
            baseline_hp numeric, cal_shift numeric, final_hp numeric,
            confidence numeric, score numeric, edge numeric, interpolated boolean,
            built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS board_scored_uidx
            ON nba_score.board_scored (game_date, app, player_id, prop, line, side)""")
        cur.execute("DELETE FROM nba_score.board_scored WHERE game_date = %s", (asof,))
        cur.executemany("""INSERT INTO nba_score.board_scored
            (game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id,
             baseline_hp, cal_shift, final_hp, confidence, score, edge, interpolated)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (game_date, app, player_id, prop, line, side) DO UPDATE SET
              final_hp=EXCLUDED.final_hp, confidence=EXCLUDED.confidence,
              score=EXCLUDED.score, edge=EXCLUDED.edge""",
            [(asof, season, r.app, r.player_id, r.player, r.prop, float(r.line), r.side_n,
              r.kind, int(r.tier) if r.tier == r.tier else None, r.game_id,
              round(float(r.baseline_hp), 5), round(float(r.cal_shift), 5), round(float(r.final_hp), 5),
              round(float(r.confidence), 4), float(r.score), float(r.edge), bool(r.interpolated))
             for r in d.itertuples(index=False)])
    conn.commit()
    print(f"\nscored {len(d):,} board legs for {asof}", flush=True)
    print(f"  mean final_hp {d['final_hp'].mean():.4f}  mean confidence {d['confidence'].mean():.4f}  "
          f"mean score {d['score'].mean():.1f}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
