#!/usr/bin/env python3
"""ONE ROW PER PLAYER-GAME IN THE MINED FILES (2026-10-27).

NBA's stats feed listed Devin Booker (1626164) twice for 0022600124 PHX @ OKC on 2026-10-26: his real Phoenix line (33.8 min) and
a phantom 0-minute Oklahoma City row. The duplicate (1) broke P2A's box-score load ("ON CONFLICT DO UPDATE command cannot affect
row a second time" - nothing from that night landed, grading was skipped) and (2) crashed P2B's combos ladder (the phantom OKC row
multiplied through the team joins: "operands could not be broadcast together with shapes (1240,) (1240,) (1176,)").

Every current-season / delta file in nba/data whose records carry PLAYER_ID and GAME_ID is rewritten with one row per (player,
game): the row with the most minutes (the real line). Each dropped row is printed. Files with no duplicate are not touched.
Run after the mining steps and before the mined files are committed. Env: DEDUPE_GLOB (default the current season and delta files).
"""
import glob
import json
import os
from pathlib import Path


def minutes(v):
    if v is None:
        return 0.0
    if isinstance(v, str) and ":" in v:
        m, s = v.split(":", 1)
        try:
            return float(m) + float(s) / 60
        except ValueError:
            return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def dedupe(records):
    best, order, dropped = {}, [], []
    for r in records:
        if not isinstance(r, dict) or r.get("PLAYER_ID") in (None, "") or r.get("GAME_ID") in (None, ""):
            order.append(("raw", None, r))
            continue
        k = (str(r["PLAYER_ID"]), str(r["GAME_ID"]))
        if k not in best:
            best[k] = r
            order.append(("key", k, None))
            continue
        keep = r if minutes(r.get("MIN")) > minutes(best[k].get("MIN")) else best[k]
        drop = best[k] if keep is r else r
        dropped.append(drop)
        best[k] = keep
    out = [best[k] if kind == "key" else raw for kind, k, raw in order]
    return out, dropped


def main():
    pats = os.environ.get("DEDUPE_GLOB", "nba/data/*2026_27*.json,nba/data/nba_delta_*.json").split(",")
    files = sorted({f for p in pats for f in glob.glob(p.strip())})
    total = 0
    for fn in files:
        try:
            text = Path(fn).read_text()
            j = json.loads(text)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(j, dict) or not isinstance(j.get("records"), list) or not j["records"]:
            continue
        first = j["records"][0]
        if not isinstance(first, dict) or "PLAYER_ID" not in first or "GAME_ID" not in first:
            continue
        out, dropped = dedupe(j["records"])
        if not dropped:
            continue
        j["records"] = out
        if isinstance(j.get("meta"), dict) and "row_count" in j["meta"]:
            j["meta"]["row_count"] = len(out)
        pretty = "\n" in text[:200]
        Path(fn).write_text(json.dumps(j, indent=2) if pretty else json.dumps(j, separators=(",", ":")))
        total += len(dropped)
        for d in dropped:
            print(f"DEDUPE {fn}: dropped player {d.get('PLAYER_ID')} game {d.get('GAME_ID')} team {d.get('TEAM_ID')} min {d.get('MIN')}")
    print(f"DEDUPE done: {total} duplicate player-game rows dropped across {len(files)} files checked")


if __name__ == "__main__":
    main()
