#!/usr/bin/env python3
"""
LEG HIT-RATE ESTIMATORS, HEAD TO HEAD ON EACH APP'S OWN GRADED LEGS (owner 2026-11-18 15:17 PT: "Is that more assertive than a plain hit rate x multiplier? Sleeper,
underdog, fliff already have this season ... underdog has the same as PrizePicks"). READ-ONLY.  RC_APP = sleeper | fliff | underdog.
Legs = the app's real boards with the model's final_hp, the app's multiplier and the result (Sleeper / Fliff: the real 2026-27 slates; Underdog: every archived slate).
For each leg the candidates for its real hit chance:
  RAW      the model's final_hp
  PLAIN-*  the player's own past hit rate at this stat / side / line: last 10, last 20, season to date, every game since 2023-24, and recency-weighted (half-life 25 games)
  DEPLOYED what the board shows now: final_hp + the PrizePicks calibration + the price blend with the ASSUMED kappa .88 / weight .40
  FIT-*    fitted on this app's own legs, always trained on one half of the slates and scored on the other (both directions): model only, price only, plain rate only,
           model + price, model + price + plain rate
Scored out of sample by Brier error and log loss (lower = closer to the truth) and by what matters for picking: the REAL return of the legs each one ranks highest by
ROI = p x m - 1 (top 5% and top 10% of all legs, and the top 5 legs of every slate).  Env: DATABASE_URL, RC_APP.
"""
import bisect
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
APP = (os.environ.get("RC_APP") or "sleeper").lower()
os.environ["APP"] = "BETR" if APP == "betr" else "UD"
os.environ["SW_APP"] = APP if APP in ("sleeper", "fliff", "betr") else "sleeper"
import research_app_final_strategies as AF           # noqa: E402
import research_roi_slip_sweep_apps as M             # noqa: E402

T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lg(x):
    x = np.clip(x, .02, .98)
    return np.log(x / (1 - x))


