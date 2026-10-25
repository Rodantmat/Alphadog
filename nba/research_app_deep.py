#!/usr/bin/env python3
"""
RESEARCH - THE DEEP REVIEW FOR AN APP, AS DEEP AS PRIZEPICKS' (2026-10-25; owner 16:03 PT: "The underdog needs deeper study, again all
possible strategies, factors, compositions and structures ... all possible prop lines. Same deep review we did with PP and we need to
understand what holds on this season or accept that the bad start is just acceptable. Same if the other apps show the same
behavior"). READ-ONLY. APP=UD | BETR (loaders, graders and the battery-1 grid of research_app_final_strategies).

FAMILIES (every structure: UD Standard 2-8 + Flex 3-8, Betr Perfect 2-6 + Dynamic 2-6; one slip a strategy a slate):
  B1  line-type pools x side x prop set x rank (final_hp, final_hp x m, baseline_hp, final score) x final_hp floor x skip
      (research_app_final_strategies.day_matrix)
  B2  every SINGLE line level (UD R, F1, F2, F3, B1, B2, B3) x side x prop set x rank (final_hp, final_hp x m) x line position on the
      slate (all / at-or-below / above the slate median of the prop and level) x prop-group cap (none / 2)
  TR  TRAILING ranks from the app's own earlier graded legs (strictly earlier slates): player t3 / t10 (player x prop x level x side),
      plain player hit rate, exact-line trailing (last 30), line-band trailing (last 60), line-level trailing (last 300) - x pool x
      side x prop set x final_hp floor
  FX  FACTOR bands on final_hp (floor 0.55 .. 0.70): player trailing hot / cold (t3, t10), consistency, plain >= 0.6 / <= 0.45,
      minutes up / down (box score: last 3 vs last 10), rested >= 2 days / back-to-back, season phase early / mid / late, line low /
      mid / high (terciles of the level's lines on all earlier slates), line-level trailing above / below the slate median
  DOC (UD) Underdog's certified compositions (build_ud_slip_engine: all, core, under, points, rebs, mains, priced, edge59, every
      weighted:<cell>, single:<cell>, ex:<cell>), the live engine's own builder
READS: per structure over ALL families - robust count, holdout both ways, walk-forward top-1 / top-5, the best robust with THIS SEASON;
  per family the best robust. THIS-SEASON DIAGNOSIS: (1) leg calibration now vs history (final_hp bins -> hit), (2) for the 60 most
  robust strategies and the live P5: this season's result as a percentile of the same strategy's historical windows of the same
  number of slates - is the start unusual, or inside normal variance? PORTFOLIO HOLDOUT: shortlist and subset chosen on one period
  only, measured on the other (the honest portfolio number). PORTFOLIO: shortlist (best 2 robust a structure by profit /
  drawdown, 2-6 scope) -> every subset -> leaders with starting points and a realistic season.
Env: DATABASE_URL, APP, DP_K (12), DP_BOOT (2000), DP_SMOKE (1 = every 6th history slate, a probe run).
"""
import itertools
import os
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_app_portfolio as RP                  # noqa: E402
import research_portfolio_paths as PP                # noqa: E402

