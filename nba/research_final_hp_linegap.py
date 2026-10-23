#!/usr/bin/env python3
"""
RESEARCH - THE LINE GAP: PRIZEPICKS' STANDARD LINE vs THE BOOKS' CONSENSUS, AS A LAYER OF final_hp, AND WHAT IT DOES TO EVERY STRUCTURE
(2026-10-23; research_board_types run 39998306774: of ~100 pre-pick factors only mkt_pp_vs_books held both ways - PrizePicks' line 1+
below the books -> Over hits ~5-7 points above final_hp, 1+ above -> Under ~4-6 above; 150+ days a season, 63-73% same-sign days).
READ-ONLY.

WHY final_hp MISSES IT: the board-centred chain (final_hp_board_cal) centres the ladder on L0 = PrizePicks' own main line whenever
PrizePicks has one; the books' consensus enters only when PrizePicks has no line. When PrizePicks is off the market, final_hp
inherits PrizePicks' error.

NO LOOK-AHEAD: board_snapshots carries 'window' (the pick) and 'close' (tip) labels; round 1 read every label. Here the books' line is
the WINDOW snapshot only: per book, its window snapshot with exactly one main line (a book listing a ladder in its main market is
left out, as final_hp_board_cal.STD_LINE_SQL), the median across the non-DFS books. PrizePicks' L0 = the leg's standard (R) line of
the day. gap = books median - PrizePicks L0 (positive = the books sit higher = More is cheap on PrizePicks).
A  residual (hit - final_hp, relative to the season's side x line type baseline) by gap bin x side x line type, day-clustered.
B  the layer: logit p' = logit p + b[side x lt] + a[group x lt] * dir * g, g = gap / sqrt(max(L0, 1)), dir = +1 More / -1 Less;
   fitted on one season, applied to the other (both directions): log-loss change (day-clustered z) and calibration by decile.
C  every calibrated structure (calib R 0.60: 2P, 3P, 3F, 4P, 4F, 5P, 5F, 6P, 6F; the live calib R 0.70 3P; the GR ev 0.55 family)
   rebuilt from the same pool ranked on p (cross-fitted) instead of final_hp: ROI, lb5, days in profit, both seasons; and the live
   pair (rebounds 4-Flex + calibrated 3-Power).
Env: DATABASE_URL, LG_BOOT (500).
"""
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import calib_slips as CS                             # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
import research_pp_flex234 as F                      # noqa: E402
import research_pp_board_profiles_v3 as V3           # noqa: E402

SEASONS = ("2024-25", "2025-26")
PROPS = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "stocks", "pra", "pts_reb", "pts_ast", "reb_ast")
GROUP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
         "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
