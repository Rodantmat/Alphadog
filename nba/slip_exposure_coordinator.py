#!/usr/bin/env python3
"""
PER-APP SLIP EXPOSURE COORDINATOR (owner 2026-11-13: "Main legs in 2 slips max, 2 slips cannot share more than 2 leg, 2 leg max for one slip,
the rest 1 leg max, those rules are per app" / "Same for all apps! That cannot happen!").

Why: every engine cuts its slips from its own top-N list and the strategies do not coordinate, so one player (e.g. Klay Thompson) landed in all 5 placed
PrizePicks slips. This step runs AFTER an app's engines and enforces ONE rule on the app's PLAYED slips (status below), never across apps:
  * a leg (player) sits in at most `max_slips_per_leg` (2) of the app's slips;
  * a slip repeats at most `max_reuse_per_slip` (2) legs that an earlier slip already uses - every other leg of the slip is used by that slip only;
  * hence two slips never share more than 2 legs.
Slips are taken in priority order (config order, else production order). A slip that breaks the rule has the offending legs replaced by the next-ranked
candidates of its OWN strategy (nba_score.slip_next_legs, rank order, same side/line kind, a player not yet used by any kept slip, one leg per game when the
slip was built that way). A slip with no legal substitute is dropped (deleted when ungraded) - a smaller clean card beats a correlated one.
Fliff / Sleeper multipliers are recomputed from the new legs. Graded rows and shadow / backup slips are never touched.
Gate: classification_config['slip_exposure_v2'] {enabled, apps, max_slips_per_leg, max_reuse_per_slip, order: {app: [strategy,...]}}.
Env: DATABASE_URL, EXP_DATE (default today PT), EXP_APPS (comma list, default all), EXP_DRY=1 prints and writes nothing, EXP_FORCE=1 ignores the gate.
"""
import collections
import datetime as dt
import json
import math
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PT = ZoneInfo("America/Los_Angeles")
DEFAULTS = {"enabled": True, "max_slips_per_leg": 2, "max_reuse_per_slip": 2,
            "apps": ["prizepicks", "underdog", "sleeper", "fliff", "betr"]}
# app -> (table, played-status filter, key columns, strategy expression for slip_next_legs)
APPS = {
    "prizepicks": ("nba_score.live_slips", "status = 'placed'", ("strategy", "k"), "strategy"),
    "underdog": ("nba_score.ud_live_slips", "status = 'live'", ("portfolio", "composition", "k"),
                 "'UD ' || portfolio || ' ' || composition || ' ' || size::text || 'F'"),
    "sleeper": ("nba_score.sleeper_live_slips", "status = 'live'", ("strategy", "k"), "strategy"),
    "fliff": ("nba_score.fliff_live_slips", "status = 'live'", ("strategy", "k"), "strategy"),
    "betr": ("nba_score.betr_live_slips", "status = 'live'", ("strategy", "k"), "strategy"),
}


def log(m):
    print(m, flush=True)


def pid_of(l):
    v = l.get("player_id")
    return str(v) if v not in (None, "") else "n:" + "".join(ch for ch in str(l.get("player", "")).lower() if ch.isalnum())


def floor2(x):
    return int(x * 100 + 1e-6) / 100.0


def as_leg(cand, replaced):
    """slip_next_legs candidate -> a slip leg in the app's own leg format"""
    l = dict(cand)
    if "m" in l:
        l["factor"] = l.pop("m")
    l.setdefault("factor", 1.0)
    l.setdefault("tier", "R")
    l["substitute_for"] = replaced.get("player")
    return l


def enforce(slips, cands, cfg):
    """slips: ordered list of {'id','legs'}; cands: id -> ranked candidate dicts. Returns [(slip, new_legs|None, [changes])] in the same order."""
    cap, reuse_max = int(cfg["max_slips_per_leg"]), int(cfg["max_reuse_per_slip"])
    count = collections.Counter()
    out = []
    for s in slips:
        legs = [dict(l) for l in s["legs"]]
        distinct_ev = len({l.get("event_id") for l in legs}) == len(legs)
        changes = []
        # legs to replace: any at the cap, then the surplus of repeated legs beyond reuse_max (the most-used first, the later leg first)
        bad = [i for i, l in enumerate(legs) if count[pid_of(l)] >= cap]
        rest = [i for i, l in enumerate(legs) if 0 < count[pid_of(l)] < cap]
        surplus = max(0, len(rest) - max(0, reuse_max - 0))
        rest.sort(key=lambda i: (-count[pid_of(legs[i])], -i))
        bad += rest[:surplus]
        used_pids = {pid_of(l) for i, l in enumerate(legs) if i not in bad}
        used_ev = {l.get("event_id") for i, l in enumerate(legs) if i not in bad}
        ok = True
        for i in sorted(bad):
            old = legs[i]
            pick = None
            for c in cands.get(s["id"], []):
                if pid_of(c) in used_pids or count[pid_of(c)] > 0:
                    continue
                if str(c.get("side", "")).lower()[:1] != str(old.get("side", "")).lower()[:1]:
                    continue
                if distinct_ev and c.get("event_id") in used_ev:
                    continue
                pick = c
                break
            if pick is None:
                ok = False
                break
            new = as_leg(pick, old)
            legs[i] = new
            used_pids.add(pid_of(new)); used_ev.add(new.get("event_id"))
            changes.append(f"{old.get('player')} {old.get('prop')} {old.get('side')} {old.get('line')} -> {new.get('player')} {new.get('prop')} {new.get('side')} {new.get('line')}")
        if not ok:
            out.append((s, None, changes))
            continue
        for l in legs:
            count[pid_of(l)] += 1
        out.append((s, legs, changes))
    return out


