#!/usr/bin/env python3
"""
PROBE 5 - does /game_types price a SINGLE leg on its own?

WHY. Per-leg multipliers are currently mined as a 2-pick against a standard partner: factor = payout / 3.
The reversion schedule (payouts_srp) shows the server already has a 1-pick price (1.5x for a standard).
If a single-pick quote is answered, it is the cleanest per-leg multiplier possible:
  * no partner at all
  * HALF the payout of the 2-pick, so big demons fall below the ~9.1x compression knee that currently
    distorts their 2-pick-derived factor

WHAT IT DOES. Reuses the tested transport from pp_payout_map.py (chrome146 session + warm-up + proxy).
For one standard, the floor goblin, a mid goblin, a mid demon and the biggest demons on the board:
  1-pick quote  vs  2-pick quote against a standard partner.
If single picks are priced: expect 1-pick = 1.5 x f for small factors, and the 2-pick/2 to fall BELOW the
1-pick for the biggest demons (that gap is the compression the 2-pick method has been absorbing).
Quotes only. Writes nothing.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pp_payout_map as M  # noqa: E402


def main():
    px = M.proxies()
    doc = M.fetch_board(px)
    if not doc:
        print("RESULT|board unavailable", flush=True)
        return
    rows = M.parse_board(doc)
    std = [r for r in rows if r["odds"] == "standard"]
    gob = [r for r in rows if r["odds"] == "goblin"]
    dem = [r for r in rows if r["odds"] == "demon"]
    q = M.Quoter(px)

    def pay(rec, n):
        return (rec.get("power") or {}).get(str(n), {}).get(str(n))

    partner = std[0]
    # probe set: one standard, goblins across depth, demons across size (biggest last)
    other_std = next((r for r in std if r["player"] != partner["player"]), std[1])
    probe = [other_std] + gob[:1] + gob[len(gob) // 2:len(gob) // 2 + 1] + dem[:1] + dem[len(dem) // 2:len(dem) // 2 + 1]
    probe += sorted(dem, key=lambda r: r["line"])[-2:]
    print(f"PARTNER|{partner['name']}|{partner['stat']}|{partner['line']}", flush=True)
    for r in probe:
        if r["id"] == partner["id"] or r["player"] == partner["player"]:
            continue
        one = q.quote([(r["id"], "over")])
        two = q.quote([(partner["id"], "over"), (r["id"], "over")])
        p1, p2 = pay(one, 1), pay(two, 2)
        f1 = (p1 / 1.5) if p1 else None
        f2 = (p2 / 3.0) if p2 else None
        print(f"SINGLE|{r['name']}|{r['stat']}|{r['odds']}|{r['line']}"
              f"|1pick_status={one['status']}|1pick={p1}|factor_from_1pick={f1 and round(f1, 3)}"
              f"|2pick={p2}|factor_from_2pick={f2 and round(f2, 3)}"
              f"|1pick_full={ {k: v for k, v in one.items() if k in ('power', 'flex', 'error')} }", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
