#!/usr/bin/env python3
"""
NBA CANDIDATE CERTIFIER - POSTSEASON (strategy §31w P-5, 2026-10-08).

The regular-season certifier (certify_candidates.py) reads its outcomes from nba_market.prop_universe, which is
regular-season-only by construction (002 games). The postseason (play-in 005 + playoffs 004) is a different regime -
short benches, starters' minutes up, series-level game plans, fewer games per slate - so its legs are certified on
their OWN, with the SAME candidate configs, the SAME raw joins and the SAME ranking, swapping only the outcome source:

  board_snapshots (prizepicks, window, snapshot_ts < commence_time)  -- the real board
  -> board_outcomes (prizepicks window, graded from the postseason box score)   -- the real outcome
  -> pp_leg_price (window, current per-line price)                             -- the real price
  -> nba_score.final_hp, postseason rows only (game_id 004/005, phase 5_postseason)  -- the real ranks

WEIGHING THE POSTSEASON AGAINST THE REGULAR SEASON (owner 2026-10-08: "weigh properly comparing to the regular season").
A postseason is ~50 slate days; a regular season is ~165. Fitting cuts on the postseason alone would chase noise, and
ignoring it would assume the regimes are equal. So each config's postseason p.m is SHRUNK toward its regular-season
certified p.m (the prior), with the prior worth K postseason days:
        pm_w = (days_post * pm_post + K * pm_reg) / (days_post + K)
and a config is POSTSEASON-ELIGIBLE only when
        pm_w >= BE   AND   pm_post >= BE - floor_gap     (the postseason itself must not contradict the prior)
K and floor_gap are tunables in nba_config.classification_config['postseason_weighting'] (seeded once, never hardcoded
after that). With no postseason legs a config is NOT eligible (no evidence -> no play).

Output: nba_score.cand_certified_post  (one row per config x season, season label '<season>_post', + one 'pooled_post'
        row over both postseasons) and nba_score.cand_postseason_eligibility (one row per config: prior, postseason,
        weighted, eligible).
Env: DATABASE_URL
"""
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from certify_candidates import BE, CONFIGS  # noqa: E402  (ONE config list - the postseason never invents its own cells)

DEFAULT_CFG = {"K_days": 50, "floor_gap": 0.02,
               "note": "§31w postseason weighting: regular-season certified p.m is the prior worth K_days postseason days; "
                       "eligible iff weighted p.m >= BE and postseason p.m >= BE - floor_gap"}

SQL = """
WITH legs AS (
  SELECT game_date, season, player, side, h, price, kind, tier3,
    CASE %(rank)s WHEN 'score' THEN s_score WHEN 'baseline_hp' THEN s_base ELSE s_final END AS s
  FROM _raw WHERE prop=%(prop)s AND kind=%(kind)s AND (%(side)s='both' OR side=%(side)s)
    AND (%(tier)s::int IS NULL OR tier3=%(tier)s::int)
),
ranked AS (SELECT *, row_number() OVER (PARTITION BY game_date ORDER BY s DESC NULLS LAST, player) rn FROM legs WHERE s IS NOT NULL),
daily AS (SELECT season, game_date, avg(h*price) pm, avg(h) hit, avg(price) mult, count(*) got FROM ranked WHERE rn<=%(n)s GROUP BY 1,2)
SELECT season, count(*) days, avg(hit) hit, avg(mult) mult, avg(pm) pm, avg(CASE WHEN pm>%(be)s THEN 1.0 ELSE 0 END) above
FROM daily WHERE got=%(n)s
GROUP BY ROLLUP(season) ORDER BY season NULLS LAST
"""

RAW = """
CREATE TEMP TABLE _fh AS
  SELECT season, game_date, player_id, prop, side, line, final_hp::float s_final, baseline_hp::float s_base, score::float s_score
  FROM nba_score.final_hp WHERE game_id LIKE '004%%' OR game_id LIKE '005%%';
CREATE INDEX ON _fh (game_date, player_id, prop, side, line);

CREATE TEMP TABLE _bd AS
  SELECT DISTINCT game_date, nba_ref.norm_name(player) pn, line, side,
    replace(replace(market_key,'_alternate',''),'player_','') AS mk
  FROM nba_market.board_snapshots
  WHERE bookmaker='prizepicks' AND snapshot_label='window' AND snapshot_ts<commence_time
    AND game_date IN (SELECT DISTINCT game_date FROM _fh);
CREATE INDEX ON _bd (game_date, pn, side, line, mk);

CREATE TEMP TABLE _bo AS
  SELECT DISTINCT ON (game_date, pn, side, line, mk) game_date, pn, side, line, mk, h FROM (
    SELECT game_date, nba_ref.norm_name(player) pn, side, line,
      replace(replace(market_key,'_alternate',''),'player_','') mk,
      CASE WHEN leg_result = CASE side WHEN 'Over' THEN 'over_win' ELSE 'under_win' END THEN 1 ELSE 0 END h
    FROM nba_market.board_outcomes
    WHERE leg_result IN ('over_win','under_win')      -- board_outcomes is book-agnostic: one graded row per (date, player, market, side, line)
      AND game_date IN (SELECT DISTINCT game_date FROM _fh)) x
  ORDER BY game_date, pn, side, line, mk;
CREATE INDEX ON _bo (game_date, pn, side, line, mk);

CREATE TEMP TABLE _pr AS
  SELECT game_date, nm, side, line, kind, factor::float price, replace(base_market,'player_','') mk,
    least(abs(COALESCE(NULLIF(tier,0), round(line-anchor_line)::int)),3) AS tier3
  FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND factor IS NOT NULL AND NOT coalesce(kind_position_mismatch,false)
    AND game_date IN (SELECT DISTINCT game_date FROM _fh);
CREATE INDEX ON _pr (game_date, nm, side, line, mk);

CREATE TEMP TABLE _raw AS
SELECT bd.game_date, f.season, m.norm_name player, f.prop, bd.side, bd.line, bo.h, pr.price, pr.kind, pr.tier3,
       f.s_score, f.s_base, f.s_final
FROM _bd bd
JOIN _pr pr ON pr.game_date=bd.game_date AND pr.nm=bd.pn AND pr.side=bd.side AND pr.line=bd.line AND pr.mk=bd.mk
JOIN _bo bo ON bo.game_date=bd.game_date AND bo.pn=bd.pn AND bo.side=bd.side AND bo.line=bd.line AND bo.mk=bd.mk
JOIN nba_ref.player_name_map m ON m.norm_name=bd.pn
JOIN _fh f ON f.game_date=bd.game_date AND f.player_id=m.player_id::text AND f.side=bd.side AND f.line=bd.line
  AND f.prop=CASE bd.mk WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra'
    WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' ELSE bd.mk END
"""


