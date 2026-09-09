#!/usr/bin/env python3
"""
NBA PRODUCTION: combos (P+R, P+A, R+A, PRA, stocks, fantasy) + double-double for a day, as a patcher over the
certified nba/backtest/combos_ladder_v1.py. Requires the component projections for ASOF saved by
nba/baseline/build_baseline_ladder.py with BT_SAVE_COMPONENTS=1 (pairs points,rebounds / assists,steals / blocks,turnovers).
Output: nba/data/nba_baseline_ladder_<ASOF>_combos.json (same row shape; DD rows carry prop 'double_double', line 0.5).
Validated 2026-09-09 on the 2026-03-15 replay: 12,579 rows, 7 props, 175 players.
"""
import os
from datetime import date as _date
from pathlib import Path

ASOF = _date.fromisoformat(os.environ.get("BT_ASOF", str(_date.today())))
def _season_of(d_):
    y = d_.year if d_.month >= 10 else d_.year - 1
    return f"{y}-{str(y + 1)[-2:]}"
_cur = _season_of(ASOF)
_all = sorted({p.name.split("nba_player_game_log_")[1][:7].replace("_", "-") for p in Path("nba/data").glob("nba_player_game_log_20*.json") if "_q" not in p.name})
TEST = _cur if _cur in _all else _all[-1]; TRAIN = [x for x in _all if x < TEST][-2:]
os.environ["BT_TEST"] = TEST; os.environ["BT_TRAIN"] = ",".join(TRAIN)

SRC = Path("nba/backtest/combos_ladder_v1.py").read_text()


def rep(s, old, new):
    assert old in s, f"production patch anchor not found: {old[:80]!r}"
    return s.replace(old, new)


s = SRC
s = rep(s, '''        hist = x[(x["season"].isin(TRAIN) | (x["ym"] < month)) & x["tier"].notna()]''',
'''        _t0 = test["GAME_DATE"].min()
        hist = x[(x["GAME_DATE"] < _t0) & x["y"].notna() & x["tier"].notna()]''')
s = rep(s, '''            reliab.append(pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test["y"] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))''',
'''            reliab.append(pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test["y"] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month), "PLAYER_ID": test["PLAYER_ID"].values, "GAME_ID": test["GAME_ID"].values, "GAME_DATE": test["GAME_DATE"].values}))''')
s = rep(s, '''more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''',
'''_ASOF = pd.Timestamp(os.environ["BT_ASOF"]).date() if os.environ.get("BT_ASOF") else pd.Timestamp.today().date()
_lad = rel[pd.to_datetime(rel["GAME_DATE"]).dt.date == _ASOF].sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
_team = d[["PLAYER_ID", "GAME_ID", "TEAM_ID"]].drop_duplicates()
_lad = _lad.merge(_team, on=["PLAYER_ID", "GAME_ID"], how="left")
out_rows = [{"player_id": r.PLAYER_ID, "team_id": r.TEAM_ID, "game_id": r.GAME_ID, "game_date": str(_ASOF), "prop": r.prop, "period": "FULL", "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
             "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4), "p_raw": round(float(r.p_raw), 4), "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)} for r in _lad.itertuples(index=False)]
_dd = dd[pd.to_datetime(dd["GAME_DATE"]).dt.date == _ASOF]
for r in _dd.itertuples(index=False):
    out_rows.append({"player_id": r.PLAYER_ID, "team_id": r.TEAM_ID, "game_id": r.GAME_ID, "game_date": str(_ASOF), "prop": "double_double", "period": "FULL", "line": 0.5, "anchor": 0.5, "offset": 0,
                     "p_more": round(float(r.p_dd), 4), "p_less": round(float(1 - r.p_dd), 4), "p_raw": round(float(r.p_dd), 4), "role_tier": r.role_tier, "var_band": None, "used_emp": False})
_meta = {"asof": str(_ASOF), "history_seasons": TRAIN, "current_season": TEST, "rows": len(out_rows), "props": sorted({r["prop"] for r in out_rows}), "players": len({r["player_id"] for r in out_rows}), "recipe": "combos_ladder_v1 (certified) + production patches"}
(OUT.parent.parent / "data" / f"nba_baseline_ladder_{_ASOF}_combos.json").write_text(json.dumps({"meta": _meta, "ladder": out_rows}))
print("COMBOS LADDER:", _meta)
raise SystemExit(0)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''')

exec(compile(s, "combos_ladder_v1[production]", "exec"))
