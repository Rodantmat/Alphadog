#!/usr/bin/env python3
"""
RESEARCH - SLEEPER / FLIFF FROM EVERY MEASURABLE LEG AT THE APP'S OWN LINE AND PRICE (2026-10-28; owner 14:58 PT: "If there is a
better way to qualify them and of course it must use its own multiplier system. We need to use all possible, measurable legs. Must
use the app own multipliers and slip multiplier system ... the best possible logic we can track, backtest, simulate and certify. Then
highest ROI, lowest drawdowns balance" + "definitely no skipping, unless absolutely nothing holds positive ROI"). READ-ONLY.

LEGS - every player / stat the app can show, at the APP'S line, with OUR final_hp AT THAT LINE (no Underdog line in between):
  history 2024-25 / 2025-26 (final 7 days out; the apps' boards do not exist before 2026-10): the books' consensus MAIN line both
    sides (research_sleeper_hist.hist_day: the app copies the books' main line), plus - Sleeper only - the Over-only alternate rungs;
    multipliers by each app's own law measured on its real boards: Sleeper m = round(1 / (OVR x p_mkt), 2) (alternates K_ALT(p)),
    Fliff Pick'Em m = round(1 / (K_F x p_mkt), 2) with K_F = median 1 / (p_mkt x m) over the real Pick'Em board (2026-10-26 on);
  this season (2026-27, real boards): Sleeper's window board (main + alternates) and Fliff's Pick'Em board, their own lines and
    multipliers, final_hp at that line, the books' de-vigged chance at that line where they post it.
SLIPS - the apps' own payout: Sleeper Max = product x size bonus (1 / 1.0797 / 1.101 / 1.174 / 1.276), Sleeper Flex = EV-matched
  tiers (research_sleeper_transfer.pay_flex_ev; 454 of the owner's entries); Fliff Pick'Em Max = product cut to 2 decimals (owner's
  entry 10-26: 1.75 x 1.85 -> 3.23x); Fliff Flex reductions are unpublished - not priced. A void drops the pick (< 2 live = refund).
QUALIFY x ORDER (no skipping - every rule takes its best legs; owner):
  order  p (final_hp) | ev (final_hp x m) | edge (final_hp - 1 / m) | bl (half final_hp, half market) | evbl (bl x m)
  floor  final_hp >= 0 / .53 / .56 / .59      gate  final_hp x m >= 0 / 1.00 / 1.04 / 1.08      mcap  m <= 99 / 1.85
  side   any / Over / Under      props  all / no low-volume / low-volume      kind  main / main + alternates (Sleeper)
  one leg a game, distinct players, >= 2 teams; 1 or 2 slips a slate (the second from other players); 2-6 picks, Max and Flex.
REPORT per structure: (a) THE SELECTION METHOD OUT OF SAMPLE - best rule (it and its neighbours positive, >= 100 slips) chosen on
  2024-25 shown on 2025-26 and this season, then chosen on 2025-26 shown on 2024-25; (b) ROBUST IN BOTH SEASONS (rule + neighbours
  positive, >= 150 slips), ranked by the worse season's lower bound, with profit / max drawdown balance and this season's real result;
  (c) the live rules as a reference (UD-T1 transfer, research_app_line_rule runs 40768767535 / 40768774635).
BETR (AA_APP=betr; owner 2026-10-28 16:44 PT "double check with the same level of scrutiny for betr"): a FLAT table - no per-pick
  multiplier (pp_slip_rules betr_payout_v1 = research_sleeper_transfer.BETR_*: Perfect 2-6 = 3 / 6 / 10 / 20 / 35, Dynamic 3-6 by hits,
  an all-LESS entry pays the discounted tables). Legs: history = the books' consensus MAIN line both sides (Betr = the books' / Underdog's
  main line); this season = Betr's own archived board (board_snapshots 'betr', main markets, newest capture of the slate) with final_hp
  at Betr's line. m = 1 for every Betr leg, so the orders are p / bl / pf (the books' chance), no gate / cap; side adds 'mix' (an
  all-Under slip swaps its last leg for the best Over that fits - the live engine's rule); the kind slot carries the game cap
  (gc1 = one leg a game, gc2 = up to two). "max" = Perfect, "flex" = Dynamic.
Env: DATABASE_URL, AA_APP (sleeper | fliff | betr), AA_SMOKE (1 = every 8th history slate), AA_TOP (rows per list, 8).
"""
import itertools
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", os.environ.get("AA_APP") or "sleeper")
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_hist as RSH                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402

