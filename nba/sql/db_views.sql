-- DUMP OF THE NBA DATABASE VIEWS (2026-10-08, nba/dump_db_sql.py). The database is the running copy; this file is the
-- record (round-2 P3#16: critical-path SQL must be certifiable from source and recoverable from git).
-- Do not hand-edit: change the database (or the hand-maintained source files in this folder), then re-dump.

CREATE OR REPLACE VIEW nba_calendar.regular_season_games AS
 SELECT game_id,
    season,
    game_date,
    game_datetime_utc,
    home_team_id,
    home_team_tricode,
    away_team_id,
    away_team_tricode,
    arena_name,
    arena_city,
    game_status,
    game_status_text,
    game_label,
    source_key,
    raw_json,
    created_at,
    updated_at
   FROM nba_calendar.games
  WHERE (game_id ~~ '002%'::text);

CREATE OR REPLACE VIEW nba_market.leg_edge_map AS
 SELECT season,
    prop,
    kind,
    side,
    line_source,
        CASE
            WHEN ((((2)::numeric * factor) * model_p) < 1.0) THEN 'a <1.00'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.1) THEN 'b 1.00-1.10'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.2) THEN 'c 1.10-1.20'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.3) THEN 'd 1.20-1.30'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.4) THEN 'e 1.30-1.40'::text
            ELSE 'f >=1.40'::text
        END AS claimed_bucket,
    count(*) AS legs,
    round(avg(model_p), 4) AS model_p,
    round(avg((hit)::integer), 4) AS hit_rate,
    round(avg(factor), 4) AS avg_factor,
    round(avg((((2)::numeric * factor) * model_p)), 4) AS claimed_value,
    round(avg((((2)::numeric * factor) * ((hit)::integer)::numeric)), 4) AS realized_value,
    round((stddev_samp((((2)::numeric * factor) * ((hit)::integer)::numeric)) / sqrt((count(*))::numeric)), 4) AS se
   FROM nba_market.prop_universe
  WHERE ((phase = 'regular'::text) AND (flag IS NULL) AND (model_p IS NOT NULL) AND (result = ANY (ARRAY['hit'::text, 'miss'::text])))
  GROUP BY season, prop, kind, side, line_source,
        CASE
            WHEN ((((2)::numeric * factor) * model_p) < 1.0) THEN 'a <1.00'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.1) THEN 'b 1.00-1.10'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.2) THEN 'c 1.10-1.20'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.3) THEN 'd 1.20-1.30'::text
            WHEN ((((2)::numeric * factor) * model_p) < 1.4) THEN 'e 1.30-1.40'::text
            ELSE 'f >=1.40'::text
        END;

CREATE OR REPLACE VIEW nba_market.pp_leg_price AS
 SELECT t.game_date,
    t.snapshot_label,
    t.player,
    t.nm,
    t.base_market,
    t.side,
    t.line,
    COALESCE(r.rescued_kind, t.kind) AS kind,
    COALESCE(t.anchor_line, r.rescued_anchor) AS anchor_line,
        CASE
            WHEN (r.rescue_tier IS NOT NULL) THEN ('rescued:'::text || r.rescue_tier)
            ELSE t.anchor_type
        END AS anchor_type,
    t.tier,
    t.position_vs_anchor,
    k.price_id,
    k.kind_position_mismatch,
    m.model_version,
    p.implied_p,
    p.factor,
    ((3)::numeric * p.factor) AS two_pick_vs_standard,
    p.source AS price_source,
        CASE
            WHEN (m.model_version IS NULL) THEN 'no_current_model'::text
            WHEN (k.price_id IS NULL) THEN 'no_price_key_yet'::text
            ELSE p.reason
        END AS price_reason
   FROM ((((nba_market.board_tiers_v2 t
     LEFT JOIN nba_market.pp_anchor_rescue r ON (((t.anchor_line IS NULL) AND r.flag_agrees AND (r.game_date = t.game_date) AND (r.snapshot_label = t.snapshot_label) AND (r.player = t.player) AND (r.base_market = t.base_market) AND (r.side = t.side) AND (r.line = t.line))))
     LEFT JOIN ( SELECT pp_pricing_model.model_version
           FROM nba_config.pp_pricing_model
          WHERE pp_pricing_model.is_current) m ON (true))
     LEFT JOIN nba_market.pp_price_key k ON (((k.base_market = t.base_market) AND (COALESCE(k.anchor_line, ('-1'::integer)::numeric) = COALESCE(t.anchor_line, r.rescued_anchor, ('-1'::integer)::numeric)) AND (k.line = t.line) AND (k.side = t.side) AND (k.kind = COALESCE(r.rescued_kind, t.kind)))))
     LEFT JOIN nba_market.pp_price p ON (((p.price_id = k.price_id) AND (p.model_version = m.model_version))))
  WHERE (t.bookmaker = 'prizepicks'::text);

