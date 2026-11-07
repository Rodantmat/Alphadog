#!/usr/bin/env python3
"""
OWNER vs FRIEND comparison + THIRD-TIER (Jessi) strategy search (owner 2026-11-06). READ-ONLY. One app per process: FR_APP = PP | UD | SLEEPER | FLIFF | BETR.
 1. Replays every slate with (a) the owner's strategy as the engine models it (PP: the certified portfolio units B3 B4 B5 B6 B7 B9; other apps: the owner proxy
    rules), (b) the friend's rules exactly as the pick builds them (base slips, then the extras with the played players banned). Same slates, flat $1 a slip.
 2. JS=1 (PP, SLEEPER): searches rule variants for a third set that is >= 40% different from BOTH (the leg-difference ladder against owner proxies + the
    friend's legs), flex only, 3 / 4 / 5 picks. Greedy on the first 60% of the slates (net / (drawdown + 1)), read on the last 40% (out of sample).
"""
import os, sys, random, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_friend_extra as RX

APP = FE.FAPP
TM = APP != "UD"
JS = os.environ.get("JS") == "1"
OWN_ST = {"UD": "standard", "SLEEPER": "flex", "FLIFF": "max", "BETR": "flex"}


def pay(s, st):
    return float(FE.pay_of(s, st))


def owner_series(legs):
    out = []
    try:
        if APP == "PP":
            for uid in ("B3", "B4", "B5", "B6", "B7", "B9"):
                s = FE.PB.unit_slip(legs, uid)
                if s:
                    out.append(pay(s, FE.PB.UNITS[uid][3]) - 1.0)
        elif APP == "UD":
            for c in FE.HIS:
                s = FE.build(FE.ranked(legs, c), 2, 1, set(), teams=False)
                if s:
                    out.append(pay(s, OWN_ST[APP]) - 1.0)
        else:
            for (o, sd, pr, kd0, fl, g, sk, k, ns) in FE.HIS:
                cand = FE.ranked(legs, (o, sd, pr, kd0, fl, g, sk))
                banned = set()
                for _ in range(ns):
                    s = FE.build(cand, k, 2 if kd0 == "gc2" else 1, set(), frozenset(banned))
                    if not s:
                        break
                    banned |= {FE.pid(l) for l in s}
                    out.append(pay(s, OWN_ST[APP]) - 1.0)
    except Exception as e:
        print("owner series failed:", e, flush=True)
    return out


def friend_day(legs, H):
    """(profits of the friend's slips of the day, the friend's leg keys, the friend's players) - the way pick() builds them"""
    prof, keys, used = [], set(), set()
    for code, size, st, gc, s, cand in FE.plan(legs, H):
        if s:
            prof.append(pay(s, st) - 1.0); keys |= {FE.lk(l) for l in s}; used |= {FE.pid(l) for l in s}
    for code, size, st, rule in FE.EXTRA:
        cand, gc = RX.cand_of(legs, rule)
        s = FE.build(cand, size, gc, H, banned=frozenset(used), teams=TM)
        if s:
            prof.append(pay(s, st) - 1.0); keys |= {FE.lk(l) for l in s}; used |= {FE.pid(l) for l in s}
    return prof, keys


def stats(series, dsel):
    n = net = 0
    cum = peak = dd = 0.0
    loss = worst = dry = cur = 0
    nd = 0
    for d in dsel:
        xs = series.get(d)
        if not xs:
            continue
        nd += 1; n += len(xs); x = sum(xs); net += x; cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
        if x < 0:
            loss += 1
        worst = min(worst, x)
        if x <= 0:
            cur += 1; dry = max(dry, cur)
        else:
            cur = 0
    if not n:
        return None
    return dict(n=n, days=nd, perday=n / nd, roi=net / n, net=net, dd=dd, loss=loss / nd, worst=worst, dry=dry, calmar=net / (dd + 1.0))


