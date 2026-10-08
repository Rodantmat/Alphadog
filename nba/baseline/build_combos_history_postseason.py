#!/usr/bin/env python3
"""
POSTSEASON COMBOS HISTORY (strategy §31w P-3, 2026-10-08). The certified combos recipe with the combos history patches (read
from build_combos_history.py, so they cannot drift), fed by the component pickles the POSTSEASON singles builder saved
(BT_SAVE_COMPONENTS=1 - they carry the season's regular-season AND postseason player-games), emitting only play-in / playoff
game ids into nba_baseline_history_postseason_<slug>_combos.json with meta.postseason = true.
Env: BT_TEST, BT_TRAIN, BT_LADDER_STEPS.
"""
from pathlib import Path

HIST = Path("nba/baseline/build_combos_history.py").read_text()
TAIL = 'exec(compile(s, "combos_ladder_v1(history)", "exec"))'
assert TAIL in HIST, "build_combos_history.py tail changed - re-check this builder"
ns = {}
exec(compile(HIST.replace(TAIL, ""), "build_combos_history(patches)", "exec"), ns)
s = ns["s"]


def rep(src, old, new):
    assert old in src, f"postseason combos patch anchor not found: {old[:100]!r}"
    return src.replace(old, new, 1)


s = rep(s, '''    _rows = [x for x in _rows if x["game_date"]]''',
        '''    _rows = [x for x in _rows if x["game_date"]]
_rows = [x for x in _rows if str(x["game_id"]).startswith(("004", "005"))]''')
s = rep(s, '''_out = Path("nba/data") / f"nba_baseline_history_{_season.replace('-', '_')}_combos.json"''',
        '''_out = Path("nba/data") / f"nba_baseline_history_postseason_{_season.replace('-', '_')}_combos.json"''')
s = rep(s, '''_out.write_text(json.dumps({"meta": {"season": _season, "props": "combos", "rows": len(_rows),''',
        '''_out.write_text(json.dumps({"meta": {"season": _season, "props": "combos", "rows": len(_rows), "postseason": True,''')

exec(compile(s, "combos_ladder_v1(history, postseason)", "exec"))
