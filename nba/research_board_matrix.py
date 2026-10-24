#!/usr/bin/env python3
"""
RESEARCH - THE PROFILE x STRATEGY MATRIX, LEVELS 0-2 (2026-10-24; owner 15:58 PT: "create some kind of matrix that does that all for
all profiles, all at once ... different types of trailings - player trailings, prop line trailings, prop line variation trailings,
goblins and demons trailings per tier and per direction, and overall ... plain hit rate, baseline hit rate, score hit rate, final hit
probability hit rate, and each one of them can have different tops and different caps ... then the enhancement factors ... multiple
layers on top of it to get better legs and to drop worse legs ... profiles not forced to apply for both seasons ... maybe profiles that
just fit the four boards you have this season - that's even better, because it's recent"). READ-ONLY.

LEVEL 0 - PROFILES: Layer 1 (research_board_profiles_l1.build; run with L1_ONE_SEASON=1 so a profile may live in one season) plus the
  LOOK-ALIKE profiles of this season's boards: for each 2026-27 slate, its MX_K nearest historical slates on the ALL family
  (trailing-percentile space), and the union of them ("like this season").
LEVEL 1 - LEG SELECTORS: cell (prop x line type x side) x RANK x CUT, the legs of that cell the selector takes each slate:
  ranks   final_hp, baseline_hp, final_score (the certified map), PLAIN player hit rate on the cell (all earlier legs), PLAYER trailing
          t3 / t5 / t10 (player x prop x line type x side, earlier slates only), PROP-LINE trailing (prop x line type x side x exact
          line, last 30 earlier legs), LINE-VARIATION trailing (prop x line type x side x line band low / mid / high, last 60)
  cuts    top 1 2 3 5 8 10 15 20 and top 5 / 10 / 20 / 30 % of the cell
LEVEL 2 - ENHANCEMENT FACTORS on top of the final_hp selectors (cuts 3 / 5 / 10 / 20): keep only the legs inside a band of player
  trailing (t3 / t10 hot or cold), consistency (sd10), plain hit rate, minutes trend, usage trend, rest / back-to-back, season phase,
  line class, model-vs-market edge, book count (nba_score.cand_leg_features, the documented factor table, where the leg has it), and
  the line type's own trailing (goblin / demon / standard per tier and direction, last 300 earlier legs) above / below its median.
READ, per selector: legs, hit, mean multiplier m, p.m and MARGIN = hit - 0.55 / m (the 3-pick Power per-leg bar, strategy doc 19k).
  Per profile (and for ALL slates):
   * CATALOGUE: the selectors with the best lower-bound margin on the profile's slates (any season; pooled and per season shown),
     next to the same selector on all slates.
   * WALK-FORWARD (no season forced): on every profile slate from its 16th, the MX_TOPK selectors with the best lower-bound margin on
     the profile's EARLIER slates are 'played' (their legs that slate); realized margin per leg vs the same from the MX_TOPK chosen on
     ALL earlier slates; p vs random slate sets of the same size; BH q 0.10.
Levels 3 (exact compositions, e.g. 2 Less turnovers + 1 Less blocks, graded as real slips) and 4 (slips a day / % of slips or legs)
run on the selectors this level keeps (research_board_matrix_slips.py).
Env: DATABASE_URL, MX_K (look-alike size, default 40), MX_TOPK (default 5), MX_NULL (default 60), L1_ONE_SEASON.
"""
import os
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_board_profiles_l1 as L1              # noqa: E402
import research_board_profiles_l2 as L2              # noqa: E402
import research_board_profiles_l3 as L3              # noqa: E402

