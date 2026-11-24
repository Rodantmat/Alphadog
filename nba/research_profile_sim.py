#!/usr/bin/env python3
"""
WHAT EACH PERSON WOULD HAVE ACCUMULATED (owner 2026-11-24 15:22 PT: "What would be the accumulated for each me, Jon and Jessi playing by these strategies with each
profile rules? Real slips, real board snapshots, real legs, real multipliers. Consider daily average leg and board drifting and legs pulled by the time slips are
usually placed. Also consider the gradual stake increase as the current rule"). READ-ONLY.
- Slips: honest_live_slip_engine.build() as it runs today (all rules: 25% live / 5% fallback set, overlap / player caps, spread 8, rest) on every slate of the
  season, from the boards the pipeline captured that day (real legs, real Sleeper / Fliff multipliers, PrizePicks / Underdog tables), graded on the box scores
  (a player who did not play is voided, the slip pays as one pick smaller, as the apps do).
- Drift / pulled legs: each leg is gone by placement time with the app's MEASURED rate - the share of legs Jessi's and Jon's pages found substituted or pulled
  at their first open (nba_jessi.seen / nba_friend.seen, 16 slates): PrizePicks 20.9%, Underdog 24.1%, Sleeper 12.6%, Fliff 14.6%, Betr 31.3%. A gone leg follows
  the strategy's leg-gone rule: SHRINK (S7 S8 F6 F7) one pick smaller, DROP (S9 S11 F10) the slip is not played, SUB (rest) the next leg of its own list (P1 / P4 /
  U11 / U2: the app's main list) that is another player within the game cap. 500 random seasons.
- Profiles: OWNER every slip, all apps; JESSI copies on PrizePicks / Sleeper / Fliff, at most 4 a day per app; JON copies on PrizePicks / Underdog / Sleeper /
  Fliff, at most 4 a day per app (tier 1), no stake - units only. Stakes: $1, +$1 for every 25 units won since the start (that person's own slips), the same steps
  down, floor $1.
Env: DATABASE_URL, HR_FROM (2026-10-20), HR_TO (2026-11-23), PS_DRAWS (500).
"""
import datetime as dt
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL                                  # noqa: E402
import audit_honest_live_replay as RP                                 # noqa: E402

