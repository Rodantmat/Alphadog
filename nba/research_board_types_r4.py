#!/usr/bin/env python3
"""
RESEARCH - BOARD TYPES, ROUND 4: RELATING DAYS - DO BOARD PROFILES CARRY FROM ONE DAY TO ANOTHER? (2026-10-23; owner 10:30 PT "the
profiles need to be identified and correlate in different days, and or they are not really useful"; 10:25 PT "try another 50, 100").
READ-ONLY. Design checked with a Gemini 2.5-pro consult (look-ahead in scaling / neighbours, overlapping windows, permutation nulls,
small number of days, outlier days).

SERIES (one value per slate): the slate residual hit - final_hp for each side x line type (OR UR OG UG OD UD), for the strong standard
legs (final_hp >= 0.65, More / Less), for each prop group x side on standard lines; and the profit per unit staked of every unit of
research_pp_board_profiles_v3 (k = 1) and of the live pair (rebounds 4-Flex + calib R 0.70 3-Power, n 2, leg cap 2).
SLATE FEATURES (all known before the pick): v3's 19 (games, totals, spreads, b2b, rest, key injuries, questionables, board size, tier
shares, low-volume share, legs / game, standard legs >= 0.60 / 0.65 / 0.70, final_hp dispersion, month) + 14 more (weekday, weekend,
prop-group mix x 6, concentration of legs over games (HHI), mean / skew of standard final_hp, top-20 standard final_hp, mean points
line, mean multiplier of goblins / demons).
  1 PERSISTENCE  lag 1..7 rank autocorrelation of every series, per season, vs a 10,000-shuffle null; BH over all series x lags; a
                 result needs the same sign and p < 0.05 in BOTH seasons.
  2 TRAILING     the trailing 3 / 7 / 15-slate mean of a series as the forecast of the next slate (rank correlation, shuffle null that
                 recomputes the trailing means), both seasons.
  3 ANALOG DAYS  for each slate the K nearest PAST slates (>= 40 of them) on the slate features, standardised with past days only;
                 forecast = their mean of the series. Feature sets: MATCH (match-day), BOARD (app board structure), ALL. K chosen per
                 series on 2024-25 among 5 / 10 / 20 / 40 and only then read on 2025-26; K = 20 shown for every series too. Null: the
                 series shuffled over days (neighbours fixed).
  4 RULES        on the live pair and each owner-scope unit (2/3-Power, 4-Flex): play only when the trailing-7 / trailing-15 profit is
                 > 0, or when the ALL analog forecast (K 20) is > 0 - net, ROI, lb5 and net without the 3 best days, both seasons, and
                 p-rand: the share of 1,000 random day-skips at the same play rate with an ROI at least as high (the synthetic smoke
                 test showed random gates moving ROI by +-20 points, so a gate needs p-rand < 0.05 in BOTH seasons).
  5 LEG LEVEL    the trailing and analog slate residuals of the leg's own cell (side x line type, prop group x side) as leg factors
                 through the certified research_board_types.analyze test (bins on fixed residual edges, no look-ahead).
Smoke-tested on synthetic series before the real run: a planted AR(1) 0.4 series is consistent at lags 1-2 and its trailing means
forecast it (p < 0.01); 20 random series give about the chance rate. Analog power is modest: a series driven 0.5 sd by one of 12
features reached rank correlation +0.14 / +0.23 - analog-day forecasts only find strong day-type effects.
Env: DATABASE_URL, R4_PERMS (default 2000), R4_SKIP_LEGS=1 to skip part 5.
"""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import calib_slips as CS                             # noqa: E402
import research_board_types as BT                    # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
import research_pp_board_profiles_v3 as V3           # noqa: E402

SEASONS = BT.SEASONS
T0 = time.time()
PERMS = int(os.environ.get("R4_PERMS", "2000"))
RNG = np.random.default_rng(17)
GROUPS = ("points", "rebounds", "assists", "threes", "combos", "lowvol")
OWNER_SCOPE = [u for u in V3.UNITS if (u[3] == "power" and u[2] in (2, 3)) or (u[3] == "flex" and u[2] == 4)]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def grp_of(prop):
    g = BT.GROUP.get(prop)
    return "lowvol" if prop in V3.LOWVOL else g


def rank(x):
    return pd.Series(x).rank().values


def rcorr(a, b):
    m = ~(np.isnan(a) | np.isnan(b))
    if m.sum() < 15:
        return float("nan"), 0
    ra, rb = rank(a[m]), rank(b[m])
    c = np.corrcoef(ra, rb)[0, 1]
    return float(c), int(m.sum())


