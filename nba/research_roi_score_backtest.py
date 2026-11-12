#!/usr/bin/env python3
"""
ROI-AWARE SCORE BACKTEST (owner 2026-11-11 18:24 PT). READ-ONLY.

Rebuilds, for every PrizePicks board of a season (nba_score._mf_study_fs: every priced leg, model hit probability, certified score, result),
the same ROI-aware score the boards now show (nba/main_ui/roi.js: calibrated hit rate by kind x tier, price layer, ROI, floor, score_roi),
the calibration trained on the OTHER season only (no leakage), then builds slips from the TOP of each day's board and prices them with the
engine's own PrizePicks payout rules (build_slip_engine.pp_payout):
  structures: Power / Flex, 2..6 picks
  pool of the day's board: top 2 / 3 / 5 / 10 / 15 / 20 / 30 legs, slips = consecutive disjoint groups from the top (one player per slip)
  rank keys: score_cert (today's score), score_roi (new), roi, hp
  eligible legs: std (regular lines only) | all (regular + goblins + demons) ; pool: all legs | only ROI > 0 legs
Reports the final numbers: slips, per-slip win rate, ROI, per-half stability, drawdown, and the same config in the other season.
"""
import os, sys, math, itertools, collections
import numpy as np, pandas as pd, psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE

KAPPA = {"standard": .89, "goblin": .85, "demon": .76}
PW = {"standard": .2, "goblin": .6, "demon": .6}
KS = [0, 300, 200]
W_SCORE, BASE, SLOPE, FS = .45, 60.0, 300.0, .3
MODEL_SD, Z = .02, 1.28


def load(conn):
    df = pd.read_sql("""SELECT season, game_date, player, prop, side, line::float8 AS line, kind, tier, factor, hit::int hit, hp, conf, score_cert
                        FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL AND score_cert IS NOT NULL AND factor > 0""", conn)
    ev = pd.read_sql("""SELECT DISTINCT ON (game_date, player, prop, side, line) game_date, player, prop, side, line::float8 AS line, event_id
                        FROM nba_market.prop_universe WHERE line_source='real' AND game_date >= '2024-10-01'
                        ORDER BY game_date, player, prop, side, line""", conn)
    df = df.merge(ev, on=["game_date", "player", "prop", "side", "line"], how="left")
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"])
    df["b"] = np.clip(np.floor(df["hp"] * 20), 0, 19).astype(int)
    return df


def build_tables(tr):
    T = {}
    def add(key, g):
        n = np.zeros(20); gp = np.zeros(20)
        for b, row in g.groupby("b"):
            n[b] = len(row); gp[b] = (row["hit"] - row["hp"]).sum()
        T[key] = (n, gp)
    for side, g in tr.groupby("over"):
        add(("all", side), g)
    for (k, side), g in tr.groupby(["kind", "over"]):
        add((k, side), g)
    for (k, t, side), g in tr.groupby(["kind", "tier", "over"]):
        add((k, t, side), g)
    return T


def gap_at(T, key, hp):
    e = T.get(key)
    if e is None:
        return None, None
    n, gp = e
    x = hp * 20 - .5; i = np.floor(x).astype(int); t = x - i
    i0 = np.clip(i, 0, 19); i1 = np.clip(i + 1, 0, 19)
    n0, n1 = n[i0], n[i1]
    g0 = np.where(n0 > 0, gp[i0] / np.maximum(n0, 1), np.nan); g1 = np.where(n1 > 0, gp[i1] / np.maximum(n1, 1), np.nan)
    gap = np.where(np.isnan(g0), g1, np.where(np.isnan(g1), g0, (1 - t) * g0 + t * g1))
    return gap, (1 - t) * n0 + t * n1


