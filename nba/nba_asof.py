#!/usr/bin/env python3
"""
nba_asof.py - the ONE set of as-of rules shared by the daily pipeline and the historical simulation.

Owner rule (2026-09-09): the backfill must match what the daily mining will be like, so the system can be simulated and
trained on it. Parity means: same row shapes, same snapshot semantics, and the same cutoff function applied to
historical timestamps as to live ones. Nothing here looks at outcomes.

Cutoffs (ET):
  BASELINE_CUTOFF  = game day 09:00  -> the morning ladder build sees the official day-before report (5 PM local the
                                        day before, present in the previous afternoon/evening PDF snapshots)
  ENRICH_CUTOFFS   = 13:30, 17:30, and tip-30min -> the enrichment runs (game-day report lands 11 AM-1 PM local;
                                        B2B second-night report 1 PM local; final bulletins 15-30 min pre-tip)

Injury snapshots (nba/data/nba_injury_report_<slug>.json or _current.json; rows carry snapshot_ts):
  status_asof(rows, game_date, cutoff_ts) -> {(team, player_name): (status, reason_class, snapshot_ts)} using the latest
  snapshot <= cutoff for that game_date. A team whose latest snapshot says NOT_YET_SUBMITTED yields no player rows for
  that team at that cutoff (the baseline then falls back to the derived P(plays) prior - design rule).

Season tables (weekly as-of snapshots nba/data/nba_<table>_asof_<slug>.json with meta.asof dates):
  table_asof(snapshots, game_date) -> the snapshot with the latest asof date < game_date (strictly before, so the game
  itself is never inside its own predictor).

Per-game matchups (nba/data/nba_matchups_pergame_<slug>.json): aggregate_matchups_asof(rows, game_date) sums the
pairings over games strictly before game_date.
"""

BASELINE_CUTOFF_LOCAL = "09:00"
ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]
ET_OFFSET = "-05:00"   # snapshot_ts strings are written in ET with this offset by the scraper


def cutoff_ts(game_date, hhmm):
    return f"{game_date}T{hhmm}:00{ET_OFFSET}"


def status_asof(rows, game_date, cutoff):
    """Latest snapshot <= cutoff for each team playing on game_date; returns dict keyed by (team, player_name)."""
    by_team = {}
    for r in rows:
        if r.get("game_date") != game_date or r.get("snapshot_ts", "") > cutoff:
            continue
        t = r["team"]
        best = by_team.get(t)
        if best is None or r["snapshot_ts"] > best:
            by_team[t] = r["snapshot_ts"]
    out = {}
    for r in rows:
        if r.get("game_date") != game_date: continue
        if by_team.get(r["team"]) != r["snapshot_ts"]: continue
        if r["status"] == "NOT_YET_SUBMITTED": continue
        out[(r["team"], r["player_name"])] = (r["status"], r.get("reason_class"), r["snapshot_ts"])
    return out


def table_asof(snapshots, game_date):
    """snapshots: list of {"asof": "YYYY-MM-DD", "records": [...]}; returns the latest with asof < game_date."""
    cands = [s for s in snapshots if s["asof"] < game_date]
    return max(cands, key=lambda s: s["asof"]) if cands else None


def load_matchups(data_dir, slug):
    """Reassemble the columnar monthly shards nba_matchups_pergame_<slug>_<YYYY-MM>.json into row dicts."""
    import json
    from pathlib import Path
    rows = []
    for p in sorted(Path(data_dir).glob(f"nba_matchups_pergame_{slug}_20*.json")):
        d = json.loads(p.read_text()); cols = d["columns"]
        rows += [dict(zip(cols, r)) for r in d["rows"]]
    return rows


def aggregate_matchups_asof(rows, game_date, keys=("personIdOff", "personIdDef"), sum_cols=("matchupMinutes", "partialPossessions", "playerPoints", "matchupFieldGoalsAttempted", "matchupFieldGoalsMade", "matchupThreePointersAttempted", "matchupThreePointersMade", "matchupFreeThrowsAttempted", "matchupFreeThrowsMade", "matchupAssists", "matchupTurnovers", "shootingFouls")):
    """Sum per-game matchup rows with GAME_DATE < game_date into season-to-date pairings."""
    agg = {}
    for r in rows:
        if r.get("GAME_DATE", "") >= game_date: continue
        k = tuple(r.get(c) for c in keys)
        a = agg.setdefault(k, {c: 0.0 for c in sum_cols} | {"GP": 0})
        a["GP"] += 1
        for c in sum_cols:
            v = r.get(c)
            try:
                if v is not None: a[c] += float(v)
            except (TypeError, ValueError):
                pass
    return agg
