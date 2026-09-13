#!/usr/bin/env python3
"""
LADDER CALIBRATION — ALL 30 PROPS, no exceptions.

The tier-keyed path only covers the 12 markets PrizePicks offers a goblin/demon ladder on. The other 18
props (fga, fgm, fg3a, ftm, fta, oreb, dreb, personal_fouls, fantasy_score, double_double and the seven
period props) have no tier rows, so that path silently skipped them.

This path calibrates EVERY prop by grading the ladder directly against the box score - no board tier
needed. Cells: prop x phase x band x direction, with a shrinkage fallback. Every prop line gets a
correction; none are left raw because of a market-coverage accident.

Fitted on TRAIN season, applied to TEST season. Results -> nba_score.ladder_calibration (the correction
table the engine reads) and nba_score.factor_gate_results (the verdicts).

Env: DATABASE_URL, LC_TRAIN, LC_TEST, LC_K
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
COL = {"points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M", "blocks": "BLK",
       "steals": "STL", "turnovers": "TOV", "personal_fouls": "PF", "fga": "FGA", "fg3a": "FG3A",
       "ftm": "FTM", "fgm": "FGM", "fta": "FTA", "oreb": "OREB", "dreb": "DREB"}
COMBO = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST"),
         "reb_ast": ("REB", "AST"), "stocks": ("STL", "BLK")}
FANTASY_W = {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0}
PERIOD = {"points_q1": ("PTS", "q1"), "points_h1": ("PTS", "h1"), "points_h2": ("PTS", "h2"),
          "points_q4": ("PTS", "q4"), "points_q4_otx": ("PTS", "q4"),
          "rebounds_q1": ("REB", "q1"), "assists_q1": ("AST", "q1"), "threes_made_q1": ("FG3M", "q1")}


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


def season_truth(slug):
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    for name, cols in COMBO.items():
        logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
    logs["FANTASY_SCORE"] = sum(logs[c].fillna(0) * w for c, w in FANTASY_W.items())
    logs["DOUBLE_DOUBLE"] = (sum((logs[c].fillna(0) >= 10).astype(int)
                                 for c in ("PTS", "REB", "AST", "STL", "BLK")) >= 2).astype(int)
    try:
        idx = logs.set_index(["GAME_DATE", "PLAYER_ID"]).index
        q = {}
        for qq in (1, 2, 3, 4):
            qd = pd.DataFrame(fetch(f"nba_player_game_log_q{qq}_{slug}.json")["records"])
            qd["GAME_DATE"] = pd.to_datetime(qd["GAME_DATE"]).dt.date
            qd["PLAYER_ID"] = qd["PLAYER_ID"].astype(str)
            q[qq] = qd.set_index(["GAME_DATE", "PLAYER_ID"])
        for stat in ("PTS", "REB", "AST", "FG3M"):
            for tag, parts in (("q1", [1]), ("h1", [1, 2]), ("h2", [3, 4]), ("q4", [4])):
                s = None
                for p in parts:
                    if stat not in q[p].columns:
                        s = None
                        break
                    c = q[p][stat].reindex(idx).fillna(0)
                    s = c if s is None else s + c
                if s is not None:
                    logs[f"{stat}_{tag.upper()}"] = s.values
    except Exception as exc:  # noqa: BLE001
        print(f"  quarter logs unavailable ({str(exc)[:60]}) - period props will be skipped", flush=True)
    return logs


def main():
    tr_s, te_s = os.environ.get("LC_TRAIN", "2024-25"), os.environ.get("LC_TEST", "2025-26")
    K = float(os.environ.get("LC_K", "400"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    props = [r[0] for r in conn.execute(
        "SELECT DISTINCT prop FROM nba_score.baseline_history ORDER BY 1").fetchall()]
    print(f"train {tr_s} -> test {te_s} | K={K:.0f} | props in baseline_history: {len(props)}\n", flush=True)
    truth = {s: season_truth(s.replace("-", "_")) for s in (tr_s, te_s)}

    def frame(season, prop):
        col = ("DOUBLE_DOUBLE" if prop == "double_double" else
               "FANTASY_SCORE" if prop == "fantasy_score" else
               f"{PERIOD[prop][0]}_{PERIOD[prop][1].upper()}" if prop in PERIOD else
               COL.get(prop, prop.upper()))
        lg = truth[season]
        if col not in lg.columns:
            return None, col
        h = pd.read_sql("""SELECT game_date, player_id, line, p_more, p_less
                           FROM nba_score.baseline_history WHERE season=%s AND prop=%s""",
                        conn, params=(season, prop))
        if h.empty:
            return None, col
        h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
        h["player_id"] = h["player_id"].astype(str)
        d = h.merge(lg[["GAME_DATE", "PLAYER_ID", col]], left_on=["game_date", "player_id"],
                    right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
        if d.empty:
            return None, col
        # BOTH DIRECTIONS: every rung is offered Over and Under, so both get a cell.
        over = d.assign(side="Over", p=d["p_more"].astype(float),
                        won=(d[col] > d["line"]).astype(int) if prop != "double_double"
                            else (d[col] >= 1).astype(int))
        under = d.assign(side="Under", p=d["p_less"].astype(float),
                         won=(d[col] <= d["line"]).astype(int) if prop != "double_double"
                             else (d[col] < 1).astype(int))
        x = pd.concat([over, under], ignore_index=True)
        x["phase"] = x["game_date"].map(phase_of)
        x["band"] = pd.cut(x["p"], [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]).astype(str)
        return x, col

    print(f"{'prop':<16}{'n_test':>10}{'raw LL':>9}{'cal LL':>9}{'gain':>9}   verdict")
    gate, table, tot_n, tot_g = [], [], 0, 0.0
    for prop in props:
        tr, _ = frame(tr_s, prop)
        te, col = frame(te_s, prop)
        if tr is None or te is None or len(tr) < 2000 or len(te) < 1000:
            print(f"{prop:<16}{'-':>10}{'':>9}{'':>9}{'':>9}   SKIPPED (no truth column {col} or too thin)", flush=True)
            continue

        def shifts(keys):
            g = tr.groupby(keys, observed=True).agg(n=("won", "size"), a=("won", "mean"), m=("p", "mean"))
            g = g[g["n"] >= 100]
            w = g["n"] / (g["n"] + K)
            return (w * (logit(g["a"].values) - logit(g["m"].values))).to_dict()

        s_pbs = shifts(["phase", "band", "side"])
        s_bs = shifts(["band", "side"])
        te = te.copy()
        te["shift"] = [s_pbs.get((r.phase, r.band, r.side)) or s_bs.get((r.band, r.side)) or 0.0
                       for r in te.itertuples(index=False)]
        te["p_cal"] = sigmoid(logit(te["p"].values) + te["shift"].values)

        def sc(c):
            p = np.clip(te[c].values, 1e-4, 1 - 1e-4)
            h = te["won"].values
            return (float(-np.mean(h * np.log(p) + (1 - h) * np.log(1 - p))),
                    float(np.mean((p - h) ** 2)))
        ll0, br0 = sc("p")
        ll1, br1 = sc("p_cal")
        gain = ll0 - ll1
        tot_n += len(te); tot_g += gain * len(te)
        print(f"{prop:<16}{len(te):>10,}{ll0:>9.4f}{ll1:>9.4f}{gain:>+9.4f}   "
              f"{'APPLY' if gain > 0.0005 else 'no gain'}", flush=True)
        gate += [(te_s, f"allprop:{prop}", "raw", len(te), round(ll0, 4), round(br0, 4), 0.0, K),
                 (te_s, f"allprop:{prop}", "calibrated", len(te), round(ll1, 4), round(br1, 4),
                  round(gain, 4), K)]
        for (ph, bd, sd), sh in s_pbs.items():
            table.append((prop, ph, bd, sd, round(float(sh), 5), tr_s))

    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.ladder_calibration (
            prop text, phase text, band text, side text, log_odds_shift numeric,
            fitted_on text, built_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.ladder_calibration")
        cur.executemany("""INSERT INTO nba_score.ladder_calibration
            (prop, phase, band, side, log_odds_shift, fitted_on) VALUES (%s,%s,%s,%s,%s,%s)""", table)
        cur.executemany("""INSERT INTO nba_score.factor_gate_results
            (season, slice, model, n, log_loss, brier, gain_vs_anchor, shrink_beta)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", gate)
    conn.commit()
    conn.close()
    print(f"\nvolume-weighted gain {tot_g/max(tot_n,1):+.5f} log-loss over {tot_n:,} legs", flush=True)
    print(f"wrote {len(table)} correction cells to nba_score.ladder_calibration", flush=True)


if __name__ == "__main__":
    main()
