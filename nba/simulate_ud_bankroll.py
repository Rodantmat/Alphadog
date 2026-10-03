#!/usr/bin/env python3
"""
BANKROLL / DROUGHT SIMULATION (strategy doc §30w; owner: "don't be lazy - research, test, simulate, debug").
Research basis: fractional Kelly is the standard drawdown control (MacLean et al.; Busseti-Ryu-Boyd, Stanford); stop-losses
usually reduce expected return unless set from the strategy's own drawdown distribution (Zambelli); the principled drought
detector is a sequential test on whether the edge still exists (Crane) - implemented here as a CUSUM.

Input: the portfolio's real daily slips (P5 by default: weighted:points 4-Standard + 6-Flex cap 1 + mains 2-Standard cap 2),
de-duplicated, calendar stand-downs applied, per build (SIM_TABLES) and season. Each day = list of (stake 1, payout).
 1. ENVELOPE: 10,000 simulated seasons (same day count) by resampling real days - iid and 7-day blocks - flat 1-unit stakes:
    max drawdown, longest losing streak, longest underwater spell (days below the previous peak), P(losing season);
    the observed real seasons' values are placed in that distribution (percentile).
 2. DROUGHT ALARM: 95th / 99th percentile of drawdown and underwater days = "outside variance" thresholds.
 3. SIZING on the same paths (start 100 units of bankroll, 2 seasons back to back): flat 1 unit; fixed fraction f per slip
    (f = empirical Kelly f* maximising mean log growth over real days, and 1/4, 1/2 of it); stop-loss variants (flat stakes,
    pause 5 days after a 25-unit drawdown; halve stakes while > 25 units under peak). Median terminal bankroll, P(bankroll
    ever < 50% / < 20% of start), median max drawdown.
 4. CUSUM edge-decay monitor on daily net per slip: S_t = max(0, S_{t-1} + (mu0/2 - x_t)), alarm when S_t > h; mu0 = the
    real mean per-slip daily return. False-alarm rate within a season under the real edge (resampled real days), and
    detection delay when the edge is gone (same days, mean removed - variance kept, edge zero). h chosen so the false-alarm
    probability within a season is <= 10%.
Env: DATABASE_URL, SIM_TABLES (comma list), SIM_N (10000), SIM_PORTFOLIO (P5|P4).
"""
import math
import os
import random
from collections import defaultdict

import psycopg

N = int(os.environ.get('SIM_N') or '10000')
TABLES = [t.strip() for t in (os.environ.get('SIM_TABLES') or 'nba_score.ud_slip_engine_slips_dlt_orig2,nba_score.ud_slip_engine_slips_dlt_recert2').split(',')]
PF = os.environ.get('SIM_PORTFOLIO') or 'P5'

PF_SQL = {
    'P5': "(k<=1 AND composition='weighted:points_R_U' AND ((size=4 AND structure='standard') OR (size=6 AND structure='flex'))) OR (k<=2 AND composition='mains' AND size=2 AND structure='standard')",
    'P4': "composition='weighted:points_R_U' AND ((k<=1 AND ((size=4 AND structure='standard') OR (size=6 AND structure='flex'))) OR (k<=2 AND size=2 AND structure='standard'))",
}


def load(conn, table):
    sql = f"""
    WITH dates AS (SELECT DISTINCT season, game_date FROM {table}),
    gaps AS (SELECT season, game_date d, lead(game_date) OVER (PARTITION BY season ORDER BY game_date) nxt FROM dates),
    asb AS (SELECT DISTINCT ON (season) season, d lb FROM gaps WHERE extract(month FROM d)=2 ORDER BY season, (nxt-d) DESC),
    b AS (SELECT s.season, s.game_date, s.size, s.structure, s.payout,
            (SELECT string_agg((j->>'player')||(j->>'prop')||(j->>'side')||(j->>'line'), ',' ORDER BY j->>'player', j->>'prop') FROM jsonb_array_elements(s.legs_json) j) lk
          FROM {table} s JOIN asb USING (season)
          WHERE s.phase<>'final7' AND NOT (s.game_date BETWEEN asb.lb-6 AND asb.lb) AND ({PF_SQL[PF]}))
    SELECT DISTINCT ON (season, game_date, size, structure, lk) season, game_date, payout FROM b ORDER BY season, game_date, size, structure, lk"""
    days = defaultdict(lambda: defaultdict(list))
    for season, d, payout in conn.execute(sql).fetchall():
        days[season][d].append(float(payout))
    return {s: [v for _, v in sorted(dd.items())] for s, dd in days.items()}


def path_stats(day_nets):
    c = peak = 0.0; mdd = 0.0; streak = best_streak = 0; under = best_under = 0
    for x in day_nets:
        c += x
        if c >= peak:
            peak = c; under = 0
        else:
            under += 1; best_under = max(best_under, under)
        mdd = max(mdd, peak - c)
        streak = streak + 1 if x < 0 else 0
        best_streak = max(best_streak, streak)
    return mdd, best_streak, best_under, c


def pct(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, int(q * len(sorted_vals)))]


def rank_of(sorted_vals, v):
    lo = sum(1 for x in sorted_vals if x < v)
    return 100.0 * lo / len(sorted_vals)


def resample(days, n, rng, block=1):
    out = []
    while len(out) < n:
        i = rng.randrange(len(days))
        out.extend(days[i:i + block] if block > 1 else [days[i]])
    return out[:n]


