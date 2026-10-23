#!/usr/bin/env python3
"""
RESEARCH - BOARD TYPES, ROUND 2: ~40 NEW PRE-PICK FACTORS, GROWN FROM WHAT ROUND 1 SHOWED (2026-10-23; owner 10:25 PT: "you try those 50,
100. You need to try another 50, 100"). READ-ONLY. Same certified test as round 1 (research_board_types.analyze: day-clustered cells vs
the side x line type baseline with BH q in each season; cross-fit over a baseline shift with a day-clustered z).

Round 1 (ledger DAY THREE 25): only market structure survived (PrizePicks' line vs the books - small at pick time), near misses were the
opponent's allowance in the leg's stat and the player's recent level vs the line. Round 2 digs there:
  MARKET (window snapshot only - the leak rule T-4; NOTE the historical 'window' snapshot is ~14:40 PT, ~85 min after the live 13:15
  pick, as for every final_hp / tier-map input of the backtests)
    mk_p_disagree   books' devigged probability of the leg's side at PrizePicks' line (books main line = L0) minus final_hp
    mk_lean         books' devigged probability of the leg's side at their main line (the market's lean, any line)
    mk_hold         books' average overround at the main line (uncertainty)
    mk_disp         spread of the books' main lines (max - min)
    mk_nbooks1      books with one main line
    mk_fd_gap / mk_dk_gap / mk_mgm_gap   FanDuel / DraftKings / BetMGM main line minus PrizePicks L0 (signed for the leg's side)
    mk_ud_gap       Underdog's line minus PrizePicks L0 (signed for the side)
    mk_whole_half   PrizePicks whole-number L0 while the books sit on a half line
    mk_factor_rel   the leg's multiplier vs the day's median multiplier of the same prop x tier
  ROLE / USAGE (player logs before the day)
    ro_starts3, ro_start_change, ro_lastmin_ratio, ro_fga_share_trend, ro_cv20, ro_line_pct20, ro_line_vs_max, ro_venue_split,
    ro_vs_opp, ro_games7, ro_load3, ro_pts_share_trend, ro_ast_share_trend, ro_3pa_rate_trend, ro_ft_rate
  MATCHUP (team logs before the day; mapped to the leg's stat)
    mx_cross_stat   steals / stocks: opponent turnovers committed; blocks: opponent FGA; turnovers: opponent steals; rebounds: opponent
                    missed shots; threes: opponent 3PA allowed; points / combos: opponent FTA allowed; assists: opponent assists allowed
    mx_opp_def_trend, mx_opp_pace_trend, mx_team_ot_last
  BOARD SHAPE
    bs_span, bs_goblins, bs_demons, bs_star_rank, bs_props_vs_usual
  PRE-REGISTERED INTERACTIONS of round 1's near misses
    ix_form_x_allow (last-5 vs line x opp allowed in the stat), ix_gap_x_form (line gap x last-5 vs line)
Env: DATABASE_URL, BT_SAMPLE (probe), BT_ONLY.
"""
import math
import os
import sys
from bisect import bisect_left
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_board_types as BT            # noqa: E402
import research_pp_flex234 as F              # noqa: E402

SEASONS = BT.SEASONS
DFS = ("prizepicks", "underdog", "betr_us_dfs", "pick6", "sleeper", "dabble", "fliff")
log = BT.log
cut = BT.cut


