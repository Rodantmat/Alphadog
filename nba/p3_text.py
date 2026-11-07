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
                    body = "AlphaDog Slips are ready \U0001F525"
                who, addr = "rodo", cfg.get("cell_addr")
        elif MODE == "jessi":
            day = str(c.execute("SELECT max(game_date) FROM nba_jessi.snapshot").fetchone()[0])
            ok = c.execute("SELECT count(*) FROM nba_jessi.snapshot WHERE game_date=%s AND game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date", (day,)).fetchone()[0]
            if not ok:
                print("jessi text: no snapshot for today - skipped")
                return
            who, addr, body = "jessi", cfg.get("jessi_addr"), "AlphaDog Slips are ready \U0001F525"
        else:
            day = os.environ.get("DAY") or str(c.execute("SELECT max(game_date) FROM nba_friend.snapshot").fetchone()[0])
            ok = c.execute("SELECT count(*) FROM nba_friend.snapshot WHERE game_date=%s AND game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date", (day,)).fetchone()[0]
            if not ok:
                print("friend text: no snapshot for today - skipped")
                return
            who, addr, body = "friend", cfg.get("friend_addr"), "AlphaDog Slips are ready \U0001F525"
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
