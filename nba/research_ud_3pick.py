#!/usr/bin/env python3
"""RESEARCH (2026-11-08, owner 11:02 PT: "find the best 3 pick strategy for underdog as well. I always have bonus but nowhere to use
them because they need to be 3 pick. Flex or power, but need to keep the same balance of low drawdown and high ROI"). READ-ONLY.

Sweeps every 3-pick Underdog slip the live pipeline could build, graded the same way as the live engine (Standard = all 3 hit,
Flex = 3/3 or 2/3, E.grade, floored multipliers), on the same calibrated legs as portfolio C (research_ud_switch.py):
  history  2024-25, 2025-26 (final 7 days out), repriced to today's law m = round(K / nv, 2), legs without a books' no-vig dropped
  now      2026-27, Underdog's real multipliers (nv = K / m when no book prices the line)
Grid    levels {R, R+F, R+B, ALL} x sides {both, More, Less} x props {all, nolow, mains} x rank {r_hat = p_hat*m, p_hat}
        x floor (4 per rank) x skip {0,1,2} x slips a day {1,2,3}; one pick per game and per player inside a slip, slips share no player.
Output  per structure (Standard / Flex): ROI, cash rate, max drawdown, losing days per season; best by worst-season ROI, by profit per
        drawdown, and the walk-forward (chosen on the two history seasons, played on this season). Reference rows: portfolio C (2-pick).
Env: DATABASE_URL, US_SMOKE (1 = every 6th history slate)."""
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
LEVELS = {"R": {"R"}, "R+F": {"R", "F"}, "R+B": {"R", "B"}, "ALL": {"R", "F", "B"}}
SIDES = {"both": ("Over", "Under"), "More": ("Over",), "Less": ("Under",)}
PROPS = {"all": None, "nolow": {"mains", "combos"}, "mains": {"mains"}}
RANKS = {"rh": [None, 0.535, 0.56, 0.585], "ph": [None, 0.55, 0.60, 0.65]}
SKIPS = (0, 1, 2)
NS = (1, 2, 3)
N = 3


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def pay(slip, structure):
    return E.grade([{"hit": l["hit"], "factor": l["m"]} for l in slip], structure)[1]


def slips_from(cand, nmax):
    """up to nmax slips of N legs: one pick per game and per player inside a slip, no player shared between slips"""
    out, used = [], set()
    for _ in range(nmax):
        s, pl, gm = [], set(), set()
        for l in cand:
            if l["player"] in used or l["player"] in pl or l["event_id"] in gm:
                continue
            s.append(l); pl.add(l["player"]); gm.add(l["event_id"])
            if len(s) == N:
                break
        if len(s) < N:
            break
        out.append(s)
        used |= pl
    return out


