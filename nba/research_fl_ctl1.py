"""Path-from-1 set of N strategies (env N) under the exposure-control grid + set dump. Prefix C1|."""
import os, sys, json, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "research_fl_app.py")).read()
exec(compile(src[:src.index("solo = sorted")], "app", "exec"))
def fmt(m):
    f = lambda k: f"{m[k]['roi']*100:+.0f}%/run{m[k]['run']}/L{m[k]['loseP']*100:.0f}/dd{m[k]['dd']:.0f}" if m[k] else "-"
    return f"24 {f('24')} | 25 {f('25')} | 26 {f('26')} | N8 {f('N8')}"
N = int(os.environ.get("N") or 12)
S = [max(C, key=lambda c: sc([c]))]
while len(S) < N:
    top = (-1e9, None)
    for c in C:
        if c in S: continue
        s2 = sc(S + [c])
        if s2 > top[0]: top = (s2, c)
    S.append(top[1])
print("C1|SET " + json.dumps([dict(ord=i + 1, **s["sig"]) for i, s in enumerate(S)], separators=(",", ":")), flush=True)
for pc, gc, ov, wi in itertools.product((99, 3, 2, 1), (99, 6, 4, 3), (99, 3, 2, 1), (99, 1)):
    by = merge(S, pcap=pc, gcap=gc, ovl=ov, within=wi); m = metrics(by)
    if not m["26"] or not m["N8"]: continue
    spd = np.mean([len(v) for v in by.values()])
    print(f"C1|n={N} pcap={pc} gcap={gc} ovl={ov} within={wi} spd={spd:.2f} | {fmt(m)} | units {m['all']['units']:+.0f}", flush=True)
print("C1|done")
