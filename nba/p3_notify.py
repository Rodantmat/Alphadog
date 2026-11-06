"""Phone alert when P3 (and so slip generation) finishes. Sends ONE push via ntfy.sh to NTFY_TOPIC.
READY   : P3 succeeded and slips exist -> counts per app
ALERT   : P3 failed / cancelled / no slips for the slate
TEST=1  : sends a test push, touches nothing else.
Never fails the pipeline (the workflow step is continue-on-error)."""
import os, sys, urllib.request

TOPIC = os.environ["NTFY_TOPIC"]


def push(title, body, prio="default", tags="bell"):
    req = urllib.request.Request(
        "https://ntfy.sh/" + TOPIC, data=body.encode("utf-8"),
        headers={"Title": title, "Priority": prio, "Tags": tags}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        print("ntfy status", r.status)


if os.environ.get("TEST") == "1":
    push("AlphaDog test alert", "If you see this, P3 alerts reach your phone.", "high", "white_check_mark")
    sys.exit(0)

import psycopg

run_id = os.environ.get("RUN_ID", "")
result = os.environ.get("RESULT", "")
with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    row = c.execute("SELECT run_key, status, note, finished_at FROM nba_control.pipeline_runs "
                    "WHERE pipeline='P3' AND github_run_id=%s ORDER BY claimed_at DESC LIMIT 1", (run_id,)).fetchone()
    if not row:
        push("AlphaDog ALERT: P3 status unknown", "P3 finished with result '%s' but its run row was not found." % result, "urgent", "warning")
        sys.exit(0)
    run_key, status, note, fin = row
    day = str(run_key)[:10]
    counts = {}
    for name, tbl in (("PrizePicks", "live_slips"), ("Underdog", "ud_live_slips"), ("Sleeper", "sleeper_live_slips"),
                      ("Betr", "betr_live_slips"), ("Fliff", "fliff_live_slips")):
        try:
            counts[name] = c.execute("SELECT count(*) FROM nba_score.%s WHERE game_date=%%s" % tbl, (day,)).fetchone()[0]
        except Exception as e:
            counts[name] = -1
            c.rollback()
note = (note or "").strip()
lines = ["%s: %s" % (k, "?" if v < 0 else v) for k, v in counts.items()]
total = sum(v for v in counts.values() if v > 0)
if status != "success" or result not in ("success", ""):
    push("AlphaDog ALERT: P3 FAILED (%s)" % day, "P3 result: %s / %s\n%s" % (result, status, note), "urgent", "rotating_light")
elif total == 0:
    push("AlphaDog ALERT: P3 done but NO SLIPS (%s)" % day, "P3 finished but no slips exist for the slate.\n%s" % note, "urgent", "warning")
else:
    body = "Slips ready to place - %s\n" % day + "\n".join(lines)
    if note:
        body += "\nWarning:" + note
    push("AlphaDog READY: P3 done, slips ready (%s)" % day, body, "high", "white_check_mark")
