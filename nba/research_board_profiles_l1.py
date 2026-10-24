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
the fit on the other (best-match Jaccard >= 0.5). It is NEW when its slate set overlaps every registered profile with Jaccard < 0.5
AND is not (nearly) the intersection or the union of two registered profiles (Jaccard < 0.5 with every A-and-B and A-or-B; added
after round 6 - see Registry.offer) AND cannot be predicted from the known profiles' memberships (depth-3 tree fitted on one season,
balanced accuracy >= 0.85 on the other, both ways - added after round 8, Registry.explained).
ELECTION (owner 13:23 PT: "define some metrics for how to elect a profile ... how many as in multiple ... worth it to have a set of
strategies behind it"): a profile's strategies are judged on its own slates only, so its size sets what can ever be proven. The
minimum detectable ROI difference (80% power, 5% two-sided) of one slip a slate is 2.8 x sd / sqrt(slates); the per-slip profit sd
is ~1.5 (2-Power), ~2.6 (3-Power), ~1.3 (4-Flex), ~4 (5-6 Flex). Tiers, per season:
  ELECTED    >= 25 slates in EACH season (about one slate a week or more; 50+ over two seasons -> a 4-Flex difference of ~50 ROI
             points is detectable on the pooled slates), >= 3 months, >= 5 episodes - gets a full strategy search in Layer 2
  CANDIDATE  15-24 slates in each season - registered and tracked (2026-27 adds slates), strategy search only as a pooled read
  below 15 in either season, < 3 months or < 5 episodes - not a profile (one season's few big nights, a single streak)
Every profile prints its slate counts, months, episodes and the detectable ROI difference for 2P / 4F at its pooled size.
TECHNIQUES (passes, in order): round 1 (run 40019821135: 230 profiles, 170 elected, last pass not clean) - terciles / quintiles /
halves, calendar, raw ranges, k-means / GMM / Ward / PCA-k-means on 11 families, latent axes, co-moving groups, associated pairs,
delta / regime splits, similarity to yesterday; batch 2 (own knowledge) - 13 more features (division / conference games, rest
mismatches, both teams on a back-to-back, usual hitters MISSING, new players, props per player, standard lines up / down vs the
player's previous board), raw quartiles, HDBSCAN and spectral clustering, typical vs unusual boards (isolation forest, analog density
in the other season); batch 3 (online: Wasserstein k-means of market regimes arXiv 2110.11848, LSEG regime detection - GMM / HMM /
change points) - Wasserstein k-means of each slate's final_hp / goblin multiplier distributions, Gaussian HMM regimes over
consecutive slates, PELT change-point segments. Round 2 (run 40021463152): 283 profiles (215 elected), trailing clean passes 1.
Batch 4 (Gemini 2.5-pro consult, 25 further views; the feasible ones): 9 more features (star players on the board, star share,
team concentration, the biggest game's share, prop-mix and tier entropy, bimodality of the standard / goblin final_hp
distributions), NMF archetypes and LDA topics of the board's composition (leg counts per prop x line type x side, the component
re-found by the other season's fit), compositional (centred log-ratio) clustering of the prop mix, non-linear (RBF kernel PCA)
embeddings, 3-slate trajectories, consensus clustering across 12 clusterings. Round 3 (run 40022511432): 310 profiles (234 elected),
trailing clean passes 1 (3-slate trajectories found 3). Batch 5 (variations of what still finds profiles): 2- and 5-slate
trajectories, trajectories / HMM regimes / change points on every family (two more PELT penalties), Wasserstein k-means of the demon
multiplier, points-line and props-per-player distributions, absolute-scale clusters (z-scores on 2024-25's own mean / sd).
Round 4 (run 40023838699): 324 profiles (244 elected), trailing clean 0 (trajectories 13, absolute scale 3, points-line 1). Batch 6:
each prop group's own board quality (standard legs >= 0.62, goblins >= 0.75, demon share; 18 features) and final_hp distribution,
4 / 7 / 10-slate trajectories on every family, absolute-scale Ward / spectral / HDBSCAN on every family, group-quality clusters.
Round 5 (run 40024700150): 405 profiles (305 elected), trailing clean 0 (per-group final_hp distributions found 10). Batch 7 -
variations only, no new features: full-covariance and Bayesian GMM, average / complete linkage, BIRCH, OPTICS, mean shift on every
family; Wasserstein k-means at k 7-8 on every distribution; 6 / 8-slate trajectories; polynomial / cosine / sigmoid kernel embeddings.
Round 6 (run 40025729814): 423 profiles (316 elected), trailing clean 0 - new views kept re-slicing the same slates; the NEW test now
also rejects a candidate explained by two known profiles (their intersection or union). Round 7 (run 40027670708): 346 profiles
(261 elected), trailing clean 0. Batch 8 (variations): goblin final_hp distributions per prop group, Wasserstein at k 9-10, 12 / 15-
slate trajectories, kernel embeddings on every family incl. a Laplacian kernel, k-means / GMM at k 9-12. Round 8 (run
40029366209): 372 profiles (275 elected), trailing clean 1; kernels / long trajectories / k 9-12 kept re-combining known profiles ->
the predictable-from-known-profiles test.
PASSES: the techniques below run in order, each one a pass; a pass is CLEAN when it registers no new profile. The run reports the
registry (name, definition, ranges in raw units, days / months / episodes per season, 2026-27 slates in it) and the trailing run of
clean passes. Layer 2 (strategies per profile) waits for 10 consecutive clean passes.
SYNTHETIC CHECK before the real run (72 random features + one planted group of 5 features shifted together on 30% of slates): random
features give only their own single-feature splits (simple profiles) and NO composite (pairs at p < 0.05 let 10 random pairs in;
p < 0.001 none; PCA axes need >= 2x an average share and the same axis in the other season; a family is clustered only when its
features co-move beyond the Marchenko-Pastur noise edge in both seasons, and a cluster must be re-found across seasons better than
every cluster of 8 within-season shuffles; HMM regimes better than 6 order-shuffled fits); the planted group is found by k-means,
GMM and Ward on its families; another cut of an already registered single feature (same feature and side) is a variant, not new.
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
DIST = {}          # (season, day) -> per-slate leg distributions as quantile vectors (Wasserstein views)
CELLS = {}         # (season, day) -> leg counts per prop x line type x side (NMF / LDA views of the board's composition)


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


def defaultdict_count(legs):
    c = defaultdict(int)
    for l in legs:
        c[l["player"]] += 1
    return c


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
    _, tinfo, tg = BT.team_tables(conn)
    ts = {str(t): [(g["d"], g["pts"] - g["opp_pts"]) for g in v] for t, v in tg.items()}
    tinfo = {str(t): v for t, v in tinfo.items()}
    tdates = {str(t): sorted({g["d"] for g in v}) for t, v in tg.items()}
    seen_players = set()
    last_line = {}                                      # (player, prop) -> the standard More line on his previous board
    recent_uh = deque(maxlen=5)                         # usual hitters on the last 5 boards, with their team
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
        # batch 2 (2026-10-23): division / conference games, rest mismatches, both teams on a back-to-back
        div = conf = restm = bothb2b = 0
        for ev, tt in ev_teams.items():
            if len(tt) != 2:
                continue
            a, b = sorted(tt)
            ia, ib = tinfo.get(a), tinfo.get(b)
            if ia and ib:
                div += ia[2] == ib[2]
                conf += ia[1] == ib[1]
            ra = [x for x in tdates.get(a, []) if x < d]
            rb = [x for x in tdates.get(b, []) if x < d]
            da = (d - ra[-1]).days if ra else 9
            db = (d - rb[-1]).days if rb else 9
            restm += (min(da, db) == 1 and max(da, db) >= 3)
            bothb2b += (da == 1 and db == 1)
        ng = max(len(ev_teams), 1)
        f["div_share"] = div / ng
        f["conf_share"] = conf / ng
        f["rest_mismatch_share"] = restm / ng
        f["both_b2b_share"] = bothb2b / ng
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
        # usual hitters MISSING: seen as usual hitters on the last 5 boards, their team plays today, they are not on the board
        teams_today = {str(l["team_id"]) for l in legs if l["team_id"] is not None}
        prev_uh = {}
        for h in recent_uh:
            prev_uh.update(h)
        f["uh_missing"] = sum(1 for p_, t_ in prev_uh.items() if t_ in teams_today and p_ not in players)
        recent_uh.append({p_: str(next(l["team_id"] for l in legs if l["player"] == p_)) for p_ in uh})
        f["new_players"] = len(players - seen_players)
        seen_players |= players
        f["props_per_player"] = len({(l["player"], l["prop"]) for l in legs}) / max(len(players), 1)
        up = dn = same = 0
        cur_lines = {}
        for l in legs:
            if l["tier"] == "R" and l["side"] == "Over":
                cur_lines[(l["player"], l["prop"])] = float(l["line"])
        for k_, v_ in cur_lines.items():
            if k_ in last_line:
                up += v_ > last_line[k_]; dn += v_ < last_line[k_]; same += v_ == last_line[k_]
        tot_ = max(up + dn + same, 1)
        f["line_up_share"] = up / tot_
        f["line_down_share"] = dn / tot_
        last_line.update(cur_lines)
        R = np.array([l["p"] for l in legs if l["tier"] == "R" and l["p"] is not None], float)
        G = np.array([l["p"] for l in legs if l["tier"].startswith("G") and l["p"] is not None], float)
        f["std_p90"] = float(np.percentile(R, 90)) if len(R) else np.nan
        f["gob_ge75"] = float(np.sum(G >= 0.75)) if len(G) else 0.0
        DIST[(s, d)] = {"std_hp": np.quantile(R, np.linspace(0.05, 0.95, 19)) if len(R) >= 20 else None,
                        "gob_hp": np.quantile(G, np.linspace(0.05, 0.95, 19)) if len(G) >= 20 else None,
                        "gob_factor": (np.quantile([float(l["factor"]) for l in legs if l["tier"].startswith("G")], np.linspace(0.05, 0.95, 19))
                                       if sum(l["tier"].startswith("G") for l in legs) >= 20 else None),
                        "all_hp": np.quantile([l["p"] for l in legs if l["p"] is not None], np.linspace(0.05, 0.95, 19)),
                        "dem_factor": (np.quantile([float(l["factor"]) for l in legs if l["tier"].startswith("D")], np.linspace(0.05, 0.95, 19))
                                       if sum(l["tier"].startswith("D") for l in legs) >= 20 else None),
                        "pts_line": (np.quantile([float(l["line"]) for l in legs if l["prop"] == "points" and l["tier"] == "R"],
                                                 np.linspace(0.05, 0.95, 19))
                                     if sum(l["prop"] == "points" and l["tier"] == "R" for l in legs) >= 20 else None),
                        "player_props": np.quantile(list(defaultdict_count(legs).values()), np.linspace(0.05, 0.95, 19))}
        # batch 10 (online research: sliced Wasserstein k-means for multivariate distributions, Luan & Hamp 2023 / LSE): the whole
        # leg cloud (final_hp, log multiplier) of the slate, projected on 16 fixed directions, 19 quantiles per direction -
        # Euclidean distance between these vectors = sliced Wasserstein-2 between two slates' leg clouds
        pf_ = [(l["p"], float(l["factor"])) for l in legs if l["p"] is not None and float(l["factor"]) > 0]
        if len(pf_) >= 40:
            Z_ = np.array([((a - 0.55) / 0.1, np.log(b) / 0.3) for a, b in pf_])
            th_ = np.linspace(0, np.pi, 16, endpoint=False)
            DIST[(s, d)]["sw_hp_factor"] = np.concatenate([np.quantile(Z_ @ np.array([np.cos(t), np.sin(t)]), np.linspace(0.05, 0.95, 19))
                                                            for t in th_])
        else:
            DIST[(s, d)]["sw_hp_factor"] = None
        # batch 6: each prop group's own board quality (standard legs >= 0.62, goblins >= 0.75, demon share) and its final_hp
        # distribution (Wasserstein view per group)
        for g in GROUPS:
            Rg = [l["p"] for l in legs if l["tier"] == "R" and GRP.get(l["prop"]) == g and l["p"] is not None]
            Gg = [l["p"] for l in legs if l["tier"].startswith("G") and GRP.get(l["prop"]) == g and l["p"] is not None]
            ng_ = sum(GRP.get(l["prop"]) == g for l in legs)
            f[f"strong_{g}"] = float(sum(x >= 0.62 for x in Rg))
            f[f"gobstrong_{g}"] = float(sum(x >= 0.75 for x in Gg))
            f[f"demshare_{g}"] = sum(GRP.get(l["prop"]) == g and l["tier"].startswith("D") for l in legs) / max(ng_, 1)
            DIST[(s, d)][f"std_hp_{g}"] = np.quantile(Rg, np.linspace(0.05, 0.95, 19)) if len(Rg) >= 20 else None
            DIST[(s, d)][f"gob_hp_{g}"] = np.quantile(Gg, np.linspace(0.05, 0.95, 19)) if len(Gg) >= 20 else None
        # batch 16 (round 18, 2026-10-23): MORE / LESS - no feature described the board's sides yet. Share of Less legs (all,
        # standard, goblin, demon, per prop group), where the strong legs are (share of Less among standard legs >= 0.62 and among
        # the top 20 by final_hp), and the strength gap between the sides (mean final_hp of standard Less minus More)
        def _ushare(sel):
            v = [l["side"] == "Under" for l in legs if sel(l)]
            return float(np.mean(v)) if len(v) >= 5 else np.nan
        f["under_share"] = _ushare(lambda l: True)
        f["under_share_std"] = _ushare(lambda l: l["tier"] == "R")
        f["under_share_gob"] = _ushare(lambda l: l["tier"].startswith("G"))
        f["under_share_dem"] = _ushare(lambda l: l["tier"].startswith("D"))
        for g in GROUPS:
            f[f"under_share_{g}"] = _ushare(lambda l, g=g: GRP.get(l["prop"]) == g)
        f["under_share_strong"] = _ushare(lambda l: l["tier"] == "R" and l["p"] is not None and l["p"] >= 0.62)
        top_ = sorted((l for l in legs if l["tier"] == "R" and l["p"] is not None), key=lambda l: -l["p"])[:20]
        f["under_share_top20"] = float(np.mean([l["side"] == "Under" for l in top_])) if len(top_) >= 10 else np.nan
        pu = [l["p"] for l in legs if l["tier"] == "R" and l["side"] == "Under" and l["p"] is not None]
        po = [l["p"] for l in legs if l["tier"] == "R" and l["side"] == "Over" and l["p"] is not None]
        f["side_gap"] = float(np.mean(pu) - np.mean(po)) if len(pu) >= 5 and len(po) >= 5 else np.nan
        # batch 4 (Gemini consult 2026-10-23: composition, concentration, multimodality, entropy)
        cc = defaultdict(int)
        for l in legs:
            cc[(l["prop"], l["tier"][0], l["side"][0])] += 1
        CELLS[(s, d)] = dict(cc)
        star = {l["player"] for l in legs if l["prop"] == "points" and l["tier"] == "R" and float(l["line"]) >= 24.5}
        f["stars"] = len(star)
        f["star_share"] = len(star) / max(len(players), 1)
        per_team = defaultdict(int)
        for l in legs:
            per_team[str(l["team_id"])] += 1
        tsh = np.array(list(per_team.values()), float) / max(len(legs), 1)
        f["team_hhi"] = float((tsh ** 2).sum())
        per_game_c = defaultdict(int)
        for l in legs:
            per_game_c[l["event_id"]] += 1
        f["max_game_share"] = max(per_game_c.values()) / max(len(legs), 1) if per_game_c else np.nan
        mixp = np.array([cnt[g] for g in GROUPS], float); mixp = mixp / max(mixp.sum(), 1)
        f["mix_entropy"] = float(-(mixp[mixp > 0] * np.log(mixp[mixp > 0])).sum())
        tierp = np.array([sum(l["tier"][0] == t for l in legs) for t in "RGD"], float); tierp = tierp / max(tierp.sum(), 1)
        f["tier_entropy"] = float(-(tierp[tierp > 0] * np.log(tierp[tierp > 0])).sum())

        def bimod(v):       # Sarle's bimodality coefficient (> 0.555 suggests two modes)
            if len(v) < 20:
                return np.nan
            import pandas as pd
            sk, ku = float(pd.Series(v).skew()), float(pd.Series(v).kurt())
            nn = len(v)
            return (sk ** 2 + 1) / (ku + 3 * (nn - 1) ** 2 / ((nn - 2) * (nn - 3)))
        f["std_bimod"] = bimod(R)
        f["gob_bimod"] = bimod(G)
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
            "str_any_S", "b2b_share", "mean_rest", "key_injuries", "questionable", "weekend", "month", "season_day", "post_asb",
            "div_share", "conf_share", "rest_mismatch_share", "both_b2b_share"]
INTERNAL = ["std_ge60", "std_ge65", "std_ge70", "std_disp", "std_mean", "std_skew", "std_top20", "std_p90", "gob_ge75", "uh_count",
            "uh_share", "uh_missing", "new_players", "line_up_share", "line_down_share", "std_bimod", "gob_bimod"]


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
            "AVAILABILITY": [c for c in ("key_injuries", "questionable", "uh_count", "uh_share", "uh_missing", "players", "new_players")
                             if c in cols],
            "MATCHUPS": [c for c in ("div_share", "conf_share", "rest_mismatch_share", "both_b2b_share", "str_SS", "str_SW", "str_WW",
                                     "close_share", "mismatch_share") if c in cols],
            "LINES": [c for c in ("line_points_rel", "line_rebounds_rel", "line_assists_rel", "line_up_share", "line_down_share",
                                  "pts_line") if c in cols],
            "GROUP-QUALITY": [c for c in cols if c.startswith(("strong_", "gobstrong_", "demshare_"))],
            "SIDES": [c for c in cols if c.startswith("under_share") or c == "side_gap"],
            "CONCENTRATION": [c for c in ("hhi_games", "team_hhi", "max_game_share", "stars", "star_share", "mix_entropy", "tier_entropy",
                                          "legs_per_game", "props_per_player") if c in cols],
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


def construct_of(tech):
    """the construct behind a derived view, its setting removed: 'kmeans SIG15d3-EXTERNAL' -> 'kmeans SIG-EXTERNAL', 'kmeans
    TRAJ7-ALL' -> 'kmeans TRAJ-ALL', 'kmeans KPCAlaplacian2-TIERS' -> 'kmeans KPCA-TIERS', 'wasserstein std_hp' -> itself;
    None for every other technique"""
    import re
    if tech.startswith("wasserstein "):
        return tech
    m = re.match(r"^(\S+) (SIG|TRAJ|KPCA)[A-Za-z]*\d*(?:d\d+)?-(.+)$", tech)
    return f"{m.group(1)} {m.group(2)}-{m.group(3)}" if m else None


# ===================================================================== REGISTRY =========================================================
class Registry:
    def __init__(self, order, seas, X, cols):
        self.order, self.seas, self.X, self.cols = order, seas, X, cols
        self.months = np.array([k[1].month for k in order])
        self.hist = np.isin(seas, HIST)
        self.items = []
        self.passes = []
        self.keys = set()
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
            if c not in self.cols:          # derived axes (kernel PCA, trajectories) have no raw range
                continue
            j = self.cols.index(c)
            v = self.X[mask & self.hist, j]
            v = v[~np.isnan(v)]
            if len(v):
                out.append(f"{c} {np.percentile(v, 10):.3g}..{np.percentile(v, 90):.3g}")
        return "; ".join(out)

    def offer(self, name, mask, definition, feats, tech, key=None):
        """key: for SIMPLE profiles (one feature / one construct) - (construct, side); another cut of the same construct and side
        (quintile, half, raw quartile) is a variant of the registered profile, not a new one"""
        mask = np.asarray(mask, bool)
        if key is not None and key in self.keys:
            return False
        ok, info = self.recur(mask)
        if not ok:
            return False
        h = (mask & self.hist).astype(np.float32)
        cons = construct_of(tech)
        if self.items:
            ni = len(self.items)
            M = self.M[: ni]                                  # registered profiles' historical masks (vectorised Jaccard)
            inter = M @ h
            hs = h.sum()
            union = self.Msum[: ni] + hs - inter
            jac = inter / np.maximum(union, 1)
            if np.any(jac >= 0.5):
                return False
            if cons is not None:
                # SAME CONSTRUCT, OTHER SETTING (round 13, 2026-10-23): a derived view at another window / kernel / k (path
                # signatures 3-20 slates, trajectories 2-15, kernel PCA kernels, Wasserstein k 2-10 of one distribution) is a
                # setting of the SAME construct; like the simple-profile keys, its clusters are variants of the registered
                # ones unless clearly apart: Jaccard >= 0.3 with a registered profile of the same construct -> variant.
                # Round 13 (run 40047045296): every new signature window still added 1-2.
                same = np.array([it.get("cons") == cons for it in self.items])
                if np.any(jac[same] >= 0.3):
                    return False
            if ni >= 2:
                # EXPLAINED BY KNOWN PROFILES (round 6, 2026-10-23): a candidate that is (nearly) the intersection or the union of
                # two registered profiles is a combination of known profiles, not a new commonality - Jaccard >= 0.5 with any
                # A and B / A or B rejects it. Without this, every new view kept re-slicing the same slates (423 'profiles' and no
                # clean pass).
                AB = (M @ M.T)                                   # |A and B|
                B3 = (M * h) @ M.T                               # |A and B and m|
                ji = B3 / np.maximum(hs + AB - B3, 1)
                ai = inter[:, None] + inter[None, :] - B3        # |m and (A or B)|
                uab = self.Msum[: ni][:, None] + self.Msum[: ni][None, :] - AB
                ju = ai / np.maximum(hs + uab - ai, 1)
                np.fill_diagonal(ji, 0); np.fill_diagonal(ju, 0)
                if ji.max() >= 0.5 or ju.max() >= 0.5:
                    return False
            if ni >= 10 and self.explained(mask):
                return False
        if len(self.items) >= len(self.M):
            self.M = np.vstack([self.M, np.zeros_like(self.M)])
            self.Msum = np.concatenate([self.Msum, np.zeros_like(self.Msum)])
        self.M[len(self.items)] = h
        self.Msum[len(self.items)] = h.sum()
        cur = [str(k[1]) for k, m in zip(self.order, mask) if m and k[0] not in HIST]
        self.items.append({"name": name, "mask": mask, "def": definition, "feats": feats, "tech": tech, "info": info,
                           "ranges": self.ranges(mask, feats), "cur": cur, "cons": cons})
        if key is not None:
            self.keys.add(key)
        return True

    def explained(self, mask):
        """PREDICTABLE FROM KNOWN PROFILES (round 8, 2026-10-23): a depth-3 decision tree over the registered profiles' memberships,
        fitted on one season, predicts the candidate's slates in the other season with balanced accuracy >= 0.85 - in BOTH directions -
        -> the candidate is a combination of up to ~3 known profiles, not new information. Generalises the pairwise intersection /
        union test; after round 8 (372 profiles) new views still re-combined known ones (kernels, long trajectories, k 9-12)."""
        from sklearn.tree import DecisionTreeClassifier
        from sklearn.metrics import balanced_accuracy_score
        ni = len(self.items)
        Xm = np.array([it["mask"] for it in self.items]).T.astype(np.int8)
        y = mask.astype(int)
        accs = []
        for fit, app in (HIST, HIST[::-1]):
            mf, ma = self.seas == fit, self.seas == app
            if y[mf].min() == y[mf].max() or y[ma].min() == y[ma].max():
                return False
            t = DecisionTreeClassifier(max_depth=3, class_weight="balanced", random_state=7).fit(Xm[mf], y[mf])
            accs.append(balanced_accuracy_score(y[ma], t.predict(Xm[ma])))
        _ = ni
        return min(accs) >= 0.85

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
                for nm_, m, side in ((f"{c}<= p{int(lo * 100)}", x <= lo, "LOW"), (f"{c}>= p{int(hi * 100)}", x >= hi, "HIGH")):
                    n += 1
                    reg.offer(nm_, m & ~np.isnan(x), f"trailing percentile of {nm_}", [c], label, key=(c, side))
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
            for nm_, m, side in ((f"{c} <= {q1:.3g}", x <= q1, "RAWLOW"), (f"{c} {q1:.3g}..{q2:.3g}", (x > q1) & (x <= q2), "MID"),
                                 (f"{c} > {q2:.3g}", x > q2, "RAWHIGH")):
                n += 1; reg.offer(nm_, m & ~np.isnan(x), f"raw {nm_}", [c], "raw ranges", key=(c, side))
        return n
    T.append(("raw-unit ranges", raw_ranges))

    def fit_once(method, Xm, par):
        """one clustering of the rows Xm -> labels (-1 = noise)"""
        from sklearn.cluster import HDBSCAN, SpectralClustering
        if True:
            mf = np.ones(len(Xm), dtype=bool)
            Xf = Xm
            if method == "kmeans":
                mdl = KMeans(n_clusters=par, n_init=20, random_state=7).fit(Xf[mf]); lf = mdl.labels_
            elif method == "gmm":
                lf = GaussianMixture(n_components=par, covariance_type="diag", random_state=7, n_init=3).fit(Xf[mf]).predict(Xf[mf])
            elif method == "pca-kmeans":
                pca = PCA(n_components=min(3, Xf.shape[1])).fit(Xf[mf])
                lf = KMeans(n_clusters=par, n_init=20, random_state=7).fit(pca.transform(Xf[mf])).labels_
            elif method == "ward":
                lf = AgglomerativeClustering(n_clusters=par, linkage="ward").fit(Xf[mf]).labels_
            elif method == "hdbscan":
                lf = HDBSCAN(min_cluster_size=par).fit(Xf[mf]).labels_
            elif method == "gmm-full":
                lf = GaussianMixture(n_components=par, covariance_type="full", random_state=7, n_init=3, reg_covar=1e-3).fit(Xf[mf]).predict(Xf[mf])
            elif method == "bgmm":
                from sklearn.mixture import BayesianGaussianMixture
                lf = BayesianGaussianMixture(n_components=par, covariance_type="diag", random_state=7, max_iter=500).fit(Xf[mf]).predict(Xf[mf])
            elif method in ("average", "complete"):
                lf = AgglomerativeClustering(n_clusters=par, linkage=method).fit(Xf[mf]).labels_
            elif method == "birch":
                from sklearn.cluster import Birch
                lf = Birch(n_clusters=par, threshold=0.3).fit(Xf[mf]).labels_
            elif method == "optics":
                from sklearn.cluster import OPTICS
                lf = OPTICS(min_samples=par).fit(Xf[mf]).labels_
            elif method == "meanshift":
                from sklearn.cluster import MeanShift, estimate_bandwidth
                lf = MeanShift(bandwidth=estimate_bandwidth(Xf[mf], quantile=par / 10, random_state=7) or 0.5).fit(Xf[mf]).labels_
            elif method == "louvain":           # community detection on the 10-nearest-neighbour graph; par / 4 = resolution
                import networkx as nx
                from sklearn.neighbors import kneighbors_graph
                G = nx.from_scipy_sparse_array(kneighbors_graph(Xf, n_neighbors=min(10, len(Xf) - 1), include_self=False))
                lf = np.full(len(Xf), -1)
                for q, com in enumerate(sorted(nx.community.louvain_communities(G, resolution=par / 4, seed=7), key=min)):
                    lf[list(com)] = q
            elif method == "affprop":           # exemplar slates by message passing; par = preference percentile of similarities
                from sklearn.cluster import AffinityPropagation
                Sim = -((Xf[:, None, :] - Xf[None]) ** 2).sum(axis=2)
                lf = AffinityPropagation(preference=float(np.percentile(Sim, par)), random_state=7, max_iter=500,
                                         affinity="precomputed").fit(Sim).labels_
            elif method == "som":               # self-organising map, a x b grid (par = a*10+b); units = clusters
                a_, b_ = divmod(par, 10)
                rng_ = np.random.default_rng(7)
                W = Xf[rng_.choice(len(Xf), a_ * b_, replace=False)].copy()
                grid = np.array([(i, j) for i in range(a_) for j in range(b_)], float)
                T_ = 30 * len(Xf)
                for t_ in range(T_):
                    x_ = Xf[rng_.integers(len(Xf))]
                    bmu = int(np.argmin(((W - x_) ** 2).sum(axis=1)))
                    sig = max(0.5, max(a_, b_) / 2 * (1 - t_ / T_))
                    h_ = np.exp(-((grid - grid[bmu]) ** 2).sum(axis=1) / (2 * sig ** 2))
                    W += (0.5 * (1 - t_ / T_) + 0.01) * h_[:, None] * (x_ - W)
                lf = np.argmin(((Xf[:, None, :] - W[None]) ** 2).sum(axis=2), axis=1)
            elif method == "archetype":         # archetypal analysis (par archetypes): slate -> its dominant archetype
                from scipy.optimize import nnls
                rng_ = np.random.default_rng(7)

                def cvx(A, Y, w=200.0):
                    # rows of Y as convex combinations of rows of A (NNLS with a heavy sum-to-one row)
                    Aa = np.vstack([A.T, w * np.ones(len(A))])
                    return np.array([nnls(Aa, np.append(y, w))[0] for y in Y])
                Z_ = Xf[rng_.choice(len(Xf), par, replace=False)].copy()
                for _ in range(15):
                    Wt = cvx(Z_, Xf)                       # slates as mixtures of archetypes
                    Zt = np.linalg.lstsq(Wt, Xf, rcond=None)[0]
                    Bt = cvx(Xf, Zt)                       # archetypes as mixtures of slates (kept on the hull)
                    Z_ = Bt @ Xf
                Wt = cvx(Z_, Xf)
                lf = np.argmax(Wt, axis=1)
            elif method == "average-cosine":    # average linkage on cosine distance (direction of the board's profile, not size)
                lf = AgglomerativeClustering(n_clusters=par, linkage="average", metric="cosine").fit(Xf - 0.5 + 1e-9).labels_
            elif method == "spectral-rbf":      # spectral clustering with a Gaussian (RBF) affinity
                lf = SpectralClustering(n_clusters=par, random_state=7, affinity="rbf", gamma=1.0 / Xf.shape[1]).fit(Xf).labels_
            elif method == "gmm-tied":          # mixture with one shared covariance (clusters of equal shape)
                lf = GaussianMixture(n_components=par, covariance_type="tied", random_state=7, n_init=3).fit(Xf).predict(Xf)
            elif method == "cocluster":         # spectral biclustering of slates x features (rows = slates)
                from sklearn.cluster import SpectralBiclustering
                lf = SpectralBiclustering(n_clusters=(par, min(par, Xf.shape[1])), random_state=7).fit(Xf + 1e-3).row_labels_
            else:
                lf = SpectralClustering(n_clusters=par, random_state=7, affinity="nearest_neighbors", n_neighbors=10).fit(Xf[mf]).labels_
        return np.asarray(lf)

    def fit_labels(method, Xf, ok, par):
        """fit on each season, assign every slate; -> {season: (labels, centres)}"""
        labs = {}
        for fit in HIST:
            mf = ok & (seas == fit)
            if mf.sum() < 3 * max(par, 2):
                continue
            lf = fit_once(method, Xf[mf], par)
            ks = [c for c in sorted(set(lf)) if c >= 0]
            if len(ks) < 2:
                continue
            cen = np.array([Xf[mf][lf == c].mean(axis=0) for c in ks])
            lab = np.full(len(seas), -1)
            lab[ok] = np.argmin(((Xf[ok][:, None, :] - cen[None]) ** 2).sum(axis=2), axis=1)
            labs[fit] = (lab, cen)
        return labs

    def refound(labs):
        (la, ca), (lb, cb) = labs[HIST[0]], labs[HIST[1]]
        return [max(np.sum((la == c) & (lb == c2)) / max(np.sum((la == c) | (lb == c2)), 1) for c2 in range(len(cb))) for c in range(len(ca))]

    BOOT_CACHE = {}

    def boot_stable(key, method, Xf, ok, par, labs, ca_idx, B=20, block=1):
        """Hennig (2007) clusterwise bootstrap stability: refit the clustering on B bootstrap resamples of the season's slates,
        assign every slate of the season to the nearest resample centre, and take the cluster's best Jaccard with a resample
        cluster; the mean over B must be >= 0.75 ('stable' in Hennig's scale; 0.6-0.75 = pattern, < 0.5 = dissolved) in BOTH
        seasons (season A: the cluster itself, season B: its re-found match). Returns (ok, (mean A, mean B))."""
        (la, ca), (lb, cb) = labs[HIST[0]], labs[HIST[1]]
        ma = la == ca_idx
        c2 = int(np.argmax([np.sum(ma & (lb == c)) / max(np.sum(ma | (lb == c)), 1) for c in range(len(cb))]))
        out = []
        for fit, lab, c in ((HIST[0], la, ca_idx), (HIST[1], lb, c2)):
            ck = (key, fit, par)
            if ck not in BOOT_CACHE:
                idx = np.where(ok & (seas == fit))[0]
                rng = np.random.default_rng(23)
                res = []
                for _ in range(B):
                    if block > 1:
                        # MOVING-BLOCK bootstrap for views built from the last `block` slates (round 15, 2026-10-23): such
                        # views are smooth by construction, so resampling single slates overstates stability; whole runs of
                        # consecutive slates are resampled instead (Kunsch 1989)
                        st_ = rng.integers(0, max(len(idx) - block + 1, 1), size=int(np.ceil(len(idx) / block)))
                        bi = np.concatenate([idx[a: a + block] for a in st_])[: len(idx)]
                    else:
                        bi = rng.choice(idx, len(idx), replace=True)
                    try:
                        lf = fit_once(method, Xf[bi], par)
                    except Exception:
                        lf = np.full(len(bi), -1)
                    ks = [q for q in sorted(set(lf)) if q >= 0]
                    if not ks:
                        res.append(None); continue
                    cen = np.array([Xf[bi][lf == q].mean(axis=0) for q in ks])
                    res.append(np.argmin(((Xf[idx][:, None, :] - cen[None]) ** 2).sum(axis=2), axis=1))
                BOOT_CACHE[ck] = (idx, res)
            idx, res = BOOT_CACHE[ck]
            m = lab[idx] == c
            js = []
            for r in res:
                if r is None:
                    js.append(0.0); continue
                js.append(max(np.sum(m & (r == q)) / max(np.sum(m | (r == q)), 1) for q in set(r)))
            out.append(float(np.mean(js)))
        return min(out) >= 0.75, tuple(out)

    NULL_CACHE = {}

    def null_threshold(method, fname, Xf, ok, par):
        """the same clustering on SHUFFLED data (each feature permuted within season: same marginals, no co-movement) - a real
        profile must be re-found across seasons better than EVERY shuffled cluster of 8 shuffles (synthetic check: k-means on 6 random
        features gave 'profiles' re-found at J >= 0.5 without a null, and still some against a 4-shuffle p95)"""
        key = (method, fname, par)
        if key not in NULL_CACHE:
            rng = np.random.default_rng(11)
            vals = []
            for _ in range(8):
                Xs = Xf.copy()
                for s_ in HIST:
                    idx = np.where(ok & (seas == s_))[0]
                    for j in range(Xs.shape[1]):
                        Xs[idx, j] = Xs[rng.permutation(idx), j]
                labs = fit_labels(method, Xs, ok, par)
                if len(labs) == 2:
                    vals += refound(labs)
            NULL_CACHE[key] = max(0.5, float(np.max(vals))) if vals else 0.5   # the MAX over 8 shuffles: ~35 clusters per method x family
        return NULL_CACHE[key]

    def has_structure(Xf, ok):
        """the family's features must CO-MOVE: the top eigenvalue of their rank-correlation matrix above the Marchenko-Pastur
        noise edge (1 + sqrt(p / n))^2 x 1.1 in BOTH seasons; otherwise any clusters are only geometric cuts of independent
        features (synthetic check: random 6-8-feature families gave cross-season-stable clusters that beat even shuffled data)"""
        import pandas as pd
        for s_ in HIST:
            Xs = Xf[ok & (seas == s_)]
            nn, pp = Xs.shape
            if nn < 20 or pp < 2:
                return False
            C = pd.DataFrame(Xs).corr(method="spearman").fillna(0).values
            lam = np.linalg.eigvalsh(C)[-1]
            if lam <= 1.1 * (1 + np.sqrt(pp / nn)) ** 2:
                return False
        return True

    def clusters(method, fname, pars, derived=False, block=1):
        """derived=True for decorrelated axes (kernel PCA, trajectories of PCA axes): no co-movement gate (uncorrelated by
        construction), a cluster must instead beat the shuffled maximum by 0.05"""
        def fn():
            n = 0
            fc = fam[fname]
            if len(fc) < 2:
                return 0
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not derived and not has_structure(Xf, ok):
                log(f"  {fname}: no co-movement beyond noise - {method} skipped")
                return 0
            for par in pars:
                labs = fit_labels(method, Xf, ok, par)
                if len(labs) < 2:
                    continue
                la, ca = labs[HIST[0]]
                jbs = refound(labs)
                thr = None
                for c, jb in enumerate(jbs):
                    n += 1
                    if jb < 0.5:
                        continue        # the other season's fit does not find it - not identifiable
                    top = sorted(zip(fc, ca[c]), key=lambda x: -abs(x[1] - 0.5))[:5]
                    if sum(abs(v - 0.5) >= 0.15 for _, v in top) < 2:
                        continue        # not a multi-feature commonality
                    thr = null_threshold(method, fname, Xf, ok, par) if thr is None else thr
                    if jb <= thr + (0.05 if derived else 0.0):
                        continue        # no better than clusters of shuffled (structure-free) data
                    st, (sa, sb) = boot_stable((method, fname), method, Xf, ok, par, labs, c, block=block)
                    if not st:
                        continue        # dissolves under resampling of its own season's slates (Hennig bootstrap < 0.75)
                    desc = ", ".join(f"{nm_} {'HIGH' if v > 0.5 else 'LOW'} {v:.2f}" for nm_, v in top)
                    reg.offer(f"{method}-{fname}-{par}-c{c}", la == c, f"{method} on {fname} ({par}); re-found by the other fit (J {jb:.2f}, "
                              f"shuffled max {thr:.2f}, bootstrap {sa:.2f}/{sb:.2f}): {desc}", [t[0] for t in top], f"{method} {fname}")
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
                                  f"(trailing percentiles, cut {lo:.2f} / {hi:.2f})", [a, b], "pairs",
                                  key=("pair", frozenset((na, nb))))     # another cut of the same two sides is a variant
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
                for nm_, m, side in ((f"{c} LOW", x <= 1 / 3, "LOW"), (f"{c} HIGH", x >= 2 / 3, "HIGH")):
                    n += 1; reg.offer(nm_, m & ~np.isnan(x), f"{fname.lower()}: {nm_}", [c], fname.lower(), key=(c, side))
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

    # ---------------- batch 2 (own knowledge) ----------------
    def raw_quartiles():
        n = 0
        for c in cols:
            x = reg.X[:, ci[c]]
            v = x[reg.hist & ~np.isnan(x)]
            if len(np.unique(v)) < 5:
                continue
            q = np.percentile(v, [25, 50, 75])
            for nm_, m, side in ((f"{c} <= {q[0]:.3g}", x <= q[0], "RAWLOW"), (f"{c} {q[0]:.3g}..{q[1]:.3g}", (x > q[0]) & (x <= q[1]), "MID"),
                                 (f"{c} {q[1]:.3g}..{q[2]:.3g}", (x > q[1]) & (x <= q[2]), "MID"), (f"{c} > {q[2]:.3g}", x > q[2], "RAWHIGH")):
                n += 1; reg.offer(nm_, m & ~np.isnan(x), f"raw quartile {nm_}", [c], "raw quartiles", key=(c, side))
        return n
    T.append(("raw-unit quartiles", raw_quartiles))

    for method, pars in (("hdbscan", (10, 15, 20)), ("spectral", (2, 3, 4, 5, 6))):
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "MIX", "TIERS", "MATCHUPS", "LINES", "AVAILABILITY"):
            if fname in fam:
                T.append((f"{method} on {fname}", clusters(method, fname, pars)))

    def typicality():
        """typical vs unusual boards: isolation-forest score and the number of close analogs in the OTHER season"""
        from sklearn.ensemble import IsolationForest
        n = 0
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL"):
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            iso = IsolationForest(random_state=7, n_estimators=300).fit(Xf[ok & (seas == HIST[0])])
            sc = np.full(len(seas), np.nan); sc[ok] = iso.score_samples(Xf[ok])
            q1, q2 = np.nanpercentile(sc[reg.hist], [33.3, 66.7])
            for nm_, m in (("unusual", sc <= q1), ("typical", sc >= q2)):
                n += 1; reg.offer(f"{fname} board {nm_}", m & ~np.isnan(sc), f"{fname} isolation-forest {nm_}", [], "typicality",
                                  key=(f"iso-{fname}", nm_))
            dens = np.full(len(seas), np.nan)
            for i in np.where(ok)[0]:
                other = ok & (seas != seas[i]) & reg.hist
                dist = np.sqrt(((Xf[other] - Xf[i]) ** 2).mean(axis=1))
                dens[i] = np.sum(dist <= 0.22)
            q1, q2 = np.nanpercentile(dens[reg.hist], [33.3, 66.7])
            for nm_, m in (("rare (few analogs)", dens <= q1), ("common (many analogs)", dens >= q2)):
                n += 1; reg.offer(f"{fname} board {nm_}", m & ~np.isnan(dens), f"{fname} analog density {nm_}", [], "typicality",
                                  key=(f"dens-{fname}", nm_))
        return n
    T.append(("typical vs unusual boards", typicality))

    # ---------------- batch 3 (online research: Wasserstein k-means of distributions; regime switching; change points) ----------------
    def wasserstein(key, ks=(2, 3, 4, 5, 6)):
        """cluster slates by the WHOLE distribution of a leg quantity (1-D Wasserstein-2 = L2 between quantile functions)"""
        def fn():
            n = 0
            L_ = next((len(DIST[k][key]) for k in reg.order if DIST.get(k, {}).get(key) is not None), 19)
            Q = np.array([DIST[k][key] if DIST.get(k, {}).get(key) is not None else np.full(L_, np.nan) for k in reg.order])
            ok = ~np.isnan(Q).any(axis=1)
            for k in ks:
                labs = {}
                for fit in HIST:
                    mf = ok & (seas == fit)
                    if mf.sum() < 3 * k:
                        continue
                    km = KMeans(n_clusters=k, n_init=20, random_state=7).fit(Q[mf])
                    lab = np.full(len(seas), -1); lab[ok] = km.predict(Q[ok])
                    labs[fit] = (lab, km.cluster_centers_)
                if len(labs) < 2:
                    continue
                (la, ca), (lb, cb) = labs[HIST[0]], labs[HIST[1]]
                for c in range(k):
                    ma = la == c
                    jb = max(np.sum(ma & (lb == c2)) / max(np.sum(ma | (lb == c2)), 1) for c2 in range(k))
                    n += 1
                    if jb < 0.5:
                        continue
                    st, (sa, sb) = boot_stable(("wasserstein", key), "kmeans", Q, ok, k, labs, c)
                    if not st:
                        continue        # dissolves under resampling (Hennig bootstrap < 0.75)
                    qs = ca[c]
                    reg.offer(f"wasserstein-{key}-k{k}-c{c}", ma, f"slates whose {key} distribution looks alike (Wasserstein k-means k {k}, J "
                              f"{jb:.2f}, bootstrap {sa:.2f}/{sb:.2f}): p10 {qs[1]:.3f} median {qs[9]:.3f} p90 {qs[17]:.3f}", [], f"wasserstein {key}")
            return n
        return fn
    for key in ("std_hp", "gob_hp", "gob_factor", "all_hp"):
        T.append((f"wasserstein k-means on {key}", wasserstein(key)))

    def hmm_regimes(fams=("ALL", "BOARD", "EXTERNAL", "INTERNAL")):
        """hidden regimes over consecutive slates: Gaussian HMM on the first 3 PCA axes of each family (2-4 states)"""
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "hmmlearn"], check=False)
        try:
            from hmmlearn.hmm import GaussianHMM
        except Exception:
            log("hmmlearn unavailable - HMM pass skipped")
            return 0
        n = 0
        for fname in fams:
            if len(fam.get(fname, [])) < 3:
                continue
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not has_structure(Xf, ok):        # HMM on a family without co-movement finds only noise (synthetic check)
                log(f"  {fname}: no co-movement beyond noise - HMM skipped")
                continue
            pca = PCA(n_components=3).fit(Xf[ok & (seas == HIST[0])])
            for k in (2, 3, 4):
                labs = {}
                for fit in HIST:
                    mf = ok & (seas == fit)
                    m = GaussianHMM(n_components=k, covariance_type="diag", n_iter=200, random_state=7).fit(pca.transform(Xf[mf]))
                    lab = np.full(len(seas), -1)
                    for s_ in HIST:
                        ms = ok & (seas == s_)
                        lab[ms] = m.predict(pca.transform(Xf[ms]))
                    labs[fit] = lab
                la, lb = labs[HIST[0]], labs[HIST[1]]
                # null: the same HMM on slates in shuffled ORDER (no persistence) - a regime must be re-found better than that
                rng = np.random.default_rng(13)
                nullj = []
                for _ in range(6):
                    lab_n = {}
                    for fit in HIST:
                        mf = ok & (seas == fit)
                        Zs = pca.transform(Xf[mf])[rng.permutation(int(mf.sum()))]
                        m = GaussianHMM(n_components=k, covariance_type="diag", n_iter=200, random_state=7).fit(Zs)
                        lab = np.full(len(seas), -1)
                        for s_ in HIST:
                            ms = ok & (seas == s_)
                            lab[ms] = m.predict(pca.transform(Xf[ms]))
                        lab_n[fit] = lab
                    nullj += [max(np.sum((lab_n[HIST[0]] == c) & (lab_n[HIST[1]] == c2)) / max(np.sum((lab_n[HIST[0]] == c) | (lab_n[HIST[1]] == c2)), 1)
                                  for c2 in range(k)) for c in range(k)]
                thr = max(0.5, float(np.max(nullj)))
                for c in range(k):
                    ma = la == c
                    jb = max(np.sum(ma & (lb == c2)) / max(np.sum(ma | (lb == c2)), 1) for c2 in range(k))
                    n += 1
                    if jb <= thr:
                        continue
                    mean_p = np.nanmean(Xf[ma], axis=0)
                    top = sorted(zip(fam[fname], mean_p), key=lambda x: -abs(x[1] - 0.5))[:4]
                    reg.offer(f"hmm-{fname}-k{k}-s{c}", ma, f"hidden regime (HMM over consecutive slates, {fname}, {k} states, J {jb:.2f}): "
                              + ", ".join(f"{a} {b:.2f}" for a, b in top), [a for a, _ in top], f"hmm {fname}")
        return n
    T.append(("hidden regimes (HMM)", hmm_regimes))

    def change_points(fams=("ALL", "BOARD", "EXTERNAL", "INTERNAL"), pen=3.0):
        """change-point segments of each family's first PCA axis (PELT); a segment profile = segments above / below the mean"""
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ruptures"], check=False)
        try:
            import ruptures as rpt
        except Exception:
            log("ruptures unavailable - change-point pass skipped")
            return 0
        n = 0
        for fname in fams:
            if len(fam.get(fname, [])) < 2:
                continue
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            pca = PCA(n_components=1).fit(Xf[ok & (seas == HIST[0])])
            seg_val = np.full(len(seas), np.nan)
            for s_ in sorted(set(seas)):
                idx = np.where(ok & (seas == s_))[0]
                if len(idx) < 20:
                    continue
                z = pca.transform(Xf[idx])[:, 0]
                for pen_ in (pen,):
                    bk = rpt.Pelt(model="l2", min_size=5).fit(z).predict(pen=pen_)
                    st = 0
                    for b in bk:
                        seg_val[idx[st:b]] = z[st:b].mean()
                        st = b
            q1, q2 = np.nanpercentile(seg_val[reg.hist], [33.3, 66.7])
            for nm_, m in (("LOW segment", seg_val <= q1), ("HIGH segment", seg_val >= q2)):
                n += 1; reg.offer(f"changepoint-{fname}-pen{pen:g}-{nm_}", m & ~np.isnan(seg_val), f"{fname} axis-1 change-point segment {nm_}", [],
                                  "change points")
        return n
    T.append(("change-point segments (PELT)", change_points))

    # ---------------- batch 4 (Gemini consult: composition factorisations, compositional geometry, non-linear embeddings,
    # trajectories, consensus) ----------------
    keys_c = sorted({k for v in CELLS.values() for k in v})
    Cm = np.array([[CELLS.get(k, {}).get(c, 0) for c in keys_c] for k in reg.order], float)
    Cn = Cm / np.maximum(Cm.sum(axis=1, keepdims=True), 1)

    def factor_profiles(kind):
        """the board as a MIXTURE of archetypal compositions (NMF / LDA on leg counts per prop x line type x side), fitted on each
        season; a component counts when the other season's fit has the same component (cosine >= 0.8); profile = the slates whose
        weight on it is in the top / bottom third"""
        def fn():
            from sklearn.decomposition import NMF, LatentDirichletAllocation
            n = 0
            # the same structure gate as the clusters: the cells' shares must co-move beyond noise in both seasons (synthetic:
            # independent random cell counts gave 'replicated' generic components without it)
            if not has_structure(Cn, np.ones(len(seas), bool) & reg.hist):
                log(f"  cell shares: no co-movement beyond noise - {kind} skipped")
                return 0
            for k in (3, 4, 5, 6):
                if k >= Cm.shape[1]:
                    continue
                fits = {}
                for fit in HIST:
                    mf = seas == fit
                    if kind == "nmf":
                        m = NMF(n_components=k, init="nndsvda", random_state=7, max_iter=800).fit(Cn[mf])
                        fits[fit] = (m, m.components_ / np.linalg.norm(m.components_, axis=1, keepdims=True))
                    else:
                        m = LatentDirichletAllocation(n_components=k, random_state=7, max_iter=60).fit(Cm[mf])
                        comp = m.components_ / m.components_.sum(axis=1, keepdims=True)
                        fits[fit] = (m, comp / np.linalg.norm(comp, axis=1, keepdims=True))
                ma, ca = fits[HIST[0]]
                _, cb = fits[HIST[1]]
                W = ma.transform(Cn if kind == "nmf" else Cm)
                W = W / np.maximum(W.sum(axis=1, keepdims=True), 1e-12)
                for j in range(k):
                    n += 1
                    cos = float(np.max(cb @ ca[j]))
                    if cos < 0.8:
                        continue
                    top = [keys_c[i] for i in np.argsort(-ca[j])[:4]]
                    w = W[:, j]
                    q1, q2 = np.percentile(w[seas == HIST[0]], [33.3, 66.7])
                    for nm_, m_ in (("HIGH", w >= q2), ("LOW", w <= q1)):
                        reg.offer(f"{kind}-k{k}-comp{j}-{nm_}", m_, f"{kind.upper()} board archetype {j} (k {k}, other-season cosine {cos:.2f}) "
                                  f"weight {nm_}: " + ", ".join("/".join(t) for t in top), [], f"{kind} composition",
                                  key=(f"{kind}-{','.join('/'.join(t) for t in top[:2])}", nm_))
            return n
        return fn
    T.append(("NMF archetypes of the board composition", factor_profiles("nmf")))
    T.append(("LDA topics of the board composition", factor_profiles("lda")))

    def clr_clusters():
        """compositions (prop-group mix, tier shares) in Aitchison geometry: centred log-ratio, then k-means with the same
        re-finding / shuffle tests"""
        n = 0
        comp_cols = [c for c in cols if c.startswith("mix_")]
        Xr = reg.X[:, [ci[c] for c in comp_cols]] + 1e-3
        clr = np.log(Xr) - np.log(Xr).mean(axis=1, keepdims=True)
        ok = ~np.isnan(clr).any(axis=1)
        fam["CLR-MIX"] = comp_cols
        saved = P[:, [ci[c] for c in comp_cols]].copy()
        P[:, [ci[c] for c in comp_cols]] = np.where(ok[:, None], clr, np.nan)
        try:
            n += clusters("kmeans", "CLR-MIX", (2, 3, 4, 5, 6))()
            n += clusters("gmm", "CLR-MIX", (2, 3, 4, 5, 6))()
        finally:
            P[:, [ci[c] for c in comp_cols]] = saved
        return n
    T.append(("compositional (CLR) clustering of the prop mix", clr_clusters))

    def kernel_embed():
        """non-linear embedding (RBF kernel PCA, 4 components, fitted on 2024-25) of each family, then k-means with the tests"""
        from sklearn.decomposition import KernelPCA
        n = 0
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION"):
            fc = fam.get(fname, [])
            if len(fc) < 3:
                continue
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not has_structure(Xf, ok):        # a view of a family without co-movement finds only noise (synthetic check)
                log(f"  {fname}: no co-movement beyond noise - kernel PCA skipped")
                continue
            kp = KernelPCA(n_components=4, kernel="rbf", random_state=7).fit(Xf[ok & (seas == HIST[0])])
            Z = np.full((len(seas), 4), np.nan); Z[ok] = kp.transform(Xf[ok])
            zr = np.full_like(Z, np.nan)
            for j in range(4):           # back to percentile scale so the shuffle null / gates apply unchanged
                v = Z[ok, j]
                zr[ok, j] = (np.argsort(np.argsort(v)) + 0.5) / len(v)
            key = f"KPCA-{fname}"
            fam[key] = [f"{key}-{j}" for j in range(4)]
            for j in range(4):
                ci[f"{key}-{j}"] = P.shape[1] + j
            Pz = np.column_stack([P, zr])
            n += clusters_on(Pz, "kmeans", key, (2, 3, 4, 5, 6))
        return n

    def clusters_on(Pz, method, fname, pars, block=1):
        nonlocal P
        saved = P
        P = Pz
        try:
            return clusters(method, fname, pars, derived=True, block=block)()
        finally:
            P = saved
    T.append(("non-linear embedding (kernel PCA) clusters", kernel_embed))

    def trajectories(win=3, fams=("BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION")):
        """multi-slate trajectories: today's family vector with the previous win-1 slates' (same season), clustered (k-means) with
        the re-finding / shuffle tests - boards defined by how the last days moved, not only by today"""
        n = 0
        for fname in fams:
            fc = fam.get(fname, [])
            if len(fc) < 2:
                continue
            pca = PCA(n_components=min(3, len(fc)))
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not has_structure(Xf, ok):        # trajectories of a family without co-movement find only noise (synthetic check)
                log(f"  {fname}: no co-movement beyond noise - trajectories skipped")
                continue
            pca.fit(Xf[ok & (seas == HIST[0])])
            Z = np.full((len(seas), pca.n_components_), np.nan); Z[ok] = pca.transform(Xf[ok])
            T3 = np.full((len(seas), win * pca.n_components_), np.nan)
            for i in range(win - 1, len(seas)):
                if seas[i] == seas[i - win + 1]:
                    T3[i] = np.concatenate([Z[i - w] for w in range(win)])
            zr = np.full_like(T3, np.nan)
            okt = ~np.isnan(T3).any(axis=1)
            for j in range(T3.shape[1]):
                v = T3[okt, j]
                zr[okt, j] = (np.argsort(np.argsort(v)) + 0.5) / len(v)
            key = f"TRAJ{win}-{fname}"
            fam[key] = [f"{key}-{j}" for j in range(T3.shape[1])]
            base = P.shape[1]
            for j in range(T3.shape[1]):
                ci[f"{key}-{j}"] = base + j
            n += clusters_on(np.column_stack([P, zr]), "kmeans", key, (2, 3, 4, 5), block=win)
        return n
    T.append(("3-slate trajectories", trajectories))

    def consensus():
        """consensus clustering: how often two slates land together across k-means / GMM / Ward at k 3-6 on ALL (fitted per season);
        the consensus matrix is clustered (average linkage) and each group is tested for re-finding across the two seasons' fits"""
        from scipy.cluster.hierarchy import fcluster, linkage
        from scipy.spatial.distance import squareform
        n = 0
        fc = fam["ALL"]
        Xf = P[:, [ci[c] for c in fc]]
        ok = ~np.isnan(Xf).any(axis=1)
        idx = np.where(ok)[0]
        labsets = {}
        for fit in HIST:
            co = np.zeros((len(idx), len(idx)))
            runs = 0
            for method in ("kmeans", "gmm", "ward"):
                for k in (3, 4, 5, 6):
                    labs = fit_labels(method, Xf, ok, k)
                    if fit not in labs:
                        continue
                    lab = labs[fit][0][idx]
                    co += (lab[:, None] == lab[None, :])
                    runs += 1
            co /= max(runs, 1)
            Zl = linkage(squareform(1 - co, checks=False), "average")
            labsets[fit] = Zl
        for cut in (0.3, 0.4, 0.5):
            la = np.full(len(seas), -1); lb = np.full(len(seas), -1)
            la[idx] = fcluster(labsets[HIST[0]], cut, "distance"); lb[idx] = fcluster(labsets[HIST[1]], cut, "distance")
            for c in sorted(set(la[idx])):
                ma = la == c
                if ma.sum() < 30:
                    continue
                jb = max(np.sum(ma & (lb == c2)) / max(np.sum(ma | (lb == c2)), 1) for c2 in sorted(set(lb[idx])))
                n += 1
                if jb < 0.6:
                    continue
                mean_p = np.nanmean(Xf[ma], axis=0)
                top = sorted(zip(fc, mean_p), key=lambda x: -abs(x[1] - 0.5))[:5]
                if sum(abs(v - 0.5) >= 0.15 for _, v in top) < 2:
                    continue
                reg.offer(f"consensus-cut{cut}-g{c}", ma, f"consensus of 12 clusterings on ALL (cut {cut}, re-found J {jb:.2f}): "
                          + ", ".join(f"{a} {b:.2f}" for a, b in top), [a for a, _ in top], "consensus")
        return n
    T.append(("consensus clustering", consensus))

    # ---------------- batch 5 (variations of what found profiles: other windows, other families, other distributions,
    # absolute instead of relative scale) ----------------
    for win in (2, 5):
        T.append((f"{win}-slate trajectories", (lambda w: (lambda: trajectories(w, ("BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION",
                                                                                 "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY"))))(win)))
    T.append(("3-slate trajectories, more families", lambda: trajectories(3, ("MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "STRENGTH",
                                                                               "SCHEDULE", "LINES", "ALL"))))
    T.append(("hidden regimes (HMM), more families", lambda: hmm_regimes(("MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "STRENGTH",
                                                                         "SCHEDULE", "LINES", "CONCENTRATION", "MATCHUPS"))))
    for pen in (1.5, 6.0):
        T.append((f"change points (penalty {pen:g}), all families", (lambda pn: (lambda: change_points(
            ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "STRENGTH", "SCHEDULE",
             "CONCENTRATION"), pn)))(pen)))
    for key in ("dem_factor", "pts_line", "player_props"):
        T.append((f"wasserstein k-means on {key}", wasserstein(key)))

    def absolute_scale():
        """ABSOLUTE instead of relative: each feature z-scored on 2024-25's own mean / sd (the earlier season, so no look-ahead for
        2025-26), clipped to +-3 and mapped to 0..1; then k-means / GMM on the main families with the same gates and nulls"""
        n = 0
        mu = np.nanmean(reg.X[seas == HIST[0]], axis=0)
        sd = np.nanstd(reg.X[seas == HIST[0]], axis=0)
        sd[~(sd > 0)] = 1.0
        Zabs = (np.clip((reg.X - mu) / sd, -3, 3) + 3) / 6
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "CONCENTRATION"):
            fc = fam.get(fname, [])
            if len(fc) < 2:
                continue
            key = f"ABS-{fname}"
            fam[key] = [f"{key}-{c}" for c in fc]
            base = P.shape[1]
            for j, c in enumerate(fc):
                ci[f"{key}-{c}"] = base + j
            Pz = np.column_stack([P, Zabs[:, [ci[c] for c in fc]]])
            nonlocal_P = Pz
            for method in ("kmeans", "gmm"):
                n += clusters_on_gate(nonlocal_P, method, key, (2, 3, 4, 5, 6))
        return n

    def clusters_on_gate(Pz, method, fname, pars):
        nonlocal P
        saved = P
        P = Pz
        try:
            return clusters(method, fname, pars, derived=False)()
        finally:
            P = saved
    T.append(("absolute-scale clusters", absolute_scale))

    # ---------------- batch 6 (round 4 run 40023838699: trajectories, absolute scale and the points-line distribution still found
    # profiles - their variations, plus each prop group's own board quality) ----------------
    for win in (4, 7, 10):
        T.append((f"{win}-slate trajectories, all families", (lambda w: (lambda: trajectories(w, (
            "ALL", "BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION", "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "STRENGTH",
            "SCHEDULE", "LINES", "GROUP-QUALITY"))))(win)))
    T.append(("trajectories of the group quality (2, 3, 5)", lambda: sum(trajectories(w, ("GROUP-QUALITY",)) for w in (2, 3, 5))))

    def absolute_more():
        n = 0
        mu = np.nanmean(reg.X[seas == HIST[0]], axis=0)
        sd = np.nanstd(reg.X[seas == HIST[0]], axis=0)
        sd[~(sd > 0)] = 1.0
        Zabs = (np.clip((reg.X - mu) / sd, -3, 3) + 3) / 6
        for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "CONCENTRATION",
                      "STRENGTH", "SCHEDULE", "LINES", "GROUP-QUALITY"):
            fc = [c for c in fam.get(fname, []) if c in cols]
            if len(fc) < 2:
                continue
            key = f"ABS2-{fname}"
            fam[key] = [f"{key}-{c}" for c in fc]
            base = P.shape[1]
            for j, c in enumerate(fc):
                ci[f"{key}-{c}"] = base + j
            Pz = np.column_stack([P, Zabs[:, [ci[c] for c in fc]]])
            for method, pars in (("ward", (2, 3, 4, 5, 6)), ("spectral", (2, 3, 4, 5)), ("hdbscan", (10, 15, 20)),
                                 ("kmeans", (2, 3, 4, 5, 6)) if fname in ("STRENGTH", "SCHEDULE", "LINES", "GROUP-QUALITY") else ("gmm", ())):
                if pars:
                    n += clusters_on_gate(Pz, method, key, pars)
        return n
    T.append(("absolute-scale clusters, more methods and families", absolute_more))
    T.append(("clusters on the prop groups' own quality", lambda: sum(clusters(m, "GROUP-QUALITY", pr)() for m, pr in (
        ("kmeans", (2, 3, 4, 5, 6)), ("gmm", (2, 3, 4, 5, 6)), ("ward", (2, 3, 4, 5, 6)), ("pca-kmeans", (2, 3, 4, 5, 6))))))
    for g in GROUPS:
        T.append((f"wasserstein k-means on std_hp_{g}", wasserstein(f"std_hp_{g}")))

    # ---------------- batch 7 (variations only - no new features): other clustering algorithms on every family, Wasserstein at
    # k 7-8, trajectories at 6 / 8, polynomial / cosine kernel embeddings ----------------
    MAIN = ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "MIX", "TIERS", "CONFIDENCE", "AVAILABILITY", "CONCENTRATION", "STRENGTH",
            "SCHEDULE", "LINES", "GROUP-QUALITY", "BOARD+INTERNAL", "SIDES")
    for method, pars in (("gmm-full", (2, 3, 4, 5)), ("bgmm", (4, 6, 8)), ("average", (2, 3, 4, 5, 6)), ("complete", (2, 3, 4, 5, 6)),
                         ("birch", (2, 3, 4, 5, 6)), ("optics", (8, 12, 16)), ("meanshift", (2, 3, 4))):
        T.append((f"{method} on every family", (lambda m, pr: (lambda: sum(clusters(m, f_, pr)() for f_ in MAIN if f_ in fam)))(method, pars)))
    for key in ("std_hp", "gob_hp", "gob_factor", "all_hp", "dem_factor", "pts_line", "player_props") + tuple(f"std_hp_{g}" for g in GROUPS):
        T.append((f"wasserstein k-means on {key} (k 7-8)", wasserstein(key, (7, 8))))
    for win in (6, 8):
        T.append((f"{win}-slate trajectories, all families", (lambda w: (lambda: trajectories(w, MAIN)))(win)))

    def kernel_more():
        from sklearn.decomposition import KernelPCA
        n = 0
        for kern in ("poly", "cosine", "sigmoid"):
            for fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION", "GROUP-QUALITY", "MIX"):
                fc = fam.get(fname, [])
                if len(fc) < 3:
                    continue
                Xf = P[:, [ci[c] for c in fc]]
                ok = ~np.isnan(Xf).any(axis=1)
                if not has_structure(Xf, ok):
                    continue
                kp = KernelPCA(n_components=4, kernel=kern, random_state=7).fit(Xf[ok & (seas == HIST[0])])
                Z = np.full((len(seas), 4), np.nan); Z[ok] = kp.transform(Xf[ok])
                zr = np.full_like(Z, np.nan)
                for j in range(4):
                    v = Z[ok, j]
                    zr[ok, j] = (np.argsort(np.argsort(v)) + 0.5) / len(v)
                key = f"KPCA{kern}-{fname}"
                fam[key] = [f"{key}-{j}" for j in range(4)]
                for j in range(4):
                    ci[f"{key}-{j}"] = P.shape[1] + j
                n += clusters_on(np.column_stack([P, zr]), "kmeans", key, (2, 3, 4, 5, 6))
        return n
    T.append(("kernel embeddings (poly / cosine / sigmoid)", kernel_more))

    # ---------------- batch 8 (round 7 run 40027670708: 346 profiles after the stricter NEW test; per-group distributions, kernels
    # and long trajectories still add a few) - their variations: goblin distributions per group, more k, longer windows, kernels on
    # every family, spectral with an RBF affinity ----------------
    for g in GROUPS:
        T.append((f"wasserstein k-means on gob_hp_{g}", wasserstein(f"gob_hp_{g}", (2, 3, 4, 5, 6, 7, 8))))
    for key in ("std_hp", "gob_hp", "all_hp", "pts_line") + tuple(f"std_hp_{g}" for g in GROUPS):
        T.append((f"wasserstein k-means on {key} (k 9-10)", wasserstein(key, (9, 10))))
    for win in (12, 15):
        T.append((f"{win}-slate trajectories, all families", (lambda w: (lambda: trajectories(w, MAIN)))(win)))

    def kernel_all():
        from sklearn.decomposition import KernelPCA
        n = 0
        for kern in ("rbf", "poly", "cosine", "sigmoid", "laplacian"):
            for fname in MAIN:
                if fname in ("ALL", "BOARD", "EXTERNAL", "INTERNAL", "CONCENTRATION", "GROUP-QUALITY", "MIX") and kern != "laplacian":
                    continue            # already done in batches 4 / 7
                fc = fam.get(fname, [])
                if len(fc) < 3:
                    continue
                Xf = P[:, [ci[c] for c in fc]]
                ok = ~np.isnan(Xf).any(axis=1)
                if not has_structure(Xf, ok):
                    continue
                Xfit = Xf[ok & (seas == HIST[0])]
                Z = np.full((len(seas), 4), np.nan)
                if kern == "laplacian":         # not a built-in KernelPCA kernel: precomputed Laplacian kernel
                    from sklearn.metrics.pairwise import laplacian_kernel
                    kp = KernelPCA(n_components=4, kernel="precomputed", random_state=7).fit(laplacian_kernel(Xfit))
                    Z[ok] = kp.transform(laplacian_kernel(Xf[ok], Xfit))
                else:
                    kp = KernelPCA(n_components=4, kernel=kern, random_state=7).fit(Xfit)
                    Z[ok] = kp.transform(Xf[ok])
                zr = np.full_like(Z, np.nan)
                for j in range(4):
                    v = Z[ok, j]
                    zr[ok, j] = (np.argsort(np.argsort(v)) + 0.5) / len(v)
                key = f"KPCA{kern}2-{fname}"
                fam[key] = [f"{key}-{j}" for j in range(4)]
                for j in range(4):
                    ci[f"{key}-{j}"] = P.shape[1] + j
                n += clusters_on(np.column_stack([P, zr]), "kmeans", key, (2, 3, 4, 5, 6))
        return n
    T.append(("kernel embeddings on every family (incl. laplacian)", kernel_all))
    T.append(("k-means k 9-12 on every family", lambda: sum(clusters("kmeans", f_, (9, 10, 11, 12))() for f_ in MAIN if f_ in fam)))
    T.append(("GMM k 9-12 on every family", lambda: sum(clusters("gmm", f_, (9, 10, 11, 12))() for f_ in MAIN if f_ in fam)))

    # ---------------- batch 9 (round 9 run 40031202918; own ideas): graph communities, biclusters, 3-way co-occurrence; every
    # clustering now also has to survive Hennig's bootstrap (>= 0.75 in both seasons) ----------------
    for fname in MAIN:
        if fname in fam:
            T.append((f"louvain communities on {fname}", clusters("louvain", fname, (2, 3, 4, 5, 6, 8))))
            T.append((f"spectral biclustering on {fname}", clusters("cocluster", fname, (2, 3, 4, 5))))

    def triples(lo=1 / 3, hi=2 / 3):
        """three features together - only when a co-occurring PAIR (a, b) also attracts c beyond chance: inside the pair's slates,
        c's side is >= 1.3 x its share and hypergeometric p < 0.001 in BOTH seasons (a 3-way commonality, not a pair plus noise)"""
        from scipy.stats import hypergeom
        n = 0
        side = {}
        for c in cols:
            x = P[:, ci[c]]
            side[(c, "HIGH")] = (x >= hi); side[(c, "LOW")] = (x <= lo)
        okc = {c: ~np.isnan(P[:, ci[c]]) for c in cols}
        prs = []
        for a, b in itertools.combinations(cols, 2):
            for sa, sb in itertools.product(("HIGH", "LOW"), repeat=2):
                ma, mb = side[(a, sa)], side[(b, sb)]
                ok = okc[a] & okc[b]
                good = True
                for s_ in HIST:
                    m_ = ok & (seas == s_)
                    N, A, B, K = int(m_.sum()), int((ma & m_).sum()), int((mb & m_).sum()), int((ma & mb & m_).sum())
                    if N == 0 or K < 1.3 * A * B / max(N, 1) or hypergeom.sf(K - 1, N, A, B) >= 0.001:
                        good = False; break
                if good:
                    prs.append(((a, sa), (b, sb), ma & mb & ok))
        log(f"  triples: {len(prs)} co-occurring pairs to extend")
        for (a, sa), (b, sb), mab in prs:
            for c in cols:
                if c in (a, b):
                    continue
                for sc in ("HIGH", "LOW"):
                    mc = side[(c, sc)]
                    good = True
                    for s_ in HIST:
                        m_ = mab & okc[c] & (seas == s_)
                        base = okc[c] & (seas == s_) & reg.hist
                        N, A = int(base.sum()), int((mc & base).sum())
                        K, Nab = int((mc & m_).sum()), int(m_.sum())
                        if Nab == 0 or N == 0 or K < 1.3 * Nab * A / N or hypergeom.sf(K - 1, N, A, Nab) >= 0.001:
                            good = False; break
                    n += 1
                    if good:
                        reg.offer(f"{a} {sa} & {b} {sb} & {c} {sc}", mab & mc & okc[c], f"{a} {sa}, {b} {sb} and {c} {sc} - the pair "
                                  f"co-occurs beyond chance and draws the third beyond chance, both seasons", [a, b, c], "triples",
                                  key=("triple", frozenset((f"{a} {sa}", f"{b} {sb}", f"{c} {sc}"))))   # another cut = variant
        return n
    T.append(("3-way co-occurrence (pairs that draw a third)", triples))

    # ---------------- batch 10 (online research, 2026-10-23: sliced Wasserstein k-means of multivariate distributions [Luan & Hamp,
    # arXiv 2310.01285]; statistical jump models [Nystrup et al. 2020]; path signatures for path-dependent regimes [Horvath, Issa
    # & Muguruza, arXiv 2306.15835]) ----------------
    T.append(("sliced Wasserstein k-means on the (final_hp, multiplier) leg cloud",
              wasserstein("sw_hp_factor", (2, 3, 4, 5, 6, 7, 8))))

    def jump_fit(Z, k, lam, iters=10, seed=7):
        """statistical jump model: k-means with a penalty lam for every change of state between consecutive slates (Viterbi /
        coordinate descent as in Nystrup et al.) -> (states, centres)"""
        km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(Z)
        cen = km.cluster_centers_
        st = km.labels_
        for _ in range(iters):
            D = ((Z[:, None, :] - cen[None]) ** 2).sum(axis=2)
            V = D[0].copy(); bp = np.zeros((len(Z), k), int)
            for t in range(1, len(Z)):
                cand = V[:, None] + lam * (1 - np.eye(k))
                bp[t] = np.argmin(cand, axis=0)
                V = cand[bp[t], np.arange(k)] + D[t]
            new = np.zeros(len(Z), int); new[-1] = int(np.argmin(V))
            for t in range(len(Z) - 1, 0, -1):
                new[t - 1] = bp[t, new[t]]
            if np.array_equal(new, st):
                break
            st = new
            cen = np.array([Z[st == c].mean(axis=0) if np.any(st == c) else cen[c] for c in range(k)])
        return st, cen

    def jump_decode(Z, cen, lam):
        k = len(cen)
        D = ((Z[:, None, :] - cen[None]) ** 2).sum(axis=2)
        V = D[0].copy(); bp = np.zeros((len(Z), k), int)
        for t in range(1, len(Z)):
            cand = V[:, None] + lam * (1 - np.eye(k))
            bp[t] = np.argmin(cand, axis=0)
            V = cand[bp[t], np.arange(k)] + D[t]
        st = np.zeros(len(Z), int); st[-1] = int(np.argmin(V))
        for t in range(len(Z) - 1, 0, -1):
            st[t - 1] = bp[t, st[t]]
        return st

    def jump_models():
        """persistent board regimes: jump model on the first 3 PCA axes of each family (k 2-4, penalty 1x / 3x the median squared
        distance to the nearest centre); a regime must be re-found by the other season's fit better than the same model fitted
        on slates in shuffled ORDER (max of 20 shuffles + 0.05)"""
        n = 0
        for fname in MAIN:
            if len(fam.get(fname, [])) < 3:
                continue
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not has_structure(Xf, ok):
                continue
            pca = PCA(n_components=3).fit(Xf[ok & (seas == HIST[0])])
            Zall = np.full((len(seas), 3), np.nan); Zall[ok] = pca.transform(Xf[ok])
            for k in (2, 3, 4):
                d0 = np.median(KMeans(n_clusters=k, n_init=10, random_state=7).fit_transform(Zall[ok & (seas == HIST[0])]).min(axis=1) ** 2)
                for mult in (1.0, 3.0):
                    lam = mult * d0

                    def fit_all(perm_rng=None):
                        labs = {}
                        for fit in HIST:
                            mf = ok & (seas == fit)
                            Zf = Zall[mf]
                            if perm_rng is not None:
                                Zf = Zf[perm_rng.permutation(len(Zf))]
                            _, cen = jump_fit(Zf, k, lam)
                            lab = np.full(len(seas), -1)
                            for s_ in HIST:
                                ms = ok & (seas == s_)
                                lab[ms] = jump_decode(Zall[ms], cen, lam)
                            labs[fit] = lab
                        return labs
                    labs = fit_all()
                    rng = np.random.default_rng(17)
                    nullj = []
                    for _ in range(20):
                        ln = fit_all(rng)
                        nullj += [max(np.sum((ln[HIST[0]] == c) & (ln[HIST[1]] == c2)) / max(np.sum((ln[HIST[0]] == c) | (ln[HIST[1]] == c2)), 1)
                                      for c2 in range(k)) for c in range(k)]
                    thr = max(0.5, float(np.max(nullj)))
                    la, lb = labs[HIST[0]], labs[HIST[1]]
                    for c in range(k):
                        ma = la == c
                        jb = max(np.sum(ma & (lb == c2)) / max(np.sum(ma | (lb == c2)), 1) for c2 in range(k))
                        n += 1
                        if jb <= thr + 0.05:
                            continue        # synthetic check: the max of 6 order-shuffles let a noise regime through
                        mean_p = np.nanmean(Xf[ma], axis=0)
                        top = sorted(zip(fam[fname], mean_p), key=lambda x: -abs(x[1] - 0.5))[:4]
                        reg.offer(f"jump-{fname}-k{k}-x{mult:g}-s{c}", ma, f"persistent regime (jump model, {fname}, {k} states, penalty "
                                  f"{mult:g}x, J {jb:.2f}, order-shuffled max {thr:.2f}): " + ", ".join(f"{a} {b:.2f}" for a, b in top),
                                  [a for a, _ in top], f"jump {fname}")
        return n
    T.append(("statistical jump models (persistent regimes)", jump_models))

    def signatures(win=5, dims=2):
        """path signature (level 2) of each family's 2-D PCA path over the last win slates: the total move on each axis plus the
        signed Levy area (did axis 1 move before axis 2) and the squared moves - clustered with the derived-view gates"""
        n = 0
        for fname in MAIN:
            fc = fam.get(fname, [])
            if len(fc) < 3:
                continue
            Xf = P[:, [ci[c] for c in fc]]
            ok = ~np.isnan(Xf).any(axis=1)
            if not has_structure(Xf, ok):
                continue
            pca = PCA(n_components=dims).fit(Xf[ok & (seas == HIST[0])])
            Z = np.full((len(seas), dims), np.nan); Z[ok] = pca.transform(Xf[ok])
            prs_ = list(itertools.combinations(range(dims), 2))
            S = np.full((len(seas), 2 * dims + len(prs_)), np.nan)
            for i in range(win - 1, len(seas)):
                if seas[i] != seas[i - win + 1]:
                    continue
                path = Z[i - win + 1: i + 1]
                if np.isnan(path).any():
                    continue
                dx = np.diff(path, axis=0)
                inc = path[-1] - path[0]
                areas = []
                for a_, b_ in prs_:
                    sab = sum(((path[t] - path[0])[a_]) * dx[t, b_] for t in range(len(dx)))
                    sba = sum(((path[t] - path[0])[b_]) * dx[t, a_] for t in range(len(dx)))
                    areas.append(0.5 * (sab - sba))
                S[i] = list(inc) + areas + list((dx ** 2).sum(axis=0))
            okt = ~np.isnan(S).any(axis=1)
            zr = np.full_like(S, np.nan)
            for j in range(S.shape[1]):
                v = S[okt, j]
                zr[okt, j] = (np.argsort(np.argsort(v)) + 0.5) / len(v)
            key = f"SIG{win}{'' if dims == 2 else f'd{dims}'}-{fname}"
            fam[key] = [f"{key}-{j}" for j in range(S.shape[1])]
            for j in range(S.shape[1]):
                ci[f"{key}-{j}"] = P.shape[1] + j
            n += clusters_on(np.column_stack([P, zr]), "kmeans", key, (2, 3, 4, 5, 6), block=win)
        return n
    for win in (3, 5, 10):
        T.append((f"path signatures ({win} slates)", (lambda w: (lambda: signatures(w)))(win)))

    # ---------------- batch 11 (Gemini 2.5 Pro consult 2026-10-23: affinity propagation exemplars, self-organising maps, archetypal
    # analysis, formal-concept / frequent-itemset profiles beyond three attributes) ----------------
    for fname in MAIN:
        if fname in fam:
            T.append((f"affinity propagation on {fname}", clusters("affprop", fname, (5, 10, 25, 50))))
            T.append((f"self-organising map on {fname}", clusters("som", fname, (22, 23, 33))))
            T.append((f"archetypal analysis on {fname}", clusters("archetype", fname, (3, 4, 5, 6))))

    def quads(lo=1 / 3, hi=2 / 3):
        """four attributes together (formal concepts of the binarised board): a slate set that already meets three co-occurring
        attributes AND draws a fourth beyond chance (>= 1.3 x, hypergeometric p < 0.001 in both seasons)"""
        from scipy.stats import hypergeom
        n = 0
        side = {}
        for c in cols:
            x = P[:, ci[c]]
            side[(c, "HIGH")] = (x >= hi); side[(c, "LOW")] = (x <= lo)
        okc = {c: ~np.isnan(P[:, ci[c]]) for c in cols}
        bases = [(it["name"], it["mask"]) for it in reg.items if it["tech"] == "triples"]
        log(f"  quads: {len(bases)} registered triples to extend")
        for nm0, m0 in bases:
            used = {t.rsplit(" ", 1)[0] for t in nm0.split(" & ")}
            for c in cols:
                if c in used:
                    continue
                for sc in ("HIGH", "LOW"):
                    mc = side[(c, sc)]
                    good = True
                    for s_ in HIST:
                        m_ = m0 & okc[c] & (seas == s_)
                        base = okc[c] & (seas == s_)
                        N, A, K, Nab = int(base.sum()), int((mc & base).sum()), int((mc & m_).sum()), int(m_.sum())
                        if Nab == 0 or N == 0 or K < 1.3 * Nab * A / N or hypergeom.sf(K - 1, N, A, Nab) >= 0.001:
                            good = False; break
                    n += 1
                    if good:
                        reg.offer(f"{nm0} & {c} {sc}", m0 & mc & okc[c], f"{nm0} and {c} {sc} - the three co-occur and draw the fourth "
                                  f"beyond chance, both seasons", [c], "quads")
        return n
    T.append(("4-way co-occurrence (formal concepts)", quads))

    # ---------------- batch 12 (round 11 run 40040166639: 5- and 10-slate path signatures still found 3; their variations -
    # more windows, 3-axis signatures; co-occurring pairs at the quartile extremes) ----------------
    for win in (7, 15, 20):
        T.append((f"path signatures ({win} slates)", (lambda w: (lambda: signatures(w)))(win)))
    for win in (5, 10):
        T.append((f"3-axis path signatures ({win} slates)", (lambda w: (lambda: signatures(w, 3)))(win)))

    def pairs_extreme():
        return pairs(0.25, 0.75)()
    T.append(("co-occurring pairs at the quartile extremes", pairs_extreme))

    # ---------------- batch 13 (round 14 run 40050723286: 15- and 20-slate signatures on STRENGTH / GROUP-QUALITY / CONFIDENCE, a
    # SOM cell on LINES and one quartile pair still new - their variations: longer windows, 3-axis long windows, more SOM grids,
    # more jump-model states, triples at the quartile extremes) ----------------
    for win in (25, 30):
        T.append((f"path signatures ({win} slates)", (lambda w: (lambda: signatures(w)))(win)))
    for win in (15, 20):
        T.append((f"3-axis path signatures ({win} slates)", (lambda w: (lambda: signatures(w, 3)))(win)))
    T.append(("20-slate trajectories, all families", lambda: trajectories(20, MAIN)))
    for fname in MAIN:
        if fname in fam:
            T.append((f"self-organising map (more grids) on {fname}", clusters("som", fname, (24, 34, 44))))

    def triples_extreme():
        return triples(0.25, 0.75)
    T.append(("3-way co-occurrence at the quartile extremes", triples_extreme))

    # ---------------- batch 14 (own ideas, round 16 run 40057155516): CROSS-FAMILY views (subspace idea from the Gemini consult) -
    # boards alike on two families at once (schedule with availability, lines with strength, ...), clustered with every gate ------
    CROSS = (("SCHEDULE", "AVAILABILITY"), ("STRENGTH", "LINES"), ("MIX", "TIERS"), ("CONFIDENCE", "GROUP-QUALITY"),
             ("CONCENTRATION", "SCHEDULE"), ("AVAILABILITY", "CONFIDENCE"), ("LINES", "CONFIDENCE"), ("MATCHUPS", "TIERS"),
             ("SCHEDULE", "LINES"), ("AVAILABILITY", "MIX"), ("STRENGTH", "CONFIDENCE"), ("CONCENTRATION", "GROUP-QUALITY"))
    for a_, b_ in CROSS:
        if a_ in fam and b_ in fam:
            key = f"{a_}x{b_}"
            fam[key] = list(dict.fromkeys(fam[a_] + fam[b_]))
            T.append((f"cross-family k-means on {key}", clusters("kmeans", key, (2, 3, 4, 5, 6))))
            T.append((f"cross-family Ward on {key}", clusters("ward", key, (2, 3, 4, 5, 6))))

    # ---------------- batch 15 (own ideas + Gemini leftovers, round 17 run 40059973198 reached 18 trailing clean passes; a last
    # batch of genuinely different points of view to confirm): how EXTREME the board is, the distribution of its deviations,
    # whether its families move together lately, its turnover vs yesterday, its distance to the season's centre, and three more
    # cluster geometries (cosine, RBF spectral, tied mixture) ----------------
    MAINF = [f_ for f_ in MAIN if f_ in fam]

    def tercile_offer(x, name, kname, feats=(), key=None):
        """key: the construct (without its setting) - another window / cut / reference of the same construct is a variant"""
        n = 0
        q1, q2 = np.nanpercentile(x[reg.hist], [33.3, 66.7])
        if not q1 < q2:
            return 0
        for nm_, m, side in ((f"{name} LOW", x <= q1, "LOW"), (f"{name} HIGH", x >= q2, "HIGH")):
            n += 1; reg.offer(nm_, m & ~np.isnan(x), f"{name}: historical tercile {side}", list(feats), kname,
                              key=(kname + (key or name), side))
        return n

    def extremeness(cut=0.1):
        n = 0
        for fname in MAINF:
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            x = np.where(ok, ((Xf >= 1 - cut) | (Xf <= cut)).mean(axis=1), np.nan)
            n += tercile_offer(x, f"share of {fname} features at a {cut:.0%} extreme", "extremeness", key=fname)
        return n
    T.append(("how extreme the board is (share of features at a 10% extreme)", extremeness))

    def deviation_distribution():
        Xa = P[:, [ci[c] for c in fam["ALL"]]]
        for k, row in zip(reg.order, Xa):
            v = np.abs(row[~np.isnan(row)] - 0.5)
            DIST.setdefault(k, {})["abs_dev"] = np.quantile(v, np.linspace(0.05, 0.95, 19)) if len(v) >= 40 else None
        return wasserstein("abs_dev", (2, 3, 4, 5, 6))()
    T.append(("distribution of the board's deviations (Wasserstein k-means)", deviation_distribution))

    def comovement_regime(win=10):
        n = 0
        ax = {}
        for fname in ("BOARD", "EXTERNAL", "INTERNAL", "SCHEDULE", "AVAILABILITY"):
            if fname not in fam:
                continue
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            pca = PCA(n_components=1).fit(Xf[ok & (seas == HIST[0])])
            z = np.full(len(seas), np.nan); z[ok] = pca.transform(Xf[ok])[:, 0]
            ax[fname] = z
        from scipy.stats import spearmanr
        for a_, b_ in itertools.combinations(sorted(ax), 2):
            r = np.full(len(seas), np.nan)
            for i in range(win, len(seas)):
                if seas[i] != seas[i - win]:
                    continue
                xa, xb = ax[a_][i - win: i], ax[b_][i - win: i]          # the previous win slates, today excluded
                g = ~np.isnan(xa) & ~np.isnan(xb)
                if g.sum() >= win - 2:
                    r[i] = spearmanr(xa[g], xb[g])[0]
            n += tercile_offer(r, f"{a_} and {b_} moving together (last {win} slates)", "co-movement regime", key=f"{a_}-{b_}")
        return n
    T.append(("co-movement regime of two families (rolling 10-slate rank correlation)", comovement_regime))

    def turnover(lag=1):
        n = 0
        for fname in MAINF:
            Xf = P[:, [ci[c] for c in fam[fname]]]
            tb = np.where(np.isnan(Xf), np.nan, np.digitize(Xf, [1 / 3, 2 / 3]))
            x = np.full(len(seas), np.nan)
            for i in range(lag, len(seas)):
                if seas[i] == seas[i - lag]:
                    g = ~np.isnan(tb[i]) & ~np.isnan(tb[i - lag])
                    if g.sum() >= 2:
                        x[i] = float(np.mean(tb[i][g] != tb[i - lag][g]))
            n += tercile_offer(x, f"{fname} turnover vs {lag} slate(s) before (features changing tercile)", "turnover", key=fname)
        return n
    T.append(("turnover vs the previous slate", turnover))

    def mahalanobis():
        n = 0
        for fname in MAINF:
            Xf = P[:, [ci[c] for c in fam[fname]]]
            ok = ~np.isnan(Xf).any(axis=1)
            x = np.full(len(seas), np.nan)
            ref = ok & (seas == HIST[0])            # centre / spread of 2024-25, applied to every slate
            mu = Xf[ref].mean(axis=0)
            Ci = np.linalg.inv(np.cov(Xf[ref].T) + 1e-3 * np.eye(Xf.shape[1]))
            d = Xf[ok] - mu
            x[ok] = np.sqrt(np.einsum("ij,jk,ik->i", d, Ci, d))
            n += tercile_offer(x, f"{fname} distance to the typical board (Mahalanobis)", "mahalanobis", key=fname)
        return n
    T.append(("distance to the typical board (Mahalanobis)", mahalanobis))
    for meth_ in ("average-cosine", "spectral-rbf", "gmm-tied"):
        T.append((f"{meth_} on every family", (lambda m: (lambda: sum(clusters(m, f_, (2, 3, 4, 5, 6))() for f_ in MAINF)))(meth_)))
    return T


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn", "networkx"], check=True)
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
