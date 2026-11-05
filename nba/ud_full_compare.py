#!/usr/bin/env python3
"""One-off (owner 2026-11-04 17:04 PT): compare the FULL Underdog board (boards/underdog_nba_current.json, just mined) with every Underdog leg on the
newest Slips snapshot (generated slips + backup pool): is the leg still on the board (player, stat, line, side), when does its game start, was it live.
Writes nba_market.ud_full_cmp (replaced each run)."""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone

import psycopg

STAT = {"points": "points", "rebounds": "rebounds", "assists": "assists", "3-pointers made": "threes_made", "3-pointers": "threes_made", "steals": "steals",
        "blocks": "blocks", "turnovers": "turnovers", "pts + rebs + asts": "pra", "points + rebounds + assists": "pra", "pts + rebs": "pts_reb", "points + rebounds": "pts_reb",
        "pts + asts": "pts_ast", "points + assists": "pts_ast", "rebs + asts": "reb_ast", "rebounds + assists": "reb_ast", "blks + stls": "stocks", "blocks + steals": "stocks",
        "fantasy points": "fantasy_score", "fg attempted": "fga", "3s attempted": "fg3a", "double-double": "double_double", "double doubles": "double_double"}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def main():
    board = json.load(open("boards/underdog_nba_current.json"))
    meta = board["meta"]
    legs_b = board["legs"] + [dict(l, higher_status=l.get("higher_status"), lower_status=l.get("lower_status"), stat=l.get("stat"), live=None) for l in board.get("ladder", [])]
    idx = {}
    players = set()
    for l in legs_b:
        prop = STAT.get(str(l.get("stat") or "").strip().lower())
        nm = norm(l.get("player"))
        if nm:
            players.add(nm)
        if not prop or not nm or l.get("line") is None:
            continue
        idx.setdefault((nm, prop), []).append(l)
    gstart = {}
    for l in board["legs"]:
        if l.get("player"):
            gstart[norm(l["player"])] = (l.get("game_start"), l.get("live"))
    con = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    cur = con.cursor()
    cur.execute("SELECT (payload#>>'{}')::jsonb FROM nba_score.ui_slips_snapshot ORDER BY 1 IS NULL, built_at DESC NULLS LAST LIMIT 1")
    snap = cur.fetchone()[0]
    legs = [l for s in snap.get("generated_slips", []) for l in s.get("legs", [])] + snap.get("backup_pool", [])
    rows = []
    for l in legs:
        if l.get("source_key") != "underdog":
            continue
        nm = norm(l.get("player_name")); prop = l.get("canonical_prop_key"); line = float(l.get("line_value")); less = str(l.get("selected_side")).lower().startswith("l")
        es = idx.get((nm, prop), [])
        ex = [e for e in es if abs(float(e["line"]) - line) < 1e-9]
        if ex:
            def okside(e):
                st = e.get("lower_status" if less else "higher_status")
                return st is None and False or str(st or "").lower() in ("active", "")
            status = "ok" if any(okside(e) for e in ex) else "side_or_suspended"
        elif es:
            status = "moved"
        elif nm in players:
            status = "player_on_board_other_stat"
        else:
            status = "player_not_on_board"
        gs = gstart.get(nm, (None, None))
        rows.append((l.get("player_name"), prop, line, "less" if less else "more", status, gs[0], gs[1], (l.get("link") or {}).get("tip_utc") or l.get("official_game_time_utc"), l.get("team_abbr")))
    cur.execute("CREATE TABLE IF NOT EXISTS nba_market.ud_full_cmp (player text, prop text, line numeric, side text, status text, board_game_start text, board_live boolean, slip_tip text, team text, mined_at timestamptz)")
    cur.execute("DELETE FROM nba_market.ud_full_cmp")
    now = datetime.now(timezone.utc)
    for r in rows:
        cur.execute("INSERT INTO nba_market.ud_full_cmp VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (*r, now))
    print("board legs", len(board["legs"]), "ladder", len(board.get("ladder", [])), "players", len(players), "meta partial", meta.get("partial"), "elapsed_s", meta.get("elapsed_s"))
    print("slip underdog legs", len(rows))
    from collections import Counter
    print(Counter(r[4] for r in rows))


if __name__ == "__main__":
    main()
