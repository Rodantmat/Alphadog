#!/usr/bin/env python3
"""
RESEARCH - FRIEND PAGE, second-tier rules for UD / SLEEPER / FLIFF / BETR (2026-11-05). READ-ONLY.
Every rule is evaluated WITH the 40% leg-difference cap against the owner's rule(s) replayed on the same legs: at most
k - max(1, floor(0.4k)) legs of a friend slip may be a (player, prop, side) the owner's rules took that day. Flat 1u per slip.
Env: DATABASE_URL, FR_APP (UD | SLEEPER | FLIFF | BETR), AA_BETR_PF for BETR (0.40,0.55 as the live rule).
"""
import itertools, os, sys, time
from collections import defaultdict
import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
FAPP = (os.environ.get("FR_APP") or "UD").upper()
if FAPP == "UD":
    os.environ["APP"] = "UD"
    import research_app_final_strategies as AF
    AA = None
else:
    os.environ["AA_APP"] = FAPP.lower()
    import research_app_allegs as AA
    AF = AA.AF
T0 = time.time()
need = lambda k: max(1, int(0.4 * k))


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def max_dd(x):
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(x) else 0.0


def dry_run(x):
    best = cur = 0
    for v in x:
        cur = cur + 1 if v <= 0 else 0
        best = max(best, cur)
    return best


def lk(l):
    return (str(l["player_id"]), l["prop"], l["side"])


def build(cand, k, gc, H, banned=frozenset(), teams=True):
    maxh = k - need(k)
    out, pl, gm, h = [], set(), defaultdict(int), 0
    for l in cand:
        pid = str(l["player_id"])
        if pid in pl or pid in banned or gm[l["event_id"]] >= gc:
            continue
        inh = lk(l) in H
        if inh and h >= maxh:
            continue
        out.append(l); pl.add(pid); gm[l["event_id"]] += 1; h += inh
        if len(out) == k:
            break
    if len(out) < k:
        return None
    if teams and len({l.get("team") or l.get("team_id") for l in out}) < 2:
        return None
    return out


if FAPP == "UD":
    STRUCTS = [(2, "standard"), (3, "flex"), (4, "flex"), (5, "flex"), (6, "flex")]
    POOLS = AF.POOLS
    SIDES = ("O", "U", "B")
    SIDEMAP = AF.SIDES
    PSS = ("all", "points", "rebounds", "assists", "threes", "combos", "lowvol")
    RKS = ("p", "ev", "base", "score")
    FLS = (0.0, 0.55, 0.60, 0.65)
    COMBOS = list(itertools.product(POOLS, SIDES, PSS, RKS, FLS, (0, 1)))
    # owner proxies (UD portfolio T): T1 rebounds B-pool Under by p, T2 RB both all ev .60 skip1, T3 RB More combos ev .55 skip1
    HIS = [("B", "U", "rebounds", "p", 0.0, 0), ("RB", "B", "all", "ev", 0.60, 1), ("RB", "O", "combos", "ev", 0.55, 1)]

    def ranked(legs, c):
        pool, side, ps, rk, fl, sk = c
        pset = AF.PROPSETS[ps]
        b = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDEMAP[side] and (pset is None or AF.GRP.get(l["prop"]) in pset)]
        key = {"p": lambda l: -l["p"], "ev": lambda l: -l["p"] * l["m"], "base": lambda l: -(l.get("base") if l.get("base") is not None else -1),
               "score": lambda l: -(l.get("score") if l.get("score") is not None else -1)}[rk]
        b.sort(key=key)
        return [l for l in b if l["p"] >= fl][sk:]

    def his_legs(legs):
        H = set()
        for c in HIS:
            s = build(ranked(legs, c), 2, 1, set(), teams=False)
            if s:
                H |= {lk(l) for l in s}
        return H

    def gc_of(c):
        return 1

    def pay(s, st):
        return AF.ud_pay(s, st)
