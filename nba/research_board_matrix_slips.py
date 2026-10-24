#!/usr/bin/env python3
"""
RESEARCH - THE PROFILE x STRATEGY MATRIX, LEVELS 3-4: COMPOSITIONS AND VOLUME (2026-10-24; owner 15:58 PT: "When I say composition, I
mean two legs for less on turnovers, one leg for less on blocks ... then one less on turnover, two less on blocks, there's another
composition ... caps: is it better to play one, two, three slips, or four, or 20 ... the same thing for percentage: 1, 2, 4, 5, 6, 10,
20, 30% of the slips available or the legs available"; 16:01 PT: "granulate everything in between ... make the system understand what
makes sense to try"). READ-ONLY.

Built on the level-1/2 selectors (research_board_matrix.py: cell x rank / trailing x cut, and cell x final_hp cut x enhancement factor).
A COMPOSITION is a template over the profile's best selectors AS KNOWN BEFORE THE SLATE: "2 legs of slot 1 + 1 leg of slot 3" where
slot k is the k-th best selector on the profile's EARLIER slates (lower-bound margin; slots re-ranked every slate). So every slip a
template makes is out of sample by construction, and the template carries to any profile and any season.
  templates  every multiset of MS_SLOTS slots with 2..6 legs (6 slots: 917), each as Power and as Flex (3+ legs)
  slips      exact legs (no player twice, players on >= 2 teams), graded by build_slip_engine.grade on PrizePicks' payouts
  per profile: (a) every template's out-of-sample ROI on the profile's slates; (b) the template CHOSEN walk-forward (best on the
  profile's earlier slates, re-chosen every slate) vs the same procedure on the GLOBAL slots (selectors ranked on all earlier slates)
  played on the same slates; p vs random slate sets; BH q 0.10; (c) VOLUME for the chosen template: 1 .. 20 slips a slate (slip j uses
  the next legs of each slot, disjoint) and 5 .. 100 % (step 5) of the slips the slate allows - ROI per slip and units per slate.
Env: DATABASE_URL, MS_SLOTS (default 6), MS_NULL (default 20; random slate sets per size bucket of 20), L1_ONE_SEASON.
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
import research_board_matrix as MX                   # noqa: E402

T0 = time.time()
HIST = MX.HIST
SLOTS = int(os.environ.get("MS_SLOTS", "5"))
SHARD = [int(x) for x in os.environ.get("MS_SHARD", "0/1").split("/")]      # i/n: this run takes every n-th profile from i
GCACHE = {}                                                                  # slate -> the global slots' template results
NULLN = int(os.environ.get("MS_NULL", "20"))
RNG = np.random.default_rng(43)
WARM = 15
FB = dict(MX.FACTOR_BANDS)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def templates():
    out = []
    for size in range(2, 7):
        for combo in itertools.combinations_with_replacement(range(SLOTS), size):
            cnt = tuple(sorted(((s, combo.count(s)) for s in set(combo))))
            for st in (("power", "flex") if size >= 3 else ("power",)):
                out.append((cnt, size, st))
    return out


def legs_for(sel, cache):
    """the selector's legs on the slate, best first (same selection as research_board_matrix.selector_matrix)"""
    if sel in cache:
        return cache[sel]
    by = cache["_by"]
    if sel[0] == "rank":
        _, c, rk, cut = sel
        ls = by.get(c, [])
        if rk in ("final_hp", "baseline_hp", "final_score"):
            srt = sorted(ls, key=lambda x: -x[f"r_{rk}"])
        else:
            srt = sorted([x for x in ls if x[f"f_{rk}"] == x[f"f_{rk}"]], key=lambda x: (-x[f"f_{rk}"], -x["p"]))
        n = cut[1] if cut[0] == "n" else max(1, int(round(len(srt) * cut[1] / 100)))
        out = srt[:n] if len(srt) >= n else []
    else:
        _, c, fb, n = sel
        srt = sorted(by.get(c, []), key=lambda x: -x["r_final_hp"])
        out = [x for x in srt[:n] if FB[fb](x)]
    cache[sel] = out
    return out


def build(tpl, slot_sels, cache, offset=0):
    """one slip of the template (offset j: the j-th disjoint set of legs of every slot) -> legs or None"""
    cnt, size, st = tpl
    pick, players = [], set()
    for slot, k in cnt:
        ls = legs_for(slot_sels[slot], cache)
        got = 0
        skip = offset * k
        for l in ls:
            if l["player"] in players:
                continue
            if skip:
                skip -= 1
                continue
            pick.append(l); players.add(l["player"]); got += 1
            if got == k:
                break
        if got < k:
            return None
    if len({l["team_id"] for l in pick}) < 2:
        return None
    return pick