def fmt(r):
    return "-" if not r else f"{r['n']:4d} sl ({r['perday']:.1f}/day) ROI {r['roi'] * 100:6.1f}% net {r['net']:7.1f} dd {r['dd']:5.1f} losing days {r['loss'] * 100:4.1f}% worst day {r['worst']:5.1f} dry {r['dry']}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if APP == "PP":
        FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    it = FE.pp_days(conn) if APP == "PP" else FE.app_days(conn)
    OWN, FRI = {}, {}
    VAR = collections.defaultdict(dict)      # key -> {day: [profits]}
    KEYOBJ = {}
    shapes = [(3, "flex"), (4, "flex"), (5, "flex")]
    days_all, nd = [], 0
    for season, d, legs in it:
        nd += 1
        if len(legs) < 3:
            continue
        days_all.append(d)
        H = FE.proxies(legs) | set()
        own = owner_series(legs)
        if own:
            OWN[d] = own
        fprof, fkeys = friend_day(legs, H)
        if fprof:
            FRI[d] = fprof
        if JS and APP in ("PP", "SLEEPER"):
            Hf = H | fkeys
            for si, (size, st) in enumerate(shapes):
                for v in RX.grids(10 + si):
                    try:
                        cand, gc = RX.cand_of(legs, v)
                        s = FE.build(cand, size, gc, Hf, frozenset(), teams=TM)
                        if not s:
                            continue
                        m = pay(s, st)
                    except Exception:
                        continue
                    key = f"{size}|{st}|{v}"
                    KEYOBJ[key] = (size, st, v)
                    VAR[key].setdefault(d, []).append(m - 1.0)
        if nd % 40 == 0:
            print(f"[{APP}] {nd} slates, {len(VAR)} variants", flush=True)
    conn.close()
    days = sorted(set(days_all))
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]
    test = [d for d in days if d >= cut]
    cur_season = [d for d in days if str(d) >= "2026-10-01"]
    print("\n" + "=" * 118 + f"\n{APP}: {len(days)} slates, train {len(train)} (to {cut}), test {len(test)}, this season {len(cur_season)}\n" + "=" * 118)
    for nm, ser in (("OWNER (as modelled)", OWN), ("FRIEND (base + extras)", FRI)):
        print(f"{nm:24s} all   :", fmt(stats(ser, days)))
        print(f"{nm:24s} train :", fmt(stats(ser, train)))
        print(f"{nm:24s} TEST  :", fmt(stats(ser, test)))
        print(f"{nm:24s} season:", fmt(stats(ser, cur_season)))
    if not (JS and APP in ("PP", "SLEEPER")):
        return
    seen, cands = set(), []
    for k, ser in VAR.items():
        sig = tuple(sorted((d, round(sum(v), 4)) for d, v in ser.items()))
        if sig in seen:
            continue
        seen.add(sig)
        st_tr = stats(ser, train)
        if st_tr and st_tr["days"] >= 0.4 * len(train) and st_tr["roi"] >= 0.25:
            cands.append(k)
    print("\nthird-set candidates after dedupe + standalone train ROI >= 25%:", len(cands))

    def merged(keys, dsel):
        out = {}
        for d in dsel:
            xs = [x for k in keys for x in VAR[k].get(d, [])]
            if xs:
                out[d] = xs
        return out

    chosen = []
    for rnd in range(4):
        best = None
        cur = stats(merged(chosen, train), train) if chosen else None
        for k in cands:
            if k in chosen:
                continue
            p = stats(merged(chosen + [k], train), train)
            if not p:
                continue
            if cur and (p["calmar"] <= cur["calmar"] or p["roi"] < 0.8 * cur["roi"]):
                continue
            if best is None or p["calmar"] > best[0]["calmar"]:
                best = (p, k)
        if not best:
            break
        chosen.append(best[1])
        print(f"\n+slip {rnd + 1}: {best[1]}")
        print("   train portfolio:", fmt(stats(merged(chosen, train), train)))
        print("   TEST  portfolio:", fmt(stats(merged(chosen, test), test)), "  <-- out of sample")
        print("   this season    :", fmt(stats(merged(chosen, cur_season), cur_season)))
        print("   slip alone TEST:", fmt(stats(merged([best[1]], test), test)))
    print("\nTHIRD SET, chosen rules (size|structure|rule):")
    for k in chosen:
        print("  ", k)


if __name__ == "__main__":
    main()
