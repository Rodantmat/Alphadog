#!/usr/bin/env python3
"""
JESSI PRIZEPICKS RE-SEARCH v3 (fewer losing days, shapes 3F 3P 4F 5F, his own rules as candidates) (owner 2026-11-06): real PrizePicks boards (history legs graded from the box score, this season on the live board path), real payouts.
Owner rule: her slips may use the SAME legs and strategies as his / the friend's; the only rule is that no slip of hers is EXACTLY the same set of legs as one of theirs
(and her own slips are never the same player twice). Wide rule grid x shapes (flex 3-6, power 2-4). Portfolio built jointly, one slip after the other.
Phase 1: standalone screen on the first 60% of slates. Phase 2: joint greedy on the first 60% with the finalists. Read on the last 40% (out of sample) and per season. READ-ONLY.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ
import research_friend_extra as RX

random.seed(5)
SHAPES = [(3, "flex"), (3, "power"), (4, "flex"), (5, "flex")]   # owner 2026-11-06 18:48: 3F, 3P, 4F, 5F; Power only up to 3 picks
NV = int(os.environ.get("JV") or 900)
GRID = list(itertools.product(("R", "RD"), ("O", "U", "B"), ("all", "points", "rebounds", "assists", "threes", "combos", "lowvol"), ("p", "ev", "blend", "trail"),
                              (0.58, 0.62, 0.66, 0.70, 0.74), (1, 2, 3), (0, 1, 2), ("all", "low", "high")))


def build_distinct(legs, size, rule, forbid, banned=frozenset()):
    """the rule's slip; if it is exactly one of the owner's / friend's slips, drop that slip's weakest-ranked player and rebuild (next legs of the same ranking)"""
    cand, gc = FE.pp_cand(legs, rule)
    ban = set(banned)
    for _ in range(6):
        s = FE.build_at(cand, size, gc, set(), frozenset(ban), True, 0)
        if not s:
            return None
        ks = frozenset(FE.lk(l) for l in s)
        if ks not in forbid:
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
    """every exact slip of the owner (certified units as modelled) and of the friend (base + extras) of the day"""
    fb = set()
    for uid in FE.HIS_PP:
        s = FE.PB.unit_slip(legs, uid)
        if s:
            fb.add(frozenset(FE.lk(l) for l in s))
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
        DAYS[d] = (legs, forbidden(legs, H))
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
    VAR = collections.defaultdict(dict)
    for si, (size, st) in enumerate(SHAPES):
        gs = random.Random(30 + si).sample(GRID, min(NV, len(GRID)))
        for d in days:
            legs, fb = DAYS[d]
            for v in gs:
                try:
                    s = build_distinct(legs, size, v, fb)
                    if not s:
                        continue
                    VAR[(size, st, v)].setdefault(d, []).append(RJ.pay(s, st) - 1.0)
                except Exception:
                    continue
        print(f"phase 1 shape {size}-{st} done, variants {len(VAR)}", flush=True)
    HIS_RULES = [(4, "flex", ("R", "B", "lowvol", "trail", 0.62, 1, 0, "all")), (4, "flex", ("R", "O", "all", "p", 0.62, 1, 1, "all")),
                 (4, "flex", ("R", "B", "lowvol", "blend", 0.70, 2, 1, "all")), (3, "power", ("R", "O", "all", "p", 0.62, 1, 1, "all")),
                 (3, "power", ("R", "B", "lowvol", "blend", 0.70, 2, 1, "all")), (3, "flex", ("R", "O", "all", "p", 0.62, 1, 1, "all")),
                 (3, "flex", ("R", "B", "lowvol", "blend", 0.70, 2, 1, "all"))]
    for size, st, v in HIS_RULES:
        for d in days:
            legs, fb = DAYS[d]
            try:
                s_ = build_distinct(legs, size, v, fb)
                if s_:
                    VAR[(size, st, v)].setdefault(d, []).append(RJ.pay(s_, st) - 1.0)
            except Exception:
                continue
    print("\nHIS RULES as Jessi slips (never his exact slip), standalone, ALL / TEST:")
    for size, st, v in HIS_RULES:
        k = (size, st, v)
        print("  ", size, st, v[:5], "ALL", RJ.fmt(RJ.stats(VAR[k], days)), "| TEST", RJ.fmt(RJ.stats(VAR[k], test)))
    seen, cands = set(), []
    for k, ser in VAR.items():
        sig = tuple(sorted((d, round(sum(v), 4)) for d, v in ser.items()))
        if sig in seen:
            continue
        seen.add(sig)
        a = RJ.stats(ser, train)
        if a and a["days"] >= 0.45 * len(train) and a["roi"] >= 0.35:
            cands.append(((1 - a["loss"]) ** 2 * a["roi"] ** 0.5 * (1 + a["calmar"]) ** 0.3, k))
    cands.sort(reverse=True)
    fin = [k for _, k in cands[:100]]
    print("phase 1 finalists:", len(fin), "of", len(cands), flush=True)
    for k in fin[:15]:
        print("   ", k[0], k[1], k[2], "TRAIN", RJ.fmt(RJ.stats(VAR[k], train)), "| TEST", RJ.fmt(RJ.stats(VAR[k], test)), flush=True)

    def jseries(rules, dsel):
        out = {}
        for d in dsel:
            legs, fb = DAYS[d]
            xs = joint(legs, rules, fb)
            if xs:
                out[d] = xs
        return out
    def run_set(label, minroi, maxn, wl):
        chosen = []
        for rnd in range(maxn):
            cur = RJ.stats(jseries(chosen, train), train) if chosen else None
            best = None
            for k in fin:
                if k in chosen:
                    continue
                p = RJ.stats(jseries(chosen + [k], train), train)
                if not p or p["roi"] < minroi:
                    continue
                sc = (1 - p["loss"]) ** wl * p["roi"] ** 0.5 * (1 + p["calmar"]) ** 0.3
                if cur and sc <= (1 - cur["loss"]) ** wl * cur["roi"] ** 0.5 * (1 + cur["calmar"]) ** 0.3:
                    continue
                if best is None or sc > best[0]:
                    best = (sc, k, p)
            if not best:
                break
            chosen.append(best[1])
        print(f"\n===== SET {label}: min train ROI {minroi}, up to {maxn} slips, loss weight {wl} =====")
        for k in chosen:
            print("  ", k)
        ser_all = jseries(chosen, days)
        print("ALL    :", RJ.fmt(RJ.stats(ser_all, days)))
        print("TRAIN  :", RJ.fmt(RJ.stats(ser_all, train)))
        print("TEST   :", RJ.fmt(RJ.stats(ser_all, test)), "  <-- out of sample")
        for sy in sorted({seas(d) for d in days}):
            print(f"{sy}  :", RJ.fmt(RJ.stats(ser_all, [d for d in days if seas(d) == sy])))
        for k in chosen:
            print("   slip alone:", k[:2], RJ.fmt(RJ.stats(VAR[k], days)))
        return chosen
    cur_rules = [(size, st, rule) for code, size, st, rule in FE.JESSI_RULES["PP"]]
    sc_ = jseries(cur_rules, days)
    print("\n===== CURRENT JESSI SET (J1 J2 J3, as the page runs) =====")
    print("ALL    :", RJ.fmt(RJ.stats(sc_, days))); print("TEST   :", RJ.fmt(RJ.stats(sc_, test)))
    for sy in sorted({seas(d) for d in days}):
        print(f"{sy}  :", RJ.fmt(RJ.stats(sc_, [d for d in days if seas(d) == sy])))
    run_set("A fewest losing days", 0.45, 3, 3)
    run_set("B balanced", 0.60, 4, 2)
    run_set("C more ROI", 0.80, 4, 1)
    return


if __name__ == "__main__":
    main()