def grade(pick, st):
    return SE.grade([{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]} for l in pick], st)[1] - 1.0


def run_profile(dix, days, horder, mat, sels, tpls, gslots_t):
    """-> R_own (templates x played slates), R_glob, played slate indices"""
    S = mat.H.shape[0]
    h = np.zeros(S, np.float32); n = np.zeros(S, np.float32); be = np.zeros(S, np.float32); d = np.zeros(S, np.float32)
    Ro, Rg, played, slots_at = [], [], [], []
    for j, t in enumerate(dix):
        if j >= WARM and gslots_t[t] is not None:
            with np.errstate(invalid="ignore", divide="ignore"):
                hit = h / n
                lb = (h - be) / n - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
            lb = np.where((n >= 30) & (d >= 8), lb, -np.inf)
            own_slots = [sels[i] for i in np.argsort(-lb)[:SLOTS]]
            by = defaultdict(list)
            for l in days[horder[t]]:
                if l["hit"] is not None and l["factor"] and l["team_id"] is not None:
                    by[(l["prop"], l["tier"], l["side"])].append(l)
            cache = {"_by": by}
            ro, rg = np.full(len(tpls), np.nan, np.float32), np.full(len(tpls), np.nan, np.float32)
            for ti, tpl in enumerate(tpls):
                p = build(tpl, own_slots, cache)
                if p is not None:
                    ro[ti] = grade(p, tpl[2])
                p = build(tpl, gslots_t[t], cache)
                if p is not None:
                    rg[ti] = grade(p, tpl[2])
            Ro.append(ro); Rg.append(rg); played.append(t); slots_at.append(own_slots)
        h += mat.H[:, t]; n += mat.N[:, t]; be += mat.BE[:, t]; d += (mat.N[:, t] > 0)
    if not played:
        return None, None, [], []
    return np.array(Ro).T, np.array(Rg).T, played, slots_at


def wf_choose(R):
    """walk-forward template choice over the played slates: best mean - sd / sqrt(n) on the earlier played slates (>= 8)"""
    T, J = R.shape
    V = (~np.isnan(R)).astype(np.float32); X = np.nan_to_num(R)
    n = np.zeros(T); s = np.zeros(T); s2 = np.zeros(T)
    res, chosen = [], []                                  # chosen: aligned with the played slates (None before the 9th)
    for j in range(J):
        b = None
        if j >= 8:
            with np.errstate(invalid="ignore", divide="ignore"):
                mu = s / n
                sd = np.sqrt(np.maximum(s2 / n - mu ** 2, 0))
                sc = np.where(n >= 8, mu - sd / np.sqrt(np.maximum(n, 1)), -np.inf)
            b = int(np.argmax(sc))
            if V[b, j]:
                res.append(X[b, j])
        chosen.append(b)
        n += V[:, j]; s += X[:, j]; s2 += X[:, j] ** 2
    return np.array(res), chosen


