#!/usr/bin/env python3
"""
RESEARCH - ROBUSTNESS OF THE PRICE-AWARE UNDERDOG RULES (2026-10-22 PT; follow-up of nba/research_ud_price_aware.py).  READ-ONLY.

research_ud_price_aware.py found (two seasons, today's exchange price m = round(0.465 / nv, 2)): the market-free model carries
information the books do not (z +19..+33), today's price-blind ranking loses in 2024-25 at every size, and ranking by the
calibrated return r_hat = p_hat x m (or the edge p_hat - nv) is positive in both seasons for many compositions. Before any of
that is trusted this checks what could make it an artefact:
  1. THE PRICE MODEL. Live, Underdog's m is not exactly K / nv: on 1,152 sides of 2026-10-20 / 21 matched to DraftKings /
     Bovada / Fliff no-vig at the same line, m x nv has mean 0.4666, sd 0.0353 (corr(m, 0.465/nv) 0.895). So every rule is
     re-run with m = round((K + e) / nv, 2), e ~ N(0, UR_SD) per leg, K in {0.455, 0.465, 0.475}, several seeds - and the rule
     SEES that m (live, the board shows it), so selection can use the dispersion.
  2. HINDSIGHT. Choosing the best of hundreds of rules on both seasons overfits. Walk-forward: rank every rule on ONE season
     (5th-percentile ROI), take its top 10, report them on the OTHER season only.
  3. CONCENTRATION. Per rule: share of profit from the best 5 days, longest losing streak in days, worst 10-day run.
Rules: ranker pm (r_hat) / edge (p_hat - nv); r_hat floor none / 0.52 / 0.535; legs main / alt / both; Standard 2-6, Flex 3-6;
k 1-3 disjoint slips a day; one leg per player, distinct games per slip; final 7 days out; p_hat = logistic(logit p_model,
logit nv) fitted on the OTHER season. Payout = build_ud_slip_engine.grade on the simulated m.
Env: DATABASE_URL, UR_SD (0.0353), UR_SEEDS (3), UR_BOOT (1000).
"""
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_slip_engine as E   # noqa: E402
from research_ud_price_aware import fit_logistic, logit   # noqa: E402

SD = float(os.environ.get("UR_SD") or "0.0353")
SEEDS = int(os.environ.get("UR_SEEDS") or "3")
BOOT = int(os.environ.get("UR_BOOT") or "1000")
HC = 0.995
SEASONS = ("2024-25", "2025-26")


def load(conn):
    rows = conn.execute("""
        SELECT t.season, t.game_date, t.player, t.prop, t.side, t.line::float8, t.kind, t.score::float8, t.hit, w.nv_side::float8, w.event_id
        FROM nba_score.ud_tier_map_legs_curr_mf t
        JOIN (SELECT DISTINCT ON (game_date, pn, prop, side, line) game_date, pn, prop, side, line, nv_side, event_id
              FROM nba_score.ud_window_legs_curr ORDER BY game_date, pn, prop, side, line) w
          ON w.game_date = t.game_date AND w.pn = t.player AND w.prop = t.prop AND w.side = t.side AND w.line = t.line
        WHERE t.rank_key = 'final_hp' AND t.hit IS NOT NULL AND t.season IN ('2024-25', '2025-26')""").fetchall()
    last7 = {s: set(sorted({r[1] for r in rows if r[0] == s})[-7:]) for s in SEASONS}
    legs = [{"season": s, "d": d, "player": pl, "prop": pr, "side": sd, "line": ln, "kind": k, "p": p, "hit": int(h), "nv": nv, "ev": ev}
            for s, d, pl, pr, sd, ln, k, p, h, nv, ev in rows if d not in last7[s] and nv and 0.02 < nv < 0.98 and ev]
    fits = {}
    for s in SEASONS:
        sub = [l for l in legs if l["season"] == s]
        X = np.column_stack([logit([l["p"] for l in sub]), logit([l["nv"] for l in sub])])
        fits[s], _ = fit_logistic(X, np.array([l["hit"] for l in sub], dtype=float))
    for l in legs:
        b = fits[SEASONS[1] if l["season"] == SEASONS[0] else SEASONS[0]]
        l["ph"] = 1 / (1 + math.exp(-(b[0] + b[1] * float(logit([l["p"]])[0]) + b[2] * float(logit([l["nv"]])[0]))))
        l["edge"] = l["ph"] - l["nv"]
    return legs


