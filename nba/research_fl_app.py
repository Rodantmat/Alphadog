"""One-app combination study (PrizePicks / Underdog): (1) seeded greedy best combination (streak mode, floors), (2) path of added strategies up to 35, (3) exposure-control grid for 15..25 strategies. RAW day results (no leg-gone scale). Env APP, SLOTS(12), BASECAP(3). Prefix AP|."""
import os, sys, json, itertools
from collections import defaultdict
import numpy as np, psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB
APP = os.environ.get("APP") or "prizepicks"; SLOTS = int(os.environ.get("SLOTS") or 12); BASECAP = int(os.environ.get("BASECAP") or 3)
SP = "2026-11-08"
def log(s): print("AP|" + s, flush=True)
def per(g): return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"
def ii(x):
    try: return int(x)
    except Exception: return -1
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
rows = conn.execute("SELECT tier,side,rk,layer,st,k,start,gcap,pdif,altcap,nsl,days FROM nba_score.ua3 WHERE app=%s AND tag LIKE '%%-n'", (APP,)).fetchall()
C = []; seen = set()
for r in rows:
    if r[11] in seen: continue
    seen.add(r[11])
    if APP == "underdog" and r[4] == "power" and int(r[5]) > 2: continue   # owner rule: nothing above 2 picks on Underdog is Power
    d = RB.parse(r[11])
    C.append(dict(desc=f"{r[4]} k{int(r[5])} {r[1]} {r[0]} {r[2]} {r[3]} st{ii(r[6])} g{ii(r[7])} p{ii(r[8])} n{r[10]}",
                  sig=dict(app=APP, tier=r[0], side=r[1], rk=r[2], layer=r[3], st=r[4], k=int(r[5]), start=ii(r[6]), gcap=ii(r[7]), pdif=ii(r[8]), altcap=ii(r[9]), nsl=str(r[10])),
                  day={g: [(p, frozenset(l)) for p, l in v] for g, v in d.items()}))
log(f"{APP} candidates {len(C)}")
GM = {}
for g, p, q, gid in conn.execute("SELECT game_date::text, player_id, nba_player_id::text, game_id FROM nba_stats.player_game_log WHERE game_id IS NOT NULL AND game_date >= '2024-10-01'").fetchall():
    GM[(g, p)] = gid; GM[(g, q)] = gid
def game(g, x): return GM.get((g, x), ("u", g, x))

def merge(S, pcap=BASECAP, gcap=99, ovl=99, within=99):
    by = {}
    for g in sorted({g for s in S for g in s["day"]}):
        pl = defaultdict(int); gc = defaultdict(int); out = []; taken = []
        for s in S:
            for p, legs in s["day"].get(g, []):
                if len(out) >= SLOTS: break
                if any(pl[x] >= pcap for x in legs): continue
                gs = [game(g, x) for x in legs] if (gcap < 99 or within < 99) else None
                if within < 99 and max(gs.count(z) for z in set(gs)) > within: continue
                if gcap < 99 and any(gc[z] + gs.count(z) > gcap for z in set(gs)): continue
                if ovl < 99 and any(len(legs & t) > ovl for t in taken): continue
                for x in legs: pl[x] += 1
                if gs:
                    for z in gs: gc[z] += 1
                taken.append(legs); out.append(p)
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
    if not m["26"] or not m["N8"]: return -99
    v = max(0, .7 - m["26"]["roi"]) + max(0, .5 - m["N8"]["roi"])
    if m["25"]: v += max(0, .5 - m["25"]["roi"])
    if m["24"]: v += max(0, -m["24"]["roi"])
    run = max(m[x]["run"] for x in ("24", "25", "26") if m[x])
    if v > 0: return -10 * v - 0.01 * run
    return 100 - run - 0.1 * m["26"]["run"] + 0.01 * (m["26"]["roi"] + (m["25"]["roi"] if m["25"] else 0))

def sc(S, **kw): return score(metrics(merge(S, **kw)))
solo = sorted(C, key=lambda c: -sc([c]))[:25]
best = (-1e9, None)
for seed in solo:
    S = [seed]; cur = sc(S)
    for _ in range(12):
        top = (cur, None)
        for c in C:
            if c in S: continue
            s2 = sc(S + [c])
            if s2 > top[0] + 1e-9: top = (s2, c)
        if top[1] is None: break
        S.append(top[1]); cur = top[0]
    if cur > best[0]: best = (cur, S)
S = list(best[1]); log(f"seeded greedy best: {len(S)} strategies, score {best[0]:.3f}")
def fmt(m):
    f = lambda k: f"{m[k]['roi']*100:+.0f}%/run{m[k]['run']}/L{m[k]['loseP']*100:.0f}/dd{m[k]['dd']:.0f}" if m[k] else "-"
    return f"24 {f('24')} | 25 {f('25')} | 26 {f('26')} | N8 {f('N8')}"
def show(tag, S, **kw):
    by = merge(S, **kw); m = metrics(by); spd = [len(v) for v in by.values()]
    log(f"{tag} n={len(S)} spd {np.mean(spd):.2f} max {max(spd)} | {fmt(m)} | units all {m['all']['units']:+.0f} 26 {m['26']['units'] if m['26'] else 0:+.0f}")
show("SEED", S)
while len(S) < 35:
    top = (-1e9, None)
    for c in C:
        if c in S: continue
        s2 = sc(S + [c])
        if s2 > top[0]: top = (s2, c)
    S.append(top[1]); show("PATH", S)
json.dump([dict(ord=i + 1, desc=s["desc"], **s["sig"]) for i, s in enumerate(S)], open("/tmp/ap_set.json", "w"))
print("AP|SET " + json.dumps([dict(ord=i + 1, **s["sig"]) for i, s in enumerate(S)], separators=(",", ":")), flush=True)
legs_all = {(g, x) for s in S[:25] for g, v in s["day"].items() for _, l in v for x in l}
log(f"game map coverage {sum(1 for k in legs_all if k in GM) / max(1, len(legs_all)):.3f}")
PC = (99, 3, 2, 1) if APP == "underdog" else (3, 2, 1)
for n in range(15, 26):
    for pc, gc, ov, wi in itertools.product(PC, (99, 6, 4, 3), (99, 3, 2, 1), (99, 1)):
        m = metrics(merge(S[:n], pcap=pc, gcap=gc, ovl=ov, within=wi))
        if not m["26"] or not m["N8"]: continue
        spd = np.mean([len(v) for v in merge(S[:n], pcap=pc, gcap=gc, ovl=ov, within=wi).values()])
        log(f"CTL n={n} pcap={pc} gcap={gc} ovl={ov} within={wi} spd={spd:.1f} | {fmt(m)} | units {m['all']['units']:+.0f}")
log("done")
