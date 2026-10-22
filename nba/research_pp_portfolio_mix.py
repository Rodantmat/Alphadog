#!/usr/bin/env python3
"""
RESEARCH - MIX THE HOLDING STRATEGIES INTO ONE PORTFOLIO: HOW MANY SLIPS A DAY, WHICH COMPOSITIONS, AND A CAP ON HOW MANY SLIPS ONE
LEG MAY SIT IN (2026-10-22 PT; owner 11:59 PT: "mix them together to make a single strong strategy ... try more slips, less slips,
different composition, just a single prop line, different prop lines, try to cap legs at one slip max, or two slips max, or three
... if the numbers are similar and if you can reduce correlation, that's also a good thing"). Scope by the owner's 11:58 rule:
2- and 3-pick POWER, 4-pick FLEX.  READ-ONLY.

UNITS = one composition on one pool (the live engine's twin backtest: nba_score.slip_engine_slips_wo = steals pool, _wo_nosteals =
steals-free pool), its ranked candidate slips k = 1..10 per day (regular season, final 7 days out). LIVE = the same engine
(build_slip_engine.eligible_legs / build_day_slips, k = 1..10) on the 2026-27 boards of PM_LIVE_DAYS (research_pp_flex234.live_legs:
the real window board, PrizePicks' prices, graded on the box scores; the steals-free pool drops the steals cells as the live engine's
EXCLUDE_BY_FAMILY does).
PORTFOLIO = a list of units + N (slips a day) + L (leg cap). Each day: round robin k = 1, 2, ... over the units in their listed order;
a candidate slip is taken when it is not a duplicate (same legs) of a taken slip and none of its legs already sits in L taken slips;
stop at N. Leg key: exact leg (player, prop, side, line) - or, PM_KEY=player, the player (any prop). Every slip 1 unit, graded by
build_slip_engine.grade (grader v3; the units here hold at most one demon, below the fp where Power with alternates over-pays).
REPORT per portfolio x N x L: per season slips, ROI, lb5 (day bootstrap), max drawdown (units), profit / max drawdown, halves
positive (H1 before Jan 15), worst day; overlap = share of taken slips sharing a leg with another slip that day; LIVE slips and ROI.
Unit order inside a portfolio is fixed by a rule written before the run: 4-Flex units by their 2024-25 ROI (the weaker season), then
3-Power, then 2-Power. NOTE: units were chosen on these seasons - in-sample; the live days are the only out-of-sample record.
Env: DATABASE_URL, PM_LIVE_DAYS (2026-10-20,2026-10-21), PM_BOOT (500), PM_KEY (leg | player).
"""
import datetime as dt
import os
import sys
import time
from collections import defaultdict

os.environ.setdefault("PF_BOOT", os.environ.get("PM_BOOT") or "500")
if os.environ.get("PM_LIVE_DAYS"):
    os.environ["PF_LIVE_DAYS"] = os.environ["PM_LIVE_DAYS"]
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_flex234 as F         # noqa: E402

KEYMODE = os.environ.get("PM_KEY") or "leg"
SEASONS = ("2024-25", "2025-26")
KMAX = 10
STEALS_CELLS = {"steals_R", "steals_R_U"}

# (pool, composition, size, structure) - the compositions that hold (research_pp_flex234 run 39825792009) + the live ones
F4 = [("_wo", "weighted:assists_D1", 4, "flex"), ("_wo_nosteals", "weighted:assists_D1", 4, "flex"),   # 2024-25 ROI order
      ("_wo", "core+demon", 4, "flex"), ("_wo", "weighted:threes_D1", 4, "flex"), ("_wo", "weighted:steals_R", 4, "flex"),
      ("_wo", "weighted:rebounds_R", 4, "flex"), ("_wo", "core", 4, "flex"), ("_wo", "weighted:stocks_R", 4, "flex"),
      ("_wo_nosteals", "weighted:rebounds_R", 4, "flex"), ("_wo_nosteals", "regular", 4, "flex")]
P3 = [("_wo", "single:points_R", 3, "power"), ("_wo", "weighted:assists_D1", 3, "power"), ("_wo", "core", 3, "power"),
      ("_wo", "weighted:threes_D1", 3, "power"), ("_wo", "weighted:rebounds_R", 3, "power")]
P2 = [("_wo", "weighted:turnovers_R", 2, "power"), ("_wo", "single:steals_R", 2, "power"), ("_wo", "single:points_R", 2, "power"),
      ("_wo_nosteals", "weighted:rebounds_R", 2, "power"), ("_wo", "core", 2, "power")]
LIVE_NOW = [("_wo", "weighted:rebounds_R", 4, "flex"), ("_wo_nosteals", "weighted:stocks_R", 4, "flex"),
            ("_wo", "core", 3, "power"), ("_wo_nosteals", "single:points_R", 3, "power")]
