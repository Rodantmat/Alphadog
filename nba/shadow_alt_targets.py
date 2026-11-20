#!/usr/bin/env python3
"""
SHADOW LIST - THE MODEL'S OWN TOP GOBLINS / DEMONS OF TODAY, FOR REAL QUOTES. (NBA_HONEST_REBUILD.md 8y, open item O17; owner 2026-11-19 22:16 PT: "go for it
as long is it does not take too long and delay too much the slips. Can it be done earlier than the last reports and have it pre ready?")

WHY. PrizePicks goblins / demons cannot be judged from history: their prices there are modelled, and a modelled price that is 3-5% generous looks like an
edge (rule C9). Real quotes exist for ~300 legs a day out of ~3,000, chosen in board order - almost never the legs the model itself would pick. This step
writes, right after the morning slate build (P2B, ~09:15 PT - hours BEFORE the last injury reports and the slips), the legs the model likes most, so the
midday quote run (nba-pp-payout-map.yml, delta mode, ~12:40 PT) quotes THOSE first inside its existing budget. Nothing else changes.

WHAT IT READS. nba_market.pp_leg_price (snapshot 'morning', today) - every goblin / demon on More with a stored modelled factor; nba_score.final_hp (today,
the morning build) - the pick-time chance of that exact rung. Modelled price = the same re-centred, bounded fit the honest leg tables use
(research_legs_h_build.COEF). predicted return = chance x price / 0.542 - 1.
WHAT IT WRITES. nba_score.honest_alt_targets (shadow; NO slip, score or screen reads it): the top SH_N legs (default 60; at most SH_PER_PLAYER a player) with
rank, chance, modelled price, predicted return. One set a day (replaced on a re-run). Read by pp_payout_map.py (delta) for ORDER only, and by the research
that will settle O17 once ~1,000 such legs carry a real quote.
Soft by design: any failure prints and exits 0 - it can never fail or delay a pipeline.
Env: DATABASE_URL, SH_DATE (ET slate date; default today ET), SH_N, SH_PER_PLAYER, SH_LABEL (morning).
"""
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PP_STAT = {"player_points": "Points", "player_rebounds": "Rebounds", "player_assists": "Assists", "player_threes": "3-PT Made", "player_points_rebounds": "Pts+Rebs",
           "player_points_assists": "Pts+Asts", "player_rebounds_assists": "Rebs+Asts", "player_points_rebounds_assists": "Pts+Rebs+Asts"}
DDL = """CREATE TABLE IF NOT EXISTS nba_score.honest_alt_targets (
  game_date date NOT NULL, rank int NOT NULL, player text NOT NULL, nm text NOT NULL, player_id text, base_market text NOT NULL, pp_stat text NOT NULL, prop text NOT NULL,
  side text NOT NULL, line numeric NOT NULL, kind text NOT NULL, chance double precision, price_model double precision, predicted_return double precision,
  price_source text, board_label text, built_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, nm, base_market, side, line))"""


