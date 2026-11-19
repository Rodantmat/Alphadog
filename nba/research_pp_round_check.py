#!/usr/bin/env python3
"""
PRIZEPICKS MULTIPLIER PREDICTION ROUNDS, BY GOBLIN / DEMON TIER (owner 2026-11-18 15:26 PT: "a few rounds of multiplier prediction for demons and goblins tiers to be
sure you have the right numbers"). READ-ONLY. Evidence = nba_market.pp_quote: every multi-pick lineup PrizePicks' own quote engine priced for us since PR_SINCE (the fresh
GRID / STACK / MIXED / P_* rounds: 2-6 picks, Power and Flex tables), each alternate also priced ALONE in the same run (its factor). The certified grader
(build_slip_engine.grade - what the slip screen, the engine and the backtests use) predicts every tier of every lineup from the legs' factors; the table says how close it is.
Tier of an alternate = its rung on the player's ladder that day (nba_market.pp_board_row): the goblin / demon line nearest the standard line is 1, the next 2, the rest 3.
Printed: per-leg factor by tier; model / quote by size x structure x misses; by the tiers a lineup contains; by how many alternates it holds; the worst misses.
Env: DATABASE_URL, PR_SINCE (UTC timestamp prefix, default today's UTC date).
"""
import datetime as dt
import math
import os
import statistics as stx
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_payout_proof as PP  # noqa: E402


def main():
    since = os.environ.get("PR_SINCE") or dt.datetime.utcnow().date().isoformat()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    runs = [r[0] for r in conn.execute("""SELECT DISTINCT run_file FROM nba_market.pp_quote WHERE league = 7 AND status = 200 AND quoted_at >= %s
                                           AND (section IN ('GRID','STACK','MIXED','FLEX','BASE') OR section LIKE 'P\\_%%')""", (since,)).fetchall()]
    print(f"PR|rounds since {since}: {len(runs)} run(s) {sorted(x[-21:-5] for x in runs)}", flush=True)
    if not runs:
        return
    # ladder rung of every alternate on each run's board
    tier = {}
    lad = defaultdict(list)
    for rf, pid, player, stat, line, odds in conn.execute("""SELECT run_file, projection_id::text, player, stat, line, odds FROM nba_market.pp_board_row
                                                             WHERE run_file = ANY(%s)""", (runs,)).fetchall():
        lad[(rf, player, stat)].append((str(pid), float(line), odds))
    for (rf, player, stat), v in lad.items():
        std = [x[1] for x in v if x[2] == "standard"]
        for kind in ("goblin", "demon"):
            r = sorted([x for x in v if x[2] == kind], key=lambda x: abs(x[1] - std[0]) if std else (-x[1] if kind == "goblin" else x[1]))
            for i, x in enumerate(r):
                tier[(rf, x[0])] = ("G" if kind == "goblin" else "D") + str(min(3, i + 1))
    rows = conn.execute("""SELECT run_file, seq, section, n, power, flex, power_adj, flex_adj, legs FROM nba_market.pp_quote
                           WHERE run_file = ANY(%s) AND status = 200 ORDER BY run_file, seq""", (runs,)).fetchall()
    fac, ftier = {}, defaultdict(list)
    for rf, seq, sec, n, pw, fx, pa, fa, legs in rows:
        if sec in ("LEG", "DRIFT", "LESS") and n == 2:
            alt = [l for l in legs if l.get("odds") in ("goblin", "demon")]
            p = ((pw or {}).get("2") or {}).get("2")
            if len(alt) == 1 and p:
                f = PP.decompress(float(p)) / 3.0
                fac[(rf, str(alt[0]["id"]), alt[0].get("side", "over"))] = f
                ftier[(tier.get((rf, str(alt[0]["id"])), alt[0]["odds"][0].upper() + "?"), alt[0].get("side", "over"))].append(f)
    print("PR|PER-LEG FACTOR (the leg's own price vs a standard leg = 1.00), by tier and side")
    for k in sorted(ftier):
        v = sorted(ftier[k])
        print(f"PR|  {k[0]} {k[1]:5s}: {len(v):4d} legs | median {stx.median(v):.3f} | p10 {v[len(v) // 10]:.3f} p90 {v[-1 - len(v) // 10]:.3f} | min {v[0]:.3f} max {v[-1]:.3f}")
    S = defaultdict(list); BYT = defaultdict(list); BYN = defaultdict(list); worst = []; skipped = 0; used = 0
    for rf, seq, sec, n, pw, fx, pa, fa, legs in rows:
        if sec in ("LEG", "DRIFT", "LESS", "ALTALT", "VALIDATE", "UNDER", "SLIPQ") or n < 2:
            continue
        f, tl = [], []
        for l in legs:
            if l.get("odds") in ("goblin", "demon"):
                f.append(fac.get((rf, str(l["id"]), l.get("side", "over"))))
                tl.append(tier.get((rf, str(l["id"])), l["odds"][0].upper() + "?") + ("u" if l.get("side") == "under" else ""))
            else:
                f.append(1.0)
        if any(x is None for x in f):
            skipped += 1
            continue
        used += 1
        sg = len({l["game"] for l in legs}) < n
        for (structure, h), v in sorted(PP.tiers({"power": pw, "flex": fx}, n).items()):
            if structure == "flex" and n == 2:
                continue                                      # 2-pick Flex is not a structure the engine builds or prices
            g = PP.grader(structure, f, h)
            r = g / v
            S[(n, structure, n - h)].append(r)
            for t in set(tl) or {"all standard"}:
                BYT[(t, structure, "all hit" if h == n else "partial")].append(r)
            BYN[(min(len(tl), 4), structure, "all hit" if h == n else "partial")].append(r)
            worst.append((abs(r - 1), r, n, structure, n - h, v, g, "+".join(sorted(tl)) or "standard", "SG" if sg else "", sec))
    print(f"PR|lineups used {used} (skipped {skipped}: an alternate had no solo price in its run)")

    def line(v):
        return (f"{len(v):4d} tiers | mean {stx.fmean(v):.3f} | within 1% {sum(abs(x - 1) <= .01 for x in v):4d} | within 3% {sum(abs(x - 1) <= .03 for x in v):4d} | "
                f"model high >3%: {sum(x > 1.03 for x in v):3d} | model low >3%: {sum(x < .97 for x in v):3d} | min {min(v):.3f} max {max(v):.3f}")
    print("PR|MODEL / PRIZEPICKS (1.000 = exact, above 1 = the screen would show more than PrizePicks pays) by size, structure, misses")
    for k in sorted(S):
        print(f"PR|  {k[0]}-pick {k[1]:5s} {k[2]} miss: {line(S[k])}")
    print("PR|BY THE TIER A LINEUP CONTAINS (u = the alternate taken Less)")
    for k in sorted(BYT):
        print(f"PR|  {k[0]:13s} {k[1]:5s} {k[2]:8s}: {line(BYT[k])}")
    print("PR|BY NUMBER OF ALTERNATES IN THE LINEUP (4 = four or more)")
    for k in sorted(BYN):
        print(f"PR|  {k[0]} alternates {k[1]:5s} {k[2]:8s}: {line(BYN[k])}")
    print("PR|WORST 25 MISSES")
    for w in sorted(worst, reverse=True)[:25]:
        print(f"PR|  model/quote {w[1]:.3f} | {w[2]}-pick {w[3]} {w[4]} miss | PrizePicks {w[5]:g} model {w[6]:.3f} | {w[7]} {w[8]} [{w[9]}]")
    conn.close()


if __name__ == "__main__":
    main()
