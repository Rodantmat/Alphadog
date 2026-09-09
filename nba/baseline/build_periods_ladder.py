#!/usr/bin/env python3
"""
NBA PRODUCTION: period props (1Q, 1H, 2H, 4Q) for a day, as a patcher over the certified nba/backtest/periods_ladder_v1.py.
One (period, prop) per call, like the backtest: BT_PERIODS=q4 BT_PROPS=points [BT_OT=exclude] BT_ASOF=YYYY-MM-DD.
Virtual slate rows are appended to the full-game log (schedule x last-3-games roster); quarter columns for those rows are
NaN -> 0 by the harness's fill, which only ever feeds SHIFTED features, never the slate row's own prediction.
Output: nba/data/nba_baseline_ladder_<ASOF>_periods_<period>_<prop>_<ot>.json  (period label + ot_rule in every row).
Validated 2026-09-09 on the 2026-03-15 replay (4Q points): 1,574 rows, 175 players.
"""
import os
from datetime import date as _date
from pathlib import Path

ASOF = _date.fromisoformat(os.environ.get("BT_ASOF", str(_date.today())))
def _season_of(d_):
    y = d_.year if d_.month >= 10 else d_.year - 1
    return f"{y}-{str(y + 1)[-2:]}"
_cur = _season_of(ASOF)
_all = sorted({p.name.split("nba_player_game_log_")[1][:7].replace("_", "-") for p in Path("nba/data").glob("nba_player_game_log_20*.json") if "_q" not in p.name and __import__("re").match(r"^\d{4}_\d{2}\.json$", p.name.split("nba_player_game_log_")[1])})
TEST = _cur if _cur in _all else _all[-1]; TRAIN = [x for x in _all if x < TEST][-2:]
os.environ["BT_TEST"] = TEST; os.environ["BT_TRAIN"] = ",".join(TRAIN)

SRC = Path("nba/backtest/periods_ladder_v1.py").read_text()


def rep(s, old, new):
    assert old in s, f"production patch anchor not found: {old[:80]!r}"
    return s.replace(old, new)


s = SRC
s = rep(s, '''full["PLAYER_ID"] = full["PLAYER_ID"].astype(str)''',
'''full["PLAYER_ID"] = full["PLAYER_ID"].astype(str)
ASOF_D = pd.Timestamp(os.environ["BT_ASOF"]).date() if os.environ.get("BT_ASOF") else pd.Timestamp.today().date()
_sched = json.loads((DATA / "nba_schedule_current.json").read_text()).get("games", [])
_replay = os.environ.get("BT_REPLAY", "0") == "1"
_slate = [g_ for g_ in _sched if str(g_.get("game_date", ""))[:10] == str(ASOF_D) and (_replay or int(g_.get("game_status") or 1) != 3)]
full = full[full["GAME_DATE"] < ASOF_D]; teams = teams[teams["GAME_DATE"] < ASOF_D]
v_players, v_teams = [], []
for g_ in _slate:
    gid = str(g_["game_id"]); hid = str(g_["home_team_id"]); aid = str(g_["away_team_id"]); ht = g_.get("home_team_tricode", "HOME"); at = g_.get("away_team_tricode", "AWAY")
    for tid, is_h in ((hid, True), (aid, False)):
        recent = full[(full["TEAM_ID"] == tid) & (full["season"] == TEST[0])].sort_values("GAME_DATE")
        last_games = recent["GAME_ID"].drop_duplicates().tail(3).tolist()
        roster = recent[recent["GAME_ID"].isin(last_games)]["PLAYER_ID"].unique().tolist()
        mu = f"{ht} vs. {at}" if is_h else f"{at} @ {ht}"
        for pid in roster: v_players.append({"season": TEST[0], "PLAYER_ID": pid, "TEAM_ID": tid, "GAME_ID": gid, "GAME_DATE": ASOF_D, "MATCHUP": mu})
        v_teams.append({"season": TEST[0], "TEAM_ID": tid, "GAME_ID": gid, "GAME_DATE": ASOF_D, "MATCHUP": mu})
_keep_ids = set(teams["GAME_ID"])   # completed games only (before the virtual slate is appended)
teams_adv = teams_adv[teams_adv["GAME_ID"].isin(_keep_ids)]
if v_players:
    full = pd.concat([full, pd.DataFrame(v_players)], ignore_index=True)
    teams = pd.concat([teams, pd.DataFrame(v_teams)], ignore_index=True)
    teams_adv = pd.concat([teams_adv, pd.DataFrame([{"season": r_["season"], "TEAM_ID": r_["TEAM_ID"], "GAME_ID": r_["GAME_ID"]} for r_ in v_teams])], ignore_index=True)
full["MINF"] = full["MIN"].apply(to_min)
print(f"slate {ASOF_D}: {len(_slate)} games, {len(v_players)} virtual player rows")''')
s = rep(s, '''            hist = d[(d["season"].isin(TRAIN) | (d["ym"] < month)) & d["tier"].notna()]''',
'''            _t0 = test["GAME_DATE"].min()
            hist = d[(d["GAME_DATE"] < _t0) & d["tier"].notna()]''')
s = rep(s, '''                reliab.append(pd.DataFrame({"prop": f"{prop}_{per}", "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test[ycol] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))''',
'''                reliab.append(pd.DataFrame({"prop": f"{prop}_{per}", "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test[ycol] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month), "PLAYER_ID": test["PLAYER_ID"].values, "GAME_ID": test["GAME_ID"].values, "GAME_DATE": test["GAME_DATE"].values, "TEAM_ID": test["TEAM_ID"].values, "base_prop": prop, "period_key": per}))''')
s = rep(s, '''more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''',
'''_PER = {"q1": "Q1", "h1": "H1", "h2": "H2", "q4": "Q4"}
_lad = rel[pd.to_datetime(rel["GAME_DATE"]).dt.date == ASOF_D].sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
out_rows = [{"player_id": r.PLAYER_ID, "team_id": r.TEAM_ID, "game_id": r.GAME_ID, "game_date": str(ASOF_D), "prop": r.base_prop, "period": _PER[r.period_key], "ot_rule": OT_MODE, "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
             "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4), "p_raw": round(float(r.p_raw), 4), "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)} for r in _lad.itertuples(index=False)]
_meta = {"asof": str(ASOF_D), "history_seasons": TRAIN, "current_season": TEST[0], "rows": len(out_rows), "props": sorted({f"{r['prop']}_{r['period']}" for r in out_rows}), "players": len({r["player_id"] for r in out_rows}), "ot_rule": OT_MODE, "recipe": "periods_ladder_v1 v3 (certified points 1H/4Q, at-standard 1Q/2H) + production patches"}
(DATA / f"nba_baseline_ladder_{ASOF_D}_periods_{'_'.join(PERIODS)}_{'_'.join(BT_PROPS)}_{OT_MODE}.json").write_text(json.dumps({"meta": _meta, "ladder": out_rows}))
print("PERIODS LADDER:", _meta)
raise SystemExit(0)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''')

exec(compile(s, "periods_ladder_v1[production]", "exec"))
