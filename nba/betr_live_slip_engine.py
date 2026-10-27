#!/usr/bin/env python3
"""
BETR LIVE SLIPS (owner 2026-10-26 18:31 PT: "Let's go b so, you can deploy it in the slip system"). Two Betr 4-pick DYNAMIC slips a
slate, strategy B_T23_4dyn (research_betr_4dyn ST_PART=hist_ud, run 40426972736 - chosen from ~11,700 variations of the owner's 4-pick
Dynamic, 2 a day):
  legs    Underdog portfolio T units T2 then T3 (each unit's own qualified legs; T3's legs not already in T2), final_hp >= 0.58
  price   at BETR's own REGULAR main line, which must equal the Underdog leg's line (final_hp is that line's chance); the side must be
          open on Betr; the books' de-vigged chance at that line must exist (window board)
  order   by the books' chance (high first); the top 2 legs skipped; at most 2 legs per game; different players across the 2 slips;
          >= 2 teams; a slip that comes out all-Under swaps its last leg for the best Over (Betr pays all-LESS entries less)
  history +49.6% ROI, 262 slips / 131 slates, max drawdown 9.2u, cashed 45%, early / late 2024-25 +57 / +43%, 2025-26 +49 / +39%
          (selected from many - expect less live).
PAYOUT (Betr's own pricing query, re-certified 2026-10-26, pp_slip_rules['betr_payout_v1']): Dynamic 4 = 6x all hit / 1.5x 3 hits;
  all-LESS 5.5 / 1.25. A void drops the pick and pays the smaller Dynamic table (unverified - checked on the first real void); fewer
  than 2 live picks or 1 team = refund.
BOARD: the Betr board is read without a browser with the owner's own token (betr_board_direct.py) and archived as 'window' right before
  the pick (P3); the engine reads the newest Betr rows of the slate from nba_market.board_snapshots. Betr stays out of the scorer
  (classification_config p3_betr_wait.enabled = false); this engine only reads the board. Nothing is sent to Betr.
GATE: classification_config['betr_live'] (enabled, floor, skip, game_cap, slips, k). Rows: nba_score.betr_live_slips.
Modes: BT_MODE=pick (BT_DATE or today PT) | grade (BT_DATE or every ungraded slate). Env: DATABASE_URL.
"""
import datetime as dt
import json
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "betr")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import sleeper_live_slip_engine as SL                # noqa: E402

PT = ZoneInfo("America/Los_Angeles")
STRATEGY = "B_T23_4dyn"
DDL = """CREATE TABLE IF NOT EXISTS nba_score.betr_live_slips (
  game_date date NOT NULL, strategy text NOT NULL, size int NOT NULL, structure text NOT NULL, k int NOT NULL DEFAULT 1,
  legs_json jsonb NOT NULL, stake numeric NOT NULL DEFAULT 1, status text NOT NULL, model_multiplier numeric, board_ts timestamptz,
  built_at timestamptz NOT NULL DEFAULT now(), graded_at timestamptz, hits int, payout numeric, profit numeric,
  PRIMARY KEY (game_date, strategy, k))"""


def rules(conn):
    r = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()
    return r[0] if isinstance(r[0], dict) else json.loads(r[0])


def payout(legs, rj):
    """Betr Dynamic on the graded legs: voids dropped; < 2 live or 1 team = refund; all-LESS table when every live leg is Under"""
    live = [l for l in legs if l.get("hit") is not None]
    n = len(live)
    if n < 2 or len({l.get("team") for l in live}) < 2:
        return 1.0
    tab = rj["dynamic_all_less"] if all(l["side"] == "Under" for l in live) else rj["dynamic_regular"]
    return float((tab.get(str(n)) or {}).get(str(sum(1 for l in live if l["hit"])), 0.0))


def top_multiplier(n, legs, rj):
    tab = rj["dynamic_all_less"] if all(l["side"] == "Under" for l in legs) else rj["dynamic_regular"]
    return float(tab[str(n)][str(n)])


