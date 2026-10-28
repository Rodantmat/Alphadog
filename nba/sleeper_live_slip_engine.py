#!/usr/bin/env python3
"""
SLEEPER LIVE SLIPS (owner 2026-10-26 12:17 PT: "I like the 1 2pick and 1 3pick flex, deploy it"). Two Sleeper slips a slate:
  S_T1_2max   2-pick Max  ] both from the SAME list: Underdog portfolio T unit T1's qualified legs (ud_portfolio_t / build_ud_slip_engine
  S_T1_3flex  3-pick Flex ] doc rule 'weighted:rebounds_B1_U', distinct players), each priced at SLEEPER'S window main line and multiplier
                             (per player-stat-side the main line nearest 1.78, as research_sleeper_transfer.LivePricer), ordered by our
                             final_hp (highest first), legs priced above 1.85 dropped, the top leg skipped, one leg per game, >= 2 teams.
EVIDENCE (research_sleeper_small, 20,332 compositions; NBA_COMPASS 185): 2-pick Max 306 slips ROI +33.0% (2024-25 +36 / 2025-26 +30),
  cashed 44%, max drawdown 13.6u; 3-pick Flex 294 slips +24.1% (+28 / +20), cashed 66%, max dd 10.0u (runs 40381488658 / 40381496147).
PRICING (Sleeper's own, fitted on 454 of the owner's entries, classification_config['sleeper_payout'].true_pricing): Max = product x
  size bonus (2: 1.0, 3: 1.0797); Flex tiers EV-matched at q = 1/m (3-pick target 1.0012, T1/T0 0.3287). A void drops the pick
  (fewer than 2 live picks or one team = refund; a Flex left with 2 live picks pays as a 2-pick Max).
GATE: classification_config['sleeper_live'] (enabled, play). Rows: nba_score.sleeper_live_slips (status live; never placed by any worker
  - nothing is sent to Sleeper). Modes: SL_MODE=pick (SL_DATE or today PT) | grade (SL_DATE or every ungraded slate). Env: DATABASE_URL.
"""
import datetime as dt
import itertools
import json
import math
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "sleeper")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
DDL = """CREATE TABLE IF NOT EXISTS nba_score.sleeper_live_slips (
  game_date date NOT NULL, strategy text NOT NULL, size int NOT NULL, structure text NOT NULL, k int NOT NULL DEFAULT 1,
  legs_json jsonb NOT NULL, stake numeric NOT NULL DEFAULT 1, status text NOT NULL, model_multiplier numeric, flex_tiers jsonb,
  built_at timestamptz NOT NULL DEFAULT now(), graded_at timestamptz, hits int, payout numeric, profit numeric,
  PRIMARY KEY (game_date, strategy, k))"""
STRATS = (("S_T1_2max", 2, "max"), ("S_T1_3flex", 3, "flex"))
MCAP, SKIP = 1.85, 1
# ALL-LEGS RULE (owner 2026-10-28 16:44 PT "Deploy the best balance strategies"; research_app_allegs AA_ONLY=5flex AA_FINE=1 run
# 40784902924, the best balance among 2,349 rules robust in both seasons AND positive on this season's real Sleeper boards):
# S_ALL_5flex - every leg on Sleeper's window board (main lines both sides + alternate rungs) with our final_hp AT SLEEPER'S LINE,
# final_hp >= 0.50, final_hp x m >= 1.12, ranked by (final_hp + market chance) / 2 x m (market = the books' de-vigged chance at the
# same line, else 1 / (1.1238 m)), distinct players, one leg a game, >= 2 teams; 5-pick Flex, TWO slips a slate (the second from
# other players), no leg skipped. History 2024-25 +106.5% (254 slips, max dd 8.3u) / 2025-26 +137.2% (238, dd 8.5u); this season's
# real boards +53.5% (10 slips, dd 1.4u). Caveats: history prices are Sleeper's law on the books' lines (flatters value legs); 5-pick
# Flex tiers rest on few of the owner's entries. classification_config['sleeper_live'].rules picks which rules build.
ALL_RULE = {"name": "S_ALL_5flex", "size": 5, "structure": "flex", "slips": 2, "floor": 0.50, "gate": 1.12, "mcap": 99.0}


