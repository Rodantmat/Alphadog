#!/usr/bin/env python3
"""
MARKET-ANCHORED HIT PROBABILITY (2026-10-14; owner: "find the issues, fix whatever you need to fix, find and track the full
scoring system"). WHY: the board's final_hp is overconfident exactly where the model disagrees with the market. Measured on
every graded app leg of both seasons: legs shown at 85-90% hit 70.5%, 90-95% hit 70.2%, 95%+ hit 61.5%; Unders shown at 85%+
hit 56% (2024-25) / 62% (2025-26). On STANDARD lines (the books' median) model 0.797 vs market 0.508 vs realized 0.566 - the
truth sits between the two, much closer to the market. The model's projection misses what the books price (minutes, role,
playoff usage, matchup) and its tails are too narrow (COMPASS 71 / 124; the 10-06 recalibration map was never wired).

WHAT THIS DOES, per board leg (player, prop, line L, side s):
  x_m   = logit(final_hp)                                      the model as it stands (ladder + availability + as-of shift)
  d_dk  = s * (logit(p_dk) - logit(q_dk))                      DraftKings no-vig P(over) at its main line vs the model's
                                                               P(over) at that same line (live has DraftKings main lines)
  d_pp  = s * (0 - logit(q_pp))                                the DFS standard line (PrizePicks anchor) read as the
                                                               market's ~50/50 line vs the model's P(over) there
  z     = a + b*x_m + c*d_dk*has_dk + e*d_pp*has_pp + f*has_dk + g*has_pp + k_easy*easy + k_hard*hard
          (easy / hard = the leg's line is easier / harder than the standard line for its side: goblin- / demon-like)
  true_hp = sigmoid(z), fitted per (side, prop) by L2-regularised logistic regression (IRLS), pooled-by-side fallback,
          then a monotone (isotonic) stage-2 map per side fitted on the same fit set (bends the thin top tail the logistic cannot).

FIT SETS (as-of, no leakage, the recalibration-map convention): '2024-25' and '2025-26' (each fit on its own season and APPLIED
TO THE OTHER season's history) and 'POOLED' (both seasons, for live dates). GATE: written only if the out-of-sample log-loss
improves in BOTH directions and the top band (shown >= 75%) is closer to its realized rate. History uses the 'window'
DraftKings snapshot (the live scorer reads the latest DraftKings capture before scoring).

Env: DATABASE_URL, MA_WRITE (1 = write params to nba_config.classification_config['hp_market_anchor'] if the gate passes),
     MA_D0 / MA_D1 (date range, default both seasons), MA_LABEL (default window), MA_L2 (default 1.0).
"""
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np
import psycopg
from psycopg.rows import dict_row

