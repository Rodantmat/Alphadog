#!/usr/bin/env python3
"""
RESEARCH - WOULD A "MARKET AGREES" FILTER LIFT THE LIVE PRIZEPICKS STRATEGIES? (2026-10-22 PT; owner 09:12 PT: "sharp those
logics, understand what we can do to improve it, increase ROI").  READ-ONLY.

Finding that prompted it (2026-10-22, PrizePicks standard legs of the window-only twin joined to the books' no-vig at the same
line): inside every model-probability band the legs whose side the books also favour (nv >= 0.50) hit 1.5-3 points more than the
legs the books lean against (nv < 0.50), in both seasons - e.g. p 0.60-0.65: 0.539 vs 0.519 (2024-25), 0.548 vs 0.528 (2025-26).
Question: inside the slips the LIVE strategies actually take (the live twin backtest, nba_score.slip_engine_slips_wo /
_wo_nosteals, k <= cap, regular season, final 7 days out), how do the legs split by market agreement, how do they hit, and how
do slips with 0 / 1 / 2+ disagreeing legs return? A slip with no disagreeing leg and a higher ROI = a filter worth building into
the engine (replace a disagreeing leg with the next candidate) - built and certified separately, never assumed from this table.
Agreement per leg: nv_side of that side at that line from nba_score.ud_window_legs_curr (DraftKings / Bovada no-vig); 'none' when
no book priced that exact line.
Env: DATABASE_URL.
"""
import os
import re
import sys
import unicodedata
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402


def norm(x):
    x = unicodedata.normalize("NFKD", str(x or "")).encode("ascii", "ignore").decode().lower()
    x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x)
    return re.sub(r"[^a-z]", "", x)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    sfx = (conn.execute("SELECT config_json->>'suffix' FROM nba_config.classification_config WHERE config_key='live_backtest_suffix'").fetchone() or [""])[0] or ""
    nv = {}
    for d, pn, prop, side, line, v in conn.execute("""SELECT game_date, pn, prop, side, line::float8, nv_side::float8
                                                      FROM nba_score.ud_window_legs_curr WHERE nv_side IS NOT NULL""").fetchall():
        nv.setdefault((d, re.sub(r"[^a-z]", "", str(pn).lower()), prop, side, round(line, 1)), v)
    print(f"twin suffix {sfx!r} | no-vig keys {len(nv):,}", flush=True)
    legstat = defaultdict(lambda: [0, 0])                     # (strategy, season, class) -> legs, hits
    slipstat = defaultdict(lambda: [0, 0.0, 0.0])            # (strategy, season, n_disagree bucket) -> slips, stake, return
    for name, spec in L.STRATEGIES.items():
        comp, size, structure, cap = spec[:4]
        if not cap:
            continue
        t = f"nba_score.slip_engine_slips{sfx}{'_nosteals' if name[:2] in ('C_', 'D_', 'R_', 'W_') else ''}"
        rows = conn.execute(f"""SELECT season, game_date, legs_json, payout, stake FROM {t}
                                WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'""",
                            (comp, size, structure, cap)).fetchall()
        for season, d, legs, pay, stake in rows:
            dis = 0
            for l in legs:
                if l.get("hit") is None:
                    continue
                v = nv.get((d, norm(l.get("player")), l.get("prop"), l.get("side"), round(float(l.get("line")), 1)))
                cls = "none" if v is None else ("agree" if v >= 0.5 else "disagree")
                dis += cls == "disagree"
                a = legstat[(name, season, cls)]
                a[0] += 1
                a[1] += int(l["hit"])
            b = slipstat[(name, season, min(dis, 2))]
            b[0] += 1
            b[1] += float(stake)
            b[2] += float(pay or 0) * float(stake)
    print("\nlegs inside the live strategies' slips: hit rate by market agreement")
    print("strategy             season   agree (n, hit)      disagree (n, hit)   none (n, hit)")
    for name in L.STRATEGIES:
        for season in ("2024-25", "2025-26"):
            cells = []
            for cls in ("agree", "disagree", "none"):
                n, h = legstat.get((name, season, cls), [0, 0])
                cells.append(f"{n:>6,} {h / n if n else float('nan'):.3f}   ")
            if any(legstat.get((name, season, c)) for c in ("agree", "disagree", "none")):
                print(f"{name:<20} {season}  " + "".join(cells))
    print("\nslip ROI by the number of legs the market leans against (0 / 1 / 2+)")
    print("strategy             season   0 disagree (slips, ROI)   1 disagree             2+ disagree")
    for name in L.STRATEGIES:
        for season in ("2024-25", "2025-26"):
            cells = []
            for k in (0, 1, 2):
                n, st, ret = slipstat.get((name, season, k), [0, 0.0, 0.0])
                cells.append(f"{n:>5} {100 * (ret / st - 1) if st else float('nan'):>+7.1f}%        ")
            if any(slipstat.get((name, season, k)) for k in (0, 1, 2)):
                print(f"{name:<20} {season}  " + "".join(cells))


if __name__ == "__main__":
    main()
