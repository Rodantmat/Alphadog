#!/usr/bin/env python3
"""
DO THE BAD-DAY SIGNS HOLD IN THE PAST SEASONS? (owner 2026-11-23 22:19 PT: "Test on the previous seasons and test if anything clearly holds.")
research_bad_days.py found on 2026-27 (33 slates, the live set): legs from lopsided games (big point spread) hit less, days whose slips lean on lopsided
games lose, small slates and small-line rebounds / blocks / steals did worse in the drought. READ-ONLY test of those signs, all known BEFORE tip-off,
on 2024-25, 2025-26 and 2026-27 with the universe loader (certified grading, real prices) and the live set's own PrizePicks / Underdog codes
(research_set_check.SETS daily codes: same rankers, filters, game caps, structures).
  1. leg level: hit rate of every regular Under and of the day's top 30 (main ranking) by the game's pre-game spread, per season
  2. slip level, each rule vs as built, per season: ROI, slips, units
       legs from games with |spread| >= T left out (T 6, 8, 10, 12)          (the slip takes the next legs of its own list)
       slip skipped when its legs' average |spread| > T (T 6.5, 7.5, 8.5)
       slate skipped when its games' average |spread| > T (T 6.5, 7.5)
       slate skipped when it has <= 5 / <= 8 games
       props: no rebounds / no blocks + steals / no rebounds, blocks, steals
       line >= 3 / line >= 8
A rule "holds" only if it beats as-built in EVERY season with a fair number of slips.
Spreads: nba_market.game_lines_closing (median home spread over the books) to 2026-06, game_lines_snapshots (median) from 2026-10.
Env: DATABASE_URL, UA_APP.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402
import research_set_check as SC                                   # noqa: E402

FULL = {"ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
        "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
        "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat", "MIL": "Milwaukee Bucks",
        "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic",
        "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns", "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
        "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards"}


def spreads(conn):
    """(gd, player_id) -> (|spread| of his game, game key); gd -> games that day"""
    lg = pd.read_sql("SELECT game_date::text gd, nba_player_id::text player_id, matchup FROM nba_stats.player_game_log WHERE game_date >= '2024-09-01'", conn)
    m = lg["matchup"].astype(str)
    home_tc = np.where(m.str.contains(" vs"), m.str[:3], m.str[-3:])
    lg["home"] = [FULL.get(x) for x in home_tc]
    a = pd.read_sql("""SELECT game_date::text gd, home_team home, percentile_cont(0.5) WITHIN GROUP (ORDER BY home_spread)::float8 sp
                       FROM nba_market.game_lines_closing WHERE home_spread IS NOT NULL GROUP BY 1,2""", conn)
    b = pd.read_sql("""SELECT game_date::text gd, home_team home, percentile_cont(0.5) WITHIN GROUP (ORDER BY point)::float8 sp
                       FROM nba_market.game_lines_snapshots WHERE market='spreads' AND lower(outcome)=lower(home_team) AND game_date >= '2026-07-01' GROUP BY 1,2""", conn)
    # closing lines carry the UTC date: a late tip lands on the next day - match the home team on the same day first, then the day after
    a1 = a.copy(); a1["gd"] = (pd.to_datetime(a1["gd"]) - pd.Timedelta(days=1)).dt.strftime("%Y-%m-%d")
    sp = pd.concat([b, a, a1]).drop_duplicates(["gd", "home"], keep="first")
    lg = lg.merge(sp, on=["gd", "home"], how="left")
    lg["asp"] = lg["sp"].abs()
    games = lg.groupby("gd")["home"].nunique().to_dict()
    gsp = lg.drop_duplicates(["gd", "home"]).groupby("gd")["asp"].mean().to_dict()
    return lg.drop_duplicates(["gd", "player_id"]).set_index(["gd", "player_id"])["asp"], games, gsp


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    asp, games, gsp = spreads(conn)
    d["asp"] = [asp.get((g, p), np.nan) for g, p in zip(d["gd"].values, d["player_id"].values)]
    print(f"SP|{U.APP}: legs {len(d):,}, with a spread {np.isfinite(d['asp'].values).mean():.0%}; regular Unders with a spread by season: " +
          ", ".join(f"{s_} {np.isfinite(d['asp'].values[(d['season'].values == s_) & (d['easy'].values == 0) & d['under'].values]).mean():.0%}" for s_ in U.SEAS), flush=True)
    reg = d["easy"].values == 0; und = d["under"].values
    # 1. leg level
    bk = pd.cut(d["asp"], [-1, 4, 7, 10, 40], labels=["<4", "4-7", "7-10", "10+"])
    base = reg & und & np.isfinite(d["blend"].values.astype(float))
    d["rk"] = np.nan
    sub = d[base].copy(); sub["rk"] = sub.groupby("gd")["blend"].rank(ascending=False, method="first")
    d.loc[sub.index, "rk"] = sub["rk"]
    for lab, m in (("every regular Under", base), ("top 30 a day (main ranking)", base & (d["rk"].values <= 30))):
        for s in U.SEAS:
            mm = m & (d["season"].values == s)
            t = pd.DataFrame({"b": bk[mm], "w": d["w"].values[mm]}).groupby("b", observed=True)["w"].agg(["mean", "size"])
            print(f"SP|  legs {lab:28s} {s}: " + "  ".join(f"{k} {v['mean']:.1%} ({int(v['size'])})" for k, v in t.iterrows()), flush=True)
    # 2. slip level
    sets = [x for x in SC.SETS if x[6] == "daily"]
    masks = {}
    for code, rk, filt, gcap, st, k, role in sets:
        m = reg & und & np.isfinite(d[rk].values.astype(float))
        for f in filt:
            m &= L[f]
        masks[code] = m
    a_ = d["asp"].values; ln = d["line"].values; pr = d["prop"].values
    rules = [("as built", None)]
    rules += [(f"legs |spread| < {t}", ("leg", lambda i, t=t: ~(a_[i] >= t))) for t in (6, 8, 10, 12)]
    rules += [(f"slip avg |spread| <= {t}", ("slip", t)) for t in (6.5, 7.5, 8.5)]
    rules += [(f"slate avg |spread| <= {t}", ("slate", t)) for t in (6.5, 7.5)]
    rules += [(f"slate > {t} games", ("games", t)) for t in (5, 8)]
    rules += [("no rebounds", ("leg", lambda i: pr[i] != "rebounds")), ("no blocks / steals", ("leg", lambda i: ~np.isin(pr[i], ["blocks", "steals"]))),
              ("no reb / blk / stl", ("leg", lambda i: ~np.isin(pr[i], ["rebounds", "blocks", "steals"]))),
              ("line >= 3", ("leg", lambda i: ln[i] >= 3)), ("line >= 8", ("leg", lambda i: ln[i] >= 8))]
    res = defaultdict(lambda: defaultdict(list))
    by_gd = d.groupby("gd").indices
    pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values
    for gd in sorted(by_gd):
        ix = by_gd[gd]; old = gd < "2026-07-01"; season = d["season"].values[ix[0]]
        for name, rule in rules:
            if rule and rule[0] == "slate" and not (gsp.get(gd, 0) <= rule[1]):
                continue
            if rule and rule[0] == "games" and not (games.get(gd, 0) > rule[1]):
                continue
            for code, rk, filt, gcap, st, k, role in sets:
                j = ix[masks[code][ix]]
                if rule and rule[0] == "leg":
                    j = j[rule[1](j)]
                j = j[np.argsort(-d[rk].values[j].astype(float), kind="mergesort")]
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
                if rule and rule[0] == "slip" and not (np.nanmean(a_[s]) <= rule[1]):
                    continue
                v = SC.pay(st, k, int(w[s].sum()), float(lf[s].sum()), float(lf[s][w[s] == 1].sum()), old)
                if v is None:
                    continue
                res[name][season].append(v - 1)
    base_r = {s: np.mean(res["as built"][s]) if res["as built"][s] else np.nan for s in U.SEAS}
    for name, _ in rules:
        parts = []; beats = 0
        for s in U.SEAS:
            u = np.array(res[name][s])
            if len(u):
                parts.append(f"{s}: {100 * u.mean():+.1f}% ({len(u)}, {u.sum():+.1f} u)")
                beats += int(u.mean() > base_r[s] and len(u) >= 0.4 * len(res["as built"][s]))
            else:
                parts.append(f"{s}: -")
        print(f"SP|  {name:24s} " + " | ".join(parts) + f"  -> beats as-built in {beats}/{len(U.SEAS)} seasons", flush=True)
    print("SP|DONE", flush=True)


if __name__ == "__main__":
    main()