CREATE OR REPLACE VIEW nba_market.pp_mined_vs_model AS
 SELECT ml.run_file,
    ml.quoted_at,
    ml.projection_id,
    ml.player,
    ml.pp_stat,
    ml.base_market,
    ml.std_line,
    ml.line,
    ml.kind,
    ml.two_pick_power AS two_pick_mined,
    k.price_id,
    m.model_version,
    p.source AS model_source,
    p.reason AS model_reason,
        CASE
            WHEN (p.factor IS NULL) THEN NULL::numeric
            WHEN (((3)::numeric * p.factor) <= ((c.rule_json ->> 'knee'::text))::numeric) THEN ((3)::numeric * p.factor)
            ELSE (((c.rule_json ->> 'knee'::text))::numeric * power((((3)::numeric * p.factor) / ((c.rule_json ->> 'knee'::text))::numeric), ((c.rule_json ->> 'exponent'::text))::numeric))
        END AS two_pick_model
   FROM ((((nba_market.pp_mined_leg ml
     LEFT JOIN ( SELECT pp_pricing_model.model_version
           FROM nba_config.pp_pricing_model
          WHERE pp_pricing_model.is_current) m ON (true))
     LEFT JOIN ( SELECT pp_slip_rules.rule_json
           FROM nba_config.pp_slip_rules
          WHERE (pp_slip_rules.rule_key = 'compression'::text)) c ON (true))
     LEFT JOIN nba_market.pp_price_key k ON (((k.base_market = ml.base_market) AND (k.anchor_line = ml.std_line) AND (k.line = ml.line) AND (k.side = ml.side) AND (k.kind = ml.kind))))
     LEFT JOIN nba_market.pp_price p ON (((p.price_id = k.price_id) AND (p.model_version = m.model_version))));

CREATE OR REPLACE VIEW nba_market.pp_price_drift AS
 SELECT projection_id,
    player,
    pp_stat,
    base_market,
    line,
    kind,
    count(DISTINCT run_file) AS times_quoted,
    min(quoted_at) AS first_quoted,
    max(quoted_at) AS last_quoted,
    (array_agg(two_pick_power ORDER BY quoted_at))[1] AS first_power,
    (array_agg(two_pick_power ORDER BY quoted_at DESC))[1] AS latest_power,
    min(two_pick_power) AS min_power,
    max(two_pick_power) AS max_power,
    (count(DISTINCT two_pick_power) > 1) AS repriced
   FROM nba_market.pp_mined_leg
  GROUP BY projection_id, player, pp_stat, base_market, line, kind;

CREATE OR REPLACE VIEW nba_score.final_hp_all AS
 SELECT f.season,
    f.game_date,
    f.game_id,
    f.player_id,
    f.prop,
    f.line,
    f.side,
    f.ladder_offset,
    f.anchor,
    f.baseline_hp,
    f.final_hp,
    f.cal_shift,
    f.score,
    f.confidence,
    f.conf_tier,
    f.c_exist,
    f.c_quality,
    f.c_market,
    f.prop_tier,
    f.band,
    f.phase,
    f.n_uncertain,
    f.built_at,
    f.edge,
    NULL::text AS derivation,
    NULL::numeric AS p_tie
   FROM nba_score.final_hp f
UNION ALL
 SELECT d.season,
    d.game_date,
    d.game_id,
    d.player_id,
    d.prop,
    d.line,
    d.side,
    d.ladder_offset,
    d.anchor,
    d.baseline_hp,
    d.final_hp,
    d.cal_shift,
    d.score,
    d.confidence,
    d.conf_tier,
    d.c_exist,
    d.c_quality,
    d.c_market,
    d.prop_tier,
    d.band,
    d.phase,
    d.n_uncertain,
    d.built_at,
    d.edge,
    d.derivation,
    d.p_tie
   FROM nba_score.final_hp_derived d;

