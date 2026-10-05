#!/usr/bin/env python3
"""
ROOKIE PRIOR RESEARCH (strategy doc §31s, G3) - read-only, repo files only.
A rookie has no NBA history, so the builder cannot project him until he has played. This tests, OUT OF SAMPLE, which prior
built only from information available BEFORE his debut best predicts his first 5 regular-season games:
  TIER      - mean first-5 per-game stats of rookies from OTHER seasons in the same draft tier (1-5, 6-14, 15-30, 31-60, undrafted)
  PRESEASON - his preseason per-minute rates x (his preseason minutes x a preseason->regular minutes ratio learned on other seasons)
  BLEND     - shrinkage: (k*TIER + w*g*PRESEASON) / (k + w*g), g = preseason games, w = weight per preseason game, k ghost games;
              (k, w) chosen on the OTHER season (cross-fit), never on the season being scored
Rookies: draft_year == the season's start year, or undrafted with no game in any earlier season we hold. Seasons scored: 2024-25,
2025-26 (2023-24 rookies join the training pools). Metric: mean absolute error per stat on the first-5-game per-game averages.
"""
import json
from collections import defaultdict
from pathlib import Path

D = Path("nba/data")
STATS = ["MIN", "PTS", "REB", "AST", "FG3M", "STL", "BLK", "TOV"]
SEASONS = ["2023_24", "2024_25", "2025_26"]


def load(name):
    j = json.loads((D / name).read_text())
    for k in ("records", "rows", "players", "logs", "data"):
        if isinstance(j, dict) and isinstance(j.get(k), list):
            return j[k]
    return j if isinstance(j, list) else []


def tier(dn):
    try:
        n = int(dn)
    except (TypeError, ValueError):
        return "undrafted"
    return "1-5" if n <= 5 else "6-14" if n <= 14 else "15-30" if n <= 30 else "31-60"


def main():
    bio = {int(p["player_id"]): p for p in load("nba_player_bio_current.json")}
    reg = {s: load(f"nba_player_game_log_{s}.json") for s in SEASONS}
    pre = {s: load(f"nba_preseason_logs_{s}.json") for s in SEASONS}
    seen_before = set(); rookies = {}
    for s in SEASONS:
        start = int(s[:4]); by = defaultdict(list)
        for r in reg[s]:
            by[int(r["PLAYER_ID"])].append(r)
        for pid, rows in by.items():
            b = bio.get(pid, {})
            dy = str(b.get("draft_year", ""))
            is_rookie = (dy == str(start)) or (dy.lower().startswith("undrafted") and pid not in seen_before and s != SEASONS[0])
            if is_rookie and pid not in seen_before:
                rows = sorted(rows, key=lambda r: r["GAME_DATE"])[:5]
                played = [r for r in rows if float(r.get("MIN") or 0) > 0]
                if len(played) >= 3:
                    first5 = {k: sum(float(r.get(k) or 0) for r in played) / len(played) for k in STATS}
                    pg = [r for r in pre[s] if int(r["PLAYER_ID"]) == pid and float(r.get("MIN") or 0) > 0]
                    rookies[(s, pid)] = {"tier": tier(b.get("draft_number")), "first5": first5, "pre": pg}
        seen_before |= set(by)
    print("ROOKIE PRIOR RESEARCH (first-5 regular-season games)", flush=True)
    for s in SEASONS:
        n = [v for (ss, _), v in rookies.items() if ss == s]
        print(f"  {s}: {len(n)} rookies with >= 3 of their first 5 games played; with preseason data {sum(1 for v in n if v['pre'])}", flush=True)

    def tier_prior(train):
        acc = defaultdict(lambda: defaultdict(list))
        for v in train:
            for k in STATS:
                acc[v["tier"]][k].append(v["first5"][k])
        allm = {k: sum(v["first5"][k] for v in train) / max(len(train), 1) for k in STATS}
        return {t: {k: (sum(x) / len(x) if len(x) >= 5 else allm[k]) for k, x in d.items()} for t, d in acc.items()}, allm

    def min_ratio(train):
        r = [v["first5"]["MIN"] / (sum(float(g["MIN"]) for g in v["pre"]) / len(v["pre"])) for v in train if v["pre"]]
        r = sorted(r)
        return r[len(r) // 2] if r else 1.0

    def preseason_est(v, ratio):
        mins = sum(float(g["MIN"]) for g in v["pre"]); g_min = mins / len(v["pre"]) * ratio
        return {k: (g_min if k == "MIN" else sum(float(g.get(k) or 0) for g in v["pre"]) / mins * g_min) for k in STATS}

    def predict(v, tp, allm, ratio, k_ghost, w):
        t = tp.get(v["tier"], allm)
        if not v["pre"] or k_ghost is None:
            return dict(t)
        p = preseason_est(v, ratio); g = len(v["pre"])
        return {k: (k_ghost * t[k] + w * g * p[k]) / (k_ghost + w * g) for k in STATS}

    def mae(pairs):
        return {k: sum(abs(p[k] - a[k]) for p, a in pairs) / max(len(pairs), 1) for k in STATS}

    grid = [(k, w) for k in (1, 2, 4, 8, 16) for w in (0.25, 0.5, 1.0)]
    for test in ("2024_25", "2025_26"):
        train = [v for (s, _), v in rookies.items() if s != test]
        tests = [v for (s, _), v in rookies.items() if s == test]
        tp, allm = tier_prior(train); ratio = min_ratio(train)
        # choose (k, w) on the TRAIN rookies only (cross-fit)
        best = min(grid, key=lambda kw: sum(mae([(predict(v, tp, allm, ratio, *kw), v["first5"]) for v in train if v["pre"]]).values()))
        res = {}
        for label, kw in (("TIER", (None, 0)), ("PRESEASON", (1e-9, 1.0)), (f"BLEND k={best[0]} w={best[1]}", best)):
            res[label] = mae([(predict(v, tp, allm, ratio, *kw), v["first5"]) for v in tests if v["pre"]])
        print(f"\n  TEST {test} - {sum(1 for v in tests if v['pre'])} rookies with preseason data; min ratio (train) {ratio:.2f}; MAE per stat:", flush=True)
        print("    " + " ".join(f"{k:>6}" for k in STATS), flush=True)
        for label, m in res.items():
            print(f"    " + " ".join(f"{m[k]:6.2f}" for k in STATS) + f"   {label}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
