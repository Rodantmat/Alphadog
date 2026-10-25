#!/usr/bin/env python3
"""
RESEARCH - THE FINAL STRATEGY REVIEW: EVERY STRATEGY FAMILY, COMPOSITION, FACTOR AND SLIP STRUCTURE, HONESTLY SCORED (2026-10-25;
owner 00:48 PT: "review everything and all the strategies ... show me the best final strategies, preference for 2/3/4 picks, anything
over 4 or more picks preference for flex. Do all the strategies, compositions, factors and slip structure again and present me the
final numbers"). READ-ONLY.

THE SET (all on the calibrated board, final_hp = the board hit probability, COMPASS 180; graded on PrizePicks' payouts by
build_slip_engine.grade; one slip a strategy a slate):
  battery 1   research_board_profiles_l2.strategy_grid  (line types x More / Less x 8 prop sets x ranks final_hp / EV / trailing /
              blended x final_hp floors x game caps x skip-top)                                                     ~96,800
  battery 2   research_board_profiles_l2.strategy_grid2 (single goblin / demon levels x sides x prop sets x ranks x line position x
              prop-group cap x game cap)                                                                            ~36,300
  documented  research_board_profiles_l3.stage_b_grid (single cell / weighted cell + core / calibrated floors 0.60-0.70 / core + 1
              goblin or demon / rank windows / player trail) - holds the LIVE portfolio (P_cal_r70_3power = calib R final_hp>=0.70
              both 3P; P_wrebounds_4flex = weighted rebounds R Over 4F)                                             ~10,000
  factors     standard lines, final_hp floor 0.55 .. 0.75 x side x each documented enhancement factor band (research_board_matrix
              FACTOR_BANDS: trailing hot / cold, consistency, plain hit rate, minutes / usage trend, rest, phase, line band, market
              edge, books, line-type trailing) or none, <= 2 legs a game, ranked by final_hp                        ~5,600
READS, per structure (2P, 3P, 3F, 4P, 4F, 5P, 5F, 6P, 6F):
  A  CROSS-SEASON HOLDOUT both ways: the top 10 by 2024-25 lower bound (mean - sd / sqrt(n)) -> their 2025-26 ROI; and reverse.
     The gap between the two is the selection haircut (how much of an in-sample top is luck).
  B  WALK-FORWARD: each slate plays the strategy (and the top 5) with the best lower bound on ALL EARLIER slates - the honest number
     for "pick the best strategy" as a process.
  C  ROBUST CANDIDATES: strategies with >= 40 slates and a positive lower bound in EACH season, ranked by the weaker season's ROI;
     with both seasons' ROI, slates, hit rate of the slip, and max drawdown (units, one slip a slate).
  D  THE LIVE PORTFOLIO on the same footing.
Env: DATABASE_URL, FS_MINN (default 40 slates a season), FS_TOP (default 10).
"""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import research_board_profiles_l1 as L1              # noqa: E402
import research_board_profiles_l2 as L2              # noqa: E402
import research_board_profiles_l3 as L3              # noqa: E402
import research_board_matrix as MX                   # noqa: E402

T0 = time.time()
HIST = L1.REAL_HIST
MINN = int(os.environ.get("FS_MINN", "40"))
TOPN = int(os.environ.get("FS_TOP", "10"))
STRUCTS = L2.STRUCTS
FLOORS = (0.55, 0.58, 0.60, 0.62, 0.65, 0.68, 0.70, 0.72, 0.75)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def tag(size, st):
    return f"{size}{'F' if st == 'flex' else 'P'}"


