#!/usr/bin/env python3
"""RESEARCH - PRIZEPICKS UNIVERSE, DEEPER (2026-11-02, owner 21:18 PT: "different angles, different proplines, different compositions,
different ranks, trailings and all possible again, use documentation and go deeper!"). READ-ONLY.

What the 10-25 final review (research_final_strategies, ~150k: line types x sides x 8 prop sets x final_hp / EV / 20-slate trailing /
blend x floors x caps x skip; single goblin / demon levels; documented cells; factor bands) and the 11-02 grid did NOT cover, now added:
  PROP LINES   every line level alone (R, G1, G2, G3, D1, D2, D3) and mixed (R+G, R+D, all); line position in the slate (low / high
               half of its prop x level) and the 0.5 lines alone; every prop alone (points, rebounds, assists, threes, combos,
               steals, blocks, turnovers, stocks) besides the groups
  RANKS        final_hp, chance x factor, baseline_hp, final_score; the CELL TRAIL over 10 / 20 / 40 slates; blends 25 / 50 / 75 %
               trail; the PLAYER's own hit rate AT THIS LINE over his last 5 / 10 / 20 games ("L10"), 0.5 final_hp + 0.5 L10, and
               the L10 average's distance from the line toward the pick
  COMPOSITIONS one slip from TWO selectors (k legs from one, the rest from the other - 14 building blocks: low-volume / main x
               More / Less, goblin More, demon value, steals / turnovers / rebounds / points Less ...), every pair and split
  every structure: Power 2-6 and Flex 3-6; one slip a strategy a slate; the live board (live_slip_engine.load_board_legs_live), the
  12 calibrated props, graded on the box score, PrizePicks' payouts (build_slip_engine grader v3).
HONEST READS per structure: the cross-season holdout (top 10 chosen on one season -> the other, and this season), the WALK-FORWARD
process (each slate plays the strategy with the best lower bound on every EARLIER slate - top 1 and the top-5 average), the
robust list (positive lower bound in each season), the early-season slice (the first slates of each season) and portfolio B's
six units on the same footing.
Env: DATABASE_URL, UV_SMOKE (1 = every 6th history slate), UV_MINN (40), UV_BATT (A,B,C).
"""
import math
import os
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import build_slip_engine as SE                       # noqa: E402
import live_slip_engine as L                         # noqa: E402
import portfolio_b as PB                             # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
from final_hp_board_cal import PROPS as CAL_PROPS    # noqa: E402

T0 = time.time()
PERIODS = ("2024-25", "2025-26", "2026-27")
MINN = int(os.environ.get("UV_MINN") or 40)
BATT = set((os.environ.get("UV_BATT") or "A,B,C").split(","))
STRUCTS = [(n, "power") for n in (2, 3, 4, 5, 6)] + [(n, "flex") for n in (3, 4, 5, 6)]
NST = len(STRUCTS)
MAXSZ = 6
POOLS = {"R": ("R",), "G1": ("G1",), "G2": ("G2",), "G3": ("G3",), "D1": ("D1",), "D2": ("D2",), "D3": ("D3",),
         "RG": ("R", "G1", "G2", "G3"), "RD": ("R", "D1", "D2", "D3"), "ALL": ("R", "G1", "G2", "G3", "D1", "D2", "D3")}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
GRP = PB.GRP
PROPSETS = {"all": None, "lowvol": {"steals", "blocks", "turnovers", "stocks"},
            "main": {"points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast"},
            "points": {"points"}, "rebounds": {"rebounds"}, "assists": {"assists"}, "threes": {"threes_made"},
            "combos": {"pra", "pts_reb", "pts_ast", "reb_ast"}, "steals": {"steals"}, "blocks": {"blocks"},
            "turnovers": {"turnovers"}, "stocks": {"stocks"}}
POS = ("all", "low", "high", "half")
RANKS = ("p", "ev", "base", "score", "tr10", "tr20", "tr40", "bl25", "bl50", "bl75", "l5", "l10", "l20", "pl10", "aedge")
STATF = {"points": lambda g: g[0], "rebounds": lambda g: g[1], "assists": lambda g: g[2], "threes_made": lambda g: g[3],
         "steals": lambda g: g[4], "blocks": lambda g: g[5], "turnovers": lambda g: g[6], "stocks": lambda g: g[4] + g[5],
         "pts_reb": lambda g: g[0] + g[1], "pts_ast": lambda g: g[0] + g[2], "reb_ast": lambda g: g[1] + g[2],
         "pra": lambda g: g[0] + g[1] + g[2]}