def betr_board(conn, day):
    """{(player_id, prop, side): line} from the newest Betr snapshot of the slate (REGULAR main lines only)"""
    last = conn.execute("SELECT max(snapshot_ts) FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=%s", (day,)).fetchone()[0]
    if last is None:
        return None, None
    rows = conn.execute("""SELECT nm.player_id::text, b.market_key, b.side, b.line::float
                           FROM nba_market.board_snapshots b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                           WHERE b.bookmaker='betr' AND b.game_date=%s AND b.snapshot_ts=%s AND b.market_key = ANY(%s)""",
                        (day, last, list(RSD.MK))).fetchall()
    out = defaultdict(set)
    for pid, mk, side, line in rows:
        out[(pid, RSD.MK[mk], side)].add(line)
    return out, last


def build(conn, day, cfg):
    bb, last = betr_board(conn, day)
    if not bb:
        return [], last, "no Betr board for the slate"
    age_h = (dt.datetime.now(dt.timezone.utc) - last).total_seconds() / 3600
    if age_h > float(cfg.get("max_board_age_h", 3)):
        return [], last, f"the newest Betr board is {age_h:.1f} h old (> {cfg.get('max_board_age_h', 3)} h) - no slip on a stale board"
    legs, rows = AF.load_ud(conn, day, {})
    if not legs:
        return [], last, "no Underdog window board / final_hp for the slate"
    lists = ST.ud_lists(rows, legs)
    pool, seen = [], set()
    for unit in ("T2", "T3"):
        for l in lists[unit][0]:
            key = (str(l.get("player_id")), l["prop"], l["side"])
            if key not in seen:
                seen.add(key); pool.append(l)
    fair, _main = ST.consensus(conn, day)     # the books' de-vigged chance of Over - the SAME definition the history ordered by
    tm = SL.teams_of(conn, {str(x.get("player_id")) for x in pool if x.get("player_id") is not None}, day)
    floor = float(cfg.get("floor", 0.58))
    priced, why = [], defaultdict(int)
    for l in pool:
        pid = str(l.get("player_id")) if l.get("player_id") is not None else None
        if pid is None or float(l["p"]) < floor:
            why["below floor / no id"] += 1; continue
        lines = bb.get((pid, l["prop"], l["side"]))
        if not lines:
            why["not on Betr (side closed)"] += 1; continue
        if float(l["line"]) not in lines:
            why["Betr line differs"] += 1; continue
        pf = mk.get((pid, l["prop"], l["side"], float(l["line"])))
        if not pf:
            why["no books' price at the line"] += 1; continue
        priced.append({"pid": pid, "player": l.get("player"), "prop": l["prop"], "side": l["side"], "line": float(l["line"]),
                       "p": float(l["p"]), "pf": sum(pf) / len(pf), "team": tm.get(pid), "game": l.get("event_id")})
    cand = sorted(priced, key=lambda x: -x["pf"])[int(cfg.get("skip", 2)):]
    k, gc, n_slips = int(cfg.get("k", 4)), int(cfg.get("game_cap", 2)), int(cfg.get("slips", 2))
    used, slips = set(), []
    for _ in range(n_slips):
        c = [x for x in cand if x["pid"] not in used]
        s = ST.pick(c, k, gc)
        if s is None:
            break
        if all(x["side"] == "Under" for x in s):                      # never all-Under (Betr's all-LESS discount)
            games = defaultdict(int)
            for x in s[:-1]:
                games[x["game"]] += 1
            ids = {x["pid"] for x in s}
            for x in c:
                if x["side"] == "Over" and x["pid"] not in ids and games[x["game"]] < gc:
                    t = s[:-1] + [x]
                    if len({y["team"] for y in t}) >= 2:
                        s = t
                    break
        slips.append(s)
        used |= {x["pid"] for x in s}
    note = (f"board {last:%H:%M}Z; T2+T3 pool {len(pool)}, priced on Betr at the same line {len(priced)} "
            f"({', '.join(f'{v} {k_}' for k_, v in why.items())}); candidates after skip {len(cand)}")
    return slips, last, note


