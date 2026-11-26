#!/usr/bin/env python3
"""
CERTIFICATION DATA, OWN BOARDS (owner 2026-11-25 22:23 PT: deep certification, leg exposure, leg drift / shrink / sub / drop, per-app counts and caps).
READ-ONLY on production; writes research scratch table nba_score.ua3 (nothing reads it).

WHY: the first portfolio pass kept day results only for strategies that were positive in 2026-27, which flatters 2026-27 and Nov 8+. Here a strategy is kept
by its PRIOR seasons only (2024-25 and 2025-26 both positive, 30+ slips each; Underdog Flex - priced only since 2026-07 - by 2026-27 before UA_SPLIT), the
top UA_KEEP per structure by the weaker prior season. Everything 2026-27 shows is then unseen.
Per strategy and day: profit, slips, the legs (player ids per slip). Per strategy also LEG-GONE values: mean profit per slip when ONE leg is pulled, under
  sub  (the next candidate of the same ranking, not in any slip that day), shrink (the slip without the leg: Flex k-1 if k-1 >= 3, else 2-pick Power), drop (0).
Reads the cells of universe 2 (nba_score.ua2_cells) so the shortlist is the same one; rebuilds the ranker blends and layers deterministically.
Env: DATABASE_URL, UA_APP, UA_TIERS, UA_TAG (u2), UA_KEEP (40), UA_SHORT (260), UA_SPLIT.
"""
import io
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
import research_universe2 as U2                               # noqa: E402

APP = U.APP; SEAS = U.SEAS; SPLIT = U2.SPLIT; log = U.log
KEEP = int(os.environ.get("UA_KEEP") or 40)


def load_cells(tiers):
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tag = f"u2|{tiers or 'all'}"
    A = pd.read_sql("SELECT * FROM nba_score.ua2_cells WHERE app = %s AND tag = %s", conn, params=(APP, tag))
    conn.close()
    log(f"cells from universe 2: {len(A):,} (tag {tag})")
    return A


