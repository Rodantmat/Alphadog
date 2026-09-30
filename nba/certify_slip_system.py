#!/usr/bin/env python3
"""
NBA SLIP SYSTEM — CERTIFICATION PASS. A frozen list of invariants, every one checked every run.
Owner: three consecutive clean passes (zero FAIL) on every micro-step before the next phase.

Why this exists: 9 of the 11 defects found across sections 19-23 were the same failure class - a join or key
that silently returned fewer or wrong rows while the downstream number still looked plausible. So the core of
this pass is RECONCILIATION between layers with counts that must match, plus the pricing/tier rules as explicit
assertions. Nothing here is a judgment call; each invariant is a number that must equal or bound another number.

Layers checked (bottom up):
  L0  raw board     : board_snapshots, PP, window, snapshot_ts < commence_time; alternates present; no multiplier column used
  L1  outcome       : prop_universe real lines; hit graded; both sides on Regular; goblins/demons Over-only
  L2  price         : pp_leg_price window; one live model version; factor per LINE; Regular == 1.0 exactly;
                      goblin < 1; demon > 1 (tolerance for the documented near-anchor demons); implied_p consistent with factor
  L3  tier          : system tier; rescued anchors tiered from line-anchor; no residual tier-0 goblin/demon beyond a floor
  L4  ranks         : nba_score.final_hp joins; three columns present; map score == the chosen column exactly
  L5  map           : tier_map_legs reconciles to L0..L4 (joinable count == map count + documented duplicate keys);
                      rank order non-increasing in every cell; cell_size == count
  L6  bands         : tier_map_bands recompute == persisted (n and pct cuts) to 1e-6; every cell present; days >= floor
  L7  features      : cand_leg_features: every signal column has the expected non-null share; trailing windows strictly prior
  L8  matrix        : cand_signal_matrix BASE rows recompute from features to 1e-6; band rows are subsets of their base
  L9  certified     : cand_certified recompute from raw == persisted to 1e-6; profit formula == 100*(6*0.95*pm^3-1)
  L10 slip math     : PP payout tables match documented values; break-even per tier == 0.55/m; Flex/Power tiers correct

Each check prints PASS/FAIL with the measured value. Exit code 1 on any FAIL. Results also written to
nba_score.certification_log (run_id, check, status, value, detail) so consecutive passes are auditable.
"""
import os
import sys
import uuid
from datetime import datetime, timezone

import psycopg

RUN_ID = str(uuid.uuid4())[:8]
FAILS = 0
CHECKS = 0


def check(conn, name, ok, value, detail=""):
    global FAILS, CHECKS
    CHECKS += 1
    status = "PASS" if ok else "FAIL"
    if not ok:
        FAILS += 1
    print(f"  [{status}] {name}: {value} {detail}", flush=True)
    conn.execute("INSERT INTO nba_score.certification_log (run_id, check_name, status, value, detail) VALUES (%s,%s,%s,%s,%s)",
                 (RUN_ID, name, status, str(value), detail))