T0 = time.time()
APP = AF.APP
K = int(os.environ.get("DP_K") or 12)
PER = int(os.environ.get("DP_PER") or 2)                 # shortlist strategies a structure
MINSPD = float(os.environ.get("DP_MINSPD") or 1.0)       # minimum slips a day for the safe portfolio reads
NB = int(os.environ.get("DP_BOOT") or 2000)
ST = AF.STRUCTS
NS = len(ST)
LEVELS = ("R", "F1", "F2", "F3", "B1", "B2", "B3") if APP == "UD" else ("R",)
TPOOLS = {k: v for k, v in AF.POOLS.items() if k in ("R", "RF", "RB", "ALL")}
TRANKS = ("t3", "t10", "plain", "line_trail", "band_trail", "tier_trail")
BANDS = [("none", lambda l: True),
         ("t3 hot", lambda l: l["t3"] == l["t3"] and l["t3"] >= 0.67), ("t3 cold", lambda l: l["t3"] == l["t3"] and l["t3"] <= 0.33),
         ("t10 >= 0.6", lambda l: l["t10"] == l["t10"] and l["t10"] >= 0.6), ("t10 <= 0.4", lambda l: l["t10"] == l["t10"] and l["t10"] <= 0.4),
         ("consistent", lambda l: l["sd10"] == l["sd10"] and l["sd10"] <= 0.4),
         ("plain >= 0.6", lambda l: l["plain"] == l["plain"] and l["plain"] >= 0.6), ("plain <= 0.45", lambda l: l["plain"] == l["plain"] and l["plain"] <= 0.45),
         ("minutes up", lambda l: l["mins"] is not None and l["mins"] >= 2), ("minutes down", lambda l: l["mins"] is not None and l["mins"] <= -2),
         ("rested 2+", lambda l: l["rest"] is not None and l["rest"] >= 2), ("back-to-back", lambda l: l["rest"] is not None and l["rest"] <= 1),
         ("phase early", lambda l: l["phase"] == "early"), ("phase mid", lambda l: l["phase"] == "mid"), ("phase late", lambda l: l["phase"] == "late"),
         ("line low", lambda l: l["band"] == "low"), ("line mid", lambda l: l["band"] == "mid"), ("line high", lambda l: l["band"] == "high"),
         ("level trail above", lambda l: l.get("_tt_hi") is True), ("level trail below", lambda l: l.get("_tt_hi") is False)]
BFN = dict(BANDS)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def fam_lists():
    b2 = [(lv, sd, ps, rk, lp, pc, gc) for lv in LEVELS for sd in AF.SIDES for ps in AF.PROPSETS for rk in (("p", "ev") if APP == "UD" else ("p",))
          for lp in ("all", "low", "high") for pc in (0, 2) for gc in AF.GCAPS]
    tr = [(pool, sd, ps, rk, fl, gc) for pool in TPOOLS for sd in AF.SIDES for ps in ("all", "core", "lowvol") for rk in TRANKS
          for fl in (0.0, 0.55, 0.60) for gc in AF.GCAPS]
    fx = [(pool, sd, fl, bn, gc) for pool in TPOOLS for sd in AF.SIDES for fl in (0.55, 0.60, 0.65, 0.70) for bn, _ in BANDS for gc in AF.GCAPS]
    doc = []
    if APP == "UD":
        E = AF.E
        doc = ["all", "core", "under", "points", "rebs", "mains", "priced", "edge59"] + [f"weighted:{c}" for c in E.CELLS] + \
              [f"single:{c}" for c in E.CELLS] + [f"ex:{c}" for c in E.CORE]
    return b2, tr, fx, doc


def pick_slip(cands, gc, pc=0, skip=0):
    pick, players, games, grps = [], set(), defaultdict(int), defaultdict(int)
    sk = 0
    for l in cands:
        if sk < skip:
            sk += 1
            continue
        if l["player"] in players or games[l["event_id"]] >= gc or (pc and grps[l["_grp"]] >= pc):
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; grps[l["_grp"]] += 1
        if len(pick) == AF.MAXSZ:
            break
    return pick


def grade_into(out, base, pick, pay):
    for j, (n, st_) in enumerate(ST):
        if len(pick) >= n:
            s = pick[:n]
            if APP != "UD" and len({l.get("team_id") for l in s}) < 2:
                continue
            out[base + j] = pay(s, st_) - 1.0