else:
    ORD = ("p", "ev", "bl", "evbl") if FAPP != "BETR" else ("p", "bl", "pf")
    SIDES = ("any", "Over", "Under")
    PRS = ("all", "nolow", "low")
    KDS = ("main", "all") if FAPP == "SLEEPER" else (("gc1", "gc2") if FAPP == "BETR" else ("main",))
    FLS = (0.0, 0.50, 0.56, 0.60) if FAPP != "BETR" else (0.0, 0.56, 0.60, 0.64)
    GTS = (0.0, 1.04, 1.12) if FAPP != "BETR" else (0.0,)
    COMBOS = list(itertools.product(ORD, SIDES, PRS, KDS, FLS, GTS, (0, 1)))
    if FAPP == "SLEEPER":
        STRUCTS = [(2, "max"), (3, "flex"), (4, "flex"), (5, "flex")]
        HIS = [("evbl", "any", "all", "all", 0.50, 1.12, 0, 5, 2)]
    elif FAPP == "FLIFF":
        STRUCTS = [(2, "max"), (3, "max")]
        HIS = [("p", "Under", "all", "main", 0.56, 0.0, 0, 2, 1)]
    else:
        STRUCTS = [(3, "flex"), (4, "flex"), (5, "flex")]
        HIS = [("bl", "any", "all", "gc1", 0.60, 0.0, 0, 4, 2)]

    def ranked(legs, c):
        o, sd, pr, kd0, fl, g, sk = c
        b = [l for l in legs if (sd == "any" or l["side"] == sd) and (kd0 == "all" or l.get("kind", "main") == "main")
             and (pr == "all" or (pr == "low") == (AF.GRP.get(l["prop"]) == "lowvol"))]
        b.sort(key=AA.key_of(o))
        return [l for l in b if l["p"] >= fl and l["p"] * l["m"] >= g][sk:]

    def gc_of(c):
        return 2 if c[3] == "gc2" else 1

    def his_legs(legs):
        H = set()
        for (o, sd, pr, kd0, fl, g, sk, k, ns) in HIS:
            cand = ranked(legs, (o, sd, pr, kd0, fl, g, sk))
            banned = set()
            for _ in range(ns):
                s = build(cand, k, 2 if kd0 == "gc2" else 1, set(), frozenset(banned))
                if not s:
                    break
                H |= {lk(l) for l in s}; banned |= {str(l["player_id"]) for l in s}
        return H

    def pay(s, st):
        return AA.pay(s, st)


def days_iter(conn):
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    if FAPP == "UD":
        for d in days:
            st = AF.box(conn, d)
            if not st:
                continue
            legs, _rows = AF.load_ud(conn, d, st)
            yield AF.season_of(d), d, legs
        return
    ovr, kt = AA.RSH.law(conn, live)
    kf = AA.fliff_law(conn, live) if FAPP == "FLIFF" else None
    for d in days:
        st = AF.box(conn, d)
        if not st:
            continue
        si = AA.SEASONS.index(AF.season_of(d))
        legs = AA.hist_legs(conn, d, st, ovr, kt, kf) if si < 2 else AA.live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
        yield AF.season_of(d), d, legs


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    res = defaultdict(lambda: defaultdict(list))
    n = 0
    for season, d, legs in days_iter(conn):
        if len(legs) < 3:
            continue
        n += 1
        H = his_legs(legs)
        for c in COMBOS:
            r = ranked(legs, c)
            for (k, st) in STRUCTS:
                s = build(r, k, gc_of(c), H, teams=(FAPP != "UD"))
                if s:
                    res[(c, k, st)][season].append(pay(s, st) - 1.0)
        if n % 25 == 0:
            log(f"slate {n} {d}: {len(legs)} legs, his legs {len(H)}")
        if n % 40 == 0:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    seasons = ["2024-25", "2025-26"]
    for (k, st) in STRUCTS:
        rows = []
        for (c, kk, ss), d in res.items():
            if (kk, ss) != (k, st):
                continue
            ns = [len(d.get(s, [])) for s in seasons]
            if min(ns) < 25:
                continue
            m = [float(np.mean(d[s])) for s in seasons]
            if min(m) <= 0:
                continue
            dd = [max_dd(d[s]) for s in seasons]
            dry = [dry_run(d[s]) for s in seasons]
            bal = min(float(np.sum(d[s])) / max(dd[i], 1.0) for i, s in enumerate(seasons))
            ce = d.get("2026-27", [])
            rows.append((bal, c, m, ns, (float(np.mean(ce)), len(ce)) if ce else None, dd, dry))
        rows.sort(key=lambda r: -r[0])
        print(f"\n=== {FAPP} {k}-pick {st}: {len(rows)} capped variants positive in both history seasons; top 20 by BALANCE (worse season P/L / max drawdown)")
        for r in rows[:20]:
            print("  ", r[1], "ROI", " ".join(f"{100 * x:+.0f}%" for x in r[2]), "n", r[3], "dd", " ".join(f"{x:.1f}u" for x in r[5]), "dry", r[6], f"bal {r[0]:.1f}",
                  "this season", ("%+.0f%% (%d)" % (100 * r[4][0], r[4][1])) if r[4] else "none")
    print("done")


if __name__ == "__main__":
    main()
