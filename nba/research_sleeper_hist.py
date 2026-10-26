#!/usr/bin/env python3
"""
RESEARCH - SLEEPER PART B: SLEEPER'S PRICING LAW FROM ITS REAL BOARD, THEN TWO SEASONS OF HISTORY PRICED BY THAT LAW (2026-10-25;
owner 20:28 PT: "we do not have back data, so we need to find a way to price legs with the implied multipliers and qualify legs
accordingly and build slips on top of them"). READ-ONLY.

B1 THE LAW (this season, real Sleeper window boards): per main leg, Sleeper's m against each book's de-vigged chance at the same
   line (Fliff, Bovada, DraftKings, Underdog) - how far each book sits from Sleeper; Sleeper's pair overround; m x p_book on main
   lines (= 1 / overround if Sleeper copies the book) and on alternate rungs by the book's chance (the ladder's extra margin).
B2 HISTORY (2024-25, 2025-26 regular seasons, final 7 days out): the books' window boards (FanDuel, DraftKings, BetMGM, Caesars,
   Fanatics, BetOnline, Bovada, BetRivers) -> consensus de-vigged chance per (player, stat, line) -> a Sleeper-like board: the
   consensus MAIN line (most books; nearest 50/50 on ties) both sides at m = round(1 / (OVR x p), 2), plus Over-only alternate
   rungs at the books' alternate lines priced m = round(1 / (K_ALT(p) x p), 2) - OVR and K_ALT from B1. final_hp per leg, graded on
   the box score.
B3 VALUE on the simulated history: hp x m bins per season (main / alternate, More / Less, prop group) - the question "had Sleeper
   priced like this, would our probability have found value?".
B4 SLIPS on the simulated history: side x prop set x rank (hp / hp x m) x gate (none, 1.00 .. 1.10) x hp floor x kind x skip x size
   2-6, Max (product) and Flex (round robin), one pick per game; robust count, holdout both ways, walk-forward; the robust ones
   on THIS SEASON's real Sleeper prices.
Env: DATABASE_URL, SH_SMOKE (1 = every 8th slate).
"""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402

T0 = time.time()
MK = RSD.MK
MKALL = RSD.MKALL
HBOOKS = ["fanduel", "draftkings", "betmgm", "williamhill_us", "fanatics", "betonlineag", "bovada", "betrivers"]
GRP = AF.GRP
PROPSETS = AF.PROPSETS
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
SIZES = (2, 3, 4, 5, 6)
GATES = (None, 1.00, 1.03, 1.06, 1.10)
FLOORS = (0.0, 0.55, 0.60, 0.65)
KINDS = ("main", "alt", "all")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


HSQL = """
WITH b AS (SELECT DISTINCT ON (bookmaker, nba_ref.norm_name(player), market_key, side, line)
             bookmaker, nba_ref.norm_name(player) pn, market_key, side, line::float line, price, event_id
           FROM nba_market.board_snapshots
           WHERE game_date=%s AND snapshot_label='window' AND bookmaker = ANY(%s) AND market_key = ANY(%s) AND price IS NOT NULL
           ORDER BY bookmaker, nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC)
SELECT b.bookmaker, b.pn, nm.player_id::text, b.market_key, b.side, b.line, b.price::float, b.event_id
FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn"""
FSQL = """SELECT player_id::text, prop, side, line::float, final_hp::float FROM nba_score.final_hp WHERE game_date=%s AND final_hp IS NOT NULL"""


def american(p):
    return 1 + 100.0 / (-p) if p < 0 else 1 + p / 100.0