def tpl_name(tpl, slot_names=None):
    cnt, size, st = tpl
    parts = [f"{k}x slot{s + 1}" + (f" [{slot_names[s]}]" if slot_names else "") for s, k in cnt]
    return f"{' + '.join(parts)} {size}{'F' if st == 'flex' else 'P'}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    reg, days, order, seas = MX.L1.build(conn)
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    hseas = seas[hist_ix]
    F_ = MX.L1.slate_features(conn, days, order)
    cols = sorted({c for f in F_.values() for c in f})
    _, Pp = MX.L1.trailing_pct(F_, order, cols)
    fam = MX.L1.families(cols)
    Pall = Pp[:, [cols.index(c) for c in fam["ALL"]]]
    profiles = [{"name": it["name"], "mask": it["mask"]} for it in reg.items] + MX.lookalike_profiles(reg, order, seas, Pall)
    MX.L3.attach_ranks(conn, days)
    MX.leg_features(conn, days, horder)
    sels, H, N, F, BE = MX.selector_matrix(days, horder)
    mat = MX.Mat(H, N, F, BE)
    tpls = templates()
    log(f"{len(profiles)} profiles, {len(sels):,} selectors, {len(tpls):,} composition templates")
    # global slots on every slate (selectors ranked on all earlier slates)
    Sn = H.shape[0]
    h = np.zeros(Sn, np.float32); n = np.zeros(Sn, np.float32); be = np.zeros(Sn, np.float32); d = np.zeros(Sn, np.float32)
    gslots = [None] * len(horder)
    for t in range(len(horder)):
        if t >= WARM:
            with np.errstate(invalid="ignore", divide="ignore"):
                hit = h / n
                lb = (h - be) / n - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
            lb = np.where((n >= 30) & (d >= 8), lb, -np.inf)
            gslots[t] = [sels[i] for i in np.argsort(-lb)[:SLOTS]]
        h += H[:, t]; n += N[:, t]; be += BE[:, t]; d += (N[:, t] > 0)
    rows, cache = [], {}
    D = len(horder)
    print("\n" + "=" * 190 + "\nPER PROFILE - composition templates over the profile's own best selectors (as known before each slate), out of sample")
    for pi, it in enumerate(profiles, 1):
        dix = np.where(it["mask"][hist_ix])[0]
        if len(dix) < WARM + 20:
            continue
        Ro, Rg, played, slots_at = run_profile(dix, days, horder, mat, sels, tpls, gslots)
        if Ro is None or Ro.shape[1] < 20:
            continue
        own, ch = wf_choose(Ro)
        glob, _ = wf_choose(Rg)
        m = min(len(own), len(glob))
        if m < 10:
            continue
        obs = float(np.mean(own[-m:]) - np.mean(glob[-m:]))
        key = int(round(len(dix) / 20.0)) * 20             # random slate sets per size bucket of 20 slates
        if key not in cache:
            vals = []
            for _ in range(NULLN):
                r = np.sort(RNG.choice(D, min(max(key, WARM + 20), D), replace=False))
                a, b, _p, _s = run_profile(r, days, horder, mat, sels, tpls, gslots)
                if a is None or a.shape[1] < 20:
                    continue
                oa, _c = wf_choose(a); ob, _c = wf_choose(b)
                mm = min(len(oa), len(ob))
                if mm >= 10:
                    vals.append(float(np.mean(oa[-mm:]) - np.mean(ob[-mm:])))
            cache[key] = np.array(vals)
        nl = cache[key]
        p = (1 + np.sum(nl >= obs)) / (len(nl) + 1) if len(nl) else 1.0
        # catalogue: best templates by out-of-sample mean on the profile (>= 60% of played slates)
        V = ~np.isnan(Ro)
        mu = np.where(V.sum(axis=1) >= 0.6 * Ro.shape[1], np.nanmean(np.where(V, Ro, np.nan), axis=1), -np.inf)
        best = np.argsort(-mu)[:5]
        rows.append((pi, it, Ro.shape[1], float(np.mean(own)), float(np.mean(glob)), obs, p, best, mu, ch))
        print(f"  P{pi:03d} {it['name']} ({Ro.shape[1]} played) | walk-forward chosen template {100 * np.mean(own):+.0f}% vs global "
              f"{100 * np.mean(glob):+.0f}% (diff {100 * obs:+.0f}, p {p:.3f}) | best templates OOS: " +
              " || ".join(f"{tpl_name(tpls[i])} {100 * mu[i]:+.0f}%" for i in best if mu[i] > -np.inf))
        # VOLUME for the walk-forward chosen template: J disjoint slips a slate (1 .. 20) and a share of the slips the slate allows
        vol = defaultdict(list)
        for jj, (t, slots, b) in enumerate(zip(played, slots_at, ch)):
            if b is None:
                continue
            by = defaultdict(list)
            for l in days[horder[t]]:
                if l["hit"] is not None and l["factor"] and l["team_id"] is not None:
                    by[(l["prop"], l["tier"], l["side"])].append(l)
            cache_ = {"_by": by}
            res = []
            for off in range(20):
                pk = build(tpls[b], slots, cache_, off)
                if pk is None:
                    break
                res.append(grade(pk, tpls[b][2]))
            if not res:
                continue
            for J in range(1, 21):
                if J <= len(res):
                    vol[("n", J)].append(float(np.mean(res[:J])))
            for q in range(5, 101, 5):
                k_ = max(1, int(round(len(res) * q / 100)))
                vol[("pct", q)].append(float(np.mean(res[:k_])))
        if vol:
            print("      volume (ROI per slip on the slates where that many slips existed): " + " | ".join(
                f"{'' if k[0] == 'n' else ''}{k[1]}{' slips' if k[0] == 'n' else '%'} {100 * np.mean(v):+.0f}% ({len(v)}d)"
                for k, v in sorted(vol.items()) if len(v) >= 10))
        if pi % 25 == 0:
            log(f"profiles: {pi}")
    okb = MX.L2.bh([r[6] for r in rows], 0.10)
    print("\n" + "=" * 190 + f"\nSUMMARY: {int(okb.sum())} of {len(rows)} profiles' walk-forward compositions beat the global ones (BH q 0.10); "
          f"{sum(r[5] > 0 for r in rows)} positive; nominal p < 0.05: {sum(r[6] < 0.05 for r in rows)}")
    for r, w in zip(rows, okb):
        if w:
            print(f"  *** BEATS GLOBAL *** P{r[0]:03d} {r[1]['name']}: diff {100 * r[5]:+.0f} (p {r[6]:.3f})")
    log("done")


if __name__ == "__main__":
    main()
