#!/usr/bin/env python3
"""
ROOKIE GAMES 2-5 PRICING - RESEARCH (strategy doc §31s G3; COMPASS facts 130, 134). Read-only (repo files + board legs from DB).
The builder needs ~5 prior competitive games before it projects a player (mu_role min_periods 5; rookies have no carryover), so a
rookie's games 2-5 are unpriced. Unlike the debut (which FAILED: log-loss 0.908 vs 0.693), real NBA games now exist. For game g:
  mean   = (k * TIER + n * OBS) / (k + n), n = g - 1 NBA games played so far, OBS = his per-game averages over them, TIER = the
           cross-fitted draft-tier prior (other seasons); k chosen on the OTHER seasons by next-game MAE (cross-fit)
  spread = negative binomial per stat, dispersion fitted by moments on the training seasons' rookies (games 2-5, around this mean)
  price  = P(over line) for every real PrizePicks window leg in that game (half-point lines; ties void)
Scored on the box score: calibration, log-loss vs a coin flip (0.693), per game number g. Env: DATABASE_URL.
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
         "turnovers": ["TOV"], "pts_reb": ["PTS", "REB"], "pts_ast": ["PTS", "AST"], "reb_ast": ["REB", "AST"], "pra": ["PTS", "REB", "AST"],
         "stocks": ["STL", "BLK"]}
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
    seen = set(); rookies = {}
    for s in SEASONS:
        by = defaultdict(list)
        for r in reg[s]:
            by[int(r["PLAYER_ID"])].append(r)
        for pid, rows in by.items():
            dy = str(bio.get(pid, {}).get("draft_year", ""))
            if pid in seen or not ((dy == s[:4]) or (dy.lower().startswith("undrafted") and s != SEASONS[0])):
                continue
            g = [r for r in sorted(rows, key=lambda r: r["GAME_DATE"]) if float(r.get("MIN") or 0) > 0][:6]
            if len(g) >= 3:
                rookies[(s, pid)] = {"tier": tier(bio.get(pid, {}).get("draft_number")), "games": g}
        seen |= set(by)
    def avg(games):
        return {k: sum(float(x.get(k) or 0) for x in games) / len(games) for k in STATS}
    def mean_for(v, gidx, tp, allm, k):
        t = tp.get(v["tier"], allm); n = gidx                       # games 1..gidx observed (0-based gidx = next game index)
        o = avg(v["games"][:n])
        return {s_: (k * t[s_] + n * o[s_]) / (k + n) for s_ in STATS}
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    cal = defaultdict(lambda: [0, 0, 0.0]); ll_by_g = defaultdict(lambda: [0.0, 0])
    for test in ("2024_25", "2025_26"):
        train = [v for (s, _), v in rookies.items() if s != test]
        acc = defaultdict(lambda: defaultdict(list))
        for v in train:
            first5 = avg(v["games"][:5])
            for s_ in STATS:
                acc[v["tier"]][s_].append(first5[s_])
        allm = {s_: sum(avg(v["games"][:5])[s_] for v in train) / len(train) for s_ in STATS}
        tp = {t: {s_: (sum(x) / len(x) if len(x) >= 5 else allm[s_]) for s_, x in d.items()} for t, d in acc.items()}
        # k by next-game MAE on the TRAINING rookies (games 2-5)
        def mae_k(k):
            e = n = 0
            for v in train:
                for gi in range(1, min(5, len(v["games"]))):
                    m = mean_for(v, gi, tp, allm, k)
                    e += sum(abs(m[s_] - float(v["games"][gi].get(s_) or 0)) for s_ in STATS[1:]); n += 1
            return e / max(n, 1)
        k_best = min((0.5, 1, 2, 3, 5, 8, 12, 20), key=mae_k)
        r_of = {}
        for s_ in STATS[1:]:
            num = den = 0.0
            for v in train:
                for gi in range(1, min(5, len(v["games"]))):
                    m = max(mean_for(v, gi, tp, allm, k_best)[s_], 0.05); y = float(v["games"][gi].get(s_) or 0)
                    num += m * m; den += max((y - m) ** 2 - m, 0.0)
            r_of[s_] = max(num / den, 0.5) if den > 0 else 50.0
        tests = {pid: v for (s, pid), v in rookies.items() if s == test}
        want = {}                                                   # (date, pid) -> game index 1..4 (games 2-5)
        for pid, v in tests.items():
            for gi in range(1, min(5, len(v["games"]))):
                want[(str(v["games"][gi]["GAME_DATE"])[:10], pid)] = gi
        dates = sorted({d for d, _ in want})
        legs = conn.execute("""WITH b AS (SELECT DISTINCT p.game_date, p.player, p.base_market, p.side, p.line FROM nba_market.pp_leg_price p
                                  WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
                                    AND p.game_date = ANY(%s) AND p.line <> floor(p.line))
                               SELECT b.game_date::text, nm.player_id::bigint, replace(replace(b.base_market,'player_',''),'_alternate',''), b.side, b.line::float
                               FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)""", (dates,)).fetchall()
        n_t = 0
        for gd, pid, mk, side, line in legs:
            gi = want.get((gd, int(pid))); prop = PROP.get(mk)
            if gi is None or not prop:
                continue
            v = tests[int(pid)]; m = mean_for(v, gi, tp, allm, k_best); comps = COMBO[prop]
            mu = max(sum(m[c] for c in comps), 0.05); var = max(sum(m[c] + m[c] ** 2 / r_of[c] for c in comps), mu * 1.0001)
            r = mu * mu / (var - mu); pr = r / (r + mu)
            y = sum(float(v["games"][gi].get(c) or 0) for c in comps)
            p_over = float(st.nbinom.sf(math.floor(line), r, pr))
            p = min(max(p_over if side == "Over" else 1 - p_over, 1e-4), 1 - 1e-4)
            won = (y > line) if side == "Over" else (y < line)
            b = min(int(p * 10), 9); c = cal[b]; c[0] += int(won); c[1] += 1; c[2] += p
            L = ll_by_g[gi + 1]; L[0] -= math.log(p) if won else math.log(1 - p); L[1] += 1; n_t += 1
        print(f"  {test}: {len(tests)} rookies, k (cross-fit) {k_best}, {n_t} board legs in games 2-5", flush=True)
    print("\nROOKIE GAMES 2-5 - calibration (both test seasons):", flush=True)
    for b in range(10):
        c = cal[b]
        if c[1]:
            print(f"   pred {10*b:>2}-{10*b+10:<3}%  n {c[1]:>4}  mean pred {100*c[2]/c[1]:5.1f}%  actual {100*c[0]/c[1]:5.1f}%", flush=True)
    for g in sorted(ll_by_g):
        L = ll_by_g[g]
        print(f"   game {g}: log-loss {L[0]/L[1]:.4f} vs coin flip 0.6931 ({L[1]} legs)", flush=True)
    tot = [sum(v[0] for v in ll_by_g.values()), sum(v[1] for v in ll_by_g.values())]
    if tot[1]:
        print(f"   ALL games 2-5: log-loss {tot[0]/tot[1]:.4f} vs 0.6931 ({tot[1]} legs)", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