def stage_b3(d, A, slp, L, T):
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
    X = A[~A.rk.str.contains("rnd")].copy()
    bs = float(os.environ.get("UA_BROAD") or 0)
    if bs > 0:
        nn = X[X.layer == "none"].set_index(["tier", "side", "rk", "gcap", "st", "k"])["n"]
        key = list(zip(X.tier, X.side, X.rk, X.gcap, X.st, X.k))
        base = np.array([nn.get(k_, np.nan) for k_ in key], dtype=float)
        X = X[(X.n.values >= bs * base) | (X.layer.values == "none")].copy()
        log(f"broad filter: layers must keep {int(100*bs)}%+ of the unfiltered slips -> {len(X)} cells")
    X["sc"] = U2.support(X)
    X = X[X["sc"] > 0].sort_values("sc", ascending=False)
    nshort = int(os.environ.get("UA_SHORT") or 260)
    sel = X.groupby(["st", "k"], group_keys=False).head(max(8, nshort // 7)).drop_duplicates(["tier", "side", "rk", "layer", "gcap"])
    log(f"shortlist {len(sel)} cells")
    av_all = d["alt"].values.astype(bool)
    out = []

    def pay(legs, st, k, wv, av, ly, lf, old):
        legs = np.array(legs)
        w = int(wv[legs].sum()); a = int(av[legs].sum())
        pw, fx = U2.payouts(k, np.array([w]), np.array([a]), np.array([ly[legs][av[legs]].sum()]), np.array([lf[legs].sum()]),
                            np.array([lf[legs][wv[legs] == 1].sum()]), np.array([(np.exp(lf[legs]) - 1).sum()]), np.array([old]), slp[0] if slp else {})
        if APP == "sleeper" and k >= 3:
            tiers = SL.flex_tiers(list(np.exp(lf[legs])), slp[1], slp[2]); fx = np.array([float(tiers.get(w, 0.0))])
        if st == "flex" and APP == "prizepicks" and a > 0:
            return None
        pv = (pw if st == "power" else fx)[0]
        return (pv - 1, w) if np.isfinite(pv) else None

    for ci, c in enumerate(sel.itertuples()):
        m = T[c.tier] & L[c.layer] & np.isfinite(d[c.rk].values.astype(float))
        if c.side != "both":
            m &= d["under"].values if c.side == "Under" else ~d["under"].values
        sub = d[m]
        res = defaultdict(list); gone = defaultdict(lambda: [0.0, 0.0, 0.0, 0])      # base u, sub u, shrink u, legs
        for gd, x in sub.groupby("gd"):
            x = x.sort_values(c.rk, ascending=False).drop_duplicates("player_id")
            pid = x.player_id.values; gid = x.gid.values; prp = x.prop.values; wv = x.w.values; av = x.alt.values.astype(bool); ly = x.logy.values; lf = x.logf.values
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
                                sts = [s_ for s_ in ("power", "flex") if U2.allowed(s_, k)]
                                if not sts:
                                    continue
                                slips = U2.build(lst, av, k, nsl, start, altcap)
                                inuse = {i for s_ in slips for i in s_}
                                for legs in slips:
                                    for st in sts:
                                        r = pay(legs, st, k, wv, av, ly, lf, old)
                                        if r is None:
                                            continue
                                        key = (pdif, -1 if altcap is None else altcap, start, nlab, st, k)
                                        res[key].append((season, gd, r[0], r[1], k, ".".join(pid[i] for i in legs)))
                                        if nlab in ("1", "g15") and True:
                                            g = gone[key]
                                            spare = [i for i in lst if i not in inuse]
                                            for pos in range(k):
                                                rest = [legs[j] for j in range(k) if j != pos]
                                                g[3] += 1; g[0] += r[0]
                                                if spare:
                                                    rs = pay(rest + [spare[0]], st, k, wv, av, ly, lf, old)
                                                    g[1] += rs[0] if rs else 0.0
                                                kk = k - 1
                                                sh = ("flex", kk) if kk >= 3 else ("power", 2)
                                                if kk >= 2:
                                                    rr = pay(rest, sh[0], kk, wv, av, ly, lf, old)
                                                    g[2] += rr[0] if rr else 0.0
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
            rec = dict(tier=c.tier, side=c.side, rk=c.rk, layer=c.layer, gcap=c.gcap, pdif=key[0], altcap=key[1], start=key[2], nsl=key[3], st=key[4], k=key[5],
                       n=len(u), slates=len(dser), per_slate=len(u) / len(dser), roi=float(u.mean()), cash=float((u >= 0).mean()), dd=dd, drought=best,
                       hit=sum(t[3] for t in v) / sum(t[4] for t in v))
            for ss in SEAS:
                mm = s == ss; rec[f"n{ss[2:4]}"] = int(mm.sum()); rec[f"r{ss[2:4]}"] = float(u[mm].mean()) if mm.any() else np.nan
            cu = s == "2026-27"
            for nm, mm in (("26a", cu & (gds < SPLIT)), ("26b", cu & (gds >= SPLIT))):
                rec["n" + nm] = int(mm.sum()); rec["r" + nm] = float(u[mm].mean()) if mm.any() else np.nan
            g = gone.get(key)
            if g and g[3]:
                rec["gone_n"] = g[3]; rec["gone_base"] = g[0] / g[3]; rec["gone_sub"] = g[1] / g[3]; rec["gone_shrink"] = g[2] / g[3]
            # selection by PRIOR seasons only
            if not math.isnan(rec["r24"]) and not math.isnan(rec["r25"]):
                ok = rec["r24"] > 0 and rec["r25"] > 0 and rec["n24"] >= 30 and rec["n25"] >= 30; rec["sup"] = min(rec["r24"], rec["r25"])
            elif math.isnan(rec["r24"]) and math.isnan(rec["r25"]):
                ok = rec["r26a"] == rec["r26a"] and rec["r26a"] > 0 and rec["n26a"] >= 8; rec["sup"] = rec["r26a"] if ok else np.nan
            else:
                ok = False
            if not ok:
                continue
            # day string: date # profit # slips # legs of every slip ("." inside a slip, "/" between slips)
            byday = defaultdict(list)
            for t in v:
                byday[t[1]].append(t)
            rec["days"] = "|".join(f"{g_}#{sum(x_[2] for x_ in xs):.3f}#{len(xs)}#" + "/".join(f"{x_[2]:.3f}@{x_[5]}" for x_ in xs) for g_, xs in byday.items())
            out.append(rec)
        if ci % 20 == 0:
            log(f"shortlist cell {ci}/{len(sel)}: kept {len(out):,}")
    B = pd.DataFrame(out)
    if not len(B):
        return B
    B = B.sort_values("sup", ascending=False)
    B = B.groupby(["st", "k"], group_keys=False).head(KEEP).reset_index(drop=True)
    B["sid"] = [f"{APP}|{os.environ.get('UA_TIERS') or 'all'}{os.environ.get('UA_SUFFIX') or ''}|{i}" for i in range(len(B))]
    log(f"kept {len(B)} strategies (prior-season selection only)")
    return B


def write(B):
    wc = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    B = B.copy(); B.insert(0, "app", APP); B.insert(1, "tag", (os.environ.get("UA_TIERS") or "all") + (os.environ.get("UA_SUFFIX") or ""))
    cols = list(B.columns)
    typ = {c: ("float8" if pd.api.types.is_numeric_dtype(B[c]) else "text") for c in cols}
    for t_ in range(6):
        try:
            wc.execute("CREATE TABLE IF NOT EXISTS nba_score.ua3 (" + ", ".join(f'"{c}" {typ[c]}' for c in cols) + ")"); break
        except Exception:
            time.sleep(3 + 5 * t_)
    have = {r[0] for r in wc.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='nba_score' AND table_name='ua3'").fetchall()}
    for c in cols:
        if c not in have:
            wc.execute(f'ALTER TABLE nba_score.ua3 ADD COLUMN IF NOT EXISTS "{c}" {typ[c]}')
    wc.execute("DELETE FROM nba_score.ua3 WHERE app = %s AND tag = %s", (APP, B["tag"].iloc[0]))
    buf = io.StringIO(); B.to_csv(buf, index=False, header=False, na_rep=""); buf.seek(0)
    with wc.cursor().copy("COPY nba_score.ua3 (" + ", ".join(f'"{c}"' for c in cols) + ") FROM STDIN WITH (FORMAT csv)") as cp:
        cp.write(buf.read())
    log(f"CERT|written {len(B)} rows to nba_score.ua3")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    slp = None
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
        slp = SL.pricing(conn)
    d = U.load(conn); conn.close()
    L1 = U.layers(d); T = U.tiersets(d)
    A = load_cells(os.environ.get("UA_TIERS"))
    A1 = A[A.phase == "A1"].reset_index(drop=True)
    L2, R2 = U2.combos(d, A1, L1)
    Lall = dict(L1); Lall.update(L2)
    B = stage_b3(d, A, slp, Lall, T)
    if len(B):
        write(B)
        for (st, k), g in B.groupby(["st", "k"]):
            r = g.iloc[0]
            print(f"CERT|  {st} {k}: {len(g)} kept | best prior {r.tier} {r.side} {r.rk} [{r.layer}] sup {100*r.sup:+.0f}% | 26-27 {100*r.r26:+.0f}% ({r.n26})", flush=True)
    print("CERT|DONE", flush=True)


if __name__ == "__main__":
    main()
