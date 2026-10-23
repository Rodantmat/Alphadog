#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES, LAYER 1: FIND EVERY RECURRING BOARD PROFILE, NO STRATEGY INVOLVED (2026-10-23; owner 13:11 / 13:14 PT:
"a profile [is] similarities in different boards, different days, or how they differ ... hundreds more of techniques to identify
similar profiles, then identify them, name them, understand how to identify properly, how they work, how they present, the ranges
that still fit on the same kind of profile ... the past two seasons, plus the first days of this season ... external factors ...
internal factors ... just board characteristics only ... Exhausted ... 10 consecutive clean passes ... then we move to the slip
strategy for each one of them"). READ-ONLY.

SLATES: every 2024-25 and 2025-26 slate (tier map legs, the 12 calibrated props) and the 2026-27 slates already on the board (the
live loader live_slip_engine.load_board_legs_live, 'window' label, the same 12 props, no alternate Less - as the history). 2026-27
slates are LABELLED (which profile each one is), never used to define a profile.
FEATURES (all known before the pick; ~70): see slate_features() - three families:
  BOARD     the app board itself: size, legs / game, tier shares, goblin / demon multipliers, prop-group mix and each group's depth vs
            its own trailing 20 slates, concentration over games, line levels (points / rebounds / assists vs trailing), ladder depth
  INTERNAL  our own data on the board: final_hp distribution (mean, dispersion, skew, p90, top-20), standard legs >= 0.60 / 0.65 /
            0.70, goblins >= 0.75, the usual hitters present (players whose standard legs hit >= 58% over >= 10 earlier legs)
  EXTERNAL  the match day: games, morning game lines (total, close games, mismatches), team strength pairings (trailing-15 net
            margin: strong v strong / strong v weak / weak v weak), back-to-backs, rest, key injuries, questionables, tip-time
            spread, early / late games, weekday, weekend, month, season phase, post All-Star
  plus DELTA features (today vs the previous slate) and REGIME features (rolling-10-slate means) for the day-relation views.
