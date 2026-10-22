#!/usr/bin/env python3
"""
RESEARCH - IS ANY UNDERDOG STRATEGY POSITIVE UNDER TODAY'S EXCHANGE PRICING? (2026-10-22 PT; owner 09:12 PT: "Underdog, see if
there is anything that's proven to be positive ... deep scrutiny and alternatives, improvements, other logics, other compositions").
READ-ONLY.

PRICING (measured 2026-10-21, PP_PAYOUT_FINDINGS §0p): every Underdog pick now carries its own payout modifier m = 0.5 x the
exchange decimal; against DraftKings / Bovada no-vig m x p_nv ~ K = 0.465 (median of 388 matched sides). History paid 1.00 on mains.
So a leg returns r = hit x m and a Standard n-pick pays STD[n] x prod(m) when all hit: the break-even per-leg return is
STD[n]^(-1/n) = 0.535 (2) / 0.536 (3) / 0.537 (4) / 0.549 (5) / 0.553 (6). At fair odds r = 0.465 -> every leg starts 7% behind.
An edge now needs OUR probability to beat the MARKET's, not 0.5.

DATA. Every Underdog window-board leg of the two certified seasons (nba_score.ud_tier_map_legs_curr_mf, rank_key final_hp =
the market-free model probability, real outcome, voids out) joined to nba_score.ud_window_legs_curr (event, the books' no-vig
for that side at that line). Final 7 days of each season out (as every backtest). m_now = round(K / nv, 2) x HC.

PART A - legs. 1) logistic fit hit ~ logit(p_model) + logit(nv) per season and kind: does the model carry information the
market does not (coefficient on p_model > 0, significant)? 2) out-of-season calibrated p_hat (fit on the OTHER season) and the
realised return per bucket of r_hat = p_hat x m_now.
PART B - slips. Per day: one side per line (the better r_hat), one leg per player, distinct games inside a slip, k disjoint
slips. Rankers: pm (r_hat, price-aware), edge (p_hat - nv), p (raw model p, price-blind - today's engine logic); a floor on
r_hat; kinds main / alt / both; Standard 2-6 and Flex 3-6; k 1-3. Payout = build_ud_slip_engine.grade (floor2, 4F 7.2) on
m_now. ROI per season with a day bootstrap (2,000; 5th percentile). Also the same slips at the historic price (m = the stored
factor) as the reference the old backtests measured.
Env: DATABASE_URL, UP_K (0.465), UP_HC (0.995), UP_BOOT (2000), UP_TOP (60).
"""
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_slip_engine as E   # noqa: E402

K = float(os.environ.get("UP_K") or "0.465")
HC = float(os.environ.get("UP_HC") or "0.995")
BOOT = int(os.environ.get("UP_BOOT") or "2000")
TOP = int(os.environ.get("UP_TOP") or "60")
SEASONS = ("2024-25", "2025-26")


def logit(x):
    x = np.clip(np.asarray(x, dtype=float), 1e-4, 1 - 1e-4)
    return np.log(x / (1 - x))


def fit_logistic(X, y, iters=30):
    """IRLS; returns coefficients and their standard errors"""
    X = np.column_stack([np.ones(len(y)), X])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        z = X @ b
        p = 1 / (1 + np.exp(-z))
        w = p * (1 - p) + 1e-9
        H = X.T @ (X * w[:, None])
        g = X.T @ (y - p)
        step = np.linalg.solve(H, g)
        b += step
        if np.max(np.abs(step)) < 1e-8:
            break
    cov = np.linalg.inv(H)
    return b, np.sqrt(np.diag(cov))


