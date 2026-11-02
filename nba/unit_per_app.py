#!/usr/bin/env python3
"""
EARN THE RAISE PER APP (2026-11-02, owner 14:00 PT: "the unit is gonna be by app, not more the total ... proportionally create
exponential number for growing ... apps that have more slips ... smaller than the numbers that were there before, but bigger than for
the apps that have less slips ... what has been done is already done ... Underdog ... drop it to 2 again ... PrizePicks ... keep at 3").

Each app has its own unit and its own ladder - the 2026-11-01 ladder shape (rung n starts at up_x x n(n-1)/2, the same thresholds going
down, floor / max as stake_unit.auto) with up_x scaled to the app's slips a day (25 for the 14 slips a day of all apps together ->
PrizePicks 6 a day 10.5, Underdog 3 a day 5.5, Sleeper / Betr 2 a day 3.5, Fliff 1 a day 2).
Each app's PROFIT (dollars) = its seed (stake_unit.per_app.seed[app].profit, the starting point on 2026-11-02 - the owner's preset rung
or the app's own profit since 2026-10-24 on its ladder) + every played slip of that app from per_app.from on, units x that app's unit
in force on that slate. Slates before per_app.from keep the unit they were played at (the seed carries them).
Table nba_score.live_unit_app (game_date, app) - the unit for the NEXT slate after game_date; stake_unit.per_app.units holds the
latest (the Slips screen and the PrizePicks pick read it).
"""
import datetime as dt
import json

APPS = ("pp", "ud", "sleeper", "fliff", "betr")
UI_NAME = {"pp": "prizepicks", "ud": "underdog", "sleeper": "sleeper", "fliff": "fliff", "betr": "betr"}
PLAYED = {
    "pp": """SELECT game_date, coalesce(stake_weight, 1) * profit FROM nba_score.live_slips
             WHERE status IN ('graded','graded_void','graded_week2','graded_post') AND k < 100 AND profit IS NOT NULL""",
    "ud": "SELECT game_date, coalesce(stake, 1) * profit FROM nba_score.ud_live_slips WHERE status = 'live' AND profit IS NOT NULL",
    "sleeper": "SELECT game_date, coalesce(stake, 1) * profit FROM nba_score.sleeper_live_slips WHERE status = 'live' AND profit IS NOT NULL",
    "fliff": "SELECT game_date, coalesce(stake, 1) * profit FROM nba_score.fliff_live_slips WHERE status = 'live' AND profit IS NOT NULL",
    "betr": "SELECT game_date, coalesce(stake, 1) * profit FROM nba_score.betr_live_slips WHERE status = 'live' AND profit IS NOT NULL",
}
DDL = """CREATE TABLE IF NOT EXISTS nba_score.live_unit_app (game_date date, app text, profit double precision, unit_from double precision,
  unit_usd double precision, reason text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, app))"""


def cfg(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='stake_unit'").fetchone()
    su = (r[0] if isinstance(r[0], dict) else json.loads(r[0])) if r and r[0] else {}
    pa = su.get("per_app") or {}
    a = su.get("auto") or {}
    return pa, float(a.get("floor") or 1), float(a.get("max") or 15)


def rung(profit, up_x, floor_, max_):
    n = 1.0
    while n + 1 <= max_ + 1e-9 and profit >= up_x * n * (n + 1) / 2:
        n += 1
    return max(n, floor_)


def unit_for(conn, app, day):
    """the unit of `app` for slate `day`: the last live_unit_app row before it, else the seed unit; None when per-app is off"""
    pa, _f, _m = cfg(conn)
    if not pa.get("enabled"):
        return None
    try:
        r = conn.execute("SELECT unit_usd FROM nba_score.live_unit_app WHERE app=%s AND game_date < %s ORDER BY game_date DESC LIMIT 1",
                         (app, day)).fetchone()
    except Exception:  # noqa: BLE001 - table appears with the first update
        conn.rollback()
        r = None
    return float(r[0]) if r else float(pa["seed"][app]["unit"])


def update(conn, last):
    """walk every slate from per_app.from to `last` (idempotent: rebuilt in order) and record each app's unit for the next slate"""
    pa, floor_, max_ = cfg(conn)
    if not pa.get("enabled"):
        print("unit per app: off", flush=True)
        return {}
    conn.execute(DDL)
    f0 = dt.date.fromisoformat(str(pa["from"])[:10])
    conn.execute("DELETE FROM nba_score.live_unit_app WHERE game_date >= %s", (f0,))
    out = {}
    for app in APPS:
        up_x = float(pa["up_x"][app]); seed = pa["seed"][app]
        prof, u = float(seed["profit"]), float(seed["unit"])
        per_day = {}
        for d, x in conn.execute(f"SELECT game_date, sum(u) FROM ({PLAYED[app]}) p(game_date, u) WHERE game_date BETWEEN %s AND %s GROUP BY 1 ORDER BY 1",
                                 (f0, last)).fetchall():
            per_day[d] = float(x)
        for d in sorted(per_day):
            prof += per_day[d] * u
            n = rung(prof, up_x, floor_, max_)
            reason = (f"ladder raise: profit {prof:.2f} >= {up_x * (n - 1) * n / 2:g} (rung {n:g})" if n > u else
                      f"ladder step down: profit {prof:.2f} < {up_x * (u - 1) * u / 2:g} (rung {n:g})" if n < u else "hold")
            conn.execute("""INSERT INTO nba_score.live_unit_app (game_date, app, profit, unit_from, unit_usd, reason) VALUES (%s,%s,%s,%s,%s,%s)""",
                         (d, app, prof, u, n, reason))
            print(f"  {d} {app:7s}: {per_day[d]:+.2f}u x ${u:g} -> profit {prof:+.2f} | unit ${u:g} -> ${n:g} ({reason})", flush=True)
            u = n
        out[app] = {"unit": u, "profit": round(prof, 2), "next_raise_at": round(up_x * u * (u + 1) / 2, 2) if u + 1 <= max_ else None,
                    "step_down_below": round(up_x * (u - 1) * u / 2, 2) if u - 1 >= floor_ else None, "up_x": up_x}
    conn.execute("""UPDATE nba_config.classification_config SET config_json = jsonb_set(config_json::jsonb, '{per_app,units}', %s::jsonb)
                    WHERE config_key = 'stake_unit'""", (json.dumps({UI_NAME[a]: v for a, v in out.items()}),))
    for a, v in out.items():
        print(f"unit per app: {a:7s} NEXT SLATE ${v['unit']:g} (profit {v['profit']:+.2f}; raise at {v['next_raise_at']}, down below {v['step_down_below']})", flush=True)
    return out
