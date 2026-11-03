#!/usr/bin/env python3
"""RESEARCH - PRIZEPICKS DEEP REVIEW (2026-11-02, owner 20:13 PT: "do a deep review on PrizePicks, find better strategies ...
improvements or anything that can make it get better results"). READ-ONLY.

Every slate of 2024-25, 2025-26 (final 7 days out) and this season so far, on the LIVE ENGINE'S OWN BOARD
(live_slip_engine.load_board_legs_live, window label: the 12 calibrated props, final_hp = the board-centred number the engine ranks
on), graded on the box score (a DNP or a push is void).
  PART A  CALIBRATION of final_hp per period x line type (R / goblin / demon) x prop group (low-volume / main) x side: bins, hit,
          logistic slope / intercept (slope < 1 = over-confident). Does this season's real board behave like history?
  PART B  THE MARKET: the books' no-vig (8 books' window board, main markets) for the same side - at PrizePicks' exact line (E), or
          only at another line of the same player-prop (N: the books' main line, with the gap in lines), or none (X). Coverage per
          class. p_hat = logistic fitted per class OUT OF SAMPLE (2024-25 <- 2025-26, 2025-26 <- 2024-25, this season <- both):
            E: logit fh, logit nv, Under, goblin, demon, lowvol, lowvol x logit fh, lowvol x logit nv
            N: logit fh, logit nv(main), gap (lines toward the pick / sqrt(main + 1)), Under, goblin, demon, lowvol, lowvol x logit fh
            X: logit fh, Under, goblin, demon, lowvol, lowvol x logit fh
          log-loss / Brier final_hp vs p_hat per period and class; hit rate of the top 50 / 200 legs a slate by each.
  PART C  PORTFOLIO B AS LIVE (portfolio_b.py, the live builder, trailing cells fed slate by slate, void legs unknown in advance)
          with p = final_hp (today) and p = p_hat: each unit and the six together, per period.
  PART D  THE GRID on both numbers: pools R / R+goblin / R+demon / all x More / Less / both x props all / low-volume / main x rank
          (chance, chance x factor, trailing cell, blend) x floor 0 / .55 / .60 / .65 / .70 / .75 x game cap 1 / 2 x skip 0 / 1 x
          Power 2-6 and Flex 3-6. Per structure: the best in both seasons, WALK-FORWARD (top 1 / top 5 / top 10 chosen on one season,
          played on the other) and this season's real board for what was chosen.
Payouts: build_slip_engine grader v3 (the live grader). Env: DATABASE_URL, DR_SMOKE (1 = every 6th history slate), DR_MINN (40).
"""
import datetime as dt
import itertools
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
import ud_portfolio_c as UPC                         # noqa: E402  (the books' consensus, == research_sleeper_transfer.consensus)
from final_hp_board_cal import PROPS as CAL_PROPS    # noqa: E402

T0 = time.time()
PERIODS = ("2024-25", "2025-26", "2026-27")
MINN = int(os.environ.get("DR_MINN") or 40)
STRUCTS = [(n, "power") for n in (2, 3, 4, 5, 6)] + [(n, "flex") for n in (3, 4, 5, 6)]
MAXSZ = 6
GPOOL = {"R": ("R",), "RG": ("R", "G1", "G2", "G3"), "RD": ("R", "D1", "D2", "D3"), "ALL": ("R", "G1", "G2", "G3", "D1", "D2", "D3")}
GSIDE = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
GPROPS = {"all": None, "lowvol": {"lowvol"}, "main": {"points", "rebounds", "assists", "threes", "combos"}}
RANKS = ("p", "ev", "trail", "blend")
FLOORS = (0.0, 0.55, 0.60, 0.65, 0.70, 0.75)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lg(x):
    x = min(max(float(x), 1e-4), 1 - 1e-4)
    return math.log(x / (1 - x))


