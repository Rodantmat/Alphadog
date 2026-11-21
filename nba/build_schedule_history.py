#!/usr/bin/env python3
"""
SCHEDULE FOR REPLAYS OF PAST SEASONS (2026-11-20; owner: the same pipeline for every date). The day builders read their slate from
nba/data/nba_schedule_current.json, which covers only the current and previous season. For a replay (BT_REPLAY=1) of any other date
they also read nba/data/nba_schedule_history.json, written here from the team box scores: one game per GAME_ID, home = the "vs." side.
Only dates the current schedule does not hold are written, so no game is ever listed twice. Not used by live builds.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"


def main():
    have = {str(g.get("game_date", ""))[:10] for g in json.loads((DATA / "nba_schedule_current.json").read_text()).get("games", [])}
    games = {}
    for f in sorted(DATA.glob("nba_team_game_log_20*_*.json")):
        tag = f.name[len("nba_team_game_log_"):].replace(".json", "")
        if not tag.replace("_", "").isdigit():
            continue
        season = tag[:4] + "-" + tag[-2:]
        for r in json.loads(f.read_text()).get("records", []):
            d = str(r["GAME_DATE"])[:10]
            if d in have:
                continue
            m = str(r.get("MATCHUP", "")); gid = str(r["GAME_ID"]); g = games.setdefault(gid, {"game_id": gid, "season": season, "game_date": d + "T00:00:00Z", "game_status": 3})
            tri = m.split(" ")[0]
            if " vs. " in m:
                g["home_team_id"] = int(r["TEAM_ID"]); g["home_team_tricode"] = tri
            else:
                g["away_team_id"] = int(r["TEAM_ID"]); g["away_team_tricode"] = tri
    out = [g for g in games.values() if "home_team_id" in g and "away_team_id" in g]
    (DATA / "nba_schedule_history.json").write_text(json.dumps({"games": out}))
    print(f"history schedule: {len(out)} games on {len({g['game_date'] for g in out})} dates not in the current schedule")


if __name__ == "__main__":
    main()
