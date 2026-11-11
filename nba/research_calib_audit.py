#!/usr/bin/env python3
"""RESEARCH - CALIBRATION AUDIT of final_hp / score / confidence on the live engine's own board (2026-11-10, owner: "be very granular:
overall groups, prop lines, players, 1% by 1% ... the same for the scoring ... is the confidence helping the score or damaging it ...
you have market data, dissect where calibration fails"). READ-ONLY.

Board / grader: live_slip_engine.load_board_legs_live (12 calibrated props), graded on the box score, per period 2024-25 / 2025-26 / 2026-27.
  A  per period x line type x side x EVERY prop: n, mean final_hp, hit, gap (hit - mean), slope
  B  standard lines in 1-point bins of final_hp (every bin with n >= 60), per period x side
  C  this season by calendar week (standard lines)
  D  ranking power: top 10 / 25 / 100 standard legs a slate by final_hp vs by score (final_hp lifted by confidence) vs all standard legs
  E  confidence: within final_hp bands, hit by confidence tercile; corr(confidence, hit residual)
  F  per prop x 5-point bands (standard lines, n >= 80)
  G  players: per period, the spread of player-level gaps (z-scores; sd 1 = no player effect) and persistence of the gap between periods
  H  market: standard legs the books price at PrizePicks' exact line - logistic hit ~ logit(final_hp) + logit(no-vig); log-loss of each; disagreement bins
Env: DATABASE_URL.
"""
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import live_slip_engine as L                         # noqa: E402
import portfolio_b as PB                             # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import ud_portfolio_c as UPC                         # noqa: E402
from final_hp_board_cal import PROPS as CAL_PROPS    # noqa: E402

T0 = time.time()
PERIODS = ("2024-25", "2025-26", "2026-27")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lg(x):
    x = min(max(float(x), 1e-4), 1 - 1e-4)
    return math.log(x / (1 - x))


