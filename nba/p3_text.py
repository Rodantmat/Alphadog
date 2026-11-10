"""Texts Rodo (end of P3) and his friend (end of the friend pick) through Google Voice.
Google Voice turns an email reply to its per-conversation address (<voice>.<contact>.<token>@txt.voice.google.com) into an SMS
sent from Rodo's Voice number. We send that email over Gmail SMTP (app password kept in nba_config.external_credentials,
key 'gmail_app_password'; sender 'gmail_user'). Reply addresses live in classification_config 'text_alerts'
({"cell_addr": "...", "friend_addr": "..."}). One text per person per day (nba_control.text_alert_log).
MODE=p3     : READY / ALERT text to Rodo's cell
MODE=friend : link text to the friend, only if the friend snapshot for the day exists
Never fails the pipeline: every problem is printed and exits 0."""
import os, sys, smtplib, ssl
from email.mime.text import MIMEText
import psycopg

MODE = os.environ.get("MODE", "p3")
RUN_ID = os.environ.get("RUN_ID", "")
RESULT = os.environ.get("RESULT", "")

APP_NAME = {"pp": "PrizePicks", "ud": "Underdog", "sleeper": "Sleeper", "betr": "Betr", "fliff": "Fliff"}
APP_ORDER = ("pp", "ud", "sleeper", "betr", "fliff")
FRIEND_UNIT = 5.0           # the friend plays a flat $5 a slip
JESSI_UPX = {"pp": 10.5, "sleeper": 7.0, "fliff": 7.0}    # same ladder as the Jessi page (nba/alphadog-v2-nba-jessi.js unitFor)
PAGE_KEY = {"prizepicks": "pp", "underdog": "ud", "sleeper": "sleeper", "betr": "betr", "fliff": "fliff"}


def money(v):
    r = int(round(v))
    return ("+$%d" % r) if r > 0 else ("-$%d" % -r) if r < 0 else "$0"


def unit_for(acc, upx):
    n = 1
    while upx * (n + 1) * n / 2 <= acc + 1e-9:
        n += 1
    return n


def results_block(c, who, today):
    """'Yesterday Results' per app + Total, then a blank line and the season's Accumulated (all apps), in real dollars.
    who: rodo | jessi | friend.  Yesterday = the latest slate before `today` that has graded results for that person. Never raises."""
    try:
        per = {}      # app -> (yesterday dollars, season dollars)
        if who == "rodo":
            rows = c.execute("SELECT game_date, app, profit FROM nba_score.live_unit_app ORDER BY app, game_date").fetchall()
            ydays = sorted({r[0] for r in rows if str(r[0]) < today})
            if not ydays:
                return ""
            y = ydays[-1]
            for app in APP_ORDER:
                mine = [r for r in rows if r[1] == app and str(r[0]) <= str(y)]
                if not mine:
                    continue
                cum = mine[-1][2]
                prev = mine[-2][2] if len(mine) > 1 else 0.0
                per[app] = (cum - prev if mine[-1][0] == y else None, cum)
        else:
            sch = "nba_jessi" if who == "jessi" else "nba_friend"
            rows = c.execute(f"SELECT app, game_date, sum(profit)::float FROM {sch}.slips WHERE status='graded' AND game_date < %s::date "
                             f"AND game_date >= (SELECT season_start FROM {sch}.season) GROUP BY app, game_date ORDER BY game_date", (today,)).fetchall()
            if not rows:
                return ""
            y = max(r[1] for r in rows)
            for app_name in ("prizepicks", "underdog", "sleeper", "betr", "fliff"):
                a = PAGE_KEY[app_name]
                mine = [r for r in rows if r[0] == app_name]
                if not mine:
                    continue
                acc = 0.0; ydol = None
                for _a, d, p in mine:
                    u = FRIEND_UNIT if who == "friend" else unit_for(acc, JESSI_UPX.get(a, 7.0))
                    acc += u * p
                    if d == y:
                        ydol = u * p
                per[a] = (ydol, acc)
        lines = ["Yesterday Results:"]
        tot = 0
        for app in APP_ORDER:
            if app in per and per[app][0] is not None:
                r = int(round(per[app][0])); tot += r
                lines.append(f"{APP_NAME[app]}: {money(r)}")
        if len(lines) == 1:
            return ""
        lines.append(f"Total: {money(tot)}")
        acc_all = sum(v[1] for v in per.values())
        # blank lines are written as a line holding one non-breaking space: the Google Voice email bridge drops everything after a truly empty line (2026-11-09 test)
        return "\n\u00a0\n" + "\n".join(lines) + "\n\u00a0\nAccumulated: " + money(acc_all)
    except Exception as e:  # noqa: BLE001
        print("results block failed:", type(e).__name__, e)
        return ""


