#!/usr/bin/env python3
"""
RESEARCH - PORTFOLIO B ON SMALL SLATES (2026-10-27; owner 13:45 PT "no PrizePicks??? How come that can be right" -> 13:51 "Go for
it"). READ-ONLY.

10-27 (4 games) built 1 of B's 6 slips (the 10-25 / 10-26 slates, 7 / 9 games, built 6 of 6): B's floors (0.62-0.70) and game caps
(1-2 a game) need more games than a small slate has. This study measures, on the SAME history and builder that certified B
(audit_portfolio_b_parity: research_portfolio_caps legs, fixed tie order, the shared portfolio_b builder, trailing cell window,
void legs unknown in advance, PrizePicks payout rules v3):

  0 SLATE SIZES - how many history slates have 2..15 games; B's slips a day and ROI by slate size (as live builds it).
  1 B RELAXED ON SMALL SLATES ONLY (slate <= G games, G = 3..6; bigger slates unchanged): every unit's floor lowered by 0 / .02 /
    .04 / .06 / .08, its game cap +0 / +1, the top-leg skip kept or dropped (every combination). Reported on the small slates alone
    and on the whole two seasons (the change must not hurt the whole).
  2 A GENERIC SMALL-SLATE SLIP (added on small slates only, B unchanged): standard lines, props all / low-volume / no low-volume,
    side any / Over / Under, final_hp floor .54-.70, ranked by final_hp (or final_hp x factor), skip 0 / 1, <= 1 / 2 / 3 a game,
    EVERY structure 2-6 picks, Power and Flex. Ranked by ROI lower bound (ROI - 1 s.e.) on the small slates, both seasons required
    positive, >= 40 slips.
Env: DATABASE_URL, PS_G (comma list of small-slate cutoffs, default 3,4,5,6).
"""
import itertools
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402

GS = [int(x) for x in (os.environ.get("PS_G") or "3,4,5,6").split(",")]
HIST = PC.HIST


