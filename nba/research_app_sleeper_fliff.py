#!/usr/bin/env python3
"""
RESEARCH - SLEEPER AND FLIFF: LEG BY LEG ON THE REAL BOARDS, THEN SLIPS ON SIMULATED HISTORY (2026-10-25; owner 15:34 PT: "for all
others individual leg analysis and slip building test ... with even this current season and see what we can do from now on").
READ-ONLY.

Both apps price each pick on its own (Sleeper: a per-side multiplier, the entry pays the PRODUCT when every pick hits; Fliff: decimal
sportsbook odds, a parlay pays the product). Their boards exist only from 2026-10 (this season). So:
  1 LIVE LEGS (this season's graded slates, REAL prices): each app's window legs joined to final_hp (the same resolver as the live
    Underdog engine: norm_name -> player_name_map -> final_hp per (date, player, prop, side, line)), graded on the box score. Per
    app: calibration (final_hp vs hit), the app's implied probability (1 / price) vs hit, and the single-pick value: legs grouped
    by p x price - their realised return price x hit - 1.
  2 PRICE MODEL: on the same slates, the app's price vs DraftKings' (Bovada when DraftKings has no line) price for the same
    (player, market, side, line): log(app) = a + b log(book), fitted per app and line kind (main / alternate). R2 and residual sd.
  3 SIMULATED HISTORY (2024-25, 2025-26 regular seasons, final 7 days out): the books' window lines -> each app's modelled price ->
    the same strategy grid as the real slates, graded on the box score. A proxy - stale-line edges are missed, lines the app never
    offered are included (both noted).
  4 SLIP GRID (one slip a strategy a slate, one pick per game, distinct players, payout = product of prices when all hit):
    side x prop set x rank (final_hp / final_hp x price) x value gate (p x price >= 1.00 .. 1.20, or none) x final_hp floor x line
    kind (main / alternate / all) x skip the top leg x size 2-6. Read per size: robust on the simulated history (lower bound > 0
    in both seasons), holdout both ways, walk-forward - and THE SAME STRATEGIES ON THIS SEASON'S REAL PRICES.
Env: DATABASE_URL, SF_APPS (sleeper,fliff), SF_MINN (40), SF_TOP (10).
"""
import datetime as dt
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ud_live_slip_engine as UDL                    # noqa: E402
import research_app_final_strategies as AF           # noqa: E402

T0 = time.time()
APPS = [a for a in (os.environ.get("SF_APPS") or "sleeper,fliff").split(",") if a]
MINN = int(os.environ.get("SF_MINN") or 40)
TOPN = int(os.environ.get("SF_TOP") or 10)
MK = {'player_points': 'points', 'player_rebounds': 'rebounds', 'player_assists': 'assists', 'player_threes': 'threes_made',
      'player_steals': 'steals', 'player_blocks': 'blocks', 'player_turnovers': 'turnovers', 'player_blocks_steals': 'stocks',
      'player_points_rebounds': 'pts_reb', 'player_points_assists': 'pts_ast', 'player_rebounds_assists': 'reb_ast',
      'player_points_rebounds_assists': 'pra'}
MKALL = list(MK) + [k + "_alternate" for k in MK]
GRP = AF.GRP
PROPSETS = AF.PROPSETS
SIDES = AF.SIDES
GATES = (None, 1.00, 1.05, 1.10, 1.15, 1.20)
FLOORS = (0.0, 0.55, 0.60, 0.65, 0.70)
KINDS = ("main", "alt", "all")
SIZES = (2, 3, 4, 5, 6)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def dec(price, mult):
    if mult is not None:
        return float(mult)
    if price is None:
        return None
    p = float(price)
    if abs(p) < 1.01:           # already decimal-ish / missing
        return None
    return 1 + 100.0 / (-p) if p < 0 else 1 + p / 100.0


