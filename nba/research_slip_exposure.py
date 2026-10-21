#!/usr/bin/env python3
"""
RESEARCH - SAME LEG IN MANY SLIPS: EXPOSURE CAPS, AND TWO LEG FILTERS (2026-10-20; owner 21:48 PT: "Research online and ground your
proposed fixes, simulate and test them ... they need to prove successful before deploying. We clearly have a correlation issue in
many players on many slips. We need to fix it all before tomorrow's runs"). READ-ONLY (SELECTs only).

WHY: on 10-20 Payton Pritchard turnovers Over 1.5 sat in 5 of 8 PrizePicks slips; the two-season replay shows the same habit
(115 slip-legs of steals Under were 11 distinct legs). Each strategy takes its top-`cap` combinations of its 12 best legs ranked by
summed edge, so the best legs repeat in nearly every slip, and the strategies draw from overlapping pools.
GROUNDING (online, 2026-10-20): every slip holding leg X is one bet on X (simultaneous-Kelly: MacLean-Thorp-Ziemba, Thorp via
DataGolf - correlated bets are sized down); DFS optimizers cap per-player exposure (Stokastic / FanGraphs / Footballguys - no
universal number; "even elite plays rarely deserve a majority of lineups"); spreading exposure mainly cuts variance and costs
little EV only when the next-best legs are close in edge - which is exactly what has to be measured.

METHOD: the production pick on every regular-season slate of both seasons - the live loader (load_board_legs_live), the certified
pool (eligible_legs, leg_allowed, family pools, the D_points Under / 22.5 rules, the correlation map, build_day_slips with the
broad-day tie-break) - for the six daily-staked strategies at their code caps, graded on the box scores by the production grader
(ENG.grade, PrizePicks reversion rules). Calendar rules kept: final 7 days out, small slate (<= 4 games) cap 1, week-1 5-Flex
without a defensive Over not staked. NOT modelled (identical for every variant, confirmed afterwards by the full season replay):
strategy states / gates, drought rotation, pre-break plan, late-March raise, streak flags, the daily stake ceiling.
Each variant changes ONLY which slips are taken from the same ranked list (or which legs enter the pool):
  base         the production rule (top cap by rank)
  S50 / S34    per strategy: a leg in at most ceil(share x cap) of that strategy's slips (the next-ranked valid slip replaces it)
  G3..G6       per day, across all strategies in production order: a leg in at most M staked slips
  P4 / P6      per day: a PLAYER (any prop) in at most M staked slips
  S50+G4       both
  T15 / T20    pool filter: drop a threes_D1 (threes Over demon) leg whose model final_hp exceeds the market-anchored true_hp by >= g
  M20 / M24    pool filter: drop an Over leg whose player's trailing-10 minutes (before the day) average < M
DECISION RULE (written before the run): a variant is adoptable only if in BOTH seasons (a) ROI >= base ROI - 2 points, (b) max
drawdown <= base, (c) net / max drawdown >= base, (d) day-blocked bootstrap 95% lower bound of ROI > 0. Then the full production
replay (audit_season_replay) must confirm it before it is switched on.
Also reported (owner standing rule): composition 'core' and 'regular' at cap 5, sizes 2-6, Flex and Power, base vs S40.
Env: DATABASE_URL, RX_SEASON (2024-25 | 2025-26), RX_BOOT (2000).
"""
import math
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L          # noqa: E402
ENG = L.ENG

SEASON = os.environ.get("RX_SEASON", "2025-26")
BOOT = int(os.environ.get("RX_BOOT", "2000"))
RANGES = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
DAILY = ["A_wsteals_5flex", "A_regular_5power", "A_wrebounds_4flex", "A_core_3power", "C_wstocks_4flex", "D_points_3power"]
VARIANTS = ["base", "S50", "S34", "G3", "G4", "G5", "G6", "P4", "P6", "S50+G4", "T15", "T20", "M20", "M24"]
# RX_VARIANTS (sensitivity runs): a comma list replacing the set above; "base" is always first. M<n> = Over minutes floor n.
if os.environ.get("RX_VARIANTS"):
    VARIANTS = ["base"] + [v.strip() for v in os.environ["RX_VARIANTS"].split(",") if v.strip() and v.strip() != "base"]
MATRIX_SIZES = [2, 3, 4, 5, 6]


def lkey(l):
    return (l["player"], l["prop"], l["side"], float(l["line"]))


