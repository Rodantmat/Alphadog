#!/usr/bin/env python3
"""
THE DOCUMENTED BATTERY RE-RUN ON THE CERTIFIED LEG CARD (owner 2026-11-22 18:31 / 18:51 PT: "see documentation and run all the trailings and
ranks and see what holds positive ROI, first start with what we have tried before ... we made an extensive work and I need you to do the same").
READ-ONLY. Mirrors NBA_HONEST_REBUILD.md passes 2-27 (8q-8an) on nba_score.leg_card_v2 (certified grading, REAL prices only):
  legs      PrizePicks regular lines; Underdog 1.0x legs. Universe: single stats (the documented family) or every prop.
  rankers   blend (the live ranker, _lr_legs_hp.p_blend, walk-forward, from 2025-01) | base (honest baseline, _lr_legs_h.ph) | avg (blend + base) / 2
            (P4 / P5 / U20) | geo sqrt(base x book) (P21 / P22) | gbm_s (small gbm, pass 17) | book (sportsbook alone) | hit_cal (certified hit
            rate, this rebuild) | hit_rate | final_hp (one-formula store) | rnd0..4 (random order of the same pool = the luck yardstick, pass 3)
  sides     Under (documented) | both | Over
  pools     all | noast | reb | pts | def (steals / blocks / turnovers / stocks) | home | away | under10 (line < 10) | half (PrizePicks live rule:
            half-point lines)
  layers    none | form60 / form40- (player's last 10 games at this line, pass 18) | g20 (20+ earlier games, pass 19) | plrhot / plrcold (player's
            last 8 graded legs on this app and side, pass 26)
  slips     one a player; 1 or 2 legs a game (pass 23); plain or every prop different (pass 9); from rank 1 or rank 2 (pass 5); 1 slip a slate
  sizes     2-6 Power / Standard, 3-6 Flex. Underdog 2024-26: 3 / 6 / 10 / 20 Standard, no verified flex (cells excluded there).
Per cell: slips, ROI, by season, without the 5 best, drawdown, drought, legs' hit rate. Trust tests: (1) the same cell with a random ranker,
(2) chosen on 2024-26 only -> read on 2026-27, real vs random. The documented live codes are printed by name.
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
SINGLE = {"points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "fga", "fta", "ftm", "oreb", "fgm", "dreb", "personal_fouls"}
DEF = {"steals", "blocks", "turnovers", "stocks"}
SEASONS = ("2024-25", "2025-26", "2026-27")
# documented live codes (app, ranker, side, universe, pool, layer, gcap, pdif, start, struct, k) - section 8ab-8an / honest_live_slip_engine.py
NAMED = {
    "U1 2S top2 blend": ("underdog", "blend", "Under", "single", "all", "none", 1, 0, 1, "power", 2),
    "U2 2S top2 baseline": ("underdog", "base", "Under", "single", "all", "none", 1, 0, 1, "power", 2),
    "U4 2S top2 rebounds": ("underdog", "blend", "Under", "single", "reb", "none", 1, 0, 1, "power", 2),
    "U5 2S top2 home": ("underdog", "blend", "Under", "single", "home", "none", 1, 0, 1, "power", 2),
    "U6 3S top3 rebounds": ("underdog", "blend", "Under", "single", "reb", "none", 1, 0, 1, "power", 3),
    "U7 4F top4 rebounds": ("underdog", "blend", "Under", "single", "reb", "none", 1, 0, 1, "flex", 4),
    "U8 4F noast 2/game": ("underdog", "blend", "Under", "single", "noast", "none", 2, 0, 1, "flex", 4),
    "U9 3S noast 2/game": ("underdog", "blend", "Under", "single", "noast", "none", 2, 0, 1, "power", 3),
    "U20 4F avg noast form60": ("underdog", "avg", "Under", "single", "noast", "form60", 1, 0, 1, "flex", 4),
    "U21 3F baseline": ("underdog", "base", "Under", "single", "all", "none", 1, 0, 1, "flex", 3),
    "U22 4F baseline 2/game": ("underdog", "base", "Under", "single", "all", "none", 2, 0, 1, "flex", 4),
    "P1 5F under10 noast": ("prizepicks", "blend", "Under", "single", "under10", "half", 1, 0, 1, "flex", 5),
    "P3 5F top5": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 0, 1, "flex", 5),
    "P4 5F avg": ("prizepicks", "avg", "Under", "single", "half", "none", 1, 0, 1, "flex", 5),
    "P5 6F avg": ("prizepicks", "avg", "Under", "single", "half", "none", 1, 0, 1, "flex", 6),
    "P6 6F props": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 1, 1, "flex", 6),
    "P9 4F top4": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 0, 1, "flex", 4),
    "P10 3P top3": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 0, 1, "power", 3),
    "P21 5F reb geo": ("prizepicks", "geo", "Under", "single", "reb", "half", 1, 0, 1, "flex", 5),
    "P22 6F reb geo": ("prizepicks", "geo", "Under", "single", "reb", "half", 1, 0, 1, "flex", 6),
    "P24 5F props": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 1, 1, "flex", 5),
    "P25 6F top6": ("prizepicks", "blend", "Under", "single", "half", "none", 1, 0, 1, "flex", 6),
    "P26 5F home": ("prizepicks", "blend", "Under", "single", "home", "half", 1, 0, 1, "flex", 5),
}


def pay(app, st, k, miss, old):
    if app == "underdog" and old:
        if st != "power" or k not in UD_P_OLD:
            return None
        return UD_P_OLD[k] if miss == 0 else 0.0
    if st == "power":
        return (PP_P if app == "prizepicks" else UD_P)[k] if miss == 0 else 0.0
    return (PP_F if app == "prizepicks" else UD_F).get((k, miss), 0.0)


def dd_drought(u):
    cum = np.cumsum(u); peak = np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:]
    run = best = 0
    for x in u:
        run = run + 1 if x < 0 else 0; best = max(best, run)
    return float(np.max(peak - cum)) if len(u) else 0.0, best


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("""SELECT c.season, c.game_date, c.app, c.player_id, c.prop, c.line::float8 line, c.side, c.hit_cal::float8 cal, c.hit_rate::float8 hr,
                              c.final_hp::float8 fhp, c.p_market::float8 book, (c.result = 'won')::int w, c.stat_actual::float8 sa, g.game_id gid,
                              (g.matchup LIKE '%%vs.%%') home, b.p_blend::float8 blend, b.p_gbm_s::float8 gbm_s, h.ph::float8 base
                       FROM nba_score.leg_card_v2 c JOIN nba_stats.player_game_log g ON g.nba_player_id::text = c.player_id AND g.game_date = c.game_date
                       LEFT JOIN (SELECT DISTINCT ON (app, game_date, player_id, prop, side, line::float8) app, game_date, player_id, prop, side,
                                         line::float8 line, p_blend, p_gbm_s FROM nba_score._lr_legs_hp WHERE kind IN ('standard', 'R')
                                         AND app IN ('prizepicks', 'underdog')) b
                              ON b.app = c.app AND b.game_date = c.game_date AND b.player_id = c.player_id AND b.prop = c.prop AND b.side = c.side AND b.line = c.line::float8
                       LEFT JOIN (SELECT DISTINCT ON (app, game_date, player_id, prop, side, line::float8) app, game_date, player_id, prop, side,
                                         line::float8 line, ph FROM nba_score._lr_legs_h WHERE app IN ('prizepicks', 'underdog')) h
                              ON h.app = c.app AND h.game_date = c.game_date AND h.player_id = c.player_id AND h.prop = c.prop AND h.side = c.side AND h.line = c.line::float8
                       WHERE c.result IN ('won','lost') AND c.hit_cal IS NOT NULL
                         AND ((c.app = 'prizepicks' AND c.kind = 'standard') OR (c.app = 'underdog' AND c.leg_mult = 1))""", conn)
    d["gd"] = pd.to_datetime(d.game_date)
    for a, x in d.groupby("app"):
        print(f"LB|{a}: legs {len(x):,}, slates {x.game_date.nunique()} | coverage blend {100*x.blend.notna().mean():.0f}% base {100*x.base.notna().mean():.0f}% "
              f"gbm_s {100*x.gbm_s.notna().mean():.0f}% book {100*x.book.notna().mean():.0f}%", flush=True)
    # trailing form at the leg's own line (pass 18): the player's last 10 earlier games in this stat
    h = d.dropna(subset=["sa"]).drop_duplicates(["player_id", "prop", "gd"])[["player_id", "prop", "gd", "sa"]].sort_values("gd")
    hist = {k: (x.gd.values, x.sa.values) for k, x in h.groupby(["player_id", "prop"])}
    f10 = np.full(len(d), np.nan); ng = np.zeros(len(d))
    gdv_all = d.gd.values; ln_all = d.line.values; und = (d.side.values == "Under")
    for key, idx in d.groupby(["player_id", "prop"]).indices.items():
        if key not in hist:
            continue
        gdv, sav = hist[key]
        js = np.searchsorted(gdv, gdv_all[idx])
        for i, j in zip(idx, js):
            ng[i] = j
            if j >= 5:
                last = sav[max(0, j - 10):j]
                f10[i] = np.mean(last < ln_all[i]) if und[i] else np.mean(last > ln_all[i])
    d["form"] = f10; d["ngames"] = ng
    # trailing results of the player on this app and side (pass 26): his last 8 earlier graded legs
    d = d.sort_values(["app", "player_id", "side", "gd"]).reset_index(drop=True)
    ph = np.full(len(d), np.nan)
    for _, idx in d.groupby(["app", "player_id", "side"]).indices.items():
        gdv = d.gd.values[idx]; cs = np.concatenate([[0], np.cumsum(d.w.values[idx])])
        js = np.searchsorted(gdv, gdv)
        for i, j in zip(idx, js):
            if j >= 4:
                lo = max(0, j - 8); ph[i] = (cs[j] - cs[lo]) / (j - lo)
    d["plr"] = ph
    d["avg"] = (d.blend + d.base) / 2
    d["geo"] = np.sqrt(d.base * d.book)
    rng = np.random.default_rng(7)
    seeds = int(os.environ.get("LB_SEEDS") or 3)
    real = ["blend", "base", "avg", "geo", "gbm_s", "book", "cal", "hr", "fhp"]
    for s in range(seeds):
        d[f"rnd{s}"] = rng.random(len(d))
    rankers = real + [f"rnd{s}" for s in range(seeds)]
    d["single"] = d.prop.isin(SINGLE)
    pools = {"all": lambda x: np.ones(len(x), bool), "noast": lambda x: ~x.prop.str.contains("ast").values,
             "reb": lambda x: (x.prop == "rebounds").values, "pts": lambda x: (x.prop == "points").values, "def": lambda x: x.prop.isin(DEF).values,
             "home": lambda x: x.home.values.astype(bool), "away": lambda x: ~x.home.values.astype(bool),
             "under10": lambda x: (x.line < 10).values, "half": lambda x: (np.abs(x.line % 1 - 0.5) < 1e-6).values}
    layers = {"none": None, "form60": lambda x: (x.form >= 0.6).values, "form40-": lambda x: (x.form <= 0.4).values,
              "g20": lambda x: (x.ngames >= 20).values, "plrhot": lambda x: (x.plr >= 0.6).values, "plrcold": lambda x: (x.plr <= 0.4).values,
              "half": lambda x: (np.abs(x.line % 1 - 0.5) < 1e-6).values}
    res = defaultdict(list)
    for (app, gdate), x in d.groupby(["app", "game_date"]):
        season = x.season.iloc[0]; old = str(gdate) < "2026-07-01"
        for uni in ("single", "every"):
            xu = x[x.single.values] if uni == "single" else x
            for side in ("Under", "both", "Over"):
                xs = xu if side == "both" else xu[xu.side.values == side]
                if not len(xs):
                    continue
                for rk in rankers:
                    o = xs[xs[rk].notna().values].sort_values(rk, ascending=False, kind="mergesort").drop_duplicates(["player_id", "prop"])
                    if not len(o):
                        continue
                    for pn, pf in pools.items():
                        op = o[pf(o)]
                        for ln, lf in layers.items():
                            if ln != "none" and pn not in ("all", "noast", "half", "under10", "reb", "home"):
                                continue
                            ol = op if lf is None else op[lf(op)]
                            if len(ol) < 2:
                                continue
                            pid = ol.player_id.values; gid = ol.gid.values; prp = ol.prop.values; wv = ol.w.values
                            for gcap in (1, 2):
                                for pdif in (0, 1):
                                    sel = []; ug = defaultdict(int); upl = set(); upr = set()
                                    for i in range(len(ol)):
                                        if pid[i] in upl or ug[gid[i]] >= gcap or (pdif and prp[i] in upr):
                                            continue
                                        sel.append(wv[i]); upl.add(pid[i]); ug[gid[i]] += 1; upr.add(prp[i])
                                        if len(sel) >= 7:
                                            break
                                    for start in (1, 2):
                                        ss = sel[start - 1:]
                                        for st, k in STRUCTS:
                                            if len(ss) < k:
                                                continue
                                            pv = pay(app, st, k, k - sum(ss[:k]), old)
                                            if pv is None:
                                                continue
                                            res[(app, rk, side, uni, pn, ln, gcap, pdif, start, st, k)].append((season, gdate, pv - 1, sum(ss[:k]), k))
    rows = []
    for key, v in res.items():
        if len(v) < 40:
            continue
        v.sort(key=lambda t: t[1])
        s = np.array([t[0] for t in v]); u = np.array([t[2] for t in v]); wl = sum(t[3] for t in v); nl = sum(t[4] for t in v)
        top = np.sort(u)[::-1]; dd, dr = dd_drought(u)
        r = dict(zip(("app", "rk", "side", "uni", "pool", "layer", "gcap", "pdif", "start", "st", "k"), key))
        r.update(n=len(u), roi=u.mean(), units=u.sum(), wo5=(u.sum() - top[:5].sum()) / len(u), hit=wl / nl, dd=dd, drought=dr)
        for ss in SEASONS:
            m = s == ss; r[f"n{ss[2:4]}"] = int(m.sum()); r[f"r{ss[2:4]}"] = float(u[m].mean()) if m.any() else np.nan
        rows.append(r)
    R = pd.DataFrame(rows)
    R["rand"] = R.rk.str.startswith("rnd")
    R["allpos"] = (R.roi > 0) & (R.wo5 > 0) & (R.r24.fillna(1) > 0) & (R.r25.fillna(1) > 0) & (R.r26.fillna(1) > 0) & (R.n26 >= 10)
    print(f"LB|cells {len(R):,} (real rankers {(~R.rand).sum():,}, random {R.rand.sum():,})", flush=True)

    def line(r):
        return (f"{r.app[:2]} {r.rk} {r.side} {r.uni} {r.pool} {r.layer} g{r.gcap}{' pd' if r.pdif else ''}{' from#2' if r.start == 2 else ''} {r.st} {r.k}: "
                f"{r.n} slips {100*r.roi:+.1f}% ({r.units:+.1f} u; w/o 5 best {100*r.wo5:+.1f}%) | {100*r.r24:+.0f} / {100*r.r25:+.0f} / {100*r.r26:+.0f}% "
                f"({r.n24}/{r.n25}/{r.n26}) | dd {r.dd:.1f} drought {r.drought} | legs {100*r.hit:.1f}%")
    # A. the documented live codes, re-run
    print("LB|A. DOCUMENTED LIVE CODES ON THE CERTIFIED CARD (and the same cell with random order, mean of seeds)", flush=True)
    idx = R.set_index(["app", "rk", "side", "uni", "pool", "layer", "gcap", "pdif", "start", "st", "k"])
    for nm, key in NAMED.items():
        if key in idx.index:
            r = idx.loc[key]; rr = [idx.loc[(key[0], f"rnd{s}") + key[2:]].roi for s in range(seeds) if (key[0], f"rnd{s}") + key[2:] in idx.index]
            print(f"LB|  {nm}: {r.n} slips {100*r.roi:+.1f}% ({r.units:+.1f} u, w/o 5 best {100*r.wo5:+.1f}%) | {100*r.r24:+.0f} / {100*r.r25:+.0f} / "
                  f"{100*r.r26:+.0f}% | dd {r.dd:.1f} drought {r.drought} | legs {100*r.hit:.1f}% || random order {100*np.mean(rr):+.1f}%", flush=True)
        else:
            print(f"LB|  {nm}: under 40 slips", flush=True)
    # B. luck: share of cells positive in every season (and w/o 5 best), real vs random
    for lab, m in (("real", ~R.rand), ("random", R.rand)):
        X = R[m]
        print(f"LB|B. {lab}: cells {len(X):,} | ROI > 0 {100*(X.roi > 0).mean():.1f}% | positive every season + w/o 5 best {100*X.allpos.mean():.2f}% ({X.allpos.sum():,})", flush=True)
    # C. trust: chosen on 2024-26 -> read 2026-27
    for lab, m in (("real", ~R.rand), ("random", R.rand)):
        X = R[m & (R.n24 >= 30) & (R.n25 >= 30) & (R.n26 >= 15)]
        pick = X[(X.r24 > 0) & (X.r25 > 0)]
        best = pick.assign(sc=pick.r24 + pick.r25).sort_values("sc", ascending=False)
        print(f"LB|C. TRUST {lab}: eligible {len(X):,} | chosen on 2024-26 {len(pick):,} ({100*len(pick)/max(len(X),1):.1f}%) -> 2026-27 mean {100*pick.r26.mean():+.1f}%, "
              f"positive {100*(pick.r26 > 0).mean():.0f}% | top 30 chosen -> {100*best.head(30).r26.mean():+.1f}% | not chosen -> {100*X.drop(pick.index).r26.mean():+.1f}%", flush=True)
    # D. by dimension (real rankers): share positive every season, against random
    for col in ("rk", "side", "uni", "pool", "layer", "gcap", "pdif", "start", "k", "st"):
        g = R[~R.rand].groupby(col).agg(cells=("roi", "size"), allpos=("allpos", "mean"), roi=("roi", "mean"), hit=("hit", "mean"))
        print(f"LB|D. by {col}: " + " | ".join(f"{i} {int(r.cells)} cells {100*r.allpos:.1f}% all-season+, mean {100*r.roi:+.1f}%, legs {100*r.hit:.1f}%" for i, r in g.iterrows()), flush=True)
    print(f"LB|D. random rankers: {100*R[R.rand].allpos.mean():.2f}% all-season+, mean {100*R[R.rand].roi.mean():+.1f}%, legs {100*R[R.rand].hit.mean():.1f}%", flush=True)
    # E. the best real cells that are positive every season and beat the random 99th percentile of their structure
    q = R[R.rand].groupby(["app", "st", "k"]).roi.quantile(0.99).rename("q99")
    T = R[~R.rand & R.allpos].join(q, on=["app", "st", "k"])
    T = T[T.roi > T.q99].sort_values("roi", ascending=False)
    print(f"LB|E. real cells positive every season AND above the random 99th percentile of their structure: {len(T):,}", flush=True)
    for app in ("underdog", "prizepicks"):
        for r in T[T.app == app].drop_duplicates(["rk", "side", "uni", "pool", "layer", "st", "k"]).head(30).itertuples():
            print("LB|  " + line(r), flush=True)
    print("LB|random 99th percentile by structure: " + " | ".join(f"{a[:2]} {s} {k} {100*v:+.0f}%" for (a, s, k), v in q.items()), flush=True)
    R.to_csv("leg_battery_cells.csv", index=False)
    print("LB|DONE", flush=True)


if __name__ == "__main__":
    main()
