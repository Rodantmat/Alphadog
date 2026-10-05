#!/usr/bin/env python3
"""
ROSTER COVERAGE AUDIT (strategy doc §31r) - read-only. The ladder builder projects, for each game, only the players who
appeared in that team's LAST 3 GAMES of the current season (build_baseline_ladder.py). This measures, on two seasons of real
PrizePicks window boards, how many board players who actually PLAYED that day could not have been projected, and why:
  team_games_1_3  - the team's first 3 games of the season (no 3-game history yet)
  changed_team    - the player's previous appearance was for another team (trade / signing)
  returning       - played for this team earlier in the season, but not in its last 3 games (back from absence)
  other           - none of the above (e.g. first appearance of the season for a player new to the league)
Env: DATABASE_URL.
"""
import os
from collections import Counter, defaultdict

import psycopg


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    gl = conn.execute("""SELECT nba_player_id, team_id, season, game_date, coalesce(min, 0) FROM nba_stats.player_game_log
                         WHERE game_date BETWEEN '2024-10-01' AND '2026-04-30'""").fetchall()
    team_dates = defaultdict(set)
    for pid, tid, s, d, m in gl:
        team_dates[(tid, s)].add(d)
    team_seq = {k: sorted(v) for k, v in team_dates.items()}
    team_rank = {k: {d: i for i, d in enumerate(v, start=1)} for k, v in team_seq.items()}
    apps = defaultdict(set)            # (pid, tid, season) -> team-game ranks appeared in
    by_player = defaultdict(list)      # pid -> [(date, tid, season, min)]
    for pid, tid, s, d, m in gl:
        apps[(pid, tid, s)].add(team_rank[(tid, s)][d])
        by_player[pid].append((d, tid, s, float(m)))
    for v in by_player.values():
        v.sort()
    board = conn.execute("""WITH b AS MATERIALIZED (SELECT DISTINCT game_date, player FROM nba_market.board_snapshots
                                WHERE bookmaker='prizepicks' AND snapshot_label='window' AND game_date BETWEEN '2024-10-22' AND '2026-04-12')
                            SELECT DISTINCT b.game_date, nm.player_id::bigint FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)""").fetchall()
    played = {}
    for pid, rows in by_player.items():
        for d, tid, s, m in rows:
            if m > 0:
                played[(d, pid)] = (tid, s)
    tot = Counter(); cause = Counter(); examples = defaultdict(list)
    for d, pid in board:
        if (d, pid) not in played:
            continue
        tid, s = played[(d, pid)]
        rn = team_rank[(tid, s)][d]
        tot[s] += 1
        if any(rn - 3 <= r <= rn - 1 for r in apps[(pid, tid, s)]):
            continue
        prev = [x for x in by_player[pid] if x[0] < d and x[3] > 0]
        if rn <= 3:
            c = 'team_games_1_3'
        elif prev and prev[-1][1] != tid:
            c = 'changed_team'
        elif any(r < rn - 3 for r in apps[(pid, tid, s)]):
            c = 'returning'
        else:
            c = 'other'
        cause[(s, c)] += 1
        if len(examples[(s, c)]) < 4:
            examples[(s, c)].append((str(d), pid))
    print("ROSTER COVERAGE AUDIT - PrizePicks window board players who PLAYED that day but were not in the ladder roster", flush=True)
    for s in sorted(tot):
        miss = sum(v for (ss, c), v in cause.items() if ss == s)
        print(f"\n{s}: {tot[s]:,} board player-days played; NOT PROJECTABLE {miss:,} ({100*miss/tot[s]:.2f}%)", flush=True)
        for c in ('team_games_1_3', 'changed_team', 'returning', 'other'):
            print(f"   {c:<16} {cause[(s, c)]:>5}  e.g. {examples[(s, c)]}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
