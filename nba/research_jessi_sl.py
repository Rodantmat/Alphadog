#!/usr/bin/env python3
"""
JESSI SLEEPER RE-SEARCH (owner 2026-11-06 "four pick flex, better chances, flatter, less risky, less losing days"). One app: FR_APP=SLEEPER.
Sleeper history before 2026-10 is the modelled board (book main line + the app's payout law); this season is the live board. Rules: her slips may use the same legs /
strategies as his and the friend's, only never an EXACT copy of one of their slips; her own slips never share a player. Shapes: flex 3, 4, 5.
Phase 1: standalone screen on the first 60% of slates (low-risk score). Phase 2: joint greedy (2 slips max) on the train part, read on the last 40% and per season. READ-ONLY.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE
import research_jessi as RJ
import research_friend_extra as RX
import psycopg

random.seed(5)
SHAPES = [(3, "flex"), (4, "flex"), (5, "flex")]
NV = int(os.environ.get("JV") or 1500)
GRID = [(o, sd, pr, "main", fl, gt, sk) for o, sd, pr, fl, gt, sk in itertools.product(
    ("p", "ev", "edge", "bl", "evbl", "pf"), ("any", "Over", "Under"), ("all", "low", "nolow"), (0.0, 0.55, 0.60, 0.65, 0.70, 0.75), (0.0, 1.0, 1.04, 1.10), (0, 1, 2))]


def build_distinct(legs, size, rule, forbid, banned=frozenset()):
    cand = FE.ranked(legs, rule)
    ban = set(banned)
    for _ in range(6):
        s = FE.build_at(cand, size, 1, set(), frozenset(ban), True, 0)
        if not s:
            return None
        if frozenset(FE.lk(l) for l in s) not in forbid:
            return s
        ban.add(FE.pid(s[-1]))
    return None


def joint(legs, rules, forbid):
    used, out = set(), []
    for size, st, rule in rules:
        try:
            s = build_distinct(legs, size, rule, forbid, frozenset(used))
        except Exception:
            s = None
        if not s:
            continue
        out.append(RJ.pay(s, st) - 1.0)
        used |= {FE.pid(l) for l in s}
    return out


def forbidden(legs, H):
    fb = set()
    for (o, sd, pr, kd0, fl, g, sk, k, ns) in FE.HIS:
        cand = FE.ranked(legs, (o, sd, pr, kd0, fl, g, sk))
        banned = set()
        for _ in range(ns):
            s = FE.build(cand, k, 1, set(), frozenset(banned))
            if not s:
                break
            fb.add(frozenset(FE.lk(l) for l in s)); banned |= {FE.pid(l) for l in s}
    used = set()
    for code, size, st, gc, s, cand in FE.plan(legs, H):
        if s:
            fb.add(frozenset(FE.lk(l) for l in s)); used |= {FE.pid(l) for l in s}
    for code, size, st, rule in FE.EXTRA:
        cand, gc = RX.cand_of(legs, rule)
        s = FE.build(cand, size, gc, H, banned=frozenset(used), teams=True)
        if s:
            fb.add(frozenset(FE.lk(l) for l in s)); used |= {FE.pid(l) for l in s}
    return fb


def risk_score(a):
    # flat and safe: profit per dollar of drawdown, penalised by losing days, ROI must stay real
    return a["calmar"] * (1.0 - a["loss"]) * (a["roi"] ** 0.5)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    DAYS, OWN, FRI = {}, {}, {}
    for season, d, legs in FE.app_days(conn):
        if len(legs) < 3:
            continue
        H = FE.proxies(legs)
        own = RJ.owner_series(legs)
        fprof, fkeys = RJ.friend_day(legs, H)
        if own: OWN[d] = own
        if fprof: FRI[d] = fprof
        DAYS[d] = (legs, forbidden(legs, H))
        if len(DAYS) % 40 == 0:
            print(f"loaded {len(DAYS)} slates", flush=True)
    conn.close()
    days = sorted(DAYS)
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]; test = [d for d in days if d >= cut]
    seas = lambda d: str(d)[:4] if str(d)[5:7] >= "08" else str(int(str(d)[:4]) - 1)
    print(f"{len(days)} slates, train {len(train)} (to {cut}), test {len(test)}", flush=True)
    for nm, ser in (("OWNER (as modelled)", OWN), ("FRIEND (base+extras)", FRI)):
        print(f"{nm:22s} all  :", RJ.fmt(RJ.stats(ser, days)))
        for sy in sorted({seas(d) for d in days}):
            print(f"{nm:22s} {sy}:", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))
    VAR = collections.defaultdict(dict)
    for si, (size, st) in enumerate(SHAPES):
        gs = random.Random(40 + si).sample(GRID, min(NV, len(GRID)))
        for d in days:
            legs, fb = DAYS[d]
            for v in gs:
                try:
                    s = build_distinct(legs, size, v, fb)
                    if s:
                        VAR[(size, st, v)].setdefault(d, []).append(RJ.pay(s, st) - 1.0)
                except Exception:
                    continue
        print(f"phase 1 shape {size}-{st} done, variants {len(VAR)}", flush=True)
    seen, cands = set(), []
    for k, ser in VAR.items():
        sig = tuple(sorted((d, round(sum(v), 4)) for d, v in ser.items()))
        if sig in seen:
            continue
        seen.add(sig)
        a = RJ.stats(ser, train)
        if a and a["days"] >= 0.6 * len(train) and a["roi"] >= 0.3:
            cands.append((risk_score(a), k))
    cands.sort(reverse=True)
    fin = [k for _, k in cands[:60]]
    print("phase 1 finalists:", len(fin), "of", len(cands), flush=True)
    for k in fin[:25]:
        print("   ", k[0], k[2], "TRAIN", RJ.fmt(RJ.stats(VAR[k], train)), "| TEST", RJ.fmt(RJ.stats(VAR[k], test)), flush=True)

    def jseries(rules, dsel):
        out = {}
        for d in dsel:
            legs, fb = DAYS[d]
            xs = joint(legs, rules, fb)
            if xs:
                out[d] = xs
        return out
    chosen = []
    for rnd in range(2):
        cur = RJ.stats(jseries(chosen, train), train) if chosen else None
        best = None
        for k in fin:
            if k in chosen:
                continue
            p = RJ.stats(jseries(chosen + [k], train), train)
            if not p:
                continue
            if cur and (risk_score(p) <= risk_score(cur) or p["roi"] < 0.7 * cur["roi"]):
                continue
            if best is None or risk_score(p) > best[0]:
                best = (risk_score(p), k)
        if not best:
            break
        chosen.append(best[1])
        print(f"\n+slip {rnd + 1}: {best[1]}", flush=True)
        print("   TRAIN joint:", RJ.fmt(RJ.stats(jseries(chosen, train), train)))
        print("   TEST  joint:", RJ.fmt(RJ.stats(jseries(chosen, test), test)), "  <-- out of sample", flush=True)
    print("\nFINAL JESSI SLEEPER SET (build order):")
    for k in chosen:
        print("  ", k)
    ser_all = jseries(chosen, days)
    print("ALL    :", RJ.fmt(RJ.stats(ser_all, days)))
    print("TRAIN  :", RJ.fmt(RJ.stats(ser_all, train)))
    print("TEST   :", RJ.fmt(RJ.stats(ser_all, test)))
    for sy in sorted({seas(d) for d in days}):
        print(f"{sy}  :", RJ.fmt(RJ.stats(ser_all, [d for d in days if seas(d) == sy])))
    for k in chosen:
        print("slip alone:", k[:2], RJ.fmt(RJ.stats(VAR[k], days)))


if __name__ == "__main__":
    main()