MARKET_PROP = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made",
               "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers", "player_blocks_steals": "stocks",
               "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast",
               "player_rebounds_assists": "reb_ast"}
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
    """mean of vals and its day-clustered z"""
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

    # books' WINDOW main line per (date, player, prop): median across non-DFS books with one line in their window snapshot
    bk = defaultdict(list)
    for gd, player, mk, book, nl, line in conn.execute("""
            SELECT game_date, player, market_key, bookmaker, count(DISTINCT line), min(line)::float8
            FROM nba_market.board_snapshots
            WHERE snapshot_label = 'window' AND game_date BETWEEN %s AND %s AND market_key = ANY(%s) AND line IS NOT NULL
              AND bookmaker <> ALL(%s)
            GROUP BY 1, 2, 3, 4""", (d0, d1, list(MARKET_PROP), list(DFS))):
        if nl == 1:
            bk[(gd, F.norm(player), MARKET_PROP[mk])].append(line)
    books = {k: float(np.median(v)) for k, v in bk.items()}
    log(f"books window main lines: {len(books):,} player-props")

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
            gap = (b - L0) if (L0 is not None and b is not None) else None
            l["_gap"] = gap
            l["_L0"] = L0
            rows.append((s, d, GROUP[l["prop"]], l["side"], l["tier"][0], float(l["p"]), int(l["hit"]), gap, L0, id(l)))
    df = pd.DataFrame(rows, columns=["season", "d", "grp", "side", "lt", "p", "hit", "gap", "L0", "lid"])
    df["has"] = df.gap.notna()
    log(f"graded legs {len(df):,}; with a books line {int(df.has.sum()):,} ({100 * df.has.mean():.1f}%)")

    # ---------------- A: residual by gap bin (window-only books) ----------------
    df["sl"] = df.side.str[0] + df["lt"]
    df["res"] = df.hit - df.p
    df["res_b"] = df.res - df.groupby(["season", "sl"]).res.transform("mean")

    def gbin(g):
        if g is None or g != g:
            return None
        return "<=-1.5" if g <= -1.5 else "-1" if g <= -0.75 else "-0.5" if g <= -0.25 else "0" if g < 0.25 else \
            "+0.5" if g < 0.75 else "+1" if g < 1.25 else ">=+1.5"
    df["gb"] = [gbin(g) for g in df.gap]
    print("\n" + "=" * 190 + "\nA. RESIDUAL (relative to the season's side x line type baseline) BY GAP = books window median - PrizePicks L0; "
          "day-clustered z")
    order = ["<=-1.5", "-1", "-0.5", "0", "+0.5", "+1", ">=+1.5"]
    for sl in ("OR", "UR", "OG", "UG", "OD", "UD"):
        for s in SEASONS:
            m = (df.season == s) & (df.sl == sl) & df.gb.notna()
            parts = []
            for b in order:
                mm = m & (df.gb == b)
                if mm.sum() >= 200:
                    mu, z, D = day_z(df.res_b[mm].values, df.d[mm].values)
                    parts.append(f"{b} {mu:+.3f}(z{z:+.1f},n{int(mm.sum())})")
            print(f"  {sl} {s}: " + "  ".join(parts))

    # ---------------- B: the layer, cross-fitted ----------------
    df["g"] = [0.0 if (g is None or g != g) else g / math.sqrt(max(L0, 1.0)) for g, L0 in zip(df.gap, df.L0)]
    df["dir"] = np.where(df.side == "Over", 1.0, -1.0)
    z0 = logit(df.p.values)
    y = df.hit.values.astype(float)
    sl_codes, sl_u = pd.factorize(df.sl)
    gl_codes, gl_u = pd.factorize(df.grp + "|" + df["lt"])
    x = (df.dir * df.g).values

    def fit(mask):
        """baseline b[side x lt] + slope a[group x lt] on x - Newton on the joint log-likelihood (diagonal approximation, 12 rounds)"""
        b = np.zeros(len(sl_u))
        a = np.zeros(len(gl_u))
        for _ in range(12):
            q = sig(z0[mask] + b[sl_codes[mask]] + a[gl_codes[mask]] * x[mask])
            r = y[mask] - q
            w = q * (1 - q)
            gb_ = np.bincount(sl_codes[mask], weights=r, minlength=len(sl_u))
            hb = np.bincount(sl_codes[mask], weights=w, minlength=len(sl_u))
            b += gb_ / np.maximum(hb, 1e-9)
            q = sig(z0[mask] + b[sl_codes[mask]] + a[gl_codes[mask]] * x[mask])
            r = y[mask] - q
            w = q * (1 - q)
            ga = np.bincount(gl_codes[mask], weights=r * x[mask], minlength=len(gl_u))
            ha = np.bincount(gl_codes[mask], weights=w * x[mask] ** 2, minlength=len(gl_u))
            a += ga / np.maximum(ha + 50.0, 1e-9)      # light ridge on the slopes
        return b, a
    padj = np.full(len(df), np.nan)
    print("\n" + "=" * 190 + "\nB. THE LINE-GAP LAYER, CROSS-FITTED (slopes a per group x line type; log-loss vs the same baseline without "
          "the gap; day-clustered z)")
    seas = df.season.values
    for fit_s, app_s in (SEASONS, SEASONS[::-1]):
        mf = seas == fit_s
        ma = seas == app_s
        b, a = fit(mf)
        print(f"  fitted on {fit_s}: slopes " + ", ".join(f"{gl_u[i]} {a[i]:+.2f}" for i in np.argsort(gl_u)))
        zb = z0 + b[sl_codes]
        p_base = np.clip(sig(zb[ma]), 1e-4, 1 - 1e-4)
        p_new = np.clip(sig(zb[ma] + a[gl_codes[ma]] * x[ma]), 1e-4, 1 - 1e-4)
        padj[ma] = np.clip(sig(z0[ma] + a[gl_codes[ma]] * x[ma]), 1e-4, 1 - 1e-4)   # the layer alone on final_hp (no baseline)
        yy = y[ma]
        dl = -(yy * np.log(p_new) + (1 - yy) * np.log(1 - p_new)) + (yy * np.log(p_base) + (1 - yy) * np.log(1 - p_base))
        mu, z, D = day_z(dl, df.d.values[ma])
        has = df.has.values[ma]
        mu2, z2, _ = day_z(dl[has], df.d.values[ma][has])
        print(f"    applied to {app_s}: log-loss change {mu:+.6f} (z {z:+.1f}, {D} days); on legs with a books line {mu2:+.6f} (z {z2:+.1f})")
        for lo, hi in ((0.0, 0.5), (0.5, 0.55), (0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75), (0.75, 1.01)):
            mo = (df.p.values[ma] >= lo) & (df.p.values[ma] < hi)
            mn = (padj[ma] >= lo) & (padj[ma] < hi)
            print(f"      p in [{lo:.2f},{hi:.2f}): final_hp n {int(mo.sum()):>7,} hit {yy[mo].mean() if mo.any() else float('nan'):.3f} | "
                  f"with the layer n {int(mn.sum()):>7,} hit {yy[mn].mean() if mn.any() else float('nan'):.3f} "
                  f"(mean p {padj[ma][mn].mean() if mn.any() else float('nan'):.3f})")
    pnew = {lid: float(v) for lid, v in zip(df.lid.values, padj)}

    # ---------------- C: every calibrated structure on the layered p ----------------
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
    print("\n" + "=" * 190 + "\nC. EVERY CALIBRATED STRUCTURE: k = 1 slip a day, pool ranked on final_hp (BASE) vs final_hp + the cross-fitted "
          "line-gap layer (GAP)")
    for u in UNITS:
        out = []
        for s in SEASONS:
            res = {}
            for tag_, use in (("BASE", False), ("GAP", True)):
                pr, st = [], []
                for d in by_season[s]:
                    legs = days[(s, d)]
                    pool = []
                    for l in legs:
                        if l["prop"] in PROPS and l["p"] is not None:
                            q = pnew.get(id(l)) if use else l["p"]
                            if q is None or q != q:
                                q = l["p"]
                            pool.append(dict(l, p=float(q)))
                    sl_ = CS.unit_slips(pool, u[1], u[2], 1)
                    if sl_:
                        pr.append(grade(sl_[0], u[3])); st.append(1)
                res[tag_] = (sum(pr), len(pr), V3.lb5(pr, st), np.mean([v > 0 for v in pr]) if pr else float("nan"))
            out.append(f"{s[2:]} BASE {100 * res['BASE'][0] / max(res['BASE'][1], 1):+6.1f}% ({res['BASE'][1]}d, lb5 "
                       f"{100 * res['BASE'][2]:+5.1f}) -> GAP {100 * res['GAP'][0] / max(res['GAP'][1], 1):+6.1f}% ({res['GAP'][1]}d, lb5 "
                       f"{100 * res['GAP'][2]:+5.1f}, days+ {100 * res['GAP'][3]:.0f}%)")
        print(f"  {V3.tag(u):<26} " + " | ".join(out))

    # the live pair (rebounds 4-Flex from its slip table + the calibrated 3-Power), round robin n 2, leg cap 2
    print("\n  LIVE PAIR (rebounds 4-Flex + calib R 0.70 3-Power; n 2, leg cap 2):")
    for s in SEASONS:
        line = []
        for tag_, use in (("BASE", False), ("GAP", True)):
            pr, st = [], []
            for d in by_season[s]:
                legs = days[(s, d)]
                pool = []
                for l in legs:
                    if l["prop"] in PROPS and l["p"] is not None:
                        q = pnew.get(id(l)) if use else l["p"]
                        if q is None or q != q:
                            q = l["p"]
                        pool.append(dict(l, p=float(q)))
                c3 = CS.unit_slips(pool, CAL3P[1], CAL3P[2], V3.KMAX)
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
            line.append(f"{tag_} net {sum(pr):+6.1f} ROI {100 * sum(pr) / max(sum(st), 1):+5.1f}% lb5 {100 * V3.lb5(pr, st):+5.1f}% "
                        f"slips {sum(st)} days+ {100 * np.mean([v > 0 for v in pr]):.0f}%")
        print(f"    {s}: " + " | ".join(line))
    log("done")


if __name__ == "__main__":
    main()
