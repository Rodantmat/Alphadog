#!/usr/bin/env python3
"""
RESEARCH - SMALL-SLATE FALLBACK FOR THE APPS THAT BUILT NO SLIP (2026-10-29; owner 14:19 PT: "Find if there is a possible fallback that
holds positive ROI in this kind of day for the 3 apps without slips"; standing: no skipping unless nothing holds positive ROI). READ-ONLY.
Today (3 games) Sleeper S_ALL_5flex (one leg a game, 5 picks), Fliff F_UDT1_2max_U (T1 Unders, floor .56) and Betr B_T23_4dyn built nothing.
This reuses research_app_allegs' legs, prices and payouts (history = each app's law on the books' main lines, 2026-27 = the apps' REAL
boards), keeps only SMALL slates (games on the slate, counted from the legs' events: s3 = <= 3 games, s4 = <= 4) and searches what can still
be built there:
  game cap  gc 1 / 2 / 3 / any legs a game (distinct players, >= 2 teams - the live engines' own rule; app-side same-game rules are
            NOT assumed here, they must be mapped from the app before anything is deployed)
  size      2-6 picks, Max/Perfect and Flex/Dynamic where the app has them
  order     p / ev / edge / bl / evbl (Betr: p / bl / pf)    floor 0 .. .62    gate p x m 0 .. 1.12    mcap 99 / 1.85    side any / Over / Under (Betr + mix)
  kind      Sleeper: main / main + alternates     slips a slate 1 / 2
COVERAGE is reported (slates with a slip / small slates), because a fallback that still skips most small days is no fallback.
REPORT per app, bucket and structure: (1) rules positive in BOTH history seasons (>= 25 slips each, neighbours positive), ranked by balance
(2-season P/L / worst drawdown) with the worse season's lower bound, each with its 2026-27 real-board small-slate result; (2) the best
coverage-complete rule (a slip on every small slate); (3) the current live rule on the same small slates for reference.
Env: DATABASE_URL, AA_APP (sleeper | fliff | betr), SS_TOP (8), SS_SMOKE (1 = every 4th history slate).
"""
import itertools
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_allegs as RA                      # noqa: E402  (reads AA_APP)
import research_app_final_strategies as AF            # noqa: E402
import research_sleeper_hist as RSH                   # noqa: E402

APP = RA.APP
SEASONS = RA.SEASONS
BUCKETS = (("s3", 3), ("s4", 4))
if os.environ.get("SS_ALL") == "1":          # every slate too: a layered fallback must also hold on the normal days (owner 14:33 PT)
    BUCKETS = BUCKETS + (("all", 99),)
ORDERS = RA.ORDERS
SIDES = RA.SIDES
FLOORS = RA.FLOORS
GATES = RA.GATES
MCAPS = RA.MCAPS
KINDS = ("main", "all") if APP == "sleeper" else ("main",)
GCS = (1, 2, 3, 99)
SIZES = RA.SIZES
STRUCTS = RA.STRUCTS
TOP = int(os.environ.get("SS_TOP") or 8)
MIN = int(os.environ.get("SS_MIN") or 8)      # small slates are rare (~20 a season): slips a season needed for a rule to count


def day(acc, si, legs, bucket_flags, cover):
    for l in legs:
        l["_g"] = AF.GRP.get(l["prop"])
    for o, sd, kd in itertools.product(ORDERS, SIDES, KINDS):
        base = sorted([l for l in legs if (sd in ("any", "mix") or l["side"] == sd) and (kd == "all" or l["kind"] == "main")],
                      key=RA.key_of(o))
        if len(base) < 2:
            continue
        P = np.array([l["p"] for l in base]); M = np.array([l["m"] for l in base]); E = P * M
        for fl, g, mc, gc in itertools.product(FLOORS, GATES, MCAPS, GCS):
            idx = np.nonzero((P >= fl) & (E >= g) & (M <= mc))[0]
            if len(idx) < 2:
                continue
            first = RA.greedy(base, idx, 6, set(), gc)
            for k in SIZES:
                s1 = first[:k]
                if sd == "mix":
                    s1 = RA.mix_fix(s1, base, idx, gc, set())
                if len(s1) < k or len({l["team"] for l in s1}) < 2:
                    continue
                s2 = RA.greedy(base, idx, k, {l["player_id"] for l in s1}, gc)
                if sd == "mix":
                    s2 = RA.mix_fix(s2, base, idx, gc, {l["player_id"] for l in s1})
                s2 = s2 if len(s2) == k and len({l["team"] for l in s2}) >= 2 else None
                for st in ("max", "flex"):
                    if (k, st) not in STRUCTS:
                        continue
                    p1 = RA.pay(s1, st) - 1
                    p2 = (RA.pay(s2, st) - 1) if s2 is not None else None
                    for bname in bucket_flags:
                        key1 = (bname, o, sd, kd, fl, g, mc, gc, k, st, 1)
                        acc.add(key1, si, p1, [p1])
                        cover[key1][si] += 1
                        if p2 is not None:
                            key2 = (bname, o, sd, kd, fl, g, mc, gc, k, st, 2)
                            acc.add(key2, si, p1 + p2, [p1, p2])
                            cover[key2][si] += 1