class Trail:
    """the app's own leg trailings - every read strictly before the slate's results enter"""
    def __init__(self):
        self.pl = defaultdict(lambda: deque(maxlen=10)); self.pa = defaultdict(lambda: [0, 0])
        self.ln = defaultdict(lambda: deque(maxlen=30)); self.bd = defaultdict(lambda: deque(maxlen=60))
        self.tt = defaultdict(lambda: deque(maxlen=300)); self.cut = {}; self.lines = defaultdict(list)

    def describe(self, legs):
        for l in legs:
            ck = (l["player_id"], l["prop"], l["tier"], l["side"])
            h = list(self.pl[ck])
            l["t3"] = float(np.mean(h[-3:])) if len(h) >= 3 else np.nan
            l["t10"] = float(np.mean(h)) if len(h) >= 5 else np.nan
            l["sd10"] = float(np.std(h)) if len(h) >= 5 else np.nan
            a, b = self.pa[ck]
            l["plain"] = a / b if b >= 5 else np.nan
            c = self.cut.get((l["prop"], l["tier"]))  # terciles of the level's lines on EARLIER slates
            l["band"] = "mid" if c is None else ("low" if l["line"] <= c[0] else "high" if l["line"] > c[1] else "mid")
            lt = self.ln[(l["prop"], l["tier"], l["side"], l["line"])]
            l["line_trail"] = float(np.mean(lt)) if len(lt) >= 8 else np.nan
            bt = self.bd[(l["prop"], l["tier"], l["side"], l["band"])]
            l["band_trail"] = float(np.mean(bt)) if len(bt) >= 15 else np.nan
            tt = self.tt[(l["tier"], l["side"])]
            l["tier_trail"] = float(np.mean(tt)) if len(tt) >= 50 else np.nan
        med = defaultdict(list)
        for l in legs:
            if l["tier_trail"] == l["tier_trail"]:
                med[l["tier"]].append(l["tier_trail"])
        med = {t: float(np.median(v)) for t, v in med.items()}
        for l in legs:
            l["_tt_hi"] = (l["tier_trail"] >= med[l["tier"]]) if l["tier_trail"] == l["tier_trail"] and l["tier"] in med else None

    def update(self, legs):
        for l in legs:
            self.lines[(l["prop"], l["tier"])].append(l["line"])
            if l["hit"] is None:
                continue
            ck = (l["player_id"], l["prop"], l["tier"], l["side"])
            self.pl[ck].append(int(l["hit"])); self.pa[ck][0] += int(l["hit"]); self.pa[ck][1] += 1
            self.ln[(l["prop"], l["tier"], l["side"], l["line"])].append(int(l["hit"]))
            self.bd[(l["prop"], l["tier"], l["side"], l["band"])].append(int(l["hit"]))
            self.tt[(l["tier"], l["side"])].append(int(l["hit"]))

    def refresh_bands(self):
        self.cut = {c: np.percentile(v[-20000:], [33.3, 66.7]) for c, v in self.lines.items() if len(v) >= 30}


def box_history(conn):
    """player -> [(date, min, team)] for minutes trend and rest"""
    h = defaultdict(list)
    for pid, d, mins in conn.execute("SELECT nba_player_id::text, game_date, min FROM nba_stats.player_game_log WHERE game_date >= '2024-09-01' ORDER BY 2").fetchall():
        h[pid].append((d, float(mins or 0)))
    return h


def ctx(l, day, bh, s0, s1):
    g = [x for x in bh.get(str(l["player_id"]), []) if x[0] < day]
    played = [x for x in g if x[1] > 0]
    l["rest"] = (day - played[-1][0]).days if played else None
    if len(played) >= 10:
        l["mins"] = float(np.mean([m for _, m in played[-3:]]) - np.mean([m for _, m in played[-10:]]))
    else:
        l["mins"] = None
    l["phase"] = None if s0 is None or s1 is None else ("early" if (day - s0).days <= 30 else ("late" if (s1 - day).days <= 30 else "mid"))