APP = os.environ.get("AA_APP") or "sleeper"
T0 = time.time()
ORDERS = ("p", "ev", "edge", "bl", "evbl") if APP != "betr" else ("p", "bl", "pf")
FLOORS = (0.0, 0.53, 0.56, 0.59)
GATES = (0.0, 1.00, 1.04, 1.08)
MCAPS = (99.0, 1.85)
SIDES = ("any", "Over", "Under") if APP != "betr" else ("any", "Over", "Under", "mix")
PROPS = ("all", "nolow", "low")
KINDS = ("main", "all") if APP == "sleeper" else ("gc1", "gc2") if APP == "betr" else ("main",)
NSL = (1, 2)
if os.environ.get("AA_FINE") == "1":               # finer steps for a focused structure (owner: test every value in between)
    FLOORS = (0.0, 0.50, 0.53, 0.56, 0.59, 0.62)
    GATES = (0.0, 0.95, 1.00, 1.04, 1.08, 1.12, 1.20)
    MCAPS = (99.0, 2.5, 1.85)
SIZES = (2, 3, 4, 5, 6)
if APP == "betr":                                   # flat table: no multiplier to gate or cap on
    FLOORS = (0.0, 0.52, 0.54, 0.56, 0.58, 0.60, 0.62, 0.64)
    GATES = (0.0,)
    MCAPS = (99.0,)
STRUCTS = [(k, "max") for k in SIZES] + ([(k, "flex") for k in SIZES if k >= 3] if APP in ("sleeper", "betr") else [])
if os.environ.get("AA_ONLY"):                       # e.g. "5flex" (2026-10-28 owner: the 5-pick Flex in detail)
    STRUCTS = [x for x in STRUCTS if f"{x[0]}{x[1]}" in os.environ["AA_ONLY"].split(",")]
SEASONS = ("2024-25", "2025-26", "2026-27")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def floor2(x):
    return int(x * 100 + 1e-6) / 100.0


def pay(s, st):
    live = [l for l in s if l["hit"] is not None]
    if len(live) < 2 or len({l["team"] for l in live}) < 2:
        return 1.0
    if APP == "fliff":
        return floor2(math.prod(l["m"] for l in live)) if all(l["hit"] for l in live) else 0.0
    if st == "max" or len(live) == 2:
        return ST.pay_max(live, ST.BONUS_TRUE)
    return ST.pay_flex_ev(live)


def fliff_law(conn, days):
    """K_F: the Pick'Em board's own margin against the books' de-vigged chance at the same line (median 1 / (p_mkt x m))"""
    import fliff_live_slip_engine as FL
    v = []
    for d in days:
        fl, _last, _n = FL.board(conn, d)
        if not fl:
            continue
        _sl, mk, *_ = RSD.load(conn, d)
        for (pid, prop, side), (_nm, line, m, *_r) in fl.items():
            pm = mk.get((pid, prop, side, line))
            if pm:
                v.append(1 / (float(np.mean(pm)) * m))
    k = float(np.median(v)) if v else 1.096
    log(f"FLIFF PICK'EM LAW: K_F = {k:.4f} from {len(v)} legs with a book price at the same line (p10 {np.percentile(v, 10) if v else 0:.3f},"
        f" p90 {np.percentile(v, 90) if v else 0:.3f})")
    return k


def teams(conn, d):
    return {pid: b["team"] for pid, b in ST.box(conn, d).items()}


def hist_legs(conn, d, st, ovr, kt, kf):
    legs = RSH.hist_day(conn, d, st, ovr, kt)
    tm = teams(conn, d)
    out = []
    for l in legs:
        if APP == "fliff":
            if l["kind"] != "main":
                continue
            l["m"] = round(1 / (kf * l["pf"]), 2)
            if l["m"] <= 1.0:
                continue
        l["team"] = tm.get(str(l["player_id"]))
        out.append(l)
    return out


