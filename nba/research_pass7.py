#!/usr/bin/env python3
"""
PASS 7 - WHAT WAS STILL UNTESTED ON THE CANDIDATE FAMILY. READ-ONLY. (NBA_HONEST_REBUILD.md 8x)
Owner 2026-11-19 21:07 PT: "Cover every aspect and issues that still open and also all untested variations, techniques and aspects untested. No exceptions."
The pool is the certified one: regular single-stat legs of the slate (v_legs_honest), ranked by the walk-forward blend, one leg a player and a game.
  A. CONDITIONS      the candidate slip split by slate size, weekday, month, the weakest leg's chance, the gap to the next leg, same / different prop
  B. COMPOSITION     Under + Over mixes, legs both rankers agree on, legs that are top on BOTH apps the same slate
  C. STAKING         flat against "skip weak slates" and "double on strong slates" (threshold from PAST slates only)
  D. PORTFOLIO       the candidates run together day by day: units, ROI, slips a slate, drawdown, droughts, losing months, overlap between apps
  E. RANGE           10,000 resamples of the slates: the range of the pooled and of the season-weighted (1.0 / 0.6 / 0.35) ROI
Env: DATABASE_URL.
"""
import os
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
SEAS = ["2024-25", "2025-26", "2026-27"]; SW = {"2026-27": 1.0, "2025-26": 0.6, "2024-25": 0.35}
CAND = {"underdog": [("2S", 2, {2: 3.5}), ("3S", 3, {3: 6.5})], "prizepicks": [("3P", 3, {3: 6.0}), ("4F", 4, {4: 6.0, 3: 1.5}), ("5F", 5, {5: 10.0, 4: 2.0, 3: 0.4})]}
rng = np.random.default_rng(11)


def summ(t):
    """t: frame gd, s, u (units), n (slips), w (any paying slip)"""
    if not len(t):
        return "-"
    t = t.sort_values("gd")
    per = "/".join(f"{100 * x['u'].sum() / x['n'].sum():+.0f}" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS))
    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = c = 0
    for w in t["w"].values:
        c = 0 if w else c + 1; dr = max(dr, c)
    return f"{per} | pooled {100 * t['u'].sum() / t['n'].sum():+.1f}%, {int(t['n'].sum())} slips, {t['u'].sum():+.1f} u, drawdown {dd:.1f}, drought {dr}"


def top(g, k, col="blend"):
    """first k rows of g (already sorted), one a player and a game"""
    out = []; games = set(); players = set()
    for i, (pl, game) in enumerate(zip(g["player_id"].values, g["game_id"].values)):
        if game in games or pl in players:
            continue
        out.append(i); games.add(game); players.add(pl)
        if len(out) == k:
            break
    return g.iloc[out]