T0 = time.time()
HIST = L1.HIST
K_LIKE = int(os.environ.get("MX_K", "40"))
TOPK = int(os.environ.get("MX_TOPK", "5"))
NULLN = int(os.environ.get("MX_NULL", "60"))
RNG = np.random.default_rng(41)
WARM = 15
RANKS = ("final_hp", "baseline_hp", "final_score", "plain", "t3", "t5", "t10", "line_trail", "band_trail")
# EVERY cut, not examples (owner 16:01 PT: "1, 2, 3, 4, 5, 10, 20 - that's an example. Granulate everything in between and test every
# single number in between, even above and beyond ... make the system understand what makes sense to try"): top n = 1 .. 30 and top
# 1 .. 40 % of the cell; a cut is read only on slates where the cell has that many legs and only when it reaches >= 8 slates - the
# data decide how deep a cut is worth going
CUTS = [("n", k) for k in range(1, 31)] + [("pct", q) for q in range(1, 41)]
FCUTS = tuple(range(1, 21))


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def leg_features(conn, days, horder):
    """trailings (strictly earlier slates), line bands, the documented factor table"""
    fac = {}
    for row in conn.execute("""SELECT game_date, player, prop, tier, side, line::float8, sd10, cold_all, min_trend, usg_trend, rest_days,
                                      phase, line_class, mkt_edge, books FROM nba_score.cand_leg_features"""):
        fac[row[:6]] = row[6:]
    # line bands per (prop, tier): terciles of the line over the first season
    lines = defaultdict(list)
    for k in horder:
        if k[0] == HIST[0]:
            for l in days[k]:
                lines[(l["prop"], l["tier"])].append(float(l["line"]))
    cutp = {c: np.percentile(v, [33.3, 66.7]) for c, v in lines.items() if len(v) >= 30}
    pl_tr = defaultdict(lambda: deque(maxlen=10))      # (player, prop, tier, side) -> last 10 hits
    pl_all = defaultdict(lambda: [0, 0])                # same key -> all earlier hits / legs
    ln_tr = defaultdict(lambda: deque(maxlen=30))       # (prop, tier, side, line)
    bd_tr = defaultdict(lambda: deque(maxlen=60))       # (prop, tier, side, band)
    tier_tr = defaultdict(lambda: deque(maxlen=300))    # (tier, side) - goblin / demon / standard trailing per tier and direction
    nf = 0
    for k in horder:
        legs = days[k]
        tier_med = {}
        for l in legs:
            ck = (l["player"], l["prop"], l["tier"], l["side"])
            h = pl_tr[ck]
            l["f_t3"] = float(np.mean(list(h)[-3:])) if len(h) >= 3 else np.nan
            l["f_t5"] = float(np.mean(list(h)[-5:])) if len(h) >= 5 else np.nan
            l["f_t10"] = float(np.mean(h)) if len(h) >= 10 else (float(np.mean(h)) if len(h) >= 5 else np.nan)
            l["f_sd10"] = float(np.std(h)) if len(h) >= 5 else np.nan
            a, b = pl_all[ck]
            l["f_plain"] = a / b if b >= 5 else np.nan
            c = cutp.get((l["prop"], l["tier"]))
            band = "mid" if c is None else ("low" if l["line"] <= c[0] else "high" if l["line"] > c[1] else "mid")
            l["band"] = band
            lt = ln_tr[(l["prop"], l["tier"], l["side"], l["line"])]
            l["f_line_trail"] = float(np.mean(lt)) if len(lt) >= 8 else np.nan
            bt = bd_tr[(l["prop"], l["tier"], l["side"], band)]
            l["f_band_trail"] = float(np.mean(bt)) if len(bt) >= 15 else np.nan
            tt = tier_tr[(l["tier"], l["side"])]
            l["f_tier_trail"] = float(np.mean(tt)) if len(tt) >= 50 else np.nan
            fv = fac.get((k[1], l["player"], l["prop"], l["tier"], l["side"], l["line"]))
            if fv is not None:
                nf += 1
            (l["x_sd10"], l["x_cold"], l["x_min"], l["x_usg"], l["x_rest"], l["x_phase"], l["x_lclass"], l["x_mkt"],
             l["x_books"]) = fv if fv is not None else (None,) * 9
        # tier trailing median per slate (for the above / below band)
        for t_ in {(l["tier"], l["side"]) for l in legs}:
            v = [l["f_tier_trail"] for l in legs if (l["tier"], l["side"]) == t_ and l["f_tier_trail"] == l["f_tier_trail"]]
            tier_med[t_] = float(np.median(v)) if v else np.nan
        for l in legs:                                   # results enter the trailings AFTER the slate is described
            if l["hit"] is None:
                continue
            ck = (l["player"], l["prop"], l["tier"], l["side"])
            pl_tr[ck].append(int(l["hit"])); pl_all[ck][0] += int(l["hit"]); pl_all[ck][1] += 1
            ln_tr[(l["prop"], l["tier"], l["side"], l["line"])].append(int(l["hit"]))
            bd_tr[(l["prop"], l["tier"], l["side"], l["band"])].append(int(l["hit"]))
            tier_tr[(l["tier"], l["side"])].append(int(l["hit"]))
    log(f"leg features: {nf:,} legs carry the documented factor row")


