#!/usr/bin/env python3
"""
RESEARCH - ARE OUR 2 / 3 / 4-PICK FLEX (AND POWER) MULTIPLIERS PRIZEPICKS' OWN? (2026-10-22 PT; owner 10:16 PT: "if you are not sure
about the multipliers, go to PrizePicks, build slips, get the multipliers").  READ-ONLY.

Every NBA lineup PrizePicks priced for us (nba_market.pp_quote, its /game_types quote engine - Power AND Flex tables) with 2-4
picks is re-priced by OUR grader (build_slip_engine.pp_payout, grader v3; 2-pick Flex with alternates from the quote envelope,
research_exhaustive_pp.install_flex2_alt) from the legs' factors (each goblin / demon leg's factor = PrizePicks' own 2-pick price of
that leg, nba_market.pp_mined_leg.factor_mined; a standard leg = 1.0; legs without a mined factor -> the quote is skipped and
counted). Per size x structure x tier (all hit, one miss): quotes compared, share where ours <= PrizePicks' (we never overpay),
median ours / PrizePicks', the worst overpay. A tier PrizePicks does not offer (absent in its table) must be 0 in ours too.
Env: DATABASE_URL.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE        # noqa: E402
import research_exhaustive_pp as EX   # noqa: E402


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    EX.install_flex2_alt(conn)
    fac = {}
    for pid, line, kind, side, f, q in conn.execute("""SELECT projection_id, line::float8, kind, lower(side), factor_mined::float8, quoted_at
                                                      FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL ORDER BY quoted_at"""):
        fac[(str(pid), round(line, 1), kind, side[:1])] = f      # latest wins
    rows = conn.execute("""SELECT section, n, power, flex, legs, quoted_at FROM nba_market.pp_quote
                           WHERE league = 7 AND n IN (2, 3, 4) AND status = 200 AND legs IS NOT NULL""").fetchall()
    acc = defaultdict(list)
    skipped = defaultdict(int)
    for section, n, power, flex, legs, qa in rows:
        legs = legs if isinstance(legs, list) else json.loads(legs)
        fp, alt, ok = 1.0, False, True
        for l in legs:
            kind = str(l.get("odds") or "standard").lower()
            if kind == "standard" and str(l.get("side", "over")).lower().startswith("o"):
                continue
            if kind == "standard":
                continue                               # a standard Less is priced like a standard More (flat)
            f = fac.get((str(l.get("id")), round(float(l.get("line") or 0), 1), kind, str(l.get("side", "over")).lower()[:1]))
            if f is None:
                ok = False
                break
            fp *= f
            alt = True
        if not ok:
            skipped[n] += 1
            continue
        games = [l.get("game") for l in legs]
        sg = len(games) > len(set(games))
        pw = power if isinstance(power, dict) else json.loads(power or "{}")
        fx = flex if isinstance(flex, dict) else json.loads(flex or "{}")
        pp_power = (pw.get(str(n)) or {}).get(str(n))
        if pp_power is not None:
            ours = SE.pp_payout(n, n, "power", fp, alt, same_game=sg)
            acc[(n, "power", "all hit", alt)].append((ours, float(pp_power)))
        t = fx.get(str(n)) or {}
        for hits, lab in ((n, "all hit"), (n - 1, "one miss")):
            pp_v = t.get(str(hits))
            ours = SE.pp_payout(n, hits, "flex", fp, alt, same_game=sg)
            if pp_v is None:
                acc[(n, "flex", lab + " (not offered)", alt)].append((ours, 0.0))
            else:
                acc[(n, "flex", lab, alt)].append((ours, float(pp_v)))
    print(f"quotes read {len(rows):,} | skipped (a leg without a mined factor): {dict(skipped)}")
    print("\nsize structure tier                       legs        quotes  ours<=PP   median ours/PP   worst overpay (ours - PP)")
    for key in sorted(acc):
        n, st, lab, alt = key
        v = acc[key]
        o = np.array([a for a, _ in v])
        p = np.array([b for _, b in v])
        le = float(np.mean(o <= p + 1e-6))
        ratio = np.median(o[p > 0] / p[p > 0]) if (p > 0).any() else float("nan")
        worst = float(np.max(o - p))
        print(f"  {n}  {st:<6} {lab:<28} {'with alt' if alt else 'standard':<10} {len(v):>6}   {100 * le:6.1f}%   {ratio:8.3f}        {worst:+.2f}")


if __name__ == "__main__":
    main()
