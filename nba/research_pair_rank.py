#!/usr/bin/env python3
"""BEST PAIRINGS - which ranking really finds the easiest legs (owner 2026-11-07: Wemby blocks Under 3.5 'p 90%' topped every list, the market says ~35-55%).
Every leg of nba_score.board_true_hp (all rungs, both sides) with its outcome from the box score; per slate the top-N legs (one a player) by each rule,
hit rate over all slates / the recent ones. READ-ONLY."""
import os, collections, statistics
import psycopg
STAT = {"points": lambda r: r[0], "rebounds": lambda r: r[1], "assists": lambda r: r[2], "threes_made": lambda r: r[3], "steals": lambda r: r[4], "blocks": lambda r: r[5],
        "turnovers": lambda r: r[6], "stocks": lambda r: r[4] + r[5], "pra": lambda r: r[0] + r[1] + r[2], "pts_reb": lambda r: r[0] + r[1], "pts_ast": lambda r: r[0] + r[2],
        "reb_ast": lambda r: r[1] + r[2]}
c = psycopg.connect(os.environ["DATABASE_URL"]); c.execute("SET statement_timeout = 0")
box = {}
for d, p, pts, reb, ast, fg3, stl, blk, tov, mn in c.execute("SELECT game_date, nba_player_id::text, pts, reb, ast, fg3m, stl, blk, tov, min FROM nba_stats.player_game_log WHERE min > 0").fetchall():
    box[(d, p)] = (pts, reb, ast, fg3, stl, blk, tov)
days = [r[0] for r in c.execute("SELECT DISTINCT game_date FROM nba_score.board_true_hp WHERE game_date < current_date ORDER BY 1").fetchall()]
print("slates", len(days), days[0], days[-1], flush=True)
RULES = {
  "model_hp (today's rule)": lambda m, t, k: m,
  "true_hp (market-anchored)": lambda m, t, k: t,
  "min(model, market) [market rows only]": lambda m, t, k: min(m, k) if k is not None else None,
  "mean(model, market) [market rows only]": lambda m, t, k: (m + k) / 2 if k is not None else None,
  "min(model, true_hp)": lambda m, t, k: min(m, t),
}
res = {n: {"all": collections.defaultdict(list), "recent": collections.defaultdict(list)} for n in RULES}
for i, d in enumerate(days):
    rows = c.execute("SELECT player_id::text, prop, side, line::float, model_hp::float, true_hp::float, market_hp::float FROM nba_score.board_true_hp WHERE game_date=%s AND model_hp IS NOT NULL AND true_hp IS NOT NULL", (d,)).fetchall()
    legs = []
    for p, prop, side, line, m, t, k in rows:
        if prop not in STAT or (d, p) not in box: continue
        v = STAT[prop](box[(d, p)])
        if v == line: continue
        hit = (v > line) if side == "Over" else (v < line)
        legs.append((p, m, t, k, hit))
    recent = i >= len(days) - 25
    for n, f in RULES.items():
        sc = [(f(m, t, k), p, hit) for p, m, t, k, hit in legs]
        sc = [x for x in sc if x[0] is not None]
        sc.sort(key=lambda x: -x[0])
        seen, pick = set(), []
        for s_, p, hit in sc:
            if p in seen: continue
            seen.add(p); pick.append(hit)
            if len(pick) == 8: break
        if len(pick) < 3: continue
        for tag in ("all",) + (("recent",) if recent else ()):
            res[n][tag]["top3"].append(sum(pick[:3]) / 3); res[n][tag]["top8"].append(sum(pick) / len(pick)); res[n][tag]["all8"].append(all(pick[:8]) if len(pick) >= 8 else None)
            res[n][tag]["n3"].append(all(pick[:3]))
for n in RULES:
    for tag in ("all", "recent"):
        r = res[n][tag]
        if not r["top3"]: continue
        print(f"{n:42s} {tag:6s} slates {len(r['top3']):3d}  top3 hit {100*statistics.mean(r['top3']):5.1f}%  top8 hit {100*statistics.mean(r['top8']):5.1f}%  all-3-hit days {100*statistics.mean(r['n3']):5.1f}%", flush=True)