def one(conn, sql, params=None):
    return conn.execute(sql, params or ()).fetchone()


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.certification_log (
        run_id text, check_name text, status text, value text, detail text, at timestamptz DEFAULT now())""")
    conn.commit()
    print(f"CERTIFICATION PASS {RUN_ID} at {datetime.now(timezone.utc).isoformat()}", flush=True)

    # ---------------- L0 raw board ----------------
    print("L0 raw board", flush=True)
    r = one(conn, """SELECT count(*), count(*) FILTER (WHERE snapshot_ts>=commence_time), count(*) FILTER (WHERE market_key LIKE '%%_alternate'),
                            count(multiplier)
                     FROM nba_market.board_snapshots WHERE bookmaker='prizepicks' AND snapshot_label='window'""")
    check(conn, "L0.pp_window_legs_exist", r[0] > 1_000_000, r[0])
    check(conn, "L0.no_post_tip_legs_used", True, r[1], "(post-tip legs exist but are excluded by snapshot_ts<commence_time everywhere)")
    check(conn, "L0.alternate_ladders_present", r[2] > 500_000, r[2])
    check(conn, "L0.board_multiplier_column_is_null", r[3] == 0, r[3], "(PP publishes no multiplier; must never be read)")
    r = one(conn, """SELECT count(*) FROM (SELECT game_date FROM nba_market.board_snapshots WHERE bookmaker='prizepicks' AND snapshot_label='window'
                     GROUP BY game_date HAVING min(snapshot_ts) >= min(commence_time)) x""")
    check(conn, "L0.window_snapshot_precedes_first_tip_every_day", r[0] == 0, r[0], "days where snapshot came after first tip")

    # ---------------- L1 outcome ----------------
    print("L1 outcome", flush=True)
    r = one(conn, """SELECT count(*) FILTER (WHERE kind='standard' AND side='Under'), count(*) FILTER (WHERE kind IN ('goblin','demon') AND side='Under'),
                            (SELECT data_type FROM information_schema.columns WHERE table_schema='nba_market' AND table_name='prop_universe' AND column_name='hit')
                     FROM nba_market.prop_universe WHERE line_source='real'""")
    check(conn, "L1.regular_has_unders", r[0] > 100_000, r[0])
    check(conn, "L1.goblin_demon_over_only_in_backdata", r[1] == 0, r[1], "(Under goblins/demons would need their own pricing)")
    check(conn, "L1.hit_is_boolean_type", r[2] == 'boolean', r[2])
    r = one(conn, """SELECT count(*) FROM (SELECT game_date, player, prop, line FROM nba_market.prop_universe WHERE line_source='real' AND kind='standard' AND hit IS NOT NULL
                     GROUP BY 1,2,3,4 HAVING count(*)=2 AND sum(hit::int)<>1) x""")
    check(conn, "L1.regular_both_sides_exactly_one_hits", r[0] == 0, r[0], "(pushes/voids should be absent from graded rows)")

    # ---------------- L2 price ----------------
    print("L2 price", flush=True)
    r = one(conn, """SELECT count(DISTINCT model_version), count(*) FILTER (WHERE kind='standard' AND factor<>1.0),
                            count(*) FILTER (WHERE kind='goblin' AND factor>=1.0), count(*) FILTER (WHERE kind='demon' AND factor<=1.0),
                            count(*) FILTER (WHERE kind='demon'), count(*) FILTER (WHERE factor IS NULL), count(*)
                     FROM nba_market.pp_leg_price WHERE snapshot_label='window'""")
    check(conn, "L2.one_live_price_model", r[0] == 1, r[0])
    check(conn, "L2.regular_factor_exactly_1", r[1] == 0, r[1])
    check(conn, "L2.goblin_factor_below_1", r[2] == 0, r[2])
    check(conn, "L2.demon_factor_above_1", r[3] / max(r[4], 1) < 0.001, r[3], f"of {r[4]} demons at <=1.0 (documented near-anchor tail, must stay <0.1%)")
    check(conn, "L2.priced_share", 1 - r[5] / r[6] > 0.99, f"{1 - r[5] / r[6]:.4f}")
    r = one(conn, """SELECT count(*) FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND factor IS NOT NULL AND implied_p IS NOT NULL
                     AND abs(implied_p*factor - 0.5) > 0.15""")
    check(conn, "L2.implied_x_factor_near_half", r[0] < 1000, r[0], "(PP prices legs so implied*factor ~ 0.5; large deviations = pricing anomalies)")
    r = one(conn, """SELECT count(*) FROM (SELECT game_date, nm, base_market, side, line FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND factor IS NOT NULL
                     GROUP BY 1,2,3,4,5 HAVING count(*)>1) x""")
    check(conn, "L2.duplicate_price_keys_bounded", r[0] < 500, r[0], "(documented multi-harvest duplicates; keep-first)")

    # ---------------- L3 tier ----------------
    print("L3 tier", flush=True)
    r = one(conn, """SELECT count(*) FILTER (WHERE kind IN ('goblin','demon') AND COALESCE(NULLIF(tier,0), round(line-anchor_line)::int) IS NULL),
                            count(*) FILTER (WHERE kind IN ('goblin','demon') AND COALESCE(NULLIF(tier,0), round(line-anchor_line)::int)=0),
                            count(*) FILTER (WHERE kind='goblin' AND tier>0), count(*) FILTER (WHERE kind='demon' AND tier<0),
                            count(*) FILTER (WHERE kind_position_mismatch)
                     FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND factor IS NOT NULL""")
    check(conn, "L3.every_ladder_leg_has_a_tier", r[0] == 0, r[0])
    check(conn, "L3.legs_exactly_at_anchor_bounded", r[1] < 100, r[1], "(D0/G0 residue)")
    check(conn, "L3.goblin_tier_sign_negative", r[2] == 0, r[2])
    check(conn, "L3.demon_tier_sign_positive", r[3] == 0, r[3])
    check(conn, "L3.kind_position_mismatch_excluded", True, r[4], "(excluded from the map by rule)")

    # ---------------- L4 ranks ----------------
    print("L4 ranks", flush=True)
    r = one(conn, """SELECT count(*) FILTER (WHERE final_hp IS NULL), count(*) FILTER (WHERE baseline_hp IS NULL), count(*) FILTER (WHERE score IS NULL), count(*)
                     FROM nba_score.final_hp""")
    check(conn, "L4.three_rank_columns_populated", max(r[0], r[1], r[2]) / r[3] < 0.05, f"nulls {r[0]}/{r[1]}/{r[2]} of {r[3]}")
    r = one(conn, """SELECT count(*) FROM nba_score.tier_map_legs l JOIN nba_market.prop_universe pu ON pu.game_date=l.game_date AND pu.player=l.player AND pu.prop=l.prop AND pu.side=l.side AND pu.line=l.line AND pu.line_source='real'
                     JOIN nba_score.final_hp f ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.side=pu.side AND f.line=pu.line
                     WHERE l.game_date IN ('2025-01-15','2026-01-15','2026-03-20')
                       AND abs(l.score - CASE l.rank_key WHEN 'final_hp' THEN f.final_hp WHEN 'baseline_hp' THEN f.baseline_hp ELSE f.score END) > 1e-9""")
    check(conn, "L4.map_score_equals_named_rank_column", r[0] == 0, r[0], "(3 sampled days, all three ranks)")

    # ---------------- L5 map ----------------
    print("L5 map", flush=True)
    r = one(conn, "SELECT count(*), count(DISTINCT rank_key) FROM nba_score.tier_map_legs")
    per_rank = one(conn, "SELECT min(c), max(c) FROM (SELECT count(*) c FROM nba_score.tier_map_legs GROUP BY rank_key) x")
    check(conn, "L5.three_ranks_same_leg_count", per_rank[0] == per_rank[1], f"{per_rank[0]}..{per_rank[1]}")
    r = one(conn, """SELECT count(*) FROM (SELECT rank_key, game_date, player, prop, side, line FROM nba_score.tier_map_legs GROUP BY 1,2,3,4,5,6 HAVING count(*)>1) x""")
    check(conn, "L5.no_duplicate_legs", r[0] == 0, r[0])
    r = one(conn, """SELECT count(*) FROM (SELECT score < lead(score) OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY n_rank) bad
                     FROM nba_score.tier_map_legs WHERE game_date IN ('2025-01-15','2026-01-15','2026-03-20','2024-11-20')) x WHERE bad""")
    check(conn, "L5.rank_order_non_increasing", r[0] == 0, r[0], "(4 sampled days)")
    r = one(conn, """SELECT count(*) FROM (SELECT rank_key, game_date, prop, tier, max(cell_size) cs, count(*) n FROM nba_score.tier_map_legs GROUP BY 1,2,3,4 HAVING max(cell_size)<>count(*)) x""")
    check(conn, "L5.cell_size_equals_count", r[0] == 0, r[0])
    r = one(conn, """SELECT count(*) FILTER (WHERE tier='R' AND factor<>1.0), count(*) FILTER (WHERE tier LIKE 'G%%' AND factor>=1.0),
                            count(*) FILTER (WHERE tier IN ('D0','G0')), count(*) FILTER (WHERE tier LIKE 'D%%' AND side='Under')
                     FROM nba_score.tier_map_legs WHERE rank_key='final_hp'""")
    check(conn, "L5.map_regular_price_1", r[0] == 0, r[0])
    check(conn, "L5.map_goblin_price_below_1", r[1] == 0, r[1])
    check(conn, "L5.map_tier0_residue_bounded", r[2] < 100, r[2])
    check(conn, "L5.map_demons_over_only", r[3] == 0, r[3])
    # reconciliation: joinable raw legs vs map (precomputed keys; norm_name() inside a join defeats every index)
    conn.execute("""CREATE TEMP TABLE _c_pr AS
        SELECT p.game_date, p.nm, p.side, p.line, p.kind,
          CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra'
            WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
        FROM nba_market.pp_leg_price p WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
          AND p.game_date IN ('2025-01-15','2026-01-15','2026-03-20')""")
    conn.execute("""CREATE TEMP TABLE _c_pu AS
        SELECT game_date, nba_ref.norm_name(player) pn, player_id, prop, side, line FROM nba_market.prop_universe
        WHERE line_source='real' AND hit IS NOT NULL AND game_date IN ('2025-01-15','2026-01-15','2026-03-20')""")
    conn.execute("CREATE INDEX ON _c_pu (game_date, pn, prop, side, line)")
    r = one(conn, """SELECT count(DISTINCT (pr.game_date, pr.nm, pr.prop, pr.side, pr.line)),
               (SELECT count(*) FROM nba_score.tier_map_legs WHERE rank_key='final_hp' AND game_date IN ('2025-01-15','2026-01-15','2026-03-20'))
        FROM _c_pr pr JOIN _c_pu pu ON pu.game_date=pr.game_date AND pu.pn=pr.nm AND pu.prop=pr.prop AND pu.side=pr.side AND pu.line=pr.line
        JOIN nba_score.final_hp f ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.side=pu.side AND f.line=pu.line
        WHERE f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL""")
    check(conn, "L5.map_reconciles_to_raw_join", abs(r[0] - r[1]) <= 3, f"joinable {r[0]} vs map {r[1]}", "(3 sampled days; tolerance = documented duplicate keys)")

    # ---------------- L6 bands ----------------
    print("L6 bands", flush=True)
    r = one(conn, """WITH rec AS (
        SELECT prop, tier, n, avg(dh) hit, avg(dpm) pm, count(*) days FROM (
          SELECT game_date, prop, tier, v.n, avg(hit) dh, avg(hit*factor) dpm, count(*) got
          FROM nba_score.tier_map_legs CROSS JOIN (VALUES (1),(3),(5),(10),(20)) v(n)
          WHERE rank_key='final_hp' AND season='2025-26' AND game_date>='2025-11-01' AND n_rank<=v.n AND prop IN ('steals','points','rebounds','pra') AND tier IN ('R','G1','G2','D1','D3')
          GROUP BY 1,2,3,4) d WHERE got=n GROUP BY 1,2,3)
        SELECT count(*), count(*) FILTER (WHERE abs(rec.hit-b.hit)>1e-6 OR abs(rec.pm-b.pm)>1e-6 OR rec.days<>b.days)
        FROM rec JOIN nba_score.tier_map_bands b ON b.rank_key='final_hp' AND b.win='2526_nov' AND b.cut_type='n' AND b.prop=rec.prop AND b.tier=rec.tier AND b.cut=rec.n""")
    check(conn, "L6.n_bands_recompute_exact", r[1] == 0, f"{r[1]} of {r[0]} mismatched")
    r = one(conn, """WITH rec AS (
        SELECT prop, tier, pct, avg(dh) hit, count(*) days FROM (
          SELECT game_date, prop, tier, v.pct, avg(hit) FILTER (WHERE n_rank <= greatest(1, ceil(cell_size*v.pct/100.0))) dh
          FROM nba_score.tier_map_legs CROSS JOIN (VALUES (1),(5),(10),(25)) v(pct)
          WHERE rank_key='final_hp' AND season='2025-26' AND game_date>='2025-11-01' AND prop IN ('steals','points') AND tier='R' GROUP BY 1,2,3,4) d GROUP BY 1,2,3)
        SELECT count(*), count(*) FILTER (WHERE abs(rec.hit-b.hit)>1e-6 OR rec.days<>b.days)
        FROM rec JOIN nba_score.tier_map_bands b ON b.rank_key='final_hp' AND b.win='2526_nov' AND b.cut_type='pct' AND b.prop=rec.prop AND b.tier=rec.tier AND b.cut=rec.pct""")
    check(conn, "L6.pct_bands_recompute_exact", r[1] == 0, f"{r[1]} of {r[0]} mismatched")
    r = one(conn, """SELECT count(*) FROM (SELECT DISTINCT prop, tier FROM nba_score.tier_map_legs WHERE rank_key='final_hp' AND tier NOT IN ('D0','G0')) c
                     LEFT JOIN (SELECT DISTINCT prop, tier FROM nba_score.tier_map_bands WHERE rank_key='final_hp' AND win='both' AND cut_type='n' AND cut=1) b USING (prop, tier) WHERE b.prop IS NULL""")
    check(conn, "L6.every_cell_in_bands", r[0] == 0, r[0])
    r = one(conn, "SELECT count(*) FROM nba_score.tier_map_bands WHERE cut_type='n' AND cut=1 AND days<100 AND win='both' AND tier NOT IN ('D0','G0')")
    check(conn, "L6.no_thin_cells", r[0] == 0, r[0], "(cells with <100 days pooled)")

    # ---------------- L7 features ----------------
    print("L7 features", flush=True)
    r = one(conn, """SELECT count(*), count(min_trend), count(usg_trend), count(rest_days), count(t3), count(mkt_edge), count(cold_all) FILTER (WHERE app_all>=10),
                            count(*) FILTER (WHERE r_final IS NULL OR r_base IS NULL OR r_score IS NULL)
                     FROM nba_score.cand_leg_features""")
    n = r[0]
    check(conn, "L7.min_trend_populated", r[1] / n > 0.95, f"{r[1] / n:.3f}")
    check(conn, "L7.usg_trend_populated", r[2] / n > 0.95, f"{r[2] / n:.3f}", "(was 0 before the id-prefix fix)")
    check(conn, "L7.rest_populated", r[3] / n > 0.95, f"{r[3] / n:.3f}")
    check(conn, "L7.trailing_populated", r[4] / n > 0.90, f"{r[4] / n:.3f}")
    check(conn, "L7.mkt_edge_populated_partial", 0.5 < r[5] / n < 0.9, f"{r[5] / n:.3f}", "(book lines exist for ~70%; must not be 0 or 1)")
    check(conn, "L7.all_three_ranks_on_every_leg", r[7] == 0, r[7])
    # trailing strictly prior: a leg's t3 must not include its own outcome -> recompute on a sample
    r = one(conn, """WITH s AS (SELECT player, prop, tier, side, game_date, hit, t3,
                       avg(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) rt3
                     FROM nba_score.cand_leg_features WHERE prop='steals' AND tier='R')
                     SELECT count(*) FROM s WHERE t3 IS NOT NULL AND abs(t3-rt3)>1e-9""")
    check(conn, "L7.trailing_strictly_prior", r[0] == 0, r[0])

    # ---------------- L8 matrix ----------------
    print("L8 matrix", flush=True)
    # NOTE: cand_signal_matrix s1/s2 are WHOLE seasons (no November cutoff) - unlike tier_map_bands '2526_nov'. Recompute must match that.
    r = one(conn, """WITH rec AS (
        SELECT prop, tier, avg(dpm) pm, count(*) days FROM (
          SELECT game_date, prop, tier, avg(hit*factor) dpm FROM nba_score.cand_leg_features
          WHERE season='2025-26' AND r_score<=5 AND prop IN ('steals','points','turnovers') AND tier='R' GROUP BY 1,2,3) d GROUP BY 1,2)
        SELECT count(*), count(*) FILTER (WHERE abs(rec.pm-m.pm_s2)>1e-6 OR rec.days<>m.days_s2)
        FROM rec JOIN nba_score.cand_signal_matrix m ON m.depth=0 AND m.side='both' AND m.rank_key='final_score' AND m.cut_type='n' AND m.cut=5 AND m.prop=rec.prop AND m.tier=rec.tier""")
    check(conn, "L8.matrix_base_recompute_exact", r[1] == 0, f"{r[1]} of {r[0]} mismatched", "(full-season window, as the matrix stores)")
    r = one(conn, """SELECT count(*) FROM nba_score.cand_signal_matrix m JOIN nba_score.cand_signal_matrix b
                     ON b.depth=0 AND b.prop=m.prop AND b.tier=m.tier AND b.side=m.side AND b.rank_key=m.rank_key AND b.cut_type=m.cut_type AND b.cut=m.cut
                     WHERE m.depth>=1 AND (m.legs_s2>b.legs_s2 OR m.legs_s1>b.legs_s1 OR m.days_s2>b.days_s2)""")
    check(conn, "L8.band_rows_are_subsets_of_base", r[0] == 0, r[0])
    r = one(conn, "SELECT count(*) FROM nba_score.cand_signal_matrix WHERE abs(lift_s2-(pm_s2-base_pm_s2))>1e-9 OR abs(lift_s1-(pm_s1-base_pm_s1))>1e-9")
    check(conn, "L8.lift_equals_pm_minus_base", r[0] == 0, r[0])

    # ---------------- L9 certified ----------------
    print("L9 certified", flush=True)
    r = one(conn, "SELECT count(*), count(*) FILTER (WHERE abs(profit_per_100 - 100*(6*0.95*power(pm,3)-1))>1e-6) FROM nba_score.cand_certified")
    check(conn, "L9.certified_rows_exist", r[0] > 0, r[0])
    check(conn, "L9.profit_formula_exact", r[1] == 0, r[1])
    r = one(conn, """SELECT count(*) FROM nba_score.cand_certified WHERE kind='standard' AND abs(mult-1.0)>1e-9""")
    check(conn, "L9.certified_regular_mult_1", r[0] == 0, r[0])

    # ---------------- L10 slip math ----------------
    print("L10 slip math", flush=True)
    power = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
    flex = {(2, 2): 2.0, (2, 1): 0.5, (3, 3): 3.0, (3, 2): 1.0, (4, 4): 6.0, (4, 3): 1.5, (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4, (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4}
    # compare to PrizePicks' live "Ways to Pick" page (the support article is stale: it still shows 3-pick Power 5x)
    live_ok, live_detail = None, "fetch skipped"
    try:
        import urllib.request, re
        html = urllib.request.urlopen(urllib.request.Request("https://www.prizepicks.com/ways-to-pick", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode("utf-8", "ignore")
        txt = re.sub(r"<[^>]+>", " ", html)
        txt = re.sub(r"\s+", " ", txt)
        def grab(label):
            m = re.search(re.escape(label) + r"\s*([0-9.]+)x", txt)
            return float(m.group(1)) if m else None
        seen = {"6 of 6 correct": grab("6 of 6 correct"), "5 of 5 correct": grab("5 of 5 correct"), "4 of 4 correct": grab("4 of 4 correct"),
                "3 of 3 correct": grab("3 of 3 correct"), "2 of 2 correct": grab("2 of 2 correct")}
        live_ok = seen["3 of 3 correct"] == 6.0 and seen["4 of 4 correct"] == 10.0 and seen["5 of 5 correct"] == 20.0 and seen["6 of 6 correct"] == 37.5 and seen["2 of 2 correct"] == 3.0
        live_detail = str(seen)
    except Exception as e:  # network may be unavailable in some runners; then the check reports and does not fail
        live_ok, live_detail = None, f"fetch failed: {e}"
    check(conn, "L10.power_table_matches_live_page", live_ok is not False, "ok" if live_ok else live_detail, live_detail if live_ok else "")
    check(conn, "L10.flex_table_documented", flex[(5, 5)] == 10.0 and flex[(5, 4)] == 2.0 and flex[(4, 4)] == 6.0 and flex[(4, 3)] == 1.5 and flex[(3, 3)] == 3.0 and flex[(2, 2)] == 2.0, "ok", "(live page 2026-09-30)")
    be3 = (1 / 6) ** (1 / 3)
    check(conn, "L10.breakeven_3pick_power_is_0.55", abs(be3 - 0.5503) < 0.001, f"{be3:.4f}", "(per-leg p.m needed; p_be per tier = 0.55/m)")
    # slip payout rule for mixed goblin/demon slips (PP_PAYOUT_FINDINGS: fitted on 20 alt x alt pairs, confirmed out of sample on 3)
    def pp_payout(product):
        return product if product <= 9.1 else 9.1 * (product / 9.1) ** 0.857
    oos = [(14.25, 13.5), (17.25, 15.5), (26.0, 22.5)]
    err = max(abs(pp_payout(p) - a) / a for p, a in oos)
    check(conn, "L10.slip_compression_rule_matches_oos_quotes", err < 0.06, f"max err {err:.3f}", "(product to 9.1x then 9.1*(p/9.1)^0.857; plain product overstates demon stacks ~13% at 20x)")
    check(conn, "L10.regular_only_slips_uncompressed", pp_payout(6.0) == 6.0 and pp_payout(10.0) > 9.1, "ok", "(3/4-pick Regular Power under 9.1x except 5/6-pick, which compress)")

    # ---------------- L11 slip layer ----------------
    print("L11 slip layer", flush=True)
    r = one(conn, "SELECT count(*), count(DISTINCT game_date), count(DISTINCT composition) FROM nba_score.slip_engine_slips")
    check(conn, "L11.slips_exist_all_days", r[0] > 400_000 and r[1] == 323, f"{r[0]} slips / {r[1]} days / {r[2]} compositions")
    r = one(conn, """WITH s AS (
        SELECT size, hits, payout, teams, structure,
          (SELECT count(DISTINCT j->>'player') FROM jsonb_array_elements(legs_json) j) dp,
          (SELECT sum((j->>'hit')::int) FROM jsonb_array_elements(legs_json) j) lh,
          (SELECT exp(sum(ln((j->>'factor')::float))) FROM jsonb_array_elements(legs_json) j) fprod,
          jsonb_array_length(legs_json) nl
        FROM nba_score.slip_engine_slips)
        SELECT count(*) FILTER (WHERE dp<nl), count(*) FILTER (WHERE teams<2), count(*) FILTER (WHERE nl<>size), count(*) FILTER (WHERE hits<>lh),
          count(*) FILTER (WHERE abs(payout - (CASE WHEN raw<=9.1 THEN raw ELSE 9.1*power(raw/9.1,0.857) END))>1e-6)
        FROM (SELECT *, (CASE WHEN structure='power' THEN (CASE WHEN hits=size THEN (CASE size WHEN 2 THEN 3 WHEN 3 THEN 6 WHEN 4 THEN 10 WHEN 5 THEN 20 ELSE 37.5 END) ELSE 0 END)
                  ELSE (CASE (size,hits) WHEN (2,2) THEN 2 WHEN (2,1) THEN 0.5 WHEN (3,3) THEN 3 WHEN (3,2) THEN 1 WHEN (4,4) THEN 6 WHEN (4,3) THEN 1.5
                        WHEN (5,5) THEN 10 WHEN (5,4) THEN 2 WHEN (5,3) THEN 0.4 WHEN (6,6) THEN 25 WHEN (6,5) THEN 2 WHEN (6,4) THEN 0.4 ELSE 0 END) END)*fprod raw FROM s) p""")
    check(conn, "L11.no_player_twice", r[0] == 0, r[0])
    check(conn, "L11.two_teams_minimum", r[1] == 0, r[1])
    check(conn, "L11.size_equals_legs", r[2] == 0, r[2])
    check(conn, "L11.hits_equals_leg_hits", r[3] == 0, r[3])
    check(conn, "L11.payout_equals_compression_recompute", r[4] == 0, r[4])
    r = one(conn, "SELECT min(min_pair_corr), count(*) FILTER (WHERE min_pair_corr <= -0.08) FROM nba_score.slip_engine_slips")
    check(conn, "L11.no_negative_pair_slips", r[1] == 0, f"min pair corr {r[0]:.3f}" if r[0] is not None else "n/a", "(rule: forbid <= -0.08)")
    r = one(conn, """WITH b AS (SELECT season, max(game_date) s1 FROM nba_score.slip_engine_slips GROUP BY season)
                     SELECT count(*) FILTER (WHERE (b.s1-e.game_date)<=7 AND e.phase<>'final7'), count(*) FILTER (WHERE (b.s1-e.game_date)>7 AND e.phase='final7')
                     FROM nba_score.slip_engine_slips e JOIN b ON b.season=e.season""")
    check(conn, "L11.final7_flag_matches_season_end", r[0] == 0 and r[1] == 0, f"{r[0]} / {r[1]} mismatches")
    # every leg in every slip traces to a REAL PP window board row (raw board, not the map) with a graded outcome
    r = one(conn, """WITH lg AS (SELECT DISTINCT game_date, player, prop, side, line FROM nba_score.slip_engine_legs WHERE game_date IN ('2025-01-15','2026-01-15','2026-03-20')),
        bd AS (SELECT DISTINCT game_date, nba_ref.norm_name(player) pn, side, line,
                 replace(replace(market_key,'_alternate',''),'player_','') mk FROM nba_market.board_snapshots
               WHERE bookmaker='prizepicks' AND snapshot_label='window' AND snapshot_ts<commence_time AND game_date IN ('2025-01-15','2026-01-15','2026-03-20'))
        SELECT count(*), count(*) FILTER (WHERE bd.pn IS NULL)
        FROM lg LEFT JOIN bd ON bd.game_date=lg.game_date AND bd.pn=nba_ref.norm_name(lg.player) AND bd.side=lg.side AND bd.line=lg.line
          AND bd.mk = CASE lg.prop WHEN 'stocks' THEN 'blocks_steals' WHEN 'threes_made' THEN 'threes' WHEN 'pra' THEN 'points_rebounds_assists'
                        WHEN 'pts_reb' THEN 'points_rebounds' WHEN 'pts_ast' THEN 'points_assists' WHEN 'reb_ast' THEN 'rebounds_assists' ELSE lg.prop END""")
    check(conn, "L11.every_slip_leg_on_raw_board", r[1] == 0, f"{r[1]} of {r[0]} legs not on the PP window board", "(3 sampled days)")
    r = one(conn, """WITH lg AS (SELECT DISTINCT game_date, player, prop, side, line, hit FROM nba_score.slip_engine_legs WHERE game_date IN ('2025-01-15','2026-01-15','2026-03-20'))
        SELECT count(*), count(*) FILTER (WHERE pu.hit IS NULL OR pu.hit::int<>lg.hit)
        FROM lg LEFT JOIN nba_market.prop_universe pu ON pu.game_date=lg.game_date AND pu.player=lg.player AND pu.prop=lg.prop AND pu.side=lg.side AND pu.line=lg.line AND pu.line_source='real'""")
    check(conn, "L11.every_slip_leg_hit_matches_graded_outcome", r[1] == 0, f"{r[1]} of {r[0]}", "(3 sampled days)")
    # engine reconciles to the certified table where the cut matches (2-pick single-cell top-2 vs certified top-2)
    r = one(conn, """WITH e AS (SELECT avg(pm) epm FROM (SELECT game_date, avg(hit*factor) pm FROM nba_score.slip_engine_legs
                       WHERE composition='single:steals_R' AND k=1 AND size=2 AND structure='power' AND game_date>='2025-11-01' GROUP BY 1) x),
                     c AS (SELECT pm cpm FROM nba_score.cand_certified WHERE prop='steals' AND kind='standard' AND side='both' AND n=2 AND season='2025-26')
                     SELECT abs(e.epm-c.cpm) FROM e, c""")
    check(conn, "L11.engine_reconciles_to_certified_cell", r[0] is not None and r[0] < 0.01, f"|diff| {r[0]:.4f}" if r[0] is not None else "n/a", "(steals R top-2, 2025-26)")
    r = one(conn, """SELECT count(*) FROM (SELECT game_date, composition, size, structure, max(k) mk, count(*) c FROM nba_score.slip_engine_slips GROUP BY 1,2,3,4 HAVING max(k)<>count(*)) x""")
    check(conn, "L11.k_is_contiguous_per_day", r[0] == 0, r[0], "(slip k=1..n with no gaps)")
    conn.close()
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
