#!/usr/bin/env python3
"""
DAY-BY-DAY COMBOS BASELINE HISTORY for a whole season (pra, pts_reb, pts_ast, reb_ast, stocks,
fantasy_score, double_double), as a patcher over the certified nba/backtest/combos_ladder_v1.py.

Requires the FULL-SEASON component projections written by the singles harness with BT_SAVE_COMPONENTS=1
(nba/backtest/reports/_comp_<prop>_<TEST>.pkl for points, rebounds, assists, steals, blocks, turnovers).
The workflow produces those first, then runs this.

The combos recipe already keeps PLAYER_ID / GAME_ID / GAME_DATE on every reliability row and uses the
single joined leg-level line, so this is a smaller patch than the singles one.

Output: nba/data/nba_baseline_history_<season>_combos.json (same row shape as the singles history).
Env: BT_TEST, BT_TRAIN, BT_LADDER_STEPS (10), BT_PROPS (optional subset)
"""
import json
import os
from pathlib import Path

SRC = Path("nba/backtest/combos_ladder_v1.py").read_text()


def rep(s, old, new):
    assert old in s, f"combos history patch anchor not found: {old[:90]!r}"
    return s.replace(old, new)


s = SRC
s = rep(s, '''MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL = 24, 15, 5, 6, 300, 300.0''',
        '''MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL = 24, 15, 5, int(os.environ.get("BT_LADDER_STEPS", "10")), 300, 300.0''')

# keep identity on every reliability row (same patch the production combos builder applies)
s = rep(s, '''            reliab.append(pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test["y"] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))''',
        '''            reliab.append(pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test["y"] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month), "PLAYER_ID": test["PLAYER_ID"].values, "GAME_ID": test["GAME_ID"].values, "GAME_DATE": test["GAME_DATE"].values}))''')

# emit every game-day (after the recipe's own calibration, at its leg-level line)
s = rep(s, '''more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''',
        '''_season = os.environ.get("BT_TEST", "unknown")
_h = rel.sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
_rows = [{"game_date": str(pd.to_datetime(r.GAME_DATE).date()), "player_id": str(r.PLAYER_ID), "game_id": str(r.GAME_ID),
          "prop": r.prop, "period": "FULL", "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
          "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4),
          "p_raw": round(float(getattr(r, "p_raw", getattr(r, "p_param", r.p_over))), 4),
          "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)}
         for r in _h.itertuples(index=False)]
# double-double rows (Yes/No market, line 0.5) from the recipe's dd frame
try:
    for r in dd.itertuples(index=False):
        _rows.append({"game_date": None, "player_id": str(r.PLAYER_ID), "game_id": str(r.GAME_ID), "prop": "double_double",
                      "period": "FULL", "line": 0.5, "anchor": 0.5, "offset": 0, "p_more": round(float(r.p_dd), 4),
                      "p_less": round(float(1 - r.p_dd), 4), "p_raw": round(float(r.p_dd), 4), "role_tier": None, "var_band": None, "used_emp": False})
    _gd = {(str(a), str(b)): c for a, b, c in d[["PLAYER_ID", "GAME_ID", "GAME_DATE"]].drop_duplicates().itertuples(index=False)}
    for x in _rows:
        if x["game_date"] is None:
            g = _gd.get((x["player_id"], x["game_id"]))
            x["game_date"] = str(pd.to_datetime(g).date()) if g is not None else None
    _rows = [x for x in _rows if x["game_date"]]
except NameError:
    pass
_out = Path("nba/data") / f"nba_baseline_history_{_season.replace('-', '_')}_combos.json"
_out.write_text(json.dumps({"meta": {"season": _season, "props": "combos", "rows": len(_rows),
                                     "dates": len({x["game_date"] for x in _rows}), "players": len({x["player_id"] for x in _rows}),
                                     "ladder_steps": int(os.environ.get("BT_LADDER_STEPS", "10")),
                                     "recipe": "combos_ladder_v1 (certified) + history patches"}, "rows": _rows}, separators=(",", ":")))
print(f"DAY-BY-DAY COMBOS -> {_out}: {len(_rows)} rows, {len({x['game_date'] for x in _rows})} dates", flush=True)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''')

exec(compile(s, "combos_ladder_v1(history)", "exec"))
