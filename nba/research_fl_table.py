"""per-app table of every research strategy that holds positive ROI (owner 2026-11-26 21:52 PT). Prefix TB|.
Day results = ua3 '-n' rows; app player cap inside the strategy; leg-gone policy (sub/shrink) applied as the stored per-slip delta; checks V1-V4 printed as TBV|."""
import json, os, sys, hashlib
from collections import defaultdict
import numpy as np
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB

CAP = dict(prizepicks=3, underdog=99, sleeper=2, fliff=2, betr=1)
PER = [("24", lambda g: g < "2025-07-01"), ("25", lambda g: "2025-07-01" <= g < "2026-07-01"), ("26", lambda g: g >= "2026-07-01"), ("N8", lambda g: g >= "2026-11-08")]
rng = np.random.default_rng(7)


def pol(app, k):
    return "shrink" if app == "fliff" or (app == "underdog" and k == 5) else "sub"


def run(conn, app):
    rows = conn.execute("SELECT tier,side,rk,layer,st,k,start,gcap,pdif,altcap,nsl,n,roi,dd,drought,gone_n,gone_base,gone_sub,gone_shrink,days FROM nba_score.ua3 WHERE app=%s AND tag LIKE '%%-n'", (app,)).fetchall()
    seen = {}; dup = 0; out = []; v1 = []
    for r in rows:
        h = hashlib.md5(r[19].encode()).hexdigest()
        if h in seen:
            dup += 1; continue
        seen[h] = 1
        d = RB.parse(r[19]); k = int(r[5])
        s0 = RB.stats(d, cap=99)
        if not s0:
            continue
        v1.append((abs(s0["units"] / s0["slips"] - r[12]) if r[12] is not None else 0, abs(s0["dd"] - r[13]) if r[13] is not None else 0))
        # capped, per day profits
        dayp = {}; legsn = 0
        for g in sorted(d):
            pl = defaultdict(int); u = []; 
            for p, legs in d[g]:
                if any(pl[x] >= CAP[app] for x in legs):
                    continue
                for x in legs: pl[x] += 1
                u.append(p)
            if u: dayp[g] = u
        n = sum(len(v) for v in dayp.values())
        if n < 30:
            continue
        adj = 0.0; gn = r[15]
        if gn and r[16] is not None:
            pv = r[17] if pol(app, k) == "sub" else r[18]
            if pv is not None:
                adj = (pv - r[16]) * gn / max(1, s0["slips"])   # per-slip delta, spread evenly
        res = dict(app=app, code="", desc=f"{r[4]} k{k} {r[1]} {r[0]} {r[2]} {r[3]} st{r[6]} g{r[7]} p{r[8]} n{r[10]}", pol=pol(app, k), adj=round(adj, 4), gone_n=gn)
        allu = []
        for lab, f in PER:
            ds = [g for g in dayp if f(g)]
            nn = sum(len(dayp[g]) for g in ds); uu = sum(sum(dayp[g]) + adj * len(dayp[g]) for g in ds)
            du = np.array([sum(dayp[g]) + adj * len(dayp[g]) for g in sorted(ds)])
            res["n" + lab] = nn; res["u" + lab] = round(uu, 2); res["r" + lab] = round(uu / nn, 4) if nn else None
            res["days" + lab] = len(ds); res["lose" + lab] = round(float((du < 0).mean()), 3) if len(du) else None
        D = np.array([sum(dayp[g]) + adj * len(dayp[g]) for g in sorted(dayp)])
        cum = np.cumsum(D); res["dd"] = round(float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum)), 2)
        run_ = best = 0
        for z in D:
            run_ = run_ + 1 if z < 0 else 0; best = max(best, run_)
        res["streak"] = best; res["units"] = round(float(D.sum()), 2); res["slips"] = n
        bs = rng.choice(D, (2000, len(D))).sum(1); res["boot"] = round(float((bs > 0).mean()), 3)
        out.append(res)
        # V2 season sum identity
        assert abs(sum(res["u" + p] for p in ("24", "25", "26")) - res["units"]) < 0.05, "season sum"
    print(f"TBV|{app} rows {len(rows)} dup-collapsed {dup} kept(>=30 slips) {len(out)} | V1 max|roi diff| {max(a for a,_ in v1):.4f} max|dd diff| {max(b for _,b in v1):.3f} (uncapped recompute vs stored)", flush=True)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    for app in ("prizepicks", "underdog", "sleeper", "fliff", "betr"):
        for r in run(conn, app):
            print("TB|" + json.dumps(r, separators=(",", ":")), flush=True)
    print("TBV|done", flush=True)


main()