FACTOR_BANDS = [
    ("t3 hot >= 0.67", lambda l: l["f_t3"] == l["f_t3"] and l["f_t3"] >= 0.67),
    ("t3 cold <= 0.33", lambda l: l["f_t3"] == l["f_t3"] and l["f_t3"] <= 0.33),
    ("t10 >= 0.6", lambda l: l["f_t10"] == l["f_t10"] and l["f_t10"] >= 0.6),
    ("t10 <= 0.4", lambda l: l["f_t10"] == l["f_t10"] and l["f_t10"] <= 0.4),
    ("consistent sd10 <= 0.4", lambda l: l["f_sd10"] == l["f_sd10"] and l["f_sd10"] <= 0.4),
    ("plain >= 0.6", lambda l: l["f_plain"] == l["f_plain"] and l["f_plain"] >= 0.6),
    ("plain <= 0.45", lambda l: l["f_plain"] == l["f_plain"] and l["f_plain"] <= 0.45),
    ("minutes up", lambda l: l["x_min"] is not None and l["x_min"] > 0),
    ("minutes down", lambda l: l["x_min"] is not None and l["x_min"] < 0),
    ("usage up", lambda l: l["x_usg"] is not None and l["x_usg"] > 0),
    ("usage down", lambda l: l["x_usg"] is not None and l["x_usg"] < 0),
    ("rested >= 2 days", lambda l: l["x_rest"] is not None and l["x_rest"] >= 2),
    ("back-to-back", lambda l: l["x_rest"] is not None and l["x_rest"] <= 1),
    ("phase early", lambda l: l["x_phase"] == "early"), ("phase mid", lambda l: l["x_phase"] == "mid"),
    ("phase late", lambda l: l["x_phase"] == "late"),
    ("line low", lambda l: l["band"] == "low"), ("line mid", lambda l: l["band"] == "mid"), ("line high", lambda l: l["band"] == "high"),
    ("market edge > 0", lambda l: l["x_mkt"] is not None and l["x_mkt"] > 0),
    ("market edge > 0.03", lambda l: l["x_mkt"] is not None and l["x_mkt"] > 0.03),
    ("books >= 3", lambda l: l["x_books"] is not None and l["x_books"] >= 3),
    ("line-type trailing above median", lambda l: l.get("_tt_hi") is True),
    ("line-type trailing below median", lambda l: l.get("_tt_hi") is False),
]