def pick_from_ranked(ranked, cap, share=None, glob=None, gcap=None, pglob=None, pcap=None):
    """Greedy down the production ranking: take a slip unless one of its legs (or players) is already at its cap."""
    out, own = [], defaultdict(int)
    per = math.ceil(share * cap) if share else None
    for s in ranked:
        if len(out) >= cap:
            break
        ks = [lkey(l) for l in s]
        if per is not None and any(own[k] >= per for k in ks):
            continue
        if gcap is not None and any(glob[k] >= gcap for k in ks):
            continue
        if pcap is not None and any(pglob[l["player"]] >= pcap for l in s):
            continue
        out.append(s)
        for k in ks:
            own[k] += 1
    return out


def boot_lb(days, draws, seed=11):
    if len(days) < 8:
        return None
    rng = random.Random(seed)
    n, vals = len(days), []
    for _ in range(draws):
        net = st = 0.0
        for _ in range(n):
            a, b = days[rng.randrange(n)]
            net += a; st += b
        vals.append(net / st if st else 0.0)
    vals.sort()
    return vals[int(0.025 * draws)]


def summarize(day_rows):
    """day_rows: [(date, net, staked)] in date order."""
    net = sum(r[1] for r in day_rows); st = sum(r[2] for r in day_rows)
    eq = peak = dd = 0.0
    for _, n, _s in day_rows:
        eq += n; peak = max(peak, eq); dd = max(dd, peak - eq)
    nets = [r[1] for r in day_rows]
    mean = sum(nets) / len(nets) if nets else 0.0
    sd = math.sqrt(sum((x - mean) ** 2 for x in nets) / (len(nets) - 1)) if len(nets) > 1 else 0.0
    return {"slips": st, "net": net, "roi": (net / st if st else 0.0), "dd": dd, "net_dd": (net / dd if dd else float("inf")),
            "sd": sd, "worst": min(nets) if nets else 0.0, "losing": (sum(1 for x in nets if x < 0) / len(nets) if nets else 0.0),
            "lb": boot_lb([(r[1], r[2]) for r in day_rows], BOOT)}