def load_cfg(conn, force):
    row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'slip_exposure_v2'").fetchone()
    c = dict(DEFAULTS)
    if row:
        c.update(row[0] if isinstance(row[0], dict) else json.loads(row[0]))
    if not c.get("enabled") and not force:
        return None
    return c


def run_app(conn, app, day, cfg, dry):
    table, where, keys, strat = APPS[app]
    rows = conn.execute(f"SELECT {', '.join(keys)}, legs_json, {strat} AS sname FROM {table} WHERE game_date = %s AND {where} AND graded_at IS NULL", (day,)).fetchall()
    if not rows:
        log(f"EXPOSURE|{day} {app}: no played ungraded slips")
        return
    slips = []
    for r in rows:
        kv = dict(zip(keys, r[:len(keys)]))
        legs = r[len(keys)]
        legs = legs if isinstance(legs, list) else json.loads(legs)
        slips.append({"id": tuple(kv.values()), "kv": kv, "legs": legs, "sname": r[len(keys) + 1], "k": kv["k"]})
    order = (cfg.get("order") or {}).get(app)
    if order is None and app == "prizepicks":
        row = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'pp_portfolio'").fetchone()
        if row:
            pj = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            order = pj.get("order")
    rank = {n: i for i, n in enumerate(order or [])}
    slips.sort(key=lambda s: (rank.get(s["sname"], 999), str(s["sname"]), s["k"]))
    cands = {}
    for s in slips:
        rs = conn.execute("SELECT leg FROM nba_score.slip_next_legs WHERE game_date = %s AND strategy = %s AND k = %s ORDER BY rank", (day, s["sname"], s["k"])).fetchall()
        cands[s["id"]] = [x[0] if isinstance(x[0], dict) else json.loads(x[0]) for x in rs]
    pr = fl_mu = None
    if app == "sleeper":
        import sleeper_live_slip_engine as SL
        pr = SL.pricing(conn)
    if app == "fliff":
        fl_mu = {r[0]: r[1] for r in conn.execute("""SELECT DISTINCT ON (nba_ref.norm_name(player)) nba_ref.norm_name(player), matchup FROM nba_market.fliff_pickem_board
                  WHERE game_date = %s AND snapshot_ts = (SELECT max(snapshot_ts) FROM nba_market.fliff_pickem_board WHERE game_date = %s)
                  ORDER BY nba_ref.norm_name(player)""", (day, day)).fetchall()}
    res = enforce(slips, cands, cfg)
    kept = changed = dropped = 0
    for s, legs, changes in res:
        tag = f"{s['sname']} k{s['k']}"
        wh = " AND ".join(f"{c} = %s" for c in ("game_date",) + tuple(keys))
        args = (day,) + tuple(s["kv"][c] for c in keys)
        if legs is None:
            dropped += 1
            log(f"EXPOSURE|{day} {app} {tag}: DROPPED - no legal substitute ({'; '.join(changes) or 'none found'})")
            if not dry:
                conn.execute(f"DELETE FROM {table} WHERE {wh} AND graded_at IS NULL", args)
            continue
        if not changes:
            kept += 1
            continue
        changed += 1
        log(f"EXPOSURE|{day} {app} {tag}: " + " | ".join(changes))
        if dry:
            continue
        if app == "fliff":
            for l in legs:
                if "substitute_for" in l and not l.get("matchup"):
                    m = fl_mu.get(conn.execute("SELECT nba_ref.norm_name(%s)", (l["player"],)).fetchone()[0])
                    if m:
                        l["matchup"] = m
            mult = round(floor2(math.prod(float(l["factor"]) for l in legs)), 4)
            conn.execute(f"UPDATE {table} SET legs_json = %s, model_multiplier = %s, built_at = now() WHERE {wh} AND graded_at IS NULL", (json.dumps(legs), mult, *args))
        elif app == "sleeper":
            tiers = SL.flex_tiers([float(l["factor"]) for l in legs], pr[1], pr[2])
            size = len(legs)
            conn.execute(f"UPDATE {table} SET legs_json = %s, model_multiplier = %s, flex_tiers = %s, built_at = now() WHERE {wh} AND graded_at IS NULL",
                         (json.dumps(legs), round(tiers[size], 4), json.dumps(tiers), *args))
        else:
            conn.execute(f"UPDATE {table} SET legs_json = %s WHERE {wh} AND graded_at IS NULL", (json.dumps(legs), *args))
    log(f"EXPOSURE|{day} {app}: {len(slips)} played slips -> {kept} clean, {changed} fixed by substitution, {dropped} dropped")


def main():
    ds = (os.environ.get("EXP_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else dt.datetime.now(PT).date()
    dry = os.environ.get("EXP_DRY") == "1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        cfg = load_cfg(conn, os.environ.get("EXP_FORCE") == "1")
        if cfg is None:
            log("EXPOSURE|disabled (classification_config slip_exposure_v2.enabled) - nothing changed")
            return
        apps = [a.strip() for a in (os.environ.get("EXP_APPS") or ",".join(cfg["apps"])).split(",") if a.strip()]
        for app in apps:
            try:
                run_app(conn, app, day, cfg, dry)
                if not dry:
                    conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                log(f"EXPOSURE|{day} {app}: FAILED, slips left as built ({e})")


if __name__ == "__main__":
    main()
