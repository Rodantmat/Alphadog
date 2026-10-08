#!/usr/bin/env python3
"""
POSTSEASON DAY-BY-DAY BASELINE HISTORY (strategy §31w P-3, 2026-10-08).

Same certified recipe (classification_ladder_v12.py) and the same three history patches as build_baseline_history.py (read
from that file, so they can never drift apart), plus:
  P1  the TEST season's play-in + playoff box scores (player, team, team advanced) appended to the season frames, under the
      season's own label - so every per-player / per-team rolling form, minutes and rate runs straight on from the regular
      season into the postseason (tight rotations and playoff minutes show up in the recent-form inputs night by night);
  P2  the TEST season's postseason four-factors / scoring logs appended to the factor layer;
  P3  the postseason morning market spreads (nba_market_spreads_postseason_<slug>.json) read alongside the season's;
  P4  emission restricted to postseason game ids (004/005), written as nba_baseline_history_postseason_<slug>_<props>.json
      with meta.postseason = true (the loader then replaces ONLY postseason rows).
NOTHING CHANGES FOR THE REGULAR SEASON: TRAIN-season fits (HCA, blowout table, factor coefficients, dispersion priors) are fit
on TRAIN seasons only and the TRAIN seasons get no postseason rows; the walk-forward monthly test refits see only months before
the one scored; and only postseason rows are emitted. The playoff-specific calibration lives one layer up (phase 5_postseason).
Env: as build_baseline_history.py (BT_TEST, BT_TRAIN, BT_PROPS, BT_LADDER_STEPS, BT_INJURY).
"""
from pathlib import Path

HIST = Path("nba/baseline/build_baseline_history.py").read_text()
TAIL = 'exec(compile(s, "classification_ladder_v12(history)", "exec"))'
assert TAIL in HIST, "build_baseline_history.py tail changed - re-check this builder"
ns = {}
exec(compile(HIST.replace(TAIL, ""), "build_baseline_history(patches)", "exec"), ns)
s = ns["s"]


def rep(src, old, new):
    assert old in src, f"postseason patch anchor not found: {old[:100]!r}"
    return src.replace(old, new, 1)


# P1 - postseason box scores for the TEST season
s = rep(s, '''players = pd.concat(P, ignore_index=True); teams = pd.concat(T, ignore_index=True); teams_adv = pd.concat(TA, ignore_index=True)''',
        '''for _ps in TEST:
    for _nm, _lst in (("nba_player_game_log", P), ("nba_team_game_log", T), ("nba_team_game_log_advanced", TA)):
        _pp = DATA / f"{_nm}_postseason_{SLUG[_ps]}.json"
        assert _pp.exists(), f"postseason file missing: {_pp}"
        _x = load(_pp); _x["season"] = _ps; _lst.append(_x)
        print(f"[postseason] {_pp.name}: {len(_x)} rows appended to {_ps}", flush=True)
players = pd.concat(P, ignore_index=True); teams = pd.concat(T, ignore_index=True); teams_adv = pd.concat(TA, ignore_index=True)''')

# P2 - postseason factor logs for the TEST season
s = rep(s, '''ff = pd.concat(FF, ignore_index=True); sc = pd.concat(SC, ignore_index=True)''',
        '''for _ps in TEST:
    for _nm, _lst in (("team_four_factors", FF), ("team_scoring", SC)):
        _pp = DATA / f"nba_backfill_{_nm}_postseason_{SLUG[_ps]}.json"
        if _pp.exists():
            _x = pd.DataFrame(json.loads(_pp.read_text()).get("records", [])); _x["season"] = _ps; _lst.append(_x)
ff = pd.concat(FF, ignore_index=True); sc = pd.concat(SC, ignore_index=True)''')

# P3 - postseason market spreads (both readers)
s = rep(s, '''    for _s in SEASONS:
        _p = f"nba/data/nba_market_spreads_{_s.replace('-', '_')}.json"''',
        '''    for _s, _p in [(x_, f"nba/data/nba_market_spreads_{x_.replace('-', '_')}.json") for x_ in SEASONS] + \\
                  [(x_, f"nba/data/nba_market_spreads_postseason_{x_.replace('-', '_')}.json") for x_ in TEST]:''')
s = rep(s, '''    for _s in SEASONS:
        _p = DATA / f"nba_market_spreads_{SLUG[_s]}.json"''',
        '''    for _s, _p in [(x_, DATA / f"nba_market_spreads_{SLUG[x_]}.json") for x_ in SEASONS] + \\
                  [(x_, DATA / f"nba_market_spreads_postseason_{SLUG[x_]}.json") for x_ in TEST]:''')

# P4 - emit only postseason games, flagged
s = rep(s, '''_h = _h.merge(_dates, on=["PLAYER_ID", "GAME_ID"], how="left")''',
        '''_h = _h.merge(_dates, on=["PLAYER_ID", "GAME_ID"], how="left")
_h = _h[_h["GAME_ID"].astype(str).str[:3].isin(["004", "005"])]''')
s = rep(s, '''_out = Path("nba/data") / f"nba_baseline_history_{_season.replace('-', '_')}_{_props_tag}.json"''',
        '''_out = Path("nba/data") / f"nba_baseline_history_postseason_{_season.replace('-', '_')}_{_props_tag}.json"''')
s = rep(s, '''_out.write_text(json.dumps({"meta": {"season": _season, "props": _props_tag, "rows": len(_rows),''',
        '''_out.write_text(json.dumps({"meta": {"season": _season, "props": _props_tag, "rows": len(_rows), "postseason": True,''')

exec(compile(s, "classification_ladder_v12(history, postseason)", "exec"))
