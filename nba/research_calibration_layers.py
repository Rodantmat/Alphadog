#!/usr/bin/env python3
"""
RESEARCH - WHICH LAYER CARRIES THE MISCALIBRATION? (2026-10-22 PT; owner 17:49 PT: "proper calibrate our demons, understand why they
are so off and fix it, same for all other prop lines"; 18:02 PT: "the fix can be granulated and spread in different layers of the
system, so act properly"). READ-ONLY.

research_calibration_audit.py (run 39880546631) showed final_hp too spread on every line type, already in the baseline (bh ~ fh).
research_recalibration_v3.py (run 39881111672) showed an anchored per-cell recalibration fixes it out of sample. This script splits
the error by layer so each part is fixed where it is made:

  L1 MEAN   - the baseline's projected mean (proj_min x rate36 / 36, nba_score.baseline_history) vs PrizePicks' standard line (L0)
              vs the realised stat (nba_stats.player_game_log). Per prop x season: MAE of proj, of L0, and the best blend
              w (actual ~ w * proj + (1 - w) * L0, least squares through the two). w well below 1 = our mean's disagreement with
              the board is overstated -> fix in the baseline (shrink the mean toward the board line).
  L1b       - hit vs baseline_hp by the signed disagreement g = side_sign x (proj - L0) / sqrt(max(L0, 1)), per line type:
              logistic hit ~ logit(bh) + g. A negative g coefficient = the baseline over-trusts its disagreement with the board.
  L2 SHAPE  - with the mean term in, what remains by rung distance from the standard line (line - L0, in sqrt(L0) units) per line
              type: logistic hit ~ logit(bh) + g + dist. A dist term that is still large = the ladder's tail shape (spread) is off
              -> fix in the ladder / as-of calibration keyed by rung distance.
  L3 ASOF   - the as-of calibration's contribution: calibration error of bh vs fh per line type (did it help or hurt?).
Each fit is train 2024-25 -> test 2025-26 and back; reported: log-loss of bh alone, + g, + g + dist, and the coefficients.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

SEASONS = ("2024-25", "2025-26")
STAT = {"points": ("pts",), "rebounds": ("reb",), "assists": ("ast",), "threes_made": ("fg3m",), "steals": ("stl",),
        "blocks": ("blk",), "turnovers": ("tov",), "stocks": ("stl", "blk"), "pra": ("pts", "reb", "ast"),
        "pts_reb": ("pts", "reb"), "pts_ast": ("pts", "ast"), "reb_ast": ("reb", "ast")}
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


def lt_of(t):
    return "R" if t == "R" else str(t)[:2]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    actual = {}
    for row in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log
                               WHERE game_date >= '2024-09-01'""").fetchall():
        pid, d = row[0], row[1]
        try:
            v = dict(zip(("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"), (float(x) if x is not None else None for x in row[2:])))
        except ValueError:
            continue
        actual[(pid, d)] = v
    proj = {}
    for pid, d, pr, pm, r36 in conn.execute("""SELECT player_id, game_date, prop, proj_min::float8, rate36::float8
                                              FROM nba_score.baseline_history WHERE season = ANY(%s) AND ladder_offset = 0
                                              AND upper(coalesce(period, 'FULL')) = 'FULL'""", (list(SEASONS),)):
        if pm is not None and r36 is not None:
            proj[(pid, d, pr)] = pm * r36 / 36.0
    print(f"player-games with stats {len(actual):,}; baseline projections {len(proj):,}", flush=True)

    legs = {}
    for season, d, rk, nn, pr, sd, ln, t, sc, h, fac in conn.execute(
            """SELECT season, game_date, rank_key, nba_ref.norm_name(player), prop, side, line::float8, tier, score, hit, factor
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL
               AND rank_key IN ('final_hp', 'baseline_hp')""", (list(SEASONS),)):
        if pr not in STAT:
            continue
        k = (season, d, nn, pr, sd, round(ln, 1), t)
        l = legs.setdefault(k, {"hit": int(h), "fac": float(fac or 1.0)})
        l["fh" if rk == "final_hp" else "bh"] = float(sc)
    std_line = {}
    for (s, d, nn, pr, sd, ln, t) in legs:
        if t == "R":
            std_line[(s, d, nn, pr)] = ln
    rows = []
    miss = defaultdict(int)
    for (s, d, nn, pr, sd, ln, t), v in legs.items():
        if "fh" not in v or "bh" not in v:
            miss["no fh/bh"] += 1; continue
        pid = name_pid.get(nn)
        L0 = std_line.get((s, d, nn, pr))
        pj = proj.get((pid, d, pr)) if pid else None
        a = actual.get((pid, d)) if pid else None
        if L0 is None:
            miss["no standard line"] += 1; continue
        if pj is None:
            miss["no projection"] += 1; continue
        av = None
        if a is not None and all(a.get(c) is not None for c in STAT[pr]):
            av = sum(a[c] for c in STAT[pr])
        rows.append((s, pr, sd, lt_of(t), ln, L0, pj, av, v["bh"], v["fh"], v["hit"]))
    print(f"legs joined {len(rows):,}; dropped " + ", ".join(f"{k} {n:,}" for k, n in miss.items()), flush=True)
    S = np.array([r[0] for r in rows]); P = np.array([r[1] for r in rows]); SD = np.array([r[2] for r in rows])
    LT = np.array([r[3] for r in rows]); LN = np.array([r[4] for r in rows], float); L0 = np.array([r[5] for r in rows], float)
    PJ = np.array([r[6] for r in rows], float); AV = np.array([np.nan if r[7] is None else r[7] for r in rows], float)
    BH = np.array([r[8] for r in rows], float); FH = np.array([r[9] for r in rows], float); Y = np.array([r[10] for r in rows], float)
    sign = np.where(SD == "Over", 1.0, -1.0)
    scale = np.sqrt(np.maximum(L0, 1.0))
    G = sign * (PJ - L0) / scale             # our disagreement with the board, in the leg's favour
    DIST = sign * (LN - L0) / scale          # how far the leg's line sits from the standard line against the leg (+ = harder)

    print("\n" + "=" * 130 + "\nL1 MEAN - projection vs PrizePicks' standard line vs the realised stat (one row per player-game-prop, standard legs)")
    for s in SEASONS:
        for pr in sorted(STAT):
            m = (S == s) & (P == pr) & (LT == "R") & (SD == "Over") & ~np.isnan(AV)
            if m.sum() < 300:
                continue
            a, pj, l0 = AV[m], PJ[m], L0[m]
            dp, dl = pj - l0, a - l0
            w = float((dp @ dl) / (dp @ dp)) if (dp @ dp) > 0 else float("nan")
            blend = l0 + w * dp
            print(f"  {s} {pr:<12} n{int(m.sum()):>6}  MAE proj {np.mean(np.abs(a - pj)):.3f}  board {np.mean(np.abs(a - l0)):.3f}  "
                  f"blend {np.mean(np.abs(a - blend)):.3f}  w (trust in our disagreement) {w:+.3f}  mean proj-board {dp.mean():+.3f}  "
                  f"mean actual-board {dl.mean():+.3f}")

    print("\n" + "=" * 130 + "\nL1b / L2 - per line type, train one season -> test the other: hit ~ logit(bh) [+ g] [+ dist]")
    for lt in ("R", "G1", "G2", "G3", "D1", "D2", "D3"):
        for side in ("Over", "Under"):
            for a, b in (SEASONS, SEASONS[::-1]):
                tr = (S == a) & (LT == lt) & (SD == side); te = (S == b) & (LT == lt) & (SD == side)
                if tr.sum() < 500 or te.sum() < 500:
                    continue
                out = [f"  {lt:<3} {side:<5} {a}->{b} n{int(te.sum()):>7}  raw bh ll {ll(BH[te], Y[te]):.4f} ece {ece(BH[te], Y[te]):.3f} | "
                       f"fh ll {ll(FH[te], Y[te]):.4f} ece {ece(FH[te], Y[te]):.3f}"]
                for tag, cols in (("bh", lambda m: [logit(BH[m])]), ("bh+g", lambda m: [logit(BH[m]), G[m]]),
                                  ("bh+g+dist", lambda m: [logit(BH[m]), G[m], DIST[m]])):
                    Xtr = np.column_stack([np.ones(tr.sum())] + cols(tr)); Xte = np.column_stack([np.ones(te.sum())] + cols(te))
                    beta = fit_logistic(Xtr, Y[tr])
                    p = sig(Xte @ beta)
                    out.append(f"{tag} ll {ll(p, Y[te]):.4f} ece {ece(p, Y[te]):.3f} coef " + "/".join(f"{x:+.2f}" for x in beta))
                print(" | ".join(out), flush=True)

    print("\n" + "=" * 130 + "\nL1b DETAIL - hit vs bh by our disagreement with the board (g terciles), line type x side, both seasons pooled")
    for lt in ("R", "G1", "G2", "D1", "D2", "D3"):
        for side in ("Over", "Under"):
            m = (LT == lt) & (SD == side)
            if m.sum() < 1000:
                continue
            q = np.quantile(G[m], [0.1, 0.5, 0.9])
            parts = []
            for lab, sel in (("g<p10", G < q[0]), ("p10-50", (G >= q[0]) & (G < q[1])), ("p50-90", (G >= q[1]) & (G < q[2])), ("g>=p90", G >= q[2])):
                mm = m & sel
                parts.append(f"{lab} n{int(mm.sum())} bh {BH[mm].mean():.3f} hit {Y[mm].mean():.3f}")
            print(f"  {lt:<3} {side:<5} " + " | ".join(parts))
    print("\nL2 DETAIL - demons/goblins: hit vs bh by distance from the standard line (sqrt-units), Over")
    for lt in ("G1", "G2", "G3", "D1", "D2", "D3"):
        m = (LT == lt) & (SD == "Over")
        if m.sum() < 1000:
            continue
        q = np.quantile(np.abs(DIST[m]), [0.33, 0.67])
        parts = []
        for lab, sel in (("near", np.abs(DIST) < q[0]), ("mid", (np.abs(DIST) >= q[0]) & (np.abs(DIST) < q[1])), ("far", np.abs(DIST) >= q[1])):
            mm = m & sel
            parts.append(f"{lab} n{int(mm.sum())} |dist| {np.abs(DIST[mm]).mean():.2f} bh {BH[mm].mean():.3f} fh {FH[mm].mean():.3f} hit {Y[mm].mean():.3f}")
        print(f"  {lt:<3} " + " | ".join(parts))


if __name__ == "__main__":
    main()
