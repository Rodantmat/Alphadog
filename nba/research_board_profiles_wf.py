#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES: WALK-FORWARD PER PROFILE, NO SEASON FORCED (2026-10-24; owner 15:51 PT: "the profiles are being forced to
work on both seasons, and they should not be. There are profiles that are going to be for a specific season ... we should not try to
force it to work on both ... granulate these slip structures and the strategies"). READ-ONLY.

The way a profile would be used live: on every slate of a profile, the strategy is chosen ONLY from that profile's EARLIER slates (any
season, in date order) and played on that slate. Nothing is forced to hold in both seasons; a profile that lives in one season is
judged on its own slates.
  own picks     the 5 best strategies on the profile's earlier slates (score = mean - sd / sqrt(n), played on >= 8 of them), re-chosen
                every WF_STEP profile slates; the profile is played from its 15th slate on
  global picks  the 5 best on ALL earlier slates (re-chosen on the same slates)
  read: mean own minus global result per played slate (units per slip), with the own picks' ROI and the global picks' ROI;
  p: the same walk-forward on random slate sets of the same size (WF_NULL draws); BH q 0.10 over profiles.
  per structure (2P .. 6F) as well as all structures mixed; and the BEST SINGLE strategy per profile as chosen walk-forward.
Profiles: Layer 1 (research_board_profiles_l1.build); with L1_ONE_SEASON=1 also the profiles that recur in ONE season only.
Strategies: WF_GRID 1 / 2 (batteries 1 / 2, research_board_profiles_l2) or 3 (the documented compositions, research_board_profiles_l3).
Env: DATABASE_URL, WF_GRID (default 1), WF_STEP (default 5), WF_NULL (default 100), L1_ONE_SEASON, L1_AGNOSTIC,
WF_MENU (menus m1,m2,..: own 5 chosen among the global top m), WF_PLANT / WF_PLANT_N (power check with a planted edge).
"""
import os
import sys
import time

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import research_board_profiles_l1 as L1              # noqa: E402
import research_board_profiles_l2 as L2              # noqa: E402

T0 = time.time()
GRID = int(os.environ.get("WF_GRID", "1"))
STEP = int(os.environ.get("WF_STEP", "5"))
NULLN = int(os.environ.get("WF_NULL", "100"))
HIST = L1.REAL_HIST          # the real seasons (with L1_AGNOSTIC, L1.HIST becomes the two time halves once Layer 1 has been built)
RNG = np.random.default_rng(37)
WARM = 15
# SMALL MENU (owner 19:13 PT: "impossible nothing works better on its own profile"): picking the best 5 of ~100,000 strategies on ~60
# earlier profile slates mostly picks luck. WF_MENU=m1,m2,..: the profile picks its 5 only among the m strategies that are best on ALL
# earlier slates (the global top m before the slate) - a short, sensible menu where a real profile edge can show. 0 = no menu.
MENUS = [int(x) for x in os.environ.get("WF_MENU", "0").split(",") if x]
# POWER CHECK: WF_PLANT=delta plants a KNOWN edge - one strategy gets +delta units per slip on one profile's slates only - in WF_PLANT_N
# sampled profiles (taken away on the other slates, so only the profile knows), and reports whether the walk-forward finds it (if it cannot find a planted edge, its "nothing" means nothing)
PLANTS = [float(x) for x in os.environ.get("WF_PLANT", "").split(",") if x]       # one or more planted edges (units a slip)
PLANT_N = int(os.environ.get("WF_PLANT_N", "40"))
# RECENCY CONFOUND CONTROLS (2026-10-24 20:00 PT): profile slates come in RUNS of consecutive days, random slate sets do not - so an own
# choice can win only because it learns from RECENT slates. WF_NULLKIND=shift: the null is the profile's own mask circularly shifted
# (same size, same runs, wrong boards). WF_GWIN=W: the global picks are chosen on the last W slates only (a recency-matched global).
NULLKIND = os.environ.get("WF_NULLKIND", "random")
GWIN = int(os.environ.get("WF_GWIN", "0"))


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


class WF:
    def __init__(self, P):
        self.V = (~np.isnan(P)).astype(np.float32)
        self.X = np.nan_to_num(P).astype(np.float32)
        self.X2 = self.X ** 2
        S, D = P.shape
        # global top-5 chosen on all slates BEFORE each slate (re-chosen every slate; cheap: running sums)
        n = np.zeros(S, np.float32); s = np.zeros(S, np.float32); s2 = np.zeros(S, np.float32)
        self.gtop = [None] * D
        self.gmenu = [None] * D
        mmax = max(MENUS) if MENUS else 0
        for t in range(D):
            if t >= 8:
                self.gtop[t] = self._top(n, s, s2)
                if mmax:
                    with np.errstate(invalid="ignore", divide="ignore"):
                        mu = s / n
                        sd = np.sqrt(np.maximum(s2 / n - mu ** 2, 0))
                        sc = np.where(n >= 8, mu - sd / np.sqrt(np.maximum(n, 1)), -np.inf)
                    c = np.argpartition(-sc, mmax)[:mmax]
                    self.gmenu[t] = c[np.argsort(-sc[c])]          # the global top mmax, best first
            n += self.V[:, t]; s += self.X[:, t]; s2 += self.X2[:, t]
            if GWIN and t - GWIN >= 0:                           # recency-matched global: only the last GWIN slates count
                n -= self.V[:, t - GWIN]; s -= self.X[:, t - GWIN]; s2 -= self.X2[:, t - GWIN]

    @staticmethod
    def _top(n, s, s2, k=5):
        with np.errstate(invalid="ignore", divide="ignore"):
            mu = s / n
            sd = np.sqrt(np.maximum(s2 / n - mu ** 2, 0))
            sc = np.where(n >= 8, mu - sd / np.sqrt(np.maximum(n, 1)), -np.inf)
        return np.argpartition(-sc, k)[:k]

    def play(self, idx, t):
        v = self.V[idx, t]
        return float(np.sum(self.X[idx, t] * v) / v.sum()) if v.sum() else np.nan

    def run(self, days_ix, menu=0, track=None):
        """days_ix: the profile's slates in date order -> (own results, global results, best single strategy at the end);
        menu m > 0: the own 5 are chosen among the global top m before the slate; track: a strategy index - the share of played
        slates on which it was among the own 5 is kept in self.tracked"""
        S = self.X.shape[0]
        n = np.zeros(S, np.float32); s = np.zeros(S, np.float32); s2 = np.zeros(S, np.float32)
        own, glob = [], []
        top = None
        hits = 0
        for j, t in enumerate(days_ix):
            if j >= WARM and self.gtop[t] is not None:
                if top is None or (j - WARM) % STEP == 0 or menu:
                    if menu:
                        cand = self.gmenu[t][:menu]
                        with np.errstate(invalid="ignore", divide="ignore"):
                            mu = s[cand] / n[cand]
                            sd = np.sqrt(np.maximum(s2[cand] / n[cand] - mu ** 2, 0))
                            sc = np.where(n[cand] >= 8, mu - sd / np.sqrt(np.maximum(n[cand], 1)), -np.inf)
                        top = cand[np.argsort(-sc)[:5]]
                    else:
                        top = self._top(n, s, s2)
                if track is not None:
                    hits += int(track in top)
                a, b = self.play(top, t), self.play(self.gtop[t], t)
                if a == a and b == b:
                    own.append(a); glob.append(b)
            n += self.V[:, t]; s += self.X[:, t]; s2 += self.X2[:, t]
        best = self._top(n, s, s2, 1)[0] if len(days_ix) >= 8 else None
        self.tracked = hits / max(len(own), 1)
        return np.array(own), np.array(glob), best, (n, s)


def power_check(P, reg, hist_ix, label, PLANT):
    """plant +PLANT units a slip on one strategy, on one profile's slates only, and see whether the walk-forward finds it"""
    items = [it for it in reg.items if it["mask"][hist_ix].sum() >= WARM + 25]
    pick = RNG.choice(len(items), min(PLANT_N, len(items)), replace=False)
    out = {m: [] for m in ([0] + MENUS)}
    V = ~np.isnan(P)
    for c, i in enumerate(pick):
        m_ = items[i]["mask"][hist_ix]
        dix = np.where(m_)[0]
        cov = V[:, dix].mean(axis=1)
        ok = np.where(cov >= 0.7)[0]
        if not len(ok):
            continue
        s_ = int(RNG.choice(ok))
        Q = P.copy()
        add = np.zeros(P.shape[1], bool); add[dix] = True
        Q[s_, add & V[s_]] += PLANT
        # PROFILE-SPECIFIC: the same edge is taken away on the other slates, so the strategy's all-slates average is unchanged and
        # the global choice gains nothing - only knowing the profile helps (the case the owner describes)
        oth = ~add & V[s_]
        if oth.sum():
            Q[s_, oth] -= PLANT * (add & V[s_]).sum() / oth.sum()
        wf = WF(Q)
        for m in out:
            o, g, _, _ = wf.run(dix, menu=m, track=s_)
            if len(o) >= 10:
                out[m].append((float(np.mean(o - g)), wf.tracked))
        del Q, wf
    print("\n" + "=" * 190 + f"\n[{label}] POWER CHECK: +{PLANT:g} units a slip planted on one strategy, on one profile's slates only, "
          f"in {len(pick)} sampled profiles")
    for m, v in out.items():
        if not v:
            continue
        d = np.array([x[0] for x in v]); tr = np.array([x[1] for x in v])
        print(f"  menu {m if m else 'all':>5}: own - global {100 * d.mean():+.0f} pts a slip (positive in {int((d > 0).sum())} of {len(d)}); "
              f"the planted strategy is among the own 5 on {100 * tr.mean():.0f}% of played slates (median profile {100 * np.median(tr):.0f}%)")


