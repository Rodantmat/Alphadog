#!/usr/bin/env python3
"""
RESEARCH - UNDERDOG REBUILD ON TODAY'S REAL PRICES (2026-11-01; owner 23:22 PT: "No pause, rerun all possible strategies on all possible
compositions, there is positive ROI, we just need to find it having the numbers under better understanding" + "Replicate the current
multipliers we have been seeing in the backtest to really get a real picture"). READ-ONLY.

WHAT WE NOW KNOW (research_ud_leg_types run 41402813098, research_app_deep run 41402765839):
  * final_hp is calibrated on Underdog's R and F lines this season, but badly OVERRATES the harder B lines (B More 0.590 -> 0.329,
    B Less 0.591 -> 0.423; already overrated in history, -0.05 .. -0.12);
  * Underdog now prices every pick off the exchange (m ~ K / books' no-vig) - history paid ~1.00 on mains, so every certified Underdog
    backtest used multipliers the app no longer pays.
THIS RUN:
  PART A  TODAY'S PRICE LAW, measured on this season's REAL Underdog window boards: K = m x nv (nv = the books' no-vig for that side at
          that line, research_sleeper_transfer.consensus - 8 sportsbooks) per line level (R / F / B) x side - median, spread, fit.
  PART B  HISTORY REPRICED: every history Underdog leg with a books' no-vig gets m_now = round(K[level, side] / nv, 2) (legs the books do
          not price at that line are left out - reported). This season keeps Underdog's REAL multiplier.
  PART C  p_hat = logistic(logit final_hp, logit nv, level F / B, side Under) fitted OUT OF SAMPLE (2024-25 legs on 2025-26, 2025-26 on
          2024-25, this season on both) - corrects the B-line overrating with the market; calibration by level printed.
  PART D  EVERY RULE: level set (R, F, B, RF, RB, ALL) x side (both / More / Less) x props (all, no low-volume, combos, mains) x ranker
          (r_hat = p_hat x m with floors none / .50 / .52 / .535 / .55 / .57, edge = p_hat - nv with floors none / .02 / .04, p_hat
          with floors none / .58 / .62) x skip 0 / 1 x structure (Standard 2-6, Flex 3-6) x 1 / 2 slips a slate (the second from
          other players); one leg a game, distinct players. Payout = build_ud_slip_engine STD / FLEX x product of m, floored to 2
          decimals (Underdog's own rounding). Final 7 days of each history season out.
  REPORT per structure: robust in both history seasons (rule + floor neighbours positive, >= 100 slips each), ranked by the weaker
  season's lower bound, with THIS SEASON's real-board result; the selection method out of sample (chosen on one season -> the other
  and this season); rules positive in ALL THREE (>= 8 slips this season), by profit / drawdown.
Env: DATABASE_URL, UB_SMOKE (1 = every 6th history slate), UB_TOP (rows per list, 8).
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
os.environ.setdefault("APP", "UD")
import build_ud_slip_engine as E                     # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402

T0 = time.time()
TOP = int(os.environ.get("UB_TOP") or 8)
SEASONS = ("2024-25", "2025-26", "2026-27")
GRP = {"points": "mains", "rebounds": "mains", "assists": "mains", "threes_made": "mains", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "low", "blocks": "low", "turnovers": "low", "stocks": "low"}
LEVELS = {"R": {"R"}, "F": {"F"}, "B": {"B"}, "RF": {"R", "F"}, "RB": {"R", "B"}, "ALL": {"R", "F", "B"}}
SIDES = {"both": ("Over", "Under"), "More": ("Over",), "Less": ("Under",)}
PROPS = {"all": None, "nolow": {"mains", "combos"}, "combos": {"combos"}, "mains": {"mains"}}
RANKS = ([("rh", f) for f in (None, 0.50, 0.52, 0.535, 0.55, 0.57)] + [("edge", f) for f in (None, 0.02, 0.04)]
         + [("ph", f) for f in (None, 0.58, 0.62)])
STRUCTS = [(n, "standard") for n in (2, 3, 4, 5, 6)] + [(n, "flex") for n in (3, 4, 5, 6)]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lg(x):
    x = min(max(float(x), 1e-4), 1 - 1e-4)
    return math.log(x / (1 - x))


def lvl(tier):
    t = str(tier)
    return "R" if t == "R" else "B" if t.startswith("B") else "F" if t.startswith("F") else None


def fit(X, y, iters=40):
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


def feats(l):
    return [lg(l["p"]), lg(l["nv"]), 1.0 if l["lv"] == "F" else 0.0, 1.0 if l["lv"] == "B" else 0.0, 1.0 if l["side"] == "Under" else 0.0]


def pay(slip, structure):
    _h, p = E.grade([{"hit": l["hit"], "factor": l["m"]} for l in slip], structure)
    return p


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    by_season = defaultdict(list)
    for d in days:
        by_season[AF.season_of(d)].append(d)
    use = []
    for s in SEASONS:
        ds = sorted(by_season.get(s, []))
        if s != "2026-27":
            ds = ds[:-7]                                   # final 7 days out (every certified backtest)
            if os.environ.get("UB_SMOKE") == "1":
                ds = ds[::6]
        use += [(s, d) for d in ds]
    log(f"slates: " + ", ".join(f"{s} {sum(1 for x in use if x[0] == s)}" for s in SEASONS))

    # ---------------- load every slate's Underdog legs with the books' no-vig at the same line ----------------
    slates = []
    n_all = n_nv = 0
    for i, (s, d) in enumerate(use):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _rows = AF.load_ud(conn, d, st)
        fair, _main = ST.consensus(conn, d)
        out = []
        for l in legs:
            v = lvl(l["tier"])
            if v is None or l.get("hit") is None or l.get("event_id") is None:
                continue
            n_all += 1
            po = fair.get((str(l["player_id"]), l["prop"], float(l["line"])))
            nv = None if po is None else (po if l["side"] == "Over" else 1 - po)
            if nv is not None and not 0.03 < nv < 0.97:
                nv = None
            if nv is not None:
                n_nv += 1
            out.append({"player": l["player"], "prop": l["prop"], "side": l["side"], "line": float(l["line"]), "lv": v, "p": float(l["p"]),
                        "m_board": float(l["m"]), "hit": int(l["hit"]), "ev": l["event_id"], "nv": nv, "g": GRP.get(l["prop"], "?")})
        slates.append((s, d, out))
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 50 == 0:
            log(f"loaded {i + 1}/{len(use)} {d}: {len(out)} legs")
    log(f"legs {n_all:,}, with a books' no-vig {n_nv:,} ({100 * n_nv / max(n_all, 1):.0f}%)")

    # ---------------- PART A: today's price law on the real board ----------------
    print("\nPART A - TODAY'S UNDERDOG PRICE LAW (this season's real window boards): K = m x nv by level and side")
    K = {}
    cur = [l for s, _d, ls in slates if s == "2026-27" for l in ls if l["nv"] is not None]
    for v in ("R", "F", "B"):
        for sd in ("Over", "Under"):
            x = np.array([l["m_board"] * l["nv"] for l in cur if l["lv"] == v and l["side"] == sd])
            if len(x) >= 30:
                pred = np.array([round(np.median(x) / l["nv"], 2) for l in cur if l["lv"] == v and l["side"] == sd])
                real = np.array([l["m_board"] for l in cur if l["lv"] == v and l["side"] == sd])
                K[(v, sd)] = float(np.median(x))
                print(f"  {v} {sd:5s} n {len(x):5d} | K median {np.median(x):.4f} p10 {np.percentile(x, 10):.4f} p90 {np.percentile(x, 90):.4f} | "
                      f"predicted m vs real: mean abs err {np.mean(np.abs(pred - real)):.3f}, corr {np.corrcoef(pred, real)[0, 1]:.3f} | "
                      f"mean real m {real.mean():.3f}")
    allx = np.array([l["m_board"] * l["nv"] for l in cur])
    Kall = float(np.median(allx)) if len(allx) else 0.465
    print(f"  ALL n {len(allx)} K median {Kall:.4f} (the 2026-10-22 measure was 0.465)")

    # ---------------- PART B: reprice history ----------------
    print("\nPART B - HISTORY REPRICED to today's law (legs with a books' no-vig only)")
    for s, _d, ls in slates:
        for l in ls:
            if s == "2026-27":
                l["m"] = l["m_board"]
            elif l["nv"] is not None:
                l["m"] = round(K.get((l["lv"], l["side"]), Kall) / l["nv"], 2)
            else:
                l["m"] = None
    for s in SEASONS:
        ls = [l for ss, _d, x in slates if ss == s for l in x]
        kept = [l for l in ls if l["m"] is not None and l["nv"] is not None]
        if ls:
            print(f"  {s}: legs {len(ls):,} kept {len(kept):,} ({100 * len(kept) / len(ls):.0f}%) | mean m board {np.mean([l['m_board'] for l in ls]):.3f} "
                  f"-> used {np.mean([l['m'] for l in kept]) if kept else 0:.3f} | hit x m (p >= .55): "
                  f"{np.mean([l['hit'] * l['m'] for l in kept if l['p'] >= .55]) if kept else 0:.3f}")

    # ---------------- PART C: out-of-sample calibrated p_hat ----------------
    print("\nPART C - p_hat = logistic(logit final_hp, logit nv, F, B, Under) fitted out of sample")
    data = {s: [l for ss, _d, x in slates if ss == s for l in x if l["m"] is not None and l["nv"] is not None] for s in SEASONS}
    coef = {}
    for s in SEASONS:
        train = [l for t in SEASONS if t != s and t != "2026-27" for l in data[t]]
        if not train:
            continue
        b = fit(np.array([feats(l) for l in train]), np.array([l["hit"] for l in train], float))
        coef[s] = b
        print(f"  for {s} (fit on {len(train):,} legs): const {b[0]:+.3f} final_hp {b[1]:+.3f} nv {b[2]:+.3f} F {b[3]:+.3f} B {b[4]:+.3f} Under {b[5]:+.3f}")
        for l in data[s]:
            z = b[0] + float(np.dot(b[1:], feats(l)))
            l["ph"] = 1 / (1 + math.exp(-z))
            l["rh"] = l["ph"] * l["m"]
            l["edge"] = l["ph"] - l["nv"]
    for s in SEASONS:
        print(f"  {s} calibration (p_hat >= .55) by level x side: model final_hp / p_hat / realised / hit x m")
        for v in ("R", "F", "B"):
            for sd in ("Over", "Under"):
                x = [l for l in data[s] if l["lv"] == v and l["side"] == sd and l.get("ph", 0) >= 0.55]
                if len(x) >= 30:
                    print(f"    {v} {sd:5s} n {len(x):6,d} final_hp {np.mean([l['p'] for l in x]):.3f} p_hat {np.mean([l['ph'] for l in x]):.3f} "
                          f"hit {np.mean([l['hit'] for l in x]):.3f} hit x m {np.mean([l['hit'] * l['m'] for l in x]):.3f}")

    # ---------------- PART D: every rule ----------------
    keyf = {"rh": lambda l: -l["rh"], "edge": lambda l: -l["edge"], "ph": lambda l: -l["ph"]}
    valf = {"rh": lambda l: l["rh"], "edge": lambda l: l["edge"], "ph": lambda l: l["ph"]}
    acc = defaultdict(lambda: np.zeros((3, 7)))     # rule -> per season [n, sum r, sum r2, cash, cum, peak, dd]
    for si_, (s, d, _x) in enumerate(slates):
        si = SEASONS.index(s)
        legs = [l for l in _x if l.get("ph") is not None]        # priced (books' no-vig at the line) and calibrated legs only
        if len(legs) < 2:
            continue
        for lvn, sdn, prn in itertools.product(LEVELS, SIDES, PROPS):
            pool = [l for l in legs if l["lv"] in LEVELS[lvn] and l["side"] in SIDES[sdn] and (PROPS[prn] is None or l["g"] in PROPS[prn])]
            if len(pool) < 2:
                continue
            for rk in ("rh", "edge", "ph"):
                base = sorted(pool, key=keyf[rk])
                for (rk2, fl) in RANKS:
                    if rk2 != rk:
                        continue
                    cand = base if fl is None else [l for l in base if valf[rk](l) >= fl]
                    for sk in (0, 1):
                        c = cand[sk:]
                        if len(c) < 2:
                            continue
                        for n in (2, 3, 4, 5, 6):
                            s1, pl, gm = [], set(), set()
                            for l in c:
                                if l["player"] in pl or l["ev"] in gm:
                                    continue
                                s1.append(l); pl.add(l["player"]); gm.add(l["ev"])
                                if len(s1) == n:
                                    break
                            if len(s1) < n:
                                continue
                            s2, pl2, gm2 = [], set(), set()
                            for l in c:
                                if l["player"] in pl or l["player"] in pl2 or l["ev"] in gm2:
                                    continue
                                s2.append(l); pl2.add(l["player"]); gm2.add(l["ev"])
                                if len(s2) == n:
                                    break
                            for st in ("standard", "flex"):
                                if st == "flex" and n < 3:
                                    continue
                                r1 = pay(s1, st) - 1
                                rs = [r1] + ([pay(s2, st) - 1] if len(s2) == n else [])
                                for ns in (1, 2):
                                    if ns == 2 and len(rs) < 2:
                                        continue
                                    a = acc[(lvn, sdn, prn, rk, fl, sk, n, st, ns)][si]
                                    for r in rs[:ns]:
                                        a[0] += 1; a[1] += r; a[2] += r * r; a[3] += r > 0
                                    a[4] += sum(rs[:ns]); a[5] = max(a[5], a[4]); a[6] = max(a[6], a[5] - a[4])
        if si_ % 25 == 0:
            log(f"rules on slate {si_ + 1}/{len(slates)} {d}: {len(acc):,} rule cells")

    def stat(a):
        n = a[0]
        if n < 2:
            return n, 0.0, -9.0, 0.0, a[6], a[4]
        m = a[1] / n
        sd = math.sqrt(max(a[2] / n - m * m, 0) * n / (n - 1))
        return n, m, m - sd / math.sqrt(n), a[3] / n, a[6], a[4]

    def neighbours(k):
        lvn, sdn, prn, rk, fl, sk, n, st, ns = k
        fls = [f for r, f in RANKS if r == rk]
        i = fls.index(fl)
        return [(lvn, sdn, prn, rk, fls[j], sk, n, st, ns) for j in (i - 1, i + 1) if 0 <= j < len(fls)]

    def robust(k, si, mn):
        n, m, *_ = stat(acc[k][si])
        if n < mn or m <= 0:
            return False
        return all(stat(acc[q][si])[1] > 0 for q in neighbours(k) if q in acc and acc[q][si][0] >= mn // 2)

    def lab(k):
        lvn, sdn, prn, rk, fl, sk, n, st, ns = k
        return f"{n}-pick {st:<8} level {lvn:<3} side {sdn:<4} props {prn:<6} rank {rk:<4} floor {('-' if fl is None else f'{fl:.3f}'):<5} skip {sk} {ns} slip(s)"

    def row(k):
        parts = []
        for si, s in enumerate(SEASONS):
            n, m, _lb, c, dd, pl = stat(acc[k][si])
            parts.append(f"{s} {int(n)} {100 * m:+.1f}% (P/L {pl:+.1f}u, dd {dd:.1f}u, cash {100 * c:.0f}%)")
        return lab(k) + " | " + " | ".join(parts)

    keys = list(acc)
    log(f"{len(keys):,} rules")
    for n, st in STRUCTS:
        ks = [k for k in keys if k[6] == n and k[7] == st]
        print("\n" + "=" * 190 + f"\nUNDERDOG {n}-PICK {st.upper()} - {len(ks):,} rules (history repriced to today's law; this season = real board)")
        both = [k for k in ks if robust(k, 0, 100) and robust(k, 1, 100)]
        both.sort(key=lambda k: -min(stat(acc[k][0])[2], stat(acc[k][1])[2]))
        print(f"  (a) ROBUST IN BOTH HISTORY SEASONS: {len(both)}; top {TOP} by the weaker season's lower bound:")
        seen = set()
        shown = 0
        for k in both:
            sig = (round(stat(acc[k][0])[1], 3), round(stat(acc[k][1])[1], 3))
            if sig in seen:
                continue
            seen.add(sig); shown += 1
            print("    " + row(k))
            if shown >= TOP:
                break
        print("  (b) THE SELECTION METHOD OUT OF SAMPLE (best robust rule on one season by its lower bound):")
        for tr, ot in ((0, 1), (1, 0)):
            cand = [k for k in ks if robust(k, tr, 100)]
            if not cand:
                print(f"    chosen on {SEASONS[tr]}: none"); continue
            best = sorted(cand, key=lambda k: -stat(acc[k][tr])[2])[:5]
            vals = [(stat(acc[k][ot])[1], stat(acc[k][2])[1], stat(acc[k][2])[0]) for k in best]
            print(f"    top 5 chosen on {SEASONS[tr]} -> {SEASONS[ot]} mean {100 * np.mean([v[0] for v in vals]):+.1f}% "
                  f"({sum(v[0] > 0 for v in vals)} of 5 positive) | this season mean {100 * np.mean([v[1] for v in vals]):+.1f}% "
                  f"({sum(v[1] > 0 for v in vals)} of 5 positive, slips {', '.join(str(int(v[2])) for v in vals)})")
            print("      best: " + row(best[0]))
        three = [k for k in both if acc[k][2][0] >= 8 and stat(acc[k][2])[1] > 0]
        three.sort(key=lambda k: -((stat(acc[k][0])[5] + stat(acc[k][1])[5]) / max(stat(acc[k][0])[4], stat(acc[k][1])[4], 1)))
        print(f"  (c) ROBUST IN BOTH HISTORY SEASONS AND POSITIVE THIS SEASON (>= 8 real-board slips): {len(three)}; top {TOP} by profit / drawdown:")
        for k in three[:TOP]:
            print("    " + row(k))
        m26 = [stat(acc[k][2])[1] for k in both if acc[k][2][0] >= 5]
        if both:
            print(f"  robust rules: median ROI 2024-25 {100 * np.median([stat(acc[k][0])[1] for k in both]):+.1f}% / 2025-26 "
                  f"{100 * np.median([stat(acc[k][1])[1] for k in both]):+.1f}% | this season (>= 5 slips) {len(m26)} rules, median "
                  f"{100 * np.median(m26) if m26 else 0:+.1f}%, positive {100 * np.mean(np.array(m26) > 0) if m26 else 0:.0f}%")
    print("\n(live reference: portfolio T (3 x 2-pick Standard, B-line based) - this season 17 slips -5.18u, -30.5%)")
    log("done")


if __name__ == "__main__":
    main()
