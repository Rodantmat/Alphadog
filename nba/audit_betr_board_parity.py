#!/usr/bin/env python3
"""AUDIT (2026-11-01, owner 19:39 PT "Replace as you recommended"): the live Betr-board rules (betr_live_slip_engine.board_legs + select)
against the research harness that certified them (research_app_allegs AA_APP=betr: live_legs + day), on every 2026-27 slate with a Betr
board. READ-ONLY. Per slate: (1) the leg pool - same (player, prop, side, line, final_hp, books' chance) set; (2) per rule (main
B_BRD_4dyn, fallback B_BRD_3dyn_fb) and slips 1 / 2: the harness accumulator's slip count and P/L vs the engine's slips graded with the
same payout function. The engine's live-only started-game guard is off here (history has none). Also prints what the live cascade
(main, else fallback) would have built each slate. Env: DATABASE_URL."""
import os
import sys

os.environ["AA_APP"] = "betr"
os.environ.setdefault("ST_APP", "betr")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg  # noqa: E402

import research_app_allegs as A  # noqa: E402
import betr_live_slip_engine as E  # noqa: E402

RULES = [{"name": "B_BRD_4dyn", "k": 4, "order": "bl", "side": "mix", "game_cap": 1, "floor": 0.60, "slips": 2},
         {"name": "B_BRD_3dyn_fb", "k": 3, "order": "bl", "side": "mix", "game_cap": 2, "floor": 0.60, "slips": 2}]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = [d for d in A.AF.slate_days(conn) if A.AF.season_of(d) == "2026-27"]
    ok, tot, casc = True, {r["name"]: [0, 0.0] for r in RULES}, []
    for d in days:
        st = A.AF.box(conn, d)
        if not st:
            continue
        hl = [l for l in A.live_legs(conn, d, st) if l.get("p") is not None and l.get("team") is not None and l.get("event_id") is not None]
        el, last, _why = E.board_legs(conn, d, guard=False)
        if not hl and not el:
            continue
        # the harness's teams are the box score's; the engine's the roster (live has no box score) - compare on the harness's team
        ht = {l["player_id"]: l["team"] for l in hl}
        for l in el:
            l["team"] = ht.get(l["player_id"], l["team"])
            l["hit"] = A.AF.outcome(st, l)
        hk = sorted((l["player_id"], l["prop"], l["side"], l["line"], round(l["p"], 6), round(l["pf"], 6)) for l in hl)
        ek = sorted((l["player_id"], l["prop"], l["side"], l["line"], round(l["p"], 6), round(l["pf"], 6)) for l in el)
        # the harness keeps only players with a box score that day (team from the box) - known only after the game; the engine cannot
        # know before tip who sits, so it keeps them (they grade as voids). The pools must be equal once those players are set aside.
        boxed = {str(p) for p in st}
        extra = [x for x in ek if x[0] not in boxed]
        ek = [x for x in ek if x[0] in boxed]
        same_pool = hk == ek
        if extra:
            print(f"  {d}: engine keeps {len(extra)} legs of {len({x[0] for x in extra})} players with no box score (did not play)", flush=True)
        acc = A.Acc()
        A.day(acc, 0, hl)
        line = [f"{d}: pool harness {len(hk)} / engine {len(ek)} {'SAME' if same_pool else 'DIFF'}"]
        ok &= same_pool
        built = None
        for r in RULES:
            es = E.select(el, r)
            for ns in (1, 2):
                key = ("bl", "mix", "all", f"gc{r['game_cap']}", r["floor"], 0.0, 99.0, r["k"], "flex", ns)
                a = acc.d.get(key)
                hn, hpl = (int(a[0][0]), round(float(a[0][1]), 4)) if a is not None else (0, 0.0)
                epays = [A.pay(s, "flex") - 1 for s in es[:ns]] if len(es) >= ns else []
                en, epl = len(epays), round(sum(epays), 4)
                good = (hn, hpl) == (en, epl)
                ok &= good
                line.append(f"{r['name']} x{ns}: harness {hn} slips P/L {hpl:+.2f} | engine {en} P/L {epl:+.2f} {'OK' if good else 'MISMATCH'}")
            if built is None and es:
                built = (r["name"], es)
        if built:
            pl = sum(A.pay(s, "flex") - 1 for s in built[1])
            tot[built[0]][0] += len(built[1]); tot[built[0]][1] += pl
            casc.append(f"  {d} {built[0]}: " + " || ".join(" + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']}" for l in s) for s in built[1]) + f"  P/L {pl:+.2f}u")
        else:
            casc.append(f"  {d}: nothing qualifies")
        print(" | ".join(line), flush=True)
    print("\nLIVE CASCADE (main, else fallback) on this season's real Betr boards:")
    print("\n".join(casc))
    for n, (c, pl) in tot.items():
        print(f"  {n}: {c} slips, P/L {pl:+.2f}u, ROI {100 * pl / c if c else 0:+.1f}%")
    print("ALL PASS" if ok else "FAIL", flush=True)
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
