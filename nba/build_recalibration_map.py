#!/usr/bin/env python3
"""
RECALIBRATION MAP v2 (COMPASS facts 123-124, 134; strategy doc §31s). Replaces the 2026-09-28 builder, which was never written and
had three defects found on review (2026-10-06): (1) NOT as-of - each season's map was fit on that season's own legs (in-sample),
the promised "recalibrated with the map that did NOT see it" / live refit were not implemented; (2) its isotonic step was dead code
(PAV blocks computed then ignored) replaced by a running MAXIMUM - monotone but biased UPWARD; (3) standard legs only - but alternates
miscalibrate in OPPOSITE directions (goblins UNDER-confident: 0.644 -> 0.685 / 0.626 -> 0.659; demons OVER-confident: 0.259 -> 0.242 /
0.285 -> 0.246), and the owner directive is "every leg gets a final HP".

MAP: calibrated_p keyed by (prop, kind, side, role_tier, p_bucket). Each cell's realized rate is shrunk toward its parent by
n/(n+K): cell -> (prop,kind,side) -> (prop,kind) -> kind. Within each (prop,kind,side,role) the bucket curve is made non-decreasing in
model_p by WEIGHTED POOLED-ADJACENT-VIOLATORS (true isotonic regression).
FIT SETS: '2024-25' and '2025-26' (each fit on its own season, applied to the OTHER season's history - as-of / no leakage) and
'POOLED' (both seasons - for live dates). VALIDATION GATE (built in): each season's map is scored on the other season - log-loss raw
vs map, per (prop, kind) and overall; the table is written only if the map improves out-of-sample in BOTH directions.
Env: DATABASE_URL, RC_WRITE (1 = write if the gate passes; else report), RC_SHRINK_K (default 200).
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

BUCKETS = [0.0, 0.10, 0.20, 0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.85, 0.95, 1.01]  # model_p edges (alternates reach both tails)
SQL = """
SELECT pu.season, pu.prop, pu.kind, pu.side, coalesce(b.role_tier, 'UNK'), pu.model_p::float, pu.hit::int
FROM nba_market.prop_universe pu
LEFT JOIN nba_score.baseline_history b
  ON b.game_date = pu.game_date AND b.player_id = pu.player_id AND b.prop = pu.prop AND b.line = pu.line AND b.period = 'FULL'
