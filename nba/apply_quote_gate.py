#!/usr/bin/env python3
"""
THE QUOTE GATE (2026-10-22, owner 14:52-15:22 PT: "whatever shows there, I put ... don't let anything that's not allowed go on that
screen"; "you need to be sure you are reading and mapping properly the multipliers"). Runs right after P3's slip quotes
(nba-pp-payout-map.yml mode slipq stores PrizePicks' OWN quote of every engine slip in nba_score.live_slip_quotes).

For the slate (QG_DATE, default today PT), every PrizePicks slip the engine marked 'placed' or 'placed_backup' is checked against its
LATEST PrizePicks quote:
  FAIL  no quote / not quoted (status <> 200) / a leg no longer on PrizePicks' board as built (unmapped - moved, pulled, or a
        different line type, e.g. a goblin where the engine read a standard), or
  FAIL  PrizePicks' all-hit payout below pp_portfolio.quote_min_ratio (default 0.95) x the payout the engine's grader assumed for it
        (build_slip_engine.pp_payout: the backtest's own pricing - a slip PrizePicks cuts (same-game demons: 10-22 6x vs 6.66x, 7x
        vs 9x) is no longer the bet the backtest measured).
Portfolio slips (live_slip_engine.PORTFOLIO_UNITS) are walked in the engine's round-robin order (rank k, then unit order): the
first n that PASS are 'placed'; a placed slip that fails becomes 'placed_quote_skip'; a passing backup is promoted to 'placed' while
fewer than n are placed; the rest stay 'placed_backup'. Any other strategy's placed slip that fails becomes 'placed_quote_skip'.
The thin-night fallback (pp_fallback.strategy, 2026-10-27) is walked the same way on its own, k order, cap pp_fallback.slips.
Every change is printed and noted on the slip (streak_note). Idempotent: re-running after a re-quote re-applies the rule to the
latest quotes (a demoted slip that now passes is restored while the portfolio is short). Env: DATABASE_URL, QG_DATE, QG_DRY=1.
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE   # noqa: E402

PORTFOLIO_PREFIX = 'P_'


def model_payout(legs, size, structure):
    fp = 1.0
    for l in legs:
        fp *= float(l.get('factor') or 1.0)
    alt = any(abs(float(l.get('factor') or 1.0) - 1.0) > 1e-9 for l in legs)
    evs = [l.get('event_id') for l in legs if l.get('event_id')]
    sg = len(evs) > len(set(evs))
    return SE.pp_payout(size, size, structure, fp, alt, same_game=sg)


def main():
    day = dt.date.fromisoformat(os.environ.get('QG_DATE') or dt.datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat())
    dry = os.environ.get('QG_DRY') == '1'
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='pp_portfolio'").fetchone()
    pf = (row[0] if row and isinstance(row[0], dict) else json.loads(row[0])) if row else {}
    n = int(pf.get('n', 2))
    ratio = float(pf.get('quote_min_ratio', 0.95))
    order = pf.get('order', [])
    # the thin-night fallback (classification_config['pp_fallback'], live_slip_engine.fallback_slips) is gated on its own: its first
    # fb.slips passing slips (k order) are 'placed', a failed placed slip is replaced by the next passing 'placed_backup'
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='pp_fallback'").fetchone()
    fbc = (row[0] if row and isinstance(row[0], dict) else json.loads(row[0])) if row else {}
    fb_strat, fb_n = fbc.get('strategy', 'P_FB_U3power'), int(fbc.get('slips', 2))
    slips = conn.execute("""SELECT strategy, k, legs_json, size, structure, status FROM nba_score.live_slips
                            WHERE game_date=%s AND status IN ('placed', 'placed_backup', 'placed_quote_skip')""", (day,)).fetchall()
    quotes = {}
    for strategy, k, status, power, flex, legs in conn.execute(
            """SELECT DISTINCT ON (strategy, k) strategy, k, status, power, flex, legs FROM nba_score.live_slip_quotes
               WHERE game_date=%s ORDER BY strategy, k, quoted_at DESC""", (day,)).fetchall():
        quotes[(strategy, k)] = (status, power, flex, legs)
    print(f"QUOTE GATE {day}: {len(slips)} placed / backup / gate-skipped PrizePicks slips, {len(quotes)} quoted; n {n}, min ratio {ratio}", flush=True)

    def verdict(strategy, k, legs, size, structure):
        q = quotes.get((strategy, k))
        if q is None:
            return False, "no PrizePicks quote"
        status, power, flex, qlegs = q
        js = (lambda v: v if isinstance(v, (dict, list)) or v is None else json.loads(v))
        if status != 200:
            lg = js(qlegs) or {}
            if isinstance(lg, dict) and lg.get('unmapped'):
                return False, "not on PrizePicks' board as built: " + "; ".join(lg['unmapped'])
            return False, f"PrizePicks did not quote it (status {status})"
        tb = js(flex if structure == 'flex' else power) or {}
        full = (tb.get(str(size)) or {}).get(str(size))
        if full is None:
            return False, "PrizePicks' quote has no all-hit payout"
        mp = model_payout(legs, size, structure)
        if float(full) < ratio * mp - 1e-9:
            return False, f"PrizePicks pays {float(full):g}x, the backtest priced it {mp:.2f}x (below {ratio:g})"
        return True, f"PrizePicks {float(full):g}x vs backtest {mp:.2f}x"

    changes = []
    port = [s for s in slips if (s[0] in order or s[0].startswith(PORTFOLIO_PREFIX)) and s[0] != fb_strat]
    # the engine's own round robin: rank k first, then the unit order (live_slip_engine.portfolio_select)
    port.sort(key=lambda s: (s[1], order.index(s[0]) if s[0] in order else 99))
    fbs = sorted([s for s in slips if s[0] == fb_strat], key=lambda s: s[1])

    def walk(group, cap):
        placed = 0
        for strategy, k, legs, size, structure, status in group:
            legs = legs if isinstance(legs, list) else json.loads(legs)
            ok, why = verdict(strategy, k, legs, size, structure)
            if ok and placed < cap:
                new = 'placed'
                placed += 1
            elif ok:
                new = 'placed_backup'
            else:
                new = 'placed_quote_skip' if status != 'placed_backup' else 'placed_backup'
            print(f"  {strategy} k{k} {status} -> {new}: {why}", flush=True)
            if new != status:
                changes.append((new, f"quote gate: {why}", strategy, k))
        return placed

    placed_n = walk(port, n)
    if fbs:
        fb_placed = walk(fbs, fb_n)
        print(f"QUOTE GATE {day}: thin-night fallback {fb_strat} placed {fb_placed} of {fb_n} ({len(fbs)} built incl. backups)", flush=True)
        if fb_placed < fb_n:
            print(f"::warning::quote gate: only {fb_placed} of {fb_n} fallback slips passed PrizePicks' quote on {day}", flush=True)
    for strategy, k, legs, size, structure, status in slips:
        if (strategy, k) in {(p[0], p[1]) for p in port + fbs} or status != 'placed':
            continue
        legs = legs if isinstance(legs, list) else json.loads(legs)
        ok, why = verdict(strategy, k, legs, size, structure)
        print(f"  {strategy} k{k} {status} -> {'placed' if ok else 'placed_quote_skip'}: {why}", flush=True)
        if not ok:
            changes.append(('placed_quote_skip', f"quote gate: {why}", strategy, k))
    print(f"QUOTE GATE {day}: portfolio slips placed {placed_n} of {n}; {len(changes)} status changes{' (DRY RUN - nothing written)' if dry else ''}", flush=True)
    if placed_n < n:
        print(f"::warning::quote gate: only {placed_n} of {n} portfolio slips passed PrizePicks' quote on {day}", flush=True)
    if not dry:
        for new, note, strategy, k in changes:
            conn.execute("""UPDATE nba_score.live_slips SET status=%s, streak_note = coalesce(streak_note || '; ', '') || %s
                            WHERE game_date=%s AND strategy=%s AND k=%s""", (new, note, day, strategy, k))
        conn.commit()


if __name__ == "__main__":
    main()