def evaluate_wf(P, strat, reg, hist_ix, hseas, label, name, menu=0):
    wf = WF(P)
    D = P.shape[1]
    rows, cache = [], {}
    for pi, it in enumerate(reg.items, 1):
        mask = it["mask"][hist_ix]
        dix = np.where(mask)[0]
        own, glob, best, (n, s) = wf.run(dix, menu=menu)
        if len(own) < 10:
            continue
        obs = float(np.mean(own - glob))
        key = len(dix)
        if key not in cache:
            vals = []
            for _ in range(NULLN):
                r = np.sort(RNG.choice(D, len(dix), replace=False))
                o, g, _, _ = wf.run(r, menu=menu)
                if len(o) >= 10:
                    vals.append(float(np.mean(o - g)))
            cache[key] = np.array(vals)
        null = cache[key]
        p = (1 + np.sum(null >= obs)) / (len(null) + 1)
        if len(null) > 2:
            # AUDIT FIX (independent review 2026-10-24): with WF_NULL draws the p floor is 1 / (WF_NULL + 1) and BH over ~430 profiles
            # could never pass one - the parametric p from the null's mean / sd (means over many slates, ~normal) is used instead
            from scipy.stats import norm
            p = float(norm.sf((obs - null.mean()) / max(null.std(ddof=1), 1e-9)))
        seas_n = {s_: int((mask & (hseas == s_)).sum()) for s_ in HIST}
        rows.append((pi, it, len(own), float(np.mean(own)), float(np.mean(glob)), obs, p, float(np.median(null)), best,
                     float(s[best] / n[best]) if best is not None and n[best] else np.nan, int(n[best]) if best is not None else 0, seas_n))
        if pi % 50 == 0:
            log(f"[{label}] walk-forward profiles: {pi}")
    ok = L2.bh([r[6] for r in rows], 0.10)
    label = label + (f" | MENU: own 5 from the global top {menu}" if menu else "")
    print("\n" + "=" * 190 + f"\n[{label}] WALK-FORWARD PER PROFILE (own 5 chosen on the profile's earlier slates vs global 5 chosen on all earlier slates; "
          f"played slates from the profile's 16th; units per slip)")
    for r, w in zip(rows, ok):
        pi, it, npl, ow, gl, obs, p, nmed, best, bmu, bn, sn = r
        print(f"  {'*** BEATS GLOBAL (BH q 0.10) *** ' if w else ''}P{pi:03d} {it['name']} ({sn[HIST[0]]} / {sn[HIST[1]]} slates, {npl} played) | "
              f"own {100 * ow:+.0f}% vs global {100 * gl:+.0f}% (diff {100 * obs:+.0f}, p {p:.3f}, random median {100 * nmed:+.0f}) | best single on "
              f"all its slates: {name(strat[best])} {100 * bmu:+.0f}% ({bn}d)")
    nb = int(ok.sum())
    npos = sum(r[5] > 0 for r in rows)
    print(f"\n[{label}] WF SUMMARY: {nb} of {len(rows)} profiles beat the global picks walk-forward (BH q 0.10); {npos} have a positive "
          f"difference (half expected by chance); p < 0.05: {sum(r[6] < 0.05 for r in rows)} (~{0.05 * len(rows):.0f} by chance; binomial "
          f"p of that many or more {__import__('scipy.stats', fromlist=['binom']).binom.sf(sum(r[6] < 0.05 for r in rows) - 1, len(rows), 0.05):.4f})")
    return nb, npos


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    reg, days, order, seas = L1.build(conn)
    # the MLB runners terminate connections idle > 2 minutes (selfCleanupAfterPhase): Layer 1 computes for ~25 minutes without a
    # query, so every later query opens a FRESH connection (runs 40143986272 / 40143332966: AdminShutdown right after Layer 1)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    log(f"Layer 1: {len(reg.items)} profiles")
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    hseas = seas[hist_ix]
    if GRID == 3:
        import research_board_profiles_l3 as L3
        L3.attach_ranks(conn, days)
        strat, P = L3.stage_b_grid(days, horder)
        name = L3.name3
    else:
        L2.GRID = GRID
        strat, P = L2.strategy_grid2(days, horder) if GRID == 2 else L2.strategy_grid(days, horder)
        name = L2.name
    log(f"grid {GRID}: {len(strat):,} strategies")
    for pl in PLANTS:
        power_check(P, reg, hist_ix, "ALL STRUCTURES", pl)
    if os.environ.get("WF_ONLY_PLANT", "") == "1":
        log("done (WF_ONLY_PLANT)")
        return
    res = {}
    for menu in (MENUS or [0]):
        mk = f" m{menu}" if menu else ""
        res["ALL" + mk] = evaluate_wf(P, strat, reg, hist_ix, hseas, "ALL STRUCTURES", name, menu)
        for size, stt in L2.STRUCTS:
            rows_ = [i for i, s_ in enumerate(strat) if s_[1:] == (size, stt)]
            lab = f"{size}{'F' if stt == 'flex' else 'P'}"
            res[lab + mk] = evaluate_wf(P[rows_], [strat[i] for i in rows_], reg, hist_ix, hseas, lab, name, menu)
    print("\n" + "=" * 190 + "\nWALK-FORWARD SUMMARY: " + " | ".join(f"{k}: {a} beat global, {b} positive" for k, (a, b) in res.items()))
    log("done")


if __name__ == "__main__":
    main()
