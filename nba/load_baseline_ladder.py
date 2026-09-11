#!/usr/bin/env python3
"""
Load the baseline ladder artifact (singles + combos + periods) into Postgres.

The previous production load was singles-only, which left 1,660 board legs (44% of the 2026-03-15
slate) with no baseline probability. This loader takes whatever props the artifact contains and
records what it loaded in nba_score.baseline_ladder_runs, so the freshness gates can refuse to
publish a slate that is missing combos.

Ladder rows carry (player_id, game_id, prop, period, line) with p_more / p_less / p_raw and the cell
metadata (role_tier, var_band, used_emp, anchor, offset). Several rungs can land on the same line for
integer stats (COMPASS fact 16: rung is a cell dimension) - that is by design; we keep the rung
NEAREST THE ANCHOR deterministically rather than whichever row happened to arrive last.

Env: DATABASE_URL, LOAD_ASOF=YYYY-MM-DD
"""
import json
import os
import urllib.request
from collections import defaultdict

import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name):
    try:
        with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=300) as r:
            return json.load(r)
    except Exception as exc:  # noqa: BLE001
        print(f"  {name}: {exc}")
        return None


def main():
    asof = os.environ.get("LOAD_ASOF", "2026-03-15")
    docs = []
    for name in (f"nba_baseline_ladder_{asof}.json", "nba_baseline_ladder_latest.json",
                 f"nba_baseline_ladder_{asof}_combos.json", f"nba_baseline_ladder_{asof}_periods.json"):
        d = fetch(name)
        if d and (d.get("meta") or {}).get("asof") == asof:
            docs.append((name, d))
            print(f"  loaded {name}: {len(d.get('ladder') or [])} rows")
    if not docs:
        raise SystemExit(f"ABORT: no baseline artifact found for {asof}")

    # merge, keeping the rung nearest the anchor for each (player, game, prop, period, line)
    best = {}
    meta = {}
    for name, d in docs:
        meta = d.get("meta") or meta
        for r in d.get("ladder") or []:
            key = (str(r.get("player_id")), str(r.get("game_id")), r.get("prop"),
                   r.get("period") or "FULL", float(r.get("line")))
            off = abs(float(r.get("offset") or 0))
            cur = best.get(key)
            if cur is None or off < cur[0]:
                best[key] = (off, r)
    rows = [r for _, r in best.values()]
    props = sorted({r.get("prop") for r in rows})
    players = len({str(r.get("player_id")) for r in rows})
    print(f"merged: {len(rows)} rows | {len(props)} props | {players} players")
    print("props:", ", ".join(props))

    combo_props = {"pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double"}
    if not (combo_props & set(props)):
        raise SystemExit("ABORT: artifact has no combo props - refusing to load a singles-only slate")

    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM nba_score.baseline_ladder WHERE asof = %s", (asof,))
        cur.executemany("""INSERT INTO nba_score.baseline_ladder
            (asof, player_id, team_id, game_id, game_date, prop, period, ot_rule, line, anchor,
             ladder_offset, p_more, p_less, p_raw, role_tier, var_band, used_emp, recipe_version, loaded_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())""",
            [(asof, str(r.get("player_id")), str(r.get("team_id") or ""), str(r.get("game_id")),
              r.get("game_date"), r.get("prop"), r.get("period") or "FULL", r.get("ot_rule"),
              r.get("line"), r.get("anchor"), r.get("offset"), r.get("p_more"), r.get("p_less"),
              r.get("p_raw"), r.get("role_tier"), r.get("var_band"), r.get("used_emp"),
              (meta.get("recipe") or "")[:200]) for r in rows])
        cur.execute("DELETE FROM nba_score.baseline_ladder_runs WHERE asof = %s", (asof,))
        cur.execute("""INSERT INTO nba_score.baseline_ladder_runs
            (asof, slate_games, players, rows, props, history_seasons, current_season,
             factor_fits, role_minutes_multiplier, source_file, loaded_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())""",
            (asof, meta.get("slate_games"), players, len(rows), props,
             [str(x) for x in (meta.get("history_seasons") or [])] or None, meta.get("current_season"),
             json.dumps(meta.get("factor_fits") or {}), json.dumps(meta.get("role_minutes_multiplier") or {}),
             ", ".join(n for n, _ in docs)))
        cur.execute("SELECT prop, count(*) FROM nba_score.baseline_ladder WHERE asof=%s GROUP BY 1 ORDER BY 2 DESC", (asof,))
        for p, n in cur.fetchall():
            print(f"  {p:<16} {n}")
    conn.close()
    print("DONE")


if __name__ == "__main__":
    main()
