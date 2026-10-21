#!/usr/bin/env python3
"""
GOBLIN / DEMON LESS - FORWARD PAPER TRACKER (2026-10-20, owner: "if the multipliers sustain to keep it positive ... good enough to
try ... anything that's proved positive, we will try").

WHY FORWARD. Payouts of stacked alternate-Less slips are proven against 544 PrizePicks quotes and the leg edge is measured on two
seasons (research_altless_strategies.py), but every slip rule's sign depends on WHICH rungs PrizePicks opens to Less - and history
never offered Less, so the backtest had to assume it (research_altless_robust.py: a 5-pick rule moves from +106% to -41% with the
assumption alone). The live board now records it (archive_live_boards.py files an alternate Less row only where the projection's
allowed_wager_types is under_or_over). This tracker runs FIXED rules on the REAL open set, every slate, as PAPER: recorded, never
placed, never shown on the slip screen (owner 2026-10-17: test-only strategies are recorded as not played).

PICK (P3, after the board is archived and scored - MODE=pick, PAT_DATE = the slate):
  legs   = PrizePicks goblin / demon rungs of points / PRA / rebounds / assists, tiers 1-3 (nba_market.pp_leg_price, window board,
           the same per-line model price the research used), whose Less side IS on the window archive (side Under, *_alternate)
  rank   = per (prop, tier) the reverse rank of the rung's More on each of score / final_hp / baseline_hp (nba_score.final_hp, Over,
           the certified tier-map recipe: tier = G/D + min(|tier|, 3), keep-first by price); rmin = the best of the three (1 = the rung the model rates least likely to go over) - the research's selector
  price  = PrizePicks' Less law (research_exhaustive_pp.less_price: complement S 0.99 of the quote-level More price, floor 1.7x,
           3% conservative) - recorded per leg; the slip is graded with the certified grader (2-pick alternate Power x 0.93)
  rules  = depth rmin <= 2, sizes 2..6, Power and Flex (owner rule: always 2-6, both structures): one slip per rule per slate,
           legs in (rmin, higher factor) order, one leg per player, at most 2 legs per game, at least 2 games; only games that have
           NOT tipped at pick time. One set per day: a slate already picked is never re-picked.
GRADE (P2A, next morning - MODE=grade): every ungraded slip of a finished slate: leg hit = stat < line from
  nba_stats.player_game_log (no row = DNP = void; a whole-number tie = void), payout by build_slip_engine.grade.
REPORT (MODE=report): per rule - slates, staked, returned, ROI, full hits.
Env: DATABASE_URL, MODE (pick | grade | report), PAT_DATE (default today PT), PAT_WRITE (1 default; 0 = dry run, prints only),
PAT_TEST_BAND=1 (dry run only: the research's assumed open band replaces the real Less flag - plumbing test before the flag exists).
"""
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                 # noqa: E402  certified grader v3
import research_exhaustive_pp as EX            # noqa: E402  less_price, QUOTE_LIFT, install_flex2_alt
import research_altless_strategies as AS       # noqa: E402  imported for its 2-pick alternate Power x 0.93 rule

PROPS = {"player_points": "points", "player_points_rebounds_assists": "pra", "player_rebounds": "rebounds", "player_assists": "assists"}
STAT = {"points": "pts", "pra": "pts + reb + ast", "rebounds": "reb", "assists": "ast"}
DEPTH = 2
SIZES = (2, 3, 4, 5, 6)
MAX_SG = 2
TEST_BAND = False

DDL = """CREATE TABLE IF NOT EXISTS nba_score.paper_altless_slips (
  game_date date NOT NULL, rule text NOT NULL, size int NOT NULL, structure text NOT NULL,
  legs_json jsonb NOT NULL, fprod numeric, status text NOT NULL DEFAULT 'paper',
  picked_at timestamptz NOT NULL DEFAULT now(), graded_at timestamptz, hits int, live_legs int, payout numeric,
  PRIMARY KEY (game_date, rule))"""

