#!/usr/bin/env python3
"""
THE FULL STRATEGY UNIVERSE (owner 2026-11-22 23:11 PT: "run the full universe of strategies, rankings, trailings, composition, tops, factors, layers,
slip structures, for all apps, all legs, all prop lines, all regulars, goblins and demons tiers, player trailings, prop line trailings, all internal
rankings, scored final hp, baseline, ROI, pure hit rate ... all possible variations in all possible angles"). READ-ONLY (prints; nothing written).

Universe of one app = every graded board leg of nba_score._lr_legs_h (regular AND alternates, pushes out) with the pick-time feature set of
research_leg_model_h.load (LM_TRAIL=1: form, minutes, rest, venue, role, injury report, sportsbook chance / main line / books, other app's line, the
player / prop-line / slate trailing layers) + the walk-forward rankers of _lr_legs_hp + the certified leg card (final_hp, score, confidence, hit_rate,
hit_cal, leg ROI, roi_cal, roi_best, certified result, real and mechanism prices).
PRICES (real only, estimates labelled): PrizePicks regular = fixed tables; PrizePicks goblin / demon = the real quote where it exists, else the
mechanism price (m_mech, ESTIMATE), slips through the slip law (pp_slip_law.json; Power only - Flex with alternates is not mapped); Underdog = table x
product of modifiers (2024-26: 3 / 6 / 10 / 20 Standard, no flex; 2026-27: in-app tables incl. Flex); Sleeper = product x max bonus (Flex by the
engine's own tier rule); Fliff = product. Sleeper / Fliff 2024-26 prices are DERIVED (owner 2026-11-19: acceptable, shown separately).
STAGE A (vectorized, every cell): tier set x side x ranker x layer x games cap -> one slip a slate of the top k legs (one a player), k = 2..6, Power and
Flex. STAGE B (the shortlist chosen on 2024-26 ONLY): composition - start rank 1-3, slips a slate 1-3, every prop different - judged on 2026-27
(unseen) and in full, with drawdown / drought / without the 5 best / legs' hit. Luck yardstick: the same cells with two random rankers.
Env: DATABASE_URL, UA_APP (prizepicks | underdog | sleeper | fliff), UA_TIERS (comma list; default all of the app), UA_SHORT (150).
"""
import json
import math
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("UA_APP") or "underdog").lower()
os.environ["LM_APP"] = APP; os.environ["LM_TRAIL"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_leg_model_h as LM                             # noqa: E402

T0 = time.time()
SEAS = ("2024-25", "2025-26", "2026-27")
PP_P = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_F = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_P = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_F = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
UD_P_OLD = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0}
SINGLE = {"points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "fga", "fta", "ftm", "oreb", "fgm", "dreb", "personal_fouls"}
DEF = {"steals", "blocks", "turnovers", "stocks"}
KS = (2, 3, 4, 5, 6)
LAW = json.loads((Path(__file__).resolve().parent / "pp_slip_law.json").read_text())
KN = np.array(LAW["knots_lnY"]); LB = LAW["B"]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def snap(v):
    s = np.where(v < 3, 0.1, np.where(v < 10, 0.25, np.where(v < 50, 0.5, np.where(v < 200, 1.0, 5.0))))
    return np.round(np.round(v / s) * s, 4)


def law(n, Y, snapped=True):
    ly = np.log(np.asarray(Y, float))
    xb = np.column_stack([np.ones_like(ly), ly] + [np.maximum(ly - k, 0) ** 3 for k in KN])
    v = np.exp(xb @ np.array(LAW["coef"][str(n)]))
    ok = (ly >= math.log(LAW["yrange"][0])) & (ly <= math.log(LAW["yrange"][1]))
    v = np.where(ok, v, np.nan)
    if snapped:
        v = np.minimum(snap(v), LAW["cap"].get(str(n), 1e12))
    return v


YG = np.exp(np.linspace(math.log(LAW["yrange"][0]), math.log(min(LAW["yrange"][1], 5e4)), 20000)); P2G = law(2, YG, snapped=False)


def y_of_p2(p2):
    o = np.argsort(P2G)
    return np.interp(p2, P2G[o], YG[o], left=np.nan, right=np.nan)


def load(conn):
    df, X = LM.load(conn)
    df = df.reset_index(drop=True); X = X.reset_index(drop=True)
    keep = df["hit"].notna().values
    df = df[keep].reset_index(drop=True); X = X[keep].reset_index(drop=True)
    d = pd.DataFrame({"season": df["season"].values, "gd": df["gd"].values, "player_id": df["player_id"].astype(str).values, "prop": df["prop"].values,
                      "under": df["under"].values.astype(bool), "line": df["line"].values, "kind": df["kind"].astype(str).values, "src": df["src"].astype(str).values,
                      "m_lr": df["m"].values, "w": df["hit"].values.astype(int), "gid": df["game_id"].astype(str).fillna("g").values,
                      "role": df["role_tier"].astype(str).values})
    for c in ("ph", "pb", "books", "bline_d", "oline_d", "avs_d", "av5_d", "hot", "avs_z", "gp", "mn_trend", "rest", "home", "lean", "min_out", "opp_out",
              "own_status", "tr_pl10", "tr_plall10", "tr_slate7", "tr_slate21", "ph_ret", "pb_ret", "proj_min"):
        d[c] = X[c].values if c in X.columns else np.nan
    hp = pd.read_sql("""SELECT game_date::text gd, player_id::text player_id, prop, lower(side) side, line::float8 line, kind, p_blend::float8 blend, p_gbm::float8 gbm,
                               p_gbm_s::float8 gbm_s FROM nba_score._lr_legs_hp WHERE app = %s""", conn, params=(APP,))
    hp["under"] = ~hp["side"].str[0].isin(["o", "m", "h"])
    d = d.merge(hp.drop_duplicates(["gd", "player_id", "prop", "under", "line", "kind"])[["gd", "player_id", "prop", "under", "line", "kind", "blend", "gbm", "gbm_s"]],
                on=["gd", "player_id", "prop", "under", "line", "kind"], how="left")
    lc = pd.read_sql("""SELECT game_date::text gd, player_id, prop, lower(side) side, line::float8 line, kind lkind, result, final_hp::float8 fhp, score::float8 score,
                               confidence::float8 conf, hit_rate::float8 hr, hit_cal::float8 hcal, roi::float8 roi, roi_cal::float8 roi_cal, roi_best::float8 roi_best,
                               m::float8 m_lc, m_mech::float8 m_mech, leg_mult::float8 lm, p_market::float8 pmk
                        FROM nba_score.leg_card_v2 WHERE app = %s""", conn, params=(APP,))
    lc["under"] = ~lc["side"].str[0].isin(["o", "m", "h"])
    lc = lc.drop_duplicates(["gd", "player_id", "prop", "under", "line"])
    d = d.merge(lc.drop(columns=["side"]), on=["gd", "player_id", "prop", "under", "line"], how="left")
    # certified grading where the card has the leg
    cw = d["result"].map({"won": 1, "lost": 0})
    d["w"] = np.where(cw.notna(), cw, d["w"]).astype(int)
    # PRICE
    if APP == "prizepicks":
        reg = (d["kind"] == "standard").values
        val = np.where(reg, math.sqrt(3), np.where(d["m_lc"].notna(), d["m_lc"], d["m_mech"]))
        d["alt"] = ~reg; d["est"] = ~reg & d["m_lc"].isna()
        d["val"] = val
        d["logy"] = np.where(reg, 0.0, np.log(y_of_p2(math.sqrt(3) * val)))
        d = d[reg | np.isfinite(d["logy"].values)].copy()
        reg = (d["kind"] == "standard").values
        d["easy"] = np.where(reg, 0, np.where(d["val"] < math.sqrt(3), 1, 2))        # 1 goblin-like, 2 demon-like
        d["logf"] = 0.0
    elif APP == "underdog":
        lm = d["m_lr"].values / 1.8708
        d["logf"] = np.log(lm); d["val"] = np.where(d["gd"] >= "2026-07-01", math.sqrt(3.5), math.sqrt(3.0)) * lm
        d["alt"] = np.abs(lm - 1) > 1e-6; d["est"] = False
        d["easy"] = np.where(~d["alt"], 0, np.where(lm < 1, 1, 2)); d["logy"] = 0.0
    else:
        d["logf"] = np.log(d["m_lr"].values); d["val"] = d["m_lr"].values
        d["alt"] = d["kind"].str.lower().isin(["alt", "f", "b"]).values; d["est"] = d["src"] != "real"
        d["easy"] = np.where(~d["alt"], 0, np.where(d["m_lr"] < np.nanmedian(d["m_lr"]), 1, 2)); d["logy"] = 0.0
    d["ret_hr"] = d["hr"] * d["val"] - 1; d["ret_blend"] = d["blend"] * d["val"] - 1; d["ret_gbms"] = d["gbm_s"] * d["val"] - 1
    d["avg"] = (d["blend"] + d["ph"]) / 2; d["geo"] = np.sqrt(d["ph"] * d["pb"])
    d["e_blend"] = d["blend"] - d["pb"]; d["e_base"] = d["ph"] - d["pb"]; d["e_fhp"] = d["fhp"] - d["pb"]
    rng = np.random.default_rng(97)
    d["rnd0"] = rng.random(len(d)); d["rnd1"] = rng.random(len(d))
    d["neg_avsz"] = -d["avs_z"]
    d["single"] = d["prop"].isin(SINGLE)
    # the documented low-foul key (NBA_SLIP_BUILDING_STRATEGY 29r): the player's personal fouls over his last 20 games before the day
    pf = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, pf::float8 pf FROM nba_stats.player_game_log WHERE game_date >= '2024-09-01'", conn)
    pf = pf.sort_values(["player_id", "gd"]).drop_duplicates(["player_id", "gd"])
    pf["pf20"] = pf.groupby("player_id")["pf"].transform(lambda x: x.shift(1).rolling(20, min_periods=8).mean())
    d = d.merge(pf[["player_id", "gd", "pf20"]], on=["player_id", "gd"], how="left")
    return d.reset_index(drop=True)


RANKERS = ["fhp", "score", "conf", "ph", "blend", "gbm", "gbm_s", "pb", "hr", "hcal", "roi", "roi_cal", "roi_best", "ret_hr", "ret_blend", "ret_gbms",
           "ph_ret", "pb_ret", "avg", "geo", "e_blend", "e_base", "e_fhp", "tr_pl10", "tr_plall10", "tr_slate21", "lean", "bline_d", "neg_avsz", "rnd0", "rnd1"]
STARTER = ("IRON_MAN", "HIGH_USAGE_STARTER", "STARTER")
BENCH = ("ROTATION", "BENCH", "FRINGE")


def layers(d):
    L = {"none": np.ones(len(d), bool), "single": d["single"].values, "noast": ~d["prop"].str.contains("ast").values,
         "reb": (d["prop"] == "rebounds").values, "pts": (d["prop"] == "points").values, "ptsanch": d["prop"].isin(["points", "pts_reb", "pts_ast", "pra"]).values,
         "def": d["prop"].isin(DEF).values, "combo": d["prop"].isin(["pra", "pts_reb", "pts_ast", "reb_ast"]).values,
         "half": (np.abs(d["line"] % 1 - 0.5) < 1e-6).values, "line<6": (d["line"] < 6).values, "line<10": (d["line"] < 10).values, "line15+": (d["line"] >= 15).values,
         "hot": (d["hot"] >= .10).values, "cold": (d["hot"] <= -.10).values, "mn_up": (d["mn_trend"] >= 2).values, "mn_dn": (d["mn_trend"] <= -2).values,
         "b2b": (d["rest"] == 1).values, "rest3": (d["rest"] >= 3).values, "home": (d["home"] == 1).values, "away": (d["home"] == 0).values,
         "starter": d["role"].isin(STARTER).values, "bench": d["role"].isin(BENCH).values,
         "tmout24": (d["min_out"] >= 24).values, "tmout0": (d["min_out"] == 0).values, "oppout48": (d["opp_out"] >= 48).values,
         "line>book": (d["bline_d"] > 1e-9).values, "line=book": (np.abs(d["bline_d"]) <= 1e-9).values, "books2": (d["books"] >= 2).values,
         "gp<10": (d["gp"] < 10).values, "gp20": (d["gp"] >= 20).values, "listed": (d["own_status"] > 0).values,
         "trpl_hot": (d["tr_pl10"] >= .6).values, "trpl_cold": (d["tr_pl10"] <= .4).values, "trall_hot": (d["tr_plall10"] >= .6).values,
         "trall_cold": (d["tr_plall10"] <= .4).values, "slate_up": (d["tr_slate7"] > d["tr_slate21"]).values, "slate_dn": (d["tr_slate7"] < d["tr_slate21"]).values,
         "lowfoul": (d["pf20"] < 1.8).values, "midfoul": ((d["pf20"] >= 1.8) & (d["pf20"] < 2.5)).values, "highfoul": (d["pf20"] >= 2.5).values,
         "steals": (d["prop"] == "steals").values, "turnovers": (d["prop"] == "turnovers").values, "blocks": (d["prop"] == "blocks").values,
         "stocks": (d["prop"] == "stocks").values, "threes": (d["prop"] == "threes_made").values, "assists": (d["prop"] == "assists").values,
         "pra": (d["prop"] == "pra").values, "pts_reb": (d["prop"] == "pts_reb").values, "pts_ast": (d["prop"] == "pts_ast").values,
         "lowfoul+def": ((d["pf20"] < 1.8) & d["prop"].isin(DEF)).values, "lowfoul+single": ((d["pf20"] < 1.8) & d["single"]).values,
         "ret+": (d["ret_hr"] > 0).values, "blend>book": (d["e_blend"] > 0).values, "book>.5": (d["pb"] > .5).values, "realprice": ~d["est"].values}
    want = [x for x in (os.environ.get("UA_LAYERS") or "").split(",") if x]
    return {k: v for k, v in L.items() if not want or k in want}


def tiersets(d):
    e = d["easy"].values
    T = {"regular": e == 0, "reg+gob": e <= 1, "reg+dem": e != 1, "goblin": e == 1, "demon": e == 2, "all": np.ones(len(d), bool)}
    if APP in ("sleeper", "fliff"):
        T = {"regular": e == 0, "all": np.ones(len(d), bool), "alt": e > 0}
    want = [t for t in (os.environ.get("UA_TIERS") or "").split(",") if t]
    return {k: v for k, v in T.items() if not want or k in want}


def payouts(k, w, a, sly, slf, slfh, old, slp_bonus):
    """vectorized payout of top-k slips: w wins, a alternates, sly sum log y of alternates, slf sum log modifier / multiplier, slfh same over hits"""
    allh = w == k
    if APP == "prizepicks":
        pw = np.where(a == 0, PP_P[k], np.nan)
        if (a > 0).any():
            Y = np.exp(sly - (np.maximum(a, 1) - 1) * math.log(LB))
            pw = np.where(a > 0, law(k, Y), pw)
        pw = np.where(allh, pw, np.where(np.isnan(pw), np.nan, 0.0))
        fx = np.where(a == 0, np.array([PP_F.get((k, int(x)), 0.0) for x in (k - w)]), np.nan) if k >= 3 else np.full(len(w), np.nan)
        return pw, fx
    if APP == "underdog":
        base = np.where(old, UD_P_OLD.get(k, np.nan), UD_P[k])
        pw = np.where(allh, base * np.exp(slf), np.where(np.isnan(base), np.nan, 0.0))
        if k >= 3:
            fb = np.array([UD_F.get((k, int(x)), 0.0) for x in (k - w)])
            fx = np.where(old, np.nan, fb * np.exp(slfh))
        else:
            fx = np.full(len(w), np.nan)
        return pw, fx
    if APP == "fliff":
        return np.where(allh, np.floor(np.exp(slf) * 100 + 1e-6) / 100, 0.0), np.full(len(w), np.nan)
    pw = np.where(allh, np.exp(slf) * slp_bonus.get(k, 1.0), 0.0)
    return pw, np.full(len(w), np.nan)


def stage_a(d, slp_bonus):
    L = layers(d); T = tiersets(d)
    gdi = pd.factorize(d["gd"])[0]; pli = pd.factorize(d["player_id"])[0]; gmi = pd.factorize(d["gid"])[0]
    sidx = d["season"].map({s: i for i, s in enumerate(SEAS)}).values
    old = (d["gd"] < "2026-07-01").values
    rows = []
    for tn, tm in T.items():
        for side in ("Under", "Over", "both"):
            sm = tm & (d["under"].values if side == "Under" else (~d["under"].values if side == "Over" else True))
            for rk in RANKERS:
                v = d[rk].values.astype(float)
                base = sm & np.isfinite(v)
                if base.sum() < 500:
                    continue
                ix = np.where(base)[0]
                ix = ix[np.lexsort((-v[ix], gdi[ix]))]               # by slate, best first
                for ln, lmask in L.items():
                    jj = ix[lmask[ix]]
                    if len(jj) < 200:
                        continue
                    kp = ~pd.Series(gdi[jj] * 10_000_000 + pli[jj]).duplicated().values     # one leg a player
                    jj = jj[kp]
                    for gcap in (1, 2, 9):
                        if gcap < 9:
                            gk = pd.Series(gdi[jj] * 10_000_000 + gmi[jj])
                            jg = jj[(gk.groupby(gk.values).cumcount().values < gcap)]
                        else:
                            jg = jj
                        g = gdi[jg]
                        r = pd.Series(g).groupby(g).cumcount().values
                        top = r < 6
                        jg = jg[top]; r = r[top]; g = g[top]
                        # running sums within slate
                        def csum(x):
                            c = np.cumsum(x); st = np.r_[0, np.where(np.diff(g) != 0)[0] + 1]
                            off = np.repeat(np.r_[0, c[st[1:] - 1]] if len(st) > 1 else [0], np.diff(np.r_[st, len(g)]))
                            return c - off
                        wv = d["w"].values[jg]; av = d["alt"].values[jg].astype(int)
                        cw = csum(wv); ca = csum(av); cy = csum(np.where(av == 1, d["logy"].values[jg], 0.0)); cf = csum(d["logf"].values[jg])
                        cfh = csum(np.where(wv == 1, d["logf"].values[jg], 0.0))
                        for k in KS:
                            at = r == k - 1
                            if at.sum() < 40:
                                continue
                            sel = jg[at]
                            pw, fx = payouts(k, cw[at], ca[at], cy[at], cf[at], cfh[at], old[sel], slp_bonus)
                            for st, pv in (("power", pw), ("flex", fx)):
                                if st == "flex" and APP == "prizepicks" and tn != "regular":
                                    continue                         # Flex with alternates is not mapped - no partial cells
                                okp = np.isfinite(pv)
                                if okp.sum() < 40:
                                    continue
                                u = pv[okp] - 1; s = sidx[sel][okp]
                                rec = dict(tier=tn, side=side, rk=rk, layer=ln, gcap=gcap, st=st, k=k, n=int(okp.sum()), roi=float(u.mean()),
                                           est=float(d["est"].values[sel][okp].mean()))
                                for i, ss in enumerate(SEAS):
                                    m = s == i
                                    rec[f"n{ss[2:4]}"] = int(m.sum()); rec[f"r{ss[2:4]}"] = float(u[m].mean()) if m.any() else np.nan
                                rows.append(rec)
            log(f"stage A {tn} {side}: {len(rows):,} cells so far")
    return pd.DataFrame(rows)


def stage_b(d, A, slp, nshort):
    if APP == "sleeper":
        global SL
        import sleeper_live_slip_engine as SL
    """composition on the shortlist chosen on 2024-26 only"""
    sel = A[(~A.rk.str.startswith("rnd")) & (A.n24 >= 30) & (A.n25 >= 30) & (A.r24 > 0) & (A.r25 > 0)].copy()
    sel["sc"] = np.minimum(sel.r24, sel.r25)
    sel = sel.sort_values("sc", ascending=False)
    sel = sel.groupby(["st", "k"], group_keys=False).head(max(5, nshort // 9))       # the best of EVERY structure, not only the long shots
    sel = sel.drop_duplicates(["tier", "side", "rk", "layer", "gcap"])
    L = layers(d); T = tiersets(d)
    out = []
    groups = {gd: x.index.values for gd, x in d.groupby("gd")}
    old_of = {gd: gd < "2026-07-01" for gd in groups}
    for c in sel.itertuples():
        m = T[c.tier] & L[c.layer] & np.isfinite(d[c.rk].values.astype(float))
        if c.side != "both":
            m &= d["under"].values if c.side == "Under" else ~d["under"].values
        sub = d[m]
        res = defaultdict(list)
        for gd, x in sub.groupby("gd"):
            x = x.sort_values(c.rk, ascending=False).drop_duplicates("player_id")
            pid = x.player_id.values; gid = x.gid.values; prp = x.prop.values; wv = x.w.values; av = x.alt.values; ly = x.logy.values; lf = x.logf.values
            vv = x.val.values
            for pdif in (0, 1):
                lst = []; ug = defaultdict(int); upr = set()
                for i in range(len(x)):
                    if ug[gid[i]] >= c.gcap or (pdif and prp[i] in upr):
                        continue
                    lst.append(i); ug[gid[i]] += 1; upr.add(prp[i])
                    if len(lst) >= 20:
                        break
                for start in (1, 2):
                    for nsl in (1, 2):
                        for k in KS:
                            for j in range(nsl):
                                legs = lst[start - 1 + j * k: start - 1 + (j + 1) * k]
                                if len(legs) < k:
                                    break
                                legs = np.array(legs); w = int(wv[legs].sum()); a = int(av[legs].sum())
                                pw, fx = payouts(k, np.array([w]), np.array([a]), np.array([ly[legs][av[legs]].sum()]), np.array([lf[legs].sum()]),
                                                 np.array([lf[legs][wv[legs] == 1].sum()]), np.array([old_of[gd]]), slp[0] if slp else {})
                                if APP == "sleeper" and k >= 3:
                                    tiers = SL.flex_tiers(list(np.exp(lf[legs])), slp[1], slp[2]); fx = np.array([float(tiers.get(w, 0.0))])
                                for st, pv in (("power", pw[0]), ("flex", fx[0])):
                                    if st == "flex" and APP == "prizepicks" and c.tier != "regular":
                                        continue
                                    if np.isfinite(pv):
                                        res[(pdif, start, nsl, st, k)].append((x.season.iloc[0], gd, pv - 1, w, k))
        for key, v in res.items():
            if len(v) < 40:
                continue
            v.sort(key=lambda t: t[1])
            s = np.array([t[0] for t in v]); u = np.array([t[2] for t in v])
            days = pd.Series(u).groupby([t[1] for t in v]).sum().values
            cum = np.cumsum(days); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
            run = best = 0
            for z in days:
                run = run + 1 if z < 0 else 0; best = max(best, run)
            top = np.sort(u)[::-1]
            rec = dict(tier=c.tier, side=c.side, rk=c.rk, layer=c.layer, gcap=c.gcap, pdif=key[0], start=key[1], nsl=key[2], st=key[3], k=key[4],
                       n=len(u), slates=len(days), roi=u.mean(), units=u.sum(), wo5=(u.sum() - top[:5].sum()) / len(u), dd=dd, drought=best,
                       hit=sum(t[3] for t in v) / sum(t[4] for t in v))
            for ss in SEAS:
                mm = s == ss; rec[f"n{ss[2:4]}"] = int(mm.sum()); rec[f"r{ss[2:4]}"] = float(u[mm].mean()) if mm.any() else np.nan
            out.append(rec)
    return pd.DataFrame(out)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    slp = None
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
        slp = SL.pricing(conn)
    d = load(conn)
    log(f"UA|{APP}: legs {len(d):,} | slates {d.gd.nunique()} | by season {d.groupby('season').size().to_dict()} | tiers {d.groupby('easy').size().to_dict()} "
        f"| estimated prices {100*d.est.mean():.1f}% | ranker coverage " + " ".join(f"{r} {100*d[r].notna().mean():.0f}%" for r in RANKERS[:-2]))
    A = stage_a(d, slp[0] if slp else {})
    A["rand"] = A.rk.str.startswith("rnd")
    log(f"UA|stage A cells {len(A):,} (random {A.rand.sum():,})")
    for lab, m in (("real", ~A.rand), ("random", A.rand)):
        X = A[m & (A.n24 >= 30) & (A.n25 >= 30) & (A.n26 >= 10)]
        pk = X[(X.r24 > 0) & (X.r25 > 0)]
        allp = X[(X.r24 > 0) & (X.r25 > 0) & (X.r26 > 0)]
        print(f"UA|LUCK {lab}: eligible {len(X):,} | positive 2024-25 AND 2025-26 {len(pk):,} ({100*len(pk)/max(len(X),1):.2f}%) -> their 2026-27 mean "
              f"{100*pk.r26.mean():+.1f}%, positive {100*(pk.r26 > 0).mean():.0f}% | positive all three {100*len(allp)/max(len(X),1):.2f}%", flush=True)
    for col in ("tier", "side", "rk", "layer", "gcap", "k", "st"):
        X = A[~A.rand & (A.n24 >= 30) & (A.n25 >= 30)]
        g = X.groupby(col).apply(lambda z: pd.Series(dict(c=len(z), p=((z.r24 > 0) & (z.r25 > 0)).mean(), r26=z[(z.r24 > 0) & (z.r25 > 0)].r26.mean(), roi=z.roi.mean())))
        print(f"UA|by {col}: " + " | ".join(f"{i} {int(r.c)} cells, both+ {100*r.p:.1f}%, ->26-27 {100*r.r26:+.1f}%, mean {100*r.roi:+.1f}%" for i, r in g.iterrows()), flush=True)
    B = stage_b(d, A, slp, int(os.environ.get("UA_SHORT") or 120))
    log(f"UA|stage B strategies {len(B):,}")
    if len(B):
        ok = B[(B.r24 > 0) & (B.r25 > 0) & (B.n26 >= 10)]
        print(f"UA|STAGE B: chosen on 2024-26 (both positive) {len(ok):,} of {len(B):,} -> 2026-27 mean {100*ok.r26.mean():+.1f}%, positive {100*(ok.r26 > 0).mean():.0f}%", flush=True)
        good = B[(B.r24 > 0) & (B.r25 > 0) & (B.r26 > 0) & (B.wo5 > 0)].sort_values("roi", ascending=False)
        print(f"UA|STAGE B positive every season and without the 5 best: {len(good):,}", flush=True)
        for r in good.drop_duplicates(["rk", "layer", "side", "tier", "st", "k"]).head(60).itertuples():
            print(f"UA|  {r.tier} {r.side} {r.rk} [{r.layer}] g{r.gcap}{' pd' if r.pdif else ''} from#{r.start} x{r.nsl} {r.st} {r.k}: {r.n} slips ({r.n/r.slates:.1f}/slate) "
                  f"ROI {100*r.roi:+.1f}% {r.units:+.1f} u | {100*r.r24:+.0f}/{100*r.r25:+.0f}/{100*r.r26:+.0f}% ({r.n24}/{r.n25}/{r.n26}) | w/o 5 best {100*r.wo5:+.1f}% "
                  f"| dd {r.dd:.1f} u drought {r.drought} | legs {100*r.hit:.1f}%", flush=True)
    
    # research scratch tables (nothing reads them; beside the other _lr_ / research tables) - so every cell can be queried afterwards
    tag = f"{APP}|{os.environ.get('UA_TIERS') or 'all-tiers'}|{os.environ.get('UA_LAYERS') or 'all-layers'}"
    import io
    wc = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    for name, df_ in (("ua_cells", A), ("ua_strats", B)):
        if not len(df_):
            continue
        df_ = df_.copy(); df_.insert(0, "app", APP); df_.insert(1, "tag", tag)
        cols = [c for c in df_.columns]
        typ = {c: ("boolean" if pd.api.types.is_bool_dtype(df_[c]) else ("float8" if pd.api.types.is_numeric_dtype(df_[c]) else "text")) for c in cols}
        for _try in range(5):                                  # 17 jobs may finish together: a concurrent CREATE can collide
            try:
                wc.execute(f"CREATE TABLE IF NOT EXISTS nba_score.{name} (" + ", ".join(f'"{c}" {typ[c]}' for c in cols) + ")"); break
            except Exception:
                time.sleep(3 + 5 * _try)
        have = {r[0] for r in wc.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = 'nba_score' AND table_name = %s", (name,)).fetchall()}
        for c in cols:
            if c not in have:
                wc.execute(f'ALTER TABLE nba_score.{name} ADD COLUMN IF NOT EXISTS "{c}" {typ[c]}')
        wc.execute(f"DELETE FROM nba_score.{name} WHERE tag = %s", (tag,))
        buf = io.StringIO(); df_.to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
        with wc.cursor().copy(f"COPY nba_score.{name} (" + ", ".join(f'"{c}"' for c in cols) + ") FROM STDIN WITH (FORMAT csv)") as cp:
            cp.write(buf.read())
        print(f"UA|written {len(df_):,} rows to nba_score.{name} (tag {tag})", flush=True)
    print("UA|DONE", flush=True)


if __name__ == "__main__":
    main()
