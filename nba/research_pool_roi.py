"""BIGGER SUB POOL (owner 2026-11-10 "see if more legs qualify"): single-leg ROI by hit-chance band x multiplier band per season, to find which extra legs are positive in BOTH seasons.
SUBSTITUTE BANK ROI CHECK (owner 2026-11-10 "the subs need to be positive ROI: legs that hit and have a decent multiplier"). For Sleeper's S_ALL rule: every slate of
history + this season, the rule's ranked candidate list (floor 0.50, p x m >= 1.12, order (p+pf)/2 x m, one leg a player) - the realized single-leg ROI (hit x multiplier - 1,
a 1-unit entry on the leg) and hit rate by RANK BAND (1-5 = the legs the slips use, 6-10, 11-15, 16-25, 26+), per season. A bank band is fit to substitute when its ROI is positive.
Env: DATABASE_URL, AA_APP=sleeper (research_app_allegs loads the same legs the S_ALL study used)."""
import os
import sys
from collections import defaultdict

import psycopg

os.environ.setdefault("AA_APP", "sleeper")
import research_app_allegs as AA  # noqa: E402
import research_app_final_strategies as AF  # noqa: E402
import research_sleeper_hist as RSH  # noqa: E402

PB = [(0.50, 0.55), (0.55, 0.60), (0.60, 0.65), (0.65, 0.70), (0.70, 1.01)]
MB = [(1.0, 1.3), (1.3, 1.6), (1.6, 2.0), (2.0, 99)]
RULE = {"floor": 0.50, "gate": 1.12, "mcap": 99.0}


def cell(p, m):
    pb = next(i for i, (lo, hi) in enumerate(PB) if lo <= p < hi) if 0.50 <= p < 1.01 else None
    mb = next(i for i, (lo, hi) in enumerate(MB) if lo <= m < hi) if m >= 1.0 else None
    return (pb, mb) if pb is not None and mb is not None else None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    ovr, kt = RSH.law(conn, live)
    kf = AA.fliff_law(conn, live) if AA.APP == "fliff" else None
    acc = defaultdict(lambda: [0, 0, 0.0])
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        season = AF.season_of(d)
        legs = AA.hist_legs(conn, d, st, ovr, kt, kf) if season != "2026-27" else AA.live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("hit") is not None and l.get("kind", "main") == "main"]
        legs.sort(key=lambda l: -l["p"])
        seen = set()
        for l in legs:
            if l["player_id"] in seen:
                continue
            c = cell(float(l["p"]), float(l["m"]))
            if c is None:
                continue
            seen.add(l["player_id"])
            a = acc[(season, c)]
            a[0] += 1; a[1] += int(bool(l["hit"])); a[2] += (float(l["m"]) - 1.0) if l["hit"] else -1.0
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 25 == 0:
            print(f"slate {i + 1}/{len(hist) + len(live)} {d}", flush=True)
    print("POOL ROI|app|season|hit chance|multiplier|legs|hit%|single-leg ROI%", flush=True)
    for (season, (pb, mb)), (n, h, pr) in sorted(acc.items()):
        print(f"POOL ROI|{AA.APP}|{season}|{PB[pb][0]:.2f}-{PB[pb][1]:.2f}|{MB[mb][0]:.1f}-{MB[mb][1]:.1f}|{n}|{100 * h / n:.1f}|{100 * pr / n:+.1f}", flush=True)


if __name__ == "__main__":
    main()
