#!/usr/bin/env python3
"""
SPREAD RULE - REFINEMENTS AND PROOF (owner 2026-11-23 22:36 PT: "Research online about it, see if any more refinements hold before deciding on deploying it.
Backtest and be sure"). READ-ONLY. Three seasons, universe loader (certified grading, real prices), spreads / totals from the books (closing lines to 2026-06,
snapshots from 2026-10).
What the public work says (DataStreak 40,856 props: overs 46.7% in games decided by <= 7, 40.9% in 20+ blowouts; Propline / RotoGrinders / OddsIndex): a big
spread forecasts a blowout; the FAVOURITE'S STARTERS lose 4-8 minutes (their Unders gain), the BENCH gains garbage minutes (its Unders lose), the
UNDERDOG'S starters keep or gain minutes; a late spread move is not always in the prop line yet. So the refinements tested:
  slip skip:  legs' average |spread| > T (T 7 .. 10), legs' max |spread| > T (9 .. 12), legs' average game total > T (230, 235)
  leg rules:  bench legs left out when |spread| >= T (6, 8, 10); same only for the favourite's bench / only the underdog's bench;
              underdog starters left out when |spread| >= T (8, 10); favourite starters ONLY in big-spread games (T 8)
  combined:   average > 8.5 skip + the best leg rule
Each rule vs as built, per season: ROI, slips, units, and for slip-skip rules the LUCK TEST (share of random skips of the same number of the as-built slips,
same seasons, doing as well - 2000 draws). Leg level: the day's top 30 Unders' hit rate by role x favourite / underdog x spread, per season.
Env: DATABASE_URL, UA_APP (prizepicks | underdog | sleeper | fliff).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402

FULL = {"ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
        "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
        "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat", "MIL": "Milwaukee Bucks",
        "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic",
        "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns", "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
        "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards"}
APP = U.APP
if APP in ("prizepicks", "underdog"):
    import research_set_check as SC                                # noqa: E402
    SETS = [x for x in SC.SETS if x[6] == "daily"]
    pay = SC.pay
else:   # Sleeper / Fliff: the main-ranking single-stat Under families the live S / F codes are built on (Max 2 .. 5, average ranking 5)
    SETS = [(f"X{k}", "blend", ("single",), 1, "power", k, "daily") for k in (2, 3, 4, 5)] + [("XA5", "avg", ("single",), 1, "power", 5, "daily")]

    def pay(st, k, w, lf_sum, lfh_sum, old):
        pw, fx = U.payouts(k, np.array([w]), np.array([0]), np.array([0.0]), np.array([lf_sum]), np.array([lfh_sum]), np.array([old]), {})
        v = (pw if st == "power" else fx)[0]
        return v if np.isfinite(v) else None


def market(conn):
    lg = pd.read_sql("SELECT game_date::text gd, nba_player_id::text player_id, matchup FROM nba_stats.player_game_log WHERE game_date >= '2024-09-01'", conn)
    m = lg["matchup"].astype(str); ishome = m.str.contains(" vs").values
    lg["home"] = [FULL.get(x) for x in np.where(ishome, m.str[:3], m.str[-3:])]; lg["ishome"] = ishome
    a = pd.read_sql("""SELECT game_date::text gd, home_team home, percentile_cont(0.5) WITHIN GROUP (ORDER BY home_spread)::float8 sp,
                              percentile_cont(0.5) WITHIN GROUP (ORDER BY total_line)::float8 tot
                       FROM nba_market.game_lines_closing WHERE home_spread IS NOT NULL GROUP BY 1,2""", conn)
    a1 = a.copy(); a1["gd"] = (pd.to_datetime(a1["gd"]) - pd.Timedelta(days=1)).dt.strftime("%Y-%m-%d")
    bs = pd.read_sql("""SELECT game_date::text gd, home_team home, percentile_cont(0.5) WITHIN GROUP (ORDER BY point)::float8 sp FROM nba_market.game_lines_snapshots
                        WHERE market='spreads' AND lower(outcome)=lower(home_team) AND game_date >= '2026-07-01' GROUP BY 1,2""", conn)
    bt = pd.read_sql("""SELECT game_date::text gd, home_team home, percentile_cont(0.5) WITHIN GROUP (ORDER BY point)::float8 tot FROM nba_market.game_lines_snapshots
                        WHERE market='totals' AND lower(outcome)='over' AND game_date >= '2026-07-01' GROUP BY 1,2""", conn)
    b = bs.merge(bt, on=["gd", "home"], how="outer")
    mk = pd.concat([b, a, a1]).drop_duplicates(["gd", "home"], keep="first")
    lg = lg.merge(mk, on=["gd", "home"], how="left")
    lg["tsp"] = np.where(lg["ishome"], lg["sp"], -lg["sp"])          # the player's team spread: negative = favourite
    return lg.drop_duplicates(["gd", "player_id"]).set_index(["gd", "player_id"])[["tsp", "tot"]]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    mk = market(conn)
    key = pd.MultiIndex.from_arrays([d["gd"].values, d["player_id"].values])
    mm = mk.reindex(key)
    d["tsp"] = mm["tsp"].values; d["tot"] = mm["tot"].values; d["asp"] = np.abs(d["tsp"].values)
    fav = d["tsp"].values < 0; dog = d["tsp"].values > 0
    st_ = L["starter"]; be_ = L["bench"]
    reg = d["easy"].values == 0; und = d["under"].values
    print(f"SR|{APP}: legs {len(d):,}; regular Unders with a spread: " + ", ".join(
        f"{s} {np.isfinite(d['asp'].values[(d['season'].values == s) & reg & und]).mean():.0%}" for s in U.SEAS) +
        f"; starters {st_[reg & und].mean():.0%}, bench {be_[reg & und].mean():.0%}", flush=True)
    # leg level
    base = reg & und & np.isfinite(d["blend"].values.astype(float))
    sub = d[base].copy(); rk = sub.groupby("gd")["blend"].rank(ascending=False, method="first")
    top = np.zeros(len(d), bool); top[sub.index[rk.values <= 30]] = True
    bk = pd.cut(d["asp"], [-1, 5, 8, 11, 40], labels=["<5", "5-8", "8-11", "11+"])
    for lab, m in (("starter, favourite", st_ & fav), ("starter, underdog", st_ & dog), ("bench, favourite", be_ & fav), ("bench, underdog", be_ & dog)):
        for s in U.SEAS:
            x = top & m & (d["season"].values == s)
            t = pd.DataFrame({"b": bk[x], "w": d["w"].values[x]}).groupby("b", observed=True)["w"].agg(["mean", "size"])
            print(f"SR|  top-30 legs {lab:19s} {s}: " + "  ".join(f"{k} {v['mean']:.1%} ({int(v['size'])})" for k, v in t.iterrows()), flush=True)
    masks = {}
    for code, rkr, filt, gcap, st, k, role in SETS:
        m = reg & und & np.isfinite(d[rkr].values.astype(float))
        for f in filt:
            m &= L[f]
        masks[code] = m
    a_ = d["asp"].values; to_ = d["tot"].values
    big = lambda t: a_ >= t                                                     # noqa: E731
    legr = {
        "bench out |sp|>=6": ~(be_ & big(6)), "bench out |sp|>=8": ~(be_ & big(8)), "bench out |sp|>=10": ~(be_ & big(10)),
        "fav bench out |sp|>=8": ~(be_ & fav & big(8)), "dog bench out |sp|>=8": ~(be_ & dog & big(8)),
        "dog starters out |sp|>=8": ~(st_ & dog & big(8)), "dog starters out |sp|>=10": ~(st_ & dog & big(10)),
        "big games: fav starters only (8)": ~(big(8) & ~(st_ & fav)),
    }
    rules = [("as built", None)]
    rules += [(f"skip slip avg |sp| > {t}", ("avg", t)) for t in (7, 7.5, 8, 8.5, 9, 9.5, 10)]
    rules += [(f"skip slip max |sp| > {t}", ("max", t)) for t in (9, 10, 11, 12)]
    rules += [(f"skip slip avg total > {t}", ("tot", t)) for t in (230, 235)]
    rules += [(n, ("leg", m)) for n, m in legr.items()]
    rules += [(f"avg > 8.5 skip + {n}", ("both", m)) for n, m in legr.items()]
    res = defaultdict(lambda: defaultdict(list))
    kept_ix = defaultdict(lambda: defaultdict(list))        # for the luck test: which as-built slips a skip rule kept
    by_gd = d.groupby("gd").indices
    pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values
    for gd in sorted(by_gd):
        ix = by_gd[gd]; old = gd < "2026-07-01"; season = d["season"].values[ix[0]]
        built = {}
        for name, rule in rules:
            for code, rkr, filt, gcap, st, k, role in SETS:
                j = ix[masks[code][ix]]
                if rule and rule[0] in ("leg", "both"):
                    j = j[rule[1][j]]
                j = j[np.argsort(-d[rkr].values[j].astype(float), kind="mergesort")]
                sel = []; up = set(); ug = defaultdict(int)
                for i in j:
                    if pid[i] in up or ug[gid[i]] >= gcap:
                        continue
                    sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                    if len(sel) == k:
                        break
                if len(sel) < k:
                    continue
                s = np.array(sel)
                if rule and rule[0] in ("avg", "both") and not (np.nanmean(a_[s]) <= (rule[1] if rule[0] == "avg" else 8.5)):
                    continue
                if rule and rule[0] == "max" and not (np.nanmax(a_[s]) <= rule[1]):
                    continue
                if rule and rule[0] == "tot" and not (np.nanmean(to_[s]) <= rule[1]):
                    continue
                v = pay(st, k, int(w[s].sum()), float(lf[s].sum()), float(lf[s][w[s] == 1].sum()), old)
                if v is None:
                    continue
                if name == "as built":
                    built[code] = len(res[name][season])
                elif rule[0] in ("avg", "max", "tot") and code in built:
                    kept_ix[name][season].append(built[code])
                res[name][season].append(v - 1)
    rng = np.random.default_rng(11)
    base_r = {s: np.array(res["as built"][s]) for s in U.SEAS}
    for name, rule in rules:
        parts = []; beats = 0; pl = []
        for s in U.SEAS:
            u = np.array(res[name][s]); b0 = base_r[s]
            if not len(u):
                parts.append(f"{s}: -"); continue
            parts.append(f"{s}: {100 * u.mean():+.1f}% ({len(u)}, {u.sum():+.1f} u)")
            beats += int(u.mean() > b0.mean() and len(u) >= 0.4 * len(b0))
            if rule and rule[0] in ("avg", "max", "tot") and len(b0):
                n = len(u); draws = np.array([b0[rng.choice(len(b0), n, replace=False)].mean() for _ in range(2000)])
                pl.append(f"{s[2:4]} p {float((draws >= u.mean()).mean()):.2f}")
        luck = (" | luck " + ", ".join(pl)) if pl else ""
        print(f"SR|  {name:42s} " + " | ".join(parts) + f"  -> beats as-built {beats}/{len(U.SEAS)}{luck}", flush=True)
    print("SR|DONE", flush=True)


if __name__ == "__main__":
    main()
