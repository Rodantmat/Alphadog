#!/usr/bin/env python3
"""Which feature columns differ between the replay frame (LM.LIVE=None, whole history) and the live-style frame (set_live) for FL_DATES? Read-only. Prefix XD|"""
import os
os.environ["LM_SRC"] = "frame"; os.environ["FL_BS"] = "v2"
import sys
import numpy as np, pandas as pd, psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_live as FL
import research_leg_model_h as LM

def key(df):
    return df["gd"].astype(str) + "|" + df["player_id"].astype(str) + "|" + df["prop"].astype(str) + "|" + df["side"].astype(str).str.lower() + "|" + df["line"].astype(float).round(3).astype(str) + "|" + df["kind"].astype(str)

def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    LM.LIVE = None
    dfr, Xr = LM.load(conn); dfr = dfr.reset_index(drop=True); Xr = Xr.reset_index(drop=True)
    kr = key(dfr); Xr.index = kr.values
    for gd in [d for d in (os.environ.get("FL_DATES") or "").split(",") if d]:
        legs = FL.set_live(conn, gd, "v2")
        dfl, Xl = LM.load(conn); dfl = dfl.reset_index(drop=True); Xl = Xl.reset_index(drop=True)
        kl = key(dfl); Xl.index = kl.values
        for lab, mask_l in (("today", (dfl["gd"].values == gd)), ("train-month", ((dfl["gd"].str[:7].values == gd[:7]) & (dfl["gd"].values < gd)) ), ("train-before-month", (dfl["gd"].str[:7].values < gd[:7]))):
            xl = Xl[mask_l]; common = xl.index.intersection(Xr.index)
            xl = xl.loc[~xl.index.duplicated()]; xr = Xr.loc[~Xr.index.duplicated()]
            common = xl.index.intersection(xr.index)
            FL.log(f"XD|{FL.APP} {gd} {lab}: live rows {int(mask_l.sum())}, in replay {len(common)}")
            bad = []
            for c in xl.columns:
                if c not in xr.columns: continue
                a = xl.loc[common, c]; b = xr.loc[common, c]
                if a.dtype.kind in "fiub" and b.dtype.kind in "fiub":
                    a = a.astype(float); b = b.astype(float)
                    d = ~((a == b) | (a.isna() & b.isna()) | ((a - b).abs() < 1e-6))
                else:
                    d = a.astype(str).values != b.astype(str).values
                    d = pd.Series(d, index=common)
                if d.sum(): bad.append((c, int(d.sum()), round(100 * d.mean(), 2)))
            FL.log(f"XD|{FL.APP} {gd} {lab}: differing columns {sorted(bad, key=lambda t: -t[1])[:14]}")

if __name__ == "__main__":
    main()
