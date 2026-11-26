#!/usr/bin/env python3
"""
THE FINAL SET, LIVE (owner 2026-11-26: build the final set - main + fallback per app, slots UD 6 / Fliff 6 / PP 6 / Sleeper 5 / Betr 4 - as the live system, certify, switch, retire the old strategies).
Built on final_live.py (the live twin of the research pipeline: same legs, same features, same month models, same strategy materialization, same merge).

One app a run (FL_APP = underdog | prizepicks | sleeper | fliff | betr). Env: DATABASE_URL, FL_DATE (default today PT), FL_DRY=1 (print, write nothing).
GATE: nba_config.classification_config['final_live'] {enabled, apps}. Off -> nothing happens, the old engine (honest_live_slip_engine.py) runs as before; on for an app -> the old engine skips
that app and this one writes the slips (strategy codes N + app letter + number: NU1.., NF1.., NP1.., NS1.., NB1..). Nothing is deleted: every other strategy of the day on that app is set to
shadow (recorded and graded as paper, never PLAY).
Pulled legs (owner's final-set policy): sub from the bank (2 spares each) on PrizePicks, Sleeper and Underdog F4 / F6; shrink on Fliff and Underdog F5 (rule per code in LEG_GONE).
"""
import datetime as dt
import json
import math
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PT = ZoneInfo("America/Los_Angeles")
APPS = ("underdog", "prizepicks", "sleeper", "fliff", "betr")
ORDER_APP = {"betr": "prizepicks"}                          # Betr's slips are ordered by the PrizePicks / Underdog lists of the day (stored by those runs)
_app = (os.environ.get("FL_APP") or "underdog").lower()
os.environ["FL_APP"] = ORDER_APP.get(_app, _app) if _app == "betr" else _app
APP_RUN = _app

import numpy as np                                            # noqa: E402
import pandas as pd                                           # noqa: E402
import psycopg                                                # noqa: E402

SPREAD_SKIP = {"prizepicks": 8.0, "sleeper": 8.0, "fliff": 8.0}     # standing owner rules (2026-11-23 / 24): games average spread over 8 -> skip the slip
REST_SKIP = {"prizepicks": 2.8, "underdog": 3.6}                      # players average this many days of rest or more -> skip the slip
# leg-gone rule per strategy: the owner's final-set policy (shrink on Fliff and Underdog F5, sub elsewhere)
SHRINK_APPS = {"fliff"}
BANK_DEPTH = 2


def log(m):
    print(m, flush=True)


