#!/usr/bin/env python3
"""
RESEARCH - BOARD PROFILES v3: SLATE ENVIRONMENT + BOARD FEATURES -> SKIP / SWAP RULES ON THE LIVE PAIR (2026-10-23; owner 17:49 PT 10-22: "each identifiable board
type is an opportunity for a customized strategy"; 09:51 PT 10-23: "keep digging, researching, learning, identifying, granulating
profiles"). READ-ONLY.
WHAT IS NEW vs v1 / v2 (ledger DAY THREE 20: board shape - games x phase x strength / demon, and 2,929 strategies picked per cell -
failed out of sample): (a) the slate's ENVIRONMENT, never tested before - game totals and spreads, blowout share, back-to-backs, rest,
key injuries at pick time; (b) the board-centred final_hp (DAY THREE 23) instead of the mis-centred number; (c) no strategy picked per
cell - only one-feature SKIP / SWAP rules on the live pair, chosen on one season and tested on the other, plus a hierarchy fixed
before reading any result.

GROUNDING (research first): Stokastic / SaberSim slate-size guidance (small slates swing harder; correlation and game exposure matter
more), Action Network on blowouts (stars sit late - overs and 3rd / 4th options suffer), a Gemini 2.5-pro consult: 15-20 pre-tip
features (game count, mean total, max spread, blowout share, back-to-back share, key injuries, questionable count, rest, board depth by
line type, low-volume share, model-confidence count, edge dispersion), ONLY 2-3 features per rule, COARSE bins fixed before looking at
results, discovery on one season and an untouched test on the other, and a hierarchy built from logic (game count first; small ->
max spread; medium -> injuries / back-to-backs; large -> back-to-backs) BEFORE reading P/L.

SLATE FEATURES (all known before the 13:15 PT pick): games; mean / max closing game total and spread (nba_market.game_lines_closing,
median across books - the close is ~minutes from the pick for slate-level numbers; noted); blowout share (|spread| >= 10); back-to-back
share of the slate's teams; mean rest days; key injuries (players Out / Doubtful at pick time - nba_score.injury_asof_pick - whose last
10 games average >= 24 minutes); questionable count; board: legs, standard / goblin / demon share, low-volume share (steals / blocks /
turnovers / stocks), legs per game; model: standard legs with final_hp >= 0.60 / 0.65 / 0.70, final_hp dispersion on standard legs;
month.
OUTCOME per slate and unit: the unit's k = 1 slip (1 unit) graded by grader v3; the LIVE PAIR (P_wrebounds_4flex + P_cal_r70_3power,
round robin, n 2, leg cap 2). Units: the live pair's two, the production units it replaced, and a calibrated unit of EVERY structure
2-6 x Flex / Power (standard lines ranked on final_hp >= 0.60, <= 2 legs a game) plus the goblin+standard EV family.
ANALYSES
  1 every feature in terciles of the DISCOVERY season (cut points fixed there, applied to the other season): ROI per bin of every unit and
    of the pair, both seasons; CONSISTENT = the same bin is worst (and below zero) in both seasons.
  2 the pre-registered hierarchy (A small: A1 max spread < 10 / A2 >= 10; B medium: B1 key injuries <= 2 / B2 > 2; C large: C1
    back-to-back share < 25% / C2 >= 25%): ROI of every unit per profile, both seasons.
  3 RULES on the pair, chosen on one season, tested untouched on the other (and the reverse): SKIP the 3-Power, SKIP the 4-Flex, or SWAP the
    3-Power for another unit, when ONE feature is in ONE tercile (or the profile is one of the six); a rule must keep >= 15 discovery days
    in its bin. HOLDS = it raises the pair's profit in both seasons (each chosen on the other) and does not cut the weaker season's lb5.
Env: DATABASE_URL, BP_BOOT (500).
"""
import datetime as dt
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE              # noqa: E402
import calib_slips as CS                    # noqa: E402
import research_pp_calibrated_slips as RC   # noqa: E402
import research_pp_flex234 as F             # noqa: E402

