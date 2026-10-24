#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES, LAYER 2: EVERY STRATEGY PER PROFILE (2026-10-24; owner 2026-10-23 13:11 - 13:23 PT: "with the profiles
that we identified ... now we work strategies ... every single possible strategy. A strategy with different prop lines, with goblins,
with demons, goblins and demons, tiers, more, less, variations, trailing, hit rate rank ..., final hit probability, final score,
different caps on the different ranks ... then flex, power, different slip structure, 2, 3, 4, 5, 6 pick for each one of the
profiles"; 16:00 PT: "Any kind of slip can apply to any kind of profile"). READ-ONLY.

PROFILES come from Layer 1 (research_board_profiles_l1.build: the registry of recurring, identifiable, distinct board profiles,
defined without any strategy). Only the two historical seasons are graded (2026-27 slates have no results yet).

STRATEGY GRID (one slip a slate per strategy, built from that slate's calibrated legs, graded by build_slip_engine.grade with
PrizePicks' payouts incl. per-leg multipliers):
  line type   R (standard) / G (every goblin) / D (every demon) / GR / RD / GD / ALL
  side        More / Less / both
  props       all / points / rebounds / assists / threes / combos / low-volume / core (no low-volume)
  rank        final_hp / EV (final_hp x multiplier) / BLEND (final_hp with the leg's prop x line type x side trailing-20-slate hit
              rate, 50 / 50) / TRAIL (that trailing hit rate alone, final_hp as tie-break) - trailing rates use earlier slates only
  min final_hp none / 0.55 / 0.62 / 0.70
  game cap    1 / 2 legs per game (distinct players, >= 2 teams always)
  top         take the best-ranked legs, or skip the single best (top 2..)
  structure   2P 3P 3F 4P 4F 5P 5F 6P 6F
  -> 96,768 strategies.

PER PROFILE, both directions (fit on one season, read on the other):
  own picks    the 5 best strategies on the profile's slates of the fit season (score = mean - sd / sqrt(n), played on >= max(8,
               half the profile's slates))
  global picks the 5 best on ALL slates of the fit season
  both read on the profile's slates of the test season: diff = own - global (units per slip).
  p: the same procedure on random slate sets of the same sizes (LP_NULL draws, batched), one-sided.
  WORKS when diff > 0 in BOTH directions and the larger of the two p values survives Benjamini-Hochberg over all profiles at
  q 0.10. Also counted per profile: strategies better on the profile than on all slates with lower bound > 0 in BOTH seasons,
  vs the same count on random slate sets (p95).
BATTERY 2 (L2_GRID=2; owner 2026-10-24 00:14 PT: "slip strategy battery non stop over all profiles"): every single goblin / demon
  level on its own (G1 G2 G3 D1 D2 D3, and standard), More / Less / both, the 8 prop sets, rank final_hp / EV, PROP-LINE position
  (all lines / lines at or below the slate's median line of that prop and line type / above it), a PROP-GROUP cap (none / at most
  2 legs of one prop group), game cap 1 / 2, the 9 structures -> 36,288 strategies, judged exactly like battery 1.
Env: DATABASE_URL, LP_NULL (default 200), L2_ONLY (comma list of profile numbers, e.g. 1,5,12 - default all), L2_GRID (1 / 2).
"""
import os
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import research_board_profiles_l1 as L1              # noqa: E402

T0 = time.time()
NULL = int(os.environ.get("LP_NULL", "200"))
ONLY = {int(x) for x in os.environ.get("L2_ONLY", "").split(",") if x.strip()}
RNG = np.random.default_rng(29)
GRID = int(os.environ.get("L2_GRID", "1"))
PER_STRUCT = os.environ.get("L2_PER_STRUCT", "1") == "1"
HIST = L1.HIST
GRP = L1.GRP
POOLS = {"R": ("R",), "G": ("G1", "G2", "G3"), "D": ("D1", "D2", "D3"), "GR": ("R", "G1", "G2", "G3"), "RD": ("R", "D1", "D2", "D3"),
         "GD": ("G1", "G2", "G3", "D1", "D2", "D3"), "ALL": ("R", "G1", "G2", "G3", "D1", "D2", "D3")}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
PROPSETS = {"all": None, "points": {"points"}, "rebounds": {"rebounds"}, "assists": {"assists"}, "threes": {"threes"},
            "combos": {"combos"}, "lowvol": {"lowvol"}, "core": {"points", "rebounds", "assists", "threes", "combos"}}
RANKS = ("p", "ev", "blend", "trail")
MINPS = (0.0, 0.55, 0.62, 0.70)
GAMECAPS = (1, 2)
TOPS = (0, 1)
STRUCTS = ((2, "power"), (3, "power"), (3, "flex"), (4, "power"), (4, "flex"), (5, "power"), (5, "flex"), (6, "power"), (6, "flex"))
OWNER_SCOPE = {(2, "power"), (3, "power"), (4, "flex"), (5, "flex"), (6, "flex")}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def tier_of(t):
    return t if t == "R" else t[:2]


def strategy_grid(days, order):
    combos = [(pool, side, ps, rk, mp, gc, tp) for pool in POOLS for side in SIDES for ps in PROPSETS for rk in RANKS for mp in MINPS
              for gc in GAMECAPS for tp in TOPS]
    strat = [(c, size, st) for c in combos for (size, st) in STRUCTS]
    P = np.full((len(strat), len(order)), np.nan, np.float32)
    nst = len(STRUCTS)
    cell_hist = deque(maxlen=20)
    for di, key in enumerate(order):
        legs = [l for l in days[key] if l["p"] is not None and l["team_id"] is not None]
        agg = defaultdict(lambda: [0, 0])
        for h in cell_hist:
            for c, (a, b) in h.items():
                agg[c][0] += a; agg[c][1] += b
        today = defaultdict(lambda: [0, 0])
        for l in legs:
            c = (l["prop"], tier_of(l["tier"]), l["side"])
            a, b = agg.get(c, (0, 0))
            rate = a / b if b >= 30 else float(l["p"])
            l["_trail"] = rate
            l["_blend"] = 0.5 * float(l["p"]) + 0.5 * rate
            l["_grp"] = GRP.get(l["prop"])
            if l["hit"] is not None:
                today[c][0] += int(l["hit"]); today[c][1] += 1
        cell_hist.append(dict(today))
        ci = 0
        for pool in POOLS:
            for side in SIDES:
                for ps, pset in PROPSETS.items():
                    base = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (pset is None or l["_grp"] in pset)]
                    for rk in RANKS:
                        if rk == "p":
                            ranked = sorted(base, key=lambda l: -l["p"])
                        elif rk == "ev":
                            ranked = sorted(base, key=lambda l: -l["p"] * float(l["factor"]))
                        elif rk == "blend":
                            ranked = sorted(base, key=lambda l: -l["_blend"])
                        else:
                            ranked = sorted(base, key=lambda l: (-l["_trail"], -l["p"]))
                        for mp in MINPS:
                            cand = [l for l in ranked if l["p"] >= mp]
                            for gc in GAMECAPS:
                                for tp in TOPS:
                                    pick, players, games = [], set(), defaultdict(int)
                                    for l in cand[tp:]:
                                        if l["player"] in players or games[l["event_id"]] >= gc:
                                            continue
                                        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
                                        if len(pick) == 6:
                                            break
                                    for j, (size, st) in enumerate(STRUCTS):
                                        if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
                                            sl = [{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]}
                                                  for l in pick[:size]]
                                            P[ci * nst + j, di] = SE.grade(sl, st)[1] - 1.0
                                    ci += 1
        if di % 25 == 0:
            log(f"strategy grid: slate {di + 1} / {len(order)}")
    return strat, P


def strategy_grid2(days, order):
    """battery 2: single line-type levels x side x props x rank x prop-line position x prop-group cap x game cap x structure"""
    LEVELS = ("R", "G1", "G2", "G3", "D1", "D2", "D3")
    combos = [(lv, side, ps, rk, lp, pc, gc) for lv in LEVELS for side in SIDES for ps in PROPSETS for rk in ("p", "ev")
              for lp in ("all", "low", "high") for pc in (0, 2) for gc in GAMECAPS]
    strat = [(c, size, st) for c in combos for (size, st) in STRUCTS]
    P = np.full((len(strat), len(order)), np.nan, np.float32)
    nst = len(STRUCTS)
    for di, key in enumerate(order):
        legs = [l for l in days[key] if l["p"] is not None and l["team_id"] is not None]
        med = defaultdict(list)
        for l in legs:
            med[(l["prop"], l["tier"])].append(float(l["line"]))
        med = {k: float(np.median(v)) for k, v in med.items()}
        for l in legs:
            l["_grp"] = GRP.get(l["prop"])
            l["_lp"] = "low" if float(l["line"]) <= med[(l["prop"], l["tier"])] else "high"
        ci = 0
        for lv in LEVELS:
            for side in SIDES:
                for ps, pset in PROPSETS.items():
                    base = [l for l in legs if l["tier"] == lv and l["side"] in SIDES[side] and (pset is None or l["_grp"] in pset)]
                    for rk in ("p", "ev"):
                        ranked = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"])))
                        for lp in ("all", "low", "high"):
                            cand = ranked if lp == "all" else [l for l in ranked if l["_lp"] == lp]
                            for pc in (0, 2):
                                for gc in GAMECAPS:
                                    pick, players, games, grps = [], set(), defaultdict(int), defaultdict(int)
                                    for l in cand:
                                        if l["player"] in players or games[l["event_id"]] >= gc or (pc and grps[l["_grp"]] >= pc):
                                            continue
                                        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; grps[l["_grp"]] += 1
                                        if len(pick) == 6:
                                            break
                                    for j, (size, st) in enumerate(STRUCTS):
                                        if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
                                            sl = [{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]}
                                                  for l in pick[:size]]
                                            P[ci * nst + j, di] = SE.grade(sl, st)[1] - 1.0
                                    ci += 1
        if di % 25 == 0:
            log(f"strategy grid 2: slate {di + 1} / {len(order)}")
    return strat, P


def name(s):
    if GRID == 2:
        (lv, side, ps, rk, lp, pc, gc), size, st = s
        return (f"{lv}-{'More' if side == 'O' else 'Less' if side == 'U' else 'both'}-{ps}-{rk}-lines {lp}-{'grp<=2-' if pc else ''}gc{gc} "
                f"{size}{'F' if st == 'flex' else 'P'}")
    (pool, side, ps, rk, mp, gc, tp), size, st = s
    return f"{pool}-{'More' if side == 'O' else 'Less' if side == 'U' else 'both'}-{ps}-{rk}-p{mp:.2f}-gc{gc}{'-skip1' if tp else ''} " \
           f"{size}{'F' if st == 'flex' else 'P'}"


class Stats:
    def __init__(self, P):
        self.V = (~np.isnan(P)).astype(np.float32)
        self.X = np.nan_to_num(P).astype(np.float32)
        self.X2 = self.X ** 2

    def agg(self, M):
        """M: slates x k masks (float32) -> n, mean, sd (strategies x k)"""
        n = self.V @ M
        s = self.X @ M
        s2 = self.X2 @ M
        with np.errstate(invalid="ignore", divide="ignore"):
            mu = s / n
            sd = np.sqrt(np.maximum(s2 / n - mu ** 2, 0))
        return n, mu, sd

    def top(self, M, k=5):
        """best k strategies per mask column (score = mean - sd / sqrt(n), played on >= max(8, half the mask's slates))"""
        n, mu, sd = self.agg(M)
        need = np.maximum(8, 0.5 * M.sum(axis=0))[None, :]
        score = np.where(n >= need, mu - sd / np.sqrt(np.maximum(n, 1)), -np.inf)
        return np.argpartition(-score, k, axis=0)[:k].T            # k x masks -> masks x k

    def roi(self, idx, M):
        """mean over the k strategies idx[c] of their mean on mask column c"""
        out = np.full(M.shape[1], np.nan)
        for c in range(M.shape[1]):
            r = idx[c]
            n = self.V[r] @ M[:, c]
            s = self.X[r] @ M[:, c]
            with np.errstate(invalid="ignore", divide="ignore"):
                v = s / n
            out[c] = np.nanmean(v) if np.any(n > 0) else np.nan
        return out


def random_masks(seas, s, size, R):
    ix = np.where(seas == s)[0]
    M = np.zeros((len(seas), R), np.float32)
    for r in range(R):
        M[RNG.choice(ix, size, replace=False), r] = 1.0
    return M


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    m = len(ps)
    ok = np.zeros(m, bool)
    thr = q * np.arange(1, m + 1) / m
    passed = np.where(ps[o] <= thr)[0]
    if len(passed):
        ok[o[: passed.max() + 1]] = True
    return ok


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    reg, days, order, seas = L1.build(conn)
    nel = sum("ELECTED" in it["info"] for it in reg.items)
    clean = 0
    for _, _, new in reversed(reg.passes):
        if new:
            break
        clean += 1
    log(f"Layer 1: {len(reg.items)} profiles ({nel} ELECTED); trailing clean passes {clean}; last 25 passes: "
        + " | ".join(f"{t}: {n}" for t, _, n in reg.passes[-25:]))
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    hseas = seas[hist_ix]
    strat, P = strategy_grid2(days, horder) if GRID == 2 else strategy_grid(days, horder)
    log(f"strategy grid done: {len(strat):,} strategies; slips built {int((~np.isnan(P)).sum()):,}")
    res = {"ALL STRUCTURES": evaluate(P, strat, "ALL STRUCTURES", reg, hist_ix, hseas)}
    if PER_STRUCT:
        # PER STRUCTURE (2026-10-24): the all-structure read is dominated by 5-6-pick slips (high mean, high variance); each
        # structure is also read on its own - own 5 vs global 5 among that structure's strategies only
        for size, stt in STRUCTS:
            rows_ = [i for i, s_ in enumerate(strat) if s_[1:] == (size, stt)]
            lab = f"{size}{'F' if stt == 'flex' else 'P'}"
            res[lab] = evaluate(P[rows_], [strat[i] for i in rows_], lab, reg, hist_ix, hseas)
    print("\n" + "=" * 190 + "\nBATTERY SUMMARY: " + " | ".join(f"{k}: {a} WORK, {b} many-winners" for k, (a, b) in res.items()))
    log("done")


def evaluate(P, strat, label, reg, hist_ix, hseas):
    """one battery read: per profile own 5 vs global 5 (strategies = the rows of P), BH over profiles; returns (n works, n many)"""
    st = Stats(P)
    mA = (hseas == HIST[0]).astype(np.float32)[:, None]
    mB = (hseas == HIST[1]).astype(np.float32)[:, None]
    glob = {HIST[0]: st.top(mA)[0], HIST[1]: st.top(mB)[0]}
    _, muA, _ = st.agg(mA)
    _, muB, _ = st.agg(mB)
    all_mu = {HIST[0]: muA[:, 0], HIST[1]: muB[:, 0]}
    print("\n" + "=" * 190 + f"\n[{label}] GLOBAL PICKS (best 5 on all slates of the fit season; read on the other season):")
    for fit, test in (HIST, HIST[::-1]):
        print(f"  fit {fit}: " + " | ".join(f"{name(strat[i])} fit {100 * all_mu[fit][i]:+.0f}% test {100 * all_mu[test][i]:+.0f}%"
                                              for i in glob[fit]))
    rows = []
    null_cache = {}
    for pi, it in enumerate(reg.items, 1):
        if ONLY and pi not in ONLY:
            continue
        mask = it["mask"][hist_ix]
        res = []
        detail = []
        for fit, test in (HIST, HIST[::-1]):
            mf = (mask & (hseas == fit)).astype(np.float32)[:, None]
            mt = (mask & (hseas == test)).astype(np.float32)[:, None]
            own_ix = st.top(mf)[0]
            own = st.roi(own_ix[None, :], mt)[0]
            gl = st.roi(glob[fit][None, :], mt)[0]
            obs = own - gl
            nf, nt = int(mf.sum()), int(mt.sum())
            key = (fit, nf, nt)
            if key not in null_cache:
                Rf = random_masks(hseas, fit, nf, NULL)
                Rt = random_masks(hseas, test, nt, NULL)
                tops = st.top(Rf)
                g_r = st.roi(np.repeat(glob[fit][None, :], NULL, axis=0), Rt)
                null_cache[key] = (st.roi(tops, Rt) - g_r, g_r)
            null, g_null = null_cache[key]
            null = null[~np.isnan(null)]
            g_null = g_null[~np.isnan(g_null)]
            p = (1 + np.sum(null >= obs)) / (len(null) + 1) if obs == obs else 1.0
            # PLAY / AVOID read: are the profile's slates better or worse for the GLOBAL picks than random slate sets of the
            # same size (out of sample: picks from the fit season, read on the profile's test-season slates)?
            p_lo = (1 + np.sum(g_null <= gl)) / (len(g_null) + 1) if gl == gl else 1.0
            p_hi = (1 + np.sum(g_null >= gl)) / (len(g_null) + 1) if gl == gl else 1.0
            g_med = float(np.median(g_null)) if len(g_null) else float("nan")
            res.append((obs, p, own, gl, p_lo, p_hi, g_med))
            _, mu_t, _ = st.agg(mt)
            _, mu_f, _ = st.agg(mf)
            detail.append((fit, test, own, gl, obs, p, float(np.median(null)) if len(null) else float("nan"),
                           [(i, mu_f[i, 0], mu_t[i, 0]) for i in own_ix]))
        both = np.ones(len(strat), bool)
        for s in HIST:
            ms = (mask & (hseas == s)).astype(np.float32)[:, None]
            n, mu, sd = st.agg(ms)
            both &= (n[:, 0] >= max(8, 0.5 * ms.sum())) & (mu[:, 0] - sd[:, 0] / np.sqrt(np.maximum(n[:, 0], 1)) > 0) & \
                (mu[:, 0] > all_mu[s])
        rows.append({"pi": pi, "it": it, "res": res, "detail": detail, "both": both})
        if pi % 25 == 0:
            log(f"profiles evaluated: {pi}")
    # both-season winner counts on random slate sets (per size pair, batched)
    wnull = {}
    for r in rows:
        sz = tuple(int((r["it"]["mask"][hist_ix] & (hseas == s)).sum()) for s in HIST)
        if sz in wnull:
            continue
        R = max(NULL // 4, 50)
        cnt = np.ones((len(strat), R), bool)
        for s, n_ in zip(HIST, sz):
            Rm = random_masks(hseas, s, n_, R)
            n, mu, sd = st.agg(Rm)
            cnt &= (n >= np.maximum(8, 0.5 * Rm.sum(axis=0))[None, :]) & (mu - sd / np.sqrt(np.maximum(n, 1)) > 0) & \
                (mu > all_mu[s][:, None])
        c = cnt.sum(axis=0)
        wnull[sz] = (float(np.mean(c)), float(np.percentile(c, 95)))
    pmax = [max(r["res"][0][1], r["res"][1][1]) if r["res"][0][0] > 0 and r["res"][1][0] > 0 else 1.0 for r in rows]
    ok = bh(pmax, 0.10)
    # PLAY / AVOID: the global picks on the profile's slates worse (AVOID) / better (PLAY MORE) than random slate sets in BOTH
    # directions, BH q 0.10 over profiles
    p_avoid = [max(r["res"][0][4], r["res"][1][4]) for r in rows]
    p_boost = [max(r["res"][0][5], r["res"][1][5]) for r in rows]
    ok_av, ok_bo = bh(p_avoid, 0.10), bh(p_boost, 0.10)
    print("\n" + "=" * 190 + f"\n[{label}] PLAY / AVOID - the global picks on each profile's slates vs random slate sets (BH q 0.10): "
          f"{int(ok_av.sum())} AVOID, {int(ok_bo.sum())} PLAY-MORE")
    for r, a_, b_, pa, pb in zip(rows, ok_av, ok_bo, p_avoid, p_boost):
        if a_ or b_ or min(pa, pb) <= 0.01:
            (_, _, _, g1, _, _, m1), (_, _, _, g2, _, _, m2) = r["res"]
            print(f"  {'AVOID ' if a_ else 'PLAY-MORE ' if b_ else '(nominal) '}P{r['pi']:03d} {r['it']['name']} | global picks on its "
                  f"slates 24->25 {100 * g1:+.0f}% (random median {100 * m1:+.0f}%) | 25->24 {100 * g2:+.0f}% (random median "
                  f"{100 * m2:+.0f}%) | p low {pa:.3f} / high {pb:.3f}")
    print("\n" + "=" * 190 + f"\n[{label}] PER PROFILE (own 5 vs global 5 on the profile's test-season slates, units per slip; p vs random slate sets)")
    for r, pm, w in zip(rows, pmax, ok):
        it = r["it"]
        sz = tuple(int((it["mask"][hist_ix] & (hseas == s)).sum()) for s in HIST)
        nm_, n95 = wnull[sz]
        cnt = int(r["both"].sum())
        (o1, p1, own1, g1), (o2, p2, own2, g2) = r["res"]
        flag = ("*** WORKS (BH q 0.10) *** " if w else "") + ("MANY-WINNERS " if cnt > n95 else "")
        if label != "ALL STRUCTURES" and not flag:
            continue            # per-structure reads list only the flagged profiles
        print(f"  {flag}P{r['pi']:03d} [{it['tech']}] {it['name']} ({sz[0]} / {sz[1]} slates) | 24->25 own {100 * own1:+.0f}% vs global "
              f"{100 * g1:+.0f}% (diff {100 * o1:+.0f}, p {p1:.3f}) | 25->24 own {100 * own2:+.0f}% vs global {100 * g2:+.0f}% (diff "
              f"{100 * o2:+.0f}, p {p2:.3f}) | both-season winners {cnt} (random {nm_:.0f}, p95 {n95:.0f})")
        if w or cnt > n95:
            for fit, test, own, gl, obs, p, nmed, tops in r["detail"]:
                print(f"      fit {fit} -> test {test}: null median {100 * nmed:+.0f}")
                for i, a, b in tops:
                    print(f"        {name(strat[i]):<58} fit in-profile {100 * a:+5.0f}% | test in-profile {100 * b:+5.0f}% | test all "
                          f"{100 * all_mu[test][i]:+5.0f}%{'  [live scope]' if strat[i][1:] in OWNER_SCOPE else ''}")
            if cnt:
                mask = it["mask"][hist_ix]
                n0, mu0, _ = st.agg((mask & (hseas == HIST[0])).astype(np.float32)[:, None])
                n1, mu1, _ = st.agg((mask & (hseas == HIST[1])).astype(np.float32)[:, None])
                ix = np.where(r["both"])[0]
                ix = ix[np.argsort(-(mu0[ix, 0] + mu1[ix, 0]))][:8]
                print("      both-season winners (best 8):")
                for i in ix:
                    print(f"        {name(strat[i]):<58} 24-25 {100 * mu0[i, 0]:+5.0f}% ({int(n0[i, 0])}d, all {100 * all_mu[HIST[0]][i]:+.0f}%) "
                          f"| 25-26 {100 * mu1[i, 0]:+5.0f}% ({int(n1[i, 0])}d, all {100 * all_mu[HIST[1]][i]:+.0f}%)"
                          f"{'  [live scope]' if strat[i][1:] in OWNER_SCOPE else ''}")
    nw = int(ok.sum())
    nm = sum(int(r["both"].sum()) > wnull[tuple(int((r["it"]["mask"][hist_ix] & (hseas == s)).sum()) for s in HIST)][1] for r in rows)
    print("\n" + "=" * 190 + f"\n[{label}] SUMMARY: {nw} of {len(rows)} profiles WORK (own picks beat the global picks in both directions, BH q 0.10); "
          f"{nm} have more both-season winners than random slate sets' p95 (expected ~{0.05 * len(rows):.0f} by chance)")
    return nw, nm


if __name__ == "__main__":
    main()
