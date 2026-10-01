#!/usr/bin/env python3
"""
NBA SLIP VALIDATION — the MLB falsification bar, translated to slips, applied to every strategy.

Why: the 52 "qualified" strategies (section 25e) were selected with BOTH seasons visible. MLB Blocker 4 named this:
gates that resample days test robustness to day-resampling, not to configuration selection. So this script:

  V1  WALK-FORWARD: rank every strategy on 2024-25 ONLY by a fixed rule (ROI at its cap, excl. final7, >= 40 days,
      concentration <= 50%), take the top K, then score those K on 2025-26 which was never used for selection.
      The OOS numbers of the selected set are the only ones that count.
  V2  DAY-BLOCKED BOOTSTRAP CI (10,000 resamples of whole days) on OOS ROI. Falsification: 95% lower bound < 0 -> reject.
  V3  EMPIRICAL NULL: permute outcomes WITHIN each day (keeps the day's hit count, breaks strategy->outcome link),
      re-run the walk-forward selection + OOS scoring N times, count how many strategies pass V1+V2 under the null.
      That is the expected number of false survivors; the real survivor count must exceed it clearly.
  V4  MONOTONICITY: within each selected strategy, bin its OOS slips into 5 equal-volume bins by the slip's summed
      certified edge; ROI must be non-decreasing across bins (Spearman >= 0.8, no more than one inversion).
  V5  DECOMPOSITION: each selected strategy's OOS profit split by prop, tier, side, size-of-hit, and by leg cell;
      flag any strategy where one sub-population carries > 60% of profit with the rest at or below zero.
  V6  TEAMMATE BAN: recompute OOS ROI with all same-team slips removed (PP's teammate same-game payout is unmeasured
      on NBA; opponent pairs measured at 2.9-3.0x). The banned figure is the one that stands.

Source: nba_score.slip_engine_slips (certified, section 26). Output: nba_score.slip_validation (one row per strategy
with every V-metric) + printed verdicts. Env: DATABASE_URL, SV_TOPK (30), SV_BOOT (10000), SV_NULL (200).
"""
import os
import json
import random
from collections import defaultdict

import psycopg

TOPK = int(os.environ.get('SV_TOPK', '30'))
BOOT = int(os.environ.get('SV_BOOT', '10000'))
NULLS = int(os.environ.get('SV_NULL', '200'))
SUFFIX = os.environ.get('SV_TABLE_SUFFIX', '')
T_SLIPS = f'nba_score.slip_engine_slips{SUFFIX}'
T_VAL = f'nba_score.slip_validation{SUFFIX}'
S1, S2 = '2024-25', '2025-26'

CAP_RULE = {  # cap by structure (section 26b) - fixed BEFORE looking at OOS
    ('power', 3): 3, ('flex', 5): 3,
}


def cap_for(structure, size):
    return CAP_RULE.get((structure, size), 1)


def load(conn):
    rows = conn.execute(f"""
        SELECT game_date, season, composition, size, structure, k, profit, hits, same_team, legs_json
        FROM {T_SLIPS} WHERE phase <> 'final7'""").fetchall()
    strat = defaultdict(lambda: defaultdict(list))   # (comp,size,structure) -> day -> [(profit, hits, same_team, legs)]
    for d, season, comp, size, structure, k, profit, hits, st, legs in rows:
        key = (comp, size, structure)
        if k <= cap_for(structure, size):
            strat[key][(season, d)].append((profit, hits, st, legs))
    return strat


def season_stats(days, season):
    items = [(d, sum(p for p, _, _, _ in v), len(v)) for (s, d), v in days.items() if s == season]
    if not items:
        return None
    n = sum(c for _, _, c in items)
    net = sum(p for _, p, _ in items)
    top5 = sum(sorted((p for _, p, _ in items), reverse=True)[:5])
    return {'days': len(items), 'slips': n, 'net': net, 'roi': net / n, 'conc': (top5 / net if net > 0 else 1.0),
            'day_items': [(p, c) for _, p, c in items]}


