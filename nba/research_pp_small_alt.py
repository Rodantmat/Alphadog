#!/usr/bin/env python3
"""
RESEARCH - PRIZEPICKS ALTERNATIVE STRATEGIES FOR SMALL SLATES (2026-10-27; owner 14:07 PT "Check alternative strategies, different
slip composition and structure"). READ-ONLY.

Same history, legs, trailing window and payout rules that certified portfolio B (research_portfolio_caps legs, fixed tie order,
portfolio_b.prepare, void legs unknown in advance, PrizePicks payout v3 - goblin / demon factors priced). Small slate = <= G games
(G = 4 / 5 / 6). One rule = one way to build the slate's slips:
  line types   R (standard) | R+G (standard + goblins) | R+D (standard + demons) | G (goblins only) | ALL
  props        all | points | rebounds | assists | threes | combos (PRA / PR / PA / RA) | lowvol (steals / blocks / turnovers / stocks)
               | no-lowvol
  side         Over + Under | Over | Under
  rank         final_hp | final_hp x factor (EV) | trailing cell hit (20 slates)
  floor        final_hp >= .52 / .56 / .60 / .64 / .68 / .72
  skip         the top 0 / 1 legs
  per game     <= 1 / 2 / 3 legs
  slips        1 or 2 a slate (the 2nd from players not in the 1st)
  structure    2-6 picks, Power and Flex (Flex from 3)
ANTI-LUCK: every rule is reported per season; the honest test is OUT OF SAMPLE - rules ranked on one season, measured on the other
(both directions). The report shows how the top-ranked rules of the training season did in the test season, then the rules
positive in both seasons with >= 25 slips in each, ranked by the worse season's ROI lower bound. Env: DATABASE_URL, PA_G (4,5,6).
"""
import itertools
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402

GS = [int(x) for x in (os.environ.get("PA_G") or "4,5,6").split(",")]
HIST = PC.HIST
TIERS = {"R": lambda t: t == "R", "RG": lambda t: t == "R" or t.startswith("G"), "RD": lambda t: t == "R" or t.startswith("D"),
         "G": lambda t: t.startswith("G"), "ALL": lambda t: True}
PROPS = {"all": None, "points": {"points"}, "rebounds": {"rebounds"}, "assists": {"assists"}, "threes": {"threes_made"},
         "combos": {"pra", "pts_reb", "pts_ast", "reb_ast"}, "lowvol": {"steals", "blocks", "turnovers", "stocks"},
         "nolowvol": {"points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast"}}
SIDES = {"B": ("Over", "Under"), "O": ("Over",), "U": ("Under",)}
RANKS = ("p", "ev", "trail")
FLOORS = (.52, .56, .60, .64, .68, .72)
SKIPS = (0, 1)
GCS = (1, 2, 3)
STRUCTS = [(s, st) for s in (2, 3, 4, 5, 6) for st in ("power", "flex") if not (st == "flex" and s < 3)]


