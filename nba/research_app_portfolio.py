#!/usr/bin/env python3
"""
RESEARCH - EACH APP'S PORTFOLIO "B" (2026-10-25; owner 15:34 PT: same testing and simulation as PrizePicks for every app, then out of
paper into reality). READ-ONLY. The portfolio stage that produced PrizePicks' B (research_portfolio_caps / _paths), on the
research_app_final_strategies grid of one app (APP=UD | BETR):
  1 the same strategy matrix is rebuilt (same loader, grader, grid) with each slip's day P/L;
  2 SHORTLIST: per structure (UD Standard 2-6 / Flex 3-6; Betr Perfect 2-6 / Dynamic 3-6 - the owner's 2-6 scope), the robust
    strategies (lower bound > 0 in both periods) ranked by profit / max drawdown; identical day series collapsed; best 2 a structure,
    then the best PF_K overall by profit / drawdown;
  3 EVERY SUBSET of the shortlist (flat 1u a slip): slips a day, ROI per period, max drawdown, profit / drawdown, losing days,
    worst day - and THIS SEASON (2026-27) for each;
  4 for the leaders: starting points (slates to first profit, dips after) and a realistic season (5-slate block bootstrap at
    100 / 60 / 40 % of the backtest edge): profit p10 / median / p90, chance of a losing season, drawdown median / p90.
  UD benchmark: the live paper portfolio P5 on the same footing.
Env: DATABASE_URL, APP, PF_K (12), PF_BOOT (3000).
"""
import itertools
import os
import sys
import time

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_portfolio_paths as PP                 # noqa: E402

T0 = time.time()
K = int(os.environ.get("PF_K") or 12)
NB = int(os.environ.get("PF_BOOT") or 3000)
RNG = np.random.default_rng(77)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def build():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if AF.APP == "BETR":
        AF.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
    days = AF.slate_days(conn)
    combos = AF.strategy_list()
    pay = AF.ud_pay if AF.APP == "UD" else AF.betr_pay
    cols, seas, dts, p5 = [], [], [], []
    for i, d in enumerate(days):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, rows = (AF.load_ud if AF.APP == "UD" else AF.load_betr)(conn, d, st)
        if not legs:
            continue
        cols.append(AF.day_matrix(legs, combos, pay)); seas.append(AF.season_of(d)); dts.append(d)
        if AF.APP == "UD":
            pool = AF.E.eligible_legs(rows)
            r, seen = [], set()
            for comp, size, structure, cap in AF.UDL.PORTFOLIOS["P5"]:
                for slip in AF.E.build_day_slips(pool, comp, size, cap):
                    key = (size, structure, tuple(sorted((l["player"], l["prop"], l["side"], l["line"]) for l in slip)))
                    if key in seen:
                        continue
                    seen.add(key)
                    live = [l for l in slip if l["hit"] is not None]
                    pp = AF.UDL.payout(structure, [{"hit": l["hit"], "factor": float(l["factor"])} for l in live])
                    r.append((1.0 if pp is None else pp) - 1.0)
            p5.append(r)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 50 == 0:
            log(f"slate {i + 1}/{len(days)}")
    return combos, np.stack(cols, axis=1), np.array(seas), dts, p5


def metrics(pl, stk, mask):
    p, s = pl[mask], stk[mask]
    act = s > 0
    dd = AF.max_dd(p)
    return dict(spd=s.mean(), roi=p.sum() / s.sum() if s.sum() else np.nan, profit=p.sum(), dd=dd, rec=p.sum() / dd if dd else np.nan,
                lose=float(np.mean(p[act] < 0)) if act.any() else np.nan, worst=float(p.min()) if len(p) else np.nan, n=int(s.sum()))


