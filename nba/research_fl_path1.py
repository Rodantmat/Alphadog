"""Greedy path 1..35 strategies for one app (each step adds the best-scoring strategy; same score/floors as research_fl_app.py). Prefix P1|."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "research_fl_app.py")).read()
exec(compile(src[:src.index("solo = sorted")], "app", "exec"))
S = [max(C, key=lambda c: sc([c]))]
def line(S):
    by = merge(S); m = metrics(by); spd = [len(v) for v in by.values()]
    f = lambda k: f"{m[k]['roi']*100:+.0f}%/run{m[k]['run']}/L{m[k]['loseP']*100:.0f}/dd{m[k]['dd']:.0f}" if m[k] else "-"
    ok = "FLOORS" if m["26"] and m["N8"] and m["26"]["roi"] >= .7 and m["N8"]["roi"] >= .5 and (not m["25"] or m["25"]["roi"] >= .5) else "below"
    print(f"P1|{APP} n={len(S)} {ok} spd {np.mean(spd):.2f}/{max(spd)} | 24 {f('24')} | 25 {f('25')} | 26 {f('26')} | N8 {f('N8')} | units {m['all']['units']:+.0f}", flush=True)
line(S)
while len(S) < 35:
    top = (-1e9, None)
    for c in C:
        if c in S: continue
        s2 = sc(S + [c])
        if s2 > top[0]: top = (s2, c)
    if top[1] is None: break
    S.append(top[1]); line(S)
print("P1|done")
