#!/usr/bin/env python3
"""
EXHAUSTIVE PRIZEPICKS COMPOSITION SEARCH (2026-10-20, owner: "make multiple, very high count of each of the possible variations
on which goblin tier, demon tier, prop lines variation, over, under ... combine them ... exhaustive learning"). READ-ONLY.

What it measures, fully OUT OF SAMPLE in both directions (train 2024-25 -> test 2025-26, and train 2025-26 -> test 2024-25):
  1. CELL VALUE on the train season: cell = (prop, tier, side, rank key, top-n), value e = mean(hit x price factor) - the
     per-leg efficiency that sets slip EV (all-standard 5-Power breaks even at e = 0.549, 3-Power 0.550, 2-Power 0.577).
     Each test-season leg is scored by the best train-season e among the cells it belongs to (>= 100 train legs).
  2. BUCKETS: every test leg falls in one bucket - tier group x prop family x side:
       R_DEF_O / R_DEF_U  steals, blocks, stocks, turnovers        R_PTS_O / R_PTS_U  points, pts_ast, pts_reb, pra
       R_REB_O / R_REB_U  rebounds, reb_ast                        R_OTH_O / R_OTH_U  assists, threes_made, everything else
       G1, G2, G3 goblins (More only)                              D1, D2, D3 demons (More only)
  3. PATTERNS: every multiset of buckets of size 2..6 (14 buckets -> 38,745 patterns), Power and Flex. Each day, each pattern
     builds its best slip: per slot the next-best unused leg of that bucket by train e (one leg per player, >= 2 teams, at most
     SE_MAX_SAME_GAME legs from one game). Graded with the CERTIFIED grader (build_slip_engine.grade: grader v3, voids, Flex
     alternates from PrizePicks' quote tiers, same-game Flex). Stake 1 per slip, one slip per pattern per day.
  4. REPORT: per pattern x structure: days played, hits, ROI both directions, day-block bootstrap 5th percentile (EX_BOOT
     resamples) per direction; the leaderboard ranks by the WEAKER direction (min OOS ROI) among patterns with >= MIN_DAYS days in both.
     Plus aggregates by tier mix (number of goblins / demons / standards, More vs Less) so the structural question - do goblins,
     demons, Unders help - is answered over all patterns, not by the luckiest one; and the marginal value of each bucket
     (patterns containing it vs not). The final 7 days of each season are left out (never staked, engine H6).
Env: DATABASE_URL, EX_SIZES (2,3,4,5,6), EX_MIN_DAYS (60), EX_TOP (40), EX_BOOT (2000), SE_MAX_SAME_GAME (2), EX_MIN_TRAIN_LEGS (100).
"""
import itertools
import os
import sys
import time
from array import array
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE   # noqa: E402  the certified grader (grade / pp_payout, grader v3)

SIZES = [int(x) for x in os.environ.get("EX_SIZES", "2,3,4,5,6").split(",")]
MIN_DAYS = int(os.environ.get("EX_MIN_DAYS", "60"))
TOP = int(os.environ.get("EX_TOP", "40"))
BOOT = int(os.environ.get("EX_BOOT", "2000"))
MAX_SG = int(os.environ.get("SE_MAX_SAME_GAME", "2"))
MIN_TRAIN = int(os.environ.get("EX_MIN_TRAIN_LEGS", "100"))
NS = (1, 2, 3, 5, 10)
SEASONS = ("2024-25", "2025-26")