def main():
    combos, P, seas, dts, p5 = build()
    log(f"matrix {P.shape}")
    hist = [s for s in ("2024-25", "2025-26") if (seas == s).sum() >= 20]
    if len(hist) == 2:
        A, Bm = seas == hist[0], seas == hist[1]
        la, lb_ = hist
    else:
        idx = np.where(seas == hist[0])[0]
        A = np.zeros(len(seas), bool); Bm = np.zeros(len(seas), bool)
        A[idx[: len(idx) // 2]] = True; Bm[idx[len(idx) // 2:]] = True
        la, lb_ = hist[0] + " 1st half", hist[0] + " 2nd half"
    C = seas == "2026-27"
    H = A | Bm
    ST = AF.STRUCTS
    scope = [j for j, (n, st) in enumerate(ST) if n <= 6 and not (st in ("flex", "dynamic") and n < 3)]
    # ---------------- shortlist ----------------
    cand = []
    for j in scope:
        rows_ = np.arange(j, P.shape[0], len(ST))
        X = P[rows_]
        na, mua, _, lba = AF.lb_stats(X[:, A]); nb, mub, _, lbb = AF.lb_stats(X[:, Bm])
        ok = np.where((na >= AF.MINN) & (nb >= AF.MINN) & (lba > 0) & (lbb > 0))[0]
        scored = []
        for i in ok:
            x = np.nan_to_num(X[i][H])
            dd = AF.max_dd(x)
            scored.append((x.sum() / max(dd, 1.0), i))
        scored.sort(reverse=True)
        taken = []
        for sc, i in scored:
            sig = tuple(np.round(np.nan_to_num(X[i]), 3))
            if any(sig == s2 for _, _, s2 in taken):
                continue
            taken.append((sc, rows_[i], sig))
            if len(taken) == 2:
                break
        cand += [(sc, r) for sc, r, _ in taken]
    cand.sort(reverse=True)
    short = [r for _, r in cand[:K]]
    names = [AF.name(combos[r // len(ST)], *ST[r % len(ST)]) for r in short]
    print(f"\nperiods: {la} {int(A.sum())} | {lb_} {int(Bm.sum())} | this season {int(C.sum())}")
    print(f"\nSHORTLIST ({len(short)} - best 2 robust a structure by profit / drawdown, then the best {K}):")
    S = P[short]
    V = ~np.isnan(S); Z = np.nan_to_num(S)
    for k, (r, nm) in enumerate(zip(short, names)):
        ma = metrics(Z[k], V[k].astype(float), A); mb = metrics(Z[k], V[k].astype(float), Bm); mc = metrics(Z[k], V[k].astype(float), C)
        mh = metrics(Z[k], V[k].astype(float), H)
        print(f"  {k + 1:2d} {nm:<62} {la} {100 * ma['roi']:+.0f}% | {lb_} {100 * mb['roi']:+.0f}% | dd {mh['dd']:.1f}u | profit/dd {mh['rec']:.1f} | "
              f"this season {('%+.0f%% on %d' % (100 * mc['roi'], mc['n'])) if mc['n'] else 'none'}")
    if p5:
        pl5 = np.array([sum(r) for r in p5]); s5 = np.array([float(len(r)) for r in p5])
        for lab, m in ((la, A), (lb_, Bm), ("2026-27", C)):
            mm = metrics(pl5, s5, m)
            print(f"  BENCHMARK live P5 (paper) {lab}: {mm['spd']:.2f} slips a day, ROI {100 * mm['roi']:+.0f}%, dd {mm['dd']:.1f}u, profit/dd {mm['rec']:.1f}")
    # ---------------- every subset ----------------
    rows = []
    for k in range(1, len(short) + 1):
        for sub in itertools.combinations(range(len(short)), k):
            sub = list(sub)
            pl = Z[sub].sum(axis=0); stk = V[sub].sum(axis=0).astype(float)
            mh = metrics(pl, stk, H)
            if mh["n"] == 0:
                continue
            ma = metrics(pl, stk, A); mb = metrics(pl, stk, Bm)
            rows.append((sub, mh, ma, mb, metrics(pl, stk, C), pl, stk))
    log(f"{len(rows):,} subsets")

    def pr(r):
        sub, mh, ma, mb, mc, _, _ = r
        return (f"{'+'.join(str(i + 1) for i in sub):<26} slips/day {mh['spd']:.2f} | ROI {100 * mh['roi']:+.0f}% ({100 * ma['roi']:+.0f} / {100 * mb['roi']:+.0f}) | "
                f"profit {mh['profit']:+.0f}u | dd {mh['dd']:.1f}u | profit/dd {mh['rec']:.1f} | losing days {100 * mh['lose']:.0f}% | worst day {mh['worst']:+.1f}u | "
                f"this season {('%+.0f%% on %d slips' % (100 * mc['roi'], mc['n'])) if mc['n'] else 'none'}")
    lead = []
    for lab, key in (("best profit / drawdown, weaker period ROI >= +40%", lambda r: -r[1]["rec"] if min(r[2]["roi"], r[3]["roi"]) >= 0.40 else 0),
                     ("most profit with drawdown <= 15u", lambda r: -r[1]["profit"] if r[1]["dd"] <= 15 else 0),
                     ("most profit with drawdown <= 25u", lambda r: -r[1]["profit"] if r[1]["dd"] <= 25 else 0),
                     ("highest weaker-period ROI with >= 2 slips a day", lambda r: -min(r[2]["roi"], r[3]["roi"]) if r[1]["spd"] >= 2 else 0),
                     ("fewest losing days with >= 1 slip a day", lambda r: (r[1]["lose"] if r[1]["spd"] >= 1 else 9))):
        print(f"\n  -- {lab}")
        for r in sorted(rows, key=key)[:8]:
            print("    " + pr(r))
        lead.append(sorted(rows, key=key)[0])
    print("\n  -- by number of strategies (best profit / drawdown at each size)")
    for k in range(1, len(short) + 1):
        rk = [r for r in rows if len(r[0]) == k]
        if rk:
            print("    " + pr(max(rk, key=lambda r: r[1]["rec"])))
    # ---------------- starting points + realistic season for the leaders ----------------
    L = int(round(np.mean([np.sum(seas == s) for s in hist]))) if len(hist) == 2 else int(np.sum(seas == hist[0]))
    print(f"\nLEADERS: starting points (history) and a realistic season ({NB} bootstrapped seasons of {L} slates)")
    seen = set()
    for r in lead:
        key_ = tuple(r[0])
        if key_ in seen:
            continue
        seen.add(key_)
        sub, mh, *_rest, pl, stk = r
        print(f"\n  == {'+'.join(str(i + 1) for i in sub)}  ({mh['spd']:.2f} slips a day, ROI {100 * mh['roi']:+.0f}%, dd {mh['dd']:.1f}u)")
        PP.report("", pl[H], list(range(int(H.sum()))), "any history slate")
        roi = mh["roi"]
        for kk in (1.0, 0.6, 0.4):
            R = np.array([PP.boot_season(pl[H], stk[H], stk[H], stk[H], L, kk, roi) for _ in range(NB)])
            prof, dd, fp, uw, st_, ns_ = R.T
            print(f"    edge {100 * kk:3.0f}% (ROI ~{100 * kk * roi:+.0f}%): season profit p10 {np.percentile(prof, 10):+.0f}u | median {np.median(prof):+.0f}u | "
                  f"p90 {np.percentile(prof, 90):+.0f}u | losing season {100 * np.mean(prof < 0):.0f}% | dd median {np.median(dd):.1f}u, p90 "
                  f"{np.percentile(dd, 90):.1f}u | longest under water median {np.median(uw):.0f} slates | slips {np.median(ns_):.0f}")
    log("done")


if __name__ == "__main__":
    main()
