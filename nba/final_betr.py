#!/usr/bin/env python3
"""Betr's final-set slips: the research's source orders (research_pass31_small.py) on the live lists the PrizePicks / Underdog runs stored (nba_score.fl_ranked), mapped onto Betr's own board
(same player and prop, the line nearest the source's), pool layers, take() with start offset. Power 2 = Perfect, 6-pick Flex = Dynamic (Betr's own tables, nba_config.pp_slip_rules betr_payout_v1)."""
import json
import os
from collections import defaultdict

import final_live as FL

SINGLE = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers")
POOLS = {"every single stat": lambda r: True, "no assists": lambda r: r["prop"] != "assists", "rebounds": lambda r: r["prop"] == "rebounds", "points": lambda r: r["prop"] == "points",
         "no points": lambda r: r["prop"] != "points", "points + rebounds": lambda r: r["prop"] in ("points", "rebounds"), "defensive": lambda r: r["prop"] in ("steals", "blocks", "turnovers"),
         "threes": lambda r: r["prop"] == "threes_made", "lines under 10": lambda r: r["line"] < 10, "lines 10+": lambda r: r["line"] >= 10,
         "home": lambda r: r.get("home") == 1.0, "away": lambda r: r.get("home") == 0.0}


def pool_fn(layer):
    fs = [POOLS[x.strip()] for x in layer.split(" & ")]
    return lambda r: all(f(r) for f in fs)


def take(rows, k, gcap, diff=False, start=1, skip=(), seed=()):
    out = list(seed); games = defaultdict(int); players = {r["player_id"] for r in seed} | set(skip); props = {r["prop"] for r in seed}
    for r in seed:
        games[r["game_id"]] += 1
    n = 0
    for r in rows:
        if r["player_id"] in players or games[r["game_id"]] >= gcap or (diff and r["prop"] in props):
            continue
        n += 1
        if n < start:
            players.add(r["player_id"]); continue
        out.append(r); players.add(r["player_id"]); games[r["game_id"]] += 1; props.add(r["prop"])
        if len(out) == k:
            return out
    return None


def firstk(rows, k):
    o = []; gs = set(); ps = set()
    for r in rows:
        if r["player_id"] in ps or r["game_id"] in gs:
            continue
        o.append(r); ps.add(r["player_id"]); gs.add(r["game_id"])
        if len(o) == k:
            break
    return o


def lists(conn, day):
    import pandas as pd
    x = pd.read_sql("SELECT app, player_id, player, prop, line, gid game_id, blend, ph, score, home FROM nba_score.fl_ranked WHERE game_date = %s AND blend IS NOT NULL ORDER BY blend DESC", conn, params=(day,))
    U = x[x["app"] == "underdog"].to_dict("records")
    P = x[(x["app"] == "prizepicks") & (x["line"] % 1 != 0)].to_dict("records")
    return U, P


def sources(U, P):
    nz = lambda v: v == v and v is not None
    return {"tight (live)": sorted(firstk(U, 2) + firstk(P, 5), key=lambda r: -r["blend"]),
            "PrizePicks order": P,
            "PrizePicks average order": sorted(P, key=lambda r: -((r["blend"] + r["ph"]) / 2 if nz(r["ph"]) else -9)),
            "PrizePicks score order": sorted([r for r in P if nz(r["score"])], key=lambda r: -r["score"])}


def onto(T, src):
    out = []
    for r in src:
        g = T.get((r["player_id"], r["prop"]))
        if g:
            t = min(g, key=lambda x: abs(float(x["line"]) - r["line"]))
            out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"], line=float(t["line"]), blend=r["blend"], ph=r["ph"], home=r.get("home")))
    return out


