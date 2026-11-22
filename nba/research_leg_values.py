#!/usr/bin/env python3
"""
PER-LEG VALUE AT EVERY POWER SIZE, AND THE UNDERDOG 2-PICK BASE FIX (owner 2026-11-22 09:43 PT: "fix and adjust everything for real positive ROI
per leg").

Two faults in the leg card, both pushing ROI down:
 1. Underdog legs were valued at sqrt(3) x modifier. Underdog's Standard table is 2: 3.5x, 3: 6.5x, 4: 12x, 5: 20x, 6: 35x (NBA_HONEST_REBUILD.md
    'Underdog real tables'; certification doc: 'sqrt 3.5 x modifier'), so the 2-pick leg value is sqrt(3.5) x modifier - 8.0% higher.
 2. Every PrizePicks / Underdog leg was valued at the 2-pick size only. A leg's value differs by size: PrizePicks Power 3 / 6 / 10 / 20 / 37.5x
    gives 1.732 / 1.817 / 1.778 / 1.821 / 1.830 per standard leg; a goblin / demon's own payout follows the size law (P_k = snap(g_k(y))).
Per leg, for k = 2..6 (Power / Standard / Max, one leg's share of the payout, the rest standard):
   PrizePicks: v_k = B_k^(1/k) x P_k / B_k (P_k = B_k for a standard leg; for a goblin / demon from its y - the real quote's, else the mechanism's)
   Underdog:   v_k = U_k^(1/k) x modifier
   Sleeper / Fliff: v_k = the leg's own multiplier / decimal price (priced per leg).
Columns: v2..v6, best_k (size with the highest value), v_best, roi_best = hit_rate x v_best - 1, realized_best (won: v_best - 1, lost: -1).
LV_FIXUD=1 also moves Underdog m / breakeven / roi / realized to the 3.5x base. Env: DATABASE_URL, LV_WRITE, LV_FIXUD.
"""
import io
import os

import numpy as np
import pandas as pd
import psycopg

LAW = {"hi": {2: [-2.9367, 1.281669, -0.043245], 3: [-2.064888, 1.118527, -0.020444], 4: [-1.266466, 1.022979, -0.006269], 5: [-0.678407, 1.025417, -0.004404]},
       "lo": {2: [-2.732025, 1.176992, -0.029711], 3: [0.434015, -0.34985, 0.195287], 4: [-0.631412, 0.631904, 0.05341], 5: [0.305111, 0.441502, 0.082239]}}
PP = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
UD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}            # 2026-27 (in-app, 2026-10-10)
UD_OLD = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0}                 # until 2026-06 (raw price -137 = 1/sqrt 3; 2024 published 3/6/10/20); no 6-pick
KS = (2, 3, 4, 5, 6)


def stp(v):
    return np.where(v < 3, 0.1, np.where(v < 10, 0.25, np.where(v < 50, 0.5, np.where(v < 200, 1.0, 5.0))))


def snap(v):
    s = stp(v)
    return np.round(np.round(v / s) * s, 4)


def gk(k, y):
    y = np.asarray(y, float)
    if k == 6:
        return y
    ly = np.log(y); hi = y >= 37.5
    a, b, c = (np.where(hi, LAW["hi"][k][i], LAW["lo"][k][i]) for i in range(3))
    return np.exp(a + b * ly + c * ly * ly)


YG = np.exp(np.linspace(np.log(2), np.log(20000), 400000)); P2G = snap(gk(2, YG))