LEG_SQL = """
WITH pr AS (            -- the certified tier-map recipe (build_tier_map_bands.rebuild_legs _priced + REBUILD_LEGS), this slate only
  SELECT p.nm, p.base_market, p.line::float8 line, p.kind, p.factor::float8 price,
         CASE WHEN p.tier IS NOT NULL AND p.tier <> 0 THEN p.tier
              WHEN p.anchor_line IS NOT NULL THEN round(p.line - p.anchor_line)::int ELSE p.tier END sys_tier
  FROM nba_market.pp_leg_price p
  WHERE p.game_date = %(d)s AND p.snapshot_label = 'window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch, false)
    AND p.side = 'Over' AND p.kind IN ('goblin', 'demon') AND p.base_market = ANY(%(mk)s)),
legs AS (
  SELECT DISTINCT ON (m.player_id, pr.base_market, pr.line) m.player_id pid, pr.nm, pr.base_market, pr.line, pr.kind,
         upper(left(pr.kind, 1)) || least(abs(pr.sys_tier), 3) tier, pr.price f_over,
         f.game_id, f.score::float8 score, f.final_hp::float8 fh, f.baseline_hp::float8 bh
  FROM pr JOIN nba_ref.player_name_map m ON m.norm_name = pr.nm
  JOIN nba_score.final_hp f ON f.game_date = %(d)s AND f.player_id = m.player_id AND f.side = 'Over' AND f.line = pr.line
   AND f.prop = CASE pr.base_market WHEN 'player_points' THEN 'points' WHEN 'player_points_rebounds_assists' THEN 'pra'
                                    WHEN 'player_rebounds' THEN 'rebounds' ELSE 'assists' END
  WHERE f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL
  ORDER BY m.player_id, pr.base_market, pr.line, pr.price),
less_open AS (
  SELECT DISTINCT nba_ref.norm_name(s.player) nm, replace(s.market_key, '_alternate', '') base_market, s.line::float8 line
  FROM nba_market.board_snapshots s
  WHERE s.game_date = %(d)s AND s.bookmaker = 'prizepicks' AND s.snapshot_label = 'window' AND s.side = 'Under'
    AND s.market_key LIKE '%%_alternate')
SELECT l.pid, (SELECT display_name FROM nba_ref.player_name_map WHERE player_id = l.pid LIMIT 1), l.base_market, l.line, l.kind,
       l.tier, l.f_over, l.game_id, l.score, l.fh, l.bh, (lo.nm IS NOT NULL) less_open, l.nm
FROM legs l LEFT JOIN less_open lo ON lo.nm = l.nm AND lo.base_market = l.base_market AND lo.line = l.line
"""


def today_pt():
    return datetime.now(ZoneInfo("America/Los_Angeles")).date()


def started_games(conn, d):
    rows = conn.execute("SELECT game_id, game_datetime_utc FROM nba_calendar.slate_games WHERE game_date = %s", (d,)).fetchall()
    now = datetime.now(timezone.utc)
    return {str(g) for g, t in rows if t is not None and t <= now}


def build(pool, k):
    """Greedy in pool order: one leg per player, <= MAX_SG legs per game, and never a slip on a single game (a leg that would
    complete a one-game slip is skipped). The research's builder required 2 TEAMS; the tracker has no team on a live rung, so
    it requires 2 GAMES - stricter, and it keeps PrizePicks' same-game pricing out of the paper record."""
    slip, players, games = [], set(), defaultdict(int)
    for l in pool:
        if l["player_id"] in players or games[l["game_id"]] >= MAX_SG:
            continue
        if len(slip) == k - 1 and set(games) == {l["game_id"]}:
            continue
        slip.append(l)
        players.add(l["player_id"])
        games[l["game_id"]] += 1
        if len(slip) == k:
            return slip
    return None


