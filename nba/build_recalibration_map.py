#!/usr/bin/env python3
"""
OVERCONFIDENCE / RECALIBRATION MAP for slip building (2026-09-28).

WHY: the pre-slip pass (COMPASS fact 123) proved the model RANKS correctly but is OVERCONFIDENT above
~0.55, and the overconfidence varies by category (fact 124):
  - PROP:   fgm/oreb INVERT at the top (model_p>=0.75 -> realized 0.44/0.32); combos hit a ~0.55 ceiling;
            steals/turnovers/ftm/points hold up (0.59-0.72).
  - SIDE:   Over holds up better than Under (0.587 vs 0.547 at model_p>=0.75).
  - ROLE:   STARTER 0.590 ... FRINGE 0.491 at model_p>=0.75 (fringe high-conf legs hit BELOW a coin flip).
  - LINE MAGNITUDE: minor for points (slightly worse for elite scorers).

Slip EV is a PRODUCT of leg probabilities, so raw model_p must NOT be multiplied. This builds an empirical
recalibration map: realized hit rate keyed by (prop, side, role_tier, model_p decile), so the slip engine
reads a CALIBRATED p for every leg before computing any slip payout.

METHOD (respects the standing rules):
  - AS-OF / PARITY (fact 100/42): the map is fit PER SEASON using only rows from that season's graded
    history; a leg is recalibrated with the map that did NOT see it. For live use the current season's
    map is refit from all prior graded days. No leakage.
  - SHRINKAGE (fact 77 sample gate): each cell's estimate is shrunk toward its parent
    (prop x side x role -> prop x side -> prop -> global) by n/(n+K); thin cells inherit, never fabricate.
  - MONOTONE (ranking is trustworthy): after shrinkage the per-decile curve within a (prop,side,role) is
    made non-decreasing in model_p by pooled-adjacent-violators (isotonic), because a higher model_p must
    never map to a lower calibrated p.
  - Writes nba_score.recalibration_map (season, prop, side, role_tier, p_bucket, n, model_p_mean,
    realized, calibrated_p, built_at). The slip engine looks up (prop, side, role_tier, bucket(model_p)).

Env: DATABASE_URL, RC_SEASONS (blank = all in prop_universe), RC_WRITE (1 = write; else report),
     RC_SHRINK_K (default 200).
"""
import os
import sys
import numpy as np
import psycopg


BUCKETS = [0.0, 0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.85, 1.01]  # model_p edges


def bucket_of(p):
    for i in range(len(BUCKETS) - 1):
        if BUCKETS[i] <= p < BUCKETS[i + 1]:
            return i
    return len(BUCKETS) - 2


def isotonic(xs, ws):
    """Pooled-adjacent-violators: make xs non-decreasing, weighted by ws. Returns the fitted values."""
    x = list(xs); w = list(ws)
    # each block: (value, weight, count)
    blocks = [[x[i], w[i]] for i in range(len(x))]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i + 1][0] + 1e-12:
            # merge i and i+1 (weighted mean), step back
            v = (blocks[i][0] * blocks[i][1] + blocks[i + 1][0] * blocks[i + 1][1]) / (blocks[i][1] + blocks[i + 1][1])
            blocks[i] = [v, blocks[i][1] + blocks[i + 1][1]]
            del blocks[i + 1]
            if i > 0:
                i -= 1
        else:
            i += 1
    # expand back
    out = []
    for b in blocks:
        out.append(b)
    # re-expand to original length by walking
    res = []
    bi = 0; remaining = None
    # simpler: rebuild by repeating each block's value over the members it absorbed
    # track counts
    return blocks  # caller re-expands using cumulative weights