def configs():
    out = []
    for ranker in ("pm", "edge"):
        for floor in ((None, 0.52, 0.535) if ranker == "pm" else (None,)):
            for kind in ("main", "alt", "both"):
                for n in (2, 3, 4, 5, 6):
                    for st in ("standard", "flex"):
                        if st == "flex" and n < 3:
                            continue
                        for k in (1, 2, 3):
                            out.append((ranker, floor, kind, n, st, k))
    return out


def run(legs, K, seed):
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, SD, size=len(legs)) if SD > 0 else np.zeros(len(legs))
    for l, e in zip(legs, noise):
        l["m"] = round((K + e) / l["nv"], 2) * HC
        l["rh"] = l["ph"] * l["m"]
    byday = defaultdict(list)
    for l in legs:
        byday[(l["season"], l["d"])].append(l)
    keyf = {"pm": lambda l: l["rh"], "edge": lambda l: l["edge"]}
    pick = {}
    for ranker, f in keyf.items():
        for kind in ("main", "alt", "both"):
            for dk, ls in byday.items():
                best = {}
                for l in ls:
                    if kind != "both" and l["kind"] != kind:
                        continue
                    key = (l["player"], l["prop"], l["line"])
                    if key not in best or f(l) > f(best[key]):
                        best[key] = l
                pick[(ranker, kind, dk)] = sorted(best.values(), key=f, reverse=True)
    days = {s: sorted(d for (ss, d) in byday if ss == s) for s in SEASONS}
    ix = {s: {d: i for i, d in enumerate(days[s])} for s in SEASONS}
    res = {}
    for cfg in configs():
        ranker, floor, kind, n, st, kk = cfg
        arr = {s: np.zeros((2, len(days[s]))) for s in SEASONS}
        for dk in byday:
            s, d = dk
            cands = pick[(ranker, kind, dk)]
            if floor is not None:
                cands = [l for l in cands if l["rh"] >= floor]
            used = set()
            for _ in range(kk):
                slip, games = [], set()
                for l in cands:
                    if l["player"] in used or l["ev"] in games:
                        continue
                    slip.append(l)
                    games.add(l["ev"])
                    if len(slip) == n:
                        break
                if len(slip) < n:
                    break
                used |= {l["player"] for l in slip}
                arr[s][0, ix[s][d]] += 1
                arr[s][1, ix[s][d]] += E.grade([{"hit": l["hit"], "factor": l["m"]} for l in slip], st)[1]
        res[cfg] = arr
    return res, days


