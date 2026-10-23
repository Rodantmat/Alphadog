#!/usr/bin/env python3
"""
RESEARCH - BOARD TYPES, ROUND 2 (SLATE LEVEL): DATA-DRIVEN BOARD TYPES THAT RECUR ACROSS DAYS, AND WHAT EVERY STRUCTURE DOES ON THEM
(2026-10-23; owner 10:30 PT: "the profiles need to be identified and correlate in different days, or they are not really useful ...
multiple profiles tested to see what really turns out into something"). READ-ONLY.

A BOARD TYPE here is not a hand-cut rule: every slate becomes a vector of ~30 pre-pick features (match day + the app board itself),
each as its PERCENTILE WITHIN ITS SEASON (the 2024-25 capture and the 2025-26 live board differ in scale - ledger DAY THREE 24, E-6),
and slates are grouped by k-means. Types are FITTED ON ONE SEASON and the other season's days are ASSIGNED to the nearest centre (and
the reverse). A type is real only if it RECURS: >= 15 days in each season. For each recurring type, every unit's k = 1 slip (every
structure 2-6 x Flex / Power on the calibrated pool, the goblin+standard EV family, the production units and the live pair) is scored
per season: ROI, days, share of days in profit, and the unit's EXCESS over its own season average. CONSISTENT = the excess has the same
sign in both seasons, in both fitting directions, with |excess| >= 15 ROI points.
Also two-factor profiles (quadrants of the factors pre-registered below: high / low halves within the season), same scoring.
Slate features: games, mean total, blowout share, back-to-back share, key injuries / game, questionables / game, strong-v-weak share,
strong-v-strong share, weekend, season phase, legs / game, standard / goblin / demon / low-volume share, standard legs >= 0.60 / 0.65 /
0.70, final_hp dispersion, per-prop legs / game for the 12 calibrated props, usual hitters on the board (players whose shrunk past
residual >= 0.03 over >= 15 earlier slates), mean final_hp of the top 20 standard legs.
Env: DATABASE_URL, BS_K (types, default 5), BS_BOOT (500).
"""
import datetime as dt
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import calib_slips as CS                             # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
import research_pp_flex234 as F                      # noqa: E402
import research_pp_board_profiles_v3 as V3           # noqa: E402

K = int(os.environ.get("BS_K") or 5)
SEASONS = V3.SEASONS
PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast", "reb_ast")
T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def pct_rank(vals):
    a = np.asarray(vals, float)
    out = np.full(len(a), np.nan)
    ok = ~np.isnan(a)
    if ok.sum():
        r = a[ok].argsort().argsort()
        out[ok] = (r + 0.5) / ok.sum()
    return out