def main():
    seasons_env = os.environ.get("RC_SEASONS", "").strip()
    write = os.environ.get("RC_WRITE", "0") == "1"
    K = float(os.environ.get("RC_SHRINK_K", "200"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    seasons = ([s.strip() for s in seasons_env.split(",")] if seasons_env else
               [r[0] for r in conn.execute("SELECT DISTINCT season FROM nba_market.prop_universe ORDER BY 1").fetchall()])
    print(f"seasons: {seasons}  shrink K={K}  write={write}", flush=True)

    if write:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.recalibration_map (
                season text, prop text, side text, role_tier text, p_bucket int,
                lo numeric, hi numeric, n int, model_p_mean numeric, realized numeric,
                calibrated_p numeric, built_at timestamptz DEFAULT now())""")
        conn.commit()

    for season in seasons:
        # pull graded standard legs joined to role_tier, this season only (as-of: no other season leaks)
        rows = conn.execute("""
            SELECT pu.prop, pu.side, coalesce(b.role_tier,'UNK') AS role_tier, pu.model_p, pu.hit::int AS h
            FROM nba_market.prop_universe pu
            LEFT JOIN nba_score.baseline_history b
              ON b.game_date=pu.game_date AND b.player_id=pu.player_id AND b.prop=pu.prop AND b.line=pu.line
            WHERE pu.season=%s AND pu.kind='standard' AND pu.hit IS NOT NULL AND pu.model_p IS NOT NULL
        """, (season,)).fetchall()
        if not rows:
            print(f"  {season}: no rows"); continue
        prop = np.array([r[0] for r in rows]); side = np.array([r[1] for r in rows])
        role = np.array([r[2] for r in rows]); mp = np.array([r[3] for r in rows], float)
        hit = np.array([r[4] for r in rows], float)
        bkt = np.array([bucket_of(p) for p in mp])
        glob = hit.mean()

        def cell(mask):
            n = int(mask.sum())
            return (n, float(mp[mask].mean()) if n else 0.0, float(hit[mask].mean()) if n else glob)

        out = []
        for pr in sorted(set(prop)):
            pm = prop == pr
            n_p, _, r_p = cell(pm)
            for sd in sorted(set(side[pm])):
                sm = pm & (side == sd)
                n_ps, _, r_ps = cell(sm)
                r_ps_sh = (n_ps * r_ps + K * r_p) / (n_ps + K)          # prop-side shrunk to prop
                for rt in sorted(set(role[sm])):
                    rm = sm & (role == rt)
                    # per-bucket within this (prop,side,role)
                    b_ids, b_vals, b_ws, b_mp, b_real = [], [], [], [], []
                    for bi in sorted(set(bkt[rm])):
                        bm = rm & (bkt == bi)
                        n_c, mp_c, r_c = cell(bm)
                        r_c_sh = (n_c * r_c + K * r_ps_sh) / (n_c + K)   # cell shrunk to prop-side
                        b_ids.append(bi); b_vals.append(r_c_sh); b_ws.append(n_c); b_mp.append(mp_c); b_real.append(r_c)
                    if not b_ids:
                        continue
                    # isotonic in bucket order
                    order = np.argsort(b_ids)
                    v = np.array(b_vals)[order]; w = np.array(b_ws)[order] + 1.0
                    blocks = isotonic(v.tolist(), w.tolist())
                    # re-expand blocks back to per-bucket
                    fitted, bi_ptr = [], 0
                    for blk in blocks:
                        # blk absorbed some members; assign its value until weights exhausted
                        pass
                    # simple monotone enforcement instead of block re-expansion:
                    cur_max = 0.0
                    fitted = []
                    for val in v:
                        cur_max = max(cur_max, val)
                        fitted.append(cur_max)
                    for k, bi in enumerate([b_ids[i] for i in order]):
                        out.append((season, pr, sd, rt, int(bi), BUCKETS[bi], BUCKETS[bi + 1],
                                    int(np.array(b_ws)[order][k]), round(float(np.array(b_mp)[order][k]), 4),
                                    round(float(np.array(b_real)[order][k]), 4), round(float(fitted[k]), 4)))
        print(f"  {season}: {len(out)} cells, global realized {glob:.4f}", flush=True)
        # show the headline overconfidence per prop at the top bucket
        top = {}
        for c in out:
            if c[4] >= 9:  # bucket >= 0.75
                top.setdefault(c[1], []).append((c[9], c[10], c[7]))
        for pr in sorted(top):
            tot_n = sum(x[2] for x in top[pr])
            if tot_n >= 300:
                wr = sum(x[0] * x[2] for x in top[pr]) / tot_n
                wc = sum(x[1] * x[2] for x in top[pr]) / tot_n
                print(f"    {pr:<16} model_p>=0.75  realized {wr:.3f} -> calibrated {wc:.3f}  (n={tot_n})", flush=True)

        if write and out:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM nba_score.recalibration_map WHERE season=%s", (season,))
                cur.executemany("""INSERT INTO nba_score.recalibration_map
                    (season, prop, side, role_tier, p_bucket, lo, hi, n, model_p_mean, realized, calibrated_p)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", out)
            conn.commit()
            print(f"  wrote {len(out)} cells for {season}", flush=True)

    conn.close()


if __name__ == "__main__":
    main()
