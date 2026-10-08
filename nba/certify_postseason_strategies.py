#!/usr/bin/env python3
"""
POSTSEASON STRATEGY CERTIFICATION (strategy §31w principle 4 / P-5, 2026-10-08).

A live strategy stakes on a play-in / playoff slate only if it passes, on POSTSEASON nights, the same day-blocked bootstrap test
the paper gate and P5 apply (live_slip_engine.boot_lo: 10,000 resamples of whole days, 2.5% lower bound on ROI > 0). Otherwise
it records shadow slips only. The slips are the postseason backtest built by the certified engine over the postseason tier map
(nba_score.slip_engine_slips_post / _post_nosteals: build_slip_engine.py with SE_LEGS_TABLE=nba_score.tier_map_legs_post,
SE_LEGS_SELF=1, SE_PHASE=postseason) - the same cells, compositions, validity rules, correlation map (regular-season, the
large sample) and payout grading as the regular-season certification.

THE BAR (conservative, the owner's rule for the postseason: "weigh properly against the regular season"):
  - postseason slates are 1-4 games, so the live engine's small-slate rule (29n) builds every strategy at cap 1 - the
    verdict is measured at k = 1 (the slip the engine would actually stake);
  - PASS needs ALL of: >= min_days postseason slate days with a slip; pooled day-blocked lower bound > 0; ROI > 0 in EACH
    postseason separately (one good postseason is not evidence); the strategy's regular-season status is not 'retired' (cap 0).
  - everything else -> SHADOW (built and graded, never staked).
Also derives the postseason BOARD FLOOR (§31j's rule, postseason domain): the smallest postseason board (unique half-point
scored PrizePicks legs) in the validated postseason history - stored in classification_config['postseason_board_floor'].
Tunables: classification_config['postseason_strategy_gate'] {min_days, k}. Output: nba_score.postseason_strategy_verdict.
Env: DATABASE_URL, LS_BOOT (10000).
"""
import json
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as LS  # noqa: E402  (ONE strategy list, ONE bootstrap)

DEFAULT_GATE = {"min_days": 30, "k": 1,
                "note": "§31w postseason strategy gate: k = the cap the small-slate rule imposes; PASS = pooled day-blocked 2.5% lower bound > 0, "
                        "ROI > 0 in each postseason, >= min_days slate days, not retired"}


def cfg(conn, key, default):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key=%s", (key,)).fetchone()
    if r:
        return r[0] if isinstance(r[0], dict) else json.loads(r[0])
    conn.execute("INSERT INTO nba_config.classification_config (config_key, config_json) VALUES (%s, %s) ON CONFLICT (config_key) DO NOTHING",
                 (key, json.dumps(default)))
    conn.commit()
    return default


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    g = cfg(conn, 'postseason_strategy_gate', DEFAULT_GATE)
    min_days, kmax = int(g.get('min_days', 30)), int(g.get('k', 1))
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.postseason_strategy_verdict (
        strategy text PRIMARY KEY, composition text, size int, structure text, k int, source text,
        days int, slips int, roi double precision, roi_s1 double precision, roi_s2 double precision, boot_lo double precision,
        verdict text, reason text, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.postseason_strategy_verdict")
    seasons = [r[0] for r in conn.execute("SELECT DISTINCT season FROM nba_score.slip_engine_slips_post ORDER BY 1").fetchall()]
    print(f"postseason backtest seasons: {seasons} | gate k<={kmax}, min_days {min_days}", flush=True)
    print(f"{'strategy':<20}{'days':>5}{'slips':>6}{'ROI':>8}" + "".join(f"{s:>9}" for s in seasons) + f"{'CI lo':>8}   verdict", flush=True)
    for name, (comp, size, structure, cap, *_r) in LS.STRATEGIES.items():
        if name in LS.ALLSTAR_ONLY:
            continue
        nosteals = name.startswith(('C_', 'D_', 'R_', 'W_'))
        table = f"nba_score.slip_engine_slips_post{'_nosteals' if nosteals else ''}"
        rows = conn.execute(f"""SELECT season, game_date, sum(stake), sum(payout) FROM {table}
                                WHERE composition=%s AND size=%s AND structure=%s AND k<=%s GROUP BY 1,2""",
                            (comp, size, structure, kmax)).fetchall()
        by_season = defaultdict(list)
        items = []
        for season, d, st, pay in rows:
            items.append((float(st), float(pay)))
            by_season[season].append((float(st), float(pay)))
        n_slips = sum(int(round(a)) for a, _ in items)
        roi = (sum(b for _, b in items) / sum(a for a, _ in items) - 1) if items else None
        rs = {s: ((sum(b for _, b in v) / sum(a for a, _ in v) - 1) if v else None) for s, v in by_season.items()}
        lo = LS.boot_lo(items, draws=LS.BOOT_DRAWS) if items else None
        if cap == 0:
            verdict, reason = 'SHADOW', 'retired in the regular season (cap 0)'
        elif len(items) < min_days:
            verdict, reason = 'SHADOW', f'too few postseason slate days ({len(items)} < {min_days})'
        elif lo is None or lo <= 0:
            verdict, reason = 'SHADOW', 'pooled day-blocked lower bound not > 0'
        elif any(rs.get(s) is None or rs[s] <= 0 for s in seasons):
            verdict, reason = 'SHADOW', 'not positive in every postseason'
        else:
            verdict, reason = 'PASS', 'stakes on postseason slates (cap 1)'
        conn.execute("""INSERT INTO nba_score.postseason_strategy_verdict (strategy, composition, size, structure, k, source, days, slips, roi,
                        roi_s1, roi_s2, boot_lo, verdict, reason) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                     (name, comp, size, structure, kmax, table, len(items), n_slips, roi,
                      rs.get(seasons[0]) if seasons else None, rs.get(seasons[1]) if len(seasons) > 1 else None, lo, verdict, reason))
        f = lambda x: '' if x is None else f"{100 * x:+.0f}%"   # noqa: E731
        print(f"{name:<20}{len(items):>5}{n_slips:>6}{f(roi):>8}" + "".join(f"{f(rs.get(s)):>9}" for s in seasons) + f"{f(lo):>8}   {verdict} - {reason}",
              flush=True)
    # postseason board floor: the smallest validated postseason board, in the live guard's unit (unique half-point scored legs)
    sizes = [r[0] for r in conn.execute("""SELECT count(DISTINCT (player_id, prop, tier, side, line)) FROM nba_score.tier_map_legs_post
                                           WHERE rank_key='final_hp' AND line <> floor(line) GROUP BY game_date ORDER BY 1""").fetchall()]
    if sizes:
        floor_ = int(sizes[0])
        conn.execute("""INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('postseason_board_floor', %s)
                        ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json""",
                     (json.dumps({"min_board_legs": floor_, "p10": int(sizes[len(sizes) // 10]), "median": int(sizes[len(sizes) // 2]),
                                  "days": len(sizes), "note": "§31w: smallest validated postseason board (unique half-point scored PP legs); "
                                  "below it the live engine places nothing on a postseason slate (the §31j rule in the postseason domain)"}),))
        print(f"\npostseason board floor: min {floor_} | p10 {sizes[len(sizes) // 10]} | median {sizes[len(sizes) // 2]} over {len(sizes)} days", flush=True)
    conn.commit()
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
