#!/usr/bin/env python3
"""
TRAILINGS AND RANKS RE-RUN ON THE CERTIFIED LEG CARD (owner 2026-11-22 18:31 PT: "see documentation and run all the trailings and ranks and see
what holds positive ROI, first start with what we have tried before"). READ-ONLY.
Re-runs the documented passes (18-27: rankers, pools, one / two a game, trailing form, trailing results of player / ranking, second slips) on
nba_score.leg_card_v2 with the certified hit rate and REAL prices only: PrizePicks regular lines, Underdog 1.0x legs (2024-26 Underdog: Power /
Standard 2-5 at 3 / 6 / 10 / 20, flex of that era not verified -> not used; 2026-27 Underdog tables in-app 2026-10-10).
Cell = app x ranker x side x pool x games cap x layer x structure, one slip a slate (the top k legs). Per cell: slips, ROI, per season, without the
5 best slips, legs' hit rate. Luck yardstick: the same cells with a RANDOM ranker (5 seeds). Trust test: cells chosen on 2024-26 only, judged on
2026-27 (unseen), against the random cells chosen the same way.
Env: DATABASE_URL, LB_SEEDS (5).
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

PP_P = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_F = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_P = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_F = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
UD_P_OLD = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0}
STRUCTS = [("power", k) for k in (2, 3, 4, 5, 6)] + [("flex", k) for k in (3, 4, 5, 6)]


def pay(app, st, k, miss, old):
    if app == "underdog" and old:
        if st != "power" or k not in UD_P_OLD:
            return None
        return UD_P_OLD[k] if miss == 0 else 0.0
    if st == "power":
        return (PP_P if app == "prizepicks" else UD_P)[k] if miss == 0 else 0.0
    return (PP_F if app == "prizepicks" else UD_F).get((k, miss), 0.0)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("""SELECT c.season, c.game_date, c.app, c.player_id, c.prop, c.line::float8 line, c.side, c.hit_cal::float8 cal, c.hit_rate::float8 hr,
                              c.final_hp::float8 model, c.p_market::float8 book, (c.result = 'won')::int w, c.stat_actual::float8 sa, g.game_id gid,
                              (g.matchup LIKE '%%vs.%%') home
                       FROM nba_score.leg_card_v2 c JOIN nba_stats.player_game_log g ON g.nba_player_id::text = c.player_id AND g.game_date = c.game_date
                       WHERE c.result IN ('won','lost') AND c.hit_cal IS NOT NULL
                         AND ((c.app = 'prizepicks' AND c.kind = 'standard') OR (c.app = 'underdog' AND c.leg_mult = 1))""", conn)
    d["gd"] = pd.to_datetime(d.game_date)
    print(f"LB|legs {len(d):,} | slates PP {d[d.app == 'prizepicks'].game_date.nunique()} UD {d[d.app == 'underdog'].game_date.nunique()}", flush=True)
    # ---- trailing form at the leg's own line: the player's last 10 earlier games in this stat (stat_actual from any app's graded leg)
    h = d.dropna(subset=["sa"]).drop_duplicates(["player_id", "prop", "gd"])[["player_id", "prop", "gd", "sa"]].sort_values("gd")
    hist = {k: (x.gd.values, x.sa.values) for k, x in h.groupby(["player_id", "prop"])}
    f10 = np.full(len(d), np.nan); ng = np.zeros(len(d))
    for (pid, pr), idx in d.groupby(["player_id", "prop"]).indices.items():
        if (pid, pr) not in hist:
            continue
        gdv, sav = hist[(pid, pr)]
        for i in idx:
            j = np.searchsorted(gdv, d.gd.values[i])
            ng[i] = j
            if j >= 5:
                last = sav[max(0, j - 10):j]
                f10[i] = np.mean(last < d.line.values[i]) if d.side.values[i] == "Under" else np.mean(last > d.line.values[i])
    d["form"] = f10; d["ngames"] = ng
    # ---- trailing results of the player on this app and side: his last 8 earlier graded legs (earlier slates only)
    d = d.sort_values(["app", "player_id", "side", "gd"]).reset_index(drop=True)
    ph = np.full(len(d), np.nan)
    for _, idx in d.groupby(["app", "player_id", "side"]).indices.items():
        gdv = d.gd.values[idx]; wv = d.w.values[idx]
        cs = np.concatenate([[0], np.cumsum(wv)])
        for n_, i in enumerate(idx):
            j = np.searchsorted(gdv, gdv[n_])          # legs strictly before this slate
            if j >= 4:
                lo = max(0, j - 8); ph[i] = (cs[j] - cs[lo]) / (j - lo)
    d["plr"] = ph
    d["avg"] = (d.model + d.hr) / 2
    rng = np.random.default_rng(7)
    seeds = int(os.environ.get("LB_SEEDS") or 5)
    rankers = ["cal", "hr", "model", "book", "avg"] + [f"rnd{s}" for s in range(seeds)]
    for s in range(seeds):
        d[f"rnd{s}"] = rng.random(len(d))
    layers = {"none": lambda x: np.ones(len(x), bool),
              "form60": lambda x: (x.form >= 0.6).values, "form40-": lambda x: (x.form <= 0.4).values,
              "g20": lambda x: (x.ngames >= 20).values,
              "plrhot": lambda x: (x.plr >= 0.6).values, "plrcold": lambda x: (x.plr <= 0.4).values}
    pools = {"all": lambda x: np.ones(len(x), bool), "noast": lambda x: ~x.prop.str.contains("ast").values,
             "reb": lambda x: (x.prop == "rebounds").values, "home": lambda x: x.home.values.astype(bool)}
    res = defaultdict(list)       # cell -> list of (season, payout-1, legs won, legs)
    for (app, gdate), x in d.groupby(["app", "game_date"]):
        season = x.season.iloc[0]; old = str(gdate) < "2026-07-01"
        for side in ("Under", "both", "Over"):
            xs = x if side == "both" else x[x.side == side]
            if not len(xs):
                continue
            for rk in rankers:
                if rk == "book":
                    xs_r = xs[xs.book.notna()]
                else:
                    xs_r = xs
                o = xs_r.sort_values(rk, ascending=False).drop_duplicates(["player_id", "prop"])
                for pn, pf in pools.items():
                    op = o[pf(o)]
                    for ln, lf in layers.items():
                        ol = op[lf(op)]
                        for gcap in (1, 2):
                            for pdif in (False, True):
                                sel = []; ug = defaultdict(int); upl = set(); upr = set()
                                for r in ol.itertuples():
                                    if r.player_id in upl or ug[r.gid] >= gcap or (pdif and r.prop in upr):
                                        continue
                                    sel.append(r.w); upl.add(r.player_id); ug[r.gid] += 1; upr.add(r.prop)
                                    if len(sel) >= 6:
                                        break
                                for st, k in STRUCTS:
                                    if len(sel) < k:
                                        continue
                                    pv = pay(app, st, k, k - sum(sel[:k]), old)
                                    if pv is None:
                                        continue
                                    res[(app, rk, side, pn, ln, gcap, int(pdif), st, k)].append((season, pv - 1, sum(sel[:k]), k))
    rows = []
    for key, v in res.items():
        s = np.array([a for a, *_ in v]); u = np.array([b for _, b, *_ in v]); wl = sum(c for *_, c, _ in v); nl = sum(e for *_, e in v)
        if len(u) < 40:
            continue
        per = {ss: (int((s == ss).sum()), float(u[s == ss].mean()) if (s == ss).any() else np.nan) for ss in ("2024-25", "2025-26", "2026-27")}
        top = np.sort(u)[::-1]
        rows.append(dict(app=key[0], rk=key[1], side=key[2], pool=key[3], layer=key[4], gcap=key[5], pdif=key[6], st=key[7], k=key[8],
                         n=len(u), roi=u.mean(), wo5=(u.sum() - top[:5].sum()) / len(u), hit=wl / nl,
                         r24=per["2024-25"][1], n24=per["2024-25"][0], r25=per["2025-26"][1], n25=per["2025-26"][0], r26=per["2026-27"][1], n26=per["2026-27"][0]))
    R = pd.DataFrame(rows)
    R["rand"] = R.rk.str.startswith("rnd")
    R.to_csv("leg_battery_cells.csv", index=False)
    print(f"LB|cells {len(R):,} (real rankers {(~R.rand).sum():,}, random {R.rand.sum():,})", flush=True)
    # 1. full period: positive in every season it plays, and without the 5 best
    for lab, m in (("real", ~R.rand), ("random", R.rand)):
        X = R[m]
        ok = (X.roi > 0) & (X.wo5 > 0) & (X.r24.fillna(1) > 0) & (X.r25.fillna(1) > 0) & (X.r26.fillna(1) > 0)
        print(f"LB|{lab}: cells {len(X):,} | ROI > 0 {100*(X.roi > 0).mean():.1f}% | positive every season + without 5 best {100*ok.mean():.2f}% ({ok.sum():,})", flush=True)
    # 2. TRUST TEST: chosen on 2024-26 (both seasons positive, without-5-best on the whole > 0 is NOT used - only 2024-26), judged on 2026-27
    for lab, m in (("real", ~R.rand), ("random", R.rand)):
        X = R[m & (R.n24 >= 30) & (R.n25 >= 30) & (R.n26 >= 15)]
        pick = X[(X.r24 > 0) & (X.r25 > 0)]
        print(f"LB|TRUST {lab}: eligible {len(X):,} | chosen on 2024-26 {len(pick):,} | their 2026-27: mean {100*pick.r26.mean():+.1f}%, positive "
              f"{100*(pick.r26 > 0).mean():.0f}% | unchosen 2026-27 mean {100*X[~X.index.isin(pick.index)].r26.mean():+.1f}%", flush=True)
    # 3. by ranker and by layer: share of cells positive in 2024-25 AND 2025-26, and their 2026-27
    X = R[(R.n24 >= 30) & (R.n25 >= 30)]
    for col in ("rk", "layer", "pool", "side", "gcap", "pdif"):
        g = X.groupby(col).apply(lambda z: pd.Series(dict(cells=len(z), both=((z.r24 > 0) & (z.r25 > 0)).mean(), roi=z.roi.mean(),
                                                         r26=z[(z.r24 > 0) & (z.r25 > 0)].r26.mean(), hit=z.hit.mean())))
        print(f"LB|by {col}: " + " | ".join(f"{i} {int(r.cells)} cells, both-seasons+ {100*r.both:.0f}%, mean ROI {100*r.roi:+.1f}%, chosen->2026-27 {100*r.r26:+.1f}%, legs hit {100*r.hit:.1f}%"
                                              for i, r in g.iterrows()), flush=True)
    # 4. the documented live strategies and the best real cells
    top = R[~R.rand & (R.roi > 0) & (R.wo5 > 0) & (R.r24.fillna(1) > 0) & (R.r25.fillna(1) > 0) & (R.r26.fillna(1) > 0)].sort_values("roi", ascending=False)
    for r in top.head(40).itertuples():
        print(f"LB|  {r.app} {r.rk} {r.side} {r.pool} {r.layer} gcap{r.gcap}{' propsdiff' if r.pdif else ''} {r.st} {r.k}: {r.n} slips ROI {100*r.roi:+.1f}% "
              f"(w/o 5 best {100*r.wo5:+.1f}%) | {100*r.r24:+.0f}/{100*r.r25:+.0f}/{100*r.r26:+.0f}% ({r.n24}/{r.n25}/{r.n26}) | legs {100*r.hit:.1f}%", flush=True)
    rb = R[R.rand].groupby(["app", "st", "k"]).roi.quantile(0.99)
    print("LB|random ranker 99th-percentile cell ROI by structure: " + " | ".join(f"{a[:2]} {s} {k} {100*v:+.0f}%" for (a, s, k), v in rb.items()), flush=True)
    print("LB|DONE", flush=True)


if __name__ == "__main__":
    main()
