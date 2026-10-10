-- nba_market.sleeper_slip_payout()  -- source of record for the DB function (applied 2026-10-09).
--
-- SLEEPER'S PAYOUT RULE, REPLICATED TO NBA (owner 2026-10-09 20:04 PT: "as for Sleeper, be sure that is replicated to NBA").
-- The rule was verified on the owner's MLB entries (19 placed slips + app screenshots, 2026-09-10; classification_config
-- ['board_payout_conversion_rules'], MULTIPLIER_TABLES_MASTER.md §5) and lives here as ONE function the NBA side can call,
-- with its numbers in the tunable classification_config['sleeper_payout'] (never hardcoded):
--   POWER ("Max")  = PRODUCT of the picks' displayed payout multipliers, all must hit
--   FLEX  ("Combo") = a round-robin over the (n-1)-pick sub-combinations, stake split evenly across the n of them, each
--                    sub-combination paying the product of its picks: all hit -> the average of the n products
--                    (MLB 3/3 Flex: predicted 2.775x vs real 2.78x); one miss -> only the sub-combination without the
--                    miss pays, product / n (MLB 2/3: predicted 0.884-0.963x, real 0.92x). Two misses: Sleeper pays them
--                    only at 5+ picks and that schedule was never verified -> 0 here (conservative, flagged in the tunable).
--   SLIP HAIRCUT   = the app paid 2-8% BELOW the plain product on the MLB slips; NBA prices with the tunable's
--                    slip_haircut (default the worst observed, 8%) so a Sleeper slip is never overstated.
--   VOIDS          = a push / DNP voids the pick and the entry is graded as if it was never included (Sleeper rules);
--                    fewer than 2 live picks left -> refunded (1.0); a Flex left with 2 live picks pays as a 2-pick Max.
-- p_mult   = the displayed per-pick payout multipliers (boards/sleeper_nba_current.json over/under_multiplier)
-- p_result = 'hit' | 'miss' | 'void' per pick, same order; p_mode = 'power' | 'flex'; p_haircut NULL = the tunable.
-- Returns the total payout multiple of the stake (1.0 = money back, 0 = lost).
-- VERIFIED 2026-10-09 (SQL): 3/3 Flex of 1.6658 legs, no haircut = 2.7749 (MLB real 2.78); 2/3 = 0.9250 (MLB real 0.92);
-- 1/3 = 0; 2-pick Max 1.78 x 1.75 = 3.1150 (2.8658 with the 8% tunable haircut); miss = 0; 2-pick with a void = refund 1.0;
-- 3-pick Flex with a void = the 2-pick Max of the others (3.06); 4/4 Flex 1.8/1.7/1.6/1.5 = 4.4715 (average of 4 triples).
CREATE OR REPLACE FUNCTION nba_market.sleeper_slip_payout(p_mult double precision[], p_result text[], p_mode text,
                                                         p_haircut numeric DEFAULT NULL)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  h numeric; n int; i int; j int; k int; ok boolean; prod numeric; s numeric := 0;
  lm double precision[] := '{}'; lr text[] := '{}';
BEGIN
  IF coalesce(array_length(p_mult, 1), 0) <> coalesce(array_length(p_result, 1), 0) THEN
    RAISE EXCEPTION 'sleeper_slip_payout: % multipliers vs % results', array_length(p_mult, 1), array_length(p_result, 1);
  END IF;
  IF p_mode NOT IN ('power', 'flex') THEN RAISE EXCEPTION 'sleeper_slip_payout: mode % (power | flex)', p_mode; END IF;
  h := coalesce(p_haircut,
                (SELECT (config_json->>'slip_haircut')::numeric FROM nba_config.classification_config WHERE config_key = 'sleeper_payout'),
                0.08);
  FOR i IN 1..coalesce(array_length(p_mult, 1), 0) LOOP
    IF p_result[i] NOT IN ('hit', 'miss', 'void') THEN RAISE EXCEPTION 'sleeper_slip_payout: result % (hit | miss | void)', p_result[i]; END IF;
    IF p_result[i] <> 'void' THEN lm := lm || p_mult[i]; lr := lr || p_result[i]; END IF;
  END LOOP;
  n := coalesce(array_length(lm, 1), 0);
  IF n < 2 THEN RETURN 1.0; END IF;                                  -- refunded
  IF p_mode = 'power' OR n = 2 THEN                                  -- Max, or a Flex reduced to 2 live picks
    IF 'miss' = ANY (lr) THEN RETURN 0; END IF;
    prod := 1; FOR i IN 1..n LOOP prod := prod * lm[i]::numeric; END LOOP;
    RETURN round(prod * (1 - h), 4);
  END IF;
  FOR k IN 1..n LOOP                                                 -- the sub-combination without pick k
    ok := true; prod := 1;
    FOR j IN 1..n LOOP
      IF j <> k THEN
        IF lr[j] = 'miss' THEN ok := false; END IF;
        prod := prod * lm[j]::numeric;
      END IF;
    END LOOP;
    IF ok THEN s := s + prod; END IF;
  END LOOP;
  RETURN round((s / n) * (1 - h), 4);
END $function$;
