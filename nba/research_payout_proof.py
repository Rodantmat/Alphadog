#!/usr/bin/env python3
"""
RESEARCH - PROVE THE PRIZEPICKS SLIP PAYOUTS AGAINST PRIZEPICKS' OWN QUOTES (2026-10-18; owner: "Having the boards now, be sure
we are using the proper multipliers, prove, analyze and understand each of the available tables, including PrizePicks with the
techniques we already know").  READ-ONLY.

Evidence: nba_market.pp_quote - every status-200 quote of the PROOF run on the live NBA board (pp_payout_map.py PP_MODE=proof:
P_BASE all-standard, P_LESS half on Less, P_SG one same-game pair, P_D1 / P_D2 / P_G1 / P_GD alternates + standards, each
alternate also priced ALONE as a 2-pick vs a standard = its factor in the same run) and, with PROOF_ALL=1, every earlier
multi-pick quote (BASE / FLEX / MIXED / SAMEGAME, NBA and WNBA) whose alternates were priced alone in the same run.

For every quote and every tier PrizePicks returned (Power all-hit; Flex all-hit / one miss / two misses) it prints:
  quote          - PrizePicks' number
  grader         - build_slip_engine.grade (the certified grader the backtests, the live engine and the regrade use; the UI's
                   pricing.js is its JavaScript twin - test_nba_main_ui asserts parity)
  db / db_cons   - nba_market.pp_slip_power / pp_slip_power_conservative (the 2026-09-21 slip law; Power only)
Factor of an alternate = its 2-pick quote vs a standard / 3, de-compressed above the 9.1 knee (§1). Standards = 1.0.
Then per section: count, mean grader / quote, worst over and under, the same for db and db_cons.
Env: DATABASE_URL, PROOF_RUN (run_file; default the newest run with P_ sections), PROOF_ALL (0/1).
"""
import math
import os
import statistics as stx
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as bse  # noqa: E402


def decompress(p):
    return p if p <= 9.1 else 9.1 * (p / 9.1) ** (1 / 0.857)


def tiers(q, n):
    """{('power', hits) / ('flex', hits): payout} from one quote"""
    out = {}
    pw = (q['power'] or {}).get(str(n)) or {}
    fx = (q['flex'] or {}).get(str(n)) or {}
    for h, v in pw.items():
        if h.isdigit() and float(v) > 0:
            out[('power', int(h))] = float(v)
    for h, v in fx.items():
        if h.isdigit() and float(v) > 0:
            out[('flex', int(h))] = float(v)
    return out


