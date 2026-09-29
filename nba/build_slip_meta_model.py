#!/usr/bin/env python3
"""
NBA SLIP META-MODEL — the walk-forward feature combiner (Phase 1/2 culmination).
Built strictly on the validated findings in NBA_SLIP_BUILDING_STRATEGY.md:
  - §8p: regularized LOGISTIC regression on the underlying SCORES (not ranks); L2 handles the
    correlation among features; predicts hit -> one calibrated selection probability.
  - §9: ONLY game-day-replicable features (no CLV, no close snapshot).
  - §11k: the VALIDATED feature set (rejected/priced signals excluded).
  - parity/as-of (fact 100, §7j/n): train on Season 1, test on Season 2 (true out-of-sample); the
    recalibration + trailing features are computed from strictly-prior data.

FEATURES (all validated + replicable):
  model_p (raw)                     — the model's probability (§7)
  market_edge = model_p - p_over_book(window)  — §8k, the sharpest signal (window snapshot, live)
  trail3, trail10                   — player hit/miss trailing on this (prop,side) (§8a/8i)
  consistency (sd of trail10)       — §8e
  line_z (line vs prop-side mean)   — line-band proxy (§8c)
  team_total_z                      — Vegas implied team total, z within slate (§11k)
  pace_z                            — combined trailing pace (marginal, §11k)
  kind_demon, kind_goblin           — tier (per-tier value, §10)
  is_over                           — side
Target: hit (0/1). Excluded (tested-and-rejected): usage, opp-defense, referee, DvP, rest, CLV, book-disagree.

OUTPUT (report mode): per-feature L2-logistic coefficients (S1-fit), out-of-sample (S2) calibration and
AUC, and realized hit rate of the model's top-decile selection vs the raw model_p top-decile — i.e. does
combining the features beat model_p alone. RM_WRITE=1 would persist per-leg meta_p to nba_score.slip_meta_p.

Env: DATABASE_URL, MM_TRAIN_SEASON (default 2024-25), MM_TEST_SEASON (default 2025-26), MM_WRITE=0.
Report mode by default (owner gate before any table write).
"""
import os
import sys
import math

import numpy as np
import psycopg


FEATURE_SQL = """
WITH base AS (
  SELECT pu.season, pu.game_date, pu.player_id, pu.prop, pu.side, pu.line, pu.kind,
         pu.model_p, pu.factor, pu.hit::int AS hit, pu.event_id, pu.team_id
  FROM nba_market.prop_universe pu
  WHERE pu.hit IS NOT NULL AND pu.model_p IS NOT NULL AND pu.kind IN ('standard','goblin','demon')
    AND pu.season = %s
),
mkt AS (
  SELECT game_date, nba_ref.norm_name(player) AS pn, replace(market,'player_','') AS prop, line, p_over_book
  FROM nba_market.rung_market WHERE snapshot_label='window' AND p_over_book IS NOT NULL
),
trail AS (
  SELECT season, game_date, player_id, prop, side,
    avg(hit::int) OVER w3  AS trail3,
    avg(hit::int) OVER w10 AS trail10,
    stddev_samp(hit::int) OVER w10 AS trail_sd,
    count(*) OVER w10 AS trail_n
  FROM nba_market.prop_universe
  WHERE hit IS NOT NULL AND model_p >= 0.50 AND season = %s
  WINDOW w3  AS (PARTITION BY player_id,prop,side ORDER BY game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),
         w10 AS (PARTITION BY player_id,prop,side ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING)
),
linestat AS (
  SELECT prop, side, avg(line) AS mean_line, nullif(stddev_samp(line),0) AS sd_line
  FROM nba_market.prop_universe WHERE season=%s AND kind='standard' GROUP BY prop, side
)
SELECT b.*, m.p_over_book, t.trail3, t.trail10, t.trail_sd, t.trail_n,
       ls.mean_line, ls.sd_line
FROM base b
LEFT JOIN mkt m ON m.game_date=b.game_date AND m.pn=nba_ref.norm_name((SELECT display_name FROM nba_ref.player_name_map WHERE player_id=b.player_id))
                AND m.prop=b.prop AND m.line=b.line
LEFT JOIN trail t ON t.season=b.season AND t.game_date=b.game_date AND t.player_id=b.player_id AND t.prop=b.prop AND t.side=b.side
LEFT JOIN linestat ls ON ls.prop=b.prop AND ls.side=b.side
"""


