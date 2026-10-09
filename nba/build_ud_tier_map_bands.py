#!/usr/bin/env python3
"""
UNDERDOG TIER-MAP GRANULAR SWEEP (strategy doc §30j) - the PrizePicks method (build_tier_map_bands.py, §19k-l),
rebuilt on Underdog's two seasons of window boards, priced by Underdog's certified formula (§30f-i).

WHAT IS THE SAME AS PRIZEPICKS (deliberately identical code below):
  - one row per real window-board leg x rank key ('final_hp' | 'baseline_hp' | 'final_score' from nba_score.final_hp)
  - n_rank = the leg's rank inside its (day, prop, tier) cell by that score; cell_size = the cell's size that day
  - the sweep: top-n (1..N_MAX, only days where the cell has >= n legs) and top-pct (1..PCT_MAX% of the day's cell, min 1)
  - windows '2526_nov' (2025-26 from Nov 1), '2425', 'both'; the summary (peak, plateau, hold-break-even, lose-at, status)

WHAT IS UNDERDOG'S OWN:
  - the board: nba_score.ud_window_legs (regular season, certified §30i). Underdog's archive carries ONE line per
    player-prop-day (never a ladder): a balanced main (modifier 1.00 both sides) or a priced line (modifier tilted).
  - factor = the side's modifier m (= 0.5 / Underdog's probability; certified exact). An entry pays base(n) x prod(m)
    (§30f; the observed ~1.04 is NOT applied - conservative), so a leg's contribution is p x m.
  - tier = the side's modifier band (Underdog's equivalent of PrizePicks' rungs - what sets the leg's break-even):
        R  = 1.00 (balanced)          F1 = 0.90-0.99   F2 = 0.80-0.89   F3 = < 0.80   (favoured sides)
                                      B1 = 1.01-1.14   B2 = 1.15-1.39   B3 = >= 1.40   (boosted sides)
  - break-even BE = 6.5^(-1/3) = 0.536: a 3-pick Standard pays 6.5 x prod(m), so each leg needs p x m >= 0.536
    (the same 3-pick reference PrizePicks' sweep used with its 0.55).
  - outcome: graded per distinct leg (nba_score.ud_stat_actual from board_outcomes); Underdog VOIDS a DNP and a push,
    so legs with no game played or stat == line are excluded (never counted as a miss).

Tables (Underdog's own; PrizePicks' tier_map_* are untouched): nba_score.ud_tier_map_legs, ud_tier_map_bands, ud_tier_map_summary.
Env: DATABASE_URL, TM_RANK (comma list, default final_hp,baseline_hp,final_score), TM_NMAX (25), TM_PCTMAX (30),
     TM_BE (0.536), TM_REBUILD (1 = rebuild ud_tier_map_legs first).
"""
import os
import psycopg
from collections import defaultdict

BE = float(os.environ.get('TM_BE') or '0.536')
N_MAX = int(os.environ.get('TM_NMAX') or '25')
PCT_MAX = int(os.environ.get('TM_PCTMAX') or '30')
PLATEAU = 0.02
MIN_DAYS = int(os.environ.get('TM_MIN_DAYS') or '60')   # §31w: the postseason record (_post) uses 20 - a postseason has <= 50 nights
SUFFIX = os.environ.get('TM_SUFFIX') or ''            # §30r: '_curr' = the build on modifiers repriced to Underdog's current logic
SOURCE = os.environ.get('TM_SOURCE') or 'nba_score.ud_window_legs'   # §30r: 'nba_score.ud_window_legs_curr'
LEGS, BANDS, SUMMARY = f'nba_score.ud_tier_map_legs{SUFFIX}', f'nba_score.ud_tier_map_bands{SUFFIX}', f'nba_score.ud_tier_map_summary{SUFFIX}'

DDL_LEGS = f"""
CREATE TABLE IF NOT EXISTS {LEGS} (
  rank_key text, season text, game_date date, player text, player_id text, prop text, side text, line numeric,
  kind text, tier text, factor double precision, score double precision, hit int, n_rank int, cell_size int,
  built_at timestamptz DEFAULT now())"""
DDL_BANDS = f"""
CREATE TABLE IF NOT EXISTS {BANDS} (
  rank_key text, win text, prop text, tier text, cut_type text, cut int,
  hit double precision, mult double precision, pm double precision, days int, legs int,
  built_at timestamptz DEFAULT now(),
  PRIMARY KEY (rank_key, win, prop, tier, cut_type, cut))"""
