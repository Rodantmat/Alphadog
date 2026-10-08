-- DUMP OF THE NBA DATABASE FUNCTIONS (2026-10-08, nba/dump_db_sql.py). The database is the running copy; this file is the
-- record (round-2 P3#16: critical-path SQL must be certifiable from source and recoverable from git).
-- Do not hand-edit: change the database (or the hand-maintained source files in this folder), then re-dump.

CREATE OR REPLACE FUNCTION nba_market.build_derived_alt_backsim()
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- Simulated FGA / 3PA goblin + demon (More) around the derived standard center (nba_market.derived_backsim), rules and
-- conservative prices from pp_conservative_policy.derived_alt_rules, lines moved harder by derived_line_shift. Rebuild after
-- build_derived_backsim or any policy change.
DELETE FROM nba_market.derived_alt_backsim;
WITH pol AS (SELECT (SELECT value_json FROM nba_config.pp_conservative_policy WHERE policy_key = 'derived_alt_rules') AS r,
                    (SELECT value_json FROM nba_config.pp_conservative_policy WHERE policy_key = 'derived_line_shift') AS s),
b AS (
  SELECT d.game_date, d.season, d.player, d.player_id, d.prop, d.center, d.actual, (pol.s->>d.prop)::numeric AS sh,
         CASE WHEN d.prop = 'fga' THEN (pol.r->'fga'->>'gap')::numeric
              WHEN d.center <= (pol.r->'fg3a'->>'large_from_center')::numeric THEN (pol.r->'fg3a'->>'gap_small')::numeric
              ELSE (pol.r->'fg3a'->>'gap_large')::numeric END AS gap,
         (pol.r->d.prop->>'goblin_2pick')::numeric / 3 AS gf, (pol.r->d.prop->>'demon_2pick')::numeric / 3 AS df
  FROM nba_market.derived_backsim d CROSS JOIN pol WHERE d.prop IN ('fga', 'fg3a')
),
k AS (
  SELECT b.*, 'goblin' AS kind, ceil(center - gap + sh - 0.5) + 0.5 AS line, gf AS factor FROM b
  UNION ALL
  SELECT b.*, 'demon', ceil(center + gap + sh - 0.5) + 0.5, df FROM b
),
ins AS (
  INSERT INTO nba_market.derived_alt_backsim (game_date, season, player, player_id, prop, kind, center, gap, line, factor, hp, actual)
  SELECT k.game_date, k.season, k.player, k.player_id, k.prop, k.kind, k.center, k.gap, k.line, k.factor,
         (SELECT bh.p_more FROM nba_score.baseline_history bh WHERE bh.game_date = k.game_date AND bh.player_id = k.player_id
            AND bh.prop = k.prop AND bh.line = k.line LIMIT 1), k.actual
  FROM k WHERE k.line >= 0.5
  ON CONFLICT DO NOTHING
  RETURNING 1
)
SELECT count(*) FROM ins;
$function$;

CREATE OR REPLACE FUNCTION nba_market.build_derived_backsim(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- DERIVED BOX-SCORE PROPS BACK-SIMULATION (2026-09-21): FG attempted/made, FT attempted/made, 3-PT attempted, offensive and
-- defensive rebounds - props no sportsbook quotes. PrizePicks cuts every line from ONE box-score projection per player.
-- center = (book POINTS line x prior-30-day stat/points ratio; OREB/DREB = REBOUNDS line x share) - center offset per prop
--          (pp_conservative_policy.derived_center_offset: brings the best-center over-rate to ~48.5%, as real low-count
--          PrizePicks lines behave), nearest .5.   CONSERVATIVE (owner): Over at center + shift, Under at center - shift, then
--          the next harder .5 (derived_line_shift).   hp_* = the model's probability at that exact line (baseline_history).
DELETE FROM nba_market.derived_backsim WHERE game_date BETWEEN p_from AND p_to;
WITH pol AS (SELECT (SELECT value_json FROM nba_config.pp_conservative_policy WHERE policy_key = 'derived_line_shift') AS v,
                    (SELECT value_json FROM nba_config.pp_conservative_policy WHERE policy_key = 'derived_center_offset') AS o),
s0 AS (
  SELECT b.game_date, b.player, b.market_key, b.line FROM nba_market.board_snapshots b
  WHERE b.game_date BETWEEN p_from AND p_to AND b.snapshot_label = 'window' AND b.side = 'Over'
    AND b.bookmaker NOT IN ('underdog','sleeper','pick6','betr_us_dfs') AND b.market_key IN ('player_points','player_rebounds')
),
cons AS (SELECT game_date, player, market_key, percentile_cont(0.5) WITHIN GROUP (ORDER BY line) AS c FROM s0 GROUP BY 1, 2, 3),
L AS (SELECT game_date, player, max(c) FILTER (WHERE market_key = 'player_points') AS pts_l,
             max(c) FILTER (WHERE market_key = 'player_rebounds') AS reb_l FROM cons GROUP BY 1, 2),
ids AS (SELECT L.*, m.player_id::text AS pid FROM L
        JOIN nba_ref.player_name_map m ON m.norm_name = lower(regexp_replace(L.player, '[^A-Za-z]', '', 'g')) WHERE L.pts_l IS NOT NULL),
gl AS (SELECT DISTINCT k, game_date, pts, reb, oreb, dreb, fga, fgm, fg3a, fta, ftm FROM (
         SELECT player_id AS k, game_date, pts, reb, oreb, dreb, fga, fgm, fg3a, fta, ftm FROM nba_stats.player_game_log
         WHERE min > 0 AND game_date BETWEEN p_from - 31 AND p_to
         UNION SELECT nba_player_id::text, game_date, pts, reb, oreb, dreb, fga, fgm, fg3a, fta, ftm FROM nba_stats.player_game_log
         WHERE min > 0 AND game_date BETWEEN p_from - 31 AND p_to) u),
h AS (
  SELECT i.game_date, i.player, count(*) AS games, sum(g.pts) AS s_pts, sum(g.reb) AS s_reb, sum(g.oreb) AS s_oreb, sum(g.dreb) AS s_dreb,
         sum(g.fga) AS s_fga, sum(g.fgm) AS s_fgm, sum(g.fg3a) AS s_fg3a, sum(g.fta) AS s_fta, sum(g.ftm) AS s_ftm
  FROM ids i JOIN gl g ON g.k = i.pid AND g.game_date < i.game_date AND g.game_date >= i.game_date - 30 GROUP BY 1, 2
),
act AS (SELECT i.game_date, i.player, g.oreb, g.dreb, g.fga, g.fgm, g.fg3a, g.fta, g.ftm FROM ids i JOIN gl g ON g.k = i.pid AND g.game_date = i.game_date),
est AS (
  SELECT i.game_date, i.player, i.pid, h.games, x.prop, x.estimator, x.craw::numeric AS craw, x.actual
  FROM ids i JOIN h USING (game_date, player) LEFT JOIN act a USING (game_date, player)
  CROSS JOIN LATERAL (VALUES
    ('fga',  'points-scaled', i.pts_l * h.s_fga  / nullif(h.s_pts, 0), a.fga),
    ('fgm',  'points-scaled', i.pts_l * h.s_fgm  / nullif(h.s_pts, 0), a.fgm),
    ('fta',  'points-scaled', i.pts_l * h.s_fta  / nullif(h.s_pts, 0), a.fta),
    ('ftm',  'points-scaled', i.pts_l * h.s_ftm  / nullif(h.s_pts, 0), a.ftm),
    ('fg3a', 'points-scaled', i.pts_l * h.s_fg3a / nullif(h.s_pts, 0), a.fg3a),
    ('oreb', 'rebounds-share', i.reb_l * h.s_oreb / nullif(h.s_reb, 0), a.oreb),
    ('dreb', 'rebounds-share', i.reb_l * h.s_dreb / nullif(h.s_reb, 0), a.dreb)) x(prop, estimator, craw, actual)
  WHERE h.games >= 5
),
ln AS (
  SELECT est.*, coalesce((pol.o->>est.prop)::numeric, 0) AS off,
         round((craw - coalesce((pol.o->>est.prop)::numeric, 0)) * 2) / 2.0 AS ctr, (pol.v->>est.prop)::numeric AS sh
  FROM est CROSS JOIN pol WHERE craw IS NOT NULL AND craw > 0.3
),
ln2 AS (SELECT ln.*, ceil(ctr + sh - 0.5) + 0.5 AS l_over,
               CASE WHEN floor(ctr - sh + 0.5) - 0.5 >= 0.5 THEN floor(ctr - sh + 0.5) - 0.5 END AS l_under FROM ln WHERE ctr >= 0.5),
ins AS (
  INSERT INTO nba_market.derived_backsim (game_date, season, player, player_id, prop, estimator, games_used, center_raw, center_offset, center,
         shift, over_line, under_line, hp_over, hp_under, actual)
  SELECT ln2.game_date, CASE WHEN ln2.game_date >= '2025-07-01' THEN '2025-26' ELSE '2024-25' END, ln2.player, ln2.pid, ln2.prop,
         ln2.estimator, ln2.games, round(ln2.craw, 3), ln2.off, ln2.ctr, ln2.sh, ln2.l_over, ln2.l_under,
         (SELECT bh.p_more FROM nba_score.baseline_history bh WHERE bh.game_date = ln2.game_date AND bh.player_id = ln2.pid AND bh.prop = ln2.prop AND bh.line = ln2.l_over LIMIT 1),
         (SELECT bh.p_less FROM nba_score.baseline_history bh WHERE bh.game_date = ln2.game_date AND bh.player_id = ln2.pid AND bh.prop = ln2.prop AND bh.line = ln2.l_under LIMIT 1),
         ln2.actual
  FROM ln2
  ON CONFLICT (game_date, player, prop) DO NOTHING
  RETURNING 1
)
SELECT count(*) FROM ins;
$function$;

CREATE OR REPLACE FUNCTION nba_market.build_fs_backsim(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- FANTASY SCORE BACK-SIMULATION (2026-09-21) - plain SQL (the PL/pgSQL version failed on variable substitution).
--  center = PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK - TOV of BOOK-CONSENSUS component lines ('window' snapshot; books incl.
--           PrizePicks); missing components = player's prior-30-day MEDIAN; no offset; nearest .5 (validated unbiased: 51.9% over).
--  gap    = round_half(3.2 + 0.07 * center) (all 15 distinct WNBA lines).  CONSERVATIVE (owner): every simulated line moves
--           AGAINST the pick by pp_conservative_policy.derived_line_shift.fantasy_score, then to the next harder .5; prices from
--           pp_conservative_policy.fantasy_score.  hp_* = the model's probability at that exact line (baseline_history).
DELETE FROM nba_market.fs_backsim WHERE game_date BETWEEN p_from AND p_to;
WITH pol AS (
  SELECT (SELECT (value_json->>'fantasy_score')::numeric FROM nba_config.pp_conservative_policy WHERE policy_key = 'derived_line_shift') AS sh,
         (SELECT (value_json->>'goblin_2pick')::numeric / 3 FROM nba_config.pp_conservative_policy WHERE policy_key = 'fantasy_score') AS gf,
         (SELECT (value_json->>'demon_2pick')::numeric / 3 FROM nba_config.pp_conservative_policy WHERE policy_key = 'fantasy_score') AS df
),
s0 AS (
  SELECT b.game_date, b.player, b.market_key, b.line FROM nba_market.board_snapshots b
  WHERE b.game_date BETWEEN p_from AND p_to AND b.snapshot_label = 'window' AND b.side = 'Over'
    AND b.bookmaker NOT IN ('underdog','sleeper','pick6','betr_us_dfs')
    AND b.market_key IN ('player_points','player_rebounds','player_assists','player_steals','player_blocks','player_turnovers')
),
cons AS (SELECT game_date, player, market_key, percentile_cont(0.5) WITHIN GROUP (ORDER BY line) AS c FROM s0 GROUP BY 1, 2, 3),
pv AS (
  SELECT game_date, player,
         max(c) FILTER (WHERE market_key = 'player_points') AS pts, max(c) FILTER (WHERE market_key = 'player_rebounds') AS reb,
         max(c) FILTER (WHERE market_key = 'player_assists') AS ast, max(c) FILTER (WHERE market_key = 'player_steals') AS stl,
         max(c) FILTER (WHERE market_key = 'player_blocks') AS blk, max(c) FILTER (WHERE market_key = 'player_turnovers') AS tov
  FROM cons GROUP BY 1, 2
),
ids AS (SELECT pv.*, m.player_id::text AS pid FROM pv
        JOIN nba_ref.player_name_map m ON m.norm_name = lower(regexp_replace(pv.player, '[^A-Za-z]', '', 'g'))
        WHERE pv.pts IS NOT NULL),
gl AS (SELECT DISTINCT k, game_date, pts, reb, ast, stl, blk, tov FROM (
         SELECT player_id AS k, game_date, pts, reb, ast, stl, blk, tov FROM nba_stats.player_game_log
         WHERE min > 0 AND game_date BETWEEN p_from - 31 AND p_to
         UNION SELECT nba_player_id::text, game_date, pts, reb, ast, stl, blk, tov FROM nba_stats.player_game_log
         WHERE min > 0 AND game_date BETWEEN p_from - 31 AND p_to) u),
roll AS (
  SELECT i.game_date, i.player,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY g.reb) AS reb_med, percentile_cont(0.5) WITHIN GROUP (ORDER BY g.ast) AS ast_med,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY g.stl) AS stl_med, percentile_cont(0.5) WITHIN GROUP (ORDER BY g.blk) AS blk_med,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY g.tov) AS tov_med
  FROM ids i JOIN gl g ON g.k = i.pid AND g.game_date < i.game_date AND g.game_date >= i.game_date - 30 GROUP BY 1, 2
),
outc AS (SELECT i.game_date, i.player, (g.pts + 1.2 * g.reb + 1.5 * g.ast + 3 * g.stl + 3 * g.blk - g.tov)::numeric AS fs
         FROM ids i JOIN gl g ON g.k = i.pid AND g.game_date = i.game_date),
