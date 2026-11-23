#!/usr/bin/env python3
"""
CAPS / OVERLAP / SLIP COUNT for the live honest set (owner 2026-11-23 15:26 PT: "see if any caps, correlation, limits, balance or different composition
would have given better ROI. Sounds like a lot of slips."). READ-ONLY.
Replays honest_live_slip_engine.build() on every past slate (as audit_honest_live_replay.py), keeps every slip's own ranked candidate list and pick rules,
then re-composes the day's slips under each rule and grades them on the box scores (same grading as audit_honest_live_replay.py).
Rules tried (per app unless said):
  base                  the live set as built
  playercap X           a player in at most X slips of the app (later slips re-picked from their own list, skipping capped players)
  allcap X              a player in at most X slips across all five apps (apps in the order PP, UD, Sleeper, Fliff, Betr)
  maxslips N            only the first N slips of the app (the engine's priority order)
  overlap M             a slip sharing more than M players with an earlier slip of the app is dropped
  overlapre M           ... re-picked from its own list instead (skipping the shared players beyond M), dropped if the list runs out
Reported: slips a day, units, ROI, ROI without the 5 best days, losing days, longest losing run, max drawdown, and ROI by period.
Env: DATABASE_URL, HR_FROM (2026-10-20), HR_TO (yesterday).
"""
import datetime as dt
import itertools
import math
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL                                  # noqa: E402
import audit_honest_live_replay as RP                                 # noqa: E402

CALLS = {}
_pick = HL.pick


def rec_pick(rows, k, diff_prop=False, skip=(), gcap=1):
    s = _pick(rows, k, diff_prop=diff_prop, skip=skip, gcap=gcap)
    if s is not None:
        CALLS[id(s)] = (rows, dict(diff_prop=diff_prop, gcap=gcap))
    return s


