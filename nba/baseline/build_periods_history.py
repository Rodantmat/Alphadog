#!/usr/bin/env python3
"""
DAY-BY-DAY PERIODS BASELINE HISTORY (1Q / 1H / 2H / 4Q) for a whole season, as a patcher over the
certified nba/backtest/periods_ladder_v1.py.

Anchors verified against the recipe (not assumed from the singles/combos recipes):
  - LADDER_STEPS lives in a tuple assignment on line ~48
  - reliab rows are named f"{prop}_{per}" and do NOT carry PLAYER_ID/GAME_ID/GAME_DATE -> patched in
  - the leg-level block is the single joined "more = ...; less = ..." line (line ~339)
Props emitted as e.g. points_q1, points_h1, points_h2, points_q4, rebounds_q1, assists_q1, threes_made_q1,
with `period` set from the suffix so the loader's (game_date, player, game, prop, period, line) key holds.

Env: BT_TEST, BT_TRAIN, BT_PERIODS, BT_PROPS, BT_OT, BT_LADDER_STEPS (10)
"""
import json
import os
from pathlib import Path

SRC = Path("nba/backtest/periods_ladder_v1.py").read_text()


def rep(s, old, new):
    assert old in s, f"periods history patch anchor not found: {old[:90]!r}"
    return s.replace(old, new)


s = SRC
s = rep(s, '''MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL, BLOWOUT_MARGIN, COMPETITIVE_MARGIN = 24, 15, 5, 6, 300, 300.0, 20, 15''',
        '''MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL, BLOWOUT_MARGIN, COMPETITIVE_MARGIN = 24, 15, 5, int(os.environ.get("BT_LADDER_STEPS", "10")), 300, 300.0, 20, 15''')

s = rep(s, '''                reliab.append(pd.DataFrame({"prop": f"{prop}_{per}", "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test[ycol] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))''',
        '''                reliab.append(pd.DataFrame({"prop": f"{prop}_{per}", "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test[ycol] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month), "PLAYER_ID": test["PLAYER_ID"].values, "GAME_ID": test["GAME_ID"].values, "GAME_DATE": test["GAME_DATE"].values}))''')

s = rep(s, '''more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''',
        '''_season = os.environ.get("BT_TEST", "unknown")
_tag = (os.environ.get("BT_PERIODS", "all") + "_" + os.environ.get("BT_PROPS", "all") + ("_otx" if os.environ.get("BT_OT", "include") == "exclude" else "")).replace(",", "-")
_h = rel.sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
_rows = [{"game_date": str(pd.to_datetime(r.GAME_DATE).date()), "player_id": str(r.PLAYER_ID), "game_id": str(r.GAME_ID),
          "prop": r.prop, "period": r.prop.rsplit("_", 1)[-1].upper(), "ot_rule": os.environ.get("BT_OT", "include"),
          "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
          "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4),
          "p_raw": round(float(getattr(r, "p_raw", r.p_over)), 4),
          "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)}
         for r in _h.itertuples(index=False)]
_out = Path("nba/data") / f"nba_baseline_history_{_season.replace('-', '_')}_periods_{_tag}.json"
_out.write_text(json.dumps({"meta": {"season": _season, "props": "periods_" + _tag, "rows": len(_rows),
                                     "dates": len({x["game_date"] for x in _rows}), "players": len({x["player_id"] for x in _rows}),
                                     "ladder_steps": int(os.environ.get("BT_LADDER_STEPS", "10")),
                                     "recipe": "periods_ladder_v1 (certified) + history patches"}, "rows": _rows}, separators=(",", ":")))
print(f"DAY-BY-DAY PERIODS -> {_out}: {len(_rows)} rows, {len({x['game_date'] for x in _rows})} dates", flush=True)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''')

exec(compile(s, "periods_ladder_v1(history)", "exec"))