def gate(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'final_live'").fetchone()
    return (r[0] if isinstance(r[0], dict) else json.loads(r[0])) if r else {}


def leg_gone_rule(app, sg):
    if app in SHRINK_APPS or (app == "underdog" and sg["k"] == 5):
        return "shrink"
    return "sub"


def name_of(sg, j):
    """strategy / composition name of the j-th slip of a strategy on the day; starts with the code so the pages' rule lookup (^(?:H_)?([A-Z]+\\d+)) finds it"""
    return f"H_{sg['code']}_{sg['k']}{sg['st'][0]}" + (f"_{j + 1}" if j else "")


def started_games(conn, day):
    return {r[0] for r in conn.execute("SELECT game_id::text FROM nba_calendar.slate_games WHERE game_date = %s AND game_datetime_utc <= now()", (day,)).fetchall()}


def live_frame(conn, day, FL):
    """the day's frame: production numbers (board_scored), the month models fitted on everything before the slate; started games removed"""
    import research_leg_model_h as LM
    gd = str(day)
    legs = FL.set_live(conn, gd, "prod")
    if legs is None:
        return None, None
    df, X = LM.load(conn)
    P = FL.predict(df, X, FL.NEED.get(FL.APP, set())); P.pop("weights", None)
    d = FL.build_frame(conn, df, X, P)
    st = set() if os.environ.get("FL_NOSTART") == "1" else started_games(conn, day)       # FL_NOSTART=1: a replay of a past slate
    n0 = len(d)
    d = d[~d["gid"].isin(st)].reset_index(drop=True)
    log(f"FINAL|{FL.APP} {gd}: {n0} legs, {n0 - len(d)} in games that have started, {len(d)} left")
    ev = {(str(r.player_id), r.prop, str(r.side).lower().startswith("u"), round(float(r.line), 3)): r.event_id for r in legs.itertuples()}
    return d, ev


def rule_filters(conn, day, d, app):
    """the standing rest / spread rules as a slip filter (a skipped slip does not take a slot; the next strategy's slip may)"""
    import honest_live_slip_engine as HL
    spreads = HL.game_spreads(conn, day) if app in SPREAD_SKIP else {}
    home = {r[0]: r[1] for r in conn.execute("SELECT game_id::text, home_team_id::text FROM nba_calendar.slate_games WHERE game_date = %s", (day,)).fetchall()}
    rest = {}
    if app in REST_SKIP:
        for r in d[["player_id", "rest"]].itertuples():
            if r.rest == r.rest:
                rest[r.player_id] = min(float(r.rest), 7.0)

    def skip(rows):
        if app in REST_SKIP:
            v = [rest[r["player_id"]] for r in rows if r["player_id"] in rest]
            if v and sum(v) / len(v) >= REST_SKIP[app]:
                return f"its players average {sum(v) / len(v):.1f} days of rest (limit {REST_SKIP[app]:g})"
        if app in SPREAD_SKIP and spreads:
            v = [spreads[home[r["gid"]]] for r in rows if home.get(r["gid"]) in spreads]
            if v and sum(v) / len(v) > SPREAD_SKIP[app]:
                return f"its games average a {sum(v) / len(v):.1f}-point spread (limit {SPREAD_SKIP[app]:g})"
        return None
    return skip


def leg_dicts(conn, day, app, d, ev):
    """{frame row -> the app's leg dict} the writers need"""
    out = {}
    if app in ("sleeper", "fliff"):
        import roi_app_live_slip_engine as RA
        board = {}
        for l in RA.load_legs(conn, day, app):
            board[(str(l["player_id"]), l["prop"], str(l["side"]).lower().startswith("u"), round(float(l["line"]), 3), (l.get("kind") or "main") != "main")] = l
        for i, r in d.iterrows():
            l = board.get((r["player_id"], r["prop"], bool(r["under"]), round(float(r["line"]), 3), bool(r["alt"])))
            if l is not None:
                out[i] = dict(l)
        return out
    for i, r in d.iterrows():
        nm = r.get("player")
        out[i] = {"player": nm if isinstance(nm, str) else str(r["player_id"]), "player_id": r["player_id"], "prop": r["prop"], "line": float(r["line"]),
                  "side": "Under" if r["under"] else "Over", "event_id": ev.get((r["player_id"], r["prop"], bool(r["under"]), round(float(r["line"]), 3))),
                  "tier": "R", "factor": 1.0, "p": None}
    return out


def to_plan(app, merged, per_rows, d, legd):
    """-> [(name, k, structure, [row dict with leg], [bank row dicts], sg)]"""
    import final_live as FL
    plan = []; per_count = defaultdict(int)
    SG = {s["code"]: s for s in FL.SET}
    for m in merged:
        sg = SG[m["code"]]; j = per_count[m["code"]]; per_count[m["code"]] += 1
        rows = []
        for r in m["rows"]:
            i = r["_i"]
            if i not in legd:
                rows = None; break
            rows.append(dict(pid=r["player_id"], prop=r["prop"], line=float(r["line"]), game=r["gid"], team=None, blend=float(r["blend"]) if r["blend"] == r["blend"] else 0.0,
                             ph=float(r["ph"]) if r["ph"] == r["ph"] else None, side="Under" if r["under"] else "Over", leg=dict(legd[i], p=float(r["blend"]) if r["blend"] == r["blend"] else legd[i].get("p"))))
        if rows is None:
            log(f"FINAL|{app} {m['code']}: a leg is not on the app's board right now - slip not built")
            continue
        on = {r["pid"] for r in rows}; bank = []
        for i in FL.LAST.get(m["code"], []):
            r = d.loc[i]
            if r["player_id"] in on or i not in legd or any(b["pid"] == r["player_id"] for b in bank):
                continue
            bank.append(dict(pid=r["player_id"], prop=r["prop"], line=float(r["line"]), game=r["gid"], team=None, blend=float(r["blend"]) if r["blend"] == r["blend"] else 0.0, ph=None,
                             side="Under" if r["under"] else "Over", leg=dict(legd[i], p=float(r["blend"]) if r["blend"] == r["blend"] else legd[i].get("p"))))
            if len(bank) >= 12:
                break
        st = "max" if (app in ("sleeper", "fliff") and sg["st"] == "power") else sg["st"]
        plan.append((name_of(sg, j), sg["k"], st, rows, bank, sg))
    return plan


def describe(app, name, k, st, rows):
    return f"{name} {k}-pick {st}: " + "; ".join(f"{r['leg'].get('player')} {r['prop']} {r['side']} {r['line']:g}" + (f" x{float(r['leg']['m']):.2f}" if r["leg"].get("m") and app in ("sleeper", "fliff") else "")
                                                  + f" ({100 * r['blend']:.1f}%)" for r in rows)


def write_pp_ud(conn, day, app, plan):
    import next_legs_store as NL
    n = 0
    if app == "prizepicks":
        conn.execute("DELETE FROM nba_score.live_slips WHERE game_date = %s AND strategy LIKE 'H\\_N%%' AND hits IS NULL", (day,))
        conn.execute("""UPDATE nba_score.live_slips SET status = 'placed_shadow' WHERE game_date = %s AND strategy NOT LIKE 'H\\_NP%%' AND status NOT LIKE '%%shadow%%' AND status <> 'dup' AND hits IS NULL""", (day,))
    else:
        conn.execute("DELETE FROM nba_score.ud_live_slips WHERE game_date = %s AND portfolio = 'H' AND composition LIKE 'H\\_NU%%' AND hits IS NULL", (day,))
        conn.execute("""UPDATE nba_score.ud_live_slips SET status = 'shadow' WHERE game_date = %s AND NOT (portfolio = 'H' AND composition LIKE 'H\\_NU%%') AND status NOT LIKE 'shadow%%' AND hits IS NULL""", (day,))
    for name, k, st, rows, bank, sg in plan:
        lj = [{"cell": f"{sg['code']}", "player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "tier": "R", "side": r["side"], "line": r["line"], "factor": 1.0,
               "event_id": r["leg"].get("event_id"), "p" if app == "prizepicks" else "p_hat": round(r["blend"], 4)} for r in rows]
        if app == "prizepicks":
            conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status, stake_weight) VALUES (%s,%s,1,%s,%s,%s,'placed',1)
                            ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, name, json.dumps(lj), k, st))
            conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, hurdles, updated_at) VALUES (%s, 'active', 1, '{}', now())
                            ON CONFLICT (strategy) DO UPDATE SET state = 'active', updated_at = now()""", (name,))
            key = name
        else:
            conn.execute("""INSERT INTO nba_score.ud_live_slips (game_date, portfolio, composition, size, structure, k, legs_json, stake, status, absence_flag)
                            VALUES (%s,'H',%s,%s,%s,1,%s,1.0,'live',false)""", (day, name, k, st, json.dumps(lj)))
            key = f"UD H {name} {k}{'F' if st == 'flex' else 'S'}"
        NL.store(conn, day, key, 1, [dict(b["leg"], tier="R", factor=1.0, p=round(b["blend"], 4)) for b in bank], exclude_players={r["leg"]["player"] for r in rows})
        n += 1
    return n


def write_other(conn, day, app, plan):
    """Sleeper / Fliff / Betr: the old engine's writers (same tables, same demotion of everything not H_N...)"""
    import honest_live_slip_engine as HL

    class Names(dict):
        def __missing__(self, k):
            return k
    HL.NAMES = Names()
    return HL.write(conn, day, {app: [(name, k, st, rows, bank) for name, k, st, rows, bank, _sg in plan]}, commit=False)