def selector_matrix(days, horder):
    cells = sorted({(l["prop"], l["tier"], l["side"]) for k in horder for l in days[k]})
    sels = [("rank", c, rk, cut) for c in cells for rk in RANKS for cut in CUTS]
    sels += [("factor", c, fb[0], n) for c in cells for fb in FACTOR_BANDS for n in FCUTS]
    six = {s: i for i, s in enumerate(sels)}
    D = len(horder)
    H = np.zeros((len(sels), D), np.float32)
    N = np.zeros((len(sels), D), np.float32)
    F = np.zeros((len(sels), D), np.float32)
    BE = np.zeros((len(sels), D), np.float32)          # sum of per-leg 0.55 / factor (break-even of each leg)
    fbs = dict(FACTOR_BANDS)
    for di, k in enumerate(horder):
        by = defaultdict(list)
        for l in days[k]:
            if l["hit"] is not None and l["factor"]:
                by[(l["prop"], l["tier"], l["side"])].append(l)
        # line-type trailing above / below its median on the slate
        tts = defaultdict(list)
        for l in days[k]:
            if l["f_tier_trail"] == l["f_tier_trail"]:
                tts[l["tier"]].append(l["f_tier_trail"])
        med = {t: float(np.median(v)) for t, v in tts.items()}
        for l in days[k]:
            l["_tt_hi"] = (l["f_tier_trail"] >= med[l["tier"]]) if l["f_tier_trail"] == l["f_tier_trail"] and l["tier"] in med else None
        for c, ls in by.items():
            for rk in RANKS:
                key = (lambda x: -x[f"r_{rk}"]) if rk in ("final_hp", "baseline_hp", "final_score") else \
                    (lambda x, rk=rk: (-(x[f"f_{rk}"] if x[f"f_{rk}"] == x[f"f_{rk}"] else -1), -x["p"]))
                srt = sorted(ls, key=key)
                if rk not in ("final_hp", "baseline_hp", "final_score"):
                    srt = [x for x in srt if x[f"f_{rk}"] == x[f"f_{rk}"]]
                if not srt:
                    continue
                hs = np.cumsum([int(x["hit"]) for x in srt]); fs = np.cumsum([float(x["factor"]) for x in srt])
                bs = np.cumsum([0.55 / float(x["factor"]) for x in srt])
                for cut in CUTS:
                    n = cut[1] if cut[0] == "n" else max(1, int(round(len(srt) * cut[1] / 100)))
                    if len(srt) < n:
                        continue
                    i = six[("rank", c, rk, cut)]
                    H[i, di] = hs[n - 1]; N[i, di] = n; F[i, di] = fs[n - 1]; BE[i, di] = bs[n - 1]
            srt = sorted(ls, key=lambda x: -x["r_final_hp"])
            for fname, fn in FACTOR_BANDS:
                for n in FCUTS:
                    sub = [x for x in srt[:n] if fn(x)]
                    if not sub:
                        continue
                    i = six[("factor", c, fname, n)]
                    H[i, di] = sum(int(x["hit"]) for x in sub); N[i, di] = len(sub)
                    F[i, di] = sum(float(x["factor"]) for x in sub); BE[i, di] = sum(0.55 / float(x["factor"]) for x in sub)
        if di % 50 == 0:
            log(f"selector matrix: slate {di + 1} / {len(horder)}")
    return sels, H, N, F, BE


def sel_name(s):
    if s[0] == "rank":
        _, c, rk, cut = s
        return f"{c[0]} {c[1]} {c[2]} by {rk} {'top ' + str(cut[1]) if cut[0] == 'n' else 'top ' + str(cut[1]) + '%'}"
    _, c, fb, n = s
    return f"{c[0]} {c[1]} {c[2]} final_hp top {n} + [{fb}]"


class Mat:
    def __init__(self, H, N, F, BE):
        self.H, self.N, self.F, self.BE = H, N, F, BE

    def stats(self, M):
        h, n, f, be = self.H @ M, self.N @ M, self.F @ M, self.BE @ M
        d = (self.N > 0).astype(np.float32) @ M
        with np.errstate(invalid="ignore", divide="ignore"):
            hit = h / n
            mar = (h - be) / n                               # mean per leg of (hit - 0.55 / its own m)
            lb = mar - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
            pm = (f / n) * hit
        return n, d, hit, mar, lb, pm