DDL_SUMMARY = f"""
CREATE TABLE IF NOT EXISTS {SUMMARY} (
  rank_key text, win text, prop text, tier text, cut_type text,
  best_cut int, peak_pm double precision, hit_at_peak double precision,
  plateau_to int, hold_be_to int, lose_at int, days int,
  status text, built_at timestamptz DEFAULT now(),
  PRIMARY KEY (rank_key, win, prop, tier, cut_type))"""

REBUILD_LEGS = f"""
INSERT INTO {LEGS} (rank_key, season, game_date, player, player_id, prop, side, line, kind, tier, factor, score, hit, n_rank, cell_size)
WITH legs AS (
  SELECT w.season, w.game_date, w.pn AS player, w.player_id, w.prop, w.side, w.line, w.kind, w.m::double precision AS m,
         f.final_hp::double precision AS s_final, f.baseline_hp::double precision AS s_base, f.score::double precision AS s_score,
         CASE WHEN w.side='Over'  AND s.stat_actual > w.line THEN 1
              WHEN w.side='Under' AND s.stat_actual < w.line THEN 1 ELSE 0 END AS h
  FROM {SOURCE} w
  JOIN nba_score.ud_stat_actual s
    ON s.game_date=w.game_date AND s.pn=w.pn AND s.market_key=w.market_key
  JOIN nba_score.final_hp f
    ON f.game_date=w.game_date AND f.player_id=w.player_id AND f.prop=w.prop AND f.line=w.line AND f.side=w.side
  WHERE s.played AND s.stat_actual <> w.line          -- Underdog voids a DNP and a push: excluded, never a miss
    AND f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL
),
tiered AS (
  SELECT *, CASE WHEN m > 1.0 AND m < 1.15 THEN 'B1' WHEN m >= 1.15 AND m < 1.40 THEN 'B2' WHEN m >= 1.40 THEN 'B3'
                 WHEN m = 1.0 THEN 'R' WHEN m >= 0.90 THEN 'F1' WHEN m >= 0.80 THEN 'F2' ELSE 'F3' END AS tier
  FROM legs
),
dedup AS (
  SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY game_date, player, prop, side, line ORDER BY m) dup FROM tiered) t WHERE dup=1
),
ranked AS (
  SELECT rk.rank_key, t.*,
    CASE rk.rank_key WHEN 'final_hp' THEN t.s_final WHEN 'baseline_hp' THEN t.s_base ELSE t.s_score END AS score
  FROM dedup t CROSS JOIN (VALUES ('final_hp'),('baseline_hp'),('final_score')) rk(rank_key)
)
SELECT rank_key, season, game_date, player, player_id, prop, side, line, kind, tier, m, score, h,
  row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC),
  count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)
FROM ranked"""


def rebuild_legs(conn):
    conn.execute(f"DELETE FROM {LEGS}")
    conn.execute(REBUILD_LEGS)
    conn.commit()
    for rk in ('final_hp', 'baseline_hp', 'final_score'):
        n = conn.execute(f"SELECT count(*) FROM {LEGS} WHERE rank_key=%s", (rk,)).fetchone()[0]
        print(f"  {rk}: ud_tier_map_legs rebuilt - {n:,} legs", flush=True)
    for r in conn.execute(f"""SELECT season, tier, count(*), count(DISTINCT game_date), round(avg(hit)::numeric,3), round(avg(factor)::numeric,3)
                              FROM {LEGS} WHERE rank_key='final_hp' GROUP BY 1,2 ORDER BY 1,2""").fetchall():
        print(f"    {r[0]} {r[1]:<3} legs {r[2]:>7,}  days {r[3]:>3}  hit {r[4]}  mean m {r[5]}", flush=True)


