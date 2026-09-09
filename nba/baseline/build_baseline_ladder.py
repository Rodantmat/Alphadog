#!/usr/bin/env python3
"""
NBA PRODUCTION: build the BASELINE LADDER for a day (BT_ASOF=YYYY-MM-DD, default today) with the certified recipe.

Single source of truth: this script loads nba/backtest/classification_ladder_v12.py (the certified two-season
recipe) and applies the production edits as string patches, each asserting on its anchor so any drift in the
harness fails loudly here instead of silently diverging. The backtest on a past day IS the production
computation (every feature is shift(1)-based); production differs only in:
  1. VIRTUAL SLATE ROWS - today's player-game rows do not exist yet: built from the schedule (games on ASOF,
     status not final; BT_REPLAY=1 allows final games to replay a past day) and each team's recent roster
     (players who appeared in the team's last 3 games). Outcomes NaN; features computed like any other row.
  2. DAILY-EXACT WALK-FORWARD - for each current-season month the empirical tables use every completed game
     strictly before the month's first slate day (the backtest used a 1-month lag for conservatism).
  3. OUTPUT - the ladder (player x prop x rung x side x P) for ASOF -> nba/data/nba_baseline_ladder_<ASOF>.json
     (+ _latest.json; loaded to Postgres nba_score.baseline_ladder by the loader worker). No metrics.
Validated 2026-09-09 by replaying 2026-03-15: 7 games, 194 roster rows -> 173 projected players, 4,498 ladder rows.
Roster rows include DNPs (43 of 173 that day) - the enrichment layer (injury report / confirmed lineups) removes them.
Run per prop pair in Actions (BT_PROPS) like the backtest; each pair ~8 min.
"""
import os
from pathlib import Path

SRC = Path("nba/backtest/classification_ladder_v12.py").read_text()


def rep(s, old, new):
    assert old in s, f"production patch anchor not found: {old[:80]!r}"
    return s.replace(old, new)


s = SRC
s = rep(s, '''TRAIN = os.environ.get("BT_TRAIN", "2023-24,2024-25").split(","); TEST = [os.environ.get("BT_TEST", "2025-26")]; SEASONS = TRAIN + TEST''',
'''from datetime import date as _date
ASOF = _date.fromisoformat(os.environ.get("BT_ASOF", str(_date.today())))
def _season_of(d_):
    y = d_.year if d_.month >= 10 else d_.year - 1
    return f"{y}-{str(y + 1)[-2:]}"
_cur = _season_of(ASOF)
_all = sorted({p.name.split("nba_player_game_log_")[1][:7].replace("_", "-") for p in Path("nba/data").glob("nba_player_game_log_20*.json") if "_q" not in p.name})
TEST = [_cur if _cur in _all else _all[-1]]; TRAIN = [x for x in _all if x < TEST[0]][-2:]; SEASONS = TRAIN + TEST
print("ASOF", ASOF, "| history seasons", TRAIN, "| current", TEST)''')
s = rep(s, '''teams_adv = teams_adv.merge(teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE"]], on=["season", "TEAM_ID", "GAME_ID"], how="inner")''',
'''teams_adv = teams_adv.merge(teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE"]], on=["season", "TEAM_ID", "GAME_ID"], how="inner")
players["PLAYER_ID"] = players["PLAYER_ID"].astype(str)
_sched = json.loads((DATA / "nba_schedule_current.json").read_text()).get("games", [])
_replay = os.environ.get("BT_REPLAY", "0") == "1"
_slate = [g_ for g_ in _sched if str(g_.get("game_date", ""))[:10] == str(ASOF) and (_replay or int(g_.get("game_status") or 1) != 3)]
players = players[players["GAME_DATE"] < ASOF]; teams = teams[teams["GAME_DATE"] < ASOF]; teams_adv = teams_adv[teams_adv["GAME_DATE"] < ASOF]
v_players, v_teams = [], []
for g_ in _slate:
    gid = str(g_["game_id"]); hid = str(g_["home_team_id"]); aid = str(g_["away_team_id"]); ht = g_.get("home_team_tricode", "HOME"); at = g_.get("away_team_tricode", "AWAY")
    for tid, is_h in ((hid, True), (aid, False)):
        recent = players[(players["TEAM_ID"] == tid) & (players["season"] == TEST[0])].sort_values("GAME_DATE")
        last_games = recent["GAME_ID"].drop_duplicates().tail(3).tolist()
        roster = recent[recent["GAME_ID"].isin(last_games)]["PLAYER_ID"].unique().tolist()
        mu = f"{ht} vs. {at}" if is_h else f"{at} @ {ht}"
        for pid in roster: v_players.append({"season": TEST[0], "PLAYER_ID": pid, "TEAM_ID": tid, "GAME_ID": gid, "GAME_DATE": ASOF, "MATCHUP": mu})
        v_teams.append({"season": TEST[0], "TEAM_ID": tid, "GAME_ID": gid, "GAME_DATE": ASOF, "MATCHUP": mu})
if v_players:
    players = pd.concat([players, pd.DataFrame(v_players)], ignore_index=True)
    teams = pd.concat([teams, pd.DataFrame(v_teams)], ignore_index=True)
    teams_adv = pd.concat([teams_adv, pd.DataFrame(v_teams)], ignore_index=True)
print(f"slate {ASOF}: {len(_slate)} games, {len(v_players)} virtual player rows")''')
s = rep(s, '''for c in ["PTS", "REB", "AST", "FG3M", "FG3A", "PF", "BLK", "STL", "TOV", "FGA", "FTM", "FTA"]: players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0)''',
'''for c in ["PTS", "REB", "AST", "FG3M", "FG3A", "PF", "BLK", "STL", "TOV", "FGA", "FTM", "FTA"]:
    players[c] = pd.to_numeric(players[c], errors="coerce"); _h = players["GAME_DATE"] < ASOF
    players.loc[_h, c] = players.loc[_h, c].fillna(0)''')
