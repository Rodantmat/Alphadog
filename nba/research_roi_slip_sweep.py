#!/usr/bin/env python3
"""
ROI-AWARE SLIP SWEEP (owner 2026-11-11 18:29 PT) - READ-ONLY. APP=pp | ud (one app per run, legs of different apps are never mixed).
Both past seasons (2024-25, 2025-26), each season scored with the calibration trained on the OTHER season (no leakage).
Per app it sweeps compositions x layers x factors, builds slips from the top of each day's board, prices them with the app's own payout rules:
  rank key   : score_cert (today) | score_roi (w .45, the board score) | score_roi65 (w .65) | roi | hp | rand (control: random order)
  leg kinds  : std | std+low (goblin / discounted) | std+high (demon / boosted) | all
  ROI filter : none | roi>0 | roi>5%
  side       : both | over | under
  props      : all | no-defensive (steals / blocks / stocks / turnovers)
  pool       : top N legs of the day (3,5,10,15,20,30), slips = disjoint groups from the top, one player per slip (Underdog: one pick per game)
  structure  : Power/Standard and Flex, 2..6 picks
Reports ROI per $1 slip, win rate, slips/day, drawdown, per-half stability; compares with the random control; bootstraps the shortlist.
"""
import os, sys, math, itertools, collections, random
import numpy as np, pandas as pd, psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE

APP = (os.environ.get("APP") or "pp").lower()
KAPPA = {"standard": .89, "goblin": .85, "demon": .76}
PW = {"standard": .2, "goblin": .6, "demon": .6}
KS = [0, 300, 200]
BASE, SLOPE, FS = 60.0, 300.0, .3
MODEL_SD, Z = .02, 1.28
DEF = {"steals", "blocks", "stocks", "turnovers"}
UD_STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}


def norm(s):
    return "".join(c for c in str(s).lower() if c.isalpha())


def klass(f):
    return "goblin" if f < .97 else ("demon" if f > 1.03 else "standard")


def load(conn):
    if APP == "pp":
        df = pd.read_sql("""SELECT season, game_date, player, prop, side, line::float8 AS line, kind, tier, factor, hit::int hit, hp, conf, score_cert
                            FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL AND score_cert IS NOT NULL AND factor > 0""", conn)
        ev = pd.read_sql("""SELECT DISTINCT ON (game_date, player, prop, side, line) game_date, player, prop, side, line::float8 AS line, event_id, price_source
                            FROM nba_market.prop_universe WHERE line_source='real' AND game_date >= '2024-10-01'
                            ORDER BY game_date, player, prop, side, line""", conn)
        df = df.merge(ev, on=["game_date", "player", "prop", "side", "line"], how="left")
        df["event_id"] = df["event_id"].astype(object)
        print("price_source share:", df.groupby(["season", "kind"])["price_source"].apply(lambda x: round((x == "exact").mean(), 3)).to_dict(), flush=True)
        if os.environ.get("PP_EXACT") == "1":
            df = df[df["price_source"] == "exact"].copy()
            print("PP_EXACT: kept", len(df), "exactly-priced legs", flush=True)
    else:
        L = pd.read_sql("""SELECT DISTINCT ON (game_date, player, prop, side, line) season, game_date, player, player_id, prop, side, line::float8 AS line,
                                  tier, factor, hit::int hit FROM nba_score.ud_tier_map_legs
                           WHERE rank_key='final_score' AND hit IS NOT NULL AND factor > 0
                           ORDER BY game_date, player, prop, side, line""", conn)
        B = pd.read_sql("""SELECT DISTINCT ON (game_date, player, prop, side, line) game_date, player, prop, side, line::float8 AS line, final_hp AS hp,
                                  confidence AS conf, score AS score_cert FROM nba_score.board_scored WHERE app='underdog' AND final_hp IS NOT NULL
                           ORDER BY game_date, player, prop, side, line""", conn)
        E = pd.read_sql("""SELECT DISTINCT ON (game_date, player_id) game_date, player_id, event_id FROM nba_score.ud_window_legs ORDER BY game_date, player_id""", conn)
        L["pn"] = L["player"].map(norm); B["pn"] = B["player"].map(norm)
        df = L.merge(B.drop(columns=["player"]), on=["game_date", "pn", "prop", "side", "line"], how="inner")
        df = df.merge(E, on=["game_date", "player_id"], how="left")
        df["kind"] = df["factor"].map(klass)
        df["conf"] = df["conf"].fillna(.5)
        df = df.dropna(subset=["hp", "score_cert"])
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
        be = 0.56 / sub["factor"].values
        p = np.clip(pc + PW[kind] * (np.minimum(.99, KAPPA[kind] * be) - pc), .005, .995)
        conf = np.clip(sub["conf"].values.astype(float), 0, 1)
        se = np.sqrt(p * (1 - p) / (n + 30) + MODEL_SD ** 2 * (1.3 - conf))
        te.loc[sub.index, "roi"] = p / be - 1; te.loc[sub.index, "roi_lo"] = (p - Z * se) / be - 1
    prof = np.clip(BASE + SLOPE * ((1 - FS) * te["roi"] + FS * te["roi_lo"]), 0, 100)
    te["score_roi"] = .55 * te["score_cert"] + .45 * prof
    te["score_roi65"] = .35 * te["score_cert"] + .65 * prof
    te["rand"] = np.random.RandomState(7).rand(len(te))
    te["be"] = 0.56 / te["factor"]
    te["defp"] = te["prop"].isin(DEF)
    return te[te["be"] >= .12].copy()


