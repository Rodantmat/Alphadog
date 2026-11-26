#!/usr/bin/env python3
"""
UNIVERSE 2 - FLEX-ONLY, LAYERED, BALANCED, GRANULAR (owner 2026-11-25 21:06 PT: "try different compositions, different leg composition, players, prop
lines, as well as all different factors, layers, signals, also all the different ranking and trailings, by player, prop line, demon/goblin tiers, high hit
rate, internal numbers (final hp, score, ROI, baseline). All possible combinations of these individual specifics, layered, balanced ... granulated testing,
by number caps for legs, slips, strategies, per apps and totals, fixed number and percentages"). Structures (owner 2026-11-25): 2-pick Power, 2-pick Flex
(PrizePicks only), 3-6 Flex. READ-ONLY on production; writes research scratch tables nba_score.ua2_strats / ua2_days (nothing reads them).

Built on research_universe (same legs, prices, rankers, layers, tiers). New here:
  A1  every tier x side x ranker x layer x games-cap cell (as universe), Flex-only structures; Fliff Flex Entry priced (FlexPlayUtils formula, ESTIMATE).
  A2  LAYERED + BALANCED: the top UA_NL single layers (chosen on 2024-26 only) crossed in pairs; the top UA_NR rankers blended (per-slate percentile
      average of every pair, the top three, all of them) - run over pairs, single layers and none.
  B   composition of the shortlist (chosen on 2024-26; Underdog Flex - priced only since 2026-07 - chosen on 2026-27 before UA_SPLIT and judged after):
      start rank 1-3, every prop different or not, alternates per slip any / at most 1 / none, slips a slate fixed 1-3 or a share of the slate's games
      (15% / 30%), per-season ROI incl. 2026-27 split, cash share, drawdown, drought, without the 5 best. Day results kept for the portfolio pass.
Env: DATABASE_URL, UA_APP, UA_TIERS, UA_NL (12), UA_NR (8), UA_SHORT (260), UA_SPLIT (2026-11-08), UA_PP2FLEX (1), UA_TAG (u2).
"""
import io
import itertools
import math
import os
import sys
import time
from collections import defaultdict