def law(conn, live_days):
    """B1: Sleeper's real board against each book; returns (OVR, K_ALT table [(p_lo, p_hi, k)])"""
    print("=" * 170 + "\nB1 SLEEPER'S PRICING LAW (real window boards)")
    per_book = defaultdict(list); mains = []; alts = []
    for d in live_days:
        rows = conn.execute(RSD.SQL, (d, ["window"], ["sleeper", *RSD.BOOKS], MKALL, d)).fetchall()
        sl = {}; q = defaultdict(lambda: defaultdict(dict))
        for bk, lab, pn, pid, mk, side, line, price, mult, ev, p in rows:
            dd = RSD.dec(bk, price, mult)
            if dd is None or dd <= 1:
                continue
            prop = MK[mk.replace("_alternate", "")]
            if bk == "sleeper":
                sl[(pid, prop, side, line)] = (dd, "alt" if mk.endswith("_alternate") else "main")
            else:
                q[bk][(pid, prop, line)][side] = min(dd, q[bk][(pid, prop, line)].get(side, 9e9))
        for bk, qq in q.items():
            for (pid, prop, line), s in qq.items():
                if "Over" in s and "Under" in s:
                    po = (1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"])
                    for side, p in (("Over", po), ("Under", 1 - po)):
                        x = sl.get((pid, prop, side, line))
                        if x:
                            (mains if x[1] == "main" else alts).append((bk, p, x[0]))
                            if x[1] == "main":
                                per_book[bk].append(p - 1 / (x[0] * 1.125))
    for bk, v in per_book.items():
        v = np.array(v)
        print(f"  {bk:<11}: {len(v):6d} main legs | book fair - Sleeper fair: mean {100 * v.mean():+.2f} pts, sd {100 * v.std():.2f}, "
              f"|d| <= 1 pt {100 * np.mean(np.abs(v) <= .01):.0f}%")
    mp = np.array([x[1] * x[2] for x in mains])
    ovr = float(1 / np.median(mp)) if len(mp) else 1.125
    print(f"  main: p_book x m median {np.median(mp):.4f} -> OVR {ovr:.4f}; spread p10 {np.percentile(mp, 10):.3f} p90 {np.percentile(mp, 90):.3f}")
    kt = []
    a = np.array([(x[1], x[1] * x[2]) for x in alts]) if alts else np.zeros((0, 2))
    for lo, hi in ((0, .15), (.15, .25), (.25, .35), (.35, .45), (.45, .55), (.55, .65), (.65, .75), (.75, .85), (.85, 1.01)):
        k = (a[:, 0] >= lo) & (a[:, 0] < hi) if len(a) else np.zeros(0, bool)
        if k.sum() >= 15:
            kv = float(1 / np.median(a[k, 1]))
            kt.append((lo, hi, kv))
            print(f"  alternate, book chance {lo:.2f}-{hi:.2f}: {int(k.sum()):5d} rungs | p x m median {np.median(a[k, 1]):.3f} -> margin factor {kv:.3f}")
    return ovr, kt


def kalt(kt, p, ovr):
    for lo, hi, k in kt:
        if lo <= p < hi:
            return k
    return ovr * 1.10


def hist_day(conn, d, st, ovr, kt):
    rows = conn.execute(HSQL, (d, HBOOKS, MKALL)).fetchall()
    q = defaultdict(lambda: defaultdict(dict)); ev = {}; pn_ = {}
    for bk, pn, pid, mk, side, line, price, e in rows:
        if abs(price) < 100:
            continue
        prop = MK[mk.replace("_alternate", "")]
        q[(pid, prop, line)][bk][side] = american(price)
        ev[pid] = e; pn_[pid] = pn
    fair = {}; nbk = {}
    for k, books in q.items():
        ps = [(1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"]) for s in books.values() if "Over" in s and "Under" in s]
        if ps:
            fair[k] = float(np.mean(ps)); nbk[k] = len(ps)
    main = {}
    for (pid, prop, line), p in fair.items():
        cur = main.get((pid, prop))
        sc = (nbk[(pid, prop, line)], -abs(p - .5))
        if cur is None or sc > cur[0]:
            main[(pid, prop)] = (sc, line)
    hp = {(r[0], r[1], r[2], r[3]): r[4] for r in conn.execute(FSQL, (d,)).fetchall()}
    legs = []
    for (pid, prop), (_sc, ml) in main.items():
        p = fair[(pid, prop, ml)]
        for side, ps in (("Over", p), ("Under", 1 - p)):
            if ps <= 0.02 or ps >= 0.98:
                continue
            legs.append({"player": pn_[pid], "player_id": pid, "prop": prop, "side": side, "line": ml, "m": round(1 / (ovr * ps), 2),
                         "kind": "main", "event_id": ev[pid], "pf": ps})
    for (pid, prop, line), p in fair.items():
        mlx = main.get((pid, prop))
        if mlx is None or line == mlx[1] or p <= 0.03 or p >= 0.97:
            continue
        legs.append({"player": pn_[pid], "player_id": pid, "prop": prop, "side": "Over", "line": line, "m": round(1 / (kalt(kt, p, ovr) * p), 2),
                     "kind": "alt", "event_id": ev[pid], "pf": p})
    out = []
    for l in legs:
        if l["m"] <= 1.0:
            continue
        l["p"] = hp.get((l["player_id"], l["prop"], l["side"], l["line"]))
        if l["p"] is None:
            continue
        l["hit"] = AF.outcome(st, l)
        out.append(l)
    return out


def live_day(conn, d, st):
    sl, mk, *_ = RSD.load(conn, d)
    out = []
    for k, l in sl.get("window", {}).items():
        if l["hp"] is None:
            continue
        h = AF.outcome(st, l)
        out.append({**l, "p": l["hp"], "hit": h})
    return out


def combos():
    return [(sd, ps, rk, g, fl, kd, sk) for sd in SIDES for ps in PROPSETS for rk in ("p", "ev") for g in GATES for fl in FLOORS
            for kd in KINDS for sk in (0, 1)]


STRUCT = [(n, "max") for n in SIZES] + [(n, "flex") for n in SIZES if n >= 3]


def tagname(c, n, mode):
    sd, ps, rk, g, fl, kd, sk = c
    return (f"{dict(O='More', U='Less', B='both')[sd]}-{ps}-{rk}-gate{'none' if g is None else g}-p{fl:.2f}-{kd}{'-skip1' if sk else ''} "
            f"{n}-pick {mode}")


def day_vec(legs, C):
    """one slate -> P/L per (combo, structure); candidate filtering vectorised per (side, props, kind, rank) list"""
    out = np.full(len(C) * len(STRUCT), np.nan, np.float32)
    for l in legs:
        l["_grp"] = GRP.get(l["prop"]); l["_ev"] = l["p"] * l["m"]
    legs = sorted(legs, key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
    cache = {}
    for ci, c in enumerate(C):
        sd, ps, rk, g, fl, kd, sk = c
        k1 = (sd, ps, kd, rk)
        if k1 not in cache:
            pset = PROPSETS[ps]
            base = [l for l in legs if l["side"] in SIDES[sd] and (pset is None or l["_grp"] in pset) and (kd == "all" or l["kind"] == kd)]
            base.sort(key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["_ev"]))
            cache[k1] = (base, np.array([l["p"] for l in base]), np.array([l["_ev"] for l in base]))
        base, pa, ea = cache[k1]
        k2 = (k1, g, fl)
        if k2 not in cache:
            keep = pa >= fl
            if g is not None:
                keep &= ea >= g
            cache[k2] = np.nonzero(keep)[0]
        pick, players, games, skipped = [], set(), set(), 0
        for i in cache[k2]:
            l = base[i]
            if skipped < sk:
                skipped += 1; continue
            if l["player"] in players or l["event_id"] in games:
                continue
            pick.append(l); players.add(l["player"]); games.add(l["event_id"])
            if len(pick) == max(SIZES):
                break
        for j, (n, mode) in enumerate(STRUCT):
            if len(pick) >= n:
                s = [l for l in pick[:n] if l["hit"] is not None]
                out[ci * len(STRUCT) + j] = RSD.sleeper_pay([l["m"] for l in s], [bool(l["hit"]) for l in s], mode) - 1.0
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    if os.environ.get("SH_SMOKE") == "1":
        hist = hist[::8]
    ovr, kt = law(conn, live)
    C = combos()
    log(f"history {len(hist)} slates, this season {len(live)}; {len(C) * len(STRUCT):,} strategies")
    cols, seas, vals = [], [], []
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        legs = hist_day(conn, d, st, ovr, kt) if d in hist else live_day(conn, d, st)
        if not legs:
            continue
        s = AF.season_of(d)
        cols.append(day_vec(legs, C)); seas.append(s)
        vals += [(s, l["kind"], l["side"], GRP.get(l["prop"]), l["p"], l["m"], l["hit"]) for l in legs if l["hit"] is not None]
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 30 == 0:
            log(f"slate {i + 1}/{len(hist) + len(live)} {d}: {len(legs)} legs")
    seas = np.array(seas)
    # ---------------- B3 value ----------------
    print("\n" + "=" * 170 + "\nB3 VALUE (hp x m bins -> legs, hit, mean m, return per pick); history = simulated Sleeper prices, 2026-27 = REAL")
    V = np.array([(p, m, h) for s, k, sd, g, p, m, h in vals], float)
    meta = [(s, k, sd, g) for s, k, sd, g, p, m, h in vals]
    for s in ("2024-25", "2025-26", "2026-27"):
        for lab, f in (("main", lambda x: x[1] == "main"), ("alternate", lambda x: x[1] == "alt"), ("main More", lambda x: x[1] == "main" and x[2] == "Over"),
                       ("main Less", lambda x: x[1] == "main" and x[2] == "Under")):
            k = np.array([x[0] == s and f(x) for x in meta])
            if k.sum() < 50:
                continue
            ev = V[k, 0] * V[k, 1]; ret = V[k, 1] * V[k, 2] - 1
            print(f"  {s} {lab}: {int(k.sum()):,} legs, all-leg return {100 * ret.mean():+.1f}%")
            for lo, hi in ((0, .95), (.95, 1.0), (1.0, 1.03), (1.03, 1.06), (1.06, 1.10), (1.10, 1.20), (1.20, 99)):
                kk = (ev >= lo) & (ev < hi)
                if kk.sum() >= 30:
                    print(f"     hp x m {lo:.2f}-{hi:.2f}: {int(kk.sum()):6d} | hp {V[k, 0][kk].mean():.3f} | hit {V[k, 2][kk].mean():.3f} | m {V[k, 1][kk].mean():.2f} | "
                          f"return {100 * ret[kk].mean():+.1f}%")
    # ---------------- B4 slips ----------------
    P = np.stack(cols, axis=1)
    A, Bm, Cm = seas == "2024-25", seas == "2025-26", seas == "2026-27"
    na, mua, _, lba = AF.lb_stats(P[:, A]); nb, mub, _, lbb = AF.lb_stats(P[:, Bm]); nc, muc, _, _ = AF.lb_stats(P[:, Cm])
    robust = (na >= 40) & (nb >= 40) & (lba > 0) & (lbb > 0)
    weak = np.where(robust, np.minimum(mua, mub), -np.inf)
    NS = len(STRUCT)
    print("\n" + "=" * 170 + "\nB4 SLIPS (history simulated, this season real)")
    for j, (n, mode) in enumerate(STRUCT):
        rows_ = np.arange(j, P.shape[0], NS)
        X = P[rows_][:, A | Bm]
        for (tr, te, a, b) in ((A, Bm, "2024-25", "2025-26"), (Bm, A, "2025-26", "2024-25")):
            ntr, mutr, _, lbtr = AF.lb_stats(P[rows_][:, tr]); nte, mute, _, _ = AF.lb_stats(P[rows_][:, te])
            ok = (ntr >= 40) & (nte >= 10)
            top = [i for i in np.argsort(-np.where(ok, lbtr, -np.inf))[:10] if ok[i]]
            if top:
                print(f"  {n}-pick {mode}: top {len(top)} chosen on {a} -> {b}: {100 * np.mean(mutr[top]):+.0f}% -> {100 * np.nanmean(mute[top]):+.0f}% "
                      f"({sum(mute[top] > 0)} positive)")
        w1 = AF.walk_forward(X, 1); w5 = AF.walk_forward(X, 5)
        rb = rows_[robust[rows_]]
        print(f"  {n}-pick {mode}: walk-forward top-1 {100 * w1.mean():+.0f}% top-5 {100 * w5.mean():+.0f}% | robust {len(rb)}")
        for r in rb[np.argsort(-weak[rb])][:6]:
            print(f"      {tagname(C[r // NS], n, mode):<70} {100 * mua[r]:+.0f}% ({int(na[r])}) / {100 * mub[r]:+.0f}% ({int(nb[r])}) | "
                  f"REAL 2026-27 {('%+.0f%% (%d)' % (100 * muc[r], nc[r])) if nc[r] else 'none'}")
    rr = np.where(robust)[0]
    if len(rr):
        live_roi = muc[rr][nc[rr] > 0]
        print(f"\n  ALL {len(rr)} robust strategies on this season's REAL prices: {len(live_roi)} played, median ROI {100 * np.median(live_roi):+.0f}%, "
              f"positive {100 * np.mean(live_roi > 0):.0f}%")
    log("done")


if __name__ == "__main__":
    main()