HL.pick = rec_pick
PERIODS = (("2026-10-20", "2026-11-01"), ("2026-11-02", "2026-11-10"), ("2026-11-11", "2026-12-31"))
ORDER = ("prizepicks", "underdog", "sleeper", "fliff", "betr")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    import betr_live_slip_engine as BE
    pr = SL.pricing(conn); rj = BE.rules(conn)
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    box = defaultdict(dict)
    for row in conn.execute("SELECT nba_player_id::text, game_date, " + ", ".join(RP.COLS) + " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[row[1]][row[0]] = [float(x or 0) for x in row[2:]]

    def grade(day, app, k, st, s):
        res = []
        for r in s:
            v = box[day].get(r["pid"]); x = None if v is None else RP.stat(v, r["prop"])
            res.append(None if x is None or x == r["line"] else int(x < r["line"]))
        live = [(h, r) for h, r in zip(res, s) if h is not None]; n = len(live); h = sum(x for x, _ in live); ms = [float(r["leg"].get("m") or 1.0) for _, r in live]
        if n < 2:
            return 0.0
        if app == "underdog":
            pay = 1.0 if n < k else ({(4, 4): 7.2, (4, 3): 1.4, (3, 3): 3.25, (3, 2): 1.09}.get((n, h), 0.0) if st == "flex" else ((3.5 if k == 2 else 6.5) if h == n else 0.0))
        elif app == "prizepicks":
            pay = (RP.PP_PWR[2] if h == 2 else 0.0) if n == 2 else (6.0 if h == 3 else 0.0) if (st == "power" and n == 3) else RP.PP_FLEX.get((n, n - h), 0.0)
        elif app == "fliff":
            pay = math.prod(ms) if h == n else 0.0
        elif app == "sleeper":
            pay = (math.prod(ms) * pr[0].get(n, 1.0) if h == n else 0.0) if st == "max" or n < 3 else float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0))
        else:
            pay = float(rj["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
        return pay - 1

    def recompose(plan, rule, x):
        out = {}
        used_all = defaultdict(int)
        for app in ORDER:
            slips = plan.get(app, [])
            used = defaultdict(int); kept = []
            for i, (code, k, st, s, cand, kw) in enumerate(slips):
                if rule == "base":
                    kept.append((code, k, st, s)); continue
                if rule == "maxslips":
                    if i < x:
                        kept.append((code, k, st, s))
                    continue
                if rule in ("playercap", "allcap"):
                    cnt = used if rule == "playercap" else used_all
                    bad = {p for p, c in cnt.items() if c >= x}
                    s2 = s if not ({r["pid"] for r in s} & bad) else _pick(cand, k, skip=bad, **kw)
                    if s2 is None:
                        continue
                    kept.append((code, k, st, s2))
                    for r in s2:
                        used[r["pid"]] += 1; used_all[r["pid"]] += 1
                    continue
                if rule in ("overlap", "overlapre"):
                    ps = {r["pid"] for r in s}
                    worst = max([len(ps & {r["pid"] for r in t}) for _, _, _, t in kept] or [0])
                    if worst <= x:
                        kept.append((code, k, st, s)); continue
                    if rule == "overlap":
                        continue
                    # re-pick: skip players of earlier slips that would push the share past x (greedy: skip every player already in an earlier slip,
                    # then allow up to x of them back in rank order)
                    seen = set().union(*[{r["pid"] for r in t} for _, _, _, t in kept])
                    s2 = None
                    for allow in range(x, -1, -1):
                        keep_ok = set([r["pid"] for r in cand if r["pid"] in seen][:allow])
                        s2 = _pick(cand, k, skip=seen - keep_ok, **kw)
                        if s2 is not None and max([len({r["pid"] for r in s2} & {r["pid"] for r in t}) for _, _, _, t in kept] or [0]) <= x:
                            break
                        s2 = None
                    if s2 is not None:
                        kept.append((code, k, st, s2))
            out[app] = kept
        return out

    rules = [("base", 0)] + [("playercap", v) for v in (1, 2, 3, 4, 6)] + [("allcap", v) for v in (2, 3, 5, 8, 12)] + \
            [("maxslips", v) for v in (1, 2, 3, 4, 6)] + [("overlap", v) for v in (0, 1, 2, 3)] + [("overlapre", v) for v in (0, 1, 2, 3)]
    res = defaultdict(lambda: defaultdict(dict))           # rule -> day -> app -> [units]
    for day in days:
        CALLS.clear()
        try:
            plan, notes = HL.build(conn, day, HL.ALL_APPS)
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"CP|{day}: build failed ({type(e).__name__}: {str(e)[:200]})", flush=True); continue
        full = {}
        for app, slips in plan.items():
            full[app] = []
            for code, k, st, s, cand in slips:
                c0, kw = CALLS.get(id(s), (cand, dict(diff_prop=False, gcap=1)))
                full[app].append((code, k, st, s, c0, kw))
        for rule, x in rules:
            comp = recompose(full, rule, x)
            for app, kept in comp.items():
                res[(rule, x)][day][app] = [grade(day, app, k, st, s) for code, k, st, s in kept]
        print(f"CP|{day}: built " + ", ".join(f"{a} {len(v)}" for a, v in plan.items()), flush=True)

    def report(label, sel):
        for (rule, x), byday in res.items():
            pnl = []; n = 0; per = defaultdict(lambda: [0, 0.0])
            for day in sorted(byday):
                u = [v for app, vs in byday[day].items() if sel(app) for v in vs]
                n += len(u); pnl.append(sum(u))
                for lo, hi in PERIODS:
                    if lo <= str(day) <= hi:
                        per[lo][0] += len(u); per[lo][1] += sum(u)
            if not n:
                continue
            cum = list(itertools.accumulate(pnl)); peak = dd = 0.0
            for c in cum:
                peak = max(peak, c); dd = max(dd, peak - c)
            run = best = 0
            for p in pnl:
                run = run + 1 if p < 0 else 0; best = max(best, run)
            wo5 = sum(sorted(pnl)[:-5]) / n
            print(f"CP|  {label:10s} {rule:9s} {x:2d}: {n / len(pnl):4.1f} slips/day | {sum(pnl):+7.1f} u ROI {100 * sum(pnl) / n:+6.1f}% | w/o 5 best days {100 * wo5:+6.1f}% | "
                  f"losing days {sum(p < 0 for p in pnl)}/{len(pnl)} run {best} | dd {dd:5.1f} u | by period " +
                  " / ".join(f"{100 * v[1] / max(1, v[0]):+.0f}% ({v[0]})" for v in per.values()), flush=True)

    print("CP|================ composition rules ================", flush=True)
    report("ALL APPS", lambda a: True)
    for app in ORDER:
        report(app, lambda a, app=app: a == app)
    print("CP|DONE", flush=True)


if __name__ == "__main__":
    main()