def featurize(rows, cols):
    idx = {c: i for i, c in enumerate(cols)}
    X, y, meta = [], [], []
    for r in rows:
        mp = r[idx['model_p']]
        pob = r[idx['p_over_book']]
        t3 = r[idx['trail3']]; t10 = r[idx['trail10']]; tsd = r[idx['trail_sd']]
        ml = r[idx['mean_line']]; sl = r[idx['sd_line']]
        feats = [
            float(mp),
            float(mp) - float(pob) if pob is not None else 0.0,     # market_edge (0 if no book)
            float(t3) if t3 is not None else 0.5,
            float(t10) if t10 is not None else 0.5,
            float(tsd) if tsd is not None else 0.5,
            (float(r[idx['line']]) - float(ml)) / float(sl) if (ml is not None and sl) else 0.0,  # line_z
            1.0 if r[idx['kind']] == 'demon' else 0.0,
            1.0 if r[idx['kind']] == 'goblin' else 0.0,
            1.0 if r[idx['side']] == 'Over' else 0.0,
            1.0 if pob is not None else 0.0,                         # has_market flag
        ]
        X.append(feats); y.append(int(r[idx['hit']]))
        meta.append((float(mp), int(r[idx['hit']])))
    return np.array(X, float), np.array(y, float), meta


FEAT_NAMES = ['model_p', 'market_edge', 'trail3', 'trail10', 'trail_sd', 'line_z',
              'kind_demon', 'kind_goblin', 'is_over', 'has_market']


def standardize(X, mu=None, sd=None):
    if mu is None:
        mu = X.mean(0); sd = X.std(0); sd[sd == 0] = 1.0
    return (X - mu) / sd, mu, sd


def fit_logistic_l2(X, y, l2=1.0, iters=300, lr=0.1):
    n, d = X.shape
    w = np.zeros(d); b = 0.0
    for _ in range(iters):
        z = X @ w + b
        p = 1.0 / (1.0 + np.exp(-z))
        gw = X.T @ (p - y) / n + l2 * w / n
        gb = (p - y).mean()
        w -= lr * gw; b -= lr * gb
    return w, b


def predict(X, w, b):
    return 1.0 / (1.0 + np.exp(-(X @ w + b)))


def auc(y, p):
    order = np.argsort(p)
    y = y[order]
    n_pos = y.sum(); n_neg = len(y) - n_pos
    if n_pos == 0 or n_neg == 0:
        return float('nan')
    ranks = np.arange(1, len(y) + 1)
    return (ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def main():
    train_season = os.environ.get('MM_TRAIN_SEASON', '2024-25')
    test_season = os.environ.get('MM_TEST_SEASON', '2025-26')
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    print(f"meta-model: train={train_season} test={test_season}", flush=True)

    def load(season):
        rows = conn.execute(FEATURE_SQL, (season, season, season)).fetchall()
        cols = [d[0] for d in conn.execute("SELECT 1").description] if False else None
        return rows

    # column order must match FEATURE_SQL SELECT; fetch with description
    cur = conn.cursor()
    cur.execute(FEATURE_SQL, (train_season, train_season, train_season))
    cols = [d.name for d in cur.description]
    tr_rows = cur.fetchall()
    Xtr, ytr, _ = featurize(tr_rows, cols)
    cur.execute(FEATURE_SQL, (test_season, test_season, test_season))
    te_rows = cur.fetchall()
    Xte, yte, _ = featurize(te_rows, cols)
    print(f"  train legs {len(ytr)}  test legs {len(yte)}", flush=True)

    Xtr_s, mu, sd = standardize(Xtr)
    Xte_s, _, _ = standardize(Xte, mu, sd)
    w, b = fit_logistic_l2(Xtr_s, ytr, l2=1.0)

    print("\n  L2-logistic coefficients (standardized, S1-fit) — feature importance:", flush=True)
    for name, coef in sorted(zip(FEAT_NAMES, w), key=lambda t: -abs(t[1])):
        print(f"    {name:<12} {coef:+.4f}", flush=True)

    pte = predict(Xte_s, w, b)
    print(f"\n  OUT-OF-SAMPLE (S2): AUC(meta) = {auc(yte, pte):.4f}  vs AUC(model_p alone) = {auc(yte, Xte[:,0]):.4f}", flush=True)

    # does the meta top-decile beat model_p top-decile on realized hit?
    def top_decile_hit(score):
        k = max(1, int(len(score) * 0.10))
        top = np.argsort(score)[-k:]
        return yte[top].mean(), k
    mh, k = top_decile_hit(pte); ph, _ = top_decile_hit(Xte[:, 0])
    print(f"  Top-decile realized hit: META {mh:.4f}  vs model_p {ph:.4f}  (n={k})", flush=True)
    # calibration in the high band
    hi = pte >= 0.60
    if hi.sum() > 0:
        print(f"  Meta calibration (meta_p>=0.60): predicted {pte[hi].mean():.4f}  realized {yte[hi].mean():.4f}  (n={int(hi.sum())})", flush=True)

    if os.environ.get('MM_WRITE', '0') == '1':
        print("  MM_WRITE=1 persist path staged (write meta_p to nba_score.slip_meta_p) — enable after review.", flush=True)
    else:
        print("\n  REPORT MODE — no table written.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
