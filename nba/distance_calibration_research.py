#!/usr/bin/env python3
"""
DISTANCE-AWARE CALIBRATION - RESEARCH (strategy doc §31s; COMPASS fact 134 "true open issue"; O5b). Read-only.
Finding: on standard lines the model's overconfidence grows with |offset| = distance between the app's line and the model's anchor,
and at the SAME predicted probability, closer legs realize more (points p 0.65-0.70: 61.2% at distance 0-1, 57.9% at 2-3, 53.6% at 4+).
A probability-only map (fact 124's design, never written) cannot fix that. This fits, PER PROP, on the model-FAVORED side of
standard (R) legs of the certified tier map:
    logit(realized) = a + b * logit(p) + c * |offset| + d * [side == Over]
and tests it OUT OF SAMPLE (fit one season, score the other, both directions): log-loss raw vs recalibrated, calibration by bucket.
Env: DATABASE_URL.
"""
import math
import os
from collections import defaultdict

import numpy as np
import psycopg

PROPS = ['points', 'rebounds', 'assists', 'threes_made', 'steals', 'blocks', 'turnovers', 'pts_reb', 'pts_ast', 'reb_ast', 'pra', 'stocks']
SQL = """
WITH t AS MATERIALIZED (SELECT season, game_date, player, prop, side, line, score::float p, hit FROM nba_score.tier_map_legs
                        WHERE rank_key='final_hp' AND tier='R' AND hit IS NOT NULL AND score >= 0.5 AND prop = %s),
n AS MATERIALIZED (SELECT DISTINCT t.player, nm.player_id FROM (SELECT DISTINCT player FROM t) t JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(t.player))
SELECT t.season, t.side, t.p, t.hit, abs(f.ladder_offset)::float
FROM t JOIN n USING (player)
JOIN nba_score.final_hp f ON f.game_date = t.game_date AND f.player_id = n.player_id AND f.prop = t.prop AND f.side = t.side AND f.line = t.line
"""


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))


def fit(X, y, iters=60, ridge=1e-6):
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        q = 1 / (1 + np.exp(-X @ w)); W = q * (1 - q)
        H = X.T @ (X * W[:, None]) + ridge * np.eye(X.shape[1]); g = X.T @ (y - q)
        w += np.linalg.solve(H, g)
    return w


def ll(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    print("DISTANCE-AWARE CALIBRATION - favored side of standard legs, out-of-sample both directions", flush=True)
    tot = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for prop in PROPS:
        rows = conn.execute(SQL, (prop,)).fetchall()
        if len(rows) < 2000:
            print(f"\n== {prop}: {len(rows)} legs - too few, skipped", flush=True); continue
        by = defaultdict(list)
        for season, side, p, hit, off in rows:
            by[season].append((float(p), int(hit), float(off), 1.0 if side == 'Over' else 0.0))
        print(f"\n== {prop}: {len(rows):,} favored-side standard legs ({', '.join(f'{s} {len(v):,}' for s, v in sorted(by.items()))})", flush=True)
        for tr, te in (('2024-25', '2025-26'), ('2025-26', '2024-25')):
            if tr not in by or te not in by:
                continue
            A = np.array(by[tr]); B = np.array(by[te])
            Xa = np.column_stack([np.ones(len(A)), logit(A[:, 0]), A[:, 2], A[:, 3]]); w = fit(Xa, A[:, 1])
            Xb = np.column_stack([np.ones(len(B)), logit(B[:, 0]), B[:, 2], B[:, 3]]); pb = 1 / (1 + np.exp(-Xb @ w))
            # comparison: probability-only recalibration (fact 124 design) fitted the same way
            Xa0 = Xa[:, :2]; w0 = fit(Xa0, A[:, 1]); pb0 = 1 / (1 + np.exp(-Xb[:, :2] @ w0))
            l_raw, l_p, l_d = ll(B[:, 0], B[:, 1]), ll(pb0, B[:, 1]), ll(pb, B[:, 1])
            print(f"   fit {tr} -> test {te}: a {w[0]:+.3f} b {w[1]:.3f} c(dist) {w[2]:+.3f} d(Over) {w[3]:+.3f} | log-loss raw {l_raw:.4f} "
                  f"-> prob-only {l_p:.4f} -> +distance {l_d:.4f}", flush=True)
            for lo, hi in ((0.5, 0.55), (0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 1.01)):
                m = (B[:, 0] >= lo) & (B[:, 0] < hi)
                if m.sum() >= 150:
                    print(f"      raw {lo:.2f}-{hi:.2f}: n {m.sum():>6,} raw pred {100*B[m,0].mean():5.1f} | recal pred {100*pb[m].mean():5.1f} | actual {100*B[m,1].mean():5.1f}", flush=True)
            t = tot[(tr, te)]; t[0] += l_raw * len(B); t[1] += l_p * len(B); t[2] += l_d * len(B); t[3] += len(B)
    for k, t in tot.items():
        print(f"\nALL PROPS fit {k[0]} -> test {k[1]} ({t[3]:,} legs): log-loss raw {t[0]/t[3]:.4f} -> prob-only {t[1]/t[3]:.4f} -> +distance {t[2]/t[3]:.4f}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
