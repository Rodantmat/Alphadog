#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES, LAYER 2 BATTERY 3: THE DOCUMENTED SLIP METHOD, REDONE PER PROFILE (2026-10-24; owner 15:48 PT: "we're
not trying the same slip strategies that we had before. We're trying everything again. So look at ... the slip documentation that
we have, research online. You need to redo everything you have done before for each one of those profiles"). READ-ONLY.

Profiles: Layer 1 (research_board_profiles_l1.build). Legs: the certified map nba_score.tier_map_legs (the same legs as batteries 1-2),
with ALL THREE documented ranks attached - final_hp, baseline_hp, final_score (NBA_SLIP_BUILDING_STRATEGY section 19p) - and each
leg's rank position inside its cell (prop x line type x side, that day).

STAGE A - THE GOLD-BAND MAP PER PROFILE (strategy doc 19k, the owner's cell method): for every rank x cell x top-n cut (n 1..20),
  hit rate of the cell's top-n legs and their real multiplier m; break-even p_be = 0.55 / m (3-pick Power per-leg bar); margin =
  hit - p_be. A cell-cut is GOLD on a profile when its margin is > 0 in BOTH seasons on the profile's slates (>= 8 slates each).
  Per profile: its gold cells, the gold cells it GAINS vs all slates (gold on the profile, not gold on all slates), the ones it LOSES,
  and the same counts on random slate sets of the same sizes (is the profile's map really different?).
STAGE B - THE SLIP COMPOSITIONS (strategy doc 25, 13, 16, 18, 20, 31) as strategies, one slip a slate, graded with PrizePicks'
  payouts (build_slip_engine.grade):
  single:<cell>    the cell's top legs by each rank (2-6 legs)                                   ~96 cells x 3 ranks
  weighted:<cell>  2 legs of the cell + the best Regular legs of the defensive / points core      (the live 'weighted' family)
  calib<th>        Regular legs with final_hp >= 0.60 / 0.65 / 0.70, best first                    (the live 'calib' family)
  mixed tier       Regular core + 1 goblin (G1 / G2 / G3) or + 1 demon (D1 / D2 / D3)               (doc 25 mixed_tier)
  rank window      Regular legs whose rank in their cell is in 1-5 / 2-6 / 3-10 / 6-20 / 1-10 / 1-20 (caps on ranks, tops)
  player trailing  Regular legs ranked by the PLAYER's own last-10 hit rate (as of the slate) / blended with final_hp (doc 8a, 20)
  each x More / Less / both where it applies x 2P 3P 3F 4P 4F 5P 5F 6P 6F.
  Read exactly like batteries 1-2 (research_board_profiles_l2.evaluate: per profile own 5 vs all-slates 5, out of sample both
  directions, random slate sets, BH; PLAY / AVOID; per structure) PLUS the CATALOGUE the owner asked for: for every profile and
  every structure, the strategies that win on the profile's slates in BOTH seasons, with their ROI on the profile and on all slates.
Env: DATABASE_URL, LP_NULL (default 200), L3_STAGE (A / B / AB, default AB).
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
import research_board_profiles_l2 as L2              # noqa: E402

T0 = time.time()
STAGE = os.environ.get("L3_STAGE", "AB")
HIST = L1.REAL_HIST          # the real seasons (with L1_AGNOSTIC, L1.HIST becomes the two time halves once Layer 1 has been built)
GRP = L1.GRP
RANK_KEYS = ("final_hp", "baseline_hp", "final_score")
STRUCTS = L2.STRUCTS
DEF_CORE = {"steals", "stocks", "turnovers", "blocks", "points", "pts_reb", "pra", "pts_ast", "rebounds"}
RNG = np.random.default_rng(31)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def attach_ranks(conn, days):
    """every leg gets its baseline_hp / final_score scores (same certified map) and its rank inside its cell by each rank"""
    sc = {}
    for rk in ("baseline_hp", "final_score"):
        for d, pl, pr, t, sd, ln, s in conn.execute(
                """SELECT game_date, player, prop, tier, side, line::float8, score::float8 FROM nba_score.tier_map_legs
                   WHERE rank_key = %s AND season = ANY(%s)""", (rk, list(HIST))):
            sc[(rk, d, pl, pr, t, sd, ln)] = s
    miss = 0
    for (s_, d), legs in days.items():
        if s_ not in HIST:
            continue
        for l in legs:
            l["r_final_hp"] = l["p"]
            for rk in ("baseline_hp", "final_score"):
                v = sc.get((rk, d, l["player"], l["prop"], l["tier"], l["side"], l["line"]))
                l[f"r_{rk}"] = v if v is not None else l["p"]
                miss += v is None
        cells = defaultdict(list)
        for l in legs:
            cells[(l["prop"], l["tier"], l["side"])].append(l)
        for c, ls in cells.items():
            for rk in RANK_KEYS:
                for i, l in enumerate(sorted(ls, key=lambda x: -(x[f"r_{rk}"] if x[f"r_{rk}"] is not None else -1))):
                    l[f"n_{rk}"] = i + 1
    log(f"ranks attached ({miss:,} leg x rank pairs without a score fell back to final_hp)")


# ============================================================ STAGE A - the gold-band map per profile ==================================
def stage_a(reg, days, horder, hseas, hist_ix):
    cells = sorted({(l["prop"], l["tier"], l["side"]) for k in horder for l in days[k]})
    cuts = list(range(1, 21))
    # per (rank, cell, cut): per slate hit sum, leg count, factor sum
    D = len(horder)
    keys = [(rk, c, n) for rk in RANK_KEYS for c in cells for n in cuts]
    kix = {k: i for i, k in enumerate(keys)}
    H = np.zeros((len(keys), D), np.float32)
    N = np.zeros((len(keys), D), np.float32)
    F = np.zeros((len(keys), D), np.float32)
    for di, k in enumerate(horder):
        by = defaultdict(list)
        for l in days[k]:
            if l["hit"] is not None:
                by[(l["prop"], l["tier"], l["side"])].append(l)
        for c, ls in by.items():
            for rk in RANK_KEYS:
                srt = sorted(ls, key=lambda x: x[f"n_{rk}"])
                hs = np.cumsum([int(x["hit"]) for x in srt]); fs = np.cumsum([float(x["factor"]) for x in srt])
                for n in cuts:
                    if len(srt) < n:
                        break                      # a cut counts only on slates where the cell has >= n legs (doc 19k)
                    i = kix[(rk, c, n)]
                    H[i, di] = hs[n - 1]; N[i, di] = n; F[i, di] = fs[n - 1]

    def margins(M):
        """M: slates x k masks -> margin (keys x k), slates with the cut (keys x k)"""
        hh, nn, ff = H @ M, N @ M, F @ M
        dd = (N > 0).astype(np.float32) @ M
        with np.errstate(invalid="ignore", divide="ignore"):
            hit = hh / nn
            m = ff / nn
            mar = hit - 0.55 / m
        return mar, dd
    gold_all = np.ones(len(keys), bool)
    for s in HIST:
        mar, dd = margins((hseas == s).astype(np.float32)[:, None])
        gold_all &= (mar[:, 0] > 0) & (dd[:, 0] >= 8)
    print("\n" + "=" * 190 + f"\nSTAGE A - GOLD-BAND MAP ({len(cells)} cells x 3 ranks x 20 cuts = {len(keys):,} cell-cuts); gold on ALL slates in both "
          f"seasons: {int(gold_all.sum())}")
    for rk in RANK_KEYS:
        g = [k for k, ok in zip(keys, gold_all) if ok and k[0] == rk]
        cl = defaultdict(list)
        for _, c, n in g:
            cl[c].append(n)
        print(f"  {rk}: " + "; ".join(f"{c[0]} {c[1]} {c[2]} n{min(v)}-{max(v)}" for c, v in sorted(cl.items())))
    null_cache = {}
    rows = []
    for pi, it in enumerate(reg.items, 1):
        mask = it["mask"][hist_ix]
        gold = np.ones(len(keys), bool)
        for s in HIST:
            mar, dd = margins((mask & (hseas == s)).astype(np.float32)[:, None])
            gold &= (mar[:, 0] > 0) & (dd[:, 0] >= 8)
        gain, lose = gold & ~gold_all, ~gold & gold_all
        sz = tuple(int((mask & (hseas == s)).sum()) for s in HIST)
        if sz not in null_cache:
            R = 100
            gR = np.ones((len(keys), R), bool)
            for s, n_ in zip(HIST, sz):
                mar, dd = margins(L2.random_masks(hseas, s, n_, R))
                gR &= (mar > 0) & (dd >= 8)
            ng, nl = (gR & ~gold_all[:, None]).sum(axis=0), (~gR & gold_all[:, None]).sum(axis=0)
            null_cache[sz] = (float(np.percentile(ng, 95)), float(np.percentile(nl, 95)), float(np.mean(ng)), float(np.mean(nl)))
        g95, l95, gm, lm = null_cache[sz]
        rows.append((pi, it, int(gold.sum()), int(gain.sum()), int(lose.sum()), g95, l95, gm, lm,
                     [keys[i] for i in np.where(gain)[0]], [keys[i] for i in np.where(lose)[0]]))
    print(f"\n  per profile: gold cell-cuts, GAINED vs all slates (random sets: mean / p95), LOST (random mean / p95)")
    over = 0
    for pi, it, ng_, ngain, nlose, g95, l95, gm, lm, gk, lk in rows:
        flag = "MAP DIFFERS " if (ngain > g95 or nlose > l95) else ""
        over += bool(flag)
        print(f"  {flag}P{pi:03d} {it['name']} | gold {ng_} | gained {ngain} (random {gm:.0f} / p95 {g95:.0f}) | lost {nlose} (random {lm:.0f} / "
              f"p95 {l95:.0f})")
        if flag:
            cl = defaultdict(list)
            for rk, c, n in gk:
                cl[(rk, c)].append(n)
            if cl:
                print("      gains: " + "; ".join(f"{rk} {c[0]} {c[1]} {c[2]} n{min(v)}-{max(v)}" for (rk, c), v in sorted(cl.items())[:20]))
    print(f"\n  STAGE A SUMMARY: {over} of {len(rows)} profiles have a gold map beyond random slate sets' p95 (~{0.1 * len(rows):.0f} expected by "
          f"chance: two one-sided p95 tests)")


# ============================================================ STAGE B - the documented compositions ===================================
def stage_b_grid(days, horder):
    cells = sorted({(l["prop"], l["tier"], l["side"]) for k in horder for l in days[k]})
    strat = []
    for rk in RANK_KEYS:
        for c in cells:
            strat.append(("single", c, rk))
            strat.append(("weighted", c, rk))
    for th in (0.60, 0.65, 0.70):
        for sd in ("Over", "Under", "both"):
            strat.append(("calib", th, sd))
    for rk in RANK_KEYS:
        for ex in ("G1", "G2", "G3", "D1", "D2", "D3"):
            strat.append(("mixed", ex, rk))
        for win in ((1, 5), (2, 6), (3, 10), (6, 20), (1, 10), (1, 20)):
            for sd in ("Over", "Under", "both"):
                strat.append(("window", win, rk, sd))
    for how in ("trail", "trailblend"):
        for sd in ("Over", "Under", "both"):
            for ps in ("all", "core", "defensive", "points"):
                strat.append(("player", how, sd, ps))
    full = [(s, size, st) for s in strat for (size, st) in STRUCTS]
    P = np.full((len(full), len(horder)), np.nan, np.float32)
    nst = len(STRUCTS)
    ptrail = defaultdict(lambda: deque(maxlen=10))       # player -> last 10 standard-leg hits (earlier slates only)

    def take(cands, k=6, first=()):
        pick, players, games = list(first), {l["player"] for l in first}, defaultdict(int)
        for l in first:
            games[l["event_id"]] += 1
        for l in cands:
            if len(pick) >= k:
                break
            if l["player"] in players or games[l["event_id"]] >= 2:
                continue
            pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        return pick

    for di, key in enumerate(horder):
        legs = [l for l in days[key] if l["team_id"] is not None and l["p"] is not None]
        bycell = defaultdict(list)
        for l in legs:
            bycell[(l["prop"], l["tier"], l["side"])].append(l)
        reg_legs = [l for l in legs if l["tier"] == "R"]
        core = {rk: sorted([l for l in reg_legs if l["prop"] in DEF_CORE and l["side"] == "Over"], key=lambda x: -x[f"r_{rk}"])
                for rk in RANK_KEYS}
        for l in reg_legs:
            h = ptrail[l["player"]]
            l["_ptr"] = (sum(h) / len(h)) if len(h) >= 5 else float(l["p"])
        for si, s in enumerate(strat):
            kind = s[0]
            if kind == "single":
                _, c, rk = s
                pick = take(sorted(bycell.get(c, []), key=lambda x: x[f"n_{rk}"]))
            elif kind == "weighted":
                _, c, rk = s
                two = take(sorted(bycell.get(c, []), key=lambda x: x[f"n_{rk}"]), 2)
                pick = take(core[rk], 6, two) if len(two) == 2 else []
            elif kind == "calib":
                _, th, sd = s
                pick = take(sorted([l for l in reg_legs if l["p"] >= th and (sd == "both" or l["side"] == sd)], key=lambda x: -x["p"]))
            elif kind == "mixed":
                _, ex, rk = s
                one = take(sorted([l for l in legs if l["tier"] == ex], key=lambda x: -x[f"r_{rk}"]), 1)
                pick = take(core[rk], 6, one) if one else []
            elif kind == "window":
                _, (a, b), rk, sd = s
                pick = take(sorted([l for l in reg_legs if a <= l[f"n_{rk}"] <= b and (sd == "both" or l["side"] == sd)],
                                   key=lambda x: -x[f"r_{rk}"]))
            else:
                _, how, sd, ps = s
                pool = [l for l in reg_legs if (sd == "both" or l["side"] == sd) and (
                    ps == "all" or (ps == "core" and GRP.get(l["prop"]) != "lowvol") or
                    (ps == "defensive" and GRP.get(l["prop"]) == "lowvol") or (ps == "points" and l["prop"] == "points"))]
                kf = (lambda x: -x["_ptr"]) if how == "trail" else (lambda x: -(0.5 * x["_ptr"] + 0.5 * x["p"]))
                pick = take(sorted(pool, key=kf))
            for j, (size, st) in enumerate(STRUCTS):
                if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
                    sl = [{"hit": l["hit"], "factor": float(l["factor"] or 1.0), "event_id": l["event_id"]} for l in pick[:size]]
                    P[si * nst + j, di] = SE.grade(sl, st)[1] - 1.0
        for l in reg_legs:                                   # the slate's results enter the player trail AFTER it is used
            if l["hit"] is not None and l["side"] == "Over":
                ptrail[l["player"]].append(int(l["hit"]))
        if di % 25 == 0:
            log(f"stage B grid: slate {di + 1} / {len(horder)}")
    return full, P


def name3(s):
    b, size, st = s
    tag = f"{size}{'F' if st == 'flex' else 'P'}"
    k = b[0]
    if k in ("single", "weighted"):
        return f"{k}:{b[1][0]} {b[1][1]} {b[1][2]} by {b[2]} {tag}"
    if k == "calib":
        return f"calib R final_hp>={b[1]:.2f} {b[2]} {tag}"
    if k == "mixed":
        return f"core + 1 {b[1]} by {b[2]} {tag}"
    if k == "window":
        return f"R rank {b[1][0]}-{b[1][1]} in cell by {b[2]} {b[3]} {tag}"
    return f"player trail ({b[1]}) {b[2]} {b[3]} {tag}"


def catalogue(P, strat, reg, hist_ix, hseas, label):
    """the owner's view: per profile, the strategies winning on its slates in BOTH seasons (lower bound > 0 each season), best 3 by the
    weaker season, with the same strategies' ROI on all slates"""
    st = L2.Stats(P)
    all_mu = {s: st.agg((hseas == s).astype(np.float32)[:, None])[1][:, 0] for s in HIST}
    print("\n" + "=" * 190 + f"\n[{label}] CATALOGUE - per profile, strategies winning on its slates in BOTH seasons (lb > 0 each), best 3 by the weaker "
          "season | same strategy on ALL slates")
    for pi, it in enumerate(reg.items, 1):
        mask = it["mask"][hist_ix]
        ok = np.ones(len(strat), bool)
        mus = []
        for s in HIST:
            ms = (mask & (hseas == s)).astype(np.float32)[:, None]
            n, mu, sd = st.agg(ms)
            ok &= (n[:, 0] >= max(8, 0.5 * ms.sum())) & (mu[:, 0] - sd[:, 0] / np.sqrt(np.maximum(n[:, 0], 1)) > 0)
            mus.append((mu[:, 0], n[:, 0]))
        ix = np.where(ok)[0]
        if not len(ix):
            print(f"  P{pi:03d} {it['name']}: none")
            continue
        weak = np.minimum(mus[0][0][ix], mus[1][0][ix])
        best = ix[np.argsort(-weak)][:3]
        print(f"  P{pi:03d} {it['name']}: {len(ix)} both-season winners | " + " || ".join(
            f"{name3(strat[i])}: profile {100 * mus[0][0][i]:+.0f}% ({int(mus[0][1][i])}d) / {100 * mus[1][0][i]:+.0f}% ({int(mus[1][1][i])}d), "
            f"all slates {100 * all_mu[HIST[0]][i]:+.0f}% / {100 * all_mu[HIST[1]][i]:+.0f}%" for i in best))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    reg, days, order, seas = L1.build(conn)
    # the MLB runners terminate connections idle > 2 minutes (selfCleanupAfterPhase): fresh connection after Layer 1's compute
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    log(f"Layer 1: {len(reg.items)} profiles")
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    hseas = seas[hist_ix]
    attach_ranks(conn, days)
    if "A" in STAGE:
        stage_a(reg, days, horder, hseas, hist_ix)
    if "B" in STAGE:
        strat, P = stage_b_grid(days, horder)
        log(f"stage B grid done: {len(strat):,} strategies; slips built {int((~np.isnan(P)).sum()):,}")
        L2.name = name3                                      # evaluate() prints names through L2.name
        res = {"ALL STRUCTURES": L2.evaluate(P, strat, "B ALL STRUCTURES", reg, hist_ix, hseas)}
        for size, stt in STRUCTS:
            rows_ = [i for i, s_ in enumerate(strat) if s_[1:] == (size, stt)]
            lab = f"B {size}{'F' if stt == 'flex' else 'P'}"
            res[lab] = L2.evaluate(P[rows_], [strat[i] for i in rows_], lab, reg, hist_ix, hseas)
            if (size, stt) in L2.OWNER_SCOPE:
                catalogue(P[rows_], [strat[i] for i in rows_], reg, hist_ix, hseas, lab)
        print("\n" + "=" * 190 + "\nSTAGE B SUMMARY: " + " | ".join(f"{k}: {a} WORK, {b} many-winners" for k, (a, b) in res.items()))
    log("done")


if __name__ == "__main__":
    main()
