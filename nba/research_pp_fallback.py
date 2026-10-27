#!/usr/bin/env python3
"""
RESEARCH - A PRIZEPICKS FALLBACK STRATEGY FOR THIN NIGHTS (2026-10-27; owner 14:59 PT "It needs to be a rule and a strategy that will
most often work as a fallback, not a single pick for this situation"). READ-ONLY.

TRIGGER: the night portfolio B builds few slips (measured, not guessed from the game count): B built <= T slips, T = 1 / 2 / 3.
History = the certified research legs (309 slates); this season = the live window boards graded on the box score (as
research_pp_2pick.live_slates). On trigger nights only, one FALLBACK RULE builds its slip(s):
  lines R | R+G | R+D | ALL; props all | no-low-volume | low-volume; side both | Over | Under; rank final_hp | final_hp x factor |
  blend (final_hp, trailing cell hit); floor .52 .. .70 (step .03); skip top 0 / 1; <= 1 / 2 legs a game; 1 / 2 slips;
  EVERY structure 2-6 picks, Power and Flex.
ROBUSTNESS (against a lucky setting): a rule's NEIGHBOURHOOD = the same rule at floor -.03 / +.03 and with the skip toggled; a rule is
ROBUST when it and every neighbour are positive in the training data.
THE HONEST TEST - the selection method run out of sample: pick the best robust rule per structure on 2024-25 trigger nights, report it
on 2025-26 and this season; then pick on 2025-26, report on 2024-25 and this season. Also: the rules robust in BOTH history seasons,
with this season and the cash rate (slips won).
Env: DATABASE_URL, FB_T (comma list, default 1,2,3), FB_DAY (today PT - shows the fallback slip(s) on today's board).
"""
import datetime as dt
import itertools
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import research_pp_2pick as R2                       # noqa: E402
import live_slip_engine as L                         # noqa: E402

HIST = list(PC.HIST)
CUR = "2026-27"
TS = [int(x) for x in (os.environ.get("FB_T") or "1,2,3").split(",")]
TIERS = {"R": lambda t: t == "R", "RG": lambda t: t == "R" or t.startswith("G"), "RD": lambda t: t == "R" or t.startswith("D"),
         "ALL": lambda t: True}
PROPS = {"all": None, "nolowvol": {"points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast"},
         "lowvol": {"steals", "blocks", "turnovers", "stocks"}}
SIDES = {"B": ("Over", "Under"), "O": ("Over",), "U": ("Under",)}
RANKS = ("p", "ev", "blend")
FLOORS = (0.52, 0.55, 0.58, 0.61, 0.64, 0.67, 0.70)
SKIPS = (0, 1)
GCS = (1, 2)
NSL = (1, 2)
STRUCTS = [(s, st) for s in (2, 3, 4, 5, 6) for st in ("power", "flex") if not (st == "flex" and s < 3)]


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


def b_count(prep):
    return sum(1 for u in PB.UNITS if PB.unit_slip(prep, u) is not None)