def stats(a, boot_ix):
    st = a[0].sum()
    if st < 30:
        return None
    net = a[1] - a[0]
    roi = a[1].sum() / st - 1
    bst = a[0][boot_ix].sum(1)
    b = np.sort(np.where(bst > 0, a[1][boot_ix].sum(1) / np.maximum(bst, 1e-9) - 1, 0))
    played = net[a[0] > 0]
    pos = np.sort(played)[::-1]
    top5 = pos[:5].sum() / max(played.sum(), 1e-9) if played.sum() > 0 else float("nan")
    streak = cur = 0
    for v in played:
        cur = cur + 1 if v < 0 else 0
        streak = max(streak, cur)
    worst10 = min((played[i:i + 10].sum() for i in range(max(1, len(played) - 9))), default=0.0)
    return {"slips": int(st), "roi": roi, "lb5": float(b[int(0.05 * len(b))]), "top5": top5, "streak": streak, "worst10": float(worst10),
            "units": float(net.sum())}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    legs = load(conn)
    print(f"legs {len(legs):,} | price noise sd {SD} | seeds {SEEDS} | K in 0.455 / 0.465 / 0.475", flush=True)
    rng = np.random.default_rng(11)
    table = defaultdict(list)    # cfg -> list over (K, seed) of {season: stats}
    boot = None
    for K in (0.455, 0.465, 0.475):
        for seed in range(SEEDS):
            res, days = run(legs, K, 100 + seed)
            if boot is None:
                boot = {s: rng.integers(0, len(days[s]), size=(BOOT, len(days[s]))) for s in SEASONS}
            for cfg, arr in res.items():
                table[cfg].append((K, seed, {s: stats(arr[s], boot[s]) for s in SEASONS}))
        print(f"  K {K} done", flush=True)

    def fmt(cfg):
        r, f, kind, n, st, k = cfg
        return f"{r:<4} floor {('-' if f is None else f'{f:.3f}'):<5} {kind:<4} {n}{st[0].upper()} k{k}"

    # 1) robustness: across all 9 (K, seed) draws, the rule's worst-season ROI and LB5, median and min over draws
    print("\nROBUSTNESS (9 price draws: K 0.455 / 0.465 / 0.475 x 3 noise seeds). Median over draws of each season's ROI / LB5;"
          " 'min' = the worst draw. Sorted by the median of the worse season's LB5.")
    rows = []
    for cfg, draws in table.items():
        if any(d[2][s] is None for d in draws for s in SEASONS):
            continue
        per = {s: {"roi": np.median([d[2][s]["roi"] for d in draws]), "lb5": np.median([d[2][s]["lb5"] for d in draws]),
                   "roi_min": min(d[2][s]["roi"] for d in draws), "slips": int(np.median([d[2][s]["slips"] for d in draws])),
                   "top5": np.median([d[2][s]["top5"] for d in draws]), "streak": int(np.median([d[2][s]["streak"] for d in draws])),
                   "worst10": np.median([d[2][s]["worst10"] for d in draws])} for s in SEASONS}
        rows.append((cfg, per))
    rows.sort(key=lambda x: -min(x[1][s]["lb5"] for s in SEASONS))
    n_pos = sum(1 for _, p in rows if all(p[s]["roi_min"] > 0 for s in SEASONS))
    n_lb = sum(1 for _, p in rows if all(p[s]["lb5"] > 0 for s in SEASONS))
    print(f"  rules {len(rows)} | ROI > 0 in both seasons on EVERY draw: {n_pos} | median LB5 > 0 in both seasons: {n_lb}")
    for cfg, p in rows[:40]:
        a, b = p[SEASONS[0]], p[SEASONS[1]]
        print(f"  {fmt(cfg)} | 24-25 n {a['slips']:>4} ROI {100 * a['roi']:+6.1f}% (min {100 * a['roi_min']:+6.1f}%) LB5 {100 * a['lb5']:+6.1f}%"
              f" top5d {a['top5']:.2f} streak {a['streak']:>2} worst10d {a['worst10']:+5.1f}u | 25-26 n {b['slips']:>4} ROI {100 * b['roi']:+6.1f}%"
              f" (min {100 * b['roi_min']:+6.1f}%) LB5 {100 * b['lb5']:+6.1f}% top5d {b['top5']:.2f} streak {b['streak']:>2} worst10d {b['worst10']:+5.1f}u")

    # 2) walk-forward on the central draw (K 0.465, seed 0)
    central = {cfg: [d for d in draws if d[0] == 0.465 and d[1] == 0][0][2] for cfg, draws in table.items()}
    for train, test in ((SEASONS[0], SEASONS[1]), (SEASONS[1], SEASONS[0])):
        cand = [(cfg, st) for cfg, st in central.items() if st[train] and st[test]]
        cand.sort(key=lambda x: -x[1][train]["lb5"])
        print(f"\nWALK-FORWARD: top 10 rules by {train} LB5 (central price draw), shown on {test} (never seen):")
        for cfg, st in cand[:10]:
            print(f"  {fmt(cfg)} | {train} ROI {100 * st[train]['roi']:+6.1f}% LB5 {100 * st[train]['lb5']:+6.1f}% -> {test} ROI "
                  f"{100 * st[test]['roi']:+6.1f}% LB5 {100 * st[test]['lb5']:+6.1f}% (n {st[test]['slips']})")
        tr = [st[test]["roi"] for _, st in cand[:10]]
        print(f"  mean {test} ROI of the {train}-selected top 10: {100 * np.mean(tr):+.1f}% | positive {sum(1 for x in tr if x > 0)}/10")


if __name__ == "__main__":
    main()