def day_families(legs, rows, lists, pay, E):
    b2, tr, fx, doc = lists
    o2 = np.full(len(b2) * NS, np.nan, np.float32)
    o3 = np.full(len(tr) * NS, np.nan, np.float32)
    o4 = np.full(len(fx) * NS, np.nan, np.float32)
    o5 = np.full(len(doc) * NS, np.nan, np.float32)
    med = defaultdict(list)
    for l in legs:
        med[(l["prop"], l["tier"])].append(l["line"])
    med = {k: float(np.median(v)) for k, v in med.items()}
    for l in legs:
        l["_lp"] = "low" if l["line"] <= med[(l["prop"], l["tier"])] else "high"
    cache = {}
    for i, (lv, sd, ps, rk, lp, pc, gc) in enumerate(b2):
        k = ("b2", lv, sd, ps, rk)
        if k not in cache:
            pset = AF.PROPSETS[ps]
            base = [l for l in legs if l["tier"] == lv and l["side"] in AF.SIDES[sd] and (pset is None or l["_grp"] in pset)]
            cache[k] = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * l["m"]))
        c = cache[k] if lp == "all" else [l for l in cache[k] if l["_lp"] == lp]
        grade_into(o2, i * NS, pick_slip(c, gc, pc), pay)
    for i, (pool, sd, ps, rk, fl, gc) in enumerate(tr):
        k = ("tr", pool, sd, ps, rk)
        if k not in cache:
            pset = AF.PROPSETS[ps]
            base = [l for l in legs if l["tier"] in TPOOLS[pool] and l["side"] in AF.SIDES[sd] and (pset is None or l["_grp"] in pset)
                    and l[rk] == l[rk]]
            cache[k] = sorted(base, key=lambda l: (-l[rk], -l["p"]))
        grade_into(o3, i * NS, pick_slip([l for l in cache[k] if l["p"] >= fl], gc), pay)
    for i, (pool, sd, fl, bn, gc) in enumerate(fx):
        k = ("fx", pool, sd)
        if k not in cache:
            base = [l for l in legs if l["tier"] in TPOOLS[pool] and l["side"] in AF.SIDES[sd]]
            cache[k] = sorted(base, key=lambda l: -l["p"])
        f = BFN[bn]
        grade_into(o4, i * NS, pick_slip([l for l in cache[k] if l["p"] >= fl and f(l)], gc), pay)
    if doc:
        pool = E.eligible_legs(rows)
        for i, comp in enumerate(doc):
            built = {}
            for j, (n, st_) in enumerate(ST):
                if n not in built:
                    built[n] = E.build_day_slips(pool, comp, n, 1)
                sl = built[n]
                if sl:
                    s = sl[0]
                    live = [l for l in s if l["hit"] is not None]
                    pp = AF.UDL.payout(st_, [{"hit": l["hit"], "factor": float(l["factor"])} for l in live])
                    o5[i * NS + j] = (1.0 if pp is None else pp) - 1.0
    return o2, o3, o4, o5


def scope_all():
    """portfolio scope: DP_SCOPE (tags, e.g. 2S,3S,3F,4F) or the owner's 2-6 picks; flex / dynamic from 3"""
    if os.environ.get("DP_SCOPE"):
        want = set(os.environ["DP_SCOPE"].split(","))
        return [j for j, (n, st_) in enumerate(ST) if AF.tag(n, st_) in want]
    return [j for j, (n, st_) in enumerate(ST) if n <= 6 and not (st_ in ("flex", "dynamic") and n < 3)]