def store_lists(conn, day, app, d):
    """the PrizePicks / Underdog regular lists of the day (blend, model, score) for Betr's runs"""
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.fl_ranked (game_date date, app text, player_id text, player text, prop text, line float8, under boolean, gid text,
                    blend float8, ph float8, score float8, fhp float8, home float8, built_at timestamptz DEFAULT now())""")
    conn.execute("ALTER TABLE nba_score.fl_ranked ADD COLUMN IF NOT EXISTS home float8")
    conn.execute("DELETE FROM nba_score.fl_ranked WHERE game_date = %s AND app = %s", (day, app))
    x = d[(d["easy"] == 0) & d["under"]]
    with conn.cursor() as cur:
        with cur.copy("COPY nba_score.fl_ranked (game_date, app, player_id, player, prop, line, under, gid, blend, ph, score, fhp, home) FROM STDIN") as cp:
            for r in x.itertuples():
                nm = getattr(r, "player", None)
                cp.write_row((day, app, r.player_id, nm if isinstance(nm, str) else None, r.prop, float(r.line), True, r.gid, None if r.blend != r.blend else float(r.blend),
                              None if r.ph != r.ph else float(r.ph), None if r.score != r.score else float(r.score), None if r.fhp != r.fhp else float(r.fhp), None if r.home != r.home else float(r.home)))
    log(f"FINAL|stored {len(x)} {app} regular Unders for Betr")


def main():
    day = dt.date.fromisoformat(os.environ["FL_DATE"]) if os.environ.get("FL_DATE") else dt.datetime.now(PT).date()
    dry = os.environ.get("FL_DRY") == "1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        g = gate(conn)
        if not (g.get("enabled") and APP_RUN in (g.get("apps") or APPS)) and not dry and os.environ.get("FL_TEST") != "1":
            log(f"FINAL|gate off for {APP_RUN} ({day}) - nothing built, the old engine stands"); return
        import final_live as FL
        app = APP_RUN
        if app == "betr":
            FL.log = log
        if app == "betr":
            import final_betr as FB
            plan, notes = FB.build(conn, day)
        else:
            d, ev = live_frame(conn, day, FL)
            if d is None or not len(d):
                log(f"FINAL|{app} {day}: no live legs - nothing built"); return
            if app in ("prizepicks", "underdog"):
                store_lists(conn, day, app, d)
            skip = rule_filters(conn, day, d, app); notes = []
            per, merged = FL.day_slips(d, skip, notes)
            legd = leg_dicts(conn, day, app, d, ev)
            plan = to_plan(app, merged, per, d, legd)
        for x in notes:
            log(f"FINAL|{x}")
        for name, k, st, rows, bank, sg in plan:
            log(f"FINAL|{day} {app}: {describe(app, name, k, st, rows)} | bank {len(bank)} | leg gone: {leg_gone_rule(app, sg)}")
        log(f"FINAL|{day} {app}: {len(plan)} slips (slots {FL.SLOTS[app]})")
        if dry or not plan:
            conn.rollback(); log("FINAL|dry run or nothing to write"); return
        if app == "betr":
            import final_betr as FB
            n = FB.write(conn, day, plan)
        else:
            n = write_pp_ud(conn, day, app, plan) if app in ("prizepicks", "underdog") else write_other(conn, day, app, plan)
        if os.environ.get("FL_TEST") == "1":
            conn.rollback(); log(f"FINAL|write-path test: {n} slips written and rolled back"); return
        conn.commit(); log(f"FINAL|{day} {app}: {n} slips written")


if __name__ == "__main__":
    main()
