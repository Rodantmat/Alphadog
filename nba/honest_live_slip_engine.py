#!/usr/bin/env python3
"""
THE HONEST-REBUILD STRATEGIES, LIVE (owner 2026-11-19 23:11 PT: "Go ahead and disable the current strategies and wire the new ones. We go with all elected.
Stake is the same $10 for all but betr at $5." No caps. NBA_HONEST_REBUILD.md sections 8z / 8aa / 8ab).

WHAT IT BUILDS, every slate, from the SAME legs and in the SAME order as the certified research (research_pass10.py, no cap):
  the pool      regular single-stat UNDERS of the app's fresh window board, one leg a player and a game inside a slip
  the ranking   blend  = logistic on [model chance, sportsbook chance at the exact line, price]  (weights of the month from the walk-forward fit)
                second = the model's baseline chance alone (no sportsbook input)
                The model chance live is production's own baseline_hp for the leg (nba_score.final_hp) - the live twin of the honest history's number.
  Underdog (2-pick Standard)   U1 top 2 by blend | U2 top 2 by second | U3 PrizePicks' order played on Underdog | U4 top 2 rebounds | U5 top 2 home players
  PrizePicks (Flex)            P1 5 different props | P2 5, lines under 10 | P3 top 5 | P4 5 home players | P5 top 6 | P6 6 different props | P7 6 bench roles
                               P9 top 4 | P10 3-pick POWER top 3 (half-point lines only on PrizePicks)
  Sleeper / Fliff / Betr       the qualified legs (Underdog top 2 + PrizePicks top 5, best first) as that app's own Under on its own line and price:
                               S1 2-pick Max (Underdog's top 2) | S4 4-pick Flex | S5 4-pick Max | S6 5-pick Flex
                               F1 2-pick (Underdog's top 2) | F4 4-pick | F5 5-pick
                               B1 3-pick Perfect | B5 3-pick Perfect from PrizePicks' top 5
WHAT IT DOES TO THE OLD STRATEGIES: nothing is deleted. On an app this engine serves, every other strategy's slip of the day is set to a not-played status
(PrizePicks 'placed_shadow', Underdog 'shadow', Sleeper / Fliff / Betr 'shadow' with stake 0): recorded and graded as paper, never shown as PLAY.
GATE: nba_config.classification_config['honest_live'] {enabled, apps, weights}. enabled = false -> this engine does nothing and the old strategies play as before.
Env: DATABASE_URL, HL_DATE (default today PT), HL_APPS (comma list; default the gate's apps), HL_DRY = 1 (print, write nothing; works on past dates).
"""
import datetime as dt
import json
import math
import os
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PT = ZoneInfo("America/Los_Angeles")
SINGLE = ("points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers")
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals",
      "player_blocks": "blocks", "player_turnovers": "turnovers"}
# walk-forward blend weights of the month [const, model, model missing, book, book missing, price, under] (research_leg_model_h.py, run lm5, month 2026-11)
WEIGHTS = {"underdog": [-0.174, 0.093, -0.148, 0.298, -0.054, 0.666, 0.085], "prizepicks": [-0.178, 0.105, -0.020, 0.205, -0.026, 0.923, 0.071]}
BREAK_EVEN = {"underdog": 1 / 1.8708, "prizepicks": 0.542}
ALL_APPS = ("prizepicks", "underdog", "sleeper", "fliff", "betr")
HALF_ONLY = True
NAMES = {"U1": "U1 top 2 Unders, main ranking", "U2": "U2 top 2 Unders, model-only ranking", "U3": "U3 PrizePicks' top Unders on Underdog", "U4": "U4 top 2 rebounds Unders",
         "U5": "U5 top 2 Unders, home players", "P1": "H_P1_5flex_props", "P2": "H_P2_5flex_under10", "P3": "H_P3_5flex_top5", "P4": "H_P4_5flex_home", "P5": "H_P5_6flex_top6",
         "P6": "H_P6_6flex_props", "P7": "H_P7_6flex_bench", "P9": "H_P9_4flex_top4", "P10": "H_P10_3power_top3", "S1": "H_S1_2max", "S4": "H_S4_4flex", "S5": "H_S5_4max",
         "S6": "H_S6_5flex", "F1": "H_F1_2max", "F4": "H_F4_4max", "F5": "H_F5_5max", "B1": "H_B1_3perfect", "B5": "H_B5_3perfect_pp"}


