#!/usr/bin/env python3
"""
STRATEGIES THAT WORK IN STRETCHES - IDENTIFIED BEFORE THE SLATE (owner 2026-11-22 11:45 PT: "It is ok if they do not hold for season, but we need
to be able to identify them and of course be able to trust and use them"). READ-ONLY.
Daily slips on the certified leg card (hit_cal, real prices; PrizePicks regular / Underdog 1.0x legs), every structure: Power 2-6, Flex 3-6,
side both / Under / Over, minimum hit_cal 0.48 / 0.50 / 0.52, one slip a slate. A strategy is PLAYED on a slate only when a switch says so, and the
switch sees nothing but slates already settled:
  trailing-W switch: play if the strategy's own ROI over its last W played-or-shadow slates (W = 5 / 10 / 20 / 40) is above T (0 / +10% / +25%).
TRUST: each switch x strategy is scored on the slates it chose; the yardstick is the same switch fed a time-shuffled copy of the strategy's
results (no stretches can exist there). A switch counts only where it beats the best shuffled control and is positive in each season it plays.
Env: DATABASE_URL.
"""
import os
from itertools import product

import numpy as np
import pandas as pd
import psycopg

PP_P = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_F = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_P = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_F = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
UD_P_OLD = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0}   # Underdog until 2026-06 (audit 2026-11-22: raw price -137 = 3x 2-pick); flex table of that era not verified


def pay(app, st, k, miss, old=False):
    """None = structure not available / not verified in that era"""
    if app == "underdog" and old:
        if st != "power" or k not in UD_P_OLD:
            return None
        return UD_P_OLD[k] if miss == 0 else 0.0
    if st == "power":
        return (PP_P if app == "prizepicks" else UD_P)[k] if miss == 0 else 0.0
    return (PP_F if app == "prizepicks" else UD_F).get((k, miss), 0.0)


def switch(r, W, T):
    """r: daily net returns (NaN = no slip that slate). Returns mask of slates played, using only earlier slates."""
    out = np.zeros(len(r), bool); hist = []
    for i, x in enumerate(r):
        if np.isnan(x):
            continue
        if len(hist) >= W and np.mean(hist[-W:]) > T:
            out[i] = True
        hist.append(x)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("""SELECT c.season, c.game_date, c.app, c.player_id, c.side, c.hit_cal::float8 h, (c.result = 'won')::int w, g.game_id
                       FROM nba_score.leg_card_v2 c JOIN nba_stats.player_game_log g ON g.nba_player_id::text = c.player_id AND g.game_date = c.game_date
                       WHERE c.result IN ('won','lost') AND c.hit_cal IS NOT NULL
                         AND ((c.app = 'prizepicks' AND c.kind = 'standard') OR (c.app = 'underdog' AND c.leg_mult = 1))""", conn)
    dates = {a: sorted(x.game_date.unique()) for a, x in d.groupby("app")}
    series = {}
    for (app, gd), x in d.groupby(["app", "game_date"]):
        for side, hm in product(("both", "Under", "Over"), (0.48, 0.50, 0.52)):
            c = x[x.h >= hm] if side == "both" else x[(x.h >= hm) & (x.side == side)]
            c = c.sort_values("h", ascending=False).drop_duplicates("player_id")
            pool = []; ug = {}
            for r in c.itertuples():
                if ug.get(r.game_id, 0) < 2:
                    pool.append(r.w); ug[r.game_id] = ug.get(r.game_id, 0) + 1
                if len(pool) >= 6:
                    break
            for k in (2, 3, 4, 5, 6):
                for st in ("power", "flex"):
                    if st == "flex" and k == 2:
                        continue
                    key = (app, side, hm, st, k)
                    pv = pay(app, st, k, k - sum(pool[:k]), str(gd) < "2026-07-01") if len(pool) >= k else None
                    v = pv - 1 if pv is not None else np.nan
                    series.setdefault(key, {})[gd] = v
    seas = d.drop_duplicates("game_date").set_index("game_date").season
    rows = []
    rng = np.random.default_rng(11)
    for key, sv in series.items():
        ds = dates[key[0]]
        r = np.array([sv.get(g, np.nan) for g in ds]); se = np.array([seas.get(g) for g in ds])
        if np.sum(~np.isnan(r)) < 60:
            continue
        for W, T in product((5, 10, 20, 40), (0.0, 0.10, 0.25)):
            m = switch(r, W, T)
            if m.sum() < 30:
                continue
            ctrl = []
            for _ in range(20):
                rs = r.copy(); ok = ~np.isnan(rs); rs[ok] = rng.permutation(rs[ok])
                mm = switch(rs, W, T)
                ctrl.append(np.mean(rs[mm]) if mm.sum() >= 10 else np.nan)
            per = {s: (int(m[se == s].sum()), float(np.mean(r[m & (se == s)])) if m[se == s].sum() else np.nan) for s in ("2024-25", "2025-26", "2026-27")}
            rows.append(dict(key=" ".join(map(str, key)), W=W, T=T, n=int(m.sum()), roi=float(np.mean(r[m])), all=float(np.nanmean(r)),
                             ctrl=float(np.nanmax(ctrl)), ctrl_mean=float(np.nanmean(ctrl)), per=per,
                             ok=all(np.isnan(v[1]) or v[0] < 10 or v[1] > 0 for v in per.values())))
    R = pd.DataFrame(rows)
    R["beats"] = R.roi > R.ctrl
    print(f"SR|switch x strategy combinations: {len(R):,} | played ROI > 0: {(R.roi > 0).sum():,} | beats its best shuffled control: {R.beats.sum():,} | "
          f"and positive in every season it plays (>= 10 slates): {(R.beats & R.ok & (R.roi > 0)).sum():,}", flush=True)
    print(f"SR|shuffled controls: mean played ROI {100*R.ctrl_mean.mean():+.1f}% (the switch alone, no stretches)", flush=True)
    top = R[R.beats & R.ok & (R.roi > 0)].sort_values("roi", ascending=False).head(40)
    for x in top.itertuples():
        ps = " | ".join(f"{s} {v[0]} slates {100*v[1]:+.0f}%" for s, v in x.per.items() if v[0])
        print(f"SR|  {x.key} | last {x.W} > {100*x.T:.0f}% | played {x.n} of all: ROI {100*x.roi:+.1f}% (always-on {100*x.all:+.1f}%, best shuffled {100*x.ctrl:+.1f}%) || {ps}", flush=True)
    print("SR|DONE", flush=True)


if __name__ == "__main__":
    main()
