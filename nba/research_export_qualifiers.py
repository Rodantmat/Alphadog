#!/usr/bin/env python3
"""EXPORT (owner 2026-11-25 22:10 PT): every strategy that qualifies as MAIN (2026-27 ROI >= 25%, positive in the prior seasons, 15+ current slips,
positive without its 5 best) or FALLBACK (2026-27 ROI 0-25%, same support), by app, with ROI per season, 2026-11-08+ separately, and 2026-27 accumulated units.
READ-ONLY. Prints CSV lines prefixed XP|. Sources: nba_score.ua2_strats (own boards; Underdog regular legs only) and nba_score.p31_days (cross-app orders)."""
import csv, io, os, sys
import psycopg
SPLIT = "2026-11-08"
def season(g): return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"
out = csv.writer(sys.stdout, lineterminator="\n")
conn = psycopg.connect(os.environ["DATABASE_URL"])
cols = "app,class,struct,source,strategy,r24,n24,r25,n25,r26,n26,u26,r26pre,n26pre,r26post,n26post,cash,dd,drought,wo5,per_slate".split(",")
def emit(row):
    b = io.StringIO(); csv.writer(b, lineterminator="").writerow(row); print("XP|" + b.getvalue(), flush=True)
emit(cols)
q = """SELECT app, st, k::int, tier, side, rk, layer, gcap::int, pdif::int, altcap::int, start::int, nsl, r24, n24, r25, n25, r26, n26, r26a, n26a, r26b, n26b, cash, dd, drought::int, wo5, per_slate
       FROM nba_score.ua2_strats WHERE rk NOT LIKE 'rnd%%' AND NOT (app = 'underdog' AND tier <> 'regular')"""
seen = set()
for r in conn.execute(q).fetchall():
    (app, st, k, tier, side, rk, layer, gcap, pdif, altcap, start, nsl, r24, n24, r25, n25, r26, n26, r26a, n26a, r26b, n26b, cash, dd, dr, wo5, ps) = r
    if n26 is None or n26 < 15 or r26 is None:
        continue
    udf = r24 is None and r25 is None
    sup = (r26a is not None and r26a > 0) if udf else ((r24 or 0) > 0 and (r25 or 0) > 0 and (r24 is not None) and (r25 is not None))
    if not sup or r26 <= 0:
        continue
    cl = "MAIN" if (r26 >= 0.25 and (wo5 or 0) > 0) else ("FALLBACK" if r26 < 0.25 else None)
    if not cl:
        continue
    desc = f"{tier} {side} {rk} [{layer}] g{gcap}{' pd' if pdif else ''} alt{altcap} #{start} x{nsl}"
    key = (app, st, k, desc)
    if key in seen:
        continue
    seen.add(key)
    emit([app, cl, ("Power" if st == "power" else "Flex") + str(k), "own board", desc, r24, n24, r25, n25, r26, n26, round(r26 * n26, 2), r26a, n26a, r26b, n26b, cash, dd, dr, wo5, ps])
try:
    rows = conn.execute("SELECT app, label, days FROM nba_score.p31_days").fetchall()
except Exception:
    conn.rollback(); rows = []
for app, label, days in rows:
    acc = {s: [0.0, 0] for s in ("24", "25", "26", "pre", "post")}; ds = []
    for t in days.split(";"):
        if not t: continue
        g, u, n = t.split(":"); u = float(u); n = int(n); s = season(g)
        acc[s][0] += u; acc[s][1] += n; ds.append(u)
        if s == "26":
            kk = "post" if g >= SPLIT else "pre"; acc[kk][0] += u; acc[kk][1] += n
    f = lambda s: acc[s][0] / acc[s][1] if acc[s][1] else None
    if acc["26"][1] < 15 or not f("26") or f("26") <= 0:
        continue
    cl = "MAIN" if f("26") >= 0.25 else "FALLBACK"
    cum = 0; pk = 0; dd = 0; run = 0; best = 0
    for u in ds:
        cum += u; pk = max(pk, cum); dd = max(dd, pk - cum); run = run + 1 if u < 0 else 0; best = max(best, run)
    head = label.split(" | ")[0]
    emit([app, cl, ("Power" if head[1] == "P" else "Flex" if head[1] in "FXSD" else head[1]) + head[0] if app != "betr" or head[1] != "D" else "Dynamic" + head[0], "cross-app", label, f("24"), acc["24"][1], f("25"), acc["25"][1], f("26"), acc["26"][1],
          round(acc["26"][0], 2), f("pre"), acc["pre"][1], f("post"), acc["post"][1], None, dd, best, None, None])
print("XP|DONE", flush=True)
