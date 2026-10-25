#!/usr/bin/env python3
"""
RESEARCH - THE SAFE-NINE PORTFOLIO: SLIPS A DAY, CAPS, UNITS AND BANKROLL PERCENTAGE (2026-10-25; owner 11:25 PT: "If we use 1 to 9
everyday, what is the amount of slips it generate in average a day, also applying caps change? Improve or worse it? Try different caps,
units and percentage, granulated to find the sweet spot"). READ-ONLY.

The nine (the lower-drawdown shortlist of research_final_strategies run 40174314973), rebuilt LEG BY LEG so caps can act on the legs:
  1 factor: R final_hp>=0.68 Under [none] 3F              2 R-both-lowvol-trail-p0.62-gc1-skip1 5F
  3 factor: R final_hp>=0.68 Under [none] 3P              4 R-both-lowvol-trail-p0.62-gc1 4F
  5 R-More-all-p-p0.62-gc1-skip1 3P                       6 R-both-lowvol-p-lines low-gc1 4F
  7 R-both-lowvol-blend-p0.70-gc2-skip1 3P                8 factor: R final_hp>=0.55 Under [back-to-back] 3P
  9 RD-both-lowvol-ev-p0.62-gc2-skip1 6F
STAGES
  0  REPLICATION: each strategy alone must reproduce its review numbers (ROI per season, slates, max drawdown).
  1  SLIPS A DAY with no caps + the overlap between the nine (shared legs, identical slips, same-day co-movement).
  2  SUBSETS: all 511 non-empty subsets, flat 1u, no caps -> slips a day, ROI, drawdown, losing days.
  3  CAP SWEEP: max slips a day 1..9 x player cap (slips a player may appear in) x exact-leg cap x day-wide legs-per-game cap x
     drop-or-rebuild (a capped slip is dropped, or rebuilt from the next eligible legs) x priority order (listed / by strength).
  4  UNITS: flat units with per-strategy weights (equal / 1 over drawdown / lower bound) x a daily unit ceiling.
  5  BANKROLL %: stake f% of the bankroll a slip x a daily exposure ceiling g% x weights, compounding; final multiple, max drawdown %,
     worst day %, losing days %.
  6  HONEST CHECK: the sweet spot chosen on 2024-25 alone -> its 2025-26 numbers, and the reverse.
Env: DATABASE_URL.
"""
import itertools
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import research_board_profiles_l1 as L1              # noqa: E402
import research_board_profiles_l3 as L3              # noqa: E402
import research_board_matrix as MX                   # noqa: E402

T0 = time.time()
HIST = L1.REAL_HIST
GRP = L1.GRP
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
POOLS = {"R": ("R",), "RD": ("R", "D1", "D2", "D3")}
BANDS = dict([("none", lambda l: True)] + list(MX.FACTOR_BANDS))

# id, label, kind, params, size, structure, review numbers (2024-25 ROI, slates, 2025-26 ROI, slates, max drawdown)
SPECS = [
    (1, "3F Less>=0.68", "f", (0.68, "Under", "none"), 3, "flex", (30, 50, 34, 75, 4.0)),
    (2, "5F lowvol trail skip1", "b1", ("R", "B", "lowvol", "trail", 0.62, 1, 1), 5, "flex", (108, 48, 103, 69, 6.0)),
    (3, "3P Less>=0.68", "f", (0.68, "Under", "none"), 3, "power", (66, 50, 98, 75, 7.0)),
    (4, "4F lowvol trail", "b1", ("R", "B", "lowvol", "trail", 0.62, 1, 0), 4, "flex", (59, 86, 83, 104, 7.5)),
    (5, "3P More>=0.62 skip1", "b1", ("R", "O", "all", "p", 0.62, 1, 1), 3, "power", (96, 52, 60, 45, 8.0)),
    (6, "4F lowvol low lines", "b2", ("R", "B", "lowvol", "p", "low", 0, 1), 4, "flex", (61, 132, 61, 140, 9.0)),
    (7, "3P lowvol blend>=0.70 skip1", "b1", ("R", "B", "lowvol", "blend", 0.70, 2, 1), 3, "power", (64, 47, 92, 74, 9.0)),
    (8, "3P Less>=0.55 b2b", "f", (0.55, "Under", "back-to-back"), 3, "power", (69, 62, 67, 70, 10.0)),
    (9, "6F lowvol ev>=0.62 gc2 skip1", "b1", ("RD", "B", "lowvol", "ev", 0.62, 2, 1), 6, "flex", (183, 54, 237, 81, 12.4)),
]
NS = len(SPECS)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lkey(l):
    return (l["player"], l["prop"], l["side"], float(l["line"]), l["tier"])


