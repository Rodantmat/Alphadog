#!/usr/bin/env python3
"""
RESEARCH - LOSING-STRETCH SIGNALS, GAME SCRIPT AND SAME-GAME RISK (2026-10-17; owner: "Research online deeper, better strategies
and signals and how to identify it, as well as deep data analysis and debug").  READ-ONLY.

Data: every played slip of the live-loop replays at caps 2 (nba_score.replay_audit_slips, labels s2526_cap2 / s2425_cap2), its
legs (player, prop, side, line, hit), each leg's game from the box score, and the game's pregame line at the 'window' capture
(nba_market.game_lines_snapshots: median total and the team's spread - what live sees before the slips are placed).

A. GAME SCRIPT (pace / blowout; online: pace lifts counting stats, blowouts cut starters' minutes): leg hit rate by game total
   and by the team's spread, per cell and side, per season.
B. SAME-GAME RISK (shared downside): slips with 2+ legs from one game vs slips with every leg from a different game.
C. GAME-SCRIPT SLIP FILTER: slips holding an Under leg in a high-total game (>= T) vs the rest.
D. CUSUM STREAK FLAG (online change-point detection; Page's one-sided CUSUM on the strategy's legs, Bernoulli): for each leg in
   order, S = max(0, S + (p0 - k) - hit), p0 = the strategy's leg hit rate in the OTHER season (no lookahead), k = 0.04.
   The flag turns ON for the next day once S > h and OFF the day after S returns to 0 - an exact start and stop.
   Compared with the simple rules found earlier (A_core: legs < 55% over its last 5 days; A_regular: 3 straight losing days).
Every signal is reported for BOTH seasons; only one that points the same way in both is usable.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import psycopg

LABELS = {'2025-26': 's2526_cap2', '2024-25': 's2425_cap2'}
TOP = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']


def bucket_total(t):
    return None if t is None else ('<224' if t < 224 else ('224-232' if t <= 232 else '>232'))


def bucket_spread(s):
    return None if s is None else ('|spr|<4' if abs(s) < 4 else ('4-9' if abs(s) <= 9 else '>9'))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    # one row per leg of every played slip, with the leg's game and the team's pregame window line
    rows = conn.execute("""
      WITH s AS (SELECT label, strategy, game_date, k, stake_weight st, profit pr, legs_json FROM nba_score.replay_audit_slips
                 WHERE label = ANY(%s) AND status IN ('graded', 'graded_void') AND strategy = ANY(%s)),
      l AS (SELECT s.label, s.strategy, s.game_date, s.k, s.st, s.pr, x.ord, x.leg->>'player' player, x.leg->>'prop' prop, x.leg->>'side' side,
                   (x.leg->>'line')::float line, (x.leg->>'hit')::int hit, x.leg->>'cell' cell
            FROM s, jsonb_array_elements(s.legs_json) WITH ORDINALITY x(leg, ord)),
      m AS (SELECT DISTINCT ON (norm_name) norm_name, player_id FROM nba_ref.player_name_map ORDER BY norm_name, player_id),
      g AS (SELECT l.*, pg.game_id, pg.team_id, t.full_name team_name, pg.matchup LIKE '%% vs. %%' is_home
            FROM l LEFT JOIN m ON m.norm_name = nba_ref.norm_name(l.player)
            LEFT JOIN nba_stats.player_game_log pg ON pg.nba_player_id::text = m.player_id::text AND pg.game_date = l.game_date
            LEFT JOIN nba_ref.teams t ON t.team_id = pg.team_id),
      gl AS (SELECT game_date, replace(home_team, 'Los Angeles Clippers', 'LA Clippers') home_team, replace(away_team, 'Los Angeles Clippers', 'LA Clippers') away_team,
                    market, replace(outcome, 'Los Angeles Clippers', 'LA Clippers') outcome, point::float point FROM nba_market.game_lines_snapshots
             WHERE snapshot_label = 'window' AND market IN ('spreads', 'totals') AND game_date IN (SELECT DISTINCT game_date FROM l)),
      tl AS (SELECT game_date, team, percentile_disc(0.5) WITHIN GROUP (ORDER BY point) FILTER (WHERE market = 'totals') total,
                    percentile_disc(0.5) WITHIN GROUP (ORDER BY point) FILTER (WHERE market = 'spreads' AND outcome = team) spread
             FROM (SELECT game_date, home_team team, market, outcome, point FROM gl WHERE market = 'spreads' OR outcome ILIKE 'over'
                   UNION ALL SELECT game_date, away_team, market, outcome, point FROM gl WHERE market = 'spreads' OR outcome ILIKE 'over') u
             GROUP BY 1, 2),
      ln AS (SELECT g.label, g.strategy, g.game_date, g.k, g.ord, tl.total, tl.spread FROM g LEFT JOIN tl ON tl.game_date = g.game_date AND tl.team = g.team_name)
      SELECT g.label, g.strategy, g.game_date, g.k, g.st, g.pr, g.ord, g.player, g.prop, g.side, g.line, g.hit, g.cell, g.game_id, ln.total, ln.spread
      FROM g JOIN ln USING (label, strategy, game_date, k, ord) ORDER BY g.label, g.strategy, g.game_date, g.k, g.ord""",
                        (list(LABELS.values()), TOP)).fetchall()
    season_of = {v: k for k, v in LABELS.items()}
    legs = [dict(zip(['label', 'strategy', 'd', 'k', 'st', 'pr', 'ord', 'player', 'prop', 'side', 'line', 'hit', 'cell', 'game', 'total', 'spread'], r)) for r in rows]
    for x in legs:
        x['season'] = season_of[x['label']]
    print(f"legs {len(legs):,}; with a game {sum(1 for x in legs if x['game']):,}; with a total {sum(1 for x in legs if x['total'] is not None):,}; "
          f"with a spread {sum(1 for x in legs if x['spread'] is not None):,}", flush=True)

    # ---- A. leg hit by game script
    print("\n== A. LEG HIT RATE BY GAME SCRIPT (cell side: season -> bucket hit% (legs)) ==", flush=True)
    for name, fn, key in (('game total', bucket_total, 'total'), ('team spread', bucket_spread, 'spread')):
        agg = defaultdict(lambda: [0, 0])
        for x in legs:
            b = fn(x[key])
            if b is None or x['hit'] is None:
                continue
            a = agg[(x['cell'], x['side'], x['season'], b)]; a[0] += x['hit']; a[1] += 1
        cells = sorted({(c, s) for c, s, _, _ in agg})
        print(f"  -- by {name}", flush=True)
        for c, s in cells:
            if sum(v[1] for (cc, ss, _, _), v in agg.items() if cc == c and ss == s) < 300:
                continue
            parts = []
            for season in LABELS:
                bs = sorted({b for (cc, ss, se, b) in agg if cc == c and ss == s and se == season})
                parts.append(season + " " + "  ".join(f"{b} {100 * agg[(c, s, season, b)][0] / agg[(c, s, season, b)][1]:.1f}% ({agg[(c, s, season, b)][1]})" for b in bs))
            print(f"    {c:<14} {s:<5} | " + " | ".join(parts), flush=True)

    # slips
    slips = defaultdict(list)
    for x in legs:
        slips[(x['season'], x['strategy'], x['d'], x['k'])].append(x)

    def roi(group):
        st = sum(g[0]['st'] for g in group); pr = sum(g[0]['pr'] for g in group)
        return (pr / st if st else 0.0), len(group)

    # ---- B. same-game risk
    print("\n== B. SAME-GAME RISK: ROI of slips with 2+ legs from one game vs all legs from different games ==", flush=True)
    for strat in TOP:
        parts = []
        for season in LABELS:
            mine = [v for (se, s, d, k), v in slips.items() if se == season and s == strat]
            multi = [v for v in mine if len({x['game'] for x in v if x['game']}) < len([x for x in v if x['game']])]
            single = [v for v in mine if v not in multi]
            (rm, nm), (rs, ns) = roi(multi), roi(single)
            parts.append(f"{season} same-game {rm:+.0%} ({nm}) vs spread {rs:+.0%} ({ns})")
        print(f"  {strat:<18} " + " | ".join(parts), flush=True)

    # ---- C. game-script slip filter
    print("\n== C. SLIPS HOLDING AN UNDER LEG IN A HIGH-TOTAL GAME vs THE REST ==", flush=True)
    for T in (230, 234, 238):
        for strat in TOP:
            parts = []
            for season in LABELS:
                mine = [v for (se, s, d, k), v in slips.items() if se == season and s == strat]
                hi = [v for v in mine if any(x['side'] == 'Under' and x['total'] is not None and x['total'] >= T for x in v)]
                lo = [v for v in mine if v not in hi]
                (rh, nh), (rl, nl) = roi(hi), roi(lo)
                parts.append(f"{season} with {rh:+.0%} ({nh}) vs without {rl:+.0%} ({nl})")
            print(f"  total >= {T} {strat:<18} " + " | ".join(parts), flush=True)

    # ---- D. CUSUM streak flags
    print("\n== D. CUSUM STREAK FLAG (p0 = the other season's leg hit; k = 0.04) vs the simple rules ==", flush=True)
    p0 = {}
    for strat in TOP:
        for season in LABELS:
            hs = [x['hit'] for x in legs if x['strategy'] == strat and x['season'] == season and x['hit'] is not None]
            p0[(strat, season)] = sum(hs) / len(hs) if hs else 0.5
    other = {'2025-26': '2024-25', '2024-25': '2025-26'}
    for strat in TOP:
        for h in (1.0, 2.0, 3.0, 'simple'):
            parts = []
            for season in LABELS:
                days = sorted({d for (se, s, d, k) in slips if se == season and s == strat})
                byday = {d: [v for (se, s, dd, k), v in slips.items() if se == season and s == strat and dd == d] for d in days}
                flagged = set(); S = 0.0; on = False; run = 0; hist = []
                base = p0[(strat, other[season])]
                for d in days:
                    if h == 'simple':
                        if strat == 'A_regular_5power':
                            on = run >= 3
                        else:
                            l5 = hist[-5:]; nl = sum(a for a, _ in l5); on = bool(l5) and nl > 0 and sum(b for _, b in l5) / nl < 0.55
                    if on:
                        flagged.add(d)
                    dayl = [x for v in byday[d] for x in v if x['hit'] is not None]
                    for x in dayl:
                        S = max(0.0, S + (base - 0.04) - x['hit'])
                    if h != 'simple':
                        on = (S > h) if not on else (S > 0)       # ON once S > h, OFF once S is back to 0
                    dpr = sum(v[0]['pr'] for v in byday[d])
                    run = run + 1 if dpr <= 0 else 0
                    hist.append((len(dayl), sum(x['hit'] for x in dayl)))
                fl = [byday[d] for d in days if d in flagged]; ot = [byday[d] for d in days if d not in flagged]
                rf, nf = roi([v for g in fl for v in g]); ro, no = roi([v for g in ot for v in g])
                # equal budget, flagged days at half stake
                tot = sum(v[0]['st'] for g in fl + ot for v in g)
                new = sum(v[0]['st'] * (0.5 if d in flagged else 1) for d in days for v in byday[d])
                sc = tot / new if new else 1
                cum = pk = mdd = prof = 0.0
                for d in days:
                    p = sum(v[0]['pr'] for v in byday[d]) * (0.5 if d in flagged else 1) * sc
                    prof += p; cum += p; pk = max(pk, cum); mdd = max(mdd, pk - cum)
                base_prof = sum(v[0]['pr'] for g in fl + ot for v in g)
                cum = pk = bdd = 0.0
                for d in days:
                    cum += sum(v[0]['pr'] for v in byday[d]); pk = max(pk, cum); bdd = max(bdd, pk - cum)
                parts.append(f"{season} flagged {len(flagged):3d}d {rf:+5.0%} vs other {ro:+5.0%}; half-stake profit {base_prof:+6.1f}->{prof:+6.1f} DD {bdd:4.1f}->{mdd:4.1f}")
            print(f"  {strat:<18} h={str(h):<6} " + " | ".join(parts), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