def frame(rows):
    return pd.DataFrame(rows, columns=["gd", "s", "u", "n", "w"])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend,
                              v.p_honest_baseline::float8 ph, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.p_blend IS NOT NULL AND v.prop <> ALL(%s)""", conn, params=(list(COMBO),))
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d["dow"] = pd.to_datetime(d["gd"]).dt.day_name().str[:3]; d["ym"] = d["gd"].str[:7]
    port = {}
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]
        un = a[a["is_under"]].sort_values("blend", ascending=False); ov = a[~a["is_under"]].sort_values("blend", ascending=False)
        bo = a.sort_values("blend", ascending=False)
        ngames = a.groupby("gd")["game_id"].nunique().to_dict()
        ug = {gd: g for gd, g in un.groupby("gd", sort=True)}; og = {gd: g for gd, g in ov.groupby("gd", sort=True)}
        other = d[(d["app"] != app) & d["is_under"]].sort_values("blend", ascending=False)
        otop = {gd: set(zip(top(g, 8)["player_id"], top(g, 8)["prop"])) for gd, g in other.groupby("gd")}
        for st, k, table in CAND[app]:
            print(f"\nP7|================ {app.upper()} {st} - top {k} regular single-stat Unders by the blend; ROI 2024-25 / 2025-26 / 2026-27 ================", flush=True)
            base = []
            for gd, g in ug.items():
                t = top(g, k + 1)
                if len(t) < k:
                    continue
                c = t.iloc[:k]; u = table.get(int(c["hit"].sum()), 0.0) - 1
                base.append(dict(gd=gd, s=g["season"].iloc[0], u=u, n=1, w=u > 0, pmin=c["blend"].min(), pavg=c["blend"].mean(), gap=(c["blend"].min() - t["blend"].iloc[k]) if len(t) > k else np.nan,
                                 ng=ngames[gd], dow=g["dow"].iloc[0], ym=gd[:7], sameprop=c["prop"].nunique() == 1, lmax=c["line"].max(), pool=len(g),
                                 pl=tuple(c["player_id"]), props=tuple(c["prop"])))
            b = pd.DataFrame(base).sort_values("gd").reset_index(drop=True); port[(app, st)] = b
            print(f"P7|base: {summ(b)}", flush=True)
            print("P7|A. CONDITIONS", flush=True)
            for nm, key in (("games on the slate", pd.cut(b["ng"], [0, 3, 6, 9, 99], labels=["1-3", "4-6", "7-9", "10+"])), ("weekday", b["dow"]), ("month", b["ym"].str[5:]),
                            ("weakest leg's chance", pd.qcut(b["pmin"], 4, duplicates="drop")), ("gap to the next leg", pd.qcut(b["gap"], 3, duplicates="drop")),
                            ("same prop", b["sameprop"]), ("largest line", pd.cut(b["lmax"], [0, 3, 6, 12, 99], labels=["<=3", "3-6", "6-12", "12+"])),
                            ("Unders in the pool", pd.qcut(b["pool"], 3, duplicates="drop"))):
                for v, x in b.groupby(key, observed=True):
                    print(f"P7|  {nm} = {v}: {summ(x)}", flush=True)
            print("P7|B. COMPOSITION", flush=True)
            rows = {"top k-1 Unders + the best Over": [], "best of either side": [], "top k among legs BOTH rankers put in their top 8": [], "top k that are also top-8 on the other app": [],
                    "top k NOT in the other app's top 8": [], "ranked by the average of blend and honest baseline": []}
            bg = {gd: g for gd, g in bo.groupby("gd", sort=True)}
            for gd, g in ug.items():
                s = g["season"].iloc[0]
                if gd in og:
                    c = top(pd.concat([top(g, k - 1), og[gd]]), k)
                    if len(c) == k:
                        u = table.get(int(c["hit"].sum()), 0.0) - 1; rows["top k-1 Unders + the best Over"].append((gd, s, u, 1, u > 0))
                c = top(bg[gd], k)
                if len(c) == k:
                    u = table.get(int(c["hit"].sum()), 0.0) - 1; rows["best of either side"].append((gd, s, u, 1, u > 0))
                t8 = top(g, 8); h8 = top(g[g["ph"].notna()].sort_values("ph", ascending=False), 8)
                both = t8[[x in set(zip(h8["player_id"], h8["prop"])) for x in zip(t8["player_id"], t8["prop"])]]
                if len(both) >= k:
                    u = table.get(int(both["hit"].iloc[:k].sum()), 0.0) - 1; rows["top k among legs BOTH rankers put in their top 8"].append((gd, s, u, 1, u > 0))
                if gd in otop:
                    m = np.array([x in otop[gd] for x in zip(t8["player_id"], t8["prop"])])
                    for nm, sel in (("top k that are also top-8 on the other app", t8[m]), ("top k NOT in the other app's top 8", t8[~m])):
                        if len(sel) >= k:
                            u = table.get(int(sel["hit"].iloc[:k].sum()), 0.0) - 1; rows[nm].append((gd, s, u, 1, u > 0))
                g2 = g[g["ph"].notna()].assign(avg=lambda x: (x["blend"] + x["ph"]) / 2).sort_values("avg", ascending=False); c = top(g2, k)
                if len(c) == k:
                    u = table.get(int(c["hit"].sum()), 0.0) - 1; rows["ranked by the average of blend and honest baseline"].append((gd, s, u, 1, u > 0))
            for nm, r in rows.items():
                print(f"P7|  {nm}: {summ(frame(r))}", flush=True)
            print("P7|C. STAKING (threshold = median of the weakest leg's chance over PAST slates only; first 30 slates flat)", flush=True)
            med = b["pmin"].expanding().median().shift(1); strong = (b["pmin"] >= med) & (b.index >= 30)
            for nm, stake in (("flat 1 unit", np.ones(len(b))), ("skip slates below the past median", np.where(strong | (b.index < 30), 1.0, 0.0)), ("2 units on slates above the past median", np.where(strong, 2.0, 1.0)),
                              ("only slates above the past median", np.where(strong, 1.0, 0.0))):
                x = b.assign(u=b["u"] * stake, n=stake); x = x[x["n"] > 0]
                print(f"P7|  {nm}: {summ(x)}", flush=True)
            print("P7|E. RANGE (10,000 resamples of the slates)", flush=True)
            uu = b["u"].values; ss = b["s"].values; n = len(b); idx = rng.integers(0, n, (10000, n)); bu = uu[idx]
            pooled = bu.mean(1); print(f"P7|  pooled ROI {100 * uu.mean():+.1f}%: 5th..95th {100 * np.percentile(pooled, 5):+.1f}..{100 * np.percentile(pooled, 95):+.1f}%, chance it is above zero {100 * (pooled > 0).mean():.1f}%", flush=True)
            w = np.array([SW[x] for x in ss]); wb = (bu * w[idx]).sum(1) / w[idx].sum(1)
            print(f"P7|  season-weighted ROI {100 * (uu * w).sum() / w.sum():+.1f}%: 5th..95th {100 * np.percentile(wb, 5):+.1f}..{100 * np.percentile(wb, 95):+.1f}%, chance above zero {100 * (wb > 0).mean():.1f}%", flush=True)
            for s in SEAS:
                x = uu[ss == s]
                if len(x) > 10:
                    r = x[rng.integers(0, len(x), (10000, len(x)))].mean(1)
                    print(f"P7|  {s} ({len(x)} slips) {100 * x.mean():+.1f}%: 5th..95th {100 * np.percentile(r, 5):+.1f}..{100 * np.percentile(r, 95):+.1f}%, chance above zero {100 * (r > 0).mean():.1f}%", flush=True)
    print("\nP7|================ D. PORTFOLIO - the candidates run together, 1 unit a slip ================", flush=True)
    sets = {"Underdog 2-pick Standard alone": [("underdog", "2S")], "Underdog 2S + PrizePicks 5-pick Flex": [("underdog", "2S"), ("prizepicks", "5F")],
            "Underdog 2S + PrizePicks 3-pick Power": [("underdog", "2S"), ("prizepicks", "3P")], "Underdog 2S + PrizePicks 4-pick Flex": [("underdog", "2S"), ("prizepicks", "4F")],
            "PrizePicks 5-pick Flex alone": [("prizepicks", "5F")], "all five slips": [(a, st) for a in CAND for st, _, _ in CAND[a]]}
    for nm, ks in sets.items():
        x = pd.concat([port[k][["gd", "s", "u", "n", "w"]] for k in ks]).groupby(["gd", "s"], as_index=False).agg(u=("u", "sum"), n=("n", "sum"), w=("w", "max"))
        mo = x.assign(ym=x["gd"].str[:7]).groupby("ym")["u"].sum(); r10 = x.sort_values("gd")["u"].rolling(10).sum().min()
        print(f"P7|  {nm}: {summ(x)}; slips a slate {x['n'].mean():.2f}; months {len(mo)}, losing months {(mo < 0).sum()}, worst month {mo.min():+.1f} u, best {mo.max():+.1f} u; worst 10 slates in a row {r10:+.1f} u", flush=True)
        for s in SEAS:
            y = x[x["s"] == s]
            if len(y):
                cum = np.concatenate([[0], np.cumsum(y.sort_values("gd")["u"].values)])
                print(f"P7|      {s}: {y['u'].sum():+.1f} u on {int(y['n'].sum())} slips ({len(y)} slates), ROI {100 * y['u'].sum() / y['n'].sum():+.1f}%, drawdown {(np.maximum.accumulate(cum) - cum).max():.1f}", flush=True)
    u2 = port[("underdog", "2S")].set_index("gd"); p5 = port[("prizepicks", "5F")].set_index("gd"); com = u2.index.intersection(p5.index)
    ov = [len(set(u2.loc[g, "pl"]) & set(p5.loc[g, "pl"])) for g in com]
    print(f"P7|  overlap Underdog top 2 vs PrizePicks top 5 on {len(com)} common slates: players shared 0 / 1 / 2 = {ov.count(0)} / {ov.count(1)} / {ov.count(2)}; "
          f"correlation of the two daily results {np.corrcoef(u2.loc[com, 'u'], p5.loc[com, 'u'])[0, 1]:+.2f}", flush=True)
    print("P7|DONE", flush=True)


if __name__ == "__main__":
    main()