def board_unders(conn, day, guard=True):
    """every Under on Betr's board of the day (all of the day's archived snapshots, newest line first), mapped to a player id; no model probability is needed at Betr's line (the research mapped the
    PrizePicks / Underdog lists onto the board the same way); the game must not have started before the board was read"""
    import betr_live_slip_engine as BE
    rows = conn.execute("""SELECT nm.player_id::text, b.player, b.market_key, b.side, b.line::float, b.event_id, b.snapshot_ts
                           FROM nba_market.board_snapshots b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                           WHERE b.bookmaker IN ('betr', 'betr_us_dfs') AND b.game_date = %s AND b.market_key = ANY(%s) AND lower(left(b.side, 1)) NOT IN ('o', 'm', 'h')
                           ORDER BY b.snapshot_ts DESC""", (day, list(BE.RSD.MK))).fetchall()
    if not rows:
        return [], None
    last = max(r[6] for r in rows)
    evs = dict(conn.execute("""SELECT DISTINCT ON (nm.player_id) nm.player_id::text, b.event_id FROM nba_market.board_snapshots b
                               JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                               WHERE b.bookmaker = 'underdog' AND b.game_date = %s ORDER BY nm.player_id, b.snapshot_ts DESC""", (day,)).fetchall())
    tip = dict(conn.execute("SELECT event_id, min(commence_time) FROM nba_market.board_snapshots WHERE bookmaker = 'underdog' AND game_date = %s GROUP BY 1", (day,)).fetchall())
    tm = BE.SL.teams_of(conn, {r[0] for r in rows}, day)
    out, seen = [], set()
    for pid, nm, mkey, side, line, bev, ts in rows:
        if mkey.endswith("_alternate") or mkey not in BE.RSD.MK:
            continue
        prop = BE.RSD.MK[mkey]
        if prop not in SINGLE or (pid, prop) in seen:
            continue
        seen.add((pid, prop))
        ev = evs.get(pid) or bev
        t0 = tip.get(evs.get(pid))
        if guard and t0 is not None and t0 <= last:
            continue
        out.append({"player": nm, "player_id": pid, "prop": prop, "side": "Under", "line": line, "event_id": ev, "team": tm.get(pid)})
    return out, last


def build(conn, day, gc=1, diff=0):
    import betr_live_slip_engine as BE
    legs = board_unders(conn, day)[0]
    notes = []
    T = defaultdict(list)
    for l in legs:
        if str(l["side"]).lower().startswith("u") and l["prop"] in SINGLE:
            T[(str(l["player_id"]), l["prop"])].append(l)
    U, P = lists(conn, day)
    notes.append(f"{day}: Betr board Unders {sum(len(v) for v in T.values())}; Underdog list {len(U)}, PrizePicks list {len(P)}")
    S = {k: onto(T, v) for k, v in sources(U, P).items()}
    cap = FL.CAPS["betr"]; N = FL.SLOTS["betr"]; cnt = defaultdict(int); plan = []
    for sg in [s for s in FL.FINAL["set"] if s["app"] == "betr"]:
        if len(plan) >= N:
            break
        c = [r for r in S.get(sg["rk"], []) if pool_fn(sg["layer"])(r)]
        g_ = sg["gcap"] if sg["gcap"] > 0 else gc; d_ = sg["pdif"] if sg["pdif"] >= 0 else diff
        s_ = take(c, sg["k"], g_, bool(d_), sg["start"])
        if not s_:
            notes.append(f"betr: {sg['code']} could not be built from today's board"); continue
        if any(cnt[r["player_id"]] >= cap for r in s_):
            notes.append(f"betr: {sg['code']} skipped - a player is already in {cap} slip"); continue
        for r in s_:
            cnt[r["player_id"]] += 1
        rows = [dict(pid=r["player_id"], prop=r["prop"], line=float(r["line"]), game=r["game_id"], team=r.get("team"), blend=float(r["blend"]), ph=r["ph"], side="Under", leg=dict(r, p=float(r.get("p") or r["blend"]))) for r in s_]
        used = {r["player_id"] for r in s_}
        bank = [dict(pid=r["player_id"], prop=r["prop"], line=float(r["line"]), game=r["game_id"], team=r.get("team"), blend=float(r["blend"]), ph=r["ph"], side="Under", leg=dict(r)) for r in c if r["player_id"] not in used][:12]
        plan.append((f"H_{sg['code']}_{sg['k']}{'p' if sg['st'] == 'power' else 'd'}", sg["k"], sg["st"], rows, bank, sg))
    return plan, notes