PROPOSED = [("_wo", "weighted:threes_D1", 4, "flex"), ("_wo_nosteals", "weighted:assists_D1", 4, "flex"),
            ("_wo", "weighted:rebounds_R", 4, "flex"), ("_wo", "weighted:stocks_R", 4, "flex"),
            ("_wo", "single:points_R", 3, "power"), ("_wo", "weighted:rebounds_R", 3, "power")]
PORTFOLIOS = {
    "LIVE NOW (A_wrebounds 4F, C_wstocks 4F, A_core 3P, D_points 3P)": LIVE_NOW,
    "PROPOSED (threes 4F, assists-ns 4F, rebounds 4F, stocks 4F, points 3P, rebounds 3P)": PROPOSED,
    "ALL 4-FLEX": F4,
    "ALL 3-POWER": P3,
    "ALL 2-POWER": P2,
    "4-FLEX + 3-POWER": F4 + P3,
    "4-FLEX + 3-POWER + 2-POWER": F4 + P3 + P2,
    "SINGLE PROP LINES ONLY (single:points 3P + 2P, single:steals 2P)": [("_wo", "single:points_R", 3, "power"),
                                                                         ("_wo", "single:points_R", 2, "power"),
                                                                         ("_wo", "single:steals_R", 2, "power")],
}
for u in F4 + P3 + P2:                                   # every unit alone, too (the single-strategy baseline)
    PORTFOLIOS[f"alone: {u[1]} {u[2]}{'F' if u[3] == 'flex' else 'P'} {u[0]}"] = [u]
NS = (1, 2, 3, 4, 6, 8, 10, 12)
LS = (1, 2, 3, 99)