def fit(X, y, iters=50):
    X = np.column_stack([np.ones(len(y)), X])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-9
        step = np.linalg.solve(X.T @ (X * w[:, None]) + 1e-6 * np.eye(X.shape[1]), X.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def kind(t):
    return "R" if t == "R" else "G" if str(t).startswith("G") else "D"


def feats(l, cls):
    lf = lg(l["fh"]); u = 1.0 if l["side"] == "Under" else 0.0
    g = 1.0 if l["k"] == "G" else 0.0; d = 1.0 if l["k"] == "D" else 0.0; lv = 1.0 if l["_grp"] == "lowvol" else 0.0
    if cls == "E":
        ln = lg(l["nv"]); return [lf, ln, u, g, d, lv, lv * lf, lv * ln]
    if cls == "N":
        ln = lg(l["nv"]); return [lf, ln, l["gap"], u, g, d, lv, lv * lf]
    return [lf, u, g, d, lv, lv * lf]


def load(conn):
    days = AF.slate_days(conn)
    use = []
    for d in days:
        s = AF.season_of(d)
        if s in PERIODS:
            use.append((s, d))
    if os.environ.get("DR_SMOKE") == "1":
        use = [x for i, x in enumerate(use) if x[0] == "2026-27" or i % 6 == 0]
    out = []
    for i, (s, d) in enumerate(use):
        rows = L.load_board_legs_live(conn, d)
        legs = [l for l in rows if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None
                and l["prop"] in CAL_PROPS and l.get("team_id") is not None]
        if not legs:
            continue
        st = AF.box(conn, d)
        if not st:
            continue
        fair, main = consensus_main(conn, d)
        keep = []
        for l in legs:
            h = AF.outcome(st, l)
            x = {"player": l["player"], "player_id": str(l["player_id"]), "prop": l["prop"], "tier": l["tier"], "k": kind(l["tier"]),
                 "side": l["side"], "line": float(l["line"]), "factor": float(l["factor"] or 1.0), "fh": float(l["score"]), "hit": h,
                 "team_id": l["team_id"], "event_id": l["event_id"], "_grp": PB.GRP.get(l["prop"])}
            po = fair.get((x["player_id"], x["prop"], x["line"]))
            if po is not None and 0.03 < po < 0.97:
                x["cls"], x["nv"], x["gap"] = "E", (po if x["side"] == "Over" else 1 - po), 0.0
            else:
                ml = main.get((x["player_id"], x["prop"]))
                mo = fair.get((x["player_id"], x["prop"], ml)) if ml is not None else None
                if mo is not None and 0.03 < mo < 0.97:
                    toward = (ml - x["line"]) if x["side"] == "Over" else (x["line"] - ml)    # > 0: PrizePicks' line is easier
                    x["cls"], x["nv"], x["gap"] = "N", (mo if x["side"] == "Over" else 1 - mo), toward / math.sqrt(abs(ml) + 1)
                else:
                    x["cls"], x["nv"], x["gap"] = "X", None, 0.0
            keep.append(x)
        keep.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"], l["tier"]))
        out.append((s, d, keep))
        if i % 25 == 0:
            log(f"loaded {i + 1}/{len(use)} {d}: {len(keep)} legs ({sum(1 for l in keep if l['cls'] == 'E')} E, "
                f"{sum(1 for l in keep if l['cls'] == 'N')} N)")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


def consensus_main(conn, d):
    """the books' fair Over chance per (pid, prop, line) and the main line per (pid, prop) (the line most books price, nearest 50/50)"""
    fair = UPC.consensus(conn, d)
    q = defaultdict(list)
    for (pid, prop, line), p in fair.items():
        q[(pid, prop)].append((abs(p - 0.5), line))
    return fair, {k: min(v)[1] for k, v in q.items()}


def calib_table(name, legs, key):
    bins = [0, .45, .50, .55, .58, .60, .62, .65, .70, .75, .80, 1.01]
    x = np.array([l[key] for l in legs]); y = np.array([l["hit"] for l in legs], float)
    if len(x) < 300:
        return
    b = fit(np.array([[lg(v)] for v in x]), y)
    parts = []
    for lo, hi in zip(bins, bins[1:]):
        m = (x >= lo) & (x < hi)
        if m.sum() >= 100:
            parts.append(f"{lo:.2f}-{hi:.2f} n{int(m.sum())} {x[m].mean():.3f}->{y[m].mean():.3f}")
    print(f"    {name:<44} n {len(x):7,d} mean {x.mean():.3f} hit {y.mean():.3f} | slope {b[1]:.2f} icpt {b[0]:+.2f} | " + " ; ".join(parts), flush=True)


def ll(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def pick_list(cand, gc):
    pick, players, games = [], set(), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == MAXSZ:
            break
    return pick


def grade(pick, st):
    return SE.grade([{"hit": l["hit"], "factor": l["factor"], "event_id": l["event_id"]} for l in pick], st)[1]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    slates = load(conn)
    conn.close()
    log("slates: " + ", ".join(f"{s} {sum(1 for x in slates if x[0] == s)}" for s in PERIODS))

    # ---------------- PART A ----------------
    print("\n" + "=" * 170 + "\nPART A - CALIBRATION OF final_hp (graded legs)")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls if l["hit"] is not None]
        print(f"  {s}: {len(g):,} graded legs")
        for k in ("R", "G", "D"):
            for grp in ("lowvol", "main"):
                for sd in ("Over", "Under"):
                    calib_table(f"{k} {grp} {sd}", [l for l in g if l["k"] == k and (l["_grp"] == "lowvol") == (grp == "lowvol") and l["side"] == sd], "fh")

    # ---------------- PART B ----------------
    print("\n" + "=" * 170 + "\nPART B - THE MARKET: coverage and the out-of-sample p_hat")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls]
        for k in ("R", "G", "D"):
            x = [l for l in g if l["k"] == k]
            if x:
                print(f"  {s} {k}: legs {len(x):,} | E {100 * np.mean([l['cls'] == 'E' for l in x]):.0f}% N {100 * np.mean([l['cls'] == 'N' for l in x]):.0f}% "
                      f"X {100 * np.mean([l['cls'] == 'X' for l in x]):.0f}%")
    for s in PERIODS:
        train_p = [t for t in PERIODS[:2] if t != s]
        for cls in ("E", "N", "X"):
            tr = [l for ss, _d, ls in slates if ss in train_p for l in ls if l["hit"] is not None and l["cls"] == cls]
            if len(tr) < 2000:
                print(f"  {s} {cls}: too few training legs ({len(tr)}) - p_hat = final_hp"); b = None
            else:
                b = fit(np.array([feats(l, cls) for l in tr]), np.array([l["hit"] for l in tr], float))
                print(f"  {s} {cls}: fit on {'+'.join(train_p)} ({len(tr):,} legs): " + " ".join(f"{v:+.3f}" for v in b))
            for _ss, _d, ls in slates:
                if _ss != s:
                    continue
                for l in ls:
                    if l["cls"] != cls:
                        continue
                    l["ph"] = l["fh"] if b is None else float(1 / (1 + math.exp(-(b[0] + float(np.dot(b[1:], feats(l, cls)))))))
    print("\n  log-loss (lower = better) final_hp -> p_hat, per period and class; top-N legs a slate by each (hit rate)")
    for s in PERIODS:
        for cls in ("E", "N", "X", "all"):
            g = [l for ss, _d, ls in slates if ss == s for l in ls if l["hit"] is not None and (cls == "all" or l["cls"] == cls)]
            if len(g) < 300:
                continue
            y = np.array([l["hit"] for l in g], float)
            print(f"    {s} {cls:3s} n {len(g):7,d} log-loss {ll(np.array([l['fh'] for l in g]), y):.4f} -> {ll(np.array([l['ph'] for l in g]), y):.4f} | "
                  f"Brier {np.mean((np.array([l['fh'] for l in g]) - y) ** 2):.4f} -> {np.mean((np.array([l['ph'] for l in g]) - y) ** 2):.4f}")
        for top in (25, 100):
            hf, hp = [], []
            for ss, _d, ls in slates:
                if ss != s:
                    continue
                g = [l for l in ls if l["hit"] is not None and l["k"] == "R"]
                hf += [l["hit"] for l in sorted(g, key=lambda l: -l["fh"])[:top]]
                hp += [l["hit"] for l in sorted(g, key=lambda l: -l["ph"])[:top]]
            print(f"    {s} standard lines, top {top} a slate: by final_hp hit {np.mean(hf):.3f} | by p_hat hit {np.mean(hp):.3f}")
    print("\n  calibration of p_hat (standard lines):")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls if l["hit"] is not None and l["k"] == "R"]
        for grp in ("lowvol", "main"):
            calib_table(f"{s} R {grp} p_hat", [l for l in g if (l["_grp"] == "lowvol") == (grp == "lowvol")], "ph")

    # ---------------- PART C + D (one pass over the slates, trailing cells fed in order, per number) ----------------
    combos = [(po, sd, ps, rk, fl, gc, sk) for po in GPOOL for sd in GSIDE for ps in GPROPS for rk in RANKS for fl in FLOORS
              for gc in (1, 2) for sk in (0, 1)]
    NC, NSt = len(combos), len(STRUCTS)
    log(f"grid: {NC} combos x {NSt} structures x 2 numbers")
    res = {v: np.full((NC * NSt, len(slates)), np.nan, np.float32) for v in ("fh", "ph")}
    bres = {v: defaultdict(lambda: np.full(len(slates), np.nan)) for v in ("fh", "ph")}
    hist = {v: deque(maxlen=PB.WINDOW) for v in ("fh", "ph")}
    for di, (s, d, ls) in enumerate(slates):
        for v in ("fh", "ph"):
            legs = [dict(l, p=l[v]) for l in ls]
            prep = PB.prepare(legs, PB.window_rates(hist[v]))
            # PART C: portfolio B as live
            for uid in ("B3", "B4", "B5", "B6", "B7", "B9"):
                sl = PB.unit_slip(prep, uid)
                if sl is not None:
                    bres[v][uid][di] = grade(sl, PB.UNITS[uid][3]) - 1.0
            # PART D
            cache = {}
            for ci, (po, sd, ps, rk, fl, gc, sk) in enumerate(combos):
                kk = (po, sd, ps, rk)
                if kk not in cache:
                    pset = GPROPS[ps]
                    base = [l for l in prep if l["tier"] in GPOOL[po] and l["side"] in GSIDE[sd] and (pset is None or l["_grp"] in pset)]
                    key = {"p": lambda l: -l["p"], "ev": lambda l: -l["p"] * l["factor"], "trail": lambda l: (-l["_trail"], -l["p"]),
                           "blend": lambda l: -l["_blend"]}[rk]
                    cache[kk] = sorted(base, key=key)
                cand = [l for l in cache[kk] if l["p"] >= fl][sk:]
                pk = pick_list(cand, gc)
                for j, (n, st_) in enumerate(STRUCTS):
                    if len(pk) >= n and len({l["team_id"] for l in pk[:n]}) >= 2:
                        res[v][ci * NSt + j, di] = grade(pk[:n], st_) - 1.0
            hist[v].append(PB.slate_counts(PB.eligible([dict(l, p=l[v]) for l in ls])))
        if di % 25 == 0:
            log(f"graded {di + 1}/{len(slates)} {d}")

    seas = np.array([s for s, _d, _l in slates])
    print("\n" + "=" * 170 + "\nPART C - PORTFOLIO B AS LIVE, final_hp vs p_hat (1 unit a slip): slips | ROI per period")
    for v in ("fh", "ph"):
        tot = {s: [] for s in PERIODS}
        for uid in ("B3", "B4", "B5", "B6", "B7", "B9"):
            x = bres[v][uid]
            parts = []
            for s in PERIODS:
                y = x[(seas == s) & ~np.isnan(x)]
                tot[s] += list(y)
                parts.append(f"{s} {len(y):4d} {100 * y.mean() if len(y) else 0:+6.1f}%")
            print(f"  {v} {uid} {PB.UNITS[uid][2]}{'P' if PB.UNITS[uid][3] == 'power' else 'F'}: " + " | ".join(parts))
        print(f"  {v} ALL SIX: " + " | ".join(f"{s} {len(tot[s])} slips {100 * np.mean(tot[s]) if tot[s] else 0:+.1f}% ({sum(tot[s]):+.1f}u)" for s in PERIODS))

    print("\n" + "=" * 170 + "\nPART D - THE GRID, per structure: final_hp vs p_hat")

    def name(ci, j):
        po, sd, ps, rk, fl, gc, sk = combos[ci]
        n, st_ = STRUCTS[j]
        return f"{po}-{sd}-{ps}-{rk}-p{fl:.2f}-gc{gc}{'-skip1' if sk else ''} {n}{'P' if st_ == 'power' else 'F'}"

    for j, (n, st_) in enumerate(STRUCTS):
        print(f"\n  {n}-pick {st_}")
        for v in ("fh", "ph"):
            M = res[v][j::NSt]
            stats = {}
            for s in PERIODS:
                Z = M[:, seas == s]
                cnt = (~np.isnan(Z)).sum(1)
                with np.errstate(invalid="ignore"):
                    mu = np.where(cnt > 0, np.nansum(Z, 1) / np.maximum(cnt, 1), np.nan)
                stats[s] = (cnt, mu)
            c1, m1 = stats["2024-25"]; c2, m2 = stats["2025-26"]; c3, m3 = stats["2026-27"]
            ok = (c1 >= MINN) & (c2 >= MINN)
            both = np.where(ok, np.minimum(m1, m2), -9)
            top = np.argsort(-both)[:5]
            wf = []
            for (ca, ma), (cb, mb) in (((c1, m1), (c2, m2)), ((c2, m2), (c1, m1))):
                sc = np.where(ca >= MINN, ma, -9)
                o = np.argsort(-sc)
                wf.append((mb[o[0]] if cb[o[0]] else np.nan, np.nanmean([mb[i] for i in o[:5] if cb[i]]), np.nanmean([mb[i] for i in o[:10] if cb[i]]),
                           np.nanmean([m3[i] for i in o[:10] if c3[i]])))
            print(f"    {v}: robust (>= +10% both) {int(((both >= 0.10)).sum())} | WF 24-25 -> 25-26 top1 {100 * wf[0][0]:+.0f}% top5 {100 * wf[0][1]:+.0f}% "
                  f"top10 {100 * wf[0][2]:+.0f}% (this season {100 * wf[0][3]:+.0f}%) | 25-26 -> 24-25 top1 {100 * wf[1][0]:+.0f}% top5 {100 * wf[1][1]:+.0f}% "
                  f"top10 {100 * wf[1][2]:+.0f}% (this season {100 * wf[1][3]:+.0f}%)")
            for ci in top:
                if both[ci] > -9:
                    print(f"       {name(ci, j):<52} 2024-25 {100 * m1[ci]:+5.0f}% ({c1[ci]}) | 2025-26 {100 * m2[ci]:+5.0f}% ({c2[ci]}) | "
                          f"this season {100 * m3[ci] if c3[ci] else 0:+5.0f}% ({c3[ci]})")
    log("DONE")


if __name__ == "__main__":
    main()
