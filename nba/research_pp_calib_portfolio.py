#!/usr/bin/env python3
"""
RESEARCH - THE 2-SLIP PORTFOLIO ON THE BOARD-CENTRED final_hp: CALIBRATED-POOL UNITS, THE LIVE UNITS, THEIR MIXES, AND A BOARD-PROFILE
SWITCH (2026-10-23 PT; owner 21:07 PT: "by tomorrow, for the next slate, we should have the new strategies already ... considering the
board profiles and everything"; owner 17:49 PT: each identifiable board type is an opportunity for a customized strategy). READ-ONLY.

UNITS
  calib  - calib_slips.unit_slips (the live engine's own builder for 'calib:...' units) on every PrizePicks window-board leg of the
           tier map ranked on final_hp (research_pp_calibrated_slips.load: final 7 days of each season out), k = 1..10 per day.
           The 7 calibrated units below each HOLD alone (research_pp_calibrated_slips run 39914672627).
  live   - the six units of the production portfolio (pp_portfolio.order), from the recertified window-only slip tables (slip_engine_slips_wo /
           _wo_nosteals, rebuilt on the board-centred final_hp by nba-recert-chain), phase <> 'final7', k = 1..10.
PORTFOLIO = units in order + N slips a day + leg cap L: the live engine's portfolio_select (round robin k = 1, 2, ... over the units, a
candidate is taken unless it repeats a taken slip or one of its legs (player, prop, side, line) already sits in L taken slips; stop
at N). Every slip 1 unit, graded by build_slip_engine.grade (grader v3).
BOARD PROFILE = the slate's size (games on the board: S <= 4, M 5-8, L >= 9) x the depth of the calibrated board (standard-line legs
with final_hp >= 0.65: thin < 6, deep >= 6). A PROFILE SWITCH picks, per profile, the unit with the best 2024-25 ROI in that profile
(>= 15 days) and is TESTED UNTOUCHED on 2025-26; then the reverse.
REPORT per portfolio x N x L and season: slips, ROI, lb5 (day bootstrap), max drawdown, net / drawdown, the four half-seasons (H1 before
Jan 15), worst day; and per profile the ROI of every unit.
NOTE: the calibrated units were chosen on both seasons (HOLDS) - the portfolio ranks below are in-sample; the profile switch is the
only chosen-on-one / tested-on-the-other result here.
Env: DATABASE_URL, CP_BOOT (500).
"""
import datetime as dt
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE              # noqa: E402
import calib_slips as CS                    # noqa: E402
import research_pp_calibrated_slips as RC   # noqa: E402
import research_pp_flex234 as F             # noqa: E402

BOOT = int(os.environ.get("CP_BOOT") or 500)
SEASONS = ("2024-25", "2025-26")
KMAX = 10
CALIB = [("calib", "calib:R:p:0.70:2", 3, "power"), ("calib", "calib:R:p:0.65:2", 5, "flex"),
         ("calib", "calib:R:p:0.65:1", 5, "flex"), ("calib", "calib:R:p:0.0:2", 5, "flex"),
         ("calib", "calib:GR:ev:0.65:2", 3, "power"), ("calib", "calib:R:p:0.70:2", 3, "flex"),
         ("calib", "calib:GR:ev:0.55:2", 5, "flex")]
# THE PRODUCTION PORTFOLIO (classification_config['pp_portfolio'].order, decided 2026-10-22): P_wthrees_4flex, P_wassists_4flex
# (steals-free pool), P_wrebounds_4flex, P_wstocks_4flex, P_points_3power, P_wrebounds_3power
LIVE_NOW = [("_wo", "weighted:threes_D1", 4, "flex"), ("_wo_nosteals", "weighted:assists_D1", 4, "flex"),
            ("_wo", "weighted:rebounds_R", 4, "flex"), ("_wo", "weighted:stocks_R", 4, "flex"),
            ("_wo", "single:points_R", 3, "power"), ("_wo", "weighted:rebounds_R", 3, "power")]
REB4F = ("_wo", "weighted:rebounds_R", 4, "flex")
NS = (1, 2, 3, 4)
LS = (1, 2)


def tag(u):
    return f"{u[1]} {u[2]}{'F' if u[3] == 'flex' else 'P'}" + ("" if u[0] == "calib" else f" {u[0]}")


def legkey(l):
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def lb5(pr, st, seed=7):
    p, s = np.asarray(pr, float), np.asarray(st, float)
    if len(p) < 5 or s.sum() <= 0:
        return float("nan")
    idx = np.random.default_rng(seed).integers(0, len(p), size=(BOOT, len(p)))
    return float(np.percentile(p[idx].sum(1) / np.maximum(s[idx].sum(1), 1e-9), 5))