def bh(ps):
    ps = np.asarray(ps, float)
    n = len(ps)
    o = np.argsort(ps)
    q = np.empty(n)
    prev = 1.0
    for i in range(n - 1, -1, -1):
        prev = min(prev, ps[o[i]] * n / (i + 1))
        q[o[i]] = prev
    return q


# ---------------------------------------------------------------------------------------------------------------------------------
def slate_features(conn, days):
    base = V3.features(conn, days)
    out = {}
    for (s, d), legs in days.items():
        f = dict(base[(s, d)])
        n = max(len(legs), 1)
        f["weekday"] = d.weekday()
        f["weekend"] = 1.0 if d.weekday() >= 5 else 0.0
        for g in GROUPS:
            f[f"mix_{g}"] = sum(grp_of(l["prop"]) == g for l in legs) / n
        per_game = defaultdict(int)
        for l in legs:
            per_game[l["event_id"]] += 1
        sh = np.array(list(per_game.values()), float) / n
        f["hhi_games"] = float((sh ** 2).sum())
        R = np.array(sorted([l["p"] for l in legs if l["tier"] == "R" and l["p"] is not None], reverse=True), float)
        f["std_mean"] = float(R.mean()) if len(R) else np.nan
        f["std_skew"] = float(pd.Series(R).skew()) if len(R) > 3 else np.nan
        f["std_top20"] = float(R[:20].mean()) if len(R) >= 20 else np.nan
        pts = [float(l["line"]) for l in legs if l["prop"] == "points" and l["tier"] == "R"]
        f["pts_line"] = float(np.mean(pts)) if pts else np.nan
        gf = [float(l["factor"]) for l in legs if l["tier"].startswith("G") and l["factor"]]
        df_ = [float(l["factor"]) for l in legs if l["tier"].startswith("D") and l["factor"]]
        f["gob_factor"] = float(np.mean(gf)) if gf else np.nan
        f["dem_factor"] = float(np.mean(df_)) if df_ else np.nan
        out[(s, d)] = f
    return out


MATCH = ["games", "mean_total", "max_spread", "blowout_share", "b2b_share", "mean_rest", "key_injuries", "questionable", "month",
         "weekday", "weekend"]


def residual_series(days, order):
    """{series name: np.array over order} of slate residuals"""
    cells = defaultdict(lambda: np.full(len(order), np.nan))
    for i, key in enumerate(order):
        acc = defaultdict(list)
        for l in days[key]:
            if l["hit"] is None or l["p"] is None:
                continue
            r = float(l["hit"]) - float(l["p"])
            sd = l["side"][0]
            lt = l["tier"][0]
            acc[f"res {sd}{lt}"].append(r)
            if lt == "R":
                acc[f"res {sd}R {grp_of(l['prop'])}"].append(r)
                if l["p"] >= 0.65:
                    acc[f"res {sd}R p65"].append(r)
        for k, v in acc.items():
            if len(v) >= (5 if k.endswith("p65") else 15):
                cells[k][i] = float(np.mean(v))
    return dict(cells)


