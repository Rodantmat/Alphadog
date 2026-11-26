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


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    df = pd.read_sql("SELECT app, tag, sid, st, k, tier, side, rk, layer, nsl, start, sup, r24, r25, r26a, r26b, n26, gone_base, gone_sub, gone_shrink, days FROM nba_score.ua3", conn)
    conn.close()
    df["k"] = df["k"].astype(int)
    S = []
    for r in df.itertuples():
        if r.app == "underdog" and r.tier != "regular":
            continue
        S.append(dict(app=r.app, sid=r.sid, st=r.st, k=r.k, label=f"{'P' if r.st == 'power' else 'F'}{r.k} {r.tier} {r.side} {r.rk} [{r.layer}] #{int(r.start)} x{r.nsl}",
                      sc=r.sup, gb=r.gone_base, gs=r.gone_sub, gh=r.gone_shrink, day=parse(r.days)))
    apps = sorted({s["app"] for s in S})
    print("P3|strategies per app (prior-season selected): " + " | ".join(f"{a} {sum(1 for s in S if s['app'] == a)}" for a in apps), flush=True)
    alld = sorted({g for s in S for g in s["day"]})
    seldays = [g for g in alld if season(g) != "2026-27"]
    rng = random.Random(int(os.environ.get("PF_SEED") or 7))
    ranked = {}
    for a in apps:
        cand = sorted([s for s in S if s["app"] == a], key=lambda s: -s["sc"])
        pick = []
        for s in cand:
            v = np.array([sum(p for p, _ in s["day"].get(g, [])) for g in seldays]); s["_v"] = v
            if any(np.std(v) > 0 and np.std(p_["_v"]) > 0 and abs(np.corrcoef(v, p_["_v"])[0, 1]) > RHO for p_ in pick):
                continue
            pick.append(s)
            if len(pick) >= 8:
                break
        ranked[a] = pick
        print(f"P3|{a.upper()} pool:", flush=True)
        for i, s in enumerate(pick, 1):
            print(f"P3|  {i}. {s['label']} | prior min {100*s['sc']:+.0f}%", flush=True)

    def run(cfg, q=0.0, pol=None, daysub=None):
        """cfg: dict n[app], cap[app], tot, expo. Returns per-season/late stats."""
        seas = defaultdict(lambda: [0.0, 0]); late = [0.0, 0]; dayu = []; per_day = {}
        for g in (daysub or alld):
            used = 0; per = defaultdict(int); pl = defaultdict(int); du = 0.0; ns = 0
            queue = sorted([(i, a, s) for a in apps for i, s in enumerate(ranked[a][:cfg["n"][a]])], key=lambda t: t[0])
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
                    per[a] += 1; used += 1; du += p; ns += 1
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
        rec["rlate"] = late[0] / late[1] if late[1] else np.nan
        return rec

    def rnd():
        n = {a: rng.choice([0, 1, 2, 3, 4, 5, 6]) for a in apps}
        if sum(n.values()) == 0:
            n[rng.choice(apps)] = 2
        cap = {a: rng.choice([1, 2, 3, 4, 6, 99]) for a in apps}
        return dict(n=n, cap=cap, tot=rng.choice([4, 6, 8, 10, 12, 15, 20, 999]), expo=rng.choice([1, 2, 3, 99]))

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
        return "per-app n " + "/".join(f"{a[:2]}{c['n'][a]}" for a in apps) + " cap " + "/".join(f"{a[:2]}{c['cap'][a] if c['cap'][a] < 99 else '-'}" for a in apps) + f" tot {c['tot'] if c['tot'] < 999 else '-'} expo {c['expo'] if c['expo'] < 99 else '-'}"

    def line(r):
        return (f"{desc(r.cfg)}: {r.slips/r.days:.1f}/day | " + " / ".join(f"{100*getattr(r, 'r'+s[2:4]):+.0f}% ({getattr(r, 'n'+s[2:4])})" for s in SEAS)
                + f" | 26-27 before Nov 8 {100*r.r26a:+.0f}% ({r.n26a}) | Nov 8+ {100*r.rlate:+.0f}% ({r.rn}) | dd {r.dd:.0f}u | losing days {100*r.lshare:.0f}% | run {r.drought}")

    # eligible: positive in both prior seasons, enough slips, and validated before Nov 8
    G = R[(R.r24 > 0.2) & (R.r25 > 0.2) & (R.n26a > 30)].copy()
    G["calm"] = G["units"] / G["dd"].clip(lower=1)
    print(f"P3|eligible (both prior seasons > 20%): {len(G):,}", flush=True)
    for title, X in (("best by prior seasons only (weaker season)", G.sort_values("sel", ascending=False)),
                     ("best validation (2026-27 before Nov 8) with prior min 30%", G[G.sel > 0.3].sort_values("r26a", ascending=False)),
                     ("lowest drawdown with prior min 30% and validation positive", G[(G.sel > 0.3) & (G.r26a > 0)].sort_values("dd")),
                     ("lowest losing-day share, same filter", G[(G.sel > 0.3) & (G.r26a > 0)].sort_values("lshare")),
                     ("calmest (units per unit of drawdown), same filter", G[(G.sel > 0.3) & (G.r26a > 0)].sort_values("calm", ascending=False))):
        print(f"P3|== {title} ==", flush=True)
        for r in X.head(8).itertuples():
            print("P3|  " + line(r), flush=True)
    # choose: best by prior seasons + validation, then final test on Nov 8+ untouched
    sel = G[(G.r26a > 0)].copy()
    sel["pick"] = sel["sel"].rank(pct=True) + sel["r26a"].rank(pct=True) - sel["dd"].rank(pct=True) - sel["lshare"].rank(pct=True)
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
    print("P3|DONE", flush=True)


if __name__ == "__main__":
    main()
