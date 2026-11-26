#!/usr/bin/env python3
"""
PORTFOLIO PASS (owner 2026-11-25 21:06 PT: "granulated testing, by number caps for legs, slips, strategies, per apps and totals, fixed number and
percentages"). READ-ONLY. Inputs: the day results of universe 2 (nba_score.ua2_strats / ua2_days: PrizePicks, Underdog, Sleeper, Fliff on their own
boards) and pass 31 (nba_score.p31_days: Sleeper, Fliff, Betr from the cross-app orders). Structures: 2-pick Power, PrizePicks 2-pick Flex, 3-6 Flex.

Selection uses 2024-25 and 2025-26 ONLY (score = the weaker of the two seasons' ROI); Underdog Flex (priced only since 2026-07) is chosen on 2026-27
before PF_SPLIT and judged after it. A strategy enters only if its day results do not move with one already taken (correlation on the selection days
below PF_RHO). Grid: strategies per app 1-8 | slips a day per app fixed 1-8 or none | total slips a day fixed 4-30 or none | an app's share of the
total at most 25 / 40 / 60 / 100%. When a cap binds, the lower-ranked strategies' slips of that day are left out. Every portfolio: ROI and units per
season (2026-27 is unseen by the selection), slips a day, drawdown, drought, share of winning days.
Env: DATABASE_URL, PF_SPLIT (2026-11-08), PF_RHO (0.6), PF_TAG (u2).
"""
import itertools
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

SEAS = ("2024-25", "2025-26", "2026-27")
SPLIT = os.environ.get("PF_SPLIT") or "2026-11-08"
RHO = float(os.environ.get("PF_RHO") or 0.6)


def season(gd):
    return "2024-25" if gd < "2025-07-01" else "2025-26" if gd < "2026-07-01" else "2026-27"


def parse(days):
    out = {}
    for t in days.split(";"):
        if t:
            g, u, n = t.split(":")
            out[g] = (float(u), int(n))
    return out


