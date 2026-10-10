#!/usr/bin/env python3
"""
PROBE (2026-10-09 20:37 PT, owner screenshots of Underdog's NBA "Players" tab for 10-20 BOS @ DET: Tatum / George / White
Points 26.5 / 16.5 / 15.5 all 1.87x, Rebounds 7.5 1.66/2.01, 3.5 1.64/2.02, 3.5 2.09/1.57, Assists 5.5 1.71/1.96, 2.5 1.55/2.13,
3.5 1.57/2.08). Our scheduled NBA capture holds ZERO player legs off game days (the lobby's per-match lines answer only for
today's matches) and has only ever seen Points / PRA for NBA. Question: on 10-20, will the scraper capture the full player
board (every stat), with the multipliers the app shows? Displayed x = sqrt(3.5) x payout modifier (1.8708 = a main line).
  A. the production scraper, forced onto 2026-10-20 with the full stat sweep (UNDERDOG_DATE / UNDERDOG_ALL_MATCHES=1),
     written to a scratch dir: by_stat, players, and the nine screenshot legs side by side with the app
  B. the other public endpoints (beta/v6 over_under_lines, v2 pickem_search): do they carry the 10-20 player props?
Read-only, no account, nothing committed. Env: PROXY_URL.
"""
import json
import math
import os
import sys
from collections import Counter

os.environ.setdefault("UNDERDOG_SPORTS", "NBA")
os.environ.setdefault("UNDERDOG_DATE", "2026-10-20")
os.environ.setdefault("UNDERDOG_ALL_MATCHES", "1")
os.environ.setdefault("UNDERDOG_OUT_DIR", "/tmp/udprobe")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape_underdog_board as U  # noqa: E402

ROOT = math.sqrt(3.5)
APP = {  # (player last name, stat, line): (higher, lower) as displayed in the app 2026-10-09 20:36 PT
    ("Tatum", "Points", 26.5): (1.87, 1.87), ("George", "Points", 16.5): (1.87, 1.87), ("White", "Points", 15.5): (1.87, 1.87),
    ("Tatum", "Rebounds", 7.5): (1.66, 2.01), ("George", "Rebounds", 3.5): (1.64, 2.02), ("White", "Rebounds", 3.5): (2.09, 1.57),
    ("Tatum", "Assists", 5.5): (1.71, 1.96), ("George", "Assists", 2.5): (1.55, 2.13), ("White", "Assists", 3.5): (1.57, 2.08),
}


def part_a():
    try:
        U.main()
    except SystemExit as exc:
        print(f"scraper exit {exc.code}", flush=True)
    path = os.path.join(os.environ["UNDERDOG_OUT_DIR"], "underdog_nba_current.json")
    meta_p = os.path.join(os.environ["UNDERDOG_OUT_DIR"], "underdog_nba_current_meta.json")
    if not os.path.exists(path):
        print("A: no board file written"); return
    meta = json.load(open(meta_p))
    print(f"A meta: legs {meta.get('legs')} players {meta.get('players')} ladder {meta.get('ladder_legs')} partial {meta.get('partial')}")
    print(f"A by_stat {meta.get('by_stat')}")
    print(f"A calls with data {[c for c in meta.get('calls', []) if (len(c) > 1 and c[1]) or 'error' in str(c[0])][:40]}")
    d = json.load(open(path))
    legs = d.get("legs") if isinstance(d, dict) else d
    keys = list(legs[0].keys()) if legs else []
    print(f"A leg keys {keys}")
    for (last, stat, line), (hi, lo) in APP.items():
        hit = [l for l in legs if last in (l.get("player") or "") and (l.get("stat") or "") == stat and float(l.get("line") or -1) == line]
        if not hit:
            near = [(l.get("player"), l.get("stat"), l.get("line")) for l in legs if last in (l.get("player") or "")][:6]
            print(f"A MISSING {last} {stat} {line} app {hi}/{lo} | ours for {last}: {near}")
            continue
        l = hit[0]
        hm, lm = l.get("higher_multiplier"), l.get("lower_multiplier")
        def disp(m):
            try:
                return round(ROOT * float(m), 2)
            except Exception:  # noqa: BLE001
                return None
        print(f"A {last:7s} {stat:9s} {line:5} app {hi}/{lo}  ours mod {hm}/{lm} -> displayed {disp(hm)}/{disp(lm)}  "
              f"payout_mod {l.get('higher_payout_modifier')}/{l.get('lower_payout_modifier')}")
        print(f"A   raw {last} {stat}: " + json.dumps({k: l.get(k) for k in keys if k.startswith(('higher_', 'lower_'))}))


def part_b():
    s = U._sess()
    px = {"https": os.environ.get("PROXY_URL", ""), "http": os.environ.get("PROXY_URL", "")} if os.environ.get("PROXY_URL") else None
    for url in (f"{U.API}/beta/v6/over_under_lines?{U.COMMON}", f"{U.API}/beta/v5/over_under_lines",
                f"{U.API}/v2/pickem_search/search_results?sport_id=NBA&{U.COMMON}"):
        try:
            j = U.get(s, url, px)
        except Exception as exc:  # noqa: BLE001
            print(f"B {url.split('?')[0]}: {type(exc).__name__} {str(exc)[:100]}"); continue
        lines = j.get("over_under_lines") or []
        lines = list(lines.values()) if isinstance(lines, dict) else lines
        apps = {str(a.get("id")): a for a in (j.get("appearances") or [])} if isinstance(j.get("appearances"), list) else (j.get("appearances") or {})
        games = {}
        for k in ("games", "solo_games"):
            g = j.get(k) or []
            for x in (g.values() if isinstance(g, dict) else g):
                games[str(x.get("id"))] = x
        players = {str(p.get("id")): p for p in (j.get("players") or [])} if isinstance(j.get("players"), list) else (j.get("players") or {})
        c, tatum = Counter(), []
        for ln in lines:
            ast = (ln.get("over_under") or {}).get("appearance_stat") or {}
            a = apps.get(str(ast.get("appearance_id")), {})
            g = games.get(str(a.get("match_id")), {})
            p = players.get(str(a.get("player_id")), {})
            if (p.get("sport_id") or g.get("sport_id")) not in ("NBA", None):
                continue
            day = U._et_date(g.get("scheduled_at") or g.get("start_time")) if g else None
            c[(day, ast.get("display_stat"))] += 1
            if "Tatum" in str(p.get("last_name")) and day == "2026-10-20":
                opts = {o.get("choice"): o.get("payout_multiplier") for o in ln.get("options") or []}
                tatum.append((ast.get("display_stat"), ln.get("stat_value"), opts))
        print(f"B {url.split('?')[0]}: keys {list(j.keys())[:12]} lines {len(lines)}")
        print(f"B   NBA by (date, stat) {sorted(((k[0] or ''), k[1], v) for k, v in c.items())[:60]}")
        print(f"B   Tatum 10-20 {tatum[:12]}")


if __name__ == "__main__":
    part_a()
    part_b()