LEG_SQL = """
SELECT l.season, l.game_date, l.player, l.prop, l.tier, l.side, l.line::float8, max(l.factor)::float8 factor, max(l.hit::int) hit,
       max(l.score)::float8 score,
       min(l.n_rank) FILTER (WHERE l.rank_key = 'final_score') n_fs,
       min(l.n_rank) FILTER (WHERE l.rank_key = 'final_hp') n_fh,
       min(l.n_rank) FILTER (WHERE l.rank_key = 'baseline_hp') n_bh,
       max(pu.team_id) team_id, max(pu.event_id) event_id
FROM nba_score.tier_map_legs l
JOIN nba_market.prop_universe pu ON pu.game_date = l.game_date AND pu.player = l.player AND pu.prop = l.prop AND pu.side = l.side
 AND pu.line = l.line AND pu.line_source = 'real'
WHERE l.tier NOT IN ('G0', 'D0')
GROUP BY 1, 2, 3, 4, 5, 6, 7
HAVING least(min(l.n_rank) FILTER (WHERE l.rank_key = 'final_score'), min(l.n_rank) FILTER (WHERE l.rank_key = 'final_hp'),
             min(l.n_rank) FILTER (WHERE l.rank_key = 'baseline_hp')) <= 10
"""
RK = {"final_score": "n_fs", "final_hp": "n_fh", "baseline_hp": "n_bh"}

DEF = {"steals", "blocks", "stocks", "turnovers"}
PTS = {"points", "pts_ast", "pts_reb", "pra"}
REB = {"rebounds", "reb_ast"}


def bucket(l):
    t = l["tier"]
    if t != "R":
        return t                                   # G1..G3 / D1..D3 (More only)
    fam = "DEF" if l["prop"] in DEF else "PTS" if l["prop"] in PTS else "REB" if l["prop"] in REB else "OTH"
    return f"R_{fam}_{'O' if l['side'] == 'Over' else 'U'}"


BUCKETS = ["R_DEF_O", "R_DEF_U", "R_PTS_O", "R_PTS_U", "R_REB_O", "R_REB_U", "R_OTH_O", "R_OTH_U", "G1", "G2", "G3", "D1", "D2", "D3"]


def cell_values(legs):
    """train-season e per cell (prop, tier, side, rank key, n) -> mean(hit x factor), cells with >= MIN_TRAIN graded legs"""
    acc = defaultdict(lambda: [0, 0.0])
    for l in legs:
        if l["hit"] is None:
            continue
        for rk, col in RK.items():
            n_r = l[col]
            if n_r is None:
                continue
            for n in NS:
                if n_r <= n:
                    a = acc[(l["prop"], l["tier"], l["side"], rk, n)]
                    a[0] += 1
                    a[1] += l["hit"] * l["factor"]
    return {k: v[1] / v[0] for k, v in acc.items() if v[0] >= MIN_TRAIN}


def score_legs(legs, cv):
    """each leg's value = the best train e among the cells it belongs to (None if in no train cell)"""
    for l in legs:
        best = None
        for rk, col in RK.items():
            n_r = l[col]
            if n_r is None:
                continue
            for n in NS:
                if n_r <= n:
                    e = cv.get((l["prop"], l["tier"], l["side"], rk, n))
                    if e is not None and (best is None or e > best):
                        best = e
        l["ev"] = best


def all_patterns():
    for k in SIZES:
        for combo in itertools.combinations_with_replacement(range(len(BUCKETS)), k):
            yield combo


def build(pattern, day_buckets):
    """greedy best slip for one pattern on one day: slots in order of the pattern, next-best unused leg of each bucket"""
    used_p, games, slip = set(), defaultdict(int), []
    ptr = defaultdict(int)
    for b in pattern:
        lst = day_buckets.get(b)
        if not lst:
            return None
        i = ptr[b]
        while i < len(lst):
            l = lst[i]
            i += 1
            if l["player"] in used_p or games[l["event_id"]] >= MAX_SG:
                continue
            slip.append(l)
            used_p.add(l["player"])
            games[l["event_id"]] += 1
            break
        else:
            return None
        ptr[b] = i
    if len({l["team_id"] for l in slip}) < 2:
        return None
    return slip


def boot_lb(daily, stake, reps=BOOT, seed=7):
    """5th percentile of ROI under day-block resampling"""
    if len(daily) < 5:
        return None
    rng = np.random.default_rng(seed)
    prof = np.array(daily, float)
    st = np.array(stake, float)
    idx = rng.integers(0, len(prof), size=(reps, len(prof)))
    roi = prof[idx].sum(1) / st[idx].sum(1)
    return float(np.percentile(roi, 5))


