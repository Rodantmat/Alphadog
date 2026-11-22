#!/usr/bin/env python3
"""
ROI CALIBRATION PER LEG (owner 2026-11-22 10:02 PT: "adjust any step on scoring as needed for accuracy and assertiveness").
Found 11:20 PT: the hit rate's ROI is right on average and in the negative bands, but its positive tail is too sure of itself - legs predicted
+1 / +4 / +8 / +14 / +42% at their best size realize -5.6 / -4.8 / -3.6 / -5.0 / -4.0% pooled (28,260 legs). So the last step maps each leg's
predicted best-size ROI to what legs predicted like it actually returned, per app x side (x kind group), with a monotone (isotonic) curve fitted
ONLY on legs graded in earlier weeks (all seasons before), and the leg keeps its rank inside the curve. Column: roi_cal (and hit_cal = (1 + roi_cal) / v_best).
Env: DATABASE_URL, RC_WRITE.
"""
import io
import os

import numpy as np
import pandas as pd
import psycopg


def iso(x, y, w):
    """pool-adjacent-violators, increasing"""
    xs, ys, ws = list(x), list(y), list(w)
    i = 0
    vals = [[ys[0], ws[0], 1]]
    for k in range(1, len(ys)):
        vals.append([ys[k], ws[k], 1])
        while len(vals) > 1 and vals[-2][0] > vals[-1][0]:
            a, b = vals.pop(), vals.pop()
            wt = a[1] + b[1]
            vals.append([(a[0] * a[1] + b[0] * b[1]) / wt, wt, a[2] + b[2]])
    out = []
    for v, wt, c in vals:
        out += [v] * c
    return np.array(xs), np.array(out)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT ctid::text rid, season, game_date, app, side, kind, roi_best::float8 r, realized_best::float8 z, v_best::float8 v, result
                       FROM nba_score.leg_card_v2 WHERE roi_best IS NOT NULL""", conn)
    d["gd"] = pd.to_datetime(d.game_date); d["wk"] = d.gd - pd.to_timedelta(d.gd.dt.weekday, unit="D")
    d["grp"] = d.app + "|" + d.side
    d["cal"] = np.nan
    gr = d.result.isin(["won", "lost"]).values
    for g, x in d.groupby("grp"):
        idx = x.index.values
        for wk in sorted(x.wk.unique()):
            tr = idx[(x.wk.values < wk) & gr[idx]]
            te = idx[x.wk.values == wk]
            if len(tr) < 3000:
                continue
            t = d.loc[tr]
            q = pd.qcut(t.r.rank(method="first"), min(60, len(t) // 200), labels=False)
            b = t.groupby(q).agg(x=("r", "mean"), y=("z", "mean"), n=("z", "size")).sort_values("x")
            xs, ys = iso(b.x.values, b.y.values, b.n.values)
            d.loc[te, "cal"] = np.interp(d.loc[te, "r"].values, xs, ys)
    d["hit_cal"] = (1 + d.cal) / d.v
    g = d[gr & d.cal.notna()]
    print(f"RC|legs calibrated {d.cal.notna().sum():,} of {len(d):,} | graded {len(g):,}", flush=True)
    for (s, a), x in g.groupby(["season", "app"]):
        bands = pd.cut(x.cal, [-1, -.2, -.1, -.05, -.02, 0, .02, .05, .1, 10])
        bb = " ".join(f"{100*h.cal.mean():+.1f}->{100*h.z.mean():+.1f}({len(h)})" for _, h in x.groupby(bands, observed=True) if len(h) >= 30)
        print(f"RC|  {s} {a:10s} {len(x):8,} | predicted {100*x.cal.mean():+.1f}% realized {100*x.z.mean():+.1f}% | positive predicted {(x.cal > 0).sum():,} "
              f"realized {100*x[x.cal > 0].z.mean():+.1f}% | {bb}", flush=True)
    p = g[g.cal > 0]
    print(f"RC|ALL legs with calibrated ROI > 0: {len(p):,} | predicted {100*p.cal.mean():+.2f}% | realized {100*p.z.mean():+.2f}% "
          f"(se {100*p.z.std()/max(len(p),1)**.5:.2f})", flush=True)
    if os.environ.get("RC_WRITE") == "1":
        for c in ("roi_cal", "hit_cal"):
            conn.execute(f"ALTER TABLE nba_score.leg_card_v2 ADD COLUMN IF NOT EXISTS {c} float8")
        conn.execute("CREATE TEMP TABLE rc (rid text, a float8, b float8)")
        buf = io.StringIO(); d[["rid", "cal", "hit_cal"]].to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
        with conn.cursor().copy("COPY rc FROM STDIN WITH (FORMAT csv)") as cp:
            cp.write(buf.read())
        n = conn.execute("UPDATE nba_score.leg_card_v2 l SET roi_cal = rc.a, hit_cal = rc.b FROM rc WHERE l.ctid = rc.rid::tid").rowcount
        print(f"RC|written roi_cal / hit_cal on {n:,} legs", flush=True)
    print("RC|DONE", flush=True)


if __name__ == "__main__":
    main()
