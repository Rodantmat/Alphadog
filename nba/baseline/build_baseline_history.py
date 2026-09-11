#!/usr/bin/env python3
"""
NBA: DAY-BY-DAY BASELINE HISTORY for a whole season (the parity requirement).

WHY THIS EXISTS
  The scoring engine must be simulated on every day of both seasons, and for that every leg needs the
  baseline hit probability that WOULD have been produced that day. Running the production builder once
  per date is not viable (~3 h per slate, ~350 dates per season).

  It is also not just "remove a filter". Two different shapes:
    - build_combos_ladder.py filters `rel` by ASOF after the fact  -> all dates are one flag away
    - build_baseline_ladder.py builds a VIRTUAL SLATE for ASOF from the schedule, because production
      runs on a day that has no box scores yet
    - the certified harness's `reliab` frame keeps prop/offset/p_over/anchor/line/role_tier/var_band
      but NOT PLAYER_ID / GAME_ID - the combos patcher adds those itself

  So this script patches the certified recipe to (a) keep player/game identity on every reliability row
  and (b) emit EVERY test-season game-day instead of one. One run per prop pair per season yields the
  full day-by-day baseline, and each row is still as-of correct: the harness scores every game-day from
  history strictly before it, which is exactly what certification measured.

OUTPUT
  nba/data/nba_baseline_history_<season>_<props>.json
    {"meta": {...}, "rows": [{game_date, player_id, game_id, prop, period, line, anchor, offset,
                              p_more, p_less, p_raw, role_tier, var_band, used_emp}]}
  Loaded into nba_score.baseline_history (same shape as baseline_ladder plus game_date as the key).

Env: BT_TEST=2024-25|2025-26, BT_PROPS=points,rebounds, BT_LADDER_STEPS=10, BT_INJURY=1
"""
import json
import os
from pathlib import Path

SRC = Path("nba/backtest/classification_ladder_v12.py").read_text()


def rep(s, old, new):
    assert old in s, f"history patch anchor not found: {old[:90]!r}"
    return s.replace(old, new)


s = SRC

# 1) ladder depth (same constant the production builders use)
s = rep(s, '''MAX_TIERS = 24; MIN_PER_TIER = 15; TIER_BLEND_K = 5; LADDER_STEPS = 6''',
        '''MAX_TIERS = 24; MIN_PER_TIER = 15; TIER_BLEND_K = 5; LADDER_STEPS = int(os.environ.get("BT_LADDER_STEPS", "10"))''')

# 2) the singles recipe ALREADY keeps PLAYER_ID / GAME_ID / season on every reliability row (line ~525),
#    unlike the combos recipe. Only GAME_DATE is missing - it is joined from the game logs below.

# 3) emit EVERY game-day, AFTER Stage 2 Platt calibration (p_over is calibrated by then; p_raw is the
#    pre-Platt value the recipe saves at line ~546). Hooked at the leg-level block, which is two lines in
#    the singles recipe - not the single joined line the combos recipe uses.
s = rep(s, '''more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"])
less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''',
        '''_season = os.environ.get("BT_TEST", "unknown")
_props_tag = (os.environ.get("BT_PROPS", "all") or "all").replace(",", "-")
_dates = d[["PLAYER_ID", "GAME_ID", "GAME_DATE"]].drop_duplicates()
_dates["PLAYER_ID"] = _dates["PLAYER_ID"].astype(str); _dates["GAME_ID"] = _dates["GAME_ID"].astype(str)
_h = rel.copy(); _h["PLAYER_ID"] = _h["PLAYER_ID"].astype(str); _h["GAME_ID"] = _h["GAME_ID"].astype(str)
_h = _h.merge(_dates, on=["PLAYER_ID", "GAME_ID"], how="left")
_h = _h.sort_values("offset").drop_duplicates(subset=["PLAYER_ID", "GAME_ID", "prop", "line"], keep="last")
_rows = [{"game_date": str(pd.to_datetime(r.GAME_DATE).date()), "player_id": str(r.PLAYER_ID), "game_id": str(r.GAME_ID),
          "prop": r.prop, "period": "FULL", "line": float(r.line), "anchor": float(r.anchor), "offset": int(r.offset),
          "p_more": round(float(r.p_over), 4), "p_less": round(float(1 - r.p_over), 4),
          "p_raw": round(float(getattr(r, "p_param", r.p_over)), 4),
          "role_tier": r.role_tier, "var_band": r.var_band, "used_emp": bool(r.used_emp)}
         for r in _h.itertuples(index=False)]
_out = Path("nba/data") / f"nba_baseline_history_{_season.replace('-', '_')}_{_props_tag}.json"
_out.write_text(json.dumps({"meta": {"season": _season, "props": _props_tag, "rows": len(_rows),
                                     "dates": len({x["game_date"] for x in _rows}),
                                     "players": len({x["player_id"] for x in _rows}),
                                     "ladder_steps": int(os.environ.get("BT_LADDER_STEPS", "10")),
                                     "recipe": "classification_ladder_v12 (certified) + history patches"},
                            "rows": _rows}, separators=(",", ":")))
print(f"DAY-BY-DAY BASELINE -> {_out}: {len(_rows)} rows, "
      f"{len({x['game_date'] for x in _rows})} dates, {len({x['player_id'] for x in _rows})} players", flush=True)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])''')

exec(compile(s, "classification_ladder_v12(history)", "exec"))
