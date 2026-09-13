#!/usr/bin/env python3
"""
LADDER CALIBRATION CORRECTION — fit per-cell gaps on one season, apply to the other.

WHAT THIS CORRECTS. The full-grid measurement (nba_score.tier_band_calibration) shows the ladder's
probability is systematically off in ways a season-wide number hides:
  * by TIER and BAND - goblin T-2 at model 0.318 actually hits 0.622 (+30 pp); at model 0.877 it hits
    0.746 (-13 pp). The model is under-confident low and over-confident high on the goblin ladder.
  * by SEASON PHASE - the gap decays +1.46 / +1.30 / +0.88 / +0.13 pp across Oct-Nov, Dec-ASB,
    post-All-Star and the playoff push. One correction for the whole season would over-correct March
    and under-correct October.

THE CORRECTION. For each cell (kind x tier x phase x band), the measured gap is applied as a shift in
LOG-ODDS, shrunk by the cell's sample size:
        w = n / (n + K)
        logit(p') = logit(p) + w * (logit(actual_cell) - logit(model_cell))
Shrinkage matters because a cell with 200 legs is noise and a cell with 3,000 is signal; the hierarchy
falls back cell -> (kind, phase, band) -> (phase, band) -> none.

THE TEST IS OUT-OF-SAMPLE BY SEASON: cells are fitted on the TRAIN season only and applied to the TEST
season. A correction fitted and evaluated on the same season proves nothing.

Reported: log-loss and Brier before and after, overall and per phase, plus the reliability of the
corrected probabilities. Results are written to nba_score.factor_gate_results.

Env: DATABASE_URL, CC_TRAIN, CC_TEST, CC_K
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


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -20, 20)))


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def load(season, conn, pid_map, prop, market):
    h = pd.read_sql("""SELECT game_date, player_id, line, p_more, p_less
                       FROM nba_score.baseline_history WHERE season=%s AND prop=%s""",
                    conn, params=(season, prop))
    if h.empty:
        return pd.DataFrame()
    h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
    h["player_id"] = h["player_id"].astype(str)
    h["line"] = h["line"].astype(float)
    h = h.drop_duplicates(subset=["game_date", "player_id", "line"])

    t = pd.read_sql("""SELECT game_date, player, line, side, tier, kind FROM nba_market.board_tiers
                       WHERE snapshot_label='window' AND base_market=%s""", conn, params=(market,))
    if t.empty:
        return pd.DataFrame()
    t["game_date"] = pd.to_datetime(t["game_date"]).dt.date
    t["line"] = t["line"].astype(float)
    t["player_id"] = t["player"].map(norm_name).map(pid_map)
    t = t[t["player_id"].notna()].drop_duplicates(subset=["game_date", "player_id", "line", "side"])

    o = pd.read_sql("""SELECT game_date, player, line, side, leg_result FROM nba_market.board_outcomes
                       WHERE replace(market_key,'_alternate','')=%s""", conn, params=(market,))
    o["game_date"] = pd.to_datetime(o["game_date"]).dt.date
    o["line"] = o["line"].astype(float)
    o["player_id"] = o["player"].map(norm_name).map(pid_map)
    o = o[o["player_id"].notna()].drop_duplicates(subset=["game_date", "player_id", "line", "side"])

    d = t.merge(h, on=["game_date", "player_id", "line"], how="inner") \
         .merge(o[["game_date", "player_id", "line", "side", "leg_result"]],
                on=["game_date", "player_id", "line", "side"], how="inner")
    d = d[d["leg_result"].isin(["over_win", "under_win"])].copy()
    d["p"] = np.where(d["side"] == "Over", d["p_more"], d["p_less"]).astype(float)
    d["won"] = np.where(d["side"] == "Over", d["leg_result"] == "over_win",
                        d["leg_result"] == "under_win").astype(int)
    d["phase"] = d["game_date"].map(phase_of)
    d["band"] = pd.cut(d["p"], [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]).astype(str)
    d["prop"] = prop
    return d


PROP_MARKET = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists",
               "threes_made": "player_threes", "pra": "player_points_rebounds_assists",
               "pts_reb": "player_points_rebounds", "pts_ast": "player_points_assists",
               "reb_ast": "player_rebounds_assists", "steals": "player_steals",
               "blocks": "player_blocks", "turnovers": "player_turnovers", "stocks": "player_blocks_steals"}


def main():
    tr_s, te_s = os.environ.get("CC_TRAIN", "2024-25"), os.environ.get("CC_TEST", "2025-26")
    K = float(os.environ.get("CC_K", "400"))
    props = [p.strip() for p in os.environ.get("CC_PROPS", ",".join(PROP_MARKET)).split(",") if p.strip()]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}

    # EACH PROP GETS ITS OWN CELLS. A rebound ladder and a threes ladder are different animals - one is
    # a smooth count with a wide anchor, the other is bursty and zero-inflated - so a shared correction
    # would blur them. DIRECTION is a cell dimension too: Over and Under on the same ladder can be
    # miscalibrated in opposite directions, and averaging them hides both.
    print(f"train {tr_s} -> test {te_s} | shrink K={K:.0f} | props: {len(props)}\n", flush=True)
    print(f"{'prop':<13}{'n_test':>9}{'raw LL':>9}{'cal LL':>9}{'gain':>9}{'raw Brier':>11}{'cal Brier':>11}   verdict")
    out_rows, totals = [], []
    for prop in props:
        market = PROP_MARKET.get(prop)
        if not market:
            continue
        tr, te = load(tr_s, conn, pid_map, prop, market), load(te_s, conn, pid_map, prop, market)
        if tr.empty or te.empty or len(tr) < 3000 or len(te) < 1500:
            continue

        def shifts(keys, frame=tr):
            g = frame.groupby(keys, observed=True).agg(n=("won", "size"), a=("won", "mean"), m=("p", "mean"))
            g = g[g["n"] >= 100]
            w = g["n"] / (g["n"] + K)
            return (w * (logit(g["a"].values) - logit(g["m"].values))).to_dict()

        s_full = shifts(["kind", "tier", "phase", "band", "side"])
        s_kpbs = shifts(["kind", "phase", "band", "side"])
        s_pbs = shifts(["phase", "band", "side"])
        s_bs = shifts(["band", "side"])

        def ap(r):
            return (s_full.get((r["kind"], r["tier"], r["phase"], r["band"], r["side"]))
                    or s_kpbs.get((r["kind"], r["phase"], r["band"], r["side"]))
                    or s_pbs.get((r["phase"], r["band"], r["side"]))
                    or s_bs.get((r["band"], r["side"])) or 0.0)
        te = te.copy()
        te["p_cal"] = sigmoid(logit(te["p"].values) + te.apply(ap, axis=1).values)

        def score(frame, col):
            p = np.clip(frame[col].values, 1e-4, 1 - 1e-4)
            h = frame["won"].values
            return float(-np.mean(h * np.log(p) + (1 - h) * np.log(1 - p))), float(np.mean((p - h) ** 2))

        ll0, br0 = score(te, "p")
        ll1, br1 = score(te, "p_cal")
        gain = ll0 - ll1
        print(f"{prop:<13}{len(te):>9,}{ll0:>9.4f}{ll1:>9.4f}{gain:>+9.4f}{br0:>11.4f}{br1:>11.4f}   "
              f"{'APPLY' if gain > 0.001 else 'no gain - leave raw'}", flush=True)
        out_rows.append((te_s, f"prop:{prop}", "raw_ladder", len(te), round(ll0, 4), round(br0, 4), 0.0, K))
        out_rows.append((te_s, f"prop:{prop}", "phase_band_side_calibrated", len(te),
                         round(ll1, 4), round(br1, 4), round(gain, 4), K))
        totals.append((prop, len(te), gain))

    if out_rows:
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.factor_gate_results
                (season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", out_rows)
        conn.commit()
        good = [p for p, _, g in totals if g > 0.001]
        wn = sum(n for _, n, _ in totals)
        wg = sum(n * g for _, n, g in totals) / wn if wn else 0
        print(f"\ncalibration helps on {len(good)} of {len(totals)} props | "
              f"volume-weighted gain {wg:+.4f} log-loss over {wn:,} legs", flush=True)
        print(f"apply: {', '.join(sorted(good)) if good else '(none)'}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