def pick(conn, day):
    cfg = SL.cfg(conn, "betr_live")
    if not cfg.get("enabled"):
        print(f"BETR_LIVE|disabled (classification_config betr_live.enabled) - nothing built for {day}")
        return
    conn.execute(DDL)
    rj = rules(conn)
    slips, last, note = build(conn, day, cfg)
    print(f"BETR_LIVE|{day} {note}", flush=True)
    if not slips:
        conn.commit()
        print(f"BETR_LIVE|{day} no slip")
        return
    for i, s in enumerate(slips, start=1):
        lj = [{"player": l["player"], "player_id": l["pid"], "prop": l["prop"], "side": l["side"], "line": l["line"], "factor": 1.0,
               "p": round(l["p"], 4), "pf": round(l["pf"], 4), "team": l["team"], "event_id": l["game"], "tier": "REGULAR"} for l in s]
        mult = top_multiplier(len(s), s, rj)
        conn.execute("""INSERT INTO nba_score.betr_live_slips (game_date, strategy, size, structure, k, legs_json, stake, status, model_multiplier, board_ts)
                        VALUES (%s, %s, %s, 'dynamic', %s, %s, 1, 'live', %s, %s)
                        ON CONFLICT (game_date, strategy, k) DO UPDATE SET legs_json = EXCLUDED.legs_json, size = EXCLUDED.size,
                          model_multiplier = EXCLUDED.model_multiplier, board_ts = EXCLUDED.board_ts, status = EXCLUDED.status, built_at = now()
                        WHERE nba_score.betr_live_slips.graded_at IS NULL""", (day, STRATEGY, len(s), i, json.dumps(lj), mult, last))
        print(f"BETR_LIVE|{day} {STRATEGY} k{i}: " + " + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']}" for l in s)
              + f" | Dynamic top x{mult}", flush=True)
    # a rebuild that now yields fewer slips leaves no stale ungraded slip behind
    conn.execute("DELETE FROM nba_score.betr_live_slips WHERE game_date=%s AND strategy=%s AND k > %s AND graded_at IS NULL",
                 (day, STRATEGY, len(slips)))
    conn.commit()


def grade(conn, day):
    conn.execute(DDL)
    rj = rules(conn)
    days = [day] if day else [r[0] for r in conn.execute(
        "SELECT DISTINCT game_date FROM nba_score.betr_live_slips WHERE graded_at IS NULL AND game_date < (now() AT TIME ZONE 'America/Los_Angeles')::date ORDER BY 1").fetchall()]
    for d in days:
        st = AF.box(conn, d)
        if not st:
            print(f"BETR_GRADE|{d}: no box scores yet - left ungraded")
            continue
        for name, k, lj, stake in conn.execute("SELECT strategy, k, legs_json, stake FROM nba_score.betr_live_slips WHERE game_date = %s AND graded_at IS NULL",
                                               (d,)).fetchall():
            legs = lj if isinstance(lj, list) else json.loads(lj)
            for l in legs:
                h = AF.outcome(st, l)
                l["hit"] = None if h is None else bool(h)
            pay = payout(legs, rj)
            hits = sum(1 for l in legs if l["hit"])
            conn.execute("""UPDATE nba_score.betr_live_slips SET legs_json = %s, hits = %s, payout = %s, profit = %s, graded_at = now()
                            WHERE game_date = %s AND strategy = %s AND k = %s""",
                         (json.dumps(legs), hits, round(pay, 4), round(float(stake) * (pay - 1), 4), d, name, k))
            print(f"BETR_GRADE|{d} {name} k{k}: {hits}/{len(legs)} hit, payout {pay:.2f}x")
        conn.commit()


def main():
    mode = os.environ.get("BT_MODE") or "pick"
    ds = (os.environ.get("BT_DATE") or "").strip()
    day = dt.date.fromisoformat(ds) if ds else None
    with SL.connect() as conn:
        if mode == "pick":
            pick(conn, day or dt.datetime.now(PT).date())
        elif mode == "grade":
            grade(conn, day)
        else:
            raise SystemExit(f"unknown BT_MODE {mode}")


if __name__ == "__main__":
    main()