def y_of_p2(P):
    out = np.full(len(P), np.nan)
    for v in np.unique(P[~np.isnan(P)]):
        i = np.where(np.isclose(P2G, v))[0]
        if len(i):
            out[P == v] = np.sqrt(YG[i[0]] * YG[i[-1]])
        else:   # a real quote off the size-law grid (audit: 2,309 demons, P2 10-20): the y whose continuous 2-pick value is closest
            out[P == v] = YG[np.argmin(np.abs(gk(2, YG) - v))]
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
    if os.environ.get("LV_FIXUD") == "1":
        # audit 2026-11-22: the 3.5x base holds from 2026-27 only; 2024-26 Underdog paid 3x at 2 picks -> back to sqrt(3) for those seasons
        n = conn.execute("""UPDATE nba_score.leg_card_v2 SET m = sqrt(3.0) * leg_mult, breakeven = 1 / (sqrt(3.0) * leg_mult), roi = hit_rate * sqrt(3.0) * leg_mult - 1,
                                  realized = CASE WHEN result = 'won' THEN sqrt(3.0) * leg_mult - 1 WHEN result = 'lost' THEN -1 END
                             WHERE app = 'underdog' AND game_date < '2026-07-01' AND m IS NOT NULL AND abs(m / leg_mult - sqrt(3.5)) < 1e-9""").rowcount
        print(f"LV|Underdog 2024-26 legs back to the 3x 2-pick base (m = sqrt(3) x modifier): {n:,}", flush=True)
        n = conn.execute("""UPDATE nba_score.leg_card_v2 SET roi_mech = hit_rate * m_mech - 1 WHERE m_mech IS NOT NULL""").rowcount
        print(f"LV|roi_mech recomputed on the current hit rate: {n:,}", flush=True)
    d = pd.read_sql("""SELECT ctid::text rid, season, app, kind, side, result, hit_rate::float8 h, leg_mult::float8 lm, m::float8 m, m_mech::float8 mm,
                              (game_date >= '2026-07-01') new_ud
                       FROM nba_score.leg_card_v2""", conn)
    V = np.full((len(d), 5), np.nan)
    app = d.app.values
    # PrizePicks
    pp = app == "prizepicks"
    std = pp & (d.kind.values == "standard")
    for j, k in enumerate(KS):
        V[std, j] = PP[k] ** (1 / k)
    alt = pp & ~std
    P2 = np.where(~np.isnan(d.m.values), np.round(3 * d.lm.values, 4), np.round(d.mm.values * 3 ** 0.5, 4))
    P2 = np.where(alt, P2, np.nan)
    y = y_of_p2(P2)
    for j, k in enumerate(KS):
        Pk = snap(gk(k, np.nan_to_num(y, nan=37.5)))
        V[alt & ~np.isnan(y), j] = (PP[k] ** (1 / k) * Pk / PP[k])[alt & ~np.isnan(y)]
    print(f"LV|PrizePicks: standard {std.sum():,} | goblin / demon with a value {(alt & ~np.isnan(y)).sum():,} of {alt.sum():,}", flush=True)
    ud = (app == "underdog") & ~np.isnan(d.lm.values) & ~np.isnan(d.m.values)
    nu = d.new_ud.values.astype(bool)
    for j, k in enumerate(KS):
        V[ud & nu, j] = UD[k] ** (1 / k) * d.lm.values[ud & nu]
        if k in UD_OLD:
            V[ud & ~nu, j] = UD_OLD[k] ** (1 / k) * d.lm.values[ud & ~nu]
    pl = np.isin(app, ["sleeper", "fliff"]) & ~np.isnan(d.m.values)
    for j in range(5):
        V[pl, j] = d.m.values[pl]
    has = ~np.isnan(V).all(axis=1)
    bj = np.where(has, np.nanargmax(np.where(np.isnan(V), -1, V), axis=1), -1)
    vb = np.where(has, V[np.arange(len(d)), np.clip(bj, 0, 4)], np.nan)
    d["best_k"] = np.where(has, np.array(KS)[np.clip(bj, 0, 4)], np.nan)
    d["v_best"] = vb
    d["roi_best"] = d.h * vb - 1
    d["realized_best"] = np.where(~has, np.nan, np.where(d.result == "won", vb - 1, np.where(d.result == "lost", -1.0, np.nan)))   # audit C: no value -> no realized
    for j, k in enumerate(KS):
        d[f"v{k}"] = V[:, j]
    g = d[d.result.isin(["won", "lost"]) & has]
    print(f"LV|legs with a value {has.sum():,} | graded {len(g):,}", flush=True)
    for (s, a), x in g.groupby(["season", "app"]):
        r2 = np.where(x.result == "won", x.v2 - 1, -1)
        bands = pd.cut(x.roi_best, [-1, -.2, -.1, -.05, 0, .03, .06, .1, .2, 10])
        bb = " ".join(f"{100*z.roi_best.mean():+.0f}->{100*z.realized_best.mean():+.1f}({len(z)})" for _, z in x.groupby(bands, observed=True) if len(z) >= 30)
        print(f"LV|  {s} {a:10s} {len(x):8,} | 2-pick realized {100*r2.mean():+.1f}% | best size realized {100*x.realized_best.mean():+.1f}% "
              f"(predicted {100*x.roi_best.mean():+.1f}%) | sizes {x.best_k.value_counts().to_dict()} | {bb}", flush=True)
    if os.environ.get("LV_WRITE") == "1":
        cols = [f"v{k}" for k in KS] + ["best_k", "v_best", "roi_best", "realized_best"]
        for c in cols:
            conn.execute(f"ALTER TABLE nba_score.leg_card_v2 ADD COLUMN IF NOT EXISTS {c} float8")
        conn.execute("CREATE TEMP TABLE lv (rid text, " + ", ".join(f"{c} float8" for c in cols) + ")")
        buf = io.StringIO(); d[["rid"] + cols].to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
        with conn.cursor().copy("COPY lv FROM STDIN WITH (FORMAT csv)") as cp:
            cp.write(buf.read())
        n = conn.execute("UPDATE nba_score.leg_card_v2 l SET " + ", ".join(f"{c} = lv.{c}" for c in cols) + " FROM lv WHERE l.ctid = lv.rid::tid").rowcount
        print(f"LV|written per-size values on {n:,} legs", flush=True)
    print("LV|DONE", flush=True)


if __name__ == "__main__":
    main()
