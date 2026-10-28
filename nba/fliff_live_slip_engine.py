#!/usr/bin/env python3
"""
FLIFF LIVE SLIPS (owner 2026-10-26 14:22 PT: Fliff "the number 2 is a pretty decent one. You can deploy that"). One Fliff Pick'Em
2-pick Max a slate, F_T1_2max: Underdog portfolio T unit T1's qualified legs (doc rule 'weighted:rebounds_B1_U', distinct players) priced
at FLIFF PICK'EM's own main line and multiplier (nba_market.fliff_pickem_board, fliff_pickem_board.py - public feed, no login), our
final_hp >= 0.56, Fliff multiplier <= 1.85, ordered by final_hp, the top leg skipped, one leg per game, two teams.
EVIDENCE (research_sleeper_small ST_APP=fliff, runs 40397712309 / 40397717134): 2-pick Max +44.0% (2024-25 +46 / 2025-26 +41) at
Fliff's sportsbook margin, +34.9% (+37 / +32) at the Pick'Em margin measured 2026-10-26 (1/1.85 + 1/1.80 = 1.096); cashed 43-46%;
max drawdown 7.0-10.2u; 184-199 slips. First live slip 2026-10-26 (research_fliff_today run 40407797503).
PRICING (Fliff Pick'Em contest rules v2.0, getfliff.com/fliff-pickem-contest-rules, 2026-10-05): Max pays the product of the Selection
Multipliers (the guaranteed Contest Score; any extra pool share is not counted); a void drops the pick, a 2-pick with a void (or every
pick void) is refunded. SIDES: option_type 0 = Over, verified against the sportsbooks every pick (323 / 326 cards on 2026-10-26); the
pick stops if the check does not hold.
GATE: classification_config['fliff_live'] (enabled, play, floor, mcap, skip). Rows: nba_score.fliff_live_slips. Nothing is sent to
Fliff. Modes: FL_MODE=pick (FL_DATE or today PT) | grade (FL_DATE or every ungraded slate). Env: DATABASE_URL.
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "fliff")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import sleeper_live_slip_engine as SL                # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
DDL = """CREATE TABLE IF NOT EXISTS nba_score.fliff_live_slips (
  game_date date NOT NULL, strategy text NOT NULL, size int NOT NULL, structure text NOT NULL, k int NOT NULL DEFAULT 1,
  legs_json jsonb NOT NULL, stake numeric NOT NULL DEFAULT 1, status text NOT NULL, model_multiplier numeric, board_ts timestamptz,
  built_at timestamptz NOT NULL DEFAULT now(), graded_at timestamptz, hits int, payout numeric, profit numeric,
  PRIMARY KEY (game_date, strategy, k))"""
STRATEGY = "F_T1_2max"


def floor2(x):
    """Fliff shows (and pays) the Max multiplier cut to 2 decimals: owner's entry 2026-10-26 14:55 PT, 1.75 x 1.85 = 3.2375 -> 3.23x,
    $2 -> $6.46"""
    return int(x * 100 + 1e-6) / 100.0


def board(conn, day):
    last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.fliff_pickem_board WHERE game_date = %s", (day,)).fetchone()[0]
    if last is None:
        return None, None, "no Fliff Pick'Em board captured for the slate"
    fb = conn.execute("""SELECT b.player, nm.player_id::text, b.prop, b.line::float, b.option_type, b.multiplier::float, b.fliff_game, b.matchup, b.tip_utc
                         FROM nba_market.fliff_pickem_board b LEFT JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                         WHERE b.game_date = %s AND b.snapshot_ts = %s""", (day, last)).fetchall()
    _sl, mk, _ml, _a, _b = RSD.load(conn, day)
    by = {}
    for nm, pid, prop, line, ot, m, g, match, tip in fb:
        by.setdefault((pid, prop, line), {})[ot] = m
    agree = n = 0
    for (pid, prop, line), s in by.items():
        po = mk.get((pid, prop, "Over", line))
        if pid and po and 0 in s and 1 in s and s[0] != s[1]:
            pov = sum(po) / len(po)
            if abs(pov - 0.5) > 0.03:
                n += 1
                agree += int((pov > 0.5) == (s[0] < s[1]))
    if n < 20 or agree < 0.9 * n:
        return None, last, f"side check failed (option_type 0 = Over on {agree}/{n} leaning cards) - no slip"
    fl = {}
    for nm, pid, prop, line, ot, m, g, match, tip in fb:
        if pid:
            fl[(pid, prop, "Over" if ot == 0 else "Under")] = (nm, line, m, g, match, tip)
    return fl, last, f"board {len(fb)} sides, side check {agree}/{n}"


def build(conn, day, cfg):
    fl, last, note = board(conn, day)
    if fl is None:
        return None, last, note
    legs, rows = AF.load_ud(conn, day, {})
    if not legs:
        return None, last, "no Underdog window board / final_hp for the slate"
    c, gc = ST.ud_lists(rows, legs)["T1"]
    tm = SL.teams_of(conn, {str(x["player_id"]) for x in c if x.get("player_id") is not None}, day)
    priced, seen = [], set()
    for src in c:
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        f = fl.get((pid, src["prop"], src["side"]))
        if f and (pid, src["prop"], src["side"]) not in seen:
            seen.add((pid, src["prop"], src["side"]))     # first occurrence in Underdog T1's own order (research_sleeper_small)
            priced.append({"pid": pid, "player": f[0], "prop": src["prop"], "side": src["side"], "line": f[1], "m": f[2], "p": float(src["p"]),
                           "team": tm.get(pid), "game": f[3], "match": f[4], "ud_line": float(src["line"])})
    cand = [l for l in sorted(priced, key=lambda x: -x["p"]) if l["p"] >= float(cfg.get("floor", 0.56)) and l["m"] <= float(cfg.get("mcap", 1.85))]
    s = ST.pick(cand[int(cfg.get("skip", 1)):], 2, gc)
    if s is not None and len({l["team"] for l in s}) < 2:
        s = None
    return s, last, f"{note}; T1 qualified {len(c)}, on Fliff {len(priced)}, qualifying {len(cand)}"


def pick(conn, day):
    cfg = SL.cfg(conn, "fliff_live")
    if not cfg.get("enabled"):
        print(f"FLIFF_LIVE|disabled (classification_config fliff_live.enabled) - nothing built for {day}")
        return
    conn.execute(DDL)
    s, last, note = build(conn, day, cfg)
    print(f"FLIFF_LIVE|{day} {note}")
    if s is None:
        conn.commit()
        print(f"FLIFF_LIVE|{day} no slip")
        return
    lj = [{"player": l["player"], "player_id": l["pid"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": l["m"],
           "p": round(l["p"], 4), "team": l["team"], "event_id": l["game"], "matchup": l["match"], "tier": "R", "ud_line": l["ud_line"]} for l in s]
    mult = floor2(s[0]["m"] * s[1]["m"])
    conn.execute("""INSERT INTO nba_score.fliff_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                    VALUES (%s, %s, 2, 'max', 1, %s, 1, 'live', %s, %s)
                    ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, model_multiplier = EXCLUDED.model_multiplier,
                      board_ts = EXCLUDED.board_ts, status = EXCLUDED.status, built_at = now()
                    WHERE nba_score.fliff_live_slips.graded_at IS NULL""", (day, STRATEGY, json.dumps(lj), round(mult, 4), last))
    conn.commit()
    print(f"FLIFF_LIVE|{day} {STRATEGY}: " + " + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']} @{l['m']}" for l in s) + f" = x{mult:.3f}")


def grade(conn, day):
    conn.execute(DDL)
    days = [day] if day else [r[0] for r in conn.execute(
        "SELECT DISTINCT game_date FROM nba_score.fliff_live_slips WHERE graded_at IS NULL AND game_date < (now() AT TIME ZONE 'America/Los_Angeles')::date ORDER BY 1").fetchall()]
    for d in days:
        st = AF.box(conn, d)
        if not st:
            print(f"FLIFF_GRADE|{d}: no box scores yet - left ungraded")
            continue
        for name, lj, stake in conn.execute("SELECT strategy, legs_json, stake FROM nba_score.fliff_live_slips WHERE game_date = %s AND graded_at IS NULL", (d,)).fetchall():
            legs = lj if isinstance(lj, list) else json.loads(lj)
            for l in legs:
                h = AF.outcome(st, l)
                l["hit"] = None if h is None else bool(h)
            live = [l for l in legs if l["hit"] is not None]
            pay = 1.0 if len(live) < 2 else (floor2(float(live[0]["factor"]) * float(live[1]["factor"])) if all(l["hit"] for l in live) else 0.0)
            hits = sum(1 for l in legs if l["hit"])
            conn.execute("""UPDATE nba_score.fliff_live_slips SET legs_json = %s, hits = %s, payout = %s, profit = %s, graded_at = now()
                            WHERE game_date = %s AND strategy = %s AND k = 1""", (json.dumps(legs), hits, round(pay, 4), round(float(stake) * (pay - 1), 4), d, name))
            print(f"FLIFF_GRADE|{d} {name}: {hits}/2 hit, payout {pay:.3f}x")
        conn.commit()


def main():
    mode = os.environ.get("FL_MODE") or "pick"
    ds = (os.environ.get("FL_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else None
    with SL.connect() as conn:
        if mode == "pick":
            pick(conn, day or dt.datetime.now(PT).date())
        elif mode == "grade":
            grade(conn, day)
        else:
            raise SystemExit(f"unknown FL_MODE {mode}")


if __name__ == "__main__":
    main()