def walk_forward(mat, days_ix, gsel):
    """own TOPK chosen on the profile's earlier slates (lower-bound margin, >= 30 legs and >= 8 slates) vs the TOPK chosen on all
    earlier slates (gsel[t]); realized per-leg margin on each played slate"""
    S = mat.H.shape[0]
    h = np.zeros(S, np.float32); n = np.zeros(S, np.float32); be = np.zeros(S, np.float32); d = np.zeros(S, np.float32)
    own, glob = [], []
    for j, t in enumerate(days_ix):
        if j >= WARM and gsel[t] is not None:
            with np.errstate(invalid="ignore", divide="ignore"):
                hit = h / n
                lb = (h - be) / n - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
            lb = np.where((n >= 30) & (d >= 8), lb, -np.inf)
            top = np.argpartition(-lb, TOPK)[:TOPK]
            for sel, out in ((top, own), (gsel[t], glob)):
                nn = mat.N[sel, t].sum()
                if nn:
                    out.append(float((mat.H[sel, t].sum() - mat.BE[sel, t].sum()) / nn))
                else:
                    out.append(np.nan)
        h += mat.H[:, t]; n += mat.N[:, t]; be += mat.BE[:, t]; d += (mat.N[:, t] > 0)
    o, g = np.array(own), np.array(glob)
    ok = ~np.isnan(o) & ~np.isnan(g)
    return o[ok], g[ok]


def global_selection(mat):
    S, D = mat.H.shape
    h = np.zeros(S, np.float32); n = np.zeros(S, np.float32); be = np.zeros(S, np.float32); d = np.zeros(S, np.float32)
    gsel = [None] * D
    for t in range(D):
        if t >= WARM:
            with np.errstate(invalid="ignore", divide="ignore"):
                hit = h / n
                lb = (h - be) / n - np.sqrt(np.maximum(hit * (1 - hit), 0.01) / np.maximum(n, 1))
            lb = np.where((n >= 30) & (d >= 8), lb, -np.inf)
            gsel[t] = np.argpartition(-lb, TOPK)[:TOPK]
        h += mat.H[:, t]; n += mat.N[:, t]; be += mat.BE[:, t]; d += (mat.N[:, t] > 0)
    return gsel


