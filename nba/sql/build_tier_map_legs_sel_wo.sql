-- nba_score.build_tier_map_legs_sel_wo()  -- source of record for the DB function (2026-10-16).
--
-- THE WINDOW-ONLY BACKTEST (the market term as live can have it). The certified selection (nba_score.tier_map_legs_sel) was
-- scored with c_market = max books over EVERY rung_market label of the day - the window capture AND the close capture (verified
-- 2026-10-16: final_hp.c_market equals the all-label book count on 100% of 93,452 legs 2025-11-10..12, the window-only count on
-- 97.5%; 2,296 of 8,498 priced legs carried close-time books). Live P3 scores at the window, before the close capture exists,
-- so the certified market-inclusive tables hold a lookahead. This function rescores the selection with the WINDOW books only -
-- the same formula as build_tier_map_legs_sel_mf(), with c_market replaced by least(1, window books / 4) instead of 0.
-- Tables: *_wo / *_wo_nosteals (slip engine with SE_LEGS_TABLE = nba_score.tier_map_legs_sel_wo).
CREATE OR REPLACE FUNCTION nba_score.build_tier_map_legs_sel_wo()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE n bigint; d_books numeric; d_agree numeric;
BEGIN
  SELECT deduction INTO d_books FROM nba_score.confidence_model WHERE factor = 'f_books';
  SELECT deduction INTO d_agree FROM nba_score.confidence_model WHERE factor = 'f_agree';
  IF d_books IS NULL OR d_agree IS NULL THEN RAISE EXCEPTION 'confidence_model lacks f_books / f_agree'; END IF;
  DROP TABLE IF EXISTS nba_score.rung_books_window;
  CREATE TABLE nba_score.rung_books_window AS
    SELECT r.game_date, m.player_id::text AS pid,
           replace(replace(r.market, 'player_', ''), '_alternate', '') AS prop, r.line, max(r.books)::numeric AS books
    FROM nba_market.rung_market r JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(r.player)
    WHERE r.snapshot_label = 'window'
    GROUP BY 1, 2, 3, 4;
  CREATE INDEX ON nba_score.rung_books_window (game_date, pid, prop, line);
  ANALYZE nba_score.rung_books_window;
  DROP TABLE IF EXISTS nba_score.tier_map_legs_sel_wo_new;
  CREATE TABLE nba_score.tier_map_legs_sel_wo_new AS
  WITH j AS (
    SELECT s.*, f.confidence AS conf, f.c_market AS cm, f.final_hp AS hp,
           least(1.0, coalesce(w.books, 0) / 4.0) AS cmw
    FROM nba_score.tier_map_legs_sel s
    LEFT JOIN nba_ref.player_name_map m ON s.rank_key = 'final_score' AND m.norm_name = nba_ref.norm_name(s.player)
    LEFT JOIN nba_score.final_hp f ON s.rank_key = 'final_score' AND f.game_date = s.game_date AND f.player_id = m.player_id::text
                                   AND f.prop = s.prop AND f.side = s.side AND f.line = s.line
    LEFT JOIN nba_score.rung_books_window w ON s.rank_key = 'final_score' AND w.game_date = s.game_date AND w.pid = f.player_id
                                   AND w.prop = s.prop AND w.line = s.line
  ), c AS (
    SELECT j.*, CASE WHEN j.rank_key <> 'final_score' OR j.cm IS NULL THEN NULL ELSE
             j.conf - (d_books * (j.cm - j.cmw) + d_agree * 0.30 * ((j.cm > 0)::int - (j.cmw > 0)::int)) / 100.0 END AS conf_wo
    FROM j
  ), r AS (
    SELECT c.*,
      CASE WHEN c.conf_wo IS NULL THEN c.score ELSE
        round(least(100.0, greatest(0.0,
          c.hp*100.0
          + (100.0 - c.hp*100.0) * least(1.0, greatest(0.0, (c.conf_wo - 0.85)/0.15)) * 0.5
          - c.hp*100.0 * least(1.0, greatest(0.0, -((c.conf_wo - 0.85)/0.15))) * 0.35
        ))::numeric, 2)::double precision END AS score_wo
    FROM c)
  SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor,
         score_wo AS score, hit,
         CASE WHEN rank_key = 'final_score'
              THEN row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score_wo DESC, player, side, line)::int
              ELSE n_rank END AS n_rank,
         cell_size
  FROM r;
  CREATE INDEX ON nba_score.tier_map_legs_sel_wo_new (rank_key, game_date, prop, tier);
  ANALYZE nba_score.tier_map_legs_sel_wo_new;
  DROP TABLE IF EXISTS nba_score.tier_map_legs_sel_wo;
  ALTER TABLE nba_score.tier_map_legs_sel_wo_new RENAME TO tier_map_legs_sel_wo;
  SELECT count(*) INTO n FROM nba_score.tier_map_legs_sel_wo;
  RETURN n;
END $function$;