def run_direction(train, test, label):
    t0 = time.time()
    cv = cell_values(train)
    score_legs(test, cv)
    days = defaultdict(lambda: defaultdict(list))
    for l in test:
        if l["ev"] is None:
            continue
        days[l["game_date"]][bucket(l)].append(l)
    for d in days.values():
        for b in d:
            d[b].sort(key=lambda r: (-r["ev"], -(r["score"] or 0), r["player"]))
    pats = list(all_patterns())
    res = {}
    for pi, pat in enumerate(pats):
        bp = tuple(BUCKETS[i] for i in pat)
        for st in ("power", "flex"):
            res[(bp, st)] = {"days": 0, "stake": 0.0, "ret": 0.0, "full": 0, "daily": array("f"), "legs": 0, "leg_hits": 0}
        for d in sorted(days):
            slip = build(bp, days[d])
            if slip is None:
                continue
            for st in ("power", "flex"):   # 2-pick Flex exists (2x / 0.5x) - graded like the rest
                hits, pay = SE.grade(slip, st)
                r = res[(bp, st)]
                r["days"] += 1
                r["stake"] += 1.0
                r["ret"] += pay
                r["full"] += int(hits == len(slip))
                r["daily"].append(pay - 1.0)
                r["legs"] += sum(1 for x in slip if x["hit"] is not None)
                r["leg_hits"] += sum(int(x["hit"]) for x in slip if x["hit"] is not None)
        if pi % 2000 == 0:
            print(f"  [{label}] {pi:,}/{len(pats):,} patterns, {time.time() - t0:.0f}s", flush=True)
    print(f"[{label}] cells with value: {len(cv):,}; test days {len(days)}; {len(pats):,} patterns x 2 structures in {time.time() - t0:.0f}s", flush=True)
    return res


def mix_key(bp):
    g = sum(1 for b in bp if b.startswith("G"))
    dm = sum(1 for b in bp if b.startswith("D"))
    u = sum(1 for b in bp if b.endswith("_U"))
    o = sum(1 for b in bp if b.endswith("_O"))
    return f"{len(bp)}p R{o}O/{u}U G{g} D{dm}"


