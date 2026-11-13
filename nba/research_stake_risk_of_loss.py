#!/usr/bin/env python3
"""RISK-OF-LOSS STUDY (owner 2026-11-12 18:10 PT: "if I go flat $10, and in ~2 months flat $20, what are my chances of losing money this season?"). READ-ONLY.
Day ROI per slip is resampled (7-day blocks) from the certified PrizePicks plan's real history (replay 2024-25 + 2025-26 played slips, plus this season's 21 real days) and applied to this season's REAL daily slip volume per app
(live graded slips per slate day, resampled from the 21 real days: PrizePicks / Underdog / Sleeper / Fliff / Betr).  Remaining slate days: 145 (Nov 12 -> mid April, regular season).
Schedules: A = flat $10 all 145 days;  B = flat $10 for the first 60 slate days then flat $20 (about two months);  C = flat $20 all season (for reference).
Books: PP only | all five apps moving together (same day ROI - the worst case) | all five apps independent (best case).
Edge haircuts: the sampled ROI scaled to 100% / 60% / 30% / 0% of history (0% = no edge at all).
Reports P(future P/L < 0), P(season total < 0 counting the $905 already banked at $10 flat), median / 5th / 95th pct of future P/L, max drawdown median / 95th, P(drawdown ever > $500 / > $1000)."""
import os
import numpy as np
import psycopg

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
hist = []
for lab in ("s2425_p1021", "s2526_p1021"):
    for d, n, up, u in conn.execute("""SELECT game_date, count(*), sum(coalesce(stake_weight,1)*profit), sum(coalesce(stake_weight,1)) FROM nba_score.replay_audit_slips
                                       WHERE label=%s AND status='graded' AND profit IS NOT NULL GROUP BY 1 ORDER BY 1""", (lab,)).fetchall():
        hist.append(float(up) / float(u))
live = {}
Q = {"PP": "SELECT game_date::date, count(*), sum(profit::float) FROM nba_score.live_slips WHERE status='graded' AND profit IS NOT NULL GROUP BY 1",
     "UD": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.ud_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "SL": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.sleeper_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "FL": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.fliff_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "BT": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.betr_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1"}
days = set(); 
for k, q in Q.items():
    r = conn.execute(q).fetchall(); live[k] = {d: (int(n), float(p)) for d, n, p in r}; days |= set(live[k])
    if k == "PP":
        hist += [p / n for d, n, p in r]
conn.close()
days = sorted(days)
vol = {k: np.array([live[k].get(d, (0, 0.0))[0] for d in days]) for k in live}
print("real daily slips per slate day (mean over %d days):" % len(days), {k: round(float(v.mean()), 2) for k, v in vol.items()})
hist = np.array(hist); rbar = float(hist.mean()); print(f"history day ROI per slip: mean {rbar:+.3f}, {len(hist)} days, losing days {100*np.mean(hist<0):.0f}%")
rng = np.random.RandomState(11)
N, D = 4000, 145


def rois(m):
    out = np.empty((N, D))
    for i in range(N):
        seq = []
        while len(seq) < D:
            s = rng.randint(0, len(hist) - 7); seq += list(hist[s:s + 7])
        out[i] = np.array(seq[:D])
    return out - (1 - m) * rbar


sched = {"A flat $10": np.full(D, 10.0), "B $10 then $20 after 60 days": np.where(np.arange(D) < 60, 10.0, 20.0), "C flat $20": np.full(D, 20.0)}
for m in (1.0, 0.6, 0.3, 0.0):
    R = rois(m)
    print("\n" + "=" * 140 + f"\nEDGE = {int(m*100)}% of history (day ROI per slip mean {m*rbar:+.3f})")
    for book in ("PP only", "5 apps together", "5 apps independent"):
        V = np.zeros((N, D))
        if book == "PP only":
            V = rng.choice(vol["PP"], size=(N, D)) * R
        elif book == "5 apps together":
            idx = rng.randint(0, len(days), size=(N, D))
            tot = sum(vol[k][idx] for k in vol)
            V = tot * R
        else:
            for k in vol:
                Rk = rois(m) if k != "PP" else R
                V += rng.choice(vol[k], size=(N, D)) * Rk
        print(f"  -- {book}")
        for nm, st in sched.items():
            pl = V * st; eq = np.cumsum(pl, axis=1); fut = eq[:, -1]
            pk = np.maximum.accumulate(np.concatenate([np.zeros((N, 1)), eq], axis=1), axis=1)[:, 1:]; dd = (pk - eq).max(axis=1)
            print(f"     {nm:<30} P(future<0) {100*np.mean(fut<0):5.1f}% | P(season total<0 incl. $905 banked) {100*np.mean(fut < -905):5.1f}% | future P/L median {np.median(fut):8.0f} p5 {np.percentile(fut,5):8.0f} p95 {np.percentile(fut,95):8.0f} | maxDD median {np.median(dd):6.0f} p95 {np.percentile(dd,95):6.0f} | P(DD>$500) {100*np.mean(dd>500):4.0f}% P(DD>$1000) {100*np.mean(dd>1000):4.0f}%")