def grader(structure, factors, hits):
    """build_slip_engine.grade on a slip whose first (n - hits) STANDARD legs miss (alternates hit when possible)"""
    n = len(factors)
    order = sorted(range(n), key=lambda i: (factors[i] != 1.0, i))       # standards miss first
    miss = set(order[:n - hits])
    slip = [{'hit': (i not in miss), 'factor': factors[i]} for i in range(n)]
    return bse.grade(slip, structure)[1]


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    run = os.environ.get('PROOF_RUN') or conn.execute(
        "SELECT run_file FROM nba_market.pp_quote WHERE section LIKE 'P\\_%' ORDER BY run_file DESC LIMIT 1").fetchone()[0]
    runs = [run]
    if os.environ.get('PROOF_ALL') == '1':
        runs += [r[0] for r in conn.execute("""SELECT DISTINCT run_file FROM nba_market.pp_quote
                                               WHERE section IN ('BASE','FLEX','MIXED','SAMEGAME') AND status = 200 AND run_file <> %s""",
                                            (run,)).fetchall()]
    print(f"runs: {runs[0]} (+{len(runs) - 1} earlier)" if len(runs) > 1 else f"run: {run}", flush=True)
    rows = conn.execute("""SELECT run_file, seq, league, section, n, n_games, note, power, flex, power_adj, flex_adj, legs
                           FROM nba_market.pp_quote WHERE run_file = ANY(%s) AND status = 200 ORDER BY run_file, seq""",
                        (runs,)).fetchall()
    fac = {}
    for rf, seq, lg, sec, n, ng, note, pw, fx, pa, fa, legs in rows:
        if sec in ('LEG', 'DRIFT', 'LESS') and n == 2:      # LESS = a goblin / demon taken Less vs a standard More (2026-10-20 grid)
            alt = [l for l in legs if l.get('odds') in ('goblin', 'demon')]
            p = ((pw or {}).get('2') or {}).get('2')
            if len(alt) == 1 and p:
                fac[(rf, alt[0]['id'], alt[0].get('side', 'over'))] = decompress(float(p)) / 3.0
    stats = defaultdict(lambda: defaultdict(list))
    shown = 0
    for rf, seq, lg, sec, n, ng, note, pw, fx, pa, fa, legs in rows:
        if sec in ('LEG', 'DRIFT', 'LESS', 'ALTALT', 'VALIDATE', 'UNDER') or n < 2:
            continue
        f = []
        for l in legs:
            if l.get('odds') in ('goblin', 'demon'):
                f.append(fac.get((rf, l['id'], l.get('side', 'over'))))
            else:
                f.append(1.0)
        if any(x is None for x in f):
            continue
        sg = len({l['game'] for l in legs}) < n
        q = {'power': pw, 'flex': fx}
        t = tiers(q, n)
        db = cons = None
        if ('power', n) in t:
            r = conn.execute("SELECT payout FROM nba_market.pp_slip_power(%s::numeric[])", ([round(x, 4) for x in f],)).fetchone()
            rc = conn.execute("SELECT payout FROM nba_market.pp_slip_power_conservative(%s::numeric[])", ([round(x, 4) for x in f],)).fetchone()
            db = float(r[0]) if r and r[0] is not None else None
            cons = float(rc[0]) if rc and rc[0] is not None else None
        n_alt_less = sum(1 for l in legs if l.get('odds') in ('goblin', 'demon') and l.get('side') == 'under')
        if n_alt_less:
            sec = f"{sec}+{n_alt_less}AL"                                # alternates taken Less in this slip
        key = f"{sec}{' SG' if sg and sec != 'P_SG' else ''} n{n}"
        line = []
        for (structure, h), v in sorted(t.items()):
            g = grader(structure, f, h)
            stats[(sec, structure, n, n - h)]['grader'].append(g / v)
            line.append(f"{structure[0].upper()}{h}/{n} q {v:g} g {g:.3f}")
            if structure == 'power' and h == n:
                if db is not None:
                    stats[(sec, structure, n, 0)]['db'].append(db / v)
                if cons is not None:
                    stats[(sec, structure, n, 0)]['db_cons'].append(cons / v)
                line.append(f"db {db} cons {cons}")
        if shown < 400:
            print(f"  {rf[-21:-5]} {key:<14} fp {round(math.prod(f), 3):>7} "
                  f"adj P {pa} F {fa} | " + " | ".join(line)
                  + f" | {' + '.join(str(l.get('name', '?')).split()[-1] + ':' + str(l.get('odds', '?'))[0] + (':U' if l.get('side') == 'under' else '') for l in legs)}",
                  flush=True)
            shown += 1
    print("\n== SUMMARY: model / quote by section, structure, size, misses (1.000 = exact; > 1 overpays vs PrizePicks) ==", flush=True)
    for (sec, structure, n, m), d in sorted(stats.items()):
        parts = []
        for k in ('grader', 'db', 'db_cons'):
            v = d.get(k)
            if v:
                parts.append(f"{k} n={len(v)} mean {stx.fmean(v):.3f} min {min(v):.3f} max {max(v):.3f}")
        print(f"  {sec:<9} {structure:<5} {n}-pick {m} miss | " + " | ".join(parts), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