Each value is turned into its TRAILING percentile among the previous <= 60 slates (>= 15, both seasons, no look-ahead) - the way the
profile would be recognised live.
A PROFILE = a set of slates sharing a definition, that RECURS: >= 15 slates, >= 3 calendar months and >= 5 separate episodes in EACH
of 2024-25 and 2025-26; and is IDENTIFIABLE: a rule (ranges of named features) or a cluster whose fit on one season is re-found by
the fit on the other (best-match Jaccard >= 0.5). It is NEW when its slate set overlaps every registered profile with Jaccard < 0.5.
ELECTION (owner 13:23 PT: "define some metrics for how to elect a profile ... how many as in multiple ... worth it to have a set of
strategies behind it"): a profile's strategies are judged on its own slates only, so its size sets what can ever be proven. The
minimum detectable ROI difference (80% power, 5% two-sided) of one slip a slate is 2.8 x sd / sqrt(slates); the per-slip profit sd
is ~1.5 (2-Power), ~2.6 (3-Power), ~1.3 (4-Flex), ~4 (5-6 Flex). Tiers, per season:
  ELECTED    >= 25 slates in EACH season (about one slate a week or more; 50+ over two seasons -> a 4-Flex difference of ~50 ROI
             points is detectable on the pooled slates), >= 3 months, >= 5 episodes - gets a full strategy search in Layer 2
  CANDIDATE  15-24 slates in each season - registered and tracked (2026-27 adds slates), strategy search only as a pooled read
  below 15 in either season, < 3 months or < 5 episodes - not a profile (one season's few big nights, a single streak)
Every profile prints its slate counts, months, episodes and the detectable ROI difference for 2P / 4F at its pooled size.
PASSES: the techniques below run in order, each one a pass; a pass is CLEAN when it registers no new profile. The run reports the
registry (name, definition, ranges in raw units, days / months / episodes per season, 2026-27 slates in it) and the trailing run of
clean passes. Layer 2 (strategies per profile) waits for 10 consecutive clean passes.
SYNTHETIC CHECK before the real run (72 random features + one planted group of 5 features shifted together on 30% of slates): random
features give only their own single-feature splits (simple profiles) and NO composite (pairs at p < 0.05 let 10 random pairs in;
p < 0.001 none; PCA axes need >= 2x an average share and the same axis in the other season); the planted group is found by k-means,
GMM and PCA-k-means on its family.
Env: DATABASE_URL, L1_TECH (comma list to run a subset; default all).
"""
import itertools
import os
import subprocess
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_board_types as BT                    # noqa: E402
import research_board_types_r4 as R4                 # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
from final_hp_board_cal import PROPS as CAL_PROPS    # noqa: E402

HIST = BT.SEASONS
T0 = time.time()
GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
GROUPS = ("points", "rebounds", "assists", "threes", "combos", "lowvol")
ONLY = [x for x in os.environ.get("L1_TECH", "").split(",") if x]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


# ===================================================================== DATA =============================================================
def load_current(conn):
    """2026-27 slates on the board so far: the live loader (window label), final_hp legs of the 12 calibrated props"""
    import live_slip_engine as LS
    out = {}
    for (d,) in conn.execute("""SELECT DISTINCT game_date FROM nba_market.pp_leg_price WHERE game_date >= '2026-10-01'
                                AND snapshot_label = 'window' ORDER BY 1""").fetchall():
        legs = []
        for l in LS.load_board_legs_live(conn, d, "window"):
            if l["rank_key"] != "final_hp" or l["prop"] not in CAL_PROPS or l["score"] is None:
                continue
            legs.append({"player": l["player"], "prop": l["prop"], "tier": l["tier"], "side": l["side"], "line": float(l["line"]),
                         "factor": float(l["factor"]), "hit": None, "p": float(l["score"]), "team_id": l["team_id"],
                         "event_id": l["event_id"], "cell": f"{l['prop']}_{l['tier']}"})
        if legs:
            out[("2026-27", d)] = legs
    log(f"2026-27 slates: {', '.join(f'{d} ({len(v)} legs)' for (_, d), v in sorted(out.items()))}")
    return out


def morning_lines(conn):
    import datetime as dt
    acc = defaultdict(lambda: {"tot": [], "sp": [], "tip": None})
    for ct, home, away, mk, out, pt in conn.execute("""
            SELECT commence_time, home_team, away_team, market, outcome, point::float8 FROM nba_market.game_lines_snapshots
            WHERE game_date BETWEEN '2024-10-01' AND '2027-06-30' AND market IN ('totals', 'spreads') AND point IS NOT NULL
              AND snapshot_label = 'morning'"""):
        if isinstance(ct, str):
            ct = dt.datetime.fromisoformat(ct.replace("Z", "+00:00"))
        loc = ct.astimezone(dt.timezone(dt.timedelta(hours=-8 if ct.month in (11, 12, 1, 2) or (ct.month == 3 and ct.day < 9) else -7)))
        key = (loc.date(), BT.nm_team(home), BT.nm_team(away))
        acc[key]["tip"] = loc.hour + loc.minute / 60
        if mk == "totals" and out == "Over":
            acc[key]["tot"].append(pt)
        elif mk == "spreads" and BT.nm_team(out) == BT.nm_team(home):
            acc[key]["sp"].append(pt)
    out = defaultdict(list)
    for (d, h, a), v in acc.items():
        out[d].append((float(np.median(v["tot"])) if v["tot"] else np.nan, abs(float(np.median(v["sp"]))) if v["sp"] else np.nan,
                       v["tip"] if v["tip"] is not None else np.nan))
    log(f"morning game lines: {sum(len(v) for v in out.values()):,} games on {len(out)} dates")
    return out


def slate_features(conn, days, order):
    F = R4.slate_features(conn, days)
    for k in F:
        for c in ("mean_total", "max_spread", "blowout_share", "weekday"):   # closing (tip-time) lines are post-pick; weekday is categorical
            F[k].pop(c, None)
    ml = morning_lines(conn)
    _, _, tg = BT.team_tables(conn)
    ts = {str(t): [(g["d"], g["pts"] - g["opp_pts"]) for g in v] for t, v in tg.items()}
    hist = deque(maxlen=20)
    player_rec = defaultdict(lambda: [0, 0])
    prev = None
    first_day = {}
    for s, d in order:
        first_day.setdefault(s, d)
    for s, d in order:
        legs = days[(s, d)]
        f = F[(s, d)]
        ln = ml.get(d, [])
        tots = [x[0] for x in ln if x[0] == x[0]]
        sps = [x[1] for x in ln if x[1] == x[1]]
        tips = [x[2] for x in ln if x[2] == x[2]]
        f["m_total"] = float(np.mean(tots)) if tots else np.nan
        f["close_share"] = float(np.mean([x <= 3 for x in sps])) if sps else np.nan
        f["mismatch_share"] = float(np.mean([x >= 9 for x in sps])) if sps else np.nan
        f["tip_spread"] = float(max(tips) - min(tips)) if tips else np.nan
        f["early_games"] = float(sum(t < 16 for t in tips)) if tips else np.nan
        f["late_share"] = float(np.mean([t >= 19 for t in tips])) if tips else np.nan
        ev_teams = defaultdict(set)
        for l in legs:
            if l["event_id"] is not None and l["team_id"] is not None:
                ev_teams[l["event_id"]].add(str(l["team_id"]))
        cls = []
        for ev, tt in ev_teams.items():
            if len(tt) != 2:
                continue
            c = []
            for t in tt:
                g = [m for (gd, m) in ts.get(t, []) if gd < d][-15:]
                nm = float(np.mean(g)) if len(g) >= 5 else 0.0
                c.append("S" if nm >= 4 else ("W" if nm <= -4 else "M"))
            cls.append("".join(sorted(c)))
        n = max(len(cls), 1)
        f["str_SS"] = sum(c == "SS" for c in cls) / n
        f["str_SW"] = sum(c == "SW" for c in cls) / n
        f["str_WW"] = sum(c == "WW" for c in cls) / n
        f["str_any_S"] = sum("S" in c for c in cls) / n
        cnt = defaultdict(int)
        lines_g = defaultdict(list)
        for l in legs:
            g = GRP.get(l["prop"], "other")
            cnt[g] += 1
            if l["tier"] == "R" and l["side"] == "Over":
                lines_g[l["prop"]].append(float(l["line"]))
        for g in GROUPS:
            past = [h["cnt"][g] for h in hist if g in h["cnt"]]
            f[f"depth_{g}"] = cnt[g] / np.median(past) if past and np.median(past) > 0 else np.nan
        for pr in ("points", "rebounds", "assists"):
            past = [h["ln"][pr] for h in hist if pr in h["ln"]]
            cur = float(np.mean(lines_g[pr])) if lines_g[pr] else np.nan
            f[f"line_{pr}_rel"] = cur / np.mean(past) if past and cur == cur else np.nan
        players = {l["player"] for l in legs}
        uh = {p for p in players if player_rec[p][1] >= 10 and player_rec[p][0] / player_rec[p][1] >= 0.58}
        f["uh_count"] = len(uh)
        f["uh_share"] = len(uh) / max(len(players), 1)
        R = np.array([l["p"] for l in legs if l["tier"] == "R" and l["p"] is not None], float)
        G = np.array([l["p"] for l in legs if l["tier"].startswith("G") and l["p"] is not None], float)
        f["std_p90"] = float(np.percentile(R, 90)) if len(R) else np.nan
        f["gob_ge75"] = float(np.sum(G >= 0.75)) if len(G) else 0.0
        rungs = defaultdict(int)
        for l in legs:
            rungs[(l["player"], l["prop"])] += 1
        f["ladder_depth"] = float(np.mean(list(rungs.values()))) if rungs else np.nan
        f["players"] = len(players)
        pos = (d - first_day[s]).days
        f["season_day"] = pos
        f["post_asb"] = 1.0 if (d.month in (2,) and d.day >= 20) or d.month in (3, 4) else 0.0
        hist.append({"cnt": dict(cnt), "ln": {pr: float(np.mean(v)) for pr, v in lines_g.items() if v}})
        for l in legs:
            if l["tier"] == "R" and l["hit"] is not None:
                player_rec[l["player"]][0] += int(l["hit"])
                player_rec[l["player"]][1] += 1
        # DELTA vs the previous slate (day relation)
        if prev is not None:
            for c in ("legs", "games", "std_ge65", "goblin_share", "demon_share", "lowvol_share", "key_injuries", "uh_share", "std_top20"):
                a, b = f.get(c, np.nan), F[prev].get(c, np.nan)
                f[f"dlt_{c}"] = (a - b) if a == a and b == b else np.nan
        prev = (s, d)
    # REGIME: rolling-10-slate means of a few core features (previous 10 slates, today excluded)
    core = ("legs", "std_ge65", "key_injuries", "goblin_share", "lowvol_share", "uh_share", "m_total", "b2b_share")
    for i, k in enumerate(order):
        for c in core:
            vals = [F[order[j]].get(c, np.nan) for j in range(max(0, i - 10), i)]
            vals = [v for v in vals if v == v]
            F[k][f"reg_{c}"] = float(np.mean(vals)) if len(vals) >= 5 else np.nan
    return F


EXTERNAL = ["games", "m_total", "close_share", "mismatch_share", "tip_spread", "early_games", "late_share", "str_SS", "str_SW", "str_WW",
            "str_any_S", "b2b_share", "mean_rest", "key_injuries", "questionable", "weekend", "month", "season_day", "post_asb"]
INTERNAL = ["std_ge60", "std_ge65", "std_ge70", "std_disp", "std_mean", "std_skew", "std_top20", "std_p90", "gob_ge75", "uh_count",
            "uh_share"]


def families(cols):
    board = [c for c in cols if c not in EXTERNAL and c not in INTERNAL and not c.startswith(("dlt_", "reg_"))]
    return {"EXTERNAL": [c for c in EXTERNAL if c in cols], "INTERNAL": [c for c in INTERNAL if c in cols], "BOARD": board,
            "BOARD+INTERNAL": board + [c for c in INTERNAL if c in cols],
            "ALL": [c for c in cols if not c.startswith(("dlt_", "reg_"))],
            "MIX": [c for c in cols if c.startswith(("mix_", "depth_"))] + ["lowvol_share"],
            "TIERS": [c for c in ("std_share", "goblin_share", "demon_share", "gob_factor", "dem_factor", "ladder_depth") if c in cols],
            "CONFIDENCE": [c for c in ("std_mean", "std_disp", "std_skew", "std_p90", "std_top20", "std_ge65", "gob_ge75") if c in cols],
            "SCHEDULE": [c for c in ("games", "tip_spread", "early_games", "late_share", "b2b_share", "mean_rest", "weekend") if c in cols],
            "STRENGTH": [c for c in ("str_SS", "str_SW", "str_WW", "str_any_S", "close_share", "mismatch_share", "m_total") if c in cols],
            "AVAILABILITY": [c for c in ("key_injuries", "questionable", "uh_count", "uh_share", "players") if c in cols],
            "DELTA": [c for c in cols if c.startswith("dlt_")], "REGIME": [c for c in cols if c.startswith("reg_")]}


def trailing_pct(F, order, cols):
    X = np.array([[F[k].get(c, np.nan) for c in cols] for k in order], float)
    P = np.full_like(X, np.nan)
    for i in range(len(order)):
        lo = max(0, i - 60)
        if i - lo < 15:
            continue
        past = X[lo:i]
        for j in range(len(cols)):
            v = X[i, j]
            pv = past[:, j]
            pv = pv[~np.isnan(pv)]
            if v != v or len(pv) < 15:
                continue
            P[i, j] = (np.sum(pv < v) + 0.5 * np.sum(pv == v)) / len(pv)
    return X, P


# ===================================================================== REGISTRY =========================================================
class Registry:
    def __init__(self, order, seas, X, cols):
        self.order, self.seas, self.X, self.cols = order, seas, X, cols
        self.months = np.array([k[1].month for k in order])
        self.hist = np.isin(seas, HIST)
        self.items = []
        self.passes = []
        self.M = np.zeros((512, len(order)), np.float32)
        self.Msum = np.zeros(512, np.float32)

    def recur(self, mask):
        info, ok = [], True
        for s in HIST:
            ms = mask & (self.seas == s)
            nd = int(ms.sum())
            nm = len(set(self.months[ms]))
            sub = mask[self.seas == s]
            ep = int(np.sum(sub[1:] & ~sub[:-1]) + (1 if len(sub) and sub[0] else 0))
            info.append(f"{s[2:]}: {nd}d/{nm}mo/{ep}ep")
            ok &= nd >= 15 and nm >= 3 and ep >= 5
        if ok:
            npool = int((mask & self.hist).sum())
            tier = "ELECTED" if all(int((mask & (self.seas == s)).sum()) >= 25 for s in HIST) else "CANDIDATE"
            info.append(f"{tier}; detectable ROI diff on {npool} slates: 2P {280 * 1.5 / np.sqrt(npool):.0f} / 4F "
                        f"{280 * 1.3 / np.sqrt(npool):.0f} pts")
        return ok, " ".join(info)

    def ranges(self, mask, feats):
        out = []
        for c in feats[:4]:
            j = self.cols.index(c)
            v = self.X[mask & self.hist, j]
            v = v[~np.isnan(v)]
            if len(v):
                out.append(f"{c} {np.percentile(v, 10):.3g}..{np.percentile(v, 90):.3g}")
        return "; ".join(out)

    def offer(self, name, mask, definition, feats, tech):
        mask = np.asarray(mask, bool)
        ok, info = self.recur(mask)
        if not ok:
            return False
        h = (mask & self.hist).astype(np.float32)
        if self.items:
            M = self.M[: len(self.items)]                     # registered profiles' historical masks (vectorised Jaccard)
            inter = M @ h
            union = self.Msum[: len(self.items)] + h.sum() - inter
            if np.any(inter / np.maximum(union, 1) >= 0.5):
                return False
        if len(self.items) >= len(self.M):
            self.M = np.vstack([self.M, np.zeros_like(self.M)])
            self.Msum = np.concatenate([self.Msum, np.zeros_like(self.Msum)])
        self.M[len(self.items)] = h
        self.Msum[len(self.items)] = h.sum()
        cur = [str(k[1]) for k, m in zip(self.order, mask) if m and k[0] not in HIST]
        self.items.append({"name": name, "mask": mask, "def": definition, "feats": feats, "tech": tech, "info": info,
                           "ranges": self.ranges(mask, feats), "cur": cur})
        return True

    def run_pass(self, tech, fn):
        n0 = len(self.items)
        tried = fn()
        new = len(self.items) - n0
        self.passes.append((tech, tried, new))
        log(f"pass {len(self.passes):>3} {tech:<40} candidates {tried:>5}, NEW profiles {new:>3}{'  (clean)' if new == 0 else ''}")


# ===================================================================== TECHNIQUES =======================================================
def techniques(reg, P, cols, fam):
    from sklearn.cluster import KMeans, AgglomerativeClustering
    from sklearn.decomposition import PCA
    from sklearn.mixture import GaussianMixture
    seas = reg.seas
    ci = {c: i for i, c in enumerate(cols)}
    T = []

    def thresholds(lo, hi, label):
        def fn():
            n = 0
            for c in cols:
                x = P[:, ci[c]]
                for nm_, m in ((f"{c}<= p{int(lo * 100)}", x <= lo), (f"{c}>= p{int(hi * 100)}", x >= hi)):
                    n += 1
                    reg.offer(nm_, m & ~np.isnan(x), f"trailing percentile of {nm_}", [c], label)
            return n
        return fn
    T.append(("single feature terciles", thresholds(1 / 3, 2 / 3, "terciles")))
    T.append(("single feature quintile extremes", thresholds(0.2, 0.8, "quintiles")))
    T.append(("single feature halves", thresholds(0.5, 0.5, "halves")))

    def calendar():
        n = 0
        wd = np.array([k[1].weekday() for k in reg.order])
        for w, nmw in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")):
            n += 1; reg.offer(f"weekday {nmw}", wd == w, f"weekday {nmw}", [], "calendar")
        for nm_, m in (("weekend", wd >= 5), ("Mon-Thu", wd <= 3), ("Fri-Sun", wd >= 4)):
            n += 1; reg.offer(nm_, m, nm_, [], "calendar")
        mo = reg.months
        for nm_, m in (("Oct-Nov", np.isin(mo, (10, 11))), ("Dec-Jan", np.isin(mo, (12, 1))), ("Feb-Apr", np.isin(mo, (2, 3, 4)))):
            n += 1; reg.offer(nm_, m, nm_, [], "calendar")
        return n
    T.append(("calendar (weekday, weekend, months)", calendar))

    def raw_ranges():
        """raw-unit ranges (not percentiles): fixed-width bins of each feature's raw value, cut at the pooled historical terciles"""
        n = 0
        for c in cols:
            x = reg.X[:, ci[c]]
            v = x[reg.hist & ~np.isnan(x)]
            if len(np.unique(v)) < 4:
                continue
            q1, q2 = np.percentile(v, [33.3, 66.7])
            for nm_, m in ((f"{c} <= {q1:.3g}", x <= q1), (f"{c} {q1:.3g}..{q2:.3g}", (x > q1) & (x <= q2)), (f"{c} > {q2:.3g}", x > q2)):
                n += 1; reg.offer(nm_, m & ~np.isnan(x), f"raw {nm_}", [c], "raw ranges")
        return n
    T.append(("raw-unit ranges", raw_ranges))

    def clusters(method, fname, ks):
        def fn():
            n = 0
            fc = fam[fname]
            if len(fc) < 2:
                return 0
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            for k in ks:
                labs = {}
                for fit in HIST:
                    mf = ok & (seas == fit)
                    if mf.sum() < 3 * k:
                        continue
                    if method == "kmeans":
                        mdl = KMeans(n_clusters=k, n_init=20, random_state=7).fit(Xf[mf]); pred = mdl.predict(Xf[ok]); cen = mdl.cluster_centers_
                    elif method == "gmm":
                        mdl = GaussianMixture(n_components=k, covariance_type="diag", random_state=7, n_init=3).fit(Xf[mf])
                        pred = mdl.predict(Xf[ok]); cen = mdl.means_
                    elif method == "pca-kmeans":
                        pca = PCA(n_components=min(3, len(fc))).fit(Xf[mf])
                        Z = pca.transform(Xf[ok]); Zf = pca.transform(Xf[mf])
                        mdl = KMeans(n_clusters=k, n_init=20, random_state=7).fit(Zf); pred = mdl.predict(Z)
                        cen = np.array([Xf[ok][pred == c].mean(axis=0) if np.any(pred == c) else np.full(len(fc), 0.5) for c in range(k)])
                    else:   # agglomerative (Ward) - fitted on the season, the other season assigned to the nearest cluster mean
                        mdl = AgglomerativeClustering(n_clusters=k, linkage="ward").fit(Xf[mf])
                        cen = np.array([Xf[mf][mdl.labels_ == c].mean(axis=0) for c in range(k)])
                        pred = np.argmin(((Xf[ok][:, None, :] - cen[None]) ** 2).sum(axis=2), axis=1)
                    lab = np.full(len(seas), -1); lab[ok] = pred
                    labs[fit] = (lab, cen)
                if len(labs) < 2:
                    continue
                (la, ca), (lb, cb) = labs[HIST[0]], labs[HIST[1]]
                for c in range(k):
                    ma = la == c
                    jb = max(np.sum(ma & (lb == c2)) / max(np.sum(ma | (lb == c2)), 1) for c2 in range(k))
                    n += 1
                    if jb < 0.5:
                        continue        # the other season's fit does not find it - not identifiable
                    top = sorted(zip(fc, ca[c]), key=lambda x: -abs(x[1] - 0.5))[:5]
                    if sum(abs(v - 0.5) >= 0.15 for _, v in top) < 2:
                        continue        # not a multi-feature commonality
                    desc = ", ".join(f"{nm_} {'HIGH' if v > 0.5 else 'LOW'} {v:.2f}" for nm_, v in top)
                    reg.offer(f"{method}-{fname}-k{k}-c{c}", ma, f"{method} on {fname} (k {k}); re-found by the other fit (J {jb:.2f}): {desc}",
                              [t[0] for t in top], f"{method} {fname}")
            return n
        return fn
    for method in ("kmeans", "gmm", "ward", "pca-kmeans"):
        for fname in fam:
            if fname in ("DELTA", "REGIME"):
                continue
            T.append((f"{method} on {fname}", clusters(method, fname, (2, 3, 4, 5, 6, 7, 8))))

    def pca_axes():
        n = 0
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL"):
            fc = fam[fname]
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            pca = PCA(n_components=min(4, len(fc))).fit(Xf[ok & (seas == HIST[0])])
            pcb = PCA(n_components=min(4, len(fc))).fit(Xf[ok & (seas == HIST[1])])
            Z = np.full((len(seas), pca.n_components_), np.nan); Z[ok] = pca.transform(Xf[ok])
            for j in range(pca.n_components_):
                # a REAL axis: it explains >= 2x an average feature's share and the other season's PCA has the same axis (|cos| >= 0.7)
                cosb = max(abs(float(np.dot(pca.components_[j], pcb.components_[i]))) for i in range(pcb.n_components_))
                n += 1
                if pca.explained_variance_ratio_[j] < 2.0 / len(fc) or cosb < 0.7:
                    continue
                load = sorted(zip(fc, pca.components_[j]), key=lambda x: -abs(x[1]))[:4]
                z = Z[:, j]
                q1, q2 = np.nanpercentile(z[seas == HIST[0]], [33.3, 66.7])
                for nm_, m in (("LOW", z <= q1), ("HIGH", z >= q2)):
                    reg.offer(f"pca-{fname}-axis{j + 1}-{nm_}", m & ~np.isnan(z),
                              f"latent axis {j + 1} of {fname} {nm_}: " + ", ".join(f"{a} {b:+.2f}" for a, b in load), [a for a, _ in load],
                              "pca axes")
        return n
    T.append(("latent axes (PCA terciles)", pca_axes))

    def pairs(lo, hi):
        """two features together - a COMPOSITE profile only when the two co-occur on boards beyond chance (observed >= 1.3 x the
        independent expectation and hypergeometric p < 0.001 in BOTH seasons - ~10,000 pair tests; on random synthetic features
        p < 0.05 let 10 through, p < 0.001 none); an arbitrary intersection is not a commonality"""
        from scipy.stats import hypergeom

        def fn():
            n = 0
            for a, b in itertools.combinations(cols, 2):
                xa, xb = P[:, ci[a]], P[:, ci[b]]
                ok = ~np.isnan(xa) & ~np.isnan(xb)
                for (na, ma), (nb, mb) in itertools.product(((f"{a} HIGH", xa >= hi), (f"{a} LOW", xa <= lo)),
                                                             ((f"{b} HIGH", xb >= hi), (f"{b} LOW", xb <= lo))):
                    n += 1
                    assoc = True
                    for s_ in HIST:
                        m_ = ok & (seas == s_)
                        N, A, B, K = int(m_.sum()), int((ma & m_).sum()), int((mb & m_).sum()), int((ma & mb & m_).sum())
                        exp = A * B / max(N, 1)
                        if N == 0 or K < 1.3 * exp or hypergeom.sf(K - 1, N, A, B) >= 0.001:   # ~10,000 pair tests: p < 0.001 both seasons
                            assoc = False
                            break
                    if assoc:
                        reg.offer(f"{na} & {nb}", ma & mb & ok, f"{na} and {nb} - they co-occur beyond chance in both seasons "
                                  f"(trailing percentiles, cut {lo:.2f} / {hi:.2f})", [a, b], "pairs")
            return n
        return fn

    def comove():
        """groups of features that MOVE TOGETHER across slates (|rank correlation| >= 0.4 inside the group in 2024-25, >= 0.3 in
        2025-26): the profile = the group's mean percentile (signs aligned) in its top / bottom third"""
        n = 0
        from scipy.cluster.hierarchy import fcluster, linkage
        A = P[(seas == HIST[0])]
        B = P[(seas == HIST[1])]
        okc = [j for j in range(len(cols)) if np.sum(~np.isnan(A[:, j])) > 40 and np.nanstd(A[:, j]) > 0]
        import pandas as pd
        CA = pd.DataFrame(A[:, okc]).corr(method="spearman").values
        CB = pd.DataFrame(B[:, okc]).corr(method="spearman").values
        D = 1 - np.abs(np.nan_to_num(CA))
        np.fill_diagonal(D, 0)
        from scipy.spatial.distance import squareform
        Z = linkage(squareform(D, checks=False), "average")
        for cut in (0.5, 0.6, 0.7):
            lab = fcluster(Z, cut, "distance")
            for g in set(lab):
                idx = [i for i in range(len(okc)) if lab[i] == g]
                if len(idx) < 2:
                    continue
                sa = np.mean([abs(CA[i, j]) for i in idx for j in idx if i < j])
                sb = np.mean([abs(np.nan_to_num(CB[i, j])) for i in idx for j in idx if i < j])
                n += 1
                if sa < 0.4 or sb < 0.3:
                    continue
                sign = np.sign(CA[idx[0], idx])
                sign[sign == 0] = 1
                Xg = P[:, [okc[i] for i in idx]]
                Xg = np.where(sign > 0, Xg, 1 - Xg)
                gm = np.nanmean(Xg, axis=1)
                names = [cols[okc[i]] + ("" if sg > 0 else "(-)") for i, sg in zip(idx, sign)]
                for nm_, m in (("HIGH", gm >= 2 / 3), ("LOW", gm <= 1 / 3)):
                    reg.offer(f"comove[{'+'.join(names[:4])}{'...' if len(names) > 4 else ''}]-{nm_}", m & ~np.isnan(gm),
                              f"features moving together (|rho| {sa:.2f} / {sb:.2f}): {', '.join(names)} - group mean {nm_}",
                              [cols[okc[i]] for i in idx], "co-moving groups")
        return n
    T.append(("co-moving feature groups", comove))
    T.append(("pairs of features (halves)", pairs(0.5, 0.5)))
    T.append(("pairs of features (terciles)", pairs(1 / 3, 2 / 3)))

    def day_relation(fname):
        def fn():
            n = 0
            for c in fam[fname]:
                x = P[:, ci[c]]
                for nm_, m in ((f"{c} LOW", x <= 1 / 3), (f"{c} HIGH", x >= 2 / 3)):
                    n += 1; reg.offer(nm_, m & ~np.isnan(x), f"{fname.lower()}: {nm_}", [c], fname.lower())
            return n
        return fn
    T.append(("delta vs previous slate", day_relation("DELTA")))
    T.append(("regime (rolling 10 slates)", day_relation("REGIME")))

    def same_as_yesterday():
        """the board 'looks like yesterday' / 'looks unlike yesterday': distance of today's percentile vector to the previous slate's"""
        n = 0
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL"):
            Xf = P[:, [ci[c] for c in fam[fname]]]
            dist = np.full(len(seas), np.nan)
            for i in range(1, len(seas)):
                if not np.isnan(Xf[i]).any() and not np.isnan(Xf[i - 1]).any():
                    dist[i] = np.sqrt(np.mean((Xf[i] - Xf[i - 1]) ** 2))
            q1, q2 = np.nanpercentile(dist[reg.hist], [33.3, 66.7])
            for nm_, m in (("like yesterday", dist <= q1), ("unlike yesterday", dist >= q2)):
                n += 1; reg.offer(f"{fname} {nm_}", m & ~np.isnan(dist), f"{fname} board {nm_} (rms percentile distance)", [], "similarity")
        return n
    T.append(("similarity to the previous slate", same_as_yesterday))
    return T


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = RC.load(conn)
    days = {k: [l for l in v if l["prop"] in CAL_PROPS] for k, v in days.items()}
    try:
        days.update(load_current(conn))
    except Exception as e:      # the live loader must never stop the research; reported plainly
        log(f"2026-27 slates not loaded: {type(e).__name__}")
    order = sorted(days, key=lambda k: k[1])
    seas = np.array([k[0] for k in order])
    log(f"slates {len(order)}: " + ", ".join(f"{s} {int((seas == s).sum())}" for s in sorted(set(seas))))
    F = slate_features(conn, days, order)
    cols = sorted({c for f in F.values() for c in f})
    X, P = trailing_pct(F, order, cols)
    fam = families(cols)
    log(f"features {len(cols)}: " + ", ".join(f"{k} {len(v)}" for k, v in fam.items()))
    reg = Registry(order, seas, X, cols)
    for tech, fn in techniques(reg, P, cols, fam):
        if ONLY and not any(tech.startswith(o) for o in ONLY):
            continue
        reg.run_pass(tech, fn)
    clean = 0
    for _, _, new in reversed(reg.passes):
        if new:
            break
        clean += 1
    nel = sum("ELECTED" in it["info"] for it in reg.items)
    print("\n" + "=" * 190 + f"\nREGISTRY - {len(reg.items)} recurring, identifiable, distinct profiles ({nel} ELECTED, {len(reg.items) - nel} "
          f"CANDIDATE); trailing clean passes: {clean} (Layer 2 waits for 10)")
    for i, it in enumerate(reg.items, 1):
        print(f"  P{i:03d} [{it['tech']}] {it['name']}\n        {it['info']} | ranges: {it['ranges']}\n        definition: {it['def']}"
              + (f"\n        2026-27 slates in it: {', '.join(it['cur'])}" if it["cur"] else ""))
    print("\n  2026-27 slates and their profiles:")
    for k in order:
        if k[0] in HIST:
            continue
        i = order.index(k)
        ps = [f"P{j + 1:03d}" for j, it in enumerate(reg.items) if it["mask"][i]]
        print(f"    {k[1]}: {len(ps)} profiles - {', '.join(ps[:60])}{' ...' if len(ps) > 60 else ''}")
    print("\n  passes: " + " | ".join(f"{t}: {n}" for t, _, n in reg.passes))
    log("done")


if __name__ == "__main__":
    main()
