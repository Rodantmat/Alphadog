#!/usr/bin/env python3
"""
RESEARCH - SLEEPER, DEEP, ON THIS SEASON'S REAL BOARDS (2026-10-25; owner 20:28 PT: "Deep scrutiny, sleeper only first ... the same
work we did for the previous apps but with the current app aspects and data limitation"). READ-ONLY. Part A (real prices).

Sleeper prices every pick on its own: a two-sided main line per player-stat (per-side multipliers, ~12% overround) plus an
Over-only alternate ladder; Max pays the product (a size bonus seen at 3-4 picks, never priced), Flex the round robin of the
(n-1)-pick sub-products (classification_config['sleeper_payout']). The leg's chance comes from three places:
  hp  our final_hp (the same resolver as every app: norm_name -> player_name_map -> final_hp (date, player, prop, side, line))
  sl  Sleeper itself: its two sides de-vigged (multiplicative) - main lines only
  mk  the market: each book's two sides at the SAME line de-vigged, averaged over the books that post it (Fliff, Bovada,
      DraftKings, Underdog's price) - window snapshot
READS (graded slates of 2026-27, the Sleeper WINDOW board = what the pick sees):
  1 inventory and coverage; 2 calibration of hp / sl / mk on the legs that have all three; 3 log loss / Brier of each and of
  blends, the blend weights chosen LEAVE-ONE-SLATE-OUT (honest); 4 single-pick VALUE: legs binned by p x m for every chance
  source (and the honest blends), realised return per pick (m x hit - 1) with a slate-clustered bootstrap 90% interval - main /
  alternate, More / Less, prop group; 5 market vs Sleeper disagreement (stale / bad lines): p_mk - p_sl bins; 6 MOVES: Sleeper
  morning -> window -> close and the market (Fliff) morning -> window, and whether a move foretells the result; 7 Sleeper's main
  line vs the market's main line (line shopping); 8 SLIPS on the real slates: qualification rule x side x kind x size 2-6, Max
  and Flex, graded by Sleeper's rule (voids drop the pick).
Env: DATABASE_URL, SD_BOOT (2000).
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
import research_app_final_strategies as AF           # noqa: E402

T0 = time.time()
NB = int(os.environ.get("SD_BOOT") or 2000)
RNG = np.random.default_rng(11)
MK = {'player_points': 'points', 'player_rebounds': 'rebounds', 'player_assists': 'assists', 'player_threes': 'threes_made',
      'player_steals': 'steals', 'player_blocks': 'blocks', 'player_turnovers': 'turnovers', 'player_blocks_steals': 'stocks',
      'player_points_rebounds': 'pts_reb', 'player_points_assists': 'pts_ast', 'player_rebounds_assists': 'reb_ast',
      'player_points_rebounds_assists': 'pra'}
MKALL = list(MK) + [k + "_alternate" for k in MK]
GRP = AF.GRP
BOOKS = ("fliff", "bovada", "draftkings", "underdog")

SQL = """
WITH b AS (SELECT DISTINCT ON (bookmaker, snapshot_label, nba_ref.norm_name(player), market_key, side, line)
             bookmaker, snapshot_label lab, nba_ref.norm_name(player) pn, market_key, side, line::float line, price, multiplier, event_id
           FROM nba_market.board_snapshots
           WHERE game_date=%s AND snapshot_label = ANY(%s) AND bookmaker = ANY(%s) AND market_key = ANY(%s)
           ORDER BY bookmaker, snapshot_label, nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC)
SELECT b.bookmaker, b.lab, b.pn, nm.player_id::text, b.market_key, b.side, b.line, b.price::float, b.multiplier::float, b.event_id,
       f.final_hp::float
FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn
LEFT JOIN nba_score.final_hp f ON f.game_date=%s AND f.player_id=nm.player_id AND f.side=b.side AND f.line=b.line
  AND f.prop = (CASE replace(b.market_key, '_alternate', '') """ + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in MK.items()) + """ END)"""


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def dec(bk, price, mult):
    if bk == "sleeper":
        return mult
    if price is None or abs(price) < 100:
        return None
    return 1 + 100.0 / (-price) if price < 0 else 1 + price / 100.0


def load(conn, day):
    """-> sleeper legs {label: {key: leg}}, market devig {key: [p per book]}, market main line {(pid, prop): line}"""
    rows = conn.execute(SQL, (day, ["morning", "window", "close"], ["sleeper", *BOOKS], MKALL, day)).fetchall()
    sl = defaultdict(dict)
    quotes = defaultdict(lambda: defaultdict(dict))          # (book, lab) -> (pid, prop, line) -> side -> decimal
    for bk, lab, pn, pid, mk, side, line, price, mult, ev, p in rows:
        d = dec(bk, price, mult)
        if d is None or d <= 1.0:
            continue
        prop = MK[mk.replace("_alternate", "")]
        kind = "alt" if mk.endswith("_alternate") else "main"
        if bk == "sleeper":
            key = (pid, prop, side, line)
            cur = sl[lab].get(key)
            if cur is None or d < cur["m"]:
                sl[lab][key] = {"player": pn, "player_id": pid, "prop": prop, "side": side, "line": line, "m": d, "kind": kind,
                                "event_id": ev, "hp": p}
        else:
            q = quotes[(bk, lab)][(pid, prop, line)]
            q[side] = min(d, q.get(side, 9e9))
    mk = defaultdict(list)
    mainline = {}
    best = {}
    for (bk, lab), qq in quotes.items():
        if lab != "window":
            continue
        for (pid, prop, line), s in qq.items():
            if "Over" in s and "Under" in s:
                po = (1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"])
                mk[(pid, prop, "Over", line)].append(po)
                mk[(pid, prop, "Under", line)].append(1 - po)
                k2 = (pid, prop)
                if k2 not in best or abs(po - 0.5) < best[k2]:
                    best[k2] = abs(po - 0.5); mainline[k2] = line
    fl_morning = {}
    for (pid, prop, line), s in quotes.get(("fliff", "morning"), {}).items():
        if "Over" in s and "Under" in s:
            po = (1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"])
            fl_morning[(pid, prop, "Over", line)] = po; fl_morning[(pid, prop, "Under", line)] = 1 - po
    fl_window = {}
    for (pid, prop, line), s in quotes.get(("fliff", "window"), {}).items():
        if "Over" in s and "Under" in s:
            po = (1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"])
            fl_window[(pid, prop, "Over", line)] = po; fl_window[(pid, prop, "Under", line)] = 1 - po
    return sl, mk, mainline, fl_morning, fl_window


def boot_ci(vals, slates):
    """slate-clustered bootstrap 90% interval of the mean"""
    vals = np.asarray(vals, float); slates = np.asarray(slates)
    u = np.unique(slates)
    if len(u) < 2:
        return (np.nan, np.nan)
    idx = {s: np.where(slates == s)[0] for s in u}
    ms = []
    for _ in range(NB):
        pick = RNG.choice(u, len(u))
        ii = np.concatenate([idx[s] for s in pick])
        ms.append(vals[ii].mean())
    return tuple(np.percentile(ms, [5, 95]))


def ll(p, h):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(h * np.log(p) + (1 - h) * np.log(1 - p)))


def value_table(title, rows, pcol, bins=(0, .9, .95, 1.0, 1.03, 1.06, 1.10, 1.20, 99)):
    print(f"\n  {title}")
    pv = np.array([r[pcol] for r in rows], float); m = np.array([r["m"] for r in rows]); h = np.array([r["hit"] for r in rows], float)
    s = np.array([r["slate"] for r in rows]); ev = pv * m; ret = m * h - 1
    for lo, hi in zip(bins, bins[1:]):
        k = (ev >= lo) & (ev < hi) & ~np.isnan(pv)
        if k.sum() >= 20:
            lo_, hi_ = boot_ci(ret[k], s[k])
            print(f"    p x m {lo:.2f}-{hi:.2f}: {int(k.sum()):6d} legs | mean p {pv[k].mean():.3f} | hit {h[k].mean():.3f} | mean m {m[k].mean():.2f} | "
                  f"return/pick {100 * ret[k].mean():+6.1f}% (90% {100 * lo_:+.1f} .. {100 * hi_:+.1f})")


def sleeper_pay(mults, hits, mode):
    """Sleeper's rule (classification_config sleeper_payout): voids already removed; Max = product if all hit; Flex = round robin of
    the (n-1)-pick sub-products, two misses -> 0; a Flex left with 2 picks pays as a 2-pick Max; < 2 picks = refund"""
    n = len(mults)
    if n < 2:
        return 1.0
    if mode == "max" or n == 2:
        return math.prod(mults) if all(hits) else 0.0
    miss = n - sum(hits)
    if miss >= 2:
        return 0.0
    subs = [math.prod(m for j, m in enumerate(mults) if j != i) for i in range(n)]
    if miss == 0:
        return sum(subs) / n
    i = hits.index(False)
    return subs[i] / n


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    today = dt.datetime.now(AF.UDL.PT).date() if hasattr(AF.UDL, "PT") else dt.date.today()
    days = []
    d = dt.date(2026, 10, 20)
    while d < today:
        days.append(d); d += dt.timedelta(days=1)
    legs = []
    inv = []
    for d in days:
        st = AF.box(conn, d)
        if not st:
            log(f"{d}: no box score yet - skipped"); continue
        sl, mk, mainline, flm, flw = load(conn, d)
        w = sl.get("window", {})
        if not w:
            log(f"{d}: no Sleeper window board"); continue
        # Sleeper's own de-vig on its main pairs
        pair = defaultdict(dict)
        for k, l in w.items():
            if l["kind"] == "main":
                pair[(k[0], k[1], k[3])][k[2]] = l["m"]
        ovr = {}
        for (pid, prop, line), s in pair.items():
            if "Over" in s and "Under" in s:
                tot = 1 / s["Over"] + 1 / s["Under"]
                ovr[(pid, prop)] = tot
                pair[(pid, prop, line)]["p_over"] = (1 / s["Over"]) / tot
        n_g = 0
        for k, l in w.items():
            h = AF.outcome(st, l)
            if h is None:
                continue
            n_g += 1
            pr = pair.get((k[0], k[1], k[3]), {})
            p_sl = (pr["p_over"] if k[2] == "Over" else 1 - pr["p_over"]) if "p_over" in pr else np.nan
            if l["kind"] == "alt" and (k[0], k[1]) in ovr:
                p_sl = (1 / l["m"]) / ovr[(k[0], k[1])]         # an Over-only rung: the player-stat's main overround taken out
            mkl = mk.get(k)
            r = {**l, "slate": d.isoformat(), "hit": int(h), "hp": np.nan if l["hp"] is None else l["hp"], "sl": p_sl,
                 "mk": float(np.mean(mkl)) if mkl else np.nan, "nbooks": len(mkl) if mkl else 0,
                 "m_morning": sl.get("morning", {}).get(k, {}).get("m", np.nan), "m_close": sl.get("close", {}).get(k, {}).get("m", np.nan),
                 "fl_m": flm.get(k, np.nan), "fl_w": flw.get(k, np.nan), "grp": GRP.get(l["prop"])}
            ml = mainline.get((k[0], k[1]))
            r["line_gap"] = np.nan if ml is None or l["kind"] != "main" else ((ml - l["line"]) if k[2] == "Over" else (l["line"] - ml))
            legs.append(r)
        inv.append((d, len(w), sum(1 for l in w.values() if l["kind"] == "main"), n_g, len(ovr),
                    float(np.mean(list(ovr.values()))) if ovr else np.nan))
    print("=" * 170 + "\n1 INVENTORY (Sleeper window board): slate | legs | main legs | graded | two-sided main pairs | mean pair overround")
    for x in inv:
        print(f"  {x[0]} | {x[1]:5d} | {x[2]:5d} | {x[3]:5d} | {x[4]:4d} | {x[5]:.3f}")
    L = legs
    main = [r for r in L if r["kind"] == "main"]
    alt = [r for r in L if r["kind"] == "alt"]
    print(f"  graded legs {len(L):,} (main {len(main):,}, alternate {len(alt):,}); with final_hp {sum(1 for r in L if r['hp'] == r['hp']):,}; "
          f"main with Sleeper de-vig {sum(1 for r in main if r['sl'] == r['sl']):,}; with a market price at the same line "
          f"{sum(1 for r in L if r['mk'] == r['mk']):,} (books: " + ", ".join(f"{n} {sum(1 for r in L if r['nbooks'] == n)}" for n in range(1, 5)) + ")")
    # ---------------- 2 calibration ----------------
    com = [r for r in main if r["hp"] == r["hp"] and r["sl"] == r["sl"] and r["mk"] == r["mk"]]
    print("\n" + "=" * 170 + f"\n2 CALIBRATION on the {len(com):,} main legs with all three chances (bin of each source -> legs, mean, hit)")
    for src in ("hp", "sl", "mk"):
        p = np.array([r[src] for r in com]); h = np.array([r["hit"] for r in com])
        print(f"  {src}:")
        for lo, hi in ((0, .35), (.35, .45), (.45, .5), (.5, .55), (.55, .6), (.6, .65), (.65, .75), (.75, 1.01)):
            k = (p >= lo) & (p < hi)
            if k.sum() >= 20:
                print(f"    {lo:.2f}-{hi:.2f}: {int(k.sum()):5d} legs | mean {p[k].mean():.3f} | hit {h[k].mean():.3f}")
    # ---------------- 3 scores + leave-one-slate-out blends ----------------
    print("\n" + "=" * 170 + "\n3 SCORES (log loss, Brier; lower = better) and BLENDS with weights chosen leave-one-slate-out")
    h = np.array([r["hit"] for r in com], float); sl_ = np.array([r["slate"] for r in com])
    P = {s: np.array([r[s] for r in com]) for s in ("hp", "sl", "mk")}
    for s, p in P.items():
        print(f"  {s}: log loss {ll(p, h):.4f} | Brier {np.mean((p - h) ** 2):.4f}")
    grid = [(a, b, round(1 - a - b, 2)) for a in np.arange(0, 1.01, .1) for b in np.arange(0, 1.01 - a, .1)]
    oos = np.zeros(len(h)); picks = []
    for s in np.unique(sl_):
        tr = sl_ != s
        best = min(grid, key=lambda w: ll(w[0] * P["hp"][tr] + w[1] * P["sl"][tr] + w[2] * P["mk"][tr], h[tr]))
        te = ~tr
        oos[te] = best[0] * P["hp"][te] + best[1] * P["sl"][te] + best[2] * P["mk"][te]
        picks.append((s, best))
    print("  leave-one-slate-out weights (hp, sl, mk): " + "; ".join(f"{s} {w[0]:.1f}/{w[1]:.1f}/{w[2]:.1f}" for s, w in picks))
    print(f"  honest blend: log loss {ll(oos, h):.4f} | Brier {np.mean((oos - h) ** 2):.4f}")
    allw = min(grid, key=lambda w: ll(w[0] * P["hp"] + w[1] * P["sl"] + w[2] * P["mk"], h))
    print(f"  weights on all slates (in-sample, for reference): hp {allw[0]:.1f} sl {allw[1]:.1f} mk {allw[2]:.1f}")
    for r, b in zip(com, oos):
        r["blend"] = b
    # a blend usable on every leg: hp with Sleeper's own (all main legs) - LOSO too
    m2 = [r for r in main if r["hp"] == r["hp"] and r["sl"] == r["sl"]]
    h2 = np.array([r["hit"] for r in m2], float); s2 = np.array([r["slate"] for r in m2])
    hp2 = np.array([r["hp"] for r in m2]); sl2 = np.array([r["sl"] for r in m2])
    oos2 = np.zeros(len(h2)); w2 = []
    for s in np.unique(s2):
        tr = s2 != s
        a = min(np.arange(0, 1.01, .05), key=lambda a: ll(a * hp2[tr] + (1 - a) * sl2[tr], h2[tr]))
        oos2[~tr] = a * hp2[~tr] + (1 - a) * sl2[~tr]; w2.append(round(float(a), 2))
    for r, b in zip(m2, oos2):
        r["hs"] = b
    print(f"  hp + Sleeper blend on {len(m2):,} main legs, LOSO weight on hp {w2}: log loss {ll(oos2, h2):.4f} vs hp {ll(hp2, h2):.4f} vs sl {ll(sl2, h2):.4f}")
    # ---------------- 4 value ----------------
    print("\n" + "=" * 170 + "\n4 SINGLE-PICK VALUE (realised return per pick = m x hit - 1; slate-clustered bootstrap)")
    value_table("hp x m, ALL graded legs with final_hp", [r for r in L if r["hp"] == r["hp"]], "hp")
    value_table("hp x m, MAIN", [r for r in main if r["hp"] == r["hp"]], "hp")
    value_table("hp x m, ALTERNATE", [r for r in alt if r["hp"] == r["hp"]], "hp")
    value_table("sl x m (Sleeper's own fair; main = 1 / (1 + overround) by construction)", [r for r in main if r["sl"] == r["sl"]], "sl")
    value_table("mk x m (market fair at the same line)", [r for r in L if r["mk"] == r["mk"]], "mk")
    value_table("mk x m, MAIN", [r for r in main if r["mk"] == r["mk"]], "mk")
    value_table("mk x m, ALTERNATE", [r for r in alt if r["mk"] == r["mk"]], "mk")
    value_table("honest 3-way blend x m (main legs with all three)", com, "blend")
    value_table("honest hp + Sleeper blend x m (main)", m2, "hs")
    for side in ("Over", "Under"):
        value_table(f"mk x m, side {side}", [r for r in L if r["mk"] == r["mk"] and r["side"] == side], "mk")
        value_table(f"hp x m, side {side}", [r for r in L if r["hp"] == r["hp"] and r["side"] == side], "hp")
    for g in sorted({r["grp"] for r in L if r["grp"]}):
        value_table(f"mk x m, props {g}", [r for r in L if r["mk"] == r["mk"] and r["grp"] == g], "mk", bins=(0, .95, 1.0, 1.05, 99))
    # ---------------- 5 disagreement ----------------
    print("\n" + "=" * 170 + "\n5 MARKET vs SLEEPER (main legs, both fair chances): d = p_mk - p_sl -> return of the Sleeper leg")
    dm = [r for r in main if r["mk"] == r["mk"] and r["sl"] == r["sl"]]
    dd = np.array([r["mk"] - r["sl"] for r in dm]); ret = np.array([r["m"] * r["hit"] - 1 for r in dm]); ss = np.array([r["slate"] for r in dm])
    hh = np.array([r["hit"] for r in dm])
    for lo, hi in ((-1, -.06), (-.06, -.03), (-.03, -.01), (-.01, .01), (.01, .03), (.03, .06), (.06, 1)):
        k = (dd >= lo) & (dd < hi)
        if k.sum() >= 20:
            a, b = boot_ci(ret[k], ss[k])
            print(f"    d {lo:+.2f}..{hi:+.2f}: {int(k.sum()):5d} legs | hit {hh[k].mean():.3f} | return/pick {100 * ret[k].mean():+6.1f}% (90% {100 * a:+.1f} .. {100 * b:+.1f})")
    # ---------------- 6 moves ----------------
    print("\n" + "=" * 170 + "\n6 MOVES: Sleeper multiplier morning -> window and window -> close; Fliff fair morning -> window")
    for lab, a_, b_ in (("Sleeper morning->window", "m_morning", "m"), ("Sleeper window->close", "m", "m_close")):
        mv = [r for r in L if r[a_] == r[a_] and r[b_] == r[b_]]
        x = np.array([math.log(r[b_] / r[a_]) for r in mv]); hh = np.array([r["hit"] for r in mv]); rt = np.array([r["m"] * r["hit"] - 1 for r in mv])
        ss = np.array([r["slate"] for r in mv])
        print(f"  {lab}: {len(mv):,} legs, moved {100 * np.mean(np.abs(x) > 1e-9):.0f}%")
        for nm_, k in (("multiplier DOWN (Sleeper took money / news toward it)", x < -1e-9), ("unchanged", np.abs(x) <= 1e-9), ("multiplier UP", x > 1e-9)):
            if k.sum() >= 20:
                a, b = boot_ci(rt[k], ss[k])
                print(f"    {nm_:<56} {int(k.sum()):6d} legs | hit {hh[k].mean():.3f} | return at the window price {100 * rt[k].mean():+6.1f}% (90% {100 * a:+.1f} .. {100 * b:+.1f})")
    mv = [r for r in L if r["fl_m"] == r["fl_m"] and r["fl_w"] == r["fl_w"]]
    if mv:
        x = np.array([r["fl_w"] - r["fl_m"] for r in mv]); hh = np.array([r["hit"] for r in mv]); rt = np.array([r["m"] * r["hit"] - 1 for r in mv])
        ss = np.array([r["slate"] for r in mv]); smv = np.array([0 if r["m_morning"] != r["m_morning"] else math.log(r["m"] / r["m_morning"]) for r in mv])
        print(f"  Fliff fair chance morning -> window on the same leg ({len(mv):,} legs):")
        for nm_, k in (("Fliff moved TOWARD the leg >= 2 pts", x >= .02), ("Fliff moved toward, Sleeper multiplier not cut (stale)", (x >= .02) & (smv >= -1e-9)),
                       ("Fliff flat (< 2 pts)", np.abs(x) < .02), ("Fliff moved AWAY >= 2 pts", x <= -.02)):
            if k.sum() >= 20:
                a, b = boot_ci(rt[k], ss[k])
                print(f"    {nm_:<56} {int(k.sum()):6d} legs | hit {hh[k].mean():.3f} | return {100 * rt[k].mean():+6.1f}% (90% {100 * a:+.1f} .. {100 * b:+.1f})")
    # ---------------- 7 line shopping ----------------
    print("\n" + "=" * 170 + "\n7 SLEEPER MAIN LINE vs the MARKET's main line (gap > 0 = Sleeper's line is easier for this side)")
    lg = [r for r in main if r["line_gap"] == r["line_gap"]]
    g = np.array([r["line_gap"] for r in lg]); rt = np.array([r["m"] * r["hit"] - 1 for r in lg]); hh = np.array([r["hit"] for r in lg])
    ss = np.array([r["slate"] for r in lg]); mm = np.array([r["m"] for r in lg])
    for lo, hi in ((-99, -1.5), (-1.5, -.25), (-.25, .25), (.25, 1.5), (1.5, 99)):
        k = (g > lo) & (g <= hi)
        if k.sum() >= 20:
            a, b = boot_ci(rt[k], ss[k])
            print(f"    gap {lo:+.2f}..{hi:+.2f}: {int(k.sum()):5d} legs | hit {hh[k].mean():.3f} | mean m {mm[k].mean():.2f} | return {100 * rt[k].mean():+6.1f}% "
                  f"(90% {100 * a:+.1f} .. {100 * b:+.1f})")
    # ---------------- 8 slips on the real slates ----------------
    print("\n" + "=" * 170 + "\n8 SLIPS ON THE REAL SLATES (one slip a rule a slate; one pick per game, distinct players, >= 2 teams not checked)")
    rules = []
    for src in ("hp", "mk", "hs"):
        for gate in (None, 1.00, 1.03, 1.06, 1.10):
            for side in ("both", "Over", "Under"):
                for kind in ("main", "alt", "all"):
                    for rank in ("p", "ev"):
                        rules.append((src, gate, side, kind, rank))
    sizes = (2, 3, 4, 5, 6)
    res = defaultdict(list)
    by_slate = defaultdict(list)
    for r in L:
        by_slate[r["slate"]].append(r)
    for s, legs_s in sorted(by_slate.items()):
        for rule in rules:
            src, gate, side, kind, rank = rule
            c = [r for r in legs_s if r.get(src, np.nan) == r.get(src, np.nan) and (side == "both" or r["side"] == side) and (kind == "all" or r["kind"] == kind)
                 and (gate is None or r[src] * r["m"] >= gate)]
            c.sort(key=(lambda r: -r[src]) if rank == "p" else (lambda r: -r[src] * r["m"]))
            pick, pl, gm = [], set(), set()
            for r in c:
                if r["player"] in pl or r["event_id"] in gm:
                    continue
                pick.append(r); pl.add(r["player"]); gm.add(r["event_id"])
                if len(pick) == max(sizes):
                    break
            for n in sizes:
                if len(pick) >= n:
                    for mode in ("max", "flex"):
                        if mode == "flex" and n < 3:
                            continue
                        sp = pick[:n]
                        res[(rule, n, mode)].append(sleeper_pay([r["m"] for r in sp], [bool(r["hit"]) for r in sp], mode) - 1.0)
    out = []
    for key, v in res.items():
        if len(v) >= 3:
            out.append((float(np.mean(v)), len(v), float(np.mean(np.array(v) > 0)), key))
    out.sort(key=lambda x: -x[0])
    print(f"  {len(out):,} rule x size x mode cells with >= 3 slates; ROI over {len(by_slate)} slates (TINY sample - a sanity read, not a selection):")
    for roi, n, won, (rule, sz, mode) in out[:25]:
        src, gate, side, kind, rank = rule
        print(f"    {src}-gate{gate}-{side}-{kind}-by {rank} {sz}-pick {mode}: {n} slips | ROI {100 * roi:+.0f}% | won {100 * won:.0f}%")
    for src in ("hp", "mk", "hs"):
        v = [x for x in out if x[3][0][0] == src]
        if v:
            print(f"  source {src}: {len(v)} cells, median ROI {100 * np.median([x[0] for x in v]):+.0f}%, share positive {100 * np.mean([x[0] > 0 for x in v]):.0f}%")
    log("done")


if __name__ == "__main__":
    main()