def fam_name(fam, c, n, st_):
    t = AF.tag(n, st_)
    if fam == "B1":
        return AF.name(c, n, st_)
    if fam == "B2":
        lv, sd, ps, rk, lp, pc, gc = c
        return f"{APP} single {lv}-{dict(O='More', U='Less', B='both')[sd]}-{ps}-{rk}-lines {lp}{'-grp<=2' if pc else ''}-gc{gc} {t}"
    if fam == "TR":
        pool, sd, ps, rk, fl, gc = c
        return f"{APP} trail {pool}-{dict(O='More', U='Less', B='both')[sd]}-{ps}-by {rk}-p{fl:.2f}-gc{gc} {t}"
    if fam == "FX":
        pool, sd, fl, bn, gc = c
        return f"{APP} factor {pool}-{dict(O='More', U='Less', B='both')[sd]}-p{fl:.2f}-[{bn}]-gc{gc} {t}"
    return f"{APP} composition {c} {t}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if APP == "BETR":
        AF.BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
    import live_slip_engine as LSE
    days = AF.slate_days(conn)
    if os.environ.get("DP_SMOKE") == "1":
        days = [d for k, d in enumerate(days) if k % 6 == 0 or AF.season_of(d) == "2026-27"]
    bh = box_history(conn)
    combos = AF.strategy_list()
    lists = fam_lists()
    log(f"{APP}: {len(days)} slates | B1 {len(combos) * NS:,} B2 {len(lists[0]) * NS:,} TR {len(lists[1]) * NS:,} FX {len(lists[2]) * NS:,} "
        f"DOC {len(lists[3]) * NS:,} strategies")
    pay = AF.ud_pay if APP == "UD" else AF.betr_pay
    tr = Trail()
    cols = {f: [] for f in ("B1", "B2", "TR", "FX", "DOC")}
    seas, dts, p5, leg_rec = [], [], [], []
    win = {}
    for i, d in enumerate(days):
        s = AF.season_of(d)
        if s not in win:
            win[s] = LSE.regular_season_window(conn, d)
        st = AF.box(conn, d)
        if not st:
            continue
        legs, rows = (AF.load_ud if APP == "UD" else AF.load_betr)(conn, d, st)
        if not legs:
            continue
        for l in legs:
            l["_grp"] = AF.GRP.get(l["prop"])
            ctx(l, d, bh, *win[s])
        tr.refresh_bands()
        tr.describe(legs)
        cols["B1"].append(AF.day_matrix(legs, combos, pay))
        o2, o3, o4, o5 = day_families(legs, rows, lists, pay, AF.E)
        cols["B2"].append(o2); cols["TR"].append(o3); cols["FX"].append(o4); cols["DOC"].append(o5)
        seas.append(s); dts.append(d)
        leg_rec += [(s, l["p"], l["hit"], l["tier"]) for l in legs if l["hit"] is not None]
        if APP == "UD":
            pool = AF.E.eligible_legs(rows)
            r, seen = [], set()
            for comp, size, structure, cap in AF.UDL.PORTFOLIOS["P5"]:
                for slip in AF.E.build_day_slips(pool, comp, size, cap):
                    key = (size, structure, tuple(sorted((l["player"], l["prop"], l["side"], l["line"]) for l in slip)))
                    if key in seen:
                        continue
                    seen.add(key)
                    live = [l for l in slip if l["hit"] is not None]
                    pp = AF.UDL.payout(structure, [{"hit": l["hit"], "factor": float(l["factor"])} for l in live])
                    r.append((1.0 if pp is None else pp) - 1.0)
            p5.append(r)
        tr.update(legs)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 25 == 0:
            log(f"slate {i + 1}/{len(days)} {d}: {len(legs)} legs")
    seas = np.array(seas)
    fams = []
    lists_by = {"B1": combos, "B2": lists[0], "TR": lists[1], "FX": lists[2], "DOC": lists[3]}
    mats = []
    for f in ("B1", "B2", "TR", "FX", "DOC"):
        if lists_by[f] and cols[f]:
            M = np.stack(cols[f], axis=1)
            mats.append(M)
            fams += [(f, c) for c in lists_by[f] for _ in range(NS)]
    P = np.vstack(mats)
    del mats, cols
    sidx = np.tile(np.arange(NS), len(fams) // NS)
    log(f"matrix {P.shape}")
    hist = [s for s in ("2024-25", "2025-26") if (seas == s).sum() >= 20]
    if len(hist) == 2:
        A, Bm = seas == hist[0], seas == hist[1]
        la, lb_ = hist
    else:
        idx = np.where(seas == hist[0])[0]
        A = np.zeros(len(seas), bool); Bm = np.zeros(len(seas), bool)
        A[idx[: len(idx) // 2]] = True; Bm[idx[len(idx) // 2:]] = True
        la, lb_ = hist[0] + " 1st half", hist[0] + " 2nd half"
    C = seas == "2026-27"
    H = A | Bm
    print(f"\nperiods: {la} {int(A.sum())} | {lb_} {int(Bm.sum())} | this season {int(C.sum())}")

    def nm(r):
        f, c = fams[r]
        n, st_ = ST[sidx[r]]
        return fam_name(f, c, n, st_)
    na, mua, _, lba = AF.lb_stats(P[:, A]); nb, mub, _, lbb = AF.lb_stats(P[:, Bm]); nc, muc, _, _ = AF.lb_stats(P[:, C])
    robust = (na >= AF.MINN) & (nb >= AF.MINN) & (lba > 0) & (lbb > 0)
    weak = np.where(robust, np.minimum(mua, mub), -np.inf)
    famarr = np.array([f for f, _ in fams])
    summ = []
    for j, (n, st_) in enumerate(ST):
        rows_ = np.where(sidx == j)[0]
        X = P[rows_][:, H]
        print("\n" + "=" * 170 + f"\n{AF.tag(n, st_)} - {len(rows_):,} strategies (all families)")
        for (tr_, te_, a, b) in ((A, Bm, la, lb_), (Bm, A, lb_, la)):
            ntr, mutr, _, lbtr = AF.lb_stats(P[rows_][:, tr_]); nte, mute, _, _ = AF.lb_stats(P[rows_][:, te_])
            ok = (ntr >= AF.MINN) & (nte >= 10)
            top = [i for i in np.argsort(-np.where(ok, lbtr, -np.inf))[:10] if ok[i]]
            if top:
                print(f"  A  top {len(top)} chosen on {a} -> {b}: {100 * np.mean(mutr[top]):+.0f}% -> {100 * np.nanmean(mute[top]):+.0f}% ({sum(mute[top] > 0)} of {len(top)} positive)")
        w1 = AF.walk_forward(X, 1); w5 = AF.walk_forward(X, 5)
        print(f"  B  WALK-FORWARD top-1 {100 * w1.mean():+.0f}% | top-5 {100 * w5.mean():+.0f}%" if len(w1) else "  B  n/a")
        rb = rows_[robust[rows_]]
        print(f"  C  ROBUST: {len(rb)} (" + ", ".join(f"{f} {int((famarr[rb] == f).sum())}" for f in ("B1", "B2", "TR", "FX", "DOC")) + ")")
        for r in rb[np.argsort(-weak[rb])][:10]:
            x = P[r][H]
            print(f"       {nm(r):<78} {la} {100 * mua[r]:+.0f}% ({int(na[r])}d) | {lb_} {100 * mub[r]:+.0f}% ({int(nb[r])}d) | dd {AF.max_dd(x):.1f}u | "
                  f"this season {('%+.0f%% (%dd)' % (100 * muc[r], nc[r])) if nc[r] else 'none'}")
        for f in ("B2", "TR", "FX", "DOC"):
            rf = rb[famarr[rb] == f]
            if len(rf):
                r = rf[np.argmax(weak[rf])]
                print(f"     best {f}: {nm(r)} {100 * mua[r]:+.0f}% / {100 * mub[r]:+.0f}%")
        summ.append((AF.tag(n, st_), len(rb), w1.mean() if len(w1) else np.nan, w5.mean() if len(w5) else np.nan,
                     nm(rb[np.argmax(weak[rb])]) if len(rb) else "none"))
    print("\n" + "=" * 170 + "\nSUMMARY (structure: robust | walk-forward top-1 / top-5 | best robust)")
    for t, nr, a1, a5, b in summ:
        print(f"  {t}: {nr} robust | WF {100 * a1:+.0f}% / {100 * a5:+.0f}% | {b}")
    # ---------------- this-season diagnosis ----------------
    print("\n" + "=" * 170 + "\nTHIS-SEASON DIAGNOSIS")
    lr = np.array([(1 if s == "2026-27" else 0, p, h) for s, p, h, t in leg_rec], dtype=float)
    if (lr[:, 0] == 1).sum():
        print("  leg calibration, history vs this season (final_hp bin: legs, hit):")
        for lo, hi in ((0, .45), (.45, .55), (.55, .6), (.6, .65), (.65, .7), (.7, 1.01)):
            for lab, w in (("history", 0), ("this season", 1)):
                k = (lr[:, 0] == w) & (lr[:, 1] >= lo) & (lr[:, 1] < hi)
                if k.sum():
                    print(f"    {lo:.2f}-{hi:.2f} {lab:<12} {int(k.sum()):7d} legs, mean final_hp {lr[k, 1].mean():.3f}, hit {lr[k, 2].mean():.3f}")
    nC = int(C.sum())
    if nC:
        def pct(series_h, series_c):
            x = np.nan_to_num(series_h)
            v = np.nan_to_num(series_c)
            wins = np.array([x[i:i + nC].sum() for i in range(len(x) - nC + 1)])
            return float(np.mean(wins <= v.sum())) if len(wins) else np.nan
        top = np.where(robust)[0]
        top = top[np.argsort(-weak[top])][:60]
        pcs = [pct(P[r][H], P[r][C]) for r in top]
        print(f"  the 60 most robust strategies, this season's {nC} slates as a percentile of their own historical {nC}-slate windows:")
        print(f"    median percentile {100 * np.nanmedian(pcs):.0f} | below the 10th: {sum(1 for p in pcs if p < 0.10)} of {len(pcs)} | below the 25th: "
              f"{sum(1 for p in pcs if p < 0.25)} | above the 50th: {sum(1 for p in pcs if p > 0.5)}")
        print("    (inside normal variance: about 6 of 60 below the 10th and 30 above the 50th are expected by chance)")
        if p5:
            pl5 = np.array([sum(r) for r in p5])
            print(f"  live P5: this season {pl5[C].sum():+.1f}u on {sum(len(r) for j, r in enumerate(p5) if C[j])} slips -> percentile "
                  f"{100 * pct(pl5[H], pl5[C]):.0f} of its historical {nC}-slate windows")
    # ---------------- portfolio, honest: everything chosen on one period, measured on the other ----------------
    print("\n" + "=" * 170 + "\nPORTFOLIO HOLDOUT (shortlist AND subset chosen on one period only, then measured on the other and this season)")
    for (TRm, TEm, a, b) in ((A, Bm, la, lb_), (Bm, A, lb_, la)):
        ntr, mutr, _, lbtr = AF.lb_stats(P[:, TRm])
        ok = (ntr >= AF.MINN) & (lbtr > 0)
        cand_h = []
        for j in scope_all():
            rr = np.where(ok & (sidx == j))[0]
            sc = sorted(((np.nan_to_num(P[r][TRm]).sum() / max(AF.max_dd(np.nan_to_num(P[r][TRm])), 1.0), r) for r in rr), reverse=True)
            taken = []
            for s_, r in sc:
                sig = tuple(np.round(np.nan_to_num(P[r][TRm]), 3))
                if any(sig == t for _, t in taken):
                    continue
                taken.append((s_, sig)); cand_h.append((s_, r))
                if len(taken) == PER:
                    break
        cand_h.sort(reverse=True)
        sh = [r for _, r in cand_h[:K]]
        Zh = np.nan_to_num(P[sh]); Vh = (~np.isnan(P[sh])).astype(float)
        best = {}
        for k in range(1, len(sh) + 1):
            for sub in itertools.combinations(range(len(sh)), k):
                sub = list(sub)
                pl = Zh[sub].sum(axis=0); stk = Vh[sub].sum(axis=0)
                m = RP.metrics(pl, stk, TRm)
                if m["n"] and m["spd"] >= 1.0:
                    for lab, val in (("best profit / drawdown", m["rec"]), ("most profit, drawdown <= 15u", m["profit"] if m["dd"] <= 15 else -1e9)):
                        if lab not in best or val > best[lab][0]:
                            best[lab] = (val, sub, pl, stk)
        for lab, (_v, sub, pl, stk) in best.items():
            mt = RP.metrics(pl, stk, TRm); me = RP.metrics(pl, stk, TEm); mc = RP.metrics(pl, stk, C)
            print(f"  chosen on {a} ({lab}, {len(sub)} strategies, {mt['spd']:.2f} slips a day): {a} ROI {100 * mt['roi']:+.0f}% dd {mt['dd']:.1f}u -> "
                  f"{b} ROI {100 * me['roi']:+.0f}% profit {me['profit']:+.0f}u dd {me['dd']:.1f}u losing days {100 * me['lose']:.0f}% | this season "
                  f"{('%+.0f%% on %d slips' % (100 * mc['roi'], mc['n'])) if mc['n'] else 'none'}")
            for i in sub:
                print(f"      {nm(sh[i])}")
    # ---------------- portfolio ----------------
    scope = scope_all()
    cand = []
    for j in scope:
        rr = np.where(robust & (sidx == j))[0]
        sc = []
        for r in rr:
            x = np.nan_to_num(P[r][H]); dd = AF.max_dd(x)
            sc.append((x.sum() / max(dd, 1.0), r))
        sc.sort(reverse=True)
        taken = []
        for s_, r in sc:
            sig = tuple(np.round(np.nan_to_num(P[r]), 3))
            if any(sig == t for _, _, t in taken):
                continue
            taken.append((s_, r, sig))
            if len(taken) == 2:
                break
        cand += [(s_, r) for s_, r, _ in taken]
    cand.sort(reverse=True)
    short = [r for _, r in cand[:K]]
    S = P[short]; V = ~np.isnan(S); Z = np.nan_to_num(S)
    print("\n" + "=" * 170 + f"\nPORTFOLIO - SHORTLIST ({len(short)}):")
    for k, r in enumerate(short):
        mh = RP.metrics(Z[k], V[k].astype(float), H); mc = RP.metrics(Z[k], V[k].astype(float), C)
        print(f"  {k + 1:2d} {nm(r):<78} {la} {100 * mua[r]:+.0f}% | {lb_} {100 * mub[r]:+.0f}% | dd {mh['dd']:.1f}u | profit/dd {mh['rec']:.1f} | "
              f"this season {('%+.0f%% on %d' % (100 * mc['roi'], mc['n'])) if mc['n'] else 'none'}")
    rows = []
    for k in range(1, len(short) + 1):
        for sub in itertools.combinations(range(len(short)), k):
            sub = list(sub)
            pl = Z[sub].sum(axis=0); stk = V[sub].sum(axis=0).astype(float)
            mh = RP.metrics(pl, stk, H)
            if mh["n"]:
                rows.append((sub, mh, RP.metrics(pl, stk, A), RP.metrics(pl, stk, Bm), RP.metrics(pl, stk, C), pl, stk))

    def pr(r):
        sub, mh, ma, mb, mc, _, _ = r
        return (f"{'+'.join(str(i + 1) for i in sub):<26} slips/day {mh['spd']:.2f} | ROI {100 * mh['roi']:+.0f}% ({100 * ma['roi']:+.0f} / {100 * mb['roi']:+.0f}) | "
                f"profit {mh['profit']:+.0f}u | dd {mh['dd']:.1f}u | profit/dd {mh['rec']:.1f} | losing days {100 * mh['lose']:.0f}% | "
                f"this season {('%+.0f%% on %d slips' % (100 * mc['roi'], mc['n'])) if mc['n'] else 'none'}")
    lead = []
    for lab, key in (("best profit / drawdown, weaker period ROI >= +40%", lambda r: -r[1]["rec"] if min(r[2]["roi"], r[3]["roi"]) >= 0.40 else 0),
                     ("most profit with drawdown <= 15u", lambda r: -r[1]["profit"] if r[1]["dd"] <= 15 else 0),
                     ("most profit with drawdown <= 25u", lambda r: -r[1]["profit"] if r[1]["dd"] <= 25 else 0)):
        print(f"\n  -- {lab}")
        for r in sorted(rows, key=key)[:8]:
            print("    " + pr(r))
        lead.append(sorted(rows, key=key)[0])
    L = int(round(np.mean([np.sum(seas == s) for s in hist]))) if len(hist) == 2 else int(np.sum(seas == hist[0]))
    seen = set()
    for r in lead:
        if tuple(r[0]) in seen:
            continue
        seen.add(tuple(r[0]))
        sub, mh, *_x, pl, stk = r
        print(f"\n  == {'+'.join(str(i + 1) for i in sub)} ({mh['spd']:.2f} slips a day, ROI {100 * mh['roi']:+.0f}%, dd {mh['dd']:.1f}u)")
        PP.report("", pl[H], list(range(int(H.sum()))), "any history slate")
        for kk in (1.0, 0.6, 0.4):
            R = np.array([PP.boot_season(pl[H], stk[H], stk[H], stk[H], L, kk, mh["roi"]) for _ in range(NB)])
            prof, dd, fp, uw, _s, ns_ = R.T
            print(f"    edge {100 * kk:3.0f}% (ROI ~{100 * kk * mh['roi']:+.0f}%): season p10 {np.percentile(prof, 10):+.0f}u | median {np.median(prof):+.0f}u | "
                  f"p90 {np.percentile(prof, 90):+.0f}u | losing season {100 * np.mean(prof < 0):.0f}% | dd median {np.median(dd):.1f}u, p90 {np.percentile(dd, 90):.1f}u | "
                  f"slips {np.median(ns_):.0f}")
    log("done")


if __name__ == "__main__":
    main()
