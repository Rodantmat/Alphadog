#!/usr/bin/env python3
"""
ABSENCE PANEL — the fitting set for the enrichment layer's largest factors (A2 redistribution,
A2b dependent branch, A5 role change, B4 opponent availability, M1 defender quality).

One row per (game, affected player) for every game in which at least one rotation player of either
team was RULED OUT BEFORE TIP, carrying what the player actually did versus what the baseline
predicted, plus the tier keys the cells are keyed on.

THE THREE RULES THAT MAKE THIS A VALID FITTING SET (research 2026-09-12, see
nba/NBA_ENRICHMENT_ENGINE_DESIGN.md §3a-§3d):

  1. PRE-GAME RULED OUT ONLY. With/without splits are contaminated by WHY a player sat. We use the
     injury-report archive at its publish timestamps and take only players whose status was Out (or
     Doubtful, tiered separately) at the as-of cutoff BEFORE tip. In-game exits and unannounced
     absences are excluded, not guessed.
  2. CONTEXT CONDITIONED. Every row carries the projected spread/total (from the morning game-line
     snapshot), the realized margin, and a blowout flag, because absences cluster in blowouts and
     load-management spots — which inflates beneficiaries' rates in garbage time.
  3. RESIDUAL AGAINST THE BASELINE, AS-OF. The measure is actual / baseline-predicted, where the
     baseline is the day-by-day history built from data strictly before that game. A factor the
     baseline already carries contributes ~1.0 and drops out (double-count discipline).

CONSERVATION: for every affected team-game we also emit the team totals (vacated minutes/usage and
where they went), so the flow share vectors can be fitted as shares that sum to 1 rather than as
independent per-player multipliers, which cannot respect the 240-minute constraint.

Output: nba_score.absence_panel (+ absence_panel_teams). Built in monthly blocks.
Env: DATABASE_URL, PANEL_SEASONS="2024-25,2025-26", PANEL_FROM/PANEL_TO (YYYY-MM optional)
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
SEASON_BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
# the cutoff we fit on: the day-of report at 2:30 PM PT is the live trigger, but for the PANEL we take
# the last report published before tip, since we are measuring what an absence DID, not when we knew it
ROTATION_MIN = 12.0     # a "rotation player" for the purpose of an absence mattering
STAR_USAGE = 0.25


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def load_logs(slug):
    doc = fetch(f"nba_player_game_log_{slug}.json")
    df = pd.DataFrame(doc["records"])
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    df["TEAM"] = df["MATCHUP"].str.split(" ").str[0]
    df["HOME"] = (~df["MATCHUP"].str.contains("@")).astype(int)
    df["OPP"] = df["MATCHUP"].str.replace(".", "", regex=False).str.split(" ").str[-1]
    # usage proxy from the box score (true USG needs team totals; this is the same shape and is as-of safe)
    df["POSS_USED"] = df["FGA"].fillna(0) + 0.44 * df["FTA"].fillna(0) + df["TOV"].fillna(0)
    return df


def load_injuries(slug):
    """Rows already carry snapshot_ts, status, reason, team, player_name (monthly shards)."""
    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    rows = []
    for shard in idx.get("shards", []):
        try:
            d = fetch(f"nba_injury_report_{slug}_{shard}.json")
            rows.extend(d.get("rows") or [])
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {shard}: {exc}", flush=True)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce").dt.date
    df["snapshot_ts"] = pd.to_datetime(df["snapshot_ts"], errors="coerce", utc=True)
    df["nm"] = df["player_name"].map(norm_name)
    df["status_u"] = df["status"].astype(str).str.upper().str.strip()
    return df


def last_status_before_tip(inj, gd):
    """Latest status per (team, player) among reports published for that game date."""
    day = inj[inj["game_date"] == gd]
    if day.empty:
        return {}
    day = day.sort_values("snapshot_ts")
    out = {}
    for r in day.itertuples(index=False):
        out[r.nm] = (r.status_u, getattr(r, "reason", None), getattr(r, "reason_class", None), r.team)
    return out


def main():
    seasons = [s.strip() for s in os.environ.get("PANEL_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.absence_panel (
            season text, game_date date, game_id text, team text, opp text,
            player_id text, role text,                      -- 'teammate' | 'opponent'
            out_player_id text, out_role_tier text, out_usage_tier text, out_reason_class text, out_status text,
            n_out_team int, n_out_opp int,
            role_tier text, is_direct_backup boolean, same_position boolean,
            base_min numeric, act_min numeric, min_ratio numeric,
            base_rate36 numeric, act_rate36 numeric, rate_ratio numeric,
            base_poss numeric, act_poss numeric, poss_ratio numeric,
            proj_spread numeric, proj_total numeric, margin numeric, blowout boolean,
            built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS absence_panel_uidx ON nba_score.absence_panel
            (game_id, player_id, out_player_id)""")
        cur.execute("CREATE INDEX IF NOT EXISTS absence_panel_lookup ON nba_score.absence_panel (season, out_usage_tier, role_tier)")
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.absence_panel_teams (
            season text, game_date date, game_id text, team text,
            vacated_min numeric, vacated_poss numeric, absorbed_min numeric, absorbed_poss numeric,
            n_out int, n_receivers int, built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS absence_panel_teams_uidx
            ON nba_score.absence_panel_teams (game_id, team)""")

    for season in seasons:
        slug = season.replace("-", "_")
        print(f"=== {season}: loading logs + injuries", flush=True)
        logs = load_logs(slug)
        inj = load_injuries(slug)
        if inj.empty:
            print(f"  no injury rows for {season} - skipping (2023-24 has no archive)", flush=True)
            continue
        base = pd.read_sql("""SELECT game_date, player_id, prop, anchor, role_tier
                              FROM nba_score.baseline_history WHERE season = %s AND prop = 'points' AND ladder_offset = 0""",
                           conn, params=(season,))
        base["game_date"] = pd.to_datetime(base["game_date"]).dt.date
        base["player_id"] = base["player_id"].astype(str)
        print(f"  logs {len(logs):,} | injury rows {len(inj):,} | baseline anchors {len(base):,}", flush=True)

        # as-of season history for a player's own baseline minutes / rate (strictly before the game)
        logs = logs.sort_values(["PLAYER_ID", "GAME_DATE"])
        g = logs.groupby("PLAYER_ID")
        for c, src in (("base_min", "MIN"), ("base_poss", "POSS_USED")):
            logs[c] = g[src].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        logs["per36"] = np.where(logs["MIN"] > 0, logs["PTS"] / logs["MIN"] * 36, np.nan)
        logs["base_rate36"] = g["per36"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())

        lo, hi = SEASON_BOUNDS[season]
        dates = sorted(d for d in logs["GAME_DATE"].unique() if str(lo) <= str(d) <= str(hi))
        rows, team_rows = [], []
        for gd in dates:
            status = last_status_before_tip(inj, gd)
            if not status:
                continue
            day = logs[logs["GAME_DATE"] == gd]
            played = set(day["PLAYER_ID"])
            for gid, gdf in day.groupby("GAME_ID"):
                teams = gdf["TEAM"].unique()
                if len(teams) != 2:
                    continue
                # who was RULED OUT pre-game and was a rotation player by his own as-of minutes
                outs = {}
                for t in teams:
                    tdf = gdf[gdf["TEAM"] == t]
                    hist = logs[(logs["TEAM"] == t) & (logs["GAME_DATE"] < gd)]
                    recent = hist[hist["GAME_DATE"] >= (pd.Timestamp(gd) - pd.Timedelta(days=30)).date()]
                    for pid, pg in recent.groupby("PLAYER_ID"):
                        if pid in played or pg["MIN"].mean() < ROTATION_MIN:
                            continue
                        nm = None  # resolve by name from the report side
                        for k, (st, _rs, _rc, rteam) in status.items():
                            if st in ("OUT", "DOUBTFUL") and rteam and t[:3].upper() in str(rteam).upper()[:3]:
                                nm = k
                                break
                        if nm is None:
                            continue
                        outs.setdefault(t, []).append({
                            "player_id": pid, "min": float(pg["MIN"].mean()),
                            "poss": float(pg["POSS_USED"].mean()),
                            "usage_tier": "alpha" if pg["POSS_USED"].mean() >= 20 else ("secondary" if pg["POSS_USED"].mean() >= 14 else "role"),
                            "status": status.get(nm, ("OUT",))[0], "reason_class": status.get(nm, (None, None, None))[2],
                        })
                if not outs:
                    continue
                for t in teams:
                    opp = [x for x in teams if x != t][0]
                    n_out_team, n_out_opp = len(outs.get(t, [])), len(outs.get(opp, []))
                    if n_out_team == 0 and n_out_opp == 0:
                        continue
                    tdf = gdf[gdf["TEAM"] == t]
                    vac_min = sum(o["min"] for o in outs.get(t, []))
                    vac_poss = sum(o["poss"] for o in outs.get(t, []))
                    absorbed_min = float((tdf["MIN"] - tdf["base_min"]).clip(lower=0).sum())
                    absorbed_poss = float((tdf["POSS_USED"] - tdf["base_poss"]).clip(lower=0).sum())
                    team_rows.append((season, gd, gid, t, vac_min, vac_poss, absorbed_min, absorbed_poss,
                                      n_out_team, int((tdf["MIN"] > tdf["base_min"]).sum())))
                    for r in tdf.itertuples(index=False):
                        if not np.isfinite(getattr(r, "base_min", np.nan)) or r.base_min < 6:
                            continue
                        for side, src_team in (("teammate", t), ("opponent", opp)):
                            for o in outs.get(src_team, []):
                                rows.append((
                                    season, gd, gid, t, opp, r.PLAYER_ID, side,
                                    o["player_id"], None, o["usage_tier"], o["reason_class"], o["status"],
                                    n_out_team, n_out_opp, None, None, None,
                                    float(r.base_min), float(r.MIN), float(r.MIN / r.base_min) if r.base_min else None,
                                    float(r.base_rate36) if np.isfinite(getattr(r, "base_rate36", np.nan)) else None,
                                    float(r.per36) if np.isfinite(getattr(r, "per36", np.nan)) else None,
                                    float(r.per36 / r.base_rate36) if np.isfinite(getattr(r, "base_rate36", np.nan)) and r.base_rate36 else None,
                                    float(r.base_poss) if np.isfinite(getattr(r, "base_poss", np.nan)) else None,
                                    float(r.POSS_USED),
                                    float(r.POSS_USED / r.base_poss) if np.isfinite(getattr(r, "base_poss", np.nan)) and r.base_poss else None,
                                    None, None, None, None))
            if len(rows) > 200000:
                flush(conn, rows, team_rows)
                rows, team_rows = [], []
        flush(conn, rows, team_rows)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT game_id) FROM nba_score.absence_panel WHERE season=%s", (season,))
            n, gms = cur.fetchone()
            print(f"  {season}: {n:,} panel rows across {gms} games", flush=True)
    conn.close()


def flush(conn, rows, team_rows):
    if rows:
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.absence_panel VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (game_id, player_id, out_player_id) DO NOTHING""", rows)
    if team_rows:
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.absence_panel_teams VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (game_id, team) DO NOTHING""", team_rows)
    conn.commit()


if __name__ == "__main__":
    main()
