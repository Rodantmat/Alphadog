#!/usr/bin/env python3
"""
ROI-AWARE SLIP SWEEP FOR THE OTHER APPS (owner 2026-11-11 18:36 PT: "all 5 apps ... they run on top of the back data of Underdog and PrizePicks ...
more emphasis on the current season because it's real data"). READ-ONLY. SW_APP = sleeper | fliff | betr  (apps are never mixed).
  * legs: each app's window board joined to final_hp at the app's own line. 2026-27 = REAL prices on real boards (graded slates before today);
    2024-25 / 2025-26 = history with the app's price modelled from DraftKings/Bovada (fitted on the real slates, as research_app_sleeper_fliff) -
    Betr's history is its real board (2025-11-23 on, price 1.0 = its tables).
  * leg ROI: hit probability = final_hp calibrated with the PrizePicks back data (gap by side x 20 hp buckets; a history season is calibrated on
    the OTHER PrizePicks season, 2026-27 on both), price layer toward the break-even (kappa .88, weight .4 + .5|ln(be/.56)|, cap .85),
    ROI = p x multiplier - 1 (Betr: break-even .56), floor ROI with the standard error; score_roi = .55 x final score + .45 x profit(ROI).
  * sweep: rank key (final score | score_roi .45 | score_roi .65 | roi | final_hp | random control) x line kind (main | alt | all; Betr R) x ROI filter
    (none | >0 | >5%) x side x props (all | no-defensive) x pool top N (3,5,10,15,20,30) x structure (Sleeper Max 2-6 / Flex 3-6, Fliff product 2-6,
    Betr Perfect 2-6 / Dynamic 2-6). One pick per player and per game, slips = disjoint groups from the top of the pool.
  * read: this season's REAL slates first, then the two history seasons; robust = positive on the real season and on every history season.
"""
import os, sys, math, itertools, collections
import numpy as np, pandas as pd, psycopg

APP = (os.environ.get("SW_APP") or "sleeper").lower()
if APP == "betr":
    os.environ["APP"] = "BETR"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_app_sleeper_fliff as SF               # noqa: E402
import sleeper_live_slip_engine as SL                 # noqa: E402

DEF = {"steals", "blocks", "stocks", "turnovers"}
KS_W, BASE, SLOPE, FS = .45, 60.0, 300.0, .3
MODEL_SD, Z, KAP = .02, 1.28, .88
REAL = "2026-27"
BOARD_SQL = SF.BOARD_SQL.replace("f.final_hp::float\nFROM", "f.final_hp::float, f.score::float\nFROM")
assert BOARD_SQL != SF.BOARD_SQL
BR = None
PR = None


def log(m):
    print(m, flush=True)


# ---------------------------------------------------------------- calibration on the PrizePicks back data
def pp_tables(conn):
    d = pd.read_sql("""SELECT season, side, hit::int hit, hp FROM nba_score._mf_study_fs WHERE kind='standard' AND hp IS NOT NULL AND hit IS NOT NULL""", conn)
    d["over"] = d["side"].str.lower().str[0].isin(["o", "m", "h"]); d["b"] = np.clip(np.floor(d["hp"] * 20), 0, 19).astype(int)
    def tab(x):
        out = {}
        for ov, g in x.groupby("over"):
            n = np.zeros(20); gp = np.zeros(20)
            for b, r in g.groupby("b"):
                n[b] = len(r); gp[b] = (r["hit"] - r["hp"]).sum()
            out[ov] = (n, gp)
        return out
    T = {"all": tab(d)}
    for s in d["season"].unique():
        T[s] = tab(d[d["season"] != s])
    return T


def cal_gap(T, ov, hp):
    n, gp = T[ov]
    x = hp * 20 - .5; i = np.floor(x).astype(int); t = x - i
    i0 = np.clip(i, 0, 19); i1 = np.clip(i + 1, 0, 19)
    g0 = np.where(n[i0] > 0, gp[i0] / np.maximum(n[i0], 1), np.nan); g1 = np.where(n[i1] > 0, gp[i1] / np.maximum(n[i1], 1), np.nan)
    return np.where(np.isnan(g0), np.nan_to_num(g1), np.where(np.isnan(g1), g0, (1 - t) * g0 + t * g1)), (1 - t) * n[i0] + t * n[i1]