BOOT = int(os.environ.get("BP_BOOT") or 500)
SEASONS = ("2024-25", "2025-26")
KMAX = 10
REB4F = ("_wo", "weighted:rebounds_R", 4, "flex")
CAL3P = ("calib", "calib:R:p:0.70:2", 3, "power")
LEGACY = [("_wo", "weighted:threes_D1", 4, "flex"), ("_wo_nosteals", "weighted:assists_D1", 4, "flex"),
          ("_wo", "weighted:stocks_R", 4, "flex"), ("_wo", "single:points_R", 3, "power"), ("_wo", "weighted:rebounds_R", 3, "power")]
STRUCT = [("calib", "calib:R:p:0.60:2", s, st) for s in (2, 3, 4, 5, 6) for st in ("power", "flex") if not (s == 2 and st == "flex")]
GREV = [("calib", "calib:GR:ev:0.55:2", s, st) for s, st in ((3, "power"), (4, "flex"), (5, "flex"), (6, "flex"))]
UNITS = [REB4F, CAL3P] + LEGACY + STRUCT + GREV
LOWVOL = {"steals", "blocks", "turnovers", "stocks"}


def tag(u):
    return f"{u[1].replace('calib:', 'c:')} {u[2]}{'F' if u[3] == 'flex' else 'P'}" + ("" if u[0] == "calib" else f" {u[0]}")


def legkey(l):
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1))


def lb5(pr, st, seed=7):
    p, s = np.asarray(pr, float), np.asarray(st, float)
    if len(p) < 5 or s.sum() <= 0:
        return float("nan")
    idx = np.random.default_rng(seed).integers(0, len(p), size=(BOOT, len(p)))
    return float(np.percentile(p[idx].sum(1) / np.maximum(s[idx].sum(1), 1e-9), 5))


def features(conn, days):
    """{(season, day): {feature: value}}"""
    lines = defaultdict(list)
    for d, ev, tot, sp in conn.execute("""SELECT game_date, canonical_event_id, total_line::float8, home_spread::float8
                                          FROM nba_market.game_lines_closing WHERE season = ANY(%s)""", (list(SEASONS),)):
        lines[(d, ev)].append((tot, sp))
    by_day_lines = defaultdict(list)
    for (d, ev), v in lines.items():
        t = [x[0] for x in v if x[0] is not None]
        s = [abs(x[1]) for x in v if x[1] is not None]
        by_day_lines[d].append((float(np.median(t)) if t else None, float(np.median(s)) if s else None))
    team_dates = defaultdict(set)
    mins = defaultdict(list)
    for tid, d, pid, m in conn.execute("""SELECT team_id, game_date, nba_player_id, min::float8 FROM nba_stats.player_game_log
                                          WHERE season = ANY(%s) ORDER BY game_date""", (list(SEASONS),)):
        team_dates[str(tid)].add(d)
        mins[pid].append((d, m or 0.0))
    inj = defaultdict(lambda: [0, 0])
    name_pid = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    for d, nm, st in conn.execute("""SELECT d, nba_ref.norm_name(split_part(player_name, ', ', 2) || ' ' || split_part(player_name, ', ', 1)),
                                            status_at_pick FROM nba_score.injury_asof_pick"""):
        if st == "Questionable":
            inj[d][1] += 1
        elif st in ("Out", "Doubtful"):
            pid = name_pid.get(nm)
            try:
                pidn = int(str(pid).replace("nba_", "")) if pid else None
            except ValueError:
                pidn = None
            hist = [m for (gd, m) in mins.get(pidn, []) if gd < d][-10:]
            if hist and np.mean(hist) >= 24:
                inj[d][0] += 1
    out = {}
    for (s, d), legs in days.items():
        teams = {str(l["team_id"]) for l in legs if l["team_id"] is not None}
        games = len({l["event_id"] for l in legs if l["event_id"] is not None})
        b2b = np.mean([1.0 if (d - dt.timedelta(days=1)) in team_dates.get(t, ()) else 0.0 for t in teams]) if teams else np.nan
        rest = []
        for t in teams:
            prev = [x for x in team_dates.get(t, ()) if x < d]
            if prev:
                rest.append(min((d - max(prev)).days, 5))
        ln = [x for x in by_day_lines.get(d, []) if x[0] is not None and x[1] is not None]
        R = [l for l in legs if l["tier"] == "R" and l["p"] is not None]
        tiers = [l["tier"] for l in legs]
        n = max(len(legs), 1)
        out[(s, d)] = {
            "games": games,
            "mean_total": float(np.mean([x[0] for x in ln])) if ln else np.nan,
            "max_spread": float(np.max([x[1] for x in ln])) if ln else np.nan,
            "blowout_share": float(np.mean([x[1] >= 10 for x in ln])) if ln else np.nan,
            "b2b_share": float(b2b),
            "mean_rest": float(np.mean(rest)) if rest else np.nan,
            "key_injuries": inj[d][0] if d in inj else 0,
            "questionable": inj[d][1] if d in inj else 0,
            "legs": len(legs),
            "std_share": sum(t == "R" for t in tiers) / n,
            "goblin_share": sum(t.startswith("G") for t in tiers) / n,
            "demon_share": sum(t.startswith("D") for t in tiers) / n,
            "lowvol_share": sum(l["prop"] in LOWVOL for l in legs) / n,
            "legs_per_game": len(legs) / max(games, 1),
            "std_ge60": sum(l["p"] >= 0.60 for l in R),
            "std_ge65": sum(l["p"] >= 0.65 for l in R),
            "std_ge70": sum(l["p"] >= 0.70 for l in R),
            "std_disp": float(np.std([l["p"] for l in R])) if R else np.nan,
            "month": d.month if d.month >= 10 else d.month + 12,
        }
    return out