BOARD_SQL = """
WITH b AS (SELECT DISTINCT ON (bookmaker, nba_ref.norm_name(player), market_key, side, line)
             bookmaker, nba_ref.norm_name(player) pn, market_key, side, line::float line, price, multiplier, event_id
           FROM nba_market.board_snapshots
           WHERE snapshot_label='window' AND game_date=%s AND bookmaker = ANY(%s) AND market_key = ANY(%s)
           ORDER BY bookmaker, nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC)
SELECT b.bookmaker, b.pn, nm.player_id::text, b.market_key, b.side, b.line, b.price::float, b.multiplier::float, b.event_id,
       f.final_hp::float
FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn
LEFT JOIN nba_score.final_hp f ON f.game_date=%s AND f.player_id=nm.player_id AND f.side=b.side AND f.line=b.line
  AND f.prop = (CASE replace(b.market_key, '_alternate', '') """ + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in MK.items()) + """ END)"""


def load_day(conn, day, books):
    out = defaultdict(dict)       # book -> key -> leg
    for bk, pn, pid, mk, side, line, price, mult, ev, p in conn.execute(BOARD_SQL, (day, books, MKALL, day)).fetchall():
        d = dec(price, mult)
        if d is None or d <= 1.0:
            continue
        key = (pid, MK[mk.replace("_alternate", "")], side, line)
        kind = "alt" if mk.endswith("_alternate") else "main"
        cur = out[bk].get(key)
        if cur is None or d < cur["m"]:
            out[bk][key] = {"player": pn, "player_id": pid, "prop": key[1], "side": side, "line": line, "m": d, "kind": kind,
                            "event_id": ev, "p": p}
    return out


def season_days(conn):
    import live_slip_engine as LSE
    days = []
    today = dt.datetime.now(UDL.PT).date()
    for probe in (dt.date(2025, 1, 15), dt.date(2026, 1, 15), dt.date(2026, 10, 25)):
        s0, s1 = LSE.regular_season_window(conn, probe)
        if s0 is None:
            continue
        d = s0
        while d <= s1:
            if (AF.season_of(d) == "2026-27" and d < today) or (AF.season_of(d) != "2026-27" and (s1 - d).days > 7):
                days.append(d)
            d += dt.timedelta(days=1)
    return days


def combos():
    return [(sd, ps, rk, g, fl, kd, sk) for sd in SIDES for ps in PROPSETS for rk in ("p", "ev") for g in GATES for fl in FLOORS
            for kd in KINDS for sk in (0, 1)]


def cname(c, n):
    sd, ps, rk, g, fl, kd, sk = c
    return (f"{dict(O='More', U='Less', B='both')[sd]}-{ps}-{rk}-gate{'none' if g is None else g:}-p{fl:.2f}-{kd}{'-skip1' if sk else ''} "
            f"{n}-pick")