WHERE pu.line_source = 'real' AND pu.hit IS NOT NULL AND pu.model_p IS NOT NULL AND pu.season = %s
"""


def bucket_of(p):
    for i in range(len(BUCKETS) - 1):
        if BUCKETS[i] <= p < BUCKETS[i + 1]:
            return i
    return len(BUCKETS) - 2


def pav(values, weights):
    """Weighted pooled-adjacent-violators: the non-decreasing sequence closest (weighted L2) to values."""
    blocks = []                                   # [sum_wv, sum_w, count]
    for v, w in zip(values, weights):
        blocks.append([v * w, w, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            b = blocks.pop(); blocks[-1][0] += b[0]; blocks[-1][1] += b[1]; blocks[-1][2] += b[2]
    out = []
    for s, w, c in blocks:
        out += [s / w] * c
    return out


def build_map(rows, K):
    """rows: (prop, kind, side, role, p, hit). Returns {(prop,kind,side,role,bucket): (n, p_mean, realized, calibrated)}."""
    agg = defaultdict(lambda: [0, 0.0, 0.0])
    def add(key, p, h):
        a = agg[key]; a[0] += 1; a[1] += p; a[2] += h
    for prop, kind, side, role, p, h in rows:
        b = bucket_of(p)
        add(("K", kind), p, h); add(("PK", prop, kind), p, h); add(("PKS", prop, kind, side), p, h)
        add(("C", prop, kind, side, role, b), p, h)
    def rate(key):
        a = agg[key]; return a[2] / a[0] if a[0] else None
    out = {}
    groups = defaultdict(list)
    for key in agg:
        if key[0] == "C":
            groups[key[1:5]].append(key[5])
    for (prop, kind, side, role), bks in groups.items():
        r_k = rate(("K", kind))
        n_pk = agg[("PK", prop, kind)][0]; r_pk = (n_pk * rate(("PK", prop, kind)) + K * r_k) / (n_pk + K)
        n_pks = agg[("PKS", prop, kind, side)][0]; r_pks = (n_pks * rate(("PKS", prop, kind, side)) + K * r_pk) / (n_pks + K)
        bks = sorted(bks); vals, ws, meta = [], [], []
        for b in bks:
            n, ps, hs = agg[("C", prop, kind, side, role, b)]
            vals.append((n * (hs / n) + K * r_pks) / (n + K)); ws.append(n + 1.0); meta.append((n, ps / n, hs / n))
        fitted = pav(vals, ws)
        for b, f, (n, pm, rr) in zip(bks, fitted, meta):
            out[(prop, kind, side, role, b)] = (n, round(pm, 4), round(rr, 4), round(float(f), 4))
    # parent fallbacks for unseen cells
    out["_parents"] = {"PKS": {k[1:]: (agg[k][2] / agg[k][0]) for k in agg if k[0] == "PKS"},
                       "PK": {k[1:]: (agg[k][2] / agg[k][0]) for k in agg if k[0] == "PK"},
                       "K": {k[1:]: (agg[k][2] / agg[k][0]) for k in agg if k[0] == "K"}}
    return out


def apply_map(m, prop, kind, side, role, p):
    c = m.get((prop, kind, side, role, bucket_of(p)))
    if c:
        return c[3]
    par = m["_parents"]
    for v in (par["PKS"].get((prop, kind, side)), par["PK"].get((prop, kind)), par["K"].get((kind,))):
        if v is not None:
            return v
    return p


def ll(p, y):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6); y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main():
    write = os.environ.get("RC_WRITE", "0") == "1"
    K = float(os.environ.get("RC_SHRINK_K", "200"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    data = {s: [(r[1], r[2], r[3], r[4], r[5], r[6]) for r in conn.execute(SQL, (s,)).fetchall()] for s in ("2024-25", "2025-26")}
    for s, v in data.items():
        print(f"{s}: {len(v):,} graded legs (role UNK {sum(1 for r in v if r[3] == 'UNK'):,})", flush=True)
    maps = {s: build_map(v, K) for s, v in data.items()}
    maps["POOLED"] = build_map(data["2024-25"] + data["2025-26"], K)
    ok = True
    for tr, te in (("2024-25", "2025-26"), ("2025-26", "2024-25")):
        rows = data[te]; raw = [r[4] for r in rows]; y = [r[5] for r in rows]
        cal = [apply_map(maps[tr], r[0], r[1], r[2], r[3], r[4]) for r in rows]
        l_raw, l_cal = ll(raw, y), ll(cal, y); ok &= l_cal < l_raw
        print(f"\nGATE fit {tr} -> test {te} ({len(rows):,} legs): log-loss raw {l_raw:.4f} -> map {l_cal:.4f}  {'PASS' if l_cal < l_raw else 'FAIL'}", flush=True)
        by = defaultdict(lambda: [[], [], []])
        for r, c in zip(rows, cal):
            g = by[(r[0], r[1])]; g[0].append(r[4]); g[1].append(c); g[2].append(r[5])
        for (prop, kind), (rp, cp, yy) in sorted(by.items()):
            if len(yy) >= 1500:
                print(f"   {prop:<14} {kind:<9} n {len(yy):>7,} | raw {ll(rp, yy):.4f} -> map {ll(cp, yy):.4f} | mean raw {np.mean(rp):.3f} map {np.mean(cp):.3f} actual {np.mean(yy):.3f}", flush=True)
    print(f"\nVALIDATION GATE: {'PASS (both directions)' if ok else 'FAIL - nothing written'}", flush=True)
    if write and ok:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.recalibration_map (
                fit_set text, prop text, kind text, side text, role_tier text, p_bucket int, lo numeric, hi numeric,
                n int, model_p_mean numeric, realized numeric, calibrated_p numeric, built_at timestamptz DEFAULT now(),
                PRIMARY KEY (fit_set, prop, kind, side, role_tier, p_bucket))""")
            cur.execute("DELETE FROM nba_score.recalibration_map")
            for fs, m in maps.items():
                cur.executemany("""INSERT INTO nba_score.recalibration_map (fit_set, prop, kind, side, role_tier, p_bucket, lo, hi, n,
                                   model_p_mean, realized, calibrated_p) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                                [(fs, k[0], k[1], k[2], k[3], k[4], BUCKETS[k[4]], BUCKETS[k[4] + 1], *v) for k, v in m.items() if k != "_parents"])
        conn.commit()
        print("WRITTEN: nba_score.recalibration_map (fit sets 2024-25, 2025-26, POOLED)", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
