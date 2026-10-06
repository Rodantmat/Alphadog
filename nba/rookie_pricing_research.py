#!/usr/bin/env python3
"""
ROOKIE DEBUT PRICING - RESEARCH (strategy doc §31s, G3). Read-only (repo files + board legs from the DB).
The builder projects a player from his second game on; only the DEBUT has no history. For every rookie's debut (2024-25, 2025-26):
  mean      - the cross-fitted blend validated in rookie_prior_research.py (draft-tier prior + preseason, k / w chosen on the other
              seasons; 0.25 weight per preseason game)
  spread    - negative binomial per stat, dispersion r fitted by moments on TRAINING-season rookies' first-5 game-level outcomes
              around their blend means; combos = sum of component means and variances (covariance ignored - stated approximation,
              exposed by the calibration check)
  price     - P(over line) for every real PrizePicks window leg on the rookie's debut date (half-point lines; whole numbers via
              P(stat > k) with ties void)
Scored against the debut box score: calibration bins and log-loss vs a 50% coin flip. Env: DATABASE_URL.
"""
import json
import math
import os
from collections import defaultdict
from pathlib import Path

import psycopg
from scipy import stats as st

D = Path("nba/data")
STATS = ["MIN", "PTS", "REB", "AST", "FG3M", "STL", "BLK", "TOV"]
SEASONS = ["2023_24", "2024_25", "2025_26"]
COMBO = {"points": ["PTS"], "rebounds": ["REB"], "assists": ["AST"], "threes_made": ["FG3M"], "steals": ["STL"], "blocks": ["BLK"],
         "turnovers": ["TOV"], "pts_reb": ["PTS", "REB"], "pts_ast": ["PTS", "AST"], "reb_ast": ["REB", "AST"],
         "pra": ["PTS", "REB", "AST"], "stocks": ["STL", "BLK"]}
PROP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes": "threes_made", "steals": "steals", "blocks": "blocks",
        "turnovers": "turnovers", "points_rebounds": "pts_reb", "points_assists": "pts_ast", "rebounds_assists": "reb_ast",
        "points_rebounds_assists": "pra", "blocks_steals": "stocks"}