def pick(conn, d, write):
    if conn.execute("SELECT 1 FROM nba_score.paper_altless_slips WHERE game_date = %s LIMIT 1", (d,)).fetchone():
        print(f"PAPER_ALTLESS|{d}|already picked - one set per day, nothing re-picked")
        return
    rows = conn.execute(LEG_SQL, {"d": d, "mk": list(PROPS)}).fetchall()
    if TEST_BAND:     # dry-run plumbing test only: the research's assumed open band stands in for the real flag
        rows = [r[:11] + (EX.less_open(r[6], "U" + r[5]),) + r[12:] for r in rows]
    n_open = sum(1 for r in rows if r[11])
    if not rows or n_open == 0:
        print(f"PAPER_ALTLESS|{d}|no Less-open alternate on the window archive ({len(rows)} priced rungs) - nothing picked "
              f"(the open set is never assumed)")
        return
    gone = started_games(conn, d)
    legs = []
    for pid, player, mk, line, kind, tier, f_over, gid, score, fh, bh, lopen, nm in rows:
        legs.append({"nm": nm, "player_id": pid, "player": player, "prop": PROPS[mk], "line": line, "kind": kind, "tier": tier,
                     "f_over": f_over, "event_id": str(gid), "game_id": str(gid), "score": score, "fh": fh, "bh": bh,
                     "less_open": bool(lopen)})
    # reverse ranks per (prop, tier) on each key, over ALL priced rungs of the group (as the research), then the open filter
    groups = defaultdict(list)
    for l in legs:
        groups[(l["prop"], l["tier"])].append(l)
    for g in groups.values():
        for key in ("score", "fh", "bh"):
            # research: n_rank = row_number by score DESC, nrev = reverse of it -> 1 = the rung least likely to go over
            vals = sorted(g, key=lambda x: (x[key], x["player_id"], x["line"]))
            for i, x in enumerate(vals, 1):
                x["r_" + key] = i
        for x in g:
            rk = [x.get("r_" + k) for k in ("score", "fh", "bh") if x.get("r_" + k) is not None]
            x["rmin"] = min(rk) if rk else 99
    pool = [l for l in legs if l["less_open"] and l["rmin"] <= DEPTH and l["game_id"] not in gone and l["tier"][1:] in ("1", "2", "3")]
    for l in pool:
        l["factor"] = EX.less_price(l["f_over"], "U" + l["tier"])
    pool.sort(key=lambda l: (l["rmin"], -l["factor"], l["player_id"]))
    print(f"PAPER_ALTLESS|{d}|priced rungs {len(legs)}|Less-open {n_open}|depth<={DEPTH} open, not tipped: {len(pool)}|"
          f"games already tipped: {len(gone)}", flush=True)
    made, out = 0, []
    for k in SIZES:
        sl = build(pool, k)
        if not sl:
            print(f"  {k}-pick: not enough legs across games")
            continue
        fp = 1.0
        for l in sl:
            fp *= l["factor"]
        keep = ["nm", "player_id", "player", "prop", "line", "kind", "tier", "f_over", "factor", "rmin", "game_id"]
        lj = [{kk: l[kk] for kk in keep} for l in sl]
        for st in ("power", "flex"):
            rule = f"AL_N{DEPTH}_{k}{st}"
            out.append((rule, k, st, lj))
            print(f"  {rule}: fp {fp:.3f} | " + " + ".join(f"{l['player'].split()[-1]} {l['prop']} {l['line']} {l['tier']}-Less x{l['factor']:.2f}"
                                                      for l in sl), flush=True)
            if write:
                conn.execute("""INSERT INTO nba_score.paper_altless_slips (game_date, rule, size, structure, legs_json, fprod)
                                VALUES (%s, %s, %s, %s, %s::jsonb, %s) ON CONFLICT (game_date, rule) DO NOTHING""",
                             (d, rule, k, st, json.dumps(lj), round(fp, 5)))
                made += 1
    if write:
        conn.commit()
    print(f"PAPER_ALTLESS|{d}|{made} paper slips recorded (status 'paper' - never placed, not on the slip screen)" if write else
          f"PAPER_ALTLESS|{d}|dry run - nothing written")
    return out


