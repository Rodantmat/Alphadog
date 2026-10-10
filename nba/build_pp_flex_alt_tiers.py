#!/usr/bin/env python3
"""
BUILD nba_config.pp_slip_rules['flex_alt_tiers'] - PrizePicks' Flex payout tiers for slips WITH goblins / demons, from
PrizePicks' own quotes (2026-10-10; nba/sql/pp_flex_alt_payout.sql, build_slip_engine.flex_alt_payout, regrade_pp_flex_alt.py).
Every quoted Flex slip of 3-6 picks with at least one alternate whose legs are all priced (factor = the mined 2-pick factor in
pp_mined_leg / pp_mined_leg_wnba, standard = 1) gives one point per tier: (factor product, quoted payout). The tier curve is
the LOWER ENVELOPE - at each factor product, the minimum PrizePicks quoted at that product or above - so the grader never
pays more than the app did for an equal or richer slip. extra_points (all-demon probe quotes that have no mined-leg rows) are
kept in the tunable itself and merged on every rebuild.
Runs after every payout-map load (nba-pp-payout-map.yml), so the curve sharpens as the season's quotes accumulate. Prints the
before / after point counts and refuses to shrink the evidence (fewer points than before -> keeps the old row).
Env: DATABASE_URL.
"""
import json
import os
import sys

import psycopg

EXTRA_DEFAULT = [  # probe_pp_demon_flex.py run 38021265189 (2026-10-10 03:40Z): [n, misses, factor_product, payout]
    [3, 0, 6.396, 23.0], [3, 1, 6.396, 2.5], [3, 0, 6.772, 23.0], [3, 1, 6.772, 2.25], [3, 0, 11.663, 40.0], [3, 1, 11.663, 3.5],
    [3, 0, 12.393, 39.0], [3, 1, 12.393, 3.75], [3, 0, 13.121, 42.0], [3, 1, 13.121, 3.75],
    [5, 0, 9.759, 72.0], [5, 1, 9.759, 8.5], [5, 2, 9.759, 2.0], [5, 0, 22.030, 130.0], [5, 1, 22.030, 15.0], [5, 2, 22.030, 3.0],
    [5, 0, 23.326, 165.0], [5, 1, 23.326, 17.5], [5, 2, 23.326, 4.0], [5, 0, 24.785, 180.0], [5, 1, 24.785, 15.0], [5, 2, 24.785, 3.0]]

POINTS_SQL = """
WITH q AS (SELECT run_file, seq, n, flex, legs, league FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 3 AND 6 AND flex IS NOT NULL),
l AS (SELECT q.run_file, q.seq, x->>'odds' odds,
        CASE WHEN x->>'odds'='standard' THEN 1.0
             WHEN q.league=3 THEN (SELECT m.factor_mined FROM nba_market.pp_mined_leg_wnba m WHERE m.run_file=q.run_file AND m.projection_id=x->>'id' LIMIT 1)
             ELSE (SELECT m.factor_mined FROM nba_market.pp_mined_leg m WHERE m.run_file=q.run_file AND m.projection_id=x->>'id' LIMIT 1) END f
      FROM q, jsonb_array_elements(q.legs) x),
p AS (SELECT run_file, seq, exp(sum(ln(f))) fp, count(*) FILTER (WHERE f IS NULL) miss, count(*) FILTER (WHERE odds<>'standard') nalt FROM l GROUP BY 1,2)
SELECT q.n, (q.n - t.key::int) misses, round(p.fp::numeric,3)::float8 fp, t.value::text::float8 pay
FROM q JOIN p USING (run_file, seq), jsonb_each(q.flex->(q.n::text)) t WHERE p.miss=0 AND p.nalt>=1 AND t.key ~ '^[0-9]+$'"""


def envelope(points):
    """{n: {misses: [[fp, env], ...]}} - env = min payout over points with factor product >= fp (nondecreasing)."""
    by = {}
    for n, m, fp, pay in points:
        d = by.setdefault(int(n), {}).setdefault(int(m), {})
        d[fp] = min(pay, d.get(fp, float("inf")))
    out = {}
    for n, tiers in by.items():
        for m, d in tiers.items():
            xs = sorted(d)
            env, run = [], float("inf")
            for x in reversed(xs):
                run = min(run, d[x])
                env.append([x, run])
            out.setdefault(str(n), {})[str(m)] = list(reversed(env))
    return out


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        row = c.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='flex_alt_tiers'").fetchone()
        old = (row[0] if isinstance(row[0], dict) else json.loads(row[0])) if row else {}
        extra = old.get("extra_points") or EXTRA_DEFAULT
        pts = [tuple(r) for r in c.execute(POINTS_SQL).fetchall()] + [tuple(e) for e in extra]
        tiers = envelope(pts)
        n_old = sum(len(v) for t in (old.get("tiers") or {}).values() for v in t.values())
        n_new = sum(len(v) for t in tiers.values() for v in t.values())
        print(f"flex_alt_tiers: {len(pts)} quote points ({len(extra)} probe extras) -> {n_new} envelope points (was {n_old})", flush=True)
        if n_new < n_old:
            print("REFUSED: fewer envelope points than the stored rule - the evidence shrank (quote table pruned?); keeping the old row")
            return 1
        rj = dict(old)
        rj.update({"tiers": tiers, "extra_points": extra, "n_quote_points": len(pts),
                   "meaning": old.get("meaning") or "Flex payout for a slip WITH goblins/demons by size and misses: [factor_product, payout] lower envelope; interpolate in ln(fp), clamp at the ends."})
        c.execute("""UPDATE nba_config.pp_slip_rules SET rule_json=%s, updated_at=now() WHERE rule_key='flex_alt_tiers'""", (json.dumps(rj),))
        if not row:
            c.execute("INSERT INTO nba_config.pp_slip_rules (rule_key, rule_json, status, notes, updated_at) VALUES ('flex_alt_tiers', %s, 'verified', 'quote-derived lower envelope', now())",
                      (json.dumps(rj),))
        c.commit()
        for n in sorted(tiers, key=int):
            print("  n=" + n + "  " + "  ".join(f"misses {m}: {len(v)} pts, fp {v[0][0]}..{v[-1][0]}" for m, v in sorted(tiers[n].items())), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