def neighbours(key):
    b, o, sd, kd, fl, g, mc, gc, k, st, ns = key
    out = []
    i = FLOORS.index(fl)
    out += [(b, o, sd, kd, FLOORS[j], g, mc, gc, k, st, ns) for j in (i - 1, i + 1) if 0 <= j < len(FLOORS)]
    i = GATES.index(g)
    out += [(b, o, sd, kd, fl, GATES[j], mc, gc, k, st, ns) for j in (i - 1, i + 1) if 0 <= j < len(GATES)]
    return out


def lab(key):
    b, o, sd, kd, fl, g, mc, gc, k, st, ns = key
    return (f"{k}-pick {st:<4} order {o:<4} side {sd:<5} {kd:<4} p>={fl:.2f} pxm>={g:.2f} m<={mc:g} games/slip<={'any' if gc == 99 else gc} {ns} slip(s)/slate")


def row(acc, key, n_slates):
    parts = []
    for si, s in enumerate(SEASONS):
        n, m, lb, c, dd, pl = RA.stat(acc.d[key][si])
        parts.append(f"{s} {int(n)} {100 * m:+.1f}% (dd {dd:.1f}u, P/L {pl:+.1f}u, cash {100 * c:.0f}%, slates {n_slates[si]})")
    h = [RA.stat(acc.d[key][i]) for i in (0, 1)]
    prof = h[0][5] + h[1][5]; dd = max(h[0][4], h[1][4])
    return f"{lab(key)} | " + " | ".join(parts) + f" | 2 seasons P/L {prof:+.1f}u, worst dd {dd:.1f}u, P/L / dd {prof / dd if dd else 0:.1f}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    if os.environ.get("SS_SMOKE") == "1":
        hist = hist[::4]
    ovr, kt = RSH.law(conn, live)
    kf = RA.fliff_law(conn, live) if APP == "fliff" else None
    RA.log(f"APP {APP}: history {len(hist)} slates, this season {len(live)}")
    acc = RA.Acc()
    cover = defaultdict(lambda: [0, 0, 0])
    nsl = {b: [0, 0, 0] for b, _ in BUCKETS}
    games_hist = defaultdict(int)
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        si = SEASONS.index(AF.season_of(d))
        legs = RA.hist_legs(conn, d, st, ovr, kt, kf) if si < 2 else RA.live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
        if len(legs) < 2:
            continue
        ng = len({l["event_id"] for l in legs})
        games_hist[(si, min(ng, 8))] += 1
        flags = [b for b, mx in BUCKETS if ng <= mx]
        if not flags:
            continue
        for b in flags:
            nsl[b][si] += 1
        day(acc, si, legs, flags, cover)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 25 == 0:
            RA.log(f"slate {i + 1}/{len(hist) + len(live)} {d}: {ng} games, {len(legs)} legs, {len(acc.d)} cells")

    print("=" * 170 + f"\nSLATE SIZES with legs ({APP}): games on the slate -> slates per season")
    for si, s in enumerate(SEASONS):
        print(f"  {s}: " + ", ".join(f"{g}{'+' if g == 8 else ''} games {games_hist.get((si, g), 0)}" for g in range(1, 9)))
    print(f"  small slates used: " + ", ".join(f"{b} {nsl[b]}" for b, _ in BUCKETS))

    keys = list(acc.d)
    RA.log(f"{len(keys)} cells")
    for b, _mx in BUCKETS:
        if b == "all":
            continue
        for k_, st_ in STRUCTS:
            ks = [q for q in keys if q[0] == b and q[8] == k_ and q[9] == st_]
            if not ks:
                continue
            print("\n" + "=" * 170 + f"\n{APP.upper()} | slates with <= {_mx} games | {k_}-PICK {st_.upper()} - {len(ks)} cells")

            def ok(q, si, mn):
                n, m, *_ = RA.stat(acc.d[q][si])
                return n >= mn and m > 0

            def nb_ok(q):
                for nq in neighbours(q):
                    if nq in acc.d and acc.d[nq][0][0] >= MIN // 2 and not (RA.stat(acc.d[nq][0])[1] > 0 and RA.stat(acc.d[nq][1])[1] > 0):
                        return False
                return True

            both = [q for q in ks if ok(q, 0, MIN) and ok(q, 1, MIN) and nb_ok(q)]
            both.sort(key=lambda q: -((RA.stat(acc.d[q][0])[5] + RA.stat(acc.d[q][1])[5]) / max(RA.stat(acc.d[q][0])[4], RA.stat(acc.d[q][1])[4], 1)))
            print(f"  (1) positive in both history seasons (>= 25 slips each, neighbours positive): {len(both)} rules; top {TOP} by balance:")
            seen, shown = set(), 0
            for q in both:
                sig = tuple(round(RA.stat(acc.d[q][i])[1], 3) for i in (0, 1))
                if sig in seen:
                    continue
                seen.add(sig); shown += 1
                print("    " + row(acc, q, cover[q]))
                if shown >= TOP:
                    break
            full = [q for q in ks if cover[q][0] >= 0.9 * nsl[b][0] and cover[q][1] >= 0.9 * nsl[b][1] and ok(q, 0, MIN) and ok(q, 1, MIN)]
            full.sort(key=lambda q: -((RA.stat(acc.d[q][0])[5] + RA.stat(acc.d[q][1])[5]) / max(RA.stat(acc.d[q][0])[4], RA.stat(acc.d[q][1])[4], 1)))
            print(f"  (2) coverage >= 90% of the small slates in BOTH history seasons AND positive in both: {len(full)} rules; top {TOP} by balance:")
            for q in full[:TOP]:
                print("    " + row(acc, q, cover[q]))
    if any(b == "all" for b, _ in BUCKETS):
        for k_, st_ in STRUCTS:
            cands = []
            for q in keys:
                if q[0] != "all" or q[8] != k_ or q[9] != st_:
                    continue
                a = acc.d[q]
                if not (a[0][0] >= 100 and a[1][0] >= 100 and RA.stat(a[0])[1] > 0 and RA.stat(a[1])[1] > 0
                        and a[2][0] >= 5 and RA.stat(a[2])[1] > 0):
                    continue
                q4 = ("s4",) + q[1:]
                if q4 not in acc.d:
                    continue
                b4 = acc.d[q4]
                n4 = b4[0][0] + b4[1][0]
                if n4 < 2 * MIN or (b4[0][1] + b4[1][1]) <= 0:
                    continue
                cov4 = (cover[q4][0] + cover[q4][1]) / max(nsl["s4"][0] + nsl["s4"][1], 1)
                cands.append((cov4, (b4[0][1] + b4[1][1]) / n4, q, q4))
            cands.sort(key=lambda c: (-(c[0] >= 0.8), -c[1]))
            print("\n" + "=" * 170 + f"\n{APP.upper()} | LAYER CANDIDATES {k_}-PICK {st_.upper()} - positive on EVERY slate in both history seasons "
                  f"(>= 100 slips) AND this season (>= 5), and positive pooled on the <= 4-game slates: {len(cands)}; top {TOP} (coverage >= 80% first, by small-slate ROI)")
            for cov4, roi4, q, q4 in cands[:TOP]:
                print(f"  small-slate coverage {100 * cov4:.0f}%, small-slate pooled ROI {100 * roi4:+.1f}%")
                print("     ALL SLATES : " + row(acc, q, cover[q]))
                print("     <=4 GAMES  : " + row(acc, q4, cover[q4]))
    print("\ndone")
    RA.log("done")


if __name__ == "__main__":
    main()