def main():
    import research_legs_h_build as LH
    day = os.environ.get("SH_DATE") or datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
    N = int(os.environ.get("SH_N") or 60); PER = int(os.environ.get("SH_PER_PLAYER") or 2); label = os.environ.get("SH_LABEL") or "morning"
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = '120s'")
    conn.execute(DDL); conn.commit()
    df = pd.read_sql("""SELECT player, nm, base_market, side, line::float8 line, kind, tier, anchor_line::float8 anchor_line, factor::float8 f_model, price_source
                        FROM nba_market.pp_leg_price WHERE snapshot_label = %s AND game_date = %s AND kind IN ('standard', 'goblin', 'demon')
                          AND NOT coalesce(kind_position_mismatch, false) AND base_market = ANY(%s)""", conn, params=(label, day, list(PP_STAT)))
    if not len(df):
        print(f"SH|{day}: no '{label}' PrizePicks price rows - nothing written"); return
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    hp = pd.read_sql("SELECT player_id::text player_id, prop, line::float8 line, final_hp::float8 p FROM nba_score.final_hp WHERE game_date = %s AND side = 'Over'", conn, params=(day,))
    if not len(hp):
        print(f"SH|{day}: no final_hp rows yet - nothing written"); return
    df = df.drop_duplicates(["nm", "base_market", "side", "line"])
    std = df[df["kind"] == "standard"].groupby(["nm", "base_market"])["line"].first().rename("std_line")
    df = df.join(std, on=["nm", "base_market"]); df["std_line"] = df["std_line"].fillna(df["anchor_line"])
    a = df[df["kind"].isin(["goblin", "demon"]) & df["side"].str.lower().str.startswith("o") & df["f_model"].notna()].copy()
    a["prop"] = a["base_market"].map(LH.MK); a["player_id"] = a["nm"].map(ids); a = a[a["player_id"].notna()]
    lfm = np.log(np.clip(a["f_model"].values, .05, 50)); sl = np.maximum(1.0, a["std_line"].fillna(a["line"]).values)
    rel = (a["line"].values - a["std_line"].fillna(a["line"]).values) / sl; lvl = np.log(sl); tr = pd.to_numeric(a["tier"], errors="coerce").fillna(0).values
    m = np.ones(len(a)); pr = a["prop"].values
    for kd, b in LH.COEF.items():
        k = (a["kind"] == kd).values
        x = b[0] + b[1] * lfm[k] + b[2] * lfm[k] ** 2 + b[3] * rel[k] + b[4] * lvl[k] + b[5] * tr[k]
        for p_, c in LH.GRPC.items():
            x = x + b[c] * (pr[k] == p_)
        x = x + b[9] * np.isin(pr[k], list(LH.COMBO))
        m[k] = np.clip(np.exp(x), 0.535, 0.967) if kd == "goblin" else np.clip(np.exp(x), 1.097, 7.51)
    a["m"] = m
    a = a.merge(hp, on=["player_id", "prop", "line"], how="inner"); a["ret"] = a["p"] * a["m"] / 0.542 - 1
    n_all = len(a)
    a = a.sort_values("ret", ascending=False); a = a[a.groupby("player_id").cumcount() < PER]
    half = N // 2                                            # both kinds are in question: the best of each, then the rest by predicted return
    keep = pd.concat([a[a["kind"] == "goblin"].head(half), a[a["kind"] == "demon"].head(half)])
    keep = pd.concat([keep, a.drop(keep.index).head(N - len(keep))]).sort_values("ret", ascending=False).reset_index(drop=True)
    with conn.transaction():
        conn.execute("DELETE FROM nba_score.honest_alt_targets WHERE game_date = %s", (day,))
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.honest_alt_targets (game_date, rank, player, nm, player_id, base_market, pp_stat, prop, side, line, kind, chance, price_model,
                               predicted_return, price_source, board_label) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            [(day, i + 1, r.player, r.nm, r.player_id, r.base_market, PP_STAT[r.base_market], r.prop, "Over", r.line, r.kind, float(r.p), float(r.m), float(r.ret),
                              r.price_source, label) for i, r in enumerate(keep.itertuples())])
    conn.commit()
    print(f"SH|{day}: goblin / demon More legs with a chance and a price {n_all:,}; wrote {len(keep)} targets ({(keep['kind'] == 'goblin').sum()} goblins, {(keep['kind'] == 'demon').sum()} demons); "
          f"predicted return of the list {100 * keep['ret'].min():+.1f} .. {100 * keep['ret'].max():+.1f}%; already carrying a real quote {(keep['price_source'] != 'model').sum()}")
    for r in keep.head(10).itertuples():
        print(f"SH|  #{r.Index + 1} {r.player} {PP_STAT[r.base_market]} {r.kind} {r.line:g}: chance {r.p:.3f}, price {r.m:.3f}, predicted {100 * r.ret:+.1f}%")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 - soft by design
        print(f"SH|FAILED softly: {type(e).__name__}: {str(e)[:300]}")
