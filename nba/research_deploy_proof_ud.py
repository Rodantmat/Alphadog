#!/usr/bin/env python3
"""RESEARCH / PROOF (2026-11-10, owner 23:41 PT: "deploy 1,2,3 ... double check, backtest, simulate and prove"). READ-ONLY.

Underdog candidates graded under TODAY'S PRICING LAW (history repriced m = round(K / nv, 2), legs without a books' no-vig dropped;
this season = Underdog's real multipliers) - the same legs, calibration and grading as research_ud_3pick.py (the framework that made
portfolio C), so the earlier flattering history prices (research_app_deep) are NOT used.
Per candidate and season: slips, ROI, cash, profit, max drawdown, losing days, worst day, longest losing-day streak, longest run of
slips without a cash, halves ROI; then a block-bootstrap season simulation (150 slates, blocks of 5 days, 3000 seasons).
Env: DATABASE_URL, DP_SMOKE (1 = every 6th history slate)."""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import build_ud_slip_engine as E                     # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import ud_portfolio_c as C                           # noqa: E402

T0 = time.time()
SEASONS = ("2024-25", "2025-26", "2026-27")
COEF = {"2024-25": (-0.032, 0.631, 0.828, -0.056, 0.064, 0.067), "2025-26": (-0.018, 0.459, 0.954, -0.041, 0.039, 0.035),
        "2026-27": C.COEF}
LEVELS = {"R": {"R"}, "RB": {"R", "B"}, "ALL": {"R", "F", "B"}}
SIDES = {"both": ("Over", "Under"), "More": ("Over",), "Less": ("Under",)}
PROPS = {"all": None, "nolow": {"mains", "combos"}, "lowvol": {"low"}, "mains": {"mains"}}
# name: (levels, side, props, rank key, floor key, floor, skip, size, structure, slips a day)
CANDS = {
    "3F R Less all score fp>=.55":      ("R", "Less", "all", "score", "p", 0.55, 0, 3, "flex", 1),
    "3F R Less all score fp>=.00":      ("R", "Less", "all", "score", "p", 0.0, 0, 3, "flex", 1),
    "3F R Less all rh>=.535":           ("R", "Less", "all", "rh", "rh", 0.535, 0, 3, "flex", 1),
    "3F R Less all ph>=.55":            ("R", "Less", "all", "ph", "ph", 0.55, 0, 3, "flex", 1),
    "3F RB Less all ph>=.55":           ("RB", "Less", "all", "ph", "ph", 0.55, 0, 3, "flex", 1),
    "3F R both nolow ph skip2 (C3-3)":  ("R", "both", "nolow", "ph", "ph", 0.0, 2, 3, "flex", 1),
    "3F ALL Less all fp rank fp>=.60":  ("ALL", "Less", "all", "p", "p", 0.60, 0, 3, "flex", 1),
    "4F R both nolow ph skip2 (C3)":    ("R", "both", "nolow", "ph", "ph", 0.0, 2, 4, "flex", 1),
    "4F RB Less lowvol score fp>=.55":  ("RB", "Less", "lowvol", "score", "p", 0.55, 0, 4, "flex", 1),
    "5F R Less all score fp>=.55":      ("R", "Less", "all", "score", "p", 0.55, 0, 5, "flex", 1),
    "6F R Less all base fp>=.00":       ("R", "Less", "all", "base", "p", 0.0, 0, 6, "flex", 1),
    "6F R Less all score fp>=.55":      ("R", "Less", "all", "score", "p", 0.55, 0, 6, "flex", 1),
    "2S ref C1 all Less rh>=.535 skip1": ("ALL", "Less", "all", "rh", "rh", 0.535, 1, 2, "standard", 2),
}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def pay(slip, structure):
    return E.grade([{"hit": l["hit"], "factor": l["m"]} for l in slip], structure)[1]


def slips_from(cand, n, nmax):
    out, used = [], set()
    for _ in range(nmax):
        s, pl, gm = [], set(), set()
        for l in cand:
            if l["player"] in used or l["player"] in pl or l["event_id"] in gm:
                continue
            s.append(l); pl.add(l["player"]); gm.add(l["event_id"])
            if len(s) == n:
                break
        if len(s) < n:
            break
        out.append(s)
        used |= pl
    return out


