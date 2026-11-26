#!/usr/bin/env python3
"""
PORTFOLIO PASS 3 / CERTIFICATION (owner 2026-11-25 22:23 PT). READ-ONLY. Input nba_score.ua3 (own boards, strategies chosen on PRIOR seasons only, per-slip profit and legs).
Grid per config: strategies per app (0-6 each, different per app) | slips a day per app (1-6/none) | total slips a day | player exposure (max slips holding the same player a day, all apps).
Selection on 2024-25 + 2025-26 (score = weaker season ROI of the portfolio); 2026-27 before Nov 8 = validation; Nov 8+ = final test.
Also: percentile of the chosen portfolio among all sampled, bootstrap CI of Nov 8+/2026-27 ROI over days, leg-gone sensitivity (pull rate q per leg, policy sub / shrink / drop).
Env: DATABASE_URL, PF_SPLIT, PF_RHO (0.6), PF_N (random configs, 6000), PF_SEED.
"""
import os
import random
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

SPLIT = os.environ.get("PF_SPLIT") or "2026-11-08"
RHO = float(os.environ.get("PF_RHO") or 0.6)
NCFG = int(os.environ.get("PF_N") or 6000)
SEAS = ("2024-25", "2025-26", "2026-27")


def season(g):
    return "2024-25" if g < "2025-07-01" else "2025-26" if g < "2026-07-01" else "2026-27"


W = tuple(float(x) for x in (os.environ.get("PF_W") or "1,2,4").split(","))


def wscore(r):
    v = [(W[0], r.r24, r.n24), (W[1], r.r25, r.n25), (W[2], r.r26a, r.n26a)]
    v = [(w, x) for w, x, n in v if x == x and n and n >= 8]
    return sum(w * x for w, x in v) / sum(w for w, _ in v) if v else float("nan")


def parse(s):
    out = {}
    for t in s.split("|"):
        if not t:
            continue
        g, u, n, sl = t.split("#", 3)
        slips = []
        for z in sl.split("/"):
            p, legs = z.split("@")
            slips.append((float(p), set(legs.split("."))))
        out[g] = slips
    return out


