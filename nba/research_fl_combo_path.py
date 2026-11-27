"""Option B (2 PP strategies) + what happens when strategies are added one by one (best-scoring each step, no early stop). Prefix CP|."""
import os, sys
os.environ["CB_MODE"] = "streak"; os.environ["CB_SLOTS"] = "12"; os.environ["CB_RAW"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "research_fl_combo.py")).read().replace("\nmain()\n", "\n")
exec(compile(src, "combo", "exec"))
import numpy as np, psycopg
def show(tag, S):
    by = merge(S); m = metrics(by); spd = [len(v) for v in by.values()]
    r = lambda k: f"{m[k]['roi']*100:+.0f}%/run{m[k]['run']}/lose{m[k]['loseP']*100:.0f}%/dd{m[k]['dd']:.0f}" if m[k] else "-"
    print(f"CP|{tag} n={len(S)} slips/day avg {np.mean(spd):.2f} max {max(spd)} | 24 {r('24')} | 25 {r('25')} | 26 {r('26')} | N8 {r('N8')} | units all {m['all']['units']:+.0f}", flush=True)
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True); conn.execute("SET statement_timeout = 0")
C = load(conn)
S = [c for c in C if c["desc"].startswith("flex k6 both regular pb_ret+bline_d none st1 g1 p0 n1")][:1] + [c for c in C if c["desc"].startswith("flex k6 Under regular score+geo none st1 g1 p0 n1")][:1]
print("CP|found", len(S), flush=True)
show("OPTION B", S)
for step in range(int(os.environ.get("CP_STEPS") or 13)):
    top = (-1e9, None)
    for c in C:
        if c in S: continue
        sc = score(metrics(merge(S + [c])))
        if sc > top[0]: top = (sc, c)
    S.append(top[1]); print("CP|added " + top[1]["desc"], flush=True); show(f"+{step+1}", S)
print("CP|done")