def main():
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as conn:
        conn.execute("SET statement_timeout = 0")
        cur = conn.execute(LEG_SQL)
        cols = [c.name for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"legs loaded: {len(rows):,} (top-10 under any rank key, real PrizePicks window board, graded)", flush=True)
    # the final 7 days of each regular season are never staked (engine H6, measured -40%): left out of train and test
    last = {s: max(r["game_date"] for r in rows if r["season"] == s) for s in SEASONS}
    rows = [r for r in rows if (last[r["season"]] - r["game_date"]).days > 7]
    by = {s: [r for r in rows if r["season"] == s] for s in SEASONS}
    for s in SEASONS:
        print(f"  {s}: {len(by[s]):,} legs, {len({r['game_date'] for r in by[s]})} days", flush=True)
    # the board composition per bucket (how much there is to choose from)
    print("\nBUCKET SUPPLY (legs per day, mean hit, mean factor) per season:")
    for s in SEASONS:
        nd = len({r['game_date'] for r in by[s]})
        agg = defaultdict(lambda: [0, 0, 0.0])
        for r in by[s]:
            a = agg[bucket(r)]
            a[0] += 1
            a[1] += (r["hit"] or 0)
            a[2] += r["factor"]
        print("  " + s + ": " + " | ".join(f"{b} {agg[b][0] / nd:.1f}/d h{agg[b][1] / max(1, agg[b][0]):.3f} f{agg[b][2] / max(1, agg[b][0]):.2f}" for b in BUCKETS))

    A = run_direction(by["2024-25"], by["2025-26"], "train 24-25 -> test 25-26")
    # fresh copies so the second direction's leg values do not overwrite the first's
    rows2 = [dict(r) for r in rows]
    by2 = {s: [r for r in rows2 if r["season"] == s] for s in SEASONS}
    B = run_direction(by2["2025-26"], by2["2024-25"], "train 25-26 -> test 24-25")

    out = []
    for key in A:
        a, b = A[key], B.get(key)
        if not b or a["days"] < MIN_DAYS or b["days"] < MIN_DAYS:
            continue
        ra, rb = a["ret"] / a["stake"] - 1, b["ret"] / b["stake"] - 1
        out.append((key, a, b, ra, rb, min(ra, rb)))
    print(f"\npatterns with >= {MIN_DAYS} days in both directions: {len(out):,} of {len(A):,}", flush=True)

    pos_both = [o for o in out if o[3] > 0 and o[4] > 0]
    print(f"positive in BOTH out-of-sample directions: {len(pos_both):,} ({100 * len(pos_both) / max(1, len(out)):.1f}%)")

    for st in ("power", "flex"):
        sel = sorted([o for o in out if o[0][1] == st], key=lambda o: -o[5])
        print(f"\n=== TOP {TOP} {st.upper()} PATTERNS by the weaker out-of-sample direction ===")
        print("pattern | days A/B | full-hit A/B | leg hit A/B | ROI A (test 25-26) | ROI B (test 24-25) | LB5 A / B")
        for (bp, _), a, b, ra, rb, mn in sel[:TOP]:
            la, lb = boot_lb(a["daily"], [1] * len(a["daily"])), boot_lb(b["daily"], [1] * len(b["daily"]))
            print(f"{'+'.join(bp)} | {a['days']}/{b['days']} | {a['full'] / a['days']:.3f}/{b['full'] / b['days']:.3f} | "
                  f"{a['leg_hits'] / max(1, a['legs']):.3f}/{b['leg_hits'] / max(1, b['legs']):.3f} | {100 * ra:+.1f}% | {100 * rb:+.1f}% | "
                  f"{100 * la:+.1f}% / {100 * lb:+.1f}%", flush=True)

    # STRUCTURAL ANSWER: mean OOS ROI by tier mix (all patterns of that mix, both directions pooled by stake)
    print("\n=== OUT-OF-SAMPLE ROI BY TIER MIX (all patterns of the mix; stake-weighted; both directions) ===")
    mix = defaultdict(lambda: {"n": 0, "stake": 0.0, "ret": 0.0, "pos": 0})
    for (bp, st), a, b, ra, rb, mn in out:
        m = mix[(mix_key(bp), st)]
        m["n"] += 1
        m["stake"] += a["stake"] + b["stake"]
        m["ret"] += a["ret"] + b["ret"]
        m["pos"] += int(ra > 0 and rb > 0)
    for (mk, st), m in sorted(mix.items(), key=lambda kv: (kv[0][1], -(kv[1]["ret"] / kv[1]["stake"]))):
        print(f"{st:5s} {mk:22s} patterns {m['n']:5d}  ROI {100 * (m['ret'] / m['stake'] - 1):+6.1f}%  both-positive {m['pos']:4d}")

    # per bucket: the marginal effect of adding one leg of bucket X (mean OOS ROI of patterns containing it vs not), per size
    print("\n=== MARGINAL VALUE OF EACH BUCKET (mean OOS min-ROI of patterns containing it, per structure) ===")
    for st in ("power", "flex"):
        for b_ in BUCKETS:
            w = [o[5] for o in out if o[0][1] == st and b_ in o[0][0]]
            wo = [o[5] for o in out if o[0][1] == st and b_ not in o[0][0]]
            if w and wo:
                print(f"{st:5s} {b_:8s} with {np.mean(w) * 100:+6.1f}% (n {len(w)})  without {np.mean(wo) * 100:+6.1f}% (n {len(wo)})")


if __name__ == "__main__":
    main()
