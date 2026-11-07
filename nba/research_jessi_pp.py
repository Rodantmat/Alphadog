#!/usr/bin/env python3
"""
JESSI PRIZEPICKS RE-SEARCH (owner 2026-11-06): real PrizePicks boards (history legs graded from the box score, this season on the live board path), real payouts.
Wide rule grid x shapes (flex 3-6, power 2-4). Every slip is built >= 10% different from the owner's proxies AND the friend's slips (never a copy), the portfolio is built
jointly the way pick() builds it (one slip after the other, no player twice). Phase 1: standalone screen on the first 60% of slates. Phase 2: joint greedy on the first 60%
with the finalists. Read on the last 40% (out of sample) and per season. READ-ONLY.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ

random.seed(5)
SHAPES = [(3, "flex"), (4, "flex"), (5, "flex"), (6, "flex"), (2, "power"), (3, "power"), (4, "power")]
NV = int(os.environ.get("JV") or 900)
GRID = list(itertools.product(("R", "RD"), ("O", "U", "B"), ("all", "points", "rebounds", "assists", "threes", "combos", "lowvol"), ("p", "ev", "blend", "trail"),
                              (0.58, 0.62, 0.66, 0.70, 0.74), (1, 2, 3), (0, 1, 2), ("all", "low", "high")))


def build_one(legs, size, rule, Hf, banned=frozenset()):
    cand, gc = FE.pp_cand(legs, rule)
    return FE.build(cand, size, gc, Hf, banned, teams=True, allow_zero=False)


def joint(day, rules, Hf):
    """rules = [(size, st, rule)] built one after the other, no player twice -> profits"""
    legs = day
    used, out = set(), []
    for size, st, rule in rules:
        try:
            s = build_one(legs, size, rule, Hf, frozenset(used))
        except Exception:
            s = None
        if not s:
            continue
        out.append(RJ.pay(s, st) - 1.0)
        used |= {FE.pid(l) for l in s}
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    DAYS, OWN, FRI = {}, {}, {}
    for season, d, legs in FE.pp_days(conn):
        if len(legs) < 3:
            continue
        H = FE.proxies(legs)
        own = RJ.owner_series(legs)
        fprof, fkeys = RJ.friend_day(legs, H)
        if own: OWN[d] = own
        if fprof: FRI[d] = fprof
        DAYS[d] = (legs, H | fkeys)
        if len(DAYS) % 30 == 0:
            print(f"loaded {len(DAYS)} slates", flush=True)
    conn.close()
    days = sorted(DAYS)
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]; test = [d for d in days if d >= cut]
    seas = lambda d: str(d)[:4] if str(d)[5:7] >= "08" else str(int(str(d)[:4]) - 1)
    print(f"{len(days)} slates, train {len(train)} (to {cut}), test {len(test)}", flush=True)
    for nm, ser in (("OWNER (as modelled)", OWN), ("FRIEND (base+extras)", FRI)):
        print(f"{nm:22s} all  :", RJ.fmt(RJ.stats(ser, days)))
        print(f"{nm:22s} TEST :", RJ.fmt(RJ.stats(ser, test)))
        for sy in sorted({seas(d) for d in days}):
            print(f"{nm:22s} {sy}:", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))
    # phase 1
    VAR = collections.defaultdict(dict)
    for si, (size, st) in enumerate(SHAPES):
        gs = random.Random(30 + si).sample(GRID, min(NV, len(GRID)))
        for n, d in enumerate(days):
            legs, Hf = DAYS[d]
            for v in gs:
                try:
                    s = build_one(legs, size, v, Hf)
                    if not s:
                        continue
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
        if a and a["days"] >= 0.45 * len(train) and a["roi"] >= 0.5:
            cands.append((a["calmar"], k))
    cands.sort(reverse=True)
    fin = [k for _, k in cands[:80]]
    print("phase 1 finalists:", len(fin), "of", len(cands), flush=True)
    for k in fin[:15]:
        print("   ", k[0], k[1], k[2], "TRAIN", RJ.fmt(RJ.stats(VAR[k], train)), "| TEST", RJ.fmt(RJ.stats(VAR[k], test)), flush=True)

    def jseries(rules, dsel):
        out = {}
        for d in dsel:
            legs, Hf = DAYS[d]
            xs = joint(legs, rules, Hf)
            if xs:
                out[d] = xs
        return out
    chosen = []
    for rnd in range(5):
        cur = RJ.stats(jseries(chosen, train), train) if chosen else None
        best = None
        for k in fin:
            if any(k == c for c in chosen):
                continue
            r = chosen + [k]
            p = RJ.stats(jseries(r, train), train)
            if not p:
                continue
            if cur and (p["calmar"] <= cur["calmar"] or p["roi"] < 0.75 * cur["roi"]):
                continue
            sc = p["calmar"] * (p["roi"] ** 0.5)
            if best is None or sc > best[0]:
                best = (sc, k, p)
        if not best:
            break
        chosen.append(best[1])
        rl = list(chosen)
        print(f"\n+slip {rnd + 1}: {best[1]}", flush=True)
        print("   TRAIN joint:", RJ.fmt(RJ.stats(jseries(rl, train), train)))
        print("   TEST  joint:", RJ.fmt(RJ.stats(jseries(rl, test), test)), "  <-- out of sample", flush=True)
    rl = list(chosen)
    print("\nFINAL JESSI PRIZEPICKS SET (order = build order):")
    for k in rl:
        print("  ", k)
    ser_all = jseries(rl, days)
    print("ALL    :", RJ.fmt(RJ.stats(ser_all, days)))
    print("TRAIN  :", RJ.fmt(RJ.stats(ser_all, train)))
    print("TEST   :", RJ.fmt(RJ.stats(ser_all, test)))
    for sy in sorted({seas(d) for d in days}):
        print(f"{sy}  :", RJ.fmt(RJ.stats(ser_all, [d for d in days if seas(d) == sy])))
    for k in rl:
        print("slip alone:", k[:2], RJ.fmt(RJ.stats(VAR[k], days)))


if __name__ == "__main__":
    main()