def kmeans(X, k, seed=7, iters=100):
    rng = np.random.default_rng(seed)
    best = None
    for rep in range(10):
        C = X[rng.choice(len(X), k, replace=False)]
        for _ in range(iters):
            lab = ((X[:, None, :] - C[None]) ** 2).sum(2).argmin(1)
            C2 = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
            if np.allclose(C2, C):
                break
            C = C2
        inert = ((X - C[lab]) ** 2).sum()
        if best is None or inert < best[0]:
            best = (inert, C, lab)
    return best[1], best[2]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = RC.load(conn)
    by_season = {s: sorted(d for (ss, d) in days if ss == s) for s in SEASONS}
    feat = V3.features(conn, days)
    log(f"slates {', '.join(f'{s} {len(v)}' for s, v in by_season.items())}")

    # extra slate features: strength mix, weekend, phase, per-prop depth, usual hitters, top-20 mean
    tg = defaultdict(list)
    for gid, tid, d, pts in conn.execute("""SELECT game_id, team_id, game_date, sum(pts) FROM nba_stats.player_game_log
                                            WHERE season IN ('2023-24', '2024-25', '2025-26') GROUP BY 1, 2, 3"""):
        tg[gid].append((tid, d, float(pts)))
    margin = defaultdict(list)    # team -> [(date, margin)]
    for gid, rr in tg.items():
        if len(rr) == 2:
            (a, d, pa), (b, _, pb) = rr
            margin[a].append((d, pa - pb)); margin[b].append((d, pb - pa))
    for t in margin:
        margin[t].sort()

    def cls(t, d):
        h = [m for (x, m) in margin.get(t, []) if x < d][-25:]
        if len(h) < 5:
            return None
        m = np.mean(h)
        return "S" if m >= 4 else ("W" if m <= -4 else "M")
    resid_hist = defaultdict(list)   # player -> [(date, slate mean residual)]
    for (s, d), legs in sorted(days.items(), key=lambda x: x[0][1]):
        per = defaultdict(list)
        for l in legs:
            if l["hit"] is not None and l["p"] is not None and l["prop"] in PROPS:
                per[F.norm(l["player"])].append(l["hit"] - l["p"])
        for n, v in per.items():
            resid_hist[n].append((d, float(np.mean(v))))
    for (s, d), legs in days.items():
        x = feat[(s, d)]
        ev = defaultdict(set)
        for l in legs:
            if l["event_id"] is not None and l["team_id"] is not None:
                ev[l["event_id"]].add(l["team_id"])
        pairs = [tuple(sorted(filter(None, (cls(t, d) for t in ts)))) for ts in ev.values() if len(ts) == 2]
        pairs = [p for p in pairs if len(p) == 2]
        x["sw_share"] = np.mean([p == ("S", "W") for p in pairs]) if pairs else np.nan
        x["ss_share"] = np.mean([p == ("S", "S") for p in pairs]) if pairs else np.nan
        x["ww_share"] = np.mean([p == ("W", "W") for p in pairs]) if pairs else np.nan
        x["weekend"] = 1.0 if d.weekday() >= 5 else 0.0
        x["key_inj_pg"] = x["key_injuries"] / max(x["games"], 1)
        x["q_pg"] = x["questionable"] / max(x["games"], 1)
        g = max(x["games"], 1)
        for p in PROPS:
            x[f"depth_{p}"] = sum(1 for l in legs if l["prop"] == p) / g
        players = {F.norm(l["player"]) for l in legs}
        uh = 0
        for n in players:
            h = [r for (dd, r) in resid_hist.get(n, []) if dd < d]
            if len(h) >= 15 and sum(h) / (len(h) + 10) >= 0.03:
                uh += 1
        x["usual_hitters"] = uh
        R = sorted([l["p"] for l in legs if l["tier"] == "R" and l["p"] is not None and l["prop"] in PROPS], reverse=True)[:20]
        x["top20_hp"] = float(np.mean(R)) if R else np.nan
    fnames = [f for f in next(iter(feat.values())).keys() if f not in ("month", "key_injuries", "questionable", "legs")]
    log(f"slate features: {len(fnames)}")

    # unit outcomes (k = 1 slip of every unit; the live pair) - as research_pp_board_profiles_v3
    UNITS = V3.UNITS
    cand = defaultdict(list)
    for (s, d), legs in days.items():
        for u in UNITS:
            if u[0] == "calib":
                for slip in CS.unit_slips(legs, u[1], u[2], V3.KMAX):
                    cand[(u, s, d)].append((slip, None))
    for pool in ("_wo", "_wo_nosteals"):
        for u in [u for u in UNITS if u[0] == pool]:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'
                        ORDER BY game_date, k""", (u[1], u[2], u[3], V3.KMAX)):
                if season in SEASONS and (season, d) in days:
                    cand[(u, season, d)].append((legs, bool(sg and sg > 0)))

    def pay(u, s, d, i):
        legs, sg = cand[(u, s, d)][i]
        sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in legs]
        return SE.grade(sl, u[3], same_game=sg)[1]
    out = {}
    for s in SEASONS:
        for d in by_season[s]:
            for u in UNITS:
                if cand.get((u, s, d)):
                    out[(u, s, d)] = pay(u, s, d, 0) - 1.0
    log("unit outcomes built")
    avg = {(u, s): np.mean([out[(u, s, d)] for d in by_season[s] if (u, s, d) in out]) for u in UNITS for s in SEASONS}

    def score(u, s, dset):
        v = [out[(u, s, d)] for d in dset if (u, s, d) in out]
        return (np.mean(v) if v else np.nan, len(v), np.mean([x > 0 for x in v]) if v else np.nan)

    # percentile vectors within season
    X = {}
    for s in SEASONS:
        M = np.array([[feat[(s, d)][f] for f in fnames] for d in by_season[s]], float)
        P = np.column_stack([pct_rank(M[:, j]) for j in range(M.shape[1])])
        P = np.where(np.isnan(P), 0.5, P)
        X[s] = P

    print("\n" + "=" * 200 + f"\n1. DATA-DRIVEN BOARD TYPES (k-means k={K} on within-season percentiles; fitted on one season, the other assigned)")
    allres = []
    for fit, app in (SEASONS, SEASONS[::-1]):
        C, lab_fit = kmeans(X[fit], K)
        lab_app = ((X[app][:, None, :] - C[None]) ** 2).sum(2).argmin(1)
        print(f"\n  fitted on {fit}; {app} assigned")
        for j in range(K):
            dfit = [d for d, l in zip(by_season[fit], lab_fit) if l == j]
            dapp = [d for d, l in zip(by_season[app], lab_app) if l == j]
            top = np.argsort(-np.abs(C[j] - 0.5))[:6]
            desc = ", ".join(f"{fnames[t]} {'HIGH' if C[j][t] > 0.5 else 'low'} ({C[j][t]:.2f})" for t in top)
            rec = len(dfit) >= 15 and len(dapp) >= 15
            print(f"   TYPE {j}: {fit} {len(dfit)} days, {app} {len(dapp)} days {'RECURS' if rec else '(does not recur)'}\n     defined by: {desc}")
            if not rec:
                continue
            for u in ["PAIR"] + UNITS:
                if u == "PAIR":
                    continue
                a = score(u, fit, dfit)
                b = score(u, app, dapp)
                ea = a[0] - avg[(u, fit)]
                eb = b[0] - avg[(u, app)]
                cons = (np.sign(ea) == np.sign(eb)) and min(abs(ea), abs(eb)) >= 0.15 and a[1] >= 10 and b[1] >= 10
                allres.append((fit, j, V3.tag(u), ea, eb, cons, a, b))
                print(f"     {V3.tag(u):<40} {fit[2:]} ROI {100 * a[0]:+6.0f}% ({a[1]:>3} d, {100 * a[2]:3.0f}% days +) excess {100 * ea:+5.0f} | "
                      f"{app[2:]} ROI {100 * b[0]:+6.0f}% ({b[1]:>3} d, {100 * b[2]:3.0f}% days +) excess {100 * eb:+5.0f}"
                      + ("  CONSISTENT" if cons else ""))

    print("\n" + "=" * 200 + "\n2. TWO-FACTOR PROFILES (pre-registered pairs; each factor split at its within-season median; quadrant = "
          "low/high x low/high)")
    PAIRS = [("games", "b2b_share"), ("games", "key_inj_pg"), ("games", "std_ge60"), ("games", "sw_share"), ("b2b_share", "q_pg"),
             ("key_inj_pg", "q_pg"), ("mean_total", "blowout_share"), ("sw_share", "ss_share"), ("depth_steals", "depth_blocks"),
             ("depth_rebounds", "depth_assists"), ("usual_hitters", "std_ge60"), ("top20_hp", "std_disp"), ("lowvol_share", "std_ge65"),
             ("demon_share", "goblin_share"), ("weekend", "games"), ("usual_hitters", "key_inj_pg"), ("depth_points", "depth_threes_made"),
             ("mean_rest", "b2b_share"), ("blowout_share", "sw_share"), ("top20_hp", "games")]
    fi = {f: i for i, f in enumerate(fnames)}
    nq = 0
    hits = 0
    rng = np.random.default_rng(11)
    null_hits = np.zeros(20)

    def is_hit(u, da, db):
        a = score(u, SEASONS[0], da)
        b = score(u, SEASONS[1], db)
        ea = a[0] - avg[(u, SEASONS[0])]
        eb = b[0] - avg[(u, SEASONS[1])]
        return (np.sign(ea) == np.sign(eb) and min(abs(ea), abs(eb)) >= 0.15 and a[1] >= 10 and b[1] >= 10), a, b, ea, eb
    for f1, f2 in PAIRS:
        if f1 not in fi or f2 not in fi:
            continue
        for q1 in (0, 1):
            for q2 in (0, 1):
                ds = {s: [d for d, row in zip(by_season[s], X[s]) if (row[fi[f1]] > 0.5) == q1 and (row[fi[f2]] > 0.5) == q2]
                      for s in SEASONS}
                if min(len(v) for v in ds.values()) < 15:
                    continue
                nq += 1
                for u in UNITS:
                    ok, a, b, ea, eb = is_hit(u, ds[SEASONS[0]], ds[SEASONS[1]])
                    if ok:
                        hits += 1
                        print(f"  {f1}={'high' if q1 else 'low'} x {f2}={'high' if q2 else 'low'}  {V3.tag(u):<40} "
                              f"24-25 ROI {100 * a[0]:+5.0f}% ({a[1]} d, {100 * a[2]:.0f}% +) excess {100 * ea:+4.0f} | "
                              f"25-26 ROI {100 * b[0]:+5.0f}% ({b[1]} d, {100 * b[2]:.0f}% +) excess {100 * eb:+4.0f}")
                    # NULL: random day sets of the same sizes (20 draws) - how many 'hits' chance alone makes
                    for r in range(20):
                        ra = list(rng.choice(by_season[SEASONS[0]], len(ds[SEASONS[0]]), replace=False))
                        rb = list(rng.choice(by_season[SEASONS[1]], len(ds[SEASONS[1]]), replace=False))
                        null_hits[r] += is_hit(u, ra, rb)[0]
    print(f"  quadrants scored: {nq} x {len(UNITS)} units; profile hits {hits}; RANDOM-DAY NULL hits per draw: mean "
          f"{null_hits.mean():.1f}, p95 {np.percentile(null_hits, 95):.0f} (a profile family is real only if its hits clearly exceed the null)")

    print("\n" + "=" * 200 + "\n3. CONSISTENT TYPE x UNIT (section 1, both fitting directions)")
    seen = defaultdict(list)
    for fit, j, u, ea, eb, cons, a, b in allres:
        if cons:
            seen[u].append((fit, j, ea, eb))
    for u, v in seen.items():
        print(f"  {u:<40} " + " | ".join(f"types fitted on {f}: type {j} excess {100 * ea:+.0f} / {100 * eb:+.0f}" for f, j, ea, eb in v))
    log("done")


if __name__ == "__main__":
    main()
