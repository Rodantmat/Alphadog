-- nba_market.pp_flex_alt_payout()  -- source of record for the DB function (applied 2026-10-10).
--
-- PRIZEPICKS FLEX WITH GOBLINS / DEMONS, FROM PRIZEPICKS' OWN QUOTES (2026-10-09/10, owner: "prove the payouts ... make sure
-- everything is sharp"). The certified grader paid FLEX[(n, hits)] x prod(leg factors) on every Flex tier; PrizePicks'
-- partial tiers are nearly flat in the factor product (3-Flex one miss ~1.0x up to fp 3.4; 5-Flex one miss ~2.0x up to
-- fp 6.8; two misses 0.4x) and its all-hit tier rises faster than FLEX x fp - so the partial tiers were overpaid 2-5x
-- (48 live quotes run 38020184454, 40 all-demon quotes probe 38021265189, the 2026-09 WNBA mining).
-- Tiers: nba_config.pp_slip_rules['flex_alt_tiers'].tiers[n][misses] = [[factor_product, payout], ...], the LOWER ENVELOPE
-- of the quoted payouts (min quoted at that factor product or above), interpolated linearly in ln(fp), clamped at the ends.
-- Validated on its own 917 quote tiers: mean model/quote 0.95, max 1.013 (factor products stored to 3 decimals).
-- Mirrors build_slip_engine.flex_alt_payout exactly. A tier PrizePicks does not pay (e.g. 3-Flex, two misses) -> 0.
CREATE OR REPLACE FUNCTION nba_market.pp_flex_alt_payout(p_n integer, p_misses integer, p_fprod double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  pts jsonb; m int; i int; x0 float8; y0 float8; x1 float8; y1 float8;
BEGIN
  SELECT rule_json->'tiers'->(p_n::text)->(p_misses::text) INTO pts FROM nba_config.pp_slip_rules WHERE rule_key = 'flex_alt_tiers';
  IF pts IS NULL OR jsonb_array_length(pts) = 0 THEN RETURN 0; END IF;
  m := jsonb_array_length(pts);
  IF p_fprod <= (pts->0->>0)::float8 THEN RETURN (pts->0->>1)::float8; END IF;
  IF p_fprod >= (pts->(m-1)->>0)::float8 THEN RETURN (pts->(m-1)->>1)::float8; END IF;
  FOR i IN 0 .. m - 2 LOOP
    x0 := (pts->i->>0)::float8; y0 := (pts->i->>1)::float8; x1 := (pts->(i+1)->>0)::float8; y1 := (pts->(i+1)->>1)::float8;
    IF x0 <= p_fprod AND p_fprod <= x1 THEN
      IF x1 = x0 THEN RETURN least(y0, y1); END IF;
      RETURN y0 + (y1 - y0) * (ln(p_fprod) - ln(x0)) / (ln(x1) - ln(x0));
    END IF;
  END LOOP;
  RETURN (pts->(m-1)->>1)::float8;
END $function$;

-- The same curve as interpolation segments, for set-based use (regrade_pp_flex_alt.py): one row per adjacent pair of points,
-- plus a flat segment below the first and above the last point (the clamp). Verified identical to the function on 190
-- (n, misses, fp) cases; a (n, misses) PrizePicks does not pay has no segment -> the caller coalesces to 0.
CREATE OR REPLACE VIEW nba_market.pp_flex_alt_segments AS
WITH p AS (
  SELECT n.key::int n, m.key::int misses, (e.v->>0)::float8 x, (e.v->>1)::float8 y, e.i
  FROM nba_config.pp_slip_rules r, jsonb_each(r.rule_json->'tiers') n, jsonb_each(n.value) m,
       LATERAL (SELECT v, ordinality i FROM jsonb_array_elements(m.value) WITH ORDINALITY t(v, ordinality)) e
  WHERE r.rule_key = 'flex_alt_tiers'),
s AS (SELECT n, misses, x x0, y y0, lead(x) OVER w x1, lead(y) OVER w y1, i, max(i) OVER (PARTITION BY n, misses) imax FROM p WINDOW w AS (PARTITION BY n, misses ORDER BY i))
SELECT n, misses, x0, y0, x1, y1 FROM s WHERE x1 IS NOT NULL
UNION ALL SELECT n, misses, 0, y0, x0, y0 FROM s WHERE i = 1
UNION ALL SELECT n, misses, x0, y0, 1e9, y0 FROM s WHERE i = imax;