def day_vec(legs, C):
    out = np.full(len(C) * len(SIZES), np.nan, np.float32)
    for l in legs:
        l["_grp"] = GRP.get(l["prop"])
        l["_ev"] = l["p"] * l["m"]
    cache = {}
    for ci, c in enumerate(C):
        sd, ps, rk, g, fl, kd, sk = c
        k1 = (sd, ps, kd, rk)
        if k1 not in cache:
            pset = PROPSETS[ps]
            base = [l for l in legs if l["side"] in SIDES[sd] and (pset is None or l["_grp"] in pset) and (kd == "all" or l["kind"] == kd)]
            cache[k1] = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["_ev"]))
        pick, players, games = [], set(), set()
        skipped = 0
        for l in cache[k1]:
            if l["p"] < fl or (g is not None and l["_ev"] < g):
                continue
            if skipped < sk:
                skipped += 1
                continue
            if l["player"] in players or l["event_id"] in games:
                continue
            pick.append(l); players.add(l["player"]); games.add(l["event_id"])
            if len(pick) == max(SIZES):
                break
        for j, n in enumerate(SIZES):
            if len(pick) >= n:
                s = [l for l in pick[:n] if l["hit"] is not None]
                if len(s) < 2:
                    out[ci * len(SIZES) + j] = 0.0           # refund
                    continue
                out[ci * len(SIZES) + j] = (math.prod(l["m"] for l in s) - 1.0) if all(l["hit"] for l in s) else -1.0
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = season_days(conn)
    live_days = [d for d in days if AF.season_of(d) == "2026-27"]
    hist_days = [d for d in days if AF.season_of(d) != "2026-27"]
    log(f"slates: history {len(hist_days)}, this season {len(live_days)}")
    C = combos()
    log(f"{len(C):,} combos x {len(SIZES)} sizes per app")
    # ---------------- 1 + 2: live legs, real prices, price model ----------------
    fits = {}
    live_mats = {a: [] for a in APPS}
    for app in APPS:
        legs_all, pairs = [], defaultdict(list)
        for d in live_days:
            st = AF.box(conn, d)
            if not st:
                continue
            b = load_day(conn, d, [app, "draftkings", "bovada"])
            legs = []
            for key, l in b.get(app, {}).items():
                if l["p"] is None:
                    continue
                l["hit"] = AF.outcome(st, l)
                legs.append(l)
                bl = b.get("draftkings", {}).get(key) or b.get("bovada", {}).get(key)
                if bl:
                    pairs[l["kind"]].append((math.log(1.0 / bl["m"]), math.log(l["m"])))
            legs_all += [(d, l) for l in legs]
            live_mats[app].append(day_vec(legs, C))
        g = [l for _, l in legs_all if l["hit"] is not None]
        print("\n" + "=" * 170 + f"\n{app.upper()} - REAL PRICES, {len(live_days)} slates, {len(g):,} graded legs")
        if not g:
            continue
        p = np.array([l["p"] for l in g]); m = np.array([l["m"] for l in g]); h = np.array([l["hit"] for l in g])
        print("  calibration (final_hp bin -> legs, mean final_hp, hit rate):")
        for lo, hi in ((0, .4), (.4, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .7), (.7, .8), (.8, 1.01)):
            k = (p >= lo) & (p < hi)
            if k.sum():
                print(f"    {lo:.2f}-{hi:.2f}: {int(k.sum()):5d} legs, p {p[k].mean():.3f}, hit {h[k].mean():.3f}, app implied {np.mean(1 / m[k]):.3f}")
        print("  single-pick value (p x price bin -> legs, hit, realised return per pick = price x hit - 1):")
        ev = p * m
        for lo, hi in ((0, .9), (.9, 1.0), (1.0, 1.05), (1.05, 1.1), (1.1, 1.2), (1.2, 1.4), (1.4, 99)):
            k = (ev >= lo) & (ev < hi)
            if k.sum():
                print(f"    {lo:.2f}-{hi:.2f}: {int(k.sum()):5d} legs, hit {h[k].mean():.3f}, mean price {m[k].mean():.2f}, return {100 * np.mean(m[k] * h[k] - 1):+.1f}%")
        for kd in ("main", "alt"):
            k = np.array([l["kind"] == kd for l in g])
            if k.sum():
                print(f"    {kd}: {int(k.sum())} legs, hit {h[k].mean():.3f}, return at p x price >= 1.05: "
                      f"{100 * np.mean((m[k] * h[k] - 1)[ev[k] >= 1.05]) if (ev[k] >= 1.05).sum() else float('nan'):+.1f}% ({int((ev[k] >= 1.05).sum())} legs)")
        for kd, pr in pairs.items():
            if len(pr) < 30:
                continue
            x = np.array([a for a, _ in pr]); y = np.array([b for _, b in pr])
            A_ = np.vstack([np.ones_like(x), x]).T
            coef, *_ = np.linalg.lstsq(A_, y, rcond=None)
            res = y - A_ @ coef
            r2 = 1 - res.var() / y.var()
            fits[(app, kd)] = (coef[0], coef[1], res.std())
            print(f"  PRICE MODEL {kd}: log({app}) = {coef[0]:+.3f} {coef[1]:+.3f} x log(book implied); R2 {r2:.3f}, residual sd {res.std():.3f}, {len(pr)} pairs")
    # ---------------- 3 + 4: simulated history ----------------
    for app in APPS:
        if (app, "main") not in fits:
            print(f"\n{app}: no price model - history skipped")
            continue
        cols, seas = [], []
        for i, d in enumerate(hist_days):
            st = AF.box(conn, d)
            if not st:
                continue
            b = load_day(conn, d, ["draftkings", "bovada"])
            src = dict(b.get("bovada", {}))
            src.update(b.get("draftkings", {}))
            legs = []
            for key, l in src.items():
                if l["p"] is None:
                    continue
                f = fits.get((app, l["kind"])) or fits[(app, "main")]
                l = dict(l)
                l["m"] = math.exp(f[0] + f[1] * math.log(1.0 / l["m"]))
                if l["m"] <= 1.0:
                    continue
                l["hit"] = AF.outcome(st, l)
                legs.append(l)
            if not legs:
                continue
            cols.append(day_vec(legs, C)); seas.append(AF.season_of(d))
            if i % 40 == 0:
                log(f"{app} history slate {i + 1}/{len(hist_days)}: {len(legs)} legs")
            if i % 40 == 39:
                conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        P = np.stack(cols, axis=1); seas = np.array(seas)
        L = np.stack(live_mats[app], axis=1) if live_mats[app] else np.full((P.shape[0], 0), np.nan)
        A, Bm = seas == "2024-25", seas == "2025-26"
        print("\n" + "=" * 170 + f"\n{app.upper()} - SIMULATED HISTORY ({int(A.sum())} + {int(Bm.sum())} slates) + REAL PRICES THIS SEASON ({L.shape[1]} slates)")
        summary = []
        for j, n in enumerate(SIZES):
            rows_ = np.arange(j, P.shape[0], len(SIZES))
            XA, XB, XL, X = P[rows_][:, A], P[rows_][:, Bm], L[rows_], P[rows_]
            na, mua, _, lba = AF.lb_stats(XA); nb, mub, _, lbb = AF.lb_stats(XB)
            nl, mul, _, _ = AF.lb_stats(XL) if XL.shape[1] else (np.zeros(len(rows_)), np.full(len(rows_), np.nan), None, None)
            print(f"\n  {n}-pick ({len(rows_):,} strategies)")
            for (ntr, lbtr, mutr, nte, mute, a, b_) in ((na, lba, mua, nb, mub, "2024-25", "2025-26"), (nb, lbb, mub, na, mua, "2025-26", "2024-25")):
                ok = (ntr >= MINN) & (nte >= 10)
                top = [i for i in np.argsort(-np.where(ok, lbtr, -np.inf))[:TOPN] if ok[i]]
                if top:
                    print(f"    A  top {len(top)} chosen on {a} -> {b_}: {100 * np.mean(mutr[top]):+.0f}% -> {100 * np.nanmean(mute[top]):+.0f}% "
                          f"({sum(mute[top] > 0)} of {len(top)} positive)")
            w1 = AF.walk_forward(X, 1); w5 = AF.walk_forward(X, 5)
            print(f"    B  WALK-FORWARD top-1 {100 * w1.mean():+.0f}% | top-5 {100 * w5.mean():+.0f}%")
            ok = (na >= MINN) & (nb >= MINN) & (lba > 0) & (lbb > 0)
            idx = np.where(ok)[0]
            idx = idx[np.argsort(-np.minimum(mua, mub)[idx])][:TOPN]
            print(f"    C  ROBUST on simulated history: {int(ok.sum())}; best {len(idx)} + REAL this season:")
            for i in idx:
                x = X[i]
                print(f"       {cname(C[i], n):<70} 2024-25 {100 * mua[i]:+.0f}% ({int(na[i])}d) | 2025-26 {100 * mub[i]:+.0f}% ({int(nb[i])}d) | "
                      f"won {100 * np.mean(x[~np.isnan(x)] > 0):.0f}% | dd {AF.max_dd(x):.1f}u | REAL 2026-27 "
                      f"{('%+.0f%% (%dd)' % (100 * mul[i], nl[i])) if nl[i] else 'none'}")
            if len(idx):
                rl = [mul[i] for i in idx if nl[i]]
                summary.append((n, int(ok.sum()), cname(C[idx[0]], n), mua[idx[0]], mub[idx[0]], np.mean(rl) if rl else np.nan, w1.mean()))
            else:
                summary.append((n, 0, "none", np.nan, np.nan, np.nan, w1.mean()))
        print(f"\n  SUMMARY {app.upper()} (size: robust | best | simulated 2024-25 / 2025-26 | top-{TOPN} REAL this season | walk-forward)")
        for n, nr, nm_, a, b_, r, w in summary:
            print(f"    {n}-pick: {nr} robust | {nm_} | {100 * a:+.0f}% / {100 * b_:+.0f}% | real {100 * r:+.0f}% | WF {100 * w:+.0f}%")
    log("done")


if __name__ == "__main__":
    main()
