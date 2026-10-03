#!/usr/bin/env python3
"""
PARITY TEST - PrizePicks live leg source vs the backtest's prop_universe path (strategy doc §31a).
For every historical slate where BOTH paths can run (prop_universe real legs + pp_leg_price window legs):
  LEGS   old = load_board_legs_universe, new = load_board_legs_live; keyed by (canonical name, prop, side, line, tier, rank_key)
         common / old-only / new-only; new-only classified SUFFIX (raw name keeps Jr/Sr/II/III that the canonical resolver strips -
         the documented bug the universe path had) or OTHER (must be investigated); on common legs every field compared:
         price, score, team_id, event_id, player_id
  SLIPS  every live strategy built from each leg set with the pick's own pool code (attach_pf20 -> ENG.eligible_legs ->
         trailing10 + leg_allowed -> family exclusions -> side filter -> ENG.build_day_slips with the correlation map, cap max(cap,1));
         identical / differ, and whether each difference involves a new-only (suffix) leg
Env: DATABASE_URL, PAR_MAX_DATES (0 = all).
"""
import os
import re
import sys
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402
ENG = L.ENG


def canon_cache(conn):
    cache = {}
    def f(name):
        if name not in cache:
            cache[name] = conn.execute("SELECT nba_ref.norm_name(%s)", (name,)).fetchone()[0]
        return cache[name]
    return f


def is_suffix(raw, canon):
    return re.sub(r'[^a-z]', '', raw.lower()) != canon


