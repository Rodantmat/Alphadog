#!/usr/bin/env python3
"""
THE LIVE SET AS ONE PORTFOLIO, WITH THE OWNER'S LEG-EXPOSURE RULE (owner 2026-11-22 19:19 PT: "the strongest leg cannot be in more than 35% of
the slips and the 2nd and 3rd cannot be in more than 20%, every thing else should be just in a single slip"). READ-ONLY.
Certified leg card, real prices (PrizePicks regular half-point lines; Underdog 1.0x legs; Underdog 2024-26 Standard 2-5 at 3/6/10/20, its flex not
verified -> Underdog Flex codes count on 2026-27 only). Per app and slate the codes build in their live order; a leg = player x prop x side.
Rule (per app, per slate, N = slips the app builds that slate): after every pick, the legs' slip counts sorted high -> low must satisfy
c1 <= floor(A x N), c2, c3 <= floor(B x N), c4.. <= 1 (a leg that would break it is skipped and the code takes its next-ranked leg).
Modes: none (live today) | 35/20 (owner) | 50/30 | 25/15 | 45/25 | every leg once. Also: per code keep / drop, the ranking gate (pass 18),
U3 (PrizePicks' order played on Underdog), P2, P7 (bench: last-10 minutes < 24).
Env: DATABASE_URL.
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
SINGLE = {"points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "fga", "fta", "ftm", "oreb", "fgm", "dreb", "personal_fouls"}
SEAS = ("2024-25", "2025-26", "2026-27")
# code: (ranker, pool, gcap, props-different, struct, k)
UD = {"U1": ("blend", "all", 1, 0, "power", 2), "U2": ("base", "all", 1, 0, "power", 2), "U3": ("ppord", "all", 1, 0, "power", 2),
      "U4": ("blend", "reb", 1, 0, "power", 2), "U5": ("blend", "home", 1, 0, "power", 2), "U6": ("blend", "reb", 1, 0, "power", 3),
      "U9": ("blend", "noast", 2, 0, "power", 3), "U7": ("blend", "reb", 1, 0, "flex", 4), "U8": ("blend", "noast", 2, 0, "flex", 4)}
PP = {"P1": ("blend", "u10noast", 1, 0, "flex", 5), "P2": ("blend", "u10", 1, 0, "flex", 5), "P3": ("blend", "all", 1, 0, "flex", 5),
      "P4": ("avg", "all", 1, 0, "flex", 5), "P5": ("avg", "all", 1, 0, "flex", 6), "P6": ("blend", "all", 1, 1, "flex", 6),
      "P7": ("blend", "bench", 1, 0, "flex", 6), "P9": ("blend", "all", 1, 0, "flex", 4), "P10": ("blend", "all", 1, 0, "power", 3)}
MODES = {"none": None, "owner 35/20": (0.35, 0.20), "50/30": (0.50, 0.30), "45/25": (0.45, 0.25), "25/15": (0.25, 0.15), "once": (0.0, 0.0)}


def pay(app, st, k, miss, old):
    if app == "underdog" and old:
        if st != "power" or k not in UD_P_OLD:
            return None
        return UD_P_OLD[k] if miss == 0 else 0.0
    if st == "power":
        return (PP_P if app == "prizepicks" else UD_P)[k] if miss == 0 else 0.0
    return (PP_F if app == "prizepicks" else UD_F).get((k, miss), 0.0)


def ok_counts(cnt, key, n, cap):
    if cap is None:
        return True
    c = dict(cnt); c[key] = c.get(key, 0) + 1
    v = sorted(c.values(), reverse=True)
    a, b = max(1, int(np.floor(cap[0] * n))), max(1, int(np.floor(cap[1] * n)))
    return v[0] <= a and (len(v) < 2 or v[1] <= b) and (len(v) < 3 or v[2] <= b) and (len(v) < 4 or v[3] <= 1)


def pool_mask(x, pool):
    if pool == "all":
        return np.ones(len(x), bool)
    if pool == "reb":
        return (x.prop == "rebounds").values
    if pool == "home":
        return x.home.values.astype(bool)
    if pool == "noast":
        return ~x.prop.str.contains("ast").values
    if pool == "u10":
        return (x.line < 10).values
    if pool == "u10noast":
        return (x.line < 10).values & ~x.prop.str.contains("ast").values
    if pool == "bench":
        return (x.min10 < 24).values
    raise ValueError(pool)


def stats(u):
    u = np.asarray(u, float)
    if not len(u):
        return dict(n=0, roi=np.nan, units=0.0, dd=0.0)
    cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:] - cum))
    return dict(n=len(u), roi=u.mean(), units=u.sum(), dd=dd)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("""SELECT c.season, c.game_date, c.app, c.player_id, c.prop, c.line::float8 line, c.side, (c.result = 'won')::int w, g.game_id gid,
                              (g.matchup LIKE '%%vs.%%') home, b.p_blend::float8 blend, h.ph::float8 base
                       FROM nba_score.leg_card_v2 c JOIN nba_stats.player_game_log g ON g.nba_player_id::text = c.player_id AND g.game_date = c.game_date
                       LEFT JOIN (SELECT DISTINCT ON (app, game_date, player_id, prop, side, line::float8) app, game_date, player_id, prop, side,
                                         line::float8 line, p_blend FROM nba_score._lr_legs_hp WHERE kind IN ('standard', 'R') AND app IN ('prizepicks', 'underdog')) b
                              ON b.app = c.app AND b.game_date = c.game_date AND b.player_id = c.player_id AND b.prop = c.prop AND b.side = c.side AND b.line = c.line::float8
                       LEFT JOIN (SELECT DISTINCT ON (app, game_date, player_id, prop, side, line::float8) app, game_date, player_id, prop, side,
                                         line::float8 line, ph FROM nba_score._lr_legs_h WHERE app IN ('prizepicks', 'underdog')) h
                              ON h.app = c.app AND h.game_date = c.game_date AND h.player_id = c.player_id AND h.prop = c.prop AND h.side = c.side AND h.line = c.line::float8
                       WHERE c.result IN ('won','lost') AND c.side = 'Under'
                         AND ((c.app = 'prizepicks' AND c.kind = 'standard') OR (c.app = 'underdog' AND c.leg_mult = 1))""", conn)
    d = d[d.prop.isin(SINGLE)].copy()
    d = d[(d.app == "underdog") | (np.abs(d.line % 1 - 0.5) < 1e-6)]          # PrizePicks live rule: half-point lines
    d["avg"] = (d.blend + d.base) / 2
    mins = pd.read_sql("SELECT nba_player_id::text player_id, game_date, min::float8 mn FROM nba_stats.player_game_log WHERE game_date >= '2024-09-01'", conn)
    mins = mins.sort_values(["player_id", "game_date"])
    mins["min10"] = mins.groupby("player_id").mn.transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    d = d.merge(mins[["player_id", "game_date", "min10"]], on=["player_id", "game_date"], how="left")
    d["key"] = d.player_id + "|" + d.prop
    print(f"PC|legs {len(d):,} (single-stat Unders; PrizePicks half-point lines) | PP slates {d[d.app == 'prizepicks'].game_date.nunique()} "
          f"UD slates {d[d.app == 'underdog'].game_date.nunique()}", flush=True)
    ppd = {gd: x for gd, x in d[d.app == "prizepicks"].groupby("game_date")}
    out = defaultdict(list)            # (mode, app, code) -> [(season, date, u)]
    expo = defaultdict(list)           # (mode, app) -> share of the slate's slips held by the top leg
    for (app, gd), x in d.groupby(["app", "game_date"]):
        season = x.season.iloc[0]; old = str(gd) < "2026-07-01"
        codes = UD if app == "underdog" else PP
        lists = {}
        for code, (rk, pool, gcap, pdif, st, k) in codes.items():
            if pay(app, st, k, 0, old) is None:
                continue
            if rk == "ppord":       # PrizePicks' blend order, the same player + prop Under on Underdog's board
                p = ppd.get(gd)
                if p is None:
                    continue
                order = p[p.blend.notna()].sort_values("blend", ascending=False).key.drop_duplicates().tolist()
                xu = x.drop_duplicates("key").set_index("key")
                o = xu.loc[[kk for kk in order if kk in xu.index]].reset_index()
            else:
                o = x[x[rk].notna().values].sort_values(rk, ascending=False, kind="mergesort").drop_duplicates("key")
            o = o[pool_mask(o, pool)]
            lists[code] = (o, gcap, pdif, st, k)
        n = len(lists)
        for mode, cap in MODES.items():
            cnt = {}
            for code, (o, gcap, pdif, st, k) in lists.items():
                sel = []; ug = defaultdict(int); upl = set(); upr = set(); tmp = dict(cnt)   # the slip's own earlier picks count too
                for r in o.itertuples():
                    if r.player_id in upl or ug[r.gid] >= gcap or (pdif and r.prop in upr) or not ok_counts(tmp, r.key, n, cap):
                        continue
                    sel.append(r); upl.add(r.player_id); ug[r.gid] += 1; upr.add(r.prop); tmp[r.key] = tmp.get(r.key, 0) + 1
                    if len(sel) == k:
                        break
                if len(sel) < k:
                    continue
                for r in sel:
                    cnt[r.key] = cnt.get(r.key, 0) + 1
                pv = pay(app, st, k, k - sum(r.w for r in sel), old)
                out[(mode, app, code)].append((season, gd, pv - 1))
            built = sum(1 for c in lists if out[(mode, app, c)] and out[(mode, app, c)][-1][1] == gd)
            if cnt and built:
                expo[(mode, app)].append(max(cnt.values()) / built)
    # report
    for app in ("underdog", "prizepicks"):
        print(f"PC|===== {app.upper()} =====", flush=True)
        for mode in MODES:
            allu = []; ses = defaultdict(list); days = defaultdict(float)
            for code in (UD if app == "underdog" else PP):
                for s, gd, u in out[(mode, app, code)]:
                    allu.append((gd, u)); ses[s].append(u); days[gd] += u
            allu.sort(); st = stats([u for _, u in allu]); dv = np.array([days[g] for g in sorted(days)])
            cum = np.cumsum(dv); ddd = float(np.max(np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:] - cum)) if len(dv) else 0
            ex = np.array(expo[(mode, app)])
            print(f"PC|{mode:12s} {st['n']:5d} slips ({st['n']/max(len(days),1):.1f} a slate) ROI {100*st['roi']:+.1f}% {st['units']:+.1f} u | "
                  + " / ".join(f"{100*np.mean(ses[s]):+.0f}%" if ses[s] else "-" for s in SEAS)
                  + f" | drawdown (days) {ddd:.1f} u | losing slates {100*(dv < 0).mean():.0f}% worst slate {dv.min():+.1f} u | "
                  f"top leg in {100*np.mean(ex):.0f}% of slips (max {100*ex.max():.0f}%)", flush=True)
        print("PC|  per code (mode: ROI pooled | by season | slips):", flush=True)
        for code in (UD if app == "underdog" else PP):
            parts = []
            for mode in ("none", "owner 35/20", "once"):
                v = out[(mode, app, code)]
                if not v:
                    continue
                s = np.array([a for a, _, _ in v]); u = np.array([c for _, _, c in v])
                top = np.sort(u)[::-1]
                parts.append(f"{mode}: {100*u.mean():+.1f}% ({len(u)}; w/o 5 best {100*(u.sum()-top[:5].sum())/len(u):+.1f}%) "
                             + "/".join(f"{100*u[s == ss].mean():+.0f}" if (s == ss).any() else "-" for ss in SEAS))
            print(f"PC|  {code}: " + " || ".join(parts), flush=True)
    # ranking gate (pass 18): play a code only when its own last 5 / 10 slips are up, or only when down
    print("PC|RANKING GATE on the live set (no caps): play only after the code's last W slips were up / down", flush=True)
    for app in ("underdog", "prizepicks"):
        for W in (5, 10):
            up = []; dn = []
            for code in (UD if app == "underdog" else PP):
                v = [u for _, _, u in out[("none", app, code)]]
                for i in range(W, len(v)):
                    (up if np.mean(v[i - W:i]) > 0 else dn).append(v[i])
            print(f"PC|  {app} W={W}: after up {100*np.mean(up):+.1f}% ({len(up)}) | after down {100*np.mean(dn):+.1f}% ({len(dn)})", flush=True)
    print("PC|DONE", flush=True)


if __name__ == "__main__":
    main()
