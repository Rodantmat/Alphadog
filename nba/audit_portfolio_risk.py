#!/usr/bin/env python3
"""
PORTFOLIO RISK OF THE LIVE SET - ALL APPS TOGETHER, DAY BY DAY. READ-ONLY. (owner 2026-11-20 19:36 PT: "validate the strategies ... everything is red")
On 2026-11-20 the same few Unders sat in most slips of every app (Aday Mara rebounds in 18 of 31) and lost together. The strategies were measured one
by one; this measures the WHOLE live set as one portfolio, replaying honest_live_slip_engine.build() on every past slate (as audit_honest_live_replay.py):
  1. daily units of the whole set (1 unit a slip), worst days, share of days with 80%+ of legs losing, max drawdown, longest losing run of days
  2. concentration: per day, how many slips the most-used leg (player + stat) sits in, and the day's result by whether that leg hit
  3. EXPOSURE CAPS: rebuild every day with "one player + stat in at most C slips across all apps" (C = 1, 2, 3, 4, 5, 6, 8, 10, none) - each slip
     takes the next legs of its own strategy's list when a leg is capped - ROI, units, drawdown, worst day, daily spread, days up
  4. same with the cap per PLAYER (any stat)
Grading as the parity audit: a push or a player who did not play voids the leg (one size down; a 2-pick refunds).
Env: DATABASE_URL, HR_FROM (2026-10-20), HR_TO (yesterday).
"""
import datetime as dt
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL

STAT = {"points": 0, "rebounds": 1, "assists": 2, "threes_made": 3, "steals": 4, "blocks": 5, "turnovers": 6}
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}


