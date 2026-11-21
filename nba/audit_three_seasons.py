#!/usr/bin/env python3
"""
THREE-SEASON REAL-BOARD REPLAY OF THE LIVE SET - EVERY STRATEGY, THE WHOLE PORTFOLIO, EXPOSURE CAPS. READ-ONLY.
(owner 2026-11-20 19:54 PT: "real backtest ... get the boards and make real slips, real graded ... on the snapshots"; "hold positive this season and the past two")
honest_live_slip_engine.build() on every slate of HS_SEASON from the boards stored that day (PrizePicks / Underdog window boards exist for 2024-25, 2025-26, 2026-27;
Sleeper / Fliff / Betr only for 2026-27), graded on the box scores (push / did not play voids the leg, the slip pays one size down, a 2-pick refunds).
Honesty:
  - the model number of every leg BEFORE 2026-10-01 is the CERTIFIED honest history (nba_score.v_legs_honest.p_honest_baseline at the same app, player, stat,
    side, line); a leg without one is dropped. Production's stored baseline_hp is used only for 2026-27 (it is what live reads; HS_ALL_HONEST=1 swaps it too).
  - the blend weights of each slate are the walk-forward weights of ITS month (nba_score.honest_blend_weights, month <= slate month), never later ones.
Prints per strategy (slips, units, ROI, legs hit), per app, the whole set per day (worst days, drawdown, losing runs, days up), and exposure caps per player
(1..8, none) across all apps.
Env: DATABASE_URL, HS_SEASON (2024-25 | 2025-26 | 2026-27), HS_TO (last day, default yesterday), HS_ALL_HONEST.
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
import live_slip_engine as LSE
import ud_live_slip_engine as UD

STAT = {"points": 0, "rebounds": 1, "assists": 2, "threes_made": 3, "steals": 4, "blocks": 5, "turnovers": 6}
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
SEASON = {"2024-25": ("2024-10-01", "2025-07-01"), "2025-26": ("2025-10-01", "2026-07-01"), "2026-27": ("2026-10-01", "2027-07-01")}
HONEST = {}


def patch(conn):
    """swap the model number of every leg for the certified honest history (before 2026-10-01, or always with HS_ALL_HONEST)"""
    o_pp, o_ud = LSE.load_board_legs_live, UD.load_legs

    def honest_map(day, app):
        k = (day, app)
        if k not in HONEST:
            HONEST[k] = {(str(p), pr, sd[0].lower(), round(float(ln), 2)): float(ph) for p, pr, sd, ln, ph in conn.execute(
                "SELECT player_id::text, prop, side, line, p_honest_baseline FROM nba_score.v_legs_honest WHERE app=%s AND game_date=%s AND kind='regular' AND p_honest_baseline IS NOT NULL",
                (app, day)).fetchall()}
        return HONEST[k]

    def swap(legs, day, app):
        if day >= dt.date(2026, 10, 1) and os.environ.get("HS_ALL_HONEST") != "1":
            return legs
        m = honest_map(day, app); out = []
        for l in legs:
            if l.get("rank_key") != "baseline_hp":
                out.append(l); continue
            v = m.get((str(l["player_id"]), l["prop"], str(l["side"])[0].lower(), round(float(l["line"]), 2)))
            if v is None:
                continue
            l = dict(l); l["score"] = v; out.append(l)
        return out

    o_ctx = HL.context

    def ctx_(conn_, day, pids):
        c = o_ctx(conn_, day, pids)
        if not c["game"]:            # 2024-25 has no slate calendar: games and home sides from the box scores of the day
            for t, gid, mu in conn_.execute("SELECT DISTINCT team_id::text, game_id::text, matchup FROM nba_stats.player_game_log WHERE game_date = %s", (day,)).fetchall():
                c["game"][t] = gid
                if mu and "vs." in mu:
                    c["home"].add(t)
        return c
    HL.context = ctx_
    LSE.load_board_legs_live = lambda conn_, day, *a, **k: swap(o_pp(conn_, day, *a, **k), day, "prizepicks")
    UD.load_legs = lambda conn_, day, *a, **k: swap(o_ud(conn_, day, *a, **k), day, "underdog")


def pick_cap(cand, k, used, cap, gcap=1, diff_prop=False):
    out, games, players, props = [], {}, set(), set()
    for r in cand:
        if r["pid"] in players or games.get(r["game"], 0) >= gcap or (diff_prop and r["prop"] in props) or (cap and used[r["pid"]] >= cap):
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
    season = os.environ.get("HS_SEASON", "2026-27"); a, b = SEASON[season]
    d1 = min(dt.date.fromisoformat(b), dt.date.fromisoformat(os.environ.get("HS_TO") or str(dt.date.today() - dt.timedelta(days=1))))
    days = [r[0] for r in conn.execute("""SELECT DISTINCT b.game_date FROM nba_market.board_snapshots b WHERE b.game_date >= %s AND b.game_date <= %s
                                          AND b.bookmaker IN ('prizepicks','underdog')
                                          AND EXISTS (SELECT 1 FROM nba_stats.player_game_log g WHERE g.game_date = b.game_date) ORDER BY 1""", (a, d1)).fetchall()]
    W = defaultdict(dict)
    for app, month, w in conn.execute("SELECT app, month, weights FROM nba_score.honest_blend_weights ORDER BY month").fetchall():
        W[app][month] = w if isinstance(w, list) else __import__("json").loads(w)
    patch(conn)
    box = defaultdict(dict)
    for pid, gd, *st in conn.execute("SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log WHERE game_date >= %s AND game_date <= %s AND min > 0", (a, d1)).fetchall():
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
        mk = day.strftime("%Y-%m")
        w = {app: (W[app][max(m for m in W[app] if m <= mk)] if any(m <= mk for m in W[app]) else HL.WEIGHTS[app]) for app in ("underdog", "prizepicks")}
        try:
            plans[day] = HL.build(conn, day, HL.ALL_APPS, weights=w)[0]
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"HS|{day}: build failed ({type(e).__name__}: {str(e)[:160]})", flush=True)
    print(f"HS|{season}: slates replayed {len(plans)} ({min(plans) if plans else '-'} .. {max(plans) if plans else '-'})", flush=True)

    def run(cap):
        per = defaultdict(lambda: [0, 0.0, 0, 0]); daily = []; legs_all = []
        for day, plan in plans.items():
            used = defaultdict(int); du = 0.0; ns = 0; seen = {}
            for app, slips in plan.items():
                for code, k, st, s, cand in slips:
                    if cap:
                        s = pick_cap(cand, k, used, cap, gcap=2 if code in ("U8", "U9", "U22") else 1, diff_prop=code in ("P6", "P24"))
                        if s is None:
                            continue
                    for r in s:
                        used[r["pid"]] += 1
                    u, res = grade(app, k, st, s, day)
                    t = per[code]; t[0] += 1; t[1] += u; t[2] += sum(x for x in res if x is not None); t[3] += sum(x is not None for x in res)
                    for r, h in zip(s, res):
                        if h is not None:
                            seen.setdefault((r["pid"], r["prop"]), h)
                    du += u; ns += 1
            if ns:
                daily.append((day, du, ns, np.mean(list(seen.values())) if seen else np.nan)); legs_all += list(seen.values())
        u = np.array([d[1] for d in daily]); cum = np.cumsum(u)
        dd = float(np.max(np.maximum.accumulate(cum) - cum)) if len(cum) else 0.0
        run_l = mx = 0
        for x in u:
            run_l = run_l + 1 if x < 0 else 0; mx = max(mx, run_l)
        months = defaultdict(float)
        for d in daily:
            months[d[0].strftime("%Y-%m")] += d[1]
        n = sum(d[2] for d in daily); tot = float(u.sum()) if len(u) else 0.0
        return dict(per=per, daily=daily, n=n, units=tot, roi=tot / max(1, n), dd=dd, worst=float(u.min()) if len(u) else 0.0, up=float((u > 0).mean()) if len(u) else 0.0,
                    run=mx, months=months, legs=float(np.mean(legs_all)) if legs_all else float("nan"), nl=len(legs_all), sd=float(u.std()) if len(u) else 0.0)

    base = run(None)
    print(f"HS|==== {season}: every strategy (1 unit a slip) ====", flush=True)
    for code in sorted(base["per"], key=lambda c: (c[0], int(c[1:]))):
        n, u, h, m = base["per"][code]
        print(f"HS|  {code:4s}: slips {n:4d} | units {u:+7.1f} | ROI {100*u/max(1,n):+6.1f}% | legs hit {100*h/max(1,m):.1f}%", flush=True)
    for pre, nm in (("U", "Underdog"), ("P", "PrizePicks"), ("S", "Sleeper"), ("F", "Fliff"), ("B", "Betr")):
        n = sum(v[0] for c, v in base["per"].items() if c[0] == pre); u = sum(v[1] for c, v in base["per"].items() if c[0] == pre)
        if n:
            print(f"HS|  {nm}: slips {n}, units {u:+.1f}, ROI {100*u/n:+.1f}%", flush=True)
    print(f"HS|==== {season}: the whole set per day ====", flush=True)
    print(f"HS|  slips {base['n']} on {len(base['daily'])} slates | units {base['units']:+.1f} | ROI {100*base['roi']:+.1f}% | distinct legs hit {100*base['legs']:.1f}% ({base['nl']}) | days up {100*base['up']:.0f}% | "
          f"drawdown {base['dd']:.1f} u | worst day {base['worst']:+.1f} | daily sd {base['sd']:.1f} | longest losing-day run {base['run']} | losing months {sum(v < 0 for v in base['months'].values())} of {len(base['months'])}", flush=True)
    print("HS|  months: " + " | ".join(f"{m} {v:+.1f}" for m, v in sorted(base["months"].items())), flush=True)
    for d in sorted(base["daily"], key=lambda x: x[1])[:5]:
        print(f"HS|  worst day {d[0]}: {d[1]:+.1f} u on {d[2]} slips, distinct legs hit {100*d[3]:.0f}%", flush=True)
    print(f"HS|==== {season}: cap per player across all apps ====", flush=True)
    for cap in (1, 2, 3, 4, 5, 6, 8):
        r = run(cap)
        print(f"HS|  cap {cap}: slips {r['n']:5d} | units {r['units']:+7.1f} | ROI {100*r['roi']:+6.1f}% | drawdown {r['dd']:6.1f} | worst day {r['worst']:+6.1f} | daily sd {r['sd']:5.1f} | days up {100*r['up']:.0f}% | "
              f"losing months {sum(v < 0 for v in r['months'].values())}/{len(r['months'])} | apps " +
              " ".join(f"{pre}:{sum(v[1] for c, v in r['per'].items() if c[0] == pre):+.0f}" for pre in "UPSFB" if any(c[0] == pre for c in r["per"])), flush=True)
    print("HS|DONE", flush=True)


if __name__ == "__main__":
    main()
