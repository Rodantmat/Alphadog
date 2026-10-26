#!/usr/bin/env python3
"""
RESEARCH - SLEEPER PART D: SAME-GAME STACKS (2026-10-25; owner 21:29 PT: "Research online, debug, test, simulate, probe the app to
find how the multipliers work ... be sure that there is nothing useful. No early give up"). READ-ONLY.

Sleeper prices every pick on its own and pays the PRODUCT of the multipliers (Max), with no correlation adjustment in its rules
(Player Picks Rules: only "no multiple picks for the same player" and "players from multiple teams"). On the real boards of
2026-10-20..24 two Unders in the same game hit together 1.09-1.10x as often as their fair chances multiply (Overs 0.89-0.92x). If
that holds over two seasons and COMPOUNDS with more picks from one game, a same-game Under stack could beat the 12.4%-a-leg margin
(plus Sleeper's size bonus: 3 picks x1.08, 4 x1.10 measured on the owner's screens; 5 ~x1.14 and 6 ~x1.23 estimated).
HISTORY (2024-25, 2025-26; books' consensus de-vigged MAIN lines, Sleeper-priced m = round(1 / (1.1238 p), 2), box-score graded):
  per game, one stack per rule: side (Under / Over / mixed by team) x prop set x order (most likely first / nearest 50-50 / by our
  final_hp) x k = 2..8 picks, distinct players, both teams present -> all-hit rate, mean product of fair chances, the stack
  ratio R = all-hit / product, ROI without and with the size bonus; per season; by game spread and total (closing lines).
  BASELINE: the same rules across DIFFERENT games (one pick per game) - what independence gives.
Env: DATABASE_URL, SS_SMOKE (1 = every 6th slate).
"""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_hist as RSH                  # noqa: E402

T0 = time.time()
OVR = 1.1238
BONUS = {2: 1.0, 3: 1.0797, 4: 1.102, 5: 1.144, 6: 1.227, 7: 1.227, 8: 1.227}
KS = (2, 3, 4, 5, 6, 7, 8)
PSETS = {"all": None, "points": {"points"}, "pra": {"pra"}, "core": {"points", "rebounds", "assists", "pra", "pts_reb", "pts_ast", "reb_ast"},
         "scoring": {"points", "pra", "pts_reb", "pts_ast", "threes_made"}, "lowvol": {"steals", "blocks", "turnovers", "stocks"}}
SIDES = ("Under", "Over", "teamsplit")
ORDERS = ("likely", "even", "hp")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


BOX = """SELECT nba_player_id::text, team_id, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE game_date=%s"""
GL = """SELECT home_team, away_team, avg(home_spread)::float, avg(total_line)::float FROM nba_market.game_lines_closing
        WHERE game_date IN (%s, %s::date + 1) GROUP BY 1, 2"""          # the lines table is keyed by the UTC date: a PT evening game sits on d + 1