def cfg(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='postseason_weighting'").fetchone()
    if r:
        return r[0]
    conn.execute("INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('postseason_weighting', %s) "
                 "ON CONFLICT (config_key) DO NOTHING", (json.dumps(DEFAULT_CFG),))
    conn.commit()
    return DEFAULT_CFG


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    c = cfg(conn)
    K, gap = float(c.get('K_days', 50)), float(c.get('floor_gap', 0.02))
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.cand_certified_post (LIKE nba_score.cand_certified INCLUDING DEFAULTS)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.cand_postseason_eligibility (
        prop text, kind text, tier int, side text, n int, rank_key text,
        days_reg int, pm_reg double precision, days_post int, pm_post double precision, hit_post double precision,
        k_days double precision, pm_weighted double precision, eligible boolean, reason text, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.cand_certified_post")
    conn.execute("DELETE FROM nba_score.cand_postseason_eligibility")
    conn.commit()
    for stmt in RAW.split(';'):
        if stmt.strip():
            conn.execute(stmt.replace('%%', '%'))
    conn.execute("CREATE INDEX ON _raw (prop, kind, tier3, side, game_date)")
    conn.execute("ANALYZE _raw")
    n_raw, n_days = conn.execute("SELECT count(*), count(DISTINCT game_date) FROM _raw").fetchone()
    print(f"  postseason priced+graded+ranked board: {n_raw:,} legs over {n_days} days | K={K:g} days, floor_gap={gap:g}", flush=True)
    # the prior: the regular-season certified row the live engine trusts (2025-26 from Nov 1 where present, else 2024-25)
    prior = {}
    for prop, kind, tier, side, n, rank, season, days, pm in conn.execute(
            "SELECT prop, kind, tier, side, n, rank_key, season, days, pm FROM nba_score.cand_certified ORDER BY season").fetchall():
        prior[(prop, kind, tier, side, n, rank)] = (days, pm)          # later season overwrites -> the most recent season wins
    print(f"{'cell':<34}{'season':<14}{'days':>5}{'hit':>7}{'p.m':>7}", flush=True)
    for prop, kind, tier, side, n, rank in CONFIGS:
        rows = conn.execute(SQL, {'kind': kind, 'tier': tier, 'side': side, 'n': n, 'rank': rank, 'prop': prop, 'be': BE}).fetchall()
        label = f"{prop} {kind[0].upper()}{tier or ''} {side} top{n} {rank}"
        pooled = None
        for season, days, hit, mult, pm, above in rows:
            lab = f"{season}_post" if season else "pooled_post"
            if season is None:
                pooled = (days, hit, pm)
            profit = 100 * (6 * 0.95 * pm ** 3 - 1)
            conn.execute("""INSERT INTO nba_score.cand_certified_post (prop, kind, tier, side, n, rank_key, season, days, hit, mult, pm, above, profit_per_100)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                         (prop, kind, tier, side, n, rank, lab, days, hit, mult, pm, above, profit))
            print(f"{label:<34}{lab:<14}{days:>5}{hit:>7.3f}{pm:>7.3f}", flush=True)
        d_reg, pm_reg = prior.get((prop, kind, tier, side, n, rank), (None, None))
        if pooled is None or pm_reg is None:
            elig, w, reason = False, None, 'no postseason legs' if pooled is None else 'no regular-season prior'
            d_post, hit_post, pm_post = (pooled or (0, None, None))
        else:
            d_post, hit_post, pm_post = pooled
            w = (d_post * pm_post + K * pm_reg) / (d_post + K)
            elig = (w >= BE) and (pm_post >= BE - gap)
            reason = 'eligible' if elig else ('weighted below BE' if w < BE else 'postseason contradicts prior')
        conn.execute("""INSERT INTO nba_score.cand_postseason_eligibility (prop, kind, tier, side, n, rank_key, days_reg, pm_reg, days_post,
                        pm_post, hit_post, k_days, pm_weighted, eligible, reason) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                     (prop, kind, tier, side, n, rank, d_reg, pm_reg, d_post, pm_post, hit_post, K, w, elig, reason))
        print(f"  -> prior {pm_reg if pm_reg is None else round(pm_reg, 3)} | weighted {w if w is None else round(w, 3)} | {reason}", flush=True)
        conn.commit()
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
