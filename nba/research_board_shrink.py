#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES AS A TILT ON THE GLOBAL EVIDENCE (PARTIAL POOLING), WALK-FORWARD (2026-10-24). READ-ONLY.

Why: choosing a profile's selectors from its own earlier slates ALONE loses to choosing them on all earlier slates (matrix run
40141121848: 0 of 424 profiles beat global, 136 positive; slip walk-forward 40140540996: 0 beat global in every structure) - but
random slate sets of the same size lose even more (random median -4.2 pts a leg), i.e. the loss is small-sample selection noise,
not proof that a profile carries nothing. The standard answer is partial pooling (empirical Bayes / James-Stein): a selector's score
on a slate = its global lower-bound margin + w x (its margin on the profile's earlier slates - its global margin), w = n / (n + K),
n = the selector's earlier legs inside the profile. K = infinity is the global choice; K = 0 is the profile-only choice; the data pick
K. Owner 16:40 PT: profiles are season-agnostic (L1_AGNOSTIC=1), a board may fit many; boards fitting none play the global choice.

Reads (realized per-leg margin = hit - 0.55 / m, strategy doc 19k; MX_TOPK selectors played per slate; slates from the 16th):
  A  PER PROFILE x K: tilted choice on the profile's slates vs the global choice; p vs the same on CIRCULARLY SHIFTED profile masks
     (keeps each profile's size and run structure, breaks its link to the board); BH q 0.10.
  B  THE LIVE SYSTEM x K: every slate takes the MEAN tilt of ALL the profiles it belongs to (profiles evaluated on their earlier
     slates only); a slate in no profile plays the global choice (the fallback). All slates, one read, vs SH_NULL shifted-mask
     systems. Per K; plus calendar-only and board-only profile sets.
Selectors: the matrix's levels 1-2 (research_board_matrix.selector_matrix: cell x 9 ranks x every cut n 1-30 / 1-40 %, and 24 factor
bands x cuts 1-20).
Env: DATABASE_URL, L1_AGNOSTIC, MX_TOPK (default 5), SH_NULL (default 30), SH_K (default 25,50,100,200,400,800,1600,3200).
"""
import os
import sys
import time

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_board_profiles_l1 as L1              # noqa: E402
import research_board_profiles_l2 as L2              # noqa: E402
import research_board_profiles_l3 as L3              # noqa: E402
import research_board_matrix as MX                   # noqa: E402

T0 = time.time()
HIST = L1.HIST
TOPK = int(os.environ.get("MX_TOPK", "5"))
NULLN = int(os.environ.get("SH_NULL", "30"))
POOL = int(os.environ.get("SH_POOL", "300"))    # the tilt reorders, on each slate, the POOL best selectors by global evidence before it
KS = [float(x) for x in os.environ.get("SH_K", "25,50,100,200,400,800,1600,3200").split(",")]
WARM = 15
RNG = np.random.default_rng(53)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


class Run:
    """global running sums per selector, and per slate the global lower-bound score / margin BEFORE the slate"""

    def __init__(self, mat):
        self.mat = mat
        S, D = mat.H.shape
        self.S, self.D = S, D
        h = np.zeros(S); n = np.zeros(S); be = np.zeros(S); d = np.zeros(S)
        self.glb, self.gmar, self.gok = [None] * D, [None] * D, [None] * D
        for t in range(D):
            if t >= WARM:
                with np.errstate(invalid="ignore", divide="ignore"):
                    hit = h / n
                    mar = (h - be) / n
                    lb = mar - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
                ok = (n >= 30) & (d >= 8)
                self.glb[t] = np.where(ok, lb, -np.inf).astype(np.float32)
                self.gmar[t] = np.where(ok, mar, 0).astype(np.float32)
                self.gok[t] = ok
            h += mat.H[:, t]; n += mat.N[:, t]; be += mat.BE[:, t]; d += (mat.N[:, t] > 0)
        self.gsel = [None if g is None else np.argpartition(-g, TOPK)[:TOPK] for g in self.glb]
        # candidate pool per slate (no look-ahead: the slate's own global evidence); the work runs on the union of the pools only
        pools = [None if g is None else np.argpartition(-g, POOL)[:POOL] for g in self.glb]
        U = np.unique(np.concatenate([q for q in pools if q is not None]))
        pos = {int(u): i for i, u in enumerate(U)}
        self.U = U
        self.H, self.N, self.BE = mat.H[U], mat.N[U], mat.BE[U]
        for t in range(D):
            if self.glb[t] is None:
                continue
            el = np.full(len(U), -np.inf, np.float32)
            loc = np.array([pos[int(i)] for i in pools[t]])
            el[loc] = self.glb[t][pools[t]]
            self.glb[t] = el
            self.gmar[t] = self.gmar[t][U]
            self.gok[t] = np.isfinite(el)
            self.gsel[t] = np.array([pos[int(i)] for i in self.gsel[t]])
        self.S = len(U)
        self.mat = None                                   # free the full matrix

    def realized(self, sel, t):
        nn = self.N[sel, t].sum()
        return float((self.H[sel, t].sum() - self.BE[sel, t].sum()) / nn) if nn else np.nan


def tilt_profile(run, dix):
    """walk the profile's slates; yields (t, n, dev) before each slate: n = earlier legs per selector in the profile, dev = profile
    margin - global margin (both before t)"""
    S = run.S
    h = np.zeros(S); n = np.zeros(S); be = np.zeros(S)
    for t in dix:
        with np.errstate(invalid="ignore", divide="ignore"):
            pm = np.where(n > 0, (h - be) / np.maximum(n, 1), 0)
        yield t, n.copy(), pm
        h += run.H[:, t]; n += run.N[:, t]; be += run.BE[:, t]


def per_profile(run, dix, ks):
    """-> {K: (own realized list, global realized list)} on the profile's slates from its 16th"""
    out = {k: ([], []) for k in ks}
    for j, (t, n, pm) in enumerate(tilt_profile(run, dix)):
        if j < WARM or run.glb[t] is None:
            continue
        g = run.realized(run.gsel[t], t)
        if g != g:
            continue
        dev = np.where(run.gok[t], pm - run.gmar[t], 0)
        for k in ks:
            sc = run.glb[t] + (n / (n + k)) * dev
            r = run.realized(np.argpartition(-sc, TOPK)[:TOPK], t)
            if r == r:
                out[k][0].append(r); out[k][1].append(g)
    return out


def shifted(mask, D):
    s = int(RNG.integers(1, D))
    return np.roll(mask, s)


def system(run, masks, ks):
    """THE LIVE SYSTEM: per slate the mean tilt of every profile the slate is in (earlier slates only); none -> global"""
    S, D = run.S, run.D
    P = len(masks)
    member = np.array(masks, bool)                       # P x D
    h = np.zeros((P, S), np.float32); n = np.zeros((P, S), np.float32); be = np.zeros((P, S), np.float32)
    res = {k: [] for k in ks}
    glob = []
    covered = 0
    for t in range(D):
        ps = np.where(member[:, t])[0]
        if t >= WARM and run.glb[t] is not None:
            g = run.realized(run.gsel[t], t)
            if g == g:
                glob.append(g)
                if len(ps):
                    covered += 1
                    with np.errstate(invalid="ignore", divide="ignore"):
                        pm = np.where(n[ps] > 0, (h[ps] - be[ps]) / np.maximum(n[ps], 1), 0)
                    dev = np.where(run.gok[t][None, :], pm - run.gmar[t][None, :], 0)
                for k in ks:
                    if len(ps):
                        tl = ((n[ps] / (n[ps] + k)) * dev).mean(axis=0)
                        sc = run.glb[t] + tl
                        r = run.realized(np.argpartition(-sc, TOPK)[:TOPK], t)
                        res[k].append(r if r == r else g)
                    else:
                        res[k].append(g)                 # the fallback: no profile -> the global choice
        if len(ps):
            h[ps] += run.H[:, t]; n[ps] += run.N[:, t]; be[ps] += run.BE[:, t]
    gl = np.array(glob)
    return {k: float(np.mean(np.array(v) - gl)) for k, v in res.items()}, float(np.mean(gl)), {k: float(np.mean(v)) for k, v in res.items()}, covered, len(gl)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    reg, days, order, seas = L1.build(conn)
    log(f"Layer 1: {len(reg.items)} profiles ({sum(it['tech'] == 'calendar' for it in reg.items)} calendar)")
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    L3.attach_ranks(conn, days)
    MX.leg_features(conn, days, horder)
    sels, H, N, F, BE = MX.selector_matrix(days, horder)
    log(f"selectors: {len(sels):,}")
    run = Run(MX.Mat(H, N, F, BE))
    del H, N, F, BE
    log(f"candidate pools: top {POOL} a slate by global evidence -> {run.S:,} selectors ever in a pool")
    D = run.D
    masks = [it["mask"][hist_ix] for it in reg.items]
    # ---------------- B: the live system, first (the read that matters) ----------------
    print("\n" + "=" * 190 + "\nB - THE LIVE SYSTEM: every slate takes the mean tilt of all its profiles (earlier slates only); no profile -> global "
          "(realized margin per leg, pts; diff vs the global choice)")
    sets = {"ALL PROFILES": list(range(len(masks))),
            "BOARD PROFILES ONLY": [i for i, it in enumerate(reg.items) if it["tech"] != "calendar"],
            "CALENDAR ONLY": [i for i, it in enumerate(reg.items) if it["tech"] == "calendar"]}
    for nm, ix in sets.items():
        if not ix:
            continue
        diff, g, own, cov, npl = system(run, [masks[i] for i in ix], KS)
        nulls = {k: [] for k in KS}
        for _ in range(NULLN):
            dn, _, _, _, _ = system(run, [shifted(masks[i], D) for i in ix], KS)
            for k in KS:
                nulls[k].append(dn[k])
        print(f"  {nm} ({len(ix)} profiles; {cov} of {npl} played slates in >= 1 profile; global {100 * g:+.2f}):")
        for k in KS:
            nl = np.array(nulls[k])
            p = (1 + np.sum(nl >= diff[k])) / (len(nl) + 1)
            print(f"    K {k:>6g}: system {100 * own[k]:+.2f} | diff {100 * diff[k]:+.2f} (p {p:.3f} vs {NULLN} shifted-mask systems, "
                  f"their median {100 * np.median(nl):+.2f}, p95 {100 * np.percentile(nl, 95):+.2f})")
        log(f"system {nm} done")
    # ---------------- A: per profile x K ----------------
    rows = []
    for pi, (it, m) in enumerate(zip(reg.items, masks), 1):
        dix = np.where(m)[0]
        if len(dix) < WARM + 10:
            continue
        o = per_profile(run, dix, KS)
        best_k, best = None, -np.inf
        for k in KS:
            a, b = o[k]
            if len(a) >= 10:
                v = float(np.mean(np.array(a) - np.array(b)))
                if v > best:
                    best_k, best = k, v
        if best_k is None:
            continue
        # null: the same (best K chosen the same way) on circular shifts of this profile's mask
        nl = []
        for _ in range(NULLN):
            on = per_profile(run, np.where(shifted(m, D))[0], KS)
            vv = [float(np.mean(np.array(on[k][0]) - np.array(on[k][1]))) for k in KS if len(on[k][0]) >= 10]
            if vv:
                nl.append(max(vv))
        nl = np.array(nl)
        p = (1 + np.sum(nl >= best)) / (len(nl) + 1)
        rows.append((pi, it, len(o[best_k][0]), best_k, best, p, float(np.median(nl)) if len(nl) else np.nan))
        if pi % 50 == 0:
            log(f"profiles: {pi}")
    okb = L2.bh([r[5] for r in rows], 0.10)
    print("\n" + "=" * 190 + "\nA - PER PROFILE: best K's tilted choice vs the global choice on the profile's slates (pts a leg; p vs shifted masks, "
          "best K chosen the same way)")
    for r, w in zip(rows, okb):
        pi, it, npl, k, v, p, med = r
        print(f"  {'*** TILT HELPS (BH q 0.10) *** ' if w else ''}P{pi:03d} {it['name']} ({npl} played) | best K {k:g}: diff {100 * v:+.2f} "
              f"(p {p:.3f}, shifted median {100 * med:+.2f})")
    print(f"\nA SUMMARY: {int(okb.sum())} of {len(rows)} profiles - the profile tilt helps (BH q 0.10); nominal p < 0.05: "
          f"{sum(r[5] < 0.05 for r in rows)} (~{0.05 * len(rows):.0f} by chance)")
    log("done")


if __name__ == "__main__":
    main()