s = rep(s, '''        hist = d[(d["season"].isin(TRAIN) | (d["ym_dt"] < month)) & d["tier"].notna()]''',
'''        _t0 = test["GAME_DATE"].min()
        hist = d[(d["GAME_DATE"] < _t0) & d[col].notna() & d["tier"].notna()]''')
s = rep(s, '''def brier(p, y): return float(np.mean((p - y) ** 2))''',
'''_ladder = rel[rel["month"] == str(pd.Period(ASOF, freq="M"))].copy()
_vp = pd.DataFrame(v_players)[["PLAYER_ID", "GAME_ID", "TEAM_ID"]].drop_duplicates() if v_players else pd.DataFrame(columns=["PLAYER_ID", "GAME_ID", "TEAM_ID"])
_ladder = _ladder.merge(_vp, on=["PLAYER_ID", "GAME_ID"], how="inner")
# rungs below the natural floor collapse onto the same 0.5 line -> keep one row per distinct (player, game, prop, line)
_ladder = _ladder.sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
out_rows = [{"player_id": r.PLAYER_ID, "team_id": r.TEAM_ID, "game_id": r.GAME_ID, "game_date": str(ASOF), "prop": r.prop, "period": "FULL", "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
             "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4), "p_raw": round(float(r.p_raw), 4), "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)} for r in _ladder.itertuples(index=False)]
_meta = {"asof": str(ASOF), "history_seasons": TRAIN, "current_season": TEST[0], "slate_games": len(_slate), "players": int(_ladder["PLAYER_ID"].nunique()), "rows": len(out_rows), "props": sorted(_ladder["prop"].unique().tolist()),
         "recipe": "classification_ladder_v12 (certified two-season recipe) + production patches", "factor_fits": FACTOR_FITS, "role_minutes_multiplier": {k: round(float(v), 4) for k, v in ROLE_MIN_MULT.items()}}
_tag = ("_" + os.environ["BT_PROPS"].replace(",", "-")) if os.environ.get("BT_PROPS") else ""
(DATA / f"nba_baseline_ladder_{ASOF}{_tag}.json").write_text(json.dumps({"meta": _meta, "ladder": out_rows}))
print("LADDER:", {k: v for k, v in _meta.items() if k != "factor_fits"})
raise SystemExit(0)


def brier(p, y): return float(np.mean((p - y) ** 2))''')

os.environ.setdefault("BT_TAG", "prod")
exec(compile(s, "classification_ladder_v12[production]", "exec"))
