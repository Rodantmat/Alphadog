#!/usr/bin/env python3
"""
RESEARCH - BOARD-CENTRED LADDER, WALK-FORWARD AS OF EACH MONTH (2026-10-22 PT). READ-ONLY. The production check of
research_calibration_layers_v2.py (run 39883191272: L1 board-centred ladder beats today's final_hp in 14/14 leave-one-month-out
months, pooled log-loss 0.6463 -> 0.6288; L2 spread and L3 residual add 0.0008 more). Leave-one-month-out still trains on later
months; production can only use the past. Here every month is scored with layers fitted ONLY on legs graded before that month's
first day (the 2025-26 opener therefore uses 2024-25 alone, exactly what a live opening night has).
Per month: log-loss of today's final_hp vs L1 / L1+L2 / L1+L2+L3, the fitted w per prop, and per line type the legs >= .58 and
their hit rate under today's final_hp and under the full chain - the pool the slip engine would see.
The layer definitions and helpers are research_calibration_layers_v2.py's, copied unchanged.
Env: DATABASE_URL, LV_K (400).
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

SEASONS = ("2024-25", "2025-26")
PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast",
         "reb_ast")
WGRID = (0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0)
K = float(os.environ.get("LV_K") or 400)
EPS = 1e-4


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sig(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def fit_logistic(X, y, l2=1e-3, iters=60):
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        p = sig(X @ beta)
        g = X.T @ (y - p) - l2 * beta
        H = -(X.T * (p * (1 - p))) @ X - l2 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        beta -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def ll(p, y):
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def ece(p, y, nb=20):
    o = np.argsort(p)
    return float(np.mean([abs(p[b].mean() - y[b].mean()) for b in np.array_split(o, nb) if len(b)]))


def auc(p, y):
    o = np.argsort(p, kind="mergesort")
    r = np.empty(len(p)); r[o] = np.arange(1, len(p) + 1)
    n1 = y.sum(); n0 = len(y) - n1
    return float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else float("nan")


def top(p, y):
    m = p >= 0.58
    return f"top n {int(m.sum()):>6} p {p[m].mean() if m.any() else float('nan'):.3f} hit {y[m].mean() if m.any() else float('nan'):.3f}"


def lt_of(t):
    return "R" if t == "R" else str(t)[:2]


def ladder_p(lines, z, x):
    """p_more at line x from one ladder (z = log-odds of p_more per rung), interpolated in log-odds, extended at the ends on the
    end slope"""
    if x <= lines[0]:
        s = (z[1] - z[0]) / (lines[1] - lines[0]) if len(lines) > 1 else 0.0
        return sig(z[0] + s * (x - lines[0]))
    if x >= lines[-1]:
        s = (z[-1] - z[-2]) / (lines[-1] - lines[-2]) if len(lines) > 1 else 0.0
        return sig(z[-1] + s * (x - lines[-1]))
    return sig(np.interp(x, lines, z))


def centre(lines, pm):
    """the line where p_more crosses 0.5 (p_more falls with the line)"""
    z = logit(pm)
    if z[0] <= 0:
        return lines[0]
    if z[-1] >= 0:
        return lines[-1]
    i = int(np.argmax(z < 0))
    return lines[i - 1] + (lines[i] - lines[i - 1]) * z[i - 1] / (z[i - 1] - z[i])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    legs = {}
    for season, d, rk, nn, pr, sd, ln, t, sc, h, fac in conn.execute(
            """SELECT season, game_date, rank_key, nba_ref.norm_name(player), prop, side, line::float8, tier, score, hit, factor
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL AND prop = ANY(%s)
               AND rank_key IN ('final_hp', 'baseline_hp')""", (list(SEASONS), list(PROPS))):
        k = (season, d, nn, pr, sd, round(ln, 1), t)
        l = legs.setdefault(k, {"hit": int(h), "fac": float(fac or 1.0)})
        l["fh" if rk == "final_hp" else "bh"] = float(sc)
    std_line = {}
    need = set()
    for (s, d, nn, pr, sd, ln, t) in legs:
        if t == "R":
            std_line[(s, d, nn, pr)] = ln
        pid = name_pid.get(nn)
        if pid:
            need.add((pid, d, pr))
    print(f"graded legs {len(legs):,}; player-day-props needing a ladder {len(need):,}", flush=True)
    lad = defaultdict(list)
    cur = conn.cursor(name="lad")
    cur.itersize = 200000
    cur.execute("""SELECT player_id, game_date, prop, line::float8, p_more::float8 FROM nba_score.baseline_history
                   WHERE season = ANY(%s) AND prop = ANY(%s) AND upper(coalesce(period, 'FULL')) = 'FULL'""", (list(SEASONS), list(PROPS)))
    for pid, d, pr, ln, pm in cur:
        k = (pid, d, pr)
        if k in need and pm is not None:
            lad[k].append((ln, pm))
    cur.close()
    ladders = {}
    for k, v in lad.items():
        v.sort()
        lines = np.array([a for a, _ in v]); pm = np.minimum.accumulate(np.array([b for _, b in v]))   # p_more non-increasing
        if len(lines) >= 3:
            ladders[k] = (lines, logit(pm), centre(lines, pm))
    del lad
    print(f"ladders {len(ladders):,}", flush=True)

    rows = []
    miss = defaultdict(int)
    for (s, d, nn, pr, sd, ln, t), v in legs.items():
        if "fh" not in v or "bh" not in v:
            miss["no fh/bh"] += 1; continue
        L0 = std_line.get((s, d, nn, pr))
        lk = ladders.get((name_pid.get(nn), d, pr))
        if L0 is None:
            miss["no standard line"] += 1; continue
        if lk is None:
            miss["no ladder"] += 1; continue
        rows.append((s, d, pr, sd, lt_of(t), ln, L0, lk, v["bh"], v["fh"], v["hit"], v["fac"]))
    print(f"legs used {len(rows):,}; dropped " + ", ".join(f"{k} {n:,}" for k, n in miss.items()), flush=True)
    MO = np.array([f"{r[1].year}-{r[1].month:02d}" for r in rows]); P = np.array([r[2] for r in rows])
    SD = np.array([r[3] for r in rows]); LT = np.array([r[4] for r in rows]); BH = np.array([r[8] for r in rows], float)
    FH = np.array([r[9] for r in rows], float); Y = np.array([r[10] for r in rows], float)
    FAC = np.array([r[11] for r in rows], float)
    q = np.clip(np.where(LT == "R", 0.5, 1.0 / (2.0 * np.maximum(FAC, 0.3))), 0.05, 0.95)

    # p of the leg's side for every w on the grid (L1)
    PW = {}
    for w in WGRID:
        out = np.empty(len(rows))
        for i, r in enumerate(rows):
            ln, L0, (lines, z, c) = r[5], r[6], r[7]
            shift = (1 - w) * (L0 - c)
            pmo = ladder_p(lines, z, ln - shift)
            out[i] = pmo if r[3] == "Over" else 1 - pmo
        PW[w] = out
    raw_at_line = PW[1.0]
    print(f"sanity: mean |bh - ladder p at the leg's line| {np.mean(np.abs(BH - raw_at_line)):.4f} "
          f"(median {np.median(np.abs(BH - raw_at_line)):.4f}); centre - L0 mean {np.mean([r[7][2] - r[6] for r in rows]):+.3f}", flush=True)

    def l1_fit(tr):
        """best w per prop on index mask tr (log-loss of the side's p, no calibration)"""
        best = {}
        for pr in PROPS:
            m = tr & (P == pr)
            if m.sum() < 300:
                best[pr] = 1.0; continue
            best[pr] = min(WGRID, key=lambda w: ll(PW[w][m], Y[m]))
        return best

    def chain(tr, te):
        wp = l1_fit(tr)
        p1 = np.array([PW[wp[pr]][i] for i, pr in enumerate(P)])
        p2 = p1.copy()
        for lt in set(LT):
            for side in ("Over", "Under"):
                mtr = tr & (LT == lt) & (SD == side); mte = te & (LT == lt) & (SD == side)
                if mtr.sum() < 200 or not mte.any():
                    continue
                b = fit_logistic(np.column_stack([np.ones(mtr.sum()), logit(p1[mtr])]), Y[mtr])
                p2[mte] = sig(b[0] + b[1] * logit(p1[mte]))
                p2[mtr] = sig(b[0] + b[1] * logit(p1[mtr]))
        p3 = p2.copy()
        cell = np.array([f"{a}|{b}|{c}" for a, b, c in zip(P, LT, SD)])
        parent = np.array([f"{b}|{c}" for b, c in zip(LT, SD)])
        X = lambda m: np.column_stack([np.ones(m.sum()), logit(p2[m]), logit(q[m])])   # noqa: E731
        pb = {pk: fit_logistic(X(tr & (parent == pk)), Y[tr & (parent == pk)]) for pk in set(parent[tr])}
        for ck in set(cell[te]):
            mte = te & (cell == ck); mtr = tr & (cell == ck)
            pk = parent[mte][0]
            if pk not in pb:
                continue
            beta = pb[pk]
            if mtr.sum() >= 30:
                wgt = mtr.sum() / (mtr.sum() + K)
                beta = wgt * fit_logistic(X(mtr), Y[mtr]) + (1 - wgt) * pb[pk]
            p3[mte] = sig(X(mte) @ beta)
        return wp, p1, p2, p3

    print("\n" + "=" * 130 + "\nWALK-FORWARD - every month fitted on legs graded before it")
    DAYS = np.array([r[1] for r in rows])
    agg = defaultdict(lambda: [0.0, 0])
    pool = defaultdict(lambda: [0, 0, 0, 0])            # (line type, side) -> [n >= .58 today, hits, n >= .58 chain, hits]
    wins = 0; months = 0
    for mo in sorted(set(MO)):
        te = MO == mo
        first = DAYS[te].min()
        tr = DAYS < first
        if te.sum() < 2000 or tr.sum() < 20000:
            continue
        months += 1
        wp, p1, p2, p3 = chain(tr, te)
        line = []
        for name, p in (("fh", FH), ("L1", p1), ("L1+L2", p2), ("L1+L2+L3", p3)):
            v = ll(p[te], Y[te])
            agg[name][0] += v * te.sum(); agg[name][1] += te.sum()
            line.append(f"{name} {v:.4f}")
        wins += ll(p3[te], Y[te]) < ll(FH[te], Y[te]) - 1e-5
        print(f"  {mo} (train {int(tr.sum()):,} / test {int(te.sum()):,}): " + " | ".join(line) + "  w " + ",".join(f"{k[:3]}{v}" for k, v in wp.items()), flush=True)
        for lt in ("R", "G1", "G2", "G3", "D1", "D2", "D3"):
            for side in ("Over", "Under"):
                m = te & (LT == lt) & (SD == side)
                a = m & (FH >= 0.58); b = m & (p3 >= 0.58)
                c = pool[(lt, side)]
                c[0] += int(a.sum()); c[1] += int(Y[a].sum()); c[2] += int(b.sum()); c[3] += int(Y[b].sum())
    print(f"\n  pooled over {months} months: " + ", ".join(f"{k} {s_ / n:.4f}" for k, (s_, n) in agg.items()) + f"; full chain beats today in {wins}/{months}")
    print("  legs >= .58 by line type x side: today's final_hp (n, hit) -> full chain (n, hit)")
    for (lt, side), (a, ah, b, bh) in sorted(pool.items()):
        if a or b:
            print(f"    {lt:<3} {side:<5} today n {a:>7} hit {ah / a if a else float('nan'):.3f}  ->  chain n {b:>7} hit {bh / b if b else float('nan'):.3f}")


if __name__ == "__main__":
    main()