def fit(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(40):
        q = 1 / (1 + np.exp(-np.clip(X @ w, -30, 30)))
        g = X.T @ (y - q) - 1e-3 * w
        H = (X * (q * (1 - q))[:, None]).T @ X + 1e-3 * np.eye(len(w))
        st = np.linalg.solve(H, g)
        w += st
        if np.abs(st).max() < 1e-7:
            break
    return w


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    # every player's game log, oldest first, for the plain hit rates
    hist = defaultdict(lambda: ([], []))
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov, mins in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov, min
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        h = hist[pid]
        h[0].append(d); h[1].append(dict(pts=pts or 0, reb=reb or 0, ast=ast or 0, fg3m=fg3m or 0, stl=stl or 0, blk=blk or 0, tov=tov or 0, min=mins))
    log(f"game logs: {len(hist)} players")
    days = []
    if APP == "underdog":
        for d in AF.slate_days(conn):
            st = AF.box(conn, d)
            if not st:
                continue
            legs, _ = AF.load_ud(conn, d, st)
            days.append((d, legs))
    elif APP == "betr":
        raw = M.build_betr(conn)                               # Betr legs carry no multiplier of their own (m = 1): accuracy and the hit rate of the top legs only
        days = sorted(x for v in raw.values() for x in v)
        try:
            conn.close()
        except Exception:
            pass
        conn = psycopg.connect(os.environ["DATABASE_URL"])
    else:
        raw = M.build_sleeper_fliff(conn)
        days = sorted(raw.get(M.REAL, []))
    rows = []
    for d, legs in days:
        for l in legs:
            h = l.get("hit")
            if h is None or h != h or l.get("p") is None or not l.get("m") or l["m"] <= 1.0 and APP not in ("underdog", "betr"):
                continue
            if l["prop"] not in AF.STAT:
                continue
            ds, ss = hist.get(str(l["player_id"]), ([], []))
            k = bisect.bisect_left(ds, d)
            over = str(l["side"]).lower()[0] in "omh"
            line = float(l["line"])
            past = [(dd, AF.STAT[l["prop"]](s)) for dd, s in zip(ds[max(0, k - 250):k], ss[max(0, k - 250):k])]
            past = [(dd, (v > line) if over else (v < line)) for dd, v in past if v != line]
            hits = [hh for _, hh in past]
            n = len(hits)

            def rate(xs):
                return (sum(xs) + 1.0) / (len(xs) + 2.0)          # +1 / +2 so a short record is not 0% or 100%
            y0 = d.year if d.month >= 8 else d.year - 1
            seas = [hh for dd, hh in past if (dd.year if dd.month >= 8 else dd.year - 1) == y0]
            wts = [0.5 ** ((n - 1 - i) / 25.0) for i in range(n)]
            dec = (sum(w for w, hh in zip(wts, hits) if hh) + 1.0) / (sum(wts) + 2.0) if n else 0.5
            rows.append((d.toordinal(), float(l["p"]), float(l["m"]), int(over), float(h), rate(hits[-10:]), rate(hits[-20:]), rate(seas), rate(hits), dec, n,
                         AF.season_of(d), str(l.get("kind") or "main")))
    A0 = np.array([r[:11] for r in rows], dtype=float)
    S0 = np.array([r[11] for r in rows]); K0 = np.array([r[12] for r in rows])
    try:
        conn.close()
    except Exception:
        pass
    conn = psycopg.connect(os.environ["DATABASE_URL"])            # the row loop is long and the idle connection gets closed
    T = M.pp_tables(conn)["all"]
    subsets = [("ALL LEGS", np.ones(len(A0), bool))]
    if len(set(K0)) > 1:
        subsets += [("MAIN LINES ONLY", K0 == "main"), ("ALTERNATE LINES ONLY", K0 != "main")]
    for s in sorted(set(S0)):
        if len(set(S0)) > 1:
            subsets.append((f"SEASON {s}", S0 == s))
    for label, mask in subsets:
        if mask.sum() < 2000:
            continue
        score(label, A0[mask], S0[mask], T)
    log("DONE")


def score(label, A, seasons, T):
    day, p, m, over, y, h10, h20, hsea, hall, hdec, nprev = A.T
    if APP == "underdog":
        m = 1.8708 * m                                  # the leg's own return on a 2-pick Standard: 3.5^0.5 x its modifier
    be = np.clip(1.0 / m, .02, .98)
    log(f"{APP} {label}: {len(y):,} graded legs on {len(set(day))} slates ({', '.join(f'{s} {int((seasons == s).sum()):,}' for s in sorted(set(seasons)))}); "
        f"hit rate {y.mean():.3f}; multiplier median {np.median(m):.2f}; past games behind the plain rates: median {int(np.median(nprev))}")
    gap = np.zeros(len(y))
    for ov in (1, 0):
        kk = over == ov
        if kk.any():
            gap[kk] = M.cal_gap(T, bool(ov), p[kk])[0]
    pc = np.clip(p + gap, .005, .995)
    # main_ui/roi.js estimateHit, kind 'all' (2026-11-18 check: the weight is NOT flat - it grows with the distance of the price from a standard leg)
    w_dep = np.minimum(0.85, 0.40 + 0.5 * np.abs(np.log(be / 0.56)))
    deployed = np.clip(pc + w_dep * (np.minimum(.99, 0.88 * be) - pc), .005, .995)
    cut = np.median(sorted(set(day)))
    halves = [(day <= cut, day > cut), (day > cut, day <= cut)]
    one = np.ones(len(y))
    feats = {"FIT model only": [one, lg(p)], "FIT price only": [one, lg(be)], "FIT plain rate only": [one, lg(hdec)],
             "FIT model + price": [one, lg(p), lg(be), over], "FIT model + price + plain rate": [one, lg(p), lg(be), over, lg(hdec)]}
    est = {"RAW model": p, "PLAIN last 10": h10, "PLAIN last 20": h20, "PLAIN season to date": hsea, "PLAIN all games": hall, "PLAIN recency-weighted": hdec,
           "DEPLOYED (board formula)": deployed}
    for name, cols in feats.items():
        X = np.column_stack(cols); out = np.zeros(len(y)); ws = []
        for tr, te in halves:
            w = fit(X[tr], y[tr]); ws.append(w)
            out[te] = 1 / (1 + np.exp(-np.clip(X[te] @ w, -30, 30)))
        est[name] = out
        log(f"  {name}: weights first->second half {np.round(ws[0], 3)}, second->first {np.round(ws[1], 3)}")
    ret = y * m - 1                                       # the leg's real return per unit
    dset = sorted(set(day))
    print(f"\nRC|{APP.upper()} {label} - {len(y):,} legs. Lower Brier / log loss = closer to the truth. Returns are REAL results of the legs each estimator ranks highest by p x m - 1.")
    print(f"RC|{'estimator':34s} {'Brier':>7s} {'logloss':>8s} | {'top 5% legs: predicted -> real':>32s} | {'top 10%: predicted -> real':>28s} | {'top 5 legs a slate: real':>24s} | bias")
    base = y.mean()
    print(f"RC|{'(always the average hit rate)':34s} {np.mean((base - y) ** 2):7.4f} {-np.mean(y * np.log(base) + (1 - y) * np.log(1 - base)):8.4f} | all legs real return {100 * ret.mean():+.1f}%")
    for name, q in est.items():
        q = np.clip(q, .005, .995)
        brier = np.mean((q - y) ** 2); ll = -np.mean(y * np.log(q) + (1 - y) * np.log(1 - q))
        roi = q * m - 1
        o = np.argsort(-roi)
        t5 = o[:max(1, len(o) // 20)]; t10 = o[:max(1, len(o) // 10)]
        per = []
        for dd in dset:
            ix = np.where(day == dd)[0]
            per.extend(ix[np.argsort(-roi[ix])[:5]])
        per = np.array(per)
        print(f"RC|{name:34s} {brier:7.4f} {ll:8.4f} | {100 * roi[t5].mean():+13.1f}% -> {100 * ret[t5].mean():+6.1f}% (hit {100 * y[t5].mean():4.1f}%) | "
              f"{100 * roi[t10].mean():+10.1f}% -> {100 * ret[t10].mean():+6.1f}% | {100 * ret[per].mean():+10.1f}% (n={len(per)}) | {100 * (q.mean() - base):+.1f}pp", flush=True)


if __name__ == "__main__":
    main()
