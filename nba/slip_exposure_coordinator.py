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
CROSS-APP CAP (owner 2026-11-16 23:13 PT, after Jokic Unders sat in 7 slips across apps): slip_exposure_v2.cross {enabled, cap, key: player|leg,
substitute, order: [apps]} - a player already in `cap` kept slips on the apps earlier in `order` is swapped for the strategy's next-ranked candidate
(or the slip is dropped); absent / disabled = the per-app rule alone, unchanged.
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


def game_key(l):
    """One key per game whatever the leg's source: the matchup (spaces removed, e.g. 'DAL@BOS') when the leg carries one, else its event id.
    2026-11-15: a Fliff substitute (Cooper Flagg) joined a slip that already held the same game (Jayson Tatum, DAL@BOS) because the candidate's
    event id did not equal the slip leg's - Fliff then paid the pair 2.96x instead of 3.79x."""
    m = str(l.get("matchup") or "").replace(" ", "").upper()
    return m or l.get("event_id")


def name_key(l):
    """one key per player ACROSS apps (player ids differ by app): the name lower-cased, accents and punctuation removed, Jr / Sr / II-IV dropped"""
    import unicodedata
    t = unicodedata.normalize("NFKD", str(l.get("player") or "")).encode("ascii", "ignore").decode().lower()
    w = [x for x in "".join(ch if ch.isalnum() else " " for ch in t).split() if x not in ("jr", "sr", "ii", "iii", "iv")]
    return "".join(w)


def gkey_of(l, kind):
    """the cross-app exposure key of a leg: 'player' = the player (any prop / side), 'leg' = player + prop + side"""
    return name_key(l) if kind != "leg" else (name_key(l), str(l.get("prop")), str(l.get("side", "")).lower()[:1])


def cross_counts(conn, day, app, cross):
    """slips already kept today on the apps BEFORE `app` in the cross-app order, per exposure key (played rows, graded or not)"""
    order = list(cross.get("order") or DEFAULTS["apps"])
    glob = collections.Counter()
    for a in order[:order.index(app)] if app in order else []:
        table, where, _keys, _strat = APPS[a]
        for (legs,) in conn.execute(f"SELECT legs_json FROM {table} WHERE game_date = %s AND {where}", (day,)).fetchall():
            legs = legs if isinstance(legs, list) else json.loads(legs)
            for gk in {gkey_of(l, cross.get("key", "player")) for l in legs}:
                glob[gk] += 1
    return glob


def enforce(slips, cands, cfg, one_per_game=False, glob=None, gcap=None, gkind="player", gsub=True):
    """slips: ordered list of {'id','legs'}; cands: id -> ranked candidate dicts. Returns [(slip, new_legs|None, [changes])] in the same order.
    one_per_game=True (Fliff: same-game legs are paid at a discount) never lets a substitute share a game with a kept leg.
    CROSS-APP CAP (owner 2026-11-16 23:13 PT): glob = a Counter of the slips ALREADY kept on the apps processed earlier today, keyed by gkey_of;
    a leg whose key already sits in gcap slips across apps is replaced like a leg at the per-app cap (gsub=False: the slip is dropped instead),
    and a substitute must itself be under gcap. glob is updated in place with the kept slips. glob None / gcap None = the per-app rule alone."""
    cap, reuse_max = int(cfg["max_slips_per_leg"]), int(cfg["max_reuse_per_slip"])
    count = collections.Counter()
    gon = glob is not None and gcap is not None
    out = []
    for s in slips:
        legs = [dict(l) for l in s["legs"]]
        distinct_ev = one_per_game or len({game_key(l) for l in legs}) == len(legs)
        changes = []
        # legs to replace: any at the cap, then the surplus of repeated legs beyond reuse_max (the most-used first, the later leg first)
        gbad = {i for i, l in enumerate(legs) if gon and glob[gkey_of(l, gkind)] >= gcap}
        if gbad and not gsub:
            out.append((s, None, ["cross-app cap"]))
            continue
        bad = [i for i, l in enumerate(legs) if count[pid_of(l)] >= cap or i in gbad]
        rest = [i for i, l in enumerate(legs) if 0 < count[pid_of(l)] < cap and i not in gbad]
        surplus = max(0, len(rest) - reuse_max)
        rest.sort(key=lambda i: (-count[pid_of(legs[i])], -i))
        bad += rest[:surplus]
        used_pids = {pid_of(l) for i, l in enumerate(legs) if i not in bad}
        used_ev = {game_key(l) for i, l in enumerate(legs) if i not in bad}
        ok = True
        for i in sorted(bad):
            old = legs[i]
            pick = None
            for c in cands.get(s["id"], []):
                if pid_of(c) in used_pids or count[pid_of(c)] > 0:
                    continue
                if gon and glob[gkey_of(c, gkind)] >= gcap:
                    continue
                if str(c.get("side", "")).lower()[:1] != str(old.get("side", "")).lower()[:1]:
                    continue
                if distinct_ev and game_key(c) in used_ev:
                    continue
                pick = c
                break
            if pick is None:
                ok = False
                break
            new = as_leg(pick, old)
            legs[i] = new
            used_pids.add(pid_of(new)); used_ev.add(game_key(new))
            changes.append(f"{old.get('player')} {old.get('prop')} {old.get('side')} {old.get('line')} -> {new.get('player')} {new.get('prop')} {new.get('side')} {new.get('line')}")
        if not ok:
            out.append((s, None, changes))
            continue
        for l in legs:
            count[pid_of(l)] += 1
        if glob is not None:
            for gk in {gkey_of(l, gkind) for l in legs}:
                glob[gk] += 1
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
    if app == "fliff":
        # every Fliff leg and candidate gets its matchup BEFORE the rule runs, so the one-leg-per-game test compares like with like
        _nn = {}
        def _mu(l):
            if l.get("matchup"):
                return
            p = str(l.get("player") or "")
            if p not in _nn:
                _nn[p] = conn.execute("SELECT nba_ref.norm_name(%s)", (p,)).fetchone()[0]
            m = fl_mu.get(_nn[p])
            if m:
                l["matchup"] = m
        for s in slips:
            for l in s["legs"]:
                _mu(l)
        for cl in cands.values():
            for l in cl:
                _mu(l)
    cross = cfg.get("cross") or {}
    if cross.get("enabled") and cross.get("cap"):
        # CROSS-APP CAP (owner 2026-11-16 23:13 PT): a player already in `cap` slips on the apps built earlier today is swapped out here
        glob = cross_counts(conn, day, app, cross)
        res = enforce(slips, cands, cfg, one_per_game=(app == "fliff"), glob=glob, gcap=int(cross["cap"]), gkind=cross.get("key", "player"),
                      gsub=bool(cross.get("substitute", True)))
        log(f"EXPOSURE|{day} {app}: cross-app cap {cross['cap']} per {cross.get('key', 'player')} on ({len(glob)} keys already used on earlier apps)")
    else:
        res = enforce(slips, cands, cfg, one_per_game=(app == "fliff"))
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
        xo = list((cfg.get("cross") or {}).get("order") or DEFAULTS["apps"])
        apps.sort(key=lambda a: xo.index(a) if a in xo else 99)      # the cross-app cap counts the apps in this order
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
