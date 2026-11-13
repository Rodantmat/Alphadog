#!/usr/bin/env python3
"""RISK-OF-LOSS BY STAKING SCHEME (owner 2026-11-12 18:15 PT). READ-ONLY. Same engine as research_stake_risk_of_loss (day ROI per slip resampled in 7-day blocks from the certified plan's 329 days of history,
applied to this season's real daily slip volume per app, 145 slate days left), now for five schemes on the five apps: flat $5, flat $10, the growing-unit LADDER (each app's own earn-the-raise ladder, thresholds scaled to
the app's volume as in the live engine, starting at today's live unit and accumulated profit), flat $10 for 60 slate days then $20, flat $20 all season. Season total = what is already banked + the future.
Banked so far: flat schemes retroactively at that unit ($45.3 per $1 flat... i.e. 90.5 x unit/10), ladder = the real accumulated per app. Edge haircuts 100% / 60% / 30%. Books: apps moving together (worst case) / independent (best case)."""
import os
import numpy as np
import psycopg

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
hist = []
for lab in ("s2425_p1021", "s2526_p1021"):
    for d, n, up, u in conn.execute("""SELECT game_date, count(*), sum(coalesce(stake_weight,1)*profit), sum(coalesce(stake_weight,1)) FROM nba_score.replay_audit_slips
                                       WHERE label=%s AND status='graded' AND profit IS NOT NULL GROUP BY 1 ORDER BY 1""", (lab,)).fetchall():
        hist.append(float(up) / float(u))
Q = {"PP": "SELECT game_date::date, count(*), sum(profit::float) FROM nba_score.live_slips WHERE status='graded' AND profit IS NOT NULL GROUP BY 1",
     "UD": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.ud_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "SL": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.sleeper_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "FL": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.fliff_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1",
     "BT": "SELECT game_date::date, count(*), sum((profit/NULLIF(stake,0))::float) FROM nba_score.betr_live_slips WHERE status='live' AND profit IS NOT NULL GROUP BY 1"}
live = {}; days = set(); tot_unit_pl = 0.0
for k, q in Q.items():
    r = conn.execute(q).fetchall(); live[k] = {d: (int(n), float(p)) for d, n, p in r}; days |= set(live[k]); tot_unit_pl += sum(p for _, n, p in r)
    if k == "PP":
        hist += [p / n for d, n, p in r]
ua = {a: (float(p), int(u)) for a, p, u in conn.execute("SELECT DISTINCT ON (app) app, profit, unit_usd FROM nba_score.live_unit_app ORDER BY app, game_date DESC, updated_at DESC").fetchall()}
conn.close()
days = sorted(days); keys = list(Q)
vol = {k: np.array([live[k].get(d, (0, 0.0))[0] for d in days]) for k in keys}
hist = np.array(hist); rbar = float(hist.mean())
bank_unit_pl = tot_unit_pl            # unit P/L so far over all apps (about 90.5)
amap = {"PP": "pp", "UD": "ud", "SL": "sleeper", "FL": "fliff", "BT": "betr"}
scale = {k: 0.42 * vol[k].mean() / vol["PP"].mean() for k in keys}
print("banked unit P/L (all apps) %.1f; live ladder state: %s; ladder scale per app: %s" % (bank_unit_pl, {a: ua.get(amap[a]) for a in keys}, {k: round(v, 3) for k, v in scale.items()}))
rng = np.random.RandomState(5)
N, D = 3000, 145


def rois(m):
    out = np.empty((N, D))
    for i in range(N):
        seq = []
        while len(seq) < D:
            s = rng.randint(0, len(hist) - 7); seq += list(hist[s:s + 7])
        out[i] = seq[:D]
    return out - (1 - m) * rbar


def unit_for(p, s, floor=1):
    n = 0
    while 25 * (n + 1) * (n + 2) / 2 * s <= p:
        n += 1
    return max(floor, 1 + n)


def sim(m, together):
    R0 = rois(m); res = {}
    N_ = {k: rng.choice(vol[k], size=(N, D)) for k in keys}
    Rk = {k: (R0 if (together or k == "PP") else rois(m)) for k in keys}
    unit_day = {k: N_[k] * Rk[k] for k in keys}          # per-$1 P/L of each app per day
    tot = sum(unit_day.values())
    fut = {}
    for nm, st in (("flat $5", np.full(D, 5.0)), ("flat $10", np.full(D, 10.0)), ("$10 then $20 (60d)", np.where(np.arange(D) < 60, 10.0, 20.0)), ("flat $20", np.full(D, 20.0))):
        fut[nm] = (tot * st).sum(axis=1)
    # ladder: each app its own unit from its own running profit
    lad = np.zeros(N)
    for k in keys:
        p0, u0 = ua.get(amap[k], (0.0, 2))
        prof = np.full(N, float(p0)); acc = np.zeros(N)
        for dday in range(D):
            u = np.array([unit_for(x, scale[k]) for x in prof]) if dday % 1 == 0 else u
            pl = unit_day[k][:, dday] * u
            prof += pl; acc += pl
        lad += acc
    fut["growing unit (ladder)"] = lad
    return fut


banked = {"flat $5": bank_unit_pl * 5, "flat $10": bank_unit_pl * 10, "$10 then $20 (60d)": bank_unit_pl * 10, "flat $20": bank_unit_pl * 20,
          "growing unit (ladder)": float(sum(ua.get(amap[k], (0.0, 0))[0] for k in keys))}
print("banked: " + ", ".join(f"{k} ${v:,.0f}" for k, v in banked.items()))
for m in (1.0, 0.6, 0.3):
    print("\n" + "=" * 110 + f"\nEDGE {int(m*100)}% of history")
    for tg in (True, False):
        fut = sim(m, tg)
        print("  -- apps moving together (worst case)" if tg else "  -- apps independent (best case)")
        for nm, f in fut.items():
            tt = f + banked[nm]
            print(f"     {nm:<24} P(season total<0) {100*np.mean(tt<0):5.1f}% | P(rest of season<0) {100*np.mean(f<0):5.1f}% | season total median {np.median(tt):8.0f} p5 {np.percentile(tt,5):8.0f} p95 {np.percentile(tt,95):8.0f}")