def factor_grid(days, horder):
    """standard lines, final_hp floor x side x factor band (or none), <= 2 legs a game, best final_hp first"""
    bands = [("none", lambda l: True)] + list(MX.FACTOR_BANDS)
    base = [(th, sd, bn) for th in FLOORS for sd in ("Over", "Under", "both") for bn, _ in bands]
    fn = dict(bands)
    strat = [(("factor",) + b, size, st) for b in base for (size, st) in STRUCTS]
    P = np.full((len(strat), len(horder)), np.nan, np.float32)
    nst = len(STRUCTS)
    for di, key in enumerate(horder):
        legs = [l for l in days[key] if l["tier"] == "R" and l["p"] is not None and l["hit"] is not None and l["team_id"] is not None]
        legs.sort(key=lambda x: -float(x["p"]))
        # the line-type trailing flag is set per slate inside research_board_matrix.selector_matrix; recompute it here
        tts = defaultdict(list)
        for l in days[key]:
            if l.get("f_tier_trail") == l.get("f_tier_trail") and l.get("f_tier_trail") is not None:
                tts[l["tier"]].append(l["f_tier_trail"])
        med = {t: float(np.median(v)) for t, v in tts.items()}
        for l in legs:
            ft = l.get("f_tier_trail")
            l["_tt_hi"] = (ft >= med[l["tier"]]) if ft is not None and ft == ft and l["tier"] in med else None
        for bi, (th, sd, bn) in enumerate(base):
            f = fn[bn]
            pick, players, games = [], set(), defaultdict(int)
            for l in legs:
                if float(l["p"]) < th:
                    break
                if (sd != "both" and l["side"] != sd) or l["player"] in players or games[l["event_id"]] >= 2:
                    continue
                try:
                    if not f(l):
                        continue
                except (KeyError, TypeError):
                    continue
                pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
                if len(pick) >= 6:
                    break
            for j, (size, st) in enumerate(STRUCTS):
                if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
                    sl = [{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]} for l in pick[:size]]
                    P[bi * nst + j, di] = SE.grade(sl, st)[1] - 1.0
        if di % 50 == 0:
            log(f"factor grid: slate {di + 1} / {len(horder)}")
    return strat, P


def fname(s):
    b, size, st = s
    return f"factor: R final_hp>={b[1]:.2f} {b[2]} [{b[3]}] {tag(size, st)}"


def lb_stats(X):
    """per row: n, mean, sd, lower bound mean - sd / sqrt(n)"""
    V = ~np.isnan(X)
    n = V.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        mu = np.nansum(X, axis=1) / n
        sd = np.sqrt(np.maximum(np.nansum(X ** 2, axis=1) / n - mu ** 2, 0))
        lb = mu - sd / np.sqrt(np.maximum(n, 1))
    return n, mu, sd, lb


def max_dd(x):
    x = x[~np.isnan(x)]
    if not len(x):
        return np.nan
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0.0