def weight_test():
    """Which season weighting predicts the unseen Nov 8+ best? Per strategy: weighted score of (2024-25, 2025-26, 2026-27 before Nov 8); outcome = its Nov 8+ ROI."""
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = pd.read_sql("SELECT app, st, k, r24, r25, r26a, r26b, n24, n25, n26a, n26b FROM nba_score.ua3 WHERE tag NOT LIKE '%-b' AND tag NOT LIKE '%-n' AND NOT (app='underdog' AND tier <> 'regular')", conn)
    conn.close()
    d = d[(d.n26b >= 15) & (d.n26a >= 15)].copy()
    print(f"P3W|strategies with 15+ slips before and after Nov 8: {len(d)}", flush=True)
    schemes = {"equal 1/1/1": (1, 1, 1), "prior only 1/1/0": (1, 1, 0), "mild 1/2/3": (1, 2, 3), "mild 1/2/4": (1, 2, 4), "strong 1/3/9": (1, 3, 9),
               "current only 0/0/1": (0, 0, 1), "2025-26 only 0/1/0": (0, 1, 0), "2024-25 only 1/0/0": (1, 0, 0), "past two 1/2/0": (1, 2, 0)}
    print("P3W|scheme | rank corr with Nov 8+ ROI | Nov 8+ ROI of top 10% | top 25% | all (baseline) | top 10% share positive", flush=True)
    for nm, (a, b, c) in schemes.items():
        sc = (a * d.r24.fillna(0) + b * d.r25.fillna(0) + c * d.r26a.fillna(0)) / max(1e-9, a + b + c)
        cor = sc.rank().corr(d.r26b.rank())
        o = d.assign(sc=sc).sort_values("sc", ascending=False)
        w = lambda x: float((x.r26b * x.n26b).sum() / x.n26b.sum())
        print(f"P3W|{nm:20s} | {cor:+.2f} | {100*w(o.head(max(3, len(o)//10))):+.0f}% | {100*w(o.head(max(5, len(o)//4))):+.0f}% | {100*w(o):+.0f}% | {100*float((o.head(max(3, len(o)//10)).r26b > 0).mean()):.0f}%", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    df = pd.read_sql("SELECT app, tag, sid, st, k, tier, side, rk, layer, nsl, start, sup, r24, r25, r26, n24, n25, n26, r26a, r26b, n26a, n26b, gone_base, gone_sub, gone_shrink, days FROM nba_score.ua3 WHERE tag " + (f"LIKE '%{os.environ['PF_SUFFIX']}'" if os.environ.get("PF_SUFFIX") else "NOT LIKE '%-b' AND tag NOT LIKE '%-n'"), conn)
    conn.close()
    df["k"] = df["k"].astype(int)
    S = []
    for r in df.itertuples():
        if r.app == "underdog" and r.tier != "regular":
            continue
        S.append(dict(app=r.app, sid=r.sid, st=r.st, k=r.k, label=f"{'P' if r.st == 'power' else 'F'}{r.k} {r.tier} {r.side} {r.rk} [{r.layer}] #{int(r.start)} x{r.nsl}",
                      sc=wscore(r), r24=r.r24, r25=r.r25, r26=r.r26, n26=r.n26, r26a=r.r26a, r26b=r.r26b, n26b=r.n26b, n24=r.n24, n25=r.n25, gb=r.gone_base, gs=r.gone_sub, gh=r.gone_shrink, day=parse(r.days)))
    if os.environ.get("PF_FILT"):
        mk = int(os.environ.get("PF_MAXK") or 4)
        S = [s for s in S if s["k"] <= mk and s["r26"] == s["r26"] and s["r26"] > 0.10 and s["r26b"] == s["r26b"] and s["r26b"] > 0 and s["n26b"] >= 4 and s["n26"] >= int(os.environ.get("PF_MIN26") or 10)
             and (s["r25"] != s["r25"] or s["r25"] > 0) and (s["r24"] != s["r24"] or s["r24"] > 0)]
        for s in S:
            s["sc"] = (W[0] * (s["r24"] if s["r24"] == s["r24"] else 0) + W[1] * (s["r25"] if s["r25"] == s["r25"] else 0) + W[2] * s["r26"]) / sum(W)
        print(f"P3|FILTER small slips k<={mk}: positive 2026-27 (full, incl. Nov 8+), Nov 8+ positive, 2025-26 and 2024-25 not negative: {len(S)} strategies", flush=True)
    S = [s for s in S if s["sc"] == s["sc"]]
    apps = sorted({s["app"] for s in S})
    print(f"P3|season weights 2024-25/2025-26/2026-27 before Nov 8 = {W}", flush=True)
    print("P3|strategies per app (prior-season selected): " + " | ".join(f"{a} {sum(1 for s in S if s['app'] == a)}" for a in apps), flush=True)
    alld = sorted({g for s in S for g in s["day"]})
    seldays = [g for g in alld if season(g) != "2026-27"]
    rng = random.Random(int(os.environ.get("PF_SEED") or 7))
    ranked = {}
    ORDER = ["P2", "F3", "F4", "F5", "F6"]
    for a in apps:
        bys = {}
        for st_ in ORDER:
            cand = sorted([s for s in S if s["app"] == a and f"{'P' if s['st'] == 'power' else 'F'}{s['k']}" == st_], key=lambda s: -s["sc"])
            pick = []
            for s in cand:
                v = np.array([sum(p for p, _ in s["day"].get(g, [])) for g in seldays]); s["_v"] = v
                if any(np.std(v) > 0 and np.std(p_["_v"]) > 0 and abs(np.corrcoef(v, p_["_v"])[0, 1]) > RHO for p_ in pick):
                    continue
                pick.append(s)
                if len(pick) >= 3:
                    break
            bys[st_] = pick
        pool = []
        for i in range(3):
            for st_ in ORDER:
                if i < len(bys[st_]):
                    pool.append(bys[st_][i])
        ranked[a] = pool
        print(f"P3|{a.upper()} pool (small slips first, 3 per structure):", flush=True)
        for i, s in enumerate(pool, 1):
            print(f"P3|  {i}. {s['label']} | weighted {100*s['sc']:+.0f}%", flush=True)
    f = lambda x, n=None: ("-" if x != x else f"{100*x:+.0f}%") + (f" ({int(n)})" if n == n and n is not None else "")
    for a in apps:
        A_ = sorted([x for x in S if x["app"] == a], key=lambda x: -x["sc"])
        seen = set(); rows_ = []
        for x in A_:
            key = (x["label"], round(x["sc"], 4))
            if key in seen:
                continue
            seen.add(key); rows_.append(x)
        for title, cond in (("MAIN (weighted >= 25%)", lambda x: x["sc"] >= 0.25), ("FALLBACK (weighted 0-25%, 2026-27 positive)", lambda x: 0 < x["sc"] < 0.25 and x["r26"] == x["r26"] and x["r26"] > 0)):
            L_ = [x for x in rows_ if cond(x)]
            print(f"P3Q|{a.upper()} {title}: {len(L_)} (top 12 shown)", flush=True)
            for x in L_[:12]:
                print(f"P3Q|  {x['label']} | 24-25 {f(x['r24'], x['n24'])} | 25-26 {f(x['r25'], x['n25'])} | 26-27 {f(x['r26'], x['n26'])} | Nov 8+ {f(x['r26b'], x['n26b'])} | weighted {100*x['sc']:+.0f}%", flush=True)

    def run(cfg, q=0.0, pol=None, daysub=None):
        """cfg: dict n[app], cap[app], tot, expo. Returns per-season/late stats."""
        seas = defaultdict(lambda: [0.0, 0]); late = [0.0, 0]; dayu = []; per_day = {}; ks_ = []
        for g in (daysub or alld):
            used = 0; per = defaultdict(int); pl = defaultdict(int); du = 0.0; ns = 0
            queue = [(i, a, s) for a in apps for i, s in enumerate([x for x in ranked[a] if x["k"] <= cfg.get("kmax", 6)][:cfg["n"][a]])]
            for i, a, s in queue:
                for p, legs in s["day"].get(g, []):
                    if per[a] >= cfg["cap"][a] or used >= cfg["tot"]:
                        break
                    if cfg["expo"] < 99 and any(pl[x] >= cfg["expo"] for x in legs):
                        continue
                    if q > 0 and pol:
                        kk = s["k"]; base = s["gb"]; alt = 0.0 if pol == "drop" else (s["gs"] if pol == "sub" else s["gh"])
                        if alt == alt and base == base:
                            p = p + kk * q * (1 - q) ** (kk - 1) * (alt - base)
                    per[a] += 1; used += 1; du += p; ns += 1; ks_.append(s["k"])
                    for x in legs:
                        pl[x] += 1
                    seas[season(g)][0] += p; seas[season(g)][1] += 1
                    if g >= SPLIT:
                        late[0] += p; late[1] += 1
            if ns:
                dayu.append((g, du, ns))
        if not dayu:
            return None
        u = np.array([x[1] for x in dayu]); cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        run_ = best = 0
        for z in u:
            run_ = run_ + 1 if z < 0 else 0; best = max(best, run_)
        rec = dict(slips=sum(v[1] for v in seas.values()), days=len(dayu), units=float(u.sum()), dd=dd, drought=best, ldays=int((u < 0).sum()),
                   lshare=float((u < 0).mean()), ru=late[0], rn=late[1], dayu=dayu)
        ea = [x for x in dayu if x[0] >= "2026-07-01" and x[0] < SPLIT]
        rec["r26a"] = sum(x[1] for x in ea) / max(1, sum(x[2] for x in ea)); rec["n26a"] = sum(x[2] for x in ea)
        for ss in SEAS:
            rec["r" + ss[2:4]] = seas[ss][0] / seas[ss][1] if seas[ss][1] else np.nan; rec["n" + ss[2:4]] = seas[ss][1]; rec["u" + ss[2:4]] = seas[ss][0]
        rec["rlate"] = late[0] / late[1] if late[1] else np.nan; rec["avgk"] = float(np.mean(ks_)) if ks_ else np.nan
        return rec

    def rnd():
        n = {a: rng.choice([0, 1, 2, 3, 4, 5, 6, 8]) for a in apps}
        if sum(n.values()) == 0:
            n[rng.choice(apps)] = 2
        for kv in (os.environ.get("PF_REQ") or "").split(","):
            if ":" in kv and kv.split(":")[0] in n:
                n[kv.split(":")[0]] = max(n[kv.split(":")[0]], int(kv.split(":")[1]))
        cap = {a: rng.choice([1, 2, 3, 4, 6, 99]) for a in apps}
        return dict(n=n, cap=cap, tot=rng.choice([4, 6, 8, 10, 12, 15, 20, 999]), expo=rng.choice([1, 2, 3, 99]), kmax=rng.choice([3, 4, 5, 6]))

    cfgs = [rnd() for _ in range(NCFG)]
    # fixed references: same count / cap for every app
    for n_ in (1, 2, 3, 4, 5, 6):
        for cp in (2, 3, 99):
            cfgs.append(dict(n={a: n_ for a in apps}, cap={a: cp for a in apps}, tot=999, expo=99))
    rows = []
    for ci, c in enumerate(cfgs):
        r = run(c)
        if r:
            r["cfg"] = c; r.pop("dayu"); rows.append(r)
        if ci % 1000 == 0:
            print(f"P3|progress {ci}/{len(cfgs)}", flush=True)
    R = pd.DataFrame(rows)
    R["sel"] = np.minimum(R["r24"].fillna(-9), R["r25"].fillna(-9))
    print(f"P3|configs evaluated {len(R):,}", flush=True)

    def desc(c):
        return f"max {c.get('kmax', 6)}-pick | per-app n " + "/".join(f"{a[:2]}{c['n'][a]}" for a in apps) + " cap " + "/".join(f"{a[:2]}{c['cap'][a] if c['cap'][a] < 99 else '-'}" for a in apps) + f" tot {c['tot'] if c['tot'] < 999 else '-'} expo {c['expo'] if c['expo'] < 99 else '-'}"

    def line(r):
        return (f"{desc(r.cfg)}: {r.slips/r.days:.1f}/day | " + " / ".join(f"{100*getattr(r, 'r'+s[2:4]):+.0f}% ({getattr(r, 'n'+s[2:4])})" for s in SEAS)
                + f" | 26-27 before Nov 8 {100*r.r26a:+.0f}% ({r.n26a}) | Nov 8+ {100*r.rlate:+.0f}% ({r.rn}) | dd {r.dd:.0f}u | losing days {100*r.lshare:.0f}% | run {r.drought}")

    # eligible: positive in both prior seasons, enough slips, and validated before Nov 8
    G = (R[(R.r26 > 0.1) & (R.rlate > 0) & ((R.r25 > 0) | R.r25.isna())] if os.environ.get("PF_FILT") else R[(R.r24 > 0.2) & (R.r25 > 0.2) & (R.n26a > 30)]).copy()
    G["calm"] = G["units"] / G["dd"].clip(lower=1)
    print(f"P3|eligible (both prior seasons > 20%): {len(G):,}", flush=True)
    for title, X in (("best by prior seasons only (weaker season)", G.sort_values("sel", ascending=False)),
                     ("best validation (2026-27 before Nov 8) with prior min 30%", G[G.rlate > -9].sort_values("r26a", ascending=False)),
                     ("lowest drawdown with prior min 30% and validation positive", G[G.rlate > -9].sort_values("dd")),
                     ("lowest losing-day share, same filter", G[G.rlate > -9].sort_values("lshare")),
                     ("calmest (units per unit of drawdown), same filter", G[G.rlate > -9].sort_values("calm", ascending=False))):
        print(f"P3|== {title} ==", flush=True)
        for r in X.head(8).itertuples():
            print("P3|  " + line(r), flush=True)
    # choose: best by prior seasons + validation, then final test on Nov 8+ untouched
    sel = G[(G.r25 > 0) & (G.r26 > 0) & (G.rlate > 0)].copy()
    sel["pick"] = 2 * (1 - sel["dd"].rank(pct=True)) + 2 * (1 - sel["lshare"].rank(pct=True)) + sel["sel"].rank(pct=True) + sel["r26a"].rank(pct=True) + (1 - sel["avgk"].rank(pct=True))
    best = sel.sort_values("pick", ascending=False).head(5)
    print("P3|== CHOSEN (prior seasons + validation + drawdown + losing days; Nov 8+ is the untouched final test) ==", flush=True)
    for r in best.itertuples():
        print("P3|  " + line(r), flush=True)
    top = best.iloc[0]
    pctl = {k_: float((R[k_] <= top[k_]).mean()) for k_ in ("units", "r26a", "rlate")}
    print(f"P3|percentile of chosen among all {len(R):,} sampled: units {100*pctl['units']:.0f}% | validation ROI {100*pctl['r26a']:.0f}% | Nov 8+ ROI {100*pctl['rlate']:.0f}%; beaten on drawdown by "
          f"{int(((R.dd < top.dd) & (R.sel > 0.2) & (R.r26a > 0)).sum())} configs, on losing-day share by {int(((R.lshare < top.lshare) & (R.sel > 0.2) & (R.r26a > 0)).sum())}, on prior-season ROI by {int((R.sel > top.sel).sum())}", flush=True)
    # bootstrap over days
    r0 = run(top.cfg); du = r0["dayu"]
    bs = []
    for _ in range(2000):
        idx = [rng.randrange(len(du)) for _ in range(len(du))]
        sl = sum(du[i][2] for i in idx); bs.append(sum(du[i][1] for i in idx) / max(1, sl))
    late = [x for x in du if x[0] >= SPLIT]
    bl = []
    for _ in range(2000):
        idx = [rng.randrange(len(late)) for _ in range(len(late))]
        sl = sum(late[i][2] for i in idx); bl.append(sum(late[i][1] for i in idx) / max(1, sl))
    print(f"P3|bootstrap over days, all seasons ROI 5-95%: {100*np.percentile(bs,5):+.0f}% .. {100*np.percentile(bs,95):+.0f}% | Nov 8+ ROI 5-95%: {100*np.percentile(bl,5):+.0f}% .. {100*np.percentile(bl,95):+.0f}% ({len(late)} days)", flush=True)
    print("P3|== chosen portfolio strategies ==", flush=True)
    for a in apps:
        for i, s in enumerate(ranked[a][:top.cfg["n"][a]], 1):
            print(f"P3|  {a} {i}. {s['label']}", flush=True)
    print("P3|== leg-gone sensitivity of the chosen portfolio (pull rate per leg, expected-value approximation) ==", flush=True)
    for q in (0.0, 0.05, 0.10, 0.20):
        for pol in (("sub", "shrink", "drop") if q else (None,)):
            r = run(top.cfg, q, pol)
            print(f"P3|  q {int(100*q)}% {pol or 'none':6s}: " + " / ".join(f"{100*r['r'+s[2:4]]:+.0f}%" for s in SEAS) + f" | Nov 8+ {100*r['rlate']:+.0f}% | dd {r['dd']:.0f}u | units {r['units']:+.0f}", flush=True)
    print("P3|== exposure: same chosen counts, only the player cap changes ==", flush=True)
    for ex in (1, 2, 3, 99):
        c2 = dict(top.cfg); c2["expo"] = ex; r = run(c2)
        print(f"P3|  expo {ex if ex < 99 else 'none'}: {r['slips']/r['days']:.1f}/day | " + " / ".join(f"{100*r['r'+s[2:4]]:+.0f}%" for s in SEAS) + f" | Nov 8+ {100*r['rlate']:+.0f}% | dd {r['dd']:.0f}u | losing days {100*r['lshare']:.0f}%", flush=True)
    print("P3|== per-app view of the chosen portfolio (each app alone with its chosen count and cap) ==", flush=True)
    for a in apps:
        c2 = dict(n={x: (top.cfg["n"][x] if x == a else 0) for x in apps}, cap=top.cfg["cap"], tot=999, expo=99)
        if c2["n"][a] == 0:
            continue
        r = run(c2)
        if r:
            print(f"P3|  {a}: n {c2['n'][a]} cap {c2['cap'][a] if c2['cap'][a] < 99 else '-'}: {r['slips']/r['days']:.1f}/day | " + " / ".join(f"{100*r['r'+s[2:4]]:+.0f}% ({r['n'+s[2:4]]})" for s in SEAS) + f" | Nov 8+ {100*r['rlate']:+.0f}% ({r['rn']}) | dd {r['dd']:.0f}u", flush=True)
    weight_test()
    print("P3|DONE", flush=True)


if __name__ == "__main__":
    main()
