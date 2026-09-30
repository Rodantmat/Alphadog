#!/usr/bin/env python3
"""
NBA TIER-MAP GRANULAR SWEEP — the owner's rank method, at full granularity, persisted.

Owner rule: for every cell (prop x anchor-tier) of every rank, sweep the top-n hit rate at EVERY n
(1, 2, 3, ...) AND every top-percent (1%, 2%, ...) of the day's cell, until the high hit rate breaks.
Then check the survivors' real multipliers against break-even. Board-scoped, day by day, real legs.

Input : nba_score.tier_map_legs (one row per real PrizePicks window-board leg; rank_key = the ranking
        score: 'final_hp' | 'baseline_hp' | 'final_score'; n_rank = the leg's rank inside its
        (day, prop, tier) cell; factor = the real PP multiplier; hit = graded outcome).
Output: nba_score.tier_map_bands  — one row per (rank_key, window, prop, tier, cut_type, cut) with
        hit rate, mean multiplier, p·m, days, and legs — for cut_type 'n' (n = 1..N_MAX) and
        'pct' (1%..PCT_MAX% of the day's cell, min 1 leg).
        nba_score.tier_map_summary — one row per (rank_key, window, prop, tier) with the discovered
        band: best cut, peak p·m, the deepest cut still within PLATEAU of the peak, the deepest cut
        with p·m >= BE (break-even), and the first cut where it drops below BE ("where it starts losing").

Windows: '2526_nov' = 2025-26 from Nov 1 (the trusted level, section 19h); '2425' = 2024-25 (stress
floor); 'both'. Break-even BE = 0.55 (3-pick Power, section 19i); NEAR band = 0.50-0.55 is kept.

Env: DATABASE_URL, TM_RANK (comma list, default final_hp), TM_NMAX (25), TM_PCTMAX (30), TM_BE (0.55).
"""
import os
import psycopg
from collections import defaultdict

BE = float(os.environ.get('TM_BE', '0.55'))
N_MAX = int(os.environ.get('TM_NMAX', '25'))
PCT_MAX = int(os.environ.get('TM_PCTMAX', '30'))
PLATEAU = 0.02

WINDOWS = {
    '2526_nov': "season='2025-26' AND game_date >= '2025-11-01'",
    '2425':     "season='2024-25'",
    'both':     "TRUE",
}

DDL_BANDS = """
CREATE TABLE IF NOT EXISTS nba_score.tier_map_bands (
  rank_key text, win text, prop text, tier text, cut_type text, cut int,
  hit double precision, mult double precision, pm double precision, days int, legs int,
  built_at timestamptz DEFAULT now(),
  PRIMARY KEY (rank_key, win, prop, tier, cut_type, cut))"""
DDL_SUMMARY = """
CREATE TABLE IF NOT EXISTS nba_score.tier_map_summary (
  rank_key text, win text, prop text, tier text, cut_type text,
  best_cut int, peak_pm double precision, hit_at_peak double precision,
  plateau_to int, hold_be_to int, lose_at int, days int,
  status text, built_at timestamptz DEFAULT now(),
  PRIMARY KEY (rank_key, win, prop, tier, cut_type))"""

# Stage 0 (owner rule): boards, legs and outcomes are history, but the PRICE must be today's.
# PrizePicks publishes no per-leg multiplier; the system reconstructs it (pp_leg_price, one live formula,
# pp-leg-v2-sqrt-cap-conservative-floor190; a mined quote outranks the model). pp_leg_price also carries the
# system's own anchor tier (signed rungs from the anchor line). Both are used here as-is:
#   tier  = the system's |tier| capped at 3, keyed by kind  -> R / G1..G3 / D1..D3
#   factor = the current per-LINE price (never a tier average - PP prices per line, section 9 of
#            PP_PAYOUT_FINDINGS.md; only the deepest goblins sit on the flat 2.1x floor)
REBUILD_LEGS = """
INSERT INTO nba_score.tier_map_legs (rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit, n_rank, cell_size)
WITH legs AS (
  -- one common pool: priced PP window leg + graded outcome + the three rank scores from nba_score.final_hp
  SELECT pu.season, pr.game_date, pu.player, pr.prop, pr.side, pr.line, pr.kind, pr.sys_tier, pr.price,
         f.final_hp::double precision AS s_final, f.baseline_hp::double precision AS s_base, f.score::double precision AS s_score,
         pu.hit::int AS h
  FROM _priced pr
  JOIN nba_market.prop_universe pu
    ON pu.game_date=pr.game_date AND nba_ref.norm_name(pu.player)=pr.nm AND pu.prop=pr.prop
   AND pu.side=pr.side AND pu.line=pr.line AND pu.line_source='real'
  JOIN nba_score.final_hp f
    ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.line=pu.line AND f.side=pu.side
  WHERE pu.hit IS NOT NULL AND f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL
),
tiered AS (
  SELECT *, CASE WHEN kind='standard' THEN 'R'
                 WHEN kind='goblin'   THEN 'G'||least(abs(sys_tier),3)
                 WHEN kind='demon'    THEN 'D'||least(abs(sys_tier),3) END AS tier
  FROM legs
),
ranked AS (
  SELECT rk.rank_key, t.*,
    CASE rk.rank_key WHEN 'final_hp' THEN t.s_final WHEN 'baseline_hp' THEN t.s_base ELSE t.s_score END AS score
  FROM tiered t CROSS JOIN (VALUES ('final_hp'),('baseline_hp'),('final_score')) rk(rank_key)
)
SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, sys_tier, price, score, h,
  row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC),
  count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)
FROM ranked
ON CONFLICT DO NOTHING"""