def score_day(legs, T):
    """legs: list of dicts with p (final_hp), m, side, prop, score, hit, event_id, player -> DataFrame with roi / score_roi"""
    df = pd.DataFrame(legs)
    if df.empty:
        return df
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"])
    gap = np.zeros(len(df)); n = np.zeros(len(df))
    for ov in (True, False):
        k = (df["over"] == ov).values
        if k.any():
            gap[k], n[k] = cal_gap(T, ov, df.loc[k, "p"].values)
    pc = np.clip(df["p"].values + gap, .005, .995)
    be = np.where(df["m"].values > 0, 1.0 / df["m"].values, 1.0) if APP != "betr" else np.full(len(df), .56)
    w = np.minimum(.85, .4 + .5 * np.abs(np.log(np.maximum(be, 1e-3) / .56)))
    p = np.clip(pc + w * (np.minimum(.99, KAP * be) - pc), .005, .995)
    se = np.sqrt(p * (1 - p) / (n + 30) + MODEL_SD ** 2 * 0.8)
    df["be"] = be; df["roi"] = p / be - 1; df["roi_lo"] = (p - Z * se) / be - 1
    df = df[df["be"] >= .12].copy()
    prof = np.clip(BASE + SLOPE * ((1 - FS) * df["roi"] + FS * df["roi_lo"]), 0, 100)
    sc = df["score"].fillna(df["score"].median() if df["score"].notna().any() else 50).values
    df["score_roi"] = (1 - KS_W) * sc + KS_W * prof; df["score_roi65"] = .35 * sc + .65 * prof
    df["score_cert"] = sc; df["hp"] = df["p"]
    df["defp"] = df["prop"].isin(DEF)
    return df


# ---------------------------------------------------------------- loading
def load_day2(conn, day, books):
    out = collections.defaultdict(dict)
    for bk, pn, pid, mk, side, line, price, mult, ev, p, sc in conn.execute(BOARD_SQL, (day, books, SF.MKALL, day)).fetchall():
        d = SF.dec(price, mult)
        if d is None or d <= 1.0:
            continue
        key = (pid, SF.MK[mk.replace("_alternate", "")], side, line)
        kind = "alt" if mk.endswith("_alternate") else "main"
        cur = out[bk].get(key)
        if cur is None or d < cur["m"]:
            out[bk][key] = {"player": pn, "player_id": pid, "prop": key[1], "side": side, "line": line, "m": d, "kind": kind, "event_id": ev, "p": p, "score": sc}
    return out


def build_sleeper_fliff(conn):
    days = SF.season_days(conn)
    live = [d for d in days if AF.season_of(d) == REAL]; hist = [d for d in days if AF.season_of(d) != REAL]
    log(f"{APP}: history slates {len(hist)}, real slates {len(live)}")
    out = collections.defaultdict(list); pairs = collections.defaultdict(list)
    for d in live:
        st = AF.box(conn, d)
        if not st:
            continue
        b = load_day2(conn, d, [APP, "draftkings", "bovada"]); legs = []
        for key, l in b.get(APP, {}).items():
            if l["p"] is None:
                continue
            l["hit"] = AF.outcome(st, l); legs.append(l)
            bl = b.get("draftkings", {}).get(key) or b.get("bovada", {}).get(key)
            if bl:
                pairs[l["kind"]].append((math.log(1.0 / bl["m"]), math.log(l["m"])))
        if legs:
            out[REAL].append((d, legs))
    fits = {}
    for kd, pr in pairs.items():
        if len(pr) < 30:
            continue
        x = np.array([a for a, _ in pr]); y = np.array([b for _, b in pr]); A_ = np.vstack([np.ones_like(x), x]).T
        coef, *_ = np.linalg.lstsq(A_, y, rcond=None); fits[kd] = (coef[0], coef[1])
        log(f"  price model {kd}: log(app) = {coef[0]:+.3f} {coef[1]:+.3f} x log(book implied), {len(pr)} pairs")
    if "main" not in fits:
        log("no price model - history skipped"); return out
    for i, d in enumerate(hist):
        st = AF.box(conn, d)
        if not st:
            continue
        b = load_day2(conn, d, ["draftkings", "bovada"]); src = dict(b.get("bovada", {})); src.update(b.get("draftkings", {})); legs = []
        for key, l in src.items():
            if l["p"] is None:
                continue
            f = fits.get(l["kind"]) or fits["main"]; l = dict(l); l["m"] = math.exp(f[0] + f[1] * math.log(1.0 / l["m"]))
            if l["m"] <= 1.0:
                continue
            l["hit"] = AF.outcome(st, l); legs.append(l)
        if legs:
            out[AF.season_of(d)].append((d, legs))
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


def build_betr(conn):
    days = AF.slate_days(conn); out = collections.defaultdict(list)
    log(f"betr slates {len(days)}")
    for i, d in enumerate(days):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _ = AF.load_betr(conn, d, st)
        for l in legs:
            l["kind"] = "main"; l["m"] = 1.0
        if legs:
            out[AF.season_of(d)].append((d, legs))
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


# ---------------------------------------------------------------- sweep
KINDS = {"main": {"main"}, "alt": {"alt"}, "all": {"main", "alt"}} if APP != "betr" else {"all": {"main"}}
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
    return list(zip(d["player"].values, d["event_id"].values, d["hit"].values, d["m"].values, d["side"].values))


