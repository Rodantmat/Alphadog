#!/usr/bin/env python3
"""
DO THE LIVE-CHECK DRIFT RULES HOLD ROI? (owner 2026-11-25 17:29 PT: "Does pp, ud and betr also need the price moved rule? Also be sure the strategies features hold ROI").
READ-ONLY. Every Under on Underdog (main lines), Sleeper and Fliff, captured at an EARLY board capture and seen again at a LATER capture of the same day before its
game tipped (2026-10-20 .. yesterday; 3-4 captures a day). Graded on the box score (did not play = void, excluded).
Buckets at the later capture:
  SAME line, price ratio r = later / earlier multiplier: r >= 1.00 | 0.96-1.00 (one step, kept by the rule) | 0.92-0.96 | < 0.92 (both sent to the strategy rule today)
  LINE UP (better for an Under), LINE DOWN (worse), GONE (pulled).
Per bucket: legs, hit rate at the later line, EV per leg = hit x later multiplier (Underdog: hit x per-pick factor), versus the STABLE bucket (same line, r = 1) as the
replacement yardstick - a substitute is a comparable leg that did not drift. A rule HOLDS when the legs it keeps earn at least the replacement yardstick and the legs it
sends away earn less. Also for the model's top legs only (top 25% p_blend per app and day, the legs the strategies pick).
Env: DATABASE_URL, DR_FROM (2026-10-20), DR_TO (yesterday).
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_honest_live_replay as RP                                 # noqa: E402

MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals",
      "player_blocks": "blocks", "player_turnovers": "turnovers", "player_blocks_steals": "stocks", "player_points_rebounds": "pts_reb",
      "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast", "player_points_rebounds_assists": "pra"}


def dec(app, price, mult):
    if app == "fliff":
        if price is None:
            return None
        p = float(price)
        return 1 + p / 100 if p > 0 else 1 + 100 / abs(p) if p < 0 else None
    return float(mult) if mult is not None else None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d0 = dt.date.fromisoformat(os.environ.get("DR_FROM") or "2026-10-20")
    d1 = dt.date.fromisoformat(os.environ.get("DR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    box = defaultdict(dict)
    for row in conn.execute("SELECT nba_player_id::text, game_date, " + ", ".join(RP.COLS) + " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[row[1]][row[0]] = [float(x or 0) for x in row[2:]]
    pb = {}
    for app, gd, pid, prop, line, p in conn.execute("""SELECT app, game_date, player_id::text, prop, line::float8, p_blend::float8 FROM nba_score.v_legs_honest
                                                      WHERE is_under AND game_date BETWEEN %s AND %s AND p_blend IS NOT NULL""", (d0, d1)).fetchall():
        pb[(app, gd, pid, prop, float(line))] = p
    res = defaultdict(lambda: defaultdict(list))          # (app, subset) -> bucket -> [(hit, m)]
    for app in ("underdog", "sleeper", "fliff"):
        rows = conn.execute("""SELECT b.game_date, b.snapshot_ts, b.market_key, nm.player_id::text, b.line::float8, b.price, b.multiplier::float8, b.commence_time
                               FROM nba_market.board_snapshots b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
                               WHERE b.bookmaker = %s AND b.game_date BETWEEN %s AND %s AND lower(b.side) IN ('under', 'less', 'lower') AND b.market_key = ANY(%s)""",
                            (app, d0, d1, list(MK))).fetchall()
        snaps = defaultdict(lambda: defaultdict(list))   # gd -> ts -> [(pid, prop, line, m, tip)]
        for gd, ts, mk, pid, line, price, mult, tip in rows:
            m = dec(app, price, mult)
            if m is None or m <= 0:
                continue
            if app == "underdog" and not (0.7 <= m <= 1.5):           # main lines only (alternate rungs carry 2x+ factors)
                continue
            snaps[gd][ts].append((pid, MK[mk], line, m, tip))
        for gd, by in snaps.items():
            tss = sorted(by)
            if len(tss) < 2 or gd not in box:
                continue
            # top 25% p_blend of the day for this app
            ps = sorted((v for (a, g, *_), v in pb.items() if a == app and g == gd), reverse=True)
            cut = ps[len(ps) // 4] if len(ps) >= 8 else None
            for e, l in zip(tss[:-1], tss[1:]):
                later = defaultdict(list)
                for pid, prop, line, m, tip in by[l]:
                    later[(pid, prop)].append((line, m))
                for pid, prop, line, m, tip in by[e]:
                    if tip is not None and l >= tip:
                        continue
                    v = box[gd].get(pid)
                    if v is None:
                        continue
                    x = RP.stat(v, prop)
                    if x is None:
                        continue
                    L = later.get((pid, prop))
                    if not L:
                        b = "GONE"; l2, m2 = line, m
                    else:
                        same = [q for q in L if abs(q[0] - line) < 1e-9]
                        if same:
                            l2, m2 = same[0]; r = m2 / m
                            b = "SAME r>=1.00" if r >= 0.9999 else "SAME r 0.96-1" if r >= 0.96 else "SAME r 0.92-0.96" if r >= 0.92 else "SAME r<0.92"
                            if abs(r - 1) < 1e-9:
                                b = "STABLE r=1"
                        else:
                            up = [q for q in L if q[0] > line]; dn = [q for q in L if q[0] < line]
                            if up:
                                l2, m2 = min(up); b = "LINE UP"
                            else:
                                l2, m2 = max(dn); b = "LINE DOWN"
                    if x == l2:
                        continue
                    hit = int(x < l2)
                    top = cut is not None and pb.get((app, gd, pid, prop, line), -1) >= cut
                    for sub in (("all",) + (("top25",) if top else ())):
                        res[(app, sub)][b].append((hit, m2))
                        if b.startswith("SAME") or b == "STABLE r=1":
                            res[(app, sub)]["SAME all"].append((hit, m2))
        print(f"DR|{app}: {len(rows):,} under rows, {len(snaps)} days", flush=True)
    order = ["STABLE r=1", "SAME r>=1.00", "SAME r 0.96-1", "SAME r 0.92-0.96", "SAME r<0.92", "LINE UP", "LINE DOWN", "GONE"]
    for (app, sub), bk in sorted(res.items()):
        base = np.array(bk["STABLE r=1"]) if bk["STABLE r=1"] else None
        bev = float((base[:, 0] * base[:, 1]).mean()) if base is not None else float("nan")
        print(f"DR|==== {app.upper()} {sub} (EV = hit x later multiplier; replacement yardstick = STABLE {bev:.3f}) ====", flush=True)
        for b in order:
            a = np.array(bk[b]) if bk[b] else None
            if a is None:
                print(f"DR|  {b:18s} -", flush=True); continue
            ev = float((a[:, 0] * a[:, 1]).mean())
            print(f"DR|  {b:18s} n {len(a):6d}  hit {100 * a[:, 0].mean():5.1f}%  avg mult {a[:, 1].mean():.3f}  EV {ev:.3f}  vs yardstick {100 * (ev / bev - 1):+5.1f}%", flush=True)
    print("DR|DONE", flush=True)


if __name__ == "__main__":
    main()
