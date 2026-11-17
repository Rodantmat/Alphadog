#!/usr/bin/env python3
"""AUDIT (read-only) - grade the owner's SAVED (really placed) slips of every app for a slate from the live NBA box scores, the
same night. Writes nothing. Prints every leg (stat vs line, margin, minutes, model probability), every slip's hits and payout
(power: all legs -> real multiplier; flex: the stored tier for the hit count), dollars at each app's unit, and leg hit rates by
app / prop / side / probability band. Env: DATABASE_URL, LG_DATE (default today PT), GS_UNITS (json app->usd)."""
import json
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_live_grade_today as A  # noqa: E402

UNITS = {"prizepicks": 10, "underdog": 10, "sleeper": 10, "fliff": 10, "betr": 5}
UNITS.update(json.loads(os.environ.get("GS_UNITS") or "{}"))
STAT = {"points": ("pts",), "rebounds": ("reb",), "assists": ("ast",), "threes_made": ("fg3m",), "steals": ("stl",), "blocks": ("blk",),
        "turnovers": ("tov",), "stocks": ("stl", "blk"), "pra": ("pts", "reb", "ast"), "pts_reb": ("pts", "reb"), "pts_ast": ("pts", "ast"),
        "reb_ast": ("reb", "ast")}


def main():
    box, final = {}, {}
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        proxy = (c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone() or [""])[0]
        games = c.execute("SELECT game_id, home_team_tricode, away_team_tricode FROM nba_calendar.slate_games WHERE game_date = %s ORDER BY game_datetime_utc", (A.D,)).fetchall()
        slips = c.execute("""SELECT slip_id, source_key, strategy, slip_size, entry_mode, real_multiplier, real_multiplier_flex_tiers, legs_json
                             FROM nba_score.ui_saved_slips WHERE slate_date = %s ORDER BY source_key, slip_id""", (A.D,)).fetchall()
    for gid, htc, atc in games:
        g = A.fetch_box(gid, proxy)
        hs, as_ = g["homeTeam"]["score"], g["awayTeam"]["score"]
        print(f"GAME|{atc} {as_} @ {htc} {hs}|margin {abs(hs - as_)}|status {g.get('gameStatus')} {g.get('gameStatusText')}", flush=True)
        for side in ("homeTeam", "awayTeam"):
            t = g[side]
            for p in t.get("players", []):
                s = p.get("statistics") or {}
                box[str(p["personId"])] = dict(min=A.minutes(s.get("minutesCalculated") or s.get("minutes")), pts=s.get("points", 0), reb=s.get("reboundsTotal", 0),
                                               ast=s.get("assists", 0), fg3m=s.get("threePointersMade", 0), stl=s.get("steals", 0), blk=s.get("blocks", 0),
                                               tov=s.get("turnovers", 0), game=f"{atc}@{htc}", margin=abs(hs - as_), team=t.get("teamTricode"))
    seen, by = {}, defaultdict(list)
    app_tot = defaultdict(lambda: [0, 0, 0.0, 0.0])
    for sid, app, strat, size, mode, rm, tiers, legs in slips:
        hits = voids = 0
        rows = []
        for l in legs:
            pid = str(l.get("mlb_player_id") or l.get("player_id") or (l.get("_g") or {}).get("player_id") or "")
            prop, line, side = l.get("canonical_prop_key"), float(l.get("line_value")), (l.get("selected_side") or "").lower()
            r = box.get(pid)
            ph = l.get("hit_probability_0_100") or l.get("estimated_hit_probability_0_100")
            if r is None or r["min"] <= 0 or prop not in STAT:
                voids += 1
                rows.append(f"    VOID {l.get('player_name'):<24} {prop:<11} {side:<4} {line:>5} -> {'DNP' if r else 'no box'}")
                continue
            v = sum(r[k] for k in STAT[prop])
            hit = (v < line) if side in ("less", "under") else (v > line)
            hits += int(hit)
            rows.append(f"    {'HIT ' if hit else 'MISS'} {l.get('player_name'):<24} {prop:<11} {side:<4} {line:>5} -> {v:>4} (diff {v - line:+.1f}, min {r['min']:.0f}) "
                        f"x{l.get('leg_factor')} p={ph} | {r['game']} margin {r['margin']}")
            key = (pid, prop, line, side)
            if key not in seen:
                seen[key] = hit
                band = None if ph is None else ("p>=75" if float(ph) >= 75 else "p65-75" if float(ph) >= 65 else "p55-65" if float(ph) >= 55 else "p<55")
                for k in (("app", app), ("prop", prop), ("side", side), ("band", band), ("prop+side", f"{prop}:{side}"),
                          ("blowout", "margin>=15" if r["margin"] >= 15 else "margin<15")):
                    by[k].append(hit)
            by[("app-leg-uses", app)].append(hit)
        n = len(legs) - voids
        mult = 0.0
        if voids:
            note = f"  ({voids} void leg(s): app re-prices - payout not computed)"
        else:
            note = ""
            if (mode or "").lower() == "power":
                mult = float(rm or 0) if hits == n else 0.0
            else:
                mult = float((tiers or {}).get(str(hits), 0) or 0)
        u = UNITS.get(app, 10)
        t = app_tot[app]
        t[0] += 1; t[1] += int(mult > 0); t[2] += u; t[3] += u * mult
        print(f"\nSLIP|{sid}|{app}|{strat[:28]}|{size}-{mode}|hits {hits}/{n}|x{mult}|${u} -> ${u * mult:.2f} (net {u * mult - u:+.2f}){note}", flush=True)
        for x in rows:
            print(x, flush=True)
    print("\n=== BY APP (slips / cashed / staked / returned / net)")
    gs = gr = 0.0
    for app, (n, w, st, rt) in sorted(app_tot.items()):
        gs += st; gr += rt
        print(f"APP|{app}|{n}|{w}|${st:.0f}|${rt:.2f}|{rt - st:+.2f}")
    print(f"TOTAL|staked ${gs:.0f}|returned ${gr:.2f}|net {gr - gs:+.2f}")
    print(f"\n=== DISTINCT LEGS {len(seen)} | hit {sum(seen.values())} ({sum(seen.values()) / max(1, len(seen)):.0%})")
    for (grp, k), v in sorted(by.items(), key=lambda x: (x[0][0], str(x[0][1]))):
        print(f"LEGS|{grp}|{k}|{sum(v)}/{len(v)}|{sum(v) / len(v):.0%}")


if __name__ == "__main__":
    main()