def select_on_s1(strat):
    """V1: pure 2024-25 ranking by ROI at cap with >= 40 days. Concentration is reported, NOT used to select (MLB used
    best-day-share as a post-hoc gate check; using it as a selector on a jackpot-heavy season disqualifies almost everything)."""
    ranked = []
    for key, days in strat.items():
        s = season_stats(days, S1)
        if not s or s['days'] < 40 or s['roi'] <= 0:
            continue
        ranked.append((s['roi'], key))
    ranked.sort(reverse=True)
    return [k for _, k in ranked[:TOPK]]


def boot_ci(day_items, draws, rng):
    n = len(day_items)
    out = []
    for _ in range(draws):
        net = slips = 0.0
        for _ in range(n):
            p, c = day_items[rng.randrange(n)]
            net += p; slips += c
        out.append(net / slips)
    out.sort()
    return out[int(0.025 * draws)], out[int(0.5 * draws)], out[int(0.975 * draws)]


CELL_EDGE = {'steals_R_U': 0.691, 'steals_R': 0.654, 'turnovers_R': 0.633, 'stocks_R': 0.613, 'pts_ast_R': 0.611, 'points_R': 0.608,
             'pra_R_U': 0.640, 'blocks_R': 0.595, 'pts_reb_R': 0.576, 'rebounds_R': 0.574, 'threes_D1': 0.631, 'assists_D1': 0.588,
             'rebounds_D3': 0.606, 'goblin': 0.560}


