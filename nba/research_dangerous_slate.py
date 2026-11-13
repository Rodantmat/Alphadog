#!/usr/bin/env python3
"""DANGEROUS-SLATE STUDY (owner 2026-11-12 17:59 PT: "is there a way to identify a dangerous slate, so I'd stake $5 instead of $10, or is it not reliable?"). READ-ONLY.
Day-level PrizePicks results of the certified plan (replay 2024-25 / 2025-26 *_p1021, played slips) + this season's real played slips. Features known BEFORE tip-off (board / slip shape only, no results):
slips, units, games, slips per game, Under share, line-moved share, distinct props, big-slip share (5+ picks), mean pf20, weekday, days into season; and momentum from earlier days only (prev day, last 3, last 7 day P/L; losing streak).
Test = honest out-of-sample: cut points are learned on ONE season and applied to the OTHER (and the real season gets both). For each feature: Spearman vs day unit ROI and vs 'losing day', tercile table, and the money test: stake x0.5 on flagged (worst-tercile-by-training) days vs full stake.
Also: base rate of losing days, how losing days cluster (day after a losing day / 2 / 3 in a row), weekday table."""
import os, json
import numpy as np
import psycopg
from scipy.stats import spearmanr

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")


def load(sql, args=()):
    out = {}
    for d, legs_json, size, profit, w in conn.execute(sql, args).fetchall():
        try:
            legs = legs_json if isinstance(legs_json, list) else json.loads(legs_json)
        except Exception:
            continue
        o = out.setdefault(d, dict(n=0, units=0.0, up=0.0, ev=set(), under=0, legs=0, moved=0, props=set(), big=0, pf=[], ),)
        w = float(w if w is not None else 1.0)
        o["n"] += 1; o["units"] += w; o["up"] += w * float(profit)
        if size and int(size) >= 5:
            o["big"] += 1
        for l in legs:
            o["legs"] += 1; o["under"] += str(l.get("side")) == "Under"; o["moved"] += str(l.get("line_move", "same")) not in ("same", "None", "")
            o["ev"].add(l.get("event_id")); o["props"].add(l.get("prop"))
            if l.get("pf20") is not None:
                o["pf"].append(float(l["pf20"]))
    return out


Q = "SELECT game_date, legs_json, size, profit, stake_weight FROM nba_score.replay_audit_slips WHERE label=%s AND status='graded' AND profit IS NOT NULL"
S = {"2024-25": load(Q, ("s2425_p1021",)), "2025-26": load(Q, ("s2526_p1021",)),
     "2026-27 real": load("SELECT game_date, legs_json, size, profit, stake_weight FROM nba_score.live_slips WHERE status='graded' AND profit IS NOT NULL AND game_date>='2026-10-20'")}
conn.close()
FE = ["slips", "units", "games", "slips_per_game", "under_share", "moved_share", "props", "big_share", "mean_pf20", "weekday", "season_day", "prev1", "prev3", "prev7", "lose_streak"]


def table(sea):
    ds = sorted(S[sea]); rows = []; hist = []
    for i, d in enumerate(ds):
        o = S[sea][d]; roi = o["up"] / o["units"]
        prev = [S[sea][x]["up"] for x in ds[max(0, i - 7):i]]
        ls = 0
        for x in reversed(ds[:i]):
            if S[sea][x]["up"] < 0:
                ls += 1
            else:
                break
        f = dict(slips=o["n"], units=o["units"], games=len(o["ev"]), slips_per_game=o["n"] / max(1, len(o["ev"])), under_share=o["under"] / max(1, o["legs"]), moved_share=o["moved"] / max(1, o["legs"]),
                 props=len(o["props"]), big_share=o["big"] / o["n"], mean_pf20=float(np.mean(o["pf"])) if o["pf"] else 0.0, weekday=d.weekday(), season_day=i,
                 prev1=prev[-1] if prev else 0.0, prev3=sum(prev[-3:]), prev7=sum(prev), lose_streak=ls)
        rows.append((d, roi, o["up"], o["units"], f))
    return rows


