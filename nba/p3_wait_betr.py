#!/usr/bin/env python3
"""P3: BOUNDED WAIT FOR THE BETR WINDOW BOARD (2026-10-19, owner: "Fliff and Betr ... ready and wired as the other apps ... following
every single step on the sequence").

WHY. Betr's board is harvested by its own workflow (Chrome + the seeded session), dispatched by P3 at the window and landing a few
minutes later; the harvest archives itself into nba_market.board_snapshots with label 'window'. P3 scored the board BEFORE that
archive existed, so Betr's decision-moment legs were never in nba_score.board_scored (and the scorer drops Betr's earlier 'routine' /
'probe' rows once any 'window' row exists). This step sits right before the scorer and waits, bounded, for the Betr window rows.

STOPS EARLY (never waits for nothing):
  * the Betr window rows for the slate are in the archive                      -> proceed
  * the dispatched harvest run has COMPLETED without archiving (Betr has not opened NBA, a session failure ...) -> proceed
  * the tunable cap (classification_config['p3_betr_wait'].max_wait_s) or the pick deadline (first tip - stop_before_tip_min) -> proceed
Never fails the run: the step is soft, exits 0 on every path, prints one verdict line. Reads only; writes nothing.
Env: DATABASE_URL, P3_ASOF, GITHUB_TOKEN (read of the harvest run's status), GITHUB_REPOSITORY, BETR_DISPATCHED ('success' or not)."""
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg

ASOF = os.environ["P3_ASOF"]
T0 = time.time()
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='p3_betr_wait'").fetchone()
cfg = (row[0] if row else None) or {}
if isinstance(cfg, str):
    cfg = json.loads(cfg)
if not cfg.get("enabled", True):
    print("BETR_WAIT|off (classification_config['p3_betr_wait'].enabled = false)")
    raise SystemExit(0)
if os.environ.get("BETR_DISPATCHED", "") != "success":
    print("BETR_WAIT|skipped - the harvest was not dispatched by this run (soft_betr outcome: %s)" % (os.environ.get("BETR_DISPATCHED") or "n/a"))
    raise SystemExit(0)
max_wait = float(cfg.get("max_wait_s", 360))
poll = max(5.0, float(cfg.get("poll_s", 15)))
stop_min = float(cfg.get("stop_before_tip_min", 14))
tip = conn.execute("SELECT min(game_datetime_utc) FROM nba_calendar.slate_games WHERE game_date=%s", (ASOF,)).fetchone()[0]
deadline = T0 + max_wait
if tip is not None:
    if tip.tzinfo is None:
        tip = tip.replace(tzinfo=timezone.utc)
    secs_to_deadline = (tip - timedelta(minutes=stop_min) - datetime.now(timezone.utc)).total_seconds()
    deadline = min(deadline, T0 + max(0.0, secs_to_deadline))
repo, tok = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")


def betr_rows():
    # window rows for the slate fetched within the last 90 minutes (a window row from another run cannot be older than this P3)
    return conn.execute("""SELECT count(*) FROM nba_market.board_snapshots WHERE bookmaker='betr' AND snapshot_label='window'
                           AND game_date=%s AND fetched_at > now() - interval '90 minutes'""", (ASOF,)).fetchone()[0]


def harvest_done():
    """True when the newest dispatched Betr harvest run is completed (it either archived already - caught above - or never will)."""
    if not (repo and tok):
        return None
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}/actions/workflows/betr-cloud-harvest.yml/runs?event=workflow_dispatch&per_page=1",
                                     headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            runs = json.loads(r.read().decode()).get("workflow_runs") or []
        if not runs:
            return None
        created = datetime.fromisoformat(runs[0]["created_at"].replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - created).total_seconds() > 3600:
            return None          # not this P3's dispatch
        return runs[0]["status"] == "completed", runs[0].get("conclusion")
    except Exception as exc:   # noqa: BLE001 - status is advisory only; never print request detail
        return None


n = betr_rows()
verdict = None
while n == 0 and time.time() < deadline:
    time.sleep(poll)
    n = betr_rows()
    if n:
        break
    hd = harvest_done()
    if hd and hd[0]:
        n = betr_rows()
        verdict = f"harvest run completed ({hd[1]}) without Betr window rows"
        break
waited = int(time.time() - T0)
if n:
    print(f"BETR_WAIT|ok - {n} Betr window rows for {ASOF} archived after {waited}s; the scorer will see them")
else:
    print(f"::warning::BETR_WAIT|no Betr window rows for {ASOF} after {waited}s ({verdict or 'cap / pick deadline reached'}) - Betr is scored from "
          f"whatever the archive already holds (its routine / probe rows are dropped once a window board exists)")
