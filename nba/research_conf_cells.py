#!/usr/bin/env python3
"""
A CONFIDENCE THAT IS MEASURED, NOT ASSEMBLED - DOES A CELL'S PAST CALIBRATION ERROR PREDICT ITS NEXT MONTH? READ-ONLY. (owner 2026-11-20: sharp and proven)
Production's confidence (deductions for named data gaps) shows no order against realised calibration (research_conf_oos.py on production). The
candidate here: confidence of a leg = 1 - the shrunk calibration error its cell (prop x side x final_hp band x line distance) showed on legs graded
BEFORE the slate's month. It is worth having only if cells keep their error: per month, the correlation (weighted by legs) between each cell's past
error and its error that month, and the realised error of legs in the cells the rule calls best / worst.
Env: DATABASE_URL, CC_TABLE (default nba_score.final_hp_v2), CC_K (shrink, default 400).
"""
import datetime as dt
import os

import numpy as np
import pandas as pd
import psycopg

TABLE = os.environ.get("CC_TABLE") or "nba_score.final_hp_v2"
K = float(os.environ.get("CC_K") or 400)


def main():
    assert TABLE in ("nba_score.final_hp_v2", "nba_score.final_hp")
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql(f"""WITH o AS (SELECT DISTINCT ON (o.game_date, m.player_id, replace(replace(o.market_key,'player_',''),'_alternate',''), o.line, o.side)
                                  o.game_date, m.player_id::text pid, replace(replace(o.market_key,'player_',''),'_alternate','') rk, o.line::float8 line, o.side, ((o.leg_result = 'over_win') = (o.side = 'Over'))::int won
                           FROM nba_market.board_outcomes o JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(o.player)
                           WHERE o.leg_result IN ('over_win','under_win') AND o.game_date >= '2024-10-01')
                        SELECT f.season, f.game_date, f.prop, f.side, f.final_hp::float8 p, abs(coalesce(f.ladder_offset, 0)) dist, o.won
                        FROM {TABLE} f JOIN o ON o.game_date = f.game_date AND o.pid = f.player_id::text AND o.line = f.line::float8 AND o.side = f.side AND f.prop = (CASE o.rk WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE o.rk END)
                        WHERE f.final_hp IS NOT NULL""", conn)
    d["band"] = pd.cut(d["p"], [0, .2, .35, .45, .55, .65, .8, 1.0]).astype(str)
    d["dist"] = np.minimum(d["dist"], 6)
    d["cell"] = d["prop"] + "|" + d["side"] + "|" + d["band"] + "|" + d["dist"].astype(str)
    d["game_date"] = pd.to_datetime(d["game_date"]).dt.date
    d["ym"] = [x.replace(day=1) for x in d["game_date"]]
    print(f"CC|graded legs {len(d):,}, cells {d['cell'].nunique():,}", flush=True)
    rows = []
    for m in sorted(d["ym"].unique()):
        tr = d[d["ym"] < m]; te = d[d["ym"] == m]
        if len(tr) < 50000 or len(te) < 2000:
            continue
        a = tr.groupby("cell").agg(n=("won", "size"), hit=("won", "mean"), p=("p", "mean"))
        a["err"] = (a["hit"] - a["p"]).abs() * a["n"] / (a["n"] + K)
        b = te.groupby("cell").agg(n=("won", "size"), hit=("won", "mean"), p=("p", "mean"))
        b["err"] = (b["hit"] - b["p"]).abs()
        j = a[["err"]].join(b[["err", "n"]], lsuffix="_past", rsuffix="_now", how="inner")
        j = j[j["n"] >= 30]
        if len(j) < 20:
            continue
        w = j["n"].values
        x, y = j["err_past"].values, j["err_now"].values
        cx, cy = x - np.average(x, weights=w), y - np.average(y, weights=w)
        r = float(np.sum(w * cx * cy) / np.sqrt(np.sum(w * cx * cx) * np.sum(w * cy * cy)))
        te2 = te.merge(a[["err"]], left_on="cell", right_index=True, how="left").fillna({"err": a["err"].median()})
        q = te2["err"].quantile([0.2, 0.8]).values
        lo, hi = te2[te2["err"] <= q[0]], te2[te2["err"] >= q[1]]
        e_lo = abs(lo["won"].mean() - lo["p"].mean()); e_hi = abs(hi["won"].mean() - hi["p"].mean())
        rows.append((m, len(te), len(j), r, e_lo, e_hi))
        print(f"CC|{m}: legs {len(te):7,} cells {len(j):4} | corr(past error, this month's error) {r:+.2f} | realised gap: most-trusted fifth {100*e_lo:.2f} pts, "
              f"least-trusted fifth {100*e_hi:.2f} pts", flush=True)
    if rows:
        print(f"CC|MEAN corr {np.mean([r[3] for r in rows]):+.2f} | months where least-trusted gap > most-trusted gap: "
              f"{sum(r[5] > r[4] for r in rows)} of {len(rows)}", flush=True)
    print("CC|DONE", flush=True)


if __name__ == "__main__":
    main()