def key(l):
    return (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"])


def unit_cand(prep, uid, d=0.0, gadd=0, noskip=False):
    """portfolio_b.candidates with the unit's floor lowered by d, its game cap raised by gadd, its top-leg skip optionally dropped"""
    kind, prm, size, st = PB.UNITS[uid]
    if kind == "f":
        th, sd, _ = prm
        c = [l for l in prep if l["tier"] == "R" and float(l["p"]) >= th - d and l["side"] == sd]
        c.sort(key=lambda x: -float(x["p"]))
        return c, 2 + gadd, 0
    if kind == "b1":
        pool, side, ps, rk, mp, gc, tp = prm
        base = [l for l in prep if l["tier"] in PB.POOLS[pool] and l["side"] in PB.SIDES[side] and (ps == "all" or l["_grp"] == ps)]
        if rk == "p":
            r = sorted(base, key=lambda l: -l["p"])
        elif rk == "ev":
            r = sorted(base, key=lambda l: -l["p"] * float(l["factor"]))
        elif rk == "blend":
            r = sorted(base, key=lambda l: -l["_blend"])
        else:
            r = sorted(base, key=lambda l: (-l["_trail"], -l["p"]))
        return [l for l in r if l["p"] >= mp - d][0 if noskip else tp:], gc + gadd, 0
    lv, side, ps, rk, lp, pc, gc = prm
    base = [l for l in prep if l["tier"] == lv and l["side"] in PB.SIDES[side] and (ps == "all" or l["_grp"] == ps)]
    r = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"])))
    if lp != "all":
        r = [l for l in r if l["_lp"] == lp]
    return r, gc + gadd, pc


def metrics(res, seas):
    """res: per slate list of multipliers (1u each) -> dict"""
    pl = np.array([sum(m - 1 for m in d) for d in res]); ns = np.array([len(d) for d in res])
    flat = np.array([m - 1 for d in res for m in d])
    out = {"n": int(ns.sum()), "days": len(res), "active": int((ns > 0).sum())}
    if not len(flat):
        return dict(out, roi=0, lb=0, dd=0, won=0, **{s: 0 for s in HIST}, **{"n_" + s: 0 for s in HIST})
    out["roi"] = flat.mean(); out["lb"] = flat.mean() - flat.std(ddof=1) / np.sqrt(len(flat)) if len(flat) > 1 else flat.mean()
    out["dd"] = PC.max_dd(pl); out["profit"] = pl.sum(); out["won"] = float(np.mean(flat > 0))
    for s in HIST:
        x = np.array([m - 1 for d, ss in zip(res, seas) if ss == s for m in d])
        out[s] = x.mean() if len(x) else 0; out["n_" + s] = len(x)
    return out


def fmt(o):
    return (f"{o['n']:4d} slips on {o['active']:3d}/{o['days']:3d} slates | ROI {100 * o['roi']:+6.1f}% (lb {100 * o['lb']:+6.1f}) | "
            f"{HIST[0]} {100 * o[HIST[0]]:+5.0f}% ({o['n_' + HIST[0]]}) / {HIST[1]} {100 * o[HIST[1]]:+5.0f}% ({o['n_' + HIST[1]]}) | "
            f"max dd {o.get('dd', 0):5.1f}u | slips won {100 * o['won']:.0f}%")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    preps, ngames, seas = [], [], []
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        preps.append(PB.prepare(legs, tr.rates()))
        ngames.append(len({l["event_id"] for l in legs}))
        seas.append(k[0])
        tr.push(legs)
    ngames = np.array(ngames); seas = np.array(seas)
    print(f"{len(horder)} history slates ({', '.join(f'{s} {int((seas == s).sum())}' for s in HIST)})", flush=True)

    # B as live builds it, per slate
    base = [[PC.grade(s, PB.UNITS[u][3]) for u in PB.UNITS for s in [PB.unit_slip(p, u)] if s is not None] for p in preps]

    print("\n0 SLATE SIZES and B as live builds it, by games on the slate")
    for g in sorted(set(ngames)):
        idx = [i for i in range(len(horder)) if ngames[i] == g]
        o = metrics([base[i] for i in idx], seas[idx])
        print(f"  {g:2d} games: {len(idx):3d} slates | B {o['n'] / len(idx):.2f} slips a slate | " + fmt(o))
    whole = metrics(base, seas)
    print(f"  ALL       : " + fmt(whole))

    for G in GS:
        small = [i for i in range(len(horder)) if ngames[i] <= G]
        print(f"\n================ SMALL SLATE = <= {G} games: {len(small)} slates "
              f"({', '.join(f'{s} {int(sum(1 for i in small if seas[i] == s))}' for s in HIST)}) ================")
        ob = metrics([base[i] for i in small], seas[small])
        print("  B AS IS on these slates:   " + fmt(ob))

        print(f"\n  1 B RELAXED on <= {G}-game slates (floor - d, game cap + g, skip dropped) - small slates | whole two seasons")
        rows = []
        for d, gadd, nsk in itertools.product((0, .02, .04, .06, .08), (0, 1), (False, True)):
            if d == 0 and gadd == 0 and not nsk:
                continue
            res = list(base)
            for i in small:
                day = []
                for u in PB.UNITS:
                    c, gc, pc = unit_cand(preps[i], u, d, gadd, nsk)
                    s = PB.select(c, gc, pc, PB.UNITS[u][2])
                    if s is not None:
                        day.append(PC.grade(s, PB.UNITS[u][3]))
                res[i] = day
            os_ = metrics([res[i] for i in small], seas[small]); ow = metrics(res, seas)
            rows.append(((d, gadd, nsk), os_, ow))
        for (d, gadd, nsk), os_, ow in sorted(rows, key=lambda r: -r[1]["lb"]):
            print(f"   floor -{d:.2f} cap +{gadd} {'no skip' if nsk else 'skip   '} | SMALL " + fmt(os_) +
                  f"\n{'':37s}| WHOLE ROI {100 * ow['roi']:+.1f}% ({HIST[0]} {100 * ow[HIST[0]]:+.0f}% / {HIST[1]} {100 * ow[HIST[1]]:+.0f}%), "
                  f"{ow['n']} slips, max dd {ow['dd']:.1f}u (B as is: ROI {100 * whole['roi']:+.1f}%, {whole['n']} slips, dd {whole['dd']:.1f}u)")

        print(f"\n  2 GENERIC SLIP added on <= {G}-game slates (one slip a slate; B unchanged) - every structure 2-6 Power / Flex")
        gen = []
        for props, side, fl, rk, sk, gc in itertools.product(("all", "lowvol", "nolowvol"), ("B", "O", "U"),
                                                              (.54, .56, .58, .60, .62, .64, .66, .70), ("p", "ev"), (0, 1), (1, 2, 3)):
            cands = []
            for i in small:
                p = preps[i]
                c = [l for l in p if l["tier"] == "R" and l["side"] in PB.SIDES[side] and float(l["p"]) >= fl
                     and (props == "all" or (props == "lowvol") == (l["_grp"] == "lowvol"))]
                c.sort(key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"])))
                cands.append(c[sk:])
            for size, st in itertools.product((2, 3, 4, 5, 6), ("power", "flex")):
                if st == "flex" and size < 3:
                    continue
                res = []
                for c in cands:
                    s = PB.select(c, gc, 0, size)
                    res.append([PC.grade(s, st)] if s is not None else [])
                o = metrics(res, seas[small])
                if o["n"] >= 40:
                    gen.append(((props, side, fl, rk, sk, gc, size, st), o))
        ok = [r for r in gen if r[1][HIST[0]] > 0 and r[1][HIST[1]] > 0]
        print(f"   {len(gen)} rules with >= 40 slips; {len(ok)} positive in both seasons - top 30 by ROI lower bound")
        seen = set()
        shown = 0
        for (props, side, fl, rk, sk, gc, size, st), o in sorted(ok, key=lambda r: -r[1]["lb"]):
            sig = (round(o["roi"], 4), o["n"])
            if sig in seen:
                continue
            seen.add(sig); shown += 1
            print(f"   {size}-pick {st:<5} props {props:<8} side {side} p>={fl:.2f} rank {rk:<2} skip {sk} <= {gc} a game | " + fmt(o))
            if shown >= 30:
                break
        print(f"   by structure (best rule of each, both seasons positive):")
        for size, st in itertools.product((2, 3, 4, 5, 6), ("power", "flex")):
            b = [r for r in ok if r[0][6] == size and r[0][7] == st]
            if b:
                (props, side, fl, rk, sk, gc, _, _), o = max(b, key=lambda r: r[1]["lb"])
                print(f"     {size}-pick {st:<5}: props {props} side {side} p>={fl:.2f} rank {rk} skip {sk} <= {gc} a game | " + fmt(o))
            else:
                print(f"     {size}-pick {st:<5}: no rule positive in both seasons with >= 40 slips")
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
