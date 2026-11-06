#!/usr/bin/env python3
"""
FRIEND PAGE - EXTRA STRATEGIES BACKTEST (owner 2026-11-06): keep the elected friend rule of the app untouched and look for ADDITIONAL slips from
other rule variants (same size / structure as the base rule, other rank / side / prop-set / floor / skip choices), built the way the friend page
builds them (leg-difference ladder against the owner's proxies). Greedy selection on the first 60% of the slates (portfolio = base + extras,
maximise net / worst drawdown, keep ROI near the base), then the SAME portfolio is read on the last 40% (out of sample). READ-ONLY.
One app per process: FR_APP = PP | UD | SLEEPER | FLIFF | BETR. Flat $1 a slip.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE

APP = FE.FAPP
TM = APP != "UD"
SAMPLE = int(os.environ.get("FX_SAMPLE") or 500)
random.seed(7)


def grids(rule_idx):
    """rule variants for the base rule number rule_idx (same size / structure)"""
    if APP == "PP":
        g = list(itertools.product(("R", "RD"), ("O", "U", "B"), ("all", "lowvol", "rebounds", "combos"), ("p", "blend", "trail"),
                                   (0.62, 0.66, 0.70), (1, 2), (0, 1), ("all", "low")))
    elif APP == "UD":
        g = list(itertools.product(tuple(FE.POOLS), ("O", "U", "B"), tuple(FE.AF.PROPSETS), ("p", "ev"), (0.0, 0.55, 0.60), (0, 1)))
    else:
        g = [(o, sd, pr, "main", fl, gt, sk) for o, sd, pr, fl, gt, sk in itertools.product(
            ("p", "ev", "bl", "evbl", "edge"), ("any", "Over", "Under"), ("all", "low", "nolow"), (0.0, 0.55, 0.60), (0.0, 1.04), (0, 1))]
    if len(g) > SAMPLE:
        g = random.Random(11 + rule_idx).sample(g, SAMPLE)
    return g


def cand_of(legs, v):
    if APP == "PP":
        return FE.pp_cand(legs, v)
    if APP == "UD":
        return FE.ranked(legs, v), 1
    return FE.ranked(legs, v), 1


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    it = FE.pp_days(conn) if APP == "PP" else FE.app_days(conn)
    G = [grids(i) for i in range(len(FE.RULES))]
    res = collections.defaultdict(lambda: collections.defaultdict(list))
    base_keys = [f"BASE|{code}" for code, *_ in FE.RULES]
    days_all, nd = [], 0
    for season, d, legs in it:
        nd += 1
        if len(legs) < 3:
            continue
        days_all.append(d)
        H = FE.proxies(legs)
        for ri, (code, size, st, rule) in enumerate(FE.RULES):
            variants = [("BASE", rule)] + [("V", v) for v in G[ri]]
            for tag, v in variants:
                try:
                    cand, gc = cand_of(legs, v)
                    s = FE.build(cand, size, gc, H, frozenset(), teams=TM)
                    if not s:
                        continue
                    m = float(FE.pay_of(s, st))
                except Exception:
                    continue
                key = f"BASE|{code}" if tag == "BASE" else f"{code}|{v}"
                res[key][d].append(m - 1.0)
        if nd % 40 == 0:
            print(f"[{APP}] {nd} slates, {len(res)} variants", flush=True)
    conn.close()

    days = sorted(set(days_all))
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]
    test = [d for d in days if d >= cut]

    def series(keys, dsel):
        out = {}
        for d in dsel:
            xs = [x for k in keys for x in res[k].get(d, [])]
            if xs:
                out[d] = xs
        return out

    def stats(keys, dsel):
        s = series(keys, dsel)
        n = sum(len(v) for v in s.values())
        if not n:
            return None
        net = sum(sum(v) for v in s.values())
        cum = peak = dd = 0.0
        loss = worst = 0
        worstd = 0.0
        for d in dsel:
            if d not in s:
                continue
            x = sum(s[d]); cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
            if x < 0:
                loss += 1
            worstd = min(worstd, x)
        return dict(n=n, days=len(s), roi=net / n, net=net, dd=dd, loss=loss / len(s), worst=worstd, calmar=net / (dd + 1.0))

    def fmt(r):
        return "-" if not r else f"{r['n']:4d} sl {r['roi'] * 100:6.1f}% net {r['net']:7.1f} dd {r['dd']:5.1f} losing days {r['loss'] * 100:4.1f}% worst day {r['worst']:5.1f}"

    bk = [k for k in base_keys if k in res]
    b_tr, b_te, b_all = stats(bk, train), stats(bk, test), stats(bk, days)
    print("\n" + "=" * 110 + f"\n{APP}: {len(days)} slates, train {len(train)} (to {cut}), test {len(test)}, variants {len(res) - len(bk)}\n" + "=" * 110)
    print("BASE all  :", fmt(b_all)); print("BASE train:", fmt(b_tr)); print("BASE test :", fmt(b_te))

    # dedupe identical daily series, standalone filter on the train part
    seen, cands = set(), []
    for k in res:
        if k in bk:
            continue
        sig = tuple(sorted((d, round(sum(v), 4)) for d, v in res[k].items()))
        if sig in seen:
            continue
        seen.add(sig)
        st_tr = stats([k], train)
        if st_tr and st_tr["days"] >= 0.4 * len(train) and st_tr["roi"] >= 0.25:
            cands.append(k)
    print("candidates after dedupe + standalone train ROI >= 25%:", len(cands))

    chosen = []
    for rnd in range(4):
        best = None
        cur = stats(bk + chosen, train)
        for k in cands:
            if k in chosen:
                continue
            p = stats(bk + chosen + [k], train)
            if not p or p["roi"] < 0.85 * b_tr["roi"]:
                continue
            if p["calmar"] <= cur["calmar"] * 1.0:
                continue
            if best is None or p["calmar"] > best[0]["calmar"]:
                best = (p, k)
        if not best:
            break
        chosen.append(best[1])
        print(f"\n+extra {rnd + 1}: {best[1]}")
        print("   train portfolio :", fmt(stats(bk + chosen, train)))
        print("   TEST  portfolio :", fmt(stats(bk + chosen, test)), "  <-- out of sample")
        print("   extra alone TEST:", fmt(stats([best[1]], test)))
    print("\nSUMMARY (out of sample = last 40% of slates)")
    print("  base only       TEST:", fmt(b_te))
    for i in range(1, len(chosen) + 1):
        print(f"  base + {i} extra  TEST:", fmt(stats(bk + chosen[:i], test)))
    print("  base + extras ALL slates:", fmt(stats(bk + chosen, days)))


if __name__ == "__main__":
    main()