CREATE OR REPLACE VIEW nba_score.paper_results AS
 WITH s AS (
         SELECT paper_picks.strategy,
            paper_picks.game_date,
            paper_picks.slip_no,
            count(*) AS legs,
            count(*) FILTER (WHERE (paper_picks.result = 'void'::text)) AS n_void,
            count(*) FILTER (WHERE (paper_picks.result = 'hit'::text)) AS n_hit,
            count(*) FILTER (WHERE (paper_picks.result IS NULL)) AS n_pending,
            min(paper_picks.logged_at) AS logged_at
           FROM nba_score.paper_picks
          GROUP BY paper_picks.strategy, paper_picks.game_date, paper_picks.slip_no
        ), p AS (
         SELECT s.strategy,
            s.game_date,
            s.slip_no,
            s.legs,
            s.n_void,
            s.n_hit,
            s.n_pending,
            s.logged_at,
                CASE
                    WHEN (s.n_pending > 0) THEN NULL::numeric
                    WHEN ((s.legs - s.n_void) < 2) THEN 1.0
                    WHEN (s.n_hit = (s.legs - s.n_void)) THEN
                    CASE (s.legs - s.n_void)
                        WHEN 3 THEN 6.0
                        WHEN 2 THEN 3.0
                        ELSE NULL::numeric
                    END
                    ELSE 0.0
                END AS payout
           FROM s
          WHERE (s.legs = 3)
        ), n AS (
         SELECT p.strategy,
            p.game_date,
            min(p.logged_at) AS logged_at,
            count(*) AS slips,
            count(p.payout) AS graded_slips,
            (sum(p.payout) - (count(p.payout))::numeric) AS profit_units
           FROM p
          GROUP BY p.strategy, p.game_date
        )
 SELECT strategy,
    game_date,
    logged_at,
    slips,
    graded_slips,
    profit_units,
        CASE
            WHEN (graded_slips > 0) THEN round((profit_units / (graded_slips)::numeric), 4)
            ELSE NULL::numeric
        END AS roi,
    sum(profit_units) OVER (PARTITION BY strategy ORDER BY game_date) AS cumulative_profit_units,
    sum(graded_slips) OVER (PARTITION BY strategy ORDER BY game_date) AS cumulative_graded_slips
   FROM n;

CREATE OR REPLACE VIEW nba_score.player_pf20 AS
 SELECT (nba_player_id)::text AS pid,
    game_date,
    avg(pf) OVER (PARTITION BY nba_player_id ORDER BY game_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS pf20
   FROM nba_stats.player_game_log;

CREATE OR REPLACE VIEW nba_score.sim_results AS
 WITH nightly AS (
         SELECT sim_slip.strategy,
            sim_slip.season,
            sim_slip.game_date,
            count(*) AS slips,
            sum(sim_slip.profit) AS profit,
            sum(sim_slip.payout) AS returned,
            sum(sim_slip.hits) AS hits,
            sum((sim_slip.hits + sim_slip.misses)) AS graded_legs,
            sum(sim_slip.voids) AS voids,
            avg(sim_slip.model_ev) AS claimed,
            avg(sim_slip.payout_full) AS full_pay
           FROM nba_score.sim_slip
          GROUP BY sim_slip.strategy, sim_slip.season, sim_slip.game_date
        )
 SELECT strategy,
    COALESCE(season, 'BOTH'::text) AS season,
    count(*) AS nights,
    sum(slips) AS slips,
    round((sum(profit) / sum(slips)), 4) AS roi,
    round((stddev_samp((profit / (slips)::numeric)) / sqrt((count(*))::numeric)), 4) AS se_by_night,
    round(((sum(profit) / sum(slips)) / NULLIF((stddev_samp((profit / (slips)::numeric)) / sqrt((count(*))::numeric)), (0)::numeric)), 2) AS t_stat,
    round((sum(hits) / NULLIF(sum(graded_legs), (0)::numeric)), 4) AS leg_hit_rate,
    sum(voids) AS void_legs,
    round(avg(full_pay), 3) AS avg_full_payout,
    round((sum((claimed * (slips)::numeric)) / sum(slips)), 3) AS claimed_payout_per_unit,
    round((sum(returned) / sum(slips)), 3) AS realized_payout_per_unit
   FROM nightly
  GROUP BY strategy, ROLLUP(season);
