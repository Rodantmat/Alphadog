#!/usr/bin/env python3
"""
RESEARCH - DOES THE BOOKS' PRICE ADD ANYTHING TO THE PRIZEPICKS LEG MODEL? (2026-10-22 PT; owner 09:12 PT: "sharp those logics ...
increase ROI ... other logics").  READ-ONLY.

The live PrizePicks engine ranks by final_hp of the window-only market twin (nba_score.tier_map_legs_sel_wo): the model already
carries a market term where a window price existed. On Underdog (research_ud_price_aware.py) the books' no-vig carried strong
information next to the market-free model. Question here: given the LIVE PrizePicks probability, does the books' no-vig at the
SAME line still predict the outcome (logistic hit ~ logit(final_hp) + logit(nv), per season, per kind)? If yes, a filter or a
re-weighting is an ROI lever; if the market coefficient is ~0, the twin already absorbed it.
Join: PrizePicks leg (date, player, prop, side, line) = Underdog window leg with a books no-vig (nba_score.ud_window_legs_curr) -
the books' no-vig for that side at that line. Final 7 days out. Also: hit rate of the model's strong legs split by whether the
market agrees.
Env: DATABASE_URL.
"""
import os
import re
import sys
import unicodedata

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from research_ud_price_aware import fit_logistic, logit   # noqa: E402

SEASONS = ("2024-25", "2025-26")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    def norm(x):
        x = unicodedata.normalize("NFKD", str(x or "")).encode("ascii", "ignore").decode().lower()
        x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x)
        return re.sub(r"[^a-z]", "", x)
    nv = {}
    for d, pn, prop, side, line, v in conn.execute("""SELECT game_date, pn, prop, side, line::float8, nv_side::float8
                                                      FROM nba_score.ud_window_legs_curr WHERE nv_side IS NOT NULL""").fetchall():
        nv.setdefault((d, re.sub(r"[^a-z]", "", str(pn).lower()), prop, side, round(line, 1)), v)
    rows, seen = [], 0
    for season, d, kind, tier, player, prop, side, line, p, hit in conn.execute("""
            SELECT season, game_date, kind, tier, player, prop, side, line::float8, score::float8, hit
            FROM nba_score.tier_map_legs_sel_wo
            WHERE rank_key = 'final_hp' AND hit IS NOT NULL AND season IN ('2024-25', '2025-26')""").fetchall():
        seen += 1
        v = nv.get((d, norm(player), prop, side, round(line, 1)))
        if v is not None:
            rows.append((season, d, kind, tier, side, p, hit, v))
    print(f"PrizePicks legs {seen:,} | Underdog no-vig keys {len(nv):,} | joined {len(rows):,}")
    tot = conn.execute("SELECT season, kind, count(*) FROM nba_score.tier_map_legs_sel_wo WHERE rank_key='final_hp' AND hit IS NOT NULL GROUP BY 1,2").fetchall()
    last7 = {s: set(sorted({r[1] for r in rows if r[0] == s})[-7:]) for s in SEASONS}
    rows = [r for r in rows if r[1] not in last7[r[0]] and 0.02 < r[7] < 0.98]
    print(f"PrizePicks legs with a books no-vig at the same line: {len(rows):,} (all PP legs by season/kind: {sorted(tot)})")
    print("\nlogistic hit ~ logit(final_hp) + logit(nv)   [z = coefficient / se]")
    for s in SEASONS:
        for kind in ("standard", "goblin", "demon", "all"):
            sub = [r for r in rows if r[0] == s and (kind == "all" or r[2] == kind)]
            if len(sub) < 2000:
                print(f"  {s} {kind:<8} n {len(sub):>7,} (too few)")
                continue
            y = np.array([r[6] for r in sub], dtype=float)
            X = np.column_stack([logit([r[5] for r in sub]), logit([r[7] for r in sub])])
            b, se = fit_logistic(X, y)
            b1, _ = fit_logistic(X[:, :1], y)
            p_both = 1 / (1 + np.exp(-(b[0] + X @ b[1:])))
            p_mod = 1 / (1 + np.exp(-(b1[0] + X[:, 0] * b1[1])))
            ll = lambda p: -float(np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
            print(f"  {s} {kind:<8} n {len(sub):>7,} | b_model {b[1]:+.3f} (z {b[1] / se[1]:+5.1f}) | b_market {b[2]:+.3f} (z {b[2] / se[2]:+5.1f})"
                  f" | logloss model-only {ll(p_mod):.5f} -> with market {ll(p_both):.5f} | hit {y.mean():.4f}")
    print("\nstandard legs: hit rate by model p (rows) x books no-vig (columns), both seasons pooled per season")
    pb = [0.50, 0.54, 0.56, 0.58, 0.60, 0.65, 1.01]
    nb = [0, 0.45, 0.50, 0.55, 0.60, 1.01]
    for s in SEASONS:
        print(f"  {s}        " + "".join(f" nv {lo:.2f}-{hi if hi < 1 else 1:<4}  " for lo, hi in zip(nb[:-1], nb[1:])))
        for plo, phi in zip(pb[:-1], pb[1:]):
            cells = []
            for nlo, nhi in zip(nb[:-1], nb[1:]):
                c = [r[6] for r in rows if r[0] == s and r[2] == "standard" and plo <= r[5] < phi and nlo <= r[7] < nhi]
                cells.append(f"{(np.mean(c) if c else float('nan')):.3f} n{len(c):>6,} " if c else "   -   n     0 ")
            print(f"    p {plo:.2f}-{phi if phi < 1 else 1:<4} " + " ".join(cells))


if __name__ == "__main__":
    main()