def candidates(days, horder):
    """per slate, per strategy: (ordered candidate legs, game cap, prop-group cap) - exactly the grid's ordering and filters"""
    from collections import deque
    cell_hist = deque(maxlen=20)
    out = []
    for key in horder:
        legs = [l for l in days[key] if l["p"] is not None and l["team_id"] is not None]
        # battery 1 trailing / blend (same 20-slate cell window as research_board_profiles_l2.strategy_grid)
        agg = defaultdict(lambda: [0, 0])
        for h in cell_hist:
            for c, (a, b) in h.items():
                agg[c][0] += a; agg[c][1] += b
        today = defaultdict(lambda: [0, 0])
        for l in legs:
            c = (l["prop"], l["tier"] if l["tier"] == "R" else l["tier"][:2], l["side"])
            a, b = agg.get(c, (0, 0))
            rate = a / b if b >= 30 else float(l["p"])
            l["_trail"] = rate; l["_blend"] = 0.5 * float(l["p"]) + 0.5 * rate; l["_grp"] = GRP.get(l["prop"])
            if l["hit"] is not None:
                today[c][0] += int(l["hit"]); today[c][1] += 1
        cell_hist.append(dict(today))
        # battery 2 line position
        med = defaultdict(list)
        for l in legs:
            med[(l["prop"], l["tier"])].append(float(l["line"]))
        med = {k: float(np.median(v)) for k, v in med.items()}
        for l in legs:
            l["_lp"] = "low" if float(l["line"]) <= med[(l["prop"], l["tier"])] else "high"
        row = []
        for sid, lab, kind, prm, size, st, _ in SPECS:
            if kind == "f":
                th, sd, bn = prm
                f = BANDS[bn]
                c = [l for l in legs if l["tier"] == "R" and l["hit"] is not None and float(l["p"]) >= th and (sd == "both" or l["side"] == sd)]
                c.sort(key=lambda x: -float(x["p"]))
                cc = []
                for l in c:
                    try:
                        if f(l):
                            cc.append(l)
                    except (KeyError, TypeError):
                        pass
                row.append((cc, 2, 0))
            elif kind == "b1":
                pool, side, ps, rk, mp, gc, tp = prm
                base = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (ps == "all" or l["_grp"] == ps)]
                if rk == "p":
                    r = sorted(base, key=lambda l: -l["p"])
                elif rk == "ev":
                    r = sorted(base, key=lambda l: -l["p"] * float(l["factor"]))
                elif rk == "blend":
                    r = sorted(base, key=lambda l: -l["_blend"])
                else:
                    r = sorted(base, key=lambda l: (-l["_trail"], -l["p"]))
                r = [l for l in r if l["p"] >= mp][tp:]
                row.append((r, gc, 0))
            else:
                lv, side, ps, rk, lp, pc, gc = prm
                base = [l for l in legs if l["tier"] == lv and l["side"] in SIDES[side] and (ps == "all" or l["_grp"] == ps)]
                r = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"])))
                if lp != "all":
                    r = [l for l in r if l["_lp"] == lp]
                row.append((r, gc, pc))
        out.append(row)
    return out


def select(cand, gc, pc, size, ban_p=None, ban_l=None, gu=None, gcap=99):
    pick, players, games, grps = [], set(), defaultdict(int), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc or (pc and grps[l["_grp"]] >= pc):
            continue
        if ban_p and l["player"] in ban_p:
            continue
        if ban_l and lkey(l) in ban_l:
            continue
        if gu is not None and gu[l["event_id"]] + games[l["event_id"]] >= gcap:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; grps[l["_grp"]] += 1
        if len(pick) == size:
            break
    if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
        return pick[:size]
    return None


def grade(pick, st):
    sl = [{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]} for l in pick]
    return SE.grade(sl, st)[1]


def max_dd(x):
    if not len(x):
        return 0.0
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))