def dec(american):
    a = float(american)
    return 1 + (a / 100 if a > 0 else 100 / -a)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    df = BT.load_legs(conn)
    name_tid, tinfo, tg = BT.team_tables(conn)
    pl, starter = BT.player_logs(conn)
    days = sorted(df.d.unique())
    feats = {}
    ONLY = BT.ONLY

    def put(name, values):
        if ONLY and not any(name.startswith(o) for o in ONLY):
            return
        assert len(values) == len(df), name
        feats[name] = values

    # ---------------- MARKET (window) ----------------
    snap = defaultdict(lambda: defaultdict(dict))   # (d, nm, prop) -> book -> {(line, side): price}
    for gd, player, mk, book, side, line, price in conn.execute("""
            SELECT game_date, player, market_key, bookmaker, side, line::float8, price
            FROM nba_market.board_snapshots
            WHERE snapshot_label = 'window' AND game_date BETWEEN %s AND %s AND market_key = ANY(%s) AND line IS NOT NULL
              AND price IS NOT NULL AND bookmaker IN ('fanduel', 'draftkings', 'betmgm', 'williamhill_us', 'betrivers', 'fanatics',
                                                      'betonlineag', 'bovada', 'underdog')""",
            (min(days), max(days), list(BT.MARKET_PROP))):
        snap[(gd, F.norm(player), BT.MARKET_PROP[mk])][book][(float(line), side)] = price
    log(f"window prices: {len(snap):,} player-props")
    std_line = df[df.tier == "R"].groupby(["d", "nm", "prop"]).line.first().to_dict()
    mcache = {}

    def market(key):
        if key in mcache:
            return mcache[key]
        books = snap.get(key)
        out = None
        if books:
            mains, ps, holds = {}, [], []
            for b, prices in books.items():
                lines = {ln for (ln, sd) in prices}
                if len(lines) != 1:
                    continue
                ln = next(iter(lines))
                mains[b] = ln
                if b == "underdog":
                    continue
                po, pu = prices.get((ln, "Over")), prices.get((ln, "Under"))
                if po is not None and pu is not None:
                    io, iu = 1 / dec(po), 1 / dec(pu)
                    ps.append((ln, io / (io + iu)))
                    holds.append(io + iu - 1)
            out = (mains, ps, holds)
        mcache[key] = out
        return out
    cols = defaultdict(list)
    for d, n, p, side, line, fhp, factor in zip(df.d, df.nm, df.prop, df.side, df.line, df.p, df.factor):
        L0 = std_line.get((d, n, p))
        m = market((d, n, p))
        sgn = 1 if side == "Over" else -1
        if m is None or L0 is None:
            for k in ("mk_p_disagree", "mk_lean", "mk_hold", "mk_disp", "mk_nbooks1", "mk_fd_gap", "mk_dk_gap", "mk_mgm_gap", "mk_ud_gap",
                      "mk_whole_half"):
                cols[k].append(None)
            continue
        mains, ps, holds = m
        bmains = [v for b, v in mains.items() if b != "underdog"]
        at_l0 = [q for (ln, q) in ps if abs(ln - L0) < 1e-9]
        if at_l0 and abs(line - L0) < 1e-9:
            q = float(np.median(at_l0))
            qs = q if side == "Over" else 1 - q
            cols["mk_p_disagree"].append(cut(qs - fhp, (-0.08, -0.04, -0.015, 0.015, 0.04, 0.08), ("<<", "<", "-", "=", "+", ">", ">>")))
        else:
            cols["mk_p_disagree"].append(None)
        if ps:
            q = float(np.median([x for _, x in ps]))
            qs = q if side == "Over" else 1 - q
            cols["mk_lean"].append(cut(qs, (0.45, 0.48, 0.52, 0.55), ("<45", "45-48", "48-52", "52-55", "55+")))
            cols["mk_hold"].append(cut(float(np.mean(holds)), (0.04, 0.06, 0.08), ("<4", "4-6", "6-8", "8+")))
        else:
            cols["mk_lean"].append(None); cols["mk_hold"].append(None)
        cols["mk_disp"].append(cut(max(bmains) - min(bmains), (0, 0.5, 1), ("0", "0.5", "1", "1.5+")) if bmains else None)
        cols["mk_nbooks1"].append(cut(len(bmains), (0, 1, 3, 5), ("0", "1", "2-3", "4-5", "6+")))
        for k, b in (("mk_fd_gap", "fanduel"), ("mk_dk_gap", "draftkings"), ("mk_mgm_gap", "betmgm"), ("mk_ud_gap", "underdog")):
            cols[k].append(cut(sgn * (mains[b] - L0), (-0.99, -0.01, 0.01, 0.99), ("<=-1", "-0.5", "0", "+0.5", ">=+1")) if b in mains else None)
        cols["mk_whole_half"].append("whole_vs_half" if float(L0).is_integer() and bmains and any(not float(x).is_integer() for x in bmains)
                                     else "other")
    for k, v in cols.items():
        put(k, v)
    med_f = df.groupby(["d", "prop", "tier"]).factor.transform("median")
    put("mk_factor_rel", [cut(f / m if m else None, (0.95, 1.05), ("low", "normal", "high")) for f, m in zip(df.factor, med_f)])
    log("market done")

    # ---------------- ROLE / USAGE ----------------
    pdates = {p: [x["d"] for x in v] for p, v in pl.items()}
    teamgame = {}
    for t, v in tg.items():
        for x in v:
            teamgame[(t, x["gid"])] = x
    team_tot = defaultdict(dict)   # (tid, gid) -> team totals from player logs
    for p, v in pl.items():
        for x in v:
            tt = team_tot[(x["tid"], x["gid"])]
            for k in ("pts", "ast", "fga", "fg3a", "fta"):
                tt[k] = tt.get(k, 0.0) + x[k]
    STAT = BT.STAT
    rnames = ["ro_starts3", "ro_start_change", "ro_lastmin_ratio", "ro_fga_share_trend", "ro_cv20", "ro_line_pct20", "ro_line_vs_max",
              "ro_venue_split", "ro_vs_opp", "ro_games7", "ro_load3", "ro_pts_share_trend", "ro_ast_share_trend", "ro_3pa_rate_trend",
              "ro_ft_rate"]
    rc = {}
    cols = defaultdict(list)
    opp_home = {}
    for t, v in tg.items():
        for x in v:
            opp_home[(t, x["d"])] = (x["opp"], x["home"])
    for s, d, pid, prop, line, tid in zip(df.season, df.d, df.pid, df.prop, df.line, df.team_id):
        key = (pid, d, prop, line)
        if key not in rc:
            out = dict.fromkeys(rnames)
            if pid == pid and pid in pl:
                v = pl[pid]
                i = bisect_left(pdates[pid], d)
                h = v[max(0, i - 20):i]
                if len(h) >= 5:
                    st = [starter.get((pid, x["gid"])) for x in h[-3:]]
                    if all(z is not None for z in st):
                        out["ro_starts3"] = str(sum(st))
                        prev = starter.get((pid, h[-2]["gid"])) if len(h) >= 2 else None
                        out["ro_start_change"] = "none" if prev is None or prev == st[-1] else ("to_start" if st[-1] else "to_bench")
                    m10 = np.mean([x["min"] for x in h[-10:]])
                    out["ro_lastmin_ratio"] = cut(h[-1]["min"] / max(m10, 1), (0.8, 1.2), ("low", "normal", "high"))

                    def share(xs, k):
                        num = sum(x[k] for x in xs)
                        den = sum(team_tot[(x["tid"], x["gid"])].get(k, 0.0) for x in xs)
                        return num / den if den > 0 else None
                    for nm_, k in (("ro_fga_share_trend", "fga"), ("ro_pts_share_trend", "pts"), ("ro_ast_share_trend", "ast")):
                        a3, a10 = share(h[-3:], k), share(h[-10:], k)
                        out[nm_] = cut(a3 / a10, (0.85, 1.15), ("down", "flat", "up")) if a3 is not None and a10 else None
                    val = np.array([sum(x[k] for k in STAT[prop]) for x in h])
                    mu = val.mean()
                    out["ro_cv20"] = cut(val.std() / mu if mu > 0 else None, (0.35, 0.6), ("low", "mid", "high"))
                    out["ro_line_pct20"] = cut(float(np.mean(val < line)), (0.3, 0.5, 0.7), ("<30", "30-50", "50-70", "70+"))
                    out["ro_line_vs_max"] = "near_max" if line >= 0.9 * val.max() else ("near_min" if line <= 1.1 * val.min() else "inside")
                    oh = opp_home.get((tid, d))
                    if oh:
                        opp, home = oh
                        same_venue = [sum(x[k] for k in STAT[prop]) for x in v[max(0, i - 40):i]
                                      if teamgame.get((x["tid"], x["gid"]), {}).get("home") == home]
                        if len(same_venue) >= 5:
                            out["ro_venue_split"] = cut((np.mean(same_venue) - line) / max(line, 0.5), (-0.1, 0.1), ("below", "near", "above"))
                        vs = [sum(x[k] for k in STAT[prop]) for x in v[max(0, i - 120):i]
                              if teamgame.get((x["tid"], x["gid"]), {}).get("opp") == opp]
                        out["ro_vs_opp"] = "none" if len(vs) < 2 else cut((np.mean(vs) - line) / max(line, 0.5), (-0.1, 0.1),
                                                                           ("below", "near", "above"))
                    out["ro_games7"] = str(sum(1 for x in h if 0 < (d - x["d"]).days <= 7))
                    out["ro_load3"] = cut(np.mean([x["min"] for x in h[-3:]]), (30, 36), ("<30", "30-36", "36+"))
                    if prop in ("threes_made", "points"):
                        r3 = sum(x["fg3a"] for x in h[-3:]) / max(sum(x["fga"] for x in h[-3:]), 1)
                        r10 = sum(x["fg3a"] for x in h[-10:]) / max(sum(x["fga"] for x in h[-10:]), 1)
                        out["ro_3pa_rate_trend"] = cut(r3 / r10 if r10 > 0 else None, (0.85, 1.15), ("down", "flat", "up"))
                        out["ro_ft_rate"] = cut(sum(x["fta"] for x in h) / max(sum(x["fga"] for x in h), 1), (0.2, 0.35), ("low", "mid", "high"))
            rc[key] = out
        for n_ in rnames:
            cols[n_].append(rc[key][n_])
    for k, v in cols.items():
        put(k, v)
    log("role / usage done")

    # ---------------- MATCHUP (cross stat) ----------------
    tdet = defaultdict(list)    # team -> [(d, own tov, own stl, own fga, own fgm, own 3pa, own fta, own ast)] from player logs
    agg = defaultdict(lambda: defaultdict(float))
    for p, v in pl.items():
        for x in v:
            a = agg[(x["tid"], x["gid"], x["d"])]
            for k in ("tov", "stl", "fga", "fg3a", "fta", "ast", "pts"):
                a[k] += x[k]
    fgm = {}
    for gid, tid, d, f_ in conn.execute("""SELECT game_id, team_id, game_date, sum(fgm) FROM nba_stats.player_game_log
                                          WHERE season IN ('2023-24', '2024-25', '2025-26') GROUP BY 1, 2, 3"""):
        fgm[(tid, gid)] = float(f_ or 0)
    ot = {}
    for gid, tid, d, mn in conn.execute("""SELECT game_id, team_id, game_date, sum(min) FROM nba_stats.player_game_log
                                           WHERE season IN ('2023-24', '2024-25', '2025-26') GROUP BY 1, 2, 3"""):
        ot[(tid, d)] = float(mn or 0) > 245
    for (tid, gid, d), a in agg.items():
        tdet[tid].append((d, a["tov"], a["stl"], a["fga"], a["fga"] - fgm.get((tid, gid), a["fga"]), a["fg3a"], a["fta"], a["ast"], a["pts"]))
    for t in tdet:
        tdet[t].sort()
    tdates = {t: [x[0] for x in v] for t, v in tdet.items()}
    # opponent ALLOWED = what the opponent's opponents did vs them; simpler and pre-tip: the opponent's own committed / attempted numbers
    # (turnovers committed, FGA, missed shots, 3PA allowed = their opponents' 3PA -> from the paired team rows)
    pair = {}
    for t, v in tg.items():
        for x in v:
            pair[(t, x["d"])] = x["opp"]

    def trailing(t, d, idx, k=25):
        v = tdet.get(t)
        if not v:
            return None
        i = bisect_left(tdates[t], d)
        h = v[max(0, i - k):i]
        return float(np.mean([x[idx] for x in h])) if len(h) >= 5 else None

    def allowed(t, d, idx, k=25):
        """what teams scored / attempted against t in its previous k games"""
        v = tg.get(t)
        if not v:
            return None
        ds = [x["d"] for x in v]
        i = bisect_left(ds, d)
        vals = []
        for x in v[max(0, i - k):i]:
            o = x["opp"]
            j = bisect_left(tdates.get(o, []), x["d"])
            if o in tdet and j < len(tdet[o]) and tdet[o][j][0] == x["d"]:
                vals.append(tdet[o][j][idx])
        return float(np.mean(vals)) if len(vals) >= 5 else None
    MAP = {"steals": ("own", 1), "stocks": ("own", 1), "blocks": ("own", 3), "turnovers": ("own", 2), "rebounds": ("own", 4),
           "threes_made": ("allow", 5), "points": ("allow", 6), "pra": ("allow", 6), "pts_reb": ("allow", 6), "pts_ast": ("allow", 6),
           "reb_ast": ("own", 4), "assists": ("allow", 7)}
    vals_by = defaultdict(list)
    xc = {}
    for s, d, tid, prop in zip(df.season, df.d, df.team_id, df.prop):
        key = (tid, d, prop)
        if key in xc:
            continue
        opp = pair.get((tid, d))
        kind, idx = MAP[prop]
        val = None if opp is None else (trailing(opp, d, idx) if kind == "own" else allowed(opp, d, idx))
        xc[key] = val
        if val is not None:
            vals_by[(s, prop)].append(val)
    qs = {k: np.percentile(v, [33.3, 66.7]) for k, v in vals_by.items() if len(v) >= 30}
    put("mx_cross_stat", [cut(xc[(t, d, p)], tuple(qs[(s, p)]), ("low", "mid", "high")) if (s, p) in qs else None
                          for s, d, t, p in zip(df.season, df.d, df.team_id, df.prop)])
    tc = {}
    cols = defaultdict(list)
    for s, d, tid in zip(df.season, df.d, df.team_id):
        key = (tid, d)
        if key not in tc:
            opp = pair.get(key)
            out = {"mx_opp_def_trend": None, "mx_opp_pace_trend": None, "mx_team_ot_last": None}
            if opp is not None:
                a5, a25 = allowed(opp, d, 8, 5), allowed(opp, d, 8, 25)
                if a5 and a25:
                    out["mx_opp_def_trend"] = cut(a5 - a25, (-4, 4), ("tighter", "par", "leakier"))
                v = tg.get(opp, [])
                ds = [x["d"] for x in v]
                i = bisect_left(ds, d)
                h = v[max(0, i - 25):i]
                if len(h) >= 10:
                    out["mx_opp_pace_trend"] = cut(np.mean([x["pace"] for x in h[-5:]]) - np.mean([x["pace"] for x in h]), (-2, 2),
                                                   ("slower", "par", "faster"))
            v = tg.get(tid, [])
            ds = [x["d"] for x in v]
            i = bisect_left(ds, d)
            if i > 0:
                out["mx_team_ot_last"] = "yes" if ot.get((tid, v[i - 1]["d"])) else "no"
            tc[key] = out
        for k in ("mx_opp_def_trend", "mx_opp_pace_trend", "mx_team_ot_last"):
            cols[k].append(tc[key][k])
    for k, v in cols.items():
        put(k, v)
    log("matchup done")

    # ---------------- BOARD SHAPE ----------------
    g = df.groupby(["d", "nm", "prop"])
    span = (g.line.transform("max") - g.line.transform("min")) / df.line.where(df.tier == "R").groupby([df.d, df.nm, df.prop]).transform("first")
    put("bs_span", [cut(x if x == x else None, (0.15, 0.4), ("narrow", "mid", "wide")) for x in span])
    ng = df.assign(_g=df.tier.str.startswith("G")).groupby(["d", "nm", "prop"])._g.transform("sum")
    nd = df.assign(_x=df.tier.str.startswith("D")).groupby(["d", "nm", "prop"])._x.transform("sum")
    put("bs_goblins", [cut(x, (0, 1, 2), ("0", "1", "2", "3+")) for x in ng])
    put("bs_demons", [cut(x, (0, 1, 2), ("0", "1", "2", "3+")) for x in nd])
    pts_l0 = df[(df.tier == "R") & (df.prop == "points")][["d", "team_id", "nm", "line"]].drop_duplicates(["d", "nm"])
    pts_l0["rk"] = pts_l0.groupby(["d", "team_id"]).line.rank(ascending=False, method="first")
    rk = dict(zip(zip(pts_l0.d, pts_l0.nm), pts_l0.rk))
    put("bs_star_rank", [cut(rk.get((d, n)), (1, 2, 3), ("1", "2", "3", "4+")) if (d, n) in rk else "no_points_line"
                         for d, n in zip(df.d, df.nm)])
    nprops = df.groupby(["d", "nm"]).prop.nunique()
    hist = defaultdict(list)
    usual = {}
    for (d, n), k in sorted(nprops.items(), key=lambda x: x[0][0]):
        h = hist[n][-10:]
        usual[(d, n)] = (k / np.median(h)) if len(h) >= 3 else None
        hist[n].append(k)
    put("bs_props_vs_usual", [cut(usual.get((d, n)), (0.8, 1.2), ("fewer", "usual", "more")) for d, n in zip(df.d, df.nm)])
    log("board shape done")

    # ---------------- PRE-REGISTERED INTERACTIONS (round 1 near misses) ----------------
    form = []
    for pid, d, prop, line in zip(df.pid, df.d, df.prop, df.line):
        if pid == pid and pid in pl:
            v = pl[pid]
            i = bisect_left(pdates[pid], d)
            h = v[max(0, i - 5):i]
            if len(h) >= 5:
                m = np.mean([sum(x[k] for k in STAT[prop]) for x in h])
                form.append(cut((m - line) / max(line, 0.5), (-0.1, 0.1), ("below", "near", "above")))
                continue
        form.append(None)
    allow_cache = {}
    al = []
    for s, d, tid, prop in zip(df.season, df.d, df.team_id, df.prop):
        k0 = BT.STAT[prop]
        if len(k0) != 1 or k0[0] not in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"):
            al.append(None)
            continue
        key = (tid, d, k0[0])
        if key not in allow_cache:
            opp = pair.get((tid, d))
            v = tg.get(opp, []) if opp else []
            ds = [x["d"] for x in v]
            i = bisect_left(ds, d)
            h = v[max(0, i - 25):i]
            allow_cache[key] = float(np.mean([x["allow"][k0[0]] for x in h])) if len(h) >= 5 else None
        al.append(allow_cache[key])
    al = np.array([np.nan if x is None else x for x in al], float)
    alab = [None] * len(df)
    for (s, p), idx in df.groupby(["season", "prop"]).groups.items():
        vv = al[idx]
        ok = ~np.isnan(vv)
        if ok.sum() >= 30:
            q1, q2 = np.percentile(vv[ok], [33.3, 66.7])
            for i in idx:
                if al[i] == al[i]:
                    alab[i] = "stingy" if al[i] <= q1 else ("mid" if al[i] <= q2 else "leaky")
    put("ix_form_x_allow", [f"{a}|{b}" if a and b else None for a, b in zip(form, alab)])
    gl = []
    for d, n, p, side in zip(df.d, df.nm, df.prop, df.side):
        L0 = std_line.get((d, n, p))
        m = market((d, n, p))
        if m is None or L0 is None:
            gl.append(None)
            continue
        bm = [v for b, v in m[0].items() if b != "underdog"]
        if not bm:
            gl.append(None)
            continue
        gsg = (float(np.median(bm)) - L0) * (1 if side == "Over" else -1)
        gl.append(cut(gsg, (-0.74, 0.74), ("against", "none", "for")))
    put("ix_gap_x_form", [f"{a}|{b}" if a and b else None for a, b in zip(gl, form)])
    log(f"round 2 factors: {len(feats)}")
    BT.analyze(df, feats)


if __name__ == "__main__":
    main()