def rebuild_legs(conn):
    conn.execute("DELETE FROM nba_score.tier_map_legs WHERE rank_key IN ('final_hp','baseline_hp','final_score')")
    # pp_leg_price is a 4-table view; materialize its priced window legs once, then join the flat table.
    conn.execute("""
        CREATE TEMP TABLE _priced AS
        SELECT p.game_date, p.nm,
          CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
            WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
            WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END AS prop,
          p.side, p.line, p.kind,
          -- owner rule B: when no regular line exists the anchor is the switch / rescued consensus line;
          -- the system leaves tier=0 for those, so derive it from the distance to the anchor.
          CASE WHEN p.tier IS NOT NULL AND p.tier <> 0 THEN p.tier
               WHEN p.kind IN ('goblin','demon') AND p.anchor_line IS NOT NULL THEN round(p.line - p.anchor_line)::int
               ELSE p.tier END AS sys_tier,
          p.factor::double precision AS price
        FROM nba_market.pp_leg_price p
        WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)""")
    conn.execute("CREATE INDEX ON _priced (game_date, nm, prop, side, line)")
    conn.execute("ANALYZE _priced")
    conn.execute(REBUILD_LEGS)
    conn.commit()
    for rk in ('final_hp', 'baseline_hp', 'final_score'):
        n = conn.execute("SELECT count(*) FROM nba_score.tier_map_legs WHERE rank_key=%s", (rk,)).fetchone()[0]
        print(f"  {rk}: tier_map_legs rebuilt - {n:,} legs", flush=True)


def sweep(conn, rank_key, win, where):
    rows = conn.execute(f"""
        SELECT game_date, prop, tier, n_rank, cell_size, hit, factor
        FROM nba_score.tier_map_legs
        WHERE rank_key=%s AND {where}
        ORDER BY game_date, prop, tier, n_rank""", (rank_key,)).fetchall()
    # per (day, prop, tier): ordered list of (hit, factor)
    cells = defaultdict(list)
    for gd, prop, tier, nr, cs, hit, factor in rows:
        cells[(gd, prop, tier)].append((hit, factor))
    # accumulate per (prop, tier, cut_type, cut): sum of day-rates, days, legs
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0, 0])  # hit_sum, mult_sum, pm_sum, days, legs
    for (gd, prop, tier), legs in cells.items():
        size = len(legs)
        # prefix sums along the rank
        h = m = pm = 0.0
        prefix = []
        for hit, factor in legs:
            h += hit; m += factor; pm += hit * factor
            prefix.append((h, m, pm))
        # n cuts: only days where the cell actually has n legs (no partial cells inflating the top)
        for n in range(1, min(N_MAX, size) + 1):
            hh, mm, pp = prefix[n - 1]
            a = acc[(prop, tier, 'n', n)]
            a[0] += hh / n; a[1] += mm / n; a[2] += pp / n; a[3] += 1; a[4] += n
        # pct cuts: k = ceil(size * pct/100), min 1
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
        # require the cell to exist on a meaningful number of days at the top cut
        days_top = pts[0][3]
        if days_top < 60:
            continue
        peak_cut, peak_pm, hit_peak = max(pts, key=lambda x: x[1])[0:3]
        plateau_to = max(c for c, pm, _, _ in pts if pm >= peak_pm - PLATEAU)
        hold_be = [c for c, pm, _, _ in pts if pm >= BE]
        hold_be_to = max(hold_be) if hold_be else None
        lose = [c for c, pm, _, _ in pts if pm < BE]
        lose_at = min(lose) if lose else None
        status = 'ABOVE' if peak_pm >= BE else ('NEAR' if peak_pm >= 0.50 else 'below')
        out.append((*key, peak_cut, peak_pm, hit_peak, plateau_to, hold_be_to, lose_at, days_top, status))
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(DDL_BANDS); conn.execute(DDL_SUMMARY)
    ranks = [r.strip() for r in os.environ.get('TM_RANK', 'final_hp').split(',') if r.strip()]
    for rank_key in ranks:
        if os.environ.get('TM_REBUILD', '0') == '1' and rank_key == 'final_hp':
            rebuild_legs(conn, rank_key)
        conn.execute("DELETE FROM nba_score.tier_map_bands WHERE rank_key=%s", (rank_key,))
        conn.execute("DELETE FROM nba_score.tier_map_summary WHERE rank_key=%s", (rank_key,))
        for win, where in WINDOWS.items():
            bands = sweep(conn, rank_key, win, where)
            with conn.cursor() as c:
                c.executemany("""INSERT INTO nba_score.tier_map_bands
                    (rank_key, win, prop, tier, cut_type, cut, hit, mult, pm, days, legs)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", bands)
                summ = summarize(bands)
                c.executemany("""INSERT INTO nba_score.tier_map_summary
                    (rank_key, win, prop, tier, cut_type, best_cut, peak_pm, hit_at_peak, plateau_to, hold_be_to, lose_at, days, status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", summ)
            conn.commit()
            print(f"  {rank_key} {win}: {len(bands)} band rows, {len(summ)} cells summarized", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
