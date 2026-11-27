"""PP 15-25 strategy sets (raw greedy path, 12 slips) under correlation / exposure controls: player cap, game cap (legs of one game across the day), slip-overlap cap, same-game legs inside one slip. Prefix CT|."""
import os, sys, itertools
os.environ["CB_MODE"] = "streak"; os.environ["CB_SLOTS"] = "12"; os.environ["CB_RAW"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "research_fl_combo.py")).read().replace("\nmain()\n", "\n")
exec(compile(src, "combo", "exec"))
import numpy as np, psycopg
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
C = load(conn)
S = [c for c in C if c["desc"].startswith("flex k6 both regular pb_ret+bline_d none st1 g1 p0 n1")][:1] + [c for c in C if c["desc"].startswith("flex k6 Under regular score+geo none st1 g1 p0 n1")][:1]
while len(S) < 25:
    top = (-1e9, None)
    for c in C:
        if c in S: continue
        sc = score(metrics(merge(S + [c])))
        if sc > top[0]: top = (sc, c)
    S.append(top[1])
print(f"CT|path built {len(S)}", flush=True)
# game map
GM = {}
for g, p, gid in conn.execute("SELECT game_date::text, player_id::text, game_id FROM nba_score.board_scored_v2 WHERE app='prizepicks' AND game_id IS NOT NULL").fetchall():
    GM[(g, p)] = gid
legs_all = {(g, x) for s in S for g, v in s["day"].items() for _, l in v for x in l}
cov = sum(1 for k in legs_all if k in GM) / max(1, len(legs_all))
print(f"CT|game map coverage {cov:.3f} of {len(legs_all)} day-legs (sample leg {next(iter(legs_all))})", flush=True)
def game(g, x): return GM.get((g, x), ("u", g, x))
def merge_ctl(S, pcap, gcap, ovl, within):
    by = {}; gl = {}
    for g in sorted({g for s in S for g in s["day"]}):
        pl = defaultdict(int); gc = defaultdict(int); out = []; taken = []; ng = 0
        for s in S:
            for p, legs in s["day"].get(g, []):
                if len(out) >= 12: break
                if any(pl[x] >= pcap for x in legs): continue
                gs = [game(g, x) for x in legs]
                if within < 99 and max(gs.count(z) for z in set(gs)) > within: continue
                if gcap < 99 and any(gc[z] + gs.count(z) > gcap for z in set(gs)): continue
                if ovl < 99 and any(len(legs & t) > ovl for t in taken): continue
                for x in legs: pl[x] += 1
                for z in gs: gc[z] += 1
                taken.append(legs); out.append(p)
        if out: by[g] = out; gl[g] = max(gc.values()) if gc else 0
    return by
def row(n, pc, gc, ov, wi):
    by = merge_ctl(S[:n], pc, gc, ov, wi); m = metrics(by)
    if not all(m[k] for k in ("24", "25", "26", "N8")): return None
    spd = np.mean([len(v) for v in by.values()])
    f = lambda k: f"{m[k]['roi']*100:+.0f}%/r{m[k]['run']}/L{m[k]['loseP']*100:.0f}"
    return f"CT|n={n} pcap={pc} gcap={gc} ovl={ov} within={wi} spd={spd:.1f} | 24 {f('24')} | 25 {f('25')} | 26 {f('26')} | N8 {f('N8')} | dd25 {m['25']['dd']:.0f} dd26 {m['26']['dd']:.0f} | units {m['all']['units']:+.0f}"
for n in range(15, 26):
    for pc, gc, ov, wi in itertools.product((3, 2, 1), (99, 6, 4, 3), (99, 3, 2, 1), (99, 1)):
        r = row(n, pc, gc, ov, wi)
        if r: print(r, flush=True)
print("CT|done")
