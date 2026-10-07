#!/usr/bin/env python3
"""
BOARD ROUTING VERIFICATION (strategy doc §31s G1/G2; test harness - NOTHING is committed).
Runs the REAL nba/score_board_legs.py twice per date inside transactions that are ROLLED BACK instead of committed:
  run 1  routing neutralised (the certified-depth config read returns an empty depth table = the pre-change behaviour)
  run 2  production config
and checks, against an INDEPENDENT re-derivation from baseline_history:
  - run 2's board_scored rows are exactly run 1's rows minus the routed ones (every value column identical)
  - the removed rows are exactly: certified-prop whole-number lines + certified-prop legs with |offset| > certified depth
    (offset = the builder's ladder_offset for an exact rung, line - anchor for an off-ladder leg)
  - the 'board_beyond_certified_depth' rows carry run 1's values for those legs, one row per leg
  - P3's paper selection (nba_score.paper_pick_candidates, 'window') picks no whole-number line in run 2
Env: DATABASE_URL, VB_DATES (comma list)
"""
import os
import sys
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["BS_FORCE_RESCORE"] = "1"      # nothing is committed, so a pruned date is never re-written
import score_board_legs as S  # noqa: E402

VALS = "app, player_id, prop, line, side, baseline_hp, cal_shift, final_hp, confidence, score, edge, interpolated"
STATE = {"mode": None, "captured": None}
_exec, _commit = psycopg.Connection.execute, psycopg.Connection.commit


def _execute(self, query, params=None, *a, **k):
    if STATE["mode"] == "off" and isinstance(query, str) and "selection_certified_depth" in query:
        query, params = "SELECT '{\"depth\": {}}'::jsonb", None
    return _exec(self, query, params, *a, **k)


def _capture_then_rollback(self):
    d = STATE["date"]
    cap = {}
    cap["board"] = _exec(self, f"SELECT {VALS} FROM nba_score.board_scored WHERE game_date = %s", (d,)).fetchall()
    cap["deep"] = _exec(self, """SELECT player_id, prop, line, side, ladder_offset, baseline_hp, cal_shift, final_hp, confidence, score, edge
                                 FROM nba_score.final_hp_derived WHERE game_date = %s AND derivation = 'board_beyond_certified_depth'""",
                        (d,)).fetchall()
    cap["picks"] = _exec(self, "SELECT player, prop, line, side FROM nba_score.paper_pick_candidates(%s, 1.30, 'window')", (d,)).fetchall()
    STATE["captured"] = cap
    self.rollback()


def run(mode, d):
    STATE.update(mode=mode, date=d, captured=None)
    os.environ["BS_ASOF"] = d
    S.main()
    if STATE["captured"] is None:
        sys.exit(f"FAIL {d} {mode}: the scorer never reached its commit")
    return STATE["captured"]


def main():
    psycopg.Connection.execute = _execute
    psycopg.Connection.commit = _capture_then_rollback
    fails = 0
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    cfg = _exec(conn, "SELECT config_json FROM nba_config.classification_config WHERE config_key='selection_certified_depth'").fetchone()[0]
    depth = {k: int(v) for k, v in cfg["depth"].items()}
    for d in [x.strip() for x in os.environ["VB_DATES"].split(",") if x.strip()]:
        print(f"\n===== {d} =====", flush=True)
        r1, r2 = run("off", d), run("on", d)
        b1, b2 = Counter(r1["board"]), Counter(r2["board"])
        extra = b2 - b1
        removed = b1 - b2
        # independent offsets from the baseline the scorer read
        lad = _exec(conn, """SELECT player_id, prop, coalesce(period,'FULL'), line, ladder_offset, anchor
                             FROM nba_score.baseline_history WHERE game_date = %s""", (d,)).fetchall()
        exact = {(str(p), pr, per, float(l)): o for p, pr, per, l, o, a in lad}
        anchor = {}
        for p, pr, per, l, o, a in lad:          # the scorer takes the first non-null anchor of the group
            if a is not None:
                anchor.setdefault((str(p), pr, per), a)
        exp_wn, exp_deep = Counter(), set()
        for row, c in b1.items():
            app, pid, prop, line, side = row[:5]
            if prop not in depth:
                continue
            line = float(line)
            if line == int(line) and line >= 0:
                exp_wn[row] += c
                continue
            o = exact.get((pid, prop, "FULL", line))
            if o is None:
                a = anchor.get((pid, prop, "FULL"))
                o = None if a is None else line - float(a)
            if o is not None and abs(o) > depth[prop]:
                exp_deep.add(row)
        exp_removed = exp_wn + Counter({r: b1[r] for r in exp_deep})
        deep_keys = {(r[1], r[2], float(r[3]), r[4]): tuple(r[5:11]) for r in exp_deep}
        got_deep = {(r[0], r[1], float(r[2]), r[3]): tuple(r[5:]) for r in r2["deep"]}
        wn_left = sum(c for r, c in b2.items() if r[2] in depth and float(r[3]) == int(float(r[3])) and float(r[3]) >= 0)
        off_viol = sum(1 for r in r2["deep"] if abs(r[4]) <= depth[r[1]])
        wn_p1 = sum(1 for p in r1["picks"] if float(p[2]) == int(float(p[2])))
        wn_p2 = sum(1 for p in r2["picks"] if float(p[2]) == int(float(p[2])))
        checks = [
            (not extra, f"run 2 adds no row and changes no value (rows {sum(b1.values()):,} -> {sum(b2.values()):,})"),
            (removed == exp_removed, f"removed rows == independent expectation (whole-number {sum(exp_wn.values()):,}, "
                                     f"beyond depth {len(exp_deep):,}; removed {sum(removed.values()):,})"),
            (got_deep == deep_keys, f"routed rows carry run-1 values, one per leg ({len(got_deep):,} legs)"),
            (len(r2["deep"]) == len(got_deep), "no duplicate routed leg"),
            (off_viol == 0, "every routed row's |offset| exceeds its certified depth"),
            (wn_left == 0, "no certified-prop whole-number line left in board_scored"),
            (wn_p2 == 0, f"paper selection: whole-number picks {wn_p1} -> {wn_p2} (picks {len(r1['picks'])} -> {len(r2['picks'])})"),
            (len(r1["deep"]) == 0, "routing-off run wrote no routed rows"),
        ]
        for ok, msg in checks:
            fails += 0 if ok else 1
            print(f"{'PASS' if ok else 'FAIL'}  {msg}", flush=True)
    print("\nBOARD ROUTING VERIFIED (nothing committed)" if fails == 0 else f"\nBOARD ROUTING: {fails} FAILURE(S)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