def stats(days_r):
    """days_r: list of per-day lists of net returns -> (slips, roi, cash, dd, lose-day share, profit)"""
    r = [x for d in days_r for x in d]
    if not r:
        return None
    day_sum = [sum(d) for d in days_r if d]
    cum = np.cumsum(day_sum)
    dd = float(np.max(np.maximum.accumulate(np.r_[0, cum]) - np.r_[0, cum]))
    return len(r), float(np.mean(r)), float(np.mean([x > 0 for x in r])), dd, float(np.mean([s < 0 for s in day_sum])), float(sum(r))


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
            if os.environ.get("US_SMOKE") == "1":
                ds = ds[::6]
        use += [(s, d) for d in ds]
    log("slates: " + ", ".join(f"{s} {sum(1 for x in use if x[0] == s)}" for s in SEASONS))
    cfgs = [(lv, sd, pr, rk, fl, sk, ns) for lv in LEVELS for sd in SIDES for pr in PROPS for rk in RANKS for fl in RANKS[rk]
            for sk in SKIPS for ns in NS]
    res = {(c, st): defaultdict(list) for c in cfgs for st in ("standard", "flex")}
    ref = defaultdict(list)          # portfolio C, 2-pick Standard
    day_n = defaultdict(int)
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
        day_n[s] += 1
        ref[s].append([pay(x, "standard") - 1 for _u, _k, x in C.portfolio(cl)])
        cache = {}

        def val(slip, structure):
            k = (tuple(id(l) for l in slip), structure)
            if k not in cache:
                cache[k] = pay(slip, structure) - 1
            return cache[k]
        for lv in LEVELS:
            for sd in SIDES:
                for pr in PROPS:
                    pool = [l for l in cl if l["lv"] in LEVELS[lv] and l["side"] in SIDES[sd] and (PROPS[pr] is None or l["g"] in PROPS[pr])]
                    for rk, floors in RANKS.items():
                        key = "rh" if rk == "rh" else "ph"
                        srt = sorted(pool, key=lambda l: -l[key])
                        for fl in floors:
                            base = [l for l in srt if fl is None or l[key] >= fl]
                            for sk in SKIPS:
                                sl = slips_from(base[sk:], 3)
                                for ns in NS:
                                    use_s = sl[:ns]
                                    for stt in ("standard", "flex"):
                                        res[((lv, sd, pr, rk, fl, sk, ns), stt)][s].append([val(x, stt) for x in use_s])
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 50 == 0:
            log(f"{i + 1}/{len(use)} {d}: {len(cl)} calibrated legs")
    log("grid built; ranking")

    def row(per, label):
        parts = []
        for s in SEASONS:
            x = stats(per.get(s, []))
            parts.append(f"{s} none" + " " * 40 if x is None else
                         f"{s} {x[0]:4d}sl ROI {100 * x[1]:+6.1f}% cash {100 * x[2]:4.1f}% dd {x[3]:5.1f} lose {100 * x[4]:3.0f}% {x[5]:+6.1f}u")
        print(f"  {label:<62s} " + " | ".join(parts), flush=True)

    def name(c):
        lv, sd, pr, rk, fl, sk, ns = c
        return f"{lv} {sd} {pr} {rk}>={fl} skip{sk} x{ns}"
    print("\n" + "=" * 200)
    print("REFERENCE: portfolio C (live 2-pick Standard), 1u per slip")
    row(ref, "C live (2-pick Standard)")
    for stt in ("standard", "flex"):
        print("\n" + "=" * 200)
        print(f"3-PICK {stt.upper()} - 1u per slip. slips | ROI | cash | max drawdown (u) | losing days | profit")
        rows = []
        for (c, s2), per in res.items():
            if s2 != stt:
                continue
            st3 = {s: stats(per.get(s, [])) for s in SEASONS}
            if any(st3[s] is None for s in SEASONS):
                continue
            hs = [st3["2024-25"], st3["2025-26"]]
            hist_sl = hs[0][0] + hs[1][0]
            hist_days = day_n["2024-25"] + day_n["2025-26"]
            if hist_sl < 0.5 * hist_days or st3["2026-27"][0] < 6:
                continue
            rows.append((c, per, st3))
        log(f"{stt}: {len(rows)} configs with >= 0.5 slips a day")

        def hist_pool(per):
            return per.get("2024-25", []) + per.get("2025-26", [])

        def show(title, key, n=15):
            print(f"\n-- {title}")
            for c, per, st3 in sorted(rows, key=key, reverse=True)[:n]:
                row(per, name(c))
        show("best WORST-SEASON ROI (all three seasons)", lambda r: min(r[2][s][1] for s in SEASONS))
        show("best profit per drawdown over all three seasons",
             lambda r: sum(r[2][s][5] for s in SEASONS) / (1.0 + max(r[2][s][3] for s in SEASONS)))
        show("best history ROI with every season positive and drawdown <= 12u",
             lambda r: (min(r[2][s][1] for s in SEASONS) > 0 and max(r[2][s][3] for s in SEASONS) <= 12) * np.mean([r[2][s][1] for s in SEASONS]))
        print("\n-- WALK-FORWARD: chosen on 2024-25 + 2025-26 only (history ROI, both seasons positive, dd <= 12u), played on 2026-27")
        wf = []
        for c, per, st3 in rows:
            h = stats(hist_pool(per))
            if h and st3["2024-25"][1] > 0 and st3["2025-26"][1] > 0 and h[3] <= 12:
                wf.append((h[1] / (1.0 + h[3] / max(h[0], 1) * 10), c, per, st3))
        for _sc, c, per, st3 in sorted(wf, key=lambda x: -x[0])[:12]:
            row(per, name(c))
        print(f"   ({len(wf)} configs passed the history filter)")
        print("\n-- cell-level view: which single choices matter (mean ROI over all grid configs of that choice, all three seasons pooled)")
        for dim_i, dim in enumerate(("levels", "sides", "props", "rank", "floor", "skip", "slips")):
            agg = defaultdict(list)
            for c, per, st3 in rows:
                allr = [x for s in SEASONS for d in per.get(s, []) for x in d]
                agg[c[dim_i]].append(np.mean(allr))
            print(f"   {dim:<7s} " + "  ".join(f"{k}:{100 * np.mean(v):+5.1f}%" for k, v in sorted(agg.items(), key=lambda kv: str(kv[0]))))
    log("DONE")


if __name__ == "__main__":
    main()