def main():
    d0, d1 = RANGES[SEASON]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    conn.execute("SET jit = off")
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_market.pp_leg_price WHERE snapshot_label='window'
                                          AND game_date BETWEEN %s AND %s ORDER BY 1""", (d0, d1)).fetchall()]
    cmap = ENG.load_corr(conn)
    print(f"{SEASON}: {len(days)} slate days | variants {VARIANTS}", flush=True)
    res = {v: [] for v in VARIANTS}
    per_strat = {v: defaultdict(lambda: [0, 0.0]) for v in VARIANTS}
    expo = {v: [] for v in VARIANTS}                      # per day: max slips sharing one leg, distinct legs / slip-legs
    mat = defaultdict(lambda: [0, 0.0, []])              # (comp, size, structure, variant) -> slips, net, per-day nets
    leg_hits = {v: [0, 0] for v in VARIANTS}
    skipped_days = 0
    for day in days:
        s0, s1 = L.regular_season_window(conn, day)
        if s0 is None or s1 is None or not (s0 <= day <= s1) or (s1 - day).days <= 7:
            continue
        legs = L.load_board_legs(conn, day)
        n_board = len({(l["player_id"], l["prop"], l["tier"], l["side"], l["line"]) for l in legs if not l.get("whole_number")})
        if not legs or n_board < L.MIN_BOARD_LEGS:
            skipped_days += 1
            continue
        L.attach_pf20(conn, day, legs)
        pool0 = ENG.eligible_legs(legs)
        t10 = L.trailing10(conn, day, {l["player_id"] for v in pool0.values() for l in v if l["prop"] == "steals" and l.get("player_id")})
        pool0 = {c: [l for l in v if L.leg_allowed(l, t10)] for c, v in pool0.items()}
        # leg data for the filters: final_hp per leg (rank_key final_hp row), market-anchored true_hp, trailing-10 minutes
        fh = {(l["player_id"], l["prop"], l["side"], float(l["line"])): l["score"] for l in legs if l["rank_key"] == "final_hp"}
        th = {(str(p), pr, sd, float(ln)): float(t) for p, pr, sd, ln, t in conn.execute(
            "SELECT player_id, prop, side, line, true_hp FROM nba_score.board_true_hp WHERE game_date=%s AND prop='threes_made'", (day,)).fetchall()}
        pids = sorted({str(l["player_id"]) for v in pool0.values() for l in v if l.get("player_id")})
        mins = {str(r[0]): float(r[1]) for r in conn.execute("""SELECT x.pid, avg(x.m) FROM (SELECT g.nba_player_id pid, g.min::float m,
                    row_number() OVER (PARTITION BY g.nba_player_id ORDER BY g.game_date DESC) rn FROM nba_stats.player_game_log g
                    WHERE g.game_date < %s AND g.nba_player_id::text = ANY(%s)) x WHERE x.rn <= 10 GROUP BY x.pid""", (day, pids)).fetchall()}
        # the production count (pick(): slate_games OR the team game log - slate_games does not cover 2024-25; first run had every
        # 2024-25 day as a small slate, cap 1)
        n_games = conn.execute("""SELECT greatest((SELECT count(*) FROM nba_calendar.slate_games WHERE game_date=%s),
                                                  (SELECT count(*) / 2 FROM nba_team.team_game_log WHERE game_date=%s))""", (day, day)).fetchone()[0]
        small = n_games <= 4
        in_week1 = 0 <= (day - s0).days <= 6

        def filt(pool, v):
            if v in ("T15", "T20"):
                g = 0.15 if v == "T15" else 0.20
                def keep(l):
                    if l["cell"] != "threes_D1":
                        return True
                    k = (str(l["player_id"]), l["prop"], l["side"], float(l["line"]))
                    m, a = fh.get((l["player_id"], l["prop"], l["side"], float(l["line"]))), th.get(k)
                    return m is None or a is None or (m - a) < g
                return {c: [l for l in ls if keep(l)] for c, ls in pool.items()}
            if v.startswith("M") and v[1:].isdigit():
                mm = float(v[1:])
                return {c: [l for l in ls if not (l["side"] == "Over" and mins.get(str(l["player_id"]), 99.0) < mm)] for c, ls in pool.items()}
            return pool

        def fam_breadth(pool):
            fd = defaultdict(set)
            for c, ls in pool.items():
                for l in ls:
                    fd[c.replace("_U", "")].add(l["player"])
            return sum(1 for v in fd.values() if len(v) >= 2) >= 5

        all_slips = []                                    # for the box-score lookup
        built = {}
        for v in VARIANTS:
            pool = filt(pool0, v)
            broad = fam_breadth(pool)
            pools = {"": pool}
            for fam, excl in L.EXCLUDE_BY_FAMILY.items():
                pools[fam] = {c: ls for c, ls in pool.items() if c not in excl}
            glob, pglob = defaultdict(int), defaultdict(int)
            share = {"S50": 0.5, "S34": 0.34, "S50+G4": 0.5}.get(v)
            gcap = {"G3": 3, "G4": 4, "G5": 5, "G6": 6, "S50+G4": 4}.get(v)
            pcap = {"P4": 4, "P6": 6}.get(v)
            out = []
            for name in DAILY:
                comp, size, structure, cap = L.STRATEGIES[name][:4]
                cap = 1 if small else cap
                fp = pools.get(name[0], pool)
                so = L.SIDE_FILTER_BY_STRATEGY.get(name)
                if so:
                    fp = {c: [l for l in ls if l["side"] == so] for c, ls in fp.items()}
                cr = L.MAX_LINE_BY_STRATEGY.get(name)
                if cr:
                    fp = {c: [l for l in ls if not (l["prop"] == cr[0] and l["side"] == cr[1] and float(l["line"]) > cr[2])] for c, ls in fp.items()}
                ranked = ENG.build_day_slips(fp, comp, size, structure, 10 ** 9, cmap, broad)
                chosen = pick_from_ranked(ranked, cap, share, glob, gcap, pglob, pcap)
                for s in chosen:
                    staked = True
                    if in_week1 and size == 5 and structure == "flex" and name.startswith(("A_", "C_")):
                        staked = any(l["side"] == "Over" and l["tier"] == "R" and l["prop"] in ("steals", "turnovers", "stocks", "blocks") for l in s)
                    if not staked:
                        continue                          # recorded, never staked - and not counted toward exposure
                    for l in s:
                        glob[lkey(l)] += 1; pglob[l["player"]] += 1
                    out.append((name, structure, s))
            built[v] = out
            all_slips += [s for _n, _st, s in out]
        # matrix: core / regular at cap 5, sizes 2-6, Flex and Power, base vs S40 (production pool, no calendar rule)
        broad0 = fam_breadth(pool0)
        mat_built = {}
        for comp in ("core", "regular"):
            for size in MATRIX_SIZES:
                for structure in ("flex", "power"):
                    ranked = ENG.build_day_slips(pool0, comp, size, structure, 10 ** 9, cmap, broad0)
                    for v, sh in (("base", None), ("S40", 0.4)):
                        ch = pick_from_ranked(ranked, 5, sh)
                        mat_built[(comp, size, structure, v)] = ch
                        all_slips += ch
        outc = L.outcomes_boxscore(conn, day, [(None, None, s) for s in all_slips])
        if outc.pop("__boxscores__", 0) == 0:
            skipped_days += 1
            continue

        def grade(s, structure):
            hs = [outc.get(lkey(l)) for l in s]
            hits, payout = ENG.grade([dict(l, hit=h) for l, h in zip(s, hs)], structure)
            return payout - 1.0, hs

        for v in VARIANTS:
            net = st = 0.0
            cnt = defaultdict(int)
            for name, structure, s in built[v]:
                p, hs = grade(s, structure)
                net += p; st += 1
                per_strat[v][name][0] += 1; per_strat[v][name][1] += p
                for l, h in zip(s, hs):
                    cnt[lkey(l)] += 1
                    if h is not None:
                        leg_hits[v][0] += h; leg_hits[v][1] += 1
            if st:
                res[v].append((day, net, st))
                expo[v].append((max(cnt.values()), len(cnt) / sum(cnt.values())))
        for key, ch in mat_built.items():
            dn = 0.0
            for s in ch:
                p, _ = grade(s, key[2])
                dn += p
            m = mat[key]; m[0] += len(ch); m[1] += dn
            if ch:
                m[2].append((dn, len(ch)))
    print(f"\n{SEASON}: graded slate days {len(res['base'])} (skipped {skipped_days}: thin board / no box score)", flush=True)
    print("\n=== PORTFOLIO (six daily strategies, flat 1 unit) ===", flush=True)
    print(f"{'variant':<8} {'slips':>6} {'net':>9} {'ROI':>7} {'maxDD':>7} {'net/DD':>7} {'day sd':>7} {'worst':>7} {'lose%':>6} {'LB95':>7} "
          f"{'legHit':>7} {'maxLegExp':>9} {'distinct':>8}", flush=True)
    base = summarize(res["base"])
    for v in VARIANTS:
        s = summarize(res[v])
        e = expo[v]
        print(f"{v:<8} {s['slips']:>6.0f} {s['net']:>+9.1f} {100*s['roi']:>+6.1f}% {s['dd']:>7.1f} {s['net_dd']:>7.2f} {s['sd']:>7.2f} "
              f"{s['worst']:>+7.1f} {100*s['losing']:>5.1f}% {(100*s['lb']) if s['lb'] is not None else float('nan'):>+6.1f}% "
              f"{(leg_hits[v][0]/leg_hits[v][1]) if leg_hits[v][1] else 0:>7.3f} {sum(x[0] for x in e)/len(e) if e else 0:>9.2f} "
              f"{sum(x[1] for x in e)/len(e) if e else 0:>8.2f}", flush=True)
        if v != "base":
            ok = (s["roi"] >= base["roi"] - 0.02 and s["dd"] <= base["dd"] and s["net_dd"] >= base["net_dd"] and (s["lb"] or -1) > 0)
            print(f"RULE|{SEASON}|{v}|roi {100*(s['roi']-base['roi']):+.1f}pt|dd {s['dd']-base['dd']:+.1f}|net/dd {s['net_dd']-base['net_dd']:+.2f}|"
                  f"lb {100*(s['lb'] or 0):+.1f}%|{'PASS' if ok else 'fail'}", flush=True)
    print("\n=== PER STRATEGY: slips / net / ROI ===", flush=True)
    for name in DAILY:
        print(f"  {name:<20} " + " | ".join(f"{v} {per_strat[v][name][0]} {per_strat[v][name][1]:+.0f} "
                                              f"{(100*per_strat[v][name][1]/per_strat[v][name][0]) if per_strat[v][name][0] else 0:+.0f}%"
                                              for v in VARIANTS), flush=True)
    print("\n=== MATRIX: core / regular, cap 5, sizes 2-6, Flex and Power - base vs S40 (each leg in <= 2 of the 5 slips) ===", flush=True)
    for comp in ("core", "regular"):
        for size in MATRIX_SIZES:
            for structure in ("flex", "power"):
                row = []
                for v in ("base", "S40"):
                    n, net, dl = mat[(comp, size, structure, v)]
                    s = summarize([(None, a, b) for a, b in dl]) if dl else None
                    row.append(f"{v} {n} slips {100*net/n if n else 0:+6.1f}% dd {s['dd'] if s else 0:6.1f}")
                print(f"  {comp:<8} {size}-{structure:<5} " + " | ".join(row), flush=True)


if __name__ == "__main__":
    main()