def fit(X, y, iters=50):
    X = np.column_stack([np.ones(len(y)), X])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-9
        step = np.linalg.solve(X.T @ (X * w[:, None]) + 1e-6 * np.eye(X.shape[1]), X.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def ll(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def kind(t):
    return "R" if t == "R" else "G" if str(t).startswith("G") else "D"


def load(conn):
    days = AF.slate_days(conn)
    use = [(AF.season_of(d), d) for d in days if AF.season_of(d) in PERIODS]
    out = []
    for i, (s, d) in enumerate(use):
        rows = L.load_board_legs_live(conn, d)
        legs = [l for l in rows if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None
                and l["prop"] in CAL_PROPS and l.get("team_id") is not None]
        if not legs:
            continue
        st = AF.box(conn, d)
        if not st:
            continue
        fair = UPC.consensus(conn, d)
        sc = {}
        for pid, prop, line, side, conf, score in conn.execute(
                "SELECT player_id::text, prop, line::float8, side, confidence::float8, score::float8 FROM nba_score.final_hp "
                "WHERE game_date=%s AND final_hp IS NOT NULL", (d,)).fetchall():
            sc[(pid, prop, line, str(side)[:1].upper())] = (conf, score)
        keep = []
        for l in legs:
            h = AF.outcome(st, l)
            pid = str(l["player_id"])
            cs = sc.get((pid, l["prop"], float(l["line"]), str(l["side"])[:1].upper()))
            po = fair.get((pid, l["prop"], float(l["line"])))
            nv = None
            if po is not None and 0.03 < po < 0.97:
                nv = po if l["side"] == "Over" else 1 - po
            keep.append({"player": l["player"], "pid": pid, "prop": l["prop"], "k": kind(l["tier"]), "side": l["side"], "line": float(l["line"]),
                         "fh": float(l["score"]), "hit": h, "event_id": l["event_id"], "grp": PB.GRP.get(l["prop"]),
                         "conf": cs[0] if cs else None, "sc": cs[1] if cs else None, "nv": nv})
        out.append((s, d, keep))
        if i % 25 == 0:
            log(f"loaded {i + 1}/{len(use)} {d}: {len(keep)} legs")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


def line_stats(legs):
    g = [l for l in legs if l["hit"] is not None]
    if len(g) < 60:
        return None
    x = np.array([l["fh"] for l in g]); y = np.array([l["hit"] for l in g], float)
    b = fit(np.array([[lg(v)] for v in x]), y)
    return len(g), x.mean(), y.mean(), y.mean() - x.mean(), b[1]


def fmt(name, st):
    if st is None:
        return
    n, m, h, gap, sl = st
    print(f"    {name:<46} n {n:7,d} mean {m:.3f} hit {h:.3f} gap {100 * gap:+5.1f} pts slope {sl:.2f}", flush=True)


def std(slates, s):
    return [l for ss, _d, ls in slates if ss == s for l in ls if l["k"] == "R" and l["hit"] is not None]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = load(conn)
    conn.close()
    log("slates: " + ", ".join(f"{s} {sum(1 for x in slates if x[0] == s)}" for s in PERIODS))
    props = sorted({l["prop"] for _s, _d, ls in slates for l in ls})

    print("\n" + "=" * 150 + "\nPART A - per period x line type x side x prop (gap = hit - mean final_hp, negative = over-confident)")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls]
        print(f"  {s}")
        for k in ("R", "G", "D"):
            for sd in ("Over", "Under"):
                fmt(f"{k} {sd} ALL", line_stats([l for l in g if l["k"] == k and l["side"] == sd]))
        for p in props:
            for sd in ("Over", "Under"):
                fmt(f"R {sd} {p}", line_stats([l for l in g if l["k"] == "R" and l["side"] == sd and l["prop"] == p]))

    print("\n" + "=" * 150 + "\nPART B - standard lines, 1-point bins of final_hp (n >= 60)")
    for s in PERIODS:
        for sd in ("Over", "Under", "Both"):
            g = [l for l in std(slates, s) if sd == "Both" or l["side"] == sd]
            print(f"  {s} {sd} (n {len(g):,})")
            line = []
            for b in range(35, 99):
                lo, hi = b / 100.0, (b + 1) / 100.0
                m = [l for l in g if lo <= l["fh"] < hi]
                if len(m) >= 60:
                    line.append(f"{b}:{len(m)}:{np.mean([l['hit'] for l in m]) - np.mean([l['fh'] for l in m]):+.3f}")
            print("    bin:n:gap  " + " ".join(line))

    print("\n" + "=" * 150 + "\nPART C - this season by calendar week, standard lines")
    import datetime as dt
    wk = defaultdict(list)
    for s, d, ls in slates:
        if s == "2026-27":
            dd = d if isinstance(d, dt.date) else dt.date.fromisoformat(str(d)[:10])
            wk[(dd - dt.date(2026, 10, 19)).days // 7].append(ls)
    for w in sorted(wk):
        for sd in ("Over", "Under"):
            fmt(f"week {w} {sd}", line_stats([l for ls in wk[w] for l in ls if l["k"] == "R" and l["side"] == sd]))

    print("\n" + "=" * 150 + "\nPART D - ranking power: top-N standard legs a slate by final_hp vs by score (confidence-lifted) vs all")
    for s in PERIODS:
        for sd in ("Over", "Under", "Both"):
            allh, tf, ts = [], {10: [], 25: [], 100: []}, {10: [], 25: [], 100: []}
            for ss, _d, ls in slates:
                if ss != s:
                    continue
                g = [l for l in ls if l["k"] == "R" and l["hit"] is not None and (sd == "Both" or l["side"] == sd)]
                allh += [l["hit"] for l in g]
                a = sorted(g, key=lambda l: -l["fh"])
                b = sorted([l for l in g if l["sc"] is not None], key=lambda l: -l["sc"])
                for t in tf:
                    tf[t] += [l["hit"] for l in a[:t]]
                    ts[t] += [l["hit"] for l in b[:t]]
            print(f"  {s} {sd}: all {np.mean(allh):.3f} (n {len(allh):,}) | " + " | ".join(
                f"top{t} fh {np.mean(tf[t]):.3f} / score {np.mean(ts[t]) if ts[t] else float('nan'):.3f}" for t in tf if tf[t]))

    print("\n" + "=" * 150 + "\nPART E - confidence: within final_hp bands, hit by confidence tercile (standard lines)")
    for s in PERIODS:
        g = [l for l in std(slates, s) if l["conf"] is not None and l["fh"] >= 0.5]
        print(f"  {s}: n {len(g):,}; corr(conf, hit - fh) = {np.corrcoef([l['conf'] for l in g], [l['hit'] - l['fh'] for l in g])[0, 1]:+.4f}" if len(g) > 100 else f"  {s}: n {len(g)}")
        for lo, hi in ((0.50, 0.55), (0.55, 0.60), (0.60, 0.65), (0.65, 0.70), (0.70, 0.80), (0.80, 1.01)):
            m = sorted([l for l in g if lo <= l["fh"] < hi], key=lambda l: l["conf"])
            if len(m) < 150:
                continue
            t = len(m) // 3
            parts = []
            for nm, seg in (("low", m[:t]), ("mid", m[t:2 * t]), ("high", m[2 * t:])):
                parts.append(f"{nm} conf {np.mean([l['conf'] for l in seg]):.3f} n{len(seg)} hit {np.mean([l['hit'] for l in seg]):.3f} gap {np.mean([l['hit'] - l['fh'] for l in seg]):+.3f}")
            print(f"    fh {lo:.2f}-{hi:.2f}: " + " | ".join(parts))
    for s in PERIODS:
        g = [l for l in std(slates, s) if l["conf"] is not None and l["sc"] is not None]
        if len(g) > 500:
            y = np.array([l["hit"] for l in g], float)
            print(f"  {s}: log-loss final_hp {ll(np.array([l['fh'] for l in g]), y):.4f} | score/100 {ll(np.clip(np.array([l['sc'] for l in g]) / 100.0, 0.001, 0.999), y):.4f}"
                  f" | logistic hit ~ logit(fh) + conf: coef {np.round(fit(np.array([[lg(l['fh']), l['conf']] for l in g]), y), 3).tolist()}")

    print("\n" + "=" * 150 + "\nPART F - per prop x 5-point bands of final_hp, standard lines (n >= 80): mean -> hit")
    for s in PERIODS:
        g = std(slates, s)
        print(f"  {s}")
        for p in props:
            parts = []
            for lo in np.arange(0.40, 0.95, 0.05):
                m = [l for l in g if l["prop"] == p and lo <= l["fh"] < lo + 0.05]
                if len(m) >= 80:
                    parts.append(f"{lo:.2f}: n{len(m)} {np.mean([l['fh'] for l in m]):.3f}->{np.mean([l['hit'] for l in m]):.3f}")
            if parts:
                print(f"    {p:<14} " + " ; ".join(parts))

    print("\n" + "=" * 150 + "\nPART G - players: spread of player-level gaps and persistence (standard lines)")
    pg = {}
    for s in PERIODS:
        by = defaultdict(list)
        for l in std(slates, s):
            by[l["pid"]].append(l)
        zs, gaps = [], {}
        for pid, ls in by.items():
            if len(ls) < 25:
                continue
            p = np.array([l["fh"] for l in ls]); y = np.array([l["hit"] for l in ls], float)
            se = math.sqrt(float(np.sum(p * (1 - p)))) / len(ls)
            zs.append((y.mean() - p.mean()) / se)
            gaps[pid] = (y.mean() - p.mean(), len(ls), ls[0]["player"])
        pg[s] = gaps
        if zs:
            print(f"  {s}: players with >= 25 legs {len(zs)}; z of gap: mean {np.mean(zs):+.2f} sd {np.std(zs):.2f} (sd 1.00 = no player effect); |z| > 2: {sum(abs(z) > 2 for z in zs)} ({100 * np.mean([abs(z) > 2 for z in zs]):.1f}%, 4.6% expected)")
    for a, b in (("2024-25", "2025-26"), ("2025-26", "2026-27"), ("2024-25", "2026-27")):
        common = [p for p in pg[a] if p in pg[b] and pg[a][p][1] >= 30 and pg[b][p][1] >= 15]
        if len(common) > 20:
            print(f"  persistence {a} -> {b}: {len(common)} players, corr of gaps {np.corrcoef([pg[a][p][0] for p in common], [pg[b][p][0] for p in common])[0, 1]:+.3f}")
    gs = sorted([(v[0], v[1], v[2]) for v in pg["2026-27"].values() if v[1] >= 15])
    print("  this season, most over-rated (final_hp too high):  " + "; ".join(f"{n} {g * 100:+.0f}pts n{k}" for g, k, n in gs[:12]))
    print("  this season, most under-rated (final_hp too low): " + "; ".join(f"{n} {g * 100:+.0f}pts n{k}" for g, k, n in gs[-12:]))

    print("\n" + "=" * 150 + "\nPART H - the market at PrizePicks' exact line (standard legs with a books no-vig)")
    for s in PERIODS:
        g = [l for l in std(slates, s) if l["nv"] is not None]
        if len(g) < 500:
            print(f"  {s}: only {len(g)} legs with a book price")
            continue
        y = np.array([l["hit"] for l in g], float)
        fh = np.array([l["fh"] for l in g]); nv = np.array([l["nv"] for l in g])
        b = fit(np.array([[lg(a), lg(c)] for a, c in zip(fh, nv)]), y)
        bl = 1 / (1 + np.exp(-(b[0] + b[1] * np.array([lg(a) for a in fh]) + b[2] * np.array([lg(c) for c in nv]))))
        cover = len(g) / max(1, len(std(slates, s)))
        print(f"  {s}: n {len(g):,} (coverage {100 * cover:.0f}% of standard legs) | log-loss final_hp {ll(fh, y):.4f} | no-vig {ll(nv, y):.4f} | blend {ll(bl, y):.4f}"
              f" | hit ~ {b[0]:+.2f} + {b[1]:.2f} logit(fh) + {b[2]:.2f} logit(nv)")
        for lo, hi in ((-1, -0.10), (-0.10, -0.05), (-0.05, -0.02), (-0.02, 0.02), (0.02, 0.05), (0.05, 0.10), (0.10, 1)):
            m = [l for l in g if lo <= l["fh"] - l["nv"] < hi]
            if len(m) >= 80:
                print(f"      fh - nv in [{lo:+.2f},{hi:+.2f}): n {len(m):5d} fh {np.mean([l['fh'] for l in m]):.3f} nv {np.mean([l['nv'] for l in m]):.3f} hit {np.mean([l['hit'] for l in m]):.3f}")
    log("DONE")


if __name__ == "__main__":
    main()
