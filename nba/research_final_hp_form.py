#!/usr/bin/env python3
"""
RESEARCH - RECENT FORM vs THE LINE (+ THE LINE GAP) AS A LAYER OF final_hp, AND WHAT IT DOES TO EVERY STRUCTURE (2026-10-23;
research_board_types_r2 run 40004208892: the two factors that held both ways both cross the player's LAST-5 AVERAGE vs THE LINE - last-5
above the line -> More hits ~2-3 points BELOW final_hp, below the line -> ~2.5-3 ABOVE, points and combos, both seasons: final_hp gives
recent form too much credit). READ-ONLY. Same data and slip machinery as research_final_hp_linegap.py.

FORM  xf = clip((last-5 average of the stat - line) / max(line, 0.5), -1, 1) * dir (dir +1 More / -1 Less), from the player's games
      BEFORE the day (nba_stats.player_game_log).
GAP   xg = (books' WINDOW median main line - PrizePicks L0) / sqrt(max(L0, 1)) * dir (research_final_hp_linegap; window label only).
LAYERS (each fitted on one season, applied to the other): logit p' = logit p + b[side x lt] + sum_k a_k[group x lt] * x_k, for
      GAP, FORM, FORM+GAP. Reported: log-loss vs the same baseline without the layer (day-clustered z), calibration, and every calibrated
      structure + the live pair rebuilt on p' (ranked on p' instead of final_hp), both seasons, ROI / lb5 / days in profit.
Env: DATABASE_URL, LG_BOOT (500).
"""
import math
import os
import sys
import time
from bisect import bisect_left
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import calib_slips as CS                             # noqa: E402
import research_board_types as BT                    # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
import research_pp_flex234 as F                      # noqa: E402
import research_pp_board_profiles_v3 as V3           # noqa: E402

