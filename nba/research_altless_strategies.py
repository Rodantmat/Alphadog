#!/usr/bin/env python3
"""
GOBLIN / DEMON LESS STRATEGIES - FIXED RULES, REAL DAILY SLIPS (2026-10-20, owner: "if the multipliers sustain to keep it positive
... that's good enough to try ... find strategies, backtest with real slips, real data ... bring up new logics ... anything that's
proved positive, we will try"). READ-ONLY.

WHY FIXED RULES. The exhaustive search (research_exhaustive_pp.py) showed that choosing the best pattern on one season fails on
the other (in-sample +190-470% -> out of sample -1% to -53%). Here every strategy is a rule written down BEFORE grading - which
legs, how deep in the ranking, how many, which structure - and every rule is reported on BOTH seasons, none dropped. A rule is
called positive only if it is positive in both seasons AND its day-block bootstrap 5th percentile is reported next to it.

LEGS (history never offered alternate Less - simulated exactly as research_exhaustive_pp, whose functions are imported):
  goblin / demon rungs of points / PRA / rebounds / assists, tiers 1-3, rungs PrizePicks opens to Less (quote-level More p
  0.30-0.70, measured on the 10-20 board), real outcome at the rung (stat < line; a whole-number tie voids), PrizePicks' Less
  price = the complement of More (S 0.99, floor 1.7x, 3% conservative). PAYOUTS: proven 2026-10-20 against 544 PrizePicks
  multi-pick quotes (grid + stack runs: grader / quote 0.91-0.97 on average for 3-6 picks with up to 6 alternate Less legs).
  2-pick Power with an alternate: compress(3 fp) overpaid two-alternate pairs up to 11% -> x 0.93 here (the 10th percentile of
  quote / law, 56 quotes). 2-pick Flex with an alternate: PrizePicks' own quote envelope (install_flex2_alt).
  rmin = the leg's best REVERSE rank among the three rank keys (1 = the rung the model rates least likely to go over that day,
  within its prop and tier).

RULE FAMILIES (each x sizes 2..6 x Power / Flex):
  A  pool in {UG goblin-Less, UD demon-Less, UG+UD}, depth rmin <= N (N in 1, 2, 3, 5, 10); legs ordered by (rmin, higher
     payout factor); one slip a day of the first k legs that fit the slip rules.  No training at all.
  B  same pools, ordered by the OTHER season's cell value e = mean(hit x factor) per (prop, tier group, rmin) - trained on one
     season, applied to the other (both directions).
  C  mixed: (k - m) legs of rule A (UG+UD, N 3) + m best standard Unders (tier R, rank <= 2 under any key), m in 1, 2.
  D  volume: rule A UG+UD N 5, TWO disjoint slips a day (the second built from the legs the first did not use).
Slip rules everywhere: one leg per player, at most 2 legs from one game, at least 2 teams. Final 7 days of each season left out.
Env: DATABASE_URL, AS_BOOT (2000).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE        # noqa: E402  certified grader v3
import research_exhaustive_pp as EX   # noqa: E402  ALT_LESS_SQL, LEG_SQL, less_open, less_price, install_flex2_alt

BOOT = int(os.environ.get("AS_BOOT", "2000"))
SEASONS = ("2024-25", "2025-26")
SIZES = (2, 3, 4, 5, 6)
MAX_SG = 2

_orig_pay = SE.pp_payout


def _pay(k, hits, structure, fprod, alt, same_game=False):
    p = _orig_pay(k, hits, structure, fprod, alt, same_game)
    if structure == "power" and k == 2 and alt:
        p *= 0.93                     # 2-pick alternate Power: conservative (see header)
    return p


SE.pp_payout = _pay


def load():
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as c:
        c.execute("SET statement_timeout = 0")
        cur = c.execute(EX.ALT_LESS_SQL)
        cols = [x.name for x in cur.description]
        alt = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur = c.execute(EX.LEG_SQL)
        cols = [x.name for x in cur.description]
        std = [dict(zip(cols, r)) for r in cur.fetchall()]
    with psycopg.connect(url) as c:
        EX.install_flex2_alt(c)
    alt = [r for r in alt if EX.less_open(r["f_over"], r["tier"])]
    for r in alt:
        r["factor"] = EX.less_price(r.pop("f_over"), r["tier"])
        st = r.pop("stat_actual")
        r["hit"] = None if st is None or st == r["line"] else int(st < r["line"])
        r["grp"] = "UG" if r["tier"][1] == "G" else "UD"
    stdU = [r for r in std if r["tier"] == "R" and str(r["side"]).lower().startswith("u")]
    for r in alt + stdU:
        ks = [r.get(k) for k in ("n_fs", "n_fh", "n_bh") if r.get(k) is not None]
        r["rmin"] = min(ks) if ks else 99
    last = {s: max(r["game_date"] for r in alt if r["season"] == s) for s in SEASONS}
    keep = lambda r: (last[r["season"]] - r["game_date"]).days > 7   # noqa: E731
    return [r for r in alt if keep(r)], [r for r in stdU if keep(r) and r["rmin"] <= 2]


def build(cands, k, used=None):
    used_p = set(used or ())
    games, slip = defaultdict(int), []
    for l in cands:
        if l["player"] in used_p or games[l["event_id"]] >= MAX_SG:
            continue
        slip.append(l)
        used_p.add(l["player"])
        games[l["event_id"]] += 1
        if len(slip) == k:
            break
    if len(slip) < k or len({l["team_id"] for l in slip}) < 2:
        return None
    return slip


def boot_lb(prof, stake):
    if len(prof) < 10:
        return None
    rng = np.random.default_rng(7)
    p, s = np.array(prof), np.array(stake)
    idx = rng.integers(0, len(p), size=(BOOT, len(p)))
    return float(np.percentile(p[idx].sum(1) / s[idx].sum(1), 5))


def evaluate(days_slips):
    """days_slips: {day: [slip, ...]} for one structure -> metrics"""
    out = {}
    for st in ("power", "flex"):
        prof, stake, full, legs, lh = [], [], 0, 0, 0
        for d in sorted(days_slips):
            dp, ds = 0.0, 0.0
            for slip in days_slips[d]:
                if st == "flex" and len(slip) == 2 and any(abs(x["factor"] - 1) > 1e-9 for x in slip) and not EX.FLEX2_ON:
                    continue
                hits, pay = SE.grade(slip, st)
                dp += pay - 1.0
                ds += 1.0
                full += int(hits == len(slip))
                legs += sum(1 for x in slip if x["hit"] is not None)
                lh += sum(int(x["hit"]) for x in slip if x["hit"] is not None)
            if ds:
                prof.append(dp)
                stake.append(ds)
        n = sum(stake)
        out[st] = {"days": len(prof), "slips": int(n), "roi": (sum(prof) / n) if n else None, "full": full / n if n else None,
                   "leg_hit": lh / legs if legs else None, "lb5": boot_lb(prof, stake)}
    return out


def cell_e(legs):
    acc = defaultdict(lambda: [0, 0.0])
    for l in legs:
        if l["hit"] is None:
            continue
        key = (l["prop"], l["grp"], min(l["rmin"], 11))
        acc[key][0] += 1
        acc[key][1] += l["hit"] * l["factor"]
    return {k: v[1] / v[0] for k, v in acc.items() if v[0] >= 50}


def main():
    alt, stdU = load()
    print(f"alternate-Less legs (simulated, Less-open rungs): {len(alt):,}; standard Under legs (rank <= 2): {len(stdU):,}", flush=True)

    # LEG LEVEL - the base of everything: hit vs the price-implied probability, by pool and depth
    print("\nLEG LEVEL: hit rate vs break-even (1 / (2 x factor) ~ PrizePicks' implied Less probability) by pool, depth, season", flush=True)
    for grp in ("UG", "UD"):
        for N in (1, 2, 3, 5, 10):
            row = []
            for s in SEASONS:
                ls = [l for l in alt if l["season"] == s and l["grp"] == grp and l["rmin"] <= N and l["hit"] is not None]
                if ls:
                    h = np.mean([l["hit"] for l in ls]); imp = np.mean([0.5 / l["factor"] for l in ls])
                    e = np.mean([l["hit"] * l["factor"] for l in ls])
                    row.append(f"{s} n {len(ls):>6,} hit {h:.3f} implied {imp:.3f} e {e:.3f}")
            print(f"  {grp} rmin<={N:<2} | " + " | ".join(row), flush=True)
    print("  (e = mean hit x factor: a 2-pick Power alternate slip breaks even near e 0.58, 6-pick near e 0.53 at these factors)", flush=True)

    by = {s: [l for l in alt if l["season"] == s] for s in SEASONS}
    sby = {s: [l for l in stdU if l["season"] == s] for s in SEASONS}
    results = []

    def run(label, s, make):
        days = defaultdict(list)
        ds = sorted({l["game_date"] for l in by[s]})
        for d in ds:
            for slip in make(d):
                days[d].append(slip)
        m = evaluate(days)
        results.append((label, s, m))

    day_idx = {s: defaultdict(list) for s in SEASONS}
    for s in SEASONS:
        for l in by[s]:
            day_idx[s][l["game_date"]].append(l)
    sday = {s: defaultdict(list) for s in SEASONS}
    for s in SEASONS:
        for l in sby[s]:
            sday[s][l["game_date"]].append(l)

    pools = {"UG": ("UG",), "UD": ("UD",), "UG+UD": ("UG", "UD")}
    # A - fixed rules
    for pname, grps in pools.items():
        for N in (1, 2, 3, 5, 10):
            for k in SIZES:
                for s in SEASONS:
                    def mk(d, s=s, grps=grps, N=N, k=k):
                        c = sorted([l for l in day_idx[s][d] if l["grp"] in grps and l["rmin"] <= N], key=lambda l: (l["rmin"], -l["factor"], l["player"]))
                        sl = build(c, k)
                        return [sl] if sl else []
                    run(f"A {pname:<5} N{N:<2} {k}p", s, mk)
    # B - trained ordering (other season's cell value)
    for pname, grps in pools.items():
        for k in SIZES:
            for s in SEASONS:
                other = SEASONS[1] if s == SEASONS[0] else SEASONS[0]
                ce = cell_e(by[other])

                def mk(d, s=s, grps=grps, k=k, ce=ce):
                    c = [l for l in day_idx[s][d] if l["grp"] in grps and ce.get((l["prop"], l["grp"], min(l["rmin"], 11))) is not None]
                    c.sort(key=lambda l: (-ce[(l["prop"], l["grp"], min(l["rmin"], 11))], l["rmin"], l["player"]))
                    sl = build(c, k)
                    return [sl] if sl else []
                run(f"B {pname:<5} e-order {k}p", s, mk)
    # C - mixed with standard Unders
    for m_std in (1, 2):
        for k in SIZES:
            if k - m_std < 1:
                continue
            for s in SEASONS:
                def mk(d, s=s, k=k, m_std=m_std):
                    a = sorted([l for l in day_idx[s][d] if l["rmin"] <= 3], key=lambda l: (l["rmin"], -l["factor"], l["player"]))
                    u = sorted(sday[s].get(d, []), key=lambda l: (l["rmin"], -(l["score"] or 0), l["player"]))
                    first = build(a, k - m_std)
                    if not first:
                        return []
                    rest = build(u, m_std, used={l["player"] for l in first})
                    if not rest:
                        return []
                    sl = first + rest
                    g = defaultdict(int)
                    for l in sl:
                        g[l["event_id"]] += 1
                    if max(g.values()) > MAX_SG:
                        return []
                    return [sl]
                run(f"C UG+UD N3 +{m_std}stdU {k}p", s, mk)
    # D - two slips a day
    for k in SIZES:
        for s in SEASONS:
            def mk(d, s=s, k=k):
                c = sorted([l for l in day_idx[s][d] if l["rmin"] <= 5], key=lambda l: (l["rmin"], -l["factor"], l["player"]))
                s1 = build(c, k)
                if not s1:
                    return []
                ids = {id(x) for x in s1}
                s2 = build([x for x in c if id(x) not in ids], k, used={x["player"] for x in s1})
                return [s1] + ([s2] if s2 else [])
            run(f"D UG+UD N5 x2 {k}p", s, mk)

    # REPORT - every rule, both seasons, both structures
    tab = defaultdict(dict)
    for label, s, m in results:
        tab[label][s] = m
    for st in ("power", "flex"):
        print(f"\n=== {st.upper()} - every rule, both seasons (ROI / LB5 = day-block bootstrap 5th pct / days / full-hit / leg hit) ===", flush=True)
        rows = []
        for label, d in tab.items():
            a, b = d.get(SEASONS[0], {}).get(st), d.get(SEASONS[1], {}).get(st)
            if not a or not b or a["roi"] is None or b["roi"] is None:
                continue
            rows.append((min(a["roi"], b["roi"]), label, a, b))
        rows.sort(key=lambda r: -r[0])
        for mn, label, a, b in rows:
            f = lambda m: f"{m['roi'] * 100:+7.1f}% LB5 {('%+.0f%%' % (m['lb5'] * 100)) if m['lb5'] is not None else '  n/a'} d{m['days']:>3} full {m['full']:.3f} leg {m['leg_hit']:.3f}"   # noqa: E731
            print(f"  {label:<26} | 24-25 {f(a)} | 25-26 {f(b)}", flush=True)
        pos = sum(1 for r in rows if r[0] > 0)
        pos_lb = sum(1 for r in rows if r[0] > 0 and r[2]["lb5"] is not None and r[3]["lb5"] is not None and min(r[2]["lb5"], r[3]["lb5"]) > 0)
        print(f"  {st}: {pos} of {len(rows)} rules positive in BOTH seasons; {pos_lb} also with LB5 > 0 in both", flush=True)


if __name__ == "__main__":
    main()