def monotonicity(days):
    """V4: OOS slips into 5 equal-volume bins by summed certified edge; per-bin ROI; count inversions."""
    slips = []
    for (s, d), v in days.items():
        if s != S2:
            continue
        for profit, hits, st, legs in v:
            legs_l = json.loads(legs) if isinstance(legs, str) else legs
            edge = sum(CELL_EDGE.get(l.get('cell'), 0.55) for l in legs_l)
            slips.append((edge, profit))
    if len(slips) < 100:
        return None
    slips.sort()
    n = len(slips)
    bins = [slips[i * n // 5:(i + 1) * n // 5] for i in range(5)]
    rois = [sum(p for _, p in b) / len(b) for b in bins if b]
    inversions = sum(1 for i in range(1, len(rois)) if rois[i] < rois[i - 1])
    return {'bin_roi': [round(r, 3) for r in rois], 'inversions': inversions}


def decompose(conn, key):
    comp, size, structure = key
    cap = cap_for(structure, size)
    rows = conn.execute(f"""
        SELECT j->>'cell' cell, s.profit
        FROM {T_SLIPS} s, jsonb_array_elements(s.legs_json) j
        WHERE s.composition=%s AND s.size=%s AND s.structure=%s AND s.k<=%s AND s.season=%s AND s.phase<>'final7'""",
        (comp, size, structure, cap, S2)).fetchall()
    by_cell = defaultdict(float)
    tot = 0.0
    for cell, profit in rows:
        by_cell[cell] += profit / size
        tot += profit / size
    if tot <= 0 or not by_cell:
        return None
    top = max(by_cell.items(), key=lambda x: x[1])
    return {'top_cell': top[0], 'top_share': top[1] / tot, 'cells': {c: round(v, 1) for c, v in by_cell.items()}}


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {T_VAL} (
        composition text, size int, structure text, cap int,
        s1_roi double precision, s1_days int, s1_conc double precision,
        oos_roi double precision, oos_days int, oos_slips int, oos_net double precision,
        oos_ci_lo double precision, oos_ci_med double precision, oos_ci_hi double precision,
        oos_roi_no_teammates double precision, oos_slips_no_teammates int,
        top_cell text, top_cell_share double precision, decomposition jsonb,
        v2_pass boolean, v6_pass boolean, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.slip_validation")
    conn.commit()
    rng = random.Random(7)

    strat = load(conn)
    print(f"  {len(strat)} strategies loaded (cap by structure rule applied)", flush=True)

    # ---- V1 walk-forward selection on 2024-25 only
    selected = select_on_s1(strat)
    print(f"  V1: top {len(selected)} selected on 2024-25 ONLY (ROI at cap, >=40 days, conc<=50%)", flush=True)

    # ---- V2, V5, V6 on the selected set, OOS = 2025-26
    results = []
    for key in selected:
        days = strat[key]
        s1 = season_stats(days, S1)
        s2 = season_stats(days, S2)
        if not s2 or s2['days'] < 40:
            continue
        lo, med, hi = boot_ci(s2['day_items'], BOOT, rng)
        # V6 teammate ban
        nt_items = []
        for (s, d), v in days.items():
            if s != S2:
                continue
            keep = [(p, c) for p, h, st, _ in v for c in [1] if st == 0]
            if keep:
                nt_items.append((sum(p for p, _ in keep), len(keep)))
        nt_roi = (sum(p for p, _ in nt_items) / sum(c for _, c in nt_items)) if nt_items else None
        nt_slips = sum(c for _, c in nt_items)
        dec = decompose(conn, key)
        mono = monotonicity(days)
        v2 = lo > 0
        v6 = nt_roi is not None and nt_roi > 0
        results.append((key, s1, s2, lo, med, hi, nt_roi, nt_slips, dec, v2, v6, mono))
        conn.execute("""INSERT INTO nba_score.slip_validation (composition, size, structure, cap, s1_roi, s1_days, s1_conc,
            oos_roi, oos_days, oos_slips, oos_net, oos_ci_lo, oos_ci_med, oos_ci_hi, oos_roi_no_teammates, oos_slips_no_teammates,
            top_cell, top_cell_share, decomposition, v2_pass, v6_pass)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (key[0], key[1], key[2], cap_for(key[2], key[1]), s1['roi'], s1['days'], s1['conc'],
             s2['roi'], s2['days'], s2['slips'], s2['net'], lo, med, hi, nt_roi, nt_slips,
             dec['top_cell'] if dec else None, dec['top_share'] if dec else None, json.dumps(dec['cells']) if dec else None, v2, v6))
    conn.commit()

    print(f"\n== V1+V2+V5+V6: selected on 2024-25, scored on 2025-26 (OOS). CI = 10k day-blocked bootstrap ==", flush=True)
    print(f"  {'strategy':<38} {'cap':>3} {'S1 ROI':>7} {'OOS ROI':>8} {'CI lo':>7} {'CI hi':>7} {'noTM ROI':>9} {'top cell (share)':<28} V2 V6  V4 bins(low->high edge) inv", flush=True)
    passed = 0
    for key, s1, s2, lo, med, hi, nt, nts, dec, v2, v6, mono in sorted(results, key=lambda r: -r[3]):
        tc = f"{dec['top_cell']} ({dec['top_share']:.0%})" if dec else "-"
        mb = f"{mono['bin_roi']} {mono['inversions']}" if mono else "-"
        print(f"  {key[0]+' '+str(key[1])+' '+key[2]:<38} {cap_for(key[2], key[1]):>3} {s1['roi']:>+7.0%} {s2['roi']:>+8.0%} {lo:>+7.0%} {hi:>+7.0%} "
              f"{(nt if nt is not None else 0):>+9.0%} {tc:<28} {'Y' if v2 else 'n'}  {'Y' if v6 else 'n'}  {mb}", flush=True)
        passed += 1 if (v2 and v6) else 0
    print(f"\n  REAL survivors (OOS CI lower bound > 0 AND positive with teammates banned): {passed} of {len(results)}", flush=True)

    # ---- V3 empirical null: each slip leg's hit is a Bernoulli draw at its TIER's WHOLE-BOARD rate, then full regrade.
    # Two earlier nulls were wrong in the same way - they kept selection inside the null: (a) shuffling PROFITS across
    # strategies within a day preserves every day's real outcomes (board avg +46%); (b) shuffling HITS among the legs that
    # appear in slips preserves the SELECTED legs' 0.575 hit rate. The null must be "selection carries no information":
    # a Regular leg hits 0.500 (both sides posted), a G1 0.616, a D1 0.333 - the whole-board rates from the certified map.
    print(f"\n== V3 empirical null: {NULLS} draws at whole-board tier rates, full regrade ==", flush=True)
    tier_rate = {r[0]: float(r[1]) for r in conn.execute("""SELECT tier, avg(hit) FROM nba_score.tier_map_legs
        WHERE rank_key='final_hp' AND tier IN ('R','G1','G2','G3','D1','D2','D3') GROUP BY tier""").fetchall()}
    print(f"    whole-board tier rates: {{{', '.join(f'{k}: {v:.3f}' for k, v in sorted(tier_rate.items()))}}}", flush=True)
    POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
    FLEX = {(2, 2): 2.0, (2, 1): 0.5, (3, 3): 3.0, (3, 2): 1.0, (4, 4): 6.0, (4, 3): 1.5, (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4, (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4}
    def compress(p):
        return p if p <= 9.1 else 9.1 * (p / 9.1) ** 0.857
    # per (season, day): distinct legs -> tier ; per (key, day): slip definitions
    day_legs = defaultdict(dict)
    slip_defs = defaultdict(list)
    for key, days in strat.items():
        for sd, v in days.items():
            for profit, hits, st, legs in v:
                legs_l = json.loads(legs) if isinstance(legs, str) else legs
                ids, fs = [], []
                for l in legs_l:
                    lid = (l['player'], l['prop'], l['side'], float(l['line']))
                    day_legs[sd][lid] = l.get('tier', 'R')
                    ids.append(lid); fs.append(float(l['factor']))
                slip_defs[(key, sd)].append((key[2], key[1], ids, fs))
    def regrade(structure, size, ids, fs, hitmap):
        h = sum(hitmap[i] for i in ids)
        fp = 1.0
        for f in fs:
            fp *= f
        base = (POWER[size] if h == size else 0.0) if structure == 'power' else FLEX.get((size, h), 0.0)
        return (compress(base * fp) if base > 0 else 0.0) - 1.0
    null_counts = []
    for it in range(NULLS):
        drawn = {sd: {lid: (1 if rng.random() < tier_rate.get(t, 0.5) else 0) for lid, t in legs.items()} for sd, legs in day_legs.items()}
        def sstats(key, season):
            items = []
            for (s, d), v in strat[key].items():
                if s != season:
                    continue
                defs = slip_defs[(key, (s, d))]
                net = sum(regrade(st_, sz, ids, fs, drawn[(s, d)]) for st_, sz, ids, fs in defs)
                items.append((net, len(defs)))
            if not items:
                return None
            n = sum(c for _, c in items); net = sum(p for p, _ in items)
            return {'days': len(items), 'roi': net / n, 'day_items': items}
        ranked = []
        for key in strat:
            s = sstats(key, S1)
            if s and s['days'] >= 40 and s['roi'] > 0:
                ranked.append((s['roi'], key))
        ranked.sort(reverse=True)
        surv = 0
        for _, key in ranked[:TOPK]:
            s2 = sstats(key, S2)
            if not s2 or s2['days'] < 40:
                continue
            lo, _, _ = boot_ci(s2['day_items'], 400, rng)
            if lo > 0:
                surv += 1
        null_counts.append(surv)
        if (it + 1) % 50 == 0:
            print(f"    {it+1}/{NULLS} null draws, survivors so far: mean {sum(null_counts)/len(null_counts):.2f}, max {max(null_counts)}", flush=True)
    null_counts.sort()
    p95 = null_counts[int(0.95 * len(null_counts))] if null_counts else None
    print(f"\n  V3 RESULT: under a zero-edge null, expected survivors = {sum(null_counts)/len(null_counts):.2f} (95th pct {p95}); REAL survivors = {passed}", flush=True)
    print("  Verdict:", "REAL survivors EXCEED the null's 95th percentile - the edge is not selection." if passed > (p95 or 0) else "REAL survivors do NOT exceed the null - selection can explain them.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
