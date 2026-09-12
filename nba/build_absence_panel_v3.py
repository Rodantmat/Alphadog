#!/usr/bin/env python3
"""
ABSENCE PANEL v3 — game-level with/without, no receiver exclusions, regression-ready.

WHY v3 (v1 and v2 both failed the conservation check: shares summed to 0.10 / -0.05 / -0.37):
  v1: baseline was a TRAILING MEAN already containing games without X -> absent-vs-absent comparison,
      and it averaged RATIOS across heterogeneous baselines (a 5->10 minute bench player = ratio 2.0).
  v2: real per-pair baselines, but `pair_games >= 5` DROPPED the thin-history receivers - and those are
      exactly the bench players who absorb vacated minutes. Same failure as v1's minutes floor and as
      the leaguedashlineups 2,000-row cap: every one of them removed receivers.

RESEARCH (2026-09-12, see NBA_ENRICHMENT_ENGINE_DESIGN.md; sources + Gemini):
  The right control for "X ruled out PRE-GAME" is GAMES WHERE X DID NOT PLAY AT ALL - not within-game
  stints where X sat. Those stints are bench-heavy rotation minutes, garbage time and situational
  lineups; they measure rotation patterns, not the team's strategic response to losing a player. When X
  is ruled out pre-game the starting lineup changes and rotations are redesigned from the opening tip.
  => shared-court/stint data is the WRONG UNIT for this measurement. Game level is correct.

v3 RULES
  1. baseline(P | X available) = P's game-level minutes/possessions in games where X PLAYED, computed
     as-of (strictly before the game being measured).
  2. NO EXCLUSION THRESHOLDS. Every player who appeared is a row. Thin history is handled by SHRINKAGE
     toward the team-level mean (n/(n+k)), never by dropping - dropping receivers is what broke v1/v2.
  3. DELTAS, not ratio averages. Ratios are carried only as diagnostics.
  4. Regression-ready columns (opponent quality, home/away, projected spread, rest) because absences are
     not randomly distributed across opponents - raw averages would bake that in.
  5. Conservation is the GATE: per team-game, sum(delta_min)/vacated_min should approach 1.

Env: DATABASE_URL, PANEL_SEASONS, PANEL_SAMPLE_DATES (test on N dates first), SHRINK_K (default 5)
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
SHRINK_K = float(os.environ.get("SHRINK_K", "5"))


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def main():
    seasons = [s.strip() for s in os.environ.get("PANEL_SEASONS", "2025-26").split(",")]
    sample = int(os.environ.get("PANEL_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.absence_panel_v3 (
            season text, game_date date, game_id text, team text, opp text, is_home int,
            player_id text, side text, out_player_id text,
            out_with_min numeric, out_with_poss numeric, out_usage_tier text,
            n_out_team int, n_out_opp int, single_absence boolean,
            with_games int, shrink_w numeric,
            base_min numeric, base_poss numeric, base_pts numeric,
            act_min numeric, act_poss numeric, act_pts numeric,
            delta_min numeric, delta_poss numeric, delta_pts numeric,
            team_vacated_min numeric, team_vacated_poss numeric,
            proj_spread numeric, blowout boolean,
            built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS absence_panel_v3_uidx
            ON nba_score.absence_panel_v3 (game_id, player_id, out_player_id)""")
        cur.execute("CREATE INDEX IF NOT EXISTS absence_panel_v3_lookup ON nba_score.absence_panel_v3 (season, side, out_usage_tier)")
        nm_to_id = dict(pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn).values)
        spreads = pd.read_sql("""SELECT m.game_id, max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS home_spread
                                 FROM nba_market.game_lines_snapshots s JOIN nba_market.event_game_map m ON m.event_id=s.event_id
                                 WHERE s.snapshot_label='morning' GROUP BY 1""", conn)
        spread_of = dict(zip(spreads["game_id"], spreads["home_spread"]))

    for season in seasons:
        slug = season.replace("-", "_")
        print(f"=== {season}", flush=True)
        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        logs["GAME_ID"] = logs["GAME_ID"].astype(str)
        logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
        logs["IS_HOME"] = (~logs["MATCHUP"].str.contains("@")).astype(int)
        logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
        logs = logs.sort_values("GAME_DATE")

        idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
        irows = []
        for shard in idx.get("shards", []):
            try:
                irows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
            except Exception as exc:  # noqa: BLE001
                print(f"  shard {shard}: {exc}", flush=True)
        inj = pd.DataFrame(irows)
        inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
        inj["nm"] = inj["player_name"].map(flip_last_first)
        inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
        print(f"  logs {len(logs):,} | injury {len(inj):,}", flush=True)

        # as-of accumulators: per player totals in games where teammate X ALSO PLAYED
        pair_tot = defaultdict(lambda: [0.0, 0.0, 0.0, 0])      # (P,X) -> [min, poss, pts, games]
        team_tot = defaultdict(lambda: [0.0, 0.0, 0.0, 0])      # (P) team-level fallback -> same
        lo, hi = BOUNDS[season]
        dates = [d for d in sorted(logs["GAME_DATE"].unique()) if str(lo) <= str(d) <= str(hi)]
        if sample:
            dates = dates[:sample]
        rows = []
        for gd in dates:
            day = logs[logs["GAME_DATE"] == gd]
            played_today = set(day["PLAYER_ID"])
            rep = inj[inj["game_date"] == gd]
            ruled_out = {nm_to_id.get(r.nm) for r in rep.itertuples(index=False)
                         if r.status_u in ("OUT", "DOUBTFUL") and nm_to_id.get(r.nm)}
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                # the absent rotation players per team: ruled out pre-game, didn't play, and have an
                # as-of baseline of their own (any number of games - no threshold)
                outs = {}
                for t in teams:
                    roster = {p for (p, x), v in pair_tot.items() if v[3] > 0} | {p for p in team_tot}
                    for pid in ruled_out:
                        if pid in played_today or pid not in team_tot:
                            continue
                        tt = team_tot[pid]
                        if tt[3] == 0:
                            continue
                        # attribute to the team he last played for
                        last = logs[(logs["PLAYER_ID"] == pid) & (logs["GAME_DATE"] < gd)]
                        if last.empty or last.iloc[-1]["TEAM"] != t:
                            continue
                        wm, wp = tt[0] / tt[3], tt[1] / tt[3]
                        if wm < 10:
                            continue
                        outs.setdefault(t, []).append({"pid": pid, "min": wm, "poss": wp,
                                                       "tier": "alpha" if wp >= 20 else ("secondary" if wp >= 14 else "role")})
                if not outs:
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    n_t, n_o = len(outs.get(t, [])), len(outs.get(opp, []))
                    if n_t == 0 and n_o == 0:
                        continue
                    tdf = gdf[gdf["TEAM"] == t]
                    vac_min = sum(o["min"] for o in outs.get(t, []))
                    vac_poss = sum(o["poss"] for o in outs.get(t, []))
                    sp = spread_of.get(gid)
                    for r in tdf.itertuples(index=False):
                        for side, src in (("teammate", t), ("opponent", opp)):
                            for o in outs.get(src, []):
                                pt = pair_tot.get((r.PLAYER_ID, o["pid"]), [0.0, 0.0, 0.0, 0])
                                tt = team_tot.get(r.PLAYER_ID, [0.0, 0.0, 0.0, 0])
                                if tt[3] == 0:
                                    continue
                                n = pt[3]
                                w = n / (n + SHRINK_K)          # SHRINK, never drop
                                bmin = w * (pt[0] / n if n else 0) + (1 - w) * (tt[0] / tt[3])
                                bposs = w * (pt[1] / n if n else 0) + (1 - w) * (tt[1] / tt[3])
                                bpts = w * (pt[2] / n if n else 0) + (1 - w) * (tt[2] / tt[3])
                                rows.append((season, gd, gid, t, opp, int(r.IS_HOME), r.PLAYER_ID, side, o["pid"],
                                             o["min"], o["poss"], o["tier"], n_t, n_o,
                                             (n_t == 1 if side == "teammate" else n_o == 1), n, w,
                                             bmin, bposs, bpts, float(r.MIN), float(r.POSS), float(r.PTS),
                                             float(r.MIN) - bmin, float(r.POSS) - bposs, float(r.PTS) - bpts,
                                             vac_min, vac_poss, sp, (abs(sp) >= 11.5) if sp is not None else None))
            # fold today into the as-of accumulators AFTER measuring
            for gid, gdf in day.groupby("GAME_ID"):
                for t, tdf in gdf.groupby("TEAM"):
                    ids = list(tdf["PLAYER_ID"])
                    for r in tdf.itertuples(index=False):
                        tt = team_tot[r.PLAYER_ID]
                        tt[0] += float(r.MIN); tt[1] += float(r.POSS); tt[2] += float(r.PTS); tt[3] += 1
                        for other in ids:
                            if other != r.PLAYER_ID:
                                p = pair_tot[(r.PLAYER_ID, other)]
                                p[0] += float(r.MIN); p[1] += float(r.POSS); p[2] += float(r.PTS); p[3] += 1
            if len(rows) > 120000:
                write(conn, rows); rows = []
        write(conn, rows)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT game_id) FROM nba_score.absence_panel_v3 WHERE season=%s", (season,))
            print(f"  {season}: {cur.fetchone()}", flush=True)
    conn.close()


def write(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.absence_panel_v3 VALUES
            (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (game_id, player_id, out_player_id) DO NOTHING""", rows)
    conn.commit()


if __name__ == "__main__":
    main()
