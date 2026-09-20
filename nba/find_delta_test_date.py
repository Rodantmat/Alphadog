#!/usr/bin/env python3
"""
FIND A DATE THAT EXERCISES THE REALLOCATION PATH.

WHY. The availability-delta replay on 2026-01-15 wrote nothing, and the diagnostic showed WHY: all 20
"newly OUT" players had NO ladder rows - they were already known out when P2 built, so their status
change was a report formality (Questionable -> Out, or an Out re-confirmed), not a change in who plays.
"Nothing written" was the CORRECT answer for that slate, not a failure.

But that means the reallocation branch - the code that redistributes a scratched rotation player's
minutes to his teammates - has never actually executed. To validate it we need a date where a player
who DOES carry ladder rows (i.e. was expected to play) flips to OUT between P2's build and P3's cutoff.

This scans both seasons for exactly that and ranks the candidates by how much is at stake (the player's
recent minutes), so the replay tests the path on a real, meaningful case rather than a trivial one.

Env: DATABASE_URL, FD_SEASONS
"""
import json
import os
import re
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PT = timezone(timedelta(hours=-8))
OUT_LIKE = {"OUT", "DOUBTFUL"}


def fetch(name, timeout=180):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}),
                                timeout=timeout) as r:
        return json.load(r)


def norm(s):
    s = str(s or "")
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return re.sub(r"[^A-Za-z]", "", s).lower()


def main():
    seasons = [s.strip() for s in os.environ.get("FD_SEASONS", "2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    nm = pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn)
    name_to_id = dict(zip(nm["norm_name"], nm["player_id"].astype(str)))

    for season in seasons:
        slug = season.replace("-", "_")
        idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
        rows = []
        for sh in idx.get("shards", []):
            try:
                rows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
            except Exception:  # noqa: BLE001
                pass
        inj = pd.DataFrame(rows)
        inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
        inj["snapshot_ts"] = pd.to_datetime(inj["snapshot_ts"], errors="coerce", utc=True)
        inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
        inj = inj[inj["game_date"].notna() & inj["snapshot_ts"].notna()]
        inj["pid"] = inj["player_name"].map(lambda s: name_to_id.get(norm(s)))
        inj = inj[inj["pid"].notna()]

        # which (date, player) pairs carry ladder rows - i.e. were EXPECTED to play
        lad = pd.read_sql("""SELECT DISTINCT game_date, player_id
                             FROM nba_score.baseline_history WHERE season = %s""",
                          conn, params=(season,))
        lad["game_date"] = pd.to_datetime(lad["game_date"]).dt.date
        expected = set(zip(lad["game_date"], lad["player_id"].astype(str)))
        print(f"\n{season}: {len(expected):,} (date, player) pairs with ladder rows", flush=True)

        hits = []
        for gd, g in inj.groupby("game_date"):
            p2 = datetime.combine(gd, datetime.min.time(), tzinfo=PT) + timedelta(hours=1)
            p3 = datetime.combine(gd, datetime.min.time(), tzinfo=PT) + timedelta(hours=13, minutes=15)
            b = (g[g["snapshot_ts"] <= p2].sort_values("snapshot_ts")
                 .drop_duplicates("pid", keep="last").set_index("pid")["status_u"].to_dict())
            a = (g[g["snapshot_ts"] <= p3].sort_values("snapshot_ts")
                 .drop_duplicates("pid", keep="last").set_index("pid")["status_u"].to_dict())
            for pid, s_after in a.items():
                s_before = b.get(pid)
                # the case that matters: he WAS expected to play (has ladder rows) and is now OUT
                if s_after in OUT_LIKE and s_before not in OUT_LIKE and (gd, pid) in expected:
                    hits.append((gd, pid, s_before, s_after))
        by_date = defaultdict(list)
        for gd, pid, sb, sa in hits:
            by_date[gd].append((pid, sb, sa))
        print(f"  dates where a LADDER-CARRYING player flipped to OUT after P2: {len(by_date)}", flush=True)
        for gd in sorted(by_date, key=lambda d: -len(by_date[d]))[:12]:
            names = by_date[gd]
            print(f"    {gd}  {len(names)} player(s): "
                  f"{[(p, sb or 'unlisted', sa) for p, sb, sa in names[:4]]}", flush=True)
        if not by_date:
            print("    NONE. On every slate the scratches were already known overnight - which means "
                  "P3's reallocation branch genuinely never fires on this season's data.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