def score_season(te, T):
    for (kind, tier, ov), sub in te.groupby(["kind", "tier", "over"]):
        h = sub["hp"].values
        gg = np.zeros(len(sub)); n = np.zeros(len(sub))
        for lvl, key in enumerate([("all", ov), (kind, ov), (kind, tier, ov)]):
            r, rn = gap_at(T, key, h)
            if r is None:
                continue
            ok = ~np.isnan(r)
            if lvl == 0:
                gg = np.where(ok, r, 0); n = np.where(ok, rn, 0)
            else:
                w = rn / (rn + KS[lvl])
                gg = np.where(ok, gg + (r - gg) * w, gg)
                n = np.where(ok & (rn >= 30), rn, n)
        pc = np.clip(h + gg, .005, .995)
        be = (0.56 / sub["factor"].values)
        kap = KAPPA[kind]; wt = PW[kind]
        p = pc + wt * (np.minimum(.99, kap * be) - pc)
        p = np.clip(p, .005, .995)
        conf = np.clip(sub["conf"].values.astype(float), 0, 1)
        se = np.sqrt(p * (1 - p) / (n + 30) + MODEL_SD ** 2 * (1.3 - conf))
        roi = p / be - 1; roi_lo = (p - Z * se) / be - 1
        te.loc[sub.index, "p_est"] = p; te.loc[sub.index, "roi"] = roi; te.loc[sub.index, "roi_lo"] = roi_lo
    blend = (1 - FS) * te["roi"] + FS * te["roi_lo"]
    prof = np.clip(BASE + SLOPE * blend, 0, 100)
    te["score_roi"] = (1 - W_SCORE) * te["score_cert"] + W_SCORE * prof
    te["be"] = 0.56 / te["factor"]
    te = te[te["be"] >= .12].copy()
    return te


_TOP = {}


