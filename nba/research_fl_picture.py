"""the full picture of the final set per app (research numbers, every season) + the search for Sleeper sets that are positive in every period with a low drawdown.
Research numbers = ua3 day results ('-n' rows, the honest-rebuild research board). Printed as PIC| lines."""
import json, os, sys, itertools
from collections import defaultdict
import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_best as RB

SPLIT = "2026-11-08"
FINAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "final_set.json")))


def log(s):
    print("PIC|" + s, flush=True)


def per(g):
    return "24-25" if g < "2025-07-01" else "25-26" if g < "2026-07-01" else ("26-27 to Nov 7" if g < SPLIT else "26-27 Nov 8+")


def ref(conn, sg):
    q = """SELECT days FROM nba_score.ua3 WHERE tag LIKE '%%-n' AND app = %s AND tier = %s AND side = %s AND rk = %s AND layer = %s AND st = %s AND k = %s AND start = %s AND nsl = %s
           AND (gcap = %s OR %s < 0) AND (pdif = %s OR %s < 0) AND (altcap = %s OR %s < 0) LIMIT 1"""
    r = conn.execute(q, (sg["app"], sg["tier"], sg["side"], sg["rk"], sg["layer"], sg["st"], sg["k"], sg["start"], sg["nsl"], sg["gcap"], sg["gcap"], sg["pdif"], sg["pdif"], sg["altcap"], sg["altcap"])).fetchone()
    return RB.parse(r[0]) if r else None


def merge_set(strats, slots, cap):
    """per day, in the set's order: add a slip while the app has slots and no player is over the cap"""
    out = defaultdict(list)
    for g in sorted({g for s in strats for g in s}):
        pl = defaultdict(int); n = 0
        for s in strats:
            for p, legs in s.get(g, []):
                if n >= slots or any(pl[x] >= cap for x in legs):
                    continue
                for x in legs:
                    pl[x] += 1
                n += 1; out[g].append(p)
    return out


def table(name, byday):
    """period table from {date: [profit per slip]}"""
    rows = []
    groups = [("24-25", lambda g: g < "2025-07-01"), ("25-26", lambda g: "2025-07-01" <= g < "2026-07-01"), ("26-27 to Nov 7", lambda g: "2026-07-01" <= g < SPLIT),
              ("26-27 Nov 8+", lambda g: g >= SPLIT), ("26-27 all", lambda g: g >= "2026-07-01"), ("ALL", lambda g: True)]
    for lab, f in groups:
        ds = [g for g in sorted(byday) if f(g)]
        if not ds:
            rows.append(f"{name:10s} {lab:15s} -"); continue
        u = np.array([sum(byday[g]) for g in ds]); n = sum(len(byday[g]) for g in ds)
        cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        run = best = 0
        for z in u:
            run = run + 1 if z < 0 else 0; best = max(best, run)
        rows.append(f"{name:10s} {lab:15s} slates {len(ds):3d} slips {n:4d} ({n/len(ds):.1f}/slate) units {u.sum():+8.1f} ROI {100*u.sum()/n:+6.1f}% maxDD {dd:5.1f}u longest losing run {best} slates losing slates {100*(u<0).mean():.0f}%")
    for r in rows:
        log(r)


def candidates(conn, app, min_slips=60):
    """every research strategy of the app (honest-rebuild rows) with its fields, day results and stats (player cap 2 inside a strategy)"""
    rows = conn.execute("SELECT DISTINCT ON (tier, side, rk, layer, st, k, start, gcap, pdif, altcap, nsl) tier, side, rk, layer, st, k, start, gcap, pdif, altcap, nsl, days FROM nba_score.ua3 WHERE app = %s AND tag LIKE '%%-n'", (app,)).fetchall()
    out = []
    for r in rows:
        d = RB.parse(r[11])
        s = RB.stats(d, cap=2)
        if not s or s["slips"] < min_slips:
            continue
        out.append(dict(sig=f"{r[4]} k{r[5]} {r[1]} {r[0]} {r[2]} {r[3]} st{r[6]} g{r[7]} p{r[8]} n{r[10]}", day=d,
                        sg=dict(app=app, role="main", tier=r[0], side=r[1], rk=r[2], layer=r[3], st=r[4], k=int(r[5]), start=int(r[6]), gcap=int(r[7]), pdif=int(r[8]), altcap=int(r[9]), nsl=str(r[10])),
                        **{k: v for k, v in s.items() if k != "dayu"}))
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    sets = defaultdict(list)
    for sg in FINAL["set"]:
        d = ref(conn, sg)
        if d is None:
            log(f"NO ref row for {sg['code']}"); continue
        sets[sg["app"]].append((sg, d))
    for app in ("prizepicks", "underdog", "sleeper", "fliff", "betr"):
        st = [d for _, d in sets[app]]
        by = merge_set(st, FINAL["slots"][app], FINAL["caps"][app])
        table(app, by)
        # accumulated ROI curve at each month end
        acc = defaultdict(lambda: [0.0, 0])
        run_u = run_n = 0
        for g in sorted(by):
            run_u += sum(by[g]); run_n += len(by[g]); acc[g[:7]] = [run_u, run_n]
        log(f"{app} accumulated ROI at month end: " + ", ".join(f"{m} {100*u/n:+.1f}% ({u:+.0f}u)" for m, (u, n) in sorted(acc.items())))
    # ---- Sleeper search
    cands = candidates(conn, "sleeper")
    log(f"sleeper candidates with >=60 slips: {len(cands)}")

    def period_ok(by, upto=None):
        res = {}
        for lab, f in (("24", lambda g: g < "2025-07-01"), ("25", lambda g: "2025-07-01" <= g < "2026-07-01"), ("26a", lambda g: "2026-07-01" <= g < SPLIT), ("26b", lambda g: g >= SPLIT)):
            ds = [g for g in by if f(g) and (upto is None or g < upto)]
            n = sum(len(by[g]) for g in ds); res[lab] = (sum(sum(by[g]) for g in ds) / n if n else np.nan, n)
        return res

    def score(by, upto=None):
        ds = [g for g in sorted(by) if upto is None or g < upto]
        if not ds:
            return -9, None
        u = np.array([sum(by[g]) for g in ds]); cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        pr = period_ok(by, upto)
        pos = all((v[0] > 0) for k, v in pr.items() if v[1] >= 5 and (upto is None or k != "26b"))
        return (u.sum() / (dd + 2)) * (1 if pos else 0.0), (u.sum(), dd, pr)

    for label, upto in (("all data (in-sample)", None), ("walk-forward: chosen on data before Nov 8, then tested on Nov 8+", SPLIT)):
        chosen, cur = [], None
        for _ in range(5):
            best = (None, -9)
            for c in cands:
                if c in chosen:
                    continue
                by = merge_set([x["day"] for x in chosen + [c]], 5, 2)
                sc, _ = score(by, upto)
                if sc > best[1]:
                    best = (c, sc)
            if best[0] is None or best[1] <= (cur if cur is not None else -9):
                break
            chosen.append(best[0]); cur = best[1]
        by = merge_set([x["day"] for x in chosen], 5, 2)
        log(f"SLEEPER SEARCH {label}: {len(chosen)} strategies")
        for c in chosen:
            log("   " + c["sig"])
        table("sleeper*", by)
        if upto:
            log("   (rows 'Nov 8+' above are out-of-sample)")
    log("done")


if __name__ == "__main__":
    main()
