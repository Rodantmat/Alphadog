#!/usr/bin/env python3
"""
THE HONEST RECIPE - one set of patches every baseline builder applies (owner 2026-11-20 20:58 PT: "run the same formula for every single day ...
a homogeneous formula throughout the whole dataset and back data"; NBA_HONEST_REBUILD.md 8 / 8o / 8au).
Three look-aheads found and certified (truncation invariance PASS 15 / 15):
  TIER   the player's rate tier for a month was taken from his rate at his LAST game of that month - now day by day (classification, combos, periods)
  LG     league means of the team factors were taken over every row, the test season's future included - now TRAIN seasons only
  IMPL   the median implied team total, same - now TRAIN seasons only
Live builds never saw the future, but they computed the constants differently from the history; with these patches live and history are ONE
computation. Switch: env BT_HONEST ("1" applies; default below). Every anchor is asserted - a recipe change fails loudly.
"""
import os

DEFAULT = "0"

TIER_OLD = '    for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):\n        pop = grp.groupby("PLAYER_ID")["rate36"].last()\n        n = len(pop); total_tiers = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n        ranks = pop.rank(pct=True, method="first")\n        tier_of = np.minimum(total_tiers, np.floor(ranks * total_tiers) + 1).astype(int)\n        tier_mean = pop.groupby(tier_of).mean(); tier_n = pop.groupby(tier_of).size(); pop_mean = pop.mean()\n        for pid, tnum in tier_of.items():\n            tm, tn = tier_mean[tnum], tier_n[tnum]\n            blended = (tn * tm + TIER_BLEND_K * pop_mean) / (tn + TIER_BLEND_K)\n            tier_prior[(s, ym, role, pid)] = (int(tnum), int(total_tiers), float(blended))\n    d["tier"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[0] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]\n    d["tier_prior"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[2] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]\n'
TIER_NEW = '    _trow = {}; _prow = {}\n    for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):\n        _latest = {}\n        for _dte, _day in grp.sort_values("GAME_DATE").groupby("GAME_DATE", sort=True):\n            for _pid, _r in zip(_day["PLAYER_ID"], _day["rate36"]): _latest[_pid] = _r\n            pop = pd.Series(_latest)\n            n = len(pop); total_tiers = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n            ranks = pop.rank(pct=True, method="first")\n            tier_of = np.minimum(total_tiers, np.floor(ranks * total_tiers) + 1).astype(int)\n            tier_mean = pop.groupby(tier_of).mean(); tier_n = pop.groupby(tier_of).size(); pop_mean = pop.mean()\n            for _ix, _pid in zip(_day.index, _day["PLAYER_ID"]):\n                tnum = tier_of[_pid]; tm, tn = tier_mean[tnum], tier_n[tnum]\n                _trow[_ix] = int(tnum); _prow[_ix] = float((tn * tm + TIER_BLEND_K * pop_mean) / (tn + TIER_BLEND_K))\n    d["tier"] = [_trow.get(i) for i in d.index]\n    d["tier_prior"] = [_prow.get(i, np.nan) for i in d.index]\n'
LG_OLD = 'LG = {c_: float(tf[c_].mean()) for c_ in FCOLS}'
LG_NEW = 'LG = {c_: float(tf[tf["season"].isin(TRAIN)][c_].mean()) for c_ in FCOLS}'
IMPL_OLD = '_LG_IMPL = float(np.nanmedian(pg["implied_own"])) if pg["implied_own"].notna().any() else 114.0'
IMPL_NEW = '_LG_IMPL = float(np.nanmedian(pg[pg["season"].isin(TRAIN)]["implied_own"])) if pg[pg["season"].isin(TRAIN)]["implied_own"].notna().any() else 114.0'
COMBO_OLD = '    for (s, ym, role), grp in x.groupby(["season", "ym_s", "role_tier"]):\n        pop = grp.groupby("PLAYER_ID")["rate36"].last(); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n        ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)\n        for pid, t in tier_of.items(): tp[(s, ym, role, pid)] = int(t)\n    x["tier"] = [tp.get((s, y_, r, p)) for s, y_, r, p in zip(x["season"], x["ym_s"], x["role_tier"], x["PLAYER_ID"])]\n'
COMBO_NEW = '    _trow = {}\n    for (s, ym, role), grp in x.groupby(["season", "ym_s", "role_tier"]):\n        _latest = {}\n        for _dte, _day in grp.sort_values("GAME_DATE").groupby("GAME_DATE", sort=True):\n            for _pid, _r in zip(_day["PLAYER_ID"], _day["rate36"]): _latest[_pid] = _r\n            pop = pd.Series(_latest); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n            ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)\n            for _ix, _pid in zip(_day.index, _day["PLAYER_ID"]): _trow[_ix] = int(tier_of[_pid])\n    x["tier"] = [_trow.get(i) for i in x.index]\n'
PER_OLD = '        tp = {}\n        for (s, ym, role), grp in d.groupby(["season", "ym_s", "role_tier"]):\n            pop = grp.groupby("PLAYER_ID")["rate36"].last(); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n            ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)\n            tm = pop.groupby(tier_of).mean(); tn = pop.groupby(tier_of).size(); pm = pop.mean()\n            for pid, t in tier_of.items(): tp[(s, ym, role, pid)] = (int(t), (tn[t] * tm[t] + TIER_BLEND_K * pm) / (tn[t] + TIER_BLEND_K))\n        d["tier"] = [tp.get((s, y_, r, p), (None, np.nan))[0] for s, y_, r, p in zip(d["season"], d["ym_s"], d["role_tier"], d["PLAYER_ID"])]\n        d["tier_prior"] = [tp.get((s, y_, r, p), (None, np.nan))[1] for s, y_, r, p in zip(d["season"], d["ym_s"], d["role_tier"], d["PLAYER_ID"])]\n'
PER_NEW = '        _trow = {}\n        for (s, ym, role), grp in d.groupby(["season", "ym_s", "role_tier"]):\n            _latest = {}\n            for _dte, _day in grp.sort_values("GAME_DATE").groupby("GAME_DATE", sort=True):\n                for _pid, _r in zip(_day["PLAYER_ID"], _day["rate36"]): _latest[_pid] = _r\n                pop = pd.Series(_latest); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))\n                ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)\n                tm = pop.groupby(tier_of).mean(); tn = pop.groupby(tier_of).size(); pm = pop.mean()\n                for _ix, _pid in zip(_day.index, _day["PLAYER_ID"]):\n                    t = int(tier_of[_pid]); _trow[_ix] = (t, float((tn[t] * tm[t] + TIER_BLEND_K * pm) / (tn[t] + TIER_BLEND_K)))\n        d["tier"] = [_trow.get(i, (None, np.nan))[0] for i in d.index]\n        d["tier_prior"] = [_trow.get(i, (None, np.nan))[1] for i in d.index]\n'


def on():
    return (os.environ.get("BT_HONEST") or DEFAULT) == "1"


def _apply(src, pairs, label):
    for a, b in pairs:
        assert src.count(a) == 1, f"honest recipe: {label} anchor changed: {a[:60]!r}"
        src = src.replace(a, b)
    return src


def harness(src):
    """classification_ladder_v12 source -> honest (when on)"""
    return _apply(src, ((TIER_OLD, TIER_NEW), (LG_OLD, LG_NEW), (IMPL_OLD, IMPL_NEW)), "classification") if on() else src


def combos(src):
    return _apply(src, ((COMBO_OLD, COMBO_NEW),), "combos") if on() else src


def periods(src):
    return _apply(src, ((PER_OLD, PER_NEW),), "periods") if on() else src
