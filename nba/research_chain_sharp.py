#!/usr/bin/env python3
"""
WHICH final_hp CHAIN IS SHARP ON HONEST INPUTS? READ-ONLY. (owner 2026-11-20 20:58 PT: "calibrate, simulate, test and be sure it is sharp ... then run
the same formula for every single day")

Inputs (all point-in-time, certified): the honest ladders nba_score.baseline_history_h (12 calibrated props, three seasons), every distinct graded board
leg of nba_score._lr_legs_h (any app; one row per date / player / prop / line / side), the board's standard line L0 (final_hp_board_cal.std_lines).
Walk-forward by MONTH: every month is scored with parameters fitted only on legs strictly before its first day (expanding window, all seasons).
Chains (final_hp is app-agnostic, no price enters):
  RAW    honest ladder probability at the line
  PLATT  RAW + logistic per prop x side
  BC     production's board-centred chain (final_hp_board_cal.fit_asof logic): L1 ladder re-centred toward L0 by (1 - w_prop), w chosen on the
         training legs from WGRID; L2 logistic per prop x line type x side shrunk to line type x side
  BC0    BC with w = 0 for every prop (ladder fully centred on the board line; the ladder only supplies the slope)
  BCW    BC with w per prop chosen but no L2
Report per season and per line type: legs, log-loss, Brier, calibration slope / intercept, mean predicted vs hit; and on standard (R) lines the hit of
the top fifth minus the bottom fifth by the chain's probability. Stability: w per prop month to month.
Env: DATABASE_URL, CS_PROPS (default the 12), CS_MAXLEGS (cap for a quick run, 0 = all).
"""
import datetime as dt
import os
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_hp_board_cal as BC  # noqa: E402

T0 = time.time()
PROPS = tuple((os.environ.get("CS_PROPS") or ",".join(BC.PROPS)).split(","))


def log(m):
    print(f"CS|[{time.time() - T0:5.0f}s] {m}", flush=True)


