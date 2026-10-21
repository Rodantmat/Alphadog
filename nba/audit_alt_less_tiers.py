#!/usr/bin/env python3
"""
AUDIT - the board tiers with ALTERNATE LESS rows on the REAL 10-21 PrizePicks board (2026-10-20). READ-ONLY: temp tables only.

The archive now files an alternate Less row (price 100) wherever PrizePicks opens Less (allowed_wager_types). Before tomorrow's P3
writes them, prove on the real board (boards/prizepicks_nba_current.json, parsed by archive_live_boards.rows_prizepicks - the code
P3 runs) that build_board_tiers_v2's SQL:
  1  NO INTERFERENCE: every MORE row gets the identical kind / anchor / anchor type / tier / position whether or not the Less rows
     are present (the fixed switch-point anchor reads More rungs only). Also shows what the OLD anchor (no side filter) would do.
  2  FOUR-WAY RULE on the Less rows: below the anchor + Less = demon, above + Less = goblin; tier sign by position.
Env: DATABASE_URL, AUDIT_BOARD (default boards/prizepicks_nba_current.json), AUDIT_DATE (default 2026-10-21).
"""
import json
import os
import sys
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archive_live_boards as A      # noqa: E402
import build_board_tiers_v2 as BT    # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def tiers(conn, src, sql):
    q = sql.replace("FROM nba_market.board_snapshots", f"FROM {src}").replace("INSERT INTO nba_market.board_tiers_v2", "INSERT INTO _t")
    assert q.count(f"FROM {src}") == 1 and q.count("INSERT INTO _t") == 1, "tier SQL anchors not found once"
    conn.execute("DROP TABLE IF EXISTS _t")
    conn.execute("CREATE TEMP TABLE _t (LIKE nba_market.board_tiers_v2)")
    conn.execute(q, {"apps": ["prizepicks"], "gd": None})
    return {(r[0], r[1], r[2], float(r[3])): r[4:] for r in conn.execute(
        "SELECT nm, base_market, side, line, kind, anchor_line, anchor_type, tier, position_vs_anchor FROM _t").fetchall()}


def main():
    board = os.environ.get("AUDIT_BOARD", os.path.join(ROOT, "boards", "prizepicks_nba_current.json"))
    gd = os.environ.get("AUDIT_DATE", "2026-10-21")
    doc = json.load(open(board))
    rows = [r for r in A.rows_prizepicks(doc, gd, "window") if r[4] == "prizepicks"]
    # keep the slate's projections only (the board file holds two days)
    rows = [r for r in rows if (r[13] or "")[:10] == gd]
    less_alt = [r for r in rows if r[7] == "Under" and r[5].endswith("_alternate")]
    print(f"board rows for {gd}: {len(rows):,} | alternate Less rows {len(less_alt):,}", flush=True)
    ok = True
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        conn.execute("""CREATE TEMP TABLE _snap (game_date date, snapshot_label text, bookmaker text, player text, market_key text,
                        side text, line numeric, price numeric)""")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO _snap VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                            [(gd, "window", r[4], r[6], r[5], r[7], r[8], r[9]) for r in rows])
        conn.execute("CREATE TEMP TABLE _snap_more AS SELECT * FROM _snap WHERE NOT (side = 'Under' AND market_key LIKE '%\\_alternate')")
        new_all = tiers(conn, "_snap", BT.SQL)
        new_more = tiers(conn, "_snap_more", BT.SQL)
        old_sql = BT.SQL.replace(" AND side = 'Over')  AS top_shorter", ")  AS top_shorter").replace(" AND side = 'Over')  AS low_longer", ")  AS low_longer")
        assert old_sql != BT.SQL, "old-anchor reconstruction failed"
        old_all = tiers(conn, "_snap", old_sql)
    more_keys = [k for k in new_more if k[2] == "Over"]
    same = sum(1 for k in more_keys if new_all.get(k) == new_more[k])
    p1 = same == len(more_keys) and len(more_keys) > 0
    ok = ok and p1
    old_diff = sum(1 for k in more_keys if old_all.get(k) != new_more[k])
    print(f"1 NO INTERFERENCE: More rows {len(more_keys):,} | identical with / without the Less rows {same:,} | "
          f"{'PASS' if p1 else 'FAIL'} | the OLD anchor (no side filter) would have changed {old_diff:,} More rows", flush=True)
    bad, kinds = [], Counter()
    less_keys = [k for k in new_all if k[2] == "Under" and new_all[k][0] in ("goblin", "demon", "unknown")]
    for k in less_keys:
        kind, anchor, atype, tier, pos = new_all[k]
        kinds[(kind, pos)] += 1
        if anchor is None:
            continue
        want = "demon" if k[3] < float(anchor) else "goblin"
        if kind != want or (tier < 0) != (k[3] < float(anchor)):
            bad.append((k, new_all[k]))
    p2 = not bad and len(less_keys) > 0
    ok = ok and p2
    print(f"2 FOUR-WAY on Less rows: {len(less_keys):,} alternate Less rows | kinds by position {dict(kinds)} | violations {len(bad)} | "
          f"{'PASS' if p2 else 'FAIL'}", flush=True)
    for b in bad[:10]:
        print("   ", b)
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