DRIFT = {"prizepicks": 0.209, "underdog": 0.241, "sleeper": 0.126, "fliff": 0.146, "betr": 0.313}
RULE = {"S7": "shrink", "S8": "shrink", "F6": "shrink", "F7": "shrink", "S9": "drop", "S11": "drop", "F10": "drop"}
PROFILES = {"owner": (("prizepicks", "underdog", "sleeper", "fliff", "betr"), 99, True),
            "jessi": (("prizepicks", "sleeper", "fliff"), 4, True),
            "jon": (("prizepicks", "underdog", "sleeper", "fliff"), 4, False)}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    import betr_live_slip_engine as BE
    pr = SL.pricing(conn); rj = BE.rules(conn)
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or "2026-11-23")
    draws = int(os.environ.get("PS_DRAWS") or 500)
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    box = defaultdict(dict)
    for row in conn.execute("SELECT nba_player_id::text, game_date, " + ", ".join(RP.COLS) + " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[row[1]][row[0]] = [float(x or 0) for x in row[2:]]

    def hit(day, r):
        v = box[day].get(r["pid"]); x = None if v is None else RP.stat(v, r["prop"])
        return None if x is None or x == r["line"] else int(x < r["line"])

    def pay(app, k, st, legs):
        """legs: [(hit or None, m)] -> units won (payout - 1); fewer than 2 live legs = stake back (0)"""
        live = [(h, m) for h, m in legs if h is not None]; n = len(live); h = sum(x for x, _ in live); ms = [m for _, m in live]
        if n < 2:
            return 0.0
        if app == "underdog":
            p = 1.0 if n < k and st != "flex" and False else ({(4, 4): 7.2, (4, 3): 1.4, (3, 3): 3.25, (3, 2): 1.09}.get((n, h), 0.0) if st == "flex" else
                                                           ({2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}[n] if h == n else 0.0))
        elif app == "prizepicks":
            p = ({2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}[n] if h == n else 0.0) if (st == "power" or n == 2) else RP.PP_FLEX.get((n, n - h), 0.0)
        elif app == "fliff":
            p = math.prod(ms) if h == n else 0.0
        elif app == "sleeper":
            p = (math.prod(ms) * pr[0].get(n, 1.0) if h == n else 0.0) if st == "max" or n < 3 else float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0))
        else:
            p = float(rj["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
        return p - 1

    rec = []    # per day: list of slips (app, code, k, st, legs[(hit, m, pid, game)], subs[(hit, m, pid, game)] in order)
    for day in days:
        try:
            plan, notes = HL.build(conn, day, HL.ALL_APPS)
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"PS|{day}: build failed ({type(e).__name__}: {str(e)[:150]})", flush=True); rec.append((day, [])); continue
        out = []
        for app in ("prizepicks", "underdog", "sleeper", "fliff", "betr"):
            for code, k, st, s, cand in plan.get(app, []):
                legs = [(hit(day, r), float(r["leg"].get("m") or 1.0), r["pid"], r.get("game")) for r in s]
                on = {r["pid"] for r in s}
                subs = [(hit(day, r), float(r["leg"].get("m") or 1.0), r["pid"], r.get("game")) for r in cand if r["pid"] not in on][:15]
                out.append((app, code, k, st, legs, subs))
        rec.append((day, out))
        print(f"PS|{day}: " + ", ".join(f"{a} {len(v)}" for a, v in plan.items()), flush=True)

    def slip_units(app, code, k, st, legs, subs, rng):
        if rng is None:
            return pay(app, k, st, [(h, m) for h, m, _p, _g in legs])
        gone = rng.random(len(legs)) < DRIFT[app]
        if not gone.any():
            return pay(app, k, st, [(h, m) for h, m, _p, _g in legs])
        rule = RULE.get(code, "sub")
        if rule == "drop":
            return None                                              # not played
        kept = [x for x, g in zip(legs, gone) if not g]
        if rule == "shrink":
            return pay(app, len(kept), st, [(h, m) for h, m, _p, _g in kept]) if len(kept) >= 2 else None
        out = list(kept); used = {p for _h, _m, p, _g in kept}
        for c in subs:
            if len(out) == k:
                break
            if c[2] in used or rng.random() < DRIFT[app]:               # the next leg can be gone too
                continue
            if sum(1 for x in out if x[3] is not None and x[3] == c[3]) >= (2 if code in ("U9", "U10", "P11", "B8") else 1):
                continue
            out.append(c); used.add(c[2])
        return pay(app, len(out), st, [(h, m) for h, m, _p, _g in out]) if len(out) >= 2 else None

    def season(profile, rng):
        apps, cap, stake = PROFILES[profile]
        cum = 0.0; u = 1.0; dol = 0.0; n = 0; units = 0.0; peak = 0.0; dd = 0.0
        for day, slips in rec:
            dayu = 0.0; dayd = 0.0; per = defaultdict(int)
            for app, code, k, st, legs, subs in slips:
                if app not in apps or per[app] >= cap:
                    continue
                per[app] += 1
                x = slip_units(app, code, k, st, legs, subs, rng)
                if x is None:
                    continue
                n += 1; dayu += x; dayd += x * u
            units += dayu; dol += dayd; cum += dayu
            u = 1.0 + float(int(max(0.0, cum) // 25)) if stake else 1.0
            peak = max(peak, dol); dd = max(dd, peak - dol)
        return units, dol, n, dd, u

    print("PS|================ accumulated, 2026-10-20 .. 2026-11-23 (34 slates) ================", flush=True)
    rng = np.random.default_rng(17)
    for prof in PROFILES:
        u0, d0_, n0, dd0, uf0 = season(prof, None)
        sims = np.array([season(prof, rng) for _ in range(draws)])
        stake = PROFILES[prof][2]
        q = lambda c: np.percentile(sims[:, c], [10, 50, 90])                                       # noqa: E731
        print(f"PS|  {prof.upper():6s} as built, no leg gone: {n0} slips, {u0:+.1f} units (ROI {100 * u0 / max(1, n0):+.1f}%)" +
              (f", ${d0_:+.0f} with the stake ladder (ends at ${uf0:g}, worst drop ${dd0:.0f})" if stake else ""), flush=True)
        ql = q(0); qd = q(1); qn = q(2); qdd = q(3)
        print(f"PS|  {prof.upper():6s} with real drift (median [10% .. 90%] of {draws} seasons): {qn[1]:.0f} slips, {ql[1]:+.1f} units [{ql[0]:+.1f} .. {ql[2]:+.1f}] "
              f"(ROI {100 * ql[1] / max(1, qn[1]):+.1f}%)" + (f", ${qd[1]:+.0f} [{qd[0]:+.0f} .. {qd[2]:+.0f}] with the ladder, worst drop ${qdd[1]:.0f}" if stake else ""), flush=True)
    print("PS|DONE", flush=True)


if __name__ == "__main__":
    main()
