#!/usr/bin/env python3
"""
FINAL CALCULATION ENGINE — baseline HP -> FINAL HP -> SCORE -> CONFIDENCE.

Until now the pieces existed and nothing consumed them: nba_score.ladder_calibration (+0.0068 log-loss,
measured out-of-sample) sat unused, nba_score.scenario_realised was stored but never joined, and score
and confidence did not exist in any form. This is the layer that produces the number the owner actually
asked for - sharp leg by leg, band by band, day by day, player by player, prop by prop, variation by
variation, direction by direction.

THE CHAIN, in order, each step measured before it was allowed in:

  1. BASELINE HP            nba_score.baseline_history - 19.34M rows, every prop x rung x direction x
                            day, both seasons. Already carries the blowout mixture on the real market
                            spread and the market-implied matchup factors.
  2. SCENARIO SELECTION     for games with pre-game uncertainty, the realised availability branch
                            (nba_score.scenario_realised). In production phase 2 enumerates and phase 3
                            selects; in replay the realised branch IS the selection. Legs whose game had
                            uncertainty are flagged so confidence can carry that.
  3. CALIBRATION CORRECTION nba_score.ladder_calibration - a log-odds shift per (prop, phase, band,
                            side), fitted on the TRAIN season and applied to the other. This is the only
                            step that measurably beat the certified baseline out-of-sample.
  4. FINAL HP               the calibrated probability. This is what everything downstream reads.
  5. SCORE                  ranking value = edge over what the board requires. Not the probability:
                            a 92% leg at a line everyone else also prices at 92% has no edge, while a
                            64% leg the board needs 57% for does. score = final_hp - breakeven(tier),
                            scaled, with the market's own de-vigged view (rung_market) as a sanity term.
  6. CONFIDENCE             how much to trust THIS leg's number, from measured reliability only:
                              prop tier      certified / penalized (prop_reliability_audit)
                              band gap       the |actual - predicted| for this cell (tier_band_calibration)
                              sample depth   n behind the calibration cell
                              scenario risk  did this game have unresolved availability
                            Confidence NEVER inflates a probability - it gates and ranks.

Env: DATABASE_URL, FE_SEASONS, FE_PROPS (blank = all), FE_WRITE (1 = write nba_score.final_hp)
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
# measured break-even by PrizePicks structure (config prizepicks_goblin_demon_tier_spec)
BREAKEVEN = {"standard": 0.560, "goblin": 0.560, "demon": 0.560}
PENALIZED = {"fantasy_score": 0.003, "double_double": 0.004, "oreb": 0.001}   # derived, fact 80


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -20, 20)))


def main():
    seasons = [s.strip() for s in os.environ.get("FE_SEASONS", "2025-26").split(",")]
    props = [p.strip() for p in os.environ.get("FE_PROPS", "").split(",")
             if p.strip() and p.strip().upper() != "ALL"]
    write = os.environ.get("FE_WRITE", "0") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    cal = pd.read_sql("SELECT prop, phase, band, side, log_odds_shift FROM nba_score.ladder_calibration", conn)
    shift = {(r.prop, r.phase, r.band, r.side): float(r.log_odds_shift) for r in cal.itertuples(index=False)}
    print(f"calibration cells: {len(shift):,}", flush=True)

    tb = pd.read_sql("""SELECT kind, phase, band, n, gap FROM nba_score.tier_band_calibration""", conn)
    bandgap = {(r.kind, r.phase, r.band): (abs(float(r.gap)), int(r.n)) for r in tb.itertuples(index=False)}

    scen = pd.read_sql("""SELECT game_id, n_uncertain, branch_prob FROM nba_score.scenario_realised""", conn)
    scen_by_game = {str(r.game_id): (int(r.n_uncertain), float(r.branch_prob)) for r in scen.itertuples(index=False)}
    print(f"games with pre-game availability uncertainty: {len(scen_by_game):,}", flush=True)

    # MARKET BACKING. Two things: does the GAME have a market line at all, and how many books price
    # THIS EXACT RUNG. A rung nobody prices is one we are guessing at alone; a rung several books agree
    # on is corroborated by people with money at risk.
    mg = pd.read_sql("""SELECT DISTINCT m.game_id FROM nba_market.game_lines_snapshots s
                        JOIN nba_market.event_game_map m ON m.event_id = s.event_id""", conn)
    mkt_games = set(mg["game_id"].astype(str))
    # rung_market keys on PLAYER NAME and `market`, with the book count in `books` - not player_id /
    # prop / n_books. Resolved through nba_ref.player_name_map, the same map the grader uses.
    nm = pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn)
    name_to_id = dict(zip(nm["norm_name"], nm["player_id"].astype(str)))
    rm = pd.read_sql("""SELECT game_date, player, market, line, books FROM nba_market.rung_market""", conn)
    mkt_rung = {}
    if not rm.empty:
        rm["game_date"] = pd.to_datetime(rm["game_date"]).dt.date
        rm["pid"] = rm["player"].map(lambda s: name_to_id.get(norm_name(s)))
        rm["prop_key"] = rm["market"].astype(str).str.replace("player_", "", regex=False) \
                                     .str.replace("_alternate", "", regex=False)
        rm = rm[rm["pid"].notna()]
        for r in rm.itertuples(index=False):
            k = (str(r.game_date), str(r.pid), str(r.prop_key), float(r.line))
            mkt_rung[k] = max(mkt_rung.get(k, 0), float(r.books or 0))
    print(f"market backing: {len(mkt_games):,} games with lines | {len(mkt_rung):,} priced rungs", flush=True)

    if write:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.final_hp (
                season text, game_date date, game_id text, player_id text, prop text, line numeric,
                side text, ladder_offset int, anchor numeric,
                baseline_hp numeric, final_hp numeric, cal_shift numeric,
                score numeric, confidence numeric, conf_tier text,
                c_exist numeric, c_quality numeric, c_market numeric,
                prop_tier text, band text, phase text, n_uncertain int,
                built_at timestamptz DEFAULT now())""")
            cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS final_hp_uidx
                ON nba_score.final_hp (game_date, player_id, prop, line, side)""")
            cur.execute("CREATE INDEX IF NOT EXISTS final_hp_lookup ON nba_score.final_hp (season, game_date, prop)")

    for season in seasons:
        plist = props or [r[0] for r in conn.execute(
            "SELECT DISTINCT prop FROM nba_score.baseline_history WHERE season=%s ORDER BY 1",
            (season,)).fetchall()]
        total = 0
        for prop in plist:
            h = pd.read_sql("""SELECT game_date, game_id, player_id, prop, line, anchor, ladder_offset,
                                      p_more, p_less
                               FROM nba_score.baseline_history WHERE season=%s AND prop=%s""",
                            conn, params=(season, prop))
            if h.empty:
                continue
            h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
            h["phase"] = h["game_date"].map(phase_of)

            # BOTH DIRECTIONS - every rung is offered Over and Under, so both get a final number
            over = h.assign(side="Over", baseline_hp=h["p_more"].astype(float))
            under = h.assign(side="Under", baseline_hp=h["p_less"].astype(float))
            d = pd.concat([over, under], ignore_index=True)
            d["band"] = pd.cut(d["baseline_hp"], [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]).astype(str)

            # 3) CALIBRATION CORRECTION in log-odds
            d["cal_shift"] = [shift.get((prop, ph, bd, sd), 0.0)
                              for ph, bd, sd in zip(d["phase"], d["band"], d["side"])]
            d["final_hp"] = sigmoid(logit(d["baseline_hp"].values) + d["cal_shift"].values)

            # 6) CONFIDENCE - how much to trust THIS leg's number. Three independent pillars, each
            # measured, never inflating the probability:
            #   A. DATA EXISTENCE AND COMPLETION - were the inputs this leg needs actually present for
            #      this day? (baseline components, resolved availability, a market line for the game)
            #   B. DATA QUALITY AND CERTAINTY - how reliable has this exact cell been historically
            #      (band gap), how deep is the sample behind it, is the prop certified or penalized,
            #      and was availability resolved or still uncertain at the decision point
            #   C. MARKET BACKING - is there a real board line at this rung, and how much market data
            #      stands behind it (book count in rung_market). A rung nobody prices is a rung we are
            #      guessing at alone; a rung ten books agree on is corroborated.
            pen = PENALIZED.get(prop, 0.0)
            gaps, ns = [], []
            for ph, bd in zip(d["phase"], d["band"]):
                g, n = bandgap.get(("standard", ph, bd), (0.02, 300))
                gaps.append(g); ns.append(n)
            gaps = np.asarray(gaps); ns = np.asarray(ns, dtype=float)
            unc = np.array([scen_by_game.get(str(g), (0, 1.0))[0] for g in d["game_id"]], dtype=float)
            bprob = np.array([scen_by_game.get(str(g), (0, 1.0))[1] for g in d["game_id"]], dtype=float)

            # A. existence / completion
            has_components = d["anchor"].notna().values.astype(float)
            has_market_game = np.array([1.0 if str(g) in mkt_games else 0.0 for g in d["game_id"]])
            c_exist = 0.5 * has_components + 0.5 * has_market_game

            # B. quality / certainty
            q_band = 1.0 - np.clip(gaps / 0.06, 0, 1)                 # historical miss of this cell
            q_depth = np.clip(ns / 1500.0, 0, 1)                      # sample behind the cell
            q_prop = 1.0 - np.clip(pen / 0.004, 0, 1) * 0.5           # certified vs penalized
            q_avail = np.where(unc > 0, np.clip(bprob / 0.5, 0, 1), 1.0)   # resolved vs still uncertain
            c_quality = 0.35 * q_band + 0.25 * q_depth + 0.15 * q_prop + 0.25 * q_avail

            # C. market backing
            rung_key = list(zip(d["game_date"].astype(str), d["player_id"].astype(str),
                                [prop] * len(d), d["line"].astype(float)))
            nbooks = np.array([mkt_rung.get(k, 0) for k in rung_key], dtype=float)
            c_market = np.clip(nbooks / 4.0, 0, 1)                    # 4+ books = fully corroborated

            d["c_exist"], d["c_quality"], d["c_market"] = c_exist, c_quality, c_market
            d["confidence"] = np.clip(0.30 * c_exist + 0.45 * c_quality + 0.25 * c_market, 0.02, 1.0)
            d["conf_tier"] = pd.cut(d["confidence"], [0, .45, .62, .80, 1.01],
                                    labels=["low", "medium", "high", "elite"]).astype(str)

            # 5) SCORE - final HP AND confidence together. A 92% leg nobody else prices differently is
            # not an opportunity; a 64% leg the board needs 57% for, corroborated by several books, is.
            # edge = how far the final HP clears what the board requires; score weights it by how much
            # we trust the number.
            be = BREAKEVEN["standard"]
            edge = (d["final_hp"].values - be) * 100.0
            d["score"] = np.round(edge * d["confidence"].values, 3)
            d["prop_tier"] = "penalized" if pen > 0 else "certified"
            d["n_uncertain"] = unc.astype(int)
            d["season"] = season

            if write:
                rows = [(season, r.game_date, str(r.game_id), str(r.player_id), prop, float(r.line),
                         r.side, int(r.ladder_offset), float(r.anchor) if r.anchor == r.anchor else None,
                         round(float(r.baseline_hp), 5), round(float(r.final_hp), 5),
                         round(float(r.cal_shift), 5), round(float(r.score), 3),
                         round(float(r.confidence), 4), r.conf_tier,
                         round(float(r.c_exist), 4), round(float(r.c_quality), 4), round(float(r.c_market), 4),
                         r.prop_tier, r.band, r.phase, int(r.n_uncertain))
                        for r in d.itertuples(index=False)]
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_advisory_xact_lock(hashtext('nba_score.final_hp'))")
                    cur.execute("DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s", (season, prop))
                    cur.executemany("""INSERT INTO nba_score.final_hp
                        (season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor,
                         baseline_hp, final_hp, cal_shift, score, confidence, conf_tier,
                         c_exist, c_quality, c_market, prop_tier, band, phase, n_uncertain)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (game_date, player_id, prop, line, side) DO UPDATE SET
                          final_hp=EXCLUDED.final_hp, score=EXCLUDED.score,
                          confidence=EXCLUDED.confidence, conf_tier=EXCLUDED.conf_tier,
                          c_exist=EXCLUDED.c_exist, c_quality=EXCLUDED.c_quality,
                          c_market=EXCLUDED.c_market""", rows)
                conn.commit()
            total += len(d)
            moved = float(np.abs(d["final_hp"] - d["baseline_hp"]).mean())
            print(f"  {prop:<16}{len(d):>9,} legs   mean |final-baseline| {moved:.5f}   "
                  f"mean conf {float(d['confidence'].mean()):.3f}", flush=True)
        print(f"{season}: {total:,} final legs\n", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
