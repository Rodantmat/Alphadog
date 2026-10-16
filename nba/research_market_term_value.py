#!/usr/bin/env python3
"""
RESEARCH - IS THE LIVE MARKET TERM WORTH SWITCHING ON? (2026-10-16; owner: "implement and run ... everything that improves ...
since day one. And then you monitor it").  READ-ONLY.

Three backtests of the SAME certified strategies at today's live caps (final-7 out), differing only in the market term:
  mf   market-free twin            (slip_engine_slips_mf / _mf_nosteals)       - what live does with the term OFF
  wo   WINDOW-ONLY twin            (slip_engine_slips_wo / _wo_nosteals)       - what live does with the term ON (books visible
                                                                                 at the window capture, the time P3 scores)
  all  certified market-inclusive  (slip_engine_slips / _nosteals)             - books from window AND close (lookahead; shown
                                                                                 for reference only)
Rule (written before the wo tables existed): switch the term ON when the wo portfolio's net AND ROI are >= the mf portfolio's in
BOTH seasons. Per strategy and per season it also prints the day-blocked bootstrap 90% interval of (wo - mf) daily net.
Env: DATABASE_URL, MV_DRAWS (2000).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES, ALLSTAR_ONLY, ROTATION_ONLY  # noqa: E402

DRAWS = int(os.environ.get('MV_DRAWS', '2000'))
SRC = {'mf': '_mf', 'wo': '_wo', 'all': ''}


def table(name, sfx):
    nos = name.startswith(('C_', 'D_', 'R_', 'W_'))
    return f"nba_score.slip_engine_slips{sfx}{'_nosteals' if nos else ''}"


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rng = np.random.default_rng(16)
    names = [n for n, s in STRATEGIES.items() if s[3] > 0 and n not in ALLSTAR_ONLY and n not in ROTATION_ONLY]   # the daily strategies
    daily = {src: defaultdict(lambda: defaultdict(lambda: [0.0, 0.0])) for src in SRC}   # src -> (name, season) -> day -> [stake, payout]
    for src, sfx in SRC.items():
        for name in names:
            comp, size, structure, cap = STRATEGIES[name][:4]
            for season, d, st, pay in conn.execute(f"""SELECT season, game_date, sum(stake), sum(payout) FROM {table(name, sfx)}
                                                     WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'
                                                     GROUP BY 1, 2""", (comp, size, structure, cap)).fetchall():
                a = daily[src][(name, season)][d]; a[0] += float(st); a[1] += float(pay)
    seasons = ('2024-25', '2025-26')
    print(f"{'strategy':<20} {'season':<8} " + " ".join(f"{s + ' ROI':>9} {s + ' net':>9}" for s in SRC) + "   wo-mf daily net 90% CI", flush=True)
    port = {src: {s: [0.0, 0.0] for s in seasons} for src in SRC}
    for name in names:
        for season in seasons:
            cells = []
            for src in SRC:
                dd = daily[src][(name, season)]
                st = sum(v[0] for v in dd.values()); pay = sum(v[1] for v in dd.values())
                port[src][season][0] += st; port[src][season][1] += pay
                cells.append(f"{(pay / st - 1) if st else 0:>+9.1%} {pay - st:>+9.1f}")
            dm, dw = daily['mf'][(name, season)], daily['wo'][(name, season)]
            days = sorted(set(dm) | set(dw))
            diff = np.array([(dw.get(d, [0, 0])[1] - dw.get(d, [0, 0])[0]) - (dm.get(d, [0, 0])[1] - dm.get(d, [0, 0])[0]) for d in days])
            if len(diff):
                boots = diff[rng.integers(0, len(diff), size=(DRAWS, len(diff)))].sum(axis=1)
                ci = f"[{np.quantile(boots, 0.05):+.1f}, {np.quantile(boots, 0.95):+.1f}]"
            else:
                ci = "-"
            print(f"{name:<20} {season:<8} " + " ".join(cells) + f"   {ci}", flush=True)
    print("\nPORTFOLIO (all daily strategies at live caps):", flush=True)
    ok = True
    for season in seasons:
        line = f"  {season}: " + " | ".join(f"{src} ROI {(p[1] / p[0] - 1):+.1%} net {p[1] - p[0]:+.1f}" for src, p in ((s, port[s][season]) for s in SRC))
        print(line, flush=True)
        mf, wo = port['mf'][season], port['wo'][season]
        ok &= (wo[1] - wo[0]) >= (mf[1] - mf[0]) and (wo[1] / wo[0]) >= (mf[1] / mf[0])
    print("VERDICT: " + ("SWITCH ON - the window-only market term beats market-free in both seasons (net and ROI)" if ok
                         else "KEEP OFF - the window-only market term does not beat market-free in both seasons"), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
