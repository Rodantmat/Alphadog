"""Per-strategy and per-app report of the DEPLOYED set (final_set.json): research numbers by season from nba_score.ua3 (raw, no leg-gone rule), standalone and merged
(player cap, game cap, slots). Prefix SR| (strategy), SA| (app merged). Read-only."""
import os, sys, json
from collections import defaultdict
import numpy as np, psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB

HERE = os.path.dirname(os.path.abspath(__file__))
FS = json.load(open(os.path.join(HERE, "final_set.json")))
SET = FS["set"]; CAPS = FS["caps"]; GC = FS["gcaps"]; SLOTS = FS["slots"]
N8 = "2026-11-08"
def log(t, o): print(t + "|" + json.dumps(o), flush=True)
def per(g): return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"

def stats(by):
    """by: {date: [profit,...]} -> dict of season / Nov8 metrics"""
    out = {}
    for lab in ("24", "25", "26", "N8"):
        ds = [g for g in sorted(by) if (g >= N8 if lab == "N8" else per(g) == lab)]
        n = sum(len(by[g]) for g in ds)
        if not n: out[lab] = None; continue
        u = [sum(by[g]) for g in ds]; cum = np.cumsum(u)
        dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        run = best = 0
        for z in u: run = run + 1 if z < 0 else 0; best = max(best, run)
        out[lab] = dict(days=len(ds), n=n, u=round(float(sum(u)), 1), roi=round(float(sum(u)) / n * 100, 1), dd=round(dd, 1), lrun=best, lose=round(float(np.mean([z < 0 for z in u])) * 100))
    return out

def slip_run(by):
    seq = [p for g in sorted(by) for p in by[g]]
    run = best = 0
    for p in seq: run = run + 1 if p < 0 else 0; best = max(best, run)
    return best

def main():
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("SET statement_timeout = 0")
        GM = {}
        for g, p, q, gid in conn.execute("SELECT game_date::text, player_id, nba_player_id::text, game_id FROM nba_stats.player_game_log WHERE game_id IS NOT NULL AND game_date >= '2024-10-01'").fetchall():
            GM[(g, str(p))] = gid; GM[(g, q)] = gid
        refs = {}
        for sg in SET:
            r = conn.execute("""SELECT days FROM nba_score.ua3 WHERE tag LIKE '%%-n' AND app=%s AND tier=%s AND side=%s AND rk=%s AND layer=%s AND st=%s AND k=%s AND start=%s AND nsl=%s
               AND (gcap=%s OR %s<0) AND (pdif=%s OR %s<0) AND (altcap=%s OR %s<0) LIMIT 1""",
               (sg["app"], sg["tier"], sg["side"], sg["rk"], sg["layer"], sg["st"], sg["k"], sg["start"], sg["nsl"], sg["gcap"], sg["gcap"], sg["pdif"], sg["pdif"], sg["altcap"], sg["altcap"])).fetchone()
            refs[sg["code"]] = RB.parse(r[0]) if r else None
    for sg in SET:
        rd = refs[sg["code"]]
        if rd is None: log("SR", dict(app=sg["app"], code=sg["code"], missing=True)); continue
        by = {g: [p for p, _ in v] for g, v in rd.items() if v}
        log("SR", dict(app=sg["app"], code=sg["code"], desc=f'{sg["st"]} k{sg["k"]} {sg["side"]} {sg["tier"]} {sg["rk"]} {sg["layer"]} st{sg["start"]} n{sg["nsl"]}', s=stats(by), slipRun=slip_run(by)))
    for app in CAPS:
        order = [s["code"] for s in SET if s["app"] == app]
        dates = sorted({g for c in order if refs[c] for g in refs[c]})
        by = {}; byc = defaultdict(lambda: defaultdict(list))
        for g in dates:
            cnt = defaultdict(int); gc = defaultdict(int); out = []
            for c in order:
                for p, legs in (refs[c] or {}).get(g, []):
                    if len(out) >= SLOTS[app]: break
                    pl = [str(x) for x in legs]
                    if any(cnt[x] >= CAPS[app] for x in pl): continue
                    gs = [GM.get((g, x), "?" + x) for x in pl]
                    if GC[app] < 99 and any(gc[z] + gs.count(z) > GC[app] for z in set(gs)): continue
                    for x in pl: cnt[x] += 1
                    for z in gs: gc[z] += 1
                    out.append(p); byc[c][g].append(p)
            if out: by[g] = out
        log("SA", dict(app=app, s=stats(by), slipRun=slip_run(by), perday=round(float(np.mean([len(v) for v in by.values()])), 1)))
        for c in order:
            log("SM", dict(app=app, code=c, s=stats(dict(byc[c])) if byc[c] else None))

main()