def main():
    t0 = time.time()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    days = RC.load(conn)
    by_season = {s: sorted(d for (ss, d) in days if ss == s) for s in SEASONS}
    feat = features(conn, days)
    print(f"slates {', '.join(f'{s} {len(v)}' for s, v in by_season.items())}; features {len(next(iter(feat.values())))} | {time.time() - t0:.0f}s",
          flush=True)
    cand = defaultdict(list)
    for (s, d), legs in days.items():
        for u in UNITS:
            if u[0] == "calib":
                for slip in CS.unit_slips(legs, u[1], u[2], KMAX):
                    cand[(u, s, d)].append((slip, None))
    for pool in ("_wo", "_wo_nosteals"):
        for u in [u for u in UNITS if u[0] == pool]:
            for season, d, k, legs, sg in conn.execute(
                    f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{pool}
                        WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'
                        ORDER BY game_date, k""", (u[1], u[2], u[3], KMAX)):
                if season in SEASONS and (season, d) in days:
                    cand[(u, season, d)].append((legs, bool(sg and sg > 0)))
    gcache = {}

    def pay(u, s, d, i):
        key = (u, s, d, i)
        if key not in gcache:
            legs, sg = cand[(u, s, d)][i]
            sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in legs]
            gcache[key] = SE.grade(sl, u[3], same_game=sg)[1]
        return gcache[key]

    def port_day(units, s, d, n=2, lcap=2):
        taken, use, seen = [], defaultdict(int), set()
        for k in range(KMAX):
            for u in units:
                lst = cand.get((u, s, d))
                if not lst or k >= len(lst) or len(taken) >= n:
                    continue
                keys = list(dict.fromkeys(legkey(l) for l in lst[k][0]))
                sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                if sig in seen or any(use[x] >= lcap for x in keys):
                    continue
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append((u, k))
            if len(taken) >= n:
                break
        return (len(taken), sum(pay(u, s, d, k) - 1.0 for u, k in taken)) if taken else (0, 0.0)

    # per slate outcomes: each unit's k=1 slip and the live pair
    unit_day = {}
    for s in SEASONS:
        for d in by_season[s]:
            for u in UNITS:
                if cand.get((u, s, d)):
                    unit_day[(u, s, d)] = (1, pay(u, s, d, 0) - 1.0)
            unit_day[("PAIR", s, d)] = port_day([REB4F, CAL3P], s, d)
    print(f"outcomes built | {time.time() - t0:.0f}s", flush=True)

    def agg(key, s, dset):
        st = [unit_day[(key, s, d)][0] for d in dset if (key, s, d) in unit_day and unit_day[(key, s, d)][0] > 0]
        pr = [unit_day[(key, s, d)][1] for d in dset if (key, s, d) in unit_day and unit_day[(key, s, d)][0] > 0]
        return (sum(pr) / sum(st) if st else float("nan"), len(st), sum(pr))

    fnames = list(next(iter(feat.values())).keys())
    keys_all = ["PAIR"] + UNITS

    print("\n" + "=" * 200 + "\nFEATURE DISTRIBUTIONS (per season: p10 / median / p90)")
    for f in fnames:
        print(f"  {f:<14} " + " | ".join(
            f"{s}: " + " / ".join(f"{np.nanpercentile([feat[(s, d)][f] for d in by_season[s]], q):.2f}" for q in (10, 50, 90)) for s in SEASONS))

    print("\n" + "=" * 200 + "\n1. FEATURE TERCILES (cut points from the discovery season; ROI % (days) per bin: low | mid | high)")
    consistent = []
    for disc, test in (SEASONS, SEASONS[::-1]):
        print(f"\n  cut points from {disc}")
        for f in fnames:
            vals = [feat[(disc, d)][f] for d in by_season[disc] if feat[(disc, d)][f] == feat[(disc, d)][f]]
            q1, q2 = np.percentile(vals, [33.3, 66.7])
            if q1 == q2:
                continue

            def bin_of(x, q1=q1, q2=q2):
                return None if x != x else (0 if x <= q1 else (1 if x <= q2 else 2))
            row = []
            for key in keys_all:
                res = {}
                for s in SEASONS:
                    bins = [[d for d in by_season[s] if bin_of(feat[(s, d)][f]) == b] for b in range(3)]
                    res[s] = [agg(key, s, b) for b in bins]
                worst = {s: int(np.nanargmin([r[0] if r[1] >= 8 else np.nan for r in res[s]])) if any(r[1] >= 8 for r in res[s]) else None
                         for s in SEASONS}
                cons = worst[disc] is not None and worst[disc] == worst[test] and all(res[s][worst[s]][0] < 0 for s in SEASONS)
                if cons:
                    consistent.append((disc, f, key if key == "PAIR" else tag(key), worst[disc], (q1, q2), res))
                if key in ("PAIR", REB4F, CAL3P):
                    row.append(f"{'PAIR' if key == 'PAIR' else tag(key)}: " + " ; ".join(
                        f"{s[2:]} " + " | ".join(f"{100 * r[0]:+.0f}({r[1]})" for r in res[s]) for s in SEASONS) + (" *CONSISTENT*" if cons else ""))
            print(f"    {f:<14} cuts {q1:.2f} / {q2:.2f}\n      " + "\n      ".join(row))
    print("\n  CONSISTENT WORST BINS (same tercile worst AND negative in both seasons, every unit):")
    for disc, f, k, b, cuts, res in consistent:
        print(f"    cuts from {disc}: {f:<14} bin {['low', 'mid', 'high'][b]} ({cuts[0]:.2f} / {cuts[1]:.2f}) {k:<40} " + " ; ".join(
            f"{s}: " + " | ".join(f"{100 * r[0]:+.0f}({r[1]})" for r in res[s]) for s in SEASONS))

    print("\n" + "=" * 200 + "\n2. PRE-REGISTERED HIERARCHY (A <= 4 games: A1 max spread < 10, A2 >= 10; B 5-8: B1 key injuries <= 2, B2 > 2; "
          "C >= 9: C1 back-to-back share < 0.25, C2 >= 0.25)")

    def prof(x):
        if x["games"] <= 4:
            return "A1" if (x["max_spread"] == x["max_spread"] and x["max_spread"] < 10) else "A2"
        if x["games"] <= 8:
            return "B1" if x["key_injuries"] <= 2 else "B2"
        return "C1" if x["b2b_share"] < 0.25 else "C2"
    PROF = ("A1", "A2", "B1", "B2", "C1", "C2")
    for s in SEASONS:
        cnt = defaultdict(int)
        for d in by_season[s]:
            cnt[prof(feat[(s, d)])] += 1
        print(f"  {s} slates per profile: " + ", ".join(f"{p} {cnt[p]}" for p in PROF))
    for key in keys_all:
        print(f"    {('PAIR (live)' if key == 'PAIR' else tag(key)):<42} " + " ; ".join(
            f"{s[2:]} " + " ".join(f"{p}:{100 * r[0]:+.0f}({r[1]})" for p in PROF
                                   for r in [agg(key, s, [d for d in by_season[s] if prof(feat[(s, d)]) == p])]) for s in SEASONS))

    print("\n" + "=" * 200 + "\n3. RULES ON THE LIVE PAIR - chosen on one season, tested untouched on the other")
    # swap candidates inside the owner's rule (4+ picks Flex only); every structure is still REPORTED in sections 1-2
    alts = [u for u in UNITS if u not in (REB4F, CAL3P) and (u[3] == "flex" or u[2] <= 3)]

    def pair_with(rule, s, d):
        f, b, cuts, action, alt = rule
        x = feat[(s, d)][f] if f != "profile" else prof(feat[(s, d)])
        hit = (x == b) if f == "profile" else (x == x and (0 if x <= cuts[0] else (1 if x <= cuts[1] else 2)) == b)
        if not hit:
            return unit_day[("PAIR", s, d)]
        if action == "skip3P":
            return port_day([REB4F], s, d, n=1)
        if action == "skip4F":
            return port_day([CAL3P], s, d, n=1)
        if action == "skipall":
            return (0, 0.0)
        return port_day([REB4F, alt], s, d)

    def score(rule, s):
        st, pr = [], []
        for d in by_season[s]:
            a, b = pair_with(rule, s, d)
            if a:
                st.append(a); pr.append(b)
        return {"net": sum(pr), "roi": sum(pr) / sum(st) if st else float("nan"), "lb5": lb5(pr, st), "slips": sum(st)}
    base = {s: score(("games", -1, (0, 0), "none", None), s) for s in SEASONS}
    print("  baseline pair: " + " | ".join(f"{s}: net {base[s]['net']:+.1f} ROI {100 * base[s]['roi']:+.1f}% lb5 {100 * base[s]['lb5']:+.1f}% "
                                          f"slips {base[s]['slips']}" for s in SEASONS))
    holds = []
    for disc, test in (SEASONS, SEASONS[::-1]):
        rules = []
        for f in fnames + ["profile"]:
            if f == "profile":
                bins = [(p, (0, 0)) for p in PROF]
            else:
                vals = [feat[(disc, d)][f] for d in by_season[disc] if feat[(disc, d)][f] == feat[(disc, d)][f]]
                q1, q2 = np.percentile(vals, [33.3, 66.7])
                if q1 == q2:
                    continue
                bins = [(b, (q1, q2)) for b in range(3)]
            for b, cuts in bins:
                ndays = sum(1 for d in by_season[disc]
                            if (prof(feat[(disc, d)]) == b if f == "profile" else
                                (feat[(disc, d)][f] == feat[(disc, d)][f] and (0 if feat[(disc, d)][f] <= cuts[0] else
                                                                             (1 if feat[(disc, d)][f] <= cuts[1] else 2)) == b)))
                if ndays < 15:
                    continue
                for action, alt in [("skip3P", None), ("skip4F", None), ("skipall", None)] + [("swap", a) for a in alts]:
                    rules.append((f, b, cuts, action, alt))
        scored = [(score(r, disc)["net"] - base[disc]["net"], r) for r in rules]
        scored.sort(key=lambda x: -x[0])
        print(f"\n  discovery {disc} ({len(rules)} rules) -> test {test}: top 25 by discovery gain")
        for gain, r in scored[:25]:
            t = score(r, test)
            ok = t["net"] > base[test]["net"] and gain > 0
            what = r[3] if r[3] != "swap" else "swap 3P -> " + tag(r[4])
            binname = r[1] if r[0] == "profile" else ["low", "mid", "high"][r[1]]
            print(f"    {r[0]:<14} {binname:<5} cuts {r[2][0]:.2f}/{r[2][1]:.2f} {what:<46} disc gain {gain:+6.1f} | TEST net {t['net']:+6.1f} "
                  f"(base {base[test]['net']:+6.1f}) ROI {100 * t['roi']:+5.1f}% lb5 {100 * t['lb5']:+5.1f}%{' HOLDS-ONE-WAY' if ok else ''}")
            if ok:
                holds.append((disc, r, gain, t))
    print("\n  rules that held in BOTH directions (same feature, bin and action, chosen independently on each season):")
    seen = defaultdict(list)
    for disc, r, gain, t in holds:
        seen[(r[0], r[1] if r[0] == "profile" else r[1], r[3], tag(r[4]) if r[4] else "")].append((disc, gain, t))
    for k, v in seen.items():
        if len({x[0] for x in v}) == 2:
            print(f"    {k}: " + " | ".join(f"chosen on {x[0]} gain {x[1]:+.1f}, test net {x[2]['net']:+.1f} lb5 {100 * x[2]['lb5']:+.1f}%" for x in v))
    print(f"\ndone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