def predict(b, X):
    X = np.column_stack([np.ones(len(X)), X])
    return 1 / (1 + np.exp(-(X @ b)))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    rows = conn.execute("""
        SELECT t.season, t.game_date, t.player, t.prop, t.side, t.line::float8, t.kind, t.score::float8, t.hit, t.factor::float8,
               w.nv_side::float8, w.event_id
        FROM nba_score.ud_tier_map_legs_curr_mf t
        JOIN (SELECT DISTINCT ON (game_date, pn, prop, side, line) game_date, pn, prop, side, line, nv_side, event_id
              FROM nba_score.ud_window_legs_curr ORDER BY game_date, pn, prop, side, line) w
          ON w.game_date = t.game_date AND w.pn = t.player AND w.prop = t.prop AND w.side = t.side AND w.line = t.line
        WHERE t.rank_key = 'final_hp' AND t.hit IS NOT NULL AND t.season IN ('2024-25', '2025-26')""").fetchall()
    print(f"legs joined: {len(rows):,}", flush=True)
    last7 = {}
    for s in SEASONS:
        ds = sorted({r[1] for r in rows if r[0] == s})
        last7[s] = set(ds[-7:])
    legs = []
    for season, d, pl, prop, side, line, kind, p, hit, fac, nv, ev in rows:
        if d in last7[season]:
            continue
        legs.append({"season": season, "d": d, "player": pl, "prop": prop, "side": side, "line": line, "kind": kind, "p": p,
                     "hit": int(hit), "fac": fac, "nv": nv, "ev": ev})
    with_nv = [l for l in legs if l["nv"] and 0.02 < l["nv"] < 0.98 and l["ev"]]
    print(f"legs (final 7 days out): {len(legs):,} | with a books no-vig and a game: {len(with_nv):,}", flush=True)
    for l in with_nv:
        l["m_now"] = round(K / l["nv"], 2) * HC

    # ---------------- PART A: does the model know something the market does not? ----------------
    print("\nPART A1 - logistic hit ~ logit(p_model) + logit(nv_books)  (coef, se, z)")
    fits = {}
    for s in SEASONS:
        for kind in ("main", "alt", "all"):
            sub = [l for l in with_nv if l["season"] == s and (kind == "all" or l["kind"] == kind)]
            if len(sub) < 1000:
                continue
            X = np.column_stack([logit([l["p"] for l in sub]), logit([l["nv"] for l in sub])])
            y = np.array([l["hit"] for l in sub], dtype=float)
            b, se = fit_logistic(X, y)
            Xm = logit([l["nv"] for l in sub])[:, None]
            bm, _ = fit_logistic(Xm, y)
            pm = predict(b, X)
            pmk = predict(bm, Xm)
            ll = lambda pp: float(np.mean(y * np.log(pp) + (1 - y) * np.log(1 - pp)))
            print(f"  {s} {kind:<4} n {len(sub):>7,} | b_model {b[1]:+.3f} (z {b[1] / se[1]:+.1f}) | b_market {b[2]:+.3f} (z {b[2] / se[2]:+.1f})"
                  f" | logloss market-only {-ll(pmk):.5f} -> both {-ll(pm):.5f} | hit {y.mean():.4f} mean nv {np.mean([l['nv'] for l in sub]):.4f}")
            if kind == "all":
                fits[s] = b
    # out-of-season calibrated p_hat
    for l in with_nv:
        other = SEASONS[1] if l["season"] == SEASONS[0] else SEASONS[0]
        b = fits[other]
        z = b[0] + b[1] * float(logit([l["p"]])[0]) + b[2] * float(logit([l["nv"]])[0])
        l["ph"] = 1 / (1 + math.exp(-z))
        l["rh"] = l["ph"] * l["m_now"]
        l["edge"] = l["ph"] - l["nv"]

    print("\nPART A2 - realised leg return at today's price by predicted return r_hat = p_hat x m_now (out-of-season p_hat)")
    print("  break-even per leg: 2S 0.535 | 3S 0.536 | 4S 0.537 | 5S 0.549 | 6S 0.553")
    edges = [0, 0.40, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 9]
    for s in SEASONS:
        for kind in ("main", "alt"):
            print(f"  {s} {kind}")
            for lo, hi in zip(edges[:-1], edges[1:]):
                sub = [l for l in with_nv if l["season"] == s and l["kind"] == kind and lo <= l["rh"] < hi]
                if len(sub) < 50:
                    continue
                r = np.mean([l["hit"] * l["m_now"] for l in sub])
                print(f"    r_hat {lo:.2f}-{hi if hi < 9 else 'up':<4}  n {len(sub):>7,}  mean r_hat {np.mean([l['rh'] for l in sub]):.4f}"
                      f"  realised r {r:.4f}  hit {np.mean([l['hit'] for l in sub]):.4f}  mean m {np.mean([l['m_now'] for l in sub]):.3f}"
                      f"  Under share {np.mean([str(l['side']).lower().startswith('u') for l in sub]):.2f}")

    # ---------------- PART B: slips ----------------
    byday = defaultdict(list)
    for l in with_nv:
        byday[(l["season"], l["d"])].append(l)
    # one side per line: keep the side with the better r_hat (ranker-specific choice made below on the same candidate set)
    configs = []
    for ranker in ("pm", "edge", "p"):
        floors = (None, 0.50, 0.52, 0.535, 0.55, 0.57) if ranker == "pm" else (None,)
        for floor in floors:
            for kind in ("main", "alt", "both"):
                for n in (2, 3, 4, 5, 6):
                    for structure in ("standard", "flex"):
                        if structure == "flex" and n < 3:
                            continue
                        for kslips in (1, 2, 3):
                            configs.append((ranker, floor, kind, n, structure, kslips))
    keyf = {"pm": lambda l: l["rh"], "edge": lambda l: l["edge"], "p": lambda l: l["p"]}
    day_pick = {}
    for ranker in ("pm", "edge", "p"):
        f = keyf[ranker]
        for kind in ("main", "alt", "both"):
            for dk, ls in byday.items():
                best = {}
                for l in ls:
                    if kind != "both" and l["kind"] != kind:
                        continue
                    key = (l["player"], l["prop"], l["line"])
                    if key not in best or f(l) > f(best[key]):
                        best[key] = l
                day_pick[(ranker, kind, dk)] = sorted(best.values(), key=f, reverse=True)
    season_days = {s: sorted(d for (ss, d) in byday if ss == s) for s in SEASONS}
    day_ix = {s: {d: i for i, d in enumerate(season_days[s])} for s in SEASONS}
    rng = np.random.default_rng(7)
    boot_ix = {s: rng.integers(0, len(season_days[s]), size=(BOOT, len(season_days[s]))) for s in SEASONS}
    results = []
    for cfg in configs:
        ranker, floor, kind, n, structure, kslips = cfg
        arr = {s: np.zeros((3, len(season_days[s]))) for s in SEASONS}   # stake, pay_now, pay_hist per day
        for dk in byday:
            s, d = dk
            cands = day_pick[(ranker, kind, dk)]
            if floor is not None:
                cands = [l for l in cands if l["rh"] >= floor]
            used_players = set()
            for _ in range(kslips):
                slip, games = [], set()
                for l in cands:
                    if l["player"] in used_players or l["ev"] in games:
                        continue
                    slip.append(l)
                    games.add(l["ev"])
                    if len(slip) == n:
                        break
                if len(slip) < n:
                    break
                used_players |= {l["player"] for l in slip}
                i = day_ix[s][d]
                arr[s][0, i] += 1
                arr[s][1, i] += E.grade([{"hit": l["hit"], "factor": l["m_now"]} for l in slip], structure)[1]
                arr[s][2, i] += E.grade([{"hit": l["hit"], "factor": l["fac"]} for l in slip], structure)[1]
        out = {"cfg": cfg}
        for s in SEASONS:
            a = arr[s]
            st = a[0].sum()
            if st < 30:
                out[s] = None
                continue
            roi = a[1].sum() / st - 1
            roi_h = a[2].sum() / st - 1
            bst = a[0][boot_ix[s]].sum(1)
            bpay = a[1][boot_ix[s]].sum(1)
            boots = np.sort(np.where(bst > 0, bpay / np.maximum(bst, 1e-9) - 1, 0))
            out[s] = (int(st), int((a[0] > 0).sum()), roi, float(boots[int(0.05 * BOOT)]), roi_h)
        results.append(out)
    ok = [r for r in results if r[SEASONS[0]] and r[SEASONS[1]]]
    print(f"\nPART B - {len(ok)} slip configurations with >= 30 slips in both seasons")
    both_pos = [r for r in ok if r[SEASONS[0]][2] > 0 and r[SEASONS[1]][2] > 0]
    both_lb = [r for r in ok if r[SEASONS[0]][3] > 0 and r[SEASONS[1]][3] > 0]
    print(f"  ROI > 0 in both seasons: {len(both_pos)} | 5th-percentile ROI > 0 in both seasons: {len(both_lb)}")

    def line(r):
        ranker, floor, kind, n, structure, kslips = r["cfg"]
        a, b = r[SEASONS[0]], r[SEASONS[1]]
        return (f"  {ranker:<4} floor {('-' if floor is None else f'{floor:.3f}'):<5} {kind:<4} {n}{structure[0].upper()} k{kslips} | "
                f"24-25 slips {a[0]:>4} ROI {100 * a[2]:>+7.1f}% LB5 {100 * a[3]:>+7.1f}% (hist price {100 * a[4]:>+7.1f}%) | "
                f"25-26 slips {b[0]:>4} ROI {100 * b[2]:>+7.1f}% LB5 {100 * b[3]:>+7.1f}% (hist price {100 * b[4]:>+7.1f}%)")
    print("\n  TOP by the worse season's ROI:")
    for r in sorted(ok, key=lambda r: -min(r[SEASONS[0]][2], r[SEASONS[1]][2]))[:TOP]:
        print(line(r))
    print("\n  REFERENCE - price-blind ranker (today's engine logic: raw model p), main legs, at today's price:")
    for r in ok:
        if r["cfg"][0] == "p" and r["cfg"][2] == "main" and r["cfg"][5] == 1:
            print(line(r))
    print("\n  REFERENCE - price-aware ranker, no floor, both kinds, k1:")
    for r in ok:
        if r["cfg"][0] == "pm" and r["cfg"][1] is None and r["cfg"][2] == "both" and r["cfg"][5] == 1:
            print(line(r))


if __name__ == "__main__":
    main()