def day_slips(day, key, N, k, kindset, pos_only):
    ck = (id(day), key, kindset, pos_only)
    if ck not in _TOP:
        d = day
        if kindset == "std":
            d = d[d["kind"] == "standard"]
        if pos_only:
            d = d[d["roi"] > 0]
        _TOP[ck] = d.sort_values(key, ascending=False).head(30).to_dict("records")
    legs = _TOP[ck][:N]
    if len(legs) < k:
        return []
    out = []; used = set()
    for _ in range(max(1, N // k)):
        pick = []; players = set()
        for i, l in enumerate(legs):
            if i in used or l["player"] in players:
                continue
            pick.append(i); players.add(l["player"])
            if len(pick) == k:
                break
        if len(pick) < k:
            break
        used.update(pick); out.append([legs[i] for i in pick])
        if len(out) * k > len(legs):
            break
    return out


def price(slip, mode):
    k = len(slip)
    hits = sum(l["hit"] for l in slip)
    fprod = 1.0
    for l in slip:
        fprod *= float(l["factor"])
    alt = any(abs(float(l["factor"]) - 1) > 1e-9 for l in slip)
    ev = {l["event_id"] for l in slip if l["event_id"] == l["event_id"] and l["event_id"] is not None}
    same = (k in (2, 3)) and len(ev) == 1 and all(l["event_id"] == l["event_id"] and l["event_id"] is not None for l in slip)
    return SE.pp_payout(k, hits, mode, fprod, alt, same), hits


def run_config(days, key, N, k, mode, kindset, pos_only):
    rows = []
    for d, day in days:
        ss = day_slips(day, key, N, k, kindset, pos_only)
        for s in ss:
            pay, hits = price(s, mode)
            rows.append((d, pay - 1.0, 1 if pay > 0 else 0, hits == k))
    return rows


def stats(rows, ndays):
    if not rows:
        return None
    pr = np.array([r[1] for r in rows]); n = len(pr)
    byday = collections.defaultdict(float)
    for r in rows:
        byday[r[0]] += r[1]
    ds = sorted(byday); cum = np.cumsum([byday[d] for d in ds]); peak = np.maximum.accumulate(np.concatenate([[0], cum]))[1:]
    dd = float((peak - cum).max()) if len(cum) else 0
    half = len(ds) // 2
    first = set(ds[:half])
    a = sum(byday[d] for d in ds[:half]); b = sum(byday[d] for d in ds[half:])
    na = sum(1 for r in rows if r[0] in first); nb = n - na
    return dict(n=n, per_day=n / max(1, ndays), roi=pr.mean(), win=np.mean([r[2] for r in rows]), allhit=np.mean([r[3] for r in rows]), dd=dd,
                profit=pr.sum(), h1=a / max(1, na), h2=b / max(1, nb), days=len(ds))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    df = load(conn); conn.close()
    seasons = sorted(df["season"].unique()); print("seasons", seasons, "legs", len(df), flush=True)
    res = {}
    for te_s in seasons:
        tr = df[df["season"] != te_s]; te = df[df["season"] == te_s].copy().reset_index(drop=True)
        T = build_tables(tr)
        te = score_season(te, T)
        print(f"\n=== TEST SEASON {te_s}: {len(te)} legs, {te['game_date'].nunique()} boards (calibration trained on the other season)", flush=True)
        te["dec"] = pd.qcut(te["score_roi"].rank(method="first"), 10, labels=False); te["dec0"] = pd.qcut(te["score_cert"].rank(method="first"), 10, labels=False)
        te["real_roi"] = te["hit"] / te["be"] - 1
        print("score decile -> realized ROI  (cert | roi-aware):", flush=True)
        for q in range(10):
            print(f"  d{q+1}: cert {te[te.dec0==q]['real_roi'].mean():+.3f} | roi-aware {te[te.dec==q]['real_roi'].mean():+.3f}   (pred {te[te.dec==q]['roi'].mean():+.3f})", flush=True)
        res[te_s] = [(d, g) for d, g in te.groupby("game_date")]
    keys = ["score_cert", "score_roi", "roi", "hp"]
    Ns = [2, 3, 5, 10, 15, 20, 30]; modes = ["power", "flex"]
    out = []
    for te_s in seasons:
        days = res[te_s]
        for key, N, k, mode, kindset, pos in itertools.product(keys, Ns, [2, 3, 4, 5, 6], modes, ["std", "all"], [False, True]):
            if k > N or (mode == "flex" and k < 3):
                continue
            st = stats(run_config(days, key, N, k, mode, kindset, pos), len(days))
            if st:
                out.append(dict(season=te_s, key=key, N=N, k=k, mode=mode, kinds=kindset, pos=pos, **st))
        print("done season", te_s, len(out), flush=True)
    R = pd.DataFrame(out)
    pd.set_option("display.width", 250); pd.set_option("display.max_rows", 500)
    cols = ["season", "key", "N", "k", "mode", "kinds", "pos", "n", "per_day", "win", "roi", "h1", "h2", "dd"]
    for te_s in seasons:
        s = R[(R.season == te_s) & (R.n >= 120)]
        print(f"\n##### {te_s}: best 30 configs by ROI (>=120 slips)")
        print(s.sort_values("roi", ascending=False).head(30)[cols].round(3).to_string(index=False), flush=True)
    P2 = R[R.n >= 120].pivot_table(index=["season", "N", "k", "mode", "kinds", "pos"], columns="key", values="roi").dropna()
    print("\n##### same config, ranked by new score vs today's score (>=120 slips): mean ROI", flush=True)
    print(P2.groupby("season").mean().round(4).to_string(), flush=True)
    print("share of configs where score_roi beats score_cert:", (P2["score_roi"] > P2["score_cert"]).groupby("season").mean().round(3).to_dict(), flush=True)
    M = R[R.n >= 120].pivot_table(index=["key", "N", "k", "mode", "kinds", "pos"], columns="season", values="roi").dropna()
    M["worst"] = M.min(axis=1); M["avg"] = M[seasons].mean(axis=1)
    print("\n##### configs positive in BOTH seasons (>=120 slips each), by worst-season ROI", flush=True)
    print(M[M["worst"] > 0].sort_values("worst", ascending=False).head(40).round(3).to_string(), flush=True)
    for (k, mode), g in M.reset_index().groupby(["k", "mode"]):
        b = g.sort_values("worst", ascending=False).head(1)
        print(f"best {k}-pick {mode}:", b[["key", "N", "kinds", "pos"] + seasons + ["worst"]].round(3).to_string(index=False, header=False), flush=True)
    # every structure, today's score vs new score, best pool per structure (this season)
    cur = seasons[-1]
    print(f"\n##### {cur}: every structure, today's score vs new score, std legs, no ROI filter (N = pool size)")
    S = R[(R.season == cur) & (R.kinds == "std") & (~R.pos) & (R.key.isin(["score_cert", "score_roi"]))]
    print(S.sort_values(["mode", "k", "N", "key"])[["mode", "k", "N", "key", "n", "per_day", "win", "roi", "dd"]].round(3).to_string(index=False), flush=True)


if __name__ == "__main__":
    main()
