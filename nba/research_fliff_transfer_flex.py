#!/usr/bin/env python3
"""FLIFF TRANSFER GRID WITH FLEX / SUPERFLEX (owner 2026-11-12 15:12 PT: "we are comparing to ALL strategies, we have never had the flex numbers, compare everything to understand what to keep or expand").
research_fliff_transfer's whole grid (source legs UD T1/T2/T3 or PP B units, at Fliff's own line and multiplier; order x floor x side x mult cap x skip x slips/slate x size 2-6)
re-priced three ways on the SAME slips: Max, Flex (min n-1 correct, n>=3) and SuperFlex (min n-2 correct). FT_PART = ud | pp. READ-ONLY.
Prints: (1) the DEPLOYED Fliff rules (F_UDT1_2max_U, F_UDT1_3max_U_pm, F_UDT1_2max_fav) as deployed and every structure of their own composition, (2) the best per size and structure,
(3) mean ROI by structure and size. Fliff Flex / SuperFlex priced from Fliff's own web code (unverified live)."""
import os, sys, math, inspect, textwrap, re
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_fliff_transfer as FT
import research_sleeper_small as RSS


def fp(legs, mode):
    live = [l for l in legs if l["hit"] is not None]; n = len(live)
    if n < 2:
        return 1.0
    ms = [float(l["m"]) for l in live]; hits = sum(1 for l in live if l["hit"])
    if mode == "flex" and n >= 3:
        c = round(math.prod(ms) / (1 + sum(m - 1 for m in ms)), 2)
        if c >= 1.01:
            return c if hits >= n - 1 else 0.0
    if mode == "superflex" and n >= 3:
        p = [1 / m / 1.0909 for m in ms]; r = [1.0, 0.0, 0.0]
        for a in p:
            r = [r[0] * a, r[1] * a + r[0] * (1 - a), r[2] * a + r[1] * (1 - a)]
        f = sum(r) * 1.0909 ** n
        if 0 < f < 1:
            c = round(1 / f, 2)
            if c >= 1.01:
                return c if hits >= n - 2 else 0.0
    return float(np.prod(ms)) if hits == n else 0.0


src = textwrap.dedent(inspect.getsource(RSS.SmallBook.day))
src2 = re.sub(r'(\n\s*)self\.slips\[comp \+ \("max",\)\]\.append\(\(season, d, pay\)\)(\n\s*)continue',
              r'\1self.slips[comp + ("max",)].append((season, d, pay))\1if k >= 3:\1    for _md in ("flex", "superflex"):\1        self.slips[comp + (_md,)].append((season, d, FP(s, _md)))\2continue', src, count=1)
assert src2 != src
ns = dict(RSS.__dict__); ns["FP"] = fp
exec(src2, ns)
RSS.SmallBook.day = ns["day"]


def season_stats(v):
    out = {}
    for s in ("2024-25", "2025-26", "2026-27"):
        b = [x for x in v if x[0] == s]
        if not b:
            out[s] = None; continue
        by = defaultdict(float)
        for x in b:
            by[x[1]] += x[2] - 1
        c = np.cumsum([by[d] for d in sorted(by)]); dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
        pays = np.array([x[2] for x in b])
        out[s] = dict(n=len(b), roi=100 * (pays.mean() - 1), pl=float(np.sum(pays - 1)), dd=dd, cash=100 * float(np.mean(pays > 0)), slates=len(by))
    return out


def fmt(key, st):
    src_, how, fl, side, mc, sk, nsl, k, mode = key
    h = f"{src_:<6} {k}p {mode:<9} order={how:<3} p>={fl:.2f} {side:<5} m<={mc:<4g} skip={sk} x{nsl}/slate | "
    parts = []
    for s in ("2024-25", "2025-26", "2026-27"):
        x = st[s]
        parts.append(f"{s[-5:]} n{x['n']:4d} {x['roi']:+6.1f}% P/L {x['pl']:+6.1f}u dd {x['dd']:4.1f}u cash {x['cash']:3.0f}%" if x else f"{s[-5:]} -")
    pl = sum(st[s]["pl"] for s in ("2024-25", "2025-26") if st[s]); dd = max([st[s]["dd"] for s in ("2024-25", "2025-26") if st[s]] or [0])
    return h + " | ".join(parts) + f" | hist P/L {pl:+.1f}u worst dd {dd:.1f}u bal {pl / max(dd, 1):.1f}"


