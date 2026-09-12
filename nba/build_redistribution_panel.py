#!/usr/bin/env python3
"""
REDISTRIBUTION PANEL v4 — team-game allocation, not per-absence attribution.

WHY v4 (v1/v2/v3 all failed the conservation gate: 0.10 / -0.05 / -0.37 / 0.25-0.49):
  Every earlier version tried to attribute vacated minutes to a SPECIFIC absent player, and every
  version then had to isolate a "clean" sub-case to make that attribution meaningful:
      v1  minutes floor on receivers        -> dropped the absorbers
      v2  pair_games >= 5                   -> dropped the absorbers
      v2b leaguedashlineups                 -> API capped at 2,000 rows, dropped the absorbers
      v3  single_absence only               -> kept 218 of ~1,150 team-games, biased remainder
  The isolation WAS the bug, five times. Most NBA games have several players out; their vacated
  minutes pool together and cannot be attributed to one absence from box scores.

v4 STRUCTURE — one row per (team-game, remaining player), absences as FEATURES:
      target:   delta_min, delta_poss, delta_pts   (actual minus the as-of with-available baseline)
      pool:     team_vacated_min / team_vacated_poss  (sum over ALL players ruled out pre-game)
      features: receiver role rank, baseline minutes/usage, position group, direct-backup flag,
                absent players' pooled usage tier mix, count out, opponent quality, home, spread, rest
  Conservation holds BY CONSTRUCTION at fit time: the allocation is fitted as shares of the team pool
  (sum of predicted shares = 1), rather than as independent per-player multipliers.

  Uses EVERY game with at least one pre-game absence - thousands of team-games, not 218.

RULES KEPT FROM THE RESEARCH
  * pre-game ruled-out only (injury archive at publish timestamps; name flip "Last, First")
  * baseline = the player's level in games where the absent set WAS available, as-of, shrunk toward his
    own overall as-of mean (never dropped - dropping receivers is what broke v1-v3)
  * deltas, never ratio averages
  * context columns for the regression controls (spread, opponent, home, rest) because absences are not
    randomly distributed across opponents
  * SAMPLE FIRST (owner rule 2026-09-12): PANEL_SAMPLE_DATES runs a slice and the conservation gate is
    checked before any full replication.

Env: DATABASE_URL, PANEL_SEASONS, PANEL_SAMPLE_DATES, SHRINK_K
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
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.redistribution_panel (
            season text, game_date date, game_id text, team text, opp text, is_home int,
            player_id text, role_rank int, base_min numeric, base_poss numeric, base_pts numeric,
            act_min numeric, act_poss numeric, act_pts numeric,
            delta_min numeric, delta_poss numeric, delta_pts numeric,
            n_out int, out_ids text, out_max_usage numeric, out_usage_mix text,
            team_vacated_min numeric, team_vacated_poss numeric,
            share_min numeric, share_poss numeric,
            n_out_opp int, opp_vacated_poss numeric,
            proj_spread numeric, blowout boolean, with_games int, shrink_w numeric,
            built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS redistribution_panel_uidx
            ON nba_score.redistribution_panel (game_id, player_id)""")
        cur.execute("CREATE INDEX IF NOT EXISTS redistribution_panel_lookup ON nba_score.redistribution_panel (season, n_out)")
        nm_to_id = dict(pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn).values)
        sp = pd.read_sql("""SELECT m.game_id, max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS hs
                            FROM nba_market.game_lines_snapshots s JOIN nba_market.event_game_map m ON m.event_id=s.event_id
                            WHERE s.snapshot_label='morning' GROUP BY 1""", conn)
        spread_of = dict(zip(sp["game_id"], sp["hs"]))

    for season in seasons:
        slug = season.replace("-", "_")
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
        print(f"{season}: logs {len(logs):,} | injury {len(inj):,}", flush=True)

        tot = defaultdict(lambda: [0.0, 0.0, 0.0, 0])          # player -> as-of totals (all games he played)
        cond = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0]))   # player -> teammate -> when teammate PLAYED
        last_team = {}
        lo, hi = BOUNDS[season]
        dates = [d for d in sorted(logs["GAME_DATE"].unique()) if str(lo) <= str(d) <= str(hi)]
        if sample:
            dates = dates[:sample]
        rows = []
        for gd in dates:
            day = logs[logs["GAME_DATE"] == gd]
            played = set(day["PLAYER_ID"])
            rep = inj[inj["game_date"] == gd]
            ruled = {nm_to_id.get(r.nm) for r in rep.itertuples(index=False)
                     if r.status_u in ("OUT", "DOUBTFUL") and nm_to_id.get(r.nm)}
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                outs = {t: [] for t in teams}
                for pid in ruled:
                    if pid in played or pid not in tot or last_team.get(pid) not in teams:
                        continue
                    t = last_team[pid]
                    s = tot[pid]
                    wm, wp = s[0] / s[3], s[1] / s[3]
                    if wm < 8:                      # not a rotation player -> nothing to redistribute
                        continue
                    outs[t].append({"pid": pid, "min": wm, "poss": wp})
                if not any(outs.values()):
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    if not outs[t] and not outs[opp]:
                        continue
                    o_t, o_o = outs[t], outs[opp]
                    vac_min = sum(o["min"] for o in o_t)
                    vac_poss = sum(o["poss"] for o in o_t)
                    out_ids = ",".join(o["pid"] for o in o_t)
                    mix = ",".join(sorted("alpha" if o["poss"] >= 20 else ("secondary" if o["poss"] >= 14 else "role") for o in o_t))
                    tdf = gdf[gdf["TEAM"] == t].copy()
                    # role rank by as-of minutes among tonight's actual participants
                    ranks = {}
                    for r in tdf.itertuples(index=False):
                        s = tot.get(r.PLAYER_ID)
                        ranks[r.PLAYER_ID] = (s[0] / s[3]) if s and s[3] else 0.0
                    order = sorted(ranks, key=ranks.get, reverse=True)
                    spread = spread_of.get(gid)
                    for r in tdf.itertuples(index=False):
                        s = tot.get(r.PLAYER_ID)
                        if not s or s[3] == 0:
                            # NO HISTORY: cold start. Baseline 0 with a flag - his whole line counts
                            # toward the pool, because dropping him is exactly what broke v1-v3.
                            bmin = bposs = bpts = 0.0
                            n, w = 0, 0.0
                        else:
                            # baseline = his level in games where the ABSENT SET was available,
                            # shrunk toward his overall as-of mean
                            num = [0.0, 0.0, 0.0, 0]
                            for o in o_t:
                                c = cond[r.PLAYER_ID].get(o["pid"])
                                if c and c[3]:
                                    for i in range(4):
                                        num[i] += c[i]
                            n = num[3]
                            w = n / (n + SHRINK_K) if n else 0.0
                            om, op, opt = s[0] / s[3], s[1] / s[3], s[2] / s[3]
                            bmin = w * (num[0] / n if n else 0) + (1 - w) * om
                            bposs = w * (num[1] / n if n else 0) + (1 - w) * op
                            bpts = w * (num[2] / n if n else 0) + (1 - w) * opt
                        rows.append((season, gd, gid, t, opp, int(r.IS_HOME), r.PLAYER_ID,
                                     order.index(r.PLAYER_ID) + 1, bmin, bposs, bpts,
                                     float(r.MIN), float(r.POSS), float(r.PTS),
                                     float(r.MIN) - bmin, float(r.POSS) - bposs, float(r.PTS) - bpts,
                                     len(o_t), out_ids, max([o["poss"] for o in o_t], default=0.0), mix,
                                     vac_min, vac_poss,
                                     (float(r.MIN) - bmin) / vac_min if vac_min else None,
                                     (float(r.POSS) - bposs) / vac_poss if vac_poss else None,
                                     len(o_o), sum(o["poss"] for o in o_o),
                                     spread, (abs(spread) >= 11.5) if spread is not None else None, n, w))
            for gid, gdf in day.groupby("GAME_ID"):
                for t, tdf in gdf.groupby("TEAM"):
                    ids = list(tdf["PLAYER_ID"])
                    for r in tdf.itertuples(index=False):
                        last_team[r.PLAYER_ID] = t
                        s = tot[r.PLAYER_ID]
                        s[0] += float(r.MIN); s[1] += float(r.POSS); s[2] += float(r.PTS); s[3] += 1
                        for other in ids:
                            if other != r.PLAYER_ID:
                                c = cond[r.PLAYER_ID][other]
                                c[0] += float(r.MIN); c[1] += float(r.POSS); c[2] += float(r.PTS); c[3] += 1
            if len(rows) > 100000:
                write(conn, rows); rows = []
        write(conn, rows)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT game_id||team) FROM nba_score.redistribution_panel WHERE season=%s", (season,))
            print(f"  {season}: rows/team-games {cur.fetchone()}", flush=True)
    conn.close()


def write(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.redistribution_panel VALUES
            (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (game_id, player_id) DO NOTHING""", rows)
    conn.commit()


if __name__ == "__main__":
    main()
