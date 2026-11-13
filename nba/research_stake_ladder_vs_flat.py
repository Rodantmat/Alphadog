#!/usr/bin/env python3
"""STAKE STUDY (owner 2026-11-12 16:32 PT: "instead of increasing the unit gradually and decreasing with losing/winning streaks, is it better to keep a flat 3, 5, 10 all season?"). READ-ONLY.
Daily PrizePicks unit P/L of the certified plan replayed on 2024-25 and 2025-26 (replay_audit_slips *_p1021, played slips, unit P/L = stake_weight x profit) + this season's real played slips (live_slips 'graded').
Compared on the SAME days: flat $1 / $2 / $3 / $5 / $8 / $10 all season, the earn-the-raise LADDER (unit = 1 + rung, rung n at cumulative dollar profit 25*n(n+1)/2 x SCALE, steps down the same thresholds, floor $2,
checked each morning on the profit to date; SCALE 1 / 2 / 4 because the live per-app thresholds are scaled) and a fixed SCHEDULE (+$1 every 14 days, not result-driven).
Reports per season and pooled: $ profit, $ staked, ROI per $ staked, max drawdown $, worst day $, longest time under water (days), profit / drawdown, plus a pooled bootstrap (block resample of days).
"""
import os
import numpy as np
import psycopg

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
S = {}
for lab, name in (("s2425_p1021", "2024-25"), ("s2526_p1021", "2025-26")):
    r = conn.execute("""SELECT game_date, count(*), sum(coalesce(stake_weight,1)*profit), sum(coalesce(stake_weight,1)) FROM nba_score.replay_audit_slips
                        WHERE label=%s AND status='graded' AND profit IS NOT NULL GROUP BY 1 ORDER BY 1""", (lab,)).fetchall()
    S[name] = [(d, int(n), float(p), float(u)) for d, n, p, u in r]
r = conn.execute("""SELECT game_date, count(*), sum(coalesce(stake_weight,1)*profit), sum(coalesce(stake_weight,1)) FROM nba_score.live_slips
                    WHERE status='graded' AND profit IS NOT NULL AND game_date >= '2026-10-20' GROUP BY 1 ORDER BY 1""").fetchall()
S["2026-27 real"] = [(d, int(n), float(p), float(u)) for d, n, p, u in r]
conn.close()


def run(days, unit_fn):
    cum = 0.0; eq = []; st = 0.0; units = []
    for i, (d, n, up, uu) in enumerate(days):
        u = unit_fn(i, cum)
        units.append(u); cum += u * up; st += u * uu; eq.append(cum)
    eq = np.array(eq); peak = np.maximum.accumulate(np.concatenate([[0.0], eq]))[1:]
    dd = float((peak - eq).max()); uw = 0; cur = 0; pk = 0.0
    for x in eq:
        if x >= pk:
            pk = x; cur = 0
        else:
            cur += 1; uw = max(uw, cur)
    daily = np.diff(np.concatenate([[0.0], eq]))
    return dict(profit=float(eq[-1]), staked=st, roi=float(eq[-1] / st) if st else 0.0, dd=dd, worst=float(daily.min()), uw=uw, ratio=float(eq[-1] / dd) if dd else 0.0,
                avg_unit=float(np.mean(units)), daily=daily)


def ladder(scale):
    def f(i, cum):
        n = 0
        while 25 * (n + 1) * (n + 2) / 2 * scale <= cum:
            n += 1
        return max(2, 1 + n)
    return f


def sched(i, cum):
    return 2 + i // 14


modes = [("flat $1", lambda i, c: 1), ("flat $2", lambda i, c: 2), ("flat $3", lambda i, c: 3), ("flat $5", lambda i, c: 5), ("flat $8", lambda i, c: 8), ("flat $10", lambda i, c: 10),
         ("ladder x1", ladder(1)), ("ladder x2", ladder(2)), ("ladder x4", ladder(4)), ("schedule +$1/14d from $2", sched)]
print("=" * 150)
for sea, days in S.items():
    print(f"\n##### {sea}: {len(days)} slate days, {sum(d[1] for d in days)} played slips, unit P/L {sum(d[2] for d in days):+.1f}u, worst day {min(d[2] for d in days):+.1f}u")
    print(f"  {'mode':<26}{'profit$':>9}{'staked$':>9}{'ROI/$':>8}{'maxDD$':>9}{'worstDay$':>11}{'underwater(d)':>15}{'profit/DD':>11}{'avgUnit':>9}")
    for nm, fn in modes:
        x = run(days, fn)
        print(f"  {nm:<26}{x['profit']:>9.0f}{x['staked']:>9.0f}{100*x['roi']:>7.1f}%{x['dd']:>9.0f}{x['worst']:>11.0f}{x['uw']:>15d}{x['ratio']:>11.2f}{x['avg_unit']:>9.2f}")
print("\n##### the claim 'I bet big on losing days': per season, correlation of the day's unit (ladder x1) with that day's unit ROI, and avg unit on losing vs winning days")
for sea, days in S.items():
    f = ladder(1); cum = 0.0; us = []; r = []; w = []
    for i, (d, n, up, uu) in enumerate(days):
        u = f(i, cum); us.append(u); r.append(up / max(uu, 1e-9)); w.append(up); cum += u * up
    us = np.array(us); r = np.array(r); w = np.array(w)
    print(f"  {sea}: corr(unit, day ROI) {np.corrcoef(us, r)[0,1]:+.3f}; avg unit losing days {us[w<0].mean():.2f} winning days {us[w>0].mean():.2f}; days stepped UP then next day lost {np.mean([w[i+1]<0 for i in range(len(us)-1) if us[i+1]>us[i]] or [0]):.2f}")
print("\n##### pooled bootstrap, 2024-26 history days (block 7 days, 3000 resamples of a 150-day season): median / 5th / 95th percentile of profit$ and max drawdown$")
hist = S["2024-25"] + S["2025-26"]
rng = np.random.RandomState(7)
for nm, fn in modes:
    pr = []; dds = []
    for _ in range(3000):
        seq = []
        while len(seq) < 150:
            s = rng.randint(0, len(hist) - 7); seq += hist[s:s + 7]
        x = run(seq[:150], fn); pr.append(x["profit"]); dds.append(x["dd"])
    pr = np.array(pr); dds = np.array(dds)
    print(f"  {nm:<26} profit median {np.median(pr):7.0f}  p5 {np.percentile(pr,5):7.0f}  p95 {np.percentile(pr,95):7.0f} | maxDD median {np.median(dds):6.0f}  p95 {np.percentile(dds,95):6.0f} | P(profit<0) {np.mean(pr<0):.3f}")