def pick_cap(cand, k, used, cap, by_player, gcap=1, diff_prop=False, skip=()):
    out, games, players, props = [], {}, set(skip), set()
    for r in cand:
        key = r["pid"] if by_player else (r["pid"], r["prop"])
        if r["pid"] in players or games.get(r["game"], 0) >= gcap or (diff_prop and r["prop"] in props):
            continue
        if cap and used[key] >= cap:
            continue
        out.append(r); players.add(r["pid"]); games[r["game"]] = games.get(r["game"], 0) + 1; props.add(r["prop"])
        if len(out) == k:
            return out
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    import betr_live_slip_engine as BE
    pr = SL.pricing(conn); rj = BE.rules(conn)
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    box = defaultdict(dict)
    for pid, gd, *st in conn.execute("SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[gd][pid] = [float(x or 0) for x in st]

    def grade(app, k, st, s, day):
        res = []
        for r in s:
            v = box[day].get(r["pid"])
            res.append(None if v is None or v[STAT[r["prop"]]] == r["line"] else int(v[STAT[r["prop"]]] < r["line"]))
        live = [(h, r) for h, r in zip(res, s) if h is not None]; n = len(live); h = sum(x for x, _ in live); ms = [float(r["leg"].get("m") or 1.0) for _, r in live]
        if n < 2:
            pay = 1.0
        elif app == "underdog":
            pay = 1.0 if n < k else ({(4, 4): 7.2, (4, 3): 1.4, (3, 3): 3.25, (3, 2): 1.09}.get((n, h), 0.0) if st == "flex" else ((3.5 if k == 2 else 6.5) if h == n else 0.0))
        elif app == "prizepicks":
            pay = (3.0 if h == 2 else 0.0) if n == 2 else (6.0 if h == 3 else 0.0) if (st == "power" and n == 3) else PP_FLEX.get((n, n - h), 0.0)
        elif app == "fliff":
            pay = math.prod(ms) if h == n else 0.0
        elif app == "sleeper":
            pay = (math.prod(ms) * pr[0].get(n, 1.0) if h == n else 0.0) if st == "max" or n < 3 else float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0))
        else:
            pay = float(rj["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
        return pay - 1, res

    plans = {}
    for day in days:
        try:
            plans[day] = HL.build(conn, day, HL.ALL_APPS)[0]
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"PR|{day}: build failed ({type(e).__name__}: {str(e)[:160]})", flush=True)
    print(f"PR|slates replayed: {len(plans)} ({min(plans)} .. {max(plans)})", flush=True)

    def run(cap, by_player, verbose=False):
        daily = []; tot_slips = 0; tot_u = 0.0; conc = []
        for day, plan in plans.items():
            used = defaultdict(int); du = 0.0; ns = 0; legs_h = []; legs_n = 0; leg_use = defaultdict(int); leg_res = {}
            for app, slips in plan.items():
                for code, k, st, s, cand in slips:
                    if cap:
                        gc = 2 if code in ("U8", "U9", "U22") else 1
                        dp = code in ("P6", "P24")
                        s2 = pick_cap(cand, k, used, cap, by_player, gcap=gc, diff_prop=dp) if cand else None
                        if s2 is None:
                            continue
                        s = s2
                    for r in s:
                        used[r["pid"] if by_player else (r["pid"], r["prop"])] += 1; leg_use[(r["pid"], r["prop"])] += 1
                    u, res = grade(app, k, st, s, day)
                    for r, h in zip(s, res):
                        if h is not None:
                            legs_h.append(h); leg_res[(r["pid"], r["prop"])] = h
                    du += u; ns += 1
            if ns:
                top = max(leg_use.items(), key=lambda x: x[1])
                daily.append((day, du, ns, np.mean(legs_h) if legs_h else np.nan, top[1], leg_res.get(top[0])))
                tot_slips += ns; tot_u += du
        u = np.array([d[1] for d in daily]); cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(cum) - cum)) if len(cum) else 0
        run_l = mx = 0
        for x in u:
            run_l = run_l + 1 if x < 0 else 0; mx = max(mx, run_l)
        return dict(slips=tot_slips, units=tot_u, roi=tot_u / max(1, tot_slips), dd=dd, worst=float(u.min()) if len(u) else 0, sd=float(u.std()) if len(u) else 0,
                    up=float((u > 0).mean()) if len(u) else 0, red=float(np.mean([d[3] < 0.2 for d in daily if d[3] == d[3]])), losing_run=mx, daily=daily,
                    slips_day=tot_slips / max(1, len(daily)))

    # UNIQUE LEGS (owner 2026-11-20 19:39 PT: "those legs should hit 55-60%"): every distinct player + stat the live set used that day, graded once
    import scipy.stats as SS
    ud = []
    for day, plan in plans.items():
        seen = {}
        for app, slips in plan.items():
            for code, k, st, s, cand in slips:
                for r in s:
                    v = box[day].get(r["pid"])
                    if v is None or v[STAT[r["prop"]]] == r["line"]:
                        continue
                    seen.setdefault((r["pid"], r["prop"]), (int(v[STAT[r["prop"]]] < r["line"]), r["ph"], r["blend"]))
        if seen:
            h = np.array([x[0] for x in seen.values()]); ph = np.array([x[1] for x in seen.values()]); bl = np.array([x[2] for x in seen.values()])
            ud.append((day, len(h), h.mean(), ph.mean(), bl.mean(), h.sum()))
    H = sum(x[5] for x in ud); N = sum(x[1] for x in ud)
    print("PR|================ 0. the DISTINCT legs the live set used, graded once ================", flush=True)
    print(f"PR|  {N} distinct legs on {len(ud)} slates | hit {100*H/N:.1f}% | the model said {100*np.mean([x[3] for x in ud]):.1f}%, the blend said {100*np.mean([x[4] for x in ud]):.1f}%", flush=True)
    rates = np.array([x[2] for x in ud])
    print(f"PR|  per day: median {100*np.median(rates):.0f}% | worst {100*rates.min():.0f}% | days under 40%: {int((rates < .4).sum())} | under 35%: {int((rates < .35).sum())} | under 30%: {int((rates < .3).sum())}", flush=True)
    for d in sorted(ud, key=lambda x: x[2])[:6]:
        p_ = SS.binom.cdf(d[5], d[1], d[3])
        print(f"PR|  low day {d[0]}: {d[5]}/{d[1]} hit ({100*d[2]:.0f}%), model expected {100*d[3]:.0f}% -> chance of a day this bad or worse if the model is right: {100*p_:.1f}%", flush=True)
    base = run(None, False)
    print("PR|================ 1. the live set as ONE portfolio (1 unit a slip) ================", flush=True)
    print(f"PR|  slips {base['slips']} ({base['slips_day']:.1f} a day) | units {base['units']:+.1f} | ROI {100*base['roi']:+.1f}% | days up {100*base['up']:.0f}% | max drawdown {base['dd']:.1f} u | "
          f"worst day {base['worst']:+.1f} u | daily spread (sd) {base['sd']:.1f} u | longest run of losing days {base['losing_run']} | days with under 20% of legs hitting {100*base['red']:.0f}%", flush=True)
    for d in sorted(base["daily"], key=lambda x: x[1])[:8]:
        print(f"PR|  worst: {d[0]} {d[1]:+.1f} u on {d[2]} slips | legs hit {100*d[3]:.0f}% | top leg in {d[4]} slips, {'hit' if d[5] == 1 else 'missed' if d[5] == 0 else 'void'}", flush=True)
    print("PR|================ 2. concentration ================", flush=True)
    tops = np.array([d[4] for d in base["daily"]]); sl = np.array([d[2] for d in base["daily"]])
    print(f"PR|  most-used leg sits in a median {np.median(tops):.0f} slips a day (max {tops.max()}) = {100*np.median(tops/sl):.0f}% of the day's slips", flush=True)
    for hv, lab in ((1, "top leg HIT"), (0, "top leg MISSED")):
        x = [d[1] / d[2] for d in base["daily"] if d[5] == hv]
        if x:
            print(f"PR|  days the {lab}: {len(x)} | ROI that day median {100*np.median(x):+.0f}%, mean {100*np.mean(x):+.0f}%", flush=True)
    for by_player, lab in ((False, "player + stat"), (True, "player (any stat)")):
        print(f"PR|================ {'3' if not by_player else '4'}. exposure cap per {lab}, across all apps ================", flush=True)
        for cap in (1, 2, 3, 4, 5, 6, 8, 10, None):
            r = base if cap is None else run(cap, by_player)
            print(f"PR|  cap {str(cap or 'none'):>4}: slips {r['slips']:4d} ({r['slips_day']:.1f}/day) | units {r['units']:+7.1f} | ROI {100*r['roi']:+6.1f}% | drawdown {r['dd']:5.1f} u | worst day {r['worst']:+6.1f} | "
                  f"daily sd {r['sd']:4.1f} | days up {100*r['up']:3.0f}% | losing-day run {r['losing_run']} | red days {100*r['red']:.0f}%", flush=True)
    print("PR|DONE", flush=True)


if __name__ == "__main__":
    main()