SEASONS = ("2024-25", "2025-26")
PROPS = BT.PROPS
GROUP = BT.GROUP
DFS = ("prizepicks", "underdog", "betr_us_dfs", "pick6", "sleeper", "dabble", "fliff")
T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def day_z(vals, days):
    s = pd.Series(vals).groupby(np.asarray(days)).agg(["sum", "count"])
    mu = float(np.mean(vals))
    D = len(s)
    se = math.sqrt(((s["sum"] - s["count"] * mu) ** 2).sum() * D / max(D - 1, 1)) / len(vals)
    return mu, (mu / se if se > 0 else 0.0), D


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = RC.load(conn)
    by_season = {s: sorted(d for (ss, d) in days if ss == s) for s in SEASONS}
    d0 = min(d for (_, d) in days)
    d1 = max(d for (_, d) in days)
    log(f"slates {', '.join(f'{s} {len(v)}' for s, v in by_season.items())}")

    # player ids for the board legs (prop_universe via research_board_types.load_legs) and their game logs
    bt = BT.load_legs(conn)
    pid_of = {}
    for d, nm, pr, pid in zip(bt.d, bt.nm, bt.prop, bt.pid):
        if pid == pid:
            pid_of[(d, nm, pr)] = int(pid)
    del bt
    pl, _ = BT.player_logs(conn)
    pdates = {p: [x["d"] for x in v] for p, v in pl.items()}

    bk = defaultdict(list)
    for gd, player, mk, book, nl, line in conn.execute("""
            SELECT game_date, player, market_key, bookmaker, count(DISTINCT line), min(line)::float8
            FROM nba_market.board_snapshots
            WHERE snapshot_label = 'window' AND game_date BETWEEN %s AND %s AND market_key = ANY(%s) AND line IS NOT NULL
              AND bookmaker <> ALL(%s)
            GROUP BY 1, 2, 3, 4""", (d0, d1, list(BT.MARKET_PROP), list(DFS))):
        if nl == 1:
            bk[(gd, F.norm(player), BT.MARKET_PROP[mk])].append(line)
    books = {k: float(np.median(v)) for k, v in bk.items()}
    log(f"books window main lines: {len(books):,}")

    rows = []
    for (s, d), legs in days.items():
        std = {}
        for l in legs:
            if l["tier"] == "R" and l["prop"] in PROPS:
                std[(F.norm(l["player"]), l["prop"])] = float(l["line"])
        for l in legs:
            if l["prop"] not in PROPS or l["p"] is None or l["hit"] is None:
                continue
            nm = F.norm(l["player"])
            L0 = std.get((nm, l["prop"]))
            b = books.get((d, nm, l["prop"]))
            dr = 1.0 if l["side"] == "Over" else -1.0
            xg = 0.0 if (L0 is None or b is None) else dr * (b - L0) / math.sqrt(max(L0, 1.0))
            xf = 0.0
            pid = pid_of.get((d, nm, l["prop"]))
            if pid is not None and pid in pl:
                i = bisect_left(pdates[pid], d)
                h = pl[pid][max(0, i - 5):i]
                if len(h) >= 5:
                    m = np.mean([sum(x[k] for k in BT.STAT[l["prop"]]) for x in h])
                    xf = dr * float(np.clip((m - float(l["line"])) / max(float(l["line"]), 0.5), -1, 1))
            rows.append((s, d, GROUP[l["prop"]], l["side"], l["tier"][0], float(l["p"]), int(l["hit"]), xg, xf, id(l)))
    df = pd.DataFrame(rows, columns=["season", "d", "grp", "side", "lt", "p", "hit", "xg", "xf", "lid"])
    log(f"graded legs {len(df):,}; with form {int((df.xf != 0).sum()):,}; with a books gap {int((df.xg != 0).sum()):,}")

    df["sl"] = df.side.str[0] + df["lt"]
    z0 = logit(df.p.values)
    y = df.hit.values.astype(float)
    sl_codes, sl_u = pd.factorize(df.sl)
    gl_codes, gl_u = pd.factorize(df.grp + "|" + df["lt"])
    seas = df.season.values
    X = {"GAP": [df.xg.values], "FORM": [df.xf.values], "FORM+GAP": [df.xf.values, df.xg.values]}

    def fit(mask, xs):
        b = np.zeros(len(sl_u))
        A = [np.zeros(len(gl_u)) for _ in xs]
        for _ in range(12):
            def lin():
                return z0[mask] + b[sl_codes[mask]] + sum(a[gl_codes[mask]] * x[mask] for a, x in zip(A, xs))
            q = sig(lin())
            b += np.bincount(sl_codes[mask], weights=y[mask] - q, minlength=len(sl_u)) / \
                np.maximum(np.bincount(sl_codes[mask], weights=q * (1 - q), minlength=len(sl_u)), 1e-9)
            for a, x in zip(A, xs):
                q = sig(lin())
                a += np.bincount(gl_codes[mask], weights=(y[mask] - q) * x[mask], minlength=len(gl_u)) / \
                    (np.bincount(gl_codes[mask], weights=q * (1 - q) * x[mask] ** 2, minlength=len(gl_u)) + 50.0)
        return b, A
    padj = {}
    print("\n" + "=" * 190 + "\nB. LAYERS, CROSS-FITTED (log-loss vs the same side x line type baseline without the layer; day-clustered z)")
    for name, xs in X.items():
        pa = np.full(len(df), np.nan)
        for fit_s, app_s in (SEASONS, SEASONS[::-1]):
            mf, ma = seas == fit_s, seas == app_s
            b, A = fit(mf, xs)
            print(f"  {name:<9} fitted on {fit_s}: " + " ; ".join(
                f"slopes x{k}: " + ", ".join(f"{gl_u[i]} {A[k][i]:+.2f}" for i in np.argsort(gl_u)) for k in range(len(A))))
            zb = z0 + b[sl_codes]
            add = sum(a[gl_codes] * x for a, x in zip(A, xs))
            p_base = np.clip(sig(zb[ma]), 1e-4, 1 - 1e-4)
            p_new = np.clip(sig(zb[ma] + add[ma]), 1e-4, 1 - 1e-4)
            pa[ma] = np.clip(sig(z0[ma] + add[ma]), 1e-4, 1 - 1e-4)
            yy = y[ma]
            dl = -(yy * np.log(p_new) + (1 - yy) * np.log(1 - p_new)) + (yy * np.log(p_base) + (1 - yy) * np.log(1 - p_base))
            mu, z, D = day_z(dl, df.d.values[ma])
            print(f"    applied to {app_s}: log-loss change {mu:+.6f} (z {z:+.1f}, {D} days)")
            for lo, hi in ((0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75), (0.75, 1.01)):
                mo = (df.p.values[ma] >= lo) & (df.p.values[ma] < hi)
                mn = (pa[ma] >= lo) & (pa[ma] < hi)
                print(f"      p in [{lo:.2f},{hi:.2f}): final_hp n {int(mo.sum()):>7,} hit {yy[mo].mean() if mo.any() else float('nan'):.3f} | "
                      f"layer n {int(mn.sum()):>7,} hit {yy[mn].mean() if mn.any() else float('nan'):.3f} "
                      f"(mean p {pa[ma][mn].mean() if mn.any() else float('nan'):.3f})")
        padj[name] = {lid: float(v) for lid, v in zip(df.lid.values, pa)}

    # ---------------- C: every calibrated structure + the live pair on each layer ----------------
    UNITS = [u for u in V3.UNITS if u[0] == "calib"]
    REB4F, CAL3P = V3.REB4F, V3.CAL3P
    reb = defaultdict(list)
    for season, d, k, legs, sg in conn.execute(
            """SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips_wo
               WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7' ORDER BY game_date, k""",
            (REB4F[1], REB4F[2], REB4F[3], V3.KMAX)):
        if season in SEASONS and (season, d) in days:
            reb[(season, d)].append((legs, bool(sg and sg > 0)))

    def grade(slip, structure, sg=None):
        sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in slip]
        return SE.grade(sl, structure, same_game=sg)[1] - 1.0

    def pool_for(s, d, variant):
        out = []
        for l in days[(s, d)]:
            if l["prop"] in PROPS and l["p"] is not None:
                q = l["p"] if variant == "BASE" else padj[variant].get(id(l))
                if q is None or q != q:
                    q = l["p"]
                out.append(dict(l, p=float(q)))
        return out
    variants = ["BASE"] + list(X)
    print("\n" + "=" * 190 + "\nC. EVERY CALIBRATED STRUCTURE (k = 1 slip a day) - ROI % (days, lb5) per variant")
    for u in UNITS:
        line = []
        for s in SEASONS:
            parts = []
            for v in variants:
                pr, st = [], []
                for d in by_season[s]:
                    sl_ = CS.unit_slips(pool_for(s, d, v), u[1], u[2], 1)
                    if sl_:
                        pr.append(grade(sl_[0], u[3])); st.append(1)
                parts.append(f"{v} {100 * sum(pr) / max(len(pr), 1):+6.1f}% ({len(pr)}d, lb5 {100 * V3.lb5(pr, st):+5.1f})")
            line.append(f"{s[2:]}: " + " | ".join(parts))
        print(f"  {V3.tag(u):<22} " + "  ||  ".join(line))
    print("\n  LIVE PAIR (rebounds 4-Flex + calib R 0.70 3-Power; n 2, leg cap 2):")
    for s in SEASONS:
        parts = []
        for v in variants:
            pr, st = [], []
            for d in by_season[s]:
                c3 = CS.unit_slips(pool_for(s, d, v), CAL3P[1], CAL3P[2], V3.KMAX)
                r4 = reb.get((s, d), [])
                taken, use_, seen = [], defaultdict(int), set()
                for k in range(V3.KMAX):
                    for kind, lst in (("r4", r4), ("c3", c3)):
                        if k >= len(lst) or len(taken) >= 2:
                            continue
                        slip, sg = (lst[k] if kind == "r4" else (lst[k], None))
                        keys = list(dict.fromkeys(V3.legkey(x) for x in slip))
                        sgn = (kind, tuple(sorted(map(str, keys))))
                        if sgn in seen or any(use_[x] >= 2 for x in keys):
                            continue
                        seen.add(sgn)
                        for x in keys:
                            use_[x] += 1
                        taken.append(grade(slip, "flex" if kind == "r4" else "power", sg))
                    if len(taken) >= 2:
                        break
                if taken:
                    pr.append(sum(taken)); st.append(len(taken))
            parts.append(f"{v} net {sum(pr):+6.1f} ROI {100 * sum(pr) / max(sum(st), 1):+5.1f}% lb5 {100 * V3.lb5(pr, st):+5.1f}% "
                         f"days+ {100 * np.mean([x > 0 for x in pr]):.0f}%")
        print(f"    {s}: " + " | ".join(parts))
    log("done")


if __name__ == "__main__":
    main()