def stats(days):
    """days: list of (date, [net returns]) -> dict"""
    flat = [x for _d, r in days for x in r]
    if not flat:
        return None
    ds = [sum(r) for _d, r in days if r]
    cum = np.cumsum(ds)
    dd = float(np.max(np.maximum.accumulate(np.r_[0, cum]) - np.r_[0, cum]))
    streak = best = 0
    for v in ds:
        streak = streak + 1 if v < 0 else 0
        best = max(best, streak)
    run = rbest = 0
    for x in flat:
        run = run + 1 if x <= 0 else 0
        rbest = max(rbest, run)
    h = len(days) // 2
    f1, f2 = [x for _d, r in days[:h] for x in r], [x for _d, r in days[h:] for x in r]
    return {"n": len(flat), "days": len(ds), "roi": float(np.mean(flat)), "cash": float(np.mean([x > 0 for x in flat])), "profit": float(sum(flat)),
            "dd": dd, "lose": float(np.mean([s < 0 for s in ds])), "worst": float(min(ds)), "lstreak": best, "slipdry": rbest,
            "per_day": len(flat) / max(len(ds), 1), "h1": float(np.mean(f1)) if f1 else float("nan"), "h2": float(np.mean(f2)) if f2 else float("nan")}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    by = defaultdict(list)
    for d in days:
        by[AF.season_of(d)].append(d)
    use = []
    for s in SEASONS:
        ds = sorted(by.get(s, []))
        if s != "2026-27":
            ds = ds[:-7]
            if os.environ.get("DP_SMOKE") == "1":
                ds = ds[::6]
        use += [(s, d) for d in ds]
    log("slates: " + ", ".join(f"{s} {sum(1 for x in use if x[0] == s)}" for s in SEASONS))
    res = {c: {s: [] for s in SEASONS} for c in CANDS}
    for i, (s, d) in enumerate(use):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _rows = AF.load_ud(conn, d, st)
        legs = [l for l in legs if l.get("hit") is not None]
        legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
        fair = C.consensus(conn, d)
        hist = s != "2026-27"
        if hist:
            keep = []
            for l in legs:
                l["lv"] = C.lvl(l["tier"])
                if l["lv"] is None:
                    continue
                nv, _src = C.nv_of(fair, l, fill=False)
                if nv is None:
                    continue
                l["m"] = round(C.K.get((l["lv"], l["side"]), C.K_ALL) / nv, 2)
                keep.append(l)
            legs = keep
        cl = C.calibrate(legs, fair, COEF[s], fill=not hist)
        for name, (lv, sd, pr, rk, fk, fl, sk, size, stt, ns) in CANDS.items():
            pool = [l for l in cl if l["lv"] in LEVELS[lv] and l["side"] in SIDES[sd] and (PROPS[pr] is None or l["g"] in PROPS[pr])]
            srt = sorted(pool, key=lambda l: -(l[rk] if l.get(rk) is not None else -1))
            base = [l for l in srt if (l.get(fk) if l.get(fk) is not None else -1) >= fl][sk:]
            sl = slips_from(base, size, ns)
            res[name][s].append((d, [pay(x, stt) - 1 for x in sl]))
        if i % 60 == 0:
            log(f"{i + 1}/{len(use)} {d}")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    log("graded; reporting")
    print("\n" + "=" * 220)
    print("PROOF TABLE - today's pricing law; 1u per slip. slips/day | ROI | cash | profit | max dd | losing days | worst day | losing-day streak | slips without a cash in a row | halves ROI")
    for name in CANDS:
        print(f"\n{name}")
        for s in SEASONS:
            x = stats(res[name][s])
            if x is None:
                print(f"   {s}: no slips")
                continue
            print(f"   {s}: {x['n']:4d} slips {x['per_day']:.2f}/day ROI {100 * x['roi']:+6.1f}% cash {100 * x['cash']:4.1f}% {x['profit']:+7.1f}u dd {x['dd']:5.1f}u "
                  f"lose {100 * x['lose']:3.0f}% worst {x['worst']:+5.1f}u streak {x['lstreak']}d dry {x['slipdry']} halves {100 * x['h1']:+.0f}/{100 * x['h2']:+.0f}")
        hist = res[name]["2024-25"] + res[name]["2025-26"]
        x = stats(hist)
        if x:
            print(f"   BOTH HISTORY: {x['n']} slips ROI {100 * x['roi']:+.1f}% profit {x['profit']:+.1f}u dd {x['dd']:.1f}u lose {100 * x['lose']:.0f}% dry {x['slipdry']}")
    print("\n" + "=" * 220)
    print("SEASON SIMULATION: 150 slates, 5-day blocks bootstrapped from ALL three periods pooled, 3000 seasons")
    rng = np.random.default_rng(7)
    for name in CANDS:
        pooled = [sum(r) for s in SEASONS for _d, r in res[name][s]]
        if len(pooled) < 30:
            continue
        pooled = np.array(pooled)
        out = []
        for _ in range(3000):
            seq = []
            while len(seq) < 150:
                a = rng.integers(0, len(pooled) - 5)
                seq.extend(pooled[a:a + 5])
            seq = np.array(seq[:150])
            cum = np.cumsum(seq)
            out.append((cum[-1], float(np.max(np.maximum.accumulate(np.r_[0, cum]) - np.r_[0, cum]))))
        pr = np.array([o[0] for o in out]); dd = np.array([o[1] for o in out])
        print(f"  {name:<40s} profit p5 {np.percentile(pr, 5):+7.1f}u median {np.median(pr):+7.1f}u p95 {np.percentile(pr, 95):+7.1f}u | "
              f"max dd median {np.median(dd):5.1f}u p95 {np.percentile(dd, 95):5.1f}u | P(season loss) {100 * np.mean(pr < 0):4.1f}%")
    log("DONE")


if __name__ == "__main__":
    main()