def sim(C, order, maxs, pcap, lcap, gcap, mode):
    """-> per slate list of (spec index, multiplier) under the caps"""
    res = []
    for row in C:
        pu, lu, gu = defaultdict(int), defaultdict(int), defaultdict(int)
        day = []
        for i in order:
            if len(day) >= maxs:
                break
            cand, gc, pc = row[i]
            size, st = SPECS[i][4], SPECS[i][5]
            if mode == "drop":
                pk = select(cand, gc, pc, size)
                if pk is None:
                    continue
                if any(pu[l["player"]] >= pcap or lu[lkey(l)] >= lcap or gu[l["event_id"]] >= gcap for l in pk):
                    continue
            else:
                ban_p = {p for p, n in pu.items() if n >= pcap}
                ban_l = {k for k, n in lu.items() if n >= lcap}
                pk = select(cand, gc, pc, size, ban_p, ban_l, gu if gcap < 99 else None, gcap)
                if pk is None:
                    continue
            for l in pk:
                pu[l["player"]] += 1; lu[lkey(l)] += 1; gu[l["event_id"]] += 1
            day.append((i, grade(pk, st)))
        res.append(day)
    return res


def flat_metrics(res, seas, w=None):
    """flat units (weight per strategy, default 1) -> dict"""
    w = w if w is not None else np.ones(NS)
    pl = np.array([sum(w[i] * (m - 1.0) for i, m in d) for d in res])
    stk = np.array([sum(w[i] for i, _ in d) for d in res])
    ns = np.array([len(d) for d in res])
    won = sum(1 for d in res for _, m in d if m > 1.0); tot = int(ns.sum())
    act = stk > 0
    out = {"spd": ns.mean(), "spd_act": ns[act].mean() if act.any() else 0, "maxs": int(ns.max()), "zero": float(np.mean(~act)),
           "stake": stk.sum(), "profit": pl.sum(), "roi": pl.sum() / stk.sum() if stk.sum() else 0, "dd": max_dd(pl),
           "lose_days": float(np.mean(pl[act] < 0)) if act.any() else 0, "worst": float(pl.min()), "won": won / tot if tot else 0}
    for s in HIST:
        m = seas == s
        out[s] = pl[m].sum() / stk[m].sum() if stk[m].sum() else 0
        out["dd_" + s] = max_dd(pl[m])
    out["rec"] = out["profit"] / out["dd"] if out["dd"] > 0 else out["profit"]
    out["minroi"] = min(out[s] for s in HIST)
    return out


def fmt(o):
    return (f"slips/day {o['spd']:.2f} (active days {o['spd_act']:.2f}, max {o['maxs']}, no-slip days {100 * o['zero']:.0f}%) | ROI "
            f"{100 * o['roi']:+.0f}% ({HIST[0]} {100 * o[HIST[0]]:+.0f}% / {HIST[1]} {100 * o[HIST[1]]:+.0f}%) | profit {o['profit']:+.0f}u on "
            f"{o['stake']:.0f}u | max dd {o['dd']:.1f}u | profit/dd {o['rec']:.1f} | losing days {100 * o['lose_days']:.0f}% | worst day "
            f"{o['worst']:+.1f}u | slips won {100 * o['won']:.0f}%")