c1 AS (
  SELECT i.game_date, i.player, i.pid, i.pts, coalesce(i.reb, r.reb_med) AS reb, coalesce(i.ast, r.ast_med) AS ast,
         coalesce(i.stl, r.stl_med) AS stl, coalesce(i.blk, r.blk_med) AS blk, coalesce(i.tov, r.tov_med) AS tov,
         (i.reb IS NULL OR i.ast IS NULL OR i.stl IS NULL OR i.blk IS NULL OR i.tov IS NULL) AS fb, o.fs
  FROM ids i JOIN roll r USING (game_date, player) LEFT JOIN outc o USING (game_date, player)
),
c2 AS (
  SELECT c1.*, (pts + 1.2 * reb + 1.5 * ast + 3 * stl + 3 * blk - tov)::numeric AS craw,
         (round((pts + 1.2 * reb + 1.5 * ast + 3 * stl + 3 * blk - tov) * 2) / 2.0)::numeric AS ctr
  FROM c1 WHERE reb IS NOT NULL AND ast IS NOT NULL AND stl IS NOT NULL AND blk IS NOT NULL AND tov IS NOT NULL
),
c3 AS (
  SELECT c2.*, pol.sh, pol.gf, pol.df, round((3.2 + 0.07 * ctr) * 2) / 2.0 AS g,
         ceil(ctr + pol.sh - 0.5) + 0.5 AS l_so, floor(ctr - pol.sh + 0.5) - 0.5 AS l_su
  FROM c2 CROSS JOIN pol WHERE ctr > 5
),
c4 AS (SELECT c3.*, ceil(ctr - g + sh - 0.5) + 0.5 AS l_g, ceil(ctr + g + sh - 0.5) + 0.5 AS l_d FROM c3),
ins AS (
  INSERT INTO nba_market.fs_backsim (game_date, season, player, player_id, pts_c, reb_c, ast_c, stl_c, blk_c, tov_c, used_fallback,
         center_raw, center, gap, std_over_line, std_under_line, goblin_line, demon_line, goblin_factor, demon_factor,
         hp_std_over, hp_std_under, hp_goblin, hp_demon, fs_actual)
  SELECT c4.game_date, CASE WHEN c4.game_date >= '2025-07-01' THEN '2025-26' ELSE '2024-25' END, c4.player, c4.pid,
         c4.pts, c4.reb, c4.ast, c4.stl, c4.blk, c4.tov, c4.fb, round(c4.craw, 3), c4.ctr, c4.g, c4.l_so, c4.l_su, c4.l_g, c4.l_d,
         c4.gf, c4.df,
         (SELECT bh.p_more FROM nba_score.baseline_history bh WHERE bh.game_date = c4.game_date AND bh.player_id = c4.pid AND bh.prop = 'fantasy_score' AND bh.line = c4.l_so LIMIT 1),
         (SELECT bh.p_less FROM nba_score.baseline_history bh WHERE bh.game_date = c4.game_date AND bh.player_id = c4.pid AND bh.prop = 'fantasy_score' AND bh.line = c4.l_su LIMIT 1),
         (SELECT bh.p_more FROM nba_score.baseline_history bh WHERE bh.game_date = c4.game_date AND bh.player_id = c4.pid AND bh.prop = 'fantasy_score' AND bh.line = c4.l_g LIMIT 1),
         (SELECT bh.p_more FROM nba_score.baseline_history bh WHERE bh.game_date = c4.game_date AND bh.player_id = c4.pid AND bh.prop = 'fantasy_score' AND bh.line = c4.l_d LIMIT 1),
         c4.fs
  FROM c4
  ON CONFLICT (game_date, player) DO NOTHING
  RETURNING 1
)
SELECT count(*) FROM ins;
$function$;

