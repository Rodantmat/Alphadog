"""PrizePicks combination search (owner 22:20 PT): <=8 slips/day, player cap 3, <=3 losing days in 2026-27, 25-26 close, 24-25 similar, max ROI. Prefix CB|. Research board, in-sample."""
import os, sys, json
from collections import defaultdict
import numpy as np
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB
SLOTS, CAP = int(os.environ.get("CB_SLOTS") or 8), 3
SP = "2026-11-08"
def log(s): print("CB|" + s, flush=True)
def per(g): return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"

def load(conn):
    rows = conn.execute("SELECT tier,side,rk,layer,st,k,start,gcap,pdif,nsl,gone_base,gone_sub,gone_shrink,days FROM nba_score.ua3 WHERE app='prizepicks' AND tag LIKE '%-n'").fetchall()
    seen = set(); C = []
    for r in rows:
        if r[13] in seen or not r[10] or r[10] <= 0 or r[11] is None: continue
        seen.add(r[13]); a = r[11] / r[10]
        if a <= 0: continue
        a = min(a, 1.0); d = RB.parse(r[13])
        C.append(dict(desc=f"{r[4]} k{int(r[5])} {r[1]} {r[0]} {r[2]} {r[3]} st{int(r[6])} g{int(r[7])} p{int(r[8])} n{r[9]}", a=a, day={g: [(p * a, frozenset(l)) for p, l in v] for g, v in d.items()}))
    return C

def merge(S):
    by = {}
    for g in sorted({g for s in S for g in s["day"]}):
        pl = defaultdict(int); out = []
        for s in S:
            for p, legs in s["day"].get(g, []):
                if len(out) >= SLOTS: break
                if any(pl[x] >= CAP for x in legs): continue
                for x in legs: pl[x] += 1
                out.append(p)
        if out: by[g] = out
    return by

def metrics(by):
    m = {}
    for lab in ("24", "25", "26", "N8", "all"):
        ds = [g for g in sorted(by) if lab == "all" or (g >= SP if lab == "N8" else per(g) == lab)]
        if not ds: m[lab] = None; continue
        u = np.array([sum(by[g]) for g in ds]); n = sum(len(by[g]) for g in ds)
        cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum)); run = best = 0
        for z in u: run = run + 1 if z < 0 else 0; best = max(best, run)
        m[lab] = dict(days=len(ds), slips=n, units=float(u.sum()), roi=float(u.sum() / n), lose=int((u < 0).sum()), loseP=float((u < 0).mean()), dd=dd, run=best)
    return m

def score(m):
    if not m["26"] or not m["25"] or not m["24"]: return -9
    if m["26"]["lose"] > 3: return -9 + 0.01 * (3 - m["26"]["lose"])
    pen = max(0, m["25"]["loseP"] - (m["26"]["loseP"] + 0.05)) + 0.5 * max(0, m["24"]["loseP"] - (m["26"]["loseP"] + 0.12))
    if min(m["24"]["roi"], m["25"]["roi"], m["26"]["roi"]) <= 0: return -5
    return float(np.mean([m[x]["roi"] for x in ("24", "25", "26")])) - 2.0 * pen

def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
    C = load(conn); log(f"candidates {len(C)}")
    solo = sorted(C, key=lambda c: -score(metrics(merge([c]))))[:int(os.environ.get("CB_SEEDS") or 15)]
    best = (-99, None, None)
    for seed in solo:
        S = [seed]; cur = score(metrics(merge(S)))
        for _ in range(12):
            top = (cur, None)
            for c in C:
                if c in S: continue
                sc = score(metrics(merge(S + [c])))
                if sc > top[0] + 1e-9: top = (sc, c)
            if top[1] is None: break
            S.append(top[1]); cur = top[0]
        m = metrics(merge(S)); log(f"seed {seed['desc'][:40]} -> {len(S)} strategies score {cur:.4f} lose26 {m['26']['lose'] if m['26'] else '-'}")
        if cur > best[0]: best = (cur, S, m)
    sc, S, m = best
    log(f"BEST score {sc:.4f} strategies {len(S)}")
    for i, s in enumerate(S, 1): log(f"STRAT {i} scale {s['a']:.3f} {s['desc']}")
    for lab in ("24", "25", "26", "N8", "all"):
        x = m[lab]; log(f"RES {lab} " + (json.dumps({k: round(v, 4) for k, v in x.items()}) if x else "-"))
    by = merge(S); acc = 0; mo = defaultdict(float)
    for g in sorted(by): mo[g[:7]] += sum(by[g])
    log("MONTHLY " + json.dumps({k: round(v, 1) for k, v in mo.items()}))
    log("DAYS26 " + json.dumps({g: round(sum(v), 2) for g, v in by.items() if g >= "2026-07-01"}))
    # robustness: same strategies, caps 2/slots 6 and 8 with no cap
    for sl, cp in ((6, 3), (8, 2), (8, 99)):
        global SLOTS, CAP
        o = (SLOTS, CAP); SLOTS, CAP = sl, cp; mm = metrics(merge(S)); SLOTS, CAP = o
        log(f"ROBUST slots{sl} cap{cp} " + " ".join(f"{k}:roi{mm[k]['roi']:+.3f}/lose{mm[k]['lose']}" for k in ("24", "25", "26") if mm[k]))
    log("done")
main()
