#!/usr/bin/env python3
"""
UNDERDOG SLIP VALIDATION (strategy doc §30q) - PrizePicks' falsification battery (validate_slip_strategies.py, §26-27)
applied to the Underdog strategies, with Underdog's payout formula and rule set, plus one test PrizePicks did not need.

Input: nba_score.ud_slip_engine_slips_center (the adopted rule set: one pick per game, centers excluded), sizes 2-6,
       with the calendar stand-downs applied (pre-All-Star week and final week removed, §30p). Cap 1 (fixed before OOS).
  V1  WALK-FORWARD: rank every strategy on 2024-25 ONLY (ROI, >= 40 days, ROI > 0), take the top K, score on 2025-26.
  V1R REVERSE WALK-FORWARD (Underdog-specific): select on 2025-26 only, score on 2024-25. The two Underdog seasons are
      different products (2024-25 flat-priced mains with few priced lines; 2025-26 per-line pricing), so the edge must
      survive selection in either direction.
  V2  DAY-BLOCKED BOOTSTRAP CI (10,000 resamples of whole days) on the OOS ROI; 95% lower bound <= 0 -> reject.
  V3  EMPIRICAL NULL: every slip leg redrawn as Bernoulli at its TIER's whole-board hit rate (ud_tier_map_legs, final-HP
      rows: R ~0.50, favoured tiers higher, boosted lower - "selection carries no information"), full regrade with
      Underdog's formula, the same V1 selection + V2 test; expected false survivors vs the real count.
  V4  MONOTONICITY: OOS slips in 5 equal-volume bins by summed certified edge; ROI should rise with edge.
  V5  DECOMPOSITION: OOS profit by leg cell; flag one cell carrying > 60% of profit.
  (V6 teammate ban is not applicable: Underdog slips are one pick per game.)
Output: nba_score.ud_slip_validation. Env: DATABASE_URL, SV_TOPK (30), SV_BOOT (10000), SV_NULL (200), SV_SOURCE.
"""
import os
import json
import random
from collections import defaultdict

import psycopg

TOPK = int(os.environ.get('SV_TOPK') or '30')
BOOT = int(os.environ.get('SV_BOOT') or '10000')
NULLS = int(os.environ.get('SV_NULL') or '200')
SOURCE = os.environ.get('SV_SOURCE') or 'nba_score.ud_slip_engine_slips_center'
T_VAL = 'nba_score.ud_slip_validation'
S1, S2 = '2024-25', '2025-26'
STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 6.0, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
CELL_EDGE = {'turnovers_R': 0.638, 'reb_ast_B1_U': 0.612, 'rebounds_F2_U': 0.594, 'rebounds_R': 0.593, 'assists_R_U': 0.592,
             'blocks_R': 0.591, 'points_R_U': 0.590, 'reb_ast_R_O': 0.586, 'threes_R': 0.578, 'rebounds_B1_U': 0.576,
             'stocks_R_U': 0.566, 'pts_ast_R_O': 0.562, 'pts_reb_R_U': 0.561, 'pra_R_U': 0.559}


def load(conn):
    rows = conn.execute(f"""
        WITH dates AS (SELECT DISTINCT season, game_date FROM {SOURCE}),
        gaps AS (SELECT season, game_date d, lead(game_date) OVER (PARTITION BY season ORDER BY game_date) nxt FROM dates),
        asb AS (SELECT DISTINCT ON (season) season, d lb FROM gaps WHERE extract(month FROM d)=2 ORDER BY season, (nxt-d) DESC)
        SELECT s.game_date, s.season, s.composition, s.size, s.structure, s.profit, s.hits, s.legs_json
        FROM {SOURCE} s JOIN asb USING (season)
        WHERE s.k <= 1 AND s.size <= 6 AND s.phase <> 'final7' AND NOT (s.game_date BETWEEN asb.lb - 6 AND asb.lb)""").fetchall()
    strat = defaultdict(lambda: defaultdict(list))
    for d, season, comp, size, structure, profit, hits, legs in rows:
        strat[(comp, size, structure)][(season, d)].append((profit, hits, legs))
    return strat


def season_stats(days, season):
    items = [(sum(p for p, _, _ in v), len(v)) for (s, d), v in days.items() if s == season]
    if not items:
        return None
    n = sum(c for _, c in items); net = sum(p for p, _ in items)
    top5 = sum(sorted((p for p, _ in items), reverse=True)[:5])
    return {'days': len(items), 'slips': n, 'net': net, 'roi': net / n, 'conc': (top5 / net if net > 0 else 1.0), 'day_items': items}