T = {s: table(s) for s in S}
allr = [r for s in ("2024-25", "2025-26", "2026-27 real") for r in T[s]]
print("=" * 150)
for s in T:
    r = T[s]; up = np.array([x[2] for x in r]); print(f"{s}: {len(r)} days, losing days {100*np.mean(up<0):.0f}%, flat-stake day P/L mean {up.mean():+.1f}u median {np.median(up):+.1f}u, 5th pct {np.percentile(up,5):+.1f}u")
print("\n##### do losing days cluster?  P(losing | previous day losing) vs P(losing | previous day won); and after 2 / 3 losing days in a row")
for s in T:
    u = [x[2] < 0 for x in T[s]]; a = [u[i] for i in range(1, len(u)) if u[i - 1]]; b = [u[i] for i in range(1, len(u)) if not u[i - 1]]
    c = [u[i] for i in range(2, len(u)) if u[i - 1] and u[i - 2]]; e = [u[i] for i in range(3, len(u)) if u[i - 1] and u[i - 2] and u[i - 3]]
    print(f"  {s}: after a loss {100*np.mean(a):.0f}% (n{len(a)}), after a win {100*np.mean(b):.0f}% (n{len(b)}), after 2 losses {100*np.mean(c) if c else float('nan'):.0f}% (n{len(c)}), after 3 losses {100*np.mean(e) if e else float('nan'):.0f}% (n{len(e)})")
print("\n##### weekday (0=Mon): days, mean day unit ROI, losing days")
for w in range(7):
    x = [(r[1], r[2] < 0) for r in allr if r[4]["weekday"] == w]
    print(f"  {w}: {len(x)} days, ROI {100*np.mean([a for a, _ in x]):+.0f}%, losing {100*np.mean([b for _, b in x]):.0f}%")
print("\n##### each feature: Spearman with day ROI and with losing day, per season; then OUT-OF-SAMPLE tercile test (cuts from the other season)")
for k in FE:
    line = f"  {k:<15}"
    for s in ("2024-25", "2025-26", "2026-27 real"):
        x = [r[4][k] for r in T[s]]; y = [r[1] for r in T[s]]; z = [r[2] < 0 for r in T[s]]
        a = spearmanr(x, y)[0]; b = spearmanr(x, z)[0]
        line += f" | {s[:7]} ROI rho {a:+.2f} lose rho {b:+.2f}"
    print(line)
print("\n##### money test: stake x0.5 on days the feature puts in the WORST tercile (cut learned on the other season), vs full stake. Shown: change in P/L (units), change in max drawdown, flagged days / losing share on flagged vs unflagged")


def dd(p):
    c = np.cumsum(p); return float((np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c).max())


res = []
for k in FE:
    for tr, te in (("2024-25", "2025-26"), ("2025-26", "2024-25"), ("2024-25", "2026-27 real"), ("2025-26", "2026-27 real")):
        x = np.array([r[4][k] for r in T[tr]]); y = np.array([r[1] for r in T[tr]])
        lo, hi = np.percentile(x, [33.3, 66.7]); worst_low = y[x <= lo].mean() < y[x >= hi].mean()
        xt = np.array([r[4][k] for r in T[te]]); up = np.array([r[2] for r in T[te]])
        flag = (xt <= lo) if worst_low else (xt >= hi)
        st = np.where(flag, 0.5, 1.0); full = up; red = up * st
        res.append((k, tr, te, "low" if worst_low else "high", red.sum() - full.sum(), dd(red) - dd(full), int(flag.sum()), 100 * np.mean(up[flag] < 0) if flag.any() else 0, 100 * np.mean(up[~flag] < 0) if (~flag).any() else 0))
for k in FE:
    rr = [r for r in res if r[0] == k]
    print(f"  {k:<15}" + " | ".join(f"{r[1][:7]}->{r[2][:7]} flag {r[3]} n{r[6]}: P/L {r[4]:+6.1f}u dd {r[5]:+5.1f}u lose {r[7]:.0f}% vs {r[8]:.0f}%" for r in rr))
print("\n(reading: a detector only counts if it helps in BOTH directions and on the real season; P/L is always <0 when you halve stake on a +EV plan unless the flagged days are truly worse than the rest)")