def report(bk):
    rows = {k: season_stats(v) for k, v in bk.slips.items()}
    print("=" * 200 + f"\nFLIFF TRANSFER + FLEX | part {FT.PART} | rules x structures {len(rows)}")
    dep = [("UD-T1", "src", 0.56, "Under", 1.85, 0, 1, 2), ("UD-T1", "pm", 0.0, "Under", 99, 0, 2, 3), ("UD-T1", "fav", 0.56, "any", 99, 0, 2, 2)]
    names = ["F_UDT1_2max_U", "F_UDT1_3max_U_pm", "F_UDT1_2max_fav"]
    if FT.PART == "ud":
        print("\n##### (1) DEPLOYED rules and every size / structure of their own composition")
        for nm, d in zip(names, dep):
            print(f"\n-- {nm} (deployed = {d[7]}p max)")
            for k in range(2, 7):
                for md in ("max", "flex", "superflex"):
                    key = d[:7] + (k, md)
                    if key in rows:
                        print("  " + fmt(key, rows[key]) + ("   <== DEPLOYED" if (k == d[7] and md == "max") else ""))
    print("\n##### (2) best per size and structure: positive in BOTH history seasons (>=75 slips each), ranked by balance (hist P/L / worst dd); skip 0 only; real season shown")
    for k in range(2, 7):
        for md in ("max", "flex", "superflex"):
            pool = [(key, st) for key, st in rows.items() if key[7] == k and key[8] == md and key[5] == 0 and all(st[s] and st[s]["n"] >= 75 and st[s]["roi"] > 0 for s in ("2024-25", "2025-26"))]
            if not pool:
                print(f"\n== {k}-pick {md}: none positive in both history seasons"); continue
            pool.sort(key=lambda r: -(sum(r[1][s]["pl"] for s in ("2024-25", "2025-26")) / max(max(r[1][s]["dd"] for s in ("2024-25", "2025-26")), 1)))
            print(f"\n== {k}-pick {md}: {len(pool)} rules positive in both history seasons; top 8 by balance")
            seen = set(); c = 0
            for key, st in pool:
                sig = (round(st["2024-25"]["roi"], 1), round(st["2025-26"]["roi"], 1))
                if sig in seen:
                    continue
                seen.add(sig); c += 1; print("  " + fmt(key, st))
                if c >= 8:
                    break
    print("\n##### (3) mean ROI by size and structure across every rule with >=75 slips per history season (real season >=3 slips)")
    for k in range(2, 7):
        for md in ("max", "flex", "superflex"):
            g = [st for key, st in rows.items() if key[7] == k and key[8] == md and all(st[s] and st[s]["n"] >= 75 for s in ("2024-25", "2025-26"))]
            if g:
                r27 = [st["2026-27"]["roi"] for st in g if st["2026-27"] and st["2026-27"]["n"] >= 3]
                print(f"  {k}p {md:<9} rules {len(g):5d}  ROI 24-25 {np.mean([x['2024-25']['roi'] for x in g]):+6.1f}%  25-26 {np.mean([x['2025-26']['roi'] for x in g]):+6.1f}%  26-27 {np.mean(r27) if r27 else float('nan'):+6.1f}%  mean worst dd {np.mean([max(x['2024-25']['dd'], x['2025-26']['dd']) for x in g]):.1f}u  positive both hist {100*np.mean([x['2024-25']['roi'] > 0 and x['2025-26']['roi'] > 0 for x in g]):.0f}%")


FT.Book.report_ft = lambda self: report(self)
if __name__ == "__main__":
    FT.main()
