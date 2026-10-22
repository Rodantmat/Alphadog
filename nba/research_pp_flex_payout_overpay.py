#!/usr/bin/env python3
"""
RESEARCH - WHERE DOES OUR GRADER PAY MORE THAN PRIZEPICKS QUOTED? (2026-10-22 PT; follow-up of research_pp_flex_payout_proof.py run
39822487137: with alternates, 2-4-pick Flex all-hit paid <= PrizePicks on 88.6-98.9% of quotes, Power on 93.5-94.1%, with Power
outliers up to +1194).  READ-ONLY.

Same comparison, but each leg's factor is taken from the SAME quoting run (pp_mined_leg.run_file = pp_quote.run_file) when it exists
(else the latest), so a factor that moved between runs is not mistaken for a grader error. Per size x structure x tier x
(same-game / adjusted flags): quotes, share ours <= PP, share ours > PP by more than 5%, mean ours / PP. Then the 12 worst overpays
of each 2-4 Flex tier and of Power with their legs (kind, side, factor), fp, ours, PP. Finally the Flex all-hit overpay by fp band.
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


def jl(x, d):
    if x is None:
        return d
    return x if isinstance(x, (dict, list)) else json.loads(x)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    EX.install_flex2_alt(conn)
    fac_run, fac = {}, {}
    for rf, pid, line, kind, side, f in conn.execute("""SELECT run_file, projection_id, line::float8, kind, lower(side), factor_mined::float8
                                                        FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL ORDER BY quoted_at"""):
        k = (str(pid), round(line, 1), kind, side[:1])
        fac[k] = f
        fac_run[(rf,) + k] = f
    rows = conn.execute("""SELECT run_file, section, n, power, flex, legs, power_adj, flex_adj FROM nba_market.pp_quote
                           WHERE league = 7 AND n IN (2, 3, 4) AND status = 200 AND legs IS NOT NULL""").fetchall()
    acc = defaultdict(list)
    worst = defaultdict(list)
    band = defaultdict(list)
    same_run = other_run = 0
    skipped = defaultdict(int)
    for rf, section, n, power, flex, legs, padj, fadj in rows:
        legs = jl(legs, [])
        fp, alt, ok, desc = 1.0, False, True, []
        for l in legs:
            kind = str(l.get("odds") or "standard").lower()
            side = str(l.get("side", "over")).lower()[:1]
            if kind == "standard":
                desc.append(f"S{side}")
                continue
            k = (str(l.get("id")), round(float(l.get("line") or 0), 1), kind, side)
            f = fac_run.get((rf,) + k)
            if f is None:
                f = fac.get(k)
                other_run += f is not None
            else:
                same_run += 1
            if f is None:
                ok = False
                break
            fp *= f
            alt = True
            desc.append(f"{kind[0].upper()}{side}{f:.3f}")
        if not ok:
            skipped[n] += 1
            continue
        games = [l.get("game") for l in legs]
        sg = len(games) > len(set(games))
        pw, fx = jl(power, {}), jl(flex, {})
        tag = f"{'SG' if sg else 'xG'}{' Padj' if padj else ''}{' Fadj' if fadj else ''}"
        pp_power = (pw.get(str(n)) or {}).get(str(n))
        if pp_power is not None and alt:
            ours = SE.pp_payout(n, n, "power", fp, alt, same_game=sg)
            acc[(n, "power", "all hit", tag)].append((ours, float(pp_power)))
            worst[(n, "power", "all hit")].append((ours - float(pp_power), ours, float(pp_power), fp, " ".join(desc), section, tag))
        t = fx.get(str(n)) or {}
        for hits, lab in ((n, "all hit"), (n - 1, "one miss")):
            if not alt:
                continue
            pp_v = t.get(str(hits))
            ours = SE.pp_payout(n, hits, "flex", fp, alt, same_game=sg)
            ppf = 0.0 if pp_v is None else float(pp_v)
            acc[(n, "flex", lab, tag)].append((ours, ppf))
            worst[(n, "flex", lab)].append((ours - ppf, ours, ppf, fp, " ".join(desc), section, tag))
            if lab == "all hit":
                b = "<0.5" if fp < 0.5 else "0.5-0.8" if fp < 0.8 else "0.8-1.25" if fp < 1.25 else "1.25-2" if fp < 2 else "2-4" if fp < 4 else ">=4"
                band[(n, b)].append((ours, ppf))
    print(f"quotes {len(rows):,} | alt legs priced with the same run's factor {same_run:,}, another run's {other_run:,} | skipped {dict(skipped)}")
    print("\nWITH ALTERNATES: size structure tier       flags            quotes  ours<=PP  ours>PP+5%  mean ours/PP")
    for key in sorted(acc):
        v = acc[key]
        o = np.array([a for a, _ in v])
        p = np.array([b for _, b in v])
        pos = p > 0
        print(f"  {key[0]}  {key[1]:<6} {key[2]:<10} {key[3]:<16} {len(v):>6}   {100 * np.mean(o <= p + 1e-6):6.1f}%   "
              f"{100 * np.mean(o > 1.05 * p + 1e-6):6.1f}%     {np.mean(o[pos] / p[pos]) if pos.any() else float('nan'):.3f}"
              f"{'   PP offers no tier on ' + str(int((~pos).sum())) if (~pos).any() else ''}")
    print("\nFLEX ALL HIT WITH ALTERNATES by factor product: size band  quotes  ours<=PP  mean ours/PP  mean PP")
    for key in sorted(band):
        v = band[key]
        o = np.array([a for a, _ in v])
        p = np.array([b for _, b in v])
        pos = p > 0
        print(f"  {key[0]}  {key[1]:<9} {len(v):>6}   {100 * np.mean(o <= p + 1e-6):6.1f}%   "
              f"{np.mean(o[pos] / p[pos]) if pos.any() else float('nan'):.3f}   {np.mean(p):.2f}")
    for key in sorted(worst):
        w = sorted(worst[key], reverse=True)[:12]
        print(f"\nWORST {key}: (ours - PP, ours, PP, fp, legs, section, flags)")
        for x in w:
            if x[0] <= 1e-6:
                break
            print(f"  {x[0]:+8.2f}  ours {x[1]:8.2f}  PP {x[2]:8.2f}  fp {x[3]:7.3f}  {x[4]:<40} {x[5]} {x[6]}")


if __name__ == "__main__":
    main()
