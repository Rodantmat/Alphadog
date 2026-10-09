#!/usr/bin/env python3
"""
PROBE - the live engine's postseason pick path on past postseason slates, WITHOUT writing anything (§31w P-6 verification).

For each probe date (PROBE_DATES, default three 2025-26 postseason nights: a play-in night, a first-round night, a Finals night):
  1. confirms live_slip_engine.postseason_slate() says yes (and says no for a regular-season control date);
  2. loads the board exactly as the live pick does (load_board_legs - pp_leg_price + final_hp, team/event resolution through the
     slate predicate);
  3. runs pick_postseason() inside a transaction whose commit is disabled, prints what it would have staked / shadowed, and
     ROLLS BACK - nba_score.live_slips / live_pool are left exactly as they were (verified by row counts before and after);
  4. (§31z) Playoff Unders parity: each P_unders slip the live pick builds must equal the certified backtest's slip for that
     night (nba_score.playoff_unders_slips), after the market-free rescoring below (names compared accent-insensitively).
Env: DATABASE_URL, PROBE_DATES (comma list), PROBE_CONTROL (a regular-season date).
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as LS  # noqa: E402
import build_tier_map_legs_postseason as TMP  # noqa: E402  (the certified map's market-free score, ONE definition)

# A past slate's nba_score.final_hp.score carries the sportsbook market term (the feed existed then); live has no feed, so a
# live night's score IS market-free - the score the postseason map was built on. To replay a past night the way live would
# see it, the probe rescores final_score with the map builder's own statement (its _fh temp table), inside the rolled-back
# transaction. final_hp / baseline_hp are untouched (identical in both).
MF_STEP = next(st for st in TMP.STEPS if st.lstrip().startswith("CREATE TEMP TABLE _fh"))


def market_free(conn, d, legs):
    conn.execute(MF_STEP)
    mf = {(str(r[0]), r[1], r[2], float(r[3])): r[4] for r in conn.execute(
        "SELECT player_id, prop, side, line, s_score FROM _fh WHERE game_date=%s", (d,)).fetchall()}
    n = 0
    for l in legs:
        if l['rank_key'] == 'final_score' and not l.get('whole_number'):
            v = mf.get((str(l['player_id']), l['prop'], l['side'], float(l['line'])))
            if v is not None and v != l['score']:
                l['score'] = v
                n += 1
    # re-rank the final_score cells exactly as the loader does (score DESC, player, side, line)
    from collections import defaultdict
    groups = defaultdict(list)
    for l in legs:
        if l['rank_key'] == 'final_score':
            groups[(l['prop'], l['tier'])].append(l)
    for g in groups.values():
        g.sort(key=lambda l: (-l['score'], l['player'], l['side'], float(l['line'])))
        for i, l in enumerate(g, start=1):
            l['n_rank'] = i
    return n


def nm(x):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', x) if not unicodedata.combining(c)).lower()


class NoCommit:
    """psycopg connection proxy: commit() is a no-op, everything else passes through (the probe rolls back at the end)."""
    def __init__(self, conn):
        self._c = conn

    def commit(self):
        return None

    def __getattr__(self, name):
        return getattr(self._c, name)


def counts(conn):
    return (conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0],
            conn.execute("SELECT count(*) FROM nba_score.live_pool").fetchone()[0])


def main():
    dates = [dt.date.fromisoformat(x.strip()) for x in os.environ.get("PROBE_DATES", "2026-04-15,2026-04-25,2026-06-10").split(",") if x.strip()]
    control = dt.date.fromisoformat(os.environ.get("PROBE_CONTROL", "2026-03-15"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    before = counts(conn)
    conn.commit()
    print(f"ledger before: live_slips {before[0]:,} rows, live_pool {before[1]:,} rows", flush=True)
    print(f"control {control}: postseason_slate = {LS.postseason_slate(conn, control)} (expected False)", flush=True)
    ok = not LS.postseason_slate(conn, control)
    for d in dates:
        is_post = LS.postseason_slate(conn, d)
        print(f"\n=== {d}: postseason_slate = {is_post}", flush=True)
        ok &= is_post
        legs = LS.load_board_legs(conn, d)
        print(f"  market-free rescoring (as live scores it): {market_free(conn, d, legs):,} final_score values replaced", flush=True)
        n_board = len({(l['player_id'], l['prop'], l['tier'], l['side'], l['line']) for l in legs if not l.get('whole_number')})
        print(f"  board: {len(legs):,} rank-key rows, {n_board:,} unique scored legs, team resolved "
              f"{sum(1 for l in legs if l.get('team_id'))/max(len(legs), 1):.1%}, event resolved {sum(1 for l in legs if l.get('event_id'))/max(len(legs), 1):.1%}",
              flush=True)
        nc = NoCommit(conn)
        LS.pick_postseason(nc, d, legs)
        rows = conn.execute("""SELECT strategy, status, count(*), max(size) FROM nba_score.live_slips WHERE game_date=%s
                               AND status IN ('placed_post','placed_post_shadow') GROUP BY 1,2 ORDER BY 1""", (d,)).fetchall()
        for r in rows:
            print(f"    would record: {r[0]:<20} {r[1]:<20} {r[2]} slip(s)", flush=True)
        # PLAYOFF UNDERS PARITY (§31z): the live slip must be the slip the certification backtested for this night
        # (nba_score.playoff_unders_slips, written by certify_postseason_strategies.py from playoff_unders.backtest)
        live = conn.execute("""SELECT strategy, legs_json FROM nba_score.live_slips WHERE game_date=%s AND strategy LIKE 'P\\_unders\\_%%'""",
                            (d,)).fetchall()
        for strat, lj in live:
            lj = lj if isinstance(lj, list) else __import__('json').loads(lj)
            mine = sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in lj)
            bt = conn.execute("SELECT legs_json FROM nba_score.playoff_unders_slips WHERE strategy=%s AND game_date=%s", (strat, d)).fetchone()
            if bt is None:
                print(f"    PARITY {strat}: no backtest slip for this night (live built {len(mine)} legs) -> MISMATCH", flush=True)
                ok = False
                continue
            bj = bt[0] if isinstance(bt[0], list) else __import__('json').loads(bt[0])
            theirs = sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in bj)
            same = mine == theirs
            ok &= same
            print(f"    PARITY {strat}: live == certified backtest -> {'MATCH' if same else 'MISMATCH'}", flush=True)
            for l in mine:
                print(f"        {l[0]:<26} {l[1]:<12} {l[2]:<6} {l[3]:>5}", flush=True)
            if not same:
                print(f"        backtest had: {theirs}", flush=True)
        conn.rollback()
    after = counts(conn)
    print(f"\nledger after rollback: live_slips {after[0]:,}, live_pool {after[1]:,} -> {'UNCHANGED' if after == before else 'CHANGED (!)'}", flush=True)
    ok &= after == before
    conn.close()
    print("PROBE", "PASS" if ok else "FAIL", flush=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