FEATURE_SQL = """WITH mk(prop, mkey) AS (VALUES ('points','player_points'),('rebounds','player_rebounds'),('assists','player_assists'),('threes_made','player_threes'),
   ('pra','player_points_rebounds_assists'),('pts_reb','player_points_rebounds'),('pts_ast','player_points_assists'),('reb_ast','player_rebounds_assists'),
   ('steals','player_steals'),('blocks','player_blocks'),('turnovers','player_turnovers'),('stocks','player_blocks_steals')),
legs AS MATERIALIZED (
  SELECT DISTINCT ON (b.game_date, b.player_id, b.prop, b.line, b.side) b.game_date, b.player_id, b.player, b.prop, b.line::float8 line, b.side,
         b.baseline_hp::float8 base, b.final_hp::float8 fin, mk.mkey
  FROM nba_score.board_scored b JOIN mk ON mk.prop = b.prop
  WHERE b.game_date BETWEEN %(d0)s::date AND %(d1)s::date AND b.app = ANY('{prizepicks,underdog,sleeper}'::text[])
  ORDER BY b.game_date, b.player_id, b.prop, b.line, b.side, b.app),
pl AS (SELECT DISTINCT game_date, player_id, player, prop, mkey FROM legs),
-- DraftKings main line (both sides priced), the one closest to 50/50 after removing the vig
dkraw AS (
  SELECT s.game_date, s.player, s.market_key, s.line::float8 line,
         max(s.price) FILTER (WHERE s.side = 'Over')::float8 po, max(s.price) FILTER (WHERE s.side = 'Under')::float8 pu
  FROM nba_market.board_snapshots s
  WHERE s.game_date BETWEEN %(d0)s::date AND %(d1)s::date AND s.bookmaker = 'draftkings' AND s.snapshot_label = %(lab)s AND s.market_key !~ '_alternate$'
  GROUP BY 1, 2, 3, 4),
dk AS MATERIALIZED (
  SELECT DISTINCT ON (game_date, player, market_key) game_date, player, market_key, line,
         (CASE WHEN po > 0 THEN 100/(po+100) ELSE -po/(-po+100) END) / ((CASE WHEN po > 0 THEN 100/(po+100) ELSE -po/(-po+100) END) + (CASE WHEN pu > 0 THEN 100/(pu+100) ELSE -pu/(-pu+100) END)) p_over
  FROM dkraw WHERE po IS NOT NULL AND pu IS NOT NULL AND po <> 0 AND pu <> 0
  ORDER BY game_date, player, market_key,
           abs((CASE WHEN po > 0 THEN 100/(po+100) ELSE -po/(-po+100) END) / ((CASE WHEN po > 0 THEN 100/(po+100) ELSE -po/(-po+100) END) + (CASE WHEN pu > 0 THEN 100/(pu+100) ELSE -pu/(-pu+100) END)) - 0.5)),
-- the DFS standard line (PrizePicks' anchor line for the prop)
pp AS MATERIALIZED (SELECT DISTINCT ON (game_date, player, base_market) game_date, player, base_market, anchor_line::float8 line
       FROM nba_market.board_tiers_v2 WHERE game_date BETWEEN %(d0)s::date AND %(d1)s::date AND bookmaker = 'prizepicks' AND anchor_line IS NOT NULL
       ORDER BY game_date, player, base_market, array_position('{window,close,routine}'::text[], snapshot_label), built_at DESC),
anc AS MATERIALIZED (SELECT pl.*, dk.line dk_line, dk.p_over dk_p, pp.line pp_line FROM pl
        LEFT JOIN dk ON dk.game_date = pl.game_date AND dk.player = pl.player AND dk.market_key = pl.mkey
        LEFT JOIN pp ON pp.game_date = pl.game_date AND pp.player = pl.player AND pp.base_market = pl.mkey),
-- the model's P(over) at each anchor line (exact rung, else log-odds interpolation between the neighbouring rungs)
q AS MATERIALIZED (SELECT anc.*,                         -- MATERIALIZED: the ladder lookups run once per player-prop, not per leg
        (SELECT CASE WHEN lo.line = hi.line THEN lo.p ELSE 1/(1+exp(-((1-(anc.dk_line-lo.line)/(hi.line-lo.line))*ln(lo.p/(1-lo.p)) + ((anc.dk_line-lo.line)/(hi.line-lo.line))*ln(hi.p/(1-hi.p))))) END
           FROM (SELECT line::float8 line, least(greatest(p_more::float8,1e-4),1-1e-4) p FROM nba_score.baseline_history h WHERE h.game_date = anc.game_date AND h.player_id = anc.player_id AND h.prop = anc.prop AND h.period = 'FULL' AND h.line <= anc.dk_line ORDER BY h.line DESC LIMIT 1) lo,
                (SELECT line::float8 line, least(greatest(p_more::float8,1e-4),1-1e-4) p FROM nba_score.baseline_history h WHERE h.game_date = anc.game_date AND h.player_id = anc.player_id AND h.prop = anc.prop AND h.period = 'FULL' AND h.line >= anc.dk_line ORDER BY h.line ASC LIMIT 1) hi) q_dk,
        (SELECT CASE WHEN lo.line = hi.line THEN lo.p ELSE 1/(1+exp(-((1-(anc.pp_line-lo.line)/(hi.line-lo.line))*ln(lo.p/(1-lo.p)) + ((anc.pp_line-lo.line)/(hi.line-lo.line))*ln(hi.p/(1-hi.p))))) END
           FROM (SELECT line::float8 line, least(greatest(p_more::float8,1e-4),1-1e-4) p FROM nba_score.baseline_history h WHERE h.game_date = anc.game_date AND h.player_id = anc.player_id AND h.prop = anc.prop AND h.period = 'FULL' AND h.line <= anc.pp_line ORDER BY h.line DESC LIMIT 1) lo,
                (SELECT line::float8 line, least(greatest(p_more::float8,1e-4),1-1e-4) p FROM nba_score.baseline_history h WHERE h.game_date = anc.game_date AND h.player_id = anc.player_id AND h.prop = anc.prop AND h.period = 'FULL' AND h.line >= anc.pp_line ORDER BY h.line ASC LIMIT 1) hi) q_pp
      FROM anc),
st AS (SELECT player_id, game_date, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk, tov::float8 tov
       FROM nba_stats.player_game_log WHERE game_date BETWEEN %(d0)s::date AND %(d1)s::date AND min > 0
       UNION ALL SELECT player_id, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log_postseason WHERE game_date BETWEEN %(d0)s::date AND %(d1)s::date AND min > 0)
SELECT l.game_date::text game_date, l.player_id, l.prop, l.line, l.side, l.base, l.fin, q.dk_line, q.dk_p, q.q_dk, q.pp_line, q.q_pp,
       CASE l.prop WHEN 'points' THEN st.pts WHEN 'rebounds' THEN st.reb WHEN 'assists' THEN st.ast WHEN 'threes_made' THEN st.fg3m WHEN 'steals' THEN st.stl
         WHEN 'blocks' THEN st.blk WHEN 'turnovers' THEN st.tov WHEN 'pra' THEN st.pts+st.reb+st.ast WHEN 'pts_reb' THEN st.pts+st.reb
         WHEN 'pts_ast' THEN st.pts+st.ast WHEN 'reb_ast' THEN st.reb+st.ast WHEN 'stocks' THEN st.stl+st.blk END actual
FROM legs l JOIN q ON q.game_date = l.game_date AND q.player_id = l.player_id AND q.prop = l.prop
LEFT JOIN st ON st.player_id = 'nba_' || l.player_id AND st.game_date = l.game_date
"""

