#!/usr/bin/env python3
"""
RESEARCH - FOLLOW-UP ON THE TWO SIGNALS THAT POINTED THE SAME WAY IN BOTH SEASONS (2026-10-17).  READ-ONLY.

research_streak_signals.py (run 39097173249) used the 'window' game line. Live never writes a 'window' game line - only P2B's
08:00 PT 'morning' capture (capture_game_lines_morning.py) - so everything here uses the MORNING total, the line live has.

1. A_regular_5power: slips holding an Under leg in a game whose morning total >= T (230 / 234 / 238) vs the rest,
   both seasons; controlled for the number of Under legs (the effect must hold among slips with the same Under count);
   leg-level: Under-leg hit by morning total; a permutation p (the 'high-total' label shuffled among the season's slips, 5,000x).
   The same table for the other live strategies (does it generalise, or is it A_regular only).
2. Flag-day permutation p for the simple day flags (legs < 55% over the last 5 played days; 3 straight losing days), per live
   strategy: the flagged-day count is held, the days are drawn at random 5,000x; p = share with a flagged-vs-other ROI gap as
   large as observed.
Env: DATABASE_URL.
"""
import os
import random
from collections import defaultdict

import numpy as np
import psycopg

LABELS = {'2025-26': 's2526_cap2', '2024-25': 's2425_cap2'}
TOP = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
N = 5000
random.seed(20261017)
rng = np.random.default_rng(20261017)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rows = conn.execute("""
      WITH s AS (SELECT label, strategy, game_date, k, stake_weight st, profit pr, legs_json FROM nba_score.replay_audit_slips
                 WHERE label = ANY(%s) AND status IN ('graded', 'graded_void') AND strategy = ANY(%s)),
      l AS (SELECT s.label, s.strategy, s.game_date, s.k, s.st, s.pr, x.ord, x.leg->>'player' player, x.leg->>'side' side,
                   (x.leg->>'hit')::int hit, x.leg->>'cell' cell
            FROM s, jsonb_array_elements(s.legs_json) WITH ORDINALITY x(leg, ord)),
      m AS (SELECT DISTINCT ON (norm_name) norm_name, player_id FROM nba_ref.player_name_map ORDER BY norm_name, player_id),
      g AS (SELECT l.*, t.full_name team_name
            FROM l LEFT JOIN m ON m.norm_name = nba_ref.norm_name(l.player)
            LEFT JOIN nba_stats.player_game_log pg ON pg.nba_player_id::text = m.player_id::text AND pg.game_date = l.game_date
            LEFT JOIN nba_ref.teams t ON t.team_id = pg.team_id),
      gl AS (SELECT game_date, replace(home_team, 'Los Angeles Clippers', 'LA Clippers') home_team,
                    replace(away_team, 'Los Angeles Clippers', 'LA Clippers') away_team, point::float point
             FROM nba_market.game_lines_snapshots
             WHERE snapshot_label = 'morning' AND market = 'totals' AND outcome ILIKE 'over' AND game_date IN (SELECT DISTINCT game_date FROM l)),
      tl AS (SELECT game_date, team, percentile_disc(0.5) WITHIN GROUP (ORDER BY point) total
             FROM (SELECT game_date, home_team team, point FROM gl UNION ALL SELECT game_date, away_team, point FROM gl) u GROUP BY 1, 2)
      SELECT g.label, g.strategy, g.game_date, g.k, g.st, g.pr, g.ord, g.side, g.hit, g.cell, tl.total
      FROM g LEFT JOIN tl ON tl.game_date = g.game_date AND tl.team = g.team_name
      ORDER BY g.label, g.strategy, g.game_date, g.k, g.ord""", (list(LABELS.values()), TOP)).fetchall()
    season_of = {v: k for k, v in LABELS.items()}
    legs = [dict(zip(['label', 'strategy', 'd', 'k', 'st', 'pr', 'ord', 'side', 'hit', 'cell', 'total'], r)) for r in rows]
    for x in legs:
        x['season'] = season_of[x['label']]
    print(f"legs {len(legs):,}; with a MORNING total {sum(1 for x in legs if x['total'] is not None):,}", flush=True)
    slips = defaultdict(list)
    for x in legs:
        slips[(x['season'], x['strategy'], x['d'], x['k'])].append(x)

    def roi(group):
        st = sum(v[0]['st'] for v in group); pr = sum(v[0]['pr'] for v in group)
        return (pr / st if st else 0.0)

    def is_hi(v, T):
        return any(x['side'] == 'Under' and x['total'] is not None and x['total'] >= T for x in v)

    print("\n== 1. SLIPS WITH AN UNDER LEG IN A HIGH MORNING-TOTAL GAME vs THE REST (ROI (slips), permutation p) ==", flush=True)
    for strat in TOP:
        for T in (230, 234, 238):
            parts = []
            for season in LABELS:
                mine = [v for (se, s, d, k), v in slips.items() if se == season and s == strat]
                lab = np.array([is_hi(v, T) for v in mine], dtype=bool)
                hi = [v for v, b in zip(mine, lab) if b]; lo = [v for v, b in zip(mine, lab) if not b]
                more = 0
                if hi and lo:
                    st = np.array([v[0]['st'] for v in mine], dtype=float); pr = np.array([v[0]['pr'] for v in mine], dtype=float)
                    perm = np.array([rng.permutation(lab) for _ in range(N)])            # N x slips
                    hs, hp = perm @ st, perm @ pr; os_, op = st.sum() - hs, pr.sum() - hp
                    gaps = op / os_ - hp / hs
                    more = int((gaps >= roi(lo) - roi(hi)).sum())
                parts.append(f"{season} with {roi(hi):+5.0%} ({len(hi):4d}) vs without {roi(lo):+5.0%} ({len(lo):4d}) p {more / N:.3f}")
            print(f"  {strat:<18} T={T} " + " | ".join(parts), flush=True)

    print("\n  -- A_regular_5power, controlled for the number of Under legs (T = 234): ROI with / without, by Under count", flush=True)
    for season in LABELS:
        mine = [v for (se, s, d, k), v in slips.items() if se == season and s == 'A_regular_5power']
        byu = defaultdict(lambda: ([], []))
        for v in mine:
            nu = sum(1 for x in v if x['side'] == 'Under')
            byu[nu][0 if is_hi(v, 234) else 1].append(v)
        print(f"    {season}: " + "  ".join(f"{nu} Unders: with {roi(a):+.0%} ({len(a)}) without {roi(b):+.0%} ({len(b)})" for nu, (a, b) in sorted(byu.items())), flush=True)

    print("\n  -- leg level: Under-leg hit by morning total, per strategy (<230 / 230-234 / >=234)", flush=True)
    for strat in TOP:
        parts = []
        for season in LABELS:
            b = defaultdict(lambda: [0, 0])
            for x in legs:
                if x['season'] == season and x['strategy'] == strat and x['side'] == 'Under' and x['hit'] is not None and x['total'] is not None:
                    kb = '<230' if x['total'] < 230 else ('230-234' if x['total'] < 234 else '>=234')
                    b[kb][0] += x['hit']; b[kb][1] += 1
            parts.append(season + " " + " ".join(f"{kb} {100 * b[kb][0] / b[kb][1]:.1f}% ({b[kb][1]})" for kb in ('<230', '230-234', '>=234') if b[kb][1]))
        print(f"    {strat:<18} " + " | ".join(parts), flush=True)
    print("  -- leg level by cell, A_regular_5power Unders, >=234 vs <234", flush=True)
    for season in LABELS:
        b = defaultdict(lambda: [0, 0, 0, 0])
        for x in legs:
            if x['season'] == season and x['strategy'] == 'A_regular_5power' and x['side'] == 'Under' and x['hit'] is not None and x['total'] is not None:
                i = 0 if x['total'] >= 234 else 2
                b[x['cell']][i] += x['hit']; b[x['cell']][i + 1] += 1
        print(f"    {season}: " + "  ".join(f"{c} {100 * v[0] / v[1] if v[1] else 0:.0f}%({v[1]}) vs {100 * v[2] / v[3] if v[3] else 0:.0f}%({v[3]})" for c, v in sorted(b.items())), flush=True)

    print("\n== 2. SIMPLE DAY FLAGS - permutation p (flagged-day count held, days drawn at random) ==", flush=True)
    for strat in TOP:
        for rule in ('legs<55%/5d', '3 losing days'):
            parts = []
            for season in LABELS:
                days = sorted({d for (se, s, d, k) in slips if se == season and s == strat})
                byday = {d: [v for (se, s, dd, k), v in slips.items() if se == season and s == strat and dd == d] for d in days}
                flagged = set(); run = 0; hist = []
                for d in days:
                    if rule == '3 losing days':
                        on = run >= 3
                    else:
                        l5 = hist[-5:]; nl = sum(a for a, _ in l5); on = bool(l5) and nl > 0 and sum(b for _, b in l5) / nl < 0.55
                    if on:
                        flagged.add(d)
                    dayl = [x for v in byday[d] for x in v if x['hit'] is not None]
                    run = run + 1 if sum(v[0]['pr'] for v in byday[d]) <= 0 else 0
                    hist.append((len(dayl), sum(x['hit'] for x in dayl)))

                def gap_of(fs):
                    f = [v for d in days if d in fs for v in byday[d]]; o = [v for d in days if d not in fs for v in byday[d]]
                    return roi(o) - roi(f), roi(f), roi(o)
                g, rf, ro = gap_of(flagged)
                more = sum(1 for _ in range(2000) if gap_of(set(random.sample(days, len(flagged))))[0] >= g) if flagged else 2000
                parts.append(f"{season} {len(flagged):3d}/{len(days)}d flagged {rf:+5.0%} other {ro:+5.0%} p {more / 2000:.3f}")
            print(f"  {strat:<18} {rule:<14} " + " | ".join(parts), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
