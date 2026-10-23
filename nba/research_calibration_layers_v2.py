#!/usr/bin/env python3
"""
RESEARCH - LAYERED CALIBRATION FIX, STAGED (2026-10-22 PT; owner 17:49 / 18:02 PT: calibrate demons and every prop line, "the fix
can be granulated and spread in different layers of the system"). READ-ONLY. Follows research_calibration_layers.py (run 39882518299):

  * our projected mean barely beats nothing against PrizePicks' standard line: the least-squares weight of (our mean - board line)
    in the realised stat is w = +0.03..+0.12 for points / rebounds / assists / turnovers, +0.33..+0.46 for blocks / steals;
  * on the standard line baseline_hp hardly separates winners from losers (Over bh 0.29 -> hit 0.48, bh 0.55 -> hit 0.49);
  * on alternates the hit rate is driven by the rung's distance from the standard line, and our disagreement with the board
    counts AGAINST the leg (demons D2: top decile of disagreement hit 0.26 vs 0.33).
So the error is made in layer 1 (the ladder is centred on our own mean, not on the board), then left in place by layer 3 (the
as-of calibration is fitted on graded ladder rungs, not on the PrizePicks board, and is blind to line type).

THE LAYERS TESTED, each on top of the previous, train one season -> test the other, then leave-one-month-out:
  L1  BOARD-CENTRED LADDER: move each player-prop ladder (nba_score.baseline_history, rungs -10..+10) so its centre c (the line
      where p_more = 0.5, interpolated in log-odds) becomes c + (1 - w_prop) x (L0 - c), L0 = PrizePicks' standard line;
      p_more'(line) = p_more(line - shift). w_prop fitted on the train set over a grid (0 .. 1; 1 = today's ladder).
  L2  SPREAD per line type x side: logit p'' = a + s x logit p' (s < 1 = the ladder's tails too sharp once centred).
  L3  the leg's own residual by prop x line type x side (anchored recalibration of research_recalibration_v3.py, cell shrunk by
      n / (n + 400)) - what is left after L1 + L2.
Reported per stage: log-loss, calibration error, the top end (p >= .58: n, mean p, hit), and the discrimination (AUC) of bh, fh,
L1, L1+L2 - by line type. Plus a sanity line: |bh - ladder p at the leg's line| (bh must be the ladder read at that line).
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
    S = np.array([r[0] for r in rows]); MO = np.array([f"{r[1].year}-{r[1].month:02d}" for r in rows]); P = np.array([r[2] for r in rows])
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

    def report(tag, tr, te):
        wp, p1, p2, p3 = chain(tr, te)
        print(f"\n  {tag}: train {int(tr.sum()):,} legs, test {int(te.sum()):,}; L1 w per prop: " + ", ".join(f"{k} {v}" for k, v in wp.items()))
        res = {}
        for name, p in (("bh", BH), ("fh (today)", FH), ("L1 board-centred", p1), ("L1+L2 spread", p2), ("L1+L2+L3 residual", p3)):
            res[name] = ll(p[te], Y[te])
            print(f"    {name:<20} ll {res[name]:.4f} ece {ece(p[te], Y[te]):.4f} auc {auc(p[te], Y[te]):.3f} {top(p[te], Y[te])}")
            for lt in ("R", "G1", "G2", "G3", "D1", "D2", "D3"):
                for side in ("Over", "Under"):
                    m = te & (LT == lt) & (SD == side)
                    if m.sum() < 300:
                        continue
                    print(f"        {lt:<3} {side:<5} n {int(m.sum()):>7} ll {ll(p[m], Y[m]):.4f} ece {ece(p[m], Y[m]):.4f} "
                          f"auc {auc(p[m], Y[m]):.3f} {top(p[m], Y[m])}")
        return res

    print("\n" + "=" * 130 + "\nSTAGE 1 - SAMPLE: 2025-26 first half -> second half")
    s26 = S == "2025-26"
    days = np.array([r[1] for r in rows])
    cut = np.sort(np.unique(days[s26]))[len(np.unique(days[s26])) // 2]
    report("2025-26 H1 -> H2", s26 & (days < cut), s26 & (days >= cut))
    print("\n" + "=" * 130 + "\nSTAGE 2 - SEASON -> SEASON")
    gate = defaultdict(list)
    for a, b in (SEASONS, SEASONS[::-1]):
        r = report(f"{a} -> {b}", S == a, S == b)
        for k, v in r.items():
            gate[k].append(v)
    print("\n" + "=" * 130 + "\nSTAGE 3 - LEAVE ONE MONTH OUT (pooled)")
    agg = defaultdict(lambda: [0.0, 0])
    wins = defaultdict(int); months = 0
    for mo in sorted(set(MO)):
        te = MO == mo
        if te.sum() < 2000:
            continue
        months += 1
        _, p1, p2, p3 = chain(~te, te)
        base = ll(FH[te], Y[te])
        for name, p in (("fh (today)", FH), ("L1", p1), ("L1+L2", p2), ("L1+L2+L3", p3)):
            v = ll(p[te], Y[te])
            agg[name][0] += v * te.sum(); agg[name][1] += te.sum()
            if name != "fh (today)" and v < base - 1e-5:
                wins[name] += 1
    for name, (s_, n) in agg.items():
        extra = "" if name == "fh (today)" else f"  beats today's fh in {wins[name]}/{months} months"
        print(f"    {name:<12} pooled ll {s_ / n:.4f}{extra}")


if __name__ == "__main__":
    main()
