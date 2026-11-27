"""Sleeper: which strategies are positive with a low drawdown on the numbers the live pipeline really produces?
Candidates = research strategies that are positive in every research period (plus the 9 of the final set); each is rebuilt on every Sleeper slate of the current season from production numbers
(board_scored, models fitted on the months before), graded, then sets are searched on those results. Printed as C5| lines."""
import os, sys, json
from collections import defaultdict
import numpy as np
os.environ.setdefault("FL_APP", "sleeper")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import final_live as FL
import research_fl_picture as PIC
import research_best as RB

APP = FL.APP
SPLIT = "2026-11-08"


def log(s):
    print("C5|" + s, flush=True)


def jscore(by, need_both=True):
    ds = sorted(by)
    if not ds:
        return -9.0
    u = np.array([sum(by[g]) for g in ds]); cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
    for f in (lambda g: g < SPLIT, lambda g: g >= SPLIT):
        sel = [g for g in ds if f(g)]
        n = sum(len(by[g]) for g in sel)
        if n >= 8 and sum(sum(by[g]) for g in sel) <= 0:
            return -1.0
    return float(u.sum()) / (dd + 2)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    cands = PIC.candidates(conn, APP, 60)
    fin = {sg["code"]: sg for sg in FL.FINAL["set"] if sg["app"] == APP}
    pool = []
    for c in cands:
        d = c["day"]
        pre = [(p) for g in d if "2026-07-01" <= g < SPLIT for p, _ in d[g]]
        r24 = [p for g in d if g < "2025-07-01" for p, _ in d[g]]; r25 = [p for g in d if "2025-07-01" <= g < "2026-07-01" for p, _ in d[g]]
        post = [p for g in d if g >= SPLIT for p, _ in d[g]]
        ok = c["units"] > 0 and (not r24 or np.mean(r24) > 0) and (not r25 or np.mean(r25) > 0) and (len(pre) < 5 or np.mean(pre) > 0) and (len(post) < 5 or np.mean(post) > 0)
        if ok:
            pool.append(c)
    pool.sort(key=lambda c: -(c["units"] / (c["dd"] + 2) * (1 - c["ls"])))
    pool = pool[:70]
    log(f"research candidates {len(cands)}, positive in every research period {len(pool)} (top 70 by units/drawdown kept)")
    strategies = []
    for i, c in enumerate(pool):
        sg = dict(c["sg"]); sg["code"] = f"X{i:02d}"; sg["sig"] = c["sig"]; sg["res"] = c["day"]
        strategies.append(sg)
    for code, sg in fin.items():
        s2 = dict(sg); s2["sig"] = "FINAL " + code + f" {sg['st']} k{sg['k']} {sg['side']} {sg['tier']} {sg['rk']} {sg['layer']}"; s2["res"] = PIC.ref(conn, sg) or {}
        strategies.append(s2)
    import sleeper_live_slip_engine as SL
    slp = SL.pricing(conn) if APP == "sleeper" else None
    dates = [r[0] for r in conn.execute("SELECT DISTINCT game_date::text FROM nba_score.board_scored WHERE app = %s AND game_date < '2026-11-26' ORDER BY 1", (APP,)).fetchall()]
    res = defaultdict(lambda: defaultdict(list)); ung = defaultdict(int)
    for gd in dates:
        d = FL.frame_for(conn, gd, "h")
        if d is None or not len(d):
            log(f"{gd}: no frame"); continue
        for sg in strategies:
            try:
                sl = FL.materialize(d, sg)
            except Exception as e:  # noqa: BLE001
                log(f"{gd} {sg['code']}: {e}"); continue
            for s in sl:
                rows = [d.loc[i].to_dict() | {"_i": i} for i in s]
                p = FL.grade(rows, sg["st"], sg["k"], slp)
                if p is None:
                    ung[sg["code"]] += 1; continue
                res[sg["code"]][gd].append((float(p), {r["player_id"] for r in rows}))
        log(f"{gd}: done")
    log("production-number results per strategy, current season (units, slips, ROI) | research same strategy (units, slips, ROI) over the same slates")
    rows = []
    for sg in strategies:
        dd_ = res[sg["code"]]; u = sum(p for g in dd_ for p, _ in dd_[g]); n = sum(len(dd_[g]) for g in dd_)
        rr = [p for g, v in sg["res"].items() if g in set(dates) for p, _ in v]
        rows.append((sg["code"], sg["sig"], u, n, sum(rr), len(rr)))
    for code, sig, u, n, ru, rn in sorted(rows, key=lambda x: -x[2]):
        log(f"  {code} {sig:78s} prod {u:+7.1f}u {n:3d} slips ROI {100*u/max(n,1):+6.1f}% | research {ru:+7.1f}u {rn:3d} slips ROI {100*ru/max(rn,1):+6.1f}%")
    # sets
    by_code = {sg["code"]: {g: [(p, l) for p, l in v] for g, v in res[sg["code"]].items()} for sg in strategies}
    sig = {sg["code"]: sg["sig"] for sg in strategies}

    def merged(codes):
        return PIC.merge_set([by_code[c] for c in codes], FL.SLOTS[APP], FL.CAPS[APP])

    log("FINAL SET (NS1..) on production numbers:")
    PIC.table("final-set", merged(list(fin)))
    for label, ok in (("any strategy of the pool", lambda c: True), ("only strategies positive on production numbers alone", lambda c: sum(p for g in by_code[c] for p, _ in by_code[c][g]) > 0)):
        chosen, cur = [], -9.0
        for _ in range(FL.SLOTS[APP]):
            best = (None, cur)
            for sg in strategies:
                c = sg["code"]
                if c in chosen or c in fin or not ok(c) or not by_code[c]:
                    continue
                j = jscore(merged(chosen + [c]))
                if j > best[1]:
                    best = (c, j)
            if best[0] is None:
                break
            chosen.append(best[0]); cur = best[1]
        log(f"SEARCH ({label}): {len(chosen)} strategies, units/(drawdown+2) = {cur:.2f}")
        for c in chosen:
            log("   " + c + " " + sig[c])
        PIC.table("search", merged(chosen))
        log("   JSON " + json.dumps([{k: v for k, v in next(s for s in strategies if s['code'] == c).items() if k not in ('res',)} for c in chosen]))
    log("done")


if __name__ == "__main__":
    main()
