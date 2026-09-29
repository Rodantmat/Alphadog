#!/usr/bin/env python3
"""
NBA SLIP CONFIG-SWEEP HARNESS v3 - exhaustive REAL-slip backtest.
Owner mandate: real legs, real slips, real outcomes, real payouts. NO proportionals, NO extrapolation.
Every slip is an actual combination of actual graded legs on an actual day, graded on actual hits and
paid from the actual PrizePicks payout table (Power tiers / Flex partial tiers) with a haircut.

REAL LINES ONLY (default CS_REAL_ONLY=1): prop_universe.line_source='real' (method 'archive'). Eight props
(ftm, fta, fga, fgm, fg3a, oreb, dreb, fantasy_score) are SIMULATED lines that were never offered on a board -
excluded (strategy doc section 14a).

CALIBRATION: DAILY WALK-FORWARD - a leg on day D is priced with the realized hit rate of its
(prop, side, model_p bucket) over legs on days STRICTLY BEFORE D (both seasons; cells with n < CS_MIN_N skipped).
DRIVERS: cal_p, and blend = cal_p + 0.20*(trail10 - 0.5) (player's as-of hit rate on that prop+side, needs >=5).

v3 ADDITIONS (statistical honesty - the pooled ROI of overlapping slips is NOT the evidence):
  * DAY-CLUSTERED BOOTSTRAP: every slip on a day is built from the same few legs, so the effective sample is
    DAYS. Configs are RANKED ON season 1 only, then their season-2 DAYS are resampled with replacement
    (CS_BOOT draws) -> P5 / P50 / P95 ROI. This is an honest out-of-sample interval.
  * GATE 1: a config survives only if bootstrap P5 > 0 on S2 with >=200 S2 slips and >=15 S2 winning days.
  * SEASON-EFFECT CHECK: mean S1 vs mean S2 ROI over ALL configs (is S2 simply a friendly season?).
  * ONE-SLIP-PER-DAY SERIES (cap 1) for the survivors: days placed, share of days net-positive, net units,
    max drawdown, longest losing streak (the owner's loss-frustration measure).

Env: DATABASE_URL, CS_HAIRCUT (0.95), CS_MIN_N (60), CS_FLOOR (0.56), CS_SEASONS (blank=all),
     CS_REAL_ONLY (1), CS_BOOT (2000). REPORT ONLY - reads prop_universe, writes nothing.
"""
import os
import sys
import random
import itertools
from collections import defaultdict, deque

import psycopg

