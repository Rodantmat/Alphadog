#!/usr/bin/env python3
"""
RESEARCH - SCORE THE STREAK-FLAG REPLAYS (2026-10-17).  READ-ONLY.

The live-loop replays run with the streak flags ON (audit_season_replay with LS_STREAK_RULES=on LS_STREAK_SHIFT=on LS_UNIT_USD=2,
caps 2; labels s2526_streak / s2425_streak). The stake factor never changes what is built or any strategy state (hurdles run on
unit profit), so ONE replay holds all three variants:
  base         every played slip at its own weight with the flag's x0.5 undone, shift slips left out
  half         the weights as placed (flagged A_core / A_regular days at half), shift slips left out
  half+shift   as placed, plus the extra A_wrebounds slips built while A_core was flagged
Scored per portfolio at EQUAL BUDGET (each variant's stakes scaled so its total stake equals base's): ROI, net, max drawdown
(daily), in units. Env: DATABASE_URL, SS_LABELS (default s2526_streak,s2425_streak).
"""
import os
from collections import defaultdict

import psycopg

LABELS = os.environ.get('SS_LABELS', 's2526_streak,s2425_streak').split(',')
SIX = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
PORTS = {'all six': SIX, 'five (no C_wstocks)': [s for s in SIX if s != 'C_wstocks_4flex'],
         'top 3': ['A_regular_5power', 'A_core_3power', 'A_wrebounds_4flex'], 'top 2': ['A_regular_5power', 'A_core_3power']}


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    for label in LABELS:
        rows = conn.execute("""SELECT game_date, strategy, k, stake_weight, profit, coalesce(streak_note, '') FROM nba_score.replay_audit_slips
                               WHERE label=%s AND status IN ('graded','graded_void') AND strategy = ANY(%s)""", (label, SIX)).fetchall()
        print(f"\n######## {label}: {len(rows)} played slips", flush=True)
        if not rows:
            continue
        flagged = defaultdict(set); halved = defaultdict(int); kept = defaultdict(int); shifted = 0
        var = {'base': [], 'half': [], 'half+shift': []}
        for d, s, k, w, pr, note in rows:
            w = float(w); pr = float(pr)
            if note.startswith('streak flag'):
                flagged[s].add(d)
            is_half = '- stake x0.5' in note
            is_shift = 'streak shift' in note
            halved[s] += is_half; kept[s] += ('full stake kept' in note)
            shifted += is_shift
            w0 = w / 0.5 if is_half else w
            if not is_shift:
                var['base'].append((d, s, w0, pr)); var['half'].append((d, s, w, pr))
            var['half+shift'].append((d, s, w, pr))
        for s in SIX:
            print(f"  {s:<18} flagged days {len(flagged[s]):3d}  slips halved {halved[s]:4d}  full stake kept {kept[s]:3d}", flush=True)
        print(f"  shift slips (A_wrebounds extra while A_core flagged): {shifted}", flush=True)
        for pname, strats in PORTS.items():
            base_st = sum(w for d, s, w, pr in var['base'] if s in strats)
            out = []
            for vname, lst in var.items():
                lst = [x for x in lst if x[1] in strats]
                st = sum(w for d, s, w, pr in lst)
                sc = base_st / st if st else 1.0
                net = sum(w * pr for d, s, w, pr in lst) * sc
                byd = defaultdict(float)
                for d, s, w, pr in lst:
                    byd[d] += w * pr * sc
                cum = pk = dd = 0.0
                for d in sorted(byd):
                    cum += byd[d]; pk = max(pk, cum); dd = max(dd, pk - cum)
                out.append(f"{vname} {net / base_st if base_st else 0:+6.1%} / {net:+7.1f} / DD {dd:5.1f}")
            print(f"  {pname:<20} " + " | ".join(out), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