def groups(legs, N, k):
    legs = legs[:N]
    if len(legs) < k:
        return []
    out = []; used = set()
    for _ in range(max(1, N // k)):
        pick = []; pl = set(); ev = set()
        for i, l in enumerate(legs):
            if i in used or l[0] in pl or l[1] in ev:
                continue
            pick.append(i); pl.add(l[0]); ev.add(l[1])
            if len(pick) == k:
                break
        if len(pick) < k:
            break
        used.update(pick); out.append([legs[i] for i in pick])
    return out


def pay(slip, mode):
    live = [l for l in slip if l[2] is not None and l[2] == l[2]]
    n = len(live)
    if n < 2:
        return 1.0
    hits = sum(1 for l in live if l[2])
    if APP == "betr":
        allless = all(str(l[4]).lower().startswith("u") for l in live)
        if mode == "perfect":
            return float(BR["perfect_all_less" if allless else "perfect_regular"][str(n)]) if hits == n else 0.0
        return float(BR["dynamic_all_less" if allless else "dynamic_regular"][str(n)].get(str(hits), 0.0))
    ms = [float(l[3]) for l in live]
    if APP == "fliff" or mode == "max" or n == 2:
        if hits < n:
            return 0.0
        return math.floor(math.prod(ms) * 100 + 1e-6) / 100   # Sleeper's size bonus stays unpriced (conservative), as the live engine
    return float(SL.flex_tiers(ms, PR[1], PR[2]).get(hits, 0.0))


def run(daytops, N, k, mode):
    rows = []
    for d, legs in daytops:
        for s in groups(legs, N, k):
            p = pay(s, mode)
            rows.append((d, p - 1.0, 1 if p > 0 else 0))
    return rows


def stats(rows, nd):
    if not rows:
        return None
    n = len(rows); by = collections.defaultdict(float)
    for d, r, w in rows:
        by[d] += r
    ds = sorted(by); cum = np.cumsum([by[d] for d in ds]); pk = np.maximum.accumulate(np.concatenate([[0], cum]))[1:]
    return dict(n=n, per_day=n / max(1, nd), roi=sum(r for _, r, _ in rows) / n, win=sum(w for *_, w in rows) / n, dd=float((pk - cum).max()))


def main():
    global BR, PR
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    if APP == "betr":
        BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
        BR = BR if isinstance(BR, dict) else __import__("json").loads(BR)
    else:
        PR = SL.pricing(conn)
    T = pp_tables(conn)
    raw = build_betr(conn) if APP == "betr" else build_sleeper_fliff(conn)
    conn.close()
    seasons = [s for s in ("2024-25", "2025-26", REAL) if raw.get(s)]
    days = {}
    for s in seasons:
        Ts = T[s] if s in T else T["all"]
        dd = []
        for d, legs in raw[s]:
            df = score_day(legs, Ts)
            if len(df):
                df = df.copy(); df["rand"] = np.random.RandomState(d.toordinal()).rand(len(df)); dd.append((d, df))
        days[s] = dd
        al = pd.concat([x for _, x in dd]) if dd else pd.DataFrame()
        if len(al):
            g = al[al["hit"].notna()]
            real = g["hit"] / g["be"] - 1
            dec = pd.qcut(g["score_roi"].rank(method="first"), 10, labels=False); dec0 = pd.qcut(g["score_cert"].rank(method="first"), 10, labels=False)
            log(f"\n== {APP} {s}: {len(dd)} slates, {len(al)} legs ({len(g)} graded). leg ROI by score decile (final score | roi-aware): "
                + " ".join(f"d{q+1}:{real[dec0==q].mean():+.3f}|{real[dec==q].mean():+.3f}" for q in range(10)))
    modes = ("perfect", "dynamic") if APP == "betr" else (("max", "flex") if APP == "sleeper" else ("max",))
    Ns = [3, 5, 10, 15, 20, 30]
    structs = [(N, k, m) for N in Ns for k in range(2, 7) for m in modes if k <= N and not (m in ("flex",) and k < 3)]
    combos = list(itertools.product(KEYS, KINDS, ROIMIN, SIDES, PROPS))
    res = []
    for s in seasons:
        for ci, (key, kinds, roimin, side, nodef) in enumerate(combos):
            dt = [(d, tops(g, key, kinds, roimin, side, nodef)) for d, g in days[s]]
            for N, k, m in structs:
                st = stats(run(dt, N, k, m), len(dt))
                if st:
                    res.append(dict(season=s, key=key, kinds=kinds, roi_f=roimin, side=side, props=nodef, N=N, k=k, mode=m, **st))
            if ci % 60 == 0:
                log(f"  {s} {ci}/{len(combos)} {len(res)}")
    R = pd.DataFrame(res)
    idx = ["key", "kinds", "roi_f", "side", "props", "N", "k", "mode"]
    M = None
    for s in seasons:
        x = R[R.season == s].drop(columns="season").rename(columns={c: f"{c}_{s[-2:]}" for c in ["n", "per_day", "roi", "win", "dd"]})
        M = x if M is None else M.merge(x, on=idx, how="outer")
    r_, h_ = REAL[-2:], [s[-2:] for s in seasons if s != REAL]
    minreal = 20; minhist = 100
    M = M[M[f"n_{r_}"].fillna(0) >= minreal].copy()
    for h in h_:
        M = M[M[f"n_{h}"].fillna(0) >= minhist]
    hist_roi = M[[f"roi_{h}" for h in h_]].min(axis=1) if h_ else pd.Series(0, index=M.index)
    M["worst_hist"] = hist_roi; M["worst"] = M[[f"roi_{r_}"] + [f"roi_{h}" for h in h_]].min(axis=1)
    pd.set_option("display.width", 280); pd.set_option("display.max_rows", 600); pd.set_option("display.max_columns", 60)
    ctl = M[M.key == "rand"]; real = M[M.key != "rand"]
    log(f"\n##### {APP}: CONTROL (random order) vs real keys - configs with >= {minreal} real-season slips and >= {minhist} per history season")
    for nm, g in (("random", ctl), ("real keys", real)):
        log(f"  {nm}: configs={len(g)}  positive on all seasons={(g.worst>0).mean():.3f}  mean ROI real {g[f'roi_{r_}'].mean():+.3f}  hist " + " ".join(f"{h}={g[f'roi_{h}'].mean():+.3f}" for h in h_))
    for nm in KEYS:
        g = M[M.key == nm]
        log(f"  key {nm:12s}: mean ROI real {g[f'roi_{r_}'].mean():+.3f}  hist " + " ".join(f"{h}={g[f'roi_{h}'].mean():+.3f}" for h in h_) + f"   positive all seasons {(g.worst>0).mean():.3f}")
    log("\n##### factor effects (mean ROI, real keys)")
    for f in ["kinds", "roi_f", "side", "props", "N", "k", "mode"]:
        log(f"-- {f}\n" + real.groupby(f)[[c for c in real.columns if c.startswith("roi_")]].mean().round(3).to_string())
    cols = idx + [f"{a}_{s[-2:]}" for s in seasons[::-1] for a in ("n", "win", "roi")] + [f"dd_{r_}", f"per_day_{r_}"]
    log("\n##### top 40 by worst season ROI (real season first), real keys")
    log(real.sort_values("worst", ascending=False).head(40)[cols].round(3).to_string(index=False))
    log("\n##### best 3 per structure by worst season ROI")
    for (k, m), g in real.groupby(["k", "mode"]):
        log(g.sort_values("worst", ascending=False).head(3)[cols].round(3).to_string(index=False, header=False))
    log("\n##### final score vs roi-aware score, same layers (kinds=all, no filter, both sides, all props): ROI by structure")
    b = M[(M.kinds == "all") & (M.roi_f == "none") & (M.side == "both") & (M.props == "all") & (M.key.isin(["score_cert", "score_roi", "hp", "roi"]))]
    if len(b):
        log(b.pivot_table(index=["mode", "k", "N"], columns="key", values=[f"roi_{r_}"] + [f"roi_{h}" for h in h_]).round(3).to_string())
    short = real.sort_values("worst", ascending=False).head(12)
    log("\n##### bootstrap of the shortlist on the REAL season (resample slates, 2000x)")
    rng = np.random.RandomState(3)
    for _, r in short.iterrows():
        dt = [(d, tops(g, r.key, r.kinds, r.roi_f, r.side, r.props)) for d, g in days[REAL]]
        rows = run(dt, int(r.N), int(r.k), r["mode"]); ds = sorted({d for d, _ in dt}); td = collections.defaultdict(float); nd = collections.defaultdict(int)
        for d, rr, w in rows:
            td[d] += rr; nd[d] += 1
        tot = np.array([td.get(d, 0.0) for d in ds]); nn = np.array([nd.get(d, 0) for d in ds]); samp = rng.randint(0, len(ds), (2000, len(ds)))
        roi = tot[samp].sum(1) / np.maximum(nn[samp].sum(1), 1)
        log(f"  {r.key}|{r.kinds}|{r.roi_f}|{r.side}|{r.props}|N{int(r.N)}|{int(r.k)}-{r['mode']}  real ROI {tot.sum()/max(nn.sum(),1):+.3f} CI90[{np.percentile(roi,5):+.3f},{np.percentile(roi,95):+.3f}] P>0={(roi>0).mean():.2f} ({int(nn.sum())} slips)")


if __name__ == "__main__":
    main()