def select(strat, season):
    ranked = []
    for key, days in strat.items():
        s = season_stats(days, season)
        if s and s['days'] >= 40 and s['roi'] > 0:
            ranked.append((s['roi'], key))
    ranked.sort(reverse=True)
    return [k for _, k in ranked[:TOPK]]


def boot_ci(day_items, draws, rng):
    n = len(day_items); out = []
    for _ in range(draws):
        net = slips = 0.0
        for _ in range(n):
            p, c = day_items[rng.randrange(n)]
            net += p; slips += c
        out.append(net / slips)
    out.sort()
    return out[int(0.025 * draws)], out[int(0.5 * draws)], out[int(0.975 * draws)]


def monotonicity(days, season):
    slips = []
    for (s, d), v in days.items():
        if s != season:
            continue
        for profit, hits, legs in v:
            ll = json.loads(legs) if isinstance(legs, str) else legs
            slips.append((sum(CELL_EDGE.get(l.get('cell'), 0.55) for l in ll) / len(ll), profit))
    if len(slips) < 100:
        return None
    slips.sort(); n = len(slips)
    bins = [slips[i * n // 5:(i + 1) * n // 5] for i in range(5)]
    rois = [sum(p for _, p in b) / len(b) for b in bins if b]
    return {'bin_roi': [round(r, 2) for r in rois], 'inversions': sum(1 for i in range(1, len(rois)) if rois[i] < rois[i - 1])}


def decompose(days, season):
    by = defaultdict(float); tot = 0.0
    for (s, d), v in days.items():
        if s != season:
            continue
        for profit, hits, legs in v:
            ll = json.loads(legs) if isinstance(legs, str) else legs
            for l in ll:
                by[l['cell']] += profit / len(ll); tot += profit / len(ll)
    if tot <= 0 or not by:
        return None
    top = max(by.items(), key=lambda x: x[1])
    return {'top_cell': top[0], 'top_share': top[1] / tot, 'cells': {c: round(v, 1) for c, v in by.items()}}


def regrade(structure, size, legs, hitmap):
    h = [hitmap[i] for i, _ in legs]
    if structure == 'standard':
        if sum(h) < size:
            return -1.0
        p = STD[size]
        for _, f in legs:
            p *= f
        return p - 1.0
    base = FLEX.get((size, size - sum(h)), 0.0)
    if base == 0.0:
        return -1.0
    p = base
    for (i, f), hh in zip(legs, h):
        if hh:
            p *= f
    return p - 1.0


def run_direction(conn, strat, sel_season, oos_season, label, rng):
    selected = select(strat, sel_season)
    results = []
    for key in selected:
        days = strat[key]
        a = season_stats(days, sel_season); b = season_stats(days, oos_season)
        if not b or b['days'] < 40:
            continue
        lo, med, hi = boot_ci(b['day_items'], BOOT, rng)
        dec = decompose(days, oos_season); mono = monotonicity(days, oos_season)
        results.append((key, a, b, lo, med, hi, dec, mono))
        conn.execute(f"""INSERT INTO {T_VAL} (direction, composition, size, structure, sel_roi, sel_days, oos_roi, oos_days, oos_slips, oos_net,
            oos_conc, ci_lo, ci_med, ci_hi, top_cell, top_cell_share, decomposition, mono_bins, mono_inversions, v2_pass)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (label, key[0], key[1], key[2], a['roi'], a['days'], b['roi'], b['days'], b['slips'], b['net'], b['conc'], lo, med, hi,
             dec['top_cell'] if dec else None, dec['top_share'] if dec else None, json.dumps(dec['cells']) if dec else None,
             json.dumps(mono['bin_roi']) if mono else None, mono['inversions'] if mono else None, lo > 0))
    conn.commit()
    print(f"\n== {label}: selected on {sel_season} only (top {len(selected)}), scored on {oos_season}; CI = {BOOT:,} day-blocked bootstrap ==", flush=True)
    print(f"  {'strategy':<34} {'sel ROI':>8} {'OOS ROI':>8} {'CI lo':>7} {'CI hi':>7} {'days':>5} {'top5%':>6} {'top cell (share)':<26} V2  V4 bins inv", flush=True)
    passed = 0
    for key, a, b, lo, med, hi, dec, mono in sorted(results, key=lambda r: -r[3]):
        tc = f"{dec['top_cell']} ({dec['top_share']:.0%})" if dec else "-"
        mb = f"{mono['bin_roi']} {mono['inversions']}" if mono else "-"
        print(f"  {key[0]+' '+str(key[1])+' '+key[2]:<34} {a['roi']:>+8.0%} {b['roi']:>+8.0%} {lo:>+7.0%} {hi:>+7.0%} {b['days']:>5} {b['conc']:>6.0%} {tc:<26} {'Y' if lo > 0 else 'n'}   {mb}", flush=True)
        passed += 1 if lo > 0 else 0
    print(f"  {label} REAL survivors (OOS 95% lower bound > 0): {passed} of {len(results)}", flush=True)
    return passed


def null_test(conn, strat, sel_season, oos_season, rng, real):
    tier_rate = {r[0]: float(r[1]) for r in conn.execute("""SELECT tier, avg(hit) FROM nba_score.ud_tier_map_legs WHERE rank_key='final_hp' GROUP BY tier""").fetchall()}
    print(f"\n== V3 empirical null ({sel_season} -> {oos_season}): {NULLS} draws at whole-board tier rates {{{', '.join(f'{k}: {v:.3f}' for k, v in sorted(tier_rate.items()))}}}, full regrade ==", flush=True)
    day_legs = defaultdict(dict); defs = defaultdict(list)
    for key, days in strat.items():
        for sd, v in days.items():
            for profit, hits, legs in v:
                ll = json.loads(legs) if isinstance(legs, str) else legs
                ids = []
                for l in ll:
                    lid = (l['player'], l['prop'], l['side'], float(l['line']))
                    day_legs[sd][lid] = l.get('tier', 'R'); ids.append((lid, float(l['factor'])))
                defs[(key, sd)].append((key[2], key[1], ids))
    counts = []
    for it in range(NULLS):
        drawn = {sd: {lid: (1 if rng.random() < tier_rate.get(t, 0.5) else 0) for lid, t in legs.items()} for sd, legs in day_legs.items()}
        def st(key, season):
            items = []
            for (s, d) in strat[key]:
                if s != season:
                    continue
                dd = defs[(key, (s, d))]
                items.append((sum(regrade(a, b, ids, drawn[(s, d)]) for a, b, ids in dd), len(dd)))
            if not items:
                return None
            n = sum(c for _, c in items); net = sum(p for p, _ in items)
            return {'days': len(items), 'roi': net / n, 'day_items': items}
        ranked = []
        for key in strat:
            s = st(key, sel_season)
            if s and s['days'] >= 40 and s['roi'] > 0:
                ranked.append((s['roi'], key))
        ranked.sort(reverse=True)
        surv = 0
        for _, key in ranked[:TOPK]:
            s2 = st(key, oos_season)
            if s2 and s2['days'] >= 40 and boot_ci(s2['day_items'], 400, rng)[0] > 0:
                surv += 1
        counts.append(surv)
        if (it + 1) % 50 == 0:
            print(f"    {it+1}/{NULLS}: false survivors mean {sum(counts)/len(counts):.2f}, max {max(counts)}", flush=True)
    counts.sort(); p95 = counts[int(0.95 * len(counts))]
    print(f"  V3 RESULT: zero-edge null expects {sum(counts)/len(counts):.2f} survivors (95th pct {p95}); REAL = {real} -> "
          + ("the edge is NOT selection" if real > p95 else "selection CAN explain the survivors"), flush=True)
    return sum(counts) / len(counts), p95


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {T_VAL} (
        direction text, composition text, size int, structure text, sel_roi double precision, sel_days int,
        oos_roi double precision, oos_days int, oos_slips int, oos_net double precision, oos_conc double precision,
        ci_lo double precision, ci_med double precision, ci_hi double precision, top_cell text, top_cell_share double precision,
        decomposition jsonb, mono_bins jsonb, mono_inversions int, v2_pass boolean, built_at timestamptz DEFAULT now())""")
    conn.execute(f"DELETE FROM {T_VAL}"); conn.commit()
    rng = random.Random(7)
    strat = load(conn)
    print(f"  source {SOURCE}: {len(strat)} strategies (cap 1, sizes 2-6, pre-All-Star week and final week stood down)", flush=True)
    real_fwd = run_direction(conn, strat, S1, S2, 'V1 forward', rng)
    real_rev = run_direction(conn, strat, S2, S1, 'V1R reverse', rng)
    null_test(conn, strat, S1, S2, rng, real_fwd)
    null_test(conn, strat, S2, S1, rng, real_rev)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
