#!/usr/bin/env python3
"""
PP GOBLIN / DEMON MECHANICS - ONE HIDDEN CENTRE PER LADDER, MEASURED FROM EVERY SIZE. READ-ONLY. (owner 2026-11-22 01:03 PT: "many more sweeps,
use all legs ... finally figure out the mechanics of it")

MEASUREMENT. Section LAD quotes each rung alone beside the same regular legs at 2..6 picks. Every k-pick payout is PrizePicks' value rounded to its
grid, P_k = snap(B'_k x f), so each size bounds the rung's true factor f inside [(P_k - step/2) / B'_k, (P_k + step/2) / B'_k]. Intersecting the
sizes gives a far tighter reading of f than any single quote (the 2-pick grid alone is 0.1-0.25 wide). B'_k is re-fitted here (the k that makes
the most rungs' intervals consistent).

MECHANISM TESTED. The stat X of one player-stat follows a family with centre m (one hidden number per ladder per run) and a spread set by the stat
and the centre; a rung's chance is q = P(X > line) (More) / P(X < line) (Less); its factor is ln f = link(logit q) - one link per kind x side, or
one shared link per side ("PrizePicks prices the chance, not the tier"). Families: NB (dispersion per stat) and Normal (sd = a_stat x m^b).
Honest test: each rung is predicted with m fitted on the OTHER rungs of its own ladder (leave-one-rung-out), and the global parameters (spreads,
links) fitted on other players (5 folds by player). EXACT = the predicted payout equals PrizePicks' real payout at that size.
Also the OBSERVABLE version (no hidden m: m = the regular line / switch point x a per-stat constant) - the formula usable on any board.

Env: DATABASE_URL, PPH_SINCE (2026-11-19), PPH_FAM (nb,normal), PPH_MINRUNG (2).
"""
import json
import os
import re
import sys
from collections import defaultdict

import numpy as np
import psycopg
from scipy.stats import nbinom, norm

