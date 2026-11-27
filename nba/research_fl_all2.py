"""All five apps combined from nba/final_candidates/*.json. RAW day results (no leg-gone scale). Prefix AL|."""
import os, sys, json
from collections import defaultdict
import numpy as np, psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB
SP = "2026-11-08"
SCALE = os.environ.get("SCALE") == "1"
POL = {"prizepicks": "sub", "sleeper": "sub", "betr": "sub", "underdog": "sub", "fliff": "shrink"}
def log(s): print("AL|" + s, flush=True)
def per(g): return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"
def ii(x):
    try: return int(x)
    except Exception: return -1
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
GM = {}
for g, p, q, gid in conn.execute("SELECT game_date::text, player_id, nba_player_id::text, game_id FROM nba_stats.player_game_log WHERE game_id IS NOT NULL AND game_date >= '2024-10-01'").fetchall():
    GM[(g, p)] = gid; GM[(g, q)] = gid
def game(g, x): return GM.get((g, x), ("u", g, x))
def merge(S, pcap, gcap, slots):
    # S: list of (scale, {day: [(profit, legs)]}); returns {day: [(profit_scaled, legs)]}
    by = {}
    for g in sorted({g for _, s in S for g in s}):
        pl = defaultdict(int); gc = defaultdict(int); out = []
        for sc_, s in S:
            for p, legs in s.get(g, []):
                if len(out) >= slots: break
                if any(pl[x] >= pcap for x in legs): continue
                gs = [game(g, x) for x in legs] if gcap < 99 else None
                if gcap < 99 and any(gc[z] + gs.count(z) > gcap for z in set(gs)): continue
                for x in legs: pl[x] += 1
                if gs:
                    for z in gs: gc[z] += 1
                out.append((p * sc_ if SCALE else p, legs))
        if out: by[g] = out
    return by
def metrics(by, extra=None):
    m = {}
    for lab in ("24", "25", "26", "N8", "all"):
        ds = [g for g in sorted(by) if lab == "all" or (g >= SP if lab == "N8" else per(g) == lab)]
        if not ds: m[lab] = None; continue
        u = np.array([sum(by[g]) for g in ds]); n = sum(len(by[g]) if not isinstance(by[g], float) else by[g] for g in ds) if False else None
        m[lab] = ds
    return m
def stats(units, slips, ds):
    if not ds: return None
    u = np.array([units[g] for g in ds]); n = sum(slips[g] for g in ds)
    cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum)); run = best = 0
    for z in u: run = run + 1 if z < 0 else 0; best = max(best, run)
    return dict(days=len(ds), slips=n, units=float(u.sum()), roi=float(u.sum() / n), loseP=float((u < 0).mean()), lose=int((u < 0).sum()), dd=dd, run=best, spd=n / len(ds))
def sel(units, lab):
    return [g for g in sorted(units) if lab == "all" or (g >= SP if lab == "N8" else per(g) == lab)]
FILES = [("PrizePicks", "pp_option2"), ("Underdog", "ud_profileA"), ("Sleeper", "sleeper_A19"), ("Betr", "betr_profileA"), ("Fliff", "fliff_A15")]
AU = {}; AS = {}; BY = {}
for name, f in FILES:
    J = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "final_candidates", f + ".json")))
    app = J["app"]; c = J["controls"]; pc = c.get("player_cap") or 99; gc = c.get("game_cap") or 99; sl = J.get("slots_per_day", 12)
    rows = conn.execute("SELECT tier,side,rk,layer,st,k,start,gcap,pdif,altcap,nsl,days,gone_base,gone_sub,gone_shrink FROM nba_score.ua3 WHERE app=%s AND tag LIKE '%%-n'", (app,)).fetchall()
    idx = {}
    for r in rows:
        key = (r[0], r[1], r[2], r[3], r[4], int(r[5]), ii(r[6]), ii(r[7]), ii(r[8]), ii(r[9]), str(r[10]))
        if key not in idx: idx[key] = (r[11], r[12], r[13], r[14])
    S = []
    for s in J["strategies"]:
        key = (s["tier"], s["side"], s["rk"], s["layer"], s["st"], int(s["k"]), ii(s["start"]), ii(s["gcap"]), ii(s["pdif"]), ii(s["altcap"]), str(s["nsl"]))
        if key not in idx: log(f"MISSING {name} {key}"); continue
        dd, gb, gs, gh = idx[key]; d = RB.parse(dd)
        pol = gh if (app == "fliff" or (app == "underdog" and s["k"] == 5)) else gs
        sc_ = 1.0 if (gb is None or pol is None or float(gb) <= 0) else min(1.0, float(pol) / float(gb))
        S.append((sc_, {g: [(p, frozenset(l)) for p, l in v] for g, v in d.items()}))
    by = merge(S, pc, gc, sl)
    BY[name] = by; u = {g: float(sum(p for p, _ in v)) for g, v in by.items()}; n = {g: len(v) for g, v in by.items()}
    AU[name] = u; AS[name] = n
    log(f"{name} matched {len(S)}/{len(J['strategies'])}")