def stats(day):
    s = {}
    for ss in SEAS:
        v = [(u, n) for g, (u, n) in day.items() if season(g) == ss]
        n = sum(x[1] for x in v); s[ss] = (sum(x[0] for x in v) / n if n else np.nan, n, sum(x[0] for x in v))
    late = [(u, n) for g, (u, n) in day.items() if g >= SPLIT]; early = [(u, n) for g, (u, n) in day.items() if season(g) == "2026-27" and g < SPLIT]
    s["26a"] = (sum(x[0] for x in early) / max(1, sum(x[1] for x in early)), sum(x[1] for x in early))
    s["26b"] = (sum(x[0] for x in late) / max(1, sum(x[1] for x in late)), sum(x[1] for x in late))
    return s


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tag = os.environ.get("PF_TAG") or "u2"
    S = []
    try:
        for app, sid, st, k, label, days in conn.execute(f"""SELECT s.app, s.sid, s.st, s.k::int, s.tier||' '||s.side||' '||s.rk||' ['||s.layer||'] g'||s.gcap::int||
                     CASE WHEN s.pdif=1 THEN ' pd' ELSE '' END||' alt'||s.altcap::int||' #'||s.start::int||' x'||s.nsl, d.days
                     FROM nba_score.ua2_strats s JOIN nba_score.ua2_days d ON d.sid = s.sid WHERE s.tag LIKE %s""", (tag + "|%",)).fetchall():
            S.append(dict(app=app, sid=sid, struct=f"{'P' if st == 'power' else 'F'}{k}", label=f"[own board] {label}", day=parse(days)))
    except Exception as ex:
        conn.rollback(); print(f"PF|no universe-2 day results ({str(ex)[:80]})")
    try:
        for app, sid, label, days in conn.execute("SELECT app, sid, label, days FROM nba_score.p31_days").fetchall():
            k_, st_ = label.split(" | ")[0][0], label.split(" | ")[0][1]
            S.append(dict(app=app, sid=sid, struct=("P" if st_ == "P" else "F") + k_, label=f"[cross-app] {label}", day=parse(days)))
    except Exception as ex:
        conn.rollback(); print(f"PF|no pass-31 day results ({str(ex)[:80]})")
    conn.close()
    for s in S:
        s["st"] = stats(s["day"])
        r24, r25 = s["st"]["2024-25"][0], s["st"]["2025-26"][0]
        if np.isnan(r24) and np.isnan(r25):                  # priced only this season (Underdog Flex, Betr 2024-25): chosen before the split
            s["sc"] = s["st"]["26a"][0] if s["st"]["26a"][1] >= 8 else np.nan; s["oos"] = "26b"
        elif np.isnan(r24):
            s["sc"] = r25 if s["st"]["2025-26"][1] >= 40 else np.nan; s["oos"] = "2026-27"
        else:
            s["sc"] = min(r24, r25) if min(s["st"]["2024-25"][1], s["st"]["2025-26"][1]) >= 30 else np.nan; s["oos"] = "2026-27"
    # Underdog Flex with goblin/demon alternates multiplies alternate-line factors Underdog does not pay on Flex (prices of +400,000% = artifact): regular legs only
    S = [s for s in S if not (s["app"] == "underdog" and " regular " not in s["label"])]
    S = [s for s in S if s["sc"] == s["sc"] and s["sc"] > 0 and s["st"]["2026-27"][1] >= 10]
    apps = sorted({s["app"] for s in S})
    print(f"PF|candidates (selected on prior seasons, positive): " + " | ".join(f"{a} {sum(1 for s in S if s['app'] == a)}" for a in apps), flush=True)
    alld = sorted({g for s in S for g in s["day"]})
    sel_days = [g for g in alld if season(g) != "2026-27" or g < SPLIT]
    # ranked, decorrelated list per app
    ranked = {}
    for a in apps:
        cand = sorted([s for s in S if s["app"] == a], key=lambda s: -s["sc"])
        pick = []
        for s in cand:
            v = np.array([s["day"].get(g, (0.0, 0))[0] for g in sel_days])
            if any(abs(np.corrcoef(v, p["_v"])[0, 1]) > RHO for p in pick if np.std(v) > 0 and np.std(p["_v"]) > 0):
                continue
            s["_v"] = v; pick.append(s)
            if len(pick) >= 8:
                break
        ranked[a] = pick
        print(f"PF|{a.upper()} ranked strategies (decorrelated, rho <= {RHO}):", flush=True)
        for i, s in enumerate(pick, 1):
            st = s["st"]
            print(f"PF|  {i}. {s['struct']} {s['label']}: " + " / ".join(f"{100*st[ss][0]:+.0f}% ({st[ss][1]})" if st[ss][1] else "-" for ss in SEAS)
                  + f" | after {SPLIT} {100*st['26b'][0]:+.0f}% ({st['26b'][1]}) | judged on {s['oos']}", flush=True)
    # grid
    rows = []
    for nper in (1, 2, 3, 4, 5, 6, 8):
        for appcap in (1, 2, 3, 4, 6, 8, 99):
            for tot in (4, 6, 8, 10, 12, 15, 20, 30, 999):
                for share in (0.25, 0.4, 0.6, 1.0):
                    if tot == 999 and share < 1.0:
                        continue
                    seas = defaultdict(lambda: [0.0, 0]); dayu = []
                    for g in alld:
                        used = 0; per = defaultdict(int); du = 0.0
                        # round-robin across apps by rank so no app crowds the others out
                        queue = [(i, a, s) for a in apps for i, s in enumerate(ranked[a][:nper])]
                        queue.sort(key=lambda t: t[0])
                        for i, a, s in queue:
                            if g not in s["day"]:
                                continue
                            u, n = s["day"][g]
                            capa = min(appcap, int(share * tot) if tot < 999 else 999)
                            if per[a] + n > max(capa, 1) or used + n > tot:
                                continue
                            per[a] += n; used += n; du += u
                            seas[season(g)][0] += u; seas[season(g)][1] += n
                        if used:
                            dayu.append(du)
                    if not dayu:
                        continue
                    cum = np.cumsum(dayu); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
                    run = best = 0
                    for z in dayu:
                        run = run + 1 if z < 0 else 0; best = max(best, run)
                    rec = dict(nper=nper, appcap=appcap, tot=tot, share=share, slips=sum(v[1] for v in seas.values()), days=len(dayu),
                               units=float(sum(v[0] for v in seas.values())), dd=dd, drought=best, winday=float(np.mean(np.array(dayu) > 0)))
                    for ss in SEAS:
                        rec["r" + ss[2:4]] = seas[ss][0] / seas[ss][1] if seas[ss][1] else np.nan; rec["u" + ss[2:4]] = seas[ss][0]; rec["n" + ss[2:4]] = seas[ss][1]
                    rows.append(rec)
    R = pd.DataFrame(rows).drop_duplicates(["slips", "units", "dd"])
    R["sel"] = np.minimum(R["r24"].fillna(-9), R["r25"].fillna(-9))
    R["calm"] = R["units"] / R["dd"].clip(lower=1)
    print(f"PF|portfolios tested {len(rows):,} (distinct {len(R):,})", flush=True)
    for title, srt in (("best by the prior seasons (weaker season ROI)", "sel"), ("calmest (units per unit of drawdown)", "calm"), ("most units", "units")):
        print(f"PF|== {title} ==", flush=True)
        for r in R.sort_values(srt, ascending=False).head(12).itertuples():
            print(f"PF|  {r.nper} per app, app cap {r.appcap if r.appcap < 99 else 'none'}, total cap {r.tot if r.tot < 999 else 'none'}, share {100*r.share:.0f}%: "
                  f"{r.slips} slips ({r.slips/r.days:.1f}/day) {r.units:+.1f}u | " + " / ".join(f"{100*getattr(r, 'r'+s[2:4]):+.1f}% ({getattr(r, 'n'+s[2:4])}, {getattr(r, 'u'+s[2:4]):+.1f}u)" for s in SEAS)
                  + f" | dd {r.dd:.1f}u drought {r.drought} days, winning days {100*r.winday:.0f}%", flush=True)
    print("PF|DONE", flush=True)


if __name__ == "__main__":
    main()