def connect():
    c = psycopg.connect(os.environ["DATABASE_URL"])
    c.execute("SET statement_timeout = 0")            # session level only (the database is shared with MLB)
    return c


def cfg(conn, key):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = %s", (key,)).fetchone()
    if not r:
        return {}
    return r[0] if isinstance(r[0], dict) else json.loads(r[0])


def pricing(conn):
    tp = cfg(conn, "sleeper_payout").get("true_pricing") or {}
    return ({int(k): float(v) for k, v in (tp.get("max_bonus") or {}).items()},
            {int(k): float(v) for k, v in (tp.get("flex_ev") or {}).items()},
            {int(k): tuple(float(x) for x in v) for k, v in (tp.get("flex_ratio") or {}).items()})


def flex_tiers(ms, flex_ev, flex_ratio):
    """Sleeper Flex tiers {hits: multiplier} for live legs with multipliers ms: T0 = E / (P(all) + r1 P(1 miss) + r2 P(2 misses))"""
    n = len(ms)
    q = [1.0 / m for m in ms]
    pall = math.prod(q)
    p1 = sum(pall / q[i] * (1 - q[i]) for i in range(n))
    p2 = sum(pall / (q[i] * q[k]) * (1 - q[i]) * (1 - q[k]) for i, k in itertools.combinations(range(n), 2))
    r1, r2 = flex_ratio[n]
    t0 = flex_ev[n] / (pall + r1 * p1 + r2 * p2)
    out = {n: round(t0, 4), n - 1: round(t0 * r1, 4)}
    if r2 > 0:
        out[n - 2] = round(t0 * r2, 4)
    return out


def payout(legs, structure, pr):
    """Sleeper's payout for graded legs (hit True / False / None = void)"""
    bonus, fev, frat = pr
    live = [l for l in legs if l.get("hit") is not None]
    n = len(live)
    if n < 2 or len({l.get("team") for l in live}) < 2:
        return 1.0                                                        # refund
    ms = [float(l["factor"]) for l in live]
    hits = sum(1 for l in live if l["hit"])
    if structure == "max" or n == 2:
        return math.prod(ms) * bonus.get(n, 1.0) if hits == n else 0.0
    return float(flex_tiers(ms, fev, frat).get(hits, 0.0))


def teams_of(conn, pids, day):
    if not pids:
        return {}
    rows = conn.execute("""SELECT DISTINCT ON (nba_player_id) nba_player_id::text, team_id FROM nba_stats.player_game_log
                           WHERE nba_player_id::text = ANY(%s) AND game_date < %s ORDER BY nba_player_id, game_date DESC""",
                        (list(pids), day)).fetchall()
    out = {p: t for p, t in rows}
    try:                                                                 # today's roster wins (off-season moves)
        for p, t in conn.execute("SELECT nba_player_id::text, team_id FROM nba_ref.players WHERE nba_player_id::text = ANY(%s) AND team_id IS NOT NULL",
                                 (list(pids),)).fetchall():
            out[p] = t
    except Exception:  # noqa: BLE001
        conn.rollback()
    return out


def sleeper_main(conn, day):
    sl, _mk, _ml, _a, _b = RSD.load(conn, day)
    by = {}
    for (pid, prop, side, line), l in sl.get("window", {}).items():
        if l["kind"] != "main":
            continue
        k = (str(pid), prop, side)
        cur = by.get(k)
        if cur is None or abs(l["m"] - 1.78) < abs(cur["m"] - 1.78):
            by[k] = l
    return by