PROPS = ["points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast", "steals", "blocks", "turnovers", "stocks"]
FEATS = ["one", "x_m", "d_dk", "d_pp", "has_dk", "has_pp", "easy", "hard"]


def season_of(d):
    y, m = int(d[:4]), int(d[5:7])
    s = y if m >= 7 else y - 1
    return f"{s}-{str(s + 1)[2:]}"


def logit(p):
    p = np.clip(np.asarray(p, dtype=float), 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def features(rows):
    """rows: dicts from FEATURE_SQL -> (X, y, meta). Pushes and DNPs are dropped (they void)."""
    out, ys, meta = [], [], []
    for r in rows:
        if r["actual"] is None or r["fin"] is None:
            continue
        a, L = float(r["actual"]), float(r["line"])
        if a == L:
            continue
        over = str(r["side"]).lower().startswith("o")
        s = 1.0 if over else -1.0
        y = 1.0 if ((a > L) if over else (a < L)) else 0.0
        out.append(feature_row(r, s))
        ys.append(y)
        meta.append((r["game_date"], r["prop"], "Over" if over else "Under", float(r["fin"])))
    return np.array(out, dtype=float), np.array(ys, dtype=float), meta


def feature_row(r, s):
    """one leg's feature vector (shared with the live scorer through score_leg)."""
    x_m = float(logit(float(r["fin"])))
    has_dk = r.get("dk_p") is not None and r.get("q_dk") is not None
    has_pp = r.get("pp_line") is not None and r.get("q_pp") is not None
    d_dk = s * (float(logit(float(r["dk_p"]))) - float(logit(float(r["q_dk"])))) if has_dk else 0.0
    d_pp = s * (0.0 - float(logit(float(r["q_pp"])))) if has_pp else 0.0
    ref = r.get("pp_line") if has_pp else (r.get("dk_line") if has_dk else None)
    easy = hard = 0.0
    if ref is not None:
        diff = float(r["line"]) - float(ref)            # Over: a lower line is easier; Under: a higher line is easier
        if diff != 0:
            easier = (diff < 0) if s > 0 else (diff > 0)
            easy, hard = (1.0, 0.0) if easier else (0.0, 1.0)
    return [1.0, x_m, d_dk, d_pp, 1.0 if has_dk else 0.0, 1.0 if has_pp else 0.0, easy, hard]


def fit_logistic(X, y, l2=1.0, iters=30):
    """L2-regularised logistic regression by IRLS (intercept unpenalised)."""
    w = np.zeros(X.shape[1])
    w[1] = 1.0                                          # start from 'the model as is'
    pen = np.full(X.shape[1], l2); pen[0] = 1e-6

    def obj(v):
        z = X @ v
        return float(np.sum(np.logaddexp(0, z) - y * z) + 0.5 * np.sum(pen * v * v))
    f = obj(w)
    for _ in range(iters):
        p = sigmoid(X @ w)
        W = p * (1 - p)
        g = X.T @ (p - y) + pen * w
        H = (X * W[:, None]).T @ X + np.diag(pen) + 1e-6 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        t = 1.0
        while t > 1e-6:                                 # step-halving: never accept a worse penalised likelihood
            wn = w - t * step
            fn = obj(wn)
            if fn <= f:
                break
            t *= 0.5
        if t <= 1e-6:
            break
        done = np.max(np.abs(wn - w)) < 1e-7
        w, f = wn, fn
        if done:
            break
    return w


def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def pav(values, weights):
    """weighted pooled-adjacent-violators: the non-decreasing sequence closest (weighted L2) to values."""
    blocks = []
    for v, w in zip(values, weights):
        blocks.append([v * w, w, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            b = blocks.pop(); blocks[-1][0] += b[0]; blocks[-1][1] += b[1]; blocks[-1][2] += b[2]
    out = []
    for s_, w, c in blocks:
        out += [s_ / w] * c
    return out


def iso_knots(p, y, nb=60):
    """stage 2: a monotone map from the stage-1 probability to the realized rate - equal-count bins, isotonic over the bin rates.
    Returns [[x, y], ...] for np.interp (flat beyond the ends)."""
    if len(p) < 500:
        return None
    o = np.argsort(p)
    ps, ys = p[o], y[o]
    edges = np.linspace(0, len(ps), nb + 1).astype(int)
    xs, rs, ws = [], [], []
    for a, b in zip(edges[:-1], edges[1:]):
        if b > a:
            xs.append(float(ps[a:b].mean())); rs.append(float(ys[a:b].mean())); ws.append(float(b - a))
    iso = pav(rs, ws)
    return [[round(x, 5), round(v, 5)] for x, v in zip(xs, iso)]


def apply_iso(p, knots):
    if not knots:
        return p
    k = np.array(knots, dtype=float)
    return np.interp(p, k[:, 0], k[:, 1])


def fit_params(X, y, meta, l2, min_n):
    """{'Over'|'Under': {'_pooled': w, prop: w}} - per (side, prop) when it has min_n legs, else the side's pooled fit."""
    params = {}
    sides = np.array([m[2] for m in meta]); props = np.array([m[1] for m in meta])
    for side in ("Over", "Under"):
        ms = sides == side
        if ms.sum() < 100:
            continue
        params[side] = {"_pooled": fit_logistic(X[ms], y[ms], l2).tolist()}
        for prop in PROPS:
            mp = ms & (props == prop)
            if mp.sum() >= min_n:
                params[side][prop] = fit_logistic(X[mp], y[mp], l2).tolist()
    # stage 2 (monotone, per side) on the fit set's own stage-1 output: the logistic shape cannot bend its thin top tail
    stage1 = predict(params, X, meta, iso=False)
    params["_iso"] = {side: iso_knots(stage1[sides == side], y[sides == side]) for side in ("Over", "Under")}
    return params


def predict(params, X, meta, iso=True):
    out = np.empty(len(meta))
    for i, m in enumerate(meta):
        ps = params.get(m[2]) or {}
        w = ps.get(m[1]) or ps.get("_pooled")
        out[i] = sigmoid(float(np.dot(X[i], w))) if w is not None else m[3]
    if iso and params.get("_iso"):
        sides = np.array([m[2] for m in meta])
        for side, knots in params["_iso"].items():
            ms = sides == side
            if ms.any():
                out[ms] = apply_iso(out[ms], knots)
    return out


def score_leg(params, leg):
    """live / apply: leg dict with fin, side, prop, line, dk_p, q_dk, dk_line, pp_line, q_pp -> true_hp (None = no params)."""
    over = str(leg["side"]).lower().startswith("o")
    ps = params.get("Over" if over else "Under") or {}
    w = ps.get(leg["prop"]) or ps.get("_pooled")
    if w is None:
        return None
    p1 = float(sigmoid(np.dot(np.array(feature_row(leg, 1.0 if over else -1.0)), np.array(w))))
    knots = (params.get("_iso") or {}).get("Over" if over else "Under")
    return float(apply_iso(np.array([p1]), knots)[0])


def reliability(p, y, edges=(0, .5, .55, .6, .65, .7, .75, .8, .85, .9, .95, 1.0001)):
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            rows.append((f"{lo:.2f}-{min(hi, 1):.2f}", int(m.sum()), round(float(p[m].mean()), 3), round(float(y[m].mean()), 3)))
    return rows


def pull(conn_str, d0, d1, label):
    with psycopg.connect(conn_str) as c:
        c.execute("SET statement_timeout = 0")
        cur = c.cursor(row_factory=dict_row)
        cur.execute(FEATURE_SQL, {"d0": d0, "d1": d1, "lab": label})
        return cur.fetchall()


def main():
    url = os.environ["DATABASE_URL"]
    label = os.environ.get("MA_LABEL", "window")
    l2 = float(os.environ.get("MA_L2", "1.0"))
    min_n = int(os.environ.get("MA_MIN_N", "3000"))
    with psycopg.connect(url) as c:
        d0, d1 = c.execute("""SELECT min(game_date)::text, max(game_date)::text FROM nba_score.board_scored
                              WHERE app = ANY('{prizepicks,underdog,sleeper}'::text[])""").fetchone()
    d0 = os.environ.get("MA_D0") or d0
    d1 = os.environ.get("MA_D1") or d1
    # weekly chunks, 6 at a time
    chunks, a = [], date.fromisoformat(d0)
    while a <= date.fromisoformat(d1):
        b = min(a + timedelta(days=6), date.fromisoformat(d1))
        chunks.append((a.isoformat(), b.isoformat()))
        a = b + timedelta(days=1)
    t0 = time.time()
    rows = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, part in enumerate(ex.map(lambda ch: pull(url, ch[0], ch[1], label), chunks)):
            rows += part
            if i % 10 == 0:
                print(f"  pulled {i + 1}/{len(chunks)} weeks, {len(rows):,} legs, {time.time() - t0:.0f}s", flush=True)
    X, y, meta = features(rows)
    seasons = np.array([season_of(m[0]) for m in meta])
    fin = np.array([m[3] for m in meta])
    sides = np.array([m[2] for m in meta])
    print(f"\nlegs with an outcome: {len(y):,} | DraftKings anchor {int(X[:, 4].sum()):,} | DFS standard anchor {int(X[:, 5].sum()):,}", flush=True)
    report = {"built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "label": label, "l2": l2, "min_n": min_n, "n": int(len(y)), "oos": {}}
    fits, ok_all = {}, True
    for fit_s, test_s in (("2024-25", "2025-26"), ("2025-26", "2024-25")):
        mf, mt = seasons == fit_s, seasons == test_s
        if mf.sum() < 1000 or mt.sum() < 1000:
            print(f"skip {fit_s}->{test_s}: too few legs"); ok_all = False; continue
        prm = fit_params(X[mf], y[mf], [meta[i] for i in np.where(mf)[0]], l2, min_n)
        fits[fit_s] = prm
        pt = predict(prm, X[mt], [meta[i] for i in np.where(mt)[0]])
        raw = fin[mt]; yt = y[mt]
        ll_raw, ll_new = logloss(raw, yt), logloss(pt, yt)
        top_raw = raw >= 0.75; top_new = pt >= 0.75
        res = {"n": int(mt.sum()), "logloss_raw": round(ll_raw, 5), "logloss_new": round(ll_new, 5),
               "brier_raw": round(float(np.mean((raw - yt) ** 2)), 5), "brier_new": round(float(np.mean((pt - yt) ** 2)), 5),
               "top_raw": [int(top_raw.sum()), round(float(raw[top_raw].mean()), 3) if top_raw.any() else None, round(float(yt[top_raw].mean()), 3) if top_raw.any() else None],
               "top_new": [int(top_new.sum()), round(float(pt[top_new].mean()), 3) if top_new.any() else None, round(float(yt[top_new].mean()), 3) if top_new.any() else None],
               "rel_raw": reliability(raw, yt), "rel_new": reliability(pt, yt), "by_side": {}}
        for sd in ("Over", "Under"):
            ms = sides[mt] == sd
            res["by_side"][sd] = {"raw": reliability(raw[ms], yt[ms]), "new": reliability(pt[ms], yt[ms]),
                                  "logloss_raw": round(logloss(raw[ms], yt[ms]), 5), "logloss_new": round(logloss(pt[ms], yt[ms]), 5)}
        gate = ll_new < ll_raw and (not top_new.any() or abs(pt[top_new].mean() - yt[top_new].mean()) < abs(raw[top_raw].mean() - yt[top_raw].mean()))
        res["gate"] = bool(gate)
        ok_all = ok_all and gate
        report["oos"][f"{fit_s}->{test_s}"] = res
        print(f"\n=== fit {fit_s} -> test {test_s}: {res['n']:,} legs | log-loss {ll_raw:.5f} -> {ll_new:.5f} | Brier {res['brier_raw']} -> {res['brier_new']} | GATE {'PASS' if gate else 'FAIL'}", flush=True)
        print(f"  shown >= 75%: raw n={res['top_raw'][0]:,} shown {res['top_raw'][1]} hit {res['top_raw'][2]} | new n={res['top_new'][0]:,} shown {res['top_new'][1]} hit {res['top_new'][2]}", flush=True)
        print("  band          raw: n / shown / hit           new: n / shown / hit", flush=True)
        rr = {b: (n, s, h) for b, n, s, h in res["rel_raw"]}; rn = {b: (n, s, h) for b, n, s, h in res["rel_new"]}
        for bnd in sorted(set(rr) | set(rn)):
            print(f"  {bnd}   {str(rr.get(bnd, '-')):<32} {str(rn.get(bnd, '-'))}", flush=True)
        for sd in ("Over", "Under"):
            bs = res["by_side"][sd]
            print(f"  {sd}: log-loss {bs['logloss_raw']} -> {bs['logloss_new']} | raw top {[x for x in bs['raw'] if x[0] >= '0.75']} | new top {[x for x in bs['new'] if x[0] >= '0.75']}", flush=True)
    pooled = fit_params(X, y, meta, l2, min_n)
    fits["POOLED"] = pooled
    report["gate_pass"] = bool(ok_all)
    print("\nPOOLED coefficients (" + ", ".join(FEATS) + "):", flush=True)
    for sd, d in pooled.items():
        if sd == "_iso":
            continue
        for k, w in d.items():
            print(f"  {sd:<5} {k:<12} " + " ".join(f"{v:+.3f}" for v in w), flush=True)
    print(f"\nGATE (both directions): {'PASS' if ok_all else 'FAIL'}", flush=True)
    if os.environ.get("MA_WRITE") == "1":
        if not ok_all:
            print("MA_WRITE=1 but the gate FAILED - nothing written", flush=True)
            sys.exit(1)
        cfg = {"what": "Market-anchored hit probability (nba/build_market_anchor.py): per (side, prop) logistic weights over "
                       + ", ".join(FEATS) + ". History applies the OTHER season's fit; live applies POOLED.",
               "features": FEATS, "fit_sets": fits, "label": label, "report": {k: v for k, v in report.items() if k != "oos"},
               "oos_summary": {k: {kk: v[kk] for kk in ("n", "logloss_raw", "logloss_new", "brier_raw", "brier_new", "top_raw", "top_new", "gate")}
                               for k, v in report["oos"].items()}}
        with psycopg.connect(url) as c:
            c.execute("""INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('hp_market_anchor', %s::text::jsonb)
                         ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json""", (json.dumps(cfg),))
        print("written: nba_config.classification_config['hp_market_anchor']", flush=True)


if __name__ == "__main__":
    main()