def live_legs(conn, d, st):
    tm = teams(conn, d)
    _sl, mk, *_ = RSD.load(conn, d)
    out = []
    if APP == "sleeper":
        for l in RSH.live_day(conn, d, st):
            pm = mk.get((l["player_id"], l["prop"], l["side"], l["line"]))
            out.append({**l, "pf": float(np.mean(pm)) if pm else 1 / (l["m"] * 1.1238), "team": tm.get(str(l["player_id"]))})
        return out
    import fliff_live_slip_engine as FL
    fl, _last, _n = FL.board(conn, d)
    if not fl:
        return out
    hp = {(r[0], r[1], r[2], float(r[3])): r[4] for r in conn.execute(RSH.FSQL, (d,)).fetchall()}
    for (pid, prop, side), (nm, line, m, g, match, tip) in fl.items():
        p = hp.get((pid, prop, side, float(line)))
        if p is None:
            continue
        l = {"player": nm, "player_id": pid, "prop": prop, "side": side, "line": float(line), "m": float(m), "kind": "main", "event_id": g, "p": float(p)}
        pm = mk.get((pid, prop, side, float(line)))
        l["pf"] = float(np.mean(pm)) if pm else 1 / (float(m) * 1.096)
        l["hit"] = AF.outcome(st, l)
        l["team"] = tm.get(str(pid))
        out.append(l)
    return out


def key_of(o):
    return {"p": lambda l: -l["p"], "ev": lambda l: -l["p"] * l["m"], "edge": lambda l: -(l["p"] - 1 / l["m"]),
            "bl": lambda l: -(l["p"] + l["pf"]) / 2, "evbl": lambda l: -(l["p"] + l["pf"]) / 2 * l["m"]}[o]


def greedy(base, idx, k, banned):
    """the first k legs of `base` at positions `idx` (already qualified, in order): distinct players, one leg a game"""
    out, pl, gm = [], set(), set()
    for i in idx:
        l = base[i]
        if l["player_id"] in pl or l["player_id"] in banned or l["event_id"] in gm:
            continue
        out.append(l); pl.add(l["player_id"]); gm.add(l["event_id"])
        if len(out) == k:
            break
    return out


class Acc:
    """per (rule, structure, slips a slate): per season n, sum, sumsq, cashed, cumulative P/L, peak, max drawdown"""
    def __init__(self):
        self.d = defaultdict(lambda: np.zeros((3, 7)))

    def add(self, key, si, pl_slate, slips):
        a = self.d[key][si]
        for x in slips:
            a[0] += 1; a[1] += x; a[2] += x * x; a[3] += x > 0
        a[4] += pl_slate
        a[5] = max(a[5], a[4]); a[6] = max(a[6], a[5] - a[4])


def day(acc, si, legs):
    for l in legs:
        l["_g"] = AF.GRP.get(l["prop"])
    for o, sd, pr, kd in itertools.product(ORDERS, SIDES, PROPS, KINDS):
        base = sorted([l for l in legs if (sd == "any" or l["side"] == sd) and (kd == "all" or l["kind"] == "main")
                       and (pr == "all" or (pr == "low") == (l["_g"] == "lowvol"))], key=key_of(o))
        if len(base) < 2:
            continue
        P = np.array([l["p"] for l in base]); M = np.array([l["m"] for l in base]); E = P * M
        for fl, g, mc in itertools.product(FLOORS, GATES, MCAPS):
            idx = np.nonzero((P >= fl) & (E >= g) & (M <= mc))[0]
            if len(idx) < 2:
                continue
            first = greedy(base, idx, 6, set())
            for k in SIZES:
                s1 = first[:k]
                if len(s1) < k or len({l["team"] for l in s1}) < 2:
                    continue
                s2 = greedy(base, idx, k, {l["player_id"] for l in s1})
                s2 = s2 if len(s2) == k and len({l["team"] for l in s2}) >= 2 else None
                for st in ("max", "flex"):
                    if (k, st) not in STRUCTS:
                        continue
                    p1 = pay(s1, st) - 1
                    acc.add((o, sd, pr, kd, fl, g, mc, k, st, 1), si, p1, [p1])
                    if s2 is not None:
                        p2 = pay(s2, st) - 1
                        acc.add((o, sd, pr, kd, fl, g, mc, k, st, 2), si, p1 + p2, [p1, p2])


