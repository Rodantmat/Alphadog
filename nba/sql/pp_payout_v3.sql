-- nba_market.pp_payout_v3() / pp_slip_payout_v3()  -- source of record for the DB functions (applied 2026-10-18).
--
-- PRIZEPICKS GRADER v3 (2026-10-18, owner: "Having the boards now, be sure we are using the proper multipliers, prove, analyze and
-- understand each of the available tables"). Proven against PrizePicks' own quote engine (pp_payout_map.py PP_MODE=proof on the
-- 10-20 NBA board + every earlier multi-pick quote; research_payout_proof.py, research_pp_power_law_fit.py):
--   * all-standard Power pays the base table EXACTLY (3 / 6 / 10 / 20 / 37.5) - the old grader compressed it above 9.1x
--     (4-pick 9.87, 5-pick 17.87, 6-pick 30.6);
--   * all-standard Flex pays its table exactly (5-Flex 10, 6-Flex 25 - were 9.87 / 21.6);
--   * Power WITH goblins / demons, 3-6 picks: grid_down(b_n x fp^a_n) (pp_slip_rules['power_alt_v3'], a conservative law: mean
--     0.95 of the quote) - the old compress(base x fp) paid 3-picks +7% (+23% max) and 4-6 picks -10 / -11 / -20%;
--     2-pick keeps compress(3 x fp) (verified);
--   * all-standard 3- / 4-pick Flex with a same-game pair: the adjusted table (pp_slip_rules['flex_same_game_v3'], 3: 3 / 0.75,
--     4: 5 / 1.25) - PrizePicks adjusts some same-game pairs and we cannot see which (conservative);
--   * Flex WITH goblins / demons: unchanged, PrizePicks' quote-derived tiers (pp_flex_alt_payout).
-- Mirrors build_slip_engine.pp_payout / grade exactly (ties / voids revert per PrizePicks' schedules, as grade()).

CREATE OR REPLACE FUNCTION nba_market.pp_grid_down(x double precision)
 RETURNS double precision LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN x < 3 THEN floor(x / 0.1 + 1e-9) * 0.1 ELSE floor(x / 0.25 + 1e-9) * 0.25 END
$f$;

CREATE OR REPLACE FUNCTION nba_market.pp_payout_v3(p_n integer, p_hits integer, p_structure text, p_fprod double precision,
                                                   p_alt boolean, p_same_game boolean)
 RETURNS double precision
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  base float8; r jsonb; fp float8 := coalesce(p_fprod, 1.0);
BEGIN
  IF p_structure = 'power' THEN
    IF p_hits <> p_n THEN RETURN 0; END IF;
    IF NOT coalesce(p_alt, false) THEN
      -- same-game all-standard 2 / 3-pick Power (2026-10-21, pp_slip_rules power_same_game_v3, conservative)
      IF coalesce(p_same_game, false) AND p_n IN (2, 3) THEN
        SELECT (rule_json->>(p_n::text))::float8 INTO base FROM nba_config.pp_slip_rules WHERE rule_key = 'power_same_game_v3';
        IF base IS NULL THEN RAISE EXCEPTION 'pp_slip_rules power_same_game_v3 has no size % - never guessed', p_n; END IF;
        RETURN base;
      END IF;
      RETURN CASE p_n WHEN 2 THEN 3.0 WHEN 3 THEN 6.0 WHEN 4 THEN 10.0 WHEN 5 THEN 20.0 WHEN 6 THEN 37.5 ELSE 0 END;
    END IF;
    IF p_n = 2 THEN
      RETURN CASE WHEN 3 * fp <= 9.1 THEN 3 * fp ELSE 9.1 * power(3 * fp / 9.1, 0.857) END;
    END IF;
    SELECT rule_json->(p_n::text) INTO r FROM nba_config.pp_slip_rules WHERE rule_key = 'power_alt_v3';
    IF r IS NULL THEN RAISE EXCEPTION 'pp_slip_rules power_alt_v3 has no size % - never guessed', p_n; END IF;
    RETURN nba_market.pp_grid_down((r->>'b')::float8 * power(fp, (r->>'a')::float8));
  END IF;
  base := CASE (p_n, p_hits) WHEN (2,2) THEN 2 WHEN (2,1) THEN 0.5 WHEN (3,3) THEN 3 WHEN (3,2) THEN 1 WHEN (4,4) THEN 6 WHEN (4,3) THEN 1.5
               WHEN (5,5) THEN 10 WHEN (5,4) THEN 2 WHEN (5,3) THEN 0.4 WHEN (6,6) THEN 25 WHEN (6,5) THEN 2 WHEN (6,4) THEN 0.4 ELSE 0 END;
  IF base <= 0 THEN RETURN 0; END IF;
  IF coalesce(p_alt, false) THEN
    RETURN nba_market.pp_flex_alt_payout(p_n, p_n - p_hits, fp);
  END IF;
  IF coalesce(p_same_game, false) AND p_n IN (3, 4) THEN
    SELECT (rule_json->(p_n::text)->>(p_hits::text))::float8 INTO base FROM nba_config.pp_slip_rules WHERE rule_key = 'flex_same_game_v3';
    RETURN coalesce(base, 0);
  END IF;
  RETURN base;
END $function$;

-- One slip, exactly as build_slip_engine.grade: legs_json = [{hit 0/1/null, factor}], structure, same_game (the slip's own flag,
-- over ALL its legs). Ties / voids (hit null) are removed and the lineup reverts: none left -> refund 1.0; ONE left -> 1.5 x its
-- factor (compressed) on a hit, 0 on a miss; a Flex reverting below 3 picks plays as Power.
CREATE OR REPLACE FUNCTION nba_market.pp_slip_payout_v3(p_legs jsonb, p_structure text, p_same_game boolean)
 RETURNS double precision
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  nl int; nlv int; hits int; fp float8; alt boolean; st text := p_structure;
BEGIN
  SELECT jsonb_array_length(p_legs),
         count(*) FILTER (WHERE (j->>'hit') IS NOT NULL),
         coalesce(sum((j->>'hit')::int), 0),
         coalesce(exp(sum(ln((j->>'factor')::float8)) FILTER (WHERE (j->>'hit') IS NOT NULL)), 1.0),
         coalesce(bool_or(abs((j->>'factor')::float8 - 1) > 1e-9) FILTER (WHERE (j->>'hit') IS NOT NULL), false)
    INTO nl, nlv, hits, fp, alt
    FROM jsonb_array_elements(p_legs) j;
  IF nlv = 0 THEN RETURN 1.0; END IF;
  IF nlv < nl THEN
    IF nlv = 1 THEN
      RETURN CASE WHEN hits = 1 THEN (CASE WHEN 1.5 * fp <= 9.1 THEN 1.5 * fp ELSE 9.1 * power(1.5 * fp / 9.1, 0.857) END) ELSE 0 END;
    END IF;
    IF st = 'flex' AND nlv < 3 THEN st := 'power'; END IF;
  END IF;
  RETURN nba_market.pp_payout_v3(nlv, hits, st, fp, alt, p_same_game);
END $function$;
