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
Env: DATABASE_URL, WF_GRID (default 1), WF_STEP (default 5), WF_NULL (default 100), L1_ONE_SEASON.
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
        for t in range(D):
            if t >= 8:
                self.gtop[t] = self._top(n, s, s2)
            n += self.V[:, t]; s += self.X[:, t]; s2 += self.X2[:, t]

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

    def run(self, days_ix):
        """days_ix: the profile's slates in date order -> (own results, global results, best single strategy at the end)"""
        S = self.X.shape[0]
        n = np.zeros(S, np.float32); s = np.zeros(S, np.float32); s2 = np.zeros(S, np.float32)
        own, glob = [], []
        top = None
        for j, t in enumerate(days_ix):
            if j >= WARM and self.gtop[t] is not None:
                if top is None or (j - WARM) % STEP == 0:
                    top = self._top(n, s, s2)
                a, b = self.play(top, t), self.play(self.gtop[t], t)
                if a == a and b == b:
                    own.append(a); glob.append(b)
            n += self.V[:, t]; s += self.X[:, t]; s2 += self.X2[:, t]
        best = self._top(n, s, s2, 1)[0] if len(days_ix) >= 8 else None
        return np.array(own), np.array(glob), best, (n, s)


def evaluate_wf(P, strat, reg, hist_ix, hseas, label, name):
    wf = WF(P)
    D = P.shape[1]
    rows, cache = [], {}
    for pi, it in enumerate(reg.items, 1):
        mask = it["mask"][hist_ix]
        dix = np.where(mask)[0]
        own, glob, best, (n, s) = wf.run(dix)
        if len(own) < 10:
            continue
        obs = float(np.mean(own - glob))
        key = len(dix)
        if key not in cache:
            vals = []
            for _ in range(NULLN):
                r = np.sort(RNG.choice(D, len(dix), replace=False))
                o, g, _, _ = wf.run(r)
                if len(o) >= 10:
                    vals.append(float(np.mean(o - g)))
            cache[key] = np.array(vals)
        null = cache[key]
        p = (1 + np.sum(null >= obs)) / (len(null) + 1)
        seas_n = {s_: int((mask & (hseas == s_)).sum()) for s_ in HIST}
        rows.append((pi, it, len(own), float(np.mean(own)), float(np.mean(glob)), obs, p, float(np.median(null)), best,
                     float(s[best] / n[best]) if best is not None and n[best] else np.nan, int(n[best]) if best is not None else 0, seas_n))
        if pi % 50 == 0:
            log(f"[{label}] walk-forward profiles: {pi}")
    ok = L2.bh([r[6] for r in rows], 0.10)
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
          f"difference (half expected by chance); nominal p < 0.05: {sum(r[6] < 0.05 for r in rows)} (~{0.05 * len(rows):.0f} by chance)")
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
    res = {"ALL": evaluate_wf(P, strat, reg, hist_ix, hseas, "ALL STRUCTURES", name)}
    for size, stt in L2.STRUCTS:
        rows_ = [i for i, s_ in enumerate(strat) if s_[1:] == (size, stt)]
        lab = f"{size}{'F' if stt == 'flex' else 'P'}"
        res[lab] = evaluate_wf(P[rows_], [strat[i] for i in rows_], reg, hist_ix, hseas, lab, name)
    print("\n" + "=" * 190 + "\nWALK-FORWARD SUMMARY: " + " | ".join(f"{k}: {a} beat global, {b} positive" for k, (a, b) in res.items()))
    log("done")


if __name__ == "__main__":
    main()
