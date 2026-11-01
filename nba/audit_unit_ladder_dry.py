#!/usr/bin/env python3
"""AUDIT (2026-11-01, the unit ladder): DRY RUN of the production unit rule on the real played slates, everything ROLLED BACK.
(1) ladder_from unset in-transaction -> unit_update's walk must reproduce today's live_unit_history row for row (no regression);
(2) ladder_from = AU_FROM (default 2026-10-30, a past slate so the new branch runs on real data) -> print each slate's unit and
reason and check the ladder rung by hand (25 x n(n-1)/2); (3) ladder_from = 2026-11-01 (the owner's switch date) -> every slate
before it identical to today's history. Nothing is committed (LS_UNIT_NO_PERSIST=1 and a final rollback). Env: DATABASE_URL, AU_FROM."""
import json
import os
import sys

os.environ["LS_UNIT_NO_PERSIST"] = "1"
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402


def rung(p, up=25.0, mx=15.0, floor=1.0):
    n = 1.0
    while n + 1 <= mx and p >= up * n * (n + 1) / 2:
        n += 1
    return max(n, floor)


def walk(conn, ladder_from):
    L._STAKE_UNIT = None
    cfg = L.stake_unit(conn)
    cfg.setdefault('auto', {})
    if ladder_from:
        cfg['auto']['ladder_from'] = ladder_from
    else:
        cfg['auto'].pop('ladder_from', None)
    a = L.unit_auto_cfg(conn)
    s0 = __import__('datetime').date.fromisoformat(str(a['count_from'])[:10])
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM (
                SELECT game_date FROM nba_score.live_slips UNION SELECT game_date FROM nba_score.ud_live_slips
                UNION SELECT game_date FROM nba_score.sleeper_live_slips UNION SELECT game_date FROM nba_score.fliff_live_slips
                UNION SELECT game_date FROM nba_score.betr_live_slips) d WHERE game_date >= %s
                AND game_date <= (SELECT max(game_date) FROM nba_score.live_unit_history) ORDER BY 1""", (s0,)).fetchall()]
    for d in days:
        L.auto_unit(conn, d)
    return [tuple(r) for r in conn.execute("""SELECT game_date, round(season_profit::numeric, 2), unit_from, unit_usd, reason
                                              FROM nba_score.live_unit_history WHERE season_start=%s ORDER BY game_date""", (s0,)).fetchall()]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    before = [tuple(r) for r in conn.execute("""SELECT game_date, round(season_profit::numeric, 2), unit_from, unit_usd, reason
                                                FROM nba_score.live_unit_history ORDER BY game_date""").fetchall()]
    ok = True
    r1 = walk(conn, None)
    same = [(a[0], a[3]) for a in before] == [(b[0], b[3]) for b in r1] and [a[1] for a in before] == [b[1] for b in r1]
    print(f"(1) no ladder_from: {len(r1)} slates, units and profits identical to the live history: {same}", flush=True)
    ok &= same
    conn.rollback()
    au = os.environ.get("AU_FROM", "2026-10-30")
    r2 = walk(conn, au)
    print(f"(2) ladder_from {au}:", flush=True)
    for d, p, uf, u, why in r2:
        exp = rung(float(p)) if str(d) >= au else None
        flag = "" if exp is None else ("  OK" if float(u) == exp else f"  MISMATCH expected {exp:g}")
        ok &= (exp is None or float(u) == exp)
        print(f"    {d}  profit {float(p):+8.2f}  unit {float(uf):g} -> {float(u):g}  {why}{flag}", flush=True)
    conn.rollback()
    r3 = walk(conn, "2026-11-01")
    same3 = [(a[0], a[1], a[3]) for a in before] == [(b[0], b[1], b[3]) for b in r3]
    print(f"(3) ladder_from 2026-11-01: slates before it identical to the live history: {same3}", flush=True)
    ok &= same3
    conn.rollback()
    after = [tuple(r) for r in conn.execute("SELECT game_date, round(season_profit::numeric, 2), unit_from, unit_usd, reason FROM nba_score.live_unit_history ORDER BY game_date").fetchall()]
    cu = conn.execute("SELECT config_json->'unit_usd' FROM nba_config.classification_config WHERE config_key='stake_unit'").fetchone()[0]
    print(f"rolled back - live history unchanged: {after == before}; config unit_usd {json.dumps(cu)}", flush=True)
    print("ALL PASS" if ok and after == before else "FAIL", flush=True)
    if not (ok and after == before):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