# composition building blocks: (pool, side, props, rank, floor)
BLOCKS = {"lvU": ("R", "U", "lowvol", "bl50", 0.0), "lvO": ("R", "O", "lowvol", "bl50", 0.0), "lvB": ("R", "B", "lowvol", "tr20", 0.62),
          "mnU": ("R", "U", "main", "p", 0.0), "mnO": ("R", "O", "main", "p", 0.0), "mnU10": ("R", "U", "main", "l10", 0.0),
          "mnO10": ("R", "O", "main", "l10", 0.0), "gO": ("RG", "O", "main", "p", 0.65), "dV": ("RD", "O", "main", "ev", 0.0),
          "allU60": ("R", "U", "all", "p", 0.60), "stlU": ("R", "U", "steals", "bl50", 0.0), "tovU": ("R", "U", "turnovers", "bl50", 0.0),
          "rebU": ("R", "U", "rebounds", "p", 0.0), "ptsU10": ("R", "U", "points", "l10", 0.0)}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def load(conn):
    days = AF.slate_days(conn)
    use = [(AF.season_of(d), d) for d in days if AF.season_of(d) in PERIODS]
    if os.environ.get("UV_SMOKE") == "1":
        use = [x for i, x in enumerate(use) if x[0] == "2026-27" or i % 6 == 0]
    # every player's games (for the L5 / L10 / L20 line hit), oldest first
    glog = defaultdict(list)
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute(
            """SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log
               WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        glog[pid].append((d, (float(pts or 0), float(reb or 0), float(ast or 0), float(fg3m or 0), float(stl or 0), float(blk or 0), float(tov or 0))))
    gdates = {pid: [g[0] for g in v] for pid, v in glog.items()}
    log(f"game logs: {len(glog):,} players")
    import bisect
    out = []
    for i, (s, d) in enumerate(use):
        rows = L.load_board_legs_live(conn, d)
        by = {}
        for l in rows:
            if l.get("whole_number") or l.get("score") is None or l["prop"] not in CAL_PROPS or l.get("team_id") is None:
                continue
            k = (str(l["player_id"]), l["prop"], l["tier"], l["side"], float(l["line"]))
            b = by.setdefault(k, {"player": l["player"], "player_id": str(l["player_id"]), "prop": l["prop"], "tier": l["tier"],
                                  "side": l["side"], "line": float(l["line"]), "factor": float(l["factor"] or 1.0),
                                  "team_id": l["team_id"], "event_id": l["event_id"]})
            b[{"final_hp": "p", "baseline_hp": "base", "final_score": "score"}[l["rank_key"]]] = float(l["score"])
        st = AF.box(conn, d)
        if not by or not st:
            continue
        legs = []
        for b in by.values():
            if b.get("p") is None:
                continue
            b.setdefault("base", b["p"]); b.setdefault("score", b["p"])
            b["hit"] = AF.outcome(st, b)
            b["_grp"] = GRP.get(b["prop"])
            # the player's own line hit before this slate
            gs = glog.get(b["player_id"], [])
            j = bisect.bisect_left(gdates.get(b["player_id"], []), d)
            past = [g for _dd, g in gs[max(0, j - 20):j]]
            f = STATF[b["prop"]]
            vals = [f(g) for g in past]
            sgn = 1 if b["side"] == "Over" else -1
            for n in (5, 10, 20):
                v = vals[-n:]
                h = [(x > b["line"]) if sgn == 1 else (x < b["line"]) for x in v]
                b[f"l{n}"] = (sum(h) / len(h)) if len(v) >= 3 else b["p"]
            v10 = vals[-10:]
            b["aedge"] = (sgn * (float(np.mean(v10)) - b["line"]) / math.sqrt(abs(b["line"]) + 1)) if len(v10) >= 3 else 0.0
            b["pl10"] = 0.5 * b["p"] + 0.5 * b["l10"]
            legs.append(b)
        legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"], l["tier"]))
        med = defaultdict(list)
        for l in legs:
            med[(l["prop"], l["tier"])].append(l["line"])
        med = {k: float(np.median(v)) for k, v in med.items()}
        for l in legs:
            l["_lp"] = "low" if l["line"] <= med[(l["prop"], l["tier"])] else "high"
        out.append((s, d, legs))
        if i % 25 == 0:
            log(f"loaded {i + 1}/{len(use)} {d}: {len(legs)} legs")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


def cellk(l):
    return (l["prop"], l["tier"] if l["tier"] == "R" else l["tier"][:2], l["side"])


def set_trails(legs, hist):
    for w in (10, 20, 40):
        agg = defaultdict(lambda: [0, 0])
        for h in list(hist)[-w:]:
            for c, (a, b) in h.items():
                agg[c][0] += a; agg[c][1] += b
        for l in legs:
            a, b = agg.get(cellk(l), (0, 0))
            l[f"tr{w}"] = a / b if b >= 30 else l["p"]
    for l in legs:
        l["bl25"] = 0.75 * l["p"] + 0.25 * l["tr20"]
        l["bl50"] = 0.5 * l["p"] + 0.5 * l["tr20"]
        l["bl75"] = 0.25 * l["p"] + 0.75 * l["tr20"]
        l["ev"] = l["p"] * l["factor"]


def counts(legs):
    c = defaultdict(lambda: [0, 0])
    for l in legs:
        if l["hit"] is not None:
            c[cellk(l)][0] += int(l["hit"]); c[cellk(l)][1] += 1
    return dict(c)


def pick_list(cand, gc, used_p=None, used_g=None, need=MAXSZ):
    pick, players, games = [], set(used_p or ()), defaultdict(int, used_g or {})
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == need:
            break
    return pick


def grade(pick, st):
    return SE.grade([{"hit": l["hit"], "factor": l["factor"], "event_id": l["event_id"]} for l in pick], st)[1]


def battery_a():
    return [("A", po, pos, sd, ps, rk, fl, gc, 0) for po in POOLS for pos in POS for sd in SIDES for ps in PROPSETS
            for rk in ("p", "ev", "l10", "tr20") for fl in (0.0, 0.60) for gc in (1, 2)]


def battery_b():
    return [("B", po, "all", sd, ps, rk, fl, gc, sk) for po in ("R", "RG", "RD", "ALL") for sd in SIDES
            for ps in ("all", "lowvol", "main", "steals", "turnovers", "blocks", "stocks", "points", "rebounds")
            for rk in RANKS for fl in (0.0, 0.55, 0.60, 0.65, 0.70) for gc in (1, 2) for sk in (0, 1)]


def battery_c():
    ks = list(BLOCKS)
    return [("C", a, b, k) for i, a in enumerate(ks) for b in ks[i + 1:] for k in range(1, MAXSZ)]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    slates = load(conn)
    conn.close()
    seas = np.array([s for s, _d, _l in slates])
    log("slates: " + ", ".join(f"{s} {int((seas == s).sum())}" for s in PERIODS))
    combos = (battery_a() if "A" in BATT else []) + (battery_b() if "B" in BATT else []) + (battery_c() if "C" in BATT else [])
    # de-duplicate A/B overlaps
    seen, uniq = set(), []
    for c in combos:
        k = c if c[0] == "C" else c[1:]
        if k not in seen:
            seen.add(k); uniq.append(c)
    combos = uniq
    NC = len(combos)
    log(f"strategies: {NC:,} combos x {NST} structures = {NC * NST:,}")
    R = np.full((NC * NST, len(slates)), np.nan, np.float32)
    BU = defaultdict(lambda: np.full(len(slates), np.nan))
    hist = deque(maxlen=40)
    pbh = deque(maxlen=PB.WINDOW)
    for di, (s, d, legs) in enumerate(slates):
        set_trails(legs, hist)
        # portfolio B on the same legs (the live builder)
        prep = PB.prepare([dict(l) for l in legs], PB.window_rates(pbh))
        for uid in ("B3", "B4", "B5", "B6", "B7", "B9"):
            sl = PB.unit_slip(prep, uid)
            if sl is not None:
                BU[uid][di] = grade(sl, PB.UNITS[uid][3]) - 1.0
        cache, bl = {}, {}
        index = defaultdict(list)
        for l in legs:
            index[(l["tier"], l["side"], l["prop"])].append(l)
        allprops = sorted({l["prop"] for l in legs})

        def ordered(po, pos, sd, ps, rk):
            kk = (po, pos, sd, ps, rk)
            if kk not in cache:
                pset = PROPSETS[ps]
                base = []
                for t in POOLS[po]:
                    for sdd in SIDES[sd]:
                        for pr in (allprops if pset is None else pset):
                            base += index.get((t, sdd, pr), [])
                if pos != "all":
                    base = [l for l in base if (pos == "half" and l["line"] == 0.5) or (pos in ("low", "high") and l["_lp"] == pos)]
                # fixed tie order (player, prop, side, line, tier) before the rank, so equal scores resolve the same way
                base.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"], l["tier"]))
                cache[kk] = sorted(base, key=lambda l: (-l[rk], -l["p"]))
            return cache[kk]

        for ci, c in enumerate(combos):
            if c[0] == "C":
                _t, a, b, k = c
                if a not in bl:
                    po, sd, ps, rk, fl = BLOCKS[a]; bl[a] = [l for l in ordered(po, "all", sd, ps, rk) if l["p"] >= fl]
                if b not in bl:
                    po, sd, ps, rk, fl = BLOCKS[b]; bl[b] = [l for l in ordered(po, "all", sd, ps, rk) if l["p"] >= fl]
                first = pick_list(bl[a], 1, need=k)
                if len(first) < k:
                    continue
                g = defaultdict(int)
                for l in first:
                    g[l["event_id"]] += 1
                rest = pick_list(bl[b], 1, used_p={l["player"] for l in first}, used_g=g, need=MAXSZ - k)
                pk = first + rest
                for j, (n, st_) in enumerate(STRUCTS):
                    if n > k and len(pk) >= n and len({l["team_id"] for l in pk[:n]}) >= 2:
                        R[ci * NST + j, di] = grade(pk[:n], st_) - 1.0
                continue
            _t, po, pos, sd, ps, rk, fl, gc, sk = c
            cand = [l for l in ordered(po, pos, sd, ps, rk) if l["p"] >= fl][sk:]
            pk = pick_list(cand, gc)
            for j, (n, st_) in enumerate(STRUCTS):
                if len(pk) >= n and len({l["team_id"] for l in pk[:n]}) >= 2:
                    R[ci * NST + j, di] = grade(pk[:n], st_) - 1.0
        hist.append(counts(legs))
        pbh.append(PB.slate_counts(PB.eligible([dict(l) for l in legs])))
        if di % 20 == 0:
            log(f"graded {di + 1}/{len(slates)} {d}")
    report(slates, seas, combos, R, BU)
    log("DONE")


def name(c, j):
    n, st_ = STRUCTS[j]
    t = f"{n}{'P' if st_ == 'power' else 'F'}"
    if c[0] == "C":
        return f"COMP {c[1]} x{c[3]} + {c[2]} {t}"
    _b, po, pos, sd, ps, rk, fl, gc, sk = c
    return f"{c[0]} {po}-{pos}-{sd}-{ps}-{rk}-p{fl:.2f}-gc{gc}{'-skip1' if sk else ''} {t}"


def per(x, m):
    v = x[m & ~np.isnan(x)]
    return len(v), (float(v.mean()) if len(v) else float("nan"))


def report(slates, seas, combos, R, BU):
    days = [d for _s, d, _l in slates]
    first = np.zeros(len(slates), bool)
    for s in PERIODS:
        idx = np.nonzero(seas == s)[0][:13]
        first[idx] = True
    print("\n" + "=" * 170 + "\nPORTFOLIO B's UNITS ON THE SAME LEGS: slips | ROI (2024-25 | 2025-26 | this season | first 13 slates of every season)")
    for uid, x in BU.items():
        print(f"  {uid} {PB.UNITS[uid][2]}{'P' if PB.UNITS[uid][3] == 'power' else 'F'}: " + " | ".join(
            f"{lab} {per(x, m)[0]} {100 * per(x, m)[1]:+.0f}%" for lab, m in (("24-25", seas == "2024-25"), ("25-26", seas == "2025-26"),
                                                                                  ("now", seas == "2026-27"), ("first13", first))))
    tot = np.nansum(np.vstack(list(BU.values())), 0); cnt = np.sum(~np.isnan(np.vstack(list(BU.values()))), 0)
    print("  ALL SIX: " + " | ".join(f"{s} {int(cnt[seas == s].sum())} slips {100 * tot[seas == s].sum() / max(cnt[seas == s].sum(), 1):+.1f}%" for s in PERIODS))

    NC = len(combos)
    for j, (n, st_) in enumerate(STRUCTS):
        M = R[j::NST]          # NC x slates
        V = ~np.isnan(M)
        Z = np.nan_to_num(M)
        stat = {}
        for s in PERIODS:
            m = seas == s
            c = V[:, m].sum(1); sm = Z[:, m].sum(1); sq = (Z[:, m] ** 2).sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                mu = sm / np.maximum(c, 1); sd = np.sqrt(np.maximum(sq / np.maximum(c, 1) - mu ** 2, 0)); lb = mu - sd / np.sqrt(np.maximum(c, 1))
            stat[s] = (c, mu, lb)
        c1, m1, l1 = stat["2024-25"]; c2, m2, l2 = stat["2025-26"]; c3, m3, _l3 = stat["2026-27"]
        print("\n" + "=" * 170 + f"\n{n}-pick {st_.upper()} - {NC:,} strategies")
        # A cross-season holdout
        for (ca, la, ma, lab_a), (cb, mb, lab_b) in (((c1, l1, m1, "2024-25"), (c2, m2, "2025-26")), ((c2, l2, m2, "2025-26"), (c1, m1, "2024-25"))):
            sc = np.where(ca >= MINN, la, -9)
            top = np.argsort(-sc)[:10]
            fwd = [mb[i] for i in top if cb[i] >= 10]
            now = [m3[i] for i in top if c3[i] >= 3]
            print(f"  A  top 10 chosen on {lab_a} (lower bound) -> {lab_b}: {100 * np.mean([ma[i] for i in top]):+.0f}% -> {100 * np.mean(fwd) if fwd else 0:+.0f}% "
                  f"({sum(1 for x in fwd if x > 0)} of {len(fwd)} positive) | this season {100 * np.mean(now) if now else 0:+.0f}%")
        # B walk-forward process: each slate plays the best lower bound on EVERY earlier slate (>= MINN earlier slips)
        cs = np.zeros(NC); ss = np.zeros(NC); qq = np.zeros(NC)
        wf1, wf5 = [], []
        for di in range(len(slates)):
            if di >= MINN:
                with np.errstate(invalid="ignore", divide="ignore"):
                    mu = ss / np.maximum(cs, 1); sd = np.sqrt(np.maximum(qq / np.maximum(cs, 1) - mu ** 2, 0)); lb = np.where(cs >= MINN, mu - sd / np.sqrt(np.maximum(cs, 1)), -9)
                o = np.argsort(-lb)[:5]
                r1 = M[o[0], di]
                wf1.append((seas[di], first[di], r1))
                r5 = [M[i, di] for i in o if not np.isnan(M[i, di])]
                wf5.append((seas[di], first[di], float(np.mean(r5)) if r5 else np.nan))
            v = V[:, di]
            cs += v; ss += Z[:, di]; qq += Z[:, di] ** 2
        parts = []
        for lab, sel in (("24-25", lambda s, f: s == "2024-25"), ("25-26", lambda s, f: s == "2025-26"), ("now", lambda s, f: s == "2026-27"),
                         ("first13", lambda s, f: f)):
            a = [r for s, f, r in wf1 if sel(s, f) and not np.isnan(r)]
            b = [r for s, f, r in wf5 if sel(s, f) and not np.isnan(r)]
            parts.append(f"{lab} top1 {100 * np.mean(a) if a else 0:+.0f}% ({len(a)}) top5 {100 * np.mean(b) if b else 0:+.0f}%")
        print("  B  WALK-FORWARD: " + " | ".join(parts))
        # C robust
        ok = (c1 >= MINN) & (c2 >= MINN) & (l1 > 0) & (l2 > 0)
        weak = np.where(ok, np.minimum(m1, m2), -9)
        top = np.argsort(-weak)[:12]
        print(f"  C  ROBUST (positive lower bound in both seasons): {int(ok.sum()):,}")
        for i in top:
            if weak[i] <= -9:
                break
            ef = M[i, first & (seas != "2026-27")]; ef = ef[~np.isnan(ef)]
            print(f"       {name(combos[i], j):<70} 24-25 {100 * m1[i]:+5.0f}% ({c1[i]}) | 25-26 {100 * m2[i]:+5.0f}% ({c2[i]}) | now {100 * m3[i] if c3[i] else 0:+5.0f}% ({c3[i]}) "
                  f"| history first-13 {100 * ef.mean() if len(ef) else 0:+.0f}% ({len(ef)})")
        # D by battery: the best robust of each
        for bt in ("A", "B", "C"):
            idx = [i for i in range(NC) if combos[i][0] == bt]
            if idx:
                b = max(idx, key=lambda i: weak[i])
                if weak[b] > -9:
                    print(f"  D  best {bt}: {name(combos[b], j)} {100 * m1[b]:+.0f}% / {100 * m2[b]:+.0f}% / now {100 * m3[b] if c3[b] else 0:+.0f}% ({c3[b]})")


if __name__ == "__main__":
    main()