def legkey(l):
    return F.norm(l["player"]) if KEYMODE == "player" else (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def main():
    t0 = time.time()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    EX.install_flex2_alt(conn)
    units = sorted({u for p in PORTFOLIOS.values() for u in p})
    # cand[(unit, period, day)] = [ (k, legs(list of dict with hit/factor/player/prop/side/line), same_game) ... ] sorted by k
    cand = defaultdict(list)
    for pool in ("_wo", "_wo_nosteals"):
        mine = [u for u in units if u[0] == pool]
        for comp, size, st in {(u[1], u[2], u[3]) for u in mine}:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'""",
                    (comp, size, st, KMAX)):
                if season in SEASONS:
                    cand[((pool, comp, size, st), season, d)].append((k, legs, bool(sg and sg > 0)))
    print(f"history candidates loaded: {sum(len(v) for v in cand.values()):,} slips of {len(units)} units | {time.time() - t0:.0f}s", flush=True)

    # LIVE: the same engine on the live boards (k = 1..10 per unit)
    outcomes = {}
    for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (F.LIVE_DAYS,)).fetchall():
        outcomes[(d, F.norm(pl), mk, round(line, 1))] = res
    cmap = SE.load_corr(conn)
    for d in F.LIVE_DAYS:
        rk_rows, _ = F.live_legs(conn, d, outcomes)
        rows = [r for r in rk_rows if not r["tier"].startswith("U")]
        pool_all = SE.eligible_legs(rows)
        fam = defaultdict(set)
        for c, lst in pool_all.items():
            for l in lst:
                fam[c.replace("_U", "")].add(l["player"])
        broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        pools = {"_wo": pool_all, "_wo_nosteals": {c: v for c, v in pool_all.items() if c not in STEALS_CELLS}}
        for u in units:
            for k, slip in enumerate(SE.build_day_slips(pools[u[0]], u[1], u[2], u[3], KMAX, cmap, broad), 1):
                games = [l["event_id"] for l in slip]
                cand[(u, "LIVE", d)].append((k, slip, len(games) > len(set(games))))
    print(f"live candidates built | {time.time() - t0:.0f}s", flush=True)
    for v in cand.values():
        v.sort(key=lambda x: x[0])
    days = defaultdict(set)
    for (u, per, d) in cand:
        days[per].add(d)
    grade_cache = {}

    def pay(u, per, d, i):
        key = (u, per, d, i)
        if key not in grade_cache:
            _, legs, sg = cand[(u, per, d)][i]
            sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0)} for x in legs]
            grade_cache[key] = SE.grade(sl, u[3], same_game=sg)[1]
        return grade_cache[key]

    def run(port, n, lcap, per):
        """-> {day: (stake, profit, n_overlap)}"""
        out = {}
        for d in sorted(days[per]):
            taken, use, seen = [], defaultdict(int), set()
            for k in range(KMAX):
                for u in port:
                    lst = cand.get((u, per, d))
                    if not lst or k >= len(lst) or len(taken) >= n:
                        continue
                    legs = lst[k][1]
                    keys = list(dict.fromkeys(legkey(l) for l in legs))      # a key counts once per slip
                    sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                    if sig in seen or any(use[x] >= lcap for x in keys):
                        continue
                    seen.add(sig)
                    for x in keys:
                        use[x] += 1
                    taken.append((u, k, keys))
                if len(taken) >= n:
                    break
            if not taken:
                continue
            prof = sum(pay(u, per, d, k) - 1.0 for u, k, _ in taken)
            ov = sum(1 for _, _, keys in taken if any(use[x] > 1 for x in keys))
            out[d] = (len(taken), prof, ov)
        return out

    def stats(res, season=None):
        if not res:
            return None
        ds = sorted(res)
        st = np.array([res[d][0] for d in ds], float)
        pr = np.array([res[d][1] for d in ds], float)
        cum = np.cumsum(pr)
        dd = float(np.max(np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:] - cum)) if len(cum) else 0.0
        s = {"slips": int(st.sum()), "roi": pr.sum() / st.sum(), "lb5": F.lb5(list(pr), list(st)), "dd": dd, "net": float(pr.sum()),
             "worst": float(pr.min()), "ov": sum(res[d][2] for d in ds) / st.sum()}
        if season:
            y = int(season[:4]) + 1
            hs = []
            for h in (lambda d: d < dt.date(y, 1, 15), lambda d: d >= dt.date(y, 1, 15)):
                sel = [d for d in ds if h(d)]
                if sel:
                    hs.append(sum(res[d][1] for d in sel) / sum(res[d][0] for d in sel))
            s["halves"] = hs
        return s

    print("\n" + "=" * 170)
    print(f"PORTFOLIO MIX - leg key '{KEYMODE}'. Per season: slips, ROI, lb5, max drawdown (units), net / max drawdown, worst day, overlap "
          "(share of slips sharing a leg with another slip that day). halves = ROI of the four half-seasons. LIVE = 2026-27 slates.")
    summary = []
    for name, port in PORTFOLIOS.items():
        alone = name.startswith("alone:")
        print(f"\n{name}" + ("" if alone else f"  [{len(port)} units]"))
        for n in NS:
            for lcap in LS:
                if alone and n > 3:
                    continue
                a = stats(run(port, n, lcap, "2024-25"), "2024-25")
                b = stats(run(port, n, lcap, "2025-26"), "2025-26")
                lv = stats(run(port, n, lcap, "LIVE"))
                if not a or not b:
                    continue

                def f(s):
                    return (f"n{s['slips']:>5} {100 * s['roi']:+6.1f}% lb{100 * (s['lb5'] or 0):+6.1f}% dd{s['dd']:>6.1f} "
                            f"n/dd{s['net'] / max(s['dd'], 1e-9):>5.1f} wd{s['worst']:>+6.1f} ov{s['ov']:.2f}")
                hv = " ".join(f"{100 * h:+.0f}" for h in a["halves"] + b["halves"])
                npos = sum(1 for h in a["halves"] + b["halves"] if h > 0)
                lvt = f"n{lv['slips']:>2} {100 * lv['roi']:+7.1f}%" if lv else "no slip"
                holds = a["roi"] > 0 and b["roi"] > 0 and (a["lb5"] or -1) > 0 and (b["lb5"] or -1) > 0
                print(f"  N{n:>2} L{'∞' if lcap == 99 else lcap} | 24-25 {f(a)} | 25-26 {f(b)} | halves {hv} ({npos}/4) | LIVE {lvt:<15}"
                      f"{' HOLDS' if holds else ''}")
                summary.append((name, n, lcap, a, b, lv, npos, holds))
    print("\n" + "=" * 170 + "\nBEST MIXES (holds both seasons, 4/4 halves), ranked by the weaker season's net / max drawdown:")
    best = [s for s in summary if s[7] and s[6] == 4 and not s[0].startswith("alone:")]
    best.sort(key=lambda s: -min(s[3]["net"] / max(s[3]["dd"], 1e-9), s[4]["net"] / max(s[4]["dd"], 1e-9)))
    for name, n, lcap, a, b, lv, npos, _ in best[:40]:
        print(f"  {name[:60]:<60} N{n:>2} L{'∞' if lcap == 99 else lcap} | ROI {100 * a['roi']:+6.1f} / {100 * b['roi']:+6.1f}% | net "
              f"{a['net']:+7.1f} / {b['net']:+7.1f} | dd {a['dd']:5.1f} / {b['dd']:5.1f} | ov {a['ov']:.2f} / {b['ov']:.2f} | LIVE "
              f"{(str(lv['slips']) + ' ' + format(100 * lv['roi'], '+.1f') + '%') if lv else '-'}")
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
