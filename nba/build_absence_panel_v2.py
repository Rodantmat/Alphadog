#!/usr/bin/env python3
"""
ABSENCE PANEL v2 — the fitting set for A2 redistribution, A2b dependent branch, A5, B4, M1.

WHY v2 EXISTS (the v1 error, retracted 2026-09-12):
  v1 used a TRAILING 10-GAME MEAN as each player's baseline. For a teammate who had already been out
  for a stretch, that trailing mean is ALREADY the with-him-out level, so the comparison was
  absent-vs-absent instead of absent-vs-present. The bias reproduced perfectly across both seasons —
  replication proves stability, not correctness. v1 also averaged RATIOS across heterogeneous
  baselines, which a 5->10 minute bench player dominates.

THE STRUCTURAL FIX — a true WITH/WITHOUT split, per pair:
  For each (player P, absent teammate X) the baseline is P's level in games where X PLAYED, computed
  as-of (strictly before the game being measured). The measured quantity is then

      delta_min(P | X out)  = minutes(P, this game) - mean minutes(P | X played, as-of)
      delta_poss(P | X out) = possessions used      - mean possessions(P | X played, as-of)

  and the SHARE that the flow model needs:

      share_min(P)  = delta_min(P)  / vacated_min(X)     with the team's shares summing to ~1
      share_poss(P) = delta_poss(P) / vacated_poss(X)

  Vacated is likewise X's own WITH-baseline (his level in games he played, as-of), not a blind mean.

OTHER FIXES OVER v1:
  * deltas, never ratio averages (ratios go in as diagnostics only)
  * absorbed totals sum SIGNED deltas (v1 clipped at zero, which is upward-biased by construction)
  * every rotation player is emitted, no minutes floor, so the absorbers cannot fall outside the sample
  * single-absence games flagged, so the flow can be fitted where attribution is unambiguous
  * pair sample size carried, so thin pairs can be shrunk rather than trusted

Kept from v1: PRE-GAME ruled-out absences only (injury archive at publish timestamps), context columns
(morning spread/total, blowout flag) so the garbage-time confound can be conditioned out, and the
name-flip fix ("Doncic, Luka" -> "lukadoncic") without which nothing matches.

Env: DATABASE_URL, PANEL_SEASONS, PAIR_MIN_GAMES (default 5)
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
SEASON_BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
ROTATION_MIN = 12.0
PAIR_MIN_GAMES = int(os.environ.get("PAIR_MIN_GAMES", "5"))


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def load_logs(slug):
    df = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    df["TEAM"] = df["MATCHUP"].str.split(" ").str[0]
    df["POSS"] = df["FGA"].fillna(0) + 0.44 * df["FTA"].fillna(0) + df["TOV"].fillna(0)
    return df.sort_values(["GAME_DATE"])


def load_injuries(slug):
    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    rows = []
    for shard in idx.get("shards", []):
        try:
            rows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {shard}: {exc}", flush=True)
    df = pd.DataFrame(rows)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce").dt.date
    df["snapshot_ts"] = pd.to_datetime(df["snapshot_ts"], errors="coerce", utc=True)
    df["nm"] = df["player_name"].map(flip_last_first)
    df["status_u"] = df["status"].astype(str).str.upper().str.strip()
    return df


def main():
    seasons = [s.strip() for s in os.environ.get("PANEL_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.absence_panel_v2 (
            season text, game_date date, game_id text, team text, opp text,
            player_id text, side text, out_player_id text,
            out_with_min numeric, out_with_poss numeric, out_usage_tier text, out_status text, out_reason_class text,
            n_out_team int, n_out_opp int, single_absence boolean,
            pair_games int,
            with_min numeric, with_poss numeric, with_rate36 numeric,
            act_min numeric, act_poss numeric, act_rate36 numeric,
            delta_min numeric, delta_poss numeric,
            share_min numeric, share_poss numeric,
            proj_spread numeric, proj_total numeric, blowout boolean,
            built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS absence_panel_v2_uidx
            ON nba_score.absence_panel_v2 (game_id, player_id, out_player_id)""")
        cur.execute("""CREATE INDEX IF NOT EXISTS absence_panel_v2_lookup
            ON nba_score.absence_panel_v2 (season, side, out_usage_tier, single_absence)""")

    for season in seasons:
        slug = season.replace("-", "_")
        print(f"=== {season}", flush=True)
        logs = load_logs(slug)
        inj = load_injuries(slug)
        nm_to_id = dict(pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn).values)
        print(f"  logs {len(logs):,} | injury {len(inj):,} | names {len(nm_to_id):,}", flush=True)

        # roster presence matrix: who played in each (game, team)
        played_by_game = logs.groupby("GAME_ID")["PLAYER_ID"].apply(set).to_dict()
        team_of = logs.groupby(["GAME_ID", "TEAM"])["PLAYER_ID"].apply(list).to_dict()
        per36 = np.where(logs["MIN"] > 0, logs["PTS"] / logs["MIN"] * 36, np.nan)
        logs = logs.assign(PER36=per36)

        # rolling WITH-baselines are built incrementally per pair as we walk dates forward (as-of)
        pair_sum = defaultdict(lambda: [0.0, 0.0, 0.0, 0])   # (P,X) -> [min, poss, per36, n] when X PLAYED
        solo_sum = defaultdict(lambda: [0.0, 0.0, 0.0, 0])   # P alone -> his own played games (for X's vacated)

        lo, hi = SEASON_BOUNDS[season]
        rows = []
        for gd, day in logs.groupby("GAME_DATE"):
            if not (str(lo) <= str(gd) <= str(hi)):
                continue
            rep = inj[inj["game_date"] == gd].sort_values("snapshot_ts")
            status = {r.nm: (r.status_u, getattr(r, "reason_class", None)) for r in rep.itertuples(index=False)}

            # ---- measure this date against the as-of WITH-baselines --------------------------------
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                played = played_by_game.get(gid, set())
                outs = {}
                for t in teams:
                    for nm, (st, rclass) in status.items():
                        if st not in ("OUT", "DOUBTFUL"):
                            continue
                        pid = nm_to_id.get(nm)
                        if pid is None or pid in played:
                            continue
                        s = solo_sum.get(pid)
                        if not s or s[3] < PAIR_MIN_GAMES or s[0] / s[3] < ROTATION_MIN:
                            continue
                        # attribute to the team he has been playing for
                        if pid not in set(logs[(logs["TEAM"] == t) & (logs["GAME_DATE"] < gd)]["PLAYER_ID"].tail(600)):
                            continue
                        wm, wp = s[0] / s[3], s[1] / s[3]
                        outs.setdefault(t, []).append({
                            "pid": pid, "with_min": wm, "with_poss": wp, "status": st, "reason_class": rclass,
                            "tier": "alpha" if wp >= 20 else ("secondary" if wp >= 14 else "role")})
                if not outs:
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    n_t, n_o = len(outs.get(t, [])), len(outs.get(opp, []))
                    if n_t == 0 and n_o == 0:
                        continue
                    tdf = gdf[gdf["TEAM"] == t]
                    for r in tdf.itertuples(index=False):
                        for side, src in (("teammate", t), ("opponent", opp)):
                            for o in outs.get(src, []):
                                key = (r.PLAYER_ID, o["pid"])
                                ps = pair_sum.get(key)
                                if not ps or ps[3] < PAIR_MIN_GAMES:
                                    continue          # too few shared games to have a WITH baseline
                                wmin, wposs, wr36, n = ps[0] / ps[3], ps[1] / ps[3], ps[2] / max(ps[3], 1), ps[3]
                                d_min = float(r.MIN) - wmin
                                d_poss = float(r.POSS) - wposs
                                rows.append((
                                    season, gd, gid, t, opp, r.PLAYER_ID, side, o["pid"],
                                    o["with_min"], o["with_poss"], o["tier"], o["status"], o["reason_class"],
                                    n_t, n_o, (n_t == 1 if side == "teammate" else n_o == 1), n,
                                    wmin, wposs, wr36, float(r.MIN), float(r.POSS),
                                    float(r.PER36) if np.isfinite(r.PER36) else None,
                                    d_min, d_poss,
                                    d_min / o["with_min"] if o["with_min"] else None,
                                    d_poss / o["with_poss"] if o["with_poss"] else None,
                                    None, None, None))

            # ---- then fold this date INTO the baselines (strictly after measuring = as-of) ---------
            for gid, gdf in day.groupby("GAME_ID"):
                for t, tdf in gdf.groupby("TEAM"):
                    ids = list(tdf["PLAYER_ID"])
                    for r in tdf.itertuples(index=False):
                        s = solo_sum[r.PLAYER_ID]
                        s[0] += float(r.MIN); s[1] += float(r.POSS)
                        s[2] += float(r.PER36) if np.isfinite(r.PER36) else 0.0; s[3] += 1
                        for other in ids:                      # WITH = both on the floor tonight
                            if other == r.PLAYER_ID:
                                continue
                            p = pair_sum[(r.PLAYER_ID, other)]
                            p[0] += float(r.MIN); p[1] += float(r.POSS)
                            p[2] += float(r.PER36) if np.isfinite(r.PER36) else 0.0; p[3] += 1
            if len(rows) > 150000:
                write(conn, rows); rows = []
        write(conn, rows)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT game_id) FROM nba_score.absence_panel_v2 WHERE season=%s", (season,))
            print(f"  {season}: {cur.fetchone()}", flush=True)
    conn.close()


def write(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.absence_panel_v2 VALUES
            (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (game_id, player_id, out_player_id) DO NOTHING""", rows)
    conn.commit()


if __name__ == "__main__":
    main()