def key(l):
    return (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"])


def lb(x):
    x = np.asarray(x, float)
    return x.mean() - (x.std(ddof=1) / np.sqrt(len(x)) if len(x) > 1 else 0)


def sel(c, gc, size, banned):
    pick, players, games = [], set(), defaultdict(int)
    for l in c:
        if l["player"] in players or l["player"] in banned or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == size:
            break
    if len(pick) == size and len({l["team_id"] for l in pick}) >= 2:
        return pick
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    preps, ngames, seas = [], [], []
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        preps.append(PB.prepare(legs, tr.rates()))
        ngames.append(len({l["event_id"] for l in legs}))
        seas.append(k[0])
        tr.push(legs)
    print(f"{len(horder)} history slates; games per slate: " +
          ", ".join(f"{g}:{ngames.count(g)}" for g in sorted(set(ngames))), flush=True)

    for G in GS:
        small = [i for i in range(len(horder)) if ngames[i] <= G]
        ss = [seas[i] for i in small]
        print(f"\n================ SMALL SLATE <= {G} games: {len(small)} slates "
              f"({', '.join(f'{s} {ss.count(s)}' for s in HIST)}) ================", flush=True)
        # per slate, per (tiers, props, side, rank): the sorted candidate list (floor / skip / caps applied after)
        res = defaultdict(lambda: [[] for _ in small])     # rule -> per small slate list of multipliers
        for j, i in enumerate(small):
            p = preps[i]
            for tk, pk, sk_, rk in itertools.product(TIERS, PROPS, SIDES, RANKS):
                tf, pset, sides = TIERS[tk], PROPS[pk], SIDES[sk_]
                base = [l for l in p if tf(l["tier"]) and l["side"] in sides and (pset is None or l["prop"] in pset)]
                if len(base) < 2:
                    continue
                if rk == "p":
                    base.sort(key=lambda l: -l["p"])
                elif rk == "ev":
                    base.sort(key=lambda l: -l["p"] * float(l["factor"] or 1))
                else:
                    base.sort(key=lambda l: (-l["_trail"], -l["p"]))
                for fl in FLOORS:
                    c0 = [l for l in base if l["p"] >= fl]
                    if len(c0) < 2:
                        break
                    for skp, gc in itertools.product(SKIPS, GCS):
                        c = c0[skp:]
                        for size, st in STRUCTS:
                            s1 = sel(c, gc, size, set())
                            if s1 is None:
                                continue
                            m1 = PC.grade(s1, st)
                            res[(tk, pk, sk_, rk, fl, skp, gc, size, st, 1)][j].append(m1)
                            s2 = sel(c, gc, size, {l["player"] for l in s1})
                            r2 = res[(tk, pk, sk_, rk, fl, skp, gc, size, st, 2)][j]
                            r2.append(m1)
                            if s2 is not None:
                                r2.append(PC.grade(s2, st))
        print(f"  {len(res)} rules built", flush=True)

        stats = {}
        for rule, per in res.items():
            out = {}
            for s in HIST:
                x = [m - 1 for d, sv in zip(per, ss) if sv == s for m in d]
                out[s] = (len(x), float(np.mean(x)) if x else 0.0, lb(x) if x else -9)
            allx = [m - 1 for d in per for m in d]
            pl = np.array([sum(m - 1 for m in d) for d in per])
            out["all"] = (len(allx), float(np.mean(allx)) if allx else 0.0, lb(allx) if allx else -9)
            out["dd"] = PC.max_dd(pl)
            out["won"] = float(np.mean(np.array(allx) > 0)) if allx else 0
            out["days"] = int(sum(1 for d in per if d))
            stats[rule] = out

        def lab(r):
            tk, pk, sk_, rk, fl, skp, gc, size, st, ns = r
            return f"{size}-pick {st:<5} lines {tk:<3} props {pk:<8} side {sk_} rank {rk:<5} p>={fl:.2f} skip {skp} <={gc}/game {ns} slip(s)"

        def row(r):
            o = stats[r]
            return (f"{lab(r)} | {o['all'][0]:4d} slips {o['days']:3d} slates | ROI {100 * o['all'][1]:+6.1f}% | "
                    f"{HIST[0]} {100 * o[HIST[0]][1]:+5.0f}% ({o[HIST[0]][0]}) / {HIST[1]} {100 * o[HIST[1]][1]:+5.0f}% ({o[HIST[1]][0]}) | "
                    f"dd {o['dd']:5.1f}u | won {100 * o['won']:.0f}%")

        print("\n  OUT OF SAMPLE - rules ranked on one season (ROI lower bound, >= 20 slips there), measured on the other")
        for tr_s, te_s in ((HIST[0], HIST[1]), (HIST[1], HIST[0])):
            cand = [r for r, o in stats.items() if o[tr_s][0] >= 20 and o[te_s][0] >= 15]
            top = sorted(cand, key=lambda r: -stats[r][tr_s][2])[:200]
            te = [stats[r][te_s][1] for r in top]
            print(f"   train {tr_s} -> test {te_s}: of the top {len(top)} training rules, {sum(1 for x in te if x > 0)} positive in the test "
                  f"season; mean test ROI {100 * np.mean(te) if te else 0:+.1f}% (training mean {100 * np.mean([stats[r][tr_s][1] for r in top]) if top else 0:+.1f}%)")
            for size, st in STRUCTS:
                b = [r for r in top if r[7] == size and r[8] == st][:3]
                for r in b:
                    o = stats[r]
                    print(f"      {lab(r)} | train {100 * o[tr_s][1]:+.0f}% ({o[tr_s][0]}) -> test {100 * o[te_s][1]:+.0f}% ({o[te_s][0]})")

        print("\n  BOTH SEASONS POSITIVE, >= 25 slips in each - by the worse season's ROI lower bound (top 40)")
        ok = [r for r, o in stats.items() if all(o[s][0] >= 25 and o[s][1] > 0 for s in HIST)]
        ok.sort(key=lambda r: -min(stats[r][s][2] for s in HIST))
        seen = set(); shown = 0
        for r in ok:
            sig = (round(stats[r]["all"][1], 4), stats[r]["all"][0])
            if sig in seen:
                continue
            seen.add(sig); shown += 1
            print("   " + row(r))
            if shown >= 40:
                break
        print(f"   ({len(ok)} rules qualify)")
        print("\n  BEST OF EACH STRUCTURE (both seasons positive, >= 25 slips each)")
        for size, st in STRUCTS:
            b = [r for r in ok if r[7] == size and r[8] == st]
            print("   " + (row(b[0]) if b else f"{size}-pick {st}: none qualifies"))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