def stat(a):
    n = a[0]
    if n < 2:
        return n, 0.0, -9.0, 0.0, a[6], a[4]
    m = a[1] / n
    sd = math.sqrt(max(a[2] / n - m * m, 0) * n / (n - 1))
    return n, m, m - sd / math.sqrt(n), a[3] / n, a[6], a[4]


def neighbours(key):
    o, sd, pr, kd, fl, g, mc, k, st, ns = key
    out = []
    i = FLOORS.index(fl)
    for j in (i - 1, i + 1):
        if 0 <= j < len(FLOORS):
            out.append((o, sd, pr, kd, FLOORS[j], g, mc, k, st, ns))
    i = GATES.index(g)
    for j in (i - 1, i + 1):
        if 0 <= j < len(GATES):
            out.append((o, sd, pr, kd, fl, GATES[j], mc, k, st, ns))
    i = MCAPS.index(mc)
    for j in (i - 1, i + 1):
        if 0 <= j < len(MCAPS):
            out.append((o, sd, pr, kd, fl, g, MCAPS[j], k, st, ns))
    return out


def robust(acc, key, si, mn):
    n, m, *_ = stat(acc.d[key][si])
    if n < mn or m <= 0:
        return False
    return all(stat(acc.d[q][si])[1] > 0 for q in neighbours(key) if q in acc.d and acc.d[q][si][0] >= mn // 2)


def lab(key):
    o, sd, pr, kd, fl, g, mc, k, st, ns = key
    return (f"{k}-pick {st:<4} order {o:<4} side {sd:<5} props {pr:<5} {kd:<4} p>={fl:.2f} pxm>={g:.2f} m<={mc:g} {ns} slip(s)/slate")


def row(acc, key):
    parts = []
    for si, s in enumerate(SEASONS):
        n, m, lb, c, dd, pl = stat(acc.d[key][si])
        parts.append(f"{s} {int(n)} {100 * m:+.1f}% (dd {dd:.1f}u, P/L {pl:+.1f}u, cash {100 * c:.0f}%)")
    h = [stat(acc.d[key][i]) for i in (0, 1)]
    prof = h[0][5] + h[1][5]; dd = max(h[0][4], h[1][4])
    return f"{lab(key)} | " + " | ".join(parts) + f" | 2 seasons P/L {prof:+.1f}u, worst dd {dd:.1f}u, P/L / dd {prof / dd if dd else 0:.1f}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    if os.environ.get("AA_SMOKE") == "1":
        hist = hist[::8]
    ovr, kt = RSH.law(conn, live)
    kf = fliff_law(conn, live) if APP == "fliff" else None
    log(f"APP {APP}: history {len(hist)} slates, this season {len(live)}")
    acc = Acc()
    vals = []
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        si = SEASONS.index(AF.season_of(d))
        legs = hist_legs(conn, d, st, ovr, kt, kf) if si < 2 else live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
        if len(legs) < 2:
            continue
        vals += [(si, l["kind"], l["side"], AF.GRP.get(l["prop"]), l["p"], l["m"], l["hit"]) for l in legs if l["hit"] is not None]
        day(acc, si, legs)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 25 == 0:
            log(f"slate {i + 1}/{len(hist) + len(live)} {d}: {len(legs)} legs, {len(acc.d)} rules")

    top = int(os.environ.get("AA_TOP") or 8)
    print("\n" + "=" * 170 + f"\nLEGS ({APP}): final_hp x m bins -> legs, hit, mean m, return per pick (history = the app's law, 2026-27 = REAL board)")
    V = np.array([(si, p, m, h) for si, k, sd, g, p, m, h in vals], float)
    for si, s in enumerate(SEASONS):
        X = V[V[:, 0] == si]
        if not len(X):
            continue
        ev = X[:, 1] * X[:, 2]
        for lo, hi in ((0, .9), (.9, .95), (.95, 1.0), (1.0, 1.04), (1.04, 1.08), (1.08, 1.15), (1.15, 9)):
            k = (ev >= lo) & (ev < hi)
            if k.sum():
                print(f"  {s} p x m {lo:.2f}-{hi:.2f}: {int(k.sum()):7d} legs | hit {X[k, 3].mean():.3f} | mean m {X[k, 2].mean():.3f} | "
                      f"return {100 * (X[k, 3] * X[k, 2] - 1).mean():+.1f}%")

    keys = list(acc.d)
    log(f"{len(keys)} rule x structure x slips cells")
    for k_, st_ in STRUCTS:
        ks = [q for q in keys if q[7] == k_ and q[8] == st_]
        print("\n" + "=" * 170 + f"\n{APP.upper()} {k_}-PICK {st_.upper()} - {len(ks)} rules")
        print("  (a) THE SELECTION METHOD OUT OF SAMPLE (best robust rule on the training season by its lower bound):")
        for tr, ot in ((0, 1), (1, 0)):
            cand = [q for q in ks if robust(acc, q, tr, 100)]
            if not cand:
                print(f"    chosen on {SEASONS[tr]}: no robust rule"); continue
            best = max(cand, key=lambda q: stat(acc.d[q][tr])[2])
            print(f"    chosen on {SEASONS[tr]} -> {SEASONS[ot]} {100 * stat(acc.d[best][ot])[1]:+.1f}% / 2026-27 "
                  f"{100 * stat(acc.d[best][2])[1]:+.1f}% ({int(stat(acc.d[best][2])[0])}) :: {row(acc, best)}")
        both = [q for q in ks if robust(acc, q, 0, 150) and robust(acc, q, 1, 150)]
        both.sort(key=lambda q: -min(stat(acc.d[q][0])[2], stat(acc.d[q][1])[2]))
        print(f"  (b) ROBUST IN BOTH SEASONS: {len(both)} rules (of {len(ks)}); top {top} by the worse season's lower bound:")
        seen = set()
        shown = 0
        for q in both:
            sig = tuple(round(stat(acc.d[q][i])[1], 3) for i in (0, 1))
            if sig in seen:
                continue
            seen.add(sig); shown += 1
            print("    " + row(acc, q))
            if shown >= top:
                break
        bal = sorted(both, key=lambda q: -((stat(acc.d[q][0])[5] + stat(acc.d[q][1])[5]) / max(stat(acc.d[q][0])[4], stat(acc.d[q][1])[4], 1)))
        print(f"  (b2) the same robust rules by BALANCE (2-season P/L / worst drawdown), top {top}:")
        for q in bal[:top]:
            print("    " + row(acc, q))
        lv = sorted([q for q in both if acc.d[q][2][0] >= 5 and stat(acc.d[q][2])[1] > 0],
                    key=lambda q: -((stat(acc.d[q][0])[5] + stat(acc.d[q][1])[5]) / max(stat(acc.d[q][0])[4], stat(acc.d[q][1])[4], 1)))
        print(f"  (b3) robust in both seasons AND positive this season on the real board (>= 5 slips): {len(lv)} rules; top {top} by balance:")
        for q in lv[:top]:
            print("    " + row(acc, q))
        if both:
            m24 = np.array([stat(acc.d[q][0])[1] for q in both]); m25 = np.array([stat(acc.d[q][1])[1] for q in both])
            m26 = [stat(acc.d[q][2])[1] for q in both if acc.d[q][2][0] >= 3]
            print(f"  robust rules: ROI median 2024-25 {100 * np.median(m24):+.1f}% / 2025-26 {100 * np.median(m25):+.1f}%; this season (>= 3 slips) "
                  f"{len(m26)} rules, median {100 * np.median(m26) if m26 else 0:+.1f}%, positive {100 * np.mean(np.array(m26) > 0) if m26 else 0:.0f}%")
    print("\n(c) LIVE RULES FOR REFERENCE (UD-T1 transfer, top leg skipped; research_app_line_rule): Sleeper 2-pick Max +33.0% "
          "(+36.2 / +29.8, dd 13.6u, 306 slips), 3-pick Flex +24.1% (+28.3 / +19.9, dd 10.0u); Fliff 2-pick Max +44.0% (+45.8 / +41.1, dd 7.0u, 184)")
    log("done")


if __name__ == "__main__":
    main()