PERIPHERAL = {'turnovers', 'stocks', 'steals', 'blocks'}
POINTS_FAM = {'points', 'pts_reb', 'pts_ast', 'pra'}
OTHER_CORE = {'rebounds', 'assists', 'reb_ast', 'threes_made'}
# 16a: leg-by-leg cells (prop, side, line) that realize >= 0.60 at model_p>=0.58 on real lines.
# Drops steals U1.5 (0.549) and stocks U2.5 (0.557), which sit at/below the 4pk-Flex break-even.
STRONG_CELLS = {
    ('steals', 'Under', 0.5), ('stocks', 'Over', 0.5), ('turnovers', 'Over', 2.5), ('turnovers', 'Over', 1.5),
    ('turnovers', 'Under', 2.5), ('stocks', 'Over', 1.5), ('blocks', 'Over', 0.5), ('turnovers', 'Over', 0.5),
}
POWER_TIER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {  # matches nba_market.pp_flex_standard_payout (verified section 7b)
    (3, 3): 3.0, (3, 2): 1.0,
    (4, 4): 6.0, (4, 3): 1.5,
    (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4,
    (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4,
}
NB = 13
EID, PID, PROP, SIDE, HIT, CAL, BLEND, SEASON = range(8)
DRIVERS = {'cal_p': CAL, 'blend': BLEND}


def bucket(p):
    b = int((p - 0.30) / 0.05)
    return 0 if b < 0 else (NB - 1 if b >= NB else b)


def build_pool(conn, seasons, min_n, floor):
    sql = """SELECT pu.season, pu.game_date, pu.event_id, pu.player_id, pu.prop, pu.side, pu.model_p, pu.hit::int
             FROM nba_market.prop_universe pu
             WHERE pu.kind='standard' AND pu.hit IS NOT NULL AND pu.model_p IS NOT NULL"""
    params = []
    if os.environ.get('CS_REAL_ONLY', '1') == '1':
        sql += " AND pu.line_source = 'real'"
    if seasons:
        sql += " AND pu.season = ANY(%s)"
        params.append(seasons)
    sql += " ORDER BY pu.game_date"

    counts, recent = {}, {}
    pool = defaultdict(list)
    total = kept = 0
    cur_day = None
    day_updates = []

    def flush():
        for ckey, rkey, h in day_updates:
            c = counts.get(ckey)
            if c is None:
                counts[ckey] = [h, 1]
            else:
                c[0] += h
                c[1] += 1
            d = recent.get(rkey)
            if d is None:
                d = recent[rkey] = deque(maxlen=10)
            d.append(h)
        day_updates.clear()

    with conn.cursor(name='sweep_legs') as cur:
        cur.itersize = 100000
        cur.execute(sql, params)
        for season, gdate, eid, pid, prop, side, mp, h in cur:
            if gdate != cur_day:
                flush()
                cur_day = gdate
            total += 1
            ckey = (prop, side, bucket(float(mp)))
            rkey = (pid, prop, side)
            c = counts.get(ckey)
            if c is not None and c[1] >= min_n:
                cal = c[0] / c[1]
                if cal >= floor:
                    d = recent.get(rkey)
                    blend = cal + 0.20 * (sum(d) / len(d) - 0.5) if (d is not None and len(d) >= 5) else cal
                    pool[gdate].append((eid, pid, prop, side, h, cal, blend, season))
                    kept += 1
            day_updates.append((ckey, rkey, h))
        flush()
    return pool, total, kept


def cell_ok(prop, cellset):
    if cellset == 'all':
        return True
    if cellset == 'peripheral':
        return prop in PERIPHERAL
    if cellset == 'points':
        return prop in POINTS_FAM
    if cellset == 'other_core':
        return prop in OTHER_CORE
    return prop == cellset


def select_day(legs, thr, cellset, side, depth, drv, order):
    cand = [L for L in legs
            if L[CAL] >= thr and cell_ok(L[PROP], cellset) and (side == 'both' or L[SIDE].lower() == side)]
    if len(cand) < depth:
        return None
    cand.sort(key=lambda L: L[PID], reverse=(order == 'desc'))
    cand.sort(key=lambda L: -L[drv])
    seen, ranked = set(), []
    for L in cand:
        if L[EID] in seen:
            continue
        seen.add(L[EID])
        ranked.append(L)
        if len(ranked) >= max(depth, 8):
            break
    return ranked if len(ranked) >= depth else None


def payout(structure, k, hits, hc):
    if structure == 'power':
        return POWER_TIER[k] * hc if hits == k else 0.0
    return FLEX.get((k, hits), 0.0) * hc


def run_config(pool, thr, cellset, side, depth, structure, drv, order, hc, cap=None):
    stake = ret = 0.0
    slips = 0
    win_days = set()
    by_season, by_month, day_pl = {}, {}, {}
    prop_use = {}     # prop -> [leg-uses, leg-hits]  (which real props the slips are built from)
    for day, legs in pool.items():
        ranked = select_day(legs, thr, cellset, side, depth, drv, order)
        if ranked is None:
            continue
        combos = itertools.combinations(ranked, depth)
        if cap:
            combos = sorted(combos, key=lambda c: -sum(L[drv] for L in c))[:cap]
        season = ranked[0][SEASON]
        ym = str(day)[:7]
        ss = by_season.setdefault(season, [0.0, 0.0, set()])
        mm = by_month.setdefault(ym, [0.0, 0.0])
        dst = dre = 0.0
        for combo in combos:
            hits = sum(L[HIT] for L in combo)
            r = payout(structure, depth, hits, hc)
            stake += 1.0; ret += r; slips += 1
            ss[0] += 1.0; ss[1] += r
            mm[0] += 1.0; mm[1] += r
            dst += 1.0; dre += r
            if r > 1.0:
                win_days.add(day); ss[2].add(day)
            for L in combo:
                pu = prop_use.setdefault(L[PROP], [0, 0])
                pu[0] += 1; pu[1] += L[HIT]
        day_pl[day] = (season, dst, dre)
    if slips == 0:
        return None
    return {
        'roi': ret / stake - 1.0, 'slips': slips, 'wd': len(win_days),
        'season': {k: (v[1] / v[0] - 1.0, int(v[0]), len(v[2])) for k, v in by_season.items()},
        'months_pos': sum(1 for s, r in by_month.values() if r / s - 1.0 > 0), 'months': len(by_month),
        'by_month': by_month, 'prop_use': prop_use,
        'days': day_pl,
    }


def bootstrap_roi(items, draws, seed=7):
    """items: list of (stake, ret) per DAY. Resample days with replacement -> (P5, P50, P95) ROI."""
    n = len(items)
    if n < 8:
        return None
    rng = random.Random(seed)
    out = []
    for _ in range(draws):
        s = r = 0.0
        for _ in range(n):
            st, rt = items[rng.randrange(n)]
            s += st; r += rt
        out.append(r / s - 1.0)
    out.sort()
    return out[int(0.05 * draws)], out[int(0.50 * draws)], out[int(0.95 * draws)]


def series_stats(day_items):
    """day_items: list of (day, stake, ret) sorted by day, one slip/day.
    -> (n, pct_pos, net, maxdd, longest_loss_streak)."""
    cum = peak = maxdd = 0.0
    streak = longest = pos = 0
    for _, st, rt in day_items:
        net = rt - st
        cum += net
        peak = max(peak, cum)
        maxdd = max(maxdd, peak - cum)
        if net > 0:
            pos += 1
            streak = 0
        else:
            streak += 1
            longest = max(longest, streak)
    n = len(day_items)
    return n, (pos / n if n else 0.0), cum, maxdd, longest


def fmt(cfg):
    d, t, c, s, k, st = cfg
    return f"{d:<5} thr{t:.2f} {c:<10} {s:<5} {k}pk {st}"


def main():
    seasons = [s.strip() for s in os.environ.get('CS_SEASONS', '').split(',') if s.strip()] or None
    hc = float(os.environ.get('CS_HAIRCUT', '0.95'))
    min_n = int(os.environ.get('CS_MIN_N', '60'))
    floor = float(os.environ.get('CS_FLOOR', '0.56'))
    draws = int(os.environ.get('CS_BOOT', '2000'))
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    print(f"config-sweep v3: real_only={os.environ.get('CS_REAL_ONLY', '1')} haircut={hc} min_n={min_n} "
          f"floor={floor} boot={draws}", flush=True)

    pool, total, kept = build_pool(conn, seasons, min_n, floor)
    conn.close()
    seasons_seen = sorted({L[SEASON] for legs in pool.values() for L in legs})
    print(f"  streamed {total:,} graded legs; {kept:,} priced; {len(pool)} slate-days; seasons={seasons_seen}", flush=True)
    if len(seasons_seen) < 2:
        print("  WARNING: <2 seasons priced - S1->S2 unavailable", flush=True)
        return
    s1, s2 = seasons_seen[0], seasons_seen[-1]
    if os.environ.get('CS_SWAP', '0') == '1':
        s1, s2 = s2, s1
        print(f"  CS_SWAP=1: picking on {s1}, scoring on {s2}", flush=True)
    s1_from = os.environ.get('CS_S1_FROM', '').strip()  # e.g. 2025-01-01: drop S1 warm-up days from scoring
    if s1_from:
        import datetime as _dt
        cutoff = _dt.date.fromisoformat(s1_from)
        dropped = 0
        for day in list(pool.keys()):
            if day < cutoff and pool[day] and pool[day][0][SEASON] == s1:
                del pool[day]; dropped += 1
        print(f"  CS_S1_FROM={s1_from}: dropped {dropped} warm-up slate-days from {s1}", flush=True)

    thresholds = [round(0.56 + 0.01 * i, 2) for i in range(11)]
    grid = list(itertools.product(DRIVERS.keys(), thresholds, ['all', 'peripheral', 'points', 'other_core'],
                                  ['over', 'under', 'both'], [2, 3, 4, 5, 6], ['power', 'flex']))
    results = []
    for drv_name, thr, cellset, side, depth, structure in grid:
        if structure == 'flex' and depth < 3:
            continue
        res = run_config(pool, thr, cellset, side, depth, structure, DRIVERS[drv_name], 'asc', hc)
        if res is not None:
            results.append(((drv_name, thr, cellset, side, depth, structure), res))
    print(f"  {len(results)} configs produced slips (of {len(grid)} grid points)", flush=True)

    # ---- S1 -> S2 candidates (configs with enough data in BOTH seasons) ----
    cand = []
    for cfg, r in results:
        a = r['season'].get(s1); b = r['season'].get(s2)
        if a and b and a[1] >= 60 and a[2] >= 8 and b[1] >= 40:
            cand.append((cfg, r, a, b))
    mean_s1 = sum(a[0] for _, _, a, _ in cand) / len(cand)
    mean_s2 = sum(b[0] for _, _, _, b in cand) / len(cand)
    print(f"\n== SEASON-EFFECT CHECK ({len(cand)} configs with data in both seasons) ==", flush=True)
    print(f"  mean ROI over ALL these configs:  {s1} {mean_s1:+.1%}   {s2} {mean_s2:+.1%}", flush=True)

    cand.sort(key=lambda x: -x[2][0])
    top = cand[:30]
    print(f"\n== GATE 1: picked on {s1} ONLY, then {s2} DAYS bootstrapped ({draws} draws) - top {len(top)} by S1 ==", flush=True)
    print("  columns: S1 ROI -> S2 ROI (slips, win-days, days) | S2 bootstrap P5 / P50 / P95 | config", flush=True)
    survivors = []
    for cfg, r, a, b in top:
        s2_days = [(st, rt) for (season, st, rt) in r['days'].values() if season == s2]
        bs = bootstrap_roi(s2_days, draws)
        if bs is None:
            continue
        ok = bs[0] > 0 and b[1] >= 200 and b[2] >= 15
        if ok:
            survivors.append((cfg, r, a, b, bs))
        print(f"  {'PASS' if ok else 'fail'} S1 {a[0]:>+6.0%} -> S2 {b[0]:>+6.0%} ({b[1]:>4}sl,{b[2]:>2}wd,{len(s2_days):>3}d) "
              f"| P5 {bs[0]:>+6.0%} P50 {bs[1]:>+6.0%} P95 {bs[2]:>+6.0%} | {fmt(cfg)}", flush=True)
    print(f"  GATE 1 survivors: {len(survivors)} of {len(top)} "
          f"(needs S2 bootstrap P5 > 0, >=200 S2 slips, >=15 S2 win-days)", flush=True)

    # ---- one-slip-per-day series for survivors (or best-by-S1 if none) ----
    show = survivors[:8] if survivors else [(c, r, a, b, None) for c, r, a, b in top[:6]]
    print(f"\n== ONE SLIP PER DAY (cap 1) series for {'survivors' if survivors else 'top-S1 (no survivors)'} ==", flush=True)
    print("  columns: days placed | % days net-positive | net units | max drawdown | longest losing streak", flush=True)
    for cfg, r, a, b, bs in show:
        d, t, c, s, k, st = cfg
        rr = run_config(pool, t, c, s, k, st, DRIVERS[d], 'asc', hc, cap=1)
        if rr is None:
            continue
        items = sorted((day, sd, rd) for day, (season, sd, rd) in rr['days'].items())
        n, pp, net, dd, ls = series_stats(items)
        items2 = [x for x in items if rr['days'][x[0]][0] == s2]
        n2, pp2, net2, dd2, ls2 = series_stats(items2)
        print(f"  all: {n:>3}d {pp:>4.0%}+ net {net:>+6.1f}u dd {dd:>5.1f}u streak {ls:>2} | "
              f"{s2}: {n2:>3}d {pp2:>4.0%}+ net {net2:>+6.1f}u dd {dd2:>5.1f}u streak {ls2:>2} | {fmt(cfg)}", flush=True)

    # ---- PROBE: named configs get the full report regardless of ranking (the "missing cells") ----
    default_probe = (
        "blend,0.58,peripheral,both,5,flex;cal_p,0.58,peripheral,both,4,flex;blend,0.58,peripheral,both,4,power;"
        "cal_p,0.57,peripheral,both,4,flex;blend,0.59,peripheral,both,4,flex;cal_p,0.59,peripheral,under,3,power;"
        "blend,0.57,peripheral,both,4,flex;blend,0.57,peripheral,both,5,flex;blend,0.60,peripheral,both,3,power;"
        "cal_p,0.57,peripheral,both,5,flex;blend,0.57,other_core,under,5,flex;"
        "cal_p,0.58,turnovers,both,4,flex;cal_p,0.58,stocks,both,4,flex;cal_p,0.58,steals,both,4,flex;"
        "cal_p,0.58,blocks,both,4,flex;cal_p,0.58,turnovers,both,3,power"
    )
    probes = []
    for spec in os.environ.get('CS_PROBE', default_probe).split(';'):
        p = [x.strip() for x in spec.split(',')]
        if len(p) == 6:
            probes.append((p[0], float(p[1]), p[2], p[3], int(p[4]), p[5]))
    if probes:
        print(f"\n== PROBE: {len(probes)} named configs - per-season ROI with DAY bootstrap on EACH season, "
              f"month walk, prop breakdown ==", flush=True)
        for cfg in probes:
            d, t, c, s, k, st = cfg
            rr = run_config(pool, t, c, s, k, st, DRIVERS[d], 'asc', hc)
            if rr is None:
                print(f"  (no slips) {fmt(cfg)}", flush=True)
                continue
            line = [f"  {fmt(cfg)}"]
            for season in seasons_seen:
                sv = rr['season'].get(season)
                if not sv:
                    line.append(f"    {season}: no slips")
                    continue
                sdays = [(sd, rd) for (se, sd, rd) in rr['days'].values() if se == season]
                bs = bootstrap_roi(sdays, draws)
                bst = f"P5 {bs[0]:+.0%} P50 {bs[1]:+.0%} P95 {bs[2]:+.0%}" if bs else "boot n/a"
                line.append(f"    {season}: ROI {sv[0]:+.1%} ({sv[1]} slips, {sv[2]} win-days, {len(sdays)} days) | {bst}")
            months = sorted(rr['by_month'].items())
            mw = " ".join(f"{ym[2:]}:{(r_ / s_ - 1):+.0%}" for ym, (s_, r_) in months)
            line.append(f"    months: {mw}")
            pu = sorted(rr['prop_use'].items(), key=lambda x: -x[1][0])
            tot = sum(v[0] for _, v in pu) or 1
            pw = " ".join(f"{p}:{v[0] / tot:.0%}@{(v[1] / v[0]):.2f}" for p, v in pu)
            line.append(f"    legs by prop (share@hit): {pw}")
            print("\n".join(line), flush=True)

    # ---- pooled robust leaderboard (context only) ----
    robust = [(cfg, r) for cfg, r in results if r['wd'] >= 15 and r['slips'] >= 100]
    robust.sort(key=lambda x: -x[1]['roi'])
    print(f"\n== pooled TOP 10 (context only; jackpot-driven; {len(robust)} robust) ==", flush=True)
    for cfg, r in robust[:10]:
        print(f"  {r['roi']:>+7.1%} slips={r['slips']:>5} wd={r['wd']:>3} months+={r['months_pos']}/{r['months']}  {fmt(cfg)}",
              flush=True)
    print("\nDONE (report only, nothing written).", flush=True)


if __name__ == "__main__":
    main()