def main():
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS nba_control.text_alert_log (
                       day date NOT NULL, who text NOT NULL, body text, sent_at timestamptz DEFAULT now(), PRIMARY KEY (day, who))""")
        cred = dict(c.execute("SELECT credential_key, credential_value_encrypted FROM nba_config.external_credentials "
                              "WHERE credential_key IN ('gmail_app_password','gmail_user')").fetchall())
        cfg = c.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='text_alerts'").fetchone()
        cfg = (cfg[0] if cfg else None) or {}
        pw = cred.get("gmail_app_password")
        user = cred.get("gmail_user") or "rodolfoaamattos@gmail.com"
        if not pw:
            print("text alert: no gmail_app_password in the credential store - skipped")
            return
        if MODE == "test":
            who, addr, body, day = "test", cfg.get("cell_addr"), "AlphaDog test: the pipeline can text you", None
        elif MODE == "p3":
            row = c.execute("SELECT run_key, status, note FROM nba_control.pipeline_runs WHERE pipeline='P3' AND github_run_id=%s "
                            "ORDER BY claimed_at DESC LIMIT 1", (RUN_ID,)).fetchone()
            if not row:
                who, addr, body, day = "rodo", cfg.get("cell_addr"), "AlphaDog ALERT: P3 status unknown", None
            else:
                day = str(row[0])[:10]
                n = 0
                for t in ("live_slips", "ud_live_slips", "sleeper_live_slips", "betr_live_slips", "fliff_live_slips"):
                    try:
                        n += c.execute("SELECT count(*) FROM nba_score.%s WHERE game_date=%%s" % t, (day,)).fetchone()[0]
                    except Exception as e:
                        print("count", t, e)
                if row[1] != "success" or RESULT not in ("success", ""):
                    body = "AlphaDog ALERT: P3 failed, slips not ready"
                elif n == 0:
                    body = "AlphaDog ALERT: P3 done but no slips"
                else:
                    if os.environ.get("DEFER_READY") == "1":
                        print("p3 text: ready text deferred to the end of the friend run (Fliff mirror + pairings are written there)")
                        return
                    body = "AlphaDog Slips are ready \U0001F525" + results_block(c, "rodo", day)
                who, addr = "rodo", cfg.get("cell_addr")
        elif MODE == "owner":
            # 2026-11-08: sent AFTER the friend run, so the Fliff mirror and the pairings exist when the text lands
            day = str(c.execute("SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date").fetchone()[0])
            n = 0
            for t in ("live_slips", "ud_live_slips", "sleeper_live_slips", "betr_live_slips", "fliff_live_slips"):
                try:
                    n += c.execute("SELECT count(*) FROM nba_score.%s WHERE game_date=%%s" % t, (day,)).fetchone()[0]
                except Exception as e:
                    print("count", t, e)
            if os.environ.get("RUN_RESULT") not in ("success", None, ""):
                print("owner text: friend run result", os.environ.get("RUN_RESULT"), "- ready text still sent if slips exist")
            if n == 0:
                print("owner text: no slips today - skipped")
                return
            who, addr, body = "rodo", cfg.get("cell_addr"), "AlphaDog Slips are ready \U0001F525" + results_block(c, "rodo", day)
        elif MODE == "preview":
            # TEST ONLY: all three people's texts as they would arrive, sent to the OWNER's cell only (RES_TODAY = the pretend today)
            t = os.environ.get("RES_TODAY") or str(c.execute("SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date").fetchone()[0])
            if os.environ.get("VARIANTS"):
                # 2026-11-09: the first preview arrived as ONE line (everything after the first line was dropped) - try ways of keeping the lines
                full = "AlphaDog Slips are ready \U0001F525" + results_block(c, "rodo", t)
                variants = {"A single newlines only": full.replace("\n\n", "\n"),
                            "B blank line = nbsp": full.replace("\n\n", "\n\u00a0\n"),
                            "C all on one line with bullets": full.replace("\n\n", " | ").replace("\n", " | ")}
                for nm, b in variants.items():
                    msg = MIMEText(b, "plain", "utf-8"); msg["From"] = user; msg["To"] = cfg.get("cell_addr"); msg["Subject"] = "Re: AlphaDog"
                    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as sm:
                        sm.login(user, pw); sm.sendmail(user, [cfg.get("cell_addr")], msg.as_string())
                    print("variant sent:", nm, "|", b.replace("\n", " / "))
                return
            for w in (("rodo",) if os.environ.get("OWNER_ONLY") else ("rodo", "jessi", "friend")):
                body = ("" if w == "rodo" else f"[preview of {w}'s text]\n") + "AlphaDog Slips are ready \U0001F525" + results_block(c, w, t)
                msg = MIMEText(body, "plain", "utf-8"); msg["From"] = user; msg["To"] = cfg.get("cell_addr"); msg["Subject"] = "Re: AlphaDog"
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as sm:
                    sm.login(user, pw); sm.sendmail(user, [cfg.get("cell_addr")], msg.as_string())
                print("preview sent:", w, "|", body.replace("\n", " / "))
            return
        elif MODE == "jessi":
            day = str(c.execute("SELECT max(game_date) FROM nba_jessi.snapshot").fetchone()[0])
            ok = c.execute("SELECT count(*) FROM nba_jessi.snapshot WHERE game_date=%s AND game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date", (day,)).fetchone()[0]
            if not ok:
                print("jessi text: no snapshot for today - skipped")
                return
            who, addr, body = "jessi", cfg.get("jessi_addr"), "AlphaDog Slips are ready \U0001F525" + results_block(c, "jessi", day)
        else:
            day = os.environ.get("DAY") or str(c.execute("SELECT max(game_date) FROM nba_friend.snapshot").fetchone()[0])
            ok = c.execute("SELECT count(*) FROM nba_friend.snapshot WHERE game_date=%s AND game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date", (day,)).fetchone()[0]
            if not ok:
                print("friend text: no snapshot for today - skipped")
                return
            who, addr, body = "friend", cfg.get("friend_addr"), "AlphaDog Slips are ready \U0001F525" + results_block(c, "friend", day)
        if not addr:
            print("text alert: no reply address for", who, "- skipped")
            return
        if day:
            if c.execute("SELECT 1 FROM nba_control.text_alert_log WHERE day=%s AND who=%s", (day, who)).fetchone():
                print("text alert: already sent today to", who)
                return
        msg = MIMEText(body, "plain", "utf-8")
        msg["From"] = user
        msg["To"] = addr
        msg["Subject"] = "Re: AlphaDog"
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
            s.login(user, pw)
            s.sendmail(user, [addr], msg.as_string())
        c.execute("INSERT INTO nba_control.text_alert_log (day, who, body) VALUES (COALESCE(%s::date, current_date), %s, %s) "
                  "ON CONFLICT DO NOTHING", (day, who, body))
        print("text alert sent to", who, "-", body)


try:
    main()
except Exception as e:
    print("text alert FAILED:", type(e).__name__, e)
sys.exit(0)