def unit_series(conn, days, order):
    cand = defaultdict(list)
    for (s, d), legs in days.items():
        for u in V3.UNITS:
            if u[0] == "calib":
                for slip in CS.unit_slips(legs, u[1], u[2], V3.KMAX):
                    cand[(u, s, d)].append((slip, None))
    for pool in ("_wo", "_wo_nosteals"):
        for u in [u for u in V3.UNITS if u[0] == pool]:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'
                        ORDER BY game_date, k""", (u[1], u[2], u[3], V3.KMAX)):
                if season in SEASONS and (season, d) in days:
                    cand[(u, season, d)].append((legs, bool(sg and sg > 0)))

    def pay(u, s, d, i):
        legs, sg = cand[(u, s, d)][i]
        sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in legs]
        return SE.grade(sl, u[3], same_game=sg)[1] - 1.0

    def pair(s, d):
        taken, use, seen = [], defaultdict(int), set()
        for k in range(V3.KMAX):
            for u in (V3.REB4F, V3.CAL3P):
                lst = cand.get((u, s, d))
                if not lst or k >= len(lst) or len(taken) >= 2:
                    continue
                keys = list(dict.fromkeys(V3.legkey(l) for l in lst[k][0]))
                sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                if sig in seen or any(use[x] >= 2 for x in keys):
                    continue
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append(pay(u, s, d, k))
            if len(taken) >= 2:
                break
        return (sum(taken), len(taken)) if taken else (np.nan, 0)

    prof, stake = {}, {}
    names = ["PAIR"] + [V3.tag(u) for u in V3.UNITS]
    for nm in names:
        prof[nm] = np.full(len(order), np.nan)
        stake[nm] = np.zeros(len(order))
    for i, (s, d) in enumerate(order):
        p, st = pair(s, d)
        prof["PAIR"][i], stake["PAIR"][i] = p, st
        for u in V3.UNITS:
            if cand.get((u, s, d)):
                prof[V3.tag(u)][i] = pay(u, s, d, 0)
                stake[V3.tag(u)][i] = 1
    return prof, stake


# ---------------------------------------------------------------------------------------------------------------------------------
def persistence(series, seas, order):
    print("\n" + "=" * 190 + "\n1. PERSISTENCE - lag rank autocorrelation per season (shuffle null, two-sided p); CONSISTENT = same sign, "
          "p < 0.05 both seasons; q = BH over every series x lag x season")
    rows = []
    for nm, x in series.items():
        for s in SEASONS:
            v = x[seas == s]
            v = v[~np.isnan(v)]
            if len(v) < 40:
                continue
            rv = rank(v)
            rv = (rv - rv.mean()) / (rv.std() + 1e-12)
            NP = PERMS * 5                     # 10,000 by default: enough resolution for BH over every series x lag x season
            perms = np.array([RNG.permutation(rv) for _ in range(NP)])
            for L in range(1, 8):
                obs = float(np.mean(rv[L:] * rv[:-L]))
                null = np.mean(perms[:, L:] * perms[:, :-L], axis=1)
                p = (1 + np.sum(np.abs(null) >= abs(obs))) / (NP + 1)
                rows.append((nm, s, L, obs, p))
    q = bh([r[4] for r in rows])
    tab = {(r[0], r[1], r[2]): (r[3], r[4], qq) for r, qq in zip(rows, q)}
    names = list(dict.fromkeys(r[0] for r in rows))
    ncons = 0
    for nm in names:
        parts = []
        for L in range(1, 8):
            a = tab.get((nm, SEASONS[0], L)); b = tab.get((nm, SEASONS[1], L))
            if not a or not b:
                continue
            cons = a[1] < 0.05 and b[1] < 0.05 and np.sign(a[0]) == np.sign(b[0])
            ncons += cons
            parts.append(f"L{L} {a[0]:+.2f}/{b[0]:+.2f}{'*' if cons else ''}{'q' if cons and max(a[2], b[2]) < 0.05 else ''}")
        print(f"  {nm:<26} " + "  ".join(parts))
    tests = len([1 for nm in names for L in range(1, 8)])
    print(f"  consistent (series x lag): {ncons} of {tests}; expected by chance about {tests * 0.05 * 0.05 * 2:.1f}")


def trailing(series, seas):
    print("\n" + "=" * 190 + "\n2. TRAILING MEAN AS THE NEXT SLATE'S FORECAST - rank correlation (p, shuffle null recomputing the means) per season")
    for nm, x in series.items():
        parts = []
        for N in (3, 7, 15):
            seg = []
            for s in SEASONS:
                v = x[seas == s]
                v = v[~np.isnan(v)]
                if len(v) < N + 30:
                    seg.append("  n/a"); continue

                def fc(arr):
                    c = np.cumsum(np.insert(arr, 0, 0.0))
                    return (c[N:-1] - c[:-N - 1]) / N, arr[N:]
                pr, ac = fc(v)
                obs = rcorr(pr, ac)[0]
                null = []
                for _ in range(max(PERMS // 4, 200)):
                    pp, aa = fc(RNG.permutation(v))
                    null.append(rcorr(pp, aa)[0])
                p = (1 + np.sum(np.abs(null) >= abs(obs))) / (len(null) + 1)
                seg.append(f"{obs:+.2f}(p{p:.2f})")
            parts.append(f"N{N} " + "/".join(seg))
        print(f"  {nm:<26} " + "  ".join(parts))


def analog_neighbours(F, fcols, order, seas, K):
    """neighbour index lists per slate: K nearest past slates (>= 40 past), standardised on the past only"""
    X = np.array([[F[k].get(c, np.nan) for c in fcols] for k in order], float)
    nb = [None] * len(order)
    for i in range(len(order)):
        if i < 40:
            continue
        P = X[:i]
        mu = np.nanmean(P, axis=0)
        sd = np.nanstd(P, axis=0)
        sd[~(sd > 0)] = 1.0
        mu = np.where(np.isnan(mu), 0.0, mu)
        Z = np.nan_to_num((P - mu) / sd)
        z = np.nan_to_num((X[i] - mu) / sd)
        dist = np.sqrt(((Z - z) ** 2).sum(axis=1))
        nb[i] = np.argsort(dist)[:K]
    return nb


def analog(series, seas, NB):
    print("\n" + "=" * 190 + "\n3. ANALOG DAYS - forecast = mean of the K nearest PAST slates; rank correlation with the slate's value (p, "
          "shuffle null); K chosen on 2024-25, read on 2025-26 (the honest test); K 20 for reference")
    out = {}
    nperm = max(PERMS // 4, 200)

    def preds(x, M, ok, K):
        v = x[M]                                   # (slates, K) - rows without neighbours are masked by ok
        cnt = np.sum(~np.isnan(v), axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            pr = np.nansum(v, axis=1) / cnt
        pr[(cnt < max(3, K // 2)) | ~ok] = np.nan
        return pr
    for fs in ("MATCH", "BOARD", "ALL"):
        print(f"\n  feature set {fs}")
        held = 0
        for nm, x in series.items():
            res = {}
            idx = np.where(~np.isnan(x))[0]
            perms = [RNG.permutation(x[idx]) for _ in range(nperm)]
            for K in (5, 10, 20, 40):
                nb = NB[(fs, K)]
                ok = np.array([n is not None for n in nb])
                M = np.array([n if n is not None else np.zeros(K, int) for n in nb])
                pred = preds(x, M, ok, K)
                nulls = {s: [] for s in SEASONS}
                for pv in perms:
                    xp = x.copy()
                    xp[idx] = pv
                    pp = preds(xp, M, ok, K)
                    for s in SEASONS:
                        m = seas == s
                        nulls[s].append(rcorr(pp[m], xp[m])[0])
                for s in SEASONS:
                    m = seas == s
                    obs, n_ = rcorr(pred[m], x[m])
                    nl = np.array(nulls[s]); nl = nl[~np.isnan(nl)]
                    p = (1 + np.sum(np.abs(nl) >= abs(obs))) / (len(nl) + 1) if obs == obs else float("nan")
                    res[(K, s)] = (obs, p, n_)
                if fs == "ALL" and K == 20:
                    out[nm] = pred
            kbest = max((5, 10, 20, 40), key=lambda K: res[(K, SEASONS[0])][0] if res[(K, SEASONS[0])][0] == res[(K, SEASONS[0])][0] else -9)
            a, b = res[(kbest, SEASONS[0])], res[(kbest, SEASONS[1])]
            ok_ = a[0] > 0 and a[1] < 0.05 and b[0] > 0 and b[1] < 0.05
            held += ok_
            r20a, r20b = res[(20, SEASONS[0])], res[(20, SEASONS[1])]
            print(f"    {nm:<26} K*{kbest:<3} 24-25 {a[0]:+.2f} (p {a[1]:.3f}, {a[2]}d) -> 25-26 {b[0]:+.2f} (p {b[1]:.3f}){' HOLDS' if ok_ else ''}"
                  f"   | K20 {r20a[0]:+.2f}/{r20b[0]:+.2f}")
        print(f"  {fs}: {held} of {len(series)} series hold (positive, p < 0.05 in both seasons with K picked on 2024-25)")
        log(f"analog {fs} done")
    return out


def rules(prof, stake, seas, analog_pred):
    print("\n" + "=" * 190 + "\n4. PLAY / SKIP RULES FROM RELATED DAYS - net units (ROI %, lb5 %, net without the 3 best days, slates played)")
    names = ["PAIR"] + [V3.tag(u) for u in OWNER_SCOPE]
    for nm in names:
        x, st = prof[nm], stake[nm]
        lines = []
        for s in SEASONS:
            idx = np.where(seas == s)[0]
            xs = x[idx]
            sts = st[idx]
            per_stake = np.where(sts > 0, xs / np.maximum(sts, 1), np.nan)
            gates = {"ALWAYS": np.ones(len(idx), bool)}
            for N in (7, 15):
                g = np.zeros(len(idx), bool)
                for j in range(len(idx)):
                    past = per_stake[:j]
                    past = past[~np.isnan(past)][-N:]
                    g[j] = len(past) >= N and past.sum() > 0
                gates[f"TRAIL{N}>0"] = g
            # exploratory, added after run 40014229964 part 2 (calib R 0.60 2-Power: trailing-15 profit rank-correlates -0.28 / -0.25
            # with the next slate, p 0.01 both seasons): the contrarian gate - play only after a losing trailing 15
            g = np.zeros(len(idx), bool)
            for j in range(len(idx)):
                past = per_stake[:j]
                past = past[~np.isnan(past)][-15:]
                g[j] = len(past) >= 15 and past.sum() <= 0
            gates["TRAIL15<=0 (expl.)"] = g
            ap = analog_pred.get(nm)
            if ap is not None:
                a = ap[idx]
                gates["ANALOG>0"] = ~np.isnan(a) & (a > 0)
            seg = []
            for gname, g in gates.items():
                take = g & ~np.isnan(xs) & (sts > 0)
                pr = list(xs[take]); sk = list(sts[take])
                if not pr:
                    seg.append(f"{gname} -"); continue
                no3 = sum(sorted(pr)[:-3]) if len(pr) > 3 else float("nan")
                # null: random play-days at the same play rate (the gate's ROI must beat skipping days at random)
                allx = xs[~np.isnan(xs) & (sts > 0)]
                alls = sts[~np.isnan(xs) & (sts > 0)]
                if gname != "ALWAYS" and len(pr) < len(allx):
                    roi = sum(pr) / sum(sk)
                    rr = []
                    for _ in range(1000):
                        pick = RNG.choice(len(allx), len(pr), replace=False)
                        rr.append(allx[pick].sum() / alls[pick].sum())
                    prand = (1 + np.sum(np.array(rr) >= roi)) / 1001
                    tagp = f", p-rand {prand:.2f}"
                else:
                    tagp = ""
                seg.append(f"{gname} {sum(pr):+.1f} ({100 * sum(pr) / sum(sk):+.0f}%, lb5 {100 * V3.lb5(pr, sk):+.0f}, -3best {no3:+.1f}, "
                           f"{len(pr)}d{tagp})")
            lines.append(f"{s}: " + " | ".join(seg))
        print(f"  {nm:<22} " + "\n  " + " " * 22 + " ".join([lines[0]]) + ("\n  " + " " * 22 + " " + lines[1] if len(lines) > 1 else ""))


# ---------------------------------------------------------------------------------------------------------------------------------
def leg_level(res_series, analog_res, order, seas_arr):
    """leg factors from related days, run through the certified BT.analyze"""
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    df = BT.load_legs(conn)
    pos = {k[1]: i for i, k in enumerate(order)}
    edges = (-0.02, -0.0075, 0.0075, 0.02)
    labels = ["neg2", "neg1", "flat", "pos1", "pos2"]

    def trail(x, i, N):
        s = seas_arr[i]
        vals = []
        j = i - 1
        while j >= 0 and len(vals) < N and seas_arr[j] == s:
            if not np.isnan(x[j]):
                vals.append(x[j])
            j -= 1
        return float(np.mean(vals)) if len(vals) >= (1 if N == 1 else max(2, N // 2)) else None   # lag 1 needs one slate (was 0% coverage)

    cache = {}

    def val(kind, cell, i):
        key = (kind, cell, i)
        if key in cache:
            return cache[key]
        x = res_series.get(cell)
        v = None
        if x is not None:
            if kind.startswith("tr"):
                v = trail(x, i, int(kind[2:]))
            elif kind == "lag1":
                v = trail(x, i, 1) if i > 0 else None
            elif kind == "an20":
                a = analog_res.get(cell)
                v = None if a is None or np.isnan(a[i]) else float(a[i])
        cache[key] = v
        return v
    feats = {}
    sd = df["side"].str[0].values
    lt = df["lt"].values
    grp = [grp_of(p) for p in df.prop.values]
    di = [pos.get(d) for d in df.d.values]
    for kind in ("lag1", "tr3", "tr7", "tr15", "an20"):
        a1, a2 = [], []
        for k in range(len(df)):
            i = di[k]
            if i is None:
                a1.append(None); a2.append(None); continue
            a1.append(BT.cut(val(kind, f"res {sd[k]}{lt[k]}", i), edges, labels))
            a2.append(BT.cut(val(kind, f"res {sd[k]}R {grp[k]}", i), edges, labels) if lt[k] == "R" else None)
        feats[f"rd_{kind}_side_lt"] = a1
        feats[f"rd_{kind}_grp_side"] = a2
    log(f"leg factors {len(feats)} on {len(df):,} legs")
    for f, vals in feats.items():
        cov = {s_: float(np.mean([vv is not None for vv, ss in zip(vals, df.season.values) if ss == s_])) for s_ in SEASONS}
        log(f"  {f}: coverage " + ", ".join(f"{k} {100 * v:.0f}%" for k, v in cov.items()))
    BT.analyze(df, feats)


def contra_grid(prof, stake, seas):
    """robustness of the exploratory contrarian gate (calib R 0.60 2-Power; run 40016380957: trailing-15 <= 0 -> +31.2 / +30.8 units,
    p-rand 0.00 both seasons vs always +9.6 / +19.4): every window 5..30 on every owner-scope unit and the pair, with the
    1,000 random-skip null and net without the 3 best days. Synthetic check: random series reach p 0.00 in ONE season at some
    window - a gate needs p < 0.05 in BOTH seasons across neighbouring windows"""
    print("\n" + "=" * 190 + "\n6. CONTRARIAN GATE ROBUSTNESS - play only when the unit's trailing-N profit <= 0 (net, ROI, -3best, days, p-rand) per season")
    names = [V3.tag(u) for u in OWNER_SCOPE] + ["PAIR"]
    for nm in names:
        x, st = prof[nm], stake[nm]
        row = []
        for N in (5, 10, 15, 20, 25, 30):
            seg = []
            for s in SEASONS:
                idx = np.where(seas == s)[0]
                xs, sts = x[idx], st[idx]
                ps = np.where(sts > 0, xs / np.maximum(sts, 1), np.nan)
                g = np.zeros(len(idx), bool)
                for j in range(len(idx)):
                    past = ps[:j]
                    past = past[~np.isnan(past)][-N:]
                    g[j] = len(past) >= N and past.sum() <= 0
                ok = ~np.isnan(xs) & (sts > 0)
                take = g & ok
                pr, sk = xs[take], sts[take]
                if len(pr) < 5:
                    seg.append(f"{s[2:]} -"); continue
                allx, alls = xs[ok], sts[ok]
                roi = pr.sum() / sk.sum()
                rr = [allx[pk].sum() / alls[pk].sum() for pk in (RNG.choice(len(allx), len(pr), replace=False) for _ in range(1000))]
                prand = (1 + np.sum(np.array(rr) >= roi)) / 1001
                no3 = np.sort(pr)[:-3].sum()
                seg.append(f"{s[2:]} {pr.sum():+.1f} ({100 * roi:+.0f}%, -3b {no3:+.1f}, {len(pr)}d, p {prand:.2f}) of all {allx.sum():+.1f}")
            row.append(f"N{N}: " + " / ".join(seg))
        print(f"  {nm}\n      " + "\n      ".join(row))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = RC.load(conn)
    order = sorted(days, key=lambda k: k[1])
    seas = np.array([k[0] for k in order])
    log(f"slates {len(order)} ({', '.join(f'{s} {int((seas == s).sum())}' for s in SEASONS)})")
    F = slate_features(conn, days)
    allf = list(next(iter(F.values())).keys())
    board = [c for c in allf if c not in MATCH]
    log(f"slate features {len(allf)} (match {len(MATCH)}, board {len(board)})")
    res = residual_series(days, order)
    prof, stake = unit_series(conn, days, order)
    log(f"series: {len(res)} residual, {len(prof)} unit")
    per_unit = {nm: np.where(stake[nm] > 0, prof[nm] / np.maximum(stake[nm], 1), np.nan) for nm in prof}
    series = dict(res)
    series.update({f"unit {k}": v for k, v in per_unit.items()})
    persistence(series, seas, order)
    trailing(series, seas)
    NB = {}
    for fs, cols in (("MATCH", MATCH), ("BOARD", board), ("ALL", allf)):
        for K in (5, 10, 20, 40):
            NB[(fs, K)] = analog_neighbours(F, cols, order, seas, K)
    log("analog neighbours built")
    an = analog(series, seas, NB)
    rules(prof, stake, seas, {k[5:]: v for k, v in an.items() if k.startswith("unit ")})
    if not os.environ.get("R4_SKIP_LEGS"):
        leg_level(res, {k: v for k, v in an.items() if k.startswith("res ")}, order, seas)
    log("done")


if __name__ == "__main__":
    main()