# ---- the sweep and the summary: IDENTICAL to build_tier_map_bands.py (only the table names differ) ----
def sweep(conn, rank_key, win, where):
    rows = conn.execute(f"""
        SELECT game_date, prop, tier, n_rank, cell_size, hit, factor
        FROM {LEGS}
        WHERE rank_key=%s AND {where}
        ORDER BY game_date, prop, tier, n_rank""", (rank_key,)).fetchall()
    cells = defaultdict(list)
    for gd, prop, tier, nr, cs, hit, factor in rows:
        cells[(gd, prop, tier)].append((hit, factor))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0, 0])  # hit_sum, mult_sum, pm_sum, days, legs
    for (gd, prop, tier), legs in cells.items():
        size = len(legs)
        h = m = pm = 0.0
        prefix = []
        for hit, factor in legs:
            h += hit; m += factor; pm += hit * factor
            prefix.append((h, m, pm))
        for n in range(1, min(N_MAX, size) + 1):
            hh, mm, pp = prefix[n - 1]
            a = acc[(prop, tier, 'n', n)]
            a[0] += hh / n; a[1] += mm / n; a[2] += pp / n; a[3] += 1; a[4] += n
        for pct in range(1, PCT_MAX + 1):
            k = max(1, -(-size * pct // 100))
            if k > size:
                k = size
            hh, mm, pp = prefix[k - 1]
            a = acc[(prop, tier, 'pct', pct)]
            a[0] += hh / k; a[1] += mm / k; a[2] += pp / k; a[3] += 1; a[4] += k
    out = []
    for (prop, tier, ct, cut), (hs, ms, ps, d, lg) in acc.items():
        if d == 0:
            continue
        out.append((rank_key, win, prop, tier, ct, cut, hs / d, ms / d, ps / d, d, lg))
    return out


def summarize(bands):
    by = defaultdict(list)
    for r in bands:
        rank_key, win, prop, tier, ct, cut, hit, mult, pm, days, legs = r
        by[(rank_key, win, prop, tier, ct)].append((cut, pm, hit, days))
    out = []
    for key, pts in by.items():
        pts.sort()
        days_top = pts[0][3]
        if days_top < 60:
            continue
        peak_cut, peak_pm, hit_peak = max(pts, key=lambda x: x[1])[0:3]
        plateau_to = max(c for c, pm, _, _ in pts if pm >= peak_pm - PLATEAU)
        hold_be = [c for c, pm, _, _ in pts if pm >= BE]
        hold_be_to = max(hold_be) if hold_be else None
        lose = [c for c, pm, _, _ in pts if pm < BE]
        lose_at = min(lose) if lose else None
        status = 'ABOVE' if peak_pm >= BE else ('NEAR' if peak_pm >= BE - 0.05 else 'below')
        out.append((*key, peak_cut, peak_pm, hit_peak, plateau_to, hold_be_to, lose_at, days_top, status))
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(DDL_LEGS); conn.execute(DDL_BANDS); conn.execute(DDL_SUMMARY)
    if (os.environ.get('TM_REBUILD') or '0') == '1':
        rebuild_legs(conn)
    ranks = [r.strip() for r in (os.environ.get('TM_RANK') or 'final_hp,baseline_hp,final_score').split(',') if r.strip()]
    print(f"break-even (3-pick Standard, 6.5^(-1/3)): BE = {BE}", flush=True)
    for rank_key in ranks:
        conn.execute(f"DELETE FROM {BANDS} WHERE rank_key=%s", (rank_key,))
        conn.execute(f"DELETE FROM {SUMMARY} WHERE rank_key=%s", (rank_key,))
        seasons = [r[0] for r in conn.execute(f"SELECT DISTINCT season FROM {LEGS} WHERE rank_key=%s ORDER BY 1", (rank_key,)).fetchall()]
        windows = {}
        for s in seasons:
            if s == '2025-26':
                windows['2526_nov'] = "season='2025-26' AND game_date >= '2025-11-01'"
            elif s == '2024-25':
                windows['2425'] = "season='2024-25'"
            else:
                windows[s.replace('-', '')] = f"season='{s}'"
        windows['both'] = "TRUE"
        for win, where in windows.items():
            bands = sweep(conn, rank_key, win, where)
            with conn.cursor() as c:
                c.executemany(f"""INSERT INTO {BANDS}
                    (rank_key, win, prop, tier, cut_type, cut, hit, mult, pm, days, legs)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", bands)
                summ = summarize(bands)
                c.executemany(f"""INSERT INTO {SUMMARY}
                    (rank_key, win, prop, tier, cut_type, best_cut, peak_pm, hit_at_peak, plateau_to, hold_be_to, lose_at, days, status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", summ)
            conn.commit()
            print(f"  {rank_key} {win}: {len(bands)} band rows, {len(summ)} cells summarized", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