def build(conn, day):
    """the two slips for `day` as legs lists (same composition as research_sleeper_small: order=p, m<=1.85, skip=1, 1 slip/day)"""
    legs, rows = AF.load_ud(conn, day, {})
    if not legs:
        return None, "no Underdog window board / final_hp for the slate"
    c, gc = ST.ud_lists(rows, legs)["T1"]
    board = sleeper_main(conn, day)
    if not board:
        return None, "no Sleeper window board for the slate"
    tm = teams_of(conn, {str(x["player_id"]) for x in c if x.get("player_id") is not None}, day)
    priced, seen = [], set()
    for src in c:
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        b = board.get((pid, src["prop"], src["side"]))
        if b is None or (pid, src["prop"], src["side"]) in seen:
            continue
        seen.add((pid, src["prop"], src["side"]))
        priced.append({"pid": pid, "player": src.get("player") or b.get("player"), "prop": src["prop"], "side": src["side"],
                       "line": float(b["line"]), "m": float(b["m"]), "p": float(src["p"]), "team": tm.get(pid),
                       "game": src.get("event_id") or b.get("event_id"), "ud_line": float(src["line"])})
    cand = [l for l in sorted(priced, key=lambda x: -x["p"]) if l["m"] <= MCAP][SKIP:]
    out = {}
    for name, k, structure in STRATS:
        s = ST.pick(cand, k, gc)
        if s is not None:
            out[name] = (k, structure, s)
    return out, f"T1 qualified {len(c)}, on Sleeper {len(priced)}, after cap/skip {len(cand)}"


def build_all(conn, day, rule):
    """S_ALL rule: [slips] from every Sleeper window leg at its own line (research_app_allegs.live_legs + day(), order evbl)"""
    sl, mk, *_ = RSD.load(conn, day)
    legs = []
    for (pid, prop, side, line), l in sl.get("window", {}).items():
        if l["hp"] is None:
            continue
        pm = mk.get((pid, prop, side, line))
        legs.append({"pid": None if pid is None else str(pid), "player": l["player"], "prop": prop, "side": side, "line": float(line), "m": float(l["m"]),
                     "p": float(l["hp"]), "pf": (sum(pm) / len(pm)) if pm else 1 / (float(l["m"]) * 1.1238), "game": l["event_id"],
                     "kind": l["kind"], "ud_line": None})
    tm = teams_of(conn, {l["pid"] for l in legs if l["pid"] is not None}, day)
    for l in legs:
        l["team"] = tm.get(l["pid"])
    # exactly research_app_allegs.day(): the order is stable on RSD.load's order, a leg without a known team is still a leg
    cand = [l for l in legs if l["p"] >= rule["floor"] and l["p"] * l["m"] >= rule["gate"] and l["m"] <= rule["mcap"]]
    cand.sort(key=lambda l: -(l["p"] + l["pf"]) / 2 * l["m"])
    out, used = [], set()
    for _ in range(rule["slips"]):
        s, pl, gm = [], set(), set()
        for l in cand:
            if l["pid"] in pl or l["pid"] in used or l["game"] in gm:
                continue
            s.append(l); pl.add(l["pid"]); gm.add(l["game"])
            if len(s) == rule["size"]:
                break
        if len(s) < rule["size"] or len({l["team"] for l in s}) < 2:
            break
        used |= pl
        out.append(s)
    return out, f"Sleeper window legs with final_hp {len(legs)}, qualifying {len(cand)}"