def main():
    t0 = time.time()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = RC.load(conn)
    cand = defaultdict(list)          # (unit, season, day) -> [(legs, same_game or None)] in k order
    profile = {}
    for (s, d), legs in days.items():
        for u in CALIB:
            for slip in CS.unit_slips(legs, u[1], u[2], KMAX):
                cand[(u, s, d)].append((slip, None))
        games = len({l["event_id"] for l in legs if l["event_id"] is not None})
        deep = sum(1 for l in legs if l["tier"] == "R" and l["p"] is not None and l["p"] >= 0.65)
        profile[(s, d)] = ("S" if games <= 4 else "M" if games <= 8 else "L") + ("-deep" if deep >= 6 else "-thin")
    print(f"calibrated candidates: {sum(len(v) for k, v in cand.items()):,} | {time.time() - t0:.0f}s", flush=True)
    for pool in ("_wo", "_wo_nosteals"):
        for u in [u for u in LIVE_NOW if u[0] == pool]:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'
                        ORDER BY game_date, k""", (u[1], u[2], u[3], KMAX)):
                if season in SEASONS and (season, d) in days:
                    cand[(u, season, d)].append((legs, bool(sg and sg > 0)))
    print(f"all candidates: {sum(len(v) for v in cand.values()):,} | {time.time() - t0:.0f}s", flush=True)
    by_season = {s: sorted(d for (ss, d) in days if ss == s) for s in SEASONS}
    gcache = {}

    def pay(u, s, d, i):
        key = (u, s, d, i)
        if key not in gcache:
            legs, sg = cand[(u, s, d)][i]
            sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in legs]
            gcache[key] = SE.grade(sl, u[3], same_game=sg)[1]
        return gcache[key]

    def run(port, n, lcap, s, day_units=None):
        """-> {day: (slips, profit)}; day_units(d) -> the units for that day (profile switch) else `port`"""
        out = {}
        for d in by_season[s]:
            units = day_units(d) if day_units else port
            taken, use, seen = [], defaultdict(int), set()
            for k in range(KMAX):
                for u in units:
                    lst = cand.get((u, s, d))
                    if not lst or k >= len(lst) or len(taken) >= n:
                        continue
                    keys = list(dict.fromkeys(legkey(l) for l in lst[k][0]))
                    sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                    if sig in seen or any(use[x] >= lcap for x in keys):
                        continue
                    seen.add(sig)
                    for x in keys:
                        use[x] += 1
                    taken.append((u, k))
                if len(taken) >= n:
                    break
            if taken:
                out[d] = (len(taken), sum(pay(u, s, d, k) - 1.0 for u, k in taken))
        return out

    def stats(res, s):
        if not res:
            return None
        ds = sorted(res)
        st = np.array([res[d][0] for d in ds], float)
        pr = np.array([res[d][1] for d in ds], float)
        cum = np.cumsum(pr)
        dd = float(np.max(np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:] - cum))
        y = int(s[:4]) + 1
        hs = []
        for h in (lambda d: d < dt.date(y, 1, 15), lambda d: d >= dt.date(y, 1, 15)):
            sel = [d for d in ds if h(d)]
            if sel:
                hs.append(sum(res[d][1] for d in sel) / sum(res[d][0] for d in sel))
        return {"slips": int(st.sum()), "days": len(ds), "roi": pr.sum() / st.sum(), "lb5": lb5(pr, st), "dd": dd,
                "net": float(pr.sum()), "worst": float(pr.min()), "halves": hs}

    def f(x):
        return (f"n{x['slips']:>4}/{x['days']:>3}d {100 * x['roi']:+6.1f}% lb{100 * x['lb5']:+6.1f}% dd{x['dd']:>5.1f} "
                f"n/dd{x['net'] / max(x['dd'], 1e-9):>5.1f} wd{x['worst']:>+5.1f}")

    summary = []

    def report(name, port, n, lcap, day_units=None):
        a, b = (stats(run(port, n, lcap, s, day_units), s) for s in SEASONS)
        if not a or not b:
            return
        hv = a["halves"] + b["halves"]
        npos = sum(1 for h in hv if h > 0)
        holds = a["roi"] > 0 and b["roi"] > 0 and a["lb5"] > 0 and b["lb5"] > 0
        print(f"  {name[:95]:<95} N{n} L{lcap} | 24-25 {f(a)} | 25-26 {f(b)} | halves "
              f"{' '.join(f'{100 * h:+.0f}' for h in hv)} ({npos}/4){' HOLDS' if holds else ''}", flush=True)
        summary.append((name, n, lcap, a, b, npos, holds))

    print("\n" + "=" * 190 + "\nEVERY UNIT ALONE (N 1-2, L 2)")
    for u in CALIB + LIVE_NOW:
        for n in (1, 2):
            report("alone: " + tag(u), [u], n, 2)

    print("\n" + "=" * 190 + "\nPORTFOLIOS")
    ports = {"LIVE NOW (P_wthrees 4F, P_wassists 4F, P_wrebounds 4F, P_wstocks 4F, P_points 3P, P_wrebounds 3P) on the new final_hp": LIVE_NOW,
             "ALL CALIBRATED (7 units, research order)": CALIB}
    for i, a in enumerate(CALIB):
        for j, b in enumerate(CALIB):
            if i != j:
                ports[f"calib pair: {tag(a)} + {tag(b)}"] = [a, b]
    for c in CALIB:
        ports[f"calib + rebounds 4F: {tag(c)} + {tag(REB4F)}"] = [c, REB4F]
        ports[f"rebounds 4F + calib: {tag(REB4F)} + {tag(c)}"] = [REB4F, c]
        ports[f"rebounds 4F + calib + live: {tag(c)}"] = [REB4F, c] + [u for u in LIVE_NOW if u != REB4F]
        ports[f"live 2nd = calib: threes 4F + {tag(c)} + rest"] = LIVE_NOW[:1] + [c] + LIVE_NOW[1:]
        ports[f"calib first + live: {tag(c)} + LIVE NOW"] = [c] + LIVE_NOW
        ports[f"live first + calib: LIVE NOW + {tag(c)}"] = LIVE_NOW + [c]
    for name, port in ports.items():
        for n in NS:
            for lcap in LS:
                if name.startswith("calib pair") and n > 2:
                    continue
                report(name, port, n, lcap)

    print("\n" + "=" * 190 + "\nBOARD PROFILES (games on the slate S <= 4 / M 5-8 / L >= 9 x standard legs with final_hp >= 0.65 thin < 6 / deep >= 6)")
    units = CALIB + LIVE_NOW
    prof_roi = {}
    for s in SEASONS:
        cnt = defaultdict(int)
        for d in by_season[s]:
            cnt[profile[(s, d)]] += 1
        print(f"  {s} days per profile: " + ", ".join(f"{p} {c}" for p, c in sorted(cnt.items())))
        for u in units:
            res = run([u], 1, 2, s)
            agg = defaultdict(lambda: [0, 0.0])
            for d, (n_, p_) in res.items():
                agg[profile[(s, d)]][0] += n_; agg[profile[(s, d)]][1] += p_
            prof_roi[(s, u)] = {p: (v[0], v[1] / v[0]) for p, v in agg.items()}
            print(f"    {tag(u):<42} " + " ".join(f"{p}:{v[1] * 100:+.0f}%({v[0]})" for p, v in sorted(prof_roi[(s, u)].items())))
    for a, b in (SEASONS, SEASONS[::-1]):
        pick = {}
        for p in sorted({profile[k] for k in profile}):
            best = max(units, key=lambda u: prof_roi[(a, u)].get(p, (0, -9))[1] if prof_roi[(a, u)].get(p, (0, 0))[0] >= 15 else -9)
            second = max([u for u in units if u != best],
                         key=lambda u: prof_roi[(a, u)].get(p, (0, -9))[1] if prof_roi[(a, u)].get(p, (0, 0))[0] >= 15 else -9)
            pick[p] = [best, second]
        print(f"\n  PROFILE SWITCH chosen on {a} -> tested on {b}: " + "; ".join(f"{p}: {tag(v[0])} | {tag(v[1])}" for p, v in pick.items()))
        for n, lcap in ((1, 2), (2, 2)):
            res = {}
            for s in SEASONS:
                res[s] = stats(run(None, n, lcap, s, day_units=lambda d, s=s: pick[profile[(s, d)]]), s)
            print(f"    N{n} L{lcap} | {a} (in-sample) {f(res[a])} | {b} (TEST) {f(res[b])}", flush=True)

    print("\n" + "=" * 190 + "\nBEST N 2 / L 2 PORTFOLIOS (hold both seasons, 4/4 halves), by the weaker season's lb5:")
    best = [x for x in summary if x[1] == 2 and x[2] == 2 and x[6] and x[5] == 4 and not x[0].startswith("alone")]
    best.sort(key=lambda x: -min(x[3]["lb5"], x[4]["lb5"]))
    for name, n, lcap, a, b, npos, _ in best[:30]:
        print(f"  {name[:95]:<95} ROI {100 * a['roi']:+6.1f} / {100 * b['roi']:+6.1f}% | lb5 {100 * a['lb5']:+6.1f} / {100 * b['lb5']:+6.1f} "
              f"| net {a['net']:+6.1f} / {b['net']:+6.1f} | dd {a['dd']:5.1f} / {b['dd']:5.1f}")
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
