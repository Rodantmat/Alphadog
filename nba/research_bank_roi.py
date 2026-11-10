"""SUBSTITUTE BANK ROI CHECK (owner 2026-11-10 "the subs need to be positive ROI: legs that hit and have a decent multiplier"). For Sleeper's S_ALL rule: every slate of
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

BANDS = [(1, 5), (6, 10), (11, 15), (16, 25), (26, 999)]
RULE = {"floor": 0.50, "gate": 1.12, "mcap": 99.0}


def band(r):
    for lo, hi in BANDS:
        if lo <= r <= hi:
            return f"{lo}-{hi}" if hi < 999 else f"{lo}+"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    ovr, kt = RSH.law(conn, live)
    acc = defaultdict(lambda: [0, 0, 0.0])       # (season, band) -> [n, hits, sum profit]
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        season = AF.season_of(d)
        legs = AA.hist_legs(conn, d, st, ovr, kt, None) if season != "2026-27" else AA.live_legs(conn, d, st)
        legs = [l for l in legs if l.get("p") is not None and l.get("hit") is not None]
        cand = [l for l in legs if l["p"] >= RULE["floor"] and l["p"] * l["m"] >= RULE["gate"] and l["m"] <= RULE["mcap"]]
        cand.sort(key=lambda l: -(l["p"] + l["pf"]) / 2 * l["m"])
        seen, r = set(), 0
        for l in cand:
            if l["player_id"] in seen:
                continue
            seen.add(l["player_id"]); r += 1
            a = acc[(season, band(r))]
            a[0] += 1; a[1] += int(bool(l["hit"])); a[2] += (float(l["m"]) - 1.0) if l["hit"] else -1.0
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 25 == 0:
            print(f"slate {i + 1}/{len(hist) + len(live)} {d}", flush=True)
    print("BANK ROI|season|rank band|legs|hit%|single-leg ROI%", flush=True)
    for (season, b), (n, h, pr) in sorted(acc.items()):
        print(f"BANK ROI|{season}|{b}|{n}|{100 * h / n:.1f}|{100 * pr / n:+.1f}", flush=True)


if __name__ == "__main__":
    main()