GRID_B = {2: 3.0, 3: 5.36, 4: 10.17, 5: 18.94, 6: 36.4}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def snap(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def lg(p):
    p = np.clip(p, 1e-5, 1 - 1e-5)
    return np.log(p / (1 - p))


def load(conn, since):
    rows = conn.execute("""SELECT run_file, n, power, note, legs FROM nba_market.pp_quote
                           WHERE status = 200 AND section = 'LAD' AND quoted_at >= %s""", (since,)).fetchall()
    rung = {}
    for rf, n, pw, note, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            P = float(pw[str(n)][str(n)])
        except Exception:
            continue
        parts = (note or "").split("|")
        if len(parts) < 5 or not legs:
            continue
        tier, dist, l0, expl = parts[0], float(parts[1]), float(parts[2]), parts[3]
        a = legs[0]
        if a.get("odds") == "standard":
            continue
        stat = a.get("stat"); side = "u" if a.get("side") == "under" else "o"
        kind = "g" if a.get("odds") == "goblin" else "d"
        key = (rf, str(a.get("name")), stat)
        r = rung.setdefault((key, a["id"], side), dict(lad=key, rf=rf, player=str(a.get("name")), stat=stat, line=float(a["line"]), kind=kind,
                                                       side=side, ks=kind + side, tier=tier, l0=l0, expl=expl, P={}))
        r["P"][n] = P
    return list(rung.values())


def fit_B(rungs):
    """B'_k (k=3..6) that make the most rungs' size intervals mutually consistent (2-pick fixed at 3)."""
    B = dict(GRID_B)
    for k in (6, 5, 4, 3):
        best = None
        for b in np.arange(GRID_B[k] * 0.96, GRID_B[k] * 1.04, GRID_B[k] * 0.0005):
            ok = n = 0
            for r in rungs:
                if 2 in r["P"] and k in r["P"] and r["P"][k] < 90:
                    p2, pk = r["P"][2], r["P"][k]
                    lo = max((p2 - step(p2) / 2) / 3.0, (pk - step(pk) / 2) / b); hi = min((p2 + step(p2) / 2) / 3.0, (pk + step(pk) / 2) / b)
                    ok += lo <= hi; n += 1
            if n and (best is None or ok > best[0]):
                best = (ok, b, n)
        if best:
            B[k] = float(best[1])
            print(f"PPH|B'_{k} = {best[1]:.3f} ({GRID_B[k]} before) | rungs whose 2-pick and {k}-pick readings agree {100*best[0]/best[2]:.1f}% of {best[2]:,}", flush=True)
    return B


def interval(r, B):
    lo, hi = -np.inf, np.inf
    for k, P in r["P"].items():
        if P >= 90:            # the cap - no information on the top side
            lo = max(lo, (P - step(P) / 2) / B[k]); continue
        lo = max(lo, (P - step(P) / 2) / B[k]); hi = min(hi, (P + step(P) / 2) / B[k])
    return lo, hi


def chance(fam, m, spread, line, over):
    """P(X > line) (over) or P(X < line) for half-point lines; whole-number lines: strict (a push is not a win)."""
    if fam == "nb":
        r_ = spread; p = r_ / (r_ + m)
        if over:
            return 1 - nbinom.cdf(np.floor(line), r_, p)
        return nbinom.cdf(np.ceil(line) - 1, r_, p)
    a, b = spread
    sd = a * np.maximum(m, 0.3) ** b
    z = (line - m) / sd
    return 1 - norm.cdf(z) if over else norm.cdf(z)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPH_SINCE", "2026-11-19")
    fams = (os.environ.get("PPH_FAM") or "nb,normal").split(",")
    minr = int(os.environ.get("PPH_MINRUNG") or 2)
    rungs = load(conn, since)
    print(f"PPH|rungs quoted at 2..6 picks since {since}: {len(rungs):,} | ladders {len({r['lad'] for r in rungs}):,} | runs {len({r['rf'] for r in rungs})}", flush=True)
    B = fit_B(rungs)
    good = []
    w = []
    for r in rungs:
        lo, hi = interval(r, B)
        if lo <= hi and np.isfinite(lo):
            r["flo"], r["fhi"] = lo, hi
            r["fm"] = np.sqrt(lo * hi) if np.isfinite(hi) else lo
            good.append(r); w.append((hi / lo - 1) if np.isfinite(hi) else np.nan)
    w = np.array(w)
    print(f"PPH|rungs with a consistent reading {len(good):,} of {len(rungs):,} | reading width median {100*np.nanmedian(w):.2f}% (p90 {100*np.nanpercentile(w,90):.2f}%)", flush=True)
    for ks in ("go", "do", "gu", "du"):
        s = [r for r in good if r["ks"] == ks]
        print(f"PPH|  {ks}: {len(s):,} rungs | factor median {np.median([r['fm'] for r in s]) if s else 0:.3f}", flush=True)
    lads = defaultdict(list)
    for r in good:
        lads[r["lad"]].append(r)
    lads = {k: v for k, v in lads.items() if len(v) >= minr}
    stats = sorted({k[2] for k in lads})
    players = sorted({k[1] for k in lads})
    fold = {p: i % 5 for i, p in enumerate(np.random.RandomState(7).permutation(players))}
    print(f"PPH|ladders with >= {minr} read rungs: {len(lads):,} | stats {len(stats)}", flush=True)

    # RANK-ORDER CHECK (model-free): inside one ladder and one side, a farther rung never pays less? violations mean the price is NOT one
    # monotone function of the line alone.
    viol = tot = 0
    for v in lads.values():
        for sd in ("o", "u"):
            s = sorted([r for r in v if r["side"] == sd], key=lambda r: r["line"])
            for a_, b_ in zip(s, s[1:]):
                tot += 1
                if sd == "o" and b_["fhi"] < a_["flo"]:
                    viol += 1
                if sd == "u" and a_["fhi"] < b_["flo"]:
                    viol += 1
    print(f"PPH|monotone check (farther rung pays at least as much, same ladder, same side): {tot - viol:,} of {tot:,} pairs hold ({100*(tot-viol)/max(tot,1):.2f}%)", flush=True)

    for fam in fams:
        run_family(fam, lads, stats, fold, B)


def run_family(fam, lads, stats, fold, B):
    MU = np.exp(np.linspace(np.log(0.3), np.log(90), 260))
    sp_grid = (np.exp(np.linspace(np.log(0.6), np.log(200), 26)) if fam == "nb"
               else [(a, b) for b in (0.5, 0.65, 0.8, 1.0) for a in np.exp(np.linspace(np.log(0.25), np.log(3.5), 18))])
    LK = ("go", "do", "gu", "du")

    def qmat(v, spread, mus=None):
        mus = MU if mus is None else mus
        lines = np.array([r["line"] for r in v]); over = np.array([r["side"] == "o" for r in v])
        Q = np.empty((len(mus), len(v)))
        for j in range(len(v)):
            Q[:, j] = chance(fam, mus, spread, lines[j], over[j])
        return lg(Q)

    def fit_links(Ls, Ys, Ks, shared):
        co = {}
        for ks in LK:
            grp = [k_ for k_ in LK if (k_[1] == ks[1])] if shared else [ks]
            sel = np.isin(Ks, grp)
            if sel.sum() < 20:
                co[ks] = None; continue
            X = np.vstack([np.ones(sel.sum()), Ls[sel], Ls[sel] ** 2, Ls[sel] ** 3]).T
            co[ks] = np.linalg.lstsq(X, Ys[sel], rcond=None)[0]
        return co

    def pred(co, ks, L):
        c = co.get(ks)
        if c is None:
            return np.full_like(L, np.nan)
        return c[0] + c[1] * L + c[2] * L ** 2 + c[3] * L ** 3

    for shared in (False, True):
        tag = f"{fam}|{'one link per side' if shared else 'link per kind x side'}"
        # 1) global fit by alternation on ALL ladders (for the spread grid), then honest 5-fold by player for the links + LORO for m
        spread = {s: sp_grid[len(sp_grid) // 2] for s in stats}
        co = None
        cache = {}
        for it in range(4):
            Ls, Ys, Ks = [], [], []
            for key, v in lads.items():
                Q = cache.get((key, spread[key[2]]))
                if Q is None:
                    Q = qmat(v, spread[key[2]]); cache[(key, spread[key[2]])] = Q
                y = np.log([r["fm"] for r in v]); ks = [r["ks"] for r in v]
                if co is None:
                    j = np.argmin(np.abs(MU - max(v[0]["l0"], 0.5)))
                else:
                    P = np.column_stack([pred(co, k_, Q[:, i]) for i, k_ in enumerate(ks)])
                    j = int(np.nanargmin(np.nansum((P - y) ** 2, axis=1)))
                Ls += list(Q[j]); Ys += list(y); Ks += ks
            co = fit_links(np.array(Ls), np.array(Ys), np.array(Ks), shared)
            for s in stats:
                best = None
                for sp in sp_grid:
                    sse = 0.0
                    for key, v in lads.items():
                        if key[2] != s:
                            continue
                        Q = cache.get((key, sp))
                        if Q is None:
                            Q = qmat(v, sp); cache[(key, sp)] = Q
                        y = np.log([r["fm"] for r in v])
                        P = np.column_stack([pred(co, r["ks"], Q[:, i]) for i, r in enumerate(v)])
                        sse += float(np.nanmin(np.nansum((P - y) ** 2, axis=1)))
                    if best is None or sse < best[0]:
                        best = (sse, sp)
                spread[s] = best[1]
            if len(cache) > 400000:
                cache.clear()
        if fam == "nb":
            for s_ in stats:
                best = None
                for sp in spread[s_] * np.exp(np.linspace(-0.25, 0.25, 11)):
                    sse = 0.0
                    for key, v in lads.items():
                        if key[2] != s_:
                            continue
                        Q = qmat(v, sp); y = np.log([r["fm"] for r in v])
                        P = np.column_stack([pred(co, r["ks"], Q[:, i]) for i, r in enumerate(v)])
                        sse += float(np.nanmin(np.nansum((P - y) ** 2, axis=1)))
                    if best is None or sse < best[0]:
                        best = (sse, sp)
                spread[s_] = float(best[1])
        # 2) honest test: links refitted without the player's fold; m from the other rungs of the ladder
        res = defaultdict(list)
        for f_ in range(5):
            Ls, Ys, Ks = [], [], []
            for key, v in lads.items():
                if fold[key[1]] == f_:
                    continue
                Q = qmat(v, spread[key[2]]); y = np.log([r["fm"] for r in v])
                P = np.column_stack([pred(co, r["ks"], Q[:, i]) for i, r in enumerate(v)])
                j = int(np.nanargmin(np.nansum((P - y) ** 2, axis=1)))
                Ls += list(Q[j]); Ys += list(y); Ks += [r["ks"] for r in v]
            cf = fit_links(np.array(Ls), np.array(Ys), np.array(Ks), shared)
            for key, v in lads.items():
                if fold[key[1]] != f_:
                    continue
                Q = qmat(v, spread[key[2]]); y = np.log([r["fm"] for r in v])
                P = np.column_stack([pred(cf, r["ks"], Q[:, i]) for i, r in enumerate(v)])
                for i, r in enumerate(v):
                    oth = [k_ for k_ in range(len(v)) if k_ != i]
                    j = int(np.nanargmin(np.nansum((P[:, oth] - y[oth]) ** 2, axis=1)))
                    # refine the hidden centre between the neighbouring grid points (the coarse grid is 2.3% wide)
                    mus = np.exp(np.linspace(np.log(MU[max(j - 1, 0)]), np.log(MU[min(j + 1, len(MU) - 1)]), 81))
                    Qf = qmat(v, spread[key[2]], mus)
                    Pf = np.column_stack([pred(cf, rr["ks"], Qf[:, ii]) for ii, rr in enumerate(v)])
                    jf = int(np.nanargmin(np.nansum((Pf[:, oth] - y[oth]) ** 2, axis=1)))
                    fp = float(np.exp(Pf[jf, i]))
                    if not np.isfinite(fp):
                        continue
                    for k, Pk in r["P"].items():
                        pv = snap(B[k] * fp)
                        res[(r["ks"], k)].append((pv == round(Pk, 4), abs(B[k] * fp / Pk - 1), abs(pv - Pk) <= step(Pk) + 1e-9))
                    res[(r["ks"], "in")].append((r["flo"] <= fp <= r["fhi"], abs(fp / r["fm"] - 1), True))
        fmt = (lambda x: f"r={x:.2f}") if fam == "nb" else (lambda x: f"{x[0]:.2f}*m^{x[1]:.2f}")
        print(f"PPH|{tag} | spreads: " + ", ".join(f"{s} {fmt(spread[s])}" for s in stats), flush=True)
        for ks in LK:
            line = [f"{k}-pick exact {100*np.mean([a for a, _, _ in res[(ks, k)]]):.0f}% (1 step {100*np.mean([c for _, _, c in res[(ks, k)]]):.0f}%, err {100*np.median([b for _, b, _ in res[(ks, k)]]):.1f}%)"
                    for k in (2, 6) if res.get((ks, k))]
            inn = res.get((ks, "in"))
            if inn:
                print(f"PPH|  {tag} {ks}: {len(inn):,} rungs | factor inside its measured interval {100*np.mean([a for a, _, _ in inn]):.0f}% | median error {100*np.median([b for _, b, _ in inn]):.2f}% | " + " | ".join(line), flush=True)
        allk = [a for (ks, k), v in res.items() if k != "in" for a, _, _ in v]
        print(f"PPH|{tag} OVERALL every quote (all sizes): exact {100*np.mean(allk):.1f}% of {len(allk):,}", flush=True)

    # OBSERVABLE: no hidden centre - m = anchor x c_stat (anchor = regular line or switch point), same honest folds
    print(f"PPH|{fam}|OBSERVABLE (m from the regular line / switch point, no hidden number):", flush=True)
    res = defaultdict(list)
    for f_ in range(5):
        Ls, Ys, Ks = [], [], []
        for key, v in lads.items():
            if fold[key[1]] == f_:
                continue
            Q = qmat(v, spread_default(fam, sp_grid)); j = int(np.argmin(np.abs(MU - max(v[0]["l0"], 0.5))))
            Ls += list(Q[j]); Ys += list(np.log([r["fm"] for r in v])); Ks += [r["ks"] for r in v]
        cf = fit_links(np.array(Ls), np.array(Ys), np.array(Ks), False)
        for key, v in lads.items():
            if fold[key[1]] != f_:
                continue
            Q = qmat(v, spread_default(fam, sp_grid)); j = int(np.argmin(np.abs(MU - max(v[0]["l0"], 0.5))))
            for i, r in enumerate(v):
                fp = float(np.exp(pred(cf, r["ks"], Q[j:j + 1, i])[0]))
                if np.isfinite(fp):
                    res[r["ks"]].append(r["flo"] <= fp <= r["fhi"])
                    for k, Pk in r["P"].items():
                        res[(r["ks"], k)].append(snap(B[k] * fp) == round(Pk, 4))
    for ks in LK:
        if res.get(ks):
            print(f"PPH|  observable {ks}: inside interval {100*np.mean(res[ks]):.0f}% | 2-pick exact {100*np.mean(res.get((ks,2),[0])):.0f}% | 6-pick exact {100*np.mean(res.get((ks,6),[0])):.0f}%", flush=True)


def spread_default(fam, sp_grid):
    return sp_grid[len(sp_grid) // 2]


if __name__ == "__main__":
    main()