def main():
    today = dt.date.fromisoformat(os.environ.get("FB_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=R2.key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    slates = []
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        prep = PB.prepare(legs, tr.rates())
        slates.append((k[0], k[1], prep))
        tr.push(legs)
    for d, prep in R2.live_slates(conn, today):
        slates.append((CUR, d, prep))
    tlegs = [dict(l, p=float(l["score"])) for l in L.load_board_legs(conn, today)
             if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
    tprep = PB.prepare(tlegs, L.pb_rates(conn, today))
    bc = [b_count(p) for _, _, p in slates]
    print(f"slates {len(slates)}; B slips a night distribution: " +
          ", ".join(f"{k}:{bc.count(k)}" for k in range(7)) + f"; today B builds {b_count(tprep)}", flush=True)
    for s in HIST + [CUR]:
        x = [b for (ss, _, _), b in zip(slates, bc) if ss == s]
        print(f"   {s}: {len(x)} nights, B built <= 1 on {sum(1 for b in x if b <= 1)}, <= 2 on {sum(1 for b in x if b <= 2)}, "
              f"<= 3 on {sum(1 for b in x if b <= 3)}")

    for T in TS:
        trig = [i for i, b in enumerate(bc) if b <= T]
        print(f"\n================ TRIGGER: B built <= {T} slips - {len(trig)} nights "
              f"({', '.join(f'{s} {sum(1 for i in trig if slates[i][0] == s)}' for s in HIST + [CUR])}) ================", flush=True)
        res = defaultdict(lambda: defaultdict(list))   # rule -> season -> multipliers
        todays = {}
        for i in trig + [-1]:
            season, _, prep = slates[i] if i >= 0 else ("TODAY", today, tprep)
            for tk, pk, sk_, rk in itertools.product(TIERS, PROPS, SIDES, RANKS):
                tf, pset, sides = TIERS[tk], PROPS[pk], SIDES[sk_]
                base = [l for l in prep if tf(l["tier"]) and l["side"] in sides and (pset is None or l["prop"] in pset)]
                if len(base) < 2:
                    continue
                base.sort(key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"] or 1)) if rk == "ev"
                          else (lambda l: -l["_blend"]))
                for fl in FLOORS:
                    c0 = [l for l in base if l["p"] >= fl]
                    for skp, gc in itertools.product(SKIPS, GCS):
                        c = c0[skp:]
                        for size, st in STRUCTS:
                            s1 = sel(c, gc, size, set())
                            s2 = sel(c, gc, size, {l["player"] for l in s1}) if s1 else None
                            for ns in NSL:
                                rule = (tk, pk, sk_, rk, fl, skp, gc, size, st, ns)
                                got = [s for s in ([s1, s2][:ns]) if s is not None]
                                if i < 0:
                                    todays[rule] = got
                                    continue
                                res[rule][season].extend(PC.grade(s, st) for s in got)
        print(f"  {len(res)} rules", flush=True)

        def st_(r, s):
            x = np.array(res[r].get(s, []), float) - 1
            if not len(x):
                return 0, 0.0, -9.0, 0.0
            lbv = x.mean() - (x.std(ddof=1) / np.sqrt(len(x)) if len(x) > 1 else 1)
            return len(x), float(x.mean()), float(lbv), float(np.mean(x > 0))

        def neighbours(r):
            tk, pk, sk_, rk, fl, skp, gc, size, st, ns = r
            out = []
            for f2 in (round(fl - 0.03, 2), round(fl + 0.03, 2)):
                if f2 in FLOORS:
                    out.append((tk, pk, sk_, rk, f2, skp, gc, size, st, ns))
            out.append((tk, pk, sk_, rk, fl, 1 - skp, gc, size, st, ns))
            return out

        def robust(r, s, mn):
            n, m, _, _ = st_(r, s)
            if n < mn or m <= 0:
                return False
            return all(st_(q, s)[1] > 0 and st_(q, s)[0] >= mn // 2 for q in neighbours(r) if q in res)

        def lab(r):
            tk, pk, sk_, rk, fl, skp, gc, size, st, ns = r
            return f"{size}-pick {st:<5} lines {tk:<3} props {pk:<8} side {sk_} rank {rk:<5} p>={fl:.2f} skip {skp} <={gc}/game {ns} slip(s)"

        def row(r):
            parts = []
            for s in HIST + [CUR]:
                n, m, _, w = st_(r, s)
                parts.append(f"{s} {100 * m:+5.0f}% ({n}, won {100 * w:.0f}%)")
            t = todays.get(r) or []
            tt = " || ".join(" + ".join(f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} [{l['tier']}] {100 * l['p']:.0f}%" for l in s)
                             for s in t) or "no slip"
            return f"{lab(r)} | " + " | ".join(parts) + f" | TODAY: {tt}"

        print("\n  THE SELECTION METHOD OUT OF SAMPLE (best robust rule per structure, by the training season's lower bound)")
        for tr_s, others in ((HIST[0], (HIST[1], CUR)), (HIST[1], (HIST[0], CUR))):
            tot = {o: [] for o in others}
            print(f"   picked on {tr_s}:")
            for size, st in STRUCTS:
                cand = [r for r in res if r[7] == size and r[8] == st and robust(r, tr_s, 15)]
                if not cand:
                    print(f"     {size}-pick {st}: no robust rule")
                    continue
                best = max(cand, key=lambda r: st_(r, tr_s)[2])
                for o in others:
                    tot[o].extend(np.array(res[best].get(o, []), float) - 1)
                print(f"     {lab(best)} | train {100 * st_(best, tr_s)[1]:+.0f}% ({st_(best, tr_s)[0]}) -> " +
                      " / ".join(f"{o} {100 * st_(best, o)[1]:+.0f}% ({st_(best, o)[0]}, won {100 * st_(best, o)[3]:.0f}%)" for o in others))
            print("     ALL STRUCTURES TOGETHER -> " + " / ".join(f"{o} {100 * np.mean(v) if len(v) else 0:+.1f}% on {len(v)} slips" for o, v in tot.items()))

        print("\n  ROBUST IN BOTH HISTORY SEASONS (rule + every neighbour positive, >= 15 slips each) - by the worse season's lower bound")
        both = [r for r in res if robust(r, HIST[0], 15) and robust(r, HIST[1], 15)]
        both.sort(key=lambda r: -min(st_(r, s)[2] for s in HIST))
        seen, shown = set(), 0
        for r in both:
            sig = tuple(round(st_(r, s)[1], 3) for s in HIST)
            if sig in seen:
                continue
            seen.add(sig); shown += 1
            print("   " + row(r))
            if shown >= 30:
                break
        print(f"   ({len(both)} rules robust in both seasons; {sum(1 for r in both if st_(r, CUR)[0] >= 3 and st_(r, CUR)[1] > 0)} of them also "
              f"positive this season with >= 3 slips)")
        print("   by structure:")
        for size, st in STRUCTS:
            b = [r for r in both if r[7] == size and r[8] == st]
            print("     " + (row(b[0]) if b else f"{size}-pick {st}: none"))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