def envelope(label, days, rng):
    nets = [sum(p - 1.0 for p in d) for d in days]
    real = path_stats(nets)
    print(f"\n== {label}: {len(days)} days, {sum(len(d) for d in days)} slips, real net {real[3]:+.1f}, real max DD {real[0]:.1f}, "
          f"real longest losing streak {real[1]}, real longest underwater {real[2]} days ==", flush=True)
    for block in (1, 7):
        sims = [path_stats([sum(p - 1.0 for p in d) for d in resample(days, len(days), rng, block)]) for _ in range(N)]
        dd = sorted(s[0] for s in sims); st = sorted(s[1] for s in sims); uw = sorted(s[2] for s in sims); fin = [s[3] for s in sims]
        print(f"  [{'iid days' if block == 1 else '7-day blocks'}] max DD median {pct(dd,.5):.1f} | 95th {pct(dd,.95):.1f} | 99th {pct(dd,.99):.1f}  "
              f"(real at {rank_of(dd, real[0]):.0f}th pct) || losing streak median {pct(st,.5)} | 95th {pct(st,.95)} | 99th {pct(st,.99)} "
              f"(real at {rank_of(st, real[1]):.0f}th) || underwater days median {pct(uw,.5)} | 95th {pct(uw,.95)} | 99th {pct(uw,.99)} "
              f"(real at {rank_of(uw, real[2]):.0f}th) || P(losing season) {100.0*sum(1 for f in fin if f < 0)/N:.2f}%", flush=True)


def kelly_fraction(days):
    """Empirical Kelly: fixed fraction f of bankroll per slip maximising mean log growth over the real days."""
    best = (-1e9, 0.0)
    for i in range(1, 200):
        f = i / 2000.0          # 0.05% .. 10% per slip
        if any(1 + f * sum(p - 1.0 for p in d) <= 0 for d in days):
            break
        g = sum(math.log(1 + f * sum(p - 1.0 for p in d)) for d in days) / len(days)
        if g > best[0]:
            best = (g, f)
    return best[1]


def run_sizing(rule, seq, start=100.0, f=0.0):
    bank = peak = start; low = start; mdd = 0.0; pause = 0
    for d in seq:
        net1 = sum(p - 1.0 for p in d)
        if rule == 'flat':
            bank += net1
        elif rule == 'fraction':
            bank *= (1 + f * net1)
        elif rule == 'stop_pause':
            if pause > 0:
                pause -= 1
            else:
                bank += net1
                if peak - bank >= 25:
                    pause = 5; peak = bank
        elif rule == 'stop_halve':
            bank += net1 * (0.5 if peak - bank >= 25 else 1.0)
        peak = max(peak, bank); low = min(low, bank); mdd = max(mdd, (peak - bank) / peak if peak > 0 else 1.0)
        if bank <= 0:
            return 0.0, 0.0, 1.0
    return bank, low, mdd


def sizing(label, all_days, rng):
    fstar = kelly_fraction(all_days)
    print(f"\n== SIZING {label}: empirical Kelly f* = {100*fstar:.2f}% of bankroll per slip (two seasons back to back, start 100) ==", flush=True)
    rules = [('flat 1 unit', 'flat', 0), ('1/4 Kelly', 'fraction', fstar / 4), ('1/2 Kelly', 'fraction', fstar / 2),
             ('full Kelly', 'fraction', fstar), ('stop: pause 5d after 25u DD', 'stop_pause', 0), ('stop: halve while 25u+ under peak', 'stop_halve', 0)]
    seqs = [resample(all_days, len(all_days), rng, 7) for _ in range(min(N, 4000))]
    for name, rule, f in rules:
        res = [run_sizing(rule, s, 100.0, f) for s in seqs]
        fin = sorted(r[0] for r in res); dd = sorted(r[2] for r in res)
        print(f"  {name:<34} median end {pct(fin,.5):>9.1f} | 5th pct end {pct(fin,.05):>8.1f} | P(ever <50) {100.0*sum(1 for r in res if r[1] < 50)/len(res):5.1f}% "
              f"| P(ever <20) {100.0*sum(1 for r in res if r[1] < 20)/len(res):5.1f}% | median max DD {pct(dd,.5):7.1f}", flush=True)


def cusum(label, all_days, rng):
    per_slip = [sum(p - 1.0 for p in d) / len(d) for d in all_days]
    mu0 = sum(per_slip) / len(per_slip)
    zero = [x - mu0 for x in per_slip]
    print(f"\n== CUSUM edge-decay monitor {label}: real mean daily return per slip {100*mu0:+.1f}% ==", flush=True)
    season = 145
    for h in (5, 10, 15, 20, 30):
        fa = 0; delays = []
        for _ in range(2000):
            s = 0.0; alarmed = False
            for x in [per_slip[rng.randrange(len(per_slip))] for _ in range(season)]:
                s = max(0.0, s + (mu0 / 2 - x))
                if s > h:
                    alarmed = True; break
            fa += alarmed
            s = 0.0; t = 0
            while t < 600:
                x = zero[rng.randrange(len(zero))]; t += 1
                s = max(0.0, s + (mu0 / 2 - x))
                if s > h:
                    break
            delays.append(t)
        delays.sort()
        print(f"  h={h:<3} false alarm within a season (edge intact) {100.0*fa/2000:5.1f}% | days to alarm once the edge is gone: median {pct(delays,.5)}, "
              f"90th pct {pct(delays,.9)}", flush=True)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    rng = random.Random(11)
    for table in TABLES:
        data = load(conn, table)
        for season in sorted(data):
            envelope(f"{PF} {table.split('.')[-1]} {season}", data[season], rng)
        both = [d for s in sorted(data) for d in data[s]]
        sizing(f"{PF} {table.split('.')[-1]}", both, rng)
        cusum(f"{PF} {table.split('.')[-1]}", both, rng)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