CREATE OR REPLACE FUNCTION nba_market.build_prop_universe(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- PROP UNIVERSE (2026-09-21). Sources: (1) REAL archived PrizePicks legs = nba_market.pp_model_vs_price, multipliers from
-- nba_market.pp_leg_price_cons (materialized current conservative prices): the price whose KIND matches the leg's PrizePicks
-- label, else the lowest (never drops a leg); (2) Fantasy Score = fs_backsim; (3) derived box-score standards = derived_backsim;
-- (4) FGA/3PA goblins+demons = derived_alt_backsim. Game from player_game_map (pre-game), team from the box score.
-- phase, flags and the no-box-score rule are set HERE, at insert (each row written once): phase from the NBA game-ID season-type
-- digit (mode per night); nights with no box scores -> 'no-boxscore', result/hit NULL (ungraded, NOT void = sat out);
-- flag = 'demon_priced_below_standard' / 'kind_price_mismatch' for real legs whose multiplier contradicts their kind.
DELETE FROM nba_market.prop_universe WHERE game_date BETWEEN p_from AND p_to;

INSERT INTO nba_market.prop_universe (season, game_date, event_id, home_team, away_team, team_id, player, player_id, prop, kind, side, line,
       line_source, price_source, method, factor, two_pick, model_p, stat_actual, result, hit, phase, flag)
WITH ph AS (SELECT game_date, CASE mode() WITHIN GROUP (ORDER BY left(ltrim(game_id::text, '0'), 1))
                                WHEN '2' THEN 'regular' WHEN '4' THEN 'playoffs' WHEN '5' THEN 'play-in' WHEN '1' THEN 'preseason' WHEN '3' THEN 'all-star' ELSE 'other' END AS phase
            FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to GROUP BY game_date),
gl AS (SELECT DISTINCT ON (k, game_date) k, game_date, team_id::text AS team_id FROM (
         SELECT player_id AS k, game_date, team_id FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to
         UNION ALL SELECT nba_player_id::text, game_date, team_id FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to) u
       ORDER BY k, game_date),
cand AS (
  SELECT mv.season, mv.game_date, mv.player, mv.prop, mv.kind, mv.side, mv.line, mv.final_hp, mv.stat_actual, mv.leg_result,
         lp.factor, (lp.kind = mv.kind) AS kind_match
  FROM nba_market.pp_model_vs_price mv
  JOIN nba_market.pp_leg_price_cons lp ON lp.game_date = mv.game_date AND lp.player = mv.player AND lp.base_market = mv.base_market
                                       AND lp.side = mv.side AND lp.line = mv.line
  WHERE mv.game_date BETWEEN p_from AND p_to AND mv.kind IN ('standard', 'goblin', 'demon')
),
best AS (SELECT DISTINCT ON (game_date, player, prop, kind, side, line) * FROM cand
         ORDER BY game_date, player, prop, kind, side, line, kind_match DESC, factor ASC)
SELECT b.season, b.game_date, pg.event_id, pg.home_team, pg.away_team, gl.team_id, b.player, m.player_id::text,
       b.prop, b.kind, b.side, b.line, 'real', CASE WHEN b.kind = 'standard' THEN 'exact' ELSE 'model-conservative' END, 'archive',
       b.factor, round(3 * b.factor, 4), b.final_hp, b.stat_actual,
       CASE WHEN ph.phase IS NULL OR b.leg_result IS NULL THEN NULL WHEN b.leg_result = 'dnp' THEN 'void' WHEN b.leg_result = 'push' THEN 'push'
            WHEN (b.leg_result = 'over_win' AND b.side = 'Over') OR (b.leg_result = 'under_win' AND b.side = 'Under') THEN 'hit' ELSE 'miss' END,
       CASE WHEN ph.phase IS NOT NULL AND b.leg_result IN ('over_win', 'under_win') THEN (b.leg_result = 'over_win') = (b.side = 'Over') END,
       coalesce(ph.phase, 'no-boxscore'),
       CASE WHEN b.kind = 'demon' AND b.factor <= 1 THEN 'demon_priced_below_standard'
            WHEN (b.kind = 'standard' AND b.factor <> 1) OR (b.kind = 'goblin' AND b.factor >= 1) THEN 'kind_price_mismatch' END
FROM best b
LEFT JOIN ph ON ph.game_date = b.game_date
LEFT JOIN nba_market.player_game_map pg ON pg.game_date = b.game_date AND pg.player = b.player
LEFT JOIN nba_ref.player_name_map m ON m.norm_name = lower(regexp_replace(b.player, '[^A-Za-z]', '', 'g'))
LEFT JOIN gl ON gl.k = m.player_id::text AND gl.game_date = b.game_date
ON CONFLICT DO NOTHING;

INSERT INTO nba_market.prop_universe (season, game_date, event_id, home_team, away_team, team_id, player, player_id, prop, kind, side, line,
       line_source, price_source, method, factor, two_pick, model_p, stat_actual, result, hit, phase, flag)
WITH ph AS (SELECT game_date, CASE mode() WITHIN GROUP (ORDER BY left(ltrim(game_id::text, '0'), 1))
                                WHEN '2' THEN 'regular' WHEN '4' THEN 'playoffs' WHEN '5' THEN 'play-in' WHEN '1' THEN 'preseason' WHEN '3' THEN 'all-star' ELSE 'other' END AS phase
            FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to GROUP BY game_date),
gl AS (SELECT DISTINCT ON (k, game_date) k, game_date, team_id::text AS team_id FROM (
         SELECT player_id AS k, game_date, team_id FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to
         UNION ALL SELECT nba_player_id::text, game_date, team_id FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to) u
       ORDER BY k, game_date),
sim AS (
  SELECT f.season, f.game_date, f.player, f.player_id, 'fantasy_score' AS prop, x.kind, x.side, x.line, x.price_source, 'fs-reconstruction' AS method,
         x.factor, x.hp, f.fs_actual AS actual
  FROM nba_market.fs_backsim f CROSS JOIN LATERAL (VALUES
    ('standard', 'Over', f.std_over_line, 'exact', 1.0::numeric, f.hp_std_over),
    ('standard', 'Under', f.std_under_line, 'exact', 1.0::numeric, f.hp_std_under),
    ('goblin', 'Over', f.goblin_line, 'policy-conservative', f.goblin_factor, f.hp_goblin),
    ('demon', 'Over', f.demon_line, 'policy-conservative', f.demon_factor, f.hp_demon)) x(kind, side, line, price_source, factor, hp)
  WHERE f.game_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT d.season, d.game_date, d.player, d.player_id, d.prop, 'standard', x.side, x.line, 'exact', d.estimator, 1.0, x.hp, d.actual
  FROM nba_market.derived_backsim d CROSS JOIN LATERAL (VALUES ('Over', d.over_line, d.hp_over), ('Under', d.under_line, d.hp_under)) x(side, line, hp)
  WHERE d.game_date BETWEEN p_from AND p_to AND x.line IS NOT NULL
  UNION ALL
  SELECT a.season, a.game_date, a.player, a.player_id, a.prop, a.kind, 'Over', a.line, 'policy-conservative', a.prop || '-alt-rule', a.factor, a.hp, a.actual
  FROM nba_market.derived_alt_backsim a WHERE a.game_date BETWEEN p_from AND p_to
)
SELECT s.season, s.game_date, pg.event_id, pg.home_team, pg.away_team, gl.team_id, s.player, s.player_id, s.prop, s.kind, s.side, s.line,
       'simulated', s.price_source, s.method, s.factor, round(3 * s.factor, 4), s.hp, s.actual,
       CASE WHEN ph.phase IS NULL THEN NULL WHEN s.actual IS NULL THEN 'void' WHEN s.actual = s.line THEN 'push'
            WHEN (s.side = 'Over') = (s.actual > s.line) THEN 'hit' ELSE 'miss' END,
       CASE WHEN ph.phase IS NOT NULL AND s.actual IS NOT NULL AND s.actual <> s.line THEN (s.side = 'Over') = (s.actual > s.line) END,
       coalesce(ph.phase, 'no-boxscore'), NULL
FROM sim s
LEFT JOIN ph ON ph.game_date = s.game_date
LEFT JOIN nba_market.player_game_map pg ON pg.game_date = s.game_date AND pg.player = s.player
LEFT JOIN gl ON gl.k = s.player_id AND gl.game_date = s.game_date
WHERE s.line IS NOT NULL
ON CONFLICT DO NOTHING;

SELECT count(*) FROM nba_market.prop_universe WHERE game_date BETWEEN p_from AND p_to;
$function$;

CREATE OR REPLACE FUNCTION nba_market.finalize_prop_universe(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- VERIFIER (2026-09-21): build_prop_universe now sets phase / flags / no-box-score at insert. This re-derives them and rewrites
-- ONLY rows that disagree (normally none) - returns how many rows it had to correct.
WITH d AS (SELECT game_date, CASE mode() WITHIN GROUP (ORDER BY left(ltrim(game_id::text, '0'), 1))
                               WHEN '2' THEN 'regular' WHEN '4' THEN 'playoffs' WHEN '5' THEN 'play-in' WHEN '1' THEN 'preseason' WHEN '3' THEN 'all-star' ELSE 'other' END AS phase
           FROM nba_stats.player_game_log WHERE game_date BETWEEN p_from AND p_to GROUP BY game_date),
fix_phase AS (
  UPDATE nba_market.prop_universe u SET phase = coalesce(d.phase, 'no-boxscore'),
         result = CASE WHEN d.phase IS NULL THEN NULL ELSE u.result END, hit = CASE WHEN d.phase IS NULL THEN NULL ELSE u.hit END
  FROM (SELECT DISTINCT game_date FROM nba_market.prop_universe WHERE game_date BETWEEN p_from AND p_to) n LEFT JOIN d USING (game_date)
  WHERE u.game_date = n.game_date AND u.phase IS DISTINCT FROM coalesce(d.phase, 'no-boxscore')
  RETURNING 1
),
fix_flag AS (
  UPDATE nba_market.prop_universe SET flag = CASE WHEN line_source = 'real' AND kind = 'demon' AND factor <= 1 THEN 'demon_priced_below_standard'
                                                  WHEN line_source = 'real' AND ((kind = 'standard' AND factor <> 1) OR (kind = 'goblin' AND factor >= 1)) THEN 'kind_price_mismatch' END
  WHERE game_date BETWEEN p_from AND p_to
    AND flag IS DISTINCT FROM (CASE WHEN line_source = 'real' AND kind = 'demon' AND factor <= 1 THEN 'demon_priced_below_standard'
                                    WHEN line_source = 'real' AND ((kind = 'standard' AND factor <> 1) OR (kind = 'goblin' AND factor >= 1)) THEN 'kind_price_mismatch' END)
  RETURNING 1
)
SELECT (SELECT count(*) FROM fix_phase) + (SELECT count(*) FROM fix_flag);
$function$;

CREATE OR REPLACE FUNCTION nba_market.pp_flex_standard_payout(p_legs integer, p_hits integer, p_original boolean)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
-- All-standard Flex payout for p_legs live legs with p_hits hits (verified schedules, pp_slip_rules flex_all_standard,
-- flex_2pick_base, reversion_values). p_original = true for an untouched slip; false once voids reduced it: a Flex reduced
-- to 2 legs pays 3x Power-style (not the 2-pick Flex 2 / 0.5), reduced to 1 leg pays 1.5x.
SELECT CASE
  WHEN p_legs <= 0 THEN 1.0
  WHEN p_legs = 1 THEN CASE WHEN p_hits = 1 THEN 1.5 ELSE 0 END
  WHEN p_legs = 2 AND p_original THEN CASE p_hits WHEN 2 THEN 2.0 WHEN 1 THEN 0.5 ELSE 0 END
  WHEN p_legs = 2 THEN CASE WHEN p_hits = 2 THEN 3.0 ELSE 0 END
  WHEN p_legs = 3 THEN CASE p_hits WHEN 3 THEN 3.0 WHEN 2 THEN 1.0 ELSE 0 END
  WHEN p_legs = 4 THEN CASE p_hits WHEN 4 THEN 6.0 WHEN 3 THEN 1.5 ELSE 0 END
  WHEN p_legs = 5 THEN CASE p_hits WHEN 5 THEN 10.0 WHEN 4 THEN 2.0 WHEN 3 THEN 0.4 ELSE 0 END
  WHEN p_legs = 6 THEN CASE p_hits WHEN 6 THEN 25.0 WHEN 5 THEN 2.0 WHEN 4 THEN 0.4 ELSE 0 END
END::numeric
$function$;

CREATE OR REPLACE FUNCTION nba_market.pp_norm_cdf(x double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT 0.5 * (1 + sign(x) * (1 - ((((1.061405429*t - 1.453152027)*t + 1.421413741)*t - 0.284496736)*t + 0.254829592)*t * exp(-(x*x)/2)))
  FROM (SELECT 1.0 / (1.0 + 0.3275911 * abs(x) / sqrt(2.0)) AS t) s
$function$;

CREATE OR REPLACE FUNCTION nba_market.pp_norm_inv(p double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
-- Inverse standard normal CDF (Acklam's rational approximation, relative error ~1.15e-9). Used to run the pricing formula
-- backwards: a priced alternate -> the center PrizePicks implies for it (2026-09-21).
DECLARE q double precision; r double precision; plow constant double precision := 0.02425;
BEGIN
  IF p IS NULL OR p <= 0 OR p >= 1 THEN RETURN NULL; END IF;
  IF p < plow THEN
    q := sqrt(-2 * ln(p));
    RETURN (((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838e+00) * q - 2.549732539343734e+00) * q
             + 4.374664141464968e+00) * q + 2.938163982698783e+00)
         / ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996e+00) * q + 3.754408661907416e+00) * q + 1);
  ELSIF p <= 1 - plow THEN
    q := p - 0.5; r := q * q;
    RETURN (((((-3.969683028665376e+01 * r + 2.209460984245205e+02) * r - 2.759285104469687e+02) * r + 1.383577518672690e+02) * r
             - 3.066479806614716e+01) * r + 2.506628277459239e+00) * q
         / (((((-5.447609879822406e+01 * r + 1.615858368580409e+02) * r - 1.556989798598866e+02) * r + 6.680131188771972e+01) * r
             - 1.328068155288572e+01) * r + 1);
  ELSE
    q := sqrt(-2 * ln(1 - p));
    RETURN -(((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838e+00) * q - 2.549732539343734e+00) * q
              + 4.374664141464968e+00) * q + 2.938163982698783e+00)
          / ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996e+00) * q + 3.754408661907416e+00) * q + 1);
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.pp_power_after_voids(p_factors numeric[], p_live integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
-- Conservative Power payout when every live leg hits, after voids/pushes left p_live of the original legs. PrizePicks shows
-- reversions as the payout of the p_live LOWEST-factor legs of the original slip (pp_slip_rules reversion_values), which is
-- also <= settlement on the actual survivors - so this never overpays. All-standard reduces to the exact base for p_live legs.
-- One survivor: 1.5 x its factor, rounded DOWN to the 0.1 grid (PrizePicks pays ~6% more on average). None left: refund.
SELECT CASE
  WHEN p_live <= 0 THEN 1.0
  WHEN p_live = 1 THEN floor(1.5 * (SELECT min(f) FROM unnest(p_factors) f) * 10) / 10.0
  ELSE (SELECT payout FROM nba_market.pp_slip_power_conservative(
          (SELECT array_agg(f ORDER BY f) FROM (SELECT f FROM unnest(p_factors) f ORDER BY f LIMIT p_live) z)))
END
$function$;

CREATE OR REPLACE FUNCTION nba_market.pp_price_version(p_version text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- Prices every Price ID not yet priced under p_version. The ONE copy of the per-leg formula; everything is read
-- from the version's params_json. Power-normal family: lambda = 1 is v1's normal, lambda = 0.5 is v2's square root.
-- params: c_by_family, family_by_market, lambda (default 1), goblin_floor_factor, implied_p_floor,
--         calibrated_min_implied_p (evidence edge), price_beyond_edge (default false),
--         less_favorite_floor_factor (default = goblin_floor_factor),
--         haircut_favourite / haircut_longshot / haircut_extrapolated (default 0 - CONSERVATIVE versions, 2026-09-21:
--         model-priced factor x (1 - haircut); favourite = implied p > 0.5, longshot <= 0.5, extrapolated wins; rule-
--         priced standards never cut).
-- SIDE-AWARE FLOORS (2026-09-21): the goblin floor (2.08x) is MORE-only; a favourite on LESS floors at 1.7x.
DECLARE n integer;
BEGIN
  INSERT INTO nba_market.pp_price (price_id, model_version, implied_p, factor, source, reason)
  SELECT price_id, p_version, implied_p,
         CASE WHEN factor_base IS NULL THEN NULL
              ELSE factor_base * (1 - CASE WHEN source <> 'model' THEN 0
                                           WHEN reason = 'extrapolated_beyond_mined_range' THEN h_ext
                                           WHEN implied_p > 0.5 THEN h_fav ELSE h_long END) END,
         source, reason
  FROM (
    SELECT price_id, implied_p, h_fav, h_long, h_ext,
      CASE WHEN implied_p IS NULL THEN NULL
           WHEN kind = 'standard' THEN 1
           WHEN implied_p < edge AND NOT beyond THEN NULL
           WHEN implied_p > 0.5 AND side = 'Under' THEN GREATEST(0.5 / implied_p, less_floor_f)
           WHEN implied_p > 0.5 THEN GREATEST(0.5 / implied_p, floor_f)
           ELSE 0.5 / implied_p END AS factor_base,
      CASE WHEN implied_p IS NULL THEN 'unpriced'
           WHEN kind = 'standard' THEN 'rule'
           WHEN implied_p < edge AND NOT beyond THEN 'unpriced'
           ELSE 'model' END AS source,
      CASE WHEN implied_p IS NOT NULL AND kind <> 'standard' AND implied_p < edge AND NOT beyond THEN 'outside_calibration'
           WHEN implied_p IS NOT NULL AND kind <> 'standard' AND implied_p < edge AND beyond THEN 'extrapolated_beyond_mined_range'
           ELSE reason END AS reason
    FROM (
      SELECT price_id, kind, side, floor_f, less_floor_f, edge, beyond, h_fav, h_long, h_ext,
        CASE WHEN kind = 'standard' THEN 0.5
             WHEN anchor_line IS NULL OR c IS NULL OR anchor_line <= 0 OR line <= 0 THEN NULL
             ELSE GREATEST(pmin, CASE WHEN side = 'Over' THEN 1 - nba_market.pp_norm_cdf(z) ELSE nba_market.pp_norm_cdf(z) END) END AS implied_p,
        CASE WHEN kind = 'standard' AND kind_position_mismatch THEN 'standard_label_off_center'
             WHEN kind = 'standard' THEN NULL
             WHEN anchor_line IS NULL THEN 'no_center'
             WHEN c IS NULL THEN 'no_spread_model'
             WHEN anchor_line <= 0 OR line <= 0 THEN 'invalid_center' END AS reason
      FROM (
        SELECT k.price_id, k.kind, k.side, k.anchor_line, k.line, k.kind_position_mismatch,
          (m.params_json->'c_by_family'->>(m.params_json->'family_by_market'->>k.base_market))::float AS c,
          (m.params_json->>'goblin_floor_factor')::float AS floor_f,
          COALESCE((m.params_json->>'less_favorite_floor_factor')::float, (m.params_json->>'goblin_floor_factor')::float) AS less_floor_f,
          (m.params_json->>'implied_p_floor')::float AS pmin,
          (m.params_json->>'calibrated_min_implied_p')::float AS edge,
          COALESCE((m.params_json->>'price_beyond_edge')::boolean, false) AS beyond,
          COALESCE((m.params_json->>'haircut_favourite')::float, 0) AS h_fav,
          COALESCE((m.params_json->>'haircut_longshot')::float, 0) AS h_long,
          COALESCE((m.params_json->>'haircut_extrapolated')::float, 0) AS h_ext,
          CASE WHEN k.anchor_line > 0 AND k.line > 0 THEN
            (power(k.line::float, COALESCE((m.params_json->>'lambda')::float, 1)) - power(k.anchor_line::float, COALESCE((m.params_json->>'lambda')::float, 1)))
            / ( COALESCE((m.params_json->>'lambda')::float, 1)
                * power(k.anchor_line::float, COALESCE((m.params_json->>'lambda')::float, 1) - 1)
                * (m.params_json->'c_by_family'->>(m.params_json->'family_by_market'->>k.base_market))::float
                * sqrt(k.anchor_line::float) )
          END AS z
        FROM nba_market.pp_price_key k
        JOIN nba_config.pp_pricing_model m ON m.model_version = p_version
        WHERE NOT EXISTS (SELECT 1 FROM nba_market.pp_price x WHERE x.price_id = k.price_id AND x.model_version = p_version)
      ) a
    ) b
  ) c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.pp_refresh_prices(p_since date DEFAULT (CURRENT_DATE - 3))
 RETURNS TABLE(rescued_a integer, rescued_b integer, new_keys integer, new_prices integer)
 LANGUAGE plpgsql
AS $function$
-- Keeps pricing current as new PrizePicks legs land in board_tiers_v2 (live season). Idempotent: re-running adds nothing.
-- 1) rescue centers for no-center legs dated >= p_since (tier A same-day snapshot, tier B sportsbook consensus; flag-checked)
-- 2) create missing Price IDs  3) price every missing key under EVERY registered model version (pp_price_version)
DECLARE ra integer; rb integer; nk integer := 0; nk2 integer; np integer := 0; v record;
BEGIN
  INSERT INTO nba_market.pp_anchor_rescue
    (game_date, snapshot_label, player, base_market, side, line, rescued_anchor, rescued_kind, rescue_tier, price_flag, flag_agrees, evidence)
  WITH std_day AS (
    SELECT game_date, player, market_key AS base_market, min(line) AS std_line, count(DISTINCT line) AS n_std
    FROM nba_market.board_snapshots
    WHERE bookmaker = 'prizepicks' AND market_key NOT LIKE '%alternate' AND side = 'Over' AND game_date >= p_since
    GROUP BY 1, 2, 3
  ), cand AS (
    SELECT t.game_date, t.snapshot_label, t.player, t.base_market, t.side, t.line, d.std_line,
           CASE WHEN t.line < d.std_line THEN 'goblin' WHEN t.line > d.std_line THEN 'demon' ELSE 'standard' END AS pos_kind
    FROM nba_market.board_tiers_v2 t
    JOIN std_day d ON d.game_date = t.game_date AND d.player = t.player AND d.base_market = t.base_market AND d.n_std = 1
    WHERE t.bookmaker = 'prizepicks' AND t.anchor_type = 'none' AND t.game_date >= p_since
  )
  SELECT c.game_date, c.snapshot_label, c.player, c.base_market, c.side, c.line, c.std_line, c.pos_kind, 'same_day_snapshot', s.price,
         CASE WHEN s.price = 100 THEN c.pos_kind = 'demon' WHEN s.price = -137 THEN c.pos_kind = 'goblin' END,
         'PrizePicks standard seen in another snapshot the same day; one value all day (refresh)'
  FROM cand c
  LEFT JOIN nba_market.board_snapshots s
    ON s.bookmaker = 'prizepicks' AND s.game_date = c.game_date AND s.snapshot_label = c.snapshot_label
   AND s.player = c.player AND s.market_key = c.base_market || '_alternate' AND s.line = c.line AND s.side = 'Over'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS ra = ROW_COUNT;

  INSERT INTO nba_market.pp_anchor_rescue
    (game_date, snapshot_label, player, base_market, side, line, rescued_anchor, rescued_kind, rescue_tier, price_flag, flag_agrees, evidence)
  WITH pp_any AS (
    SELECT DISTINCT game_date, player, market_key AS m FROM nba_market.board_snapshots
    WHERE bookmaker = 'prizepicks' AND market_key NOT LIKE '%alternate' AND side = 'Over' AND game_date >= p_since
  ), book AS (
    SELECT game_date, player, market_key AS m, bookmaker, percentile_cont(0.5) WITHIN GROUP (ORDER BY line) AS bl
    FROM nba_market.board_snapshots
    WHERE bookmaker NOT IN ('prizepicks','underdog','sleeper','pick6','betr_us_dfs') AND side = 'Over' AND game_date >= p_since
      AND market_key IN ('player_points','player_rebounds','player_assists','player_threes','player_points_rebounds',
                         'player_points_assists','player_rebounds_assists','player_points_rebounds_assists')
    GROUP BY 1, 2, 3, 4
  ), cons AS (
    SELECT game_date, player, m, percentile_cont(0.5) WITHIN GROUP (ORDER BY bl) AS consensus, count(*) AS books FROM book GROUP BY 1, 2, 3
  ), cand AS (
    SELECT t.game_date, t.snapshot_label, t.player, t.base_market, t.side, t.line, c.consensus, c.books,
           CASE WHEN t.line < c.consensus THEN 'goblin' WHEN t.line > c.consensus THEN 'demon' ELSE 'standard' END AS pos_kind
    FROM nba_market.board_tiers_v2 t
    JOIN cons c ON c.game_date = t.game_date AND c.player = t.player AND c.m = t.base_market
    LEFT JOIN pp_any a ON a.game_date = t.game_date AND a.player = t.player AND a.m = t.base_market
    WHERE t.bookmaker = 'prizepicks' AND t.anchor_type = 'none' AND a.player IS NULL AND t.game_date >= p_since
  )
  SELECT c.game_date, c.snapshot_label, c.player, c.base_market, c.side, c.line, c.consensus, c.pos_kind, 'sportsbook_consensus', s.price,
         CASE WHEN s.price = 100 THEN c.pos_kind = 'demon' WHEN s.price = -137 THEN c.pos_kind = 'goblin' END,
         'Median of ' || c.books || ' sportsbooks'' lines; PrizePicks posted no standard that day (refresh)'
  FROM cand c
  LEFT JOIN nba_market.board_snapshots s
    ON s.bookmaker = 'prizepicks' AND s.game_date = c.game_date AND s.snapshot_label = c.snapshot_label
   AND s.player = c.player AND s.market_key = c.base_market || '_alternate' AND s.line = c.line AND s.side = 'Over'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS rb = ROW_COUNT;

  INSERT INTO nba_market.pp_price_key (base_market, anchor_line, line, side, kind, kind_position_mismatch, legs)
  SELECT base_market, anchor_line, line, side, kind,
         CASE WHEN anchor_line IS NULL THEN false
              WHEN kind = 'standard' THEN line <> anchor_line
              WHEN kind = 'goblin' THEN (side = 'Over' AND line >= anchor_line) OR (side = 'Under' AND line <= anchor_line)
              WHEN kind = 'demon'  THEN (side = 'Over' AND line <= anchor_line) OR (side = 'Under' AND line >= anchor_line)
              ELSE false END,
         count(*)
  FROM nba_market.board_tiers_v2
  WHERE bookmaker = 'prizepicks' AND game_date >= p_since
  GROUP BY base_market, anchor_line, line, side, kind
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS nk = ROW_COUNT;

  INSERT INTO nba_market.pp_price_key (base_market, anchor_line, line, side, kind, kind_position_mismatch, legs)
  SELECT base_market, rescued_anchor, line, side, rescued_kind, false, count(*)
  FROM nba_market.pp_anchor_rescue
  WHERE flag_agrees AND rescued_kind IN ('goblin','demon') AND game_date >= p_since
  GROUP BY base_market, rescued_anchor, line, side, rescued_kind
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS nk2 = ROW_COUNT;
  nk := nk + nk2;

  FOR v IN SELECT model_version FROM nba_config.pp_pricing_model LOOP
    np := np + nba_market.pp_price_version(v.model_version);
  END LOOP;

  RETURN QUERY SELECT ra, rb, nk, np;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.pp_round_step(x numeric, step_lo numeric, step_hi numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN x IS NULL THEN NULL
              WHEN x < 3 THEN round(x / step_lo) * step_lo
              ELSE round(x / step_hi) * step_hi END
$function$;

CREATE OR REPLACE FUNCTION nba_market.pp_slip_flex2(p1 numeric, p2 numeric, power2 numeric)
 RETURNS TABLE(flex_full numeric, flex_partial numeric, method text, confidence text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  cuts jsonb; cons jsonb; targets jsonb; grid jsonb;
  i int; tier_key text; tier numeric; target numeric;
  pp2 numeric; pp1 numeric; f2 numeric; best numeric; g jsonb;
BEGIN
  IF p1 IS NULL OR p2 IS NULL OR power2 IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, 'missing input - never guessed'::text, 'none'::text; RETURN;
  END IF;
  SELECT rule_json->'cuts_on_2pick_power', rule_json->'consolation' INTO cuts, cons
    FROM nba_config.pp_slip_rules WHERE rule_key = 'flex_tiers';
  SELECT rule_json INTO targets FROM nba_config.pp_slip_rules WHERE rule_key = 'flex_ev_targets';
  SELECT rule_json->'grid' INTO grid FROM nba_config.pp_slip_rules WHERE rule_key = 'rounding_flex';

  tier_key := cons->>0;                                   -- consolation tier chosen by risk (2-pick Power)
  FOR i IN 0 .. jsonb_array_length(cuts) - 1 LOOP
    IF power2 >= (cuts->>i)::numeric THEN tier_key := cons->>(i + 1); END IF;
  END LOOP;
  tier   := tier_key::numeric;
  target := (targets->>tier_key)::numeric;
  IF target IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, tier, 'no EV target for this tier'::text, 'none'::text; RETURN;
  END IF;

  pp2 := p1 * p2;                                         -- both hit
  pp1 := p1 * (1 - p2) + p2 * (1 - p1);                   -- exactly one
  f2  := (target - tier * pp1) / pp2;                     -- full payout that puts the slip on the EV target

  best := NULL;                                           -- snap to PrizePicks' Flex grid
  FOR g IN SELECT * FROM jsonb_array_elements(grid) LOOP
    IF best IS NULL OR abs(g::text::numeric - f2) < abs(best - f2) THEN best := g::text::numeric; END IF;
  END LOOP;

  RETURN QUERY SELECT best, tier,
    '2-pick Flex: consolation tier by risk, full payout solved from the EV target, snapped to the Flex grid'::text,
    CASE WHEN targets->'reliable_tiers' ? tier_key THEN 'verified' ELSE 'partial' END;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.pp_slip_power(factors numeric[])
 RETURNS TABLE(payout numeric, raw_product numeric, method text, confidence text)
 LANGUAGE plpgsql
 STABLE
AS $function$
-- PrizePicks Power payout for a 2-6 pick slip from its legs' factors (standard = 1). Rules live in nba_config.pp_slip_rules.
-- 2026-09-21: slips with alternates, 3-6 picks:  payout = b_n * M_eff * haircut
--   M = prod(f)^a_n (mixed_power_one_alt: b_n, a_n);  M_eff = M below the knee, knee*(M/knee)^exponent above it;
--   haircut = 1.0 for ONE alternate (verified law), mixed_power_multi_alt.haircut for 2+ (partial).
DECLARE
  n int := cardinality(factors);
  prod numeric := 1;
  f numeric;
  n_alt int := 0;
  knee numeric; expo numeric; step_lo numeric; step_hi numeric;
  base numeric; raw numeric; comp numeric; b numeric; a numeric; hc numeric; mk numeric; mx numeric; mm numeric;
BEGIN
  IF n IS NULL OR n < 2 OR n > 6 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, 'unsupported slip size (2-6 picks)'::text, 'none'::text; RETURN;
  END IF;
  FOREACH f IN ARRAY factors LOOP
    IF f IS NULL THEN
      RETURN QUERY SELECT NULL::numeric, NULL::numeric, 'a leg is unpriced - never guessed'::text, 'none'::text; RETURN;
    END IF;
    prod := prod * f;
    IF f <> 1 THEN n_alt := n_alt + 1; END IF;
  END LOOP;
  SELECT (rule_json->>'knee')::numeric, (rule_json->>'exponent')::numeric INTO knee, expo
    FROM nba_config.pp_slip_rules WHERE rule_key = 'compression';
  SELECT (rule_json->>'step_below_3')::numeric, (rule_json->>'step_at_or_above_3')::numeric INTO step_lo, step_hi
    FROM nba_config.pp_slip_rules WHERE rule_key = 'rounding_power';

  IF n = 2 THEN
    SELECT (rule_json->>'2')::numeric INTO base FROM nba_config.pp_slip_rules WHERE rule_key = 'base_power';
    raw  := base * prod;
    comp := CASE WHEN raw <= knee THEN raw ELSE knee * power(raw / knee, expo) END;
    RETURN QUERY SELECT nba_market.pp_round_step(comp, step_lo, step_hi), raw,
      '2-pick: base x leg factors, compressed above the knee, rounded'::text, 'verified'::text;
    RETURN;
  END IF;

  IF n_alt = 0 THEN
    SELECT (rule_json->>n::text)::numeric INTO base FROM nba_config.pp_slip_rules WHERE rule_key = 'base_power';
    RETURN QUERY SELECT base, base, 'all-standard base'::text, CASE WHEN base IS NULL THEN 'none' ELSE 'verified' END::text;
    RETURN;
  END IF;

  SELECT (rule_json->n::text->>'b')::numeric, (rule_json->n::text->>'a')::numeric INTO b, a
    FROM nba_config.pp_slip_rules WHERE rule_key = 'mixed_power_one_alt';
  SELECT (rule_json->>'haircut')::numeric, (rule_json->>'compression_knee_multiplier')::numeric, (rule_json->>'compression_exponent')::numeric
    INTO hc, mk, mx FROM nba_config.pp_slip_rules WHERE rule_key = 'mixed_power_multi_alt';
  mm  := power(prod, a);
  IF mk IS NOT NULL AND mm > mk THEN mm := mk * power(mm / mk, coalesce(mx, 0.857)); END IF;
  raw := b * mm * CASE WHEN n_alt >= 2 THEN coalesce(hc, 1.0) ELSE 1.0 END;
  RETURN QUERY SELECT nba_market.pp_round_step(raw, step_lo, step_hi), b * power(prod, a),
    CASE WHEN n_alt = 1 THEN 'one alternate: b x f^a (verified law)'
         ELSE n_alt || ' alternates: b x compress(prod^a) x haircut ' || coalesce(hc, 1.0) END::text,
    CASE WHEN n_alt = 1 THEN 'verified' ELSE 'partial' END::text;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.pp_slip_power_conservative(factors numeric[])
 RETURNS TABLE(payout numeric, best_estimate numeric, haircut numeric, method text, confidence text)
 LANGUAGE plpgsql
 STABLE
AS $function$
-- CONSERVATIVE slip payout (owner 2026-09-21: aim for less earnings on anything derived). Takes pp_slip_power's best
-- estimate, applies nba_config.pp_conservative_policy.slip_haircut by slip type, and rounds DOWN to the PrizePicks grid
-- (0.1 below 3x, 0.25 at or above). All-standard slips are exact and untouched. Feed it CONSERVATIVE leg factors (the
-- current pricing version) - the slip haircut covers the slip RULE's own uncertainty on top.
DECLARE
  n int := cardinality(factors);
  n_alt int := 0;
  f numeric;
  pol jsonb;
  h numeric;
  kind text;
  r record;
  x numeric;
BEGIN
  SELECT * INTO r FROM nba_market.pp_slip_power(factors);
  IF r.payout IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric, r.method, r.confidence; RETURN;
  END IF;
  FOREACH f IN ARRAY factors LOOP IF f <> 1 THEN n_alt := n_alt + 1; END IF; END LOOP;
  SELECT value_json INTO pol FROM nba_config.pp_conservative_policy WHERE policy_key = 'slip_haircut';
  kind := CASE WHEN n_alt = 0 THEN 'all_standard' WHEN n = 2 THEN 'two_pick_alternates'
               WHEN n_alt = 1 THEN 'one_alternate' ELSE 'multi_alternate' END;
  h := coalesce((pol->>kind)::numeric, 0);
  IF h = 0 THEN
    RETURN QUERY SELECT r.payout, r.payout, 0::numeric, r.method, r.confidence; RETURN;
  END IF;
  x := r.payout * (1 - h);
  x := CASE WHEN x < 3 THEN floor(x / 0.1) * 0.1 ELSE floor(x / 0.25) * 0.25 END;
  RETURN QUERY SELECT round(x, 2), r.payout, h, (r.method || ' | conservative: -' || (h * 100)::text || '% ' || kind || ', rounded down')::text, r.confidence;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.rebuild_prop_universe(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
-- One call per season: build every leg, then label phase and flags. Upstream order when anything changes:
-- refresh_leg_price_cons -> build_fs_backsim -> build_derived_backsim -> build_derived_alt_backsim -> rebuild_prop_universe.
SELECT nba_market.build_prop_universe(p_from, p_to);
SELECT nba_market.finalize_prop_universe(p_from, p_to);
SELECT count(*) FROM nba_market.prop_universe WHERE game_date BETWEEN p_from AND p_to;
$function$;

CREATE OR REPLACE FUNCTION nba_market.refresh_board_rung_keys(d1 date, d2 date)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE n bigint;
BEGIN
  DELETE FROM nba_market.board_rung_keys WHERE game_date BETWEEN d1 AND d2;
  INSERT INTO nba_market.board_rung_keys (game_date, player_id, prop, period, line, src)
  WITH real AS (
    SELECT b.game_date, m.player_id::text AS player_id, v.prop, v.period, b.line
    FROM nba_market.board_snapshots b
    JOIN (VALUES
      ('player_points','points','FULL'),('player_rebounds','rebounds','FULL'),('player_assists','assists','FULL'),
      ('player_threes','threes_made','FULL'),('player_blocks','blocks','FULL'),('player_steals','steals','FULL'),
      ('player_turnovers','turnovers','FULL'),('player_points_rebounds_assists','pra','FULL'),
      ('player_points_rebounds','pts_reb','FULL'),('player_points_assists','pts_ast','FULL'),
      ('player_rebounds_assists','reb_ast','FULL'),('player_blocks_steals','stocks','FULL'),
      ('player_double_double','double_double','FULL'),('player_fantasy_points','fantasy_score','FULL'),
      ('player_ftm','ftm','FULL'),('player_fga','fga','FULL'),('player_fgm','fgm','FULL'),('player_fta','fta','FULL'),
      ('player_threes_attempted','fg3a','FULL'),('player_oreb','oreb','FULL'),('player_dreb','dreb','FULL'),
      ('player_personal_fouls','personal_fouls','FULL'),
      ('player_points_q1','points','Q1'),('player_rebounds_q1','rebounds','Q1'),('player_assists_q1','assists','Q1'),
      ('player_threes_q1','threes_made','Q1'),
      ('player_points_h1','points','H1'),('player_rebounds_h1','rebounds','H1'),('player_assists_h1','assists','H1'),
      ('player_threes_h1','threes_made','H1'),
      ('player_points_h2','points','H2'),('player_rebounds_h2','rebounds','H2'),('player_assists_h2','assists','H2'),
      ('player_threes_h2','threes_made','H2'),
      ('player_points_q4','points','Q4'),('player_rebounds_q4','rebounds','Q4'),('player_assists_q4','assists','Q4'),
      ('player_threes_q4','threes_made','Q4')) AS v(mk, prop, period)
      ON replace(replace(b.market_key, '_alternate', ''), '_promo', '') = v.mk
    JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(b.player)
    WHERE b.line IS NOT NULL AND b.game_date BETWEEN d1 AND d2
  )
  SELECT game_date, player_id, prop, period, line, min(src)
  FROM (
    SELECT game_date, player_id, prop, period, line, 'real' AS src FROM real
    UNION ALL
    SELECT u.game_date, u.player_id::text, u.prop, 'FULL', u.line, 'derived'
    FROM nba_market.prop_universe u
    WHERE u.line_source = 'simulated' AND u.line IS NOT NULL AND u.game_date BETWEEN d1 AND d2
    UNION ALL
    SELECT r.game_date, r.player_id, r.prop, 'FULL', r.line + o.off, 'wn_neighbor'
    FROM real r CROSS JOIN (VALUES (0.5::numeric), (-0.5::numeric)) AS o(off)
    WHERE r.period = 'FULL' AND r.line = floor(r.line) AND r.line + o.off >= 0
  ) k
  GROUP BY game_date, player_id, prop, period, line;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION nba_market.refresh_leg_price_cons(p_from date, p_to date)
 RETURNS bigint
 LANGUAGE sql
AS $function$
DELETE FROM nba_market.pp_leg_price_cons WHERE game_date BETWEEN p_from AND p_to;
WITH ins AS (
  INSERT INTO nba_market.pp_leg_price_cons (game_date, player, base_market, side, line, kind, factor, implied_p, model_version, snapshot_label)
  SELECT DISTINCT ON (game_date, player, base_market, side, line, coalesce(kind, 'unknown'))
         game_date, player, base_market, side, line, coalesce(kind, 'unknown'), factor, implied_p, model_version, snapshot_label
  FROM nba_market.pp_leg_price WHERE game_date BETWEEN p_from AND p_to AND factor IS NOT NULL
  ORDER BY game_date, player, base_market, side, line, coalesce(kind, 'unknown'), (snapshot_label = 'window') DESC, snapshot_label DESC, factor ASC
  RETURNING 1
)
SELECT count(*) FROM ins;
$function$;

CREATE OR REPLACE FUNCTION nba_ref.norm_name(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  -- ONE NORMALISER (2026-09-25). Mirrors nba/nba_names.py::norm_name exactly: strip accents, lowercase,
  -- drop the suffix words jr/sr/ii/iii/iv/v, keep letters only. Every SQL-side join of a board name to a
  -- player_id MUST use this, for the reason nba_names.py states: a second normaliser drifts silently.
  -- The drift it replaces: inline lower(regexp_replace(x,'[^A-Za-z]','','g')) KEPT the suffix, so
  -- "Jaren Jackson Jr" became jarenjacksonjr while the map held jarenjackson - 47 suffixed players
  -- were invisible to scoring, final_hp, the availability delta and the prune, in both seasons.
  SELECT regexp_replace(
           regexp_replace(lower(public.unaccent(coalesce(t, ''))), '\m(jr|sr|ii|iii|iv|v)\M', '', 'g'),
           '[^a-z]', '', 'g')
$function$;

CREATE OR REPLACE FUNCTION nba_score.availability_p_plays(p_status text, p_role_tier text DEFAULT NULL::text, p_reason_class text DEFAULT NULL::text, p_games_played_30 integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
-- DERIVED P(plays) FALLBACK for the availability family (A1 own status, N1 P(plays|Questionable)).
-- Use when the injury report is missing or stale, and to resolve a Questionable at the cutoff.
-- Fit on 2024-25 ONLY; validated out-of-sample on 2025-26: Brier 0.0441 vs 0.0498 for a status-only
-- rate (11.3% better), and 0.2398 vs 0.2505 on Questionables alone (4.3% better), mean prediction
-- 0.160 against an actual 0.166. A richer key (adding the player's rest bucket, 1,493 cells) was built
-- and REJECTED - it lost out of sample on both segments. Granularity has a limit; the test decides.
-- Falls back down the hierarchy whenever a cell is unseen, so it always returns a number.
  SELECT coalesce(
    (SELECT p_plays FROM nba_score.availability_prior WHERE level = 'cell' AND status = p_status
       AND role_tier = p_role_tier AND reason_class = p_reason_class
       AND avail_bucket = CASE WHEN coalesce(p_games_played_30, 0) = 0 THEN '0' WHEN p_games_played_30 <= 4 THEN '1-4'
                               WHEN p_games_played_30 <= 8 THEN '5-8' ELSE '9+' END),
    (SELECT p_plays FROM nba_score.availability_prior WHERE level = 'status_role' AND status = p_status AND role_tier = p_role_tier),
    (SELECT p_plays FROM nba_score.availability_prior WHERE level = 'status' AND status = p_status),
    (SELECT p_plays FROM nba_score.availability_prior WHERE level = 'global'));
$function$;

CREATE OR REPLACE FUNCTION nba_score.calibrated_p(p_prop text, p_kind text, p_side text, p_role text, p_model numeric, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  -- COMPASS 124/134 (2026-10-06): recalibration map v2. History: the OTHER season's fit (out-of-sample); live: POOLED.
  -- (prop, kind) cells whose map did not improve out-of-sample in BOTH directions (use_map = false) serve the raw probability.
  WITH fs AS (SELECT CASE WHEN p_date BETWEEN '2024-07-01' AND '2025-06-30' THEN '2025-26'
                          WHEN p_date BETWEEN '2025-07-01' AND '2026-06-30' THEN '2024-25' ELSE 'POOLED' END AS fit_set),
       b AS (SELECT width_bucket(p_model, ARRAY[0.10,0.20,0.30,0.40,0.45,0.50,0.55,0.60,0.65,0.70,0.75,0.85,0.95]::numeric[]) AS bkt)
  SELECT coalesce(
    (SELECT CASE WHEN m.use_map THEN m.calibrated_p ELSE p_model END FROM nba_score.recalibration_map m, fs, b
      WHERE m.fit_set = fs.fit_set AND m.prop = p_prop AND m.kind = p_kind AND m.side = p_side AND m.role_tier = coalesce(p_role,'UNK') AND m.p_bucket = b.bkt),
    (SELECT CASE WHEN bool_and(m.use_map) THEN sum(m.calibrated_p * m.n) / nullif(sum(m.n),0) ELSE p_model END
       FROM nba_score.recalibration_map m, fs, b WHERE m.fit_set = fs.fit_set AND m.prop = p_prop AND m.kind = p_kind AND m.side = p_side AND m.p_bucket = b.bkt),
    p_model)
$function$;

CREATE OR REPLACE FUNCTION nba_score.grade_paper_picks()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- Fills result for logged paper picks from nba_market.board_outcomes (graded once per player/market/line/side, no
-- bookmaker): hit / miss / void (push or DNP). Only ungraded rows are touched. Call from P2 after the board is graded.
-- PROP LIST: nba_score.paper_prop_map() - shared with paper_pick_candidates since 2026-09-23 (T20-16).
DECLARE n integer;
BEGIN
  WITH m AS (SELECT * FROM nba_score.paper_prop_map()),
  todo AS (SELECT p.*, m.market_key FROM nba_score.paper_picks p JOIN m ON m.prop = p.prop WHERE p.result IS NULL),
  o AS (
    SELECT DISTINCT ON (t.strategy, t.game_date, t.player) t.strategy, t.game_date, t.player, t.side, ob.leg_result
    FROM todo t
    JOIN nba_market.board_outcomes ob
      ON ob.game_date = t.game_date AND ob.player = t.player
     AND replace(ob.market_key, '_alternate', '') = t.market_key
     AND ob.line = t.line AND ob.side = t.side
    WHERE ob.leg_result IS NOT NULL
    ORDER BY t.strategy, t.game_date, t.player, ob.snapshot_label DESC
  )
  UPDATE nba_score.paper_picks p
  SET result = CASE WHEN o.leg_result IN ('push','dnp') THEN 'void'
                    WHEN (o.leg_result = 'over_win' AND p.side = 'Over')
                      OR (o.leg_result = 'under_win' AND p.side = 'Under') THEN 'hit' ELSE 'miss' END,
      graded_at = now()
  FROM o
  WHERE o.strategy = p.strategy AND o.game_date = p.game_date AND o.player = p.player AND p.result IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION nba_score.log_paper_picks(p_date date, p_threshold numeric DEFAULT 1.30, p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- Logs the night's paper picks (strategy standards_3pick_v1) with logged_at = now(). FIRST LOG WINS. Slips are packed so
-- every slip spans three different games (nba_score.paper_pick_slips). Call from P3 right after scoring.
-- SNAPSHOT IS PINNED TO 'window' (2026-09-23): passing NULL means "most recently fetched", which on a REPLAY is the
-- post-game 'close' pull - lookahead straight into the live log. 'window' IS the decision moment.
-- 🔴 PAST DATES ARE REFUSED (2026-09-24). A replay used to write picks stamped with TODAY's time: a replay of 2025-11-29
-- logged 39 picks, an earlier one 72 for 2026-04-10. The value of this table is that a pick was recorded BEFORE the game,
-- so a backfilled row is not a weaker record - it is a FALSE one, and it silently inflates any ROI read from the table.
-- Replays score and simulate freely; they do not log. p_force is for a genuine same-day catch-up after an outage only.
DECLARE n integer;
BEGIN
  IF p_date <> (now() AT TIME ZONE 'America/Los_Angeles')::date AND NOT p_force THEN
    RAISE NOTICE 'paper picks NOT logged for % - not today (replay). Pass p_force := true only for a same-day catch-up.', p_date;
    RETURN 0;
  END IF;
  IF EXISTS (SELECT 1 FROM nba_score.paper_picks p WHERE p.strategy = 'standards_3pick_v1' AND p.game_date = p_date) THEN
    RAISE NOTICE 'paper picks for % already logged - first log wins', p_date;
    RETURN 0;
  END IF;
  INSERT INTO nba_score.paper_picks
    (strategy, game_date, player, prop, line, side, model_value, final_hp, pick_rank, slip_no, threshold, snapshot_label, event_id)
  SELECT 'standards_3pick_v1', c.game_date, c.player, c.prop, c.line, c.side, c.model_value, c.final_hp,
         c.pick_rank, c.slip_no, p_threshold, c.snapshot_label, c.event_id
  FROM nba_score.paper_pick_slips(p_date, p_threshold, 'window') c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION nba_score.p_start(p_started_last integer, p_start_rate_10 numeric DEFAULT NULL::numeric, p_avg_min_10 numeric DEFAULT NULL::numeric, p_starters_out integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
-- A5 DERIVED FALLBACK: P(player starts tonight). Use when the lineup is not yet announced, which at
-- P3's cutoff is the normal case - official lineups land ~30 min before tip, long after the decision.
-- Fit on 2024-25 ONLY, validated on 2025-26 (26,543 player-games it never saw): Brier 0.07034 with the
-- starters-out term vs 0.07211 without (2.46% better; 2.91% on bench players, where the mechanism lives)
-- vs 0.0834 for the naive "started last game" rule and 0.2487 for the base rate. Accuracy 91%.
-- THE MECHANISM, measured: a bench player's P(start) runs 3.3% with no regular starters out, 6.5% with
-- one, 9.2% with two and 15.9% with three - five-fold - while an established starter sits at ~90%
-- regardless. That asymmetry is why the term is in a fourth level under started_last, not a global shift.
-- starters_out = teammates listed Out/Doubtful at the cutoff who started >= 50% of their own last 10.
  SELECT coalesce(
    (SELECT p_start FROM nba_score.starter_prior_v2 WHERE level = 'plus_starters_out'
       AND started_last = p_started_last AND rate_bucket = CASE WHEN p_start_rate_10 = 0 THEN '0'
             WHEN p_start_rate_10 < 0.5 THEN 'lt_half' WHEN p_start_rate_10 < 1 THEN 'ge_half' ELSE 'all' END
       AND min_bucket = CASE WHEN p_avg_min_10 IS NULL THEN 'UNKNOWN' WHEN p_avg_min_10 >= 32 THEN 'HIGH'
             WHEN p_avg_min_10 >= 24 THEN 'MID' WHEN p_avg_min_10 >= 15 THEN 'LOW' ELSE 'FRINGE' END
       AND starters_out = least(coalesce(p_starters_out, 0), 3)),
    (SELECT p_start FROM nba_score.starter_prior_v2 WHERE level = 'plus_min'
       AND started_last = p_started_last AND rate_bucket = CASE WHEN p_start_rate_10 = 0 THEN '0'
             WHEN p_start_rate_10 < 0.5 THEN 'lt_half' WHEN p_start_rate_10 < 1 THEN 'ge_half' ELSE 'all' END
       AND min_bucket = CASE WHEN p_avg_min_10 IS NULL THEN 'UNKNOWN' WHEN p_avg_min_10 >= 32 THEN 'HIGH'
             WHEN p_avg_min_10 >= 24 THEN 'MID' WHEN p_avg_min_10 >= 15 THEN 'LOW' ELSE 'FRINGE' END),
    (SELECT p_start FROM nba_score.starter_prior_v2 WHERE level = 'started_last' AND started_last = p_started_last),
    (SELECT p_start FROM nba_score.starter_prior_v2 WHERE level = 'global'));
$function$;

CREATE OR REPLACE FUNCTION nba_score.paper_pick_candidates(p_date date, p_threshold numeric DEFAULT 1.30, p_snapshot text DEFAULT NULL::text)
 RETURNS TABLE(game_date date, player text, prop text, line numeric, side text, model_value numeric, final_hp numeric, pick_rank integer, slip_no integer, snapshot_label text, event_id text)
 LANGUAGE sql
 STABLE
AS $function$
-- Paper-trading selection (standards_3pick_v1), identical for live logging and historical replay: PrizePicks STANDARD lines
-- in ONE snapshot (default: most recently fetched = what is on the board at logging time), model value = 2 x final_hp >=
-- threshold, ONE leg per player (best prop and side), ranked. slip_no here is rank-based; the logged slips come from
-- nba_score.paper_pick_slips (legs from DIFFERENT games - same-game slips pay less). Writes nothing.
-- PROP LIST: nba_score.paper_prop_map() - shared with grade_paper_picks since 2026-09-23 (T20-16). It used to be a second
-- hardcoded copy here, so a prop added to one function and not the other would be logged and never graded.
  WITH snap AS (
    SELECT coalesce(p_snapshot,
             (SELECT s.snapshot_label FROM nba_market.board_snapshots s
              WHERE s.game_date = p_date AND s.bookmaker = 'prizepicks'
              ORDER BY s.fetched_at DESC, s.snapshot_label DESC LIMIT 1)) AS label
  ),
  m AS (SELECT * FROM nba_score.paper_prop_map()),
  std AS (
    SELECT DISTINCT ON (s.player, s.market_key, s.line, s.side) s.player, s.market_key, s.line, s.side, s.event_id
    FROM nba_market.board_snapshots s CROSS JOIN snap
    WHERE s.game_date = p_date AND s.bookmaker = 'prizepicks' AND s.snapshot_label = snap.label
      AND s.market_key NOT LIKE '%alternate'
  ),
  c AS (
    SELECT b.game_date, b.player, b.prop, b.line, b.side, 2 * b.final_hp AS mv, b.final_hp, std.event_id
    FROM nba_score.board_scored b
    JOIN m ON m.prop = b.prop
    JOIN std ON std.player = b.player AND std.market_key = m.market_key AND std.line = b.line AND std.side = b.side
    WHERE b.game_date = p_date AND b.app = 'prizepicks'
  ),
  best AS (SELECT DISTINCT ON (c.player) * FROM c ORDER BY c.player, c.mv DESC),
  ranked AS (SELECT best.*, row_number() OVER (ORDER BY best.mv DESC, best.player)::int AS rk FROM best WHERE best.mv >= p_threshold)
  SELECT r.game_date, r.player, r.prop, r.line, r.side, round(r.mv, 5), r.final_hp, r.rk, ((r.rk - 1) / 3)::int,
         (SELECT label FROM snap), r.event_id
  FROM ranked r
$function$;

CREATE OR REPLACE FUNCTION nba_score.paper_pick_slips(p_date date, p_threshold numeric DEFAULT 1.30, p_snapshot text DEFAULT NULL::text)
 RETURNS TABLE(game_date date, player text, prop text, line numeric, side text, model_value numeric, final_hp numeric, pick_rank integer, slip_no integer, snapshot_label text, event_id text)
 LANGUAGE plpgsql
 STABLE
AS $function$
#variable_conflict use_column
-- Greedy game-aware packing (2026-09-21): picks in rank order; each goes into the first open slip that has no leg from its
-- game; a new slip opens when none fits; slips close at 3 legs. Every slip spans three DIFFERENT games (PrizePicks pays
-- same-game slips less: a 2-pick of opponents paid 2.9x, and same-game Flex partials are cut).
DECLARE
  rec record; ev text[] := '{}'; cnt int[] := '{}'; i int; placed boolean; s int;
BEGIN
  FOR rec IN SELECT * FROM nba_score.paper_pick_candidates(p_date, p_threshold, p_snapshot) c ORDER BY c.pick_rank LOOP
    placed := false;
    FOR i IN 1 .. coalesce(array_length(cnt, 1), 0) LOOP
      IF cnt[i] < 3 AND position('|' || rec.event_id || '|' IN ev[i]) = 0 THEN
        ev[i] := ev[i] || rec.event_id || '|'; cnt[i] := cnt[i] + 1; s := i - 1; placed := true; EXIT;
      END IF;
    END LOOP;
    IF NOT placed THEN
      ev := ev || ('|' || rec.event_id || '|'); cnt := cnt || 1; s := array_length(cnt, 1) - 1;
    END IF;
    game_date := rec.game_date; player := rec.player; prop := rec.prop; line := rec.line; side := rec.side;
    model_value := rec.model_value; final_hp := rec.final_hp; pick_rank := rec.pick_rank; slip_no := s;
    snapshot_label := rec.snapshot_label; event_id := rec.event_id;
    RETURN NEXT;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION nba_score.paper_prop_map()
 RETURNS TABLE(prop text, market_key text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
-- THE ONE SOURCE for "which props the paper-trading strategy plays, and the board market each maps to"
-- (2026-09-23, T20-16). This list used to be hardcoded TWICE - in paper_pick_candidates (selection) and
-- in grade_paper_picks (grading). A prop added to one and not the other gets logged and can never be
-- graded, and because the grader only touches rows with result IS NULL, nothing ever reports it.
SELECT * FROM (VALUES
  ('points','player_points'), ('rebounds','player_rebounds'), ('assists','player_assists'),
  ('threes_made','player_threes'), ('pts_reb','player_points_rebounds'), ('pts_ast','player_points_assists'),
  ('reb_ast','player_rebounds_assists'), ('pra','player_points_rebounds_assists'),
  ('blocks','player_blocks'), ('steals','player_steals'), ('stocks','player_blocks_steals'),
  ('turnovers','player_turnovers')) AS t(prop, market_key);
$function$;

CREATE OR REPLACE FUNCTION nba_score.simulate_slips(p_strategy text, p_from date, p_to date)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
-- SLIP SIMULATOR (2026-09-22). Per regular-season night: pool = unflagged, graded prop_universe legs matching the strategy's
-- filters with leg value 2 x factor x model_p >= min_value, ONE leg per player (best value); greedy packing in value order into
-- slips of n legs from n DIFFERENT games; only full slips kept. Pricing: Power = pp_slip_power_conservative (any mix), Flex =
-- all-standard only (verified schedule; slips with alternates are skipped). Grading: void/push legs drop out; Power pays only if
-- every live leg hits, via pp_power_after_voids (exact for all-standard, keep-lowest for mixed); Flex via pp_flex_standard_payout.
DECLARE
  v_par jsonb; v_n int; v_type text; v_min numeric; v_kinds text[]; v_sources text[]; v_props text[]; v_sides text[]; v_cap int;
  v_d date; v_r record; v_ev text[]; v_cnt int[]; v_i int; v_placed boolean; v_total bigint := 0; v_k int;
BEGIN
  SELECT params INTO v_par FROM nba_score.sim_strategy WHERE strategy = p_strategy;
  IF v_par IS NULL THEN RAISE EXCEPTION 'unknown strategy %', p_strategy; END IF;
  v_n := (v_par->>'n')::int; v_type := coalesce(v_par->>'slip_type', 'power'); v_min := coalesce((v_par->>'min_value')::numeric, 0);
  v_kinds := coalesce(ARRAY(SELECT jsonb_array_elements_text(v_par->'kinds')), ARRAY['standard', 'goblin', 'demon']);
  v_sources := coalesce(ARRAY(SELECT jsonb_array_elements_text(v_par->'sources')), ARRAY['real', 'simulated']);
  v_props := CASE WHEN v_par ? 'props' AND jsonb_typeof(v_par->'props') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_par->'props')) END;
  v_sides := CASE WHEN v_par ? 'sides' AND jsonb_typeof(v_par->'sides') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_par->'sides')) END;
  v_cap := (v_par->>'max_slips_per_night')::int;
  IF array_length(v_kinds, 1) IS NULL THEN v_kinds := ARRAY['standard', 'goblin', 'demon']; END IF;
  IF array_length(v_sources, 1) IS NULL THEN v_sources := ARRAY['real', 'simulated']; END IF;

  DELETE FROM nba_score.sim_slip WHERE strategy = p_strategy AND game_date BETWEEN p_from AND p_to;
  CREATE TEMP TABLE IF NOT EXISTS _sim_pool (
    rk int, player text, prop text, kind text, side text, line numeric, event_id text, factor numeric, model_p numeric,
    result text, value numeric, season text, slip_no int) ON COMMIT DROP;

  FOR v_d IN SELECT DISTINCT u.game_date FROM nba_market.prop_universe u
             WHERE u.game_date BETWEEN p_from AND p_to AND u.phase = 'regular' ORDER BY 1 LOOP
    TRUNCATE _sim_pool;
    INSERT INTO _sim_pool (rk, player, prop, kind, side, line, event_id, factor, model_p, result, value, season)
    SELECT row_number() OVER (ORDER BY b.value DESC, b.player), b.player, b.prop, b.kind, b.side, b.line, b.event_id, b.factor,
           b.model_p, b.result, b.value, b.season
    FROM (SELECT DISTINCT ON (u.player) u.player, u.prop, u.kind, u.side, u.line, u.event_id, u.factor, u.model_p, u.result,
                 2 * u.factor * u.model_p AS value, u.season
          FROM nba_market.prop_universe u
          WHERE u.game_date = v_d AND u.phase = 'regular' AND u.flag IS NULL AND u.model_p IS NOT NULL AND u.result IS NOT NULL
            AND u.event_id IS NOT NULL AND u.kind = ANY (v_kinds) AND u.line_source = ANY (v_sources)
            AND (v_props IS NULL OR u.prop = ANY (v_props)) AND (v_sides IS NULL OR u.side = ANY (v_sides))
            AND 2 * u.factor * u.model_p >= v_min
            AND (v_type <> 'flex' OR u.kind = 'standard')
          ORDER BY u.player, 2 * u.factor * u.model_p DESC, u.prop, u.line) b;

    v_ev := '{}'; v_cnt := '{}';
    FOR v_r IN SELECT p.rk, p.event_id FROM _sim_pool p ORDER BY p.rk LOOP
      v_placed := false;
      FOR v_i IN 1 .. coalesce(array_length(v_cnt, 1), 0) LOOP
        IF v_cnt[v_i] < v_n AND position('|' || v_r.event_id || '|' IN v_ev[v_i]) = 0 THEN
          v_ev[v_i] := v_ev[v_i] || v_r.event_id || '|'; v_cnt[v_i] := v_cnt[v_i] + 1;
          UPDATE _sim_pool SET slip_no = v_i - 1 WHERE rk = v_r.rk; v_placed := true; EXIT;
        END IF;
      END LOOP;
      IF NOT v_placed AND (v_cap IS NULL OR coalesce(array_length(v_cnt, 1), 0) < v_cap) THEN
        v_ev := v_ev || ('|' || v_r.event_id || '|'); v_cnt := v_cnt || 1;
        UPDATE _sim_pool SET slip_no = array_length(v_cnt, 1) - 1 WHERE rk = v_r.rk;
      END IF;
    END LOOP;

    INSERT INTO nba_score.sim_slip (strategy, game_date, season, slip_no, slip_type, n, n_alt, legs, factors, model_ps, payout_full, model_ev,
                                    live, hits, misses, voids, payout, profit)
    SELECT p_strategy, v_d, s.season, s.slip_no, v_type, v_n, s.n_alt, s.legs, s.factors, s.model_ps, s.full_pay,
           CASE WHEN v_type = 'power' THEN s.full_pay * s.p_all END,
           v_n - s.voids, s.hits, s.misses, s.voids, s.pay, s.pay - 1
    FROM (
      SELECT g.*, CASE WHEN v_type = 'power' THEN (SELECT c.payout FROM nba_market.pp_slip_power_conservative(g.factors) c)
                       ELSE nba_market.pp_flex_standard_payout(v_n, v_n, true) END AS full_pay,
             CASE WHEN v_type = 'power' THEN
                    CASE WHEN g.misses > 0 THEN 0
                         WHEN g.voids = 0 THEN (SELECT c.payout FROM nba_market.pp_slip_power_conservative(g.factors) c)
                         ELSE nba_market.pp_power_after_voids(g.factors, v_n - g.voids) END
                  ELSE nba_market.pp_flex_standard_payout(v_n - g.voids, g.hits, g.voids = 0) END AS pay
      FROM (
        SELECT p.slip_no, max(p.season) AS season, (count(*) FILTER (WHERE p.kind <> 'standard'))::int AS n_alt,
               jsonb_agg(jsonb_build_object('player', p.player, 'prop', p.prop, 'kind', p.kind, 'side', p.side, 'line', p.line,
                                            'factor', p.factor, 'model_p', round(p.model_p, 4), 'result', p.result) ORDER BY p.rk) AS legs,
               array_agg(p.factor ORDER BY p.rk) AS factors, array_agg(p.model_p ORDER BY p.rk) AS model_ps,
               exp(sum(ln(greatest(p.model_p, 1e-9)))) AS p_all,
               (count(*) FILTER (WHERE p.result = 'hit'))::int AS hits, (count(*) FILTER (WHERE p.result = 'miss'))::int AS misses,
               (count(*) FILTER (WHERE p.result IN ('void', 'push')))::int AS voids
        FROM _sim_pool p WHERE p.slip_no IS NOT NULL GROUP BY p.slip_no HAVING count(*) = v_n
      ) g
    ) s;
    GET DIAGNOSTICS v_k = ROW_COUNT;
    v_total := v_total + v_k;
  END LOOP;
  RETURN v_total;
END $function$;