def walk_forward(X, k):
    """each slate: the k strategies with the best lower bound on all earlier slates (>= 20 played) -> realized mean ROI"""
    S, D = X.shape
    V = (~np.isnan(X)).astype(np.float64); Z = np.nan_to_num(X).astype(np.float64)
    n = np.zeros(S); s = np.zeros(S); s2 = np.zeros(S)
    out = []
    for t in range(D):
        if t >= 30:
            with np.errstate(invalid="ignore", divide="ignore"):
                mu = s / n
                lb = np.where(n >= 20, mu - np.sqrt(np.maximum(s2 / n - mu ** 2, 0)) / np.sqrt(np.maximum(n, 1)), -np.inf)
            top = np.argpartition(-lb, k)[:k]
            v = V[top, t]
            if v.sum():
                out.append(float((Z[top, t] * v).sum() / v.sum()))
        n += V[:, t]; s += Z[:, t]; s2 += Z[:, t] ** 2
    return np.array(out)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    hseas = np.array([k[0] for k in horder])
    log("slates: " + ", ".join(f"{s} {int((hseas == s).sum())}" for s in HIST))
    L3.attach_ranks(conn, days)
    MX.leg_features(conn, days, horder)
    fams = []
    L2.GRID = 1
    s1, P1 = L2.strategy_grid(days, horder)
    fams.append(("battery 1", s1, P1, [L2.name(x) for x in s1]))
    log(f"battery 1: {len(s1):,}")
    L2.GRID = 2
    s2, P2 = L2.strategy_grid2(days, horder)
    fams.append(("battery 2", s2, P2, [L2.name(x) for x in s2]))
    log(f"battery 2: {len(s2):,}")
    s3, P3 = L3.stage_b_grid(days, horder)
    fams.append(("documented", s3, P3, [L3.name3(x) for x in s3]))
    log(f"documented: {len(s3):,}")
    s4, P4 = factor_grid(days, horder)
    fams.append(("factors", s4, P4, [fname(x) for x in s4]))
    log(f"factors: {len(s4):,}")
    strat = [x for f in fams for x in f[1]]
    names = [x for f in fams for x in f[3]]
    fam_of = [f[0] for f in fams for _ in f[1]]
    P = np.vstack([f[2] for f in fams])
    del fams, P1, P2, P3, P4
    log(f"ALL: {len(strat):,} strategies x {P.shape[1]} slates")
    s_a, s_b = (hseas == HIST[0]), (hseas == HIST[1])
    live = {"P_cal_r70_3power (live)": "calib R final_hp>=0.70 both 3P", "P_wrebounds_4flex (live)": "weighted:rebounds R Over by final_hp 4F"}
    summary = []
    for size, st in STRUCTS:
        lab = tag(size, st)
        rows = np.array([i for i, s_ in enumerate(strat) if s_[1:] == (size, st)])
        X = P[rows]
        na, mua, sda, lba = lb_stats(X[:, s_a]); nb, mub, sdb, lbb = lb_stats(X[:, s_b]); nt, mut, sdt, lbt = lb_stats(X)
        print("\n" + "=" * 190 + f"\n{lab} - {len(rows):,} strategies")
        # ---- A: cross-season holdout both ways ----
        for (tr, te, nm_tr, nm_te, ntr, lbtr, mutr, nte, mute) in ((s_a, s_b, HIST[0], HIST[1], na, lba, mua, nb, mub),
                                                                   (s_b, s_a, HIST[1], HIST[0], nb, lbb, mub, na, mua)):
            ok = (ntr >= MINN) & (nte >= 10)
            top = np.argsort(-np.where(ok, lbtr, -np.inf))[:TOPN]
            top = [i for i in top if ok[i]]
            if top:
                print(f"  A  top {len(top)} chosen on {nm_tr} -> {nm_te}: chosen-season ROI {100 * np.mean(mutr[top]):+.0f}% -> other season "
                      f"{100 * np.nanmean(mute[top]):+.0f}% ({sum(mute[top] > 0)} of {len(top)} positive)")
                for i in top[:3]:
                    print(f"       {names[rows[i]]}: {100 * mutr[i]:+.0f}% ({int(ntr[i])}d) -> {100 * mute[i]:+.0f}% ({int(nte[i])}d)")
        # ---- B: walk-forward process ----
        w1 = walk_forward(X, 1); w5 = walk_forward(X, 5)
        print(f"  B  WALK-FORWARD (best on all earlier slates, played next): top-1 {100 * w1.mean():+.0f}% on {len(w1)} slates | top-5 "
              f"{100 * w5.mean():+.0f}%")
        # ---- C: robust candidates ----
        ok = (na >= MINN) & (nb >= MINN) & (lba > 0) & (lbb > 0)
        idx = np.where(ok)[0]
        weak = np.minimum(mua, mub)
        idx = idx[np.argsort(-weak[idx])][:TOPN]
        print(f"  C  ROBUST: {int(ok.sum())} strategies with a positive lower bound in BOTH seasons (>= {MINN} slates each); best {len(idx)} by the "
              f"weaker season:")
        for i in idx:
            x = X[i]
            hitr = np.mean(x[~np.isnan(x)] > 0)
            print(f"       {names[rows[i]]:<70} [{fam_of[rows[i]]}] {HIST[0]} {100 * mua[i]:+.0f}% ({int(na[i])}d) | {HIST[1]} {100 * mub[i]:+.0f}% "
                  f"({int(nb[i])}d) | both {100 * mut[i]:+.0f}% lb {100 * lbt[i]:+.0f}% | slips won {100 * hitr:.0f}% | max drawdown "
                  f"{max_dd(x):.1f}u")
        # ---- D: the live portfolio ----
        for lv, nm in live.items():
            if nm in names:
                i = names.index(nm)
                if strat[i][1:] == (size, st):
                    j = np.where(rows == i)[0][0]
                    print(f"  D  {lv}: {HIST[0]} {100 * mua[j]:+.0f}% ({int(na[j])}d) | {HIST[1]} {100 * mub[j]:+.0f}% ({int(nb[j])}d) | both "
                          f"{100 * mut[j]:+.0f}% lb {100 * lbt[j]:+.0f}% | max drawdown {max_dd(X[j]):.1f}u")
        summary.append((lab, int(ok.sum()), (names[rows[idx[0]]], mua[idx[0]], mub[idx[0]]) if len(idx) else None, w1.mean(), w5.mean()))
    print("\n" + "=" * 190 + "\nSUMMARY per structure: robust strategies (lb > 0 both seasons) | best robust (weaker season first) | walk-forward top-1 / top-5")
    for lab, nrob, best, a1, a5 in summary:
        b = f"{best[0]} {100 * best[1]:+.0f}% / {100 * best[2]:+.0f}%" if best else "none"
        print(f"  {lab}: {nrob} robust | {b} | WF {100 * a1:+.0f}% / {100 * a5:+.0f}%")
    log("done")


if __name__ == "__main__":
    main()