KINDS = {"std": {"standard"}, "std+low": {"standard", "goblin"}, "std+high": {"standard", "demon"}, "all": {"standard", "goblin", "demon"}}
ROIMIN = {"none": None, "pos": 0.0, "5pct": .05}
SIDES = {"both": None, "over": True, "under": False}
PROPS = {"all": False, "nodef": True}
KEYS = ["score_cert", "score_roi", "score_roi65", "roi", "hp", "rand"]


def tops(day, key, kinds, roimin, side, nodef):
    d = day[day["kind"].isin(KINDS[kinds])]
    if ROIMIN[roimin] is not None:
        d = d[d["roi"] > ROIMIN[roimin]]
    if SIDES[side] is not None:
        d = d[d["over"] == SIDES[side]]
    if PROPS[nodef]:
        d = d[~d["defp"]]
    d = d.sort_values(key, ascending=False).head(30)
    return list(zip(d["player"].values, d["event_id"].values, d["hit"].values, d["factor"].values))


def groups(legs, N, k):
    legs = legs[:N]
    if len(legs) < k:
        return []
    out = []; used = set()
    for _ in range(max(1, N // k)):
        pick = []; pl = set(); ev = set()
        for i, (p, e, h, f) in enumerate(legs):
            if i in used or p in pl:
                continue
            if APP == "ud" and e is not None and e == e and e in ev:
                continue
            pick.append(i); pl.add(p)
            if e is not None and e == e:
                ev.add(e)
            if len(pick) == k:
                break
        if len(pick) < k:
            break
        used.update(pick); out.append([legs[i] for i in pick])
    return out


_PC = {}


def pay(slip, mode):
    k = len(slip); hits = sum(l[2] for l in slip)
    fp = 1.0; fh = 1.0
    for l in slip:
        fp *= l[3]
        if l[2]:
            fh *= l[3]
    if APP == "ud":
        if mode == "power":
            return math.floor(UD_STD[k] * fp * 100 + 1e-6) / 100 if hits == k else 0.0
        b = UD_FLEX.get((k, k - hits), 0.0)
        return math.floor(b * fh * 100 + 1e-6) / 100 if b else 0.0
    alt = any(abs(l[3] - 1) > 1e-9 for l in slip)
    ev = [l[1] for l in slip]
    same = k in (2, 3) and all(e is not None and e == e for e in ev) and len(set(ev)) == 1
    key = (k, hits, mode, round(fp, 4), alt, same)
    v = _PC.get(key)
    if v is None:
        v = _PC[key] = SE.pp_payout(k, hits, mode, fp, alt, same)
    return v


def run(daytops, N, k, mode):
    rows = []
    for d, legs in daytops:
        for s in groups(legs, N, k):
            p = pay(s, mode)
            rows.append((d, p - 1.0, 1 if p > 0 else 0))
    return rows


def stats(rows, ndays):
    if not rows:
        return None
    n = len(rows); by = collections.defaultdict(float); cnt = collections.Counter()
    for d, r, w in rows:
        by[d] += r; cnt[d] += 1
    ds = sorted(by); cum = np.cumsum([by[d] for d in ds]); pk = np.maximum.accumulate(np.concatenate([[0], cum]))[1:]
    half = len(ds) // 2
    a = sum(by[d] for d in ds[:half]); b = sum(by[d] for d in ds[half:])
    na = sum(cnt[d] for d in ds[:half]); nb = n - na
    return dict(n=n, per_day=n / max(1, ndays), roi=sum(r for _, r, _ in rows) / n, win=sum(w for *_, w in rows) / n,
                dd=float((pk - cum).max()), h1=a / max(1, na), h2=b / max(1, nb), by=dict(by))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    if APP == "pp":
        SE.flex_alt_tiers(); SE.payout_v3_rules()
    df = load(conn); conn.close()
    seasons = sorted(df["season"].unique())
    print(f"APP={APP} legs={len(df)} seasons={seasons} kinds={df.groupby(['season','kind']).size().to_dict()}", flush=True)
    days = {}
    for s in seasons:
        T = build_tables(df[df["season"] != s]); te = score_season(df[df["season"] == s].copy().reset_index(drop=True), T)
        te["real_roi"] = te["hit"] / te["be"] - 1
        te["dec"] = pd.qcut(te["score_roi"].rank(method="first"), 10, labels=False); te["dec0"] = pd.qcut(te["score_cert"].rank(method="first"), 10, labels=False)
        print(f"\n== {s}: {len(te)} legs, {te['game_date'].nunique()} days. leg-level realized ROI by score decile (cert | roi-aware):", flush=True)
        print("  " + " ".join(f"d{q+1}:{te[te.dec0==q].real_roi.mean():+.3f}|{te[te.dec==q].real_roi.mean():+.3f}" for q in range(10)), flush=True)
        days[s] = [(d, g) for d, g in te.groupby("game_date")]
    Ns = [3, 5, 10, 15, 20, 30]
    structs = [(N, k, m) for N in Ns for k in range(2, 7) for m in ("power", "flex") if k <= N and not (m == "flex" and k < 3)]
    res = []
    combos = list(itertools.product(KEYS, KINDS, ROIMIN, SIDES, PROPS))
    for s in seasons:
        for ci, (key, kinds, roimin, side, nodef) in enumerate(combos):
            dt = [(d, tops(g, key, kinds, roimin, side, nodef)) for d, g in days[s]]
            for N, k, m in structs:
                st = stats(run(dt, N, k, m), len(dt))
                if st:
                    st.pop("by"); res.append(dict(season=s, key=key, kinds=kinds, roi_f=roimin, side=side, props=nodef, N=N, k=k, mode=m, **st))
            if ci % 40 == 0:
                print("  ", s, ci, "/", len(combos), len(res), flush=True)
    R = pd.DataFrame(res)
    S = R[R.season == seasons[0]]; Q = R[R.season == seasons[-1]]
    idx = ["key", "kinds", "roi_f", "side", "props", "N", "k", "mode"]
    M = S.merge(Q, on=idx, suffixes=("_a", "_b"))
    M = M[(M.n_a >= 150) & (M.n_b >= 150)].copy()
    M["worst_half"] = M[["h1_a", "h2_a", "h1_b", "h2_b"]].min(axis=1)
    M["worst"] = M[["roi_a", "roi_b"]].min(axis=1)
    pd.set_option("display.width", 260); pd.set_option("display.max_rows", 600); pd.set_option("display.max_columns", 40)
    ctl = M[M.key == "rand"]; real = M[M.key != "rand"]
    print(f"\n##### CONTROL (random ranking) vs real, configs with >=150 slips in both seasons")
    for nm, g in (("random", ctl), ("real keys", real)):
        print(f"  {nm}: configs={len(g)}  positive both seasons={(g.worst>0).mean():.3f}  all 4 halves positive={(g.worst_half>0).mean():.3f}  mean ROI {seasons[0]}={g.roi_a.mean():+.3f} {seasons[-1]}={g.roi_b.mean():+.3f}", flush=True)
    for nm in KEYS:
        g = M[M.key == nm]
        print(f"  key {nm:12s}: mean ROI {seasons[0]} {g.roi_a.mean():+.3f} / {seasons[-1]} {g.roi_b.mean():+.3f}   positive both {(g.worst>0).mean():.3f}   median ROI {g.roi_a.median():+.3f}/{g.roi_b.median():+.3f}", flush=True)
    print("\n##### factor effects (mean ROI over qualifying configs, both seasons)")
    for f in ["kinds", "roi_f", "side", "props", "N", "k", "mode"]:
        g = real.groupby(f)[["roi_a", "roi_b", "win_a", "win_b"]].mean().round(3)
        print(f"-- {f}\n{g.to_string()}", flush=True)
    cols = ["key", "kinds", "roi_f", "side", "props", "N", "k", "mode", "n_a", "n_b", "per_day_b", "win_a", "win_b", "roi_a", "roi_b", "h1_a", "h2_a", "h1_b", "h2_b", "dd_a", "dd_b"]
    print("\n##### top 40: positive in all 4 half-seasons, by worst season ROI (real keys)")
    print(real[real.worst_half > 0].sort_values("worst", ascending=False).head(40)[cols].round(3).to_string(index=False), flush=True)
    print("\n##### best per structure (all 4 halves positive, else best by worst season), real keys")
    for (k, m), g in real.groupby(["k", "mode"]):
        gg = g[g.worst_half > 0]
        gg = gg if len(gg) else g
        print(gg.sort_values("worst", ascending=False).head(3)[cols].round(3).to_string(index=False, header=(k == 2 and m == "flex")), flush=True)
    print("\n##### today's score vs new score, same layers (std legs, no ROI filter, both sides, all props): ROI by structure", flush=True)
    base = M[(M.kinds == "std") & (M.roi_f == "none") & (M.side == "both") & (M.props == "all") & (M.key.isin(["score_cert", "score_roi", "hp", "roi"]))]
    print(base.pivot_table(index=["mode", "k", "N"], columns="key", values=["roi_a", "roi_b"]).round(3).to_string(), flush=True)
    short = real[real.worst_half > 0].sort_values("worst", ascending=False).head(15)
    print("\n##### bootstrap of the shortlist (resample days, 2000x): P(ROI>0) per season", flush=True)
    rng = np.random.RandomState(3)
    for _, r in short.iterrows():
        out = []
        for s in seasons:
            dt = [(d, tops(g, r.key, r.kinds, r.roi_f, r.side, r.props)) for d, g in days[s]]
            rows = run(dt, int(r.N), int(r.k), r["mode"])
            ds = sorted({d for d, _ in dt}); tot_d = collections.defaultdict(float); n_d = collections.defaultdict(int)
            for d, rr, w in rows:
                tot_d[d] += rr; n_d[d] += 1
            tot = np.array([tot_d.get(d, 0.0) for d in ds]); nn = np.array([n_d.get(d, 0) for d in ds])
            samp = rng.randint(0, len(ds), (2000, len(ds)))
            roi = tot[samp].sum(1) / np.maximum(nn[samp].sum(1), 1)
            out.append(f"{s}: ROI {tot.sum()/max(nn.sum(),1):+.3f} CI90[{np.percentile(roi,5):+.3f},{np.percentile(roi,95):+.3f}] P>0={(roi>0).mean():.2f}")
        print(f"  {r.key}|{r.kinds}|{r.roi_f}|{r.side}|{r.props}|N{int(r.N)}|{int(r.k)}-{r['mode']}  " + "  ".join(out), flush=True)


if __name__ == "__main__":
    main()