def log(m):
    print(m, flush=True)


def lg(p):
    p = min(max(float(p), 1e-4), 1 - 1e-4); return math.log(p / (1 - p))


def gate(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key = 'honest_live'").fetchone()
    return (r[0] if isinstance(r[0], dict) else json.loads(r[0])) if r else {}


def first(rows, k):
    """up to k rows in order, one a player and a game"""
    out, games, players = [], set(), set()
    for r in rows:
        if r["pid"] in players or r["game"] in games:
            continue
        out.append(r); players.add(r["pid"]); games.add(r["game"])
        if len(out) == k:
            break
    return out


def pick(rows, k, diff_prop=False, skip=()):
    """exactly k rows in order: one a player and a game (and a prop if diff_prop), none of `skip`; None if the list runs out"""
    out, games, players, props = [], set(), set(skip), set()
    for r in rows:
        if r["pid"] in players or r["game"] in games or (diff_prop and r["prop"] in props):
            continue
        out.append(r); players.add(r["pid"]); games.add(r["game"]); props.add(r["prop"])
        if len(out) == k:
            return out
    return None


def context(conn, day, pids):
    import ud_live_slip_engine as UD
    import live_slip_engine as LSE
    team = {str(k): str(v) for k, v in UD.leg_team(conn, day, list(pids)).items() if v is not None}
    game, home = {}, set()
    for h, a in conn.execute("SELECT home_team_id::text, away_team_id::text FROM nba_calendar.slate_games WHERE game_date = %s", (day,)).fetchall():
        game[h] = h; game[a] = h; home.add(h)
    started = {str(x) for x in LSE.started_team_ids(conn, day)}
    role = dict(conn.execute("SELECT player_id::text, max(role_tier) FROM nba_score.baseline_history WHERE game_date = %s AND period = 'FULL' GROUP BY 1", (day,)).fetchall())
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    book = {}
    for nm, mk, line, po in conn.execute("""SELECT nba_ref.norm_name(player), market_key, line::float8, p_over_mean::float8 FROM nba_market.market_consensus
                                            WHERE snapshot_label = 'window' AND game_date = %s AND p_over_mean IS NOT NULL""", (day,)).fetchall():
        if mk in MK and nm in ids:
            book.setdefault((ids[nm], MK[mk], round(float(line), 2)), 1 - float(po))
    return dict(team=team, game=game, home=home, started=started, role=role, book=book)


def rank_rows(app, native, ctx, w):
    """native Under legs of the app (its engine's own dicts, 'score' = the model's baseline chance of the Under) -> rows with the blend, best first"""
    rows = []
    for l in native:
        pid = str(l["player_id"]); t = ctx["team"].get(pid); g = ctx["game"].get(t)
        if t is None or g is None or t in ctx["started"]:
            continue
        ph = float(l["score"]); pb = ctx["book"].get((pid, l["prop"], round(float(l["line"]), 2)))
        z = w[0] + w[1] * lg(ph) + w[3] * lg(pb if pb is not None else .5) + w[4] * (pb is None) + w[5] * lg(BREAK_EVEN[app]) + w[6]
        rows.append(dict(pid=pid, prop=l["prop"], line=float(l["line"]), ph=ph, pb=pb, blend=1 / (1 + math.exp(-z)), team=t, game=g, home=t in ctx["home"],
                         starter="START" in str(ctx["role"].get(pid) or "").upper(), leg=l))
    rows.sort(key=lambda r: (-r["blend"], r["pid"], r["prop"], r["line"]))
    best = {}
    for r in rows:                                           # one line a player and prop: the best by the blend
        best.setdefault((r["pid"], r["prop"]), r)
    return [r for r in rows if best[(r["pid"], r["prop"])] is r]


def load_sources(conn, day, weights):
    import live_slip_engine as LSE
    import ud_live_slip_engine as UD
    pp = [l for l in LSE.load_board_legs_live(conn, day, "window") if l["rank_key"] == "baseline_hp" and l["tier"] == "R" and str(l["side"]).lower().startswith("u")
          and l["prop"] in SINGLE and l["score"] is not None]
    # owner 2026-11-20 00:00 PT ("if brings ROI up, bring it in"): PrizePicks takes half-point lines only - a whole-number line can push and a push drops the
    # slip a size (pass 13: 3-pick Power +17% -> +27%, 4-pick Flex +10% -> +24%, 5-pick Flex +24% -> +39% as placed). Switch: honest_live.pp_half_point_only.
    if HALF_ONLY:
        pp = [l for l in pp if abs(float(l["line"]) % 1) > 1e-9]
    ud = [l for l in UD.load_legs(conn, day) if l["rank_key"] == "baseline_hp" and l["tier"] == "R" and str(l["side"]).lower().startswith("u")
          and l["prop"] in SINGLE and l["score"] is not None]
    ctx = context(conn, day, {str(l["player_id"]) for l in pp + ud})
    return rank_rows("underdog", ud, ctx, weights["underdog"]), rank_rows("prizepicks", pp, ctx, weights["prizepicks"]), ctx


def load_target(conn, day, app):
    """the target app's own Under legs by (player, prop): Sleeper / Fliff with their multiplier, Betr table-priced"""
    out = {}
    if app in ("sleeper", "fliff"):
        import roi_app_live_slip_engine as RA
        legs = RA.load_legs(conn, day, app)
    else:
        import betr_live_slip_engine as BE
        legs = BE.board_legs(conn, day)[0]
    for l in legs:
        if str(l["side"]).lower().startswith("u") and l["prop"] in SINGLE and l.get("player_id") is not None:
            out.setdefault((str(l["player_id"]), l["prop"]), []).append(l)
    return out


def onto(target, src, ctx):
    """the source rows (in order) as the target app's own legs: the same player and prop, the line nearest to the source's"""
    out = []
    for r in src:
        g = target.get((r["pid"], r["prop"]))
        if g and r["team"] not in ctx["started"]:
            t = min(g, key=lambda x: (abs(float(x["line"]) - r["line"]), float(x["line"])))
            out.append(dict(pid=r["pid"], prop=r["prop"], line=float(t["line"]), game=r["game"], team=r["team"], blend=r["blend"], ph=r["ph"], leg=t))
    return out


def build(conn, day, apps, weights=None):
    """-> {app: [(code, k, structure, rows of the slip, the strategy's ranked candidates)]}, notes"""
    U, P, ctx = load_sources(conn, day, weights or WEIGHTS)
    notes = [f"{day}: Underdog regular single-stat Unders {len(U)}, PrizePicks {len(P)}; sportsbook number at the exact line on {sum(r['pb'] is not None for r in U)} / {sum(r['pb'] is not None for r in P)}"]
    plan = {}

    def add(app, code, k, st, cand, **kw):
        s = pick(cand, k, **kw)
        if s is None:
            notes.append(f"{code}: not enough qualifying legs ({len(cand)} candidates) - no slip"); return
        plan.setdefault(app, []).append((code, k, st, s, cand))

    if "underdog" in apps:
        ukey = {}
        for r in U:
            ukey.setdefault((r["pid"], r["prop"]), r)
        add("underdog", "U1", 2, "standard", U)
        add("underdog", "U2", 2, "standard", sorted(U, key=lambda r: (-r["ph"], r["pid"], r["prop"], r["line"])))
        add("underdog", "U3", 2, "standard", [ukey[(r["pid"], r["prop"])] for r in P if (r["pid"], r["prop"]) in ukey])
        add("underdog", "U4", 2, "standard", [r for r in U if r["prop"] == "rebounds"])
        add("underdog", "U5", 2, "standard", [r for r in U if r["home"]])
    if "prizepicks" in apps:
        add("prizepicks", "P1", 5, "flex", P, diff_prop=True)
        add("prizepicks", "P2", 5, "flex", [r for r in P if r["line"] < 10])
        add("prizepicks", "P3", 5, "flex", P)
        add("prizepicks", "P4", 5, "flex", [r for r in P if r["home"]])
        add("prizepicks", "P5", 6, "flex", P)
        add("prizepicks", "P6", 6, "flex", P, diff_prop=True)
        add("prizepicks", "P7", 6, "flex", [r for r in P if not r["starter"]])
        add("prizepicks", "P9", 4, "flex", P)
        add("prizepicks", "P10", 3, "power", P)             # P8 (6-pick, second team) retired 2026-11-20: flat under the half-point rule; P10 = 3-pick Power, top 3
    tight = sorted(first(U, 2) + first(P, 5), key=lambda r: (-r["blend"], r["pid"]))
    for app, specs in (("sleeper", (("S1", 2, "max", "u2"), ("S4", 4, "flex", "t"), ("S5", 4, "max", "t"), ("S6", 5, "flex", "t"))),
                       ("fliff", (("F1", 2, "max", "u2"), ("F4", 4, "max", "t"), ("F5", 5, "max", "t"))),
                       ("betr", (("B1", 3, "perfect", "t"), ("B5", 3, "perfect", "p5")))):
        if app not in apps:
            continue
        try:
            tg = load_target(conn, day, app)
        except Exception as e:  # noqa: BLE001 - one app's board never costs the others
            conn.rollback(); notes.append(f"{app}: board not readable ({type(e).__name__}: {str(e)[:120]}) - no slip"); continue
        notes.append(f"{app}: {len(tg)} player-props with an Under on its board")
        for code, k, st, src in specs:
            cand = onto(tg, tight, ctx) if src == "t" else onto(tg, first(U, 10), ctx)[:2] if src == "u2" else onto(tg, first(P, 10), ctx)[:5]
            add(app, code, k, st, cand)
    return plan, notes


def describe(app, code, k, st, s):
    return f"{code} {k}-pick {st}: " + "; ".join(f"{r['leg'].get('player')} {r['prop']} Under {r['line']:g}" + (f" x{float(r['leg']['m']):.2f}" if r["leg"].get("m") and app in ("sleeper", "fliff") else "")
                                                 + f" ({100 * r['blend']:.1f}%)" for r in s)


def write(conn, day, plan, commit=True):
    import next_legs_store as NL
    n = 0
    for app, slips in plan.items():
        if app == "prizepicks":
            conn.execute("DELETE FROM nba_score.live_slips WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND hits IS NULL", (day,))
            conn.execute("UPDATE nba_score.live_slips SET status = 'placed_shadow' WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status NOT LIKE '%%shadow%%' AND status <> 'dup' AND hits IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"cell": f"{r['prop']}_R", "player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "tier": "R", "side": "Under", "line": r["line"], "factor": 1.0,
                       "event_id": r["leg"].get("event_id"), "p": round(r["blend"], 4)} for r in s]
                conn.execute("""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status, stake_weight) VALUES (%s,%s,1,%s,%s,%s,'placed',1)
                                ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, NAMES[code], json.dumps(lj), k, st))
                conn.execute("""INSERT INTO nba_score.live_strategy_state (strategy, state, live_cap, hurdles, updated_at) VALUES (%s, 'active', 1, '{}', now())
                                ON CONFLICT (strategy) DO UPDATE SET state = 'active', updated_at = now()""", (NAMES[code],))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"], tier="R", factor=1.0, p=round(r["blend"], 4)) for r in cand], exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app == "underdog":
            conn.execute("DELETE FROM nba_score.ud_live_slips WHERE game_date = %s AND portfolio = 'H' AND hits IS NULL", (day,))
            conn.execute("UPDATE nba_score.ud_live_slips SET status = 'shadow' WHERE game_date = %s AND portfolio <> 'H' AND status NOT LIKE 'shadow%%' AND hits IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"cell": f"H:{code}", "player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "tier": "R", "side": "Under", "line": r["line"], "factor": 1.0,
                       "event_id": r["leg"].get("event_id"), "p_hat": round(r["blend"], 4)} for r in s]
                conn.execute("""INSERT INTO nba_score.ud_live_slips (game_date, portfolio, composition, size, structure, k, legs_json, stake, status, absence_flag)
                                VALUES (%s,'H',%s,%s,%s,1,%s,1.0,'live',false)""", (day, NAMES[code], k, st, json.dumps(lj)))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"], tier="R", factor=1.0, p=round(r["blend"], 4)) for r in cand], exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app in ("sleeper", "fliff"):
            import roi_app_live_slip_engine as RA
            import sleeper_live_slip_engine as SL
            tbl = RA.TABLE[app]; pr = SL.pricing(conn)
            conn.execute(f"DELETE FROM {tbl} WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND graded_at IS NULL", (day,))
            conn.execute(f"UPDATE {tbl} SET status = 'shadow', stake = 0 WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status <> 'shadow' AND graded_at IS NULL", (day,))
            tm = SL.teams_of(conn, {r["pid"] for _c, _k, _s, s, _cand in slips for r in s}, day)
            for code, k, st, s, cand in slips:
                legs = [dict(r["leg"], team=tm.get(r["pid"]), roi=0.0, score_roi=0.0) for r in s]
                if app == "fliff":
                    RA.insert(conn, app, day, NAMES[code], (None, None, None, None, None, k, st), 1, legs, pr)
                else:                                        # Sleeper: Max = the product x the size bonus; Flex = Sleeper's own tiers
                    ms = [float(l["m"]) for l in legs]
                    lj = [{"player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"], "p": round(float(l["p"]), 4),
                           "team": l.get("team"), "event_id": l["event_id"], "tier": "R", "kind": l.get("kind") or "main"} for l in legs]
                    tiers = SL.flex_tiers(ms, pr[1], pr[2]) if st == "flex" else None
                    model = tiers[k] if tiers else math.prod(ms) * pr[0].get(k, 1.0)
                    conn.execute("""INSERT INTO nba_score.sleeper_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, flex_tiers)
                                    VALUES (%s,%s,%s,%s,1,%s,1,'live',%s,%s)
                                    ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, status = EXCLUDED.status,
                                      model_multiplier = EXCLUDED.model_multiplier, flex_tiers = EXCLUDED.flex_tiers, built_at = now()
                                    WHERE nba_score.sleeper_live_slips.graded_at IS NULL""",
                                 (day, NAMES[code], k, st, json.dumps(lj), round(float(model), 4), json.dumps(tiers) if tiers else None))
                NL.store(conn, day, NAMES[code], 1, [dict(r["leg"]) for r in cand], exclude_players={r["leg"]["player"] for r in s})
                n += 1
        elif app == "betr":
            import betr_live_slip_engine as BE
            rj = BE.rules(conn)
            last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.board_snapshots WHERE bookmaker = 'betr' AND game_date = %s", (day,)).fetchone()[0]
            conn.execute("DELETE FROM nba_score.betr_live_slips WHERE game_date = %s AND strategy LIKE 'H\\_%%' AND graded_at IS NULL", (day,))
            conn.execute("UPDATE nba_score.betr_live_slips SET status = 'shadow', stake = 0 WHERE game_date = %s AND strategy NOT LIKE 'H\\_%%' AND status <> 'shadow' AND graded_at IS NULL", (day,))
            for code, k, st, s, cand in slips:
                lj = [{"player": r["leg"]["player"], "player_id": r["pid"], "prop": r["prop"], "side": "Under", "line": r["line"], "factor": 1.0, "p": round(float(r["leg"]["p"]), 4),
                       "pf": round(float(r["leg"].get("pf") or .5), 4), "team": r["leg"].get("team"), "event_id": r["leg"].get("event_id"), "tier": "REGULAR"} for r in s]
                mult = BE.top_multiplier(k, lj, rj, "perfect")
                conn.execute("""INSERT INTO nba_score.betr_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                                VALUES (%s,%s,%s,'perfect',1,%s,1,'live',%s,%s) ON CONFLICT (game_date, strategy, k) DO NOTHING""", (day, NAMES[code], k, json.dumps(lj), mult, last))
                n += 1
    if commit:
        conn.commit()
    return n


def main():
    import psycopg
    ds = (os.environ.get("HL_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else dt.datetime.now(PT).date()
    dry = os.environ.get("HL_DRY") == "1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = '240s'")
        g = gate(conn)
        global HALF_ONLY
        HALF_ONLY = g.get("pp_half_point_only", True) is not False
        if not g.get("enabled") and not dry and os.environ.get("HL_TEST") != "1":
            log(f"HONEST_LIVE|disabled (classification_config honest_live.enabled) - nothing built for {day}; the other engines' slips stand"); return
        want = [a.strip() for a in (os.environ.get("HL_APPS") or ",".join(g.get("apps") or ALL_APPS)).split(",") if a.strip()]
        apps = [a for a in want if a in (g.get("apps") or ALL_APPS) or dry or os.environ.get("HL_TEST") == "1"]
        weights = dict(WEIGHTS)
        try:                                                 # the latest month the nightly walk-forward fit stored (never a later month than the slate's)
            for a_, w_ in conn.execute("""SELECT DISTINCT ON (app) app, weights FROM nba_score.honest_blend_weights WHERE month <= %s ORDER BY app, month DESC""", (day.strftime("%Y-%m"),)).fetchall():
                w_ = w_ if isinstance(w_, list) else json.loads(w_)
                if a_ in weights and len(w_) == 7:
                    weights[a_] = [float(x) for x in w_]
        except Exception:  # noqa: BLE001
            conn.rollback()
        weights.update(g.get("weights") or {})
        log(f"HONEST_LIVE|blend weights: {weights}")
        plan, notes = build(conn, day, apps, weights)
        for x in notes:
            log(f"HONEST_LIVE|{x}")
        for app in apps:
            for code, k, st, s, _cand in plan.get(app, []):
                log(f"HONEST_LIVE|{day} {app}: {describe(app, code, k, st, s)}")
        if dry:
            conn.rollback(); log("HONEST_LIVE|dry run - nothing written"); return
        # an app whose slips cannot be built keeps what the other engines built: old strategies are demoted only where this engine wrote slips
        if os.environ.get("HL_TEST") == "1":                 # every statement of the write path, then rolled back: nothing is kept
            n = write(conn, day, plan, commit=False)
            for t_ in ("live_slips", "ud_live_slips", "sleeper_live_slips", "fliff_live_slips", "betr_live_slips"):
                c_ = "portfolio = 'H'" if t_ == "ud_live_slips" else "strategy LIKE 'H\\_%%'"
                log(f"HONEST_LIVE|test {t_}: " + str(conn.execute(f"SELECT count(*), min(status), max(structure), max(size) FROM nba_score.{t_} WHERE game_date = %s AND {c_}", (day,)).fetchone()))
            conn.rollback(); log(f"HONEST_LIVE|write-path test: {n} slips written and rolled back"); return
        n = write(conn, day, plan)
        log(f"HONEST_LIVE|{day}: {n} slips written on {', '.join(a for a in apps if plan.get(a)) or 'no app'}")


if __name__ == "__main__":
    main()