def lookalike_profiles(reg, order, seas, P_all):
    """for each 2026-27 slate: its K nearest historical slates on the ALL family (trailing percentiles); plus their union"""
    cur = [i for i, k in enumerate(order) if k[0] not in HIST]
    hist = np.array([k[0] in HIST for k in order])
    out = []
    union = np.zeros(len(order), bool)
    for i in cur:
        x = P_all[i]
        ok = hist & ~np.isnan(P_all).any(axis=1)
        if np.isnan(x).any():
            g = ~np.isnan(x)
            dist = np.sqrt(np.nanmean((P_all[:, g] - x[g]) ** 2, axis=1))
        else:
            dist = np.sqrt(np.mean((P_all - x) ** 2, axis=1))
        dist = np.where(ok, dist, np.inf)
        nn = np.argsort(dist)[:K_LIKE]
        m = np.zeros(len(order), bool); m[nn] = True
        union |= m
        out.append({"name": f"LIKE {order[i][1]} (its {K_LIKE} nearest historical slates)", "mask": m, "tech": "look-alike"})
    if cur:
        out.append({"name": f"LIKE THIS SEASON (union of the {len(cur)} look-alike sets)", "mask": union, "tech": "look-alike"})
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    reg, days, order, seas = L1.build(conn)
    log(f"Layer 1: {len(reg.items)} profiles ({sum('ONE-SEASON' in it['info'] for it in reg.items)} one-season)")
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    hseas = seas[hist_ix]
    # look-alike profiles of this season's boards (ALL family, trailing percentiles - rebuilt here exactly as Layer 1 does)
    F_ = L1.slate_features(conn, days, order)
    cols = sorted({c for f in F_.values() for c in f})
    _, Pp = L1.trailing_pct(F_, order, cols)
    fam = L1.families(cols)
    Pall = Pp[:, [cols.index(c) for c in fam["ALL"]]]
    profiles = [{"name": it["name"], "mask": it["mask"], "tech": it["tech"]} for it in reg.items] + lookalike_profiles(reg, order, seas, Pall)
    L3.attach_ranks(conn, days)
    leg_features(conn, days, horder)
    sels, H, N, F, BE = selector_matrix(days, horder)
    log(f"selectors: {len(sels):,} ({sum(s[0] == 'rank' for s in sels):,} rank x cut, {sum(s[0] == 'factor' for s in sels):,} with a factor)")
    mat = Mat(H, N, F, BE)
    allm = {s: (hseas == s).astype(np.float32)[:, None] for s in HIST}
    allp = np.ones((len(hseas), 1), np.float32)
    n_a, d_a, hit_a, mar_a, lb_a, pm_a = mat.stats(allp)
    print("\n" + "=" * 190 + "\nALL SLATES - best 25 selectors by lower-bound margin (pooled; >= 100 legs, >= 30 slates)")
    ok = (n_a[:, 0] >= 100) & (d_a[:, 0] >= 30)
    for i in np.argsort(-np.where(ok, lb_a[:, 0], -np.inf))[:25]:
        print(f"  {sel_name(sels[i]):<80} legs {int(n_a[i, 0]):>6} slates {int(d_a[i, 0]):>3} hit {hit_a[i, 0]:.3f} p.m {pm_a[i, 0]:.3f} margin "
              f"{100 * mar_a[i, 0]:+.1f} (lb {100 * lb_a[i, 0]:+.1f})")
    gsel = global_selection(mat)
    rows, cache = [], {}
    D = len(hseas)
    print("\n" + "=" * 190 + "\nCATALOGUE - per profile, best 5 selectors on its slates (any season; >= 40 legs, >= 10 slates) | margin per leg in pts | "
          "same selector on ALL slates")
    for pi, it in enumerate(profiles, 1):
        mask = it["mask"][hist_ix]
        if mask.sum() < 20:
            continue
        mp = mask.astype(np.float32)[:, None]
        n_, d_, hit_, mar_, lb_, pm_ = mat.stats(mp)
        ok = (n_[:, 0] >= 40) & (d_[:, 0] >= 10)
        best = np.argsort(-np.where(ok, lb_[:, 0], -np.inf))[:5]
        sn = {s: int((mask & (hseas == s)).sum()) for s in HIST}
        print(f"  P{pi:03d} {it['name']} ({sn[HIST[0]]} / {sn[HIST[1]]} slates): " + " || ".join(
            f"{sel_name(sels[i])}: {100 * mar_[i, 0]:+.1f} on {int(n_[i, 0])} legs ({int(d_[i, 0])}d), all {100 * mar_a[i, 0]:+.1f}" for i in best
            if ok[i]))
        dix = np.where(mask)[0]
        own, glob = walk_forward(mat, dix, gsel)
        if len(own) < 10:
            continue
        obs = float(np.mean(own - glob))
        if len(dix) not in cache:
            vals = []
            for _ in range(NULLN):
                o, g = walk_forward(mat, np.sort(RNG.choice(D, len(dix), replace=False)), gsel)
                if len(o) >= 10:
                    vals.append(float(np.mean(o - g)))
            cache[len(dix)] = np.array(vals)
        nl = cache[len(dix)]
        p = (1 + np.sum(nl >= obs)) / (len(nl) + 1)
        rows.append((pi, it, len(own), float(np.mean(own)), float(np.mean(glob)), obs, p, float(np.median(nl))))
        if pi % 50 == 0:
            log(f"profiles: {pi}")
    okb = L2.bh([r[6] for r in rows], 0.10)
    print("\n" + "=" * 190 + f"\nWALK-FORWARD LEG MARGIN (own {TOPK} selectors chosen on the profile's earlier slates vs {TOPK} chosen on all earlier slates; "
          "realized margin per leg in pts; no season forced)")
    for r, w in zip(rows, okb):
        pi, it, npl, ow, gl, obs, p, med = r
        print(f"  {'*** BEATS GLOBAL (BH q 0.10) *** ' if w else ''}P{pi:03d} {it['name']} ({npl} played) | own {100 * ow:+.1f} vs global "
              f"{100 * gl:+.1f} (diff {100 * obs:+.1f}, p {p:.3f}, random median {100 * med:+.1f})")
    print(f"\nSUMMARY: {int(okb.sum())} of {len(rows)} profiles' own selectors beat the global selectors walk-forward (BH q 0.10); "
          f"{sum(r[5] > 0 for r in rows)} positive; nominal p < 0.05: {sum(r[6] < 0.05 for r in rows)} (~{0.05 * len(rows):.0f} by chance)")
    log("done")


if __name__ == "__main__":
    main()
