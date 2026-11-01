#!/usr/bin/env python3
"""
RESEARCH - DEMOTED-STARTER FILTER ON THE LIVE PRIZEPICKS PICK (2026-11-01; owner 10:18 PT: "The starter should be being used some
way, research, debug, understand and fix accordingly"; 10:59 PT: "Start back testing now"). READ-ONLY (SELECTs only).

FINDING THAT PROMPTED IT (research_starter_role_change.py, runs 41337785241 / 41338697812 / 41338700192): a player who came off the
bench in his LAST game after starting >= 4 of his last 5 (as-of: box scores of games before the slate day, known the morning after)
is over-rated on the Over by final_hp in 13 of 14 prop x season cells (gap vs the stable starters: threes -0.029 / -0.062, reb_ast
-0.047 / -0.013, pts_reb -0.021 / -0.019, pts_ast -0.024 / -0.010, assists -0.012 / -0.010, rebounds -0.004 / -0.010, pra +0.003 /
-0.030). New starters are already absorbed by final_hp - not filtered.

METHOD: the SAME harness as research_slip_exposure.py (the production pick on every regular-season slate of both seasons - live
loader, certified pool, eligible_legs, leg_allowed, family pools, side / line rules, correlation map, build_day_slips, the six
daily-staked strategies at their code caps, graded on the box scores by the production grader ENG.grade; final 7 days out, small
slate cap 1, week-1 5-Flex defensive-Over rule). Each variant changes ONLY which legs enter the pool (the next-ranked valid slip
replaces a slip that lost a leg):
  base   the production pool
  DEM    drop an Over leg whose player came off the bench last game after starting >= 4 of his last 5 (this season)
  DEM3   the same with >= 3 of his last 5 (looser)
DECISION RULE (written before the run, the exposure study's rule): adoptable only if in BOTH seasons (a) ROI >= base ROI - 2 points,
(b) max drawdown <= base, (c) net / max drawdown >= base, (d) day-blocked bootstrap 95% lower bound of ROI > 0. Then the full
production replay (audit_season_replay) confirms it before it is switched on (it would be an engine pool filter like
over_minutes_floor, config-gated).
Also reported (owner standing rule): composition 'core' and 'regular' at cap 5, sizes 2-6, Flex and Power, base vs DEM vs DEM3;
and the dropped legs themselves (count, hit rate).
Env: DATABASE_URL, RX_SEASON (2024-25 | 2025-26), RX_BOOT (2000), RX_EVERY (1 = every slate day; n = every n-th day, a sample).
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
VARIANTS = ["base", "DEM", "DEM3"]
EVERY = int(os.environ.get("RX_EVERY", "1"))
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
    days = days[::EVERY]
    cmap = ENG.load_corr(conn)
    dropped = {v: [0, 0, 0] for v in VARIANTS}           # pool legs dropped: count, graded, hits
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
        pids = sorted({str(l["player_id"]) for v in pool0.values() for l in v if l.get("player_id")})
        # the production count (pick(): slate_games OR the team game log - slate_games does not cover 2024-25; first run had every
        # 2024-25 day as a small slate, cap 1)
        n_games = conn.execute("""SELECT greatest((SELECT count(*) FROM nba_calendar.slate_games WHERE game_date=%s),
                                                  (SELECT count(*) / 2 FROM nba_team.team_game_log WHERE game_date=%s))""", (day, day)).fetchone()[0]
        small = n_games <= 4
        # AS-OF ROLE: this season's games before the slate day, newest first (box-score starter flag; known the morning after)
        role = {}
        for pid, flags in conn.execute("""SELECT x.pid, array_agg(x.st ORDER BY x.gd DESC) FROM (
                    SELECT g.nba_player_id::text pid, g.game_date gd, s.is_starter st,
                           row_number() OVER (PARTITION BY g.nba_player_id ORDER BY g.game_date DESC) rn
                    FROM nba_stats.player_game_log g JOIN nba_stats.player_game_starter_status s ON s.player_id = g.player_id AND s.game_id = g.game_id
                    WHERE g.game_date < %s AND g.game_date >= %s AND g.game_id LIKE '002%%' AND g.nba_player_id::text = ANY(%s)) x
                    WHERE x.rn <= 5 GROUP BY x.pid""", (day, s0, pids)).fetchall():
            if len(flags) == 5:
                role[str(pid)] = (int(flags[0]), int(sum(flags)))

        def demoted(l, k):
            r = role.get(str(l["player_id"]))
            return r is not None and r[0] == 0 and r[1] >= k
        in_week1 = 0 <= (day - s0).days <= 6

        def filt(pool, v):
            if v in ("DEM", "DEM3"):
                k = 4 if v == "DEM" else 3
                return {c: [l for l in ls if not (l["side"] == "Over" and demoted(l, k))] for c, ls in pool.items()}
            return pool

        drop_today = {v: list({lkey(l): l for ls in pool0.values() for l in ls if l["side"] == "Over" and demoted(l, 4 if v == "DEM" else 3)}.values())
                      for v in VARIANTS if v != "base"}

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
            share = gcap = pcap = None
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
        # matrix: core / regular at cap 5, sizes 2-6, Flex and Power, every variant's pool (no calendar rule)
        mat_built = {}
        for v in VARIANTS:
            pv = filt(pool0, v)
            bv = fam_breadth(pv)
            for comp in ("core", "regular"):
                for size in MATRIX_SIZES:
                    for structure in ("flex", "power"):
                        ranked = ENG.build_day_slips(pv, comp, size, structure, 10 ** 9, cmap, bv)
                        ch = pick_from_ranked(ranked, 5, None)
                        mat_built[(comp, size, structure, v)] = ch
                        all_slips += ch
        for v, dl in drop_today.items():
            all_slips.append(dl)
        outc = L.outcomes_boxscore(conn, day, [(None, None, s) for s in all_slips])
        if outc.pop("__boxscores__", 0) == 0:
            skipped_days += 1
            continue

        for v, dl in drop_today.items():
            for l in dl:
                h = outc.get(lkey(l))
                dropped[v][0] += 1
                if h is not None:
                    dropped[v][1] += 1; dropped[v][2] += h

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
    print("\n=== DROPPED POOL LEGS (Over legs of demoted players; pool-level, before slip selection) ===", flush=True)
    for v, (n, g, h) in dropped.items():
        print(f"  {v:<5} dropped {n} pool legs, graded {g}, hit {h/g if g else 0:.3f}", flush=True)
    print("\n=== MATRIX: core / regular, cap 5, sizes 2-6, Flex and Power - base vs DEM vs DEM3 ===", flush=True)
    for comp in ("core", "regular"):
        for size in MATRIX_SIZES:
            for structure in ("flex", "power"):
                row = []
                for v in VARIANTS:
                    n, net, dl = mat[(comp, size, structure, v)]
                    s = summarize([(None, a, b) for a, b in dl]) if dl else None
                    row.append(f"{v} {n} slips {100*net/n if n else 0:+6.1f}% dd {s['dd'] if s else 0:6.1f}")
                print(f"  {comp:<8} {size}-{structure:<5} " + " | ".join(row), flush=True)


if __name__ == "__main__":
    main()