def pick(conn, day):
    sc = cfg(conn, "sleeper_live")
    if not sc.get("enabled"):
        print(f"SLEEPER_LIVE|disabled (classification_config sleeper_live.enabled) - nothing built for {day}")
        return
    conn.execute(DDL)
    pr = pricing(conn)
    rules = sc.get("rules") or [n for n, _k, _s in STRATS]
    if ALL_RULE["name"] in rules:
        aslips, anote = build_all(conn, day, ALL_RULE)
        print(f"SLEEPER_LIVE|{day} {ALL_RULE['name']}: {anote}, slips {len(aslips)}")
        k_, st_ = ALL_RULE["size"], ALL_RULE["structure"]
        for kk, s in enumerate(aslips, start=1):
            lj = [{"player": l["player"], "player_id": l["pid"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"],
                   "p": round(l["p"], 4), "pf": round(l["pf"], 4), "team": l["team"], "event_id": l["game"], "tier": "R", "kind": l["kind"]} for l in s]
            ms = [l["m"] for l in s]
            tiers = flex_tiers(ms, pr[1], pr[2])
            conn.execute("""INSERT INTO nba_score.sleeper_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status,
                              model_multiplier, flex_tiers) VALUES (%s, %s, %s, %s, %s, %s, 1, 'live', %s, %s)
                            ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                              model_multiplier = EXCLUDED.model_multiplier, flex_tiers = EXCLUDED.flex_tiers, built_at = now()
                            WHERE nba_score.sleeper_live_slips.graded_at IS NULL""",
                         (day, ALL_RULE["name"], k_, st_, kk, json.dumps(lj), round(tiers[k_], 4), json.dumps(tiers)))
            print(f"SLEEPER_LIVE|{day} {ALL_RULE['name']} k{kk}: " + "; ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']:g} x{l['m']:.2f} ({100 * l['p']:.0f}%)" for l in s)
                  + f" -> Flex tiers {tiers}")
        if not aslips:
            print(f"SLEEPER_LIVE|{day} {ALL_RULE['name']}: not enough qualifying legs - no slip")
    if not any(n in rules for n, _k, _s in STRATS):
        conn.commit()
        return
    slips, note = build(conn, day)
    print(f"SLEEPER_LIVE|{day} {note}")
    if slips is None:
        conn.commit()
        return
    for name, k, structure in STRATS:
        if name not in rules:
            continue
        if name not in slips:
            print(f"SLEEPER_LIVE|{day} {name}: not enough legs - no slip")
            continue
        _k, _st, s = slips[name]
        lj = [{"player": l["player"], "player_id": l["pid"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"],
               "p": round(l["p"], 4), "team": l["team"], "event_id": l["game"], "tier": "R", "ud_line": l["ud_line"]} for l in s]
        ms = [l["m"] for l in s]
        model = math.prod(ms) * pr[0].get(k, 1.0)
        tiers = flex_tiers(ms, pr[1], pr[2]) if structure == "flex" else None
        if tiers:
            model = tiers[k]
        conn.execute("""INSERT INTO nba_score.sleeper_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status,
                          model_multiplier, flex_tiers) VALUES (%s, %s, %s, %s, 1, %s, 1, 'live', %s, %s)
                        ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                          model_multiplier = EXCLUDED.model_multiplier, flex_tiers = EXCLUDED.flex_tiers, built_at = now()
                        WHERE nba_score.sleeper_live_slips.graded_at IS NULL""",
                     (day, name, k, structure, json.dumps(lj), round(model, 4), json.dumps(tiers) if tiers else None))
        print(f"SLEEPER_LIVE|{day} {name}: {k}-pick {structure}, Sleeper multipliers {ms}, model payout {model:.3f}x")
    conn.commit()


def grade(conn, day):
    conn.execute(DDL)
    pr = pricing(conn)
    days = [day] if day else [r[0] for r in conn.execute(
        "SELECT DISTINCT game_date FROM nba_score.sleeper_live_slips WHERE graded_at IS NULL AND game_date < (now() AT TIME ZONE 'America/Los_Angeles')::date ORDER BY 1").fetchall()]
    for d in days:
        st = AF.box(conn, d)
        if not st:
            print(f"SLEEPER_GRADE|{d}: no box scores yet - left ungraded")
            continue
        for name, size, structure, lj, stake in conn.execute(
                "SELECT strategy, size, structure, legs_json, stake FROM nba_score.sleeper_live_slips WHERE game_date = %s AND graded_at IS NULL", (d,)).fetchall():
            legs = lj if isinstance(lj, list) else json.loads(lj)
            for l in legs:
                h = AF.outcome(st, l)
                l["hit"] = None if h is None else bool(h)
            pay = payout(legs, structure, pr)
            hits = sum(1 for l in legs if l["hit"])
            conn.execute("""UPDATE nba_score.sleeper_live_slips SET legs_json = %s, hits = %s, payout = %s, profit = %s, graded_at = now()
                            WHERE game_date = %s AND strategy = %s AND k = 1""",
                         (json.dumps(legs), hits, round(pay, 4), round(float(stake) * (pay - 1), 4), d, name))
            print(f"SLEEPER_GRADE|{d} {name}: {hits}/{size} hit, payout {pay:.3f}x")
        conn.commit()


def main():
    mode = os.environ.get("SL_MODE") or "pick"
    ds = (os.environ.get("SL_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else None
    with connect() as conn:
        if mode == "pick":
            pick(conn, day or dt.datetime.now(PT).date())
        elif mode == "grade":
            grade(conn, day)
        else:
            raise SystemExit(f"unknown SL_MODE {mode}")


if __name__ == "__main__":
    main()
