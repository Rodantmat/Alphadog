#!/usr/bin/env python3
"""
RESEARCH - TODAY'S SLIPS OF THE PROPOSED PORTFOLIO (2026-10-22 PT; owner 14:09 PT: "3-pick Power and 4-pick Flex look solid ... get
the best strategy possible ... if it holds well, we play this new strategy ... make it quick to get these slips in for today").
READ-ONLY - prints the slips, writes nothing.

PROPOSED (research_pp_portfolio_mix.py): threes_D1 4-Flex, assists_D1 4-Flex (steals-free pool), rebounds_R 4-Flex, stocks_R 4-Flex,
single:points_R 3-Power, rebounds_R 3-Power; round robin k = 1..10 over those units, N slips (PS_N, 4), a leg in at most L slips
(PS_L, 2) - the setting that measured +42.6 / +53.1% (lb +22.1 / +37.0, max drawdown 37 / 23 units, 4/4 half-seasons). Built on the
priced window board of PS_DAY (default today PT) with the live engine's functions, exactly as the research built the 2026-27 days.
Each slip: legs (player, stat, side, line, PrizePicks tier and price), game, and its PrizePicks payout (grader v3). Then the next
candidates in order (backups if a leg is pulled).
Env: DATABASE_URL, PS_DAY, PS_N (4), PS_L (2).
"""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

DAY = os.environ.get("PS_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
os.environ["PF_LIVE_DAYS"] = DAY
import psycopg       # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_flex234 as F         # noqa: E402
import research_pp_portfolio_mix as M   # noqa: E402

N = int(os.environ.get("PS_N") or "4")
LCAP = int(os.environ.get("PS_L") or "2")
KMAX = 10


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    EX.install_flex2_alt(conn)
    d = dt.date.fromisoformat(DAY)
    rk_rows, _ = F.live_legs(conn, d, {})
    rows = [r for r in rk_rows if not r["tier"].startswith("U")]
    if not rows:
        raise SystemExit(f"no priced window board for {DAY}")
    pool_all = SE.eligible_legs(rows)
    fam = defaultdict(set)
    for c, lst in pool_all.items():
        for l in lst:
            fam[c.replace("_U", "")].add(l["player"])
    broad = sum(1 for v in fam.values() if len(v) >= 2) >= 5
    pools = {"_wo": pool_all, "_wo_nosteals": {c: v for c, v in pool_all.items() if c not in M.STEALS_CELLS}}
    cmap = SE.load_corr(conn)
    games = {}
    for ev, home, away in conn.execute("""SELECT DISTINCT event_id, home_team, away_team FROM nba_market.board_snapshots
                                          WHERE bookmaker = 'prizepicks' AND game_date = %s AND snapshot_label = 'window'""", (d,)):
        games[ev] = f"{away} @ {home}"
    cand = {u: SE.build_day_slips(pools[u[0]], u[1], u[2], u[3], KMAX, cmap, broad) for u in M.PROPOSED}
    taken, use, seen, backups = [], defaultdict(int), set(), []
    for k in range(KMAX):
        for u in M.PROPOSED:
            if k >= len(cand[u]):
                continue
            slip = cand[u][k]
            keys = list(dict.fromkeys(M.legkey(l) for l in slip))
            sig = (u[2], u[3], tuple(sorted(map(str, keys))))
            if sig in seen:
                continue
            if len(taken) < N and not any(use[x] >= LCAP for x in keys):
                seen.add(sig)
                for x in keys:
                    use[x] += 1
                taken.append((u, k + 1, slip))
            elif len(backups) < 6 and not any(use[x] >= LCAP for x in keys):
                seen.add(sig)
                backups.append((u, k + 1, slip))

    def show(tag, u, k, slip):
        evs = [l["event_id"] for l in slip]
        sg = len(evs) > len(set(evs))
        fp = 1.0
        for l in slip:
            fp *= float(l["factor"])
        alt = any(abs(float(l["factor"]) - 1.0) > 1e-9 for l in slip)
        size, st = u[2], u[3]
        top = SE.pp_payout(size, size, st, fp, alt, same_game=sg)
        one = SE.pp_payout(size, size - 1, st, fp, alt, same_game=sg) if st == "flex" else 0.0
        pay = f"pays {top:.2f}x all hit" + (f", {one:.2f}x one miss" if st == "flex" else "")
        print(f"\n{tag}: {size}-pick {st.upper()}  [{u[1]}{' steals-free' if u[0] == '_wo_nosteals' else ''}, rank {k}]  {pay}"
              f"{'  (same game)' if sg else ''}")
        for l in slip:
            kind = "standard" if l["tier"] == "R" else ("goblin" if l["tier"].startswith("G") else "demon")
            side = "MORE" if l["side"] == "Over" else "LESS"
            print(f"   {l['player']:<24} {l['prop']:<12} {side:<4} {float(l['line']):>5.1f}  {kind:<8} x{float(l['factor']):.2f}"
                  f"   {games.get(l['event_id'], l['event_id'])}")

    print(f"PROPOSED portfolio on {DAY}: {N} slips, a leg in at most {LCAP} slips")
    for i, (u, k, slip) in enumerate(taken, 1):
        show(f"SLIP {i}", u, k, slip)
    print("\nBACKUPS (next in order, same leg cap):")
    for i, (u, k, slip) in enumerate(backups, 1):
        show(f"BACKUP {i}", u, k, slip)


if __name__ == "__main__":
    main()