def build_all(conn, day, legs, cmap):
    L.attach_pf20(conn, day, legs)
    pool = ENG.eligible_legs(legs)
    t10 = L.trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
    pool = {c: [l for l in v if L.leg_allowed(l, t10)] for c, v in pool.items()}
    pools = {'': pool}
    for fam, excl in L.EXCLUDE_BY_FAMILY.items():
        pools[fam] = {c: v for c, v in pool.items() if c not in excl}
    out = {}
    for name, (comp, size, structure, cap, *_r) in L.STRATEGIES.items():
        fam_pool = pools.get(name[0], pool)
        side_only = L.SIDE_FILTER_BY_STRATEGY.get(name)
        if side_only:
            fam_pool = {c: [l for l in v if l['side'] == side_only] for c, v in fam_pool.items()}
        slips = ENG.build_day_slips(fam_pool, comp, size, structure, max(cap, 1), cmap)
        out[name] = [tuple(sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in s)) for s in slips]
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    canon = canon_cache(conn)
    days = [r[0] for r in conn.execute("""
        SELECT DISTINCT u.game_date FROM nba_market.prop_universe u
        WHERE u.line_source='real' AND u.phase='regular'
          AND EXISTS (SELECT 1 FROM nba_market.pp_leg_price p WHERE p.game_date=u.game_date AND p.snapshot_label='window')
        ORDER BY 1""").fetchall()]
    mx = int(os.environ.get('PAR_MAX_DATES') or '0')
    if mx:
        step = max(1, len(days) // mx); days = days[::step][:mx]
    print(f"parity over {len(days)} slates ({days[0]} .. {days[-1]})", flush=True)
    cmap = ENG.load_corr(conn)
    tot = Counter(); field_mis = Counter(); other_examples = []; slip_diff_examples = []; grade_examples = []
    for i, day in enumerate(days, 1):
        old = L.load_board_legs_universe(conn, day); new = L.load_board_legs_live(conn, day)
        ko = {(canon(l['player']), l['prop'], l['side'], float(l['line']), l['tier'], l['rank_key']): l for l in old}
        kn = {(canon(l['player']), l['prop'], l['side'], float(l['line']), l['tier'], l['rank_key']): l for l in new}
        common = ko.keys() & kn.keys(); only_old = ko.keys() - kn.keys(); only_new = kn.keys() - ko.keys()
        tot['legs_old'] += len(ko); tot['legs_new'] += len(kn); tot['common'] += len(common); tot['only_old'] += len(only_old)
        suffix_new = {k for k in only_new if is_suffix(kn[k]['player'], k[0])}
        tot['only_new_suffix'] += len(suffix_new); tot['only_new_other'] += len(only_new) - len(suffix_new)
        for k in list(only_new - suffix_new)[:2] + list(only_old)[:2]:
            if len(other_examples) < 15:
                other_examples.append((str(day), 'new-only' if k in kn else 'old-only', k, (kn.get(k) or ko.get(k))['player']))
        for k in common:
            a, b = ko[k], kn[k]
            for f in ('factor', 'score', 'team_id', 'event_id', 'player_id'):
                va, vb = a.get(f), b.get(f)
                if (isinstance(va, float) or isinstance(vb, float)) and va is not None and vb is not None:
                    same = abs(float(va) - float(vb)) < 1e-9
                else:
                    same = str(va) == str(vb)
                if not same:
                    field_mis[f] += 1
                    if f in ('team_id', 'event_id') and len(other_examples) < 25:
                        other_examples.append((str(day), f'{f} differs', k, f"old {va} new {vb}"))
        so = build_all(conn, day, old, cmap); sn = build_all(conn, day, new, cmap)
        new_only_players = {kn[k]['player'] for k in only_new}
        for name in so:
            if so[name] == sn[name]:
                tot['slips_identical'] += 1
            else:
                involves = any(p in new_only_players for s in sn[name] for (p, *_r) in s)
                tot['slips_differ_suffix' if involves else 'slips_differ_other'] += 1
                if not involves and len(slip_diff_examples) < 10:
                    slip_diff_examples.append((str(day), name, so[name][:1], sn[name][:1]))
        if i % 25 == 0:
            print(f"  {i}/{len(days)} | {dict(tot)} | field mismatches {dict(field_mis)}", flush=True)
        # GRADING PARITY: the live strategies' backtest slips on this date, graded both ways
        srows = conn.execute("""SELECT 'bt', k, legs_json FROM nba_score.slip_engine_slips WHERE game_date=%s AND k <= 6
                                UNION ALL SELECT 'bt', k, legs_json FROM nba_score.slip_engine_slips_nosteals WHERE game_date=%s AND k <= 3""",
                             (day, day)).fetchall()
        old_out = {(p, pr, s, float(ln)): h for p, pr, s, ln, h in conn.execute("""SELECT player, prop, side, line, hit::int FROM nba_market.prop_universe
                     WHERE game_date=%s AND line_source='real' AND hit IS NOT NULL""", (day,)).fetchall()}
        new_out = L.outcomes_boxscore(conn, day, srows); new_out.pop('__boxscores__', None)
        seen_legs = set()
        for _t, _k, legs in srows:
            for l in (legs if isinstance(legs, list) else __import__('json').loads(legs)):
                key = (l['player'], l['prop'], l['side'], float(l['line']))
                if key in seen_legs:
                    continue
                seen_legs.add(key)
                o, n = old_out.get(key), new_out.get(key)
                cls = ('g_same' if o == n else 'g_old_void_new_graded' if o is None else 'g_old_graded_new_void' if n is None else 'g_OPPOSITE')
                tot[cls] += 1
                if cls in ('g_old_graded_new_void', 'g_OPPOSITE') and len(grade_examples) < 20:
                    grade_examples.append((str(day), cls, key, o, n))
                if cls == 'g_old_void_new_graded':
                    tot['g_old_void_new_graded_suffix' if is_suffix(l['player'], canon(l['player'])) else 'g_old_void_new_graded_other'] += 1
    print("\n== RESULT ==", flush=True)
    for k, v in tot.items():
        print(f"  {k:<22} {v:,}", flush=True)
    print(f"  field mismatches on common legs: {dict(field_mis) or 'none'}", flush=True)
    print("  examples (non-suffix new-only / old-only / team-event differences):", flush=True)
    for e in other_examples:
        print(f"    {e}", flush=True)
    print("  slip differences NOT explained by a suffix leg:", flush=True)
    for e in slip_diff_examples:
        print(f"    {e}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