def write(conn, day, plan):
    import betr_live_slip_engine as BE
    import next_legs_store as NL
    rj = BE.rules(conn)
    last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.board_snapshots WHERE bookmaker = 'betr' AND game_date = %s", (day,)).fetchone()[0]
    conn.execute("DELETE FROM nba_score.betr_live_slips WHERE game_date = %s AND strategy LIKE 'H\\_NB%%' AND graded_at IS NULL", (day,))
    conn.execute("UPDATE nba_score.betr_live_slips SET status = 'shadow', stake = 0 WHERE game_date = %s AND strategy NOT LIKE 'H\\_NB%%' AND status <> 'shadow' AND graded_at IS NULL", (day,))
    n = 0
    for name, k, st, rows, bank, sg in plan:
        structure = "perfect" if st == "power" else "dynamic"
        lj = [{"player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "side": "Under", "line": r["line"], "factor": 1.0, "p": round(float(r["leg"]["p"]), 4),
               "pf": round(float(r["leg"].get("pf") or .5), 4), "team": r["leg"].get("team"), "event_id": r["leg"].get("event_id"), "tier": "REGULAR"} for r in rows]
        mult = BE.top_multiplier(k, lj, rj, structure)
        conn.execute("""INSERT INTO nba_score.betr_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                        VALUES (%s,%s,%s,%s,1,%s,1,'live',%s,%s) ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, name, k, structure, json.dumps(lj), mult, last))
        NL.store(conn, day, name, 1, [dict(b["leg"]) for b in bank], exclude_players={r["leg"]["player"] for r in rows})
        n += 1
    return n


def check(conn, dates):
    """certification: Betr's strategies rebuilt on past slates from the stored PrizePicks / Underdog lists against the research's own slips; every (game cap, different-prop) variant tried,
    the variant that reproduces the research is the one the research used (ua3 does not store them for Betr)"""
    import research_best as RB
    ref = {}
    for sg in [s for s in FL.FINAL["set"] if s["app"] == "betr"]:
        r = conn.execute("""SELECT days FROM nba_score.ua3 WHERE tag LIKE '%%-n' AND app = 'betr' AND rk = %s AND layer = %s AND st = %s AND k = %s AND start = %s AND nsl = %s LIMIT 1""",
                         (sg["rk"], sg["layer"], sg["st"], sg["k"], sg["start"], sg["nsl"])).fetchone()
        ref[sg["code"]] = RB.parse(r[0]) if r else None
    log = FL.log
    log("BC|reference rows: " + ", ".join(f"{c} {'yes' if v is not None else 'NO'}" for c, v in ref.items()))
    tot = defaultdict(lambda: [0, 0])
    for gd in dates:
        U, P = lists(conn, gd)
        if not P:
            log(f"BC|{gd}: no stored lists"); continue
        import betr_live_slip_engine as BE
        played = {str(r[0]) for r in conn.execute("SELECT nba_player_id FROM nba_stats.player_game_log WHERE game_date = %s AND min > 0", (gd,)).fetchall()}
        U = [r for r in U if str(r["player_id"]) in played]; P = [r for r in P if str(r["player_id"]) in played]      # the research only holds graded (played) legs: hindsight, check mode only
        legs = [l for l in board_unders(conn, gd, guard=False)[0] if str(l["player_id"]) in played]
        if os.environ.get("FL_RLIST") == "1":                # the research's own lists (v_legs_honest blend / model, leg_card_v2 score, game ids from the box scores): isolates Betr's logic from the lists
            import pandas as pd
            gm = dict(conn.execute("SELECT nba_player_id::text, game_id::text FROM nba_stats.player_game_log WHERE game_date = %s AND min > 0", (gd,)).fetchall())
            hm = dict(conn.execute("SELECT nba_player_id::text, (matchup LIKE '%%vs.%%')::int::float8 FROM nba_stats.player_game_log WHERE game_date = %s AND min > 0", (gd,)).fetchall())
            q = pd.read_sql("""SELECT v.app, v.player_id, v.prop, v.line::float8 line, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph, l.score::float8 score
                               FROM nba_score.v_legs_honest v LEFT JOIN nba_score.leg_card_v2 l ON l.app = v.app AND l.game_date = v.game_date AND l.player_id = v.player_id AND l.prop = v.prop AND l.line = v.line AND l.side = 'Under'
                                    AND ((l.app = 'underdog' AND l.leg_mult = 1) OR (l.app = 'prizepicks' AND l.kind = 'standard'))
                               WHERE v.game_date = %s AND v.is_under AND v.kind = 'regular' AND v.app IN ('underdog', 'prizepicks') AND v.p_blend IS NOT NULL ORDER BY v.p_blend DESC""", conn, params=(gd,))
            q["game_id"] = [gm.get(str(x), "g" + str(x)) for x in q["player_id"]]; q["home"] = [hm.get(str(x)) for x in q["player_id"]]
            U = q[q["app"] == "underdog"].to_dict("records"); P = q[(q["app"] == "prizepicks") & (q["line"] % 1 != 0)].to_dict("records")
            cols = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
            stt = {(str(r[0])): dict(zip(cols.values(), r[1:])) for r in conn.execute("SELECT nba_player_id::text, pts::float8, reb::float8, ast::float8, fg3m::float8, stl::float8, blk::float8, tov::float8 FROM nba_stats.player_game_log WHERE game_date = %s AND min > 0", (gd,)).fetchall()}
            legs = [l for l in legs if (stt.get(str(l["player_id"])) or {}).get(cols[l["prop"]]) != l["line"]]      # the research drops pushes (hindsight)
            for l in legs:
                l["game_id"] = gm.get(str(l["player_id"]), "g" + str(l["player_id"])); l["home"] = hm.get(str(l["player_id"]))
        T = defaultdict(list)
        for l in legs:
            if str(l["side"]).lower().startswith("u") and l["prop"] in SINGLE:
                T[(str(l["player_id"]), l["prop"])].append(l)
        S = {k: onto(T, v) for k, v in sources(U, P).items()}
        for sg in [s for s in FL.FINAL["set"] if s["app"] == "betr"]:
            rd = ref.get(sg["code"])
            if not rd or gd not in rd:
                continue
            want = {frozenset(str(x) for x in legs_) for _, legs_ in rd[gd]}
            c = [r for r in S.get(sg["rk"], []) if pool_fn(sg["layer"])(r)]
            for gc in (1, 2):
                for df_ in (0, 1):
                    s_ = take(c, sg["k"], gc, bool(df_), sg["start"])
                    got = {frozenset(r["player_id"] for r in s_)} if s_ else set()
                    tot[(sg["code"], gc, df_)][0] += int(got == want); tot[(sg["code"], gc, df_)][1] += 1
                    if gc == 1 and df_ == 0 and got != want and sg["code"] in ("NB1", "NB2", "NB7", "NB9"):
                        pool_ids = [(r["player_id"], r["prop"], r["line"]) for r in c][:8]
                        wp = [x for g_ in want for x in g_]
                        pos = {x: ([i for i, r in enumerate(c) if r["player_id"] == x] or ["absent"], [(r["prop"], r["line"]) for r in c if r["player_id"] == x][:1]) for x in wp}
                        log(f"BCW|{gd} {sg['code']} research players in my pool: {pos}")
                        log(f"BCD|{gd} {sg['code']} start {sg['start']} k {sg['k']}: mine {sorted(x for g_ in got for x in g_)} research {sorted(x for g_ in want for x in g_)} | my pool top12 {pool_ids} | on-board source rows {len(S.get(sg['rk'], []))} pool {len(c)}")
    for (code, gc, df_), (a, b) in sorted(tot.items()):
        log(f"BC|{code} gcap {gc} diff {df_}: {a}/{b} days identical to the research")


if __name__ == "__main__":
    import os
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        check(conn, [d for d in (os.environ.get("FL_DATES") or "").split(",") if d])
