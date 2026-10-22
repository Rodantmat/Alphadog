#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES v2: GRANULAR SLATE PROFILES x A WIDE STRATEGY LIBRARY, VALIDATED IN STAGES (2026-10-22 PT; owner 16:23 PT:
"very, very granular ... with the strategies and everything ... do samples first, see if it holds. Once the sample holds, then we
extend for a season. If it holds, then we extend for the two seasons. Also include the three boards ... we can understand the board
structure ... the strategies that we have are not gonna be enough ... different prop lines, different slip structure, 2, 3, 4, 5,
6-pick, flex, power"). PrizePicks. READ-ONLY.

THE BOARD STRUCTURE of a slate (same code for history and live; history = nba_score.tier_map_legs_sel_wo, rank key final_score, every
row of the day; games from nba_stats.player_game_log through nba_ref.player_name_map; live = live_slip_engine.BOARD_SQL via
research_pp_flex234.live_legs, games from the board's event ids):
  games, legs per game, players, tier mix (standard / goblin / demon share), Under share of standard legs, prop-family mix of the
  standard legs (DEF steals / blocks / stocks / turnovers, SCORE points / pra / pts_reb / pts_ast, BOARDS rebounds / reb_ast, AST,
  3PM), slate day of the season, and (BP2_SCOREFEAT=1) the score level of the best standard legs (live and history scores are not
  certified to share a scale - off by default; both are printed).

THE STRATEGY LIBRARY:
  LEG-BUILT (new): prop group (each of 12 props + DEF / SCORE / BOARDS / ANY) x line type (R, G1, G any, D1, D any, R+G1, R+D1, ANY)
    x side (More / Less / any) x 2-6 picks x Flex / Power; legs by final score, one leg per player, at most 2 legs per game (a repeat
    game prices the slip same-game); slip 1 and slip 2 from disjoint legs. Power slips with 2+ demon legs are NOT priced (grader v3
    overpays Power demon stacks against PrizePicks' quotes - PP_PAYOUT_FINDINGS) unless BP2_POWER_DEMON=1.
  ENGINE UNITS: every composition of the live engine's twin backtest (slip_engine_slips_wo / _wo_nosteals), 2-6 picks, Flex and Power.
  THE LIVE 2-SLIP PORTFOLIO (live_slip_engine.PORTFOLIO_UNITS, round robin, leg cap 2).
  A config = a strategy's slip 1, its slips 1 + 2, or a pair of strategies (slip 1 of each), or SKIP.
  Grader v3 (build_slip_engine.grade + 2-pick Flex alternate prices), 1 unit a slip.

SELECTION (training days only), two granular methods:
  KNN    the K most similar training slates (standardised structure features) - per config a shrunk ROI (toward its whole-training
         ROI, BP2_SHRINK slips) minus BP2_Z x its standard error minus BP2_LOSS x its share of losing days; the best wins, SKIP = 0.
  CELLS  hard profiles games (<=4 / 5-8 / 9+) x phase (first 30 slate days / rest) x Under share (tercile) x DEF share (tercile),
         backing off a dimension at a time below BP2_MIN_DAYS training days; same score.
STAGES - a stage is passed when the profile system beats the live portfolio on ROI AND its max drawdown is <= 1.5x the portfolio's
AND its longest losing run is <= the portfolio's + 2, on every test block of the stage:
  1 SAMPLE      inside each season: train on the first half of the slates, test on the second half
  2 SEASON      train on one season, test on the other (both directions)
  3 TWO SEASONS leave one month out over both seasons (train on every other day of both seasons)
Plus the STRATEGY LIBRARY by board structure (per hard profile, the strategies positive in BOTH seasons with their drought numbers),
and the LIVE BOARDS (BP2_LIVE_DAYS, default 2026-10-20,21,22): structure, the 5 most similar history slates, each method's config
trained on both seasons, the slips, and the result when graded.
Env: DATABASE_URL, BP2_K (10,20,40), BP2_SHRINK (60), BP2_Z (1.0), BP2_LOSS (0.3), BP2_MIN_DAYS (10), BP2_TOP_PAIRS (25),
BP2_SCOREFEAT, BP2_POWER_DEMON, BP2_LIVE_DAYS, BP2_STAGES (1,2,3).
"""
import heapq
import os
import sys
import time
from collections import defaultdict

os.environ.setdefault("PF_LIVE_DAYS", os.environ.get("BP2_LIVE_DAYS") or "2026-10-20,2026-10-21,2026-10-22")
os.environ.setdefault("PF_BOOT", "50")
import numpy as np   # noqa: E402
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import live_slip_engine as L            # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_flex234 as F         # noqa: E402
import research_pp_portfolio_mix as M   # noqa: E402

SEASONS = ("2024-25", "2025-26")
KS = [int(x) for x in (os.environ.get("BP2_K") or "10,20,40").split(",") if x]
SHRINK = float(os.environ.get("BP2_SHRINK") or 60)
Z = float(os.environ.get("BP2_Z") or 1.0)
LOSS = float(os.environ.get("BP2_LOSS") or 0.3)
MIN_DAYS = int(os.environ.get("BP2_MIN_DAYS") or 10)
TOP_PAIRS = int(os.environ.get("BP2_TOP_PAIRS") or 25)
SCOREFEAT = os.environ.get("BP2_SCOREFEAT") == "1"
POWER_DEMON = os.environ.get("BP2_POWER_DEMON") == "1"
STAGES = [x for x in (os.environ.get("BP2_STAGES") or "1,2,3").split(",") if x]
KMAX_P = 10
TABLES = ("_wo", "_wo_nosteals")
LIVE_PORT = [("_wo_nosteals" if fam == "C" else "_wo", comp, size, st) for comp, size, st, fam in L.PORTFOLIO_UNITS.values()]

PROPS = ["points", "rebounds", "assists", "threes_made", "steals", "blocks", "stocks", "turnovers", "pra", "pts_reb", "pts_ast", "reb_ast"]
FAMILY = {"steals": "DEF", "blocks": "DEF", "stocks": "DEF", "turnovers": "DEF", "points": "SCORE", "pra": "SCORE", "pts_reb": "SCORE",
          "pts_ast": "SCORE", "rebounds": "BOARDS", "reb_ast": "BOARDS", "assists": "AST", "threes_made": "3PM"}
PGROUPS = {p: {p} for p in PROPS}
PGROUPS.update({"DEF": {"steals", "blocks", "stocks", "turnovers"}, "SCORE": {"points", "pra", "pts_reb", "pts_ast"},
                "BOARDS": {"rebounds", "reb_ast"}, "ANY": set(PROPS)})
TGROUPS = {"R": {"R"}, "G1": {"G1"}, "G": {"G1", "G2", "G3"}, "D1": {"D1"}, "D": {"D1", "D2", "D3"}, "R+G1": {"R", "G1"},
           "R+D1": {"R", "D1"}, "ANY": {"R", "G1", "G2", "G3", "D1", "D2", "D3"}}
SIDES = {"More": {"Over"}, "Less": {"Under"}, "any": {"Over", "Under"}}
SIZES = (2, 3, 4, 5, 6)
STRUCTS = ("flex", "power")
FEATS = ["games", "legs_per_game", "players", "tier_R", "tier_G", "tier_D", "under", "DEF", "SCORE", "BOARDS", "AST", "3PM", "slate_day"]


def legkey(l):
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def grade(legs, st):
    if all(l.get("hit") is None for l in legs):
        return None
    if st == "power" and not POWER_DEMON and sum(1 for l in legs if str(l["tier"]).startswith("D")) >= 2:
        return None
    games = [l.get("game") for l in legs]
    sg = len(games) > len(set(games))
    return SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in legs], st, same_game=sg)[1] - 1.0


def structure(legs, slate_day):
    """board structure features from every leg of the slate (dicts with tier, side, prop, game, player, score)"""
    n = max(1, len(legs))
    games = len({l["game"] for l in legs if l.get("game") is not None and not str(l["game"]).startswith("p:")})
    std = [l for l in legs if l["tier"] == "R"]
    ns = max(1, len(std))
    f = {"games": games, "legs_per_game": len(legs) / max(1, games), "players": len({l["player"] for l in legs}),
         "tier_R": len(std) / n, "tier_G": sum(1 for l in legs if l["tier"].startswith("G")) / n,
         "tier_D": sum(1 for l in legs if l["tier"].startswith("D")) / n,
         "under": sum(1 for l in std if l["side"] == "Under") / ns, "slate_day": slate_day}
    for fam in ("DEF", "SCORE", "BOARDS", "AST", "3PM"):
        f[fam] = sum(1 for l in std if FAMILY.get(l["prop"]) == fam) / ns
    top = sorted((float(l["score"]) for l in std if l.get("score") is not None), reverse=True)[:20]
    f["score_top20"] = float(np.mean(top)) if top else 0.0
    return f


def build_leg_strategies(legs):
    """every leg-built strategy's slip 1 and slip 2 for one slate: {(pg, tg, side, size): [slip1, slip2]}"""
    buckets = defaultdict(list)
    for l in legs:
        if l["prop"] in FAMILY and l["tier"] in TGROUPS["ANY"]:
            buckets[(l["prop"], l["tier"], l["side"])].append(l)
    for v in buckets.values():
        v.sort(key=lambda l: -float(l["score"] or 0))
    out = {}
    for pg, props in PGROUPS.items():
        for tg, tiers in TGROUPS.items():
            for sd, sides in SIDES.items():
                srcs = [buckets[(p, t, s)] for p in props for t in tiers for s in sides if buckets.get((p, t, s))]
                if not srcs:
                    continue
                merged = heapq.merge(*srcs, key=lambda l: -float(l["score"] or 0))
                pool = []
                for l in merged:
                    pool.append(l)
                    if len(pool) >= 80:
                        break
                for size in SIZES:
                    slips, used = [], set()
                    for _ in range(2):
                        slip, players, per_game = [], set(), defaultdict(int)
                        for l in pool:
                            key = id(l)
                            if key in used or l["player"] in players or per_game[l.get("game")] >= 2:
                                continue
                            slip.append(l)
                            players.add(l["player"])
                            per_game[l.get("game")] += 1
                            if len(slip) == size:
                                break
                        if len(slip) < size:
                            break
                        used.update(id(l) for l in slip)
                        slips.append(slip)
                    if slips:
                        out[(pg, tg, sd, size)] = slips
    return out


def stats(daily):
    played = [(d, s, p) for d, s, p in daily if s > 0]
    slips = sum(s for _, s, _ in played)
    prof = sum(p for _, _, p in played)
    eq = peak = dd = 0.0
    run = best = 0
    for _, s, p in daily:
        eq += p
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
        if s > 0:
            run = run + 1 if p < -1e-9 else 0
            best = max(best, run)
    seq = [p for _, _, p in daily]
    w7 = min((sum(seq[i:i + 7]) for i in range(max(1, len(seq) - 6))), default=0.0)
    lose = sum(1 for _, s, p in played if p < -1e-9) / len(played) if played else 0.0
    return {"days": len(played), "slips": slips, "roi": prof / slips if slips else 0.0, "units": prof, "dd": dd, "run": best, "w7": w7,
            "lose": lose}


def fmt(s):
    return (f"days {s['days']:>3} slips {s['slips']:>4} ROI {100 * s['roi']:+7.1f}% units {s['units']:+7.1f} maxDD {s['dd']:5.1f} "
            f"losing run {s['run']:>2} worst7 {s['w7']:+6.1f} losing days {100 * s['lose']:4.1f}%")


def main():
    t0 = time.time()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    EX.install_flex2_alt(conn)

    # ------------------------------------------------------------------ history days (final 7 out) and engine units
    units, cand, days = [], defaultdict(list), {s: set() for s in SEASONS}
    for tab in TABLES:
        for comp, size, st in conn.execute(f"SELECT DISTINCT composition, size, structure FROM nba_score.slip_engine_slips{tab}").fetchall():
            units.append((tab, comp, size, st))
        for season, d, comp, size, st, k, legs, sg in conn.execute(
                f"""SELECT season, game_date, composition, size, structure, k, legs_json, same_game FROM nba_score.slip_engine_slips{tab}
                    WHERE phase <> 'final7' AND (k <= 2 OR (k <= {KMAX_P} AND composition = ANY(%s)))""", (sorted({u[1] for u in LIVE_PORT}),)):
            if season not in SEASONS:
                continue
            u = (tab, comp, size, st)
            if k > 2 and u not in LIVE_PORT:
                continue
            if all(l.get("hit") is None for l in legs):
                continue
            if st == "power" and not POWER_DEMON and sum(1 for l in legs if str(l.get("tier", "R")).startswith("D")) >= 2:
                continue
            pr = SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in legs], st, same_game=bool(sg and sg > 0))[1] - 1.0
            keys = list(dict.fromkeys(legkey(l) for l in legs))
            cand[(u, season, d)].append((k, pr, (size, st, tuple(sorted(map(str, keys)))), keys))
            days[season].add(d)
        print(f"engine units {tab}: {len(cand):,} unit-days | {time.time() - t0:.0f}s", flush=True)
    for v in cand.values():
        v.sort(key=lambda x: x[0])
    units.sort()
    order = {s: sorted(days[s]) for s in SEASONS}

    # ------------------------------------------------------------------ history legs with their game
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    game_of = {(str(p), d): g for p, d, g in conn.execute(
        "SELECT nba_player_id::text, game_date, game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'").fetchall()}
    day_legs = defaultdict(dict)
    nogame = 0
    for season, d, player, nn, prop, side, line, tier, factor, score, hit in conn.execute(
            """SELECT season, game_date, player, nba_ref.norm_name(player), prop, side, line::float8, tier, factor, score, hit
               FROM nba_score.tier_map_legs_sel_wo WHERE rank_key = 'final_score' AND season = ANY(%s)""", (list(SEASONS),)):
        if d not in days.get(season, ()):
            continue
        g = game_of.get((name_pid.get(nn), d))
        if g is None:
            nogame += 1
        key = (player, prop, side, round(line, 1), tier)
        if key not in day_legs[(season, d)]:
            day_legs[(season, d)][key] = {"player": player, "prop": prop, "side": side, "line": line, "tier": tier,
                                          "factor": float(factor or 1.0), "score": score, "hit": hit, "game": g or ("p:" + player)}
    print(f"history legs: {sum(len(v) for v in day_legs.values()):,} on {len(day_legs)} slates; no game found {nogame:,} rows "
          f"(kept, own game) | {time.time() - t0:.0f}s", flush=True)

    # ------------------------------------------------------------------ strategy matrix
    sid, names = {}, []

    def strat_id(name):
        if name not in sid:
            sid[name] = len(names)
            names.append(name)
        return sid[name]
    pay1, pay2 = defaultdict(dict), defaultdict(dict)     # strategy -> {(season, d): profit of slip 1 / slips 1+2}
    n2 = defaultdict(dict)
    feat, sigs = {}, defaultdict(dict)
    for s in SEASONS:
        for i, d in enumerate(order[s]):
            legs = list(day_legs[(s, d)].values())
            feat[(s, d)] = structure(legs, i + 1)
            for (pg, tg, sd, size), slips in build_leg_strategies(legs).items():
                for st in STRUCTS:
                    prs = [grade(sl, st) for sl in slips]
                    if prs[0] is None:
                        continue
                    j = strat_id(("LB", pg, tg, sd, size, st))
                    pay1[j][(s, d)] = prs[0]
                    sigs[j][(s, d)] = frozenset(legkey(l) for l in slips[0])
                    if len(prs) > 1 and prs[1] is not None:
                        pay2[j][(s, d)] = prs[0] + prs[1]
                        n2[j][(s, d)] = 2
            for u in units:
                lst = cand.get((u, s, d))
                if not lst:
                    continue
                j = strat_id(("EU",) + u)
                pay1[j][(s, d)] = lst[0][1]
                sigs[j][(s, d)] = frozenset(lst[0][3])
                if len(lst) > 1:
                    pay2[j][(s, d)] = lst[0][1] + lst[1][1]
                    n2[j][(s, d)] = 2
        print(f"strategies built for {s} | {len(names):,} strategies so far | {time.time() - t0:.0f}s", flush=True)

    def port_day(lists):
        taken, use, seen = [], defaultdict(int), set()
        for k in range(KMAX_P):
            for u in LIVE_PORT:
                lst = lists(u)
                if len(taken) >= 2 or k >= len(lst):
                    continue
                _, pr, sig, keys = lst[k][:4]
                if sig in seen or any(use[x] >= 2 for x in keys):
                    continue
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append((u, pr, lst[k]))
            if len(taken) >= 2:
                break
        return taken
    PORT = strat_id(("PORT",))
    for s in SEASONS:
        for d in order[s]:
            tk = port_day(lambda u: cand.get((u, s, d), []))
            if tk:
                pay2[PORT][(s, d)] = sum(t[1] for t in tk)
                n2[PORT][(s, d)] = len(tk)

    alldays = [(s, d) for s in SEASONS for d in order[s]]
    DI = {k: i for i, k in enumerate(alldays)}
    S = len(names)
    P1 = np.zeros((S, len(alldays))); N1 = np.zeros((S, len(alldays)))
    P2 = np.zeros((S, len(alldays))); N2 = np.zeros((S, len(alldays)))
    for j in range(S):
        for k, v in pay1[j].items():
            P1[j, DI[k]] = v; N1[j, DI[k]] = 1
        for k, v in pay2[j].items():
            P2[j, DI[k]] = v; N2[j, DI[k]] = n2[j][k]
    print(f"matrix: {S:,} strategies x {len(alldays)} slates | {time.time() - t0:.0f}s", flush=True)

    def label(name):
        if name[0] == "PORT":
            return "LIVE 2-slip portfolio"
        if name[0] == "LB":
            _, pg, tg, sd, size, st = name
            return f"{pg} {tg} {sd} {size}{'F' if st == 'flex' else 'P'}"
        _, tab, comp, size, st = name
        return f"engine {comp} {size}{'F' if st == 'flex' else 'P'}{'' if tab == '_wo' else ' nosteals'}"

    def cfg_label(c):
        if c[0] == "skip":
            return "SKIP"
        if c[0] == "pair":
            return "pair " + label(names[c[1]]) + " + " + label(names[c[2]])
        return ("1x " if c[0] == "one" else "2x ") + label(names[c[1]])

    def cfg_pay(c, k):
        """slips, profit of config c on slate index k (a pair whose slip 1s are the same slip plays it once)"""
        if c[0] == "skip":
            return 0, 0.0
        if c[0] == "one":
            return int(N1[c[1], k]), float(P1[c[1], k])
        if c[0] == "two":
            return int(N2[c[1], k]), float(P2[c[1], k])
        a, b = c[1], c[2]
        if N1[a, k] and N1[b, k] and sigs[a].get(alldays[k]) == sigs[b].get(alldays[k]):
            return 1, float(P1[a, k])
        return int(N1[a, k] + N1[b, k]), float(P1[a, k] + P1[b, k])

    # ------------------------------------------------------------------ selection
    FE = FEATS + (["score_top20"] if SCOREFEAT else [])

    def fvec(f, mu, sd):
        return np.array([(f[x] - mu[x]) / sd[x] for x in FE])

    def choose(train_idx, weights_idx):
        """the best config on the slates weights_idx (subset of train_idx); shrunk toward the whole training ROI"""
        tr = np.array(train_idx); w = np.array(weights_idx)
        g1 = P1[:, tr].sum(1) / np.maximum(1, N1[:, tr].sum(1))
        g2 = P2[:, tr].sum(1) / np.maximum(1, N2[:, tr].sum(1))
        best = (0.0, ("skip",))
        sc_one = None
        for mode, P, N, g in (("one", P1, N1, g1), ("two", P2, N2, g2)):
            p, n = P[:, w], N[:, w]
            sp, sn = p.sum(1), n.sum(1)
            shr = (sp + SHRINK * g) / (sn + SHRINK)
            played = n > 0
            nd = played.sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                r = np.where(played, p / np.maximum(n, 1), np.nan)
                se = np.nanstd(r, 1) / np.sqrt(np.maximum(nd, 1))
            se = np.nan_to_num(se, nan=9.9)
            lose = ((p < -1e-9) & played).sum(1) / np.maximum(nd, 1)
            score = shr - Z * se - LOSS * lose
            score[nd < max(3, len(w) // 3)] = -9.9
            if mode == "one":
                sc_one = score
            b = int(np.argmax(score))
            if score[b] > best[0]:
                best = (float(score[b]), (mode, b))
        # pairs among the best single slips
        top = [int(x) for x in np.argsort(-sc_one)[:TOP_PAIRS] if sc_one[x] > -9]
        for a in range(len(top)):
            for b in range(a + 1, len(top)):
                i, j = top[a], top[b]
                pp = P1[i, w] + P1[j, w]; nn = N1[i, w] + N1[j, w]
                played = nn > 0
                nd = played.sum()
                if nd < max(3, len(w) // 3):
                    continue
                g = (P1[i, tr].sum() + P1[j, tr].sum()) / max(1, N1[i, tr].sum() + N1[j, tr].sum())
                shr = (pp.sum() + SHRINK * g) / (nn.sum() + SHRINK)
                r = pp[played] / nn[played]
                se = float(np.std(r) / np.sqrt(max(1, nd)))
                lose = float(((pp < -1e-9) & played).sum() / max(1, nd))
                sc = shr - Z * se - LOSS * lose
                if sc > best[0]:
                    best = (float(sc), ("pair", i, j))
        return best[1]

    def run_stage(train_idx, test_idx, tag):
        """every system on the test slates; returns {system: daily list}"""
        tr_feats = [feat[alldays[k]] for k in train_idx]
        mu = {x: float(np.mean([f[x] for f in tr_feats])) for x in FE}
        sd = {x: max(1e-6, float(np.std([f[x] for f in tr_feats]))) for x in FE}
        X = np.array([fvec(f, mu, sd) for f in tr_feats])
        static = choose(train_idx, train_idx)
        cuts = {x: tuple(np.quantile([f[x] for f in tr_feats], [1 / 3, 2 / 3])) for x in ("under", "DEF")}

        def cell(f):
            g = "g<=4" if f["games"] <= 4 else ("g5-8" if f["games"] <= 8 else "g9+")
            ph = "first30" if f["slate_day"] <= 30 else "rest"
            un = "U-lo" if f["under"] <= cuts["under"][0] else ("U-mid" if f["under"] <= cuts["under"][1] else "U-hi")
            df = "DEF-lo" if f["DEF"] <= cuts["DEF"][0] else ("DEF-mid" if f["DEF"] <= cuts["DEF"][1] else "DEF-hi")
            full = (g, ph, un, df)
            return [full[:i] for i in range(4, -1, -1)]
        cells = defaultdict(list)
        for k in train_idx:
            for c in cell(feat[alldays[k]]):
                cells[c].append(k)
        cell_cfg = {}
        out = {"LIVE 2-slip portfolio": [], "STATIC " + cfg_label(static)[:70]: []}
        for K in KS:
            out[f"KNN K{K}"] = []
        out["CELLS"] = []
        picks = defaultdict(lambda: defaultdict(int))
        for k in test_idx:
            dkey = alldays[k]
            f = feat[dkey]
            out["LIVE 2-slip portfolio"].append((dkey[1], int(N2[PORT, k]), float(P2[PORT, k])))
            n, p = cfg_pay(static, k)
            out["STATIC " + cfg_label(static)[:70]].append((dkey[1], n, p))
            dist = np.sqrt(((X - fvec(f, mu, sd)) ** 2).sum(1))
            ordr = np.argsort(dist)
            for K in KS:
                c = choose(train_idx, [train_idx[i] for i in ordr[:K]])
                n, p = cfg_pay(c, k)
                out[f"KNN K{K}"].append((dkey[1], n, p))
                picks[f"KNN K{K}"][cfg_label(c)] += 1
            for cl in cell(f):
                if len(cells.get(cl, [])) >= MIN_DAYS or cl == ():
                    if cl not in cell_cfg:
                        cell_cfg[cl] = choose(train_idx, cells[cl])
                    c = cell_cfg[cl]
                    break
            n, p = cfg_pay(c, k)
            out["CELLS"].append((dkey[1], n, p))
            picks["CELLS"][cfg_label(c)] += 1
        print(f"\n  {tag}: train {len(train_idx)} slates, test {len(test_idx)}")
        res = {}
        for name, daily in out.items():
            st_ = stats(daily)
            res[name] = st_
            print(f"    {name[:44]:<44} {fmt(st_)}")
        for m, cnt in picks.items():
            print(f"    {m} configs used: " + "; ".join(f"{v}x {k}" for k, v in sorted(cnt.items(), key=lambda kv: -kv[1])[:8]))
        return res

    def gate(res_list, label_):
        print(f"  GATE {label_}:")
        verdict = {}
        for sysname in [n for n in res_list[0][1] if n.startswith(("KNN", "CELLS"))]:
            ok = True
            for tag, res in res_list:
                p, s = res["LIVE 2-slip portfolio"], res[sysname]
                good = s["roi"] > p["roi"] and s["dd"] <= 1.5 * max(p["dd"], 1.0) and s["run"] <= p["run"] + 2
                ok &= good
            verdict[sysname] = ok
            print(f"    {sysname:<12} {'PASS' if ok else 'FAIL'}")
        return verdict

    idx = {s: [DI[(s, d)] for d in order[s]] for s in SEASONS}
    print("\n" + "=" * 170 + f"\nSTAGED VALIDATION (shrink {SHRINK:g} slips, z {Z:g}, loss weight {LOSS:g}, K {KS}, cells min {MIN_DAYS} days, "
          f"pairs among the best {TOP_PAIRS}; features {FE})")
    if "1" in STAGES:
        print("\nSTAGE 1 - SAMPLE: inside each season, first half of the slates -> second half")
        rl = []
        for s in SEASONS:
            h = len(idx[s]) // 2
            rl.append((s, run_stage(idx[s][:h], idx[s][h:], f"{s} first half -> second half")))
        gate(rl, "stage 1")
    if "2" in STAGES:
        print("\nSTAGE 2 - SEASON: one season -> the other")
        rl = [("24->25", run_stage(idx["2024-25"], idx["2025-26"], "train 2024-25 -> test 2025-26")),
              ("25->24", run_stage(idx["2025-26"], idx["2024-25"], "train 2025-26 -> test 2024-25"))]
        gate(rl, "stage 2")
    if "3" in STAGES:
        print("\nSTAGE 3 - TWO SEASONS: leave one month out (train on every other slate of both seasons)")
        months = sorted({(alldays[k][1].year, alldays[k][1].month) for k in range(len(alldays))})
        agg = defaultdict(list)
        for ym in months:
            te = [k for k in range(len(alldays)) if (alldays[k][1].year, alldays[k][1].month) == ym]
            tr = [k for k in range(len(alldays)) if k not in set(te)]
            if len(te) < 5:
                continue
            res = run_stage(tr, te, f"month {ym[0]}-{ym[1]:02d}")
            agg["_months"].append((ym, res))
        print("\n  STAGE 3 months - each system's ROI per month (portfolio first):")
        systems = [n for n in agg["_months"][0][1] if not n.startswith("STATIC")]
        for ym, res in agg["_months"]:
            print(f"    {ym[0]}-{ym[1]:02d}: " + " | ".join(f"{n[:12]} {100 * res[n]['roi']:+6.1f}% ({res[n]['units']:+5.1f}u)" for n in systems))
        for n in systems:
            tot_u = sum(res[n]["units"] for _, res in agg["_months"])
            tot_s = sum(res[n]["slips"] for _, res in agg["_months"])
            wins = sum(1 for _, res in agg["_months"] if res[n]["units"] > res["LIVE 2-slip portfolio"]["units"])
            print(f"    {n:<24} total {tot_u:+7.1f}u on {tot_s} slips ROI {100 * tot_u / max(1, tot_s):+6.1f}% | months beating the portfolio "
                  f"{wins}/{len(agg['_months'])}")

    # ------------------------------------------------------------------ the strategy library by board structure
    print("\n" + "=" * 170 + "\nSTRATEGY LIBRARY BY BOARD STRUCTURE - per hard profile (games x phase), the slip-1 strategies positive in BOTH seasons "
          "(>= 8 slates each), ranked by the worse season's ROI; plus their longest losing run")
    allf = [feat[k] for k in alldays]

    def prof(f):
        return ("g<=4" if f["games"] <= 4 else ("g5-8" if f["games"] <= 8 else "g9+"), "first30" if f["slate_day"] <= 30 else "rest")
    groups = defaultdict(lambda: {s: [] for s in SEASONS})
    for k, (s, d) in enumerate(alldays):
        groups[prof(feat[(s, d)])][s].append(k)
    for g in sorted(groups):
        ks = groups[g]
        rows = []
        for j in range(S):
            per = []
            for s in SEASONS:
                kk = np.array(ks[s]) if ks[s] else np.array([], dtype=int)
                n = N1[j, kk].sum() if len(kk) else 0
                if n < 8:
                    per = None
                    break
                p = P1[j, kk]
                run = best = 0
                for x, nn in zip(p, N1[j, kk]):
                    if nn:
                        run = run + 1 if x < -1e-9 else 0
                        best = max(best, run)
                per.append((p.sum() / n, int(n), best))
            if per and min(x[0] for x in per) > 0:
                rows.append((min(x[0] for x in per), j, per))
        rows.sort(key=lambda r: -r[0])
        print(f"\n  {g[0]}/{g[1]}: {len(ks['2024-25'])} + {len(ks['2025-26'])} slates; {len(rows)} strategies positive in both seasons")
        for mn, j, per in rows[:12]:
            print(f"    {label(names[j]):<44} " + " | ".join(f"{s} ROI {100 * r:+6.1f}% n{n:>3} losing run {b:>2}" for s, (r, n, b) in zip(SEASONS, per)))

    # ------------------------------------------------------------------ live boards
    print("\n" + "=" * 170 + "\nLIVE BOARDS - structure, the most similar history slates, each method's config trained on BOTH seasons")
    allidx = list(range(len(alldays)))
    mu = {x: float(np.mean([f[x] for f in allf])) for x in FE}
    sd = {x: max(1e-6, float(np.std([f[x] for f in allf]))) for x in FE}
    X = np.array([fvec(f, mu, sd) for f in allf])
    outcomes = {}
    for d, pl, mk, line, res in conn.execute("""SELECT game_date, player, regexp_replace(market_key, '_alternate$', ''), line::float8, leg_result
                                                FROM nba_market.board_outcomes WHERE game_date = ANY(%s::date[])""", (F.LIVE_DAYS,)).fetchall():
        outcomes[(d, F.norm(pl), mk, round(line, 1))] = res
    cmap = SE.load_corr(conn)
    print("  history structure (mean / sd): " + ", ".join(f"{x} {mu[x]:.3f}/{sd[x]:.3f}" for x in FE + ([] if SCOREFEAT else ["score_top20"])
                                                         if x in mu) + (f", score_top20 {np.mean([f['score_top20'] for f in allf]):.2f}" if not SCOREFEAT else ""))
    live_tot = defaultdict(list)
    for li, d in enumerate(F.LIVE_DAYS, 1):
        rk_rows, _ = F.live_legs(conn, d, outcomes)
        rws = [r for r in rk_rows if not r["tier"].startswith("U")]
        if not rws:
            print(f"\n  {d}: no priced window board - skipped")
            continue
        legs, seen = [], set()
        for r in rws:
            if r["rank_key"] != "final_score":
                continue
            key = (r["player"], r["prop"], r["side"], round(r["line"], 1), r["tier"])
            if key in seen:
                continue
            seen.add(key)
            legs.append({"player": r["player"], "prop": r["prop"], "side": r["side"], "line": r["line"], "tier": r["tier"],
                         "factor": r["factor"], "score": r["score"], "hit": r["hit"], "game": r["event_id"]})
        f = structure(legs, li)
        dist = np.sqrt(((X - fvec(f, mu, sd)) ** 2).sum(1))
        ordr = np.argsort(dist)
        print(f"\n  {d}: " + ", ".join(f"{x} {f[x]:.3f}" for x in FE) + f", score_top20 {f['score_top20']:.2f}")
        print("    most similar history slates: " + "; ".join(f"{alldays[i][1]} ({feat[alldays[i]]['games']} games, d {dist[i]:.2f})" for i in ordr[:5]))
        lb = build_leg_strategies(legs)
        pool_all = SE.eligible_legs(rws)
        fam = defaultdict(set)
        for c, lst in pool_all.items():
            for l in lst:
                fam[c.replace("_U", "")].add(l["player"])
        broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        pools = {"_wo": pool_all, "_wo_nosteals": {c: v for c, v in pool_all.items() if c not in M.STEALS_CELLS}}
        built = {}

        def unit_slips(u, kmax):
            if (u, kmax) not in built:
                out = []
                for k, slip in enumerate(SE.build_day_slips(pools[u[0]], u[1], u[2], u[3], kmax, cmap, broad), 1):
                    ev = [l["event_id"] for l in slip]
                    for l in slip:
                        l["game"] = l.get("event_id")
                    pr = None if all(l.get("hit") is None for l in slip) else SE.grade(slip, u[3], same_game=len(ev) > len(set(ev)))[1] - 1.0
                    keys = list(dict.fromkeys(legkey(l) for l in slip))
                    out.append((k, pr, (u[2], u[3], tuple(sorted(map(str, keys)))), keys, slip))
                built[(u, kmax)] = out
            return built[(u, kmax)]

        def slips_of(j, n):
            nm = names[j]
            if nm[0] == "LB":
                _, pg, tg, sd_, size, st = nm
                return [(sl, st) for sl in lb.get((pg, tg, sd_, size), [])[:n]]
            if nm[0] == "EU":
                u = nm[1:]
                return [(row[4], u[3]) for row in unit_slips(u, 2)[:n]]
            tk = port_day(lambda u: unit_slips(u, KMAX_P))
            return [(t[2][4], t[0][3]) for t in tk]

        def show(name, c):
            if c[0] == "skip":
                plays = []
            elif c[0] == "one":
                plays = slips_of(c[1], 1)
            elif c[0] == "two":
                plays = slips_of(c[1], 2)
            else:
                plays = slips_of(c[1], 1) + slips_of(c[2], 1)
            tot, graded = 0.0, True
            lines = []
            for sl, st in plays:
                if st == "power" and not POWER_DEMON and sum(1 for l in sl if str(l["tier"]).startswith("D")) >= 2:
                    lines.append("       (Power with 2+ demons - not priced, not played)")
                    continue
                pr = grade(sl, st)
                if pr is None or any(l.get("hit") is None for l in sl):
                    graded = False
                else:
                    tot += pr
                lines.append(f"       {len(sl)}-{st}: " + "; ".join(
                    f"{l['player']} {l['prop']} {'MORE' if l['side'] == 'Over' else 'LESS'} {float(l['line']):g} {l['tier']} x{float(l['factor']):.2f} "
                    f"{'hit' if l.get('hit') == 1 else ('miss' if l.get('hit') == 0 else '?')}" for l in sl) + (f" -> {pr:+.2f}u" if pr is not None else ""))
            res = "no slip" if not plays else (f"{len(plays)} slips {tot:+.2f}u" if graded else "ungraded (games not final)")
            print(f"    {name:<22} {cfg_label(c)}: {res}")
            for x in lines:
                print(x)
            live_tot[name].append((d, len(plays) if graded else 0, tot if graded else 0.0))
        show("LIVE 2-slip portfolio", ("two", PORT))
        for K in KS:
            show(f"KNN K{K}", choose(allidx, [int(i) for i in ordr[:K]]))
    print("\n  live totals (graded slates only):")
    for name, daily in live_tot.items():
        print(f"    {name:<22} {fmt(stats(daily))}")
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