def load(name):
    j = json.loads((D / name).read_text())
    for k in ("records", "rows", "players"):
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
    seen = set(); rookies = {}
    for s in SEASONS:
        by = defaultdict(list)
        for r in reg[s]:
            by[int(r["PLAYER_ID"])].append(r)
        for pid, rows in by.items():
            dy = str(bio.get(pid, {}).get("draft_year", ""))
            if pid in seen or not ((dy == s[:4]) or (dy.lower().startswith("undrafted") and s != SEASONS[0])):
                continue
            rows = sorted(rows, key=lambda r: r["GAME_DATE"]); played = [r for r in rows[:5] if float(r.get("MIN") or 0) > 0]
            if len(played) < 3:
                continue
            rookies[(s, pid)] = {"tier": tier(bio.get(pid, {}).get("draft_number")), "games": played,
                                 "first5": {k: sum(float(r.get(k) or 0) for r in played) / len(played) for k in STATS},
                                 "debut": rows[0], "pre": [r for r in pre[s] if int(r["PLAYER_ID"]) == pid and float(r.get("MIN") or 0) > 0]}
        seen |= set(by)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    cal = defaultdict(lambda: [0, 0, 0.0]); ll = [0.0, 0.0, 0]
    for test in ("2024_25", "2025_26"):
        train = [v for (s, _), v in rookies.items() if s != test]
        acc = defaultdict(lambda: defaultdict(list))
        for v in train:
            for k in STATS:
                acc[v["tier"]][k].append(v["first5"][k])
        allm = {k: sum(v["first5"][k] for v in train) / len(train) for k in STATS}
        tp = {t: {k: (sum(x) / len(x) if len(x) >= 5 else allm[k]) for k, x in d.items()} for t, d in acc.items()}
        rat = sorted(v["first5"]["MIN"] / (sum(float(g["MIN"]) for g in v["pre"]) / len(v["pre"])) for v in train if v["pre"])
        ratio = rat[len(rat) // 2]
        def blend(v, k_ghost=2.0, w=0.25):
            t = tp.get(v["tier"], allm)
            if not v["pre"]:
                return dict(t)
            mins = sum(float(g["MIN"]) for g in v["pre"]); gm = mins / len(v["pre"]) * ratio; g = len(v["pre"])
            p = {k: (gm if k == "MIN" else sum(float(x.get(k) or 0) for x in v["pre"]) / mins * gm) for k in STATS}
            return {k: (k_ghost * t[k] + w * g * p[k]) / (k_ghost + w * g) for k in STATS}
        # dispersion r per stat (moments, training rookies' game-level outcomes around their blend means)
        r_of = {}
        for k in STATS[1:]:
            num = den = 0.0
            for v in train:
                m = max(blend(v)[k], 0.05)
                for gme in v["games"]:
                    y = float(gme.get(k) or 0); num += m * m; den += max((y - m) ** 2 - m, 0.0)
            r_of[k] = max(num / den, 0.5) if den > 0 else 50.0
        tests = {pid: v for (s, pid), v in rookies.items() if s == test}
        legs = conn.execute("""WITH b AS (SELECT DISTINCT p.game_date, p.player, p.base_market, p.side, p.line FROM nba_market.pp_leg_price p
                                  WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
                                    AND p.game_date = ANY(%s))
                               SELECT b.game_date, nm.player_id::bigint, replace(replace(b.base_market,'player_',''),'_alternate',''), b.side, b.line::float
                               FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)""",
                            ([str(v["debut"]["GAME_DATE"])[:10] for v in tests.values()],)).fetchall()
        n_t = 0
        for gd, pid, mk, side, line in legs:
            v = tests.get(int(pid)); prop = PROP.get(mk)
            if not v or not prop or str(v["debut"]["GAME_DATE"])[:10] != str(gd) or float(v["debut"].get("MIN") or 0) <= 0:
                continue
            m_all = blend(v); comps = COMBO[prop]
            mu = sum(m_all[c] for c in comps); var = sum(m_all[c] + m_all[c] ** 2 / r_of[c] for c in comps)
            mu = max(mu, 0.05); var = max(var, mu * 1.0001)
            r = mu * mu / (var - mu); pr = r / (r + mu)
            y = sum(float(v["debut"].get(c) or 0) for c in comps)
            if y == line:
                continue                                          # tie -> void
            p_over = float(st.nbinom.sf(math.floor(line), r, pr))
            p = p_over if side == "Over" else 1 - p_over; won = (y > line) if side == "Over" else (y < line)
            p = min(max(p, 1e-4), 1 - 1e-4)
            b = min(int(p * 10), 9); c = cal[b]; c[0] += int(won); c[1] += 1; c[2] += p
            ll[0] -= math.log(p) if won else math.log(1 - p); ll[1] -= math.log(0.5); ll[2] += 1; n_t += 1
        print(f"  {test}: {len(tests)} rookies, {n_t} debut board legs scored; dispersion r {', '.join(f'{k} {r_of[k]:.1f}' for k in STATS[1:])}", flush=True)
    print("\nROOKIE DEBUT PRICING - calibration on real debut board legs (both test seasons):", flush=True)
    for b in range(10):
        c = cal[b]
        if c[1]:
            print(f"   pred {10*b:>2}-{10*b+10:<3}%  n {c[1]:>4}  mean pred {100*c[2]/c[1]:5.1f}%  actual {100*c[0]/c[1]:5.1f}%", flush=True)
    if ll[2]:
        print(f"   log-loss {ll[0]/ll[2]:.4f} vs coin flip {ll[1]/ll[2]:.4f} ({ll[2]} legs)", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