def calib(p, y):
    z = BC.logit(p)
    X = np.column_stack([np.ones(len(z)), z])
    b = BC.fit_logistic(X, y)
    return float(b[0]), float(b[1])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    legs = pd.read_sql("""SELECT DISTINCT ON (game_date, player_id, prop, line, side) season, game_date, player_id, prop, line, side, hit
                          FROM nba_score._lr_legs_h WHERE hit IS NOT NULL AND prop = ANY(%s) AND game_date >= '2024-10-01'
                          ORDER BY game_date, player_id, prop, line, side""", conn, params=(list(PROPS),))
    legs["side"] = np.where(legs["side"].str.lower().str.startswith("o") | legs["side"].str.lower().str.startswith("m"), "Over", "Under")
    legs = legs.drop_duplicates(["game_date", "player_id", "prop", "line", "side"])
    cap = int(os.environ.get("CS_MAXLEGS") or 0)
    if cap and len(legs) > cap:
        legs = legs.sample(cap, random_state=1).sort_values("game_date")
    log(f"distinct graded legs: {len(legs):,} | {legs['season'].value_counts().to_dict()}")
    need = set(zip(legs["player_id"].astype(str), legs["game_date"], legs["prop"]))
    lad = {}
    cur = conn.cursor(name="cs_lad"); cur.itersize = 50000
    cur.execute("""SELECT player_id::text, game_date, prop, lines, p_more FROM nba_score.baseline_history_h WHERE prop = ANY(%s)""", (list(PROPS),))
    for pid, d, pr, ls, pm in cur:
        if (pid, d, pr) in need and ls:
            r = [(float(a), float(b)) for a, b in zip(ls, pm) if b is not None and b == b]
            if r:
                lad[(pid, d, pr)] = r
    cur.close()
    log(f"honest ladders loaded: {len(lad):,}")
    a, b = legs["game_date"].min(), legs["game_date"].max()
    L0 = BC.std_lines(conn, seasons_dates=(a, b))
    log(f"standard lines: {len(L0):,}")
    # slope constants from honest ladders (>= 3 rungs), as load_training does
    slopes = defaultdict(list); ladders = {}
    for k, v in lad.items():
        L = BC.Ladder(v)
        ladders[k] = L
        if len(L.lines) >= 3:
            s = (L.z[-1] - L.z[0]) / (L.lines[-1] - L.lines[0])
            if s < 0:
                slopes[k[2]].append(-s * np.sqrt(max(L.c, 1.0)))
    slope_c = {pr: float(np.median(v)) for pr, v in slopes.items() if v}
    rows = []
    for season, d, pid, pr, ln, sd, h in legs.itertuples(index=False):
        pid = str(pid); l0 = L0.get((d, pid, pr)); L = ladders.get((pid, d, pr))
        if l0 is None or L is None:
            continue
        rows.append((season, d, pr, sd, float(ln), l0[0], BC.line_type(float(ln), l0[0]), L, int(h)))
    log(f"legs with a ladder and a standard line: {len(rows):,} of {len(legs):,}")
    S = np.array([r[0] for r in rows]); D = np.array([r[1] for r in rows]); P = np.array([r[2] for r in rows]); SD = np.array([r[3] for r in rows])
    LT = np.array([r[6] for r in rows]); Y = np.array([r[8] for r in rows], float)
    PW = {}
    for w in BC.WGRID:
        PW[w] = np.array([BC.l1_p(r[7], r[4], r[5], w, r[3], slope_c.get(r[2])) for r in rows])
    RAW = PW[1.0]
    log("L1 probabilities computed for every w")
    months = sorted({(d.year, d.month) for d in D})
    out = {k: np.full(len(rows), np.nan) for k in ("RAW", "PLATT", "BC", "BC0", "BCW")}
    wtrack = []
    for (yy, mm) in months:
        start = dt.date(yy, mm, 1)
        tr = D < start; te = (np.array([x.year for x in D]) == yy) & (np.array([x.month for x in D]) == mm)
        if tr.sum() < 20000 or te.sum() == 0:
            continue
        out["RAW"][te] = RAW[te]
        # PLATT per prop x side
        pl = RAW[te].copy()
        for pr in PROPS:
            for sd in ("Over", "Under"):
                m = tr & (P == pr) & (SD == sd); mt = te & (P == pr) & (SD == sd)
                if m.sum() >= 300 and mt.sum():
                    b0, b1 = calib(RAW[m], Y[m])
                    pl[(P[te] == pr) & (SD[te] == sd)] = BC.sig(b0 + b1 * BC.logit(RAW[mt]))
        out["PLATT"][te] = pl
        for name, wfix in (("BC", None), ("BC0", 0.0)):
            w = {}
            for pr in PROPS:
                m = tr & (P == pr)
                w[pr] = (1.0 if m.sum() < 300 else float(min(BC.WGRID, key=lambda x: BC.ll(PW[x][m], Y[m])))) if wfix is None else wfix
            if name == "BC":
                wtrack.append((start, dict(w)))
            idx = np.array([BC.WGRID.index(w[pr]) for pr in P])
            p1 = np.choose(idx, [PW[x] for x in BC.WGRID])
            if name == "BC":
                out["BCW"][te] = p1[te]
            pt = p1[te].copy()
            for lt in BC.LTS:
                for sd in ("Over", "Under"):
                    m = tr & (LT == lt) & (SD == sd)
                    if m.sum() < 200:
                        continue
                    bp = BC.fit_logistic(np.column_stack([np.ones(m.sum()), BC.logit(p1[m])]), Y[m])
                    for pr in PROPS:
                        mc = m & (P == pr); mt = te & (LT == lt) & (SD == sd) & (P == pr)
                        if not mt.any():
                            continue
                        nc = int(mc.sum())
                        bb = bp if nc < 30 else (nc / (nc + BC.K)) * BC.fit_logistic(np.column_stack([np.ones(nc), BC.logit(p1[mc])]), Y[mc]) + (1 - nc / (nc + BC.K)) * bp
                        sel = (LT[te] == lt) & (SD[te] == sd) & (P[te] == pr)
                        pt[sel] = BC.sig(bb[0] + bb[1] * BC.logit(p1[mt]))
            out[name][te] = pt
        log(f"month {start}: train {int(tr.sum()):,} test {int(te.sum()):,} | w " + ", ".join(f"{k} {v}" for k, v in wtrack[-1][1].items()))
    ok = ~np.isnan(out["RAW"])
    print("CS|================ OUT OF SAMPLE (walk-forward by month) ================", flush=True)
    for grp, mask_fn in (("season", lambda s: S == s), ):
        for s in sorted(set(S[ok])):
            for lt_lab, ltm in (("all", np.ones(len(rows), bool)), ("R (standard)", LT == "R"), ("G (goblin side)", np.char.startswith(LT.astype(str), "G")),
                                ("D (demon side)", np.char.startswith(LT.astype(str), "D"))):
                m = ok & (S == s) & ltm
                if m.sum() < 500:
                    continue
                y = Y[m]
                line = f"CS|{s} {lt_lab:16s} n={int(m.sum()):8,} hit {100*y.mean():5.1f}% |"
                for k in ("RAW", "PLATT", "BCW", "BC0", "BC"):
                    p = out[k][m]
                    a0, a1 = calib(p, y)
                    line += f" {k} ll {BC.ll(p, y):.4f} br {np.mean((p - y) ** 2):.4f} pred {100*p.mean():5.1f} slope {a1:4.2f} |"
                print(line, flush=True)
            m = ok & (S == s) & (LT == "R")
            if m.sum() > 1000:
                line = f"CS|{s} standard lines, hit top fifth - bottom fifth:"
                for k in ("RAW", "PLATT", "BC"):
                    p = out[k][m]; y = Y[m]; q = np.quantile(p, [0.2, 0.8])
                    line += f" {k} {100*(y[p >= q[1]].mean() - y[p <= q[0]].mean()):+5.1f} pts"
                print(line, flush=True)
    print("CS|================ w per prop month to month (BC) ================", flush=True)
    for pr in PROPS:
        print(f"CS|  {pr:12s} " + " ".join(f"{x[1][pr]}" for x in wtrack), flush=True)
    print("CS|DONE", flush=True)


if __name__ == "__main__":
    main()