def day_legs(conn, d):
    rows = conn.execute(RSH.HSQL, (d, RSH.HBOOKS, RSH.MKALL)).fetchall()
    q = defaultdict(lambda: defaultdict(dict)); ev = {}
    for bk, pn, pid, mk, side, line, price, e in rows:
        if abs(price) < 100 or mk.endswith("_alternate"):
            continue
        q[(pid, RSH.MK[mk], line)][bk][side] = RSH.american(price)
        ev[pid] = e
    fair = {}; nbk = {}
    for k, books in q.items():
        ps = [(1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"]) for s in books.values() if "Over" in s and "Under" in s]
        if ps:
            fair[k] = float(np.mean(ps)); nbk[k] = len(ps)
    main = {}
    for (pid, prop, line), p in fair.items():
        sc = (nbk[(pid, prop, line)], -abs(p - .5))
        if (pid, prop) not in main or sc > main[(pid, prop)][0]:
            main[(pid, prop)] = (sc, line)
    box = {r[0]: r for r in conn.execute(BOX, (d,)).fetchall()}
    hp = {(r[0], r[1], r[2], r[3]): r[4] for r in conn.execute(RSH.FSQL, (d,)).fetchall()}
    tn = {r[0]: r[1] for r in conn.execute("SELECT team_id, full_name FROM nba_ref.teams").fetchall()}
    gl = {}
    for h, a, sp, tot in conn.execute(GL, (d, d)).fetchall():
        gl.setdefault(frozenset((h, a)), (sp, tot))
    legs = []
    for (pid, prop), (_sc, line) in main.items():
        b = box.get(pid)
        if not b or not b[9]:
            continue
        st = dict(pts=b[2] or 0, reb=b[3] or 0, ast=b[4] or 0, fg3m=b[5] or 0, stl=b[6] or 0, blk=b[7] or 0, tov=b[8] or 0)
        v = AF.STAT[prop](st)
        if v == line:
            continue
        p = fair[(pid, prop, line)]
        for side, ps in (("Over", p), ("Under", 1 - p)):
            if ps <= 0.05 or ps >= 0.95:
                continue
            legs.append({"pid": pid, "team": b[1], "game": ev.get(pid), "prop": prop, "side": side, "p": ps, "m": round(1 / (OVR * ps), 2),
                         "hit": int(v > line) if side == "Over" else int(v < line), "hp": hp.get((pid, prop, side, line))})
    games = defaultdict(list)
    for l in legs:
        games[l["game"]].append(l)
    out = {}
    for g, x in games.items():
        teams = sorted({l["team"] for l in x})
        if len(teams) != 2:
            continue
        ctx = gl.get(frozenset((tn.get(teams[0]), tn.get(teams[1]))), (None, None))
        out[g] = (x, teams, ctx)
    return out


def ordered(x, teams, side, ps, order):
    """the rule's candidates in order, one per player"""
    pset = PSETS[ps]
    if side == "teamsplit":                               # one team's Unders + the other team's Overs (a blowout shape)
        c = [l for l in x if (l["team"] == teams[0] and l["side"] == "Under") or (l["team"] == teams[1] and l["side"] == "Over")]
    else:
        c = [l for l in x if l["side"] == side]
    c = [l for l in c if pset is None or l["prop"] in pset]
    if order == "likely":
        c.sort(key=lambda l: -l["p"])
    elif order == "even":
        c.sort(key=lambda l: abs(l["p"] - .5))
    else:
        c = [l for l in c if l["hp"] is not None]
        c.sort(key=lambda l: -(l["hp"] * l["m"]))
    out, seen = [], set()
    for l in c:
        if l["pid"] not in seen:
            out.append(l); seen.add(l["pid"])
    return out


def take(c, k):
    """first k (distinct players) with both teams present (Sleeper: players from multiple teams)"""
    if len(c) < k:
        return None
    s = c[:k]
    if len({l["team"] for l in s}) < 2:
        other = [l for l in c[k:] if l["team"] != s[0]["team"]]
        if not other:
            return None
        s = s[:-1] + [other[0]]
    return s


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = [d for d in AF.slate_days(conn) if AF.season_of(d) != "2026-27"]
    if os.environ.get("SS_SMOKE") == "1":
        days = days[::6]
    rng = np.random.default_rng(5)
    rules = [(sd, ps, od) for sd in SIDES for ps in PSETS for od in ORDERS]
    rec = defaultdict(list)          # (rule, k, mode) -> rows (season, allhit, prod_p, payout_nobonus, spread, total)
    for i, d in enumerate(days):
        s = AF.season_of(d)
        G = day_legs(conn, d)
        sc = 0 if s == "2024-25" else 1
        firsts = defaultdict(list)
        for g, (x, teams, (sp, tot)) in G.items():
            for rule in rules:
                c = ordered(x, teams, *rule)
                if c:
                    firsts[rule].append(c[0])
                for k in KS:
                    sl = take(c, k)
                    if sl is None:
                        continue
                    allhit = int(all(l["hit"] for l in sl))
                    rec[(rule, k, "same")].append((sc, allhit, float(np.prod([l["p"] for l in sl])), float(np.prod([l["m"] for l in sl])) * allhit,
                                                   abs(sp) if sp is not None else np.nan, tot if tot is not None else np.nan))
        # baseline across games: the rule's first leg of each game, games in random order
        for rule, fl in firsts.items():
            rng.shuffle(fl)
            for k in KS:
                if len(fl) >= k:
                    sl = fl[:k]
                    allhit = int(all(l["hit"] for l in sl))
                    rec[(rule, k, "cross")].append((sc, allhit, float(np.prod([l["p"] for l in sl])), float(np.prod([l["m"] for l in sl])) * allhit, np.nan, np.nan))
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 30 == 0:
            log(f"slate {i + 1}/{len(days)} {d}: {len(G)} games")
    print("=" * 170)
    print("STACK RATIO R = all-hit rate / mean product of fair chances; ROI = mean payout - 1 (no bonus | with Sleeper's size bonus)")
    rows = []
    for (rule, k, mode), v in rec.items():
        a = np.array(v, float)
        if len(a) < 200:
            continue
        r = {}
        for sc_, sea in ((0, "2024-25"), (1, "2025-26")):
            b = a[a[:, 0] == sc_]
            if len(b):
                r[sea] = (len(b), b[:, 1].mean(), b[:, 2].mean(), b[:, 3].mean() - 1, b[:, 3].mean() * BONUS[k] - 1)
        allr = (len(a), a[:, 1].mean(), a[:, 2].mean(), a[:, 3].mean() - 1, a[:, 3].mean() * BONUS[k] - 1)
        rows.append((rule, k, mode, allr, r, a))
    for mode in ("same", "cross"):
        print(f"\n== {mode.upper()} {'(one game)' if mode == 'same' else '(different games - the independence baseline)'}")
        for k in KS:
            sub = [x for x in rows if x[1] == k and x[2] == mode]
            if not sub:
                continue
            ratio = [x[3][1] / x[3][2] for x in sub if x[3][2] > 0]
            print(f"  k={k}: {len(sub)} rules | median R {np.median(ratio):.3f} | best ROI with bonus:")
            for rule, kk, md, allr, r, a in sorted(sub, key=lambda x: -x[3][4])[:6]:
                line = f"    {rule[0]}-{rule[1]}-{rule[2]}: {allr[0]} slips | all-hit {allr[1]:.3f} vs product {allr[2]:.3f} (R {allr[1] / allr[2]:.2f}) | ROI {100 * allr[3]:+.0f}% / {100 * allr[4]:+.0f}%"
                for sea, rr in r.items():
                    line += f" | {sea} {100 * rr[4]:+.0f}% ({rr[0]})"
                print(line)
    print("\n== SAME vs CROSS, rule by rule (ROI with bonus; the gap is what one game's correlation is worth). MARKET-ONLY orders first (no model)")
    idx = {(x[0], x[1], x[2]): x for x in rows}
    for grp, ords in (("market-only", ("likely", "even")), ("model-ranked", ("hp",))):
        print(f"  -- {grp}")
        for k in KS:
            gaps = []
            for rule in rules:
                if rule[2] not in ords:
                    continue
                sm, cr = idx.get((rule, k, "same")), idx.get((rule, k, "cross"))
                if sm and cr:
                    gaps.append((sm[3][4] - cr[3][4], rule, sm, cr))
            if not gaps:
                continue
            g = np.array([x[0] for x in gaps])
            print(f"  k={k}: {len(gaps)} rules | same minus cross ROI: median {100 * np.median(g):+.0f} pts, {int((g > 0).sum())} of {len(g)} positive")
            for gp, rule, sm, cr in sorted(gaps, key=lambda x: -x[2][3][4])[:5]:
                print(f"    {rule[0]}-{rule[1]}-{rule[2]}: same {sm[3][0]} slips R {sm[3][1] / sm[3][2]:.2f} ROI {100 * sm[3][4]:+.0f}% "
                      f"({' / '.join(f'{sea} {100 * rr[4]:+.0f}%' for sea, rr in sm[4].items())}) | cross {cr[3][0]} slips R {cr[3][1] / cr[3][2]:.2f} ROI {100 * cr[3][4]:+.0f}%")
    nctx = sum(1 for (rule, k, mode), v in rec.items() if mode == "same" for x in v if x[4] == x[4])
    print(f"\n(rows with closing-line context: {nctx})")
    print("\n== SAME-GAME by game context (k=3..6 Under stacks, all props, most-likely order): ROI with bonus by |spread| and total")
    for k in (3, 4, 5, 6):
        for rule, kk, md, allr, r, a in rows:
            if kk == k and md == "same" and rule in (("Under", "all", "likely"), ("Under", "all", "even"), ("teamsplit", "all", "even")):
                print(f"  {rule[0]}-{rule[1]}-{rule[2]}")
                for lab, f in (("|spread| < 4", lambda x: x[4] < 4), ("|spread| 4-9", lambda x: 4 <= x[4] < 9), ("|spread| >= 9", lambda x: x[4] >= 9),
                               ("total < 225", lambda x: x[5] < 225), ("total 225-235", lambda x: 225 <= x[5] < 235), ("total >= 235", lambda x: x[5] >= 235)):
                    b = np.array([x for x in a if f(x)])
                    if len(b) >= 50:
                        print(f"  k={k} {lab:<14}: {len(b):5d} | all-hit {b[:, 1].mean():.3f} vs {b[:, 2].mean():.3f} (R {b[:, 1].mean() / b[:, 2].mean():.2f}) | "
                              f"ROI {100 * (b[:, 3].mean() * BONUS[k] - 1):+.0f}%")
    log("done")


if __name__ == "__main__":
    main()
