#!/usr/bin/env python3
"""
AVAILABILITY DELTA — what changed between the day-before report and the day-of report.

THE POINT OF P3. P2 builds the baseline overnight using the DAY-BEFORE injury report (due 5 PM local
the night before). By the 1:15 PM PT cutoff the DAY-OF report has landed (due 11am-1pm LOCAL to each
game's market, so Pacific clubs are last at 1:00 PM PT). What changed in between is the ONLY thing P3
has to react to - and it is a small set: a Questionable resolving, a late Out, an upgrade to Available.

WHY NOT JUST REBUILD. Measured: a full 8-pair rebuild ran 35+ minutes without finishing, because the
cost is REFITTING the recipe (tier tables, factor betas, dispersion) over three seasons at ~8 min per
pair. That fit uses ONLY games strictly before today, so it is IDENTICAL at 1 AM and 1:15 PM. Rebuilding
it is an hour spent recomputing a provably unchanged model. What genuinely changes is availability, and
that touches only the AFFECTED TEAMS.

WHAT IT WRITES. nba_score.availability_delta - one row per (player, prop, line, side) whose projection
moved, with the new HP. score_board_legs.py reads it and overrides those legs; every other leg keeps
P2's number. Absent table = no overrides, which is the correct behaviour on a day with no changes.

THE MINUTES LOGIC. When a rotation player flips to OUT, his minutes redistribute to teammates. The
allocator that does this already exists in the baseline recipe; here we apply its SHAPE - a proportional
reallocation weighted by each teammate's recent share - to produce an adjusted proj_min, then re-derive
the ladder rungs from the stored per-player distribution parameters rather than refitting anything.

Env: DATABASE_URL, DELTA_ASOF, DELTA_FROM (baseline), DELTA_TO (phase1), DELTA_SEASON
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PT = timezone(timedelta(hours=-8))
OUT_LIKE = {"OUT", "DOUBTFUL"}
IN_LIKE = {"AVAILABLE", "PROBABLE"}


def fetch(name, timeout=180):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}),
                                timeout=timeout) as r:
        return json.load(r)


def main():
    asof = os.environ.get("DELTA_ASOF") or datetime.now(PT).date().isoformat()
    season = os.environ.get("DELTA_SEASON", "2025-26")
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.availability_delta (
            game_date date, player_id text, prop text, line numeric, side text,
            old_hp numeric, new_hp numeric, reason text, built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS availability_delta_uidx
            ON nba_score.availability_delta (game_date, player_id, prop, line, side)""")
        cur.execute("DELETE FROM nba_score.availability_delta WHERE game_date = %s", (asof,))
    conn.commit()

    # --- the two report snapshots ---------------------------------------------------------------
    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    rows = []
    for sh in idx.get("shards", []):
        try:
            rows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
        except Exception:  # noqa: BLE001
            pass
    inj = pd.DataFrame(rows)
    if inj.empty:
        print("no injury rows at all - nothing to diff"); return
    inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
    inj["snapshot_ts"] = pd.to_datetime(inj["snapshot_ts"], errors="coerce", utc=True)
    day = inj[inj["game_date"] == datetime.fromisoformat(asof).date()].copy()
    if day.empty:
        print(f"no injury rows for {asof} - no delta"); return
    day["status_u"] = day["status"].astype(str).str.upper().str.strip()

    # ABSOLUTE TIMESTAMPS, NOT HOUR-OF-DAY. The first version computed h = hour(snapshot_ts) and took
    # `before` as h <= 9.0, which EXCLUDED the day-before report entirely - that report is filed ~5 PM
    # LOCAL the previous evening, so its hour-of-day is 17.0 and it failed an h<=9 test even though it
    # is exactly what P2 built from. The diff was then "today 9 AM vs today 1:15 PM" instead of
    # "what P2 saw vs what P3 sees", which is why 20 real status changes produced zero reallocations.
    gd = datetime.fromisoformat(asof).date()
    p2_build = datetime.combine(gd, datetime.min.time(), tzinfo=PT) + timedelta(hours=1)    # P2 ~01:00 PT
    p3_cut = datetime.combine(gd, datetime.min.time(), tzinfo=PT) + timedelta(hours=13, minutes=15)
    print(f"  P2 view: snapshots <= {p2_build:%Y-%m-%d %H:%M %Z}   "
          f"P3 view: <= {p3_cut:%Y-%m-%d %H:%M %Z}", flush=True)

    before = (day[day["snapshot_ts"] <= p2_build].sort_values("snapshot_ts")
              .drop_duplicates(subset=["player_name"], keep="last")
              .set_index("player_name")["status_u"].to_dict())
    after = (day[day["snapshot_ts"] <= p3_cut].sort_values("snapshot_ts")
             .drop_duplicates(subset=["player_name"], keep="last")
             .set_index("player_name")["status_u"].to_dict())
    changed = {p: (before.get(p), s) for p, s in after.items() if before.get(p) != s}
    # only changes that MOVE AVAILABILITY matter - Questionable -> Questionable is not a change
    material = {p: (a, b) for p, (a, b) in changed.items()
                if (a in OUT_LIKE) != (b in OUT_LIKE) or (b in OUT_LIKE and a not in OUT_LIKE)}
    print(f"{asof}: {len(before)} players in the overnight view, {len(after)} at the cutoff", flush=True)
    print(f"  status changes: {len(changed)}   MATERIAL (availability moved): {len(material)}", flush=True)
    for p, (a, b) in list(material.items())[:12]:
        print(f"    {p:<28} {a} -> {b}", flush=True)
    if not material:
        print("  no material availability change - P2's baseline stands unmodified for every leg")
        return

    # --- map to player_id and find their teams ---------------------------------------------------
    nm = pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn)
    import re
    def norm(s):
        s = str(s or "")
        if "," in s:
            last, _, first = s.partition(",")
            s = f"{first.strip()} {last.strip()}"
        return re.sub(r"[^A-Za-z]", "", s).lower()
    name_to_id = dict(zip(nm["norm_name"], nm["player_id"].astype(str)))
    now_out = {name_to_id[norm(p)] for p, (a, b) in material.items()
               if b in OUT_LIKE and norm(p) in name_to_id}
    now_in = {name_to_id[norm(p)] for p, (a, b) in material.items()
              if b in IN_LIKE and norm(p) in name_to_id}
    print(f"  newly OUT: {len(now_out)}   newly IN: {len(now_in)}", flush=True)
    if not now_out and not now_in:
        print("  changes did not resolve to known player_ids - no delta written"); return

    # --- affected teams, from today's slate ------------------------------------------------------
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    recent = logs[logs["GAME_DATE"] < datetime.fromisoformat(asof).date()]
    last_team = (recent.sort_values("GAME_DATE").drop_duplicates("PLAYER_ID", keep="last")
                 .set_index("PLAYER_ID")["TEAM"].to_dict())
    teams = {last_team.get(p) for p in (now_out | now_in)} - {None}
    print(f"  affected teams: {sorted(teams)}", flush=True)

    # --- reallocate minutes within each affected team --------------------------------------------
    # Proportional to each remaining player's recent share - the shape the baseline allocator uses.
    mpg = (recent[recent["GAME_DATE"] >= datetime.fromisoformat(asof).date() - timedelta(days=30)]
           .groupby("PLAYER_ID")["MIN"].mean().to_dict())
    lad = pd.read_sql("""SELECT player_id, prop, line, ladder_offset, p_more, p_less, proj_min, anchor
                         FROM nba_score.baseline_history
                         WHERE game_date = %s AND season = %s""", conn, params=(asof, season))
    if lad.empty:
        print(f"  no baseline for {asof} - P2 must run first"); return
    lad["player_id"] = lad["player_id"].astype(str)
    lad["team"] = lad["player_id"].map(last_team)
    aff = lad[lad["team"].isin(teams)].copy()
    print(f"  legs on affected teams: {len(aff):,} of {len(lad):,}", flush=True)
    # WHY A ZERO CAN HAPPEN, made visible. If the newly-OUT players have no ladder rows, there are no
    # minutes to redistribute FROM and every team trips the net<1.0 skip - which looks identical to
    # "nothing changed". Print the intersection so the two cases are never confused again.
    in_ladder = set(lad["player_id"])
    print(f"  newly-OUT players WITH ladder rows: {len(now_out & in_ladder)} of {len(now_out)}", flush=True)
    if now_out and not (now_out & in_ladder):
        print("  -> none of the newly-OUT players have ladder rows. They were already excluded from "
              "the baseline (known out overnight), so there is nothing to reallocate.", flush=True)

    out_rows = []

    def mins(pid):
        """recent minutes, NaN-safe. `float(x or 0)` is a TRAP here: NaN is TRUTHY, so `NaN or 0`
        returns NaN, not 0 - one player with NaN minutes poisoned wsum, then share, gain, ratio and
        every resulting probability. The first reallocation run wrote 6,748 NaN overrides this way."""
        v = mpg.get(pid)
        try:
            v = float(v)
        except (TypeError, ValueError):
            return 0.0
        return 0.0 if v != v else v          # v != v is True only for NaN

    for team, g in aff.groupby("team"):
        pids = set(g["player_id"])
        freed = sum(mins(p) for p in (now_out & pids))
        added = sum(mins(p) for p in (now_in & pids))
        net = freed - added
        if abs(net) < 1.0:
            continue
        stay = [p for p in pids if p not in now_out]
        wsum = sum(mins(p) for p in stay) or 1.0
        for r in g.itertuples(index=False):
            if r.player_id in now_out:
                # he is OUT: every one of his legs goes to ~0
                out_rows.append((asof, r.player_id, r.prop, float(r.line), "Over",
                                 float(r.p_more), 0.001, "now_out"))
                out_rows.append((asof, r.player_id, r.prop, float(r.line), "Under",
                                 float(r.p_less), 0.999, "now_out"))
                continue
            share = mins(r.player_id) / wsum
            gain = net * share
            base_min = float(r.proj_min or 0)
            if base_min <= 0 or abs(gain) < 0.5 or gain != gain:
                continue
            # scale the projection by the minutes ratio, then shift the rung in log-odds by the
            # implied change in the mean. A minutes-proportional scale is the allocator's own shape.
            ratio = (base_min + gain) / base_min
            for side, p in (("Over", float(r.p_more)), ("Under", float(r.p_less))):
                p = min(max(p, 1e-4), 1 - 1e-4)
                lo = np.log(p / (1 - p))
                # more minutes -> higher mean -> Over more likely; sensitivity from the rung distance
                sens = 1.0 + 0.15 * abs(int(r.ladder_offset or 0))
                shift = (ratio - 1.0) * sens * (1.0 if side == "Over" else -1.0)
                out_rows.append((asof, r.player_id, r.prop, float(r.line), side,
                                 p, float(1 / (1 + np.exp(-(lo + shift)))), "reallocated"))

    if not out_rows:
        print("  no legs moved materially - nothing written"); return
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.availability_delta
            (game_date, player_id, prop, line, side, old_hp, new_hp, reason)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (game_date, player_id, prop, line, side) DO UPDATE
              SET new_hp = EXCLUDED.new_hp, reason = EXCLUDED.reason""", out_rows)
    conn.commit()
    n_out = sum(1 for r in out_rows if r[7] == "now_out")
    print(f"\nwrote {len(out_rows):,} overrides ({n_out:,} now-OUT, "
          f"{len(out_rows)-n_out:,} reallocated teammates)", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