def bankroll(res, seas, f, g, w, start_each=True):
    """stake f * bankroll * w_i a slip, the day's total exposure capped at g * bankroll; compounding. -> per season (multiple, dd%,
    worst day %, losing days %) and continuous multiple"""
    out = {}
    segs = [(s, np.where(seas == s)[0]) for s in HIST] if start_each else [("all", np.arange(len(res)))]
    for s, ix in segs:
        B, peak, mdd, worst, lose, act = 1.0, 1.0, 0.0, 0.0, 0, 0
        for t in ix:
            d = res[t]
            if not d:
                continue
            st = np.array([f * w[i] * B for i, _ in d])
            tot = st.sum()
            if tot > g * B:
                st *= g * B / tot
            r = sum(x * (m - 1.0) for x, (_, m) in zip(st, d))
            act += 1; lose += r < 0
            worst = min(worst, r / B)
            B += r
            peak = max(peak, B); mdd = max(mdd, 1 - B / peak)
        out[s] = (B, mdd, worst, lose / act if act else 0)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    seas = np.array([k[0] for k in horder])
    log("slates: " + ", ".join(f"{s} {int((seas == s).sum())}" for s in HIST))
    L3.attach_ranks(conn, days)
    MX.leg_features(conn, days, horder)
    conn.close()
    C = candidates(days, horder)
    log("candidates built")

    # ---------------- STAGE 0: replication ----------------
    print("\n" + "=" * 170 + "\nSTAGE 0 - REPLICATION (each strategy alone vs the final review)")
    alone = np.full((NS, len(horder)), np.nan)
    for di, row in enumerate(C):
        for i in range(NS):
            pk = select(row[i][0], row[i][1], row[i][2], SPECS[i][4])
            if pk is not None:
                alone[i, di] = grade(pk, SPECS[i][5]) - 1.0
    ok_all = True
    lbs, dds = np.zeros(NS), np.zeros(NS)
    for i, (sid, lab, *_r, rv) in enumerate(SPECS):
        x = alone[i]
        r = []
        for s in HIST:
            v = x[(seas == s) & ~np.isnan(x)]
            r.append((100 * v.mean() if len(v) else 0, len(v)))
        v = x[~np.isnan(x)]
        dd = max_dd(v); dds[i] = max(dd, 1.0)
        lbs[i] = v.mean() - v.std() / np.sqrt(len(v))
        match = abs(r[0][0] - rv[0]) < 1.5 and r[0][1] == rv[1] and abs(r[1][0] - rv[2]) < 1.5 and r[1][1] == rv[3] and abs(dd - rv[4]) < 0.15
        ok_all &= match
        print(f"  {sid} {lab:<30} {HIST[0]} {r[0][0]:+.0f}% ({r[0][1]}d) | {HIST[1]} {r[1][0]:+.0f}% ({r[1][1]}d) | dd {dd:.1f}u | lb "
              f"{100 * lbs[i]:+.0f}% | review {rv[0]:+d}% ({rv[1]}d) / {rv[2]:+d}% ({rv[3]}d) dd {rv[4]}u -> {'MATCH' if match else 'MISMATCH'}")
    print(f"  REPLICATION {'CERTIFIED: all nine match' if ok_all else 'HAS MISMATCHES - read with care'}")

    # ---------------- STAGE 1: no caps, overlap ----------------
    print("\n" + "=" * 170 + "\nSTAGE 1 - ALL NINE EVERY DAY, NO CAPS")
    listed = list(range(NS))
    base = sim(C, listed, 9, 99, 99, 99, "drop")
    ob = flat_metrics(base, seas)
    print("  " + fmt(ob))
    cnt = np.array([len(d) for d in base])
    print("  slips a day distribution: " + ", ".join(f"{k}: {100 * np.mean(cnt == k):.0f}%" for k in range(10) if np.mean(cnt == k) > 0))
    for s in HIST:
        print(f"  {s}: {cnt[seas == s].mean():.2f} slips a slate")
    # overlap
    shared_p, shared_l, ident, multi = [], [], 0, 0
    pairs = defaultdict(lambda: [0, 0])
    for di, row in enumerate(C):
        pk = {}
        for i in range(NS):
            p = select(row[i][0], row[i][1], row[i][2], SPECS[i][4])
            if p is not None:
                pk[i] = p
        pc, lc = defaultdict(int), defaultdict(int)
        for p in pk.values():
            for l in p:
                pc[l["player"]] += 1; lc[lkey(l)] += 1
        if pc:
            shared_p.append(max(pc.values())); shared_l.append(max(lc.values()))
        for a, b in itertools.combinations(sorted(pk), 2):
            sa, sb = {lkey(l) for l in pk[a]}, {lkey(l) for l in pk[b]}
            pairs[(a, b)][0] += 1; pairs[(a, b)][1] += len(sa & sb) > 0
            if sa == sb:
                ident += 1
    print(f"  most slips one player sits in on a day: mean {np.mean(shared_p):.2f}, max {max(shared_p)}; same exact leg: mean "
          f"{np.mean(shared_l):.2f}, max {max(shared_l)}; identical leg sets across two strategies: {ident} slate-pairs")
    corr = np.full((NS, NS), np.nan)
    for a in range(NS):
        for b in range(NS):
            m = ~np.isnan(alone[a]) & ~np.isnan(alone[b])
            if m.sum() >= 15 and a != b:
                corr[a, b] = np.corrcoef(alone[a][m], alone[b][m])[0, 1]
    print("  pairs sharing >= 1 leg when both play (% of co-played slates) and return correlation:")
    for (a, b), (n, s_) in sorted(pairs.items()):
        if n >= 10:
            print(f"    {a + 1}-{b + 1}: co-played {n}, share a leg {100 * s_ / n:.0f}%, corr {corr[a, b]:+.2f}")

    # ---------------- STAGE 2: subsets ----------------
    print("\n" + "=" * 170 + "\nSTAGE 2 - EVERY SUBSET OF THE NINE (flat 1u, no caps)")
    A = np.nan_to_num(alone)
    V = ~np.isnan(alone)
    rows = []
    for k in range(1, NS + 1):
        for sub in itertools.combinations(range(NS), k):
            sub = list(sub)
            pl = A[sub].sum(axis=0); stk = V[sub].sum(axis=0)
            act = stk > 0
            per = [pl[seas == s].sum() / max(stk[seas == s].sum(), 1) for s in HIST]
            dd = max_dd(pl)
            rows.append((sub, stk.mean(), pl.sum() / stk.sum(), per, dd, pl.sum() / dd if dd else pl.sum(), np.mean(pl[act] < 0), pl.min(),
                         pl.sum()))
    def pr(r):
        return (f"{'+'.join(str(i + 1) for i in r[0]):<20} slips/day {r[1]:.2f} | ROI {100 * r[2]:+.0f}% ({100 * r[3][0]:+.0f}% / "
                f"{100 * r[3][1]:+.0f}%) | profit {r[8]:+.0f}u | dd {r[4]:.1f}u | profit/dd {r[5]:.1f} | losing days {100 * r[6]:.0f}% | "
                f"worst day {r[7]:+.1f}u")
    for lab, key in (("best profit / drawdown", lambda r: -r[5]), ("lowest losing-day share (>= 1 slip a day avg)", lambda r: (r[6] if r[1] >= 1 else 9, -r[5])),
                     ("smallest drawdown with profit >= 150u", lambda r: (r[4] if r[8] >= 150 else 999, -r[8])),
                     ("most profit with dd <= 15u", lambda r: (-r[8] if r[4] <= 15 else 0, r[4]))):
        print(f"  -- {lab}")
        for r in sorted(rows, key=key)[:10]:
            print("    " + pr(r))
    print("  -- by number of strategies (best profit/dd at each size)")
    for k in range(1, NS + 1):
        r = max([r for r in rows if len(r[0]) == k], key=lambda r: r[5])
        print("    " + pr(r))

    # ---------------- STAGE 3: caps ----------------
    print("\n" + "=" * 170 + "\nSTAGE 3 - CAP SWEEP (flat 1u)")
    strength = list(np.argsort(-lbs))
    orders = {"listed": listed, "strength": strength}
    print(f"  strength order (lower bound): {[i + 1 for i in strength]}")
    grid = []
    n = 0
    for on, od in orders.items():
        for mode in ("drop", "rebuild"):
            for maxs in range(1, 10):
                for pcap in (1, 2, 3, 4, 6, 99):
                    for lcap in (1, 2, 3, 99):
                        if lcap > pcap and lcap != 99:
                            continue
                        for gcap in (2, 3, 4, 6, 8, 99):
                            r = sim(C, od, maxs, pcap, min(lcap, pcap), gcap, "drop" if mode == "drop" else "rebuild")
                            o = flat_metrics(r, seas)
                            grid.append(((on, mode, maxs, pcap, lcap, gcap), o, r))
                            n += 1
        log(f"cap sweep: {n} configs ({on})")
    def cl(c):
        on, mode, maxs, pcap, lcap, gcap = c
        q = lambda v: "none" if v == 99 else str(v)
        return f"[{on} {mode} max {maxs}/day, player<= {q(pcap)}, leg<= {q(lcap)}, game legs<= {q(gcap)}]"
    print(f"  baseline no caps: " + fmt(ob))
    for lab, key in (("best profit / drawdown", lambda g: -g[1]["rec"]),
                     ("smallest drawdown with ROI >= +60% and >= 1.5 slips a day", lambda g: (g[1]["dd"] if g[1]["roi"] >= 0.6 and g[1]["spd"] >= 1.5 else 999, -g[1]["profit"])),
                     ("lowest losing-day share with >= 1.5 slips a day", lambda g: (g[1]["lose_days"] if g[1]["spd"] >= 1.5 else 9, -g[1]["rec"])),
                     ("most profit with max dd <= 12u", lambda g: (-g[1]["profit"] if g[1]["dd"] <= 12 else 0, g[1]["dd"])),
                     ("best weaker-season ROI with >= 2 slips a day", lambda g: (-g[1]["minroi"] if g[1]["spd"] >= 2 else 9, 0))):
        print(f"  -- {lab}")
        for g in sorted(grid, key=key)[:12]:
            print(f"    {cl(g[0])} " + fmt(g[1]))
    # one knob at a time from the baseline (listed, drop)
    print("  -- one knob at a time (listed order, all else uncapped)")
    for knob, vals in (("maxs", range(1, 10)), ("pcap", (1, 2, 3, 4, 6, 99)), ("lcap", (1, 2, 3, 99)), ("gcap", (2, 3, 4, 6, 8, 99))):
        for mode in ("drop", "rebuild"):
            for v in vals:
                c = {"maxs": 9, "pcap": 99, "lcap": 99, "gcap": 99}
                c[knob] = v
                key = ("listed", mode, c["maxs"], c["pcap"], c["lcap"], c["gcap"])
                g = next((g for g in grid if g[0] == key), None)
                if g:
                    print(f"    {knob}={v:<3} {mode:<8} " + fmt(g[1]))

    # ---------------- STAGE 6a: honest cap choice ----------------
    print("  -- HONEST CHECK: best profit/dd chosen on one season -> the other season")
    for tr, te in ((HIST[0], HIST[1]), (HIST[1], HIST[0])):
        def rec_s(g, s):
            r = g[2]; m = seas == s
            pl = np.array([sum(mm - 1 for _, mm in d) for d in r])[m]
            dd = max_dd(pl)
            return pl.sum() / dd if dd else pl.sum()
        best = sorted(grid, key=lambda g: -rec_s(g, tr))[:5]
        for g in best:
            print(f"    chosen on {tr}: {cl(g[0])} profit/dd {tr} {rec_s(g, tr):.1f} -> {te} {rec_s(g, te):.1f} | ROI {te} {100 * g[1][te]:+.0f}% "
                  f"| dd {te} {g[1]['dd_' + te]:.1f}u (baseline {te}: profit/dd {rec_s((None, None, base), te):.1f}, ROI {100 * ob[te]:+.0f}%, "
                  f"dd {ob['dd_' + te]:.1f}u)")

    # ---------------- STAGE 4: units ----------------
    print("\n" + "=" * 170 + "\nSTAGE 4 - UNITS (weights per strategy x daily unit ceiling)")
    W = {"equal": np.ones(NS), "1/drawdown": (1 / dds) / np.mean(1 / dds), "lower bound": np.maximum(lbs, 0.01) / np.mean(np.maximum(lbs, 0.01))}
    for k, w in W.items():
        print(f"  weights {k}: " + ", ".join(f"{i + 1}:{w[i]:.2f}" for i in range(NS)))
    cands = [("no caps", ("listed", "drop", 9, 99, 99, 99), base)]
    seen = set()
    for g in sorted(grid, key=lambda g: -g[1]["rec"]):
        if g[0] not in seen and len(cands) < 6:
            cands.append(("best profit/dd #" + str(len(cands)), g[0], g[2])); seen.add(g[0])
    for g in sorted(grid, key=lambda g: (g[1]["dd"] if g[1]["roi"] >= 0.6 and g[1]["spd"] >= 1.5 else 999)):
        if g[0] not in seen:
            cands.append(("low-dd pick", g[0], g[2])); seen.add(g[0]); break
    for nm, c, r in cands:
        print(f"  == {nm} {cl(c)}")
        for wk, w in W.items():
            for U in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 99):
                rr = []
                for d in r:
                    s_ = sum(w[i] for i, _ in d)
                    k_ = min(1.0, U / s_) if s_ > 0 else 1.0
                    rr.append([(i, m, w[i] * k_) for i, m in d])
                pl = np.array([sum(x * (m - 1) for _, m, x in d) for d in rr]); stk = np.array([sum(x for _, _, x in d) for d in rr])
                act = stk > 0
                dd = max_dd(pl)
                per = [pl[seas == s].sum() / max(stk[seas == s].sum(), 1e-9) for s in HIST]
                print(f"    {wk:<12} daily ceiling {'none' if U == 99 else str(U) + 'u':<6} avg stake/day {stk.mean():.2f}u | ROI "
                      f"{100 * pl.sum() / stk.sum():+.0f}% ({100 * per[0]:+.0f}% / {100 * per[1]:+.0f}%) | profit {pl.sum():+.0f}u | dd {dd:.1f}u | "
                      f"profit/dd {pl.sum() / dd if dd else 0:.1f} | dd in days of stake {dd / stk[act].mean():.1f} | losing days "
                      f"{100 * np.mean(pl[act] < 0):.0f}% | worst day {pl.min():+.1f}u")

    # ---------------- STAGE 5: bankroll % ----------------
    print("\n" + "=" * 170 + "\nSTAGE 5 - BANKROLL PERCENTAGE (compounding, bankroll restarts at 1.0 each season)")
    FS = (0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10)
    GS = (0.05, 0.075, 0.10, 0.125, 0.15, 0.20, 0.25, 0.30, 0.40, 1.0)
    allres = []
    for nm, c, r in cands:
        for wk, w in W.items():
            for f in FS:
                for g_ in GS:
                    b = bankroll(r, seas, f, g_, w)
                    allres.append((nm, c, wk, f, g_, b))
    def pb(x):
        nm, c, wk, f, g_, b = x
        return (f"{nm:<20} {wk:<12} {100 * f:.2f}% a slip, day cap {'none' if g_ >= 1 else f'{100 * g_:.1f}%'} | "
                + " | ".join(f"{s}: x{b[s][0]:.2f}, max dd {100 * b[s][1]:.1f}%, worst day {100 * b[s][2]:+.1f}%, losing days {100 * b[s][3]:.0f}%" for s in HIST))
    for lab, key in (("max dd <= 10% in both seasons, most growth (weaker season)", lambda x: -min(x[5][s][0] for s in HIST) if max(x[5][s][1] for s in HIST) <= 0.10 else 0),
                     ("max dd <= 15% in both seasons, most growth", lambda x: -min(x[5][s][0] for s in HIST) if max(x[5][s][1] for s in HIST) <= 0.15 else 0),
                     ("max dd <= 20% in both seasons, most growth", lambda x: -min(x[5][s][0] for s in HIST) if max(x[5][s][1] for s in HIST) <= 0.20 else 0),
                     ("max dd <= 30% in both seasons, most growth", lambda x: -min(x[5][s][0] for s in HIST) if max(x[5][s][1] for s in HIST) <= 0.30 else 0),
                     ("growth per unit of drawdown (log multiple / max dd, weaker season)", lambda x: -min(np.log(x[5][s][0]) / max(x[5][s][1], 0.01) for s in HIST))):
        print(f"  -- {lab}")
        for x in sorted(allres, key=key)[:10]:
            print("    " + pb(x))
    print("  -- the curve (no caps vs best profit/dd #1, equal weights, no day cap): f -> per season multiple / max dd")
    for nm in ("no caps", "best profit/dd #1"):
        for f in FS:
            x = next(x for x in allres if x[0] == nm and x[2] == "equal" and x[3] == f and x[4] >= 1)
            print(f"    {nm:<18} {100 * f:5.2f}%: " + " | ".join(f"{s} x{x[5][s][0]:.2f} dd {100 * x[5][s][1]:.0f}% worst day {100 * x[5][s][2]:+.0f}%" for s in HIST))
    # honest staking choice
    print("  -- HONEST CHECK: staking chosen on one season (max dd <= 15%, most growth) -> the other")
    for tr, te in ((HIST[0], HIST[1]), (HIST[1], HIST[0])):
        best = sorted(allres, key=lambda x: -x[5][tr][0] if x[5][tr][1] <= 0.15 else 0)[:3]
        for x in best:
            print(f"    chosen on {tr}: {x[0]} {x[2]} {100 * x[3]:.2f}% cap {x[4]} -> {tr} x{x[5][tr][0]:.2f} dd {100 * x[5][tr][1]:.0f}% | {te} "
                  f"x{x[5][te][0]:.2f} dd {100 * x[5][te][1]:.0f}%")
    log("done")


if __name__ == "__main__":
    main()