def line(tag, units, slips):
    out = []
    for lab in ("24", "25", "26", "N8", "all"):
        s = stats(units, slips, sel(units, lab)); out.append(s)
    f = lambda s: "-" if not s else f"{s['roi']*100:+.0f}%"
    s26 = out[2]
    log(f"ROW {tag} | spd {out[4]['spd']:.1f} | 24 {f(out[0])} 25 {f(out[1])} 26 {f(out[2])} N8 {f(out[3])} | run {s26['run']} L{s26['loseP']*100:.0f}% dd {s26['dd']:.0f} units26 {s26['units']:+.0f} unitsall {out[4]['units']:+.0f} days26 {s26['days']} slips26 {s26['slips']}")
for name, _ in FILES: line(name, AU[name], AS[name])
days = sorted(set().union(*[set(v) for v in AU.values()]))
CU = {g: sum(AU[a].get(g, 0) for a in AU) for g in days}; CS = {g: sum(AS[a].get(g, 0) for a in AS) for g in days}
line("COMBINED all 5", CU, CS)
# without Betr, without Fliff
for drop in ("Betr", "Fliff"):
    ks = [a for a in AU if a != drop]
    cu = {g: sum(AU[a].get(g, 0) for a in ks) for g in days}; cs = {g: sum(AS[a].get(g, 0) for a in ks) for g in days}
    line(f"COMBINED without {drop}", cu, cs)
# monthly view 26/27
by_m = defaultdict(lambda: [0.0, 0])
for g in days:
    if per(g) == "26": by_m[g[:7]][0] += CU[g]; by_m[g[:7]][1] += CS[g]
for k, v in sorted(by_m.items()): log(f"MONTH {k} units {v[0]:+.0f} slips {v[1]} roi {v[0]/v[1]*100:+.0f}%")
# worst days
for g in sorted(days, key=lambda g: CU[g])[:5]: log(f"WORST {g} {CU[g]:+.0f} slips {CS[g]}")
ORD = ["Underdog", "PrizePicks", "Sleeper", "Betr", "Fliff"]
for xcap in (99, 14, 12, 10, 8, 6, 5, 4):
    cu = defaultdict(float); cs = defaultdict(int)
    for g in days:
        cnt = defaultdict(int)
        for a in ORD:
            for p, legs in BY[a].get(g, []):
                if xcap < 99 and any(cnt[x] >= xcap for x in legs): continue
                for x in legs: cnt[x] += 1
                cu[g] += p; cs[g] += 1
    line(f"XCAP {xcap} (scale={int(SCALE)})", dict(cu), dict(cs))
# worst player concentration: max slips one player is in, across apps, per day
mx = []
for g in days:
    cnt = defaultdict(int)
    for a in BY:
        for p, legs in BY[a].get(g, []):
            for x in legs: cnt[x] += 1
    mx.append(max(cnt.values()) if cnt else 0)
log(f"EXPOSURE max slips one player appears in on a day: median {int(np.median(mx))} p90 {int(np.percentile(mx,90))} max {max(mx)}")
log("done")