os.environ.setdefault("UA_PP2FLEX", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np                                            # noqa: E402
import pandas as pd                                           # noqa: E402
import psycopg                                                # noqa: E402
import research_universe as U                                 # noqa: E402

APP = U.APP
SEAS = U.SEAS
SPLIT = os.environ.get("UA_SPLIT") or "2026-11-08"
TAG = os.environ.get("UA_TAG") or "u2"
log = U.log


def allowed(st, k):
    return (st == "power" and k == 2) or (st == "flex" and (k >= 3 or (APP == "prizepicks" and k == 2)))


def payouts(k, w, a, sly, slf, slfh, sx, old, slp_bonus):
    pw, fx = U.payouts(k, w, a, sly, slf, slfh, old, slp_bonus)
    if APP == "fliff" and k >= 3:                             # Flex Entry: paid on <= 1 miss, coeff = prod(m) / (1 + sum(m - 1))  (ESTIMATE)
        fx = np.where(w >= k - 1, np.exp(slf) / (1 + sx), 0.0)
    return pw, fx


def stage_a(d, slp_bonus, L, T, R, phase):
    gdi = pd.factorize(d["gd"])[0]; pli = pd.factorize(d["player_id"])[0]; gmi = pd.factorize(d["gid"])[0]
    sidx = d["season"].map({s: i for i, s in enumerate(SEAS)}).values
    old = (d["gd"] < "2026-07-01").values; late = (d["gd"] >= SPLIT).values; cur = (d["season"] == "2026-27").values
    mm1 = np.exp(d["logf"].values) - 1
    rows = []
    for tn, tm in T.items():
        for side in ("Under", "Over", "both"):
            sm = tm & (d["under"].values if side == "Under" else (~d["under"].values if side == "Over" else True))
            for rk in R:
                v = d[rk].values.astype(float)
                base = sm & np.isfinite(v)
                if base.sum() < 500:
                    continue
                ix = np.where(base)[0]
                ix = ix[np.lexsort((-v[ix], gdi[ix]))]
                for ln, lmask in L.items():
                    jj = ix[lmask[ix]]
                    if len(jj) < 200:
                        continue
                    jj = jj[~pd.Series(gdi[jj] * 10_000_000 + pli[jj]).duplicated().values]
                    for gcap in (1, 2, 3, 9):
                        if gcap < 9:
                            gk = pd.Series(gdi[jj] * 10_000_000 + gmi[jj])
                            jg = jj[(gk.groupby(gk.values).cumcount().values < gcap)]
                        else:
                            jg = jj
                        g = gdi[jg]
                        r = pd.Series(g).groupby(g).cumcount().values
                        top = r < 6
                        jg = jg[top]; r = r[top]; g = g[top]
                        if not len(jg):
                            continue
                        st_ = np.r_[0, np.where(np.diff(g) != 0)[0] + 1]

                        def csum(x):
                            c = np.cumsum(x)
                            off = np.repeat(np.r_[0, c[st_[1:] - 1]] if len(st_) > 1 else [0], np.diff(np.r_[st_, len(g)]))
                            return c - off
                        wv = d["w"].values[jg]; av = d["alt"].values[jg].astype(int)
                        cw = csum(wv); ca = csum(av); cy = csum(np.where(av == 1, d["logy"].values[jg], 0.0)); cf = csum(d["logf"].values[jg])
                        cfh = csum(np.where(wv == 1, d["logf"].values[jg], 0.0)); cx = csum(mm1[jg])
                        for k in U.KS:
                            at = r == k - 1
                            if at.sum() < 40:
                                continue
                            sel = jg[at]
                            pw, fx = payouts(k, cw[at], ca[at], cy[at], cf[at], cfh[at], cx[at], old[sel], slp_bonus)
                            for st, pv in (("power", pw), ("flex", fx)):
                                if not allowed(st, k) or (st == "flex" and APP == "prizepicks" and tn != "regular"):
                                    continue
                                okp = np.isfinite(pv)
                                if okp.sum() < 30:
                                    continue
                                u = pv[okp] - 1; s = sidx[sel][okp]; lt = late[sel][okp]; cu = cur[sel][okp]
                                rec = dict(phase=phase, tier=tn, side=side, rk=rk, layer=ln, gcap=gcap, st=st, k=k, n=int(okp.sum()), roi=float(u.mean()))
                                for i, ss in enumerate(SEAS):
                                    m = s == i
                                    rec[f"n{ss[2:4]}"] = int(m.sum()); rec[f"r{ss[2:4]}"] = float(u[m].mean()) if m.any() else np.nan
                                for nm, m in (("26a", cu & ~lt), ("26b", cu & lt)):
                                    rec["n" + nm] = int(m.sum()); rec["r" + nm] = float(u[m].mean()) if m.any() else np.nan
                                rows.append(rec)
            log(f"stage {phase} {tn} {side}: {len(rows):,} cells")
    return pd.DataFrame(rows)


def support(A):
    """the selection score - 2024-26 only (Underdog Flex: 2026-27 before the split)"""
    s = np.minimum(A["r24"], A["r25"]).where((A["n24"] >= 30) & (A["n25"] >= 30))
    udf = (A["st"] == "flex") & A["r24"].isna() & A["r25"].isna()
    s = s.where(~udf, A["r26a"].where(A["n26a"] >= 8))
    return s


def combos(d, A1, L1):
    X = A1[~A1.rk.str.startswith("rnd")].copy(); X["sc"] = support(X)
    nl = int(os.environ.get("UA_NL") or 12); nr = int(os.environ.get("UA_NR") or 8)
    lay = [l for l in X[X.layer != "none"].groupby("layer")["sc"].max().sort_values(ascending=False).index if l in L1][:nl]
    rks = list(X.groupby("rk")["sc"].max().sort_values(ascending=False).index[:nr])
    log(f"COMBO layers: {lay}")
    log(f"COMBO rankers: {rks}")
    pr = {rk: d.groupby("gd")[rk].rank(pct=True).values for rk in rks}
    R2 = list(rks)
    for a, b in itertools.combinations(rks, 2):
        d[f"{a}+{b}"] = (pr[a] + pr[b]) / 2; R2.append(f"{a}+{b}")
    if len(rks) >= 3:
        d["bal3:" + "+".join(rks[:3])] = np.mean([pr[x] for x in rks[:3]], axis=0); R2.append("bal3:" + "+".join(rks[:3]))
    d["balall"] = np.mean([pr[x] for x in rks], axis=0); R2.append("balall")
    R2 += ["rnd0", "rnd1"]
    L2 = {"none": L1["none"]}
    for l in lay:
        L2[l] = L1[l]
    for a, b in itertools.combinations(lay, 2):
        m = L1[a] & L1[b]
        if m.sum() >= 1500:
            L2[f"{a}&{b}"] = m
    log(f"COMBO grid: {len(R2)} rankers x {len(L2)} layers")
    return L2, R2


def build(lst, alt, k, nsl, start, altcap):
    rem = list(lst[start - 1:]); out = []
    for _ in range(nsl):
        s = []; na = 0; left = []
        for i in rem:
            if len(s) < k and (altcap is None or not alt[i] or na < altcap):
                s.append(i); na += int(alt[i])
            else:
                left.append(i)
        if len(s) < k:
            break
        out.append(s); rem = left
    return out


def stage_b(d, A, slp, L, T):
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
    X = A[~A.rk.str.startswith("rnd")].copy(); X["sc"] = support(X)
    X = X[X["sc"] > 0].sort_values("sc", ascending=False)
    nshort = int(os.environ.get("UA_SHORT") or 260)
    sel = X.groupby(["st", "k"], group_keys=False).head(max(8, nshort // 7)).drop_duplicates(["tier", "side", "rk", "layer", "gcap"])
    log(f"stage B shortlist {len(sel)} cells")
    has_alt = d["alt"].values.astype(bool)
    out = []; days_out = []
    for c in sel.itertuples():
        m = T[c.tier] & L[c.layer] & np.isfinite(d[c.rk].values.astype(float))
        if c.side != "both":
            m &= d["under"].values if c.side == "Under" else ~d["under"].values
        sub = d[m]
        res = defaultdict(list)
        for gd, x in sub.groupby("gd"):
            x = x.sort_values(c.rk, ascending=False).drop_duplicates("player_id")
            gid = x.gid.values; prp = x.prop.values; wv = x.w.values; av = x.alt.values.astype(bool); ly = x.logy.values; lf = x.logf.values
            ngames = len(set(gid)); old = gd < "2026-07-01"; season = x.season.iloc[0]
            for pdif in (0, 1):
                lst = []; ug = defaultdict(int); upr = set()
                for i in range(len(x)):
                    if ug[gid[i]] >= c.gcap or (pdif and prp[i] in upr):
                        continue
                    lst.append(i); ug[gid[i]] += 1; upr.add(prp[i])
                    if len(lst) >= 40:
                        break
                for altcap in ((None, 1, 0) if c.tier != "regular" else (None,)):
                    for start in (1, 2, 3):
                        for nlab in ("1", "2", "3", "g15", "g30"):
                            nsl = int(nlab) if nlab.isdigit() else max(1, round(ngames * int(nlab[1:]) / 100))
                            for k in U.KS:
                                sts = [s_ for s_ in ("power", "flex") if allowed(s_, k)]
                                if not sts:
                                    continue
                                for legs in build(lst, av, k, nsl, start, altcap):
                                    legs = np.array(legs); w = int(wv[legs].sum()); a = int(av[legs].sum())
                                    pw, fx = payouts(k, np.array([w]), np.array([a]), np.array([ly[legs][av[legs]].sum()]), np.array([lf[legs].sum()]),
                                                     np.array([lf[legs][wv[legs] == 1].sum()]), np.array([(np.exp(lf[legs]) - 1).sum()]), np.array([old]),
                                                     slp[0] if slp else {})
                                    if APP == "sleeper" and k >= 3:
                                        tiers = SL.flex_tiers(list(np.exp(lf[legs])), slp[1], slp[2]); fx = np.array([float(tiers.get(w, 0.0))])
                                    for st in sts:
                                        if st == "flex" and APP == "prizepicks" and a > 0:
                                            continue
                                        pv = (pw if st == "power" else fx)[0]
                                        if np.isfinite(pv):
                                            res[(pdif, -1 if altcap is None else altcap, start, nlab, st, k)].append((season, gd, pv - 1, w, k))
        for key, v in res.items():
            if len(v) < 40:
                continue
            v.sort(key=lambda t: t[1])
            s = np.array([t[0] for t in v]); u = np.array([t[2] for t in v]); gds = np.array([t[1] for t in v])
            dser = pd.Series(u).groupby(gds).sum()
            cum = np.cumsum(dser.values); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
            run = best = 0
            for z in dser.values:
                run = run + 1 if z < 0 else 0; best = max(best, run)
            top = np.sort(u)[::-1]
            rec = dict(tier=c.tier, side=c.side, rk=c.rk, layer=c.layer, gcap=c.gcap, pdif=key[0], altcap=key[1], start=key[2], nsl=key[3], st=key[4], k=key[5],
                       n=len(u), slates=len(dser), per_slate=len(u) / len(dser), roi=u.mean(), units=u.sum(), cash=float((u >= 0).mean()), ret=float((u > -1).mean()),
                       wo5=(u.sum() - top[:5].sum()) / len(u), dd=dd, drought=best, hit=sum(t[3] for t in v) / sum(t[4] for t in v), sc=c.sc, phase=c.phase)
            for ss in SEAS:
                mm = s == ss; rec[f"n{ss[2:4]}"] = int(mm.sum()); rec[f"r{ss[2:4]}"] = float(u[mm].mean()) if mm.any() else np.nan
            cu = s == "2026-27"
            for nm, mm in (("26a", cu & (gds < SPLIT)), ("26b", cu & (gds >= SPLIT))):
                rec["n" + nm] = int(mm.sum()); rec["r" + nm] = float(u[mm].mean()) if mm.any() else np.nan
            rec["sid"] = f"{APP}|{TAG}|{os.environ.get('UA_TIERS') or 'all'}|{len(out)}"
            out.append(rec)
            ok_sel = (rec["r24"] > 0 and rec["r25"] > 0) if not (math.isnan(rec["r24"]) and math.isnan(rec["r25"])) else (rec["r26a"] == rec["r26a"] and rec["r26a"] > 0)
            if ok_sel and rec["r26"] == rec["r26"] and rec["r26"] > 0:
                days_out.append((rec["sid"], ";".join(f"{g}:{dser[g]:.3f}:{int(c_)}" for g, c_ in zip(dser.index, pd.Series(1, index=gds).groupby(level=0).sum()[dser.index]))))
    log(f"stage B strategies {len(out):,}, kept with day results {len(days_out):,}")
    return pd.DataFrame(out), days_out


def write(name, df_):
    wc = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    df_ = df_.copy(); df_.insert(0, "app", APP); df_.insert(1, "tag", TAG + "|" + (os.environ.get("UA_TIERS") or "all"))
    cols = list(df_.columns)
    typ = {c: ("boolean" if pd.api.types.is_bool_dtype(df_[c]) else ("float8" if pd.api.types.is_numeric_dtype(df_[c]) else "text")) for c in cols}
    for t_ in range(6):
        try:
            wc.execute(f"CREATE TABLE IF NOT EXISTS nba_score.{name} (" + ", ".join(f'"{c}" {typ[c]}' for c in cols) + ")"); break
        except Exception:
            time.sleep(3 + 5 * t_)
    have = {r[0] for r in wc.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='nba_score' AND table_name=%s", (name,)).fetchall()}
    for c in cols:
        if c not in have:
            wc.execute(f'ALTER TABLE nba_score.{name} ADD COLUMN IF NOT EXISTS "{c}" {typ[c]}')
    wc.execute(f"DELETE FROM nba_score.{name} WHERE app = %s AND tag = %s", (APP, df_["tag"].iloc[0]))
    buf = io.StringIO(); df_.to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
    with wc.cursor().copy(f"COPY nba_score.{name} (" + ", ".join(f'"{c}"' for c in cols) + ") FROM STDIN WITH (FORMAT csv)") as cp:
        cp.write(buf.read())
    log(f"UA2|written {len(df_):,} rows to nba_score.{name}")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    slp = None
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
        slp = SL.pricing(conn)
    d = U.load(conn); conn.close()
    log(f"UA2|{APP}: legs {len(d):,} | slates {d.gd.nunique()} | by season {d.groupby('season').size().to_dict()}")
    L1 = U.layers(d); T = U.tiersets(d)
    A1 = stage_a(d, slp[0] if slp else {}, L1, T, U.RANKERS, "A1")
    L2, R2 = combos(d, A1, L1)
    A2 = stage_a(d, slp[0] if slp else {}, L2, T, R2, "A2")
    A = pd.concat([A1, A2], ignore_index=True); A["rand"] = A.rk.str.startswith("rnd") | A.rk.str.contains("rnd")
    Lall = dict(L1); Lall.update(L2)
    for lab, m in (("real", ~A.rand), ("random", A.rand)):
        X = A[m].copy(); X["sc"] = support(X); P = X[X.sc > 0]
        print(f"UA2|LUCK {lab}: cells {len(X):,} | selected-positive {len(P):,} ({100*len(P)/max(len(X),1):.2f}%) -> 2026-27 mean {100*P.r26.mean():+.1f}%, "
              f"positive {100*(P.r26 > 0).mean():.0f}% | after split (26b) mean {100*P.r26b.mean():+.1f}%", flush=True)
    B, days = stage_b(d, A, slp, Lall, T)
    write("ua2_cells", A.drop(columns=["rand"]))
    if len(B):
        write("ua2_strats", B)
        if days:
            write("ua2_days", pd.DataFrame(days, columns=["sid", "days"]))
        ok = B[np.where(B.r24.isna() & B.r25.isna(), B.r26a > 0, (B.r24 > 0) & (B.r25 > 0)) & (B.n26 >= 10)]
        print(f"UA2|STAGE B: selected {len(ok):,} of {len(B):,} -> 2026-27 mean {100*ok.r26.mean():+.1f}%, positive {100*(ok.r26 > 0).mean():.0f}%; "
              f"after split mean {100*ok.r26b.mean():+.1f}%", flush=True)
        for (st, k), g in ok.groupby(["st", "k"]):
            g = g[(g.r26 > 0) & (g.wo5 > 0)].sort_values("roi", ascending=False)
            for r in g.drop_duplicates(["rk", "layer", "side", "tier"]).head(6).itertuples():
                print(f"UA2|  {st} {k}: {r.tier} {r.side} {r.rk} [{r.layer}] g{r.gcap}{' pd' if r.pdif else ''} alt{r.altcap} #{r.start} x{r.nsl}: {r.n} slips "
                      f"({r.per_slate:.1f}/slate) | {100*r.r24:+.0f}/{100*r.r25:+.0f}/{100*r.r26:+.0f}% ({r.n24}/{r.n25}/{r.n26}) after split {100*r.r26b:+.0f}% ({r.n26b}) "
                      f"| cash {100*r.cash:.0f}% dd {r.dd:.1f}u drought {r.drought} w/o5 {100*r.wo5:+.0f}%", flush=True)
    print("UA2|DONE", flush=True)


if __name__ == "__main__":
    main()