def leg_hit(conn, d, l):
    col = STAT[l["prop"]]
    r = conn.execute(f"SELECT ({col})::float8 FROM nba_stats.player_game_log WHERE nba_player_id::text = %s AND game_date = %s AND min > 0",
                     (str(l["player_id"]), d)).fetchone()
    a = r[0] if r else None
    return None if a is None or a == float(l["line"]) else int(a < float(l["line"]))


def grade_legs(conn, d, legs, st):
    """Less hit = stat < line (box score; no row or 0 minutes = DNP = void; landing exactly on the line = void), certified grader."""
    slip = [{"hit": leg_hit(conn, d, l), "factor": float(l["factor"]), "event_id": l["game_id"]} for l in legs]
    hits, pay = SE.grade(slip, st)
    return hits, sum(1 for x in slip if x["hit"] is not None), pay


def grade(conn, write):
    todo = conn.execute("""SELECT game_date, rule, size, structure, legs_json FROM nba_score.paper_altless_slips
                           WHERE graded_at IS NULL AND game_date < %s ORDER BY 1, 2""", (today_pt(),)).fetchall()
    if not todo:
        print("PAPER_ALTLESS_GRADE|nothing to grade")
        return
    done = 0
    for d, rule, size, st, legs in todo:
        final = conn.execute("""SELECT count(*) FILTER (WHERE game_status <> 3) FROM nba_calendar.slate_games WHERE game_date = %s""",
                             (d,)).fetchone()[0]
        if final:
            print(f"  {d} {rule}: {final} game(s) not final - later")
            continue
        # P2A's own content gate: every team of every final game has box-score rows, else a missing load would void every leg
        miss = conn.execute("""SELECT count(*) FROM (SELECT home_team_id t FROM nba_calendar.slate_games WHERE game_date = %s
                                                       UNION SELECT away_team_id FROM nba_calendar.slate_games WHERE game_date = %s) x
                               WHERE t NOT IN (SELECT DISTINCT team_id FROM nba_stats.player_game_log WHERE game_date = %s)""",
                            (d, d, d)).fetchone()[0]
        if miss:
            print(f"  {d} {rule}: {miss} team box score(s) not in Postgres yet - later")
            continue
        hits, live, pay = grade_legs(conn, d, legs, st)
        print(f"  {d} {rule}: hits {hits}/{live} live of {size} | payout {pay:.3f}", flush=True)
        if write:
            conn.execute("""UPDATE nba_score.paper_altless_slips SET graded_at = now(), hits = %s, live_legs = %s, payout = %s
                            WHERE game_date = %s AND rule = %s""", (hits, live, round(pay, 4), d, rule))
            done += 1
    if write:
        conn.commit()
    print(f"PAPER_ALTLESS_GRADE|{done} slips graded")


def report(conn):
    rows = conn.execute("""SELECT rule, count(*), count(graded_at), coalesce(sum(payout), 0), count(*) FILTER (WHERE hits = size)
                           FROM nba_score.paper_altless_slips GROUP BY 1 ORDER BY 1""").fetchall()
    print("rule                 slates graded  returned  ROI      full hits")
    for rule, n, g, ret, full in rows:
        roi = (float(ret) - g) / g if g else None
        print(f"{rule:<20} {n:>6} {g:>6} {float(ret):>9.2f}  {('%+.1f%%' % (roi * 100)) if roi is not None else '   -   '}  {full}")


def main():
    mode = os.environ.get("MODE", "pick")
    global TEST_BAND
    write = os.environ.get("PAT_WRITE", "1") == "1"
    TEST_BAND = os.environ.get("PAT_TEST_BAND") == "1"
    if TEST_BAND and write:
        sys.exit("PAT_TEST_BAND is a dry-run plumbing test: it needs PAT_WRITE=0")
    d = date.fromisoformat(os.environ["PAT_DATE"]) if os.environ.get("PAT_DATE") else today_pt()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        conn.execute(DDL)
        conn.commit()
        EX.install_flex2_alt(conn)
        if mode == "pick":
            pick(conn, d, write)
        elif mode == "grade":
            grade(conn, write)
        else:
            report(conn)


if __name__ == "__main__":
    main()
